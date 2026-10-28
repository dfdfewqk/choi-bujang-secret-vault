import os from 'node:os';
import {statfs} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec = promisify(execFile), round = n => Math.round(n * 10) / 10;
const unknown = (reason, at) => ({status:'unavailable',value:null,unit:null,measuredAt:at,reason});
const ok = (value, at, extra={}) => ({status:'ok',value:round(value),unit:'%',measuredAt:at,...extra});
export function cpuPercent(a,b) {
 if(!Array.isArray(a)||!a.length||a.length!==b?.length)return null;
 let total=0,idle=0;
 for(let i=0;i<a.length;i++) {
  if(!a[i]?.times||!b[i]?.times)return null;
  const prev=a[i].times,next=b[i].times;
  const delta=['user','nice','sys','idle','irq'].reduce((v,k)=>v+next[k]-prev[k],0);
  const idleDelta=next.idle-prev.idle;
  if(!Number.isFinite(delta)||delta<0||!Number.isFinite(idleDelta)||idleDelta<0)return null;
  total+=delta;idle+=idleDelta;
 }
 return total>0?Math.max(0,Math.min(100,(1-idle/total)*100)):null;
}
async function diskBytes(path,platform,readFs) {
 try {
  const d=await readFs(path),size=Number(d.bsize),total=size*Number(d.blocks),free=size*Number(d.bavail);
  if(!(Number.isFinite(total)&&total>0&&Number.isFinite(free)&&free>=0&&free<=total))throw Error('INVALID_STATFS');
  return {total,free};
 } catch(e) {
  if(platform!=='win32')throw e;
  const drive=/^([A-Za-z]):[\\/]/.exec(path)?.[1]?.toUpperCase();
  if(!drive)throw Error('MISSING_DRIVE');
  const script='$d=Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='+"'"+drive+":'"+'" -ErrorAction Stop;'+
    'if($null -eq $d){throw "NO_DISK"};@{total=[double]$d.Size;free=[double]$d.FreeSpace}|ConvertTo-Json -Compress';
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:4000,windowsHide:true,maxBuffer:2048});
  const result=JSON.parse(stdout);
  if(!(result.total>0&&result.free>=0&&result.free<=result.total))throw Error('INVALID_DRIVE_INFO');
  return result;
 }
}
export function makeAlerts({cpu,memory,disk},at) {
 const rows=[];
 if(cpu.status==='ok'&&cpu.value>=90)rows.push({level:'warning',code:'CPU_HIGH',message:'이번 CPU 사용률이 90% 이상입니다.',at});
 if(memory.status==='ok'&&memory.value>=90)rows.push({level:'warning',code:'MEMORY_HIGH',message:'이번 메모리 사용률이 90% 이상입니다.',at});
 if(disk.status==='ok'&&(disk.value<10||disk.freeGiB<10))rows.push({level:'warning',code:'DISK_LOW',message:'프로젝트 디스크 여유가 10% 또는 10 GiB 미만입니다.',at});
 for(const [key,m] of Object.entries({cpu,memory,disk}))
  if(m.status!=='ok')rows.push({level:'unknown',code:key.toUpperCase()+'_UNAVAILABLE',message:key+' 확인 불가: '+m.reason,at});
 if(!rows.length)rows.push({level:'normal',code:'THRESHOLD_OK',message:'이번 측정에서 임계값 초과 없음. PC 안전 판정은 아닙니다.',at});
 return rows;
}
export async function readPcStatus({machine=os,fsRead=statfs,diskRead=diskBytes,sleep=ms=>new Promise(r=>setTimeout(r,ms)),dir=process.cwd(),clock=()=>new Date(),source='local-os'}={}) {
 const at=clock().toISOString();
 let cpu,memory,disk;
 try {
  const before=machine.cpus();await sleep(250);
  const value=cpuPercent(before,machine.cpus());
  cpu=value===null?unknown('CPU 측정 표본이 없습니다.',at):ok(value,at);
 }catch{cpu=unknown('CPU 상태를 읽지 못했습니다.',at);}
 try {
  const total=machine.totalmem(),free=machine.freemem();
  if(!(Number.isFinite(total)&&total>0&&Number.isFinite(free)&&free>=0&&free<=total))throw Error('BAD_MEMORY');
  memory=ok(100*(total-free)/total,at,{usedGiB:round((total-free)/2**30),totalGiB:round(total/2**30)});
 }catch{memory=unknown('메모리 상태를 읽지 못했습니다.',at);}
 try {
  const {total,free}=await diskRead(dir,machine.platform(),fsRead);
  disk=ok(100*free/total,at,{freeGiB:round(free/2**30),totalGiB:round(total/2**30),scope:'프로젝트가 위치한 디스크'});
 }catch{disk=unknown('디스크 여유 공간을 읽지 못했습니다.',at);}
 return {source,demo:false,measuredAt:at,cpu,memory,disk,alerts:makeAlerts({cpu,memory,disk},at)};
}
