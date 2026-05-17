-- smart-log-analyzer: fix handle_new_user() trigger search_path bug
-- 2026-05-17
--
-- Lineage: follow-on fix to 20260516000000_initial_schema.sql. The initial
-- migration copied the team's handle_new_user() verbatim and inherited a
-- latent bug: the function had no SET search_path and referenced `profiles`
-- unqualified. SECURITY DEFINER runs with the OWNER's privileges but the
-- CALLER's search_path unless the function specifies its own. When the
-- trigger fires from supabase_auth_admin context (search_path={auth}), the
-- INSERT target can't resolve → trigger errors → auth.users INSERT rolls
-- back → Supabase Auth API returns `500 Database error saving new user`.
--
-- Empirical evidence: see CAVEATS slug #team-handle-new-user-search-path-bug.
-- Direct INSERT into auth.users as `postgres` role worked (postgres
-- search_path includes public); every Supabase Auth signup path failed 100%
-- of the time (admin createUser AND public signUp endpoint).
--
-- Fix: canonical Supabase recipe — schema-qualified function name, explicit
-- empty search_path (security-hardened against search_path injection
-- attacks against SECURITY DEFINER functions), and schema-qualified
-- public.profiles reference. Matches Supabase's "Managing user data" docs.
--
-- CREATE OR REPLACE FUNCTION preserves the function's OID, so the existing
-- trigger `on_auth_user_created` continues to fire this same function — no
-- trigger changes are needed.
--
-- Team relay queue: bundle with #team-migration-forward-ref-bug-confirmed
-- for the eventual WhatsApp ping to user-zahid before they apply their
-- migration. Both are one-line fixes; together they save the full debug
-- loop.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
