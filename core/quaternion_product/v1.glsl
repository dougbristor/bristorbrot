// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// quaternion_product / v1 — GLSL ES 3.00. codetree:quaternion_product/v1
// The Hamilton quaternion product, its square and its directional derivative. This is NOT the Bristorian
// product: here i·j = +k (a third direction); there i·j = +j (back onto a factor).
// Slots as everywhere in this tree: vec4 (x, y, z, w) = (1, i, j, k). The real part is x, not w.
vec4 qp_mul(vec4 a, vec4 b) {
  return vec4(a.x*b.x - dot(a.yzw, b.yzw),
              a.x*b.yzw + b.x*a.yzw + cross(a.yzw, b.yzw));
}
vec4 qp_square(vec4 z) { return vec4(z.x*z.x - dot(z.yzw, z.yzw), 2.0*z.x*z.yzw); }
vec4 qp_Jv(vec4 z, vec4 v) { return qp_mul(z, v) + qp_mul(v, z); }   // derivative of z² along v
