// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// brot_de_march / v1 — GLSL ES 3.00. codetree:brot_de_march/v1
//
// Distance-estimated ray march for an escape-time set  z <- f(z) + c  in four slots (1, e1, e2, e3).
// The algebra is NOT in this file. Define these three BEFORE pasting this file:
//
//     vec4  bdm_f(vec4 z)            the map without c       b_brot:   bp_square(z)      chi_brot: bc_cubeL(z)
//     vec4  bdm_df(vec4 z, vec4 v)   its derivative along v            bp_Jv(z, v)                 bc_JvL(z, v)
//     const float BDM_POWER          degree of f                       2.0                         3.0
//
// Seeding: the world point p is rolled by theta in its (y, z) plane, giving q. Then
//     beta section:   z = (q.x, sin(beta)*q.y + cos(beta)*w, cos(beta)*q.y - sin(beta)*w, q.z)
//     axis section:   z = (q.x, q.y, q.z, w)
// w is the offset perpendicular to the displayed section (caro, cubic Julia 10-03). Ray directions seed
// through the same map with w = 0. beta and theta arrive as (sin, cos) pairs computed ONCE on the CPU.
// They are constant per frame, and GPU sin/cos measured up to 6e-5 off (ANGLE/GL, 10-02). A deep orbit
// amplifies that seed error into a few percent of the DE.
//
// Mandelbrot family: z0 = c = seed(p), and the derivative carries +dc each step.
// Julia:             z0 = seed(p), c = jc fixed, and the derivative carries NO +dc term.
// Derivative state (v, dr) is rescaled together with the +dc weight past 1e10.
//
// March (caro's directional_de / cubic Julia settings, 10-03): the STEP is the directional DE capped at
// leash * scalar DE (leash 8 = fast visual, 1.5 = tight; leash <= 0 steps by the scalar DE alone). The HIT
// test, and the adaptive safety, use the SCALAR DE. Interior points (no escape within iters) are hits.

struct BdmSet {
  vec2  beta;     // (sin beta, cos beta)
  vec2  theta;    // (sin theta, cos theta)
  float w;        // section offset perpendicular to the displayed section
  bool  axis;     // true: axis section (x, y, z, w) instead of the beta section
  bool  julia;    // false: Mandelbrot family, true: Julia with constant jc
  vec4  jc;       // Julia constant (1, e1, e2, e3)
  int   iters;    // orbit iterations, at most 256
};

struct BdmMarch {
  int   maxSteps;  // at most 8192
  float bound;     // march only inside the sphere |p| < bound
  float safety;    // step fraction (0.4)
  bool  adaptive;  // drop safety to 0.15 for a step where the scalar DE more than halved
  float hitEps;    // floor of the hit threshold
  float lod;       // threshold growth: eps = max(hitEps, lod * t / (lens * resY)). Live .08, Fine .04
  float lens;
  float resY;
  float leash;     // step = min(directional, leash * scalar). 8 fast visual, 3 balanced, 1.5 tight
};

const float BDM_BAIL2 = 64.0;   // escape when |z|^2 > 64

vec3 bdm_rot(vec3 p, vec2 th) {
  return vec3(p.x, th.y*p.y - th.x*p.z, th.x*p.y + th.y*p.z);
}

vec4 bdm_seed(vec3 p, BdmSet s, float w) {
  vec3 q = bdm_rot(p, s.theta);
  if (s.axis) return vec4(q, w);
  return vec4(q.x, s.beta.x*q.y + s.beta.y*w, s.beta.y*q.y - s.beta.x*w, q.z);
}

// (directional DE along rd, scalar DE, tone, orbit length). Interior: (0, 0, 1, iters).
vec4 bdm_de(vec3 p, vec3 rd, BdmSet s) {
  vec4 z  = bdm_seed(p, s, s.w);
  vec4 v  = bdm_seed(rd, s, 0.0);
  vec4 c  = s.julia ? s.jc : z;
  vec4 dc = s.julia ? vec4(0.0) : v;
  float dr = 1.0, w = 1.0, kk = s.julia ? 0.0 : 1.0;
  float r2 = dot(z, z);
  int n = 0;
  for (int i = 0; i < 256; i++) {
    if (i >= s.iters || r2 > BDM_BAIL2) break;
    float r = sqrt(r2);
    dr = BDM_POWER * pow(r, BDM_POWER - 1.0) * dr + kk * w;
    v  = bdm_df(z, v) + dc * w;
    float m = max(dr, length(v));
    if (m > 1e10) { dr /= m; v /= m; w /= m; }
    z  = bdm_f(z) + c;
    r2 = dot(z, z);
    n  = i + 1;
  }
  if (r2 <= BDM_BAIL2) return vec4(0.0, 0.0, 1.0, float(n));
  float r = sqrt(r2);
  float tone = clamp((float(n) - log(max(log(r) / log(8.0), 1e-30)) / log(BDM_POWER)) / float(s.iters), 0.0, 1.0);
  float num = 0.5 * log(r) * r * w;
  return vec4(num / max(length(v), 1e-30), num / max(dr, 1e-30), tone, float(n));
}

// Analytic normal: the gradient of the escape potential, carried by three tangent chains.
vec3 bdm_normal(vec3 p, BdmSet s) {
  vec4 z  = bdm_seed(p, s, s.w);
  vec4 sx = bdm_seed(vec3(1.0, 0.0, 0.0), s, 0.0);
  vec4 sy = bdm_seed(vec3(0.0, 1.0, 0.0), s, 0.0);
  vec4 sz = bdm_seed(vec3(0.0, 0.0, 1.0), s, 0.0);
  vec4 c  = s.julia ? s.jc : z;
  float kk = s.julia ? 0.0 : 1.0, w = 1.0;
  vec4 mx = sx, my = sy, mz = sz;
  for (int i = 0; i < 256; i++) {
    if (i >= s.iters || dot(z, z) > BDM_BAIL2) break;
    mx = bdm_df(z, mx) + kk * w * sx;
    my = bdm_df(z, my) + kk * w * sy;
    mz = bdm_df(z, mz) + kk * w * sz;
    float m = max(length(mx), max(length(my), length(mz)));
    if (m > 1e10) { mx /= m; my /= m; mz /= m; w /= m; }
    z = bdm_f(z) + c;
  }
  vec3 g = vec3(dot(z, mx), dot(z, my), dot(z, mz));
  return dot(g, g) > 1e-30 ? normalize(g) : vec3(0.0);
}

// March from ro along unit rd inside the bound sphere. Returns true on a hit at distance t.
// Mist film (insights 10-03, from their nebula film: glow += exp(-d / w) per step), rescaled to the pixel cone so it is
// a fraction of a pixel thick at every depth: a very fine mist as cheap anti-aliasing. These are side outputs of the
// last march. Set bdmFilmW > 0 to accumulate the coat film; the march itself (hit, t, tone, steps) never reads them.
float bdmFilmW = 0.0;   // film thickness in units of the pixel-cone eps; 0 = off
float bdmFilm  = 0.0;   // accumulated film along the last march (coat mode)
float bdmRmin  = 1e9;   // closest approach along the last march, in units of the pixel-cone eps (edge mode)
float bdmTmin  = 0.0;   // orbit tone at that closest approach
bool bdm_march(vec3 ro, vec3 rd, BdmSet s, BdmMarch m, out float t, out float tone, out int steps) {
  t = 0.0; tone = 0.0; steps = 0;
  bdmFilm = 0.0; bdmRmin = 1e9; bdmTmin = 0.0;
  float b = dot(ro, rd), disc = b*b - dot(ro, ro) + m.bound*m.bound;
  if (disc < 0.0) return false;
  t = max(-b - sqrt(disc), 0.0);
  float tEnd = -b + sqrt(disc), prev = 1e20;
  for (int i = 0; i < 8192; i++) {
    if (i >= m.maxSteps || t > tEnd) break;
    steps = i + 1;
    vec4 f = bdm_de(ro + rd*t, rd, s);
    float eps = max(m.hitEps, m.lod * t / (m.lens * m.resY));
    if (bdmFilmW > 0.0) bdmFilm += exp(-max(f.y, 0.0) / (bdmFilmW * eps));
    if (f.y / eps < bdmRmin) { bdmRmin = f.y / eps; bdmTmin = f.z; }
    if (f.y < eps) { tone = f.z; return true; }
    float safety = (m.adaptive && f.y < prev*0.5) ? min(m.safety, 0.15) : m.safety;
    prev = f.y;
    float step = m.leash > 0.0 ? min(f.x, f.y * m.leash) : f.y;
    t += max(step * safety, eps * 0.05);
  }
  return false;
}
