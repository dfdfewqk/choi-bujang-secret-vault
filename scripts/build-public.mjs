import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'data.json');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (!Number.isInteger(config.step) || config.step < 1 || config.step > 12) {
  throw new Error('aleph.config.json의 단계는 1~12의 정수여야 합니다.');
}
await mkdir(resolve(root, 'public'), { recursive: true });

if (config.step === 1) {
  const data = JSON.parse(await readFile(source, 'utf8'));
  if (!Array.isArray(data.notes)) {
    throw new Error('1단계 공개 실습 자료 형식을 확인하세요.');
  }
  await copyFile(source, output);
  console.log('1단계: 실습 자료를 공개 정적 파일에 복사했습니다.');
} else {
  // A prior build may leave this file behind. Never publish it in step 2+.
  await rm(output, { force: true });
  console.log('2단계 이후: 공개 data.json을 만들지 않습니다.');
}

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
