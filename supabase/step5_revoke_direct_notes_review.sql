-- BYTE BACK STEP 5 / OWNER REVIEW AND MANUAL EXECUTION ONLY
-- Intentionally NOT applied by the assistant. The owner must review and run
-- this ONE transaction in the Supabase SQL editor for the learning database.
-- Scope: exactly public.vault_training_notes. Other diary tables/Auth are untouched.
-- The Vercel server's SUPABASE_SECRET_KEY/service_role remains unchanged.
-- The browser continues to use Supabase Auth for login, NOT for notes data.
-- The existing four RLS policies remain as defense in depth.
--
-- BEFORE: run supabase/step5_verify_permissions.sql and confirm
-- authenticated has table SELECT/INSERT/UPDATE/DELETE and service_role has CRUD.
-- Also confirm A can list/create/update/delete via the SERVER /api/notes routes.
--
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.vault_training_notes') IS NULL THEN
    RAISE EXCEPTION 'BYTE BACK notes table not found; permissions unchanged';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.vault_training_notes'::regclass) THEN
    RAISE EXCEPTION 'Existing notes RLS disabled; stop and inspect';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='vault_training_notes') <> 4 THEN
    RAISE EXCEPTION 'Unexpected notes RLS policy count; stop and inspect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS p(name)
    WHERE NOT has_table_privilege('service_role','public.vault_training_notes',p.name)
  ) THEN
    RAISE EXCEPTION 'Server service_role missing CRUD; stop without changes';
  END IF;
END
$preflight$;

-- ONLY the notes table. Do not revoke service_role or touch Auth/other apps.
REVOKE ALL PRIVILEGES ON TABLE public.vault_training_notes
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  privilege_name text;
BEGIN
  FOREACH privilege_name IN ARRAY
    ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
  LOOP
    IF has_table_privilege('anon','public.vault_training_notes',privilege_name)
       OR has_table_privilege('authenticated','public.vault_training_notes',privilege_name) THEN
      RAISE EXCEPTION 'Direct role privilege % remains; entire transaction rolled back', privilege_name;
    END IF;
  END LOOP;

  FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE']
  LOOP
    IF NOT has_table_privilege('service_role','public.vault_training_notes',privilege_name) THEN
      RAISE EXCEPTION 'Service_role lost %; entire transaction rolled back', privilege_name;
    END IF;
  END LOOP;
END
$verify$;

COMMIT;

-- AFTER: run supabase/step5_verify_permissions.sql again.
-- Expect anon and authenticated: all table privileges FALSE.
-- Expect service_role CRUD: TRUE, RLS: TRUE and policies: 4.
-- User's original synthetic A/B notes are not updated, added or deleted.
-- Direct PostgREST requests with anon key / authenticated JWT must be denied
-- even for the caller's own rows; server-authenticated /api/notes still works.
