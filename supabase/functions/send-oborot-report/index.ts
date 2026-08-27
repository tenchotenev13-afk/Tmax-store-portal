/* send-oborot-report — вечерният имейл с оборота.
   Крон: 45 17 * * * (UTC) = 20:45 лятно / 19:45 зимно софийско време.

   Чете САМО daily_turnover (вечерната сводка), НЕ kasa_reports — истинската
   каса се попълва на следващия ден и не е налична вечерта.

   ТРИ НАЧИНА НА ПЛАЩАНЕ: в брой, с карта и по банка. Банковото плащане
   се отразява в деня, в който е ПОЛУЧЕНО, и влиза в общия оборот за деня.
   Колоната "Банка" се показва САМО ако поне един обект има ненулева
   стойност — при обичаен ден писмото изглежда както преди.

   РАЗМИНАВАНЕ (25.08.2026): общият оборот може да не се връзва със сбора
   от трите начина на плащане по законна причина — напр. клиент плаща по
   банка, а касиерът маркира продажбата като "в брой". Затова записът НЕ се
   блокира, а разминаването се ПОКАЗВА в "Изисква внимание" — прозрачност
   вместо предотвратяване. Базата блокира само над 50% от оборота, тоест
   изместената десетична точка (≈ 99%).

   ВАЛУТА: EUR. От 1 януари 2026 официалната валута в България е еврото.

   ОБЕКТИ: списъкът се вади от users (уникални store_name), а не от stores.
   Пазарджик и Сервиз Троян са ИЗРИЧНО в списъка с изключения, а не
   отпадат "защото нямат акаунт" — ако Сервиз Троян получи акаунт за
   гаранциите, не трябва да се появи тук.

   Получатели: users.oborot_report — 'all' | 'assigned' | NULL.

   Тяло на заявката (всичко по избор):
     { "date": "2026-08-19" }  — друга дата вместо днешната (за проба)
     { "dry_run": true }       — връща HTML-а, без да праща имейл
     { "to": ["a@b.bg"] }      — праща само на този адрес, игнорира базата
*/

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REST = SUPABASE_URL + '/rest/v1/';
const PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';
const CUR = 'EUR';

/* Праг, над който разминаването се отчита в имейла. По-ниско от прага
   в базата (50%) — базата блокира само типографски грешки, а имейлът
   показва всяко разминаване над един евро, за да се вижда. */
const MISMATCH_MIN = 1;

function sbGet(t: string, q?: string) {
  return fetch(REST + t + (q ? '?' + q : ''), {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  }).then(function (r) { return r.json(); });
}

function sofiaToday(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const g = (t: string) => (p.find(x => x.type === t) || { value: '' }).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function firstOfMonth(iso: string): string { return iso.slice(0, 7) + '-01'; }
function prevMonthSameDay(iso: string) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const dd = Math.min(d, last);
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: py + '-' + p(pm) + '-01', to: py + '-' + p(pm) + '-' + p(dd) };
}

function esc(s: any) {
  return s === 0 ? '0' : (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '—');
}
function money(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money0(n: number) {
  return Math.round(n).toLocaleString('bg-BG');
}
function pctDiff(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round((cur - prev) / prev * 1000) / 10;
}
function diffHtml(d: number | null) {
  if (d === null) return '<span style="color:#9CA3AF;">—</span>';
  const c = d > 0 ? '#2F9E5C' : d < 0 ? '#C0392B' : '#94a3b8';
  const s = d > 0 ? '+' : '';
  return '<span style="color:' + c + ';font-weight:700;">' + s + String(d).replace('.', ',') + '%</span>';
}

const REPORT_EXCLUDED_STORES = [
  'Централен офис',
  'Логистичен склад Добрич',
  'Логистичен склад Търговище',
  'Пазарджик',
  'Сервиз Троян'
];
function isReportableStore(name: string) {
  return !!name && REPORT_EXCLUDED_STORES.indexOf(name) < 0;
}

const STICKY = ['done', 'refused', 'postponed', 'approved', 'arrived', 'sent', 'processed'];
function isOverdue(o: any, todayISO: string) {
  if (STICKY.indexOf(o.status) >= 0) return false;
  if (!o.delivery) return false;
  return String(o.delivery).slice(0, 10) < todayISO;
}

const DAY_BG = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];
function weekdayBg(iso: string) { return DAY_BG[new Date(iso + 'T12:00:00Z').getUTCDay()]; }
function shortDate(iso: string) { return iso.slice(8, 10) + '.' + iso.slice(5, 7); }
function dateLabel(iso: string) {
  return shortDate(iso) + '.' + iso.slice(0, 4) + ' (' + weekdayBg(iso) + ')';
}

/* ══════════════ СЪБИРАНЕ НА ДАННИТЕ ══════════════ */
async function collect(dateISO: string) {
  const prevISO = addDays(dateISO, -7);
  const mFrom = firstOfMonth(dateISO);
  const pm = prevMonthSameDay(dateISO);
  const sel = 'select=store_name,date,total_turnover,cash_turnover,card_turnover,bank_turnover,customers,note,created_by,created_at';

  const [todayRows, prevRows, monthRows, pmRows, usersRaw, ordersRaw] = await Promise.all([
    sbGet('daily_turnover', sel + '&date=eq.' + dateISO),
    sbGet('daily_turnover', 'select=store_name,total_turnover&date=eq.' + prevISO),
    sbGet('daily_turnover', 'select=total_turnover&date=gte.' + mFrom + '&date=lte.' + dateISO),
    sbGet('daily_turnover', 'select=total_turnover&date=gte.' + pm.from + '&date=lte.' + pm.to),
    sbGet('users', 'select=store_name,display_name,email,role,active,assigned_stores,oborot_report'),
    sbGet('client_orders', 'select=store_name,status,delivery')
  ]);

  const users = Array.isArray(usersRaw) ? usersRaw : [];
  const seen: Record<string, boolean> = {};
  const stores: string[] = [];
  users.forEach((u: any) => {
    if (u.active === false) return;
    if (!isReportableStore(u.store_name) || seen[u.store_name]) return;
    seen[u.store_name] = true; stores.push(u.store_name);
  });
  stores.sort();

  const today: Record<string, any> = {};
  (Array.isArray(todayRows) ? todayRows : []).forEach((r: any) => { today[r.store_name] = r; });
  const prev: Record<string, number> = {};
  (Array.isArray(prevRows) ? prevRows : []).forEach((r: any) => { prev[r.store_name] = +r.total_turnover; });

  const overdue: Record<string, number> = {};
  (Array.isArray(ordersRaw) ? ordersRaw : []).forEach((o: any) => {
    if (!isOverdue(o, dateISO)) return;
    overdue[o.store_name] = (overdue[o.store_name] || 0) + 1;
  });

  const rows = stores.map((s) => {
    const r = today[s];
    const total = r ? +r.total_turnover : 0;
    const cash = r ? +r.cash_turnover : 0;
    const card = r ? +r.card_turnover : 0;
    const bank = r ? (+r.bank_turnover || 0) : 0;
    const cust = r ? +r.customers : 0;
    return {
      store: s, has: !!r, total, cash, card, bank, customers: cust,
      /* Положително = общият е повече от сбора на трите начина. */
      mismatch: r ? Math.round((total - cash - card - bank) * 100) / 100 : 0,
      prevTotal: prev[s] || 0,
      avg: cust ? total / cust : 0,
      cardPct: total ? Math.round(card / total * 100) : 0,
      diff: r ? pctDiff(total, prev[s] || 0) : null,
      note: r ? (r.note || '') : '',
      overdue: overdue[s] || 0
    };
  });

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const monthTotal = sum((Array.isArray(monthRows) ? monthRows : []).map((r: any) => +r.total_turnover));
  const pmTotal = sum((Array.isArray(pmRows) ? pmRows : []).map((r: any) => +r.total_turnover));

  return { dateISO, prevISO, rows, users, monthTotal, pmTotal, pmLabel: shortDate(pm.from) + '–' + shortDate(pm.to), mFrom };
}

/* ══════════════ HTML ══════════════ */
function statCell(num: string, label: string) {
  return '<td style="width:50%;padding:4px;">' +
    '<div style="background:#F4F6FB;border-radius:8px;padding:16px 8px;text-align:center;">' +
    '<div style="font-size:23px;font-weight:800;color:#1E2761;line-height:1.1;">' + num + '</div>' +
    '<div style="font-size:10px;color:#6B7280;margin-top:5px;">' + label + '</div></div></td>';
}

function buildHtml(d: any, rows: any[], scopeLabel: string) {
  const filed = rows.filter((r) => r.has);
  const missing = rows.filter((r) => !r.has);
  const s = (f: (r: any) => number) => filed.reduce((a, r) => a + f(r), 0);
  const total = s((r) => r.total), cash = s((r) => r.cash), card = s((r) => r.card),
        bank = s((r) => r.bank), cust = s((r) => r.customers);

  const hasBank = filed.some((r) => r.bank > 0);
  const nCols = hasBank ? 8 : 7;

  const both = filed.filter((r) => r.prevTotal > 0);
  const overallDiff = both.length
    ? pctDiff(both.reduce((a, r) => a + r.total, 0), both.reduce((a, r) => a + r.prevTotal, 0))
    : null;

  let b = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:2px;"><tr>' +
    statCell(money0(total) + ' ' + CUR, 'общ оборот') +
    statCell(cust ? money0(cust) : '—', 'клиенти' + (cust ? ' · среден чек ' + money(total / cust) + ' ' + CUR : '')) +
    '</tr></table>';

  if (total) {
    const part = (label: string, v: number) =>
      '<span style="white-space:nowrap;">' + label + ' <b style="color:#1F2937;">' + money0(v) + ' ' + CUR +
      '</b> <span style="color:#9CA3AF;">' + Math.round(v / total * 100) + '%</span></span>';
    b += '<div style="text-align:center;font-size:12px;color:#6B7280;margin:6px 0 8px;line-height:1.9;">' +
      part('в брой', cash) + ' &nbsp;·&nbsp; ' + part('с карта', card) +
      (bank > 0 ? ' &nbsp;·&nbsp; ' + part('по банка', bank) : '') +
      '</div>';
  }

  if (overallDiff !== null) {
    b += '<div style="text-align:center;font-size:12px;margin:2px 0 10px;">' + diffHtml(overallDiff) +
      ' <span style="color:#6B7280;">спрямо ' + weekdayBg(d.prevISO) + ' ' + shortDate(d.prevISO) + '</span></div>';
  }

  b += '<div style="font-size:12px;color:#6B7280;text-align:center;margin-bottom:12px;">Подали: <b style="color:#1F2937;">' +
    filed.length + ' от ' + rows.length + '</b> обекта</div>';

  const drops = filed.filter((r) => r.diff !== null && r.diff <= -25);
  const withOverdue = rows.filter((r) => r.overdue > 0);
  const notes = filed.filter((r) => r.note);
  /* Разминаване между общия оборот и сбора от трите начина.
     Не е грешка по определение — най-честата причина е банково плащане,
     маркирано от касиера като "в брой". Показва се, за да се знае. */
  const mismatched = filed.filter((r) => Math.abs(r.mismatch) >= MISMATCH_MIN);

  if (missing.length || drops.length || withOverdue.length || notes.length || mismatched.length) {
    let a = '';
    if (missing.length) a += '<div style="font-size:13px;color:#B4442E;margin-bottom:5px;"><b>Не са подали оборот:</b> ' + missing.map((r) => esc(r.store)).join(', ') + '</div>';
    if (mismatched.length) {
      a += '<div style="font-size:13px;color:#8A5A12;margin-bottom:5px;"><b>Сумите не се връзват:</b> ' +
        mismatched.map((r) => esc(r.store) + ' (' + (r.mismatch > 0 ? '+' : '−') + money(Math.abs(r.mismatch)) + ' ' + CUR + ')').join(', ') +
        '<div style="font-size:11px;color:#9C7B3A;margin-top:2px;">Общият оборот се различава от сбора брой + карта + банка. Обичайна причина: плащане по банка, маркирано на касата като в брой.</div></div>';
    }
    if (drops.length) a += '<div style="font-size:13px;color:#B4442E;margin-bottom:5px;"><b>Спад над 25%:</b> ' + drops.map((r) => esc(r.store) + ' (' + String(r.diff).replace('.', ',') + '%)').join(', ') + '</div>';
    if (withOverdue.length) a += '<div style="font-size:13px;color:#B4442E;margin-bottom:5px;"><b>Неизпълнени заявки:</b> ' + withOverdue.map((r) => esc(r.store) + ' (' + r.overdue + ')').join(', ') + '</div>';
    notes.forEach((r) => { a += '<div style="font-size:12px;color:#8A5A12;margin-bottom:3px;">💬 <b>' + esc(r.store) + ':</b> ' + esc(r.note) + '</div>'; });
    b += '<div style="background:#FDEEEA;border:1px solid #F3C6BA;border-radius:8px;padding:12px 14px;margin-bottom:14px;">' +
      '<div style="font-size:11px;font-weight:800;color:#B4442E;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Изисква внимание</div>' + a + '</div>';
  }

  const th = (t: string, al: string) => '<th align="' + al + '" style="padding:7px 8px;color:#6B7280;font-size:10px;text-transform:uppercase;">' + t + '</th>';

  b += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти · всички суми в ' + CUR + '</div>';
  b += '<table role="presentation" style="width:100%;border-collapse:collapse;font-size:12px;">' +
    '<tr style="background:#F4F6FB;">' + th('Обект', 'left') + th('Оборот', 'right') +
    th('В брой', 'right') + th('С карта', 'right') +
    (hasBank ? th('Банка', 'right') : '') +
    th('Кл.', 'right') + th('Ср. чек', 'right') + th('Разлика', 'right') + '</tr>';

  const sorted = rows.slice().sort((a, x) => (x.has ? x.total : -1) - (a.has ? a.total : -1));
  sorted.forEach((r) => {
    if (!r.has) {
      b += '<tr style="border-bottom:1px solid #eef1f6;background:#FFFBEB;">' +
        '<td style="padding:7px 8px;color:#92400e;font-weight:600;">' + esc(r.store) + '</td>' +
        '<td colspan="' + (nCols - 1) + '" style="padding:7px 8px;color:#92400e;font-size:11px;">не е подал оборот</td></tr>';
      return;
    }
    const flag = Math.abs(r.mismatch) >= MISMATCH_MIN
      ? ' <span title="Сумите не се връзват" style="color:#B4842E;font-weight:700;">⚠</span>' : '';
    b += '<tr style="border-bottom:1px solid #eef1f6;">' +
      '<td style="padding:7px 8px;color:#1F2937;font-weight:600;">' + esc(r.store) + flag + '</td>' +
      '<td align="right" style="padding:7px 8px;color:#1F2937;font-weight:700;">' + money(r.total) + '</td>' +
      '<td align="right" style="padding:7px 8px;color:#4B5563;">' + money(r.cash) + '</td>' +
      '<td align="right" style="padding:7px 8px;color:#4B5563;">' + money(r.card) + ' <span style="color:#9CA3AF;font-size:10px;">' + r.cardPct + '%</span></td>' +
      (hasBank ? '<td align="right" style="padding:7px 8px;color:' + (r.bank > 0 ? '#1F2937;font-weight:700;' : '#C9CDD4;') + '">' + (r.bank > 0 ? money(r.bank) : '—') + '</td>' : '') +
      '<td align="right" style="padding:7px 8px;color:#4B5563;">' + r.customers + '</td>' +
      '<td align="right" style="padding:7px 8px;color:#4B5563;">' + money(r.avg) + '</td>' +
      '<td align="right" style="padding:7px 8px;">' + diffHtml(r.diff) + '</td></tr>';
  });

  if (filed.length) {
    b += '<tr style="background:#F4F6FB;">' +
      '<td style="padding:8px;font-weight:800;color:#1E2761;">ОБЩО</td>' +
      '<td align="right" style="padding:8px;font-weight:800;color:#1E2761;">' + money(total) + '</td>' +
      '<td align="right" style="padding:8px;font-weight:700;color:#1E2761;">' + money(cash) + '</td>' +
      '<td align="right" style="padding:8px;font-weight:700;color:#1E2761;">' + money(card) + '</td>' +
      (hasBank ? '<td align="right" style="padding:8px;font-weight:700;color:#1E2761;">' + money(bank) + '</td>' : '') +
      '<td align="right" style="padding:8px;font-weight:700;color:#1E2761;">' + cust + '</td>' +
      '<td align="right" style="padding:8px;font-weight:700;color:#1E2761;">' + (cust ? money(total / cust) : '—') + '</td>' +
      '<td align="right" style="padding:8px;">' + diffHtml(overallDiff) + '</td></tr>';
  }
  b += '</table>';

  if (scopeLabel === 'all' && d.monthTotal) {
    b += '<div style="margin-top:16px;padding:12px 14px;background:#F9FAFC;border:1px solid #eef1f6;border-radius:8px;">' +
      '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">От началото на месеца</div>' +
      '<div style="font-size:13px;color:#1F2937;">' + shortDate(d.mFrom) + '–' + shortDate(d.dateISO) + ': <b>' + money0(d.monthTotal) + ' ' + CUR + '</b></div>' +
      (d.pmTotal
        ? '<div style="font-size:13px;color:#6B7280;margin-top:3px;">' + d.pmLabel + ': ' + money0(d.pmTotal) + ' ' + CUR + ' &nbsp; ' + diffHtml(pctDiff(d.monthTotal, d.pmTotal)) + '</div>'
        : '') +
      '</div>';
  }

  b += '<div style="margin-top:14px;font-size:11px;color:#94a3b8;font-style:italic;">Вечерната сводка е информативна. Счетоводните отчети се попълват на следващия ден и минават по своя ред.</div>';

  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:20px;background:#e8ecf3;font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;">' +
    '<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 18px rgba(30,39,97,.12);">' +
    '<div style="background:#1E2761;padding:24px;">' +
    '<p style="color:#CADCFC;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">ТеМАХ Портал</p>' +
    '<h1 style="color:#fff;font-size:21px;margin:0 0 4px;font-weight:700;">💰 Оборот ' + dateLabel(d.dateISO) + '</h1>' +
    '<p style="color:#9DB3E8;font-size:13px;margin:0;">' + (scopeLabel === 'all' ? 'Всички обекти' : scopeLabel) + '</p>' +
    '</div><div style="padding:20px;">' + b + '</div>' +
    '<div style="padding:18px 24px 24px;text-align:center;">' +
    '<a href="' + PORTAL_URL + '" style="display:inline-block;background:#1E2761;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 26px;border-radius:7px;">Отвори в портала →</a>' +
    '<div style="font-size:11px;color:#9aa4b2;margin-top:14px;">Автоматичен отчет · ТеМАХ Портал</div>' +
    '</div></div></body></html>';
}

function buildSubject(dateISO: string, rows: any[]) {
  const total = rows.filter((r) => r.has).reduce((a, r) => a + r.total, 0);
  return '💰 ТеМАХ — Оборот ' + shortDate(dateISO) + ' — ' + Math.round(total).toLocaleString('bg-BG') + ' ' + CUR;
}

async function sendMail(to: string[], subject: string, html: string) {
  const r = await fetch(SUPABASE_URL + '/functions/v1/resend-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_KEY, 'apikey': SERVICE_KEY },
    body: JSON.stringify({ to, subject, html })
  });
  return { ok: r.ok, status: r.status };
}

Deno.serve(async (req: Request) => {
  try {
    let body: any = {};
    try { body = await req.json(); } catch (_e) { /* празно тяло е допустимо */ }

    const dateISO = (body && body.date) ? String(body.date).slice(0, 10) : sofiaToday();
    const d = await collect(dateISO);

    if (body && Array.isArray(body.to) && body.to.length) {
      const html = buildHtml(d, d.rows, 'all');
      const subj = buildSubject(dateISO, d.rows);
      if (body.dry_run) return new Response(JSON.stringify({ ok: true, dry_run: true, subject: subj, html }), { headers: { 'Content-Type': 'application/json' } });
      const res = await sendMail(body.to, subj, html);
      return new Response(JSON.stringify({ ok: true, sent: res.ok, status: res.status, to: body.to, subject: subj }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body && body.dry_run) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, date: dateISO, stores: d.rows.length, subject: buildSubject(dateISO, d.rows), html: buildHtml(d, d.rows, 'all') }), { headers: { 'Content-Type': 'application/json' } });
    }

    const recips = d.users.filter((u: any) =>
      u.active !== false && u.email && (u.oborot_report === 'all' || u.oborot_report === 'assigned'));

    if (!recips.length) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: 'no_recipients', date: dateISO }), { headers: { 'Content-Type': 'application/json' } });
    }

    const out: any[] = [];
    for (const u of recips) {
      let rows = d.rows, scope = 'all';
      if (u.oborot_report === 'assigned') {
        const mine: string[] = Array.isArray(u.assigned_stores) ? u.assigned_stores : [];
        rows = d.rows.filter((r: any) => mine.indexOf(r.store) >= 0);
        scope = rows.length + ' обекта';
        if (!rows.length) { out.push({ email: u.email, sent: false, reason: 'no_assigned_stores' }); continue; }
      }
      const res = await sendMail([u.email], buildSubject(dateISO, rows), buildHtml(d, rows, scope));
      out.push({ email: u.email, scope: u.oborot_report, stores: rows.length, sent: res.ok, status: res.status });
    }

    return new Response(JSON.stringify({ ok: true, date: dateISO, results: out }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
