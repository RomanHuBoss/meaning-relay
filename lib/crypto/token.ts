// Этот модуль защищает чувствительные токены при передаче и хранении, не раскрывая их исходное значение.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  // Ключ читается только при обращении к PostgreSQL, поэтому локальный режим
  // без базы не требует искусственного секрета для запуска приложения.
  const value = process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("CLAIM_TOKEN_ENCRYPTION_KEY is required when PostgreSQL relay is enabled");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("CLAIM_TOKEN_ENCRYPTION_KEY must be base64 encoded 32 bytes");
  return key;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptToken(token: string): string {
  // Для каждого токена создаётся новый вектор и сохраняется тег проверки
  // целостности; разделитель позволяет безопасно восстановить три части.
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(payload: string): string {
  // Неполная или изменённая строка должна завершиться ошибкой до расшифровки,
  // чтобы повреждённый токен не воспринимался как действительный.
  const [ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Invalid encrypted token payload");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
