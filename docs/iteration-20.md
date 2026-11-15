# Итерация 20 — актуализация runtime-документации

README синхронизирован с фактическим состоянием проекта: PostgreSQL-адаптер и
migrations уже присутствуют, runtime выбирает PostgreSQL при наличии
`DATABASE_URL`, а in-memory остаётся локальным/test fallback. Уточнены
production/integration требования и обязательные переменные окружения.
