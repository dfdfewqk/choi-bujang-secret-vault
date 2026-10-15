-- Stage 10: immutable-at-ingest backup for FUTURE notes only. No existing rows copied.
-- The owner's authenticated REST API remains unchanged. Neither audit history
-- nor other notes are rewritten. Do not "backfill" unverified pre-incident data.
CREATE SCHEMA IF NOT EXISTS byteback_private;
REVOKE ALL ON SCHEMA byteback_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS byteback_private.note_origins (
  note_uuid uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  original_sha256 text NOT NULL CHECK (original_sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS byteback_private.restore_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  note_uuid uuid NOT NULL,
  owner_id uuid NOT NULL,
  original_sha256 text NOT NULL,
  previous_sha256 text,
  was_deleted boolean NOT NULL,
  outcome text NOT NULL CHECK (outcome='restored')
);
REVOKE ALL ON byteback_private.note_origins,byteback_private.restore_audit
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION byteback_private.note_hash(
  p_id uuid,p_owner uuid,p_title text,p_content text
) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog
AS $hash$
 SELECT pg_catalog.encode(
   extensions.digest(
     pg_catalog.convert_to(
       pg_catalog.jsonb_build_array(p_id,p_owner,p_title,p_content)::text,'UTF8'
     ),'sha256'
   ),'hex'
 );
$hash$;
REVOKE ALL ON FUNCTION byteback_private.note_hash(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION byteback_private.capture_new_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $fn$
BEGIN
  -- First insertion is the only accepted reference; later changes cannot
  -- overwrite the original, including the restore insert after a deletion.
  INSERT INTO byteback_private.note_origins(
    note_uuid,owner_id,title,content,original_sha256
  ) VALUES(
    NEW.note_uuid,NEW.owner_id,NEW.title,NEW.content,
    byteback_private.note_hash(NEW.note_uuid,NEW.owner_id,NEW.title,NEW.content)
  ) ON CONFLICT (note_uuid) DO NOTHING;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION byteback_private.capture_new_note()
  FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS byteback_stage10_capture_note ON public.vault_training_notes;
CREATE TRIGGER byteback_stage10_capture_note
AFTER INSERT ON public.vault_training_notes
FOR EACH ROW EXECUTE FUNCTION byteback_private.capture_new_note();

-- Narrow, server-only RPC. Service token is never passed by the browser.
-- A verified bearer subject is bound to p_owner on the server.
CREATE OR REPLACE FUNCTION public.byteback_preview_note_restore(
  p_owner uuid,p_note uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $fn$
DECLARE
  snap byteback_private.note_origins%ROWTYPE;
  now_note public.vault_training_notes%ROWTYPE;
  matching_count integer;
  now_sha text;
BEGIN
  IF p_owner IS NULL THEN RETURN '{"status":"unavailable"}'::jsonb; END IF;
  IF p_note IS NULL THEN
    SELECT COUNT(*) INTO matching_count FROM (
      SELECT 1 FROM byteback_private.note_origins WHERE owner_id=p_owner LIMIT 2
    ) s;
    IF matching_count<>1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'status',CASE WHEN matching_count=0 THEN 'missing' ELSE 'ambiguous' END
      );
    END IF;
    SELECT * INTO snap FROM byteback_private.note_origins
      WHERE owner_id=p_owner LIMIT 1;
  ELSE
    SELECT * INTO snap FROM byteback_private.note_origins
      WHERE note_uuid=p_note AND owner_id=p_owner;
  END IF;
  IF NOT FOUND THEN RETURN '{"status":"missing"}'::jsonb; END IF;
  IF byteback_private.note_hash(snap.note_uuid,snap.owner_id,snap.title,snap.content)
     <> snap.original_sha256 THEN RETURN '{"status":"invalid_backup"}'::jsonb; END IF;
  SELECT * INTO now_note FROM public.vault_training_notes WHERE note_uuid=snap.note_uuid;
  IF FOUND THEN
    IF now_note.owner_id IS DISTINCT FROM snap.owner_id THEN
      RETURN '{"status":"owner_conflict"}'::jsonb;
    END IF;
    now_sha:=byteback_private.note_hash(
      now_note.note_uuid,now_note.owner_id,now_note.title,now_note.content);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'status','ready','id',snap.note_uuid,'hash',snap.original_sha256,
    'capturedAt',snap.captured_at,'deleted',now_note.note_uuid IS NULL,
    'changed',now_sha IS DISTINCT FROM snap.original_sha256
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.byteback_preview_note_restore(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.byteback_preview_note_restore(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.byteback_restore_one_note(
  p_owner uuid,p_note uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $fn$
DECLARE
  snap byteback_private.note_origins%ROWTYPE;
  existing public.vault_training_notes%ROWTYPE;
  restored public.vault_training_notes%ROWTYPE;
  matching_count integer;
  old_sha text;
  was_deleted boolean;
BEGIN
  IF p_owner IS NULL THEN RETURN '{"status":"unavailable"}'::jsonb; END IF;
  -- Serialize same-owner restores even if the live note was deleted.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner::text||'/'||COALESCE(p_note::text,'single'),0)
  );
  IF p_note IS NULL THEN
    SELECT COUNT(*) INTO matching_count FROM (
      SELECT 1 FROM byteback_private.note_origins WHERE owner_id=p_owner LIMIT 2
    ) s;
    IF matching_count<>1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'status',CASE WHEN matching_count=0 THEN 'missing' ELSE 'ambiguous' END);
    END IF;
    SELECT * INTO snap FROM byteback_private.note_origins
      WHERE owner_id=p_owner LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO snap FROM byteback_private.note_origins
      WHERE note_uuid=p_note AND owner_id=p_owner FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN '{"status":"missing"}'::jsonb; END IF;
  IF byteback_private.note_hash(snap.note_uuid,snap.owner_id,snap.title,snap.content)
     <> snap.original_sha256 THEN RETURN '{"status":"invalid_backup"}'::jsonb; END IF;
  SELECT * INTO existing FROM public.vault_training_notes
    WHERE note_uuid=snap.note_uuid FOR UPDATE;
  was_deleted:=NOT FOUND;
  IF NOT was_deleted THEN
    IF existing.owner_id IS DISTINCT FROM snap.owner_id THEN
      RETURN '{"status":"owner_conflict"}'::jsonb;
    END IF;
    old_sha:=byteback_private.note_hash(
      existing.note_uuid,existing.owner_id,existing.title,existing.content);
  END IF;
  -- Do not change owner_id, sort_order, unrelated rows, or audit history.
  IF was_deleted THEN
    INSERT INTO public.vault_training_notes(note_uuid,owner_id,title,content)
      VALUES(snap.note_uuid,snap.owner_id,snap.title,snap.content)
      ON CONFLICT (note_uuid) DO NOTHING
      RETURNING * INTO restored;
  ELSE
    UPDATE public.vault_training_notes SET title=snap.title,content=snap.content
      WHERE note_uuid=snap.note_uuid AND owner_id=snap.owner_id
      RETURNING * INTO restored;
  END IF;
  IF restored.note_uuid IS NULL THEN
    RETURN '{"status":"owner_conflict"}'::jsonb;
  END IF;
  IF byteback_private.note_hash(
      restored.note_uuid,restored.owner_id,restored.title,restored.content
    )<>snap.original_sha256 THEN
    RAISE EXCEPTION 'verified note restore hash mismatch';
  END IF;
  INSERT INTO byteback_private.restore_audit(
    note_uuid,owner_id,original_sha256,previous_sha256,was_deleted,outcome
  ) VALUES(snap.note_uuid,snap.owner_id,snap.original_sha256,old_sha,was_deleted,'restored');
  RETURN pg_catalog.jsonb_build_object(
    'status','restored','id',snap.note_uuid,'hash',snap.original_sha256,
    'ownerVerified',true,'wasDeleted',was_deleted
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.byteback_restore_one_note(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.byteback_restore_one_note(uuid,uuid)
  TO service_role;
