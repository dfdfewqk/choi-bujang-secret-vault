import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnServer} from '../src/server.mjs';

test('online HORSE may read only two local PC endpoints via exact trusted origin', async () => {
  const server=createOnServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+server.address().port;
  const allowed='https://horse-dashboard-open-preview.vercel.app';
  try {
    for(const path of ['/api/pc-status','/api/pc-connectivity']){
      const preflight=await fetch(base+path,{method:'OPTIONS',headers:{
        Origin:allowed,'Access-Control-Request-Method':'GET',
        'Access-Control-Request-Private-Network':'true'
      }});
      assert.equal(preflight.status,204);
      assert.equal(preflight.headers.get('access-control-allow-origin'),allowed);
      assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');
      const response=await fetch(base+path,{headers:{Origin:allowed,'Sec-Fetch-Site':'cross-site'}});
      assert.equal(response.status,200,path);
      assert.equal(response.headers.get('access-control-allow-origin'),allowed);
      const value=await response.json();
      assert.equal(value.ok,true);
      assert.equal(value.data.source,'local-os');
      assert.equal(value.data.demo,false);
    }
    for(const path of ['/api/me','/api/events','/api/diagnostics']){
      const denied=await fetch(base+path,{headers:{Origin:allowed,'Sec-Fetch-Site':'cross-site'}});
      assert.equal(denied.status,403,path);
      assert.equal(denied.headers.get('access-control-allow-origin'),null);
    }
    const foreign=await fetch(base+'/api/pc-status',{headers:{
      Origin:'https://evil.example','Sec-Fetch-Site':'cross-site'
    }});
    assert.equal(foreign.status,403);
    assert.equal(foreign.headers.get('access-control-allow-origin'),null);
    const post=await fetch(base+'/api/pc-status',{method:'POST',headers:{
      Origin:allowed,'Sec-Fetch-Site':'cross-site'
    }});
    assert.equal(post.status,403);
    assert.equal(post.headers.get('access-control-allow-origin'),null);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
