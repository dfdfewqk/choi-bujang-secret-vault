import {handleOperations} from '../src/operations-api.mjs';
import {observeApi} from '../src/api-observation.mjs';
export default function handler(req,res){return observeApi(req,res,{route:'operations',handler:handleOperations});}
