import { handleNotes } from '../src/notes-api.mjs';

// This endpoint is the Vercel rewrite target for /api/notes/:id.
export default function handler(request, response) {
  return handleNotes(request, response, { itemId: request.query?.id ?? '' });
}
