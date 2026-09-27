/* Headless checks for docs/. No browser is used anywhere in this project.
 *
 * Runs the real docs/app.js inside a vm with a stub DOM, so the code under
 * test is the code that ships -- not a copy.
 *
 * Unlike the eqnojo-yosoku original, this file hardcodes NOTHING about
 * roster shape (member count, group count, group names). Every structural
 * expectation is read back out of docs/data.js itself, so a members.json
 * change (a group split, a roster grow) never requires touching this file.
 *
 *   node tests/docs_test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DOCS = path.join(__dirname, "..", "docs");
const PUBLISH = path.join(__dirname, "..", "publish");
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  <- " + extra : "")); }
}

/* ---------- stub DOM ---------- */
function makeEl(tag) {
  const e = {
    tagName: tag, children: [], attrs: {}, style: {}, dataset: {},
    _text: "", onclick: null, disabled: false,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); }
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    querySelector() { return null; },
    get firstChild() { return this.children[0] || null; }
  };
  return e;
}
const els = {};
["intro", "quiz", "oshi", "result", "notice", "detail", "start", "qnum",
 "qbar", "quad", "skipq", "ogrid", "odone", "oskip", "conf", "cards",
 "map", "share", "again", "foot", "none", "again2", "saveimg"].forEach(id => { els[id] = makeEl("div"); });

let fetchCalls = 0, openCalls = [];
const sandbox = {
  console,
  Math, Date, JSON, encodeURIComponent, Array, Object, String, Number, URL,
  document: {
    readyState: "complete",
    getElementById: id => els[id] || (els[id] = makeEl("div")),
    createElement: makeEl,
    createElementNS: (ns, t) => makeEl(t),
    addEventListener: () => {},
    querySelectorAll: () => []
  },
  window: { scrollTo: () => {}, open: (u) => openCalls.push(u) },
  location: { href: "https://example.invalid/oshi/" },
  fetch: () => { fetchCalls++; return { catch: () => {} }; },
  performance: { now: () => Date.now() }
};
sandbox.globalThis = sandbox;
sandbox.window.scrollTo = () => {};
vm.createContext(sandbox);

for (const f of ["config.js", "disclaimer.js", "data.js", "app.js"]) {
  vm.runInContext(fs.readFileSync(path.join(DOCS, f), "utf8"), sandbox, { filename: f });
}
/* `const` at the top level of a vm script lives in the context's lexical
 * scope, not on the sandbox object, so pull the values out by evaluating
 * an expression inside the same context. */
const G = vm.runInContext(
  "({POOL:POOL, MEMBERS:MEMBERS, CONFIG:CONFIG, GROUP_LABEL:GROUP_LABEL," +
  " GROUP_ORDER:GROUP_ORDER," +
  " DISCLAIMER_INTRO:DISCLAIMER_INTRO, DISCLAIMER_DETAIL:DISCLAIMER_DETAIL})",
  sandbox);
const API = sandbox.OSHIYOHO, POOL = G.POOL, MEMBERS = G.MEMBERS;
const GL = G.GROUP_LABEL, GO = G.GROUP_ORDER;
sandbox.CONFIG = G.CONFIG;
sandbox.DISCLAIMER_INTRO = G.DISCLAIMER_INTRO;
sandbox.DISCLAIMER_DETAIL = G.DISCLAIMER_DETAIL;

/* sources read once, up front: later sections assert on them */
const appSrc = fs.readFileSync(path.join(DOCS, "app.js"), "utf8");
const htmlSrc = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
const visible = htmlSrc.replace(/<!--[\s\S]*?-->/g, "");

/* derived, not hardcoded: the solo sentinel is whichever GROUP_ORDER key
 * has no named-group string, i.e. "". Named groups are everything else. */
const SOLO_KEY = GO.find(k => !k) === undefined ? null : "";
const NAMED_GROUPS = GO.filter(k => k !== SOLO_KEY);
const N = MEMBERS.length;

/* ---------- data ---------- */
console.log("\n[data]");
ok("POOL large enough", POOL.length >= 60, "n=" + POOL.length);
ok("MEMBERS is non-empty", N > 0);
/* hub correction: present, small, centred on zero */
ok("every member carries a hub offset", MEMBERS.every(m => typeof m.adj === "number"));
ok("hub offsets are capped (|adj| <= 0.5, see hub_offset.py CAP)", MEMBERS.every(m => Math.abs(m.adj) <= 0.5),
   JSON.stringify(MEMBERS.map(m => m.adj)));
ok("hub offsets are centred (|mean| < 0.01)",
   Math.abs(MEMBERS.reduce((s, m) => s + m.adj, 0) / N) < 0.01);
ok("every pool face has 5 coords", POOL.every(p => p.z.length === 5));
ok("every member has 5 coords", MEMBERS.every(m => m.z.length === 5));
ok("pool carries NO identity score into the public bundle",
   POOL.every(p => p.sim === undefined));
ok("members carry name/group(string)/url",
   MEMBERS.every(m => m.name && typeof m.group === "string" && /^https:\/\//.test(m.url)));
ok("no member links to a bare domain root",
   MEMBERS.every(m => new URL(m.url).pathname.replace(/\/+$/, "").length > 0),
   MEMBERS.filter(m => new URL(m.url).pathname.replace(/\/+$/, "") === "")
          .map(m => m.id).join(","));
ok("no personal social-media links",
   !MEMBERS.some(m => /(twitter|x\.com|instagram|tiktok|youtube)/i.test(m.url)));
/* the member link label is never per-member data -- app.js falls back to
 * a single fixed label for everyone (see app.js's `m.link || "..."`) */
ok("no member carries a custom link label",
   MEMBERS.every(m => m.link === undefined));
ok("link label is 公式プロフィール (the app.js fallback)", /公式プロフィール/.test(appSrc));
/* group ids double as their own display label; only the solo sentinel
 * needs a real translation */
ok("every group present has a display label", MEMBERS.every(m => GL[m.group] !== undefined));
ok("named groups' labels equal the group string itself",
   NAMED_GROUPS.every(g => GL[g] === g));
if (SOLO_KEY !== null) {
  ok("solo sentinel has a non-empty, distinct label",
     !!GL[SOLO_KEY] && GL[SOLO_KEY] !== SOLO_KEY);
}
ok("GROUP_ORDER covers every group used by a member",
   MEMBERS.every(m => GO.indexOf(m.group) >= 0));
ok("app.js renders groups through the label map, not m.group",
   !/textContent = m\.group/.test(appSrc) && /gname\(m\.group\)/.test(appSrc));
ok("no raw member/face id pattern in the page text",
   !/\bM\d{3}\b/.test(visible) && !/\bg\d{3}\b/.test(visible));
ok("every member has a roster position (ord)", MEMBERS.every(m => typeof m.ord === "number"));
/* ord is scoped PER GROUP (it is the position on that group's own
 * official page), not a single global ranking -- so within each NAMED
 * group it must be a contiguous 0..size-1, but across groups (and among
 * solo talents, who may all tie at 0) it does not need to be unique. */
ok("within each named group, ord is a contiguous 0..size-1",
   NAMED_GROUPS.every(g => {
     const ords = MEMBERS.filter(m => m.group === g).map(m => m.ord).sort((a, b) => a - b);
     return ords.every((v, i) => v === i);
   }));
ok("each named group is contiguous in the MEMBERS array order", NAMED_GROUPS.every(key => {
     const idx = MEMBERS.map((m, i) => i).filter(i => MEMBERS[i].group === key);
     return idx.length > 0 && idx[idx.length - 1] - idx[0] === idx.length - 1;
   }));
ok("group sizes sum to the full roster",
   GO.reduce((s, g) => s + MEMBERS.filter(m => m.group === g).length, 0) === N);
ok("no member photo path in data.js",
   !fs.readFileSync(path.join(DOCS, "data.js"), "utf8").match(/members\//));

/* ---------- privacy / policy constraints ---------- */
console.log("\n[policy]");
ok("app.js never references members/ images", !/members\/[^"']*\.(jpg|png)/.test(appSrc));
ok("index.html never references members/ images", !/members\/[^"']*\.(jpg|png)/.test(htmlSrc));
ok("no face image dir other than faces/", !/src\s*=\s*["'](?!faces\/)[^"']*\.(jpg|jpeg)/.test(appSrc));
/* word-boundary, not substring: the brand includes "ENTERTAINMENT",
 * which contains the letters "AI" but is not the word "AI". */
ok("the word AI is not used as a selling point",
   !/\bAI\b/.test(visible) && !visible.includes("人工知能") && !visible.includes("ＡＩ"));
ok("uses 実在しない人物の顔 framing", visible.includes("実在しない人物の顔"));
const rankWords = ["ランキング", "1位", "第1位", "点数", "スコア", "得点", "順位"];
ok("no ranking/score vocabulary in the UI",
   !rankWords.some(w => visible.includes(w)),
   rankWords.filter(w => visible.includes(w)).join(","));
ok("result heading uses 好みの傾向が近い", visible.includes("好みの傾向が近い"));
/* the axis values exist in data.js but must never reach the screen */
ok("app.js never renders an axis value",
   !/textContent\s*=\s*[^;]*\.z\[/.test(appSrc) && !/toFixed/.test(appSrc));
ok("no axis label vocabulary shipped",
   !/細い目|たれ目|丸顔|求心的|彫りが深い/.test(appSrc + visible));

/* ---------- disclaimer placement ---------- */
console.log("\n[disclaimer]");
const md = fs.readFileSync(path.join(PUBLISH, "disclaimer.md"), "utf8")
             .replace(/\r\n/g, "\n");
ok("intro is verbatim from publish/disclaimer.md", md.includes(sandbox.DISCLAIMER_INTRO.trim()));
ok("detail is verbatim from publish/disclaimer.md", md.includes(sandbox.DISCLAIMER_DETAIL.trim()));
ok("intro rendered into the notice block", els.notice.textContent.includes("実在しない人物の顔です"));
ok("intro appears before the start button in the markup",
   htmlSrc.indexOf('id="notice"') < htmlSrc.indexOf('id="start"'));
ok("detail is inside <details> (collapsed)",
   /<details>[\s\S]*id="detail"[\s\S]*<\/details>/.test(htmlSrc));

/* ---------- inference ---------- */
console.log("\n[inference]");
API.initParticles();
ok("1200 particles", API.P.length === 1200);
ok("prior truncated to [-3,3]", API.P.every(p => p.p.every(v => v >= -3 && v <= 3)));
ok("axis weights sum to 1", API.P.every(p => Math.abs(p.w.reduce((a, b) => a + b, 0) - 1) < 1e-9));
const quad = API.pickQuad();
ok("pickQuad returns 4 distinct faces", quad.length === 4 && new Set(quad).size === 4);
const pr = API.probs(quad.map(i => POOL[i].z), API.P[0]);
ok("choice probabilities sum to 1", Math.abs(pr.reduce((a, b) => a + b, 0) - 1) < 1e-9);
ok("epsilon floor respected", pr.every(v => v >= 0.05 / 4 - 1e-12));
const w0 = API.weights();
ok("EIG is non-negative", API.eig(quad.map(i => POOL[i].z), w0, API.P.map(API.top1of)) >= -1e-6);

/* Does evidence actually move the estimate? Simulate a user whose true
 * preference IS a specific member, answering 12 questions by always
 * taking the nearest face. The recommendation should land on that member
 * far more often than chance (1/N), computed from the actual roster size. */
console.log("\n[does it learn?]");
function simulate(targetIdx, nq) {
  API.initParticles();
  const t = MEMBERS[targetIdx].z;
  for (let q = 0; q < nq; q++) {
    const idx = API.pickQuad();
    let best = 0, bv = Infinity;
    idx.forEach((j, pos) => {
      let s = 0;
      for (let a = 0; a < 5; a++) { const d = POOL[j].z[a] - t[a]; s += d * d; }
      if (s < bv) { bv = s; best = pos; }
    });
    API.update(idx.map(i => POOL[i].z), best);
  }
  return API.recommend().top3;
}
const TRIALS = 12;
let hit1 = 0, hit3 = 0;
for (let i = 0; i < TRIALS; i++) {
  const tgt = Math.floor(Math.random() * N);
  const t3 = simulate(tgt, 12);
  if (t3[0] === tgt) hit1++;
  if (t3.includes(tgt)) hit3++;
}
console.log(`  simulated ${TRIALS} ideal users (12 questions each), N=${N} members`);
console.log(`  target recovered as the first suggestion: ${hit1}/${TRIALS}` +
            `  (chance ~${(TRIALS / N).toFixed(2)})`);
console.log(`  target inside the three:                 ${hit3}/${TRIALS}` +
            `  (chance ~${(TRIALS * 3 / N).toFixed(2)})`);
ok("learns better than chance", hit3 > TRIALS * 3 / N);

/* ---------- confidence wording ---------- */
console.log("\n[confidence]");
const seen = [API.confidence()];
ok("result line does not grade confidence",
   !/はっきり|うっすら|絞りきれ/.test(seen[0].text), seen[0].text);
seen.forEach(c => {
  ok("level " + c.level + " states confidence in words, not a figure",
     typeof c.text === "string"
     && !/[%％]/.test(c.text)
     && !/\d+[.．]\d/.test(c.text)
     && !/\d+ *(点|割|段階|パーセント)/.test(c.text), c.text);
  ok("level " + c.level + " does not assert certainty",
     !/必ず|間違いなく|確実/.test(c.text));
});

/* ---------- ranking uses the hub correction ---------- */
console.log("\n[ranking]");
{ API.initParticles();
  for (let q = 0; q < 6; q++) { const idx = API.pickQuad(); API.update(idx.map(k => POOL[k].z), 0); }
  const raw = API.expectedDist();
  const want = raw.map((v, i) => [v + MEMBERS[i].adj, i]).sort((a, b) => a[0] - b[0])
                  .slice(0, 3).map(x => x[1]);
  const got = API.recommend().top3;
  ok("recommend ranks on D + adj", JSON.stringify(got) === JSON.stringify(want),
     JSON.stringify({ got, want })); }

/* ---------- payload ---------- */
console.log("\n[payload]");
API.setAnswers([{ chosen: "g001" }, { chosen: "g002" }]);
API.setOshi([0, 4]);
API.setTop3([1, 2, 3]);
const pl = API.buildPayload(true);
ok("payload has exactly the 7 agreed fields",
   JSON.stringify(Object.keys(pl).sort()) ===
   JSON.stringify(["choice", "completed", "oshi", "picks", "proposed", "shown", "ts"]));
ok("oshi sent as anonymous ids (M###)", pl.oshi.every(v => /^M\d{3}$/.test(v)), JSON.stringify(pl.oshi));
ok("proposed sent as anonymous ids (M###)", pl.proposed.every(v => /^M\d{3}$/.test(v)));
ok("no member name in payload", !JSON.stringify(pl).match(/[぀-ヿ一-鿿]/));
{ const saved = vm.runInContext("CONFIG.endpoint", sandbox);
  vm.runInContext('CONFIG.endpoint = "";', sandbox);
  fetchCalls = 0; API.send(true);
  ok("endpoint unset -> nothing is sent", fetchCalls === 0);
  vm.runInContext('CONFIG.endpoint = "https://example.invalid/exec";', sandbox);
  fetchCalls = 0; API.send(true);
  ok("endpoint set -> exactly one send", fetchCalls === 1);
  vm.runInContext("CONFIG.endpoint = " + JSON.stringify(saved) + ";", sandbox);
  ok("shipped endpoint is either empty or a deployed /exec URL (not /dev)",
     saved === "" || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(saved), saved); }

/* ---------- share text ---------- */
console.log("\n[share]");
const st = API.shareText();
const su = API.shareUrl();
ok("share text is first person", /^私の好みは/.test(st), st.replace(/\n/g, " "));
ok("share text hedges (寄りらしい), never asserts", /さん寄りらしい/.test(st));
ok("share text names exactly one member, and only that member",
   MEMBERS.filter(m => st.includes(m.name)).length === 1);
{ const m = MEMBERS.find(x => st.includes(x.name));
  if (m.group) {
    ok("group member: group label sits right before the member name",
       st.includes(GL[m.group] + "の" + m.name + "さん"), st);
  } else {
    ok("solo member: no group prefix before the member name",
       st.includes("は" + m.name + "さん") && !/の[^\n]*さん寄りらしい/.test(st.split("\n")[0].replace(m.name, "")),
       st);
  }
}
ok("agency name appears on the second line for context",
   st.split("\n")[1] === "STARTO ENTERTAINMENTのタレントから診断", st);
ok("no OTHER group's name coincidentally appears in the share text",
   new Set(MEMBERS.filter(m => m.group && st.includes(m.group)).map(m => m.group)).size <= 1);
ok("share text has no ranking vocabulary", !rankWords.some(w => st.includes(w)));
ok("share text has no ordinal phrasing", !/(1位|一位|トップ|最も|No\.?1|ベスト)/.test(st));
ok("hashtag comes from CONFIG.brand", st.includes("#" + sandbox.CONFIG.brand));
ok("intent points at x.com/intent/post", su.startsWith("https://x.com/intent/post?"));
ok("URL is a separate url= parameter", /[?&]url=/.test(su));
ok("URL is not duplicated inside the text", !/https?%3A/.test(su.split("&url=")[0]));
ok("configured siteUrl is used, normalised with a trailing slash",
   decodeURIComponent(su.split("&url=")[1]) ===
     "https://hollowmark-dev.github.io/starto-yosoku/",
   decodeURIComponent(su.split("&url=")[1]));
vm.runInContext('CONFIG.siteUrl = "";', sandbox);
ok("falls back to the current page when siteUrl is unset",
   decodeURIComponent(API.shareUrl().split("&url=")[1]) === "https://example.invalid/oshi/",
   decodeURIComponent(API.shareUrl().split("&url=")[1]));
vm.runInContext('CONFIG.siteUrl = "https://hollowmark-dev.github.io/starto-yosoku/";', sandbox);
vm.runInContext('CONFIG.brand = "テスト名";', sandbox);
ok("brand swap flows through to the hashtag", API.shareText().includes("#テスト名"));
vm.runInContext('CONFIG.brand = "STARTO推し予測";', sandbox);
ok("hashtag matches the agreed tag",
   API.shareText().includes("#STARTO推し予測"));
ok("app.js has no hardcoded brand outside the fallback",
   (appSrc.match(/STARTO推し予測/g) || []).length === 0,
   "brand literal must live only in config.js");

/* ---------- flow order ---------- */
console.log("\n[flow]");
ok("oshi section precedes result section in the markup",
   htmlSrc.indexOf('id="oshi"') < htmlSrc.indexOf('id="result"'));
ok("oshi step is skippable (button works with nothing selected)",
   /\$\("odone"\)\.onclick = finish/.test(appSrc));
ok("button label announces the skip at zero selections",
   /スキップして結果を見る/.test(appSrc) && /スキップして結果を見る/.test(htmlSrc));
ok("only one button on the oshi step", (htmlSrc.match(/id="o(done|skip)"/g) || []).length === 1);
ok("oshi grid shows names, never <img>",
   !/ogrid[\s\S]{0,400}<img/.test(appSrc) && /className = "name"/.test(appSrc));
ok("oshi picker allows at most 3 selections",
   /oshi\.length < 3/.test(appSrc));

/* shown/choice: one entry per question, skips included, aligned */
{ let body = null;
  const savedEp = vm.runInContext("CONFIG.endpoint", sandbox);
  vm.runInContext('CONFIG.endpoint = "https://example.invalid/exec";', sandbox);
  const realFetch = sandbox.fetch;
  sandbox.fetch = (u, o) => { body = JSON.parse(o.body); return { catch: () => {} }; };
  els.again.onclick();
  const quads = [];
  for (let q = 0; q < API.NQ; q++) {
    quads.push(Array.from(els.quad.children).map(b => b.firstChild.src.match(/(g\d{3})\.jpg/)[1]));
    if (q % 3 === 1) els.skipq.onclick(); else els.quad.children[q % 4].onclick();
  }
  els.odone.onclick();
  sandbox.fetch = realFetch;
  vm.runInContext("CONFIG.endpoint = " + JSON.stringify(savedEp) + ";", sandbox);
  ok("a finished run sends once with shown/choice", !!body, "");
  ok("shown has one quad of 4 per question, skips included",
     body && body.shown.length === API.NQ && body.shown.every(q => q.length === 4 && q.every(g => /^g\d{3}$/.test(g))));
  ok("shown is exactly what was on screen", body && JSON.stringify(body.shown) === JSON.stringify(quads),
     body && JSON.stringify([body.shown[0], quads[0]]));
  ok("choice is the clicked position, -1 for a skip",
     body && body.choice.every((c, q) => c === (q % 3 === 1 ? -1 : q % 4)), body && JSON.stringify(body.choice));
  ok("picks is the chosen face of each question ('' for a skip)",
     body && body.picks.every((g, q) => g === (body.choice[q] < 0 ? "" : body.shown[q][body.choice[q]])));
  ok("payload stays well under the GAS 4000-char limit", body && JSON.stringify(body).length < 1500,
     body && JSON.stringify(body).length); }

/* every question skipped -> no result, nothing logged */
{ fetchCalls = 0;
  els.again.onclick();                       // restart() resets answers
  for (let q = 0; q < API.NQ; q++) els.skipq.onclick();
  ok("all skipped: the 'none' screen is shown", !els.none.classList.contains("hide"));
  ok("all skipped: no oshi step, no result", els.oshi.classList.contains("hide") && els.result.classList.contains("hide"));
  ok("all skipped: nothing is sent", fetchCalls === 0, "fetchCalls=" + fetchCalls);
  ok("'none' screen has its own restart button", /id="again2"/.test(htmlSrc)); }
/* share image: names only, never a photo */
ok("share image never draws an image (no member photo possible)", !/drawImage/.test(appSrc));
ok("share falls back to the X intent where files cannot be shared",
   /canShareImage\(\)/.test(appSrc) && /window\.open\(shareUrl\(\)/.test(appSrc));

/* ---------- oshi grid: every group section renders, no <img> anywhere ---------- */
console.log("\n[oshi grid]");
{ els.again.onclick();
  for (let q = 0; q < API.NQ; q++) els.quad.children[q % 4].onclick();  // never skip -> reach oshi
  const heads = els.ogrid.children.filter(c => c.className === "ghead").map(c => c.textContent);
  const expectedHeads = GO.filter(key => MEMBERS.some(m => m.group === key)).map(key => GL[key]);
  ok("oshi grid has one heading per non-empty group, in GROUP_ORDER order",
     JSON.stringify(heads) === JSON.stringify(expectedHeads),
     JSON.stringify({ heads, expectedHeads }));
  ok("oshi grid renders a button per member",
     els.ogrid.children.filter(c => c.className === "name").length === N);
  ok("oshi grid never contains an <img> tag anywhere in app.js's grid code",
     !/ogrid[\s\S]{0,600}createElement\("img"/.test(appSrc));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
