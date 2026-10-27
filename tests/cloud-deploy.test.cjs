const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const {spawnSync} = require('node:child_process');
const {assets} = require('../scripts/build-hosting.cjs');
const {createBuild, serviceAccount, DEPLOYER_ROLES} = require('../scripts/cloud-build-config.cjs');
const {setup, deploy, createApi} = require('../scripts/deploy-cloud.cjs');
const root = path.resolve(__dirname, '..');
const project = 'example-project';

test('inline build contains exactly public assets and a static config, using ADC', () => {
  const before = fs.readdirSync(root);
  const build = createBuild(root, project);
  assert.equal(build.source, undefined, 'No source archive/bucket or repository upload');
  assert.equal(build.secrets, undefined);
  assert.equal(build.availableSecrets, undefined);
  assert.equal(build.substitutions, undefined);
  assert.equal(build.serviceAccount, `projects/${project}/serviceAccounts/${serviceAccount(project)}`);
  assert.equal(build.options.logging, 'CLOUD_LOGGING_ONLY');
  const unpack = build.steps[0];
  const files = JSON.parse(gunzipSync(Buffer.from(unpack.args.slice(2).join(''), 'base64')));
  assert.deepEqual(Object.keys(files).sort(), [...assets.map(name => `hosting-public/${name}`), 'firebase.json'].sort());
  for (const [name, data] of Object.entries(files)) {
    assert.deepEqual(Buffer.from(data, 'base64'), fs.readFileSync(path.join(root, path.basename(name))));
  }
  assert.equal(build.steps[1].args.at(-1), '$PROJECT_ID');
  const shell = build.steps[1].args[1];
  assert.match(shell, /firebase deploy --only hosting --project "\$\$1" --non-interactive/);
  assert.match(shell, /HOME=\/dev\/shm\//);
  assert.match(shell, /unset FIREBASE_TOKEN GOOGLE_APPLICATION_CREDENTIALS/);
  assert.doesNotMatch(shell, /firebase login|gcloud|--token|printenv/);
  // Cloud Build expands $$ to a literal dollar before bash sees the command.
  assert.equal(spawnSync('bash', ['-n'], {input: shell.replaceAll('$$', '$')}).status, 0);
  const unpackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hosting-unpack-'));
  try {
    const result = spawnSync(process.execPath, unpack.args, {cwd: unpackRoot});
    assert.equal(result.status, 0, result.stderr.toString());
    for (const [name, data] of Object.entries(files)) assert.deepEqual(fs.readFileSync(path.join(unpackRoot, name)), Buffer.from(data, 'base64'));
  } finally { fs.rmSync(unpackRoot, {recursive: true, force: true}); }
  assert.deepEqual(fs.readdirSync(root), before, 'Creating the request never saves runtime configuration');
});

test('rejects unsafe project arguments, symlinked assets and deploy hooks', () => {
  assert.throws(() => createBuild(root, 'project; command'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hosting-config-'));
  try {
    for (const name of [...assets, 'firebase.json']) fs.copyFileSync(path.join(root, name), path.join(fixture, name));
    const config = JSON.parse(fs.readFileSync(path.join(fixture, 'firebase.json')));
    config.hosting.predeploy = 'cat private-file';
    fs.writeFileSync(path.join(fixture, 'firebase.json'), JSON.stringify(config));
    assert.throws(() => createBuild(fixture, project), /static Hosting/);
    fs.copyFileSync(path.join(root, 'firebase.json'), path.join(fixture, 'firebase.json'));
    fs.unlinkSync(path.join(fixture, 'index.html'));
    fs.symlinkSync(path.join(root, 'index.html'), path.join(fixture, 'index.html'));
    assert.throws(() => createBuild(fixture, project), /regular file/);
  } finally { fs.rmSync(fixture, {recursive: true, force: true}); }
});

test('missing billing prevents every cloud mutation, including build submission', async () => {
  for (const action of [api => setup(api, project), api => deploy(api, root, project, 'us-central1')]) {
    const calls = [];
    const api = async (...args) => { calls.push(args); return {billingEnabled: false}; };
    await assert.rejects(action(api), /Billing is not enabled/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'cloudbilling');
    assert.equal(calls[0][2], undefined);
  }
});

test('setup preserves IAM policies, conditions and etags, and is idempotent', async () => {
  const member = `serviceAccount:${serviceAccount(project)}`;
  let policy = {version: 3, etag: 'existing-etag', bindings: [
    {role: 'roles/viewer', members: ['group:existing@example.test']},
    {role: DEPLOYER_ROLES[0], members: ['group:conditional@example.test'], condition: {title: 'existing-condition', expression: 'true'}}
  ]};
  const original = structuredClone(policy);
  const calls = [];
  let exists = false;
  const api = async (host, resource, method, body) => {
    calls.push({host, resource, method, body: structuredClone(body)});
    if (host === 'cloudbilling') return {billingEnabled: true};
    if (resource === `v1/projects/${project}`) return {projectNumber: '123456789'};
    if (host === 'serviceusage') return {done: true};
    if (host === 'iam') {
      if (method === 'POST') { exists = true; return {}; }
      return exists ? {} : null;
    }
    if (resource.endsWith(':getIamPolicy')) return structuredClone(policy);
    if (resource.endsWith(':setIamPolicy')) { policy = structuredClone(body.policy); return policy; }
    throw new Error('Unexpected request');
  };
  await setup(api, project);
  assert.deepEqual(policy.bindings.slice(0, 2), original.bindings);
  assert.equal(policy.etag, original.etag);
  assert.equal(policy.version, 3);
  for (const role of DEPLOYER_ROLES) assert.deepEqual(policy.bindings.find(item => item.role === role && !item.condition).members, [member]);
  assert.equal(calls.filter(call => call.resource.endsWith(':setIamPolicy')).length, 1);
  await setup(api, project);
  assert.equal(calls.filter(call => call.resource.endsWith(':setIamPolicy')).length, 1, 'No redundant policy update');
  assert.equal(calls.filter(call => call.host === 'iam' && call.method === 'POST').length, 1, 'Account created once');
  assert.ok(calls.every(call => !/keys|billingAccount|generateAccessToken/.test(call.resource)));
});

test('IAM conflict fails safely and does not overwrite/retry a newer policy', async () => {
  let updates = 0;
  await assert.rejects(setup(async (host, resource) => {
    if (host === 'cloudbilling') return {billingEnabled: true};
    if (resource === `v1/projects/${project}`) return {projectNumber: '123456789'};
    if (host === 'serviceusage') return {done: true};
    if (host === 'iam') return {};
    if (resource.endsWith(':getIamPolicy')) return {etag: 'old', bindings: []};
    if (resource.endsWith(':setIamPolicy')) { updates++; throw new Error('HTTP 409'); }
  }, project), /409/);
  assert.equal(updates, 1);
});

test('submission waits for success and never resubmits failed or uncertain builds', async () => {
  for (const terminal of ['SUCCESS', 'FAILURE', 'UNCERTAIN']) {
    let submits = 0, polls = 0;
    const api = async (host, resource, method) => {
      if (host === 'cloudbilling') return {billingEnabled: true};
      if (host === 'iam') return {};
      if (method === 'POST') { submits++; return terminal === 'UNCERTAIN' ? {} : {metadata: {build: {id: 'build-123'}}}; }
      polls++; return {status: polls === 1 ? 'WORKING' : terminal};
    };
    const run = deploy(api, root, project, 'us-central1', async () => {});
    if (terminal === 'SUCCESS') await run;
    else await assert.rejects(run, terminal === 'UNCERTAIN' ? /Check Cloud Build history/ : /FAILURE/);
    assert.equal(submits, 1);
  }
});

test('HTTP errors do not disclose tokens or raw response bodies', async () => {
  const api = createApi({token: async () => 'test-token-never-log'}, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token-never-log');
    return {status: 403, ok: false, json: () => { throw new Error('Never parse/log error bodies'); }};
  });
  await assert.rejects(api('iam', 'v1/test'), error => /HTTP 403/.test(error.message) && !/test-token/.test(error.message));
  await assert.rejects(api('untrusted-host', 'v1/test'), /Unexpected API destination/);
});
