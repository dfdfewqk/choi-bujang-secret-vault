import {handleRestore} from '../src/restore-api.mjs';
import {observeApi} from '../src/api-observation.mjs';
export default function handler(req,res){return observeApi(req,res,{route:'restore',handler:handleRestore});}
