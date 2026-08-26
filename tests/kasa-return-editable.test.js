/* Каса — върнатият за корекция документ се редактира (kasa.js).

   Стъпка 2 сложи status 'returned' на трите документа. Без тази стъпка
   връщането ги ЗАКЛЮЧВА вместо да ги отключва: isDraft гледаше само
   'draft', полетата ставаха текст, „Запази"/„Потвърди" изчезваха, а
   „Разключи" е само за admin/accounting — магазинът остава без изход.

   Плюс присвояването на чужд отчет: submitKasaForm() пращаше
   store_name:currentUser.store_name и при PATCH, тоест ЦО отвори върнат
   отчет на друг обект, натисна Запази и записът смени обекта си.

   Тестът зарежда kasa.js и history.js ЗАЕДНО (споделят fmtMoney).

   Пускане:
     node tests/kasa-return-editable.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, tsOffset, ticks } = H;

/* ── 1. Данни ─────────────────────────────────────────────────────────────── */

const ADMIN_CO = {
  email: 'admin@temax.bg', display_name: 'Админ ЦО',
  role: 'admin', store_name: 'Централен офис'
};

const RET = {
  return_reason: 'Липсва бележка за сторното',
  returned_by: 'Счетоводство',
  returned_at: tsOffset(-1)
};

function glavna(status, extra) {
  return Object.assign({
    id: 'g-1', store_name: 'Централен офис', date: '2026-08-25', status: status,
    counted_cash: 100, slujebno: 0, sap_balance: 100, razlika: 0
  }, extra || {});
}
function zoborot(status, extra) {
  return Object.assign({
    id: 'z-1', store_name: 'Централен офис', date: '2026-08-25', status: status,
    cash_bgn: 10, cash_eur: 20, card_eur: 30, bank_eur: 0, voucheri: 0,
    fu1_gross: 60, fu1_discount: 0, pos_no_bank: 60, fu_total_net: 60, razlika: 0
  }, extra || {});
}
function posReport(status, over) {
  return Object.assign({
    id: 'r-1', store_name: 'Централен офис', pos_number: 1, kasa_number: 1,
    cashier_name: 'Мария', status: status,
    total_turnover: 100, cash_turnover: 100, card_turnover: 0,
    storna_total: 0, counted_cash: 100, razlika: 0
  }, over || {});
}

function env(over) {
  over = over || {};
  /* index.html-овият ред: kasa.js → kasa-docs.js → history.js. Двата края
     споделят fmtMoney — точно затова се зареждат заедно, а не поотделно. */
  return boot(Object.assign({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: ADMIN_CO,
    data: { kasa_reports: [], kasa_glavna: [], kasa_zoborot: [], stores: [] }
  }, over));
}

/* Само <button> — баджът „↩ Върнат" е <span> и съдържа същия текст, тоест
   търсене в „button, span" би минало и срещу изчезнал бутон.
   Търси се САМО в #mod-kasa: index.html носи статични „✓ Запази заявката" и
   „✓ Запази корекцията" в модалите си, които иначе минават за наш бутон. */
function hasBtn(doc, text) { return !!btn(doc.getElementById('mod-kasa'), text); }

/* Картата „Днешни отчети" — само тя се рендира от renderKasa(). В същия
   #mod-kasa стои и таблицата на История (renderHistTable), която ВЕЧЕ знае
   за 'returned' и служи за образец. Без това стесняване тестът мери
   образеца вместо промяната и минава срещу непоправен код.
   renderKasa() дели редовете по today(), НЕ по kasaActiveDate() (= вчера). */
function todayCard(doc) {
  const cards = doc.getElementById('mod-kasa').querySelectorAll('.card');
  for (let i = 0; i < cards.length; i++) {
    const t = cards[i].querySelector('.card-title');
    if (t && t.textContent.indexOf('Днешни отчети') >= 0) return cards[i];
  }
  return null;
}

(async function run() {

  /* ── 2. Интеграция: двата файла живеят заедно ───────────────────────────── */
  section('1. kasa.js и history.js се зареждат заедно');
  {
    const { w } = env();
    ok('kasa.js е зареден', typeof w.renderGlavna === 'function');
    ok('history.js е зареден', typeof w.loadHistory === 'function');
    ok('kasa-docs.js е зареден', typeof w.returnKasaForRevision === 'function');
    ok('fmtMoney е налична след двете дефиниции', typeof w.fmtMoney === 'function');
    ok('fmtMoney форматира', typeof w.fmtMoney(12.5) === 'string' &&
      w.fmtMoney(12.5).indexOf('12.5') >= 0, w.fmtMoney(12.5));
    ok('kasaReturnedBanner съществува', typeof w.kasaReturnedBanner === 'function');
  }

  /* ── 3. Главна каса ─────────────────────────────────────────────────────── */
  section('2. Главна каса със статус „returned" е редактируема');
  {
    const h = env();
    const { w, doc } = h;
    w.kasaReports = [];
    w.kasaGlavna = glavna('returned', RET);

    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      const sap = doc.getElementById('gl-sap');
      if (ok('полето „Наличност SAP" съществува', !!sap)) {
        ok('полето е INPUT, не текст', sap.tagName === 'INPUT', sap.tagName);
      }
      ok('бутон „Запази" СЪЩЕСТВУВА', hasBtn(doc, 'Запази'));
      ok('бутон „Потвърди" СЪЩЕСТВУВА', hasBtn(doc, 'Потвърди'));
      ok('не пише „Потвърдена — заключена"',
        doc.body.textContent.indexOf('заключена') < 0);

      const txt = doc.body.textContent;
      ok('банерът се показва', txt.indexOf('Върнат за корекция') >= 0);
      ok('банерът носи причината', txt.indexOf('Липсва бележка за сторното') >= 0);
      ok('банерът казва кой е върнал', txt.indexOf('Счетоводство') >= 0);
      ok('банерът е в червената гама',
        /#fee2e2|#991b1b/.test(doc.getElementById('mod-kasa').innerHTML));
    }
    h.close();
  }

  section('3. Главна каса: „draft" с останала причина НЕ показва банер');
  {
    const h = env();
    const { w, doc } = h;
    w.kasaReports = [];
    /* saveGlavna() записва status:'draft', но return_reason остава попълнено.
       Затова условието е статусът, не причината — иначе банерът виси завинаги. */
    w.kasaGlavna = glavna('draft', RET);

    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      ok('банерът НЕ се показва след запис',
        doc.body.textContent.indexOf('Върнат за корекция') < 0);
      ok('полетата пак са редактируеми',
        (doc.getElementById('gl-sap') || {}).tagName === 'INPUT');
      ok('„Запази" пак е тук', hasBtn(doc, 'Запази'));
    }
    h.close();
  }

  section('4. Главна каса: „confirmed" си остава заключена');
  {
    const h = env();
    const { w, doc } = h;
    w.kasaReports = [];
    w.kasaGlavna = glavna('confirmed');

    if (guard('renderGlavna() не хвърля', () => w.renderGlavna())) {
      ok('полето НЕ е input', (doc.getElementById('gl-sap') || {}).tagName !== 'INPUT');
      ok('„Запази" го няма', !hasBtn(doc, 'Запази'));
      ok('пише „заключена"', doc.body.textContent.indexOf('заключена') >= 0);
      ok('банер няма', doc.body.textContent.indexOf('Върнат за корекция') < 0);
    }
    h.close();
  }

  /* ── 4. Равнение ────────────────────────────────────────────────────────── */
  section('5. Равнение със статус „returned" е редактируемо');
  {
    const h = env();
    const { w, doc } = h;
    w.zoborotData = zoborot('returned', RET);

    if (guard('renderZoborot() не хвърля', () => w.renderZoborot())) {
      const cell = doc.getElementById('zf-cash_bgn');
      if (ok('полето „в брой BGN" съществува', !!cell)) {
        ok('полето е INPUT, не текст', cell.tagName === 'INPUT', cell.tagName);
      }
      ok('бутон „Запази" СЪЩЕСТВУВА', hasBtn(doc, 'Запази'));
      ok('бутон „Потвърди" СЪЩЕСТВУВА', hasBtn(doc, 'Потвърди'));
      ok('бутон „Разключи" НЕ се предлага', !hasBtn(doc, 'Разключи'));

      const txt = doc.body.textContent;
      ok('банерът се показва', txt.indexOf('Върнат за корекция') >= 0);
      ok('банерът носи причината', txt.indexOf('Липсва бележка за сторното') >= 0);
    }
    h.close();
  }

  section('6. Равнение: „draft" с останала причина НЕ показва банер');
  {
    const h = env();
    const { w, doc } = h;
    w.zoborotData = zoborot('draft', RET);
    if (guard('renderZoborot() не хвърля', () => w.renderZoborot())) {
      ok('банерът НЕ се показва', doc.body.textContent.indexOf('Върнат за корекция') < 0);
      ok('полетата са input', (doc.getElementById('zf-cash_bgn') || {}).tagName === 'INPUT');
    }
    h.close();
  }

  section('7. Равнение: „confirmed" си остава заключено');
  {
    const h = env();
    const { w, doc } = h;
    w.zoborotData = zoborot('confirmed');
    if (guard('renderZoborot() не хвърля', () => w.renderZoborot())) {
      ok('полето НЕ е input', !doc.getElementById('zf-cash_bgn'));
      ok('„Запази" го няма', !hasBtn(doc, 'Запази'));
      ok('„Разключи" се предлага на admin', hasBtn(doc, 'Разключи'));
    }
    h.close();
  }

  /* ── 5. Таблицата „Днешни отчети" ───────────────────────────────────────── */
  section('8. Върнат ПОС отчет в „Днешни отчети" се редактира и не е зелен');
  {
    const h = env();
    const { w, doc } = h;
    const D = w.today();
    w.kasaView = 'pos';
    w.kasaReports = [
      posReport('returned', { id: 'r-1', pos_number: 1, date: D }),
      posReport('confirmed', { id: 'r-2', pos_number: 2, date: D }),
      posReport('draft', { id: 'r-3', pos_number: 3, date: D })
    ];

    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const card = todayCard(doc);
      if (ok('картата „Днешни отчети" съществува', !!card)) {
        const inner = card.innerHTML;
        const row = Array.prototype.slice.call(card.querySelectorAll('tbody tr'))
          .filter(function (tr) { return tr.innerHTML.indexOf("editKasaReport('r-1')") >= 0; })[0]
          || Array.prototype.slice.call(card.querySelectorAll('tbody tr'))
          .filter(function (tr) { return tr.textContent.indexOf('ПОС 1') >= 0; })[0];

        if (ok('редът на върнатия отчет съществува', !!row)) {
          ok('баджът е „↩ Върнат"', row.textContent.indexOf('↩ Върнат') >= 0,
            row.textContent.replace(/\s+/g, ' ').slice(0, 120));
          ok('НЕ е зелено „Потвърден"', row.textContent.indexOf('✅ Потвърден') < 0);
          ok('червената гама е приложена', /#fee2e2|#991b1b/.test(row.innerHTML));
        }
        ok('има бутон „Редактирай" за r-1', inner.indexOf('editKasaReport(\'r-1\')') >= 0);
        ok('НЕ предлага „Разключи" за върнатия',
          inner.indexOf('unlockKasaReport(\'r-1\')') < 0);
        /* Контроли: другите два статуса не са мръднали. */
        ok('потвърденият няма „Редактирай"', inner.indexOf('editKasaReport(\'r-2\')') < 0);
        ok('потвърденият предлага „Разключи"',
          inner.indexOf('unlockKasaReport(\'r-2\')') >= 0);
        ok('черновата има „Редактирай"', inner.indexOf('editKasaReport(\'r-3\')') >= 0);
        ok('черновата има „Потвърди"', inner.indexOf('confirmKasaReport(\'r-3\')') >= 0);
      }
    }
    h.close();
  }

  /* ── 6. Присвояването на чужд отчет ─────────────────────────────────────── */
  section('9. РЕАЛЕН клик: редакция на чужд отчет НЕ праща store_name');
  {
    const h = env({ confirm: true });
    const { w, doc, calls } = h;
    const D = w.today();   /* renderKasa() дели по today(), не по kasaActiveDate() */
    w.kasaView = 'pos';
    /* Отчет на ДРУГ обект — точно случаят от История. */
    w.kasaReports = [posReport('returned', { id: 'r-9', store_name: 'Дупница', date: D })];

    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const editBtn = btn(doc.getElementById('mod-kasa'), 'Редактирай');
      if (ok('бутонът „Редактирай" е там', !!editBtn)) {
        guard('клик по „Редактирай" не хвърля', () => realClick(w, editBtn));

        const warn = calls.confirm.join(' | ');
        ok('предупреждава за чуждия обект', warn.indexOf('Дупница') >= 0, warn);
        ok('предупреждението е само confirm, формата се отваря',
          !!doc.getElementById('kf-cashier'));

        const saveBtn = btn(doc.getElementById('mod-kasa'), 'Запази чернова');
        if (ok('бутонът „Запази чернова" е там', !!saveBtn)) {
          guard('клик по „Запази" не хвърля', () => realClick(w, saveBtn));
          await ticks();

          const patches = calls.patch.filter(function (p) { return p.table === 'kasa_reports'; });
          if (ok('изпратен е PATCH, не POST', patches.length === 1 &&
            calls.post.filter(function (p) { return p.table === 'kasa_reports'; }).length === 0,
            'patch=' + patches.length + ' post=' + calls.post.length)) {
            const b = patches[0].body;
            /* Същината: колоната се пропуска и PostgREST я оставя както е.
               Проверява се КЛЮЧЪТ — store_name:undefined също би заминало. */
            ok('тялото НЕ съдържа store_name',
              Object.keys(b).indexOf('store_name') < 0,
              JSON.stringify(Object.keys(b)));
            ok('URL-ът сочи точния запис', patches[0].url.indexOf('id=eq.r-9') >= 0);
            ok('останалите полета пътуват', typeof b.counted_cash === 'number' &&
              b.status === 'draft');
          }
        }
      }
    }
    h.close();
  }

  section('10. Нов отчет (POST) СЪДЪРЖА store_name');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.kasaView = 'pos';
    w.kasaReports = [];
    w.kasaEditId = null;

    if (guard('openKasaForm() не хвърля', () => w.openKasaForm())) {
      const cash = doc.getElementById('kf-cashier');
      if (ok('формата за нов отчет е отворена', !!cash)) {
        cash.value = 'Нов касиер';
        const saveBtn = btn(doc.getElementById('mod-kasa'), 'Запази чернова');
        if (ok('бутонът „Запази чернова" е там', !!saveBtn)) {
          guard('клик по „Запази" не хвърля', () => realClick(w, saveBtn));
          await ticks();

          const posts = calls.post.filter(function (p) { return p.table === 'kasa_reports'; });
          if (ok('изпратен е POST', posts.length === 1, 'намерени: ' + posts.length)) {
            ok('тялото СЪДЪРЖА store_name',
              posts[0].body.store_name === 'Централен офис',
              JSON.stringify(posts[0].body.store_name));
          }
          ok('няма PATCH', calls.patch.filter(function (p) {
            return p.table === 'kasa_reports'; }).length === 0);
        }
      }
    }
    h.close();
  }

  section('11. Свой отчет не вдига предупреждение');
  {
    const h = env();
    const { w, doc, calls } = h;
    const D = w.today();   /* renderKasa() дели по today(), не по kasaActiveDate() */
    w.kasaView = 'pos';
    w.kasaReports = [posReport('returned', { id: 'r-7', store_name: 'Централен офис', date: D })];

    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const editBtn = btn(doc.getElementById('mod-kasa'), 'Редактирай');
      if (ok('бутонът е там', !!editBtn)) {
        guard('клик не хвърля', () => realClick(w, editBtn));
        ok('НЯМА confirm за собствен обект', calls.confirm.length === 0,
          calls.confirm.join(' | '));
        ok('формата се е отворила', !!doc.getElementById('kf-cashier'));
      }
    }
    h.close();
  }

  section('12. Отказ на предупреждението не отваря формата');
  {
    const h = env({ confirm: false });
    const { w, doc, calls } = h;
    const D = w.today();   /* renderKasa() дели по today(), не по kasaActiveDate() */
    w.kasaView = 'pos';
    w.kasaReports = [posReport('returned', { id: 'r-8', store_name: 'Дупница', date: D })];

    if (guard('renderKasa() не хвърля', () => w.renderKasa())) {
      const editBtn = btn(doc.getElementById('mod-kasa'), 'Редактирай');
      if (ok('бутонът е там', !!editBtn)) {
        guard('клик не хвърля', () => realClick(w, editBtn));
        ok('питано е', calls.confirm.length === 1);
        ok('формата НЕ се е отворила', !doc.getElementById('kf-cashier'));
      }
    }
    h.close();
  }

  report();
})();
