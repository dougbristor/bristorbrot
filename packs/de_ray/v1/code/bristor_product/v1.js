// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// bristor_product / v1
// codetree:bristor_product/v1 — see codetree/blocks/bristor_product/
//
// The Bristorian (imordial) product and square, any number n of imaginary units.
// Rank-indexed arrays: z[0] is the real part, z[a] is the coefficient of e_a (a = 1..n).
//
//     e_a · e_b = sgn(b − a) · e_b   (a ≠ b)        e_a · e_a = −1        (i-roll, canon)
//
// So i·j = +j and j·i = −i: the product lands back on its right-hand factor.
// Verify any port with conform.mjs / conform.py against vectors.json.

/** Product a·b. a and b must have the same length n + 1. */
export function mul(a, b) {
  const n = a.length - 1;
  if (b.length !== n + 1) throw new Error('bristor_product: operands differ in length');
  const out = new Array(n + 1).fill(0);
  out[0] = a[0] * b[0];
  for (let p = 1; p <= n; p++) {
    out[0] -= a[p] * b[p];                  // e_p · e_p = −1
    out[p] += a[0] * b[p] + a[p] * b[0];    // 1 is the identity
    for (let q = 1; q <= n; q++) {
      if (q === p) continue;
      out[q] += (q > p ? 1 : -1) * a[p] * b[q]; // e_p · e_q = sgn(q − p) · e_q
    }
  }
  return out;
}

/** Square z·z, in closed form:  real = x² − Σ y_a²,  e_b = y_b·(2x + Σ_{a<b} y_a − Σ_{a>b} y_a). */
export function square(z) {
  const n = z.length - 1, out = new Array(n + 1);
  let below = 0, total = 0;
  for (let a = 1; a <= n; a++) total += z[a];
  out[0] = z[0] * z[0];
  for (let b = 1; b <= n; b++) {
    out[0] -= z[b] * z[b];
    const above = total - below - z[b];
    out[b] = z[b] * (2 * z[0] + below - above);
    below += z[b];
  }
  return out;
}

/**
 * Jacobian of the square, row-major (n+1)×(n+1): entry [r*(n+1)+c] = ∂(z²)_r / ∂z_c.
 *   row 0      : [ 2x, −2y_1, …, −2y_n ]
 *   row b ≥ 1  : ∂/∂x = 2y_b ;  ∂/∂y_b = 2x + Σ_{a<b} y_a − Σ_{a>b} y_a ;  ∂/∂y_a = +y_b (a<b), −y_b (a>b)
 * Equivalently J·v = z·v + v·z (the product rule; mul is bilinear). Feeds a derivative chain v ← J(z)·v + dc.
 */
export function squareJacobian(z) {
  const n = z.length - 1, m = n + 1, J = new Array(m * m).fill(0);
  J[0] = 2 * z[0];
  for (let a = 1; a <= n; a++) J[a] = -2 * z[a];
  let below = 0, total = 0;
  for (let a = 1; a <= n; a++) total += z[a];
  for (let b = 1; b <= n; b++) {
    const row = b * m, above = total - below - z[b];
    J[row] = 2 * z[b];
    for (let a = 1; a <= n; a++) J[row + a] = a < b ? z[b] : a > b ? -z[b] : 2 * z[0] + below - above;
    below += z[b];
  }
  return J;
}
