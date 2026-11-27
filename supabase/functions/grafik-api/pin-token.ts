// supabase/functions/grafik-api/pin-token.ts
// „Ключ за графика“ след верен ПИН (етап Б, решение на Тенчо 27.11.2026).
//   payload = JSON {t:"grafik_pin", uid, si, exp}; si = iat на пропуска от auth-login —
//   ново влизане в портала значи нов ПИН. exp = 15 мин; всяка заявка с валиден ключ връща нов
//   (плъзгащ се срок), тоест 15 мин без заявка → ключът изтича на сървъра.
//   подпис = HMAC-SHA256 с ПРОИЗВЕДЕН ключ (PORTAL_SESSION_SECRET + "|grafik-pin-v1"):
//   ключът за графика не минава за пропуск на портала (verifySession) и обратно.
// Без външни библиотеки: само crypto.subtle (както _shared/session.ts).

export const PIN_TTL_SECONDS = 15 * 60;
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
async function sign(data: string): Promise<string | null> {
  const secret = Deno.env.get("PORTAL_SESSION_SECRET");
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret + "|grafik-pin-v1"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signPinToken(uid: string, si: number, nowS: number): Promise<{ token: string; exp: number }> {
  const exp = nowS + PIN_TTL_SECONDS;
  const p = b64urlEncode(enc.encode(JSON.stringify({ t: "grafik_pin", uid, si, exp })));
  const s = await sign(p);
  if (!s) throw new Error("PORTAL_SESSION_SECRET липсва");
  return { token: p + "." + s, exp };
}

// true само ако подписът е верен, ключът е за същия човек И същото влизане, и не е изтекъл.
export async function verifyPinToken(tok: unknown, uid: string, si: number, nowS: number): Promise<boolean> {
  try {
    if (typeof tok !== "string") return false;
    const parts = tok.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const s = await sign(parts[0]);
    if (!s || !safeEqual(s, parts[1])) return false;
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    return !!p && p.t === "grafik_pin" && p.uid === uid && p.si === si && typeof p.exp === "number" && nowS < p.exp;
  } catch {
    return false;
  }
}
