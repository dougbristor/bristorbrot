# Algebra claims

The scripts behind [bristorbrot.org/algebra](https://bristorbrot.org/algebra/). Both use the product in
[`core/bristor_product`](../../core/bristor_product/). Run them from the repository root; they need `numpy`
(and `pillow` and `scipy` for the slices).

- `check_claims.py` recomputes every claim on the page that is tagged **checked**: 21 claims, all expected to pass.
  `--sabotage` swaps in the j-roll product (i·j = −j). The eight claims written in i-roll terms (P1, P2, P11, P12, P15, S1, S2, S3)
  must then fail and the rest still pass, which shows that the checker can tell the two apart.
- `mslices.py` draws the 2-D slices of the B2 Mandelbrot set. Each pixel is coloured by whether it lies in both the
  slice and the Mandelbrot set, in the Mandelbrot set only (missed), or in the slice only (false cover). It writes
  `mslices/`, about 4 minutes. Its own controls check that the 0°, 90° and 180° slices match the Mandelbrot set,
  and that the 135° slice matches the predicted shear while the 45° slice does not.
