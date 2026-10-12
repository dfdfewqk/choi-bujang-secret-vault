// Same-origin Auth client facade. NO Supabase URL or publishable key in any
// browser-served file: all sign-in, sign-up, refresh and verification use /api/auth.
// Keeps the existing A/B notes JWT contract intact and supports existing sessions.
const STORAGE_KEY = 'byteback-server-auth-v1';
// One-time migration of sessions created by the old browser Supabase SDK.
const LEGACY_KEY = 'sb-bcwzllejypavwgsfqfbm-auth-token';
const listeners = new Set();
let cached = null;
let verifiedToken = null;
let inFlight = null;

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); }
  catch { return null; }
}
function storedSession() {
  if (cached) return cached;
  let session = readStorage(STORAGE_KEY);
  if (!session?.access_token) {
    const old = readStorage(LEGACY_KEY);
    if (old?.access_token && old?.refresh_token) session = old;
  }
  if (session?.access_token && session?.refresh_token) {
    cached = session;
    return session;
  }
  return null;
}
function storeSession(session) {
  cached = session;
  verifiedToken = null;
  try {
    if (session?.access_token) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* blocked storage only affects session persistence */ }
}
function emit(event, session) {
  for (const listener of listeners) {
    try { listener(event, session); } catch { /* listener errors are not Auth errors */ }
  }
}
function invalidAuth() {
  return { message: '로그인 상태를 확인할 수 없습니다.', code: 'UNAUTHORIZED', status: 401 };
}
async function callAuth(action, payload = {}) {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('인증 서버가 JSON 응답을 보내지 않았습니다.'); }
  if (!response.ok) {
    return { data: null, error: {
      message: typeof data.message === 'string' ? data.message : '인증 요청 실패',
      code: typeof data.error === 'string' ? data.error : 'AUTH_FAILED',
      status: response.status,
    } };
  }
  return { data, error: null };
}
function pullEmailConfirmation() {
  // Supabase sends email-confirmation credentials in the fragment in the
  // implicit Auth flow. Verify them through the trusted server before use.
  const fragment = window.location.hash;
  if (!fragment || !/access_token=|refresh_token=/u.test(fragment)) return null;
  const values = new URLSearchParams(fragment.slice(1));
  const access_token = values.get('access_token');
  const refresh_token = values.get('refresh_token');
  // Remove bearer tokens from browser history immediately.
  history.replaceState(history.state, '', location.pathname + location.search);
  if (!access_token || !refresh_token || access_token.length > 8192
      || refresh_token.length > 4096) return null;
  const expires_in = Number(values.get('expires_in') ?? 3600);
  const expires_at = Math.floor(Date.now() / 1000)
    + (Number.isFinite(expires_in) && expires_in > 0 && expires_in <= 7200
      ? expires_in : 3600);
  return { access_token, refresh_token, expires_at, user: null };
}
async function refresh(session) {
  const { data, error } = await callAuth('refresh', {
    refresh_token: session.refresh_token,
  });
  if (error || !data?.session) {
    storeSession(null);
    emit('SIGNED_OUT', null);
    return { session: null, error: error ?? invalidAuth() };
  }
  storeSession(data.session);
  verifiedToken = data.session.access_token;
  emit('TOKEN_REFRESHED', data.session);
  return { session: data.session, error: null };
}
async function loadSession() {
  const fromLink = pullEmailConfirmation();
  if (fromLink) storeSession(fromLink);
  let current = storedSession();
  if (!current) return { session: null, error: null };
  // Existing JWTs remain valid; refresh expired tokens through the server.
  if (!Number.isFinite(current.expires_at)
      || current.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    return refresh(current);
  }
  if (verifiedToken !== current.access_token) {
    try {
      const { data, error } = await callAuth('session', {
        access_token: current.access_token,
      });
      if (error || !data?.user) {
        storeSession(null);
        emit('SIGNED_OUT', null);
        return { session: null, error: error ?? invalidAuth() };
      }
      current = { ...current, user: data.user };
      cached = current;
      verifiedToken = current.access_token;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* ignore */ }
      if (fromLink) emit('SIGNED_IN', current);
    } catch (error) {
      return { session: null, error: { message: error.message, status: 502 } };
    }
  }
  return { session: current, error: null };
}

export function createServerAuthClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }) {
        try {
          const result = await callAuth('login', { email, password });
          if (result.error) return { data: { session: null }, error: result.error };
          const session = result.data?.session;
          if (!session) return { data: { session: null }, error: invalidAuth() };
          storeSession(session);
          verifiedToken = session.access_token;
          emit('SIGNED_IN', session);
          return { data: { session, user: session.user }, error: null };
        } catch (error) {
          return { data: { session: null }, error: { message: error.message, status: 502 } };
        }
      },
      async signUp({ email, password }) {
        try {
          const result = await callAuth('signup', { email, password });
          if (result.error) return { data: { user: null, session: null }, error: result.error };
          // Auth's confirmed-user status is never inferred from "accepted".
          return { data: { user: null, session: result.data?.session ?? null }, error: null };
        } catch (error) {
          return { data: { user: null, session: null }, error: { message: error.message, status: 502 } };
        }
      },
      async getSession() {
        if (!inFlight) {
          inFlight = loadSession().finally(() => { inFlight = null; });
        }
        try {
          const { session, error } = await inFlight;
          return { data: { session }, error };
        } catch (error) {
          return { data: { session: null }, error: { message: error.message, status: 502 } };
        }
      },
      async signOut() {
        const current = storedSession();
        if (current) {
          try {
            const result = await callAuth('logout', {
              access_token: current.access_token,
              refresh_token: current.refresh_token,
            });
            if (result.error && result.error.status !== 401) return { error: result.error };
          } catch {
            // The browser must still discard the locally saved JWT on logout.
          }
        }
        storeSession(null);
        emit('SIGNED_OUT', null);
        return { error: null };
      },
      onAuthStateChange(callback) {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
    },
  };
}

// Periodic server-only refresh, not a request to Supabase from the browser.
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (storedSession()) void createServerAuthClient().auth.getSession();
  }, 60_000);
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY) {
      cached = null; verifiedToken = null;
      void createServerAuthClient().auth.getSession().then(({ data }) => {
        emit(data.session ? 'SIGNED_IN' : 'SIGNED_OUT', data.session);
      });
    }
  });
}
