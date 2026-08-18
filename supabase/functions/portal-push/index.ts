import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OS_APP_ID = "a326639e-4ace-46f5-baa7-3f6259431d18";
const ICON_URL = "https://tenchotenev13-afk.github.io/Tmax-store-portal/icon-192.png";
const PORTAL_URL = "https://tenchotenev13-afk.github.io/Tmax-store-portal/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

   const OS_REST_KEY = Deno.env.get("ONESIGNAL_REST_KEY") || "";

  let body: Record<string, unknown> = {};
  try {
    const txt = await req.text();
    if (txt.trim().startsWith("{")) body = JSON.parse(txt);
  } catch (_) {}

  const title   = (body.title   as string) || "ТеМАХ Портал";
  const message = (body.message as string) || "";
  const url     = (body.url     as string) || PORTAL_URL;
  const filters = body.filters  || null;
  const segments = body.included_segments || null;

  const payload: Record<string, unknown> = {
    app_id: OS_APP_ID,
    headings: { bg: title, en: title },
    contents: { bg: message, en: message },
    url,
    chrome_web_icon: ICON_URL,
    firefox_icon: ICON_URL,
    large_icon: ICON_URL,
  };

  if (filters) {
    payload.filters = filters;
  } else {
    payload.included_segments = segments || ["All"];
  }

  try {
    const osRes = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${OS_REST_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const osData = await osRes.json();

    return new Response(
      JSON.stringify({ ok: osRes.ok, data: osData }),
      { status: osRes.ok ? 200 : 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});