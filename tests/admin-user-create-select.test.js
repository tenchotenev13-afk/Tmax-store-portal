/* Създаването на потребител иска само id от PostgREST.

   POST-ът към users праща Prefer: return=representation. Без ?select=
   PostgREST прави RETURNING users.*, а Postgres иска SELECT право върху
   ВСЯКА върната колона — включително password_hash. Докато anon има таблично
   право, това минава; в мига, в който правата станат колонни, същият POST
   връща 403 и "Добави колега" спира да работи изцяло.

   Кодът и без това чете само res.data[0].id (admin.js:326), затова
   ?select=id е достатъчен и премахва зависимостта от скритите колони.

   Пускане:  node tests/admin-user-create-select.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

const STORES = [{ id: 's1', name: 'Раднево' }, { id: 's2', name: 'Гълъбово' }];

/* Колоните, които anon НЯМА да може да чете след затягането на правата.
   Ако някога се появят в ?select=, тестът трябва да падне. */
const HIDDEN = ['password_hash', 'history_pin_hash', 'password'];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: { users: opts.users || [], stores: STORES }
  });
  h.edge = [];        /* извиквания към Edge Functions */
  h.postUrls = [];    /* URL-ите на POST-овете към REST */
  /* Собствен запис на POST-овете: стъбът долу отговаря сам за /users и
     заявката не стига до харнеса, тоест не влиза в h.calls.post. */
  h.posts = [];

  /* Стъб над харнеса: Edge Function-ите не са REST и трябва да върнат {ok:true},
     иначе setUserPassword рапортува провал и потокът се разминава с реалния. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    if (String(url).indexOf('/functions/v1/') >= 0) {
      h.edge.push({ url: String(url), body: init.body });
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve('{"ok":true}')
      });
    }
    if ((init.method || 'GET').toUpperCase() === 'POST') {
      h.postUrls.push(String(url));
      var parsed = null;
      try { parsed = init.body ? JSON.parse(init.body) : null; } catch (e) { parsed = init.body; }
      h.posts.push({ url: String(url), body: parsed });
      /* return=representation → PostgREST връща масив с реда. Връщаме само
         id, точно каквото ?select=id би дал. */
      if (String(url).indexOf('/users') >= 0) {
        return Promise.resolve({
          ok: true, status: 201,
          json: () => Promise.resolve([{ id: 'new-user-1' }]),
          text: () => Promise.resolve('[{"id":"new-user-1"}]')
        });
      }
    }
    return orig(url, init);
  };
  return h;
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

  section('1. POST-ът иска само id');
  {
    const h = env();
    if (guard('модалът се отваря', () => h.w.openUserModal(null))) {
      fillModal(h.doc, { email: 'nov@temax.bg', name: 'Нов Колега', role: 'user',
                         store: 'Раднево', pass: 'tajna123' });
      if (guard('клик по "Добави"', () => realClick(h.w, btn(modal(h.doc), 'Добави')))) {
        await ticks();
        const url = h.postUrls.find(u => u.indexOf('/users') >= 0);
        if (ok('POST към users е изпратен', !!url, h.postUrls.join(' | '))) {
          ok('URL-ът съдържа ?select=id', /\/users\?select=id\b/.test(url), url);
          HIDDEN.forEach(function (c) {
            ok('не иска ' + c, url.indexOf(c) < 0, url);
          });
        }
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

  section('3. Тялото на POST-а не се променя — само петте разрешени колони');
  {
    const h = env();
    h.w.openUserModal(null);
    fillModal(h.doc, { email: 'nov3@temax.bg', name: 'Трети', role: 'user',
                       store: 'Раднево', pass: 'x1234', active: false });
    realClick(h.w, btn(modal(h.doc), 'Добави'));
    await ticks();
    const p = h.posts.find(x => x.url.indexOf('/users') >= 0);
    if (ok('POST-ът е прихванат', !!p, JSON.stringify(h.posts))) {
      const keys = Object.keys(p.body).sort().join(',');
      ok('точно email,display_name,store_name,role,active',
         keys === 'active,display_name,email,role,store_name', keys);
      ok('active:false стига до тялото', p.body.active === false);
      HIDDEN.forEach(function (c) {
        ok('тялото не съдържа ' + c, !(c in p.body), keys);
      });
    }
  }

  section('4. Редакция на съществуващ — пътят е друг и не е пипан');
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
        ok('минава през PATCH, не през POST', h.calls.patch.length === 1, h.calls.patch.length);
        ok('няма POST към users',
           !h.postUrls.some(u => u.indexOf('/users') >= 0), h.postUrls.join(' | '));
        const keys = Object.keys(h.calls.patch[0].body).sort().join(',');
        /* is_regional се добави на 24.08.2026 (признакът „регионален
           мениджър"). Влиза САМО тук, в PATCH — при създаване anon няма
           INSERT грант върху колоната, затова секция 3 по-горе продължава
           да иска тяло без нея. */
        ok('PATCH праща само разрешените колони',
           keys === 'active,display_name,is_regional,role,store_name', keys);
      }
    }
  }

  section('5. Провалил се POST не води до смяна на парола');
  {
    const h = env();
    h.w.fetch = function (url, init) {
      init = init || {};
      if ((init.method || '').toUpperCase() === 'POST' && String(url).indexOf('/users') >= 0) {
        return Promise.resolve({
          ok: false, status: 403,
          json: () => Promise.resolve({ message: 'permission denied for table users' }),
          text: () => Promise.resolve('{"message":"permission denied for table users"}')
        });
      }
      if (String(url).indexOf('/functions/v1/') >= 0) {
        h.edge.push({ url: String(url), body: init.body });
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}') });
      }
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    h.w.openUserModal(null);
    fillModal(h.doc, { email: 'lош@temax.bg', role: 'user', store: 'Раднево', pass: 'x1234' });
    realClick(h.w, btn(modal(h.doc), 'Добави'));
    await ticks();
    ok('показана е грешка', h.calls.toast.some(t => t.indexOf('Грешка') >= 0),
       h.calls.toast.join(' | '));
    ok('НЕ е извикан auth-set-password',
       !h.edge.some(e => e.url.indexOf('auth-set-password') >= 0), h.edge.map(e => e.url).join(' | '));
    ok('НЕ е показано "добавен"', !h.calls.toast.some(t => t.indexOf('добавен') >= 0),
       h.calls.toast.join(' | '));
  }

  section('6. Празен отговор от PostgREST не хвърля');
  {
    const h = env();
    h.w.fetch = (function (orig) {
      return function (url, init) {
        init = init || {};
        if ((init.method || '').toUpperCase() === 'POST' && String(url).indexOf('/users') >= 0) {
          return Promise.resolve({ ok: true, status: 201,
            json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
        }
        return orig(url, init);
      };
    })(h.w.fetch);
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
