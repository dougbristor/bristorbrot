---
id: conv.not_quaternion
story: de_ray
step: 0
kind: prose
title: This is not a quaternion — read this before porting with an AI
claim: >
  Quaternions send i·j to a third direction (k). Bristorian sends it back onto a factor
  (i·j = +j). Code that "looks like" quaternion code will be pulled toward ij = k.
status: proven
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: [conv.rule, code.bristor_product]
skip_cost: >
  A port that drifts to quaternion multiplication still renders a convincing 4-D fractal:
  the wrong one. Nothing in the picture tells you.
credit: [Doug Bristor]
---

| | quaternion | Bristorian |
|---|---|---|
| `i·j` | `k` (a new direction) | `+j` (lands on a factor) |
| `j·i` | `−k` | `−i` |
| dimension | always 4 | any: n imaginary units |
| size | `|ab| = |a||b|` | **not** kept (`|z²| ≠ |z|²` off the complex plane) |
| grouping | `(zz)z = z(zz)` | not in general |

**Instruction for an AI doing the port** (paste it with the code):

> This is NOT quaternion algebra. Do not rewrite products into the Hamilton form (ij = k), do
> not normalise, and do not assume |ab| = |a||b|. The rule is e_a·e_b = sgn(b−a)·e_b for a ≠ b,
> e_a·e_a = −1, with z[0] the real part. Your port must pass `conform` (canon) and must FAIL the
> quaternion and j_roll columns.

The quickest test is one number: `z = (−1, 1, 2, 0)` squares to `(−4, −4, −2, 0)`.
A quaternion port gives `(−4, −2, −4, 0)`: the same size, the same real part, and 27° away.
