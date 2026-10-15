-- Stage 12: append-only redacted API observations and an account-scoped snapshot.
CREATE TABLE byteback_private.api_observations (
 request_id uuid PRIMARY KEY,checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 owner_id uuid,method text NOT NULL CHECK(method IN ('GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS','OTHER')),
 route text NOT NULL CHECK(route IN ('notes.collection','notes.item','restore','device','operations')),
 actual_status integer NOT NULL CHECK(actual_status BETWEEN 100 AND 599),
 error_code text CHECK(error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
 deployment_commit text CHECK(deployment_commit ~ '^[a-f0-9]{40}$')
);
ALTER TABLE byteback_private.api_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON byteback_private.api_observations FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX api_observations_owner_time ON byteback_private.api_observations(owner_id,checked_at DESC);
CREATE FUNCTION public.byteback_record_api_observation(p_request uuid,p_owner uuid,p_method text,p_route text,p_status integer,p_error text,p_commit text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t timestamptz;
BEGIN
 INSERT INTO byteback_private.api_observations(request_id,owner_id,method,route,actual_status,error_code,deployment_commit)
 VALUES(p_request,p_owner,p_method,p_route,p_status,p_error,p_commit) RETURNING checked_at INTO t;
 RETURN jsonb_build_object('checkedAt',t);
END; $$;
CREATE FUNCTION public.byteback_operations_snapshot(p_owner uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'measuredAt',clock_timestamp(),
  'totalObservations',(SELECT count(*) FROM byteback_private.api_observations WHERE owner_id=p_owner OR owner_id IS NULL),
  'observations',COALESCE((SELECT jsonb_agg(row_data ORDER BY checked_at DESC) FROM (
   SELECT checked_at,jsonb_build_object('requestId',request_id,'checkedAt',checked_at,'method',method,'route',route,
    'actualStatus',actual_status,'errorCode',error_code,'commit',deployment_commit,
    'scope',CASE WHEN owner_id IS NULL THEN 'anonymous' ELSE 'account' END) AS row_data
   FROM byteback_private.api_observations WHERE (owner_id=p_owner OR owner_id IS NULL) AND p_owner IS NOT NULL
   ORDER BY checked_at DESC LIMIT 100
  ) recent),'[]'::jsonb),
  'recentReads',COALESCE((SELECT jsonb_agg(jsonb_build_object('at',checked_at,'method','GET') ORDER BY checked_at) FROM (
    SELECT checked_at FROM byteback_private.api_observations WHERE owner_id=p_owner AND method='GET'
      AND route IN ('notes.collection','notes.item') AND checked_at>=clock_timestamp()-interval '10 minutes'
    ORDER BY checked_at DESC LIMIT 2000
  ) reads),'[]'::jsonb),
  'deviceState',jsonb_build_object(
    'pending',(SELECT count(*) FROM byteback_private.app_devices WHERE owner_id=p_owner AND state='pending' AND expires_at>clock_timestamp()),
    'approved',(SELECT count(*) FROM byteback_private.app_devices WHERE owner_id=p_owner AND state='approved' AND expires_at>clock_timestamp()),
    'revoked',(SELECT count(*) FROM byteback_private.app_devices WHERE owner_id=p_owner AND state='revoked'),
    'expired',(SELECT count(*) FROM byteback_private.app_devices WHERE owner_id=p_owner AND state<>'revoked' AND expires_at<=clock_timestamp())
  ),
  'restoreCount',(SELECT count(*) FROM byteback_private.restore_audit WHERE owner_id=p_owner),
  'latestRestoreAt',(SELECT occurred_at FROM byteback_private.restore_audit WHERE owner_id=p_owner ORDER BY audit_id DESC LIMIT 1),
  'latestRestoreHash',(SELECT original_sha256 FROM byteback_private.restore_audit WHERE owner_id=p_owner ORDER BY audit_id DESC LIMIT 1)
 );
$$;
REVOKE ALL ON FUNCTION public.byteback_record_api_observation(uuid,uuid,text,text,integer,text,text),public.byteback_operations_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.byteback_record_api_observation(uuid,uuid,text,text,integer,text,text),public.byteback_operations_snapshot(uuid) TO service_role;
