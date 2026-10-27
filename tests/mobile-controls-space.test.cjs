// Visible controls reserve measured space, including wrapped PDF tools and insets.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
let bounds={top:0,bottom:844,height:844},header={top:0,bottom:64,height:64},tools={top:64,bottom:126,height:62},dock={top:645,bottom:844,height:199};const vars={};
const root={style:{setProperty:(key,value)=>vars[key]=value},getBoundingClientRect:()=>bounds};
const document={querySelector(selector){return selector==='.reader'?root:{getBoundingClientRect:()=>selector==='header'?header:selector==='.view-controls'?tools:dock};}};
const sandbox={document};vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
const reader=Object.create(sandbox.Reader.prototype);reader.mobileReading=true;reader.controlsVisible=true;
reader.measureMobileControls();assert.equal(vars['--mobile-controls-top'],'134px');assert.equal(vars['--mobile-controls-bottom'],'207px');
assert.ok(parseInt(vars['--mobile-controls-top'])>tools.bottom);assert.ok(bounds.bottom-parseInt(vars['--mobile-controls-bottom'])<dock.top,'The dock cannot cover the reading viewport');
// A smaller phone with a wrapped toolbar gets measured rather than fixed padding.
bounds={top:0,bottom:640,height:640};tools={top:64,bottom:172,height:108};dock={top:410,bottom:640,height:230};
reader.measureMobileControls();assert.equal(vars['--mobile-controls-top'],'180px');assert.equal(vars['--mobile-controls-bottom'],'238px');
assert.ok(bounds.height-180-238>0,'Short phones retain a readable, unclipped viewport');
// Bounds are relative to the reading container, not the top of the window.
bounds={top:30,bottom:874,height:844};header={top:30,bottom:94,height:64};tools={top:94,bottom:156,height:62};dock={top:675,bottom:874,height:199};
reader.measureMobileControls();assert.equal(vars['--mobile-controls-top'],'134px');assert.equal(vars['--mobile-controls-bottom'],'207px');
reader.controlsVisible=false;tools.bottom=300;reader.measureMobileControls();assert.equal(vars['--mobile-controls-top'],'134px','Hidden controls do not change the full-page fit');
console.log('Mobile spacing checks passed: measured header/dock rows, short phones, relative bounds and hidden controls.');
