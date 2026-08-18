/* Постоянна проверка срещу дублирани DOM id-та между файловете.

   ПОВОД: c-name/c-phone бяха дефинирани и в index.html (клиентският модал), и в
   contacts.js (модалът за контакт). Понеже #mod-contacts стои преди
   #client-modal в дървото, getElementById връщаше грешния елемент и
   submitClientOrder() винаги казваше "Попълни задължителните полета *".
   Бъгът стоя скрит от 11.06.2026, защото нищо не пазеше id-пространството —
   smoke.js брои само глобални функции.

   ОБХВАТ: index.html + *.js в КОРЕНА на репото. Обхождането е плоско
   (readdirSync без рекурсия), затова node_modules/, tests/, supabase/ и
   .claude/ така или иначе не се четат.

   ОГРАНИЧЕНИЕ: хващат се само литерални id-та. Динамично сглобените
   ('co-row-'+o.id) не се засичат — приемливо е, защото точно те не се
   сблъскват със статичните от index.html.

   Пускане:
     node tests/id-collisions.test.js .

   Контролна проверка срещу стар commit (същата логика, файловете идват от
   git, не от диска) — така се доказва, че проверката наистина лови бъга:
     ID_COLLISIONS_REF=fd2adf6 node tests/id-collisions.test.js .
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/* Ползваме ok/section/report от harness-а, за да е същият договор за
   изход и exit код като на останалите tests/*.test.js (run-all.js чете
   реда "N успешни, M неуспешни" и решава по exit кода). */
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const ROOT = (process.argv[2] || path.join(__dirname, '..')).replace(/[\\/]+$/, '');
const REF = process.env.ID_COLLISIONS_REF || '';

/* ── БЯЛ СПИСЪК ─────────────────────────────────────────────────────────────
   Само за id-та, при които JS-ът подменя СЪЩИЯ елемент от index.html през
   outerHTML, вместо да създава втори. Нов запис тук изисква коментар защо. */
const ALLOWED = {
  'c-from-store':
    'index.html дефинира <select id="c-from-store"> в клиентския модал, а ' +
    'openClientModal() (client-orders.js) подменя СЪЩИЯ елемент през outerHTML — ' +
    'заключва го на собствения магазин за служител с точно 1 назначен обект. ' +
    'Втори елемент с това id не се създава.',
  'o-store':
    'Огледален модел в transport.js: същият <select id="o-store"> от index.html ' +
    'се подменя през outerHTML при отваряне на транспортния модал, не се добавя нов.'
};

/* ── Извличане на литералните id-та ─────────────────────────────────────────
   Хваща id="X", id='X' и екранираното id=\"X\" вътре в JS низове.
   Lookbehind-ът пази от data-id="X" и подобни атрибути.
   Динамичните ('id="row-'+i+'"') отпадат сами: между кавичките остават ' и +,
   които STATIC_ID не приема. */
const ID_RE = /(?<![-\w])id=(\\?)(["'])([^"']*?)\2/g;
const STATIC_ID = /^[A-Za-z][A-Za-z0-9_:.-]*$/;

function idsIn(src) {
  const out = [];
  let m;
  ID_RE.lastIndex = 0;
  while ((m = ID_RE.exec(src)) !== null) {
    const raw = m[3].replace(/\\$/, ''); /* id=\"X\" оставя завършващ backslash */
    if (STATIC_ID.test(raw)) out.push(raw);
  }
  return out;
}

/* ── Източник на файловете: работното дърво или фиксиран commit ──────────── */
function fileList() {
  if (REF) {
    return execSync('git ls-tree -r --name-only ' + REF, { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
      .filter(function (f) { return f.indexOf('/') < 0 && (f === 'index.html' || /\.js$/.test(f)); });
  }
  return fs.readdirSync(ROOT)
    .filter(function (f) { return f === 'index.html' || /\.js$/.test(f); })
    .filter(function (f) { return fs.statSync(path.join(ROOT, f)).isFile(); });
}

function readFile(f) {
  return REF
    ? execSync('git show ' + REF + ':' + f, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    : fs.readFileSync(path.join(ROOT, f), 'utf8');
}

/* ── Събиране ───────────────────────────────────────────────────────────── */
const files = fileList();
const owners = {};   /* id -> { файл: брой срещания } */

files.forEach(function (f) {
  idsIn(readFile(f)).forEach(function (id) {
    if (!owners[id]) owners[id] = {};
    owners[id][f] = (owners[id][f] || 0) + 1;
  });
});

const allIds = Object.keys(owners).sort();

console.log('Източник: ' + (REF ? 'commit ' + REF : 'работното дърво') +
            '  ·  ' + files.length + ' файла  ·  ' + allIds.length + ' литерални id-та');

/* ── 1. Проверката да не мине празна ────────────────────────────────────── */
section('1. Сканирането наистина е намерило нещо');

ok('index.html е сред сканираните файлове', files.indexOf('index.html') >= 0, files.join(', '));
ok('сканирани са поне 20 файла', files.length >= 20, String(files.length));
/* Ако регексът се счупи, той спира да намира каквото и да е и тестът би минал
   зелен, без да проверява нищо. Затова долна граница. */
ok('намерени са поне 100 литерални id-та', allIds.length >= 100, String(allIds.length));
ok('index.html дава поне 50 id-та',
   Object.keys(owners).filter(function (id) { return owners[id]['index.html']; }).length >= 50);

/* ── 2. Дублирано id вътре в самия index.html ───────────────────────────── */
section('2. Без повторено id вътре в index.html');

const dupInHtml = allIds.filter(function (id) { return (owners[id]['index.html'] || 0) > 1; });
ok('нито едно id не се среща 2+ пъти в index.html',
   dupInHtml.length === 0,
   dupInHtml.map(function (id) { return id + ' × ' + owners[id]['index.html']; }).join(', '));

/* ── 3. Едно id, дефинирано в повече от един файл ───────────────────────── */
section('3. Без id, дефинирано в повече от един файл');

const multi = allIds.filter(function (id) { return Object.keys(owners[id]).length > 1; });
const illegal = multi.filter(function (id) { return !ALLOWED[id]; });
const legal = multi.filter(function (id) { return !!ALLOWED[id]; });

illegal.forEach(function (id) {
  ok('id "' + id + '" е само в един файл', false,
     'среща се в: ' + Object.keys(owners[id]).map(function (f) {
       return f + ' (' + owners[id][f] + '×)';
     }).join(', '));
});
ok('няма id извън белия списък в 2+ файла', illegal.length === 0,
   illegal.length ? illegal.join(', ') : '');

legal.forEach(function (id) {
  console.log('  ℹ️  ' + id + ' — в белия списък: ' + Object.keys(owners[id]).join(' + '));
});
ok('попаденията в белия списък са точно 2', legal.length === 2,
   legal.length + ': ' + legal.join(', '));

/* ── 4. Белият списък да не гние ────────────────────────────────────────── */
section('4. Белият списък отговаря на действителността');

Object.keys(ALLOWED).forEach(function (id) {
  const where = owners[id] ? Object.keys(owners[id]) : [];
  ok('"' + id + '" все още е в 2+ файла (иначе записът е излишен)',
     where.length > 1, 'сега е в: ' + (where.join(', ') || 'никъде'));
  ok('"' + id + '" има записана причина', (ALLOWED[id] || '').length > 40);
});

report();
