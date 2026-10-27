const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../paper-dynamics.js'),{PaperTurn}=require('../paper-turn.js'),{surfaceDirection,deform}=require('../paper-surface.js');
function samples(delta,points){return points.reduce((all,[time,travel])=>D.sampleMotion(all,200-delta*travel,300,time),[]);}
for(const delta of [1,-1]){
 for(const width of [240,390,700]){
  const travel=width*.3,s=samples(delta,[[0,0],[250,travel],[400,travel]]);
  assert.equal(D.swipeRelease(delta,-delta*travel,5,width,s,400).complete,true);
  assert.equal(D.swipeRelease(delta,delta*travel,0,width,s,400).complete,false,'Opposite movement cannot switch direction mid-turn');
 }
 const fast=samples(delta,[[0,0],[20,25],[40,55],[45,55]]);
 assert.equal(D.swipeRelease(delta,-delta*55,5,390,fast,45).complete,true);
 assert.ok(D.swipeRelease(delta,-delta*55,5,390,fast,45).velocity*delta>0);
 const slow=samples(delta,[[0,0],[200,55],[350,55]]);
 assert.equal(D.swipeRelease(delta,-delta*55,5,390,slow,350).complete,false);
 assert.equal(D.swipeRelease(delta,-delta*55,100,390,fast,45).complete,false);
 const reverse=samples(delta,[[0,0],[100,150],[130,110],[150,85]]);
 assert.equal(D.swipeRelease(delta,-delta*85,0,390,reverse,150).complete,false);
 assert.equal(D.swipeRelease(delta,-delta*55,0,390,fast,45,true).complete,false);
}
function node(){const classes=new Set();return {style:{},children:[],classList:{add:(...names)=>names.forEach(c=>classes.add(c)),remove:(...names)=>names.forEach(c=>classes.delete(c)),contains:c=>classes.has(c),toggle(c,on){on?classes.add(c):classes.delete(c);}},append(...children){this.children.push(...children);},setAttribute(){},remove(){this.removed=true;}};}
// The page underneath stays visible from mount through completion/cancellation.
global.document={createElement:node};global.cancelAnimationFrame=()=>{};
for(const delta of [1,-1]){
 const hidden=node(),underlay=node(),book=node(),turn=Object.create(PaperTurn.prototype);
 Object.assign(turn,{options:{book,delta,single:true,hidden,underlay,incoming:delta<0},width:300,height:412,images:[],surface:{canvas:node(),destroy(){}},seek(){}});
 turn.mount();assert.ok(turn.overlay.style.cssText.includes('left:0px'));assert.equal(underlay.classList.contains('paper-hidden'),false);assert.equal(hidden.classList.contains('paper-hidden'),true);assert.equal(underlay.classList.contains('single-underlay'),true);
 turn.destroy();assert.equal(hidden.classList.contains('paper-hidden'),false);assert.equal(underlay.classList.contains('single-underlay'),false);
}
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),sandbox={document:{querySelectorAll:()=>[]},matchMedia:()=>({matches:false})};
vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
(async()=>{
 const faces=Array.from({length:6},node),reader=Object.create(sandbox.Reader.prototype);
 Object.assign(reader,{readingView:'single',position:2,total:5,generation:1,busy:false,book:{querySelector(s){return faces[Number(s.match(/\d+/)[0])];},querySelectorAll(){return [];},classList:{toggle(){}}}});
 reader.clearCornerPreview=reader.updateView=()=>{};reader.render=()=>{reader.savedPosition=reader.position;};reader.initAudio=()=>Promise.resolve();
 for(const delta of [1,-1]){
  reader.position=2;reader.savedPosition=2;
  const options=reader.paperOptions(delta);
  const moving=faces[delta<0?1:2];
  assert.equal(reader.turningFace(delta),moving);assert.equal(options.hidden,moving);assert.equal(options.front,moving);assert.equal(options.back,moving);
  assert.equal(options.underlay,faces[delta<0?2:3]);assert.equal(options.blankSide,'back');assert.equal(options.incoming,delta<0);
  if(delta<0){
   const direction=surfaceDirection(options);assert.equal(direction,1);
   for(const u of [0,.25,.5,.75,1]){
    const start=deform(u,.5,1,300,412,0,null,undefined,direction),end=deform(u,.5,0,300,412,0,null,undefined,direction);
    assert.ok(Math.abs(start.x+300*u)<1e-7,'Previous sheet starts left of the viewport');
    assert.ok(Math.abs(end.x-300*u)<1e-7,'Previous sheet ends flat over the current page');
   }
  }
  let land;const paper={overlay:{},animate:()=>new Promise(resolve=>land=resolve),destroy(){}};
  const completion=reader.turn(delta,paper);
  if(delta<0){assert.notEqual(faces[2].style.transition,'none','The current page must stay stationary');assert.equal(faces[1].style.transition,'none');}
  assert.equal(reader.position,2,'Do not commit reading position while the page is still moving');assert.equal(reader.savedPosition,2);
  land();await completion;assert.equal(reader.position,2+delta);assert.equal(reader.savedPosition,2+delta);assert.equal(reader.busy,false);
 }
 // Commit at landing, and wait for the resting artwork to be ready before cleanup.
 reader.position=2;let revealReady,releaseFade,destroyed=0;
 const handoffPaper={overlay:{},animate:async()=>{},reveal:()=>{revealReady=true;return new Promise(resolve=>releaseFade=resolve);},destroy(){destroyed++;}};
 const handoff=reader.turn(1,handoffPaper);for(let i=0;i<5;i++)await Promise.resolve();
 assert.equal(revealReady,true);assert.equal(reader.position,3);assert.equal(reader.busy,true);assert.equal(destroyed,0);
 releaseFade();await handoff;assert.equal(reader.busy,false);assert.equal(destroyed,1);
 // Replacing a book during reveal must not let old cleanup touch the new state.
 reader.position=2;const interrupted=reader.turn(1,handoffPaper);for(let i=0;i<5;i++)await Promise.resolve();
 reader.generation++;reader.busy=false;releaseFade();await interrupted;assert.equal(reader.busy,false);assert.equal(destroyed,2);
 // Reduced-motion/WebGL fallback also brings the previous page from the left.
 sandbox.matchMedia=()=>({matches:true});sandbox.setTimeout=fn=>fn();reader.position=2;reader.savedPosition=2;
 const fallback=reader.turn(-1);
 assert.equal(faces[1].classList.contains('single-returning'),true);assert.equal(faces[2].classList.contains('single-outgoing'),false);
 assert.equal(faces[2].classList.contains('single-underlay'),true);assert.equal(reader.position,2);
 await fallback;assert.equal(reader.position,1);assert.equal(faces[1].classList.contains('single-returning'),false);assert.equal(faces[2].classList.contains('single-underlay'),false);
 console.log('Single-page turn checks passed: mirrored swipe directions, responsive thresholds, flicks, reversal cancellation, stationary current page, previous-page return from left, neutral reverse, cleanup and commit after landing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
