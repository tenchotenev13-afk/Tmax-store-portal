/* „📅 График ревизии“ (revisions.js) + под-лентата на „Ревизии и преоценка“.
   Интеграционно: shared.js + revaluation.js + revisions.js в реда от
   index.html (под-бутонът „Преоценка“ е по rvCanSee от revaluation.js).
   Парсерът на еднократния импорт (tools/revision-schedule-2026.js) — с
   реалните редове от „график до края на 2026.xlsx“ (първите седмици).

   Мутационна проверка (14.10.2026) — всеки вариант е пуснат и е паднал:
     R1 rsSplit без „текуща“ (прозорецът с днес отива в бъдещите)
        → пада „текущата седмица е първа и с бадж";
     R2 миналите не са свити (#rs-past без display:none)
        → пада „миналите са свити";
     R3 rsCanEdit връща true за всички
        → пада „обектът: единственият бутон е „Минали““;
     R4 rsSaveErr без разпознаване на 409 / 23505
        → пада „дублиран starts_on → човешко съобщение";
     R5 rsFormBody пази групите и при вид „none“
        → пада „вид „Няма ревизии“ → groups []".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, dayOffset, ticks } = H;
const P = require('../tools/revision-schedule-2026.js');

const WEEKS = [
  { id: 'w-p2', starts_on: dayOffset(-15), ends_on: dayOffset(-13), kind: 'groups', note: null, groups: [{ code: '30122416', name: 'Почви' }] },
  { id: 'w-p1', starts_on: dayOffset(-8), ends_on: dayOffset(-6), kind: 'none', note: 'старт брошура — няма ревизии', groups: [] },
  { id: 'w-now', starts_on: dayOffset(-1), ends_on: dayOffset(1), kind: 'groups', note: '07.09 почивен ден', groups: [{ code: '30121010', name: 'Навеси' }, { code: '30121110', name: 'Сенници и тенти' }] },
  { id: 'w-f2', starts_on: dayOffset(13), ends_on: dayOffset(15), kind: 'movements', note: null, groups: [] },
  { id: 'w-f1', starts_on: dayOffset(6), ends_on: dayOffset(8), kind: 'groups', note: null, groups: [] }
];
const MANAGER = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'admin', store_name: 'Централен офис' };

let idSeq = 0;
function env(o) {
  o = o || {};
  const h = boot({
    modules: ['revaluation.js', 'revisions.js'],
    user: o.user || ADMIN,
    confirm: o.confirm,
    fail: o.fail,
    data: {
      revision_schedule: o.weeks || WEEKS,
      app_settings: o.settings || [],
      users: [], stores: [], revaluation_campaigns: []
    }
  });
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    const p = orig(url, init);
    const m = (init && init.method || 'GET').toUpperCase();
    if (m !== 'POST' || url.indexOf('/revision_schedule') < 0) return p;
    return p.then(r => {
      if (!r.ok) return r;
      const row = Object.assign({ id: 'new-' + (++idSeq) }, JSON.parse(init.body));
      return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve(JSON.stringify([row])) };
    });
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-rev-schedule');
async function open(h) { await h.w.loadRevSchedule(); await ticks(4); }
function setVal(h, id, val) { const el = h.doc.getElementById(id); el.value = val; fire(h.w, el, 'change'); }

(async function run() {

  section('1. Подредба: текущата отгоре, после бъдещите, миналите свити');
  {
    const h = env(); await open(h);
    const cards = Array.from(mod(h).querySelectorAll('.rs-week'));
    ok('текущата седмица е първа и с бадж „тази седмица“', cards[0] && cards[0].id === 'rs-week-w-now' && !!cards[0].querySelector('.rs-now'));
    ok('само една с бадж', mod(h).querySelectorAll('.rs-now').length === 1);
    const fut = Array.from(h.doc.querySelectorAll('#rs-future .rs-week')).map(x => x.id);
    ok('бъдещите — по дата (f1, после f2)', fut.join(',') === 'rs-week-w-f1,rs-week-w-f2', fut.join(','));
    ok('миналите са свити', h.doc.getElementById('rs-past').style.display === 'none');
    const tg = h.doc.getElementById('rs-past-toggle');
    ok('бутон „Минали (2)“', tg && tg.textContent.indexOf('Минали (2)') >= 0);
    realClick(h.w, tg);
    ok('клик → миналите се показват', h.doc.getElementById('rs-past').style.display === '');
    const past = Array.from(h.doc.querySelectorAll('#rs-past .rs-week')).map(x => x.id);
    ok('миналите — най-скорошната първа', past.join(',') === 'rs-week-w-p1,rs-week-w-p2', past.join(','));
    const now = h.doc.getElementById('rs-week-w-now').textContent;
    ok('групите — код и име', now.indexOf('30121010') >= 0 && now.indexOf('Сенници и тенти') >= 0);
    ok('бележката се вижда', now.indexOf('07.09 почивен ден') >= 0);
    ok('вид none → „Няма ревизии — старт брошура…“', h.doc.getElementById('rs-week-w-p1').textContent.indexOf('Няма ревизии — старт брошура') >= 0);
    ok('вид movements → „Движения“', h.doc.getElementById('rs-week-w-f2').textContent.indexOf('Движения') >= 0);
    ok('groups без групи → „Няма въведени групи.“', h.doc.getElementById('rs-week-w-f1').textContent.indexOf('Няма въведени групи') >= 0);
    const edge = env({ weeks: [{ id: 'e', starts_on: dayOffset(0), ends_on: dayOffset(0), kind: 'none', note: null, groups: [] },
      { id: 'y', starts_on: dayOffset(-3), ends_on: dayOffset(-1), kind: 'none', note: null, groups: [] }] });
    await open(edge);
    ok('седмица от един ден = днес → текуща; свършила вчера → минала', !!edge.doc.querySelector('#rs-current #rs-week-e') && !!edge.doc.querySelector('#rs-past #rs-week-y'));
  }

  section('2. Обектът — само чете');
  {
    const h = env({ user: MANAGER }); await open(h);
    const b = Array.from(mod(h).querySelectorAll('button')).map(x => x.textContent.trim());
    ok('обектът: единственият бутон е „Минали“', b.length === 1 && b[0].indexOf('Минали') >= 0, b.join(' | '));
    ok('няма форма', !h.doc.getElementById('rs-form'));
    h.w.rsOpenNew();
    ok('rsOpenNew отвън не отваря форма', !h.doc.getElementById('rs-form'));
    const n = h.calls.del.length;
    await h.w.rsDelete('w-now');
    ok('rsDelete отвън не трие', h.calls.del.length === n);
  }

  section('3. Контролинг: нова седмица с 2 групи → POST с правилен jsonb');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), '＋ Седмица'));
    ok('формата се отваря', !!h.doc.getElementById('rs-form'));
    ok('празните полета са "" (не „—")', h.doc.getElementById('rs-f-note').value === '' && h.doc.getElementById('rs-g-code-0').value === '' && h.doc.getElementById('rs-g-name-0').value === '');
    setVal(h, 'rs-f-from', '2026-11-30'); setVal(h, 'rs-f-to', '2026-12-02');
    setVal(h, 'rs-f-note', 'бележка 1');
    setVal(h, 'rs-g-code-0', '24101010'); setVal(h, 'rs-g-name-0', 'Проточни бойлери');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), '＋ Група'));
    setVal(h, 'rs-g-code-1', ' 24101011 '); setVal(h, 'rs-g-name-1', 'Обемни бойлери');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), '＋ Група')); /* празен ред — пропуска се */
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    const p = h.calls.post.find(x => x.table === 'revision_schedule');
    ok('POST към revision_schedule', !!p);
    ok('groups = 2 обекта {code,name}, кодът е низ и подрязан', p && JSON.stringify(p.body.groups) === JSON.stringify([{ code: '24101010', name: 'Проточни бойлери' }, { code: '24101011', name: 'Обемни бойлери' }]), p && JSON.stringify(p.body.groups));
    ok('дати, вид, бележка, created_by', p && p.body.starts_on === '2026-11-30' && p.body.ends_on === '2026-12-02' && p.body.kind === 'groups' && p.body.note === 'бележка 1' && p.body.created_by === 'Миглена Павлова');
    ok('новата седмица е в списъка, формата е затворена', !!h.doc.querySelector('[id^="rs-week-new-"]') && !h.doc.getElementById('rs-form'));
  }

  section('4. Седмица без групи; вид „Няма ревизии“; проверки');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), '＋ Седмица'));
    setVal(h, 'rs-f-from', '2026-12-07'); setVal(h, 'rs-f-to', '2026-12-09');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    const p = h.calls.post.pop();
    ok('без групи → groups []', p && Array.isArray(p.body.groups) && p.body.groups.length === 0);
    realClick(h.w, btn(mod(h), '＋ Седмица'));
    setVal(h, 'rs-f-from', '2026-12-14'); setVal(h, 'rs-f-to', '2026-12-16');
    setVal(h, 'rs-g-code-0', '111'); setVal(h, 'rs-g-name-0', 'X');
    setVal(h, 'rs-f-kind', 'none');
    ok('при „Няма ревизии“ полетата за групи изчезват', !h.doc.getElementById('rs-g-code-0'));
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    const p2 = h.calls.post.pop();
    ok('вид „Няма ревизии“ → groups []', p2 && p2.body.kind === 'none' && p2.body.groups.length === 0, p2 && JSON.stringify(p2.body));
    realClick(h.w, btn(mod(h), '＋ Седмица'));
    setVal(h, 'rs-f-from', '2026-12-21'); setVal(h, 'rs-f-to', '2026-12-20');
    const n = h.calls.post.length;
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(3);
    ok('„до“ преди „от“ → отказ, без POST', h.calls.post.length === n);
    setVal(h, 'rs-f-to', '2026-12-23'); setVal(h, 'rs-g-name-0', 'Без код');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(3);
    ok('група без код → отказ', h.calls.post.length === n && h.calls.toast.some(t => t.indexOf('без код') >= 0));
    setVal(h, 'rs-f-from', '');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(3);
    ok('без „от“ → отказ', h.calls.post.length === n);
  }

  section('5. Дублиран starts_on → грешката се показва, не се поглъща');
  {
    const h = env({ fail: { POST: { status: 409, url: /revision_schedule/, body: { code: '23505', message: 'duplicate key value violates unique constraint "revision_schedule_uq"' } } } });
    await open(h);
    realClick(h.w, btn(mod(h), '＋ Седмица'));
    setVal(h, 'rs-f-from', '2026-10-05'); setVal(h, 'rs-f-to', '2026-10-07');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    ok('дублиран starts_on → човешко съобщение', h.calls.toast.some(t => t.indexOf('Вече има седмица, която започва на 05.10.2026') >= 0), h.calls.toast.join(' | '));
    ok('формата остава отворена (нищо не е изгубено)', !!h.doc.getElementById('rs-form') && h.doc.getElementById('rs-f-from').value === '2026-10-05');
    ok('нищо не е добавено в списъка', h.w.rsWeeks.length === WEEKS.length);
    const g = env({ fail: { POST: { status: 500, url: /revision_schedule/, body: { message: 'boom' } } } }); await open(g);
    realClick(g.w, btn(mod(g), '＋ Седмица'));
    setVal(g, 'rs-f-from', '2026-10-05'); setVal(g, 'rs-f-to', '2026-10-07');
    realClick(g.w, btn(g.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    ok('друга грешка → причината от базата', g.calls.toast.some(t => t.indexOf('Седмицата не е записана: boom') >= 0));
  }

  section('6. Редакция и изтриване');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(h.doc.getElementById('rs-week-w-now'), '✏️'));
    ok('формата е на мястото на седмицата, с данните ѝ', !!h.doc.getElementById('rs-form') && h.doc.getElementById('rs-g-code-1').value === '30121110');
    setVal(h, 'rs-f-note', 'нова бележка');
    realClick(h.w, btn(h.doc.getElementById('rs-form'), '–')); /* маха първата група */
    realClick(h.w, btn(h.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    const p = h.calls.patch.find(x => x.table === 'revision_schedule');
    ok('PATCH id=eq.w-now', p && p.url.indexOf('id=eq.w-now') >= 0);
    ok('бележка + 1 група + updated_by', p && p.body.note === 'нова бележка' && p.body.groups.length === 1 && p.body.groups[0].code === '30121110' && p.body.updated_by === 'Миглена Павлова' && !!p.body.updated_at);
    ok('картата показва новата бележка', h.doc.getElementById('rs-week-w-now').textContent.indexOf('нова бележка') >= 0);
    const f = env({ fail: { PATCH: /revision_schedule/ } }); await open(f);
    realClick(f.w, btn(f.doc.getElementById('rs-week-w-now'), '✏️'));
    setVal(f, 'rs-f-note', 'x');
    realClick(f.w, btn(f.doc.getElementById('rs-form'), 'Запази')); await ticks(4);
    ok('провален PATCH → червен toast, формата стои', f.calls.toast.some(t => t.indexOf('Промяната не е записана') >= 0) && !!f.doc.getElementById('rs-form'));

    const d0 = env({ confirm: false }); await open(d0);
    realClick(d0.w, btn(d0.doc.getElementById('rs-week-w-f1'), '🗑')); await ticks(3);
    ok('🗑 без потвърждение → нищо', d0.calls.del.length === 0 && d0.calls.confirm.length === 1);
    const d = env(); await open(d);
    realClick(d.w, btn(d.doc.getElementById('rs-week-w-f1'), '🗑')); await ticks(3);
    ok('🗑 с потвърждение → DELETE', d.calls.del.some(u => u.indexOf('/revision_schedule?id=eq.w-f1') >= 0));
    ok('и седмицата изчезва', !d.doc.getElementById('rs-week-w-f1'));
  }

  section('7. Провалено зареждане — видимо');
  {
    const h = env({ fail: { GET: /revision_schedule/ } }); await open(h);
    ok('червен ред в модула', !!h.doc.getElementById('rs-load-err'));
    ok('и toast', h.calls.toast.some(t => t.indexOf('Графикът не се зареди') >= 0));
  }

  section('8. Таб „Ревизии и преоценка“ и под-лентата');
  {
    const login = async (o) => { const h = env(o); guard('setupTabsForRole', () => h.w.setupTabsForRole()); await ticks(5); return h; };
    const el = (h, id) => h.doc.getElementById(id);
    let h = await login({ user: MANAGER });
    ok('manager: табът се вижда', el(h, 'tab-revaluation').style.display === '');
    ok('табът е „Ревизии и преоценка“', el(h, 'tab-revaluation').textContent.indexOf('Ревизии и преоценка') >= 0);
    realClick(h.w, el(h, 'tab-revaluation')); await ticks(5);
    ok('клик по таба → графикът (по подразбиране)', mod(h).style.display === 'block' && !!h.doc.querySelector('#mod-rev-schedule .rs-week'));
    ok('под-лентата се вижда, „График“ е активен, табът е активен', el(h, 'rev-subnav').style.display === 'block' &&
      el(h, 'rvs-schedule').classList.contains('active') && el(h, 'tab-revaluation').classList.contains('active'));
    ok('manager без ключ: вижда само „График“', el(h, 'rvs-schedule').style.display === '' && el(h, 'rvs-revaluation').style.display === 'none');
    guard('showModule(revaluation)', () => h.w.showModule('revaluation')); await ticks(5);
    ok('manager без ключ: showModule(revaluation) → „Нямаш достъп“', el(h, 'mod-revaluation').textContent.indexOf('Нямаш достъп') >= 0);
    guard('showModule(transport)', () => h.w.showModule('transport'));
    ok('друг модул → под-лентата се скрива', el(h, 'rev-subnav').style.display === 'none');

    h = await login({ user: MANAGER, settings: [{ key: 'revaluation_stores', value: 'on' }] });
    ok('manager с „on“: вижда и „Преоценка“', el(h, 'rvs-revaluation').style.display === '');

    h = await login({ user: ADMIN });
    ok('admin: вижда и двата под-бутона', el(h, 'rvs-schedule').style.display === '' && el(h, 'rvs-revaluation').style.display === '');
    realClick(h.w, el(h, 'rvs-revaluation')); await ticks(5);
    ok('клик „Преоценка“ → активен е той, табът остава активен', el(h, 'rvs-revaluation').classList.contains('active') &&
      !el(h, 'rvs-schedule').classList.contains('active') && el(h, 'tab-revaluation').classList.contains('active') && el(h, 'mod-revaluation').style.display === 'block');

    h = await login({ user: { email: 'k@temax.bg', display_name: 'Каса', role: 'kasa', store_name: 'Шумен' } });
    ok('kasa: табът е скрит', el(h, 'tab-revaluation').style.display === 'none');
    h = await login({ user: { email: 'sk@temax.bg', display_name: 'Склад', role: 'sklad', store_name: 'Шумен' } });
    ok('sklad: табът се вижда', el(h, 'tab-revaluation').style.display === '');
  }

  section('9. Парсер на еднократния импорт (реалните редове от файла)');
  {
    const r = (s) => { try { return P.parseRange(s); } catch (e) { return e.message; } };
    ok('„31.08-03.09“', JSON.stringify(r('31.08-03.09')) === '{"from":"2026-08-31","to":"2026-09-03"}');
    ok('„08.09-09.09.“', JSON.stringify(r('08.09-09.09.')) === '{"from":"2026-09-08","to":"2026-09-09"}');
    ok('„12-14.10.2026“', JSON.stringify(r('12-14.10.2026')) === '{"from":"2026-10-12","to":"2026-10-14"}');
    ok('„09.11.-11.11“', JSON.stringify(r('09.11.-11.11')) === '{"from":"2026-11-09","to":"2026-11-11"}');
    ok('„30.11-02.12.“ (през месец)', JSON.stringify(r('30.11-02.12.')) === '{"from":"2026-11-30","to":"2026-12-02"}');
    ok('„28.12-30.12“', JSON.stringify(r('28.12-30.12')) === '{"from":"2026-12-28","to":"2026-12-30"}');
    ok('друга година → грешка', /година 2027/.test(r('12-14.10.2027')));
    ok('31.09 → грешка', /невалидна дата/.test(r('29.09-31.09')));
    const AOA = [['Срок', 'групи', 'Име на групата'],
      ['31.08-03.09', 'старт брошура 04.09-няма ревизии', ''],
      ['', '07.09 почивен ден заради 06.09', ''],
      ['08.09-09.09.', '30122416', 'Почви'],
      ['14.09-16.09', '30101110', 'Плажни артикули'],
      ['', '30101210', 'Басейни'],
      ['21-23.09.2026', 'старт брошура 29.09-няма ревизии, 22.09 вторник поч.ден', ''],
      ['07.12-09.12', '', 'движения'],
      ['', '', '']];
    const w = P.parseScheduleAoa(AOA);
    ok('5 седмици', w.length === 5, w.length);
    ok('31.08 → none + бележката', w[0].kind === 'none' && w[0].note === 'старт брошура 04.09-няма ревизии');
    ok('„07.09 почивен ден…“ → бележка на 08.09–09.09', w[1].starts_on === '2026-09-08' && w[1].note === '07.09 почивен ден заради 06.09' && w[0].note.indexOf('07.09') < 0);
    ok('08.09 → 1 група (код низ, име)', w[1].groups.length === 1 && w[1].groups[0].code === '30122416' && w[1].groups[0].name === 'Почви');
    ok('14.09 → 2 групи от редовете без дата', w[2].groups.length === 2 && w[2].groups[1].name === 'Басейни');
    ok('„движения“ → movements', w[4].kind === 'movements' && w[4].groups.length === 0);
    const sql = P.toSql(w, "импорт: о'кей");
    ok('SQL: jsonb и ескейпнат апостроф', sql.indexOf('::jsonb') > 0 && sql.indexOf("'импорт: о''кей'") > 0);
    let err = null; try { P.parseScheduleAoa([AOA[0], ['31.08-03.09', '', ''], ['31.08-03.09', '', '']]); } catch (e) { err = e.message; }
    ok('две седмици от една дата → грешка', /две седмици/.test(err || ''));
  }

  report();
})();
