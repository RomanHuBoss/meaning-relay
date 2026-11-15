# Итерация 24 — нормализация CLI log markers

CLI logger получил ту же защиту, что и серверный `logSafeError`: event labels
проходят whitelist, неподходящие labels заменяются на `unknown`, а имя ошибки
нормализуется к `Error` или `UnknownError`. Это исключает утечку через
кастомный `Error.name` или динамическое имя события в migration/seed logs.
