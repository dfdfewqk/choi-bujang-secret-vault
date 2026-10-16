// CI-only runtime sandbox. NEVER import this from scripts/bundle.mjs.
// Named ESM builtin imports are updated after patching via syncBuiltinESMExports.
import child from 'node:child_process';
import fs from 'node:fs';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(join(root,'aleph.config.json'),'utf8'));
const publicOrigin=new URL(config.publicAppUrl??'https://invalid.example').origin;
if(!publicOrigin.startsWith('https://')||!new URL(publicOrigin).hostname.endsWith('.vercel.app'))
 throw Error('BUNDLE_ISOLATION: public app origin must be a public HTTPS Vercel URL');
const fail=reason=>{throw new Error('BUNDLE_ISOLATION: '+reason);};
const gitArgs=['show','--first-parent','-m','--pretty=format:%H','--name-only','HEAD'];
const allowedGit=(command,args,options)=>command==='git'&&Array.isArray(args)
 &&args.length===gitArgs.length&&args.every((x,i)=>x===gitArgs[i])
 &&options&&resolve(options.cwd??'.')===root;

const realExecFileSync=child.execFileSync;
for(const name of ['execFileSync','execFile','execSync','exec','spawn','spawnSync','fork']){
 child[name]=(...args)=>{
  if(name==='execFileSync'&&allowedGit(args[0],args[1],args[2])){
   process.stderr.write('BUNDLE_ISOLATION: ALLOWED git show (read only)\n');
   return realExecFileSync(...args);
  }
  fail('FORBIDDEN child_process.'+name+' command='+String(args[0]).slice(0,80));
 };
}
const artifacts=join(root,'artifacts'),output=join(artifacts,'submission.json');
// Node 22.23 uses the exported fs.readFileSync during ESM loading.
 // Permit only the real submission import graph, not arbitrary local files.
const allowedRead=new Set([
 join(root,'aleph.config.json'),join(root,'scripts/bundle.mjs'),
 join(root,'src/decider.mjs'),join(root,'src/resource-zones.mjs'),
 join(root,'src/stage12-bundle-check.mjs'),
]);
const diagnosticDir=process.env.BUNDLE_ISOLATION_DIAGNOSTIC==='1'
 &&process.env.BUNDLE_ISOLATION_PROBE_FILE
 ?dirname(resolve(process.env.BUNDLE_ISOLATION_PROBE_FILE)):null;
const pathOf=p=>{
 if(typeof p==='string')return resolve(p);
 if(p instanceof URL&&p.protocol==='file:')return resolve(fileURLToPath(p));
 fail('FORBIDDEN filesystem non-path input');
};
for(const [name,allowed] of [
 ['readFileSync',allowedRead],
 ['mkdirSync',new Set([artifacts])],
 ['writeFileSync',new Set([output])],
]){
 const original=fs[name];
 fs[name]=(...args)=>{
  const path=pathOf(args[0]);
  if(!allowed.has(path)
   &&!(name==='readFileSync'&&diagnosticDir&&path.startsWith(diagnosticDir+'/')))
   fail('FORBIDDEN node:fs.'+name+' path='+path.slice(-100));
  if(name==='mkdirSync'&&args[1]?.recursive!==true)fail('FORBIDDEN mkdir options');
  if(name==='writeFileSync'&&(args[2]?.encoding!=='utf8'||args[2]?.flag!=='w'))
   fail('FORBIDDEN output write options');
  process.stderr.write('BUNDLE_ISOLATION: ALLOWED '+name+' '+
   (name==='readFileSync'?'config':name==='mkdirSync'?'artifacts':'submission.json')+'\n');
  return original(...args);
 };
}
// Other file I/O methods are not required by the submitted module graph.
for(const name of ['open','readFile','writeFile','appendFile','appendFileSync',
 'createReadStream','createWriteStream','rm','rmSync','unlink','unlinkSync','rename',
 'renameSync','copyFile','copyFileSync','cp','cpSync','rmdir','rmdirSync']){
 fs[name]=()=>fail('FORBIDDEN node:fs.'+name);
}
// Node 22 ESM loading may call readFileSync -> openSync('r').
 // Only open the approved source modules, config and temporary test fixture for reading.
const realOpenSync=fs.openSync;
fs.openSync=(...args)=>{
 const path=pathOf(args[0]),flags=args[1];
 if((flags==='r'||flags==='rs'||flags===0)
  &&(allowedRead.has(path)||(diagnosticDir&&path.startsWith(diagnosticDir+'/'))))
  return realOpenSync(...args);
 fail('FORBIDDEN node:fs.openSync');
};
syncBuiltinESMExports();

// The runtime resolver protects both static and dynamically imported modules.
const sourceModules=new Set([
 'scripts/bundle.mjs','src/decider.mjs',
 'src/resource-zones.mjs','src/stage12-bundle-check.mjs',
].map(s=>pathToFileURL(join(root,s)).href));
const builtins=new Set(['node:fs','node:path','node:url','node:child_process','node:crypto']);
// Diagnostic-only fixture folder, never enabled by npm run bundle.
const probeFile=process.env.BUNDLE_ISOLATION_DIAGNOSTIC==='1'
 &&process.env.BUNDLE_ISOLATION_PROBE_FILE
 ?pathToFileURL(resolve(process.env.BUNDLE_ISOLATION_PROBE_FILE)).href:null;
const probeDir=probeFile?probeFile.slice(0,probeFile.lastIndexOf('/')+1):null;
registerHooks({
 resolve(specifier,context,nextResolve){
  const result=nextResolve(specifier,context);
  if(result.url.startsWith('node:')){
   if(!builtins.has(result.url))fail('FORBIDDEN builtin import '+result.url);
  }else if(result.url.startsWith('file:')){
   if(!sourceModules.has(result.url)&&!(probeDir&&result.url.startsWith(probeDir)))
    fail('FORBIDDEN file import '+result.url.slice(-100));
  }else fail('FORBIDDEN module import scheme '+result.url.slice(0,60));
  return result;
 }
});
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 let url;
 try{url=new URL(input instanceof Request?input.url:input);}catch{fail('FORBIDDEN fetch URL');}
 const method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
 if(url.origin!==publicOrigin||url.username||url.password||url.search||url.hash
  ||!['GET','HEAD'].includes(method)||init?.body!=null
  ||(input instanceof Request&&input.body!=null))
  fail('FORBIDDEN fetch '+method+' '+url.origin);
 // Mutation fixture reads return a clearly simulated 204, without networking.
 const allowedPaths=new Set(['/', '/data.json', '/aleph.json', '/api/notes',
  '/api/notes/11111111-1111-4111-8111-111111111111',
  '/api/restore', '/api/device', '/api/operations']);
 if(!allowedPaths.has(url.pathname))fail('FORBIDDEN fetch path '+url.pathname);
 const requestHeaders=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
 if(['authorization','cookie','x-api-key','apikey'].some(key=>requestHeaders.has(key)))
  fail('FORBIDDEN authenticated fetch');
 if(process.env.BUNDLE_ISOLATION_DIAGNOSTIC==='1')return new Response(null,{status:204});
 // The guarded CI invocation is explicitly OFFLINE; the separate npm run bundle
 // step exercises real public GETs. Never turn this synthetic block into a pass.
 throw new Error('BUNDLE_ISOLATION: offline fixture, request not sent');
};
