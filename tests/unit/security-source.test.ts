// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(tsx?|jsx?)$/u.test(entry.name) ? [absolute] : [];
  });
}

describe("local security source contracts", () => {
  it("keeps environment access out of client components", () => {
    const clientFiles = sourceFiles(path.join(process.cwd(), "app")).concat(sourceFiles(path.join(process.cwd(), "components")))
      .filter((file) => readFileSync(file, "utf8").includes('"use client"'));

    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/process\.env\./u);
      expect(source, file).not.toMatch(/process\.env\.(?:DATABASE_URL|SID_PEPPER|ADMIN_KEY|CRON_SECRET|CLAIM_TOKEN_ENCRYPTION_KEY|PRIVACY_CONTACT_EMAIL|MODERATION_CONTACT_EMAIL)/u);
    }
  });

  it("keeps the about-page privacy contacts in escaped React attributes", () => {
    const source = readFileSync(path.join(process.cwd(), "app/about/page.tsx"), "utf8");
    expect(source).toMatch(/PRIVACY_OPERATOR_NAME/u);
    expect(source).toMatch(/PRIVACY_CONTACT_EMAIL/u);
    expect(source).toMatch(/MODERATION_CONTACT_EMAIL/u);
    expect(source).toMatch(/href=\{`mailto:\$\{privacyContact\}`\}/u);
    expect(source).toMatch(/href=\{`mailto:\$\{moderationContact\}`\}/u);
    expect(source).toMatch(/aria-labelledby="contact-heading"/u);
    expect(source).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\(/u);
  });

  it("does not use raw HTML injection or dynamic code execution", () => {
    for (const file of sourceFiles(path.join(process.cwd(), "app")).concat(sourceFiles(path.join(process.cwd(), "components")))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\(|\beval\s*\(/u);
    }
  });

  it("defines baseline response security headers", async () => {
    const routes = await nextConfig.headers?.();
    const headers = Object.fromEntries((routes?.[0]?.headers ?? []).map(({ key, value }) => [key, value]));

    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });
});
