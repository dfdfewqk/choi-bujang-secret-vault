// Project only five safe Wazuh fields; never print payloads, keys or tokens.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const FILE=new URL('../fixtures/privilege.json',import.meta.url);
const SECRET=/Bearer\s+|(?:password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]|-----BEGIN|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9_-]{45,}/iu;
const ip=s=>typeof s==='string'&&s.split('.').length===4
 &&s.split('.').every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
export function projectAlerts(input){
 if(input?.schema!=='aleph.xdr.fixture.v1'||input.moduleKey!=='privilege'||!Array.isArray(input.alerts))
  throw TypeError('invalid_fixture');
 return input.alerts.map(alert=>({
  timestamp:typeof alert?.timestamp==='string'&&Number.isFinite(Date.parse(alert.timestamp))
   ?alert.timestamp:'[확인 필요]',
  sourceAddress:ip(alert?.data?.srcip)?alert.data.srcip:'[비공개]',
  account:typeof alert?.data?.srcuser==='string'
   &&/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u.test(alert.data.srcuser)
   &&!SECRET.test(alert.data.srcuser)?alert.data.srcuser:'[비공개]',
  ruleLevel:Number.isInteger(alert?.rule?.level)&&alert.rule.level>=0&&alert.rule.level<=16
   ?alert.rule.level:null,
  description:typeof alert?.rule?.description==='string'&&alert.rule.description.length<=300
   &&!SECRET.test(alert.rule.description)&&!/[\u0000-\u001f\u007f]/u.test(alert.rule.description)
   ?alert.rule.description:'[비밀값 제외]',
 }));
}
export async function readAlerts({fixtureUrl=FILE}={}){
 const raw=JSON.parse(await readFile(fixtureUrl,'utf8'));
 const lines=projectAlerts(raw);
 if(lines.length!==raw.alerts.length)throw Error('count_mismatch');
 return {inputCount:raw.alerts.length,lines};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const result=await readAlerts();
  console.log('경보 건수: '+result.inputCount+' · 추출한 줄 수: '+result.lines.length);
  for(const row of result.lines)console.log(JSON.stringify(row));
 }catch{console.error('경보 읽기 오류');process.exitCode=1;}
}
