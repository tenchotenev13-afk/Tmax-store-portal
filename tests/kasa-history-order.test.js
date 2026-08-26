/* Каса — подредба на таблицата „История" (renderHistTable в kasa.js).

   Два дефекта, открити при жив тест на 26.08.2026 с Кърджали за 25.08:

   1. Редове ИЗПАДАТ. kasaTab('glavna') прави
        kasaReports = other.concat(fresh)
      и залепя отчетите за активната дата НАКРАЯ на масива.
      renderHistTable() не сортираше и режеше rows.slice(0,60), тоест при
      118 записа двата върнати отчета паднаха на позиции 117–118 и изчезнаха
      от екрана. За магазина изглеждаше, че отчетите му са изтрити.
   2. Върнатите не са отгоре, макар точно по тях да се работи.

   Сортирането е в renderHistTable(), не в filterHistRep() и не в loadKasa(),
   затова тестът минава и през двата пътя до таблицата.

   Пускане:
     node tests/kasa-history-order.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report } = H;

/* ── 1. Данни ─────────────────────────────────────────────────────────────── */

const KASA_USER = {
  email: 'kasa@temax.bg', display_name: 'Каса Кърджали',
  role: 'kasa', store_name: 'Кърджали'
};

/* Името на касиера носи id-то нарочно: ПОТВЪРДЕНИЯТ ред не рендира нито
   „Редактирай", нито „Потвърди", тоест id-то му не се появява никъде в
   markup-а и не може да се разпознае по onclick атрибут. */
function rep(over) {
  const r = Object.assign({
    id: 'x', store_name: 'Кърджали', pos_number: 1, kasa_number: 1,
    cashier_name: '', status: 'confirmed', date: '2026-08-01',
    total_turnover: 100, cash_turnover: 100, card_turnover: 0,
    storna_total: 0, counted_cash: 100, razlika: 0
  }, over);
  if (!r.cashier_name) r.cashier_name = r.id;
  return r;
}

/* 118 записа, точно както беше на живо: дълга опашка потвърдени по дати
   назад, а двата ВЪРНАТИ от 25.08 — залепени НАКРАЯ от kasaTab('glavna'). */
function liveShapedRows() {
  const rows = [];
  for (let i = 0; i < 116; i++) {
    const d = new Date(Date.UTC(2026, 6, 1));       /* 01.07.2026 нататък */
    d.setUTCDate(d.getUTCDate() + Math.floor(i / 2));
    rows.push(rep({
      id: 'c-' + i, status: 'confirmed',
      date: d.toISOString().slice(0, 10),
      pos_number: (i % 2) + 1
    }));
  }
  rows.push(rep({ id: 'ret-1', status: 'returned', date: '2026-08-25', pos_number: 1 }));
  rows.push(rep({ id: 'ret-2', status: 'returned', date: '2026-08-25', pos_number: 2 }));
  return rows;
}

function env() {
  return boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: KASA_USER,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], stores: [] }
  });
}

/* Редовете на таблицата като [{id, date, status}] в реда на показване. */
function shownRows(w, rows) {
  const html = w.renderHistTable(rows);
  const doc = w.document;
  const box = doc.createElement('div');
  box.innerHTML = html;
  return Array.prototype.slice.call(box.querySelectorAll('tbody tr')).map(function (tr) {
    return {
      id: tr.cells[2].textContent.trim(),   /* колоната Касиер носи id-то */
      date: tr.cells[0].textContent.trim(),
      pos: tr.cells[1].textContent.trim(),
      status: tr.cells[7].textContent.trim(),
      text: tr.textContent
    };
  });
}

(async function run() {

  section('1. Средата се вдига');
  {
    const { w } = env();
    ok('kasa.js е зареден', typeof w.renderHistTable === 'function');
    ok('histSortPriority съществува', typeof w.histSortPriority === 'function');
    if (typeof w.histSortPriority === 'function') {
      ok('върнатият е ранг 0', w.histSortPriority({ status: 'returned' }) === 0);
      ok('потвърденият е след него', w.histSortPriority({ status: 'confirmed' }) > 0);
      ok('черновата е след него', w.histSortPriority({ status: 'draft' }) > 0);
    }
  }

  section('2. Върнат отчет на ПОСЛЕДНА позиция при 118 записа излиза ПЪРВИ');
  {
    const h = env();
    const rows = liveShapedRows();

    ok('масивът е 118 записа', rows.length === 118, String(rows.length));
    ok('върнатите наистина са най-отзад в масива',
      rows[116].id === 'ret-1' && rows[117].id === 'ret-2');
    ok('без сортиране те падат зад slice(0,60)',
      rows.slice(0, 60).filter(function (r) { return r.status === 'returned'; }).length === 0);

    let shown = null;
    if (guard('renderHistTable() не хвърля', () => { shown = shownRows(h.w, rows); })) {
      ok('показани са 60 реда', shown.length === 60, String(shown.length));
      if (ok('има поне един ред', shown.length > 0)) {
        ok('ПЪРВИЯТ ред е върнат отчет', shown[0].status.indexOf('↩ Върнат') >= 0,
          shown[0].status + ' / ' + shown[0].id);
        ok('първият е ret-1 (ПОС 1 преди ПОС 2)', shown[0].id === 'ret-1', String(shown[0].id));
        ok('вторият е ret-2', shown[1].id === 'ret-2', String(shown[1].id));
        ok('и двата върнати се виждат',
          shown.filter(function (r) { return r.status.indexOf('↩ Върнат') >= 0; }).length === 2);
        ok('и двамата носят бутон „Редактирай"',
          shown[0].text.indexOf('Редактирай') >= 0 && shown[1].text.indexOf('Редактирай') >= 0);
        ok('третият ред вече е потвърден', shown[2].status.indexOf('✅ Потвърден') >= 0,
          shown[2].status);
      }
    }
    /* Рендерът не бива да пренарежда чуждия масив. */
    ok('подаденият масив не е мутиран', rows[117].id === 'ret-2' && rows[0].id === 'c-0');
    h.close();
  }

  section('3. При два върнати от различни дати по-новият е отгоре');
  {
    const h = env();
    const rows = [
      rep({ id: 'ok-1', status: 'confirmed', date: '2026-08-26' }),
      rep({ id: 'old', status: 'returned', date: '2026-08-20' }),
      rep({ id: 'new', status: 'returned', date: '2026-08-25' })
    ];
    let shown = null;
    if (guard('renderHistTable() не хвърля', () => { shown = shownRows(h.w, rows); })) {
      ok('първи е по-новият върнат (25.08)', shown[0].id === 'new', String(shown[0].id));
      ok('втори е по-старият върнат (20.08)', shown[1].id === 'old', String(shown[1].id));
      ok('потвърденият е под тях, макар да е най-нов по дата',
        shown[2].id === 'ok-1', String(shown[2].id));
    }
    h.close();
  }

  section('4. Потвърдените под тях остават по дата низходящо');
  {
    const h = env();
    /* Нарочно разбъркан вход. */
    const rows = [
      rep({ id: 'c-10', status: 'confirmed', date: '2026-08-10', pos_number: 1 }),
      rep({ id: 'c-24b', status: 'confirmed', date: '2026-08-24', pos_number: 2 }),
      rep({ id: 'r', status: 'returned', date: '2026-08-05', pos_number: 1 }),
      rep({ id: 'c-24a', status: 'confirmed', date: '2026-08-24', pos_number: 1 }),
      rep({ id: 'c-18', status: 'confirmed', date: '2026-08-18', pos_number: 1 })
    ];
    let shown = null;
    if (guard('renderHistTable() не хвърля', () => { shown = shownRows(h.w, rows); })) {
      const order = shown.map(function (r) { return r.id; }).join(',');
      ok('редът е r, c-24a, c-24b, c-18, c-10',
        order === 'r,c-24a,c-24b,c-18,c-10', order);
      ok('върнатият е първи въпреки най-старата дата', shown[0].id === 'r');
      ok('при равна дата ПОС 1 е преди ПОС 2',
        shown.indexOf(shown.filter(function (x) { return x.id === 'c-24a'; })[0]) <
        shown.indexOf(shown.filter(function (x) { return x.id === 'c-24b'; })[0]));
      ok('датите на потвърдените намаляват',
        shown.slice(1).map(function (r) { return r.date; }).join('|') ===
        '24.08.2026|24.08.2026|18.08.2026|10.08.2026',
        shown.slice(1).map(function (r) { return r.date; }).join('|'));
    }
    h.close();
  }

  section('5. Празни и липсващи данни не чупят сортирането');
  {
    const h = env();
    ok('празен масив дава „Няма записи."',
      h.w.renderHistTable([]).indexOf('Няма записи') >= 0);

    const rows = [
      rep({ id: 'no-date', status: 'confirmed', date: null, pos_number: null }),
      rep({ id: 'ret', status: 'returned', date: '2026-08-25' }),
      rep({ id: 'ok', status: 'confirmed', date: '2026-08-26' })
    ];
    let shown = null;
    if (guard('renderHistTable() не хвърля при липсваща дата',
      () => { shown = shownRows(h.w, rows); })) {
      ok('върнатият пак е първи', shown[0].id === 'ret', String(shown[0].id));
      ok('редът без дата не е изпаднал', shown.length === 3, String(shown.length));
      ok('редът без дата е най-отдолу', shown[2].id === 'no-date', String(shown[2].id));
    }
    h.close();
  }

  section('6. Броячът отдолу пази ЦЕЛИЯ набор, не отрязания');
  {
    const h = env();
    const html = h.w.renderHistTable(liveShapedRows());
    ok('пише „Показани 60 от 118"', html.indexOf('Показани 60 от 118 записа') >= 0);
    h.close();
  }

  section('7. Филтрираният изглед минава по същия път');
  {
    const h = env();
    const { w, doc } = h;
    /* filterHistRep() вика renderHistTable(filtered) — сортирането е в
       рендера, затова важи и тук, без filterHistRep да е пипана. */
    w.kasaReports = liveShapedRows();
    doc.body.insertAdjacentHTML('beforeend',
      '<div id="hist-table-wrap"></div>' +
      '<input id="hist-date-filter" value=""><select id="hist-status-filter">' +
      '<option value="all" selected>all</option></select>');

    if (guard('filterHistRep() не хвърля', () => w.filterHistRep())) {
      const wrap = doc.getElementById('hist-table-wrap');
      const first = wrap.querySelector('tbody tr');
      if (ok('таблицата е рендирана', !!first)) {
        ok('първият ред пак е върнат', first.textContent.indexOf('↩ Върнат') >= 0,
          first.textContent.replace(/\s+/g, ' ').slice(0, 100));
      }
    }
    h.close();
  }

  report();
})();
