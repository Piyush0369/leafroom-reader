const path = require('node:path');
const {parseArgs} = require('node:util');
const {setTimeout: delay} = require('node:timers/promises');
const {createBuild, serviceAccount, ACCOUNT_ID, DEPLOYER_ROLES, validateProject} = require('./cloud-build-config.cjs');

// Request and response bodies stay in process memory. Never dump errors which
// might contain HTTP headers, OAuth tokens or account configuration.
function createApi(session, fetcher = fetch) {
  return async function api(host, resource, method = 'GET', body, allow404 = false) {
    if (!['cloudbilling', 'cloudresourcemanager', 'serviceusage', 'iam', 'cloudbuild'].includes(host)) {
      throw new Error('Unexpected API destination.');
    }
    const response = await fetcher(`https://${host}.googleapis.com/${resource}`, {
      method,
      headers: {Authorization: `Bearer ${await session.token()}`, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`${host} request failed (HTTP ${response.status}). Check permissions/API availability in Google Cloud.`);
    return response.status === 204 ? {} : response.json();
  };
}

async function requireBilling(api, project) {
  const billing = await api('cloudbilling', `v1/projects/${project}/billingInfo`);
  if (!billing.billingEnabled) throw new Error('Billing is not enabled. Link billing yourself in Google Cloud before setup/deployment. No billing changes were made.');
}

async function setup(api, project, wait = delay) {
  // Fail before any mutation if billing is missing. This tool cannot link or
  // upgrade billing, create service-account keys, or grant users broader roles.
  await requireBilling(api, project);
  const info = await api('cloudresourcemanager', `v1/projects/${project}`);
  const number = info.projectNumber;
  if (!/^\d+$/.test(number || '')) throw new Error('Project number not available.');
  let operation = await api('serviceusage', `v1/projects/${number}/services:batchEnable`, 'POST', {
    serviceIds: ['cloudbuild.googleapis.com', 'iam.googleapis.com', 'logging.googleapis.com']
  });
  const deadline = Date.now() + 180000;
  while (!operation.done && Date.now() < deadline) {
    await wait(3000);
    operation = await api('serviceusage', `v1/${operation.name}`);
  }
  if (!operation.done || operation.error) throw new Error('Required APIs were not enabled. Check Google Cloud API status.');
  const email = serviceAccount(project);
  const existing = await api('iam', `v1/projects/${project}/serviceAccounts/${email}`, 'GET', undefined, true);
  if (existing?.disabled) throw new Error('The deployer is disabled. Resolve its status before proceeding.');
  if (!existing) await api('iam', `v1/projects/${project}/serviceAccounts`, 'POST', {
    accountId: ACCOUNT_ID,
    serviceAccount: {displayName: 'Hosting CLI deployer', description: 'Keyless Cloud Build deployments to Firebase Hosting only.'}
  });
  // Preserve policy version, conditions, other members and the etag; concurrent
  // policy changes fail safely instead of overwriting somebody else's update.
  const policy = await api('cloudresourcemanager', `v1/projects/${project}:getIamPolicy`, 'POST', {options: {requestedPolicyVersion: 3}});
  const member = `serviceAccount:${email}`;
  policy.bindings ||= [];
  let changed = false;
  for (const role of DEPLOYER_ROLES) {
    let binding = policy.bindings.find(item => item.role === role && !item.condition);
    if (!binding) { binding = {role, members: []}; policy.bindings.push(binding); }
    if (!binding.members.includes(member)) { binding.members.push(member); changed = true; }
  }
  if (changed) await api('cloudresourcemanager', `v1/projects/${project}:setIamPolicy`, 'POST', {policy});
  console.log('Cloud Build APIs and Hosting deployer configured. No keys created. Allow time for IAM propagation before deploying.');
}

async function deploy(api, root, project, region, wait = delay) {
  await requireBilling(api, project);
  const account = await api('iam', `v1/projects/${project}/serviceAccounts/${serviceAccount(project)}`);
  if (account.disabled) throw new Error('The Hosting deployer is disabled.');
  const build = createBuild(root, project);
  const parent = `projects/${project}/locations/${region}`;
  const operation = await api('cloudbuild', `v1/${parent}/builds`, 'POST', build);
  const id = operation.metadata?.build?.id;
  // Never resubmit automatically after an uncertain outcome: it could produce
  // duplicate releases. Cloud Build history provides recovery in that case.
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Build submitted but its ID was not returned. Check Cloud Build history before submitting again.');
  console.log(`Build ${id} submitted. Firebase CLI will deploy Hosting using the attached service account.`);
  const deadline = Date.now() + 12 * 60000;
  let previous;
  while (Date.now() < deadline) {
    const result = await api('cloudbuild', `v1/${parent}/builds/${id}`);
    if (result.status !== previous) { console.log(`Cloud Build: ${result.status}`); previous = result.status; }
    if (result.status === 'SUCCESS') { console.log('Firebase CLI Hosting deployment succeeded.'); return; }
    if (!['STATUS_UNKNOWN', 'PENDING', 'QUEUED', 'WORKING'].includes(result.status)) {
      throw new Error(`Build ${id} ended with ${result.status}. Check its Cloud Build logs; it was not resubmitted.`);
    }
    await wait(5000);
  }
  throw new Error(`Stopped waiting for build ${id}. It may still be running; check Cloud Build history.`);
}

async function main() {
  const {values} = parseArgs({options: {
    project: {type: 'string'}, 'firebase-tools': {type: 'string'},
    region: {type: 'string', default: 'us-central1'}, setup: {type: 'boolean'}, check: {type: 'boolean'}
  }});
  const project = validateProject(values.project);
  if (!values['firebase-tools']) throw new Error('Pass --firebase-tools pointing to the installed firebase-tools package directory.');
  if (!/^[a-z]+-[a-z]+\d$/.test(values.region)) throw new Error('Pass a valid Cloud Build region.');
  if (values.setup && values.check) throw new Error('Choose either --setup or --check.');
  const root = path.resolve(__dirname, '..');
  // Validate all public assets before asking the user to sign in.
  if (!values.setup && !values.check) createBuild(root, project);
  const {createSession} = require('./cloud-session.cjs');
  const session = createSession(path.resolve(values['firebase-tools']));
  const deadline = setTimeout(() => { session.clear(); console.error('Session expired; nothing saved.'); process.exit(1); }, 30 * 60000);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { session.clear(); process.exit(1); });
  try {
    await session.login();
    const api = createApi(session);
    if (values.check) { await requireBilling(api, project); console.log('Billing is enabled. No cloud changes made.'); }
    else if (values.setup) await setup(api, project);
    else await deploy(api, root, project, values.region);
  } finally { session.clear(); clearTimeout(deadline); }
}

module.exports = {createApi, requireBilling, setup, deploy};
if (require.main === module) main().then(() => process.exit(0)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
