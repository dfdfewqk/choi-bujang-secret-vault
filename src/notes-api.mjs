import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let cachedVerifier;

function getVerifier() {
  if (!cachedVerifier) {
    cachedVerifier = createLoginVerifier({
      config,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    });
  }
  return cachedVerifier;
}
function getDatabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
function publicNote(note) {
  return { id: note.note_uuid, title: note.title, body: note.content };
}
function validateNote(data) {
  const title = data?.title, body = data?.body;
  if (typeof title !== 'string' || title.trim().length < 1 || title.length > 120
      || typeof body !== 'string' || body.trim().length < 1 || body.length > 5000) return null;
  return { title: title.trim(), content: body.trim() };
}
function header(req, name) {
  const h = req.headers ?? {};
  return h[name] ?? h[name.toLowerCase()];
}

export async function handleNotes(request, response, {
  itemId = null,
  verifyAuthorization = null,
  databaseFactory = getDatabase,
} = {}) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  const method = request.method?.toUpperCase();
  const item = itemId !== null;
  const allowed = item ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
  if (!allowed.includes(method)) {
    response.setHeader('Allow', allowed.join(', '));
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  // Do not touch the service-role database without valid server-side authentication.
  const authorization = header(request, 'authorization');
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return response.status(503).json({ error: 'SERVICE_NOT_CONFIGURED' });
  }
  let verified;
  try {
    verified = await (verifyAuthorization ?? getVerifier())(authorization);
  } catch {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }
  if (!verified?.userId || !UUID.test(verified.userId)) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }
  if (item && (typeof itemId !== 'string' || !UUID.test(itemId))) {
    return response.status(400).json({ error: 'INVALID_NOTE_ID' });
  }

  try {
    const db = databaseFactory();
    const table = db.from('vault_training_notes');
    if (!item && method === 'GET') {
      // Four unassigned legacy demo notes remain available only after login.
      // User-created notes are scoped to the authenticated user for listing.
      const { data, error } = await table.select('note_uuid,title,content')
        .or(`owner_id.eq.${verified.userId},owner_id.is.null`)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(100);
      if (error) throw error;
      return response.status(200).json({ notes: data.map(publicNote) });
    }
    if (!item && method === 'POST') {
      const data = validateNote(request.body);
      if (!data) return response.status(400).json({ error: 'INVALID_NOTE' });
      const given = request.body?.id;
      if (given !== undefined && (typeof given !== 'string' || !UUID.test(given))) {
        return response.status(400).json({ error: 'INVALID_NOTE_ID' });
      }
      const newId = given ?? randomUUID();
      const { error } = await table.insert({
        note_uuid: newId, title: data.title, content: data.content, owner_id: verified.userId,
      });
      if (error) throw error;
      return response.status(201).json({ id: newId });
    }

    // Intentionally no owner filter on single-item routes in Stage 3.
    // Stage 4 closes this IDOR hole. Only synthetic data may be used.
    if (method === 'GET') {
      const { data, error } = await table.select('note_uuid,title,content')
        .eq('note_uuid', itemId).maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(publicNote(data));
    }
    if (method === 'PUT') {
      const updated = validateNote(request.body);
      if (!updated) return response.status(400).json({ error: 'INVALID_NOTE' });
      const { data, error } = await table.update(updated).eq('note_uuid', itemId)
        .select('note_uuid,title,content').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(publicNote(data));
    }
    const { data, error } = await table.delete().eq('note_uuid', itemId).select('note_uuid');
    if (error) throw error;
    if (!data?.length) return response.status(404).json({ error: 'NOT_FOUND' });
    return response.status(200).json({ deleted: true, id: itemId });
  } catch {
    return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
