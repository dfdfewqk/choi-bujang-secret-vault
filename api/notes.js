import { createClient } from '@supabase/supabase-js';

// Stage 2 deliberately has no authentication yet. Only synthetic notes belong here.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return response.status(503).json({ error: 'NOTES_SERVICE_NOT_CONFIGURED' });
  }

  try {
    const supabase = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('vault_training_notes')
      .select('title, content')
      .order('sort_order', { ascending: true })
      .limit(4);
    if (error || !Array.isArray(data)) {
      return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
    }
    return response.status(200).json({ sampleMarker: 'SAMPLE_NOTE_1', notes: data });
  } catch {
    // Avoid sending database errors, URLs, keys, or stack traces to the client.
    return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
