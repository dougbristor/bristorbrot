// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// Conformance for a JavaScript port of the Bristorian cubes (twin of conform.py).
//
//   node conform.mjs ./my_port.mjs   // exports cubeL, cubeR, JvL, JvR
//   node conform.mjs --selftest      // shows the check failing on planted mistakes
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mul } from '../bristor_product/v1.js';

const V = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
const KEYS = { cubeL: 'cube_l', cubeR: 'cube_r', JvL: 'jv_l', JvR: 'jv_r' };
const maxdiff = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

export function check(F, quiet = false) {
  let tested = 0, skipped = 0, worst = 0; const fails = [];
  V.rows.forEach((r, i) => {
    let out;
    try {
      out = { cubeL: F.cubeL(r.z), cubeR: F.cubeR(r.z), JvL: F.JvL(r.z, r.v), JvR: F.JvR(r.z, r.v) };
      if (Object.values(out).some(o => o.length !== r.n + 1)) throw 0;
    } catch { skipped++; return; }
    tested++;
    for (const [k, col] of Object.entries(KEYS)) {
      const d = maxdiff(out[k], r[col]); worst = Math.max(worst, d);
      if (!(d <= V.tolerance)) fails.push(`row ${i} (n=${r.n}) ${k}`);
    }
  });
  const ok = tested > 0 && fails.length === 0;
  if (!quiet) {
    console.log(`  ${tested} rows tested, ${skipped} skipped, max |diff| from canon = ${worst}`);
    if (fails.length) console.log('  first failures: ' + fails.slice(0, 4).join(', '));
    console.log(ok ? 'PASS' : 'FAIL');
  }
  return ok;
}

async function selftest() {
  const bc = await import('./v1.js');
  const add = (a, b) => a.map((x, k) => x + b[k]);
  const arms = [['v1.js as shipped', bc, true],
    ['brackets exchanged', { ...bc, cubeL: bc.cubeR, cubeR: bc.cubeL }, false],
    ['derivative drops the (z z) v term', { ...bc, JvL: (z, v) => mul(add(mul(z, v), mul(v, z)), z) }, false],
    ['cube from the square alone: both brackets = (z z) z', { ...bc, cubeR: bc.cubeL }, false]];
  let all = true;
  for (const [name, F, want] of arms) {
    const got = check(F, true), good = got === want; all &&= good;
    console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${got ? 'PASS' : 'FAIL'}`);
  }
  console.log(all ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED');
  return all;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node conform.mjs ./my_port.mjs | --selftest'); process.exit(2); }
  const ok = arg === '--selftest' ? await selftest() : check(await import(pathToFileURL(resolve(arg)).href));
  process.exit(ok ? 0 : 1);
}
