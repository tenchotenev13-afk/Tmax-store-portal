/* mirror_reader чете и public.audit_log (mirror-reader-audit-log-schema.sql).

   Активният SQL (без коментари):
   - точно два израза: grant select on public.audit_log to mirror_reader и
     create policy … on public.audit_log for select to mirror_reader using (true);
   - никакво insert/update/delete/truncate/all; никакъв revoke/alter/drop;
   - anon/authenticated/service_role/public не се споменават;
   - друга таблица освен public.audit_log не се споменава.
   Rollback-ът (в коментарите) маха политиката и SELECT-а.
   Скриптът tools/mirror-key/make-mirror-key.js проверява audit_log в а).

   ГРАНИЦИ: не вижда базата. Истинската проверка е сверката със
   set local role mirror_reader след миграцията и самопроверката на скрипта.

   Мутационна проверка (26.11.2026) — виж
   claude/log/2026-11-26-mirror-reader-audit-log.md.

   Пускане:  node tests/mirror-reader-audit-log.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;
const ok = (cond, name) => H.ok(name, cond);

const ROOT = path.resolve(process.argv[2] || '.');
const SQL = path.join(ROOT, 'mirror-reader-audit-log-schema.sql');

section('1. mirror-reader-audit-log-schema.sql');
const raw = fs.readFileSync(SQL, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const active = lines.filter(l => !/^\s*--/.test(l)).map(l => l.replace(/--.*$/, '')).join('\n').toLowerCase();
const comments = lines.filter(l => /^\s*--/.test(l)).map(l => l.replace(/^\s*--\s?/, '')).join('\n');
const stmts = active.split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

ok(stmts.length === 2, 'точно два израза (' + stmts.length + ')');
ok(stmts.includes('grant select on public.audit_log to mirror_reader'), 'grant select on public.audit_log to mirror_reader');
ok(stmts.some(s => /^create policy mirror_reader_select on public\.audit_log for select to mirror_reader using \(true\)$/.test(s)),
  'политика FOR SELECT TO mirror_reader using (true) на public.audit_log');
ok(stmts.every(s => /^grant select on public\.audit_log to mirror_reader$/.test(s) ||
  /^create policy \w+ on public\.audit_log for select to mirror_reader using \(true\)$/.test(s)),
  'няма изрази извън двата позволени');
ok(!/\b(insert|update|delete|truncate|all|references|trigger)\b/.test(active), 'никакво insert/update/delete/truncate/all');
ok(!/\b(revoke|alter|drop)\b/.test(active), 'няма revoke/alter/drop в активния SQL');
ok(!/\b(anon|authenticated|service_role|public\s+using|to\s+public)\b/.test(active), 'anon/authenticated/service_role/PUBLIC не се пипат');
const objs = (active.match(/\b(public|storage)\.\w+/g) || []).filter((v, i, a) => a.indexOf(v) === i);
ok(objs.length === 1 && objs[0] === 'public.audit_log', 'единственият обект е public.audit_log (' + objs.join(', ') + ')');
ok(/drop policy if exists mirror_reader_select on public\.audit_log/i.test(comments), 'rollback маха политиката');
ok(/revoke select on public\.audit_log from mirror_reader/i.test(comments), 'rollback отнема SELECT');

section('2. make-mirror-key.js и README');
const M = require(path.join(ROOT, 'tools', 'mirror-key', 'make-mirror-key.js'));
ok(M.TABLES.includes('audit_log'), 'а) в самопроверката е и audit_log');
const readme = fs.readFileSync(path.join(ROOT, 'tools', 'mirror-key', 'README.md'), 'utf8');
ok(/audit_log/.test(readme), 'README споменава audit_log');

report();
