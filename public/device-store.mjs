// Browser-side trusted-device persistence. The private key is a non-exportable
// WebCrypto CryptoKey cloned by IndexedDB, never plaintext, JWK or localStorage.
// JWTs and passwords are deliberately not persisted here.
const DB_NAME='byteback-device-keys-v1';
const STORE='devices';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function openDb(){
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB)return reject(Error('기기 보안 저장소를 사용할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.'));
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'ownerId'});};
  request.onerror=()=>reject(Error('기기 보안 저장소를 열지 못했습니다.'));
  request.onblocked=()=>reject(Error('기기 저장소가 다른 창에서 사용 중입니다.'));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function transaction(ownerId,mode,operation){
 if(!UUID.test(ownerId??''))throw Error('검증되지 않은 계정 ID입니다.');
 const db=await openDb();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE),request=operation(store,ownerId);
   let result;
   request.onsuccess=()=>{result=request.result;};
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(Error('기기 보안 저장소 작업에 실패했습니다.'));
   tx.onabort=()=>reject(Error('기기 보안 저장소 작업이 취소됐습니다.'));
  });
 }finally{db.close();}
}
export function loadTrustedDevice(ownerId){return transaction(ownerId,'readonly',(store,id)=>store.get(id));}
export function saveTrustedDevice(ownerId,record){
 if(record?.ownerId!==ownerId||record.privateKey?.extractable!==false||record.privateKey?.type!=='private'
  ||record.privateKey?.algorithm?.name!=='ECDSA'||record.privateKey?.algorithm?.namedCurve!=='P-256'
  ||record.publicKey?.type!=='public'||!/^[a-f0-9]{16}$/.test(record.deviceId??'')){
  throw Error('올바르지 않은 기기 인증키입니다.');
 }
 return transaction(ownerId,'readwrite',store=>store.put(record));
}
export function forgetTrustedDevice(ownerId){return transaction(ownerId,'readwrite',(store,id)=>store.delete(id));}
