// Optional ZTNA pre-gate. Never changes the existing SDP policy, DB,
// actual accounts or sessions. Production use requires trusted identity
// and address match from the transport adapter.
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decide} from './decide.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const TTL_MS=15*60*1000;
const validId=s=>typeof s==='string'&&/^pv-[0-9]{2,3}$/u.test(s);
const validAccount=s=>typeof s==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u.test(s);
const validIp=s=>typeof s==='string'&&s.split('.').length===4
 &&s.split('.').every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
export function planResponses(alerts,{now=new Date(),ttlMs=TTL_MS}={}){
 if(!Array.isArray(alerts)||!Number.isFinite(now?.valueOf?.())
   ||!Number.isInteger(ttlMs)||ttlMs<60000||ttlMs>3600000)
  throw TypeError('invalid_response_plan');
 const classified=alerts.map(alert=>({alert,decision:decide(alert)}));
 // A benign observation from the SAME account AND IP means the source is
 // ambiguous; alert rather than blocking a legitimate shared session.
 const knownNormal=new Set(classified.filter(x=>x.decision.action==='record'
  &&x.alert?.rule?.level<=3&&validAccount(x.alert?.data?.srcuser)
  &&validIp(x.alert?.data?.srcip))
  .map(x=>x.alert.data.srcuser+'|'+x.alert.data.srcip));
 const createdAt=now.toISOString(),expiresAt=new Date(now.valueOf()+ttlMs).toISOString();
 const byAccount=new Map(),alertLogLines=[];
 let suppressedNormalSourceBlocks=0;
 for(const {alert,decision} of classified){
  const account=alert?.data?.srcuser,ip=alert?.data?.srcip,id=alert?.id;
  const candidate=decision.action==='block'&&decision.confidence>=0.85;
  const safe=candidate&&validId(id)&&validAccount(account)&&validIp(ip)
   &&!knownNormal.has(account+'|'+ip);
  if(candidate&&!safe)suppressedNormalSourceBlocks++;
  if(safe){
   const key=account+'|'+ip;
   let rule=byAccount.get(key);
   if(!rule){
    rule={ruleId:'xdr.privilege.'+account+'.'+ip.replaceAll('.','_'),
     effect:'deny',verifiedAccount:account,verifiedSourceIp:ip,
     createdAt,expiresAt,evidenceAlertIds:[],reason:decision.reason,
     source:'wazuh_synthetic_privilege_alert'};
    byAccount.set(key,rule);
   }
   if(!rule.evidenceAlertIds.includes(id))rule.evidenceAlertIds.push(id);
  }
  if(decision.action!=='record'){
   alertLogLines.push(JSON.stringify({at:createdAt,
    alertId:validId(id)?id:'invalid',
    action:candidate&&!safe?'alert':decision.action,
    confidence:decision.confidence,reason:candidate&&!safe?'신원·주소 검증 필요로 차단 보류':decision.reason}));
  }
 }
 return {denyRules:[...byAccount.values()],alertLogLines,suppressedNormalSourceBlocks,
  reviewed:classified.length,
  counts:classified.reduce((c,x)=>(c[x.decision.action]++,c),{block:0,alert:0,record:0})};
}
export function createZtnaDenyGate({
 baseDecide,denyRules,trustedAccount,trustedSourceIp,now=()=>Date.now(),
}={}){
 if(typeof baseDecide!=='function'||!Array.isArray(denyRules)
  ||typeof trustedAccount!=='function'||typeof trustedSourceIp!=='function'
  ||typeof now!=='function')throw TypeError('invalid_ztna_gate');
 return async(request,context)=>{
  const account=trustedAccount(context),ip=trustedSourceIp(context),time=now();
  // request.subjectId and any request header/body are never trusted as
  // proof of an account mapping or a source IP.
  const rule=validAccount(account)&&validIp(ip)&&Number.isFinite(time)
   ?denyRules.find(r=>r?.effect==='deny'&&r.verifiedAccount===account
      &&r.verifiedSourceIp===ip
      &&validId(r.evidenceAlertIds?.[0])
      &&Number.isFinite(Date.parse(r.createdAt))
      &&Number.isFinite(Date.parse(r.expiresAt))
      &&Date.parse(r.createdAt)<=time&&time<Date.parse(r.expiresAt))
   :null;
  if(rule)return {blocked:true,stage:'xdr-pre-gate',ruleId:rule.ruleId,
   expiresAt:rule.expiresAt,evidenceAlertIds:[...rule.evidenceAlertIds]};
  return {blocked:false,stage:'ztna',decision:await baseDecide(request)};
 };
}
export async function processXdrResponses({alerts,root=ROOT,now=new Date()}={}){
 const plan=planResponses(alerts,{now}),dir=join(root,'xdr','privilege');
 await mkdir(dir,{recursive:true});
 if(plan.alertLogLines.length)
  await appendFile(join(root,'xdr','alerts.log'),plan.alertLogLines.join('\n')+'\n','utf8');
 await writeFile(join(dir,'deny-rules.runtime.json'),
  JSON.stringify({schema:'byteback.xdr.deny-rules.runtime.v1',rules:plan.denyRules},null,2)+'\n','utf8');
 return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 try{
  const fixture=JSON.parse(await readFile(join(ROOT,'xdr','fixtures','privilege.json'),'utf8'));
  const plan=await processXdrResponses({alerts:fixture.alerts});
  console.log('block='+plan.counts.block+' alert='+plan.counts.alert+
   ' record='+plan.counts.record+' planned_denies='+plan.denyRules.length);
 }catch{console.error('XDR 권한 대응 오류');process.exitCode=1;}
}
