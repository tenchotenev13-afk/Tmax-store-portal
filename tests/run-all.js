/* Пуска всички jsdom тестове на портала — паралелно, в пул от N процеса.
   N = env TEST_JOBS; иначе floor(процесори / 3), между 1 и 8 (на 24 процесора
   — 8). Над 8 само с изричен TEST_JOBS: jsdom е тежък по памет (~300 MB на
   процес). TEST_JOBS=1 дава старото последователно поведение — същият ред,
   същият изход; ползва се при подозрение за скрито споделено състояние.

   Изходът на всеки тест се буферира и се печата цял, щом тестът свърши —
   редове от различни тестове не се смесват. Стартът е по реда на TESTS,
   печатът е по реда на завършване, обобщението накрая — пак по TESTS.

   При провал не се стартират нови тестове; вече тръгналите се довършват и
   отпечатват, после exit 1 със списък на падналите.
   Изключение: тест, който ЗАБИЕ (над лимита си), се убива, отчита се като
   ❌ „ЗАБИ" и пускът продължава — един увиснал тест не бива да крие
   резултата на останалите. Общият резултат тогава е червен.

   Тестовете приемат корена на репото като argv[2]. Подаваме го явно,
   за да не зависи резултатът от това откъде е извикана командата.

   КРИТЕРИЙ ЗА УСПЕХ/ПРОВАЛ Е САМО EXIT КОДЪТ на всеки тест.
   Текстът в изхода не решава нищо — регексът долу служи единствено
   за събиране на общия брой проверки. Ако не хване число, това е
   предупреждение, не провал. */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');

const JOBS = (function () {
  const env = parseInt(process.env.TEST_JOBS, 10);
  if (env >= 1) return env;
  return Math.max(1, Math.min(8, Math.floor(os.cpus().length / 3)));
})();

/* Лимитът се мери от СТАРТА на самия процес, не от влизането в опашката.
   Цял тест тече секунди: измерено 19.10.2026 на 1 ядро — средно 6,3 сек,
   медиана 4,5, p90 10,8. 180 сек значи увиснал (22.09.2026 пакетът стоя над
   10 мин на task-report-schedule.test.js, който сам минава за 10 сек).
   До 19.10.2026 лимитът беше 120 сек; при паралелен пуск ядрата се делят и
   тестовете се забавят, затова е вдигнат. */
const TEST_TIMEOUT_MS = 180000;
/* Известно тежките — измерено 19.10.2026 сами на 1 ядро:
   stock-diff-co-viewer 85 сек (близо до стария лимит 120 и „забиваше" под
   натоварване, макар сам да минава), sr-diff-types-url 25 сек. */
const TEST_TIMEOUTS = {
  'stock-diff-co-viewer.test.js': 240000,
  'sr-diff-types-url.test.js': 240000
};
function timeoutFor(name) {
  return TEST_TIMEOUTS[name] || TEST_TIMEOUT_MS;
}

const TESTS = [
  'client-groups.test.js',
  'client-order-double-submit.test.js',
  'client-order-from-store.test.js',
  'client-order-store-sync.test.js',
  'contacts-id-collision.test.js',
  'id-collisions.test.js',
  'co-processed.test.js',
  'delivery-default.test.js',
  'order-numbering.test.js',
  'paid-transport.test.js',
  'co-sap-banner-state.test.js',
  'stock-differences.test.js',
  'sbget-errors.test.js',
  'sb-get-all.test.js',
  'history-kasa-get-all.test.js',
  'history-store-dropdown.test.js',
  'report-cross-get-all.test.js',
  'stock-returns-get-all.test.js',
  'revaluation.test.js',
  'revaluation-co.test.js',
  'revaluation-sap.test.js',
  'revaluation-history.test.js',
  'empty-field-dash.test.js',
  'role-controlling.test.js',
  'role-tabs-matrix.test.js',
  'today-regional-scope.test.js',
  'revaluation-regional.test.js',
  'revaluation-bugs-1910.test.js',
  'xlsx-real-datenf.test.js',
  'revision-schedule.test.js',
  'minusi.test.js',
  'minusi-notify-sync.test.js',
  'picking.test.js',
  'picking-pallets.test.js',
  'picking-ship.test.js',
  'stock-diff-null-payload.test.js',
  'stock-diff-status-labels.test.js',
  'catalog-lookup.test.js',
  'diff-submit-validation.test.js',
  'diff-report-no-document.test.js',
  'diff-qty-guard.test.js',
  'stock-returns-manual-order.test.js',
  'interstore-counterpart-select.test.js',
  'interstore-confirm-flow.test.js',
  'sd-store-response.test.js',
  'sd-sent-sap.test.js',
  'sd-notify.test.js',
  'sd-swap-link.test.js',
  'sd-late-receive.test.js',
  'sd-return-sync.test.js',
  'sd-swaps-url.test.js',
  'sr-diff-types-url.test.js',
  'sd-swap-store.test.js',
  'sd-done-collapse.test.js',
  'sd-interstore-columns.test.js',
  'sd-wh-column.test.js',
  'sd-view-toggle.test.js',
  'sd-compact-table.test.js',
  'sd-table-scroll.test.js',
  'sd-store-missing-lock.test.js',
  'sd-move-direction.test.js',
  'sd-return-create-fail.test.js',
  'sd-swap-notify.test.js',
  'sd-actions-card.test.js',
  'interstore-swap-signal.test.js',
  'loading-lists-warehouse.test.js',
  'loading-ui.test.js',
  'loading-lists-store.test.js',
  'loading-lists-pallets.test.js',
  'loading-lists-pallet-default.test.js',
  'loading-lists-unit-views.test.js',
  'loading-lists-labels.test.js',
  'loading-lists-unnumbered-head.test.js',
  'loading-lists-quick-add.test.js',
  'loading-lists-notify.test.js',
  'loading-lists-missing.test.js',
  'loading-lists-notify-send.test.js',
  'loading-lists-notify-closed.test.js',
  'loading-lists-notify-live.test.js',
  'loading-lists-products.test.js',
  'loading-lists-print-pallet.test.js',
  'loading-lists-transit-expand.test.js',
  'loading-lists-scanner-config.test.js',
  'loading-lists-oversize.test.js',
  'loading-lists-teodor-fixes.test.js',
  'loading-lists-sender-warehouse.test.js',
  'loading-lists-doc-products.test.js',
  'loading-lists-blank-rows.test.js',
  'loading-lists-search.test.js',
  'loading-lists-pdf.test.js',
  'loading-lists-store-rows.test.js',
  'loading-lists-photos.test.js',
  'loading-transit-toggle.test.js',
  'loading-scan-toggle.test.js',
  'loading-diff-prefill.test.js',
  'transit-store-scope.test.js',
  'transit-warehouse-scope.test.js',
  'transit-counts-follow-filters.test.js',
  'transit-compact.test.js',
  'transit-direction-transfer.test.js',
  'transit-export-labels.test.js',
  'loading-lists-print.test.js',
  'stock-diff-capitalized-counter.test.js',
  'stock-diff-chip-counts.test.js',
  'stock-diff-co-viewer.test.js',
  'stock-diff-store-chips-bottom.test.js',
  'stock-diff-not-invoiced.test.js',
  'stock-diff-responsibility.test.js',
  'stock-diff-resolve-qty.test.js',
  'stock-diff-status-new.test.js',
  'stock-diff-task-autocomplete.test.js',
  'stock-diff-auto-complete.test.js',
  'supply-auto-complete.test.js',
  'stock-diff-print.test.js',
  'diff-print-supplier-col.test.js',
  'print-transport-marker.test.js',
  'diff-delete-report.test.js',
  'diff-email-internal-comment.test.js',
  'diff-email-recipients-files.test.js',
  'diff-report-photo-add.test.js',
  'shared-write-errors.test.js',
  'admin-user-create-select.test.js',
  'admin-set-password-session.test.js',
  'admin-users-writes.test.js',
  'store-cache-invalidation.test.js',
  'return-proof.test.js',
  'stock-returns-order-number.test.js',
  'stock-returns-supplier-export.test.js',
  'stock-returns-import-new-only.test.js',
  'stock-returns-po-sort.test.js',
  'stock-returns-complaint-export.test.js',
  'stock-returns-complaint-docdate.test.js',
  'stock-returns-import-serial-date.test.js',
  'stock-returns-discard.test.js',
  'stock-returns-import-completed.test.js',
  'stock-returns-single-expiry.test.js',
  'stock-returns-completed-no-taken-btn.test.js',
  'sr-confirmed-by.test.js',
  'sr-needs-update.test.js',
  'sd-badge-hidden-tab.test.js',
  'delete-three-states.test.js',
  'storno-embed-no-in-list.test.js',
  'history-subtabs.test.js',
  'storno-no-age-limit.test.js',
  'linked-module-buttons.test.js',
  'recurring-edit-department.test.js',
  'recurring-due-window.test.js',
  'recurring-window-report.test.js',
  'task-window.test.js',
  'task-window-view.test.js',
  'task-window-report.test.js',
  'rec-window-from-version.test.js',
  'notify-today-window.test.js',
  'na-auto-complete-guard.test.js',
  'na-store-declare.test.js',
  'na-office-view.test.js',
  'na-report-count.test.js',
  'auto-modules-registry.test.js',
  'stock-returns-per-source.test.js',
  'bul-pending-hint.test.js',
  'bul-pending-open.test.js',
  'sd-store-clarity.test.js',
  'transit-store-clarity.test.js',
  'sr-banner-text.test.js',
  'sr-created-by-store.test.js',
  'sr-created-by.test.js',
  'sd-created-by.test.js',
  'bulletin-week-default.test.js',
  'bulletin-completion-day-lock.test.js',
  'span-lock-completion.test.js',
  'bulletin-store-denominator.test.js',
  'analysis-postponed.test.js',
  'wrong-receipt-tab.test.js',
  'wrong-receipt-store-submit.test.js',
  'sd-wrong-receipt-storno.test.js',
  'diff-email-pending.test.js',
  'diff-email-after-skip.test.js',
  'diff-email-order-phone.test.js',
  'diff-return-order.test.js',
  'diff-order-required.test.js',
  'sd-melki-oct21.test.js',
  'sd-korekcia-qty.test.js',
  'diff-order-wrong-receipt.test.js',
  'diff-form-qty-labels.test.js',
  'diff-excel-export.test.js',
  'sr-excel-one-sheet-qty-label.test.js',
  'diff-return-completed.test.js',
  'sd-lipsa-priklyuchena.test.js',
  'storno-notes.test.js',
  'storno-notes-notify.test.js',
  'sr-store-comment.test.js',
  'sr-diff-list-import.test.js',
  'sr-diff-no-plant.test.js',
  'sr-diff-tab-columns.test.js',
  'sr-compact.test.js',
  'today-wrong-receipt-row.test.js',
  'notifications-poll.test.js',
  'weekly-report-window.test.js',
  'weekly-report-lists-window.test.js',
  'weekly-report-item-dates.test.js',
  'report-span-pending-fmtdate.test.js',
  'report-store-list.test.js',
  'report-email-shell.test.js',
  'weekly-cross-window.test.js',
  'weekly-routing-window.test.js',
  'routed-card-content.test.js',
  'report-ranking-plural.test.js',
  'report-scope-notice.test.js',
  'report-edge-sync.test.js',
  'report-paging-1000.test.js',
  'routed-empty-recipient.test.js',
  'report-daily-date.test.js',
  'report-target-day-week.test.js',
  'report-daily-scope.test.js',
  'report-store-scope.test.js',
  'report-weekly-scope.test.js',
  'report-kasa-section.test.js',
  'daily-kasa-backlog.test.js',
  'pallets-report.test.js',
  'report-recipient-flags.test.js',
  'report-cron-schedule.test.js',
  'pallets-drop-lock.test.js',
  'pallets-export.test.js',
  'pallets-supply-access.test.js',
  'weekly-storno-short.test.js',
  'weekly-diff-stale.test.js',
  'weekly-checklist-section.test.js',
  'warehouse-report.test.js',
  'co-overdue-report.test.js',
  'report-workdays.test.js',
  'report-returns-list.test.js',
  'report-late-section.test.js',
  'report-transit-warehouse.test.js',
  'report-grid.test.js',
  'email-encoding.test.js',
  'email-subject-rfc2047.test.js',
  'mail-from-name.test.js',
  'resend-email-attach.test.js',
  'daily-turnover.test.js',
  'kasa-tab-routing.test.js',
  'kasa-ui.test.js',
  'kasa-work-day.test.js',
  'pallets-summary.test.js',
  'small-tabs-ui.test.js',
  'supply.test.js',
  'supply-note.test.js',
  'supply-history.test.js',
  'supply-co-note.test.js',
  'supply-no-need.test.js',
  'supply-note-number.test.js',
  'oborot-bulletin-link.test.js',
  'oborot-co-entry.test.js',
  'admin-oborot-report.test.js',
  'regional-flag.test.js',
  'bulletin-dept-move-order.test.js',
  'co-role-filter.test.js',
  'late-flag.test.js',
  'task-completion-files.test.js',
  'task-type-file-requires-doc.test.js',
  /* overdue-recipients.test.js отпадна на 27.08.2026 заедно с логиката, която
     проверяваше — наследникът му е notify-topic-button.test.js по-долу. */
  'kasa-return-status.test.js',
  'kasa-return-editable.test.js',
  'kasa-returned-day-close.test.js',
  'kasa-dedup.test.js',
  'kasa-history-order.test.js',
  'kasa-history-window.test.js',
  'local-date.test.js',
  'calendar-local-dates.test.js',
  'calendar-client-delivery.test.js',
  'kasa-returned-in-reports.test.js',
  'zoborot-hint.test.js',
  'report-groups-users.test.js',
  'report-groups-from-users.test.js',
  'task-report-schedule.test.js',
  'task-report-responder.test.js',
  'task-report-supply.test.js',
  'task-report-recurring.test.js',
  'task-span-weeks.test.js',
  'task-notice-dept-block.test.js',
  'day-plan.test.js',
  'span-calendar-days.test.js',
  'carried-completion-modal.test.js',
  'report-excluded-key.test.js',
  'task-desc-links.test.js',
  'rec-edit-scope.test.js',
  'no-auto-push-on-load.test.js',
  'bulletin-unpublished-push.test.js',
  'responder-publication-gate.test.js',
  'notify-topic-button.test.js',
  'admin-notifications.test.js',
  'attachments-html-sync.test.js',
  'notify-schedule-stores.test.js',
  'checklist-view.test.js',
  'checklist-edit.test.js',
  'checklist-portal-value.test.js',
  'checklist-transit.test.js',
  'checklist-returns.test.js',
  'checklist-wrong-receipt.test.js',
  'checklist-email.test.js',
  'checklist-send.test.js',
  'checklist-store-view.test.js',
  'checklist-responses-view.test.js',
  'checklist-streak.test.js',
  'checklist-3b-email.test.js',
  'checklist-3b-report.test.js',
  'checklist-full-form.test.js',
  'checklist-portal-columns.test.js',
  'transfers-create.test.js',
  'report-service-troyan.test.js',
  'admin-user-store-list.test.js',
  'transfers-confirm.test.js',
  'transfers-reload-search.test.js',
  'transfers-reship.test.js',
  'transfers-stale.test.js',
  'transfers-delete.test.js',
  'transfers-truck.test.js',
  'transfers-co-label.test.js',
  'transfers-labels.test.js',
  'transfers-units.test.js',
  'transfers-card-note.test.js',
  'transfers-departed.test.js',
  'transfers-notify.test.js',
  'transfers-warehouses.test.js',
  'transfers-select-all.test.js',
  'task-completions-row-cap.test.js',
  'task-type-notice.test.js',
  'overdue-recurring.test.js',
  'today-window-task.test.js',
  'today-current-week-bulletin.test.js',
  'task-completion-duplicates.test.js',
  'co-elapsed-backdated.test.js',
  'co-workdays-module.test.js',
  'co-date-not-future.test.js',
  'co-detail-modal.test.js',
  'co-new-for-fulfiller.test.js',
  'recurring-task-skips.test.js',
  'recurring-task-skips-consumers.test.js',
  'recurring-task-skips-report.test.js',
  'recurring-task-skips-notify.test.js',
  'recurring-task-skips-responder.test.js',
  'skip-hide.test.js',
  'skip-hide-carried.test.js',
  'recurring-notice-block.test.js',
  'recurring-stopped.test.js',
  'bulletin-due-done.test.js',
  'subtask-due-done.test.js',
  'recurring-periods.test.js',
  'recurring-periods-write.test.js',
  'recurring-content-versions.test.js',
  'recurring-future-week.test.js',
  'recurring-periods-report.test.js',
  'recurring-periods-notify.test.js',
  'postpone-date.test.js',
  'postpone-date-consumers.test.js',
  'postpone-date-report.test.js',
  'postpone-date-notify.test.js',
  'bulletin-empty-recurring.test.js',
  'bulletin-delete-confirm.test.js',
  'bulletin-event-desc.test.js',
  'transit-auto-complete.test.js',
  'admin-reports.test.js',
  'admin-role-view.test.js',
  'admin-no-backup-dead-code.test.js',
  'client-notified.test.js',
  'co-filter-arrived.test.js',
  'co-filter-store.test.js',
  'co-filter-bar.test.js',
  'transport-detail.test.js',
  'transport-row-items.test.js',
  'transport-filter-bar.test.js',
  'metrics-only-transport-client.test.js',
  'transport-stock-arrived.test.js',
  'contact-detail.test.js',
  'contacts-directory.test.js',
  'contacts-home.test.js',
  'contacts-photos.test.js',
  'co-row-click.test.js',
  'co-row-all-items.test.js',
  'co-compact-row.test.js',
  'co-warehouse-fulfiller-buttons.test.js',
  'nav-tabs-css.test.js',
  'table-scroll.test.js',
  'recurring-store-hints.test.js',
  'banner-split.test.js',
  'handover-structure.test.js'
];

/* Броячът не е изписан еднакво навсякъде — едни тестове казват
   "0 неуспешни", други "0 провалени". Хващаме и двата варианта. */
const SUMMARY = /(\d+)\s+успешни,\s*(\d+)\s+(?:неуспешни|провалени)/;

/* Всички файлове се проверяват преди първия старт — при паралелен пуск
   липсващ файл по средата иначе би излязъл чак след минути. */
TESTS.forEach(function (name) {
  if (!fs.existsSync(path.join(__dirname, name))) {
    console.error('\n❌ ЛИПСВА ФАЙЛ: ' + name);
    process.exit(1);
  }
});

function fmtSec(ms) {
  return (ms / 1000).toFixed(1).replace('.', ',') + ' сек';
}

const results = {};   // name -> { status, ms, ok, bad, hung, signal }
const failed = [];
let next = 0;
let running = 0;
let stopping = false;
const t0 = Date.now();

console.log('Тестове: ' + TESTS.length + ', паралелно: ' + JOBS +
            (process.env.TEST_JOBS ? ' (TEST_JOBS)' : ''));

function runOne(name) {
  const file = path.join(__dirname, name);
  const limit = timeoutFor(name);
  const out = [];
  const err = [];
  const start = Date.now();
  let timedOut = false;
  let spawnError = null;

  const child = spawn(process.execPath, [file, ROOT], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', function (b) { out.push(b); });
  child.stderr.on('data', function (b) { err.push(b); });
  const timer = setTimeout(function () {
    timedOut = true;
    child.kill('SIGKILL');
  }, limit);

  child.on('error', function (e) { spawnError = e; });
  child.on('close', function (code, signal) {
    clearTimeout(timer);
    running--;
    const ms = Date.now() - start;
    /* Като преди: stdout, после stderr — цял блок за теста. */
    const text = Buffer.concat(out).toString('utf8') + Buffer.concat(err).toString('utf8') +
                 (spawnError ? '\n' + spawnError.message + '\n' : '');
    console.log('\n━━━ ' + name + ' ━━━ (' + fmtSec(ms) + ')');
    process.stdout.write(text);

    const r = { status: code, ms: ms, ok: null, bad: 0, hung: false, signal: signal };
    results[name] = r;

    /* Забил тест: убит от лимита. Отчита се и се продължава. */
    if (timedOut || signal) {
      r.hung = true;
      console.error('\n❌ ЗАБИ (>' + (limit / 1000) + ' сек): ' + name +
                    (signal ? ' — убит със ' + signal : ''));
    } else if (code !== 0) {
      /* Единственият критерий за провал. */
      failed.push(name);
      console.error('\n❌ ПРОВАЛ: ' + name + ' — exit код ' + code);
      if (!stopping) {
        stopping = true;
        console.error('Спирам: нови тестове не се стартират' +
                      (running ? ', изчаквам ' + running + ' вече тръгнали.' : '.'));
      }
    } else {
      /* Оттук нататък тестът е минал. Само събираме числа за обобщението. */
      const m = text.match(SUMMARY);
      if (m) { r.ok = Number(m[1]); r.bad = Number(m[2]); }
    }

    pump();
  });
}

function pump() {
  while (!stopping && running < JOBS && next < TESTS.length) {
    running++;
    runOne(TESTS[next++]);
  }
  if (running === 0) finish();
}

function finish() {
  const wall = Date.now() - t0;
  const hung = TESTS.filter(function (n) { return results[n] && results[n].hung; });

  if (failed.length) {
    const notStarted = TESTS.length - next;
    console.error('\n═════════════════════════════');
    failed.forEach(function (n) {
      console.error('❌ ПРОВАЛ: ' + n + ' — exit код ' + results[n].status);
    });
    hung.forEach(function (n) {
      console.error('❌ ЗАБИ: ' + n + ' (>' + (timeoutFor(n) / 1000) + ' сек)');
    });
    console.error('Останалите ' + notStarted + ' теста НЕ са пускани. Общо време: ' + fmtSec(wall));
    process.exitCode = 1;
    return;
  }

  let totalOk = 0;
  let unknownCounts = 0;
  let passed = 0;
  const warnings = [];

  console.log('\n═════════════════════════════');
  TESTS.forEach(function (n) {
    const r = results[n];
    if (r.hung) return;
    passed++;
    if (r.ok === null) {
      unknownCounts++;
      warnings.push(n + ': тестът мина (exit 0), но броячът не се разчете');
    } else {
      totalOk += r.ok;
      /* Несъответствие: изходът твърди, че има падащи проверки, а exit
         кодът е 0. Не проваля пуска — само го изкарваме на светло. */
      if (r.bad > 0) warnings.push(n + ': exit 0, но в изхода пише ' + r.bad + ' падащи проверки');
    }
    console.log('✅ ' + n + '  —  ' + (r.ok === null ? 'брой неизвестен' : r.ok + ' проверки') +
                '  (' + fmtSec(r.ms) + ')');
  });
  hung.forEach(function (n) {
    console.log('❌ ' + n + '  —  ЗАБИ (>' + (timeoutFor(n) / 1000) + ' сек)');
  });

  console.log('─────────────────────────────');
  console.log('10 най-бавни:');
  TESTS.slice().sort(function (a, b) { return results[b].ms - results[a].ms; })
    .slice(0, 10).forEach(function (n) {
      console.log('   ' + fmtSec(results[n].ms).padStart(10) + '  ' + n);
    });
  console.log('─────────────────────────────');
  if (hung.length) {
    console.log('ОБЩО: ❌ ' + hung.length + ' от ' + TESTS.length + ' теста ЗАБИХА; останалите ' +
                passed + ' минаха с ' + (unknownCounts ? 'поне ' : '') + totalOk + ' проверки');
  } else {
    console.log('ОБЩО: ' + (unknownCounts ? 'поне ' : '') + totalOk +
                ' проверки, 0 падащи (' + passed + ' теста, всички с exit 0)');
  }
  console.log('Време: ' + fmtSec(wall) + ' (паралелно: ' + JOBS + ')');

  if (warnings.length) {
    console.log('\n⚠️  предупреждения (не влияят на резултата):');
    warnings.forEach(function (w) { console.log('   · ' + w); });
  }

  /* exitCode, не process.exit(): при пренасочен изход process.exit може да
     отреже недописания буфер на stdout. */
  process.exitCode = hung.length ? 1 : 0;
}

pump();
