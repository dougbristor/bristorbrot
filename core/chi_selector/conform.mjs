// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// Conformance for chi_selector v1: the plane control C1 on a 256×160 grid, against Orac's numbers (scout 09-26).
//
//   node conform.mjs              // checks ./v1.js
//   node conform.mjs --selftest   // shows the check failing on planted mistakes
//
// Expected: (zz)z and z(zz) differ on 0 / 0 / 0 pixels on the planes θ = 0, π/2, −π/4 (subalgebras, where the
// brackets are one map) and on exactly 1812 at θ = 0.4. The exact count also catches a slice that is wrong
// in a way C1's zero planes cannot see (for example Re and s exchanged).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EXPECT = { diffs: [0, 0, 0, 1812], inL: [11544, 11544, 12350, 10768], inR: [11544, 11544, 12350, 9850] };

export async function check(url, quiet = false) {
  const { planeControl } = await import(url);
  const { rows } = planeControl({ W: 256, H: 160 });
  const ok = rows.every((r, i) => r.diff === EXPECT.diffs[i] && r.inL === EXPECT.inL[i] && r.inR === EXPECT.inR[i]);
  if (!quiet) {
    for (const r of rows) console.log(`  θ = ${r.theta.toFixed(3)}: L≠R on ${r.diff} pixels (in L ${r.inL}, in R ${r.inR})`);
    console.log(ok ? 'PASS' : `FAIL (expected L≠R ${EXPECT.diffs.join(' / ')})`);
  }
  return ok;
}

const PLANTS = {
  'maps collapsed (R = L)': s => s.replace("b = which !== 'L' ? escape(cubeR, c)", "b = which !== 'L' ? escape(cubeL, c)"),
  'slice sign slip (e1 flipped)': s => s.replace('const c = cFromPlane(re, s, theta);', 'const c0 = cFromPlane(re, s, theta), c = [c0[0], -c0[1], c0[2]];'),
  'Re and s exchanged': s => s.replace('const c = cFromPlane(re, s, theta);', 'const c = cFromPlane(s, re, theta);'),
};

async function selftest() {
  const src = readFileSync(new URL('./v1.js', import.meta.url), 'utf8');
  const arms = [['v1.js as shipped', src, true], ...Object.entries(PLANTS).map(([n, f]) => [n, f(src), false])];
  let all = true;
  for (const [i, [name, code, want]] of arms.entries()) {
    if (!want && code === src) { console.log(`[BAD] ${name}: plant did not apply`); all = false; continue; }
    const tmp = new URL(`./.plant_${i}.mjs`, import.meta.url);                 // beside v1.js, so its imports resolve
    writeFileSync(tmp, code);
    try {
      const got = await check(tmp.href, true), good = got === want; all &&= good;
      console.log(`[${good ? 'ok ' : 'BAD'}] ${name}: expected ${want ? 'PASS' : 'FAIL'}, got ${got ? 'PASS' : 'FAIL'}`);
    } finally { rmSync(tmp); }
  }
  console.log(all ? 'selftest: all arms behaved as expected' : 'selftest: SOME ARM MISBEHAVED');
  return all;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = process.argv[2] === '--selftest' ? await selftest() : await check(new URL('./v1.js', import.meta.url).href);
  process.exit(ok ? 0 : 1);
}
