---
name: Fast B2 field, derivative rescale, normal and march — port contract
status: measured
confidence: medium
created: 2026-10-04
contributors: [caro, git, insights]
license: MIT code; CC0 vectors; CC-BY 4.0 text
---

# B2 export: one field, three consumers

`b2_v1.glsl` is a **variant of brot_de_march**, not a competing default block.
It keeps Astra's three-component fast-B2 orbit, common derivative rescale and
finite-depth normal, and reuses the generic block's `BdmMarch` contract and march
semantics. Existing four-component users stay on `v1.glsl`. Code is MIT; test data
is CC0. Attribution to Doug Bristor / Bristorbrot, bristorbrot.org is requested.

## Paste order and example

Paste `bristor_product/v1.glsl`, your four-component `bdm_f` / `bdm_df` /
`BDM_POWER` definitions, `brot_de_march/v1.glsl`, then `b2_v1.glsl`.
The generic definitions are required to compile the original dependency even if
only the B2 variant is called; unused functions can be eliminated by the compiler.

```glsl
vec4 bdm_f(vec4 z) { return bp_square(z); }
vec4 bdm_df(vec4 z, vec4 v) { return bp_Jv(z, v); }
const float BDM_POWER = 2.0;
// ... paste brot_de_march/v1.glsl and b2_v1.glsl here ...
B2dmSet subject = B2dmSet(mat3(1.0), false, vec3(0.0), 48);
BdmMarch probe = BdmMarch(2400, 4.0, 0.4, true,
                         1e-4, 0.04, lens, resolution.y, 8.0);
float t, tone; int steps;
bool hit = b2dm_march(camera, normalize(ray), subject, probe, t, tone, steps);
vec3 normal = b2dm_normal(camera + t * normalize(ray), -normalize(ray), subject);
```

`frame` maps world coordinates into B2 algebra coordinates. It must be orthogonal
(rotation or mirror); do not use arbitrary scaling and assume the scalar initial
derivative is still 1. Keep seed frame and ray differential together. GLSL matrices
are column-major. `iters` is in [1,256], `maxSteps` in [1,8192], `lens`/`resY` positive,
`hitEps` positive, `lod` nonnegative, and rays are unit-length for marching.
Fixed Julia `jc` is in algebra coordinates, not transformed world coordinates.
For Julia set `julia=true`; the seed derivative remains, while every `+dc` term vanishes.

`b2dm_de` returns `(raw directional DE, scalar DE, tone, orbit iterations)`.
It has no leash. Apply the leash at the consumer: positive `m.leash` chooses
`min(dd,leash*ds)`; zero or negative chooses scalar alone. Every arm terminates on
`ds < max(hitEps,lod*t/(lens*resY))`. Interior at the finite cap returns `(0,0,1,n)`.
The adaptive safety drop and step floor match the default march. A miss may mean
sphere exit or exhausted budget: `steps == maxSteps` alone is not a certified
miss; callers should label exhaustion, as the Julia bench does.

## Conventions, vectors and claim status

**Proven.** B2 slots are `(real,e1,e2)` = `(real,i,j)`, with `i*j=j`, `j*i=-i`.
The product is non-associative. The square is
`(x*x-y*y-z*z, y*(2*x-z), z*(2*x+y))`.
The Jacobian action is `z*v+v*z`. Independent component clipping changes the
chain; common rescaling of `v`, `dr` and the additive-term weight preserves it.

One-square witness: `(-1,1,2)` maps to `(-4,-4,-2)`.
The j-roll square gives `(-4,0,-6)`; Hamilton gives `(-4,-2,-4)`.
Product vectors, rather than the square alone, distinguish the product from its
opposite. The mirror `(x,y,z)->(x,-z,-y)` is an algebra automorphism.

**Proven construction, finite scope.** The three tangent chains produce
`(dot(z,mx),dot(z,my),dot(z,mz))`, the gradient direction of a fixed-depth escape
potential. Escape-count changes are discontinuities; this is not a proof of the
normal to the infinite boundary. The B2 fallback is caller-supplied, as in Astra;
the generic normal returns zero and leaves fallback to its host.

**Heuristic.** Both DEs, the leash, safety, pixel-cone threshold and march are
practical estimates. `2|z|` is not an operator bound for the Bristorian square.
Neither field is certified conservative. A singular tangent can give `dd` very
large while `ds` is small, so the leash is material. This is not chirality.

**Measured, medium confidence.** GPU conformance passes 72 independent table-product
field/normal probes and 36 rays: maximum relative field error 1.31e-5, normal-vector
error 7.58e-6 and hit-depth difference 6.55e-7 in the recorded Chrome GPU fixture.
Four planted faults fail: Julia +dc, lost rescale weight, wrong square and hit on dd.
Eight short probes use large non-unit derivative directions to exercise common
rescaling: derivative tests, not geometric marching fixtures.

Actual Astra fast-B2 field/normal versus this variant: 37 parameter probes,
relative field error <=2.37e-7, normal-vector error <=1.91e-7. Raw field layout is
adapted: Astra returns the leashed step, this variant returns dd; compare after
applying the same leash. The generic block uses another smooth tone formula;
this variant retains Astra's tone. Geometry parity does not assert shading parity.

Deep non-dyadic probes are retained separately under `b2_vectors.json:diagnostics`.
The initial draft conformance failed on amplified float/double differences there;
one probe escaped at different iteration counts. Miss-ray sphere-exit distances
also differ after the final step and are not surface depths. These results remain
in Caro's before/evidence packet; they are not silently promoted to passing vectors.
The shipped gate checks hit/miss and work on every ray, and depth only on actual hits.

Run `node b2_vectors.mjs` to regenerate CC0 expectations from the separate rank-table
reference. Run `node b2_conform.mjs` for GPU and planted-fault checks (Playwright and
Chrome required). `--block-dir=/path/to/blocks` selects dependency addresses.
The reference uses its own table product and never imports the GLSL expressions.

## What a stranger should not copy unchanged

The old Astra B3 descending labels were stale metadata. Its current square is
ascending `(real,e1,e2,e3)`; `w` is e3, not the real part. The old embedded axes have
been corrected in the handoff with independent 2,000-vector evidence. Preserve
explicit conventions in historical pages rather than joining their labels silently.

GPU sin/cos of a deep-orbit seed can differ from CPU trig. This B2 variant accepts
the caller's matrix, so compute constant frame entries once on the CPU. It does
not carry the B3 spatial shear, section offset, beta roll, material, atmosphere,
AO or shadow into the B2 contract. Keep those as explicit adapters or consumers.

Do not copy a single performance ratio as a method guarantee. Compare isotropic,
directional with declared leash, and scalar pace at matched scene, tolerance and
accuracy, including missed hits, depth error and exhausted rays. Caro's linked
Julia controls and tolerance-field page expose these arms. Local anisotropy at
the first hit is a diagnostic proxy; it is not the accumulated ray/orbit chain.
