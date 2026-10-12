-- BYTE BACK 4 / REVIEW ONLY. Do NOT run until user approves data changes.
-- Edit ONLY A_EMAIL_HERE and B_EMAIL_HERE in your own Supabase SQL Editor.
-- Never paste emails, passwords, or session tokens into GitHub or chat.
-- Assumes there are exactly four unassigned demo notes and two confirmed Auth accounts.
-- Modifies only public.vault_training_notes (NOT diary tables).
-- Running the complete transaction again fails safely rather than reassigning notes.
BEGIN;

LOCK TABLE public.vault_training_notes IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  owner_a uuid;
  owner_b uuid;
  assigned integer;
BEGIN
  SELECT id INTO STRICT owner_a
  FROM auth.users
  WHERE lower(email) = lower('A_EMAIL_HERE')
    AND email_confirmed_at IS NOT NULL;

  SELECT id INTO STRICT owner_b
  FROM auth.users
  WHERE lower(email) = lower('B_EMAIL_HERE')
    AND email_confirmed_at IS NOT NULL;

  IF owner_a IS NULL OR owner_b IS NULL OR owner_a = owner_b THEN
    RAISE EXCEPTION 'Two different verified accounts A and B are required';
  END IF;

  IF (SELECT count(*) FROM public.vault_training_notes) <> 4
     OR (SELECT count(*) FROM public.vault_training_notes
         WHERE sort_order IN (1,2,3,4)
           AND owner_id IS NULL AND note_uuid IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'Unexpected data: four unassigned original notes were not found; no changes committed';
  END IF;

  UPDATE public.vault_training_notes
  SET owner_id = owner_a
  WHERE sort_order IN (1,2,3,4) AND owner_id IS NULL;
  GET DIAGNOSTICS assigned = ROW_COUNT;
  IF assigned <> 4 THEN
    RAISE EXCEPTION 'Original note assignment failed';
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

-- Read-only post-check: omit emails, UUIDs and note bodies from shared reports.
WITH owners AS (
  SELECT id,
  CASE WHEN lower(email)=lower('A_EMAIL_HERE') THEN 'A'
       WHEN lower(email)=lower('B_EMAIL_HERE') THEN 'B'
       ELSE 'OTHER' END AS account
  FROM auth.users
)
SELECT COALESCE(owners.account, 'UNASSIGNED') AS account,
       count(*)::integer AS note_count
FROM public.vault_training_notes AS notes
LEFT JOIN owners ON owners.id = notes.owner_id
GROUP BY owners.account
ORDER BY account;

-- If data needs reverting, do NOT run a broad DELETE.
-- First inspect the five notes and obtain user approval for a separate targeted rollback.
