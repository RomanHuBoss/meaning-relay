// Этот модуль реализует доменные операции цепочки и сохраняет её переходы между состояниями.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import starterPhraseData from "../../data/starter-phrases.json";
import {
  ACTIVE_CHAIN_CAP,
  CHAIN_TARGET_HOPS,
  CLAIM_TTL_SECONDS,
  type Language,
} from "../../packages/shared/constants";
import { canonicalText, isDuplicateText, sha256Text, validateText } from "../../packages/shared/validation/text";
import {
  type Chain,
  type Claim,
  type GalleryChain,
  type Message,
  type RecoverResult,
  type ReportReason,
  type ReportResult,
  type PublicStats,
  type PublicMapStats,
  type MaintenanceResult,
  RelayError,
  type StartResult,
  type SubmitResult,
} from "../../packages/shared/types/relay";

export interface ThemeFixture {
  id: string;
  slug: string;
  title: string;
  seedText: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  titleRu?: string;
  titleEn?: string;
  seedTextRu?: string;
  seedTextEn?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface StartRecord {
  sessionHash: string;
  idempotencyKey: string;
  requestHash: string;
  chainId: string;
  claimId: string;
  createdAt: Date;
}

interface RecoveryRecord {
  sessionHash: string;
  claimId: string;
  requestHash: string;
  token: string;
  status: "ACTIVE" | "STALE";
  createdAt: Date;
}

interface ReportRecord {
  id: string;
  messageId: string;
  reporterHash: string;
  reason: ReportReason;
  details: string | null;
  status: "OPEN" | "DISMISSED" | "HIDDEN" | "CHAIN_ARCHIVED";
  createdAt: Date;
  resolvedAt: Date | null;
}

interface CountryEventRecord {
  countryCode: string | null;
  createdAt: Date;
}

export interface AdminTheme {
  id: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  seedTextRu: string;
  seedTextEn: string;
  status: ThemeFixture["status"];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminChainSummary {
  publicCode: string;
  language: Language;
  themeTitle: string;
  currentHop: number;
  targetHops: number;
  status: Chain["status"];
  lastActivityAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AdminChainDetail extends AdminChainSummary {
  seed: { text: string };
  messages: Array<Pick<Message, "id" | "hopIndex" | "text" | "moderationStatus" | "createdAt">>;
}

export interface AdminReport {
  id: string;
  status: ReportRecord["status"];
  reason: ReportReason;
  details: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  message: { id: string; chainPublicCode: string; hopIndex: number; text: string; moderationStatus: Message["moderationStatus"] };
  chain: { publicCode: string; status: Chain["status"] };
}

export interface InMemoryRelayOptions {
  now?: () => Date;
  themes?: ThemeFixture[];
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function publicCode(): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = randomBytes(10);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function nextDate(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000);
}

function countryOrNull(countryCode: string | null | undefined): string | null {
  if (countryCode === null || countryCode === undefined || countryCode === "") return null;
  const normalized = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized) || normalized === "AA" || normalized === "ZZ") {
    throw new RelayError("INVALID_COUNTRY_CODE");
  }
  return normalized;
}

export class InMemoryRelay {
  private readonly now: () => Date;
  private readonly themes: ThemeFixture[];
  private readonly chains = new Map<string, Chain>();
  private readonly claims = new Map<string, Claim>();
  private readonly messages = new Map<string, Message>();
  private readonly starts = new Map<string, StartRecord>();
  private readonly recoveries = new Map<string, RecoveryRecord>();
  private readonly reports = new Map<string, ReportRecord>();
  private readonly countryEvents: CountryEventRecord[] = [];

  constructor(options: InMemoryRelayOptions = {}) {
    this.now = options.now ?? (() => new Date());
    const defaultThemes: ThemeFixture[] = [
      {
        id: randomUUID(),
        slug: "first-thought",
        title: "Первая мысль",
        seedText: "Иногда короткая фраза меняет направление целого разговора.",
        status: "ACTIVE" as const,
      },
      {
        id: randomUUID(),
        slug: "small-kindness",
        title: "Маленькая доброта",
        seedText: "Небольшая доброта иногда меняет весь день другого человека.",
        status: "ACTIVE" as const,
      },
      {
        id: randomUUID(),
        slug: "shared-horizon",
        title: "Общий горизонт",
        seedText: "Когда мы смотрим в одну сторону, расстояние между нами становится короче.",
        status: "ACTIVE" as const,
      },
      {
        id: randomUUID(),
        slug: "patient-work",
        title: "Терпеливая работа",
        seedText: "Большое изменение складывается из тихих повторяющихся действий.",
        status: "ACTIVE" as const,
      },
      {
        id: randomUUID(),
        slug: "unexpected-question",
        title: "Неожиданный вопрос",
        seedText: "Хороший вопрос иногда открывает дверь, которую мы не замечали.",
        status: "ACTIVE" as const,
      },
      ...starterPhraseData.map((phrase) => ({
        id: `starter-${phrase.slug}`,
        slug: phrase.slug,
        title: phrase.title_ru,
        titleRu: phrase.title_ru,
        titleEn: phrase.title_en,
        seedText: phrase.seed_text_ru,
        seedTextRu: phrase.seed_text_ru,
        seedTextEn: phrase.seed_text_en,
        status: "ACTIVE" as const,
      })),
    ];
    const fixtures = options.themes ?? defaultThemes;
    this.themes = fixtures.map((theme) => {
      const createdAt = theme.createdAt ?? this.now();
      return {
        ...theme,
        titleRu: theme.titleRu ?? theme.title,
        titleEn: theme.titleEn ?? theme.title,
        seedTextRu: theme.seedTextRu ?? theme.seedText,
        seedTextEn: theme.seedTextEn ?? theme.seedText,
        createdAt,
        updatedAt: theme.updatedAt ?? createdAt,
      };
    });
  }

  seedChain(language: Language, themeId?: string): Chain {
    const selectedThemeId = themeId ?? this.nextThemeId(language);
    const theme = this.themes.find((candidate) => candidate.id === selectedThemeId && candidate.status === "ACTIVE");
    if (!theme) throw new RelayError("NO_ACTIVE_SEED");
    if ([...this.chains.values()].filter((candidate) => candidate.language === language && candidate.status === "ACTIVE").length >= ACTIVE_CHAIN_CAP) {
      throw new RelayError("NO_CHAIN_AVAILABLE");
    }
    const now = this.now();
    const chain: Chain = {
      id: randomUUID(),
      publicCode: publicCode(),
      themeId: theme.id,
      themeTitleSnapshot: language === "ru" ? (theme.titleRu ?? theme.title) : (theme.titleEn ?? theme.title),
      seedTextSnapshot: language === "ru" ? (theme.seedTextRu ?? theme.seedText) : (theme.seedTextEn ?? theme.seedText),
      language,
      targetHops: CHAIN_TARGET_HOPS,
      currentHop: 0,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      lastActivityAt: now,
    };
    this.chains.set(chain.id, chain);
    return chain;
  }

  start(
    language: Language,
    sessionHash: string,
    idempotencyKey: string,
    requestedCode?: string | null,
    excludedPublicCode?: string | null,
  ): StartResult {
    if (!isUuidV4(idempotencyKey)) throw new RelayError("INVALID_IDEMPOTENCY_KEY");
    const requestHash = hash(language + "\0" + (requestedCode ?? "") + (excludedPublicCode ? "\0" + excludedPublicCode : ""));
    const startKey = sessionHash + ":" + idempotencyKey;
    const previousStart = this.starts.get(startKey);
    if (previousStart) {
      if (previousStart.requestHash !== requestHash) throw new RelayError("START_IDEMPOTENCY_REUSED");
      const claim = this.mustClaim(previousStart.claimId);
      if (claim.status === "EXPIRED") throw new RelayError("START_EXPIRED");
      if (claim.status === "CANCELLED") throw new RelayError("START_CANCELLED");
      if (claim.status === "ACTIVE" && claim.expiresAt.getTime() <= this.now().getTime()) {
        claim.status = "EXPIRED";
        claim.testOnlyToken = "";
        throw new RelayError("START_EXPIRED");
      }
      return this.startResult(this.mustChain(previousStart.chainId), claim, true);
    }

    this.expireSessionClaim(sessionHash);
    if ([...this.claims.values()].some((claim) => claim.sessionHash === sessionHash && claim.status === "ACTIVE")) {
      throw new RelayError("SESSION_HAS_ACTIVE_CLAIM");
    }

    const chain = requestedCode
      ? this.findRequestedChain(requestedCode, language, sessionHash)
      : this.findNextChain(language, sessionHash, excludedPublicCode);
    const now = this.now();
    const claimToken = randomBytes(32).toString("base64url");
    const claim: Claim = {
      id: randomUUID(),
      chainId: chain.id,
      hopIndex: chain.currentHop + 1,
      sessionHash,
      claimTokenHash: hash(claimToken),
      testOnlyToken: claimToken,
      idempotencyKey: null,
      submittedMessageId: null,
      submittedTextHash: null,
      submittedCountryCode: null,
      status: "ACTIVE",
      claimedAt: now,
      expiresAt: nextDate(now, CLAIM_TTL_SECONDS),
      submittedAt: null,
    };
    this.claims.set(claim.id, claim);
    this.starts.set(startKey, {
      sessionHash,
      idempotencyKey,
      requestHash,
      chainId: chain.id,
      claimId: claim.id,
      createdAt: now,
    });
    chain.updatedAt = now;
    return this.startResult(chain, claim, false);
  }

  submit(
    claimId: string,
    sessionHash: string,
    claimToken: string,
    idempotencyKey: string,
    text: string,
    countryCode?: string | null,
  ): SubmitResult {
    if (!isUuidV4(idempotencyKey)) throw new RelayError("INVALID_IDEMPOTENCY_KEY");
    const claim = this.claims.get(claimId);
    if (!claim) throw new RelayError("CLAIM_NOT_FOUND");
    if (claim.sessionHash !== sessionHash) throw new RelayError("CLAIM_OWNER_REQUIRED");
    const chain = this.mustChain(claim.chainId);
    const country = countryOrNull(countryCode);

    if (claim.status === "SUBMITTED") {
      const replayTextHash = sha256Text(canonicalText(text));
      if (claim.idempotencyKey !== idempotencyKey) throw new RelayError("IDEMPOTENCY_KEY_REUSED");
      if (claim.submittedTextHash !== replayTextHash || claim.submittedCountryCode !== country) {
        throw new RelayError("IDEMPOTENCY_KEY_REUSED");
      }
      const message = this.mustMessage(claim.submittedMessageId!);
      return this.submitResult(chain, message, true);
    }
    if (claim.status === "EXPIRED") throw new RelayError("CLAIM_EXPIRED");
    if (claim.status === "CANCELLED") throw new RelayError("CLAIM_CANCELLED");
    if (chain.status === "COMPLETED") throw new RelayError("CHAIN_COMPLETED");
    if (chain.status === "PAUSED") throw new RelayError("CHAIN_PAUSED");
    if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
    if (claim.expiresAt.getTime() <= this.now().getTime()) {
      claim.status = "EXPIRED";
      claim.testOnlyToken = "";
      throw new RelayError("CLAIM_EXPIRED");
    }
    if (hash(claimToken) !== claim.claimTokenHash) throw new RelayError("CLAIM_TOKEN_INVALID");
    if (claim.hopIndex !== chain.currentHop + 1) throw new RelayError("CHAIN_ADVANCED");

    const normalized = validateText(text);
    if (!normalized.ok) throw new RelayError("TEXT_REJECTED", normalized.reason);
    const previous = this.previousText(chain);
    if (isDuplicateText(normalized.normalized, previous)) throw new RelayError("TEXT_DUPLICATE");
    const now = this.now();
    const message: Message = {
      id: randomUUID(),
      chainId: chain.id,
      hopIndex: claim.hopIndex,
      parentId: claim.hopIndex === 1 ? null : this.findMessage(chain.id, claim.hopIndex - 1)?.id ?? null,
      text: normalized.normalized,
      wordCount: normalized.wordCount,
      textHash: normalized.textHash,
      sessionHash,
      moderationStatus: "ALLOWED",
      createdAt: now,
    };
    this.messages.set(message.id, message);
    this.countryEvents.push({ countryCode: country, createdAt: now });
    claim.status = "SUBMITTED";
    claim.idempotencyKey = idempotencyKey;
    claim.submittedMessageId = message.id;
    claim.submittedTextHash = normalized.textHash;
    claim.submittedCountryCode = country;
    claim.submittedAt = now;
    claim.testOnlyToken = "";
    chain.currentHop += 1;
    chain.updatedAt = now;
    chain.lastActivityAt = now;
    if (chain.currentHop === chain.targetHops) {
      chain.status = "COMPLETED";
      chain.completedAt = now;
    }
    return this.submitResult(chain, message, false);
  }

  recover(publicCodeValue: string, sessionHash: string, recoverIdempotencyKey: string): RecoverResult {
    if (!isUuidV4(recoverIdempotencyKey)) throw new RelayError("INVALID_RECOVER_IDEMPOTENCY_KEY");
    const requestHash = hash(publicCodeValue);
    const recoveryKey = sessionHash + ":" + recoverIdempotencyKey;
    const existing = this.recoveries.get(recoveryKey);
    const chain = [...this.chains.values()].find((candidate) => candidate.publicCode === publicCodeValue);
    if (!chain) throw new RelayError("CHAIN_NOT_FOUND");
    if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
    if (chain.status === "PAUSED") throw new RelayError("CHAIN_PAUSED");
    if (chain.status === "COMPLETED") throw new RelayError("CHAIN_COMPLETED");
    if (existing) {
      if (existing.requestHash !== requestHash) throw new RelayError("RECOVERY_IDEMPOTENCY_REUSED");
      if (existing.status === "STALE") throw new RelayError("RECOVERY_STALE");
      const claim = this.mustClaim(existing.claimId);
      return this.recoverResult(chain, claim, existing.token, true);
    }
    const claim = [...this.claims.values()].find((candidate) => candidate.chainId === chain.id && candidate.sessionHash === sessionHash);
    if (!claim) throw new RelayError("CLAIM_OWNER_REQUIRED");
    if (claim.status === "CANCELLED") throw new RelayError("CLAIM_CANCELLED");
    if (claim.status === "SUBMITTED") throw new RelayError("CLAIM_SUBMITTED");
    if (claim.status === "EXPIRED" || claim.expiresAt.getTime() <= this.now().getTime()) {
      claim.status = "EXPIRED";
      claim.testOnlyToken = "";
      throw new RelayError("CLAIM_EXPIRED");
    }
    for (const recovery of this.recoveries.values()) {
      if (recovery.claimId === claim.id && recovery.status === "ACTIVE") recovery.status = "STALE";
    }
    const token = randomBytes(32).toString("base64url");
    claim.claimTokenHash = hash(token);
    claim.testOnlyToken = token;
    this.recoveries.set(recoveryKey, { sessionHash, claimId: claim.id, requestHash, token, status: "ACTIVE", createdAt: this.now() });
    return this.recoverResult(chain, claim, token, false);
  }

  report(messageId: string, reporterHash: string, reason: ReportReason, details?: string | null): ReportResult {
    const message = this.messages.get(messageId);
    if (!message) throw new RelayError("MESSAGE_NOT_FOUND");
    const chain = this.mustChain(message.chainId);
    if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
    if (chain.status !== "COMPLETED") throw new RelayError("REPORT_NOT_ALLOWED");
    const normalizedDetails = details === undefined || details === null ? null : details.trim();
    if (normalizedDetails !== null && (Array.from(normalizedDetails).length < 1 || Array.from(normalizedDetails).length > 300)) {
      throw new RelayError("INVALID_BODY", "details");
    }
    const duplicate = [...this.reports.values()].find(
      (report) => report.messageId === messageId && report.reporterHash === reporterHash && report.reason === reason,
    );
    if (duplicate) throw new RelayError("REPORT_DUPLICATE");
    const report: ReportRecord = {
      id: randomUUID(), messageId, reporterHash, reason, details: normalizedDetails, status: "OPEN",
      createdAt: this.now(), resolvedAt: null,
    };
    this.reports.set(report.id, report);
    return { report: { id: report.id, status: "OPEN" } };
  }

  stats(): PublicStats {
    const messages = [...this.messages.values()].filter((message) => message.moderationStatus === "ALLOWED" || message.moderationStatus === "HIDDEN");
    const now = this.now();
    const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000;
    return {
      activeChains: [...this.chains.values()].filter((chain) => chain.status === "ACTIVE").length,
      completedChains: [...this.chains.values()].filter((chain) => chain.status === "COMPLETED").length,
      savedMessages: messages.length,
      // Локальный адаптер должен совпадать с PostgresRelay: открытый счётчик
      // участников учитывает скользящие 90 суток, а число сохранённых сообщений
      // остаётся общим за всё время и включает видимые модерации.
      totalParticipants: new Set(messages.filter((message) => message.createdAt.getTime() >= ninetyDaysAgo).map((message) => message.sessionHash)).size,
      updatedAt: now,
    };
  }

  mapStats(period: "24h" | "all"): PublicMapStats {
    const cutoff = period === "24h" ? this.now().getTime() - 24 * 60 * 60 * 1000 : null;
    const events = this.countryEvents.filter((event) => cutoff === null || event.createdAt.getTime() >= cutoff);
    const counts = new Map<string, number>();
    let unknown = 0;
    for (const event of events) {
      if (!event.countryCode) {
        unknown += 1;
        continue;
      }
      counts.set(event.countryCode, (counts.get(event.countryCode) ?? 0) + 1);
    }
    const countries = [...counts.entries()]
      .filter(([, count]) => count >= 5)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([countryCode, count]) => ({ countryCode, count }));
    const other = [...counts.values()].filter((count) => count < 5).reduce((sum, count) => sum + count, 0);
    if (other > 0) countries.push({ countryCode: "OTHER", count: other });
    if (unknown > 0) countries.push({ countryCode: "UNKNOWN", count: unknown });
    return { period, totalEvents: events.length, countries, updatedAt: this.now() };
  }

  runMaintenance(): MaintenanceResult {
    const now = this.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const oneHundredEightyDays = 180 * 24 * 60 * 60 * 1000;
    const threeHundredSixtyFiveDays = 365 * 24 * 60 * 60 * 1000;
    let expiredClaims = 0;
    let archivedChains = 0;
    let cancelledClaims = 0;
    let deletedRows = 0;

    for (const claim of this.claims.values()) {
      if (claim.status === "ACTIVE" && claim.expiresAt.getTime() <= now.getTime()) {
        claim.status = "EXPIRED";
        claim.testOnlyToken = "";
        expiredClaims += 1;
      }
    }

    for (const chain of this.chains.values()) {
      if (chain.status !== "ACTIVE" || chain.lastActivityAt.getTime() >= now.getTime() - thirtyDays) continue;
      chain.status = "ARCHIVED";
      chain.updatedAt = now;
      archivedChains += 1;
      for (const claim of this.claims.values()) {
        if (claim.chainId !== chain.id || claim.status !== "ACTIVE") continue;
        claim.status = "CANCELLED";
        claim.testOnlyToken = "";
        cancelledClaims += 1;
      }
      for (const report of this.reports.values()) {
        const message = this.messages.get(report.messageId);
        if (message?.chainId === chain.id && report.status === "OPEN") {
          report.status = "CHAIN_ARCHIVED";
          report.resolvedAt = now;
        }
      }
    }

    for (const [key, start] of this.starts.entries()) {
      if (start.createdAt.getTime() < now.getTime() - thirtyDays) {
        this.starts.delete(key);
        deletedRows += 1;
      }
    }
    for (const [key, recovery] of this.recoveries.entries()) {
      const claim = this.claims.get(recovery.claimId);
      if ((claim && claim.status !== "ACTIVE") || recovery.createdAt.getTime() < now.getTime() - thirtyDays) {
        this.recoveries.delete(key);
        deletedRows += 1;
      }
    }
    for (const [id, report] of this.reports.entries()) {
      if (report.createdAt.getTime() < now.getTime() - oneHundredEightyDays) {
        this.reports.delete(id);
        deletedRows += 1;
      }
    }
    for (let index = this.countryEvents.length - 1; index >= 0; index -= 1) {
      if (this.countryEvents[index].createdAt.getTime() < now.getTime() - threeHundredSixtyFiveDays) {
        this.countryEvents.splice(index, 1);
        deletedRows += 1;
      }
    }
    for (const [id, claim] of this.claims.entries()) {
      const terminalAt = claim.submittedAt?.getTime() ?? claim.expiresAt.getTime();
      if (claim.status !== "ACTIVE" && terminalAt < now.getTime() - ninetyDays) {
        this.claims.delete(id);
        deletedRows += 1;
      }
    }

    return { ranAt: now, counts: { expiredClaims, archivedChains, cancelledClaims, deletedRows } };
  }

  adminCounters(): { openReports: number; errorsLast24h: number } {
    return {
      openReports: [...this.reports.values()].filter((report) => report.status === "OPEN").length,
      // Локальный адаптер не сохраняет события ошибок аналитики. В рабочем
      // адаптере PostgreSQL этот счётчик вычисляется по таблице событий.
      errorsLast24h: 0,
    };
  }

  listAdminThemes(status: ThemeFixture["status"] | "all" = "all"): AdminTheme[] {
    return this.themes
      .filter((theme) => status === "all" || theme.status === status)
      .sort((a, b) => {
        const byDate = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        return byDate || b.id.localeCompare(a.id);
      })
      .map((theme) => this.adminTheme(theme));
  }

  createAdminTheme(input: {
    slug: string;
    titleRu: string;
    titleEn: string;
    seedTextRu: string;
    seedTextEn: string;
    status: ThemeFixture["status"];
  }): AdminTheme {
    if (this.themes.some((theme) => theme.slug === input.slug)) throw new RelayError("INVALID_STATE", "slug already exists");
    const now = this.now();
    const theme: ThemeFixture = {
      id: randomUUID(),
      slug: input.slug,
      title: input.titleRu,
      seedText: input.seedTextRu,
      titleRu: input.titleRu,
      titleEn: input.titleEn,
      seedTextRu: input.seedTextRu,
      seedTextEn: input.seedTextEn,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.themes.push(theme);
    return this.adminTheme(theme);
  }

  updateAdminTheme(id: string, patch: Partial<{
    slug: string;
    titleRu: string;
    titleEn: string;
    seedTextRu: string;
    seedTextEn: string;
    status: ThemeFixture["status"];
  }>): AdminTheme {
    const theme = this.themes.find((candidate) => candidate.id === id);
    if (!theme) throw new RelayError("THEME_NOT_FOUND");
    const hasChain = [...this.chains.values()].some((chain) => chain.themeId === id);
    if (patch.slug !== undefined && patch.slug !== theme.slug && hasChain) {
      throw new RelayError("INVALID_STATE", "slug cannot change after a chain is created");
    }
    if (patch.slug !== undefined && patch.slug !== theme.slug && this.themes.some((candidate) => candidate.id !== id && candidate.slug === patch.slug)) {
      throw new RelayError("INVALID_STATE", "slug already exists");
    }
    if (patch.slug !== undefined) theme.slug = patch.slug;
    if (patch.titleRu !== undefined) { theme.titleRu = patch.titleRu; theme.title = patch.titleRu; }
    if (patch.titleEn !== undefined) theme.titleEn = patch.titleEn;
    if (patch.seedTextRu !== undefined) { theme.seedTextRu = patch.seedTextRu; theme.seedText = patch.seedTextRu; }
    if (patch.seedTextEn !== undefined) theme.seedTextEn = patch.seedTextEn;
    if (patch.status !== undefined) theme.status = patch.status;
    theme.updatedAt = this.now();
    return this.adminTheme(theme);
  }

  listAdminChains(filters: { language?: Language; status?: Chain["status"] | "all" } = {}): AdminChainSummary[] {
    return [...this.chains.values()]
      .filter((chain) => !filters.language || chain.language === filters.language)
      .filter((chain) => !filters.status || filters.status === "all" || chain.status === filters.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map((chain) => this.adminChainSummary(chain));
  }

  getAdminChain(code: string): AdminChainDetail {
    const chain = [...this.chains.values()].find((candidate) => candidate.publicCode === code);
    if (!chain) throw new RelayError("CHAIN_NOT_FOUND");
    const messages = [...this.messages.values()]
      .filter((message) => message.chainId === chain.id)
      .sort((a, b) => a.hopIndex - b.hopIndex)
      .map(({ id, hopIndex, text, moderationStatus, createdAt }) => ({ id, hopIndex, text, moderationStatus, createdAt }));
    return { ...this.adminChainSummary(chain), seed: { text: chain.seedTextSnapshot }, messages };
  }

  createAdminChains(themeId: string, language: Language, count: number): AdminChainSummary[] {
    const theme = this.themes.find((candidate) => candidate.id === themeId);
    if (!theme) throw new RelayError("THEME_NOT_FOUND");
    const selectedSeed = language === "ru" ? theme.seedTextRu ?? theme.seedText : theme.seedTextEn ?? theme.seedText;
    if (theme.status !== "ACTIVE" || !selectedSeed.trim()) throw new RelayError("THEME_NOT_ACTIVE");
    const activeCount = [...this.chains.values()].filter((chain) => chain.language === language && chain.status === "ACTIVE").length;
    if (activeCount + count > ACTIVE_CHAIN_CAP) throw new RelayError("CHAIN_CAP_REACHED");
    const created: AdminChainSummary[] = [];
    for (let index = 0; index < count; index += 1) {
      const chain = this.seedChain(language, themeId);
      created.push(this.adminChainSummary(chain));
    }
    return created;
  }

  pauseAdminChain(code: string): AdminChainSummary {
    const chain = this.mustAdminChain(code);
    if (chain.status !== "ACTIVE") throw new RelayError("INVALID_STATE");
    chain.status = "PAUSED";
    chain.updatedAt = this.now();
    this.cancelChainClaims(chain.id);
    this.archiveChainReports(chain.id);
    return this.adminChainSummary(chain);
  }

  resumeAdminChain(code: string): AdminChainSummary {
    const chain = this.mustAdminChain(code);
    if (chain.status !== "PAUSED") throw new RelayError("INVALID_STATE");
    const activeCount = [...this.chains.values()].filter((candidate) => candidate.language === chain.language && candidate.status === "ACTIVE").length;
    if (activeCount >= ACTIVE_CHAIN_CAP) throw new RelayError("CHAIN_CAP_REACHED");
    chain.status = "ACTIVE";
    chain.updatedAt = this.now();
    return this.adminChainSummary(chain);
  }

  archiveAdminChain(code: string): AdminChainSummary {
    const chain = this.mustAdminChain(code);
    if (chain.status === "ARCHIVED") throw new RelayError("INVALID_STATE");
    chain.status = "ARCHIVED";
    chain.updatedAt = this.now();
    this.cancelChainClaims(chain.id);
    this.archiveChainReports(chain.id);
    return this.adminChainSummary(chain);
  }

  listAdminReports(status: ReportRecord["status"] | "all" = "all"): AdminReport[] {
    return [...this.reports.values()]
      .filter((report) => status === "all" || report.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map((report) => this.adminReport(report));
  }

  dismissAdminReport(id: string): AdminReport {
    const report = this.mustAdminReport(id);
    if (report.status !== "OPEN") throw new RelayError("REPORT_ALREADY_RESOLVED");
    report.status = "DISMISSED";
    report.resolvedAt = this.now();
    return this.adminReport(report);
  }

  hideAdminReportMessage(id: string): { report: AdminReport; message: Pick<Message, "id" | "moderationStatus"> } {
    const report = this.mustAdminReport(id);
    if (report.status !== "OPEN") throw new RelayError("REPORT_ALREADY_RESOLVED");
    const message = this.mustMessage(report.messageId);
    message.moderationStatus = "HIDDEN";
    report.status = "HIDDEN";
    report.resolvedAt = this.now();
    return { report: this.adminReport(report), message: { id: message.id, moderationStatus: message.moderationStatus } };
  }

  archiveAdminReportChain(id: string): { report: AdminReport; chain: AdminChainSummary } {
    const report = this.mustAdminReport(id);
    if (report.status !== "OPEN") throw new RelayError("REPORT_ALREADY_RESOLVED");
    const chain = this.mustChain(this.mustMessage(report.messageId).chainId);
    if (chain.status !== "ARCHIVED") {
      chain.status = "ARCHIVED";
      chain.updatedAt = this.now();
      this.cancelChainClaims(chain.id);
    }
    this.archiveChainReports(chain.id);
    return { report: this.adminReport(report), chain: this.adminChainSummary(chain) };
  }

  cancel(claimId: string, sessionHash: string): void {
    const claim = this.claims.get(claimId);
    if (!claim) throw new RelayError("CLAIM_NOT_FOUND");
    if (claim.sessionHash !== sessionHash) throw new RelayError("CLAIM_OWNER_REQUIRED");
    if (claim.status === "SUBMITTED") throw new RelayError("CLAIM_SUBMITTED");
    if (claim.status === "EXPIRED" || claim.status === "CANCELLED") return;
    claim.status = "CANCELLED";
    claim.testOnlyToken = "";
  }

  getPublicState(code: string) {
    const chain = [...this.chains.values()].find((candidate) => candidate.publicCode === code);
    if (!chain) throw new RelayError("CHAIN_NOT_FOUND");
    const messages = [...this.messages.values()]
      .filter((message) => message.chainId === chain.id)
      .sort((a, b) => a.hopIndex - b.hopIndex);
    return {
      publicCode: chain.publicCode,
      language: chain.language,
      status: chain.status,
      currentHop: chain.currentHop,
      targetHops: chain.targetHops,
      themeTitle: chain.themeTitleSnapshot,
      completedAt: chain.completedAt,
      ...(chain.status === "COMPLETED"
        ? { seedText: chain.seedTextSnapshot, messages: messages.map(({ sessionHash: _sessionHash, ...message }) => message) }
        : { messages: [] }),
    };
  }

  listGallery(filters: {
    language?: Language;
    themeSlug?: string;
    period?: "30d" | "365d" | "all";
    cursor?: { completedAt: Date; publicCode: string } | null;
    limit?: number;
  } = {}): GalleryChain[] {
    if (filters.themeSlug && !this.themes.some((theme) => theme.slug === filters.themeSlug)) {
      throw new RelayError("THEME_NOT_FOUND");
    }
    const period = filters.period ?? "all";
    const cutoff = period === "all" ? null : this.now().getTime() - (period === "30d" ? 30 : 365) * 24 * 60 * 60 * 1000;
    const cursor = filters.cursor ?? null;
    return [...this.chains.values()]
      .filter((chain) => chain.status === "COMPLETED" && chain.completedAt !== null)
      .filter((chain) => !filters.language || chain.language === filters.language)
      .filter((chain) => {
        if (!filters.themeSlug) return true;
        const theme = this.themes.find((candidate) => candidate.id === chain.themeId);
        return theme?.slug === filters.themeSlug;
      })
      .filter((chain) => cutoff === null || (chain.completedAt?.getTime() ?? 0) >= cutoff)
      .filter((chain) => {
        if (!cursor || !chain.completedAt) return true;
        const completedTime = chain.completedAt.getTime();
        return completedTime < cursor.completedAt.getTime() || (completedTime === cursor.completedAt.getTime() && chain.publicCode > cursor.publicCode);
      })
      .sort((left, right) => {
        const completedDifference = (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0);
        return completedDifference || (left.publicCode < right.publicCode ? -1 : left.publicCode > right.publicCode ? 1 : 0);
      })
      .slice(0, filters.limit ?? 13)
      .map((chain) => ({
        publicCode: chain.publicCode,
        language: chain.language,
        themeTitle: chain.themeTitleSnapshot,
        completedAt: chain.completedAt!,
        targetHops: chain.targetHops,
      }));
  }

  private adminTheme(theme: ThemeFixture): AdminTheme {
    const createdAt = theme.createdAt ?? this.now();
    return {
      id: theme.id,
      slug: theme.slug,
      titleRu: theme.titleRu ?? theme.title,
      titleEn: theme.titleEn ?? theme.title,
      seedTextRu: theme.seedTextRu ?? theme.seedText,
      seedTextEn: theme.seedTextEn ?? theme.seedText,
      status: theme.status,
      createdAt,
      updatedAt: theme.updatedAt ?? createdAt,
    };
  }

  private adminChainSummary(chain: Chain): AdminChainSummary {
    return {
      publicCode: chain.publicCode,
      language: chain.language,
      themeTitle: chain.themeTitleSnapshot,
      currentHop: chain.currentHop,
      targetHops: chain.targetHops,
      status: chain.status,
      lastActivityAt: chain.lastActivityAt,
      createdAt: chain.createdAt,
      completedAt: chain.completedAt,
    };
  }

  private adminReport(report: ReportRecord): AdminReport {
    const message = this.mustMessage(report.messageId);
    const chain = this.mustChain(message.chainId);
    return {
      id: report.id,
      status: report.status,
      reason: report.reason,
      details: report.details,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      message: {
        id: message.id,
        chainPublicCode: chain.publicCode,
        hopIndex: message.hopIndex,
        text: message.text,
        moderationStatus: message.moderationStatus,
      },
      chain: { publicCode: chain.publicCode, status: chain.status },
    };
  }

  private mustAdminChain(code: string): Chain {
    const chain = [...this.chains.values()].find((candidate) => candidate.publicCode === code);
    if (!chain) throw new RelayError("CHAIN_NOT_FOUND");
    return chain;
  }

  private mustAdminReport(id: string): ReportRecord {
    const report = this.reports.get(id);
    if (!report) throw new RelayError("REPORT_NOT_FOUND");
    return report;
  }

  private cancelChainClaims(chainId: string): void {
    for (const claim of this.claims.values()) {
      if (claim.chainId === chainId && claim.status === "ACTIVE") {
        claim.status = "CANCELLED";
        claim.testOnlyToken = "";
      }
    }
  }

  private archiveChainReports(chainId: string): void {
    const resolvedAt = this.now();
    for (const report of this.reports.values()) {
      const message = this.messages.get(report.messageId);
      if (message?.chainId === chainId && report.status === "OPEN") {
        report.status = "CHAIN_ARCHIVED";
        report.resolvedAt = resolvedAt;
      }
    }
  }

  private findRequestedChain(code: string, language: Language, sessionHash: string): Chain {
    const chain = [...this.chains.values()].find((candidate) => candidate.publicCode === code);
    if (!chain) throw new RelayError("CHAIN_NOT_FOUND");
    if (chain.status === "COMPLETED") throw new RelayError("CHAIN_COMPLETED");
    if (chain.status === "PAUSED") throw new RelayError("CHAIN_PAUSED");
    if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
    if (chain.language !== language) throw new RelayError("LANGUAGE_MISMATCH");
    if (this.hasSessionMessage(chain.id, sessionHash)) throw new RelayError("SESSION_ALREADY_PARTICIPATED");
    const now = this.now().getTime();
    for (const claim of this.claims.values()) {
      if (claim.chainId === chain.id && claim.status === "ACTIVE" && claim.expiresAt.getTime() <= now) {
        claim.status = "EXPIRED";
        claim.testOnlyToken = "";
      }
    }
    if ([...this.claims.values()].some((claim) => claim.chainId === chain.id && claim.status === "ACTIVE")) {
      throw new RelayError("CHAIN_BUSY");
    }
    return chain;
  }

  private findNextChain(language: Language, sessionHash: string, excludedPublicCode?: string | null): Chain {
    const now = this.now().getTime();
    for (const claim of this.claims.values()) {
      if (claim.status === "ACTIVE" && claim.expiresAt.getTime() <= now) {
        claim.status = "EXPIRED";
        claim.testOnlyToken = "";
      }
    }
    const candidates = [...this.chains.values()]
      .filter((chain) => chain.language === language && chain.status === "ACTIVE")
      .filter((chain) => !excludedPublicCode || chain.publicCode !== excludedPublicCode)
      .filter((chain) => !this.hasSessionMessage(chain.id, sessionHash))
      .filter((chain) => ![...this.claims.values()].some((claim) => claim.chainId === chain.id && claim.status === "ACTIVE"))
      .sort((a, b) => a.currentHop - b.currentHop);
    if (candidates.length > 0) return candidates[0];
    // Повторяем договор выбора PostgreSQL: общий предел цепочек по языку имеет
    // приоритет над наличием начального текста, если подходящей цепочки нет.
    if ([...this.chains.values()].filter((chain) => chain.language === language && chain.status === "ACTIVE").length >= ACTIVE_CHAIN_CAP) {
      throw new RelayError("NO_CHAIN_AVAILABLE");
    }
    if (this.themes.some((theme) => theme.status === "ACTIVE")) return this.seedChain(language);
    throw new RelayError("NO_ACTIVE_SEED");
  }

  private nextThemeId(language: Language): string | undefined {
    const activeThemes = this.themes.filter((theme) => theme.status === "ACTIVE");
    if (activeThemes.length === 0) return undefined;
    const usage = new Map(activeThemes.map((theme) => [theme.id, 0]));
    for (const chain of this.chains.values()) {
      if (chain.language !== language) continue;
      usage.set(chain.themeId, (usage.get(chain.themeId) ?? 0) + 1);
    }
    return activeThemes
      .slice()
      .sort((left, right) => {
        const usageDelta = (usage.get(left.id) ?? 0) - (usage.get(right.id) ?? 0);
        if (usageDelta !== 0) return usageDelta;
        return (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);
      })[0]?.id;
  }

  private expireSessionClaim(sessionHash: string): void {
    const now = this.now().getTime();
    for (const claim of this.claims.values()) {
      if (claim.sessionHash === sessionHash && claim.status === "ACTIVE" && claim.expiresAt.getTime() <= now) {
        claim.status = "EXPIRED";
        claim.testOnlyToken = "";
      }
    }
  }

  private hasSessionMessage(chainId: string, sessionHash: string): boolean {
    return [...this.messages.values()].some((message) => message.chainId === chainId && message.sessionHash === sessionHash);
  }

  private previousText(chain: Chain): string {
    if (chain.currentHop === 0) return chain.seedTextSnapshot;
    return this.findMessage(chain.id, chain.currentHop)?.text ?? chain.seedTextSnapshot;
  }

  private findMessage(chainId: string, hopIndex: number): Message | undefined {
    return [...this.messages.values()].find((message) => message.chainId === chainId && message.hopIndex === hopIndex);
  }

  private startResult(chain: Chain, claim: Claim, replayed: boolean): StartResult {
    return {
      replayed,
      chain: { publicCode: chain.publicCode, language: chain.language, currentHop: chain.currentHop, targetHops: chain.targetHops, status: chain.status },
      claim: { id: claim.id, hopIndex: claim.hopIndex, status: claim.status, expiresAt: claim.status === "ACTIVE" ? claim.expiresAt : null, submittedMessageId: claim.submittedMessageId, claimToken: claim.status === "ACTIVE" ? claim.testOnlyToken : null },
      previousText: this.previousText(chain),
    };
  }

  private submitResult(chain: Chain, message: Message, replayed: boolean): SubmitResult {
    return {
      replayed,
      message: { id: message.id, hopIndex: message.hopIndex, text: message.text, wordCount: message.wordCount, createdAt: message.createdAt },
      chain: { publicCode: chain.publicCode, currentHop: chain.currentHop, targetHops: chain.targetHops, status: chain.status },
    };
  }

  private recoverResult(chain: Chain, claim: Claim, token: string, replayed: boolean): RecoverResult {
    return {
      recovered: true,
      replayed,
      chain: { publicCode: chain.publicCode, currentHop: chain.currentHop, targetHops: chain.targetHops, status: chain.status },
      claim: {
        id: claim.id,
        hopIndex: claim.hopIndex,
        status: claim.status,
        expiresAt: claim.expiresAt,
        submittedMessageId: claim.submittedMessageId,
        claimToken: token,
      },
      previousText: this.previousText(chain),
    };
  }

  private mustChain(id: string): Chain {
    const chain = this.chains.get(id);
    if (!chain) throw new RelayError("CHAIN_NOT_FOUND");
    return chain;
  }

  private mustClaim(id: string): Claim {
    const claim = this.claims.get(id);
    if (!claim) throw new RelayError("CLAIM_NOT_FOUND");
    return claim;
  }

  private mustMessage(id: string): Message {
    const message = this.messages.get(id);
    if (!message) throw new RelayError("CHAIN_ADVANCED");
    return message;
  }
}
