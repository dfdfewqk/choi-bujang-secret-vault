-- BYTE BACK 4: read-only permission and row ownership audit.
-- Can be run before and after user-approved policy migration.
-- No passwords, tokens, emails, or note contents are selected.

SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class AS c
WHERE c.oid = 'public.vault_training_notes'::regclass;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'vault_training_notes'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY grantee, privilege_type;

SELECT role_name, action, has_table_privilege(role_name,'public.vault_training_notes',action) AS granted
FROM (VALUES ('anon'),('authenticated'),('service_role')) AS roles(role_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
                    ('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS actions(action)
ORDER BY role_name, action;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'vault_training_notes'
ORDER BY policyname;

-- Determine A/B by signup order, without showing private user identifiers.
WITH users_by_signup AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS signup_position
  FROM auth.users
)
SELECT CASE WHEN u.signup_position=1 THEN 'A'
            WHEN u.signup_position=2 THEN 'B'
            WHEN n.owner_id IS NULL THEN 'UNASSIGNED'
            ELSE 'UNKNOWN' END AS owner,
       count(*)::integer AS note_count,
       count(*) FILTER(WHERE n.sort_order IN (1,2,3,4))::integer AS original_notes
FROM public.vault_training_notes n
LEFT JOIN users_by_signup u ON n.owner_id=u.id
GROUP BY 1
ORDER BY 1;

-- The A/B proof must show A=4 and B=1 after the approved ownership fix.
-- Before the fix, expect UNASSIGNED=4 and B=1.
-- No SQL statement here modifies data, authorization or schema.

-- IMPORTANT: GRANT alone does not prove row isolation.
-- Verify row-level behavior using real A/B sessions with authenticated JWTs
-- or an appropriate isolated trusted test harness. Never share session tokens.
