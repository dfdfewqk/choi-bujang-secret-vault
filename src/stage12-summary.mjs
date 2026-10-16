// Summary of executed student self-check receipts, never an official judge score.
const HTTP=/^HTTP [1-5][0-9]{2}$/u;
export function summarizeStage12Checks(rows,{commit=null,checkedAt=new Date().toISOString(),targetUrl=null}={}){
 if(!Array.isArray(rows)||rows.length<1||rows.length>20)throw Error('INVALID_STAGE12_CHECKS');
 const seen=new Set(),records=[];
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)
   ||typeof row.attackId!=='string'
   ||!/^[a-z0-9][a-z0-9_.-]{0,79}$/u.test(row.attackId)
   ||seen.has(row.attackId))throw Error('INVALID_STAGE12_CASE_ID');
  seen.add(row.attackId);
  const complete=Number.isInteger(row.stage)&&row.stage>=1&&row.stage<=12
   &&typeof row.expected==='string'&&row.expected.trim()
   &&typeof row.observed==='string'
   &&HTTP.test(row.observed)&&['blocked','breached'].includes(row.result);
  const result=complete?row.result:'not_run';
  records.push({attackId:row.attackId,
   stage:row.stage,expected:row.expected,observed:complete?row.observed:'not_run',
   result});
 }
 const blocked=records.filter(r=>r.result==='blocked').length;
 const failed=records.filter(r=>r.result==='breached').length;
 const notRun=records.filter(r=>r.result==='not_run').length;
 return {schema:'aleph.stage12.selfcheck.summary.v1',
  source:'student_public_get_and_fixed_virtual_fixture',
  officialJudgeEvidence:false,checkedAt,commit,targetUrl,
  total:records.length,blocked,failed,notRun,records};
}
