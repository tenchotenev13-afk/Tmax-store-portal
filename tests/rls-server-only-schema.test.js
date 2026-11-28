/* rls-server-only-schema.sql — миграция 1 от описа rls-15-opis (28.11.2026).

   1. Активният SQL пипа ТОЧНО трите таблици (notification_log,
      warranty_cards, client_order_counters) и функцията
      assign_client_order_num() — нищо друго от public.
   2. За всяка от трите: enable RLS; revoke all from anon, authenticated;
      политика mirror_reader_select FOR SELECT TO mirror_reader using (true).
   3. Функцията: security definer + set search_path = public, pg_temp;
      revoke execute от public, anon И authenticated (PUBLIC = =X/,
      наследява се — revoke само от anon не върши нищо).
   4. Нищо разрушително: без drop / delete / truncate / grant / disable /
      create table / create or replace в активния SQL; точно 12 команди.
   5. Rollback-ът (коментар) е пълен: обратното на всяка команда, grant-ът
      връща arwDxtm (БЕЗ delete — той е отнет отпреди, 02.11.2026), функцията
      се връща на invoker / reset search_path / execute за трите роли.
   6. Мутации: проверката от 1–5 се пуска върху развалени копия на файла —
      всяко трябва да падне.
   7. Тестът е в TESTS на tests/run-all.js.

   ГРАНИЦИ: не вижда базата. Истинската проверка е сверката след прилагане
   (anon INSERT client_orders → номер; anon в трите → 42501; mirror_reader
   броевете = postgres).

   Пускане:  node tests/rls-server-only-schema.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const FILE = path.join(ROOT, 'rls-server-only-schema.sql');
const TABLES = ['notification_log', 'warranty_cards', 'client_order_counters'];
const FN = 'public.assign_client_order_num()';
const GRANT_BACK = 'select, insert, update, truncate, references, trigger, maintain';

function parse(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const active = lines.filter(l => !/^\s*--/.test(l)).map(l => l.replace(/--.*$/, '')).join('\n').toLowerCase();
  const stmts = active.split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rbStart = lines.findIndex(l => /^--\s*ROLLBACK/.test(l));
  const rb = rbStart < 0 ? [] : lines.slice(rbStart + 1).filter(l => /^--\s*\S/.test(l))
    .map(l => l.replace(/^--\s*/, '').toLowerCase().replace(/\s+/g, ' ').replace(/;\s*$/, '').trim());
  return { stmts, rb };
}

/* Връща списък с провалени проверки (празен = чисто). */
function check(raw) {
  const f = [];
  const { stmts, rb } = parse(raw);
  const has = s => stmts.indexOf(s) >= 0;
  const hasRb = s => rb.indexOf(s) >= 0;

  // 1. само трите + функцията
  const objs = new Set();
  stmts.forEach(s => (s.match(/public\.[a-z_0-9]+/g) || []).forEach(o => objs.add(o.replace(/^public\./, ''))));
  const allowed = TABLES.concat(['assign_client_order_num']);
  const extra = [...objs].filter(o => allowed.indexOf(o) < 0);
  if (extra.length) f.push('чужди обекти: ' + extra.join(','));
  // „public“ като роля в revoke execute — не е обект; другите споменавания на схема без „public.“ се хващат от броя команди

  // 2. трите таблици
  TABLES.forEach(t => {
    if (!has('alter table public.' + t + ' enable row level security')) f.push(t + ': enable RLS');
    if (!has('revoke all on public.' + t + ' from anon, authenticated')) f.push(t + ': revoke all');
    if (!has('create policy mirror_reader_select on public.' + t + ' for select to mirror_reader using (true)')) f.push(t + ': mirror_reader_select');
  });

  // 3. функцията
  if (!has('alter function ' + FN + ' security definer')) f.push('функция: security definer');
  if (!has('alter function ' + FN + ' set search_path = public, pg_temp')) f.push('функция: search_path');
  if (!has('revoke execute on function ' + FN + ' from public, anon, authenticated')) f.push('функция: revoke execute от public, anon, authenticated');
  if (stmts.some(s => /security invoker/.test(s))) f.push('функция: invoker в активния SQL');

  // 4. нищо разрушително, точно 12
  stmts.forEach(s => {
    if (/^(drop|delete|truncate|grant|create table|create or replace|update|insert)\b/.test(s) || /disable row level security/.test(s))
      f.push('забранена команда: ' + s.slice(0, 60));
    if (/\bto (anon|authenticated|public)\b/.test(s)) f.push('право/политика за anon/authenticated/public: ' + s.slice(0, 60));
  });
  if (stmts.length !== 12) f.push('команди: ' + stmts.length + ' (очаква 12)');

  // 5. rollback
  const want = [];
  TABLES.forEach(t => {
    want.push('drop policy mirror_reader_select on public.' + t);
    want.push('grant ' + GRANT_BACK + ' on public.' + t + ' to anon, authenticated');
    want.push('alter table public.' + t + ' disable row level security');
  });
  want.push('grant execute on function ' + FN + ' to public, anon, authenticated');
  want.push('alter function ' + FN + ' reset search_path');
  want.push('alter function ' + FN + ' security invoker');
  want.forEach(w => { if (!hasRb(w.replace(/\s+/g, ' '))) f.push('rollback липсва: ' + w); });
  if (rb.length !== want.length) f.push('rollback редове: ' + rb.length + ' (очаква ' + want.length + ')');
  if (rb.some(l => /\bdelete\b/.test(l))) f.push('rollback връща delete (отнет отпреди)');
  return f;
}

const raw = fs.readFileSync(FILE, 'utf8');

section('Файлът');
const fails = check(raw);
H.ok('трите таблици + функцията, RLS / revoke / mirror_reader_select, DEFINER + search_path, rollback пълен', fails.length === 0, fails.join(' | '));
const { stmts } = parse(raw);
TABLES.forEach(t => H.ok(t + ': mirror_reader_select', stmts.indexOf('create policy mirror_reader_select on public.' + t + ' for select to mirror_reader using (true)') >= 0));
H.ok('ред: alter function преди revoke all на client_order_counters',
  stmts.findIndex(s => /security definer/.test(s)) < stmts.indexOf('revoke all on public.client_order_counters from anon, authenticated'));

section('Мутации — всяка трябва да падне');
const MUT = [
  ['политиката на warranty_cards махната', r => r.replace(/^create policy mirror_reader_select on public\.warranty_cards.*\n/m, '')],
  ['definer → invoker', r => r.replace(/assign_client_order_num\(\) security definer;/, 'assign_client_order_num() security invoker;')],
  ['без search_path', r => r.replace(/^alter function public\.assign_client_order_num\(\) set search_path.*\n/m, '')],
  ['revoke execute само от anon', r => r.replace(/from public, anon, authenticated;/, 'from anon;')],
  ['четвърта таблица', r => r.replace(/^(alter table public\.client_order_counters enable row level security;)$/m, '$1\nalter table public.product_catalog enable row level security;')],
  ['revoke само от anon на notification_log', r => r.replace(/^revoke all on public\.notification_log\s+from anon, authenticated;/m, 'revoke all on public.notification_log from anon;')],
  ['rollback без disable на client_order_counters', r => r.replace(/^-- alter table public\.client_order_counters disable row level security;\n/m, '')],
  ['rollback връща и delete', r => r.replace(/grant select, insert, update, truncate, references, trigger, maintain on public\.warranty_cards/, 'grant all on public.warranty_cards')],
  ['политика за anon', r => r.replace(/for select to mirror_reader using \(true\);\ncreate policy mirror_reader_select on public\.warranty_cards/, 'for select to anon using (true);\ncreate policy mirror_reader_select on public.warranty_cards')],
];
MUT.forEach(([name, fn]) => {
  const m = fn(raw.replace(/\r\n/g, '\n'));
  H.ok('мутантът е различен от оригинала: ' + name, m !== raw.replace(/\r\n/g, '\n'));
  H.ok('мутантът пада: ' + name, check(m).length > 0);
});

section('Регистрация');
const runAll = fs.readFileSync(path.join(ROOT, 'tests', 'run-all.js'), 'utf8');
H.ok("'rls-server-only-schema.test.js' е в TESTS", /'rls-server-only-schema\.test\.js'/.test(runAll));

report();
