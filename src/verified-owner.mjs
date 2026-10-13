import { createHmac } from 'node:crypto';

// Never turn a signed judge A/B alias into an existing student's account.
// A judge principal is a distinct TEST identity, scoped by the signed run ID.
// The unguessable internal owner UUID is stable for A within a run, different
// for B and for every other run, and does not identify a real Auth user.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function ownerForJudge(principal, secret) {
  if(principal?.kind!=='judge' || !V4.test(principal.userId ?? '')
    || !V4.test(principal.runId ?? '') || !['a','b'].includes(principal.identity)
    || typeof secret!=='string' || secret.length<12) return null;
  const bytes=createHmac('sha256',secret)
    .update('byteback.stage8.judge.owner.v1\0')
    .update(principal.runId.toLowerCase())
    .update('\0'+principal.identity)
    .digest().subarray(0,16);
  // UUID v4 string format, with RFC variant bits for DB uuid compatibility.
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=bytes.toString('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'
    +h.slice(16,20)+'-'+h.slice(20);
}

export async function verifiedOwnerId(principal, _db) {
  if (!principal || !UUID.test(principal.userId ?? '')) return null;
  // Supabase students retain their true, signature-verified auth.uid().
  if(principal.kind==='student')return principal.userId;
  // The verifier must first authenticate the judge JWT's ES256 signature,
  // issuer, audience, expiry, run ID and 'a'/'b' claims. Do not accept
  // client-supplied role/body/query data here.
  return ownerForJudge(principal,process.env.SUPABASE_SECRET_KEY);
}
