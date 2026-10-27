// A spread must never expose unrelated co-planar canvas pages after landing.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PaperTurn}=require('../paper-turn.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const sandbox={};vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
function face(surface){const names=new Set();return {surface,classList:{add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n)}};}
const reader=Object.create(sandbox.Reader.prototype);reader.leaves=Array.from({length:7},(_,i)=>({children:[face(i*2),face(i*2+1)]}));reader.position=4;
// At 7–8, sheet 8/9 turns over backgrounds 7 and 10.
assert.deepEqual(Array.from(reader.spreadLayers(1),f=>f.surface),[7,10]);
// At 9–10, the same sheet returns over the same backgrounds.
reader.position=5;assert.deepEqual(Array.from(reader.spreadLayers(-1),f=>f.surface),[7,10]);
const layers=reader.spreadLayers(-1),releasePreview=PaperTurn.retainLayers(layers),releaseTurn=PaperTurn.retainLayers(layers);
assert.ok(layers.every(f=>f.classList.contains('spread-layer')));
releasePreview();releasePreview();assert.ok(layers.every(f=>f.classList.contains('spread-layer')),'Ending an old hover cannot hide a newer turn background');
releaseTurn();assert.ok(layers.every(f=>!f.classList.contains('spread-layer')),'The final owner removes all temporary backgrounds');
reader.position=0;assert.deepEqual(Array.from(reader.spreadLayers(1),f=>f.surface),[2],'Opening the cover has only a right-hand underlay');
reader.position=1;assert.deepEqual(Array.from(reader.spreadLayers(-1),f=>f.surface),[2],'Closing the cover retains the old right-hand page');
console.log('Spread layer checks passed: forward/backward page order, shared hover/turn ownership, idempotent cleanup and cover boundaries.');
