/* Вътрешният коментар (resolution_comment) НЕ отива при доставчика.

   diffEmailBodyHtml() рендираше блок „💬 Коментар:", събран от
   resolution_comment на всички редове. Това е бележката на счетоводството
   към МАГАЗИНА — реално изпратено писмо е носило „Няма качена стокова на
   доставчика! 1 бр е изписан- 4200017186". Излизаше навън при всяко
   изпращане, без някой да го е искал.

   ДВАТА ПЪТЯ СЕ ПРОВЕРЯВАТ ОТДЕЛНО. Функцията храни и предварителния
   преглед в модала, и самото изпращане. Ако някой „скрие" блока само в
   прегледа, доставчикът пак ще го получи, а изпращачът няма да разбере —
   затова тестът гледа и изхода на функцията, и рендирания модал.

   Пускане:  node tests/diff-email-internal-comment.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

/* Дословно от реално изпратено писмо — това е низът, който не бива да
   излиза навън. */
const INTERNAL_1 = 'Няма качена стокова на доставчика! 1 бр е изписан- 4200017186';
const INTERNAL_2 = 'Изчаква се кредитно известие, не плащай фактурата';
/* Коментарът на МАГАЗИНА — той е за доставчика и трябва да остане. */
const STORE_1 = 'Липсват 3 броя при приемането';
const STORE_2 = 'Кашонът беше разкъсан';
const GENERAL = 'Моля потвърдете получаването до петък';
const NOTE = 'Свободен текст от изпращача';

function line(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-1',
    store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ',
    quantity: 5, quantity_supplier_doc: 3, quantity_received: 2,
    type: 'return', status: 'pending',
    order_number: null, confirmed_date: null,
    comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    resolved_by: 'Цветелина Тенева', resolved_at: '2026-08-19T12:13:19.000Z',
    completed_by: null, completed_at: null,
    warehouse_response: null, warehouse_comment: null, store_corrected_at: null
  }, o);
}

const LINES = [
  line({ id: 'l-1', material_name: 'ПЛАНКА ЪГЛОВА', comment: STORE_1, resolution_comment: INTERNAL_1 }),
  line({ id: 'l-2', material_name: 'БАТЕРИЯ DURACELL', comment: STORE_2, resolution_comment: INTERNAL_2 })
];

const REP = {
  id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966',
  doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
  general_comment: GENERAL, created_at: '2026-08-17T08:14:18.000Z',
  photos: [], reviewed: false
};

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function env() {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: CVETI,
    data: {
      stock_differences: LINES, differences_reports: [REP],
      stock_returns: [], transport_orders: [], users: [], stores: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(LINES));
  h.w.diffReports = [JSON.parse(JSON.stringify(REP))];
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  h.rep = JSON.parse(JSON.stringify(REP));
  h.lines = JSON.parse(JSON.stringify(LINES));
  return h;
}

(function run() {

  section('1. Тялото на писмото — вътрешният коментар го няма');
  {
    const h = env();
    let body = '';
    if (guard('diffEmailBodyHtml() не хвърля',
      () => { body = h.w.diffEmailBodyHtml(h.rep, h.lines, NOTE); })) {

      ok('тялото е рендирано', body.length > 0);
      ok('НЯМА първия вътрешен коментар', body.indexOf(INTERNAL_1) < 0);
      ok('НЯМА втория вътрешен коментар', body.indexOf(INTERNAL_2) < 0);
      /* Заглавието на блока си отива заедно със съдържанието — остане ли
         празно „💬 Коментар:", читателят пита какво липсва. */
      ok('НЯМА маркера 💬', body.indexOf('💬') < 0);
      /* Част от низа, за да не мине проверката при частично изтичане. */
      ok('НЯМА и фрагмент от вътрешния текст',
        body.indexOf('4200017186') < 0 && body.indexOf('кредитно известие') < 0);
    }
    h.close();
  }

  section('2. Това, което Е за доставчика, си остава');
  {
    const h = env();
    let body = '';
    if (guard('diffEmailBodyHtml() не хвърля',
      () => { body = h.w.diffEmailBodyHtml(h.rep, h.lines, NOTE); })) {

      /* Ако тези паднат, махнат е ГРЕШНИЯТ коментар. */
      ok('коментарът на магазина (ред 1) присъства', body.indexOf(STORE_1) >= 0);
      ok('коментарът на магазина (ред 2) присъства', body.indexOf(STORE_2) >= 0);
      ok('general_comment присъства', body.indexOf(GENERAL) >= 0);
      ok('note присъства', body.indexOf(NOTE) >= 0);
      /* Останалото съдържание на писмото не е пипано. */
      ok('таблицата е налице', body.indexOf('ПЛАНКА ЪГЛОВА') >= 0 &&
        body.indexOf('БАТЕРИЯ DURACELL') >= 0);
      ok('подписът е налице', body.indexOf('ТеМАХ') >= 0);
      ok('колоната „По стокова на дост." е налице (посока доставчик)',
        body.indexOf('По стокова на дост.') >= 0);
    }
    h.close();
  }

  section('3. Предварителният преглед е ВЕРЕН на изпратеното');
  {
    /* Същият текст, минал през модала. Разминаване тук значи, че някой е
       направил блока условен вместо да го махне. */
    const h = env();
    let modal = '';
    if (guard('diffEmailModalHtml() не хвърля',
      () => { modal = h.w.diffEmailModalHtml(h.rep, h.lines); })) {

      ok('модалът е рендиран', modal.length > 0);
      ok('прегледът НЯМА първия вътрешен коментар', modal.indexOf(INTERNAL_1) < 0);
      ok('прегледът НЯМА втория вътрешен коментар', modal.indexOf(INTERNAL_2) < 0);
      ok('прегледът НЯМА маркера 💬', modal.indexOf('💬') < 0);
      ok('прегледът показва коментара на магазина', modal.indexOf(STORE_1) >= 0);
      ok('прегледът показва general_comment', modal.indexOf(GENERAL) >= 0);
    }
    h.close();
  }

  section('4. Явната бележка в модала');
  {
    /* Тихата липса подвежда колкото тихото изпращане: без този ред Цвети
       пише вътрешния коментар и предполага, че доставчикът го чете. */
    const h = env();
    const doc = h.w.document;
    let modal = '';
    if (guard('diffEmailModalHtml() не хвърля',
      () => { modal = h.w.diffEmailModalHtml(h.rep, h.lines); })) {

      const box = doc.createElement('div');
      box.innerHTML = modal;
      const el = box.querySelector('#de-internal-note');
      if (ok('редът #de-internal-note съществува', !!el)) {
        ok('казва точно това',
          (el.textContent || '').indexOf(
            'Вътрешните коментари по редовете не се изпращат на доставчика') >= 0,
          el.textContent);
      }
      /* Съседният ред за снимките не е пипан. */
      ok('редът за снимките е още там', !!box.querySelector('#de-photos-note'));
      ok('полето „Съдържание" е още там', !!box.querySelector('#de-body-note'));
    }
    h.close();
  }

  section('5. Вътре в портала коментарът СИ ОСТАВА видим');
  {
    /* Махането е само от писмото. Изчезне ли и от таба, счетоводството губи
       собствената си бележка — това би било по-лошо от изтичането. */
    const h = env();
    const doc = h.w.document;
    if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      const txt = doc.getElementById('mod-stock-diff').textContent || '';
      ok('таблицата в таба показва първия вътрешен коментар',
        txt.indexOf(INTERNAL_1) >= 0);
      ok('таблицата в таба показва втория вътрешен коментар',
        txt.indexOf(INTERNAL_2) >= 0);
      ok('таблицата показва и коментара на магазина', txt.indexOf(STORE_1) >= 0);
    }
    h.close();
  }

  report();
})();
