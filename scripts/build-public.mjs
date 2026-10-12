import { createHash } from 'node:crypto';
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

if (config.step >= 3) {
  // Original approved screenshot, cropped to the illustrated left hero so no fake form is rendered.
  const encoded = (await readFile(resolve(root, 'assets', 'monster-shield-scene.avif.b64'), 'utf8')).trim();
  const image = Buffer.from(encoded, 'base64');
  const digest = createHash('sha256').update(image).digest('hex');
  const expected = '3f1f02c12f6cca2e29d1c94e3e2ecb4dd7aae370bb5d6d0e319ae05c39c0135c';
  if (digest !== expected || image.length !== 58013) {
    throw new Error('승인된 괴물 이미지 파일이 손상되었습니다. 배포를 중단합니다.');
  }
  const destination = resolve(root, 'public', 'assets');
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, 'monster-shield-scene.avif'), image);
  console.log('3단계: 승인된 괴물·보호막 메인 이미지 생성 완료.');
}
