-- BYTE BACK 4 / A-B simulated RLS access verification
-- Tested against Supabase on 2026-10-12 after user-approved changes.
-- NO real credentials, email addresses or JWTs. User A/B are resolved by Auth signup order.
-- This script runs as a privileged SQL Editor session. DO NOT run under a user JWT.
-- Each transaction is rolled back: no memos are written or deleted.
-- The actual Vercel app ALSO checks owner_id against a server-verified JWT.
-- The test deliberately checks both positive SELECT and denied cross-user UPDATE/DELETE.

-- FIRST USER (A): can see four original notes, cannot read/modify/delete B's note.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users ORDER BY created_at ASC, id ASC LIMIT 1), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $check_a$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'A: auth.uid() unexpectedly NULL';
  END IF;
  IF (SELECT count(*) FROM public.vault_training_notes) <> 4 THEN
    RAISE EXCEPTION 'A: should see exactly 4 own notes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vault_training_notes WHERE sort_order IS NULL) THEN
    RAISE EXCEPTION 'A: B note was visible';
  END IF;
  UPDATE public.vault_training_notes SET title=title WHERE sort_order IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'A: cross-user UPDATE was allowed'; END IF;
  DELETE FROM public.vault_training_notes WHERE sort_order IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'A: cross-user DELETE was allowed'; END IF;
END $check_a$;
ROLLBACK;

-- SECOND USER (B): can see one B note, cannot read/modify/delete A's originals.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users ORDER BY created_at DESC, id DESC LIMIT 1), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $check_b$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'B: auth.uid() unexpectedly NULL';
  END IF;
  IF (SELECT count(*) FROM public.vault_training_notes) <> 1 THEN
    RAISE EXCEPTION 'B: should see exactly 1 own note';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vault_training_notes WHERE sort_order IS NOT NULL) THEN
    RAISE EXCEPTION 'B: A original notes were visible';
  END IF;
  UPDATE public.vault_training_notes SET title=title WHERE sort_order IS NOT NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'B: cross-user UPDATE was allowed'; END IF;
  DELETE FROM public.vault_training_notes WHERE sort_order IS NOT NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'B: cross-user DELETE was allowed'; END IF;
END $check_b$;
ROLLBACK;

-- Post-check: original total remains 5, no ownerless notes, policy count 4.
SELECT (SELECT count(*)::integer FROM public.vault_training_notes) AS total_notes,
  (SELECT count(*)::integer FROM public.vault_training_notes WHERE owner_id IS NULL) AS unassigned,
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='public' AND tablename='vault_training_notes') AS policies;
