/* Работен график, пакет 2А — „✅ Днес“ (дневна присъствена), екранът в grafik.js.
   grafik-api е подменена с фалшив сървър в паметта: формата на отговорите е като на
   handler.ts (daily_get / daily_save / daily_resolve); правилата — прозорец, права,
   отклонение → „Промени“ — са заковани в supabase/functions/grafik-api/handler.test.ts.
   Тук: какво вижда човекът, истинските кликове и какво точно тръгва към сървъра.
   node tests/grafik-daily.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const MGR = { id: 'u-mgr', email: 'tencho.tenev13@gmail.com', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const ADM = { id: 'u-adm', email: 'ten.tenev@temax.bg', display_name: 'Тенчо', role: 'admin', store_name: 'Централен офис' };

const PEOPLE = () => [
  { staff_id: 's1', name: 'Иван Иванов', short_name: 'ИВАН', position: 'Каса', sector: 'Каса', sector_order: 10, hpd: 8, planned_letter: 'П', planned_code: 'Д1/З', planned_legend: 'от 08:00 до 17:00 часа – 8 часа', on_shift: true, change: null, mark: null },
  { staff_id: 's2', name: 'Мария Петрова', short_name: 'МАРИЯ', position: 'Склад', sector: 'Склад', sector_order: 20, hpd: 8, planned_letter: 'ЗД', planned_code: 'Д4/З', planned_legend: null, on_shift: true, change: null, mark: null },
  { staff_id: 's3', name: "Петя О'Нийл", short_name: 'ПЕТЯ', position: 'Каса', sector: 'Каса', sector_order: 10, hpd: 8, planned_letter: '', planned_code: '', planned_legend: null, on_shift: false, change: null, mark: null },
  { staff_id: 's4', name: 'Стоян Стоянов', short_name: 'СТОЯН', position: 'ОТЗ', sector: 'Без сектор', sector_order: 100000, hpd: 8, planned_letter: 'О', planned_code: 'О', planned_legend: null, on_shift: false, change: null, mark: null }
];

function makeServer(opt) {
  opt = opt || {};
  const S = { calls: [], fail: opt.fail || {}, people: opt.people || PEOPLE(), daily: opt.daily || null };
  S.view = (date) => Object.assign({
    store: 'Кърджали', month: '2026-11-01', date: date || '2026-11-27', today: '2026-11-27', status: 'submitted', filed: true,
    min_date: '2026-11-25', max_date: '2026-11-27', window_from: '2026-11-25', back_days: 2,
    daily: S.daily, people: S.people, missing: [], can_mark: true, needs_reason: false, late: (date || '2026-11-27') < '2026-11-27', can_resolve: true,
    trip_stores: ['Шумен', 'Раднево']
  }, opt.view || {});
  S.handle = (u, b) => {
    S.calls.push(b);
    if (S.fail[b.action]) { const fr = S.fail[b.action](b); if (fr) return fr; }
    switch (b.action) {
      case 'me': {
        const kind = u.role === 'admin' ? 'admin' : 'manager';
        return { status: 200, body: { ok: true, kind, can_admin: kind === 'admin', name: u.display_name, email: u.email, unlocked: true, pin: { state: 'set' },
          stores: [{ name: 'Кърджали', can_edit: true, in_scope: true }].concat(kind === 'admin' ? [{ name: 'Шумен', can_edit: true, in_scope: true }] : []) } };
      }
      case 'daily_get': return { status: 200, body: Object.assign({ ok: true }, S.view(b.date)) };
      case 'daily_save': {
        S.daily = { marked_by: u.email, marked_by_name: u.display_name, marked_at: '2026-11-27T06:42:00.000Z', late: false };
        // Като handler.ts: отклонението → ред в „Промени“ (source daily); дошъл / не е на смяна / неуточнено → без ред.
        S.people = S.people.map(p => {
          const m = b.marks.filter(x => x.staff_id === p.staff_id)[0];
          const dev = m && m.actual && ['absent', 'other_shift', 'extra', 'trip'].indexOf(m.state) >= 0;
          return Object.assign({}, p, { mark: m ? { state: m.state, actual: m.actual || null, trip_store: m.trip_store || null, note: m.note || null } : null,
            change: dev ? { id: 'c-' + p.staff_id, actual: m.actual, trip_store: m.trip_store || null, source: 'daily' } : null });
        });
        return { status: 200, body: Object.assign({ ok: true }, S.view(b.date)) };
      }
      case 'daily_resolve': {
        S.people = S.people.map(p => p.staff_id === b.staff_id ? Object.assign({}, p, { mark: { state: 'absent', actual: b.actual, trip_store: null, note: b.note || null }, change: { id: 'c-r', actual: b.actual, source: 'daily' } }) : p);
        return { status: 200, body: Object.assign({ ok: true }, S.view(b.date)) };
      }
      case 'load_month': return { status: 500, body: { ok: false, reason: 'internal', message: 'не е нужен за „Днес“' } };
      default: return { status: 400, body: { ok: false, reason: 'bad_request', message: 'непознато: ' + b.action } };
    }
  };
  return S;
}
function env(user, opt) {
  opt = opt || {};
  const S = makeServer(opt);
  const h = boot({ modules: ['grafik-engine.js', 'grafik.js'], user, data: {}, confirm: opt.confirm === undefined ? true : opt.confirm, globals: { currentSession: 'sess.sig' } });
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/grafik-api') >= 0) {
      const r = S.handle(user, JSON.parse(init.body));
      return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body) });
    }
    return orig.apply(this, arguments);
  };
  h.w.matchMedia = q => ({ matches: !!opt.mobile && /max-width:\s*767px/.test(q) });
  h.w.grMonth = '2026-11';
  h.S = S;
  return h;
}
const acts = h => h.S.calls.map(c => c.action);
const lastOf = (h, a) => h.S.calls.filter(c => c.action === a).slice(-1)[0];
const row = (h, id) => h.doc.getElementById('gr-att-' + id);
const nm = (h, id) => row(h, id).querySelector('.gr-att-name');
const chip = (h, id) => { const r = row(h, id); const c = r && r.querySelector('.gr-att-chip'); return c ? c.textContent.trim() : null; };
const pickRadio = (h, val) => { const r = h.doc.querySelector('#gr-att-modal input[name="gr-att-st"][value="' + val + '"]'); r.checked = true; h.doc.querySelectorAll('#gr-att-modal input[name="gr-att-st"]').forEach(x => { if (x !== r) x.checked = false; }); };
async function load(h) { await guard('loadGrafik() не хвърля', () => h.w.loadGrafik()); await ticks(6); }

(async () => {
  section('1. Телефон, управител: започва от „✅ Днес“, тегли само деня');
  const h = env(MGR, { mobile: true });
  await load(h);
  const d = h.doc, W = h.w;
  ok('изгледът е „att“ и бутонът „✅ Днес“ е активен', W.grView === 'att' && d.getElementById('gr-att-tab').classList.contains('active'));
  ok('заявките: me → daily_get (без load_month)', JSON.stringify(acts(h)) === JSON.stringify(['me', 'daily_get']), acts(h).join(','));
  ok('daily_get е за обекта и месеца, без дата (сървърът избира днес)', lastOf(h, 'daily_get').store === 'Кърджали' && lastOf(h, 'daily_get').month === '2026-11' && lastOf(h, 'daily_get').date === '');
  ok('„Денят още не е отбелязан“', /още не е отбелязан/.test(d.getElementById('gr-att-who').textContent));
  ok('на смяна — 2, по сектори Каса и Склад', /На смяна по график — 2/.test(d.getElementById('gr-att-on').textContent) &&
    Array.from(d.querySelectorAll('#gr-att-on .gr-att-sec')).map(x => x.getAttribute('data-sector')).join('|') === 'Каса|Склад');
  ok('смяната по график с часа: „П от 08:00 до 17:00…“', /П\s*от 08:00 до 17:00/.test(row(h, 's1').textContent), row(h, 's1').textContent);
  ok('по подразбиране — „✓ дошъл“ за хората на смяна', chip(h, 's1') === '✓ дошъл' && chip(h, 's2') === '✓ дошъл');
  ok('не са на смяна — 2, сгънато; Стоян показва буквата „О“', !d.getElementById('gr-att-off').open && /Не са на смяна — 2/.test(d.getElementById('gr-att-off').textContent) && chip(h, 's4') === 'О');
  ok('бутонът — „✓ Всички дошли — запиши“', d.getElementById('gr-att-save').textContent === '✓ Всички дошли — запиши');
  ok('датите — от 25.11 до днес (прозорецът на обекта)', Array.from(d.getElementById('gr-att-date').options).map(o => o.value).join(',') === '2026-11-25,2026-11-26,2026-11-27' &&
    /днес/.test(d.getElementById('gr-att-date').selectedOptions[0].textContent));

  section('2. „✓ Всички дошли — запиши“ — едно натискане');
  realClick(W, d.getElementById('gr-att-save')); await ticks(4);
  const s1 = lastOf(h, 'daily_save');
  ok('daily_save — всички хора: на смяна present, другите off, без actual', !!s1 && JSON.stringify(s1.marks) === JSON.stringify([
    { staff_id: 's1', state: 'present' }, { staff_id: 's2', state: 'present' }, { staff_id: 's3', state: 'off' }, { staff_id: 's4', state: 'off' }]), s1 && JSON.stringify(s1.marks));
  ok('…за деня, обекта и месеца; без основание', s1.date === '2026-11-27' && s1.store === 'Кърджали' && s1.month === '2026-11' && s1.correct_reason === undefined);
  ok('след записа: „✔ Отбелязано от Управител Кърджали“ + съобщение', /Отбелязано от Управител Кърджали/.test(d.getElementById('gr-att-who').textContent) && h.calls.toast.indexOf('Денят е отбелязан.') >= 0);

  section('3. Отклонение: клик на името → модал → „Готово“ → „Запиши — N липсват“');
  realClick(W, nm(h, 's1')); await ticks(1);
  ok('модалът за Иван — опциите за човек на смяна', !!d.getElementById('gr-att-modal') && ['present', 'absent', 'unknown', 'other_shift', 'trip'].every(v => !!d.querySelector('#gr-att-modal input[value="' + v + '"]')) &&
    !d.querySelector('#gr-att-modal input[value="extra"]'));
  ok('„Друга смяна“ не предлага смяната по график (П)', Array.from(d.getElementById('gr-att-shift').options).map(o => o.value).indexOf('П') < 0);
  pickRadio(h, 'absent'); W.grAttOptShow();
  ok('причината се вижда само при „Не е дошъл“', d.getElementById('gr-att-abs').style.display === '' && d.getElementById('gr-att-trip').style.display === 'none');
  d.getElementById('gr-att-abs').value = 'Б'; d.getElementById('gr-att-note').value = 'лист 12';
  realClick(W, d.getElementById('gr-att-ok')); await ticks(1);
  ok('Иван — „✕ Б — болничен“, редът е маркиран като незаписан', chip(h, 's1') === '✕ Б — болничен' && row(h, 's1').getAttribute('data-dirty') === '1' && /border-left:4px/.test(row(h, 's1').getAttribute('style')));
  ok('бутонът — „Запиши — 1 липсва“ и „Откажи“', d.getElementById('gr-att-save').textContent === 'Запиши — 1 липсва' && !!btn(d.getElementById('gr-att-save-box'), 'Откажи'));
  realClick(W, nm(h, 's3')); await ticks(1);
  ok("Петя О'Нийл (апостроф) — модалът се отваря; опциите за човек без смяна", /Петя О'Нийл/.test(d.querySelector('#gr-att-modal h3').textContent) &&
    !!d.querySelector('#gr-att-modal input[value="extra"]') && !d.querySelector('#gr-att-modal input[value="present"]'));
  pickRadio(h, 'trip'); d.getElementById('gr-att-trip').value = '';
  realClick(W, d.getElementById('gr-att-ok')); await ticks(1);
  ok('К без обект → съобщение, модалът остава', h.calls.toast.slice(-1)[0] === 'Избери обекта на командировката.' && d.getElementById('gr-att-modal').classList.contains('open'));
  pickRadio(h, 'extra'); d.getElementById('gr-att-shift').value = 'ЗД';
  realClick(W, d.getElementById('gr-att-ok')); await ticks(1);
  ok('Петя — „+ ЗД (без смяна)“; „Не са на смяна“ се разгъва с броя', chip(h, 's3') === '+ ЗД (без смяна)' && d.getElementById('gr-att-off').open && /дошли \/ отклонения: 1/.test(d.getElementById('gr-att-off').textContent));
  realClick(W, nm(h, 's2')); await ticks(1);
  pickRadio(h, 'trip'); d.getElementById('gr-att-trip').value = 'Шумен';
  realClick(W, d.getElementById('gr-att-ok')); await ticks(1);
  ok('Мария — „К → Шумен“; „Запиши — 2 липсват“ (Петя дошла без смяна не е „липсва“)', chip(h, 's2') === 'К → Шумен' && d.getElementById('gr-att-save').textContent === 'Запиши — 2 липсват', d.getElementById('gr-att-save').textContent);
  realClick(W, d.getElementById('gr-att-save')); await ticks(4);
  const s2 = lastOf(h, 'daily_save');
  ok('daily_save носи отклоненията точно', JSON.stringify(s2.marks) === JSON.stringify([
    { staff_id: 's1', state: 'absent', actual: 'Б', note: 'лист 12' }, { staff_id: 's2', state: 'trip', actual: 'К', trip_store: 'Шумен' },
    { staff_id: 's3', state: 'extra', actual: 'ЗД' }, { staff_id: 's4', state: 'off' }]), JSON.stringify(s2.marks));
  ok('след записа — от сървъра, без незаписани', Object.keys(W.grAttEdit).length === 0 && chip(h, 's1') === '✕ Б — болничен' && !row(h, 's1').hasAttribute('data-dirty'));
  // Обратно към „дошъл“ — същото като на сървъра → не е незаписано.
  realClick(W, nm(h, 's1')); await ticks(1);
  realClick(W, d.getElementById('gr-att-ok')); await ticks(1);
  ok('„Готово“ без промяна → няма незаписано', Object.keys(W.grAttEdit).length === 0);

  section('4. Грешка при запис — отметките остават, бутонът пак е активен');
  {
    const e = env(MGR, { mobile: true, fail: { daily_save: () => ({ status: 409, body: { ok: false, reason: 'daily_locked', message: 'Обектът отбелязва и променя само днес и 2 дни назад (25.11–27.11).' } }) } });
    await load(e);
    realClick(e.w, nm(e, 's1')); await ticks(1);
    pickRadio(e, 'unknown');
    realClick(e.w, e.doc.getElementById('gr-att-ok')); await ticks(1);
    ok('„? не е дошъл — неуточнено“', chip(e, 's1') === '? не е дошъл — неуточнено');
    realClick(e.w, e.doc.getElementById('gr-att-save')); await ticks(4);
    ok('съобщението на сървъра', /Не е записано: Обектът отбелязва и променя само днес и 2 дни назад/.test(e.calls.toast.slice(-1)[0]));
    ok('незаписаното остава, бутонът е активен', e.w.grAttEdit.s1 && e.w.grAttEdit.s1.state === 'unknown' && !e.doc.getElementById('gr-att-save').disabled);
    ok('unknown не носи actual', JSON.stringify(lastOf(e, 'daily_save').marks[0]) === JSON.stringify({ staff_id: 's1', state: 'unknown' }));
  }

  section('5. Смяна на деня с незаписано: отказ → остава; потвърждение → другия ден');
  {
    const e = env(MGR, { mobile: true, confirm: false });
    await load(e);
    realClick(e.w, nm(e, 's1')); await ticks(1); pickRadio(e, 'unknown'); realClick(e.w, e.doc.getElementById('gr-att-ok')); await ticks(1);
    const n0 = e.S.calls.length;
    realClick(e.w, e.doc.querySelector('#gr-att-head button[onclick="grAttGo(-1)"]')); await ticks(3);
    ok('отказано изоставяне — без заявка, отметката е тук', e.S.calls.length === n0 && e.w.grAttEdit.s1 && e.calls.confirm.length === 1);
    e.w.grAttEdit = {};
    realClick(e.w, e.doc.querySelector('#gr-att-head button[onclick="grAttGo(-1)"]')); await ticks(3);
    ok('◀ → daily_get за 26.11', lastOf(e, 'daily_get').date === '2026-11-26' && e.doc.getElementById('gr-att-date').value === '2026-11-26');
    ok('минал ден, още неотбелязан → „ще бъде записан като „късно““', /късно/.test(e.doc.getElementById('gr-att-save-box').textContent));
  }

  section('6. Заключен ден (извън прозореца): само преглед; „Уточни“ за неуточнено');
  {
    const ppl = PEOPLE(); ppl[0].mark = { state: 'unknown', actual: null, trip_store: null, note: 'не вдига' };
    ppl[1].change = { id: 'c1', actual: 'Б', source: 'manual', trip_store: null };   // въведено в „✎ Промени“, без отметка
    // Отметката казва „не е на смяна“, но регионалният после е сменил деня в „✎ Промени“ на Б → истината е промяната.
    ppl[3].mark = { state: 'off', actual: null, trip_store: null, note: null }; ppl[3].change = { id: 'c4', actual: 'Б', source: 'manual', trip_store: null };
    const e = env(MGR, { mobile: true, people: ppl, daily: { marked_by: 'x', marked_by_name: 'Друг', marked_at: '2026-11-20T06:00:00Z', late: true, corrected_at: '2026-11-21T08:00:00Z', corrected_by_name: 'Регионален', correct_reason: 'болничен донесен' },
      view: { date: '2026-11-20', can_mark: false, needs_reason: false } });
    await load(e);
    const ed = e.doc;
    ok('без „Запиши“; името не се клика, няма ✓ / ✕', !ed.getElementById('gr-att-save') && !nm(e, 's2').getAttribute('onclick') && !row(e, 's2').querySelector('.gr-att-yn'));
    ok('съобщението „заключен за обекта… регионалният“', /заключен за обекта/.test(ed.getElementById('gr-att-locked').textContent));
    ok('„късно“ и корекцията с основанието', !!ed.querySelector('.gr-att-late') && /Корекция от Регионален.*болничен донесен/.test(ed.getElementById('gr-att-corr').textContent));
    ok('промяна от „✎ Промени“ без отметка → показва се (✕ Б)', chip(e, 's2') === '✕ Б — болничен');
    ok('остаряла отметка („почива“), а промяната е Б → показва Б', chip(e, 's4') === '✕ Б — болничен', chip(e, 's4'));
    ok('неуточнено с бележка + „Уточни“', chip(e, 's1') === '? не е дошъл — неуточнено' && /не вдига/.test(row(e, 's1').textContent) && !!row(e, 's1').querySelector('.gr-att-resolve'));
    realClick(e.w, row(e, 's1').querySelector('.gr-att-resolve')); await ticks(1);
    ed.getElementById('gr-att-res-abs').value = 'О'; ed.getElementById('gr-att-res-note').value = 'молба 7';
    realClick(e.w, ed.getElementById('gr-att-res-ok')); await ticks(4);
    const rs = lastOf(e, 'daily_resolve');
    ok('daily_resolve: ден, човек, причина, бележка', !!rs && rs.date === '2026-11-20' && rs.staff_id === 's1' && rs.actual === 'О' && rs.note === 'молба 7', JSON.stringify(rs));
    ok('след уточняването — „✕ О — платен отпуск“, без „Уточни“', chip(e, 's1') === '✕ О — платен отпуск' && !row(e, 's1').querySelector('.gr-att-resolve'));
  }

  section('7. Корекция от офиса извън прозореца — основанието е задължително');
  {
    const e = env(ADM, { view: { date: '2026-11-20', needs_reason: true, min_date: '2026-11-01' } });
    await load(e);
    realClick(e.w, e.doc.getElementById('gr-att-tab')); await ticks(4);
    ok('admin от компютъра: „✅ Днес“ от лентата → daily_get', W !== e.w && lastOf(e, 'daily_get') && e.w.grView === 'att');
    ok('полето „Основание за корекцията *“', !!e.doc.getElementById('gr-att-reason'));
    realClick(e.w, e.doc.getElementById('gr-att-save')); await ticks(2);
    ok('без основание → съобщение, без заявка', e.calls.toast.slice(-1)[0] === 'Напиши основание за корекцията.' && !lastOf(e, 'daily_save'));
    e.doc.getElementById('gr-att-reason').value = 'болничен донесен на 21.11';
    realClick(e.w, e.doc.getElementById('gr-att-save')); await ticks(4);
    ok('daily_save носи correct_reason', lastOf(e, 'daily_save') && lastOf(e, 'daily_save').correct_reason === 'болничен донесен на 21.11');
    e.w.grPickStore('Шумен'); await ticks(4);
    ok('друг обект от „Днес“ → daily_get за Шумен (без load_month)', lastOf(e, 'daily_get').store === 'Шумен' && acts(e).indexOf('load_month') === acts(e).lastIndexOf('load_month'));
  }

  section('8. Неподаден месец; хора извън снимката');
  {
    const e = env(MGR, { mobile: true, view: { filed: false, status: 'draft', people: [] } });
    await load(e);
    ok('чернова → „Дневната присъствена се води по подаден график… е чернова“', /по подаден график.*е чернова/.test(e.doc.getElementById('gr-att-draft').textContent));
    const m = env(MGR, { mobile: true, view: { missing: ['Нов Човек', "Д'Артанян"] } });
    await load(m);
    ok('решение 4: имената и какво да се направи', /Нов Човек, Д'Артанян/.test(m.doc.getElementById('gr-att-missing').textContent) && /връща графика в чернова/.test(m.doc.getElementById('gr-att-missing').textContent));
  }

  section('9. „✎ Промени“: баджът „📱 дневна“');
  {
    const e = env(MGR, { mobile: false });
    await load(e);
    const W2 = e.w;
    W2.grData = { store: 'Кърджали', month: '2026-11-01', status: 'submitted', month_row: { snapshot: { rows: [{ staff_id: 's1', full_name: 'Иван Иванов', codes: [] }] } }, setup: {} };
    W2.grCalc = { month: { month: 11, dow: new Array(30).fill(1) }, rows: [] };
    W2.grChanges = [{ id: 'c1', staff_id: 's1', day: 3, planned_letter: 'П', planned_code: 'Д1/З', actual: 'Б', reason: 'Дневна присъствена — болничен', source: 'daily', trz_done: false },
                    { id: 'c2', staff_id: 's1', day: 4, planned_letter: 'П', planned_code: 'Д1/З', actual: 'О', reason: 'молба', source: 'manual', trz_done: false }];
    let html = '';
    guard('grChangesHtml() не хвърля', () => { html = W2.grChangesHtml(); });
    const box = e.doc.createElement('div'); box.innerHTML = html;
    ok('баджът е само на реда от „Днес“', !!box.querySelector('#gr-ch-c1 .gr-ch-src') && !box.querySelector('#gr-ch-c2 .gr-ch-src') && /📱 дневна/.test(box.querySelector('#gr-ch-c1').textContent));
  }

  section('10. „✎ Промени“ за обекта (решение 2): прозорецът в браузъра');
  {
    const e = env(MGR, { mobile: false });
    await load(e);
    const W2 = e.w, now = new Date(), p2 = n => (n < 10 ? '0' : '') + n;
    const ym = (y, m) => y + '-' + p2(m + 1);
    W2.grMonth = ym(now.getFullYear(), now.getMonth());
    ok('днес — в прозореца', W2.grChInWin(now.getDate()) === true);
    // Решение на Тенчо 28.11: бъдещ ден — да (планиран отпуск).
    if (now.getDate() < 28) ok('утре и след седмица — да (бъдещите дни са отворени)', W2.grChInWin(now.getDate() + 1) === true && (now.getDate() > 21 || W2.grChInWin(now.getDate() + 7) === true));
    else ok('утре — (пропуснато в края на месеца)', true);
    const nxt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    W2.grMonth = ym(nxt.getFullYear(), nxt.getMonth());
    ok('следващият месец — отворен за обекта', W2.grChInWin(15) === true);
    W2.grMonth = ym(now.getFullYear(), now.getMonth());
    if (now.getDate() > 3) ok('3 дни назад — не; 2 дни назад — да', W2.grChInWin(now.getDate() - 3) === false && W2.grChInWin(now.getDate() - 2) === true);
    else ok('3 дни назад — (пропуснато в началото на месеца)', true);
    const old = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    W2.grMonth = ym(old.getFullYear(), old.getMonth());
    ok('отпреди два месеца — не за обекта', W2.grChInWin(10) === false);
    W2.grMe.kind = 'regional';
    ok('регионалният — без прозорец', W2.grChInWin(10) === true);
    W2.grMe.kind = 'manager';
    // Формулярът на обекта за стар месец.
    W2.grData = { store: 'Кърджали', month: W2.grMonth + '-01', status: 'submitted', month_row: { snapshot: { rows: [{ staff_id: 's1', full_name: 'Иван Иванов', codes: new Array(30).fill('') }] } }, setup: {} };
    W2.grCalc = { month: { month: old.getMonth() + 1, days: 30, dow: new Array(30).fill(1) }, rows: [] };
    W2.grChanges = [{ id: 'c1', staff_id: 's1', day: 10, planned_letter: '', planned_code: '', actual: 'Б', reason: 'болничен', source: 'daily', trz_done: false }];
    W2.grRows = {};
    const box = e.doc.createElement('div'); box.innerHTML = W2.grChangesHtml();
    const tr = box.querySelector('#gr-ch-c1');
    ok('стар ред: ✏️ — да (с подсказка), ✕ — не', !!btn(tr, '✏️') && /само основанието/.test(btn(tr, '✏️').getAttribute('title')) && !btn(tr, '✕'));
    W2.grChOpen('c1');
    const md = e.doc.getElementById('gr-ch-modal');
    ok('✏️ на стар ред: бележка, датата / служителят / „реално“ — заключени', !!e.doc.getElementById('gr-ch-lock') && ['gr-ch-day', 'gr-ch-staff', 'gr-ch-actual', 'gr-ch-trip'].every(id => e.doc.getElementById(id).disabled) && !e.doc.getElementById('gr-ch-reason').disabled);
    md.parentNode.removeChild(md);
    W2.grChOpen('');
    ok('„➕ Промяна“ за стар месец → съобщение, без формуляр', !e.doc.getElementById('gr-ch-modal') && /от днес − 2 дни нататък/.test(e.calls.toast.slice(-1)[0]));
  }

  section('11. Ред с ✓ / ✕, бързи причини, брояч, залепен бутон „Записано ✓“ (28.11.2026)');
  {
    const e = env(MGR, { mobile: true });
    await load(e);
    const ed = e.doc, EW = e.w;
    const yes = id => row(e, id).querySelector('.gr-att-yes'), no = id => row(e, id).querySelector('.gr-att-no');
    const q = (id, r) => row(e, id).querySelector('.gr-att-why button[data-r="' + r + '"]');
    const cnt = () => ed.getElementById('gr-att-count').textContent.trim();
    const save = () => ed.getElementById('gr-att-save');
    ok('на смяна: ✓ избран по график, ✕ не', yes('s1').classList.contains('gr-att-on') && !no('s1').classList.contains('gr-att-on') && !row(e, 's1').querySelector('.gr-att-why'));
    ok('не на смяна: без ✓ / ✕ (сървърът не приема „?“ / „дошъл“ за тях)', !row(e, 's3').querySelector('.gr-att-yn') && !row(e, 's4').querySelector('.gr-att-yn'));
    ok('брояч „2 на смяна · 0 липсват“', cnt() === '2 на смяна · 0 липсват', cnt());
    ok('бутонът залепен за долния край (sticky, bottom:0)', /position:sticky;bottom:0/.test(ed.getElementById('gr-att-save-box').getAttribute('style')));
    ok('CSS: бутоните (.gr-att-b) и навигацията — поне 44 px', /\.gr-att-b\{[^}]*min-height:44px;min-width:44px/.test(EW.GR_ATT_CSS) && /\.gr-att-nav\{min-height:44px;min-width:44px/.test(EW.GR_ATT_CSS) &&
      !!ed.getElementById('gr-att-css'));
    // Видяно на снимката 28.11: бял фон в .gr-att-b биеше .btn-green на „Запиши“ — jsdom не смята каскадата, затова правилото.
    ok('CSS: .gr-att-b не пипа фона / цвета (за да остане зелен „Запиши“)', !/\.gr-att-b\{[^}]*(background|color)/.test(EW.GR_ATT_CSS) && save().classList.contains('btn-green'));
    ok('✓ / ✕, „Запиши“ и ◀ ▶ са с тези класове', yes('s1').classList.contains('gr-att-b') && no('s1').classList.contains('gr-att-b') && save().classList.contains('gr-att-b') &&
      ed.querySelectorAll('#gr-att-head .gr-att-nav').length === 3);

    realClick(EW, no('s1')); await ticks(1);
    ok('✕ → на реда: Б, О, ?, Друго…; отметката още не е сменена', ['Б', 'О', '?', 'other'].every(r => !!q('s1', r)) && chip(e, 's1') === '✓ дошъл' && !EW.grAttEdit.s1 &&
      no('s1').classList.contains('gr-att-on') && !yes('s1').classList.contains('gr-att-on'));
    realClick(EW, no('s1')); await ticks(1);
    ok('✕ втори път → прибира причините', !row(e, 's1').querySelector('.gr-att-why'));
    realClick(EW, no('s1')); await ticks(1);
    realClick(EW, q('s1', 'Б')); await ticks(1);
    const r1 = row(e, 's1');
    ok('Б → „✕ Б — болничен“, едро, червеникав фон, незаписан', chip(e, 's1') === '✕ Б — болничен' && !!r1.querySelector('.gr-att-chip.gr-att-big') &&
      /background:#fef2f2/.test(r1.getAttribute('style')) && r1.getAttribute('data-dirty') === '1');
    ok('…Б е отбелязан в реда, ✕ остава избран', q('s1', 'Б').classList.contains('gr-att-on') && !q('s1', 'О').classList.contains('gr-att-on') && no('s1').classList.contains('gr-att-on'));
    ok('брояч „2 на смяна · 1 липсва“; бутонът „Запиши — 1 липсва“', cnt() === '2 на смяна · 1 липсва' && save().textContent === 'Запиши — 1 липсва', cnt() + ' / ' + save().textContent);
    realClick(EW, no('s2')); await ticks(1);
    realClick(EW, q('s2', '?')); await ticks(1);
    ok('? → неуточнено, жълт фон; 2 липсват', chip(e, 's2') === '? не е дошъл — неуточнено' && /background:#fefce8/.test(row(e, 's2').getAttribute('style')) &&
      !/fef2f2/.test(row(e, 's2').getAttribute('style')) && cnt() === '2 на смяна · 2 липсват' && save().textContent === 'Запиши — 2 липсват');
    realClick(EW, yes('s2')); await ticks(1);
    ok('✓ → обратно „дошъл“ = както на сървъра → не е незаписан', chip(e, 's2') === '✓ дошъл' && !EW.grAttEdit.s2 && !row(e, 's2').querySelector('.gr-att-why') && cnt() === '2 на смяна · 1 липсва');

    realClick(EW, q('s1', 'other')); await ticks(1);
    ok('„Друго…“ → сегашният прозорец за Иван, с „Не е дошъл — Б“ избрано', !!ed.getElementById('gr-att-modal') && /Иван Иванов/.test(ed.querySelector('#gr-att-modal h3').textContent) &&
      ed.querySelector('#gr-att-modal input[value="absent"]').checked && ed.getElementById('gr-att-abs').value === 'Б' && !!ed.querySelector('#gr-att-modal input[value="other_shift"]'));
    ed.getElementById('gr-att-note').value = 'лист 5';
    realClick(EW, ed.getElementById('gr-att-ok')); await ticks(1);
    realClick(EW, q('s1', 'О')); await ticks(1);
    ok('О от реда пази бележката от прозореца', EW.grAttEdit.s1.state === 'absent' && EW.grAttEdit.s1.actual === 'О' && EW.grAttEdit.s1.note === 'лист 5' && /лист 5/.test(row(e, 's1').textContent));
    realClick(EW, q('s1', 'other')); await ticks(1);
    pickRadio(e, 'trip'); ed.getElementById('gr-att-trip').value = 'Раднево';
    realClick(EW, ed.getElementById('gr-att-ok')); await ticks(1);
    ok('К от „Друго…“ → „Друго…“ отбелязан, К се брои като липсва', chip(e, 's1') === 'К → Раднево' && q('s1', 'other').classList.contains('gr-att-on') && cnt() === '2 на смяна · 1 липсва');
    realClick(EW, q('s1', 'Б')); await ticks(1);

    const n0 = acts(e).filter(a => a === 'daily_save').length;
    realClick(EW, save()); await ticks(4);
    const sv = lastOf(e, 'daily_save');
    ok('запис: Иван Б с бележката, Мария дошла', acts(e).filter(a => a === 'daily_save').length === n0 + 1 &&
      JSON.stringify(sv.marks.slice(0, 2)) === JSON.stringify([{ staff_id: 's1', state: 'absent', actual: 'Б', note: 'лист 5' }, { staff_id: 's2', state: 'present' }]), JSON.stringify(sv.marks));
    ok('след записа — сив „Записано ✓ ЧЧ:ММ“, неактивен', /^Записано ✓ \d\d:\d\d$/.test(save().textContent) && save().disabled && save().getAttribute('data-saved') === '1' && !save().classList.contains('btn-green'), save().textContent);
    ok('…брояч от сървъра: 1 липсва; Б стои на реда', cnt() === '2 на смяна · 1 липсва' && q('s1', 'Б').classList.contains('gr-att-on'));
    realClick(EW, no('s2')); await ticks(1);
    ok('само ✕ (без причина) — още „Записано ✓“', /^Записано ✓/.test(save().textContent));
    realClick(EW, q('s2', 'О')); await ticks(1);
    ok('промяна → пак „Запиши — 2 липсват“, активен', save().textContent === 'Запиши — 2 липсват' && !save().disabled && !save().hasAttribute('data-saved'));
    realClick(EW, btn(ed.getElementById('gr-att-save-box'), 'Откажи')); await ticks(1);
    ok('„Откажи“ → връща записаното (без „Записано ✓“ — то беше свалено)', !EW.grAttEdit.s2 && chip(e, 's2') === '✓ дошъл' && save().textContent === 'Запиши — 1 липсва');
    realClick(EW, save()); await ticks(4);
    ok('пак запис → „Записано ✓“', /^Записано ✓/.test(save().textContent));
    realClick(EW, ed.querySelector('#gr-att-head button[onclick="grAttGo(-1)"]')); await ticks(4);
    ok('друг ден → бутонът пак казва какво записва (не „Записано“)', lastOf(e, 'daily_get').date === '2026-11-26' && !/Записано/.test(save().textContent));
  }
  {
    const e = env(MGR, { mobile: true, fail: { daily_save: () => ({ status: 500, body: { ok: false, reason: 'internal', message: 'срив' } }) } });
    await load(e);
    realClick(e.w, e.doc.getElementById('gr-att-save')); await ticks(4);
    ok('неуспешен запис → не става „Записано ✓“', !/Записано/.test(e.doc.getElementById('gr-att-save').textContent) && !e.doc.getElementById('gr-att-save').disabled);
  }
  {
    const ppl = PEOPLE(); ppl[0].change = { id: 'c1', actual: 'Б', source: 'manual', trip_store: null };
    ppl[3].change = { id: 'c4', actual: 'Б', source: 'manual', trip_store: null };   // Стоян (не е на смяна) в болничен — не е „липсва“
    const e = env(MGR, { mobile: true, people: ppl, view: { date: '2026-11-20', can_mark: false } });
    await load(e);
    ok('заключен ден: отсъствието — пак червеникаво и едро, без ✓ / ✕ и без „Запиши“; болничен извън смяна не се брои', /background:#fef2f2/.test(row(e, 's1').getAttribute('style')) && !!row(e, 's1').querySelector('.gr-att-big') &&
      !row(e, 's1').querySelector('.gr-att-yn') && !e.doc.getElementById('gr-att-save') && /1<\/b> липсва/.test(e.doc.getElementById('gr-att-count').innerHTML));
  }

  report();
})();
