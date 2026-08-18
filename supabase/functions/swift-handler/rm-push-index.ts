import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OS_APP_ID = "a326639e-4ace-46f5-baa7-3f6259431d18";
const RM_ONESIGNAL_ID = "dbe900af-0f72-4069-b3e2-8ff636328c51";
const ICON_URL = "https://tenchotenev13-afk.github.io/RM-app/icon-192.png";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DAY_BG = ["Неделя","Понеделник","Вторник","Сряда","Четвъртък","Петък","Събота"];
const REMINDERS: Record<number, string> = {
  8: "☀️ Сутрешни задачи",
  14: "🕑 Следобедни задачи",
  17: "🏁 Краен преглед",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const OS_REST_KEY = Deno.env.get("ONESIGNAL_REST_KEY") || "";

  let body: Record<string, unknown> = {};
  try {
    const bodyText = await req.text();
    if (bodyText && bodyText.trim().startsWith("{")) body = JSON.parse(bodyText);
  } catch (_) { /* ignore */ }

  const isTest = body.test === true;
  const hour = typeof body.hour === "number" ? body.hour : ((new Date().getUTCHours() + 3) % 24);
  const eetDay = new Date().getUTCDay();
  const label = REMINDERS[hour];

  console.log("HOUR:" + hour + " LABEL:" + (label || "none"));

  if (!isTest && !label) {
    return new Response(
      JSON.stringify({ ok: false, message: `Hour ${hour} not a reminder hour` }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  try {
    const title = `ТеМАХ РМ — ${label || "Напомняне"}`;
    const message = `Провери задачите за ${DAY_BG[eetDay]}`;

    const osRes = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${OS_REST_KEY}`,
      },
      body: JSON.stringify({
        app_id: OS_APP_ID,
        include_aliases: { onesignal_id: [RM_ONESIGNAL_ID] },
        target_channel: "push",
        headings: { bg: title, en: title },
        contents: { bg: message, en: message },
        priority: 10,
        url: "https://tenchotenev13-afk.github.io/RM-app/",
        // Icon for all platforms
        icon: ICON_URL,
        chrome_web_icon: ICON_URL,
        firefox_icon: ICON_URL,
        large_icon: ICON_URL,
        chrome_web_badge: ICON_URL,
      }),
    });

    const osData = await osRes.json();
    console.log("OS_STATUS:" + osRes.status);
    console.log("OS_RESPONSE:" + JSON.stringify(osData).substring(0, 300));

    if (!osRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: osData }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, hour, label, recipients: osData.recipients, id: osData.id }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("FETCH_ERROR:" + String(err));
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});