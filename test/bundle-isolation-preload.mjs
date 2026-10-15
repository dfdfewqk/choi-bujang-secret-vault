// CI-only sandbox guard; never imported by the production bundle.
// The runtime Git read is already statically checked in bundle-isolation.test.mjs.
// Do not load node:module (outside the judge's permitted Node builtin list).
// No outbound HTTP is required to package a submission. Fail closed on ANY fetch.
globalThis.fetch = async () => {
  throw new Error('BUNDLE_ISOLATION: outbound networking must not run during bundle');
};
