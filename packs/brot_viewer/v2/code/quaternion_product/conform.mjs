// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// Conformance for a JavaScript port of the Hamilton quaternion product (twin of conform.py).
//
//   node conform.mjs ./my_port.mjs   // exports mul(a, b), square(z), Jv(z, v)
//   node conform.mjs --selftest      // shows the check failing on planted mistakes
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const V = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
const md = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

export function check(P, quiet = false) {
  let worst = 0; const fails = [];
  V.rows.forEach((r, i) => {
    const out = { mul: P.mul(r.a, r.b), square: P.square(r.a), jv: P.Jv(r.a, r.v) };
    for (const [k, o] of Object.entries(out)) { const d = md(o, r[k]); worst = Math.max(worst, d); if (!(d <= V.tolerance)) fails.push(`row ${i} ${k}`); }
  });
  if (!quiet) { console.log(`  ${V.rows.length} rows (mul, square, Jv), max |diff| = ${worst}`); if (fails.length) console.log('  first failures: ' + fails.slice(0, 4).join(', ')); console.log(fails.length ? 'FAIL' : 'PASS'); }
  return fails.length === 0;
}

async function selftest() {
  const qp = await import('./v1.js'), bp = await import('../bristor_product/v1.js');
  const arms = [['v1.js as shipped', qp, true],
    ['Bristorian product', { mul: bp.mul, square: bp.square, Jv: (z, v) => bp.mul(z, v).map((x, k) => x + bp.mul(v, z)[k]) }, false],
    ['operands swapped', { ...qp, mul: (a, b) => qp.mul(b, a) }, false],
    ['real part read from slot w', { ...qp, mul: (a, b) => { const r = qp.mul([a[3], ...a.slice(0, 3)], [b[3], ...b.slice(0, 3)]); return [r[1], r[2], r[3], r[0]]; } }, false]];
  let all = true;
  for (const [name, P, want] of arms) {
    const got = check(P, true), good = got === want; all &&= good;
    console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${got ? 'PASS' : 'FAIL'}`);
  }
  console.log(all ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED');
  return all;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node conform.mjs ./my_port.mjs | --selftest'); process.exit(2); }
  process.exit((arg === '--selftest' ? await selftest() : check(await import(pathToFileURL(resolve(arg)).href))) ? 0 : 1);
}
