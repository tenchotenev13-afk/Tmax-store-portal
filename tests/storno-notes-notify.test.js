/* Разлики → „Сторна по грешен прием": „✍️ Счетоводител", етап 2 — известия
   (24.10.2026, решение на Тенчо 23.10: push И имейл, само при натиснат бутон).
   pushToPeople и sendEmail са фалшиви — записват получателите; pushToStores,
   pushToAll и osSend се броят, за да не мине известие по друг път.
     а) ново съобщение до Кърджали → push и имейл до manager и sklad, НЕ до kasa
        и не до неактивен; notified_at записан;
     б) отговор от обекта → до автора (по display_name), не до обекта;
     в) отговор от счетоводител → до обекта, не до самия него; отговор на
        автора на собственото му съобщение → нищо;
     г) автор не е намерен → notify_error, червен знак, „🔁 Прати пак" (само
        за автора на записа и admin); „Прати пак" при успех → notified_at,
        знакът изчезва;
     д) провал на имейла → записът остава, notify_error, без „✅ … изпратено";
     е) зареждане на модула → нула извиквания на push и имейл (правило 14).

   Мутационна проверка (24.10.2026) — exit 1 при всички освен M2:
     M1 касата получава (kasa в SD_NOTE_STORE_ROLES)              → 7 ❌
     M2b отговорилият получава себе си (без self-проверката)      → 2 ❌
     M3 провалът на имейла глътнат                                → 4 ❌
     M4 известие при зареждане (sdLoadStornoNotes)                → 6 ❌
     M5 pushToStores (целият обект) вместо по хора                → 7 ❌
     M6 отговор от обекта отива до обекта, не до автора           → 12 ❌
     M7 „Прати пак" за всички                                     → 1 ❌
     M8 notify_error не се записва                                → 5 ❌
     M2 (махнато „tag === actor" във филтъра) ОЦЕЛЯВА — еквивалентен:
        до обекта пишат само accounting/admin (side ≠ store), а получателите
        са manager/sklad; до автора собственият отговор спира по-рано (M2b).

   Пускане:  node tests/storno-notes-notify.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const ACC = { email: 'acc.kj@temax.bg', display_name: 'Счетоводител Кърджали',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Кърджали'] };
const MGR = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали',
  role: 'manager', store_name: 'Кърджали', assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

const USERS0 = [
  { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true },
  { email: 'sklad.kj@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', active: true },
  { email: 'kasa.kj@temax.bg', display_name: 'Каса Кърджали', role: 'kasa', store_name: 'Кърджали', active: true },
  { email: 'old.kj@temax.bg', display_name: 'Бивш управител', role: 'manager', store_name: 'Кърджали', active: false },
  { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян', active: true },
  { email: 'acc.kj@temax.bg', display_name: 'Счетоводител Кърджали', role: 'accounting', store_name: 'Централен офис', active: true },
  { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', active: true }
];
const NOTE = (o) => Object.assign({ id: 'n-kj', store_name: 'Кърджали', supplier: 'ТЕСИ ООД', document_number: 'ФК-777',
  body: 'ПРОВЕРЕТЕ ФК-777', files: [], status: 'open', report_id: null, created_by: 'Счетоводител Кърджали',
  created_at: '2026-10-23T08:00:00Z', closed_by: null, closed_at: null, notify_error: null, notified_at: null }, o || {});

function env(user, opts) {
  opts = opts || {};
  const users = JSON.parse(JSON.stringify(USERS0));
  const usersFn = url => {
    const q = decodeURIComponent(String(url).split('?')[1] || '');
    let rows = users.slice();
    if (/active=eq\.true/.test(q)) rows = rows.filter(u => u.active);
    const st = /store_name=eq\.([^&]+)/.exec(q); if (st) rows = rows.filter(u => u.store_name === st[1]);
    const dn = /display_name=eq\.([^&]+)/.exec(q); if (dn) rows = rows.filter(u => u.display_name === dn[1]);
    const ro = /role=in\.\(([^)]*)\)/.exec(q); if (ro) { const l = ro[1].split(','); rows = rows.filter(u => l.indexOf(u.role) >= 0); }
    return rows;
  };
  const notes = opts.notes || [NOTE()];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'email.js'],
    user: user, confirm: true, fail: opts.fail,
    data: {
      storno_notes: url => { const m = /store_name=eq\.([^&]+)/.exec(url); return m ? notes.filter(n => n.store_name === decodeURIComponent(m[1])) : notes; },
      storno_note_replies: opts.replies || [],
      differences_reports: [], stock_differences: [], stock_returns: [], transport_orders: [], stock_diff_swaps: [],
      users: usersFn,
      app_settings: [{ key: 'report_excluded_stores', value: JSON.stringify(['Централен офис']) }],
      contacts: [], stores: []
    }
  });
  h.users = users;
  h.pushes = []; h.mails = []; h.other = [];
  h.pushOk = opts.pushOk !== false; h.mailOk = opts.mailOk !== false;
  h.w.pushToPeople = (names, title, msg) => { h.pushes.push({ names: names.slice(), title, msg });
    return Promise.resolve(h.pushOk ? { ok: true, status: 200, data: {} } : { ok: false, status: 502, data: { message: 'onesignal down' } }); };
  h.w.sendEmail = (to, subject, html, extra) => { h.mails.push({ to: to.slice(), subject, html, extra });
    return Promise.resolve(h.mailOk ? { ok: true, status: 200, data: {} } : { ok: false, status: 500, data: { message: 'smtp refused' } }); };
  ['pushToStores', 'pushToAll', 'pushToRole', 'osSend'].forEach(fn => {
    h.w[fn] = function () { h.other.push(fn); return Promise.resolve({ ok: true, status: 200, data: {} }); };
  });
  /* Фалшивият POST връща {} — на живо return=representation дава реда с id,
     а PATCH-ът на notify_error и „Прати пак" са по id. */
  const origPost = h.w.sbPostReturn; let seq = 0;
  h.w.sbPostReturn = (t, d) => origPost(t, d).then(res => {
    if (res && res.ok) res.row = Object.assign({ id: t + '-new-' + (++seq), created_at: '2026-10-24T08:00:00Z' }, res.row || {});
    return res;
  });
  h.w.transportOrders = [];
  h.w.sdView = 'reports';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'wrong_receipt';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.w.loadStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 15)); await ticks(); } };
const mod = h => h.doc.getElementById('mod-stock-diff');
const card = (h, id) => h.doc.getElementById('sd-note-' + id);
const patches = (h, t) => h.calls.patch.filter(p => p.table === t);
const toasts = h => h.calls.toast.join(' | ');
const sorted = a => a.slice().sort().join('|');

async function reply(h, id, text) {
  card(h, id).querySelector('textarea').value = text;
  realClick(h.w, btn(card(h, id), 'Изпрати'));
  await settle();
}

(async function run() {

  section('а) ново съобщение до Кърджали → manager и sklad, не kasa');
  {
    const h = env(ACC, { notes: [] }); await settle();
    realClick(h.w, btn(mod(h), '✍️ Счетоводител')); await settle();
    h.doc.getElementById('sd-note-supplier').value = 'ТЕСИ ООД';
    h.doc.getElementById('sd-note-doc').value = '4600179694';
    h.doc.getElementById('sd-note-body').value = 'Фактурата е за 5 бр., приети 3';
    ok('преди „Запиши" — нищо не е пратено', h.pushes.length === 0 && h.mails.length === 0);
    realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
    ok('POST storno_notes', h.calls.post.some(p => p.table === 'storno_notes'));
    ok('един push', h.pushes.length === 1, JSON.stringify(h.pushes));
    ok('push до управител и склад Кърджали', h.pushes[0] && sorted(h.pushes[0].names) === sorted(['Управител Кърджали', 'Склад Кърджали']), h.pushes[0] && h.pushes[0].names.join('|'));
    ok('push НЕ до касата и неактивния', h.pushes[0] && h.pushes[0].names.indexOf('Каса Кърджали') < 0 && h.pushes[0].names.indexOf('Бивш управител') < 0);
    ok('един имейл', h.mails.length === 1);
    const m = h.mails[0] || { to: [], html: '', extra: {} };
    ok('имейл до manager и sklad', sorted(m.to) === sorted(['kardzhali@temax.bg', 'sklad.kj@temax.bg']), m.to.join('|'));
    ok('имейлът НЕ до касата', m.to.indexOf('kasa.kj@temax.bg') < 0);
    ok('тема „Сторно — Кърджали · ТЕСИ ООД"', m.subject === 'Сторно — Кърджали · ТЕСИ ООД', m.subject);
    ok('писмото: текст, документ, кой пише, линк', m.html.indexOf('Фактурата е за 5 бр., приети 3') >= 0 && m.html.indexOf('4600179694') >= 0 &&
      m.html.indexOf('Счетоводител Кърджали') >= 0 && m.html.indexOf('https://tenchotenev13-afk.github.io/Tmax-store-portal/') >= 0);
    ok('from_name като до доставчик', m.extra && m.extra.from_name === 'Счетоводител Кърджали · ТеМАХ', JSON.stringify(m.extra));
    ok('без телефон в писмото', !/08\d{8}|\+359/.test(m.html));
    ok('нито pushToStores / pushToAll / osSend', h.other.length === 0, h.other.join(','));
    const p = patches(h, 'storno_notes').pop();
    ok('PATCH notified_at, notify_error=null', !!p && !!p.body.notified_at && p.body.notify_error === null, JSON.stringify(p && p.body));
    ok('toast „✅ … изпратено"', /✅ Съобщението е изпратено/.test(toasts(h)), toasts(h));
    ok('без червен знак', !mod(h).querySelector('.sd-note-notify-err'));
    h.close();
  }

  section('а2) без доставчик → тема „без доставчик"');
  {
    const h = env(ACC, { notes: [] }); await settle();
    realClick(h.w, btn(mod(h), '✍️ Счетоводител')); await settle();
    h.doc.getElementById('sd-note-body').value = 'Без доставчик';
    realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
    ok('тема „Сторно — Кърджали · без доставчик"', h.mails[0] && h.mails[0].subject === 'Сторно — Кърджали · без доставчик', h.mails[0] && h.mails[0].subject);
    h.close();
  }

  section('б) отговор от обекта → авторът, не обектът');
  {
    const h = env(MGR); await settle();
    await reply(h, 'n-kj', 'Проверихме, 2 бр. не са дошли');
    ok('POST отговор side store', h.calls.post.some(p => p.table === 'storno_note_replies' && p.body.side === 'store'));
    ok('един push — до автора', h.pushes.length === 1 && h.pushes[0].names.join('|') === 'Счетоводител Кърджали', JSON.stringify(h.pushes));
    ok('имейл до автора', h.mails.length === 1 && h.mails[0].to.join('|') === 'acc.kj@temax.bg', JSON.stringify(h.mails.map(x => x.to)));
    ok('НЕ до обекта', !h.pushes.some(p => p.names.indexOf('Склад Кърджали') >= 0) && !h.mails.some(x => x.to.indexOf('sklad.kj@temax.bg') >= 0));
    ok('Цвети — без копие', !h.pushes.some(p => p.names.indexOf('Цветелина Тенева') >= 0) && !h.mails.some(x => x.to.indexOf('c.teneva@temax.bg') >= 0));
    ok('писмото носи отговора и съобщението', h.mails[0] && h.mails[0].html.indexOf('Проверихме, 2 бр. не са дошли') >= 0 && h.mails[0].html.indexOf('ПРОВЕРЕТЕ ФК-777') >= 0);
    const p = patches(h, 'storno_note_replies').pop();
    ok('PATCH на отговора notified_at', !!p && !!p.body.notified_at && p.body.notify_error === null, JSON.stringify(p && p.body));
    ok('toast „✅ Отговорът е изпратен"', /✅ Отговорът е изпратен/.test(toasts(h)), toasts(h));
    h.close();
  }

  section('в) отговор от счетоводител → обектът, не самият той');
  {
    const h = env(ACC, { notes: [NOTE({ created_by: 'Цветелина Тенева' })] }); await settle();
    await reply(h, 'n-kj', 'Пуснете сторно');
    ok('POST side accounting', h.calls.post.some(p => p.table === 'storno_note_replies' && p.body.side === 'accounting'));
    ok('push до manager и sklad', h.pushes.length === 1 && sorted(h.pushes[0].names) === sorted(['Управител Кърджали', 'Склад Кърджали']), JSON.stringify(h.pushes));
    ok('не до самия него, не до касата, не до автора', !h.pushes.some(p => /Счетоводител Кърджали|Каса|Цветелина/.test(p.names.join('|'))));
    ok('имейл до обекта', h.mails.length === 1 && sorted(h.mails[0].to) === sorted(['kardzhali@temax.bg', 'sklad.kj@temax.bg']));
    h.close();
  }
  {
    /* Авторът отговаря на собственото си съобщение (заварен случай: обектът
       е написал съобщението) — нищо не тръгва, няма и грешка. */
    const h = env(MGR, { notes: [NOTE({ created_by: 'Управител Кърджали' })] }); await settle();
    await reply(h, 'n-kj', 'Сам на себе си');
    ok('собствен отговор → нула push', h.pushes.length === 0, JSON.stringify(h.pushes));
    ok('собствен отговор → нула имейл', h.mails.length === 0);
    ok('собствен отговор → без notify_error', !patches(h, 'storno_note_replies').some(p => p.body.notify_error));
    ok('собствен отговор → „✅ Отговорът е записан"', /✅ Отговорът е записан/.test(toasts(h)), toasts(h));
  }

  section('г) авторът не е намерен → notify_error, знак, „🔁 Прати пак"');
  {
    const h = env(MGR, { notes: [NOTE({ created_by: 'Напуснал счетоводител' })] }); await settle();
    await reply(h, 'n-kj', 'Отговор към напуснал');
    ok('отговорът е записан (POST)', h.calls.post.some(p => p.table === 'storno_note_replies'));
    ok('нула push и имейл', h.pushes.length === 0 && h.mails.length === 0);
    const p = patches(h, 'storno_note_replies').pop();
    ok('PATCH notify_error „не е намерен"', !!p && /не е намерен/.test(p.body.notify_error || ''), JSON.stringify(p && p.body));
    ok('червен toast', h.calls.toast.some(t => /НЕ тръгна/.test(t)), toasts(h));
    ok('без „✅"', !h.calls.toast.some(t => /✅/.test(t)), toasts(h));
    const flag = card(h, 'n-kj').querySelector('.sd-note-notify-err');
    ok('червен знак „⚠️ Известието не тръгна"', !!flag && /Известието не тръгна/.test(flag.textContent));
    const again = flag && btn(flag, '🔁 Прати пак');
    ok('„🔁 Прати пак" за автора на отговора', !!again);
    if (again) {
      h.users.push({ email: 'gone@temax.bg', display_name: 'Напуснал счетоводител', role: 'accounting', store_name: 'Централен офис', active: true });
      realClick(h.w, again); await settle();
      ok('Прати пак → push до автора', h.pushes.length === 1 && h.pushes[0].names.join('|') === 'Напуснал счетоводител', JSON.stringify(h.pushes));
      ok('Прати пак → имейл', h.mails.length === 1 && h.mails[0].to.join('|') === 'gone@temax.bg');
      const p2 = patches(h, 'storno_note_replies').pop();
      ok('Прати пак → notified_at, notify_error=null', !!p2 && !!p2.body.notified_at && p2.body.notify_error === null, JSON.stringify(p2 && p2.body));
      ok('знакът изчезва', !card(h, 'n-kj').querySelector('.sd-note-notify-err'));
      ok('toast „✅ Известието е изпратено"', /✅ Известието е изпратено/.test(toasts(h)), toasts(h));
    }
    h.close();
  }
  {
    /* Знакът от базата: счетоводителят го вижда, но не е автор на отговора и
       не е admin → без бутон. Цвети (admin) → с бутон. */
    const R = [{ id: 'rp-err', note_id: 'n-kj', body: 'X', files: [], side: 'store', created_by: 'Управител Кърджали',
      created_at: '2026-10-23T09:00:00Z', notify_error: 'push: onesignal down', notified_at: null }];
    const a = env(ACC, { replies: R }); await settle();
    const fa = card(a, 'n-kj').querySelector('.sd-note-notify-err');
    ok('счетоводител: вижда знака', !!fa);
    ok('счетоводител (не автор): без „Прати пак"', !!fa && !btn(fa, '🔁 Прати пак'));
    a.close();
    const c = env(CVETI, { replies: R }); await settle();
    const fc = card(c, 'n-kj').querySelector('.sd-note-notify-err');
    ok('Цвети: „Прати пак" има', !!fc && !!btn(fc, '🔁 Прати пак'));
    c.close();
  }

  section('д) провал на имейла → записът остава, notify_error, без „✅ … изпратено"');
  {
    const h = env(ACC, { notes: [], mailOk: false }); await settle();
    realClick(h.w, btn(mod(h), '✍️ Счетоводител')); await settle();
    h.doc.getElementById('sd-note-body').value = 'Имейлът ще падне';
    realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
    ok('POST storno_notes', h.calls.post.some(p => p.table === 'storno_notes'));
    ok('съобщението е в списъка', mod(h).textContent.indexOf('Имейлът ще падне') >= 0);
    ok('без DELETE', h.calls.del.length === 0);
    const p = patches(h, 'storno_notes').pop();
    ok('PATCH notify_error с „имейл: smtp refused"', !!p && /имейл: smtp refused/.test(p.body.notify_error || '') && !p.body.notified_at, JSON.stringify(p && p.body));
    ok('червен toast', h.calls.toast.some(t => /НЕ тръгна.*smtp refused/.test(t)), toasts(h));
    ok('без „✅ … изпратено"', !h.calls.toast.some(t => /✅.*изпратен/.test(t)), toasts(h));
    const flag = mod(h).querySelector('.sd-note-notify-err');
    ok('червен знак на картата + „Прати пак" за автора', !!flag && !!btn(flag, '🔁 Прати пак'));
    h.close();
  }

  section('е) зареждане на модула → нула известия (правило 14)');
  for (const u of [ACC, MGR, CVETI]) {
    const R = [{ id: 'rp-1', note_id: 'n-kj', body: 'X', files: [], side: 'store', created_by: 'Управител Кърджали',
      created_at: '2026-10-23T09:00:00Z', notify_error: 'push: x', notified_at: null }];
    const h = env(u, { notes: [NOTE({ notify_error: 'имейл: x' })], replies: R }); await settle();
    h.w.loadStockDiff(); await settle();
    ok(u.display_name + ': картата е заредена', !!card(h, 'n-kj'));
    ok(u.display_name + ': нула push / имейл / друг push', h.pushes.length === 0 && h.mails.length === 0 && h.other.length === 0,
      JSON.stringify({ p: h.pushes.length, m: h.mails.length, o: h.other }));
    ok(u.display_name + ': нула PATCH по notify', patches(h, 'storno_notes').length === 0 && patches(h, 'storno_note_replies').length === 0);
    h.close();
  }

  report();
})();
