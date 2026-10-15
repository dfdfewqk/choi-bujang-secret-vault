import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const UUID=/^[a-f0-9-]{36}$/iu;
const routes={
 'notes.collection':'정상 소유자 목록 200 / 인증 실패 401 / 기기·서명 실패 403',
 'notes.item':'본인 자료 200 / 타인·없는 자료 404 / 인증·기기 실패 401·403',
 restore:'서명된 시험 B만 복구 / 사본·소유자·해시 불일치 시 중단',
 device:'검증된 로그인만 요청·조회 / 학생 요청은 승인 대기',
 operations:'검증된 로그인과 승인 기기 서명 확인 후 200',
};
export const routeExpectation=route=>routes[route]??'미등록 경로 거부';
export function auditDatabase(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});}
export function deployedCommit(){const c=process.env.VERCEL_GIT_COMMIT_SHA;return /^[a-f0-9]{40}$/u.test(c??'')?c:null;}
// Observe the actual response. Do not store request headers, query, IDs or payload.
export async function observeApi(request,response,{route,handler,databaseFactory=auditDatabase}={}){
 const requestId=randomUUID(),checkedAt=new Date().toISOString();let owner=null,status=200;
 response.setHeader('X-Request-Id',requestId);response.setHeader('X-Checked-At',checkedAt);
 const commit=deployedCommit();if(commit)response.setHeader('X-Deployment-Commit',commit);
 const output={
  setHeader:(k,v)=>response.setHeader(k,v),
  status(n){status=n;return output;},
  async json(payload){
   let saved=false;
   try{
    const db=databaseFactory();
    const pending=db.rpc('byteback_record_api_observation',{
     p_request:requestId,p_owner:owner,p_method:/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/u.test(request.method??'')?request.method:'OTHER',
     p_route:route,p_status:status,p_error:/^[A-Z][A-Z0-9_]{0,79}$/u.test(payload?.error??'')?payload.error:null,
     p_commit:deployedCommit(),
    });
    const {data,error}=await (typeof pending.abortSignal==='function'?pending.abortSignal(AbortSignal.timeout(3000)):pending);
    saved=!error&&typeof data?.checkedAt==='string';
    if(saved)response.setHeader('X-Checked-At',data.checkedAt);
   }catch{/* A telemetry failure never becomes a fabricated API success. */}
   response.setHeader('X-Audit-Recorded',saved?'true':'false');
   return response.status(status).json(payload);
  },
 };
 return handler(request,output,{onOwnerVerified:value=>{if(UUID.test(value??''))owner=value;}});
}
