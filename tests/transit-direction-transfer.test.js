/* „Стока на път": трансферът между магазини печели пред изпращащия код на завода.

   parseTransitRows() проверяваше първо дали заводът е с „изпращащ" код
   (PLANT_OUTGOING) и чак после дали доставчикът е реален магазин. Така
   SAP ред със завод 6512 (Търговище) и доставчик 6516 Добрич ставаше
   'outgoing' вместо 'transfer' — получателят виждаше само „Изпратена" /
   „Неприето" и нямаше „Прието". В базата ~50 такива реда; документ
   4600185282 от 14.08.2026 носи 26 от тях.

   Тестът минава през реалния parseTransitRows() с редове в „new" формат
   (18 колони, с header), чете _transitImportRows, проверява прегледа и
   натиска истинския бутон „Импортирай", за да види посоката в POST тялото.

   Пускане:  node tests/transit-direction-transfer.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};

const HEADER = ['Завод', 'Склад', 'Доставчик', 'Документ', 'Позиция', 'Вид', 'Търг.орг',
  'Снаб.гр', 'Инд', 'История', 'Дата', 'Материал', 'Текст', 'Гр.мат', 'Кат', 'Кол', 'МЕ', 'Остатък'];

/* 18 колони: Завод(0) Доставчик(2) Документ(3) Позиция(4) Дата(10)
   Материал(11) Текст(12) Кол(15) МЕ(16) Остатък(17) */
function sapRow(plant, supplier, doc, pos, mat) {
  return [plant, '0001', supplier, doc, pos, 'NB', '1000', '100', '', '',
    '14.08.2026', mat, 'Материал ' + mat, 'GR', 'K', 10, 'бр.', 4];
}

const ROWS = [
  HEADER,
  /* 1: изпращащ код на завода + реален магазин доставчик — ПОПРАВКАТА */
  sapRow('6512', '6516       Добрич', '4600185282', 10, 'M-1'),
  /* 2: получаващ код + реален магазин — трансфер и досега */
  sapRow('5512', '6516 Добрич', '4600185283', 20, 'M-2'),
  /* 3: получаващ код + склад — incoming */
  sapRow('5512', '5518 Логистичен склад Добрич', '4600185284', 30, 'M-3'),
  /* 4: изпращащ код + склад — остава outgoing */
  sapRow('6512', '5505 Логистичен склад Търговище', '4600185285', 40, 'M-4')
];

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js'],
    user: ADMIN,
    data: { goods_transit: [], stores: [], users: [] }
  });
  /* confirmTransitImport() вика fetch направо (batch INSERT), не sbPost. */
  h.posts = [];
  h.w.fetch = function (url, opts) {
    if (opts && opts.method === 'POST') h.posts.push({ url: String(url), body: opts.body });
    return Promise.resolve({
      ok: true, status: 201,
      headers: { get: function (k) { return /content-range/i.test(k) ? '0-0/0' : null; } },
      json: function () { return Promise.resolve([]); },
      text: function () { return Promise.resolve('[]'); }
    });
  };
  h.w.transitData = [];
  return h;
}

const byDoc = (rows, doc) => rows.filter(r => r.purchase_doc === doc)[0];

(async function run() {

  section('а) Посоката от реалния parseTransitRows()');
  {
    const h = env();
    ok('детекторът разпознава „new" формата', h.w.detectSapFormat(ROWS) === 'new');
    if (guard('parseTransitRows() не хвърля', () => h.w.parseTransitRows(ROWS))) {
      const parsed = h.w._transitImportRows;
      ok('разпознати са точно 4 реда (header-ът е пропуснат)', parsed.length === 4, parsed.length);

      const r1 = byDoc(parsed, '4600185282');
      ok('6512 ← 6516 Добрич → transfer', r1 && r1.direction === 'transfer', r1 && r1.direction);
      ok('  получателят е Търговище', r1 && r1.store_name === 'Търговище', r1 && r1.store_name);
      ok('  подателят е Добрич', r1 && r1.supplier === 'Добрич', r1 && r1.supplier);

      const r2 = byDoc(parsed, '4600185283');
      ok('5512 ← 6516 Добрич → transfer (без регресия)', r2 && r2.direction === 'transfer', r2 && r2.direction);

      const r3 = byDoc(parsed, '4600185284');
      ok('5512 ← 5518 Логистичен склад Добрич → incoming', r3 && r3.direction === 'incoming', r3 && r3.direction);

      const r4 = byDoc(parsed, '4600185285');
      ok('6512 ← 5505 Логистичен склад Търговище → outgoing', r4 && r4.direction === 'outgoing', r4 && r4.direction);
      ok('  получателят пак е Търговище', r4 && r4.store_name === 'Търговище', r4 && r4.store_name);
    }
  }

  section('б) Магазин не е „трансфер" сам към себе си');
  {
    /* Граничният случай на условието supplierResolvedName!==store: 6512 и
       5512 са един и същ обект. Без трансфер тук изпращащият код решава. */
    const h = env();
    const rows = [HEADER,
      sapRow('6512', '5512 Търговище', 'D-SELF-OUT', 1, 'S-1'),
      sapRow('5512', '6512 Търговище', 'D-SELF-IN', 2, 'S-2')];
    if (guard('parseTransitRows() не хвърля', () => h.w.parseTransitRows(rows))) {
      const p = h.w._transitImportRows;
      ok('6512 ← 5512 Търговище → outgoing, не transfer',
        byDoc(p, 'D-SELF-OUT') && byDoc(p, 'D-SELF-OUT').direction === 'outgoing',
        byDoc(p, 'D-SELF-OUT') && byDoc(p, 'D-SELF-OUT').direction);
      ok('5512 ← 6512 Търговище → incoming, не transfer',
        byDoc(p, 'D-SELF-IN') && byDoc(p, 'D-SELF-IN').direction === 'incoming',
        byDoc(p, 'D-SELF-IN') && byDoc(p, 'D-SELF-IN').direction);
    }
  }

  section('в) Прегледът и истинският клик „Импортирай"');
  {
    const h = env();
    guard('parseTransitRows()', () => h.w.parseTransitRows(ROWS));
    const ov = h.doc.getElementById('transit-import-ov');
    if (ok('прегледът се отваря', !!ov)) {
      const txt = ov.textContent;
      ok('трансферите в прегледа са 2 реда', /ТРАНСФЕРИ МЕЖДУ МАГАЗИНИ[^—]*— 2 реда/.test(txt), txt.slice(0, 200));
      ok('outgoing в прегледа е 1 ред', /ИЗПРАЩАМ \(outgoing\) — 1 реда/.test(txt));
      ok('получавам в прегледа е 1 ред', /ПОЛУЧАВАМ \(от склад\) — 1 реда/.test(txt));

      const imp = btn(ov, 'Импортирай');
      if (ok('бутонът „Импортирай" съществува', !!imp)) {
        realClick(h.w, imp, 'Импортирай');
        await ticks();
        const post = h.posts.filter(p => /goods_transit/.test(p.url))[0];
        if (ok('кликът праща POST към goods_transit', !!post, h.posts.map(p => p.url).join(' | '))) {
          const body = JSON.parse(post.body);
          ok('в тялото са 4 реда', body.length === 4, body.length);
          const b1 = body.filter(r => r.purchase_doc === '4600185282')[0];
          ok('записаната посока за 6512 ← Добрич е transfer', b1 && b1.direction === 'transfer', b1 && b1.direction);
          ok('  със статус pending (подателят маркира „Изпратена")', b1 && b1.status === 'pending', b1 && b1.status);
          const b4 = body.filter(r => r.purchase_doc === '4600185285')[0];
          ok('записаната посока за 6512 ← склад е outgoing', b4 && b4.direction === 'outgoing', b4 && b4.direction);
        }
      }
    }
  }

  report();
})();
