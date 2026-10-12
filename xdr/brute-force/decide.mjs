// Bonus XDR-01: deterministic, standalone MITRE ATT&CK T1110 classifier.
// PATTERNS are embedded verbatim from patterns.json, not loaded at runtime.
// The judge imports ONLY this file. No imports, I/O, network, state, or secrets.
const PATTERNS = Object.freeze([
  {
    "id": "rapid_failures",
    "name": "단시간 동일 출발지 로그인 실패 집중",
    "condition": "T1110, Wazuh rule.level>=10, 로그인 실패 30회 이상이며 단기간·동일 주소·동일 계정·연속 시도의 정황이 명시됨",
    "evidence": "MITRE ATT&CK T1110.001: 반복적인 비밀번호 추측은 짧은 기간 많은 인증 실패를 만들 수 있음."
  },
  {
    "id": "password_spraying",
    "name": "다중 계정 대상 비밀번호 스프레이",
    "condition": "T1110, rule.level>=10, 다수 계정을 대상으로 같은 비밀번호를 적용한 정황(최소 5계정) 또는 많은 계정에 규칙적 실패가 확인됨",
    "evidence": "MITRE ATT&CK T1110.003: 같은 비밀번호를 여러 사용자 계정에 대입하는 시도는 password spraying의 전형적 특징."
  },
  {
    "id": "sequential_guessing",
    "name": "같은 계정에 비밀번호 변화 반복",
    "condition": "T1110, rule.level>=10, 연속 비밀번호 변경 시도와 실패 30회 이상의 구체적 관측값",
    "evidence": "MITRE ATT&CK T1110.001: 체계적으로 여러 비밀번호를 반복 시도하는 행동은 password guessing으로 분류됨."
  },
  {
    "id": "suspicious_login_failure",
    "name": "추가 확인이 필요한 로그인 실패",
    "condition": "T1110 경보, rule.level>=5, 로그인 실패 3회 이상·낯선 주소·잠금 이후 실패 등의 약한 징후만 있고 확정적인 다량 공격 조건은 없음",
    "evidence": "MITRE ATT&CK T1110: 로그인 실패만으로 정당한 사용자와 공격자를 분리할 수 없으므로 추가 경보로만 관찰."
  }
]);

const ACTION_BLOCK = 0.85;
const ACTION_ALERT = 0.5;

function ipv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part =>
    /^(?:0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255);
}
function countNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const text = String(value);
  return /^(?:0|[1-9][0-9]{0,5})$/u.test(text) ? Number(text) : 0;
}
function cleanRecord() {
  return { action: 'record', confidence: 0.1, reason: '해당 공격 패턴 없음' };
}

/** Return exactly { action, confidence, reason }. Safe to call once per alert. */
export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return cleanRecord();
  const level = alert.rule?.level;
  const desc = typeof alert.rule?.description === 'string'
    ? alert.rule.description.slice(0, 500) : '';
  const mitre = Array.isArray(alert.rule?.mitre) ? alert.rule.mitre : [];
  const isT1110 = mitre.some(code => typeof code === 'string'
    && (code === 'T1110' || /^T1110\.00[134]$/u.test(code)));
  const source = alert.data?.srcip;
  const failures = countNumber(alert.data?.count);
  const accountValues = typeof alert.data?.accounts === 'string'
    ? alert.data.accounts.split(',').map(x => x.trim()).filter(x => /^[A-Za-z0-9_.-]{1,64}$/u.test(x)) : [];
  const differentAccounts = new Set(accountValues).size;
  const hasFailures = /로그인 실패|실패/u.test(desc);
  const multiAccounts = /여러 계정|서로 다른 계정|계정\s*\d+개|계정 이름을 바꿔/u.test(desc);
  const samePasswordOrCadence = /같은 비밀번호|같은 간격/u.test(desc);
  const iterativePasswords = /비밀번호를.*바꿔|비밀번호.*한 글자씩/u.test(desc);
  const burstClue = /분 안|분 동안|같은 주소|같은 계정|이어졌|쌓였|성공은 없습니다|로그인 실패.*건/u.test(desc);
  const successObserved = /뒤에\s*성공|성공했습니다|로그인이 성공|성공을 확인/u.test(desc);

  // Source-IP block is allowed only with a valid source and independent
  // high-level Wazuh T1110 evidence. Never block a low-volume or
  // successful login just because the description mentions "password".
  if (isT1110 && Number.isInteger(level) && level >= 10
      && ipv4(source) && !successObserved) {
    if (multiAccounts && samePasswordOrCadence
        && (differentAccounts >= 5 || failures >= 15 || /계정\s*\d+개/u.test(desc))) {
      return { action: 'block', confidence: 0.96, reason: PATTERNS[1].name };
    }
    if (iterativePasswords && hasFailures && failures >= 30) {
      return { action: 'block', confidence: 0.94, reason: PATTERNS[2].name };
    }
    if (hasFailures && failures >= 30 && burstClue) {
      return { action: 'block', confidence: 0.92, reason: PATTERNS[0].name };
    }
  }

  // Missing/ambiguous source details and lower-intensity failures merit an
  // analyst alert, not an automatic network block.
  if (isT1110 && Number.isInteger(level) && level >= 5
      && (hasFailures && failures >= 3
          || /평소와 다른 주소|잠금 뒤|비밀번호 변경 화면/u.test(desc)
          || multiAccounts && hasFailures)) {
    const confidence = Math.min(0.8, 0.54 + level * 0.018);
    return { action: confidence >= ACTION_ALERT ? 'alert' : 'record',
      confidence: Math.round(confidence * 100) / 100,
      reason: PATTERNS[3].name };
  }
  return cleanRecord();
}
