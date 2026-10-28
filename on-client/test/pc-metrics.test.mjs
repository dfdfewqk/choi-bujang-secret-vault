import test from 'node:test';
import assert from 'node:assert/strict';
import {cpuPercent,readPcStatus,makeAlerts} from '../src/pc-metrics.mjs';
const snap=(idle,busy)=>[{times:{user:busy,nice:0,sys:0,idle,irq:0}}];
test('CPU delta and unavailable samples',()=>{assert.equal(cpuPercent(snap(100,100),snap(150,250)),75);assert.equal(cpuPercent([],[]),null);});
test('metrics are timestamped, not demo',async()=>{
 let n=0;const data=await readPcStatus({machine:{cpus:()=>++n===1?snap(100,100):snap(150,250),totalmem:()=>1000,freemem:()=>250,platform:()=>'linux'},diskRead:async()=>({total:1000,free:250}),sleep:async()=>{},clock:()=>new Date('2026-10-28T00:00:00Z'),source:'fixture'});
 assert.equal(data.demo,false);assert.equal(data.source,'fixture');assert.equal(data.cpu.value,75);assert.equal(data.memory.value,75);assert.equal(data.disk.value,25);assert.equal(data.cpu.unit,'%');assert.equal(data.cpu.measuredAt,'2026-10-28T00:00:00.000Z');
});
test('failed disk measurements remain unknown',async()=>{
 let n=0;const data=await readPcStatus({machine:{cpus:()=>++n===1?snap(100,100):snap(150,250),totalmem:()=>1000,freemem:()=>400,platform:()=>'win32'},diskRead:async()=>{throw Error('denied')},sleep:async()=>{}});
 assert.equal(data.disk.status,'unavailable');assert.equal(data.disk.value,null);assert.equal(data.alerts.some(a=>a.level==='unknown'),true);
});
test('threshold warning rules',()=>{
 const ok=value=>({status:'ok',value,freeGiB:20});
 assert.deepEqual(makeAlerts({cpu:ok(95),memory:ok(91),disk:ok(40)},'t').filter(x=>x.level==='warning').map(x=>x.code),['CPU_HIGH','MEMORY_HIGH']);
 assert.equal(makeAlerts({cpu:ok(10),memory:ok(20),disk:{status:'ok',value:60,freeGiB:5}},'t')[0].code,'DISK_LOW');
});
