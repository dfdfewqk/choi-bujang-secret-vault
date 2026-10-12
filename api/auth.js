import { handleAuth } from '../src/auth-api.mjs';

// All browser Supabase Auth requests use this same-origin server function.
export default function handler(request, response) {
  return handleAuth(request, response);
}
