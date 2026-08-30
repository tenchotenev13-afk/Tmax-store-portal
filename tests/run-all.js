/* Пуска всички jsdom тестове на портала последователно.
   Спира при първия провал (exit 1); при пълен успех — обобщение и exit 0.

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
const TESTS = [
  'client-groups.test.js',
  'contacts-id-collision.test.js',
  'id-collisions.test.js',
  'co-processed.test.js',
  'order-numbering.test.js',
  'paid-transport.test.js',
  'stock-differences.test.js',
  'sbget-errors.test.js',
  'stock-diff-null-payload.test.js',
  'stock-diff-status-labels.test.js',
  'catalog-lookup.test.js',
  'diff-submit-validation.test.js',
  'stock-diff-capitalized-counter.test.js',
  'stock-diff-chip-counts.test.js',
  'stock-diff-responsibility.test.js',
  'stock-diff-status-new.test.js',
  'stock-diff-print.test.js',
  'diff-print-supplier-col.test.js',
  'diff-delete-report.test.js',
  'diff-email-internal-comment.test.js',
  'diff-email-recipients-files.test.js',
  'shared-write-errors.test.js',
  'admin-user-create-select.test.js',
  'store-cache-invalidation.test.js',
  'return-proof.test.js',
  'sd-badge-hidden-tab.test.js',
  'delete-three-states.test.js',
  'storno-embed-no-in-list.test.js',
  'storno-age-limit-exempt.test.js',
  'linked-module-buttons.test.js',
  'recurring-edit-department.test.js',
  'recurring-due-window.test.js',
  'recurring-window-report.test.js',
  'bulletin-week-default.test.js',
  'bulletin-completion-day-lock.test.js',
  'bulletin-store-denominator.test.js',
  'wrong-receipt-tab.test.js',
  'today-wrong-receipt-row.test.js',
  'notifications-poll.test.js',
  'weekly-report-window.test.js',
  'weekly-report-lists-window.test.js',
  'weekly-report-item-dates.test.js',
  'report-store-list.test.js',
  'report-email-shell.test.js',
  'weekly-cross-window.test.js',
  'weekly-routing-window.test.js',
  'report-ranking-plural.test.js',
  'report-scope-notice.test.js',
  'report-edge-sync.test.js',
  'report-daily-date.test.js',
  'report-daily-scope.test.js',
  'report-grid.test.js',
  'email-encoding.test.js',
  'email-subject-rfc2047.test.js',
  'daily-turnover.test.js',
  'kasa-tab-routing.test.js',
  'pallets-summary.test.js',
  'oborot-bulletin-link.test.js',
  'admin-oborot-report.test.js',
  'regional-flag.test.js',
  'bulletin-dept-move-order.test.js',
  'co-role-filter.test.js',
  'late-flag.test.js',
  'task-completion-files.test.js',
  /* overdue-recipients.test.js отпадна на 27.08.2026 заедно с логиката, която
     проверяваше — наследникът му е notify-topic-button.test.js по-долу. */
  'kasa-return-status.test.js',
  'kasa-return-editable.test.js',
  'kasa-history-order.test.js',
  'kasa-history-window.test.js',
  'kasa-returned-in-reports.test.js',
  'report-groups-users.test.js',
  'no-auto-push-on-load.test.js',
  'notify-topic-button.test.js',
  'admin-notifications.test.js',
  'notify-schedule-stores.test.js'
];

/* Броячът не е изписан еднакво навсякъде — едни тестове казват
   "0 неуспешни", други "0 провалени". Хващаме и двата варианта. */
const SUMMARY = /(\d+)\s+успешни,\s*(\d+)\s+(?:неуспешни|провалени)/;

let totalOk = 0;
let unknownCounts = 0;
const rows = [];
const warnings = [];

for (let i = 0; i < TESTS.length; i++) {
  const name = TESTS[i];
  const file = path.join(__dirname, name);

  if (!fs.existsSync(file)) {
    console.error('\n❌ ЛИПСВА ФАЙЛ: ' + name);
    process.exit(1);
  }

  console.log('\n━━━ ' + name + ' ━━━');
  const res = spawnSync(process.execPath, [file, ROOT], { encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  process.stdout.write(out);

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
console.log('─────────────────────────────');
console.log('ОБЩО: ' + (unknownCounts ? 'поне ' : '') + totalOk +
            ' проверки, 0 падащи (' + rows.length + ' теста, всички с exit 0)');

if (warnings.length) {
  console.log('\n⚠️  предупреждения (не влияят на резултата):');
  warnings.forEach(function (w) { console.log('   · ' + w); });
}

process.exit(0);
