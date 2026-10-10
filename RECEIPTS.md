# Bristorbrot receipts

Till receipts: newest first, one per change a reader can see and one per correction. Each is short, and enough to
trace the change back to its commit, where the full detail is.

- **change**: what changed, who asked for it, the check that proves it (and the deliberately broken version that the
  check catches), and the commit.
- **correction**: what was claimed or shown before, what was wrong with it, and what made someone look.

Each algebra block also keeps its own record in the source tree that `core/` is built from. This file covers what
reaches this repository.

## 2026-10-10 · change · these receipts

- **What:** RECEIPTS.md, backfilled from the commit history, and a link to it from the README.
- **Asked:** Doug Bristor.

## 2026-10-09 · change · default camera distance 4.2 · `78aace1`

- **What:** the player now opens with the camera at distance 4.2 instead of 3.04. Since the j→k change below, the
  Julia β section ran off the right edge of the window at 3.04.
- **Asked:** Doug Bristor.
- **Proved by:** a near-flat render (camera 16.8, lens 6) shows the twist is the section's own shape, not lens
  distortion. Its outline overlaps the 4.2 view by 0.82 and the 3.04 view by 0.77 (a 6-pixel shift of the same image
  scores 0.86). The page check uses its own fixed view: it passes as shipped and fails under every fault switch.

## 2026-10-08 · change · algebra claims record · `772a5f8`

- **What:** `docs/algebra/`: the checker behind the claims on [bristorbrot.org/algebra](https://bristorbrot.org/algebra/),
  and the slice pictures it reads.
- **Asked:** Doug Bristor; written by insights.
- **Proved by:** `check_claims.py` recomputes the 21 checked claims from `core/bristor_product` (21/21 pass). With
  `--sabotage` it swaps in the older j-roll product, and exactly the 8 claims written in i-roll terms fail.

## 2026-10-08 · change · Julia β section rolls j→k · `acbafe6`

- **What:** for a Julia set, the β section now rolls the window (real, i, cos β·j + sin β·k), so β = 0 is the B2 jbrot
  (real, i, j). The Mandelbrot β section is unchanged. Unknown link keys now warn in the console instead of being
  dropped silently.
- **Asked:** Doug Bristor, via insights.
- **Proved by:** `brot_de_march` GPU conformance gains 40 j→k cases, plus two broken versions (roll reversed, roll
  ignored) that must fail. A new page check: at β 0 the section equals the axis cut (0.00% different), and at β 69° it
  moves. The player is pixel-identical to insights' lab copy on 8 scenes.

## 2026-10-07 · correction · every render was mirrored left-right · `91a3665`

- **Before:** every brot_viewer picture, including the first README screenshot, showed the sets mirrored left-right.
  The camera took screen right as up × forward.
- **Wrong because:** that makes screen right show world −x when looking along +z, a left-handed picture. The earlier
  page checks (spin, quaternion symmetry, shadow) can't see a mirror, so none of them fired.
- **Tell:** Doug saw it by eye, and insights confirmed it against an independent page (outline overlap 0.80 as
  rendered, 0.955 flipped).
- **Fixed by:** screen right is now forward × up. A new page check, "picture hand", uses an outside fact: the
  classical Mandelbrot set's area centroid (−0.287) lies right of the view centre (−0.5), so its mass must sit left
  of centre when seen from +z. The check failed on the old camera (35.5 px right), passes now (35.5 px left), and the
  `mirror` fault switch restores the old camera and must fail. README screenshot re-rendered.

## 2026-10-07 · correction · README linked to a local address · `00773e5`

- **Before:** the README's "Try the viewer" linked to a localhost address.
- **Wrong because:** a local address is a dead link to every visitor.
- **Tell:** Doug saw it on the published page.
- **Fixed by:** the README links the live viewer, and the local address appears only as an instruction inside a code
  block. Every push is now scanned for localhost links as well as private paths and email addresses.

## 2026-10-07 · change · links to the website and Lotus Flame · `754d35e`, `8f1376e`, `96c8ace`

- **What:** the README links to [bristorbrot.org](https://bristorbrot.org), and a "Sister projects" section links to
  [Lotus Flame](https://github.com/dougbristor/lotus_flame) and its live page.
- **Asked:** Doug Bristor.

## 2026-10-07 · correction · README wording and licence flag · `cde6b93`

- **Before:** the README called the opposite algebra a "mirror image", called the refine shadows a "true area light",
  and didn't say that renders are finite. A single licence flag said attribution was or wasn't required for every
  file.
- **Wrong because:** "mirror image" is ambiguous (the opposite algebra is a defined object). The refine samples the
  light; it doesn't solve it exactly. Renders are finite escape tests, not certified geometry. And CC BY text needs
  attribution where MIT code doesn't, so one flag was wrong for one kind of file.
- **Tell:** caro's read-over of the README before launch.
- **Fixed by:** caro's rewrite of the front page, and per-kind licence terms (code, data, text) in `build_pack.py`.
  Packs built earlier keep their manifests as they were; the README notes that de_ray v1's manifest carries the
  older flag.

## 2026-10-07 · change · side panel fits its width · `ed54169`

- **What:** the light sliders' readouts were cut off. The panel's middle column now shrinks, and the two long option
  labels are short, with the explanation in a tooltip.
- **Asked:** Doug Bristor.
- **Proved by:** screenshot of the panel at its 280 px width. The source and the v3 pack stay byte-identical.

## 2026-10-07 · change · README: defects line, screenshot, MIT licence text · `ab93ec5`, `445b3ee`, `d8abeed`

- **What:** the algebra's three structural defects (quaternions have only the first; octonions stop before the
  third), a screenshot of the v3 player, and a plain MIT LICENSE so GitHub recognises it.
- **Asked:** Doug Bristor.

## 2026-10-07 · change · publish only the current player · `4c1a1ac`

- **What:** the tree carries one player, `packs/brot_viewer/v3`. v1 and v2 were small steps on the way and stay in
  the history.
- **Asked:** Doug Bristor.

## 2026-10-04 · change · GPU named in the status line · `97e26b3`

- **What:** the status line ends with the GPU vendor, with the full name on hover. On a machine with two GPUs the
  same page runs about 8× slower on the integrated one, and a tab on the wrong GPU otherwise looks like a code
  regression.
- **Proved by:** the pack's page check, 17/17 on the shipped pack.

## 2026-10-04 · change · v3: q³, shadows, still refine, edge smoothing, mist · `040d828`

- **What:** two new blocks from insights' shadow lab, `bdm_shadow` and `edge_post`, plus the quaternion cube q³, a
  movable light, body spin, still refine, edge smoothing and an optional mist film.
- **Asked:** Doug Bristor; the lab work is insights'.
- **Proved by:** two new page checks, each with a fault switch that must make it fail: the shadow darkens and never
  brightens, and spinning the body equals turning the camera one way and the light the other. Pixel-identical to
  the lab at the same settings on 5 scenes.

## 2026-10-04 · change · first commit · `ff44189`

- **What:** `core/` (the reusable blocks with their JS, Python and GLSL versions, test vectors and conformance
  scripts), the brot_viewer player built only from `core/`, frozen packs, and `tools/build_pack.py`, which refuses to
  build if any conformance check fails, or if a player's page check still passes with a fault switch on.
- **Asked:** Doug Bristor.
