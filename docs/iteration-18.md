# Итерация 18 — безопасные серверные логи

Все серверные error-paths теперь используют `logSafeError`: в лог попадают
только стабильный operational event и имя класса ошибки. Тексты запросов,
пользовательские сообщения, SQL, токены и секреты не сериализуются в логи.

Покрыты HTTP error handlers, admin routes, admin login/logout/dashboard и
maintenance route. Добавлен unit-тест, который проверяет отсутствие текста
ошибки и секретного значения в emitted log record.
