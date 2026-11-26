/* mirror_reader чете всичките 93 таблици на огледалото
   (mirror-reader-all-schema.sql + tools/mirror-key/mirror-tables.txt).

   1. mirror-tables.txt: 93 реда, сортиран, без BOM, без повторения, само
      имена на таблици; без grafik_*, *_bak_*, *_archive_*, backup_snapshots,
      revaluation_unit_counters.
   2. SELECT-ът от трите миграции на ролята (mirror-reader-schema.sql,
      mirror-reader-audit-log-schema.sql, mirror-reader-all-schema.sql)
      покрива ТОЧНО списъка (+ изгледа storage_files_index от първата).
      Новата миграция не повтаря осемте вече дадени.
   3. users и stores — само колонен SELECT, точно изброените колони; без
      password_hash, history_pin_hash, pass; без пълен grant на двете.
   4. Политика FOR SELECT TO mirror_reader using (true) за всяка таблица с
      RLS (= новите минус списъка „БЕЗ RLS:“ в коментара); за таблиците без
      RLS — няма политика.
   5. Активният SQL: само grant select / create policy for select; никакво
      insert/update/delete/truncate/all; никакъв revoke/alter/drop; anon,
      authenticated, service_role, PUBLIC не се споменават; grafik_ — никъде.
   6. Rollback-ът маха всяка политика и всеки grant.
   7. make-mirror-key.js: а) минава по mirror-tables.txt; в) пробва хешовете,
      pass и grafik_*; README и CLAUDE.md споменават списъка.

   ГРАНИЦИ: не вижда базата. „Кои са с RLS“ е сверено в базата на 26.11.2026
   и записано в коментара на миграцията; истинската проверка е сверката
   като mirror_reader след прилагане (count = count като postgres, 42501 за
   хешовете и pass).

   Пускане:  node tests/mirror-reader-all.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;
const ok = (cond, name) => H.ok(name, cond);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ROOT = path.resolve(process.argv[2] || '.');
const LIST = path.join(ROOT, 'tools', 'mirror-key', 'mirror-tables.txt');
const ALL_SQL = path.join(ROOT, 'mirror-reader-all-schema.sql');

const USERS_COLS = ['id', 'email', 'store_name', 'role', 'display_name', 'active', 'created_at',
  'assigned_stores', 'notify_groups', 'oborot_report', 'is_regional'].sort();
const STORES_COLS = ['id', 'name', 'city', 'phone', 'active', 'company_id', 'addr'].sort();
const ALREADY = ['audit_log', 'daily_turnover', 'kasa_documents', 'kasa_glavna', 'kasa_reports',
  'kasa_storno', 'kasa_storno_items', 'kasa_zoborot'];

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const active = lines.filter(l => !/^\s*--/.test(l)).map(l => l.replace(/--.*$/, '')).join('\n').toLowerCase();
  const comments = lines.filter(l => /^\s*--/.test(l)).map(l => l.replace(/^\s*--\s?/, '')).join('\n');
  const stmts = active.split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { raw, active, comments, stmts };
}
// grant select on a, b, c to mirror_reader → ['a','b','c'] (без колонни)
function tableGrants(stmts) {
  return [].concat(...stmts.map(s => s.match(/^grant select on (.+) to mirror_reader$/))
    .filter(Boolean).map(m => m[1].split(',').map(x => x.trim().replace(/^public\./, ''))));
}

/* ── 1. Списъкът ─────────────────────────────────────────────────────── */
section('1. mirror-tables.txt');
const listRaw = fs.readFileSync(LIST, 'utf8');
ok(listRaw.charCodeAt(0) !== 0xFEFF, 'без BOM');
const list = listRaw.split(/\r?\n/).filter(Boolean);
ok(list.length === 93, '93 реда (' + list.length + ')');
ok(new Set(list).size === list.length, 'без повторения');
ok(same(list, list.slice().sort()), 'сортиран');
ok(list.every(t => /^[a-z_][a-z0-9_]*$/.test(t)), 'само имена на таблици');
ok(!list.some(t => /^grafik_|_bak_|_archive_|^backup_snapshots$|^revaluation_unit_counters$/.test(t)),
  'без grafik_*, бекъпи, архиви, revaluation_unit_counters');
ALREADY.concat(['users', 'stores']).forEach(t => ok(list.includes(t), 'в списъка е ' + t));

/* ── 2. Покритие ─────────────────────────────────────────────────────── */
section('2. Трите миграции покриват точно списъка');
const A = parse(ALL_SQL);
const base = parse(path.join(ROOT, 'mirror-reader-schema.sql'));
const audit = parse(path.join(ROOT, 'mirror-reader-audit-log-schema.sql'));
const newFull = tableGrants(A.stmts);
const colGrant = (t) => A.stmts.map(s => s.match(new RegExp('^grant select \\(([^)]*)\\) on public\\.' + t + ' to mirror_reader$')))
  .filter(Boolean).map(m => m[1].split(',').map(x => x.trim()).sort());
const usersCols = colGrant('users');
const storesCols = colGrant('stores');
const newAll = newFull.concat(usersCols.length ? ['users'] : [], storesCols.length ? ['stores'] : []);
const oldAll = tableGrants(base.stmts).concat(tableGrants(audit.stmts));
const covered = Array.from(new Set(oldAll.concat(newAll))).filter(t => t !== 'storage_files_index' && t !== 'storage.objects').sort();
const missing = list.filter(t => !covered.includes(t));
const extra = covered.filter(t => !list.includes(t));
ok(missing.length === 0, 'няма таблица от списъка без SELECT (' + missing.join(', ') + ')');
ok(extra.length === 0, 'няма SELECT извън списъка (' + extra.join(', ') + ')');
ok(newAll.length === new Set(newAll).size, 'новата миграция не дава една таблица два пъти');
ok(!newAll.some(t => ALREADY.includes(t)), 'новата миграция не повтаря осемте вече дадени');
ok(same(newAll.slice().sort(), list.filter(t => !ALREADY.includes(t))), 'новата миграция дава точно останалите ' + (93 - ALREADY.length));

/* ── 3. users / stores ───────────────────────────────────────────────── */
section('3. users и stores — колонно');
ok(!newFull.includes('users') && !newFull.includes('stores'), 'няма пълен grant select на users/stores');
ok(usersCols.length === 1 && same(usersCols[0], USERS_COLS), 'users: точно 11-те безопасни колони');
ok(storesCols.length === 1 && same(storesCols[0], STORES_COLS), 'stores: точно 7-те колони, без pass');
ok(!/\b(password_hash|history_pin_hash|password)\b/.test(A.active), 'хешовете/паролата не се споменават в активния SQL');
ok(!/\bpass\b/.test(A.active), 'stores.pass не се споменава в активния SQL');

/* ── 4. Политики ─────────────────────────────────────────────────────── */
section('4. Политики за таблиците с RLS');
const noRls = A.comments.split('\n').filter(l => /^БЕЗ RLS:/.test(l))
  .map(l => l.replace(/^БЕЗ RLS:/, '').trim().split(/\s+/)).reduce((a, b) => a.concat(b), []).filter(Boolean);
ok(noRls.length === 20 && noRls.every(t => list.includes(t)), '„БЕЗ RLS:“ в коментара — 20 таблици от списъка (' + noRls.length + ')');
const pols = A.stmts.map(s => s.match(/^create policy (\w+) on public\.(\w+) for select to mirror_reader using \((.+)\)$/)).filter(Boolean);
const polTables = pols.map(m => m[2]).sort();
const expPol = newAll.filter(t => !noRls.includes(t)).sort();
ok(same(polTables, expPol), 'политика за всяка нова таблица с RLS, точно ' + expPol.length + ' (' + polTables.length + ')');
ok(pols.every(m => m[1] === 'mirror_reader_select' && m[3].trim() === 'true'), 'всички: mirror_reader_select, using (true)');
ok(!polTables.some(t => noRls.includes(t)), 'няма политика за таблица без RLS');

/* ── 5. Активният SQL ────────────────────────────────────────────────── */
section('5. Нищо друго');
const unknown = A.stmts.filter(s => !/^grant select (\([^)]*\) )?on .+ to mirror_reader$/.test(s) &&
  !/^create policy \w+ on public\.\w+ for select to mirror_reader using \(true\)$/.test(s));
ok(unknown.length === 0, 'само grant select / create policy for select' + (unknown.length ? ' — ' + unknown.join(' | ') : ''));
ok(!/\b(insert|update|delete|truncate|all|references|trigger)\b/.test(A.active), 'никакво insert/update/delete/truncate/all');
ok(!/\b(revoke|alter|drop|create role|create table)\b/.test(A.active), 'няма revoke/alter/drop/create role');
ok(!/\b(anon|authenticated|service_role)\b|\bto public\b/.test(A.active), 'anon/authenticated/service_role/PUBLIC не се пипат');
ok(!/grafik_/.test(A.active), 'grafik_* не се споменава в активния SQL');
ok(!/\bstorage\./.test(A.active), 'storage не се пипа');

/* ── 6. Rollback ─────────────────────────────────────────────────────── */
section('6. Rollback');
const rb = A.comments.slice(A.comments.indexOf('Rollback:')).toLowerCase().replace(/\s+/g, ' ');
ok(A.comments.indexOf('Rollback:') >= 0, 'има секция Rollback');
ok(polTables.every(t => rb.includes('drop policy if exists mirror_reader_select on public.' + t + ';')), 'rollback маха всяка политика');
const rbRevoke = (rb.match(/revoke select on ([^;]+?) from mirror_reader;/) || [, ''])[1].split(',').map(x => x.trim().replace(/^public\./, '')).sort();
ok(same(rbRevoke, newFull.slice().sort()), 'rollback отнема всеки табличен grant');
ok(/revoke select \(id, email[^)]*\) on public\.users from mirror_reader/.test(rb), 'rollback отнема колонния на users');
ok(/revoke select \(id, name[^)]*\) on public\.stores from mirror_reader/.test(rb), 'rollback отнема колонния на stores');

/* ── 7. Скриптът и документацията ────────────────────────────────────── */
section('7. make-mirror-key.js, README, CLAUDE.md');
const M = require(path.join(ROOT, 'tools', 'mirror-key', 'make-mirror-key.js'));
ok(same(M.TABLES.filter(t => t !== 'storage_files_index').sort(), list), 'а) самопроверката минава по mirror-tables.txt');
ok(M.TABLES.includes('storage_files_index'), 'а) и изгледа storage_files_index');
ok(same((M.COLS.users || '').split(',').sort(), USERS_COLS) && same((M.COLS.stores || '').split(',').sort(), STORES_COLS),
  'а) users/stores се четат с колоните от миграцията (select=* там е отказ)');
const fb = M.FORBIDDEN.map(f => f.table + ':' + f.select);
['users:password_hash', 'users:history_pin_hash', 'stores:pass'].forEach(x => ok(fb.includes(x), 'в) пробва ' + x));
ok(M.FORBIDDEN.some(f => /^grafik_/.test(f.table)), 'в) пробва таблица grafik_*');
const readme = fs.readFileSync(path.join(ROOT, 'tools', 'mirror-key', 'README.md'), 'utf8');
ok(/mirror-tables\.txt/.test(readme), 'README споменава mirror-tables.txt');
const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
ok(/mirror-tables\.txt/.test(claude) && /mirror_reader/.test(claude), 'CLAUDE.md: правилото за нова таблица/колона и mirror_reader');

report();
