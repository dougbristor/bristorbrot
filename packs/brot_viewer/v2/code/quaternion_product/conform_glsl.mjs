// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// GPU conformance for quaternion_product v1.glsl, against vectors.json (Hamilton table values).
//
//   node conform_glsl.mjs              // checks ./v1.glsl
//   node conform_glsl.mjs my_port.glsl // checks your port (same function names)
//   node conform_glsl.mjs --selftest   // shows the check FAILS on planted mistakes
// Needs playwright.
import { readFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('conform_glsl: playwright not found — run `npm i playwright` here or in a parent folder.'); process.exit(2); }
const here = f => new URL(f, import.meta.url);
const V = JSON.parse(readFileSync(here('./vectors.json')));
const KEYS = ['mul', 'square', 'jv'], TOL = 1e-5;

const PLANTS = {
  'operands swapped (i·j = −k)': s => s.replace('cross(a.yzw, b.yzw)', 'cross(b.yzw, a.yzw)'),
  'commutative product (cross term dropped)': s => s.replace(' + cross(a.yzw, b.yzw));', ');'),
  'real part in w': s => s.replace('vec4 qp_square(vec4 z) { return vec4(z.x*z.x - dot(z.yzw, z.yzw), 2.0*z.x*z.yzw); }',
    'vec4 qp_square(vec4 z) { return vec4(2.0*z.w*z.xyz, z.w*z.w - dot(z.xyz, z.xyz)); }'),
};

const FS = lib => `#version 300 es
precision highp float;
${lib}
uniform vec4 uA, uB, uV; out vec4 o;
void main() { int k = int(gl_FragCoord.x); o = k == 0 ? qp_mul(uA, uB) : k == 1 ? qp_square(uA) : qp_Jv(uA, uV); }`;

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
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 3, 1);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.viewport(0, 0, 3, 1);
    const U = n => gl.getUniformLocation(p, n), px = new Float32Array(12);
    return { res: rows.map(r => { gl.uniform4fv(U('uA'), r.a); gl.uniform4fv(U('uB'), r.b); gl.uniform4fv(U('uV'), r.v);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 3, 1, gl.RGBA, gl.FLOAT, px);
      return [0, 1, 2].map(k => Array.from(px.slice(4 * k, 4 * k + 4))); }) };
  }, { fs, rows: V.rows });
}

function verdict(res, quiet) {
  let worst = 0; const fails = [];
  res.forEach((o, i) => KEYS.forEach((k, j) => {
    const d = Math.max(...o[j].map((x, c) => Math.abs(x - V.rows[i][k][c]))); worst = Math.max(worst, d);
    if (!(d <= TOL)) fails.push(`row ${i} ${k}`);
  }));
  if (!quiet) { console.log(`  ${V.rows.length} rows x 3 outputs, max |diff| ${worst.toExponential(2)} (tol ${TOL})`); for (const f of fails.slice(0, 4)) console.log('  FAIL ' + f); }
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
