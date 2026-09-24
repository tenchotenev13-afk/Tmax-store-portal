import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* dynamic-responder — насрочените редове от notification_schedules.

   19.09.2026 (деплой след v22) — ЕДНО нещо: отчет по задача и за ПОСТОЯННА
   задача. entity_type остава 'task_report', entity_id може да сочи и
   recurring_tasks.id (без нова колона — виж шапката на send-routed-report,
   v11). publicationScheduleGate: id-то се търси първо в bulletin_tasks
   (публикуван бюлетин), после в recurring_tasks — там важи същата проверка
   като при напомняне по постоянна задача (recurringPeriodGate: период за
   седмицата на днес, без период — по active). Не е в нито една → пропуск.
   Заявката към send-routed-report е същата — {task_id, recipients,
   run_date, run_time}; какъв е id-ът решава send-routed-report. */

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_FN_URL = SB_URL + "/functions/v1/resend-email";
/* Отчет по задача (entity_type='task_report', 19.09.2026) — не push, а
   писмо: send-routed-report строи картичката и я праща. */
const ROUTED_FN_URL = SB_URL + "/functions/v1/send-routed-report";

/* resend-email е с verify_jwt: true. До 26.08.2026 тук се пращаше САМО
   Content-Type — без Authorization връща 401 UNAUTHORIZED_NO_AUTH_HEADER,
   тоест нито едно насрочено известие не би могло да тръгне, макар кронът
   да върви на всеки 15 минути и да отчита успех. Таблицата беше празна, затова
   никой не го забеляза. Порталът има интерфейс за тези известия (камбанката
   🔔 по редовете в bulletin.js), тоест хората могат да ги насрочват. */
const SEND_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + SB_SERVICE_KEY,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

const DOW = ['sun','mon','tue','wed','thu','fri','sat'];

function getBulgariaLocalParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const dowMap: Record<string,string> = { Sun:'sun',Mon:'mon',Tue:'tue',Wed:'wed',Thu:'thu',Fri:'fri',Sat:'sat' };
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hhmm: `${get('hour')}:${get('minute')}`,
    hours: parseInt(get('hour'), 10),
    minutes: parseInt(get('minute'), 10),
    dow: dowMap[get('weekday')] || 'sun',
  };
}

/* ═══ ПОСТОЯННА ЗАДАЧА, ИЗКЛЮЧЕНА ЗА СЕДМИЦАТА (11.09.2026) ══════════════
   recurring_task_skips (миграция 20260911080537): ред там значи „тази
   седмица задачата не се изисква" — за всички (store_name NULL) или за един
   обект. Насрочено напомняне по такава задача НЕ тръгва:
     · изключена за всички → никакво напомняне;
     · изключена за обект  → този обект излиза от адресатите; не остане ли
       нито един — напомняне няма.
   Напомняне БЕЗ адресати (до всички) остава до всички: магазинното
   изключване няма как да се изрази в push без филтър, а изброяване на
   всички обекти би сменило аудиторията (pushToAll стига и до ЦО).
   Ключът е седмицата на ДНЕС (денят на напомнянето), ISO — същата
   сметка като isoWeekOf() в bulletin-notify и recurringSkipWeekOf() в
   shared.js; tests/recurring-task-skips-responder.test.js ги сверява. */
function isoWeekOf(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week: week, year: dt.getUTCFullYear() };
}
/* Копия от shared.js — дословно. */
function recurringIsSkipped(taskId, store, skips){
  if(!Array.isArray(skips)||!skips.length) return false;
  var id=String(taskId);
  return skips.some(function(s){
    if(!s||String(s.recurring_task_id)!==id) return false;
    return s.store_name===null||s.store_name===undefined||(!!store&&s.store_name===store);
  });
}
function recurringSkipStores(taskId, skips){
  if(!Array.isArray(skips)) return [];
  var id=String(taskId);
  return skips.filter(function(s){
    return !!s&&String(s.recurring_task_id)===id&&s.store_name!==null&&s.store_name!==undefined;
  }).map(function(s){ return s.store_name; });
}
/* { stores } — към кои обекти да тръгне (празно = до всички, както досега);
   { skip }   — напомнянето не тръгва. Изключванията се теглят ВЕДНЪЖ на
   събуждане на крона (cache), и само ако има напомняне по постоянна задача.
   Провал на заявката → [] → напомнянето тръгва както преди изключванията. */
async function recurringScheduleGate(supabase: any, s: any, stores: string[], todayStr: string, cache: { skips: any[] | null }) {
  if (s.entity_type !== 'recurring_task') return { stores: stores };
  if (cache.skips === null) {
    const wk = isoWeekOf(todayStr);
    const { data } = await supabase.from('recurring_task_skips')
      .select('recurring_task_id,store_name').eq('year', wk.year).eq('week_number', wk.week);
    cache.skips = Array.isArray(data) ? data : [];
  }
  if (recurringIsSkipped(s.entity_id, null, cache.skips)) return { skip: 'изключена за седмицата (за всички обекти)' };
  if (!stores.length) return { stores: stores };
  const off = recurringSkipStores(s.entity_id, cache.skips);
  const left = stores.filter((n) => off.indexOf(n) < 0);
  if (!left.length) return { skip: 'изключена за седмицата за всички адресирани обекти' };
  return { stores: left };
}

/* ═══ НЕПУБЛИКУВАН БЮЛЕТИН / НЕЗАПОЧНАЛ ПЕРИОД (18.09.2026) ═════════════
   Камбанката пита „Бюлетинът не е публикуван — изпращам?" само в момента
   на насрочването. Тук се проверява в момента на ИЗПРАЩАНЕТО:
     · задача / под-задача → бюлетинът ѝ трябва да е status='published';
       чернова (или върната в чернова) → напомняне няма;
     · постоянна задача → трябва да важи за седмицата на напомнянето
       (recurring_task_periods; задача без период — по active, резервата на
       recurringTasksForWeek). Бъдещ или приключил период → напомняне няма;
     · изтрита задача / под-задача / постоянна → напомняне няма;
     · промоция → без проверка.
   Провал на заявка → напомнянето тръгва (както при изключванията); при
   постоянна провалът на периодите пада към active. Пропуснатото НЕ пише
   last_sent_at. */
function mondayOfISO(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
/* Копия от shared.js — дословно. */
function recurringValidForWeek(taskId, mondayISO, periods){
  if(!Array.isArray(periods)||!mondayISO) return false;
  var id=String(taskId);
  return periods.some(function(p){
    return !!p&&String(p.recurring_task_id)===id&&p.from_monday<=mondayISO&&
      (p.to_monday===null||p.to_monday===undefined||p.to_monday>=mondayISO);
  });
}
function recurringTasksForWeek(tasks, periods, mondayISO, versions){
  if(!mondayISO) return (Array.isArray(tasks)?tasks:[]).filter(function(t){ return !!t&&!!t.active; });
  var has={};
  (Array.isArray(periods)?periods:[]).forEach(function(p){ if(p) has[String(p.recurring_task_id)]=1; });
  var out=(Array.isArray(tasks)?tasks:[]).filter(function(t){
    if(!t) return false;
    return has[String(t.id)] ? recurringValidForWeek(t.id, mondayISO, periods) : !!t.active;
  });
  /* Съдържанието за СЪЩАТА седмица (recurring_task_versions, 24.09.2026).
     Без версии или без седмица — наборът минава непроменен, тоест старият
     извикващ с три аргумента работи както преди. */
  return recurringApplyVersions(out, versions, mondayISO);
}
/* Постоянна задача: съществува ли и важи ли за седмицата на днес. Общо за
   напомняне по постоянна задача и за отчет по постоянна задача — едно
   правило, не две. notFound — текстът, ако я няма. */
async function recurringPeriodGate(supabase: any, id: any, todayStr: string, notFound: string) {
  const { data: t, error } = await supabase.from('recurring_tasks')
    .select('id,active').eq('id', id).maybeSingle();
  if (error) return {};
  if (!t) return { skip: notFound };
  const { data: periods } = await supabase.from('recurring_task_periods')
    .select('recurring_task_id,from_monday,to_monday').eq('recurring_task_id', id);
  const valid = recurringTasksForWeek([t], Array.isArray(periods) ? periods : [], mondayOfISO(todayStr)).length > 0;
  return valid ? {} : { skip: 'постоянната задача не важи за седмицата (периодът не е започнал или е приключил)' };
}
/* Копия от shared.js — съдържанието на постоянната задача ПО СЕДМИЦИ
   (recurring_task_versions, 24.09.2026). Разминае ли се копието, писмото
   носи заглавието/дните на ДРУГА седмица. */
var RECURRING_CONTENT_FIELDS = ['title','description','due_weekday','due_weekdays','due_window','due_time','task_type','department','target_stores','report_groups','linked_module'];
function recurringVersionForWeek(taskId, mondayISO, versions){
  if(!Array.isArray(versions)||!mondayISO) return null;
  var id=String(taskId), best=null;
  versions.forEach(function(v){
    if(!v||String(v.recurring_task_id)!==id) return;
    if(v.from_monday>mondayISO) return;
    if(v.to_monday!==null&&v.to_monday!==undefined&&v.to_monday<mondayISO) return;
    if(!best||v.from_monday>best.from_monday) best=v;
  });
  return best;
}
function recurringApplyVersion(task, versions, mondayISO){
  var v=task?recurringVersionForWeek(task.id, mondayISO, versions):null;
  if(!v) return task;
  var out={};
  for(var k in task){ if(Object.prototype.hasOwnProperty.call(task,k)) out[k]=task[k]; }
  RECURRING_CONTENT_FIELDS.forEach(function(f){ if(f in v) out[f]=v[f]; });
  return out;
}
function recurringApplyVersions(tasks, versions, mondayISO){
  if(!Array.isArray(tasks)) return [];
  if(!Array.isArray(versions)||!versions.length||!mondayISO) return tasks;
  return tasks.map(function(t){ return recurringApplyVersion(t, versions, mondayISO); });
}
/* Версиите на съдържанието. Провал → [] → чете се редът, както преди. */
async function loadRecurringVersions(supabase: any): Promise<any[]> {
  const { data } = await supabase.from('recurring_task_versions')
    .select('id,recurring_task_id,from_monday,to_monday,title,description,due_weekday,due_weekdays,due_window,due_time,task_type,department,target_stores,report_groups,linked_module');
  return Array.isArray(data) ? data : [];
}
async function publicationScheduleGate(supabase: any, s: any, todayStr: string) {
  /* task_report — отчет по задача: същото правило като напомняне по задача
     (изтрита → не; чернова → не). */
  if (s.entity_type === 'task' || s.entity_type === 'subtask' || s.entity_type === 'task_report') {
    let taskId = s.entity_id;
    if (s.entity_type === 'subtask') {
      const { data: sub, error } = await supabase.from('task_subtasks')
        .select('task_id').eq('id', s.entity_id).maybeSingle();
      if (error) return {};
      if (!sub) return { skip: 'под-задачата не е намерена' };
      taskId = sub.task_id;
    }
    const { data: t, error: te } = await supabase.from('bulletin_tasks')
      .select('bulletin_id').eq('id', taskId).maybeSingle();
    if (te) return {};
    /* Отчет по ПОСТОЯННА задача: id-то не е в bulletin_tasks, а в
       recurring_tasks. Тогава важи правилото за постоянна задача, не за
       бюлетин (19.09.2026). */
    if (!t && s.entity_type === 'task_report') return await recurringPeriodGate(supabase, s.entity_id, todayStr, 'задачата не е намерена');
    if (!t) return { skip: 'задачата не е намерена' };
    const { data: b, error: be } = await supabase.from('bulletins')
      .select('status').eq('id', t.bulletin_id).maybeSingle();
    if (be) return {};
    if (!b || b.status !== 'published') return { skip: 'бюлетинът не е публикуван' };
    return {};
  }
  if (s.entity_type === 'recurring_task') {
    return await recurringPeriodGate(supabase, s.entity_id, todayStr, 'постоянната задача не е намерена');
  }
  return {};
}

/* Дошъл ли е редът: до 15 минути след часа, еднократният — само в деня си и
   само ако не е пратен. Изнесено от обработчика без промяна на логиката —
   за да се тества пряко (tests/task-report-responder.test.js). */
function scheduleIsDue(s: any, bg: any, todayStr: string, todayDow: string) {
  const [h, m] = s.scheduled_time.split(':').map(Number);
  const schedMinutes = h * 60 + m;
  const nowMinutes = bg.hours * 60 + bg.minutes;
  if (nowMinutes < schedMinutes || nowMinutes - schedMinutes > 15) return false;

  if (s.schedule_type === 'once') {
    if (s.scheduled_date !== todayStr) return false;
    if (s.last_sent_at) return false;
    return true;
  }
  if (s.schedule_type === 'daily') {
    if (s.last_sent_at && s.last_sent_at.slice(0,10) === todayStr) return false;
    return true;
  }
  if (s.schedule_type === 'weekly') {
    if (s.day_of_week !== todayDow) return false;
    if (s.last_sent_at && s.last_sent_at.slice(0,10) === todayStr) return false;
    return true;
  }
  return false;
}

/* ═══ ОТЧЕТ ПО ЗАДАЧА (entity_type='task_report', 19.09.2026) ══════════
   Вместо push — ЕДНА заявка към send-routed-report с {task_id, recipients}
   (recipients = target_recipients на реда: {groups[], user_ids[]}). Там се
   решават членовете на групите, строи се картичката и се праща писмото.
   Успех = HTTP ok, ok:true И поне едно изпратено писмо — само тогава
   last_sent_at; иначе следващото събуждане в 15-минутния прозорец опитва
   пак. Изтрита задача / чернова се спират по-рано, в
   publicationScheduleGate. */
function taskReportRequestBody(s: any, todayStr: string) {
  const rc = (s && s.target_recipients && typeof s.target_recipients === 'object') ? s.target_recipients : {};
  return {
    task_id: String(s.entity_id),
    recipients: {
      groups: Array.isArray(rc.groups) ? rc.groups : [],
      user_ids: Array.isArray(rc.user_ids) ? rc.user_ids : [],
    },
    run_date: s.scheduled_date || todayStr,
    run_time: String(s.scheduled_time || '').slice(0, 5),
  };
}
async function sendTaskReport(s: any, todayStr: string, fetchFn: any) {
  let res: any, j: any = null;
  try {
    res = await fetchFn(ROUTED_FN_URL, {
      method: 'POST',
      headers: SEND_HEADERS,
      body: JSON.stringify(taskReportRequestBody(s, todayStr)),
    });
    try { j = await res.json(); } catch (_e) { j = null; }
  } catch (e) {
    console.error('send-routed-report (task_report ' + s.entity_id + '): ' + String(e));
    return { ok: false, detail: String(e) };
  }
  const ok = !!res && res.ok && !!j && j.ok === true && (j.sent || 0) > 0;
  if (!ok) console.warn('dynamic-responder: отчет по задача ' + s.entity_id + ' не е пратен: HTTP ' + (res && res.status) + ' ' + JSON.stringify(j));
  return { ok: ok, detail: j };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  try {
    const supabase = createClient(SB_URL, SB_SERVICE_KEY);
    const now = new Date();
    const bg = getBulgariaLocalParts(now);
    const todayStr = bg.dateStr;
    const nowHHMM = bg.hhmm;
    const todayDow = bg.dow;

    const { data: schedules, error } = await supabase
      .from('notification_schedules')
      .select('*')
      .eq('active', true)
      .lte('scheduled_time', nowHHMM + ':59');

    if (error) throw error;

    const due = (schedules || []).filter((s: any) => scheduleIsDue(s, bg, todayStr, todayDow));

    const results = [];
    const skipped: any[] = [];
    const skipCache: { skips: any[] | null } = { skips: null };
    for (const s of due) {
      /* Непубликуван бюлетин / незапочнал период — виж publicationScheduleGate. */
      const pub: any = await publicationScheduleGate(supabase, s, todayStr);
      if (pub.skip) {
        if (s.entity_type === 'task_report') console.warn('dynamic-responder: отчет по задача ' + s.entity_id + ' пропуснат: ' + pub.skip);
        skipped.push({ id: s.id, reason: pub.skip });
        continue;
      }
      /* Отчет по задача — писмо през send-routed-report, не push. */
      if (s.entity_type === 'task_report') {
        const tr: any = await sendTaskReport(s, todayStr, fetch);
        if (tr.ok) {
          await supabase.from('notification_schedules')
            .update({ last_sent_at: now.toISOString() })
            .eq('id', s.id);
        }
        results.push({ id: s.id, ok: tr.ok, task_report: true, detail: tr.detail });
        continue;
      }
      let title = s.message || '';
      if (!title) {
        const table = s.entity_type === 'subtask' ? 'task_subtasks'
          : s.entity_type === 'promotion' ? 'bulletin_promotions'
          : s.entity_type === 'recurring_task' ? 'recurring_tasks'
          : 'bulletin_tasks';
        const { data: entRaw } = await supabase.from(table).select('*').eq('id', s.entity_id).maybeSingle();
        /* Постоянна задача: заглавието е на ТАЗИ седмица
           (recurring_task_versions, 24.09.2026) — напомнянето трябва да
           казва това, което пише в бюлетина днес. */
        const ent = (s.entity_type === 'recurring_task' && entRaw)
          ? recurringApplyVersion(entRaw, await loadRecurringVersions(supabase), mondayOfISO(todayStr))
          : entRaw;
        title = ent?.title ? ('Напомняне: ' + ent.title) : 'Напомняне от бюлетина';
      }

      const pushBody: Record<string, unknown> = {
        type: 'push',
        title: 'ТеМАХ Бюлетин',
        message: title,
      };
      /* Обектите се държат в ДВЕ колони, по историческа причина:
           · target_store  (text)   — първоначалната, само ЕДИН обект;
           · target_stores (text[]) — НОВАТА (27.08.2026), няколко обекта.
         Камбанката в bulletin.js вече записва в новата, защото модалът дава
         многоредов избор. Старата се чете само като резервен вариант, за да
         НЕ се променя поведението на заварените редове.
         Празни и двете → без филтър, тоест до всички, както досега. */
      let stores: string[] = Array.isArray(s.target_stores)
        ? s.target_stores.filter((x: unknown) => typeof x === 'string' && x !== '')
        : [];
      if (!stores.length && s.target_store) stores = [s.target_store];
      /* Постоянна задача, изключена за седмицата — виж recurringScheduleGate.
         Пропуснатото НЕ пише last_sent_at: нищо не е изпратено. */
      const gate: any = await recurringScheduleGate(supabase, s, stores, todayStr, skipCache);
      if (gate.skip) { skipped.push({ id: s.id, reason: gate.skip }); continue; }
      stores = gate.stores;
      if (stores.length) {
        const filters: unknown[] = [];
        stores.forEach((name, i) => {
          if (i > 0) filters.push({ operator: 'OR' });
          filters.push({ field: 'tag', key: 'store_name', relation: '=', value: name });
        });
        pushBody.filters = filters;
      }

      const res = await fetch(SEND_FN_URL, {
        method: 'POST',
        headers: SEND_HEADERS,
        body: JSON.stringify(pushBody),
      });
      const ok = res.ok;
      if (!ok) { console.error('resend-email HTTP ' + res.status + ': ' + (await res.text())); }

      /* last_sent_at се пише САМО при успех. Дотук се пишеше винаги,
         тоест провалено изпращане се маркираше като свършено и не се опитваше
         пак. Сега следващото събуждане на крона опитва отново, докато
         15-минутният прозорец не се затвори. */
      if (ok) {
        await supabase.from('notification_schedules')
          .update({ last_sent_at: now.toISOString() })
          .eq('id', s.id);
      }

      results.push({ id: s.id, ok });
    }

    return Response.json({ ok: true, checked: schedules?.length || 0, sent: results.length, results, skipped, debug_bg_time: nowHHMM, debug_bg_date: todayStr }, { headers: CORS });
  } catch (e) {
    const err = e as Error;
    return Response.json({ ok: false, error: err.message }, { headers: CORS, status: 500 });
  }
});
