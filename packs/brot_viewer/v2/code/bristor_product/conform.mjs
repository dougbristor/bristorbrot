// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// Conformance check for a port of the Bristorian product / square (JavaScript twin of conform.py).
//
//   node conform.mjs ./my_port.mjs     // your module exports square(z), mul(a, b) and/or squareJacobian(z)
//   node conform.mjs --selftest        // shows that the check can fail, and how
//
// Numbers are rank-indexed arrays: z[0] is the real part, z[a] is e_a (a = 1..n).
// The rule:  e_a * e_b = sgn(b - a) * e_b  (a != b),   e_a * e_a = -1.
//
// A port PASSES only if it matches the 'canon' column. If it fails, this names the wrong rule
// it matches instead. Cases your port cannot take (throws, wrong length) are skipped and
// reported, never counted as passes. Licence: MIT. Source: bristorbrot.org.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const V = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
const TOL = V.tolerance * 1e3;

const DIAGNOSIS = {
  j_roll: 'rank order reversed: you have the legacy table e_a*e_b = sgn(a-b)*e_b. Check sgn(b - a), and check e1 sits in slot 1 (the slot after the real part).',
  opposite: 'the LEFT operand survives in your products. It should be the right one: e_a*e_b is a multiple of e_b. (Squares cannot show this; only products can.)',
  quaternion: 'this is quaternion multiplication (ij = k). Bristorian products land back on a factor: e1*e2 = +e2, e2*e1 = -e1.',
};

const maxdiff = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

function run(name, fn, rows, argsOf) {
  let tested = 0, worst = 0, firstFail = null; const skipped = {};
  const matches = Object.fromEntries(Object.keys(DIAGNOSIS).map(k => [k, true]));
  for (const r of rows) {
    let out;
    try { out = Array.from(fn(...argsOf(r))); if (out.length !== r.canon.length) throw 0; }
    catch { skipped[r.n] = (skipped[r.n] || 0) + 1; continue; }
    tested++;
    const d = maxdiff(out, r.canon);
    if (d > worst) worst = d;
    if (d > TOL && !firstFail) firstFail = [r, out];
    for (const k in DIAGNOSIS) if (r[k] != null && maxdiff(out, r[k]) > TOL) matches[k] = false;
  }
  if (!tested) return ['SKIP', [`  ${name}: no case could be run`]];
  const ok = worst <= TOL;
  const lines = [`  ${name}: ${tested} cases, max |diff| from canon = ${worst.toPrecision(3)}` +
    (Object.keys(skipped).length ? `; skipped n=${JSON.stringify(skipped)}` : '')];
  if (!ok) {
    const [r, out] = firstFail;
    lines.push(`    first failing case n=${r.n} input=${JSON.stringify(r.z ?? [r.a, r.b])}`,
      `      expected ${JSON.stringify(r.canon)}`, `      got      ${JSON.stringify(out)}`);
    const hits = Object.keys(matches).filter(k => matches[k]);
    for (const k of hits) lines.push(`    DIAGNOSIS (${k}): ${DIAGNOSIS[k]}`);
    if (!hits.length) lines.push('    DIAGNOSIS: matches none of the known wrong rules; check signs term by term.');
  }
  return [ok ? 'PASS' : 'FAIL', lines];
}

export function check(square, mul, quiet = false, jac = null) {
  const results = [], out = [];
  if (square) { const [v, l] = run('square(z)', square, V.square, r => [[...r.z]]); results.push(v); out.push(...l); }
  if (mul) { const [v, l] = run('mul(a, b)', mul, V.product, r => [[...r.a], [...r.b]]); results.push(v); out.push(...l); }
  if (jac) { const [v, l] = run('squareJacobian(z)', jac, V.jacobian || [], r => [[...r.z]]); results.push(v); out.push(...l); }
  if (!mul) out.push('  NOTE: square alone cannot tell this algebra from its opposite (they square identically). Provide mul(a, b) to certify the hand.');
  const verdict = results.includes('FAIL') ? 'FAIL' : results.includes('PASS') ? 'PASS' : 'SKIP';
  if (!quiet) console.log(out.join('\n'));
  return [verdict, out];
}

// ---- fast = general: a module that ships unrolled fixed-n paths beside its general loop -----------
// If the port exports mulN (and optionally squareN, jv), every dispatching face must agree with the
// general loop at n = 1..5 BITWISE (max |diff| = 0), and jv must equal z·v + v·z from mulN. The vectors already pin mul/square
// to the canon; this arm covers jv (which no vector reaches) and catches a fast path that drifts
// from its own general loop.
export function checkFaces(mod, quiet = false) {
  if (!mod.mulN) return ['SKIP', ['  fast = general: no mulN exported, nothing to compare']];
  let s = 12345; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 4 - 2;
  const worst = { mul: 0, square: 0, jv: 0 }; let cases = 0;
  for (let n = 1; n <= 5; n++) for (let k = 0; k < 400; k++) {
    const a = Array.from({ length: n + 1 }, r), b = Array.from({ length: n + 1 }, r);
    worst.mul = Math.max(worst.mul, maxdiff(mod.mul(a, b), mod.mulN(a, b)));
    if (mod.square && mod.squareN) worst.square = Math.max(worst.square, maxdiff(mod.square(a), mod.squareN(a)));
    if (mod.jv) { const p = mod.mulN(a, b), q = mod.mulN(b, a); worst.jv = Math.max(worst.jv, maxdiff(mod.jv(a, b), p.map((x, i) => x + q[i]))); }
    cases++;
  }
  const tol = 0, ok = Object.values(worst).every(w => w <= tol); // bitwise: a fast path must not reorder rounding
  const lines = [`  fast = general (n = 1..5, ${cases} cases): max |diff| mul ${worst.mul.toPrecision(2)}, square ${worst.square.toPrecision(2)}, jv ${worst.jv.toPrecision(2)}`];
  if (!quiet) console.log(lines.join('\n'));
  return [ok ? 'PASS' : 'FAIL', lines];
}

// ---- reference rules, used only by --selftest ---------------------------------------------
const sgn = v => (v > 0) - (v < 0);
const makeMul = rule => (p, q) => {
  const n = p.length - 1, r = new Array(n + 1).fill(0);
  r[0] = p[0] * q[0];
  for (let a = 1; a <= n; a++) {
    r[a] += p[0] * q[a] + p[a] * q[0]; r[0] -= p[a] * q[a];
    for (let b = 1; b <= n; b++) if (a !== b) {
      const t = p[a] * q[b];
      if (rule === 'canon') r[b] += sgn(b - a) * t;
      else if (rule === 'j_roll') r[b] += sgn(a - b) * t;
      else r[a] += sgn(a - b) * t; // opposite
    }
  }
  return r;
};
const quat = (p, q) => {
  if (p.length !== 4) throw new Error('quaternions are 4-D');
  const [w1, x1, y1, z1] = p, [w2, x2, y2, z2] = q;
  return [w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2,
          w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2];
};
const makeJac = mul => z => {
  const m = z.length, cols = [];
  for (let k = 0; k < m; k++) { const e = z.map((_, i) => +(i === k)); const a = mul(z, e), b = mul(e, z); cols.push(a.map((x, i) => x + b[i])); }
  const J = []; for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) J.push(cols[c][r]); return J;
};
const R = v => [v[0], ...v.slice(1).reverse()];
const reversedSlots = mul => (p, q) => R(mul(R(p), R(q)));

function selftest() {
  const canon = makeMul('canon');
  const arms = [['canon', canon, 'PASS'], ['legacy j_roll table', makeMul('j_roll'), 'FAIL'],
    ['opposite algebra', makeMul('opposite'), 'FAIL'], ['quaternion', quat, 'FAIL'],
    ['canon with slots reversed', reversedSlots(canon), 'FAIL']];
  let bad = 0;
  for (const [name, mul, want] of arms) {
    const [got, lines] = check(z => mul(z, z), mul, true, makeJac(mul));
    bad += got !== want;
    console.log(`[${got === want ? 'ok ' : 'BAD'}] ${name}: expected ${want}, got ${got}`);
    for (const l of new Set(lines.filter(l => l.includes('DIAGNOSIS')).map(l => l.trim()))) console.log('      ' + l);
  }
  const cj = makeJac(canon);
  const transposed = z => { const J = cj(z), m = z.length, T = []; for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) T.push(J[c * m + r]); return T; };
  const [gotT] = check(null, null, true, transposed);
  bad += gotT !== 'FAIL';
  console.log(`[${gotT === 'FAIL' ? 'ok ' : 'BAD'}] transposed Jacobian (J^T for J): expected FAIL, got ${gotT}`);
  const opp = makeMul('opposite');
  const [got] = check(z => opp(z, z), null, true);
  bad += got !== 'PASS';
  console.log(`[${got === 'PASS' ? 'ok ' : 'BAD'}] opposite algebra, square only: expected PASS (squaring is blind to the hand), got ${got}`);
  // a fast path that drifts from its own general loop: jv3 with one sign flipped (no vector reaches jv)
  const gen = makeMul('canon');
  const drift = { mulN: gen, mul: gen, jv: (z, v) => { const a = gen(z, v), b = gen(v, z), o = a.map((x, i) => x + b[i]); if (z.length === 4) o[2] -= 2 * z[2] * v[3]; return o; } };
  const [gotF] = checkFaces(drift, true);
  bad += gotF !== 'FAIL';
  console.log(`[${gotF === 'FAIL' ? 'ok ' : 'BAD'}] fast path drifting from general (jv3 sign slip): expected FAIL, got ${gotF}`);
  console.log('selftest:', bad ? `${bad} arm(s) misbehaved` : 'all arms behaved as expected');
  return !bad;
}

const arg = process.argv[2];
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!arg) { console.log('usage: node conform.mjs <port.mjs> | --selftest'); process.exit(2); }
  if (arg === '--selftest') process.exit(selftest() ? 0 : 1);
  const mod = await import(pathToFileURL(resolve(arg)).href);
  if (!mod.square && !mod.mul && !mod.squareJacobian) { console.log('your module must export square(z), mul(a, b) and/or squareJacobian(z)'); process.exit(2); }
  const [v1] = check(mod.square, mod.mul, false, mod.squareJacobian);
  const [v2] = checkFaces(mod);
  const verdict = [v1, v2].includes('FAIL') ? 'FAIL' : v1;
  console.log(verdict); process.exit(verdict === 'PASS' ? 0 : 1);
}
