/**
 * Записывает признак эксплуатационной ошибки без данных запроса, секретов,
 * текста SQL и произвольного содержимого исключения в серверный журнал.
 */
export function logSafeError(event: string, error: unknown): void {
  const safeEvent = /^[a-z][a-z0-9._]{0,63}$/u.test(event) ? event : "unknown";
  const errorName = error instanceof Error ? "Error" : "UnknownError";
  console.error(JSON.stringify({ event: safeEvent, error_name: errorName }));
}
