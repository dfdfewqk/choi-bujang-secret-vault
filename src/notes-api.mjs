import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { noteResourceId } from './resource-zones.mjs';
import { verifiedOwnerId } from './verified-owner.mjs';

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
  // Query strings never select a different zone/action. The sole allowed
  // item query is the path UUID passed by the existing Vercel rewrite.
  const query=request.query;
  if(query&&(typeof query!=='object'||Object.keys(query).some(key=>
      !item||key!=='id'||query[key]!==itemId)))
    return response.status(400).json({error:'INVALID_RESOURCE_QUERY'});
  if(item&&!noteResourceId(itemId))
    return response.status(400).json({error:'INVALID_NOTE_ID'});

  try {
    const db = databaseFactory();
    // Do not map signed judge A/B aliases onto existing student owners.
    // Each signed runId + A/B is isolated by the server's owner binder.
    // Ordinary student JWTs keep their actual Supabase owner ID.
    const boundOwner = await verifiedOwnerId(verified, db);
    if (!boundOwner) {
      return response.status(403).json({ error: 'OWNER_BINDING_UNAVAILABLE' });
    }
    verified = { ...verified, userId: boundOwner };
    const table = db.from('vault_training_notes');
    if (!item && method === 'GET') {
      // Stage 4: never include unowned legacy notes or another user's rows.
      const { data, error } = await table.select('note_uuid,title,content')
        .eq('owner_id', verified.userId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(100);
      if (error) throw error;
      return response.status(200).json({ notes: data.map(publicNote) });
    }
    if (!item && method === 'POST') {
      const data = validateNote(request.body);
      if (!data) return response.status(400).json({ error: 'INVALID_NOTE' });
      // Both the owner and the externally addressable ID are server-assigned.
      // Reusing a victim's UUID must not create a second object with that ID.
      if (Object.hasOwn(request.body ?? {}, 'owner_id')) {
        return response.status(400).json({ error: 'OWNER_ID_NOT_ALLOWED' });
      }
      if (Object.hasOwn(request.body ?? {}, 'id')
          || Object.hasOwn(request.body ?? {}, 'note_uuid')) {
        return response.status(400).json({ error: 'CLIENT_NOTE_ID_NOT_ALLOWED' });
      }
      const newId = randomUUID();
      const { error } = await table.insert({
        note_uuid: newId, title: data.title, content: data.content, owner_id: verified.userId,
      });
      if (error) throw error;
      return response.status(201).json({ id: newId });
    }

    // Atomic DB predicates enforce ownership; service_role bypasses RLS.
    if (method === 'GET') {
      const { data, error } = await table.select('note_uuid,title,content')
        .eq('note_uuid', itemId).eq('owner_id', verified.userId).maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(publicNote(data));
    }
    if (method === 'PUT') {
      const updated = validateNote(request.body);
      if (!updated) return response.status(400).json({ error: 'INVALID_NOTE' });
      // Whitelist title/body; reject an attempted ownership transfer.
      if (Object.hasOwn(request.body ?? {}, 'owner_id')) {
        return response.status(400).json({ error: 'OWNER_ID_NOT_ALLOWED' });
      }
      // The path names the object. Body/query cannot choose a second one.
      if (Object.hasOwn(request.body ?? {}, 'id')
          || Object.hasOwn(request.body ?? {}, 'note_uuid')) {
        return response.status(400).json({ error: 'CLIENT_NOTE_ID_NOT_ALLOWED' });
      }
      const { data, error } = await table.update(updated).eq('note_uuid', itemId).eq('owner_id', verified.userId)
        .select('note_uuid,title,content').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(publicNote(data));
    }
    const { data, error } = await table.delete().eq('note_uuid', itemId).eq('owner_id', verified.userId).select('note_uuid');
    if (error) throw error;
    if (!data?.length) return response.status(404).json({ error: 'NOT_FOUND' });
    return response.status(200).json({ deleted: true, id: itemId });
  } catch {
    return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
