/* Етикетите на status в таб "Разлики" зависят от типа на решението.

   В схемата stock_differences.status има само new/pending/taken. Едно и също
   'taken' означава "Взета" при връщане (куриерът я е взел) и "Заприходена"
   при заприхождаване. Преди това броячите и баджът казваха "Взета" за всичко,
   а select-ът записваше отделна стойност 'capitalized', която нито броячите,
   нито чиповете филтрират - такъв ред изчезваше от всички изгледи.

   Пускане:  node tests/stock-diff-status-labels.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

/* Разпределение като на Раднево: pending=4, taken=3, смесени типове. */
const ROWS = [
  { id: 'w-p1', store_name: 'Раднево', material_name: 'ПРОФИЛ ПВЦ', type: 'writein', status: 'pending' },
  { id: 'w-p2', store_name: 'Раднево', material_name: 'ЩУЦЕР', type: 'writein', status: 'pending' },
  { id: 'w-t1', store_name: 'Раднево', material_name: 'БОЙЛЕР 80Л', type: 'writein', status: 'taken' },
  { id: 'w-t2', store_name: 'Раднево', material_name: 'ЛАМПА LED', type: 'writein', status: 'taken' },
  { id: 'r-p1', store_name: 'Раднево', material_name: 'КРАН СПИРАТЕЛЕН', type: 'return', status: 'pending' },
  { id: 'r-t1', store_name: 'Раднево', material_name: 'МАРКУЧ 10М', type: 'return', status: 'taken' },
  { id: 'm-p1', store_name: 'Раднево', material_name: 'ГАЙКА М8', type: 'missing', status: 'pending' }
].map(function (r) {
  return Object.assign({ report_id: null, supplier: 'ТЕСИ ООД', material_code: '111',
    quantity: 1, confirmed_date: null, comment: null, resolution_comment: null }, r);
});

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin',
                store_name: 'Централен офис', assigned_stores: ['Раднево'] };

function env(rows) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: ADMIN,
    data: { stock_differences: rows, differences_reports: [], stock_returns: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = [];
  h.w.sdTypeFilter = 'all';
  h.w.sdFilter = 'all';
  return h;
}

/* Чиповете по тип и по статус ползват един и същ data-f атрибут;
   тези три стойности се срещат само в единия от двата реда. */
function typeChip(doc, type) { return doc.querySelector('button[data-f="' + type + '"]'); }

/* Чиповете за статус: pending/taken са уникални, но data-f="all" го има и при
   филтъра по тип ("Всички типове" - без число). Затова "Всички (N)" се разпознава
   по скобите. Чипът за магазини е button[data-store], извън тази извадка. */
function statusChip(doc, which) {
  if (which !== 'all') return doc.querySelector('button[data-f="' + which + '"]');
  const cands = Array.prototype.filter.call(
    doc.querySelectorAll('button[data-f="all"]'), b => /\(\d+\)/.test(b.textContent));
  return cands[cands.length - 1] || null;
}
function chipCount(doc, which) {
  const el = statusChip(doc, which);
  const m = el && el.textContent.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : -1;
}

(async function () {

  section('1. Филтър "Заприхождаване" — думите стават Незаприходена/Заприходена');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    if (guard('превключване на типа', () => realClick(w, typeChip(doc, 'writein')))) {
      const h = doc.getElementById('mod-stock-diff').innerHTML;
      ok('филтърът е приложен', w.sdTypeFilter === 'writein');
      ok('показва "Заприходена"', h.indexOf('Заприходена') >= 0);
      ok('показва "Незаприходена"', h.indexOf('Незаприходена') >= 0);
      ok('НЕ показва "Невзета" в броячите', h.indexOf('⏳ Невзета') < 0);
      ok('НЕ показва "Взета" в броячите', h.indexOf('✅ Взета') < 0);
      ok('числото брои само writein (pending=2)', h.indexOf('Незаприходена (2)') >= 0, h.match(/Незаприходена \(\d+\)/));
      ok('числото брои само writein (taken=2)', h.indexOf('Заприходена (2)') >= 0, h.match(/Заприходена \(\d+\)/));
    }
  }

  section('2. Филтър "Връщане" — думите остават Невзета/Взета');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    if (guard('превключване на типа', () => realClick(w, typeChip(doc, 'return')))) {
      const h = doc.getElementById('mod-stock-diff').innerHTML;
      ok('филтърът е приложен', w.sdTypeFilter === 'return');
      ok('показва "Невзета"', h.indexOf('Невзета') >= 0);
      ok('показва "Взета"', h.indexOf('Взета') >= 0);
      ok('НЕ показва "Заприходена" в броячите', h.indexOf('📥 Заприходена') < 0);
      ok('числото брои само return (pending=1)', h.indexOf('Невзета (1)') >= 0, h.match(/Невзета \(\d+\)/));
      ok('числото брои само return (taken=1)', h.indexOf('Взета (1)') >= 0, h.match(/[^е]Взета \(\d+\)/));
    }
  }

  section('3. Смесен изглед — неутрални думи, за да не лъжат единия тип');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    const h = doc.getElementById('mod-stock-diff').innerHTML;
    ok('при "Всички типове" -> "Чакащи"', h.indexOf('Чакащи (4)') >= 0);
    ok('при "Всички типове" -> "Приключени"', h.indexOf('Приключени (3)') >= 0);
    ok('при "Всички типове" чипът "Всички" е сборен (7)', chipCount(doc, 'all') === 7,
      String(chipCount(doc, 'all')));
    if (guard('превключване към "Липса"', () => realClick(w, typeChip(doc, 'missing')))) {
      const hm = doc.getElementById('mod-stock-diff').innerHTML;
      ok('при "Липса" също е неутрално', hm.indexOf('Чакащи') >= 0 && hm.indexOf('Приключени') >= 0);
      ok('при "Липса" числата са само за нея (1/0)',
        hm.indexOf('Чакащи (1)') >= 0 && hm.indexOf('Приключени (0)') >= 0,
        (hm.match(/Чакащи \(\d+\)/) || '') + ' ' + (hm.match(/Приключени \(\d+\)/) || ''));
    }
  }

  section('3a. Числата се стесняват по тип и се събират до сборните');
  {
    const { w, doc } = env(ROWS);
    /* Данните: writein 2+2, return 1+1, missing 1+0 -> общо pending 4, taken 3 */
    const counts = (filter) => {
      w.sdTypeFilter = filter;
      w.renderStockDiff();
      return {
        all: chipCount(doc, 'all'),
        pending: chipCount(doc, 'pending'),
        taken: chipCount(doc, 'taken')
      };
    };
    const cw = counts('writein'), cr = counts('return'), cm = counts('missing'), ca = counts('all');
    ok('writein -> 2 чакащи / 2 приключени', cw.pending === 2 && cw.taken === 2, JSON.stringify(cw));
    ok('return -> 1 / 1', cr.pending === 1 && cr.taken === 1, JSON.stringify(cr));
    ok('missing -> 1 / 0', cm.pending === 1 && cm.taken === 0, JSON.stringify(cm));
    ok('всички -> 4 / 3 (сборно)', ca.pending === 4 && ca.taken === 3, JSON.stringify(ca));
    ok('сборът по типове = сборното число (pending)',
      cw.pending + cr.pending + cm.pending === ca.pending);
    ok('сборът по типове = сборното число (taken)',
      cw.taken + cr.taken + cm.taken === ca.taken);
    ok('чипът "Всички" също се стеснява (writein=4)', cw.all === 4, String(cw.all));
    ok('чипът "Всички" при "всички типове" е 7', ca.all === 7, String(ca.all));
  }

  section('4. Баджът в реда следва r.type, не филтъра');
  {
    const { w, doc } = env(ROWS);
    w.sdFilter = 'all';
    w.renderStockDiff();
    const rowOf = (id) => {
      const b = doc.querySelector('button[data-id="' + id + '"]');
      let el = b; while (el && el.tagName !== 'TR') el = el.parentNode;
      return el;
    };
    const wt = rowOf('w-t1'), rt = rowOf('r-t1'), wp = rowOf('w-p1'), mt = rowOf('m-p1');
    if (ok('редовете се намират в таблицата', !!wt && !!rt && !!wp && !!mt)) {
      ok('writein + taken -> ЗАПРИХОДЕНА', wt.textContent.indexOf('ЗАПРИХОДЕНА') >= 0, wt.textContent.trim().slice(0, 80));
      ok('writein + taken НЕ казва ВЗЕТА', wt.textContent.indexOf('ВЗЕТА') < 0);
      ok('return + taken -> ВЗЕТА', rt.textContent.indexOf('✅ ВЗЕТА') >= 0);
      ok('writein + pending -> НЕЗАПРИХОДЕНА', wp.textContent.indexOf('НЕЗАПРИХОДЕНА') >= 0);
      ok('missing + pending -> НЕВЗЕТА (без промяна)', mt.textContent.indexOf('НЕВЗЕТА') >= 0);
    }
    /* дори когато филтърът по тип е "Връщане", баджът на writein ред не се мени */
    w.sdTypeFilter = 'all';
    w.renderStockDiff();
    ok('бутонът за маркиране на writein казва "Заприходена"',
      doc.getElementById('mod-stock-diff').innerHTML.indexOf('📥 Заприходена') >= 0);
  }

  section('5. Select-ът вече не предлага и не записва "capitalized"');
  {
    const { w, doc, calls } = env(ROWS);
    w.renderStockDiff();
    if (guard('модалът се отваря за writein ред', () => w.openSDModal('w-p1'))) {
      const sel = doc.getElementById('sd-status');
      const vals = Array.prototype.map.call(sel.options, o => o.value);
      ok('няма опция със стойност "capitalized"', vals.indexOf('capitalized') < 0, vals.join(','));
      ok('стойностите са само pending/taken/received',
        vals.join(',') === 'pending,taken,received', vals.join(','));
      ok('етикетът за taken е "📥 ЗАПРИХОДЕНА"',
        sel.options[1].textContent.indexOf('ЗАПРИХОДЕНА') >= 0, sel.options[1].textContent);
      ok('етикетът за pending е "НЕЗАПРИХОДЕНА"',
        sel.options[0].textContent.indexOf('НЕЗАПРИХОДЕНА') >= 0, sel.options[0].textContent);

      sel.value = 'taken';
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('status === "taken", не "capitalized"', p.body.status === 'taken', JSON.stringify(p.body.status));
      }
    }
  }

  section('6. Ред за връщане — етикетите в select-а са Невзета/Взета');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    if (guard('модалът се отваря за return ред', () => w.openSDModal('r-t1'))) {
      const sel = doc.getElementById('sd-status');
      ok('taken е "✅ ВЗЕТА"', sel.options[1].textContent.indexOf('ВЗЕТА') >= 0
        && sel.options[1].textContent.indexOf('ЗАПРИХОДЕНА') < 0, sel.options[1].textContent);
      ok('taken опцията е избрана', sel.value === 'taken');
    }
  }

  section('7. Стар ред със status="capitalized" не изчезва и се нормализира');
  {
    const LEGACY = ROWS.concat([{ id: 'w-cap', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
      material_code: '999', material_name: 'СТАР ЗАПИС', quantity: 1, report_id: null,
      type: 'writein', status: 'capitalized', confirmed_date: null, comment: null,
      resolution_comment: null }]);
    const { w, doc, calls } = env(LEGACY);
    w.sdFilter = 'all';
    w.renderStockDiff();
    const h = doc.getElementById('mod-stock-diff').innerHTML;
    ok('старият ред все още се вижда', h.indexOf('СТАР ЗАПИС') >= 0);
    if (guard('модалът се отваря', () => w.openSDModal('w-cap'))) {
      const sel = doc.getElementById('sd-status');
      ok('избрана е опцията "taken"', sel.value === 'taken', sel.value);
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('записва се "taken" (нормализиран)', p.body.status === 'taken', JSON.stringify(p.body.status));
      }
    }
  }

  section('8. Помощните функции пряко');
  {
    const { w } = env(ROWS);
    ok('sdStatusWords("writein").taken', w.sdStatusWords('writein').taken === 'Заприходена');
    ok('sdStatusWords("return").taken', w.sdStatusWords('return').taken === 'Взета');
    ok('sdStatusWords(null) пада към Невзета/Взета', w.sdStatusWords(null).pending === 'Невзета');
    ok('sdCounterWords("all") е неутрално', w.sdCounterWords('all').taken === 'Приключени');
    ok('sdCounterWords("missing") е неутрално', w.sdCounterWords('missing').pending === 'Чакащи');
    ok('sdCounterWords("writein") е типово', w.sdCounterWords('writein').taken === 'Заприходена');
  }

  report();
})();
