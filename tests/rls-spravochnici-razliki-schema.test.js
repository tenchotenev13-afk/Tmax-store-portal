/* rls-spravochnici-schema.sql (миграция 2) и rls-razliki-schema.sql
   (миграция 3) от описа rls-15-opis (28.11.2026).

   За всеки файл:
   1. Активният SQL пипа ТОЧНО изброените таблици — нищо друго от public.
   2. revoke truncate, references, trigger от anon, authenticated за всяка.
   3. Политика portal_<команда> за ВСЯКА команда, която anon/authenticated
      имат днес като grant (сверено в базата 28.11.2026) — и само за нея;
      ролите са anon, authenticated, освен при stock_differences /
      stock_diff_swaps, където anon е покрит от anon_all_* и политиките са
      само за authenticated. using / with check (true) по командата.
   4. mirror_reader_select навсякъде.
   5. enable row level security — СЛЕД всички create policy.
   6. Нищо друго: без grant / drop / disable / delete / truncate таблица /
      политика за public; точен брой команди.
   7. Rollback (коментар) е точно обратното на активния SQL, в обратен ред.
   8. Мутации — всяка трябва да падне.
   9. Тестът е в TESTS на tests/run-all.js.

   ГРАНИЦИ: не вижда базата. Истинската проверка е сверката след прилагане
   (като anon: SELECT / INSERT / UPDATE / DELETE / upsert / rpc; TRUNCATE →
   42501; mirror_reader броевете = postgres; edge_logs без 401/403).

   Пускане:  node tests/rls-spravochnici-razliki-schema.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const AA = 'anon, authenticated';
const SPECS = {
  'rls-spravochnici-schema.sql': [
    ['warranty_brands', 'SIUD', AA], ['warranty_subcategories', 'SIUD', AA],
    ['warranty_entries', 'SIUD', AA], ['warranty_service_locations', 'SIU', AA],
    ['warranty_templates', 'SIU', AA], ['bulletin_promotions', 'SIU', AA],
    ['order_restrictions', 'SIUD', AA], ['product_catalog', 'SIUD', AA],
  ],
  'rls-razliki-schema.sql': [
    ['differences_reports', 'SIUD', AA],
    ['stock_differences', 'SIUD', 'authenticated'],
    ['stock_diff_swaps', 'SIUD', 'authenticated'],
  ],
};
const CMD = { S: 'select', I: 'insert', U: 'update', D: 'delete' };
const BODY = { S: 'using (true)', I: 'with check (true)', U: 'using (true) with check (true)', D: 'using (true)' };
const norm = s => s.toLowerCase().replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

function parse(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const active = lines.filter(l => !/^\s*--/.test(l)).map(l => l.replace(/--.*$/, '')).join('\n');
  const stmts = active.split(';').map(norm).filter(Boolean);
  const rbStart = lines.findIndex(l => /^--\s*ROLLBACK/.test(l));
  const rb = rbStart < 0 ? [] : lines.slice(rbStart + 1).filter(l => /^--\s*\S/.test(l)).map(l => norm(l.replace(/^--\s*/, '')));
  return { stmts, rb };
}

/* Обратното на една активна команда. */
function inverse(s) {
  let m;
  if ((m = s.match(/^revoke (.+) on (\S+) from (.+)$/))) return 'grant ' + m[1] + ' on ' + m[2] + ' to ' + m[3];
  if ((m = s.match(/^create policy (\S+) on (\S+) /))) return 'drop policy ' + m[1] + ' on ' + m[2];
  if ((m = s.match(/^alter table (\S+) enable row level security$/))) return 'alter table ' + m[1] + ' disable row level security';
  return null;
}

function check(raw, spec) {
  const f = [];
  const { stmts, rb } = parse(raw);
  const has = s => stmts.indexOf(s) >= 0;
  const tables = spec.map(s => s[0]);

  // 1. само изброените таблици
  const objs = new Set();
  stmts.forEach(s => (s.match(/public\.[a-z_0-9]+/g) || []).forEach(o => objs.add(o.slice(7))));
  const extra = [...objs].filter(o => tables.indexOf(o) < 0);
  if (extra.length) f.push('чужди обекти: ' + extra.join(','));
  tables.forEach(t => { if (!objs.has(t)) f.push(t + ': липсва'); });

  let want = 0;
  spec.forEach(([t, cmds, roles]) => {
    // 2. revoke
    if (!has('revoke truncate, references, trigger on public.' + t + ' from anon, authenticated')) f.push(t + ': revoke truncate/references/trigger');
    want++;
    // 3. политики точно за командите с grant
    Object.keys(CMD).forEach(c => {
      const p = 'create policy portal_' + CMD[c] + ' on public.' + t + ' for ' + CMD[c] + ' to ' + roles + ' ' + BODY[c];
      const any = stmts.some(s => s.indexOf('create policy portal_' + CMD[c] + ' on public.' + t + ' ') === 0);
      if (cmds.indexOf(c) >= 0) { if (!has(p)) f.push(t + ': portal_' + CMD[c]); want++; }
      else if (any) f.push(t + ': portal_' + CMD[c] + ' без grant');
    });
    // 4. mirror_reader_select
    if (!has('create policy mirror_reader_select on public.' + t + ' for select to mirror_reader using (true)')) f.push(t + ': mirror_reader_select');
    want++;
    if (!has('alter table public.' + t + ' enable row level security')) f.push(t + ': enable RLS');
    want++;
  });

  // 5. enable RLS след всички политики
  const lastPol = stmts.map((s, i) => /^create policy/.test(s) ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  const firstEn = stmts.findIndex(s => /enable row level security/.test(s));
  if (firstEn >= 0 && firstEn < lastPol) f.push('enable RLS преди политика');

  // 6. нищо друго
  stmts.forEach(s => {
    if (!/^(revoke truncate, references, trigger on \S+ from anon, authenticated$|create policy |alter table \S+ enable row level security$)/.test(s)) f.push('чужда команда: ' + s.slice(0, 60));
    if (/\bto public\b/.test(s)) f.push('политика за public: ' + s.slice(0, 60));
  });
  if (stmts.length !== want) f.push('команди: ' + stmts.length + ' (очаква ' + want + ')');

  // 7. rollback = обратното в обратен ред
  const exp = stmts.map(inverse).reverse();
  if (exp.some(x => x === null)) f.push('команда без обратно');
  if (rb.length !== exp.length) f.push('rollback редове: ' + rb.length + ' (очаква ' + exp.length + ')');
  exp.forEach((x, i) => { if (x && rb[i] !== x) f.push('rollback ред ' + (i + 1) + ': „' + rb[i] + '“ ≠ „' + x + '“'); });
  return f;
}

const MUT = {
  'rls-spravochnici-schema.sql': [
    ['без portal_delete на product_catalog', r => r.replace(/^create policy portal_delete on public\.product_catalog.*\n/m, '')],
    ['portal_delete на bulletin_promotions (няма grant)', r => r.replace(/^(create policy portal_update on public\.bulletin_promotions.*)$/m, '$1\ncreate policy portal_delete on public.bulletin_promotions for delete to anon, authenticated using (true);')],
    ['enable RLS преди политиките', r => r.replace(/^alter table public\.warranty_brands\s+enable row level security;\n/m, '').replace(/^(revoke truncate, references, trigger on public\.warranty_brands .*)$/m, '$1\nalter table public.warranty_brands enable row level security;')],
    ['без mirror_reader_select на warranty_templates', r => r.replace(/^create policy mirror_reader_select on public\.warranty_templates.*\n/m, '')],
    ['revoke без trigger', r => r.replace(/revoke truncate, references, trigger on public\.order_restrictions/, 'revoke truncate, references on public.order_restrictions')],
    ['девета таблица', r => r.replace(/^(alter table public\.product_catalog\s+enable row level security;)$/m, '$1\nalter table public.users enable row level security;')],
    ['rollback без disable на product_catalog', r => r.replace(/^-- alter table public\.product_catalog\s+disable row level security;\n/m, '')],
    ['update без with check', r => r.replace(/(portal_update on public\.warranty_entries for update to anon, authenticated using \(true\)) with check \(true\)/, '$1')],
    ['политика само за anon', r => r.replace(/(portal_select on public\.warranty_brands for select to) anon, authenticated/, '$1 anon')],
  ],
  'rls-razliki-schema.sql': [
    ['без portal_insert на differences_reports', r => r.replace(/^create policy portal_insert on public\.differences_reports.*\n/m, '')],
    ['дубликат на anon_all_sd (anon в stock_differences)', r => r.replace(/(portal_select on public\.stock_differences for select to) authenticated/, '$1 anon, authenticated')],
    ['без mirror_reader_select на stock_diff_swaps', r => r.replace(/^create policy mirror_reader_select on public\.stock_diff_swaps.*\n/m, '')],
    ['grant в активния SQL', r => r.replace(/^(alter table public\.stock_diff_swaps\s+enable row level security;)$/m, '$1\ngrant all on public.stock_diff_swaps to anon;')],
    ['rollback в грешен ред', r => r.replace(/^(-- alter table public\.stock_diff_swaps\s+disable row level security;)\n(-- alter table public\.stock_differences\s+disable row level security;)$/m, '$2\n$1')],
    ['без revoke на differences_reports', r => r.replace(/^revoke truncate, references, trigger on public\.differences_reports.*\n/m, '')],
  ],
};

Object.keys(SPECS).forEach(file => {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  section(file);
  const fails = check(raw, SPECS[file]);
  H.ok('таблици / revoke / политики по grant / mirror_reader_select / RLS последно / rollback', fails.length === 0, fails.join(' | '));
  SPECS[file].forEach(([t]) => H.ok(t + ': mirror_reader_select', parse(raw).stmts.indexOf('create policy mirror_reader_select on public.' + t + ' for select to mirror_reader using (true)') >= 0));

  section(file + ' — мутации');
  MUT[file].forEach(([name, fn]) => {
    const m = fn(raw);
    H.ok('мутантът е различен: ' + name, m !== raw);
    H.ok('мутантът пада: ' + name, check(m, SPECS[file]).length > 0);
  });
});

section('Регистрация');
const runAll = fs.readFileSync(path.join(ROOT, 'tests', 'run-all.js'), 'utf8');
H.ok("'rls-spravochnici-razliki-schema.test.js' е в TESTS", /'rls-spravochnici-razliki-schema\.test\.js'/.test(runAll));

report();
