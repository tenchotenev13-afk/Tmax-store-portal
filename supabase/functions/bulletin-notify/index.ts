// bulletin-notify — единственият източник за известията от Бюлетина.
//
// Два входа, един код: кронът (без topic_key) и порталът (с topic_key).
// dry_run: true връща кой какво би получил, БЕЗ да праща нищо.
//
// Теми (пълният списък с реализираните е IMPLEMENTED_TOPICS долу):
//   overdue_tasks    — имейл/push до контролинг, регионални, ЦО, автора
//   today_deadlines  — push до обекта, два часа преди часа на задачата
//   promo_expiring   — имейл/push за промоции, изтичащи днес (и до 3 дни в пон.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_FN_URL = SB_URL + "/functions/v1/resend-email";
const PORTAL_URL = "https://tenchotenev13-afk.github.io/Tmax-store-portal/";

/* resend-email е с verify_jwt: true. Без този заглавен ред връща 401. */
const SEND_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + SB_SERVICE_KEY,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

/* Копие на REPORT_EXCLUDED_STORES от shared.js ред 199. */
const EXCLUDED_STORES = [
  'Централен офис',
  'Логистичен склад Добрич',
  'Логистичен склад Търговище',
  'Пазарджик',
  'Сервиз Троян',
];

/* Напомнянето е ДВА ЧАСА преди часа на задачата, но не преди 08:00.
   Фиксиран час не върши работа: активните постоянни задачи са с часове
   08:30, 10:00, 11:00, 16:00 и пет в 20:00. Задача без час влиза в 08:00. */
const LEAD_MINUTES = 120;
const EARLIEST_MINUTE = 8 * 60;

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function bgNow(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = fmt.formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  const map: Record<string, string> = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };
  const dowKey = map[g('weekday')] || 'sun';
  const isoWd = dowKey === 'sun' ? 7 : DOW.indexOf(dowKey);
  return {
    dateStr: g('year') + '-' + g('month') + '-' + g('day'),
    hours: parseInt(g('hour'), 10),
    minutes: parseInt(g('minute'), 10),
    dow: dowKey,
    isoWeekday: isoWd,
    weekdayIdx: isoWd - 1,
  };
}

function isoWeekOf(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week: week, year: dt.getUTCFullYear() };
}

function lastDueDate(t: Record<string, unknown>): string | null {
  const dates = Array.isArray(t.due_dates) && (t.due_dates as unknown[]).length
    ? (t.due_dates as unknown[]).map(x => String(x).slice(0, 10))
    : (t.due_date ? [String(t.due_date).slice(0, 10)] : []);
  return dates.length ? dates[dates.length - 1] : null;
}

function dueDatesOf(t: Record<string, unknown>): string[] {
  return Array.isArray(t.due_dates) && (t.due_dates as unknown[]).length
    ? (t.due_dates as unknown[]).map(x => String(x).slice(0, 10))
    : (t.due_date ? [String(t.due_date).slice(0, 10)] : []);
}

/* Копие на recurringIsDueOnWeekday / recurringIsWindow /
   recurringReportDueOnWeekday от bulletin.js (редове 3528-3598).
   Прозоречна задача се напомня в ДЕНЯ НА СРОКА. */
function recurringIsWindow(t: any): boolean {
  if (!t || !t.due_window) return false;
  const d = (Array.isArray(t.due_weekdays) && t.due_weekdays.length) ? t.due_weekdays : [];
  return d.length > 1 && d.length < 7;
}
function recurringDueOnWeekday(t: any, idx: number): boolean {
  if (recurringIsWindow(t)) {
    const d = (t.due_weekdays || []).slice().sort((a: number, b: number) => a - b);
    return d.length ? idx === d[d.length - 1] : false;
  }
  if (Array.isArray(t.due_weekdays) && t.due_weekdays.length) return t.due_weekdays.indexOf(idx) >= 0;
  if (t.due_weekday === null || t.due_weekday === undefined) return !!t.due_time;
  return t.due_weekday === idx;
}

function minutesOf(hhmmStr: unknown): number | null {
  if (!hhmmStr) return null;
  const parts = String(hhmmStr).split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
function slotFor(dueMinutes: number | null): number {
  if (dueMinutes === null) return EARLIEST_MINUTE;
  return Math.max(EARLIEST_MINUTE, dueMinutes - LEAD_MINUTES);
}
function hhmm(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/* Заглавието носи БРОЯ — пренесено от старото клиентско известие
   (bulletin.js, sendDailyDeadlinesNotification). „3 срока днес" казва повече
   от „Срокове днес" на заключен екран, където тялото може да е отрязано. */
function deadlinesTitle(n: number): string {
  return '📅 ' + n + ' срок' + (n === 1 ? '' : 'а') + ' днес';
}

function esc(s: unknown): string {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bgDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d + '.' + m + '.' + y;
}

type Recipient = {
  email: string; name: string; channel: string; scope: string;
  groups: string[]; stores: string[];
};

const SCOPE_RANK: Record<string, number> = { own_tasks: 1, own_stores: 2, all: 3 };

function mergeChannel(a: string, b: string): string {
  if (a === b) return a;
  if (a === 'none') return b;
  if (b === 'none') return a;
  return 'both';
}

async function resolveRecipients(supabase: any, topicKey: string) {
  const { data: matrix } = await supabase
    .from('notification_matrix').select('*').eq('topic_key', topicKey);

  const { data: users } = await supabase
    .from('users').select('email,display_name,store_name,notify_groups,assigned_stores')
    .eq('active', true);

  const byEmail: Record<string, Recipient> = {};
  const add = (u: any, channel: string, scope: string, group: string) => {
    if (!u || !u.email || channel === 'none') return;
    const key = String(u.email).toLowerCase();
    const stores = group === 'store'
      ? (u.store_name ? [u.store_name] : [])
      : (Array.isArray(u.assigned_stores) ? u.assigned_stores : []);
    if (!byEmail[key]) {
      byEmail[key] = {
        email: u.email, name: u.display_name || u.email,
        channel: channel, scope: scope, groups: [group], stores: stores,
      };
      return;
    }
    const r = byEmail[key];
    if (SCOPE_RANK[scope] > SCOPE_RANK[r.scope]) r.scope = scope;
    r.channel = mergeChannel(r.channel, channel);
    if (r.groups.indexOf(group) < 0) r.groups.push(group);
    if (!r.stores.length && stores.length) r.stores = stores;
  };

  for (const m of (matrix || [])) {
    if (m.channel === 'none') continue;
    if (m.group_key === 'store') {
      for (const u of (users || [])) {
        if (u.store_name && EXCLUDED_STORES.indexOf(u.store_name) < 0) add(u, m.channel, m.scope, 'store');
      }
    } else {
      for (const u of (users || [])) {
        const g = Array.isArray(u.notify_groups) ? u.notify_groups : [];
        if (g.indexOf(m.group_key) >= 0) add(u, m.channel, m.scope, m.group_key);
      }
    }
  }

  const { data: overrides } = await supabase
    .from('notification_overrides').select('*').eq('topic_key', topicKey);

  for (const o of (overrides || [])) {
    const key = String(o.user_email || '').toLowerCase();
    if (!key) continue;
    if (o.mode === 'exclude') { delete byEmail[key]; continue; }
    const u = (users || []).find((x: any) => String(x.email || '').toLowerCase() === key);
    if (!u) continue;
    const ch = o.channel || 'email';
    const sc = o.scope || 'all';
    if (byEmail[key]) {
      byEmail[key].channel = mergeChannel(byEmail[key].channel, ch);
      if (SCOPE_RANK[sc] > SCOPE_RANK[byEmail[key].scope]) byEmail[key].scope = sc;
      if (byEmail[key].groups.indexOf('override') < 0) byEmail[key].groups.push('override');
    } else {
      byEmail[key] = {
        email: u.email, name: u.display_name || u.email,
        channel: ch, scope: sc, groups: ['override'],
        stores: Array.isArray(u.assigned_stores) ? u.assigned_stores : [],
      };
    }
  }

  return Object.keys(byEmail).map(k => byEmail[k]);
}

async function reportableStores(supabase: any): Promise<string[]> {
  const { data: userRows } = await supabase
    .from('users').select('store_name').eq('active', true);
  const seen: Record<string, boolean> = {};
  const stores: string[] = [];
  for (const u of (userRows || [])) {
    const n = u.store_name;
    if (!n || EXCLUDED_STORES.indexOf(n) >= 0 || seen[n]) continue;
    seen[n] = true; stores.push(n);
  }
  stores.sort();
  return stores;
}

/* ──────────────────── ТЕМА: ПРОСРОЧЕНИ ЗАДАЧИ ────────────────── */

async function buildOverdueTasks(supabase: any, bg: ReturnType<typeof bgNow>) {
  const iso = isoWeekOf(bg.dateStr);

  const { data: bulletins } = await supabase
    .from('bulletins').select('id,week_number,year')
    .eq('week_number', iso.week).eq('year', iso.year).limit(1);

  if (!bulletins || !bulletins.length) {
    return { skip: 'Няма бюлетин за седмица ' + iso.week + '/' + iso.year };
  }
  const bulletinId = bulletins[0].id;

  const { data: tasks } = await supabase
    .from('bulletin_tasks').select('*').eq('bulletin_id', bulletinId);

  if (!tasks || !tasks.length) return { skip: 'Бюлетинът няма еднократни задачи' };

  const overdueTasks = tasks.filter((t: any) => {
    const last = lastDueDate(t);
    return !!last && last < bg.dateStr;
  });
  if (!overdueTasks.length) return { skip: 'Няма просрочени задачи' };

  const ids = overdueTasks.map((t: any) => t.id);
  const { data: comps } = await supabase
    .from('task_completions').select('task_id,store_name').in('task_id', ids);

  const stores = await reportableStores(supabase);

  const items: { taskId: string; store: string; title: string; due: string; groups: string[] }[] = [];
  const taskStats: Record<string, any> = {};

  for (const t of overdueTasks) {
    const scope = (Array.isArray(t.target_stores) && t.target_stores.length)
      ? stores.filter(s => t.target_stores.indexOf(s) >= 0)
      : stores;
    const groups = ((Array.isArray(t.report_groups) && t.report_groups.length)
      ? t.report_groups : ['controlling']).slice();
    if (t.created_by) groups.push('creator:' + t.created_by);
    const missing: string[] = [];
    for (const s of scope) {
      const done = (comps || []).some((c: any) => c.task_id === t.id && c.store_name === s);
      if (done) continue;
      missing.push(s);
      items.push({ taskId: t.id, store: s, title: t.title, due: lastDueDate(t) || '', groups: groups });
    }
    if (missing.length) {
      taskStats[t.id] = {
        title: t.title, due: lastDueDate(t) || '', groups: groups,
        createdBy: t.created_by || null,
        total: scope.length, missing: missing.length,
      };
    }
  }
  if (!items.length) return { skip: 'Всички просрочени задачи са отметнати' };

  return { items: items, bulletin: bulletins[0], taskStats: taskStats };
}

function overdueHtmlFor(items: any[], bulletin: any, taskStats: any, narrowed: boolean) {
  const byTask: Record<string, any[]> = {};
  const order: string[] = [];
  for (const it of items) {
    if (!byTask[it.taskId]) { byTask[it.taskId] = []; order.push(it.taskId); }
    byTask[it.taskId].push(it);
  }
  order.sort((a, b) => String(taskStats[a].due).localeCompare(String(taskStats[b].due)));

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;">'
    + '<h2 style="margin:0 0 4px;font-size:19px;color:#b91c1c;">Незавършени задачи</h2>'
    + '<div style="font-size:13px;color:#6b7280;margin-bottom:14px;">Бюлетин С'
    + esc(bulletin.week_number) + ' · ' + esc(bulletin.year)
    + ' — задачи, чийто срок е изтекъл без отмятане.</div>';

  for (const tid of order) {
    const st = taskStats[tid];
    const mine = byTask[tid].map((x: any) => x.store).sort();
    html += '<div style="margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;padding:11px 13px;">'
      + '<div style="display:block;font-weight:700;font-size:14.5px;margin-bottom:2px;">' + esc(st.title) + '</div>'
      + '<div style="font-size:12px;color:#9ca3af;margin-bottom:8px;">срок ' + esc(bgDate(st.due))
      + (st.createdBy ? ' · зададена от ' + esc(st.createdBy) : '') + '</div>'
      + '<div style="font-size:13px;color:#b91c1c;font-weight:600;margin-bottom:4px;">Не са изпълнили: '
      + esc(st.missing) + ' от ' + esc(st.total) + '</div>'
      + (narrowed && mine.length < st.missing
          ? '<div style="font-size:11.5px;color:#6b7280;margin-bottom:3px;">От твоите обекти:</div>'
          : '')
      + '<div style="font-size:13px;line-height:1.7;">' + mine.map(esc).join(' · ') + '</div>'
      + '</div>';
  }

  html += '<div style="font-size:12px;color:#6b7280;margin-top:14px;">'
    + 'Подробностите, снимките и документите се проверяват в портала, таб Днес.</div>'
    + '<div style="margin-top:12px;"><a href="' + PORTAL_URL + '" '
    + 'style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;'
    + 'font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;">Отвори портала</a></div>'
    + '<div style="font-size:11px;color:#9ca3af;margin-top:18px;">ТеМАХ Портал</div></div>';
  return html;
}

function filterItemsFor(r: Recipient, items: any[]) {
  const creatorTag = 'creator:' + r.name;
  if (r.scope === 'all') return items;
  if (r.scope === 'own_stores') {
    return items.filter(it => it.groups.indexOf(creatorTag) >= 0
      || (r.stores.length && r.stores.indexOf(it.store) >= 0));
  }
  if (r.scope === 'own_tasks') {
    const mine = r.groups.filter(g => g !== 'override');
    return items.filter(it => it.groups.some((g: string) => mine.indexOf(g) >= 0));
  }
  return items;
}

/* ──────────────── ТЕМА: НАПОМНЯНЕ ДО ОБЕКТА ────────────── */
/* Три разлики спрямо старото клиентско известие:
   1) праща на всеки обект САМО неговите задачи (target_stores);
   2) пропуска вече отметнатото;
   3) тръгва от крон, а не когато админ отвори портала.
   Повторенията се пазят чрез notification_log. */
async function buildTodayDeadlines(supabase: any, bg: ReturnType<typeof bgNow>) {
  const nowMin = bg.hours * 60 + bg.minutes;
  const winStart = nowMin - 15;
  const stores = await reportableStores(supabase);
  const iso = isoWeekOf(bg.dateStr);

  const { data: bulletins } = await supabase
    .from('bulletins').select('id').eq('week_number', iso.week).eq('year', iso.year).limit(1);

  let oneTime: any[] = [];
  if (bulletins && bulletins.length) {
    const { data: tasks } = await supabase
      .from('bulletin_tasks').select('*').eq('bulletin_id', bulletins[0].id);
    oneTime = (tasks || []).filter((t: any) => dueDatesOf(t).indexOf(bg.dateStr) >= 0);
  }

  const { data: recs } = await supabase
    .from('recurring_tasks').select('*').eq('active', true);
  const recToday = (recs || []).filter((t: any) => recurringDueOnWeekday(t, bg.weekdayIdx));

  const inWindow = (t: any, isRec: boolean) => {
    const slot = slotFor(isRec ? minutesOf(t.due_time) : null);
    return slot > winStart && slot <= nowMin ? slot : null;
  };

  const due: { t: any; isRec: boolean; slot: number }[] = [];
  for (const t of oneTime) { const s = inWindow(t, false); if (s !== null) due.push({ t, isRec: false, slot: s }); }
  for (const t of recToday) { const s = inWindow(t, true); if (s !== null) due.push({ t, isRec: true, slot: s }); }

  if (!due.length) {
    return { skip: 'Няма задачи в този прозорец (' + hhmm(Math.max(0, winStart)) + '–' + hhmm(nowMin) + ')' };
  }

  const oneIds = due.filter(d => !d.isRec).map(d => d.t.id);
  const recIds = due.filter(d => d.isRec).map(d => d.t.id);

  let comps: any[] = [];
  if (oneIds.length) {
    const { data } = await supabase.from('task_completions')
      .select('task_id,store_name,completion_date').in('task_id', oneIds);
    comps = comps.concat(data || []);
  }
  if (recIds.length) {
    const { data } = await supabase.from('task_completions')
      .select('recurring_task_id,store_name,completion_date')
      .in('recurring_task_id', recIds).eq('completion_date', bg.dateStr);
    comps = comps.concat(data || []);
  }

  const doneFor = (d: any, store: string) => {
    if (d.isRec) {
      return comps.some((c: any) => c.recurring_task_id === d.t.id && c.store_name === store);
    }
    return comps.some((c: any) => c.task_id === d.t.id && c.store_name === store
      && (!c.completion_date || String(c.completion_date).slice(0, 10) === bg.dateStr));
  };

  const byStore: Record<string, { slot: number; lines: string[] }> = {};
  for (const d of due) {
    const scope = (Array.isArray(d.t.target_stores) && d.t.target_stores.length)
      ? stores.filter(s => d.t.target_stores.indexOf(s) >= 0)
      : stores;
    for (const s of scope) {
      if (doneFor(d, s)) continue;
      if (!byStore[s]) byStore[s] = { slot: d.slot, lines: [] };
      byStore[s].lines.push(d.t.title + (d.isRec && d.t.due_time ? ' (до ' + String(d.t.due_time).slice(0, 5) + ')' : ''));
    }
  }

  const targets = Object.keys(byStore);
  if (!targets.length) return { skip: 'Всички обекти са отметнали задачите за този прозорец' };

  return { byStore: byStore, targets: targets, window: hhmm(nowMin) };
}

/* ──────────────── ТЕМА: ИЗТИЧАЩИ ПРОМОЦИИ ─────────────── */
/* bulletin_promotions НЯМА target_stores — промоцията важи за цялата верига.
   Затова стесняване по обект НЕ се прави: push-ът тръгва към всички отчетни
   обекти наведнъж, с една OR-верига по таг store_name. pushToAll не върши
   работа — той хваща и Централния офис, и складовете.

   Два прозореца, нарочно с различна честота:
   · изтичащи ДНЕС — всеки ден;
   · изтичащи до 3 дни — САМО в понеделник. Промоция, която свършва в неделя,
     иначе би звъняла в четвъртък, петък и събота за едно и също нещо. */

/* n дни напред от гола дата 'YYYY-MM-DD', пак като низ. През UTC нарочно:
   датата няма час, тоест часова зона не участва и няма как да се измести
   с ден. Сравненията надолу са НИЗ с НИЗ — 'YYYY-MM-DD' се подрежда
   лексикографски. */
function plusDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/* Заглавието на промоция за списъка. title е NOT NULL в схемата, но празен
   низ минава — затова има подредба от три стъпки. Ред НЕ се пропуска мълчаливо:
   по-добре „Промоция без заглавие" в известието, отколкото изчезнал ред, за
   който никой не разбира. */
function promoLabel(p: any): string {
  const t = String(p.title || '').trim();
  if (t) return t;
  const d = String(p.description || '').trim();
  if (d) return d.length > 60 ? d.slice(0, 60) + '…' : d;
  return 'Промоция без заглавие';
}

function promoSort(a: any, b: any): number {
  const ea = String(a.end_date || ''), eb = String(b.end_date || '');
  if (ea !== eb) return ea.localeCompare(eb);
  return promoLabel(a).localeCompare(promoLabel(b));
}

async function buildPromoExpiring(supabase: any, bg: ReturnType<typeof bgNow>) {
  const { data: promos } = await supabase
    .from('bulletin_promotions')
    .select('id,title,description,department,start_date,end_date,active,created_by')
    .eq('active', true);

  const horizon = plusDaysISO(bg.dateStr, 3);
  const today: any[] = [];
  const soon: any[] = [];

  for (const p of (promos || [])) {
    const end = p.end_date ? String(p.end_date).slice(0, 10) : '';
    if (!end) continue;
    if (end === bg.dateStr) { today.push(p); continue; }
    if (end > bg.dateStr && end <= horizon) soon.push(p);
  }
  today.sort(promoSort);
  soon.sort(promoSort);

  /* Списъкът „до 3 дни" влиза само в понеделник — виж бележката горе. */
  const isMonday = bg.dow === 'mon';
  const ahead = isMonday ? soon : [];

  if (!today.length && !ahead.length) {
    return {
      skip: 'Няма промоции, изтичащи днес' +
        (isMonday ? ' или до 3 дни' : ' (списъкът до 3 дни върви само в понеделник)'),
    };
  }

  return { today: today, ahead: ahead, isMonday: isMonday, horizon: horizon };
}

/* Текстът за push — нов ред на промоция, без HTML. */
function promoPushText(today: any[], ahead: any[]): string {
  const lines: string[] = [];
  if (today.length) {
    lines.push('Изтичат ДНЕС:');
    today.forEach((p) => lines.push('· ' + promoLabel(p)));
  }
  if (ahead.length) {
    if (lines.length) lines.push('');
    lines.push('До 3 дни:');
    ahead.forEach((p) => lines.push('· ' + promoLabel(p) + ' (до ' + bgDate(String(p.end_date)) + ')'));
  }
  return lines.join('\n');
}

function promoHtmlFor(today: any[], ahead: any[], bg: any) {
  const block = (heading: string, list: any[], color: string, withDate: boolean) => {
    if (!list.length) return '';
    return '<div style="margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;padding:11px 13px;">'
      + '<div style="font-weight:700;font-size:14.5px;color:' + color + ';margin-bottom:6px;">' + esc(heading) + '</div>'
      /* Отделът НЕ се показва на реда, и това е нарочно. В цялата база
         bulletin_promotions.department има ЕДНА-ЕДИНСТВЕНА стойност — 'all'
         за всичките 46 записа, нула NULL (проверено със SQL на 28.08.2026).
         Тоест на всеки ред в писмото излизаше „· all": суров ключ, който не
         различава нищо и само шуми.
         Ако четеш това като „липсва информация за отдела" — липсва я в
         ДАННИТЕ, не в кода, и връщането на реда не я добавя. Върни го чак
         когато колоната наистина носи повече от една стойност.
         Колоната не се пипа: ползва се другаде и махането ѝ е отделно
         решение. Затова остава и в select= на buildPromoExpiring. */
      + list.map((p) =>
          '<div style="font-size:13px;line-height:1.8;">· ' + esc(promoLabel(p))
          + (withDate ? ' <span style="color:#9ca3af;">до ' + esc(bgDate(String(p.end_date))) + '</span>' : '')
          + '</div>').join('')
      + '</div>';
  };

  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;">'
    + '<h2 style="margin:0 0 4px;font-size:19px;color:#b45309;">Изтичащи промоции</h2>'
    + '<div style="font-size:13px;color:#6b7280;margin-bottom:14px;">' + esc(bgDate(bg.dateStr))
    + ' — промоции, чийто срок изтича.</div>'
    + block('Изтичат днес', today, '#b91c1c', false)
    + block('До 3 дни', ahead, '#b45309', true)
    + '<div style="font-size:12px;color:#6b7280;margin-top:14px;">'
    + 'Промоцията важи за цялата верига — списъкът не е стеснен по обект.</div>'
    + '<div style="margin-top:12px;"><a href="' + PORTAL_URL + '" '
    + 'style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;'
    + 'font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;">Отвори портала</a></div>'
    + '<div style="font-size:11px;color:#9ca3af;margin-top:18px;">ТеМАХ Портал</div></div>';
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch(SEND_FN_URL, {
    method: 'POST', headers: SEND_HEADERS,
    body: JSON.stringify({ type: 'email', to: to, subject: subject, html: html }),
  });
  if (!res.ok) { console.error('resend-email HTTP ' + res.status + ': ' + (await res.text())); }
  return res.ok;
}

async function sendPushFilters(filters: unknown[], title: string, message: string) {
  const res = await fetch(SEND_FN_URL, {
    method: 'POST', headers: SEND_HEADERS,
    body: JSON.stringify({ type: 'push', title: title, message: message, filters: filters }),
  });
  if (!res.ok) { console.error('push HTTP ' + res.status + ': ' + (await res.text())); }
  return res.ok;
}

async function sendPushToPeople(names: string[], title: string, message: string) {
  if (!names.length) return false;
  const filters: unknown[] = [];
  names.forEach((n, i) => {
    if (i > 0) filters.push({ operator: 'OR' });
    filters.push({ field: 'tag', key: 'display_name', relation: '=', value: n });
  });
  return await sendPushFilters(filters, title, message);
}

async function runOverdueTasks(supabase: any, topic: any, bg: any, dryRun: boolean) {
  const built = await buildOverdueTasks(supabase, bg);
  if ((built as any).skip) {
    return { topic: topic.key, skipped: (built as any).skip, recipients: 0 };
  }
  const items = (built as any).items;
  const bulletin = (built as any).bulletin;
  const taskStats = (built as any).taskStats;

  const all = await resolveRecipients(supabase, topic.key);

  const creatorNames: string[] = [];
  for (const tid of Object.keys(taskStats)) {
    const c = taskStats[tid].createdBy;
    if (c && creatorNames.indexOf(c) < 0) creatorNames.push(c);
  }
  if (creatorNames.length) {
    const { data: cu } = await supabase
      .from('users').select('email,display_name,assigned_stores')
      .eq('active', true).in('display_name', creatorNames);
    for (const u of (cu || [])) {
      if (!u.email) continue;
      const tag = 'creator:' + u.display_name;
      const ex = all.find((r: Recipient) => String(r.email).toLowerCase() === String(u.email).toLowerCase());
      if (ex) { if (ex.groups.indexOf(tag) < 0) ex.groups.push(tag); }
      else {
        all.push({
          email: u.email, name: u.display_name, channel: 'email', scope: 'own_tasks',
          groups: [tag], stores: Array.isArray(u.assigned_stores) ? u.assigned_stores : [],
        });
      }
    }
  }

  const planned: any[] = [];
  const pushNames: string[] = [];
  for (const r of all) {
    const mine = filterItemsFor(r, items);
    if (!mine.length) continue;
    planned.push({ email: r.email, name: r.name, channel: r.channel, scope: r.scope, groups: r.groups, redove: mine.length });
    if (r.channel === 'push' || r.channel === 'both') pushNames.push(r.name);
  }

  const subject = 'ТеМАХ — Незавършени задачи (' + bgDate(bg.dateStr) + ')';
  if (dryRun) {
    return { topic: topic.key, dry_run: true, subject: subject, items: items.length, recipients: planned.length, planned: planned };
  }

  let sent = 0, failed = 0;
  for (const r of all) {
    const mine = filterItemsFor(r, items);
    if (!mine.length) continue;
    if (r.channel === 'email' || r.channel === 'both') {
      const to = topic.test_email ? topic.test_email : r.email;
      const html = (topic.test_email
        ? '<div style="font-family:Arial;background:#fef3c7;padding:8px 10px;border-radius:6px;margin-bottom:10px;font-size:12px;">ТЕСТОВ РЕЖИМ — предназначено за ' + esc(r.name) + ' &lt;' + esc(r.email) + '&gt;</div>'
        : '') + overdueHtmlFor(mine, bulletin, taskStats, r.scope !== 'all');
      const ok = await sendEmail(to, subject, html);
      if (ok) { sent++; } else { failed++; }
    }
  }
  if (pushNames.length && !topic.test_email) {
    await sendPushToPeople(pushNames, 'Незавършени задачи', 'Има задачи с изтекъл срок — виж таб Днес.');
  }

  await supabase.from('notification_topics').update({
    last_run_at: new Date().toISOString(),
    last_recipients: planned.length,
    last_status: (failed ? 'ГРЕШКА: ' : 'ok: ') + sent + ' писма, ' + failed + ' неуспешни, ' + items.length + ' реда',
  }).eq('key', topic.key);

  return { topic: topic.key, sent_emails: sent, failed_emails: failed, recipients: planned.length, items: items.length, test_email: topic.test_email || null };
}

async function runTodayDeadlines(supabase: any, topic: any, bg: any, dryRun: boolean) {
  const built = await buildTodayDeadlines(supabase, bg);
  if ((built as any).skip) {
    return { topic: topic.key, skipped: (built as any).skip, recipients: 0 };
  }
  const byStore = (built as any).byStore;
  const targets: string[] = (built as any).targets;

  const planned = targets.map(s => ({ store: s, slot: hhmm(byStore[s].slot), zadachi: byStore[s].lines.length, lines: byStore[s].lines }));

  if (dryRun) {
    return { topic: topic.key, dry_run: true, window: (built as any).window, recipients: planned.length, planned: planned };
  }

  /* Тестовият режим при push тема не праща push — праща ЕДИН имейл със
     списък кой какво би получил. */
  if (topic.test_email) {
    let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;">'
      + '<div style="background:#fef3c7;padding:8px 10px;border-radius:6px;margin-bottom:10px;font-size:12px;">ТЕСТОВ РЕЖИМ — това щеше да тръгне като push до обектите</div>'
      + '<h2 style="margin:0 0 10px;font-size:18px;">Напомняне до обекта · ' + esc((built as any).window) + '</h2>';
    for (const p of planned) {
      html += '<div style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;">'
        + '<div style="font-weight:700;font-size:14px;">' + esc(p.store) + ' — ' + esc(deadlinesTitle(p.lines.length)) + '</div>'
        + '<div style="font-size:13px;line-height:1.6;">' + p.lines.map(esc).join('<br>') + '</div></div>';
    }
    html += '</div>';
    const ok = await sendEmail(topic.test_email, 'ТеМАХ — напомняне до обекта (тест)', html);
    /* И в тестов режим се записва кога е тръгнало — иначе темата
       изглежда като никога неработила. */
    await supabase.from('notification_topics').update({
      last_run_at: new Date().toISOString(),
      last_recipients: planned.length,
      last_status: (ok ? 'ok (тест): ' : 'ГРЕШКА (тест): ') + planned.length + ' обекта',
    }).eq('key', topic.key);
    return { topic: topic.key, test_email: topic.test_email, recipients: planned.length, sent: ok ? 1 : 0 };
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const store of targets) {
    const slot = byStore[store].slot;
    const refKey = bg.dateStr + ':' + store + ':' + hhmm(slot);
    const ins = await supabase.from('notification_log')
      .insert({ topic_key: topic.key, ref_key: refKey, detail: byStore[store].lines.length + ' задачи' });
    if (ins.error) { skipped++; continue; }

    const ok = await sendPushFilters(
      [{ field: 'tag', key: 'store_name', relation: '=', value: store }],
      deadlinesTitle(byStore[store].lines.length),
      byStore[store].lines.join('\n'));
    if (ok) { sent++; } else {
      failed++;
      await supabase.from('notification_log').delete()
        .eq('topic_key', topic.key).eq('ref_key', refKey);
    }
  }

  await supabase.from('notification_topics').update({
    last_run_at: new Date().toISOString(),
    last_recipients: sent,
    last_status: (failed ? 'ГРЕШКА: ' : 'ok: ') + sent + ' обекта, ' + failed + ' неуспешни, ' + skipped + ' вече пратени',
  }).eq('key', topic.key);

  return { topic: topic.key, sent: sent, failed: failed, already_sent: skipped, window: (built as any).window };
}

async function runPromoExpiring(supabase: any, topic: any, bg: any, dryRun: boolean) {
  const built = await buildPromoExpiring(supabase, bg);
  if ((built as any).skip) {
    return { topic: topic.key, skipped: (built as any).skip, recipients: 0 };
  }
  const todayList: any[] = (built as any).today;
  const aheadList: any[] = (built as any).ahead;

  const title = '⚠️ Изтичащи промоции';
  const subject = 'ТеМАХ — Изтичащи промоции (' + bgDate(bg.dateStr) + ')';
  const pushText = promoPushText(todayList, aheadList);
  const html = promoHtmlFor(todayList, aheadList, bg);

  const stores = await reportableStores(supabase);
  /* Само каналите с имейл — матрицата дава на store: push, на controlling:
     email. Получател с 'both' влиза и в двете, затова е тук И в push-а. */
  const all = await resolveRecipients(supabase, topic.key);
  const mailTo = all.filter((r: Recipient) => r.channel === 'email' || r.channel === 'both');

  if (dryRun) {
    return {
      topic: topic.key, dry_run: true, date: bg.dateStr,
      dnes: todayList.length, do_3_dni: aheadList.length,
      push_stores: stores.length, emails: mailTo.map((r: Recipient) => r.email),
      recipients: stores.length + mailTo.length,
    };
  }

  /* Тестов режим: всичко отива на един адрес и push НЕ тръгва — същото
     правило като при today_deadlines. */
  if (topic.test_email) {
    const testHtml = '<div style="font-family:Arial;background:#fef3c7;padding:8px 10px;border-radius:6px;margin-bottom:10px;font-size:12px;">'
      + 'ТЕСТОВ РЕЖИМ — push щеше да тръгне до ' + stores.length + ' обекта, имейл до '
      + esc(mailTo.map((r: Recipient) => r.email).join(', ') || '—') + '</div>' + html;
    const ok = await sendEmail(topic.test_email, subject + ' (тест)', testHtml);
    await supabase.from('notification_topics').update({
      last_run_at: new Date().toISOString(),
      last_recipients: stores.length + mailTo.length,
      last_status: (ok ? 'ok (тест): ' : 'ГРЕШКА (тест): ') + todayList.length + ' днес, ' + aheadList.length + ' до 3 дни',
    }).eq('key', topic.key);
    return { topic: topic.key, test_email: topic.test_email, recipients: stores.length + mailTo.length, sent: ok ? 1 : 0 };
  }

  /* Дедупликация за целия ден — един ref_key, защото известието е ЕДНО за
     цялата верига, не по обект както при today_deadlines. */
  const refKey = bg.dateStr;
  const ins = await supabase.from('notification_log')
    .insert({ topic_key: topic.key, ref_key: refKey, detail: todayList.length + ' днес, ' + aheadList.length + ' до 3 дни' });
  if (ins.error) {
    return { topic: topic.key, skipped: 'Вече изпратено за ' + refKey, recipients: 0 };
  }

  let pushOk = false, sentMail = 0, failed = 0;

  if (stores.length) {
    /* Една OR-верига, едно известие — не по едно на обект. */
    const filters: unknown[] = [];
    stores.forEach((s: string, i: number) => {
      if (i > 0) filters.push({ operator: 'OR' });
      filters.push({ field: 'tag', key: 'store_name', relation: '=', value: s });
    });
    pushOk = await sendPushFilters(filters, title, pushText);
    if (!pushOk) failed++;
  }

  for (const r of mailTo) {
    const ok = await sendEmail(r.email, subject, html);
    if (ok) { sentMail++; } else { failed++; }
  }

  /* Нищо не е излязло — редът в notification_log се маха, за да се опита пак.
     И last_run_at НЕ се пише: за разлика от today_deadlines тази тема не е в
     WINDOWED_TOPICS, тоест isDue() я спира за целия ден, щом веднъж има
     днешна дата в last_run_at. Записан last_run_at при пълен провал би
     обезсмислил изтриването на реда — следващото събуждане на крона в
     прозореца 08:30-08:45 нямаше да опита изобщо. */
  const anythingOut = pushOk || sentMail > 0;
  if (!anythingOut) {
    await supabase.from('notification_log').delete()
      .eq('topic_key', topic.key).eq('ref_key', refKey);
    await supabase.from('notification_topics').update({
      last_status: 'ГРЕШКА: нищо не тръгна (' + failed + ' неуспешни) — ще се опита пак',
    }).eq('key', topic.key);
    return { topic: topic.key, sent_push: false, sent_emails: 0, failed: failed, retry: true };
  }

  await supabase.from('notification_topics').update({
    last_run_at: new Date().toISOString(),
    last_recipients: (pushOk ? stores.length : 0) + sentMail,
    last_status: (failed ? 'ГРЕШКА: ' : 'ok: ') + (pushOk ? stores.length : 0) + ' обекта, '
      + sentMail + ' писма, ' + failed + ' неуспешни',
  }).eq('key', topic.key);

  return {
    topic: topic.key, sent_push: pushOk, push_stores: pushOk ? stores.length : 0,
    sent_emails: sentMail, failed: failed,
    dnes: todayList.length, do_3_dni: aheadList.length,
  };
}

/* ЕДИНСТВЕНИЯТ списък с темите, които имат строител. notification_topics
   държи осем реда; строители тук има за трите отдолу. Останалите са редове
   в базата и нищо повече — събудят ли се, връщат skipped.

   Списъкът е МАСИВ ОТ ДВОЙКИ ключ→строител нарочно: гол масив с ключове и
   отделна верига от if-ове са два списъка, които се разминават мълчаливо.
   Тук ключът и функцията стоят на един ред и не могат да се разделят.

   Копие на този списък живее в admin.js (NOTIF_IMPLEMENTED_TOPICS) — екранът
   приглушава темите без строител и заключва превключвателя им. Порталът няма
   как да прочете този файл по време на изпълнение, затова е копие; двете се
   менят ЗАЕДНО, а tests/admin-notifications.test.js чете и двата списъка от
   файловете и пада, ако се разминат. */
const IMPLEMENTED_TOPICS = [
  { key: 'overdue_tasks',   run: runOverdueTasks },
  { key: 'today_deadlines', run: runTodayDeadlines },
  { key: 'promo_expiring',  run: runPromoExpiring },
];

async function runTopic(supabase: any, topic: any, bg: any, dryRun: boolean) {
  const impl = IMPLEMENTED_TOPICS.find((x) => x.key === topic.key);
  if (!impl) return { topic: topic.key, skipped: 'Темата още не е реализирана в кода' };
  return await impl.run(supabase, topic, bg, dryRun);
}

/* promo_expiring НЕ е тук нарочно — виж бележката в runPromoExpiring.
   Темата е с фиксиран час 08:30 и стандартната логика на isDue я покрива;
   вписването ѝ тук би махнало И проверката за час, И еднократността за деня,
   тоест кронът щеше да я опитва на всеки 15 минути с единствена защита
   notification_log. */
const WINDOWED_TOPICS = ['today_deadlines'];

function isDue(topic: any, bg: any): boolean {
  if (!topic.active) return false;
  const weekdayOk = topic.schedule_type === 'weekly'
    ? topic.day_of_week === bg.dow
    : (Array.isArray(topic.weekdays) && topic.weekdays.length
        ? topic.weekdays.indexOf(bg.isoWeekday) >= 0 : true);
  if (!weekdayOk) return false;

  if (WINDOWED_TOPICS.indexOf(topic.key) >= 0) return true;

  if (!topic.scheduled_time) return false;
  const [h, m] = String(topic.scheduled_time).split(':').map(Number);
  const schedMin = h * 60 + m;
  const nowMin = bg.hours * 60 + bg.minutes;
  if (nowMin < schedMin || nowMin - schedMin > 15) return false;
  if (topic.last_run_at && String(topic.last_run_at).slice(0, 10) === bg.dateStr) return false;
  return topic.schedule_type === 'weekly' || topic.schedule_type === 'daily';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  try {
    const supabase = createClient(SB_URL, SB_SERVICE_KEY);
    let body: any = {};
    try { body = await req.json(); } catch (_e) { body = {}; }
    const bg = bgNow(new Date());
    const dryRun = body.dry_run === true;

    if (body.topic_key) {
      const { data: topics } = await supabase
        .from('notification_topics').select('*').eq('key', body.topic_key).limit(1);
      if (!topics || !topics.length) {
        return Response.json({ ok: false, error: 'Няма такава тема: ' + body.topic_key }, { headers: CORS, status: 404 });
      }
      const result = await runTopic(supabase, topics[0], bg, dryRun);
      return Response.json({ ok: true, mode: 'manual', bg_date: bg.dateStr, result: result }, { headers: CORS });
    }

    const { data: topics } = await supabase
      .from('notification_topics').select('*').eq('active', true);

    const due = (topics || []).filter((t: any) => isDue(t, bg));
    const results = [];
    for (const t of due) { results.push(await runTopic(supabase, t, bg, dryRun)); }

    return Response.json({
      ok: true, mode: 'scheduled', bg_date: bg.dateStr,
      bg_time: bg.hours + ':' + String(bg.minutes).padStart(2, '0'),
      checked: (topics || []).length, ran: results.length, results: results,
    }, { headers: CORS });

  } catch (e) {
    const err = e as Error;
    return Response.json({ ok: false, error: err.message }, { headers: CORS, status: 500 });
  }
});
