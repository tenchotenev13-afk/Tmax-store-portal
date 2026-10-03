/* Клиентски: SAP банерът е СГЪНАТ по подразбиране (заглавието с MIGO 951/952
   остава видимо) и помни състоянието си в localStorage
   ('temax_co_sap_banner_open': '1' / '0'). Липсва или localStorage гърми →
   сгънат. showSapReminder() (модалът след нова заявка) не е пипан.

   „Нов boot със същия localStorage" = презареждане на client-orders.js в
   същия прозорец след като ключът е записан (jsdom boot() е нов прозорец).

   Пускане: node tests/co-sap-banner-state.test.js . */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report } = H;

const KEY = 'temax_co_sap_banner_open';
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'client-orders.js'), 'utf8');
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function env() {
  return boot({ modules: ['transport.js', 'client-orders.js'], user: ADMIN, data: { client_orders: [], transport_orders: [], stores: [] } });
}
const bannerEl = h => h.doc.getElementById('co-sap-banner');
const txt = h => bannerEl(h).textContent;
const hasOpenBtn = h => Array.from(bannerEl(h).querySelectorAll('button')).some(b => b.textContent.indexOf('Отвори в Наръчника') >= 0);
const click = h => realClick(h.w, bannerEl(h).querySelector('[onclick]'));
/* „Презареждане": модулът се чете наново с вече записания localStorage. */
const reload = h => { h.w.eval(src); h.w.renderCoSapBanner(); };

(async function run() {
  section('1. без запис → сгънат');
  {
    const h = env();
    guard('renderCoSapBanner()', () => h.w.renderCoSapBanner());
    ok('няма запис в localStorage', h.w.localStorage.getItem(KEY) === null);
    ok('„▼ покажи"', txt(h).indexOf('▼ покажи') >= 0);
    ok('няма бутон „Отвори в Наръчника"', !hasOpenBtn(h));
    ok('заглавието с MIGO 951/952 е видимо', /MIGO 951\/952/.test(txt(h)));
  }

  section('2. клик → отворен и „1"; презареждане → отворен; клик → сгънат и „0"');
  {
    const h = env();
    h.w.renderCoSapBanner();
    click(h);
    ok('разгънат', txt(h).indexOf('▲ скрий') >= 0 && hasOpenBtn(h));
    ok('localStorage = "1"', h.w.localStorage.getItem(KEY) === '1', h.w.localStorage.getItem(KEY));
    guard('презареждане', () => reload(h));
    ok('след презареждане е отворен', hasOpenBtn(h) && txt(h).indexOf('▲ скрий') >= 0);
    click(h);
    ok('сгънат', txt(h).indexOf('▼ покажи') >= 0 && !hasOpenBtn(h));
    ok('localStorage = "0"', h.w.localStorage.getItem(KEY) === '0', h.w.localStorage.getItem(KEY));
    guard('презареждане', () => reload(h));
    ok('след презареждане е сгънат', !hasOpenBtn(h));
  }

  section('3. localStorage хвърля грешка → сгънат, кликът работи');
  {
    const h = env();
    const P = h.w.Storage.prototype;
    P.getItem = function () { throw new Error('blocked'); };
    P.setItem = function () { throw new Error('blocked'); };
    guard('презареждане при блокиран localStorage', () => reload(h));
    ok('сгънат', txt(h).indexOf('▼ покажи') >= 0 && !hasOpenBtn(h));
    guard('клик', () => click(h));
    ok('кликът разгъва без грешка', hasOpenBtn(h));
    guard('втори клик', () => click(h));
    ok('и пак сгъва', !hasOpenBtn(h));
  }

  section('4. showSapReminder() работи както досега');
  {
    const h = env();
    h.w.showSapReminder('0042');
    const ov = h.doc.getElementById('sap-ov');
    ok('модалът е там с номера', !!ov && ov.textContent.indexOf('0042') >= 0);
    ok('и с текста за MIGO 951', !!ov && ov.textContent.indexOf('951') >= 0);
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
