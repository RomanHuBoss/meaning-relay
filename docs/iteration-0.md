# Итерация 0 / Core relay foundation

Дата: 14 ноября 2026

## Принятые решения

1. Внешний контракт relay отделён от хранилища. In-memory адаптер используется
   для быстрых детерминированных тестов, PostgreSQL будет подключён через тот же
   доменный контракт.
2. Нормализация текста выполняется в порядке trim → NFC.
3. Длина считается по Unicode code points через Array.from, а слова — через
   [\p{L}\p{N}]+.
4. Claim живёт ровно 180 секунд. После submit, cancel или expire его opaque
   token больше не выдаётся.
5. Повторный start с тем же (session_hash, idempotency_key) возвращает тот же
   claim, если request hash совпадает.
6. Повторный submit с тем же ключом возвращает уже сохранённое сообщение, если
   normalized text и country совпадают.
7. Активная публичная цепочка не раскрывает seed и промежуточные сообщения.
8. Цепочка после 12-го принятого сообщения становится COMPLETED.

## Что проверено тестами

- start replay;
- submit replay без дублирования сообщения;
- сохранение активного claim после отклонённого текста;
- истечение claim и выдача следующего участника;
- скрытие seed и сообщений на активной публичной странице;
- NFC, Unicode length, word count;
- URL, email, backslash и короткий текст;
- точный нормализованный duplicate.

## Сознательно отложено

- PostgreSQL repository и реальные транзакции SELECT FOR UPDATE;
- сессия, CSRF и cookie;
- AES-256-GCM для active token;
- полноценный ISO 3166 allowlist;
- PostgreSQL repository и замена временного in-memory runtime;
- admin API;
- rate limiting;
- production UI и E2E.

## HTTP-срез

Поверх доменного слоя добавлены same-origin Route Handlers для получения CSRF,
создания анонимной cookie-сессии, выдачи claim, submit, cancel и публичного
состояния цепочки. Smoke-проверка проходит через реальный Next dev server:
создание сессии → CSRF → start → submit → GET публичного состояния.
