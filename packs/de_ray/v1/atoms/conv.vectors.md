---
id: conv.vectors
story: de_ray
step: 0
kind: vectors
title: Test vectors, and the wrong answers they must reject
claim: >
  A port passes only if it reproduces the canon column AND fails the j_roll, opposite and
  quaternion columns. `conform.py` / `conform.mjs` check this and name the mistake.
status: proven
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: [conv.rule, code.bristor_product]
skip_cost: >
  Without vectors, the only test of a port is how the picture looks, and every one of the
  wrong rules below draws a convincing fractal.
credit: [Doug Bristor, caro]
---

The device `bristor_product` carries `vectors.json`, which holds 25 squares (n = 2, 3, 4, 5, 7) and 18 products, every value
exact in IEEE double (inputs are multiples of 1/8). Each case carries four columns:

| column | what it is | your port must |
|---|---|---|
| `canon` | the rule | **match** |
| `j_roll` | the same rule with the rank order reversed (an older table) | **not** match |
| `opposite` | the left operand survives instead of the right (the other hand) | **not** match (products) |
| `quaternion` | Hamilton product, n = 3 only | **not** match |

Hand-checkable first rows:

| input `z` | canon `z²` | j_roll | quaternion |
|---|---|---|---|
| (−1, 1, 2, 0) | (−4, −4, −2, 0) | (−4, 0, −6, 0) | (−4, −2, −4, 0) |
| (0.5, −0.25, 0.75, −1) | (−1.375, −0.3125, 1.3125, −1.5) | (−1.375, −0.1875, 0.1875, −0.5) | (−1.375, −0.25, 0.75, −1) |
| (1, 1, 1) | (−1, 1, 3) | (−1, 3, 1) | — |

The real part is identical in every column, so a port tested only on size or on the real part
cannot tell them apart.

**Run it:**

```
python conform.py my_port.py      # module defines square(z) and/or mul(a, b)
node conform.mjs ./my_port.mjs    # module exports square / mul
python conform.py --selftest      # watch it reject each wrong rule, with a diagnosis
```

A port that supports only some n (a shader fixed at 3-D or 4-D) is tested on those and the
rest are reported as skipped, never as passed.
