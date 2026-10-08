// render.js: assembles the shaders from CodeT blocks and draws frames on demand: one live frame, a post pass, and the
// still refine. The page never writes algebra: each map below only NAMES which block functions to use.
import { bdsLightDir, bdsThreshold, bdsDisk, halton } from './code/bdm_shadow/v1.js';

const BLOCKS = ['code/bristor_product/v1.glsl', 'code/bristor_cube/v1.glsl', 'code/quaternion_product/v1.glsl'];
const AFTER_MAP = ['code/brot_de_march/v1.glsl', 'code/bdm_shadow/v1.glsl', 'view.glsl'];
const POST_SRC = ['code/edge_post/v1.glsl', 'post.glsl'];

// Which block functions brot_de_march marches, per map.
const MAPS = {
  square: ['bp_square(z)', 'bp_Jv(z, v)', 2],
  cube_l: ['bc_cubeL(z)', 'bc_JvL(z, v)', 3],
  cube_r: ['bc_cubeR(z)', 'bc_JvR(z, v)', 3],
  qsquare: ['qp_square(z)', 'qp_Jv(z, v)', 2],
  qcube: ['qp_mul(qp_square(z), z)', 'qp_mul(qp_Jv(z, v), z) + qp_mul(qp_square(z), v)', 3],   // Hamilton is associative: one bracket
};

const mapSource = ([f, df, power]) =>
  `vec4 bdm_f(vec4 z) { return ${f}; }\nvec4 bdm_df(vec4 z, vec4 v) { return ${df}; }\nconst float BDM_POWER = ${power}.0;\n`;

// The post filter's masks (edge_post EP_*); 'off' skips the pass entirely.
export const POST = { off: -1, none: 0, luma: 1, steps: 2, both: 3, all: 4 };

const VERT = '#version 300 es\nvoid main() { vec2 v = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0; gl_Position = vec4(v, 0, 1); }';
const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

// Faults, used only by the build gate to prove check() can fail: 'bracket' wires z(zz) to the (zz)z bricks,
// 'quaternion' wires the q maps to the Bristorian square and cube, 'spin' leaves the light out of the body frame,
// 'shadow' never sends the shadow switch, 'mirror' draws the picture mirrored (the pre-10-07 camera).
const FAULTS = { bracket: { cube_r: 'cube_l' }, quaternion: { qsquare: 'square', qcube: 'cube_l' } };

export async function createRenderer(canvas, { fault = null } = {}) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const load = paths => Promise.all(paths.map(path => fetch(new URL(path, import.meta.url)).then(r => r.text())));
  const [before, after, post] = await Promise.all([load(BLOCKS), load(AFTER_MAP), load(POST_SRC)]);
  const programs = {}, probe = new Uint8Array(4);
  let postProg = null, fbo = null, texs = null, fboW = 0, fboH = 0;
  // Still refine: a float accumulation buffer (running mean in linear light) and a display-space copy the post pass reads.
  const accFloat = gl.getExtension('EXT_color_buffer_float') && gl.getExtension('EXT_float_blend') ? gl.RGBA32F
    : gl.getExtension('EXT_color_buffer_float') ? gl.RGBA16F : null;
  let accTex = null, accFbo = null, dispTex = null, dispFbo = null, accProg = null, resolveProg = null;

  function compile(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function link(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function program(map) {
    return programs[map] ??= link(HEAD + [...before, mapSource(MAPS[FAULTS[fault]?.[map] ?? map]), ...after].join('\n'));
  }

  // The march renders into two textures (colour, aux), then the post pass filters to the canvas.
  function target(w, h) {
    if (fbo && fboW === w && fboH === h) return;
    if (fbo) { gl.deleteFramebuffer(fbo); texs.forEach(t => gl.deleteTexture(t)); }
    texs = [0, 1].map(() => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    texs.forEach((t, k) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (accFloat) {
      if (accFbo) { [accFbo, dispFbo].forEach(f => gl.deleteFramebuffer(f)); [accTex, dispTex].forEach(t => gl.deleteTexture(t)); }
      [accTex, accFbo] = colourTarget(accFloat, w, h);
      [dispTex, dispFbo] = colourTarget(gl.RGBA8, w, h);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fboW = w; fboH = h;
  }

  function colourTarget(format, w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, format === gl.RGBA8 ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, format === gl.RGBA8 ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return [t, f];
  }

  function texProgram(body) {
    return link('#version 300 es\nprecision highp float;\nuniform sampler2D uSrc;\nout vec4 o;\n' +
      'void main() { vec3 c = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb; ' + body + ' }');
  }

  function texPass(p, src) {
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(p, 'uSrc'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // src: the colour texture to filter (the 1-spp frame, or the resolved accumulation).
  function postPass(st, src = texs[0], mask = st.post) {
    const p = postProg ??= link(HEAD + post.join('\n')), U = name => gl.getUniformLocation(p, name);
    gl.useProgram(p);
    [src, texs[1]].forEach((t, k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(U('uCol'), 0); gl.uniform1i(U('uAux'), 1);
    gl.uniform2f(U('uRes'), fboW, fboH);
    gl.uniform1i(U('uMask'), Math.max(POST[mask] ?? 0, 0));
    gl.uniform1f(U('uStepJump'), st.stepJump ?? 3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Camera on a sphere around `target`, looking at it. Matrix columns: right, up, forward.
  function camera({ az, el, dist, target }) {
    const f = [-Math.cos(el) * Math.sin(az), -Math.sin(el), Math.cos(el) * Math.cos(az)];
    const pos = target.map((x, k) => x - dist * f[k]);
    // Screen right = forward × up0, so right × up = −forward: a right-handed picture. Until 10-07 this was up0 × forward,
    // which drew every set mirrored left-right (insights' catch, Doug's eye); fault 'mirror' restores that for the gate.
    const r = fault === 'mirror' ? normalize([f[2], 0, -f[0]]) : normalize([-f[2], 0, f[0]]);
    const u = fault === 'mirror' ? cross(f, r) : cross(r, f);   // +y either way
    return { pos, mat: [...r, ...u, ...f] };
  }

  // Draw one frame. `map` is the block map, view: 0 shaded, 1 normals, 2 steps, 3 hit mask.
  function draw(map, st, view = st.view) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const usePost = POST[st.post] >= 0 && view === 0;
    if (usePost) { target(w, h); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); }
    const t0 = performance.now();
    marchPass(map, st, view, w, h);
    if (usePost) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); postPass(st); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);   // waits for the GPU, so the time is real
    return performance.now() - t0;
  }

  // One march pass into whatever framebuffer is bound.
  function marchPass(map, st, view, w, h) {
    const p = program(map), U = name => gl.getUniformLocation(p, name), cam = camera(st);
    // Body pose: roll θ lives inside the set (uTheta); spin φ then turns the body about world +y. The view and the light
    // stay in world space, so march in the body's frame: carry the camera and the light back by −φ.
    const cs = Math.cos(st.spin ?? 0), sn = Math.sin(st.spin ?? 0), toBody = v => [cs * v[0] - sn * v[2], v[1], sn * v[0] + cs * v[2]];
    const m = cam.mat, light = bdsLightDir(st.lightAz, st.lightEl);
    gl.useProgram(p);
    gl.uniform2f(U('uRes'), w, h);
    gl.uniform3fv(U('uCamPos'), toBody(cam.pos));
    gl.uniformMatrix3fv(U('uCamMat'), false, [...toBody(m.slice(0, 3)), ...toBody(m.slice(3, 6)), ...toBody(m.slice(6, 9))]);
    gl.uniform1f(U('uLens'), 1.5);
    gl.uniform2fv(U('uJitter'), st.jitter ?? [0, 0]);
    gl.uniform2f(U('uBeta'), Math.sin(st.beta), Math.cos(st.beta));
    gl.uniform2f(U('uTheta'), Math.sin(st.theta), Math.cos(st.theta));
    gl.uniform1f(U('uW'), st.w);
    gl.uniform1i(U('uAxis'), st.axis ? 1 : 0);
    gl.uniform1i(U('uJK'), st.jk ? 1 : 0);
    gl.uniform1i(U('uJulia'), st.julia ? 1 : 0);
    gl.uniform1i(U('uIters'), st.iters);
    gl.uniform4fv(U('uC'), st.c);
    gl.uniform1i(U('uMaxSteps'), st.quality.steps);
    gl.uniform1f(U('uBound'), 4.0);
    gl.uniform1f(U('uSafety'), 0.4);
    gl.uniform1f(U('uHitEps'), st.quality.hitEps);
    gl.uniform1f(U('uLod'), st.quality.lod);
    gl.uniform1f(U('uLeash'), st.leash);
    gl.uniform1i(U('uView'), view);
    gl.uniform3fv(U('uLightDir'), fault === 'spin' ? light : toBody(light));
    gl.uniform1i(U('uShadow'), st.shadow && fault !== 'shadow' ? 1 : 0);
    gl.uniform1i(U('uShadowHard'), st.shadowHard ? 1 : 0);
    gl.uniform2fv(U('uLightDisk'), st.lightDisk ?? [0, 0]);
    gl.uniform1f(U('uLightTan'), Math.tan(st.lightSize));
    gl.uniform1f(U('uShadowBias'), st.shadowBias);
    gl.uniform1f(U('uShadowTh'), bdsThreshold(st.lightSize, st.shadowTh));
    gl.uniform1f(U('uShadowSoft'), st.shadowSoft);
    gl.uniform1i(U('uShadowSteps'), st.shadowSteps);
    gl.uniform1f(U('uMist'), st.mist); gl.uniform1f(U('uMistW'), st.mistW); gl.uniform1f(U('uMistCoat'), st.mistCoat);
    gl.uniform1i(U('uMistMode'), { coat: 0, edge: 1, edgecoat: 2 }[st.mistMode] ?? 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Still refine, sample k >= 1 of the frame `st` (k = 1 also lays down the centre sample 0). Each sample is a full
  // 1-spp march at a Halton (2,3) sub-pixel offset, with a hard shadow toward its own point of the light disk, added to
  // the running mean in linear light. The mean is shown through the post pass while fewer than st.postUntil samples
  // are in. Returns ms, or null if this browser cannot render to a float buffer.
  function accumulate(map, st, k) {
    if (!accFloat) return null;
    const w = canvas.width, h = canvas.height;
    target(w, h);
    gl.viewport(0, 0, w, h);
    accProg ??= texProgram('o = vec4(pow(c, vec3(2.2)), 1.0);');
    resolveProg ??= texProgram('o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);');
    const t0 = performance.now();
    const add = (jitter, weight, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      marchPass(map, { ...st, jitter, shadowHard: !!st.shadow, lightDisk: bdsDisk(i) }, 0, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, accFbo);
      gl.enable(gl.BLEND);
      gl.blendColor(0, 0, 0, weight);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);   // acc = w * sample + (1 - w) * acc
      texPass(accProg, texs[0]);
      gl.disable(gl.BLEND);
    };
    if (k === 1) add([0, 0], 1, 0);
    add([halton(k, 2) - 0.5, halton(k, 3) - 0.5], 1 / (k + 1), k);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dispFbo);
    texPass(resolveProg, accTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    postPass(st, dispTex, k + 1 < (st.postUntil ?? 8) ? st.post : 'none');
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    return performance.now() - t0;
  }

  // The whole frame as RGBA bytes, rows bottom-up (used by check()).
  function pixels(map, st, view = st.view) {
    draw(map, st, view);
    const { width: w, height: h } = canvas, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  // Hit mask of the current frame, one byte per pixel (used by check()).
  function mask(map, st) {
    const px = pixels(map, st, 3), out = new Uint8Array(px.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = px[4 * i] > 127 ? 1 : 0;
    return out;
  }

  // Host set test (control C2): is the Mandelbrot orbit of each c = (re, e1, e2, 0) bounded for `iters` steps?
  // Runs the real program on one pixel: axis cut, θ = 0, w = 0, so the march brick seeds c = p exactly.
  function bounded(map, cs, iters) {
    const p = program(map), U = name => gl.getUniformLocation(p, name), px = new Uint8Array(4);
    gl.useProgram(p);
    gl.viewport(0, 0, 1, 1);
    gl.uniform2f(U('uTheta'), 0, 1);
    gl.uniform1f(U('uW'), 0);
    gl.uniform1i(U('uAxis'), 1);
    gl.uniform1i(U('uJK'), 0);
    gl.uniform1i(U('uJulia'), 0);
    gl.uniform1i(U('uIters'), iters);
    gl.uniform1i(U('uView'), 4);
    return cs.map(c => {
      gl.uniform3fv(U('uCamPos'), c);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px[0] > 127;
    });
  }

  return { draw, accumulate, pixels, mask, bounded, canAccumulate: !!accFloat, maps: Object.keys(MAPS) };
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const n = Math.hypot(...v);
  return v.map(x => x / n);
}
