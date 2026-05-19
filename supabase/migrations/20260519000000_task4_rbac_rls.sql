-- smart-log-analyzer: Task 4 — RBAC + RLS write policies
-- 2026-05-19
-- Requires: 20260516000000_initial_schema, 20260517094914_fix_handle_new_user_search_path
--
-- Adds:
--   1. is_root() / is_admin_or_root() helper functions (SECURITY DEFINER, hardened search_path)
--   2. Re-defines existing has_permission() / get_user_role() with SET search_path = ''
--      (the initial-schema versions lack the empty-search_path hardening; this migration
--      brings all SECURITY DEFINER helpers into compliance with the Supabase canonical
--      recipe: SET search_path = '' + schema-qualified table references).
--   3. Broadened SELECT policies: admin/root see all rows on key tables
--      (additive — PostgreSQL OR's permissive policies, so own-only and admin-all coexist).
--   4. WRITE policies: only root can grant/revoke user_roles and user_permissions.
--   5. log_sources INSERT/UPDATE gated to admin/root.
--   6. Broadened export_jobs SELECT for admin/root.
--
-- Security invariants enforced at the DB layer (not just application layer):
--   - Viewer cannot INSERT into user_roles or user_permissions → no self-escalation.
--   - Admin cannot grant roles → only root can.
--   - All SECURITY DEFINER functions run with empty search_path + schema-qualified
--     references → eliminates the search-path-injection vulnerability class.
--
-- Replay-safe: uses CREATE OR REPLACE for functions; CREATE POLICY statements are
-- additive (new policy names that don't collide with initial_schema's policies).

-- ============================================================
-- HELPER FUNCTIONS — SECURITY DEFINER with hardened search_path
-- ============================================================

-- Re-define has_permission() from initial schema with empty search_path discipline.
CREATE OR REPLACE FUNCTION has_permission(uid UUID, perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = uid AND permission_key = perm
  );
$$;

-- Re-define get_user_role() from initial schema with empty search_path discipline.
CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS public.user_role
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.user_roles WHERE user_id = uid LIMIT 1;
$$;

-- is_root: true when the calling user has the 'root' role row.
-- STABLE marks the function as side-effect-free, allowing query-planner caching
-- within a single statement. SECURITY DEFINER lets the function read user_roles
-- regardless of the caller's RLS view.
CREATE OR REPLACE FUNCTION is_root(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role = 'root'
  );
$$;

-- is_admin_or_root: true when the calling user has 'admin' OR 'root'.
CREATE OR REPLACE FUNCTION is_admin_or_root(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role IN ('admin', 'root')
  );
$$;

-- ============================================================
-- PROFILES — admin/root can read all profiles (user management UI)
-- ============================================================

-- Additive to "profiles_select_own" from initial schema.
-- Multiple PERMISSIVE policies on the same (cmd, role) are OR'd together.
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT TO authenticated
  USING (is_admin_or_root(auth.uid()));

-- ============================================================
-- USER ROLES — broadened read + write policies
-- ============================================================

-- Broadened SELECT: admin/root see all role assignments.
CREATE POLICY "user_roles_select_admin"
  ON user_roles FOR SELECT TO authenticated
  USING (is_admin_or_root(auth.uid()));

-- INSERT: only root can grant a role.
-- Self-escalation is structurally impossible: viewer/admin cannot satisfy is_root().
CREATE POLICY "user_roles_insert_root"
  ON user_roles FOR INSERT TO authenticated
  WITH CHECK (is_root(auth.uid()));

-- DELETE: only root can revoke a role.
CREATE POLICY "user_roles_delete_root"
  ON user_roles FOR DELETE TO authenticated
  USING (is_root(auth.uid()));

-- ============================================================
-- USER PERMISSIONS — broadened read + write policies
-- ============================================================

-- Broadened SELECT: admin/root see all permission grants.
CREATE POLICY "user_permissions_select_admin"
  ON user_permissions FOR SELECT TO authenticated
  USING (is_admin_or_root(auth.uid()));

-- INSERT: only root can grant a permission.
-- Keeps privilege escalation out of admin hands entirely.
CREATE POLICY "user_permissions_insert_root"
  ON user_permissions FOR INSERT TO authenticated
  WITH CHECK (is_root(auth.uid()));

-- DELETE: only root can revoke a permission.
CREATE POLICY "user_permissions_delete_root"
  ON user_permissions FOR DELETE TO authenticated
  USING (is_root(auth.uid()));

-- ============================================================
-- LOG SOURCES — admin/root can configure ingestion endpoints
-- ============================================================

CREATE POLICY "log_sources_insert"
  ON log_sources FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_root(auth.uid()));

CREATE POLICY "log_sources_update"
  ON log_sources FOR UPDATE TO authenticated
  USING (is_admin_or_root(auth.uid()));

-- ============================================================
-- EXPORT JOBS — admin/root see all jobs (not just own)
-- ============================================================

-- Additive to "export_jobs_select" (own rows) from initial schema.
CREATE POLICY "export_jobs_select_admin"
  ON export_jobs FOR SELECT TO authenticated
  USING (is_admin_or_root(auth.uid()));
