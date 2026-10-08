"""2-D slices of the B2 Mandelbrot, coloured by how each slice differs from the M-set (bristorbrot.org/algebra/).

The 45° slice fits INSIDE the M-set, and the part it does not cover is the spread (a known, visible error). The 135°
slice also misses, but it covers area that is NOT M-set: covered, but a defect.

Slice β: c = x + y·u_β with u_β = cos β·i + sin β·j (slots 1, i, j), z0 = 0, z ← z² + c (core/bristor_product).
Algebra fact behind the picture: u_β² = −1 + cos β sin β (j − i).
  β = 0, 90, 180: u² = −1, the plane is ℂ, the slice IS the M-set.
  β = 135: j − i is parallel to u, so the plane is closed: u² = −1 − u/√2, a copy of ℂ in a skewed basis. The slice is
           an exact LINEAR image of the M-set: x + y·u ↦ x + y·ω, ω = −1/(2√2) + i·√(7/8). Perfect-looking, misplaced.
  β = 45:  j − i is perpendicular to u: every square leaks out of the plane into the third slot, and the extra escape
           shrinks the set.

Pixel classes: in both (grey), root only = MISSED, the spread (violet, darker = deeper inside the root, away from the slice),
slice only = FALSE COVER, the defect (green, darker = further from any M-set), neither (black).
Run from the repository root: python3 docs/algebra/mslices.py   → docs/algebra/mslices/ (tiles, sheet.png, mslices.json)
Needs numpy, pillow, scipy. About 4 minutes.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'core', 'bristor_product'))
from v1 import square  # core/bristor_product/v1, i-roll

X0, X1, Y0, Y1, W = -2.3, 0.9, -1.55, 1.55, 640
H = int(round(W * (Y1 - Y0) / (X1 - X0)))
ITERS, BAIL2 = 400, 16.0
xs = np.linspace(X0, X1, W)
ys = np.linspace(Y1, Y0, H)            # row 0 = top; symmetric about 0 so the conjugate mirror is pixel-exact
X, Y = np.meshgrid(xs, ys)
PIX = (X1 - X0) / (W - 1)


def bristor_slice(beta_deg):
    b = np.radians(beta_deg)
    c = [X, Y * np.cos(b), Y * np.sin(b)]
    z = [np.zeros_like(X) for _ in range(3)]
    alive = np.ones(X.shape, bool)
    for _ in range(ITERS):
        s = square(z)
        z = [np.where(alive, s[k] + c[k], z[k]) for k in range(3)]
        alive &= (z[0] ** 2 + z[1] ** 2 + z[2] ** 2) <= BAIL2
    return alive


def complex_set(cx, cy):
    c = cx + 1j * cy
    z = np.zeros_like(c)
    alive = np.ones(c.shape, bool)
    for _ in range(ITERS):
        z = np.where(alive, z * z + c, z)
        alive &= (z.real ** 2 + z.imag ** 2) <= BAIL2
    return alive


def classify(root, frame):
    both, miss, false = root & frame, root & ~frame, frame & ~root
    dmiss = distance_transform_edt(~frame) * PIX       # how deep a missed pixel sits away from the slice
    dfalse = distance_transform_edt(~root) * PIX       # how far a falsely covered pixel sits from the M-set
    return both, miss, false, dmiss, dfalse


def ramp(t, a, b):
    t = np.clip(t, 0, 1)[..., None]
    return (np.array(a) * (1 - t) + np.array(b) * t)


def paint(root, frame):
    both, miss, false, dmiss, dfalse = classify(root, frame)
    img = np.zeros(root.shape + (3,)) + np.array([11, 13, 16])
    img[both] = [200, 204, 210]
    # violet = missed, green = false cover: away from the site's cyan (quaternion) and orange (Bristorian), Doug 10-08
    img[miss] = ramp(dmiss[miss] / 0.12, [205, 180, 250], [85, 40, 165])
    img[false] = ramp(dfalse[false] / 0.12, [180, 235, 160], [30, 125, 50])
    return Image.fromarray(img.astype(np.uint8))


def stats(root, frame):
    both, miss, false, dmiss, dfalse = classify(root, frame)
    A = root.sum()
    return {'miss': float(miss.sum() / A), 'false': float(false.sum() / A),
            'missDepthP90': float(np.percentile(dmiss[miss], 90)) if miss.any() else 0.0,
            'falseDistP90': float(np.percentile(dfalse[false], 90)) if false.any() else 0.0,
            'area': float(frame.sum() / A)}


def iou(a, b):
    return float((a & b).sum() / max(1, (a | b).sum()))


if __name__ == '__main__':
    OUT = os.path.join(HERE, 'mslices')
    os.makedirs(os.path.join(OUT, 'tiles'), exist_ok=True)
    root = bristor_slice(0)
    out = {'grid': [X0, X1, Y0, Y1, W, H], 'iters': ITERS, 'tiles': [], 'curve': [], 'controls': {}}

    # Controls (bars set before looking at any tile):
    #  C1  the β 0 Bristorian slice equals a plain complex M-set (IoU ≥ 0.999), else the slice code is not ℂ at β 0.
    #  C2  β 90 and β 180 equal the root (IoU ≥ 0.999): (1, j) is ℂ, and 180 is the conjugate.
    #  C3  β 135 equals the predicted linear image of the M-set (IoU ≥ 0.999); a WRONG-PAIR arm, the same prediction
    #      against the 45° slice, must score well below it (≤ 0.95), or the check cannot tell slices apart.
    M = complex_set(X, Y)
    w = complex(-1 / (2 * np.sqrt(2)), np.sqrt(7 / 8))
    pred135 = complex_set(X + Y * w.real, Y * w.imag)
    s90, s180, s135, s45 = bristor_slice(90), bristor_slice(180), bristor_slice(135), bristor_slice(45)
    c = out['controls']
    c['C1_beta0_vs_complexM'] = iou(root, M)
    c['C2_beta90'] = iou(s90, root)
    c['C2_beta180'] = iou(s180, root)
    c['C3_beta135_vs_prediction'] = iou(s135, pred135)
    c['C3_wrongpair_beta45_vs_prediction'] = iou(s45, pred135)
    c['fires'] = bool(c['C1_beta0_vs_complexM'] < 0.999 or min(c['C2_beta90'], c['C2_beta180']) < 0.999
                      or c['C3_beta135_vs_prediction'] < 0.999 or c['C3_wrongpair_beta45_vs_prediction'] > 0.95)
    print('controls', json.dumps(c))

    for b in range(0, 181, 15):
        f = bristor_slice(b)
        paint(root, f).save(os.path.join(OUT, 'tiles', f'b{b:03d}.png'))
        out['tiles'].append({'beta': b, **stats(root, f)})
        print(b, out['tiles'][-1])
    for b in range(0, 181, 5):
        out['curve'].append({'beta': b, **stats(root, bristor_slice(b))})

    tiles = [Image.open(os.path.join(OUT, 'tiles', f'b{t["beta"]:03d}.png')) for t in out['tiles']]
    cols, sw = 5, W // 2
    sh = H // 2
    sheet = Image.new('RGB', (cols * sw, ((len(tiles) + cols - 1) // cols) * sh), (11, 13, 16))
    for k, t in enumerate(tiles):
        sheet.paste(t.resize((sw, sh), Image.LANCZOS), ((k % cols) * sw, (k // cols) * sh))
    sheet.save(os.path.join(OUT, 'sheet.png'))
    json.dump(out, open(os.path.join(OUT, 'mslices.json'), 'w'), indent=1)
