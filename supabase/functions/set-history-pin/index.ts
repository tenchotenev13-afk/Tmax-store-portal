// set-history-pin — админ задава/ресетва индивидуален PIN на колега за таб История.
// Същия модел като auth-set-password — bcrypt хеш, чистият код никога не стига до таблицата.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hashSync, genSaltSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
    const user_id = body.user_id || null;
    const new_pin = (body.new_pin || "").toString().trim();

    if (!user_id || !new_pin) {
      return new Response(JSON.stringify({ ok: false, message: "Липсва user_id или new_pin" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!/^[0-9]{4,6}$/.test(new_pin)) {
      return new Response(JSON.stringify({ ok: false, message: "PIN трябва да е 4-6 цифри" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const hash = hashSync(new_pin, genSaltSync(10));

    const { error, data } = await supabase
      .from("users")
      .update({ history_pin_hash: hash })
      .eq("id", user_id)
      .select("email")
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await supabase.from("audit_log").insert({
      event: "history_pin_set",
      user_email: data?.email || null,
      success: true,
      details: null,
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, message: "server_error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
