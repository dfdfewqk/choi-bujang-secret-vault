import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const FILE=new URL('../fixtures/persistence.json',import.meta.url);
const SECRET=/Bearer\s+|(?:password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]|-----BEGIN|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9_-]{45,}/iu;
const safeIP=x=>typeof x==='string'&&x.split('.').length===4&&x.split('.').every(p=>/^(?:0|[1-9][0-9]{0,2})$/u.test(p)&&Number(p)<=255)?x:'[비공개]';
export function projectAlerts(input){
 if(input?.moduleKey!=='persistence'||input.schema!=='aleph.xdr.fixture.v1'||!Array.isArray(input.alerts))throw TypeError('invalid_fixture');
 return input.alerts.map(a=>({
  timestamp:typeof a?.timestamp==='string'&&Number.isFinite(Date.parse(a.timestamp))?a.timestamp:'[확인 필요]',
  sourceAddress:safeIP(a?.data?.srcip),
  account:typeof a?.data?.srcuser==='string'&&/^[a-zA-Z0-9_.-]{1,64}$/u.test(a.data.srcuser)&&!SECRET.test(a.data.srcuser)?a.data.srcuser:'[미기록]',
  ruleLevel:Number.isInteger(a?.rule?.level)&&a.rule.level>=0&&a.rule.level<=16?a.rule.level:null,
  description:typeof a?.rule?.description==='string'&&a.rule.description.length<=300&&!SECRET.test(a.rule.description)&&!/[\u0000-\u001f\u007f]/u.test(a.rule.description)?a.rule.description:'[비밀값 제외]'
 }));
}
export async function readAlerts({fixtureUrl=FILE}={}){
 const raw=JSON.parse(await readFile(fixtureUrl,'utf8'));const lines=projectAlerts(raw);
 if(lines.length!==raw.alerts.length)throw Error('count_mismatch');
 return {inputCount:raw.alerts.length,lines};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{const {inputCount,lines}=await readAlerts();console.log('경보 건수: '+inputCount+' · 추출한 줄 수: '+lines.length);
 for(const line of lines)console.log(JSON.stringify(line));}
 catch{console.error('경보 읽기 오류');process.exitCode=1;}
}
