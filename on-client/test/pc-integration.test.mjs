import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnServer} from '../src/server.mjs';

test('local server serves dashboard and actual metric API without a connected security engine',async()=>{
 const server=createOnServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  const markup=await html.text();
  assert.match(markup,/id="pc-dashboard"/);
  assert.match(markup,/id="pc-cpu"/);
  assert.match(markup,/id="pc-alert"/);
  for(const path of ['/pc-dashboard.js','/pc-dashboard.css']){
   const asset=await fetch(base+path);
   assert.equal(asset.status,200,path);
   assert.ok((await asset.text()).length>200);
  }
  const response=await fetch(base+'/api/pc-status');
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.ok,true);
  assert.equal(payload.data.source,'local-os');
  assert.equal(payload.data.demo,false);
  assert.ok(Number.isFinite(Date.parse(payload.data.measuredAt)));
  for(const key of ['cpu','memory','disk']){
   assert.ok(['ok','unavailable'].includes(payload.data[key].status));
   if(payload.data[key].status==='ok'){
    assert.equal(payload.data[key].unit,'%');
    assert.ok(payload.data[key].value>=0&&payload.data[key].value<=100);
   }else{
    assert.equal(payload.data[key].value,null);
    assert.ok(payload.data[key].reason);
   }
  }
  assert.ok(payload.data.alerts.length>0);
  // Default security adapter still denies real user/security records.
  const events=await fetch(base+'/api/events');
  assert.equal(events.status,503);
 }finally{
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
});
