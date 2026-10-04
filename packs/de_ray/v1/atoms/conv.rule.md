---
id: conv.rule
story: de_ray
step: 0
kind: prose
title: The whole multiplication rule
claim: >
  e_a · e_b = sgn(b − a) · e_b for a ≠ b, and e_a · e_a = −1. The product lands back on its
  right-hand factor; the sign records which came first.
status: proven
as_of: 2026-10-02
conventions: {index: rank, roll: i-roll}
depends: [conv.rank_index, code.bristor_product]
skip_cost: >
  This is the algebra. Everything else in the story is built on it.
credit: [Doug Bristor]
---

**The rule**, for any number of imaginary units:

```
e_a · e_b = sgn(b − a) · e_b     (a ≠ b)
e_a · e_a = −1
```

extended bilinearly, with `1` as the identity. So `i·j = +j` and `j·i = −i`.

**Squaring**, which is all an escape-time fractal needs. For
`z = x + Σ y_a e_a`:

```
real part :  x² − Σ_a y_a²
e_b part  :  y_b · ( 2x + Σ_{a<b} y_a − Σ_{a>b} y_a )
```

Each cross pair `a < b` contributes `y_a y_b (e_a e_b + e_b e_a) = y_a y_b (e_b − e_a)`: plus
to the higher rank, minus to the lower. Written out:

| n | square |
|---|---|
| 2 | `(x² − y1² − y2²,  y1(2x − y2),  y2(2x + y1))` |
| 3 | `(x² − y1² − y2² − y3²,  y1(2x − y2 − y3),  y2(2x + y1 − y3),  y3(2x + y1 + y2))` |

```js
// general n, rank-indexed arrays
function square(z) {
  const n = z.length - 1, out = new Array(n + 1);
  out[0] = z[0] * z[0];
  for (let a = 1; a <= n; a++) out[0] -= z[a] * z[a];
  for (let b = 1; b <= n; b++) {
    let s = 2 * z[0];
    for (let a = 1; a <= n; a++) if (a !== b) s += (a < b ? 1 : -1) * z[a];
    out[b] = z[b] * s;
  }
  return out;
}
```

The device is the CodeT block **`bristor_product`**: `v1.js` / `v1.py` export `mul(a, b)` and `square(z)` for any n, with `vectors.json` and `conform.mjs` / `conform.py` beside them.
