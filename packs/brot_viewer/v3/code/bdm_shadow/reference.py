#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""CPU reference for bdm_shadow v1.glsl and v1.js: the same algorithm in double precision.

The surface points come from brot_de_march's own reference (its march, normal and DE, loaded from the sibling
folder), so the shadow is checked on the surface the marcher actually finds. Five maps: square (b_brot), cube_l and
cube_r (chi_brot), qsquare and qcube (the quaternion sets). Only well-conditioned cases are kept: each is rerun
from a point moved 1e-6 across the surface and with float32 inputs, and must end the same way with the same value.

    python3 reference.py            check vectors.json against this reference (drift check)
    python3 reference.py --write    regenerate vectors.json
"""
import importlib.util, json, math, random, struct, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('brot_de_march_reference', HERE.parent / 'brot_de_march' / 'reference.py')
bdm = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(bdm)
add, dot = bdm.add, bdm.dot


def f32(x):
    r = lambda a: struct.unpack('f', struct.pack('f', a))[0]
    return [r(a) for a in x] if isinstance(x, list) else r(x)


def normalize(v):
    L = math.sqrt(dot(v, v))
    return [x / L for x in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def smoothstep(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- the JS face (v1.js)

def light_dir(az, el):
    return [math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)]


def threshold(size, th0=0.3):
    return th0 * (0.08 / size) ** 0.75


def halton(i, b):
    f, r = 1.0, 0.0
    while i > 0:
        f /= b; r += f * (i % b); i //= b
    return r


def disk(i):
    r, a = math.sqrt(halton(i, 5)), 2 * math.pi * halton(i, 7)
    return [r * math.cos(a), r * math.sin(a)]


# ---------------------------------------------------------------- the GLSL face (v1.glsl)

def shadow(p, n, epsc, S, L, O):
    """Returns (light, end, last): light 1 lit .. 0 dark; end 0 escaped, 1 hit, 2 ran out; last = d / (t tan)."""
    ld = L['dir']
    if L['hard']:
        a = normalize(cross(ld, [0.0, 1.0, 0.0] if abs(ld[1]) < 0.9 else [1.0, 0.0, 0.0])); b = cross(ld, a)
        ld = normalize(add(ld, add([x * L['disk'][0] for x in a], b, L['disk'][1]), L['tanR']))
    org = add(p, n, O['bias'] * epsc)
    res, t, end, last = 1.0, O['bias'] * epsc, 2, 1e3
    for _ in range(256 if L['hard'] else O['steps']):
        q = add(org, ld, t)
        if dot(q, q) > O['bound'] ** 2 and dot(q, ld) > 0:
            end = 0
            break
        d = bdm.de(q, ld, S)[1]
        last = d / (t * L['tanR'])
        if d < O['hitEps']:
            return 0.0, 1, last
        res = min(res, last)
        t += max(d, 0.5 * epsc)
    if L['hard']:
        return 1.0, end, last
    if O['est'] == 1:
        if end == 0:
            return 1.0, end, last
        w = O['th'] * O['soft']
        return (smoothstep(O['th'] - w, O['th'] + w, last) if w > 0 else (0.0 if last < O['th'] else 1.0)), end, last
    return min(max(res, 0.0), 1.0), end, last


# ---------------------------------------------------------------- vectors

CAMS = {'square': [-0.7, -0.35, 0.05, 0.0], 'cube_l': [0.15, 0.4, 0.05, 0.0], 'cube_r': [0.15, 0.4, 0.05, 0.0],
        'qsquare': [-0.2, 0.65, 0.0, 0.0], 'qcube': [0.35, 0.62, 0.0, 0.0]}
MARCH = dict(maxSteps=1400, bound=4.0, safety=0.4, adaptive=True, hitEps=4.8e-4, lod=0.08, lens=1.5, resY=550.0, leash=8.0)


def surface_point(rng, mp):
    """A camera ray onto the Julia set of map mp (iters 24), and where it lands: (S, p, n, epsc) or None."""
    S = dict(map=mp, beta=0.47, theta=rng.choice([0.0, 0.6]), w=0.0, axis=False, julia=True, jc=CAMS[mp], iters=24)
    az, el = rng.uniform(0, 2 * math.pi), rng.uniform(-0.6, 0.9)
    ro = [3.0 * math.cos(el) * math.sin(az), 3.0 * math.sin(el), -3.0 * math.cos(el) * math.cos(az)]
    rd = normalize(add([-x / 3.0 for x in ro], [rng.uniform(-0.12, 0.12) for _ in range(3)]))
    hit, t, steps = bdm.march(ro, rd, S, MARCH)
    if not hit or steps >= MARCH['maxSteps']:
        return None
    p = add(ro, rd, t)
    n = bdm.normal(p, S)
    if dot(n, n) < 0.5 or dot(n, rd) > -0.05:
        return None
    return S, p, n, max(MARCH['hitEps'], MARCH['lod'] * t / (MARCH['lens'] * MARCH['resY']))


def stable(p, n, epsc, S, L, O, got):
    """Same end and nearly the same light from a point moved 1e-6 along the surface, and with float32 inputs."""
    u = normalize(cross(n, [0.0, 1.0, 0.0] if abs(n[1]) < 0.9 else [1.0, 0.0, 0.0]))
    for p2, n2, L2 in ((add(p, u, 1e-6), n, L), (f32(p), f32(n), dict(L, dir=f32(L['dir'])))):
        v, e, last = shadow(p2, n2, epsc, S, L2, O)
        if e != got[1] or abs(v - got[0]) > 0.01 or (e == 2 and abs(last - got[2]) > 0.01 * max(abs(got[2]), 1.0)):
            return False
    return True


def generate():
    rng = random.Random(20261004)
    out = {'about': 'bdm_shadow v1 vectors, double precision, from reference.py (maps: square, cube_l, cube_r, qsquare, qcube)',
           'tol': {'light': 0.03, 'last_rel': 0.02, 'js': 1e-12}, 'shadow': [], 'js': {}}
    modes = [('live last-step', dict(est=1, steps=32, soft=0.5), False), ('live hard threshold', dict(est=1, steps=32, soft=0.0), False),
             ('live IQ', dict(est=0, steps=16, soft=0.5), False), ('refine sample', dict(est=1, steps=32, soft=0.5), True)]
    for mp in CAMS:
        got, tries, ends = 0, 0, {0: 0, 1: 0, 2: 0}
        while got < 32 and tries < 8000:
            tries += 1
            sp = surface_point(rng, mp)
            if sp is None:
                continue
            S, p, n, epsc = sp
            name, o, hard = modes[got % 4]
            size = rng.choice([0.03, 0.08, 0.2])
            for _ in range(20):
                ld = light_dir(rng.uniform(-math.pi, math.pi), rng.uniform(-0.2, 1.4))
                if dot(ld, n) > 0.15:
                    break
            else:
                continue
            L = dict(dir=ld, tanR=math.tan(size), hard=hard, disk=disk(rng.randrange(1, 64)) if hard else [0.0, 0.0])
            O = dict(steps=o['steps'], bias=8.0, est=o['est'], th=threshold(size), soft=o['soft'], hitEps=MARCH['hitEps'], bound=4.0)
            r = shadow(p, n, epsc, S, L, O)
            if ends[r[1]] >= (6 if r[1] == 0 else 16) or not stable(p, n, epsc, S, L, O, r):      # keep every ending represented
                continue
            ends[r[1]] += 1
            out['shadow'].append({'mode': name, 'p': p, 'n': n, 'epsc': epsc, 'set': S, 'light': L, 'opts': O,
                                  'value': r[0], 'end': r[1], 'last': r[2]})
            got += 1
    out['js'] = {'lightDir': [[az, el, light_dir(az, el)] for az, el in [(-2.303611, 0.839692), (0.0, 0.0), (1.2, -0.3), (3.0, 1.5)]],
                 'threshold': [[s, threshold(s)] for s in [0.03, 0.08, 0.2, 0.3]],
                 'halton': [[i, b, halton(i, b)] for i in [0, 1, 2, 7, 63, 1000] for b in [2, 3, 5, 7]],
                 'disk': [[i, disk(i)] for i in [0, 1, 2, 3, 17, 63]]}
    return out


def check(V):
    bad, worst = [], 0.0
    for i, r in enumerate(V['shadow']):
        v, e, last = shadow(r['p'], r['n'], r['epsc'], r['set'], r['light'], r['opts'])
        worst = max(worst, abs(v - r['value']))
        if e != r['end'] or abs(v - r['value']) > 1e-9 or abs(last - r['last']) > 1e-9 * max(abs(last), 1.0):
            bad.append(f'shadow[{i}]')
    J = V['js']
    if any(max(abs(a - b) for a, b in zip(light_dir(az, el), d)) > 1e-15 for az, el, d in J['lightDir']):
        bad.append('lightDir')
    if any(abs(threshold(s) - th) > 1e-15 for s, th in J['threshold']):
        bad.append('threshold')
    if any(abs(halton(i, b) - h) > 1e-15 for i, b, h in J['halton']):
        bad.append('halton')
    if any(max(abs(a - b) for a, b in zip(disk(i), d)) > 1e-15 for i, d in J['disk']):
        bad.append('disk')
    return worst, bad


if __name__ == '__main__':
    path = HERE / 'vectors.json'
    if sys.argv[1:] == ['--write']:
        V = generate()
        path.write_text(json.dumps(V, indent=1) + '\n')
        for mp in CAMS:
            rows = [r for r in V['shadow'] if r['set']['map'] == mp]
            print(f"{mp}: {len(rows)} cases; ends escaped/hit/ran out = "
                  f"{sum(r['end'] == 0 for r in rows)}/{sum(r['end'] == 1 for r in rows)}/{sum(r['end'] == 2 for r in rows)}; "
                  f"modes {sorted({r['mode'] for r in rows})}")
        sys.exit(0)
    V = json.loads(path.read_text())
    worst, bad = check(V)
    print(f"  reference vs vectors.json: {len(V['shadow'])} shadow cases + JS face tables, max drift {worst:.1e}")
    print('PASS' if not bad else 'FAIL ' + ', '.join(bad[:10]))
    sys.exit(0 if not bad else 1)
