/* CORS НА ФУНКЦИИТЕ, КОИТО ПОРТАЛЪТ ВИКА ОТ БРАУЗЪРА (otcheti-tablica, 12.11.2026).

   Повод: на живо (Pages 848a7f9) „📋 Кой какво получава" показа „Не се зареди:
   send-scheduled-report, send-oborot-report, send-routed-report (Failed to
   fetch)" — preflight-ът (OPTIONS) нямаше Access-Control-Allow-Origin. Същото
   чупеше „📤 Изпрати сега" (report.js reportEdgeCall / sendMinusMultiReportNow
   → send-scheduled-report). bulletin-notify ги имаше и работеше.

   Какво заковава, за send-scheduled-report, send-oborot-report,
   send-routed-report и bulletin-notify:
     1. изходникът: константа CORS (Allow-Origin *, POST/OPTIONS, заглавките);
        в Deno.serve клон OPTIONS ПРЕДИ първия await / req.json(); ВСЯКО
        `new Response(` (и `Response.json(`) носи CORS в заглавките;
     2. на изпълнение (index.ts във vm): OPTIONS → 200 + Access-Control-Allow-Origin
        и нито една заявка навън; отговор за грешка (4xx / 5xx) също носи ACAO.

   Мутационна проверка (12.11.2026) — всяка СЪБАРЯ теста (exit 1):
     М1 махнат клонът OPTIONS в send-oborot-report;
     М2 махнати CORS заглавките от отговора за грешка (500) в send-oborot-report.

   Пускане:  node tests/edge-cors.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const FNS = ['send-scheduled-report', 'send-oborot-report', 'send-routed-report', 'bulletin-notify'];
const src = fn => fs.readFileSync(path.join(ROOT, 'supabase/functions', fn, 'index.ts'), 'utf8');

/* Всяко извикване `marker(` до затварящата скоба. */
function calls(s, marker) {
  const out = []; let i = -1;
  while ((i = s.indexOf(marker, i + 1)) >= 0) {
    let d = 0, j = i + marker.length - 1;
    for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { d--; if (!d) break; } }
    out.push({ line: s.slice(0, i).split('\n').length, text: s.slice(i, j + 1) });
  }
  return out;
}

function loadVm(fn, extra) {
  const _w = process.emitWarning; process.emitWarning = function () {};
  const js = nodeModule.stripTypeScriptTypes(src(fn).replace(/^import\s.*$/mg, ''));
  process.emitWarning = _w;
  const outbound = [];
  let handler = null;
  const ctx = Object.assign({
    Response, console: { log() {}, warn() {}, error() {} }, Intl, JSON, Math, Object, Array, String, Number, Promise, Date,
    encodeURIComponent, setTimeout, RegExp, Set, Map, Error,
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: f => { handler = f; } },
    fetch: (url) => { outbound.push(url); return Promise.reject(new Error('мрежата е спряна в теста')); },
    createClient: () => { outbound.push('createClient'); throw new Error('базата е спряна в теста'); }
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { filename: fn + '.js' });
  return { handler, outbound };
}
const req = (method, body) => ({ method, headers: new Map(), json: () => Promise.resolve(body) });

(async function () {
  section('1. Изходникът — CORS, OPTIONS преди всичко, заглавки на всеки отговор');
  for (const fn of FNS) {
    const s = src(fn);
    const cors = /const CORS\s*=\s*\{([\s\S]*?)\};/.exec(s);
    ok(fn + ': константа CORS с Allow-Origin *, POST/OPTIONS и заглавките', !!cors &&
      /'Access-Control-Allow-Origin':\s*'\*'/.test(cors[1]) && /'Access-Control-Allow-Methods':\s*'POST, OPTIONS'/.test(cors[1]) &&
      /'Access-Control-Allow-Headers':\s*'content-type, authorization, x-client-info, apikey'/.test(cors[1]));
    const at = s.indexOf('Deno.serve(');
    const serve = at >= 0 ? s.slice(at) : '';
    const iOpt = serve.search(/req\.method === 'OPTIONS'\)\s*return new Response\([^;]*CORS/);
    const iAwait = serve.indexOf('await ');
    const iJson = serve.indexOf('req.json(');
    ok(fn + ': клонът OPTIONS е преди първия await и преди req.json()', iOpt > 0 && iOpt < iAwait && iOpt < iJson,
      'OPTIONS ' + iOpt + ', await ' + iAwait + ', req.json ' + iJson);
    const bad = calls(s, 'new Response(').concat(calls(s, 'Response.json('))
      .filter(c => !/headers\s*:\s*(CORS\b|\{\s*\.\.\.CORS\b)/.test(c.text));
    ok(fn + ': всяко new Response( / Response.json( носи CORS (' + (calls(s, 'new Response(').length + calls(s, 'Response.json(').length) + ')',
      bad.length === 0, bad.map(b => 'ред ' + b.line + ': ' + b.text.replace(/\s+/g, ' ').slice(0, 110)).join('\n      '));
  }

  section('2. На изпълнение — OPTIONS → 200 + ACAO, без заявки навън; грешка → пак ACAO');
  for (const fn of FNS) {
    const L = loadVm(fn);
    if (!ok(fn + ': handler-ът се регистрира', typeof L.handler === 'function')) continue;
    const r = await L.handler(req('OPTIONS'));
    ok(fn + ': OPTIONS → 200, Access-Control-Allow-Origin *', r.status === 200 && r.headers.get('access-control-allow-origin') === '*' &&
      /authorization/.test(r.headers.get('access-control-allow-headers') || '') && /apikey/.test(r.headers.get('access-control-allow-headers') || ''),
      r.status + ' ' + JSON.stringify([...r.headers]));
    ok(fn + ': OPTIONS не вика нищо навън', L.outbound.length === 0, JSON.stringify(L.outbound));
    /* Грешка: базата / мрежата е спряна → обработчикът връща грешка — с ACAO. */
    const L2 = loadVm(fn);
    let e = null;
    try { e = await L2.handler(req('POST', fn === 'send-scheduled-report' ? { recipients_only: true, type: 'няма' } : {})); } catch (x) { e = null; }
    ok(fn + ': отговор за грешка (' + (e ? e.status : '—') + ') носи ACAO', !!e && e.status >= 400 && e.headers.get('access-control-allow-origin') === '*',
      e ? e.status + ' ' + JSON.stringify([...e.headers]) : 'хвърли');
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
