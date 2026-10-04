# Bristorbrot

Fractals in **Bristorian** algebra. Its numbers, **imordials**, are ranked imaginaries: multiplication keeps
the order of the ranks and breaks the magnitude. They share the i/j/k symbols with quaternions but are a
different algebra, and they extend to any dimension. 4-D is a render limit, not an algebraic one.

This repository has two parts:

- **`core/`**: the reusable code, for other developers. The Bristorian product, the maps built on it, a
  distance-estimate ray marcher and the C pickers. Each block has JavaScript, Python and/or GLSL faces,
  its test vectors, and the scripts that check every face against them. Start at [`core/README.md`](core/README.md).
- **`viewers/brot_viewer/`**: a simple player built only from `core/`. b_brot, chi_brot ((zz)z and z(zz))
  and the quaternion sets for comparison, each as Mandelbrot and Julia, with the matching C picker.

## Run the player

The built player in `packs/brot_viewer/<version>/` is self-contained. Serve the repository with any static
server and open it in a browser with WebGL2:

```
python3 -m http.server 8000
# then open http://localhost:8000/packs/brot_viewer/v2/
```

## How it is put together

Everything here is **assembled, never retyped**. The render and algebra code comes from CodeT blocks, each
face used unchanged, and the text comes from story atoms. Each block's own conformance checks run on every
build, against the copy that ships rather than the source. If something is wrong in a block, it is fixed in
the block and rebuilt here, not patched in the copy. Scaffolding such as file I/O, manifests and the build
tool is ordinary code, because there is no block for it to come from.

```
core/                          the reusable blocks, rebuilt in place (git history is their version record)
    README.md                  what each block is, and the command that checks each face
    <block>/                   faces (v1.js, v1.py, v1.glsl), vectors.json, conformance scripts
core.json                      which blocks core/ holds, with a one-line description of each
viewers/<name>/                a viewer's own glue: viewer.json, index.html, *.js, *.glsl
packs/<name>/<version>/        a built, frozen, self-contained snapshot
    manifest.json              what went in: files and their sha256, conformance results, checks, licence
    code/<block>/              the blocks it uses, as they were at build time
    atoms/*.md                 story packs only: the text atoms
tools/build_pack.py            builds core/ and the packs
tools/check_viewer.mjs         runs a viewer's own check() headless, as shipped and with each fault switch
```

Packs so far:

- `packs/brot_viewer/v1`: the first player (2026-10-03).
- `packs/brot_viewer/v2`: the fast fixed-size product for n = 2, 3, the B2 variant of the marcher, and a
  tighter Fine hit floor (2026-10-04).
- `packs/de_ray/v1`: steps 0–1 of the story "The life of one ray": what these numbers are, and how
  to square one and take its Jacobian, with the product they rely on.

## Build

```
python3 tools/build_pack.py --core
python3 tools/build_pack.py --viewer brot_viewer --version v3
python3 tools/build_pack.py de_ray --steps 0-1 --version v2
```

Rebuilding needs the CodeT source tree, which is not part of this repository. The conformance checks inside
`core/` and each pack run on their own. Add `--dry-run` to run every check and write nothing. A build fails, and leaves nothing behind, if any of
these happen:

- a block's conformance check, or its self-test, fails in the built copy;
- a block has a file the builder does not know how to classify;
- a block's `requires:` is missing, or a relative import resolves outside the pack (viewers);
- the viewer's `check()` fails as shipped, or still passes with any of its fault switches on (viewers);
- a viewer uses a block that `core.json` does not list (core);
- internal paths or ledger text turn up in what ships;
- for story packs: the step table disagrees with the atoms' own `step:` fields, an atom depends on one
  outside the pack, the atoms disagree on the conventions stamp, or the text lint finds a hit.

An existing pack version is never overwritten. Bump the version instead.

## Licence

Code MIT · vectors and data CC0 · text CC BY 4.0. See [`LICENSE`](LICENSE). Attribution is requested but not
required: "Bristorbrot / Doug Bristor, bristorbrot.org".
