/* Бутонът „свързан модул" в седмичния календар на Бюлетина.
   Регресия: условието беше isGlobal()&&t.linked_module, заради което
   магазините (роля manager/user) изобщо не виждаха бутона. Сега видимостта
   се решава от linkedModuleAllowed(), огледало на setupTabsForRole()
   в shared.js — История само за isGlobal(), Каса за kasa/admin/manager,
   останалите модули за всички.

   Пускане: node tests/linked-module-buttons.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report } = H;

/* ── Помощници ──────────────────────────────────────────────────────────── */

/* САМО <button data-mod="…"> — обвиващият div съдържа текста на всичко в реда,
   затова търсене по контейнер винаги лъже (виж SKILL.md). */
function modBtns(doc) {
  return Array.prototype.slice.call(doc.querySelectorAll('button[data-mod]'));
}
function modBtn(doc, mod) {
  return modBtns(doc).filter(b => b.getAttribute('data-mod') === mod)[0] || null;
}

const STORE = 'Кърджали';

function user(role, store) {
  return {
    email: 'u@temax.bg', display_name: 'Тест',
    role: role, store_name: store === undefined ? STORE : store
  };
}

/* boot + минималният набор глобални, които renderBulView() чете.
   opts: { role, store, regular:<linked_module>, recurring:<linked_module> } */
function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: user(opts.role || 'manager', opts.store),
    data: {}
  });
  const w = h.w;

  /* Седмицата на бюлетина = текущата; конкретните дати идват от самия
     weekDays(), не от фиксиран низ, за да не гният тестовете. */
  const yr = new Date().getFullYear();
  const wk = w.weekNum(new Date());
  const days = w.weekDays(wk, yr);
  const monday = w.toLocalISO(days[0]);

  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });

  w.curBul = {
    id: 'b-1', week_number: wk, year: yr, status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.allStoresCache = [STORE, 'Троян'];

  w.bulTasks = [];
  w.recurringTasks = [];

  if (Object.prototype.hasOwnProperty.call(opts, 'regular')) {
    w.bulTasks = [{
      id: 't-1', title: 'Обикновена задача', department: 'trade',
      due_dates: [monday], target_stores: [STORE],
      linked_module: opts.regular
    }];
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'recurring')) {
    w.recurringTasks = [{
      id: 'r-1', title: 'Постоянна задача', department: 'trade',
      due_weekdays: [0], due_time: '09:00', target_stores: [STORE],
      linked_module: opts.recurring
    }];
  }

  return h;
}

/* Рендерира; връща false, ако рендерът е хвърлил. */
function renderOk(h, name) {
  return guard(name, () => h.w.renderBulView());
}

(function run() {

  section('0. Средата се вдига');
  {
    const h = env({ regular: 'stock-returns' });
    ok('bulletin.js е зареден (renderBulView съществува)',
      typeof h.w.renderBulView === 'function');
    ok('linkedModuleAllowed() съществува',
      typeof h.w.linkedModuleAllowed === 'function');
    ok('manager НЕ е глобална роля', h.w.isGlobal() === false);
    if (renderOk(h, 'renderBulView() не хвърля')) {
      ok('календарът е рендериран', !!h.doc.getElementById('sec-calendar'));
    }
  }

  section('A. manager/магазин + обикновена задача с linked_module=stock-returns');
  {
    const h = env({ regular: 'stock-returns' });
    if (renderOk(h, 'рендерът минава')) {
      const b = modBtn(h.doc, 'stock-returns');
      if (ok('бутонът data-mod="stock-returns" СЪЩЕСТВУВА', !!b)) {
        ok('носи етикета на модула', b.textContent.indexOf('За връщане') >= 0,
          b.textContent);
      }
    }
  }

  section('B. същият потребител + постоянна задача с linked_module=pallets');
  {
    const h = env({ recurring: 'pallets' });
    if (renderOk(h, 'рендерът минава')) {
      const b = modBtn(h.doc, 'pallets');
      if (ok('бутонът data-mod="pallets" СЪЩЕСТВУВА', !!b)) {
        ok('носи етикета на модула', b.textContent.indexOf('Палети') >= 0,
          b.textContent);
      }
    }
  }

  section('C. същият потребител + задача с linked_module=history');
  {
    const h = env({ regular: 'history' });
    if (renderOk(h, 'рендерът минава')) {
      ok('задачата все пак е в календара',
        h.doc.getElementById('sec-calendar').textContent.indexOf('Обикновена задача') >= 0);
      ok('бутон data-mod="history" НЕ съществува', !modBtn(h.doc, 'history'));
      ok('изобщо няма бутон за свързан модул', modBtns(h.doc).length === 0);
    }
  }

  section('D. роля user (не kasa/admin/manager) + linked_module=kasa');
  {
    const h = env({ role: 'user', regular: 'kasa' });
    ok('user НЕ е глобална роля', h.w.isGlobal() === false);
    if (renderOk(h, 'рендерът минава')) {
      ok('задачата все пак е в календара',
        h.doc.getElementById('sec-calendar').textContent.indexOf('Обикновена задача') >= 0);
      ok('бутон data-mod="kasa" НЕ съществува', !modBtn(h.doc, 'kasa'));
    }
  }
  {
    /* Обратната страна на същото правило — manager Я вижда Касата. */
    const h = env({ role: 'manager', regular: 'kasa' });
    if (renderOk(h, 'рендерът минава (manager + kasa)')) {
      ok('manager ВИЖДА бутона за Каса', !!modBtn(h.doc, 'kasa'));
    }
  }

  section('E. регресия за админ изгледа — admin (isGlobal) + stock-returns');
  {
    const h = env({ role: 'admin', store: 'Централен офис', regular: 'stock-returns' });
    ok('admin е глобална роля', h.w.isGlobal() === true);
    if (renderOk(h, 'рендерът минава')) {
      ok('бутонът продължава да съществува', !!modBtn(h.doc, 'stock-returns'));
    }
  }
  {
    const h = env({ role: 'admin', store: 'Централен офис', regular: 'history' });
    if (renderOk(h, 'рендерът минава (admin + history)')) {
      ok('admin ВИЖДА и бутона за История', !!modBtn(h.doc, 'history'));
    }
  }

  section('F. задача без linked_module');
  {
    const h = env({ regular: null });
    if (renderOk(h, 'рендерът минава (linked_module=null)')) {
      ok('задачата е в календара',
        h.doc.getElementById('sec-calendar').textContent.indexOf('Обикновена задача') >= 0);
      ok('няма бутон за свързан модул', modBtns(h.doc).length === 0);
    }
  }
  {
    const h = env({});
    if (renderOk(h, 'рендерът минава (без задачи изобщо)')) {
      ok('празен календар — няма бутони', modBtns(h.doc).length === 0);
    }
  }

  section('G. РЕАЛЕН КЛИК върху бутона (случай A)');
  {
    const h = env({ regular: 'stock-returns' });
    if (renderOk(h, 'рендерът минава')) {
      const b = modBtn(h.doc, 'stock-returns');
      if (ok('бутонът съществува', !!b)) {
        const seen = [];
        h.w.showModule = function (m) { seen.push(m); };
        realClick(h.w, b, 'свързан модул');
        ok('showModule() е извикан точно веднъж', seen.length === 1,
          JSON.stringify(seen));
        ok('извикан е с stock-returns', seen[0] === 'stock-returns',
          JSON.stringify(seen));
      }
    }
  }

  report();
})();
