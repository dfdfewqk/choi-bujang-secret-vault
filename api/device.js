import {handleDevice} from '../src/device-api.mjs';
import {observeApi} from '../src/api-observation.mjs';
export default function handler(req,res){return observeApi(req,res,{route:'device',handler:handleDevice});}
