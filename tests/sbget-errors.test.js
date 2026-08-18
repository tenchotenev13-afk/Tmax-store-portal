/* Функционален тест на договора на sbGet() от shared.js.

   ДОГОВОРЪТ (виж коментара над sbGet, shared.js ред 7):
     1. sbGet НИКОГА не отхвърля промиса — нито при HTTP грешка, нито при
        празно тяло (json() хвърля SyntaxError), нито при мрежов срив.
     2. sbGet ВИНАГИ резолвва с масив — никога с обекта на грешката от
        PostgREST, който 162-те `Array.isArray(x)?x:[]` проверки в портала
        мълчаливо превръщаха в празен екран без съобщение.
     3. Всяка грешка е ВИДИМА (toast) и ПРОСЛЕДИМА (console.error с URL-а).
     4. Щастливият път е непокътнат: данните минават както са, без toast.

   Точка 4 е контролната — без нея тестът щеше да е зелен и ако sbGet просто
   връщаше [] винаги.

   Пускане:
     node tests/sbget-errors.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || (__dirname + '/..');

const USER = {
  email: 'admin@temax.bg', display_name: 'Админ Централа',
  role: 'admin', store_name: 'Централен офис'
};

/* Реални на вид редове — искаме да докажем, че минават НЕПОКЪТНАТИ,
   а не че sbGet връща някакъв масив. */
const STORES = [
  { id: 1, name: 'Троян', region: 'Севрен централен', active: true },
  { id: 2, name: 'Габрово', region: 'Севрен централен', active: false }
];

/* boot + прихващане на console.error.
   sbGet логва URL-а през console.error — това е половината от „проследимост",
   затова се проверява, а не се приема на доверие. */
function env(over) {
  const h = boot(Object.assign({
    repo: ROOT,
    modules: [],
    user: USER,
    data: { stores: STORES, transport_orders: [] }
  }, over || {}));

  /* Прихващаме и ЗАГЛУШАВАМЕ console.error — логът от sbGet е очакван тук и
     ако се изпише, изходът на теста изглежда като че нещо гърми. */
  h.errs = [];
  h.w.console.error = function () {
    h.errs.push(Array.prototype.slice.call(arguments).join(' '));
  };
  return h;
}

/* Await, който НИКОГА не хвърля навън — самата проверка „промисът не се
   отхвърля" е предмет на теста, затова се прави изрично, а не с гол await. */
async function settle(p) {
  try { return { value: await p, threw: null }; }
  catch (e) { return { value: undefined, threw: e }; }
}

const isEmptyArray = x => Array.isArray(x) && x.length === 0;

(async function run() {

  /* ═════════════════════════════════════════════════════════════════════ */
  section('0. Средата и предпоставките');
  {
    const { w } = env();
    ok('shared.js е зареден и sbGet е глобална функция', typeof w.sbGet === 'function');
    ok('toast съществува (иначе останалите проверки нямат смисъл)', typeof w.toast === 'function');
    ok('fetch е stub-нат от харнеса', typeof w.fetch === 'function');
  }

  /* ═════════════════════════════════════════════════════════════════════
     КОНТРОЛЕН СЛУЧАЙ — без него тестът не доказва, че не сме счупили
     щастливия път, а само че sbGet връща масив при всичко.
     ═════════════════════════════════════════════════════════════════════ */
  section('1. Успех — данните минават непокътнати и БЕЗ toast');
  {
    const h = env();
    const r = await settle(h.w.sbGet('stores', 'select=*'));
    ok('промисът не се отхвърля', r.threw === null, r.threw && r.threw.message);
    ok('резолвва с масив', Array.isArray(r.value));
    ok('връща и двата реда', Array.isArray(r.value) && r.value.length === 2,
       JSON.stringify(r.value));
    ok('редовете са непокътнати (име)',
       Array.isArray(r.value) && r.value[0].name === 'Троян' && r.value[1].name === 'Габрово');
    ok('редовете са непокътнати (всички полета, вкл. false)',
       Array.isArray(r.value) && r.value[1].active === false && r.value[0].region === 'Севрен централен');
    ok('НЕ вика toast при успех', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));
    ok('НЕ вика console.error при успех', h.errs.length === 0, JSON.stringify(h.errs));
    ok('заявката наистина е стигнала до fetch',
       h.calls.get.some(u => /\/rest\/v1\/stores\?select=\*/.test(u)), JSON.stringify(h.calls.get));
    const r2 = await settle(h.w.sbGet('stores'));
    ok('без query параметър URL-ът е чист (без "?")',
       r2.threw === null && h.calls.get.some(u => /\/rest\/v1\/stores$/.test(u)),
       JSON.stringify(h.calls.get));
  }

  section('2. Граница на щастливия път — успешен ПРАЗЕН резултат не е грешка');
  {
    const h = env({ data: { stores: [] } });
    const r = await settle(h.w.sbGet('stores', 'select=*'));
    ok('празен списък резолвва без грешка', r.threw === null);
    ok('връща празен масив', isEmptyArray(r.value), JSON.stringify(r.value));
    ok('празен резултат НЕ вдига toast', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));
    ok('празен резултат НЕ пише в console.error', h.errs.length === 0, JSON.stringify(h.errs));
  }

  /* ═════════════════════════════════════════════════════════════════════
     СЛУЧАЙ 1 — грешка С ТЯЛО
     ═════════════════════════════════════════════════════════════════════ */
  section('3. 401 с тяло {message:"Invalid API key"}');
  {
    const h = env({ fail: { GET: { status: 401, body: { message: 'Invalid API key' } } } });
    const r = await settle(h.w.sbGet('stores', 'select=*'));

    ok('промисът НЕ се отхвърля', r.threw === null, r.threw && r.threw.message);
    ok('резолвва с масив, не с обект', Array.isArray(r.value), typeof r.value);
    ok('масивът е празен (дължина 0)', isEmptyArray(r.value), JSON.stringify(r.value));
    ok('НЕ връща обекта на грешката (няма .message в резултата)',
       r.value && r.value.message === undefined, JSON.stringify(r.value));
    ok('извикващият шаблон Array.isArray(x)?x:[] дава същото',
       (Array.isArray(r.value) ? r.value : ['подменено']).length === 0);

    ok('излязъл е toast', h.calls.toast.length === 1, JSON.stringify(h.calls.toast));
    ok('toast-ът съдържа текста от PostgREST',
       h.calls.toast.some(t => String(t).indexOf('Invalid API key') >= 0),
       JSON.stringify(h.calls.toast));
    ok('toast-ът казва и че е при зареждане',
       h.calls.toast.some(t => /Грешка при зареждане/.test(String(t))),
       JSON.stringify(h.calls.toast));
    ok('toast-ът е боядисан в червено (реално стига до DOM-а)',
       /220,\s*38,\s*38|dc2626/i.test(h.doc.getElementById('toast').style.background || ''),
       h.doc.getElementById('toast').style.background);

    ok('console.error е викан веднъж', h.errs.length === 1, JSON.stringify(h.errs));
    ok('логът съдържа пълния URL', h.errs.some(e => /\/rest\/v1\/stores\?select=\*/.test(e)),
       JSON.stringify(h.errs));
    ok('логът съдържа статуса 401', h.errs.some(e => e.indexOf('401') >= 0), JSON.stringify(h.errs));
    ok('харнесът е отчел заявката като неуспешна',
       h.calls.notOk.some(n => n.method === 'GET' && n.status === 401), JSON.stringify(h.calls.notOk));
  }

  section('4. Грешка с тяло без message — пада към hint, после към статуса');
  {
    const h = env({ fail: { GET: { status: 400, body: { hint: 'Perhaps you meant column stores.name' } } } });
    const r = await settle(h.w.sbGet('stores', 'select=nqme'));
    ok('пак резолвва с празен масив', r.threw === null && isEmptyArray(r.value));
    ok('toast-ът показва hint-а, когато message липсва',
       h.calls.toast.some(t => /Perhaps you meant/.test(String(t))), JSON.stringify(h.calls.toast));
  }
  {
    /* Тяло, което изобщо не е обект на PostgREST грешка (HTML от прокси,
       обикновен текст и т.н.) — не бива да дава "undefined" в съобщението. */
    const h = env({ fail: { GET: { status: 502, body: 'Bad Gateway' } } });
    const r = await settle(h.w.sbGet('stores', 'select=*'));
    ok('тяло-низ вместо обект пак дава празен масив', r.threw === null && isEmptyArray(r.value));
    ok('съобщението пада към статуса, не показва "undefined"',
       h.calls.toast.some(t => /HTTP 502/.test(String(t))) &&
       !h.calls.toast.some(t => /undefined/.test(String(t))),
       JSON.stringify(h.calls.toast));
  }

  /* ═════════════════════════════════════════════════════════════════════
     СЛУЧАЙ 2 — 401 с ПРАЗНО тяло. Същината: json() ХВЪРЛЯ SyntaxError.
     Точно това преди отхвърляше промиса и 103-те вериги без .catch мълчаха.
     ═════════════════════════════════════════════════════════════════════ */
  section('5. 401 с ПРАЗНО тяло — json() хвърля SyntaxError');
  {
    const h = env({ fail: { GET: { status: 401 } } });

    /* Изрично, без helper: искаме да се види, че await-ът е обграден. */
    let threw = null, value;
    try { value = await h.w.sbGet('stores', 'select=*'); }
    catch (e) { threw = e; }

    ok('промисът НЕ е отхвърлен (нищо не е хвърлено)', threw === null,
       threw && (threw.name + ': ' + threw.message));
    ok('не е изтекъл SyntaxError от json()',
       !(threw && threw.name === 'SyntaxError'), threw && threw.message);
    ok('резолвва с масив', Array.isArray(value), typeof value);
    ok('масивът е празен', isEmptyArray(value), JSON.stringify(value));
    ok('стойността не е undefined/null', value !== undefined && value !== null);

    ok('има toast въпреки липсващото тяло', h.calls.toast.length === 1,
       JSON.stringify(h.calls.toast));
    ok('без тяло съобщението пада към статуса (HTTP 401)',
       h.calls.toast.some(t => /HTTP 401/.test(String(t))), JSON.stringify(h.calls.toast));
    ok('toast-ът не показва "undefined" или "null"',
       !h.calls.toast.some(t => /undefined|null/.test(String(t))), JSON.stringify(h.calls.toast));
    ok('console.error е викан и тук', h.errs.length === 1, JSON.stringify(h.errs));
    ok('логът пак съдържа URL-а и 401',
       h.errs.some(e => /stores/.test(e) && e.indexOf('401') >= 0), JSON.stringify(h.errs));
  }
  {
    /* Празно тяло и при друг статус — поведението не зависи от 401. */
    const h = env({ fail: { GET: { status: 500 } } });
    const r = await settle(h.w.sbGet('transport_orders', 'select=*'));
    ok('500 с празно тяло — пак без хвърляне и с празен масив',
       r.threw === null && isEmptyArray(r.value), r.threw && r.threw.message);
    ok('и пак с toast', h.calls.toast.length === 1, JSON.stringify(h.calls.toast));
  }

  /* ═════════════════════════════════════════════════════════════════════
     СЛУЧАЙ 3 — мрежов срив. fetch отхвърля, преди изобщо да има отговор.
     Харнесът не го покрива през fail, затова подменяме w.fetch директно.
     ═════════════════════════════════════════════════════════════════════ */
  section('6. Мрежов срив — fetch отхвърля преди отговор');
  {
    const h = env();
    h.w.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };

    let threw = null, value;
    try { value = await h.w.sbGet('stores', 'select=*'); }
    catch (e) { threw = e; }

    ok('промисът НЕ е отхвърлен', threw === null, threw && (threw.name + ': ' + threw.message));
    ok('резолвва с масив', Array.isArray(value), typeof value);
    ok('масивът е празен', isEmptyArray(value), JSON.stringify(value));
    ok('има toast и при офлайн', h.calls.toast.length === 1, JSON.stringify(h.calls.toast));
    ok('toast-ът носи причината от fetch',
       h.calls.toast.some(t => /Failed to fetch/.test(String(t))), JSON.stringify(h.calls.toast));
    ok('console.error казва "мрежов срив" (няма HTTP статус)',
       h.errs.some(e => /мрежов срив/.test(e)), JSON.stringify(h.errs));
    ok('логът съдържа URL-а и при мрежов срив',
       h.errs.some(e => /\/rest\/v1\/stores/.test(e)), JSON.stringify(h.errs));
  }
  {
    /* Отхвърляне със стойност, която не е Error — String(e) не бива да
       произведе "[object Object]" в лицето на потребителя... а ако произведе,
       поне не бива да чупи веригата. */
    const h = env();
    h.w.fetch = function () { return Promise.reject('прекъсната връзка'); };
    const r = await settle(h.w.sbGet('stores', 'select=*'));
    ok('отхвърляне с низ вместо Error пак дава празен масив',
       r.threw === null && isEmptyArray(r.value), r.threw && r.threw.message);
    ok('и пак има съобщение към потребителя', h.calls.toast.length === 1,
       JSON.stringify(h.calls.toast));
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  section('7. Гранични случаи около самия договор');
  {
    /* HTTP 200, но тялото е ОБЕКТ, не масив (PostgREST с Accept: single object,
       или прокси, което е върнало нещо друго). Договорът е за масив. */
    const h = env({ data: { stores: () => ({ id: 1, name: 'Троян' }) } });
    const r = await settle(h.w.sbGet('stores', 'select=*'));
    ok('обект при 200 не се пропуска като резултат',
       r.threw === null && isEmptyArray(r.value), JSON.stringify(r.value));
    ok('и не остава тих — има toast', h.calls.toast.length === 1, JSON.stringify(h.calls.toast));
  }
  {
    /* toast хвърля (напр. #toast още го няма в DOM-а). Веригата, която току-що
       обезопасихме, не бива да се счупи заради самото съобщение. */
    const h = env({ fail: { GET: { status: 401, body: { message: 'Invalid API key' } } } });
    h.w.toast = function () { throw new Error('няма #toast'); };
    const r = await settle(h.w.sbGet('stores', 'select=*'));
    ok('счупен toast НЕ отхвърля промиса', r.threw === null, r.threw && r.threw.message);
    ok('счупен toast НЕ променя резултата (пак празен масив)', isEmptyArray(r.value),
       JSON.stringify(r.value));
    ok('грешката пак е в конзолата', h.errs.some(e => /Invalid API key/.test(e)),
       JSON.stringify(h.errs));
  }
  {
    /* Селективен провал: пада само stores, transport_orders минава.
       Доказва, че една провалена заявка не отравя останалите. */
    const h = env({ data: { stores: STORES, transport_orders: [{ id: 't-1' }] },
                    fail: { GET: { status: 404, body: { message: 'relation does not exist' }, url: /stores/ } } });
    const bad = await settle(h.w.sbGet('stores', 'select=*'));
    const good = await settle(h.w.sbGet('transport_orders', 'select=*'));
    ok('падналата таблица дава празен масив', bad.threw === null && isEmptyArray(bad.value));
    ok('другата таблица минава нормално',
       good.threw === null && Array.isArray(good.value) && good.value.length === 1,
       JSON.stringify(good.value));
    ok('toast има точно един (само за падналата)', h.calls.toast.length === 1,
       JSON.stringify(h.calls.toast));
    ok('toast-ът сочи правилната грешка',
       h.calls.toast.some(t => /relation does not exist/.test(String(t))),
       JSON.stringify(h.calls.toast));
  }
  {
    /* Паралелни заявки — Promise.all не бива да се спъне от падналата. */
    const h = env({ data: { stores: STORES, transport_orders: [{ id: 't-1' }] },
                    fail: { GET: { status: 401, url: /stores/ } } });
    const r = await settle(Promise.all([
      h.w.sbGet('stores', 'select=*'),
      h.w.sbGet('transport_orders', 'select=*')
    ]));
    ok('Promise.all не се отхвърля заради падналата заявка', r.threw === null,
       r.threw && r.threw.message);
    ok('първата е празен масив, втората е с данни',
       !!r.value && isEmptyArray(r.value[0]) && r.value[1].length === 1,
       JSON.stringify(r.value));
  }

  report();
})();
