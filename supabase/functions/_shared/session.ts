// supabase/functions/_shared/session.ts
// Подписан пропуск на портала: "payload.подпис", и двете base64url.
//   payload = JSON {uid, role, email, iat, exp}, exp = iat + 12 часа (секунди)
//   подпис  = HMAC-SHA256 върху payload-частта (низа), ключ PORTAL_SESSION_SECRET
// Издава го auth-login. verifySession() още никой не вика — това е етап 2.
// Без външни библиотеки: само crypto.subtle.

export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type SessionClaims = { uid: string; role: string; email: string };
export type SessionPayload = SessionClaims & { iat: number; exp: number };

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSecret(): string | null {
  const s = Deno.env.get("PORTAL_SESSION_SECRET");
  return s ? s : null;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

// Сравнение в константно време спрямо съдържанието (дължината не е тайна).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Хвърля, ако секретът липсва. `now` (секунди) е само за тестовете.
export async function signSession(claims: SessionClaims, now?: number): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("PORTAL_SESSION_SECRET липсва");
  const iat = Math.floor(now ?? Date.now() / 1000);
  const payload: SessionPayload = {
    uid: claims.uid, role: claims.role, email: claims.email,
    iat, exp: iat + SESSION_TTL_SECONDS,
  };
  const p = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return p + "." + (await hmac(secret, p));
}

// Връща payload или null — никога не хвърля.
export async function verifySession(token: unknown, now?: number): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    if (!secret || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = await hmac(secret, parts[0]);
    if (!safeEqual(expected, parts[1])) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (!payload || typeof payload.exp !== "number") return null;
    const t = Math.floor(now ?? Date.now() / 1000);
    if (t >= payload.exp) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// Пропускът от тялото на заявката (`body.session`) — валиден И роля admin.
// Иначе null. Ролята идва от подписания payload, не от тялото.
export async function requireAdmin(body: unknown, now?: number): Promise<SessionPayload | null> {
  const token = body && typeof body === "object" ? (body as { session?: unknown }).session : undefined;
  const p = await verifySession(token, now);
  return p && p.role === "admin" ? p : null;
}
