#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""Conformance for a port of the Hamilton quaternion product.

    python conform.py my_port.py     # defines mul(a, b), square(z) and jv(z, v) (or Jv)
    python conform.py --selftest     # shows the check failing on planted mistakes

A port PASSES only if it matches the table values. If it fails, this names the wrong rule it matches.
"""
import importlib.util, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
V = json.loads((HERE / 'vectors.json').read_text())
TOL = V['tolerance']
DIAGNOSIS = {'bristorian': 'this is the Bristorian product (i*j = +j). Hamilton sends i*j to a third direction, +k.',
             'reversed': 'your operands are swapped (i*j = -k). The product is a*b, a on the left.',
             'w_real': 'you read the real part from the last slot. Here it is the FIRST: (real, i, j, k).'}


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def md(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def check(m, quiet=False):
    jv = getattr(m, 'jv', None) or getattr(m, 'Jv')
    worst, fails, matches = 0.0, [], {k: True for k in DIAGNOSIS}
    for i, r in enumerate(V['rows']):
        out = {'mul': m.mul(r['a'], r['b']), 'square': m.square(r['a']), 'jv': jv(r['a'], r['v'])}
        for k, o in out.items():
            d = md(o, r[k]); worst = max(worst, d)
            if d > TOL:
                fails.append(f'row {i} {k}')
        for k in DIAGNOSIS:
            for key, val in r[k].items():
                if md(out[key], val) > TOL:
                    matches[k] = False
    ok = not fails
    if not quiet:
        print(f"  {len(V['rows'])} rows (mul, square, jv), max |diff| = {worst:.3g}")
        if fails:
            print('  first failures: ' + ', '.join(fails[:4]))
            for k, hit in matches.items():
                if hit:
                    print('  diagnosis: ' + DIAGNOSIS[k])
        print('PASS' if ok else 'FAIL')
    return ok


def selftest():
    qp = load(HERE / 'v1.py', 'quaternion_product_v1')
    bp = load(HERE.parent / 'bristor_product' / 'v1.py', 'bristor_product_v1')
    ns = lambda **kw: type('Port', (), {k: staticmethod(f) for k, f in kw.items()})
    arms = [('v1.py as shipped', qp, True),
            ('Bristorian product', ns(mul=bp.mul, square=bp.square, jv=lambda z, v: [a + b for a, b in zip(bp.mul(z, v), bp.mul(v, z))]), False),
            ('operands swapped', ns(mul=lambda a, b: qp.mul(b, a), square=qp.square, jv=qp.jv), False),
            ('real part read from slot w', ns(mul=lambda a, b: (lambda r: [r[1], r[2], r[3], r[0]])(qp.mul([a[3], *a[:3]], [b[3], *b[:3]])),
                                              square=qp.square, jv=qp.jv), False)]
    ok_all = True
    for name, m, want in arms:
        got = check(m, quiet=True); good = got == want; ok_all &= good
        print(f"[{'ok ' if good else 'BAD'}] {name}: expected {'PASS' if want else 'FAIL'}, got {'PASS' if got else 'FAIL'}")
    print('selftest: all arms behaved as expected' if ok_all else 'selftest: SOME ARM MISBEHAVED')
    return ok_all


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(0 if (selftest() if sys.argv[1] == '--selftest' else check(load(sys.argv[1], 'port'))) else 1)
