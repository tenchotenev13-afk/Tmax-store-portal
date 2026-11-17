Отворено: 17.11 · Кой чака: Тенчо · Сесия: sutreshno-obekt-500

**`bulletin-notify`: темите в едно пускане на крона не са изолирани една от друга.**

В `Deno.serve` (пускане без `topic_key`) темите вървят една след друга: `for (const t of due) { results.push(await runTopic(supabase, t, bg, dryRun)); }`. Няма try/catch около отделната тема. Хвърли ли една тема, изключението стига до общия catch → 500, а темите след нея в същото пускане НЕ се изпълняват (и не записват `last_run_at`, тоест се пробват пак в следващото събуждане, ако прозорецът им още е отворен).

Повод: 500 на `store_open_items` на 17.11 в 05:45 UTC (сесия sutreshno-obekt-500). Там причината беше хвърлящ `fetch` в `sendEmail` — поправен във v22 (`sendEmail` вече връща false), и `store_open_items` има try/catch на обект. Другите теми (`overdue_tasks`, `loading_lists_pending`, `deadline_passed`, `promo_expiring`, `today_deadlines`, `minus_unfilled`) нямат вътрешна защита — грешка в база/данни при тях пак би спряла следващите теми.

Решение за по-късно (не е правено): try/catch около `runTopic` в цикъла + `console.error`, грешката в `results` (и по желание в `last_status` на темата). Трябва тест с две теми в едно пускане, първата хвърля.
