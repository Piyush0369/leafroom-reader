const assert=require('node:assert/strict');
const {PageArtwork,PaperTurn,artworkRatio}=require('../paper-turn.js');
const {surfaceRatio}=require('../paper-surface.js');
for(const [w,h,scale,dpr] of [[300,412,1.26,3],[350,480,1.8,2],[350,480,3,3],[300,412,.5,1],[300,412,3.78,3]]){
 const raster=artworkRatio(w,h,scale,dpr),gpu=surfaceRatio(w*3.2,h*1.8,scale,dpr);
 assert.ok(w*h*raster*raster<=10e6+1);assert.ok(w*3.2*h*1.8*gpu*gpu<=12e6+1);
 assert.ok(w*raster<=4096);assert.ok(h*raster<=4096);
 if(scale*dpr>=2)assert.ok(gpu>2,'High DPI turns must not fall back to the old low resolution');
}
function classes(){const names=new Set();return {contains:n=>names.has(n),add:n=>names.add(n),remove:n=>names.delete(n)};}
function face(){const f={isConnected:true,dataset:{},children:[{classList:classes()}],textContent:'Browser shaped text',offsetWidth:350,offsetHeight:480,classList:classes(),closest:()=>null,querySelectorAll:()=>[],append(c){this.children.push(c);c.parent=this;}};return f;}
function canvas(){return {width:840,height:1152,style:{},classList:{contains:n=>n==='page-artwork'},setAttribute(){},remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}};}
global.window={devicePixelRatio:2};global.getComputedStyle=()=>({borderLeftWidth:'1px',borderTopWidth:'1px'});
(async()=>{
 const originalCapture=PageArtwork.capture;let captures=0,finish;
 PageArtwork.capture=()=>{captures++;return new Promise(resolve=>finish=resolve);};
 const f=face(),first=PageArtwork.prepare(f),same=PageArtwork.prepare(f);assert.equal(first,same,'Concurrent callers share one rasterization');
 const pixels=canvas();finish(pixels);assert.equal(await first,pixels);assert.equal(await PageArtwork.prepare(f),pixels);assert.equal(captures,1);
 assert.equal(f.classList.contains('page-art-ready'),true);assert.equal(pixels.style.cssText.includes('width:350px'),true);
 // A new scale/source invalidates the cache; replaced books cannot install late art.
 f.textContent='New content';const next=PageArtwork.prepare(f);assert.equal(captures,2);assert.equal(f.classList.contains('page-art-ready'),true,'Keep existing artwork during a resolution/content refresh');
 PageArtwork.clear({contains:node=>node===f});const late=canvas();finish(late);assert.equal(await next,null);assert.equal(late.width,0);
 // PDF capture must wait for the final source canvas rather than a loading message.
 const pdf=face();let rendered;pdf.dataset.rendering='true';pdf.pdfRenderTask=new Promise(resolve=>rendered=resolve);
 const waiting=PageArtwork.prepare(pdf);assert.equal(captures,2);delete pdf.dataset.rendering;rendered();await Promise.resolve();assert.equal(captures,3);finish(canvas());await waiting;
 const shared=await PageArtwork.prepare(pdf);
 global.PaperSurface=class{constructor(images){this.images=images;}destroy(){}};global.cancelAnimationFrame=()=>{};
 const turn=await PaperTurn.create({front:pdf,back:pdf});assert.equal(turn.surface.images[0],shared);assert.equal(turn.surface.images[1],shared,'GPU upload samples the exact resting artwork');
 turn.destroy();assert.equal(shared.width,840,'A completed/canceled turn cannot erase the resting page');
 PageArtwork.clear({contains:()=>true});PageArtwork.capture=originalCapture;
 console.log('Shared artwork checks passed: sharp display resolution, bounded pixels, cache reuse, content invalidation, stale cleanup and PDF readiness.');
})().catch(error=>{console.error(error);process.exitCode=1;});
