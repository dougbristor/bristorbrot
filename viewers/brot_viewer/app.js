// app.js: brot_viewer page glue. State, controls, camera drag, C picker, share link, and check().
import { createRenderer } from './render.js';
import { createCSelector, cFromPlane } from './code/c_selector/v1.js';
import { createCubeSelector, escape, MAPS as CUBES, STEPS } from './code/chi_selector/v1.js';

// The sets. Each names its block map, its C picker, and a default Julia C (real, e1, e2, e3).
// picker: 'quad' (c_selector), 'cube' (chi_selector, with its bracket), or 'b1' (c_selector held at θ = 0).
const SETS = {
  b_brot: { label: 'b_brot · z² + c', map: 'square', picker: 'quad', c: [-0.7, -0.35, 0.05, 0] },
  chi_l:  { label: 'chi_brot · (zz)z + c', map: 'cube_l', picker: 'cube', bracket: 'L', c: [0.15, 0.4, 0.05, 0] },
  chi_r:  { label: 'chi_brot · z(zz) + c', map: 'cube_r', picker: 'cube', bracket: 'R', c: [0.15, 0.4, 0.05, 0] },
  q:      { label: 'quaternion · q² + c', map: 'qsquare', picker: 'b1', c: [-0.2, 0.65, 0, 0] },
};

// Status names: the quaternion pair is q_m (Mandelbrot) and q_j (Julia).
const setName = s => s.set === 'q' ? (s.julia ? 'q_j' : 'q_m') : `${SETS[s.set].label} · ${s.julia ? 'Julia' : 'Mandelbrot'}`;

// Fine floor calibrated against two tighter references by Caro, 2026-10-04.
// Evidence: caro/investigation/todos_render_20261004/evidence/fine-depth.json
// caro's march profiles (cubic Julia + directional DE lab, 2026-10-03).
const QUALITY = {
  live:   { lod: 0.08, hitEps: 4.8e-4, steps: 1400 },
  fine:   { lod: 0.04, hitEps: 1.0e-4, steps: 2400 },
  visual: { lod: 0.10, hitEps: 1.0e-3, steps: 1400 },
};

const DEFAULTS = {
  set: 'chi_l', julia: true, c: SETS.chi_l.c, beta: 0.47, w: 0, axis: false, theta: 0,
  iters: 48, leash: 8, quality: 'live', view: 0, az: -0.6, el: 0.25, dist: 4.6,
};

const $ = id => document.getElementById(id);
const canvas = $('view');
const fault = new URLSearchParams(location.search).get('fault');   // build gate only, see check()
let state, renderer;

// ---------------------------------------------------------------- rendering

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const ms = renderer.draw(SETS[state.set].map, frameState());
    $('status').textContent = `${setName(state)} · ${ms.toFixed(0)} ms`;
  });
}

// Mandelbrot sets sit around real -0.5; Julia sets around the origin.
const frameState = (s = state) => ({ ...s, quality: QUALITY[s.quality], target: s.julia ? [0, 0, 0] : [-0.5, 0, 0] });

// ---------------------------------------------------------------- controls

function bindControls() {
  for (const [key, set] of Object.entries(SETS)) $('set').add(new Option(set.label, key));
  $('set').onchange = e => { state.set = e.target.value; state.c = [...SETS[state.set].c]; sync(); };
  $('julia').onchange = e => { state.julia = e.target.value === '1'; sync(); };
  $('axis').onchange = e => { state.axis = e.target.value === '1'; sync(); };
  $('quality').onchange = e => { state.quality = e.target.value; sync(); };
  $('leash').onchange = e => { state.leash = +e.target.value; sync(); };
  $('iters').onchange = e => { state.iters = +e.target.value; sync(); };
  $('viewMode').onchange = e => { state.view = +e.target.value; sync(); };
  for (const key of ['beta', 'w', 'theta']) $(key).oninput = e => { state[key] = +e.target.value; sync(); };
  ['c0', 'c1', 'c2', 'c3'].forEach((id, k) => $(id).onchange = e => {
    if (Number.isFinite(+e.target.value)) state.c[k] = +e.target.value;
    sync();
  });
  $('share').onclick = copyLink;
  $('resetCam').onclick = () => { Object.assign(state, { az: DEFAULTS.az, el: DEFAULTS.el, dist: DEFAULTS.dist }); sync(); };
  bindOrbit();
  bindPicker();
}

// Write state into the controls, then render.
function sync() {
  $('set').value = state.set;
  $('julia').value = state.julia ? '1' : '0';
  $('axis').value = state.axis ? '1' : '0';
  $('quality').value = state.quality;
  $('leash').value = String(state.leash);
  $('iters').value = String(state.iters);
  $('viewMode').value = String(state.view);
  for (const key of ['beta', 'w', 'theta']) {
    $(key).value = state[key];
    $(key + 'Out').textContent = key === 'w' ? state.w.toFixed(2) : `${(state[key] * 180 / Math.PI).toFixed(0)}°`;
  }
  state.c.forEach((x, k) => { $('c' + k).value = +x.toFixed(4); });
  $('cRow').classList.toggle('off', !state.julia);
  if (!$('picker').hidden) mountPicker();
  render();
}

// Drag to orbit, wheel to zoom.
function bindOrbit() {
  let drag = null;
  canvas.onpointerdown = e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
  canvas.onpointermove = e => {
    if (!drag) return;
    state.az -= (e.clientX - drag[0]) * 0.008;
    state.el = clamp(state.el + (e.clientY - drag[1]) * 0.006, -1.4, 1.4);
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
// to show both brackets. The q-sets use B1: c_selector held at θ = 0, the complex slice. Every slice of the
// quaternion set through the real axis is that same picture, so θ is fixed and β picks the render's cut instead.
// All pickers share the slice plane, so θ means the same roll on each.
let selector = null, selectorKind = null;

function pickerSetC() {
  if (selectorKind === 'b1') { selector.setTheta(0); selector.setC(state.c.slice(0, 3), { align: false }); }
  else selector.setC(state.c.slice(0, 3));
}

function mountPicker() {
  const { picker: kind, bracket } = SETS[state.set];
  const which = bracket && $('bothBrackets').checked ? 'both' : bracket;
  $('bothRow').hidden = kind !== 'cube';
  $('rollRow').hidden = kind === 'b1';
  $('guideNote').textContent = {
    quad: 'The quadratic z² + c parameter set.',
    cube: which === 'both' ? 'Cubic sets: magenta in (zz)z only, green in z(zz) only.' : `The ${bracket === 'L' ? '(zz)z' : 'z(zz)'} + c parameter set.`,
    b1: 'B1: the complex slice (θ = 0). Every slice through the real axis looks the same; β picks the cut.',
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
    onState: s => { $('guideTheta').textContent = `θ ${(s.theta * 180 / Math.PI).toFixed(0)}°`; $('guideRoll').value = s.theta; },
  };
  selector = kind === 'cube' ? createCubeSelector(fresh, { ...options, which }) : createCSelector(fresh, options);
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

const URL_KEYS = ['set', 'julia', 'c', 'beta', 'w', 'axis', 'theta', 'iters', 'leash', 'quality', 'view', 'az', 'el', 'dist'];

function readUrl() {
  const q = new URLSearchParams(location.search), s = structuredClone(DEFAULTS);
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
// agrees with the cubic picker's inSet (C2: a picker can be right about itself and wrong about its host); and a
// quaternion Julia with real C looks the same at every β (rotations of i, j, k are automorphisms of Hamilton).
// The build runs this as shipped (must pass) and once per fault in viewer.json (each must fail): ?fault=bracket
// wires z(zz) to the (zz)z bricks; ?fault=quaternion wires the q map to the Bristorian square.
function check() {
  const view = frameState(DEFAULTS);
  const lines = [];
  let ok = true;
  const frac = m => m.reduce((a, b) => a + b, 0) / m.length;
  const diff = (a, b) => a.reduce((n, x, i) => n + (x !== b[i]), 0) / a.length;

  for (const [key, set] of Object.entries(SETS)) {
    for (const julia of [false, true]) {
      const f = frac(renderer.mask(set.map, { ...frameState({ ...DEFAULTS, julia }), c: set.c }));
      const good = f > 0.01 && f < 0.95;
      ok &&= good;
      lines.push(`[${good ? 'ok ' : 'BAD'}] ${key} ${julia ? 'Julia' : 'Mandelbrot'}: ${(100 * f).toFixed(1)}% of pixels hit`);
    }
  }
  const c = SETS.chi_l.c;
  const hand = diff(renderer.mask('cube_l', { ...view, c }), renderer.mask('cube_r', { ...view, c }));
  const handOk = hand > 0.002;
  ok &&= handOk;
  lines.push(`[${handOk ? 'ok ' : 'BAD'}] hand: (zz)z and z(zz) Julia masks differ on ${(100 * hand).toFixed(2)}% of pixels`);

  // C2 on the generic plane θ = 0.4, at C clearly in (bounded for twice the steps) or clearly out (escapes by 100).
  const cs = [];
  for (let i = 0; i < 24; i++) for (let k = 0; k < 16; k++) cs.push(cFromPlane(-0.9 + 1.8 * (k + 0.5) / 16, -1.5 + 3 * (i + 0.5) / 24, 0.4));
  for (const [bracket, map] of [['L', 'cube_l'], ['R', 'cube_r']]) {
    const sure = cs.filter(c => { const n = escape(CUBES[bracket], c)[0]; return n <= 100 || (n === STEPS && twice(CUBES[bracket], c)); });
    const host = renderer.bounded(map, sure, STEPS - 2);
    const bad = sure.filter((c, i) => host[i] !== (escape(CUBES[bracket], c)[0] === STEPS)).length;
    ok &&= bad === 0;
    lines.push(`[${bad === 0 ? 'ok ' : 'BAD'}] C2 ${bracket}: shader and picker agree on ${sure.length - bad}/${sure.length} C`);
  }

  // Q symmetry: C on the real axis, two different cuts β. Any change beyond float noise means the map is not Hamilton.
  const qc = [-1, 0, 0, 0], qview = { ...frameState({ ...DEFAULTS, set: 'q' }), c: qc };
  const sym = diff(renderer.mask('qsquare', { ...qview, beta: 0.47 }), renderer.mask('qsquare', { ...qview, beta: 1.6 }));
  const symOk = sym < 0.002;
  ok &&= symOk;
  lines.push(`[${symOk ? 'ok ' : 'BAD'}] Q symmetry: q_j at real C, β 27° vs 92°, masks differ on ${(100 * sym).toFixed(2)}% of pixels`);
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
window.__viewer = { ready: true, state, render, check };
