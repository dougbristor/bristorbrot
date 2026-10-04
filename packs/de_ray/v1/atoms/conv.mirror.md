---
id: conv.mirror
story: de_ray
step: 0
kind: story
title: Why the hand hides — the reversed order
claim: >
  Reverse the rank order and the rule turns into the older j_roll table. Reverse it and flip the
  sign, and you get an exact symmetry of the algebra, so no picture can tell the two labellings
  apart.
status: story
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: [conv.rule, conv.slots4]
skip_cost: >
  Nothing breaks if you skip it. It explains why a slot-order mistake can survive for months
  with every render looking right.
credit: [Doug Bristor]
---

Write the units backwards (Doug's alphabet-from-the-end order: real on `z`, then `i` on `y`,
`j` on `x`, `k` on `w`, `l` on `v` …) and read them by letter. You have reversed the ranks:
`e_a → e_(n+1−a)`. Under that relabelling the rule `sgn(b − a)` becomes `sgn(a − b)`: the older
**j_roll** table. Same numbers, different names.

Now reverse **and** negate: `σ(e_a) = −e_(n+1−a)`. This is an **automorphism**: it maps the
algebra exactly onto itself (verified for n = 2 … 7). A fractal built from this algebra is
therefore unchanged by σ, and every measurement of it is too. The two labellings differ only
in a sign the object itself cannot show. That is how a reversed slot order can render perfectly
and still be the wrong convention.

Whether σ is a turn or a mirror depends on n:

| n (imaginary units) | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| det σ | −1 mirror | +1 turn | +1 turn | −1 mirror | −1 mirror | +1 turn |

At n = 2, σ is the map `(x, y, z) → (x, −z, −y)`: a mirror inside the 3-D algebra itself.

This is why the canonical form uses ranks and the vectors carry the j_roll column.
