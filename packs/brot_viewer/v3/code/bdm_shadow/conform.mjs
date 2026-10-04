#!/usr/bin/env node
// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// Conformance for bdm_shadow/v1.js against vectors.json (reference.py, double precision).
//
//   node conform.mjs              // checks ./v1.js: light direction, threshold rule, Halton, light-disk points
//   node conform.mjs ./my_port.js // checks your port (same export names)
//   node conform.mjs --selftest   // shows the check FAILS on planted mistakes
//
// Also checks properties the tables alone would not: every disk point lies in the unit disk, the first 256 cover
// all four quadrants, and the threshold falls as the light grows.
import { readFileSync } from 'node:fs';

const V = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url))).js;
const TOL = 1e-12;
const near = (a, b) => Math.abs(a - b) <= TOL;

function run(F) {
  const fails = [];
  for (const [az, el, d] of V.lightDir) if (!F.bdsLightDir(az, el).every((x, k) => near(x, d[k]))) fails.push(`lightDir(${az}, ${el})`);
  for (const [s, th] of V.threshold) if (!near(F.bdsThreshold(s), th)) fails.push(`threshold(${s})`);
  for (const [i, b, h] of V.halton) if (!near(F.halton(i, b), h)) fails.push(`halton(${i}, ${b})`);
  for (const [i, d] of V.disk) if (!F.bdsDisk(i).every((x, k) => near(x, d[k]))) fails.push(`disk(${i})`);
  const pts = Array.from({ length: 256 }, (_, i) => F.bdsDisk(i));
  if (!pts.every(([x, y]) => x * x + y * y <= 1 + 1e-12)) fails.push('a disk point lies outside the unit disk');
  if (new Set(pts.slice(1).map(([x, y]) => (x > 0) * 2 + (y > 0))).size !== 4) fails.push('disk points miss a quadrant');
  if (!(F.bdsThreshold(0.03) > F.bdsThreshold(0.08) && F.bdsThreshold(0.08) > F.bdsThreshold(0.2))) fails.push('threshold does not fall with light size');
  return fails;
}

const PLANTS = {
  'disk radius not square-rooted (centre-heavy)': F => ({ ...F, bdsDisk: i => { const r = F.halton(i, 5), a = 2 * Math.PI * F.halton(i, 7); return [r * Math.cos(a), r * Math.sin(a)]; } }),
  'disk drawn from the pixel-jitter bases 2, 3': F => ({ ...F, bdsDisk: i => { const r = Math.sqrt(F.halton(i, 2)), a = 2 * Math.PI * F.halton(i, 3); return [r * Math.cos(a), r * Math.sin(a)]; } }),
  'threshold exponent sign flipped': F => ({ ...F, bdsThreshold: s => 0.3 * Math.pow(s / 0.08, 0.75) }),
  'light az measured from +x': F => ({ ...F, bdsLightDir: (az, el) => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)] }),
};

const arg = process.argv[2];
const F = await import(arg && arg !== '--selftest' ? new URL(arg, `file://${process.cwd()}/`) : new URL('./v1.js', import.meta.url));
if (arg === '--selftest') {
  let allOk = true;
  for (const [name, f, want] of [['v1.js as shipped', x => x, true], ...Object.entries(PLANTS).map(([n, p]) => [n, p, false])]) {
    const ok = run(f(F)).length === 0, good = ok === want; allOk &&= good;
    console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(allOk ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED');
  process.exit(allOk ? 0 : 1);
}
const fails = run(F);
console.log(`  JS face: ${V.lightDir.length} light directions, ${V.threshold.length} thresholds, ${V.halton.length} Halton values, ${V.disk.length} disk points (tol ${TOL}); disk bounds, quadrants, threshold order`);
for (const f of fails) console.log('  FAIL ' + f);
console.log(fails.length ? 'FAIL' : 'PASS');
process.exit(fails.length ? 1 : 0);
