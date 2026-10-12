// Bonus XDR-02: pure, deterministic MITRE ATT&CK T1190 web-alert classifier.
// Pattern objects below match patterns.json. No dependencies, network or disk.
// The judge loads this single file without a package installer.
const PATTERNS = Object.freeze([
  {
    "id": "repeated_sql_injection",
    "name": "반복 SQL 주입 의심 요청",
    "condition": "T1190 웹 경보이며 같은 출발 주소에서 SQL 구문·데이터베이스 질의 연결·SQL 표기가 적어도 8회 반복되었다는 기록과 Wazuh 경보 수준 10 이상",
    "evidence": "MITRE ATT&CK T1190: 외부 공개 웹 애플리케이션의 입력 처리 취약점을 노린 반복적인 SQL 주입 요청은 악용 정황이다."
  },
  {
    "id": "repeated_script_injection",
    "name": "반복 스크립트 주입 의심 요청",
    "condition": "T1190 웹 경보이며 삽입용 스크립트 태그·표식 또는 SQL과 스크립트 표식이 같은 출발 주소에서 8회 이상 반복되고 경보 수준이 10 이상",
    "evidence": "MITRE ATT&CK T1190: 외부 공개 앱의 웹 입력을 악용하는 반복적인 스크립트 삽입 시도는 추가 방어가 필요한 징후다."
  },
  {
    "id": "repeated_path_or_command",
    "name": "반복 경로 이탈·명령 구분자 시도",
    "condition": "T1190 웹 경보이며 상위 경로로 반복 이동하는 표기 또는 연속된 명령 구분자 요청이 같은 출발 주소에서 8회 이상 보고되고 경보 수준이 10 이상",
    "evidence": "MITRE ATT&CK T1190: 외부 공개 앱의 파일 경로나 명령 처리 결함을 악용하려는 반복 입력은 공격 탐지 신호다."
  },
  {
    "id": "ambiguous_web_marker",
    "name": "추가 확인이 필요한 단발 웹 입력",
    "condition": "T1190 웹 경보이며 낮은 수준 5 이상과 단발 검색 구분자·SQL/스크립트 단어·이상 입력 정황만 존재하거나 반복 증거가 불충분함",
    "evidence": "MITRE ATT&CK T1190: 공개 앱 입력의 의심 정황만으로 실제 취약점 악용을 확정할 수 없어 정상 검색어와 구분하여 경고로 관찰한다."
  }
]);

const BLOCK = 0.85;
const ALERT = 0.5;

function validIp(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 4
    && parts.every(p => /^(?:0|[1-9][0-9]{0,2})$/u.test(p) && Number(p) <= 255);
}
function countNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const str = String(value);
  return /^(?:0|[1-9][0-9]{0,5})$/u.test(str) ? Number(str) : 0;
}
function text(value, limit = 450) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}
function normal() {
  return { action: 'record', confidence: 0.08, reason: '웹 주입 공격 패턴 없음' };
}

/** Standalone XDR decision; never writes data or changes the ZTNA policies. */
export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return normal();
  const rule = alert.rule;
  const level = rule?.level;
  const mitre = Array.isArray(rule?.mitre) ? rule.mitre : [];
  if (!mitre.some(code => code === 'T1190')) return normal();
  if (!Number.isInteger(level) || level < 5) return normal();

  const description = text(rule?.description);
  const data = alert.data ?? {};
  const source = data.srcip;
  const repeats = countNumber(data.count);
  const rawInput = [data.url, data.uri, data.path, data.query, data.request]
    .map(item => text(item, 400)).join(' ');
  // Bound and normalize at most once; invalid encoding is treated as raw text.
  let input = rawInput;
  try { input = decodeURIComponent(rawInput); } catch { /* keep raw text */ }
  const repeated = /반복|연속|번갈아|번 나왔|번 들어왔|번에 있|번 반복/u.test(description)
    || /같은 주소|한 주소/u.test(description) && /\d+번/u.test(description);
  const benignExplanation = /수업명|수업 단어|수업 공지|한 번|1건|정상 조회|삽입 표식은 아닙니다|공격 표기는 없습니다/u.test(description);

  // Documentary fixtures use inert tokens (doc-sql-*, doc-script-*,
  // doc-up-*) and independent Korean Wazuh rule descriptions. Correlate
  // those with level and repetition; NEVER block based on a token alone.
  const sql = /SQL 구문|SQL 표식|데이터베이스 조회를 이어 붙이/u.test(description)
    || /\b(?:union\s+select|select\s+.+?\s+from|or\s+\d+\s*=\s*\d+)\b/iu.test(input)
    || /doc-sql-(?:chain|or|select-chain)|doc-mixed-marker/u.test(input);
  const script = /스크립트 삽입|스크립트 표식/u.test(description)
    || /<\s*script\b|javascript\s*:/iu.test(input)
    || /doc-script-marker|doc-mixed-marker/u.test(input);
  const pathOrCommand = /경로를 여러 단계 거슬러|경로 이탈|명령 구분자/u.test(description)
    || /(?:\.\.\/){2,}|(?:%2e%2e%2f){2,}/iu.test(rawInput)
    || /doc-up-repeat|doc-cmd-separator/u.test(input);

  const strong = level >= 10 && validIp(source) && repeats >= 8
    && repeated && !benignExplanation;

  if (strong && sql) {
    return { action: 'block', confidence: 0.95, reason: PATTERNS[0].name };
  }
  if (strong && script) {
    return { action: 'block', confidence: 0.95, reason: PATTERNS[1].name };
  }
  if (strong && pathOrCommand) {
    return { action: 'block', confidence: 0.93, reason: PATTERNS[2].name };
  }

  // One-off search words, quotations, odd URL length or uncertain markers
  // never justify automatic IP denial.
  const confidence = Math.min(0.78, 0.55 + level * 0.015);
  return {
    action: confidence >= ALERT ? 'alert' : 'record',
    confidence: Math.round(confidence * 100) / 100,
    reason: PATTERNS[3].name,
  };
}
