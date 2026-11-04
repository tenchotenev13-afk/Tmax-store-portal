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
    company: opt.company !== undefined ? opt.company : { name: '"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 3" ЕООД', eik: '207322431', addr: 'гр. Варна, ул. "Блян" 2' },
    store: { blank_name: '"Темакс" – Кърджали', address: null }, approver: 'Теодор Тенев',
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
          setup: Object.assign({}, b.month === '2026-11' || b.month === '2026-12' ? SETUP11 : ET.setups['2026-10'], { missing: S.missing, extra_days: [], company: S.company, store: S.store, approver: S.approver, season_label: b.month === '2026-10' ? 'Лято (до 20:00)' : 'Зима 1 (до 19:30)',
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
  // 1.11 (нд) – 7.11 (сб) работни, 8.11 празна → точно 7 поредни (ВТР чл. 19: няма 36 ч. почивка).
  const rest = h.doc.querySelector('#gr-warnings .gr-warn-no_weekly_rest');
  // Кодовете носят начало/край (20261104073847) → по часовник: най-дългата почивка между смените на МАРИЯ е 16,5 ч.
  ok('7 поредни работни дни → „няма непрекъсната почивка ≥ 36 ч.“ с датите', !!rest &&
    /МАРИЯ: няма непрекъсната почивка ≥ 36 ч\. в 7 поредни дни \(01\.11–07\.11\) — най-дългата е \d+(,5)? ч\./.test(rest.textContent), rest && rest.textContent);
  ok('„6 работни дни в 7“ вече НЕ е предупреждение', !h.doc.querySelector('#gr-warnings .gr-warn-over5'));
  const note = h.doc.querySelector('#gr-warnings .gr-warn-month');
  ok('без октомври в базата → бележка „Седмицата 26.10–01.11 е непълна“', !!note && /^Седмицата 26\.10–01\.11 е непълна/.test(note.textContent), note && note.textContent);
  ok('екранът е поискал октомври (за седмицата през границата)', h.S.calls.some(c => c.action === 'load_month' && c.month === '2026-10'));
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
  ok('▶ → декември 2026', h.S.calls.some(c => c.action === 'load_month' && c.month === '2026-12' && c.prev === true) && /декември 2026/.test(mod(a).textContent));

  section('9. Ритъмът от предходния месец');
  {
    const S = makeServer();
    S.months['Кърджали|2026-10-01'] = { id: 'm-oct', store_name: 'Кърджали', month: '2026-10-01', status: 'submitted' };
    // Правилото: същият ден от седмицата 4 седмици назад (−28 дни; за 29–31-ви −35) — пази и редуване през седмица.
    const oct = new Array(31).fill(''); oct[4] = 'П'; oct[5] = 'О'; oct[6] = 'ЛД'; oct[7] = '9'; oct[11] = 'П'; oct[25] = 'П';   // 5.10 пн, 6 вт (О), 7 ср, 8 чт, 12 пн, 26 пн
    S.rows.push({ month_id: 'm-oct', staff_id: 'st-1', letters: oct, locked: {} });
    const r = env(MGR, { server: S });
    await load(r);
    ok('октомври го има в базата → подаден на изчисленията (grPrev), без бележка „непълна“', !!r.w.grPrev && r.w.grPrev.ym === '2026-10' &&
      !!r.w.grPrev.rows['st-1'] && (r.w.grCalc.notes || []).length === 0);
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

  section('13. 1д: файл за ТРЗ и печат');
  {
    const ExcelJS = require(path.join(ROOT, 'node_modules', 'exceljs'));
    /* ExcelJS: в браузъра — от cdnjs (байт в байт същият dist като в npm, сверено 04.11.2026);
       тук — npm пакетът. Свалянето се подменя, за да се прочете файлът обратно. */
    const setupX = (h, got) => {
      h.w.grWithExcelJS = () => Promise.resolve(ExcelJS);
      h.w.grDownload = (buf, name) => got.push({ buf, name });
    };
    const readBack = async buf => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
    const S = makeServer();
    // Мария (st-2): 21 × В (168 ч. — на нормата); Иван (st-1): 2 × П + 9 свободни часа → извън нормата; Петя (4 ч.): празно.
    S.months['Кърджали|2026-11-01'] = { id: 'm-x', store_name: 'Кърджали', month: '2026-11-01', status: 'draft' };
    const wd = h.w.GrafikEngine.monthInfo('2026-11', []);
    const lV = wd.dow.map(w => (w <= 5 ? 'В' : ''));
    const lI = new Array(30).fill(''); lI[1] = 'П'; lI[2] = 'П'; lI[3] = '9'; lI[5] = 'К';
    S.rows.push({ month_id: 'm-x', staff_id: 'st-2', letters: lV, locked: {} }, { month_id: 'm-x', staff_id: 'st-1', letters: lI, locked: {} });
    const x = env(MGR, { server: S });
    await load(x);
    const got = []; setupX(x, got);
    ok('бутоните „📥 Excel за ТРЗ“ и „🖨 Печат“ са над мрежата', !!btn(mod(x), 'Excel за ТРЗ') && !!btn(mod(x), 'Печат'));
    realClick(x.w, btn(mod(x), 'Excel за ТРЗ'));
    await wait(400); await ticks(8);
    ok('чернова → файл с „_ЧЕРНОВА“ в името', got.length === 1 && got[0].name === 'График_Кърджали_2026-11_ЧЕРНОВА.xlsx', got[0] && got[0].name);
    if (got.length) {
      const wb = await readBack(got[0].buf), ws = wb.worksheets[0];
      const v = a => { const c = ws.getCell(a).value; return c && typeof c === 'object' && 'result' in c ? c.result : c; };
      const f = a => { const c = ws.getCell(a).value; return c && typeof c === 'object' ? c.formula : null; };
      ok('листът е „11.2026“ и НЕ е защитен', ws.name === '11.2026' && !ws.sheetProtection, ws.name + ' ' + JSON.stringify(ws.sheetProtection));
      ok('ред 1: дружество + ЕИК; „ЧЕРНОВА — График за явяване на работа 21 раб.дни/ 168 часа“',
        /ЕООД, ЕИК 207322431$/.test(v('A1')) && v('D1') === 'ЧЕРНОВА — График за явяване на работа 21 раб.дни/ 168 часа', v('A1') + ' | ' + v('D1'));
      ok('„Утвърдил: Теодор Тенев“ след дните', v('AH1') === 'Утвърдил: Теодор Тенев', v('AH1'));
      ok('ред 3 — адресът на дружеството; ред 4 — обект, месец, сезон', v('A3') === 'Адрес: гр. Варна, ул. "Блян" 2' && v('A4') === 'Обект: "Темакс" – Кърджали' &&
        v('D4') === 'за месец ноември 2026 г. · Зима 1 (до 19:30)', v('A3') + ' | ' + v('A4') + ' | ' + v('D4'));
      ok('заглавия: дни 1–30 (ред 11), букви на дните (ред 10: 1.11 = Н)', v('D11') === 1 && v('AG11') === 30 && v('D10') === 'Н' && v('E10') === 'П');
      ok('колони след дните: човекодни, човекочасове, ПОДПИС, О, Б, Н', v('AH7') === 'всичко човекодни' && v('AI7') === 'всичко човекочасове' && v('AJ5') === 'ПОДПИС' &&
        v('AK5') === 'отпуск (О) дни' && v('AL5') === 'болничен (Б) дни' && v('AM5') === 'неплатен (Н) дни');
      ok('редовете: трите служители в графика (без напусналия)', v('B12') === 'Иван Иванов Иванов' && v('B13') === "Мария Д'Анджело" && v('B14') === 'Петя Петрова' && v('B15') === 'ВСИЧКО за обекта:');
      ok('кодовете са след превода/изравняването (Д3/З при В)', v('E13') === 'Д3/З');
      ok('празен ден — наистина празна клетка (без стойност)', ws.getCell('D13').value === null && ws.getCell('D14').value === null);
      ok('човекодни: COUNTIFS с "?*" и без О/Б/Н', f('AH13') === 'COUNTIFS(D13:AG13,"?*",D13:AG13,"<>О",D13:AG13,"<>Б",D13:AG13,"<>Н")', f('AH13'));
      ok('човекочасове: буквални кодове × часове, само изработени, К по пълната смяна', /^COUNTIF\(D13:AG13,"Д1\/Л"\)\*8\+/.test(f('AI13')) &&
        /COUNTIF\(D13:AG13,"Д5\/З"\)\*10\.5/.test(f('AI13')) && /COUNTIF\(D13:AG13,"К"\)\*10\.5/.test(f('AI13')) && !/"О"|"Б"|"Н"/.test(f('AI13')), f('AI13').slice(0, 90));
      let bang = 0, star = 0, n = 0;
      ws.eachRow(r => r.eachCell(c => { const fx = c.value && c.value.formula; if (fx) { n++; if (fx.indexOf('!') >= 0) bang++; if (/"\*"/.test(fx)) star++; } }));
      ok('нито една формула към друг лист; нито една с "*" без ?', n > 10 && bang === 0 && star === 0, n + ' / ' + bang + ' / ' + star);
      ok('Мария: 21 дни, 168 ч. (резултатът е записан до формулата)', v('AH13') === 21 && v('AI13') === 168);
      ok('ВСИЧКО за обекта: SUM по колоната', f('AH15') === 'SUM(AH12:AH14)' && f('AI15') === 'SUM(AI12:AI14)');
      const c4 = ws.getCell('G12');
      ok('свободни часове в черновата: клетката е празна, червена, с бележка „9 свободни ч. — сложи код“', c4.value === null &&
        c4.fill && c4.fill.fgColor.argb === 'FFFCA5A5' && /^9 свободни ч\. — сложи код$/.test(String(c4.note && (c4.note.texts ? c4.note.texts.map(t => t.text).join('') : c4.note))),
        JSON.stringify(c4.note));
      const c6 = ws.getCell('I12');
      ok('„К“ — оранжево, бележка за часовете на пълната смяна', c6.value === 'К' && c6.fill.fgColor.argb === 'FFFED7AA' && /командировка — 10,5 ч\./.test(JSON.stringify(c6.note)));
      const nm = ws.getCell('B12');
      ok('извън нормата в черновата: редът е червен, бележка „X ч. вместо Y ч. — извън нормата“', nm.fill && nm.fill.fgColor.argb === 'FFFEE2E2' &&
        /ч\. вместо 168 ч\. — извън нормата/.test(JSON.stringify(nm.note)), JSON.stringify(nm.note));
      ok('легендата е отдолу (зимни кодове с часовете, О/Н/Б)', (() => { let txt = ''; ws.eachRow(r => { const a = r.getCell(1).value; if (typeof a === 'string') txt += a + '\n'; }); return /Работните смени при зимно работно време/.test(txt) && /Д5\/З – от 8:00 до 19:30/.test(txt) && /О – ПЛАТЕН ГОДИШЕН ОТПУСК/.test(txt) && !/Д4\/Л –/.test(txt); })());
      ok('A4 хоризонтално, събрано по ширина', ws.pageSetup.orientation === 'landscape' && ws.pageSetup.fitToWidth === 1 && ws.pageSetup.paperSize === 9);
      // Петя (4 ч. договор) няма ред в месеца → извън нормата: 0 ч. вместо 21 × 4 = 84 ч. (решение 04.11.2026).
      const pt = ws.getCell('B14');
      ok('няма ред в месеца (чернова) → червен ред с бележка „няма ред в графика за месеца (0 ч. вместо 84 ч.)“', pt.fill && pt.fill.fgColor.argb === 'FFFEE2E2' &&
        /няма ред в графика за месеца \(0 ч\. вместо 84 ч\.\)/.test(JSON.stringify(pt.note)), JSON.stringify(pt.note));
    }
    // Същото на екрана: предупреждение, брояч, мрежа.
    const nw = x.doc.querySelector('#gr-warnings .gr-warn-norow');
    ok('екранът: „ПЕТЯ: няма ред в графика за месеца (0 ч. вместо 84 ч.)“', !!nw && nw.textContent === 'ПЕТЯ: няма ред в графика за месеца (0 ч. вместо 84 ч.)', nw && nw.textContent);
    ok('екранът: броячът „2 извън нормата“ (Иван + Петя)', /^2 извън нормата$/.test(x.doc.getElementById('gr-offnorm').textContent), x.doc.getElementById('gr-offnorm').textContent);
    const pd = x.doc.querySelectorAll('#gr-grid .gr-diff')[2];
    ok('мрежата: разликата на Петя е −84 (червено), не 0', pd && pd.textContent === '-84' && /dc2626/.test(pd.getAttribute('style')), pd && pd.textContent);
    // Записан, но празен ред — същото, с друга дума.
    const S2 = makeServer();
    S2.months['Кърджали|2026-11-01'] = { id: 'm-e', store_name: 'Кърджали', month: '2026-11-01', status: 'draft' };
    S2.rows.push({ month_id: 'm-e', staff_id: 'st-3', letters: [], locked: {} }, { month_id: 'm-e', staff_id: 'st-1', letters: ['', 'П'], locked: {} });
    const e2 = env(MGR, { server: S2 }); await load(e2);
    const ew = Array.from(e2.doc.querySelectorAll('#gr-warnings .gr-warn-norow')).map(li => li.textContent);
    ok('записан празен ред → „редът в графика е празен (0 ч. вместо 84 ч.)“', ew.indexOf('ПЕТЯ: редът в графика е празен (0 ч. вместо 84 ч.)') >= 0, ew.join(' | '));
    ok('…служител с поне един ден не е „празен“ (Иван), а без ред — е (Мария)', !ew.some(t => /^ИВАН/.test(t)) && ew.indexOf('МАРИЯ: няма ред в графика за месеца (0 ч. вместо 168 ч.)') >= 0, ew.join(' | '));

    // Печат на черновата.
    realClick(x.w, btn(mod(x), 'Печат')); await ticks(4);
    const pr = x.doc.getElementById('mod-print'), tbl = x.doc.getElementById('grp-tbl');
    ok('печат: показан е #mod-print с таблицата', pr.style.display === 'block' && !!tbl);
    ok('печат: колони — №, имена, длъжност, 30 дни, 6 сбора и „Запознат / подпис“', tbl.querySelectorAll('colgroup col').length === 3 + 30 + 7 &&
      tbl.querySelector('thead tr').lastElementChild.textContent === 'Запознат / подпис');
    ok('печат: „ЧЕРНОВА“ (надпис и заглавие)', !!x.doc.getElementById('grp-draft') && /^ЧЕРНОВА — ГРАФИК ЗА ЯВЯВАНЕ НА РАБОТА$/.test(x.doc.getElementById('grp-title').textContent));
    ok('печат: „Изготвил … (ръководител обект)“ и „Утвърдил: Теодор Тенев … (управител)“', /\(ръководител обект\)$/.test(x.doc.getElementById('grp-made').textContent) &&
      /^Утвърдил: Теодор Тенев .*\(управител\)$/.test(x.doc.getElementById('grp-appr').textContent));
    ok('печат: общо ч. вкл. О/Б/Н за Мария = 168', tbl.querySelectorAll('tbody tr')[1].children[3 + 30 + 5].textContent === '168');
    ok('печат: редът извън нормата е червен с бележката', /grp-off/.test(tbl.querySelectorAll('tbody tr')[0].className) && /извън нормата/.test(tbl.querySelectorAll('tbody tr')[0].textContent));
    const pcss = x.doc.querySelector('#mod-print style').textContent;
    ok('печат CSS: A4 хоризонтално; white-space:normal, border-box, рамка на последния ред (правило 12)', /@page\{size:A4 landscape;/.test(pcss) &&
      /\.grp-tbl th,\.grp-tbl td\{box-sizing:border-box;[^}]*white-space:normal;/.test(pcss) && /\.grp-tbl tr:last-child td\{border-bottom:1px solid #333;\}/.test(pcss) && /\.grp-tbl\{width:277mm;/.test(pcss));

    // Подаден месец със служител извън нормата → НЕ се прави (нито файл, нито печат), казва кой.
    S.months['Кърджали|2026-11-01'].status = 'submitted';
    S.months['Кърджали|2026-11-01'].snapshot = { header: { company_name: 'Д', company_eik: '1', company_addr: 'А', store_blank_name: 'О', approver: 'У', compiled_by: 'Управител Кърджали', season: 'З1' },
      rows: [{ staff_id: 'st-2', full_name: "Мария Д'Анджело", contract_title: '', hours_per_day: 8, codes: new Array(30).fill(''), official: 160, target: 168, diff: -8, notes: [] }] };
    realClick(x.w, btn(x.doc.getElementById('mod-print'), 'Назад')); await load(x);
    const got2 = []; setupX(x, got2);
    realClick(x.w, btn(mod(x), 'Excel за ТРЗ')); await wait(200); await ticks(6);
    const mdl = x.doc.getElementById('gr-export-issues');
    ok('подаден + извън нормата → без файл, съобщението казва кой', got2.length === 0 && !!mdl && /Мария Д'Анджело: 160 ч\. вместо 168 ч\. — извън нормата\./.test(mdl.textContent), mdl && mdl.textContent);
    S.months['Кърджали|2026-11-01'].snapshot.rows[0] = { staff_id: 'st-2', full_name: "Мария Д'Анджело", contract_title: '', hours_per_day: 8,
      codes: wd.dow.map(w => (w <= 5 ? 'Д1/З' : '')), official: 168, target: 168, diff: 0, notes: [{ day: 3, type: 'hours', text: '9 свободни ч. — ръчен код' }] };
    await load(x); setupX(x, got2);
    realClick(x.w, btn(mod(x), 'Excel за ТРЗ')); await wait(200); await ticks(6);
    ok('подаден + свободни часове → без файл, казва кой и кой ден', got2.length === 0 && /Мария Д'Анджело: 3-ви — 9 свободни ч\. без код\./.test(x.doc.getElementById('gr-export-issues').textContent));
    // Подаден със служител без нито един ден → без файл, казва кой.
    S.months['Кърджали|2026-11-01'].snapshot.rows.push({ staff_id: 'st-3', full_name: 'Петя Петрова', contract_title: '', hours_per_day: 4, codes: new Array(30).fill(''), official: 0, target: 0, diff: 0, notes: [] });
    S.months['Кърджали|2026-11-01'].snapshot.rows[0].notes = [];
    await load(x); setupX(x, got2);
    realClick(x.w, btn(mod(x), 'Excel за ТРЗ')); await wait(200); await ticks(6);
    ok('подаден + служител без ред → без файл: „Петя Петрова: няма ред в графика за месеца (0 ч. вместо 84 ч.).“', got2.length === 0 &&
      /Петя Петрова: няма ред в графика за месеца \(0 ч\. вместо 84 ч\.\)\./.test(x.doc.getElementById('gr-export-issues').textContent), x.doc.getElementById('gr-export-issues').textContent);
    realClick(x.w, btn(x.doc.getElementById('gr-export-modal'), 'Затвори'));
    S.months['Кърджали|2026-11-01'].snapshot.rows.pop();
    await load(x); setupX(x, got2);
    realClick(x.w, btn(mod(x), 'Excel за ТРЗ')); await wait(400); await ticks(8);
    ok('подаден и чист → файл без „_ЧЕРНОВА“', got2.length === 1 && got2[0].name === 'График_Кърджали_2026-11.xlsx', got2[0] && got2[0].name);
    if (got2.length) {
      const ws2 = (await readBack(got2[0].buf)).worksheets[0];
      ok('подаден: заглавката е от СНИМКАТА (замразена), без „ЧЕРНОВА“', ws2.getCell('A1').value === 'Предприятие: Д, ЕИК 1' && ws2.getCell('D1').value === 'График за явяване на работа 21 раб.дни/ 168 часа');
    }
    realClick(x.w, btn(mod(x), 'Печат')); await ticks(4);
    ok('печат на подаден: без „ЧЕРНОВА“, „Изготвил: Управител Кърджали“', !x.doc.getElementById('grp-draft') && /^Изготвил: Управител Кърджали /.test(x.doc.getElementById('grp-made').textContent));

    // Липсващи данни за дружеството и код извън ВТР → без файл и в черновата.
    const y = env(MGR, { missing: ['адрес на дружеството'], company: { name: 'X', eik: null, addr: null } });
    await load(y); const got3 = []; setupX(y, got3);
    realClick(y.w, btn(mod(y), 'Excel за ТРЗ')); await wait(200); await ticks(6);
    ok('липсващ адрес и ЕИК → без файл: „Липсват данни за дружеството — админ: адрес на дружеството, ЕИК на дружеството.“', got3.length === 0 &&
      /Липсват данни за дружеството — админ: адрес на дружеството, ЕИК на дружеството\./.test(y.doc.getElementById('gr-export-issues').textContent));
    realClick(y.w, btn(y.doc.getElementById('gr-export-modal'), 'Затвори'));
    realClick(y.w, btn(mod(y), 'Печат')); await ticks(4);
    ok('…и печатът също спира', y.doc.getElementById('mod-print').innerHTML.indexOf('grp-tbl') < 0 && !!y.doc.getElementById('gr-export-modal'));
    const z = env(MGR);
    await load(z); const got4 = []; setupX(z, got4);
    z.w.grRows['st-1'] = { letters: [], locked: { '4': 'Д7' } }; z.w.grRecalc();
    realClick(z.w, btn(mod(z), 'Excel за ТРЗ')); await wait(200); await ticks(6);
    ok('код извън ВТР (заключен Д7 от стария правилник) → без файл, казва кой и кой ден', got4.length === 0 &&
      /Иван Иванов Иванов: 4-ви — код „Д7“ не е във ВТР за месеца\./.test(z.doc.getElementById('gr-export-issues').textContent));
  }

  report();
})();
