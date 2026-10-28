// HORSE dashboard; local source only. No example data, cloud upload or saved identifiers.
const area=document.getElementById('pc-dashboard');
if(area){
 const $=id=>document.getElementById('pc-'+id);
 const set=(id,v)=>{$(id).textContent=String(v);};
 const clock=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleTimeString('ko-KR',{hour12:false}):'확인 불가';};
 const history=[];
 const keys=['cpu','memory','disk'];
 // Compare consecutive attempts only: a failed measurement must not be skipped.
 const validCpu=sample=>{
  const cpu=sample?.cpu;
  return cpu?.status==='ok' && cpu.unit==='%' && Number.isFinite(cpu.value)
   && cpu.value>=0 && cpu.value<=100 && typeof cpu.measuredAt==='string'
   && Number.isFinite(Date.parse(cpu.measuredAt));
 };
 function compare(previous,current){
  const previousOk=validCpu(previous),currentOk=validCpu(current);
  set('compare-previous',previousOk?previous.cpu.value.toFixed(1)+'%':previous?'확인 불가':'측정 전');
  set('compare-previous-time',previousOk?'실측 · '+clock(previous.cpu.measuredAt)
   :previous?'확인 불가 · '+(previous.cpu?.reason||'직전 측정 실패'):'이전 측정 없음');
  set('compare-current',currentOk?current.cpu.value.toFixed(1)+'%':'확인 불가');
  set('compare-current-time',currentOk?'실측 · '+clock(current.cpu.measuredAt)
   :'확인 불가 · '+(current?.cpu?.reason||'이번 조회 실패'));
  if(previousOk&&currentOk){
   const change=Math.round((current.cpu.value-previous.cpu.value)*10)/10;
   set('compare-delta',(change>0?'+':'')+change.toFixed(1)+'%p');
   set('compare-delta-time',change>0?'직전 대비 증가':change<0?'직전 대비 감소':'직전과 동일');
   set('compare-note','각 값은 실제 CPU 사용률(%)이며, 변화량은 두 비율의 차이(%p)입니다. 네트워크나 측정 실패는 비교하지 않습니다.');
   $('compare-delta-card').dataset.state='ok';
  }else{
   set('compare-delta',previous?'비교 불가':'비교 전');
   set('compare-delta-time',!previous?'첫 측정 이후 비교 가능':
    !currentOk?'이번 CPU 값 확인 불가': '직전 CPU 값 확인 불가');
   set('compare-note',!previous?'이전 측정값이 없으므로 변화량은 표시하지 않습니다.':
    !currentOk?'이번 CPU 값을 읽지 못했습니다. 0%로 대신 계산하지 않습니다.':
    '직전 CPU 값을 읽지 못했습니다. 과거 값을 건너뛰어 비교하지 않습니다.');
   $('compare-delta-card').dataset.state='unknown';
  }
 }
 function record(s){
  const li=document.createElement('li');li.textContent=s;$('logs').prepend(li);
  while($('logs').children.length>30)$('logs').lastElementChild.remove();
 }
 function graph(){
  const svg=$('chart');svg.replaceChildren();
  const make=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));svg.append(e);};
  for(const y of [10,40,70,100])make('line',{x1:20,y1:y,x2:620,y2:y,stroke:'currentColor','stroke-opacity':'.15'});
  const entries=history.slice(-30);
  const line=[];
  const flush=()=>{if(line.length>1)make('polyline',{points:line.join(' '),fill:'none',stroke:'#a085fd','stroke-width':3});line.length=0;};
  entries.forEach((item,index)=>{if(item.cpu.status!=='ok'){flush();return;}line.push((20+600*index/Math.max(entries.length-1,1))+','+(100-item.cpu.value*.9));});
  flush();
  if(entries.length===1&&entries[0].cpu.status==='ok')make('circle',{cx:20,cy:100-entries[0].cpu.value*.9,r:4,fill:'#a085fd'});
  set('caption',entries.length
   ?'CPU 추이 · 최근 '+entries.length+'회 조회 · '+clock(entries.at(-1).measuredAt)
     +(entries.at(-1).cpu?.status==='ok'?' · 실측':' · 마지막 측정 확인 불가')
   :'실측 데이터 없음');
 }
 function render(data){
  if(data?.source!=='local-os'||data.demo!==false)throw Error('실측 출처 검증 실패');
  for(const k of keys){
   const m=data[k],valid=m?.status==='ok'&&Number.isFinite(m.value);
   set(k,valid?m.value.toFixed(1)+'%':'확인 불가');
   const extra=k==='memory'?' · '+m.usedGiB+'/'+m.totalGiB+' GiB':k==='disk'?' · '+m.freeGiB+' GiB 남음':'';
   set(k+'-details',valid?'실측 '+clock(m.measuredAt)+(k==='cpu'?'':extra):'확인 불가 · '+(m?.reason||'결과 없음'));
   $(k+'-card').dataset.state=valid?'ok':'unknown';
  }
  const alerts=Array.isArray(data.alerts)?data.alerts:[];
  const warnings=alerts.filter(x=>x.level==='warning'),unknowns=alerts.filter(x=>x.level==='unknown');
  set('alert',warnings.length?warnings.length+'건 주의':unknowns.length?'일부 확인 불가':'경고 없음');
  set('alert-details',warnings.length?warnings.map(x=>x.message).join(' '):unknowns.length?unknowns.map(x=>x.message).join(' '):'이번 측정 임계값 초과 없음 · 안전 판정 아님');
  $('alert-card').dataset.state=warnings.length?'warning':unknowns.length?'unknown':'ok';
  compare(history.at(-1)??null,data);
  history.push(data);if(history.length>60)history.shift();graph();
  record(clock(data.measuredAt)+' · CPU '+(data.cpu.status==='ok'?data.cpu.value+'%':'확인 불가')+' · 메모리 '+(data.memory.status==='ok'?data.memory.value+'%':'확인 불가')+' · 디스크 여유 '+(data.disk.status==='ok'?data.disk.freeGiB+'GiB':'확인 불가'));
  [...warnings,...unknowns].forEach(x=>record(clock(x.at)+' · '+x.message));
 }
 let loading=false;
 async function check(){
  if(loading)return;loading=true;$('check').disabled=true;set('status','로컬 PC 측정 중');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6500);
  try{
   const response=await fetch('/api/pc-status',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const payload=await response.json();
   if(payload.ok!==true)throw Error('측정 응답 형식 오류');
   render(payload.data);set('status','실측 · '+clock(payload.data.measuredAt)+' · 로컬 PC');
  }catch(e){
   for(const k of keys){set(k,'확인 불가');set(k+'-details','확인 불가 · '+e.message);$(k+'-card').dataset.state='unknown';}
   set('alert','확인 불가');set('alert-details','측정 실패 · 안전하다고 표시하지 않습니다.');set('status','측정 실패 · 예시 값 없음');
   // A failed request breaks the comparison chain and creates a visible gap in the graph.
   const failedAt=new Date().toISOString();
   compare(history.at(-1)??null,{cpu:{status:'unavailable',value:null,reason:'서버 요청 실패: '+e.message}});
   history.push({measuredAt:failedAt,cpu:{status:'unavailable',value:null,reason:'서버 요청 실패'}});
   if(history.length>60)history.shift();
   graph();
   record(clock(failedAt)+' · 측정 실패: '+e.message);
  }finally{clearTimeout(timeout);loading=false;$('check').disabled=false;}
 }
 $('check').addEventListener('click',check);
 const timer=setInterval(()=>{if(document.visibilityState==='visible')check();},15000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 check();
}


// Day 3 - independent manual, read-only Windows connectivity and event overview.
const connectionArea=document.getElementById('pc-connectivity');
if(connectionArea){
 const element=name=>document.getElementById('pc-con-'+name);
 const set=(name,value)=>{element(name).textContent=String(value);};
 const fmt=stamp=>{const d=new Date(stamp);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{hour12:false}):'확인 불가';};
 const list=(name,values)=>{const target=element(name+'-list');target.replaceChildren();for(const value of values){const li=document.createElement('li');li.textContent=value;target.append(li);}};
 function show(data){
  if(data?.source!=='local-os'||data.demo!==false)throw Error('로컬 실측 자료의 출처를 확인할 수 없습니다.');
  set('status','로컬 조회 · '+fmt(data.checkedAt)+' · 관리자 권한 상승 없음');
  const net=data.network;
  if(net?.status==='ok'){
   set('network',net.link==='up'?'네트워크 어댑터 연결':net.link==='down'?'어댑터 연결 끊김':'IP 구성 확인 · 링크 상태 확인 불가');
   set('network-detail',(net.reason||'')+' · 조회 '+fmt(net.checkedAt));
   list('network',(net.interfaces||[]).map(x=>x.name+' · IPv4 '+x.ipv4+' · 링크 '+(x.link==='up'?'연결':x.link==='down'?'끊김':'확인 불가')+' · 게이트웨이 '+(x.gateway||'확인 불가')));
  }else{set('network','확인 불가');set('network-detail',(net?.reason||'조회 실패')+' · '+fmt(net?.checkedAt));list('network',[]);}
  const fw=data.firewall;
  if(fw?.status==='ok'){
   set('firewall','프로필 '+fw.profiles.length+'개 읽음');
   set('firewall-detail',(fw.reason||'Windows 방화벽 설정을 읽기만 했습니다.')+' · '+fmt(fw.checkedAt));
   list('firewall',fw.profiles.map(x=>x.name+' · '+(x.enabled?'켜짐':'꺼짐')));
  }else{set('firewall','확인 불가');set('firewall-detail',(fw?.reason||'조회 실패')+' · '+fmt(fw?.checkedAt));list('firewall',[]);}
  const ev=data.events;
  const logs=Array.isArray(ev?.logs)?ev.logs:[];
  const checked=logs.filter(x=>x.status==='ok');
  set('events',checked.length===2?'System·Application 읽음':checked.length===1?'일부 확인 · 1개 로그':'확인 불가');
  set('events-detail','최근 24시간 · '+fmt(ev?.checkedAt)+' · 침해 탐지 결과 아님');
  list('events',['System','Application'].map(name=>{
   const item=logs.find(x=>x.name===name);
   return item?.status==='ok'?name+' · 경고 '+item.warning+'건 · 오류 '+item.error+'건':
     name+' · 확인 불가 · '+(item?.reason||'조회 결과 없음');
  }));
  const sdp=data.sdp;
  set('sdp',sdp?.status==='disconnected'?'SDP 미연결':sdp?.status==='connected'?'SDP 신원 조회 확인':'확인 불가');
  set('sdp-detail',(sdp?.reason||'SDP 상태 검증 자료 없음')+' · '+fmt(sdp?.checkedAt));
 }
 let busy=false;
 async function refresh(){
  if(busy)return;busy=true;element('check').disabled=true;set('status','네트워크·Windows 이벤트 조회 중');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),13000);
  try{
   const response=await fetch('/api/pc-connectivity',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=await response.json();
   if(body.ok!==true)throw Error('연결 상태 응답 검증 실패');
   show(body.data);
  }catch(error){
   set('status','확인 불가 · '+error.message);
   for(const name of ['network','firewall','events','sdp']){
    set(name,'확인 불가');set(name+'-detail','조회 실패: '+error.message);
   }
   for(const name of ['network','firewall','events'])list(name,[]);
  }finally{clearTimeout(timeout);busy=false;element('check').disabled=false;}
 }
 element('check').addEventListener('click',refresh);
 refresh();
}
