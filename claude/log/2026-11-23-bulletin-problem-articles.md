# 23.11 — bulletin-problem-articles

- SHA: (попълва се след push).
- Миграция `bulletin_problem_articles`, версия 20261123130220 (приложена 23.11, `bulletin-problem-articles-schema.sql`): `problem_articles` + `bulletin_on` / `bulletin_stores` / `photo_required`; нова таблица `problem_article_done` (unique article_id + store_name, RLS select/insert/update, без delete). Проверено в базата: колоните, 3 политики, anon без DELETE/TRUNCATE, anon GET 200; 25 активни, 0 с bulletin_on (заварените остават извън Бюлетина — решение 23.11 „само новите“).
- Разлики (`stock-differences.js`): в модала на записа — „📰 Покажи в Бюлетина“ (нов — отметнат), обекти „Всички“ (NULL) / избрани (reportableStoresCache), „📸 Снимката е задължителна“; колона „Бюлетин“ „✓ X/Y обекта“ → модал по обекти (кой, кога, снимки, „Още не са“).
- Бюлетин (`bulletin.js`): блок „🏷️ Проблемни артикули“ над „📋 План за деня“ за `bulPlanForStore()`; „✅ Направено“ + снимка (bucket `bulletin-files`, префикс `problem-articles/`) → `problem_article_done`; отметнат ред — „✓ Направено дд.мм от <кой>“, без отмяна; затворен запис изчезва. Офисът вижда блока при избран обект, без бутон.
- НЕ се показва (решение 23.11): „План за деня“, календар, „Днес“, печат на Бюлетина, сутрешно писмо, седмичен отчет, push/известия, баджът „нова задача от Бюлетин“.
- Тест: `tests/bulletin-problem-articles.test.js` (68 проверки, реални кликове; 5 мутанта — убити); `razliki-etap7a/7b` — новите три полета в тялото на POST. Пълен пакет: 522 теста, exit 0.
- Проверка на живо — `claude/open/24-11-bulletin-problem-articles-live.md`.
