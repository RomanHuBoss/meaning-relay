# Итерация 31 — локальные security/privacy-контракты

## Сделано

- Усилен source-level scan клиентских компонентов: клиент не читает server-only
  environment variables (`DATABASE_URL`, `SID_PEPPER`, `ADMIN_KEY`, `CRON_SECRET`,
  ключ шифрования claim-токенов и privacy/moderation contacts).
- Добавлен контракт страницы `/about`: контакты оператора и модерации проходят
  через React-текст и `mailto:`-атрибуты, а privacy-раздел связан с заголовком
  через `aria-labelledby`.
- Добавлен HTTP-контракт публичной цепочки: пользовательский текст остаётся
  JSON-данными, а сообщение с `HIDDEN` получает moderation placeholder.
  В проекте нет raw HTML injection sinks (`dangerouslySetInnerHTML`, `innerHTML`,
  `document.write`) или dynamic code execution.
- Добавлен crypto-контракт recovery/claim token: AES-256-GCM требует 32-byte
  key, ciphertext не содержит plaintext, malformed payload отклоняется.
- Добавлен source-level retention contract: inactive claims очищают
  `active_token_ciphertext`, а старые/stale recovery rows удаляются maintenance
  SQL.

## Проверки

- security/privacy targeted tests: **7 passed**;
- полный browser/axe и реальный PostgreSQL retention test остаются внешними
  gates и не считаются закрытыми этим source/unit evidence.
