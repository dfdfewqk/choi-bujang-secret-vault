import test from 'node:test';
import assert from 'node:assert/strict';
import {readPcConnectivity,classifySdp,localInterfaces} from '../src/pc-connectivity.mjs';
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
