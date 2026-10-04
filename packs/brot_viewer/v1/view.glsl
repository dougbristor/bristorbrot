// view.glsl: brot_viewer glue. Camera ray, march and shading only.
// All the maths (algebra, seed, DE, normal, march) comes from the CodeT blocks pasted above this file.

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform mat3  uCamMat;      // columns: right, up, forward
uniform float uLens;

uniform vec2  uBeta, uTheta; // (sin, cos) pairs, computed on the CPU
uniform float uW;
uniform int   uAxis, uJulia, uIters;
uniform vec4  uC;

uniform int   uMaxSteps;
uniform float uBound, uSafety, uHitEps, uLod, uLeash;
uniform int   uView;        // 0 shaded, 1 normals, 2 march steps, 3 hit mask, 4 set test at c = uCamPos

out vec4 fragColor;

vec3 palette(float t) {
  return 0.55 + 0.45 * cos(6.2832 * (vec3(0.02, 0.12, 0.25) + t * vec3(0.9, 0.8, 0.7)));
}

vec3 background(vec3 rd) {
  return mix(vec3(0.035, 0.04, 0.055), vec3(0.11, 0.12, 0.15), 0.5 + 0.5 * rd.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uCamMat * vec3(uv, uLens));

  BdmSet   s = BdmSet(uBeta, uTheta, uW, uAxis == 1, uJulia == 1, uC, uIters);
  if (uView == 4) {                          // control C2: bounded orbit = interior = scalar DE of exactly 0
    fragColor = vec4(vec3(bdm_de(uCamPos, vec3(1.0, 0.0, 0.0), s).y == 0.0 ? 1.0 : 0.0), 1.0);
    return;
  }
  BdmMarch m = BdmMarch(uMaxSteps, uBound, uSafety, true, uHitEps, uLod, uLens, uRes.y, uLeash);

  float t, tone;
  int steps;
  bool hit = bdm_march(uCamPos, rd, s, m, t, tone, steps);

  if (uView == 3) { fragColor = vec4(vec3(hit ? 1.0 : 0.0), 1.0); return; }
  if (uView == 2) {
    float k = clamp(float(steps) / 300.0, 0.0, 1.0);
    fragColor = vec4(mix(vec3(0.05, 0.1, 0.3), vec3(1.0, 0.85, 0.3), sqrt(k)), 1.0);
    return;
  }
  if (!hit) { fragColor = vec4(background(rd), 1.0); return; }

  vec3 p = uCamPos + rd * t;
  vec3 n = bdm_normal(p, s);
  if (dot(n, n) == 0.0) n = -rd;            // degenerate gradient: face the camera
  if (dot(n, rd) > 0.0) n = -n;
  if (uView == 1) { fragColor = vec4(0.5 + 0.5 * n, 1.0); return; }

  vec3  light = normalize(vec3(-0.5, 0.75, -0.45));
  float diff  = max(dot(n, light), 0.0);
  float sky   = 0.5 + 0.5 * n.y;                       // hemispheric fill
  float rim   = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3  base  = palette(3.0 * tone);
  vec3  col   = base * (0.12 + 0.75 * diff + 0.22 * sky) + 0.2 * rim * vec3(0.6, 0.7, 1.0);
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
