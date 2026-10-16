// Public GET-only synthetic exercise checks. Never accepts request bodies,
// credentials, arbitrary model inputs, account identifiers, or mutation methods.
import {evaluateReadOnlyCase,READ_ONLY_CASES} from '../src/stage12-readonly-fixtures.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const query=req.query??{};
 if(Object.keys(query).length!==1||typeof query.case!=='string'
   ||!READ_ONLY_CASES.includes(query.case))
  return res.status(400).json({error:'INVALID_READ_ONLY_CASE'});
 try{
  const value=await evaluateReadOnlyCase(query.case);
  return res.status(200).json(value);
 }catch{
  return res.status(503).json({error:'READ_ONLY_CHECK_UNAVAILABLE'});
 }
}
