-- smart-log-analyzer: alarms table
-- 2026-05-18
--
-- Alarms surface actionable cluster-level signals for the on-call admin.
-- Lifecycle: open → cleared (soft transition; cleared rows are never deleted).
-- Only users with the 'clear_alarms' permission_key can UPDATE status.
-- The cleared_by + cleared_at columns preserve the audit trail after clearance.

-- ============================================================
-- ENUM
-- ============================================================

CREATE TYPE alarm_status AS ENUM ('open', 'cleared');

-- ============================================================
-- ALARMS
-- ============================================================

CREATE TABLE alarms (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  cluster_id  UUID         REFERENCES log_clusters(id) ON DELETE SET NULL,
  severity    log_severity NOT NULL,
  status      alarm_status NOT NULL DEFAULT 'open',
  cleared_by  UUID         REFERENCES auth.users(id),
  cleared_at  TIMESTAMPTZ,
  notes       TEXT
);

CREATE INDEX alarms_status_idx     ON alarms (status);
CREATE INDEX alarms_cluster_id_idx ON alarms (cluster_id);
CREATE INDEX alarms_created_at_idx ON alarms (created_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE alarms ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read alarms (viewers need this for the Alarms page).
CREATE POLICY "alarms_select"
  ON alarms FOR SELECT TO authenticated USING (true);

-- Only users with the 'clear_alarms' permission can update an alarm's status.
-- cleared_by must be set to the acting user — prevents clearing on behalf of others.
CREATE POLICY "alarms_update_clear"
  ON alarms FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'clear_alarms'))
  WITH CHECK (
    has_permission(auth.uid(), 'clear_alarms')
    AND cleared_by = auth.uid()
  );
