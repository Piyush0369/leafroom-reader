// Only these application assets may enter the public Firebase deployment.
// Project IDs, credentials, environment files and book files are not needed.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'hosting-public');
const assets = Object.freeze([
  'index.html',
  'reader-ui.css',
  'reader-storage.js',
  'document-import.js',
  'pdf-layout.js',
  'reading-layout.js',
  'view-gestures.js',
  'paper-dynamics.js',
  'paper-surface.js',
  'paper-turn.js',
  'favicon.svg',
  'favicon.ico',
  'favicon-32x32.png',
  'apple-touch-icon.png'
]);

// Check sources before replacing a previously generated deployment folder.
function buildHosting() {
for (const name of assets) {
  if (!fs.lstatSync(path.join(root, name)).isFile()) throw new Error(`Missing application asset: ${name}`);
}
fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for (const name of assets) fs.copyFileSync(path.join(root, name), path.join(output, name));
console.log(`Prepared ${assets.length} application files for Firebase Hosting. No book files included.`);
}

module.exports = {assets, buildHosting};
if (require.main === module) buildHosting();
