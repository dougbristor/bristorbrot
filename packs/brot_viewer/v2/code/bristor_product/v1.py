# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""bristor_product / v1 — codetree:bristor_product/v1, see codetree/blocks/bristor_product/

The Bristorian (imordial) product and square, any number n of imaginary units.
Rank-indexed sequences: z[0] is the real part, z[a] is the coefficient of e_a (a = 1..n).

    e_a * e_b = sgn(b - a) * e_b   (a != b)        e_a * e_a = -1        (i-roll, canon)

Written independently of v1.js (not a translation of it); both answer to vectors.json.
"""


def mul(a, b):
    """Product a*b of two equal-length rank-indexed sequences."""
    n = len(a) - 1
    if len(b) != n + 1:
        raise ValueError("bristor_product: operands differ in length")
    # real part: a0*b0 minus the matched imaginary pairs
    out = [a[0] * b[0] - sum(a[k] * b[k] for k in range(1, n + 1))]
    for q in range(1, n + 1):
        # e_q collects: a0*b_q + a_q*b0, plus every a_p*b_q with p != q, signed by which rank came first
        lower = sum(a[p] for p in range(1, q))
        higher = sum(a[p] for p in range(q + 1, n + 1))
        out.append(a[0] * b[q] + a[q] * b[0] + b[q] * (lower - higher))
    return out


def square(z):
    """z*z.  real = x^2 - sum y_a^2,  e_b = y_b * (2x + sum_{a<b} y_a - sum_{a>b} y_a)."""
    n = len(z) - 1
    out = [z[0] * z[0] - sum(z[k] * z[k] for k in range(1, n + 1))]
    for b in range(1, n + 1):
        out.append(z[b] * (2 * z[0] + sum(z[1:b]) - sum(z[b + 1:])))
    return out


def square_jacobian(z):
    """Jacobian of the square, row-major (n+1)x(n+1): entry [r*(n+1)+c] = d(z^2)_r / dz_c.

    Built row by row from the closed form of square(); equivalently J v = z v + v z.
    """
    n = len(z) - 1
    rows = [[2 * z[0]] + [-2 * z[a] for a in range(1, n + 1)]]
    for b in range(1, n + 1):
        row = [2 * z[b]]
        for a in range(1, n + 1):
            if a < b:
                row.append(z[b])
            elif a > b:
                row.append(-z[b])
            else:
                row.append(2 * z[0] + sum(z[1:b]) - sum(z[b + 1:]))
        rows.append(row)
    return [v for r in rows for v in r]


squareJacobian = square_jacobian  # same name as v1.js, for conform
