// Stage 8 live deployment provenance: no secrets, account tokens, or note data.
// Unlike the previous stage5 smoke check, VERIFY THE DEPLOYED COMMIT,
// not merely the configured stage number.
import {execFileSync} from 'node:child_process';
import config from '../aleph.config.json' with {type:'json'};
const url=new URL('/aleph.json',config.publicAppUrl);
const current=execFileSync('git',['rev-parse','HEAD'],{
 encoding:'utf8',timeout:5000
}).trim().toLowerCase();
const strict=process.argv.includes('--strict');
let state='UNKNOWN',deployed=null;
try{
 const response=await fetch(url,{redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('manifest_http_'+response.status);
 const body=await response.json();
 if(body?.schema!=='aleph.defense.deployment.v1'
    ||body?.step!==config.step||body?.repoUrl!==config.repoUrl
    ||!/^([0-9a-f]{40})$/u.test(body?.commit??'')) {
    throw Error('manifest_identity_mismatch');
 }
 deployed=body.commit;
 state=deployed===current?'CURRENT':'STALE';
}catch(error){
 state='UNVERIFIED';
 console.error('Stage8 live provenance unavailable: '+String(error?.message??error).slice(0,100));
}
console.log(JSON.stringify({
 check:'stage8_live_deployment_provenance',state,
 githubCommit:current.slice(0,12),
 deployedCommit:deployed?.slice(0,12)??null,
 note:'GitHub test success is not proof that the latest server code is deployed',
}));
if(state!=='CURRENT'){
 console.log('::warning::Stage8 code tests passed but the production API commit was NOT verified as current.');
 if(strict)process.exitCode=1;
}
