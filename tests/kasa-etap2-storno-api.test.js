/* Каса, етап 2 (26.11.2026, сесия kasa-etap2): сторното се трие и артикулите
   му се записват през kasa-api — браузърът няма DELETE за kasa_storno /
   kasa_storno_items и няма никакви права върху kasa_storno_items
   (kasa-etap2-schema.sql).

   Шпион на fetch на ВЪНШНО ниво (вижда и заявките, които harness-ът обслужва):
   нито един DELETE към /rest/v1/kasa_storno*, нито един POST/PATCH към
   /rest/v1/kasa_storno_items — при истински клик по 🗑, ✏️ → „💾 Запази“ и
   „+ Нова сторно бележка“ → „💾 Запази“.

   Покрива:
     1. 🗑 → confirm „да“ → kasa-api storno_delete {id} → „🗑 Изтрито“ и нов
        прочит на списъка; confirm „не“ → нищо.
     2. 🗑 при грешка на kasa-api (404) → червен toast с причината, БЕЗ
        резервен DELETE през REST.
     3. ✏️ → „💾 Запази“: PATCH kasa_storno (още през REST — етап 3) и после
        storno_items_save {storno_id, items} — kind / sap_code (trim) /
        article_name (празно → null) / line_no по вид; в items няма storno_id.
     4. Нова бележка: POST kasa_storno с id, после storno_items_save със
        същото id.
     5. storno_items_save пада (500 items_not_saved) → предупреждението
        „артикулите не се записаха“ (както преди при паднал DELETE/POST).
     6. Ред: storno_items_save тръгва СЛЕД записа на бележката (родителят
        трябва да съществува, функцията го проверява).

   Пускане:  node tests/kasa-etap2-storno-api.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, dayOffset } = H;

const KR = 'Кърджали';
const USER = { id: 'u-kr', email: 'kr@temax.bg', display_name: 'Мениджър КР', role: 'manager', store_name: KR };
const Y = dayOffset(-1);
const SID = '11111111-1111-4111-8111-111111111111';
const STORNO = [{ id: SID, store_name: KR, storno_date: Y, original_receipt_date: dayOffset(-5), returned_sum: 100, new_sum: 80,
  articles: '123456', status: 'draft', reason: 'Замяна', created_at: Y + 'T12:00:00Z',
  kasa_storno_items: [{ kind: 'returned', sap_code: '123456', article_name: 'Лампа', line_no: 1 },
    { kind: 'replacement', sap_code: '654321', article_name: 'Друга лампа', line_no: 1 }] }];
const ITEMS = [
  { id: 'i1', storno_id: SID, kind: 'returned', sap_code: '123456', article_name: 'Лампа', line_no: 1 },
  { id: 'i2', storno_id: SID, kind: 'replacement', sap_code: '654321', article_name: 'Друга лампа', line_no: 1 },
];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'daily-turnover.js', 'history.js', 'notifications.js'],
    user: Object.assign({}, USER),
    confirm: opts.confirm,
    data: {
      app_settings: [{ key: 'kasa_api_stores', value: 'all' }],
      kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], kasa_storno: STORNO.slice(),
      kasa_storno_items: ITEMS.slice(), daily_turnover: [], stores: [{ name: KR }],
      transport_orders: [], client_orders: [], loading_lists: [], loading_list_items: [], transfers: [], transfer_cargo: []
    }
  });
  const w = h.w;
  w.currentSession = 'sess-ok';
  w.transportOrders = []; w.clientOrders = [];
  const spy = { all: [], api: [], reply: opts.reply || {} };
  const inner = w.fetch;
  const res = o => ({ ok: o.status < 400, status: o.status, json: () => Promise.resolve(o.body), text: () => Promise.resolve(JSON.stringify(o.body)) });
  w.fetch = function (url, init) {
    const u = String(url);
    const method = ((init && init.method) || 'GET').toUpperCase();
    spy.all.push({ method: method, url: u, t: spy.all.length });
    if (u.indexOf('/functions/v1/kasa-api') >= 0) {
      const body = JSON.parse(init.body);
      spy.api.push(Object.assign({ t: spy.all.length - 1 }, body));
      if (spy.reply[body.action]) return Promise.resolve(res(spy.reply[body.action](body)));
      if (body.action === 'range') return Promise.resolve(res({ status: 200, body: { ok: true, kinds: { storno: { rows: STORNO, partial: false } } } }));
      if (body.action === 'storno_items') return Promise.resolve(res({ status: 200, body: { ok: true, storno_id: body.storno_id, items: ITEMS } }));
      if (body.action === 'storno_delete') return Promise.resolve(res({ status: 200, body: { ok: true, id: body.id, deleted: 1 } }));
      if (body.action === 'storno_items_save') return Promise.resolve(res({ status: 200, body: { ok: true, storno_id: body.storno_id, removed: 2, added: body.items.length } }));
      if (body.action === 'banner') return Promise.resolve(res({ status: 200, body: { ok: true, returned_reports: [] } }));
      return Promise.resolve(res({ status: 400, body: { ok: false, reason: 'bad_action', message: 'Непознато действие.' } }));
    }
    return inner.apply(this, arguments);
  };
  h.spy = spy;
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 15); i++) await ticks(); }
const forbidden = h => h.spy.all.filter(c =>
  (c.method === 'DELETE' && /\/rest\/v1\/kasa_storno/.test(c.url)) ||
  (c.method !== 'GET' && /\/rest\/v1\/kasa_storno_items/.test(c.url)) ||
  (/\/rest\/v1\/kasa_storno_items/.test(c.url)));
const acts = (h, a) => h.spy.api.filter(c => c.action === a);
const findBtn = (root, txt) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === txt || b.textContent.indexOf(txt) >= 0);
async function openList(h) {
  h.w.kasaView = 'storno';
  h.w.loadStorno();
  await settle();
  return h.doc.getElementById('mod-kasa');
}

(async function main() {
  /* ─────────────────────────────────────────────── */
  section('1. 🗑 → storno_delete през kasa-api');
  {
    const h = env();
    const root = await openList(h);
    const del = findBtn(root, '🗑');
    ok('🗑 е в списъка', !!del);
    const before = h.spy.all.length;
    realClick(h.w, del, '🗑');
    await settle();
    const d = acts(h, 'storno_delete');
    ok('kasa-api storno_delete — веднъж', d.length === 1, JSON.stringify(d));
    ok('… с id на бележката', d[0] && d[0].id === SID);
    ok('… с пропуска', d[0] && d[0].session === 'sess-ok');
    ok('toast „🗑 Изтрито“', h.calls.toast.some(m => /Изтрито/.test(m)), h.calls.toast.join(' | '));
    ok('списъкът се чете наново (range след изтриването)', h.spy.api.some(c => c.action === 'range' && c.t > before));
    ok('НУЛА DELETE / запис към /rest/v1/kasa_storno*', forbidden(h).length === 0, JSON.stringify(forbidden(h)));
    ok('нула DELETE изобщо през REST', h.calls.del.length === 0, h.calls.del.join(', '));
  }
  {
    const h = env({ confirm: false });
    const root = await openList(h);
    realClick(h.w, findBtn(root, '🗑'), '🗑 (отказ)');
    await settle();
    ok('confirm „не“ → нито kasa-api, нито REST', acts(h, 'storno_delete').length === 0 && h.calls.del.length === 0);
  }

  /* ─────────────────────────────────────────────── */
  section('2. 🗑 при грешка на kasa-api — без резервен DELETE');
  {
    const h = env({ reply: { storno_delete: () => ({ status: 404, body: { ok: false, reason: 'not_found', message: 'Няма такава сторно бележка във вашия обхват.' } }) } });
    const root = await openList(h);
    realClick(h.w, findBtn(root, '🗑'), '🗑');
    await settle();
    ok('червен toast с причината', h.calls.toast.some(m => /Грешка при изтриване: Няма такава сторно бележка/.test(m)), h.calls.toast.join(' | '));
    ok('няма „Изтрито“', !h.calls.toast.some(m => /Изтрито/.test(m)));
    ok('НУЛА DELETE към /rest/v1/kasa_storno*', forbidden(h).length === 0 && h.calls.del.length === 0);
  }

  /* ─────────────────────────────────────────────── */
  section('3. ✏️ → „💾 Запази“: PATCH бележката, после storno_items_save');
  {
    const h = env();
    const root = await openList(h);
    realClick(h.w, findBtn(root, '✏️'), '✏️');
    await settle();
    ok('формата е отворена с артикулите от kasa-api', /Редактирай/.test(root.textContent) && acts(h, 'storno_items').length === 1);
    const code = h.doc.getElementById('sf-ret-code-0');
    ok('полето с кода носи 123456', code && code.value === '123456', code && code.value);
    code.value = '  777888  ';
    realClick(h.w, findBtn(root, '💾 Запази'), '💾 Запази');
    await settle();
    const p = h.calls.patch.filter(c => /\/rest\/v1\/kasa_storno\?id=eq\./.test(c.url));
    ok('PATCH kasa_storno по id (още през REST, етап 3)', p.length === 1, JSON.stringify(h.calls.patch.map(c => c.url)));
    const s = acts(h, 'storno_items_save');
    ok('storno_items_save — веднъж', s.length === 1);
    ok('… storno_id = редактираната бележка', s[0] && s[0].storno_id === SID);
    ok('… артикулите: kind / trim / line_no по вид', s[0] && JSON.stringify(s[0].items) === JSON.stringify([
      { kind: 'returned', sap_code: '777888', article_name: 'Лампа', line_no: 1 },
      { kind: 'replacement', sap_code: '654321', article_name: 'Друга лампа', line_no: 1 }]), JSON.stringify(s[0] && s[0].items));
    ok('… в items няма storno_id (слага го сървърът)', s[0] && s[0].items.every(i => !('storno_id' in i)));
    const patchT = h.spy.all.findIndex(c => c.method === 'PATCH' && /kasa_storno\?/.test(c.url));
    ok('ред: storno_items_save СЛЕД PATCH-а на бележката', patchT >= 0 && s[0] && s[0].t > patchT, patchT + ' / ' + (s[0] && s[0].t));
    ok('toast „💾 Сторно бележката е запазена!“', h.calls.toast.some(m => /Сторно бележката е запазена/.test(m)), h.calls.toast.join(' | '));
    ok('НУЛА DELETE / запис / четене към /rest/v1/kasa_storno_items', forbidden(h).length === 0, JSON.stringify(forbidden(h)));
  }

  /* ─────────────────────────────────────────────── */
  section('4. Нова бележка: POST с id, после storno_items_save със същото id');
  {
    const h = env();
    const root = await openList(h);
    realClick(h.w, findBtn(root, '+ Нова сторно бележка'), '+ Нова');
    await settle();
    h.doc.getElementById('sf-ret-code-0').value = '555111';
    h.doc.getElementById('sf-returned_sum').value = '42.50';
    h.doc.getElementById('sf-original_receipt_date').value = dayOffset(-3);
    realClick(h.w, findBtn(root, '💾 Запази'), '💾 Запази');
    await settle();
    const posts = h.calls.post.filter(c => /\/rest\/v1\/kasa_storno$/.test(c.url.split('?')[0]));
    ok('POST kasa_storno — веднъж', posts.length === 1, JSON.stringify(h.calls.post.map(c => c.url)));
    const body = posts[0] && (typeof posts[0].body === 'string' ? JSON.parse(posts[0].body) : posts[0].body);
    const newId = body && (Array.isArray(body) ? body[0].id : body.id);
    ok('… с id от клиента (uuid)', /^[0-9a-f-]{36}$/i.test(String(newId)), String(newId));
    const s = acts(h, 'storno_items_save');
    ok('storno_items_save със същото id', s.length === 1 && s[0].storno_id === newId);
    ok('… един върнат артикул, line_no 1, без име → null', s[0] && JSON.stringify(s[0].items) === JSON.stringify([{ kind: 'returned', sap_code: '555111', article_name: null, line_no: 1 }]), JSON.stringify(s[0] && s[0].items));
    ok('НУЛА DELETE / запис към /rest/v1/kasa_storno_items', forbidden(h).length === 0, JSON.stringify(forbidden(h)));
  }

  /* ─────────────────────────────────────────────── */
  section('5. storno_items_save пада → предупреждение, без резервен път');
  {
    const h = env({ reply: { storno_items_save: () => ({ status: 500, body: { ok: false, reason: 'items_not_saved', message: 'Артикулите не се записаха — запази бележката отново.' } }) } });
    const root = await openList(h);
    realClick(h.w, findBtn(root, '✏️'), '✏️');
    await settle();
    realClick(h.w, findBtn(root, '💾 Запази'), '💾 Запази');
    await settle();
    ok('предупреждение „артикулите не се записаха коректно“', h.calls.toast.some(m => /артикулите не се записаха/.test(m)), h.calls.toast.join(' | '));
    ok('няма „запазена!“ като успех', !h.calls.toast.some(m => /Сторно бележката е запазена!/.test(m)));
    ok('НУЛА DELETE / запис към /rest/v1/kasa_storno_items', forbidden(h).length === 0, JSON.stringify(forbidden(h)));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
