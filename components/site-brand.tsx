// Кликабельный бренд объединяет верхнюю строку и переход на главную страницу.
"use client";

import Link from "next/link";
import { useUiLocale } from "./locale-picker";

const BRAND_LABELS = {
  ru: "СМЫСЛОВОЙ ТЕЛЕФОН",
  en: "MEANING RELAY",
  es: "TELÉFONO DEL SENTIDO",
  zh: "意义接力",
  fr: "TÉLÉPHONE DU SENS",
  hi: "अर्थ फ़ोन",
} as const;

export function SiteBrand() {
  const [locale] = useUiLocale();
  return (
    <Link className="system-brand" href="/" aria-label={`${BRAND_LABELS[locale]} — на главную`}>
      <svg className="brain-mark" viewBox="0 0 32 24" aria-hidden="true">
        <path d="M10 4.5C8.1 2.2 4.2 3.2 4.2 6.2c-2.5.2-3.4 3.3-1.5 4.8-1.5 2.2.4 4.7 2.8 4.6-.1 3.2 4.2 4.4 5.6 1.8M10 4.5c-.5 2.1-.5 4.2 0 6.3-.5 2.1-.4 4.4 1.1 6.2M22 4.5c1.9-2.3 5.8-1.3 5.8 1.7 2.5.2 3.4 3.3 1.5 4.8 1.5 2.2-.4 4.7-2.8 4.6.1 3.2-4.2 4.4-5.6 1.8M22 4.5c.5 2.1.5 4.2 0 6.3.5 2.1.4 4.4-1.1 6.2M10 10.8c1.7-1.2 3.3-1.2 6 0 2.7-1.2 4.3-1.2 6 0M16 3.2v17.5" />
      </svg>
      <span>{BRAND_LABELS[locale]}</span>
    </Link>
  );
}
