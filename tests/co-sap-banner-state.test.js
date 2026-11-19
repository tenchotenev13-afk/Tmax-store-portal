/* Клиентски: SAP банерът е СГЪНАТ по подразбиране (заглавието „След всяка
   клиентска поръчка се пуска заявка в SAP“ остава видимо) и помни състоянието си в localStorage
   ('temax_co_sap_banner_open': '1' / '0'). Липсва или localStorage гърми →
   сгънат. showSapReminder() (модалът след нова заявка) не е пипан.

   „Нов boot със същия localStorage" = презареждане на client-orders.js в
   същия прозорец след като ключът е записан (jsdom boot() е нов прозорец).

   От 19.11.2026 (co-sap-955, Миглена): записът от Наръчника е ЕДИН —
   'proc-kl-poruchki' с 955/956; 'kl-poruchki' („MIGO 951/952“) е махнат.
   Секция 5 зарежда и handbook.js — банерът показва истинския запис, а
   Наръчникът → Клиентски — същия.

   Мутационна проверка (19.11.2026) — върху чистите файлове:
     C1 старият запис остава (sapClientEntries пак иска 'kl-poruchki' и той е в HB_SAP);
     C2 стъпка 4 с 952;
     C3 старото предупреждение („Артикули с 951 НЕ се ревизират!…“).

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
    ok('заглавието „След всяка клиентска поръчка се пуска заявка в SAP“ е видимо, без 951/952', txt(h).indexOf('След всяка клиентска поръчка се пуска заявка в SAP') >= 0 && !/951|952/.test(txt(h)), txt(h));
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
    /* Без handbook.js записите липсват → резервният текст (още с 951 — точка
       claude/open/19-11-co-sap-955-ostatatsi.md, не е пипан). */
    ok('и с резервния текст (без Наръчника)', !!ov && ov.textContent.indexOf('Наръчник') >= 0);
  }

  section('5. С истинския Наръчник: един запис „КЛ.ПОРЪЧКИ“ с 955/956');
  {
    const h = boot({ modules: ['transport.js', 'client-orders.js', 'handbook.js'], user: ADMIN, data: { client_orders: [], transport_orders: [], stores: [] } });
    h.w.localStorage.setItem(KEY, '1');
    guard('презареждане (отворен)', () => reload(h));
    const ents = h.w.sapClientEntries();
    ok('точно един запис — proc-kl-poruchki / „КЛ.ПОРЪЧКИ“', ents.length === 1 && ents[0].id === 'proc-kl-poruchki' && ents[0].code === 'КЛ.ПОРЪЧКИ', JSON.stringify(ents.map(e => e.id)));
    const pool = h.w.HB_SAP.concat(h.w.HB_PROC);
    ok('„MIGO 951/952“ го няма в Наръчника', !pool.some(e => e.id === 'kl-poruchki' || e.code === 'MIGO 951/952'));
    const STEPS = [
      ['Попълни бланката', 'По образец. Маркирай на каса: неналичен → арт.94549 | с капаро → арт.900001'],
      ['Генерирай заявка', '<b>ZSTOCK</b> за заявка към доставчик | <b>ZSTR тип 1</b> за трансфер от магазин'],
      ['SAP осчетоводява недостига', 'SAP осчетоводява автоматично с 955 недостига на количеството.'],
      ['При доставка — изпиши', 'MIGO → A07 → R10 → движение <b>956</b> → същия артикул → текст: номер и дата'],
      ['Провери в MB51', 'Движения 955+956 → количествата трябва да са равни, сума = 0']];
    ok('5 стъпки в реда от задачата', JSON.stringify(ents[0].steps.map(s => [s.t, s.d])) === JSON.stringify(STEPS), JSON.stringify(ents[0].steps.map(s => s.t)));
    ok('описанието и предупреждението — новите', ents[0].desc === 'Неналичен артикул — SAP осчетоводява недостига автоматично с 955, изписваш с 956 при доставка.' && ents[0].warn === 'Артикули с 955 по клиентски поръчки не се ревизират.');
    ok('таговете: 955, 956, без 951 / 952', ents[0].tags.indexOf('955') >= 0 && ents[0].tags.indexOf('956') >= 0 && ents[0].tags.indexOf('951') < 0 && ents[0].tags.indexOf('952') < 0, JSON.stringify(ents[0].tags));
    const b = txt(h);
    ok('банерът отворен: „КЛ.ПОРЪЧКИ — Клиентски поръчки“ веднъж, 955 и 956 ги има, 951 / 952 ги няма', (b.match(/КЛ\.ПОРЪЧКИ — Клиентски поръчки/g) || []).length === 1 && /955/.test(b) && /956/.test(b) && !/951|952/.test(b), b.slice(0, 300));
    ok('банерът: 5 номерирани стъпки и новото предупреждение', bannerEl(h).querySelectorAll('div[style*="border-radius:50%"]').length === 5 && b.indexOf('⚠ Артикули с 955 по клиентски поръчки не се ревизират.') >= 0);
    guard('„📖 Отвори в Наръчника“', () => realClick(h.w, Array.from(bannerEl(h).querySelectorAll('button')).filter(x => /Отвори в Наръчника/.test(x.textContent))[0]));
    const hb = h.doc.getElementById('mod-handbook');
    const cards = hb ? Array.from(hb.querySelectorAll('.hb-card')).map(c => c.id) : [];
    ok('Наръчник → Клиентски: само картата hbc-proc-kl-poruchki, отворена', JSON.stringify(cards) === JSON.stringify(['hbc-proc-kl-poruchki']) && hb.querySelector('#hbc-proc-kl-poruchki').classList.contains('open'), JSON.stringify(cards));
    const card = hb && hb.querySelector('#hbc-proc-kl-poruchki');
    ok('… със същите 5 стъпки и предупреждение, без 951 / 952', !!card && card.querySelectorAll('.hb-step').length === 5 && /Артикули с 955 по клиентски поръчки не се ревизират/.test(card.querySelector('.hb-warn').textContent) && !/951|952/.test(card.textContent));
    h.close();
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
