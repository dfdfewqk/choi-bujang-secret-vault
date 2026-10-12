// Read-only Wazuh-style fixture projection. Never print raw alert objects.
// This module is diagnostic only: decide.mjs must stay standalone.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURE_URL = new URL('../fixtures/brute-force.json', import.meta.url);
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const account = /^[A-Za-z0-9_.-]{1,64}$/u;
const sensitive = /(?:-----BEGIN|\bBearer\s+|\b(?:password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]|\b(?:sb_secret|sk-)[A-Za-z0-9_-]+|[A-Za-z0-9_-]{45,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/iu;

function safeIp(value) {
  if (typeof value !== 'string' || !ipv4.test(value)) return '[비공개]';
  const parts = value.split('.').map(Number);
  return parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    ? value : '[비공개]';
}
function safeText(value, limit) {
  if (typeof value !== 'string' || value.length > limit || sensitive.test(value)
    || /[\u0000-\u001f\u007f]/u.test(value)) return '[비밀값 제외]';
  return value;
}

export function projectAlerts(input) {
  if (!input || input.schema !== 'aleph.xdr.fixture.v1'
      || input.moduleKey !== 'brute-force' || !Array.isArray(input.alerts)) {
    throw new TypeError('invalid_brute_force_fixture');
  }
  return input.alerts.map(item => ({
    timestamp: typeof item?.timestamp === 'string' && !Number.isNaN(Date.parse(item.timestamp))
      ? item.timestamp : '[확인 필요]',
    sourceAddress: safeIp(item?.data?.srcip),
    account: typeof item?.data?.srcuser === 'string' && account.test(item.data.srcuser)
      ? item.data.srcuser : '[비공개]',
    ruleLevel: Number.isInteger(item?.rule?.level) && item.rule.level >= 0
      && item.rule.level <= 16 ? item.rule.level : null,
    description: safeText(item?.rule?.description, 300),
  }));
}
export async function readAlerts({ fixtureUrl = FIXTURE_URL } = {}) {
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const lines = projectAlerts(raw);
  if (lines.length !== raw.alerts.length) throw new Error('alert_count_mismatch');
  return { inputCount: raw.alerts.length, lines };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { inputCount, lines } = await readAlerts();
    console.log('경보 건수: ' + inputCount + ' · 추출한 줄 수: ' + lines.length);
    for (const item of lines) console.log(JSON.stringify(item));
  } catch {
    console.error('경보 읽기 실패: 원본 형식 또는 접근 권한을 확인하세요.');
    process.exitCode = 1;
  }
}
