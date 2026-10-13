// Bonus XDR-03 isolated Log4Shell detector. No imports, file or network I/O.
// PATTERNS are mirrored from patterns.json; all evidence is inert fixture data.
const PATTERNS = Object.freeze([
  {
    "id": "log4shell_header_lookup",
    "name": "로그4셸 머리글 원격 조회 악용",
    "condition": "MITRE T1190·Wazuh 경보 수준 10 이상과 HTTP 머리글/useragent에 JNDI 원격 조회 구문이 동시에 확인됨",
    "evidence": "CVE-2021-44228 (Log4Shell): 취약한 Log4j가 기록하는 외부 입력의 JNDI 조회 형태는 알려진 원격 코드 실행 악용 징후다."
  },
  {
    "id": "log4shell_query_lookup",
    "name": "로그4셸 요청 인자 원격 조회 악용",
    "condition": "MITRE T1190·Wazuh 경보 수준 10 이상과 URL/인자에 JNDI 원격 조회 구문이 동시에 확인됨",
    "evidence": "CVE-2021-44228 및 MITRE ATT&CK T1190: 외부 웹 입력에 삽입된 JNDI 원격 조회 구문은 알려진 Log4j 취약점 악용 형태다."
  },
  {
    "id": "uncertain_cve_probe",
    "name": "취약점 명칭·점검 도구·미완성 조회 흔적",
    "condition": "CVE-2021-44228나 JNDI 표기, 로그 라이브러리 또는 취약점 점검 흔적은 있지만 실행 가능한 원격 조회 구문과 강한 정황이 함께 확인되지 않음",
    "evidence": "MITRE ATT&CK T1190: 취약점 이름 검색·점검 단어·일부분만 있는 입력은 실제 악용과 정상 연구 활동을 구별하기 어려우므로 알림으로만 검토한다."
  }
]);
const BLOCK=0.85, ALERT=0.5;
function ip(value) {
 if(typeof value!=='string')return false;
 const xs=value.split('.');
 return xs.length===4 && xs.every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
}
function short(value,limit=1500) {
 return typeof value==='string'&&value.length<=limit?value:'';
}
function remoteLookup(value) {
 let s=short(value,2000);
 try { s=decodeURIComponent(s); }catch { /* keep untrusted input as-is */ }
 // Detect documented remote-lookup syntax; do not evaluate it or contact hosts.
 return /[$][{]\s*jndi\s*:\s*(?:ldap|ldaps|rmi|dns|iiop)\s*:\s*[/]{2}[^}\s]{1,300}[}]/iu.test(s);
}
function normal(){return {action:'record',confidence:0.08,reason:'알려진 취약점 악용 징후 없음'};}
export function decide(alert) {
 if(!alert||typeof alert!=='object'||Array.isArray(alert))return normal();
 const rule=alert.rule??{},data=alert.data??{};
 const level=rule.level;
 const mitre=Array.isArray(rule.mitre)&&rule.mitre.includes('T1190');
 const desc=short(rule.description,400);
 const headers=[data.useragent,data.userAgent,data.header,data.headers,data.referer]
  .flatMap(v=>typeof v==='string'?[v]:v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.values(v).filter(x=>typeof x==='string').slice(0,20):[]);
 const arguments_=[data.url,data.uri,data.path,data.query,data.request].filter(v=>typeof v==='string');
 const inHeader=headers.some(remoteLookup),inArgument=arguments_.some(remoteLookup);
 // Require source metadata and an independently reported high-severity
 // exploitation technique as well as an actual remote-lookup marker.
 if(mitre && Number.isInteger(level)&&level>=10&&ip(data.srcip)) {
   if(inHeader)return {action:'block',confidence:0.96,reason:PATTERNS[0].name};
   if(inArgument)return {action:'block',confidence:0.95,reason:PATTERNS[1].name};
 }
 const context=[desc,...headers,...arguments_].map(v=>short(v)).join(' ');
 const weak=/CVE-2021-44228|\bjndi\b|(?:log4j|로그.?라이브러리)|(?:취약점|점검|조회.?형태|중괄호|lookup|probe|scanner|라이브러리|잘린)/iu.test(context);
 if((inHeader||inArgument||weak)&&(mitre||inHeader||inArgument)
   &&Number.isInteger(level)&&level>=5) {
   const confidence=mitre?0.69:0.57;
   return {action:confidence>=ALERT?'alert':'record',confidence,reason:PATTERNS[2].name};
 }
 return normal();
}
