import { handleNotes } from '../src/notes-api.mjs';

export default function handler(request, response) {
  return handleNotes(request, response);
}
