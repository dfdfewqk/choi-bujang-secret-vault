import test from 'node:test';
import assert from 'node:assert/strict';
import {readPcConnectivity,classifySdp,localInterfaces,WINDOWS_READ_QUERIES} from '../src/pc-connectivity.mjs';
import {execFileSync} from 'node:child_process';
import {createOnServer} from '../src/server.mjs';
const timestamp=()=>new Date('2026-10-28T02:00:00Z');
const adapters=()=>({Ethernet:[{address:'192.0.2.23',family:'IPv4',internal:false}],Loopback:[{address:'127.0.0.1',family:'IPv4',internal:true}]});
const replies={
 network:{items:[{name:'Ethernet',ipv4:'192.0.2.23',gateway:'192.0.2.1',link:'Up'}]},
 firewall:{profiles:[{name:'Domain',enabled:true},{name:'Private',enabled:true},{name:'Public',enabled:false}]},
 events:{logs:[{name:'System',status:'ok',warning:3,error:2},{name:'Application',status:'ok',warning:1,error:0}]}
};
test('separate, read-only network, firewall and Windows event counts',async()=>{
 const calls=[];
 const out=await readPcConnectivity({platform:'win32',networkInterfaces:adapters,now:timestamp,invoke:async(kind,script)=>{
   calls.push({kind,script});
   return replies[kind];
 }});
 assert.equal(out.source,'local-os');
 assert.equal(out.demo,false);
 assert.equal(out.network.link,'up');
 assert.equal(out.network.interfaces[0].gateway,'192.0.2.1');
 assert.deepEqual(out.firewall.profiles.map(x=>x.enabled),[true,true,false]);
 assert.deepEqual(out.events.logs.map(x=>[x.warning,x.error]),[[3,2],[1,0]]);
 assert.match(out.events.note,/침해|공격/);
 assert.equal(out.checkedAt,'2026-10-28T02:00:00.000Z');
 assert.deepEqual(calls.map(x=>x.kind),['network','firewall','events']);
 for(const {script} of calls){
   assert.doesNotMatch(script,/\b(?:Set|New|Remove|Enable|Disable)-[A-Za-z]+/i);
 }
});
test('permission-denied firewall and log do not become zero or off',async()=>{
 const out=await readPcConnectivity({platform:'win32',networkInterfaces:adapters,now:timestamp,
   invoke:async(kind)=>{
     if(kind==='firewall')throw Error('access denied');
     if(kind==='events')return {logs:[{name:'System',status:'unavailable',reason:'ACCESS_DENIED'},{name:'Application',status:'ok',warning:0,error:4}]};
     throw Error('network command unavailable');
   }});
 assert.equal(out.network.status,'ok');assert.equal(out.network.link,'unknown');
 assert.equal(out.firewall.status,'unavailable');assert.equal(out.firewall.profiles,undefined);
 assert.equal(out.events.logs[0].status,'unavailable');assert.equal(out.events.logs[0].warning,undefined);
 assert.equal(out.events.logs[1].error,4);
});
test('unknown Windows log and non-Windows do not fabricate counts',async()=>{
 const d=await readPcConnectivity({platform:'linux',networkInterfaces:adapters,now:timestamp,invoke:()=>{throw Error('should not be called');}});
 assert.equal(d.firewall.status,'unavailable');
 assert.equal(d.events.logs[0].status,'unavailable');
 assert.equal(d.events.logs[0].warning,undefined);
 assert.equal(localInterfaces(adapters()).length,1);
});
test('SDP disconnected is separate from local PC data; adapter alone is not verification',()=>{
 const at='2026-10-28T02:00:00.000Z';
 assert.equal(classifySdp({mode:'disconnected'},at).status,'disconnected');
 assert.equal(classifySdp({mode:'demo'},at).status,'unavailable');
 assert.equal(classifySdp({mode:'connected',ownedHost:false,identityActive:true},at).status,'unavailable');
 assert.equal(classifySdp({mode:'connected',ownedHost:true,failed:true},at).status,'unavailable');
 assert.equal(classifySdp({mode:'connected',ownedHost:true,identityActive:true},at).status,'connected');
});

test('PowerShell Windows read-only scripts parse without invoking any settings changes',{skip:process.platform!=='win32'},()=>{
 for(const [kind,code] of Object.entries(WINDOWS_READ_QUERIES)){
  const encoded=Buffer.from(code,'utf16le').toString('base64');
  const ps='$code=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("'+encoded+'"));$t=$null;$e=$null;' +
    '[System.Management.Automation.Language.Parser]::ParseInput($code,[ref]$t,[ref]$e)|Out-Null;'+
    'if($e.Count -gt 0){throw ($e|Select-Object -First 1).Message};"OK"';
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{timeout:15000,encoding:'utf8',windowsHide:true});
  assert.match(output,/OK/,kind);
 }
});
test('local HTTP endpoint keeps SDP status separate from PC query',async()=>{
 const server=createOnServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(base+'/api/pc-connectivity');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.data.source,'local-os');
  assert.equal(body.data.demo,false);
  assert.equal(body.data.sdp.status,'disconnected');
  assert.equal(body.data.sdp.label,'SDP 미연결');
  assert.ok(Array.isArray(body.data.events.logs));
  assert.match(body.data.events.note,/침해|공격/);
 }finally{
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
});
test('Windows host read-only collection returns independently labeled results',{skip:process.platform!=='win32'},async()=>{
 const data=await readPcConnectivity();
 assert.equal(data.source,'local-os');
 assert.ok(['ok','unavailable'].includes(data.network.status));
 assert.ok(['ok','unavailable'].includes(data.firewall.status));
 assert.equal(data.events.logs.length,2);
 for(const log of data.events.logs){
  assert.ok(['ok','unavailable'].includes(log.status));
  if(log.status==='ok'){assert.ok(Number.isInteger(log.warning)&&Number.isInteger(log.error));}
  else{assert.equal(log.warning,undefined);assert.ok(log.reason);}
 }
});


test('IPv4-based matching works when localized Windows interface alias differs from Node name',async()=>{
 const data=await readPcConnectivity({
   platform:'win32',now:timestamp,
   networkInterfaces:()=>({
     '이더넷 2':[{address:'192.168.100.229',family:'IPv4',internal:false}],
     '이더넷 3':[{address:'169.254.133.19',family:'IPv4',internal:false}]
   }),
   invoke:async kind=>kind==='network'?{items:[
     {name:'Ethernet 2',ipv4:'192.168.100.229',gateway:'192.168.100.1',link:'Up'},
     {name:'Ethernet 3',ipv4:'169.254.133.19',gateway:'',link:'Disconnected'}
   ]}:replies[kind]
 });
 assert.equal(data.network.status,'ok');
 assert.equal(data.network.link,'up');
 assert.deepEqual(data.network.interfaces.map(x=>x.link),['up','down']);
 assert.deepEqual(data.network.interfaces.map(x=>x.gateway),['192.168.100.1','설정되지 않음']);
});
test('unknown link values and unmatched adapters stay unknown; do not invent gateway or connectivity',async()=>{
 const data=await readPcConnectivity({
   platform:'win32',now:timestamp,networkInterfaces:adapters,
   invoke:async kind=>kind==='network'?{items:[
     {name:'Ethernet',ipv4:'198.51.100.99',gateway:'198.51.100.1',link:'Up'}
   ]}:replies[kind]
 });
 assert.equal(data.network.link,'unknown');
 assert.equal(data.network.interfaces[0].link,'unknown');
 assert.equal(data.network.interfaces[0].gateway,null);
 assert.match(data.network.reason,/검증하지 못했습니다/);
});
test('duplicate IPv4 requires an unambiguous interface name before using link and gateway',async()=>{
 const data=await readPcConnectivity({
   platform:'win32',now:timestamp,networkInterfaces:adapters,
   invoke:async kind=>kind==='network'?{items:[
     {name:'Unknown A',ipv4:'192.0.2.23',gateway:'192.0.2.1',link:'Up'},
     {name:'Unknown B',ipv4:'192.0.2.23',gateway:'192.0.2.2',link:'Disconnected'}
   ]}:replies[kind]
 });
 assert.equal(data.network.link,'unknown');
 assert.equal(data.network.interfaces[0].link,'unknown');
 assert.equal(data.network.interfaces[0].gateway,null);
});
test('Get-NetIPConfiguration includes per-address rows and fallback read-only adapter status',()=>{
 assert.match(WINDOWS_READ_QUERIES.network,/Get-NetIPConfiguration -All/);
 assert.match(WINDOWS_READ_QUERIES.network,/Get-NetAdapter -InterfaceIndex/);
 assert.match(WINDOWS_READ_QUERIES.network,/foreach\(\$address in \$ips\)/);
});
