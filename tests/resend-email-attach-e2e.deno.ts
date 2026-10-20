// E2E за resend-email с ИСТИНСКИЯ denomailer срещу фалшив SMTP в същия
// процес. Пуска се от tests/resend-email-attach.test.js (само ако има deno).
//
//   deno run -A tests/resend-email-attach-e2e.deno.ts <стар.ts> <нов.ts> <out.json> [файл=име ...]
//
// Deno.connectTls се подменя с обикновен TCP към фалшивия сървър, тоест
// функцията върви по пътя си с tls:true и AUTH LOGIN, без сертификати.
// Пише в out.json:
//   noAttach  - писмото без прикачени от стария и от новия код (Date маскиран);
//   files     - за всеки подаден файл: декодираните байтове съвпадат ли,
//               декодираното име, най-дългият ред, редове с водеща точка;
//   badB64    - статус и съобщение при нечист base64.

const [oldPath, newPath, outPath, ...pairs] = Deno.args;

const mails: string[] = [];
const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
const port = (listener.addr as Deno.NetAddr).port;
(async () => {
  for await (const conn of listener) serveConn(conn);
})();

async function serveConn(conn: Deno.Conn) {
  const enc = new TextEncoder();
  const say = (s: string) => conn.write(enc.encode(s + "\r\n"));
  await say("220 fake ESMTP");
  let buf = "";
  let data = false;
  let authStep = 0;
  const dec = new TextDecoder("latin1");
  const chunk = new Uint8Array(65536);
  while (true) {
    const n = await conn.read(chunk).catch(() => null);
    if (n === null) break;
    buf += dec.decode(chunk.subarray(0, n));
    while (true) {
      if (data) {
        const end = buf.indexOf("\r\n.\r\n");
        if (end < 0) break;
        mails.push(buf.slice(0, end + 2));
        buf = buf.slice(end + 5);
        data = false;
        await say("250 OK");
        continue;
      }
      const i = buf.indexOf("\r\n");
      if (i < 0) break;
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const cmd = line.toUpperCase();
      if (authStep === 1) { authStep = 2; await say("334 UGFzc3dvcmQ6"); }
      else if (authStep === 2) { authStep = 0; await say("235 ok"); }
      else if (cmd.startsWith("EHLO")) await say("250-fake\r\n250 AUTH LOGIN");
      else if (cmd.startsWith("AUTH")) { authStep = 1; await say("334 VXNlcm5hbWU6"); }
      else if (cmd === "DATA") { data = true; await say("354 go"); }
      else if (cmd === "QUIT") { await say("221 bye"); conn.close(); return; }
      else await say("250 OK");
    }
  }
  try { conn.close(); } catch (_e) { /* */ }
}

// deno-lint-ignore no-explicit-any
const D = Deno as any;
D.connectTls = () => Deno.connect({ hostname: "127.0.0.1", port });
const handlers: ((r: Request) => Promise<Response>)[] = [];
D.serve = (h: (r: Request) => Promise<Response>) => { handlers.push(h); return { finished: Promise.resolve() }; };
Deno.env.set("SMTP_HOST", "mail.example.test");
Deno.env.set("SMTP_PORT", "465");
Deno.env.set("SMTP_USER", "portal@temax.bg");
Deno.env.set("SMTP_PASSWORD", "x");
Deno.env.set("SMTP_FROM_NAME", "TeMAX");

const toUrl = (p: string) => "file:///" + p.replace(/\\/g, "/").replace(/^\/+/, "");
await import(toUrl(oldPath));
await import(toUrl(newPath));
const [oldH, newH] = handlers;

async function send(h: (r: Request) => Promise<Response>, body: unknown) {
  const before = mails.length;
  const res = await h(new Request("http://x/", { method: "POST", body: JSON.stringify(body) }));
  const j = await res.json();
  return { status: res.status, json: j, mail: mails.length > before ? mails[mails.length - 1] : null };
}
const mask = (m: string | null) => (m || "").replace(/^Date: .*$/m, "Date: X");

const out: Record<string, unknown> = {};

// 1. Без прикачени - байт в байт като преди (и с from_name, и без).
const base = { to: ["d@x.bg"], subject: "Разлики Раднево 180508904", html: "<p>Здравейте,</p><p>.точка</p>" };
const o1 = await send(oldH, base), n1 = await send(newH, base);
const o2 = await send(oldH, { ...base, from_name: "Цветелина Тенева · ТеМАХ", reply_to: "c@x.bg", cc: ["k@x.bg"] });
const n2 = await send(newH, { ...base, from_name: "Цветелина Тенева · ТеМАХ", reply_to: "c@x.bg", cc: ["k@x.bg"] });
out.noAttach = {
  plainSame: !!o1.mail && mask(o1.mail) === mask(n1.mail), plainLen: (n1.mail || "").length,
  fromNameSame: !!o2.mail && mask(o2.mail) === mask(n2.mail),
  statuses: [o1.status, n1.status, o2.status, n2.status],
};

// 2. Истински файлове през новия код.
function b64(u: Uint8Array) {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function decodeName(h: string): string {
  const un = h.replace(/\r\n[ \t]/g, " ");
  const parts: [number, string][] = [];
  const re = /filename\*(\d+)?\*?=([^;\r\n]+)/g;
  let m;
  while ((m = re.exec(un))) parts.push([m[1] ? +m[1] : 0, m[2].trim()]);
  if (parts.length) {
    const s = parts.sort((a, b) => a[0] - b[0]).map((p) => p[1]).join("").replace(/^UTF-8''/i, "");
    return decodeURIComponent(s);
  }
  const q = /filename="((?:[^"\\]|\\.)*)"/.exec(un);
  return q ? q[1].replace(/\\(.)/g, "$1") : "";
}
const files = [];
const atts = [];
const originals: Uint8Array[] = [];
for (const p of pairs) {
  const k = p.indexOf("=");
  const bytes = await Deno.readFile(p.slice(0, k));
  originals.push(bytes);
  atts.push({ filename: p.slice(k + 1), content: b64(bytes) });
}
if (atts.length) {
  const n3 = await send(newH, { ...base, attachments: atts });
  const mail = n3.mail || "";
  await Deno.writeTextFile(outPath + ".eml", mail);
  const bm = /boundary=(attachment\d+)/.exec(mail);
  const sections = bm ? mail.split("--" + bm[1]).slice(2, 2 + atts.length) : [];
  for (let i = 0; i < atts.length; i++) {
    const sec = sections[i] || "";
    const sep = sec.indexOf("\r\n\r\n");
    const head = sec.slice(0, sep);
    const body = sec.slice(sep + 4).replace(/\r\n$/, "");
    const bin = atob(body.replace(/\r\n/g, ""));
    const got = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) got[j] = bin.charCodeAt(j);
    const want = originals[i];
    const same = got.length === want.length && got.every((v, j) => v === want[j]);
    const lines = sec.split("\r\n");
    files.push({
      name: atts[i].filename, decodedName: decodeName(head), bytesSame: same, len: want.length,
      maxBodyLine: Math.max(0, ...body.split("\r\n").map((l) => l.length)),
      maxHeadLine: Math.max(0, ...head.split("\r\n").map((l) => l.length)),
      dotLines: lines.filter((l) => l.startsWith(".")).length,
    });
  }
  out.attachStatus = n3.status;
}
out.files = files;

// 3. Нечист base64 -> 400 с ясно съобщение, нищо не се праща.
const before = mails.length;
const bad = await send(newH, { ...base, attachments: [{ filename: "снимка.jpg", content: "data:image/jpeg;base64,AAAA" }] });
out.badB64 = { status: bad.status, message: bad.json?.data?.message, sent: mails.length - before };

await Deno.writeTextFile(outPath, JSON.stringify(out, null, 1));
listener.close();
Deno.exit(0);
