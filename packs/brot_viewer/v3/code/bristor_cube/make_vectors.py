#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""Regenerate vectors.json for bristor_cube from v1.py (double precision).  python make_vectors.py

Columns: canon cube_l, cube_r, jv_l, jv_r. Wrong-rule columns a port must NOT match:
  swapped     the brackets exchanged (cube_l given as z(zz))
  quaternion  the Hamilton cube z^3 (n = 3), where both brackets agree because Hamilton is associative
"""
import json, random
from pathlib import Path
import importlib.util

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('bristor_cube_v1', HERE / 'v1.py')
bc = importlib.util.module_from_spec(spec); spec.loader.exec_module(bc)


def qmul(a, b):
    return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
            a[0]*b[2]+a[2]*b[0]+a[3]*b[1]-a[1]*b[3], a[0]*b[3]+a[3]*b[0]+a[1]*b[2]-a[2]*b[1]]


def main():
    rng = random.Random(20261003)
    q = lambda: round(rng.uniform(-1.5, 1.5) * 8) / 8          # eighths: exact in binary
    rows = [{'n': 3, 'z': [0, 1, 1, 0], 'v': [0.25, -0.5, 0.75, 1.0], 'witness': 'caro 10-02: L=(0,-3,-3,0), R=(0,-1,-1,0)'}]
    for n in (2, 3, 3, 3, 4, 5):
        for _ in range(4):
            rows.append({'n': n, 'z': [q() for _ in range(n + 1)], 'v': [q() for _ in range(n + 1)]})
    for r in rows:
        z, v = r['z'], r['v']
        r.update(cube_l=bc.cube_l(z), cube_r=bc.cube_r(z), jv_l=bc.jv_l(z, v), jv_r=bc.jv_r(z, v))
        r['swapped'] = {'cube_l': r['cube_r'], 'cube_r': r['cube_l']}
        r['quaternion'] = qmul(qmul(z, z), z) if r['n'] == 3 else None
    V = {'about': 'bristor_cube v1 vectors, double precision from v1.py; inputs in eighths so every value is exact',
         'tolerance': 1e-12, 'rows': rows}
    (HERE / 'vectors.json').write_text(json.dumps(V, indent=1) + '\n')
    gaps = sum(any(abs(a - b) > 1e-9 for a, b in zip(r['cube_l'], r['cube_r'])) for r in rows)
    print(f'wrote vectors.json: {len(rows)} rows (n = 2..5), {gaps} with a nonzero bracket gap')


if __name__ == '__main__':
    main()
