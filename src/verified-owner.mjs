// Translate a signature-verified judge identity to the same A/B owner records
// already used by the exercise. This runs only inside the server, never in
// the browser or SDP v1 decider. Ignore all body, header and query role claims.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function verifiedOwnerId(principal, db) {
  if (!principal || !UUID.test(principal.userId ?? '')) return null;
  // Normal Supabase sessions keep their existing subject-to-owner binding.
  if (principal.kind === 'student') return principal.userId;
  if (principal.kind !== 'judge' || !['a', 'b'].includes(principal.identity)
      || !V4.test(principal.runId ?? '')) return null;
  // The JWT signature, issuer, audience, expiry, a/b claim and run ID were
  // verified by createLoginVerifier *before* this function was invoked.
  if (typeof db?.auth?.admin?.listUsers !== 'function') return null;
  try {
    // Never guess which account A/B means on an unknown database.
    const {data, error}=await db.auth.admin.listUsers({page:1,perPage:3});
    const users=data?.users;
    if (error || !Array.isArray(users) || users.length!==2) return null;
    if (!users.every(user=>UUID.test(user?.id ?? '')
        && Number.isFinite(Date.parse(user?.created_at ?? ''))
        && Boolean(user?.email_confirmed_at)
        && Boolean(user?.last_sign_in_at))) return null;
    const sorted=[...users].sort((a,b)=>
      Date.parse(a.created_at)-Date.parse(b.created_at) || a.id.localeCompare(b.id));
    if (sorted[0].id===sorted[1].id) return null;
    return sorted[principal.identity==='a'?0:1].id;
  } catch {
    return null;
  }
}
