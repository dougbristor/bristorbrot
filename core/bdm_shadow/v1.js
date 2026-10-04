// SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
// codetree:bdm_shadow/v1 — the CPU side of the shadow: the light's direction, the last-step threshold for its size,
// and the light-disk points the refine samples. Planted 2026-10-04 by git from insights' shadow_lab render.js (10-03).

// The lab's defaults: 32 live steps, ray start 8 camera-hit tolerances off the surface, last-step estimator with a
// soft threshold, light radius 0.08 rad (4.6°) from the old fixed key light (-0.5, 0.75, -0.45).
export const SHADOW_DEFAULTS = { steps: 32, bias: 8, est: 1, th0: 0.3, soft: 0.5, size: 0.08, az: -2.303611, el: 0.839692 };

// Unit vector toward a light at azimuth az, elevation el (radians); +y is up.
export function bdsLightDir(az, el) {
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

// The last-step threshold for a light of angular radius `size` (radians). The best threshold falls with size; the lab
// fitted th0 (0.08 / size)^0.75 over 5 sizes x 4 scenes and scored it leave-one-scene-out (10-03 c).
export function bdsThreshold(size, th0 = SHADOW_DEFAULTS.th0) {
  return th0 * Math.pow(0.08 / size, 0.75);
}

// Radical inverse of i in base b: the Halton sequence.
export function halton(i, b) {
  let f = 1, r = 0;
  for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); }
  return r;
}

// Sample i's point on the unit light disk: Halton bases 5 and 7, area-uniform, so it does not correlate with a
// sub-pixel jitter drawn from bases 2 and 3.
export function bdsDisk(i) {
  const r = Math.sqrt(halton(i, 5)), a = 2 * Math.PI * halton(i, 7);
  return [r * Math.cos(a), r * Math.sin(a)];
}
