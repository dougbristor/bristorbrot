// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// GPU conformance for bristor_cube v1.glsl (pasted after ../bristor_product/v1.glsl), against vectors.json.
//
//   node conform_glsl.mjs              // checks ./v1.glsl
//   node conform_glsl.mjs my_port.glsl // checks your port (same function names)
//   node conform_glsl.mjs --selftest   // shows the check FAILS on planted mistakes
//
// n = 2 (vec3) and n = 3 (vec4) only; other n are skipped. Needs playwright.
import { readFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('conform_glsl: playwright not found — run `npm i playwright` here or in a parent folder.'); process.exit(2); }
const here = f => new URL(f, import.meta.url);
const V = JSON.parse(readFileSync(here('./vectors.json')));
const ALGEBRA = readFileSync(here('../bristor_product/v1.glsl'), 'utf8');
const ROWS = V.rows.filter(r => r.n === 2 || r.n === 3);
const KEYS = ['cube_l', 'cube_r', 'jv_l', 'jv_r'];
const TOL = 1e-4;   // float32 on values up to ~40

const PLANTS = {
  'brackets exchanged': s => s.replaceAll('bc_cubeL(vec', 'bc_cubeX(vec').replaceAll('bc_cubeR(vec', 'bc_cubeL(vec').replaceAll('bc_cubeX(vec', 'bc_cubeR(vec'),
  'derivative drops the (z z) v term': s => s.replaceAll(' + bp_mul(bp_square(z), v); }', '; }'),
  'cube from the square alone (R = L)': s => s.replaceAll('return bp_mul(z, bp_square(z));', 'return bp_mul(bp_square(z), z);'),
};

const FS = lib => `#version 300 es
precision highp float;
${ALGEBRA}
${lib}
uniform int uN; uniform vec4 uZ, uV; out vec4 o;
void main() {
  int k = int(gl_FragCoord.x);
  if (uN == 2) { vec3 z = uZ.xyz, v = uV.xyz;
    vec3 r = k == 0 ? bc_cubeL(z) : k == 1 ? bc_cubeR(z) : k == 2 ? bc_JvL(z, v) : bc_JvR(z, v); o = vec4(r, 0.0);
  } else { vec4 z = uZ, v = uV;
    o = k == 0 ? bc_cubeL(z) : k == 1 ? bc_cubeR(z) : k == 2 ? bc_JvL(z, v) : bc_JvR(z, v); }
}`;

async function gpuRun(page, fs) {
  return page.evaluate(({ fs, rows }) => {
    const gl = document.createElement('canvas').getContext('webgl2');
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
    const U = n => gl.getUniformLocation(p, n), px = new Float32Array(16), pad = v => [...v, 0, 0, 0, 0].slice(0, 4);
    return { res: rows.map(r => { gl.uniform1i(U('uN'), r.n); gl.uniform4fv(U('uZ'), pad(r.z)); gl.uniform4fv(U('uV'), pad(r.v));
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.FLOAT, px);
      return [0, 1, 2, 3].map(k => Array.from(px.slice(4 * k, 4 * k + r.n + 1))); }) };
  }, { fs, rows: ROWS });
}

function verdict(res, quiet) {
  let worst = 0; const fails = [];
  res.forEach((o, i) => KEYS.forEach((k, j) => {
    const d = Math.max(...o[j].map((x, c) => Math.abs(x - ROWS[i][k][c]))); worst = Math.max(worst, d);
    if (!(d <= TOL)) fails.push(`row ${i} (n=${ROWS[i].n}) ${k}`);
  }));
  if (!quiet) { console.log(`  ${ROWS.length} rows (n=2,3) x 4 outputs, max |diff| ${worst.toExponential(2)} (tol ${TOL}); skipped n>3: ${V.rows.length - ROWS.length}`);
    for (const f of fails.slice(0, 4)) console.log('  FAIL ' + f); }
  return fails.length === 0;
}

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
      const g = await gpuRun(page, FS(src)); if (g.error) { console.log(`[BAD] ${name}: ${g.error}`); allOk = false; continue; }
      const ok = verdict(g.res, true), good = ok === want; allOk &&= good;
      console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(allOk ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED'); code = allOk ? 0 : 1;
  } else {
    const g = await gpuRun(page, FS(readFileSync(arg ? arg : here('./v1.glsl'), 'utf8')));
    if (g.error) { console.log('ERROR', g.error); code = 2; }
    else { const ok = verdict(g.res, false); console.log(ok ? 'GLSL PASS' : 'GLSL FAIL'); code = ok ? 0 : 1; }
  }
} finally { await browser.close(); }
process.exit(code);
