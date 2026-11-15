// Этот компонент управляет интерактивной частью пользовательского сценария и сохраняет доступное состояние интерфейса.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LANGUAGE_LABELS, type Language } from "../packages/shared/constants";
import { LocalePicker } from "./locale-picker";
import { PublicNav } from "./public-nav";
import { SiteBrand } from "./site-brand";
import { SystemStatus } from "./system-status";

interface ChainResponse {
  chain: { public_code: string; language: Language; status: string; current_hop: number; target_hops: number; topic: string; completed_at: string | null };
  seed?: { text: string };
  messages?: Array<{ id: string; hop_index: number; text: string; moderation_status: string }>;
  metrics?: { seed_character_count: number; final_character_count: number; seed_unique_word_count: number; final_unique_word_count: number; token_overlap_percent: number };
}

export function ChainDetail({ publicCode }: { publicCode: string }) {
  const [result, setResult] = useState<ChainResponse | null>(null);
  const [error, setError] = useState("");
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("other");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportNotice, setReportNotice] = useState<Record<string, string>>({});
  const [shareNotice, setShareNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v1/chains/${publicCode}`)
      .then(async (response) => {
        const body = await response.json() as ChainResponse & { error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Цепочка недоступна");
        if (!cancelled) setResult(body);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Цепочка недоступна"); });
    return () => { cancelled = true; };
  }, [publicCode]);

  async function submitReport(messageId: string) {
    if (reportBusy) return;
    const details = reportDetails.trim();
    if (details.length > 300) {
      setReportNotice((current) => ({ ...current, [messageId]: "Детали жалобы не должны превышать 300 символов." }));
      return;
    }
    setReportBusy(true);
    setReportNotice((current) => ({ ...current, [messageId]: "Отправляем жалобу…" }));
    try {
      const csrfResponse = await fetch("/api/v1/csrf", { credentials: "same-origin" });
      const csrfBody = await csrfResponse.json() as { csrf?: string };
      if (!csrfResponse.ok || !csrfBody.csrf) throw new Error("Не удалось подготовить защищённый запрос");
      const response = await fetch(`/api/v1/messages/${messageId}/reports`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfBody.csrf },
        body: JSON.stringify({ reason: reportReason, ...(details ? { details } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Жалобу не удалось отправить");
      setReportNotice((current) => ({ ...current, [messageId]: "Спасибо. Жалоба передана модератору." }));
      setReportDetails("");
      setReportingMessageId(null);
    } catch (reason) {
      setReportNotice((current) => ({ ...current, [messageId]: reason instanceof Error ? reason.message : "Жалобу не удалось отправить" }));
    } finally {
      setReportBusy(false);
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice("Ссылка скопирована.");
    } catch {
      setShareNotice("Не удалось скопировать ссылку. Скопируйте URL из адресной строки.");
    }
  }

  async function shareChain(): Promise<void> {
    if (navigator.share) {
      try {
        await navigator.share({ title: result?.chain.topic ?? "Смысловой телефон", text: "Завершённая цепочка смысловых пересказов", url: window.location.href });
        setShareNotice("Ссылка готова к отправке.");
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      }
    }
    await copyLink();
  }

  return (
    <main className="site-shell public-page">
      <div className="system-bar"><SiteBrand /><SystemStatus kind="stable" /><div className="system-bar-right"><LocalePicker /></div></div>
      <PublicNav active="gallery" />
      {error && <section className="flow-panel centered" role="alert" aria-labelledby="chain-error-heading"><p className="kicker">ЦЕПОЧКА НЕДОСТУПНА</p><h1 id="chain-error-heading">{error}</h1><Link className="primary-button" href="/chains">Вернуться в галерею</Link></section>}
      {!result && !error && <section className="flow-panel centered" role="status" aria-live="polite" aria-labelledby="chain-loading-heading"><div className="spinner" aria-hidden="true" /><p id="chain-loading-heading">Загружаем цепочку…</p></section>}
      {result && result.chain.status !== "COMPLETED" && <section className="flow-panel centered"><p className="kicker">{result.chain.status === "PAUSED" ? "ЦЕПОЧКА ПРИОСТАНОВЛЕНА" : "АКТИВНАЯ ЦЕПОЧКА"} · {result.chain.public_code}</p><h1>{result.chain.topic}</h1><p>{result.chain.current_hop} из {result.chain.target_hops} ходов · {LANGUAGE_LABELS[result.chain.language]}</p>{result.chain.status === "ACTIVE" ? <><p>Продолжи именно эту цепочку, чтобы следующий пересказ остался частью общей истории.</p><Link className="primary-button" href={`/?join=1&code=${result.chain.public_code}&language=${result.chain.language}`}>Продолжить именно эту цепочку ↗</Link></> : <><p>Эта цепочка временно не принимает новые ходы.</p><Link className="primary-button" href="/">Вернуться в общий пул ↗</Link></>}</section>}
      {result && result.chain.status === "COMPLETED" && <section className="result-layout">
        <div className="result-heading"><p className="kicker">ЗАВЕРШЁННАЯ ЦЕПОЧКА · {result.chain.public_code}</p><h1>{result.chain.topic}</h1><p>{result.chain.current_hop} из {result.chain.target_hops} ходов · {LANGUAGE_LABELS[result.chain.language]}</p><div className="result-actions"><button className="secondary-button" type="button" onClick={() => void copyLink()}>Скопировать ссылку</button><button className="primary-button" type="button" onClick={() => void shareChain()}>Поделиться ↗</button></div>{shareNotice && <p className="share-notice" role="status" aria-live="polite">{shareNotice}</p>}</div>
        {result.seed && <article className="result-seed"><span>НАЧАЛО</span><p>{result.seed.text}</p></article>}
        <div className="message-timeline">{result.messages?.map((message) => <article className={message.hop_index === result.chain.target_hops ? "timeline-card final" : "timeline-card"} key={message.hop_index}><span>ХОД {message.hop_index}</span><p>{message.text}</p><button id={`report-toggle-${message.id}`} className="report-toggle" type="button" aria-expanded={reportingMessageId === message.id} aria-controls={`report-form-${message.id}`} onClick={() => { setReportingMessageId((current) => current === message.id ? null : message.id); setReportNotice((current) => ({ ...current, [message.id]: "" })); }}>Пожаловаться</button>{reportingMessageId === message.id && <div id={`report-form-${message.id}`} className="report-form" role="region" aria-labelledby={`report-toggle-${message.id}`}><label htmlFor={`report-reason-${message.id}`}>Причина<select id={`report-reason-${message.id}`} value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Спам</option><option value="abuse">Оскорбление или вредный контент</option><option value="personal_data">Персональные данные</option><option value="other">Другое</option></select></label><label htmlFor={`report-details-${message.id}`}>Детали<textarea id={`report-details-${message.id}`} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={300} placeholder="Можно оставить пояснение" /></label><div className="report-form-footer"><span>{Array.from(reportDetails).length} / 300</span><button className="primary-button" type="button" onClick={() => void submitReport(message.id)} disabled={reportBusy}>{reportBusy ? "Отправляем…" : "Отправить жалобу"}</button></div></div>}{reportNotice[message.id] && <p className="report-notice" role="status" aria-live="polite">{reportNotice[message.id]}</p>}</article>)}</div>
        {result.metrics && <section className="metrics-grid" aria-label="Метрики завершённой цепочки"><div><strong>{result.metrics.token_overlap_percent}%</strong><span>пересечение токенов</span></div><div><strong>{result.metrics.seed_character_count}</strong><span>символов в начале</span></div><div><strong>{result.metrics.final_character_count}</strong><span>символов в финале</span></div></section>}
      </section>}
      <footer><span>СМЫСЛОВОЙ ТЕЛЕФОН</span><span>Читай · Пересказывай · Передавай</span></footer>
    </main>
  );
}
