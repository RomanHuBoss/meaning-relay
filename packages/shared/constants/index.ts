// Здесь собраны общие значения предметной области, чтобы правила одинаково применялись на сервере и в клиенте.
export const CHAIN_TARGET_HOPS = 12 as const;
export const CLAIM_TTL_SECONDS = 180 as const;
export const SESSION_TTL_DAYS = 30 as const;
export const ACTIVE_CHAIN_CAP = 50 as const;
export const MAX_TEXT_CODE_POINTS = 500 as const;
export const MIN_TEXT_CODE_POINTS = 20 as const;
export const MAX_TEXT_WORDS = 60 as const;

export const SUPPORTED_LANGUAGES = ["ru", "en", "zh", "fr", "hi", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: "Русский",
  en: "Английский",
  zh: "Китайский",
  fr: "Французский",
  hi: "Хинди",
  es: "Испанский",
};

export const LANGUAGE_CHAIN_LABELS: Record<Language, string> = {
  ru: "Русская цепочка",
  en: "Английская цепочка",
  zh: "Китайская цепочка",
  fr: "Французская цепочка",
  hi: "Цепочка на хинди",
  es: "Испанская цепочка",
};

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export const CHAIN_STATUSES = ["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"] as const;
export type ChainStatus = (typeof CHAIN_STATUSES)[number];

export const CLAIM_STATUSES = ["ACTIVE", "SUBMITTED", "EXPIRED", "CANCELLED"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const MODERATION_STATUSES = ["ALLOWED", "BLOCKED", "HIDDEN"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
