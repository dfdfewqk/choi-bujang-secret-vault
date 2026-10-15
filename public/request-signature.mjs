// Shared canonical encoding. Public code carries no credentials or key material.
export function canonical(value){
 if(value===undefined)return '';
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export function signedMessage({deviceId,method,path,bodyHash,tokenHash,at,nonce}){
 return JSON.stringify(['byteback.app.request.v1',deviceId,method,path,bodyHash,tokenHash,at,nonce]);
}
