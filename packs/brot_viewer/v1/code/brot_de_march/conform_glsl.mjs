// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// GPU conformance for brot_de_march v1.glsl, against vectors.json from reference.py (double precision).
//
//   node conform_glsl.mjs              // checks ./v1.glsl with four maps: B3 square (bristor_product),
//                                      // (zz)z and z(zz) (bristor_cube), quaternion square (quaternion_product)
//   node conform_glsl.mjs my_port.glsl // checks your port (same function names)
//   node conform_glsl.mjs --selftest   // shows the check FAILS on planted mistakes
//
// Each case runs on the GPU in headless Chrome (WebGL2, RGBA32F readback): directional and scalar DE, the analytic
// normal, and a full march (hit, t, steps). Tolerances are in vectors.json. Only well-conditioned cases are in the
// vectors, so a float32 shader can be held to them. Needs playwright.
import { readFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('conform_glsl: playwright not found — run `npm i playwright` here or in a parent folder.'); process.exit(2); }
const here = f => new URL(f, import.meta.url);
const V = JSON.parse(readFileSync(here('./vectors.json')));
const ALGEBRA = ['../bristor_product/v1.glsl', '../bristor_cube/v1.glsl', '../quaternion_product/v1.glsl'].map(f => readFileSync(here(f), 'utf8')).join('\n');

// The maps, assembled from the algebra blocks. A port supplies the same three names.
const MAPS = {
  square: `vec4 bdm_f(vec4 z) { return bp_square(z); }\nvec4 bdm_df(vec4 z, vec4 v) { return bp_Jv(z, v); }\nconst float BDM_POWER = 2.0;`,
  cube_l: `vec4 bdm_f(vec4 z) { return bc_cubeL(z); }\nvec4 bdm_df(vec4 z, vec4 v) { return bc_JvL(z, v); }\nconst float BDM_POWER = 3.0;`,
  cube_r: `vec4 bdm_f(vec4 z) { return bc_cubeR(z); }\nvec4 bdm_df(vec4 z, vec4 v) { return bc_JvR(z, v); }\nconst float BDM_POWER = 3.0;`,
  qsquare: `vec4 bdm_f(vec4 z) { return qp_square(z); }\nvec4 bdm_df(vec4 z, vec4 v) { return qp_Jv(z, v); }\nconst float BDM_POWER = 2.0;`,
};

const PLANTS = {
  'Julia carries +dc (the Mandelbrot derivative)': { lib: s => s.replace('vec4 dc = s.julia ? vec4(0.0) : v;', 'vec4 dc = v;')
    .replace('float dr = 1.0, w = 1.0, kk = s.julia ? 0.0 : 1.0;', 'float dr = 1.0, w = 1.0, kk = 1.0;') },
  'Julia normal carries +dc': { lib: s => s.replace('float kk = s.julia ? 0.0 : 1.0, w = 1.0;', 'float kk = 1.0, w = 1.0;') },
  'beta seed swapped (cos on e1, sin on e2)': { lib: s => s.replace('vec4(q.x, s.beta.x*q.y + s.beta.y*w, s.beta.y*q.y - s.beta.x*w, q.z)',
    'vec4(q.x, s.beta.y*q.y + s.beta.x*w, s.beta.x*q.y - s.beta.y*w, q.z)') },
  'w offset along the section instead of across it': { lib: s => s.replace('vec4(q.x, s.beta.x*q.y + s.beta.y*w, s.beta.y*q.y - s.beta.x*w, q.z)',
    'vec4(q.x, s.beta.x*(q.y + w), s.beta.y*(q.y + w), q.z)') },
  'hit tested on the directional DE': { lib: s => s.replace('if (f.y < eps) { tone = f.z; return true; }', 'if (f.x < eps) { tone = f.z; return true; }') },
  'leash ignored (pure directional step)': { lib: s => s.replace('float step = m.leash > 0.0 ? min(f.x, f.y * m.leash) : f.y;', 'float step = m.leash > 0.0 ? f.x : f.y;') },
  'derivative transposed (square map)': { map: { square: m => m.replace('return bp_Jv(z, v);', 'return transpose(bp_jacobian(z)) * v;') } },
  'Bristorian square in the quaternion map': { map: { qsquare: m => m.replace('qp_square(z)', 'bp_square(z)').replace('qp_Jv(z, v)', 'bp_Jv(z, v)') } },
  'brackets exchanged (cube maps)': { map: { cube_l: m => m.replaceAll('bc_cubeL', 'bc_cubeR').replaceAll('bc_JvL', 'bc_JvR'),
    cube_r: m => m.replaceAll('bc_cubeR', 'bc_cubeL').replaceAll('bc_JvR', 'bc_JvL') } },
};

const FS = (lib, map) => `#version 300 es
precision highp float;
precision highp int;
${ALGEBRA}
${map}
${lib}
uniform int uMode, uIters, uJulia, uAxis, uMaxSteps, uAdaptive;
uniform vec3 uP, uRd, uRo;
uniform vec4 uJc;
uniform vec2 uBeta, uTheta;
uniform float uW, uBound, uSafety, uHitEps, uLod, uLens, uResY, uLeash;
out vec4 o;
void main() {
  int px = int(gl_FragCoord.x);
  BdmSet s = BdmSet(uBeta, uTheta, uW, uAxis == 1, uJulia == 1, uJc, uIters);
  if (uMode == 0) {
    o = px == 0 ? bdm_de(uP, uRd, s) : vec4(bdm_normal(uP, s), 0.0);
  } else {
    BdmMarch m = BdmMarch(uMaxSteps, uBound, uSafety, uAdaptive == 1, uHitEps, uLod, uLens, uResY, uLeash);
    float t, tone; int steps; bool hit = bdm_march(uRo, uRd, s, m, t, tone, steps);
    o = vec4(hit ? 1.0 : 0.0, t, float(steps), tone);
  }
}`;

async function gpuRun(page, sources) {
  return page.evaluate(({ sources, V }) => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return { error: 'WebGL2 + EXT_color_buffer_float unavailable' };
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const vs = sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 v=vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.;gl_Position=vec4(v,0,1);}');
    const progs = {};
    for (const [k, fs] of Object.entries(sources)) {
      const p = gl.createProgram(); gl.attachShader(p, vs);
      try { gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); } catch (e) { return { error: `compile (${k}): ` + e.message }; }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { error: 'link: ' + gl.getProgramInfoLog(p) };
      progs[k] = p;
    }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 2, 1);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.viewport(0, 0, 2, 1);
    const px = new Float32Array(8);
    const use = S => { const p = progs[S.map]; gl.useProgram(p); const U = n => gl.getUniformLocation(p, n);
      gl.uniform2f(U('uBeta'), Math.sin(S.beta), Math.cos(S.beta)); gl.uniform2f(U('uTheta'), Math.sin(S.theta), Math.cos(S.theta));
      gl.uniform1f(U('uW'), S.w); gl.uniform1i(U('uAxis'), S.axis ? 1 : 0); gl.uniform1i(U('uJulia'), S.julia ? 1 : 0);
      gl.uniform4fv(U('uJc'), S.jc); gl.uniform1i(U('uIters'), S.iters); return U; };
    const draw = () => { gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.FLOAT, px); return Array.from(px); };
    const de = V.de.map(r => { const U = use(r.set); gl.uniform1i(U('uMode'), 0); gl.uniform3fv(U('uP'), r.p); gl.uniform3fv(U('uRd'), r.rd); return draw(); });
    const march = V.march.map(r => { const M = r.march, U = use(r.set); gl.uniform1i(U('uMode'), 1);
      gl.uniform3fv(U('uRo'), r.ro); gl.uniform3fv(U('uRd'), r.rd); gl.uniform1i(U('uMaxSteps'), M.maxSteps); gl.uniform1i(U('uAdaptive'), M.adaptive ? 1 : 0);
      for (const k of ['bound', 'safety', 'hitEps', 'lod', 'lens', 'resY', 'leash']) gl.uniform1f(U('u' + k[0].toUpperCase() + k.slice(1)), M[k]);
      return draw(); });
    return { de, march };
  }, { sources, V });
}

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

function verdict(g, quiet) {
  const T = V.tol, worst = { de: 0, normal: 0, t: 0, steps: 0 }, fails = [];
  g.de.forEach((o, i) => {
    const r = V.de[i], e = Math.max(rel(o[0], r.de_dir), rel(o[1], r.de_scalar));
    const nd = Math.max(...r.normal.map((x, k) => Math.abs(x - o[4 + k])));
    worst.de = Math.max(worst.de, e); worst.normal = Math.max(worst.normal, nd);
    const tag = `${r.set.map} ${r.set.julia ? 'Julia' : 'M'} n=${r.n}`;
    if (!(e <= T.de_rel)) fails.push(`de[${i}] ${tag}: GPU (${o[0].toPrecision(6)}, ${o[1].toPrecision(6)}) vs (${r.de_dir.toPrecision(6)}, ${r.de_scalar.toPrecision(6)})`);
    if (!(nd <= T.normal)) fails.push(`normal[${i}] ${tag}: off by ${nd.toFixed(4)}`);
  });
  g.march.forEach((o, i) => {
    const r = V.march[i], hit = o[0] > 0.5, dt = Math.abs(o[1] - r.t), ds = Math.abs(o[2] - r.steps);
    if (r.hit) worst.t = Math.max(worst.t, dt); worst.steps = Math.max(worst.steps, ds);
    if (hit !== r.hit || (r.hit && !(dt <= T.march_t)) || !(ds <= T.march_steps))
      fails.push(`march[${i}] ${r.set.map} leash ${r.march.leash}: GPU hit=${hit} t=${o[1].toFixed(4)} steps=${o[2]} vs hit=${r.hit} t=${r.t.toFixed(4)} steps=${r.steps}`);
  });
  if (!quiet) {
    const maps = [...new Set(V.de.map(r => r.set.map))].join(', ');
    console.log(`  DE (directional + scalar): ${V.de.length} cases over ${maps}, max rel diff ${worst.de.toExponential(2)} (tol ${T.de_rel})`);
    console.log(`  normal: ${V.de.length} cases, max component diff ${worst.normal.toExponential(2)} (tol ${T.normal})`);
    console.log(`  march: ${V.march.length} rays (${V.march.filter(r => r.hit).length} hit), max |dt| ${worst.t.toExponential(2)} (tol ${T.march_t}), max |dsteps| ${worst.steps} (tol ${T.march_steps})`);
    for (const f of fails.slice(0, 8)) console.log('  FAIL ' + f);
  }
  return fails.length === 0;
}

const sourcesFor = (lib, plant = {}) => Object.fromEntries(Object.entries(MAPS).map(([k, m]) =>
  [k, FS(plant.lib ? plant.lib(lib) : lib, plant.map?.[k] ? plant.map[k](m) : m)]));

const arg = process.argv[2];
const launchOpts = { headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch({ ...launchOpts, channel: 'chrome' }).catch(() => chromium.launch(launchOpts));
const page = await browser.newPage(); await page.goto('about:blank');
let code = 0;
try {
  if (arg === '--selftest') {
    const lib = readFileSync(here('./v1.glsl'), 'utf8'), base = sourcesFor(lib);
    const arms = [['v1.glsl as shipped', base, true], ...Object.entries(PLANTS).map(([n, pl]) => [n, sourcesFor(lib, pl), false])];
    let allOk = true;
    for (const [name, srcs, want] of arms) {
      if (!want && Object.keys(srcs).every(k => srcs[k] === base[k])) { console.log(`[BAD] ${name}: plant did not apply`); allOk = false; continue; }
      const g = await gpuRun(page, srcs); if (g.error) { console.log(`[BAD] ${name}: ${g.error}`); allOk = false; continue; }
      const ok = verdict(g, true), good = ok === want; allOk &&= good;
      console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(allOk ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED'); code = allOk ? 0 : 1;
  } else {
    const g = await gpuRun(page, sourcesFor(readFileSync(arg ? arg : here('./v1.glsl'), 'utf8')));
    if (g.error) { console.log('ERROR', g.error); code = 2; }
    else { const ok = verdict(g, false); console.log(ok ? 'GLSL PASS' : 'GLSL FAIL'); code = ok ? 0 : 1; }
  }
} finally { await browser.close(); }
process.exit(code);
