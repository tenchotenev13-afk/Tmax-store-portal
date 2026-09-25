/* Товарни листи — настройките на скенера (html5-qrcode) срещу гланц.

   Гланцираното фолио отразява лампата върху черните линии и автофокусът
   „ловува" по отблясъка. Тук се заковава КАКВО се подава на библиотеката и
   КЪДЕ — камерата и самата библиотека в jsdom ги няма, затова Html5Qrcode е
   фалшив клас, който само записва извикванията.

   Тихите грешки, които се пазят:
     · formatsToSupport / experimentalFeatures подадени на start() вместо на
       конструктора — html5-qrcode 2.3.8 ги пренебрегва там МЪЛЧАЛИВО;
     · applyVideoConstraints хвърля (синхронно) или отхвърля (телефонът не
       поддържа zoom/torch) — това не бива да спре сканирането;
     · фенерът се показва на телефон без фенер — бутон, който не прави нищо;
     · подсказката изчезва при първото сканиране, защото е в панела, който
       се пренаписва.

   Пускане:  node tests/loading-lists-scanner-config.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
/* Числата не значат нищо — важно е, че са РАЗЛИЧНИ и QR_CODE го няма в списъка. */
const FORMATS = { QR_CODE: 0, CODE_128: 5, EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15, ITF: 8 };

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: WAREHOUSE, confirm: true,
    data: {
      product_catalog: [], goods_transit: [],
      users: [{ store_name: 'Петрич' }, { store_name: WH }],
      loading_lists: [], loading_list_items: [], loading_list_products: [],
      stores: [], contacts: [], transport_orders: [],
      /* „📷 Сканирай" е зад app_settings 'loading_scan' (по подразбиране
         ИЗКЛЮЧЕН, 25.09.2026). Този тест описва ВКЛЮЧЕНИЯ скенер, затова
         флагът е изричен. Изключеното състояние е в loading-scan-toggle. */
      app_settings: [{ key: 'loading_scan', value: 'on' }],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  const rec = { ctor: [], start: [], apply: [], pause: 0, resume: 0, stop: 0, inst: null };
  function MockH5Q(id, cfg) { rec.ctor.push({ id: id, cfg: cfg }); rec.inst = this; }
  MockH5Q.prototype.start = function (cam, cfg, okCb, errCb) {
    rec.start.push({ cam: cam, cfg: cfg });
    this._ok = okCb;
    if (opts.startFail) return Promise.reject('NotAllowedError');
    if (opts.startDeferred) return new Promise(r => { rec.releaseStart = r; });
    return Promise.resolve();
  };
  MockH5Q.prototype.applyVideoConstraints = function (c) {
    rec.apply.push(JSON.parse(JSON.stringify(c)));
    const mode = typeof opts.apply === 'function' ? opts.apply(c) : (opts.apply || 'ok');
    if (mode === 'throw') throw 'Scanning is not in running state';
    if (mode === 'reject') return Promise.reject(new Error('OverconstrainedError'));
    return Promise.resolve();
  };
  MockH5Q.prototype.getRunningTrackCapabilities = function () {
    if (opts.capsThrow) throw 'no track';
    return opts.caps === undefined ? {} : opts.caps;
  };
  MockH5Q.prototype.pause = function () { rec.pause++; };
  MockH5Q.prototype.resume = function () { rec.resume++; };
  MockH5Q.prototype.stop = function () { rec.stop++; return Promise.resolve(); };
  MockH5Q.prototype.clear = function () {};
  h.w.Html5Qrcode = MockH5Q;
  h.w.Html5QrcodeSupportedFormats = FORMATS;
  h.rec = rec;
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
async function openScanner(h) {
  h.w.llNewList();
  await ticks(); await ticks();
  /* Празните редове от новия лист не участват — тестът е за скенера. */
  h.w.llDraft.items = [];
  h.w.llAddFreeRow();
  h.w.llOpenScanner(0);
  await ticks(); await ticks(); await ticks();
}
const $ = (h, id) => h.doc.getElementById(id);

(async function () {

  section('а) Конструкторът: само линейните формати и родният BarcodeDetector');
  {
    const h = env({ caps: { zoom: { min: 1, max: 8 }, torch: true } });
    await openScanner(h);
    if (ok('Html5Qrcode е създаден веднъж', h.rec.ctor.length === 1, String(h.rec.ctor.length))) {
      const c = h.rec.ctor[0];
      ok('в контейнера ll-scan-view', c.id === 'll-scan-view', c.id);
      ok('formatsToSupport = EAN_13, EAN_8, UPC_A, UPC_E, CODE_128',
        JSON.stringify(c.cfg.formatsToSupport) === JSON.stringify([9, 10, 14, 15, 5]), JSON.stringify(c.cfg.formatsToSupport));
      ok('БЕЗ QR_CODE', c.cfg.formatsToSupport.indexOf(FORMATS.QR_CODE) < 0);
      ok('experimentalFeatures.useBarCodeDetectorIfSupported = true',
        c.cfg.experimentalFeatures && c.cfg.experimentalFeatures.useBarCodeDetectorIfSupported === true,
        JSON.stringify(c.cfg.experimentalFeatures));
    }
    /* html5-qrcode 2.3.8 чете тези две ОТ КОНСТРУКТОРА; в start() би ги
       пренебрегнал без грешка. */
    const sc = h.rec.start[0] && h.rec.start[0].cfg;
    ok('start() НЕ носи formatsToSupport', sc && !('formatsToSupport' in sc), JSON.stringify(Object.keys(sc || {})));
    ok('start() НЕ носи experimentalFeatures', sc && !('experimentalFeatures' in sc));
  }

  section('б) start(): 15 кадъра, широка ниска рамка, висока резолюция, непрекъснат фокус');
  {
    const h = env({ caps: {} });
    await openScanner(h);
    const st = h.rec.start[0];
    if (ok('start() е извикан', !!st)) {
      ok('първият аргумент — задната камера', JSON.stringify(st.cam) === JSON.stringify({ facingMode: 'environment' }),
        JSON.stringify(st.cam));
      ok('fps 15', st.cfg.fps === 15, String(st.cfg.fps));
      ok('qrbox е функция от визьора', typeof st.cfg.qrbox === 'function', typeof st.cfg.qrbox);
      const b = st.cfg.qrbox(400, 300);
      ok('~85% ширина × 30% височина (400×300 → 340×90)', b.width === 340 && b.height === 90, JSON.stringify(b));
      const t = st.cfg.qrbox(40, 40);
      ok('под 50px — долна граница 50 (библиотеката отказва по-малка)', t.width === 50 && t.height === 50, JSON.stringify(t));
      const vc = st.cfg.videoConstraints || {};
      ok('videoConstraints.facingMode = environment', vc.facingMode === 'environment', JSON.stringify(vc));
      ok('ideal 1920 × 1080', vc.width && vc.width.ideal === 1920 && vc.height && vc.height.ideal === 1080, JSON.stringify(vc));
      ok('advanced: focusMode continuous', Array.isArray(vc.advanced) && vc.advanced[0].focusMode === 'continuous',
        JSON.stringify(vc.advanced));
      /* Нищо задължително: exact/min би дало OverconstrainedError и камера изобщо. */
      ok('без exact/min/max — само ideal и advanced', !/"(exact|min|max)"/.test(JSON.stringify(vc)), JSON.stringify(vc));
    }
  }

  section('в) След старта: фокус + зум 2 върху живия трак, по възможностите му');
  {
    const h = env({ caps: { zoom: { min: 1, max: 8 } } });
    await openScanner(h);
    ok('applyVideoConstraints е извикан веднъж', h.rec.apply.length === 1, JSON.stringify(h.rec.apply));
    ok('с focusMode continuous и zoom 2',
      JSON.stringify(h.rec.apply[0]) === JSON.stringify({ advanced: [{ focusMode: 'continuous' }, { zoom: 2 }] }),
      JSON.stringify(h.rec.apply[0]));

    const h2 = env({ caps: { zoom: { min: 1, max: 1.5 } } });
    await openScanner(h2);
    ok('максимум 1.5 → зум 1.5, не 2', JSON.stringify(h2.rec.apply[0].advanced[1]) === JSON.stringify({ zoom: 1.5 }),
      JSON.stringify(h2.rec.apply[0]));

    const h3 = env({ caps: { focusMode: ['continuous'] } });
    await openScanner(h3);
    ok('тракът казва, че зум няма → не се иска', JSON.stringify(h3.rec.apply[0]) ===
      JSON.stringify({ advanced: [{ focusMode: 'continuous' }] }), JSON.stringify(h3.rec.apply[0]));

    const h4 = env({ capsThrow: true });
    await openScanner(h4);
    ok('възможностите неизвестни → опитва зум 2', JSON.stringify(h4.rec.apply[0]) ===
      JSON.stringify({ advanced: [{ focusMode: 'continuous' }, { zoom: 2 }] }), JSON.stringify(h4.rec.apply[0]));
  }

  section('г) applyVideoConstraints ХВЪРЛЯ / ОТХВЪРЛЯ — сканирането продължава');
  {
    for (const mode of ['throw', 'reject']) {
      const h = env({ caps: { zoom: { min: 1, max: 8 } }, apply: mode });
      let crashed = null;
      try { await openScanner(h); await ticks(); } catch (e) { crashed = e; }
      ok(mode + ': нищо не излиза навън', crashed === null, String(crashed));
      ok(mode + ': модалът е отворен', !!$(h, 'll-scan-modal'));
      ok(mode + ': скенерът е жив', !!h.w.llScan && h.w.llScan.inst === h.rec.inst);
      ok(mode + ': без червено за потребителя — не е негова грешка',
        !h.toasts.some(t => t.col === '#dc2626'), JSON.stringify(h.toasts));
      /* Прочетен код след провала — стига до обработката. */
      const before = h.calls.get.filter(u => /product_catalog/.test(u)).length;
      h.rec.inst._ok('3800001000011');
      await ticks(); await ticks();
      ok(mode + ': прочетен код се обработва', h.calls.get.filter(u => /product_catalog/.test(u)).length === before + 1,
        h.calls.get.filter(u => /product_catalog/.test(u)).join(' | '));
      ok(mode + ': камерата е спряна на пауза за бройките', h.rec.pause >= 1, String(h.rec.pause));
    }
  }

  section('д) 🔦 Фенер — само ако тракът го има; вкл./изкл.; провалът е жълт');
  {
    const h = env({ caps: { torch: true } });
    await openScanner(h);
    const tb = () => $(h, 'll-scan-torch');
    ok('бутонът е видим', !!tb() && tb().style.display !== 'none', tb() && tb().style.display);
    realClick(h.w, tb());
    await ticks(); await ticks();
    ok('включва: advanced torch true', JSON.stringify(h.rec.apply[h.rec.apply.length - 1]) ===
      JSON.stringify({ advanced: [{ torch: true }] }), JSON.stringify(h.rec.apply));
    ok('етикетът става „Изключи"', /Изключи/.test(tb().textContent), tb().textContent);
    ok('състоянието е вкл.', h.w.llScan.torch === true);
    realClick(h.w, tb());
    await ticks(); await ticks();
    ok('изключва: torch false', JSON.stringify(h.rec.apply[h.rec.apply.length - 1]) ===
      JSON.stringify({ advanced: [{ torch: false }] }));
    ok('и етикетът се връща', /Фенер/.test(tb().textContent), tb().textContent);

    const hNo = env({ caps: { zoom: { min: 1, max: 4 } } });
    await openScanner(hNo);
    ok('без torch в възможностите — бутонът е скрит', $(hNo, 'll-scan-torch').style.display === 'none',
      $(hNo, 'll-scan-torch').style.display);
    const n0 = hNo.rec.apply.length;
    await hNo.w.llScanToggleTorch();
    ok('и извикан наум не прави нищо', hNo.rec.apply.length === n0);

    const hBad = env({ caps: { torch: true }, apply: c => (c.advanced && c.advanced[0] && 'torch' in c.advanced[0]) ? 'reject' : 'ok' });
    await openScanner(hBad);
    realClick(hBad.w, $(hBad, 'll-scan-torch'));
    await ticks(); await ticks();
    ok('отказан фенер — жълт toast', hBad.toasts.some(t => /Фенерът не се включи/.test(t.msg) && t.col === '#d97706'),
      JSON.stringify(hBad.toasts));
    ok('състоянието НЕ се сменя', hBad.w.llScan.torch === false);
    ok('и скенерът е жив', !!hBad.w.llScan && !!$(hBad, 'll-scan-modal'));
  }

  section('е) Подсказката — извън панела, оцелява при сканиране');
  {
    const h = env({ caps: {} });
    await openScanner(h);
    const hint = $(h, 'll-scan-hint');
    ok('подсказката е там', !!hint && /Дръж кода в рамката, леко под ъгъл при гланц/.test(hint.textContent),
      hint && hint.textContent);
    ok('под камерата', hint && hint.previousElementSibling && hint.previousElementSibling.id === 'll-scan-view');
    ok('и НЕ е в панела', !$(h, 'll-scan-panel').contains(hint));
    h.w.llScanPanel('<b>нещо друго</b>');
    ok('пренаписан панел не я трие', !!$(h, 'll-scan-hint'));
  }

  section('ж) Отказана камера — червен текст в панела, без опит за ограничения');
  {
    const h = env({ startFail: true, caps: { torch: true } });
    await openScanner(h);
    ok('съобщение „Няма достъп до камерата"', /Няма достъп до камерата/.test($(h, 'll-scan-panel').textContent),
      $(h, 'll-scan-panel').textContent);
    ok('applyVideoConstraints НЕ е викан', h.rec.apply.length === 0, JSON.stringify(h.rec.apply));
    ok('фенерът остава скрит', $(h, 'll-scan-torch').style.display === 'none');
  }

  section('з) Модалът затворен, преди камерата да тръгне — нищо не се прилага');
  {
    const h = env({ startDeferred: true, caps: { torch: true, zoom: { min: 1, max: 8 } } });
    await openScanner(h);
    h.w.llScanClose();
    h.rec.releaseStart();
    await ticks(); await ticks();
    ok('нула извиквания към трака', h.rec.apply.length === 0, JSON.stringify(h.rec.apply));
  }

  report();
})();
