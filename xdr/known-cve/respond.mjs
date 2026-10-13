// XDR-03: separate response adapter. Pure decide.mjs never writes anything.
// Deny proposals are short-lived, evidence-backed, and only consult VERIFIED IPs.
import {appendFile,mkdir,writeFile,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decide} from './decide.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const TTL_MS=15*60*1000;
function validIp(value){
 if(typeof value!=='string')return false;
 const parts=value.split('.');
 return parts.length===4&&parts.every(part=>/^(?:0|[1-9][0-9]{0,2})$/u.test(part)&&Number(part)<=255);
}
function validAlertId(v){return typeof v==='string'&&/^kc-[0-9]{2,3}$/u.test(v);}
function clearNormalEvent(alert,decision){
 return decision.action==='record'&&Number.isInteger(alert?.rule?.level)
   &&alert.rule.level<=3&&Array.isArray(alert?.rule?.mitre)
   &&!alert.rule.mitre.includes('T1190');
}
export function planResponses(alerts,{now=new Date(),ttlMs=TTL_MS}={}){
 if(!Array.isArray(alerts)||!(now instanceof Date)||!Number.isFinite(now.getTime())
   ||!Number.isInteger(ttlMs)||ttlMs<60000||ttlMs>3600000)
   throw new TypeError('invalid_known_cve_response');
 const rows=alerts.map(alert=>({alert,result:decide(alert)}));
 // Shared NAT addresses with known normal activity should never receive
 // automatic blanket IP blocking, even for another high-confidence event.
 const normalSources=new Set(rows.filter(({alert,result})=>
  clearNormalEvent(alert,result)&&validIp(alert?.data?.srcip))
  .map(({alert})=>alert.data.srcip));
 const createdAt=now.toISOString(),expiresAt=new Date(now.getTime()+ttlMs).toISOString();
 const rules=new Map(),alertLogLines=[];
 let suppressedNormalSourceBlocks=0;
 for(const {alert,result} of rows){
  const source=alert?.data?.srcip,id=alert?.id;
  const proposed=result.action==='block'&&result.confidence>=0.85;
  const actionable=proposed&&validAlertId(id)&&validIp(source)&&!normalSources.has(source);
  if(proposed&&!actionable)suppressedNormalSourceBlocks++;
  if(actionable){
   const existing=rules.get(source);
   if(existing){
    if(!existing.evidenceAlertIds.includes(id))existing.evidenceAlertIds.push(id);
   }else{
    rules.set(source,{ruleId:'xdr.known_cve.'+source.replaceAll('.','_'),
      effect:'deny',sourceIp:source,createdAt,expiresAt,
      evidenceAlertIds:[id],pattern:result.reason});
   }
  }
  if(result.action!=='record'){
   // No raw Wazuh data, URLs, headers, account names, payloads or IP in log.
   alertLogLines.push(JSON.stringify({
    at:createdAt,alertId:validAlertId(id)?id:'invalid',
    action:proposed&&!actionable?'alert':result.action,
    confidence:result.confidence,
    reason:proposed&&!actionable?'정상 사용자 공유 출발지로 차단 보류':result.reason,
   }));
  }
 }
 return {denyRules:[...rules.values()],alertLogLines,suppressedNormalSourceBlocks,
   reviewed:rows.length,counts:rows.reduce((acc,{result})=>{
    acc[result.action]++;return acc;
   },{block:0,alert:0,record:0})};
}
// This wrapper is for a trusted transport that supplies the real source IP,
// not request.body, URL parameters, browser location or user-controlled headers.
export function createZtnaDenyGate({baseDecide,denyRules,trustedSourceIp,now=()=>Date.now()}){
 if(typeof baseDecide!=='function'||!Array.isArray(denyRules)
    ||typeof trustedSourceIp!=='function'||typeof now!=='function')
    throw new TypeError('invalid_ztna_gate');
 return async (request,trustedContext)=>{
  const source=trustedSourceIp(trustedContext),at=now();
  const matched=validIp(source)&&Number.isFinite(at)?denyRules.find(rule=>
    rule?.effect==='deny'&&rule.sourceIp===source
      &&validAlertId(rule.evidenceAlertIds?.[0])
      &&Number.isFinite(Date.parse(rule.createdAt))
      &&Number.isFinite(Date.parse(rule.expiresAt))
      &&Date.parse(rule.createdAt)<=at&&at<Date.parse(rule.expiresAt)):null;
  if(matched){
   return {blocked:true,stage:'xdr-pre-gate',ruleId:matched.ruleId,
    expiresAt:matched.expiresAt,evidenceAlertIds:[...matched.evidenceAlertIds]};
  }
  return {blocked:false,stage:'ztna',decision:await baseDecide(request)};
 };
}
export async function processXdrResponses({alerts,root=ROOT,now=new Date()}){
 const plan=planResponses(alerts,{now}),dir=join(root,'xdr','known-cve');
 await mkdir(dir,{recursive:true});
 if(plan.alertLogLines.length)
  await appendFile(join(root,'xdr','alerts.log'),plan.alertLogLines.join('\n')+'\n','utf8');
 await writeFile(join(dir,'deny-rules.runtime.json'),JSON.stringify({
  schema:'byteback.xdr.deny-rules.runtime.v1',rules:plan.denyRules,
 },null,2)+'\n','utf8');
 return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 try{
  const fixture=JSON.parse(await readFile(join(ROOT,'xdr','fixtures','known-cve.json'),'utf8'));
  const plan=await processXdrResponses({alerts:fixture.alerts});
  console.log('XDR-03: block='+plan.counts.block+', alert='+plan.counts.alert+
    ', record='+plan.counts.record+'; temporary denies='+plan.denyRules.length+
    '; normal-source suppressions='+plan.suppressedNormalSourceBlocks);
 }catch{console.error('XDR-03 response failed: inspect fixture/adapter');process.exitCode=1;}
}
