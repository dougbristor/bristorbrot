// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// GPU conformance for bdm_shadow v1.glsl, against vectors.json from reference.py (double precision).
//
//   node conform_glsl.mjs              // checks ./v1.glsl on five maps (b_brot, both chi_brot brackets, q², q³)
//   node conform_glsl.mjs my_port.glsl // checks your port (same struct and function names)
//   node conform_glsl.mjs --selftest   // shows the check FAILS on planted mistakes
//
// Each case is one shadow ray from a surface point brot_de_march's reference found: live (last-step, hard
// threshold, IQ) and refine samples. The GPU's light value, how the ray ended, and its last clearance are compared.
// Only well-conditioned cases are in the vectors. Needs playwright, and the sibling block folders.
import { readFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('conform_glsl: playwright not found — run `npm i playwright` here or in a parent folder.'); process.exit(2); }
const here = f => new URL(f, import.meta.url);

const V = JSON.parse(readFileSync(here('./vectors.json')));
const BASE = ['../bristor_product/v1.glsl', '../bristor_cube/v1.glsl', '../quaternion_product/v1.glsl'].map(f => readFileSync(here(f), 'utf8')).join('\n');
const MARCH = readFileSync(here('../brot_de_march/v1.glsl'), 'utf8');

const mapSrc = (f, df, p) => `vec4 bdm_f(vec4 z) { return ${f}; }\nvec4 bdm_df(vec4 z, vec4 v) { return ${df}; }\nconst float BDM_POWER = ${p}.0;`;
const MAPS = {
  square: mapSrc('bp_square(z)', 'bp_Jv(z, v)', 2),
  cube_l: mapSrc('bc_cubeL(z)', 'bc_JvL(z, v)', 3),
  cube_r: mapSrc('bc_cubeR(z)', 'bc_JvR(z, v)', 3),
  qsquare: mapSrc('qp_square(z)', 'qp_Jv(z, v)', 2),
  qcube: mapSrc('qp_mul(qp_square(z), z)', 'qp_mul(qp_Jv(z, v), z) + qp_mul(qp_square(z), v)', 3),
};

const PLANTS = {
  'IQ in place of the last-step estimator': s => s.replace('if (o.est == 1) {', 'if (false) {'),
  'escaped ray read as dark': s => s.replace('if (bdsEnd == 0) return 1.0;', 'if (bdsEnd == 0) return 0.0;'),
  'no offset along the normal': s => s.replace('vec3 org = p + n * (o.bias * epsc);', 'vec3 org = p;'),
  'light disk ignored (refine)': s => s.replace('ld = normalize(ld + L.tanR * (L.disk.x * a + L.disk.y * b));', ''),
  'directional DE instead of scalar': s => s.replace('float d = bdm_de(q, ld, s).y;', 'float d = bdm_de(q, ld, s).x;'),
  'threshold not softened': s => s.replace('float w = o.th * o.soft;', 'float w = 0.0;'),
};

const FS = (lib, map) => `#version 300 es
precision highp float;
precision highp int;
${BASE}
${map}
${MARCH}
${lib}
uniform int uIters, uJulia, uAxis, uHard, uSteps, uEst;
uniform vec3 uP, uN, uDir;
uniform vec4 uJc;
uniform vec2 uBeta, uTheta, uDisk;
uniform float uW, uEpsc, uTanR, uBias, uTh, uSoft, uHitEps, uBound;
out vec4 o;
void main() {
  BdmSet s = BdmSet(uBeta, uTheta, uW, uAxis == 1, uJulia == 1, uJc, uIters);
  float v = bds_shadow(uP, uN, uEpsc, s, BdsLight(uDir, uTanR, uHard == 1, uDisk),
                       BdsShadow(uSteps, uBias, uEst, uTh, uSoft, uHitEps, uBound));
  o = vec4(v, float(bdsEnd), bdsLast, 0.0);
}`;

async function gpuRun(page, sources) {
  return page.evaluate(({ sources, rows }) => {
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
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 1, 1);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.viewport(0, 0, 1, 1);
    const px = new Float32Array(4);
    return { out: rows.map(r => {
      const S = r.set, L = r.light, O = r.opts, p = progs[S.map]; gl.useProgram(p); const U = n => gl.getUniformLocation(p, n);
      gl.uniform2f(U('uBeta'), Math.sin(S.beta), Math.cos(S.beta)); gl.uniform2f(U('uTheta'), Math.sin(S.theta), Math.cos(S.theta));
      gl.uniform1f(U('uW'), S.w); gl.uniform1i(U('uAxis'), S.axis ? 1 : 0); gl.uniform1i(U('uJulia'), S.julia ? 1 : 0);
      gl.uniform4fv(U('uJc'), S.jc); gl.uniform1i(U('uIters'), S.iters);
      gl.uniform3fv(U('uP'), r.p); gl.uniform3fv(U('uN'), r.n); gl.uniform1f(U('uEpsc'), r.epsc);
      gl.uniform3fv(U('uDir'), L.dir); gl.uniform1f(U('uTanR'), L.tanR); gl.uniform1i(U('uHard'), L.hard ? 1 : 0); gl.uniform2fv(U('uDisk'), L.disk);
      gl.uniform1i(U('uSteps'), O.steps); gl.uniform1f(U('uBias'), O.bias); gl.uniform1i(U('uEst'), O.est); gl.uniform1f(U('uTh'), O.th);
      gl.uniform1f(U('uSoft'), O.soft); gl.uniform1f(U('uHitEps'), O.hitEps); gl.uniform1f(U('uBound'), O.bound);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px); return Array.from(px);
    }) };
  }, { sources, rows: V.shadow });
}

function verdict(g, quiet) {
  const T = V.tol, fails = [];
  let worst = 0, worstLast = 0;
  g.out.forEach((o, i) => {
    const r = V.shadow[i], dv = Math.abs(o[0] - r.value), end = Math.round(o[1]);
    const dl = r.end === 2 ? Math.abs(o[2] - r.last) / Math.max(Math.abs(r.last), 1) : 0;
    worst = Math.max(worst, dv); worstLast = Math.max(worstLast, dl);
    if (!(dv <= T.light) || end !== r.end || !(dl <= T.last_rel))
      fails.push(`shadow[${i}] ${r.set.map} ${r.mode}: GPU light ${o[0].toFixed(3)} end ${end} last ${o[2].toPrecision(4)} vs ${r.value.toFixed(3)} end ${r.end} last ${r.last.toPrecision(4)}`);
  });
  if (!quiet) {
    const ends = [0, 1, 2].map(e => V.shadow.filter(r => r.end === e).length).join('/');
    console.log(`  shadow: ${V.shadow.length} rays over ${Object.keys(MAPS).join(', ')} (escaped/hit/ran out ${ends}), max |light diff| ${worst.toExponential(2)} (tol ${T.light}), max last rel ${worstLast.toExponential(2)} (tol ${T.last_rel}), ends exact`);
    for (const f of fails.slice(0, 8)) console.log('  FAIL ' + f);
  }
  return fails.length === 0;
}

const sourcesFor = lib => Object.fromEntries(Object.entries(MAPS).map(([k, m]) => [k, FS(lib, m)]));
const arg = process.argv[2];
const launchOpts = { headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch({ ...launchOpts, channel: 'chrome' }).catch(() => chromium.launch(launchOpts));
const page = await browser.newPage(); await page.goto('about:blank');
let code = 0;
try {
  if (arg === '--selftest') {
    const lib = readFileSync(here('./v1.glsl'), 'utf8');
    const arms = [['v1.glsl as shipped', lib, true], ...Object.entries(PLANTS).map(([n, f]) => [n, f(lib), false])];
    let allOk = true;
    for (const [name, src, want] of arms) {
      if (!want && src === lib) { console.log(`[BAD] ${name}: plant did not apply`); allOk = false; continue; }
      const g = await gpuRun(page, sourcesFor(src)); if (g.error) { console.log(`[BAD] ${name}: ${g.error}`); allOk = false; continue; }
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
