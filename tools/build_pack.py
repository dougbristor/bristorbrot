#!/usr/bin/env python3
"""build_pack.py — assemble a versioned public pack from CodeT blocks, plus insights' atoms or a viewer's glue.

    python3 tools/build_pack.py de_ray --steps 0-1 --version v1           # a story pack: atoms + their blocks
    python3 tools/build_pack.py --viewer brot_viewer --version v1          # a viewer pack: viewers/<name>/ glue + blocks
    python3 tools/build_pack.py --core                                     # core/: the reusable blocks in core.json
    add --dry-run to run every check and write nothing

Design: insights/DESIGN_render_export_20261002.md §6 (git compiles the pack; sites renders it).
Plan:   git/PLAN_pack_builder_git_ng_20261002.md

The pack is built in a temp folder and moved into packs/<story>/<version>/ only after every check passes, so
a failed build leaves nothing. An existing version is never overwritten.
"""
import argparse, datetime, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

GITNG = Path(__file__).resolve().parent.parent
ROOT = GITNG.parent                                   # bristorbrot_ai/
BLOCKS = ROOT / 'codetree' / 'blocks'
ATOMS_ROOT = ROOT / 'insights' / 'atoms'
LINT = ROOT / 'insights' / 'tools' / 'export_lint.py'

LICENCE = {'code': 'MIT', 'data': 'CC0-1.0', 'text': 'CC-BY-4.0',
           'attribution': 'Bristorbrot / Doug Bristor, bristorbrot.org', 'attribution_required': False}

# Block files that ship. Anything else in a block folder fails the build until someone decides about it.
# block.md is internal: its content is the planting Ledger, which §6 says to strip.
SHIP = re.compile(r'^(v\d+\.(js|mjs|py|glsl)|vectors\.json|conform(_\w+)?\.(py|mjs)|reference\.py|make_vectors\.py)$')
# Explicit additive B2 variant files, approved by Git/Caro 2026-10-04.
B2_SHIP = {'b2_v1.glsl', 'b2_reference.mjs', 'b2_vectors.mjs', 'b2_vectors.json', 'b2_conform.mjs', 'B2_PORTING.md'}
SKIP = re.compile(r'^(block\.md|__pycache__)$')

# Strings that must not reach a public pack. A hit fails the build unless it is listed in KNOWN_LEAKS.
LEAKS = [r'/home/', r'\baicolab\b', r'source_internal', r'\.relay/', r'^## Ledger']
# (pack-relative file, pattern) -> why it is tolerated for now. Each entry is a planter-side fix to chase.
KNOWN_LEAKS = {}


class BuildError(Exception):
    pass


def fail(msg):
    raise BuildError(msg)


# ---------------------------------------------------------------- reading the story

def front_matter(path):
    """Return (meta, raw_front_matter, body). Folded `key: >` values are joined into one line."""
    text = path.read_text()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
    if not m:
        fail(f'{path.name}: no front matter')
    raw, body = m.group(1), m.group(2)
    meta, key = {}, None
    for line in raw.split('\n'):
        if re.match(r'^[A-Za-z_]\w*:', line):
            key, _, val = line.partition(':')
            key, val = key.strip(), val.strip()
            meta[key] = '' if val in ('>', '|') else val
        elif key and line.startswith(' '):
            meta[key] = (meta[key] + ' ' + line.strip()).strip()
    return meta, raw, body


def flow_list(val):
    """'[a, b c, d]' -> ['a', 'b c', 'd']"""
    val = val.strip()
    if not (val.startswith('[') and val.endswith(']')):
        fail(f'expected a [list], got {val!r}')
    return [x.strip() for x in val[1:-1].split(',') if x.strip()]


def flow_map(val):
    """'{index: rank, slots4: [1, e1]}' -> {'index': 'rank', 'slots4': ['1', 'e1']}"""
    val = val.strip()
    if not (val.startswith('{') and val.endswith('}')):
        fail(f'expected a {{map}}, got {val!r}')
    out = {}
    for k, v in re.findall(r'(\w+)\s*:\s*(\[[^\]]*\]|[^,}]+)', val[1:-1]):
        out[k] = flow_list(v) if v.startswith('[') else v.strip()
    return out


def story_table(story_md):
    """Step table rows of STORY.md -> {step: (question, [atom ids])}. The atoms column is read up to its '—'."""
    steps = {}
    for line in story_md.read_text().split('\n'):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) < 4 or not cells[0].isdigit():
            continue
        atoms_cell = cells[2].split('—')[0]
        steps[int(cells[0])] = (cells[1], re.findall(r'\b[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\b', atoms_cell))
    if not steps:
        fail(f'{story_md}: no step table found')
    return steps


def parse_steps(spec):
    m = re.fullmatch(r'(\d+)(?:-(\d+))?', spec)
    if not m:
        fail(f'--steps: expected N or N-M, got {spec!r}')
    lo, hi = int(m.group(1)), int(m.group(2) or m.group(1))
    if hi < lo:
        fail(f'--steps: empty range {spec!r}')
    return list(range(lo, hi + 1))


# ---------------------------------------------------------------- checks that run in the built pack

def run(cmd, cwd, what):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=300)
    out = (p.stdout + p.stderr).strip()
    if p.returncode != 0:
        fail(f'{what}: exit {p.returncode}\n  $ {" ".join(map(str, cmd))}  (in {cwd})\n'
             + '\n'.join('  | ' + l for l in out.split('\n')[-25:]))
    return out


def verdict(out):
    """The summary lines a conformance run prints: '  square(z): 25 cases, ...' and the final PASS line."""
    keep = [l.strip() for l in out.split('\n') if re.match(r'\s+\w+\(.*\):', l) or re.search(r'\bPASS\b', l)]
    return keep


def conformance(block_dir, version):
    """Run each conformance script against the block's own faces (and its self-test, if it has one) in block_dir.

    conform.py / conform.mjs take the face as an argument when they read argv. conform_glsl.mjs defaults to the
    shipped GLSL face. reference.py, if present, recomputes vectors.json and must not drift."""
    py, node = sys.executable, shutil.which('node')
    names = {p.name for p in block_dir.iterdir()}
    results = []

    def record(face, script, label):
        if script not in names:
            return
        text = (block_dir / script).read_text()
        if script.endswith('.py'):
            cmd = [py, script] + ([face] if face in names and 'argv' in text else [])
        else:
            if not node:
                fail(f'{block_dir.name}: {script} needs node, and node is not on PATH')
            arg = face if script == 'conform_glsl.mjs' else './' + face
            cmd = [node, script] + ([arg] if face in names and 'argv' in text else [])
        out = run(cmd, block_dir, f'{block_dir.name} {label}')
        has_selftest = '--selftest' in text
        sout = run(cmd[:2] + ['--selftest'], block_dir, f'{block_dir.name} {label} self-test') if has_selftest else ''
        results.append({'face': face if face in names else None, 'script': script, 'result': 'PASS',
                        'summary': verdict(out),
                        'selftest': 'PASS (the check fails on every planted mistake)' if has_selftest else 'none',
                        'selftest_lines': [l.strip() for l in sout.split('\n') if l.strip().startswith('[')]})

    record(f'{version}.py', 'conform.py', 'Python conformance')
    record(f'{version}.js', 'conform.mjs', 'JavaScript conformance')
    record(f'{version}.glsl', 'conform_glsl.mjs', 'GLSL conformance (GPU, headless Chrome)')
    record('vectors.json', 'reference.py', 'reference drift check')
    if block_dir.name == 'brot_de_march' and 'b2_v1.glsl' in names:
        out = run([node, 'b2_conform.mjs'], block_dir, 'B2 variant conformance and four planted faults')
        results.append({'face': 'b2_v1.glsl', 'script': 'b2_conform.mjs', 'result': 'PASS',
                        'summary': verdict(out), 'selftest': 'PASS (four planted faults fail in the same run)'})
    faces = sorted(n for n in names if re.match(rf'^{version}\.', n))
    untested = [f for f in faces if f not in {r['face'] for r in results}]
    if untested:
        fail(f'{block_dir.name}: no conformance script covers {untested}; a face that cannot be checked does not ship')
    return results


def lint(atoms_dir):
    selftest = run([sys.executable, str(LINT), '--selftest'], LINT.parent, 'export_lint self-test')
    out = run([sys.executable, str(LINT), str(atoms_dir)], LINT.parent, 'export_lint on the built pack atoms')
    return {'tool': 'insights/tools/export_lint.py', 'result': 'clean', 'selftest': selftest.strip(),
            'output': out.strip().replace(str(atoms_dir), 'atoms')}


def leak_scan(pack):
    hits, known = [], []
    for f in sorted(pack.rglob('*')):
        if not f.is_file():
            continue
        rel = f.relative_to(pack).as_posix()
        try:
            text = f.read_text()
        except UnicodeDecodeError:
            continue
        for n, line in enumerate(text.split('\n'), 1):
            for p in LEAKS:
                if re.search(p, line):
                    (known if (rel, p) in KNOWN_LEAKS else hits).append((rel, n, p, line.strip()[:100]))
    if hits:
        fail('internal text in the pack:\n' + '\n'.join(f'  {r}:{n} [{p}] {l}' for r, n, p, l in hits))
    used = {(r, p) for r, _, p, _ in known}
    stale = [k for k in KNOWN_LEAKS if k not in used and (pack / k[0]).exists()]
    if stale:
        fail(f'KNOWN_LEAKS entries no longer hit; remove them so the list stays honest: {stale}')
    notes = {(r, KNOWN_LEAKS[(r, p)]) for r, p in used}
    return [{'file': r, 'note': n} for r, n in sorted(notes)]


def copy_blocks(tmp, blocks):
    """Copy each block (current face version, files unchanged) into tmp/code/<id>/, then run every block's
    conformance in the copy. A block's `requires:` must also be in the pack: its checks read the sibling folder."""
    records = []
    for b in blocks:
        src = BLOCKS / b
        if not (src / 'block.md').exists():
            fail(f'no block at codetree/blocks/{b}/')
        for r in flow_list(front_matter(src / 'block.md')[0].get('requires', '[]')):
            if r not in blocks:
                fail(f'block {b} requires {r}, which is not in the pack')
        vers = sorted({m.group(1) for p in src.iterdir() if (m := re.match(r'^(v\d+)\.', p.name))},
                      key=lambda v: int(v[1:]))
        if not vers:
            fail(f'block {b} has no vN.* face')
        bver = vers[-1]
        dst = tmp / 'code' / b
        dst.mkdir(parents=True)
        files = []
        for p in sorted(src.iterdir()):
            if SKIP.match(p.name):
                continue
            if (not SHIP.match(p.name) and not (b == 'brot_de_march' and p.name in B2_SHIP)) or not p.is_file():
                fail(f'block {b}: unclassified file {p.name!r}. Add it to SHIP or SKIP in build_pack.py')
            if re.match(r'^v\d+\.', p.name) and not p.name.startswith(bver + '.'):
                continue                     # older faces stay in codetree; the pack ships the current one
            shutil.copy2(p, dst / p.name)
            files.append({'path': f'code/{b}/{p.name}', 'sha256': sha256(p)})
        records.append({'id': b, 'version': bver, 'files': files})
    for rec in records:                          # after all copies, so cross-block checks find their siblings
        rec['conformance'] = conformance(tmp / 'code' / rec['id'], rec['version'])
    for leftover in list(tmp.rglob('__pycache__')):
        shutil.rmtree(leftover)
    return records


# Relative paths the web runtime loads: import/from specifiers, src/href attributes, and quoted asset paths.
SPECIFIER = re.compile(r"""(?:from\s+|import\s*\(\s*|(?:src|href)\s*=\s*)['"]([^'"]+)['"]|['"]([\w./-]+\.(?:js|mjs|glsl|json))['"]""")


def import_scan(pack):
    """Every relative path a .js/.mjs/.html file loads must resolve to a file inside the pack. Absolute paths
    (/codetree/..., http...) fail. Node built-ins, data: URLs and bare package names (playwright) are not ecosystem paths."""
    bad = []
    for f in sorted(pack.rglob('*')):
        if f.suffix not in ('.js', '.mjs', '.html'):
            continue
        for m in SPECIFIER.finditer(f.read_text()):
            spec = m.group(1) or m.group(2)
            if spec.startswith(('node:', 'data:')) or (re.match(r'^[a-z@][\w@/-]*$', spec) and '.' not in spec):
                continue                                         # node built-in or bare package name
            if spec.startswith(('/', 'http:', 'https:')):
                bad.append(f'{f.relative_to(pack)}: absolute path {spec!r}')
                continue
            target = (f.parent / spec).resolve()
            if pack.resolve() not in target.parents or not target.exists():
                bad.append(f'{f.relative_to(pack)}: {spec!r} does not resolve inside the pack')
    if bad:
        fail('the pack is not standalone:\n' + '\n'.join('  ' + b for b in bad))


def page_check(pack, faults):
    """Run the page's own check() headless, as shipped (must PASS) and once per fault switch (each must FAIL)."""
    if not faults:
        fail('viewer.json lists no faults: a page check with no fault switch cannot show it can fire')
    out = run([shutil.which('node') or 'node', str(GITNG / 'tools' / 'check_viewer.mjs'), str(pack), ','.join(faults)],
              GITNG, 'viewer page check')
    r = json.loads(out.strip().split('\n')[-1])
    if r['errors']:
        fail('page errors:\n' + '\n'.join('  ' + e for e in r['errors']))
    if not r['shipped']['ok']:
        fail('check() fails as shipped:\n' + '\n'.join('  ' + l for l in r['shipped']['lines']))
    for name in faults:
        if r['faults'].get(name, {'ok': True})['ok']:
            fail(f'check() still passes with ?fault={name}, so it cannot fire:\n'
                 + '\n'.join('  ' + l for l in r['faults'].get(name, {}).get('lines', [])))
    return r


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------- the build

def build(story, steps, version, dry_run=False):
    atoms_dir = ATOMS_ROOT / story
    story_md = atoms_dir / 'STORY.md'
    if not story_md.exists():
        fail(f'no story at {story_md}')
    story_meta, _, _ = front_matter(story_md)
    table = story_table(story_md)
    missing_steps = [s for s in steps if s not in table]
    if missing_steps:
        fail(f'STORY.md has no step(s) {missing_steps}')

    # every atom file, keyed by id
    atoms = {}
    for f in sorted(atoms_dir.glob('*.md')):
        if f.name in ('STORY.md', 'PORTING.md'):
            continue
        meta, raw, body = front_matter(f)
        if meta.get('id') != f.stem:
            fail(f'{f.name}: id {meta.get("id")!r} does not match its file name')
        atoms[f.stem] = (f, meta, raw, body)

    # control 1: the step table and the atoms' own step fields must agree
    chosen = []
    for s in steps:
        listed = table[s][1]
        claimed = sorted(i for i, (_, m, _, _) in atoms.items() if m.get('step') == str(s))
        unknown = [i for i in listed if i not in atoms]
        if unknown:
            fail(f'STORY.md step {s} lists atoms with no file: {unknown}')
        if sorted(listed) != claimed:
            fail(f'step {s}: STORY.md lists {sorted(listed)}, atoms claim {claimed}')
        chosen += listed

    # control 2: dependency closure, and code dependencies resolve to a block
    blocks = []
    for i in chosen:
        for d in flow_list(atoms[i][1].get('depends', '[]')):
            if d.startswith('code.'):
                b = d[len('code.'):]
                if not (BLOCKS / b / 'block.md').exists():
                    fail(f'{i} depends on {d}, and there is no block at codetree/blocks/{b}/')
                if b not in blocks:
                    blocks.append(b)
            elif d not in chosen:
                fail(f'{i} depends on {d}, which is outside steps {steps[0]}-{steps[-1]}; widen --steps')

    # control 3: one conventions stamp across the pack
    conventions = {}
    for i in chosen:
        for k, v in flow_map(atoms[i][1].get('conventions', '{}')).items():
            if k in conventions and conventions[k] != v:
                fail(f'{i}: conventions.{k} = {v!r}, other atoms in the pack say {conventions[k]!r}')
            conventions[k] = v
    for k in ('index', 'roll'):
        if k not in conventions:
            fail(f'no atom in the pack states conventions.{k}')

    out = GITNG / 'packs' / story / version
    if out.exists() and not dry_run:
        fail(f'{out.relative_to(GITNG)} already exists. A built version is frozen; use a new --version')

    # temp folder beside the destination, so the final rename never crosses a filesystem
    (GITNG / 'packs').mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f'.tmp-{story}-{version}-', dir=GITNG / 'packs'))
    try:
        # atoms, with source_internal (and any folded continuation lines) removed from the front matter
        (tmp / 'atoms').mkdir()
        for i in chosen:
            f, meta, raw, body = atoms[i]
            kept, dropping = [], False
            for line in raw.split('\n'):
                if line.startswith('source_internal:'):
                    dropping = True
                    continue
                if dropping and line.startswith(' '):
                    continue
                dropping = False
                kept.append(line)
            (tmp / 'atoms' / f.name).write_text('---\n' + '\n'.join(kept) + '\n---\n' + body)

        block_records = copy_blocks(tmp, blocks)

        lint_record = lint(tmp / 'atoms')
        notes = leak_scan(tmp)

        credits = []
        for i in chosen:
            for c in flow_list(atoms[i][1].get('credit', '[]')):
                if c not in credits:
                    credits.append(c)

        manifest = {
            'story': story,
            'title': story_meta.get('title', ''),
            'version': version,
            'as_of': story_meta.get('as_of', ''),
            'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'steps': [{'step': s, 'question': table[s][0], 'atoms': table[s][1]} for s in steps],
            'atoms': [{'id': i, 'step': int(atoms[i][1]['step']), 'kind': atoms[i][1].get('kind', ''),
                       'title': atoms[i][1].get('title', ''), 'status': atoms[i][1].get('status', ''),
                       'path': f'atoms/{i}.md', 'sha256': sha256(tmp / 'atoms' / f'{i}.md')} for i in chosen],
            'blocks': block_records,
            'conventions': conventions,
            'licence': LICENCE,
            'credits': credits,
            'checks': {'export_lint': lint_record},
            'notes': notes,
            'not_included': {
                'block.md': 'internal planting record (the Ledger); the atoms are the public description',
                'PORTING.md': 'covers the whole story (steps 0-8); ships with a pack that covers every step',
            },
        }
        (tmp / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

        if dry_run:
            return manifest, None
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp.rename(out)
        return manifest, out
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)


def build_viewer(name, version, dry_run=False):
    """A viewer pack: the glue files listed in viewers/<name>/viewer.json, plus its blocks, checked as one page."""
    src = GITNG / 'viewers' / name
    if not (src / 'viewer.json').exists():
        fail(f'no viewer at viewers/{name}/viewer.json')
    spec = json.loads((src / 'viewer.json').read_text())
    out = GITNG / 'packs' / name / version
    if out.exists() and not dry_run:
        fail(f'{out.relative_to(GITNG)} already exists. A built version is frozen; use a new --version')
    (GITNG / 'packs').mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f'.tmp-{name}-{version}-', dir=GITNG / 'packs'))
    try:
        glue = []
        for g in spec['glue']:
            if not (src / g).is_file():
                fail(f'viewer.json lists glue file {g}, which does not exist')
            shutil.copy2(src / g, tmp / g)
            glue.append({'path': g, 'sha256': sha256(src / g), 'lines': len((src / g).read_text().splitlines())})
        block_records = copy_blocks(tmp, spec['blocks'])
        import_scan(tmp)
        notes = leak_scan(tmp)
        page = page_check(tmp, spec.get('faults', []))
        manifest = {
            'viewer': name, 'title': spec['title'], 'version': version,
            'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'glue': glue, 'blocks': block_records, 'licence': LICENCE, 'credits': spec.get('credits', []),
            'checks': {'standalone': 'every relative import resolves inside the pack',
                       'page': {'shipped': page['shipped']['lines'],
                                'faults': {k: v['lines'] for k, v in page['faults'].items()}}},
            'notes': notes,
        }
        (tmp / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
        if dry_run:
            return manifest, None
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp.rename(out)
        return manifest, out
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)


def core_readme(spec, records):
    """core/README.md: one row per block, and the command that checks each face in place."""
    what = {b['id']: b['what'] for b in spec['blocks']}
    lines = ['# core', '', spec['intro'], '',
             '| block | what it is | needs | faces |', '|---|---|---|---|']
    for r in records:
        needs = flow_list(front_matter(BLOCKS / r['id'] / 'block.md')[0].get('requires', '[]'))
        faces = sorted(f['path'].rsplit('/', 1)[1] for f in r['files'] if re.match(r'^code/[^/]+/v\d+\.', f['path']))
        lines.append(f"| `{r['id']}` | {what[r['id']]} | {', '.join(needs) or '—'} | {', '.join(faces)} |")
    lines += ['', '## Checking a block', '',
              'Each folder carries its test vectors and the scripts that check every face against them.',
              'Run them from inside the block folder:', '', '```']
    for r in records:
        for c in r['conformance']:
            face = c['face'] if c['face'] and c['script'].startswith('conform') else ''
            arg = ('./' + face) if face and c['script'].endswith('.mjs') and c['script'] != 'conform_glsl.mjs' else face
            runner = 'python3' if c['script'].endswith('.py') else 'node'
            lines.append(f"cd core/{r['id']} && {runner} {c['script']} {arg}".rstrip())
    lines += ['```', '', '`conform_glsl.mjs` needs a headless Chrome with WebGL2 (playwright).', '',
              'This folder is generated by `python3 tools/build_pack.py --core` from the CodeT blocks. Edit the',
              'blocks, not these copies: the next build replaces them.', '']
    return '\n'.join(lines)


def build_core(dry_run=False):
    """core/: the reusable blocks, as one current library for other developers. Same copy and checks as a
    pack, but rebuilt in place on every run: git history is its version record, where a pack is frozen."""
    spec = json.loads((GITNG / 'core.json').read_text())
    blocks = [b['id'] for b in spec['blocks']]
    for v in sorted((GITNG / 'viewers').glob('*/viewer.json')):
        extra = [b for b in json.loads(v.read_text())['blocks'] if b not in blocks]
        if extra:
            fail(f'viewer {v.parent.name} uses {extra}, which core.json does not list')
    tmp = Path(tempfile.mkdtemp(prefix='.tmp-core-', dir=GITNG))
    try:
        records = copy_blocks(tmp, blocks)
        lib = tmp / 'code'
        manifest = {'core': spec['title'],
                    'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'blocks': [dict(r, files=[dict(f, path=f['path'][len('code/'):]) for f in r['files']])
                               for r in records],
                    'licence': LICENCE}
        (lib / 'README.md').write_text(core_readme(spec, records))
        manifest['notes'] = leak_scan(lib)
        (lib / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
        if dry_run:
            return manifest, None
        out = GITNG / 'core'
        old = GITNG / '.tmp-core-old' if out.exists() else None
        if old:
            if old.exists():
                shutil.rmtree(old)
            out.rename(old)
        lib.rename(out)
        if old:
            shutil.rmtree(old)
        return manifest, out
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('story', nargs='?')
    ap.add_argument('--steps', help='story packs: N or N-M, e.g. 0-1')
    ap.add_argument('--viewer', help='viewer packs: the folder name under viewers/')
    ap.add_argument('--core', action='store_true', help='rebuild core/, the reusable blocks listed in core.json')
    ap.add_argument('--version', help='pack version folder, e.g. v1 (packs only)')
    ap.add_argument('--dry-run', action='store_true', help='run every check, write nothing')
    a = ap.parse_args()
    if a.core:
        if a.story or a.viewer or a.version:
            sys.exit('build_pack: --core takes no story, viewer or version')
        try:
            m, out = build_core(a.dry_run)
        except BuildError as e:
            sys.exit(f'build_pack: FAILED — {e}')
        n_conf = sum(len(b['conformance']) for b in m['blocks'])
        print(f"core: {len(m['blocks'])} block(s), {n_conf} conformance runs PASS, {len(m['notes'])} known note(s)")
        print('dry run: nothing written' if out is None else f'wrote {out.relative_to(GITNG)}')
        return
    if not a.version or not re.fullmatch(r'v\d+', a.version):
        sys.exit(f'build_pack: --version must look like v1, got {a.version!r}')
    if bool(a.viewer) == bool(a.story):
        sys.exit('build_pack: give either a story (with --steps) or --viewer NAME')
    try:
        if a.viewer:
            m, out = build_viewer(a.viewer, a.version, a.dry_run)
        else:
            if not a.steps:
                sys.exit('build_pack: a story pack needs --steps')
            m, out = build(a.story, parse_steps(a.steps), a.version, a.dry_run)
    except BuildError as e:
        sys.exit(f'build_pack: FAILED — {e}')
    n_conf = sum(len(b['conformance']) for b in m['blocks'])
    head = m.get('story') or m.get('viewer')
    extra = f"{len(m['atoms'])} atoms, lint clean" if 'atoms' in m else f"{len(m['glue'])} glue files, page check PASS + every fault FAIL"
    print(f"{head} {m['version']}: {len(m['blocks'])} block(s), {n_conf} conformance runs PASS, {extra}, "
          f"{len(m['notes'])} known note(s)")
    print('dry run: nothing written' if out is None else f'wrote {out.relative_to(GITNG)}')


if __name__ == '__main__':
    main()
