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

  // Reuse the approved image as a source for separate, transparent SVG
  // scene layers. No credentials, new creatures, or simulated form pixels.
  // Each SVG contains an independent soft mask over the same original pixels.
  const sourceImage = 'data:image/avif;base64,' + encoded;
  function sceneLayer(maskMarkup, layerName) {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="750" height="660" viewBox="0 0 750 660">',
      '<defs>',
      '<filter id="soft" x="-12%" y="-12%" width="124%" height="124%">',
      '<feGaussianBlur stdDeviation="9"/></filter>',
      '<linearGradient id="cityFade" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="white"/>',
      '<stop offset=".18" stop-color="white"/>',
      '<stop offset=".34" stop-color="#252525"/>',
      '<stop offset=".62" stop-color="black"/>',
      '<stop offset=".84" stop-color="#666"/>',
      '<stop offset="1" stop-color="white"/>',
      '</linearGradient>',
      '</defs>',
      '<mask id="layerMask" maskUnits="userSpaceOnUse" x="0" y="0" width="750" height="660">',
      maskMarkup,'</mask>',
      '<image href="', sourceImage, '" width="750" height="660"',
      ' preserveAspectRatio="xMidYMid slice" mask="url(#layerMask)"/>',
      '</svg>'
    ].join('');
  }
  const layers = {
    // Keep only genuine skyline / waterfront pixels; central region is
    // rebuilt as a dark atmospheric fill behind the foreground layers.
    'scene-city.svg':
      '<rect width="750" height="660" fill="url(#cityFade)"/>',
    // Rough translucent silhouette around the original six-character team.
    // A soft mask avoids rigid cutout edges on the hair, water and splashes.
    'scene-monsters.svg':
      '<path d="M-15 73 Q80 32 190 67 Q270 57 340 52 Q480 35 610 65 Q717 67 773 133 L773 258 Q695 276 634 300 Q578 314 542 345 Q466 395 375 436 Q327 460 262 439 Q167 463 66 440 L-15 400 Z" fill="white" filter="url(#soft)"/>',
    // The curved cyan barrier is independently illuminated in CSS.
    'scene-shield.svg':
      '<path d="M231 534 Q289 472 364 415 Q420 358 525 315 Q631 264 775 264 L775 614 Q653 611 563 606 Q460 606 346 581 Q282 563 231 534 Z" fill="white" filter="url(#soft)"/>'
  };
  for (const [filename, maskMarkup] of Object.entries(layers)) {
    await writeFile(resolve(destination, filename), sceneLayer(maskMarkup, filename), 'utf8');
  }
  console.log('3단계: 도시/괴물/방어막 3개 별도 SVG 레이어 생성 완료.');

}
