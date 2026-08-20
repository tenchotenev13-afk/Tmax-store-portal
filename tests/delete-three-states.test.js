/* Изтриване: три различими състояния вместо две.

   PostgREST връща 204 и когато НЕ е изтрил нищо — RLS отказ, вече изтрит ред
   или двойно кликване изглеждат точно като успех. Затова 15 места в портала
   показваха зелен toast безусловно, а admin.js записваше и в одитния лог
   "потребителят е изтрит" за нещо, което не е станало.

   sbDelete вече праща Prefer: count=exact и връща:
     {ok:false, status, error}  — отказано
     {ok:true, count:0}         — минало е, нищо не е съвпаднало
     {ok:true, count:>0}        — реално изтрито
     {ok:true, count:null}      — броят не се чете (прокси, стар отговор) →
                                  третира се като успех, не се измисля нула

   Пускане:  node tests/delete-three-states.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

/* Отговор на DELETE с истински headers.get — харнесът не дава headers, а
   точно от тях идва броят. */
function delRes(opt) {
  const hdrs = {};
  if (opt.range !== undefined) hdrs['content-range'] = opt.range;
  return {
    ok: opt.status ? opt.status < 400 : true,
    status: opt.status || 204,
    headers: { get: n => hdrs[String(n).toLowerCase()] || null },
    json: () => opt.body ? Promise.resolve(opt.body)
                         : Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    text: () => Promise.resolve(opt.body ? JSON.stringify(opt.body) : '')
  };
}

/* Подменя САМО DELETE; всичко останало минава през харнеса. */
function stubDelete(h, opt) {
  const orig = h.w.fetch;
  h.deletes = [];
  h.w.fetch = function (url, init) {
    init = init || {};
    if ((init.method || 'GET').toUpperCase() === 'DELETE') {
      h.deletes.push({ url: String(url), prefer: (init.headers || {})['Prefer'] });
      return Promise.resolve(delRes(opt));
    }
    return orig(url, init);
  };
}

function env(modules, data) {
  const h = boot({ modules: modules, user: ADMIN, data: data || {}, confirm: true });
  h.logged = [];
  h.w.console.error = function () { h.logged.push(Array.prototype.join.call(arguments, ' ')); };
  return h;
}

const USERS = [{ id: 'u-1', email: 'ivan@temax.bg', display_name: 'Иван',
                 store_name: 'Раднево', role: 'user', active: true, assigned_stores: [] }];

function auditPosts(h) {
  return h.calls.post.filter(p => String(p.url).indexOf('audit_log') >= 0);
}

(async function () {

  section('1. sbDelete праща Prefer: count=exact');
  {
    const h = env([]);
    stubDelete(h, { status: 204, range: '*/1' });
    await h.w.sbDelete('stores', 'id=eq.1');
    if (ok('DELETE е изпратен', h.deletes.length === 1)) {
      ok('хедърът Prefer е count=exact', h.deletes[0].prefer === 'count=exact', h.deletes[0].prefer);
    }
  }

  section('2. Трите състояния на връщаната стойност');
  {
    const h = env([]);
    stubDelete(h, { status: 204, range: '*/3' });
    const okRes = await h.w.sbDelete('stores', 'id=eq.1');
    ok('изтрито → ok:true, count:3', okRes.ok === true && okRes.count === 3, JSON.stringify(okRes));

    stubDelete(h, { status: 204, range: '*/0' });
    const zero = await h.w.sbDelete('stores', 'id=eq.1');
    ok('нищо не съвпадна → ok:true, count:0', zero.ok === true && zero.count === 0, JSON.stringify(zero));

    stubDelete(h, { status: 403, body: { message: 'permission denied for table stores' } });
    const bad = await h.w.sbDelete('stores', 'id=eq.1');
    ok('отказано → ok:false', bad.ok === false);
    ok('носи статуса', bad.status === 403, bad.status);
    ok('носи причината', /permission denied/.test(bad.error.message), JSON.stringify(bad.error));

    stubDelete(h, { status: 204 });   /* без Content-Range */
    const unknown = await h.w.sbDelete('stores', 'id=eq.1');
    ok('липсващ хедър → count:null, не 0', unknown.ok === true && unknown.count === null,
       JSON.stringify(unknown));
  }

  section('3. sbErrMsg');
  {
    const h = env([]);
    /* Без този гард липсващият sbErrMsg убива процеса и секции 4-9 не се
       пускат — тогава тестът мълчи точно за нещата, които пази. */
    if (ok('sbErrMsg съществува', typeof h.w.sbErrMsg === 'function')) {
      ok('взима message', h.w.sbErrMsg({ error: { message: 'боом' } }) === 'боом');
      ok('пада към hint', h.w.sbErrMsg({ error: { hint: 'опитай друго' } }) === 'опитай друго');
      ok('пада към статуса', h.w.sbErrMsg({ status: 409 }) === 'HTTP 409');
      ok('не гърми на празно', typeof h.w.sbErrMsg({}) === 'string');
    }
  }

  section('4. deleteUser — успех: одитът се пише, зелен toast');
  {
    const h = env(['admin.js'], { users: USERS, stores: [] });
    stubDelete(h, { status: 204, range: '*/1' });
    h.w.loadUsersAdmin();
    await ticks();
    if (guard('клик по ✕', () => realClick(h.w, btn(h.doc.body, '✕')))) {
      await ticks();
      ok('показано е "изтрит"', h.calls.toast.some(t => t.indexOf('Потребителят е изтрит') >= 0),
         h.calls.toast.join(' | '));
      ok('одитът Е записан', auditPosts(h).length === 1, JSON.stringify(auditPosts(h).map(p => p.body.event)));
    }
  }

  section('5. deleteUser — отказано: червен toast, БЕЗ одит');
  {
    const h = env(['admin.js'], { users: USERS, stores: [] });
    stubDelete(h, { status: 403, body: { message: 'permission denied for table users' } });
    h.w.loadUsersAdmin();
    await ticks();
    realClick(h.w, btn(h.doc.body, '✕'));
    await ticks();
    ok('казва "НЕ беше изтрит"', h.calls.toast.some(t => t.indexOf('НЕ беше изтрит') >= 0),
       h.calls.toast.join(' | '));
    ok('показва причината', h.calls.toast.some(t => t.indexOf('permission denied') >= 0),
       h.calls.toast.join(' | '));
    ok('НЕ казва "изтрит" зелено', !h.calls.toast.some(t => t.indexOf('✓ Потребителят') >= 0));
    ok('одитът НЕ е записан', auditPosts(h).length === 0,
       JSON.stringify(auditPosts(h).map(p => p.body.event)));
    ok('причината е и в конзолата', h.logged.some(l => l.indexOf('deleteUser') >= 0), h.logged.join(' | '));
  }

  section('6. deleteUser — нула съвпаднали: неутрално, БЕЗ одит, БЕЗ червено');
  {
    const h = env(['admin.js'], { users: USERS, stores: [] });
    stubDelete(h, { status: 204, range: '*/0' });
    h.w.loadUsersAdmin();
    await ticks();
    realClick(h.w, btn(h.doc.body, '✕'));
    await ticks();
    ok('казва "нямаше какво"', h.calls.toast.some(t => t.indexOf('Нямаше какво') >= 0),
       h.calls.toast.join(' | '));
    ok('НЕ е "НЕ беше изтрит"', !h.calls.toast.some(t => t.indexOf('НЕ беше изтрит') >= 0));
    ok('НЕ е зелено "изтрит"', !h.calls.toast.some(t => t.indexOf('✓ Потребителят') >= 0));
    ok('одитът НЕ е записан', auditPosts(h).length === 0);
  }

  section('7. deleteStore — същите три състояния, одитът следва успеха');
  {
    const STORES = [{ id: 's-1', name: 'Раднево' }];
    const okH = env(['admin.js'], { stores: STORES, users: [] });
    stubDelete(okH, { status: 204, range: '*/1' });
    okH.w.loadStoresAdmin(); await ticks();
    realClick(okH.w, btn(okH.doc.body, 'Изтрий')); await ticks();
    ok('успех → одит', auditPosts(okH).length === 1);

    const failH = env(['admin.js'], { stores: STORES, users: [] });
    stubDelete(failH, { status: 409, body: { message: 'violates foreign key constraint' } });
    failH.w.loadStoresAdmin(); await ticks();
    realClick(failH.w, btn(failH.doc.body, 'Изтрий')); await ticks();
    ok('отказ → без одит', auditPosts(failH).length === 0);
    ok('отказ → показва FK причината',
       failH.calls.toast.some(t => t.indexOf('foreign key') >= 0), failH.calls.toast.join(' | '));

    const zeroH = env(['admin.js'], { stores: STORES, users: [] });
    stubDelete(zeroH, { status: 204, range: '*/0' });
    zeroH.w.loadStoresAdmin(); await ticks();
    realClick(zeroH.w, btn(zeroH.doc.body, 'Изтрий')); await ticks();
    ok('нула → без одит', auditPosts(zeroH).length === 0);
  }

  section('8. Оптимистичното локално почистване става само при успех');
  {
    /* store идва от currentUser.store_name (toggleTask), не от аргумент — затова
       записът трябва да е за същия обект, иначе локалният филтър не съвпада. */
    const COMP = { task_id: 't-1', store_name: ADMIN.store_name, completion_date: null };
    /* toggleTask(taskId, checked=false) минава по клона с sbDelete. */
    const failH = env(['bulletin.js'], {});
    failH.w.bulComps = [Object.assign({}, COMP)];
    stubDelete(failH, { status: 403, body: { message: 'denied' } });
    if (guard('toggleTask при отказ не хвърля',
              () => failH.w.toggleTask('t-1', false, null, null))) {
      await ticks();
      ok('bulComps НЕ е изчистен при отказ', failH.w.bulComps.length === 1,
         JSON.stringify(failH.w.bulComps));
      ok('казва, че отмяната не е минала',
         failH.calls.toast.some(t => t.indexOf('НЕ мина') >= 0), failH.calls.toast.join(' | '));
    }

    const okH = env(['bulletin.js'], {});
    okH.w.bulComps = [Object.assign({}, COMP)];
    stubDelete(okH, { status: 204, range: '*/1' });
    if (guard('toggleTask при успех не хвърля',
              () => okH.w.toggleTask('t-1', false, null, null))) {
      await ticks();
      ok('bulComps Е изчистен при успех', okH.w.bulComps.length === 0,
         JSON.stringify(okH.w.bulComps));
      ok('казва "неизпълнена"',
         okH.calls.toast.some(t => t.indexOf('неизпълнена') >= 0), okH.calls.toast.join(' | '));
    }

    const zeroH = env(['bulletin.js'], {});
    zeroH.w.bulComps = [Object.assign({}, COMP)];
    stubDelete(zeroH, { status: 204, range: '*/0' });
    zeroH.w.toggleTask('t-1', false, null, null);
    await ticks();
    ok('при нула съвпаднали НЕ се чисти локално', zeroH.w.bulComps.length === 1,
       JSON.stringify(zeroH.w.bulComps));
  }

  section('9. Липсващ Content-Range не ражда фалшиво "нищо не съвпадна"');
  {
    const h = env(['admin.js'], { users: USERS, stores: [] });
    stubDelete(h, { status: 204 });   /* прокси е отрязало хедъра */
    h.w.loadUsersAdmin(); await ticks();
    realClick(h.w, btn(h.doc.body, '✕')); await ticks();
    ok('третира се като успех', h.calls.toast.some(t => t.indexOf('Потребителят е изтрит') >= 0),
       h.calls.toast.join(' | '));
    ok('одитът е записан', auditPosts(h).length === 1);
  }

  report();
})();
