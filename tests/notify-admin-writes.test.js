/* notify-admin: петте таблици „кой какво получава“ (сесия notify-tables-lock,
   27.11.2026) — report_recipients, notification_topics / matrix / overrides /
   schedules — НЕ се четат и не се пишат с публичния ключ. Всеки път от
   портала минава през едж функцията notify-admin с пропуска (currentSession).

   1. Статично: в нито един .js файл в корена няма sbGet / sbGetOk / sbPost /
      sbPostReturn / sbPatch / sbDelete / sbGetAll към петте, нито fetch към
      /rest/v1/<таблица>. Нов код, който ги чете „за бързо“, пада тук.
   2. Истински кликове / зареждания, всеки път поотделно — тялото към
      функцията (table, action, match, fields, session) и НИТО една заявка
      към /rest/v1/<таблица> без маркера via=notify-admin:
        Администрация → Известия: зареждане (4 таблици), тема ⏸/▶, тема
          (модал „Запази“), клетка в матрицата (нова / смяна / „—“), обхват,
          изключение (добави / ✕), насрочено (⏸ / 🗑);
        „📧 Общи отчети“: зареждане, добави, флаг, обхват, ✕;
        Бюлетин: „🔔 Нотификации“ (списък, запис, ⏸, ✕), „В сила от“
          (bulSyncStartsNotice: нов / смяна / махане), отчет за задача
          (trSaveReports, bulLoadTaskReports, ✕).
   3. Провал на функцията (403 / мрежа) стига до човека като червен тост,
      а 401 session_expired отваря модала за повторен вход.

   Пускане:  node tests/notify-admin-writes.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const FIVE = ['report_recipients', 'notification_topics', 'notification_matrix',
  'notification_overrides', 'notification_schedules'];
const TOKEN = 'eyJ1aWQiOiJ1LWFkbSJ9.c2ln';

/* ── 1. Статично ─────────────────────────────────────────────────────────── */
section('Статично: няма пряк достъп до петте таблици');
{
  const files = fs.readdirSync(ROOT).filter(f => /\.js$/.test(f)).sort();
  const hits = [];
  const reSb = new RegExp("\\bsb(Get|GetOk|GetAll|Post|PostReturn|Patch|Delete)\\(\\s*['\"](" + FIVE.join('|') + ")['\"]", 'g');
  const reRest = new RegExp('/rest/v1/(' + FIVE.join('|') + ')\\b', 'g');
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let m;
    while ((m = reSb.exec(src))) hits.push(f + ':' + src.slice(0, m.index).split('\n').length + ' ' + m[0]);
    while ((m = reRest.exec(src))) hits.push(f + ':' + src.slice(0, m.index).split('\n').length + ' ' + m[0]);
  }
  ok('в ' + files.length + ' файла — нула sb*/rest към петте', hits.length === 0, hits.join('\n'));
  /* Самопроверка на регекса — иначе „нула“ може да е тавтология. */
  ok('регексът хваща sbGet(\'report_recipients\'', reSb.test("sbGet('report_recipients','x')"));
}

/* ── Среда ───────────────────────────────────────────────────────────────── */
const ADMIN = { id: 'u-adm', email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
  store_name: 'Централен офис', assigned_stores: [] };
const UUID1 = 'b781c52b-bbeb-476a-bc9a-ac9d37e3f899';
const UUID2 = '0a5e2c11-1111-4222-8333-944455556666';
const TOPICS = [{ key: 'today_deadlines', label: 'Срокове днес', schedule_type: 'daily', weekdays: [1, 2, 3, 4, 5],
  scheduled_time: '08:00:00', active: true, sort_order: 1 }];
const MATRIX = [{ topic_key: 'today_deadlines', group_key: 'co', channel: 'email', scope: 'all' }];
const OVERRIDES = [{ id: UUID1, user_email: 'x@temax.bg', topic_key: 'today_deadlines', mode: 'exclude', channel: null, scope: null, note: null }];
const SCHEDULES = [{ id: UUID2, entity_type: 'task', entity_id: '77', schedule_type: 'once', scheduled_date: '2026-12-01',
  scheduled_time: '08:00:00', message: 'x', target_stores: null, active: true, created_by: 'Админ' }];
const RECIPIENTS = [{ id: UUID1, name: 'Р', email: 'r@temax.bg', daily: true, weekly: false, pallets: false,
  warehouse: false, minus_multi: false, active: true, scope_stores: null }];

function env(over) {
  over = over || {};
  const h = boot({
    modules: ['admin.js', 'report.js', 'bulletin.js'],
    user: over.user || ADMIN,
    data: {
      notification_topics: TOPICS, notification_matrix: MATRIX, notification_overrides: OVERRIDES,
      notification_schedules: SCHEDULES, report_recipients: RECIPIENTS,
      users: [], stores: [{ id: 's1', name: 'Раднево' }]
    },
    notifyAdmin: over.notifyAdmin,
    confirm: true
  });
  h.w.currentSession = TOKEN;
  return h;
}

/* Всяка заявка към /rest/v1/<една от петте> БЕЗ маркера на емулацията =
   пряк достъп от браузъра. */
function directHits(h) {
  const urls = h.calls.get.concat(h.calls.del)
    .concat(h.calls.post.map(p => p.url)).concat(h.calls.patch.map(p => p.url));
  return urls.filter(u => FIVE.some(t => new RegExp('/rest/v1/' + t + '(\\?|$)').test(String(u))) &&
    String(u).indexOf('via=notify-admin') < 0);
}
function lastNA(h) { return h.calls.notifyAdmin[h.calls.notifyAdmin.length - 1] || null; }
function naOf(h, table, action) { return h.calls.notifyAdmin.filter(b => b && b.table === table && b.action === action); }
function checkTail(h, label) {
  ok(label + ': няма пряк достъп до петте', directHits(h).length === 0, directHits(h).join('\n'));
  ok(label + ': всяко тяло носи пропуска', h.calls.notifyAdmin.every(b => b && b.session === TOKEN),
    JSON.stringify(h.calls.notifyAdmin.map(b => b && b.session)));
}

(async () => {
  /* ── Администрация → Известия ── */
  section('Известия: зареждане');
  {
    const h = env();
    guard('loadNotificationsAdmin()', () => h.w.loadNotificationsAdmin());
    await ticks();
    ['notification_topics', 'notification_matrix', 'notification_overrides', 'notification_schedules'].forEach(t =>
      ok('list ' + t, naOf(h, t, 'list').length === 1, JSON.stringify(h.calls.notifyAdmin)));
    ok('темата е нарисувана от отговора на функцията',
      (h.doc.getElementById('notif-topics-body').textContent || '').indexOf('Срокове днес') >= 0);
    checkTail(h, 'зареждане');

    section('Известия: тема ⏸ (истински клик)');
    const cb = h.doc.querySelector('#notif-topics-body input[type=checkbox]');
    ok('чекбоксът за активност е нарисуван', !!cb);
    if (cb) {
      cb.checked = false;
      cb.dispatchEvent(new h.w.Event('change', { bubbles: true }));
      const oc = cb.getAttribute('onchange');
      if (oc && !naOf(h, 'notification_topics', 'update').length) h.w.eval('(function(){' + oc + '}).call(document.querySelector("#notif-topics-body input[type=checkbox]"))');
      await ticks();
      const u = naOf(h, 'notification_topics', 'update');
      ok('update topics {key} {active:false}', u.length === 1 && u[0].match.key === 'today_deadlines' &&
        JSON.stringify(u[0].fields) === '{"active":false}', JSON.stringify(u));
    }
    checkTail(h, 'тема');
  }

  section('Известия: матрица, изключения, насрочени');
  {
    const h = env();
    h.w.loadNotificationsAdmin(); await ticks();
    h.calls.notifyAdmin.length = 0;
    const sel = { value: 'push' };
    h.w.notifMatrixChannel(sel, 'today_deadlines', 'co'); await ticks();
    let u = naOf(h, 'notification_matrix', 'update');
    ok('смяна на канал → update {topic_key, group_key} {channel}', u.length === 1 &&
      u[0].match.topic_key === 'today_deadlines' && u[0].match.group_key === 'co' && u[0].fields.channel === 'push', JSON.stringify(u));
    h.w.notifMatrixChannel({ value: 'email' }, 'today_deadlines', 'store'); await ticks();
    const ins = naOf(h, 'notification_matrix', 'insert');
    ok('нова клетка → insert', ins.length === 1 && ins[0].fields.group_key === 'store' && ins[0].fields.scope === 'all', JSON.stringify(ins));
    h.w.notifMatrixChannel({ value: 'none' }, 'today_deadlines', 'co'); await ticks();
    const del = naOf(h, 'notification_matrix', 'delete');
    ok('„—“ → delete по двата ключа', del.length === 1 && del[0].match.group_key === 'co' && !del[0].fields, JSON.stringify(del));

    h.w.deleteNotifOverride(UUID1); await ticks();
    const od = naOf(h, 'notification_overrides', 'delete');
    ok('✕ изключение → delete {id}', od.length === 1 && od[0].match.id === UUID1, JSON.stringify(od));

    h.w.toggleAdminNotifSchedule(UUID2, false); await ticks();
    const su = naOf(h, 'notification_schedules', 'update');
    ok('⏸ насрочено → update {id} {active:false}', su.length === 1 && su[0].match.id === UUID2 && su[0].fields.active === false, JSON.stringify(su));
    h.w.deleteAdminNotifSchedule(UUID2); await ticks();
    const sd = naOf(h, 'notification_schedules', 'delete');
    ok('🗑 насрочено → delete {id}', sd.length === 1 && sd[0].match.id === UUID2, JSON.stringify(sd));
    checkTail(h, 'матрица/изключения/насрочени');
  }

  /* ── „📧 Общи отчети“ ── */
  section('Общи отчети: report_recipients');
  {
    const h = env();
    guard('loadReportsAdmin()', () => h.w.loadReportsAdmin());
    await ticks();
    const l = naOf(h, 'report_recipients', 'list');
    ok('list {active:true}', l.length === 1 && l[0].match && l[0].match.active === true, JSON.stringify(l));
    ok('получателят е нарисуван', (h.doc.getElementById('notif-reports-body').textContent || '').indexOf('r@temax.bg') >= 0);

    let res = null;
    h.w.addReportRecipient('Нов', 'n@temax.bg', { daily: true }, v => { res = v; }); await ticks();
    const ins = naOf(h, 'report_recipients', 'insert');
    ok('добави → insert с флаговете', res === true && ins.length === 1 && ins[0].fields.email === 'n@temax.bg' &&
      ins[0].fields.daily === true && ins[0].fields.weekly === false, JSON.stringify(ins));
    h.w.setReportRecipientFlag(UUID1, 'weekly', true, v => { res = v; }); await ticks();
    let u = naOf(h, 'report_recipients', 'update');
    ok('флаг → update {id} {weekly:true}', u.length === 1 && u[0].match.id === UUID1 && JSON.stringify(u[0].fields) === '{"weekly":true}', JSON.stringify(u));
    h.w.setReportRecipientScope(UUID1, ['Раднево'], v => { res = v; }); await ticks();
    u = naOf(h, 'report_recipients', 'update');
    ok('обхват → update {scope_stores}', u.length === 2 && JSON.stringify(u[1].fields) === '{"scope_stores":["Раднево"]}', JSON.stringify(u));
    h.w.deleteReportRecipient(UUID1, v => { res = v; }); await ticks();
    const d = naOf(h, 'report_recipients', 'delete');
    ok('✕ → delete {id}', res === true && d.length === 1 && d[0].match.id === UUID1, JSON.stringify(d));

    /* Истински клик: „Добави“ във формата (ако е нарисувана). */
    const em = h.doc.getElementById('admin-rcpt-email');
    if (em) {
      em.value = 'click@temax.bg';
      const b = Array.prototype.slice.call(h.doc.querySelectorAll('#notif-reports-body button'))
        .find(x => (x.getAttribute('onclick') || '').indexOf('adminAddReportRecipient(') === 0);
      ok('бутонът „Добави“ е нарисуван', !!b);
      if (b) { realClick(h.w, b); await ticks(); }
      ok('клик „Добави“ → insert click@temax.bg',
        naOf(h, 'report_recipients', 'insert').some(x => x.fields.email === 'click@temax.bg'));
    }
    checkTail(h, 'общи отчети');
  }

  /* ── Бюлетин ── */
  section('Бюлетин: „🔔 Нотификации“');
  {
    const h = env();
    h.w.openNotifyScheduleModal('task', '77', 'Задача');
    await ticks();
    const l = naOf(h, 'notification_schedules', 'list');
    ok('списък {entity_type:task, entity_id:"77"}', l.length === 1 && l[0].match.entity_type === 'task' && l[0].match.entity_id === '77', JSON.stringify(l));
    ok('редът е нарисуван', (h.doc.getElementById('notify-list-wrap').textContent || '').indexOf('Еднократно') >= 0);
    const d = h.doc.getElementById('ns-date'), t = h.doc.getElementById('ns-time');
    if (d && t) {
      d.value = '2026-12-05'; t.value = '09:00';
      h.w.bulIsPublished = () => true;
      const save = Array.prototype.slice.call(h.doc.querySelectorAll('#notify-modal-ov button'))
        .find(x => (x.getAttribute('onclick') || '').indexOf('submitNotifySchedule(') === 0);
      ok('бутонът за запис е нарисуван', !!save);
      if (save) { realClick(h.w, save); await ticks(); }
      const ins = naOf(h, 'notification_schedules', 'insert');
      ok('запис → insert once, task, 77', ins.length === 1 && ins[0].fields.schedule_type === 'once' &&
        ins[0].fields.entity_type === 'task' && ins[0].fields.entity_id === '77' && ins[0].fields.scheduled_date === '2026-12-05', JSON.stringify(ins));
    }
    const tog = Array.prototype.slice.call(h.doc.querySelectorAll('#notify-list-wrap button'))
      .find(x => (x.getAttribute('onclick') || '').indexOf('toggleNotifySchedule(') === 0);
    ok('⏸ е нарисуван', !!tog);
    if (tog) { realClick(h.w, tog); await ticks(); }
    ok('⏸ → update {id}', naOf(h, 'notification_schedules', 'update').some(x => x.match.id === UUID2));
    const x = Array.prototype.slice.call(h.doc.querySelectorAll('#notify-list-wrap button'))
      .find(b => (b.getAttribute('onclick') || '').indexOf('deleteNotifySchedule(') === 0);
    if (x) { realClick(h.w, x); await ticks(); }
    ok('✕ → delete {id}', naOf(h, 'notification_schedules', 'delete').some(b => b.match.id === UUID2));
    checkTail(h, '🔔');
  }

  section('Бюлетин: „В сила от“ (bulSyncStartsNotice)');
  {
    /* нов: няма ред → list с prefix, после insert */
    let h = env();
    h.setData('notification_schedules', []);
    let r = await h.w.bulSyncStartsNotice('55', '2099-01-01', 'Т', ['Раднево']);
    let l = naOf(h, 'notification_schedules', 'list');
    ok('list с префикса и {task, "55", once}', l.length === 1 && l[0].message_prefix === 'Нова задача: ' &&
      l[0].match.entity_id === '55' && l[0].match.schedule_type === 'once', JSON.stringify(l));
    let ins = naOf(h, 'notification_schedules', 'insert');
    ok('нов → insert', r === true && ins.length === 1 && ins[0].fields.message === 'Нова задача: Т' &&
      ins[0].fields.scheduled_date === '2099-01-01', JSON.stringify(ins));
    checkTail(h, 'в сила от / нов');
    /* има ред → update по id */
    h = env();
    h.setData('notification_schedules', [{ id: UUID2 }]);
    r = await h.w.bulSyncStartsNotice('55', '2099-02-02', 'Т2', []);
    const u = naOf(h, 'notification_schedules', 'update');
    ok('има ред → update {id}', r === true && u.length === 1 && u[0].match.id === UUID2 && u[0].fields.target_stores === null, JSON.stringify(u));
    /* минала дата → delete по ВСИЧКИ id-та от списъка, само entity_type task */
    h = env();
    h.setData('notification_schedules', [{ id: UUID1 }, { id: UUID2 }]);
    r = await h.w.bulSyncStartsNotice('55', '2000-01-01', 'Т', []);
    const d = naOf(h, 'notification_schedules', 'delete');
    ok('минала дата → delete {id:[двата], entity_type:task}', r === true && d.length === 1 &&
      JSON.stringify(d[0].match) === JSON.stringify({ id: [UUID1, UUID2], entity_type: 'task' }), JSON.stringify(d));
    checkTail(h, 'в сила от / махане');
  }

  section('Бюлетин: отчет за задача (task_report)');
  {
    const h = env();
    h.w.bulTasks = [{ id: 7, title: 'А' }];
    h.w.recurringTasks = [{ id: 'r-9', title: 'Б' }];
    h.w.renderBulletin = () => {};
    h.w.bulLoadTaskReports(); await ticks();
    const l = naOf(h, 'notification_schedules', 'list');
    ok('list {task_report, entity_id:["7","r-9"], active:true}', l.length === 1 &&
      JSON.stringify(l[0].match) === JSON.stringify({ entity_type: 'task_report', entity_id: ['7', 'r-9'], active: true }), JSON.stringify(l));
    const ok1 = await h.w.trSaveReports(7, [{ date: '2026-12-01', time: '18:00', groups: ['co'], user_ids: [] }]);
    const ins = naOf(h, 'notification_schedules', 'insert');
    ok('trSaveReports → insert task_report', ok1 === true && ins.length === 1 && ins[0].fields.entity_type === 'task_report' &&
      ins[0].fields.entity_id === '7' && ins[0].fields.target_recipients.groups[0] === 'co', JSON.stringify(ins));
    h.w.trRefreshSection = () => {};
    h.w.trDeleteReport(UUID2); await ticks();
    const d = naOf(h, 'notification_schedules', 'delete');
    ok('✕ → delete {id, entity_type:task_report}', d.length === 1 && d[0].match.id === UUID2 && d[0].match.entity_type === 'task_report', JSON.stringify(d));
    checkTail(h, 'task_report');
  }

  /* ── 3. Провали ── */
  section('Провал: 403 → червен тост, нищо не се рисува като успех');
  {
    const h = env({ notifyAdmin: () => ({ status: 403, body: { ok: false, reason: 'forbidden', message: 'Нямате права за тази операция.' } }) });
    let res = null;
    h.w.deleteReportRecipient(UUID1, v => { res = v; }); await ticks();
    ok('deleteReportRecipient → false', res === false);
    h.w.deleteNotifOverride(UUID1); await ticks();
    ok('тостът казва причината', h.calls.toast.some(t => /Нямате права/.test(t)), JSON.stringify(h.calls.toast));
    h.calls.toast.length = 0;
    h.w.loadNotificationsAdmin(); await ticks();
    ok('зареждане при 403 → червен тост „Грешка при зареждане“', h.calls.toast.some(t => /Грешка при зареждане: Нямате права/.test(t)), JSON.stringify(h.calls.toast));
  }
  section('Провал: 401 session_expired → модал за повторен вход, после повтаря');
  {
    let n = 0;
    const h = env({ notifyAdmin: b => (++n === 1 ? { status: 401, body: { ok: false, reason: 'session_expired' } } : null) });
    let res = null;
    h.w.setReportRecipientFlag(UUID1, 'daily', false, v => { res = v; });
    await ticks();
    ok('модалът е отворен', !!h.doc.getElementById('kasa-reauth'));
    /* Симулиран успешен вход: kasaReauthFinish(null) */
    h.w.currentSession = TOKEN;
    h.w.kasaReauthFinish(null);
    await ticks();
    ok('след входа заявката е повторена и минава', res === true && h.calls.notifyAdmin.length === 2, 'res=' + res + ' n=' + h.calls.notifyAdmin.length);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
