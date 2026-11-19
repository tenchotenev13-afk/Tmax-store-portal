/* bulletin-notify, тема loading_lists_pending — смята и назовава КАТО ПОРТАЛА
   (v25, 19.11.2026, сесия bulletin-notify-ll).

   „Чакащ" ред = received=false И missing=false И wrong_store is null — същото
   като llHandled() в loading.js (received || missing || wrong_store) и като
   notifLoadingListsPending() в notifications.js (&wrong_store=is.null от
   17.11.2026). Единицата се назовава като llKindLabel() + LL_KIND_WORD:
   „палет / руло / извънгабаритен N от M", без номер — само думата, „насип".

   Пуска се РЕАЛНИЯТ .ts — срез от началото на файла до края на последната
   нужна функция (техниката на notify-today-window / minusi-notify-sync),
   импортиран от Node 24 направо като .ts. buildLoadingListsPending върви
   срещу фалшив клиент, който ПРИЛАГА филтрите eq / lt / in / is — тоест
   проверява се и самата заявка, не само постобработката. Порталната страна е
   истинският loading.js в jsdom.

   ФИКСТУРИ (всички листи — sent, изпратени преди 3 дни):
     L1 Петрич: P1 чакащ палет 1/2, P2 палет 2/2 получен, P3 руло 1/1 за друг
        обект, P4 извънгабаритен 1/1 чакащ, P5 насип чакащ, P6 неполучен
        → смесена двойка: чакат P1, P4, P5 (3 реда).
     L1 Габрово: G1 и G2 — само за друг обект → двойката НЕ влиза.
     L2 Шумен: S1 руло 2/3 чакащ, S2 палет без номер чакащ → 2 реда.
     L3 (изпратен преди 10 ч — под 48 ч): T1 чакащ → не влиза.
   Очаквано: 2 двойки (L1|Петрич, L2|Шумен), 5 реда.

   МУТАЦИОННА ПРОВЕРКА (19.11.2026), всеки вариант срещу този тест:
     M1 махнато .is('wrong_store', null)              — СЪБОРЕН
     M2 рулото пак „рула" без номер                    — СЪБОРЕН
     M3 махнат oversize от LOADING_KIND_WORD           — СЪБОРЕН
     M4 писмото без „за друг обект" в бележката горе   — СЪБОРЕН
   Неубити: няма. Базата преди кръга: exit 0.
   Срещу index.ts от eec779a (v23, преди поправката): 10 ✅ / 22 ❌ —
   Габрово влиза, P3 се брои, „рула", „oversize", текстът без „за друг обект".

   Пускане:  node tests/bulletin-notify-loading-pending.test.js . */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');

/* ── Срез от реалния .ts ─────────────────────────────────────────────── */
function endOfFn(lines, start) {
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const bare = lines[i]
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const ch of bare) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth === 0) return i; }
    }
  }
  return lines.length - 1;
}
const REQUIRED = ['buildLoadingListsPending', 'loadingUnitLabel', 'loadingPendingHtmlFor'];
function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const missing = [];
  let end = -1;
  for (const fn of REQUIRED) {
    const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l));
    if (s < 0) { missing.push(fn); continue; }
    end = Math.max(end, endOfFn(lines, s));
  }
  if (missing.length) throw new Error('липсват във файла: ' + missing.join(', '));
  const head = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  const out = head + '\nexport { ' + REQUIRED.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-bn-loading-pending');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фикстури ────────────────────────────────────────────────────────── */
const hoursAgo = h => new Date(Date.now() - h * 3600 * 1000).toISOString();
const LISTS = [
  { id: 'L1', warehouse: 'Логистичен склад Търговище', list_date: '2026-11-16', status: 'sent', sent_at: hoursAgo(72), executed_by: 'Иван' },
  { id: 'L2', warehouse: 'Логистичен склад Добрич', list_date: '2026-11-15', status: 'sent', sent_at: hoursAgo(80), executed_by: '' },
  { id: 'L3', warehouse: 'Логистичен склад Добрич', list_date: '2026-11-19', status: 'sent', sent_at: hoursAgo(10), executed_by: '' },
  { id: 'L4', warehouse: 'Логистичен склад Добрич', list_date: '2026-11-10', status: 'done', sent_at: hoursAgo(200), executed_by: '' }
];
function it_(id, list, store, kind, no, total, o) {
  return Object.assign({ id: id, list_id: list, store_name: store, kind: kind, pallet_no: no, pallet_total: total,
    purchase_doc: 'D-' + id, position: Number(id.replace(/\D/g, '')) || 0,
    received: false, missing: false, wrong_store: null }, o || {});
}
const ITEMS = [
  it_('P1', 'L1', 'Петрич', 'pallet', 1, 2),
  it_('P2', 'L1', 'Петрич', 'pallet', 2, 2, { received: true }),
  it_('P3', 'L1', 'Петрич', 'roll', 1, 1, { wrong_store: 'Гоце Делчев' }),
  it_('P4', 'L1', 'Петрич', 'oversize', 1, 1),
  it_('P5', 'L1', 'Петрич', 'bulk', null, null),
  it_('P6', 'L1', 'Петрич', 'pallet', 3, 3, { missing: true }),
  it_('G1', 'L1', 'Габрово', 'pallet', 1, 2, { wrong_store: 'Севлиево' }),
  it_('G2', 'L1', 'Габрово', 'roll', 1, 1, { wrong_store: 'Севлиево' }),
  it_('S1', 'L2', 'Шумен', 'roll', 2, 3),
  it_('S2', 'L2', 'Шумен', 'pallet', null, null),
  it_('T1', 'L3', 'Русе', 'pallet', 1, 1),
  it_('X1', 'L4', 'Русе', 'pallet', 1, 1)
];

/* ── Фалшив supabase клиент — прилага eq / lt / in / is ──────────────── */
function fakeSb(data, log) {
  const pass = (row, f) => {
    if (f[0] === 'eq') return row[f[1]] === f[2];
    if (f[0] === 'lt') return String(row[f[1]]) < String(f[2]);
    if (f[0] === 'in') return f[2].indexOf(row[f[1]]) >= 0;
    if (f[0] === 'is') return f[2] === null ? (row[f[1]] === null || row[f[1]] === undefined) : row[f[1]] === f[2];
    return true;
  };
  return {
    from(table) {
      const q = { table: table, filters: [], select: null };
      log.push(q);
      const self = {
        select(s) { q.select = s; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        lt(c, v) { q.filters.push(['lt', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        is(c, v) { q.filters.push(['is', c, v]); return self; },
        then(res, rej) {
          const rows = (data[table] || []).filter(r => q.filters.every(f => pass(r, f))).map(r => Object.assign({}, r));
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        }
      };
      return self;
    }
  };
}

(async function () {
  let mod = null;
  section('Срезът от index.ts');
  try { mod = await import(pathToFileURL(buildModule()).href); ok('срезът се импортира', !!mod); }
  catch (e) { ok('срезът се импортира', false, e.message); report(); return; }

  /* Порталът — истинският loading.js. */
  const h = boot({ modules: ['loading.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const w = h.w;

  section('Кой ред е чакащ — заявката и двойките');
  const log = [];
  const res = await mod.buildLoadingListsPending(fakeSb({ loading_lists: LISTS, loading_list_items: ITEMS }, log), {});
  const entries = (res && res.entries) || [];
  const keys = entries.map(e => e.ref_key).sort();
  ok('2 двойки: L1|Петрич и L2|Шумен', JSON.stringify(keys) === JSON.stringify(['L1|Петрич', 'L2|Шумен']), JSON.stringify(keys));
  ok('Габрово (само „за друг обект") отпада изцяло', keys.indexOf('L1|Габрово') < 0);
  const pet = entries.find(e => e.ref_key === 'L1|Петрич');
  ok('смесена двойка брои само чакащите: P1, P4, P5', pet && pet.rows.map(r => r.id).join() === 'P1,P4,P5', pet && pet.rows.map(r => r.id).join());
  ok('редът с wrong_store (P3) не е сред тях', pet && !pet.rows.some(r => r.id === 'P3'));
  ok('общо 5 реда', entries.reduce((a, e) => a + e.rows.length, 0) === 5);
  const iq = log.find(q => q.table === 'loading_list_items');
  ok('заявката носи wrong_store is null', iq && iq.filters.some(f => f[0] === 'is' && f[1] === 'wrong_store' && f[2] === null), JSON.stringify(iq && iq.filters));
  ok('select-ът носи pallet_no и pallet_total', iq && /pallet_no/.test(iq.select) && /pallet_total/.test(iq.select), iq && iq.select);

  /* Само wrong_store навсякъде → нищо за напомняне. */
  const onlyWrong = ITEMS.filter(r => r.list_id === 'L1' && r.store_name === 'Габрово');
  const res2 = await mod.buildLoadingListsPending(fakeSb({ loading_lists: LISTS, loading_list_items: onlyWrong }, []), {});
  ok('само „за друг обект" редове → skip, без двойки', !!(res2 && res2.skip) && !res2.entries, JSON.stringify(res2));

  section('Синхрон с портала: llHandled()');
  /* Същият набор редове: всеки ред на изпратен лист над 48 ч е чакащ в
     известието ТОЧНО когато llHandled() в портала казва „не е обработен". */
  const eligible = ITEMS.filter(r => r.list_id === 'L1' || r.list_id === 'L2');
  const portalPending = eligible.filter(r => !w.llHandled(r)).map(r => r.id).sort();
  const edgePending = [].concat(...entries.map(e => e.rows.map(r => r.id))).sort();
  ok('известието и порталът дават един и същ набор', JSON.stringify(portalPending) === JSON.stringify(edgePending),
    'портал ' + portalPending.join() + ' | известие ' + edgePending.join());

  section('Етикетите — като llKindLabel() в портала');
  const CASES = [
    [{ kind: 'pallet', pallet_no: 1, pallet_total: 2 }, 'палет 1 от 2'],
    [{ kind: 'pallet', pallet_no: null, pallet_total: null }, 'палет'],
    [{ kind: 'roll', pallet_no: 2, pallet_total: 3 }, 'руло 2 от 3'],
    [{ kind: 'roll', pallet_no: null, pallet_total: null }, 'руло'],
    [{ kind: 'oversize', pallet_no: 1, pallet_total: 1 }, 'извънгабаритен 1 от 1'],
    [{ kind: 'oversize', pallet_no: null, pallet_total: null }, 'извънгабаритен'],
    [{ kind: 'bulk', pallet_no: null, pallet_total: null }, 'насип'],
    [{ kind: 'carton', pallet_no: null, pallet_total: null }, 'carton']
  ];
  CASES.forEach(([r, want]) => {
    const got = mod.loadingUnitLabel(r);
    ok(r.kind + (r.pallet_no ? ' с номер' : ' без номер') + ' → „' + want + '"', got === want, got);
    ok('  и същото като портала', got === w.llKindLabel(r), w.llKindLabel(r));
  });
  ok('никъде „рула"', CASES.every(([r]) => mod.loadingUnitLabel(r) !== 'рула'));

  section('Писмото');
  const html = mod.loadingPendingHtmlFor(entries, { dateStr: '2026-11-19' });
  ok('бележката горе казва и „за друг обект"', /„неполучен" или „за друг обект", НЕ влиза тук/.test(html));
  ok('долният ред включва „🔀 За друг обект"', /„✅ Получено", „⛔ Неполучено" или „🔀 За друг обект"/.test(html));
  ok('руло с номер в писмото: „руло 2 от 3"', html.indexOf('руло 2 от 3') >= 0);
  ok('извънгабаритен в писмото: „извънгабаритен 1 от 1"', html.indexOf('извънгабаритен 1 от 1') >= 0);
  ok('без суровото „oversize" и без „рула"', html.indexOf('oversize') < 0 && html.indexOf('рула') < 0);

  h.close();
  report();
})();
