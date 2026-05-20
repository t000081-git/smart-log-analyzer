-- smart-log-analyzer: AI analyses + user settings
-- 2026-05-19 (user-mufaddal)
--
-- ai_analyses: stores results of OpenRouter AI analysis calls.
-- user_settings: per-user AI configuration (OpenRouter key, model preference).

-- ============================================================
-- USER SETTINGS
-- ============================================================

CREATE TABLE user_settings (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_key  TEXT,
  preferred_model TEXT        NOT NULL DEFAULT 'anthropic/claude-3.5-sonnet',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_own" ON user_settings
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- AI ANALYSES
-- ============================================================

CREATE TABLE ai_analyses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model           TEXT        NOT NULL,
  log_ids         UUID[]      NOT NULL,
  summary         TEXT,
  threats         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  recommendations TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_analyses_user_idx ON ai_analyses (user_id, created_at DESC);

ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analyses_own" ON ai_analyses
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
