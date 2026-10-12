// Real external HTTP checks for STEP 2 only. Never print note bodies or server credentials.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (config.step !== 2) throw new Error('This live check applies only to step 2.');

const origin = new URL(config.publicAppUrl);
if (origin.protocol !== 'https:' || origin.pathname !== '/') {
  throw new Error('Invalid production HTTPS origin');
}

const fetchPath = async path => fetch(new URL(path, origin), {
  redirect: 'error', signal: AbortSignal.timeout(12000), cache: 'no-store',
});
const main = await fetchPath('/');
const header = main.headers.get('x-content-type-options');
if (main.status !== 200 || header !== 'nosniff') {
  throw new Error('Home security header check failed: status=' + main.status + ', nosniff=' + (header === 'nosniff'));
}

const dataResponse = await fetchPath('/data.json');
let publicNotesCount = null;
if (dataResponse.status !== 404) {
  let data;
  try { data = await dataResponse.json(); } catch {
    throw new Error('/data.json is not 404 and is not an empty notes JSON');
  }
  publicNotesCount = Array.isArray(data?.notes) ? data.notes.length : null;
  if (publicNotesCount !== 0) throw new Error('/data.json still exposes or fails to classify data; HTTP ' + dataResponse.status);
}

const manifestResponse = await fetchPath('/aleph.json');
if (!manifestResponse.ok) throw new Error('/aleph.json request failed: ' + manifestResponse.status);
const manifest = await manifestResponse.json();
if (manifest.step !== 2 || manifest.schema !== 'aleph.defense.deployment.v1' || manifest.repoUrl !== config.repoUrl) {
  throw new Error('Deployment manifest identity or stage mismatch');
}

const apiResponse = await fetchPath('/api/notes');
if (!apiResponse.ok) throw new Error('/api/notes not ready: HTTP ' + apiResponse.status);
const api = await apiResponse.json();
if (api.sampleMarker !== config.sampleMarker || !Array.isArray(api.notes) || api.notes.length !== 4) {
  throw new Error('/api/notes must return exactly 4 synthetic records');
}
if (apiResponse.headers.get('cache-control') !== 'no-store') {
  throw new Error('/api/notes response must disable caching');
}

const result = {
  productionAppUrl: origin.href,
  home: { httpStatus: main.status, nosniff: true },
  dataJson: { httpStatus: dataResponse.status, publicNoteCount: publicNotesCount ?? 0 },
  alephJson: { httpStatus: manifestResponse.status, step: manifest.step, schema: manifest.schema },
  apiNotes: { httpStatus: apiResponse.status, anonymousSyntheticNoteCount: api.notes.length,
    warning: 'Unauthenticated API access is still possible in step 2.' },
  olderExposure: 'Earlier public Git commits and old deployments can retain synthetic note content.',
};
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(resolve(root, 'artifacts', 'live-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log('LIVE PASS: home HTTP 200 nosniff; /data.json HTTP ' + dataResponse.status
  + ' count 0; /aleph.json step=2; unauthenticated /api/notes count=' + api.notes.length);
