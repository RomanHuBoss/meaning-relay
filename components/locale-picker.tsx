// Компонент выбирает язык интерфейса и синхронизирует выбор между страницами.
"use client";

import { useEffect, useState } from "react";

export type UiLocale = "ru" | "en" | "es" | "zh" | "fr" | "hi";

const LOCALE_OPTIONS: Array<{ value: UiLocale; label: string }> = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
  { value: "fr", label: "Français" },
  { value: "hi", label: "हिन्दी" },
];

const STORAGE_KEY = "meaning-relay:ui-locale";

function localeFromBrowser(): UiLocale {
  const value = navigator.language.toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("hi")) return "hi";
  if (value.startsWith("en")) return "en";
  return "ru";
}

function readStoredLocale(): UiLocale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return LOCALE_OPTIONS.some((option) => option.value === value) ? value as UiLocale : null;
  } catch {
    return null;
  }
}

export function useUiLocale(): [UiLocale, (locale: UiLocale) => void] {
  const [locale, setLocale] = useState<UiLocale>("ru");

  useEffect(() => {
    const stored = readStoredLocale();
    const next = stored ?? localeFromBrowser();
    setLocale(next);
    document.documentElement.lang = next;
    const syncLocale = (event: Event) => {
      const nextLocale = (event as CustomEvent<UiLocale>).detail;
      if (LOCALE_OPTIONS.some((option) => option.value === nextLocale)) setLocale(nextLocale);
    };
    window.addEventListener("meaning-relay-ui-locale", syncLocale);
    return () => window.removeEventListener("meaning-relay-ui-locale", syncLocale);
  }, []);

  function updateLocale(next: UiLocale): void {
    setLocale(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* приватный режим может отклонить запись */ }
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent("meaning-relay-ui-locale", { detail: next }));
  }

  return [locale, updateLocale];
}

export function LocalePicker() {
  const [locale, setLocale] = useUiLocale();
  return (
    <div className="locale-picker" role="group" aria-label="Язык интерфейса">
      {LOCALE_OPTIONS.map((option) => <button type="button" className={locale === option.value ? "active" : ""} aria-label={option.label} aria-pressed={locale === option.value} title={option.label} key={option.value} onClick={() => setLocale(option.value)}><span className={`locale-flag locale-flag-${option.value}`} aria-hidden="true" /><small>{option.value.toUpperCase()}</small></button>)}
    </div>
  );
}
