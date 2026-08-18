// kasa-access-check — проверява индивидуален PIN преди достъп до таб История.
// Сравнява се срещу users.history_pin_hash (bcrypt) на конкретния user_id —
// не един споделен код за всички. Ако човекът няма зададен PIN — достъпът се отказва.
import { createClient } from "npm:@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pin = (body.pin || "").toString().trim();
    const user_id = body.user_id || null;

    if (!pin || !user_id) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_fields" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data } = await supabase
      .from("users")
      .select("history_pin_hash, email, store_name")
      .eq("id", user_id)
      .single();

    let ok = false;
    if (data && data.history_pin_hash) {
      try {
        ok = compareSync(pin, data.history_pin_hash);
      } catch (_e) {
        ok = false;
      }
    }

    // Одит запис — best effort, не блокира отговора при грешка
    await supabase.from("audit_log").insert({
      event: ok ? "history_pin_success" : "history_pin_failed",
      user_email: data?.email || null,
      store_name: data?.store_name || null,
      success: ok,
      details: null,
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
