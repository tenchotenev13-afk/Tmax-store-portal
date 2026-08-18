// supabase/functions/auth-login/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Невалидна заявка." }, 400);
  }

  const email = (body?.email || "").toString().trim().toLowerCase();
  const password = (body?.password || "").toString();

  if (!email || !password) {
    return json({ ok: false, message: "Липсва имейл или парола.", reason: "missing_fields" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { data: rows, error } = await admin
      .from("users")
      .select("id,email,password,password_hash,store_name,role,display_name,assigned_stores,active")
      .eq("email", email)
      .eq("active", true)
      .limit(1);

    if (error) {
      console.error("auth-login DB error:", error);
      return json({ ok: false, message: "Грешка при връзка.", reason: "server_error" }, 500);
    }

    if (!rows || rows.length === 0) {
      return json({ ok: false, message: "Непознат имейл адрес.", reason: "unknown_email" }, 401);
    }

    const user = rows[0];
    let valid = false;

    if (user.password_hash) {
      valid = bcrypt.compareSync(password, user.password_hash);
    } else if (user.password != null) {
      valid = user.password === password;
      if (valid) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        const { error: migErr } = await admin
          .from("users")
          .update({ password_hash: hash, password: null })
          .eq("id", user.id);
        if (migErr) console.error("auth-login: миграция на хеш неуспешна за user", user.id, migErr);
      }
    }

    if (!valid) {
      return json({ ok: false, message: "Грешна парола.", reason: "wrong_password" }, 401);
    }

    const { password: _p, password_hash: _ph, ...safeUser } = user;
    return json({ ok: true, user: safeUser }, 200);
  } catch (e) {
    console.error("auth-login error:", e);
    return json({ ok: false, message: "Вътрешна грешка.", reason: "server_error" }, 500);
  }
});