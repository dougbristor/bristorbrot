# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""bristor_cube / v1 — codetree:bristor_cube/v1. The two Bristorian cubes and their directional derivatives,
any n, composed from bristor_product/v1.py (the sibling block folder) only.

    cube_l(z) = (z z) z          jv_l(z, v) = (z v + v z) z + (z z) v
    cube_r(z) = z (z z)          jv_r(z, v) = v (z z) + z (z v + v z)
"""
import importlib.util
from pathlib import Path

# loaded by file path: both blocks name their face v1.py, so a plain `import v1` would find this file
_spec = importlib.util.spec_from_file_location(
    'bristor_product_v1', Path(__file__).resolve().parent.parent / 'bristor_product' / 'v1.py')
_bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bp)
mul, square = _bp.mul, _bp.square


def _add(a, b):
    return [x + y for x, y in zip(a, b)]


def _jv2(z, v):
    return _add(mul(z, v), mul(v, z))


def cube_l(z):
    return mul(square(z), z)


def cube_r(z):
    return mul(z, square(z))


def jv_l(z, v):
    return _add(mul(_jv2(z, v), z), mul(square(z), v))


def jv_r(z, v):
    return _add(mul(v, square(z)), mul(z, _jv2(z, v)))


cubeL, cubeR, JvL, JvR = cube_l, cube_r, jv_l, jv_r
