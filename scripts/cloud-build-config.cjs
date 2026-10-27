// Generic build recipe. Project identity is supplied at runtime, never saved here.
const fs = require('node:fs');
const path = require('node:path');
const {gzipSync} = require('node:zlib');
const {assets} = require('./build-hosting.cjs');

const CLI_VERSION = '15.34.1';
const ACCOUNT_ID = 'hosting-deployer';
const DEPLOYER_ROLES = Object.freeze([
  'roles/firebasehosting.admin',
  'roles/serviceusage.apiKeysViewer',
  'roles/logging.logWriter'
]);

function validateProject(project) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project || '')) {
    throw new Error('Pass a valid project ID at runtime.');
  }
  return project;
}

function serviceAccount(project) {
  return `${ACCOUNT_ID}@${validateProject(project)}.iam.gserviceaccount.com`;
}

function createBuild(root, project) {
  validateProject(project);
  // Read allowlisted source files directly. Never upload the repository, a book,
  // generated folders, a working tree archive, credentials or environment files.
  const files = {};
  for (const name of [...assets, 'firebase.json']) {
    const filename = path.join(root, name);
    if (!fs.lstatSync(filename).isFile()) throw new Error(`Asset must be a regular file: ${name}`);
    files[name === 'firebase.json' ? name : `hosting-public/${name}`] = fs.readFileSync(filename).toString('base64');
  }
  const config = JSON.parse(Buffer.from(files['firebase.json'], 'base64'));
  // Prevent a later config change from invoking hooks or publishing another folder.
  if (Object.keys(config).join() !== 'hosting' || Array.isArray(config.hosting) ||
      config.hosting.public !== 'hosting-public' ||
      Object.keys(config.hosting).some(key => !['public', 'ignore', 'headers'].includes(key))) {
    throw new Error('Cloud deploy accepts only the static Hosting configuration, without hooks, sites or rewrites.');
  }
  const bundle = gzipSync(JSON.stringify(files)).toString('base64');
  if (bundle.length > 750000) throw new Error('Public bundle exceeds the inline deployment limit.');
  const unpack = `const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib');
const files=JSON.parse(z.gunzipSync(Buffer.from(process.argv.slice(1).join(''),'base64')));
for(const [name,data] of Object.entries(files)){fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,Buffer.from(data,'base64'));}`;
  return {
    serviceAccount: `projects/${project}/serviceAccounts/${serviceAccount(project)}`,
    timeout: '600s',
    tags: ['hosting-cli'],
    options: {logging: 'CLOUD_LOGGING_ONLY', machineType: 'E2_STANDARD_2'},
    steps: [
      {id: 'public-assets', name: 'node:22-bookworm-slim', entrypoint: 'node', args: ['-e', unpack, ...bundle.match(/.{1,8000}/g)]},
      {
        id: 'firebase-cli-deploy', name: 'node:22-bookworm-slim', entrypoint: 'bash',
        args: ['-euc', `
# Only runtime process settings; /dev/shm is RAM, not a credential file on disk.
unset FIREBASE_TOKEN GOOGLE_APPLICATION_CREDENTIALS
export HOME=/dev/shm/hosting-home
export XDG_CONFIG_HOME=/dev/shm/hosting-config
export XDG_CACHE_HOME=/dev/shm/hosting-cache
export FIREBASE_DEBUG_PATH=/dev/shm/hosting-debug.log
export CI=true
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
trap 'rm -rf /dev/shm/hosting-home /dev/shm/hosting-config /dev/shm/hosting-cache /dev/shm/hosting-debug*.log' EXIT
npm install --prefix /opt/firebase --no-audit --no-fund --ignore-scripts firebase-tools@${CLI_VERSION}
# ADC obtains short-lived tokens from the attached service account metadata.
/opt/firebase/node_modules/.bin/firebase deploy --only hosting --project "$1" --non-interactive
`.replaceAll('$', () => '$$'), 'deploy', '$PROJECT_ID']
      }
    ]
  };
}

module.exports = {CLI_VERSION, ACCOUNT_ID, DEPLOYER_ROLES, validateProject, serviceAccount, createBuild};
