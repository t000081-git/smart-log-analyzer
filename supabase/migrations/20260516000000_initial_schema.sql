-- smart-log-analyzer: initial schema
-- PCP v04.00 bootstrap migration — 2026-05-16
--
-- Lineage: mirrors team migration at
-- ~/Projects/smart-log-analyzer/supabase/migrations/20260515000000_initial_schema.sql
-- WITH ONE FIX: team version has a forward-reference bug — it issues
-- `CREATE INDEX log_cluster_members_event_idx ON log_cluster_members(...)`
-- BEFORE the `log_cluster_members` table itself is created, which fails
-- with `ERROR: relation "log_cluster_members" does not exist`. This solo
-- version moves that CREATE INDEX after the CREATE TABLE.
--
-- Cross-project signal logged in CAVEATS slug:
--   #team-migration-forward-ref-bug (2026-05-16, agent: claude-opus-4-7-1m).
--
-- Day-1 success criteria:
--   1. User can sign in (auth + profiles trigger)
--   2. Role schema known (user_roles + user_permissions + RLS)
--   3. log_events ready to receive events (append-only, hierarchy_level)
--
-- Append-only invariant: log_events has NO UPDATE RLS policy.
-- Corrections are new rows with supersedes_id set — same constraint
-- as PCP CAVEATS append-only / forward-only rule (structural, not discipline).
-- Soft-deletes go to log_event_deletions — never UPDATE log_events.
--
-- hierarchy_level: 0 = raw server logs; 1 = first-level analyzer export;
--                  2 = second-level, etc. (meta-log hierarchy).

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role      AS ENUM ('viewer', 'admin', 'root');
CREATE TYPE log_severity   AS ENUM ('debug', 'info', 'warning', 'error', 'critical');
CREATE TYPE log_source_type AS ENUM (
  'windows_event',
  'linux_syslog',
  'prtg',
  'dxt_netboss',
  'ericsson_5g',
  'smart_log_analyzer_export',
  'smart_log_analyzer_operational',
  'generic_text'
);

-- ============================================================
-- PROFILES  (extends auth.users — auto-created on signup)
-- ============================================================

CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- USER ROLES
-- ============================================================

CREATE TABLE user_roles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       user_role   NOT NULL DEFAULT 'viewer',
  granted_by UUID        REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- ============================================================
-- USER PERMISSIONS  (granular admin capabilities)
-- permission_key examples: 'delete_logs', 'copy_logs',
--   'manage_roles', 'filter_logs', 'export_logs'
-- Root assigns permissions; admins operate within their grants.
-- ============================================================

CREATE TABLE user_permissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT        NOT NULL,
  granted_by     UUID        NOT NULL REFERENCES auth.users(id),
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission_key)
);

-- ============================================================
-- LOG SOURCES  (configured ingestion endpoints)
-- ============================================================

CREATE TABLE log_sources (
  id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT            NOT NULL,
  source_type log_source_type NOT NULL,
  config      JSONB           NOT NULL DEFAULT '{}',
  created_by  UUID            REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOG EVENTS  (core append-only table — NormalizedLogEvent schema)
-- ============================================================

CREATE TABLE log_events (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp       TIMESTAMPTZ     NOT NULL,
  source_type     log_source_type NOT NULL,
  source_id       TEXT            NOT NULL,
  log_source_id   UUID            REFERENCES log_sources(id),
  hierarchy_level INTEGER         NOT NULL DEFAULT 0,
  severity        log_severity    NOT NULL DEFAULT 'info',
  message         TEXT            NOT NULL,
  raw_message     TEXT,
  metadata        JSONB           NOT NULL DEFAULT '{}',
  supersedes_id   UUID            REFERENCES log_events(id),
  -- NO updated_at — this table is append-only by design.
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX log_events_timestamp_idx       ON log_events (timestamp DESC);
CREATE INDEX log_events_created_at_idx      ON log_events (created_at DESC);
CREATE INDEX log_events_source_type_idx     ON log_events (source_type);
CREATE INDEX log_events_hierarchy_level_idx ON log_events (hierarchy_level);
CREATE INDEX log_events_severity_idx        ON log_events (severity);
CREATE INDEX log_events_source_id_idx       ON log_events (source_id);
CREATE INDEX log_events_log_source_id_idx   ON log_events (log_source_id);
-- Partial index — correction chains are rare; only index non-null supersedes_id.
CREATE INDEX log_events_supersedes_id_idx   ON log_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

-- ============================================================
-- LOG CLUSTERS  (AI-generated semantic groupings)
-- ============================================================

CREATE TABLE log_clusters (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label                    TEXT,
  event_count              INTEGER     NOT NULL DEFAULT 0,
  first_seen               TIMESTAMPTZ,
  last_seen                TIMESTAMPTZ,
  severity_distribution    JSONB       NOT NULL DEFAULT '{}',
  source_types             TEXT[]      NOT NULL DEFAULT '{}',
  hierarchy_level          INTEGER     NOT NULL DEFAULT 0,
  -- AI attribution: which model + pipeline version produced this cluster.
  -- Required NOT NULL — every cluster must be traceable to its producer.
  embedding_model_provider TEXT        NOT NULL,
  embedding_model_name     TEXT        NOT NULL,
  pipeline_version         TEXT        NOT NULL,
  clustered_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE log_cluster_members (
  cluster_id    UUID  NOT NULL REFERENCES log_clusters(id) ON DELETE CASCADE,
  log_event_id  UUID  NOT NULL REFERENCES log_events(id)   ON DELETE CASCADE,
  similarity_score FLOAT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cluster_id, log_event_id)
);

-- log_cluster_members: composite PK covers cluster→events lookups;
-- this index covers the reverse (event→cluster) for "which cluster owns this event?"
-- FIX vs team version: this CREATE INDEX statement was emitted before the
-- CREATE TABLE in the team migration. Reordered here to match SQL execution
-- requirements.
CREATE INDEX log_cluster_members_event_idx  ON log_cluster_members (log_event_id);

-- ============================================================
-- CLUSTER SUMMARIES  (LLM-generated plain-English summaries)
-- ============================================================

CREATE TABLE cluster_summaries (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id             UUID        NOT NULL REFERENCES log_clusters(id) ON DELETE CASCADE,
  summary_text           TEXT        NOT NULL,
  -- AI attribution: full model identity, params, and pipeline version.
  -- NOT NULL — unattributed summaries are unauditable (model-swap detection,
  -- hallucination tracing, and reproducibility all require this).
  summary_model_provider TEXT        NOT NULL,
  summary_model_name     TEXT        NOT NULL,
  summary_model_params   JSONB,
  pipeline_version       TEXT        NOT NULL,
  period_start           TIMESTAMPTZ,
  period_end             TIMESTAMPTZ,
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOG EVENT DELETIONS  (soft-delete — preserves append-only invariant)
-- Admins with 'delete_logs' permission INSERT here; never UPDATE log_events.
-- ============================================================

CREATE TABLE log_event_deletions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_event_id UUID        NOT NULL REFERENCES log_events(id) ON DELETE CASCADE,
  deleted_by   UUID        NOT NULL REFERENCES auth.users(id),
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason       TEXT,
  UNIQUE (log_event_id)
);

-- ============================================================
-- EXPORT JOBS  (meta-log export to parent-tier analyzer)
-- hierarchy_level_target: the level this export is destined for.
-- sanitization_policy: JSON config of transforms applied.
--   Radius principle: stronger sanitization as target level increases.
-- ============================================================

CREATE TABLE export_jobs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','complete','failed')),
  hierarchy_level_target INTEGER    NOT NULL,
  sanitization_policy   JSONB       NOT NULL DEFAULT '{}',
  event_count           INTEGER,
  output_path           TEXT,
  error_message         TEXT,
  created_by            UUID        REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

-- ============================================================
-- RLS  (Row Level Security)
-- ============================================================

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_clusters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_cluster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_summaries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_event_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs        ENABLE ROW LEVEL SECURITY;

-- Helpers (SECURITY DEFINER avoids RLS recursion)

CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM user_roles WHERE user_id = uid LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION has_permission(uid UUID, perm TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = uid AND permission_key = perm
  );
$$;

-- PROFILES
CREATE POLICY "profiles_select_own"  ON profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- USER ROLES (users see only their own; service role manages grants)
CREATE POLICY "user_roles_select_own" ON user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- USER PERMISSIONS (users see only their own; service role manages grants)
CREATE POLICY "user_permissions_select_own" ON user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- LOG SOURCES (any authenticated user can read)
CREATE POLICY "log_sources_select" ON log_sources FOR SELECT TO authenticated USING (true);

-- LOG EVENTS
-- SELECT: authenticated users; soft-deleted rows are hidden.
-- INSERT: service role only (AI ingestion pipeline). No UPDATE policy — ever.
CREATE POLICY "log_events_select" ON log_events
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM log_event_deletions WHERE log_event_id = log_events.id
    )
  );

-- LOG CLUSTERS + MEMBERS + SUMMARIES (any authenticated user)
CREATE POLICY "log_clusters_select"        ON log_clusters        FOR SELECT TO authenticated USING (true);
CREATE POLICY "log_cluster_members_select" ON log_cluster_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "cluster_summaries_select"   ON cluster_summaries   FOR SELECT TO authenticated USING (true);

-- LOG EVENT DELETIONS
CREATE POLICY "log_event_deletions_select" ON log_event_deletions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "log_event_deletions_insert" ON log_event_deletions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'delete_logs')
    AND deleted_by = auth.uid()
  );

-- EXPORT JOBS
CREATE POLICY "export_jobs_select" ON export_jobs
  FOR SELECT TO authenticated USING (created_by = auth.uid());

CREATE POLICY "export_jobs_insert" ON export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'export_logs')
    AND created_by = auth.uid()
  );
