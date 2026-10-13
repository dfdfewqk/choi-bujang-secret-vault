import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decide} from './decide.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),TTL=900000;
const id=s=>typeof s==='string'&&/^ps-[0-9]{2,3}$/u.test(s);
const ip=s=>typeof s==='string'&&s.split('.').length===4&&s.split('.').every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
export function planResponses(alerts,{now=new Date(),ttlMs=TTL}={}){
 if(!Array.isArray(alerts)||!(now instanceof Date)||!Number.isFinite(now.valueOf())||!Number.isInteger(ttlMs)||ttlMs<60000||ttlMs>3600000)throw TypeError('bad_response_args');
 const rows=alerts.map(alert=>({alert,decision:decide(alert)}));
 const normalIps=new Set(rows.filter(x=>x.decision.action==='record'&&x.alert?.rule?.level<=3&&ip(x.alert?.data?.srcip)).map(x=>x.alert.data.srcip));
 const createdAt=now.toISOString(),expiresAt=new Date(now.valueOf()+ttlMs).toISOString(),byIp=new Map(),alertLogLines=[];let suppressedNormalSourceBlocks=0;
 for(const {alert,decision} of rows){
  const src=alert?.data?.srcip,aid=alert?.id,candidate=decision.action==='block'&&decision.confidence>=0.85,ok=candidate&&id(aid)&&ip(src)&&!normalIps.has(src);
  if(candidate&&!ok)suppressedNormalSourceBlocks++;
  if(ok){
   let r=byIp.get(src);
   if(!r){r={ruleId:'xdr.persistence.'+src.replaceAll('.','_'),effect:'deny',sourceIp:src,createdAt,expiresAt,evidenceAlertIds:[],pattern:decision.reason};byIp.set(src,r);}
   if(!r.evidenceAlertIds.includes(aid))r.evidenceAlertIds.push(aid);
  }
  if(decision.action!=='record')alertLogLines.push(JSON.stringify({at:createdAt,alertId:id(aid)?aid:'invalid',action:candidate&&!ok?'alert':decision.action,confidence:decision.confidence,reason:candidate&&!ok?'정상 사용자 공유 주소로 차단 보류':decision.reason}));
 }
 return {denyRules:[...byIp.values()],alertLogLines,suppressedNormalSourceBlocks,reviewed:rows.length,counts:rows.reduce((c,x)=>(c[x.decision.action]++,c),{block:0,alert:0,record:0})};
}
// Trusted transport must supply verifiedSourceIp; never use raw request headers.
export function createZtnaDenyGate({baseDecide,denyRules,trustedSourceIp,now=()=>Date.now()}){
 if(typeof baseDecide!=='function'||!Array.isArray(denyRules)||typeof trustedSourceIp!=='function'||typeof now!=='function')throw TypeError('bad_gate_args');
 return async(req,ctx)=>{
  const src=trustedSourceIp(ctx),at=now();
  const found=ip(src)&&Number.isFinite(at)?denyRules.find(r=>r?.effect==='deny'&&r.sourceIp===src&&id(r.evidenceAlertIds?.[0])&&Number.isFinite(Date.parse(r.createdAt))&&Number.isFinite(Date.parse(r.expiresAt))&&Date.parse(r.createdAt)<=at&&at<Date.parse(r.expiresAt)):null;
  return found?{blocked:true,stage:'xdr-pre-gate',ruleId:found.ruleId,expiresAt:found.expiresAt,evidenceAlertIds:[...found.evidenceAlertIds]}:{blocked:false,stage:'ztna',decision:await baseDecide(req)};
 };
}
export async function processXdrResponses({alerts,root=ROOT,now=new Date()}){
 const plan=planResponses(alerts,{now}),dir=join(root,'xdr','persistence');
 await mkdir(dir,{recursive:true});
 if(plan.alertLogLines.length)await appendFile(join(root,'xdr','alerts.log'),plan.alertLogLines.join('\n')+'\n','utf8');
 await writeFile(join(dir,'deny-rules.runtime.json'),JSON.stringify({schema:'byteback.xdr.deny-rules.runtime.v1',rules:plan.denyRules},null,2)+'\n','utf8');
 return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 try{const f=JSON.parse(await readFile(join(ROOT,'xdr','fixtures','persistence.json'),'utf8'));const p=await processXdrResponses({alerts:f.alerts});
 console.log('block='+p.counts.block+' alert='+p.counts.alert+' record='+p.counts.record);}
 catch{console.error('response failed');process.exitCode=1;}
}
