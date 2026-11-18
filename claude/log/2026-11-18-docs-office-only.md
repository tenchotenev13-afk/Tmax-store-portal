# 18.11 — docs-office-only

- Инструкции: нова папка „🔒 Само за офиса" (`documents.category = 'Само за офиса'`), видима само за role 'admin' (`docsOfficeVisible()` в `docs.js`). Документите от нея не се показват при „Всички" за останалите; иконата е 🔒.
- `index.html`: бутон `#doc-filter-office` във `#doc-filters` и опция `#d-cat-office` в `#d-cat` — скрити по подразбиране, показват се от `docsApplyOfficeUi()` при всеки `renderDocs()` и при отваряне на модала (`resetDocModal()`); `submitDoc` отказва категорията без достъп.
- SHA: `f35c47d` (push в main 18.11, Pages сверен — docs.js и index.html байт в байт с комита).
- Без схемна промяна и без миграция (няма CHECK по `category`) → няма ред за Живко.
- Тест: `tests/docs-office-only.test.js` (49 проверки, 5 мутанта — всеки го събаря).
