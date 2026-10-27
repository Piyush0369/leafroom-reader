const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../reading-layout.js'),PdfLayout=require('../pdf-layout.js');
assert.equal(L.resolve('auto',390),'single');assert.equal(L.resolve('auto',1280),'spread');
assert.equal(L.resolve('auto',844,true),'single');assert.equal(L.resolve('auto',1024,true),'spread');
assert.equal(L.resolve('spread',390),'spread');assert.equal(L.resolve('single',1280),'single');
assert.equal(L.preference({pdfView:'spread'}),'auto');assert.equal(L.preference({pdfView:'single'}),'single');
assert.equal(L.preference({viewPreference:'auto',pdfView:'single'}),'auto');
assert.equal(L.preference({viewPreference:'spread'}),'spread');
for(let page=1;page<=8;page++){
 const saved=L.anchor(page,9,8,true),spread=L.position(saved,8,5,false);
 assert.equal(spread,Math.floor((page-1)/2)+1);assert.equal(L.position(saved,8,9,true),page);
}
assert.equal(L.restore({position:2,total:5},8,9,true),3);
assert.equal(L.restore({position:0,total:5},8,9,true),0);
assert.equal(L.restore({position:5,total:5},8,9,true),9);
assert.equal(L.position({page:5,pageCount:8},16,17,true),9);
// Exercise the actual reader layout switching and persisted-position mapping.
const controls=new Map(),window={innerWidth:390};let coarse=false;
const sandbox={ReadingLayout:L,PdfLayout,window,matchMedia:()=>({matches:coarse}),document:{querySelector(selector){if(!controls.has(selector))controls.set(selector,{});return controls.get(selector);}}};
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
const r=Object.create(sandbox.Reader.prototype),epub={blocks:[{type:'text'},{type:'image'},{type:'text'}],cover:{src:'cover'}};
Object.assign(r,{viewPreference:'auto',readingView:'spread',position:2,total:5,pages:Array(8).fill('page'),text:'sample',title:'Sample',pdf:null,epub,bookmarks:[{position:2,total:5}]});
r.updateView=r.render=()=>{};
let received;
r.load=(text,title,pdf,book)=>{received={pdf,book};r.readingFocusAnchor=null;r.position=0;r.total=r.isSingle()?9:5;};
r.reflowReadingLayout();assert.equal(r.isSingle(),true);assert.equal(r.position,3);assert.equal(r.savedPosition(r.bookmarks[0]),3);assert.equal(received.book,epub);
r.position=2;r.changeReadingView('spread');assert.equal(r.position,1);assert.equal(r.isSingle(),false);
r.changeReadingView('single');assert.equal(r.position,2);assert.equal(r.pageLabel(),'Page 2 / 8');
window.innerWidth=1280;r.changeReadingView('auto');assert.equal(r.isSingle(),false);
window.innerWidth=390;r.reflowReadingLayout();assert.equal(r.isSingle(),true);assert.equal(r.position,2);
window.innerWidth=844;coarse=true;r.reflowReadingLayout();assert.equal(r.isSingle(),true);
// PDFs retain original source-page anchors as the reading view changes.
r.pdf={};r.pages=Array.from({length:8},(_,i)=>({sourcePage:i+1,half:null}));r.position=4;r.total=9;r.readingFocusAnchor=null;
r.changeReadingView('spread');assert.equal(r.position,2);assert.equal(received.pdf,r.pdf);
r.changeReadingView('single');assert.equal(r.position,4);
console.log('Responsive layout checks passed: mobile defaults, phone landscape, explicit spreads, legacy progress, all-format switching, illustrations, bookmarks and right-page resume.');
