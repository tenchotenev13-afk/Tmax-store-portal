/* Палети → admin матрицата: 18 обекта вместо всичко от stores + ред „ОБЩО".

   Заварено: списъкът с обекти идваше от sbGet('stores','select=name'), тоест
   ЦО, двата логистични склада и обекти без потребители (Пазарджик, Сервиз
   Троян) стояха вечно на „Няма данни" и теглеха брояча „без данни" нагоре.
   Сега идва от users + isReportableStore(), точно както в report.js:650-654.

   Второто нещо: матрицата показва ПОСЛЕДНАТА подадена наличност на всеки
   обект (latestByStore), но нямаше сбор — админът смяташе колоните на ръка.

   Пускане: node tests/pallets-summary.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

/* Датите се смятат от СЪЩАТА база като today() в shared.js — UTC срезът на
   днешния ден — а не от локалния календар. Помощникът за дати в harness-а е
   локален и се разминава с today() с един ден, когато тестът тръгне след
   полунощ местно време (България е UTC+2/+3). Точно граничният случай
   „7 срещу 8 дни" пада именно на това разминаване. */
function daysAgo(n) {
  const x = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
}

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Реалният набор от users: 18 обекта (по двама души), двата склада и ЦО. */
const REAL_STORES = [
  'Враца','Габрово','Гоце Делчев','Добрич','Дупница','Карлово','Козлодуй',
  'Кърджали','Монтана','Петрич','Пирдоп','Раднево','Севлиево','Силистра',
  'Сливен','Троян','Търговище','Шумен'
];
const REAL_USERS = REAL_STORES.concat(REAL_STORES)
  .concat(['Логистичен склад Добрич','Логистичен склад Търговище'])
  .concat(['Централен офис','Централен офис'])
  .map(s => ({ store_name: s }));

/* Малък набор за прегледните случаи: 3 реални обекта + 3 изключени. */
const SMALL_USERS = [
  { store_name: 'Централен офис' },
  { store_name: 'Логистичен склад Добрич' },
  { store_name: 'Логистичен склад Търговище' },
  { store_name: 'Враца' }, { store_name: 'Враца' },
  { store_name: 'Габрово' },
  { store_name: 'Добрич' }
];

const KEYS = ['euro_pallets','small_pallets','nonstandard_pallets',
              'grate_pallets','bilka_pallets'];

function palletRow(store, date, nums) {
  const r = { id: store + '-' + date, store_name: store, report_date: date };
  KEYS.forEach((k, i) => { r[k] = nums[i]; });
  return r;
}

function env(data) {
  return boot({
    modules: ['pallets.js'],
    user: ADMIN,
    data: Object.assign({ users: SMALL_USERS, transport_pallets: [] }, data || {})
  });
}

/* Редът „ОБЩО" живее в <tfoot>. */
function footRow(doc) {
  return doc.querySelector('#mod-pallets tfoot tr') || null;
}
function cells(tr) {
  return tr ? Array.prototype.slice.call(tr.children) : [];
}
function nums(tr) {
  return cells(tr).slice(1, 6).map(td => td.textContent.trim()).join(',');
}
function modHtml(doc) {
  return doc.getElementById('mod-pallets').innerHTML;
}
function coverage(doc) {
  return (modHtml(doc).match(/по данни от \d+ от \d+ обекта/) || ['ЛИПСВА'])[0];
}

(async function () {

  section('1. Изключване: обектите идват от users + isReportableStore');
  {
    const h = env();
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const html = modHtml(h.doc);
      ok('Централен офис го няма в матрицата', html.indexOf('Централен офис') < 0);
      ok('Логистичен склад Добрич го няма', html.indexOf('Логистичен склад Добрич') < 0);
      ok('Логистичен склад Търговище го няма', html.indexOf('Логистичен склад Търговище') < 0);
      ok('Враца е вътре', html.indexOf('>Враца<') >= 0);
      ok('Габрово е вътре', html.indexOf('>Габрово<') >= 0);
      ok('Добрич е вътре', html.indexOf('>Добрич<') >= 0);
      ok('брояч „Общо обекти" показва 3, не 6', /Общо обекти: <b>3<\/b>/.test(html),
        (html.match(/Общо обекти: <b>\d+<\/b>/) || [''])[0]);
      const body = h.doc.querySelectorAll('#mod-pallets tbody tr');
      ok('в тялото има точно 3 реда', body.length === 3, String(body.length));
    }
  }

  section('2. Заявката вече е към users, не към stores');
  {
    const h = env();
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const urls = h.calls.get.join('\n');
      ok('има GET към users със select=store_name',
        /\/users\?[^\n]*select=store_name/.test(urls), urls);
      ok('НЯМА нито един GET към stores', !/\/stores\?/.test(urls), urls);
      ok('заявката към transport_pallets е останала',
        /\/transport_pallets\?/.test(urls), urls);
    }
  }

  section('3. Dedupe: двама потребители на един обект дават един ред');
  {
    const h = env();
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const names = Array.prototype.map.call(
        h.doc.querySelectorAll('#mod-pallets tbody tr td:first-child'),
        td => td.textContent.trim());
      ok('Враца се появява точно веднъж',
        names.filter(n => n === 'Враца').length === 1, names.join(', '));
      ok('няма повторени имена', names.length === new Set(names).size, names.join(', '));
    }
  }

  section('4. Реалният набор дава 18 обекта');
  {
    const h = env({ users: REAL_USERS });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const body = h.doc.querySelectorAll('#mod-pallets tbody tr');
      ok('точно 18 реда', body.length === 18, String(body.length));
      const html = modHtml(h.doc);
      ok('брояч „Общо обекти" е 18', /Общо обекти: <b>18<\/b>/.test(html),
        (html.match(/Общо обекти: <b>\d+<\/b>/) || [''])[0]);
      ok('всички 18 са без данни (няма записи)', /⚠️ 18<\/b> без данни/.test(html));
      ok('редът ОБЩО казва „по данни от 0 от 18 обекта"',
        coverage(h.doc) === 'по данни от 0 от 18 обекта', coverage(h.doc));
    }
  }

  section('5. Редът ОБЩО: структура — точно 8 клетки');
  {
    const h = env({
      transport_pallets: [palletRow('Враца', daysAgo(1), [10, 2, 1, 3, 4])]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const tr = footRow(h.doc);
      if (ok('<tfoot> ред съществува', !!tr)) {
        const c = cells(tr);
        ok('точно 8 клетки (1 + 5 типа + 2)', c.length === 8, String(c.length));
        const heads = h.doc.querySelectorAll('#mod-pallets thead th');
        ok('броят клетки в ОБЩО = броят заглавия', c.length === heads.length,
          c.length + ' vs ' + heads.length);
        ok('първата клетка започва с ОБЩО',
          c[0].textContent.trim().indexOf('ОБЩО') === 0, c[0].textContent.trim());
        ok('последните две клетки са празни',
          c[6].textContent.trim() === '' && c[7].textContent.trim() === '',
          '[' + c[6].textContent + '] [' + c[7].textContent + ']');
        ok('числовите клетки са с DM Mono, центрирани и bold',
          c.slice(1, 6).every(td => {
            const st = td.getAttribute('style') || '';
            return /DM Mono/.test(st) && /font-weight:700/.test(st) &&
                   /text-align:center/.test(st);
          }), c[1].getAttribute('style'));
        ok('всяка клетка има горна граница за отделяне от тялото',
          c.every(td => /border-top:2px solid/.test(td.getAttribute('style') || '')),
          c.map(td => td.getAttribute('style')).join(' | '));
      }
    }
  }

  section('6. Редът ОБЩО: сборове');
  {
    const h = env({
      transport_pallets: [
        palletRow('Враца',   daysAgo(1), [10, 2, 1, 3, 4]),
        palletRow('Габрово', daysAgo(2), [5, 0, 2, 1, 0]),
        palletRow('Добрич',  daysAgo(3), [7, 1, 0, 0, 6])
      ]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      ok('сборовете са 22,3,3,4,10', nums(footRow(h.doc)) === '22,3,3,4,10',
        nums(footRow(h.doc)));
      ok('брои и трите обекта',
        coverage(h.doc) === 'по данни от 3 от 3 обекта', coverage(h.doc));
    }
  }

  section('7. Обект без запис добавя 0, не се пропуска мълчаливо');
  {
    const h = env({
      transport_pallets: [
        palletRow('Враца',   daysAgo(1), [10, 2, 1, 3, 4]),
        palletRow('Габрово', daysAgo(2), [5, 0, 2, 1, 0])
        /* Добрич няма запис */
      ]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      ok('сборът пак е коректен (15,2,3,4,4)', nums(footRow(h.doc)) === '15,2,3,4,4',
        nums(footRow(h.doc)));
      ok('знаменателят пази всичките 3 обекта',
        coverage(h.doc) === 'по данни от 2 от 3 обекта', coverage(h.doc));
      const rows = Array.prototype.slice.call(
        h.doc.querySelectorAll('#mod-pallets tbody tr'));
      const dobrich = rows.filter(r => r.children[0].textContent.trim() === 'Добрич')[0];
      if (ok('редът Добрич съществува', !!dobrich)) {
        ok('и показва тире, а не 0', dobrich.children[1].textContent.trim() === '—',
          dobrich.children[1].textContent);
      }
    }
  }

  section('8. Запис на обект ИЗВЪН списъка не влиза в сбора');
  {
    const h = env({
      transport_pallets: [
        palletRow('Враца', daysAgo(1), [10, 0, 0, 0, 0]),
        palletRow('Логистичен склад Добрич', daysAgo(1), [999, 999, 999, 999, 999]),
        palletRow('Централен офис', daysAgo(1), [500, 0, 0, 0, 0]),
        palletRow('Пазарджик', daysAgo(1), [77, 0, 0, 0, 0])
      ]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const c = cells(footRow(h.doc));
      ok('европалетите са 10, не 1586', c[1].textContent.trim() === '10',
        c[1].textContent.trim());
      ok('останалите колони са 0', nums(footRow(h.doc)) === '10,0,0,0,0',
        nums(footRow(h.doc)));
      ok('Пазарджик (обект без потребител) не е в матрицата',
        modHtml(h.doc).indexOf('Пазарджик') < 0);
      ok('знаменателят е 1 от 3, не 4 от 3',
        coverage(h.doc) === 'по данни от 1 от 3 обекта', coverage(h.doc));
    }
  }

  section('9. Само ПОСЛЕДНИЯТ запис на обект, не сбор от седмиците');
  {
    /* Заявката е с order=report_date.desc — най-новият идва пръв. */
    const h = env({
      transport_pallets: [
        palletRow('Враца', daysAgo(1),  [10, 0, 0, 0, 0]),
        palletRow('Враца', daysAgo(8),  [20, 0, 0, 0, 0]),
        palletRow('Враца', daysAgo(15), [30, 0, 0, 0, 0])
      ]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      ok('ОБЩО е 10 (последният), не 60 (сборът от трите)',
        cells(footRow(h.doc))[1].textContent.trim() === '10',
        cells(footRow(h.doc))[1].textContent.trim());
      ok('подзаглавието обяснява, че е ПОСЛЕДНАТА подадена наличност',
        /ПОСЛЕДНАТА подадена наличност/.test(modHtml(h.doc)));
      ok('и че НЕ е сбор от седмиците',
        /не сбор от седмиците/.test(modHtml(h.doc)));
    }
  }

  section('10. „по данни от X от Y" се показва ВИНАГИ, и при X===Y');
  {
    const h = env({
      transport_pallets: [
        palletRow('Враца',   daysAgo(1), [1, 0, 0, 0, 0]),
        palletRow('Габрово', daysAgo(1), [1, 0, 0, 0, 0]),
        palletRow('Добрич',  daysAgo(1), [1, 0, 0, 0, 0])
      ]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      ok('пише „по данни от 3 от 3 обекта" дори когато всички са подали',
        coverage(h.doc) === 'по данни от 3 от 3 обекта', coverage(h.doc));
      ok('и точно защото го пише винаги, брояч „без данни" липсва без изненада',
        modHtml(h.doc).indexOf('без данни') < 0);
    }
  }

  section('11. Гранични случаи');
  {
    const h = env({ users: [], transport_pallets: [] });
    if (guard('loadPallets() с 0 обекта не хвърля', () => h.w.loadPallets())) {
      await ticks();
      ok('пише „по данни от 0 от 0 обекта"',
        coverage(h.doc) === 'по данни от 0 от 0 обекта', coverage(h.doc));
      ok('всички сборове са 0', nums(footRow(h.doc)) === '0,0,0,0,0',
        nums(footRow(h.doc)));
    }
  }
  {
    const h = env({
      transport_pallets: [
        palletRow('Враца',   daysAgo(1), [null, undefined, '', 'x', 5]),
        palletRow('Габрово', daysAgo(1), ['3', 4, 0, 0, 0])
      ]
    });
    if (guard('loadPallets() с null/текст не хвърля', () => h.w.loadPallets())) {
      await ticks();
      ok('null/""/текст падат на 0, а "3" се брои като 3 → 3,4,0,0,5',
        nums(footRow(h.doc)) === '3,4,0,0,5', nums(footRow(h.doc)));
      ok('няма NaN в реда ОБЩО', nums(footRow(h.doc)).indexOf('NaN') < 0,
        nums(footRow(h.doc)));
    }
  }
  {
    /* Точно на границата: 7 дни още е „прясно", 8 дни вече е остаряло. */
    const h = env({
      transport_pallets: [
        palletRow('Враца',   daysAgo(7), [1, 0, 0, 0, 0]),
        palletRow('Габрово', daysAgo(8), [1, 0, 0, 0, 0])
      ]
    });
    if (guard('loadPallets() не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const html = modHtml(h.doc);
      ok('точно 7 дни НЕ е остаряло, точно 8 дни е → 1 остарял',
        /🕓 1<\/b> с остарели данни/.test(html),
        (html.match(/🕓 \d+<\/b>/) || ['ЛИПСВА'])[0]);
      ok('и 1 без данни (Добрич)', /⚠️ 1<\/b> без данни/.test(html));
      ok('но сборът брои и двата подали обекта',
        cells(footRow(h.doc))[1].textContent.trim() === '2',
        cells(footRow(h.doc))[1].textContent.trim());
      ok('знаменателят е 2 от 3', coverage(h.doc) === 'по данни от 2 от 3 обекта',
        coverage(h.doc));
    }
  }

  section('12. Магазинският изглед е незасегнат');
  {
    const h = boot({
      modules: ['pallets.js'],
      user: { email: 'v@temax.bg', display_name: 'Иван', role: 'sklad',
              store_name: 'Враца' },
      data: {
        users: SMALL_USERS,
        transport_pallets: [palletRow('Враца', daysAgo(1), [10, 2, 1, 3, 4])]
      }
    });
    if (guard('loadPallets() за магазин не хвърля', () => h.w.loadPallets())) {
      await ticks();
      const html = modHtml(h.doc);
      ok('НЯМА заявка към users в магазинския клон',
        !/\/users\?/.test(h.calls.get.join('\n')), h.calls.get.join('\n'));
      ok('няма ред ОБЩО в магазинския изглед', !footRow(h.doc));
      ok('формата за въвеждане е налице', !!h.doc.getElementById('pf-euro_pallets'));
      ok('бутонът Запази е налице', html.indexOf('submitPalletsForm()') >= 0);
      ok('текущите наличности се показват', html.indexOf('Текущи наличности') >= 0);
    }
  }

  report();
})();
