const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const PdfLayout=require('../pdf-layout.js');
// Cover detection considers actual image-paint operations on page one only.
(async()=>{
 const names=['paintImageXObject','paintInlineImageXObject','paintInlineImageXObjectGroup','paintImageXObjectRepeat','paintImageMaskXObject','paintImageMaskXObjectGroup','paintImageMaskXObjectRepeat'];
 const ops=Object.fromEntries(names.map((name,i)=>[name,80+i]));
 let operations=[],requests=[];
 const pdf={async getPage(page){requests.push(page);return {async getOperatorList(){return {fnArray:operations};}};}};
 for(const name of names){operations=[1,ops[name],22];assert.equal(await PdfLayout.hasCoverImage(pdf,ops),true);}
 operations=[1,22,44];assert.equal(await PdfLayout.hasCoverImage(pdf,ops),false,'Text and vector paths alone retain the default cover');
 assert.ok(requests.every(page=>page===1),'Do not select an illustration from a later page');
 operations=[undefined];assert.equal(await PdfLayout.hasCoverImage(pdf,{}),false);
 assert.equal(await PdfLayout.hasCoverImage({getPage(){throw new Error('Unreadable image');}},ops),false,'Optional detection cannot prevent opening the PDF');
 console.log('Cover detection checks passed: embedded/inline/repeated/masked images, first-page scope, text-only fallback and nonfatal errors.');
})().catch(error=>{console.error(error);process.exitCode=1;});

function element(){
 const node={children:[],dataset:{},style:{setProperty(key,value){this[key]=String(value);},removeProperty(key){delete this[key];}},className:'',setAttribute(){},querySelector(){return element();},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}};
 node.classList={contains:name=>node.className.split(' ').includes(name),add(...names){node.className+=' '+names.join(' ');},toggle(){}};
 return node;
}
const controls=new Map(),sandbox={PdfLayout,document:{createElement:element,querySelector(selector){if(!controls.has(selector))controls.set(selector,element());return controls.get(selector);}},botanical:'<svg></svg>'};
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
const reader=Object.create(sandbox.Reader.prototype);
Object.assign(reader,{book:element(),readingView:'single',pdfSources:[{sourcePage:1,width:600,height:800},{sourcePage:2,width:600,height:800}],pdfMode:'single',generation:0});
reader.clearCornerPreview=reader.updateView=reader.render=()=>{};
reader.paginate=text=>[text];
const cover=()=>reader.leaves[0].children[0];
reader.pdfCover=true;reader.load('','Illustrated PDF',{});
assert.equal(cover().dataset.pdfPage,1);assert.equal(cover().dataset.logicalPage,0);assert.equal(cover().dataset.pdfHalf,'','Cover uses the complete source page even in split layout');
assert.equal(cover().classList.contains('cover'),true);assert.equal(cover().classList.contains('pdf-page'),true);
assert.equal(controls.get('#scene').style['--pdf-page-ratio'],String(600/800));
assert.equal(reader.pages.length,2);assert.equal(reader.leaves[0].children[1].dataset.pdfPage,1,'Original page one remains readable and bookmark positions stay stable');
reader.pdfCover=false;reader.load('','Text PDF',{});assert.equal(cover().dataset.pdfPage,undefined);
reader.pdfCover=true;reader.pdfMode='split';reader.load('','Wide illustrated PDF',{});
assert.equal(cover().dataset.pdfHalf,'');assert.equal(controls.get('#scene').style['--pdf-page-ratio'],String(300/800));assert.equal(reader.pages.length,4);assert.equal(reader.leaves[0].children[1].dataset.pdfHalf,0);
const opening={type:'image',src:'blob:opening',alt:'Opening illustration'},designated={type:'image',src:'blob:designated'};
reader.load('','EPUB',null,{blocks:[opening,{type:'text',text:'Chapter one'}]});
assert.equal(cover().children[0].src,opening.src);assert.equal(reader.pages[0],opening,'Cover fallback must not consume the original image page');
reader.load('','EPUB',null,{cover:designated,blocks:[opening]});assert.equal(cover().children[0].src,designated.src,'Keep a designated EPUB cover');
reader.load('','EPUB',null,{blocks:[{type:'text',text:'Opening text'},opening]});assert.equal(cover().classList.contains('art-cover'),false,'A later illustration is not an opening-page cover');
reader.load('Plain text','TXT');assert.equal(controls.get('#scene').style['--pdf-page-ratio'],undefined,'Switching books restores standard text-page proportions');assert.equal(cover().classList.contains('pdf-page'),false);assert.equal(cover().classList.contains('art-cover'),false,'New books cannot inherit old artwork');
console.log('Reader cover checks passed: PDF full/split pages, intact page counts, EPUB fallback/precedence, text-only books and no inherited cover.');
