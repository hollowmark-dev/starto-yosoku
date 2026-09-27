/**
 * 集計シート（非公開）。回答ログ responses から「集計」シートを作り直す。
 *
 * - シートを開くたびに自動で更新する。メニュー「推し予測 → 集計を更新」でも更新できる。
 * - responses には書き込まない（読むだけ）。doPost（Code.gs）とは独立している。
 * - メンバー別の表は人気ランキングに見えるため、外部に公開しない。
 *
 * eqnojo-yosoku 版と違い、区分（旧セット/新セット等）は無い。STARTOの
 * ロースターはここでは1本の履歴として集計する。過去のセット入れ替えが
 * 起きた場合は、このファイルに区分を追加するより先に、そもそも区分が
 * 本当に必要か（単に MEMBERS を更新するだけで済まないか）を確認すること。
 */
var SHUFFLES = 300;                           // シャッフル基準の繰り返し回数
var MEMBERS = [
  ["M001", "坂本昌行", "20th Century"],
  ["M002", "長野博", "20th Century"],
  ["M003", "井ノ原快彦", "20th Century"],
  ["M004", "小山慶一郎", "NEWS"],
  ["M005", "加藤シゲアキ", "NEWS"],
  ["M006", "増田貴久", "NEWS"],
  ["M007", "横山裕", "SUPER EIGHT"],
  ["M008", "村上信五", "SUPER EIGHT"],
  ["M009", "丸山隆平", "SUPER EIGHT"],
  ["M010", "安田章大", "SUPER EIGHT"],
  ["M011", "大倉忠義", "SUPER EIGHT"],
  ["M012", "山田涼介", "Hey! Say! JUMP"],
  ["M013", "知念侑李", "Hey! Say! JUMP"],
  ["M014", "有岡大貴", "Hey! Say! JUMP"],
  ["M015", "髙木雄也", "Hey! Say! JUMP"],
  ["M016", "伊野尾慧", "Hey! Say! JUMP"],
  ["M017", "八乙女光", "Hey! Say! JUMP"],
  ["M018", "薮宏太", "Hey! Say! JUMP"],
  ["M019", "千賀健永", "Kis-My-Ft2"],
  ["M020", "宮田俊哉", "Kis-My-Ft2"],
  ["M021", "横尾渉", "Kis-My-Ft2"],
  ["M022", "藤ヶ谷太輔", "Kis-My-Ft2"],
  ["M023", "玉森裕太", "Kis-My-Ft2"],
  ["M024", "二階堂高嗣", "Kis-My-Ft2"],
  ["M025", "佐藤勝利", "timelesz"],
  ["M026", "菊池風磨", "timelesz"],
  ["M027", "松島聡", "timelesz"],
  ["M028", "橋本将生", "timelesz"],
  ["M029", "猪俣周杜", "timelesz"],
  ["M030", "篠塚大輝", "timelesz"],
  ["M031", "寺西拓人", "timelesz"],
  ["M032", "原嘉孝", "timelesz"],
  ["M033", "橋本良亮", "A.B.C-Z"],
  ["M034", "戸塚祥太", "A.B.C-Z"],
  ["M035", "五関晃一", "A.B.C-Z"],
  ["M036", "塚田僚一", "A.B.C-Z"],
  ["M044", "ジェシー", "SixTONES"],
  ["M045", "京本大我", "SixTONES"],
  ["M046", "松村北斗", "SixTONES"],
  ["M047", "髙地優吾", "SixTONES"],
  ["M048", "森本慎太郎", "SixTONES"],
  ["M049", "田中樹", "SixTONES"],
  ["M050", "岩本照", "Snow Man"],
  ["M051", "深澤辰哉", "Snow Man"],
  ["M052", "ラウール", "Snow Man"],
  ["M053", "渡辺翔太", "Snow Man"],
  ["M054", "向井康二", "Snow Man"],
  ["M055", "阿部亮平", "Snow Man"],
  ["M056", "目黒蓮", "Snow Man"],
  ["M057", "宮舘涼太", "Snow Man"],
  ["M058", "佐久間大介", "Snow Man"],
  ["M059", "西畑大吾", "なにわ男子"],
  ["M060", "大西流星", "なにわ男子"],
  ["M061", "道枝駿佑", "なにわ男子"],
  ["M062", "高橋恭平", "なにわ男子"],
  ["M063", "長尾謙杜", "なにわ男子"],
  ["M064", "藤原丈一郎", "なにわ男子"],
  ["M065", "大橋和也", "なにわ男子"],
  ["M066", "宮近海斗", "Travis Japan"],
  ["M067", "中村海人", "Travis Japan"],
  ["M068", "七五三掛龍也", "Travis Japan"],
  ["M069", "川島如恵留", "Travis Japan"],
  ["M070", "吉澤閑也", "Travis Japan"],
  ["M071", "松田元太", "Travis Japan"],
  ["M072", "松倉海斗", "Travis Japan"],
  ["M073", "正門良規", "Aぇ! group"],
  ["M074", "末澤誠也", "Aぇ! group"],
  ["M075", "小島健", "Aぇ! group"],
  ["M076", "佐野晶哉", "Aぇ! group"],
  ["M077", "永瀬廉", "King ＆ Prince"],
  ["M078", "髙橋海人", "King ＆ Prince"],
  ["M079", "福田悠太", "ふぉ～ゆ～"],
  ["M080", "辰巳雄大", "ふぉ～ゆ～"],
  ["M081", "越岡裕貴", "ふぉ～ゆ～"],
  ["M082", "松崎祐介", "ふぉ～ゆ～"],
  ["M083", "木村拓哉", ""],
  ["M084", "堂本光一", ""],
  ["M085", "相葉雅紀", ""],
  ["M086", "櫻井翔", ""],
  ["M087", "上田竜也", ""],
  ["M088", "中丸雄一", ""],
  ["M089", "中島裕翔", ""],
  ["M090", "内博貴", ""],
  ["M091", "長谷川純", ""],
  ["M092", "岡本圭人", ""],
  ["M093", "中島健人", ""],
  ["M094", "河合郁人", ""],
  ["M095", "草間リチャード敬太", ""],
  ["M096", "林翔太", ""],
  ["M097", "室龍太", ""],
  ["M098", "高田翔", ""],
  ["M099", "今江大地", ""],
  ["M100", "松本幸大", ""],
  ["M101", "冨岡健翔", ""],
  ["M102", "野澤祐樹", ""],
  ["M103", "藤井直樹", ""],
  ["M104", "内海光司", ""],
  ["M105", "佐藤アツヒロ", ""],
  ["M037", "重岡大毅", ""],
  ["M038", "桐山照史", ""],
  ["M039", "中間淳太", ""],
  ["M040", "神山智洋", ""],
  ["M041", "藤井流星", ""],
  ["M042", "濵田崇裕", ""],
  ["M043", "小瀧望", ""]
];
var N_MEMBERS = MEMBERS.length;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('推し予測')
    .addItem('集計を更新', 'updateDashboard').addToUi();
  try { updateDashboard(); } catch (e) {}
}

function comb(n, k) { var r = 1; for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
function toks(s) { return String(s || '').split(' ').filter(function (x) { return x; }); }
function fmtTs(v) {
  return v instanceof Date
    ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') : String(v);
}
function hit(P, O) { return P.some(function (m) { return O.indexOf(m) >= 0; }) ? 1 : 0; }
function groupLabel(g) { return g || 'ソロ'; }

// 推しを入力した回答だけで: 実際の的中率・偶然の的中率・シャッフル基準
function hitStats(rs) {
  var n = rs.length;
  if (!n) return { n: 0, hit: '', chance: '', shuffled: '' };
  var h = 0, e = 0;
  rs.forEach(function (r) { h += hit(r.P, r.O); e += 1 - comb(N_MEMBERS - r.O.length, 3) / comb(N_MEMBERS, 3); });
  var props = rs.map(function (r) { return r.P; }), sum = 0;
  for (var s = 0; s < SHUFFLES; s++) {
    var p = props.slice();
    for (var i = p.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
    rs.forEach(function (r, i) { sum += hit(p[i], r.O); });
  }
  return { n: n, hit: h / n, chance: e / n, shuffled: sum / SHUFFLES / n };
}

function updateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName('responses');
  var rows = src ? src.getDataRange().getValues().slice(1) : [];
  var sh = ss.getSheetByName('集計') || ss.insertSheet('集計');
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();

  var day = {}, oshiAll = {}, prop = {}, withO = [], skipped = 0;
  rows.forEach(function (r) {
    var ts = fmtTs(r[0]); if (!ts) return;
    var picks = toks(r[1]).filter(function (g) { return g; }), O = toks(r[2]), P = toks(r[3]);
    var d = ts.slice(0, 10); day[d] = (day[d] || 0) + 1;
    if (!picks.length) { skipped++; return; }
    P.forEach(function (m) { prop[m] = (prop[m] || 0) + 1; });
    O.forEach(function (m) { oshiAll[m] = (oshiAll[m] || 0) + 1; });
    if (O.length) withO.push({ P: P, O: O });
  });
  var st = hitStats(withO);
  var nAnswered = rows.length - skipped;

  sh.getRange('A1').setValue('STARTO推し予測 集計（非公開・外に出さない）').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('更新: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
    + '   タレント数: ' + N_MEMBERS);

  // 概要
  var sum = [
    ['回答数（1問以上回答）', nAnswered],
    ['推しの入力あり', st.n],
    ['的中率（推しが提案3人に入った割合）', st.hit],
    ['シャッフル基準（他人の提案と組み替えた場合）', st.shuffled],
    ['偶然の的中率（でたらめに3人選んだ場合）', st.chance]
  ];
  sh.getRange(4, 1, sum.length, 2).setValues(sum);
  sh.getRange(4, 1, 1, 2).setFontWeight('bold');
  sh.getRange(6, 2, 3, 1).setNumberFormat('0%');
  sh.getRange('A10').setValue('全問スキップ: ' + skipped + ' 件');
  sh.getRange('A11').setValue('的中率が「シャッフル基準」を上回っていれば、人気や偏りでは説明できない分だけ好みを読めている。100件以上を目安に判断する。');

  // 的中率の比較（グラフ用）
  var hv = [['', '的中率', 'シャッフル基準', '偶然'],
            ['全体（n=' + st.n + '）', st.hit || 0, st.shuffled || 0, st.chance || 0]];
  sh.getRange(13, 1, hv.length, 4).setValues(hv);
  sh.getRange(14, 2, 1, 3).setNumberFormat('0%');

  // 日別
  var days = Object.keys(day).sort();
  var dv = [['日付', '回答数']].concat(days.map(function (d) { return [d, day[d]]; }));
  sh.getRange(17, 1, dv.length, 2).setValues(dv);

  // メンバー別：提案3人に入った割合（回答数に対する%）と、推しに選ばれた回数
  var mv = [['タレント', '提案に入った割合', '推しに選ばれた回数']]
    .concat(MEMBERS.map(function (m) {
      return [m[1] + '（' + groupLabel(m[2]) + '）',
              nAnswered ? (prop[m[0]] || 0) / nAnswered : 0,
              oshiAll[m[0]] || 0];
    }));
  var mr = 17 + dv.length + 2;
  sh.getRange(mr, 1, mv.length, 3).setValues(mv);
  sh.getRange(mr + 1, 2, mv.length - 1, 1).setNumberFormat('0%');
  [4, 13, 17, mr].forEach(function (r) { sh.getRange(r, 1, 1, 4).setFontWeight('bold'); });
  sh.setColumnWidth(1, 300);

  // グラフ
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(13, 1, hv.length, 4)).setPosition(4, 5, 0, 0)
    .setOption('title', '的中率：実際 vs シャッフル基準 vs 偶然')
    .setOption('vAxis', { format: 'percent', minValue: 0 }).setOption('width', 500).setOption('height', 260).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(17, 1, dv.length, 2)).setPosition(20, 5, 0, 0)
    .setOption('title', '日別の回答数').setOption('legend', { position: 'none' })
    .setOption('width', 500).setOption('height', 240).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR)
    .addRange(sh.getRange(mr, 1, mv.length, 2)).setPosition(34, 5, 0, 0)
    .setOption('title', 'タレント別：提案3人に入った割合')
    .setOption('hAxis', { format: 'percent', minValue: 0 })
    .setOption('width', 660).setOption('height', N_MEMBERS * 9).build());
}
