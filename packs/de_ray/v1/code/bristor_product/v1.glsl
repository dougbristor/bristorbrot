// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// bristor_product / v1 — GLSL ES 3.00 face. codetree:bristor_product/v1, see codetree/blocks/bristor_product/
//
// The Bristorian (imordial) product, square and square-Jacobian for the two render sizes:
//   B2: vec3 = (real, e1, e2)          B3: vec4 = (real, e1, e2, e3)
// Rank-indexed: component 0 (.x) is the real part, then e1, e2, e3 in ascending rank (i-roll, canon).
//   e_a * e_b = sgn(b - a) * e_b   (a != b),   e_a * e_a = -1.     So e1*e2 = +e2, e2*e1 = -e1.
// NOT quaternions: there is no ij = k. In B3 the 4th slot (.w) is e3, NOT the real part.
//
// Paste this file above your shader code. Every function is checked on the GPU against vectors.json by
// conform_glsl.mjs (which also shows the check FAILS on the j-roll rule and on a transposed Jacobian).
// Written from the rule, not translated from v1.js / v1.py.

// ---------- B2 ----------
vec3 bp_mul(vec3 a, vec3 b) {
  return vec3(a.x*b.x - a.y*b.y - a.z*b.z,
              a.x*b.y + a.y*b.x - b.y*a.z,            // e1: lower ranks none, higher ranks a2
              a.x*b.z + a.z*b.x + b.z*a.y);           // e2: lower ranks a1, higher none
}
vec3 bp_square(vec3 z) {
  return vec3(z.x*z.x - z.y*z.y - z.z*z.z,
              z.y*(2.0*z.x - z.z),
              z.z*(2.0*z.x + z.y));
}
// Derivative of the square in direction v: J(z) v = z v + v z (bilinear product rule; no associativity needed).
vec3 bp_Jv(vec3 z, vec3 v) { return bp_mul(z, v) + bp_mul(v, z); }
// The Jacobian as a matrix. GLSL mat3(c0, c1, c2) takes COLUMNS, so bp_jacobian(z) * v == bp_Jv(z, v).
mat3 bp_jacobian(vec3 z) {
  return mat3(vec3( 2.0*z.x,  2.0*z.y,           2.0*z.z),            // d/d real
              vec3(-2.0*z.y,  2.0*z.x - z.z,     z.z),                // d/d e1
              vec3(-2.0*z.z, -z.y,               2.0*z.x + z.y));     // d/d e2
}

// ---------- B3 ----------
vec4 bp_mul(vec4 a, vec4 b) {
  return vec4(a.x*b.x - a.y*b.y - a.z*b.z - a.w*b.w,
              a.x*b.y + a.y*b.x + b.y*(-a.z - a.w),
              a.x*b.z + a.z*b.x + b.z*( a.y - a.w),
              a.x*b.w + a.w*b.x + b.w*( a.y + a.z));
}
vec4 bp_square(vec4 z) {
  return vec4(z.x*z.x - z.y*z.y - z.z*z.z - z.w*z.w,
              z.y*(2.0*z.x - z.z - z.w),
              z.z*(2.0*z.x + z.y - z.w),
              z.w*(2.0*z.x + z.y + z.z));
}
vec4 bp_Jv(vec4 z, vec4 v) { return bp_mul(z, v) + bp_mul(v, z); }
mat4 bp_jacobian(vec4 z) {
  return mat4(vec4( 2.0*z.x,  2.0*z.y,              2.0*z.z,              2.0*z.w),
              vec4(-2.0*z.y,  2.0*z.x - z.z - z.w,  z.z,                  z.w),
              vec4(-2.0*z.z, -z.y,                  2.0*z.x + z.y - z.w,  z.w),
              vec4(-2.0*z.w, -z.y,                 -z.z,                  2.0*z.x + z.y + z.z));
}
