"""Claims checker for bristorbrot.org/algebra/.

Every computable sentence on the page has a check here, recomputed from core/bristor_product/v1 (i-roll). Claims that are proofs or certificates filed elsewhere are listed as CITED with their source; they are not
re-run here, and the page says which kind each claim is.

Control: `--sabotage` swaps in the j-roll product (the legacy 1995 table, i·j = −j). The product-table and slice
claims are written in i-roll terms, so they MUST fail under it; the roll-invariant claims (counts, zero divisor,
non-alternativity, squaring blindness) must still pass. If the sabotage run passes everything, the checker cannot
tell the rolls apart and is decoration.

Run from the repository root: python3 docs/algebra/check_claims.py [--sabotage]   (needs numpy; reads mslices/mslices.json)
"""
import json, os, sys, itertools, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'core', 'bristor_product'))
import v1  # core/bristor_product/v1

SABOTAGE = '--sabotage' in sys.argv


def mul(a, b):
    if not SABOTAGE:
        return v1.mul(a, b)
    # j-roll: reverse the ranks, multiply in i-roll, reverse back (the two rolls are one algebra relabelled)
    r = lambda z: [z[0]] + list(z[1:])[::-1]
    return r(v1.mul(r(a), r(b)))


def basis(n, k):
    e = [0.0] * (n + 1); e[k] = 1.0; return e


def close(a, b, tol=1e-12):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def Lmat(a):
    n = len(a) - 1
    return np.array([mul(a, basis(n, c)) for c in range(n + 1)]).T


def Rmat(a):
    n = len(a) - 1
    return np.array([mul(basis(n, c), a) for c in range(n + 1)]).T


rng = np.random.default_rng(7)
results = []


def claim(cid, text, ok, detail=''):
    results.append({'id': cid, 'text': text, 'ok': bool(ok), 'detail': detail})


# B3: slots 1, i, j, k = 0, 1, 2, 3
N = 3
one, i, j, k = (basis(N, t) for t in range(4))
neg = lambda z: [-x for x in z]
add = lambda *zs: [sum(t) for t in zip(*zs)]
sub = lambda a, b: [x - y for x, y in zip(a, b)]

# P1 the product rule, i-roll
ok = (close(mul(i, j), j) and close(mul(j, i), neg(i)) and close(mul(i, k), k) and close(mul(k, i), neg(i))
      and close(mul(j, k), k) and close(mul(k, j), neg(j)) and all(close(mul(e, e), neg(one)) for e in (i, j, k)))
claim('P1', 'i·j = j, j·i = −i, i·k = k, k·i = −i, j·k = k, k·j = −j, and every unit squares to −1', ok)

# P2 commutator
claim('P2', '[i, j] = i·j − j·i = i + j', close(sub(mul(i, j), mul(j, i)), add(i, j)))

# P3 zero divisor along the commutator, in B2 {1, i, j}
i2, j2 = basis(2, 1), basis(2, 2)
s_plus, s_minus = [0, 1, 1], [0, 1, -1]
dL_p, dL_m = np.linalg.det(Lmat(s_plus)), np.linalg.det(Lmat(s_minus))
ker = np.linalg.svd(Lmat(s_plus))[2][-1]
ker_ok = close(mul(s_plus, list(ker)), [0, 0, 0], 1e-12)
claim('P3', 'in B2, i + j is a zero divisor (it multiplies a nonzero number to 0); i − j is not',
      abs(dL_p) < 1e-12 and abs(dL_m) > 0.5 and ker_ok, f'det L(i+j)={dL_p:.2e}, det L(i−j)={dL_m:.3f}, kernel {np.round(ker / ker[0], 6) if abs(ker[0]) > 1e-9 else np.round(ker, 6)}')

# P4 non-associativity count over basis triples of B3
units = [one, i, j, k]
bad = sum(1 for a, b, c in itertools.product(units, repeat=3) if not close(mul(mul(a, b), c), mul(a, mul(b, c))))
claim('P4', '(ab)c ≠ a(bc) for 20 of the 64 triples of 1, i, j, k', bad == 20, f'count={bad}')

# P5 non-alternative: (xx)w ≠ x(xw)
x = add(i, j)
alt = max(np.abs(np.array(sub(mul(mul(x, x), w), mul(x, mul(x, w))))).max() for w in units)
claim('P5', 'not alternative: (xx)w ≠ x(xw), e.g. x = i + j', alt > 0.5, f'max |(xx)w − x(xw)| over units = {alt:.3f}')

# P6 not power-associative: (zz)z ≠ z(zz)
z = list(rng.normal(size=4))
pa = np.abs(np.array(sub(mul(mul(z, z), z), mul(z, mul(z, z))))).max()
claim('P6', 'not power-associative: (zz)z ≠ z(zz) for a typical z', pa > 1e-3, f'|diff|={pa:.3f}')

# P7 size not kept: |zw| ≠ |z||w|; and |zz| ≠ |z|²
nrm = lambda q: math.sqrt(sum(t * t for t in q))
ratios = []
for _ in range(2000):
    a, b = list(rng.normal(size=4)), list(rng.normal(size=4))
    ratios.append(nrm(mul(a, b)) / (nrm(a) * nrm(b)))
zz = [nrm(mul(a, a)) / nrm(a) ** 2 for a in (list(rng.normal(size=4)) for _ in range(2000))]
claim('P7', '|zw| ≠ |z||w|: size is not kept (it is in ℂ and the quaternions)', min(ratios) < 0.9 and max(ratios) > 1.1,
      f'|zw|/(|z||w|) ranges {min(ratios):.3f}..{max(ratios):.3f}; |zz|/|z|² ranges {min(zz):.3f}..{max(zz):.3f}')

# P8 squaring cannot see the hand: z·z is the same in B and B^op (the opposite algebra, factors swapped)
mul_op = lambda a, b: mul(b, a)
sq = max(np.abs(np.array(sub(mul(a, a), mul_op(a, a)))).max() for a in (list(rng.normal(size=4)) for _ in range(500)))
claim('P8', 'z·z is identical in B and its opposite algebra B^op (factors swapped), so every z² + c picture is hand-blind', sq == 0.0, f'max diff {sq:.1e}')

# P9 the cube sees the bracket: escape sets of (zz)z + c and z(zz) + c differ on a B2 slice
def cube_set(order, beta_deg, W=160, iters=60):
    xs, ys = np.linspace(-1.6, 1.6, W), np.linspace(-1.6, 1.6, W)
    X, Y = np.meshgrid(xs, ys); b = math.radians(beta_deg)
    c = [X, Y * math.cos(b), Y * math.sin(b)]
    zz_ = [np.zeros_like(X) for _ in range(3)]; alive = np.ones(X.shape, bool)
    vm = lambda p, q: (mul_vec(p, q))
    for _ in range(iters):
        s = mul_vec(mul_vec(zz_, zz_), zz_) if order == 'L' else mul_vec(zz_, mul_vec(zz_, zz_))
        zz_ = [np.where(alive, s[t] + c[t], zz_[t]) for t in range(3)]
        alive &= sum(t * t for t in zz_) <= 16
    return alive


def mul_vec(a, b):  # mul on arrays, same formula as mul (works elementwise)
    return mul(a, b)


A, B = cube_set('L', 45), cube_set('R', 45)
diff = float((A ^ B).sum() / max(1, (A | B).sum()))
diff0 = 0.0
for b0 in (0, 90):
    A0, B0 = cube_set('L', b0), cube_set('R', b0)
    diff0 = max(diff0, float((A0 ^ B0).sum() / max(1, (A0 | B0).sum())))
claim('P9', 'the cube sees the bracket: (zz)z + c and z(zz) + c draw different sets off the ℂ planes, the same set on them',
      diff > 0.005 and diff0 == 0.0, f'disagreement at 45°: {100 * diff:.2f}% of the union; at 0° and 90°: {100 * diff0:.4f}%')

# P10 automorphism group: identity and reversal φ(e_a) = −e_{n+1−a}
phi = lambda q: [q[0]] + [-t for t in q[1:][::-1]]
aut = max(np.abs(np.array(sub(phi(mul(a, b)), mul(phi(a), phi(b))))).max()
          for a, b in ((list(rng.normal(size=4)), list(rng.normal(size=4))) for _ in range(500)))
swap = lambda q: [q[0], q[2], q[1], q[3]]
naive = max(np.abs(np.array(sub(swap(mul(a, b)), mul(swap(a), swap(b))))).max()
            for a, b in ((list(rng.normal(size=4)), list(rng.normal(size=4))) for _ in range(50)))
claim('P10', 'reversing the ranks and negating them, φ(e_a) = −e_(n+1−a), is a symmetry of the product (in B2 a reflection, det −1); a plain swap of i and j is not',
      aut < 1e-12 and naive > 1e-3, f'φ error {aut:.1e}, plain i↔j swap error {naive:.3f}')

# P11 exact norm witness: z = i + j gives |z²|² = 6 while |z|⁴ = 4
zw = [0, 1, 1]; z2 = mul(zw, zw)
claim('P11', 'exact witness: z = i + j gives z² = −2 − i + j, so |z²|² = 6 while |z|⁴ = 4',
      close(z2, [-2, -1, 1]) and abs(sum(t * t for t in z2) - 6) < 1e-12, f'z² = {z2}')

# P12 the square's direction is not forbidden: (1 + i + j)² = −1 + i + 3j has an i + j component
q = mul([1, 1, 1], [1, 1, 1])
claim('P12', '(1 + i + j)² = −1 + i + 3j: a square CAN point along i + j; what vanishes is the order-sensitive part of the product',
      close(q, [-1, 1, 3]) and abs(q[1] + q[2]) > 1, f'(1+i+j)² = {q}')

# P13 the cube's bracket difference points along i + j: (zz)z − z(zz) = −ab(a + b)(i + j) for z = x + a i + b j
err13 = 0.0
for _ in range(300):
    x_, a_, b_ = rng.normal(size=3); zz_ = [x_, a_, b_]
    d = sub(mul(mul(zz_, zz_), zz_), mul(zz_, mul(zz_, zz_)))
    err13 = max(err13, np.abs(np.array(d) - np.array([0, -a_ * b_ * (a_ + b_), -a_ * b_ * (a_ + b_)])).max())
claim('P13', 'in B2 the cube\'s bracket difference is (zz)z − z(zz) = −ab(a + b)(i + j): it always points along i + j',
      err13 < 1e-12, f'max err {err13:.1e}')

# P14 closed planes through the real axis: exactly 2^n − 1 (B2: i, j, i − j; not i + j)
def closed(u):
    u2 = mul(u, u); im = np.array(u2[1:]); uv = np.array(u[1:], float)
    lam = im @ uv / (uv @ uv); return np.abs(im - lam * uv).max() < 1e-12
counts = {}
for n in (2, 3, 4):
    dirs = set()
    for v in itertools.product((-1, 0, 1), repeat=n):
        if any(v):
            k = next(t for t in v if t); dirs.add(tuple(t * k for t in v))  # identify u and −u
    counts[n] = sum(closed([0.0] + list(v)) for v in dirs)
ok14 = counts == {2: 3, 3: 7, 4: 15} and closed([0, 1, -1]) and not closed([0, 1, 1])
claim('P14', 'exactly 2ⁿ − 1 planes through the real axis are closed under squaring (B2: i, j and i − j; i + j is not one)',
      ok14, f'closed ±1/0 directions found: {counts}')

# P15 fold parity: det L(e_a) = (−1)^(a−1), det J(e_a) = 4(−1)^(a−1), every a, n = 2..8
ok15 = True
for n in range(2, 9):
    for a_ in range(1, n + 1):
        e = basis(n, a_); Lm = Lmat(e); Jm = Lm + Rmat(e)
        ok15 &= abs(np.linalg.det(Lm) - (-1) ** (a_ - 1)) < 1e-9 and abs(np.linalg.det(Jm) - 4 * (-1) ** (a_ - 1)) < 1e-9
claim('P15', 'det of the square\'s derivative at the unit e_a is 4·(−1)^(a−1): neighbouring units have opposite sign, so the square folds between them',
      ok15, 'checked n = 2..8, every a (proved for all n)')

# S1 slice algebra: u_β = cos β·i + sin β·j  ⇒  u² = −1 + cos β sin β (j − i)
s1 = 0.0
for bd in range(0, 181, 5):
    b = math.radians(bd); u = [0, math.cos(b), math.sin(b)]
    s1 = max(s1, np.abs(np.array(sub(mul(u, u), [-1, -math.cos(b) * math.sin(b), math.cos(b) * math.sin(b)]))).max())
claim('S1', 'on the slice through 1 and u = cos β·i + sin β·j, u² = −1 + cos β sin β·(j − i)', s1 < 1e-12, f'max err {s1:.1e}')

# S2 at 135° the plane closes: u² = −1 − u/√2, and the number ω with the same rule is −1/(2√2) + i√(7/8)
b = math.radians(135); u = [0, math.cos(b), math.sin(b)]
rhs = add([-1, 0, 0], [-t / math.sqrt(2) for t in u])
w = complex(-1 / (2 * math.sqrt(2)), math.sqrt(7 / 8))
claim('S2', 'at 135° the plane is closed: u² = −1 − u/√2, the rule of the complex number ω = −0.354 + 0.935i (|ω| = 1)',
      close(mul(u, u), rhs) and abs(w * w - (-1 - w / math.sqrt(2))) < 1e-12 and abs(abs(w) - 1) < 1e-12,
      f'angle between 1 and ω = {math.degrees(math.atan2(w.imag, w.real)):.2f}°')

# S3 at 45° (the commutator direction i + j) a square leaks out of the plane unless it is on the real axis
b = math.radians(45); u = [0, math.cos(b), math.sin(b)]; perp = np.array([0, -1, 1]) / math.sqrt(2)
leak_ok = True
for x_, t_ in ((0.3, 0.0), (-1.1, 0.0), (0.2, 0.7), (-0.5, -1.3), (1.0, 2.0)):
    zz_ = [x_ + 0 * t_, t_ * u[1], t_ * u[2]]
    leak = np.array(mul(zz_, zz_)) @ perp
    leak_ok &= abs(leak - t_ * t_ / math.sqrt(2)) < 1e-12
claim('S3', 'at 45° (the direction i + j) squaring x + t·u leaks out of the plane by t²(j − i)/2: always, except on the real axis (t = 0)', leak_ok)

# S4 numbers from the mslices run (computed with the same square; re-run mslices.py to refresh)
J = json.load(open(os.path.join(HERE, 'mslices', 'mslices.json')))
T = {t['beta']: t for t in J['tiles']}
C = {c['beta']: c for c in J['curve']}
c = J['controls']
ok = (abs(T[45]['miss'] - 0.102) < 0.0015 and abs(T[45]['false'] - 0.014) < 0.0015 and abs(T[135]['miss'] - 0.135) < 0.0015
      and abs(T[135]['false'] - 0.204) < 0.0015 and not c['fires'])
claim('S4', '45°: misses 10.2% of the M-set, 1.4% false cover. 135°: misses 13.5%, 20.4% false cover. Controls held.', ok,
      f"45 {T[45]['miss']:.4f}/{T[45]['false']:.4f}  135 {T[135]['miss']:.4f}/{T[135]['false']:.4f}  C3 IoU {c['C3_beta135_vs_prediction']:.5f}")
peak = max((p for p in J['curve'] if 0 < p['beta'] < 90), key=lambda p: p['miss'])
fmin = min(C[b]['false'] for b in range(10, 81, 5))
claim('S5', 'between 0° and 90° the missed share peaks near 20° and 70° (about 12%), not at 45°; 45° has the least false cover of any tilted slice',
      peak['beta'] in (15, 20, 25, 65, 70, 75) and C[45]['miss'] < peak['miss'] and abs(C[45]['false'] - fmin) < 1e-12,
      f"peak {peak['beta']}° {peak['miss']:.4f}; 45° false {C[45]['false']:.4f}, min over 10..80 {fmin:.4f}")

# S6 c = −1 is superattracting in full B3: the 2-cycle {0, −1} has Jacobian product exactly 0
J0 = np.array(v1.square_jacobian([0.0, 0, 0, 0])).reshape(4, 4); J1 = np.array(v1.square_jacobian([-1.0, 0, 0, 0])).reshape(4, 4)
claim('S6', 'at c = −1 the cycle 0 → −1 → 0 attracts in all four dimensions (multiplier exactly 0)', np.abs(J1 @ J0).max() == 0.0)

CITED = [
    ('B ≇ B^op: no invertible linear map turns the product into the opposite algebra (the algebra has a hand)', 'proved', 'Gröbner basis = [1] for the anti-isomorphism equations, B2, B3, B4, 2026-07'),
    ('the only symmetries of the squaring map are identity and reversal', 'proved', 'every sign rule of this shape in B3 and B4; general n open, 2026-09'),
    ('no linear change of coordinates turns (zz)z into z(zz)', 'proved', 'B2 and B3, 2026-09'),
    ('0 is a saddle, not an attractor, on 5.18% of the main cardioid of an in-plane copy of ℂ; 22 parameters where 0 escapes yet a cycle attracts', 'certified', 'ball arithmetic + Krawczyk, 2026-09'),
    ('among all sign rules of this shape, Bristorian exactly minimises the mean-square closure defect', 'proved', 'exact closed form, exhaustive up to 5 dimensions, 2026-08'),
    ('in 3-D (one Julia c), the 134° frame is 3.3× as wrong as 44° and moves as a smoother warp', 'measured', 'edge-point tracking, lower bound, 2026-10'),
]

if __name__ == '__main__':
    tag = 'SABOTAGE (j-roll product)' if SABOTAGE else 'i-roll (core/bristor_product)'
    print(f'== claims check, {tag}')
    for r in results:
        print(f"{'PASS' if r['ok'] else 'FAIL'}  {r['id']:4s} {r['text']}" + (f"\n        {r['detail']}" if r['detail'] else ''))
    print('== cited, not re-run here')
    for t, kind, src in CITED:
        print(f'CITED {t}\n        [{kind}] {src}')
    nfail = sum(not r['ok'] for r in results)
    print(f'== {len(results) - nfail}/{len(results)} pass')
    if not SABOTAGE:
        json.dump({'checked': results, 'cited': [dict(zip(('text', 'kind', 'source'), c)) for c in CITED]},
                  open(os.path.join(HERE, 'claims.json'), 'w'), indent=1, ensure_ascii=False)
