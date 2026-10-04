---
id: conv.slots4
story: de_ray
step: 0
kind: prose
title: Shader letters — and w is not the scalar
claim: >
  In a 4-component shader vector, x = real, y = e1, z = e2, w = e3. Unlike quaternion code,
  w is NOT the real part.
status: definition
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll, slots4: [1, e1, e2, e3]}
depends: [conv.rank_index]
skip_cost: >
  Reading w as the scalar (the quaternion habit) moves the real part into the wrong slot and
  produces a plausible wrong fractal.
credit: [Doug Bristor]
---

| rank | prose | array | `vec4` letter |
|---|---|---|---|
| 0 | 1 | `z[0]` | `x` |
| 1 | e1 = i | `z[1]` | `y` |
| 2 | e2 = j | `z[2]` | `z` |
| 3 | e3 = k | `z[3]` | `w` |

⚠ **`w` is `e3`, not the scalar.** Quaternion code often writes `q = w + xi + yj + zk`;
graphics libraries often store the scalar last. Neither applies here.

Every ascending pair of units is a copy of the 3-D (n = 2) algebra, so the 3-D form is simply
`(x, y, z)` with `w = 0`: `w` is the dimension you switch on going from 3-D to 4-D.
Past 4-D, use arrays; letters run out, ranks do not.
