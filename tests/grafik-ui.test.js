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
const TRZ = { id: 'u-trz', email: 'trz@temax.bg', display_name: 'ТРЗ', role: 'admin', store_name: 'Централен офис' };
const REG = { id: 'u-reg', email: 't.ivanova@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Шумен'] };
const BETA = 'ten.tenev@temax.bg, Tencho.Tenev13@gmail.com, sklad.k@temax.bg';
const BETA_ALL = BETA + ', trz@temax.bg, t.ivanova@temax.bg';

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
    fail: opt.fail || {},
    // Админ картата (етап 1е-3) — същата форма като admin_get / access_list в handler.ts.
    adm: {
      companies: [{ id: 'c3', name: '"ТЕМАКС ТЦД 3" ЕООД', eik: '207322431', mol: null, addr: 'гр. Варна' }, { id: 'cy', name: '"ТЕМАКС ЮГ" ЕООД', eik: '202885071', mol: null, addr: null }],
      grafik_store_company: [{ id: 'sc1', store_name: 'Кърджали', company_id: 'c3', blank_name: '"Темакс" – Кърджали', address: null, valid_from: null, valid_to: null }],
      grafik_company_terms: [{ id: 't1', company_id: 'c3', vtr_id: 'vtr1', approver: 'Теодор Тенев', valid_from: '2026-11-01', valid_to: null }],
      grafik_extra_days: [], grafik_letter_map: [], vtrs: [{ id: 'vtr1', name: 'ВТР ТЦД 3 / ТЦД 4 / Темакс Юг' }], stores: ['Кърджали', 'Шумен', 'Раднево']
    },
    access: [{ id: 'a1', list: 'trz', email: 'trz@temax.bg', note: null, created_by: 'migration' }]
  };
  const me = u => {
    // ТРЗ има предимство пред admin (handler.ts access): чете всичко, не пише.
    if (u.email === 'trz@temax.bg') return { kind: 'trz', stores: [{ name: 'Кърджали', can_edit: false }, { name: 'Шумен', can_edit: false }] };
    if (u.is_regional) return { kind: 'regional', stores: (u.assigned_stores || []).map(n => ({ name: n, can_edit: true })) };
    if (u.role === 'admin') return { kind: 'admin', stores: [{ name: 'Кърджали', can_edit: true }, { name: 'Шумен', can_edit: true }] };
    if (u.role === 'manager') return { kind: 'manager', stores: [{ name: u.store_name, can_edit: true }] };
    return { kind: 'viewer', stores: [{ name: u.store_name, can_edit: false }] };
  };
  S.handle = (u, b) => {
    S.calls.push(b); S.log.push('→' + b.action);
    // Списъкът beta (grafik_access) — проверява се при ВСЯКА заявка, както в handler.ts.
    if ((S.beta || []).indexOf(String(u.email || '').trim().toLowerCase()) < 0) return { status: 403, body: { ok: false, reason: 'not_beta', message: 'Модулът „Работен график“ още не е отворен за този акаунт.' } };
    if (S.fail[b.action]) { const fr = S.fail[b.action](b); if (fr) return fr; }
    const M = me(u), canEdit = st => M.stores.some(s => s.name === st && s.can_edit);
    const key = (st, m) => st + '|' + m;
    switch (b.action) {
      case 'me': return { status: 200, body: Object.assign({ ok: true, can_admin: M.kind === 'admin', name: u.display_name, email: u.email }, M) };
      case 'overview': {
        // Обхватът (дружество с ВТР) и „извън нормата“ от снимката се смятат в handler.ts — тук е
        // само формата на отговора; логиката е заключена в handler.test.ts.
        const m = b.month + '-01', scope = ['Кърджали', 'Шумен'];
        let list = scope.filter(st => M.kind === 'admin' || M.kind === 'trz' || M.stores.some(s => s.name === st)).map(st => {
          const mo = S.months[key(st, m)], sub = !!mo && mo.status === 'submitted';
          return { store: st, company: '"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 3" ЕООД', status: mo ? mo.status : null, submitted_at: mo ? mo.submitted_at || null : null,
            submitted_by_name: mo ? mo.submitted_by_name || null : null, rows: mo ? S.rows.filter(r => r.month_id === mo.id).length : 0,
            staff: S.staff.filter(s => s.store_name === st && !s.left_on).length, can_edit: canEdit(st),
            last_at: mo ? mo.last_at || null : null, last_by: mo ? mo.last_by || null : null, off_norm: sub ? (mo.off_norm || []) : null,
            changes: sub ? (S.changes || []).filter(c => c.month_id === mo.id).length : null, changes_open: sub ? (S.changes || []).filter(c => c.month_id === mo.id && !c.trz_done).length : null };
        });
        if (M.kind === 'trz') list = list.filter(s => s.status === 'submitted').map(s => Object.assign(s, { staff: 0 }));
        return { status: 200, body: { ok: true, month: m, stores: list, no_company: M.kind === 'admin' ? ['Пазарджик'] : [] } };
      }
      case 'load_month': {
        const m = b.month + '-01', mo = S.months[key(b.store, m)];
        if (M.kind === 'trz' && (!mo || mo.status !== 'submitted')) return { status: 404, body: { ok: false, reason: 'not_submitted', message: 'Графикът за този месец още не е подаден.' } };
        const pm = (() => { const y = +b.month.slice(0, 4), mm = +b.month.slice(5); const p = mm === 1 ? (y - 1) + '-12' : y + '-' + String(mm - 1).padStart(2, '0'); return S.months[key(b.store, p + '-01')]; })();
        return { status: 200, body: { ok: true, store: b.store, month: m, can_edit: canEdit(b.store) && (!mo || mo.status === 'draft'),
          // can_reopen — по вида достъп (ТРЗ е admin по роля, но не връща в чернова)
          can_reopen: M.kind === 'admin' && !!mo && mo.status === 'submitted', status: mo ? mo.status : 'draft', month_row: mo || null,
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
        mo.last_at = '2026-11-04T10:15:00Z'; mo.last_by = u.display_name;     // за обзора (сървърът — по grafik_rows)
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
      case 'changes_list': case 'changes_save': case 'changes_delete': case 'changes_trz': {
        // „Промени“ (П1) — правилата са в handler.ts и се проверяват в handler.test.ts; тук — само формата.
        const mo = S.months[key(b.store, b.month + '-01')];
        if (!mo || mo.status !== 'submitted') return { status: 409, body: { ok: false, reason: 'not_submitted', message: 'Промените се въвеждат след подаване на графика.' } };
        S.changes = S.changes || [];
        if (b.action === 'changes_list') return { status: 200, body: { ok: true, rows: S.changes.filter(c => c.month_id === mo.id).map(c => Object.assign({}, c)) } };
        if (b.action === 'changes_trz') {
          if (M.kind !== 'trz' && M.kind !== 'admin') return { status: 403, body: { ok: false, reason: 'forbidden', message: '„Отразено в ТРЗ“ отмятат ТРЗ.' } };
          const c = S.changes.filter(x => x.id === b.id)[0];
          Object.assign(c, b.done ? { trz_done: true, trz_done_by: u.email, trz_done_at: '2026-11-05T12:00:00Z' } : { trz_done: false, trz_done_by: null, trz_done_at: null });
          return { status: 200, body: { ok: true, row: c } };
        }
        if (!canEdit(b.store)) return { status: 403, body: { ok: false, reason: 'readonly', message: 'Нямате права.' } };
        if (b.action === 'changes_delete') { S.changes = S.changes.filter(x => x.id !== b.id); return { status: 200, body: { ok: true, deleted: 1 } }; }
        const sr = (mo.snapshot.rows || []).filter(r => r.staff_id === b.staff_id)[0];
        const row = S.rows.filter(r => r.month_id === mo.id && r.staff_id === b.staff_id)[0];
        const fields = { staff_id: b.staff_id, day: b.day, actual: b.actual, reason: b.reason, planned_letter: (row && row.letters[b.day - 1]) || '', planned_code: (sr && sr.codes[b.day - 1]) || '',
          updated_by: u.email, updated_at: '2026-11-05T10:00:00Z' };
        if (b.id) { Object.assign(S.changes.filter(x => x.id === b.id)[0], fields); return { status: 200, body: { ok: true, row: fields } }; }
        const c = Object.assign({ id: 'ch-' + (++S.seq), month_id: mo.id, created_by: u.email, created_at: '2026-11-05T10:00:00Z', trz_done: false }, fields);
        S.changes.push(c);
        return { status: 200, body: { ok: true, row: c } };
      }
      case 'access_list': case 'admin_get': case 'access_add': case 'access_remove': case 'admin_save': case 'admin_delete': {
        if (M.kind !== 'admin') return { status: 403, body: { ok: false, reason: 'forbidden', message: 'Само admin.' } };
        if (b.action === 'access_list') return { status: 200, body: { ok: true, rows: S.access.concat((S.beta || []).map((e, i) => ({ id: 'b' + i, list: 'beta', email: e, note: null }))) } };
        if (b.action === 'admin_get') return { status: 200, body: Object.assign({ ok: true }, JSON.parse(JSON.stringify(S.adm))) };
        if (b.action === 'access_add') {
          if (b.email === String(u.email).toLowerCase()) return { status: 409, body: { ok: false, reason: 'self', message: 'Собствения си имейл не променяш оттук — би загубил достъпа до администрацията.' } };
          if (b.list === 'beta') S.beta.push(b.email); else S.access.push({ id: 'a' + (++S.seq), list: b.list, email: b.email, note: b.note || null });
          return { status: 200, body: { ok: true, row: { email: b.email } } };
        }
        if (b.action === 'access_remove') {
          if (/^b\d+$/.test(b.id)) S.beta.splice(+b.id.slice(1), 1); else S.access = S.access.filter(a => a.id !== b.id);
          return { status: 200, body: { ok: true, deleted: 1 } };
        }
        if (b.action === 'admin_delete') { S.adm[b.table] = S.adm[b.table].filter(x => x.id !== b.id); return { status: 200, body: { ok: true, deleted: 1 } }; }
        if (b.id) Object.assign(S.adm[b.table].filter(x => x.id === b.id)[0], b.fields); else S.adm[b.table].push(Object.assign({ id: 'n' + (++S.seq) }, b.fields));
        return { status: 200, body: { ok: true, row: b.fields } };
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
  // beta — в сървъра (grafik_access), не в app_settings: браузърът го научава само от „me“.
  if (opt.beta !== undefined || !S.beta) S.beta = String(opt.beta === undefined ? BETA : opt.beta).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const h = boot({
    modules: ['grafik-engine.js', 'grafik.js'], user,
    data: {},
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
    ok('извън списъка → „Нямаш достъп“; единствената заявка е „me“ (отказана 403 not_beta)', !!h2.doc.getElementById('gr-noaccess') && h2.S.calls.map(c => c.action).join() === 'me,me', h2.S.calls.map(c => c.action).join());
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
  // Вариант (а), 04.11.2026: извън нормата / свободни часове / без ред → „Подай“ спира.
  const bl = Array.from(h.doc.querySelectorAll('#gr-submit-issues li')).map(li => li.textContent);
  ok('извън нормата → „Подай“ спира: прозорец със списъка, без confirm и без submit',
    !!h.doc.getElementById('gr-submit-modal') && h.calls.confirm.length === 0 && !h.S.calls.some(c => c.action === 'submit'), bl.join(' | '));
  ok('списъкът казва кой и с колко („Петя Петрова: 4 ч. вместо 84 ч.“, Мария — … вместо 168 ч.)',
    bl.indexOf('Петя Петрова: 4 ч. вместо 84 ч.') >= 0 && bl.some(t => /^Мария Д'Анджело: [\d,]+ ч\. вместо 168 ч\.$/.test(t)), bl.join(' | '));
  ok('подсказката под списъка', (h.doc.getElementById('gr-submit-hint') || {}).textContent === 'Сложи кодове за дните или О/Б/Н; ако човекът не работи този месец — махни го от месеца.');
  realClick(h.w, btn(h.doc.getElementById('gr-submit-modal'), 'Затвори'));
  // Свободни часове в иначе пълен ред също спират.
  h.w.grSelect(0, 0);
  h.w.grPaste({ clipboardData: { getData: () => [line, line, line].join('\n') }, preventDefault() {} });
  ok('попълнени до нормата → 0 извън нормата', h.w.grOffCount() === 0, h.w.grOffCount());
  h.w.grSelect(2, 0); typeIn(h, '9'); key(h, 'Enter');               // 1.11 (нд) — 9 свободни ч.
  realClick(h.w, btn(M, 'Подай')); await ticks(8);
  const bl2 = Array.from(h.doc.querySelectorAll('#gr-submit-issues li')).map(li => li.textContent);
  ok('свободни часове → спира: „Петя Петрова: 9 свободни ч. на 01.11 — сложи код“',
    bl2.indexOf('Петя Петрова: 9 свободни ч. на 01.11 — сложи код') >= 0 && !h.S.calls.some(c => c.action === 'submit'), bl2.join(' | '));
  realClick(h.w, btn(h.doc.getElementById('gr-submit-modal'), 'Затвори'));
  h.w.grSelect(2, 0); key(h, 'Delete');
  await wait(1000); await ticks();
  realClick(h.w, btn(M, 'Подай'));
  await ticks(8);
  ok('всичко в нормата → confirm и подаване', h.calls.confirm.length === 1 && !h.doc.querySelector('#gr-submit-modal.open'), h.calls.confirm.length);
  const sub = h.S.calls.filter(c => c.action === 'submit')[0];
  ok('submit е изпратен', !!sub);
  if (sub) {
    ok('снимката има всичките 3 реда', sub.snapshot.rows.length === 3, sub.snapshot.rows.length);
    ok('кодовете са по 30 (дните)', sub.snapshot.rows.every(r => r.codes.length === 30));
    ok('снимката: заключеният/сменен код и Д5/1 на 4-часовия', sub.snapshot.rows[2].codes[1] === 'Д5/1');
    ok('сборове в снимката', typeof sub.snapshot.totals.man_hours === 'number' && sub.snapshot.norm === 168);
    ok('снимката носи нормата на човека (сървърът я ползва за „0 ч. вместо N ч.“)', sub.snapshot.rows[0].norm === 168 && sub.snapshot.rows[2].norm === 84, JSON.stringify(sub.snapshot.rows.map(r => r.norm)));
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
    r.w.grSubmitIssues = () => [];                                       // тук се проверява редът на записите, не нормата (тя — в раздел 7)
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
    f.w.grSubmitIssues = () => [];                                       // същото — тук е падналият запис
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
      ok('легендата е отдолу — и двата сезона (05.11.2026): лятото и зимата с часовете, О/Н/Б', (() => { let txt = ''; ws.eachRow(r => { const a = r.getCell(1).value; if (typeof a === 'string') txt += a + '\n'; }); return /Работните смени при зимно работно време/.test(txt) && /Д5\/З – от 8:00 до 19:30/.test(txt) && /О – ПЛАТЕН ГОДИШЕН ОТПУСК/.test(txt) && /Работните смени при лятно работно време \(май–октомври\) са:/.test(txt) && /Д4\/Л – от 8:00 до 20:00/.test(txt) && txt.indexOf('лятно') < txt.indexOf('зимно'); })());
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
    ok('печат: колони — №, имена, длъжност, 30 дни, после чов. дни, чов. часове, „Запознат / подпис“, О, Б, Н, общо (както AI–AO в бланката)', tbl.querySelectorAll('colgroup col').length === 3 + 30 + 7 &&
      Array.from(tbl.querySelector('thead tr').children).slice(-7).map(th => th.textContent).join('|') === 'чов.дни|чов.часове|Запознат / подпис|О|Б|Н|общо ч. вкл. О/Б/Н', Array.from(tbl.querySelector('thead tr').children).slice(-7).map(th => th.textContent).join('|'));
    ok('печат: „ЧЕРНОВА“ (надпис и заглавие)', !!x.doc.getElementById('grp-draft') && /^ЧЕРНОВА — ГРАФИК ЗА ЯВЯВАНЕ НА РАБОТА$/.test(x.doc.getElementById('grp-title').textContent));
    ok('печат: „Изготвил … (ръководител обект)“ и „Утвърдил: Теодор Тенев … (управител)“', /\(ръководител обект\)$/.test(x.doc.getElementById('grp-made').textContent) &&
      /^Утвърдил: Теодор Тенев .*\(управител\)$/.test(x.doc.getElementById('grp-appr').textContent));
    ok('печат: общо ч. вкл. О/Б/Н за Мария = 168', tbl.querySelectorAll('tbody tr')[1].children[3 + 30 + 6].textContent === '168' && tbl.querySelectorAll('tbody tr')[1].children[3 + 30 + 2].textContent === '');
    ok('печат: редът извън нормата е червен с бележката', /grp-off/.test(tbl.querySelectorAll('tbody tr')[0].className) && /извън нормата/.test(tbl.querySelectorAll('tbody tr')[0].textContent));
    const pcss = x.doc.querySelector('#mod-print style').textContent;
    // Легендата — на листа с таблицата (04.11.2026): подписите, ВТР и легендата са един неразделим блок
    // под таблицата; редовете са по-ниски, обвивката е без отстъп при печат. Лейаутът е измерен в PDF
    // от Edge (Кърджали 11.2026, 41 реда → 1 лист; до 43 → 1; 60 → 2) — jsdom не смята лейаут (правило 12).
    const foot = x.doc.getElementById('grp-foot'), leg = x.doc.getElementById('grp-legend');
    ok('печат: легендата е в блока с подписите, СЛЕД „Утвърдил“, и блокът е веднага след таблицата',
      !!foot && foot.contains(leg) && foot.contains(x.doc.getElementById('grp-appr')) &&
      !!(x.doc.getElementById('grp-appr').compareDocumentPosition(leg) & 4) && tbl.nextElementSibling === foot);
    ok('печат: легендата — дребен шрифт, ТРИ колони (двата сезона в две не се събират на 1 лист — измерено 05.11.2026)', /\.grp-legend\{columns:3;[^}]*font-size:6\.5px;/.test(pcss) && leg.children.length > 0);
    const lt = Array.from(leg.querySelectorAll('.grp-leg-title')).map(d => d.textContent);
    ok('печат: легендата — заглавие за лятото, после за зимата; кодове и от двата сезона', lt.length === 2 && /^Работните смени при лятно/.test(lt[0]) && /^Работните смени при зимно/.test(lt[1]) &&
      /Д4\/Л – /.test(leg.textContent) && /Д5\/З – /.test(leg.textContent) && /О – ПЛАТЕН/.test(leg.textContent), lt.join(' | '));
    ok('печат CSS: блокът не се къса (break-inside:avoid)', /#grp-foot\{break-inside:avoid;page-break-inside:avoid;\}/.test(pcss));
    ok('печат CSS: редовете с отстъп 0.15mm (досега 0.4mm → легендата падаше на втори лист)', /\.grp-tbl th,\.grp-tbl td\{[^}]*padding:0\.15mm 0\.2mm;/.test(pcss));
    ok('печат CSS: обвивката без отстъп при печат', /@media print\{#grp-page\{padding:0 !important;\}\}/.test(pcss) && !!x.doc.getElementById('grp-page'));
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

  section('14. Назначен / напуснал в месеца; отказ от сървъра (04.11.2026)');
  {
    const S = makeServer();
    S.staff.filter(s => s.id === 'st-2')[0].hired_on = '2026-11-16';       // Мария — от 16.11: 11 работни дни
    S.staff.filter(s => s.id === 'st-3')[0].hired_on = '2026-11-29';       // Петя — от 29.11 (нд): само 30.11
    const n = env(MGR, { server: S });
    await load(n);
    const wd = n.w.GrafikEngine.monthInfo('2026-11', []);
    const from16 = wd.dow.map((w, i) => (w <= 5 && i >= 15 ? 'П' : '')).join('\t');
    n.w.grSelect(1, 0);
    n.w.grPaste({ clipboardData: { getData: () => from16 }, preventDefault() {} });
    const md = n.doc.querySelectorAll('#gr-grid .gr-diff')[1];
    ok('назначена 16.11, работи всеки работен ден от 16.11 → разлика 0 (цел 88, не 168)', md && md.textContent === '0' && n.w.grCalc.rows[1].target === 88, md && md.textContent);
    const ws = Array.from(n.doc.querySelectorAll('#gr-warnings .gr-warn-norow')).map(li => li.textContent);
    ok('Петя (от 29.11, 4 ч.) без ред → „0 ч. вместо 4 ч.“ — нормата е само за 30.11', ws.indexOf('ПЕТЯ: няма ред в графика за месеца (0 ч. вместо 4 ч.)') >= 0, ws.join(' | '));
    n.w.grRows['st-1'] = { letters: from16.split('\t').map((v, i) => i < 15 && wd.dow[i] <= 5 ? 'П' : v), locked: {} };
    Object.assign(S.staff.filter(s => s.id === 'st-3')[0], { hired_on: null, left_on: '2026-11-01' });   // напуснала в неделя 1.11 — в месеца, 0 работни дни
    n.w.grData.staff = S.staff.filter(s => s.store_name === 'Кърджали'); n.w.grRecalc();
    ok('Петя напуснала 1.11 (нд) е в графика, но с норма 0', n.w.grCalc.rows.length === 3 && n.w.grCalc.rows[2].norm === 0);
    ok('Иван пълен, Мария от 16.11, Петя с норма 0 и празен ред → нищо не спира', n.w.grSubmitIssues().length === 0, n.w.grSubmitIssues().join(' | '));
    // Сървърът отказва (напр. друг браузър / стар файл) → същият прозорец със списъка от сървъра.
    S.fail.submit = () => ({ status: 409, body: { ok: false, reason: 'off_norm', message: 'Графикът не може да се подаде: …', issues: ['Иван Иванов Иванов: 160 ч. вместо 168 ч.'], hint: 'x' } });
    await wait(1000); await ticks();
    realClick(n.w, btn(mod(n), 'Подай')); await ticks(10);
    const si = Array.from(n.doc.querySelectorAll('#gr-submit-issues li')).map(li => li.textContent);
    ok('409 off_norm от сървъра → прозорецът със списъка му, не тост', JSON.stringify(si) === JSON.stringify(['Иван Иванов Иванов: 160 ч. вместо 168 ч.']) && !n.calls.toast.some(t => /Не е подаден/.test(t)), si.join(' | ') + ' / ' + n.calls.toast.join(' | '));
  }

  section('15. Етап 1е-1: обзор по обекти (admin / регионален) и екран за ТРЗ');
  {
    const S = makeServer();
    const ovRows = h => Array.from(h.doc.querySelectorAll('#gr-ov-tbl tbody tr'));
    const ovCalls = h => h.S.calls.filter(c => c.action === 'overview');
    // Кърджали — чернова, попълнена от управителя.
    const m0 = env(MGR, { server: S, beta: BETA_ALL });
    await load(m0);
    ok('manager: без „🏬 Обекти“', !btn(mod(m0), 'Обекти'));
    m0.w.grSelect(0, 1); typeIn(m0, 'П'); key(m0, 'Enter');
    await wait(1000); await ticks();
    m0.w.grSetView('overview'); await ticks(4);
    ok('manager: grSetView(\'overview\') не прави нищо (няма заявка)', ovCalls(m0).length === 0 && m0.w.grView !== 'overview');

    const a = env(ADM, { server: S, beta: BETA_ALL });
    await load(a);
    ok('admin: започва от своя график; има „🏬 Обекти“', a.w.grView === 'grid' && !!btn(mod(a), 'Обекти'));
    realClick(a.w, btn(mod(a), 'Обекти')); await ticks(8);
    const ar = ovRows(a);
    ok('admin: обзорът за ноември — Кърджали и Шумен', ovCalls(a).length === 1 && ovCalls(a)[0].month === '2026-11' && ar.length === 2 && /Кърджали/.test(ar[0].textContent) && /Шумен/.test(ar[1].textContent), ar.map(r => r.textContent).join(' | '));
    ok('admin: Кърджали — „✎ Чернова“, последна промяна „Управител Кърджали · 04.11.2026 чч:мм“', /Чернова/.test(ar[0].querySelector('.gr-ov-st').textContent) &&
      /^Управител Кърджали · 04\.11\.2026 \d\d:\d\d$/.test(ar[0].querySelector('.gr-ov-when').textContent), ar[0].querySelector('.gr-ov-when').textContent);
    ok('admin: черновата — „извън нормата“ само за подадени', /само за подадени/.test(ar[0].textContent));
    ok('admin: Шумен — „— не е започнат“', /не е започнат/.test(ar[1].querySelector('.gr-ov-st').textContent));
    ok('admin: обектите без дружество — отделен сив ред', /Без дружество \(не са в обзора\): Пазарджик/.test((a.doc.getElementById('gr-ov-nocomp') || {}).textContent || ''));
    ok('admin: в обзора — „Всички обекти“, не избор на обект', !a.doc.getElementById('gr-store') && /Всички обекти/.test(a.doc.getElementById('gr-toolbar').textContent));
    realClick(a.w, btn(a.doc.getElementById('gr-toolbar'), '▶')); await ticks(8);
    ok('admin: ▶ в обзора → обзор за декември (без load_month)', ovCalls(a).slice(-1)[0].month === '2026-12' && a.w.grView === 'overview' && /декември 2026/.test(a.doc.getElementById('gr-overview').textContent));
    realClick(a.w, btn(a.doc.getElementById('gr-toolbar'), '◀')); await ticks(8);
    realClick(a.w, btn(ovRows(a)[1], 'Отвори')); await ticks(8);
    ok('admin: „Отвори →“ на Шумен → графикът на Шумен за ноември', a.w.grView === 'grid' && a.w.grStore === 'Шумен' && a.S.calls.slice(-2).some(c => c.action === 'load_month' && c.store === 'Шумен' && c.month === '2026-11'));

    const rg = env(REG, { server: S, beta: BETA_ALL });
    await load(rg);
    realClick(rg.w, btn(mod(rg), 'Обекти')); await ticks(8);
    ok('регионален: обзорът — само своите (Шумен), без реда „без дружество“', ovRows(rg).length === 1 && /Шумен/.test(ovRows(rg)[0].textContent) && !rg.doc.getElementById('gr-ov-nocomp'));

    // ТРЗ: Кърджали още е чернова → празен обзор.
    const t = env(TRZ, { server: S, beta: BETA_ALL });
    const n0 = S.calls.length;                                            // сървърът е общ — броим само заявките на ТРЗ
    await load(t);
    const tc = S.calls.slice(n0);
    ok('ТРЗ: започва от обзора (без load_month)', t.w.grView === 'overview' && tc.filter(c => c.action === 'overview').length === 1 && !tc.some(c => c.action === 'load_month'), tc.map(c => c.action).join(','));
    ok('ТРЗ: няма подадени → „Няма подадени графици за ноември 2026 г.“', /Няма подадени графици за ноември 2026 г\./.test((t.doc.getElementById('gr-ov-empty') || {}).textContent || ''));
    ok('ТРЗ: без „👥 Персонал“', !btn(mod(t), 'Персонал'));
    t.w.grSetView('staff'); await ticks(4);
    ok('ТРЗ: grSetView(\'staff\') не прави нищо', t.w.grView === 'overview');
    // Подаваме Кърджали (със стар случай „извън нормата“ в снимката) → ТРЗ го вижда.
    const mk = S.months['Кърджали|2026-11-01'];
    Object.assign(mk, { status: 'submitted', submitted_by_name: 'Управител Кърджали', submitted_at: '2026-11-04T11:00:00Z', off_norm: ['Красимира Павлова: 40 ч. вместо 168 ч.'],
      snapshot: { rows: [], header: {} } });
    await load(t);
    const tr = ovRows(t);
    ok('ТРЗ: подаденият Кърджали — „✔ Подаден“, „от Управител Кърджали · 04.11.2026 …“; без колона „Служители“', tr.length === 1 && /Подаден/.test(tr[0].querySelector('.gr-ov-st').textContent) &&
      /^от Управител Кърджали · 04\.11\.2026 \d\d:\d\d$/.test(tr[0].querySelector('.gr-ov-when').textContent) &&
      !Array.from(t.doc.querySelectorAll('#gr-ov-tbl th')).some(th => th.textContent === 'Служители'), tr[0] && tr[0].textContent);
    ok('ТРЗ: извън нормата — от снимката, червено', /Красимира Павлова: 40 ч\. вместо 168 ч\./.test((tr[0].querySelector('.gr-ov-off') || {}).textContent || ''));
    mk.off_norm = []; await load(t);
    ok('подаден, празен списък → „всички на нормата“', /всички на нормата/.test(ovRows(t)[0].textContent));
    t.w.grOverview.stores[0].off_norm = null; t.w.grRender();
    ok('подаден без off_norm (стар сървър) → „—“, не „всички на нормата“', !/всички на нормата/.test(ovRows(t)[0].textContent));
    mk.off_norm = ['Красимира Павлова: 40 ч. вместо 168 ч.']; await load(t);
    realClick(t.w, btn(tr[0], 'Отвори')); await ticks(10);
    const tm = mod(t);
    ok('ТРЗ: отваря подадения график — заключен (без „Подай“, „Ритъмът“, „Заключи“)', t.w.grView === 'grid' && /Подаден/.test(t.doc.getElementById('gr-status').textContent) &&
      !btn(tm, 'Подай') && !btn(tm, 'Ритъмът') && !btn(tm, 'Заключи'));
    ok('ТРЗ: „📥 Excel за ТРЗ“ и „🖨 Печат“ — да; „↩ Върни“ и „👥 Персонал“ — не', !!btn(tm, 'Excel за ТРЗ') && !!btn(tm, 'Печат') && !btn(tm, 'Върни') && !btn(tm, 'Персонал'));
    ok('ТРЗ: в лентата — само обектите с подаден график (Кърджали, без избор)', !t.doc.getElementById('gr-store') && /Кърджали/.test(t.doc.getElementById('gr-toolbar').textContent));
    const before = t.S.calls.filter(c => c.action === 'save_rows').length;
    t.w.grSelect(0, 4); typeIn(t, 'В'); key(t, 'Enter'); key(t, 'Delete');
    await wait(1000); await ticks();
    ok('ТРЗ: клавиатурата не пише (няма save_rows)', t.S.calls.filter(c => c.action === 'save_rows').length === before);
    realClick(t.w, btn(tm, 'Обекти')); await ticks(8);
    ok('ТРЗ: „🏬 Обекти“ връща към обзора', t.w.grView === 'overview' && ovRows(t).length === 1);
  }

  section('16. Етап 1е-3: табът по „me“ и картата „📆 График“ в Администрация');
  {
    const S = makeServer();
    const card = h => h.doc.getElementById('gr-admin-card');
    const calls = (h, a) => h.S.calls.filter(c => c.action === a);
    // Табът: сървърът казва (403 not_beta → скрит), app_settings не се чете изобщо.
    const t0 = env(MGR, { server: S, beta: BETA_ALL });
    await t0.w.grLoadUsers(); await ticks();
    ok('табът — по „me“: manager от beta → видим', t0.doc.getElementById('tab-grafik').style.display === '' && calls(t0, 'me').length >= 1);
    ok('браузърът не чете app_settings за таба (нито един GET към него)', Array.isArray(t0.calls.get) && !t0.calls.get.some(u => /app_settings/.test(String(u))), (t0.calls.get || []).join(' | '));
    const t1 = env(MGR, { server: makeServer({ fail: { me: () => ({ status: 401, body: { ok: false, reason: 'session_expired', message: 'x' } }) } }) });
    await t1.w.grLoadUsers(); await ticks();
    ok('401 (изтекъл пропуск) → табът е скрит', t1.doc.getElementById('tab-grafik').style.display === 'none');
    await load(t1);
    ok('…а отвореният таб казва „Сесията е изтекла“, не „Нямаш достъп“', /Сесията е изтекла/.test((t1.doc.getElementById('gr-error') || {}).textContent || '') && !t1.doc.getElementById('gr-noaccess'));

    // Картата — admin.
    const a = env(ADM, { server: S, beta: BETA_ALL });
    await a.w.grAdminLoad(); await ticks(6);
    const c = card(a);
    ok('admin: картата „📆 График“ е в Администрация', !!c && c.parentNode === a.doc.getElementById('mod-admin') && /📆 График/.test(c.textContent));
    const beta = Array.from(a.doc.querySelectorAll('#gr-adm-beta tbody tr')).map(r => r.cells[0].textContent);
    const trz = Array.from(a.doc.querySelectorAll('#gr-adm-trz tbody tr')).map(r => r.cells[0].textContent);
    ok('списъците beta и ТРЗ — от grafik-api', beta.indexOf('ten.tenev@temax.bg') >= 0 && beta.indexOf('trz@temax.bg') >= 0 && JSON.stringify(trz) === '["trz@temax.bg"]', beta.join(',') + ' / ' + trz.join(','));
    ok('дружество без адрес — „липсва“ в червено', /липсва/.test(a.doc.querySelector('#gr-adm-companies tbody tr:nth-child(2)').textContent) && /dc2626/.test(a.doc.querySelector('#gr-adm-companies tbody tr:nth-child(2) td:nth-child(4)').getAttribute('style') || ''));
    ok('ВТР — с името, не с id; утвърдил и период', /ВТР ТЦД 3 \/ ТЦД 4 \/ Темакс Юг/.test(a.doc.getElementById('gr-adm-terms').textContent) && /Теодор Тенев/.test(a.doc.getElementById('gr-adm-terms').textContent) && /01\.11\.2026 – …/.test(a.doc.getElementById('gr-adm-terms').textContent));
    ok('обект → дружество — името на дружеството', /"ТЕМАКС ТЦД 3" ЕООД/.test(a.doc.getElementById('gr-adm-store-company').textContent));

    // Добавяне в списък.
    a.doc.getElementById('gr-adm-email').value = '  Nov.Regionalen@Temax.bg ';
    a.doc.getElementById('gr-adm-list').value = 'beta';
    realClick(a.w, btn(card(a), 'Добави')); await ticks(8);
    const add = calls(a, 'access_add').slice(-1)[0];
    ok('➕ Добави → access_add с малки букви и без интервали', !!add && add.email === 'nov.regionalen@temax.bg' && add.list === 'beta', JSON.stringify(add));
    ok('…и списъкът е презареден с новия', Array.from(a.doc.querySelectorAll('#gr-adm-beta tbody tr')).some(r => r.cells[0].textContent === 'nov.regionalen@temax.bg'));
    const nAdd = calls(a, 'access_add').length;
    a.doc.getElementById('gr-adm-email').value = 'без-маймунка';
    realClick(a.w, btn(card(a), 'Добави')); await ticks(4);
    ok('невалиден имейл → съобщение, без заявка', calls(a, 'access_add').length === nAdd && a.calls.toast.some(t => /Невалиден имейл/.test(t)));
    a.doc.getElementById('gr-adm-email').value = 'ten.tenev@temax.bg'; a.doc.getElementById('gr-adm-list').value = 'trz';
    realClick(a.w, btn(card(a), 'Добави')); await ticks(6);
    ok('собственият имейл → отказ от сървъра, показан в съобщението', a.calls.toast.some(t => /Собствения си имейл/.test(t)));
    // Махане: отказано потвърждение → нищо.
    const no = env(ADM, { server: S, confirm: false });
    await no.w.grAdminLoad(); await ticks(6);
    const nRem = calls(no, 'access_remove').length;
    realClick(no.w, btn(no.doc.querySelector('#gr-adm-trz tbody tr'), 'Махни')); await ticks(6);
    ok('✕ Махни, потвърждението отказано → без access_remove', calls(no, 'access_remove').length === nRem && no.calls.confirm.some(m => /Да махна trz@temax.bg от ТРЗ/.test(m)));
    no.doc.getElementById('gr-admin-card').remove();
    // Махане.
    const trzRow = a.doc.querySelector('#gr-adm-trz tbody tr');
    realClick(a.w, btn(trzRow, 'Махни')); await ticks(8);
    ok('✕ Махни (с потвърждение) → access_remove; ТРЗ списъкът е празен', calls(a, 'access_remove').length === 1 && /няма/.test(a.doc.querySelector('#gr-adm-trz tbody').textContent));

    // Дружество: редакция.
    realClick(a.w, btn(a.doc.querySelector('#gr-adm-companies tbody tr:nth-child(2)'), '✏️')); await ticks(2);
    ok('✏️ → формуляр с текущите стойности', !!a.doc.getElementById('gr-adm-modal') && a.doc.getElementById('gr-adm-f-eik').value === '202885071');
    a.doc.getElementById('gr-adm-f-eik').value = '12345';
    realClick(a.w, btn(a.doc.getElementById('gr-adm-modal'), 'Запиши')); await ticks(4);
    ok('ЕИК не е 9/13 цифри → съобщение, без заявка', calls(a, 'admin_save').length === 0 && a.calls.toast.some(t => /ЕИК е 9 или 13 цифри/.test(t)));
    a.doc.getElementById('gr-adm-f-eik').value = '202885071';
    a.doc.getElementById('gr-adm-f-addr').value = 'гр. Стара Загора, ул. „Тест“ 1';
    realClick(a.w, btn(a.doc.getElementById('gr-adm-modal'), 'Запиши')); await ticks(8);
    const sv = calls(a, 'admin_save').slice(-1)[0];
    ok('Запиши → admin_save (companies, id, само позволените полета; празно → null)', !!sv && sv.table === 'companies' && sv.id === 'cy' &&
      JSON.stringify(Object.keys(sv.fields)) === '["name","eik","mol","addr"]' && sv.fields.mol === null && /Стара Загора/.test(sv.fields.addr), JSON.stringify(sv));
    ok('…адресът вече не е „липсва“', !/липсва/.test(a.doc.getElementById('gr-adm-companies').textContent));

    // ВТР: задължителните полета.
    realClick(a.w, btn(card(a), '➕ ВТР')); await ticks(2);
    realClick(a.w, btn(a.doc.getElementById('gr-adm-modal'), 'Запиши')); await ticks(4);
    ok('нов ВТР без дружество / ВТР / утвърдил → „Попълни: …“, без заявка', calls(a, 'admin_save').length === 1 && a.calls.toast.some(t => /^Попълни: Дружество, ВТР, Утвърдил/.test(t)));
    a.doc.getElementById('gr-adm-f-company_id').value = 'cy'; a.doc.getElementById('gr-adm-f-vtr_id').value = 'vtr1';
    a.doc.getElementById('gr-adm-f-approver').value = 'Някой Управител';
    a.doc.getElementById('gr-adm-f-valid_from').value = '2026-12-01'; a.doc.getElementById('gr-adm-f-valid_to').value = '2026-11-01';
    realClick(a.w, btn(a.doc.getElementById('gr-adm-modal'), 'Запиши')); await ticks(4);
    ok('„до“ преди „от“ → съобщение, без заявка', calls(a, 'admin_save').length === 1 && a.calls.toast.some(t => /„До“ е преди „от“/.test(t)));
    a.doc.getElementById('gr-adm-f-valid_to').value = '';
    realClick(a.w, btn(a.doc.getElementById('gr-adm-modal'), 'Запиши')); await ticks(8);
    const tv = calls(a, 'admin_save').slice(-1)[0];
    ok('нов ВТР → admin_save без id (нов ред)', tv.table === 'grafik_company_terms' && tv.id === null && tv.fields.vtr_id === 'vtr1' && tv.fields.valid_to === null, JSON.stringify(tv));

    // Неработен ден: добавяне и махане.
    realClick(a.w, btn(card(a), '➕ Ден')); await ticks(2);
    a.doc.getElementById('gr-adm-f-day').value = '2026-12-24'; a.doc.getElementById('gr-adm-f-note').value = 'Бъдни вечер';
    realClick(a.w, btn(a.doc.getElementById('gr-adm-modal'), 'Запиши')); await ticks(8);
    const ex = calls(a, 'admin_save').slice(-1)[0];
    ok('неработен ден за всички обекти (store_name null)', ex.table === 'grafik_extra_days' && ex.fields.day === '2026-12-24' && ex.fields.store_name === null && /24\.12\.2026/.test(a.doc.getElementById('gr-adm-extra').textContent));
    realClick(a.w, btn(a.doc.querySelector('#gr-adm-extra tbody tr'), '✕')); await ticks(8);
    ok('✕ на деня → admin_delete', calls(a, 'admin_delete').length === 1 && /няма/.test(a.doc.querySelector('#gr-adm-extra tbody').textContent));

    // Не-admin: картата изчезва; grafik-api дори не е питан за списъците.
    const m = env(MGR, { server: S });
    const nList = calls(m, 'access_list').length;
    await m.w.grAdminLoad(); await ticks(6);
    ok('manager: картата я няма; access_list не е поискан', !card(m) && calls(m, 'access_list').length === nList);
    const o = env(Object.assign({}, ADM, { email: 'drug.admin@temax.bg' }), { server: makeServer(), beta: 'ten.tenev@temax.bg' });
    await o.w.grAdminLoad(); await ticks(6);
    ok('admin извън beta (403 not_beta) → без карта', !card(o));
  }
  {
    // Интеграция с admin.js в реалния ред: loadAdmin() вика картата.
    const S = makeServer();
    const h = boot({ modules: ['grafik-engine.js', 'grafik.js', 'admin.js'], user: ADM, data: {}, confirm: true, globals: { currentSession: 'sess.sig' } });
    S.beta = String(BETA_ALL).split(',').map(x => x.trim().toLowerCase());
    const orig = h.w.fetch;
    h.w.fetch = function (url, init) {
      if (String(url).indexOf('/functions/v1/grafik-api') >= 0) { const r = S.handle(ADM, JSON.parse(init.body)); return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body) }); }
      return orig.apply(this, arguments);
    };
    await guard('loadAdmin() не хвърля', () => h.w.loadAdmin()); await ticks(10);
    ok('admin.js loadAdmin() → картата „📆 График“ се появява', !!h.doc.getElementById('gr-admin-card') && !!h.doc.getElementById('gr-adm-beta'));
  }

  section('17. 05.11.2026: дневни сборове, ЛД в неделя, цветове, колона AO, дублирано име');
  {
    const ExcelJS = require(path.join(ROOT, 'node_modules', 'exceljs'));
    const S = makeServer();
    S.staff.filter(s => s.id === 'st-1')[0].position = 'Продавач';
    S.staff.filter(s => s.id === 'st-2')[0].position = 'Каса';
    S.staff.filter(s => s.id === 'st-3')[0].position = 'Каса';
    S.staff.filter(s => s.id === 'st-2')[0].hired_on = '2026-11-10';      // Мария — от 10.11
    S.staff.filter(s => s.id === 'st-3')[0].left_on = '2026-11-20';       // Петя — напуска на 20.11
    S.months['Кърджали|2026-11-01'] = { id: 'm-d', store_name: 'Кърджали', month: '2026-11-01', status: 'draft' };
    // Ноември 2026: 1.11 — неделя. Иван: нд ЛД, пн ЛД, вт П, ср О, чт Б, пт НО.
    const L1 = new Array(30).fill(''); ['ЛД', 'ЛД', 'П', 'О', 'Б', 'НО'].forEach((v, i) => { L1[i] = v; });
    const L2 = new Array(30).fill(''); ['ЗД', 'В', 'М', 'К', '9'].forEach((v, i) => { L2[i] = v; });
    const L3 = new Array(30).fill(''); L3[1] = 'О4'; L3[2] = 'П';
    S.rows.push({ month_id: 'm-d', staff_id: 'st-1', letters: L1, locked: {} }, { month_id: 'm-d', staff_id: 'st-2', letters: L2, locked: {} }, { month_id: 'm-d', staff_id: 'st-3', letters: L3, locked: {} });
    const x = env(MGR, { server: S });
    await load(x);
    const d = x.doc;
    const rowNums = id => { const tr = d.getElementById(id); return tr ? Array.from(tr.children).slice(1).map(td => +td.textContent) : null; };
    const first = (id, n) => (rowNums(id) || []).slice(0, n).join(',');

    // т.2 — дневните сборове.
    ok('т.2: блокът „Дневни сборове“ е сгъваем (<details>), след „Покритие по сектор“', !!d.getElementById('gr-daily') && d.getElementById('gr-daily').tagName === 'DETAILS' &&
      !!(d.getElementById('gr-coverage').compareDocumentPosition(d.getElementById('gr-daily')) & 4));
    ok('т.2: по буква — 10 реда (ЛД, ЗД, П, В, М, К, Б, О, НО, О4)', ['ЛД', 'ЗД', 'П', 'В', 'М', 'К', 'Б', 'О', 'НО', 'О4'].every(l => !!d.getElementById('gr-daily-l-' + l)));
    ok('т.2: ЛД — 1,1,0,0,0 · О4 — 0,1,0 · К — 0,0,0,1', first('gr-daily-l-ЛД', 5) === '1,1,0,0,0' && first('gr-daily-l-О4', 3) === '0,1,0' && first('gr-daily-l-К', 4) === '0,0,0,1', first('gr-daily-l-ЛД', 5));
    ok('т.2: „Общо на ден“ — сборът на буквите (вкл. О, Б, НО, О4; свободните часове не са буква): 2,3,3,2,1,1', first('gr-daily-total', 6) === '2,3,3,2,1,1', first('gr-daily-total', 6));
    ok('т.2: „Сутрин общо“ = ЛД + ЗД + П: 2,1,2,0,0', first('gr-daily-morning', 5) === '2,1,2,0,0', first('gr-daily-morning', 5));
    ok('т.2: „Вечер общо“ = ЛД + ЗД + В + М: 2,2,1,0,0', first('gr-daily-evening', 5) === '2,2,1,0,0', first('gr-daily-evening', 5));
    ok('т.2: по позиция — хората на смяна: Продавач 1,1,1,0,0 (О и Б не са смяна)', first('gr-daily-p-Продавач', 5) === '1,1,1,0,0', first('gr-daily-p-Продавач', 5));
    ok('т.2: …Каса 1,1,2,1,1 (О4 не е смяна; К и свободни часове — да)', first('gr-daily-p-Каса', 5) === '1,1,2,1,1', first('gr-daily-p-Каса', 5));
    ok('т.2: позиция без хора — без ред (Склад)', !d.getElementById('gr-daily-p-Склад'));

    // т.3 — ЛД в неделя.
    const c00 = d.getElementById('gr-c-0-0');
    ok('т.3: ЛД в неделя (1.11) — червена клетка, без код', /background:#FF8080/i.test(c00.getAttribute('style')) && x.w.grCalc.rows[0].codes[0] === '', c00.getAttribute('style'));
    const sw = Array.from(d.querySelectorAll('#gr-warnings .gr-warn-sunday_ld')).map(li => li.textContent);
    ok('т.3: предупреждение „ИВАН: 1-ви — ЛД в неделя — ползвай ЗД“', sw.length === 1 && sw[0] === 'ИВАН: 1-ви — ЛД в неделя — ползвай ЗД', sw.join(' | '));
    ok('т.3: ЛД в делник (2.11) — без червено', !/background:#FF8080/i.test(d.getElementById('gr-c-0-1').getAttribute('style')));
    ok('т.3: „Подай“ го изрежда: „Иван Иванов Иванов: ЛД в неделя на 01.11 — ползвай ЗД“', x.w.grSubmitIssues().indexOf('Иван Иванов Иванов: ЛД в неделя на 01.11 — ползвай ЗД') >= 0, x.w.grSubmitIssues().join(' | '));

    // т.6 — цветове.
    const bg = (r, c) => (d.getElementById('gr-c-' + r + '-' + c).getAttribute('style').match(/background:(#[0-9A-Fa-f]{6})/) || [])[1];
    ok('т.6: О — светло жълто (#FFF2CC), Б — светло синьо (#B4C6E7)', bg(0, 3) === '#FFF2CC' && bg(0, 4) === '#B4C6E7', bg(0, 3) + ' ' + bg(0, 4));
    ok('т.6: дни преди назначаването (Мария, 7.11) — сиво #D9D9D9; след него (13.11) — не', bg(1, 6) === '#D9D9D9' && bg(1, 12) !== '#D9D9D9', bg(1, 6) + ' ' + bg(1, 12));
    ok('т.6: дни след напускането (Петя, 26.11) — сиво; денят на напускане (20.11) — не', bg(2, 25) === '#D9D9D9' && bg(2, 19) !== '#D9D9D9', bg(2, 25) + ' ' + bg(2, 19));
    const pn = d.querySelectorAll('#gr-grid tbody tr')[2].querySelector('.gr-name');
    ok('т.6: напуска през месеца (Петя) — името е маркирано (#BDD7EE) и казва датата', /gr-leaving/.test(pn.className) && /background:#BDD7EE/.test(pn.getAttribute('style')) && /напуска на 20\.11\.2026/.test(pn.getAttribute('title')), pn.getAttribute('title'));
    ok('т.6: Иван не напуска — без маркировка', !/gr-leaving/.test(d.querySelectorAll('#gr-grid tbody tr')[0].querySelector('.gr-name').className));
    const intBg = r => (d.querySelectorAll('#gr-grid .gr-int')[r].getAttribute('style').match(/background:(#[0-9A-Fa-f]{6})/) || [])[1] || '';
    ok('т.6: „Вътр.“ под нормата — червено (Иван: 37 ч. срещу праг 152 = 168 − 8 × (Б + НО))', intBg(0) === '#FF8080' && x.w.grCalc.rows[0].internalNorm === 152, intBg(0) + ' ' + x.w.grCalc.rows[0].internalNorm);
    const setI = letters => { x.w.grRows['st-1'] = { letters, locked: {} }; x.w.grRecalc(); x.w.grRender(); };
    const wd = x.w.GrafikEngine.monthInfo('2026-11', []);
    const work = (fill, extra) => { const a = wd.dow.map(w => (w <= 5 ? fill : '')); if (extra) a[0] = extra; return a; };
    setI(work('П'));
    ok('т.6: точно на нормата (21 × П = 168) — без цвят', intBg(0) === '', intBg(0));
    setI(work('П', '3'));
    ok('т.6: норма + 3 ч. (171) — още без цвят (границата не е „над“)', intBg(0) === '', intBg(0));
    setI(work('П', '4'));
    ok('т.6: норма + 4 ч. (172) — оранжево #FFC000', intBg(0) === '#FFC000', intBg(0));
    setI(L1);

    // т.5 — Excel за ТРЗ: AO и ВСИЧКО.
    const got = [];
    x.w.grWithExcelJS = () => Promise.resolve(ExcelJS);
    x.w.grDownload = (buf, name) => got.push({ buf, name });
    realClick(x.w, btn(mod(x), 'Excel за ТРЗ')); await wait(400); await ticks(8);
    ok('т.5: файлът е направен', got.length === 1);
    if (got.length) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(got[0].buf); const ws = wb.worksheets[0];
      const v = a => { const c = ws.getCell(a).value; return c && typeof c === 'object' && 'result' in c ? c.result : c; };
      const f = a => { const c = ws.getCell(a).value; return c && typeof c === 'object' ? c.formula : null; };
      ok('т.5: колона AO след „неплатен (Н) дни“ — „общо часове вкл. О/Б/Н (по договора)“', v('AM5') === 'неплатен (Н) дни' && v('AN5') === 'общо часове вкл. О/Б/Н (по договора)', v('AN5'));
      ok('т.5: формулата — човекочасове + договор × (О + Б + Н): Иван × 8, Петя (4 ч.) × 4', f('AN12') === 'AI12+8*(AK12+AL12+AM12)' && f('AN14') === 'AI14+4*(AK14+AL14+AM14)', f('AN12') + ' | ' + f('AN14'));
      const r0 = x.w.grExportModel().rows;
      ok('т.5: резултатът до формулата = общото от модела (Иван: часове + 8 × (О + Б + Н от НО) = + 24)', v('AN12') === r0[0].total && r0[0].total === r0[0].hours + 24, v('AN12') + ' / ' + r0[0].total);
      ok('т.5: ред „ВСИЧКО за обекта“ — и в AO: SUM', v('A15') === 'ВСИЧКО за обекта:' && f('AN15') === 'SUM(AN12:AN14)' && v('AN15') === r0.reduce((s, r) => s + r.total, 0), f('AN15'));
      ok('т.5: „Утвърдил“ покрива и новата колона (обединено до AN)', ws.getCell('AN1').master && ws.getCell('AN1').master.address === 'AH1');
    }

    // т.10 — дублирано име: сървърът отказва, екранът казва защо и формулярът остава отворен.
    S.fail.staff_save = b => String(b.fields.short_name || '').trim().toLowerCase() === 'иван'
      ? { status: 409, body: { ok: false, reason: 'duplicate', message: '„иван“ вече е в графика на обекта — сложи различно име в графика.' } } : null;
    x.w.grSetView('staff'); await ticks(4);
    x.w.grStaffOpen('');
    d.getElementById('gr-sf-short').value = 'иван'; d.getElementById('gr-sf-full').value = 'Иван Втори';
    realClick(x.w, btn(d.getElementById('gr-staff-modal'), 'Запиши')); await ticks(6);
    ok('т.10: 409 duplicate → „Не е записан: „иван“ вече е в графика на обекта — …“; формулярът остава', x.calls.toast.some(t => t === 'Не е записан: „иван“ вече е в графика на обекта — сложи различно име в графика.') && !!d.getElementById('gr-staff-modal'), x.calls.toast.slice(-2).join(' | '));
  }

  section('18. П2: екранът „✎ Промени“ (подаден месец)');
  {
    const S = makeServer();
    const calls = (h, a) => h.S.calls.filter(c => c.action === a);
    // Чернова — само съобщение, без changes_list.
    S.months['Кърджали|2026-11-01'] = { id: 'm-c', store_name: 'Кърджали', month: '2026-11-01', status: 'draft' };
    const L1 = new Array(30).fill(''); L1[1] = 'П'; L1[2] = 'П';
    S.rows.push({ month_id: 'm-c', staff_id: 'st-1', letters: L1, locked: {} });
    const dr = env(MGR, { server: S });
    await load(dr);
    ok('бутон „✎ Промени“ в лентата', !!btn(mod(dr), 'Промени'));
    realClick(dr.w, btn(mod(dr), 'Промени')); await ticks(6);
    ok('чернова: „Промените се въвеждат след подаване на графика …“; без changes_list', /Промените се въвеждат след подаване на графика/.test((dr.doc.getElementById('gr-ch-draft') || {}).textContent || '') && !calls(dr, 'changes_list').length);

    // Подаден месец със снимка.
    const codes1 = new Array(30).fill(''); codes1[1] = 'Д1/З'; codes1[2] = 'Д1/З';
    Object.assign(S.months['Кърджали|2026-11-01'], { status: 'submitted', submitted_by_name: 'Управител Кърджали', submitted_at: '2026-11-04T10:00:00Z',
      snapshot: { rows: [{ staff_id: 'st-1', full_name: 'Иван Иванов Иванов', codes: codes1 }, { staff_id: 'st-2', full_name: "Мария Д'Анджело", codes: new Array(30).fill('') }],
        header: { company_name: '"ТЕМАКС ТЦД 3" ЕООД', company_eik: '207322431', company_addr: 'гр. Варна', store_blank_name: '"Темакс" – Кърджали', approver: 'Теодор Тенев' } } });
    const x = env(MGR, { server: S });
    await load(x);
    const d = x.doc;
    ok('подаден: changes_list се тегли със зареждането', calls(x, 'changes_list').length === 1 && calls(x, 'changes_list')[0].month === '2026-11');
    realClick(x.w, btn(mod(x), 'Промени')); await ticks(4);
    ok('празно: „Няма въведени промени“; „➕ Промяна“ — да; „🖨 Промени за подпис“ — не', !!d.getElementById('gr-ch-empty') && !!btn(mod(x), '➕ Промяна') && !btn(mod(x), 'Промени за подпис'));
    realClick(x.w, btn(mod(x), '➕ Промяна')); await ticks(2);
    const md = () => d.getElementById('gr-ch-modal');
    ok('формулярът: дата (30 дни), служителите от снимката, „по график“ за 1.11 — почивка', md() && d.getElementById('gr-ch-day').options.length === 30 &&
      Array.from(d.getElementById('gr-ch-staff').options).map(o => o.textContent).join('|') === "Иван Иванов Иванов|Мария Д'Анджело" && d.getElementById('gr-ch-planned').textContent === 'почивка');
    d.getElementById('gr-ch-day').value = '3'; x.w.grChPlannedShow();
    ok('„по график“ се сменя с деня: 3.11 → „П / Д1/З“', d.getElementById('gr-ch-planned').textContent === 'П / Д1/З');
    ok('датите — „03.11 Вт“', d.getElementById('gr-ch-day').options[2].textContent === '03.11 Вт');
    const nSave = () => calls(x, 'changes_save').length;
    d.getElementById('gr-ch-actual').value = 'П'; d.getElementById('gr-ch-reason').value = 'x';
    realClick(x.w, btn(md(), 'Запиши')); await ticks(4);
    ok('реално = по график → „Няма отклонение …“, без заявка', nSave() === 0 && x.calls.toast.some(t => /^Няма отклонение — по график е същото \(П\)\./.test(t)));
    d.getElementById('gr-ch-actual').value = 'Б'; d.getElementById('gr-ch-reason').value = '';
    realClick(x.w, btn(md(), 'Запиши')); await ticks(4);
    ok('без основание → съобщение, без заявка', nSave() === 0 && x.calls.toast.some(t => /Основанието \/ документът е задължително/.test(t)));
    d.getElementById('gr-ch-reason').value = 'болничен лист № 123';
    realClick(x.w, btn(md(), 'Запиши')); await ticks(8);
    const sv = calls(x, 'changes_save')[0];
    ok('Запиши → changes_save (служител, ден, реално, основание; „по график“ НЕ се праща)', !!sv && sv.staff_id === 'st-1' && sv.day === 3 && sv.actual === 'Б' && sv.reason === 'болничен лист № 123' && !('planned_letter' in sv) && !('id' in sv), JSON.stringify(sv));
    const tr = Array.from(d.querySelectorAll('#gr-ch-tbl tbody tr'));
    ok('списъкът: „03.11 Вт · Иван … · П / Д1/З · Б · болничен лист № 123 · не“', tr.length === 1 && /03\.11 Вт/.test(tr[0].textContent) && /Иван Иванов Иванов/.test(tr[0].textContent) &&
      /П \/ Д1\/З/.test(tr[0].textContent) && tr[0].children[3].textContent === 'Б' && /болничен лист № 123/.test(tr[0].textContent) && tr[0].children[6].textContent === 'не', tr[0] && tr[0].textContent);
    ok('броячът „1 промяна · неотразени в ТРЗ: 1“; „🖨 Промени за подпис“ — вече да', /^1 промяна · неотразени в ТРЗ: 1$/.test(d.getElementById('gr-ch-count').textContent) && !!btn(mod(x), 'Промени за подпис'));
    ok('магазинът не вижда отметката за ТРЗ', !d.querySelector('.gr-ch-trz'));
    // Мрежата — оранжево.
    realClick(x.w, btn(mod(x), 'График')); await ticks(4);
    const c02 = d.getElementById('gr-c-0-2');
    ok('мрежата: 3.11 при Иван — оранжево (#F8CBAD), с „промяна: П → Б (болничен лист № 123)“', /background:#F8CBAD/.test(c02.getAttribute('style')) && /промяна: П → Б \(болничен лист № 123\)/.test(c02.getAttribute('title')), c02.getAttribute('title'));
    // Редакция.
    realClick(x.w, btn(mod(x), 'Промени')); await ticks(4);
    realClick(x.w, btn(d.querySelector('#gr-ch-tbl tbody tr'), '✏️')); await ticks(2);
    ok('✏️ → формулярът с текущите стойности', d.getElementById('gr-ch-actual').value === 'Б' && d.getElementById('gr-ch-reason').value === 'болничен лист № 123' && d.getElementById('gr-ch-day').value === '3');
    d.getElementById('gr-ch-actual').value = 'О';
    realClick(x.w, btn(md(), 'Запиши')); await ticks(8);
    ok('редакцията праща id', calls(x, 'changes_save').slice(-1)[0].id === S.changes[0].id && S.changes[0].actual === 'О');
    // Грешка от сървъра.
    S.fail.changes_save = () => ({ status: 400, body: { ok: false, reason: 'not_in_schedule', message: 'Служителят не е в подадения график — върни графика в чернова, добави го и го подай пак.' } });
    realClick(x.w, btn(mod(x), '➕ Промяна')); await ticks(2);
    d.getElementById('gr-ch-day').value = '5'; d.getElementById('gr-ch-actual').value = 'Б'; d.getElementById('gr-ch-reason').value = 'x';
    realClick(x.w, btn(md(), 'Запиши')); await ticks(6);
    ok('отказ от сървъра → „Не е записана: …“, формулярът остава', x.calls.toast.some(t => /^Не е записана: Служителят не е в подадения график/.test(t)) && !!md());
    delete S.fail.changes_save; realClick(x.w, btn(md(), 'Откажи'));
    // Печат за подпис.
    realClick(x.w, btn(mod(x), 'Промени за подпис')); await ticks(4);
    const pt = d.getElementById('grc-tbl');
    ok('печат: „ПРОМЕНИ В ГРАФИКА ЗА ЯВЯВАНЕ НА РАБОТА“ + ВТР чл. 19, ал. 4', /^ПРОМЕНИ В ГРАФИКА ЗА ЯВЯВАНЕ НА РАБОТА$/.test(d.getElementById('grc-title').textContent) && /ВТР, чл\. 19, ал\. 4/.test(d.getElementById('mod-print').textContent));
    ok('печат: колоните — №, Дата, Служител, По график, Реално, Основание, Въведено от, Подпис на служителя', Array.from(pt.querySelectorAll('thead th')).map(t => t.textContent).join('|') === '№|Дата|Служител|По график|Реално|Основание / документ №|Въведено от|Подпис на служителя');
    ok('печат: редът и празната клетка за подпис; „Утвърдил: Теодор Тенев … (управител)“', pt.querySelectorAll('tbody tr').length === 1 && pt.querySelector('tbody tr').lastElementChild.textContent === '' &&
      /^Утвърдил: Теодор Тенев .*\(управител\)$/.test(d.getElementById('grc-appr').textContent));
    x.w.showModule('grafik');
    // ТРЗ: отметка, без ➕ и без ✏️.
    const t = env(TRZ, { server: S, beta: BETA_ALL });
    await load(t);
    realClick(t.w, btn(t.doc.querySelector('#gr-ov-tbl tbody tr'), 'Отвори')); await ticks(8);
    realClick(t.w, btn(mod(t), 'Промени')); await ticks(4);
    ok('ТРЗ: вижда промяната, без „➕ Промяна“ и без ✏️ / ✕', t.doc.querySelectorAll('#gr-ch-tbl tbody tr').length === 1 && !btn(mod(t), '➕ Промяна') && !btn(t.doc.getElementById('gr-ch-tbl'), '✏️'));
    const cb = t.doc.querySelector('.gr-ch-trz');
    ok('ТРЗ: отметка „Отразено в ТРЗ“', !!cb && !cb.checked);
    cb.checked = true; H.fire(t.w, cb, 'change'); await ticks(8);
    ok('ТРЗ: отметката → changes_trz done:true; след презареждане е отметната', calls(t, 'changes_trz').slice(-1)[0].done === true && t.doc.querySelector('.gr-ch-trz').checked && S.changes[0].trz_done);
    // Магазинът — отразената е заключена; admin — не.
    await load(x); realClick(x.w, btn(mod(x), 'Промени')); await ticks(4);
    ok('магазинът: отразената — 🔒 вместо ✏️ / ✕; колоната казва „✔ да“', !btn(d.getElementById('gr-ch-tbl'), '✏️') && /🔒/.test(d.querySelector('#gr-ch-tbl tbody tr').textContent) && /✔ да/.test(d.querySelector('#gr-ch-tbl tbody tr').textContent));
    const a = env(ADM, { server: S });
    await load(a); realClick(a.w, btn(mod(a), 'Промени')); await ticks(4);
    ok('admin: отразената — ✏️ и ✕ има; отметката също', !!btn(a.doc.getElementById('gr-ch-tbl'), '✏️') && !!a.doc.querySelector('.gr-ch-trz'));
    // Триене (admin) с потвърждение.
    realClick(a.w, btn(a.doc.getElementById('gr-ch-tbl'), '✕')); await ticks(8);
    ok('✕ (с потвърждение) → changes_delete; списъкът е празен', calls(a, 'changes_delete').length === 1 && !!a.doc.getElementById('gr-ch-empty') &&
      a.calls.confirm.some(m => /^Да махна промяната за Иван Иванов Иванов на 03\.11 Вт \(О\)\?$/.test(m)));
    // „Върни“ — предупреждение с броя.
    S.changes.push({ id: 'ch-x', month_id: 'm-c', staff_id: 'st-2', day: 10, actual: 'Б', reason: 'x', planned_letter: '', planned_code: '', trz_done: false });
    await load(a);
    realClick(a.w, btn(mod(a), '📅 График')); await ticks(4);
    a.calls.confirm.length = 0;
    realClick(a.w, btn(mod(a), 'Върни')); await ticks(6);
    ok('„Върни в чернова“ — „Има 1 промяна — остава за новото подаване.“', a.calls.confirm.some(m => /\nИма 1 промяна — остава за новото подаване\.$/.test(m)), a.calls.confirm.join(' | '));
  }


  section('19. П3: ПРИСЪСТВЕНА ФОРМА — печат, Excel, проверка „реално“, обзор');
  {
    const ExcelJS = require(path.join(ROOT, 'node_modules', 'exceljs'));
    const S = makeServer();
    const wd = h.w.GrafikEngine.monthInfo('2026-11', []);
    const work = wd.dow.map(w => (w <= 5 ? 'П' : ''));
    const codes = work.map(l => (l ? 'Д1/З' : ''));
    S.months['Кърджали|2026-11-01'] = { id: 'm-p', store_name: 'Кърджали', month: '2026-11-01', status: 'draft' };
    S.rows.push({ month_id: 'm-p', staff_id: 'st-1', letters: work.slice(), locked: {} });
    // Чернова — без бутоните за присъствената.
    const dr = env(MGR, { server: S }); await load(dr);
    ok('чернова: без „🖨 Присъствена“ и „📥 Присъствена Excel“', !btn(mod(dr), 'Присъствена'));
    Object.assign(S.months['Кърджали|2026-11-01'], { status: 'submitted', submitted_by_name: 'Управител Кърджали', submitted_at: '2026-11-04T10:00:00Z',
      snapshot: { rows: [{ staff_id: 'st-1', full_name: 'Иван Иванов Иванов', contract_title: 'продавач-консултант', hours_per_day: 8, codes: codes, norm: 168 },
                         { staff_id: 'st-3', full_name: 'Петя Петрова', contract_title: 'касиер', hours_per_day: 4, codes: work.map(l => (l ? 'Д5/1' : '')), norm: 84 }],
        header: { company_name: '"ТЕМАКС ТЦД 3" ЕООД', company_eik: '207322431', company_addr: 'гр. Варна', store_blank_name: '"Темакс" – Кърджали', approver: 'Теодор Тенев' } } });
    S.changes = [
      { id: 'c1', month_id: 'm-p', staff_id: 'st-1', day: 3, actual: 'Б', reason: 'болничен', planned_letter: 'П', planned_code: 'Д1/З', trz_done: false },
      { id: 'c2', month_id: 'm-p', staff_id: 'st-1', day: 10, actual: 'ЛД', reason: 'остава', planned_letter: 'П', planned_code: 'Д1/З', trz_done: true },
      { id: 'c3', month_id: 'm-p', staff_id: 'st-3', day: 4, actual: 'Майч', reason: 'майчинство', planned_letter: 'П', planned_code: 'Д5/1', trz_done: false },
    ];
    const x = env(MGR, { server: S }); await load(x);
    const d = x.doc;
    ok('подаден: „🖨 Присъствена“ и „📥 Присъствена Excel“ до „Excel за ТРЗ“', !!btn(mod(x), '🖨 Присъствена') && !!btn(mod(x), 'Присъствена Excel'));
    const m = x.w.grPresenceModel(), iv = m.p.rows[0], pt = m.p.rows[1];
    ok('моделът: Иван — 3.11 „Б“, 10.11 Д5/З = 10.5, 2.11 = 8; 20 дни, 160 − 8 + 10.5 = 162.5 ч.', iv.cells[2].v === 'Б' && iv.cells[9].v === 10.5 && iv.cells[1].v === 8 && iv.days === 20 && iv.hours === 162.5, iv.days + ' / ' + iv.hours);
    ok('моделът: Петя (4 ч.) — 4.11 „М“; AR по договора', pt.cells[3].v === 'М' && pt['М'] === 1 && pt.total === pt.hours + 4 * (pt['О'] + pt['Б'] + pt['Н']), pt.total);
    // Печат.
    realClick(x.w, btn(mod(x), '🖨 Присъствена')); await ticks(4);
    const tb = d.getElementById('grq-tbl');
    ok('печат: „ПРИСЪСТВЕНА ФОРМА“, „Съставил: Управител Кърджали“ (влезлият)', d.getElementById('grq-title').textContent === 'ПРИСЪСТВЕНА ФОРМА' && /^Съставил: Управител Кърджали/.test(d.getElementById('grq-made').textContent));
    ok('печат: колоните след дните — дни, часове, О, М, Б, Д, А, С, Н, общо', Array.from(tb.querySelector('thead tr').children).slice(-10).map(t => t.textContent).join('|') === 'дни|часове|О|М|Б|Д|А|С|Н|общо ч. вкл. О/Б/Н');
    const r1 = tb.querySelectorAll('tbody tr')[0];
    ok('печат: денят с промяна е оранжев (grq-chg), стойността — „Б“ / „10,5“', /grq-chg/.test(r1.children[3 + 2].className) && r1.children[3 + 2].textContent === 'Б' && r1.children[3 + 9].textContent === '10,5' && !/grq-chg/.test(r1.children[3 + 1].className));
    ok('печат: ред „ВСИЧКО за обекта“ и легендата на неявяванията', /ВСИЧКО за обекта/.test(tb.querySelector('.grq-total').textContent) && /Легенда неявявания: О платен отпуск · М майчинство/.test(d.getElementById('grq-foot').textContent));
    const pcss = d.querySelector('#mod-print style').textContent;
    ok('печат CSS: A4 хоризонтално, border-box, white-space:normal, рамка на последния ред (правило 12)', /@page\{size:A4 landscape;/.test(pcss) && /\.grq-tbl th,\.grq-tbl td\{box-sizing:border-box;[^}]*white-space:normal;/.test(pcss) && /\.grq-tbl tr:last-child td\{border-bottom:1px solid #333;\}/.test(pcss));
    x.w.showModule('grafik'); await load(x);
    // Excel.
    const got = [];
    x.w.grWithExcelJS = () => Promise.resolve(ExcelJS);
    x.w.grDownload = (buf, name) => got.push({ buf, name });
    realClick(x.w, btn(mod(x), 'Присъствена Excel')); await wait(400); await ticks(8);
    ok('Excel: „Присъствена_Кърджали_2026-11.xlsx“', got.length === 1 && got[0].name === 'Присъствена_Кърджали_2026-11.xlsx', got[0] && got[0].name);
    if (got.length) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(got[0].buf); const ws = wb.worksheets[0];
      const v = a => { const c = ws.getCell(a).value; return c && typeof c === 'object' && 'result' in c ? c.result : c; };
      const f = a => { const c = ws.getCell(a).value; return c && typeof c === 'object' ? c.formula : null; };
      // 30 дни: D..AG; AH дни, AI часове, AJ..AP О М Б Д А С Н, AQ общо.
      ok('Excel: заглавия — дни, часове, О…Н, общо', v('AH7') === 'дни' && v('AI7') === 'часове' && v('AJ11') === 'О' && v('AP11') === 'Н' && v('AQ5') === 'общо часове вкл. О/Б/Н (по договора)');
      ok('Excel: формулите — COUNT / SUM / COUNTIF, AR = часове + договор × (О + Б + Н)', f('AH12') === 'COUNT(D12:AG12)' && f('AI12') === 'SUM(D12:AG12)' && f('AJ12') === 'COUNTIF(D12:AG12,"О")' &&
        f('AQ12') === 'AI12+8*(AJ12+AL12+AP12)' && f('AQ13') === 'AI13+4*(AJ13+AL13+AP13)', f('AQ12'));
      ok('Excel: стойностите — Иван 20 дни, 162.5 ч.; 3.11 = „Б“, 10.11 = 10.5 (число)', v('AH12') === 20 && v('AI12') === 162.5 && ws.getCell('F12').value === 'Б' && ws.getCell('M12').value === 10.5);
      const c3 = ws.getCell('F12');
      ok('Excel: денят с промяна — оранжев, с бележка „промяна: П → Б (болничен)“', c3.fill && c3.fill.fgColor.argb === 'FFF8CBAD' && /промяна: П → Б \(болничен\)/.test(JSON.stringify(c3.note)));
      ok('Excel: празен ден — празна клетка; ВСИЧКО — SUM', ws.getCell('D12').value === null && f('AH14') === 'SUM(AH12:AH13)' && v('A14') === 'ВСИЧКО за обекта:');
      ok('Excel: „Съставил: Управител Кърджали“ в заглавката', /^Съставил: Управител Кърджали/.test(String(v('AH1'))));
    }
    // Проверка „реално“ под „Промени“.
    realClick(x.w, btn(mod(x), 'Промени')); await ticks(4);
    const rt = Array.from(d.querySelectorAll('#gr-real-tbl tbody tr'));
    ok('„Промени“: проверката „реално“ — по ред на човек; Иван +2.5 (червено), Петя −4 (майчинството не е в О+Б+Н)', rt.length === 2 && rt[0].querySelector('.gr-real-diff').textContent === '+2,5' && /dc2626/.test(rt[0].querySelector('.gr-real-diff').getAttribute('style')) &&
      rt[1].querySelector('.gr-real-diff').textContent === '-4', rt.map(r => r.textContent).join(' | '));
    ok('„Промени“: бутоните за присъствената са и тук', !!btn(mod(x), '🖨 Присъствена') && !!btn(mod(x), 'Присъствена Excel'));
    // Формулярът: работна буква без код за договора В ТОЗИ ДЕН — отказ без заявка (както сървърът, letter_contract).
    {
      const nSave = () => x.S.calls.filter(c => c.action === 'changes_save').length;
      realClick(x.w, btn(mod(x), '➕ Промяна')); await ticks(4);
      d.getElementById('gr-ch-staff').value = 'st-3'; d.getElementById('gr-ch-day').value = '8';
      d.getElementById('gr-ch-actual').value = 'П'; d.getElementById('gr-ch-reason').value = 'извикана';
      realClick(x.w, btn(d.getElementById('gr-ch-modal'), 'Запиши')); await ticks(4);
      ok('формуляр: Петя (4 ч.), П в неделя 8.11 — няма код П|Н → съобщение, без заявка', nSave() === 0 && x.calls.toast.some(t => /^Буквата „П“ няма код за договора на служителя в този ден/.test(t)), x.calls.toast.slice(-1)[0]);
      d.getElementById('gr-ch-day').value = '9'; d.getElementById('gr-ch-actual').value = 'В';
      realClick(x.w, btn(d.getElementById('gr-ch-modal'), 'Запиши')); await ticks(8);
      ok('формуляр: Петя, В в понеделник 9.11 (Д5/2) — заявката тръгва', nSave() === 1 && x.S.calls.filter(c => c.action === 'changes_save')[0].actual === 'В');
      d.getElementById('gr-ch-modal') && x.w.closeModal('gr-ch-modal');
    }
    // Промяна с буква без код (заварена) → проверката я показва, печатът и Excel-ът спират с обяснение.
    {
      x.w.grChanges = x.w.grChanges.concat([{ id: 'c9', month_id: 'm-p', staff_id: 'st-3', day: 2, actual: 'ЛД', reason: 'стара', planned_letter: 'П', planned_code: 'Д5/1', trz_done: false }]);
      x.w.grRender(); await ticks(2);
      const iss = d.querySelector('#gr-real-tbl .gr-real-issue');
      ok('проверката: „02.11: „ЛД“ няма код за договор 4 ч.“ — червено', iss && iss.textContent === '02.11: „ЛД“ няма код за договор 4 ч.', iss && iss.textContent);
      const before = d.getElementById('mod-print').innerHTML, got2 = [];
      x.w.grDownload = (buf, name) => got2.push(name);
      realClick(x.w, btn(mod(x), '🖨 Присъствена')); await ticks(4);
      realClick(x.w, btn(mod(x), 'Присъствена Excel')); await wait(200); await ticks(4);
      const blocked = x.calls.toast.filter(t => /^Присъствената не се прави: Петя Петрова — 02\.11: „ЛД“ няма код за договор 4 ч\.\.$/.test(t)).length;
      ok('печат и Excel: спират със съобщение (2 пъти), без печат и без файл', blocked === 2 && d.getElementById('mod-print').innerHTML === before && got2.length === 0, blocked + ' ' + got2.length);
    }
    // Обзорът — „Промени: N · неотразени M“.
    const a = env(ADM, { server: S }); await load(a);
    realClick(a.w, btn(mod(a), 'Обекти')); await ticks(8);
    const kr = Array.from(a.doc.querySelectorAll('#gr-ov-tbl tbody tr')).filter(tr => /Кърджали/.test(tr.textContent))[0];
    ok('обзор: „Промени“ — „4 · неотразени 3“ (3 + записаната от формуляра; червено)', kr && kr.querySelector('.gr-ov-ch').textContent === '4 · неотразени 3' && /dc2626/.test(kr.querySelector('.gr-ov-ch').innerHTML), kr && kr.querySelector('.gr-ov-ch').textContent);
    const shr = Array.from(a.doc.querySelectorAll('#gr-ov-tbl tbody tr')).filter(tr => /Шумен/.test(tr.textContent))[0];
    ok('обзор: неподаден — „—“', shr && shr.querySelector('.gr-ov-ch').textContent === '—');
  }


  section('20. Мрежата: кликът не мести изгледа (т.1), №, Служител, Сектор залепени вляво (т.2)');
  {
    const x = env(MGR); await load(x);
    const d = x.doc, W = x.w;
    // jsdom не смята лейаут: scrollLeft / scrollTop се пазят, правоъгълниците — по проста схема:
    // кутията 0..600 × 0..400, заглавието 40 px, залепените колони до 274 px, клетка 30 × 24.
    for (const p of ['scrollLeft', 'scrollTop']) {
      Object.defineProperty(W.HTMLElement.prototype, p, { configurable: true, get() { return this['_' + p] || 0; }, set(v) { this['_' + p] = v; } });
    }
    const rect = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
    W.HTMLElement.prototype.getBoundingClientRect = function () {
      const wrap = d.getElementById('gr-grid-wrap');
      if (this === wrap) return rect(0, 0, 600, 400);
      if (this.tagName === 'THEAD') return rect(0, 0, 900, 40);
      if (this.classList.contains('gr-stk2') && this.tagName === 'TH') return rect(184, 0, 90, 40);
      const m = /^gr-c-(\d+)-(\d+)$/.exec(this.id || '');
      if (m) return rect(274 + (+m[2]) * 30 - wrap.scrollLeft, 40 + (+m[1]) * 24 - wrap.scrollTop, 30, 24);
      return rect(0, 0, 0, 0);
    };
    const wrap = () => d.getElementById('gr-grid-wrap');
    // т.1 — кликът в 21-ви ден при изгледа, преместен надясно и надолу, не го връща в началото.
    wrap().scrollLeft = 500; wrap().scrollTop = 30;
    const w0 = wrap();
    realClick(W, d.getElementById('gr-c-1-20')); await ticks(2);
    ok('т.1: кликът прерисува мрежата (нова кутия), а изгледът остава — scrollLeft 500, scrollTop 30',
      wrap() !== w0 && wrap().scrollLeft === 500 && wrap().scrollTop === 30 && W.grSel.r === 1 && W.grSel.d === 20, wrap().scrollLeft + ' / ' + wrap().scrollTop);
    ok('т.1: избраната клетка е 21-ви ден на втория ред', /outline:2px solid #2563eb/.test(d.getElementById('gr-c-1-20').getAttribute('style')));
    // Писане на буква (пълен рендер при всеки клавиш) — пак на място.
    W.grKey({ key: 'В', preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    ok('т.1: писането в клетката също не мести изгледа', wrap().scrollLeft === 500 && wrap().scrollTop === 30);
    W.grKey({ key: 'Escape', preventDefault() {} });
    // Сгъваемите блокове пазят състоянието си при рендер.
    d.getElementById('gr-daily').open = true;
    realClick(W, d.getElementById('gr-c-0-3')); await ticks(2);
    ok('т.1: отворените „Дневни сборове“ остават отворени след клик в мрежата', d.getElementById('gr-daily').open === true);
    d.getElementById('gr-daily').open = false;
    realClick(W, d.getElementById('gr-c-0-4')); await ticks(2);
    ok('т.1: затворени — остават затворени', d.getElementById('gr-daily').open === false);
    // Стрелките: клетката излиза вдясно → кутията се мести точно колкото трябва (страницата — не).
    wrap().scrollLeft = 0; wrap().scrollTop = 0;
    realClick(W, d.getElementById('gr-c-0-9')); await ticks(2);
    let scrolled = 0; const origScroll = W.scrollTo; W.scrollTo = () => { scrolled++; };
    W.grKey({ key: 'ArrowRight', preventDefault() {} });
    ok('т.1: → от 10-и към 11-и ден: клетката (574–604) излиза от кутията (600) → scrollLeft += 4', W.grSel.d === 10 && wrap().scrollLeft === 4, wrap().scrollLeft);
    // Клетка под залепените колони → кутията се връща наляво до тях.
    wrap().scrollLeft = 300;
    realClick(W, d.getElementById('gr-c-0-2')); await ticks(2);
    W.grKey({ key: 'ArrowLeft', preventDefault() {} });
    ok('т.1: ← към 2-ри ден под залепените колони (лява страна 4 < 274) → scrollLeft 300 − 270 = 30', W.grSel.d === 1 && wrap().scrollLeft === 30, wrap().scrollLeft);
    W.grKey({ key: 'ArrowDown', preventDefault() {} });
    ok('т.1: страницата не е скролвана (само кутията)', scrolled === 0);
    W.scrollTo = origScroll;
    // Нов месец — от началото.
    wrap().scrollLeft = 400;
    await W.grGoMonth(1); await ticks(8);
    ok('т.1: смяна на месеца → изгледът от началото (scrollLeft 0)', wrap().scrollLeft === 0, wrap().scrollLeft);
    await W.grGoMonth(-1); await ticks(8);
    // т.2 — залепените колони.
    const th = Array.from(d.querySelectorAll('#gr-grid thead th'));
    ok('т.2: заглавията №, Служител, Сектор — gr-stk 0 / 1 / 2, последната със сянка', th[0].className === 'gr-stk gr-stk0' && th[1].className === 'gr-stk gr-stk1' && th[2].className === 'gr-stk gr-stk2 gr-stk-last' && !/gr-stk/.test(th[3].className));
    const tr0 = d.querySelector('#gr-grid tbody tr');
    ok('т.2: всеки ред — №, името, секторът залепени; дните — не',
      /gr-stk0/.test(tr0.children[0].className) && /gr-name gr-stk gr-stk1/.test(tr0.children[1].className) && /gr-stk2/.test(tr0.children[2].className) && !/gr-stk/.test(tr0.children[3].className) &&
      Array.from(d.querySelectorAll('#gr-grid tbody tr')).every(tr => tr.querySelectorAll('.gr-stk').length === 3));
    ok('т.2: фиксирани ширини 34 / 150 / 90 px (border-box), дълго име — с „…“', /box-sizing:border-box;width:150px;min-width:150px;max-width:150px;/.test(tr0.children[1].getAttribute('style')) &&
      /text-overflow:ellipsis/.test(tr0.children[1].getAttribute('style')) && /width:34px;/.test(th[0].getAttribute('style')) && /width:90px;/.test(th[2].getAttribute('style')));
    ok('т.2: отместванията — по реалната ширина (в jsdom 0 → резервните 34 и 184)', d.getElementById('gr-stk-css').textContent === '#gr-grid .gr-stk1{left:34px;}#gr-grid .gr-stk2{left:184px;}', d.getElementById('gr-stk-css').textContent);
    // Истинските ширини (напр. по-широк шрифт) → отместванията ги следват при следващия рендер.
    Object.defineProperty(W.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('gr-stk0') ? 40 : this.classList.contains('gr-stk1') ? 160 : 0; } });
    realClick(W, d.getElementById('gr-c-0-1')); await ticks(2);
    ok('т.2: отместванията по реалната ширина — 40 и 40 + 160 = 200', d.getElementById('gr-stk-css').textContent === '#gr-grid .gr-stk1{left:40px;}#gr-grid .gr-stk2{left:200px;}', d.getElementById('gr-stk-css').textContent);
    delete W.HTMLElement.prototype.offsetWidth;
    const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok('т.2 CSS: .gr-stk — sticky вляво, над дните, с плътен фон; ъгълът — над двете', /\.gr-grid-wrap \.gr-stk\{position:sticky;left:0;z-index:1;background:var\(--surf\);\}/.test(css) &&
      /\.gr-grid-wrap thead th\.gr-stk\{z-index:3;\}/.test(css) && /\.gr-grid-wrap thead th\{position:sticky;top:0;z-index:2;/.test(css));
    delete W.HTMLElement.prototype.getBoundingClientRect;
  }


  report();
})();
