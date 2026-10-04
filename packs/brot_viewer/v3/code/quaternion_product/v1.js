// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// quaternion_product / v1 — codetree:quaternion_product/v1. The Hamilton product, square and directional
// derivative of the square, on [real, i, j, k] arrays. NOT the Bristorian product: here i·j = +k.

/** Product a·b. */
export function mul([a0, a1, a2, a3], [b0, b1, b2, b3]) {
  return [a0 * b0 - a1 * b1 - a2 * b2 - a3 * b3,
          a0 * b1 + a1 * b0 + a2 * b3 - a3 * b2,
          a0 * b2 + a2 * b0 + a3 * b1 - a1 * b3,
          a0 * b3 + a3 * b0 + a1 * b2 - a2 * b1];
}

/** Square z·z = (x² − |v|², 2x·v). */
export const square = ([x, y, z, w]) => [x * x - y * y - z * z - w * w, 2 * x * y, 2 * x * z, 2 * x * w];

/** Derivative of z² along v: z·v + v·z. */
export const Jv = (z, v) => mul(z, v).map((x, k) => x + mul(v, z)[k]);
