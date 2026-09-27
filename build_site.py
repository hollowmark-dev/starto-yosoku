"""Build the public site into docs/ (GitHub Pages serves from docs/).

Python 3 stdlib only -- no third-party dependencies at build time.

What this does, every run:
  1. reads the roster from --members (a JSON list of
     {id, name, group, artist_id, ord, url, z}; group == "" means solo)
  2. reads the face pool (--pool + --faces), or fabricates a stub pool
     with --stub
  3. reads the per-member hub correction (--hub), or zeroes it with --stub
  4. writes docs/data.js, docs/disclaimer.js, and docs/faces/*.jpg
  5. syncs the static OGP/title tags in docs/index.html from docs/config.js

Nothing outside the four --members/--pool/--faces/--hub paths (plus the
repo's own publish/disclaimer.md and docs/config.js) is ever read. In
particular this script never touches anything under a real member's own
photo -- the roster file has no photos in it, and the pool/faces inputs
are expected to already be faces of people who do not exist.

Usage:
  python build_site.py --members PATH --pool PATH --faces DIR --hub PATH
  python build_site.py --members PATH --stub

--stub fabricates a 60-face pool with random coordinates, a placeholder
grey .jpg for each face, and a zero hub-offset for every member, so the
site (and the test suite) can run before real generated faces and a real
hub-offset fit exist. It is clearly labelled wherever it takes effect;
never use it to publish.
"""
import argparse
import base64
import json
import os
import random
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, "docs")
FACES_DIR = os.path.join(DOCS, "faces")
SRC_DISCLAIMER = os.path.join(HERE, "publish", "disclaimer.md")

AXES = 5                      # fixed by the inference code in docs/app.js
STUB_POOL_SIZE = 60

# Solo talents (group == "") get this as their display label. Named
# groups use their own string as the label verbatim -- data.js keeps them
# identical on purpose, so a group rename is a members.json change only.
SOLO_LABEL = "ソロ"

# The OGP/description copy is brand content, not roster data, so (like
# the original build script) it lives here rather than being derived.
OG_DESC = "実在しない顔を見比べて、STARTO ENTERTAINMENTのタレントから好みの傾向が近い3人をさがします"

# A tiny (64x64, solid grey) valid JPEG, used only by --stub so the page
# has something to fetch before real generated faces exist. Baked in as
# bytes so build_site.py stays stdlib-only (no image library needed).
_STUB_JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDUooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z"


def fail(msg):
    raise SystemExit("build_site.py: " + msg)


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--members", required=True,
                    help="path to members_public.json")
    p.add_argument("--pool", help="path to the face pool json "
                   '([{"id":"g###","z":[...]}, ...])')
    p.add_argument("--faces", help="dir containing <pool id>.jpg")
    p.add_argument("--hub", help='path to the hub-offset json '
                   '({"adj": {member_id: float}})')
    p.add_argument("--stub", action="store_true",
                   help="fabricate pool/faces/hub instead of reading them "
                        "(clearly-labelled placeholder data, never for "
                        "publishing)")
    args = p.parse_args(argv)
    if not args.stub:
        missing = [n for n in ("pool", "faces", "hub")
                   if getattr(args, n) is None]
        if missing:
            fail("--" + ", --".join(missing) + " required unless --stub "
                 "is given")
    return args


# ---------------------------------------------------------------------------
# roster
# ---------------------------------------------------------------------------
def load_members(path):
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list) or not raw:
        fail(f"{path}: expected a non-empty JSON list of members")

    members = []
    seen_ids = set()
    for i, m in enumerate(raw):
        for key in ("id", "name", "group", "ord", "url", "z"):
            if key not in m:
                fail(f"{path}: entry {i} ({m.get('id', '?')}) is missing "
                     f"'{key}'")
        if not re.match(r"^M\d{3}$", m["id"]):
            fail(f"{path}: id '{m['id']}' does not match ^M\\d{{3}}$")
        if m["id"] in seen_ids:
            fail(f"{path}: duplicate id '{m['id']}'")
        seen_ids.add(m["id"])
        if len(m["z"]) != AXES:
            fail(f"{path}: {m['id']} has {len(m['z'])} axis values, "
                 f"expected {AXES}")
        # keep only the fields the site actually ships; artist_id / note /
        # anything else in the source file is internal bookkeeping and
        # must never reach docs/data.js.
        members.append({
            "id": m["id"], "name": m["name"], "group": m["group"],
            "ord": m["ord"], "url": m["url"], "z": [float(v) for v in m["z"]],
        })

    # GROUP_ORDER: named groups in first-appearance order, then the solo
    # sentinel "" last (only if any member is actually solo). This is the
    # one and only place group order is decided -- purely from the data,
    # so moving members between groups is a members.json change only.
    group_order = []
    for m in members:
        if m["group"] and m["group"] not in group_order:
            group_order.append(m["group"])
    if any(m["group"] == "" for m in members):
        group_order.append("")

    group_label = {g: g for g in group_order if g != ""}
    if "" in group_order:
        group_label[""] = SOLO_LABEL

    return members, group_order, group_label


# ---------------------------------------------------------------------------
# face pool
# ---------------------------------------------------------------------------
def load_pool(path):
    with open(path, encoding="utf-8") as f:
        pool = json.load(f)
    if not isinstance(pool, list) or not pool:
        fail(f"{path}: expected a non-empty JSON list of pool faces")
    out = []
    seen = set()
    for i, p in enumerate(pool):
        if "id" not in p or "z" not in p:
            fail(f"{path}: pool entry {i} missing 'id' or 'z'")
        if p["id"] in seen:
            fail(f"{path}: duplicate pool id '{p['id']}'")
        seen.add(p["id"])
        if len(p["z"]) != AXES:
            fail(f"{path}: pool face {p['id']} has {len(p['z'])} axis "
                 f"values, expected {AXES}")
        out.append({"id": p["id"], "z": [float(v) for v in p["z"]]})
    return out


def make_stub_pool(n=STUB_POOL_SIZE, seed=1234):
    rng = random.Random(seed)
    return [{"id": f"g{900 + i:03d}",
             "z": [round(rng.gauss(0, 1.4), 4) for _ in range(AXES)]}
            for i in range(n)]


def copy_faces(pool, faces_src_dir):
    shutil.rmtree(FACES_DIR, ignore_errors=True)
    os.makedirs(FACES_DIR, exist_ok=True)
    missing = []
    for p in pool:
        src = os.path.join(faces_src_dir, p["id"] + ".jpg")
        if not os.path.exists(src):
            missing.append(p["id"])
            continue
        shutil.copy2(src, os.path.join(FACES_DIR, p["id"] + ".jpg"))
    if missing:
        fail(f"{len(missing)} pool face(s) have no .jpg in {faces_src_dir}: "
             f"{missing[:8]}{' ...' if len(missing) > 8 else ''} -- "
             f"refusing to build")


def write_stub_faces(pool):
    shutil.rmtree(FACES_DIR, ignore_errors=True)
    os.makedirs(FACES_DIR, exist_ok=True)
    jpg = base64.b64decode(_STUB_JPEG_B64)
    for p in pool:
        with open(os.path.join(FACES_DIR, p["id"] + ".jpg"), "wb") as f:
            f.write(jpg)


# ---------------------------------------------------------------------------
# hub offset
# ---------------------------------------------------------------------------
def load_hub(path, members):
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    adj = raw.get("adj") if isinstance(raw, dict) else None
    if adj is None:
        fail(f"{path}: expected a JSON object with an 'adj' map")
    missing = [m["id"] for m in members if m["id"] not in adj]
    if missing:
        fail(f"no hub offset for {len(missing)} member(s): "
             f"{missing[:8]}{' ...' if len(missing) > 8 else ''} -- "
             f"refusing to build")
    return {m["id"]: float(adj[m["id"]]) for m in members}


def make_stub_hub(members):
    return {m["id"]: 0.0 for m in members}


# ---------------------------------------------------------------------------
# disclaimer
# ---------------------------------------------------------------------------
def split_disclaimer():
    """Pull the two blocks out of publish/disclaimer.md, verbatim.

    Returns (intro_text, detail_markdown), both with their original line
    breaks kept -- the page renders them with white-space:pre-line so
    what is written here is exactly what a visitor reads.
    """
    if not os.path.exists(SRC_DISCLAIMER):
        fail(f"{SRC_DISCLAIMER} not found")
    md = open(SRC_DISCLAIMER, encoding="utf-8").read()
    m = re.search(r"^## 冒頭ブロック[^\n]*\n(.*?)(?=^## )", md, re.S | re.M)
    if not m:
        fail("intro block ('## 冒頭ブロック...') not found in disclaimer.md")
    intro = m.group(1).strip("\n")
    m2 = re.search(r"^## このサイトについて[^\n]*\n(.*)", md, re.S | re.M)
    if not m2:
        fail("detail block ('## このサイトについて...') not found in "
             "disclaimer.md")
    detail = m2.group(1).strip("\n")
    return intro, detail


# ---------------------------------------------------------------------------
# index.html sync (brand / siteUrl come from docs/config.js)
# ---------------------------------------------------------------------------
def read_config():
    cfg_path = os.path.join(DOCS, "config.js")
    src = open(cfg_path, encoding="utf-8").read()

    def g(key, default=""):
        m = re.search(key + r'\s*:\s*"([^"]*)"', src)
        return m.group(1) if m else default
    return g("brand", "推し予測"), g("siteUrl").strip().rstrip("/")


def sync_index(brand, url):
    p = os.path.join(DOCS, "index.html")
    h = open(p, encoding="utf-8").read()
    base = url if url else "SITE_BASE_URL"
    h = re.sub(r"<title>[^<]*</title>", f"<title>{brand}</title>", h)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*(")',
               rf"\g<1>{brand}\g<2>", h)
    h = re.sub(r'(<meta name="twitter:title" content=")[^"]*(")',
               rf"\g<1>{brand}\g<2>", h)
    h = re.sub(r'(<meta property="og:url" content=")[^"]*(")',
               rf"\g<1>{base}/\g<2>", h)
    h = re.sub(r'(<meta property="og:image" content=")[^"]*(")',
               rf"\g<1>{base}/ogp.png\g<2>", h)
    h = re.sub(r'(<meta name="twitter:image" content=")[^"]*(")',
               rf"\g<1>{base}/ogp.png\g<2>", h)
    for k in ('<meta property="og:description" content="',
              '<meta name="twitter:description" content="',
              '<meta name="description" content="'):
        h = re.sub(re.escape(k) + r'[^"]*(")', k + OG_DESC + r"\g<1>", h)
    h = re.sub(r'(<section id="intro">\s*<h1>)[^<]*(</h1>)',
               rf"\g<1>{brand}\g<2>", h)
    open(p, "w", encoding="utf-8").write(h)
    return base


# ---------------------------------------------------------------------------
def main(argv):
    args = parse_args(argv)
    os.makedirs(DOCS, exist_ok=True)

    members, group_order, group_label = load_members(args.members)
    print(f"  roster: {len(members)} members, "
          f"{len([g for g in group_order if g])} named group(s)"
          + (" + solo section" if "" in group_order else ""))

    if args.stub:
        print("  *** --stub build: pool / faces / hub offsets are "
              "FABRICATED PLACEHOLDERS. Never publish this build. ***")
        pool = make_stub_pool()
        write_stub_faces(pool)
        hub = make_stub_hub(members)
    else:
        pool = load_pool(args.pool)
        copy_faces(pool, args.faces)
        hub = load_hub(args.hub, members)

    pub_members = [{"id": m["id"], "name": m["name"], "group": m["group"],
                    "url": m["url"], "ord": m["ord"], "z": m["z"],
                    "adj": hub[m["id"]]} for m in members]
    pub_pool = [{"id": p["id"], "z": p["z"]} for p in pool]

    with open(os.path.join(DOCS, "data.js"), "w", encoding="utf-8") as f:
        f.write("/* generated by build_site.py -- do not edit by hand */\n")
        f.write("const GROUP_LABEL=" +
                json.dumps(group_label, ensure_ascii=False) + ";\n")
        f.write("const GROUP_ORDER=" +
                json.dumps(group_order, ensure_ascii=False) + ";\n")
        f.write("const POOL=" + json.dumps(pub_pool) + ";\n")
        f.write("const MEMBERS=" +
                json.dumps(pub_members, ensure_ascii=False) + ";\n")

    intro, detail = split_disclaimer()
    with open(os.path.join(DOCS, "disclaimer.js"), "w",
              encoding="utf-8") as f:
        f.write("/* VERBATIM from publish/disclaimer.md -- do not reword.\n"
                 "   Regenerate with build_site.py; tests/check_publish.py\n"
                 "   verifies these strings still match the source "
                 "exactly. */\n")
        f.write("const DISCLAIMER_INTRO=" +
                json.dumps(intro, ensure_ascii=False) + ";\n")
        f.write("const DISCLAIMER_DETAIL=" +
                json.dumps(detail, ensure_ascii=False) + ";\n")

    brand, url = read_config()
    base = sync_index(brand, url)
    print(f"  brand '{brand}', site URL "
          + (f"{base}" if url else "NOT SET (placeholder kept)"))

    tot = sum(os.path.getsize(os.path.join(FACES_DIR, fn))
              for fn in os.listdir(FACES_DIR))
    print(f"  faces {len(pool)}, {tot / 1024:.0f} KB total")
    print(f"  members {len(pub_members)}")
    print("  wrote docs/data.js, docs/disclaimer.js, docs/faces/")


if __name__ == "__main__":
    main(sys.argv[1:])
