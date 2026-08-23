/* Администрация — колона и модал за получателите на вечерния оборот.

   users.oborot_report: 'all' | 'assigned' | NULL. Edge функцията
   send-oborot-report чете точно тази колона; интерфейсът само я задава.

   ⚠️ CHECK ограничението в базата допуска САМО NULL, 'all' и 'assigned'.
   Празен низ връща 400, затова „Не получава" трябва да праща null, не ''.
   Това е основната проверка тук.

   Пускане: node tests/admin-oborot-report.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

const USERS = [
  { id: 'u-all', email: 'sobstvenik@temax.bg', display_name: 'Собственик', store_name: 'Централен офис',
    role: 'admin', active: true, assigned_stores: null, oborot_report: 'all' },
  { id: 'u-asg', email: 'region@temax.bg', display_name: 'Регионален', store_name: 'Централен офис',
    role: 'accounting', active: true, assigned_stores: ['Троян', 'Ловеч'], oborot_report: 'assigned' },
  { id: 'u-none', email: 'kasier@temax.bg', display_name: 'Касиер', store_name: 'Троян',
    role: 'kasa', active: true, assigned_stores: null, oborot_report: null },
  /* 'assigned', но БЕЗ зачисления — не получава нищо, макар да е маркиран. */
  { id: 'u-empty', email: 'prazen@temax.bg', display_name: 'Без обекти', store_name: 'Централен офис',
    role: 'accounting', active: true, assigned_stores: [], oborot_report: null }
];

/* Фикстурата спазва `id=eq.<id>`, защото editOborotReport() чете точно един
   ред и после показва стойността му в модала. Без това харнесът връща ЦЕЛИЯ
   списък за всяка заявка, `data[0]` е винаги първият потребител и тестът би
   твърдял, че модалът зарежда вярната стойност, докато проверява само нея. */
function usersFixture(list) {
  return function (url) {
    const m = String(url).match(/id=eq\.([^&]+)/);
    if (!m) return list;
    const id = decodeURIComponent(m[1]);
    return list.filter(u => u.id === id);
  };
}

function env(over) {
  over = over || {};
  const list = over.users !== undefined ? over.users : USERS;
  return boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: Object.assign({ users: usersFixture(list), stores: [] }, over.data || {}),
    fail: over.fail
  });
}

async function rows(h) {
  h.w.loadUsersAdmin();
  await ticks();
  const body = h.doc.getElementById('users-body');
  return { body: body, trs: Array.prototype.slice.call(body.querySelectorAll('tr')) };
}
function rowFor(trs, email) {
  return trs.find(tr => (tr.textContent || '').indexOf(email) >= 0) || null;
}
/* САМО <button>. Клетката съдържа и <span> с етикета — по-широк селектор би
   хванал него и проверката „бутонът съществува" би минала без бутон. */
function pencilIn(tr) {
  return Array.prototype.slice.call(tr.querySelectorAll('button'))
    .find(b => (b.getAttribute('onclick') || '').indexOf('editOborotReport') >= 0) || null;
}
const patches = h => h.calls.patch.filter(p => p.table === 'users');
const audits = h => h.calls.post.filter(p => p.table === 'audit_log');

/* Отваря модала за даден потребител през истински клик по молива. */
async function openModal(h, email) {
  const r = await rows(h);
  const tr = rowFor(r.trs, email);
  if (!tr) return null;
  const btn = pencilIn(tr);
  if (!btn) return null;
  realClick(h.w, btn, '✏️');
  await ticks();
  return h.doc.getElementById('oborot-modal-ov');
}
function chosen(doc) {
  const el = doc.querySelector('input[name="oborot-report-opt"]:checked');
  return el ? el.value : null;
}
function pick(doc, val) {
  const els = Array.prototype.slice.call(doc.querySelectorAll('input[name="oborot-report-opt"]'));
  els.forEach(e => { e.checked = (e.value === val); });
  return els.some(e => e.value === val);
}
async function save(h) {
  const btn = Array.prototype.slice.call(h.doc.querySelectorAll('#oborot-modal-ov button'))
    .find(b => (b.textContent || '').indexOf('Запази') >= 0);
  if (!btn) return false;
  realClick(h.w, btn, 'Запази');
  await ticks(); await ticks();
  return true;
}

(async function () {

  section('1. Колоната се рендира с вярна стойност');
  {
    const h = env();
    const r = await rows(h);
    ok('редовете се рендират', r.trs.length === USERS.length, 'редове: ' + r.trs.length);

    const all = rowFor(r.trs, 'sobstvenik@temax.bg');
    const asg = rowFor(r.trs, 'region@temax.bg');
    const non = rowFor(r.trs, 'kasier@temax.bg');
    if (ok('трите реда се намират', !!all && !!asg && !!non)) {
      ok('all → „Всички обекти"', all.textContent.indexOf('Всички обекти') >= 0);
      ok('assigned → „Своите обекти"', asg.textContent.indexOf('Своите обекти') >= 0);
      /* Тирето е в клетката за оборота, не в „Назначени магазини" — затова
         се гледа конкретната клетка, а не целият ред. */
      const cells = Array.prototype.slice.call(non.querySelectorAll('td'));
      const obCell = cells.find(td => (td.querySelector('button[onclick*="editOborotReport"]')));
      ok('null → клетката показва тире', !!obCell && obCell.textContent.indexOf('—') >= 0,
        obCell ? obCell.textContent.trim() : 'няма клетка');
      ok('всеки ред има молив за оборота', r.trs.every(tr => !!pencilIn(tr)));
      ok('редът има 7 клетки (6 заглавни + действията)',
        cells.length === 7, 'клетки: ' + cells.length);
    }
  }
  {
    const h = env();
    await rows(h);
    ok('заявката иска oborot_report',
      h.calls.get.some(u => u.indexOf('users') >= 0 && u.indexOf('oborot_report') >= 0));
    ok('и пак е с изричен select=, не select=*',
      h.calls.get.some(u => u.indexOf('users') >= 0 && u.indexOf('select=') >= 0 && u.indexOf('select=*') < 0));
  }

  section('2. Празен списък — редът заема цялата ширина');
  {
    const h = env({ users: [] });
    const r = await rows(h);
    const td = r.body.querySelector('td');
    if (ok('редът „Няма потребители." се рендира', !!td && td.textContent.indexOf('Няма потребители') >= 0)) {
      const cs = parseInt(td.getAttribute('colspan') || '0', 10);
      /* Колоните в реда са 7; colspan под това оставя стеснен ред, който
         изглежда като счупена таблица. */
      ok('colspan покрива всичките 7 колони', cs === 7, 'colspan=' + cs);
    }
  }

  section('3. Моливът отваря модала със заредена текуща стойност');
  {
    const h = env();
    const ov = await openModal(h, 'sobstvenik@temax.bg');
    if (ok('модалът се отваря', !!ov)) {
      ok('текущата стойност е избрана (all)', chosen(h.doc) === 'all', String(chosen(h.doc)));
      ok('има точно три възможности',
        h.doc.querySelectorAll('input[name="oborot-report-opt"]').length === 3);
      ok('стойностите са \'\', all, assigned',
        Array.prototype.slice.call(h.doc.querySelectorAll('input[name="oborot-report-opt"]'))
          .map(e => e.value).join(',') === ',all,assigned');
      ok('заглавието носи името на човека', ov.textContent.indexOf('Собственик') >= 0);
    }
  }
  {
    const h = env();
    await openModal(h, 'region@temax.bg');
    ok('за assigned е избрано assigned', chosen(h.doc) === 'assigned');
  }
  {
    const h = env();
    await openModal(h, 'kasier@temax.bg');
    ok('за null е избрано „Не получава" (празна стойност)', chosen(h.doc) === '');
  }

  section('4. Записът праща правилния PATCH');
  {
    const h = env();
    await openModal(h, 'kasier@temax.bg');
    pick(h.doc, 'all');
    await save(h);
    const p = patches(h);
    if (ok('тръгва PATCH към users', p.length === 1, 'брой: ' + p.length)) {
      ok('стойността е \'all\'', p[0].body.oborot_report === 'all');
      ok('филтърът е по id на човека', p[0].url.indexOf('id=eq.u-none') >= 0);
      ok('нищо друго не се пипа', Object.keys(p[0].body).length === 1,
        Object.keys(p[0].body).join(','));
    }
    ok('модалът се затваря', !h.doc.getElementById('oborot-modal-ov'));
    ok('списъкът се презарежда',
      h.calls.get.filter(u => u.indexOf('order=role,email') >= 0).length >= 2);
  }
  {
    const h = env();
    await openModal(h, 'kasier@temax.bg');
    pick(h.doc, 'assigned');
    await save(h);
    ok('стойността е \'assigned\'', patches(h)[0] && patches(h)[0].body.oborot_report === 'assigned');
  }
  {
    /* Същината: CHECK-ът в базата отхвърля празен низ. */
    const h = env();
    await openModal(h, 'sobstvenik@temax.bg');
    pick(h.doc, '');
    await save(h);
    const b = patches(h)[0] && patches(h)[0].body;
    if (ok('тръгва PATCH', !!b)) {
      ok('„Не получава" праща null, НЕ празен низ', b.oborot_report === null,
        JSON.stringify(b.oborot_report));
      ok('и наистина е null, не undefined', 'oborot_report' in b && b.oborot_report === null);
    }
  }

  section('5. Одитна следа');
  {
    const h = env();
    await openModal(h, 'kasier@temax.bg');
    pick(h.doc, 'all');
    await save(h);
    const a = audits(h);
    if (ok('logAudit() записва събитие', a.length === 1, 'брой: ' + a.length)) {
      ok('събитието е user_oborot_report_changed', a[0].body.event === 'user_oborot_report_changed');
      ok('носи кой е променен', a[0].body.details.target_user_id === 'u-none');
      ok('носи името', a[0].body.details.target_user_name === 'Касиер');
      ok('носи новата стойност', a[0].body.details.value === 'all');
    }
  }
  {
    /* Провален PATCH не бива да оставя фалшива следа в одита. */
    const h = env({ fail: { PATCH: { status: 400, body: { message: 'violates check constraint' } } } });
    await openModal(h, 'kasier@temax.bg');
    pick(h.doc, 'all');
    await save(h);
    ok('при провал НЕ се пише одит', audits(h).length === 0);
    ok('казва причината, не само „Грешка"',
      h.calls.toast.some(t => /violates check constraint/.test(t)), JSON.stringify(h.calls.toast));
    ok('модалът остава отворен', !!h.doc.getElementById('oborot-modal-ov'));
  }

  section('6. „Своите обекти" без зачисления — предупреждава, но записва');
  {
    const h = env();
    await openModal(h, 'prazen@temax.bg');
    ok('модалът подсказва още при отваряне',
      (h.doc.getElementById('oborot-modal-ov').textContent || '').indexOf('няма зачислени обекти') >= 0);
    pick(h.doc, 'assigned');
    await save(h);
    ok('записът НЕ се блокира', patches(h).length === 1);
    ok('стойността пак е assigned', patches(h)[0].body.oborot_report === 'assigned');
    ok('показва предупреждението',
      h.calls.toast.some(t => t === 'Този потребител няма зачислени обекти и няма да получи имейл.'),
      JSON.stringify(h.calls.toast));
    ok('предупреждението е ПОСЛЕДНО, не припокрито от зелен toast',
      /няма зачислени обекти/.test(h.calls.toast[h.calls.toast.length - 1]),
      JSON.stringify(h.calls.toast));
  }
  {
    /* Човек СЪС зачисления не получава предупреждение. */
    const h = env();
    await openModal(h, 'region@temax.bg');
    pick(h.doc, 'assigned');
    await save(h);
    ok('при налични зачисления няма предупреждение',
      !h.calls.toast.some(t => /няма зачислени обекти/.test(t)), JSON.stringify(h.calls.toast));
  }
  {
    /* 'all' не зависи от зачисленията — предупреждение не му е мястото. */
    const h = env();
    await openModal(h, 'prazen@temax.bg');
    pick(h.doc, 'all');
    await save(h);
    ok('„Всички обекти" без зачисления НЕ предупреждава',
      !h.calls.toast.some(t => /няма зачислени обекти/.test(t)), JSON.stringify(h.calls.toast));
  }

  section('7. Закотвяния');
  {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const thead = html.slice(html.indexOf('<th>Имейл</th>'), html.indexOf('id="users-body"'));
    ok('заглавният ред има „Оборот имейл"', thead.indexOf('<th>Оборот имейл</th>') >= 0);
    ok('и е след „Назначени магазини"',
      thead.indexOf('Назначени магазини') < thead.indexOf('Оборот имейл'));

    const adm = fs.readFileSync(path.join(root, 'admin.js'), 'utf8');
    ok('editAssigned() не е пипана', /function editAssigned\(userId, userName\)/.test(adm));
    ok('заявката за users пак е с изричен select=',
      /sbGet\('users','order=role,email&select=id,/.test(adm));
  }

  report();
})();
