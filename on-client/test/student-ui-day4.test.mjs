import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentView} from '../student/extension.mjs';

class FakeElement {
  constructor(tag){this.tagName=tag;this.textContent='';this.children=[];this.style={};this.attrs={};this.events={};this.disabled=false;this.type='';}
  append(...els){this.children.push(...els);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  addEventListener(type,cb){this.events[type]=cb;}
  focus(){globalThis.document.activeElement=this;}
  findBy(attr,value){if(this.attrs[attr]===value)return this;for(const c of this.children){if(c.findBy){const v=c.findBy(attr,value);if(v)return v;}}return null;}
  lines(){return [this.textContent,...this.children.flatMap(c=>c.lines?.()??[])].join(' ');}
}
const setupDocument=()=>({activeElement:null,createElement:tag=>new FakeElement(tag),querySelector:()=>null});
const asResponse=(kind,n,mode='connected')=>({
 ok:true,
 data:Array.from({length:n},(_,i)=>({id:'id'+i})),
 meta:{mode,checkedAt:'2026-10-28T02:00:00.000Z'}
});
const snapshot=(state='ok')=>({status:state,mode:'connected',data:state==='ok'?[]:undefined,error:state==='error'?{code:'NETWORK_ERROR',message:'네트워크 연결 실패'}:undefined});
async function tick(){for(let n=0;n<15;n++)await Promise.resolve();}
test('three prominent cards appear in the student-owned status slot, not common UI',()=>{
 globalThis.document=setupDocument();
 const view=createStudentView();
 const dom=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'disconnected',diagnostics:{status:'idle'}});
 const section=dom.findBy('data-student-day4-overview','true');
 assert.ok(section);
 const cards=section.findBy('data-student-day4-card','unknown');
 assert.ok(cards);
 assert.match(section.lines(),/1\. 내 기기·세션/);
 assert.match(section.lines(),/2\. 연결·알림/);
 assert.match(section.lines(),/3\. 보안 기록/);
 assert.match(section.lines(),/연결 없음/);
 assert.doesNotMatch(section.lines(),/예시 7건/);
});
test('button is a native keyboard-operable button and no fetch runs before click',async()=>{
 globalThis.document=setupDocument();
 const requested=[];
 const view=createStudentView({api:{get:async url=>{requested.push(url);return asResponse(url.split('/').at(-1),1)}},onChange:()=>{}});
 const root=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'connected',diagnostics:{status:'idle'}});
 const button=root.findBy('data-student-day4-recheck','true');
 assert.equal(button.tagName,'button');
 assert.equal(button.type,'button');
 assert.equal(button.getAttribute('aria-disabled'),'false');
 assert.equal(requested.length,0);
 button.events.click();
 await tick();
 assert.deepEqual(requested,['/api/devices','/api/sessions','/api/events']);
 const later=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'connected',diagnostics:{status:'idle'}});
 assert.match(later.findBy('data-student-day4-overview','true').lines(),/보안 기록.*확인 1건/);
});
test('loading hides previous results and prevents parallel repeated requests',async()=>{
 globalThis.document=setupDocument();
 let done;const promise=new Promise(resolve=>{done=resolve});
 let calls=0;const view=createStudentView({api:{get:()=>{calls++;return promise;}},onChange:()=>{}});
 let root=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'connected'});
 root.findBy('data-student-day4-recheck','true').events.click();
 root=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'connected'});
 const button=root.findBy('data-student-day4-recheck','true');
 assert.equal(button.getAttribute('aria-disabled'),'true');
 assert.match(root.lines(),/조회 중/);
 button.events.click();
 assert.equal(calls,3);
 done(asResponse('devices',1));
 await tick();
});
test('partial failure shows only confirmed results and next action without example or zero',async()=>{
 globalThis.document=setupDocument();
 const view=createStudentView({api:{get:async url=>url==='/api/events'
  ?{ok:false,error:{code:'TIMEOUT',message:'sensitive token'}}
  :asResponse(url.split('/').at(-1),1)},onChange:()=>{}});
 const start=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'connected'});
 start.findBy('data-student-day4-recheck','true').events.click();await tick();
 const section=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'connected'}).findBy('data-student-day4-overview','true');
 assert.match(section.lines(),/보안 기록.*확인 불가/);
 assert.match(section.lines(),/조회하지 못한 항목과 다음 행동/);
 assert.match(section.lines(),/TIMEOUT/);
 assert.match(section.lines(),/로컬 서버 상태/);
 assert.doesNotMatch(section.lines(),/sensitive token|예시 0건/);
});
test('demo is never labeled as actual connected data; malformed coverage is rejected',async()=>{
 globalThis.document=setupDocument();
 const view=createStudentView({api:{get:async path=>path==='/api/events'
   ?{...asResponse('events',2),coverage:{kind:'events',total:999}}
   :asResponse(path.split('/').at(-1),2,'demo')},onChange:()=>{}});
 view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'demo'})
  .findBy('data-student-day4-recheck','true').events.click();
 await tick();
 const s=view.renderStatus({devices:snapshot(),sessions:snapshot(),notifications:[],mode:'demo'})
  .findBy('data-student-day4-overview','true').lines();
 assert.match(s,/예시 데이터/);
 assert.match(s,/응답 또는 조회 범위 검증 실패/);
 assert.doesNotMatch(s,/실제 서버 결과 2건/);
});
