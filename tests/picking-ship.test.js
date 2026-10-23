/* „📦 Пикинг", етап 2, част Б — „🚚 Изпращане": транспорт, „на камиона",
   „Тръгна" (push + имейл, паднало известие → маркер + „Прати пак"), 🗑,
   приемане от обекта (✓ Получен / ⛔ Липсва / по артикул), „Приключи
   приемането" → received | partial, отклоненията при склада, #pk= при обекта
   и при склада с отворен транспорт.
   Интеграционно: shared.js + stock-returns.js + push.js + email.js +
   loading.js (llPushTo / llStoreEmails / llMailTo) + transfers.js + picking.js
   в реда от index.html. pushToStores и sendEmail са фалшиви — записват
   извикванията (както в тестовете на Товарни листи).

   Фикстура — редовете от непланирания файл, седмица 41, за Кърджали (КАЛЪФ
   64694 × 31, КАЛЪФ 103742 × 10, МЕХАНИЗЪМ 87800 × 20) в две затворени
   единици + отворена единица и чужд обект (Сливен).

   Мутационна проверка (23.10.2026) — всеки вариант е пуснат и е паднал:
     M1 „Тръгна" при 0 единици
        → пада „Тръгна с 0 единици → отказ, без PATCH и без известие";
     M2 имейлът без артикулите
        → пада „тялото: двете единици и артикулите (64694, 103742, 87800)";
     M3 „Липсва" без коментар
        → пада „Липсва без коментар → отказ, без PATCH";
     M4 „Приключи" дава received при отклонение
        → пада „с отклонения → partial" (излиза received);
     M5 паднал имейл се поглъща тихо
        → падат notify_error, червеният toast, маркерът и „Прати пак", флагът
          в списъка.
     M6 „няма получател в пилота" се брои за провал (r.none → errs)
        → падат „… НЕ е провал" и „… жълто „няма получател в пилота"" (и за двата случая);
     M7 филтърът по picking_users махнат (pkPilotRecipients пуска всички
        активни акаунти на обекта)
        → падат „1 push … само до (Кърджали И „Управител Кърджали")", „push-ът не
          стига до истинския акаунт извън списъка", „1 имейл САМО до акаунта в
          пилота" и „kardzhali2@ НЕ получава писмо".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, ticks } = H;

const TG = 'Логистичен склад Търговище';
const USERS = 'ten.tenev@temax.bg, v.filev@temax.bg, kardzhali@temax.bg';
const VIKTOR = { email: 'v.filev@temax.bg', display_name: 'Виктор', role: 'logistics', store_name: TG };
const TENCHO = { email: 'ten.tenev@temax.bg', display_name: 'Тенчо', role: 'admin', store_name: 'Централен офис' };
const KARDZHALI = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const TROYAN = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };
const RED = '#dc2626';
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function line(id, store, code, name, qty) {
  return { id, batch_id: 'b1', warehouse: TG, store_name: store, sap_code: code, product_name: name, unit: 'БР', qty_requested: qty,
    supply_group: null, sap_order: null, sap_item: null, line_no: 2, status: 'picked', qty_picked: null, comment: null, done_by: 'Виктор', done_at: '2026-10-23T08:00:00Z', created_at: '2026-10-23T07:00:00Z' };
}
function pallet(n, store, kind, no, status, extra) {
  return Object.assign({ id: uuid(n), warehouse: TG, store_name: store, kind, no, created_on: '2026-10-23', status, note: null, created_by: 'Виктор',
    created_at: '2026-10-23T09:0' + (n % 10) + ':00Z', closed_by: status === 'closed' ? 'Виктор' : null, closed_at: null, shipment_id: null,
    loaded_by: null, loaded_at: null, received_status: null, received_by: null, received_at: null, receive_note: null }, extra || {});
}
const item = (id, pid, lid, qty) => ({ id, pallet_id: uuid(pid), line_id: lid, qty, qty_received: null, receive_comment: null, created_at: '2026-10-23T09:00:00Z' });
function fixture() {
  return {
    lines: [line('K1', 'Кърджали', '64694', 'КАЛЪФ МАСА ЗА ГЛАДЕНЕ ORIGIN 50/140СМ', 31), line('K2', 'Кърджали', '103742', 'КАЛЪФ МАСА ЗА ГЛАДЕНЕ 94589 80/41CM', 10),
      line('K3', 'Кърджали', '87800', 'МЕХАНИЗЪМ ИЗПРАЗВАЩ 1СТЕП.4803/4802', 20), line('S1', 'Сливен', '13456', 'КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л', 10)],
    pallets: [pallet(1, 'Кърджали', 'pallet', 1, 'closed'), pallet(2, 'Кърджали', 'bulk', 1, 'closed'), pallet(3, 'Кърджали', 'pallet', 2, 'open'), pallet(4, 'Сливен', 'pallet', 1, 'closed')],
    items: [item('i1', 1, 'K1', 31), item('i2', 1, 'K2', 10), item('i3', 2, 'K3', 20), item('i4', 4, 'S1', 10)],
    shipments: []
  };
}
function fakeDb(f) {
  f = f || fixture();
  return { users: USERS, accounts: [{ email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', store_name: 'Кърджали' },
    { email: 'kardzhali2@temax.bg', display_name: 'Зам. Кърджали', store_name: 'Кърджали' }],   /* вторият — истински, извън picking_users */
    lines: f.lines, pallets: f.pallets, items: f.items, shipments: f.shipments, log: [], seq: 500 };
}
function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, headers: { get: () => null },
    json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
const inList = (q, col) => ((q.match(new RegExp('(?:^|&)' + col + '=in\\.\\(([^)]*)\\)')) || [])[1] || '').split(',').filter(Boolean);
const eqOf = (q, col) => (q.match(new RegExp('(?:^|&)' + col + '=eq\\.([^&]+)')) || [])[1];
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, url: u, q, body });
    const copy = a => a.map(x => Object.assign({}, x));
    const idEq = eqOf(q, 'id');
    if (m === 'GET') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      if (tbl === 'app_settings') return resp(200, [{ key: 'picking_users', value: db.users }]);
      if (tbl === 'users') { if (db.usersFail) return resp(500, { message: 'users down' }); const st = eqOf(q, 'store_name'); return resp(200, db.accounts.filter(a => a.store_name === st)); }
      if (tbl === 'picking_shipments') {
        let r = db.shipments;
        const wh = eqOf(q, 'warehouse'), st = eqOf(q, 'store_name'), stt = eqOf(q, 'status');
        if (wh) r = r.filter(s => s.warehouse === wh);
        if (st) r = r.filter(s => s.store_name === st);
        if (stt) r = r.filter(s => s.status === stt);
        return resp(200, copy(r));
      }
      if (tbl === 'picking_pallets') {
        if (idEq) return resp(200, copy(db.pallets.filter(p => p.id === idEq)));
        const sh = inList(q, 'shipment_id');
        if (sh.length) return resp(200, copy(db.pallets.filter(p => sh.indexOf(p.shipment_id) >= 0)));
        if (/shipment_id=is\.null/.test(q)) return resp(200, copy(db.pallets.filter(p => p.status === 'closed' && !p.shipment_id && p.warehouse === eqOf(q, 'warehouse'))));
        return resp(200, copy(db.pallets));
      }
      if (tbl === 'picking_pallet_items') { const p = inList(q, 'pallet_id'); return resp(200, copy(db.items.filter(i => p.indexOf(i.pallet_id) >= 0))); }
      if (tbl === 'picking_lines') { const ids = inList(q, 'id'); return resp(200, copy(db.lines.filter(l => ids.indexOf(l.id) >= 0))); }
      return resp(200, []);
    }
    if (m === 'POST' && tbl === 'picking_shipments') {
      const row = Object.assign({ id: uuid(++db.seq), created_at: new Date().toISOString(), departed_by: null, departed_at: null, received_by: null, received_at: null,
        notify_error: null, notified_at: null }, body);
      db.shipments.push(row);
      return resp(201, [row]);
    }
    if (m === 'PATCH') {
      const arr = { picking_pallets: db.pallets, picking_pallet_items: db.items, picking_shipments: db.shipments, picking_lines: db.lines }[tbl] || [];
      const sh = eqOf(q, 'shipment_id');
      arr.filter(x => (idEq && x.id === idEq) || (sh && x.shipment_id === sh)).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    if (m === 'DELETE' && tbl === 'picking_shipments') {
      const s = db.shipments.find(x => x.id === idEq);
      if (s && s.status === 'loading') {   /* политиката: само loading; FK on delete set null */
        db.shipments = db.shipments.filter(x => x.id !== idEq);
        db.pallets.forEach(p => { if (p.shipment_id === idEq) p.shipment_id = null; });
      }
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, db, o) {
  o = o || {};
  const h = boot({ modules: ['stock-returns.js', 'push.js', 'email.js', 'loading.js', 'transfers.js', 'picking.js'], user, data: {} });
  install(h, db);
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c: c || '' }); try { orig(m, c); } catch (e) {} };
  h.pushes = []; h.mails = [];
  h.pushOk = o.pushOk !== false; h.mailOk = o.mailOk !== false;
  /* Push в пилота минава през osSend с филтри (обект И име); pushToStores
     (по тага на целия обект) не бива да се вика изобщо. */
  h.storePushes = [];
  h.w.pushToStores = (stores, title, msg) => { h.storePushes.push({ stores, title, msg }); return Promise.resolve({ ok: true, status: 200, data: {} }); };
  h.w.osSend = (payload) => { h.pushes.push({ filters: payload.filters, title: payload.headings && payload.headings.bg, msg: payload.contents && payload.contents.bg });
    return Promise.resolve(h.pushOk ? { ok: true, status: 200, data: {} } : { ok: false, status: 502, data: { message: 'onesignal down' } }); };
  h.w.sendEmail = (to, subject, html) => { h.mails.push({ to, subject, html }); return Promise.resolve(h.mailOk ? { ok: true, status: 200, data: {} } : { ok: false, status: 500, data: { message: 'smtp refused' } }); };
  return h;
}
const $ = (h, id) => h.doc.getElementById(id);
const lastToast = h => h.toasts[h.toasts.length - 1] || { m: '', c: '' };
const writes = (db, tbl, m) => db.log.filter(x => x.m === m && x.tbl === tbl);
const shipChip = (h, st) => Array.from(h.doc.querySelectorAll('.pk-ship-chip')).find(b => b.getAttribute('data-pk-store') === st) || null;
async function openShip(h) { h.w.pkSub = 'ship'; await h.w.loadPicking(); await ticks(12); }
async function newShipment(h, store, veh, drv) {
  realClick(h.w, shipChip(h, store)); await ticks(2);
  realClick(h.w, $(h, 'pk-ship-new')); await ticks(2);
  if (veh) $(h, 'pk-sh-vehicle').value = veh;
  if (drv) $(h, 'pk-sh-driver').value = drv;
  realClick(h.w, $(h, 'pk-sh-create')); await ticks(6);
}
async function setLoad(h, n, on) { const cb = $(h, 'pk-load-' + uuid(n)); cb.checked = on; fire(h.w, cb, 'change'); await ticks(6); }

(async function run() {

  section('1. Склад: обектите, нов транспорт');
  const db = fakeDb();
  const h = env(VIKTOR, db);
  let sid;
  {
    await openShip(h);
    ok('чипове: Кърджали · 2 за изпращане, Сливен · 1', /Кърджали · 2 за изпращане/.test((shipChip(h, 'Кърджали') || {}).textContent || '') &&
      /Сливен · 1 за изпращане/.test((shipChip(h, 'Сливен') || {}).textContent || ''));
    await newShipment(h, 'Кърджали', 'CA 1234 KT', 'Иван');
    const s = db.shipments[0]; sid = s && s.id;
    ok('POST транспорт: loading, Търговище → Кърджали, превозно, шофьор, създал', s && s.status === 'loading' && s.warehouse === TG && s.store_name === 'Кърджали' &&
      s.vehicle === 'CA 1234 KT' && s.driver === 'Иван' && s.created_by === 'Виктор', JSON.stringify(s));
    ok('картата е отворена; на камиона — само затворените на Кърджали (без отворения и без Сливен)',
      !!$(h, 'pk-ship-card') && !!$(h, 'pk-load-' + uuid(1)) && !!$(h, 'pk-load-' + uuid(2)) && !$(h, 'pk-load-' + uuid(3)) && !$(h, 'pk-load-' + uuid(4)));
  }

  section('2. Тръгна с 0 → отказ; отметка / махане');
  {
    const n0 = writes(db, 'picking_shipments', 'PATCH').length;
    realClick(h.w, $(h, 'pk-depart')); await ticks(6);
    ok('Тръгна с 0 единици → отказ, без PATCH и без известие', /Няма единици/.test(lastToast(h).m) && writes(db, 'picking_shipments', 'PATCH').length === n0 && h.pushes.length === 0 && h.mails.length === 0);
    await setLoad(h, 1, true);
    const p1 = db.pallets.find(p => p.id === uuid(1));
    ok('отметка → shipment_id, loaded_by, loaded_at', p1.shipment_id === sid && p1.loaded_by === 'Виктор' && !!p1.loaded_at);
    await setLoad(h, 1, false);
    ok('махане → NULL', p1.shipment_id === null && p1.loaded_by === null && p1.loaded_at === null);
    await setLoad(h, 1, true); await setLoad(h, 2, true);
    ok('бутонът: „🚚 Тръгна (2)"', /Тръгна \(2\)/.test($(h, 'pk-depart').textContent));
  }

  section('3. Тръгна → departed + 1 push + 1 имейл');
  {
    realClick(h.w, $(h, 'pk-depart')); await ticks(12);
    const s = db.shipments.find(x => x.id === sid);
    ok('departed, departed_by, departed_at', s.status === 'departed' && s.departed_by === 'Виктор' && !!s.departed_at);
    ok('1 push, „2 единици тръгнаха към вас", само до (Кърджали И „Управител Кърджали")', h.pushes.length === 1 && /Пикинг: 2 единици тръгнаха към вас/.test(h.pushes[0].title) &&
      JSON.stringify(h.pushes[0].filters) === JSON.stringify([{ field: 'tag', key: 'store_name', relation: '=', value: 'Кърджали' }, { field: 'tag', key: 'display_name', relation: '=', value: 'Управител Кърджали' }]), JSON.stringify(h.pushes));
    ok('pushToStores (целият обект по таг) — 0 извиквания', h.storePushes.length === 0);
    ok('push-ът не стига до истинския акаунт извън списъка', !JSON.stringify(h.pushes).includes('Зам. Кърджали'));
    const ml = h.mails[0] || {};
    ok('1 имейл САМО до акаунта в пилота (kardzhali@)', h.mails.length === 1 && JSON.stringify(ml.to) === '["kardzhali@temax.bg"]', JSON.stringify(ml.to));
    ok('истинският акаунт извън picking_users (kardzhali2@) НЕ получава писмо', !h.mails.some(m => (m.to || []).indexOf('kardzhali2@temax.bg') >= 0));
    ok('тема „Пикинг — Логистичен склад Търговище → Кърджали, 2 единици"', ml.subject === 'Пикинг — ' + TG + ' → Кърджали, 2 единици', ml.subject);
    ok('тялото: двете единици и артикулите (64694, 103742, 87800) с бройките', /Палет №1/.test(ml.html) && /Насип №1/.test(ml.html) &&
      /64694/.test(ml.html) && /103742/.test(ml.html) && /87800/.test(ml.html) && /data-pk-mail-items/.test(ml.html) && />31 БР</.test(ml.html));
    ok('известието е тръгнало → notified_at, без notify_error', !!s.notified_at && s.notify_error === null);
    ok('без „🔁 Прати пак"', !$(h, 'pk-renotify'));
    ok('тръгнал транспорт — без 🗑 и без отметки', !$(h, 'pk-ship-del') && !$(h, 'pk-load-' + uuid(1)));
  }

  section('4. Паднал имейл → маркер + „Прати пак"; статусът остава departed');
  {
    const d = fakeDb();
    const hf = env(VIKTOR, d, { mailOk: false });
    await openShip(hf);
    await newShipment(hf, 'Кърджали');
    await setLoad(hf, 1, true);
    realClick(hf.w, $(hf, 'pk-depart')); await ticks(12);
    const s = d.shipments[0];
    ok('статусът е departed въпреки падналия имейл', s.status === 'departed');
    ok('notify_error е записан в базата и казва „имейл"', /имейл: smtp refused/.test(s.notify_error || '') && !/push:/.test(s.notify_error || ''), s.notify_error);
    ok('червен toast', /известието НЕ тръгна/.test(lastToast(hf).m) && lastToast(hf).c === RED, lastToast(hf).m);
    ok('маркер в картата и „🔁 Прати пак"', !!$(hf, 'pk-notify-err') && !!$(hf, 'pk-renotify'));
    ok('флаг и в списъка на транспортите', !!hf.doc.querySelector('.pk-notify-flag'));
    hf.mailOk = true;
    realClick(hf.w, $(hf, 'pk-renotify')); await ticks(12);
    ok('„Прати пак" → втори имейл, notify_error = NULL, маркерът изчезва', hf.mails.length === 2 && s.notify_error === null && !!s.notified_at && !$(hf, 'pk-notify-err'));
    const hp = env(VIKTOR, fakeDb(), { pushOk: false });
    await openShip(hp); await newShipment(hp, 'Кърджали'); await setLoad(hp, 1, true);
    realClick(hp.w, $(hp, 'pk-depart')); await ticks(12);
    ok('паднал push → също маркер („push: …")', /push: onesignal down/.test(hp.w.pkShipments[0].notify_error || ''));
    for (const [name, accs] of [['без активен акаунт', []], ['само истински акаунт извън списъка', [{ email: 'kardzhali2@temax.bg', display_name: 'Зам. Кърджали', store_name: 'Кърджали' }]]]) {
      const dn = fakeDb(); dn.accounts = accs;
      const hn = env(VIKTOR, dn);
      await openShip(hn); await newShipment(hn, 'Кърджали'); await setLoad(hn, 1, true);
      realClick(hn.w, $(hn, 'pk-depart')); await ticks(12);
      ok('обект ' + name + ' → нито push, нито имейл', hn.mails.length === 0 && hn.pushes.length === 0 && hn.storePushes.length === 0);
      ok('… НЕ е провал: без notify_error, без „Прати пак"', dn.shipments[0].notify_error === null && !$(hn, 'pk-renotify') && dn.shipments[0].status === 'departed');
      ok('… жълто „няма получател в пилота"', /няма получател в пилота/.test(lastToast(hn).m) && lastToast(hn).c === '#d97706', lastToast(hn).m);
    }
    const du = fakeDb(); du.usersFail = true;
    const hu = env(VIKTOR, du);
    await openShip(hu); await newShipment(hu, 'Кърджали'); await setLoad(hu, 1, true);
    realClick(hu.w, $(hu, 'pk-depart')); await ticks(12);
    ok('паднала заявка за получателите → маркер („получатели: …"), не „няма получател"', /получатели: users down/.test(du.shipments[0].notify_error || '') && !!$(hu, 'pk-renotify'), du.shipments[0].notify_error);
  }

  section('5. 🗑 — само loading, освобождава единиците');
  {
    const d = fakeDb();
    const hd = env(VIKTOR, d);
    await openShip(hd); await newShipment(hd, 'Кърджали'); await setLoad(hd, 1, true);
    realClick(hd.w, $(hd, 'pk-ship-del')); await ticks(8);
    ok('PATCH освобождава единиците + DELETE', writes(d, 'picking_pallets', 'PATCH').some(x => /shipment_id=eq\./.test(x.q) && x.body.shipment_id === null) &&
      writes(d, 'picking_shipments', 'DELETE').length === 1);
    ok('транспортът го няма, палет №1 е свободен', d.shipments.length === 0 && d.pallets.find(p => p.id === uuid(1)).shipment_id === null);
    const n0 = writes(db, 'picking_shipments', 'DELETE').length;
    await h.w.pkDeleteShipment(sid); await ticks(2);
    ok('тръгнал транспорт → отказ, без DELETE', writes(db, 'picking_shipments', 'DELETE').length === n0 && /не се трие/.test(lastToast(h).m));
  }

  section('6. Обект: вижда само своите');
  {
    db.shipments.push({ id: uuid(800), warehouse: TG, store_name: 'Сливен', status: 'departed', departed_at: '2026-10-23T10:00:00Z', created_at: '2026-10-23T09:00:00Z' });
    db.pallets.find(p => p.id === uuid(4)).shipment_id = uuid(800);
    const hk = env(KARDZHALI, db);
    await hk.w.loadPicking(); await ticks(12);
    const cards = Array.from(hk.doc.querySelectorAll('.pk-recv-card')).map(c => c.getAttribute('data-pk-ship'));
    ok('само „🚚 Изпращане", една карта — транспортът към Кърджали', !$(hk, 'pks-collect') && cards.length === 1 && cards[0] === sid, cards.join(','));
    ok('без единицата на Сливен', !hk.doc.querySelector('[data-pk-unit="' + uuid(4) + '"]'));
    ok('без GET към picking_batches / picking_lines по качване', !db.log.some(x => x.m === 'GET' && x.tbl === 'picking_batches'));

    section('7. ⛔ Липсва / ✓ Получен / по артикул');
    realClick(hk.w, $(hk, 'pk-rcv-finish-' + sid)); await ticks(4);
    ok('Приключи с единици без отметка → отказ, без PATCH', /Без отметка/.test(lastToast(hk).m) && db.shipments.find(s => s.id === sid).status === 'departed');
    realClick(hk.w, $(hk, 'pk-rcv-miss-' + uuid(2))); await ticks(2);
    const n0 = writes(db, 'picking_pallets', 'PATCH').length;
    realClick(hk.w, $(hk, 'pk-rcv-miss-save-' + uuid(2))); await ticks(4);
    ok('Липсва без коментар → отказ, без PATCH', writes(db, 'picking_pallets', 'PATCH').length === n0 && lastToast(hk).c === RED);
    $(hk, 'pk-rcv-note-' + uuid(2)).value = 'не е натоварен';
    realClick(hk.w, $(hk, 'pk-rcv-miss-save-' + uuid(2))); await ticks(6);
    const p2 = db.pallets.find(p => p.id === uuid(2));
    ok('Липсва с коментар → missing + receive_note', p2.received_status === 'missing' && p2.receive_note === 'не е натоварен' && p2.received_by === 'Управител Кърджали');
    $(hk, 'pk-rcv-qty-i1').value = '30';
    const n1 = writes(db, 'picking_pallet_items', 'PATCH').length + writes(db, 'picking_pallets', 'PATCH').length;
    realClick(hk.w, $(hk, 'pk-rcv-ok-' + uuid(1))); await ticks(6);
    ok('артикул с различно без коментар → отказ, нищо не се пише', writes(db, 'picking_pallet_items', 'PATCH').length + writes(db, 'picking_pallets', 'PATCH').length === n1 && /напиши коментар/.test(lastToast(hk).m));
    $(hk, 'pk-rcv-cmt-i1').value = 'един скъсан';
    realClick(hk.w, $(hk, 'pk-rcv-ok-' + uuid(1))); await ticks(8);
    const i1 = db.items.find(i => i.id === 'i1'), i2 = db.items.find(i => i.id === 'i2');
    ok('различно → qty_received 30 + коментар; равно → без запис (NULL)', i1.qty_received === 30 && i1.receive_comment === 'един скъсан' && i2.qty_received === null &&
      !writes(db, 'picking_pallet_items', 'PATCH').some(x => /id=eq\.i2/.test(x.q)));
    ok('палет №1 — received', db.pallets.find(p => p.id === uuid(1)).received_status === 'received');
    realClick(hk.w, $(hk, 'pk-rcv-finish-' + sid)); await ticks(6);
    const s = db.shipments.find(x => x.id === sid);
    ok('с отклонения → partial, received_by/at', s.status === 'partial' && s.received_by === 'Управител Кърджали' && !!s.received_at, s.status);
    const dev = $(hk, 'pk-dev-' + sid);
    ok('обектът вижда „⚠️ Отклонения при приемане"', dev && /Липсва 🧱 Насип №1 — не е натоварен/.test(dev.textContent) && /64694 .*изпратено 31, получено 30 — един скъсан/.test(dev.textContent), dev && dev.textContent);
    ok('приключеният транспорт е само за четене', !$(hk, 'pk-rcv-finish-' + sid) && !$(hk, 'pk-rcv-ok-' + uuid(1)));
  }

  section('8. Складът и ЦО виждат отклоненията');
  {
    for (const u of [VIKTOR, TENCHO]) {
      const hw = env(u, db);
      if (u === TENCHO) hw.w.pkWarehouse = TG;
      await openShip(hw);
      realClick(hw.w, $(hw, 'pk-sf-partial')); await ticks(2);
      realClick(hw.w, btn(hw.doc.querySelector('tr[data-pk-ship="' + sid + '"]'), 'Отвори')); await ticks(2);
      const dev = $(hw, 'pk-dev-' + sid);
      ok(u.display_name + ': „⚠️ Отклонения при приемане" в картата', dev && /Липсва/.test(dev.textContent) && /получено 30/.test(dev.textContent));
    }
  }

  section('9. Чисто приемане → received');
  {
    const f = fixture();
    f.shipments.push({ id: uuid(900), warehouse: TG, store_name: 'Кърджали', status: 'departed', departed_at: '2026-10-23T10:00:00Z', created_at: '2026-10-23T09:00:00Z' });
    f.pallets[0].shipment_id = uuid(900);
    const d = fakeDb(f);
    const hk = env(KARDZHALI, d);
    await hk.w.loadPicking(); await ticks(12);
    realClick(hk.w, $(hk, 'pk-rcv-ok-' + uuid(1))); await ticks(8);
    realClick(hk.w, $(hk, 'pk-rcv-finish-' + uuid(900))); await ticks(6);
    ok('всички получени, без различно → received', d.shipments[0].status === 'received');
    ok('без PATCH на артикулите (равно = NULL, нищо за запис)', writes(d, 'picking_pallet_items', 'PATCH').length === 0);
  }

  section('10. Обект извън списъка; #pk= при обекта');
  {
    const d = fakeDb();
    const ht = env(TROYAN, d);
    await ht.w.loadPicking(); await ticks(8);
    ok('Троян (извън списъка): „Нямаш достъп", 0 GET към picking_shipments', !!$(ht, 'pk-noaccess') && !d.log.some(x => x.m === 'GET' && x.tbl === 'picking_shipments'));
    const hk = env(KARDZHALI, db);
    hk.w.pkDeepLinkBoot('#pk=' + uuid(1)); await ticks(14);
    const u = hk.doc.querySelector('.pk-recv-unit[data-pk-unit="' + uuid(1) + '"]');
    ok('#pk= на моя единица → транспортът с подчертана единица', u && /outline:3px solid/.test(u.getAttribute('style') || ''));
    const hk2 = env(KARDZHALI, db);
    hk2.w.pkDeepLinkBoot('#pk=' + uuid(4)); await ticks(14);
    ok('#pk= на чужда единица (Сливен) → червен toast', /не за вашия обект/.test(hk2.toasts.map(t => t.m).join('|')));
  }

  section('11. #pk= при склада с отворен транспорт → „на камиона"');
  {
    const f = fixture();
    f.shipments.push({ id: uuid(950), warehouse: TG, store_name: 'Кърджали', status: 'loading', created_at: '2026-10-23T09:00:00Z' });
    const d = fakeDb(f);
    const hw = env(VIKTOR, d);
    hw.w.pkDeepLinkBoot('#pk=' + uuid(2)); await ticks(16);
    const p2 = d.pallets.find(p => p.id === uuid(2));
    ok('насип №1 е на камиона', p2.shipment_id === uuid(950) && p2.loaded_by === 'Виктор');
    ok('toast „🧱 Насип №1 — на камиона"', hw.toasts.some(t => /Насип №1 — на камиона/.test(t.m)), hw.toasts.map(t => t.m).join('|'));
    ok('отворен е изгледът „Изпращане" с картата на транспорта', $(hw, 'pks-ship').classList.contains('active') && $(hw, 'pk-ship-card').getAttribute('data-pk-ship') === uuid(950));
    const hc = env(VIKTOR, fakeDb());
    hc.w.pkDeepLinkBoot('#pk=' + uuid(1)); await ticks(16);
    ok('без отворен транспорт → „Събиране" (както в част А)', $(hc, 'pks-collect').classList.contains('active'));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
