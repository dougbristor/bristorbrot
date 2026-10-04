# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""quaternion_product / v1 — codetree:quaternion_product/v1. The Hamilton product, square and directional
derivative of the square, on [real, i, j, k] lists. NOT the Bristorian product: here i*j = +k."""


def mul(a, b):
    a0, a1, a2, a3 = a
    b0, b1, b2, b3 = b
    return [a0*b0 - a1*b1 - a2*b2 - a3*b3,
            a0*b1 + a1*b0 + a2*b3 - a3*b2,
            a0*b2 + a2*b0 + a3*b1 - a1*b3,
            a0*b3 + a3*b0 + a1*b2 - a2*b1]


def square(z):
    x, y, u, w = z
    return [x*x - y*y - u*u - w*w, 2*x*y, 2*x*u, 2*x*w]


def jv(z, v):
    """Derivative of z^2 along v: z*v + v*z."""
    return [p + q for p, q in zip(mul(z, v), mul(v, z))]


Jv = jv
