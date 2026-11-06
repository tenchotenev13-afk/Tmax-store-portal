/* „➖ Минуси" — нов списък с причини и незадължителен служител (06.11.2026,
   сесия minusi-reasons-v2; файл на Миглена, решения на Тенчо 06.11).

   Заковано:
     1. неактивна причина (active=false) НЕ е в менюто на нов ред; новите са;
     2. ред, който вече има неактивна причина, я показва избрана, а „Запази"
        минава и я запазва (не я губи); контролингът вижда етикета ѝ;
     3. празен „Име на служител" → „Запази" минава, employee_name = null;
     4. „Клиентска поръчка" (requires_note) без бележка → отказ, както досега;
     5. minusi-reasons-v2-data.sql: преименуванията по id + стар етикет, трите
        active=false (без delete), шестте нови, без пипане на requires_note и
        excluded на съществуващите, rollback в хедъра.

   Мутационна проверка (06.11.2026) — всеки вариант пуснат и паднал:
     V1 менюто без филтъра за active=false             → пада
     V2 менюто крие и текущата неактивна причина         → пада
     V3 върната проверката за служител в mnSave          → пада
     V4 махната проверката за бележка (requires_note)    → пада
     V5 employee_name: emp (празен низ, не null)          → пада
   Пускане:  node tests/minusi-reasons-v2.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const GD = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев' };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const PLANTS = [{ plant: '5519', store_name: 'Гоце Делчев' }, { plant: '7519', store_name: 'Гоце Делчев' }];

/* Списъкът СЛЕД миграцията (06.11.2026). */
const R = (id, label, o) => Object.assign({ id, label, active: true, sort: id, requires_note: false, excluded_from_revision: false }, o || {});
const REASONS = [
  R(1, 'Клиентска поръчка', { requires_note: true, excluded_from_revision: true }),
  R(2, 'Реална продажба – последно количество'),
  R(3, 'продажба на цялото количество, липсва код', { active: false }),
  R(4, 'Има още налично количество'),
  R(5, 'Реална продажба, чака входяща доставка', { excluded_from_revision: true }),
  R(6, 'грешна стокова бележка'), R(7, 'грешен етикет'), R(8, 'Не е преналепено'),
  R(9, 'Разлики логистичен склад/доставчик', { excluded_from_revision: true }),
  R(10, 'касиерска грешка'),
  R(11, 'грешно въведен код от касиер', { active: false }),
  R(12, 'маркират се трудно на каса, продадени на ценови етикет'), R(13, 'налепени грешно артикули'),
  R(14, 'маркирани едновременно на каса различни артикули'),
  R(15, 'Заметнат с друг цвят, размер, съседен артикул на регал'),
  R(16, 'заметнати със съседните', { active: false }),
  R(17, 'паднал етикет, продаден на ценови етикет'), R(18, 'заметнат с преоценения код'),
  R(19, 'Извадено в търговска зала преди да се заприходи'),
  R(20, 'Отразен минус на ревизия'), R(21, 'Наличие на два баркода на оригиналната опаковка'),
  R(22, 'Грешно разчетен баркод от четеца на касата'), R(23, 'Част от комплект маркиран самостоятелно'),
  R(24, 'Преналепен артикул, етикетът прозира и четецът разчита грешния'),
  R(25, 'Грешно надписан/прочетен код на артикул, идващ без собствен етикет')
];
const ACTIVE = REASONS.filter(r => r.active);

let seq = 0;
const mv = (material, date, extra) => Object.assign({
  id: 'mv-' + (++seq), plant: '7519', store_name: 'Гоце Делчев', material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty: 1, uom: 'БР', mat_doc: '49033' + String(seq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: date,
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null
}, extra || {});
const MOVS = () => { seq = 0; return [
  mv('10001', '2026-11-02'),                                                   /* mv-1 — нов ред */
  mv('10002', '2026-11-03', { reason_id: 16, employee_name: 'Петя', filled_by: 'Управител ГД', filled_at: '2026-11-04T08:00:00Z' }), /* mv-2 — стара причина */
  mv('10003', '2026-11-04'),                                                   /* mv-3 — клиентска поръчка */
  mv('10004', '2026-11-05')                                                    /* mv-4 — нова причина, без служител */
]; };

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, q, body });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: 'Гоце Делчев' }]);
      if (tbl === 'minus_plants') return resp(200, PLANTS);
      if (tbl === 'minus_reasons') return resp(200, REASONS.map(r => Object.assign({}, r)));
      if (tbl === 'minus_movements') {
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        return resp(200, db.movs.map(x => Object.assign({}, x)));
      }
      return resp(200, []);
    }
    if (m === 'PATCH') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      if (tbl === 'minus_movements') db.movs.filter(x => x.id === id).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, db) {
  const h = boot({ modules: ['client-orders.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
const fakeDb = () => ({ movs: MOVS(), log: [] });
async function open(h) { await h.w.loadMinusi(); await ticks(6); }
const row = (h, id) => h.doc.getElementById('mn-row-' + id);
const opts = (h, id) => { const s = h.doc.getElementById('mn-reason-' + id); return s ? Array.from(s.options).map(o => o.value).filter(Boolean) : null; };
const saveBtn = (h, id) => Array.from(row(h, id).querySelectorAll('button')).filter(b => b.textContent === 'Запази')[0];
const patches = db => db.log.filter(x => x.m === 'PATCH' && x.tbl === 'minus_movements');
async function save(h, id) { await realClick(h.w, saveBtn(h, id), 'Запази ' + id); await ticks(6); }

(async function run() {
  section('1. Менюто на нов ред');
  {
    const db = fakeDb(); const h = env(GD, db); await open(h);
    const o = opts(h, 'mv-1');
    ok('нов ред: само активните (22) + „— избери —“', o && o.length === ACTIVE.length && h.doc.getElementById('mn-reason-mv-1').options.length === ACTIVE.length + 1, o && o.length);
    ok('отпадналите 3, 11, 16 ги няма', o && ['3', '11', '16'].every(x => o.indexOf(x) < 0), JSON.stringify(o));
    ok('шестте нови (20–25) са вътре, в реда на sort', o && o.slice(-6).join(',') === '20,21,22,23,24,25', JSON.stringify(o));
    const txt = Array.from(h.doc.getElementById('mn-reason-mv-1').options).map(x => x.textContent);
    ok('новите етикети се виждат', txt.indexOf('Отразен минус на ревизия') >= 0 && txt.indexOf('Грешно надписан/прочетен код на артикул, идващ без собствен етикет') >= 0);
    ok('преименуваният 1 — „Клиентска поръчка“', txt.indexOf('Клиентска поръчка') >= 0);

    section('2. Стар ред с неактивна причина (16)');
    const o2 = opts(h, 'mv-2');
    ok('менюто на стария ред съдържа 16', o2 && o2.indexOf('16') >= 0, JSON.stringify(o2));
    ok('… и 16 е избрана', h.doc.getElementById('mn-reason-mv-2').value === '16');
    ok('… а другите неактивни (3, 11) ги няма', o2 && o2.indexOf('3') < 0 && o2.indexOf('11') < 0);
    ok('етикетът ѝ е в менюто', h.doc.getElementById('mn-reason-mv-2').options[h.doc.getElementById('mn-reason-mv-2').selectedIndex].textContent === 'заметнати със съседните');
    const n0 = patches(db).length;
    await save(h, 'mv-2');
    const p2 = patches(db).slice(n0);
    ok('„Запази“ минава: един PATCH с reason_id 16', p2.length === 1 && p2[0].body.reason_id === 16 && p2[0].q === 'id=eq.mv-2', JSON.stringify(p2.map(x => x.body)));
    ok('… служителят остава', p2[0] && p2[0].body.employee_name === 'Петя');
    ok('след запис менюто пак държи 16', h.doc.getElementById('mn-reason-mv-2') && h.doc.getElementById('mn-reason-mv-2').value === '16');

    section('3. Празен служител');
    const s4 = h.doc.getElementById('mn-reason-mv-4'); s4.value = '20';
    h.doc.getElementById('mn-emp-mv-4').value = '   ';
    const n1 = patches(db).length;
    await save(h, 'mv-4');
    const p4 = patches(db).slice(n1);
    ok('без служител → „Запази“ минава (един PATCH)', p4.length === 1, JSON.stringify(h.calls.toast.slice(-2)));
    ok('… reason_id 20, employee_name null', p4[0] && p4[0].body.reason_id === 20 && p4[0].body.employee_name === null, p4[0] && JSON.stringify(p4[0].body));
    ok('… без тоаст за служител', !h.calls.toast.some(t => /служител/.test(t)));

    section('4. Клиентска поръчка без бележка — отказ');
    const s3 = h.doc.getElementById('mn-reason-mv-3'); s3.value = '1';
    const n2 = patches(db).length;
    await save(h, 'mv-3');
    ok('без бележка → нула PATCH и червен тоаст', patches(db).length === n2 &&
      h.calls.toast[h.calls.toast.length - 1] === 'За тази причина попълни номер и дата на поръчката в „Бележка"', h.calls.toast.slice(-1)[0]);
    h.doc.getElementById('mn-note-mv-3').value = 'КЗ 12 / 05.11';
    await save(h, 'mv-3');
    const p3 = patches(db).slice(n2);
    ok('с бележка и без служител → минава', p3.length === 1 && p3[0].body.reason_id === 1 && p3[0].body.note === 'КЗ 12 / 05.11' && p3[0].body.employee_name === null, JSON.stringify(p3.map(x => x.body)));
    h.close();
  }

  section('5. Контролингът вижда етикета на неактивната причина');
  {
    const db = fakeDb(); const h = env(ADMIN, db); await open(h);
    if (typeof h.w.mnSetStore === 'function') { h.w.mnSetStore('Гоце Делчев'); await ticks(8); }
    const r2 = row(h, 'mv-2');
    ok('редът е видим', !!r2);
    ok('в него — „заметнати със съседните“ (без меню)', !!r2 && r2.textContent.indexOf('заметнати със съседните') >= 0 && !h.doc.getElementById('mn-reason-mv-2'));
    h.close();
  }

  section('6. minusi-reasons-v2-data.sql');
  {
    const src = fs.readFileSync(path.join(ROOT, 'minusi-reasons-v2-data.sql'), 'utf8');
    const body = src.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
    const head = src.split('\n').filter(l => /^\s*--/.test(l)).join('\n');
    const ren = [[1, 'клиентска поръчка (номер/дата)', 'Клиентска поръчка'], [2, 'последна бройка, липсва код', 'Реална продажба – последно количество'],
      [4, 'има още количество, липсва код', 'Има още налично количество'], [5, 'реална продажба, чака вход от ЛСТ', 'Реална продажба, чака входяща доставка'],
      [8, 'грешен баркод, не е преналепено', 'Не е преналепено'], [9, 'разлика т-ще', 'Разлики логистичен склад/доставчик'],
      [15, 'заметнати с другия цвят', 'Заметнат с друг цвят, размер, съседен артикул на регал'],
      [19, 'продаден преди да се заведе, имаме го', 'Извадено в търговска зала преди да се заприходи']];
    ren.forEach(([id, from, to]) => {
      const re = new RegExp("set label = '" + to.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + "'\\s+where id = " + id + "\\s+and label = '" + from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + "';");
      ok('преименуване ' + id + ' — по id и стар етикет', re.test(body));
      ok('rollback за ' + id, head.indexOf("set label = '" + from + "'") >= 0 && head.indexOf("and label = '" + to + "'") >= 0);
    });
    ok('отпадат 3, 11, 16 — active = false по id + етикет', /set active = false\s+where \(id, label\) in \(\(3, 'продажба на цялото количество, липсва код'\),\s+\(11, 'грешно въведен код от касиер'\),\s+\(16, 'заметнати със съседните'\)\);/.test(body));
    ok('няма delete в миграцията (само в rollback-а)', !/\bdelete\b/i.test(body) && /delete from public\.minus_reasons/.test(head));
    ok('requires_note и excluded не се пипат с update', !/update[^;]*set[^;]*(requires_note|excluded_from_revision)/i.test(body));
    const newOnes = ['Отразен минус на ревизия', 'Наличие на два баркода на оригиналната опаковка', 'Грешно разчетен баркод от четеца на касата',
      'Част от комплект маркиран самостоятелно', 'Преналепен артикул, етикетът прозира и четецът разчита грешния',
      'Грешно надписан/прочетен код на артикул, идващ без собствен етикет'];
    ok('шестте нови — insert с sort 20–25', newOnes.every((l, i) => body.indexOf("('" + l + "', " + (20 + i) + ')') >= 0));
    ok('… active true, excluded false, requires_note false', /select v\.label, true, false, false, v\.sort/.test(body) && /\(label, active, excluded_from_revision, requires_note, sort\)/.test(body));
    ok('… само ако етикетът го няма', /where not exists \(select 1 from public\.minus_reasons r where r\.label = v\.label\)/.test(body));
    ok('фикстурата на теста = миграцията (етикетите 1–25)', ren.every(([id, , to]) => REASONS[id - 1].label === to) && newOnes.every((l, i) => REASONS[19 + i].label === l));
  }

  report();
})();
