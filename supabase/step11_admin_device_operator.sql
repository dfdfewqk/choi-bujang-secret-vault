-- Owner-managed, additive operator approval for BYTE BACK app devices.
-- The admin account MUST be enrolled by the project owner; no default admin.
CREATE TABLE IF NOT EXISTS byteback_private.device_operators(
 principal_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS byteback_private.device_operator_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL, owner_id uuid NOT NULL,device_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('approve','reject')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE byteback_private.device_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE byteback_private.device_operator_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON byteback_private.device_operators,byteback_private.device_operator_audit FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.byteback_admin_pending_devices(p_actor uuid,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM byteback_private.device_operators WHERE principal_id=p_actor AND enabled)
 THEN RAISE EXCEPTION 'operator permission required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'bad limit' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'ownerId',owner_id,'deviceId',device_id,'status',state,'createdAt',created_at,'expiresAt',expires_at)
 ORDER BY created_at DESC),'[]'::jsonb)
 INTO result FROM(SELECT owner_id,device_id,state,created_at,expires_at FROM byteback_private.app_devices
 WHERE state='pending' AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT p_limit) pending;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.byteback_admin_decide_device(
 p_actor uuid,p_owner uuid,p_device text,p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_state text;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM byteback_private.device_operators WHERE principal_id=p_actor AND enabled)
 THEN RAISE EXCEPTION 'operator permission required' USING ERRCODE='42501'; END IF;
 IF p_owner IS NULL OR p_device !~ '^[a-f0-9]{16}$' OR p_approve IS NULL
 THEN RAISE EXCEPTION 'invalid target' USING ERRCODE='22023'; END IF;
 SELECT state INTO current_state FROM byteback_private.app_devices
 WHERE owner_id=p_owner AND device_id=p_device AND expires_at>clock_timestamp() FOR UPDATE;
 IF current_state IS DISTINCT FROM 'pending'
 THEN RAISE EXCEPTION 'request not pending' USING ERRCODE='P0002'; END IF;
 IF NOT byteback_private.review_app_device(p_owner,p_device,p_approve)
 THEN RAISE EXCEPTION 'request not pending' USING ERRCODE='P0002'; END IF;
 INSERT INTO byteback_private.device_operator_audit(actor_id,owner_id,device_id,action)
 VALUES(p_actor,p_owner,p_device,CASE WHEN p_approve THEN 'approve' ELSE 'reject' END);
 RETURN jsonb_build_object('deviceId',p_device,'status',CASE WHEN p_approve THEN 'approved' ELSE 'revoked' END);
END $$;
REVOKE ALL ON FUNCTION public.byteback_admin_pending_devices(uuid,integer),
 public.byteback_admin_decide_device(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.byteback_admin_pending_devices(uuid,integer),
 public.byteback_admin_decide_device(uuid,uuid,text,boolean) TO service_role;
-- Bootstrap only after the owner verifies the independent operator identity:
-- INSERT INTO byteback_private.device_operators(principal_id) VALUES ('<verified admin auth.users.id>');
