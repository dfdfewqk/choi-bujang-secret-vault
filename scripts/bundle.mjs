import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { RULE_IDS } from '../src/decider.mjs';
import { runStage12PublicReadOnlyChecks } from '../src/stage12-bundle-check.mjs';

const root = resolve(import.meta.dirname, '..');

// Read actual Git HEAD without launching any subprocess. This handles
// detached HEAD, symbolic refs, packed refs and .git worktree pointers.
function gitHead(repoRoot) {
  const entry = join(repoRoot,'.git');
  let directory=entry,head;
  try { head=readFileSync(join(directory,'HEAD'),'utf8').trim(); }
  catch(error) {
    if(error?.code!=='ENOTDIR')throw error;
    const pointer=readFileSync(entry,'utf8').trim();
    const m=/^gitdir: (.+)$/u.exec(pointer);
    if(!m)throw Error('Malformed Git worktree pointer');
    directory=resolve(dirname(entry),m[1]);
    head=readFileSync(join(directory,'HEAD'),'utf8').trim();
  }
  if(/^[a-f0-9]{40,64}$/u.test(head))return head;
  if(!/^ref: refs\/[A-Za-z0-9._/-]+$/u.test(head)||head.includes('..')||head.includes('//'))
    throw Error('Malformed Git HEAD reference');
  const ref=head.slice(5);
  const readRef=(root)=>{
    try{
      const value=readFileSync(join(root,ref),'utf8').trim();
      return /^[a-f0-9]{40,64}$/u.test(value)?value:null;
    }catch(e){if(e?.code==='ENOENT')return null;throw e;}
  };
  const direct=readRef(directory);
  if(direct)return direct;
  let common=directory;
  try {
    const pointer=readFileSync(join(directory,'commondir'),'utf8').trim();
    if(pointer)common=resolve(directory,pointer);
  }catch(e){if(e?.code!=='ENOENT')throw e;}
  const linked=readRef(common);
  if(linked)return linked;
  try {
    const packed=readFileSync(join(common,'packed-refs'),'utf8');
    for(const line of packed.split(/\r?\n/u)){
      const m=/^([a-f0-9]{40,64}) (refs\/[A-Za-z0-9._/-]+)$/u.exec(line);
      if(m?.[2]===ref)return m[1];
    }
  }catch(e){if(e?.code!=='ENOENT')throw e;}
  throw Error('Git reference cannot be resolved');
}

const fail = (message) => { throw new Error(message); };
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\bsk-[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const repository = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})\/?$/iu;
const normalizedRepo = value => {
  const match = typeof value === 'string' && value.length <= 250 && repository.exec(value);
  if (!match) fail('GitHub HTTPS 저장소 주소를 origin으로 등록해 주세요.');
  const repo = match[2].toLowerCase().replace(/\.git$/u, '');
  if (repo === '.' || repo === '..' || repo === '.git' || repo.endsWith('.git')) {
    fail('GitHub HTTPS 저장소 주소를 origin으로 등록해 주세요.');
  }
  return `https://github.com/${match[1].toLowerCase()}/${repo}`;
};

try {
  const commit=gitHead(root);
  // Declared paths are compared with the actual Git diff independently in CI.
  const changedFiles=JSON.parse(readFileSync(
    join(root,'scripts','stage12-changed-files.json'),'utf8'));
  if(!Array.isArray(changedFiles)||!changedFiles.length||changedFiles.length>30
     ||new Set(changedFiles).size!==changedFiles.length
     ||changedFiles.some(path=>typeof path!=='string'
       ||!/^[a-zA-Z0-9_.\/-]{1,120}$/u.test(path)
       ||path.includes('..')||path.startsWith('/')))fail('Invalid changed-file manifest');
  const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
  const repoUrl = normalizedRepo(config.repoUrl);
  // Submissions run on a fresh, restricted checkout. The ignored optional
  // notes file is not part of Git and must not even be opened in this path.
  // Keep truthful submission metadata in committed source instead.
  const notes = {
    explanation: '12단계: 탈환 작전실에 실제 API 기록과 판정·탐지·기기·복구 정보를 연결했습니다. 제출 묶음은 공개 HTTPS GET 8건만 시도하고 실제 응답만 관측합니다. 인증·쓰기·실제 회수·엔진 점검은 not_run으로 둡니다. Git 커밋은 허용된 파일 읽기로 확인하며 자식 프로세스는 실행하지 않습니다. 제공 엔진은 ALEPH SDP 엔진이며 공식 통과를 주장하지 않습니다.',
    blockedAt: 'official_41_tests_and_identity_revocation_not_verified',
  };
  if (!Number.isInteger(config.step) || config.step < 1 || config.step > 12) fail('aleph.config.json의 step을 확인해 주세요.');
  if (config.step >= 3 && (!config.identityProvider || typeof config.identityProvider !== 'object'
      || ['issuer', 'audience', 'jwksUrl'].some((key) => typeof config.identityProvider[key] !== 'string'
        || !config.identityProvider[key].trim()))) {
    fail('3단계부터 aleph.config.json의 identityProvider에 발급자·대상·공개키 주소가 필요합니다. 3단계 제작 2를 다시 확인해 주세요.');
  }
  if (config.step >= 5 && (typeof config.originalApiUrl !== 'string'
      || !config.originalApiUrl.startsWith('https://'))) {
    fail('5단계부터 aleph.config.json의 originalApiUrl에 원본 자료 API의 HTTPS 주소가 필요합니다. 5단계 제작 2를 다시 확인해 주세요.');
  }
  if (config.step >= 3 && (!Array.isArray(config.allowedRoutes) || !config.allowedRoutes.length)) {
    fail('3단계부터 aleph.config.json의 allowedRoutes에 자료 API 경로가 필요합니다. 3단계 제작 3을 다시 확인해 주세요.');
  }
  if (!Array.isArray(RULE_IDS)) fail('src/decider.mjs의 RULE_IDS는 규칙 이름 배열이어야 합니다.');
  const policyRules = [...RULE_IDS];
  if (policyRules.length > 80 || policyRules.some(item => typeof item !== 'string'
      || !/^[a-z][a-z0-9_.-]{0,79}$/iu.test(item)) || new Set(policyRules).size !== policyRules.length) {
    fail('src/decider.mjs의 RULE_IDS 이름과 중복을 확인해 주세요.');
  }
  if (typeof notes.explanation !== 'string' || notes.explanation.trim().length < 10) {
    fail('bundle-notes.json의 explanation에 이번 단계에서 한 일을 세 줄로 적어 주세요.');
  }
  if (config.step !== 12) fail('이번 제출 실행기는 12단계 전용입니다.');
  // The only network probes are the existing anonymous HTTPS GET checks.
  const attackAttempts = await runStage12PublicReadOnlyChecks(config);
  if (!Array.isArray(attackAttempts) || !attackAttempts.length || attackAttempts.length > 20) {
    fail('직접 실행한 공격 점검 결과 1~20개가 필요합니다.');
  }
  for (const attempt of attackAttempts) {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)
        || Object.keys(attempt).sort().join(',') !== 'attackId,expected,observed,result,stage'
        || !Number.isInteger(attempt.stage) || attempt.stage < 1 || attempt.stage > 12
        || !['blocked','breached','not_run'].includes(attempt.result)
        || !/^(not_run|HTTP [1-5][0-9]{2})$/u.test(attempt.observed)
        || (attempt.observed === 'not_run') !== (attempt.result === 'not_run')
        || typeof attempt.attackId !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,79}$/iu.test(attempt.attackId)
        || typeof attempt.expected !== 'string' || !attempt.expected.trim() || attempt.expected.length > 300
        || typeof attempt.observed !== 'string' || !attempt.observed.trim() || attempt.observed.length > 300) {
      fail('공격 점검 결과에는 attackId·stage·expected·observed·result가 필요합니다.');
    }
  }
  if (new Set(attackAttempts.map(item => item.attackId)).size !== attackAttempts.length) {
    fail('공격 점검 ID가 중복되었습니다.');
  }
  const bundle = {
    schema: 'aleph.defense.submission.v2', step: config.step, commit, repoUrl,
    checkedAt: new Date().toISOString(),
    changedFiles, policyRules,
    attackAttempts, explanation: notes.explanation.trim(), blockedAt: notes.blockedAt ?? null,
    identityProvider: config.identityProvider ?? null, allowedRoutes: config.allowedRoutes ?? [],
    originalApiUrl: config.originalApiUrl ?? null, restoreRoute: config.restoreRoute ?? null,
  };
  if (secretPattern.test(JSON.stringify(bundle))) fail('제출 묶음에 비밀값 또는 연락처로 보이는 내용이 있습니다.');
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  const output = join(root, 'artifacts', 'submission.json');
  writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  const unrun = attackAttempts.filter(item => item.observed === 'not_run').length;
  process.stdout.write(`제출 묶음 JSON 생성: ${output}\n단계 ${bundle.step} · 커밋 ${commit.slice(0, 12)} · 바뀐 파일 ${changedFiles.length}개 · 규칙 ${policyRules.length}개 · 점검 기록 ${attackAttempts.length}개 (실측 ${attackAttempts.length - unrun}개 / 미실행 ${unrun}개)\n`);
} catch (error) {
  process.stderr.write(`제출 묶음 생성 중 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
