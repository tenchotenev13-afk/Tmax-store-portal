/* Банерът при вход (notifications.js, showLoginBanner) — брой на сторно
   бележките с по-малка сума на новата покупка.

   На живо 12.11.2026: банерът казваше „52“, История — „47“ за същите 30 дни.
   Банерът сравняваше сам new_sum < returned_sum и не изключваше капаро/ваучер
   (900001/900009); История ползва stornoIndicator() от kasa.js. Сега банерът
   ползва същия stornoIndicator — второ правило няма.

   Покрива:
     1. 2 по-малки, 1 равна, 1 по-голяма, 1 капаро (900001) с по-малка сума,
        1 ваучер (900009 в „x / 900009“) с по-малка сума → „2 сторно бележки“;
        обектите в картата са само тези на двете маркирани; select-ът носи
        articles.
     2. Само капаро/ваучер с по-малка сума → картата я няма.

   Мутационна проверка (12.11.2026):
     - върнато старото сравнение (new_sum < returned_sum)  — СЪБОРЕН (3 ❌)
     - articles махнато от select-а (мокът реже до select) — СЪБОРЕН (4 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/storno-banner-count.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = {
  email: 'acc@temax.bg', display_name: 'Счетоводство',
  role: 'accounting', store_name: 'Централен офис'
};

const mk = (id, store, ret, nw, articles) => ({
  id: id, store_name: store, storno_date: '2026-11-10', original_receipt_date: '2026-11-09',
  articles: articles, returned_sum: ret, new_sum: nw, reason: 'Замяна', status: 'draft',
  kasa_storno_items: []
});

const SIX = [
  mk('s1', 'Шумен',   100, 80,  '123456'),           /* по-малка */
  mk('s2', 'Карлово', 50.5, 50.49, '234567'),        /* по-малка с 1 цент */
  mk('s3', 'Троян',   70, 70,   '345678'),           /* равна */
  mk('s4', 'Троян',   30, 45,   '456789'),           /* по-голяма */
  mk('s5', 'Добрич',  200, 0,   '900001'),           /* капаро с по-малка — НЕ */
  mk('s6', 'Враца',   90, 10,   '567890 / 900009')   /* ваучер в списък — НЕ */
];

/* Мокът връща САМО колоните от select= — иначе тест без articles в заявката
   би минал, защото фикстурата ги носи. */
function selectOnly(rows) {
  var st = { urls: [] };
  st.fn = function (url) {
    st.urls.push(url);
    var m = /[?&]select=([^&]*)/.exec(decodeURIComponent(url));
    var cols = m ? m[1].split(',') : null;
    var u = decodeURIComponent(url);
    var off = /[?&]offset=(\d+)/.exec(u), lim = /[?&]limit=(\d+)/.exec(u);
    var offset = off ? +off[1] : 0, limit = Math.min(lim ? +lim[1] : 1000, 1000);
    return rows.slice(offset, offset + limit).map(function (r) {
      if (!cols) return r;
      var o = {}; cols.forEach(function (c) { if (c in r) o[c] = r[c]; }); return o;
    });
  };
  return st;
}

function env(rows) {
  var p = selectOnly(rows);
  var h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'notifications.js'],
    user: ADMIN,
    data: {
      kasa_storno: p.fn, kasa_storno_items: [],
      kasa_reports: [], kasa_zoborot: [], kasa_glavna: [], kasa_documents: [],
      transport_orders: [], client_orders: [], stores: [], loading_lists: []
    }
  });
  h.p = p;
  h.w.transportOrders = []; h.w.clientOrders = [];
  return h;
}
const bannerText = h => h.doc.getElementById('notif-banner').textContent;

(async function () {

  section('1. 2 по-малки + равна + по-голяма + капаро + ваучер → „2“');
  {
    var h = env(SIX);
    guard('showLoginBanner() не хвърля', function () { h.w.showLoginBanner(); });
    await ticks();
    var g = h.p.urls.filter(function (u) { return u.indexOf('/kasa_storno?') >= 0; });
    ok('заявката към kasa_storno носи articles в select', g.length && /select=[^&]*articles/.test(decodeURIComponent(g[0])), g[0]);
    var ban = bannerText(h);
    ok('картата казва „2 сторно бележки с по-малка сума“', ban.indexOf('2 сторно бележки с по-малка сума на новата покупка') >= 0, ban.slice(0, 400));
    ok('обектите: Шумен (1) и Карлово (1)', ban.indexOf('Шумен (1)') >= 0 && ban.indexOf('Карлово (1)') >= 0, ban.slice(0, 400));
    ok('капарото (Добрич) и ваучерът (Враца) не са в картата', ban.indexOf('Добрич') < 0 && ban.indexOf('Враца') < 0, ban.slice(0, 400));
    ok('равната / по-голямата (Троян) не са в картата', ban.indexOf('Троян') < 0);
    h.close();
  }

  section('2. Само капаро/ваучер с по-малка сума → без карта');
  {
    var h = env([SIX[4], SIX[5], SIX[2]]);
    h.w.showLoginBanner();
    await ticks();
    var ban = bannerText(h);
    ok('картата „с по-малка сума“ я няма', ban.indexOf('с по-малка сума на новата покупка') < 0, ban.slice(0, 400));
    ok('без „непълни данни“', ban.indexOf('Сторно бележки: непълни данни') < 0);
    h.close();
  }

  report();
})();
