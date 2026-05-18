-- smart-log-analyzer: fix handle_new_user() trigger search_path bug
-- 2026-05-17
--
-- Background: handle_new_user() as originally defined had no SET search_path
-- and referenced `profiles` unqualified. SECURITY DEFINER runs with the
-- OWNER's privileges but the CALLER's search_path unless the function
-- specifies its own. When the trigger fires from supabase_auth_admin
-- (whose search_path is {auth}), the unqualified INSERT target can't
-- resolve → trigger errors → auth.users INSERT rolls back → Supabase
-- Auth API returns `500 Database error saving new user` on every signup.
--
-- Failure mode (reproducible): direct INSERT into auth.users as the
-- `postgres` role works (postgres's search_path includes public); every
-- Supabase Auth signup path (admin createUser + public signUp) fails 100%
-- of the time.
--
-- Fix: canonical Supabase recipe — schema-qualified function name, explicit
-- empty search_path (hardens SECURITY DEFINER functions against
-- search_path injection), and schema-qualified public.profiles reference.
-- Matches Supabase's "Managing user data" documentation.
--
-- CREATE OR REPLACE FUNCTION preserves the function's OID, so the existing
-- trigger `on_auth_user_created` continues to fire this same function — no
-- trigger changes are needed.

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
