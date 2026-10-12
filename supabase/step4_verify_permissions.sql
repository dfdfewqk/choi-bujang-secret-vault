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

SELECT (owner_id IS NULL) AS owner_unassigned,
       count(*)::integer AS notes_count
FROM public.vault_training_notes
GROUP BY (owner_id IS NULL)
ORDER BY owner_unassigned DESC;

-- IMPORTANT: GRANT alone does not prove row isolation.
-- Verify row-level behavior using real A/B sessions with authenticated JWTs
-- or an appropriate isolated trusted test harness. Never share session tokens.
