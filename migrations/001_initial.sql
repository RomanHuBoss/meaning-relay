BEGIN;

-- Эта миграция задаёт структуру данных, ограничения целостности и правила хранения проекта.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Сначала создаются перечисления предметной области: таблицы ниже используют
-- их как ограничения допустимых состояний, языков и результатов модерации.

DO $$ BEGIN
  CREATE TYPE language_code AS ENUM ('ru', 'en', 'zh', 'fr', 'hi', 'es');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Старые инсталляции могли создать перечисление только с ru и en.
-- Дополняем его идемпотентно, чтобы обновление VPS не требовало ручного SQL.
ALTER TYPE language_code ADD VALUE IF NOT EXISTS 'zh';
ALTER TYPE language_code ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE language_code ADD VALUE IF NOT EXISTS 'hi';
ALTER TYPE language_code ADD VALUE IF NOT EXISTS 'es';

DO $$ BEGIN
  CREATE TYPE theme_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE chain_status AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM ('ACTIVE', 'SUBMITTED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM ('ALLOWED', 'BLOCKED', 'HIDDEN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM ('SPAM', 'ABUSE', 'PERSONAL_DATA', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('OPEN', 'DISMISSED', 'HIDDEN', 'CHAIN_ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE country_event_type AS ENUM ('MESSAGE_SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE analytics_event_type AS ENUM (
    'LANDING_VIEW', 'LANGUAGE_SELECTED', 'CHAIN_ASSIGNED', 'CLAIM_CREATED',
    'DRAFT_STARTED', 'MESSAGE_SUBMITTED', 'MESSAGE_REJECTED', 'CLAIM_EXPIRED',
    'CHAIN_COMPLETED', 'RESULT_VIEWED', 'SHARE_CLICKED', 'REPORT_CREATED', 'MAP_VIEWED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rate_limit_kind AS ENUM ('START', 'SUBMIT', 'RECOVER', 'REPORT', 'ADMIN_LOGIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recovery_status AS ENUM ('ACTIVE', 'STALE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Темы хранят исходные тексты, из которых создаются неизменяемые снимки цепочек.
CREATE TABLE IF NOT EXISTS themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE CHECK (slug = lower(slug)),
  title_ru varchar(160) NOT NULL,
  title_en varchar(160) NOT NULL,
  seed_text_ru varchar(500) NOT NULL,
  seed_text_en varchar(500) NOT NULL,
  status theme_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Цепочка содержит текущий прогресс и снимок темы, чтобы правка темы не меняла историю.
CREATE TABLE IF NOT EXISTS chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code char(10) NOT NULL UNIQUE CHECK (public_code ~ '^[1-9A-HJ-NP-Za-km-z]{10}$'),
  theme_id uuid NOT NULL REFERENCES themes(id),
  theme_title_snapshot varchar(160) NOT NULL,
  seed_text_snapshot varchar(500) NOT NULL,
  language language_code NOT NULL,
  target_hops smallint NOT NULL DEFAULT 12 CHECK (target_hops = 12),
  current_hop smallint NOT NULL DEFAULT 0 CHECK (current_hop BETWEEN 0 AND 12),
  status chain_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

-- В сессии хранится только производный идентификатор участника и сроки его действия.
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sid_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  CHECK (expires_at >= created_at)
);

-- Сообщения связаны с цепочкой и заявкой, но не содержат исходный идентификатор сессии.
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  hop_index smallint NOT NULL CHECK (hop_index BETWEEN 1 AND 12),
  parent_id uuid NULL REFERENCES messages(id),
  text varchar(500) NOT NULL,
  word_count smallint NOT NULL CHECK (word_count >= 1 AND word_count <= 60),
  text_hash char(64) NOT NULL,
  session_hash char(64) NOT NULL,
  moderation_status moderation_status NOT NULL DEFAULT 'ALLOWED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, hop_index),
  UNIQUE (chain_id, session_hash)
);

-- Заявка временно резервирует ход; уникальные индексы ниже защищают гонки.
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  hop_index smallint NOT NULL CHECK (hop_index BETWEEN 1 AND 12),
  session_hash char(64) NOT NULL,
  claim_token_hash char(64) NOT NULL UNIQUE,
  active_token_ciphertext text NULL,
  idempotency_key varchar(36) NULL,
  submitted_message_id uuid NULL REFERENCES messages(id),
  submitted_text_hash char(64) NULL,
  submitted_country_code char(2) NULL,
  start_request_id uuid NULL,
  status claim_status NOT NULL DEFAULT 'ACTIVE',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz NULL,
  CHECK (
    (status = 'ACTIVE' AND active_token_ciphertext IS NOT NULL)
    OR (status <> 'ACTIVE' AND active_token_ciphertext IS NULL)
  ),
  CHECK (submitted_country_code IS NULL OR submitted_country_code ~ '^[A-Z]{2}$')
);

CREATE TABLE IF NOT EXISTS participation_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hash char(64) NOT NULL,
  idempotency_key varchar(36) NOT NULL,
  request_hash char(64) NOT NULL,
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_replayed_at timestamptz NULL,
  UNIQUE (session_hash, idempotency_key)
);

ALTER TABLE participation_starts
  DROP CONSTRAINT IF EXISTS participation_starts_claim_id_fkey;
ALTER TABLE participation_starts
  ADD CONSTRAINT participation_starts_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE claims
  DROP CONSTRAINT IF EXISTS claims_start_request_id_fkey;
ALTER TABLE claims
  ADD CONSTRAINT claims_start_request_id_fkey
  FOREIGN KEY (start_request_id) REFERENCES participation_starts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hash char(64) NOT NULL,
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  recover_idempotency_key varchar(36) NOT NULL,
  request_hash char(64) NOT NULL,
  token_ciphertext text NOT NULL,
  status recovery_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_hash, recover_idempotency_key)
);

-- Жалобы отделены от сообщения, чтобы модерация не раскрывала служебные данные автора.
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reporter_hash char(64) NOT NULL,
  reason report_reason NOT NULL,
  details varchar(300) NULL,
  status report_status NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  UNIQUE (message_id, reporter_hash, reason)
);

CREATE TABLE IF NOT EXISTS country_events (
  id bigserial PRIMARY KEY,
  country_code char(2) NULL CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  day_utc date NOT NULL,
  event_type country_event_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type analytics_event_type NOT NULL,
  chain_id uuid NULL REFERENCES chains(id) ON DELETE SET NULL,
  session_hash char(64) NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Счётчики ограничений запросов общие для всех экземпляров приложения.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_hash char(64) NOT NULL,
  limit_kind rate_limit_kind NOT NULL,
  bucket_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  expires_at timestamptz NOT NULL,
  UNIQUE (scope_hash, limit_kind, bucket_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS claims_active_chain_hop_uidx
  ON claims (chain_id, hop_index) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS claims_active_session_uidx
  ON claims (session_hash) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS claims_session_idempotency_uidx
  ON claims (session_hash, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recoveries_active_claim_uidx
  ON recoveries (claim_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS claims_expiry_idx ON claims (expires_at);
CREATE INDEX IF NOT EXISTS claims_session_status_idx ON claims (session_hash, status);
CREATE INDEX IF NOT EXISTS events_type_created_idx ON events (event_type, created_at);
CREATE INDEX IF NOT EXISTS events_chain_created_idx ON events (chain_id, created_at);
CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at);
CREATE INDEX IF NOT EXISTS rate_limit_expiry_idx ON rate_limit_buckets (expires_at);

COMMIT;
