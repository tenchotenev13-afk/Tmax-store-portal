/* Отделно изискване за ДОКУМЕНТ при отмятане на задача.

   Заварено: четири вида задача и нито един не искаше документ. При „Ревизии
   953" магазинът пишеше коментар „качено в САП", а файлът не влизаше в
   портала. Това вече се случваше, но по грешния път: полето за снимка има
   accept=".jpg,...", а accept е подсказка към диалога за избор, НЕ проверка.
   Към 26.08.2026 в колоната photos лежат три записа с .xlsx — и излизаха
   като счупени картинки в дневния имейл и в таб „Днес", защото report.js и
   today.js рендираха всеки запис от photos като <img src>.

   Промяната е тристранна:
     · нова колона files (отделно от photos — показва се различно);
     · два нови вида задача, file и file_comment, с трети флаг needsFile;
     · истинска проверка на разширението в JavaScript, преди качването,
       И за двете полета.
   Плюс защита за заварените записи: неснимков файл в photos се рендира
   като връзка, не като <img>.

   Пускане: node tests/task-completion-files.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, fire } = H;

/* ── Котва: днешният ден, за да е чекбоксът отключен ─────────────────────── */
const TODAY = (function () {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();

const STORE = 'Троян';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORE };

function task(id, type) {
  return {
    id: id, title: 'Задача ' + id, description: '', department: 'trade',
    task_type: type, due_dates: [TODAY], target_stores: null, linked_module: null
  };
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js'],
    user: MANAGER,
    data: { users: [{ store_name: STORE }], stores: [{ name: STORE }] }
  });
  const w = h.w;
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = {
    id: 'b-1', week_number: w.weekNum(new Date()), year: new Date().getFullYear(),
    status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulTasks = opts.tasks || [task('t-file', 'file')];
  w.recurringTasks = [];
  w.bulComps = opts.comps || [];
  w.recurringComps = [];
  w.allStoresCache = [STORE];

  /* Качването отива в Storage с гол fetch. Стъбваме само него — така
     проверката на разширението (която е ПРЕДИ мрежата) си остава истинска. */
  h.uploads = [];
  const orig = w.fetch;
  w.fetch = function (url, init) {
    if (String(url).indexOf('/storage/v1/object/') >= 0) {
      h.uploads.push(String(url));
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
    }
    return orig(url, init);
  };
  return h;
}

/* Симулира избор на файл: FileReader чете ArrayBuffer, затова стига обект с
   name/type и минимално тяло. */
function pick(h, inputEl, filename) {
  const F = h.w.File
    ? new h.w.File(['x'], filename, { type: 'application/octet-stream' })
    : { name: filename, type: 'application/octet-stream' };
  Object.defineProperty(inputEl, 'files', { value: [F], configurable: true });
  return inputEl;
}
function modal(doc) { return doc.getElementById('tc-modal-ov'); }
/* САМО <input type=file> — div/span с текст „Документ" би излъгал. */
function fileInput(doc, kind) {
  const all = Array.prototype.slice.call(
    (modal(doc) || doc).querySelectorAll('input[type=file]'));
  return all.filter(i => {
    const acc = i.getAttribute('accept') || '';
    return kind === 'photo' ? acc.indexOf('.jpg') >= 0 : acc.indexOf('.pdf') >= 0;
  })[0] || null;
}

(async function run() {

  /* ═══ 1. Видовете задача ═════════════════════════════════════════════ */
  section('1. TASK_TYPES: шест вида, трети флаг needsFile');
  {
    const { w } = env();
    const T = w.TASK_TYPES;
    ok('видовете са шест', Object.keys(T).length === 6, Object.keys(T).join(','));
    ok('старите четири ключа са непроменени',
      ['info', 'photo', 'comment', 'photo_comment'].every(k => !!T[k]));
    ok('нови са file и file_comment', !!T.file && !!T.file_comment);

    ok('file иска документ, не снимка',
      T.file.needsFile === true && T.file.needsPhoto === false && T.file.needsComment === false);
    ok('file_comment иска документ И коментар',
      T.file_comment.needsFile === true && T.file_comment.needsComment === true &&
      T.file_comment.needsPhoto === false);
    ok('старите четири НЕ искат документ',
      ['info', 'photo', 'comment', 'photo_comment'].every(k => T[k].needsFile === false));
    ok('няма вид, който иска и снимка, и документ',
      Object.keys(T).every(k => !(T[k].needsPhoto && T[k].needsFile)));

    ok('приоритетът на file е като на photo', T.file.priority === T.photo.priority, T.file.priority);
    ok('приоритетът на file_comment е като на photo_comment',
      T.file_comment.priority === T.photo_comment.priority, T.file_comment.priority);

    /* Падащото меню обхожда ключовете — не бива да има втори преписан списък. */
    const opts = w.taskTypeOptsHtml('info');
    ok('падащото меню поема новите видове само',
      opts.indexOf('value="file"') >= 0 && opts.indexOf('value="file_comment"') >= 0, opts);
    ok('и всичките шест са вътре',
      Object.keys(T).every(k => opts.indexOf('value="' + k + '"') >= 0));
    ok('баджът за file носи 📄',
      w.taskTypeBadgeHtml('file', 't1', 'regular', false, TODAY).indexOf('📄') >= 0);
  }

  /* ═══ 2. Модалът показва ТОЧНО каквото е нужно ═══════════════════════ */
  section('2. Полетата в модала следват вида на задачата');
  {
    const h = env({ tasks: [task('t-file', 'file')] });
    const { w, doc } = h;
    if (guard('модалът се отваря', () => w.openTaskCompletionModal('t-file', 'regular', TODAY))) {
      ok('има <input type=file> за документ', !!fileInput(doc, 'file'));
      ok('НЯМА поле за снимка', !fileInput(doc, 'photo'));
      ok('НЯМА поле за коментар', !doc.getElementById('tc-comment'));
      const inp = fileInput(doc, 'file');
      ok('accept изброява документните разширения',
        (inp.getAttribute('accept') || '').indexOf('.xlsx') >= 0, inp.getAttribute('accept'));
    }
  }
  {
    const h = env({ tasks: [task('t-photo', 'photo')] });
    const { w, doc } = h;
    w.openTaskCompletionModal('t-photo', 'regular', TODAY);
    ok('задача photo: има поле за снимка', !!fileInput(doc, 'photo'));
    ok('задача photo: НЯМА поле за документ', !fileInput(doc, 'file'));
    ok('accept за снимка вече включва .heic (iPhone)',
      (fileInput(doc, 'photo').getAttribute('accept') || '').indexOf('.heic') >= 0,
      fileInput(doc, 'photo').getAttribute('accept'));
  }
  {
    const h = env({ tasks: [task('t-fc', 'file_comment')] });
    const { w, doc } = h;
    w.openTaskCompletionModal('t-fc', 'regular', TODAY);
    ok('file_comment: има и документ, и коментар',
      !!fileInput(doc, 'file') && !!doc.getElementById('tc-comment'));
    ok('file_comment: няма снимка', !fileInput(doc, 'photo'));
  }

  /* ═══ 3. Проверката на разширението — същината ═══════════════════════ */
  section('3. .xlsx в полето за СНИМКА се отказва');
  {
    const h = env({ tasks: [task('t-photo', 'photo')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-photo', 'regular', TODAY);
    const inp = fileInput(doc, 'photo');
    pick(h, inp, 'Зануляване продукти л.м. 24.08.xlsx');
    guard('tcUploadPhoto не хвърля', () => w.tcUploadPhoto(inp));
    await ticks();
    ok('НЕ тръгва качване', h.uploads.length === 0, h.uploads.join(' | '));
    ok('буферът остава празен', w.tcPendingPhotos.length === 0);
    const msg = calls.toast.join(' | ');
    ok('съобщението казва КАКВО е подадено', /\.xlsx/.test(msg), msg);
    ok('и КАКВО се очаква вместо това', /\.jpg/.test(msg) && /\.png/.test(msg), msg);
    ok('не е просто „невалиден файл"', !/невалиден файл/i.test(msg), msg);
  }
  {
    const h = env({ tasks: [task('t-photo', 'photo')] });
    const { w, doc } = h;
    w.openTaskCompletionModal('t-photo', 'regular', TODAY);
    const inp = fileInput(doc, 'photo');
    pick(h, inp, 'IMG_4821.heic');
    guard('tcUploadPhoto(.heic) не хвърля', () => w.tcUploadPhoto(inp));
    await ticks();
    ok('.heic от iPhone СЕ приема', h.uploads.length === 1, h.uploads.join(' | '));
    ok('и влиза в буфера за снимки', w.tcPendingPhotos.length === 1);
  }
  {
    const h = env({ tasks: [task('t-file', 'file')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-file', 'regular', TODAY);
    const inp = fileInput(doc, 'file');
    pick(h, inp, 'снимка.jpg');
    guard('tcUploadFile(.jpg) не хвърля', () => w.tcUploadFile(inp));
    await ticks();
    ok('.jpg в полето за ДОКУМЕНТ се отказва', h.uploads.length === 0, h.uploads.join(' | '));
    ok('съобщението изброява документните разширения',
      /\.pdf/.test(calls.toast.join(' | ')), calls.toast.join(' | '));
  }
  {
    const h = env({ tasks: [task('t-file', 'file')] });
    const { w, doc } = h;
    w.openTaskCompletionModal('t-file', 'regular', TODAY);
    const inp = fileInput(doc, 'file');
    pick(h, inp, 'л.м.xlsx');
    guard('tcUploadFile(.xlsx) не хвърля', () => w.tcUploadFile(inp));
    await ticks();
    ok('.xlsx в полето за документ СЕ приема', h.uploads.length === 1);
    ok('и влиза в буфера за документи', w.tcPendingFiles.length === 1);
    ok('пази оригиналното име', w.tcPendingFiles[0].filename === 'л.м.xlsx',
      w.tcPendingFiles[0].filename);
  }

  /* ═══ 4. Записът ════════════════════════════════════════════════════ */
  section('4. Записът носи files, а photos остава празен');
  {
    const h = env({ tasks: [task('t-file', 'file')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-file', 'regular', TODAY);
    const inp = fileInput(doc, 'file');
    pick(h, inp, 'справка.pdf');
    w.tcUploadFile(inp);
    await ticks();
    guard('submitTaskCompletion не хвърля',
      () => w.submitTaskCompletion('t-file', 'regular', TODAY));
    await ticks();
    const post = calls.post.filter(p => p.table === 'task_completions')[0];
    if (ok('POST тръгва', !!post, JSON.stringify(calls.post.map(p => p.table)))) {
      ok('files носи документа', !!post.body.files && post.body.files.length === 1,
        JSON.stringify(post.body.files));
      ok('с името на файла', post.body.files[0].filename === 'справка.pdf');
      ok('photos е null, не празен масив', post.body.photos === null,
        JSON.stringify(post.body.photos));
    }
  }
  {
    const h = env({ tasks: [task('t-file', 'file')] });
    const { w, calls } = h;
    w.openTaskCompletionModal('t-file', 'regular', TODAY);
    guard('submit без документ не хвърля',
      () => w.submitTaskCompletion('t-file', 'regular', TODAY));
    await ticks();
    ok('без документ записът НЕ тръгва',
      calls.post.filter(p => p.table === 'task_completions').length === 0);
    ok('и казва какво липсва',
      calls.toast.some(t => /документ/i.test(t)), calls.toast.join(' | '));
  }
  {
    /* file_comment: липсата на който и да е от двата спира записа. */
    const h = env({ tasks: [task('t-fc', 'file_comment')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-fc', 'regular', TODAY);
    const inp = fileInput(doc, 'file');
    pick(h, inp, 'справка.xlsx');
    w.tcUploadFile(inp);
    await ticks();
    w.submitTaskCompletion('t-fc', 'regular', TODAY);
    await ticks();
    ok('документ без коментар НЕ минава',
      calls.post.filter(p => p.table === 'task_completions').length === 0);
    ok('иска коментара', calls.toast.some(t => /коментар/i.test(t)), calls.toast.join(' | '));
  }
  {
    const h = env({ tasks: [task('t-fc', 'file_comment')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-fc', 'regular', TODAY);
    doc.getElementById('tc-comment').value = 'качено в САП';
    w.submitTaskCompletion('t-fc', 'regular', TODAY);
    await ticks();
    ok('коментар без документ НЕ минава',
      calls.post.filter(p => p.table === 'task_completions').length === 0);
  }

  /* ═══ 5. Показване ══════════════════════════════════════════════════ */
  section('5. Документ се показва като връзка, не като <img>');
  {
    const { w } = env();
    /* Заварените записи: .xlsx в СТАРАТА колона photos. */
    const staro = { photos: [{ url: 'http://x/1.xlsx', filename: 'л.м.xlsx' }] };
    const h1 = w.renderCompletionExtras(staro);
    ok('стар .xlsx в photos НЕ е <img>', h1.indexOf('<img') < 0, h1);
    ok('а е връзка с името', /<a [^>]*href="http:\/\/x\/1\.xlsx"/.test(h1) &&
      h1.indexOf('л.м.xlsx') >= 0, h1);

    const snimka = { photos: [{ url: 'http://x/2.jpg', filename: 'a.jpg' }] };
    ok('истинска снимка си остава <img>',
      w.renderCompletionExtras(snimka).indexOf('<img') >= 0);

    const doc2 = { files: [{ url: 'http://x/3.pdf', filename: 'справка.pdf' }] };
    const h3 = w.renderCompletionExtras(doc2);
    ok('нова колона files се показва като връзка',
      h3.indexOf('<img') < 0 && h3.indexOf('справка.pdf') >= 0, h3);

    const oba = { photos: [{ url: 'http://x/2.jpg', filename: 'a.jpg' }],
                  files: [{ url: 'http://x/3.pdf', filename: 'b.pdf' }] };
    const h4 = w.renderCompletionExtras(oba);
    ok('снимка и документ едновременно',
      h4.indexOf('<img') >= 0 && h4.indexOf('b.pdf') >= 0, h4);

    ok('.heic се брои за снимка', w.tcIsPhotoName('IMG.heic') === true);
    ok('.xlsx не се брои за снимка', w.tcIsPhotoName('a.xlsx') === false);
    ok('файл без разширение не е снимка', w.tcIsPhotoName('bezime') === false);

    /* Запис БЕЗ filename: в живата база такъв няма (9 записа с photos, всички
       с filename на всеки елемент), но старият код рендираше по URL и не се
       интересуваше от име. Затова липсващото име пази старото поведение —
       миниатюра — вместо да превърне всяка чужда снимка в „документ".
       Разширението нарочно НЕ се вади от URL-а: там може да има query низ
       или кавичка и проверката става гадаене. */
    const bezIme = { photos: [{ url: 'https://x/b.jpg' }] };
    ok('запис без filename си остава <img>',
      w.renderCompletionExtras(bezIme).indexOf('<img') >= 0,
      w.renderCompletionExtras(bezIme));
  }
  {
    /* Таб „Днес" минава по същия помощник. */
    const { w } = env();
    const h1 = w.todayCompletionExtras({ photos: [{ url: 'http://x/1.xlsx', filename: 'л.м.xlsx' }] });
    ok('таб „Днес": стар .xlsx не е <img>', h1.indexOf('<img') < 0, h1);
    const h2 = w.todayCompletionExtras({ files: [{ url: 'http://x/2.pdf', filename: 'c.pdf' }] });
    ok('таб „Днес": документът се вижда', h2.indexOf('c.pdf') >= 0, h2);
  }

  /* ═══ 6. Старите четири вида са непроменени ═════════════════════════ */
  section('6. КОНТРОЛА: старите видове работят както преди');
  {
    const h = env({ tasks: [task('t-c', 'comment')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-c', 'regular', TODAY);
    ok('comment: само текстово поле',
      !!doc.getElementById('tc-comment') && !fileInput(doc, 'photo') && !fileInput(doc, 'file'));
    doc.getElementById('tc-comment').value = 'готово';
    w.submitTaskCompletion('t-c', 'regular', TODAY);
    await ticks();
    const post = calls.post.filter(p => p.table === 'task_completions')[0];
    if (ok('записът тръгва', !!post)) {
      ok('коментарът е вътре', post.body.comment === 'готово');
      ok('photos е null', post.body.photos === null);
      ok('files е null, не празен масив', post.body.files === null,
        JSON.stringify(post.body.files));
    }
  }
  {
    const h = env({ tasks: [task('t-p', 'photo')] });
    const { w, doc, calls } = h;
    w.openTaskCompletionModal('t-p', 'regular', TODAY);
    const inp = fileInput(doc, 'photo');
    pick(h, inp, 'a.png');
    w.tcUploadPhoto(inp);
    await ticks();
    w.submitTaskCompletion('t-p', 'regular', TODAY);
    await ticks();
    const post = calls.post.filter(p => p.table === 'task_completions')[0];
    if (ok('photo: записът тръгва', !!post)) {
      ok('photos носи снимката', !!post.body.photos && post.body.photos.length === 1);
      ok('files е null', post.body.files === null);
    }
  }
  {
    const h = env({ tasks: [task('t-i', 'info')] });
    const { w, doc } = h;
    /* info изобщо не минава през модала — чекбоксът записва директно. */
    ok('info няма нужда от нищо',
      w.TASK_TYPES.info.needsPhoto === false &&
      w.TASK_TYPES.info.needsFile === false &&
      w.TASK_TYPES.info.needsComment === false);
  }

  report();
})();
