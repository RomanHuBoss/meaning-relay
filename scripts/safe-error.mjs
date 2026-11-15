// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global console */

export function logSafeError(event, error) {
  const safeEvent = /^[a-z][a-z0-9._]{0,63}$/u.test(event) ? event : "unknown";
  const errorName = error instanceof Error ? "Error" : "UnknownError";
  console.error(JSON.stringify({ event: safeEvent, error_name: errorName }));
}

