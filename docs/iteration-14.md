# Итерация 14 — invite/join flow

Добавлен полный сценарий приглашения следующего участника:

- `/c/{public_code}` стал публичным alias маршрутом цепочки;
- active chain показывает кнопку «Продолжить именно эту цепочку»;
- paused chain явно сообщает, что новые ходы временно недоступны, и предлагает
  вернуться в общий пул;
- после непоследнего submit участник может скопировать
  `/c/{public_code}?join=1&language={language}`;
- root flow распознаёт query `join=1`, показывает подтверждение и вызывает
  `POST /api/v1/participation/start` с конкретным `public_code`;
- invite и random pool используют разные localStorage idempotency namespaces;
- после успешного submit оба возможных start keys очищаются.

Таким образом, приглашённый пользователь не получает случайную цепочку вместо
указанной, а ошибки `CHAIN_BUSY`, `CHAIN_COMPLETED`, `CHAIN_PAUSED`,
`CHAIN_ARCHIVED` и `SESSION_ALREADY_PARTICIPATED` проходят через стандартный
error state существующего relay flow.
