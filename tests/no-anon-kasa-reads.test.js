/* Каса: нито едно четене на седемте касови таблици и на файловете в kasa-docs
   с публичния ключ ИЗВЪН гейта на kasa-api (claude/kasa-api-dizajn.md, т.5.4;
   влиза с етап 2 — 26.11.2026, сесия kasa-etap2).

   ГЕЙТЪТ. От етап 1б всяко касово четене в браузъра минава през kasa-api,
   когато kasaApiOn() каже „да“ (ключът kasa_api_stores = „all“ от 24.11).
   Старата заявка (sbGet / sbGetAll / sbGetOk / reportGetAll, подписване на
   файл с anon ключа) остава САМО като резервен път зад гейта — oldFn на
   kasaDayGet / kasaRangeGet / oborotRangeGet, kq(…) в report.js, или клон
   „if(!kasaApiOn(…)) return …“ / тернарен оператор по kasaApiOn. След
   миграцията kasa-etap2-schema.sql този резервен път може само да върне
   грешка; махането му е в етап 3 (claude/open/26-11-kasa-etap3-zapisi.md).

   Тестът сканира всеки .js в корена (браузърния код; supabase/, tests/,
   tools/ са извън него) и пада, ако:
     1. четене на касова таблица НЕ е зад гейт;
     2. броят на гейтнатите места се промени (нов резервен път → първо тук,
        с причина; махнат → смали числото);
     3. суров fetch към /rest/v1/<касова таблица> не е PATCH (единственият е
        confirmZoborot — запис, етап 3);
     4. подписване на файл от kasa-docs (/object/sign/) не е в някое от
        четирите познати места или извикващият не е зад kasaApiOn.
   ГРАНИЦА: проверява КОДА, не базата — правата са в kasa-etap2-schema.test.js.
   Отклонение от т.5.4 („→ 0“): резервните пътища зад гейта остават до етап 3,
   затова тестът ги брои и пинва, вместо да иска нула.

   Мутационна проверка (26.11.2026) — виж claude/log/2026-11-26-kasa-etap2.md.

   Пускане:  node tests/no-anon-kasa-reads.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = path.resolve(process.argv[2] || '.');
const TABLES = ['kasa_reports', 'kasa_glavna', 'kasa_zoborot', 'kasa_documents', 'kasa_storno', 'kasa_storno_items', 'daily_turnover'];
const TRE = TABLES.join('|');
/* Гейтнатите резервни пътища към 26.11.2026 (sbGet* + kq). Промяна → тук. */
const EXPECTED_GATED = 46;

const files = fs.readdirSync(ROOT).filter(f => /\.js$/.test(f)).sort();
const lineAt = (src, i) => src.slice(0, i).split('\n').length;
function fnStart(src, idx) {
  const re = /\nfunction\s+[A-Za-z0-9_$]+\s*\(/g; let m, s = 0;
  while ((m = re.exec(src)) && m.index < idx) s = m.index;
  return s;
}
function fnName(src, idx) {
  const m = /\nfunction\s+([A-Za-z0-9_$]+)/.exec(src.slice(fnStart(src, idx), idx + 1));
  return m ? m[1] : '(горно ниво)';
}

const gated = [], ungated = [], rawBad = [], signSites = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');

  /* 1–2: sbGet / sbGetAll / sbGetOk / reportGetAll('<касова таблица>' */
  const re = new RegExp("\\b(sbGet|sbGetAll|sbGetOk|reportGetAll)\\(\\s*'(" + TRE + ")'", 'g');
  let m;
  while ((m = re.exec(src))) {
    const where = f + ':' + lineAt(src, m.index) + ' ' + fnName(src, m.index) + ' ' + m[1] + "('" + m[2] + "')";
    const pre = src.slice(Math.max(fnStart(src, m.index), m.index - 700), m.index);
    const viaWrapper = /\b(kasaDayGet|kasaRangeGet|oborotRangeGet)\([^;]*$/.test(pre) && /function\s*\(\)\s*\{\s*(return\s*)?$/.test(pre.slice(-60));
    const viaIf = /if\s*\(\s*!?[^;{}]*kasaApiOn\([^;{}]*\)\)\s*return\b[^]*$/.test(pre) && /kasaApiOn\(/.test(pre);
    (viaWrapper || viaIf ? gated : ungated).push(where);
  }
  /* kq(sbGet|reportGetAll, '<таблица>' — report.js: самото kq е гейтът (reportKasaReader). */
  const reK = new RegExp("\\bkq\\(\\s*(sbGet|reportGetAll)\\s*,\\s*'(" + TRE + ")'", 'g');
  while ((m = reK.exec(src))) gated.push(f + ':' + lineAt(src, m.index) + ' kq(' + m[1] + ", '" + m[2] + "')");

  /* 3: суров fetch към /rest/v1/<касова таблица> или API+'/<таблица>' */
  const reRaw = new RegExp("fetch\\([^)]*?(\\/rest\\/v1\\/|API\\s*\\+\\s*'\\/)(" + TRE + ")\\b", 'g');
  while ((m = reRaw.exec(src))) {
    const near = src.slice(m.index, m.index + 300);
    if (!/method\s*:\s*'PATCH'/.test(near)) rawBad.push(f + ':' + lineAt(src, m.index) + ' ' + m[2]);
  }

  /* 4: подписване на файл от kasa-docs (място = файл + функция; коментар в същата функция не добавя ново) */
  const reSign = /object\/sign\//g;
  while ((m = reSign.exec(src))) signSites.push(f + ' ' + fnName(src, m.index));
}

section('1. Всяко касово четене е зад гейта на kasa-api');
ok('нула негейтнати места', ungated.length === 0, '\n      ' + ungated.join('\n      '));
ok('гейтнатите резервни пътища = ' + EXPECTED_GATED, gated.length === EXPECTED_GATED,
  'реално ' + gated.length + ' — нов/махнат резервен път: обнови EXPECTED_GATED с причина\n      ' + gated.join('\n      '));

section('2. Суров fetch към касова таблица — само PATCH (confirmZoborot)');
ok('нула сурови четения / POST / DELETE', rawBad.length === 0, rawBad.join(' ; '));

section('3. Подписване на файл от kasa-docs — само четирите резервни места, зад kasaApiOn');
const SIGN_OK = ['history.js previewKasaDoc', 'kasa-docs.js getSignedUrl', 'kasa-docs.js openKasaDetail', 'kasa.js _doPrintKasaReport'];
const signSorted = Array.from(new Set(signSites)).sort();
ok('местата = ' + SIGN_OK.join(', '), JSON.stringify(signSorted) === JSON.stringify(SIGN_OK), signSorted.join(', '));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const kd = read('kasa-docs.js'), hi = read('history.js'), ka = read('kasa.js');
/* openKasaDoc (→ getSignedUrl) и previewKasaDoc — само в else-клона на тернарен по kasaApiOn. */
const callers = (src, fn) => (src.match(new RegExp('[^\\n]*\\b' + fn + '\\(', 'g')) || []).filter(l => !new RegExp('function\\s+' + fn + '\\(').test(l));
const kdCallers = callers(kd, 'openKasaDoc').concat(callers(hi, 'openKasaDoc'), callers(ka, 'openKasaDoc'));
ok('openKasaDoc(…) се вика само в else на kasaApiOn(…) ? … : …', kdCallers.length >= 1 && kdCallers.every(l => /kasaApiOn\([^)]*\)\s*\?[^:]*:\s*'openKasaDoc\(/.test(l)), kdCallers.join(' || '));
const hiLines = hi.split('\n');
const pvIdx = hiLines.findIndex(l => /onclick="previewKasaDoc\(/.test(l));
ok('previewKasaDoc(…) — само в else на (d.id&&kasaApiOn(…)) ? … : …', pvIdx > 0 && /kasaApiOn\(/.test(hiLines.slice(Math.max(0, pvIdx - 3), pvIdx).join('\n')) && callers(hi, 'previewKasaDoc').length === 1);
ok('печатът (kasa.js): viaApi = kasaApiOn(…) и скриптът с ключа е в else на viaApi?', /var viaApi=kasaApiOn\(/.test(ka) && /\(viaApi\?KASA_PRINT_DOC_SCRIPT:'<script>function openDocFromPrint/.test(ka));
ok('детайлът (kasa-docs.js): viaApi = kasaApiOn(…) и скриптът с ключа е в else на viaApi ?', /var viaApi = kasaApiOn\(/.test(kd) && /\(viaApi \? kasaDocOpenerFn\('openKasaDocFromDetail'\) : \(/.test(kd));

report();
