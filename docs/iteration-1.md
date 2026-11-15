# Итерация 1 / PostgreSQL adapter and HTTP contract

Дата: 14 ноября 2026

## Реализовано

- PostgreSQL pool с транзакционным helper и повтором после serialization/deadlock;
- опциональный повтор после unique conflict для конкурентного start;
- PostgresRelay с start, submit, cancel и публичным чтением цепочки;
- общий порядок блокировок chain -> claim в submit/cancel и start после определения цепочки;
- AES-256-GCM для active claim token;
- SHA-256 hash токена;
- сохранение анонимной сессии в таблицу sessions;
- переключение runtime на PostgreSQL при наличии DATABASE_URL;
- fallback на in-memory только при отсутствии DATABASE_URL;
- cookie csrf и sid по контракту ТЗ;
- constant-time сравнение CSRF cookie/header;
- закрытая схема start/submit с проверкой неизвестных полей;
- request_id в ошибках;
- previous_message в ответе start;
- вложенный публичный объект chain и базовые метрики завершённой цепочки.

## Верификация

Локально без DATABASE_URL проходят unit-тесты, lint, typecheck, production build и
HTTP smoke test. PostgreSQL транзакции не выполнялись на реальном сервере в этой
среде: для этого нужен DATABASE_URL и ключ CLAIM_TOKEN_ENCRYPTION_KEY.

## Следующий срез

- поднять PostgreSQL/Supabase и применить migrations/001_initial.sql;
- написать integration tests для race start/submit;
- добавить recover;
- довести ISO 3166 allowlist;
- вынести общие схемы запросов в shared validation;
- добавить error localization и rate limiting.

## Дополнения после контрольной проверки

- добавлен POST /api/v1/participation/recover;
- recover поддерживает ротацию opaque token и idempotent replay;
- stale recovery больше нельзя повторно использовать;
- истёкший claim не восстанавливается;
- добавлены fixed-window лимиты START=20, SUBMIT=10, RECOVER=5 на десятиминутный UTC-бакет;
- локальный fallback rate limiter проверен тестом на границе 20-го и 21-го запроса;
- HTTP smoke проверяет start → recover → recover replay.

В PostgreSQL режиме rate limiter использует атомарный INSERT ... ON CONFLICT в
таблице rate_limit_buckets.

## Публичные moderation и UI дополнения

- добавлен POST /api/v1/messages/{message_id}/reports;
- разрешены wire-причины spam, abuse, personal_data и other;
- details ограничен 1..300 Unicode code points;
- повторная жалоба одной сессии на ту же причину возвращает REPORT_DUPLICATE;
- жалоба допускается только для сообщения завершённой цепочки;
- добавлены GET /api/v1/stats/public и GET /api/v1/health;
- главная страница получает агрегированные счётчики через stats endpoint;
- собран клиентский flow landing → language → turn → received → result;
- добавлены responsive и reduced-motion стили.
