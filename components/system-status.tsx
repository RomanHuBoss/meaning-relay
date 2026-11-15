// Статусная подпись верхней строки следует выбранному языку интерфейса.
"use client";

import { useUiLocale } from "./locale-picker";

type StatusKind = "stable" | "period" | "completed";

const STATUS_LABELS = {
  stable: { ru: "СИГНАЛ СТАБИЛЕН", en: "SIGNAL STABLE", es: "SEÑAL ESTABLE", zh: "信号稳定", fr: "SIGNAL STABLE", hi: "सिग्नल स्थिर" },
  period: { ru: "ПЕРИОД: 24 ЧАСА", en: "PERIOD: 24 HOURS", es: "PERIODO: 24 HORAS", zh: "周期：24小时", fr: "PÉRIODE : 24 HEURES", hi: "अवधि: 24 घंटे" },
  completed: { ru: "1 284 ЗАВЕРШЁННЫХ ЦЕПЕЙ", en: "1,284 COMPLETED CHAINS", es: "1 284 CADENAS COMPLETADAS", zh: "1,284 条已完成链", fr: "1 284 CHAÎNES TERMINÉES", hi: "1,284 पूरी श्रृंखलाएँ" },
} as const;

export function SystemStatus({ kind }: { kind: StatusKind }) {
  const [locale] = useUiLocale();
  return <strong aria-hidden="true">● {STATUS_LABELS[kind][locale]}</strong>;
}
