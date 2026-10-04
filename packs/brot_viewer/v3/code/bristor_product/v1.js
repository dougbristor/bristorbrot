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
//
// Faces: mul / square / jv take any n and dispatch to an unrolled B2 (n = 2) or B3 (n = 3) path;
// mulN / squareN are the general loops, kept for every other n and as the reference the fast paths
// are checked against (conform.mjs "fast = general"). Hot loops may call mul2 / mul3 / jv2 / jv3 directly.
// Every component follows one line:  (a·b)_q = a0·b_q + a_q·b0 + b_q·(Σ_{p<q} a_p − Σ_{p>q} a_p)
// (written out in the general loop's own operation order, so the fast paths are bitwise identical).

// The unrolled paths perform the SAME floating-point operations in the SAME order as mulN / squareN, so
// they are bitwise identical to the general loop (conform.mjs asserts max |diff| = 0). That matters at a
// set boundary: a 1e-15 reordering flips pixels after 200 iterations, and a downstream exact-count control
// (chi_selector C1) would see it. Do not "simplify" the grouping below.

// ---- B2 (n = 2): [1, e1, e2] -------------------------------------------------------------
export const mul2 = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  (a[0] * b[1] + a[1] * b[0]) - a[2] * b[1],
  a[1] * b[2] + (a[0] * b[2] + a[2] * b[0])];
export function square2(z) {
  const t = z[1] + z[2], x2 = 2 * z[0], ab1 = t - z[1], ab2 = ab1 - z[2];
  return [z[0] * z[0] - z[1] * z[1] - z[2] * z[2], z[1] * (x2 - ab1), z[2] * ((x2 + z[1]) - ab2)];
}
/** J(z)·v = z·v + v·z for B2 (the derivative-chain step), bitwise equal to mulN(z,v) + mulN(v,z). */
export function jv2(z, v) {
  const p = mul2(z, v), q = mul2(v, z);
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
}

// ---- B3 (n = 3): [1, e1, e2, e3] ---------------------------------------------------------
export const mul3 = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  ((a[0] * b[1] + a[1] * b[0]) - a[2] * b[1]) - a[3] * b[1],
  (a[1] * b[2] + (a[0] * b[2] + a[2] * b[0])) - a[3] * b[2],
  (a[1] * b[3] + a[2] * b[3]) + (a[0] * b[3] + a[3] * b[0])];
export function square3(z) {
  const t = (z[1] + z[2]) + z[3], x2 = 2 * z[0], b2 = z[1] + z[2];
  const ab1 = t - z[1], ab2 = (t - z[1]) - z[2], ab3 = (t - b2) - z[3];
  return [z[0] * z[0] - z[1] * z[1] - z[2] * z[2] - z[3] * z[3],
    z[1] * (x2 - ab1), z[2] * ((x2 + z[1]) - ab2), z[3] * ((x2 + b2) - ab3)];
}
/** J(z)·v = z·v + v·z for B3, bitwise equal to mulN(z,v) + mulN(v,z). */
export function jv3(z, v) {
  const p = mul3(z, v), q = mul3(v, z);
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
}

// ---- any n -------------------------------------------------------------------------------
/** Product a·b. a and b must have the same length n + 1. Unrolled for n = 2, 3. */
export function mul(a, b) {
  const n = a.length - 1;
  if (b.length !== n + 1) throw new Error('bristor_product: operands differ in length');
  return n === 2 ? mul2(a, b) : n === 3 ? mul3(a, b) : mulN(a, b);
}

/** Square z·z for any n. Unrolled for n = 2, 3. */
export function square(z) {
  const n = z.length - 1;
  return n === 2 ? square2(z) : n === 3 ? square3(z) : squareN(z);
}

/** J(z)·v = z·v + v·z for any n (the derivative-chain step, no matrix). Unrolled for n = 2, 3. */
export function jv(z, v) {
  const n = z.length - 1;
  if (v.length !== n + 1) throw new Error('bristor_product: operands differ in length');
  if (n === 2) return jv2(z, v);
  if (n === 3) return jv3(z, v);
  const a = mulN(z, v), b = mulN(v, z);
  return a.map((x, i) => x + b[i]);
}

/** General product, any n: the reference loop. */
export function mulN(a, b) {
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

/** General square, any n, in closed form:  real = x² − Σ y_a²,  e_b = y_b·(2x + Σ_{a<b} y_a − Σ_{a>b} y_a). */
export function squareN(z) {
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
