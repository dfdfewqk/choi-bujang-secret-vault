// XDR-02 diagnostic-only projection of Wazuh-style web alerts.
// Do not expose raw logs, URL/query strings, credentials, or arbitrary fields.
// The standalone judge decide.mjs must not import this reader.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURE_URL = new URL('../fixtures/web-injection.json', import.meta.url);
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const account = /^[A-Za-z0-9_.-]{1,64}$/u;
const sensitive = /(?:-----BEGIN|\bBearer\s+|\b(?:password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]|\b(?:sb_secret|sk-)[A-Za-z0-9_-]+|[A-Za-z0-9_-]{45,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/iu;

function safeIp(value) {
  if (typeof value !== 'string' || !ipv4.test(value)) return '[비공개]';
  const parts = value.split('.').map(Number);
  return parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    ? value : '[비공개]';
}
function safeText(value, maxLength) {
  if (typeof value !== 'string' || value.length > maxLength || sensitive.test(value)
      || /[\u0000-\u001f\u007f]/u.test(value)) return '[비밀값 제외]';
  return value;
}

export function projectAlerts(fixture) {
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture?.moduleKey !== 'web-injection' || !Array.isArray(fixture.alerts)) {
    throw new TypeError('invalid_web_injection_fixture');
  }
  return fixture.alerts.map(alert => ({
    timestamp: typeof alert?.timestamp === 'string' && !Number.isNaN(Date.parse(alert.timestamp))
      ? alert.timestamp : '[확인 필요]',
    sourceAddress: safeIp(alert?.data?.srcip),
    account: typeof alert?.data?.srcuser === 'string' && account.test(alert.data.srcuser)
      ? alert.data.srcuser : '[미기록]',
    ruleLevel: Number.isInteger(alert?.rule?.level) && alert.rule.level >= 0
      && alert.rule.level <= 16 ? alert.rule.level : null,
    description: safeText(alert?.rule?.description, 300),
  }));
}

export async function readAlerts({ fixtureUrl = FIXTURE_URL } = {}) {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const lines = projectAlerts(fixture);
  if (lines.length !== fixture.alerts.length) throw new Error('alert_count_mismatch');
  return { inputCount: fixture.alerts.length, lines };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const { inputCount, lines } = await readAlerts();
    console.log('원본 경보: ' + inputCount + ' · 안전한 추출 줄: ' + lines.length);
    for (const line of lines) console.log(JSON.stringify(line));
  } catch {
    console.error('웹 주입 경보 읽기 실패: 원본 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
