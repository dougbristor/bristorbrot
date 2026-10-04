// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// GPU conformance for edge_post v1.glsl, against vectors.json from reference.py (double precision).
//
//   node conform_glsl.mjs              // checks ./v1.glsl: all five masks over the synthetic frame
//   node conform_glsl.mjs my_port.glsl // checks your port (same function name and signature)
//   node conform_glsl.mjs --selftest   // shows the check FAILS on planted mistakes
//
// The frame is uploaded as RGBA8 (LINEAR, CLAMP_TO_EDGE), the way a viewer holds it, and filtered into an RGBA32F
// target. Per mask: the selected pixels must match (exactly), the selected pixels' colour within tol (bilinear
// filtering on the GPU has limited sub-texel precision), and every other pixel must come back byte-exact.
import { readFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('conform_glsl: playwright not found — run `npm i playwright` here or in a parent folder.'); process.exit(2); }
const here = f => new URL(f, import.meta.url);
const V = JSON.parse(readFileSync(here('./vectors.json')));

const FS = lib => `#version 300 es
precision highp float;
precision highp int;
${lib}
uniform sampler2D uCol, uAux;
uniform vec2 uRes;
uniform int uMask;
uniform float uStepJump;
out vec4 o;
void main() {
  bool edge;
  vec3 c = ep_filter(uCol, uAux, ivec2(gl_FragCoord.xy), uRes, uMask, uStepJump, edge);
  o = vec4(c, edge ? 1.0 : 0.0);
}`;

const PLANTS = {
  'blend along the edge normal': s => s.replace('dir = clamp(dir /', 'dir = vec2(-dir.y, dir.x);\n  dir = clamp(dir /'),
  'step high byte ignored': s => s.replace('+ 256.0 * floor(a.g * 255.0 + 0.5)', ''),
  'hit change ignored': s => s.replace('bool stepEdge = jump > stepJump || hitChange;', 'bool stepEdge = jump > stepJump;'),
  'both mask as either': s => s.replace('(lumaEdge && stepEdge)', '(lumaEdge || stepEdge)'),
  'luma threshold 4x too high': s => s.replace('max(0.0312, 0.125 * hi)', 'max(0.125, 0.5 * hi)'),
  'second tap pair dropped': s => s.replace('0.5 * rgbA + 0.25 * (texture(col, uv - dir * 0.5).rgb + texture(col, uv + dir * 0.5).rgb)', 'rgbA'),
};

async function gpuRun(page, fs) {
  return page.evaluate(({ fs, V }) => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return { error: 'WebGL2 + EXT_color_buffer_float unavailable' };
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    try {
      gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 v=vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.;gl_Position=vec4(v,0,1);}'));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    } catch (e) { return { error: 'compile: ' + e.message }; }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { error: 'link: ' + gl.getProgramInfoLog(p) };
    const { w, h } = V;
    const upload = (unit, bytes, filter) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(bytes.flat()));
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    };
    upload(0, V.col, gl.LINEAR); upload(1, V.aux, gl.NEAREST);
    const out = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, out); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0); gl.viewport(0, 0, w, h);
    gl.useProgram(p); const U = n => gl.getUniformLocation(p, n);
    gl.uniform1i(U('uCol'), 0); gl.uniform1i(U('uAux'), 1); gl.uniform2f(U('uRes'), w, h); gl.uniform1f(U('uStepJump'), V.step_jump);
    const res = {};
    for (const [name, M] of Object.entries(V.masks)) {
      gl.uniform1i(U('uMask'), M.mask); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px); res[name] = Array.from(px);
    }
    return { res };
  }, { fs, V });
}

function verdict(g, quiet) {
  const fails = [], lines = [];
  for (const [name, M] of Object.entries(V.masks)) {
    const px = g.res[name], edges = new Map(M.edges.map(r => [r[0], r.slice(1)]));
    let worst = 0, sel = 0, wrongSel = 0, changed = 0;
    for (let i = 0; i < V.w * V.h; i++) {
      const e = px[4 * i + 3] > 0.5, rgb = [px[4 * i], px[4 * i + 1], px[4 * i + 2]];
      sel += e;
      if (e !== edges.has(i)) { wrongSel++; continue; }
      if (e) worst = Math.max(worst, ...rgb.map((x, k) => Math.abs(x - edges.get(i)[k])));
      else if (rgb.some((x, k) => Math.round(x * 255) !== V.col[i][k])) changed++;
    }
    lines.push(`  ${name}: ${sel} px selected (${M.edges.length} expected), max rgb diff ${worst.toExponential(2)} (tol ${V.tol.rgb}), unselected changed ${changed}`);
    if (wrongSel || changed || !(worst <= V.tol.rgb)) fails.push(`${name}: ${wrongSel} wrongly selected, ${changed} unselected changed, worst ${worst.toFixed(4)}`);
  }
  if (!quiet) { lines.forEach(l => console.log(l)); fails.forEach(f => console.log('  FAIL ' + f)); }
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
      const ok = verdict(g, true), good = ok === want; allOk &&= good;
      console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(allOk ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED'); code = allOk ? 0 : 1;
  } else {
    const g = await gpuRun(page, FS(readFileSync(arg ? arg : here('./v1.glsl'), 'utf8')));
    if (g.error) { console.log('ERROR', g.error); code = 2; }
    else { const ok = verdict(g, false); console.log(ok ? 'GLSL PASS' : 'GLSL FAIL'); code = ok ? 0 : 1; }
  }
} finally { await browser.close(); }
process.exit(code);
