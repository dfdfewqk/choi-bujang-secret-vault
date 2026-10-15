-- Additive Stage 11 schema. Existing notes, origins and audit tables unchanged.
CREATE TABLE byteback_private.app_devices (
 owner_id uuid NOT NULL, device_id text NOT NULL CHECK(device_id ~ '^[a-f0-9]{16}$'),
 public_key jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','revoked')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '8 hours',
 PRIMARY KEY(owner_id,device_id)
);
CREATE TABLE byteback_private.app_nonces (
 owner_id uuid NOT NULL,device_id text NOT NULL,nonce uuid NOT NULL,at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,device_id,nonce),
 FOREIGN KEY(owner_id,device_id) REFERENCES byteback_private.app_devices(owner_id,device_id)
);
CREATE TABLE byteback_private.device_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,at timestamptz NOT NULL DEFAULT clock_timestamp(),
 owner_id uuid NOT NULL,device_id text NOT NULL,action text NOT NULL CHECK(action IN ('requested','trial_approved','approved','revoked'))
);
ALTER TABLE byteback_private.app_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE byteback_private.app_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE byteback_private.device_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON byteback_private.app_devices,byteback_private.app_nonces,byteback_private.device_audit FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.byteback_register_app_device(p_owner uuid,p_device text,p_key jsonb,p_trial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d byteback_private.app_devices%ROWTYPE;
BEGIN
 IF p_owner IS NULL OR p_device !~ '^[a-f0-9]{16}$' OR p_key->>'kty' IS DISTINCT FROM 'EC'
 OR p_key->>'crv' IS DISTINCT FROM 'P-256' OR p_key ? 'd' THEN RAISE EXCEPTION 'invalid device'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,11));
 SELECT * INTO d FROM byteback_private.app_devices WHERE owner_id=p_owner AND device_id=p_device;
 IF FOUND THEN
  IF d.public_key IS DISTINCT FROM p_key THEN RAISE EXCEPTION 'device collision'; END IF;
 ELSE
  IF (SELECT count(*) FROM byteback_private.app_devices WHERE owner_id=p_owner AND expires_at>clock_timestamp())>=8 THEN
   RAISE EXCEPTION 'device limit'; END IF;
  INSERT INTO byteback_private.app_devices(owner_id,device_id,public_key,state)
   VALUES(p_owner,p_device,p_key,CASE WHEN p_trial THEN 'approved' ELSE 'pending' END) RETURNING * INTO d;
  INSERT INTO byteback_private.device_audit(owner_id,device_id,action)
   VALUES(p_owner,p_device,CASE WHEN p_trial THEN 'trial_approved' ELSE 'requested' END);
 END IF;
 RETURN jsonb_build_object('deviceId',d.device_id,'status',CASE WHEN d.expires_at<=clock_timestamp() THEN 'expired' ELSE d.state END,'expiresAt',d.expires_at);
END; $$;
CREATE FUNCTION public.byteback_device_status(p_owner uuid,p_device text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE((SELECT jsonb_build_object('deviceId',device_id,'status',CASE WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE state END,
 'publicKey',public_key,'expiresAt',expires_at) FROM byteback_private.app_devices WHERE owner_id=p_owner AND device_id=p_device),'{"status":"unknown"}'::jsonb);
$$;
CREATE FUNCTION public.byteback_consume_app_nonce(p_owner uuid,p_device text,p_nonce uuid,p_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer;
BEGIN
 IF p_nonce IS NULL OR p_at IS NULL OR abs(extract(epoch FROM clock_timestamp()-p_at))>30 THEN RETURN false; END IF;
 PERFORM 1 FROM byteback_private.app_devices WHERE owner_id=p_owner AND device_id=p_device AND state='approved' AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM byteback_private.app_nonces WHERE owner_id=p_owner AND device_id=p_device AND at<clock_timestamp()-interval '2 minutes';
 INSERT INTO byteback_private.app_nonces(owner_id,device_id,nonce,at) VALUES(p_owner,p_device,p_nonce,p_at) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END; $$;
-- Operator-only, NOT callable by the application service or student credentials.
CREATE FUNCTION byteback_private.review_app_device(p_owner uuid,p_device text,p_approve boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE byteback_private.app_devices SET state=CASE WHEN p_approve THEN 'approved' ELSE 'revoked' END
 WHERE owner_id=p_owner AND device_id=p_device AND expires_at>clock_timestamp() AND (NOT p_approve OR state='pending');
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO byteback_private.device_audit(owner_id,device_id,action) VALUES(p_owner,p_device,CASE WHEN p_approve THEN 'approved' ELSE 'revoked' END);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION byteback_private.review_app_device(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.byteback_register_app_device(uuid,text,jsonb,boolean),public.byteback_device_status(uuid,text),public.byteback_consume_app_nonce(uuid,text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.byteback_register_app_device(uuid,text,jsonb,boolean),public.byteback_device_status(uuid,text),public.byteback_consume_app_nonce(uuid,text,uuid,timestamptz) TO service_role;
