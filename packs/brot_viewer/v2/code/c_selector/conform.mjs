#!/usr/bin/env node
// Conformance for c_selector/v1 — CodeT (Re, i, j) under T-049.
//  witness:   bSquare([0,1,1]) = [−2, −1, +1]
//  sabotage:  a double-flipped square (relabel + hand flip twice) gives [−2, +1, −1] and is caught
//  expansion: bSquare equals the direct expansion of (x + y·i + z·j)² with i·i = j·j = −1, i·j = j, j·i = −i
//  plane:     cFromPlane(planeForC(c)) recovers c; θ = atan2(j, i) up to the sign convention of signedImag
//  identity:  escapeAt equals the pre-CodeT inline loop exactly (escaped, iteration, r2) on 2,000 random c
import { bSquare, escapeAt, planeForC, cFromPlane } from './v1.js';

const eq = (a, b, tol = 0) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) <= tol);
// (x + y i + z j)² from the multiplication table, term by term
const tableSquare = ([x, y, z]) => {
  // products of units, as [Re, i, j]: 1·1=1, i·i=−1, j·j=−1, i·j=j, j·i=−i
  const mul = { '11': [1, 0, 0], '1i': [0, 1, 0], '1j': [0, 0, 1], 'i1': [0, 1, 0], 'ii': [-1, 0, 0], 'ij': [0, 0, 1], 'j1': [0, 0, 1], 'ji': [0, -1, 0], 'jj': [-1, 0, 0] };
  const terms = [['1', x], ['i', y], ['j', z]], out = [0, 0, 0];
  for (const [u, a] of terms) for (const [v, b] of terms) { const m = mul[u + v]; for (let k = 0; k < 3; k++) out[k] += a * b * m[k]; }
  return out;
};
const doubleFlip = ([x, y, z]) => [x * x - y * y - z * z, -y * (2 * x - z), -z * (2 * x + y)];
const legacyEscape = (c, maxIter = 96) => { let x = 0, y = 0, z = 0, r2 = 0; for (let i = 0; i < maxIter; i++) { r2 = x * x + y * y + z * z; if (r2 > 64) return { escaped: true, iteration: i, r2 }; const nx = x * x - y * y - z * z + c[0], ny = y * (2 * x - z) + c[1], nz = z * (2 * x + y) + c[2]; x = nx; y = ny; z = nz; } return { escaped: false, iteration: maxIter, r2: x * x + y * y + z * z }; };

let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const samples = Array.from({ length: 2000 }, () => [rnd() * 2.75 - 2, rnd() * 2.2 - 1.1, rnd() * 2.2 - 1.1]);
const out = {
  witness: bSquare([0, 1, 1]),
  pass: {
    witness_ReIJ: eq(bSquare([0, 1, 1]), [-2, -1, 1]),
    sabotage_doubleFlipCaught: !eq(doubleFlip([0, 1, 1]), [-2, -1, 1]) && eq(doubleFlip([0, 1, 1]), [-2, 1, -1]),
    expansionMatchesTable: samples.slice(0, 200).every((z) => eq(bSquare(z), tableSquare(z), 1e-12)),
    planeRoundTrip: samples.slice(0, 200).every((c) => { const p = planeForC(c); return eq(cFromPlane(c[0], p.signedImag, p.theta), c, 1e-12); }),
    escapeIdenticalToLegacy: samples.every((c) => { const a = escapeAt(c), b = legacyEscape(c); return a.escaped === b.escaped && a.iteration === b.iteration && a.r2 === b.r2; }),
  },
};
console.log(JSON.stringify(out, null, 1));
process.exitCode = Object.values(out.pass).every(Boolean) ? 0 : 1;
