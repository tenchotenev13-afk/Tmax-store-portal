/* mirror_reader — ключ само за четене за огледалото на Живко.

   1. mirror-reader-schema.sql (активният SQL, без коментари):
      - всеки израз е от позволените видове (роля, членство за authenticator,
        usage на схема, select, политика FOR SELECT) — нищо друго;
      - SELECT е ТОЧНО на осемте обекта в public + storage.objects;
        никакво insert/update/delete/all; никакъв grant към друга роля;
      - политиките са само FOR SELECT TO mirror_reader: using (true) за
        седемте таблици, bucket_id = 'kasa-docs' за storage.objects;
      - anon/authenticated не се пипат; rollback-ът трие ролята.
   2. tools/mirror-key/make-mirror-key.js с фалшив fetch:
      - без SUPABASE_JWT_SECRET спира (exit 2), не пише файл, не вика мрежата;
        същото като отделен процес;
      - при успешна самопроверка пише mirror-key.txt; токенът е HS256 с
        role=mirror_reader, exp = +2 години; тайната и токенът НЕ са в изхода;
      - а) чете и audit_log (mirror-reader-audit-log-schema.sql, 26.11.2026);
        от mirror-reader-all-schema.sql (26.11.2026) — всички от
        mirror-tables.txt, users/stores с изброени колони (select=* → 403);
      - в) хешовете в users, stores.pass и grafik_staff → отказ;
      - при всяка провалена проверка (а–д) — exit 1 и НЯМА файл;
      - записи само PATCH/POST към kasa_reports с тяло без редове;
      - PATCH носи реална колона (при '{}' PostgREST връща 204 без UPDATE),
        204 на PATCH → провал;
      - д) е Storage list на docs (docs е публичен — свалянето винаги е 200),
        не сваляне: 0 обекта или 4xx → OK, >0 обекта → провал.
   3. .gitignore съдържа mirror-key.txt.

   ГРАНИЦИ: не вижда базата и не говори с живия проект. Истинската проверка
   е самопроверката при пускане на скрипта от Тенчо и сверката с
   set local role mirror_reader след миграцията.

   Мутационна проверка (25.11.2026) — виж claude/log/2026-11-25-mirror-reader-key.md
   и claude/log/2026-11-25-mirror-key-selfcheck-fix.md.

   Пускане:  node tests/mirror-reader-key.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;
const ok = (cond, name) => H.ok(name, cond);

const ROOT = path.resolve(process.argv[2] || '.');
const SQL = path.join(ROOT, 'mirror-reader-schema.sql');
const SCRIPT = path.join(ROOT, 'tools', 'mirror-key', 'make-mirror-key.js');

const EIGHT = ['daily_turnover', 'kasa_documents', 'kasa_glavna', 'kasa_reports',
  'kasa_storno', 'kasa_storno_items', 'kasa_zoborot', 'storage_files_index'];
const SEVEN = EIGHT.filter(t => t !== 'storage_files_index');
// Колоните на kasa_reports, в които PATCH на самопроверката може да пише
// (сверени в базата 25.11.2026: information_schema.columns).
const KASA_REPORTS_COLS = ['status', 'return_reason', 'confirmed_by', 'ready_by', 'returned_by'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async function () {
  /* ── 1. Схемата ─────────────────────────────────────────────────────── */
  section('1. mirror-reader-schema.sql');
  const raw = fs.readFileSync(SQL, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const active = lines.filter(l => !/^\s*--/.test(l)).map(l => l.replace(/--.*$/, '')).join('\n');
  const comments = lines.filter(l => /^\s*--/.test(l)).map(l => l.replace(/^\s*--\s?/, '')).join('\n');
  const stmts = active.split(';').map(s => s.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);

  const KINDS = [
    ['role', /^create role mirror_reader nologin noinherit$/],
    ['member', /^grant mirror_reader to authenticator( with inherit false, set true)?$/],
    ['usage', /^grant usage on schema (public|storage) to mirror_reader$/],
    ['select', /^grant select on (.+) to mirror_reader$/],
    ['policy', /^create policy (\w+) on ([\w.]+) for select to mirror_reader using \((.+)\)$/],
  ];
  const byKind = {};
  const unknown = [];
  stmts.forEach(s => {
    const k = KINDS.find(([, re]) => re.test(s));
    if (!k) { unknown.push(s); return; }
    (byKind[k[0]] = byKind[k[0]] || []).push(s.match(k[1]));
  });
  ok(unknown.length === 0, 'няма изрази извън позволените видове' + (unknown.length ? ' — ' + unknown.join(' | ') : ''));
  ok((byKind.role || []).length === 1, 'една create role mirror_reader nologin noinherit');
  ok((byKind.member || []).length === 1, 'grant mirror_reader to authenticator — точно веднъж');
  ok(same((byKind.usage || []).map(m => m[1]).sort(), ['public', 'storage']), 'usage само на public и storage');

  const selObjs = [].concat(...(byKind.select || []).map(m => m[1].split(',').map(x => x.trim()))).sort();
  const expSel = EIGHT.map(t => 'public.' + t).concat(['storage.objects']).sort();
  ok(same(selObjs, expSel), 'SELECT точно на осемте + storage.objects (' + selObjs.join(', ') + ')');

  const pols = (byKind.policy || []).map(m => ({ name: m[1], obj: m[2], using: m[3].replace(/\s+/g, '') }));
  const tblPols = pols.filter(p => p.obj !== 'storage.objects');
  ok(same(tblPols.map(p => p.obj).sort(), SEVEN.map(t => 'public.' + t).sort()), 'политика FOR SELECT за всяка от седемте таблици');
  ok(tblPols.every(p => p.using === 'true'), 'политиките за таблиците са using (true)');
  const stPols = pols.filter(p => p.obj === 'storage.objects');
  ok(stPols.length === 1 && stPols[0].using === "bucket_id='kasa-docs'", "storage.objects: една политика, bucket_id = 'kasa-docs'");

  ok(!/\b(insert|update|delete|truncate|all|references|trigger)\b/.test(active.toLowerCase().replace(/--.*$/gm, '')),
    'никакво insert/update/delete/truncate/all в активния SQL');
  ok(!/\b(anon|authenticated|service_role)\b/.test(active.toLowerCase()), 'anon/authenticated/service_role не се споменават в активния SQL');
  ok(!/\b(revoke|alter|drop)\b/.test(active.toLowerCase()), 'няма revoke/alter/drop в активния SQL');
  ok(/drop role mirror_reader/i.test(comments) && /revoke mirror_reader from authenticator/i.test(comments),
    'rollback-ът маха членството и ролята');
  ok(/drop policy if exists mirror_reader_kasa_docs_read on storage\.objects/i.test(comments), 'rollback-ът маха политиката в storage');

  /* ── 2. Скриптът ────────────────────────────────────────────────────── */
  section('2. make-mirror-key.js');
  const M = require(SCRIPT);
  const SECRET = 'test-secret-' + crypto.randomBytes(12).toString('hex');
  const tmpBase = path.join(os.tmpdir(), 'tmax-mirror-key');
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  let dirN = 0;
  const freshDir = () => { const d = path.join(tmpBase, 'd' + (++dirN)); fs.mkdirSync(d); return d; };

  function fakeFetch(over) {
    over = over || {};
    const calls = [];
    const fn = async (url, init) => {
      init = init || {};
      const method = init.method || 'GET';
      calls.push({ url, method, headers: init.headers || {}, body: init.body });
      const u = new URL(url);
      let key, status, json = null, range = null;
      if (u.pathname.startsWith('/rest/v1/')) {
        const t = u.pathname.slice(9);
        const sel = u.searchParams.get('select') || '';
        const forbidden = ['password_hash', 'history_pin_hash', 'pass'].includes(sel) || /^grafik_/.test(t);
        key = method + ' ' + t + (forbidden ? '?' + sel : '');
        if (method !== 'GET') status = 403;
        else if (forbidden) status = 403;
        else if ((t === 'users' || t === 'stores') && sel === '*') status = 403; // колонен grant
        else if (M.TABLES.includes(t)) {
          status = 200; range = '0-0/42';
          if (t === 'storage_files_index') json = [{ name: u.searchParams.get('bucket_id') === 'eq.docs' ? 'a/b.pdf' : 'x/y z.pdf' }];
          else json = [{}];
        } else status = 403;
      } else if (u.pathname.startsWith('/storage/v1/object/authenticated/')) {
        const b = u.pathname.split('/')[5];
        key = 'DL ' + b;
        status = b === 'kasa-docs' ? 200 : 400;
      } else if (u.pathname.startsWith('/storage/v1/object/list/')) {
        key = 'LIST ' + u.pathname.split('/')[5];
        status = 200; json = [];
      } else { key = 'OTHER'; status = 500; }
      if (over[key] !== undefined) {
        const o = over[key];
        if (typeof o === 'object') { status = o.status; if ('json' in o) json = o.json; } else status = o;
      }
      return {
        status,
        headers: { get: h => (h.toLowerCase() === 'content-range' ? range : null) },
        json: async () => json,
        arrayBuffer: async () => new ArrayBuffer(10),
      };
    };
    fn.calls = calls;
    return fn;
  }
  async function run(env, over, dir) {
    const out = [];
    const f = fakeFetch(over);
    const code = await M.main({ env, argv: [dir], fetch: f, log: s => out.push(String(s)), now: Date.UTC(2026, 10, 25, 10, 0, 0) });
    return { code, out: out.join('\n'), calls: f.calls };
  }

  // без тайна
  {
    const dir = freshDir();
    const r = await run({}, {}, dir);
    ok(r.code === 2, 'без SUPABASE_JWT_SECRET → exit 2 (' + r.code + ')');
    ok(r.calls.length === 0, 'без тайна — нула мрежови заявки');
    ok(fs.readdirSync(dir).length === 0, 'без тайна — няма файл');
    const r2 = await run({ SUPABASE_JWT_SECRET: '   ' }, {}, dir);
    ok(r2.code === 2 && fs.readdirSync(dir).length === 0, 'празна тайна (интервали) → exit 2, без файл');
  }
  // като отделен процес
  {
    const dir = freshDir();
    const env = Object.assign({}, process.env);
    delete env.SUPABASE_JWT_SECRET;
    const p = cp.spawnSync(process.execPath, [SCRIPT, dir], { env, encoding: 'utf8', timeout: 30000 });
    ok(p.status === 2, 'процес без тайна → exit 2 (' + p.status + ')');
    ok(fs.readdirSync(dir).length === 0, 'процес без тайна — няма файл');
  }
  // успех
  let token = null;
  {
    const dir = freshDir();
    const r = await run({ SUPABASE_JWT_SECRET: SECRET }, {}, dir);
    ok(r.code === 0, 'всички проверки минават → exit 0 (' + r.code + ')');
    const f = path.join(dir, M.OUT_NAME);
    ok(fs.existsSync(f), 'mirror-key.txt е записан в подадената папка');
    token = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    const parts = token.split('.');
    ok(parts.length === 3, 'файлът съдържа JWT');
    const hdr = JSON.parse(Buffer.from(parts[0] || 'e30', 'base64url').toString());
    const pl = JSON.parse(Buffer.from(parts[1] || 'e30', 'base64url').toString());
    ok(hdr.alg === 'HS256', 'alg HS256');
    const sig = crypto.createHmac('sha256', SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
    ok(sig === parts[2], 'подписът е с тайната от env');
    ok(pl.role === 'mirror_reader' && pl.iss === 'supabase', 'role=mirror_reader, iss=supabase');
    ok(pl.iat === Date.UTC(2026, 10, 25, 10, 0, 0) / 1000 && pl.exp === Date.UTC(2028, 10, 25, 10, 0, 0) / 1000, 'exp = iat + 2 години');
    ok(/25\.11\.2028/.test(r.out), 'датата на изтичане е отпечатана');
    ok(!r.out.includes(SECRET), 'тайната НЕ е в изхода');
    ok(!r.out.includes(token) && !r.out.includes(parts[2]), 'токенът НЕ е в изхода');
    ok(!r.calls.some(c => JSON.stringify(c).includes(SECRET)), 'тайната не излиза в нито една заявка');
    ok(r.calls.every(c => c.headers.Authorization === 'Bearer ' + token), 'всяка заявка е с Authorization: Bearer <ключа>');
    const writes = r.calls.filter(c => c.method !== 'GET' && c.url.includes('/rest/v1/'));
    const stPosts = r.calls.filter(c => c.method !== 'GET' && !c.url.includes('/rest/v1/'));
    ok(stPosts.length === 1 && new URL(stPosts[0].url).pathname === '/storage/v1/object/list/docs', 'извън REST единственият не-GET е Storage list на docs (четене)');
    ok(writes.length === 2 && writes.every(c => /\/rest\/v1\/kasa_reports(\?|$)/.test(c.url)), 'записите са само PATCH/POST към kasa_reports');
    const patch = writes.find(c => c.method === 'PATCH');
    const post = writes.find(c => c.method === 'POST');
    ok(patch && /created_at=lt\.1900-01-01/.test(patch.url), 'PATCH е с филтър, който не хваща ред');
    ok(post && post.body === '[]', 'POST е с празен масив');
    let pb = null; try { pb = JSON.parse(patch && patch.body); } catch (e) { pb = null; }
    ok(patch && patch.body !== '{}' && pb && typeof pb === 'object' && Object.keys(pb).length > 0,
      'PATCH НЕ е с празно тяло (при {} PostgREST връща 204 без UPDATE)');
    ok(pb && Object.keys(pb).every(k => KASA_REPORTS_COLS.includes(k)), 'PATCH тялото е с реални колони на kasa_reports (' + (pb ? Object.keys(pb).join(',') : '-') + ')');
    EIGHT.concat(['audit_log']).forEach(t => ok(r.calls.some(c => c.method === 'GET' && c.url.includes('/rest/v1/' + t + '?select=*')), 'а) GET ' + t));
    ok(r.calls.some(c => c.url.includes('/object/authenticated/kasa-docs/x/y%20z.pdf')), 'б) сваля файл от kasa-docs (пътят е кодиран)');
    ['users?select=password_hash', 'users?select=history_pin_hash', 'stores?select=pass', 'grafik_staff?select=*'].forEach(q =>
      ok(r.calls.some(c => c.url.includes('/rest/v1/' + q + '&')), 'в) пробва ' + q));
    const lst = r.calls.filter(c => new URL(c.url).pathname === '/storage/v1/object/list/docs');
    ok(lst.length === 1 && lst[0].method === 'POST', 'д) Storage list на docs (POST /object/list/docs)');
    let lb = null; try { lb = JSON.parse(lst[0] && lst[0].body); } catch (e) { lb = null; }
    ok(lb && lb.prefix === '', 'д) list е с prefix ""');
    ok(!r.calls.some(c => c.url.includes('/object/authenticated/docs/') || c.url.includes('/object/public/docs/')), 'д) НЕ сваля от docs (публичен — свалянето не доказва нищо)');
  }
  // провал на всяка проверка → без файл
  const FAILS = [
    ['а) kasa_storno 401', { 'GET kasa_storno': 401 }],
    ['а) storage_files_index 403', { 'GET storage_files_index': 403 }],
    ['а) audit_log 403', { 'GET audit_log': 403 }],
    ['а) audit_log 401', { 'GET audit_log': 401 }],
    ['б) сваляне 400', { 'DL kasa-docs': 400 }],
    ['б) няма файл в kasa-docs', { 'GET storage_files_index': { status: 200, json: [] } }],
    ['в) users.password_hash 200', { 'GET users?password_hash': 200 }],
    ['в) users.history_pin_hash 200', { 'GET users?history_pin_hash': 200 }],
    ['в) stores.pass 200', { 'GET stores?pass': 200 }],
    ['в) grafik_staff 200', { 'GET grafik_staff?*': 200 }],
    ['а) users (колони) 403', { 'GET users': 403 }],
    ['а) stores (колони) 403', { 'GET stores': 403 }],
    ['а) weekly_checklist_snapshots 403', { 'GET weekly_checklist_snapshots': 403 }],
    ['г) PATCH 204', { 'PATCH kasa_reports': 204 }],
    ['г) PATCH 200', { 'PATCH kasa_reports': 200 }],
    ['г) POST 201', { 'POST kasa_reports': 201 }],
    ['д) list docs — 1 обект', { 'LIST docs': { status: 200, json: [{ name: 'a.pdf' }] } }],
    ['д) list docs — 3 обекта', { 'LIST docs': { status: 200, json: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } }],
    ['д) list docs — 200 без масив', { 'LIST docs': { status: 200, json: { error: 'x' } } }],
    ['д) list docs — 500', { 'LIST docs': 500 }],
  ];
  for (const [name, over] of FAILS) {
    const dir = freshDir();
    const r = await run({ SUPABASE_JWT_SECRET: SECRET }, over, dir);
    ok(r.code === 1 && fs.readdirSync(dir).length === 0, 'провал „' + name + '" → exit 1, няма файл (' + r.code + ')');
    ok(!r.out.includes(SECRET), 'провал „' + name + '" — тайната не е в изхода');
  }
  // д) отказ 4xx при списъка също е OK; публичното сваляне вече не участва
  for (const [name, over] of [['д) list docs 400', { 'LIST docs': 400 }], ['д) list docs 403', { 'LIST docs': 403 }],
    ['д) сваляне от docs 200 (публичен) — не се пита', { 'DL docs': 200 }]]) {
    const dir = freshDir();
    const r = await run({ SUPABASE_JWT_SECRET: SECRET }, over, dir);
    ok(r.code === 0 && fs.existsSync(path.join(dir, M.OUT_NAME)), '„' + name + '" → exit 0, файлът е записан (' + r.code + ')');
  }
  // мрежова грешка
  {
    const dir = freshDir();
    const out = [];
    const code = await M.main({ env: { SUPABASE_JWT_SECRET: SECRET }, argv: [dir], fetch: async () => { throw new Error('boom ' + SECRET); }, log: s => out.push(s) });
    ok(code === 1 && fs.readdirSync(dir).length === 0, 'мрежова грешка → exit 1, няма файл');
    ok(!out.join('\n').includes(SECRET), 'текстът на грешката не се печата');
  }
  fs.rmSync(tmpBase, { recursive: true, force: true });

  /* ── 3. .gitignore ──────────────────────────────────────────────────── */
  section('3. .gitignore');
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  ok(gi.includes('mirror-key.txt'), '.gitignore съдържа mirror-key.txt');

  report();
})().catch(e => { console.error(e); process.exit(1); });
