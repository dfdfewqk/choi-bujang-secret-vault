// Shared root-page + detailed operations view for the same public API receipt.
// No inferred successes: failed/missing API clears every displayed number.
export function validateCheckSummary(data){
 if(!data||data.schema!=='aleph.stage12.selfcheck.summary.v1'
  ||data.officialJudgeEvidence!==false
  ||data.source!=='student_public_get_and_fixed_virtual_fixture'
  ||!['total','blocked','failed','notRun'].every(k=>Number.isInteger(data[k])&&data[k]>=0)
  ||data.total!==data.blocked+data.failed+data.notRun
  ||!Array.isArray(data.records)||data.records.length!==data.total
  ||!Number.isFinite(Date.parse(data.checkedAt)))throw Error('invalid_selfcheck_summary');
 const calc={blocked:0,failed:0,notRun:0};
 const ids=new Set();
 for(const row of data.records){
  if(!row||typeof row.attackId!=='string'||ids.has(row.attackId)
   ||!['blocked','breached','not_run'].includes(row.result)
   ||(row.result==='not_run')!==(row.observed==='not_run')
   ||(row.result!=='not_run'&&!/^HTTP [1-5][0-9]{2}$/u.test(row.observed)))
   throw Error('invalid_selfcheck_row');
  ids.add(row.attackId);
  calc[row.result==='blocked'?'blocked':row.result==='breached'?'failed':'notRun']++;
 }
 if(calc.blocked!==data.blocked||calc.failed!==data.failed||calc.notRun!==data.notRun)
  throw Error('inconsistent_selfcheck_summary');
 return data;
}
export async function loadOps(root,{fetcher=globalThis.fetch}={}){
 const stats=root.querySelector('#ops-stats'),meta=root.querySelector('#ops-meta');
 if(!stats||!meta)return;
 const keys=['total','blocked','failed','notRun'];
 const clear=()=>{for(const k of keys){const el=stats.querySelector('[data-k="'+k+'"]');if(el)el.textContent='-';}};
 const rows=root.querySelector('#ops-selfcheck-rows');
 clear();if(rows)rows.replaceChildren();
 meta.textContent='서버 자체 점검 기록을 조회 중입니다.';
 try{
  const response=await fetcher('/api/checks',{cache:'no-store',headers:{accept:'application/json'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=validateCheckSummary(await response.json());
  for(const k of keys){const el=stats.querySelector('[data-k="'+k+'"]');if(el)el.textContent=String(data[k]);}
  meta.textContent='학생 자체 점검 · 응답 시각 '+data.checkedAt+
   ' · 검사 대상 '+(data.targetUrl??'미확인')+
   ' · 배포 커밋 '+(data.commit??'미확인')+' · 공식 41종 결과는 별도입니다.';
  if(rows&&typeof document!=='undefined'){
   for(const result of data.records){
    const tr=document.createElement('tr');
    tr.dataset.result=result.result==='not_run'?'unexecuted':result.result==='breached'?'mismatch':'matched';
    for(const value of [result.stage+' / '+result.attackId,result.expected,
      result.observed,result.result]){
     const td=document.createElement('td');td.textContent=String(value??'미확인');tr.append(td);
    }
    rows.append(tr);
   }
  }
 }catch{
  clear();if(rows)rows.replaceChildren();
  meta.textContent='서버 점검 기록을 확인할 수 없습니다. 확인되지 않은 수치를 표시하지 않습니다.';
 }
}
if(typeof document!=='undefined'&&document.querySelector('#ops'))
 void loadOps(document);
