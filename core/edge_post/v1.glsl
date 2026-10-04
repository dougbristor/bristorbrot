// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// codetree:edge_post/v1 — one post pass over a rendered frame, no new rays: an FXAA-console style blend along the
// luma edge direction, applied only where a mask says "edge". The mask can use the march itself (steps and hit, from
// an aux texture), so it smooths the geometry's edges and leaves shading detail alone.
//
// Planted 2026-10-04 by git from insights' shadow_lab post.glsl (10-03), as a library function: the host supplies
// the textures and writes main(). The lab's bench switches (3x3 blur, blending along the edge normal) are not in the
// block; they are planted faults in conform_glsl.mjs --selftest.
//
// col: the frame (display space). aux: R = steps & 255, G = steps >> 8 (both / 255), B = 1 on a hit, else 0.
// Both are read with texelFetch, clamped at the border; col is also sampled bilinearly by the blend, so give it
// LINEAR filtering and CLAMP_TO_EDGE.

const int EP_NONE = 0, EP_LUMA = 1, EP_STEPS = 2, EP_BOTH = 3, EP_ALL = 4;

float ep_luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3  ep_col(sampler2D t, ivec2 p, vec2 res) { return texelFetch(t, clamp(p, ivec2(0), ivec2(res) - 1), 0).rgb; }
vec4  ep_aux(sampler2D t, ivec2 p, vec2 res) { return texelFetch(t, clamp(p, ivec2(0), ivec2(res) - 1), 0); }
float ep_steps(vec4 a) { return floor(a.r * 255.0 + 0.5) + 256.0 * floor(a.g * 255.0 + 0.5); }

// The filtered colour of pixel ip. mask: EP_NONE returns the pixel unchanged; EP_LUMA blends where the 3x3 luma
// contrast is high; EP_STEPS where a 4-neighbour's march differs by more than stepJump steps or by hit / miss;
// EP_BOTH where both hold (the lab's choice); EP_ALL everywhere. edge says whether the mask selected the pixel.
vec3 ep_filter(sampler2D col, sampler2D aux, ivec2 ip, vec2 res, int mask, float stepJump, out bool edge) {
  vec3 rgbM = ep_col(col, ip, res);
  edge = false;
  if (mask == EP_NONE) return rgbM;

  // luma over the 3x3 neighbourhood
  float lM = ep_luma(rgbM), lo = lM, hi = lM;
  // corner names follow the original FXAA (NW = (-1,-1) in y-up gl_FragCoord), so dir below is the edge TANGENT
  float lNW = ep_luma(ep_col(col, ip + ivec2(-1, -1), res)), lNE = ep_luma(ep_col(col, ip + ivec2(1, -1), res));
  float lSW = ep_luma(ep_col(col, ip + ivec2(-1, 1), res)), lSE = ep_luma(ep_col(col, ip + ivec2(1, 1), res));
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float l = ep_luma(ep_col(col, ip + ivec2(x, y), res));
    lo = min(lo, l); hi = max(hi, l);
  }
  bool lumaEdge = hi - lo > max(0.0312, 0.125 * hi);

  // step jump or hit change against the 4 neighbours: an edge in the geometry, not in the shading
  vec4 aM = ep_aux(aux, ip, res);
  float sM = ep_steps(aM), jump = 0.0;
  bool hitChange = false;
  for (int k = 0; k < 4; k++) {
    ivec2 d = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(-1, 0) : k == 2 ? ivec2(0, 1) : ivec2(0, -1);
    vec4 a = ep_aux(aux, ip + d, res);
    jump = max(jump, abs(ep_steps(a) - sM));
    hitChange = hitChange || ((a.b > 0.5) != (aM.b > 0.5));
  }
  bool stepEdge = jump > stepJump || hitChange;

  edge = mask == EP_LUMA ? lumaEdge : mask == EP_STEPS ? stepEdge : mask == EP_BOTH ? (lumaEdge && stepEdge) : true;
  if (!edge) return rgbM;

  // FXAA console blend: direction from the diagonal lumas, 2 then 4 bilinear taps along it
  vec2 px = 1.0 / res, uv = (vec2(ip) + 0.5) * px;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * (1.0 / 8.0), 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * px;
  vec3 rgbA = 0.5 * (texture(col, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(col, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = 0.5 * rgbA + 0.25 * (texture(col, uv - dir * 0.5).rgb + texture(col, uv + dir * 0.5).rgb);
  float lB = ep_luma(rgbB);
  return lB < lo || lB > hi ? rgbA : rgbB;
}
