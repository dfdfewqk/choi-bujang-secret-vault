// XDR-06 adapter: only short-lived, evidence-backed destination denial proposals.
// No changes to src/decider.mjs. A trusted network layer must verify destination IP.
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decide} from './decide.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const TTL_MS=15*60*1000;
function ipv4(v){
 return typeof v==='string'&&v.split('.').length===4&&v.split('.').every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
}
function validId(v){return typeof v==='string'&&/^ex-[0-9]{2,3}$/u.test(v);}
function clearlyNormal(alert,decision){
 return decision.action==='record'&&Number.isInteger(alert?.rule?.level)&&alert.rule.level<=3&&ipv4(alert?.data?.dstip);
}
export function planResponses(alerts,{now=new Date(),ttlMs=TTL_MS}={}){
 if(!Array.isArray(alerts)||!(now instanceof Date)||!Number.isFinite(now.valueOf())
 ||!Number.isInteger(ttlMs)||ttlMs<60000||ttlMs>3600000)throw new TypeError('invalid_exfiltration_response');
 const rows=alerts.map(alert=>({alert,decision:decide(alert)}));
 const normalDestinations=new Set(rows.filter(({alert,decision})=>clearlyNormal(alert,decision)).map(({alert})=>alert.data.dstip));
 const createdAt=now.toISOString(),expiresAt=new Date(now.valueOf()+ttlMs).toISOString();
 const rules=new Map(),alertLogLines=[];
 let suppressedNormalDestinationBlocks=0;
 for(const {alert,decision} of rows){
  const destination=alert?.data?.dstip,id=alert?.id;
  const proposed=decision.action==='block'&&decision.confidence>=0.85;
  const eligible=proposed&&validId(id)&&ipv4(destination)&&!normalDestinations.has(destination);
  if(proposed&&!eligible)suppressedNormalDestinationBlocks++;
  if(eligible){
   let rule=rules.get(destination);
   if(!rule){
    rule={ruleId:'xdr.exfiltration.'+destination.replaceAll('.','_'),effect:'deny',
      destinationIp:destination,createdAt,expiresAt,evidenceAlertIds:[],pattern:decision.reason};
    rules.set(destination,rule);
   }
   if(!rule.evidenceAlertIds.includes(id))rule.evidenceAlertIds.push(id);
  }
  if(decision.action!=='record'){
   alertLogLines.push(JSON.stringify({
    at:createdAt,alertId:validId(id)?id:'invalid',
    action:proposed&&!eligible?'alert':decision.action,confidence:decision.confidence,
    reason:proposed&&!eligible?'정상 통신 목적지 공유로 차단 보류':decision.reason
   }));
  }
 }
 return {denyRules:[...rules.values()],alertLogLines,suppressedNormalDestinationBlocks,
   reviewed:rows.length,counts:rows.reduce((c,{decision})=>(c[decision.action]++,c),{block:0,alert:0,record:0})};
}
// The caller MUST supply a verified destination from the trusted network layer.
export function createZtnaDestinationGate({baseDecide,denyRules,trustedDestinationIp,now=()=>Date.now()}){
 if(typeof baseDecide!=='function'||!Array.isArray(denyRules)
 ||typeof trustedDestinationIp!=='function'||typeof now!=='function')throw new TypeError('invalid_exfiltration_gate');
 return async function evaluate(request,trustedContext){
  const destination=trustedDestinationIp(trustedContext),at=now();
  const rule=ipv4(destination)&&Number.isFinite(at)?denyRules.find(r=>
    r?.effect==='deny'&&r.destinationIp===destination&&validId(r.evidenceAlertIds?.[0])
    &&Number.isFinite(Date.parse(r.createdAt))&&Number.isFinite(Date.parse(r.expiresAt))
    &&Date.parse(r.createdAt)<=at&&at<Date.parse(r.expiresAt)):null;
  if(rule)return {blocked:true,stage:'xdr-pre-gate',ruleId:rule.ruleId,
    expiresAt:rule.expiresAt,evidenceAlertIds:[...rule.evidenceAlertIds]};
  return {blocked:false,stage:'ztna',decision:await baseDecide(request)};
 };
}
export async function processXdrResponses({alerts,root=ROOT,now=new Date()}){
 const plan=planResponses(alerts,{now}),dir=join(root,'xdr','exfiltration');
 await mkdir(dir,{recursive:true});
 if(plan.alertLogLines.length)await appendFile(join(root,'xdr','alerts.log'),plan.alertLogLines.join('\n')+'\n','utf8');
 await writeFile(join(dir,'deny-rules.runtime.json'),JSON.stringify({
  schema:'byteback.xdr.deny-rules.runtime.v1',rules:plan.denyRules
 },null,2)+'\n','utf8');
 return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 try{
  const f=JSON.parse(await readFile(join(ROOT,'xdr','fixtures','exfiltration.json'),'utf8'));
  const p=await processXdrResponses({alerts:f.alerts});
  console.log('XDR-06 block='+p.counts.block+' alert='+p.counts.alert+
    ' record='+p.counts.record+' temporary destination denies='+p.denyRules.length);
 }catch{console.error('XDR-06 response failure; check fixture and adapter');process.exitCode=1;}
}
