---
id: conv.rank_index
story: de_ray
step: 0
kind: prose
title: Numbers are indexed by rank, not by letter
claim: >
  An imordial with n imaginary units is an array z[0..n]: z[0] is the real part, z[a] is the
  coefficient of e_a, the imaginary unit of rank a.
status: definition
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: []
skip_cost: >
  Without a rank index, every dimension past 4 needs a new letter scheme, and a letter order
  that does not match the rank order silently swaps the multiplication rule (see conv.mirror).
credit: [Doug Bristor]
---

Bristorian numbers (imordials) are not tied to four dimensions, so they cannot borrow a letter
scheme. Every unit is named by its rank:

- `e1, e2, e3, …` name a specific unit; `e_a, e_b` are variables meaning "any rank".
- The real part is written `1` in prose and stored at `z[0]`. (Readers coming from octonions
  may think of it as `e0 = 1`.)
- `i, j, k` are friendly aliases for `e1, e2, e3`, used only in 3-D and 4-D examples. Nothing
  in the general rule depends on them.

`n` is always the number of imaginary units, so the array has `n + 1` entries. The
smallest Bristorian with a hand has `n = 2` (3-D); the 4-D form has `n = 3`.
