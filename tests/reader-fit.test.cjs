// Fit must use available desktop space even when it exceeds the base page size.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const elements=new Map();function element(){return {style:{},classList:{toggle(){}},offsetWidth:350,offsetHeight:480,clientWidth:1280,clientHeight:608};}
const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}};
const sandbox={document,getComputedStyle:()=>({zoom:1})};
vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
const reader=Object.create(sandbox.Reader.prototype);Object.assign(reader,{readingView:'spread',position:1,total:5,viewZoom:1,pan:{x:0,y:0},clearCornerPreview(){},renderPdfPages(){}});
const scene=document.querySelector('#scene');
for(const [width,height,single] of [[1280,608,false],[1440,780,false],[1024,428,false],[900,800,false],[390,844,true]]){
 scene.clientWidth=width;scene.clientHeight=height;reader.readingView=single?'single':'spread';reader.mobileReading=single;reader.updateView(true);
 const expected=Math.min((width-(single?12:36))/(350*(single?1:2)),(height-28)/480);
 assert.ok(Math.abs(reader.viewScale-expected)<1e-9,'Fit fills the limiting viewport dimension');
 assert.ok(350*(single?1:2)*reader.viewScale<=width);assert.ok(480*reader.viewScale<=height);
 if(width===1280)assert.ok(reader.viewScale>1.2,'Desktop fit grows beyond the old 100% cap');
}
reader.viewZoom=2;reader.pan={x:1e6,y:-1e6};reader.updateView();assert.ok(reader.viewScale>1);assert.ok(reader.pan.x<1e6&&reader.pan.y>-1e6,'Zoom still constrains panning');
console.log('Fit checks passed: enlarged desktop spreads, narrow/short windows, single-page mobile and bounded zoom.');

// The pan hint adds a toolbar row. Fit must measure after that row is updated.
const hint=document.querySelector('#pan-hint');scene.clientWidth=1280;scene.clientHeight=608;
Object.defineProperty(hint,'hidden',{set(hidden){scene.clientHeight=hidden?608:580;}});
reader.readingView='spread';reader.mobileReading=false;reader.viewZoom=1;reader.updateView(true);assert.ok(Math.abs(reader.viewScale-(608-28)/480)<1e-9);
reader.viewZoom=1.25;reader.updateView(true);assert.ok(Math.abs(reader.viewScale-1.25*(580-28)/480)<1e-9,'Zoom uses the space left by its newly revealed hint');
reader.viewZoom=1;reader.updateView(true);assert.ok(Math.abs(reader.viewScale-(608-28)/480)<1e-9,'Fit reclaims the row hidden by resetting zoom');
