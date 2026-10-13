// XDR-03: safe, read-only Wazuh projection. No raw request headers/URLs.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const FIXTURE_URL=new URL('../fixtures/known-cve.json',import.meta.url);
const ACCOUNT=/^[A-Za-z0-9_.-]{1,64}$/u;
const SECRET=/(?:-----BEGIN|Bearer\s+|(?:password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]|(?:sb_secret|sk-)[A-Za-z0-9_-]+|[A-Za-z0-9_-]{45,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/iu;
function safeIp(value) {
  if(typeof value!=='string')return '[비공개]';
  const parts=value.split('.');
  return parts.length===4 && parts.every(p=>/^(?:0|[1-9][0-9]{0,2})$/u.test(p) && Number(p)<=255)
    ?value:'[비공개]';
}
function safeText(value,limit) {
  if(typeof value!=='string'||value.length>limit||SECRET.test(value)
    ||/[\u0000-\u001f\u007f]/u.test(value))return '[비밀값 제외]';
  return value;
}
export function projectAlerts(input) {
  if(input?.schema!=='aleph.xdr.fixture.v1'||input?.moduleKey!=='known-cve'
    ||!Array.isArray(input.alerts))throw new TypeError('invalid_known_cve_fixture');
  return input.alerts.map(event=>({
    timestamp:typeof event?.timestamp==='string'&&Number.isFinite(Date.parse(event.timestamp))
      ?event.timestamp:'[확인 필요]',
    sourceAddress:safeIp(event?.data?.srcip),
    account:typeof event?.data?.srcuser==='string'&&ACCOUNT.test(event.data.srcuser)
      &&!SECRET.test(event.data.srcuser)?event.data.srcuser:'[미기록]',
    ruleLevel:Number.isInteger(event?.rule?.level)&&event.rule.level>=0&&event.rule.level<=16
      ?event.rule.level:null,
    description:safeText(event?.rule?.description,300),
  }));
}
export async function readAlerts({fixtureUrl=FIXTURE_URL}={}) {
  const input=JSON.parse(await readFile(fixtureUrl,'utf8'));
  const lines=projectAlerts(input);
  if(lines.length!==input.alerts.length)throw new Error('alert_count_mismatch');
  return {inputCount:input.alerts.length,lines};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const {inputCount,lines}=await readAlerts();
    console.log('경보 건수: '+inputCount+' · 추출한 줄 수: '+lines.length);
    for(const row of lines)console.log(JSON.stringify(row));
  }catch{
    console.error('경보 읽기 실패: 안전한 가상 경보 형식을 확인하세요.');
    process.exitCode=1;
  }
}
