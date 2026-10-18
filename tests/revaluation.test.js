/* Преоценка, етап 2 — пътят на обекта (revaluation.js).
   Интеграционно: shared.js + admin.js (notifyGroupsOf) + stock-returns.js
   (SR_SHEET_TO_STORE) + push.js + email.js + revaluation.js, в реда от
   index.html. push/имейл са стъбнати СЛЕД зареждането (globals).

   ZSTOCK: ред 1 е РЕАЛНИЯТ ред 1 от „zstock преоценка.XLSX" (Завод 1514,
   ТМ Шумен, 41 колони), редовете 2–6 — реалните пет реда от същия файл
   (последният с „Неограничен" 0).

   Мутационна проверка (12.10.2026) — всеки вариант е пуснат срещу този тест
   и е паднал:
     M1 rvRound2 с Math.floor вместо Math.round
        → пада „предложение = 17,79 × 50 % → 8,90" (дава 8,89);
     M2 rvRowProblems без проверката qty > 0
        → пада „остава само редът с Неограничен 0 — маркиран";
     M3 rvParseZstock без проверката на Завода
        → пада „нито един POST" / „toast Файлът е за обект 15";
     M4 rvImportAoa винаги вмъква (без търсене на съществуващ код)
        → пада „0 нови POST-а" / „5 реда, не 10";
     M5 rvRecipients без регионалния
        → пада „регионалният на Шумен получава (Т. Иванова)";
     M6 rvParseZstock без бройката повторени кодове (dupes винаги 0)
        → пада „toast 1 код се срещаше…" и „rvImportAoa връща dupes = 1".
     M7 (13.10.2026) rvCanSee без проверката на rvStoresOn за обекта
        → пада „manager без ключ → под-бутонът е скрит" и „…showModule не рендира бланка";
     (14.10.2026) Табът стана „Ревизии и преоценка“ с под-табове: обектите го
     виждат заради графика (revisions.js), а ключът крие ПОД-БУТОНА
     „🏷️ Преоценка“ (rvs-revaluation). Проверките по-долу са за под-бутона.
     M8 (13.10.2026) rvLoadStoresFlag приема всяка непразна стойност
        → пада „„off“ → скрит" и „боклук („yes“) → скрит";
     M9 (13.10.2026) rvCanEdit без rvStoresOn
        → пада „…но без ключ не пише в бланката на своя обект".
*/
'use strict';

const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, dayOffset, ticks } = H;

const HDR = ['Завод', 'Име 1', 'Материал', 'Описание на материал', 'Група материали', 'Опис.група материали',
  'Неограничен', 'Базова мерна единица', 'Продажби за период', 'Единица на запис', 'Продажна Цена',
  'Валута на условие', 'Промоционална Цена', 'Валута на условие', 'Валидна от', 'Валидна до',
  'Стар номер на матер.', 'EAN/UPC', 'Нетно съдържание', 'МЕ за съдържание', 'Външ. гр. материали',
  'Опис.външна гр.матер', 'Стат.мат. вс.заводи', 'Описание', 'Група оторизации', 'AВС индикатор',
  'Снабдителска група', 'Доставчик', 'Име 1', 'Ном.матер.на доставчик', 'Пункт повт. поръчка',
  'Максим.ниво на запас', 'AВС индикатор', 'Спец.за завод ст.мат', 'Снабдителска група',
  'Наличност 1005', 'Наличност 1018', 'Деблокирано количество 05', 'Деблокирано количество 18',
  'Количество за заявка', 'Тип заявка'];
function zrow(plant, code, name, qty, unit, price) {
  const r = new Array(HDR.length).fill('');
  r[0] = plant; r[1] = 'ТМ Шумен'; r[2] = code; r[3] = name; r[6] = qty; r[7] = unit; r[9] = unit; r[10] = price; r[11] = 'EUR';
  return r;
}
function zstock(plant) {
  return [HDR.slice(),
    zrow(plant, 53531, 'АРКА ГРАДИНСКА МЕТАЛНА 240/140/38 СМ', 56, 'БР', 17.79),
    zrow(plant, 92836, 'БАЛАТУМ 1ММ/ШИР.2М/25М 2203', 1.8, 'M2', 4.29),
    zrow(plant, 90644, 'МОНОБЛОК PRESIDENT З.О.С КАПАК CAT0606', 11, 'БР', 92.99),
    zrow(plant, 77929, 'ЛАМПА СОЛАРНА СТИК D3,2/17,5 A52', 21, 'БР', 3.19),
    zrow(plant, 62903, 'КОФА БОЯДЖИЙСКА 8Л', 0, 'БР', 2.99)];
}

const CAMP = { id: 'c-1', title: 'Октомври', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };
const REGIONAL = { email: 't.ivanova@temax.bg', display_name: 'Т. Иванова', role: 'accounting', store_name: 'Централен офис' };
const ADMIN = { email: 'ten.tenev@temax.bg', display_name: 'Тен Тенев', role: 'admin', store_name: 'Централен офис' };
const USERS = [
  { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', notify_groups: ['controlling'], is_regional: false, assigned_stores: [] },
  { email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', notify_groups: ['controlling'], is_regional: false, assigned_stores: [] },
  { email: 't.ivanova@temax.bg', display_name: 'Т. Иванова', notify_groups: [], is_regional: true, assigned_stores: ['Добрич', 'Силистра', 'Търговище', 'Шумен'] },
  { email: 'n.koleva@temax.bg', display_name: 'Н. Колева', notify_groups: [], is_regional: true, assigned_stores: ['Петрич'] },
  /* От 18.10.2026 известието отива по групата 'revaluation', не 'controlling'
     (rvRecipients). Елица е и в двете; Цветелина и Миглена — само controlling. */
  { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', notify_groups: ['controlling', 'revaluation'], is_regional: false, assigned_stores: [] },
  { email: 'v.drug@temax.bg', display_name: 'Друг ЦО', notify_groups: ['co'], is_regional: false, assigned_stores: [] }
];

let idSeq = 0;
function env(o) {
  o = o || {};
  const db = { subs: (o.subs || []).map(x => Object.assign({}, x)), items: (o.items || []).map(x => Object.assign({}, x)) };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js', 'revisions.js'],
    user: o.user || STORE_USER,
    confirm: o.confirm,
    fail: o.fail,
    data: {
      revaluation_campaigns: o.campaigns || [CAMP],
      revaluation_submissions: () => db.subs,
      revaluation_items: () => db.items,
      stores: [{ name: 'Шумен' }, { name: 'Добрич' }, { name: 'Пазарджик' }, { name: 'Централен офис' }],
      users: url => /email=eq\./.test(url)
        ? USERS.filter(u => url.indexOf(encodeURIComponent(u.email)) >= 0)
        : USERS,
      product_catalog: [],
      app_settings: o.settings || [{ key: 'revaluation_stores', value: 'on' }]
    },
    globals: {
      pushToPeople: (names, title, msg) => { h.push.push({ names, title, msg }); return Promise.resolve({ ok: !o.pushFail }); },
      sendEmail: (to, subj, html) => { h.mail.push({ to, subj }); return Promise.resolve({ ok: true }); }
    }
  });
  h.push = []; h.mail = []; h.db = db;
  /* Ключът се чете при логин (setupTabsForRole); старите секции го приемат за
     включен — секция 0б минава през истинския път. */
  h.w.rvStoresOn = o.storesOn === undefined ? true : o.storesOn;
  /* PostgREST с return=representation връща реда; stub-ът на harness-а връща {}. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    const p = orig(url, init);
    const m = (init && init.method || 'GET').toUpperCase();
    if (m !== 'POST' || !/revaluation_/.test(url)) return p;
    return p.then(r => {
      if (!r.ok) return r;
      /* подразбиращите се от базата (PostgREST ги връща с return=representation) */
      const defs = /revaluation_submissions/.test(url) ? { status: 'draft', no_items: false } : {};
      const row = Object.assign({ id: 'id-' + (++idSeq) }, defs, JSON.parse(init.body));
      if (/revaluation_submissions/.test(url)) db.subs.push(row);
      if (/revaluation_items/.test(url)) db.items.push(row);
      return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve(JSON.stringify([row])) };
    });
  };
  h.w.XLSX = {
    utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => { h.aoa = a; return {}; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); } },
    writeFile: (wb, f) => { h.file = f; h.sheets = wb.SheetNames; }
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const rowInput = (h, sap, f) => {
  const it = h.w.rvItems.find(x => String(x.sap_code) === String(sap));
  return it ? h.doc.querySelector('#rv-row-' + it.id + ' input[data-f="' + f + '"]') : null;
};
async function open(h) { await h.w.loadRevaluation(); await ticks(5); }
async function imported(o) {
  const h = env(o);
  await open(h);
  await h.w.rvImportAoa(zstock(1514));
  await ticks(3);
  return h;
}

(async function run() {

  section('0. Таб и showModule');
  {
    const h = env();
    ok('index.html има таб tab-revaluation, скрит по подразбиране', h.doc.getElementById('tab-revaluation').style.display === 'none');
    ok('и контейнер mod-revaluation', !!mod(h));
    h.w.applyRoleUI && guard('applyRoleUI', () => h.w.applyRoleUI());
    ok('rvCanSee: manager → да', h.w.rvCanSee() === true);
    h.w.currentUser = { role: 'kasa', store_name: 'Шумен' };
    ok('rvCanSee: kasa → не', h.w.rvCanSee() === false);
    h.w.currentUser = { role: 'marketing', store_name: 'Централен офис' };
    ok('rvCanSee: marketing → не', h.w.rvCanSee() === false);
    h.w.currentUser = { role: 'supply', store_name: 'Централен офис' };
    ok('rvCanSee: supply → да', h.w.rvCanSee() === true);
    h.w.currentUser = STORE_USER;
    guard('showModule(revaluation)', () => h.w.showModule('revaluation'));
    await ticks(5);
    ok('showModule показва модула', mod(h).style.display === 'block');
    ok('и го зарежда (бутон „Качи файл")', !!btn(mod(h), 'Качи файл от SAP'));
  }

  section('0б. Скрито за обектите: app_settings.revaluation_stores');
  {
    /* под-бутонът „🏷️ Преоценка“; главният таб е за графика и се вижда винаги */
    const tab = h => h.doc.getElementById('rvs-revaluation');
    const mainTab = h => h.doc.getElementById('tab-revaluation');
    const login = async (o) => {
      const h = env(Object.assign({ storesOn: false }, o));
      guard('setupTabsForRole', () => h.w.setupTabsForRole());
      const hiddenBefore = tab(h).style.display === 'none';
      await ticks(5);
      return { h, hiddenBefore };
    };
    let r = await login({ settings: [] });
    ok('manager без ключ → под-бутонът е скрит', tab(r.h).style.display === 'none' && r.h.w.rvCanSee() === false);
    ok('…а главният таб „Ревизии и преоценка“ се вижда (графикът е за обектите)', mainTab(r.h).style.display === '');
    ok('заявката е точно за ключа', r.h.calls.get.some(u => u.indexOf('/app_settings?key=eq.revaluation_stores&') >= 0));
    guard('showModule(revaluation)', () => r.h.w.showModule('revaluation')); await ticks(5);
    ok('manager без ключ → showModule не рендира бланка', !btn(mod(r.h), 'Качи файл') && !btn(mod(r.h), 'Подай') &&
      !r.h.doc.getElementById('rv-rows') && mod(r.h).textContent.indexOf('Нямаш достъп') >= 0);
    ok('и не чете бланки', !r.h.calls.get.some(u => u.indexOf('/rest/v1/revaluation_') >= 0));

    r = await login({ settings: [{ key: 'revaluation_stores', value: 'on' }] });
    ok('manager с „on“ → под-бутонът е скрит ДО отговора (не мига)', r.hiddenBefore);
    ok('manager с „on“ → вижда под-бутона след отговора', tab(r.h).style.display === '' && r.h.w.rvCanSee() === true);
    guard('showModule(revaluation)', () => r.h.w.showModule('revaluation')); await ticks(5);
    ok('manager с „on“ → бланката се рендира', !!btn(mod(r.h), 'Качи файл'));

    r = await login({ settings: [{ key: 'revaluation_stores', value: 'off' }] });
    ok('„off“ → скрит', tab(r.h).style.display === 'none');
    r = await login({ settings: [{ key: 'revaluation_stores', value: ' ON ' }] });
    ok('„ ON “ (главни, интервал) → включено, както loading_* флаговете', tab(r.h).style.display === '');
    r = await login({ settings: [{ key: 'revaluation_stores', value: 'yes' }] });
    ok('боклук („yes“) → скрит', tab(r.h).style.display === 'none');
    r = await login({ settings: [{ key: 'loading_scan', value: 'on' }] });
    ok('чужд ключ с „on“ в отговора → скрит', tab(r.h).style.display === 'none');
    r = await login({ fail: { GET: /app_settings/ } });
    ok('паднала заявка → скрит', tab(r.h).style.display === 'none');
    ok('и без червен toast при вход (тиха заявка)', !r.h.calls.toast.some(t => /Грешка при зареждане/.test(t)));

    r = await login({ user: ADMIN, settings: [] });
    ok('admin без ключ → вижда', tab(r.h).style.display === '' && r.h.w.rvCanSee() === true);
    r = await login({ user: { email: 'sn@temax.bg', display_name: 'Снаб', role: 'supply', store_name: 'Централен офис' }, settings: [] });
    ok('supply без ключ → вижда', tab(r.h).style.display === '');
    r = await login({ user: REGIONAL, settings: [] });
    ok('регионален (accounting) без ключ → вижда под-бутона', tab(r.h).style.display === '');
    guard('showModule(revaluation)', () => r.h.w.showModule('revaluation')); await ticks(5);
    await r.h.w.rvCoOpenStore('Шумен'); await ticks(5);
    ok('…но без ключ не пише в бланката на своя обект', !btn(mod(r.h), 'Качи файл') && !btn(mod(r.h), 'Подай'));
    const r2 = await login({ user: REGIONAL, settings: [{ key: 'revaluation_stores', value: 'on' }] });
    guard('showModule(revaluation)', () => r2.h.w.showModule('revaluation')); await ticks(5);
    await r2.h.w.rvCoOpenStore('Шумен'); await ticks(5);
    ok('регионален с „on“ → пише в бланката на своя обект', !!btn(mod(r2.h), 'Качи файл'));
  }

  section('1. Импорт на ZSTOCK — Шумен, Завод 1514 → 5 реда');
  {
    const h = await imported();
    ok('бланката е създадена веднъж (POST submissions)', h.calls.post.filter(p => p.table === 'revaluation_submissions').length === 1);
    const ins = h.calls.post.filter(p => p.table === 'revaluation_items');
    ok('5 POST-а към revaluation_items', ins.length === 5, ins.length);
    ok('5 реда в таблицата', h.doc.querySelectorAll('#rv-rows tr[id^="rv-row-"]').length === 5);
    const arka = ins.find(p => p.body.sap_code === '53531');
    ok('Материал → sap_code (текст)', !!arka);
    ok('Описание → product_name', arka && arka.body.product_name === 'АРКА ГРАДИНСКА МЕТАЛНА 240/140/38 СМ');
    ok('Неограничен → qty', arka && arka.body.qty === 56);
    ok('Базова мерна единица → unit', arka && arka.body.unit === 'БР');
    ok('Продажна Цена → std_price', arka && arka.body.std_price === 17.79);
    ok('% от кампанията (50) → discount_pct', arka && arka.body.discount_pct === 50);
    ok('предложение = 17,79 × 50 % → 8,90', arka && arka.body.proposed_price === 8.9, arka && arka.body.proposed_price);
    const kofa = ins.find(p => p.body.sap_code === '62903');
    ok('ред с Неограничен 0 СЕ импортира (qty 0)', kofa && kofa.body.qty === 0);
    ok('balatum qty 1,8 (дробно)', ins.some(p => p.body.sap_code === '92836' && p.body.qty === 1.8));
    ok('store_name/campaign_id на реда са денормализирани', arka && arka.body.store_name === 'Шумен' && arka.body.campaign_id === 'c-1');
  }

  section('2. Повторен импорт на същия файл → обновява, не дублира');
  {
    const h = await imported();
    const before = h.calls.post.length;
    const file2 = zstock(1514); file2[1][6] = 60; file2[1][10] = 18.99;
    await h.w.rvImportAoa(file2); await ticks(3);
    ok('0 нови POST-а', h.calls.post.length === before, h.calls.post.length - before);
    ok('5 реда, не 10', h.w.rvItems.length === 5, h.w.rvItems.length);
    const p = h.calls.patch.filter(x => x.table === 'revaluation_items');
    ok('5 PATCH-а', p.length === 5);
    const arka = p.find(x => x.body.qty === 60);
    ok('qty и std_price обновени (60 / 18,99)', arka && arka.body.std_price === 18.99);
    ok('цената преизчислена по процента на реда (18,99 × 50 % → 9,50)', arka && arka.body.proposed_price === 9.5, arka && arka.body.proposed_price);
  }

  section('2б. Код два пъти във файла → един ред, количествата събрани, toast');
  {
    const h = env(); await open(h);
    const f = zstock(1514); f.push(zrow(1514, 53531, 'АРКА ГРАДИНСКА МЕТАЛНА 240/140/38 СМ', 4, 'БР', 17.79));
    const r = await h.w.rvImportAoa(f); await ticks(3);
    const ins = h.calls.post.filter(p => p.table === 'revaluation_items');
    ok('5 реда, не 6', ins.length === 5 && h.w.rvItems.length === 5, ins.length);
    ok('арката: 56 + 4 = 60', ins.some(p => p.body.sap_code === '53531' && p.body.qty === 60));
    ok('toast „1 код се срещаше повече от веднъж — количествата са събрани"',
      h.calls.toast.some(t => t.indexOf('1 код се срещаше повече от веднъж — количествата са събрани') >= 0), h.calls.toast.join(' | '));
    ok('rvImportAoa връща dupes = 1', r.dupes === 1);
    const g = env(); await open(g);
    const f2 = zstock(1514); f2.push(zrow(1514, 53531, 'x', 1, 'БР', 17.79)); f2.push(zrow(1514, 92836, 'y', 1, 'M2', 4.29));
    await g.w.rvImportAoa(f2); await ticks(3);
    ok('два повторени кода → „2 кода се срещаха…"', g.calls.toast.some(t => t.indexOf('2 кода се срещаха повече от веднъж') >= 0));
    const n = env(); await open(n);
    await n.w.rvImportAoa(zstock(1514)); await ticks(3);
    ok('без повторения — без тази бележка', !n.calls.toast.some(t => t.indexOf('повече от веднъж') >= 0));
  }

  section('3. Файл за друг обект → 0 реда + toast');
  {
    const h = env(); await open(h);
    const r = await h.w.rvImportAoa(zstock(1515)); await ticks(3);
    ok('нито един POST', h.calls.post.length === 0);
    ok('toast „Файлът е за обект 15"', h.calls.toast.some(t => t.indexOf('Файлът е за обект 15') >= 0), h.calls.toast.join(' | '));
    ok('0 реда в бланката', h.w.rvItems.length === 0);
    const mixed = zstock(1514); mixed[3][0] = 1502;
    await h.w.rvImportAoa(mixed); await ticks(3);
    ok('смесен файл (един ред 1502) → пак нищо', h.calls.post.length === 0 && h.calls.toast.some(t => t.indexOf('Файлът е за обект 2') >= 0));
    const noPlant = zstock(1514).map(r => r.slice(1));
    await h.w.rvImportAoa(noPlant); await ticks(3);
    ok('без колона „Завод" → отказ', h.calls.post.length === 0 && h.calls.toast.some(t => t.indexOf('Завод') >= 0));
  }

  section('4. Обект без номер в картата → импорт минава с жълт toast');
  {
    const h = env({ user: REGIONAL }); await open(h);
    h.w.rvMe.assigned_stores = ['Пазарджик']; /* регионален на обект без номер */
    await h.w.rvPickStore('Пазарджик'); await ticks(3);
    ok('Пазарджик няма номер', h.w.rvStoreNo('Пазарджик') === '');
    await h.w.rvImportAoa(zstock(1514)); await ticks(3);
    ok('5 реда импортирани', h.w.rvItems.length === 5);
    ok('предупреждение, че заводът не е проверен', h.calls.toast.some(t => t.indexOf('няма номер') >= 0));
    ok('номерата от картата: Шумен 14, Раднево 21', h.w.rvStoreNo('Шумен') === '14' && h.w.rvStoreNo('Раднево') === '21');
  }

  section('5. Процент → цена и цена → процент (обикновено закръгляне)');
  {
    const h = await imported();
    ok('1,29 / 50 % → 0,65', h.w.rvPriceFromPct(1.29, 50) === 0.65, h.w.rvPriceFromPct(1.29, 50));
    ok('17,79 / 30 % → 12,45', h.w.rvPriceFromPct(17.79, 30) === 12.45, h.w.rvPriceFromPct(17.79, 30));
    ok('НЕ .х9: 14,00 / 0 % → 14 (не 13,99)', h.w.rvPriceFromPct(14, 0) === 14);
    ok('100 % → 0', h.w.rvPriceFromPct(17.79, 100) === 0);
    /* истинско onchange върху полето % на реда */
    const pin = rowInput(h, '53531', 'discount_pct');
    pin.value = '30'; fire(h.w, pin, 'change'); await ticks(3);
    const p1 = h.calls.patch.filter(x => x.table === 'revaluation_items').pop();
    ok('редакция на % (30) → PATCH с цена 12,45', p1 && p1.body.discount_pct === 30 && p1.body.proposed_price === 12.45, JSON.stringify(p1 && p1.body));
    const prin = rowInput(h, '53531', 'proposed_price');
    prin.value = '8,9'; fire(h.w, prin, 'change'); await ticks(3);
    const p2 = h.calls.patch.filter(x => x.table === 'revaluation_items').pop();
    ok('редакция на цена 8,9 → % = 49,97', p2 && p2.body.proposed_price === 8.9 && p2.body.discount_pct === 49.97, JSON.stringify(p2 && p2.body));
    const n = h.calls.patch.length;
    const bad = rowInput(h, '53531', 'discount_pct'); bad.value = '101'; fire(h.w, bad, 'change'); await ticks(3);
    ok('% 101 → отказ, без PATCH', h.calls.patch.length === n);
    const zero = rowInput(h, '53531', 'discount_pct'); zero.value = '0'; fire(h.w, zero, 'change'); await ticks(3);
    const p3 = h.calls.patch.pop();
    ok('% 0 → цена = стандартната (17,79)', p3 && p3.body.proposed_price === 17.79);
  }

  section('5б. Празно поле е празно, не „—"');
  {
    const h = await imported();
    const c = rowInput(h, '53531', 'store_comment');
    ok('празният коментар на обекта е "" в полето', c && c.value === '', c && JSON.stringify(c.value));
    h.w.rvItems[0].discount_pct = null; h.w.rvItems[0].proposed_price = null; h.w.rvRender();
    ok('празен % и празна цена — ""', rowInput(h, h.w.rvItems[0].sap_code, 'discount_pct').value === '' && rowInput(h, h.w.rvItems[0].sap_code, 'proposed_price').value === '');
    h.w.rvSub.default_pct = null; h.w.rvCampaigns[0].default_pct = null; h.w.rvRender();
    ok('празен % за бланката — ""', h.doc.getElementById('rv-sub-pct').value === '');
  }

  section('6. „Приложи % към всички" — само с потвърждение');
  {
    const h = await imported({ confirm: false });
    realClick(h.w, btn(mod(h), 'Приложи % към всички')); await ticks(5);
    ok('без потвърждение — нито един PATCH', h.calls.patch.length === 0);
    const h2 = await imported();
    h2.w.rvSub.default_pct = 30;
    realClick(h2.w, btn(mod(h2), 'Приложи % към всички')); await ticks(10);
    const ps = h2.calls.patch.filter(x => x.table === 'revaluation_items');
    ok('с потвърждение — 5 PATCH-а с 30 %', ps.length === 5 && ps.every(x => x.body.discount_pct === 30));
    ok('и цената на арката 12,45', ps.some(x => x.body.proposed_price === 12.45));
  }

  section('7. „Подай" — невалидни редове не се подават, маркират се');
  {
    const h = await imported();
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(5);
    ok('без коментари → бланката НЕ е подадена', !h.calls.patch.some(x => x.table === 'revaluation_submissions'));
    ok('5 маркирани реда', h.doc.querySelectorAll('#rv-rows .rv-bad').length === 5);
    ok('toast с броя', h.calls.toast.some(t => t.indexOf('5 реда не минават') >= 0), h.calls.toast.join(' | '));
    for (const it of h.w.rvItems.slice()) {
      const c = rowInput(h, it.sap_code, 'store_comment'); c.value = 'стар модел'; fire(h.w, c, 'change'); await ticks(3);
    }
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(5);
    const kofa = h.w.rvItems.find(x => x.sap_code === '62903');
    ok('остава само редът с Неограничен 0 — маркиран', h.doc.querySelectorAll('#rv-rows .rv-bad').length === 1 &&
      !!h.doc.querySelector('#rv-row-' + kofa.id + ' .rv-bad'));
    ok('пак не е подадена', !h.calls.patch.some(x => x.table === 'revaluation_submissions'));
    /* цена точно 0 (100 %) */
    const q = rowInput(h, '62903', 'qty'); q.value = '3'; fire(h.w, q, 'change'); await ticks(3);
    const pc = rowInput(h, '53531', 'discount_pct'); pc.value = '100'; fire(h.w, pc, 'change'); await ticks(3);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(5);
    const arka = h.w.rvItems.find(x => x.sap_code === '53531');
    ok('цена точно 0 → маркиран', !!h.doc.querySelector('#rv-row-' + arka.id + ' .rv-bad') && h.doc.querySelectorAll('#rv-rows .rv-bad').length === 1);
    const pc2 = rowInput(h, '53531', 'discount_pct'); pc2.value = '50'; fire(h.w, pc2, 'change'); await ticks(3);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const sp = h.calls.patch.find(x => x.table === 'revaluation_submissions');
    ok('с валидни редове → PATCH status submitted', sp && sp.body.status === 'submitted' && sp.body.no_items === false && !!sp.body.submitted_at);
    ok('submitted_by = името', sp && sp.body.submitted_by === 'Управител Шумен');
    ok('push извикан веднъж', h.push.length === 1);
    const names = h.push[0] ? h.push[0].names : [];
    ok('получава групата revaluation (Елица)', names.indexOf('Елица Гюрова') >= 0, names.join(','));
    ok('само controlling НЕ получава (Цветелина, Миглена)', names.indexOf('Цветелина Тенева') < 0 && names.indexOf('Миглена Павлова') < 0, names.join(','));
    ok('регионалният на Шумен получава (Т. Иванова)', names.indexOf('Т. Иванова') >= 0);
    ok('чужд регионален НЕ (Н. Колева), друга група НЕ (Друг ЦО)', names.indexOf('Н. Колева') < 0 && names.indexOf('Друг ЦО') < 0);
    ok('текст „Преоценка · Шумен · Октомври: подадени 5 реда"', h.push[0] && h.push[0].msg === 'Преоценка · Шумен · Октомври: подадени 5 реда', h.push[0] && h.push[0].msg);
    ok('имейл до същите 2 адреса', h.mail.length === 1 && h.mail[0].to.length === 2 && h.mail[0].subj === 'Преоценка · Шумен · Октомври: подадени 5 реда');
    ok('статусът показва „Подадена"', h.doc.getElementById('rv-status').textContent.indexOf('Подадена') === 0);
    /* обектът след подаване — само четене */
    ok('обектът: няма „Изтрий ред"', !btn(mod(h), 'Изтрий ред'));
    ok('обектът: няма „＋ Ред", „Качи файл", „Подай", „Нямаме", „Приложи %"',
      !btn(mod(h), '＋ Ред') && !btn(mod(h), 'Качи файл') && !btn(mod(h), 'Подай') && !btn(mod(h), 'Нямаме') && !btn(mod(h), 'Приложи %'));
    ok('обектът: няма полета в редовете', h.doc.querySelectorAll('#rv-rows input').length === 0);
    ok('„Изтегли моята бланка" остава', !!btn(mod(h), 'Изтегли моята бланка'));
  }

  section('8. Регионалният — бланката на своя обект и след подаване');
  {
    const sub = { id: 's-9', campaign_id: 'c-1', store_name: 'Шумен', status: 'submitted', no_items: false, submitted_at: new Date().toISOString(), default_pct: null };
    const items = [{ id: 'i-1', submission_id: 's-9', campaign_id: 'c-1', store_name: 'Шумен', sap_code: '53531', qty: 5, std_price: 17.79, discount_pct: 50, proposed_price: 8.9, store_comment: 'x', sort_order: 1 }];
    const h = env({ user: REGIONAL, subs: [sub], items });
    await open(h);
    ok('избран е обект от региона (Добрич — първият)', h.w.rvStore === 'Добрич');
    /* от етап 3а регионалните (accounting/admin) виждат списъка на ЦО и отварят бланка с „Отвори" */
    await h.w.rvCoOpenStore('Шумен'); await ticks(5);
    ok('регионалният: има „Изтрий ред" след подаване', !!btn(mod(h), 'Изтрий ред'));
    ok('и полета за редакция', h.doc.querySelectorAll('#rv-rows input').length > 0);
    ok('но не и „Подай" (вече е подадена)', !btn(mod(h), 'Подай'));
    const q = rowInput(h, '53531', 'qty'); q.value = '7'; fire(h.w, q, 'change'); await ticks(3);
    ok('редакцията пише PATCH', h.calls.patch.some(x => x.table === 'revaluation_items' && x.body.qty === 7));
    realClick(h.w, btn(mod(h), 'Изтрий ред')); await ticks(3);
    ok('изтриването праща DELETE', h.calls.del.some(u => /revaluation_items\?id=eq\.i-1/.test(u)));
    await h.w.rvCoBack(); await ticks(5);
    const shumenRow = h.doc.getElementById('rv-co-Шумен');
    ok('„← Към списъка" → списъкът на ЦО, Шумен „подадена"', !!shumenRow && shumenRow.textContent.indexOf('подадена') >= 0);
    await h.w.rvCoOpenStore('Пазарджик'); await ticks(5);
    ok('обект извън региона → само четене', !btn(mod(h), 'Качи файл'));
    /* admin (не регионален) — само чете */
    const a = env({ user: ADMIN, subs: [sub], items }); await open(a);
    await a.w.rvCoOpenStore('Шумен'); await ticks(5);
    ok('admin: вижда реда, но без „Изтрий ред"', a.w.rvItems.length === 1 && !btn(mod(a), 'Изтрий ред'));
  }

  section('9. „Нямаме за преоценка"');
  {
    const h = await imported();
    realClick(h.w, btn(mod(h), 'Нямаме за преоценка')); await ticks(5);
    ok('при бланка с редове → отказ, без запис', !h.calls.patch.some(x => x.table === 'revaluation_submissions'));
    ok('toast за отказа', h.calls.toast.some(t => t.indexOf('има 5 реда') >= 0));
    const e = env(); await open(e);
    realClick(e.w, btn(mod(e), 'Нямаме за преоценка')); await ticks(10);
    const sp = e.calls.post.find(x => x.table === 'revaluation_submissions');
    ok('празна бланка → POST с no_items true, status submitted', sp && sp.body.no_items === true && sp.body.status === 'submitted' && !!sp.body.submitted_at);
    ok('известие „…: нямат за преоценка"', e.push[0] && e.push[0].msg === 'Преоценка · Шумен · Октомври: нямат за преоценка');
    ok('статус „Нямат за преоценка"', e.doc.getElementById('rv-status').textContent.indexOf('Нямат') === 0);
    ok('после няма „＋ Ред"', !btn(mod(e), '＋ Ред'));
  }

  section('10. Провалено известие — подаването стои, жълт toast');
  {
    const h = env({ pushFail: true }); await open(h);
    realClick(h.w, btn(mod(h), 'Нямаме за преоценка')); await ticks(10);
    ok('бланката е записана', h.w.rvSub && h.w.rvSub.status === 'submitted');
    ok('жълт toast „известието не тръгна (push)"', h.calls.toast.some(t => t.indexOf('известието не тръгна (push)') >= 0), h.calls.toast.join(' | '));
  }

  section('11. Провален запис → червен toast + маркер');
  {
    const h = env({ fail: { POST: /revaluation_items/ } }); await open(h);
    await h.w.rvImportAoa(zstock(1514)); await ticks(5);
    ok('бланката е създадена, редовете — не', h.w.rvSub && h.w.rvItems.length === 0);
    ok('списък „Не са записани" над таблицата', !!h.doc.getElementById('rv-import-fails') && h.doc.getElementById('rv-import-fails').textContent.indexOf('53531') >= 0);
    ok('червен toast с броя', h.calls.toast.some(t => t.indexOf('5 реда не са записани') >= 0));
    const h2 = await imported({ fail: { PATCH: /revaluation_items/ } });
    const q = rowInput(h2, '53531', 'qty'); q.value = '9'; fire(h2.w, q, 'change'); await ticks(3);
    const arka = h2.w.rvItems.find(x => x.sap_code === '53531');
    ok('PATCH пада → ⚠ на реда', !!h2.doc.querySelector('#rv-row-' + arka.id + ' .rv-err'));
    ok('и стойността не е сменена локално', arka.qty === 56);
  }

  section('12. Износ — 13 колони в точния ред');
  {
    const h = await imported();
    h.w.rvItems[0].sale_price = 9.99; h.w.rvItems[0].new_sap_code = '8053531';
    realClick(h.w, btn(mod(h), 'Изтегли моята бланка'));
    const want = ['Магазин', 'Код', 'Описание на материал', 'Количество', 'Мерна единица', 'Коментар Обект',
      'Стандартна прод. цена', 'Предложение за цена', 'Преоценен код', 'Цена преоценен код', 'Коментар Ели',
      'Тотал ст.пр.цена', 'Тотал преоценка'];
    ok('заглавията', h.aoa && JSON.stringify(h.aoa[0]) === JSON.stringify(want), h.aoa && JSON.stringify(h.aoa[0]));
    const r = h.aoa && h.aoa.find(x => x[1] === '53531');
    ok('Магазин = 14 (номер)', r && r[0] === 14);
    ok('L = qty × std (56 × 17,79 = 996,24), стойност', r && r[11] === 996.24, r && r[11]);
    ok('M = qty × sale_price (56 × 9,99 = 559,44)', r && r[12] === 559.44, r && r[12]);
    ok('I/J от базата', r && r[8] === '8053531' && r[9] === 9.99);
    const r2 = h.aoa.find(x => x[1] === '92836');
    ok('без sale_price → M празно', r2 && r2[12] === '' && r2[9] === '');
    ok('лист „14", файл preocenka-14-…', h.sheets[0] === '14' && /^preocenka-14-/.test(h.file));
  }

  section('13. Повторна преоценка — бадж');
  {
    const items = [
      { id: 'i-a', submission_id: 's-1', sap_code: '8025298', product_name: 'ПРЕОЦ. ЛАМПА', qty: 1, std_price: 5, sort_order: 1 },
      { id: 'i-b', submission_id: 's-1', sap_code: '25298', product_name: 'ЛАМПА', qty: 1, std_price: 5, sort_order: 2 }];
    const h = env({ subs: [{ id: 's-1', campaign_id: 'c-1', store_name: 'Шумен', status: 'draft', no_items: false }], items });
    await open(h);
    ok('8025298 → „вече преоценен"', !!h.doc.querySelector('#rv-row-i-a .rv-repeat'));
    ok('25298 → без бадж', !h.doc.querySelector('#rv-row-i-b .rv-repeat'));
    ok('80252980 (8 цифри) → без бадж', h.w.rvIsRepeat('80252980') === false);
  }

  section('14. Ръчен ред, дубликат, прозорец, нова кампания');
  {
    const h = await imported();
    realClick(h.w, btn(mod(h), '＋ Ред'));
    h.doc.getElementById('rv-a-code').value = '53531';
    realClick(h.w, btn(h.doc.getElementById('rv-add'), 'Добави')); await ticks(3);
    ok('код, който вече е в бланката → не се добавя', h.w.rvItems.length === 5 && h.calls.toast.some(t => t.indexOf('вече е в бланката') >= 0));
    h.doc.getElementById('rv-a-code').value = '11111';
    h.doc.getElementById('rv-a-name').value = 'НОВ';
    h.doc.getElementById('rv-a-qty').value = '2';
    h.doc.getElementById('rv-a-std').value = '1,29';
    h.doc.getElementById('rv-a-comment').value = 'повреден';
    realClick(h.w, btn(h.doc.getElementById('rv-add'), 'Добави')); await ticks(3);
    const p = h.calls.post.filter(x => x.table === 'revaluation_items').pop();
    ok('ръчен ред: POST с цена 0,65 (1,29 × 50 %)', p && p.body.sap_code === '11111' && p.body.proposed_price === 0.65 && p.body.std_price === 1.29, JSON.stringify(p && p.body));
    ok('6 реда', h.w.rvItems.length === 6);

    const closed = Object.assign({}, CAMP, { starts_on: dayOffset(-10), ends_on: dayOffset(-1) });
    const c = env({ campaigns: [closed] }); await open(c);
    ok('извън прозореца → няма „Качи файл" и „Подай"', !btn(mod(c), 'Качи файл') && !btn(mod(c), 'Подай'));

    /* От етап 3б „＋ Нова кампания" е заменена от „📅 График на кампаниите" —
       създаването, „до" преди „от" и припокриването са в revaluation-sap.test.js. */
    const a = env({ user: ADMIN }); await open(a);
    ok('обект няма „График на кампаниите"', !btn(mod(h), 'График на кампаниите'));
    ok('admin има „📅 График на кампаниите"', !!btn(mod(a), 'График на кампаниите'));
    realClick(a.w, btn(mod(a), 'Затвори кампанията')); await ticks(5);
    const cc = a.calls.patch.find(x => x.table === 'revaluation_campaigns');
    ok('затваряне: PATCH status closed + closed_at/by', cc && cc.body.status === 'closed' && !!cc.body.closed_at && cc.body.closed_by === 'Тен Тенев');
  }

  section('15. Нищо не се е провалило тихо');
  {
    const h = await imported();
    ok('нула notOk при нормален път', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
  }

  report();
})();
