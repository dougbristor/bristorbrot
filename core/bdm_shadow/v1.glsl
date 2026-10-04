// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// codetree:bdm_shadow/v1 — the shadow a key light casts on a brot_de_march surface.
// Needs brot_de_march/v1.glsl (BdmSet, bdm_de) and the map it marches, concatenated before this file.
//
// Planted 2026-10-04 by git from insights' shadow_lab (view.glsl shadowAt, 10-03), with the knobs the lab measured as
// inert or harmful left out (shadow LOD, eps floor, penumbra start, leashed step). Its measurements, light 4.6°:
//
//   live:   a short shadow ray (16-32 steps) by the SCALAR DE. 93-100% of these rays run out of steps, and IQ's
//           min(d / (t tan)) turns "undecided" into grey: on the Julias it is worse than no shadow at all. The last-step
//           estimator (est 1) decides a ray that runs out by its LAST clearance d / (t tan) against th: escaped = lit,
//           hit = dark, ran out = smoothstep(th(1 - soft), th(1 + soft), last). Mean |live - area light| over lit-facing
//           pixels at 32 steps: chi_l 0.013, q Julia 0.030, b_brot 0.127 (IQ: 0.032 / 0.074 / 0.181).
//   refine: a hard shadow toward one point of the light disk (256 steps). The running mean of these samples, over
//           bds_disk points, is the true area-light penumbra: the reference the live estimate was scored against.
//
// The threshold falls with the light's size: bdsThreshold() in v1.js (th = 0.3 (0.08 / size)^0.75, size in radians).

struct BdsLight {
  vec3  dir;    // unit vector toward the centre of the light
  float tanR;   // tan of the light's angular radius: sets the penumbra
  bool  hard;   // true: one refine sample, a hard shadow toward the disk point below
  vec2  disk;   // that point, in the unit disk (bdsDisk(i) in v1.js)
};

struct BdsShadow {
  int   steps;   // live ray steps, at most 512 (the lab's default is 32); a hard sample always takes 256
  float bias;    // ray start along the normal, in camera-hit tolerances (8: speckle -1/3 on b_brot, bias ~0)
  int   est;     // live estimator: 1 last step (default), 0 IQ soft shadow min(d / (t tan))
  float th;      // last-step threshold on d / (t tan)
  float soft;    // its smoothstep half width, relative to th (0.5); 0 = a hard threshold
  float hitEps;  // a shadow ray hits when the scalar DE falls below this
  float bound;   // the bound sphere's radius: a ray that leaves it is lit
};

int   bdsEnd  = 0;     // side outputs of the last call: how the ray ended, 0 escaped, 1 hit, 2 ran out of steps
float bdsLast = 0.0;   // and its last clearance d / (t tan)

// Light reaching surface point p (unit normal n, camera hit tolerance epsc) in set s: 1 lit, 0 dark.
float bds_shadow(vec3 p, vec3 n, float epsc, BdmSet s, BdsLight L, BdsShadow o) {
  vec3 ld = L.dir;
  if (L.hard) {
    vec3 a = normalize(cross(ld, abs(ld.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), b = cross(ld, a);
    ld = normalize(ld + L.tanR * (L.disk.x * a + L.disk.y * b));
  }
  vec3 org = p + n * (o.bias * epsc);
  float res = 1.0, t = o.bias * epsc;
  bdsEnd = 2; bdsLast = 1e3;
  int steps = L.hard ? 256 : o.steps;
  for (int i = 0; i < 512; i++) {
    if (i >= steps) break;
    vec3 q = org + ld * t;
    if (dot(q, q) > o.bound * o.bound && dot(q, ld) > 0.0) { bdsEnd = 0; break; }   // left the bound sphere: lit
    float d = bdm_de(q, ld, s).y;
    bdsLast = d / (t * L.tanR);
    if (d < o.hitEps) { bdsEnd = 1; return 0.0; }
    res = min(res, bdsLast);
    t += max(d, 0.5 * epsc);   // the scalar step: a leashed step reaches occluders, but IQ then over-darkens
  }
  if (L.hard) return 1.0;                                  // a hard sample is dark only on a hit
  if (o.est == 1) {
    if (bdsEnd == 0) return 1.0;                           // escaped: lit (the area light agrees in every scene)
    float w = o.th * o.soft;
    return w > 0.0 ? smoothstep(o.th - w, o.th + w, bdsLast) : (bdsLast < o.th ? 0.0 : 1.0);
  }
  return clamp(res, 0.0, 1.0);
}
