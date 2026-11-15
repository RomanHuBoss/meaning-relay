// Эта страница отвечает за отдельный пользовательский сценарий и связывает представление с серверным контуром.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type Language } from "../../packages/shared/constants";
import { LocalePicker, type UiLocale, useUiLocale } from "../../components/locale-picker";
import { PublicNav } from "../../components/public-nav";
import { SiteBrand } from "../../components/site-brand";
import { SystemStatus } from "../../components/system-status";

type LanguageFilter = "all" | Language;
type PeriodFilter = "all" | "30d" | "365d";

interface GalleryChain {
  public_code: string;
  language: Language;
  theme_title: string;
  completed_at: string;
  target_hops: number;
}

interface GalleryResponse {
  chains: GalleryChain[];
  next_cursor: string | null;
}

const galleryCopy: Record<UiLocale, { kicker: string; title: string; lede: string; allLanguages: string; language: string; period: string; allTime: string; year: string; month: string; theme: string; themePlaceholder: string; emptyKicker: string; emptyTitle: string; emptyText: string; start: string; loading: string; loadMore: string; turns: string; open: string }> = {
  ru: { kicker: "АРХИВ СМЫСЛА", title: "Цепочки, которые дошли до конца.", lede: "Каждая карточка — это одна мысль, прошедшая через двенадцать независимых пересказов.", allLanguages: "Все", language: "Язык", period: "Период", allTime: "Всё время", year: "Последний год", month: "Последние 30 дней", theme: "Тема", themePlaceholder: "Все темы", emptyKicker: "ПОКА ПУСТО", emptyTitle: "Завершённых цепочек ещё нет.", emptyText: "Стань первым участником, который поможет новой мысли дойти до финала.", start: "Начать цепочку", loading: "Загружаем архив…", loadMore: "Показать ещё", turns: "ходов", open: "Открыть цепочку" },
  en: { kicker: "MEANING ARCHIVE", title: "Chains that made it to the end.", lede: "Each card holds one thought carried through twelve independent retellings.", allLanguages: "All", language: "Language", period: "Period", allTime: "All time", year: "Last year", month: "Last 30 days", theme: "Theme", themePlaceholder: "All themes", emptyKicker: "NOTHING HERE YET", emptyTitle: "No completed chains yet.", emptyText: "Be the first participant to help a new thought reach the end.", start: "Start a chain", loading: "Loading the archive…", loadMore: "Show more", turns: "turns", open: "Open chain" },
  es: { kicker: "ARCHIVO DEL SENTIDO", title: "Cadenas que llegaron al final.", lede: "Cada tarjeta guarda una idea que pasó por doce recuentos independientes.", allLanguages: "Todos", language: "Idioma", period: "Periodo", allTime: "Todo el tiempo", year: "Último año", month: "Últimos 30 días", theme: "Tema", themePlaceholder: "Todos los temas", emptyKicker: "AÚN VACÍO", emptyTitle: "Todavía no hay cadenas completadas.", emptyText: "Sé la primera persona en ayudar a una idea a llegar al final.", start: "Iniciar cadena", loading: "Cargando el archivo…", loadMore: "Mostrar más", turns: "turnos", open: "Abrir cadena" },
  zh: { kicker: "意义档案", title: "走到终点的链条。", lede: "每张卡片是一种思想，经过十二次独立转述。", allLanguages: "全部", language: "语言", period: "时间", allTime: "全部时间", year: "最近一年", month: "最近30天", theme: "主题", themePlaceholder: "所有主题", emptyKicker: "暂时为空", emptyTitle: "还没有完成的链条。", emptyText: "成为第一位参与者，帮助新的思想走到终点。", start: "开始链条", loading: "正在加载档案…", loadMore: "显示更多", turns: "回合", open: "打开链条" },
  fr: { kicker: "ARCHIVE DU SENS", title: "Les chaînes arrivées au bout.", lede: "Chaque carte contient une pensée passée par douze reformulations indépendantes.", allLanguages: "Toutes", language: "Langue", period: "Période", allTime: "Tout le temps", year: "Dernière année", month: "30 derniers jours", theme: "Thème", themePlaceholder: "Tous les thèmes", emptyKicker: "PAS ENCORE", emptyTitle: "Aucune chaîne terminée.", emptyText: "Soyez la première personne à aider une pensée à atteindre la fin.", start: "Commencer une chaîne", loading: "Chargement de l’archive…", loadMore: "Afficher plus", turns: "tours", open: "Ouvrir la chaîne" },
  hi: { kicker: "अर्थ का संग्रह", title: "वे श्रृंखलाएँ जो अंत तक पहुँचीं।", lede: "हर कार्ड एक विचार है जो बारह स्वतंत्र दोहरावों से गुज़रा।", allLanguages: "सभी", language: "भाषा", period: "अवधि", allTime: "हर समय", year: "पिछला वर्ष", month: "पिछले 30 दिन", theme: "विषय", themePlaceholder: "सभी विषय", emptyKicker: "अभी खाली", emptyTitle: "अभी कोई पूरी श्रृंखला नहीं है।", emptyText: "पहले प्रतिभागी बनें और नए विचार को अंत तक पहुँचाएँ।", start: "श्रृंखला शुरू करें", loading: "संग्रह लोड हो रहा है…", loadMore: "और दिखाएँ", turns: "चरण", open: "श्रृंखला खोलें" },
};

export default function ChainsPage() {
  const [uiLocale] = useUiLocale();
  const copy = galleryCopy[uiLocale];
  const [language, setLanguage] = useState<LanguageFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [theme, setTheme] = useState("all");
  const [chains, setChains] = useState<GalleryChain[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(reset = false, cursorOverride: string | null = null) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ language, period, theme, limit: "12" });
      const pageCursor = reset ? null : cursorOverride ?? cursor;
      if (pageCursor) params.set("cursor", pageCursor);
      const response = await fetch(`/api/v1/chains?${params.toString()}`);
      const body = await response.json() as GalleryResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Не удалось загрузить цепочки");
      setChains((current) => reset ? body.chains : [...current, ...body.chains]);
      setNextCursor(body.next_cursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить цепочки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCursor(null);
    void load(true);
    // Изменение фильтров намеренно запускает новый запрос галереи.
  }, [language, period, theme]);

  function loadNext() {
    if (!nextCursor || loading) return;
    const pageCursor = nextCursor;
    setCursor(pageCursor);
    void load(false, pageCursor);
  }

  return (
    <main className="site-shell public-page">
      <div className="system-bar"><SiteBrand /><SystemStatus kind="completed" /><div className="system-bar-right"><LocalePicker /></div></div>
      <PublicNav active="gallery" />

      <section className="public-heading">
        <p className="kicker">{copy.kicker}</p>
        <h1>{copy.title}</h1>
        <p>{copy.lede}</p>
      </section>

      <section className="filter-bar" aria-label="Фильтры галереи">
        <label>{copy.language}<select value={language} onChange={(event) => setLanguage(event.target.value as LanguageFilter)}><option value="all">{copy.allLanguages}</option>{SUPPORTED_LANGUAGES.map((code) => <option value={code} key={code}>{LANGUAGE_LABELS[code]}</option>)}</select></label>
        <label>{copy.period}<select value={period} onChange={(event) => setPeriod(event.target.value as PeriodFilter)}><option value="all">{copy.allTime}</option><option value="365d">{copy.year}</option><option value="30d">{copy.month}</option></select></label>
        <label className="theme-filter">{copy.theme}<input aria-label={copy.theme} value={theme === "all" ? "" : theme} onChange={(event) => setTheme(event.target.value.trim().toLowerCase() || "all")} placeholder={copy.themePlaceholder} /></label>
      </section>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {!loading && !error && chains.length === 0 && <section className="empty-state"><span className="kicker">{copy.emptyKicker}</span><h2>{copy.emptyTitle}</h2><p>{copy.emptyText}</p><Link className="primary-button" href="/?join=1">{copy.start} ↗</Link></section>}
      <section className="gallery-grid" aria-live="polite">
        {chains.map((chain) => (
          <article className="gallery-card" key={chain.public_code}>
            <div className="gallery-card-top"><span className="chain-language">{chain.language.toUpperCase()}</span><span>{new Date(chain.completed_at).toLocaleDateString(uiLocale === "ru" ? "ru-RU" : uiLocale)}</span></div>
            <h2>{chain.theme_title}</h2>
            <div className="gallery-card-bottom"><span>{chain.target_hops} {copy.turns}</span><Link href={`/chains/${chain.public_code}`}>{copy.open} <span aria-hidden="true">↗</span></Link></div>
          </article>
        ))}
      </section>
      {loading && <p className="loading-note">{copy.loading}</p>}
      {!loading && nextCursor && <button className="secondary-button load-more" onClick={loadNext}>{copy.loadMore}</button>}
      <footer><span>СМЫСЛОВОЙ ТЕЛЕФОН</span><span>Читай · Пересказывай · Передавай</span></footer>
    </main>
  );
}
