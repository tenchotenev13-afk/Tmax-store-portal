/* Админската смяна на парола праща подписания пропуск (етап 2 от
   затварянето на users).

   От 28.09.2026 auth-set-password БЕЗ old_password (админски ресет по
   произволен user_id) иска body.session — пропускът, който auth-login
   връща и shared.js пази в currentSession — с роля admin. Без него 403.
   setUserPassword в admin.js е единственият клиент по този път; смяната на
   СОБСТВЕНА парола (shared.js, с old_password) не се променя.

   Пускане:  node tests/admin-set-password-session.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const ADMIN = { id: 'adm-1', email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };
const EXIST = [{ id: 'u-1', email: 'star@temax.bg', display_name: 'Стар',
                 store_name: 'Раднево', role: 'user', active: true, is_regional: false }];
const TOKEN = 'eyJ1aWQiOiJhZG0tMSJ9.c2lnbmF0dXJl';

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: { users: EXIST, stores: [] }
  });
  h.w.currentSession = 'session' in opts ? opts.session : TOKEN;
  h.edge = [];
  const orig = h.w.fetch;
  const reply = opts.reply || { status: 200, body: { ok: true } };
  /* Стъбът е само за auth-set-password. admin-users (записите в users от
     етап 3) минава през стъба на harness-а — той връща id при create. */
  h.w.fetch = function (url, init) {
    init = init || {};
    if (String(url).indexOf('/functions/v1/auth-set-password') >= 0) {
      let parsed = null;
      try { parsed = JSON.parse(init.body); } catch (e) { parsed = init.body; }
      h.edge.push({ url: String(url), body: parsed });
      return Promise.resolve({
        ok: reply.status < 400, status: reply.status,
        json: () => Promise.resolve(reply.body),
        text: () => Promise.resolve(JSON.stringify(reply.body))
      });
    }
    return orig(url, init);
  };
  return h;
}

function modal(doc) { return doc.getElementById('user-modal-ov'); }
function setPass(call) { return call.url.indexOf('auth-set-password') >= 0; }

async function editWithPassword(h, pass) {
  h.w.openUserModal('u-1');
  await ticks();
  h.doc.getElementById('um-pass').value = pass;
  realClick(h.w, btn(modal(h.doc), 'Запази'));
  await ticks();
}

(async function () {

  section('1. Редакция с нова парола → session в тялото (истински клик)');
  {
    const h = env();
    {
      await editWithPassword(h, 'novaParola1');
      const call = h.edge.find(setPass);
      if (ok('auth-set-password е извикан', !!call, h.edge.map(e => e.url).join(' | '))) {
        ok('session е currentSession', call.body.session === TOKEN, JSON.stringify(call.body.session));
        ok('user_id е редактираният', call.body.user_id === 'u-1', call.body.user_id);
        ok('new_password е въведената', call.body.new_password === 'novaParola1');
        ok('без old_password (админски ресет)', !('old_password' in call.body));
        ok('точно user_id,new_password,session',
           Object.keys(call.body).sort().join(',') === 'new_password,session,user_id',
           Object.keys(call.body).sort().join(','));
      }
      ok('потвърждение „Записано!"', h.calls.toast.some(t => t.indexOf('Записано') >= 0), h.calls.toast.join(' | '));
    }
  }

  section('2. Нов колега → session и в тялото за първата парола');
  {
    const h = env();
    h.w.openUserModal(null);
    h.doc.getElementById('um-email').value = 'nov@temax.bg';
    h.doc.getElementById('um-role').value = 'user';
    h.doc.getElementById('um-pass').value = 'parola1';
    realClick(h.w, btn(modal(h.doc), 'Добави'));
    await ticks();
    const call = h.edge.find(setPass);
    if (ok('auth-set-password е извикан', !!call)) {
      ok('session е currentSession', call.body.session === TOKEN, JSON.stringify(call.body.session));
      ok('user_id е новото id', call.body.user_id === 'new-user-1');
    }
  }

  section('3. Редакция БЕЗ парола → auth-set-password изобщо не се вика');
  {
    const h = env();
    await editWithPassword(h, '');
    ok('няма извикване', !h.edge.some(setPass), h.edge.map(e => e.url).join(' | '));
  }

  section('4. Празен пропуск (вход преди етап 1) → полето е null, не липсва');
  {
    const h = env({ session: null });
    await editWithPassword(h, 'x12345');
    const call = h.edge.find(setPass);
    if (ok('auth-set-password е извикан', !!call)) {
      ok('session: null в тялото', 'session' in call.body && call.body.session === null, JSON.stringify(call.body));
    }
  }

  section('5. Сървърът отказва (403 forbidden) → админът вижда защо');
  {
    const h = env({ reply: { status: 403, body: { ok: false, reason: 'forbidden', message: 'Нямате права за тази операция.' } } });
    await editWithPassword(h, 'x12345');
    ok('предупреждение, че паролата НЕ е сменена, със съобщението от сървъра',
       h.calls.toast.some(t => t.indexOf('паролата НЕ бе сменена') >= 0 && t.indexOf('Нямате права') >= 0),
       h.calls.toast.join(' | '));
    ok('не е записан audit за сменена парола',
       !h.calls.post.some(p => p.table === 'audit_log' && JSON.stringify(p.body).indexOf('user_password_changed_by_admin') >= 0));
  }

  report();
})();
