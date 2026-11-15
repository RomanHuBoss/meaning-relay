# Итерация 13 — восстановление пользовательского flow

Основной клиентский flow теперь сохраняет временное состояние между
перезагрузками и сетевыми retry:

- `start_idempotency_key` хранится в `localStorage` до успешной отправки;
- draft, выбранная страна и `submit_idempotency_key` сохраняются вместе с
  `claim_id`;
- claim state и opaque token хранятся только в `sessionStorage` текущей вкладки;
- после reload в той же вкладке активный claim и draft восстанавливаются;
- после закрытия вкладки draft остаётся, а token теряется;
- новый start переиспользует сохранённый idempotency key и получает новый token;
- `START_EXPIRED` и `START_CANCELLED` автоматически заменяют устаревший start
  key;
- `CLAIM_EXPIRED` и `CLAIM_CANCELLED` переводят UI в recoverable error state;
- после успешного submit все временные ключи очищаются, а отправленный текст
  остаётся на экране подтверждения.

Storage calls обёрнуты в безопасные helpers: приватный режим браузера или
запрещённое storage не ломают сам relay flow.
