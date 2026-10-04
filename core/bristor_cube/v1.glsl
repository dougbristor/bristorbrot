// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// bristor_cube / v1 — GLSL ES 3.00. codetree:bristor_cube/v1
// The two Bristorian cubes and their directional derivatives, composed from bristor_product only.
// Paste AFTER bristor_product/v1.glsl. B2 (vec3) and B3 (vec4) overloads.
//
//   bc_cubeL(z) = (z z) z          bc_JvL(z, v) = (Jv) z + (z z) v      where Jv = z v + v z
//   bc_cubeR(z) = z (z z)          bc_JvR(z, v) = v (z z) + z (Jv)
//
// The algebra is not associative, so the two cubes differ (z = (0,1,1,0): L = (0,-3,-3,0), R = (0,-1,-1,0)).
// Squares cannot show the hand; these cubes can.
vec3 bc_cubeL(vec3 z) { return bp_mul(bp_square(z), z); }
vec3 bc_cubeR(vec3 z) { return bp_mul(z, bp_square(z)); }
vec3 bc_JvL(vec3 z, vec3 v) { return bp_mul(bp_Jv(z, v), z) + bp_mul(bp_square(z), v); }
vec3 bc_JvR(vec3 z, vec3 v) { return bp_mul(v, bp_square(z)) + bp_mul(z, bp_Jv(z, v)); }
vec4 bc_cubeL(vec4 z) { return bp_mul(bp_square(z), z); }
vec4 bc_cubeR(vec4 z) { return bp_mul(z, bp_square(z)); }
vec4 bc_JvL(vec4 z, vec4 v) { return bp_mul(bp_Jv(z, v), z) + bp_mul(bp_square(z), v); }
vec4 bc_JvR(vec4 z, vec4 v) { return bp_mul(v, bp_square(z)) + bp_mul(z, bp_Jv(z, v)); }
