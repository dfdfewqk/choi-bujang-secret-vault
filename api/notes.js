import {handleNotes} from '../src/notes-api.mjs';
import {observeApi} from '../src/api-observation.mjs';
export default function handler(req,res){return observeApi(req,res,{route:'notes.collection',handler:handleNotes});}
