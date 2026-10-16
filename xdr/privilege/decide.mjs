// XDR-05: standalone deterministic Wazuh privilege-escalation decision.
// The standalone judge imports this file only. No imports, I/O or network.
// These pattern names and conditions duplicate xdr/privilege/patterns.json.
const PATTERNS = Object.freeze([
  {
    "name": "관리자 그룹 신규 편입",
    "condition": "T1078 경보·수준 10 이상·administrators 그룹의 신규 또는 재편입이 명시됨",
    "evidence": "MITRE ATT&CK T1078: 탈취된 정상 계정으로 관리자 권한을 악용할 수 있어 관리자 편입은 확인해야 한다."
  },
  {
    "name": "관리자 그룹 변경 직후 권한 명령",
    "condition": "T1068/T1078 경보·수준 10 이상·관리자 그룹 변경 직후 관리자 명령이 확인됨",
    "evidence": "MITRE ATT&CK T1078: 권한이 확대된 계정으로 명령을 실행할 수 있으며 T1068은 취약점 악용이 입증됐을 때만 해당한다."
  },
  {
    "name": "낯선 출처 또는 시간의 관리자 명령",
    "condition": "T1068/T1078 경보·수준 10 이상·관리자 명령과 처음 보는 주소나 업무 시간 밖 사용이 동시에 확인됨",
    "evidence": "MITRE ATT&CK T1078: 평소와 다른 관리자급 정상 계정 사용은 도용 여부를 조사해야 한다."
  },
  {
    "name": "다계정 관리자 그룹 변경",
    "condition": "T1078 경보·수준 10 이상·같은 출발 주소에서 여러 계정이 관리자 그룹에 추가됨",
    "evidence": "MITRE ATT&CK T1078: 여러 정상 계정의 갑작스러운 권한 증가는 계정 오용 위험 신호다."
  },
  {
    "name": "타 계정 관리자 권한 사용",
    "condition": "T1068/T1078 경보·수준 10 이상·다른 계정 권한으로 관리자 명령을 실행함",
    "evidence": "MITRE ATT&CK T1078: 다른 정상 계정의 권한을 도용해 높은 권한으로 활동할 수 있다."
  },
  {
    "name": "예상 밖 관리자 세션 승격",
    "condition": "T1068/T1078 경보·수준 10 이상·관리자 세션 전환과 낯선 주소가 동시에 명시됨",
    "evidence": "MITRE ATT&CK T1068: 권한 상승을 조사하되 실제 취약점 악용 증거가 없는 세션 변경만으로 T1068을 확정하지 않는다."
  },
  {
    "name": "권한 변화 관련 추가 확인",
    "condition": "T1068/T1078 경보·수준 5 이상·관리자 명령·권한 변경·그룹 계정 점검의 일부 증거",
    "evidence": "MITRE ATT&CK T1068·T1078: 정상 관리자 작업도 유사할 수 있으므로 단편적 단서에는 경보만 낸다."
  }
]);
function hasIp(s){
 return typeof s==='string'&&s.split('.').length===4
  &&s.split('.').every(x=>/^(?:0|[1-9][0-9]{0,2})$/u.test(x)&&Number(x)<=255);
}
function hasAccount(s){
 return typeof s==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u.test(s);
}
export function decide(alert){
 const level=alert?.rule?.level,description=alert?.rule?.description,data=alert?.data??{};
 const classify=(confidence,reason)=>({
  action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',
  confidence,reason
 });
 const tags=alert?.rule?.mitre;
 if(!Number.isInteger(level)||level<0||level>16
  ||typeof description!=='string'||description.length>500
  ||!Array.isArray(tags)||!tags.some(x=>x==='T1068'||x==='T1078'))
  return classify(0.06,'권한 변화 공격 단서 없음');
 const desc=description;
 const administratorGroup=typeof data.group==='string'
  &&/^(?:administrators|administrators group|관리자)$/iu.test(data.group.trim());
 const groupChange=administratorGroup
  &&/관리자 그룹에 (?:추가|들어가)|관리자 그룹.*(?:다시|재편입)|다시 관리자로 들어왔|관리자 그룹 추가/u.test(desc);
 const command=/관리자 명령|권한 명령|명령 실행/u.test(desc);
 const recent=/방금 관리자가 된|곧바로|관리자 그룹 추가와 명령 실행/u.test(desc);
 const unfamiliar=/처음 보는 주소|처음 봅니다|처음 보는|수업 시간 밖|업무처럼 보이지 않는 시각|원격 주소/u.test(desc);
 const otherAccount=/다른 계정의 권한으로/u.test(desc);
 const elevatedSession=/세션이 관리자 권한으로 바뀌었/u.test(desc);
 const rejoined=/다시 관리자로 들어왔/u.test(desc);
 const multiple=Number(data.count)>=3&&Number(data.count)<=50;
 // Failed, canceled, routine or insufficiently described changes are review
 // candidates, never an automatic denial (even at high Wazuh rule levels).
 const uncertain=/취소됐|실패 1건|명령은 없습니다|관리자 그룹은 아닙니다|변경은 없습니다|읽기만|평소 주소|한 번|설명만 바뀌었/u.test(desc);
 const complete=level>=10&&hasIp(data.srcip)&&hasAccount(data.srcuser);
 if(complete&&!uncertain){
  if(groupChange&&command)return classify(0.97,PATTERNS[1].name);
  if(groupChange&&multiple)return classify(0.95,PATTERNS[3].name);
  if(groupChange&&rejoined)return classify(0.93,PATTERNS[0].name);
  if(groupChange&&unfamiliar)return classify(0.92,PATTERNS[0].name);
  if(groupChange)return classify(0.89,PATTERNS[0].name);
  if(otherAccount&&command)return classify(0.93,PATTERNS[4].name);
  if(recent&&command)return classify(0.93,PATTERNS[1].name);
  if(elevatedSession&&unfamiliar)return classify(0.91,PATTERNS[5].name);
  if(command&&unfamiliar)return classify(0.89,PATTERNS[2].name);
 }
 if(level>=5&&/관리자|권한|그룹|계정/u.test(desc))
  return classify(level>=8?0.71:0.56,PATTERNS[6].name);
 return classify(0.1,'권한 변화 공격 단서 없음');
}
