/* СЕДМИЧЕН ОТЧЕТ / „Днес": stock_returns и двете заявки към kasa_storno на
   страници (лимит 1000, стъпка 3).

   stock_returns се чете без филтър (527 на 11.10.2026, расте ~100/месец);
   kasa_storno по created_at и по storno_date в седмицата стига 642 в
   най-натоварената. PostgREST реже на 1000 без грешка — затова и трите
   минават през reportGetAll с order=id.asc, а прекъснато четене дава
   червен ред „Непълни данни“ в съответната секция („За връщане“ / „Сторно“).

   Стъбът пази тавана: най-много 1000 реда на заявка, уважава limit/offset.
   Двете kasa_storno заявки се различават по филтъра (created_at / storno_date)
   и имат различни ключове в cross.partial: 'kasa_storno' и 'kasa_storno_week'.

   Мутационна проверка (12.10.2026), всеки мутант пуснат срещу този тест:
     - stock_returns обратно на sbGet в report.js                — СЪБОРЕН (6 ❌)
     - махнат ['kasa_storno', r[2]] от списъка partial           — СЪБОРЕН (3 ❌)
     - махнат reportPartialHtml(…'kasa_storno'…) от секцията     — СЪБОРЕН (2 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/report-cross-get-all.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Враца', 'Габрово', 'Троян'].map(s => ({ store_name: s }));

function dayShift(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function stampShift(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); }

const N_RET_OPEN = 600, N_RET_DONE = 401;   /* 1001 общо */
const N_STORNO = 1001;
const WIN = { from: dayShift(-6), to: dayShift(0) };

const RETURNS = [];
for (let i = 0; i < N_RET_OPEN + N_RET_DONE; i++) {
  RETURNS.push({ id: 'sr-' + String(i).padStart(5, '0'), store_name: 'Троян', supplier: 'ТЕСИ',
                 status: i < N_RET_OPEN ? 'pending' : 'completed', created_at: stampShift(-3) });
}
/* Всяко сторно е с по-малка нова сума — попада и в „Сторна с по-малка нова сума". */
const STORNO = [];
for (let i = 0; i < N_STORNO; i++) {
  STORNO.push({ id: 'ks-' + String(i).padStart(5, '0'), store_name: 'Враца', status: 'draft',
                storno_date: dayShift(-2), created_at: stampShift(-2),
                returned_sum: 10, new_sum: 4, reason: 'ГРЕШНА ПОКУПКА', store_comment: '' });
}

function capped(all, seen) {
  return function (url) {
    seen.push(url);
    const u = decodeURIComponent(String(url));
    const off = +((u.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const lim = +((u.match(/[?&]limit=(\d+)/) || [])[1] || 1000);
    return all.slice(off, off + Math.min(lim, 1000));
  };
}

/* failOn: { 'created_at' | 'storno_date' | 'stock_returns': offset } */
function env(failOn) {
  failOn = failOn || {};
  const seen = { stock_returns: [], kasa_storno: [] };
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    fail: { GET: function (url) {
      const u = decodeURIComponent(String(url));
      const off = +((u.match(/[?&]offset=(\d+)/) || [])[1] || -1);
      if (u.indexOf('/stock_returns?') >= 0 && failOn.stock_returns === off) return true;
      if (u.indexOf('/kasa_storno?') >= 0 && u.indexOf('created_at=gte') >= 0 && failOn.created_at === off) return true;
      if (u.indexOf('/kasa_storno?') >= 0 && u.indexOf('storno_date=gte') >= 0 && failOn.storno_date === off) return true;
      return null;
    } },
    data: {
      users: STORES,
      stock_returns: capped(RETURNS, seen.stock_returns),
      kasa_storno: capped(STORNO, seen.kasa_storno),
      differences_reports: [], stock_differences: [], goods_transit: [],
      client_orders: [], transport_orders: [], kasa_zoborot: [], transport_pallets: [], app_settings: []
    }
  });
  h.seen = seen;
  return h;
}
const collect = (h, win) => new Promise(res => h.w.collectCrossModuleWeeklySummary(res, win, null));

(async function () {

  section('1. Пълно четене над 1000 — всички редове са преброени');
  {
    const h = env();
    const c = await collect(h, WIN);
    ok('За връщане — отворени ' + N_RET_OPEN, c.returns.open === N_RET_OPEN, 'реално: ' + c.returns.open);
    ok('За връщане — приключени ' + N_RET_DONE + ' (не ' + (1000 - N_RET_OPEN) + ')', c.returns.completed === N_RET_DONE, 'реално: ' + c.returns.completed);
    ok('Сторно (created_at) — въведени ' + N_STORNO, c.storno.total === N_STORNO, 'реално: ' + c.storno.total);
    ok('Сторна с по-малка нова сума (storno_date) — ' + N_STORNO, c.stornoShort && c.stornoShort.total === N_STORNO,
       'реално: ' + (c.stornoShort && c.stornoShort.total));
    const rr = c.rowsRead || {};
    ok('rowsRead: stock_returns 1001, kasa_storno 1001, kasa_storno_week 1001',
       rr.stock_returns === 1001 && rr.kasa_storno === 1001 && rr.kasa_storno_week === 1001, JSON.stringify(rr));
    ok('няма partial', Array.isArray(c.partial) && c.partial.length === 0, JSON.stringify(c.partial));

    const sr = h.seen.stock_returns, ks = h.seen.kasa_storno;
    ok('stock_returns: две страници, order=id.asc, limit=1000',
       sr.length === 2 && sr.every(u => /order=id\.asc/.test(u) && /limit=1000/.test(u)) && /offset=1000/.test(sr[1]), sr.join(' | '));
    const ksC = ks.filter(u => decodeURIComponent(u).indexOf('created_at=gte') >= 0);
    const ksW = ks.filter(u => decodeURIComponent(u).indexOf('storno_date=gte') >= 0);
    ok('kasa_storno (created_at): две страници с order=id.asc', ksC.length === 2 && ksC.every(u => /order=id\.asc/.test(u)), ksC.join(' | '));
    ok('kasa_storno (storno_date): две страници с order=id.asc', ksW.length === 2 && ksW.every(u => /order=id\.asc/.test(u)), ksW.join(' | '));

    const html = h.w.buildCrossModuleSectionHtml(c, false);
    ok('без червен ред „Непълни данни“', html.indexOf('Непълни данни') < 0);
    h.close();
  }

  section('2. Провалена страница → червен ред с името на таблицата');
  {
    for (const [key, fail, tableName] of [
      ['stock_returns', { stock_returns: 1000 }, 'stock_returns'],
      ['created_at', { created_at: 1000 }, 'kasa_storno'],
      ['storno_date', { storno_date: 1000 }, 'kasa_storno_week']
    ]) {
      const h = env(fail);
      const c = await collect(h, WIN);
      const p = (c.partial || []).filter(x => x.table === tableName)[0];
      ok(key + ' пада на offset 1000 → partial {table:' + tableName + ', rows:1000}',
         !!p && p.rows === 1000, JSON.stringify(c.partial));
      const html = h.w.buildCrossModuleSectionHtml(c, false);
      ok(key + ' → червен ред „Непълни данни … (' + tableName + ')“ в секцията',
         html.indexOf('⚠️ Непълни данни — прочетени 1000 реда, четенето прекъсна (' + tableName + ')') >= 0);
      h.close();
    }

    /* Редът стои в СВОЯТА секция: за stock_returns — между „За връщане“ и „Сторно“. */
    const h = env({ stock_returns: 1000 });
    const c = await collect(h, WIN);
    const html = h.w.buildCrossModuleSectionHtml(c, false);
    const iRet = html.indexOf('За връщане'), iRed = html.indexOf('(stock_returns)'), iSt = html.indexOf('Каса — Сторно бележки');
    ok('червеният ред за stock_returns е под „За връщане“ и над „Сторно“', iRet >= 0 && iRet < iRed && iRed < iSt,
       [iRet, iRed, iSt].join(' / '));
    h.close();
  }

  section('3. Едж копието: същите три заявки през reportGetAll');
  {
    const ts = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    ok('stock_returns през reportGetAll с order=id.asc',
       ts.indexOf("reportGetAll('stock_returns','select=store_name,status,supplier,created_at&order=id.asc')") >= 0);
    ok('kasa_storno (created_at) през reportGetAll с order=id.asc',
       ts.indexOf("reportGetAll('kasa_storno','created_at=gte.'+W.fromStamp+upStamp+'&select=store_name,status&order=id.asc')") >= 0);
    ok('kasa_storno (storno_date) през reportGetAll с order=id.asc',
       /reportGetAll\('kasa_storno','storno_date=gte\.'\+W\.fromISO[^)]*&order=id\.asc'\)/.test(ts));
    ok('ключовете в partial: stock_returns, kasa_storno, kasa_storno_week',
       ts.indexOf("['stock_returns', r[1]], ['kasa_storno', r[2]], ['kasa_storno_week', r[11]]") >= 0);
    ok('без голи sbGet към stock_returns/kasa_storno в колектора',
       !/sbGet\('(stock_returns|kasa_storno)'/.test(ts));
  }

  report();
})();
