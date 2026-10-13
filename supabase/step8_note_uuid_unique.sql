-- Stage 8 BOLA hardening. Existing rows are preserved.
-- Apply only after verifying COUNT(*) = COUNT(DISTINCT note_uuid).
-- A UNIQUE constraint on the public object ID prevents cross-owner collisions.
-- The prechecked data held 5 rows, 5 different note_uuid values.
ALTER TABLE public.vault_training_notes
  ADD CONSTRAINT vault_training_notes_note_uuid_unique UNIQUE (note_uuid);

-- Read-only verification after applying.
SELECT count(*) AS total_rows,
       count(DISTINCT note_uuid) AS unique_ids
FROM public.vault_training_notes;
SELECT conname, contype
FROM pg_constraint
WHERE conrelid='public.vault_training_notes'::regclass
  AND conname='vault_training_notes_note_uuid_unique';
