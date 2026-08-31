/* Разлики: добавяне на снимка към ВЕЧЕ подадена бланка.

   Снимките на бланката (differences_reports.photos) досега се пълнеха САМО
   при подаване, през diffPendingPhotos. Пропусната снимка нямаше как да
   догони бланката. Тук се заковават новият бутон в картона на бланката
   (canAttachDiffReport) и качването (sdUploadReportPhoto).

   Кука за търсене е [data-add-photo-rid] — НЕ 'label' или 'div'. Картонът е
   пълен с етикети и обвивки, така че търсене по таг би връщало попадение и
   когато бутонът липсва, тоест тестът щеше да лъже.

   Пускане:  node tests/diff-report-photo-add.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const JPG_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/differences/1785914046488_0wo4k9.jpg';

function row(o) {
  return Object.assign({
    store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    quantity_received: null, order_number: null, confirmed_date: null,
    comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    type: null, status: 'new',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

function rep(o) {
  return Object.assign({
    id: 'rep-a', direction: 'supplier', store_name: 'Раднево',
    counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-08-17',
    submitted_by: 'Склад Раднево', general_comment: '',
    created_at: '2026-08-17T08:14:18.000Z',
    photos: [{ url: JPG_URL, name: 'IMG_2202.jpeg' }], reviewed: false
  }, o);
}

/* Бланка на Раднево със снимка; бланка на друг магазин; бланка без снимки. */
const REP_MINE   = rep({ id: 'rep-a' });
const REP_OTHER  = rep({ id: 'rep-b', store_name: 'Хасково' });
const REP_NOPICS = rep({ id: 'rep-c', photos: [] });

const LINE_A = row({ id: 'l-a1', report_id: 'rep-a' });
const LINE_B = row({ id: 'l-b1', report_id: 'rep-b', store_name: 'Хасково' });
const LINE_C = row({ id: 'l-c1', report_id: 'rep-c' });

const MANAGER = {
  email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'manager', store_name: 'Раднево'
};
const ACCOUNTING = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'accounting', store_name: 'Централен офис'
};

function env(user, rows, reports) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: {
      stock_differences: rows, differences_reports: reports,
      stock_returns: [], transport_orders: [], users: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  return h;
}

/* Единственият допустим начин за търсене на контрола. */
const addCtrl = (doc, id) => doc.querySelector('[data-add-photo-rid="' + id + '"]');

/* Липсваща функция трябва да ПАДНЕ като проверка, не да убие процеса преди
   report() — иначе изходът остава с нула ❌ и изглежда чист. */
const canAttach = (w, r) => typeof w.canAttachDiffReport === 'function'
  ? w.canAttachDiffReport(r) : '<canAttachDiffReport липсва>';
const doUpload = (w, inp, id) => {
  if (typeof w.sdUploadReportPhoto !== 'function') return false;
  w.sdUploadReportPhoto(inp, id);
  return true;
};

/* Фалшив вход за sdUploadReportPhoto — един файл. Типът е нарочно НЕ
   image/*: diffCompressImage връща файла непроменен, вместо да чака
   img.onload, който в jsdom никога не идва (няма зареждане на ресурси). */
function fakeInput(w, name, type) {
  const file = new w.File([new w.Uint8Array([1, 2, 3])], name, { type: type || 'application/pdf' });
  return { files: [file], value: 'C:\\fakepath\\' + name };
}

(async function run() {

  section('0. Средата се вдига и новите имена са налице');
  {
    const { w } = env(MANAGER, [], []);
    ok('canAttachDiffReport съществува', typeof w.canAttachDiffReport === 'function');
    ok('sdUploadReportPhoto съществува', typeof w.sdUploadReportPhoto === 'function');
    ok('canAttachSDLine не е пипан', typeof w.canAttachSDLine === 'function');
    ok('diffUploadPhoto не е пипан', typeof w.diffUploadPhoto === 'function');
  }

  section('1. Магазинен потребител — контролът е в картона на СВОЯТА бланка');
  {
    const { w, doc } = env(MANAGER, [LINE_A], [REP_MINE]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const el = addCtrl(doc, 'rep-a');
      if (ok('контролът присъства', !!el)) {
        ok('надписът е „📷 Добави снимка"',
          (el.textContent || '').indexOf('📷 Добави снимка') >= 0,
          JSON.stringify((el.textContent || '').trim()));
        ok('title обяснява какво прави',
          el.getAttribute('title') === 'Добави пропусната снимка към бланката',
          String(el.getAttribute('title')));
        const inp = el.querySelector('input[type="file"]');
        if (ok('носи скрит <input type="file">', !!inp)) {
          ok('onchange вика sdUploadReportPhoto с id-то на бланката',
            (inp.getAttribute('onchange') || '') === 'sdUploadReportPhoto(this,this.dataset.rid)',
            String(inp.getAttribute('onchange')));
          ok('input носи data-rid на бланката', inp.getAttribute('data-rid') === 'rep-a');
          ok('accept е същият списък като по ред',
            (inp.getAttribute('accept') || '') ===
            '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx',
            String(inp.getAttribute('accept')));
        }
        ok('старите миниатюри са запазени',
          doc.querySelectorAll('img[src="' + JPG_URL + '"]').length > 0);
      }
    }
  }

  section('2. Същият потребител, ЧУЖДА бланка — контролът липсва');
  {
    const { w, doc } = env(MANAGER, [LINE_B], [REP_OTHER]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('картонът на чуждата бланка е рендиран', !!doc.getElementById('diff-rep-rep-b'));
      ok('контролът НЕ присъства', !addCtrl(doc, 'rep-b'));
      ok('нито един контрол за добавяне изобщо',
        doc.querySelectorAll('[data-add-photo-rid]').length === 0,
        String(doc.querySelectorAll('[data-add-photo-rid]').length));
      ok('canAttachDiffReport() казва false',
        canAttach(w, { store_name: 'Хасково' }) === false);
    }
  }

  section('3. Бланка БЕЗ нито една снимка — контролът пак присъства');
  {
    const { w, doc } = env(MANAGER, [LINE_C], [REP_NOPICS]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('контролът присъства и при photos = []', !!addCtrl(doc, 'rep-c'));
    }
  }

  section('4. Роля accounting — контролът присъства и по чужда бланка');
  {
    const { w, doc } = env(ACCOUNTING, [LINE_B], [REP_OTHER]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('контролът присъства по бланка на Хасково', !!addCtrl(doc, 'rep-b'));
      ok('canAttachDiffReport() казва true',
        canAttach(w, { store_name: 'Хасково' }) === true);
    }
  }

  section('5. Функционално качване — patch добавя, а не презаписва');
  {
    const { w } = env(MANAGER, [LINE_A], [REP_MINE]);
    const uploads = [];
    w.fetch = function (url, opt) {
      uploads.push({ url: url, opt: opt });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    const patches = [];
    w.sbPatch = function (table, q, body) {
      patches.push({ table: table, q: q, body: body });
      return Promise.resolve({ ok: true, status: 204 });
    };
    w.renderStockDiff = function () {};

    const inp = fakeInput(w, 'стокова разписка.pdf');
    ok('sdUploadReportPhoto е извикуема', doUpload(w, inp, 'rep-a'));
    await ticks(8);

    ok('input.value е изчистен веднага', inp.value === '', JSON.stringify(inp.value));
    ok('качването е тръгнало към storage-а', uploads.length === 1, String(uploads.length));
    if (uploads.length) {
      ok('пътят е с префикс differences/',
        uploads[0].url.indexOf('/object/bulletin-files/differences/') > 0, uploads[0].url);
      ok('НЕ ползва префикса stock-differences/',
        uploads[0].url.indexOf('/differences/') > 0 &&
        uploads[0].url.indexOf('/stock-differences/') < 0, uploads[0].url);
    }

    if (ok('sbPatch е извикан веднъж', patches.length === 1, String(patches.length))) {
      const p = patches[0];
      ok('таблицата е differences_reports', p.table === 'differences_reports', String(p.table));
      ok('филтърът е по id на бланката', p.q === 'id=eq.rep-a', String(p.q));
      const arr = p.body && p.body.photos;
      if (ok('подадено е поле photos с масив', Array.isArray(arr))) {
        ok('масивът е СТАРИТЕ + един нов', arr.length === 2, String(arr.length));
        ok('старата снимка е запазена', arr[0] && arr[0].url === JPG_URL);
        const nw = arr[1] || {};
        ok('новият елемент има ключ url', typeof nw.url === 'string' && nw.url.length > 0);
        ok('новият елемент има ключ name', nw.name === 'стокова разписка.pdf', String(nw.name));
        ok('форматът е {url,name}, НЕ {type,filename}',
          Object.keys(nw).sort().join(',') === 'name,url', Object.keys(nw).join(','));
      }
      ok('локалният запис е обновен',
        w.diffReports[0].photos && w.diffReports[0].photos.length === 2,
        String(w.diffReports[0].photos && w.diffReports[0].photos.length));
    }
  }

  section('6. Провалено качване — sbPatch НЕ се вика изобщо');
  {
    const { w } = env(MANAGER, [LINE_A], [REP_MINE]);
    w.fetch = function () {
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) });
    };
    const patches = [];
    w.sbPatch = function (t, q, b) { patches.push({ t: t, q: q, b: b }); return Promise.resolve({ ok: true }); };
    w.renderStockDiff = function () {};

    ok('sdUploadReportPhoto е извикуема', doUpload(w, fakeInput(w, 'провал.pdf'), 'rep-a'));
    await ticks(8);

    ok('sbPatch НЕ е извикан', patches.length === 0, String(patches.length));
    ok('снимките на бланката са непроменени',
      w.diffReports[0].photos.length === 1, String(w.diffReports[0].photos.length));
  }

  section('7. Непозната бланка / липсващ файл — тих изход, без заявки');
  {
    const { w } = env(MANAGER, [LINE_A], [REP_MINE]);
    const uploads = [];
    w.fetch = function (u) { uploads.push(u); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
    const patches = [];
    w.sbPatch = function () { patches.push(1); return Promise.resolve({ ok: true }); };

    guard('празен input не хвърля', () => doUpload(w, { files: [], value: '' }, 'rep-a'));
    guard('непознато id не хвърля', () => doUpload(w, fakeInput(w, 'x.pdf'), 'rep-ZZZ'));
    await ticks(8);
    ok('нито едно качване', uploads.length === 0, String(uploads.length));
    ok('нито един patch', patches.length === 0, String(patches.length));
  }

  report();
})();
