/* Липса/Връщане: количеството се смята автоматично при решаване на разлика.

   Досега Цветелина решаваше реда с бутоните („❓ Липса" / „↩️ Връщане") и
   после ръчно пренаписваше stock_differences.quantity с реалната разлика —
   напр. ред 32096: по документ 20, реално получено 15, тя слагаше 5.
   Оттук нататък resolveDiffLine() го смята сам през diffResolvedQty():

     Липса   = по документ − реално получено
     Връщане = реално получено − по документ

   База е quantity_supplier_doc, а при празна база — quantity. Няма ли реално
   получено (или излезе ли 0/отрицателно), quantity изобщо не влиза в payload-а
   и потвърждението за запис излиза жълто, с прикачено предупреждение — старата
   стойност остава. Двата случая имат РАЗЛИЧЕН текст: празно поле срещу нулева
   разлика. Предупреждението е част от СЪЩИЯ toast, защото toast() пише в един
   и същ елемент — втори toast би изял потвърждението.

   Модалът (submitSD) НЕ е пипан: там количеството продължава да се въвежда
   ръчно, съзнателно.

   Пускане:  node tests/stock-diff-resolve-qty.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const REPORT = {
  id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966',
  doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
  general_comment: '', photos: [], reviewed: false
};

/* Числата идват от PostgREST като НИЗОВЕ — точно затова формулата минава през
   parseFloat. Тестовите данни ги държат като низове, за да не тестваме нещо,
   което в браузъра не се случва. */
function row(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: null,
    quantity_supplier_doc: null, quantity_received: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    type: null, status: 'new',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function env(rows) {
  /* stock-returns.js е тук, защото autoCreateReturnFromDiff пише в
     stock_returns и без него POST-ът в случай (б) не би се проследил. */
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI,
    confirm: true,
    data: {
      stock_differences: rows, differences_reports: [REPORT],
      stock_returns: [], users: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify([REPORT]));
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  return h;
}

/* Последният PATCH към stock_differences — PATCH-ът към differences_reports
   (reviewed) минава по същия път и не ни интересува. */
function sdPatch(calls) {
  const list = calls.patch.filter(p => /stock_differences/.test(p.url));
  return list.length ? list[list.length - 1] : null;
}
const WARN_EMPTY = '⚠️ Реално получено не е попълнено — количеството остава по документ';
const WARN_ZERO  = '⚠️ По данни няма разлика (получено = по документ) — количеството остава по документ';
const hasWarn = t => String(t).indexOf('⚠️') >= 0;

/* Бутон за решение В КОНКРЕТЕН ред. btn() връща първия на страницата, а в
   случай (в) на екрана има два реда и трябва точно единият. */
function rowBtn(doc, id, label) {
  const list = doc.querySelectorAll('button[data-id="' + id + '"]');
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (/resolveDiffLine/.test(el.getAttribute('onclick') || '') &&
        el.textContent.indexOf(label) >= 0) return el;
  }
  return null;
}
/* jsdom нормализира style.background към rgb() — сравняваме по нормализирана
   форма, за да не зависи проверката от начина на записване на цвета. */
const AMBER = 'rgb(217, 119, 6)';   /* = #d97706 */
function toastBg(doc) {
  const raw = (doc.getElementById('toast') || { style: {} }).style.background || '';
  return raw === '#d97706' ? AMBER : raw;
}

(async function run() {

  section('0. Хелперът съществува и смята сам по себе си');
  {
    const { w } = env([]);
    ok('diffResolvedQty е дефинирана', typeof w.diffResolvedQty === 'function');
    if (typeof w.diffResolvedQty === 'function') {
      const f = w.diffResolvedQty;
      ok('липса 20−15 = 5', f({ quantity_supplier_doc: '20', quantity_received: '15' }, 'missing') === 5);
      ok('връщане 36−24 = 12', f({ quantity_supplier_doc: '24', quantity_received: '36' }, 'return') === 12);
      ok('липса при равни количества → null',
        f({ quantity_supplier_doc: '15', quantity_received: '15' }, 'missing') === null);
      ok('липса при отрицателен резултат → null',
        f({ quantity_supplier_doc: '15', quantity_received: '20' }, 'missing') === null);
      ok('липсващо реално получено → null',
        f({ quantity_supplier_doc: '20', quantity_received: null }, 'missing') === null);
      ok('празен низ за реално получено → null',
        f({ quantity_supplier_doc: '20', quantity_received: '' }, 'missing') === null);
      ok('празна база и празно quantity → null',
        f({ quantity_supplier_doc: null, quantity: null, quantity_received: '3' }, 'missing') === null);
      ok('fallback към quantity при празен quantity_supplier_doc',
        f({ quantity_supplier_doc: null, quantity: '4', quantity_received: '0' }, 'missing') === 4);
      ok('нечислова стойност → null',
        f({ quantity_supplier_doc: 'абв', quantity_received: '1' }, 'missing') === null);
      ok('десетичните не текат (0.3 − 0.1 = 0.2, не 0.19999999999999998)',
        f({ quantity_supplier_doc: '0.3', quantity_received: '0.1' }, 'missing') === 0.2,
        JSON.stringify(f({ quantity_supplier_doc: '0.3', quantity_received: '0.1' }, 'missing')));
      ok('друг тип (writein) → null',
        f({ quantity_supplier_doc: '20', quantity_received: '15' }, 'writein') === null);
      ok('липсващ ред → null', f(null, 'missing') === null);
    }
  }

  section('а) Липса: по документ 20, реално 15 → PATCH с quantity 5');
  {
    const { w, doc, calls } = env([row({
      id: 'l-a', quantity: '20', quantity_supplier_doc: '20', quantity_received: '15'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '❓ Липса');
      /* Референция към обекта ОТПРЕДИ клика — loadStockDiff() подменя sdData
         след PATCH-а и търсене по id после би върнало друг обект. */
      const localLine = w.sdData.find(x => x.id === 'l-a');
      if (ok('бутонът „❓ Липса" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p, calls.toast.join(' | '))) {
          ok('type е missing', p.body.type === 'missing', JSON.stringify(p.body.type));
          ok('PATCH носи quantity', 'quantity' in p.body, Object.keys(p.body).join(','));
          ok('quantity е 5 (20 − 15)', p.body.quantity === 5, JSON.stringify(p.body.quantity));
          ok('quantity е число, не низ', typeof p.body.quantity === 'number');
        }
        ok('локалният line.quantity е обновен на 5',
          !!localLine && localLine.quantity === 5, JSON.stringify(localLine && localLine.quantity));
        ok('няма предупредителен toast',
          !calls.toast.some(hasWarn), calls.toast.join(' | '));
      }
    }
  }

  section('б) Връщане: по документ 24, реално 36 → quantity 12 и в stock_returns');
  {
    const { w, doc, calls } = env([row({
      id: 'l-b', quantity: '24', quantity_supplier_doc: '24', quantity_received: '36'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '↩️ Връщане');
      if (ok('бутонът „↩️ Връщане" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p, calls.toast.join(' | '))) {
          ok('type е return', p.body.type === 'return', JSON.stringify(p.body.type));
          ok('quantity е 12 (36 − 24)', p.body.quantity === 12, JSON.stringify(p.body.quantity));
        }
        /* Същинската кросмодулна проверка: количеството трябва да е стигнало и
           до „За връщане", иначе там стои старото 24 по документ. */
        const post = calls.post.filter(x => x.table === 'stock_returns');
        if (ok('има POST към stock_returns', post.length === 1, 'брой: ' + post.length)) {
          ok('stock_returns.quantity е 12, не 24',
            post[0].body.quantity === 12, JSON.stringify(post[0].body.quantity));
          ok('редът е свързан с разликата', post[0].body.diff_line_id === 'l-b');
        }
        ok('няма предупредителен toast',
          !calls.toast.some(hasWarn), calls.toast.join(' | '));
      }
    }
  }

  section('в) Липса без „Реално получено" → БЕЗ quantity + „не е попълнено"');
  {
    /* Втори, НЕрешен ред по същата бланка — за да не се затвори тя и да мине
       клонът с „✅ Записано!". Другият клон („Решено — бланката е напълно
       прегледана") се покрива в (г). */
    const { w, doc, calls } = env([
      row({ id: 'l-c', quantity: '7', quantity_supplier_doc: '20', quantity_received: null }),
      row({ id: 'l-c2', quantity: '1', quantity_supplier_doc: '1', quantity_received: '1' })
    ]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = rowBtn(doc, 'l-c', 'Липса');
      const localLine = w.sdData.find(x => x.id === 'l-c');
      if (ok('бутонът „❓ Липса" на реда l-c е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p, calls.toast.join(' | '))) {
          ok('PATCH-ът е за реда l-c', /l-c(?!2)/.test(p.url), p.url);
          ok('type пак се записва', p.body.type === 'missing');
          ok('PATCH-ът е БЕЗ quantity', !('quantity' in p.body), Object.keys(p.body).join(','));
        }
        ok('локалното количество остава непокътнато',
          !!localLine && localLine.quantity === '7', JSON.stringify(localLine && localLine.quantity));

        /* Същината на поправката: ЕДИН toast, който казва и двете. Два
           последователни toast-а се презаписват и потвърждението изчезва. */
        ok('toast-овете са точно един', calls.toast.length === 1,
          calls.toast.length + ': ' + calls.toast.join(' | '));
        const t = calls.toast[0] || '';
        ok('същият toast потвърждава записа', t.indexOf('Записано') >= 0, t);
        ok('същият toast носи и предупреждението', hasWarn(t), t);
        ok('текстът е „Реално получено не е попълнено"', t.indexOf(WARN_EMPTY) >= 0, t);
        ok('НЕ е текстът за нулева разлика', t.indexOf(WARN_ZERO) < 0, t);
        ok('toast-ът е жълт (#d97706)', toastBg(doc) === AMBER, toastBg(doc));
      }
    }
  }

  section('г) Връщане при равни количества (15 и 15) → PATCH БЕЗ quantity');
  {
    const { w, doc, calls } = env([row({
      id: 'l-d', quantity: '15', quantity_supplier_doc: '15', quantity_received: '15'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '↩️ Връщане');
      if (ok('бутонът „↩️ Връщане" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p, calls.toast.join(' | '))) {
          ok('нула не се записва като количество', !('quantity' in p.body),
            Object.keys(p.body).join(','));
        }
        /* Тук полето Е попълнено — просто няма разлика. Текстът е ДРУГ, за да
           не праща Цвети да търси непопълнена бланка. Този ред затваря
           бланката, значи минава клонът „Решено — бланката е напълно
           прегледана" — другият от двата, покрити от теста. */
        ok('toast-овете са точно един', calls.toast.length === 1,
          calls.toast.length + ': ' + calls.toast.join(' | '));
        const t = calls.toast[0] || '';
        ok('същият toast потвърждава прегледа', t.indexOf('напълно прегледана') >= 0, t);
        ok('текстът е „По данни няма разлика"', t.indexOf(WARN_ZERO) >= 0, t);
        ok('НЕ е текстът за непопълнено поле', t.indexOf(WARN_EMPTY) < 0, t);
        ok('toast-ът е жълт (#d97706)', toastBg(doc) === AMBER, toastBg(doc));
        const post = calls.post.filter(x => x.table === 'stock_returns');
        if (ok('редът за връщане пак се създава', post.length === 1, 'брой: ' + post.length)) {
          ok('stock_returns.quantity остава старото 15',
            post[0].body.quantity === '15', JSON.stringify(post[0].body.quantity));
        }
      }
    }
  }

  section('д) Празен quantity_supplier_doc → база е quantity (4 − 0 = 4)');
  {
    const { w, doc, calls } = env([row({
      id: 'l-e', quantity: '4', quantity_supplier_doc: null, quantity_received: '0'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '❓ Липса');
      if (ok('бутонът „❓ Липса" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p, calls.toast.join(' | '))) {
          ok('quantity е 4 (fallback към quantity)', p.body.quantity === 4,
            JSON.stringify(p.body.quantity));
        }
        ok('няма предупредителен toast',
          !calls.toast.some(hasWarn), calls.toast.join(' | '));
      }
    }
  }

  section('е) Другите типове не са пипани — payload-ът е точно предишният');
  {
    const OLD_KEYS = ['type', 'status', 'resolved_by', 'resolved_at'].sort().join(',');

    /* е.1 — реален клик по „📥 Заприх." върху ред, който БИ дал количество,
       ако формулата се прилагаше и там. */
    const { w, doc, calls } = env([row({
      id: 'l-f', quantity: '20', quantity_supplier_doc: '20', quantity_received: '15'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '📥 Заприх.');
      const localLine = w.sdData.find(x => x.id === 'l-f');
      if (ok('бутонът „📥 Заприх." е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p, calls.toast.join(' | '))) {
          ok('PATCH-ът е БЕЗ quantity', !('quantity' in p.body), Object.keys(p.body).join(','));
          ok('ключовете са точно предишните четири',
            Object.keys(p.body).sort().join(',') === OLD_KEYS, Object.keys(p.body).join(','));
        }
        ok('локалното количество не е пипано',
          !!localLine && localLine.quantity === '20', JSON.stringify(localLine && localLine.quantity));
        ok('никакво предупреждение', !calls.toast.some(hasWarn), calls.toast.join(' | '));
        ok('toast-ът е зелен, не жълт', toastBg(doc) !== AMBER, toastBg(doc));
      }
    }

    /* е.2 — произволен друг тип, подаден директно (бутон за него няма). */
    const h2 = env([row({
      id: 'l-g', quantity: '20', quantity_supplier_doc: '20', quantity_received: '15'
    })]);
    h2.w.resolveDiffLine('l-g', 'accepted');
    await ticks();
    const p2 = sdPatch(h2.calls);
    if (ok('тип „accepted": има PATCH', !!p2, h2.calls.toast.join(' | '))) {
      ok('тип „accepted": ключовете са точно предишните четири',
        Object.keys(p2.body).sort().join(',') === OLD_KEYS, Object.keys(p2.body).join(','));
    }
  }

  report();
})();
