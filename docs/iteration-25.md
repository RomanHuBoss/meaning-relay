# Итерация 25 — безопасная ошибка readiness verifier

Fallback-ошибка самого readiness verifier также нормализуется: в stderr
попадает только стабильное имя класса `Error` или `UnknownError`, без
произвольного `error.name`. Это сохраняет общий safe-log контракт даже при
ошибке чтения fixture или файловой системы.
