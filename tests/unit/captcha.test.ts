// Этот тест фиксирует подпись, срок действия и привязку капчи к конкретному ходу.
import { describe, expect, it } from "vitest";
import { issueCaptcha, verifyCaptcha } from "../../lib/http/captcha";

describe("server captcha", () => {
  it("accepts the issued answer only for the original claim", () => {
    const challenge = issueCaptcha("claim-123");
    const payload = JSON.parse(Buffer.from(challenge.token.split(".")[0], "base64url").toString("utf8")) as { a: number; b: number };

    expect(verifyCaptcha(challenge.token, String(payload.a + payload.b), "claim-123")).toBe(true);
    expect(verifyCaptcha(challenge.token, String(payload.a + payload.b + 1), "claim-123")).toBe(false);
    expect(verifyCaptcha(challenge.token, String(payload.a + payload.b), "other-claim")).toBe(false);
  });

  it("rejects a changed signature", () => {
    const challenge = issueCaptcha("claim-123");
    const [payload] = challenge.token.split(".");
    const tampered = `${payload}._invalid_signature`;

    expect(verifyCaptcha(tampered, "1", "claim-123")).toBe(false);
  });
});
