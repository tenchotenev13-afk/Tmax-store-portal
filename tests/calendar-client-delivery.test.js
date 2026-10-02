/* Календар: клиентските заявки са по ДАТА НА ДОСТАВКА (delivery), не по
   датата на създаване; без отказаните; до 3 на ден + „+N още клиентски заявки".
   Броячът „N записа" е общият брой. Клик на картичка → openClientOrderDetail(id),
   клик на „+N още" → showModule('client').

   Пускане: node tests/calendar-client-delivery.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, ok, guard, section, report, ticks } = H;

const USER = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function co(id, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово', status: 'pending',
    date: null, delivery: null, customer_name: 'К' + id,
    product: 'ПРОДУКТ-' + id, items: [{ product: 'ПРОДУКТ-' + id, sap: '1', qty: 1, unit: 'бр.' }]
  }, extra || {});
}

(async function run() {
  const probe = boot({ modules: ['calendar.js'], user: USER, data: {} });
  const days = probe.w.getWeekDates(0).map(d => probe.w.localDateISO(d));
  const MON = days[0], WED = days[2], THU = days[3];

  const ALL = [
    co('moved', { date: MON, delivery: THU }),
    co('nodel', { date: MON, delivery: null }),
    co('refus', { date: MON, delivery: WED, status: 'refused' })
  ].concat([1, 2, 3, 4, 5].map(n => co('w' + n, { date: MON, delivery: WED })));

  /* Мокът ПРИЛАГА това, което заявката иска — иначе „status=neq.refused" би
     било само текст в URL. */
  const h = boot({
    modules: ['calendar.js', 'client-orders.js'],
    user: USER,
    data: {
      bus_routes: [], transport_orders: [], route_templates: [],
      client_orders: url => ALL.filter(o => {
        if (/status=neq\.refused/.test(url) && o.status === 'refused') return false;
        const m = /delivery=gte\.([\d-]+)&delivery=lte\.([\d-]+)/.exec(url);
        if (m) return o.delivery && o.delivery >= m[1] && o.delivery <= m[2];
        return true;
      })
    }
  });
  const w = h.w, doc = h.doc;
  w.calWeekOffset = 0;
  const opened = [], modules = [];
  w.openClientOrderDetail = id => opened.push(id);
  w.showModule = m => modules.push(m);
  guard('loadCalendar()', () => w.loadCalendar());
  await ticks(); await ticks();

  const root = doc.getElementById('mod-calendar');
  const cols = Array.from(root.querySelectorAll('div')).filter(d => /display:flex;flex-direction:column/.test(d.getAttribute('style') || '') && /min-height:140px/.test(d.getAttribute('style') || ''));
  const col = i => cols[i];
  const cards = c => c ? Array.from(c.querySelectorAll('[data-id]')).filter(x => /openClientOrderDetail/.test(x.getAttribute('onclick') || '')) : [];
  const text = c => c ? c.textContent : '';

  section('1. заявката на запитването');
  {
    const url = h.calls.get.find(u => /client_orders/.test(u)) || '';
    ok('колоните са 7', cols.length === 7, cols.length);
    ok('по delivery (gte/lte)', /delivery=gte\.[\d-]+&delivery=lte\.[\d-]+/.test(url), url);
    ok('status=neq.refused', /status=neq\.refused/.test(url), url);
    ok('order=delivery.asc', /order=delivery\.asc/.test(url), url);
    ok('без date=gte (създаване)', !/[?&]date=gte/.test(url), url);
  }

  section('2. date=понеделник, delivery=четвъртък → в четвъртък');
  {
    ok('четвъртък: картичката „moved"', cards(col(3)).some(c => c.dataset.id === 'moved'));
    ok('понеделник: няма клиентски картички', cards(col(0)).length === 0);
  }

  section('3. без delivery и отказана → никъде');
  {
    const all = cols.reduce((a, c) => a.concat(cards(c)), []).map(c => c.dataset.id);
    ok('„nodel" не е показана', all.indexOf('nodel') < 0, all.join(','));
    ok('„refus" не е показана', all.indexOf('refus') < 0, all.join(','));
  }

  section('4. 5 заявки в един ден → 3 картички + „+2 още"; броячът е 5');
  {
    ok('точно 3 картички в сряда', cards(col(2)).length === 3, cards(col(2)).length);
    ok('„+2 още клиентски заявки"', /\+2 още клиентски заявки/.test(text(col(2))), text(col(2)));
    ok('броячът „5 записа"', /5 записа/.test(text(col(2))), text(col(2)));
    ok('четвъртък няма „още"', !/още клиентски/.test(text(col(3))));
  }

  section('5. кликове');
  {
    const card = cards(col(3))[0];
    ok('картичката има cursor:pointer', /cursor:pointer/.test(card.getAttribute('style') || ''));
    guard('клик на картичка', () => bubbleClick(w, card));
    ok('openClientOrderDetail("moved")', opened.length === 1 && opened[0] === 'moved', JSON.stringify(opened));
    const more = Array.from(col(2).querySelectorAll('div')).find(d => /още клиентски заявки/.test(d.textContent) && d.children.length === 0);
    ok('има елемент „+N още"', !!more);
    if (more) guard('клик на +N още', () => bubbleClick(w, more));
    ok('showModule("client")', modules.length === 1 && modules[0] === 'client', JSON.stringify(modules));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
