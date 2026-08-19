/* sbPatch и sbDelete носят грешката и никога не отхвърлят.

   И двете връщаха {ok:r.ok} и изхвърляха тялото на отговора. Затова
   извикващият можеше да покаже само думата "Грешка" - причината от PostgREST
   ("invalid input syntax for type date") не стигаше доникъде, а в конзолата
   нямаше ред. Отделно и двете отхвърляха при мрежов срив, а 11 от 14 записа
   в stock-differences.js нямат .catch - тоест офлайн кликът не правеше нищо
   и не казваше нищо.

   Образец: sbPost (носи .error) и обвивките в email.js:28 / push.js:50
   (винаги резолвват).

   Пускане:  node tests/shared-write-errors.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const USER = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin',
               store_name: 'Централен офис', assigned_stores: ['Раднево'] };

/* Реалното тяло, което PostgREST върна при бъга с тирето (commit 618ad3d). */
const PG_ERROR = {
  code: '22P02',
  message: 'invalid input syntax for type date: "—"',
  hint: null
};

function env(fail) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: USER,
    data: { stock_differences: [], differences_reports: [], stock_returns: [] },
    fail: fail || {}
  });
  /* Прихващаме console.error, за да проверим реда, а не само че не гърми. */
  h.logged = [];
  h.w.console.error = function () {
    h.logged.push(Array.prototype.join.call(arguments, ' '));
  };
  return h;
}

/* Мрежов срив: fetch отхвърля, преди изобщо да има отговор. Не се симулира
   през fail - подменя се самият fetch (както казва SKILL.md). */
function offline(w) {
  w.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
}

(async function () {

  section('1. sbPatch при HTTP грешка с тяло');
  {
    const h = env({ PATCH: { status: 400, body: PG_ERROR } });
    const res = await h.w.sbPatch('stock_differences', 'id=eq.1', { confirmed_date: '—' });
    ok('резолвва, не отхвърля', !!res);
    ok('ok е false', res.ok === false);
    ok('носи статуса', res.status === 400, res.status);
    ok('res.error носи съобщението от PostgREST',
       res.error && res.error.message === PG_ERROR.message, JSON.stringify(res.error));
    ok('res.error носи и кода', res.error && res.error.code === '22P02');
    ok('console.error съдържа URL-а', h.logged.some(l => l.indexOf('stock_differences') >= 0), h.logged[0]);
    ok('console.error съдържа статуса', h.logged.some(l => l.indexOf('400') >= 0), h.logged[0]);
    ok('console.error съдържа причината',
       h.logged.some(l => l.indexOf('invalid input syntax') >= 0), h.logged[0]);
    ok('редът започва с името на функцията', h.logged.some(l => l.indexOf('sbPatch ') === 0), h.logged[0]);
  }

  section('2. sbDelete при HTTP грешка с тяло');
  {
    const h = env({ DELETE: { status: 409, body: { message: 'update or delete violates foreign key' } } });
    const res = await h.w.sbDelete('stock_differences', 'id=eq.1');
    ok('ok е false', res.ok === false);
    ok('носи статуса', res.status === 409, res.status);
    ok('res.error носи съобщението',
       res.error && res.error.message.indexOf('foreign key') >= 0, JSON.stringify(res.error));
    ok('console.error е извикан', h.logged.some(l => l.indexOf('sbDelete ') === 0), h.logged[0]);
  }

  section('3. Празно тяло (401 без apikey) не хвърля');
  {
    const h = env({ PATCH: { status: 401 } });   /* без body = празно тяло */
    let threw = null;
    const res = await h.w.sbPatch('stock_differences', 'id=eq.1', { status: 'taken' })
      .catch(e => { threw = e; return null; });
    ok('не отхвърля', threw === null, threw && String(threw));
    ok('ok е false', res && res.ok === false);
    ok('има резервно съобщение', res && res.error && /HTTP 401/.test(res.error.message),
       res && JSON.stringify(res.error));
  }

  section('4. Мрежов срив — резолвва, не отхвърля');
  {
    const h = env();
    offline(h.w);
    let threw = null;
    const res = await h.w.sbPatch('stock_differences', 'id=eq.1', { status: 'taken' })
      .catch(e => { threw = e; return null; });
    ok('sbPatch не отхвърля', threw === null, threw && String(threw));
    ok('ok е false', res && res.ok === false);
    ok('статусът е 0 (няма отговор)', res && res.status === 0, res && res.status);
    ok('съобщението е от мрежовата грешка',
       res && res.error && /Failed to fetch/.test(res.error.message), res && JSON.stringify(res.error));
    ok('конзолата казва "мрежов срив"',
       h.logged.some(l => l.indexOf('мрежов срив') >= 0), h.logged[0]);

    const h2 = env();
    offline(h2.w);
    let threw2 = null;
    const res2 = await h2.w.sbDelete('stock_differences', 'id=eq.1').catch(e => { threw2 = e; return null; });
    ok('sbDelete не отхвърля', threw2 === null, threw2 && String(threw2));
    ok('ok е false', res2 && res2.ok === false);
  }

  section('5. Успех — нищо не се променя за извикващия');
  {
    const h = env();
    const p = await h.w.sbPatch('stock_differences', 'id=eq.1', { status: 'taken' });
    ok('sbPatch → {ok:true}', p.ok === true);
    ok('няма error при успех', p.error === undefined, JSON.stringify(p));
    const d = await h.w.sbDelete('stock_differences', 'id=eq.1');
    ok('sbDelete → {ok:true}', d.ok === true);
    ok('няма console.error при успех', h.logged.length === 0, h.logged.join(' | '));
    ok('PATCH-ът е стигнал до мрежата', h.calls.patch.length === 1);
    ok('DELETE-ът е стигнал до мрежата', h.calls.del.length === 1);
  }

  section('6. Съществуващият call site работи непроменен');
  {
    /* sdMarkTaken чете res.ok и нищо друго - не бива да се е променило. */
    const ROW = { id: 'x1', report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ',
                  material_code: '1', material_name: 'БОЙЛЕР', quantity: 1,
                  type: 'return', status: 'pending', confirmed_date: null,
                  comment: null, resolution_comment: null };
    const h = env({ PATCH: { status: 400, body: PG_ERROR } });
    h.w.sdData = [ROW];
    h.w.diffReports = [];
    h.w.sdFilter = 'all';
    h.w.renderStockDiff();
    /* Етикетът на бутона следва типа: при 'return' е "✅ Върната", не "Взета". */
    if (guard('клик по "Върната"', () => realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), 'Върната')))) {
      await ticks();
      ok('показано е съобщение за грешка',
         h.calls.toast.some(t => t.indexOf('Грешка') >= 0), h.calls.toast.join(' | '));
      ok('НЕ е показано "успешно"',
         !h.calls.toast.some(t => t.indexOf('✅') >= 0), h.calls.toast.join(' | '));
      ok('причината вече я има в конзолата',
         h.logged.some(l => l.indexOf('invalid input syntax') >= 0), h.logged.join(' | '));
    }
  }

  section('7. Офлайн call site вече не мълчи в конзолата');
  {
    const h = env();
    h.w.sdData = [];
    offline(h.w);
    let threw = null;
    await h.w.sbDelete('stock_differences', 'id=eq.1').then(function (res) {
      /* Точният шаблон на sdDelete: .then без проверка. Преди този клон
         изобщо не се изпълняваше при офлайн. */
      ok('then() се изпълнява и при срив', res && res.ok === false);
    }).catch(e => { threw = e; });
    ok('веригата без .catch не се чупи', threw === null, threw && String(threw));
  }

  section('8. sbPost — тялото се пази, добавя се конзолен ред');
  {
    const h = env({ POST: { status: 400, body: PG_ERROR } });
    const res = await h.w.sbPost('stock_differences', { quantity: 1 });
    ok('ok е false', res.ok === false);
    ok('res.error носи тялото (както преди)',
       res.error && res.error.message === PG_ERROR.message, JSON.stringify(res.error));
    ok('носи статуса', res.status === 400, res.status);
    ok('console.error е извикан', h.logged.some(l => l.indexOf('sbPost ') === 0), h.logged.join(' | '));
  }

  section('9. sbPost при мрежов срив — резолвва, не отхвърля');
  {
    const h = env();
    offline(h.w);
    let threw = null;
    const res = await h.w.sbPost('stock_differences', { quantity: 1 }).catch(e => { threw = e; return null; });
    ok('не отхвърля', threw === null, threw && String(threw));
    ok('ok е false', res && res.ok === false);
    ok('статусът е 0', res && res.status === 0, res && res.status);
    ok('съобщението е от мрежовата грешка',
       res && res.error && /Failed to fetch/.test(res.error.message), res && JSON.stringify(res.error));
    ok('конзолата казва "мрежов срив"', h.logged.some(l => l.indexOf('мрежов срив') >= 0), h.logged[0]);
  }

  section('10. sbPostReturn — успех, HTTP грешка, мрежов срив');
  {
    /* Успех: рядът се връща както преди (номерът идва от тригер в базата). */
    const h = boot({
      modules: ['client-orders.js'],
      user: USER,
      data: { client_orders: [] }
    });
    h.w.fetch = (function (orig) {
      return function (url, init) {
        if ((init || {}).method === 'POST') {
          return Promise.resolve({
            ok: true, status: 201,
            json: () => Promise.resolve([{ id: 'c1', in_num: 'РАД-0007' }]),
            text: () => Promise.resolve('[]')
          });
        }
        return orig(url, init);
      };
    })(h.w.fetch);
    const good = await h.w.sbPostReturn('client_orders', { store_name: 'Раднево' });
    ok('ok е true', good.ok === true);
    ok('връща реда', good.row && good.row.in_num === 'РАД-0007', JSON.stringify(good.row));

    const h2 = env({ POST: { status: 409, body: { message: 'duplicate key value' } } });
    const bad = await h2.w.sbPostReturn('client_orders', {});
    ok('HTTP грешка → ok false', bad.ok === false);
    ok('носи тялото', bad.error && /duplicate key/.test(bad.error.message), JSON.stringify(bad.error));
    ok('носи статуса', bad.status === 409, bad.status);
    ok('console.error е извикан', h2.logged.some(l => l.indexOf('sbPostReturn ') === 0), h2.logged.join(' | '));

    const h3 = env();
    offline(h3.w);
    let threw = null;
    const net = await h3.w.sbPostReturn('client_orders', {}).catch(e => { threw = e; return null; });
    ok('мрежов срив не отхвърля', threw === null, threw && String(threw));
    ok('ok е false', net && net.ok === false);
    ok('няма row при провал', net && net.row === undefined, JSON.stringify(net));
  }

  section('11. Празно тяло при POST (401 без apikey) не хвърля');
  {
    const h = env({ POST: { status: 401 } });
    let threw = null;
    const res = await h.w.sbPost('stock_differences', {}).catch(e => { threw = e; return null; });
    ok('не отхвърля', threw === null, threw && String(threw));
    ok('статусът е истинският 401, не 0',
       res && res.status === 401, res && res.status);
    ok('има резервно съобщение', res && res.error && /HTTP 401/.test(res.error.message),
       res && JSON.stringify(res.error));
  }

  section('12. Импортът на партиди не заяжда при срив (srBatchImport)');
  {
    /* Цикълът се движи от .then, не от .catch. Ако sbPost спре да отхвърля,
       това трябва да продължи да е вярно, иначе импортът виси мълчаливо. */
    const h = boot({ modules: ['stock-returns.js'], user: USER, data: { stock_returns: [] } });
    offline(h.w);
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push({ id: 'r' + i });
    let done = null;
    if (guard('импортът тръгва', () => h.w.srBatchImport(rows, function () {}, function (errs) { done = errs; }))) {
      await ticks();
      ok('onDone е извикан (не заяжда)', done !== null, String(done));
      ok('провалът е преброен', done > 0, String(done));
    }
  }

  report();
})();
