// render.js: assembles the shader from CodeT blocks and draws one frame on demand.
// The page never writes algebra: each map below only NAMES which block function to use.

const BLOCKS = ['code/bristor_product/v1.glsl', 'code/bristor_cube/v1.glsl', 'code/quaternion_product/v1.glsl',
  'code/brot_de_march/v1.glsl', 'view.glsl'];

// Which block functions brot_de_march marches, per map.
const MAPS = {
  square: ['bp_square(z)', 'bp_Jv(z, v)', 2],
  cube_l: ['bc_cubeL(z)', 'bc_JvL(z, v)', 3],
  cube_r: ['bc_cubeR(z)', 'bc_JvR(z, v)', 3],
  qsquare: ['qp_square(z)', 'qp_Jv(z, v)', 2],
};

const mapSource = ([f, df, power]) =>
  `vec4 bdm_f(vec4 z) { return ${f}; }\nvec4 bdm_df(vec4 z, vec4 v) { return ${df}; }\nconst float BDM_POWER = ${power}.0;\n`;

const VERT = '#version 300 es\nvoid main() { vec2 v = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0; gl_Position = vec4(v, 0, 1); }';

// Faults, used only by the build gate to prove check() can fail: 'bracket' wires z(zz) to the (zz)z bricks,
// 'quaternion' wires the q map to the Bristorian square.
const FAULTS = { bracket: { cube_r: 'cube_l' }, quaternion: { qsquare: 'square' } };

export async function createRenderer(canvas, { fault = null } = {}) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const [product, cube, quaternion, march, view] = await Promise.all(
    BLOCKS.map(path => fetch(new URL(path, import.meta.url)).then(r => r.text())));
  const programs = {}, probe = new Uint8Array(4);

  function compile(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(map) {
    if (programs[map]) return programs[map];
    const fs = ['#version 300 es', 'precision highp float;', 'precision highp int;',
      product, cube, quaternion, mapSource(MAPS[FAULTS[fault]?.[map] ?? map]), march, view].join('\n');
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return (programs[map] = p);
  }

  // Camera on a sphere around `target`, looking at it. Matrix columns: right, up, forward.
  function camera({ az, el, dist, target }) {
    const f = [-Math.cos(el) * Math.sin(az), -Math.sin(el), Math.cos(el) * Math.cos(az)];
    const pos = target.map((x, k) => x - dist * f[k]);
    const r = normalize([f[2], 0, -f[0]]);                  // up0 × forward, up0 = (0, 1, 0)
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    return { pos, mat: [...r, ...u, ...f] };
  }

  // Draw one frame. `map` is the block map, view: 0 shaded, 1 normals, 2 steps, 3 hit mask.
  function draw(map, st, view = st.view) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const p = program(map), U = name => gl.getUniformLocation(p, name), cam = camera(st);
    gl.useProgram(p);
    gl.uniform2f(U('uRes'), w, h);
    gl.uniform3fv(U('uCamPos'), cam.pos);
    gl.uniformMatrix3fv(U('uCamMat'), false, cam.mat);
    gl.uniform1f(U('uLens'), 1.5);
    gl.uniform2f(U('uBeta'), Math.sin(st.beta), Math.cos(st.beta));
    gl.uniform2f(U('uTheta'), Math.sin(st.theta), Math.cos(st.theta));
    gl.uniform1f(U('uW'), st.w);
    gl.uniform1i(U('uAxis'), st.axis ? 1 : 0);
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
    const t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);   // waits for the GPU, so the time is real
    return performance.now() - t0;
  }

  // Hit mask of the current frame, one byte per pixel (used by check()).
  function mask(map, st) {
    draw(map, st, 3);
    const { width: w, height: h } = canvas, px = new Uint8Array(w * h * 4), out = new Uint8Array(w * h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
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

  return { draw, mask, bounded, maps: Object.keys(MAPS) };
}

function normalize(v) {
  const n = Math.hypot(...v);
  return v.map(x => x / n);
}
