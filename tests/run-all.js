/* Пуска всички jsdom тестове на портала последователно.
   Спира при първия провал (exit 1); при пълен успех — обобщение и exit 0.
   Изключение: тест, който ЗАБИЕ (над TEST_TIMEOUT_MS), се убива, отчита се
   като ❌ „ЗАБИ" и пускът продължава със следващия — един увиснал тест не
   бива да крие резултата на останалите. Общият резултат тогава е червен.

   Тестовете приемат корена на репото като argv[2]. Подаваме го явно,
   за да не зависи резултатът от това откъде е извикана командата.

   КРИТЕРИЙ ЗА УСПЕХ/ПРОВАЛ Е САМО EXIT КОДЪТ на всеки тест.
   Текстът в изхода не решава нищо — регексът долу служи единствено
   за събиране на общия брой проверки. Ако не хване число, това е
   предупреждение, не провал. */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
/* Цял тест тече секунди; над 120 сек значи увиснал (22.09.2026 пакетът стоя
   над 10 мин на task-report-schedule.test.js, който сам минава за 10 сек). */
const TEST_TIMEOUT_MS = 120000;
const TESTS = [
  'client-groups.test.js',
  'client-order-double-submit.test.js',
  'client-order-from-store.test.js',
  'client-order-store-sync.test.js',
  'contacts-id-collision.test.js',
  'id-collisions.test.js',
  'co-processed.test.js',
  'order-numbering.test.js',
  'paid-transport.test.js',
  'co-sap-banner-state.test.js',
  'stock-differences.test.js',
  'sbget-errors.test.js',
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
  'loading-lists-store.test.js',
  'loading-lists-pallets.test.js',
  'loading-lists-pallet-default.test.js',
  'loading-lists-unit-views.test.js',
  'loading-lists-labels.test.js',
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
  'bulletin-week-default.test.js',
  'bulletin-completion-day-lock.test.js',
  'span-lock-completion.test.js',
  'bulletin-store-denominator.test.js',
  'analysis-postponed.test.js',
  'wrong-receipt-tab.test.js',
  'wrong-receipt-store-submit.test.js',
  'diff-email-pending.test.js',
  'diff-return-order.test.js',
  'diff-order-required.test.js',
  'diff-order-wrong-receipt.test.js',
  'diff-form-qty-labels.test.js',
  'diff-excel-export.test.js',
  'sr-excel-one-sheet-qty-label.test.js',
  'diff-return-completed.test.js',
  'sr-store-comment.test.js',
  'sr-diff-list-import.test.js',
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
  'report-returns-list.test.js',
  'report-late-section.test.js',
  'report-transit-warehouse.test.js',
  'report-grid.test.js',
  'email-encoding.test.js',
  'email-subject-rfc2047.test.js',
  'daily-turnover.test.js',
  'kasa-tab-routing.test.js',
  'pallets-summary.test.js',
  'supply.test.js',
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
  'checklist-full-form.test.js',
  'transfers-create.test.js',
  'report-service-troyan.test.js',
  'admin-user-store-list.test.js',
  'transfers-confirm.test.js',
  'transfers-reload-search.test.js',
  'transfers-reship.test.js',
  'transfers-stale.test.js',
  'task-completions-row-cap.test.js',
  'task-type-notice.test.js',
  'overdue-recurring.test.js',
  'today-window-task.test.js',
  'today-current-week-bulletin.test.js',
  'task-completion-duplicates.test.js',
  'co-elapsed-backdated.test.js',
  'co-detail-modal.test.js',
  'co-new-for-fulfiller.test.js',
  'recurring-task-skips.test.js',
  'recurring-task-skips-consumers.test.js',
  'recurring-task-skips-report.test.js',
  'recurring-task-skips-notify.test.js',
  'recurring-task-skips-responder.test.js',
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
  'contact-detail.test.js',
  'contacts-directory.test.js',
  'contacts-home.test.js',
  'contacts-photos.test.js',
  'co-row-click.test.js',
  'co-row-all-items.test.js',
  'co-compact-row.test.js',
  'co-warehouse-fulfiller-buttons.test.js',
  'nav-tabs-css.test.js',
  'table-scroll.test.js'
];

/* Броячът не е изписан еднакво навсякъде — едни тестове казват
   "0 неуспешни", други "0 провалени". Хващаме и двата варианта. */
const SUMMARY = /(\d+)\s+успешни,\s*(\d+)\s+(?:неуспешни|провалени)/;

let totalOk = 0;
let unknownCounts = 0;
const rows = [];
const warnings = [];
const hung = [];

for (let i = 0; i < TESTS.length; i++) {
  const name = TESTS[i];
  const file = path.join(__dirname, name);

  if (!fs.existsSync(file)) {
    console.error('\n❌ ЛИПСВА ФАЙЛ: ' + name);
    process.exit(1);
  }

  console.log('\n━━━ ' + name + ' ━━━');
  const res = spawnSync(process.execPath, [file, ROOT],
    { encoding: 'utf8', timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
  const out = (res.stdout || '') + (res.stderr || '');
  process.stdout.write(out);

  /* Забил тест: убит от timeout-а. Отчита се и се продължава. */
  if ((res.error && res.error.code === 'ETIMEDOUT') || res.signal) {
    console.error('\n❌ ЗАБИ (>' + (TEST_TIMEOUT_MS / 1000) + ' сек): ' + name +
                  (res.signal ? ' — убит със ' + res.signal : ''));
    hung.push(name);
    continue;
  }

  /* Единственият критерий за провал. */
  if (res.status !== 0) {
    console.error('\n❌ ПРОВАЛ: ' + name + ' — exit код ' + res.status);
    console.error('Спирам. Останалите ' + (TESTS.length - i - 1) + ' теста НЕ са пускани.');
    process.exit(1);
  }

  /* Оттук нататък тестът е минал. Само събираме числа за обобщението. */
  const m = out.match(SUMMARY);
  if (!m) {
    unknownCounts++;
    rows.push({ name: name, ok: null });
    warnings.push(name + ': тестът мина (exit 0), но броячът не се разчете');
    continue;
  }

  const ok = Number(m[1]);
  const bad = Number(m[2]);
  totalOk += ok;
  rows.push({ name: name, ok: ok });

  /* Несъответствие: изходът твърди, че има падащи проверки, а exit кодът е 0.
     Не проваля пуска — само го изкарваме на светло. */
  if (bad > 0) {
    warnings.push(name + ': exit 0, но в изхода пише ' + bad + ' падащи проверки');
  }
}

console.log('\n═════════════════════════════');
rows.forEach(function (r) {
  console.log('✅ ' + r.name + '  —  ' + (r.ok === null ? 'брой неизвестен' : r.ok + ' проверки'));
});
hung.forEach(function (n) {
  console.log('❌ ' + n + '  —  ЗАБИ (>' + (TEST_TIMEOUT_MS / 1000) + ' сек)');
});
console.log('─────────────────────────────');
if (hung.length) {
  console.log('ОБЩО: ❌ ' + hung.length + ' от ' + TESTS.length + ' теста ЗАБИХА; останалите ' +
              rows.length + ' минаха с ' + (unknownCounts ? 'поне ' : '') + totalOk + ' проверки');
} else {
  console.log('ОБЩО: ' + (unknownCounts ? 'поне ' : '') + totalOk +
              ' проверки, 0 падащи (' + rows.length + ' теста, всички с exit 0)');
}

if (warnings.length) {
  console.log('\n⚠️  предупреждения (не влияят на резултата):');
  warnings.forEach(function (w) { console.log('   · ' + w); });
}

process.exit(hung.length ? 1 : 0);
