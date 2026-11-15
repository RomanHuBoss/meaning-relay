// Этот компонент управляет интерактивной частью пользовательского сценария и сохраняет доступное состояние интерфейса.
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CLAIM_TTL_SECONDS, LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type Language } from "../packages/shared/constants";
import { LocalePicker, type UiLocale, useUiLocale } from "./locale-picker";
import { PublicNav } from "./public-nav";
import { SiteBrand } from "./site-brand";
import { SystemStatus } from "./system-status";
type View = "landing" | "join" | "language" | "starting" | "turn" | "received" | "result" | "error";

interface StartResponse {
  replayed: boolean;
  chain: { public_code: string; language: Language; current_hop: number; target_hops: number; status: string };
  claim: { id: string; hop_index: number; status: string; claim_token: string | null; expires_at: string | null };
  previous_message: { hop_index: number; text: string; is_seed: boolean };
}

interface ResultResponse {
  chain: { public_code: string; language: Language; status: string; current_hop: number; target_hops: number; topic: string; completed_at: string | null };
  seed?: { text: string };
  messages?: Array<{ hop_index: number; text: string; moderation_status: string }>;
  metrics?: { seed_character_count: number; final_character_count: number; seed_unique_word_count: number; final_unique_word_count: number; token_overlap_percent: number };
}

interface PublicStats {
  active_chains: number;
  completed_chains: number;
  saved_messages: number;
}

class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const START_KEY = "meaning-relay:start-idempotency";
const DRAFT_KEY = "meaning-relay:draft";
const START_STATE_KEY = "meaning-relay:claim-state";
const SUBMIT_STATE_KEY = "meaning-relay:submit-state";
const LAST_PARTICIPATED_CHAIN_KEY = "meaning-relay:last-participated-chain";
/** Таймер пользовательского хода совпадает с серверным сроком заявки. */
const TURN_TIMER_SECONDS = CLAIM_TTL_SECONDS;

const uiCopy: Record<UiLocale, {
  navHow: string; navStats: string; navGallery: string; navMap: string; join: string;
  kicker: string; title: string[]; hero: string; enter: string; rules: string;
  stats: string[]; stepsKicker: string; steps: Array<[string, string]>;
  languageStep: string; languageKicker: string; languageTitle: string[]; languageIntro: string; languageHint: string;
}> = {
  ru: { navHow: "Как это работает", navStats: "Статистика", navGallery: "Галерея", navMap: "Карта", join: "Вступить", kicker: "ПУБЛИЧНЫЙ ВЕБ-ЭКСПЕРИМЕНТ · ЦЕПЬ №142 ИДЁТ ПРЯМО СЕЙЧАС", title: ["Передай", "мысль", "дальше."], hero: "Один человек начинает фразу. Каждый следующий пересказывает её своими словами. В конце мы увидим, что пережило смысл.", enter: "Вступить в цепочку", rules: "Посмотреть правила", stats: ["активных цепочек", "завершённых цепочек", "сохранённых ходов"], stepsKicker: "ТРИ ПРОСТЫХ ШАГА", steps: [["Прочитай", "Увидь только текущую версию мысли."], ["Перескажи", "Сохрани главное одним коротким предложением."], ["Передай", "Оставь следующий шаг незнакомому участнику."]], languageStep: "ШАГ 01 / 04 · ВЫБОР ЯЗЫКА", languageKicker: "НОВАЯ ЦЕПОЧКА", languageTitle: ["Выберите язык", "цепочки"], languageIntro: "От языка зависит, в какую цепочку вы попадёте. Пока вы думаете, место держится за вами.", languageHint: "Продолжить на языке" },
  en: { navHow: "How it works", navStats: "Stats", navGallery: "Gallery", navMap: "Map", join: "Join", kicker: "PUBLIC WEB EXPERIMENT · CHAIN #142 IS LIVE", title: ["Pass the", "meaning", "forward."], hero: "One person starts a phrase. Each person retells it in their own words. At the end we see what survived.", enter: "Join the chain", rules: "View the rules", stats: ["active chains", "completed chains", "saved turns"], stepsKicker: "THREE SIMPLE STEPS", steps: [["Read", "See only the current version of the thought."], ["Retell", "Keep the core in one short sentence."], ["Pass it on", "Leave the next step to a stranger."]], languageStep: "STEP 01 / 04 · CHOOSE A LANGUAGE", languageKicker: "NEW CHAIN", languageTitle: ["Choose the", "chain language"], languageIntro: "Your language decides which chain you join. The place waits while you decide.", languageHint: "Continue in" },
  es: { navHow: "Cómo funciona", navStats: "Estadísticas", navGallery: "Galería", navMap: "Mapa", join: "Entrar", kicker: "EXPERIMENTO WEB PÚBLICO · LA CADENA #142 ESTÁ ACTIVA", title: ["Pasa el", "sentido", "adelante."], hero: "Una persona inicia una frase. Cada siguiente la cuenta con sus palabras. Al final veremos qué sentido sobrevivió.", enter: "Entrar en la cadena", rules: "Ver las reglas", stats: ["cadenas activas", "cadenas completadas", "turnos guardados"], stepsKicker: "TRES PASOS SENCILLOS", steps: [["Lee", "Mira solo la versión actual de la idea."], ["Recuenta", "Conserva lo esencial en una frase corta."], ["Pasa", "Deja el siguiente paso a otra persona."]], languageStep: "PASO 01 / 04 · ELIGE UN IDIOMA", languageKicker: "NUEVA CADENA", languageTitle: ["Elige el idioma", "de la cadena"], languageIntro: "El idioma decide en qué cadena entrarás. El lugar te espera mientras decides.", languageHint: "Continuar en" },
  zh: { navHow: "运作方式", navStats: "统计", navGallery: "画廊", navMap: "地图", join: "加入", kicker: "公开网页实验 · 第142条链正在进行", title: ["把意义", "继续", "传下去。"], hero: "一个人开始一句话。每个人用自己的话转述。最后我们会看到什么保留了下来。", enter: "加入链条", rules: "查看规则", stats: ["进行中的链", "已完成的链", "已保存的回合"], stepsKicker: "三个简单步骤", steps: [["阅读", "只看当前的想法版本。"], ["转述", "用一句简短的话保留核心。"], ["传递", "把下一步留给陌生参与者。"]], languageStep: "第01步 / 04 · 选择语言", languageKicker: "新链条", languageTitle: ["选择", "链条语言"], languageIntro: "语言决定你加入哪条链。你思考时，位置会为你保留。", languageHint: "使用此语言继续" },
  fr: { navHow: "Fonctionnement", navStats: "Statistiques", navGallery: "Galerie", navMap: "Carte", join: "Participer", kicker: "EXPÉRIENCE WEB PUBLIQUE · LA CHAÎNE #142 EST EN COURS", title: ["Fais passer", "le sens", "plus loin."], hero: "Une personne commence une phrase. Chacun la reformule avec ses mots. À la fin, nous verrons ce qui a survécu.", enter: "Rejoindre la chaîne", rules: "Voir les règles", stats: ["chaînes actives", "chaînes terminées", "tours enregistrés"], stepsKicker: "TROIS ÉTAPES SIMPLES", steps: [["Lis", "Vois seulement la version actuelle de l’idée."], ["Reformule", "Garde l’essentiel en une phrase courte."], ["Transmets", "Laisse l’étape suivante à un inconnu."]], languageStep: "ÉTAPE 01 / 04 · CHOISIR UNE LANGUE", languageKicker: "NOUVELLE CHAÎNE", languageTitle: ["Choisissez la langue", "de la chaîne"], languageIntro: "La langue détermine la chaîne que tu rejoins. La place t’attend pendant ta décision.", languageHint: "Continuer en" },
  hi: { navHow: "यह कैसे काम करता है", navStats: "आँकड़े", navGallery: "गैलरी", navMap: "मानचित्र", join: "शामिल हों", kicker: "सार्वजनिक वेब प्रयोग · श्रृंखला #142 अभी चल रही है", title: ["अर्थ को", "आगे", "बढ़ाएँ।"], hero: "एक व्यक्ति वाक्य शुरू करता है। हर अगला व्यक्ति उसे अपने शब्दों में दोहराता है। अंत में हम देखेंगे कि क्या बचा।", enter: "श्रृंखला में शामिल हों", rules: "नियम देखें", stats: ["सक्रिय श्रृंखलाएँ", "पूरी हुई श्रृंखलाएँ", "सहेजे गए चरण"], stepsKicker: "तीन आसान चरण", steps: [["पढ़ें", "विचार का केवल वर्तमान रूप देखें।"], ["दोहराएँ", "मुख्य बात एक छोटे वाक्य में रखें।"], ["भेजें", "अगला चरण किसी अनजान प्रतिभागी को दें।"]], languageStep: "चरण 01 / 04 · भाषा चुनें", languageKicker: "नई श्रृंखला", languageTitle: ["श्रृंखला की", "भाषा चुनें"], languageIntro: "भाषा तय करती है कि आप किस श्रृंखला में जाएँगे। सोचते समय स्थान आपके लिए सुरक्षित है।", languageHint: "इस भाषा में जारी रखें" },
};

const languageNames: Record<UiLocale, Record<Language, string>> = {
  ru: { ru: "Русская цепочка", en: "Английская цепочка", zh: "Китайская цепочка", fr: "Французская цепочка", hi: "Цепочка на хинди", es: "Испанская цепочка" },
  en: { ru: "Russian chain", en: "English chain", zh: "Chinese chain", fr: "French chain", hi: "Hindi chain", es: "Spanish chain" },
  es: { ru: "Cadena rusa", en: "Cadena inglesa", zh: "Cadena china", fr: "Cadena francesa", hi: "Cadena hindi", es: "Cadena española" },
  zh: { ru: "俄语链", en: "英语链", zh: "中文链", fr: "法语链", hi: "印地语链", es: "西班牙语链" },
  fr: { ru: "Chaîne russe", en: "Chaîne anglaise", zh: "Chaîne chinoise", fr: "Chaîne française", hi: "Chaîne hindi", es: "Chaîne espagnole" },
  hi: { ru: "रूसी श्रृंखला", en: "अंग्रेज़ी श्रृंखला", zh: "चीनी श्रृंखला", fr: "फ़्रेंच श्रृंखला", hi: "हिंदी श्रृंखला", es: "स्पेनिश श्रृंखला" },
};

const languageLabels: Record<UiLocale, Record<Language, string>> = {
  ru: { ru: "русском", en: "английском", zh: "китайском", fr: "французском", hi: "хинди", es: "испанском" },
  en: { ru: "Russian", en: "English", zh: "Chinese", fr: "French", hi: "Hindi", es: "Spanish" },
  es: { ru: "ruso", en: "inglés", zh: "chino", fr: "francés", hi: "hindi", es: "español" },
  zh: { ru: "俄语", en: "英语", zh: "中文", fr: "法语", hi: "印地语", es: "西班牙语" },
  fr: { ru: "russe", en: "anglais", zh: "chinois", fr: "français", hi: "hindi", es: "espagnol" },
  hi: { ru: "रूसी", en: "अंग्रेज़ी", zh: "चीनी", fr: "फ़्रेंच", hi: "हिंदी", es: "स्पेनिश" },
};

const errorCopy: Record<UiLocale, { kicker: string; back: string; unavailable: string; generic: string; retry: string }> = {
  ru: { kicker: "ЧТО-ТО ПОШЛО НЕ ТАК", back: "Вернуться", unavailable: "Цепочка временно недоступна", generic: "Не удалось начать цепочку", retry: "Попробуйте ещё раз" },
  en: { kicker: "SOMETHING WENT WRONG", back: "Back", unavailable: "The chain is temporarily unavailable", generic: "The chain could not be started", retry: "Please try again" },
  es: { kicker: "ALGO SALIÓ MAL", back: "Volver", unavailable: "La cadena no está disponible temporalmente", generic: "No se pudo iniciar la cadena", retry: "Inténtalo de nuevo" },
  zh: { kicker: "出现了一点问题", back: "返回", unavailable: "链条暂时不可用", generic: "无法开始链条", retry: "请重试" },
  fr: { kicker: "UNE ERREUR EST SURVENUE", back: "Retour", unavailable: "La chaîne est temporairement indisponible", generic: "Impossible de démarrer la chaîne", retry: "Réessayez" },
  hi: { kicker: "कुछ गड़बड़ हो गई", back: "वापस", unavailable: "श्रृंखला अभी उपलब्ध नहीं है", generic: "श्रृंखला शुरू नहीं हो सकी", retry: "फिर कोशिश करें" },
};

function localizedStartError(locale: UiLocale, reason: unknown): string {
  if (reason instanceof ApiError && reason.code === "START_IDEMPOTENCY_REUSED") return errorCopy[locale].retry;
  if (reason instanceof ApiError) return errorCopy[locale].generic;
  if (reason instanceof Error && reason.message) return reason.message;
  return errorCopy[locale].generic;
}

const orbitCopy: Record<UiLocale, [string, string, string]> = {
  ru: ["Один человек начинает фразу.", "Каждый следующий пересказывает её своими словами.", "В конце мы увидим, что пережило смысл."],
  en: ["One person starts a phrase.", "Each person retells it in their own words.", "At the end we see what survived."],
  es: ["Una persona inicia una frase.", "Cada persona la cuenta con sus palabras.", "Al final veremos qué sobrevivió."],
  zh: ["一个人开始一句话。", "每个人用自己的话转述。", "最后我们会看到什么保留了下来。"],
  fr: ["Une personne commence une phrase.", "Chacun la reformule avec ses mots.", "À la fin, nous verrons ce qui a survécu."],
  hi: ["एक व्यक्ति वाक्य शुरू करता है।", "हर व्यक्ति उसे अपने शब्दों में दोहराता है।", "अंत में हम देखेंगे कि क्या बचा।"],
};

const fragmentLabels: Record<UiLocale, string> = {
  ru: "ЖИВОЙ ФРАГМЕНТ ЦЕПОЧКИ 07/12",
  en: "LIVE CHAIN FRAGMENT 07/12",
  es: "FRAGMENTO VIVO DE LA CADENA 07/12",
  zh: "链条实时片段 07/12",
  fr: "FRAGMENT VIVANT DE LA CHAÎNE 07/12",
  hi: "श्रृंखला का लाइव अंश 07/12",
};

const languageStepLabels: Record<UiLocale, { action: string; rules: string; accept: string }> = {
  ru: { action: "ЗАНЯТЬ СЛЕДУЮЩИЙ ШАГ ↗", rules: "ПЕРЕСМОТРЕТЬ ПРАВИЛА", accept: "ПРОДОЛЖАЯ, ВЫ ПРИНИМАЕТЕ ПРАВИЛА ЭКСПЕРИМЕНТА" },
  en: { action: "TAKE THE NEXT TURN ↗", rules: "REVIEW THE RULES", accept: "BY CONTINUING, YOU ACCEPT THE EXPERIMENT RULES" },
  es: { action: "OCUPAR EL SIGUIENTE TURNO ↗", rules: "VER LAS REGLAS", accept: "AL CONTINUAR, ACEPTAS LAS REGLAS DEL EXPERIMENTO" },
  zh: { action: "占据下一回合 ↗", rules: "查看规则", accept: "继续即表示你接受实验规则" },
  fr: { action: "PRENDRE LE PROCHAIN TOUR ↗", rules: "REVOIR LES RÈGLES", accept: "EN CONTINUANT, VOUS ACCEPTEZ LES RÈGLES DE L’EXPÉRIENCE" },
  hi: { action: "अगला चरण लें ↗", rules: "नियम फिर देखें", accept: "जारी रखकर आप प्रयोग के नियम स्वीकार करते हैं" },
};

const fragmentNodePositions = [
  ["10.6%", "56.9%"], ["19.1%", "56.9%"], ["28.8%", "59.7%"], ["38.4%", "56.9%"],
  ["48.6%", "57.7%"], ["58.2%", "61.6%"], ["67.9%", "65.6%"], ["74.8%", "73%"],
  ["66.4%", "82.6%"], ["54.8%", "88.2%"], ["42.7%", "83.5%"], ["31.3%", "77.3%"],
] as const;

function preferredRelayLanguage(): Language {
  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith("zh")) return "zh";
  if (browserLanguage.startsWith("es")) return "es";
  if (browserLanguage.startsWith("fr")) return "fr";
  if (browserLanguage.startsWith("hi")) return "hi";
  if (browserLanguage.startsWith("en")) return "en";
  return "ru";
}

function startStorageKey(language: Language, publicCode: string | null): string {
  return `${START_KEY}:${language}:${publicCode ?? "pool"}`;
}

function storageGet(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

function storageSet(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* приватный режим может отклонить запись */ }
}

function storageRemove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* приватный режим может отклонить удаление */ }
}

const countryOptions = [
  ["", "Не показывать"],
  ["EE", "Эстония"],
  ["FI", "Финляндия"],
  ["DE", "Германия"],
  ["RU", "Россия"],
  ["US", "США"],
] as const;

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body?.error?.message ?? "Не удалось выполнить запрос", body?.error?.code);
  return body as T;
}

async function createSession(): Promise<string> {
  const csrf = await jsonRequest<{ csrf: string }>("/api/v1/csrf");
  await jsonRequest("/api/v1/session", { method: "POST", headers: { "X-CSRF-Token": csrf.csrf }, body: "{}" });
  return csrf.csrf;
}

export function RelayApp() {
  const [uiLocale] = useUiLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const navigationKey = `${pathname}?${searchParams.toString()}`;
  const previousNavigationKey = useRef(navigationKey);
  const copy = uiCopy[uiLocale];
  const [view, setView] = useState<View>("landing");
  const [language, setLanguage] = useState<Language>("ru");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("ru");
  const [csrf, setCsrf] = useState("");
  const [start, setStart] = useState<StartResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [country, setCountry] = useState("");
  const [submitResult, setSubmitResult] = useState<{ hop: number; current: number; target: number; completed: boolean } | null>(null);
  const [receivedText, setReceivedText] = useState("");
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(45);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [completedCode, setCompletedCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinLanguage, setJoinLanguage] = useState<Language>("ru");
  const [inviteNotice, setInviteNotice] = useState("");

  const code = start?.chain.public_code ?? completedCode;
  const counter = useMemo(() => Array.from(draft).length, [draft]);

  useEffect(() => {
    let restoredState = false;
    const savedDraft = storageGet(window.localStorage, DRAFT_KEY);
    if (savedDraft !== null) setDraft(savedDraft);
    const savedState = storageGet(window.sessionStorage, START_STATE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState) as StartResponse;
        const expiresAt = parsed.claim?.expires_at ? Date.parse(parsed.claim.expires_at) : 0;
        if (parsed.claim?.claim_token && parsed.chain?.public_code && (!expiresAt || expiresAt > Date.now())) {
          restoredState = true;
          setLanguage(parsed.chain.language);
          setStart(parsed);
          const savedSubmit = storageGet(window.localStorage, SUBMIT_STATE_KEY);
          if (savedSubmit) {
            try {
              const submitState = JSON.parse(savedSubmit) as { claimId?: string; country?: string };
              if (submitState.claimId === parsed.claim.id && typeof submitState.country === "string") setCountry(submitState.country);
            } catch { /* повреждённое состояние отправки будет создано заново ниже */ }
          }
          // После перезагрузки показываем точный остаток серверной заявки.
          setSeconds(expiresAt ? Math.min(TURN_TIMER_SECONDS, Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))) : TURN_TIMER_SECONDS);
          setView("turn");
        } else {
          storageRemove(window.sessionStorage, START_STATE_KEY);
        }
      } catch {
        storageRemove(window.sessionStorage, START_STATE_KEY);
      }
    }
    if (!restoredState) {
      const preferredLanguage = preferredRelayLanguage();
      setLanguage(preferredLanguage);
      setSelectedLanguage(preferredLanguage);
      const params = new URLSearchParams(window.location.search);
      const requestedCode = params.get("code")?.trim() ?? "";
      const requestedLanguage = params.get("language");
      if (params.get("join") === "1" && /^[1-9A-HJ-NP-Za-km-z]{10}$/u.test(requestedCode)) {
        setJoinCode(requestedCode);
        setJoinLanguage(SUPPORTED_LANGUAGES.includes(requestedLanguage as Language) ? requestedLanguage as Language : preferredLanguage);
        setView("join");
      } else if (params.get("join") === "1") {
        setView("language");
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (draft) storageSet(window.localStorage, DRAFT_KEY, draft);
    else storageRemove(window.localStorage, DRAFT_KEY);
  }, [draft, hydrated]);

  useEffect(() => {
    if (!hydrated || !start) return;
    const existing = storageGet(window.localStorage, SUBMIT_STATE_KEY);
    let submitIdempotencyKey = "";
    try {
      const parsed = existing ? JSON.parse(existing) as { claimId?: string; idempotencyKey?: string } : null;
      if (parsed?.claimId === start.claim.id && parsed.idempotencyKey) submitIdempotencyKey = parsed.idempotencyKey;
    } catch { /* повреждённое локальное состояние будет создано заново */ }
    if (!submitIdempotencyKey) submitIdempotencyKey = window.crypto.randomUUID();
    storageSet(window.localStorage, SUBMIT_STATE_KEY, JSON.stringify({ claimId: start.claim.id, idempotencyKey: submitIdempotencyKey, text: draft, country }));
  }, [country, draft, hydrated, start]);

  useEffect(() => {
    const didNavigate = previousNavigationKey.current !== navigationKey;
    previousNavigationKey.current = navigationKey;
    if (!hydrated || !didNavigate || pathname !== "/" || searchParams.get("code")) return;
    if (searchParams.get("join") === "1") {
      setError("");
      setView("language");
      return;
    }
    if (view === "language" || view === "join" || view === "error") {
      storageRemove(window.sessionStorage, START_STATE_KEY);
      setStart(null);
      setError("");
      setView("landing");
    }
  }, [hydrated, navigationKey, pathname, searchParams, view]);

  useEffect(() => {
    if (view !== "turn" || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [view, seconds]);

  useEffect(() => {
    void fetch("/api/v1/stats/public")
      .then((response) => response.ok ? response.json() as Promise<PublicStats> : null)
      .then((value) => { if (value) setStats(value); })
      .catch(() => undefined);
  }, []);

  async function begin(languageChoice: Language, requestedCode: string | null = null, retryAfterExpired = false): Promise<void> {
    setLanguage(languageChoice);
    setSelectedLanguage(languageChoice);
    setCompletedCode("");
    setResult(null);
    setError("");
    setView("starting");
    try {
      const csrfToken = await createSession();
      setCsrf(csrfToken);
      const keyName = startStorageKey(languageChoice, requestedCode);
      const legacyKey = requestedCode ? null : storageGet(window.localStorage, START_KEY);
      const startKey = storageGet(window.localStorage, keyName) ?? legacyKey ?? window.crypto.randomUUID();
      const savedLastCode = requestedCode ? null : storageGet(window.sessionStorage, LAST_PARTICIPATED_CHAIN_KEY);
      const excludedPublicCode = savedLastCode && /^[1-9A-HJ-NP-Za-km-z]{10}$/u.test(savedLastCode) ? savedLastCode : null;
      storageSet(window.localStorage, keyName, startKey);
      if (!requestedCode) storageSet(window.localStorage, START_KEY, startKey);
      const response = await jsonRequest<StartResponse>("/api/v1/participation/start", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ language: languageChoice, public_code: requestedCode, exclude_public_code: excludedPublicCode, idempotency_key: startKey }),
      });
      setStart(response);
      storageSet(window.sessionStorage, START_STATE_KEY, JSON.stringify(response));
      setSeconds(TURN_TIMER_SECONDS);
      setView("turn");
    } catch (reason) {
      if (!retryAfterExpired && reason instanceof ApiError && (reason.code === "START_EXPIRED" || reason.code === "START_CANCELLED" || reason.code === "START_IDEMPOTENCY_REUSED")) {
        storageRemove(window.localStorage, startStorageKey(languageChoice, requestedCode));
        if (!requestedCode) storageRemove(window.localStorage, START_KEY);
        await begin(languageChoice, requestedCode, true);
        return;
      }
      setError(localizedStartError(uiLocale, reason));
      setView("error");
    }
  }

  async function submit() {
    if (!start || !start.claim.claim_token || !draft.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const csrfToken = csrf || (await jsonRequest<{ csrf: string }>("/api/v1/csrf")).csrf;
      setCsrf(csrfToken);
      const persisted = storageGet(window.localStorage, SUBMIT_STATE_KEY);
      let submitIdempotencyKey = window.crypto.randomUUID();
      try {
        const parsed = persisted ? JSON.parse(persisted) as { claimId?: string; idempotencyKey?: string } : null;
        if (parsed?.claimId === start.claim.id && parsed.idempotencyKey) submitIdempotencyKey = parsed.idempotencyKey;
      } catch { /* повреждённое локальное состояние будет создано заново */ }
      storageSet(window.localStorage, SUBMIT_STATE_KEY, JSON.stringify({ claimId: start.claim.id, idempotencyKey: submitIdempotencyKey, text: draft, country }));
      const submittedText = draft;
      const response = await jsonRequest<{ chain: { current_hop: number; target_hops: number; status: string }; message: { hop_index: number } }>(`/api/v1/claims/${start.claim.id}/submit`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          claim_token: start.claim.claim_token,
          idempotency_key: submitIdempotencyKey,
          text: draft,
          country_code: country || null,
        }),
      });
      setReceivedText(submittedText);
      setSubmitResult({ hop: response.message.hop_index, current: response.chain.current_hop, target: response.chain.target_hops, completed: response.chain.status === "COMPLETED" });
      setCompletedCode(start.chain.public_code);
      storageSet(window.sessionStorage, LAST_PARTICIPATED_CHAIN_KEY, start.chain.public_code);
      storageRemove(window.localStorage, startStorageKey(language, null));
      storageRemove(window.localStorage, startStorageKey(language, start.chain.public_code));
      storageRemove(window.localStorage, START_KEY);
      storageRemove(window.localStorage, DRAFT_KEY);
      storageRemove(window.localStorage, SUBMIT_STATE_KEY);
      storageRemove(window.sessionStorage, START_STATE_KEY);
      setStart(null);
      setDraft("");
      setView("received");
    } catch (reason) {
      if (reason instanceof ApiError && (reason.code === "CLAIM_EXPIRED" || reason.code === "CLAIM_CANCELLED")) {
        storageRemove(window.sessionStorage, START_STATE_KEY);
        setStart(null);
        setView("error");
      }
      setError(reason instanceof ApiError ? errorCopy[uiLocale].generic : reason instanceof Error ? reason.message : errorCopy[uiLocale].generic);
    } finally {
      setSubmitting(false);
    }
  }

  async function openResult() {
    if (!code) return;
    try {
      const response = await jsonRequest<ResultResponse>(`/api/v1/chains/${code}`);
      setResult(response);
      setView("result");
    } catch (reason) {
      setError(reason instanceof ApiError ? errorCopy[uiLocale].unavailable : reason instanceof Error ? reason.message : errorCopy[uiLocale].unavailable);
      setView("error");
    }
  }

  async function copyInvite(): Promise<void> {
    if (!code) return;
    const inviteUrl = `${window.location.origin}/c/${code}?join=1&language=${language}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteNotice("Ссылка для следующего участника скопирована.");
    } catch {
      setInviteNotice("Не удалось скопировать ссылку. Скопируйте URL из адресной строки.");
    }
  }

  async function cancelClaim(): Promise<void> {
    const activeClaimId = start?.claim.id;
    const activeCode = start?.chain.public_code;
    storageRemove(window.sessionStorage, START_STATE_KEY);
    storageRemove(window.localStorage, startStorageKey(language, null));
    storageRemove(window.localStorage, START_KEY);
    storageRemove(window.localStorage, DRAFT_KEY);
    storageRemove(window.localStorage, SUBMIT_STATE_KEY);
    if (activeCode) storageRemove(window.localStorage, startStorageKey(language, activeCode));
    setView("landing");
    setStart(null);
    setDraft("");
    setError("");
    router.replace("/");
    if (!activeClaimId) return;
    try {
      const csrfToken = csrf || (await createSession());
      setCsrf(csrfToken);
      await jsonRequest<unknown>(`/api/v1/claims/${activeClaimId}/cancel`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: "{}",
      });
    } catch {
      // Локальное состояние уже очищено, поэтому обновление страницы не восстановит ход.
    }
  }

  function openLanguage(): void {
    setSelectedLanguage(language);
    setView("language");
    router.push("/?join=1");
  }

  return (
    <main className="site-shell">
      <div className="system-bar"><SiteBrand /><SystemStatus kind="stable" /><div className="system-bar-right"><LocalePicker /></div></div>
      <PublicNav active={view === "landing" ? "home" : undefined} onJoin={openLanguage} />

      {view === "landing" && (
        <>
          <section className="hero-grid" aria-labelledby="landing-heading">
            <div>
              <p className="kicker">{copy.kicker}</p>
              <h1 id="landing-heading" className="display-title">{copy.title.map((line) => <span key={line}>{line}</span>)}</h1>
              <p className="hero-copy">{copy.hero}</p>
              <div className="hero-actions">
                <button className="primary-button" onClick={openLanguage}>{copy.enter} <span>↗</span></button>
                <Link className="secondary-button hero-rules-button" href="/about">{copy.rules} <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
            <div className={`hero-orbit hero-orbit-${uiLocale}`} aria-hidden="true"><span className="orbit-fragment-label">{fragmentLabels[uiLocale]}</span><svg className="hero-chain-path" viewBox="0 0 691 541" preserveAspectRatio="none">
              <defs>
                <linearGradient id="fragment-active-gradient" gradientUnits="userSpaceOnUse" x1="402" y1="333" x2="469" y2="355">
                  <stop offset="0" stopColor="#f5e9d2" /><stop offset="0.48" stopColor="#f4ed9b" /><stop offset="1" stopColor="#c8ff31" />
                </linearGradient>
                <linearGradient id="fragment-tail-gradient" gradientUnits="userSpaceOnUse" x1="469" y1="355" x2="517" y2="395">
                  <stop offset="0" stopColor="#c8ff31" /><stop offset="0.4" stopColor="#c5d8c9" stopOpacity="0.78" /><stop offset="1" stopColor="#91a9b7" stopOpacity="0.48" />
                </linearGradient>
                <linearGradient id="fragment-fade-gradient" gradientUnits="userSpaceOnUse" x1="517" y1="395" x2="216" y2="418">
                  <stop offset="0" stopColor="#a7b9c0" stopOpacity="0.48" /><stop offset="0.36" stopColor="#a9bac5" stopOpacity="0.32" /><stop offset="1" stopColor="#9eafbc" stopOpacity="0.12" />
                </linearGradient>
                <filter id="fragment-warm-glow" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="4.2" /></filter>
                <filter id="fragment-lime-glow" x="-60%" y="-100%" width="220%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
              </defs>
              <path className="hero-chain-path-track" d="M73 308 C92 298 112 299 132 308 S174 334 199 323 S236 296 265 308 S310 304 336 312 S379 324 402 333 S446 350 469 355 C493 362 509 378 517 395 C516 414 488 437 458 447 S412 478 379 477 S331 456 295 452 S251 430 216 418" />
              <path className="hero-chain-path-warm-glow" d="M73 308 C92 298 112 299 132 308 S174 334 199 323 S236 296 265 308 S310 304 336 312 S379 324 402 333" />
              <path className="hero-chain-path-warm" d="M73 308 C92 298 112 299 132 308 S174 334 199 323 S236 296 265 308 S310 304 336 312 S379 324 402 333" />
              <path className="hero-chain-path-active-glow" d="M402 333 S446 350 469 355" />
              <path className="hero-chain-path-active" d="M402 333 S446 350 469 355" />
              <path className="hero-chain-path-tail-glow" d="M469 355 C493 362 509 378 517 395" />
              <path className="hero-chain-path-tail" d="M469 355 C493 362 509 378 517 395" />
              <path className="hero-chain-path-fade-08-09" d="M517 395 C516 414 488 437 458 447" />
              <path className="hero-chain-path-fade-09-10" d="M458 447 S412 478 379 477" />
              <path className="hero-chain-path-fade-10-11" d="M379 477 S331 456 295 452" />
              <path className="hero-chain-path-fade-11-12" d="M295 452 S251 430 216 418" />
            </svg><div className="orbit-constellation">{Array.from({ length: 12 }, (_, index) => <b data-hop={String(index + 1).padStart(2, "0")} style={{ left: fragmentNodePositions[index][0], top: fragmentNodePositions[index][1] }} key={index} />)}</div><div className="orbit-caption orbit-caption-one">{orbitCopy[uiLocale][0]}</div><div className="orbit-caption orbit-caption-two">{orbitCopy[uiLocale][1]}</div><div className="orbit-caption orbit-caption-final">{orbitCopy[uiLocale][2]}</div></div>
          </section>
          <section className="stats-row" id="stats" aria-label={copy.navStats}><div><strong>{stats?.active_chains ?? "—"}<em>—</em></strong><span>{copy.stats[0]}</span></div><div><strong>{stats?.completed_chains ?? "—"}<em>—</em></strong><span>{copy.stats[1]}</span></div><div><strong>{stats?.saved_messages ?? "—"}<em>—</em></strong><span>{copy.stats[2]}</span></div></section>
          <section className="how-section" id="how" aria-labelledby="how-heading"><p className="kicker" id="how-heading">{copy.stepsKicker}</p><div className="steps">{copy.steps.map(([title, description], index) => <article key={title}><b>{String(index + 1).padStart(2, "0")}</b><h2>{title}</h2><p>{description}</p></article>)}</div></section>
        </>
      )}

      {view === "join" && <section className="flow-panel centered"><p className="kicker">ПРИГЛАШЕНИЕ В ЦЕПОЧКУ</p><h2>Продолжить именно эту цепочку?</h2><p>Тебе будет показана только текущая версия мысли. После отправки следующий участник увидит уже твой пересказ.</p><p className="join-code">ЦЕПОЧКА {joinCode}</p><div className="hero-actions"><button className="primary-button" onClick={() => void begin(joinLanguage, joinCode)}>Продолжить цепочку ↗</button><button className="secondary-button" onClick={openLanguage}>В общий пул</button></div></section>}

      {view === "language" && <section className="flow-panel language-screen"><div className="language-screen-header"><p className="screen-step">{copy.languageStep}</p><div className="screen-progress" aria-label="Прогресс шага">{[1, 2, 3, 4].map((step) => <i className={step === 1 ? "active" : ""} key={step} />)}</div></div><p className="kicker">{copy.languageKicker}</p><h2 className="screen-title">{copy.languageTitle.map((line) => <span key={line}>{line}</span>)}</h2><p>{copy.languageIntro}</p><div className="language-grid">{SUPPORTED_LANGUAGES.map((code) => <button type="button" className={`language-card language-card-${code} ${selectedLanguage === code ? "selected" : ""}`} aria-pressed={selectedLanguage === code} key={code} onClick={() => setSelectedLanguage(code)}><span>{code.toUpperCase()}</span><strong>{code.toUpperCase()}</strong><small>{languageNames[uiLocale][code]}</small></button>)}</div><div className="language-actions"><button className="primary-button" type="button" onClick={() => void begin(selectedLanguage)}>{languageStepLabels[uiLocale].action}</button><Link className="secondary-button" href="/about">{languageStepLabels[uiLocale].rules}</Link><span>{languageStepLabels[uiLocale].accept}</span></div></section>}

      {view === "starting" && <section className="flow-panel centered" aria-labelledby="starting-heading"><div className="spinner" aria-hidden="true" /><p id="starting-heading" role="status" aria-live="polite">Ищем свободный ход…</p></section>}

      {view === "turn" && start && <section className="turn-layout turn-screen"><div className="turn-meta"><p className="screen-step">ШАГ 02 / 04 · ВАШ ХОД</p></div><div className="relay-rail" aria-hidden="true">{Array.from({ length: start.chain.target_hops }, (_, index) => <i className={index < start.claim.hop_index ? "is-done" : index + 1 === start.claim.hop_index ? "is-current" : ""} key={index}>{String(index + 1).padStart(2, "0")}</i>)}</div><h1 className="screen-title turn-display"><span>Перескажи.</span><span>Не переходи границу.</span></h1><p className="screen-intro">Вы видите только предыдущий шаг. Оригинал скрыт — так честнее.</p><article className="message-card"><span className="message-label">{start.previous_message.is_seed ? "ИСХОДНАЯ МЫСЛЬ" : `ПРЕДЫДУЩИЙ ХОД · ${start.previous_message.hop_index}`}</span><p>{start.previous_message.text}</p></article><div className="reply-card"><label htmlFor="draft">Перескажи эту мысль одним коротким предложением.<textarea id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Сохрани главное…" /></label><div className="reply-footer"><span className={counter > 500 ? "warm" : ""}>{counter} / 500</span><div className="country-field"><span className="country-field-label">Страна на карте</span><span className={`country-signal country-signal-${country ? country.toLowerCase() : "none"}`} aria-hidden="true" /><select aria-label="Страна для карты" value={country} onChange={(event) => setCountry(event.target.value)}>{countryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><button className="primary-button" onClick={submit} disabled={submitting || seconds <= 0 || counter < 20}>{submitting ? "Передаём…" : seconds <= 0 ? "Время вышло" : "Передать дальше ↗"}</button></div></div><aside className="turn-sidecar"><div className="turn-timer"><span>ДО КОНЦА ХОДА</span><strong className={seconds === 0 ? "warm" : ""} aria-live="polite" aria-atomic="true">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><div className="warm-track"><i style={{ width: `${Math.min(100, (seconds / TURN_TIMER_SECONDS) * 100)}%` }} /></div></div><div className="turn-memo"><span>ПАМЯТКА ХОДА</span><ol><li>У вас одна попытка</li><li>Ход истекает по таймеру</li><li>Сохраняйте только смысл</li></ol></div><button className="secondary-button" type="button" onClick={cancelClaim}>Отменить участие</button></aside>{error && <p className="inline-error" role="alert">{error}</p>}</section>}

      {view === "received" && submitResult && <section className="flow-panel received"><p className="kicker">ХОД СОХРАНЁН</p><div className="checkmark">✓</div><h2>Ты передал мысль дальше.</h2><p className="received-copy">Твой текст стал {submitResult.hop}-м звеном цепочки. Теперь следующий участник увидит только его.</p><div className="received-quote">{receivedText}</div><div className="received-progress"><span>ПРОГРЕСС ЦЕПОЧКИ</span><strong>{submitResult.current} / {submitResult.target}</strong><div className="progress-track"><i style={{ width: `${(submitResult.current / submitResult.target) * 100}%` }} /></div></div><div className="hero-actions">{submitResult.completed ? <button className="primary-button" onClick={openResult}>Открыть результат ↗</button> : <button className="primary-button" onClick={() => setView("landing")}>Вернуться на главную</button>}<button className="secondary-button" onClick={openResult}>Открыть страницу цепочки</button>{!submitResult.completed && <button className="secondary-button" onClick={() => void copyInvite()}>Пригласить следующего</button>}</div>{inviteNotice && <p className="share-notice" role="status" aria-live="polite">{inviteNotice}</p>}</section>}

      {view === "result" && result && <section className="result-layout result-screen"><div className="result-heading"><p className="screen-step">ШАГ 03 / 04 · ХОД ПРИНЯТ · ДРЕЙФ ФИКСИРУЕТСЯ</p><p className="kicker">ЗАВЕРШЁННАЯ ЦЕПОЧКА</p><h2 className="screen-title"><span>Шаг записан.</span><span className="display-outline">Смысл уже не тот.</span></h2><p>{result.chain.current_hop} из {result.chain.target_hops} ходов · {LANGUAGE_LABELS[result.chain.language]}</p></div>{result.seed && <article className="result-seed"><span>НАЧАЛО · ШАГ 01</span><p>{result.seed.text}</p></article>}<div className="message-timeline">{result.messages?.map((message) => <article key={message.hop_index} className={message.hop_index === result.chain.target_hops ? "timeline-card final" : "timeline-card"}><span>ХОД {message.hop_index}</span><p>{message.text}</p></article>)}</div>{result.metrics && <div className="metrics-grid"><div><strong>{result.metrics.token_overlap_percent}%</strong><span>дрейф смысла</span></div><div><strong>{result.metrics.seed_character_count}</strong><span>символов в начале</span></div><div><strong>{result.metrics.final_character_count}</strong><span>символов в финале</span></div></div>}</section>}

      {view === "error" && <section className="flow-panel centered" aria-labelledby="error-heading"><p className="kicker">{errorCopy[uiLocale].kicker}</p><h2 id="error-heading">{error || errorCopy[uiLocale].unavailable}</h2><button className="primary-button" onClick={() => setView("landing")}>{errorCopy[uiLocale].back}</button></section>}

      <footer><span>СМЫСЛОВОЙ ТЕЛЕФОН</span><span>Читай · Пересказывай · Передавай</span></footer>
    </main>
  );
}
