#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""Regenerate vectors.json for quaternion_product from the multiplication TABLE (not from v1.py).  python make_vectors.py

Expected values come from the Hamilton table e_a * e_b = sign * e_k, summed term by term, so v1's closed forms are
checked against a second route. Inputs are in eighths, so every value is exact. Wrong-rule columns a port must NOT
match: 'bristorian' (i*j = +j), 'reversed' (operands swapped, i*j = -k), 'w_real' (the real part read from slot w).
"""
import json, random
from pathlib import Path

# HAMILTON[a][b] = (sign, k): e_a * e_b = sign * e_k, basis (1, i, j, k)
HAMILTON = [[(1, 0), (1, 1), (1, 2), (1, 3)],
            [(1, 1), (-1, 0), (1, 3), (-1, 2)],
            [(1, 2), (-1, 3), (-1, 0), (1, 1)],
            [(1, 3), (1, 2), (-1, 1), (-1, 0)]]
BRISTORIAN = [[(1, b) if a == 0 else (1, a) if b == 0 else (-1, 0) if a == b else ((1 if a < b else -1), b) for b in range(4)] for a in range(4)]


def table_mul(T, x, y):
    out = [0.0] * 4
    for a in range(4):
        for b in range(4):
            s, k = T[a][b]
            out[k] += s * x[a] * y[b]
    return out


def add(a, b):
    return [p + q for p, q in zip(a, b)]


def rot(z):            # (w, x, y, z) read as (x, y, z, w): the real part taken from slot w
    return [z[3], z[0], z[1], z[2]]


def unrot(z):
    return [z[1], z[2], z[3], z[0]]


def main():
    rng = random.Random(20261003)
    q = lambda: round(rng.uniform(-1.5, 1.5) * 8) / 8
    basis = [[1.0 if i == k else 0.0 for i in range(4)] for k in range(4)]
    pairs = [(basis[a], basis[b], f'e{a}*e{b}') for a in range(1, 4) for b in range(1, 4) if a != b]
    pairs += [([q() for _ in range(4)], [q() for _ in range(4)], None) for _ in range(12)]
    rows = []
    for a, b, label in pairs:
        r = {'a': a, 'b': b, 'v': [q() for _ in range(4)]}
        if label:
            r['label'] = label
        r['mul'] = table_mul(HAMILTON, a, b)
        r['square'] = table_mul(HAMILTON, a, a)
        r['jv'] = add(table_mul(HAMILTON, a, r['v']), table_mul(HAMILTON, r['v'], a))
        r['bristorian'] = {'mul': table_mul(BRISTORIAN, a, b), 'square': table_mul(BRISTORIAN, a, a)}
        r['reversed'] = {'mul': table_mul(HAMILTON, b, a)}
        r['w_real'] = {'mul': unrot(table_mul(HAMILTON, rot(a), rot(b))), 'square': unrot(table_mul(HAMILTON, rot(a), rot(a)))}
        rows.append(r)
    V = {'about': 'quaternion_product v1 vectors, from the Hamilton multiplication table (independent of v1 closed forms)',
         'basis': ['1', 'i', 'j', 'k'], 'tolerance': 1e-12, 'rows': rows}
    Path(__file__).with_name('vectors.json').write_text(json.dumps(V, indent=1) + '\n')
    print(f"wrote vectors.json: {len(rows)} rows ({sum('label' in r for r in rows)} basis products, {sum('label' not in r for r in rows)} random)")


if __name__ == '__main__':
    main()
