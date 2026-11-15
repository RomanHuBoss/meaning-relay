export interface DocumentationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DocumentationResult {
  ok: boolean;
  checks: DocumentationCheck[];
}

// Эта декларация описывает типы служебной проверки, которую импортируют модульные тесты.
export function verifyDocumentation(input: {
  readme: string;
  packageJson: { scripts?: Record<string, string> };
  envExample: string;
}): DocumentationResult;

export function readDocumentation(root?: string): Promise<DocumentationResult>;
