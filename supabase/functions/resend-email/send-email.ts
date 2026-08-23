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

/* Транслитерира кирилица към латиница за темата на писмото.
   НЕ СЕ ВИКА от 23.08.2026 - темата вече минава през encodeSubject() по-долу
   и излиза на кирилица. Функцията остава нарочно: ако новият подход се спъне
   в някой пощенски сървър, връщането е смяна на един ред (subject: ...) и
   нищо друго. Не я трий. */
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

/* Кодира темата по RFC 2047 в base64 encoded words: =?UTF-8?B?<base64>?=
   Заменя transliterate(), тоест темите вече излизат на кирилица.

   ЗАЩО СОБСТВЕНА ФУНКЦИЯ, А НЕ ВГРАДЕНАТА
   denomailer прекарва всяка тема през quotedPrintableEncodeInline()
   (config/mail/mod.ts:94) - за нея НЯМА поле като mimeContent, което да я
   препредава дословно. Резултатът от вградената е негоден по ТРИ независими
   причини наведнъж (проверено върху "ТеМАХ — Оборот" и "ТеМАХ — Седмичен
   репорт"):
     1. литерален интервал ВЪТРЕ в encoded word - quotedPrintableEncode
        пропуска код 32 непокътнат, а по RFC 2047 интервалът ПРЕКРАТЯВА
        encoded word-а. Това само по себе си чупи дори кратка тема;
     2. меко пренасяне "=\r\n" вътре в encoded word - също забранено;
     3. дължина 92 и 141 символа при допустими 75.
   Тоест записаното по-рано "неотстраним бъг" е било вярно като наблюдение,
   но не и като диагноза - вградената функция просто ползва енкодера за ТЯЛО
   на място, където правилата са други.

   ЗАЩО РАБОТИ ЗАОБИКАЛЯНЕТО
   quotedPrintableEncodeInline() връща низа НЕПОКЪТНАТ, ако той е чист ASCII
   и не започва с "=?" (config/mail/encoding.ts:77). Готовият encoded word е
   чист ASCII, но започва точно с "=?" - затова слагаме един интервал отпред.
   Интервалът е folding whitespace и се отхвърля при разбора на заглавието.

   РАЗМЕРИ
   RFC 2047 дава таван 75 символа на encoded word, което само по себе си би
   позволило 45 байта на дума. Ползваме 39, защото стягащото ограничение е
   друго - дължината на ПЪРВИЯ ред. Отгоре му седят 11 символа, не 10:
   writeCmd("Subject: ", subject) слепва аргументите с интервал
   (client/basic/connection.ts:114), тоест "Subject: " (9) + слепващият
   интервал (1) + нашият водещ интервал (1). За ред <= 78 остават 67 за
   думата; 67 - 12 за обвивката = 55 за base64; най-голямото кратно на 4 под
   55 е 52, тоест 39 байта. Резултат: дума от 64, първи ред 75.
   (78 е препоръка на RFC 5322, твърдият таван е 998 - тоест дори да се
   сбъркат няколко символа, писмото не се чупи.)
   Режем на границите на КОДОВИ ТОЧКИ, не на байтове - точно това изяждаше
   символи в тялото. Думите се съединяват с CRLF + интервал (сгъване на
   заглавие по RFC 5322); при разбора whitespace между съседни encoded words
   се изхвърля, тоест темата се сглобява обратно дословно. */
function encodeSubject(subject: string): string {
  /* Чист ASCII минава без пипане - така темите на латиница (напр. тези на
     send-oborot-report) остават точно каквито са подадени. Изключение е тема,
     започваща с "=?", която иначе би била увита втори път. */
  if (!/[^\u0000-\u007f]/.test(subject) && subject.indexOf('=?') !== 0) {
    return subject;
  }
  var enc = new TextEncoder();
  var chars = Array.from(subject); /* пази сурогатните двойки цели */
  var words: string[] = [];
  var buf: number[] = [];
  var flush = function () {
    if (!buf.length) { return; }
    var bin = '';
    for (var k = 0; k < buf.length; k++) { bin += String.fromCharCode(buf[k]); }
    words.push('=?UTF-8?B?' + btoa(bin) + '?=');
    buf = [];
  };
  for (var i = 0; i < chars.length; i++) {
    var b = enc.encode(chars[i]);
    if (buf.length + b.length > 39) { flush(); }
    for (var j = 0; j < b.length; j++) { buf.push(b[j]); }
  }
  flush();
  return ' ' + words.join('\r\n ');
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
          subject: encodeSubject(subject),
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
