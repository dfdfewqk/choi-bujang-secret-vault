-- BYTE BACK 4 / RLS AND LEAST-PRIVILEGE REVIEW ONLY
-- DO NOT EXECUTE without explicit user approval, after API owner filters are ready.
-- Only the public.vault_training_notes table is modified.
-- Existing service_role grants are intentionally left unchanged.
-- Postgres auth.uid() checks apply to authenticated direct Data API calls;
-- the Vercel service_role server API MUST independently enforce owner_id.

BEGIN;

ALTER TABLE public.vault_training_notes ENABLE ROW LEVEL SECURITY;

-- Abort rather than silently keeping an unrelated permissive policy.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vault_training_notes'
      AND policyname NOT IN (
        'vault_notes_select_own','vault_notes_insert_own',
        'vault_notes_update_own','vault_notes_delete_own')
  ) THEN
    RAISE EXCEPTION 'Unexpected existing notes policy; inspect it before applying Step 4';
  END IF;
END $check$;

REVOKE ALL ON TABLE public.vault_training_notes
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.vault_training_notes TO authenticated;

DROP POLICY IF EXISTS vault_notes_select_own ON public.vault_training_notes;
DROP POLICY IF EXISTS vault_notes_insert_own ON public.vault_training_notes;
DROP POLICY IF EXISTS vault_notes_update_own ON public.vault_training_notes;
DROP POLICY IF EXISTS vault_notes_delete_own ON public.vault_training_notes;

CREATE POLICY vault_notes_select_own
  ON public.vault_training_notes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY vault_notes_insert_own
  ON public.vault_training_notes
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY vault_notes_update_own
  ON public.vault_training_notes
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY vault_notes_delete_own
  ON public.vault_training_notes
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

DO $verify$
DECLARE
  priv text;
BEGIN
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF has_table_privilege('anon','public.vault_training_notes',priv) THEN
      RAISE EXCEPTION 'anon retains unexpected % privilege',priv;
    END IF;
    IF NOT has_table_privilege('authenticated','public.vault_training_notes',priv) THEN
      RAISE EXCEPTION 'authenticated is missing expected % privilege',priv;
    END IF;
    IF NOT has_table_privilege('service_role','public.vault_training_notes',priv) THEN
      RAISE EXCEPTION 'service_role lost % privilege',priv;
    END IF;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('authenticated','public.vault_training_notes',priv) THEN
      RAISE EXCEPTION 'authenticated has excess % privilege',priv;
    END IF;
  END LOOP;
END $verify$;

COMMIT;

-- Run supabase/step4_verify_permissions.sql before and after to inspect
-- actual roles, table grants, policies and preserved synthetic record count.
