import {createServerAuthClient} from './auth-client.mjs';
import {signedFetch} from './device-client.mjs';
export function mountAccessCheck(root=document){


  // No Supabase publishable or secret key is included in browser-served files.
  const supabase = createServerAuthClient();
  const $ = selector => root.querySelector(selector);
  const list = $('#check-own-list');
  const feedback = $('#check-result');
  function report(message, kind='info') {
    feedback.textContent=message;
    feedback.dataset.kind=kind;
  }
  async function sessionOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('로그인이 필요합니다. 자료실에서 먼저 로그인해 주세요.');
    return data.session;
  }
  async function getNotes() {
    list.replaceChildren();
    const pending=document.createElement('li');
    pending.textContent='본인 메모를 확인하는 중입니다...';
    list.append(pending);
    try {
      const current=await sessionOrThrow();
      $('#check-account').textContent='로그인됨: '+(current.user?.email ?? '인증된 사용자');
      const response=await signedFetch('/api/notes',{token:current.access_token,method:'GET'});
      if (!response.ok) throw new Error('메모 목록 요청 실패 ('+response.status+')');
      const body=await response.json();
      if (!Array.isArray(body.notes)) throw new Error('메모 목록 형식을 확인할 수 없습니다.');
      list.replaceChildren();
      if (body.notes.length===0) {
        const item=document.createElement('li');
        item.textContent='본인 메모가 없습니다. 자료실에 로그인한 계정을 확인하세요.';
        list.append(item);
      }
      for (const [index, note] of body.notes.entries()) {
        const li=document.createElement('li');
        const title=document.createElement('span');
        title.textContent=(index+1)+'. '+note.title;
        const copy=document.createElement('button');
        copy.type='button';
        copy.className='access-check-copy';
        copy.textContent='ID 복사';
        copy.addEventListener('click',async()=>{
          try {
            await navigator.clipboard.writeText(note.id);
            report('메모 ID를 복사했습니다. 자료실로 돌아가 다른 계정으로 로그인해 주세요.','info');
          } catch {
            report('클립보드 복사가 차단됐습니다. 브라우저의 복사 권한을 확인해 주세요.','error');
          }
        });
        li.append(title,copy);
        list.append(li);
      }
    } catch(error){
      list.replaceChildren();
      const item=document.createElement('li');
      item.textContent=error.message;
      list.append(item);
      $('#check-account').textContent='로그인 확인이 필요합니다.';
    }
  }
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  $('#check-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const id=$('#check-id').value.trim();
    if(!UUID.test(id)){report('메모 ID 형식이 올바르지 않습니다.','error');return;}
    const button=$('#check-submit');
    button.disabled=true;
    report('다른 계정 메모를 읽을 수 있는지 확인하는 중입니다...','info');
    try{
      const current=await sessionOrThrow();
      // Read-only request: never call PUT, POST or DELETE during this inspection.
      const response=await signedFetch('/api/notes/'+id.toLowerCase(),{token:current.access_token,method:'GET'});
      if (response.status===404) {
        report('404 — 메모를 조회할 수 없습니다. 실제 상대 계정의 ID를 입력했다면 접근 차단 성공입니다.','success');
      } else if (response.status===200) {
        report('200 — 현재 계정에서 이 ID에 접근 가능합니다. 본인 메모 ID를 입력했는지 확인해 주세요. 다른 계정의 메모 ID라면 보안 점검이 필요합니다.','error');
      } else {
        report('검사 미완료: 서버 응답 '+response.status+'. 로그인 상태와 사이트 접속을 확인해 주세요.','error');
      }
    }catch(error){report('검사 미완료: '+error.message,'error');}
    finally{button.disabled=false;}
  });
  $('#check-refresh').addEventListener('click',()=>{void getNotes();});
  void getNotes();

}
