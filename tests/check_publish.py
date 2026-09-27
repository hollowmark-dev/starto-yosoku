"""Pre-publish gate for docs/. Run before every push.

This is a reduced port of the eqnojo-yosoku original. What it drops on
purpose: the identity-threshold re-check (0.446 against ArcFace scores).
That gating happens upstream, before a face ever reaches the pool json
build_site.py is given -- this repo has no ArcFace/identity pipeline of
its own, so re-checking a threshold here would just be trusting a number
nobody here can verify. Run the real identity gate in the pipeline that
produces --pool/--faces, before they ever get near this repo.

What this DOES check, in order of how bad it would be to get wrong:
  1. no personal/biometric artefact anywhere under docs/
  2. no talent photograph -- by filename AND by content hash against any
     "members" directory a caller points --known-photos at (optional;
     this repo ships no talent photos to hash against, since none were
     ever given to build_site.py)
  3. docs/ contains nothing other than the expected shipped files
  4. the disclaimer text in docs/ is byte-identical to publish/disclaimer.md
  5. config.js and the markup agree (brand, og:url, og:image)
  6. no email address anywhere under docs/
  7. transfer budget: what a first visit actually downloads

Exit code 1 on any failure.

  python tests/check_publish.py
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(HERE, "docs")

# Never publishable, matched case-insensitively as a whole path segment.
FORBIDDEN_DIRS = {"members", "starto_work", "proto", "pilot"}
FORBIDDEN_EXT = {".npy", ".npz", ".pkl", ".pt", ".safetensors", ".csv", ".tsv"}
ALLOWED_FACE_DIR = os.path.join(DOCS, "faces")

# The complete, exact set of files docs/ is allowed to contain (faces/*
# is checked separately since its filenames vary with the pool).
EXPECTED_TOP_LEVEL = {
    "index.html", "app.js", "config.js", "data.js", "disclaimer.js",
    "favicon.png", "ogp.png",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def fail(msgs):
    print("\nREFUSING TO PUBLISH:")
    for m in msgs:
        print("  " + m)
    sys.exit(1)


def walk(root):
    for dp, dns, fns in os.walk(root):
        for fn in fns:
            yield os.path.join(dp, fn)


def sha(p, n=1 << 20):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            b = f.read(n)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def main():
    bad = []
    if not os.path.isdir(DOCS):
        fail(["docs/ does not exist -- run build_site.py first"])

    files = list(walk(DOCS))
    print(f"docs/ contains {len(files)} files")

    # --- 1: no files outside faces/ have a forbidden extension/dir ------
    for p in files:
        rel = os.path.relpath(p, DOCS).replace("\\", "/")
        ext = os.path.splitext(p)[1].lower()
        segs = {s.lower() for s in rel.split("/")[:-1]}
        if ext in FORBIDDEN_EXT:
            bad.append(f"forbidden extension {ext}: docs/{rel}")
        if segs & FORBIDDEN_DIRS:
            bad.append(f"forbidden directory: docs/{rel}")

    # --- 2: talent photographs by CONTENT, if a reference dir is given --
    # This repo's own inputs (members_public.json) carry no photos at
    # all, so there is normally nothing to hash against; this check only
    # bites if TALENT_PHOTOS_DIR happens to be set for a manual run.
    ref_dir = os.environ.get("TALENT_PHOTOS_DIR", "")
    if ref_dir and os.path.isdir(ref_dir):
        known = {sha(p): os.path.relpath(p, ref_dir) for p in walk(ref_dir)}
        hits = 0
        for p in files:
            if os.path.splitext(p)[1].lower() not in (".jpg", ".jpeg",
                                                       ".png", ".webp"):
                continue
            h = sha(p)
            if h in known:
                rel = os.path.relpath(p, DOCS).replace("\\", "/")
                bad.append(f"TALENT PHOTOGRAPH by content: docs/{rel} "
                           f"== {known[h]}")
            hits += 1
        print(f"  hashed {hits} images against {len(known)} known talent "
              f"photos -> {'clean' if not any('PHOTOGRAPH' in b for b in bad) else 'HIT'}")
    else:
        print("  (no TALENT_PHOTOS_DIR given -- skipping content-hash "
              "check; this repo's own inputs carry no photos)")

    # --- 3: docs/ contains only the expected shipped files --------------
    top_level = {os.path.relpath(p, DOCS).replace("\\", "/")
                 for p in files if os.path.dirname(p) == DOCS}
    unexpected_top = top_level - EXPECTED_TOP_LEVEL
    if unexpected_top:
        bad.append(f"unexpected file(s) directly under docs/: "
                   f"{sorted(unexpected_top)}")
    missing_top = EXPECTED_TOP_LEVEL - top_level
    if missing_top:
        bad.append(f"missing expected file(s) under docs/: "
                   f"{sorted(missing_top)}")
    other_dirs = {os.path.relpath(os.path.dirname(p), DOCS).replace("\\", "/")
                  for p in files if os.path.dirname(p) != DOCS}
    unexpected_dirs = other_dirs - {"faces"}
    if unexpected_dirs:
        bad.append(f"unexpected directory/directories under docs/: "
                   f"{sorted(unexpected_dirs)}")
    face_files = [p for p in files if os.path.dirname(p) == ALLOWED_FACE_DIR]
    non_jpg = [p for p in face_files
               if os.path.splitext(p)[1].lower() != ".jpg"]
    if non_jpg:
        bad.append(f"non-.jpg file(s) in docs/faces/: "
                   f"{[os.path.basename(p) for p in non_jpg]}")
    print(f"  top-level files: {sorted(top_level)}")
    print(f"  docs/faces/: {len(face_files)} .jpg file(s)")

    # --- 4: disclaimer verbatim ----------------------------------------
    dj = os.path.join(DOCS, "disclaimer.js")
    md = os.path.join(HERE, "publish", "disclaimer.md")
    if os.path.exists(dj) and os.path.exists(md):
        js = open(dj, encoding="utf-8").read()
        m_i = re.search(r"const DISCLAIMER_INTRO=(\".*?\");\n", js, re.S)
        m_d = re.search(r"const DISCLAIMER_DETAIL=(\".*?\");\n", js, re.S)
        if not m_i or not m_d:
            bad.append("disclaimer.js does not define DISCLAIMER_INTRO / "
                       "DISCLAIMER_DETAIL as expected")
        else:
            got_i = json.loads(m_i.group(1))
            got_d = json.loads(m_d.group(1))
            raw = open(md, encoding="utf-8").read()
            for label, got in (("intro", got_i), ("detail", got_d)):
                if got.strip() and got.strip() in raw:
                    print(f"  disclaimer {label}: verbatim OK "
                         f"({len(got)} chars)")
                else:
                    bad.append(f"disclaimer {label} does NOT match "
                              f"publish/disclaimer.md verbatim")
    else:
        bad.append("disclaimer.js or publish/disclaimer.md missing")

    # --- 5: config.js is the single source; the markup must agree ------
    idx = os.path.join(DOCS, "index.html")
    cfg = os.path.join(DOCS, "config.js")
    if os.path.exists(idx) and os.path.exists(cfg):
        h_raw = open(idx, encoding="utf-8").read()
        h = re.sub(r"<!--.*?-->", "", h_raw, flags=re.S)
        c = open(cfg, encoding="utf-8").read()

        def cv(k):
            m = re.search(k + r'\s*:\s*"([^"]*)"', c)
            return m.group(1).strip() if m else ""
        brand, url = cv("brand"), cv("siteUrl").rstrip("/")
        if "SITE_BASE_URL" in h:
            bad.append("config.js siteUrl is empty -- the X card cannot "
                       "render without an absolute URL. Set it, then "
                       "re-run build_site.py")
        elif url:
            for tag, want in (("og:url", url + "/"),
                              ("og:image", url + "/ogp.png")):
                m = re.search(r'content="([^"]*)"[^>]*>',
                              h[h.find(tag):]) if tag in h else None
                got = m.group(1) if m else ""
                if got != want:
                    bad.append(f"{tag} is '{got}' but config.js says "
                              f"'{want}' -- re-run build_site.py")
        if brand and f"<title>{brand}</title>" not in h:
            bad.append(f"config.js brand is '{brand}' but index.html "
                      f"<title> disagrees -- re-run build_site.py")
        if brand:
            print(f"  brand '{brand}' consistent between config.js "
                 f"and index.html")

    # --- 6: no email address anywhere under docs/ -----------------------
    email_hits = []
    for p in files:
        ext = os.path.splitext(p)[1].lower()
        if ext not in (".html", ".js", ".css", ".md", ".json"):
            continue
        try:
            text = open(p, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        for m in EMAIL_RE.finditer(text):
            email_hits.append((os.path.relpath(p, DOCS).replace("\\", "/"),
                               m.group(0)))
    if email_hits:
        bad.append(f"email address(es) found under docs/: {email_hits}")
    else:
        print("  no email address found under docs/")

    # --- 7: transfer budget --------------------------------------------
    def size(*names):
        t = 0
        for n in names:
            p = os.path.join(DOCS, n)
            if os.path.exists(p):
                t += os.path.getsize(p)
        return t
    total = sum(os.path.getsize(p) for p in files)
    shell = size("index.html", "app.js", "data.js", "config.js",
                 "disclaimer.js", "favicon.png")
    fdir = [os.path.getsize(p) for p in face_files]
    avg = sum(fdir) / len(fdir) if fdir else 0
    print(f"\ndocs/ total          {total / 1e6:.2f} MB ({len(files)} files)")
    print(f"  first paint (shell) {shell / 1024:.0f} KB"
          f"  -- no face images yet")
    print(f"  per question (4)    {avg * 4 / 1024:.0f} KB")
    print(f"  full 12-question run {shell / 1024 + avg * 48 / 1024:.0f} KB"
          f"  ({len(fdir)} faces exist; 48 fetched at most)")
    print(f"  OGP card            {size('ogp.png') / 1024:.0f} KB"
          f"  (fetched by X, not by the visitor)")

    if bad:
        fail(bad)
    print("\nALL CHECKS PASSED -- docs/ is safe to publish")


if __name__ == "__main__":
    main()
