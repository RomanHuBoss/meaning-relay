# Итерация 27 — security headers и статический client audit

В Next.js добавлены базовые response security headers: `nosniff`, запрет
встраивания во frame, строгая cross-origin referrer policy и запрет ненужных
camera/microphone/geolocation permissions.

Добавлены локальные contract tests, которые проверяют, что client components не
читают `process.env`, а исходники `app`/`components` не используют raw HTML
injection или dynamic code execution. Это не заменяет browser/axe/security
deployment audit, но фиксирует проверяемые локальные инварианты без внешних
ресурсов.
