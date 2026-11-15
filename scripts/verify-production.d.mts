// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
export interface ProductionPreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
  severity: string;
}

export interface ProductionPreflightResult {
  mode: "local" | "production";
  ok: boolean;
  checks: ProductionPreflightCheck[];
}

export function verifyPreflight(
  env: Record<string, string | undefined>,
  vercel: unknown,
): ProductionPreflightResult;

export function readPreflight(root?: string): Promise<ProductionPreflightResult>;
