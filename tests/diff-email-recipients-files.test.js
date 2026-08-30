/* Имейл до доставчик: няколко получателя + ръчно добавени файлове.

   ДВА бъга в един файл, и двата тихи:
   1. #de-to се четеше като ЕДИН низ. „a@x.bg, b@y.bg" стигаше до SMTP като
      един адрес със запетая вътре. sendEmail() (email.js) приема масив от
      самото начало — грешката беше само в извикващия.
   2. Прикачваха се само снимките на бланката. Нямаше как да се добави файл.

   ЗАЩО ТЕСТЪТ ПРОВЕРЯВА И ИЗЧИСТВАНЕТО НА СПИСЪКА: файловете живеят в
   diffEmailExtraFiles на ниво файл, не в DOM-а. Не се ли чисти, файловете от
   предишното писмо заминават със следващото — към ДРУГ доставчик, тихо.
   Това е най-скъпият възможен провал тук, затова е отделна секция.

   Пускане:  node tests/diff-email-recipients-files.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, fire, btn, ticks } = H;

const PHOTO_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/differences/1785914046488_0wo4k9.jpg';

const LINE = {
  id: 'l-1', report_id: 'rep-1',
  store_name: 'Раднево', supplier: 'ТЕСИ ООД',
  material_code: '111', material_name: 'ПЛАНКА ЪГЛОВА',
  quantity: 5, quantity_supplier_doc: 3, quantity_received: 2,
  type: 'return', status: 'pending',
  comment: 'Липсват 3 броя', resolution_comment: null, attachments: [],
  credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
  order_number: null, confirmed_date: null,
  resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
  warehouse_response: null, warehouse_comment: null, store_corrected_at: null
};

const REP = {
  id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966',
  doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
  general_comment: '', created_at: '2026-08-17T08:14:18.000Z',
  photos: [{ url: PHOTO_URL, name: 'IMG_2202.jpeg' }], reviewed: false
};

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function env() {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'email.js'],
    user: CVETI,
    data: {
      stock_differences: [LINE], differences_reports: [REP],
      stock_returns: [], transport_orders: [], users: [], contacts: [], stores: []
    }
  });
  h.w.sdData = [JSON.parse(JSON.stringify(LINE))];
  h.w.diffReports = [JSON.parse(JSON.stringify(REP))];
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';

  /* Снимката на бланката се тегли с fetch().blob(). jsdom няма да я донесе от
     мрежата, затова я подменяме с готов blob — иначе прикачването увисва. */
  const origFetch = h.w.fetch;
  h.mail = [];
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/storage/v1/object/public/') >= 0) {
      return Promise.resolve({
        ok: true, status: 200,
        blob: () => Promise.resolve(new h.w.Blob(['photo-bytes'], { type: 'image/jpeg' }))
      });
    }
    if (String(url).indexOf('/functions/v1/resend-email') >= 0) {
      let body = null;
      try { body = JSON.parse(init.body); } catch (e) { body = init.body; }
      h.mail.push(body);
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve('{"id":"mail-1"}')
      });
    }
    return origFetch(url, init);
  };
  return h;
}

/* Отваря модала и изчаква попълването на списъка с контакти. */
async function openModal(h) {
  h.w.openDiffEmailModal('rep-1');
  await ticks();
  return h.w.document;
}

const val = (doc, id, v) => { doc.getElementById(id).value = v; };

/* Слага избрани файлове на <input type="file">. jsdom не позволява истински
   избор, затова files се подменя директно — onchange се вдига ръчно.

   Липсва ли входът, ПРОВАЛЯ проверка вместо да хвърли: Object.defineProperty
   върху null убива процеса преди report() и изходът остава без нито едно ❌,
   тоест счупеният тест изглежда като минал. Същата грешка като cellOf() в
   stock-diff-print.test.js. */
function pickFiles(h, files) {
  const input = h.w.document.getElementById('de-extra-files');
  if (!ok('входът #de-extra-files съществува', !!input)) return null;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fire(h.w, input, 'change');
  return input;
}

const mkFile = (w, name, type, bytes) =>
  new w.File([new Array(bytes || 8).fill('x').join('')], name, { type: type });

const sendBtn = doc => doc.getElementById('de-send-btn');
/* Текстът на елемент по id — при липсващ връща видим заместител, не хвърля.
   Проверката тогава пада и КАЗВА кой елемент липсва. */
/* Списъкът с ръчно добавени файлове. Липсва ли глобалната изобщо, връща
   празен масив — проверките падат вместо процесът да умре. */
const extras = h => (h.w.diffEmailExtraFiles || []);
const txtOf = (doc, id) => {
  const el = doc.getElementById(id);
  return el ? (el.textContent || '') : '<няма #' + id + '>';
};

(async function run() {

  section('1. sdSplitEmails — разделяне, празни, дубликати');
  {
    const h = env();
    const f = h.w.sdSplitEmails;
    ok('функцията съществува', typeof f === 'function');
    if (typeof f === 'function') {
      ok('запетая → 2 адреса', f('a@x.bg, b@y.bg').length === 2, JSON.stringify(f('a@x.bg, b@y.bg')));
      ok('точка-запетая → 2 адреса', f('a@x.bg;b@y.bg').length === 2, JSON.stringify(f('a@x.bg;b@y.bg')));
      ok('смесено → 3 адреса', f('a@x.bg; b@y.bg, c@z.bg').length === 3);
      ok('само запетаи и интервали → 0', f(' , , ').length === 0, JSON.stringify(f(' , , ')));
      ok('празен низ → 0', f('').length === 0);
      ok('undefined → 0', f(undefined).length === 0);
      ok('дубликат без разлика в регистъра → 1',
        f('A@x.bg, a@X.BG').length === 1, JSON.stringify(f('A@x.bg, a@X.BG')));
      ok('запазва се ПЪРВОТО изписване',
        f('A@x.bg, a@X.BG')[0] === 'A@x.bg', JSON.stringify(f('A@x.bg, a@X.BG')));
      ok('интервалите се махат', f('  a@x.bg  ,b@y.bg ')[0] === 'a@x.bg');
    }
    h.close();
  }

  section('2. sdInvalidEmails — кой адрес е проблемен');
  {
    const h = env();
    const f = h.w.sdInvalidEmails;
    ok('функцията съществува', typeof f === 'function');
    if (typeof f === 'function') {
      ok('валидните минават', f(['a@x.bg', 'b.c@sub.y.com']).length === 0,
        JSON.stringify(f(['a@x.bg', 'b.c@sub.y.com'])));
      ok('без @ е невалиден', f(['axbg']).length === 1);
      ok('без точка след @ е невалиден', f(['a@xbg']).length === 1);
      ok('точка веднага след @ е невалиден', f(['a@.bg']).length === 1);
      ok('завършващ на точка е невалиден', f(['a@x.']).length === 1);
      ok('връща САМО проблемния', f(['ok@x.bg', 'лошо']).join() === 'лошо',
        JSON.stringify(f(['ok@x.bg', 'лошо'])));
    }
    h.close();
  }

  section('3. Реален клик „Изпрати" с ДВА адреса → to е масив от 2');
  {
    const h = env();
    const doc = await openModal(h);
    val(doc, 'de-to', 'a@x.bg, b@y.bg');
    val(doc, 'de-cc', '');
    if (guard('клик по „Изпрати" не хвърля', () => realClick(h.w, sendBtn(doc)))) {
      await ticks(); await ticks();
      if (ok('писмото тръгна', h.mail.length === 1, 'заявки: ' + h.mail.length)) {
        const p = h.mail[0];
        ok('to е МАСИВ', Array.isArray(p.to), typeof p.to);
        ok('to има 2 елемента', p.to.length === 2, JSON.stringify(p.to));
        ok('to не е един низ със запетая',
          p.to[0] === 'a@x.bg' && p.to[1] === 'b@y.bg', JSON.stringify(p.to));
      }
    }
    h.close();
  }

  section('4. CC — масив при два адреса, липсва при празно');
  {
    const h = env();
    const doc = await openModal(h);
    val(doc, 'de-to', 'a@x.bg');
    val(doc, 'de-cc', 'c@z.bg; d@w.bg');
    if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc)))) {
      await ticks(); await ticks();
      if (ok('писмото тръгна', h.mail.length === 1)) {
        ok('cc е масив от 2', Array.isArray(h.mail[0].cc) && h.mail[0].cc.length === 2,
          JSON.stringify(h.mail[0].cc));
      }
    }
    h.close();

    const h2 = env();
    const d2 = await openModal(h2);
    val(d2, 'de-to', 'a@x.bg');
    val(d2, 'de-cc', '   ');
    if (guard('клик без cc не хвърля', () => realClick(h2.w, sendBtn(d2)))) {
      await ticks(); await ticks();
      if (ok('писмото тръгна', h2.mail.length === 1)) {
        /* Празен масив НЕ е същото като липсващо поле — Resend би получил
           cc:[] вместо да няма cc изобщо. */
        ok('cc изобщо липсва от payload-а',
          !Object.prototype.hasOwnProperty.call(h2.mail[0], 'cc'),
          JSON.stringify(h2.mail[0].cc));
      }
    }
    h2.close();
  }

  section('5. Невалиден адрес → нула заявки, toast казва КОЙ');
  {
    const h = env();
    const doc = await openModal(h);
    val(doc, 'de-to', 'a@x.bg, счупен-адрес');
    val(doc, 'de-cc', '');
    const before = h.calls.post.length + h.mail.length;
    if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc)))) {
      await ticks(); await ticks();
      ok('НУЛА мрежови заявки', h.mail.length === 0 && (h.calls.post.length + h.mail.length) === before,
        'mail: ' + h.mail.length);
      const t = h.calls.toast.join(' | ');
      ok('има червен toast', h.calls.toast.length > 0, t);
      ok('toast съдържа САМИЯ проблемен адрес', t.indexOf('счупен-адрес') >= 0, t);
      ok('toast НЕ обвинява валидния адрес', t.indexOf('a@x.bg') < 0, t);
    }
    h.close();
  }

  section('6. Допълнителен файл → влиза в attachments заедно със снимката');
  {
    const h = env();
    const doc = await openModal(h);
    pickFiles(h, [mkFile(h.w, 'договор.pdf', 'application/pdf', 32)]);
    await ticks(); await ticks();

    ok('файлът е в списъка', extras(h).length === 1,
      JSON.stringify(extras(h).map(f => f.name)));
    const listTxt = txtOf(doc, 'de-extra-list');
    ok('името се показва в #de-extra-list', listTxt.indexOf('договор.pdf') >= 0, listTxt);
    const note = txtOf(doc, 'de-photos-note');
    ok('броячът отчита и двете', note.indexOf('1 снимка') >= 0 && note.indexOf('1 допълнителен файл') >= 0, note);

    val(doc, 'de-to', 'a@x.bg');
    if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc)))) {
      await ticks(); await ticks(); await ticks();
      if (ok('писмото тръгна', h.mail.length === 1)) {
        const names = (h.mail[0].attachments || []).map(a => a.filename);
        ok('прикачени са 2 файла', names.length === 2, JSON.stringify(names));
        ok('снимката от бланката е вътре', names.indexOf('IMG_2202.jpeg') >= 0, JSON.stringify(names));
        ok('добавеният файл е вътре', names.indexOf('договор.pdf') >= 0, JSON.stringify(names));
        ok('всеки има съдържание',
          (h.mail[0].attachments || []).every(a => typeof a.content === 'string' && a.content.length > 0));
      }
    }
    h.close();
  }

  section('7. ✕ маха файла — от списъка И от прикачените');
  {
    const h = env();
    const doc = await openModal(h);
    pickFiles(h, [mkFile(h.w, 'първи.pdf', 'application/pdf', 16),
                  mkFile(h.w, 'втори.pdf', 'application/pdf', 16)]);
    await ticks(); await ticks();
    ok('двата файла са добавени', extras(h).length === 2);

    const x = doc.querySelector('#de-extra-list button');
    if (ok('бутонът ✕ съществува', !!x)) {
      realClick(h.w, x);
      ok('остава един файл', extras(h).length === 1,
        JSON.stringify(extras(h).map(f => f.name)));
      const listTxt = txtOf(doc, 'de-extra-list');
      ok('махнатият вече не е в списъка', listTxt.indexOf('първи.pdf') < 0, listTxt);
      ok('другият е още там', listTxt.indexOf('втори.pdf') >= 0, listTxt);
      const note = txtOf(doc, 'de-photos-note');
      ok('броячът е обновен на 1', note.indexOf('1 допълнителен файл') >= 0, note);
    }

    val(doc, 'de-to', 'a@x.bg');
    if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc)))) {
      await ticks(); await ticks(); await ticks();
      if (ok('писмото тръгна', h.mail.length === 1)) {
        const names = (h.mail[0].attachments || []).map(a => a.filename);
        ok('махнатият НЕ е прикачен', names.indexOf('първи.pdf') < 0, JSON.stringify(names));
        ok('оставеният е прикачен', names.indexOf('втори.pdf') >= 0, JSON.stringify(names));
      }
    }
    h.close();
  }

  section('8. Ново отваряне на модала → списъкът е ПРАЗЕН');
  {
    /* Ако това падне, файловете от писмото до един доставчик заминават към
       следващия — тихо, без някой да ги е избирал. */
    const h = env();
    const doc = await openModal(h);
    pickFiles(h, [mkFile(h.w, 'тайна.pdf', 'application/pdf', 16)]);
    await ticks(); await ticks();
    ok('файлът е добавен към ПЪРВОТО писмо', extras(h).length === 1);

    h.w.closeDiffEmailModal();
    ok('затварянето изчиства списъка', extras(h).length === 0,
      JSON.stringify(extras(h).map(f => f.name)));

    const doc2 = await openModal(h);
    ok('след ново отваряне списъкът е празен', extras(h).length === 0,
      JSON.stringify(extras(h).map(f => f.name)));
    const listTxt = txtOf(doc2, 'de-extra-list');
    ok('#de-extra-list е празен', listTxt.trim() === '', listTxt);
    ok('броячът не помни допълнителни файлове',
      txtOf(doc2, 'de-photos-note').indexOf('допълнител') < 0);

    val(doc2, 'de-to', 'drug@dostavchik.bg');
    if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc2)))) {
      await ticks(); await ticks(); await ticks();
      if (ok('второто писмо тръгна', h.mail.length === 1)) {
        const names = (h.mail[0].attachments || []).map(a => a.filename);
        ok('файлът от първото писмо НЕ е тук', names.indexOf('тайна.pdf') < 0, JSON.stringify(names));
        ok('само снимката от бланката е прикачена', names.length === 1, JSON.stringify(names));
      }
    }
    h.close();
  }

  section('9. Надхвърлен лимит → нула заявки + toast с реалния размер');
  {
    const h = env();
    const doc = await openModal(h);
    /* Вместо истински 15 MB файл — подменяме съдържанието след прочитането.
       Лимитът се смята по дължината на base64 низа, не по File обекта. */
    pickFiles(h, [mkFile(h.w, 'огромен.bin', 'application/octet-stream', 16)]);
    await ticks(); await ticks();
    if (ok('файлът е прочетен', extras(h).length === 1)) {
      extras(h)[0].content = 'A'.repeat(21 * 1024 * 1024);
      val(doc, 'de-to', 'a@x.bg');
      if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc)))) {
        await ticks(); await ticks(); await ticks();
        ok('НУЛА мрежови заявки към пощата', h.mail.length === 0, 'mail: ' + h.mail.length);
        const t = h.calls.toast.join(' | ');
        ok('toast споменава лимита', t.indexOf('15.0 MB') >= 0, t);
        ok('toast казва размера след кодиране', t.indexOf('след кодиране') >= 0, t);
        ok('toast казва РЕАЛНИЯ размер', /2\d\.\d MB/.test(t), t);
        /* Бутонът трябва да се отключи — иначе Цвети не може да махне файла
           и да опита пак. */
        ok('бутонът „Изпрати" е отключен', sendBtn(doc).disabled === false);
      }
    }
    h.close();
  }

  section('9б. Лимитът се мери по КОДИРАНИЯ размер, не по суровите байтове');
  {
    /* Тази секция е причината секция 9 да не стига. Там 21 MB base64 пада и
       по двете правила — суровият размер също е 15.75 MB — тоест тестът
       минаваше и срещу сгрешената проверка.

       Тук разликата е решаваща: base64 низ с дължина 16 MiB носи 12 MiB
       сурови данни. По СГРЕШЕНОТО правило (length × 3/4 = сурови) комплектът
       е 12 MiB < 15 MiB и ЗАМИНАВА; по правилното (дължината на низа, която
       реално минава по мрежата) е 16 MiB > 15 MiB и се спира. */
    const h = env();
    const doc = await openModal(h);
    pickFiles(h, [mkFile(h.w, 'подвеждащ.bin', 'application/octet-stream', 16)]);
    await ticks(); await ticks();
    if (ok('файлът е прочетен', extras(h).length === 1)) {
      extras(h)[0].content = 'A'.repeat(16 * 1024 * 1024);
      val(doc, 'de-to', 'a@x.bg');
      if (guard('клик не хвърля', () => realClick(h.w, sendBtn(doc)))) {
        await ticks(); await ticks(); await ticks();
        ok('16 MiB base64 (12 MiB сурови) НЕ заминава', h.mail.length === 0,
          'mail: ' + h.mail.length);
        const t = h.calls.toast.join(' | ');
        ok('toast казва 16.0 MB, не 12.0 MB', t.indexOf('16.0 MB') >= 0, t);
        ok('toast НЕ казва суровия размер', t.indexOf('12.0 MB') < 0, t);
      }
    }
    h.close();
  }

  section('9в. Точно на границата — минава; един знак над нея — не');
  {
    /* Без снимки по бланката, за да е сборът точно дължината на файла и
       границата да се провери на знак, а не приблизително. */
    const LIMIT = 15 * 1024 * 1024;

    const hOk = env();
    hOk.w.diffReports[0].photos = [];
    const dOk = await openModal(hOk);
    pickFiles(hOk, [mkFile(hOk.w, 'точно.bin', 'application/octet-stream', 16)]);
    await ticks(); await ticks();
    if (ok('файлът е прочетен', extras(hOk).length === 1)) {
      extras(hOk)[0].content = 'A'.repeat(LIMIT);
      val(dOk, 'de-to', 'a@x.bg');
      if (guard('клик не хвърля', () => realClick(hOk.w, sendBtn(dOk)))) {
        await ticks(); await ticks(); await ticks();
        ok('ТОЧНО на лимита заминава', hOk.mail.length === 1, 'mail: ' + hOk.mail.length);
        if (hOk.mail.length === 1) {
          ok('payload-ът носи точно толкова',
            hOk.mail[0].attachments.reduce((s, a) => s + a.content.length, 0) === LIMIT);
        }
      }
    }
    hOk.close();

    const hNo = env();
    hNo.w.diffReports[0].photos = [];
    const dNo = await openModal(hNo);
    pickFiles(hNo, [mkFile(hNo.w, 'един-повече.bin', 'application/octet-stream', 16)]);
    await ticks(); await ticks();
    if (ok('файлът е прочетен', extras(hNo).length === 1)) {
      extras(hNo)[0].content = 'A'.repeat(LIMIT + 1);
      val(dNo, 'de-to', 'a@x.bg');
      if (guard('клик не хвърля', () => realClick(hNo.w, sendBtn(dNo)))) {
        await ticks(); await ticks(); await ticks();
        ok('един знак над лимита НЕ заминава', hNo.mail.length === 0, 'mail: ' + hNo.mail.length);
      }
    }
    hNo.close();
  }

  section('10. Подсказката под полето „До"');
  {
    const h = env();
    const doc = await openModal(h);
    const hint = doc.getElementById('de-to-hint');
    if (ok('редът #de-to-hint съществува', !!hint)) {
      ok('казва точно това',
        (hint.textContent || '').indexOf('Няколко адреса се разделят със запетая') >= 0,
        hint.textContent);
    }
    const fileIn = doc.getElementById('de-extra-files');
    if (ok('входът за файлове съществува', !!fileIn)) {
      ok('входът е multiple', fileIn.hasAttribute('multiple'));
    }
    h.close();
  }

  report();
})();
