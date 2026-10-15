// CI-only sandbox guard; never imported by the production bundle.
import subprocess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const exec = subprocess.execFileSync;
subprocess.execFileSync = (command, args, options) => {
  if (command !== 'git' || !Array.isArray(args)
      || args[0] !== 'show' || args.some(arg => typeof arg !== 'string')
      || !args.includes('--name-only') || !args.includes('HEAD')) {
    throw new Error('BUNDLE_ISOLATION: disallowed child process');
  }
  return exec(command, args, options);
};
syncBuiltinESMExports();
// No outbound HTTP is required to package a submission. Fail closed on ANY fetch.
globalThis.fetch = async () => {
  throw new Error('BUNDLE_ISOLATION: outbound networking must not run during bundle');
};
