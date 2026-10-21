Отворено: 13.10 · Кой чака: Code · Сесия: handover-split (миграция от секция 6)

- **`currentUser.is_regional` винаги е празно на живо**: auth-login (v19,
  проверено 12.10) не връща колоната, а `llMyRegionStores()` в loading.js
  разчита на нея → регионалният никога не може да одобрява ред в Товарни
  листи (освен ако не е admin). `revaluation.js` чете `users` сам и не е
  засегнат. Поправка: is_regional в select-а на auth-login (+ деплой) или
  четене в клиента. Кой чака: Claude Code (отделна сесия).
