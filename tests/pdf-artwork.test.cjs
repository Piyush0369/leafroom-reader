const assert=require('node:assert/strict');
const {PageArtwork,pdfSnapshot}=require('../paper-turn.js');
const draws=[];let canvas;
global.getComputedStyle=()=>({backgroundColor:'#fcf8ed',backgroundImage:'none',borderLeftWidth:'1px',borderRightWidth:'1px',borderTopWidth:'1px',borderBottomWidth:'1px',borderLeftColor:'#ddd'});
global.document={createElement(tag){assert.equal(tag,'canvas');canvas={width:0,height:0,dataset:{},getContext:()=>({scale(){},fillRect(){},drawImage(...args){draws.push(args);},strokeRect(){}})};return canvas;}};
function face(w,h){const source={width:w,height:h};return {offsetWidth:350,offsetHeight:480,classList:{contains:name=>name==='pdf-page'},querySelector(selector){assert.equal(selector,'canvas:not(.page-artwork)');return source;}};}
(async()=>{
 for(const [w,h] of [[927,1430],[1430,927],[521,714]]){
  const page=face(w,h),result=await PageArtwork.capture(page,3);
  assert.equal(result.dataset.renderer,'pdf','PDFs bypass the foreignObject snapshot');assert.equal(result.width,1050);assert.equal(result.height,1440);
  const [source,x,y,width,height]=draws.at(-1);assert.equal(source.width,w);assert.equal(source.height,h);
  assert.ok(x>=1&&y>=1&&x+width<=349.00001&&y+height<=479.00001,'All source pixels fit inside the page border');
  assert.ok(Math.abs(width/height-w/h)<1e-9,'PDF aspect ratio is preserved');
  assert.ok(Math.abs(width-348)<1e-9||Math.abs(height-478)<1e-9,'The PDF fills its limiting dimension');
 }
 assert.throws(()=>pdfSnapshot(face(0,1430),2),/not ready/,'An evicted or incomplete source cannot install blank cached artwork');
 console.log('PDF artwork checks passed: direct complete-pixel copies, portrait/landscape/split fitting, sharp resolution and empty-source rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
