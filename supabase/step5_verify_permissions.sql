-- BYTE BACK STEP 5 / READ-ONLY PERMISSIONS AUDIT
-- Run BEFORE and AFTER the reviewed REVOKE. No secrets or memo bodies.
-- Expected BEFORE: anon CRUD false; authenticated CRUD true; service_role true.
-- Expected AFTER:  anon + authenticated ALL table privileges false; service_role CRUD true.
-- Both before and after: RLS enabled, four existing owner policies remain.
-- Never run this audit as a student in the browser; use Supabase SQL editor.

SELECT role_name, privilege_name,
       has_table_privilege(role_name,'public.vault_training_notes',privilege_name)
         AS has_direct_table_privilege
FROM (VALUES ('anon'),('authenticated'),('service_role')) AS roles(role_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
                   ('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS actions(privilege_name)
ORDER BY role_name, privilege_name;

SELECT c.relrowsecurity AS rls_enabled,
       (SELECT COUNT(*)::int FROM pg_policies
        WHERE schemaname='public' AND tablename='vault_training_notes') AS policies
FROM pg_class AS c
WHERE c.oid='public.vault_training_notes'::regclass;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='vault_training_notes'
  AND grantee IN ('PUBLIC','anon','authenticated','service_role')
ORDER BY grantee,privilege_type;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at,id) AS account
  FROM auth.users
)
SELECT CASE WHEN u.account=1 THEN 'A'
            WHEN u.account=2 THEN 'B'
            ELSE 'UNASSIGNED/OTHER' END AS owner,
       COUNT(*)::int AS note_count
FROM public.vault_training_notes n
LEFT JOIN ordered u ON n.owner_id=u.id
GROUP BY 1 ORDER BY owner;

-- Manual AFTER check in preview/production:
-- A GET/POST/PUT/DELETE via browser => own notes operate as before.
-- B's ID read from A => HTTP 404; unsigned requests => HTTP 401.
-- Original https://<project>.supabase.co/rest/v1/vault_training_notes
-- with anon or authenticated public Data API credentials => 401/403 permission denied.
-- HTTP 401 without an apikey is NOT sufficient proof; use the official judge
-- or your own direct-data test with a public key and a synthetic user session.
