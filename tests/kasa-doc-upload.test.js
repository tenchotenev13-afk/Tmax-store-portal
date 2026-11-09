/* Каса → „📎 Прикачени документи" → „+ Прикачи" (kasa-docs.js
   handleDocUpload / uploadKasaDoc).

   До 09.11.2026:
   - записът в kasa_documents не се проверяваше — паднал POST пак даваше
     зелено „✅ Документът е качен!", а файлът не се появяваше в списъка;
   - „Отказ" на въпроса за вида (prompt → null) записваше тихо „Друго".
   Сега: паднал запис → червено с името на файла, без зелено; „Отказ" спира,
   нищо не се качва; непознат тип (напр. „7") → червено, нищо не се качва.

   Мутанти (09.11.2026, всеки събаря теста):
   М1. проверката `if (!res || !res.ok)` след sbPost махната → секция 3 пада.
   М2. „Отказ" пак дава 'other' (без `t === null`)           → секция 4 пада.
   М3. непознат тип пак дава 'other' (без `if (!docType)`)    → секция 5 пада.

   Пускане:  node tests/kasa-doc-upload.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, dayOffset, ticks } = H;

const STORE = 'Троян';
const USER = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: STORE };
const DAY = dayOffset(-1);

function env(opts) {
  opts = opts || {};
  const h = boot({ modules: ['kasa.js', 'kasa-docs.js', 'history.js'], user: USER,
    fail: opts.fail,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], stores: [] } });
  h.w.kasaSetDate(DAY);
  /* Storage не е /rest/v1 — отговаря отделно; останалото минава през harness-а */
  h.storage = [];
  const base = h.w.fetch;
  h.w.fetch = function (url, o) {
    if (String(url).indexOf('/storage/v1/object/') >= 0) {
      h.storage.push(String(url));
      const okS = !opts.storageFail;
      return Promise.resolve({ ok: okS, status: okS ? 200 : 500, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    }
    return base.apply(this, arguments);
  };
  h.w.prompt = () => (Object.prototype.hasOwnProperty.call(opts, 'answer') ? opts.answer : '1');
  h.toasts = [];
  const prev = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: m, c: c }); return prev(m, c); };
  /* секцията с документите, както я рисува renderKasa → initKasaDocsView */
  const box = h.doc.createElement('div'); box.id = 'docs-section-pos';
  h.doc.getElementById('mod-kasa').appendChild(box);
  h.w.renderDocsSection('docs-section-pos', 'pos', []);
  return h;
}
async function pick(h, names) {
  const inp = h.doc.getElementById('doc-file-pos');
  const files = names.map(n => new h.w.File(['%PDF-1.4 x'], n, { type: 'application/pdf' }));
  Object.defineProperty(inp, 'files', { value: files, configurable: true });
  let v = 'C:\\fakepath\\' + names[0];
  Object.defineProperty(inp, 'value', { get: () => v, set: x => { v = x; }, configurable: true });
  fire(h.w, inp, 'change');
  for (let i = 0; i < 20; i++) { await ticks(3); await new Promise(r => setTimeout(r, 5)); }
  return { inp: inp, value: () => v };
}
const docPosts = h => h.calls.post.filter(c => c.table === 'kasa_documents');
const green = h => h.toasts.filter(t => t.m.indexOf('✅ Документът е качен') >= 0);
const red = h => h.toasts.filter(t => t.c === '#dc2626');

(async function run() {

  section('1. Зареждане и бутон');
  {
    const h = env();
    ok('input „+ Прикачи" с onchange=handleDocUpload', !!h.doc.getElementById('doc-file-pos') &&
      /handleDocUpload/.test(h.doc.getElementById('doc-file-pos').getAttribute('onchange')));
    h.close();
  }

  section('2. Успешно качване → POST в kasa_documents + зелено');
  {
    const h = env({ answer: '1' });
    await pick(h, ['z.pdf']);
    ok('файлът е качен в Storage', h.storage.length === 1, h.storage.length);
    const p = docPosts(h);
    if (ok('POST към kasa_documents', p.length === 1, p.length)) {
      ok('doc_type = z_report', p[0].body.doc_type === 'z_report', p[0].body.doc_type);
      ok('date = работния ден', p[0].body.date === DAY, p[0].body.date);
    }
    ok('зелено „✅ Документът е качен!"', green(h).length === 1, JSON.stringify(h.toasts));
    ok('червено няма', red(h).length === 0);
    h.close();
  }

  section('3. Паднал запис в kasa_documents → червено с името, БЕЗ зелено');
  {
    const h = env({ answer: '2', fail: { POST: { status: 403, body: { message: 'permission denied' }, url: /kasa_documents/ } } });
    await pick(h, ['storno-1.pdf']);
    ok('Storage е минал', h.storage.length === 1);
    const r = red(h);
    if (ok('червен toast', r.length === 1, JSON.stringify(h.toasts))) {
      ok('носи името на файла', r[0].m.indexOf('storno-1.pdf') >= 0, r[0].m);
      ok('носи причината от базата', r[0].m.indexOf('permission denied') >= 0, r[0].m);
    }
    ok('зелено НЯМА', green(h).length === 0, JSON.stringify(h.toasts));
    h.close();
  }

  section('3б. Два файла, единият пада → едно зелено, едно червено');
  {
    const h = env({ answer: '4' });
    /* пада само вторият POST към kasa_documents */
    let n = 0;
    const base = h.w.fetch;
    h.w.fetch = function (url, o) {
      if (String(url).indexOf('/rest/v1/kasa_documents') >= 0 && o && o.method === 'POST' && ++n === 2)
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }), text: () => Promise.resolve('{"message":"boom"}') });
      return base.apply(this, arguments);
    };
    await pick(h, ['a.pdf', 'b.pdf']);
    ok('едно зелено', green(h).length === 1, JSON.stringify(h.toasts));
    ok('едно червено', red(h).length === 1, JSON.stringify(h.toasts));
    h.close();
  }

  section('4. „Отказ" на вида → нищо не се качва, изборът се нулира');
  {
    const h = env({ answer: null });
    const s = await pick(h, ['z.pdf']);
    ok('Storage НЕ е викан', h.storage.length === 0, h.storage.length);
    ok('POST НЯМА', docPosts(h).length === 0);
    ok('съобщение „отказано"', h.toasts.some(t => t.m.indexOf('отказано') >= 0), JSON.stringify(h.toasts));
    ok('изборът на файл е нулиран', s.value() === '', s.value());
    h.close();
  }

  section('5. Непознат тип „7" → червено, нищо не се качва');
  {
    const h = env({ answer: '7' });
    await pick(h, ['z.pdf']);
    ok('Storage НЕ е викан', h.storage.length === 0);
    ok('POST НЯМА', docPosts(h).length === 0);
    ok('червено „Непознат тип"', red(h).some(t => t.m.indexOf('Непознат тип') >= 0), JSON.stringify(h.toasts));
    h.close();
  }

  section('6. Тип с интервал („ 3 ") се приема като Отстъпки');
  {
    const h = env({ answer: ' 3 ' });
    await pick(h, ['d.pdf']);
    const p = docPosts(h);
    ok('doc_type = discount', p.length === 1 && p[0].body.doc_type === 'discount', p.length && p[0].body.doc_type);
    h.close();
  }

  report();
})();
