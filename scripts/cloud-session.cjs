// A one-process OAuth session for submitting Cloud Build jobs. The build itself
// uses the standard Firebase CLI with its attached service account, via ADC.
// No firebase login, gcloud login, ADC JSON, environment file or token argument.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {CLI_VERSION} = require('./cloud-build-config.cjs');

function createSession(cliRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json'), 'utf8'));
  if (pkg.name !== 'firebase-tools' || pkg.version !== CLI_VERSION) {
    throw new Error(`Use the reviewed firebase-tools@${CLI_VERSION} dependency for memory-only sign-in.`);
  }
  const fromCli = createRequire(path.join(cliRoot, 'package.json'));
  const memory = new Map([['usage', false], ['gemini', false]]);
  const store = {
    get: key => memory.get(key), has: key => memory.has(key),
    set(key, value) {
      if (typeof key === 'object') for (const [k, v] of Object.entries(key)) memory.set(k, v);
      else memory.set(key, value);
    },
    delete: key => memory.delete(key), clear: () => memory.clear()
  };
  Object.defineProperty(store, 'all', {get: () => Object.fromEntries(memory)});
  function replace(module, exports) {
    const filename = fromCli.resolve(module);
    if (require.cache[filename]) throw new Error('Sign-in dependency was loaded before the memory store.');
    require.cache[filename] = {id: filename, filename, loaded: true, exports};
  }
  // Install before any auth module is loaded: configstore never touches disk.
  replace('./lib/configstore.js', {configstore: store});
  // Print the official sign-in URL; let the user choose/approve in their browser.
  replace('open', async () => {});
  const {logger} = fromCli('./lib/logger.js');
  const winston = fromCli('winston');
  logger.clear();
  logger.add(new winston.transports.Console({level: 'info', format: winston.format.printf(info => String(info.message || ''))}));
  const auth = fromCli('./lib/auth.js');
  let credentials;
  return {
    async login() { credentials = await auth.loginGoogle(true); },
    async token() {
      if (!credentials?.tokens?.access_token) throw new Error('Sign in first.');
      if (credentials.tokens.expires_at < Date.now() + 60000) {
        credentials.tokens = await auth.getAccessToken(credentials.tokens.refresh_token, credentials.tokens.scopes);
      }
      return credentials.tokens.access_token;
    },
    clear() { if (credentials) credentials.tokens = {}; credentials = undefined; memory.clear(); }
  };
}

module.exports = {createSession};
