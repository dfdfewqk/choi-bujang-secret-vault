// 3일차: 관리자 권한 상승이나 설정 변경 없이 내 PC의 상태만 읽는다.
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const measuredAt = now => now().toISOString();
const unavailable = (reason, at) => ({status:'unavailable',reason,checkedAt:at});
const clampText = value => typeof value === 'string' ? value.slice(0,120) : '';
const nonNegative = value => Number.isSafeInteger(value) && value >= 0;
const NETWORK = String.raw`$ErrorActionPreference='Stop';
$items=@(Get-NetIPConfiguration -ErrorAction Stop | ForEach-Object {
  $ip=@($_.IPv4Address | Select-Object -ExpandProperty IPAddress -ErrorAction SilentlyContinue);
  $gw=@($_.IPv4DefaultGateway | Select-Object -ExpandProperty NextHop -ErrorAction SilentlyContinue);
  $localIp=if($ip.Count){[string]$ip[0]}else{''};
  $gateway=if($gw.Count){[string]$gw[0]}else{''};
  [pscustomobject]@{name=[string]$_.InterfaceAlias;link=[string]$_.NetAdapter.Status;ipv4=$localIp;gateway=$gateway}
});
@{items=$items}|ConvertTo-Json -Depth 5 -Compress`;
const FIREWALL = String.raw`$ErrorActionPreference='Stop';
$profiles=@(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object {
  @{name=[string]$_.Name;enabled=[bool]$_.Enabled}
});
@{profiles=$profiles}|ConvertTo-Json -Depth 5 -Compress`;
const EVENTS = String.raw`$ErrorActionPreference='Stop';
$start=(Get-Date).AddHours(-24);
$logs=@();
foreach($name in @('System','Application')){
  $warning=0; $errorCount=0; $reason=''; $good=$true;
  try{
    Get-WinEvent -FilterHashtable @{LogName=$name;StartTime=$start;Level=2,3} -ErrorAction Stop | ForEach-Object {
      if($_.Level -eq 2){$errorCount++}elseif($_.Level -eq 3){$warning++}
    }
  }catch{
    if([string]$_.FullyQualifiedErrorId -notmatch 'NoMatchingEventsFound'){
      $good=$false;
      if([string]$_.CategoryInfo.Category -match 'PermissionDenied|SecurityError'){$reason='ACCESS_DENIED'}
      else{$reason='EVENT_QUERY_FAILED'}
    }
  }
  if($good){$logs+=@{name=$name;status='ok';warning=$warning;error=$errorCount}}
  else{$logs+=@{name=$name;status='unavailable';reason=$reason}}
}
@{logs=$logs}|ConvertTo-Json -Depth 5 -Compress`;

// Exposed for read-only script syntax checks on Windows CI. No command mutates system state.
export const WINDOWS_READ_QUERIES = Object.freeze({network:NETWORK,firewall:FIREWALL,events:EVENTS});
export async function invokePowerShell(script) {
  const {stdout}=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],
    {timeout:9000,windowsHide:true,maxBuffer:65536});
  return JSON.parse(stdout.trim());
}
export function classifySdp({mode,ownedHost=false,identityActive=false,failed=false},at) {
  if(mode==='disconnected')return {status:'disconnected',label:'SDP 미연결',reason:'실제 SDP 호스트 연결 어댑터가 설정되지 않았습니다.',checkedAt:at};
  if(mode==='demo')return {...unavailable('예제 모드는 실제 SDP 서버 연결 근거가 아닙니다.',at),label:'확인 불가'};
  if(mode==='connected'&&ownedHost&&identityActive&&!failed)return {status:'connected',label:'SDP 신원 조회 확인',reason:'구성된 실제 SDP 호스트에서 활성 신원을 조회했습니다. PC 네트워크 연결과는 별개입니다.',checkedAt:at};
  return {...unavailable(failed?'SDP 신원 조회에 실패했으므로 실제 연결 여부를 확정할 수 없습니다.':'SDP 호스트 실연결·활성 신원 검증 근거가 없습니다.',at),label:'확인 불가'};
}
export function localInterfaces(netifs) {
  const list=[];
  for(const [name,rows] of Object.entries(netifs??{})){
    for(const row of Array.isArray(rows)?rows:[]){
      if(row?.internal || (row?.family!=='IPv4'&&row?.family!==4) || typeof row.address!=='string')continue;
      if(list.length>=12)break;
      list.push({name:clampText(name),ipv4:clampText(row.address),gateway:null,link:'unknown'});
    }
  }
  return list;
}
function makeNetwork(interfaces,ps,at){
  if(!interfaces.length)return {...unavailable('루프백 이외의 IPv4 주소를 확인하지 못했습니다. 인터넷 끊김을 의미하지는 않습니다.',at),interfaces:[],link:'unknown'};
  const results=Array.isArray(ps?.items)?ps.items:[];
  const copy=interfaces.map(item=>{
    const details=results.find(row=>row&&row.name===item.name&&row.ipv4===item.ipv4);
    const state=details?.link==='Up'?'up':details?.link==='Disconnected'?'down':'unknown';
    return {...item,link:state,gateway:typeof details?.gateway==='string'&&details.gateway?clampText(details.gateway):null};
  });
  const link=copy.some(x=>x.link==='up')?'up':copy.every(x=>x.link==='down')?'down':'unknown';
  return {status:'ok',interfaces:copy,link,reason:link==='unknown'?'IP 구성을 읽었지만 네트워크 링크 상태는 확인 불가입니다. 인터넷 연결 성공을 뜻하지 않습니다.':'네트워크 어댑터 링크만 확인했습니다. 인터넷·SDP 연결은 별도입니다.',checkedAt:at};
}
function makeFirewall(raw,at){
  const profiles=Array.isArray(raw?.profiles)?raw.profiles:[];
  const approved=['Domain','Private','Public'];
  const cleaned=profiles.filter(x=>approved.includes(x?.name)&&typeof x?.enabled==='boolean')
    .map(x=>({name:x.name,enabled:x.enabled}));
  if(!cleaned.length)return unavailable('방화벽 프로필 응답이 없거나 형식이 올바르지 않습니다.',at);
  return {status:'ok',profiles:cleaned,checkedAt:at,reason:cleaned.length<3?'일부 프로필만 조회됐습니다. 미조회 항목은 확인 불가입니다.':null};
}
function makeEvents(raw,at){
  const rows=Array.isArray(raw?.logs)?raw.logs:[];
  const logs=['System','Application'].map(name=>{
    const match=rows.find(row=>row?.name===name);
    if(match?.status==='ok'&&nonNegative(match.warning)&&nonNegative(match.error))
      return {name,status:'ok',warning:match.warning,error:match.error,checkedAt:at};
    return {name,...unavailable(match?.reason==='ACCESS_DENIED'?'Windows 이벤트 로그 읽기 권한이 부족합니다.':'Windows 이벤트 로그 조회 실패 또는 응답 형식이 올바르지 않습니다.',at)};
  });
  return {status:logs.every(x=>x.status==='ok')?'ok':'partial',logs,periodHours:24,checkedAt:at,note:'Windows System·Application의 경고·오류 건수는 침해나 공격 탐지 결과가 아닙니다.'};
}
export async function readPcConnectivity({
  platform=process.platform,networkInterfaces=()=>os.networkInterfaces(),invoke=(kind,script)=>invokePowerShell(script),now=()=>new Date()
}={}){
  const at=measuredAt(now);
  let interfaces=[];
  try{interfaces=localInterfaces(networkInterfaces());}catch{}
  if(platform!=='win32'){
    return {source:'local-os',demo:false,checkedAt:at,network:makeNetwork(interfaces,null,at),
      firewall:unavailable('Windows 환경이 아니므로 Windows 방화벽을 조회할 수 없습니다.',at),
      events:{status:'partial',logs:['System','Application'].map(name=>({name,...unavailable('Windows 환경이 아니므로 해당 이벤트 로그를 조회할 수 없습니다.',at)})),periodHours:24,checkedAt:at,note:'이 건수는 침해나 공격 탐지 결과가 아닙니다.'}};
  }
  // Each query is independent. Failure of one system API must not turn another result into zero or success.
  const results=await Promise.allSettled([
    invoke('network',NETWORK),invoke('firewall',FIREWALL),invoke('events',EVENTS)
  ]);
  const good=i=>results[i].status==='fulfilled'?results[i].value:null;
  const network=makeNetwork(interfaces,good(0),at);
  if(results[0].status==='rejected'&&network.status==='ok')
    network.reason='IP 정보만 확인했습니다. Windows 어댑터·게이트웨이 정보는 권한 또는 조회 실패로 확인 불가입니다.';
  const firewall=results[1].status==='fulfilled'?makeFirewall(good(1),at):
    unavailable('Windows 방화벽 조회 실패: 권한 부족, 명령 지원 여부 또는 시간 초과를 확인하세요.',at);
  const events=results[2].status==='fulfilled'?makeEvents(good(2),at):
    {status:'partial',logs:['System','Application'].map(name=>({name,...unavailable('Windows 이벤트 로그 조회 실패: 읽기 권한 또는 시간 초과를 확인하세요.',at)})),periodHours:24,checkedAt:at,note:'이 건수는 침해나 공격 탐지 결과가 아닙니다.'};
  return {source:'local-os',demo:false,checkedAt:at,network,firewall,events};
}
