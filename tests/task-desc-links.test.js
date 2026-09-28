/* Описанието на задача: четимо + кратък текст вместо дълъг адрес (28.09.2026).

   Две неща в един тест, защото се пипат на едни и същи места:
     1. ЧЕТИМОСТ — един клас .bul-desc (12.5px/#475569/pre-line) вместо осем
        inline копия на 11px/#94a3b8, и полето „Описание" е textarea с 3 реда и
        автораст, а не <input> в един ред;
     2. ЛИНКОВЕ — linkify() разбира [текст](адрес), а linkifyPlain() го разгъва
        до „текст (адрес)" там, където няма къде да се щракне (хартия, push).

   Заковава и две неща, които изскочиха пътьом:
     · esc('') връща ТИРЕ. Формата за редакция пълнеше описанието с
       esc(t.description||'') → празно описание ставаше „—" и се записваше така.
       В базата вече има един такъв ред (recurring_tasks „ЗАРЕЖДАНЕ АРТИКУЛИ НА
       Л.М.", 24.09.2026). Сега е escVal().
     · адресът влиза в стойност на АТРИБУТ, а esc() не пипа кавичките. Тоест
       `[x](https://a.bg/"onmouseover=…)` затваряше href-а и добавяше свой
       атрибут — браузърите приемат нов атрибут веднага след затварящата
       кавичка. Дупката е стара (голите адреси я имаха), кратката форма само я
       скриваше по-добре.

   Пускане: node tests/task-desc-links.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, guard, section, report, ticks } = H;

/* ── котва: сряда 12:00 от текущата реална седмица ───────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}
const WED = isoOf(ANCHOR);

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Троян', 'Ловеч'];

const MD    = '[Инструкцията](https://example.com/dok.pdf)';
const BAD   = '[Опасно](javascript:alert(1))';

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-0', week_number: 0, year: 2026, department: 'admin',
    title: 'Задача ' + id, description: null, due_date: WED, due_dates: [WED],
    spans_from: null, starts_on: null, target_stores: null, task_type: 'info',
    report_groups: null, linked_module: null, auto_complete: false,
    attachments: null, sort_order: 1, created_by: 'Админ', created_at: WED
  }, over || {});
}
function freshDb() {
  return {
    seq: 0,
    tasks: [
      task('t-md',    { title: 'Зареждане по схема', description: 'Преди 10:00. ' + MD, sort_order: 1 }),
      task('t-bad',   { title: 'Съмнителна',        description: BAD, sort_order: 2 }),
      task('t-empty', { title: 'Без описание',      description: '', sort_order: 3 }),
      /* Описание на ДВА реда — възможно е само откакто полето е textarea. */
      task('t-nl',    { title: 'На два реда',       description: 'Първи ред\nВтори ред', sort_order: 4 })
    ],
    comps: []
  };
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onTasks = url.indexOf('/bulletin_tasks') >= 0;
    if (m === 'GET' || !onTasks) return orig.call(this, url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    const idm = /[?&]id=eq\.([^&]+)/.exec(url);
    orig.call(this, url, init);
    if (m === 'POST') {
      const row = Object.assign({ id: 't-n' + (++db.seq) }, body);
      db.tasks.push(row);
      return Promise.resolve({ ok: true, status: 201, headers: { get: () => null }, json: () => Promise.resolve([row]), text: () => Promise.resolve('') });
    }
    if (m === 'PATCH') {
      db.tasks.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); });
      return Promise.resolve({ ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    return orig.call(this, url, init);
  };
}
function bulOf(w) {
  const cal = {}; w.DKEYS.forEach(x => { cal[x] = []; });
  return {
    id: 'b-0', week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
    created_at: WED, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
}
function env(db, over) {
  over = over || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js', 'email.js'],
    user: over.user || ADMIN,
    confirm: true,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: () => h.buls,
      bulletin_tasks: url => {
        const byBul = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
        if (byBul) return db.tasks.filter(t => t.bulletin_id === byBul[1]).slice().sort((a, b) => a.sort_order - b.sort_order);
        if (url.indexOf('spans_from=not.is.null') >= 0) return [];
        const byIds = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (byIds) { const ids = byIds[1].split(','); return db.tasks.filter(t => ids.indexOf(t.id) >= 0); }
        return db.tasks;
      },
      task_completions: () => db.comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulOf(h.w)];
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-0';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  wireDb(h, db);
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const calOf = h => h.doc.getElementById('sec-calendar');
async function view(db, over) {
  const h = env(db, over);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return h;
  await settle(() => !!calOf(h));
  return h;
}

(async function () {

  const u = env(freshDb()).w;     /* само за чистите функции */

  section('1. linkify(): кратката форма става линк');
  {
    const html = u.linkify('Преди 10:00. ' + MD);
    ok('има <a> с адреса', html.indexOf('href="https://example.com/dok.pdf"') >= 0, html);
    ok('текстът на линка е краткият', html.indexOf('>Инструкцията</a>') >= 0, html);
    ok('сурови скоби НЕ остават', html.indexOf('[Инструкцията]') < 0, html);
    ok('останалият текст е непокътнат', html.indexOf('Преди 10:00.') >= 0, html);
    ok('target и rel са там (нов таб, без window.opener)',
      html.indexOf('target="_blank"') >= 0 && html.indexOf('rel="noopener"') >= 0, html);
  }

  section('2. linkify(): голият адрес работи както преди');
  {
    const html = u.linkify('Виж https://example.com/a?x=1&y=2 сега');
    ok('адресът става линк', html.indexOf('href="https://example.com/a?x=1&amp;y=2"') >= 0, html);
    ok('и се вижда като текст', html.indexOf('>https://example.com/a?x=1&amp;y=2</a>') >= 0, html);
    ok('& е escape-нато ЕДИН път (не &amp;amp;)', html.indexOf('&amp;amp;') < 0, html);
    /* Точката след адреса не влиза в него — стара функционалност, която
       кратката форма не бива да е счупила. */
    const dot = u.linkify('Виж https://example.com/a. Край');
    ok('точката след адреса остава извън линка',
      dot.indexOf('href="https://example.com/a"') >= 0 && dot.indexOf('</a>. Край') >= 0, dot);
  }

  section('3. СИГУРНОСТ: само http(s) и mailto, и нищо не се преглъща');
  {
    const bad = u.linkify(BAD);
    ok('javascript: НЕ става линк', bad.indexOf('<a ') < 0, bad);
    ok('и се показва какъвто е написан', bad.indexOf('[Опасно](javascript:alert(1))') >= 0, bad);

    const data = u.linkify('[Х](data:text/html,<script>alert(1)</script>)');
    ok('data: НЕ става линк', data.indexOf('<a ') < 0, data);
    ok('и таговете вътре са escape-нати', data.indexOf('&lt;script&gt;') >= 0, data);

    ok('mailto: СТАВА линк',
      u.linkify('[Писмо](mailto:a@temax.bg)').indexOf('href="mailto:a@temax.bg"') >= 0,
      u.linkify('[Писмо](mailto:a@temax.bg)'));

    /* Кавичка в адреса: без escape тя затваря href-а и следващото се чете като
       НОВ атрибут (браузърите го приемат и без разделител). */
    const q = u.linkify('[Х](https://a.bg/"onmouseover=alert`1`)');
    ok('кавичката в адреса е &quot;', q.indexOf('&quot;') >= 0, q);
    ok('и НЕ излиза втори атрибут след href',
      q.indexOf('"onmouseover') < 0, q);

    ok('и самият href е цял и escape-нат',
      q.indexOf('href="https://a.bg/&quot;onmouseover') >= 0, q);
    /* Същото при ГОЛ адрес. Проверката е върху СТОЙНОСТТА на href, не върху
       целия HTML: в ТЕКСТА на линка кавичката е безобидна и си стои. */
    const qb = u.linkify('https://a.bg/"onmouseover=alert`1`');
    const href = (/href="([^"]*)"/.exec(qb) || [])[1] || '';
    ok('същото и при ГОЛ адрес — href не се затваря рано',
      href.indexOf('onmouseover') >= 0 && href.indexOf('"') < 0, href);

    ok('таг в текста на линка се escape-ва',
      u.linkify('[<b>Х</b>](https://a.bg/1)').indexOf('&lt;b&gt;') >= 0,
      u.linkify('[<b>Х</b>](https://a.bg/1)'));
  }

  section('4. linkifyPlain(): адресът НЕ се губи (хартия, push)');
  {
    ok('текст (адрес)', u.linkifyPlain(MD) === 'Инструкцията (https://example.com/dok.pdf)',
      u.linkifyPlain(MD));
    ok('невалиден адрес остава какъвто е', u.linkifyPlain(BAD) === BAD, u.linkifyPlain(BAD));
    ok('голият адрес не се пипа',
      u.linkifyPlain('Виж https://a.bg/1') === 'Виж https://a.bg/1');
    ok('празно не гърми', u.linkifyPlain(null) === '' && u.linkifyPlain(undefined) === '');
    ok('НЕ вкарва тагове', u.linkifyPlain(MD).indexOf('<') < 0);
  }

  section('5. На екран: един клас, не осем inline копия');
  {
    /* Описанието на ОБИКНОВЕНА задача се показва в блока на отдела, НЕ в
       седмичния календар — там редовете са само заглавие и чекбокс. Единственото
       изключение е notice: при нея описанието е самото съдържание, затова
       calNoticeRowHtml() го рендира и в календара. Проверяват се и двете. */
    const h = await view(freshDb());
    const panel = h.doc.getElementById('dept-panel-admin');
    if (ok('блокът на отдела се рендира', !!panel)) {
      const html = panel.innerHTML;
      ok('описанието е в .bul-desc', html.indexOf('class="bul-desc"') >= 0, html.slice(0, 400));
      ok('старият inline стил го няма',
        html.indexOf('font-size:11px;color:#94a3b8') < 0, html.slice(0, 400));
      ok('линкът е кликаем', html.indexOf('href="https://example.com/dok.pdf"') >= 0,
        html.slice(0, 600));
      /* По textContent, не по innerHTML: placeholder-ите на полетата нарочно
         СЪДЪРЖАТ „[Инструкцията](…)" като подсказка, а модалите стоят в DOM-а
         скрити. textContent не влиза в атрибути, тоест мери точно това, което
         човекът ВИЖДА. */
      ok('сурова кратка форма НЕ се вижда никъде на екрана',
        h.doc.body.textContent.indexOf('[Инструкцията]') < 0);
      /* А невалидният адрес СЕ вижда — иначе описанието би изглеждало празно и
         никой не би разбрал защо линкът не работи. */
      ok('невалидният адрес се вижда какъвто е',
        h.doc.body.textContent.indexOf('[Опасно](javascript:alert(1))') >= 0);
      /* Новият ред остава в текста (показва го pre-line от класа, не <br>). */
      ok('описанието на два реда стига до екрана с новия ред',
        html.indexOf('Първи ред\nВтори ред') >= 0, JSON.stringify(html.slice(0, 200)));
    }
  }

  section('6. Полето „Описание" е textarea с 3 реда, не вход в един ред');
  {
    const h = await view(freshDb());
    if (guard('openTaskModalForDept() не хвърля', () => h.w.openTaskModalForDept('admin'))) {
      const el = h.doc.getElementById('tk-desc');
      if (ok('полето съществува', !!el)) {
        ok('и е TEXTAREA', el.tagName === 'TEXTAREA', el.tagName);
        ok('с 3 реда', el.getAttribute('rows') === '3', el.getAttribute('rows'));
        ok('носи класа за размер', (el.className || '').indexOf('fi-desc') >= 0, el.className);
        ok('подсказва кратката форма',
          (el.getAttribute('placeholder') || '').indexOf('[Инструкцията]') >= 0,
          el.getAttribute('placeholder'));
      }
    }
  }

  section('7. Редакция: празното описание НЕ става „—"');
  {
    const db = freshDb();
    const h = await view(db);
    if (guard('openEditTaskModal(t-empty) не хвърля', () => h.w.openEditTaskModal('t-empty'))) {
      const el = h.doc.getElementById('etk-desc');
      if (ok('полето съществува', !!el)) {
        ok('и е TEXTAREA', el.tagName === 'TEXTAREA', el.tagName);
        ok('стойността е ПРАЗНА, не тире', el.value === '', JSON.stringify(el.value));
        const save = btnExact(h.doc, '💾 Запази');
        if (ok('бутонът „Запази" съществува', !!save)) {
          realClick(h.w, save, 'Запази');
          await ticks(); await ticks();
          const row = db.tasks.find(x => x.id === 't-empty');
          ok('записът НЕ вкарва тире в базата', row && row.description !== '—',
            JSON.stringify(row && row.description));
        }
      }
    }
  }

  section('8. Редакция: описанието се показва цяло и полето се разгъва');
  {
    const h = await view(freshDb());
    if (guard('openEditTaskModal(t-md) не хвърля', () => h.w.openEditTaskModal('t-md'))) {
      const el = h.doc.getElementById('etk-desc');
      if (ok('полето съществува', !!el)) {
        ok('носи истинското описание, с кратката форма',
          el.value.indexOf(MD) >= 0, JSON.stringify(el.value));
        ok('височината е зададена при отваряне (bulAutoGrow)',
          /^\d+px$/.test(el.style.height || ''), JSON.stringify(el.style.height));
      }
      /* Таванът пази бутоните „Запази/Откажи" да не паднат под ръба на модала. */
      const tall = h.doc.getElementById('etk-desc');
      Object.defineProperty(tall, 'scrollHeight', { value: 9000, configurable: true });
      h.w.bulAutoGrow(tall);
      ok('и не минава 260px', parseInt(tall.style.height, 10) === 260, tall.style.height);
      ok('bulAutoGrow(null) не гърми', guard('bulAutoGrow(null)', () => h.w.bulAutoGrow(null)));
    }
  }

  section('9. Paste на HTML линк → кратката форма');
  {
    const h = await view(freshDb());
    h.w.openTaskModalForDept('admin');
    const el = h.doc.getElementById('tk-desc');

    const pasteEv = (html, plain) => ({
      target: el, prevented: false,
      preventDefault() { this.prevented = true; },
      clipboardData: { getData: t => (t === 'text/html' ? html : (plain || '')) }
    });

    el.value = 'Виж '; el.selectionStart = el.selectionEnd = 4;
    let ev = pasteEv('<a href="https://example.com/dok.pdf">Инструкцията за приемане</a>', 'Инструкцията за приемане');
    h.w.bulDescPaste(ev);
    ok('поставянето е прихванато', ev.prevented === true);
    ok('в полето влиза [текст](адрес)',
      el.value === 'Виж [Инструкцията за приемане](https://example.com/dok.pdf)',
      JSON.stringify(el.value));
    ok('курсорът е след вмъкнатото', el.selectionStart === el.value.length, String(el.selectionStart));

    /* javascript: не се превръща в нищо — поставянето минава по нормалния път. */
    el.value = ''; el.selectionStart = el.selectionEnd = 0;
    ev = pasteEv('<a href="javascript:alert(1)">Опасно</a>', 'Опасно');
    h.w.bulDescPaste(ev);
    ok('javascript: НЕ се вмъква като линк', ev.prevented === false && el.value === '',
      JSON.stringify(el.value));

    /* Текстът на линка е самият адрес → нищо не печелим, оставяме го. */
    el.value = ''; el.selectionStart = el.selectionEnd = 0;
    ev = pasteEv('<a href="https://a.bg/1">https://a.bg/1</a>', 'https://a.bg/1');
    h.w.bulDescPaste(ev);
    ok('адрес като текст на линка се оставя както е', ev.prevented === false,
      JSON.stringify(el.value));

    /* Обикновен текст без HTML — не се пипа. */
    el.value = ''; el.selectionStart = el.selectionEnd = 0;
    ev = pasteEv('', 'просто текст');
    h.w.bulDescPaste(ev);
    ok('поставяне на чист текст не се прихваща', ev.prevented === false);

    /* Скоба в текста на линка би счупила формата → по-добре да не се пипа. */
    el.value = ''; el.selectionStart = el.selectionEnd = 0;
    ev = pasteEv('<a href="https://a.bg/1">Виж [това]</a>', 'Виж [това]');
    h.w.bulDescPaste(ev);
    ok('скоба в текста → не се пипа', ev.prevented === false, JSON.stringify(el.value));
  }

  section('10. Хартия: адресът остава на листа');
  {
    const h = await view(freshDb());
    let printed = '';
    h.w.open = () => ({
      document: { write(x) { printed += String(x); }, close() {} },
      focus() {}, print() {}, close() {}
    });
    if (guard('printSection() не хвърля', () => h.w.printSection('admin'))) {
      /* Мери се ВИДИМИЯТ текст, не HTML-ът: адресът в href="…" присъства в
         източника и когато на листа го няма. Първата версия на тази проверка
         гледаше низа `printed` и минаваше и срещу непоправен печат — мутант D5
         я хвана. */
      const box = h.doc.createElement('div');
      box.innerHTML = printed;
      const paper = (box.textContent || '').replace(/\s+/g, ' ');
      ok('текстът на линка е на листа', paper.indexOf('Инструкцията') >= 0, paper.slice(0, 300));
      ok('и адресът СЪЩО — иначе хартията е безполезна',
        paper.indexOf('https://example.com/dok.pdf') >= 0, paper.slice(0, 300));
      ok('сурова кратка форма НЯМА на хартия',
        paper.indexOf('[Инструкцията]') < 0, paper.slice(0, 300));
    }
  }

  section('11. Седмичното писмо: линк, не сурови скоби');
  {
    const h = await view(freshDb());
    const html = h.w.buildWeeklyDigestHtml('Троян', h.w.bulTasks, h.buls[0].week_number, h.buls[0].year);
    ok('описанието е в писмото', html.indexOf('Инструкцията') >= 0, html.slice(0, 200));
    ok('и е <a> с адреса', html.indexOf('href="https://example.com/dok.pdf"') >= 0,
      html.slice(html.indexOf('Инструкцията') - 200, html.indexOf('Инструкцията') + 80));
    ok('сурова кратка форма НЯМА в писмото', html.indexOf('[Инструкцията]') < 0);
    /* Новият ред трябва да изглежда еднакво на двете места: порталът го показва
       през .bul-desc, писмото има свой .task-meta и без pre-line го слепва. */
    ok('описанието на два реда влиза в писмото',
      html.indexOf('Първи ред') >= 0 && html.indexOf('Втори ред') >= 0);
    ok('и .task-meta пази новия ред (pre-line)',
      /\.task-meta\{[^}]*white-space:pre-line/.test(html), html.slice(0, 200));
  }

  report();
})();
