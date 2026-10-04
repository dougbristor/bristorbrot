// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// GPU conformance for v1.glsl (or your own GLSL port with the same function names).
//
//   node conform_glsl.mjs              // checks ./v1.glsl on the GPU against vectors.json
//   node conform_glsl.mjs my_port.glsl // checks your port
//   node conform_glsl.mjs --selftest   // shows the check FAILS on planted j-roll / transposed-Jacobian ports
//
// Runs each vector through the shader in headless Chrome (WebGL2, RGBA32F readback), then hands the GPU
// results to conform.mjs's check(), so the verdicts and diagnoses are the same as for the JS/Python faces.
// The Jacobian is read back as bp_jacobian(z) * e_c for each column c, i.e. the way a shader USES it, so a
// matrix built row-for-column fails here even if its entries look right. Only n = 2 (vec3) and n = 3 (vec4)
// exist in GLSL; other n are reported as skipped. Needs playwright: `npm i playwright`, then either a local
// Chrome or `npx playwright install chromium`.
import { readFileSync } from 'node:fs';
import { check } from './conform.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('conform_glsl: playwright not found — run `npm i playwright` here or in a parent folder.'); process.exit(2); }
const V = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
const here = f => new URL(f, import.meta.url);

const PLANTS = {
  'j_roll product (rank order reversed)': s => s.replace(/a\.x\*b\.y \+ a\.y\*b\.x - b\.y\*a\.z/, 'a.x*b.y + a.y*b.x + b.y*a.z')
    .replace(/a\.x\*b\.z \+ a\.z\*b\.x \+ b\.z\*a\.y\)/, 'a.x*b.z + a.z*b.x - b.z*a.y)')
    .replace(/z\.y\*\(2\.0\*z\.x - z\.z\),\n(\s*)z\.z\*\(2\.0\*z\.x \+ z\.y\)\);/, 'z.y*(2.0*z.x + z.z),\n$1z.z*(2.0*z.x - z.y));'),
  'transposed Jacobian (rows given as columns)': s => s.replace('mat3 bp_jacobian(vec3 z) {\n  return mat3(', 'mat3 bp_jacobian(vec3 z) {\n  return transpose(mat3(')
    .replace('vec3(-2.0*z.z, -z.y,               2.0*z.x + z.y));     // d/d e2', 'vec3(-2.0*z.z, -z.y,               2.0*z.x + z.y)));    // d/d e2'),
};

function cases() {
  const out = [];
  V.square.forEach((r, i) => (r.n === 2 || r.n === 3) && out.push({ kind: 0, key: 's' + i, n: r.n, a: r.z, b: r.z }));
  V.product.forEach((r, i) => (r.n === 2 || r.n === 3) && out.push({ kind: 1, key: 'p' + i, n: r.n, a: r.a, b: r.b }));
  (V.jacobian || []).forEach((r, i) => (r.n === 2 || r.n === 3) && out.push({ kind: 2, key: 'j' + i, n: r.n, a: r.z, b: r.z }));
  return out;
}

const FS = lib => `#version 300 es
precision highp float;
${lib}
uniform int uKind, uN; uniform vec4 uA, uB; out vec4 o;
void main(){
  int c = int(gl_FragCoord.x);                                  // pixel c: result (kinds 0,1) or Jacobian column c
  if (uN == 2) {
    vec3 a = uA.xyz, b = uB.xyz, r;
    if (uKind == 0) r = bp_square(a); else if (uKind == 1) r = bp_mul(a, b);
    else { vec3 e = vec3(c == 0, c == 1, c == 2); r = bp_jacobian(a) * e; }
    o = vec4(r, bp_Jv(a, b).x * 0.0);                             // keep bp_Jv compiled in
  } else {
    vec4 a = uA, b = uB, r;
    if (uKind == 0) r = bp_square(a); else if (uKind == 1) r = bp_mul(a, b);
    else { vec4 e = vec4(c == 0, c == 1, c == 2, c == 3); r = bp_jacobian(a) * e; }
    o = r;
  }
}`;

async function gpuRun(page, lib) {
  return page.evaluate(({ fs, cs }) => {
    const cv = document.createElement('canvas'); const gl = cv.getContext('webgl2');
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return { error: 'WebGL2 + EXT_color_buffer_float unavailable' };
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    try { gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 v=vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.;gl_Position=vec4(v,0,1);}'));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); } catch (e) { return { error: 'compile: ' + e.message }; }
    gl.linkProgram(p); gl.useProgram(p);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 4, 1);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.viewport(0, 0, 4, 1);
    const U = n => gl.getUniformLocation(p, n), res = {}, px = new Float32Array(16);
    for (const c of cs) {
      const pad = v => [...v, 0, 0, 0, 0].slice(0, 4);
      gl.uniform1i(U('uKind'), c.kind); gl.uniform1i(U('uN'), c.n); gl.uniform4fv(U('uA'), pad(c.a)); gl.uniform4fv(U('uB'), pad(c.b));
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.FLOAT, px);
      const d = c.n + 1;
      if (c.kind < 2) res[c.key] = Array.from(px.slice(0, d));
      else { const m = []; for (let r = 0; r < d; r++) for (let col = 0; col < d; col++) m.push(px[col * 4 + r]); res[c.key] = m; }
    }
    return { res };
  }, { fs: FS(lib), cs: cases() });
}

function verdict(res, quiet) {
  const idx = (rows, prefix) => new Map(rows.map((r, i) => [JSON.stringify(r.z ?? [r.a, r.b]), prefix + i]));
  const S = idx(V.square, 's'), P = idx(V.product, 'p'), J = idx(V.jacobian || [], 'j');
  const look = (m, k) => { const key = m.get(k); if (!(key in res)) throw new Error('n not in GLSL'); return res[key]; };
  return check(z => look(S, JSON.stringify(z)), (a, b) => look(P, JSON.stringify([a, b])), quiet,
    z => look(J, JSON.stringify(z)))[0] === 'PASS';
}

const arg = process.argv[2];
const launchOpts = { headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch({ ...launchOpts, channel: 'chrome' })  // installed Chrome first (real GPU),
  .catch(() => chromium.launch(launchOpts));                                 // else playwright's bundled chromium
const page = await browser.newPage(); await page.goto('about:blank');
let code = 0;
try {
  if (arg === '--selftest') {
    const lib = readFileSync(here('./v1.glsl'), 'utf8');
    const arms = [['v1.glsl as shipped', lib, true], ...Object.entries(PLANTS).map(([n, f]) => [n, f(lib), false])];
    let allOk = true;
    for (const [name, src, want] of arms) {
      if (!want && src === lib) { console.log(`[BAD] ${name}: plant did not apply`); allOk = false; continue; }
      const g = await gpuRun(page, src); if (g.error) { console.log(`[BAD] ${name}: ${g.error}`); allOk = false; continue; }
      const ok = verdict(g.res, true);
      const good = ok === want; allOk &&= good;
      console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(allOk ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED'); code = allOk ? 0 : 1;
  } else {
    const lib = readFileSync(arg ? arg : here('./v1.glsl'), 'utf8');
    const g = await gpuRun(page, lib);
    if (g.error) { console.log('ERROR', g.error); code = 2; }
    else { const ok = verdict(g.res, false); console.log(ok ? 'GLSL PASS' : 'GLSL FAIL'); code = ok ? 0 : 1; }
  }
} finally { await browser.close(); }
process.exit(code);
