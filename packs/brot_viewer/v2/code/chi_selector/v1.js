// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// chi_selector / v1 — codetree:chi_selector/v1. The chi-slice C picker: a clickable slice of the CUBIC parameter
// sets (zz)z + c and z(zz) + c, the cubic twin of c_selector. Distilled from Orac/insights' cubic_bslice.js.
//
// Membership: forward orbit of z0 = 0 under cube(z) + c, 200 steps, escape at |z|² > 64, cubes from bristor_cube.
// Slice plane: c_selector's. c = cFromPlane(Re, s, θ), with s along (cos θ, sin θ) in (i, j). The cube sets are
// taller than wide, so s runs horizontally and Re vertically.
//
// Control C1 (the plane control): (zz)z and z(zz) agree EXACTLY on the subalgebra planes θ = 0, π/2, −π/4 (the orbit
// of 0 never leaves them, and there the two bracketings are one map), and differ off them. It fires if a zero plane
// shows a difference (the slice is not feeding the maps the c it draws) or the generic plane shows none (the two
// maps collapsed onto one).
//
// The file is also its own module Worker: slices render off the main thread (a full slice takes ~200 ms).
import { cubeL, cubeR } from '../bristor_cube/v1.js';
import { cFromPlane, planeForC, drawThetaDial } from '../c_selector/v1.js';

export const VIEW3 = { sMin: -1.6, sMax: 1.6, reMin: -1, reMax: 1 };
// s spans ±1.6 on any canvas; Re follows the aspect so pixels stay square (256×160 gives VIEW3 exactly).
export const viewFor = (W, H) => { const r = (VIEW3.sMax - VIEW3.sMin) / 2 * H / W; return { ...VIEW3, reMin: -r, reMax: r }; };
export const STEPS = 200, ESC2 = 64;
export const C1_THETAS = [0, Math.PI / 2, -Math.PI / 4, 0.4];   // three subalgebra planes, then one generic plane
export const MAPS = { L: cubeL, R: cubeR };

const COL = { in: [3, 4, 8], L: [232, 78, 222], R: [92, 220, 120] };
const FAR = [16, 20, 34], EMBER = [240, 140, 60];

// → [n, r2]; n === STEPS means bounded.
export function escape(f, c) {
  let z = [0, 0, 0];
  for (let n = 0; n < STEPS; n++) {
    const r2 = z[0] * z[0] + z[1] * z[1] + z[2] * z[2];
    if (r2 > ESC2) return [n, r2];
    const q = f(z);
    z = [q[0] + c[0], q[1] + c[1], q[2] + c[2]];
  }
  return [STEPS, z[0] * z[0] + z[1] * z[1] + z[2] * z[2]];
}
export const inSet = (bracket, c) => escape(MAPS[bracket], c)[0] === STEPS;

const smooth = ([n, r2]) => Math.max(0, n - Math.log2(Math.log2(Math.max(r2, 4.01))));
const outside = t => { const k = Math.pow(Math.min(1, t), 1.3); return FAR.map((v, i) => v + (EMBER[i] - v) * k | 0); };

// which: 'both' (L only magenta, R only green, both in dark, both out ember), or 'L' / 'R' alone.
// Pixel centres: s = sMin + (px + ½)/W·range, Re = reMax − (py + ½)/H·range.
export function renderSlice({ theta, W, H, which = 'both', view = VIEW3 }) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  let inL = 0, inR = 0, onlyL = 0, onlyR = 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const s = view.sMin + (px + 0.5) / W * (view.sMax - view.sMin);
    const re = view.reMax - (py + 0.5) / H * (view.reMax - view.reMin);
    const c = cFromPlane(re, s, theta);
    const a = which !== 'R' ? escape(cubeL, c) : null, b = which !== 'L' ? escape(cubeR, c) : null;
    const aIn = !!a && a[0] === STEPS, bIn = !!b && b[0] === STEPS;
    if (aIn) inL++;
    if (bIn) inR++;
    if (a && b && aIn && !bIn) onlyL++;
    if (a && b && bIn && !aIn) onlyR++;
    const col = which === 'both'
      ? (aIn && bIn ? COL.in : aIn ? COL.L : bIn ? COL.R : outside((smooth(a) + smooth(b)) / 32))
      : ((a || b)[0] === STEPS ? COL.in : outside(smooth(a || b) / 16));
    rgba.set([...col, 255], (py * W + px) * 4);
  }
  return { rgba, W, H, theta, which, inL, inR, onlyL, onlyR };
}

// C1 over the four planes. pass: zero difference on the three subalgebra planes, some on the generic one.
export function planeControl({ W = 256, H = 160, view = VIEW3 } = {}) {
  const rows = C1_THETAS.map(theta => {
    const r = renderSlice({ theta, W, H, which: 'both', view });
    return { theta, diff: r.onlyL + r.onlyR, inL: r.inL, inR: r.inR };
  });
  return { rows, pass: rows.slice(0, 3).every(r => r.diff === 0) && rows[3].diff > 0 };
}

// The picker, for a page. Same API as c_selector's createCSelector (setC, setTheta, alignToC, get, redraw), so a
// page can swap one for the other. Slices render in a worker, latest request wins: half-res while θ moves,
// full-res once it settles. overlay(ctx, {X, Y, proj, theta}) lets the page draw its own marks under the marker.
export function createCubeSelector(canvas, { which = 'both', onSelect = () => {}, onState = () => {}, onSlice = () => {}, overlay = null } = {}) {
  const ctx = canvas.getContext('2d'), low = document.createElement('canvas'), lctx = low.getContext('2d');
  const view = viewFor(canvas.width, canvas.height);
  const worker = new Worker(import.meta.url, { type: 'module' });
  let theta = 0, cur = [0, 0, 0], img = null, busy = false, want = null, settle = 0, id = 0, stats = null;

  const pump = () => { if (!want) return; busy = true; worker.postMessage(want); want = null; };
  function request(full) {
    const k = full ? 1 : 2;
    want = { kind: 'slice', id: ++id, theta, which, W: canvas.width / k | 0, H: canvas.height / k | 0, view };
    if (!busy) pump();
    if (!full) { clearTimeout(settle); settle = setTimeout(() => request(true), 180); }
  }
  worker.onmessage = ({ data: d }) => {
    busy = false;
    if (d.kind === 'slice') {
      low.width = d.W; low.height = d.H;
      lctx.putImageData(new ImageData(d.rgba, d.W, d.H), 0, 0);
      img = low;
      stats = { theta: d.theta, which: d.which, W: d.W, inL: d.inL, inR: d.inR, onlyL: d.onlyL, onlyR: d.onlyR };
      draw();
    } else stats = { error: d.message };
    onSlice(stats);
    pump();
  };

  const X = s => (s - view.sMin) / (view.sMax - view.sMin) * canvas.width;
  const Y = re => (view.reMax - re) / (view.reMax - view.reMin) * canvas.height;
  const proj = c => ({ s: c[1] * Math.cos(theta) + c[2] * Math.sin(theta), off: -c[1] * Math.sin(theta) + c[2] * Math.cos(theta) });

  function draw() {
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }
    ctx.strokeStyle = '#ffffff38'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, Y(0) + 0.5); ctx.lineTo(canvas.width, Y(0) + 0.5);
    ctx.moveTo(X(0) + 0.5, 0); ctx.lineTo(X(0) + 0.5, canvas.height); ctx.stroke();
    ctx.fillStyle = '#ffffff66'; ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('s →', canvas.width - 24, Y(0) - 3); ctx.fillText('Re ↑', X(0) + 3, 10);
    if (overlay) overlay(ctx, { X, Y, proj, theta });
    const p = proj(cur), mx = X(p.s), my = Y(cur[0]);
    ctx.strokeStyle = '#fff4aa'; ctx.lineWidth = 1.5;
    if (Math.abs(p.off) > 1e-6) ctx.setLineDash([2, 2]);                 // dashed: c lies off this plane
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff4aa'; ctx.fillRect(mx - 1, my - 1, 2, 2);
    drawThetaDial(ctx, theta, { vector: [cur[1], cur[2]] });
    onState({ theta, c: cur.slice(), signedImag: p.s, signedOffPlane: p.off, offPlane: Math.abs(p.off) });
  }

  canvas.addEventListener('click', e => {
    const b = canvas.getBoundingClientRect();
    let s = view.sMin + (e.clientX - b.left) / b.width * (view.sMax - view.sMin);
    let re = view.reMax - (e.clientY - b.top) / b.height * (view.reMax - view.reMin);
    if (Math.abs(s) < (view.sMax - view.sMin) / b.width * 0.6) s = 0;       // the drawn axes are exact inputs
    if (Math.abs(re) < (view.reMax - view.reMin) / b.height * 0.6) re = 0;
    cur = cFromPlane(re, s, theta);
    draw();
    onSelect(cur.slice(), { theta, signedImag: s });
  });

  function setC(c, { align = true } = {}) {
    cur = c.map(Number);
    if (align) {
      const t = planeForC(cur).theta;
      if (Math.abs(Math.sin((t - theta) / 2)) > 1e-7) { theta = t; request(true); }
    }
    draw();
  }
  function setTheta(v) {
    if (!Number.isFinite(v)) throw Error('A finite slice theta is required.');
    const t = Math.max(-Math.PI, Math.min(Math.PI, v));
    if (Math.abs(t - theta) > 1e-12) { theta = t; request(false); }
    draw();
    return theta;
  }
  setTimeout(() => { if (!img && !busy && !want) request(true); }, 0);   // first slice, unless setC/setTheta asked

  return {
    setC, setTheta, setWhich: w => { which = w; request(true); }, alignToC: () => setC(cur, { align: true }), redraw: draw, view,
    get: () => { const p = proj(cur); return { theta, which, c: cur.slice(), signedImag: p.s, signedOffPlane: p.off, offPlane: Math.abs(p.off), slice: stats }; },
  };
}

// Worker side of the same file.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data: q }) => {
    try {
      if (q.kind === 'slice') { const r = renderSlice(q); self.postMessage({ kind: 'slice', id: q.id, ...r }, [r.rgba.buffer]); }
      else if (q.kind === 'c1') self.postMessage({ kind: 'c1', ...planeControl(q) });
    } catch (e) { self.postMessage({ kind: 'error', of: q.kind, message: String(e?.message || e) }); }
  };
}
