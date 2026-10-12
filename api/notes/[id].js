import { handleNotes } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  const id = request.query?.id;
  return handleNotes(request, response, { itemId: id ?? '' });
}
