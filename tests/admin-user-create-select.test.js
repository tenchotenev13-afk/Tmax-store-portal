/* Създаването на потребител иска само id — и не докосва скритите колони.

   До 29.09.2026 POST-ът отиваше направо в /rest/v1/users?select=id с
   Prefer: return=representation (без ?select= PostgREST прави RETURNING
   users.*, а Postgres иска SELECT право върху ВСЯКА върната колона —
   включително password_hash; при колонни права „Добави колега" би спрял).

   От етап 3 записът минава през едж функцията admin-users: тя вмъква с
   service ключа и чете обратно само id. Смисълът на теста е същият — тялото
   носи точно петте разрешени колони, никога скритите, и id-то от отговора
   стига до смяната на паролата — но проверката е върху тялото към функцията,
   а директен запис в /rest/v1/users вече не бива да има изобщо.

   Пускане:  node tests/admin-user-create-select.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

const STORES = [{ id: 's1', name: 'Раднево' }, { id: 's2', name: 'Гълъбово' }];

/* Колоните, които anon НЯМА да може да чете след затягането на правата. */
const HIDDEN = ['password_hash', 'history_pin_hash', 'password'];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: { users: opts.users || [], stores: STORES },
    adminUsers: opts.adminUsers
  });
  h.w.currentSession = 'adm.sig';
  h.edge = [];        /* извиквания към auth-set-password */
  /* auth-set-password трябва да върне {ok:true}, иначе setUserPassword
     рапортува провал и потокът се разминава с реалния. admin-users минава
     през стъба на harness-а (calls.adminUsers). */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    if (String(url).indexOf('/functions/v1/auth-set-password') >= 0) {
      h.edge.push({ url: String(url), body: init.body });
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve('{"ok":true}')
      });
    }
    return orig(url, init);
  };
  return h;
}

/* Директни записи в users през PostgREST — след етап 3 не бива да има нито един. */
function restUserWrites(h) {
  return h.calls.post.concat(h.calls.patch).filter(p => p.table === 'users')
    .concat(h.calls.del.filter(u => String(u).indexOf('/users') >= 0));
}

/* Търсим бутона САМО в модала. index.html има още 8 бутона с "Добави" —
   единият вика resetDocModal и търсене по цялото body хваща него. */
function modal(doc) { return doc.getElementById('user-modal-ov'); }

function fillModal(doc, o) {
  doc.getElementById('um-email').value = o.email;
  doc.getElementById('um-name').value = o.name || '';
  doc.getElementById('um-role').value = o.role;
  doc.getElementById('um-store').value = o.store || '';
  doc.getElementById('um-pass').value = o.pass || '';
  if (typeof o.active === 'boolean') doc.getElementById('um-active').checked = o.active;
}

(async function () {

  section('1. Създаването отива към admin-users, не към /rest/v1/users');
  {
    const h = env();
    if (guard('модалът се отваря', () => h.w.openUserModal(null))) {
      fillModal(h.doc, { email: 'nov@temax.bg', name: 'Нов Колега', role: 'user',
                         store: 'Раднево', pass: 'tajna123' });
      if (guard('клик по "Добави"', () => realClick(h.w, btn(modal(h.doc), 'Добави')))) {
        await ticks();
        const c = h.calls.adminUsers[0];
        if (ok('admin-users е извикана', !!c, JSON.stringify(h.calls.adminUsers))) {
          ok('action: create', c.action === 'create', c.action);
          ok('със session', c.session === 'adm.sig', JSON.stringify(c.session));
          ok('без id', !('id' in c), JSON.stringify(c));
        }
        ok('няма директен запис в users', restUserWrites(h).length === 0, JSON.stringify(restUserWrites(h)));
      }
    }
  }

  section('2. id-то от отговора стига до смяната на паролата');
  {
    const h = env();
    h.w.openUserModal(null);
    fillModal(h.doc, { email: 'nov2@temax.bg', role: 'manager', store: 'Гълъбово', pass: 'parola1' });
    realClick(h.w, btn(modal(h.doc), 'Добави'));
    await ticks();
    const call = h.edge.find(e => e.url.indexOf('auth-set-password') >= 0);
    if (ok('auth-set-password е извикан', !!call, h.edge.map(e => e.url).join(' | '))) {
      const body = JSON.parse(call.body);
      ok('подава се id-то от отговора', body.user_id === 'new-user-1', JSON.stringify(body.user_id));
      ok('подава се паролата', body.new_password === 'parola1');
    }
    ok('показано е потвърждение',
       h.calls.toast.some(t => t.indexOf('добавен') >= 0), h.calls.toast.join(' | '));
  }

  section('3. fields — само петте разрешени колони');
  {
    const h = env();
    h.w.openUserModal(null);
    fillModal(h.doc, { email: 'nov3@temax.bg', name: 'Трети', role: 'user',
                       store: 'Раднево', pass: 'x1234', active: false });
    realClick(h.w, btn(modal(h.doc), 'Добави'));
    await ticks();
    const c = h.calls.adminUsers[0];
    if (ok('тялото е прихванато', !!(c && c.fields), JSON.stringify(h.calls.adminUsers))) {
      const keys = Object.keys(c.fields).sort().join(',');
      ok('точно email,display_name,store_name,role,active',
         keys === 'active,display_name,email,role,store_name', keys);
      ok('active:false стига до тялото', c.fields.active === false);
      ok('имейлът е в долен регистър и без интервали', c.fields.email === 'nov3@temax.bg', c.fields.email);
      HIDDEN.forEach(function (col) {
        ok('fields не съдържа ' + col, !(col in c.fields), keys);
        ok('тялото не съдържа ' + col, !(col in c), Object.keys(c).join(','));
      });
    }
  }

  section('4. Редакция на съществуващ — action: update, без email');
  {
    const EXIST = [{ id: 'u-1', email: 'star@temax.bg', display_name: 'Стар',
                     store_name: 'Раднево', role: 'user', active: true }];
    const h = env({ users: EXIST });
    if (guard('модалът за редакция се отваря', () => h.w.openUserModal('u-1'))) {
      await ticks();
      fillModal(h.doc, { email: 'star@temax.bg', name: 'Преименуван', role: 'manager',
                         store: 'Гълъбово' });
      if (guard('клик по "Запази"', () => realClick(h.w, btn(modal(h.doc), 'Запази')))) {
        await ticks();
        const c = h.calls.adminUsers[0];
        if (ok('admin-users е извикана веднъж', h.calls.adminUsers.length === 1, h.calls.adminUsers.length)) {
          ok('action: update за u-1', c.action === 'update' && c.id === 'u-1', c.action + ' ' + c.id);
          const keys = Object.keys(c.fields).sort().join(',');
          /* is_regional влиза САМО тук — при създаване го няма (виж секция 3). */
          ok('update праща само разрешените колони',
             keys === 'active,display_name,is_regional,role,store_name', keys);
        }
        ok('няма директен запис в users', restUserWrites(h).length === 0, JSON.stringify(restUserWrites(h)));
      }
    }
  }

  section('5. Отказан create (403) не води до смяна на парола');
  {
    const h = env({ adminUsers: () => ({ status: 403,
      body: { ok: false, reason: 'forbidden', message: 'Нямате права за тази операция.' } }) });
    h.w.openUserModal(null);
    fillModal(h.doc, { email: 'losh@temax.bg', role: 'user', store: 'Раднево', pass: 'x1234' });
    realClick(h.w, btn(modal(h.doc), 'Добави'));
    await ticks();
    ok('показана е грешка', h.calls.toast.some(t => t.indexOf('Грешка') >= 0),
       h.calls.toast.join(' | '));
    ok('НЕ е извикан auth-set-password',
       !h.edge.some(e => e.url.indexOf('auth-set-password') >= 0), h.edge.map(e => e.url).join(' | '));
    ok('НЕ е показано "добавен"', !h.calls.toast.some(t => t.indexOf('добавен') >= 0),
       h.calls.toast.join(' | '));
  }

  section('6. Отговор без id не хвърля и не сменя парола');
  {
    const h = env({ adminUsers: () => ({ status: 200, body: { ok: true } }) });
    h.w.openUserModal(null);
    fillModal(h.doc, { email: 'praz@temax.bg', role: 'user', store: 'Раднево', pass: 'x1234' });
    if (guard('кликът не хвърля', () => realClick(h.w, btn(modal(h.doc), 'Добави')))) {
      await ticks();
      ok('показана е грешка вместо мълчание',
         h.calls.toast.some(t => t.indexOf('Грешка') >= 0), h.calls.toast.join(' | '));
      ok('няма опит за смяна на парола',
         !h.edge.some(e => e.url.indexOf('auth-set-password') >= 0));
    }
  }

  report();
})();
