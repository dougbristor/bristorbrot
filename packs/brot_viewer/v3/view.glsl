// view.glsl: brot_viewer glue. Camera ray, shading, mist and the march aux for the post pass.
// All the maths (algebra, seed, DE, normal, march, shadow) comes from the CodeT blocks pasted above this file.

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform mat3  uCamMat;      // columns: right, up, forward
uniform float uLens;
uniform vec2  uJitter;      // sub-pixel offset of the primary ray (still refine)

uniform vec2  uBeta, uTheta; // (sin, cos) pairs, computed on the CPU
uniform float uW;
uniform int   uAxis, uJulia, uIters;
uniform int   uJK;          // 1: force the β roll j→k (brot_de_march bdmJK) for either family
uniform vec4  uC;

uniform int   uMaxSteps;
uniform float uBound, uSafety, uHitEps, uLod, uLeash;
uniform int   uView;        // 0 shaded, 1 normals, 2 march steps, 3 hit mask, 4 set test at c = uCamPos

uniform vec3  uLightDir;    // key light, unit, in the body's frame (the CPU carries it there with the spin)
uniform int   uShadow;      // 0 off, 1 on
uniform int   uShadowHard;  // 1 = one refine sample: a hard shadow toward uLightDisk
uniform vec2  uLightDisk;
uniform float uLightTan, uShadowBias, uShadowTh, uShadowSoft;
uniform int   uShadowSteps;

uniform float uMist, uMistW, uMistCoat;
uniform int   uMistMode;    // 0 coat (film on every step), 1 edge (near misses), 2 edge + coat dusting

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragAux;    // for the post pass: R steps & 255, G steps >> 8, B hit

vec3 palette(float t) {
  return 0.55 + 0.45 * cos(6.2832 * (vec3(0.02, 0.12, 0.25) + t * vec3(0.9, 0.8, 0.7)));
}

vec3 background(vec3 rd) {
  return mix(vec3(0.035, 0.04, 0.055), vec3(0.11, 0.12, 0.15), 0.5 + 0.5 * rd.y);
}

void main() {
  // For a Julia set the β section IS the window rolling j→k, so β = 0 is the B2 jbrot (real, i, j) (insights + Doug 10-07).
  // The Mandelbrot β section is unchanged. jk=1 in a link still forces the roll for either.
  bdmJK = uJK == 1 || (uJulia == 1 && uAxis == 0);
  BdmSet s = BdmSet(uBeta, uTheta, uW, uAxis == 1, uJulia == 1, uC, uIters);
  if (uView == 4) {                          // control C2: bounded orbit = interior = scalar DE of exactly 0
    fragColor = vec4(vec3(bdm_de(uCamPos, vec3(1.0, 0.0, 0.0), s).y == 0.0 ? 1.0 : 0.0), 1.0);
    return;
  }
  BdmMarch m = BdmMarch(uMaxSteps, uBound, uSafety, true, uHitEps, uLod, uLens, uRes.y, uLeash);

  vec2 uv = (gl_FragCoord.xy + uJitter - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uCamMat * vec3(uv, uLens));
  float t, tone;
  int steps;
  bdmFilmW = (uMist > 0.0 || (uMistMode == 2 && uMistCoat > 0.0)) ? uMistW : 0.0;
  bool hit = bdm_march(uCamPos, rd, s, m, t, tone, steps);
  fragAux = vec4(float(steps % 256) / 255.0, float(steps / 256) / 255.0, hit ? 1.0 : 0.0, 1.0);

  if (uView == 3) { fragColor = vec4(vec3(hit ? 1.0 : 0.0), 1.0); return; }
  if (uView == 2) {
    float k = clamp(float(steps) / 300.0, 0.0, 1.0);
    fragColor = vec4(mix(vec3(0.05, 0.1, 0.3), vec3(1.0, 0.85, 0.3), sqrt(k)), 1.0);
    return;
  }

  // Mist (brot_de_march's film side outputs): coat, a pale film every step gathers near the surface (grazing rays take
  // more steps, so gather more); edge, near misses only, fading over uMistW pixels, in the surface's own grazing tone.
  vec3  coatCol = vec3(0.62, 0.66, 0.74);
  float coatA   = uMistMode == 0 ? 1.0 - exp(-uMist * bdmFilm)
                : uMistMode == 2 ? 1.0 - exp(-uMistCoat * bdmFilm) : 0.0;
  vec3  edgeCol = palette(3.0 * bdmTmin) * 0.55;
  float edgeA   = (uMistMode != 0 && !hit && uMist > 0.0) ? clamp(uMist, 0.0, 1.0) * exp(-max(bdmRmin - 1.0, 0.0) / uMistW) : 0.0;

  if (!hit) {
    if (coatA <= 0.0 && edgeA <= 0.0) { fragColor = vec4(background(rd), 1.0); return; }   // no mist: untouched
    vec3 bg = pow(background(rd), vec3(2.2));            // background() is display-space; blend in linear
    if (coatA > 0.0) bg = mix(bg, coatCol, coatA);
    if (edgeA > 0.0) bg = mix(bg, edgeCol, edgeA);
    fragColor = vec4(pow(bg, vec3(0.4545)), 1.0);
    return;
  }

  vec3 p = uCamPos + rd * t;
  vec3 n = bdm_normal(p, s);
  if (dot(n, n) == 0.0) n = -rd;            // degenerate gradient: face the camera
  if (dot(n, rd) > 0.0) n = -n;
  if (uView == 1) { fragColor = vec4(0.5 + 0.5 * n, 1.0); return; }

  vec3  light = uLightDir;
  float diff  = max(dot(n, light), 0.0);
  if (uShadow == 1 && diff > 0.0) {
    float epsc = max(uHitEps, uLod * t / (uLens * uRes.y));   // the camera ray's own hit tolerance at this depth
    diff *= bds_shadow(p, n, epsc, s, BdsLight(light, uLightTan, uShadowHard == 1, uLightDisk),
                       BdsShadow(uShadowSteps, uShadowBias, 1, uShadowTh, uShadowSoft, uHitEps, uBound));
  }
  float sky   = 0.5 + 0.5 * n.y;                       // hemispheric fill
  float rim   = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3  base  = palette(3.0 * tone);
  vec3  col   = base * (0.12 + 0.75 * diff + 0.22 * sky) + 0.2 * rim * vec3(0.6, 0.7, 1.0);
  if (coatA > 0.0) col = mix(col, coatCol, coatA);
  if (edgeA > 0.0) col = mix(col, edgeCol, edgeA);
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
