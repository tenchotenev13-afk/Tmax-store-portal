/* kasa-etap2-schema.sql — Каса, етап 2 (26.11.2026, сесия kasa-etap2).

   Без база: малък симулатор на правата (таблица + колонен SELECT + политики
   на storage.objects) изпълнява миграцията и после rollback-а върху
   състоянието, СВЕРЕНО в базата на 26.11.2026, и проверява:
     1. Всеки ред в двете части е разпознат (непознат ред → тестът пада, вкл.
        ред за mirror_reader или за друга таблица).
     2. След миграцията: за anon и authenticated — точно правата и колоните от
        решението (фаза 0 + решения 26.11); mirror_reader — непокътнат;
        остава само kasa_docs_upload (+ mirror_reader_kasa_docs_read).
     3. Rollback-ът връща ТОЧНО началното състояние (ACL, колони, политики —
        дословно, по дефиниция).
     4. Колоните с колонен SELECT покриват ВСЕКИ филтър, с който браузърът
        пише (sbPatch / kasaUpsert / суров fetch PATCH в kasa.js,
        kasa-docs.js, daily-turnover.js) — нова колона във филтър без grant
        тук би дала 42501 след миграцията. Обратното: grant без филтър в кода
        също пада (излишно отворена колона).
     5. Браузърът не пише в kasa_storno_items и не ползва sbPostReturn
        (return=representation иска SELECT на всички колони) за седемте.

   Мутационна проверка (26.11.2026) — виж claude/log/2026-11-26-kasa-etap2.md.

   Пускане:  node tests/kasa-etap2-schema.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = path.resolve(process.argv[2] || '.');
const FILE = path.join(ROOT, 'kasa-etap2-schema.sql');
const SQL = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';

const TABLES = ['kasa_reports', 'kasa_glavna', 'kasa_zoborot', 'kasa_documents', 'kasa_storno', 'kasa_storno_items', 'daily_turnover'];
const ROLES = ['anon', 'authenticated', 'mirror_reader'];
const LETTER = { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain' };
const ALL = ['insert', 'select', 'update', 'delete', 'truncate', 'references', 'trigger', 'maintain'];
const acl = s => new Set(s.split('').map(c => LETTER[c]));

/* Състоянието в базата, 26.11.2026 (relacl, attacl, pg_policies). */
function start() {
  const st = { tbl: {}, col: {}, pol: {} };
  TABLES.forEach(t => {
    const del = t === 'kasa_storno' || t === 'kasa_storno_items';
    st.tbl[t] = { anon: acl(del ? 'arwdDxtm' : 'arwDxtm'), authenticated: acl(del ? 'arwdDxtm' : 'arwDxtm'), mirror_reader: acl('r') };
    st.col[t] = { anon: new Set(), authenticated: new Set(), mirror_reader: new Set() };
  });
  const p = (cmd, role, using) => 'as permissive for ' + cmd + ' to ' + role + ' using (' + using + ')';
  st.pol = {
    kasa_docs_read: p('select', 'anon', "bucket_id = 'kasa-docs'::text"),
    kasa_docs_sign: p('select', 'anon', "bucket_id = 'kasa-docs'::text"),
    kasa_docs_delete: p('delete', 'anon', "bucket_id = 'kasa-docs'::text"),
    kasa_docs_upload: 'as permissive for insert to anon with check (bucket_id = \'kasa-docs\'::text)',
    mirror_reader_kasa_docs_read: p('select', 'mirror_reader', "bucket_id = 'kasa-docs'::text"),
  };
  return st;
}
function snap(st) {
  const o = {};
  TABLES.forEach(t => ROLES.forEach(r => {
    o[t + '.' + r] = Array.from(st.tbl[t][r]).sort().join(',') + ' | cols:' + Array.from(st.col[t][r]).sort().join(',');
  }));
  Object.keys(st.pol).sort().forEach(k => { o['policy.' + k] = st.pol[k]; });
  return o;
}

/* Изпълнява редовете; връща списък непознати. */
function run(st, lines) {
  const bad = [];
  const privs = s => s.trim() === 'all' ? ALL.slice() : s.split(',').map(x => x.trim());
  const roles = s => s.split(',').map(x => x.trim());
  lines.forEach(line => {
    let m;
    if ((m = /^revoke ([a-z, ]+) on public\.([a-z_]+) from ([a-z_, ]+);$/.exec(line))) {
      const t = m[2]; if (!st.tbl[t]) { bad.push(line); return; }
      roles(m[3]).forEach(r => {
        if (r === 'mirror_reader' || !st.tbl[t][r]) { bad.push(line); return; }
        privs(m[1]).forEach(p => { st.tbl[t][r].delete(p); if (p === 'select') st.col[t][r].clear(); });
      });
    } else if ((m = /^grant ([a-z, ]+) on public\.([a-z_]+) to ([a-z_, ]+);$/.exec(line))) {
      const t = m[2]; if (!st.tbl[t]) { bad.push(line); return; }
      roles(m[3]).forEach(r => {
        if (r === 'mirror_reader' || !st.tbl[t][r]) { bad.push(line); return; }
        privs(m[1]).forEach(p => st.tbl[t][r].add(p));
      });
    } else if ((m = /^(grant|revoke) select \(([a-z_, ]+)\) on public\.([a-z_]+) (to|from) ([a-z_, ]+);$/.exec(line))) {
      const t = m[3]; if (!st.tbl[t]) { bad.push(line); return; }
      roles(m[5]).forEach(r => {
        if (r === 'mirror_reader' || !st.tbl[t][r]) { bad.push(line); return; }
        m[2].split(',').map(x => x.trim()).forEach(c => (m[1] === 'grant' ? st.col[t][r].add(c) : st.col[t][r].delete(c)));
      });
    } else if ((m = /^drop policy ([a-z_]+) on storage\.objects;$/.exec(line))) {
      if (!st.pol[m[1]] || /mirror_reader/.test(m[1])) { bad.push(line); return; }
      delete st.pol[m[1]];
    } else if ((m = /^create policy ([a-z_]+) on storage\.objects (as permissive for [a-z]+ to [a-z_]+ (using|with check) \(.+\));$/.exec(line))) {
      st.pol[m[1]] = m[2];
    } else bad.push(line);
  });
  return bad;
}

const parts = SQL.split(/^-- ROLLBACK.*$/m);
const UP = (parts[0] || '').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
const DOWN = (parts[1] || '').split('\n').map(s => s.trim()).filter(s => s.startsWith('-- ')).map(s => s.slice(3).trim()).filter(s => /^(grant|revoke|create|drop)\b/.test(s));

section('1. Файлът и разпознаването');
ok('kasa-etap2-schema.sql съществува', !!SQL);
ok('има секция ROLLBACK', parts.length === 2);
const st = start();
const badUp = run(st, UP);
ok('всеки ред на миграцията е разпознат (без mirror_reader, без чужди таблици)', badUp.length === 0, badUp.join(' || '));
ok('mirror_reader не се споменава в изпълнимите редове', !UP.concat(DOWN).some(l => /mirror_reader/.test(l)));
ok('миграцията няма create policy / disable rls / alter', !UP.some(l => /^(create|alter|disable)/.test(l)));

section('2. Състоянието след миграцията');
const WANT_COLS = {
  kasa_reports: ['id'], kasa_glavna: ['date', 'id', 'status', 'store_name'], kasa_zoborot: ['date', 'id', 'status', 'store_name'],
  kasa_storno: ['id'], daily_turnover: ['id'], kasa_documents: [], kasa_storno_items: [],
};
const WANT_TBL = {
  kasa_reports: 'insert,maintain,update', kasa_glavna: 'insert,maintain,update', kasa_zoborot: 'insert,maintain,update',
  kasa_storno: 'insert,maintain,update', daily_turnover: 'insert,maintain,update',
  kasa_documents: 'insert', kasa_storno_items: '',
};
TABLES.forEach(t => ['anon', 'authenticated'].forEach(r => {
  ok(t + ' / ' + r + ': права на таблицата = ' + (WANT_TBL[t] || 'нищо'), Array.from(st.tbl[t][r]).sort().join(',') === WANT_TBL[t], Array.from(st.tbl[t][r]).sort().join(','));
  ok(t + ' / ' + r + ': колонен SELECT = ' + (WANT_COLS[t].join(',') || 'нищо'), Array.from(st.col[t][r]).sort().join(',') === WANT_COLS[t].join(','), Array.from(st.col[t][r]).sort().join(','));
  ok(t + ' / ' + r + ': без SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER на таблицата', ['select', 'delete', 'truncate', 'references', 'trigger'].every(p => !st.tbl[t][r].has(p)));
}));
TABLES.forEach(t => ok(t + ' / mirror_reader: непокътнат (само select)', Array.from(st.tbl[t].mirror_reader).join(',') === 'select' && st.col[t].mirror_reader.size === 0));
ok('storage: остават само kasa_docs_upload и mirror_reader_kasa_docs_read',
  Object.keys(st.pol).sort().join(',') === 'kasa_docs_upload,mirror_reader_kasa_docs_read', Object.keys(st.pol).join(','));
const firstGrantCol = UP.findIndex(l => /^grant select \(/.test(l));
const lastRevoke = UP.map((l, i) => /^revoke /.test(l) ? i : -1).filter(i => i >= 0);
TABLES.forEach(t => {
  const iRev = UP.findIndex(l => new RegExp('^revoke .* on public\\.' + t + ' ').test(l));
  const iGr = UP.findIndex(l => new RegExp('^grant select \\(.*\\) on public\\.' + t + ' ').test(l));
  if (iGr >= 0) ok(t + ': revoke ПРЕДИ grant select (колони) — revoke на таблица маха и колонните', iRev >= 0 && iRev < iGr);
});
ok('(проверка на реда има смисъл: има колонни grant-ове)', firstGrantCol >= 0 && lastRevoke.length > 0);

section('3. Rollback → точно началното състояние');
const badDown = run(st, DOWN);
ok('всеки ред на rollback-а е разпознат', badDown.length === 0, badDown.join(' || '));
const a = snap(st), b = snap(start());
const diff = Object.keys(Object.assign({}, a, b)).filter(k => a[k] !== b[k]);
ok('след rollback ACL, колони и политики = 26.11.2026', diff.length === 0, diff.map(k => k + ': ' + a[k] + ' ≠ ' + b[k]).join(' || '));
ok('rollback-ът има ред за всяка от трите политики', ['kasa_docs_read', 'kasa_docs_sign', 'kasa_docs_delete'].every(n => DOWN.some(l => l.indexOf('create policy ' + n + ' ') === 0)));

section('4. Колоните покриват филтрите на записите в кода');
/* Филтър на запис → колоните в него (литерали + проследени променливи в
   същата функция). */
function fnBody(src, idx) {
  const re = /\nfunction\s+[A-Za-z0-9_$]+\s*\(/g; let m, s = 0;
  while ((m = re.exec(src)) && m.index < idx) s = m.index;
  const next = src.indexOf('\nfunction ', idx);
  return src.slice(s, next < 0 ? src.length : next);
}
function argAt(src, i) { /* текстът на аргумента от позиция i до запетая/скоба на ниво 0 */
  let d = 0, q = null, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) break; d--; }
    else if (c === ',' && d === 0) break;
  }
  return src.slice(i, j);
}
function colsOf(expr, body, seen) {
  seen = seen || {};
  const out = new Set();
  (expr.match(/([a-z_]+)=(eq|in|gte|lte|neq|is)\./g) || []).forEach(s => out.add(s.split('=')[0]));
  const ids = (expr.replace(/'[^']*'|"[^"]*"/g, '').match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) || []);
  ids.forEach(id => {
    if (seen[id]) return; seen[id] = 1;
    const m = new RegExp('\\b(?:var\\s+)?' + id.replace(/\$/g, '\\$') + '\\s*=\\s*([^;]+);').exec(body);
    if (m && /=(eq|in|gte|lte)\./.test(m[1])) colsOf(m[1], body, seen).forEach(c => out.add(c));
  });
  return out;
}
const used = {}; const sites = [];
const addUse = (t, c, where) => { (used[t] = used[t] || new Set()).add(c); };
['kasa.js', 'kasa-docs.js', 'daily-turnover.js', 'history.js', 'notifications.js', 'report.js', 'today.js', 'shared.js'].forEach(f => {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  const re = /\b(sbPatch|kasaUpsert)\(\s*'([a-z_]+)'\s*,\s*/g; let m;
  while ((m = re.exec(src))) {
    if (TABLES.indexOf(m[2]) < 0) continue;
    const expr = argAt(src, re.lastIndex);
    const cols = colsOf(expr, fnBody(src, m.index));
    sites.push(f + ' ' + m[1] + ' ' + m[2] + ' [' + Array.from(cols).join(',') + ']');
    if (!cols.size) ok(f + ': филтърът на ' + m[1] + '(' + m[2] + ') е разпознат', false, expr);
    cols.forEach(c => addUse(m[2], c));
  }
  const raw = /fetch\(\s*API\s*\+\s*'\/([a-z_]+)\?([^']*)'/g;
  while ((m = raw.exec(src))) {
    if (TABLES.indexOf(m[1]) < 0) continue;
    const near = src.slice(m.index, m.index + 300);
    ok(f + ': суров fetch към ' + m[1] + ' е PATCH с return=minimal', /method:'PATCH'/.test(near) && /return=minimal/.test(near));
    colsOf(m[2], '').forEach(c => addUse(m[1], c));
    sites.push(f + ' fetch ' + m[1] + ' [' + Array.from(colsOf(m[2], '')).join(',') + ']');
  }
});
ok('намерени са записите с филтър (W1–W23: поне 20 места)', sites.length >= 20, sites.length + ': ' + sites.join(' ; '));
TABLES.forEach(t => {
  const u = Array.from(used[t] || []).sort().join(',');
  ok(t + ': колоните във филтрите (' + (u || 'нищо') + ') = колонният SELECT', u === WANT_COLS[t].join(','), 'филтри: ' + u + ' · grant: ' + WANT_COLS[t].join(','));
});

section('5. Браузърът не пише в kasa_storno_items и не иска representation');
const allJs = fs.readdirSync(ROOT).filter(f => /\.js$/.test(f));
const offenders = [];
allJs.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/\b(sbPost|sbPostReturn|sbPatch|sbDelete|kasaUpsert)\(\s*'kasa_storno_items'/.test(src)) offenders.push(f + ': запис в kasa_storno_items');
  if (/\bsbDelete\(\s*'kasa_storno'/.test(src)) offenders.push(f + ': sbDelete kasa_storno');
  const rr = /\bsbPostReturn\(\s*'([a-z_]+)'/g; let m;
  while ((m = rr.exec(src))) if (TABLES.indexOf(m[1]) >= 0) offenders.push(f + ': sbPostReturn ' + m[1]);
  if (/\/rest\/v1\/kasa_storno_items/.test(src)) offenders.push(f + ': URL към kasa_storno_items');
});
ok('нула места', offenders.length === 0, offenders.join(' ; '));

section('6. Качване в kasa-docs — без upsert (остава само INSERT политика)');
const kdSrc = fs.readFileSync(path.join(ROOT, 'kasa-docs.js'), 'utf8');
const ups = kdSrc.match(/'x-upsert'\s*:\s*'[a-z]+'/g) || [];
ok("kasa-docs.js: точно един 'x-upsert' и той е 'false'", ups.length === 1 && /'false'/.test(ups[0]), ups.join(', '));

report();
