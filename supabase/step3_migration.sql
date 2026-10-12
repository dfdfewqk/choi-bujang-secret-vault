-- BYTE BACK 3: preserve every existing synthetic note and numeric internal id.
-- This migration modifies only public.vault_training_notes, never diary tables.
ALTER TABLE public.vault_training_notes
  ADD COLUMN IF NOT EXISTS note_uuid uuid DEFAULT gen_random_uuid();
UPDATE public.vault_training_notes SET note_uuid = gen_random_uuid() WHERE note_uuid IS NULL;
ALTER TABLE public.vault_training_notes ALTER COLUMN note_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vault_training_notes_note_uuid_key
  ON public.vault_training_notes (note_uuid);
ALTER TABLE public.vault_training_notes ALTER COLUMN sort_order DROP NOT NULL;
ALTER TABLE public.vault_training_notes DROP CONSTRAINT IF EXISTS vault_training_notes_sort_order_check;
-- Legacy rows retain sort_order=1..4. New personal notes omit sort_order.
ALTER TABLE public.vault_training_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vault_training_notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.vault_training_notes_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_training_notes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vault_training_notes_id_seq TO service_role;
-- Intentionally no policy permits browser roles to read this table.
-- Real authentication is enforced in the Vercel API before using service_role.
