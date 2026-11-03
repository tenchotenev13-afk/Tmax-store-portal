/* Работен график, етап 1г — екраните (grafik.js) в портала, заредени заедно в
   реда от index.html. grafik-api е подменена с фалшив сървър в паметта (същите
   действия и отговори като handler.ts); изчисленията са истинските
   (grafik-engine.js) с setup-а от живата база (fixture).
   node tests/grafik-ui.test.js . */
'use strict';
const path = require('path');
const fs = require('fs');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const ET = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'grafik-etalon.json'), 'utf8'));
const SETUP11 = ET.setups['2026-11'];
const wait = ms => new Promise(r => setTimeout(r, ms));

const MGR = { id: 'u-mgr', email: 'tencho.tenev13@gmail.com', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const SKL = { id: 'u-skl', email: 'sklad.k@temax.bg', display_name: 'Склад', role: 'sklad', store_name: 'Кърджали' };
const ADM = { id: 'u-adm', email: 'ten.tenev@temax.bg', display_name: 'Тенчо', role: 'admin', store_name: 'Централен офис' };
const BETA = 'ten.tenev@temax.bg, Tencho.Tenev13@gmail.com, sklad.k@temax.bg';

/* ── Фалшив grafik-api ─────────────────────────────────────────────────── */
function makeServer(opt) {
  opt = opt || {};
  const S = {
    calls: [], months: {}, rows: [], seq: 0, log: [], delay: opt.delay || null,
    staff: [
      { id: 'st-1', store_name: 'Кърджали', short_name: 'ИВАН', full_name: 'Иван Иванов Иванов', sector: 'каса', sector_id: 'sec-k-kasa', hours_per_day: 8, sort_order: 10, hired_on: null, left_on: null },
      { id: 'st-2', store_name: 'Кърджали', short_name: 'МАРИЯ', full_name: "Мария Д'Анджело", sector: 'СКЛАД', sector_id: 'sec-k-sklad', hours_per_day: 8, sort_order: 20, hired_on: null, left_on: null },
      { id: 'st-3', store_name: 'Кърджали', short_name: 'ПЕТЯ', full_name: 'Петя Петрова', sector: 'КАСА', sector_id: 'sec-k-kasa', hours_per_day: 4, sort_order: 30, hired_on: null, left_on: null },
      { id: 'st-4', store_name: 'Кърджали', short_name: 'СТАР', full_name: 'Напуснал Отдавна', sector: 'ХИГИЕНИСТ', sector_id: null, hours_per_day: 8, sort_order: 40, hired_on: null, left_on: '2026-09-30' },
      { id: 'st-9', store_name: 'Шумен', short_name: 'ШУМЕН', full_name: 'Служител Шумен', sector: 'ОТЗ', hours_per_day: 8, sort_order: 10, hired_on: null, left_on: null }
    ],
    missing: opt.missing || [],
    sectors: [
      { id: 'sec-k-sklad', store_name: 'Кърджали', name: 'Склад', sort_order: 5 },   // нарочно преди Каса — редът е на магазина, не азбучен
      { id: 'sec-k-kasa', store_name: 'Кърджали', name: 'Каса', sort_order: 10 },
      { id: 'sec-sh-otz', store_name: 'Шумен', name: 'ОТЗ', sort_order: 20 }
    ],
    fail: opt.fail || {}
  };
  const me = u => {
    if (u.role === 'admin') return { kind: 'admin', stores: [{ name: 'Кърджали', can_edit: true }, { name: 'Шумен', can_edit: true }] };
    if (u.role === 'manager') return { kind: 'manager', stores: [{ name: u.store_name, can_edit: true }] };
    return { kind: 'viewer', stores: [{ name: u.store_name, can_edit: false }] };
  };
  S.handle = (u, b) => {
    S.calls.push(b); S.log.push('→' + b.action);
    if (S.fail[b.action]) { const fr = S.fail[b.action](b); if (fr) return fr; }
    const M = me(u), canEdit = st => M.stores.some(s => s.name === st && s.can_edit);
    const key = (st, m) => st + '|' + m;
    switch (b.action) {
      case 'me': return { status: 200, body: Object.assign({ ok: true }, M) };
      case 'load_month': {
        const m = b.month + '-01', mo = S.months[key(b.store, m)];
        const pm = (() => { const y = +b.month.slice(0, 4), mm = +b.month.slice(5); const p = mm === 1 ? (y - 1) + '-12' : y + '-' + String(mm - 1).padStart(2, '0'); return S.months[key(b.store, p + '-01')]; })();
        return { status: 200, body: { ok: true, store: b.store, month: m, can_edit: canEdit(b.store) && (!mo || mo.status === 'draft'),
          can_reopen: u.role === 'admin' && !!mo && mo.status === 'submitted', status: mo ? mo.status : 'draft', month_row: mo || null,
          staff: S.staff.filter(s => s.store_name === b.store), rows: mo ? S.rows.filter(r => r.month_id === mo.id) : [],
          prev_rows: pm ? S.rows.filter(r => r.month_id === pm.id) : [],
          setup: Object.assign({}, b.month === '2026-11' || b.month === '2026-12' ? SETUP11 : ET.setups['2026-10'], { missing: S.missing, extra_days: [], season_label: b.month === '2026-10' ? 'Лято (до 20:00)' : 'Зима 1 (до 19:30)',
            sectors: S.sectors.filter(x => x.store_name === b.store).sort((a, c) => a.sort_order - c.sort_order).map(x => ({ id: x.id, name: x.name, sort_order: x.sort_order })) }) } };
      }
      case 'save_rows': {
        if (!canEdit(b.store)) return { status: 403, body: { ok: false, reason: 'readonly', message: 'Нямате права да променяте графика на този обект.' } };
        const m = b.month + '-01';
        let mo = S.months[key(b.store, m)];
        if (mo && mo.status !== 'draft') return { status: 409, body: { ok: false, reason: 'submitted', message: 'Графикът е подаден.' } };
        if (!mo) mo = S.months[key(b.store, m)] = { id: 'm-' + (++S.seq), store_name: b.store, month: m, status: 'draft' };
        b.rows.forEach(r => {
          const cur = S.rows.filter(x => x.month_id === mo.id && x.staff_id === r.staff_id)[0];
          if (cur) Object.assign(cur, r); else S.rows.push(Object.assign({ month_id: mo.id }, JSON.parse(JSON.stringify(r))));
        });
        return { status: 200, body: { ok: true, saved: b.rows.length } };
      }
      case 'submit': {
        const mo = S.months[key(b.store, b.month + '-01')];
        if (S.missing.length) return { status: 409, body: { ok: false, reason: 'missing_company', message: 'Липсват данни за дружеството — админ.' } };
        mo.status = 'submitted'; mo.submitted_by_name = u.display_name; mo.submitted_at = '2026-11-02T10:00:00Z'; mo.snapshot = b.snapshot;
        return { status: 200, body: { ok: true, status: 'submitted' } };
      }
      case 'reopen': {
        const mo = S.months[key(b.store, b.month + '-01')];
        mo.status = 'draft';
        return { status: 200, body: { ok: true, status: 'draft' } };
      }
      case 'sector_save': {
        if (!canEdit(b.store) || (u.role !== 'admin' && !u.is_regional)) return { status: 403, body: { ok: false, reason: 'forbidden', message: 'Сектор добавят регионалният и admin.' } };
        if (S.sectors.some(x => x.store_name === b.store && x.name.toLowerCase() === b.name.toLowerCase())) return { status: 409, body: { ok: false, reason: 'duplicate', message: 'Секторът вече го има.' } };
        const x = { id: 'sec-new-' + (++S.seq), store_name: b.store, name: b.name, sort_order: 500 }; S.sectors.push(x);
        return { status: 200, body: { ok: true, sector: x } };
      }
      case 'staff_save': {
        if (!canEdit(b.store)) return { status: 403, body: { ok: false, reason: 'readonly', message: 'Нямате права.' } };
        if (b.id) { const s = S.staff.filter(x => x.id === b.id)[0]; Object.assign(s, b.fields); return { status: 200, body: { ok: true, staff: s } }; }
        const s = Object.assign({ id: 'st-new-' + (++S.seq), store_name: b.store }, b.fields); S.staff.push(s);
        return { status: 200, body: { ok: true, staff: s } };
      }
    }
    return { status: 400, body: { ok: false, message: 'Непознато действие.' } };
  };
  return S;
}

function env(user, opt) {
  opt = opt || {};
  const S = opt.server || makeServer(opt);
  const h = boot({
    modules: ['grafik-engine.js', 'grafik.js'], user,
    data: { app_settings: [{ key: 'grafik_beta_users', value: opt.beta === undefined ? BETA : opt.beta }] },
    confirm: opt.confirm === undefined ? true : opt.confirm,
    globals: { currentSession: 'sess.sig' }
  });
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/grafik-api') >= 0) {
      const body = JSON.parse(init.body);
      const r = S.handle(user, body);
      const resp = { ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body) };
      const ms = S.delay && S.delay[body.action];
      if (ms) return new Promise(res => setTimeout(() => { S.log.push('←' + body.action); res(resp); }, ms));
      S.log.push('←' + body.action);
      return Promise.resolve(resp);
    }
    return orig.apply(this, arguments);
  };
  h.w.grMonth = '2026-11';
  h.S = S;
  return h;
}
const mod = h => h.doc.getElementById('mod-grafik');
const key = (h, k, extra) => h.w.grKey(Object.assign({ key: k, preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, extra || {}));
const typeIn = (h, s) => { for (const ch of s) key(h, ch); };
const cellText = (h, r, d) => { const c = h.doc.getElementById('gr-c-' + r + '-' + d); return c ? c.textContent.replace('🔒', '').trim() : null; };
const lastSave = h => h.S.calls.filter(c => c.action === 'save_rows').slice(-1)[0];
async function load(h) { await guard('loadGrafik() не хвърля', () => h.w.loadGrafik()); await ticks(6); }

(async () => {
  section('1. Таб само за beta списъка');
  {
    const h = env(MGR);
    await h.w.grLoadUsers(); await ticks();
    ok('manager от списъка (главни букви в настройката) → табът се вижда', h.doc.getElementById('tab-grafik').style.display === '');
    const h2 = env(MGR, { beta: 'ten.tenev@temax.bg' });
    await h2.w.grLoadUsers(); await ticks();
    ok('извън списъка → табът е скрит', h2.doc.getElementById('tab-grafik').style.display === 'none');
    await load(h2);
    ok('извън списъка → „Нямаш достъп“, без заявка към grafik-api', !!h2.doc.getElementById('gr-noaccess') && h2.S.calls.length === 0);
    ok('showModule(\'grafik\') показва контейнера', guard('showModule', () => h.w.showModule('grafik')) && mod(h).style.display === 'block');
  }

  section('2. Мрежата');
  const h = env(MGR);
  await load(h);
  const M = mod(h);
  ok('месецът е ноември 2026', (h.doc.getElementById('gr-month-label') || {}).textContent === 'ноември 2026 г.');
  ok('чернова', /Чернова/.test((h.doc.getElementById('gr-status') || {}).textContent || ''));
  ok('редове: 3 (напусналият през септември не е в графика)', M.querySelectorAll('#gr-grid tbody tr').length === 3, M.querySelectorAll('#gr-grid tbody tr').length);
  ok('30 колони за дни', M.querySelectorAll('#gr-grid .gr-dh').length === 30);
  ok('празните клетки са празни (не „—“)', cellText(h, 0, 5) === '', JSON.stringify(cellText(h, 0, 5)));
  ok('неделите са оцветени (1.11 е неделя)', /background/.test(M.querySelector('#gr-grid .gr-dh').getAttribute('style')));
  ok('служителят с апостроф се рендира', /Д&#39;|Д'Анджело/.test(M.innerHTML) || M.textContent.indexOf('МАРИЯ') >= 0);
  ok('4-часовият е отбелязан (4 ч.)', M.textContent.indexOf('(4 ч.)') >= 0);
  ok('бутон „Подай“', !!btn(M, 'Подай'));

  section('3. Клавиатура и автозапис');
  h.w.grSelect(0, 1);                                  // 2.11 (пн)
  typeIn(h, 'p'); key(h, 'Enter');
  ok('„p“ на латиница → П', cellText(h, 0, 1) === 'П', cellText(h, 0, 1));
  ok('Enter мести надолу', h.w.grSel.r === 1 && h.w.grSel.d === 1);
  typeIn(h, 'ЛД'); key(h, 'Tab');
  ok('„ЛД“ на кирилица, Tab надясно', cellText(h, 1, 1) === 'ЛД' && h.w.grSel.d === 2);
  typeIn(h, '9'); key(h, 'ArrowRight');
  ok('число 9 (свободни часове) се приема', cellText(h, 1, 2) === '9');
  typeIn(h, 'х'); key(h, 'Enter');
  ok('непозната буква → съобщение, клетката остава празна', cellText(h, 1, 3) === '' && h.calls.toast.some(t => /Непозната стойност/.test(t)));
  h.w.grSelect(1, 2); key(h, 'Delete');
  ok('Delete изтрива', cellText(h, 1, 2) === '');
  await wait(1000); await ticks();
  const sv = lastSave(h);
  ok('автозаписът праща save_rows за двамата', sv && sv.rows.length === 2 && sv.store === 'Кърджали' && sv.month === '2026-11', sv && JSON.stringify(sv.rows.map(r => r.staff_id)));
  ok('пропускът е в тялото', sv && sv.session === 'sess.sig');
  ok('буквите в записа (без празната опашка)', sv && JSON.stringify(sv.rows.filter(r => r.staff_id === 'st-1')[0].letters) === JSON.stringify(['', 'П']), sv && JSON.stringify(sv.rows[0].letters));
  ok('„💾 Записано“', /Записано/.test(h.doc.getElementById('gr-save').textContent));

  section('4. Поставяне от Excel, часове, разлика');
  h.w.grSelect(0, 0);
  const wd = h.w.GrafikEngine.monthInfo('2026-11', []);
  const line = wd.dow.map(w => (w <= 5 ? 'П' : '')).join('\t');
  h.w.grPaste({ clipboardData: { getData: () => line + '\n' + line.replace(/П/g, 'В') + '\r\n' + 'zz\tП' }, preventDefault() {} });
  ok('ред 1: 21 × П поставени', h.w.grRows['st-1'].letters.filter(x => x === 'П').length === 21);
  ok('ред 2: В', h.w.grRows['st-2'].letters.filter(x => x === 'В').length === 21);
  ok('непознатото „zz“ е пропуснато със съобщение', h.calls.toast.some(t => /непознати \(пропуснати\) 1/.test(t)));
  const diff0 = M.querySelectorAll('.gr-diff');
  ok('разлика 0 за 21 × П (168 ч.) — зелено', diff0[0] && diff0[0].textContent === '0' && /16a34a/.test(diff0[0].getAttribute('style')), diff0[0] && diff0[0].textContent);
  ok('4-часовият: П (4 ч. договор) → Д5/1; 1 ден → разлика −80 (червено)', h.w.grCalc.rows[2].codes[1] === 'Д5/1' && diff0[2].textContent === '-80' && /dc2626/.test(diff0[2].getAttribute('style')), h.w.grCalc.rows[2].codes[1] + ' ' + (diff0[2] && diff0[2].textContent));

  section('5. Автоматично изравняване — видимо, заключване');
  h.w.grSelect(0, 2); typeIn(h, 'ЛД'); key(h, 'Enter');           // +2.5 над нормата
  const ch = h.w.grCalc.rows[0].changed;
  ok('над нормата → изравнено с една смяна', h.w.grCalc.rows[0].diff === 0 && ch.length === 1, JSON.stringify(ch));
  const cc = h.doc.getElementById('gr-c-0-' + (ch[0].day - 1));
  ok('сменената клетка е жълта с обяснение', cc && /fde68a/.test(cc.getAttribute('style')) && /автоматично/.test(cc.getAttribute('title')));
  await wait(1000); await ticks();
  const savesBeforeLock = h.S.calls.filter(c => c.action === 'save_rows').length;
  h.w.grSelect(0, ch[0].day - 1);
  key(h, 'l', { ctrlKey: true });
  ok('Ctrl+L заключва текущия (автоматичния) код', h.w.grRows['st-1'].locked[String(ch[0].day)] === ch[0].to);
  ok('заключената клетка носи 🔒', h.doc.getElementById('gr-c-0-' + (ch[0].day - 1)).textContent.indexOf('🔒') >= 0);
  await wait(1000); await ticks();
  ok('заключването само по себе си пуска нов запис', h.S.calls.filter(c => c.action === 'save_rows').length === savesBeforeLock + 1);
  ok('заключеното се записва', JSON.stringify(lastSave(h).rows.filter(r => r.staff_id === 'st-1')[0].locked) === JSON.stringify({ [String(ch[0].day)]: ch[0].to }));
  key(h, 'l', { ctrlKey: true });
  ok('втори Ctrl+L отключва', !h.w.grRows['st-1'].locked[String(ch[0].day)]);

  section('6. Покритие и предупреждения');
  const covRows = Array.from(h.doc.querySelectorAll('#gr-coverage tbody tr')).map(tr => tr.firstChild.textContent);
  ok('покритие по сектор: по списъка и реда на магазина (Склад, Каса), не по текста от бланката', JSON.stringify(covRows) === JSON.stringify(['Склад', 'Каса']), JSON.stringify(covRows));
  ok('„каса“ и „КАСА“ от бланката са в ЕДИН ред (Каса)', covRows.filter(x => /каса/i.test(x)).length === 1);
  ok('неделя без хора → червено (0)', h.doc.querySelectorAll('#gr-coverage .gr-cov0').length > 0);
  h.w.grSelect(1, 0);
  for (let d = 0; d < 7; d++) { typeIn(h, 'В'); key(h, 'Tab'); }
  ok('над 5 работни дни в 7 → предупреждение', !!h.doc.querySelector('#gr-warnings .gr-warn-over5'));
  ok('извън нормата → в предупрежденията', !!h.doc.querySelector('#gr-warnings .gr-warn-norm'));

  section('7. Подаване');
  await wait(1000); await ticks();
  h.calls.confirm.length = 0;
  realClick(h.w, btn(M, 'Подай'));
  await ticks(8);
  ok('confirm показва хората извън нормата', h.calls.confirm.some(c => /извън нормата/.test(c)));
  const sub = h.S.calls.filter(c => c.action === 'submit')[0];
  ok('submit е изпратен', !!sub);
  if (sub) {
    ok('снимката има всичките 3 реда', sub.snapshot.rows.length === 3, sub.snapshot.rows.length);
    ok('кодовете са по 30 (дните)', sub.snapshot.rows.every(r => r.codes.length === 30));
    ok('снимката: заключеният/сменен код и Д5/1 на 4-часовия', sub.snapshot.rows[2].codes[1] === 'Д5/1');
    ok('сборове в снимката', typeof sub.snapshot.totals.man_hours === 'number' && sub.snapshot.norm === 168);
  }
  await ticks(6);
  ok('след подаване: „Подаден от …“, без „Подай“', /Подаден от Управител Кърджали/.test(mod(h).textContent) && !btn(mod(h), 'Подай'));
  const before = h.S.calls.length;
  const was = cellText(h, 0, 4);
  h.w.grSelect(0, 4); typeIn(h, 'В'); key(h, 'Enter'); key(h, 'Delete');
  ok('подаден → клавиатурата не пише (нито буква, нито Delete)', cellText(h, 0, 4) === was && h.S.calls.length === before, was + ' → ' + cellText(h, 0, 4));
  ok('ръководителят не вижда „Върни в чернова“', !btn(mod(h), 'Върни'));

  section('8. Admin: друг обект, месец, връщане');
  const a = env(ADM, { server: h.S });
  await load(a);
  ok('admin вижда избор на обект', !!a.doc.getElementById('gr-store'));
  ok('admin вижда „Върни в чернова“', !!btn(mod(a), 'Върни'));
  realClick(a.w, btn(mod(a), 'Върни'));
  await ticks(8);
  ok('reopen е изпратен и графикът е пак чернова', h.S.calls.some(c => c.action === 'reopen') && /Чернова/.test(mod(a).textContent));
  const sel = a.doc.getElementById('gr-store'); sel.value = 'Шумен';
  H.fire(a.w, sel, 'change'); await ticks(8);
  ok('смяна на обект → load_month за Шумен', h.S.calls.slice(-1)[0].action === 'load_month' && h.S.calls.slice(-1)[0].store === 'Шумен');
  realClick(a.w, btn(mod(a), '▶')); await ticks(8);
  ok('▶ → декември 2026', h.S.calls.slice(-1)[0].month === '2026-12' && /декември 2026/.test(mod(a).textContent));

  section('9. Ритъмът от предходния месец');
  {
    const S = makeServer();
    S.months['Кърджали|2026-10-01'] = { id: 'm-oct', store_name: 'Кърджали', month: '2026-10-01', status: 'submitted' };
    // Правилото: същият ден от седмицата 4 седмици назад (−28 дни; за 29–31-ви −35) — пази и редуване през седмица.
    const oct = new Array(31).fill(''); oct[4] = 'П'; oct[5] = 'О'; oct[6] = 'ЛД'; oct[7] = '9'; oct[11] = 'П'; oct[25] = 'П';   // 5.10 пн, 6 вт (О), 7 ср, 8 чт, 12 пн, 26 пн
    S.rows.push({ month_id: 'm-oct', staff_id: 'st-1', letters: oct, locked: {} });
    const r = env(MGR, { server: S });
    await load(r);
    r.w.grRows['st-1'] = { letters: ['', '', '', 'В'], locked: {} };                                // 4.11 (ср) вече е попълнен
    r.w.grRecalc(); r.w.grCopyRhythm();
    const L = r.w.grRows['st-1'].letters;
    ok('пн 2.11 ← пн 5.10 (П)', L[1] === 'П', L[1]);
    ok('вт 3.11 ← вт 6.10 (О) — отсъствие не се пренася', L[2] === '', L[2]);
    ok('ср 4.11 — попълнената клетка не се пипа (в 7.10 има ЛД)', L[3] === 'В', L[3]);
    ok('чт 5.11 ← чт 8.10 (9 свободни часа)', L[4] === '9', L[4]);
    ok('пн 9.11 ← пн 12.10; пн 30.11 ← пн 26.10 (−35 дни)', L[8] === 'П' && L[29] === 'П', L[8] + L[29]);
    ok('съобщение: 5 клетки (2, 5, 9, 23, 30.11)', L[22] === 'П' && r.calls.toast.some(t => /Пренесени 5 клетки/.test(t)), r.calls.toast.join('|'));
  }

  section('10. Персонал');
  {
    const S = makeServer();
    const r = env(MGR, { server: S });
    await load(r);
    realClick(r.w, btn(mod(r), 'Персонал'));
    ok('списъкът: 4 души (вкл. напусналия, сив)', mod(r).querySelectorAll('#gr-staff tbody tr').length === 4 && /94a3b8/.test(r.doc.getElementById('gr-st-st-4').getAttribute('style')));
    realClick(r.w, btn(mod(r), 'Нов служител'));
    const dlg = r.doc.getElementById('gr-staff-modal');
    ok('модалът се отваря', !!dlg && dlg.classList.contains('open'));
    realClick(r.w, btn(dlg, 'Запиши'));
    ok('без имена → отказ, без заявка', r.calls.toast.some(t => /задължителни/.test(t)) && !S.calls.some(c => c.action === 'staff_save'));
    r.doc.getElementById('gr-sf-short').value = 'НОВА';
    r.doc.getElementById('gr-sf-full').value = 'Нова Новева Новакова';
    r.doc.getElementById('gr-sf-hpd').value = '4';
    r.doc.getElementById('gr-sf-hired').value = '2026-11-10';
    r.doc.getElementById('gr-sf-left').value = '2026-11-01';
    realClick(r.w, btn(dlg, 'Запиши'));
    ok('напуснал преди назначаване → отказ', r.calls.toast.some(t => /преди назначаването/.test(t)));
    r.doc.getElementById('gr-sf-left').value = '';
    realClick(r.w, btn(dlg, 'Запиши')); await ticks(8);
    const ss = S.calls.filter(c => c.action === 'staff_save')[0];
    ok('staff_save — нов, с договор 4 ч. и обект', ss && !ss.id && ss.store === 'Кърджали' && ss.fields.hours_per_day === 4 && ss.fields.hired_on === '2026-11-10' && ss.fields.left_on === null, ss && JSON.stringify(ss.fields));
    realClick(r.w, btn(mod(r), 'Персонал'));
    const edit = r.doc.querySelector('#gr-st-st-2 button');
    realClick(r.w, edit);
    ok('редакция: полето носи името с апостроф', r.doc.getElementById('gr-sf-full').value === "Мария Д'Анджело");
    r.doc.getElementById('gr-sf-left').value = '2026-11-20';
    realClick(r.w, btn(r.doc.getElementById('gr-staff-modal'), 'Запиши')); await ticks(8);
    const se = S.calls.filter(c => c.action === 'staff_save').slice(-1)[0];
    ok('staff_save — редакция с id и дата на напускане', se && se.id === 'st-2' && se.fields.left_on === '2026-11-20');
  }

  section('10б. Сезон и сектори');
  {
    const r = env(MGR);
    await load(r);
    const se = (r.doc.getElementById('gr-season') || {}).textContent || '';
    ok('сезонът е с пълно име „Зима 1 (до 19:30)“', se === 'Зима 1 (до 19:30)', se);
    const head = r.doc.getElementById('gr-season').parentNode.parentNode.textContent;
    ok('„З1“ не се показва в реда с месеца', head.indexOf('З1') < 0 && head.indexOf('Зима 1') >= 0, head);
    realClick(r.w, btn(mod(r), '◀')); await ticks(8);
    ok('октомври → „Лято (до 20:00)“', (r.doc.getElementById('gr-season') || {}).textContent === 'Лято (до 20:00)');
    realClick(r.w, btn(mod(r), '▶')); await ticks(8);
    ok('мрежата показва сектора от списъка (Каса), не текста от бланката (каса)', r.doc.getElementById('gr-row-st-1').textContent.indexOf('Каса') >= 0 &&
      r.doc.getElementById('gr-row-st-1').textContent.indexOf('каса') < 0);
    realClick(r.w, btn(mod(r), 'Персонал'));
    ok('manager: без „➕ Сектор“', !btn(mod(r), 'Сектор'));
    realClick(r.w, r.doc.querySelector('#gr-st-st-4 button'));
    const sel = r.doc.getElementById('gr-sf-sector');
    ok('секторът е падащ списък: без сектор + Склад + Каса (реда на магазина)', sel && sel.tagName === 'SELECT' &&
      JSON.stringify(Array.from(sel.options).map(o => o.textContent)) === JSON.stringify(['— без сектор —', 'Склад', 'Каса']), sel && Array.from(sel.options).map(o => o.textContent).join(','));
    ok('при служител без сектор се вижда текстът от бланката', /в бланката: ХИГИЕНИСТ/.test(r.doc.getElementById('gr-staff-modal').textContent));
    sel.value = 'sec-k-sklad';
    realClick(r.w, btn(r.doc.getElementById('gr-staff-modal'), 'Запиши')); await ticks(8);
    const ss = r.S.calls.filter(c => c.action === 'staff_save').slice(-1)[0];
    ok('staff_save праща sector_id, не текст', ss && ss.fields.sector_id === 'sec-k-sklad' && !('sector' in ss.fields), ss && JSON.stringify(ss.fields));
    realClick(r.w, btn(mod(r), 'Персонал'));
    realClick(r.w, r.doc.querySelector('#gr-st-st-4 button'));
    r.doc.getElementById('gr-sf-sector').value = '';
    realClick(r.w, btn(r.doc.getElementById('gr-staff-modal'), 'Запиши')); await ticks(8);
    ok('„— без сектор —“ → sector_id null', r.S.calls.filter(c => c.action === 'staff_save').slice(-1)[0].fields.sector_id === null);

    const a = env(ADM);
    await load(a);
    realClick(a.w, btn(mod(a), 'Персонал'));
    ok('admin: има „➕ Сектор“', !!btn(mod(a), 'Сектор'));
    realClick(a.w, btn(mod(a), 'Сектор'));
    const dlg = a.doc.getElementById('gr-sector-modal');
    ok('модалът изброява сегашните сектори', dlg && /Сега: Склад, Каса/.test(dlg.textContent));
    a.doc.getElementById('gr-sec-name').value = '  КАСА ';
    realClick(a.w, btn(dlg, 'Добави')); await ticks(4);
    ok('„КАСА“ при съществуваща „Каса“ → отказ в браузъра, без заявка', a.calls.toast.some(t => /вече го има/.test(t)) && !a.S.calls.some(c => c.action === 'sector_save'));
    a.doc.getElementById('gr-sec-name').value = '  Градина   и  двор ';
    realClick(a.w, btn(dlg, 'Добави')); await ticks(8);
    const sv = a.S.calls.filter(c => c.action === 'sector_save')[0];
    ok('sector_save: магазинът и името (интервалите свити)', sv && sv.store === 'Кърджали' && sv.name === 'Градина и двор', sv && JSON.stringify(sv));
    realClick(a.w, btn(mod(a), 'Персонал'));
    realClick(a.w, a.doc.querySelector('#gr-st-st-1 button'));
    ok('новият сектор е в падащия списък', Array.from(a.doc.getElementById('gr-sf-sector').options).some(o => o.textContent === 'Градина и двор'));
  }

  section('10в. Залепналото заглавие — над първия ред, не върху него');
  {
    /* Дефект от проверката на живо (03.11.2026): в „Персонал“ tbl-compact беше върху <table>
       вътре в .tbl-wrap (overflow-x:auto) → заглавието залепваше на --nav-h ВЪТРЕ в кутията и
       закриваше втория ред. jsdom не смята лейаут: заковават се структурата и CSS-ът като текст;
       видимото — само с поглед на живо. */
    const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & 4));   // a е преди b
    const r = env(MGR);
    await load(r);
    const grid = r.doc.getElementById('gr-grid'), gw = r.doc.getElementById('gr-grid-wrap');
    ok('График: заглавието е преди първия ред в DOM-а', before(grid.querySelector('thead'), grid.querySelector('tbody tr')));
    ok('График: обвивката е .gr-grid-wrap (собствена кутия за скрол)', !!gw && gw.classList.contains('gr-grid-wrap') && grid.parentNode === gw);
    ok('График: таблицата НЕ е tbl-compact (иначе top:--nav-h вътре в кутията)', !grid.classList.contains('tbl-compact') && !gw.classList.contains('tbl-compact'));
    ok('CSS: .gr-grid-wrap — собствен скрол, до долния край на екрана, залепва под лентата',
      /\.gr-grid-wrap\{overflow:auto;max-height:calc\(100vh - var\(--nav-h,58px\) - \d+px\);position:sticky;top:var\(--nav-h,58px\);\}/.test(css));
    ok('CSS: .gr-grid-wrap thead th — sticky, top:0, над редовете, с фон', /\.gr-grid-wrap thead th\{position:sticky;top:0;z-index:2;background:var\(--surf\);\}/.test(css));
    ok('График: кутията е ПОСЛЕДНА в модула (иначе редът под нея я избутва под лентата при скрол докрай)', mod(r).lastElementChild === gw);
    ok('График: подсказката за буквите е над мрежата', !!r.doc.getElementById('gr-hint') && before(r.doc.getElementById('gr-hint'), gw));
    ok('CSS: заглавието в кутията е top:0 (кутията вече е под лентата — без двоен отстъп)', !/\.gr-grid-wrap thead th\{[^}]*--nav-h/.test(css));

    realClick(r.w, btn(mod(r), 'Персонал'));
    const st = r.doc.getElementById('gr-staff'), sw = r.doc.getElementById('gr-staff-wrap');
    ok('Персонал: заглавието е преди първия ред (Тенчо…) в DOM-а', before(st.querySelector('thead'), st.querySelector('tbody tr')));
    ok('Персонал: tbl-compact е на обвивката, не на таблицата', !!sw && st.parentNode === sw && sw.classList.contains('tbl-wrap') &&
      sw.classList.contains('tbl-compact') && !st.classList.contains('tbl-compact'), sw && sw.className + ' / ' + st.className);
    ok('CSS: от 1200px .tbl-compact сваля скрола и заглавието залепва под лентата (--nav-h)',
      /@media\(min-width:1200px\)\{[\s\S]*?\.tbl-compact\{overflow:visible;\}[\s\S]*?\.tbl-compact thead th\{position:sticky;top:var\(--nav-h,58px\);/.test(css));
    const anyTableCompact = Array.from(r.doc.querySelectorAll('#mod-grafik table')).some(t => t.classList.contains('tbl-compact'));
    ok('никоя таблица в модула не носи tbl-compact върху самата <table>', !anyTableCompact);
  }

  section('11. Само гледа, липсващо дружество, грешки');
  {
    const v = env(SKL);
    await load(v);
    ok('склад: без „Подай“ и без бутоните за редакция', !btn(mod(v), 'Подай') && !btn(mod(v), 'Ритъмът'));
    v.w.grSelect(0, 1); typeIn(v, 'П'); key(v, 'Enter');
    ok('склад: клавиатурата не пише', cellText(v, 0, 1) === '' && !v.S.calls.some(c => c.action === 'save_rows'));
    realClick(v.w, btn(mod(v), 'Персонал'));
    ok('склад: без „Нов служител“', !btn(mod(v), 'Нов служител'));

    const m = env(MGR, { missing: ['адрес на дружеството'] });
    await load(m);
    ok('липсващо дружество → червено съобщение', /Липсват данни за дружеството — админ \(адрес на дружеството\)/.test((m.doc.getElementById('gr-missing') || {}).textContent || ''));
    m.w.grSelect(0, 1); typeIn(m, 'П'); key(m, 'Enter');
    ok('…но клетките се попълват', cellText(m, 0, 1) === 'П');
    realClick(m.w, btn(mod(m), 'Подай')); await ticks(6);
    ok('…и „Подай“ отказва без заявка', m.calls.toast.some(t => /Не може да се подаде/.test(t)) && !m.S.calls.some(c => c.action === 'submit'));

    const e401 = env(MGR, { fail: { me: () => ({ status: 401, body: { ok: false, reason: 'session_expired', message: 'x' } }) } });
    await load(e401);
    ok('401 → „Сесията е изтекла — излез и влез отново.“', /Сесията е изтекла/.test((e401.doc.getElementById('gr-error') || {}).textContent || ''));

    let failOnce = true;
    const f = env(MGR, { fail: { save_rows: b => failOnce ? (failOnce = false, { status: 400, body: { ok: false, reason: 'bad_cells', message: 'Непознати стойности в графика.', errors: [{ staff_id: 'st-1', cells: ['2: „Х“'] }] } }) : null } });
    await load(f);
    f.w.grSelect(0, 1); typeIn(f, 'П'); key(f, 'Enter');
    await wait(1000); await ticks();
    ok('отказан запис → „НЕ е записан“ с клетката', f.calls.toast.some(t => /НЕ е записан/.test(t) && /ИВАН 2: „Х“/.test(t)), f.calls.toast.join(' | '));
    ok('„⚠ Незаписано“', /Незаписано/.test(f.doc.getElementById('gr-save').textContent));
    f.w.grSelect(1, 2); typeIn(f, 'В'); key(f, 'Enter');                  // друг служител
    await wait(1000); await ticks();
    const again = f.S.rows.filter(r => r.staff_id === 'st-1')[0];
    ok('следващият запис (за друг служител) праща и незаписания ред', again && again.letters[1] === 'П', again && JSON.stringify(again.letters));
  }

  section('12. Запис и подаване — подредба, паднал запис, смяна на обект');
  {
    const S = makeServer({ delay: { save_rows: 300 } });
    const r = env(MGR, { server: S });
    await load(r);
    r.w.grSelect(0, 1); typeIn(r, 'П'); key(r, 'Enter');
    r.w.grSaveNow();                                                     // записът тръгва и виси 300 мс
    r.w.grSelect(1, 1); typeIn(r, 'В'); key(r, 'Enter');                 // още промяна, докато виси
    realClick(r.w, btn(mod(r), 'Подай'));
    await wait(1200); await ticks(8);
    const order = S.log.join(' ');
    ok('подаването чака записите: всички save_rows се връщат ПРЕДИ submit', /←save_rows.*→submit/.test(order) && order.lastIndexOf('←save_rows') < order.indexOf('→submit'), order);
    ok('никога два save_rows едновременно', !/→save_rows →save_rows/.test(order.replace(/ ←[^ ]+/g, m => m)) && !/→save_rows(?: →[a-z_]+)* →save_rows/.test(order.split('←save_rows')[0] || ''), order);
    const sub = S.calls.filter(c => c.action === 'submit')[0];
    ok('подадено — и двете промени са в базата преди това', !!sub && S.rows.some(x => x.staff_id === 'st-1' && x.letters[1] === 'П') && S.rows.some(x => x.staff_id === 'st-2' && x.letters[1] === 'В'));
  }
  {
    const f = env(MGR, { fail: { save_rows: () => ({ status: 500, body: { ok: false, message: 'boom' } }) } });
    await load(f);
    f.w.grSelect(0, 1); typeIn(f, 'П'); key(f, 'Enter');
    realClick(f.w, btn(mod(f), 'Подай'));
    await wait(200); await ticks(8);
    ok('паднал запис → НЕ се подава', !f.S.calls.some(c => c.action === 'submit') && f.calls.toast.some(t => /първо графикът трябва да се запише/.test(t)), f.calls.toast.join(' | '));
  }
  {
    let failK = true;
    const S = makeServer({ fail: { save_rows: b => (failK && b.store === 'Кърджали') ? { status: 500, body: { ok: false, message: 'boom' } } : null } });
    const a = env(ADM, { server: S, confirm: true });
    await load(a);
    a.w.grSelect(0, 1); typeIn(a, 'П'); key(a, 'Enter');
    a.calls.confirm.length = 0;
    const sel = a.doc.getElementById('gr-store'); sel.value = 'Шумен';
    H.fire(a.w, sel, 'change'); await wait(200); await ticks(8);
    ok('смяна на обект при паднал запис → пита', a.calls.confirm.some(c => /НЕЗАПИСАНИ/.test(c)));
    ok('…и след „да“ отваря Шумен', a.w.grStore === 'Шумен' && S.calls.slice(-1)[0].store === 'Шумен');
    a.w.grSelect(0, 1); typeIn(a, 'В'); key(a, 'Enter');
    await wait(1000); await ticks();
    const last = S.calls.filter(c => c.action === 'save_rows').slice(-1)[0];
    ok('записът за Шумен не носи служители от Кърджали', last && last.store === 'Шумен' && last.rows.every(x => x.staff_id === 'st-9'), last && JSON.stringify(last.rows.map(x => x.staff_id)));
    const b = env(ADM, { server: makeServer({ fail: { save_rows: () => ({ status: 500, body: { ok: false, message: 'boom' } }) } }), confirm: false });
    await load(b);
    b.w.grSelect(0, 1); typeIn(b, 'П'); key(b, 'Enter');
    realClick(b.w, btn(mod(b), '▶')); await wait(200); await ticks(8);
    ok('„не“ на въпроса → оставаме в месеца, промяната е в паметта', b.w.grMonth === '2026-11' && b.w.grRows['st-1'].letters[1] === 'П' && Object.keys(b.w.grDirty).length === 1);
  }

  report();
})();
