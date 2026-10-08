// app.js: brot_viewer page glue. State, controls, camera drag, C picker, share link, still refine, and check().
import { createRenderer } from './render.js';
import { createCSelector, cFromPlane } from './code/c_selector/v1.js';
import { createCubeSelector, escape, MAPS as CUBES, STEPS } from './code/chi_selector/v1.js';
import { SHADOW_DEFAULTS } from './code/bdm_shadow/v1.js';

// GPU this tab renders on, shown in the status line. On this machine the same page runs ~8x slower on the Intel P630 than
// on the P4000 (10-04), and a tab on the wrong GPU reads as a code regression. Vendor in the line, full string on hover.
const GPU = (() => {
  const g = document.createElement('canvas').getContext('webgl2'), e = g && g.getExtension('WEBGL_debug_renderer_info');
  const full = g ? String(e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : 'no WebGL2';
  const short = /nvidia|geforce|quadro|rtx|gtx/i.test(full) ? 'NVIDIA' : /intel/i.test(full) ? 'Intel' : /amd|radeon/i.test(full) ? 'AMD'
    : /swiftshader|llvmpipe|software/i.test(full) ? 'software' : full.replace(/, or similar$/, '').slice(0, 24);
  g?.getExtension('WEBGL_lose_context')?.loseContext();
  const st = document.getElementById('status'); if (st) st.title = 'GPU: ' + full;
  return { full, short };
})();

// The sets. Each names its block map, its C picker, and a default Julia C (real, e1, e2, e3).
// picker: 'quad' (c_selector), 'cube' (chi_selector, with its bracket), 'b1' (c_selector held at θ = 0), or 'b1cube'
// (chi_selector held at θ = 0: there both brackets are the complex z³ + c, the slice every real-axis cut of q³ shows).
const SETS = {
  b_brot: { label: 'b_brot · z² + c', map: 'square', picker: 'quad', c: [-0.7, -0.35, 0.05, 0] },
  chi_l:  { label: 'chi_brot · (zz)z + c', map: 'cube_l', picker: 'cube', bracket: 'L', c: [0.15, 0.4, 0.05, 0] },
  chi_r:  { label: 'chi_brot · z(zz) + c', map: 'cube_r', picker: 'cube', bracket: 'R', c: [0.15, 0.4, 0.05, 0] },
  q:      { label: 'quaternion · q² + c', map: 'qsquare', picker: 'b1', c: [-0.2, 0.65, 0, 0] },
  q3:     { label: 'quaternion · q³ + c', map: 'qcube', picker: 'b1cube', c: [0.35, 0.62, 0, 0], mandelCenter: [0, 0, 0] },
};

// Status names: the quaternion pairs are q_m / q_j and q3_m / q3_j.
const setName = s => s.set === 'q' || s.set === 'q3' ? `${s.set === 'q' ? 'q' : 'q3'}_${s.julia ? 'j' : 'm'}`
  : `${SETS[s.set].label} · ${s.julia ? 'Julia' : 'Mandelbrot'}`;

// caro's march profiles (cubic Julia + directional DE lab, 2026-10-03).
const QUALITY = {
  live:   { lod: 0.08, hitEps: 4.8e-4, steps: 1400 },
  // Fine floor calibrated against two tighter references by Caro, 2026-10-04.
  // Evidence: caro/investigation/todos_render_20261004/evidence/fine-depth.json
  fine:   { lod: 0.04, hitEps: 1.0e-4, steps: 2400 },
  visual: { lod: 0.10, hitEps: 1.0e-3, steps: 1400 },
};

const DEFAULTS = {
  set: 'b_brot', julia: true, c: SETS.b_brot.c, beta: 0.47, w: 0, axis: false, jk: false, theta: 0, spin: 0,
  iters: 48, leash: 8, quality: 'live', view: 0, az: -0.56, el: 0.592, dist: 3.04,
  shadow: 1, shadowSteps: SHADOW_DEFAULTS.steps, lightSize: SHADOW_DEFAULTS.size, lightAz: SHADOW_DEFAULTS.az, lightEl: SHADOW_DEFAULTS.el,
  shadowBias: SHADOW_DEFAULTS.bias, shadowTh: SHADOW_DEFAULTS.th0, shadowSoft: SHADOW_DEFAULTS.soft,
  refine: 64, post: 'both', stepJump: 3, postUntil: 8, mist: 0, mistW: 1, mistMode: 'edge', mistCoat: 0.3,
};

// check() looks from here, whatever the page's default view is, so the gate does not move when the defaults do.
const CHECK_VIEW = { az: -0.6, el: 0.25, dist: 4.6, post: 'off', mist: 0, spin: 0 };

const $ = id => document.getElementById(id);
const canvas = $('view');
const fault = new URLSearchParams(location.search).get('fault');   // build gate only, see check()
let state, renderer;

// ---------------------------------------------------------------- rendering

// One live frame on any change; then, once the view has been still for 120 ms, refine it sample by sample
// (renderer.accumulate) up to state.refine samples. Any change bumps `gen`, which stops the refine loop.
let queued = false, gen = 0;
function render() {
  gen++;
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const ms = renderer.draw(SETS[state.set].map, frameState());
    $('status').textContent = `${setName(state)} · ${ms.toFixed(0)} ms · ${GPU.short}`;
    const g = gen;
    if (state.refine > 1 && state.view === 0 && renderer.canAccumulate) setTimeout(() => refine(g, 1), 120);
  });
}

function refine(g, k) {
  if (g !== gen) return;
  const ms = renderer.accumulate(SETS[state.set].map, frameState(), k);
  $('status').textContent = `${setName(state)} · still refine ${k + 1}/${state.refine} · ${ms.toFixed(0)} ms · ${GPU.short}`;
  if (k + 1 < state.refine) requestAnimationFrame(() => refine(g, k + 1));
}

// Mandelbrot sets sit around real -0.5 (a set may override: the cubic q³ set is centred at 0); Julia sets around the origin.
const frameState = (s = state) => ({ ...s, quality: QUALITY[s.quality], target: s.julia ? [0, 0, 0] : (SETS[s.set].mandelCenter ?? [-0.5, 0, 0]) });

// ---------------------------------------------------------------- controls

const deg = x => `${(x * 180 / Math.PI).toFixed(0)}°`;

function bindControls() {
  for (const [key, set] of Object.entries(SETS)) $('set').add(new Option(set.label, key));
  $('set').onchange = e => { state.set = e.target.value; state.c = [...SETS[state.set].c]; sync(); };
  $('julia').onchange = e => { state.julia = e.target.value === '1'; sync(); };
  $('axis').onchange = e => { state.axis = e.target.value === '1'; state.jk = false; sync(); };
  $('quality').onchange = e => { state.quality = e.target.value; sync(); };
  $('leash').onchange = e => { state.leash = +e.target.value; sync(); };
  $('iters').onchange = e => { state.iters = +e.target.value; sync(); };
  $('viewMode').onchange = e => { state.view = +e.target.value; sync(); };
  $('shadow').onchange = e => { state.shadow = +e.target.value; sync(); };
  $('shadowSteps').onchange = e => { state.shadowSteps = +e.target.value; sync(); };
  for (const key of ['beta', 'w', 'theta', 'spin', 'lightAz', 'lightEl', 'lightSize', 'mist', 'mistW', 'mistCoat'])
    $(key).oninput = e => { state[key] = +e.target.value; sync(); };
  $('refine').onchange = e => { state.refine = +e.target.value; sync(); };
  $('post').onchange = e => { state.post = e.target.value; sync(); };
  $('mistMode').onchange = e => { state.mistMode = e.target.value; sync(); };
  ['c0', 'c1', 'c2', 'c3'].forEach((id, k) => $(id).onchange = e => {
    if (Number.isFinite(+e.target.value)) state.c[k] = +e.target.value;
    sync();
  });
  $('share').onclick = copyLink;
  $('resetCam').onclick = () => { Object.assign(state, { az: DEFAULTS.az, el: DEFAULTS.el, dist: DEFAULTS.dist, spin: 0 }); sync(); };
  bindOrbit();
  bindPicker();
}

// Write state into the controls, then render.
function sync() {
  for (const key of ['set', 'quality', 'post', 'mistMode']) $(key).value = state[key];
  $('julia').value = state.julia ? '1' : '0';
  $('axis').value = state.axis ? '1' : '0';
  for (const key of ['leash', 'iters', 'refine', 'shadow', 'shadowSteps']) $(key).value = String(state[key]);
  $('viewMode').value = String(state.view);
  for (const key of ['beta', 'w', 'theta', 'spin', 'lightAz', 'lightEl', 'lightSize', 'mist', 'mistW', 'mistCoat']) $(key).value = state[key];
  for (const key of ['beta', 'theta', 'spin', 'lightAz', 'lightEl']) $(key + 'Out').textContent = deg(state[key]);
  $('wOut').textContent = state.w.toFixed(2);
  $('lightSizeOut').textContent = `${(state.lightSize * 180 / Math.PI).toFixed(1)}°`;
  $('mistOut').textContent = state.mist.toFixed(2);
  $('mistWOut').textContent = state.mistW.toFixed(2) + ' px';
  $('mistCoatOut').textContent = state.mistCoat.toFixed(2);
  $('mistCoatRow').hidden = state.mistMode !== 'edgecoat';
  for (const id of ['lightRow', 'lightElRow', 'lightSizeRow', 'shadowStepsRow']) $(id).classList.toggle('off', !state.shadow);
  state.c.forEach((x, k) => { $('c' + k).value = +x.toFixed(4); });
  $('cRow').classList.toggle('off', !state.julia);
  if (!$('picker').hidden) mountPicker();
  render();
}

// Drag to orbit (the view), shift-drag to spin the body (φ, same feel as the orbit), wheel to zoom.
function bindOrbit() {
  let drag = null;
  canvas.onpointerdown = e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
  canvas.onpointermove = e => {
    if (!drag) return;
    if (e.shiftKey) {   // body spin: φ ≡ camera az + φ (light aside), so +dx turns the body with the hand, like the orbit
      const s = state.spin + (e.clientX - drag[0]) * 0.008;
      state.spin = s - 2 * Math.PI * Math.round(s / (2 * Math.PI));   // keep in the slider's [−π, π]
      $('spin').value = state.spin; $('spinOut').textContent = deg(state.spin);
    } else {
      state.az += (e.clientX - drag[0]) * 0.008;   // + since the 10-07 camera fix: the body follows the hand
      state.el = clamp(state.el + (e.clientY - drag[1]) * 0.006, -1.4, 1.4);
    }
    drag = [e.clientX, e.clientY];
    render();
  };
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.dist = clamp(state.dist * Math.exp(e.deltaY * 0.001), 1.6, 10);
    render();
  }, { passive: false });
  new ResizeObserver(render).observe(canvas);
}

// ---------------------------------------------------------------- C picker (CodeT c_selector / chi_selector)

// b_brot picks C on the quadratic set (c_selector); chi_brot on its own cubic set (chi_selector), with an option
// to show both brackets. The q-sets use B1: the picker held at θ = 0, the complex slice. Every slice of a quaternion
// set through the real axis is that same picture, so θ is fixed and β picks the render's cut instead.
// All pickers share the slice plane, so θ means the same roll on each.
let selector = null, selectorKind = null;

function pickerSetC() {
  if (selectorKind === 'b1' || selectorKind === 'b1cube') { selector.setTheta(0); selector.setC(state.c.slice(0, 3), { align: false }); }
  else selector.setC(state.c.slice(0, 3));
}

function mountPicker() {
  const { picker: kind, bracket } = SETS[state.set];
  const which = bracket && $('bothBrackets').checked ? 'both' : bracket;
  $('bothRow').hidden = kind !== 'cube';
  $('rollRow').hidden = kind === 'b1' || kind === 'b1cube';
  $('guideNote').textContent = {
    quad: 'The quadratic z² + c parameter set.',
    cube: which === 'both' ? 'Cubic sets: magenta in (zz)z only, green in z(zz) only.' : `The ${bracket === 'L' ? '(zz)z' : 'z(zz)'} + c parameter set.`,
    b1: 'B1: the complex slice (θ = 0). Every slice through the real axis looks the same; β picks the cut.',
    b1cube: 'B1: the complex z³ + c slice (θ = 0). Every slice through the real axis looks the same; β picks the cut.',
  }[kind];
  if (selector && selectorKind === kind) {
    if (kind === 'cube') selector.setWhich(which);
    pickerSetC();
    return;
  }
  const fresh = $('cMap').cloneNode(false);                 // a clean canvas: drops the old picker's listeners
  $('cMap').replaceWith(fresh);
  const options = {
    onSelect: c3 => { state.c = [...c3, state.c[3]]; sync(); },  // the map picks (real, e1, e2); e3 is kept
    onState: s => { $('guideTheta').textContent = `θ ${deg(s.theta)}`; $('guideRoll').value = s.theta; },
  };
  selector = kind === 'cube' ? createCubeSelector(fresh, { ...options, which })
    : kind === 'b1cube' ? createCubeSelector(fresh, { ...options, which: 'L' }) : createCSelector(fresh, options);
  selectorKind = kind;
  pickerSetC();
}

function bindPicker() {
  $('pick').onclick = () => { $('picker').hidden = !$('picker').hidden; if (!$('picker').hidden) mountPicker(); };
  $('closePicker').onclick = () => { $('picker').hidden = true; };
  $('guideRoll').oninput = e => selector?.setTheta(+e.target.value);
  $('bothBrackets').onchange = mountPicker;
}

// ---------------------------------------------------------------- share link

const URL_KEYS = ['set', 'julia', 'c', 'beta', 'w', 'axis', 'jk', 'theta', 'spin', 'iters', 'leash', 'quality', 'view', 'az', 'el', 'dist',
  'shadow', 'shadowSteps', 'lightSize', 'lightAz', 'lightEl', 'refine', 'post', 'mist', 'mistW', 'mistMode', 'mistCoat'];

function readUrl() {
  const q = new URLSearchParams(location.search), s = structuredClone(DEFAULTS);
  // A key this page does not know is dropped, so the link may not show what its author saw: say so (insights 10-07).
  for (const key of q.keys()) if (!URL_KEYS.includes(key) && key !== 'fault') console.warn(`brot_viewer: link key '${key}' is not used by this page and was ignored`);
  for (const key of URL_KEYS) {
    if (!q.has(key)) continue;
    const v = q.get(key), d = DEFAULTS[key];
    if (Array.isArray(d)) { const a = v.split(',').map(Number); if (a.length === 4 && a.every(Number.isFinite)) s[key] = a; }
    else if (typeof d === 'boolean') s[key] = v === '1';
    else if (typeof d === 'number') { if (Number.isFinite(+v)) s[key] = +v; }
    else s[key] = v;
  }
  if (!SETS[s.set]) s.set = DEFAULTS.set;
  if (!QUALITY[s.quality]) s.quality = DEFAULTS.quality;
  if (!(s.view >= 0 && s.view <= 3)) s.view = 0;
  return s;
}

async function copyLink() {
  const q = new URLSearchParams();
  for (const key of URL_KEYS) {
    const v = state[key];
    q.set(key, typeof v === 'boolean' ? (v ? '1' : '0') : Array.isArray(v) ? v.join(',') : String(v));
  }
  const link = `${location.origin}${location.pathname}?${q}`;
  history.replaceState(null, '', link);
  try { await navigator.clipboard.writeText(link); $('share').textContent = 'Link copied'; }
  catch { $('share').textContent = 'Link in address bar'; }
  setTimeout(() => { $('share').textContent = 'Copy link'; }, 1600);
}

// ---------------------------------------------------------------- check() for the build gate

// Every set renders something; the two cube brackets render differently (the hand); the shader's own set test
// agrees with the cubic picker's inSet (C2: a picker can be right about itself and wrong about its host); a quaternion
// Julia with real C looks the same at every β (rotations of i, j, k are automorphisms of Hamilton), for q² and q³;
// the shadow darkens some lit pixels and brightens none; and spinning the body by φ is the same picture as turning
// the camera by +φ and the light by −φ (so the light really turns with the body). The build runs this as shipped (must
// pass) and once per fault in viewer.json (each must fail).
function check() {
  const base = { ...DEFAULTS, ...CHECK_VIEW, refine: 0 };
  const view = frameState(base);
  const lines = [];
  let ok = true;
  const frac = m => m.reduce((a, b) => a + b, 0) / m.length;
  const diff = (a, b) => a.reduce((n, x, i) => n + (x !== b[i]), 0) / a.length;
  const line = (good, text) => { ok &&= good; lines.push(`[${good ? 'ok ' : 'BAD'}] ${text}`); };

  for (const [key, set] of Object.entries(SETS)) {
    for (const julia of [false, true]) {
      const f = frac(renderer.mask(set.map, { ...frameState({ ...base, set: key, julia }), c: set.c }));
      line(f > 0.01 && f < 0.95, `${key} ${julia ? 'Julia' : 'Mandelbrot'}: ${(100 * f).toFixed(1)}% of pixels hit`);
    }
  }
  const c = SETS.chi_l.c;
  const hand = diff(renderer.mask('cube_l', { ...view, c }), renderer.mask('cube_r', { ...view, c }));
  line(hand > 0.002, `hand: (zz)z and z(zz) Julia masks differ on ${(100 * hand).toFixed(2)}% of pixels`);

  // C2 on the generic plane θ = 0.4, at C clearly in (bounded for twice the steps) or clearly out (escapes by 100).
  const cs = [];
  for (let i = 0; i < 24; i++) for (let k = 0; k < 16; k++) cs.push(cFromPlane(-0.9 + 1.8 * (k + 0.5) / 16, -1.5 + 3 * (i + 0.5) / 24, 0.4));
  for (const [bracket, map] of [['L', 'cube_l'], ['R', 'cube_r']]) {
    const sure = cs.filter(c => { const n = escape(CUBES[bracket], c)[0]; return n <= 100 || (n === STEPS && twice(CUBES[bracket], c)); });
    const host = renderer.bounded(map, sure, STEPS - 2);
    const bad = sure.filter((c, i) => host[i] !== (escape(CUBES[bracket], c)[0] === STEPS)).length;
    line(bad === 0, `C2 ${bracket}: shader and picker agree on ${sure.length - bad}/${sure.length} C`);
  }

  // Q symmetry: C on the real axis, two different cuts β. Any change beyond float noise means the map is not Hamilton.
  for (const [key, map, qc] of [['q', 'qsquare', [-1, 0, 0, 0]], ['q3', 'qcube', [0.3, 0, 0, 0]]]) {
    const qview = { ...frameState({ ...base, set: key }), c: qc };
    const sym = diff(renderer.mask(map, { ...qview, beta: 0.47 }), renderer.mask(map, { ...qview, beta: 1.6 }));
    line(sym < 0.002, `${key === 'q' ? 'Q' : 'Q³'} symmetry: Julia at real C, β 27° vs 92°, masks differ on ${(100 * sym).toFixed(2)}% of pixels`);
  }

  // Julia β section = the j→k roll (insights + Doug 10-07): at β 0 the window is (real, i, j), exactly the axis cut
  // (the B2 jbrot); a nonzero β moves it.
  {
    const lh = { ...view, set: 'b_brot', julia: true, c: [-0.7, 0, 0.27, 0], w: 0 };
    const same = diff(renderer.mask('square', { ...lh, jk: false, axis: false, beta: 0 }), renderer.mask('square', { ...lh, axis: true, beta: 0 }));
    const moved = diff(renderer.mask('square', { ...lh, jk: false, axis: false, beta: 1.2 }), renderer.mask('square', { ...lh, jk: false, axis: false, beta: 0 }));
    line(same === 0 && moved > 0.002, `Julia β section (j→k): at β 0 equals the axis cut, the B2 jbrot (${(100 * same).toFixed(2)}% differ); β 69° moves it (${(100 * moved).toFixed(2)}%)`);
  }

  // Shadow: on vs off over the chi_l Julia. The shadow only scales the diffuse term, so no pixel may get brighter.
  const lum = (px, i) => px[4 * i] + px[4 * i + 1] + px[4 * i + 2];
  const sv = { ...frameState({ ...base, set: 'chi_l' }), c };
  const on = renderer.pixels('cube_l', { ...sv, shadow: 1 }, 0), off = renderer.pixels('cube_l', { ...sv, shadow: 0 }, 0);
  let darker = 0, brighter = 0;
  for (let i = 0; i < on.length / 4; i++) { const d = lum(on, i) - lum(off, i); darker += d < 0; brighter += d > 0; }
  const n = on.length / 4;
  // chi_l at this light is mostly lit: 0.74% darker as shipped (10-04); a shadow that never runs gives exactly 0.
  line(darker / n > 0.002 && brighter === 0, `shadow: ${(100 * darker / n).toFixed(2)}% of pixels darker with it on, ${brighter} brighter`);

  // Spin φ = 0.9 against camera az + 0.9 and light az − 0.9 at φ = 0, shaded with the shadow on.
  const spun = renderer.pixels('cube_l', { ...sv, shadow: 1, spin: 0.9 }, 0);
  const turned = renderer.pixels('cube_l', { ...sv, shadow: 1, az: sv.az + 0.9, lightAz: sv.lightAz - 0.9 }, 0);
  const spinDiff = diff(spun, turned);
  line(spinDiff < 0.001, `spin: φ 0.9 vs camera +0.9 and light −0.9, ${(100 * spinDiff).toFixed(3)}% of channels differ`);
  // Picture hand: in a right-handed world, looking along +z, screen right is world −x. Every check above is
  // mirror-blind, and v3 shipped mirrored until 10-07 (insights' catch, Doug's eye). The b_brot Mandelbrot's real
  // plane is the classical Mandelbrot set, whose area centroid (real ≈ −0.287) lies on the +x side of the view
  // centre (−0.5). So from az = 0, el = 0 the silhouette's mass must sit LEFT of the centre column.
  const hv = { ...frameState({ ...base, set: 'b_brot', julia: false, az: 0, el: 0, axis: true, beta: 0, theta: 0 }), c: SETS.b_brot.c };
  const hm = renderer.mask('square', hv), W = canvas.width;
  let sx = 0, cnt = 0;
  for (let i = 0; i < hm.length; i++) if (hm[i]) { sx += i % W; cnt++; }
  const mass = cnt ? sx / cnt - (W - 1) / 2 : 0;
  line(cnt > 0 && mass < -0.01 * W, `picture hand: b_brot Mandelbrot from +z, mass ${Math.abs(mass).toFixed(1)} px ${mass < 0 ? 'left' : 'right'} of centre (must be left: world +x on screen left)`);
  render();
  return { ok, lines };
}

// Still bounded after 2 × STEPS: far from the boundary, so float32 and double agree.
function twice(f, c) {
  let z = [0, 0, 0];
  for (let n = 0; n < 2 * STEPS; n++) { if (z[0] ** 2 + z[1] ** 2 + z[2] ** 2 > 64) return false; z = f(z).map((x, k) => x + c[k]); }
  return true;
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

state = readUrl();
renderer = await createRenderer(canvas, { fault });
bindControls();
sync();
window.__viewer = { ready: true, state, render, check, stopRefine: () => { state.refine = 0; gen++; } };
