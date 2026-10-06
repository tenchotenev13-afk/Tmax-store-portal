/* Каса — един РАБОТЕН ДЕН за ПОС отчети, Главна каса и Равнение.

   81% от ПОС отчетите се въвеждат на следващия ден: формата, Главна каса, Равнение, печатът и kasa-docs
   вече работят с kasaActiveDate() (= избраният ден или вчера); само renderKasa() филтрираше по today() и
   сутрин казваше „Няма отчети за днес“. Сега:
   • лента „РАБОТЕН ДЕН“ под подтабовете на ПОС / Главна каса / Равнение (не в Сторно);
   • картата „ПОС отчети — ДД.ММ.ГГГГ“ показва работния ден; отчетите с днешна дата са само в подсказка;
   • ‹ и › сменят деня и презареждат текущия подтаб (kasaTab(kasaView)); › е неактивен на днешния ден;
   • изборът НЕ се помни: showModule('kasa') (навигацията) го връща на вчера, вътрешните презареждания — не;
   • Равнение на екрана показва и „↩ Върнат“.

   Часовникът е замразен на 06.10.2026 (вторник): вчера = 05.10 (понеделник).

   Пускане: node tests/kasa-work-day.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, fire, ticks } = H;

const TODAY = '2026-10-06', YEST = '2026-10-05', PREV = '2026-10-04';
const MGR = { email: 'm@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян', assigned_stores: [] };
const clone = x => JSON.parse(JSON.stringify(x));

function pos(id, date, n, over) {
  return Object.assign({ id, store_name: 'Троян', date, pos_number: n, kasa_number: n, cashier_name: 'Касиер ' + id, status: 'draft',
    total_turnover: 1000, cash_turnover: 600, card_turnover: 400, counted_cash: 590, razlika: -10, bills_50: 4, created_at: date + 'T10:00:00Z' }, over || {});
}
const REPORTS = [pos('вчера-1', YEST, 1), pos('вчера-2', YEST, 2, { status: 'confirmed' }), pos('днес-1', TODAY, 1)];

function freeze(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T08:00:00').getTime();
  w.Date = class extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } };
}
function env(over) {
  const h = boot(Object.assign({ modules: ['kasa.js', 'kasa-docs.js', 'daily-turnover.js'], user: MGR,
    data: { kasa_reports: clone(REPORTS), kasa_glavna: [], kasa_zoborot: [], kasa_documents: [], kasa_storno: [], stores: [{ name: 'Троян' }] } }, over || {}));
  freeze(h.w, TODAY);
  h.w.kasaSelectedDate = null;
  return h;
}
const mod = h => h.doc.getElementById('mod-kasa');
const $ = (h, id) => h.doc.getElementById(id);
const txt = h => mod(h).textContent.replace(/\s+/g, ' ');
const lastGet = (h, re) => h.calls.get.filter(u => re.test(u)).pop() || '';
async function settle() { for (let i = 0; i < 8; i++) await ticks(); }

(async function run() {

  section('1. По подразбиране работният ден е ВЧЕРА; картата показва него, днешните са само в подсказката');
  {
    const h = env();
    h.w.kasaSelectedDate = PREV; /* остатък от предишно влизане */
    guard('showModule("kasa")', () => h.w.showModule('kasa'));
    await settle();
    ok('влизане от навигацията: работният ден е вчера', h.w.kasaActiveDate() === YEST && h.w.kasaSelectedDate === null, h.w.kasaActiveDate());
    ok('лентата „РАБОТЕН ДЕН“ е под подтабовете', !!$(h, 'kasa-workday') && /РАБОТЕН ДЕН/.test(txt(h)));
    ok('етикет със ден от седмицата: „понеделник, 05.10.2026“', $(h, 'kasa-day-label').textContent === 'понеделник, 05.10.2026', $(h, 'kasa-day-label').textContent);
    ok('бадж „вчера“', !!$(h, 'kasa-day-badge') && $(h, 'kasa-day-badge').textContent === 'вчера');
    ok('текст „Важи за ПОС, Главна каса, Равнение и печата“', /Важи за ПОС, Главна каса, Равнение и печата/.test(txt(h)));
    ok('лентата е след подтабовете (ktab-pos преди нея)', !!(h.doc.getElementById('ktab-pos').compareDocumentPosition($(h, 'kasa-workday')) & 4));
    ok('картата е „ПОС отчети — 05.10.2026“', /ПОС отчети — 05\.10\.2026/.test(txt(h)) && !/Днешни отчети/.test(txt(h)));
    ok('над нея: „За 05.10: 2 отчета“', /За 05\.10: 2 отчета/.test(txt(h)), txt(h).slice(0, 300));
    ok('бутонът е „+ Нов ПОС отчет за 05.10“', /\+ Нов ПОС отчет за 05\.10/.test(txt(h)));
    ok('вчерашните отчети са в картата', /Касиер вчера-1/.test(txt(h)) && /Касиер вчера-2/.test(txt(h)));
    ok('днешният НЕ е в таблицата (ПОС 1 днес)', !/Касиер днес-1/.test(txt(h)));
    const hint = $(h, 'kasa-today-hint');
    ok('жълта подсказка: „Има 1 ПОС отчет с днешна дата (06.10).“', !!hint && /Има 1 ПОС отчет с днешна дата \(06\.10\)\./.test(hint.textContent), hint && hint.textContent);
    ok('подсказката е над таблицата', !!hint && !!(hint.compareDocumentPosition(mod(h).querySelector('.tbl-wrap')) & 4));
    ok('бутон „Покажи 06.10“', !!hint && /Покажи 06\.10/.test(hint.textContent));
    ok('История (последните 60 дни) е без промяна: днешният отчет не е в нея, вчерашните са', /История/.test(txt(h)) && !/днес-1/.test(mod(h).querySelector('#hist-table-wrap').textContent));
    h.close();
  }

  section('2. ‹ и › сменят деня; › е неактивен на днешния ден; празно състояние');
  {
    const h = env();
    h.w.showModule('kasa'); await settle();
    ok('› е активен на вчера', !$(h, 'kasa-day-next').disabled);
    realClick(h.w, $(h, 'kasa-day-prev')); await settle();
    ok('‹ → 04.10.2026 (неделя), без бадж', h.w.kasaActiveDate() === PREV && $(h, 'kasa-day-label').textContent === 'неделя, 04.10.2026' && !$(h, 'kasa-day-badge'), $(h, 'kasa-day-label').textContent);
    ok('празно състояние: „Няма ПОС отчети за 04.10.2026“', /Няма ПОС отчети за 04\.10\.2026/.test(txt(h)));
    ok('…с подсказка за бутона и стрелките', /Натисни „\+ Нов ПОС отчет за 04\.10“ или смени работния ден със стрелките\./.test(txt(h)));
    ok('подсказката за днес я има и тук (1 отчет с днешна дата)', !!$(h, 'kasa-today-hint'));
    realClick(h.w, $(h, 'kasa-day-next')); await settle();
    ok('› → обратно вчера', h.w.kasaActiveDate() === YEST);
    realClick(h.w, $(h, 'kasa-day-next')); await settle();
    ok('› → днес, бадж „днес“', h.w.kasaActiveDate() === TODAY && $(h, 'kasa-day-badge').textContent === 'днес');
    ok('› е неактивен на днешния ден', $(h, 'kasa-day-next').disabled === true);
    realClick(h.w, $(h, 'kasa-day-next')); await settle();
    ok('клик на неактивния › не мести деня след днес', h.w.kasaActiveDate() === TODAY);
    h.w.kasaShiftDay(1);
    ok('и директното kasaShiftDay(1) не минава днес', h.w.kasaActiveDate() === TODAY);
    ok('на днес: няма подсказка за днешни отчети', !$(h, 'kasa-today-hint'));
    ok('на днес: днешният отчет е в картата', /Касиер днес-1/.test(txt(h)) && /За 06\.10: 1 отчет/.test(txt(h)));
    h.close();
  }

  section('3. Полето „друга дата“ (max = днес) и „Покажи 06.10“');
  {
    const h = env();
    h.w.showModule('kasa'); await settle();
    const inp = $(h, 'kasa-day-pick');
    ok('<input type=date> с max = днес и value = работния ден', inp.type === 'date' && inp.max === TODAY && inp.value === YEST, inp.max + ' / ' + inp.value);
    inp.value = '2026-10-01';
    fire(h.w, inp, 'change'); await settle();
    ok('избор на 01.10 → работният ден е 01.10 (четвъртък)', h.w.kasaActiveDate() === '2026-10-01' && $(h, 'kasa-day-label').textContent === 'четвъртък, 01.10.2026', $(h, 'kasa-day-label').textContent);
    h.w.kasaPickDay('2026-12-31'); await settle();
    ok('бъдеща дата се свежда до днес', h.w.kasaActiveDate() === TODAY);
    h.w.kasaPickDay(YEST); await settle();
    const show = Array.from($(h, 'kasa-today-hint').querySelectorAll('button')).find(b => /Покажи 06\.10/.test(b.textContent));
    realClick(h.w, show); await settle();
    ok('„Покажи 06.10“ прави работния ден днес', h.w.kasaActiveDate() === TODAY && $(h, 'kasa-day-badge').textContent === 'днес');
    ok('и подсказката изчезва, отчетът е в картата', !$(h, 'kasa-today-hint') && /Касиер днес-1/.test(txt(h)));
    h.close();
  }

  section('4. Лентата и в Главна каса и Равнение — със заявки за новия ден; не и в Сторно');
  {
    const h = env();
    h.w.showModule('kasa'); await settle();
    h.w.kasaTab('glavna'); await settle();
    ok('Главна каса: има лента', !!$(h, 'kasa-workday') && /Главна каса/.test(txt(h)));
    ok('Главна каса: обобщение за 05.10.2026', /Обобщение по купюри — 05\.10\.2026/.test(txt(h)));
    realClick(h.w, $(h, 'kasa-day-prev')); await settle();
    ok('Главна каса: ‹ → заявка за kasa_reports с date=eq.2026-10-04', /kasa_reports[^ ]*date=eq\.2026-10-04/.test(lastGet(h, /kasa_reports.*date=eq\.2026-10-04/)) && !!lastGet(h, /kasa_reports.*date=eq\.2026-10-04/), lastGet(h, /kasa_reports/));
    ok('Главна каса: ‹ → заявка за kasa_glavna с date=eq.2026-10-04', !!lastGet(h, /kasa_glavna.*date=eq\.2026-10-04/));
    ok('Главна каса: обобщението е за 04.10.2026', /Обобщение по купюри — 04\.10\.2026/.test(txt(h)));
    ok('Главна каса: още е в Главна каса (kasaView)', h.w.kasaView === 'glavna');

    h.w.kasaTab('zoborot'); await settle();
    ok('Равнение: има лента, а реда „Дата: …“ го няма', !!$(h, 'kasa-workday') && !/Дата: /.test(txt(h)));
    ok('Равнение: заявка за kasa_zoborot с date=eq.2026-10-04', !!lastGet(h, /kasa_zoborot.*date=eq\.2026-10-04/), lastGet(h, /kasa_zoborot/));
    realClick(h.w, $(h, 'kasa-day-next')); await settle();
    ok('Равнение: › → заявка за 05.10', !!lastGet(h, /kasa_zoborot.*date=eq\.2026-10-05/) && $(h, 'kasa-day-label').textContent === 'понеделник, 05.10.2026');
    ok('Равнение: още е в Равнение', h.w.kasaView === 'zoborot');

    h.w.kasaTab('storno'); await settle();
    ok('Сторно: няма лента', !$(h, 'kasa-workday'));
    h.close();
  }

  section('5. Изборът НЕ се помни: вътрешните презареждания го пазят, навигацията го връща на вчера');
  {
    const h = env();
    h.w.showModule('kasa'); await settle();
    h.w.kasaPickDay(PREV); await settle();
    h.w.loadKasa(); await settle();
    ok('loadKasa() (презареждане след запис) не връща деня', h.w.kasaActiveDate() === PREV && $(h, 'kasa-day-label').textContent === 'неделя, 04.10.2026');
    const repsNow = clone(REPORTS).concat([pos('нов', PREV, 1)]);
    h.w.kasaReports = repsNow;
    h.w.kasaView = 'pos';
    h.w.confirmKasaReport('нов'); await settle();
    ok('потвърждение на отчет не връща деня', h.w.kasaActiveDate() === PREV, h.w.kasaActiveDate());
    h.w.kasaView = 'oborot'; h.w.showModule('kasa'); await settle();
    ok('showModule("kasa") (таб „Каса“) → пак вчера', h.w.kasaActiveDate() === YEST);
    h.w.kasaSetDate(PREV); /* без пререндер: в Вечерен оборот няма лента */
    h.w.showModule('oborot'); await settle();
    ok('showModule("oborot") (през Каса) → пак вчера', h.w.kasaActiveDate() === YEST);
    h.w.kasaSetDate(PREV);
    guard('goToStornoTab()', () => h.w.goToStornoTab()); await settle();
    ok('goToStornoTab() (банер при вход) → пак вчера', h.w.kasaActiveDate() === YEST);
    h.close();
  }

  section('6. Новият отчет от бутона е с датата на работния ден');
  {
    const h = env();
    h.w.showModule('kasa'); await settle();
    h.w.kasaPickDay(PREV); await settle();
    const b = Array.from(mod(h).querySelectorAll('button')).find(x => /\+ Нов ПОС отчет за 04\.10/.test(x.textContent));
    if (ok('бутонът „+ Нов ПОС отчет за 04.10“ е там', !!b)) {
      realClick(h.w, b); await settle();
      ok('формата е с датата на работния ден (04.10.2026)', $(h, 'kf-date') && $(h, 'kf-date').value === PREV, $(h, 'kf-date') && $(h, 'kf-date').value);
    }
    h.close();
  }

  section('7. Равнение на екрана: „↩ Върнат“');
  {
    for (const [st, want] of [['returned', 'Статус: ↩ Върнат'], ['confirmed', 'Статус: ✅ Потвърден'], ['draft', 'Статус: ✏️ Чернова']]) {
      const h = env();
      h.w.kasaView = 'zoborot';
      h.w.zoborotData = { id: 'z1', store_name: 'Троян', date: YEST, status: st, confirmed_by: 'Х' };
      guard('renderZoborot()', () => h.w.renderZoborot());
      ok(st + ': ' + want, txt(h).indexOf(want) >= 0, txt(h).slice(-200));
      h.close();
    }
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
