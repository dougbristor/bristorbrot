---
id: sq.jacobian
story: de_ray
step: 1
kind: code
title: The square and its Jacobian — the two halves every derivative needs
claim: >
  The derivative of z² in direction v is z·v + v·z. Written out, the Jacobian is a closed-form
  (n+1)×(n+1) matrix, and it is NOT a scaled rotation: it stretches some directions more than
  others, and it can flatten a direction to zero.
status: proven
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: [conv.rule, code.bristor_product]
skip_cost: >
  Without J you only have the scalar running derivative dr ← 2|z|·dr + 1, which treats every
  direction alike. That costs the directional DE (step 3) and the analytic normal (step 5).
credit: [Doug Bristor, caro, fable]
---

**The rule that gives it.** The product is bilinear, so the product rule holds even though the
algebra is not associative:

```
J(z)·v = z·v + v·z
```

Two calls to `mul` give J·v, so a port that already has `mul` already has the Jacobian.

**Closed form** (row-major, entry `[r·(n+1) + c] = ∂(z²)_r / ∂z_c`), for `z = (x, y_1, …, y_n)`:

| row | ∂/∂x | ∂/∂y_b (diagonal) | ∂/∂y_a, a < b | ∂/∂y_a, a > b |
|---|---|---|---|---|
| 0 (real) | `2x` | — | `−2y_a` (all a) | `−2y_a` |
| b ≥ 1 | `2y_b` | `2x + Σ_{a<b} y_a − Σ_{a>b} y_a` | `+y_b` | `−y_b` |

Written out for n = 2 (3-D):

```
⎡ 2x    −2y1          −2y2       ⎤
⎢ 2y1   2x − y2       −y1        ⎥
⎣ 2y2    y2           2x + y1    ⎦
```

**Not a scaled rotation.** For the complex numbers, J is `2|z|` times a rotation, which is why
a single scalar `dr` is exact there. Here it is not. At `z = (0, 1, −1)`, J sends the
direction `(0, 1, 1)` to **zero**: the square flattens it completely. That uneven stretch is
what the directional DE (step 3) uses, and why it pays off here more than on near-conformal
formulas.

**Code.** The device `bristor_product` exports `squareJacobian(z)` (JS) and
`square_jacobian(z)` (Python), any n, with 16 Jacobian vectors in `vectors.json`. `conform`
checks it and rejects the j_roll and quaternion Jacobians, and a **transposed** Jacobian
(`Jᵀ` in place of `J`), the most common slip with a matrix like this.

**Port prompt:**

> Port squareJacobian into <engine> as an (n+1)×(n+1) row-major matrix (or as Jv(z, v) =
> mul(z, v) + mul(v, z)). It must pass conform's Jacobian vectors, and it must fail on
> the transposed matrix. Do not replace it with 2|z|·I: that is the complex-number shortcut and
> loses exactly the anisotropy the renderer uses.
