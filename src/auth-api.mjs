// BYTE BACK Stage 5 optional 10-point bonus: Auth takes place in the server.
// This key is a PUBLIC PUBLISHABLE key intentionally scoped to this backend
// source file. It is never shipped in public HTML, JS or static assets.
// Never replace it with a privileged database key or expose elevated credentials.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };

const PROJECT_URL = new URL(config.identityProvider.issuer).origin;
const SERVER_AUTH_PUBLIC_KEY = 'sb_publishable_rQOSzVLPSmRGAAGfnV5CVw_ZsyWj-4Z';
const JWT_MAX = 8192;
const REFRESH_MAX = 4096;
const MAX_EMAIL = 254;

function authFactory() {
  return createClient(PROJECT_URL, SERVER_AUTH_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
function isRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function field(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}
function cleanUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: typeof user.id === 'string' ? user.id : null,
    email: typeof user.email === 'string' ? user.email : null,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}
function cleanSession(session) {
  if (!session || !field(session.access_token, JWT_MAX)
      || !field(session.refresh_token, REFRESH_MAX)) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: cleanUser(session.user),
  };
}
function redirectUrl(request) {
  const origin = request.headers?.origin;
  const host = request.headers?.host;
  if (typeof origin === 'string' && typeof host === 'string') {
    try {
      const url = new URL(origin);
      if (url.protocol === 'https:' && url.host === host
          && /^choi-bujang-secret-vault[-a-z0-9]*\.vercel\.app$/u.test(host)) {
        return url.origin + '/';
      }
      if (url.protocol === 'http:' && /^localhost(?::\d+)?$/u.test(host)
          && url.host === host) return url.origin + '/';
    } catch { /* fall through to the stable registered application URL */ }
  }
  return new URL(config.publicAppUrl).origin + '/';
}
function statusFrom(error) {
  if (error?.status === 429) return 429;
  if (error?.status === 401) return 401;
  if (error?.status === 422) return 422;
  if (error?.status === 403) return 403;
  return 400;
}
function errorResult(error) {
  return {
    error: typeof error?.code === 'string' && /^[a-z_]{1,72}$/u.test(error.code)
      ? error.code : 'AUTH_FAILED',
    message: typeof error?.message === 'string' ? error.message.slice(0, 240)
      : '인증 요청을 처리하지 못했습니다.',
  };
}

/**
 * Auth proxy has no access to the notes database or service_role key.
 * The judge's direct Bearer-token note routes remain entirely unchanged.
 * Expose this handler ONLY at /api/auth (same-origin browser calls).
 */
export async function handleAuth(request, response, { createAuthClient = authFactory } = {}) {
  response.setHeader('Cache-Control', 'no-store, private');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  // Avoid accepting cross-origin credential submissions, even without cookies.
  const origin = request.headers?.origin;
  const host = request.headers?.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
      }
    } catch {
      return response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
    }
  }

  let body = request.body;
  if (typeof body === 'string') {
    if (body.length > 12500) return response.status(413).json({ error: 'BODY_TOO_LARGE' });
    try { body = JSON.parse(body); } catch { return response.status(400).json({ error: 'INVALID_BODY' }); }
  }
  if (!isRecord(body) || typeof body.action !== 'string') {
    return response.status(400).json({ error: 'INVALID_BODY' });
  }
  const allowed = ['login', 'signup', 'refresh', 'session', 'logout'];
  if (!allowed.includes(body.action)) {
    return response.status(400).json({ error: 'INVALID_ACTION' });
  }

  if (body.action === 'login' || body.action === 'signup') {
    if (!field(body.email, MAX_EMAIL) || !/^\S+@\S+\.\S+$/u.test(body.email)
        || !field(body.password, 128)
        || body.password.length < (body.action === 'signup' ? 8 : 6)) {
      return response.status(400).json({ error: 'INVALID_CREDENTIAL_FORMAT' });
    }
  }
  if (body.action === 'refresh' && !field(body.refresh_token, REFRESH_MAX)) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }
  if (body.action === 'session' && !field(body.access_token, JWT_MAX)) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }
  if (body.action === 'logout' && (!field(body.access_token, JWT_MAX)
      || !field(body.refresh_token, REFRESH_MAX))) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const auth = createAuthClient().auth;
    if (body.action === 'login') {
      const { data, error } = await auth.signInWithPassword({
        email: body.email.trim(), password: body.password,
      });
      if (error) return response.status(statusFrom(error)).json(errorResult(error));
      const session = cleanSession(data?.session);
      if (!session) return response.status(502).json({ error: 'NO_SESSION' });
      return response.status(200).json({ session });
    }
    if (body.action === 'signup') {
      const { data, error } = await auth.signUp({
        email: body.email.trim(), password: body.password,
        options: { emailRedirectTo: redirectUrl(request) },
      });
      if (error) return response.status(statusFrom(error)).json(errorResult(error));
      return response.status(200).json({
        accepted: true,
        session: cleanSession(data?.session),
        // Do not reveal if a pre-existing email belongs to someone else.
      });
    }
    if (body.action === 'refresh') {
      const { data, error } = await auth.refreshSession({
        refresh_token: body.refresh_token,
      });
      if (error) return response.status(statusFrom(error)).json(errorResult(error));
      const session = cleanSession(data?.session);
      if (!session) return response.status(401).json({ error: 'UNAUTHORIZED' });
      return response.status(200).json({ session });
    }
    if (body.action === 'session') {
      const { data, error } = await auth.getUser(body.access_token);
      if (error || !data?.user) return response.status(401).json({ error: 'UNAUTHORIZED' });
      return response.status(200).json({ user: cleanUser(data.user) });
    }
    // Revoke the browser's authenticated refresh session via the Auth server.
    const { error: setError } = await auth.setSession({
      access_token: body.access_token, refresh_token: body.refresh_token,
    });
    if (setError) return response.status(statusFrom(setError)).json(errorResult(setError));
    const { error } = await auth.signOut({ scope: 'global' });
    if (error) return response.status(statusFrom(error)).json(errorResult(error));
    return response.status(200).json({ signedOut: true });
  } catch {
    return response.status(502).json({ error: 'AUTH_SERVICE_UNAVAILABLE' });
  }
}
