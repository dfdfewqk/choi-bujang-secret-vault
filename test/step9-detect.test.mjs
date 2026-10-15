import assert from 'node:assert/strict';
import {test} from 'node:test';
import {detect} from '../src/detect.mjs';
const BASE=Date.parse('2026-10-01T00:00:00.000Z');
function reads(n,sub='A',interval=2000,start=BASE){
 return Array.from({length:n},(_,i)=>({at:new Date(start+i*interval).toISOString(),
   method:'GET',identity:{sub}}));
}
const observe={action:'observe'};
const revoke=subject=>({action:'propose_revocation',reasonCode:'burst_read',subject});
test('exactly 120 is observe, 121 in ten minutes proposes only',()=>{
 for(const n of [0,1,30,119,120])assert.deepEqual(detect(reads(n)),observe);
 for(const n of [121,200])assert.deepEqual(detect(reads(n)),revoke('A'));
});
test('mixed users are counted independently',()=>{
 assert.deepEqual(detect([...reads(100,'A'),...reads(100,'B')]),observe);
 assert.deepEqual(detect([...reads(121,'A'),...reads(100,'B')]),revoke('A'));
});
test('POST/PUT are not GET, even with spoofed identity fields',()=>{
 const other=[...reads(200)].map(x=>({...x,method:'POST',owner_id:'A'}));
 assert.deepEqual(detect([...reads(120),...other]),observe);
});
test('rolling window finds unaligned burst, but excludes dispersed activity',()=>{
 assert.deepEqual(detect(reads(121,'A',4900,BASE+4*60*1000)),revoke('A'));
 assert.deepEqual(detect(reads(200,'A',7000)),observe);
});
test('600 seconds inclusive, 600 seconds and 1ms exclusive',()=>{
 const base=reads(120,'A',1);
 const evt=t=>({at:new Date(BASE+t).toISOString(),method:'GET',identity:{sub:'A'}});
 assert.deepEqual(detect([...base,evt(600000)]),revoke('A'));
 assert.deepEqual(detect([...base,evt(600001)]),observe);
});
test('unordered input and malformed events cannot change healthy classification',()=>{
 const events=reads(121);
 assert.deepEqual(detect([...events].reverse()),revoke('A'));
 assert.deepEqual(detect([null,{}, {method:'GET',at:'not-date',identity:{sub:'A'}}]),observe);
});
test('one subject in several far-apart windows stays observe',()=>{
 assert.deepEqual(detect([...reads(70),...reads(70,'A',3000,BASE+3600000)]),observe);
});
test('invalid input throws, output shape exact',()=>{
 assert.throws(()=>detect(null),{name:'TypeError'});
 assert.deepEqual(Object.keys(detect(reads(121))).sort(),['action','reasonCode','subject']);
});

test('caller-owned fields such as network, device or claimed role never affect verdict',()=>{
 const good=reads(120,'safe');
 const noisy=good.map(e=>({...e,network:'evil',geo:{region:'unusual'},
   device:{registered:false},role:'admin',body:'not stored',token:'not stored'}));
 assert.deepEqual(detect(noisy),observe);
 assert.deepEqual(detect([...noisy,reads(1,'attacker')[0]]),observe);
 const attack=reads(121,'malicious');
 assert.deepEqual(detect(attack.map(e=>({...e,network:'usual',role:'student'}))),revoke('malicious'));
});
test('when two subjects exceed threshold, results remain stable for shuffled events',()=>{
 const a=reads(121,'alice',2000,BASE+2000);
 const b=reads(121,'bob',2000,BASE);
 assert.deepEqual(detect([...a,...b]),revoke('bob'));
 assert.deepEqual(detect([...b,...a].reverse()),revoke('bob'));
});
