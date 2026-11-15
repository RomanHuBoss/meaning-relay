// Здесь описаны общие типы предметной области и формы данных между слоями приложения.
import type { ChainStatus, ClaimStatus, Language, ModerationStatus } from "../constants";

export interface Theme {
  id: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  seedTextRu: string;
  seedTextEn: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export interface Chain {
  id: string;
  publicCode: string;
  themeId: string;
  themeTitleSnapshot: string;
  seedTextSnapshot: string;
  language: Language;
  targetHops: 12;
  currentHop: number;
  status: ChainStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  lastActivityAt: Date;
}

export interface Claim {
  id: string;
  chainId: string;
  hopIndex: number;
  sessionHash: string;
  claimTokenHash: string;
  /** Копия только для тестов; PostgreSQL-адаптер хранит шифротекст AES-256-GCM. */
  testOnlyToken: string;
  idempotencyKey: string | null;
  submittedMessageId: string | null;
  submittedTextHash: string | null;
  submittedCountryCode: string | null;
  status: ClaimStatus;
  claimedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
}

export interface Message {
  id: string;
  chainId: string;
  hopIndex: number;
  parentId: string | null;
  text: string;
  wordCount: number;
  textHash: string;
  sessionHash: string;
  moderationStatus: ModerationStatus;
  createdAt: Date;
}

export interface StartResult {
  replayed: boolean;
  chain: Pick<Chain, "publicCode" | "language" | "currentHop" | "targetHops" | "status">;
  claim: {
    id: string;
    hopIndex: number;
    status: Claim["status"];
    expiresAt: Date | null;
    submittedMessageId: string | null;
    claimToken: string | null;
  };
  previousText: string;
}

export interface SubmitResult {
  replayed: boolean;
  message: Pick<Message, "id" | "hopIndex" | "text" | "wordCount" | "createdAt">;
  chain: Pick<Chain, "publicCode" | "currentHop" | "targetHops" | "status">;
}

export interface RecoverResult {
  recovered: boolean;
  replayed: boolean;
  chain: Pick<Chain, "publicCode" | "currentHop" | "targetHops" | "status">;
  claim: {
    id: string;
    hopIndex: number;
    status: Claim["status"];
    expiresAt: Date | null;
    submittedMessageId: string | null;
    claimToken: string | null;
  };
  previousText: string;
}

export type ReportReason = "SPAM" | "ABUSE" | "PERSONAL_DATA" | "OTHER";

export interface ReportResult {
  report: { id: string; status: "OPEN" };
}

export interface PublicStats {
  activeChains: number;
  completedChains: number;
  savedMessages: number;
  totalParticipants: number;
  updatedAt: Date;
}

export interface GalleryChain {
  publicCode: string;
  language: Language;
  themeTitle: string;
  completedAt: Date;
  targetHops: number;
}

export interface PublicMapStats {
  period: "24h" | "all";
  totalEvents: number;
  countries: Array<{ countryCode: string; count: number }>;
  updatedAt: Date;
}

export interface MaintenanceResult {
  ranAt: Date;
  counts: {
    expiredClaims: number;
    archivedChains: number;
    cancelledClaims: number;
    deletedRows: number;
  };
}

export type RelayErrorCode =
  | "INVALID_BODY"
  | "INVALID_JSON"
  | "ADMIN_REQUIRED"
  | "ADMIN_INVALID_KEY"
  | "ADMIN_SESSION_EXPIRED"
  | "REPORT_ALREADY_RESOLVED"
  | "INVALID_STATE"
  | "INVALID_FILTER"
  | "CURSOR_INVALID"
  | "THEME_NOT_FOUND"
  | "THEME_NOT_ACTIVE"
  | "CHAIN_CAP_REACHED"
  | "REPORT_NOT_FOUND"
  | "INVALID_IDEMPOTENCY_KEY"
  | "START_IDEMPOTENCY_REUSED"
  | "START_EXPIRED"
  | "START_CANCELLED"
  | "SESSION_HAS_ACTIVE_CLAIM"
  | "NO_CHAIN_AVAILABLE"
  | "NO_ACTIVE_SEED"
  | "CHAIN_NOT_FOUND"
  | "CHAIN_BUSY"
  | "CHAIN_COMPLETED"
  | "CHAIN_PAUSED"
  | "CHAIN_ARCHIVED"
  | "LANGUAGE_MISMATCH"
  | "SESSION_ALREADY_PARTICIPATED"
  | "CLAIM_NOT_FOUND"
  | "CLAIM_OWNER_REQUIRED"
  | "CLAIM_EXPIRED"
  | "CLAIM_CANCELLED"
  | "CLAIM_SUBMITTED"
  | "CLAIM_TOKEN_INVALID"
  | "INVALID_RECOVER_IDEMPOTENCY_KEY"
  | "RECOVERY_IDEMPOTENCY_REUSED"
  | "RECOVERY_STALE"
  | "REPORT_NOT_ALLOWED"
  | "REPORT_DUPLICATE"
  | "MESSAGE_NOT_FOUND"
  | "INVALID_REPORT_REASON"
  | "IDEMPOTENCY_KEY_REUSED"
  | "CHAIN_ADVANCED"
  | "TEXT_REJECTED"
  | "TEXT_DUPLICATE"
  | "INVALID_COUNTRY_CODE"
  | "INVALID_LANGUAGE"
  | "INVALID_THEME"
  | "INVALID_PERIOD";

export class RelayError extends Error {
  constructor(public readonly code: RelayErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RelayError";
  }
}
