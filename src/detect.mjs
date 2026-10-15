// Stage 9 official DETECT_EVENTS v1: engine-verified at, method, identity.sub only.
// A detection proposes revocation; this pure function never changes accounts.
const WINDOW_MS=10*60*1000, LIMIT=120;
const ISO_UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
export function detect(events) {
  if(!Array.isArray(events))throw new TypeError('invalid_detection_events');
  const bySubject=new Map();
  for(const e of events){
    if(e?.method!=='GET')continue;
    const sub=e?.identity?.sub,t=e?.at;
    if(typeof sub!=='string'||!sub||sub.length>256||
       typeof t!=='string'||!ISO_UTC.test(t))continue;
    const stamp=Date.parse(t);
    if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,19)!==t.slice(0,19))continue;
    if(!bySubject.has(sub))bySubject.set(sub,[]);
    bySubject.get(sub).push(stamp);
  }
  let first=null;
  for(const [subject,times] of bySubject){
    if(times.length<=LIMIT)continue;
    times.sort((a,b)=>a-b);
    let left=0;
    for(let right=0;right<times.length;right++){
      while(times[right]-times[left]>WINDOW_MS)left++;
      if(right-left+1>LIMIT){
        const candidate={time:times[right],subject};
        if(!first||candidate.time<first.time||
          (candidate.time===first.time&&candidate.subject<first.subject))first=candidate;
        break;
      }
    }
  }
  return first?{action:'propose_revocation',reasonCode:'burst_read',subject:first.subject}
    :{action:'observe'};
}
