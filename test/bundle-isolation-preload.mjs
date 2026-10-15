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
const actualFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const method = options.method ?? 'GET';
  if (url.protocol !== 'https:' || url.username || url.password
      || !['GET','HEAD'].includes(method) || options.body !== undefined) {
    throw new Error('BUNDLE_ISOLATION: disallowed outbound request');
  }
  return actualFetch(input, options);
};
