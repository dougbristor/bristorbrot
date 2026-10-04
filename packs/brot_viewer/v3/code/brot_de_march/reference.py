#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""CPU reference for brot_de_march v1.glsl: the same algorithm in double precision.

    python reference.py            recompute every case in vectors.json and compare (exit 1 on drift)
    python reference.py --write    regenerate vectors.json

Maps (from the sibling block folders): 'square' = bristor_product B3 square (b_brot), 'cube_l' / 'cube_r' =
bristor_cube (z z) z and z (z z) (chi_brot), 'qsquare' = quaternion_product square (q_m, q_j), 'qcube' = (q q) q on quaternion_product. Only well-conditioned cases are kept: each case is rerun with
float32 rounding at every step, and dropped unless float32 agrees with float64 to 2e-4 (DE) and 2e-3
(normal), ten times inside the GPU tolerance.
"""
import importlib.util, json, math, random, struct, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(block, name):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / block / 'v1.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


bp, bc = _load('bristor_product', 'bristor_product_v1'), _load('bristor_cube', 'bristor_cube_v1')
qp = _load('quaternion_product', 'quaternion_product_v1')
MAPS = {
    'square': (bp.square, lambda z, v: [a + b for a, b in zip(bp.mul(z, v), bp.mul(v, z))], 2.0),
    'cube_l': (bc.cube_l, bc.jv_l, 3.0),
    'cube_r': (bc.cube_r, bc.jv_r, 3.0),
    'qsquare': (qp.square, qp.jv, 2.0),
    'qcube': (lambda z: qp.mul(qp.square(z), z),                 # Hamilton is associative: one bracket
              lambda z, v: [a + b for a, b in zip(qp.mul(qp.jv(z, v), z), qp.mul(qp.square(z), v))], 3.0),
}
BAIL2 = 64.0


def f64(x):
    return x


def f32(x):
    """Round to float32: used only to drop cases a float32 shader cannot hold."""
    r = lambda a: struct.unpack('f', struct.pack('f', a))[0]
    return [r(a) for a in x] if isinstance(x, list) else r(x)


def add(a, b, k=1.0):
    return [x + k * y for x, y in zip(a, b)]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def seed(p, S, w):
    sb, cb, st, ct = math.sin(S['beta']), math.cos(S['beta']), math.sin(S['theta']), math.cos(S['theta'])
    q = [p[0], ct * p[1] - st * p[2], st * p[1] + ct * p[2]]
    if S['axis']:
        return q + [w]
    return [q[0], sb * q[1] + cb * w, cb * q[1] - sb * w, q[2]]


def de(p, rd, S, q=f64):
    f, df, P = MAPS[S['map']]
    z = q(seed(p, S, S['w'])); v = q(seed(rd, S, 0.0))
    c = S['jc'] if S['julia'] else z[:]
    dc = [0.0] * 4 if S['julia'] else v[:]
    kk = 0.0 if S['julia'] else 1.0
    dr, w, r2, n = 1.0, 1.0, dot(z, z), 0
    for i in range(S['iters']):
        if r2 > BAIL2:
            break
        r = math.sqrt(r2)
        dr = q(P * r ** (P - 1) * dr + kk * w)
        v = q(add(q(df(z, v)), dc, w))
        m = max(dr, math.sqrt(dot(v, v)))
        if m > 1e10:
            dr /= m; v = [x / m for x in v]; w /= m
        z = q(add(q(f(z)), c))
        r2 = q(dot(z, z)); n = i + 1
    if r2 <= BAIL2:
        return 0.0, 0.0, 1.0, n
    r = math.sqrt(r2)
    tone = min(max((n - math.log(max(math.log(r) / math.log(8.0), 1e-30)) / math.log(P)) / S['iters'], 0.0), 1.0)
    num = 0.5 * math.log(r) * r * w
    return num / max(math.sqrt(dot(v, v)), 1e-30), num / max(dr, 1e-30), tone, n


def normal(p, S, q=f64):
    f, df, _ = MAPS[S['map']]
    z = q(seed(p, S, S['w']))
    sx, sy, sz = (seed(e, S, 0.0) for e in ([1, 0, 0], [0, 1, 0], [0, 0, 1]))
    c = S['jc'] if S['julia'] else z[:]
    kk, w = (0.0 if S['julia'] else 1.0), 1.0
    mx, my, mz = sx[:], sy[:], sz[:]
    for _ in range(S['iters']):
        if dot(z, z) > BAIL2:
            break
        mx = q(add(q(df(z, mx)), sx, kk * w)); my = q(add(q(df(z, my)), sy, kk * w)); mz = q(add(q(df(z, mz)), sz, kk * w))
        m = max(math.sqrt(dot(u, u)) for u in (mx, my, mz))
        if m > 1e10:
            mx, my, mz = ([x / m for x in u] for u in (mx, my, mz)); w /= m
        z = q(add(q(f(z)), c))
    g = [dot(z, mx), dot(z, my), dot(z, mz)]
    L = math.sqrt(dot(g, g))
    return [x / L for x in g] if L > 1e-15 else [0.0, 0.0, 0.0]


def march(ro, rd, S, M):
    b = dot(ro, rd); disc = b * b - dot(ro, ro) + M['bound'] ** 2
    if disc < 0:
        return False, 0.0, 0
    t, t_end, prev, steps = max(-b - math.sqrt(disc), 0.0), -b + math.sqrt(disc), 1e20, 0
    for i in range(M['maxSteps']):
        if t > t_end:
            break
        steps = i + 1
        dd, ds, _, _ = de(add(ro, rd, t), rd, S)
        eps = max(M['hitEps'], M['lod'] * t / (M['lens'] * M['resY']))
        if ds < eps:
            return True, t, steps
        safety = min(M['safety'], 0.15) if (M['adaptive'] and ds < prev * 0.5) else M['safety']
        prev = ds
        step = min(dd, ds * M['leash']) if M['leash'] > 0 else ds
        t += max(step * safety, eps * 0.05)
    return False, t, steps


# ---------------------------------------------------------------- vectors

JC = {'square': [[-0.4, 0.3, 0.2, 0.1], [0.28, -0.55, 0.12, 0.0]],
      'cube_l': [[0.15, 0.4, 0.05, 0.0], [0.15, 0.4, 0.05, 0.25]],     # caro's default C, and C with k
      'cube_r': [[0.15, 0.4, 0.05, 0.0], [-0.3, 0.2, 0.35, 0.1]],
      'qsquare': [[-0.2, 0.65, 0.0, 0.0], [-0.291, -0.399, 0.339, 0.437]],
      'qcube': [[0.35, 0.62, 0.0, 0.0], [-0.2, 0.4, 0.3, 0.2]]}
MARCH = dict(maxSteps=1400, bound=4.0, safety=0.4, adaptive=True, hitEps=4.8e-4, lod=0.08, lens=1.381,
             resY=550.0, leash=8.0)


def unit(rng):
    while True:
        u = [rng.uniform(-1, 1) for _ in range(3)]
        L = math.sqrt(dot(u, u))
        if 0.2 < L <= 1:
            return [x / L for x in u]


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-12)


def generate():
    rng = random.Random(20261003)
    out = {'about': 'brot_de_march v1 vectors, double precision, from reference.py (maps: square, cube_l, cube_r, qsquare, qcube)',
           'tol': {'de_rel': 2e-3, 'normal': 2e-2, 'march_t': 2e-3, 'march_steps': 3}, 'de': [], 'march': []}
    for mp in MAPS:
        got, tries = 0, 0
        while got < 32 and tries < 200000:
            tries += 1
            julia = got % 2 == 1
            S = dict(map=mp, beta=rng.uniform(0, 2 * math.pi), theta=rng.uniform(0, 2 * math.pi),
                     w=[0.0, 0.0, 0.2, -0.15][got % 4], axis=got % 8 == 6, julia=julia,
                     jc=JC[mp][got % 2] if julia else [0.0] * 4, iters=48)
            p = [x * rng.uniform(0.4, 2.0) for x in unit(rng)]
            rd = unit(rng)
            dd, ds, tone, n = de(p, rd, S)
            if not (n <= 30 and dd > 1e-6 and ds > 1e-6) or (got % 4 == 0 and n < 6):
                continue
            dd2, ds2, _, n2 = de(p, rd, S, f32)
            nr, nr2 = normal(p, S), normal(p, S, f32)
            if n2 != n or rel(dd, dd2) > 2e-4 or rel(ds, ds2) > 2e-4 or max(abs(a - b) for a, b in zip(nr, nr2)) > 2e-3:
                continue
            out['de'].append({'p': p, 'rd': rd, 'set': S, 'de_dir': dd, 'de_scalar': ds, 'tone': tone, 'n': n, 'normal': nr})
            got += 1
        for k in range(16):
            julia = k % 2 == 1
            S = dict(map=mp, beta=[0.47, 0.0, math.pi / 2, 2.1][k % 4], theta=[0.0, 0.6][(k // 4) % 2],
                     w=[0.0, 0.2][(k // 2) % 2] if julia else 0.0, axis=False, julia=julia,
                     jc=JC[mp][k % 2] if julia else [0.0] * 4, iters=[24, 48][k % 2])
            M = dict(MARCH, leash=[8.0, 8.0, 1.5, 0.0][k % 4])
            az, el = 2 * math.pi * k / 16 + 0.3, 0.35 * math.sin(k)
            ro = [3.2 * math.cos(el) * math.sin(az), 3.2 * math.sin(el), -3.2 * math.cos(el) * math.cos(az)]
            rd = [-x / 3.2 for x in ro]
            if k % 8 == 7:
                rd = [0.6 * x + 0.8 * y for x, y in zip(rd, unit(rng))]     # glancing or missing
            jit = [0.05 * math.sin(3 * k + 1), 0.05 * math.cos(5 * k), 0.0]
            rd = add(rd, jit); L = math.sqrt(dot(rd, rd)); rd = [x / L for x in rd]
            hit, t, steps = march(ro, rd, S, M)
            hit2, t2, steps2 = march(add(ro, [1e-6, -1e-6, 1e-6]), rd, S, M)
            if hit != hit2 or abs(t - t2) > 2e-4 or abs(steps - steps2) > 1 or steps >= M['maxSteps']:
                continue
            out['march'].append({'ro': ro, 'rd': rd, 'set': S, 'march': M, 'hit': hit, 't': t, 'steps': steps})
    return out


def check(V):
    worst, bad = 0.0, []
    for i, r in enumerate(V['de']):
        dd, ds, tone, n = de(r['p'], r['rd'], r['set'])
        nr = normal(r['p'], r['set'])
        e = max(rel(dd, r['de_dir']), rel(ds, r['de_scalar']), abs(tone - r['tone']),
                max(abs(a - b) for a, b in zip(nr, r['normal'])))
        worst = max(worst, e)
        if e > 1e-9 or n != r['n']:
            bad.append(f'de[{i}]')
    for i, r in enumerate(V['march']):
        hit, t, steps = march(r['ro'], r['rd'], r['set'], r['march'])
        if hit != r['hit'] or abs(t - r['t']) > 1e-9 or steps != r['steps']:
            bad.append(f'march[{i}]')
    return worst, bad


if __name__ == '__main__':
    path = HERE / 'vectors.json'
    if sys.argv[1:] == ['--write']:
        V = generate()
        path.write_text(json.dumps(V, indent=1) + '\n')
        for mp in MAPS:
            d = [r for r in V['de'] if r['set']['map'] == mp]; m = [r for r in V['march'] if r['set']['map'] == mp]
            print(f"{mp}: {len(d)} DE/normal ({sum(r['set']['julia'] for r in d)} Julia, depth {min(r['n'] for r in d)}-{max(r['n'] for r in d)}), "
                  f"{len(m)} march rays ({sum(r['hit'] for r in m)} hit; leash 8/1.5/scalar = "
                  f"{sum(r['march']['leash'] == 8 for r in m)}/{sum(r['march']['leash'] == 1.5 for r in m)}/{sum(r['march']['leash'] == 0 for r in m)})")
        sys.exit(0)
    V = json.loads(path.read_text())
    worst, bad = check(V)
    print(f"  reference vs vectors.json: {len(V['de'])} DE/normal + {len(V['march'])} march, max drift {worst:.1e}")
    print('PASS' if not bad else 'FAIL ' + ', '.join(bad[:10]))
    sys.exit(0 if not bad else 1)
