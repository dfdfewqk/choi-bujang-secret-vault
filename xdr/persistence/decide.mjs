const PATTERNS=Object.freeze([
  {
    "name": "미서명 서비스 등록·변경",
    "condition": "T1543, 수준 10 이상, 신규·수정 서비스와 서명 없는 실행 파일 또는 재시작 지속성이 동시에 확인됨",
    "evidence": "MITRE ATT&CK T1543.003: 공격자는 서비스를 생성하거나 수정해 장기 실행할 수 있다."
  },
  {
    "name": "낯선 예약 작업의 임시 파일 실행",
    "condition": "T1053, 수준 10 이상, 모르는 예약 작업과 임시 폴더·시간 밖 실행이 동시에 확인됨",
    "evidence": "MITRE ATT&CK T1053.005: 예약 작업 등록은 악성 프로그램의 반복 실행 수단이 될 수 있다."
  },
  {
    "name": "미등록 시작 폴더 및 예약 작업 연결",
    "condition": "수준 10 이상, 허용 목록 밖 시작 폴더 항목 또는 시작 프로그램·예약 작업의 동일 임시 실행 파일 공유",
    "evidence": "MITRE ATT&CK T1547.001·T1053.005: 시작 폴더 등록과 예약 작업은 자동 재실행을 지원한다."
  },
  {
    "name": "확인이 필요한 지속성 관련 변경",
    "condition": "T1543 또는 T1053, 수준 5 이상, 서비스·예약 작업·시작 항목의 단편적 변경",
    "evidence": "MITRE ATT&CK T1543·T1053: 시스템 관리도 유사한 변경을 일으키므로 추가 검증이 필요하다."
  }
]);
const result=(c,r)=>({action:c>=0.85?'block':c>=0.5?'alert':'record',confidence:c,reason:r});
const text=(s,n=500)=>typeof s==='string'&&s.length<=n?s:'';
const ip=s=>typeof s==='string'&&s.split('.').length===4&&s.split('.').every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
export function decide(alert){
 if(!alert||typeof alert!=='object'||Array.isArray(alert))return result(0.08,'지속성 침해 증거 없음');
 const rule=alert.rule??{},data=alert.data??{},level=rule.level,desc=text(rule.description);
 const tags=Array.isArray(rule.mitre)?rule.mitre:[];
 if(!Number.isInteger(level)||level<0||level>16)return result(0.08,'지속성 침해 증거 없음');
 const service=tags.includes('T1543')||tags.includes('T1543.003'),task=tags.includes('T1053')||tags.includes('T1053.005'),startup=service||task||tags.includes('T1547.001');
 const path=text(data.path,800).replaceAll('/','\\').toLowerCase(),temp=path.includes('\\appdata\\local\\temp\\');
 const unsigned=/서명 없는|서명이 없습니다|서명되지|미서명/u.test(desc)||data.signed===false||data.signatureStatus==='unsigned';
 const s=/서비스/u.test(desc),t=/예약 작업/u.test(desc),st=/시작 폴더|시작 프로그램|시작 항목/u.test(desc);
 const changed=/등록|새 서비스|바뀌었|변경|다시 켜도 남/u.test(desc);
 const unknown=/처음 보는|평소 목록에 없|목록에 없는|임의 문자열|낯선/u.test(desc);
 const normal=/그대로|등록은 없습니다|읽기만|서명된 채|기존|정상|평소 시각/u.test(desc);
 if(level>=10&&ip(data.srcip)&&!normal){
  if(service&&s&&changed&&(unsigned||(unknown&&temp&&/다시 켜도 남/u.test(desc))))return result(0.96,PATTERNS[0].name);
  if(service&&s&&unsigned&&temp&&/바뀌었|변경/u.test(desc))return result(0.95,PATTERNS[0].name);
  if(task&&t&&unknown&&(temp||/임시 폴더|수업 시간 밖/u.test(desc)))return result(0.94,PATTERNS[1].name);
  if(startup&&st&&unknown&&(path.includes('\\start menu\\programs\\startup\\')||/시작 폴더에.*추가/u.test(desc)))return result(0.91,PATTERNS[2].name);
  if(task&&startup&&t&&st&&temp&&/같은 임시 파일|함께 가리/u.test(desc))return result(0.95,PATTERNS[2].name);
 }
 if((service||task||tags.includes('T1547.001'))&&level>=5&&(s||t||st||/임시 폴더/u.test(desc)))
  return result(level>=8?0.73:0.61,PATTERNS[3].name);
 return result(0.08,'지속성 침해 증거 없음');
}
