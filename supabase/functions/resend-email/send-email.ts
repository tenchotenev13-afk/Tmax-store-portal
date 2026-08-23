// supabase/functions/resend-email/index.ts (реално име на файла в Supabase: send-email.ts)
//
// ВАЖНО: тази функция обработва И имейли, И push нотификации (OneSignal) чрез
// полето "type" в тялото на заявката ('email' по подразбиране, или 'push').
// PUSH ЧАСТТА Е НАПЪЛНО НЕПОКЪТНАТА — само имейл частта е пренаписана да
// изпраща през SMTP (mail.temax.bg), вместо през Resend API.
//
// FIX (23.08.2026): тялото на писмото вече НЕ минава през енкодера на
// denomailer. Кодира се тук, на ръка, в base64 и се подава през `mimeContent`,
// което библиотеката препредава дословно (config/mail/content.ts:18).
//
// Защо се наложи: поправката от 17.08.2026 беше без ефект. Опцията
// `content_encoding: 'base64'` НЕ СЪЩЕСТВУВА в denomailer@1.6.0 - нито един
// файл в библиотеката не я споменава, а resolveClientOptions()
// (config/client.ts:117) чете само познатите ключове и я изхвърля мълчаливо.
// `html` и `content` продължаваха да минават през quotedPrintableEncode(), с
// transferEncoding зашит на "quoted-printable" в config/mail/content.ts:31,39.
//
// Двата реални дефекта, репродуцирани върху истинския HTML на вечерния оборот
// (8588 символа / 9403 байта):
//
//  1. Липсва SMTP dot-stuffing (RFC 5321 §4.5.2). Енкодерът пренася на 74
//     символа; падне ли прекъсването точно преди точка, редът започва с '.'
//     и приемащият сървър я маха. Наблюдавано: "Оборот 19.08.2026 (сряда)"
//     -> "Оборот 1908.2026 (сряда)", отстъп 623 символа / 642 байта.
//  2. Цикълът за пренасяне отрязва 1-2 символа, когато границата падне вътре
//     в "=XX" escape, и ги връща през `offset` в началото на следващия ред -
//     но последното парче, `encodedData.slice(lines * 74)`, НЕ прилага offset
//     и тези 1-2 символа изчезват безвъзвратно. Наблюдавано: "ТеМАХ Портал"
//     -> "ТеМАХ Порта?b" в долния колонтитул, отстъп ~8555.
//
// 1.6.0 е последната публикувана версия; в main клона на библиотеката дефект 1
// е поправен, дефект 2 стои. Затова заобикаляме енкодера изцяло. base64 е
// имунизиран и срещу двете: азбуката му не съдържа точка, тоест никой ред не
// може да започне с '.', а пренасянето тук е на кратно на 4, така че никога не
// се цепи base64 група. Засяга ВСИЧКИ имейли от портала (не само репортите) -
// доставчик-имейли от Разлики също минават оттук.
//
// Изисква следните Supabase Edge Function Secrets (Project Settings → Edge Functions):
//   SMTP_HOST      - по подразбиране mail.temax.bg, ако не е зададен
//   SMTP_PORT      - по подразбиране 465
//   SMTP_USER      - пълният имейл адрес, от който се изпраща (напр. c.teneva@temax.bg)
//   SMTP_PASSWORD  - РЕАЛНАТА парола на този имейл акаунт (НЕ паролата за портала!)
//   SMTP_FROM_NAME - показвано име (по избор), напр. "ТеМАХ - Разлики"

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const OS_KEY = Deno.env.get("ONESIGNAL_REST_KEY") || "";
const OS_APP = 'a326639e-4ace-46f5-baa7-3f6259431d18';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

/* Прост HTML->текст конвертор за plain-text версията на писмото. Библиотеката
   изрично препоръчва да не се разчита на нейната вградена 'auto' генерация
   ("в повечето случаи трябва сам да го зададеш") - вероятен източник на
   поврежда, довела до изчезване на From заглавието при тестовете. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Транслитерира кирилица към латиница за темата на писмото. denomailer има
   неотстраним бъг в собственото си RFC 2047 кодиране на кирилица в Subject -
   изпробвани са 3 различни подхода (собствено base64 кодиране, транслитерация,
   и директно ползване на вградената quotedPrintableEncode() с ръчно "сгъване"),
   всички без успех освен транслитерацията. Тялото на писмото е защитено от
   аналогичен клас бъгове по друг начин - base64Part() по-долу заобикаля
   енкодера на denomailer изцяло. За темата това не става: denomailer винаги
   я прекарва през quotedPrintableEncodeInline() и няма поле, което да се
   препредава дословно. Смяната на темите е отделно решение. */
function transliterate(str: string): string {
  var map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
    м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",
    ш:"sh",щ:"sht",ъ:"a",ь:"", ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ж:"Zh",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",
    М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"H",Ц:"Ts",Ч:"Ch",
    Ш:"Sh",Щ:"Sht",Ъ:"A",Ь:"", Ю:"Yu",Я:"Ya"
  };
  return str.split('').map(function(ch){ return map[ch] !== undefined ? map[ch] : ch; }).join('');
}

/* Кодира една част от тялото в base64 и я връща готова за `mimeContent`.
   Пренасяне на 76 символа: кратно на 4, тоест никога не се разцепва base64
   група, и в границата, която RFC 2045 допуска на ред. */
function base64Part(mimeType: string, text: string) {
  var bytes = new TextEncoder().encode(text);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) { bin += String.fromCharCode(bytes[i]); }
  var b64 = btoa(bin);
  var lines: string[] = [];
  for (var j = 0; j < b64.length; j += 76) { lines.push(b64.slice(j, j + 76)); }
  return { mimeType: mimeType, content: lines.join('\r\n'), transferEncoding: 'base64' };
}

function guessContentType(filename: string): string {
  var ext = (filename.split(".").pop() || "").toLowerCase();
  var map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", pdf: "application/pdf", txt: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS });
  }
  try {
    const body = await req.json();
    const type = body.type || 'email';

    if (type === 'push') {
      // ── PUSH НОТИФИКАЦИИ (OneSignal) — НЕПРОМЕНЕНО ──
      const payload: Record<string, unknown> = {
        app_id: OS_APP,
        headings: { bg: body.title, en: body.title },
        contents: { bg: body.message, en: body.message },
        url: body.url || 'https://tenchotenev13-afk.github.io/Tmax-store-portal/',
      };
      if (body.filters) { payload.filters = body.filters; }
      else { payload.included_segments = ['All']; }

      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${OS_KEY}`
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return Response.json({ ok: res.ok, data }, { headers: CORS, status: res.ok ? 200 : 400 });

    } else {
      // ── ИЗПРАЩАНЕ НА ИМЕЙЛ — вече през SMTP (mail.temax.bg), не Resend ──
      const to = body.to;
      const subject = (body.subject || '').toString();
      const html = (body.html || '').toString();
      const cc = body.cc;
      const replyTo = body.reply_to;
      const attachments = Array.isArray(body.attachments) ? body.attachments : [];

      if (!to || (Array.isArray(to) && !to.length) || !subject || !html) {
        return Response.json({ ok: false, data: { message: 'Липсват задължителни полета (to/subject/html).' } }, { headers: CORS, status: 400 });
      }

      const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'mail.temax.bg';
      const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') || '465');
      const SMTP_USER = Deno.env.get('SMTP_USER');
      const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD');
      const SMTP_FROM_NAME = Deno.env.get('SMTP_FROM_NAME') || 'TeMAX';

      if (!SMTP_USER || !SMTP_PASSWORD) {
        return Response.json({ ok: false, data: { message: 'SMTP не е конфигуриран. Липсват SMTP_USER/SMTP_PASSWORD в Edge Function Secrets.' } }, { headers: CORS, status: 500 });
      }

      const client = new SMTPClient({
        /* Тук нарочно НЯМА content_encoding - denomailer не познава такава
           опция и я изхвърля. Кодирането на тялото е в base64Part(). */
        connection: {
          hostname: SMTP_HOST,
          port: SMTP_PORT,
          tls: true,
          auth: { username: SMTP_USER, password: SMTP_PASSWORD },
        },
      });

      try {
        await client.send({
          from: SMTP_FROM_NAME + ' <' + SMTP_USER + '>',
          to: Array.isArray(to) ? to : [to],
          cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
          replyTo: replyTo || undefined,
          subject: transliterate(subject),
          /* НЕ подаваме `content`/`html` - те минават през счупения
             quoted-printable енкодер. `mimeContent` се препредава дословно.
             Редът е важен: при multipart/alternative пощата показва
             ПОСЛЕДНАТА част, която може да рендира, тоест HTML-ът е втори. */
          mimeContent: [
            base64Part('text/plain; charset="utf-8"', htmlToPlainText(html)),
            base64Part('text/html; charset="utf-8"', html),
          ],
          attachments: attachments.map(function (a: { filename: string; content: string }) {
            return {
              filename: a.filename || 'attachment',
              content: a.content,
              encoding: 'base64',
              contentType: guessContentType(a.filename || ''),
            };
          }),
        });
        await client.close();
        return Response.json({ ok: true, data: { message: 'Изпратено успешно.' } }, { headers: CORS, status: 200 });
      } catch (sendErr) {
        console.error('SMTP send error:', sendErr);
        try { await client.close(); } catch (_e2) { /* без значение */ }
        const em = sendErr as Error;
        return Response.json({ ok: false, data: { message: 'Грешка при изпращане: ' + (em?.message || String(em)) } }, { headers: CORS, status: 500 });
      }
    }
  } catch (e) {
    const err = e as Error;
    return Response.json({ ok: false, error: err.message }, { headers: CORS, status: 500 });
  }
});
