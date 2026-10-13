// Diagnostic-only Wazuh fixture reader. Never imported by decide.mjs.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const DEFAULT_FIXTURE = new URL('../fixtures/exfiltration.json', import.meta.url);
const ACCOUNT = /^[A-Za-z0-9_.-]{1,64}$/u;
const SECRET = /(?:-----BEGIN|Bearer\s+|(?:password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]|(?:sb_secret|sk-)[A-Za-z0-9_-]+|[A-Za-z0-9_-]{45,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/iu;
function safeIP(ip) {
 if(typeof ip!=='string') return '[비공개]';
 const p=ip.split('.');
 return p.length===4&&p.every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255)?ip:'[비공개]';
}
function safeDescription(v) {
 return typeof v==='string'&&v.length<=300&&!SECRET.test(v)
  &&!/[\u0000-\u001f\u007f]/u.test(v)?v:'[비밀값 제외]';
}
export function projectAlerts(input) {
 if(input?.schema!=='aleph.xdr.fixture.v1'||input.moduleKey!=='exfiltration'
    ||!Array.isArray(input.alerts)) throw new TypeError('invalid_exfiltration_fixture');
 return input.alerts.map(a=>({
  timestamp:typeof a?.timestamp==='string'&&Number.isFinite(Date.parse(a.timestamp))?a.timestamp:'[확인 필요]',
  sourceAddress:safeIP(a?.data?.srcip),
  account:typeof a?.data?.srcuser==='string'&&ACCOUNT.test(a.data.srcuser)
    &&!SECRET.test(a.data.srcuser)?a.data.srcuser:'[미기록]',
  ruleLevel:Number.isInteger(a?.rule?.level)&&a.rule.level>=0&&a.rule.level<=16?a.rule.level:null,
  description:safeDescription(a?.rule?.description)
 }));
}
export async function readAlerts({fixtureUrl=DEFAULT_FIXTURE}={}) {
 const input=JSON.parse(await readFile(fixtureUrl,'utf8'));
 const lines=projectAlerts(input);
 if(lines.length!==input.alerts.length)throw new Error('alert_count_mismatch');
 return {inputCount:input.alerts.length,lines};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))) {
 try {const {inputCount,lines}=await readAlerts();
  console.log('경보 건수: '+inputCount+' · 추출한 줄 수: '+lines.length);
  for(const row of lines)console.log(JSON.stringify(row));
 } catch {console.error('XDR-06: 안전한 경보 형식 또는 파일 위치 확인 필요');process.exitCode=1;}
}
