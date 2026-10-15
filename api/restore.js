import {handleRestore} from '../src/restore-api.mjs';
// Signed judge-B requests only. GET previews, POST restores exactly one item.
export default function handler(request,response){
 return handleRestore(request,response);
}
