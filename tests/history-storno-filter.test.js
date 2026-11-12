/* История → Търсене по период → Сторно бележки: филтър „Само с по-малка сума“
   (12.11.2026, заявка на Миглена — 47 маркирани от 2132 бяха пръснати в таблицата).

   Правилото за „по-малка сума“ е САМО stornoIndicator() от kasa.js — history.js
   не сравнява сумите сам. Състоянието е в паметта (histStornoOnlyFlagged) и се
   нулира при всяко ново „Търси →“.

   Покрива:
     1. 5 бележки: 2 по-малка сума, 1 равна, 1 по-голяма, 1 капаро (900001) с
        по-малка сума → чип „Само с по-малка сума“ има; истински клик → точно 2
        реда и „(2 от 5)“; втори клик → 5 реда и „(5)“.
     2. Клик по метричната карта „⚠️ 2 с по-малка сума“ → филтърът е вкл.
     3. Филтърът вкл. → ново „Търси →“ → изкл., таблицата пак е пълна.
     4. 0 маркирани → чипа го няма, метричната карта не е кликаема, таблицата е пълна.

   Мутационна проверка (12.11.2026), всеки мутант пуснат срещу този тест:
     - филтър по diff<=0 вместо stornoIndicator().flagged      — СЪБОРЕН (7 ❌)
     - stornoIndicator без изключението за капаро/ваучер       — СЪБОРЕН (11 ❌)
     - без `histStornoOnlyFlagged=false` в runHistorySearch    — СЪБОРЕН (3 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/history-storno-filter.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, ticks } = H;

const ADMIN = {
  email: 'acc@temax.bg', display_name: 'Счетоводство',
  role: 'accounting', store_name: 'Централен офис'
};

const mk = (id, ret, nw, articles) => ({
  id: id, store_name: 'Шумен', storno_date: '2026-11-01', original_receipt_date: '2026-10-30',
  articles: articles || '123456', returned_sum: ret, new_sum: nw, reason: 'Замяна',
  status: null, kasa_storno_items: []
});

const FIVE = [
  mk('s-less-1', 100, 80),            /* по-малка */
  mk('s-less-2', 50.5, 50.49),        /* по-малка с 1 цент */
  mk('s-equal', 70, 70),              /* равна */
  mk('s-more', 30, 45),               /* по-голяма */
  mk('s-deposit', 200, 0, '900001')   /* капаро с по-малка сума — НЕ е маркирана */
];
const NONE = [mk('n-equal', 70, 70), mk('n-more', 30, 45), mk('n-deposit', 200, 0, '900009')];

function env(storno) {
  return boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: ADMIN,
    data: { transport_orders: [], client_orders: [], kasa_reports: [], stores: [],
            kasa_documents: [], kasa_storno: storno, kasa_storno_items: [] }
  });
}
async function search(h) {
  if (!h.doc.getElementById('h-from')) h.w.renderHistoryShell();
  h.doc.getElementById('h-from').value = '2026-10-13';
  h.doc.getElementById('h-to').value   = '2026-11-12';
  h.doc.getElementById('h-type').value = 'storno';
  realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
  await ticks();
}
const card  = h => h.doc.getElementById('h-storno-card');
const chip  = h => h.doc.getElementById('h-storno-only-flagged');
const title = h => { var c = card(h); var t = c && c.querySelector('.card-title'); return t ? t.textContent : ''; };
/* Редовете с данни: по един <tr> на бележка (статусът е null — няма под-ред). */
const rowCount = h => { var c = card(h); return c ? c.querySelectorAll('tbody tr').length : -1; };
const rowsText = h => { var c = card(h); return c ? c.querySelector('tbody').textContent : ''; };

(async function () {

  section('1. Чип „Само с по-малка сума“ — истински клик');
  {
    var h = env(FIVE);
    await search(h);
    ok('картата на сторно бележките е на екрана', !!card(h));
    ok('без филтър: 5 реда', rowCount(h) === 5, 'реално: ' + rowCount(h));
    ok('без филтър: заглавие „(5)“', title(h).indexOf('Сторно бележки (5)') >= 0, title(h));
    ok('текстът „⚠️ 2 с по-малка сума на новата покупка“', card(h).textContent.indexOf('⚠️ 2 с по-малка сума на новата покупка') >= 0);
    if (ok('чипът е на екрана', !!chip(h))) {
      ok('чипът е изкл. (aria-pressed=false)', chip(h).getAttribute('aria-pressed') === 'false');
      realClick(h.w, chip(h), 'Само с по-малка сума');
      ok('след клик: точно 2 реда', rowCount(h) === 2, 'реално: ' + rowCount(h));
      ok('след клик: заглавие „(2 от 5)“', title(h).indexOf('Сторно бележки (2 от 5)') >= 0, title(h));
      ok('след клик: чипът е вкл.', chip(h) && chip(h).getAttribute('aria-pressed') === 'true');
      var t = rowsText(h);
      ok('капарото (200.00 → 0) НЕ е в маркираните', t.indexOf('Капаро') < 0 && t.indexOf('200.00') < 0, t);
      ok('и двете по-малки са вътре (100.00 и 50.50)', t.indexOf('100.00') >= 0 && t.indexOf('50.50') >= 0, t);
      ok('равната (70.00) и по-голямата (45.00) не са', t.indexOf('70.00') < 0 && t.indexOf('45.00') < 0, t);
      ok('индикацията на всички показани е „⚠️ ПО-МАЛКО“',
         Array.prototype.every.call(card(h).querySelectorAll('tbody tr'), function (tr) { return tr.textContent.indexOf('ПО-МАЛКО') >= 0; }));
      realClick(h.w, chip(h), 'Само с по-малка сума');
      ok('втори клик: 5 реда', rowCount(h) === 5, 'реално: ' + rowCount(h));
      ok('втори клик: заглавие „(5)“', title(h).indexOf('Сторно бележки (5)') >= 0, title(h));
      ok('втори клик: чипът е изкл.', chip(h) && chip(h).getAttribute('aria-pressed') === 'false');
    }
    h.close();
  }

  section('2. Клик по метричната карта горе включва филтъра');
  {
    var h = env(FIVE);
    await search(h);
    var m = h.doc.getElementById('h-storno-metric');
    if (ok('метричната карта е кликаема (h-storno-metric)', !!m)) {
      ok('носи „⚠️ 2 с по-малка сума“', m.textContent.indexOf('⚠️ 2 с по-малка сума') >= 0, m.textContent);
      var scrolled = 0;
      h.w.HTMLElement.prototype.scrollIntoView = function () { if (this.id === 'h-storno-card') scrolled++; };
      realClick(h.w, m, 'метрична карта сторно');
      ok('филтърът е вкл. (histStornoOnlyFlagged)', h.w.histStornoOnlyFlagged === true);
      ok('таблицата: 2 реда', rowCount(h) === 2, 'реално: ' + rowCount(h));
      ok('чипът е вкл.', chip(h) && chip(h).getAttribute('aria-pressed') === 'true');
      ok('скролва до картата на сторно бележките', scrolled === 1, 'scrollIntoView: ' + scrolled);
    }
    h.close();
  }

  section('3. Ново „Търси →“ нулира филтъра');
  {
    var h = env(FIVE);
    await search(h);
    realClick(h.w, chip(h), 'Само с по-малка сума');
    ok('преди търсенето: 2 реда', rowCount(h) === 2, 'реално: ' + rowCount(h));
    await search(h);
    ok('след „Търси →“: филтърът е изкл.', h.w.histStornoOnlyFlagged === false);
    ok('след „Търси →“: 5 реда', rowCount(h) === 5, 'реално: ' + rowCount(h));
    ok('след „Търси →“: чипът е изкл.', chip(h) && chip(h).getAttribute('aria-pressed') === 'false');
    h.close();
  }

  section('4. 0 маркирани → без чип, таблицата е пълна');
  {
    var h = env(NONE);
    await search(h);
    ok('чипа го няма', !chip(h));
    ok('метричната карта не е кликаема', !h.doc.getElementById('h-storno-metric'));
    ok('„без разминавания“ в метричната карта', h.doc.getElementById('h-results').textContent.indexOf('без разминавания') >= 0);
    ok('таблицата: 3 реда', rowCount(h) === 3, 'реално: ' + rowCount(h));
    /* Дори флагът да е останал вдигнат (напр. ръчно), при 0 маркирани таблицата е пълна. */
    h.w.histStornoOnlyFlagged = true;
    h.w.renderHistoryResults();
    ok('флаг вкл. при 0 маркирани → пак 3 реда, без „от“', rowCount(h) === 3 && title(h).indexOf(' от ') < 0, title(h));
    h.close();
  }

  report();
})();
