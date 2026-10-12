-- BYTE BACK STEP 4: REVIEW ONLY. Apply ONLY after the owner authorizes changes.
-- No email addresses, access tokens, passwords or fixed private UUIDs are needed.
-- Precondition: EXACTLY TWO verified and successfully signed-in Supabase Auth users:
--  A = oldest signup (the original account), B = latest signup (the test account).
-- If the shared Auth project has additional users by execution time, ABORT, do not guess.
-- Only public.vault_training_notes is modified; the diary app is untouched.
-- Original 4 demo rows are preserved, assigned to A. Only 1 synthetic B row is added.
-- This is a one-time transaction and deliberately aborts if run again.
-- Existing id column is GENERATED ALWAYS AS IDENTITY; no sequence/default changes needed.

BEGIN;

LOCK TABLE public.vault_training_notes IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  owner_a uuid;
  owner_b uuid;
  total_users integer;
  verified_users integer;
  logged_in_users integer;
  assigned integer;
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER (WHERE email_confirmed_at IS NOT NULL)::integer,
         count(*) FILTER (WHERE email_confirmed_at IS NOT NULL
                             AND last_sign_in_at IS NOT NULL)::integer
    INTO total_users, verified_users, logged_in_users
    FROM auth.users;

  IF total_users <> 2 OR verified_users <> 2 OR logged_in_users <> 2 THEN
    RAISE EXCEPTION 'AB test requires exactly two verified, signed-in Auth users; got total %, verified %, signed-in %',
                    total_users, verified_users, logged_in_users;
  END IF;

  SELECT id INTO STRICT owner_a
    FROM auth.users ORDER BY created_at ASC, id ASC LIMIT 1;
  SELECT id INTO STRICT owner_b
    FROM auth.users ORDER BY created_at DESC, id DESC LIMIT 1;

  IF owner_a = owner_b THEN
    RAISE EXCEPTION 'A and B must be separate, verified users';
  END IF;

  IF (SELECT count(*) FROM public.vault_training_notes) <> 4
     OR (SELECT count(*) FROM public.vault_training_notes
         WHERE sort_order IN (1,2,3,4)
           AND owner_id IS NULL AND note_uuid IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'Expected exactly 4 original, unassigned notes; aborting without changes';
  END IF;

  UPDATE public.vault_training_notes
     SET owner_id = owner_a
   WHERE sort_order IN (1,2,3,4) AND owner_id IS NULL;
  GET DIAGNOSTICS assigned = ROW_COUNT;
  IF assigned <> 4 THEN
    RAISE EXCEPTION 'Original note assignment failed; rolling back';
  END IF;

  INSERT INTO public.vault_training_notes (owner_id, title, content)
  VALUES (owner_b, '4단계 B 시험 메모', 'B 소유 가상 메모 - 권한 검사 전용');

  IF (SELECT count(*) FROM public.vault_training_notes WHERE owner_id = owner_a) <> 4
     OR (SELECT count(*) FROM public.vault_training_notes WHERE owner_id = owner_b) <> 1
     OR (SELECT count(*) FROM public.vault_training_notes) <> 5
     OR EXISTS (SELECT 1 FROM public.vault_training_notes WHERE owner_id IS NULL) THEN
    RAISE EXCEPTION 'Post-assignment check failed; transaction rolled back';
  END IF;
END
$migration$;

COMMIT;

-- Read-only report: no account emails, UUIDs or memo contents.
WITH numbered_users AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS signup_order
  FROM auth.users
)
SELECT CASE WHEN numbered_users.signup_order = 1 THEN 'A'
            WHEN numbered_users.signup_order = 2 THEN 'B'
            ELSE 'OTHER/UNASSIGNED' END AS account,
       count(*)::integer AS note_count
FROM public.vault_training_notes notes
LEFT JOIN numbered_users ON numbered_users.id = notes.owner_id
GROUP BY numbered_users.signup_order
ORDER BY account;

-- Do not delete any rows to revert. A targeted rollback requires separate approval.
