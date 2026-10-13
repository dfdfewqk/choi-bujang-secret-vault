// XDR-06 isolated classifier. Pattern metadata is copied from patterns.json.
// No imports, dependencies, file writes or network requests are used.
const PATTERNS=Object.freeze([
 {"id":"unfamiliar_bulk_destination","name":"낯선 목적지로 대량 자료 반출","condition":"T1041/T1048·수준 10 이상, 5천만 바이트 이상 전송과 새로운 외부 목적지 징후가 함께 확인됨","evidence":"MITRE ATT&CK T1041·T1048: 통제되지 않은 외부 목적지로의 대량 송신은 명령 채널 또는 대체 통신 경로 유출 징후다."},
 {"id":"repeated_bulk_transfer","name":"동일 목적지로 반복 대용량 전송","condition":"T1041/T1048·수준 10 이상, 5천만 바이트 이상 송신과 동일 목적지 5회 이상 반복 징후","evidence":"MITRE ATT&CK T1041·T1048: 일정 목적지로 반복되는 대량 반출은 유출 전송 패턴과 일치한다."},
 {"id":"archive_offhours_or_unusual_port","name":"업무 외 압축파일·비정상 포트 대량 반출","condition":"T1048·수준 10 이상, 5천만 바이트 이상 송신과 업무 외 압축 파일 또는 비정상 포트·대규모 자료실 복사 정황","evidence":"MITRE ATT&CK T1048: 비정상 통신 경로나 압축 파일을 이용한 대량 전송은 별도 프로토콜 유출 징후가 된다."},
 {"id":"uncertain_outbound_transfer","name":"추가 확인이 필요한 외부 전송","condition":"T1041/T1048·수준 5 이상, 단발·소용량·실패한 전송 또는 출처 불명 목적지로의 약한 징후","evidence":"MITRE ATT&CK T1041·T1048: 작은 동기화·백업·시도 흔적은 정상 업무와 혼동 가능하므로 자동 차단 전에 확인한다."}
]);
const asResult=(confidence,reason)=>({action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',confidence,reason});
function ipv4(value){
 if(typeof value!=='string')return false;
 const p=value.split('.');
 return p.length===4&&p.every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
}
function number(value){
 if(typeof value!=='string'&&typeof value!=='number')return 0;
 const s=String(value);
 return /^(?:0|[1-9][0-9]{0,11})$/u.test(s)?Number(s):0;
}
function safeText(value,maxLength=500){return typeof value==='string'&&value.length<=maxLength?value:'';}
export function decide(alert){
 if(!alert||typeof alert!=='object'||Array.isArray(alert))return asResult(0.08,'자료 유출 징후 없음');
 const rule=alert.rule??{},data=alert.data??{},level=rule.level,description=safeText(rule.description);
 const tags=Array.isArray(rule.mitre)?rule.mitre:[];
 const technique=tags.some(t=>t==='T1041'||t==='T1048'||/^T1048\.[0-9]{3}$/u.test(t));
 if(!Number.isInteger(level)||level<0||level>16||!technique)return asResult(0.08,'자료 유출 징후 없음');
 const bytes=number(data.bytes),files=number(data.files),repeats=number(data.count);
 const unfamiliar=/처음 보는 목적지|처음 보는 주소|처음 봅니다|평소에 쓰지 않던/u.test(description);
 const repeatsToDestination=/같은 목적지로|반복 전송/u.test(description)&&repeats>=5;
 const unusualPort=/평소에 쓰지 않던 포트/u.test(description);
 const offHoursArchive=/수업 시간 밖|업무 시간 밖/u.test(description)&&/압축 파일/u.test(description);
 const majorCopy=/자료실 전체|자료 이름이 연속/u.test(description)&&files>=20;
 const completed=!/전송은 아직 없습니다|전송이 실패|전송 실패|읽기만|로그아웃/u.test(description);
 const clear=level>=10&&ipv4(data.srcip)&&ipv4(data.dstip)&&bytes>=50000000&&completed;
 if(clear){
  if(unfamiliar)return asResult(0.96,PATTERNS[0].name);
  if(repeatsToDestination)return asResult(0.95,PATTERNS[1].name);
  if(unusualPort||offHoursArchive||majorCopy)return asResult(0.94,PATTERNS[2].name);
 }
 if(level>=5&&/전송|주소|목적지|압축 파일|권한|자료|동기화/u.test(description))
  return asResult(level>=8?0.73:0.61,PATTERNS[3].name);
 return asResult(0.08,'자료 유출 징후 없음');
}
