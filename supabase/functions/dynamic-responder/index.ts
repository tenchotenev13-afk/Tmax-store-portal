import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_FN_URL = SB_URL + "/functions/v1/resend-email";

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

    const due = (schedules || []).filter((s: any) => {
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
    });

    const results = [];
    for (const s of due) {
      let title = s.message || '';
      if (!title) {
        const table = s.entity_type === 'subtask' ? 'task_subtasks'
          : s.entity_type === 'promotion' ? 'bulletin_promotions'
          : s.entity_type === 'recurring_task' ? 'recurring_tasks'
          : 'bulletin_tasks';
        const { data: ent } = await supabase.from(table).select('title').eq('id', s.entity_id).maybeSingle();
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

    return Response.json({ ok: true, checked: schedules?.length || 0, sent: results.length, results, debug_bg_time: nowHHMM, debug_bg_date: todayStr }, { headers: CORS });
  } catch (e) {
    const err = e as Error;
    return Response.json({ ok: false, error: err.message }, { headers: CORS, status: 500 });
  }
});
