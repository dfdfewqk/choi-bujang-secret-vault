-- BYTE BACK STEP 4: REVIEW ONLY. Apply ONLY after explicit user approval.
-- CURRENT LIVE PREFLIGHT (2026-10-12): 2 verified/logged-in users, 5 total notes.
-- A = first created account; B = second created account.
-- Exactly 4 original notes (sort_order 1..4) have NULL owner_id.
-- B already owns exactly 1 note. Preserve its UUID, ID, title and content.
-- Only assign the original four rows to A. NO INSERT, DELETE, or schema changes.
-- Do not touch other Supabase project tables (including the diary application).
-- Never copy emails, passwords, tokens, real note bodies into scripts or reports.
-- Re-running after success must FAIL without changing data.

BEGIN;

LOCK TABLE public.vault_training_notes IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  owner_a uuid;
  owner_b uuid;
  total_users integer;
  verified_users integer;
  signed_in_users integer;
  assigned integer;
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER(WHERE email_confirmed_at IS NOT NULL)::integer,
         count(*) FILTER(WHERE email_confirmed_at IS NOT NULL
                          AND last_sign_in_at IS NOT NULL)::integer
    INTO total_users, verified_users, signed_in_users
    FROM auth.users;

  IF total_users <> 2 OR verified_users <> 2 OR signed_in_users <> 2 THEN
    RAISE EXCEPTION 'Expected exactly 2 confirmed and signed-in A/B accounts: got %, %, %',
      total_users, verified_users, signed_in_users;
  END IF;

  SELECT id INTO STRICT owner_a
  FROM auth.users ORDER BY created_at ASC, id ASC LIMIT 1;

  SELECT id INTO STRICT owner_b
  FROM auth.users ORDER BY created_at DESC, id DESC LIMIT 1;

  IF owner_a = owner_b THEN
    RAISE EXCEPTION 'A and B are not two distinct accounts';
  END IF;

  -- FAIL CLOSED if any memo was added, deleted, assigned or modified in an
  -- incompatible way while waiting for approval. The B memo is never touched.
  IF (SELECT count(*) FROM public.vault_training_notes) <> 5
     OR (SELECT count(*) FROM public.vault_training_notes
         WHERE owner_id IS NULL AND sort_order IN (1,2,3,4)
           AND note_uuid IS NOT NULL) <> 4
     OR (SELECT count(*) FROM public.vault_training_notes
         WHERE owner_id = owner_b AND sort_order IS NULL
           AND note_uuid IS NOT NULL) <> 1
     OR EXISTS (SELECT 1 FROM public.vault_training_notes
                WHERE owner_id = owner_a)
     OR EXISTS (SELECT 1 FROM public.vault_training_notes
                WHERE owner_id IS NOT NULL AND owner_id <> owner_b)
  THEN
    RAISE EXCEPTION 'Expected four unassigned originals and one existing B note; no changes applied';
  END IF;

  UPDATE public.vault_training_notes
     SET owner_id = owner_a
   WHERE owner_id IS NULL AND sort_order IN (1,2,3,4);
  GET DIAGNOSTICS assigned = ROW_COUNT;

  IF assigned <> 4
     OR (SELECT count(*) FROM public.vault_training_notes
         WHERE owner_id = owner_a) <> 4
     OR (SELECT count(*) FROM public.vault_training_notes
         WHERE owner_id = owner_b) <> 1
     OR (SELECT count(*) FROM public.vault_training_notes) <> 5
     OR EXISTS (SELECT 1 FROM public.vault_training_notes WHERE owner_id IS NULL)
  THEN
    RAISE EXCEPTION 'Ownership verification failed; all updates rolled back';
  END IF;
END
$migration$;

COMMIT;

-- Read-only output: A=4, B=1 expected. No emails, private UUIDs or note bodies.
WITH users_by_signup AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS account_number
  FROM auth.users
)
SELECT CASE u.account_number WHEN 1 THEN 'A' WHEN 2 THEN 'B'
       ELSE 'UNASSIGNED' END AS account,
       count(*)::integer AS note_count
FROM public.vault_training_notes n
LEFT JOIN users_by_signup u ON u.id = n.owner_id
GROUP BY u.account_number
ORDER BY account;

-- Rollback requires a separate, explicit, targeted plan and approval.
