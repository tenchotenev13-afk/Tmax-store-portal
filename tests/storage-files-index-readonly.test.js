/* storage_files_index — само за четене за anon и authenticated.

   Чете storage-files-index-readonly-schema.sql и проверява:
     1. активният SQL (без коментари) има точно един revoke върху
        public.storage_files_index — от anon И authenticated, с ТОЧНО шестте
        права insert, update, delete, truncate, references, trigger;
     2. SELECT не се отнема никъде (огледалото на Живко чете изгледа с anon);
     3. не се сменя собственикът и не се слага security_invoker (би спрял
        огледалото — anon няма права върху storage.objects);
     4. rollback-ът (коментиран) връща същите шест права на същите две роли.

   ГРАНИЦИ: не вижда правата в базата — проверката там е has_table_privilege
   след миграцията (описана във файла).

   Мутационна проверка (24.11.2026), всеки мутант срещу този тест:
     - махнат update от revoke-а            — СЪБОРЕН
     - махнат authenticated от revoke-а     — СЪБОРЕН
     - добавен select в revoke-а            — СЪБОРЕН
   Базата преди кръга: exit 0.

   Пускане:  node tests/storage-files-index-readonly.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;
const ok = (cond, name) => H.ok(name, cond);  // harness: ok(name, cond)

const ROOT = path.resolve(process.argv[2] || '.');
const FILE = path.join(ROOT, 'storage-files-index-readonly-schema.sql');
const SIX = ['delete', 'insert', 'references', 'trigger', 'truncate', 'update'];
const ROLES = ['anon', 'authenticated'];

const raw = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const active = lines.filter(l => !/^\s*--/.test(l)).map(l => l.replace(/--.*$/, '')).join('\n');
const comments = lines.filter(l => /^\s*--/.test(l)).map(l => l.replace(/^\s*--\s?/, '')).join('\n');

function stmts(sql) {
  return sql.split(';').map(s => s.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
}
function parse(s, verb, prep) {
  const re = new RegExp('^' + verb + ' (.+?) on (?:table )?([\\w.]+) ' + prep + ' (.+)$');
  const m = s.match(re);
  if (!m) return null;
  return {
    privs: m[1].split(',').map(x => x.trim()).sort(),
    obj: m[2],
    roles: m[3].split(',').map(x => x.trim()).sort(),
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('1. revoke-ът');
const act = stmts(active);
const revokes = act.map(s => parse(s, 'revoke', 'from')).filter(Boolean)
  .filter(r => /(^|\.)storage_files_index$/.test(r.obj));
ok(revokes.length === 1, 'точно един revoke върху storage_files_index (' + revokes.length + ')');
const r = revokes[0] || { privs: [], roles: [], obj: '' };
ok(r.obj === 'public.storage_files_index', 'обектът е public.storage_files_index (' + r.obj + ')');
ok(same(r.roles, ROLES), 'ролите са anon и authenticated (' + r.roles.join(', ') + ')');
ok(same(r.privs, SIX), 'правата са точно шестте (' + r.privs.join(', ') + ')');
ok(act.length === 1, 'няма друг активен оператор (' + act.length + ')');

section('2. SELECT не се отнема');
ok(!act.some(s => /^revoke\b/.test(s) && /\b(select|all)\b/.test(s.split(' on ')[0])),
  'никой revoke не съдържа select / all');

section('3. собственик и security_invoker не се пипат');
ok(!/owner\s+to/i.test(active), 'без owner to');
ok(!/security_invoker/i.test(active), 'без security_invoker');
ok(!/\bgrant\b/i.test(active), 'без активен grant');

section('4. rollback');
const flat = comments.replace(/\s+/g, ' ').toLowerCase();
const rb = Array.from(flat.matchAll(/\bgrant ([a-z, ]+?) on (?:table )?([\w.]+) to ([a-z_, ]+);/g))
  .map(m => parse(m[0].replace(/;$/, ''), 'grant', 'to')).filter(Boolean)
  .filter(g => g.obj === 'public.storage_files_index');
ok(rb.length === 1, 'един коментиран grant за rollback (' + rb.length + ')');
const g = rb[0] || { privs: [], roles: [] };
ok(same(g.privs, SIX), 'rollback връща шестте права');
ok(same(g.roles, ROLES), 'rollback е за anon и authenticated');

report();
