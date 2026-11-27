/* „📆 График“ — защита (решение на Тенчо 27.11.2026): ПИН за таба (етап Б), ролите в картата
   (етап А) и одитът на четенето (етап В) — браузърната страна. Сървърът (grafik-api) е тестван
   отделно с Deno (supabase/functions/grafik-api/handler.test.ts); тук е макет със същата форма.

   1. Стар сървър (me без pin) — табът работи както досега, без ПИН.
   2. Първо отваряне — „Задай ПИН“: проверки в браузъра (формат, несъвпадение — без заявка),
      отказ от сървъра (лесен) — съобщение; успех → ключът в sessionStorage, me наново, данните
      идват с pin_token.
   3. Въвеждане — грешен (съобщението от сървъра, полето се чисти), верен → данните.
   4. Заключен до нулиране — само съобщение, без поле.
   5. Изтекъл ключ (401 pin_required) — формулярът е на мястото на графика, данните — махнати,
      грешката НЕ се рисува върху формуляра; ключът е махнат.
   6. Бездействие 15 мин → заключване; действие след последната заявка и ключ, който изтича до
      3 мин → pin_touch; без действие — не.
   7. Всеки отговор с pin_token подновява ключа.
   8. Картата в Администрация: ПИН преди картата; колона „ПИН“; „↺ Нулирай“ (с потвърждение,
      не за себе си) → pin_reset { user_id }; отметка „нулира ПИН“ → access_set { can_reset_pin };
      „Смени моя ПИН“ → pin_change; „📜 Кой отваря“ → audit_list и таблица.
   9. Теодор (view + can_reset_pin, без admin) — картата е само „ПИН-ове“, без admin_get, без одита.
  10. „Преглед“ (view) започва от обзора; одитът на печата / файла (log) — при всеки печат и файл.

   Пускане:  node tests/grafik-pin.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;
const ROOT = path.resolve(process.argv[2] || '.');

const MGR = { id: 'u-mgr', email: 'tencho.tenev13@gmail.com', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const ADM = { id: 'u-adm', email: 'ten.tenev@temax.bg', display_name: 'Тенчо', role: 'admin', store_name: 'Централен офис' };
const TEO = { id: 'u-teo', email: 't.tenev@temax.bg', display_name: 'Теодор', role: 'admin', store_name: 'Централен офис' };

/* Макет на grafik-api: ПИН по потребител, ключ = 'tok-<n>', срок — сега + 15 мин. */
function makeServer(opt) {
  opt = opt || {};
  const S = {
    calls: [], seq: 0, valid: {}, legacy: !!opt.legacy,
    pins: Object.assign({}, opt.pins || {}),        // uid → { pin, state }
    kind: opt.kind || {},                            // uid → kind
    access: [
      { id: 'a-adm', list: 'edit', email: ADM.email, note: null },
      { id: 'a-mgr', list: 'edit', email: MGR.email, note: null },
      { id: 'a-teo', list: 'view', email: TEO.email, note: null, can_reset_pin: true },
      { id: 'a-trz', list: 'trz', email: 'trz@temax.bg', note: null }
    ],
    fail: opt.fail || {}
  };
  const issue = () => { const t = 'tok-' + (++S.seq); S.valid[t] = 1; return { pin_token: t, pin_exp: Math.floor(Date.now() / 1000) + 900 }; };
  S.handle = (u, b) => {
    S.calls.push(b);
    if (S.fail[b.action]) return S.fail[b.action](b);
    const kind = S.kind[u.id] || (u.role === 'admin' ? 'admin' : 'manager');
    const p = S.pins[u.id];
    const unlocked = !!b.pin_token && !!S.valid[b.pin_token];
    const meBase = { kind, email: u.email, name: u.display_name, can_admin: kind === 'admin', can_reopen: kind === 'admin', can_approve: kind === 'admin', can_reset_pin: kind === 'admin' || u.id === TEO.id };
    const stores = [{ name: 'Кърджали', can_edit: kind !== 'view' }, { name: 'Шумен', can_edit: kind === 'admin' }];
    if (S.legacy) {                                                   // сървър отпреди етап Б
      if (b.action === 'me') return { status: 200, body: Object.assign({ ok: true, stores }, meBase) };
      return { status: 200, body: { ok: true, month: '2026-11-01', stores: [] } };
    }
    if (['me', 'pin_set', 'pin_unlock'].indexOf(b.action) < 0 && !unlocked) return { status: 401, body: { ok: false, reason: 'pin_required', message: 'Въведи ПИН-а за графика.' } };
    const out = (body) => ({ status: 200, body: Object.assign({ ok: true }, body, unlocked && !body.pin_token ? issue() : {}) });
    switch (b.action) {
      case 'me':
        return out(Object.assign({}, meBase, { unlocked, pin: { state: p ? p.state : 'none', locked_until: p && p.locked_until || null }, stores: unlocked ? stores : [] }));
      case 'pin_set':
        if (/^(\d)\1+$/.test(b.pin) || b.pin === '1234') return { status: 400, body: { ok: false, reason: 'pin_weak', message: 'Твърде лесен ПИН (еднакви или поредни цифри) — избери друг.' } };
        if (p) return { status: 409, body: { ok: false, reason: 'pin_exists', message: 'ПИН-ът вече е зададен — въведи го.' } };
        S.pins[u.id] = { pin: b.pin, state: 'set' };
        return out(Object.assign({ pin_state: 'set' }, issue()));
      case 'pin_unlock':
        if (!p) return { status: 409, body: { ok: false, reason: 'pin_not_set', message: 'Още нямаш ПИН.' } };
        if (p.state === 'blocked') return { status: 423, body: { ok: false, reason: 'pin_blocked', message: 'ПИН-ът е заключен.' } };
        if (b.pin !== p.pin) return { status: 403, body: { ok: false, reason: 'pin_wrong', message: 'Грешен ПИН. Остават 4 опита до 15 мин заключване.', left: 4 } };
        return out(Object.assign({ pin_state: 'set' }, issue()));
      case 'pin_touch': return out({});
      case 'pin_change': return b.old === (p && p.pin) ? (p.pin = b.pin, out({ pin_state: 'set' })) : { status: 403, body: { ok: false, reason: 'pin_wrong', message: 'Грешен ПИН.' } };
      case 'pin_reset': { const t = Object.keys(S.pins).filter(k => k === b.user_id)[0]; if (t) delete S.pins[t]; return out({ reset: !!t, email: 'tencho.tenev13@gmail.com' }); }
      case 'access_list':
        return out({ rows: S.access, pins: Object.keys(S.pins).map(uid => ({ user_id: uid, email: ({ 'u-mgr': MGR.email, 'u-adm': ADM.email, 'u-teo': TEO.email })[uid], state: S.pins[uid].state })) });
      case 'access_set': { const x = S.access.filter(a => a.id === b.id)[0]; if (typeof b.can_reset_pin === 'boolean') x.can_reset_pin = b.can_reset_pin; if (b.role) x.list = b.role; return out({ row: x }); }
      case 'admin_get': return out({ companies: [], grafik_store_company: [], grafik_company_terms: [], grafik_extra_days: [], grafik_letter_map: [], vtrs: [], stores: ['Кърджали'] });
      case 'audit_list': return out({ days: b.days, rows: [
        { id: 2, at: '2026-11-27T09:15:00Z', event: 'grafik_view_month', user_email: TEO.email, grafik_kind: 'view', store_name: 'Кърджали', month: '2026-11', success: true },
        { id: 1, at: '2026-11-27T09:10:00Z', event: 'grafik_view_month', user_email: MGR.email, grafik_kind: 'manager', store_name: 'Шумен', month: '2026-11', success: false }] });
      case 'overview': return out({ month: '2026-11-01', stores: [], no_company: [] });
      case 'log': return out({});
      default: return { status: 404, body: { ok: false, reason: 'not_found', message: 'Няма го в макета (' + b.action + ').' } };
    }
  };
  return S;
}
function env(user, S, opt) {
  opt = opt || {};
  const h = boot({ modules: opt.modules || ['grafik-engine.js', 'grafik.js'], user, data: {}, confirm: opt.confirm === undefined ? true : opt.confirm, globals: { currentSession: 'sess.sig' } });
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/grafik-api') >= 0) {
      const r = S.handle(user, JSON.parse(init.body));
      return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body) });
    }
    return orig.apply(this, arguments);
  };
  h.w.grMonth = '2026-11';
  h.S = S;
  return h;
}
const calls = (h, a) => h.S.calls.filter(c => c.action === a);
const mod = h => h.doc.getElementById('mod-grafik');
async function load(h) { await guard('loadGrafik() не хвърля', () => h.w.loadGrafik()); await ticks(8); }
const ss = h => { try { return JSON.parse(h.w.sessionStorage.getItem('gr-pin') || 'null'); } catch (e) { return 'ГРЕШКА'; } };

(async () => {
  section('1. Стар сървър (без pin в „me“) — табът работи както досега');
  {
    const h = env(MGR, makeServer({ legacy: true }));
    await load(h);
    ok('без ПИН формуляр; продължава към графика', !h.doc.getElementById('gr-pin-mod') && calls(h, 'load_month').length + calls(h, 'overview').length >= 1, h.S.calls.map(c => c.action).join(','));
  }

  section('2. Първо отваряне — „Задай ПИН“');
  {
    const h = env(MGR, makeServer());
    await load(h);
    const box = h.doc.getElementById('gr-pin-mod');
    ok('формулярът за задаване е на мястото на графика', !!box && box.getAttribute('data-state') === 'none' && !!h.doc.getElementById('gr-pin-mod-2') && /Задай личен ПИН/.test(box.textContent));
    ok('без ключ няма заявка за данни', calls(h, 'load_month').length === 0 && calls(h, 'overview').length === 0);
    const set = (a, b) => { h.doc.getElementById('gr-pin-mod-1').value = a; h.doc.getElementById('gr-pin-mod-2').value = b; return realClick(h.w, btn(h.doc.getElementById('gr-pin-mod'), 'Задай')); };
    set('12', '12'); await ticks(4);
    ok('под 4 цифри — съобщение, без заявка', calls(h, 'pin_set').length === 0 && /от 4 до 6 цифри/.test(h.doc.getElementById('gr-pin-mod-msg').textContent));
    set('2580', '2581'); await ticks(4);
    ok('несъвпадащи — съобщение, без заявка', calls(h, 'pin_set').length === 0 && /не съвпадат/.test(h.doc.getElementById('gr-pin-mod-msg').textContent));
    set('1111', '1111'); await ticks(6);
    ok('лесен — отказ от сървъра, текстът му в съобщението', calls(h, 'pin_set').length === 1 && /Твърде лесен/.test(h.doc.getElementById('gr-pin-mod-msg').textContent) && ss(h) === null);
    set('2580', '2580'); await ticks(12);
    const st = calls(h, 'pin_set').slice(-1)[0];
    ok('pin_set { pin } без ключ в тялото', st.pin === '2580' && st.pin_token === undefined, JSON.stringify(st));
    ok('ключът — в sessionStorage', ss(h) && /^tok-/.test(ss(h).tok) && ss(h).exp > Date.now() / 1000);
    ok('„me“ наново, после данните — с pin_token', calls(h, 'me').length >= 2 && (calls(h, 'load_month').concat(calls(h, 'overview'))).some(c => /^tok-/.test(c.pin_token || '')), h.S.calls.map(c => c.action + (c.pin_token ? '+' : '')).join(','));
    ok('формулярът е махнат', !h.doc.getElementById('gr-pin-mod'));
  }

  section('3. Въвеждане — грешен, после верен');
  {
    const h = env(MGR, makeServer({ pins: { 'u-mgr': { pin: '2580', state: 'set' } } }));
    await load(h);
    const box = h.doc.getElementById('gr-pin-mod');
    ok('формуляр „Въведи“ (едно поле, без „още веднъж“)', !!box && box.getAttribute('data-state') === 'set' && !h.doc.getElementById('gr-pin-mod-2') && /нулира администратор/.test(box.textContent));
    h.doc.getElementById('gr-pin-mod-1').value = '9999';
    realClick(h.w, btn(box, 'Отключи')); await ticks(6);
    ok('грешен — съобщението от сървъра, полето е изчистено', /Грешен ПИН\. Остават 4/.test(h.doc.getElementById('gr-pin-mod-msg').textContent) && h.doc.getElementById('gr-pin-mod-1').value === '');
    h.doc.getElementById('gr-pin-mod-1').value = '2580';
    // Enter в полето — същото като бутона.
    h.w.eval('(function(event){' + h.doc.getElementById('gr-pin-mod-1').getAttribute('onkeydown') + '})').call(h.doc.getElementById('gr-pin-mod-1'), { key: 'Enter' });
    await ticks(12);
    ok('Enter → pin_unlock; после данните с ключ', calls(h, 'pin_unlock').length === 2 && calls(h, 'pin_unlock')[1].pin === '2580' && !h.doc.getElementById('gr-pin-mod') && (calls(h, 'load_month').concat(calls(h, 'overview'))).some(c => !!c.pin_token));
  }

  section('4. Заключен до нулиране');
  {
    const h = env(MGR, makeServer({ pins: { 'u-mgr': { pin: '2580', state: 'blocked' } } }));
    await load(h);
    const box = h.doc.getElementById('gr-pin-mod');
    ok('само съобщение — без поле и бутон', !!box && /10 грешни опита/.test(box.textContent) && !h.doc.getElementById('gr-pin-mod-1') && !btn(box, 'Отключи'));
  }

  section('5. Изтекъл ключ на сървъра (401 pin_required) — заключване, без грешка върху формуляра');
  {
    const S = makeServer({ pins: { 'u-mgr': { pin: '2580', state: 'set' } } });
    const h = env(MGR, S);
    await load(h);
    h.doc.getElementById('gr-pin-mod-1').value = '2580'; realClick(h.w, btn(h.doc.getElementById('gr-pin-mod'), 'Отключи')); await ticks(12);
    ok('отключен', !!ss(h) && !h.doc.getElementById('gr-pin-mod'));
    S.valid = {};                                              // сървърът вече не приема ключа
    h.w.grData = { status: 'draft', rows: [] };
    let settled = false;
    h.w.grApi('load_month', { store: 'Кърджали', month: '2026-11' }).then(() => { settled = true; });
    await ticks(8);
    ok('формулярът е на мястото на графика', !!h.doc.getElementById('gr-pin-mod') && /заключен/.test(mod(h).textContent));
    ok('данните — махнати от паметта (grData null)', h.w.grData === null);
    ok('ключът — махнат (и от sessionStorage)', h.w.grPin.tok === null && ss(h) === null);
    ok('обещанието виси — повикващият не рисува грешка върху формуляра', settled === false && !h.doc.getElementById('gr-error'));
  }

  section('6. Бездействие и подновяване');
  {
    const h = env(MGR, makeServer({ pins: { 'u-mgr': { pin: '2580', state: 'set' } } }));
    await load(h);
    h.doc.getElementById('gr-pin-mod-1').value = '2580'; realClick(h.w, btn(h.doc.getElementById('gr-pin-mod'), 'Отключи')); await ticks(12);
    const now = Date.now();
    h.w.grLastAct = now - 60 * 1000;
    h.w.grPin.at = now - 2 * 60 * 1000; h.w.grPin.exp = Math.floor(now / 1000) + 10 * 60;
    const n0 = calls(h, 'pin_touch').length;
    h.w.grIdleTick(now); await ticks(4);
    ok('ключът изтича след 10 мин — без подновяване', calls(h, 'pin_touch').length === n0);
    h.w.grPin.exp = Math.floor(now / 1000) + 120; h.w.grPin.at = now - 13 * 60 * 1000;
    h.w.grIdleTick(now); await ticks(6);
    ok('изтича до 3 мин и има действие след последната заявка → pin_touch', calls(h, 'pin_touch').length === n0 + 1 && /^tok-/.test(calls(h, 'pin_touch').slice(-1)[0].pin_token || ''));
    ok('отговорът подновява ключа', h.w.grPin.exp * 1000 > now + 14 * 60 * 1000 && ss(h).tok === h.w.grPin.tok);
    h.w.grLastAct = now - 3 * 60 * 1000;
    h.w.grPin.exp = Math.floor(now / 1000) + 120; h.w.grPin.at = now - 2 * 60 * 1000;
    h.w.grIdleTick(now); await ticks(4);
    ok('без действие след последната заявка — не подновява', calls(h, 'pin_touch').length === n0 + 1);
    h.w.grLastAct = now - 15 * 60 * 1000;
    h.w.grIdleTick(now); await ticks(4);
    ok('15 мин без действие → заключено, ключът махнат', !!h.doc.getElementById('gr-pin-mod') && h.w.grPin.tok === null && ss(h) === null);
    const n1 = h.S.calls.length;
    h.w.grIdleTick(now + 60000); await ticks(2);
    ok('заключен — тикът не пита сървъра', h.S.calls.length === n1);
  }

  section('7. Ключът от sessionStorage оцелява презареждане на страницата в същия таб');
  {
    const S = makeServer({ pins: { 'u-mgr': { pin: '2580', state: 'set' } } });
    S.valid['tok-keep'] = 1;
    const h = boot({ modules: ['grafik-engine.js'], user: MGR, data: {}, globals: { currentSession: 'sess.sig' } });
    h.w.sessionStorage.setItem('gr-pin', JSON.stringify({ tok: 'tok-keep', exp: Math.floor(Date.now() / 1000) + 600 }));
    h.w.eval(fs.readFileSync(path.join(ROOT, 'grafik.js'), 'utf8'));
    ok('при зареждане grafik.js чете ключа', h.w.grPin.tok === 'tok-keep');
    h.w.sessionStorage.setItem('gr-pin', JSON.stringify({ tok: 'tok-old', exp: Math.floor(Date.now() / 1000) - 5 }));
    h.w.eval('grPin = { tok: null, exp: 0, at: 0 };');
    h.w.eval(fs.readFileSync(path.join(ROOT, 'grafik.js'), 'utf8'));
    ok('изтекъл ключ в sessionStorage — не се взема', h.w.grPin.tok === null);
  }

  section('8. Картата в Администрация — ПИН, колона „ПИН“, нулиране, отметка, смяна, „Кой отваря“');
  {
    const S = makeServer({ pins: { 'u-adm': { pin: '2580', state: 'set' }, 'u-mgr': { pin: '1357', state: 'blocked' } } });
    const h = env(ADM, S, { modules: ['grafik-engine.js', 'grafik.js', 'admin.js'] });
    await guard('grAdminLoad', () => h.w.grAdminLoad()); await ticks(8);
    const card = () => h.doc.getElementById('gr-admin-card');
    ok('без ключ — ПИН формулярът в картата, без access_list', !!h.doc.getElementById('gr-pin-adm') && calls(h, 'access_list').length === 0);
    h.doc.getElementById('gr-pin-adm-1').value = '2580'; realClick(h.w, btn(h.doc.getElementById('gr-pin-adm'), 'Отключи')); await ticks(16);
    ok('след ПИН — картата с ролите', !!h.doc.getElementById('gr-adm-access') && calls(h, 'access_list').length >= 1 && calls(h, 'admin_get').length >= 1);
    const row = e => Array.from(h.doc.querySelectorAll('#gr-adm-access tbody tr')).filter(r => r.getAttribute('data-email') === e)[0];
    ok('колона „ПИН“: управителят — „🔒 заключен“ (червено), Теодор — „— няма“', /🔒 заключен/.test(row(MGR.email).cells[2].textContent) && /— няма/.test(row(TEO.email).cells[2].textContent));
    ok('своят ред — без „↺ Нулирай“', !btn(row(ADM.email), 'Нулирай') && /✔ зададен/.test(row(ADM.email).cells[2].textContent));
    ok('без ПИН — без „↺ Нулирай“', !btn(row(TEO.email), 'Нулирай'));
    realClick(h.w, btn(row(MGR.email), 'Нулирай')); await ticks(10);
    const rs = calls(h, 'pin_reset').slice(-1)[0];
    ok('↺ Нулирай (с потвърждение) → pin_reset { user_id }', !!rs && rs.user_id === 'u-mgr' && h.calls.confirm.some(m => /нулирам ПИН-а за графика на tencho\.tenev13@gmail\.com/.test(m)));
    ok('…и колоната се обновява („— няма“)', /— няма/.test(row(MGR.email).cells[2].textContent));
    const cb = row(MGR.email).querySelector('input.gr-adm-reset-cb');
    cb.checked = true; H.fire(h.w, cb, 'change'); await ticks(10);
    const as = calls(h, 'access_set').slice(-1)[0];
    ok('отметка „нулира ПИН“ → access_set { id, can_reset_pin: true } (без роля)', !!as && as.id === 'a-mgr' && as.can_reset_pin === true && as.role === undefined, JSON.stringify(as));
    ok('своят ред — без отметка', !row(ADM.email).querySelector('input.gr-adm-reset-cb'));
    // Смяна на собствения ПИН.
    h.doc.getElementById('gr-pinch-old').value = '2580'; h.doc.getElementById('gr-pinch-new').value = '3690'; h.doc.getElementById('gr-pinch-new2').value = '3691';
    realClick(h.w, btn(card(), 'Смени')); await ticks(4);
    ok('Смени: новите не съвпадат — без заявка', calls(h, 'pin_change').length === 0 && h.calls.toast.some(t => /не съвпадат/.test(t)));
    h.doc.getElementById('gr-pinch-old').value = '2580'; h.doc.getElementById('gr-pinch-new').value = '3690'; h.doc.getElementById('gr-pinch-new2').value = '3690';
    realClick(h.w, btn(card(), 'Смени')); await ticks(6);
    const pc = calls(h, 'pin_change').slice(-1)[0];
    ok('Смени → pin_change { old, pin }; полетата — изчистени', !!pc && pc.old === '2580' && pc.pin === '3690' && h.doc.getElementById('gr-pinch-old').value === '' && h.calls.toast.some(t => /ПИН-ът е сменен/.test(t)));
    // Кой отваря.
    ok('„📜 Кой отваря“ — не се зарежда сам', calls(h, 'audit_list').length === 0 && /Кой отваря графика/.test(card().textContent));
    h.doc.getElementById('gr-aud-email').value = 'T.Tenev@temax.bg'; h.doc.getElementById('gr-aud-days').value = '7';
    realClick(h.w, btn(card(), 'Покажи')); await ticks(6);
    const al = calls(h, 'audit_list').slice(-1)[0];
    ok('Покажи → audit_list { email, days }', !!al && al.email === 'T.Tenev@temax.bg' && al.days === 7, JSON.stringify(al));
    const tr = h.doc.querySelectorAll('#gr-aud-tbl tbody tr');
    ok('таблица: кой, роля, какво, обект, месец; отказът — червено', tr.length === 2 && /t\.tenev@temax\.bg/.test(tr[0].textContent) && /👁 график/.test(tr[0].textContent) && /отказ/.test(tr[1].textContent) && /dc2626/.test(tr[1].getAttribute('style') || ''));
  }

  section('9. Теодор (view + can_reset_pin) — картата е само „ПИН-ове“');
  {
    const S = makeServer({ kind: { 'u-teo': 'view' }, pins: { 'u-teo': { pin: '2580', state: 'set' }, 'u-mgr': { pin: '1357', state: 'locked' } } });
    const h = env(TEO, S, { modules: ['grafik-engine.js', 'grafik.js', 'admin.js'] });
    await h.w.grAdminLoad(); await ticks(8);
    h.doc.getElementById('gr-pin-adm-1').value = '2580'; realClick(h.w, btn(h.doc.getElementById('gr-pin-adm'), 'Отключи')); await ticks(16);
    const c = h.doc.getElementById('gr-admin-card');
    ok('заглавие „ПИН-ове“; без admin_get, без роли за смяна, без „Кой отваря“, без „Добави“', /ПИН-ове/.test(c.textContent) && calls(h, 'admin_get').length === 0 && !c.querySelector('select') && !h.doc.getElementById('gr-aud-out') && !btn(c, 'Добави'));
    const r = Array.from(c.querySelectorAll('#gr-adm-access tbody tr')).filter(x => x.getAttribute('data-email') === MGR.email)[0];
    ok('заключеният управител — „⏳ заключен 15 мин“ и „↺ Нулирай“', /⏳ заключен 15 мин/.test(r.textContent) && !!btn(r, 'Нулирай'));
    ok('…и „Смени моя ПИН“', !!h.doc.getElementById('gr-pinch-old'));
  }

  section('10. „Преглед“ започва от обзора; печатът и файловете — в одита');
  {
    const S = makeServer({ kind: { 'u-teo': 'view' }, pins: { 'u-teo': { pin: '2580', state: 'set' } } });
    const h = env(TEO, S);
    await load(h);
    h.doc.getElementById('gr-pin-mod-1').value = '2580'; realClick(h.w, btn(h.doc.getElementById('gr-pin-mod'), 'Отключи')); await ticks(16);
    ok('view → обзорът (overview), не графикът на обект', h.w.grView === 'overview' && calls(h, 'overview').length >= 1 && calls(h, 'load_month').length === 0, h.S.calls.map(c => c.action).join(','));
    ok('бутонът „🏬 Обекти“ е позволен за view', h.w.grCanOverview() === true);
    h.w.grStore = 'Кърджали'; h.w.grMonth = '2026-11';
    h.w.grLogOut('export_trz'); await ticks(4);
    const lg = calls(h, 'log').slice(-1)[0];
    ok('grLogOut → log { what, store, month } с ключ', !!lg && lg.what === 'export_trz' && lg.store === 'Кърджали' && lg.month === '2026-11' && !!lg.pin_token);
    const src = fs.readFileSync(path.join(ROOT, 'grafik.js'), 'utf8');
    const fnBody = name => { const i = src.indexOf('function ' + name + '('); return i < 0 ? '' : src.slice(i, src.indexOf('\nfunction ', i + 10)); };
    const pairs = [['grPrintGrafik', 'print_grafik'], ['grPrintPresence', 'print_presence'], ['grPrintChanges', 'print_changes'], ['grExportTrz', 'export_trz'], ['grExportPresence', 'export_presence']];
    pairs.forEach(([fn, what]) => ok(fn + ' пише в одита (' + what + ')', fnBody(fn).indexOf('grLogOut(') >= 0 && fnBody(fn).indexOf("'" + what + "'") >= 0));
  }

  report();
})();
