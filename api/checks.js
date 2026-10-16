// Public self-check summary: no credentials, write requests or official claims.
import config from '../aleph.config.json' with {type:'json'};
import {runStage12PublicReadOnlyChecks} from '../src/stage12-bundle-check.mjs';
import {summarizeStage12Checks} from '../src/stage12-summary.mjs';
import {evaluateReadOnlyCase,READ_ONLY_CASES} from '../src/stage12-readonly-fixtures.mjs';
let cached=null,pending=null;
export default async function handler(req,res,{runChecks=runStage12PublicReadOnlyChecks,now=()=>Date.now()}={}){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const query=req.query??{};
 if(Object.keys(query).length===0){
  try{
   if(runChecks===runStage12PublicReadOnlyChecks&&cached&&now()-cached.at<30000)
    return res.status(200).json(cached.data);
   let work;
   if(runChecks===runStage12PublicReadOnlyChecks&&pending)work=pending;
   else{
    work=(async()=>{
     const checkedAt=new Date(now()).toISOString();
     const checks=await runChecks(config,{concurrency:4});
     const data=summarizeStage12Checks(checks,{
      checkedAt,commit:process.env.VERCEL_GIT_COMMIT_SHA??null,targetUrl:config.publicAppUrl});
     if(runChecks===runStage12PublicReadOnlyChecks)cached={at:now(),data};
     return data;
    })();
    if(runChecks===runStage12PublicReadOnlyChecks)pending=work;
   }
   try{return res.status(200).json(await work);}
   finally{if(pending===work)pending=null;}
  }catch{return res.status(503).json({error:'CHECKS_UNAVAILABLE'});}
 }
 if(Object.keys(query).length!==1||typeof query.case!=='string'
  ||!READ_ONLY_CASES.includes(query.case))
  return res.status(400).json({error:'INVALID_READ_ONLY_CASE'});
 try{
  const result=await evaluateReadOnlyCase(query.case);
  return res.status(200).json(result);
 }catch{return res.status(503).json({error:'READ_ONLY_CHECK_UNAVAILABLE'});}
}
