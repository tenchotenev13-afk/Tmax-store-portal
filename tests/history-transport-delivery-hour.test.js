/* История — „🚚 Транспортни заявки“: часът стои при ДОСТАВКАТА.

   o.hour е часът на доставката. До 16.11.2026 колона „Дата“ показваше o.date
   (денят на заявката, сурово гггг-мм-дд) с o.hour под нея, а „Доставка“ — само
   деня. Същото смесване, което 956df16 махна от таб Транспорт.

   Сега: „Заявена“ = fmtDate(o.date), без час; „Доставка“ = <b>дд.мм.гггг</b>
   + час; без delivery — „—“ и под него часът в сиво.

   Рендерът е истински: renderHistoryShell → период → клик „Търси →“ →
   runHistorySearch → renderHistoryResults. Клетките се търсят по индекса на
   заглавието, не по позиция наизуст.

   Мутационна проверка (16.11.2026), всеки мутант пуснат срещу този тест:
     1) часът обратно под „Заявена“                      → пада
     2) „Доставка“ без час                               → пада
     3) „Заявена“ сурово esc(o.date) (гггг-мм-дд)        → пада

   Пускане: node tests/history-transport-delivery-hour.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, ticks } = H;

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

const tr = (id, over) => Object.assign({
  id: id, store_name: 'Петрич', date: '2026-11-12', hour: '11:00', delivery: '2026-11-17',
  customer_name: 'Клиент ' + id, phone: '0888', product: 'Диван', sap: '100200',
  address: 'ул. Първа 1', status: 'pending', created_at: '2026-11-12T08:00:00Z'
}, over || {});

const TRANSPORT = [
  tr('t-full'),
  tr('t-nodel', { delivery: null, created_at: '2026-11-12T07:00:00Z' }),
  tr('t-nohour', { hour: null, created_at: '2026-11-12T06:00:00Z' })
];

async function render() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'notifications.js'],
    user: ADMIN,
    data: { transport_orders: TRANSPORT, client_orders: [], kasa_reports: [], kasa_storno: [], stores: [] }
  });
  h.w.renderHistoryShell();
  h.doc.getElementById('h-from').value = '2026-11-01';
  h.doc.getElementById('h-to').value = '2026-11-30';
  h.doc.getElementById('h-type').value = 'transport';
  realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
  for (let i = 0; i < 6; i++) await ticks();
  return h;
}

/* Таблицата на транспорта — тази, чийто картон носи „🚚 Транспортни заявки (“. */
function transportTable(doc) {
  const cards = Array.from(doc.querySelectorAll('#h-results .card'));
  const c = cards.find(x => /🚚 Транспортни заявки \(/.test(x.textContent));
  return c ? c.querySelector('table') : null;
}
function headers(tbl) { return Array.from(tbl.querySelectorAll('thead th')).map(th => th.textContent.trim()); }
function cell(tbl, rowIdx, head) {
  const i = headers(tbl).indexOf(head);
  const tr = tbl.querySelectorAll('tbody tr')[rowIdx];
  return i >= 0 && tr ? tr.querySelectorAll('td')[i] : null;
}
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

(async function run() {
  const h = await render();
  const tbl = transportTable(h.doc);

  section('1. Заглавията');
  ok('таблицата на транспорта е на екрана', !!tbl);
  if (!tbl) { report(); return; }
  const hs = headers(tbl);
  ok('„Заявена“ е първата колона', hs[0] === 'Заявена', hs.join(' | '));
  ok('няма колона „Дата“', hs.indexOf('Дата') < 0, hs.join(' | '));
  ok('„Доставка“ е колона', hs.indexOf('Доставка') >= 0, hs.join(' | '));
  ok('редовете са 3', tbl.querySelectorAll('tbody tr').length === 3);

  section('2. Заявка с доставка и час (date 12.11, delivery 17.11, 11:00)');
  {
    const z = cell(tbl, 0, 'Заявена'), d = cell(tbl, 0, 'Доставка');
    ok('„Заявена“ = 12.11.2026, без час', z && norm(z.textContent) === '12.11.2026', z && z.textContent);
    ok('„Заявена“ не съдържа 11:00', z && z.textContent.indexOf('11:00') < 0);
    ok('„Заявена“ не е сурова гггг-мм-дд', z && z.textContent.indexOf('2026-11-12') < 0);
    ok('„Доставка“ = „17.11.2026 11:00“', d && norm(d.textContent) === '17.11.2026 11:00', d && d.textContent);
    ok('денят на доставката е удебелен', d && d.querySelector('b') && d.querySelector('b').textContent === '17.11.2026');
  }

  section('3. Без delivery → „—“ и часът в сиво');
  {
    const z = cell(tbl, 1, 'Заявена'), d = cell(tbl, 1, 'Доставка');
    ok('„Заявена“ = 12.11.2026', z && norm(z.textContent) === '12.11.2026', z && z.textContent);
    ok('„Доставка“ започва с „—“', d && /^—/.test(norm(d.textContent)), d && d.textContent);
    const sm = d && d.querySelector('small');
    ok('под „—“ е часът 11:00 в сиво', !!sm && sm.textContent === '11:00' && /#94a3b8/.test(sm.getAttribute('style') || ''),
      d && d.innerHTML);
  }

  section('4. С delivery, без час → само денят, без „null“');
  {
    const d = cell(tbl, 2, 'Доставка');
    ok('„Доставка“ = 17.11.2026', d && norm(d.textContent) === '17.11.2026', d && d.textContent);
  }

  section('5. Печатът на Историята — непроменен (само датата на заявката)');
  {
    const src = require('fs').readFileSync(require('path').join(H.repoDir(), 'history.js'), 'utf8');
    ok('печатният ред на транспорта е esc(o.date||\'\') без час',
      /var transportRows=histData\.transport\.map\(function\(o\)\{\s*return '<tr>'\+\s*'<td>'\+esc\(o\.date\|\|''\)\+'<\/td>'\+/.test(src));
  }

  h.close();
  report();
})().catch(e => { console.error(e); process.exit(1); });
