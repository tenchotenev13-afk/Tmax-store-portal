/* Полета за отговорност по разлика: resolved_by/resolved_at (кой реши) и
   completed_by/completed_at (кой изпълни).

   Колоните бяха добавени в базата на 19.08.2026, но нищо в клиента не ги
   пълнеше. Тестът покрива трите места, където се пише:

     1. resolveDiffLine()  — бутоните за решение в „Нови подадени бланки"
     2. sdMarkTaken()      — бутонът „✅ Върната/Заприходена" в таблицата
     3. submitSD()         — модалът, където се сменят и тип, и статус

   Най-важните случаи са граничните в модала: редакция САМО на коментар върху
   вече приключен ред НЕ бива да презаписва изпълнителя, а връщането на статуса
   назад трябва да изчисти двете полета до null (а не просто да ги пропусне).

   Пускане:  node tests/stock-diff-responsibility.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, ticks } = H;

function row(o) {
  return Object.assign({
    report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function env(rows, reports, over) {
  const h = boot(Object.assign({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI,
    confirm: true,
    data: {
      stock_differences: rows, differences_reports: reports || [],
      stock_returns: [], users: []
    }
  }, over || {}));
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify(reports || []));
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  return h;
}

/* Последният PATCH към stock_differences — другите PATCH-ове по пътя
   (differences_reports.reviewed) не ни интересуват. */
function sdPatch(calls) {
  const list = calls.patch.filter(p => /stock_differences/.test(p.url));
  return list.length ? list[list.length - 1] : null;
}

(async function run() {

  section('0. Средата се вдига и хелперът съществува');
  {
    const { w } = env([]);
    ok('stock-differences.js е зареден', typeof w.renderStockDiff === 'function');
    ok('sdActor съществува', typeof w.sdActor === 'function');
    ok('sdActor връща display_name', w.sdActor() === 'Цветелина Тенева');
    ok('sdIsTaken не е пипан', typeof w.sdIsTaken === 'function' &&
      w.sdIsTaken({ status: 'capitalized' }) === true);
  }

  section('1. resolveDiffLine — истински клик по бутон за решение записва resolved_*');
  {
    const REPORT = {
      id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
      counterpart: 'ТЕСИ ООД', document_number: '180489966',
      doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
      general_comment: '', photos: [], reviewed: false
    };
    const ROWS = [row({ id: 'l-1', report_id: 'rep-1', type: null, status: 'new' })];
    const { w, doc, calls } = env(ROWS, [REPORT]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '📥 Заприх.');
      /* Референция към САМИЯ обект отпреди клика. След PATCH-а кодът вика
         loadStockDiff(), който подменя целия sdData с пресни редове от
         сървъра — търсене по id после би върнало друг обект и мутацията
         щеше да изглежда като че не се е случила. */
      const localLine = w.sdData.find(x => x.id === 'l-1');
      if (ok('бутонът „📥 Заприх." е на екрана', !!b)) {
        realClick(w, b);
        await ticks();

        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p)) {
          ok('type е записан', p.body.type === 'writein', JSON.stringify(p.body.type));
          ok('resolved_by е записан', p.body.resolved_by === 'Цветелина Тенева',
            JSON.stringify(p.body.resolved_by));
          ok('resolved_at е ISO timestamp',
            typeof p.body.resolved_at === 'string' &&
            /^\d{4}-\d{2}-\d{2}T/.test(p.body.resolved_at), JSON.stringify(p.body.resolved_at));
          ok('completed_* НЕ се пипат при решение',
            !('completed_by' in p.body) && !('completed_at' in p.body),
            Object.keys(p.body).join(','));
        }

        /* Локалният обект трябва да носи същото, което отиде в базата — иначе
           проверката „всички редове решени" веднага след това работи с
           различни данни от тези в базата. */
        if (ok('локалният ред съществува', !!localLine)) {
          ok('line.type е обновен локално', localLine.type === 'writein',
            JSON.stringify(localLine.type));
          ok('line.resolved_by е обновен локално', localLine.resolved_by === 'Цветелина Тенева',
            JSON.stringify(localLine.resolved_by));
          ok('line.resolved_at е обновен локално', !!localLine.resolved_at);
          ok('локалният resolved_at съвпада с изпратения в PATCH-а',
            localLine.resolved_at === (sdPatch(calls) || { body: {} }).body.resolved_at,
            JSON.stringify(localLine.resolved_at));
        }
      }
    }
  }

  section('2. sdMarkTaken — истински клик по „✅ Върната" записва completed_*');
  {
    const ROWS = [row({ id: 'l-2', type: 'return', status: 'pending' })];
    const { w, doc, calls } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '✅ Върната');
      if (ok('бутонът „✅ Върната" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();

        ok('потвърждението е поискано', calls.confirm.length === 1);
        const p = sdPatch(calls);
        if (ok('има PATCH към stock_differences', !!p)) {
          ok('status става taken', p.body.status === 'taken', JSON.stringify(p.body.status));
          ok('completed_by е записан', p.body.completed_by === 'Цветелина Тенева',
            JSON.stringify(p.body.completed_by));
          ok('completed_at е ISO timestamp',
            typeof p.body.completed_at === 'string' &&
            /^\d{4}-\d{2}-\d{2}T/.test(p.body.completed_at), JSON.stringify(p.body.completed_at));
          ok('resolved_* НЕ се пипат при изпълнение',
            !('resolved_by' in p.body) && !('resolved_at' in p.body),
            Object.keys(p.body).join(','));
        }
      }
    }
  }

  section('3. ГРАНИЧЕН: редакция само на коментар върху приключен ред не пипа completed_*');
  {
    const ROWS = [row({
      id: 'l-3', type: 'return', status: 'taken',
      resolved_by: 'Стар Решаващ', resolved_at: '2026-08-10T08:00:00.000Z',
      completed_by: 'Стар Изпълнител', completed_at: '2026-08-11T09:00:00.000Z'
    })];
    const { w, doc, calls } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const edit = btn(doc, '✏️');
      if (ok('бутонът за редакция е на екрана', !!edit)) {
        realClick(w, edit);
        await ticks();

        const status = doc.getElementById('sd-status');
        const comment = doc.getElementById('sd-comment');
        if (ok('модалът е отворен', !!status && !!comment)) {
          ok('статусът е зареден като taken', status.value === 'taken', status.value);
          comment.value = 'Допълнен коментар, нищо друго';

          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              ok('коментарът наистина се записва',
                p.body.comment === 'Допълнен коментар, нищо друго', JSON.stringify(p.body.comment));
              ok('completed_by НЕ е в тялото', !('completed_by' in p.body),
                Object.keys(p.body).join(','));
              ok('completed_at НЕ е в тялото', !('completed_at' in p.body),
                Object.keys(p.body).join(','));
              ok('resolved_by НЕ е в тялото (типът не е сменян)',
                !('resolved_by' in p.body), Object.keys(p.body).join(','));
            }
          }
        }
      }
    }
  }

  section('4. ГРАНИЧЕН: връщане на статуса от „Взета" към „Невзета" изчиства completed_* до null');
  {
    const ROWS = [row({
      id: 'l-4', type: 'return', status: 'taken',
      completed_by: 'Стар Изпълнител', completed_at: '2026-08-11T09:00:00.000Z'
    })];
    const { w, doc, calls } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const edit = btn(doc, '✏️');
      if (ok('бутонът за редакция е на екрана', !!edit)) {
        realClick(w, edit);
        await ticks();

        const status = doc.getElementById('sd-status');
        if (ok('модалът е отворен', !!status)) {
          status.value = 'pending';

          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              ok('status става pending', p.body.status === 'pending', JSON.stringify(p.body.status));
              ok('completed_by е ИЗРИЧНО null', p.body.hasOwnProperty('completed_by') &&
                p.body.completed_by === null, JSON.stringify(p.body.completed_by));
              ok('completed_at е ИЗРИЧНО null', p.body.hasOwnProperty('completed_at') &&
                p.body.completed_at === null, JSON.stringify(p.body.completed_at));
              /* Ключовете трябва да оцелеят до тялото на заявката - ако
                 sdCleanPayload ги триеше, PostgREST нямаше да ги занули. */
              ok('null-ите оцеляват след sdCleanPayload',
                JSON.stringify(p.body).indexOf('"completed_by":null') >= 0,
                JSON.stringify(p.body));
            }
          }
        }
      }
    }
  }

  section('5. ГРАНИЧЕН: „capitalized" се брои за приключен (не се презаписва изпълнителят)');
  {
    /* Заварената стойност значи същото като taken. Ако сравнението беше на
       ръка срещу 'taken', редакцията щеше да изглежда като ново приключване
       и да презапише истинския изпълнител. */
    const ROWS = [row({
      id: 'l-5', type: 'writein', status: 'capitalized',
      completed_by: 'Стар Изпълнител', completed_at: '2026-08-11T09:00:00.000Z'
    })];
    const { w, doc, calls } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const edit = btn(doc, '✏️');
      if (ok('бутонът за редакция е на екрана', !!edit)) {
        realClick(w, edit);
        await ticks();

        const status = doc.getElementById('sd-status');
        if (ok('модалът е отворен', !!status)) {
          ok('заварен capitalized се показва избран като „приключен"',
            status.value === 'taken', status.value);

          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              ok('completed_by НЕ се презаписва при capitalized → taken',
                !('completed_by' in p.body), Object.keys(p.body).join(','));
            }
          }
        }
      }
    }
  }

  section('6. Смяна на типа през модала записва нов resolved_by');
  {
    const ROWS = [row({
      id: 'l-6', type: 'writein', status: 'pending',
      resolved_by: 'Стар Решаващ', resolved_at: '2026-08-10T08:00:00.000Z'
    })];
    const { w, doc, calls } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const edit = btn(doc, '✏️');
      if (ok('бутонът за редакция е на екрана', !!edit)) {
        realClick(w, edit);
        await ticks();

        const type = doc.getElementById('sd-type');
        if (ok('модалът е отворен', !!type)) {
          type.value = 'missing';

          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              ok('типът е сменен', p.body.type === 'missing', JSON.stringify(p.body.type));
              ok('resolved_by е презаписан с новия автор',
                p.body.resolved_by === 'Цветелина Тенева', JSON.stringify(p.body.resolved_by));
              ok('resolved_at е нов ISO timestamp',
                typeof p.body.resolved_at === 'string' &&
                p.body.resolved_at !== '2026-08-10T08:00:00.000Z',
                JSON.stringify(p.body.resolved_at));
              ok('completed_* не се пипат (статусът остава pending)',
                !('completed_by' in p.body) && !('completed_at' in p.body),
                Object.keys(p.body).join(','));
            }
          }
        }
      }
    }
  }

  report();
})();
