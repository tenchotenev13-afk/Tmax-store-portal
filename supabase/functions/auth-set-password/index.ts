// supabase/functions/auth-set-password/index.ts
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

  const userId = (body?.user_id || "").toString();
  const oldPassword = body?.old_password ? String(body.old_password) : null;
  const newPassword = (body?.new_password || "").toString();

  if (!userId || !newPassword) {
    return json({ ok: false, message: "Липсват задължителни данни." }, 400);
  }
  if (newPassword.length < 4) {
    return json({ ok: false, message: "Паролата трябва да е поне 4 символа." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (oldPassword) {
      const { data: rows, error } = await admin
        .from("users")
        .select("password,password_hash")
        .eq("id", userId)
        .limit(1);

      if (error || !rows || !rows.length) {
        return json({ ok: false, message: "Потребителят не е намерен." }, 404);
      }

      const u = rows[0];
      let validOld = false;
      if (u.password_hash) validOld = bcrypt.compareSync(oldPassword, u.password_hash);
      else if (u.password != null) validOld = u.password === oldPassword;

      if (!validOld) {
        return json({ ok: false, message: "Старата парола е грешна." }, 401);
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);
    const { error: upErr } = await admin
      .from("users")
      .update({ password_hash: hash, password: null })
      .eq("id", userId);

    if (upErr) {
      console.error("auth-set-password update error:", upErr);
      return json({ ok: false, message: "Грешка при запис." }, 500);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("auth-set-password error:", e);
    return json({ ok: false, message: "Вътрешна грешка." }, 500);
  }
});