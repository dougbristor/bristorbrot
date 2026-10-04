#!/usr/bin/env python3
# SPDX-License-Identifier: MIT  (c) 2026 Doug Bristor, bristorbrot.org — attribution requested, not required
"""Conformance check for a port of the Bristorian product / square.

    python conform.py my_port.py        # your module defines square(z), mul(a, b) and/or squareJacobian(z)
    python conform.py --selftest        # shows that the check can fail, and how

Numbers are rank-indexed lists: z[0] is the real part, z[a] is e_a (a = 1..n).
The rule:  e_a * e_b = sgn(b - a) * e_b  (a != b),   e_a * e_a = -1.

A port PASSES only if it matches the 'canon' column. If it fails, this script names the
wrong rule it matches instead, because a wrong port still draws a convincing fractal.
Your port may support only some n (e.g. a shader with n = 2 or 3). Cases it cannot take
(it raises, or returns the wrong length) are skipped and reported, never counted as passes.

Licence: MIT. Source: bristorbrot.org.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VECTORS = HERE / "vectors.json"

DIAGNOSIS = {
    "j_roll": "rank order reversed: you have the legacy table e_a*e_b = sgn(a-b)*e_b. "
              "Check sgn(b - a), and check e1 sits in slot 1 (the slot after the real part).",
    "opposite": "the LEFT operand survives in your products. It should be the right one: "
                "e_a*e_b is a multiple of e_b. (Squares cannot show this; only products can.)",
    "quaternion": "this is quaternion multiplication (ij = k). Bristorian products land back "
                  "on a factor: e1*e2 = +e2, e2*e1 = -e1.",
}


def maxdiff(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def run(name, fn, rows, args_of, tol):
    """Return (verdict, report_lines)."""
    tested, skipped, worst = 0, {}, {"canon": 0.0}
    matches_wrong = {k: True for k in DIAGNOSIS}
    first_fail = None
    for r in rows:
        try:
            out = list(fn(*args_of(r)))
            if len(out) != len(r["canon"]):
                raise ValueError("length")
        except Exception:
            skipped[r["n"]] = skipped.get(r["n"], 0) + 1
            continue
        tested += 1
        d = maxdiff(out, r["canon"])
        if d > worst["canon"]:
            worst["canon"] = d
        if d > tol and first_fail is None:
            first_fail = (r, out)
        for k in DIAGNOSIS:
            if r.get(k) is None:
                continue
            if maxdiff(out, r[k]) > tol:
                matches_wrong[k] = False
    lines = []
    if tested == 0:
        return "SKIP", [f"  {name}: no case could be run"]
    ok = worst["canon"] <= tol
    lines.append(f"  {name}: {tested} cases, max |diff| from canon = {worst['canon']:.3g}"
                 + (f"; skipped n={dict(sorted(skipped.items()))}" if skipped else ""))
    if not ok:
        r, out = first_fail
        z = r.get("z") or (r["a"], r["b"])
        lines.append(f"    first failing case n={r['n']} input={z}")
        lines.append(f"      expected {r['canon']}")
        lines.append(f"      got      {out}")
        hits = [k for k, v in matches_wrong.items() if v]
        for k in hits:
            lines.append(f"    DIAGNOSIS ({k}): {DIAGNOSIS[k]}")
        if not hits:
            lines.append("    DIAGNOSIS: matches none of the known wrong rules; check signs term by term.")
    return ("PASS" if ok else "FAIL"), lines


def check(mod_square, mod_mul, quiet=False, mod_jac=None):
    V = json.loads(VECTORS.read_text())
    tol = V["tolerance"] * 1e3  # allow float rounding in ports that are not bit-exact
    results, out = [], []
    if mod_square:
        v, l = run("square(z)", mod_square, V["square"], lambda r: (list(r["z"]),), tol)
        results.append(v); out += l
    if mod_mul:
        v, l = run("mul(a, b)", mod_mul, V["product"], lambda r: (list(r["a"]), list(r["b"])), tol)
        results.append(v); out += l
    if mod_jac:
        v, l = run("squareJacobian(z)", mod_jac, V.get("jacobian", []), lambda r: (list(r["z"]),), tol)
        results.append(v); out += l
    if not mod_mul:
        out.append("  NOTE: square alone cannot tell this algebra from its opposite (they square "
                   "identically). Provide mul(a, b) to certify the hand.")
    verdict = "FAIL" if "FAIL" in results else ("PASS" if "PASS" in results else "SKIP")
    if not quiet:
        print("\n".join(out))
    return verdict, out


# ---- reference rules, used only by --selftest -------------------------------------------
def _sgn(v):
    return (v > 0) - (v < 0)


def _make_mul(rule):
    def mul(p, q):
        n = len(p) - 1
        r = [0.0] * (n + 1)
        r[0] = p[0] * q[0]
        for a in range(1, n + 1):
            r[a] += p[0] * q[a] + p[a] * q[0]
            r[0] -= p[a] * q[a]
            for b in range(1, n + 1):
                if a != b:
                    t = p[a] * q[b]
                    if rule == "canon":
                        r[b] += _sgn(b - a) * t
                    elif rule == "j_roll":
                        r[b] += _sgn(a - b) * t
                    else:  # opposite
                        r[a] += _sgn(a - b) * t
        return r
    return mul


def _quat(p, q):
    if len(p) != 4:
        raise ValueError("quaternions are 4-D")
    w1, x1, y1, z1 = p
    w2, x2, y2, z2 = q
    return [w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2]


def _make_jac(mul):
    """J v = z v + v z, column k = J e_k, returned row-major."""
    def jac(z):
        m = len(z)
        cols = []
        for k in range(m):
            e = [float(i == k) for i in range(m)]
            cols.append([x + y for x, y in zip(mul(z, e), mul(e, z))])
        return [cols[c][r] for r in range(m) for c in range(m)]
    return jac


def _reversed_slots(mul):
    """Canon rule, but imaginary slots stored in reverse order: the classic port mistake."""
    def R(v):
        return [v[0]] + list(reversed(v[1:]))
    return lambda p, q: R(mul(R(p), R(q)))


def selftest():
    canon = _make_mul("canon")
    arms = [
        ("canon", canon, "PASS"),
        ("legacy j_roll table", _make_mul("j_roll"), "FAIL"),
        ("opposite algebra", _make_mul("opposite"), "FAIL"),
        ("quaternion", _quat, "FAIL"),
        ("canon with slots reversed", _reversed_slots(canon), "FAIL"),
    ]
    bad = 0
    for name, mul, want in arms:
        sq = (lambda m: (lambda z: m(z, z)))(mul)
        got, lines = check(sq, mul, quiet=True, mod_jac=_make_jac(mul))
        flag = "ok " if got == want else "BAD"
        bad += got != want
        print(f"[{flag}] {name}: expected {want}, got {got}")
        for l in dict.fromkeys(l.strip() for l in lines if "DIAGNOSIS" in l):
            print("      " + l)
    # the wrong operator of a pair: a transposed Jacobian must FAIL
    cj = _make_jac(canon)
    def transposed(z):
        J, m = cj(z), len(z)
        return [J[c * m + r] for r in range(m) for c in range(m)]
    got, _ = check(None, None, quiet=True, mod_jac=transposed)
    flag = "ok " if got == "FAIL" else "BAD"
    bad += got != "FAIL"
    print(f"[{flag}] transposed Jacobian (J^T for J): expected FAIL, got {got}")
    # the hand is invisible to squaring: an opposite-algebra port PASSES square-only
    opp = _make_mul("opposite")
    got, _ = check(lambda z: opp(z, z), None, quiet=True)
    flag = "ok " if got == "PASS" else "BAD"
    bad += got != "PASS"
    print(f"[{flag}] opposite algebra, square only: expected PASS (squaring is blind to the hand), got {got}")
    print("selftest:", "all arms behaved as expected" if not bad else f"{bad} arm(s) misbehaved")
    return bad == 0


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    if sys.argv[1] == "--selftest":
        sys.exit(0 if selftest() else 1)
    spec = importlib.util.spec_from_file_location("port", sys.argv[1])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sq, mu = getattr(mod, "square", None), getattr(mod, "mul", None)
    jc = getattr(mod, "squareJacobian", None) or getattr(mod, "square_jacobian", None)
    if not (sq or mu or jc):
        print("your module must define square(z), mul(a, b) and/or squareJacobian(z)")
        sys.exit(2)
    verdict, _ = check(sq, mu, mod_jac=jc)
    print(verdict)
    sys.exit(0 if verdict == "PASS" else 1)


if __name__ == "__main__":
    main()
