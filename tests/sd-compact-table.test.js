/* „Разлики“, част 2: компактната таблица „Решени редове“.

   7 колони при доставчик / 8 при междускладов („Склад · Магазин“), th = td на
   всеки ред; всяко поле от старата 15-колонна таблица се вижда в новата;
   бутоните по роли са ТОЧНО същият набор като преди — EXPECTED е снет от
   предишната версия (6797b5b) на същата фикстура, не измислен: същият скрипт
   с --dump върху стария stock-differences.js дава същия JSON; клик на
   „✅ Изписана“ / „Кредитно“ вика същите функции със същото id; няма „📎N“
   дубликат след коментара на контролера; картата на бланката е в
   overflow-x:auto обвивка.

   Пускане:  node tests/sd-compact-table.test.js .
   Снемане на еталона от друга версия:  node tests/sd-compact-table.test.js <корен> --dump */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick } = H;

const ROOT = process.argv[2] || '.';
const DUMP = process.argv.indexOf('--dump') >= 0;
const WH = 'Логистичен склад Добрич';
const clone = x => JSON.parse(JSON.stringify(x));

const USERS = {
  admin: { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] },
  accounting: { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  warehouse: { email: 'w@temax.bg', display_name: 'Складов', role: 'logistics', store_name: WH },
  store: { email: 'r@temax.bg', display_name: 'Раднево', role: 'store', store_name: 'Раднево' }
};
const LONG = 'ДЪЛГО ИМЕ НА АРТИКУЛ ЗА ПРОВЕРКА НА ПРЕНАСЯНЕТО В КЛЕТКАТА НА КОМПАКТНАТА ТАБЛИЦА';
const IMG = 'https://x/kolet.jpg';
const LINE_FILE = 'https://x/ред-файл.pdf';

function rep(o) {
  return Object.assign({ id: 'rep-s', direction: 'supplier', store_name: 'Раднево', counterpart: 'ТЕСИ ООД', document_number: '4100', doc_date: '2026-09-10',
    reviewed: true, photos: [{ url: IMG, name: 'kolet.jpg' }], created_at: '2026-09-10T09:00:00.000Z' }, o || {});
}
function line(o) {
  return Object.assign({ id: 'l-1', report_id: 'rep-s', store_name: 'Раднево', supplier: 'ТЕСИ ООД', material_code: '1000123', material_name: 'АРТИКУЛ',
    quantity: 5, unit: 'бр.', order_number: null, return_order_number: null, confirmed_date: null, comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, status: 'pending', type: 'writein', warehouse_response: null, warehouse_comment: null, store_response: null, swap_id: null,
    created_at: '2026-09-10T09:00:00.000Z' }, o || {});
}
const REPS = [rep(), rep({ id: 'rep-i', direction: 'interstore', counterpart: WH, photos: [] })];
const LINES = [
  line({ id: 's1', material_name: LONG, comment: 'КОМЕНТАР ОТ ОБЕКТА', resolution_comment: 'КОМЕНТАР НА КОНТРОЛЕРА', order_number: '4100196440',
    return_order_number: '4200017097', confirmed_date: '2026-09-15', attachments: [{ url: LINE_FILE, name: 'ред-файл.pdf' }], type: 'return' }),
  line({ id: 's2', material_name: 'ВЗЕТ РЕД', type: 'return', status: 'taken' }),
  line({ id: 's3', material_name: 'ЛИПСА ЧАКАЩА', type: 'missing' }),
  line({ id: 's4', material_name: 'ЛИПСА ИЗДАДЕНА', type: 'missing', status: 'taken', credit_note_issued: true }),
  line({ id: 's5', material_name: 'НЕФАКТУРИРАН', type: 'not_invoiced' }),
  line({ id: 's6', material_name: 'РЪЧЕН РЕД', report_id: null, type: 'writein' }),
  line({ id: 's7', material_name: 'ЗАПРИХОДЕНА', type: 'writein', status: 'taken' }),
  line({ id: 'i1', report_id: 'rep-i', material_name: 'МЕЖДУСКЛАДОВ ЧАКАЩ', supplier: WH, type: 'return', warehouse_response: 'sent', warehouse_comment: 'КОМЕНТАР НА СКЛАДА' }),
  line({ id: 'i2', report_id: 'rep-i', material_name: 'МЕЖДУСКЛАДОВ ПРИЕТ', supplier: WH, type: 'return', status: 'received', warehouse_response: 'sent' }),
  line({ id: 'i3', report_id: 'rep-i', material_name: 'МЕЖДУСКЛАДОВ ЛИПСА', supplier: WH, type: 'missing', warehouse_response: 'later' })
];

function env(who, tab) {
  const h = boot({
    modules: ['stock-returns.js', 'client-orders.js', 'notifications.js', 'stock-differences.js'], user: USERS[who],
    data: { users: [{ store_name: 'Раднево' }], stores: [{ name: 'Раднево' }], differences_reports: () => clone(REPS), stock_differences: () => clone(LINES),
      stock_diff_swaps: [], contacts: [] }
  });
  h.w.diffReports = clone(REPS); h.w.sdData = clone(LINES); h.w.sdSwaps = [];
  h.w.sdView = 'rows'; h.w.sdDirTab = tab; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.renderStockDiff();
  return h;
}
const wrap = h => h.doc.getElementById('sd-tbl-wrap');
const trs = h => Array.from(h.doc.querySelectorAll('#sd-rows tr'));
/* подпис на бутоните на ред: функция(id) + текст, в реда на DOM-а */
function sig(tr) {
  return Array.from(tr.querySelectorAll('button')).map(b => {
    const oc = (b.getAttribute('onclick') || '').replace(/\s+/g, '');
    const fn = (/^([A-Za-z]+)\(/.exec(oc) || [])[1] + '(' + (b.dataset.id || b.dataset.rid || '') + ')' + (/,'(\w+)'\)/.exec(oc) ? ',' + /,'(\w+)'\)/.exec(oc)[1] : '');
    return fn + ' ' + b.textContent.trim();
  });
}
function snapshot() {
  const out = {};
  for (const who of Object.keys(USERS)) for (const tab of ['supplier', 'interstore']) {
    const h = env(who, tab);
    out[who + '/' + tab] = {};
    trs(h).forEach(tr => {
      const id = tr.querySelector('.sd-name') ? tr.querySelector('.sd-name').textContent : tr.cells[4] && tr.cells[4].textContent;
      out[who + '/' + tab][id] = sig(tr);
    });
    h.close();
  }
  return out;
}

/* Еталонът е снет с --dump от 6797b5b (старата 15-колонна таблица). */
const EXPECTED = DUMP ? null : require('./sd-compact-table.expected.json');

(async function run() {
  if (DUMP) { console.log(JSON.stringify(snapshot(), null, 1)); process.exit(0); }

  section('1. Колони: 7 при доставчик, 8 при междускладов; th = td');
  for (const [tab, n, heads] of [
    ['supplier', 7, ['Тип · Артикул', 'Магазин · Доставчик', 'Кол.', 'Поръчки', 'Статус · Кредитно', 'Коментари · Файлове', 'Действия']],
    ['interstore', 8, ['Тип · Артикул', 'Магазин · Доставчик', 'Кол.', 'Поръчки', 'Статус · Кредитно', 'Коментари · Файлове', 'Склад · Магазин', 'Действия']]]) {
    const h = env('admin', tab);
    const ths = Array.from(wrap(h).querySelectorAll('thead th')).map(t => t.textContent.trim());
    ok(tab + ': ' + n + ' колони в зададения ред', JSON.stringify(ths) === JSON.stringify(heads), ths.join(' | '));
    const rows = trs(h);
    ok(tab + ': има редове', rows.length > 0, String(rows.length));
    ok(tab + ': всеки ред има td = th', rows.every(r => r.cells.length === ths.length), rows.map(r => r.cells.length).join(','));
    ok(tab + ': обвивката е tbl-compact tbl-sd-compact без co-sticky-actions', wrap(h).className.indexOf('tbl-compact tbl-sd-compact') >= 0 && wrap(h).className.indexOf('co-sticky-actions') < 0, wrap(h).className);
    h.close();
  }

  section('2. Всяко поле от старата таблица се вижда в новата (ред s1)');
  {
    const h = env('admin', 'supplier');
    const w = h.w;
    const tr = trs(h).find(r => r.textContent.indexOf('ДЪЛГО ИМЕ') >= 0);
    if (ok('редът s1 е на екрана', !!tr)) {
      const t = tr.textContent;
      ok('името (дълго, цялото)', t.indexOf(LONG) >= 0);
      ok('SAP код', t.indexOf('SAP 1000123') >= 0);
      ok('тип (бадж)', tr.querySelector('.sd-c-item span').textContent.trim() === '↩️ Връщане', tr.querySelector('.sd-c-item span').textContent);
      ok('магазин (удебелен) и доставчик под него', /Раднево/.test(tr.querySelector('.sd-c-who').children[0].textContent) && /ТЕСИ ООД/.test(tr.querySelector('.sd-c-who').children[1].textContent));
      ok('количество', tr.querySelector('.sd-c-qty').textContent.trim() === '5');
      const ord = Array.from(tr.querySelector('.sd-c-ord').children).map(d => d.textContent.trim());
      ok('Поръчка / За връщ. / Потвърд. — три реда с надписи и стойности',
        /^Поръчка\s*4100196440$/.test(ord[0]) && /^За връщ\.\s*4200017097$/.test(ord[1]) && ord[2].indexOf('Потвърд.') === 0 && ord[2].indexOf(w.fmtDate('2026-09-15')) >= 0, JSON.stringify(ord));
      ok('статус (бадж)', tr.querySelector('.sd-st').textContent.trim().length > 0);
      const cm = Array.from(tr.querySelector('.sd-c-cmt').children).map(d => d.textContent.trim());
      ok('коментар Обект', /^Обект\s*КОМЕНТАР ОТ ОБЕКТА$/.test(cm[0]), cm[0]);
      ok('коментар Контролер — без „📎N“ дубликат', /^Контролер\s*КОМЕНТАР НА КОНТРОЛЕРА$/.test(cm[1]) && t.indexOf('📎1') < 0 && !/📎\d/.test(cm[1]), cm[1]);
      ok('файлове: снимката на бланката е линк към файла', !!tr.querySelector('.sd-c-cmt a[href="' + IMG + '"]'));
      ok('файлове: миниатюрата на бланката е 24px', /width:24px;height:24px/.test(tr.querySelector('.sd-c-cmt a[href="' + IMG + '"] img').getAttribute('style')));
      ok('файлове: прикаченият към реда файл е в „Файлове“', !!tr.querySelector('.sd-c-cmt a[href="' + LINE_FILE + '"]'));
    }
    const missing = trs(h).find(r => r.textContent.indexOf('ЛИПСА ЧАКАЩА') >= 0);
    ok('„Липса“: кредитното е под статуса', !!missing && !!missing.querySelector('.sd-c-status .sd-credit') && /Няма/.test(missing.querySelector('.sd-credit').textContent));
    const issued = trs(h).find(r => r.textContent.indexOf('ЛИПСА ИЗДАДЕНА') >= 0);
    ok('„Липса“ с издадено кредитно: „✅ Издадено“', !!issued && /Издадено/.test(issued.querySelector('.sd-credit').textContent));
    const other = trs(h).find(r => r.textContent.indexOf('ВЗЕТ РЕД') >= 0);
    ok('други типове: без кредитно', !!other && !other.querySelector('.sd-credit'));
    h.close();
  }
  {
    const h = env('admin', 'interstore');
    const tr = trs(h).find(r => r.textContent.indexOf('МЕЖДУСКЛАДОВ ЧАКАЩ') >= 0);
    ok('междускладов: „Склад · Магазин“ — отговор на склада и коментарът му', !!tr && tr.querySelector('.sd-c-wh').textContent.indexOf(h.w.WH_RESPONSE_LABELS.sent) >= 0 && tr.querySelector('.sd-c-wh').textContent.indexOf('КОМЕНТАР НА СКЛАДА') >= 0, tr && tr.querySelector('.sd-c-wh').textContent);
    h.close();
  }

  section('3. Бутоните по роли — същият набор като преди (еталон от 6797b5b)');
  {
    const got = snapshot();
    for (const k of Object.keys(EXPECTED)) {
      const g = got[k] || {}, e = EXPECTED[k];
      ok(k + ': същите редове (' + Object.keys(e).length + ')', JSON.stringify(Object.keys(g).sort()) === JSON.stringify(Object.keys(e).sort()), Object.keys(g).join(' | '));
      const bad = Object.keys(e).filter(id => JSON.stringify(g[id]) !== JSON.stringify(e[id]));
      ok(k + ': бутоните на всеки ред — същите и в същия ред', bad.length === 0, bad.map(id => id + ': ' + JSON.stringify(g[id]) + ' ≠ ' + JSON.stringify(e[id])).join(' ; '));
    }
    ok('има какво да се сравнява (поне един ред с бутони при admin/supplier)', Object.keys(EXPECTED['admin/supplier']).some(id => EXPECTED['admin/supplier'][id].length > 0));
    ok('магазин/доставчик има различен набор от admin (ролите наистина се различават)', JSON.stringify(EXPECTED['store/supplier']) !== JSON.stringify(EXPECTED['admin/supplier']));
  }

  section('4. Клик на „✅ Изписана“ и на „Кредитно“ вика същите функции с правилното id');
  {
    const h = env('admin', 'supplier');
    const calls = [];
    h.w.sdMarkTaken = id => calls.push('taken:' + id);
    h.w.sdToggleCreditNote = id => calls.push('credit:' + id);
    const tr = trs(h).find(r => r.textContent.indexOf('ЛИПСА ЧАКАЩА') >= 0);
    const taken = Array.from(tr.querySelectorAll('.sd-c-act button')).find(b => b.textContent.indexOf('Изписана') >= 0);
    const credit = tr.querySelector('.sd-credit button');
    if (ok('има „✅ Изписана“ и бутон „Кредитно“', !!taken && !!credit)) {
      realClick(h.w, taken); realClick(h.w, credit);
      ok('sdMarkTaken(s3) и sdToggleCreditNote(s3)', JSON.stringify(calls) === JSON.stringify(['taken:s3', 'credit:s3']), JSON.stringify(calls));
    }
    h.close();
  }

  section('5. Картата на бланката: вътрешната таблица е в overflow-x:auto');
  {
    const h = env('admin', 'supplier');
    h.w.diffReports = clone(REPS).map(r => Object.assign(r, { reviewed: false }));
    h.w.sdData = clone(LINES).map(l => Object.assign(l, { status: 'new', type: null }));
    h.w.setSDView('reports');
    const card = h.doc.querySelector('[id^="diff-rep-"]');
    const tbl = card && card.querySelector('table');
    ok('има карта с таблица', !!tbl);
    ok('таблицата е в div с overflow-x:auto', !!tbl && tbl.parentElement.tagName === 'DIV' && /overflow-x:auto/.test(tbl.parentElement.getAttribute('style')), tbl && tbl.parentElement.outerHTML.slice(0, 80));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
