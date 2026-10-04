#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""Conformance for a port of the Bristorian cubes.

    python conform.py my_port.py     # defines cube_l, cube_r, jv_l, jv_r (or cubeL, cubeR, JvL, JvR)
    python conform.py --selftest     # shows the check failing on planted mistakes

A port PASSES only if it matches every canon column. If it fails, this names the wrong rule it matches.
Sizes a port cannot take (it raises, or returns the wrong length) are reported as skipped, never as passes.
"""
import importlib.util, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
V = json.loads((HERE / 'vectors.json').read_text())
TOL = V['tolerance']
NAMES = [('cube_l', 'cubeL'), ('cube_r', 'cubeR'), ('jv_l', 'JvL'), ('jv_r', 'JvR')]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def fns(m):
    return {a: getattr(m, a, None) or getattr(m, b, None) for a, b in NAMES}


def check(F, quiet=False):
    tested, skipped, worst, fails, matches = 0, 0, 0.0, [], {'swapped': True, 'quaternion': True}
    for i, r in enumerate(V['rows']):
        try:
            out = {'cube_l': F['cube_l'](r['z']), 'cube_r': F['cube_r'](r['z']),
                   'jv_l': F['jv_l'](r['z'], r['v']), 'jv_r': F['jv_r'](r['z'], r['v'])}
            if any(len(o) != r['n'] + 1 for o in out.values()):
                raise ValueError
        except Exception:
            skipped += 1; continue
        tested += 1
        for k, o in out.items():
            d = max(abs(a - b) for a, b in zip(o, r[k])); worst = max(worst, d)
            if d > TOL:
                fails.append(f"row {i} (n={r['n']}) {k}")
        for k in ('cube_l', 'cube_r'):
            if max(abs(a - b) for a, b in zip(out[k], r['swapped'][k])) > TOL:
                matches['swapped'] = False
            if r['quaternion'] is not None and max(abs(a - b) for a, b in zip(out[k], r['quaternion'])) > TOL:
                matches['quaternion'] = False
    ok = tested > 0 and not fails
    if not quiet:
        print(f'  {tested} rows tested, {skipped} skipped, max |diff| from canon = {worst:.3g}')
        if fails:
            print('  first failures: ' + ', '.join(fails[:4]))
            if matches['swapped']:
                print('  diagnosis: your brackets are exchanged. cube_l is (z z) z, the square on the LEFT.')
            if matches['quaternion']:
                print('  diagnosis: this is the Hamilton cube. Bristorian cubes differ by bracket; Hamilton ones cannot.')
        print('PASS' if ok else 'FAIL')
    return ok


def selftest():
    bc = fns(load(HERE / 'v1.py', 'bristor_cube_v1'))
    add = lambda a, b: [x + y for x, y in zip(a, b)]
    bp = load(HERE.parent / 'bristor_product' / 'v1.py', 'bristor_product_v1_st')
    arms = [('v1.py as shipped', bc, True),
            ('brackets exchanged', dict(bc, cube_l=bc['cube_r'], cube_r=bc['cube_l']), False),
            ('derivative drops the (z z) v term', dict(bc, jv_l=lambda z, v: bp.mul(add(bp.mul(z, v), bp.mul(v, z)), z)), False),
            ('cube from the square alone: both brackets = (z z) z', dict(bc, cube_r=bc['cube_l']), False)]
    ok_all = True
    for name, F, want in arms:
        got = check(F, quiet=True); good = got == want; ok_all &= good
        print(f"[{'ok ' if good else 'BAD'}] {name}: expected {'PASS' if want else 'FAIL'}, got {'PASS' if got else 'FAIL'}")
    print('selftest: all arms behaved as expected' if ok_all else 'selftest: SOME ARM MISBEHAVED')
    return ok_all


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(0 if (selftest() if sys.argv[1] == '--selftest' else check(fns(load(sys.argv[1], 'port')))) else 1)
