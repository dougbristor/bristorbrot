#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""CPU reference for edge_post v1.glsl: the same filter in double precision, on a synthetic 48 x 32 frame.

The frame is built so the masks disagree: a disk with a hard edge (hit change and luma edge), stripes inside it
(luma edge, no geometry edge), a band of step jumps under flat colour (geometry edge, no luma edge), a diagonal edge
(the blend direction matters there), step counts above 255 (the aux G byte), and a hit patch with the
background's steps and colour (only the hit change marks its edge). Colour and aux are stored as bytes,
exactly as an RGBA8 texture holds them.

    python3 reference.py            check vectors.json against this reference (drift check)
    python3 reference.py --write    regenerate vectors.json
"""
import json, math, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H = 48, 32
MASKS = {'none': 0, 'luma': 1, 'steps': 2, 'both': 3, 'all': 4}


def frame():
    col, aux = [], []
    for y in range(H):
        for x in range(W):
            r, g, b = 0.10 + 0.20 * x / W, 0.15, 0.30                      # smooth background: no luma edge
            steps, hit = 30 + x // 8, 0
            dx, dy = x - 16.3, y - 15.6
            if dx * dx + dy * dy < 11.2 ** 2:                               # the disk: hit, bright, steps over 255
                k = 0.6 + 0.4 * math.cos(0.3 * x) * math.sin(0.25 * y)
                r, g, b = 0.9 * k, 0.7 * k, 0.3 * k
                if x % 4 == 0:                                              # stripes: shading, not geometry
                    r, g, b = 0.45 * k, 0.35 * k, 0.15 * k
                steps, hit = 250 + int(math.hypot(dx, dy)), 1
            if x > 30 and y < x - 18:                                       # a diagonal edge: second body
                r, g, b, steps, hit = 0.85, 0.85, 0.80, 120 + y, 1
            if 34 <= x < 46 and y >= 22:                                    # step jumps under flat colour
                r, g, b, steps, hit = 0.40, 0.40, 0.40, 60 + 10 * ((y // 3) % 2), 1
            if 2 <= x < 11 and 25 <= y < 30:                                 # a hit with the background's steps and
                hit = 1                                                     # colour: only the hit change marks it
            col.append([round(255 * min(max(v, 0.0), 1.0)) for v in (r, g, b)] + [255])
            aux.append([steps % 256, steps // 256, 255 * hit, 255])
    return col, aux


def luma(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def filt(col, aux, x, y, mask, step_jump=3.0):
    C = lambda i, j: [v / 255 for v in col[min(max(j, 0), H - 1) * W + min(max(i, 0), W - 1)][:3]]
    A = lambda i, j: [v / 255 for v in aux[min(max(j, 0), H - 1) * W + min(max(i, 0), W - 1)]]
    steps = lambda a: math.floor(a[0] * 255 + 0.5) + 256 * math.floor(a[1] * 255 + 0.5)

    def tex(u, v):                                  # bilinear, texel centres at (i + 0.5) / W, clamp to edge
        fx, fy = u * W - 0.5, v * H - 0.5
        x0, y0 = math.floor(fx), math.floor(fy)
        ax, ay = fx - x0, fy - y0
        c00, c10, c01, c11 = C(x0, y0), C(x0 + 1, y0), C(x0, y0 + 1), C(x0 + 1, y0 + 1)
        return [(1 - ay) * ((1 - ax) * c00[k] + ax * c10[k]) + ay * ((1 - ax) * c01[k] + ax * c11[k]) for k in range(3)]

    m = C(x, y)
    if mask == 0:
        return m, False
    lM = luma(m); lo = hi = lM
    lNW, lNE, lSW, lSE = luma(C(x - 1, y - 1)), luma(C(x + 1, y - 1)), luma(C(x - 1, y + 1)), luma(C(x + 1, y + 1))
    for j in (-1, 0, 1):
        for i in (-1, 0, 1):
            l = luma(C(x + i, y + j)); lo = min(lo, l); hi = max(hi, l)
    luma_edge = hi - lo > max(0.0312, 0.125 * hi)
    aM = A(x, y); sM = steps(aM); jump = 0.0; hit_change = False
    for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a = A(x + i, y + j); jump = max(jump, abs(steps(a) - sM)); hit_change = hit_change or ((a[2] > 0.5) != (aM[2] > 0.5))
    step_edge = jump > step_jump or hit_change
    edge = {1: luma_edge, 2: step_edge, 3: luma_edge and step_edge}.get(mask, True)
    if not edge:
        return m, False
    px, py = 1 / W, 1 / H
    u, v = (x + 0.5) * px, (y + 0.5) * py
    d = [-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE)]
    reduce = max((lNW + lNE + lSW + lSE) * 0.25 / 8, 1 / 128)
    s = 1 / (min(abs(d[0]), abs(d[1])) + reduce)
    d = [min(max(d[0] * s, -8), 8) * px, min(max(d[1] * s, -8), 8) * py]
    t1, t2 = tex(u + d[0] * (1 / 3 - 0.5), v + d[1] * (1 / 3 - 0.5)), tex(u + d[0] * (2 / 3 - 0.5), v + d[1] * (2 / 3 - 0.5))
    rgbA = [0.5 * (a + b) for a, b in zip(t1, t2)]
    t3, t4 = tex(u - d[0] * 0.5, v - d[1] * 0.5), tex(u + d[0] * 0.5, v + d[1] * 0.5)
    rgbB = [0.5 * a + 0.25 * (b + c) for a, b, c in zip(rgbA, t3, t4)]
    lB = luma(rgbB)
    return (rgbA if lB < lo or lB > hi else rgbB), True


def generate():
    col, aux = frame()
    out = {'about': 'edge_post v1 vectors: a synthetic 48 x 32 frame (RGBA8 colour + aux) and, per mask, every pixel the '
                    'filter selects with its double-precision result. Unselected pixels must come back unchanged.',
           'w': W, 'h': H, 'step_jump': 3.0, 'tol': {'rgb': 0.01}, 'col': col, 'aux': aux, 'masks': {}}
    for name, m in MASKS.items():
        rows = []
        for y in range(H):
            for x in range(W):
                rgb, edge = filt(col, aux, x, y, m)
                if edge:
                    rows.append([y * W + x] + [round(c, 9) for c in rgb])
        out['masks'][name] = {'mask': m, 'edges': rows}
    return out


def check(V):
    bad, worst = [], 0.0
    for name, M in V['masks'].items():
        edges = {r[0]: r[1:] for r in M['edges']}
        for y in range(H):
            for x in range(W):
                rgb, edge = filt(V['col'], V['aux'], x, y, M['mask'], V['step_jump'])
                i = y * W + x
                if edge != (i in edges):
                    bad.append(f'{name}[{x},{y}] selection'); continue
                if edge:
                    worst = max(worst, max(abs(a - b) for a, b in zip(rgb, edges[i])))
    if worst > 1e-8:
        bad.append(f'drift {worst:.1e}')
    return worst, bad


if __name__ == '__main__':
    path = HERE / 'vectors.json'
    if sys.argv[1:] == ['--write']:
        V = generate()
        path.write_text(json.dumps(V, separators=(',', ':')) + '\n')
        print(', '.join(f"{k}: {len(M['edges'])} px selected" for k, M in V['masks'].items()))
        sys.exit(0)
    V = json.loads(path.read_text())
    worst, bad = check(V)
    print(f"  reference vs vectors.json: {W} x {H} frame, {len(V['masks'])} masks, max drift {worst:.1e}")
    print('PASS' if not bad else 'FAIL ' + ', '.join(bad[:10]))
    sys.exit(0 if not bad else 1)
