/* tools/publish-instrukcii.js — качване на инструкциите в таб „Инструкции“.
   Без jsdom и без мрежа: фалшив fetch с хранилище и documents в паметта,
   временна папка под os.tmpdir(). Нищо не отива към Supabase.

   Мутационна проверка (19.11.2026) — всеки вариант е пуснат и е паднал:
     M1 махнато сравнението с живия обект (same = false винаги)
        → пада „непроменен файл → нула записи";
     M2 INSERT вместо PATCH при съществуваща карта (row = null в processItem)
        → пада „обновен файл → PATCH на същия ред, без втори";
     M3 махната защитата „само instrukcii/“ (PATH_RE приема всеки .pdf път)
        → пада „път извън instrukcii/ → отказ";
     M4 картата се пише и при неуспешно обратно четене (без сверката)
        → пада „обратното четене се разминава → без карта".
     M5 (19.11.2026) validateTitles не проверява подтаба (`if (false)`)
        → пада „Заглавията — табове и подтабове от портала".
   Оцелели мутанти: няма.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const P = require(path.join(ROOT, 'tools', 'publish-instrukcii.js'));
const REAL_LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'instrukcii.json'), 'utf8'));
const DOCS_SB = /var DOCS_SB\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'docs.js'), 'utf8'))[1];
const PUB = DOCS_SB + '/storage/v1/object/public/docs/';

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }
function section(s) { console.log('\n── ' + s); }

const TMP = path.join(os.tmpdir(), 'tmax-publish-instrukcii-' + process.pid);
let seq = 0;
function mkFolder(files) {
  const d = path.join(TMP, 'f' + (++seq));
  fs.mkdirSync(d, { recursive: true });
  Object.keys(files || {}).forEach(function (n) { fs.writeFileSync(path.join(d, n), files[n]); });
  return d;
}
function mkList(items) {
  const f = path.join(TMP, 'list' + (++seq) + '.json');
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(items));
  return f;
}

const ITEM = { file: 'Тест-обекти.pdf', path: 'instrukcii/test-obekti.pdf', title: 'Каса — обекти', category: 'Само за офиса', description: 'Кратка инструкция за обекти' };
const NOW = new Date(2026, 10, 19, 14, 5);

// Фалшив Supabase: storage { path: Buffer }, docs [rows], calls [{method,url}]
function fakeSb(o) {
  o = o || {};
  const st = { storage: Object.assign({}, o.storage || {}), docs: (o.docs || []).map(function (r) { return Object.assign({}, r); }), calls: [], fail: o.fail || {} };
  let idn = 100;
  function res(status, body) {
    const isBuf = Buffer.isBuffer(body);
    return Promise.resolve({
      status: status, ok: status >= 200 && status < 300,
      text: function () { return Promise.resolve(isBuf ? body.toString() : (typeof body === 'string' ? body : JSON.stringify(body))); },
      json: function () { return Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body); },
      arrayBuffer: function () { const b = isBuf ? body : Buffer.from(String(body)); return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
    });
  }
  st.fetch = function (url, init) {
    const m = (init && init.method) || 'GET';
    st.calls.push({ method: m, url: url });
    const u = url.replace(DOCS_SB, '');
    let mm;
    if ((mm = /^\/storage\/v1\/object\/authenticated\/docs\/(.+)$/.exec(u)) && m === 'GET') {
      if (st.fail.readback && st.calls.filter(function (c) { return c.method === 'POST'; }).length) return res(200, Buffer.from('развалено'));
      return st.storage[mm[1]] ? res(200, st.storage[mm[1]]) : res(400, '{"statusCode":"404","error":"not_found","message":"Object not found"}');
    }
    if ((mm = /^\/storage\/v1\/object\/docs\/(.+)$/.exec(u))) {
      if (m === 'DELETE') {
        if (!st.storage[mm[1]]) return res(400, '{"statusCode":"404","error":"not_found","message":"Object not found"}');
        delete st.storage[mm[1]]; return res(200, '{"message":"Successfully deleted"}');
      }
      if (m === 'POST') {
        if (st.fail.post) return res(500, 'boom');
        if (st.storage[mm[1]]) return res(400, '{"statusCode":"409","error":"Duplicate"}');
        st.storage[mm[1]] = Buffer.from(init.body); return res(200, '{"Key":"docs/' + mm[1] + '"}');
      }
    }
    if (/^\/rest\/v1\/documents\?select=/.test(u) && m === 'GET') {
      const like = decodeURIComponent(/url=like\.([^&]+)/.exec(u)[1]).replace(/\*/g, '');
      return res(200, st.docs.filter(function (r) { return r.url.indexOf(like) >= 0; }));
    }
    if ((mm = /^\/rest\/v1\/documents\?id=eq\.(.+)$/.exec(u)) && m === 'PATCH') {
      if (st.fail.card) return res(500, 'card boom');
      const id = decodeURIComponent(mm[1]);
      const row = st.docs.filter(function (r) { return String(r.id) === id; })[0];
      if (!row) return res(200, []);
      Object.assign(row, JSON.parse(init.body)); return res(200, [row]);
    }
    if (u === '/rest/v1/documents' && m === 'POST') {
      if (st.fail.card) return res(500, 'card boom');
      const row = Object.assign({ id: 'n' + (++idn) }, JSON.parse(init.body));
      st.docs.push(row); return res(201, [row]);
    }
    return res(599, 'неочаквана заявка ' + m + ' ' + u);
  };
  st.writes = function () { return st.calls.filter(function (c) { return c.method !== 'GET'; }); };
  return st;
}

function go(sb, folder, listPath, extra) {
  const lines = [];
  return P.run({
    argv: [folder].concat(extra || []), fetch: sb.fetch, now: NOW, root: ROOT, listPath: listPath,
    log: function (s) { lines.push(s); }
  }).then(function (code) { return { code: code, out: lines.join('\n') }; });
}

const OLD_DOCS = [
  { id: 'd1', title: 'SAP — Поръчки', category: 'SAP', url: PUB + 'docs/1700000000000_sap.pdf', description: '' },
  { id: 'd2', title: 'Процедура', category: 'Процедури', url: PUB + 'docs/1700000000001_p.pdf', description: '' }
];
const OLD_OBJ = { 'docs/1700000000000_sap.pdf': Buffer.from('стар SAP'), 'docs/1700000000001_p.pdf': Buffer.from('стара процедура') };

(async function main() {
  section('Списъкът');
  ok(P.validateList(REAL_LIST).length === 0, 'tools/instrukcii.json е валиден (' + REAL_LIST.length + ' реда)');
  ok(REAL_LIST.every(function (i) { return P.PATH_RE.test(i.path); }), 'всички пътища са под instrukcii/');
  ok(new Set(REAL_LIST.map(function (i) { return i.path; })).size === REAL_LIST.length, 'няма два реда с един path');
  ok(new Set(REAL_LIST.map(function (i) { return i.title; })).size === REAL_LIST.length, 'няма два реда с едно title');
  ok(P.validateList([ITEM, Object.assign({}, ITEM, { file: 'x.pdf', title: 'друго' })]).some(function (e) { return /пътят .* се повтаря/.test(e); }), 'дублиран path → грешка');
  ok(P.validateList([ITEM, Object.assign({}, ITEM, { file: 'x.pdf', path: 'instrukcii/x.pdf' })]).some(function (e) { return /заглавието .* се повтаря/.test(e); }), 'дублирано title → грешка');

  section('Заглавията — табове и подтабове от портала (19.11.2026)');
  {
    const tabs = P.portalTabs(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    const split = P.loadSplit(path.join(ROOT, 'docs.js'));
    const v = function (title) { return P.validateTitles([Object.assign({}, ITEM, { title: title })], tabs, split); };
    ok(P.validateTitles(REAL_LIST, tabs, split).length === 0, 'tools/instrukcii.json: всяко заглавие е таб (и подтаб) от портала');
    ok(REAL_LIST.filter(function (i) { return split(i.title).sub === 'Товарни листи'; }).length === 6 &&
      REAL_LIST.filter(function (i) { return split(i.title).sub === 'Трансфери'; }).length === 2 &&
      REAL_LIST.filter(function (i) { return split(i.title).mod === 'Стока на път' && split(i.title).sub === null; }).length === 3,
      'реалният списък: 6 в Транспорт/Товарни листи, 2 в Транспорт/Трансфери, 3 направо в Стока на път');
    ok(v('Каса — обекти').length === 0, '„Каса — обекти" (таб, едно ниво) → без грешка');
    ok(v('Транспорт — Трансфери — обекти').length === 0, '„Транспорт — Трансфери — обекти" (таб + подтаб) → без грешка');
    ok(v('Транспорт — Трансфери — обекти — 2').length === 0, 'трето тире остава в името → без грешка');
    ok(/„Транспрот" не е таб/.test(v('Транспрот — обекти').join()), 'правописна грешка в таба → „не е таб": ' + v('Транспрот — обекти').join());
    ok(/„Трансфер" не е подтаб на „Транспорт"/.test(v('Транспорт — Трансфер — обекти').join()), 'правописна грешка в подтаба → „не е подтаб"');
    ok(/табът няма подтабове/.test(v('Каса — Сторно — обекти').join()), 'подпапка в таб без подтабове → грешка');
    ok(/трябва да е/.test(v('Без тире').join()), 'заглавие без тире → грешка');
    ok(v('транспорт — обекти').length === 1, 'същото изписване — малка буква е грешка');
    const sb = fakeSb({ storage: OLD_OBJ, docs: OLD_DOCS });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов' }), mkList([Object.assign({}, ITEM, { title: 'Транспорт — Товарни лист — обекти' })]), ['--go']);
    ok(r.code !== 0 && sb.calls.length === 0 && /„Товарни лист" не е подтаб/.test(r.out), 'run(): непознат подтаб → exit ' + r.code + ', нула заявки');
  }

  section('Път извън instrukcii/ → отказ');
  for (const bad of ['docs/1700000000000_sap.pdf', 'instrukcii/../docs/x.pdf', 'instrukcii/Кирилица.pdf', 'instrukcii/sub/x.pdf', 'x.pdf']) {
    const sb = fakeSb({ storage: OLD_OBJ, docs: OLD_DOCS });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов' }), mkList([Object.assign({}, ITEM, { path: bad })]), ['--go']);
    ok(r.code !== 0 && sb.calls.length === 0 && /отказ/.test(r.out), 'път „' + bad + '" → exit ' + r.code + ', нула заявки');
  }

  section('Сухо пускане');
  {
    const sb = fakeSb({ storage: OLD_OBJ, docs: OLD_DOCS });
    const folder = mkFolder({ 'Тест-обекти.pdf': 'нов', 'Друго.pdf': 'x' });
    const r = await go(sb, folder, mkList([ITEM, Object.assign({}, ITEM, { file: 'Липсва.pdf', path: 'instrukcii/lipsva.pdf', title: 'Каса — липсва' })]));
    ok(r.code === 0, 'exit 0');
    ok(sb.writes().length === 0, 'нито една заявка за запис (' + sb.writes().length + ')');
    ok(/СУХО/.test(r.out) && /би направил качване \+ INSERT/.test(r.out), 'казва какво би направил');
    ok(/няма файл „Липсва\.pdf"/.test(r.out), 'липсващ файл е споменат');
    ok(/Друго\.pdf е в папката, но го няма/.test(r.out), 'файл извън списъка е споменат');
  }

  section('Нов файл → DELETE, POST, обратно четене, INSERT');
  {
    const sb = fakeSb({ storage: OLD_OBJ, docs: OLD_DOCS });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов PDF' }), mkList([ITEM]), ['--go']);
    const seqM = sb.calls.filter(function (c) { return c.url.indexOf('instrukcii/') >= 0 || c.method !== 'GET'; }).map(function (c) { return c.method + (c.url.indexOf('/rest/') >= 0 ? ' rest' : ' obj'); });
    ok(r.code === 0, 'exit 0');
    ok(JSON.stringify(seqM) === JSON.stringify(['GET obj', 'DELETE obj', 'POST obj', 'GET obj', 'POST rest']), 'редът на заявките: ' + seqM.join(' → '));
    ok(sb.storage['instrukcii/test-obekti.pdf'].toString() === 'нов PDF', 'обектът е качен');
    const card = sb.docs.filter(function (d) { return d.url.indexOf('instrukcii/') >= 0; });
    ok(card.length === 1, 'една карта');
    ok(card[0].url === PUB + 'instrukcii/test-obekti.pdf?v=202611191405', 'url с ?v=ггггммддччмм: ' + card[0].url);
    ok(card[0].description === 'Кратка инструкция за обекти · обновена 19.11.2026', 'описание с дата: ' + card[0].description);
    ok(card[0].title === ITEM.title && card[0].category === 'Само за офиса', 'title и category');
    const postCall = sb.calls.filter(function (c) { return c.method === 'POST' && c.url.indexOf('/object/') >= 0; })[0];
    ok(!!postCall, 'POST към storage');
  }

  section('Обновен файл → DELETE, POST, PATCH на същия ред, без втори');
  {
    const prev = { id: 'k1', title: ITEM.title, category: ITEM.category, url: PUB + 'instrukcii/test-obekti.pdf?v=202611010900', description: 'Кратка инструкция за обекти · обновена 01.11.2026' };
    const sb = fakeSb({ storage: Object.assign({ 'instrukcii/test-obekti.pdf': Buffer.from('стара версия') }, OLD_OBJ), docs: OLD_DOCS.concat([prev]) });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нова версия' }), mkList([ITEM]), ['--go']);
    ok(r.code === 0, 'exit 0');
    const w = sb.writes().map(function (c) { return c.method + (c.url.indexOf('/rest/') >= 0 ? ' rest' : ' obj'); });
    ok(JSON.stringify(w) === JSON.stringify(['DELETE obj', 'POST obj', 'PATCH rest']), 'записи: ' + w.join(' → '));
    const cards = sb.docs.filter(function (d) { return d.url.indexOf('instrukcii/') >= 0; });
    ok(cards.length === 1 && cards[0].id === 'k1', 'същият ред k1, без втори');
    ok(cards[0].url === PUB + 'instrukcii/test-obekti.pdf?v=202611191405', 'нов ?v');
    ok(sb.storage['instrukcii/test-obekti.pdf'].toString() === 'нова версия', 'обектът е заменен');
  }

  section('Непроменен файл → нула записи');
  {
    const prev = { id: 'k1', title: ITEM.title, category: ITEM.category, url: PUB + 'instrukcii/test-obekti.pdf?v=202611010900', description: 'Кратка инструкция за обекти · обновена 01.11.2026' };
    const sb = fakeSb({ storage: Object.assign({ 'instrukcii/test-obekti.pdf': Buffer.from('същото') }, OLD_OBJ), docs: OLD_DOCS.concat([prev]) });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'същото' }), mkList([ITEM]), ['--go']);
    ok(r.code === 0 && sb.writes().length === 0, 'exit 0 и нула записи (' + sb.writes().length + ')');
    ok(/нищо за правене/.test(r.out), 'казва „нищо за правене"');
  }

  section('Непроменен файл, сменена category → само PATCH на картата');
  {
    const prev = { id: 'k1', title: ITEM.title, category: 'Само за офиса', url: PUB + 'instrukcii/test-obekti.pdf?v=202611010900', description: 'Кратка инструкция за обекти · обновена 01.11.2026' };
    const sb = fakeSb({ storage: { 'instrukcii/test-obekti.pdf': Buffer.from('същото') }, docs: [prev] });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'същото' }), mkList([Object.assign({}, ITEM, { category: 'Процедури' })]), ['--go']);
    const w = sb.writes().map(function (c) { return c.method; });
    ok(r.code === 0 && JSON.stringify(w) === '["PATCH"]', 'само PATCH: ' + w.join(','));
    ok(sb.docs[0].category === 'Процедури' && sb.docs[0].url === prev.url && /01\.11\.2026$/.test(sb.docs[0].description), 'category сменена, url и дата запазени');
  }

  section('Липсващ файл → пропуск');
  {
    const sb = fakeSb({});
    const r = await go(sb, mkFolder({}), mkList([ITEM]), ['--go']);
    ok(r.code === 0 && sb.writes().length === 0 && /пропуснат/.test(r.out), 'exit 0, нула записи, „пропуснат"');
  }

  section('Неуспешен POST → без запис в documents, exit ≠ 0');
  {
    const sb = fakeSb({ fail: { post: true } });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов' }), mkList([ITEM]), ['--go']);
    ok(r.code !== 0, 'exit ' + r.code);
    ok(!sb.writes().some(function (c) { return c.url.indexOf('/rest/') >= 0; }), 'нито една заявка за запис към documents');
    ok(/POST instrukcii\/test-obekti\.pdf: HTTP 500/.test(r.out) && /1 с грешка/.test(r.out), 'грешката е в обобщението');
  }

  section('Обратното четене се разминава → без карта');
  {
    const sb = fakeSb({ fail: { readback: true } });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов' }), mkList([ITEM]), ['--go']);
    ok(r.code !== 0 && sb.docs.length === 0 && /не съвпада/.test(r.out), 'exit ≠ 0, нула карти, „не съвпада"');
  }

  section('Успешен POST, неуспешна карта → изрично съобщение, exit ≠ 0');
  {
    const sb = fakeSb({ fail: { card: true } });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов' }), mkList([ITEM]), ['--go']);
    ok(r.code !== 0, 'exit ' + r.code);
    ok(!!sb.storage['instrukcii/test-obekti.pdf'], 'файлът е в хранилището');
    ok(/ФАЙЛЪТ Е КАЧЕН, НО КАРТАТА НЕ Е ЗАПИСАНА/.test(r.out), 'изрично съобщение');
  }

  section('Две карти за един път → не пише');
  {
    const a = { id: 'k1', title: ITEM.title, category: ITEM.category, url: PUB + 'instrukcii/test-obekti.pdf?v=1', description: '' };
    const sb = fakeSb({ docs: [a, Object.assign({}, a, { id: 'k2', url: PUB + 'instrukcii/test-obekti.pdf' })] });
    const r = await go(sb, mkFolder({ 'Тест-обекти.pdf': 'нов' }), mkList([ITEM]), ['--go']);
    ok(r.code !== 0 && sb.writes().length === 0 && /2 карти/.test(r.out), 'exit ≠ 0, нула записи');
  }

  section('docs/ остава непокътнато — пълен пуск с реалния списък');
  {
    const files = {}; const storage = Object.assign({}, OLD_OBJ);
    REAL_LIST.forEach(function (i, n) { files[i.file] = 'pdf ' + n; });
    const sb = fakeSb({ storage: storage, docs: OLD_DOCS });
    const r = await go(sb, mkFolder(files), path.join(ROOT, 'tools', 'instrukcii.json'), ['--go']);
    ok(r.code === 0, 'exit 0 (' + REAL_LIST.length + ' качени)');
    const bad = sb.writes().filter(function (c) { return !/\/storage\/v1\/object\/docs\/instrukcii\/[a-z0-9-]+\.pdf$/.test(c.url) && !/\/rest\/v1\/documents(\?id=eq\.n\d+)?$/.test(c.url); });
    ok(bad.length === 0, 'всеки запис е под instrukcii/ или нова карта (' + bad.map(function (c) { return c.url; }).join(', ') + ')');
    ok(OLD_DOCS.every(function (o) { return JSON.stringify(sb.docs.filter(function (d) { return d.id === o.id; })[0]) === JSON.stringify(o); }), 'старите редове в documents са същите');
    ok(Object.keys(OLD_OBJ).every(function (k) { return sb.storage[k] && sb.storage[k].equals(OLD_OBJ[k]); }), 'старите обекти под docs/ са същите');
    ok(sb.docs.length === OLD_DOCS.length + REAL_LIST.length, 'точно по една нова карта на ред');
  }

  section('Ключът е публичният (от docs.js)');
  ok(P.readConfig(path.join(ROOT, 'docs.js')).bucket === 'docs', 'docs.js дава bucket docs и anon ключ');
  ok(!/service_role/.test(fs.readFileSync(path.join(ROOT, 'tools', 'publish-instrukcii.js'), 'utf8').replace(/Service ключ не се ползва/, '')), 'скриптът не споменава service_role');

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* временна папка */ }
  console.log('\n' + pass + ' успешни, ' + fail + ' неуспешни');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('❌ ХВЪРЛИ: ' + (e && e.stack || e)); process.exit(1); });
