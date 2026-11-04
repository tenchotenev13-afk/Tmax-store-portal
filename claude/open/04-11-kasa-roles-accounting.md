Отворено: 04.11 · Кой чака: Тенчо · Сесия: etap2-inventar

- **Таб „Каса“: кодът и коментарът над него се разминават за accounting.** `shared.js`, `setupTabsForRole()`: коментарът казва „Таб Каса — само за kasa, manager, admin, accounting“, а списъкът е `var kasaRoles=['kasa','admin','manager'];` — accounting НЕ вижда таба. Намерено при инвентара за етап 2 (`claude/security-etap2-inventar.md`, т.3а). Решение: нарочно ли е accounting без Каса (тогава се поправя само коментарът), или е пропуск (тогава се добавя в списъка). Кодът не е пипан.
