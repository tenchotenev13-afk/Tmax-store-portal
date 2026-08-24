/* ═══════════════════════════════════════════════════════════════════════════
   jsdom harness за Tmax-store-portal.

   Зарежда РЕАЛНИТЕ файлове на портала в jsdom, в реалния ред от index.html,
   и дава помощници за ИСТИНСКИ кликове по inline onclick атрибути.

   Ползване:
     const H = require('./.claude/skills/tmax-jsdom-test/harness');
     const { boot, realClick, btn, ok, section, report } = H;

   Пускане:
     node test-нещо.js            # репото е текущата папка
     node test-нещо.js /път/репо  # или изрично
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/* Реалният ред на <script> таговете в index.html.
   Не се пренарежда — history.js разчита на storno helper-и от kasa.js и т.н. */
const MODULE_ORDER = [
  'shared.js', 'transport.js', 'pallets.js', 'client-orders.js', 'docs.js',
  'bulletin.js', 'today.js', 'kasa.js', 'kasa-docs.js', 'daily-turnover.js',
  'admin.js', 'history.js',
  'contacts.js', 'transit.js', 'calendar.js', 'stock-returns.js',
  'stock-differences.js', 'push.js', 'email.js', 'report.js', 'notifications.js',
  'reference.js', 'handbook.js'
];

/* Функции, които showModule() вика; ако модулът им не е зареден, се stub-ват,
   за да не гърми навигацията. */
const LOADERS = [
  'loadTransport', 'loadPallets', 'loadClientOrders', 'loadDocs', 'loadBulletin',
  'loadTodayDashboard', 'loadKasa', 'loadKasaDocs', 'loadAdmin', 'loadHistory',
  'loadContacts', 'loadTransit', 'loadCalendar', 'loadStockReturns', 'loadStockDiff',
  'loadPush', 'loadEmail', 'loadReport', 'loadNotifications', 'loadReference',
  'loadHandbook'
];

/* ── Броене на резултати ─────────────────────────────────────────────────── */
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else {
    fail++; failures.push(name);
    console.log('  ❌ ' + name + (extra ? '  →  ' + extra : ''));
  }
  return !!cond;
}

function section(t) { console.log('\n=== ' + t + ' ==='); }

/* Изпълнява fn и се проваля (вместо да убие целия тест), ако хвърли.
   Ползвай за рендери и кликове — един ReferenceError в един модул не бива
   да отнася всички останали проверки.

   Връща true (не хвърли) / false (хвърли) — НЕ стойността на fn.
   Повечето рендер функции в проекта не връщат нищо, така че връщане на
   стойността правеше `if (guard(...) !== undefined)` винаги лъжа и следващите
   проверки се прескачаха мълчаливо. Затова: булево.
   Ако ти трябва стойност — хвани я в променлива вътре в fn:
     let html; guard('рендер', () => { html = buildRow(o); }); */
function guard(name, fn) {
  try {
    fn();
    ok(name, true);
    return true;
  } catch (e) {
    ok(name, false, e && e.message);
    if (e && e.stack) {
      console.log('     ' + e.stack.split('\n').slice(1, 4).map(s => s.trim()).join('\n     '));
    }
    return false;
  }
}

/* Извиква се накрая на теста. Връща exit code през process.exit. */
function report() {
  console.log('\n─────────────────────────────');
  console.log(pass + ' успешни, ' + fail + ' неуспешни');
  if (fail) {
    console.log('\nПаднали проверки:');
    failures.forEach(f => console.log('  · ' + f));
  }
  process.exit(fail ? 1 : 0);
}

/* ── Пътят до репото ─────────────────────────────────────────────────────── */
function repoDir(explicit) {
  const d = explicit || process.argv[2] || process.cwd();
  return d.replace(/[\/\\]*$/, '') + path.sep;
}

/* Име на таблицата от Supabase URL: .../rest/v1/client_orders?select=* */
function tableOf(url) {
  const m = String(url).match(/\/rest\/v1\/([A-Za-z0-9_]+)/) ||
            String(url).match(/\/([A-Za-z0-9_]+)(?:\?|$)/);
  return m ? m[1] : '';
}

/* ═══════════════════════════════════════════════════════════════════════════
   boot(opts) — вдига среда и връща { w, doc, calls, setData, close }

   opts:
     repo      — папка на репото (по подразбиране argv[2] или cwd)
     modules   — кои module файлове да се заредят освен shared.js
                 (подреждат се автоматично по реда от index.html)
     user      — обектът currentUser
     data      — { table: [редове] } или { table: fn(url) } за GET отговорите
     fail      — { GET|POST|PATCH|DELETE: правило } — симулира провалена
                 заявка (res.ok === false). Правилото може да е:
                   true            — всяка заявка с този метод пада (500,
                                     тяло {message:'boom'})
                   /regex/         — падат само URL-ите, които съвпадат
                   fn(url)         — пада, ако върне истина; може да върне
                                     и обект-спецификация (виж долу)
                   { status, body, url } — точен контрол:
                     status  HTTP кодът (по подразбиране 500)
                     body    тялото на отговора; ЛИПСВАЩО, null или ''
                             значи ПРАЗНО тяло — тогава json() ХВЪРЛЯ
                             SyntaxError, точно както прави браузърът
                             (така се симулира 401 без тяло от PostgREST)
                     url     по избор — /regex/ или fn(url), за да падне
                             само част от заявките с този метод
     confirm   — true (по подразбиране) / false / fn(msg)
     html      — 'index' (по подразбиране, реалният index.html) или собствен HTML
     globals   — { име: стойност } зададени СЛЕД зареждането на скриптовете
   ═══════════════════════════════════════════════════════════════════════════ */
function boot(opts) {
  opts = opts || {};
  const DIR = repoDir(opts.repo);

  const html = (!opts.html || opts.html === 'index')
    ? fs.readFileSync(DIR + 'index.html', 'utf8')
    : opts.html;

  /* runScripts: 'outside-only' — НЕ 'dangerously'. При 'dangerously' jsdom би
     се опитал да дърпа истинския OneSignal CDN скрипт от index.html. Файловете
     се зареждат ръчно през w.eval() по-долу, което ги закача на window —
     а именно на window трябва да са, за да ги виждат inline onclick атрибутите. */
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/' });
  const w = dom.window;

  const calls = {
    get: [], post: [], patch: [], del: [],
    toast: [], confirm: [], alert: [],
    scrollTo: [], scrollIntoView: [],
    notOk: []        /* заявки, върнали ok:false — за "тихите" грешки */
  };

  /* ── Браузърни неща, които jsdom няма ── */
  w.scrollTo = (x, y) => { calls.scrollTo.push([x, y]); w.__y = y; };
  Object.defineProperty(w, 'pageYOffset', { get: () => w.__y || 0, configurable: true });
  w.Element.prototype.scrollIntoView = function (o) {
    calls.scrollIntoView.push({ id: this.id, opt: o });
  };
  w.alert = m => { calls.alert.push(m); };
  w.confirm = m => {
    calls.confirm.push(m);
    if (typeof opts.confirm === 'function') return opts.confirm(m);
    return opts.confirm !== false;
  };
  w.print = () => {};
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

  /* ── fetch stub ── */
  const data = Object.assign({}, opts.data);
  const failSpec = opts.fail || {};

  /* Старата форма (true / regex / fn) значи точно каквото значеше преди:
     500 с тяло {message:'boom'}. Новата обектна форма дава статус и тяло. */
  const LEGACY_FAIL = { status: 500, body: { message: 'boom' }, empty: false };

  function normalizeFail(spec) {
    if (spec === true) return LEGACY_FAIL;
    if (!spec || typeof spec !== 'object') return null;
    const has = Object.prototype.hasOwnProperty.call(spec, 'body') &&
                spec.body !== null && spec.body !== undefined && spec.body !== '';
    return { status: spec.status || 500, body: has ? spec.body : null, empty: !has };
  }

  /* Връща null (заявката минава) или { status, body, empty }. */
  function failureFor(method, url) {
    const rule = failSpec[method];
    if (!rule) return null;
    if (rule === true) return LEGACY_FAIL;
    if (rule instanceof RegExp) return rule.test(url) ? LEGACY_FAIL : null;
    if (typeof rule === 'function') {
      const out = rule(url);
      if (!out) return null;
      return out === true ? LEGACY_FAIL : normalizeFail(out);
    }
    if (typeof rule === 'object') {
      if (rule.url instanceof RegExp && !rule.url.test(url)) return null;
      if (typeof rule.url === 'function' && !rule.url(url)) return null;
      return normalizeFail(rule);
    }
    return null;
  }

  /* Един и същ строеж на отговора за GET и за пишещите методи.
     text() връща реалното тяло, а не празен низ — stub, чийто text() лъже,
     вече веднъж скри разлика между теста и браузъра. */
  function mkRes(f, okBody) {
    if (!f) return {
      ok: true, status: 200,
      json: () => Promise.resolve(okBody),
      text: () => Promise.resolve(JSON.stringify(okBody))
    };
    return {
      ok: false, status: f.status,
      json: () => f.empty
        ? Promise.reject(new SyntaxError('Unexpected end of JSON input'))
        : Promise.resolve(f.body),
      text: () => Promise.resolve(f.empty ? '' : JSON.stringify(f.body))
    };
  }

  w.fetch = function (url, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const table = tableOf(url);
    const failThis = failureFor(method, url);

    if (method === 'GET') {
      calls.get.push(url);
      let body = data[table];
      if (typeof body === 'function') body = body(url);
      body = body ? JSON.parse(JSON.stringify(body)) : [];
      if (failThis) calls.notOk.push({ method, url, status: failThis.status });
      return Promise.resolve(mkRes(failThis, body));
    }

    let parsed = null;
    try { parsed = init.body ? JSON.parse(init.body) : null; } catch (e) { parsed = init.body; }
    const rec = { url, table, body: parsed };
    if (method === 'POST') calls.post.push(rec);
    else if (method === 'PATCH') calls.patch.push(rec);
    else if (method === 'DELETE') calls.del.push(url);
    if (failThis) calls.notOk.push({ method, url, status: failThis.status });

    return Promise.resolve(mkRes(failThis, {}));
  };

  /* ── Зареждане на файловете в реалния ред ── */
  const wanted = ['shared.js'].concat(opts.modules || []);
  const unknown = wanted.filter(f => MODULE_ORDER.indexOf(f) < 0);
  if (unknown.length) {
    throw new Error('Непознат файл (не е в реда от index.html): ' + unknown.join(', ') +
      '\nДобави го в MODULE_ORDER в harness.js на правилното място.');
  }
  const ordered = MODULE_ORDER.filter(f => wanted.indexOf(f) >= 0);

  ordered.forEach(f => {
    const src = fs.readFileSync(DIR + f, 'utf8');
    try { w.eval(src); }
    catch (e) { throw new Error('Грешка при зареждане на ' + f + ': ' + e.message); }
  });

  /* Липсващите load* функции се stub-ват, за да не гърми showModule(). */
  LOADERS.forEach(fn => { if (typeof w[fn] !== 'function') w[fn] = () => {}; });

  /* ── currentUser и глобални ── */
  if (opts.user) w.currentUser = opts.user;
  Object.keys(opts.globals || {}).forEach(k => { w[k] = opts.globals[k]; });

  /* ── toast се записва, но и се изпълнява (пипа DOM-а) ── */
  const origToast = w.toast;
  w.toast = (m, c) => {
    calls.toast.push(m);
    try { if (typeof origToast === 'function') origToast(m, c); } catch (e) {}
  };

  return {
    w, doc: w.document, calls, dom,
    setData(table, rows) { data[table] = rows; },
    close() { try { w.close(); } catch (e) {} }
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Истински кликове
   ═══════════════════════════════════════════════════════════════════════════ */

/* Изпълнява inline onclick атрибута с правилен `this`.
   Точно това хваща escaping бъговете, които изглеждат наред при четене на
   markup-а (напр. апостроф в име на клиент, който чупи onclick стринга). */
function realClick(w, el, label) {
  if (!el) throw new Error('елементът не съществува' + (label ? ' (' + label + ')' : ''));
  const code = el.getAttribute('onclick');
  if (!code) throw new Error('няма onclick атрибут: ' + el.outerHTML.slice(0, 160));
  const fn = w.eval('(function(el){ (function(){' + code + '}).call(el); })');
  fn(el);
}

/* Клик, който НЕ гърми — за проверка "този бутон не хвърля".
   Връща null при успех или самата грешка. */
function tryClick(w, el, label) {
  try { realClick(w, el, label); return null; }
  catch (e) { return e; }
}

/* onchange / oninput / onsubmit и т.н. */
function fire(w, el, event) {
  const attr = 'on' + event;
  if (!el) throw new Error('елементът не съществува');
  const code = el.getAttribute(attr);
  if (!code) throw new Error('няма ' + attr + ': ' + el.outerHTML.slice(0, 160));
  const fn = w.eval('(function(el){ (function(){' + code + '}).call(el); })');
  fn(el);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Търсене на елементи

   ВНИМАНИЕ: не търси по контейнер. Обвиващият <div> "съдържа" текста на всеки
   бутон в реда, така че querySelector('div').textContent.indexOf('X') винаги
   е истина и тестът лъже. Затова помощниците гледат само button/span.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Само <button> — съдържа текста. Ползвай при "има ли такъв бутон". */
function btn(root, text) {
  if (!root) return null;
  return Array.from(root.querySelectorAll('button'))
    .find(b => (b.textContent || '').indexOf(text) >= 0) || null;
}

/* Само <button>, точно съвпадение след trim. */
function btnExact(root, text) {
  if (!root) return null;
  return Array.from(root.querySelectorAll('button'))
    .find(b => (b.textContent || '').trim() === text) || null;
}

/* Бутон ИЛИ кликаем span/бадж. */
function ctrl(root, text) {
  if (!root) return null;
  return Array.from(root.querySelectorAll('button, span, a'))
    .find(b => (b.textContent || '').indexOf(text) >= 0) || null;
}

/* Всички бутони с този текст (за проверка на брой). */
function allBtns(root, text) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('button'))
    .filter(b => (b.textContent || '').indexOf(text) >= 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Дати спрямо днес — за да не гният тестовете след месец.
   ВАЖНО: локални getter-и, не toISOString() (България е UTC+2/+3).
   ═══════════════════════════════════════════════════════════════════════════ */
function dayOffset(n) {
  const x = new Date();
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() + (n || 0));
  const p = v => (v < 10 ? '0' : '') + v;
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}
function tsOffset(n) {
  const x = new Date();
  x.setDate(x.getDate() + (n || 0));
  return x.toISOString();
}

/* Изчаква микро/макро таска (промисите от sbGet и т.н.). */
const tick = () => new Promise(r => setTimeout(r, 0));
const ticks = async n => { for (let i = 0; i < (n || 3); i++) await tick(); };

module.exports = {
  boot, realClick, tryClick, fire,
  btn, btnExact, ctrl, allBtns,
  ok, section, report, guard,
  dayOffset, tsOffset, tick, ticks,
  MODULE_ORDER, repoDir,
  counts: () => ({ pass, fail })
};
