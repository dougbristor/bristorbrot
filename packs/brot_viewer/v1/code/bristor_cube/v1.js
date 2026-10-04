// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// bristor_cube / v1 — codetree:bristor_cube/v1. The two Bristorian cubes and their directional derivatives,
// any n, composed from bristor_product/v1.js only.
//
//   cubeL(z) = (z z) z          JvL(z, v) = (z v + v z) z + (z z) v
//   cubeR(z) = z (z z)          JvR(z, v) = v (z z) + z (z v + v z)
import { mul, square } from '../bristor_product/v1.js';

const add = (a, b) => a.map((x, k) => x + b[k]);
const jv2 = (z, v) => add(mul(z, v), mul(v, z));

export const cubeL = z => mul(square(z), z);
export const cubeR = z => mul(z, square(z));
export const JvL = (z, v) => add(mul(jv2(z, v), z), mul(square(z), v));
export const JvR = (z, v) => add(mul(v, square(z)), mul(z, jv2(z, v)));
