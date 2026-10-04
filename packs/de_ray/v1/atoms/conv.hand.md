---
id: conv.hand
story: de_ray
step: 0
kind: prose
title: The square cannot see the hand; the product can
claim: >
  This algebra and its opposite (a∘b = b·a) square identically, so no squaring test, and no
  escape-time image of z² + c, can tell them apart. Only products can.
status: proven
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: [conv.rule, code.bristor_product]
skip_cost: >
  A port certified on squares alone may be the mirror-twin algebra. It renders z² + c
  identically, then diverges the moment you use a general product (z³ + c, a Julia with a
  product term, a derivative chain written as a product).
credit: [Doug Bristor]
---

The opposite algebra multiplies in the other order: `e_a ∘ e_b = e_b · e_a`, so the **left**
operand survives (`e1 ∘ e2 = −e1`). It is a genuinely different algebra, not a relabelling of
this one; that is proved for n = 2, 3, 4.

But `z ∘ z = z · z` for every z, so the two squares are identical. The test vectors therefore
carry product cases, and `conform` warns when a port supplies only `square`.

Where this matters for a renderer: `z² + c` is blind to the hand. The cube is not:
`(zz)z + c` and `z(zz) + c` give measurably different sets (they disagree on a few percent of
parameter space, depending on the region sampled), and in the cases worked out, no linear change
of coordinates maps one onto the other.
