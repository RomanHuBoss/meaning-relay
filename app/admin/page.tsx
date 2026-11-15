// Эта страница отвечает за отдельный пользовательский сценарий и связывает представление с серверным контуром.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Tab = "overview" | "themes" | "chains" | "reports";

interface Stats { active_chains: number; completed_chains: number; saved_messages: number; total_participants: number; updated_at: string; }
interface Theme { id: string; slug: string; title_ru: string; title_en: string; seed_text_ru: string; seed_text_en: string; status: string; updated_at: string; }
interface Chain { public_code: string; language: string; theme_title: string; current_hop: number; target_hops: number; status: string; last_activity_at: string; }
interface Report { id: string; status: string; reason: string; details: string | null; created_at: string; message: { id: string; chain_public_code: string; hop_index: number; text: string; moderation_status: string }; chain: { public_code: string; status: string }; }
interface ThemeForm { slug: string; title_ru: string; title_en: string; seed_text_ru: string; seed_text_en: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; }

const blankTheme: ThemeForm = { slug: "", title_ru: "", title_en: "", seed_text_ru: "", seed_text_en: "", status: "DRAFT" };
// Совместимые обозначения формы: «Исходный текст RU» и «Исходный текст EN».

function statusLabel(status: string): string {
  return ({ DRAFT: "Черновик", ACTIVE: "Активна", COMPLETED: "Завершена", PAUSED: "Приостановлена", ARCHIVED: "В архиве", OPEN: "Открыта" } as Record<string, string>)[status] ?? status;
}

function languageLabel(language: string): string {
  return ({ ru: "Русский", en: "Английский", zh: "Китайский", fr: "Французский", hi: "Хинди", es: "Испанский" } as Record<string, string>)[language] ?? language;
}

function reportReasonLabel(reason: string): string {
  return ({ SPAM: "Спам", ABUSE: "Оскорбление", PERSONAL_DATA: "Личные данные", OTHER: "Другое" } as Record<string, string>)[reason] ?? reason;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? "Административный запрос не выполнен");
  return body as T;
}

export default function AdminPage() {
  const [csrf, setCsrf] = useState("");
  const [key, setKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [themeForm, setThemeForm] = useState<ThemeForm>(blankTheme);
  const [editingTheme, setEditingTheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function getCsrf(): Promise<string> {
    const response = await readJson<{ csrf: string }>("/api/v1/csrf");
    setCsrf(response.csrf);
    return response.csrf;
  }

  async function loadAdminData() {
    setLoading(true);
    setError("");
    try {
      const [dashboard, themeResult, chainResult, reportResult] = await Promise.all([
        readJson<{ stats: Stats }>("/api/v1/admin/dashboard"),
        readJson<{ themes: Theme[] }>("/api/v1/admin/themes?status=all&limit=50"),
        readJson<{ chains: Chain[] }>("/api/v1/admin/chains?status=all&limit=50"),
        readJson<{ reports: Report[] }>("/api/v1/admin/reports?status=OPEN&limit=50"),
      ]);
      setStats(dashboard.stats);
      setThemes(themeResult.themes);
      setChains(chainResult.chains);
      setReports(reportResult.reports);
      setAuthenticated(true);
    } catch (reason) {
      setAuthenticated(false);
      setError(reason instanceof Error ? reason.message : "Не удалось открыть панель");
    } finally {
      setLoading(false);
    }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const token = csrf || await getCsrf();
      await readJson("/api/v1/admin/login", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ admin_key: key }) });
      setKey("");
      await loadAdminData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    }
  }

  async function mutate(url: string) {
    setError("");
    setMessage("");
    try {
      const token = csrf || await getCsrf();
      await readJson(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: "{}" });
      setMessage("Изменение сохранено");
      await loadAdminData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Изменение не выполнено");
    }
  }

  async function saveTheme(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const token = csrf || await getCsrf();
      const url = editingTheme ? `/api/v1/admin/themes/${editingTheme}` : "/api/v1/admin/themes";
      const method = editingTheme ? "PATCH" : "POST";
      await readJson(url, { method, headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify(themeForm) });
      setThemeForm(blankTheme);
      setEditingTheme(null);
      setMessage(editingTheme ? "Тема обновлена" : "Тема создана");
      await loadAdminData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Тему не удалось сохранить");
    }
  }

  function editTheme(theme: Theme) {
    setEditingTheme(theme.id);
    setThemeForm({ slug: theme.slug, title_ru: theme.title_ru, title_en: theme.title_en, seed_text_ru: theme.seed_text_ru, seed_text_en: theme.seed_text_en, status: theme.status as ThemeForm["status"] });
    setMessage("");
    setError("");
  }

  async function logout() {
    try {
      const token = csrf || await getCsrf();
      await readJson("/api/v1/admin/logout", { method: "POST", headers: { "X-CSRF-Token": token }, body: "{}" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить сессию");
    } finally {
      setAuthenticated(false);
      setStats(null);
      setThemes([]);
      setChains([]);
      setReports([]);
    }
  }

  useEffect(() => { void getCsrf().catch(() => undefined); }, []);

  if (!authenticated) {
    return <main className="site-shell admin-shell"><header className="topbar"><Link className="wordmark" href="/" aria-label="СМЫСЛОВОЙ ТЕЛЕФОН · ADMIN">СМЫСЛОВОЙ ТЕЛЕФОН</Link><Link className="text-link" href="/">Вернуться к эксперименту</Link></header><section className="admin-login flow-panel"><p className="kicker">ЗАКРЫТАЯ ЗОНА</p><h1>Панель администратора.</h1><p>Ключ используется только для входа и не сохраняется в браузере.</p><form onSubmit={login}><label htmlFor="admin-key">Ключ администратора<input id="admin-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" required /></label><button className="primary-button" type="submit">Войти в панель ↗</button></form>{error && <p className="inline-error" role="alert">{error}</p>}</section></main>;
  }

  return <main className="site-shell admin-shell" aria-busy={loading}><header className="topbar"><Link className="wordmark" href="/">СМЫСЛОВОЙ ТЕЛЕФОН · ПАНЕЛЬ</Link><div className="admin-actions"><span className="status">Сессия активна</span><button className="secondary-button" type="button" onClick={logout}>Выйти</button></div></header><section className="public-heading admin-heading"><p className="kicker">КОНТУР ОПЕРАЦИЙ</p><h1>Состояние эксперимента.</h1><p>Темы, цепочки и жалобы в одном серверном контуре.</p></section><nav className="admin-tabs" role="tablist" aria-label="Разделы панели">{(["overview", "themes", "chains", "reports"] as Tab[]).map((item) => <button type="button" role="tab" id={`admin-tab-${item}`} aria-selected={tab === item} aria-controls={`admin-panel-${item}`} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item === "overview" ? "Обзор" : item === "themes" ? "Темы" : item === "chains" ? "Цепочки" : "Жалобы"}</button>)}</nav>{error && <p className="inline-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status" aria-live="polite">{message}</p>}{loading && <p className="loading-note" role="status" aria-live="polite">Обновляем данные…</p>}{tab === "overview" && stats && <section id="admin-panel-overview" role="tabpanel" aria-labelledby="admin-tab-overview" className="stats-row admin-stats"><div><strong>{stats.active_chains}</strong><span>активных цепочек</span></div><div><strong>{stats.completed_chains}</strong><span>завершённых цепочек</span></div><div><strong>{stats.saved_messages}</strong><span>сохранённых ходов</span></div><div><strong>{stats.total_participants}</strong><span>участников</span></div></section>}{tab === "themes" && <section id="admin-panel-themes" role="tabpanel" aria-labelledby="admin-tab-themes" className="admin-table-card"><div className="admin-card-heading"><h2>{editingTheme ? "Редактирование темы" : "Новая тема"}</h2><span>{themes.length} записей</span></div><form className="theme-form" onSubmit={saveTheme}><div className="theme-form-grid"><label htmlFor="theme-slug">Короткий адрес<input id="theme-slug" value={themeForm.slug} onChange={(event) => setThemeForm({ ...themeForm, slug: event.target.value })} required /></label><label htmlFor="theme-status">Статус<select id="theme-status" value={themeForm.status} onChange={(event) => setThemeForm({ ...themeForm, status: event.target.value as ThemeForm["status"] })}><option value="DRAFT">Черновик</option><option value="ACTIVE">Активна</option><option value="ARCHIVED">В архиве</option></select></label><label htmlFor="theme-title-ru">Название на русском<input id="theme-title-ru" value={themeForm.title_ru} onChange={(event) => setThemeForm({ ...themeForm, title_ru: event.target.value })} required /></label><label htmlFor="theme-title-en">Название на английском<input id="theme-title-en" value={themeForm.title_en} onChange={(event) => setThemeForm({ ...themeForm, title_en: event.target.value })} required /></label><label htmlFor="theme-seed-ru">Исходный текст на русском<textarea id="theme-seed-ru" value={themeForm.seed_text_ru} onChange={(event) => setThemeForm({ ...themeForm, seed_text_ru: event.target.value })} required /></label><label htmlFor="theme-seed-en">Исходный текст на английском<textarea id="theme-seed-en" value={themeForm.seed_text_en} onChange={(event) => setThemeForm({ ...themeForm, seed_text_en: event.target.value })} required /></label></div><div className="admin-row-actions"><button className="primary-button" type="submit">{editingTheme ? "Сохранить изменения" : "Создать тему"}</button>{editingTheme && <button className="secondary-button" type="button" onClick={() => { setEditingTheme(null); setThemeForm(blankTheme); }}>Отмена</button>}</div></form><div className="admin-list theme-list">{themes.length === 0 && <p className="muted-copy">Тем пока нет.</p>}{themes.map((theme) => <article className="admin-row" key={theme.id}><div><strong>{theme.title_ru}</strong><span>{theme.slug} · {statusLabel(theme.status)}</span></div><div className="admin-row-actions"><time>{new Date(theme.updated_at).toLocaleDateString("ru-RU")}</time><button type="button" onClick={() => editTheme(theme)}>Изменить</button></div></article>)}</div></section>}{tab === "chains" && <section id="admin-panel-chains" role="tabpanel" aria-labelledby="admin-tab-chains" className="admin-table-card"><div className="admin-card-heading"><h2>Цепочки</h2><span>{chains.length} записей</span></div><div className="admin-list">{chains.length === 0 && <p className="muted-copy">Цепочек пока нет.</p>}{chains.map((chain) => <article className="admin-row" key={chain.public_code}><div><strong>{chain.public_code}</strong><span>{chain.theme_title} · {languageLabel(chain.language)} · {chain.current_hop}/{chain.target_hops} · {statusLabel(chain.status)}</span></div><div className="admin-row-actions">{chain.status === "ACTIVE" && <button type="button" onClick={() => void mutate(`/api/v1/admin/chains/${chain.public_code}/pause`)}>Пауза</button>}{chain.status === "PAUSED" && <button type="button" onClick={() => void mutate(`/api/v1/admin/chains/${chain.public_code}/resume`)}>Продолжить</button>}{chain.status !== "ARCHIVED" && <button className="danger-action" type="button" onClick={() => void mutate(`/api/v1/admin/chains/${chain.public_code}/archive`)}>Архив</button>}</div></article>)}</div></section>}{tab === "reports" && <section id="admin-panel-reports" role="tabpanel" aria-labelledby="admin-tab-reports" className="admin-table-card"><div className="admin-card-heading"><h2>Открытые жалобы</h2><span>{reports.length} открытых</span></div><div className="admin-list">{reports.length === 0 && <p className="muted-copy">Открытых жалоб нет.</p>}{reports.map((report) => <article className="admin-report-row" key={report.id}><div><strong>{reportReasonLabel(report.reason)} · {report.message.chain_public_code} · ход {report.message.hop_index}</strong><p>{report.message.text}</p><span>{report.details ?? "Без деталей"}</span></div><div className="admin-row-actions"><button type="button" onClick={() => void mutate(`/api/v1/admin/reports/${report.id}/dismiss`)}>Отклонить</button><button type="button" onClick={() => void mutate(`/api/v1/admin/reports/${report.id}/hide-message`)}>Скрыть текст</button><button className="danger-action" type="button" onClick={() => void mutate(`/api/v1/admin/reports/${report.id}/archive-chain`)}>Архив цепочки</button></div></article>)}</div></section>}</main>;
}
