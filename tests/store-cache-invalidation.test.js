/* Кешовете с обекти се нулират и при промяна на ПОТРЕБИТЕЛ, не само на магазин.

   reportableStoresCache (shared.js) се строи от уникалните store_name в users
   и е знаменателят на бройките в Бюлетина. invalidateStoreCaches() обаче се
   викаше само от addStore() и deleteStore() — тоест от промени по таблицата
   stores. Създаването на първия акаунт за обект без такъв (Пазарджик няма нито
   един) не пипаше нищо: знаменателят оставаше 18 при 19 реални обекта, докато
   някой не презареди страницата. Тихо разминаване, което после изглежда като
   „новият обект не се брои".

   Затова функцията вече се вика и от submitUserModal() (създаване И редакция —
   смяна на store_name може и да извади обект от списъка) и от deleteUser()
   (последният акаунт на обект). Оттам и преименуването: вторият кеш не идва
   от таблицата stores, затова „StoreCaches", а не „StoresCache".

   Пускане: node tests/store-cache-invalidation.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick, btn } = H;

const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

/* 18-те реални обекта. Пазарджик е в stores, но НЯМА нито един акаунт. */
const REAL = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово', 'Козлодуй',
  'Кърджали', 'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Шумен'
];
const STORES = REAL.concat(['Пазарджик', 'Централен офис']).map((n, i) => ({ id: 's' + i, name: n }));
const USERS_18 = REAL.concat(['Централен офис']).map((n, i) => ({ id: 'u' + i, store_name: n }));
/* Същото + първият акаунт за Пазарджик. */
const USERS_19 = USERS_18.concat([{ id: 'u-nov', store_name: 'Пазарджик' }]);

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'admin.js'],
    user: ADMIN,
    data: { users: opts.users || USERS_18, stores: STORES },
    confirm: true
  });
  h.postUrls = [];
  /* Създаването на потребител ползва гол fetch с return=representation —
     харнесът връща {} и потокът се разминава с реалния. Същият стъб като в
     admin-user-create-select.test.js. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    if (String(url).indexOf('/functions/v1/') >= 0) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve('{"ok":true}')
      });
    }
    if ((init.method || 'GET').toUpperCase() === 'POST' && String(url).indexOf('/users') >= 0) {
      h.postUrls.push(String(url));
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve([{ id: 'u-nov' }]),
        text: () => Promise.resolve('[{"id":"u-nov"}]')
      });
    }
    return orig(url, init);
  };
  return h;
}

function modal(doc) { return doc.getElementById('user-modal-ov'); }
function fillModal(doc, o) {
  doc.getElementById('um-email').value = o.email || '';
  doc.getElementById('um-name').value = o.name || '';
  doc.getElementById('um-role').value = o.role || 'user';
  doc.getElementById('um-store').value = o.store || '';
  doc.getElementById('um-pass').value = o.pass || '';
  if (typeof o.active === 'boolean') doc.getElementById('um-active').checked = o.active;
}

/* Загрява двата кеша и връща броя реални обекти. */
async function warm(w) {
  await Promise.all([w.loadAllStores(), w.loadReportableStores()]);
  return w.reportableStoresCache.length;
}
function bothCleared(w) {
  return w.allStoresCache === null && w.reportableStoresCache === null;
}

(async function run() {

  /* ═══ 1. Самата функция ═══════════════════════════════════════════════ */
  section('1. invalidateStoreCaches() нулира ДВАТА кеша');
  {
    const h = env();
    const { w } = h;
    ok('загрят кеш е 18 обекта', (await warm(w)) === 18, String(w.reportableStoresCache.length));
    ok('allStoresCache е 20 (18 + Пазарджик + ЦО)', w.allStoresCache.length === 20,
      String(w.allStoresCache.length));
    w.invalidateStoreCaches();
    ok('и двата са нулирани', bothCleared(w),
      JSON.stringify([w.allStoresCache, w.reportableStoresCache]));
    /* Старото име не бива да остане като жив псевдоним — иначе call site,
       който не е преименуван, ще продължи да "работи" незабелязано. */
    ok('старото име invalidateStoresCache вече не съществува',
      typeof w.invalidateStoresCache === 'undefined', typeof w.invalidateStoresCache);
  }

  /* ═══ 2. Създаване на потребител ══════════════════════════════════════ */
  section('2. Първи акаунт за обект без такъв -> знаменателят пораства');
  {
    const h = env();
    const { w, doc } = h;
    ok('преди: 18 обекта', (await warm(w)) === 18, String(w.reportableStoresCache.length));

    if (guard('модалът се отваря', () => w.openUserModal(null))) {
      fillModal(doc, { email: 'pz@temax.bg', name: 'Управител Пазарджик',
                       role: 'manager', store: 'Пазарджик', pass: 'tajna123' });
      if (guard('клик по "Добави"', () => realClick(w, btn(modal(doc), 'Добави')))) {
        await ticks();
        ok('POST към users е изпратен', h.postUrls.length === 1, h.postUrls.join(' | '));
        ok('кешовете са нулирани', bothCleared(w),
          JSON.stringify([w.allStoresCache, w.reportableStoresCache]));

        /* Базата вече съдържа новия акаунт — следващото четене дава 19. */
        h.setData('users', USERS_19);
        await w.loadReportableStores();
        ok('след: 19 обекта', w.reportableStoresCache.length === 19,
          String(w.reportableStoresCache.length));
        ok('Пазарджик вече се брои', w.reportableStoresCache.indexOf('Пазарджик') >= 0);

        /* И знаменателят в Бюлетина го отразява веднага. */
        const html = w.calItemStatusHtml('t-1', 'regular', null, null);
        ok('броячът е /19, не /18', /\/19</.test(html), html);
      }
    }
  }

  /* ═══ 3. Редакция на потребител ═══════════════════════════════════════ */
  section('3. Редакция също нулира (смяна на store_name)');
  {
    const h = env();
    const { w, doc } = h;
    await warm(w);
    /* Редакция: _userEditId е зададен, потокът минава през sbPatch. */
    if (guard('модалът се отваря за редакция', () => w.openUserModal('u0'))) {
      await ticks();
      fillModal(doc, { email: 'vraca@temax.bg', role: 'manager', store: 'Пазарджик' });
      if (guard('клик по "Запази"', () => {
        const b = btn(modal(doc), 'Запази') || btn(modal(doc), 'Запиши');
        if (!b) throw new Error('бутонът за запис не е намерен');
        realClick(w, b);
      })) {
        await ticks();
        ok('PATCH към users е изпратен',
          h.calls.patch.some(p => String(p.url).indexOf('/users') >= 0),
          h.calls.patch.map(p => p.url).join(' | '));
        ok('кешовете са нулирани', bothCleared(w),
          JSON.stringify([w.allStoresCache, w.reportableStoresCache]));
      }
    }
  }

  /* ═══ 4. Изтриване на потребител ══════════════════════════════════════ */
  section('4. Изтриване на потребител нулира');
  {
    const h = env();
    const { w } = h;
    await warm(w);
    guard('deleteUser() не хвърля', () => w.deleteUser('u0', 'vraca@temax.bg'));
    await ticks();
    ok('DELETE е изпратен', h.calls.del.some(u => String(u).indexOf('/users') >= 0),
      h.calls.del.join(' | '));
    ok('кешовете са нулирани', bothCleared(w),
      JSON.stringify([w.allStoresCache, w.reportableStoresCache]));
  }

  /* ═══ 5. Старите два call site-а са оцелели след преименуването ═══════ */
  section('5. addStore() и deleteStore() продължават да нулират');
  {
    const h = env();
    const { w, doc } = h;
    await warm(w);
    /* addStore() чете от два input-а, които живеят в екрана на Администрация. */
    ['new-store-name', 'new-store-city'].forEach(function (id) {
      if (!doc.getElementById(id)) {
        const el = doc.createElement('input'); el.id = id; doc.body.appendChild(el);
      }
    });
    doc.getElementById('new-store-name').value = 'Нов обект';
    guard('addStore() не хвърля', () => w.addStore());
    await ticks();
    ok('addStore нулира кешовете', bothCleared(w),
      JSON.stringify([w.allStoresCache, w.reportableStoresCache]));
  }
  {
    const h = env();
    const { w } = h;
    await warm(w);
    guard('deleteStore() не хвърля', () => w.deleteStore('s0', 'Враца'));
    await ticks();
    ok('deleteStore нулира кешовете', bothCleared(w),
      JSON.stringify([w.allStoresCache, w.reportableStoresCache]));
  }

  /* ═══ 6. Провалила се заявка НЕ нулира ═══════════════════════════════ */
  /* Иначе всеки отказ би изхвърлял топлия кеш без причина и следващият
     рендер би теглил наново, без нищо да се е променило. */
  section('6. Провалило се изтриване не пипа кешовете');
  {
    const h = env();
    const { w } = h;
    h.w.fetch = (function (orig) {
      return function (url, init) {
        init = init || {};
        if ((init.method || 'GET').toUpperCase() === 'DELETE') {
          return Promise.resolve({
            ok: false, status: 403,
            headers: { get: () => null },
            json: () => Promise.resolve({ message: 'отказано' }),
            text: () => Promise.resolve('{"message":"отказано"}')
          });
        }
        return orig(url, init);
      };
    })(h.w.fetch);
    await warm(w);
    guard('deleteUser() не хвърля при 403', () => w.deleteUser('u0', 'vraca@temax.bg'));
    await ticks();
    ok('кешовете са непокътнати',
      w.allStoresCache !== null && w.reportableStoresCache !== null,
      JSON.stringify([w.allStoresCache && w.allStoresCache.length,
                      w.reportableStoresCache && w.reportableStoresCache.length]));
  }

  report();
})();
