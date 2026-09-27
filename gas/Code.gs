/**
 * 推し予測 -- response log.
 *
 * One row per session. Appends only; never reads back to the page.
 *
 * WHAT IS DELIBERATELY NOT STORED
 *   No IP address, no User-Agent, no cookie, no Google account, no
 *   referrer, no e.parameter dump. Apps Script does not hand doPost the
 *   requester's IP or UA, and nothing here asks for them -- the payload
 *   is parsed field by field (see readBody) precisely so that a field
 *   added to the client later cannot silently start being logged.
 *
 *   Deploy as "Execute as: Me" + "Who has access: Anyone". Do NOT use
 *   "Execute as: User accessing", which would attach their identity.
 */

var SHEET_NAME = 'responses';
var HEADERS = ['timestamp', 'picks', 'oshi', 'proposed', 'completed',
               'shown', 'choice'];
var MAX_PICKS = 12;
var MAX_OSHI = 3;
var MAX_PROPOSED = 3;

/** Allowed id shapes. Anything else is dropped, not stored. */
var RE_FACE = /^g\d{3}$/;
var RE_MEMBER = /^M\d{3}$/;

function doPost(e) {
  try {
    var body = readBody(e);
    if (body) {
      var sh = getSheet();
      sh.appendRow([
        new Date(),                       // server time, not client-claimed
        body.picks.join(' '),
        body.oshi.join(' '),
        body.proposed.join(' '),
        body.completed ? 1 : 0,
        // one entry per question, skips included, in the same order:
        // shown = 4 face ids joined by ',', choice = position 0-3 or '-'
        body.shown.map(function (q) { return q.join(','); }).join(' '),
        body.choice.map(function (c) { return c < 0 ? '-' : String(c); }).join(' ')
      ]);
    }
  } catch (err) {
    // Swallow: the page is fired with mode:'no-cors' and never reads the
    // reply, so a failure here must not become a visible error there.
  }
  return ok();
}

/**
 * Browsers may send a CORS preflight or a plain GET probe. Answer both
 * harmlessly. There is no endpoint that returns stored data.
 */
function doGet(e) {
  return ok();
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Parse ONLY the known fields, with length and shape limits. */
function readBody(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var raw = e.postData.contents;
  if (raw.length > 4000) return null;            // nothing legitimate is big
  var o;
  try {
    o = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  var sc = cleanShown(o.shown, o.choice);
  return {
    picks: clean(o.picks, RE_FACE, MAX_PICKS),
    shown: sc.shown,
    choice: sc.choice,
    oshi: clean(o.oshi, RE_MEMBER, MAX_OSHI),
    proposed: clean(o.proposed, RE_MEMBER, MAX_PROPOSED),
    completed: o.completed === true
  };
}

function clean(arr, re, max) {
  if (!Array.isArray(arr)) return [];
  var out = [];
  for (var i = 0; i < arr.length && out.length < max; i++) {
    var v = arr[i];
    if (typeof v === 'string' && re.test(v)) out.push(v);
  }
  return out;
}

/**
 * shown/choice only mean something together and in order, so they are
 * kept whole or dropped whole: one malformed question empties both.
 * Old clients send neither and get two empty cells.
 */
function cleanShown(shown, choice) {
  var none = { shown: [], choice: [] };
  if (!Array.isArray(shown) || !Array.isArray(choice)) return none;
  if (shown.length !== choice.length || shown.length > MAX_PICKS) return none;
  for (var i = 0; i < shown.length; i++) {
    var q = shown[i], c = choice[i];
    if (!Array.isArray(q) || q.length !== 4) return none;
    for (var k = 0; k < 4; k++) {
      if (typeof q[k] !== 'string' || !RE_FACE.test(q[k])) return none;
    }
    if (typeof c !== 'number' || [-1, 0, 1, 2, 3].indexOf(c) < 0) return none;
  }
  return { shown: shown, choice: choice };
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else if (sh.getRange(1, HEADERS.length).getValue() === '') {
    // sheet made before shown/choice existed: label the new columns once
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

/**
 * Run this once from the editor (Run > testAppend) to confirm the sheet
 * is created and a row lands, before you wire up the site.
 */
function testAppend() {
  doPost({ postData: { contents: JSON.stringify({
    picks: ['g001', 'g002', 'bad!', 'g003'],
    shown: [['g001', 'g010', 'g020', 'g030'], ['g002', 'g011', 'g021', 'g031'],
            ['g003', 'g012', 'g022', 'g032'], ['g004', 'g013', 'g023', 'g033']],
    choice: [0, 0, -1, 0],
    oshi: ['M001', 'M002'],
    proposed: ['M003', 'M004', 'M005'],
    completed: true,
    sneakyExtraField: 'this must not appear in the sheet'
  }) } });
  Logger.log('testAppend done -- check the "responses" sheet. ' +
             'The row should show 3 picks (bad! dropped), 4 quads in shown, ' +
             '"0 0 - 0" in choice, and no other extra column.');
}
