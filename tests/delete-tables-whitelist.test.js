/* DELETE от браузъра — само таблиците от DELETE_ALLOWED.

   От миграцията anon-revoke-delete-schema.sql (02.11.2026) anon и
   authenticated имат DELETE САМО върху тези таблици. Тестът сканира всеки
   .js в корена и събира таблиците, от които браузърът трие:
     1. sbDelete('<литерал>', …);
     2. sbDelete(<променлива>, …) — само на места от VARIABLE_SITES, където
        стойностите са проследени (и самото проследяване се сверява);
        непознато място → тестът пада;
     3. директен fetch(…, {method:'DELETE'}) или XHR .open('DELETE', …) —
        таблицата се взема от литерала /rest/v1/<таблица> в същото извикване.
        /storage/v1/ (файлове) е извън обхвата. Неразпознат URL → пада.
   Множеството трябва да е РАВНО на DELETE_ALLOWED: нова таблица без запис
   → „добави grant delete в нова миграция и в DELETE_ALLOWED“; запис без
   код → „махни от DELETE_ALLOWED (и revoke в миграция)“.

   ГРАНИЦИ: не вижда URL, сглобен изцяло от променливи извън sbDelete (такъв
   fetch с DELETE пада като „неразпознат“, т.е. не минава мълчаливо); не
   вижда правата в базата — нова таблица в public получава DELETE за anon
   по подразбиране (default privileges), без значение какво пише тук.

   Мутационна проверка (02.11.2026), всеки мутант пуснат срещу този тест:
     - kasa.js: sbDelete('kasa_reports','id=eq.1')            — СЪБОРЕН
     - махнат 'bus_routes' от DELETE_ALLOWED                   — СЪБОРЕН
     - kasa.js: fetch(SB_URL+'/rest/v1/kasa_reports?id=eq.1',
       {method:'DELETE'})                                      — СЪБОРЕН
     - reference.js: нов refAdminListHtml(x,'warranty_cards')  — СЪБОРЕН
     - нов sbDelete(tbl, …) с променлива на непознато място    — СЪБОРЕН
     - fetch(u, {method:'DELETE'}) с URL само от променлива     — СЪБОРЕН
       („неразпознат URL“)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/delete-tables-whitelist.test.js .
*/
const fs = require('fs');
const path = require('path');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = path.resolve(process.argv[2] || '.');

const DELETE_ALLOWED = [
  'bulletin_tasks', 'bus_routes', 'client_orders', 'contact_topics', 'contacts',
  'differences_reports', 'documents', 'goods_transit', 'kasa_storno',
  'kasa_storno_items', 'loading_list_items', 'loading_list_photos',
  'loading_list_products', 'notification_matrix', 'notification_overrides',
  'notification_schedules', 'order_restrictions', 'picking_batches',
  'picking_pallet_items', 'picking_pallets', 'picking_shipments',
  'product_catalog', 'recurring_task_periods', 'recurring_task_skips',
  'recurring_task_versions', 'recurring_tasks', 'report_recipients',
  'revaluation_campaigns', 'revaluation_items', 'revision_schedule',
  'stock_diff_swaps', 'stock_differences', 'stock_returns', 'storno_notes',
  'stores', 'subtask_completions', 'supply_no_need', 'task_completions',
  'task_subtasks', 'transfer_cargo', 'transfers', 'transport_orders',
  'warranty_brands', 'warranty_entries', 'warranty_subcategories',
];

// sbDelete(<променлива>) — файл|функция → проследени стойности + как се сверяват
const VARIABLE_SITES = {
  'reference.js|refDeletePrompt': {
    values: ['warranty_brands', 'warranty_subcategories'],
    // refDeletePrompt(table, …) се вика само от бутона в refAdminListHtml(items, table)
    trace: src => (src.match(/refAdminListHtml\([^,()]+,\s*'([a-z_0-9]+)'\)/g) || [])
      .map(s => s.match(/'([a-z_0-9]+)'\)$/)[1]),
  },
};

function fnAt(src, idx) {
  const re = /function\s+([A-Za-z0-9_$]+)\s*\(/g;
  let m, name = '(горно ниво)';
  while ((m = re.exec(src)) && m.index < idx) name = m[1];
  return name;
}
function lineAt(src, idx) { return src.slice(0, idx).split('\n').length; }

const found = {};      // таблица → [файл:ред функция]
const problems = [];
function add(t, where) { (found[t] = found[t] || []).push(where); }

const files = fs.readdirSync(ROOT).filter(f => /\.js$/.test(f)).sort();
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');

  // 1 + 2: sbDelete(
  const re = /\bsbDelete\(\s*([^,)]*)/g;
  let m;
  while ((m = re.exec(src))) {
    const fn = fnAt(src, m.index);
    if (f === 'shared.js' && /^t$/.test(m[1].trim())) continue; // самата дефиниция function sbDelete(t,f)
    const where = f + ':' + lineAt(src, m.index) + ' ' + fn;
    const arg = m[1].trim();
    const lit = arg.match(/^['"]([a-z_0-9]+)['"]$/);
    if (lit) { add(lit[1], where); continue; }
    const site = VARIABLE_SITES[f + '|' + fn];
    if (!site) { problems.push('sbDelete с променлива на непознато място: ' + where + ' (' + arg + ') — проследи стойностите и ги добави във VARIABLE_SITES'); continue; }
    site.values.forEach(v => add(v, where + ' [' + arg + ']'));
  }

  // 3: директен DELETE
  const reRaw = /method\s*:\s*['"]DELETE['"]|\.open\(\s*['"]DELETE['"]/g;
  while ((m = reRaw.exec(src))) {
    const fn = fnAt(src, m.index);
    if (f === 'shared.js' && fn === 'sbDelete') continue;
    const where = f + ':' + lineAt(src, m.index) + ' ' + fn;
    const start = Math.max(src.lastIndexOf('fetch(', m.index), src.lastIndexOf('.open(', m.index + 6));
    const call = src.slice(start < 0 ? Math.max(0, m.index - 600) : start, m.index + 200);
    const rest = call.match(/\/rest\/v1\/([a-z_0-9]+)/);
    if (rest) { add(rest[1], where + ' [fetch]'); continue; }
    if (/\/storage\/v1\//.test(call)) continue; // файлове — извън обхвата
    problems.push('DELETE с неразпознат URL: ' + where + ' — таблицата трябва да е литерал /rest/v1/<таблица>');
  }
}

section('Сверка на проследените променливи');
Object.keys(VARIABLE_SITES).forEach(k => {
  const file = k.split('|')[0];
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const got = Array.from(new Set(VARIABLE_SITES[k].trace(src))).sort();
  ok(k + ': стойностите в кода = ' + VARIABLE_SITES[k].values.join(', '),
     JSON.stringify(got) === JSON.stringify(VARIABLE_SITES[k].values.slice().sort()),
     'в кода: ' + got.join(', '));
});

section('Всяко триене е разпознато');
ok('нула неразпознати места', problems.length === 0, '\n      ' + problems.join('\n      '));

section('Таблиците = DELETE_ALLOWED');
const tables = Object.keys(found).sort();
const extra = tables.filter(t => DELETE_ALLOWED.indexOf(t) < 0);
const unused = DELETE_ALLOWED.filter(t => tables.indexOf(t) < 0);
ok('няма триене извън DELETE_ALLOWED', extra.length === 0,
   '\n      ' + extra.map(t => t + '  ← ' + found[t].join('; ') + '\n        → добави grant delete в нова миграция и в DELETE_ALLOWED').join('\n      '));
ok('няма запис в DELETE_ALLOWED без код', unused.length === 0,
   '\n      ' + unused.map(t => t + ' → махни от DELETE_ALLOWED (и revoke delete в нова миграция)').join('\n      '));
ok('DELETE_ALLOWED без повторения', new Set(DELETE_ALLOWED).size === DELETE_ALLOWED.length);
ok('45 таблици (както в anon-revoke-delete-schema.sql)', DELETE_ALLOWED.length === 45, 'реално: ' + DELETE_ALLOWED.length);

section('Миграцията не отнема от разрешените');
const schema = path.join(ROOT, 'anon-revoke-delete-schema.sql');
if (fs.existsSync(schema)) {
  const sql = fs.readFileSync(schema, 'utf8');
  const revoked = (sql.match(/^revoke delete on public\.([a-z_0-9]+) from anon, authenticated;$/gm) || [])
    .map(s => s.match(/public\.([a-z_0-9]+)/)[1]);
  ok('revoke-списъкът не съдържа таблица от DELETE_ALLOWED',
     revoked.filter(t => DELETE_ALLOWED.indexOf(t) >= 0).length === 0,
     revoked.filter(t => DELETE_ALLOWED.indexOf(t) >= 0).join(', '));
  ok('revoke-списъкът има 45 реда', revoked.length === 45, 'реално: ' + revoked.length);
} else ok('anon-revoke-delete-schema.sql съществува', false);

report();
