// HORSE dashboard; local source only. No example data, cloud upload or saved identifiers.
const area=document.getElementById('pc-dashboard');
if(area){
 const $=id=>document.getElementById('pc-'+id);
 const set=(id,v)=>{$(id).textContent=String(v);};
 const clock=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleTimeString('ko-KR',{hour12:false}):'확인 불가';};
 const history=[];
 const keys=['cpu','memory','disk'];
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
  set('caption',entries.length?'CPU 실측 · '+entries.length+'회 표시 · '+clock(entries.at(-1).measuredAt):'실측 데이터 없음');
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
   record(clock(new Date())+' · 측정 실패: '+e.message);
  }finally{clearTimeout(timeout);loading=false;$('check').disabled=false;}
 }
 $('check').addEventListener('click',check);
 const timer=setInterval(()=>{if(document.visibilityState==='visible')check();},15000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 check();
}
