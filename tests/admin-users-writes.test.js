/* Администрация: шестте записа в users минават през едж функцията
   admin-users (етап 3 от затварянето на users, 29.09.2026).

   До етап 3 admin.js пишеше в users директно с публичния ключ — PATCH,
   DELETE и POST към /rest/v1/users. Сега всеки от шестте пътя праща
   {session, action, id?, fields?} към functions/v1/admin-users, а
   функцията проверява админския пропуск. Правата на anon още не са
   затегнати (етап 4), тоест директен запис от клиента би минал мълчаливо —
   затова ГЛОБАЛНАТА проверка тук е, че след всяко действие няма нито една
   заявка с метод ≠ GET към /rest/v1/users.

   Шестте пътя, всеки през истински клик:
     1. „Назначени магазини"   → update {assigned_stores}
     2. „Вечерен оборот"        → update {oborot_report}
     3. „✕" (изтриване)         → delete
     4. „✏️" (редакция)         → update {display_name, store_name, role, active, is_regional}
     5. „+ Добави колега"       → create {email, display_name, store_name, role, active}
     6. „Групи за известия"     → update {notify_groups}

   Пускане:  node tests/admin-users-writes.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const ADMIN = { id: 'u-adm', email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };
const TOKEN = 'eyJ1aWQiOiJ1LWFkbSJ9.c2ln';

/* u-1 е с глобална роля — само при нея редът има бутон за „Назначени магазини". */
const USERS = [
  { id: 'u-1', email: 'acc@temax.bg', display_name: 'Счетоводител', store_name: 'Централен офис',
    role: 'accounting', active: true, assigned_stores: ['Раднево'], oborot_report: null,
    is_regional: false, notify_groups: ['co'] }
];
const STORES = [{ id: 's1', name: 'Раднево' }, { id: 's2', name: 'Троян' }];

function env() {
  const h = boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: { users: USERS, stores: STORES },
    confirm: true
  });
  h.w.currentSession = TOKEN;
  /* auth-set-password (паролата при create) не е обект на теста — {ok:true}. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/auth-set-password') >= 0) {
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{"ok":true}') });
    }
    return orig(url, init);
  };
  return h;
}

/* Всяка заявка с метод ≠ GET към /rest/v1/users. harness-ът записва POST,
   PATCH и DELETE поотделно; table е сегментът след /rest/v1/. */
function restUserWrites(h) {
  return h.calls.post.map(p => ({ m: 'POST', url: p.url, table: p.table }))
    .concat(h.calls.patch.map(p => ({ m: 'PATCH', url: p.url, table: p.table })))
    .concat(h.calls.del.map(u => ({ m: 'DELETE', url: u, table: null })))
    .filter(r => r.table === 'users' || /\/rest\/v1\/users(\?|$)/.test(String(r.url)));
}

async function usersTable(h) {
  h.w.loadUsersAdmin();
  await ticks();
  return h.doc.getElementById('users-body');
}
function rowBtn(body, fn) {
  return Array.prototype.slice.call(body.querySelectorAll('button'))
    .find(b => (b.getAttribute('onclick') || '').indexOf(fn + '(') === 0) || null;
}

const results = [];
/* Общата опашка на всеки път: точно едно извикване, правилният action,
   session, и НИТО един директен запис. */
function checkCall(h, label, action, id, fieldKeys) {
  const calls = h.calls.adminUsers;
  const c = calls[calls.length - 1];
  if (ok(label + ': точно едно извикване на admin-users', calls.length === 1, JSON.stringify(calls))) {
    ok(label + ': action ' + action, c.action === action, c.action);
    ok(label + ': session е currentSession', c.session === TOKEN, JSON.stringify(c.session));
    if (id === null) ok(label + ': без id', !('id' in c), JSON.stringify(c));
    else ok(label + ': id ' + id, c.id === id, c.id);
    if (fieldKeys === null) ok(label + ': без fields', !('fields' in c), JSON.stringify(c));
    else ok(label + ': fields = ' + fieldKeys,
      Object.keys(c.fields || {}).sort().join(',') === fieldKeys, Object.keys(c.fields || {}).sort().join(','));
  }
  const bad = restUserWrites(h);
  results.push({ label, bad: bad.length });
  ok(label + ': ГЛОБАЛНО — нито една заявка ≠ GET към /rest/v1/users', bad.length === 0, JSON.stringify(bad));
  return c;
}

(async function () {

  section('1. Назначени магазини');
  {
    const h = env();
    const body = await usersTable(h);
    if (guard('клик по бутона за магазини', () => realClick(h.w, rowBtn(body, 'editAssigned'), 'editAssigned'))) {
      await ticks();
      const ov = h.doc.getElementById('assigned-modal-ov');
      if (ok('модалът се отваря', !!ov)) {
        h.doc.querySelector('.assigned-store-cb[value="Троян"]').checked = true;
        realClick(h.w, btn(ov, 'Запази'), 'Запази');
        await ticks();
        const c = checkCall(h, 'магазини', 'update', 'u-1', 'assigned_stores');
        if (c) ok('магазини: Раднево и Троян', JSON.stringify(c.fields.assigned_stores) === '["Раднево","Троян"]',
          JSON.stringify(c.fields && c.fields.assigned_stores));
        ok('магазини: зелен toast', h.calls.toast.some(t => t.indexOf('Назначени 2') >= 0), h.calls.toast.join(' | '));
      }
    }
  }

  section('2. Вечерен оборот');
  {
    const h = env();
    const body = await usersTable(h);
    if (guard('клик по молива за оборота', () => realClick(h.w, rowBtn(body, 'editOborotReport'), 'editOborotReport'))) {
      await ticks();
      const ov = h.doc.getElementById('oborot-modal-ov');
      if (ok('модалът се отваря', !!ov)) {
        h.doc.querySelector('input[name="oborot-report-opt"][value="all"]').checked = true;
        realClick(h.w, btn(ov, 'Запази'), 'Запази');
        await ticks();
        const c = checkCall(h, 'оборот', 'update', 'u-1', 'oborot_report');
        if (c) ok('оборот: стойност all', c.fields.oborot_report === 'all');
      }
    }
  }

  section('3. Изтриване');
  {
    const h = env();
    const body = await usersTable(h);
    if (guard('клик по ✕', () => realClick(h.w, rowBtn(body, 'deleteUser'), 'deleteUser'))) {
      await ticks();
      ok('изтриване: потвърждение е поискано', h.calls.confirm.length === 1);
      checkCall(h, 'изтриване', 'delete', 'u-1', null);
      ok('изтриване: зелен toast', h.calls.toast.some(t => t.indexOf('Потребителят е изтрит') >= 0), h.calls.toast.join(' | '));
    }
  }

  section('4. Редакция');
  {
    const h = env();
    const body = await usersTable(h);
    if (guard('клик по ✏️', () => realClick(h.w, rowBtn(body, 'openUserModal'), 'openUserModal'))) {
      await ticks();
      const ov = h.doc.getElementById('user-modal-ov');
      if (ok('модалът се отваря', !!ov)) {
        h.doc.getElementById('um-name').value = 'Преименуван';
        realClick(h.w, btn(ov, 'Запази'), 'Запази');
        await ticks();
        const c = checkCall(h, 'редакция', 'update', 'u-1', 'active,display_name,is_regional,role,store_name');
        if (c) ok('редакция: новото име', c.fields.display_name === 'Преименуван');
      }
    }
  }

  section('5. Създаване');
  {
    const h = env();
    const addBtn = Array.prototype.slice.call(h.doc.querySelectorAll('button'))
      .find(b => (b.getAttribute('onclick') || '') === 'openUserModal(null)');
    if (guard('клик по „+ Добави колега"', () => realClick(h.w, addBtn, '+ Добави колега'))) {
      await ticks();
      const ov = h.doc.getElementById('user-modal-ov');
      if (ok('модалът се отваря', !!ov)) {
        h.doc.getElementById('um-email').value = 'Nov@Temax.bg ';
        h.doc.getElementById('um-name').value = 'Нов';
        h.doc.getElementById('um-role').value = 'manager';
        h.doc.getElementById('um-store').value = 'Троян';
        h.doc.getElementById('um-pass').value = 'parola1';
        realClick(h.w, btn(ov, 'Добави'), 'Добави');
        await ticks();
        const c = checkCall(h, 'създаване', 'create', null, 'active,display_name,email,role,store_name');
        if (c) ok('създаване: имейлът е нормализиран', c.fields.email === 'nov@temax.bg', c.fields.email);
        ok('създаване: toast „добавен"', h.calls.toast.some(t => t.indexOf('добавен') >= 0), h.calls.toast.join(' | '));
      }
    }
  }

  section('6. Групи за известия');
  {
    const h = env();
    const body = await usersTable(h);
    if (guard('клик по бутона за групите', () => realClick(h.w, rowBtn(body, 'editNotifyGroups'), 'editNotifyGroups'))) {
      await ticks();
      const ov = h.doc.getElementById('notify-groups-modal-ov');
      if (ok('модалът се отваря', !!ov)) {
        h.doc.querySelector('.ntf-grp-cb[value="regional"]').checked = true;
        realClick(h.w, btn(ov, 'Запази'), 'Запази');
        await ticks();
        const c = checkCall(h, 'групи', 'update', 'u-1', 'notify_groups');
        if (c) ok('групи: co и regional', (c.fields.notify_groups || []).join(',') === 'co,regional',
          JSON.stringify(c.fields.notify_groups));
      }
    }
  }

  section('7. Обобщение на глобалната проверка');
  ok('и шестте пътя минаха през проверката', results.length === 6, results.map(r => r.label).join(','));
  ok('директни записи в /rest/v1/users — общо 0',
     results.every(r => r.bad === 0), JSON.stringify(results));

  report();
})();
