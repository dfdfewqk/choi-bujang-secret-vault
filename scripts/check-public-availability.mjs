// Production-only diagnostic. This module is NEVER imported by npm run bundle.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from 'node:tls';
const {publicAppUrl}=JSON.parse(readFileSync(resolve(import.meta.dirname,'../aleph.config.json'),'utf8'));
const url=new URL(publicAppUrl);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')
 throw Error('Must monitor a public HTTPS origin');
const expiry=await new Promise((done,reject)=>{
 const sock=connect({host:url.hostname,port:443,servername:url.hostname,rejectUnauthorized:true,timeout:12000},()=>{
  try {
   if(!sock.authorized)throw Error('TLS chain not authorized');
   const end=Date.parse(sock.getPeerCertificate()?.valid_to??'');
   if(!Number.isFinite(end)||end-Date.now()<7*86400000)throw Error('TLS certificate expires in under 7 days');
   done(new Date(end).toISOString());
  }catch(error){reject(error);}
  finally{sock.end();}
 });
 sock.on('timeout',()=>sock.destroy(Error('TLS handshake timeout')));
 sock.on('error',reject);
});
const response=await fetch(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(12000)});
if(response.status!==200)throw Error('Public site HTTPS HEAD returned '+response.status);
console.log('Public HTTPS HEAD 200; validated TLS certificate expires '+expiry);
