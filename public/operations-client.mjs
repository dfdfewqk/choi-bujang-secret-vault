import {createServerAuthClient} from './auth-client.mjs';
import {signedFetch} from './device-client.mjs';
const deferred=[
 ['4·8 / 타인 메모','다른 시험 계정에서 확인한 메모 ID로 서명 GET','타인 메모 404 · 알려진 타인 ID 필요'],
 ['5 / 원본 DB','브라우저 역할의 원본 DB 직접 조회','거부 · 역할별 운영 재시험 미실행'],
 ['6 / 미등록 기기','공식 엔진의 미등록 기기 요청','거부 · 엔진 실측 미연결'],
 ['7 / 추가 인증','공식 엔진의 이상 접속·재인증 정상 요청','step_up / 재확인 허용 · 미실행'],
 ['9 / 탐지·회수','실제 GET 사건과 신원 회수 후 재요청','회수 제안·집행·재요청 거부 · 미연결'],
 ['10 / 시험 B 복구','B 신규 메모 변조·삭제 복구 후 조회','검증 사본과 ID·owner·hash 일치 · 운영 미실행'],
 ['11 / 서명 변조','서명 후 경로·수정 본문 변경','403 · 운영 HTTPS 변조 재시험 미실행'],
 ['1~11 / 공식 통합','공식 총공세 41종 시험','공식 심판 결과 미연결'],
];
export function mountOperations(root){
 const $=s=>root.querySelector(s),client=createServerAuthClient();let probes=[];
 const say=s=>{$('#operations-state').textContent=s;};
 function row(values,result){const tr=document.createElement('tr');tr.dataset.result=result;for(const v of values){const td=document.createElement('td');td.textContent=String(v??'미제공');tr.append(td);}return tr;}
 function render(records=[]){
  const table=$('#operations-results');table.replaceChildren();
  for(const p of probes)table.append(row([p.stage,p.request+' / 기대 '+p.expected,'HTTP '+p.actual+' · '+(p.match?'기대 일치':'불일치'),p.requestId,p.checkedAt+' / 실제 HTTP 응답 · 감사 저장 '+p.recorded+' · 커밋 '+p.commit],p.match?'matched':'mismatch'));
  for(const r of records)table.append(row(['운영 API / '+r.scope,r.method+' '+r.route+' / '+r.expected,'HTTP '+r.actualStatus+(r.errorCode?' · '+r.errorCode:''),r.requestId,r.checkedAt+' / '+r.source+' · 커밋 '+(r.commit??'미제공')], 'observed'));
  for(const [stage,request,expected] of deferred)table.append(row([stage,request+' / '+expected,'미실행·미연결','—','—'],'unexecuted'));
 }
 async function token(){const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token)throw Error('자료실에서 로그인·기기 승인 후 같은 화면의 작전실 버튼을 사용하세요.');return data.session.access_token;}
 async function refresh(){
  try{
   const response=await signedFetch('/api/operations',{token:await token()});
   if(!response.ok)throw Error('작전실 API HTTP '+response.status);
   const data=await response.json();if(data.schema!=='byteback.operations.v1')throw Error('작전실 응답 형식 오류');
   $('#operations-rules').textContent=data.rules.configured.join(', ');
   $('#operations-policy').textContent='서버 사본 검증: '+data.rules.policyStatus+' · 기준 '+(data.rules.baselineCommit??'미확인');
   $('#operations-detection').textContent=data.detection.rule+' · 최근 10분 계정 API 조회 '+(data.detection.apiReadCount??'미확인')+'건 · 학생 탐지기 '+(data.detection.apiEvaluation?.action??'미실행')+' · 제공 엔진 사건 전달은 미연결';
   $('#operations-revocation').textContent='신원 회수 집행 미연결 · 기기 승인 취소와 별개입니다.';
   $('#operations-devices').textContent=Object.entries(data.revocation.deviceState).map(([k,v])=>k+' '+v).join(' / ');
   $('#operations-recovery').textContent='이 계정 복구 감사 '+data.recovery.completed+'건 · 최신 '+(data.recovery.latestAt??'기록 없음')+' · 버전 '+(data.recovery.latestVersionHash??'기록 없음')+' · 정책 사본 '+(data.rules.backupVersion??'미확인');
   $('#operations-campaign').textContent=data.officialCampaign.note+' 전체 '+data.officialCampaign.total+'종 · 실행/통과 수 미확인';
   $('#operations-record-count').textContent='서버 기록 '+data.totalObservations+'건 중 최근 '+data.observations.length+'건 · 스냅숏 '+data.measuredAt+' · 배포 '+(data.deploymentCommit??'미확인');
   render(data.observations);say('서버 기록을 읽었습니다. 공식 심판 통과를 뜻하지 않습니다.');
  }catch(e){render();say(e.message);}
 }
 async function runProbes(){
  $('#operations-probe').disabled=true;probes=[];
  try{
   const current=await token();
   const cases=[
    {stage:'1 / 공개 자료',request:'GET /data.json',expected:404,run:()=>fetch('/data.json',{cache:'no-store'})},
    {stage:'2 / 무인증',request:'GET /api/notes',expected:401,run:()=>fetch('/api/notes',{cache:'no-store'})},
    {stage:'3 / 잘못된 로그인',request:'GET /api/notes',expected:401,run:()=>fetch('/api/notes',{headers:{Authorization:'Bearer invalid'},cache:'no-store'})},
    {stage:'11 / 서명 없음',request:'GET /api/notes',expected:403,run:()=>fetch('/api/notes',{headers:{Authorization:'Bearer '+current},cache:'no-store'})},
    {stage:'4·11 / 승인 정상',request:'서명 GET /api/notes',expected:200,run:()=>signedFetch('/api/notes',{token:current})},
    {stage:'12 / 작전실 정상',request:'서명 GET /api/operations',expected:200,run:()=>signedFetch('/api/operations',{token:current})},
   ];
   for(const c of cases){
    try{
     const response=await c.run();
     // Never read/display note contents, even if an unexpected response allowed them.
     probes.push({...c,run:undefined,actual:response.status,match:response.status===c.expected,
      requestId:response.headers.get('X-Request-Id')??response.headers.get('x-vercel-id')??'서버 ID 미제공',
      checkedAt:response.headers.get('X-Checked-At')??response.headers.get('Date')??'서버 시각 미제공',
      recorded:response.headers.get('X-Audit-Recorded')??'정적 경로·미제공',commit:response.headers.get('X-Deployment-Commit')??'미제공'});
    }catch{probes.push({...c,run:undefined,actual:'연결 실패',match:false,requestId:'미제공',checkedAt:'미제공',recorded:'미확인',commit:'미확인'});}
   }
   await refresh();
  }catch(e){say(e.message);render();}finally{$('#operations-probe').disabled=false;}
 }
 $('#operations-refresh').addEventListener('click',refresh);$('#operations-probe').addEventListener('click',runProbes);
 render();void refresh();
}
