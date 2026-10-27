// Exercise the real pointer handlers without requiring a physical touchscreen.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ViewGestures=require('../view-gestures.js'),PaperDynamics=require('../paper-dynamics.js');
const elements=new Map();
function element(){return {style:{},classList:{add(){},remove(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:400,height:600};}};}
const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);},addEventListener(){}};
const sandbox={document,setTimeout,clearTimeout,window:{addEventListener(){}},ViewGestures,PaperDynamics};
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'));
vm.runInNewContext(source+'\nthis.Reader=BookReader;',sandbox);
const reader=Object.create(sandbox.Reader.prototype);
Object.assign(reader,{pdf:{},pdfView:'single',readingView:'single',viewZoom:1,pan:{x:0,y:0},generation:1,busy:false,position:2,total:5,book:{querySelector:()=>element()},leaves:[]});
const counters={turns:0,saves:0,updates:0,pdfRenders:0};
reader.render=()=>{};reader.updateView=()=>counters.updates++;reader.persistReading=()=>counters.saves++;reader.renderPdfPages=()=>counters.pdfRenders++;reader.turn=()=>counters.turns++;
reader.cornerAt=()=>null;reader.bind();const scene=document.querySelector('#scene');
let eventClock=0;
const event=(id,x,y=300,time)=>({pointerId:id,clientX:x,clientY:y,button:0,timeStamp:time??(eventClock+=140)});
scene.listeners.pointerdown(event(1,100));scene.listeners.pointerdown(event(2,300));
assert.equal(reader.pinchActive,true);
scene.listeners.pointermove(event(2,500));
assert.equal(reader.viewZoom,2);assert.equal(reader.pan.x,100);assert.equal(reader.pan.y,0);
scene.listeners.pointerup(event(1,100));
assert.equal(reader.pinchActive,true);
scene.listeners.pointermove(event(2,550));scene.listeners.pointerup(event(2,550));
assert.equal(reader.pinchActive,false);assert.equal(counters.turns,0);assert.equal(counters.saves,1);assert.equal(counters.pdfRenders,1);
// Cancellation must release gesture state and must never turn a page.
reader.viewZoom=1;reader.pan={x:0,y:0};
scene.listeners.pointerdown(event(3,100));scene.listeners.pointerdown(event(4,300));scene.listeners.pointercancel();
assert.equal(reader.pinchActive,false);assert.equal(counters.turns,0);
console.log('Reader pointer checks passed: pinch zoom, focal pan, finger lift, cancellation, no accidental page turn.');

// Corner releases exercise the real asynchronous reader handoff, including a
// finger lifting before texture preparation has finished.
(async()=>{
 const PaperDynamics=require('../paper-dynamics.js');sandbox.PaperDynamics=PaperDynamics;
 sandbox.matchMedia=()=>({matches:false});
 let created,resolveCreate,preparedOptions;
 function fakePaper(){return {progress:0,disposed:false,stopAnimation(){},setMomentum(velocity){this.velocity=velocity;},mount(){this.overlay={};return this;},follow(p,grip){this.progress=p;this.grip=grip;},animate(target){this.target=target;return Promise.resolve();},destroy(){this.disposed=true;}};}
 sandbox.PaperTurn={create:async options=>{preparedOptions=options;return created=fakePaper();}};
 reader.viewZoom=1;reader.pan={x:0,y:0};reader.pdf={};reader.busy=false;reader.position=2;reader.total=5;
 reader.cornerAt=(x,y)=>PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,1);
 reader.currentFace=()=>element();reader.turningFace=()=>element();reader.paperOptions=()=>({});
 reader.turn=(delta,paper)=>{counters.turns++;assert.equal(delta,1);paper?.destroy();};
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 let initialTurns=counters.turns;
 scene.listeners.pointerdown(event(10,390,10));await flush();assert.ok(preparedOptions.cornerV<.1);
 scene.listeners.pointermove(event(10,320,60));scene.listeners.pointerup(event(10,320,60));await flush();
 assert.equal(counters.turns,initialTurns);assert.equal(created.target,0);assert.ok(created.disposed);assert.equal(reader.busy,false);
 scene.listeners.pointerdown(event(11,390,590));await flush();assert.ok(preparedOptions.cornerV>.9);
 scene.listeners.pointermove(event(11,130,540));scene.listeners.pointerup(event(11,130,540));await flush();
 assert.equal(counters.turns,initialTurns+1);assert.ok(created.disposed);
 sandbox.PaperTurn.create=()=>new Promise(resolve=>resolveCreate=resolve);
 scene.listeners.pointerdown(event(12,390,10));scene.listeners.pointermove(event(12,320,55));scene.listeners.pointerup(event(12,320,55));
 assert.equal(reader.busy,true);created=fakePaper();resolveCreate(created);await flush();
 assert.equal(created.target,0);assert.ok(created.disposed);assert.equal(reader.busy,false);
 sandbox.PaperTurn.create=async()=>created=fakePaper();
 scene.listeners.pointerdown(event(13,390,10));await flush();scene.listeners.pointermove(event(13,350,50));
 scene.listeners.pointerdown(event(14,100,200));assert.ok(created.disposed);assert.equal(reader.pinchActive,true);
 scene.listeners.pointerup(event(13,350,50));scene.listeners.pointerup(event(14,100,200));await flush();
 assert.equal(reader.pinchActive,false);assert.equal(counters.turns,initialTurns+1);
 // A corner press/release turns once even if preparation is still pending.
 const directions=[];reader.turn=(delta,paper)=>{directions.push(delta);paper?.destroy();};
 for(const [id,y] of [[20,10],[21,590]]){
  scene.listeners.pointerdown(event(id,390,y));scene.listeners.pointerup(event(id,393,y+2));await flush();
 }
 assert.deepEqual(directions,[1,1]);
 reader.cornerAt=(x,y)=>PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,-1);
 scene.listeners.pointerdown(event(22,10,10));scene.listeners.pointerup(event(22,10,10));await flush();
 assert.deepEqual(directions,[1,1,-1]);
 sandbox.PaperTurn.create=()=>new Promise(resolve=>resolveCreate=resolve);
 scene.listeners.pointerdown(event(23,10,590));scene.listeners.pointerup(event(23,10,590));
 assert.equal(reader.busy,true);created=fakePaper();resolveCreate(created);await flush();
 assert.deepEqual(directions,[1,1,-1,-1]);assert.equal(reader.busy,false);
 // Canceled corner taps and taps in the body must never turn.
 scene.listeners.pointerdown(event(24,10,10));scene.listeners.pointercancel();await flush();
 created=fakePaper();resolveCreate(created);await flush();assert.ok(created.disposed);
 reader.cornerAt=()=>null;scene.listeners.pointerdown(event(25,200,300));scene.listeners.pointerup(event(25,200,300));await flush();
 assert.equal(directions.length,4);
 // A prepared hover surface transfers ownership to the press without rebuilding.
 reader.cornerAt=(x,y)=>PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,1);
 const grip=reader.cornerAt(390,10),hoverPaper=fakePaper();hoverPaper.overlay={};
 reader.cornerPreview={paper:hoverPaper,grip};reader.cornerIntent='preview';
 scene.listeners.pointerdown(event(26,390,10));assert.equal(reader.cornerPreview,null);assert.ok(!hoverPaper.disposed);
 scene.listeners.pointerup(event(26,390,10));await flush();assert.equal(directions.length,5);assert.ok(hoverPaper.disposed);
 // Hover never saves or turns; late work must be discarded after leaving.
 document.querySelector('dialog[open]');elements.set('dialog[open]',null);
 sandbox.PaperTurn.create=async()=>created=fakePaper();
 reader.previewCorner(grip);await new Promise(resolve=>setTimeout(resolve,100));await flush();
 assert.ok(reader.cornerPreview);assert.equal(created.grip.hover,1);assert.equal(directions.length,5);
 reader.clearCornerPreview(false);await flush();assert.equal(reader.cornerPreview,null);assert.ok(created.disposed);
 reader.previewCorner(grip);reader.clearCornerPreview();await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(reader.cornerPreview,null);
 // A snapshot can finish after leaving or switching books: it must never mount.
 sandbox.PaperTurn.create=()=>new Promise(resolve=>resolveCreate=resolve);
 reader.previewCorner(grip);await new Promise(resolve=>setTimeout(resolve,100));
 reader.clearCornerPreview();created=fakePaper();resolveCreate(created);await flush();
 assert.equal(reader.cornerPreview,null);assert.ok(created.disposed);assert.equal(created.overlay,undefined);
 // Real reader handoff: short flicks carry velocity in either direction,
 // including an up-only flick and a release before texture creation finishes.
 const released=[];reader.turn=(delta,paper)=>{released.push({delta,velocity:paper?.velocity});paper?.destroy();};
 let id=40;
 const setDirection=delta=>{reader.cornerAt=(x,y)=>PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,delta);};
 for(const delta of [1,-1]){
  setDirection(delta);sandbox.PaperTurn.create=async()=>created=fakePaper();
  const start=delta>0?390:10,y=delta>0?10:590;id++;
  scene.listeners.pointerdown(event(id,start,y,0));await flush();
  scene.listeners.pointermove(event(id,start-delta*35,y,20));
  scene.listeners.pointermove(event(id,start-delta*90,y,40));
  scene.listeners.pointerup(event(id,start-delta*90,y,45));await flush();
  assert.equal(released.at(-1).delta,delta);assert.ok(released.at(-1).velocity*delta>2);
 }
 setDirection(1);sandbox.PaperTurn.create=()=>new Promise(resolve=>resolveCreate=resolve);
 scene.listeners.pointerdown(event(++id,390,10,0));
 scene.listeners.pointermove(event(id,355,10,20));scene.listeners.pointermove(event(id,300,10,40));scene.listeners.pointerup(event(id,300,10,45));
 assert.equal(reader.busy,true);created=fakePaper();resolveCreate(created);await flush();
 assert.equal(released.length,3);assert.ok(released.at(-1).velocity>2);
 sandbox.PaperTurn.create=async()=>created=fakePaper();
 scene.listeners.pointerdown(event(++id,390,10,0));await flush();scene.listeners.pointerup(event(id,300,10,45));await flush();
 assert.equal(released.length,4);assert.ok(released.at(-1).velocity>2);
 // Hold or cancellation removes flick momentum without a turn.
 scene.listeners.pointerdown(event(++id,390,10,0));await flush();
 scene.listeners.pointermove(event(id,300,10,40));scene.listeners.pointerup(event(id,300,10,200));await flush();
 assert.equal(released.length,4);assert.equal(created.velocity,0);assert.equal(created.target,0);
 scene.listeners.pointerdown(event(++id,390,10,0));await flush();
 scene.listeners.pointermove(event(id,300,10,40));scene.listeners.pointercancel();await flush();
 assert.equal(released.length,4);assert.equal(created.velocity,0);assert.equal(reader.busy,false);
 // Single-page middle swipes use a locked direction and commit exactly one page.
 reader.cornerAt=()=>null;reader.book={querySelector:()=>element(),getBoundingClientRect:()=>({width:400})};
 const swipes=[];reader.turn=(delta,paper)=>{swipes.push(delta);paper?.destroy();};
 const swipe=async(start,middle,end)=>{
  const pointerId=++id;scene.listeners.pointerdown(event(pointerId,start,300,0));await flush();
  scene.listeners.pointermove(event(pointerId,middle,300,200));await flush();
  scene.listeners.pointerup(event(pointerId,end,300,400));await flush();
 };
 await swipe(300,190,180);await swipe(100,210,220);assert.deepEqual(swipes,[1,-1]);
 await swipe(300,250,370);assert.deepEqual(swipes,[1,-1]);assert.equal(created.target,0,'A reversed swipe returns the original sheet');
 await swipe(300,270,260);assert.deepEqual(swipes,[1,-1],'A short slow swipe must not turn');
 // Incoming corner motion must reach the renderer with an on-screen grip.
 reader.cornerAt=(x,y)=>{const corner=PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,-1);return corner?{...corner,incoming:true}:null;};
 const incomingTurns=[];reader.turn=(delta,paper)=>{incomingTurns.push(delta);paper?.destroy();};
 scene.listeners.pointerdown(event(++id,10,10,0));await flush();
 scene.listeners.pointermove(event(id,80,55,200));await flush();
 assert.equal(created.grip.incoming,true);assert.ok(Math.abs(created.grip.targetX-.2)<1e-10);assert.ok(Math.abs(created.grip.targetY-55/600)<1e-10);
 scene.listeners.pointerup(event(id,80,55,400));await flush();assert.equal(created.target,1);assert.equal(incomingTurns.length,0);
 scene.listeners.pointerdown(event(++id,10,590,0));await flush();
 scene.listeners.pointermove(event(id,280,540,200));scene.listeners.pointerup(event(id,280,540,400));await flush();assert.deepEqual(incomingTurns,[-1]);
 // Forward grips use the same on-screen roll tracking and return spring.
 reader.cornerAt=(x,y)=>{const corner=PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,1);return corner?{...corner,forward:true}:null;};
 const forwardTurns=[];reader.turn=(delta,paper)=>{forwardTurns.push(delta);paper?.destroy();};
 scene.listeners.pointerdown(event(++id,390,10,0));await flush();
 scene.listeners.pointermove(event(id,320,55,200));await flush();
 assert.equal(created.grip.forward,true);assert.equal(created.grip.roll,true);assert.ok(Math.abs(created.grip.targetX-.8)<1e-10);assert.ok(Math.abs(created.grip.targetY-55/600)<1e-10);
 scene.listeners.pointerup(event(id,320,55,400));await flush();assert.equal(created.target,0);assert.equal(forwardTurns.length,0);
 scene.listeners.pointerdown(event(++id,390,590,0));await flush();scene.listeners.pointermove(event(id,120,540,200));scene.listeners.pointerup(event(id,120,540,400));await flush();assert.deepEqual(forwardTurns,[1]);
 // Return to a backward grip for the fallback path below.
 reader.cornerAt=(x,y)=>{const corner=PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,-1);return corner?{...corner,incoming:true}:null;};
 // If GPU preparation fails, the visible incoming fallback returns left too.
 sandbox.PaperTurn.create=async()=>{throw new Error('WebGL unavailable');};
 const fallbackLeaf=element();let fallbackFrames,finishFallback;
 fallbackLeaf.animate=(frames,options)=>{fallbackFrames=frames;assert.equal(options.duration,380);return {finished:new Promise(resolve=>finishFallback=resolve),cancel(){}};};
 reader.turningFace=()=>fallbackLeaf;
 scene.listeners.pointerdown(event(++id,10,10,0));await flush();scene.listeners.pointermove(event(id,80,55,200));
 scene.listeners.pointerup(event(id,80,55,400));await flush();assert.equal(reader.busy,true);
 assert.ok(fallbackFrames[0].transform.startsWith('translate3d('));assert.equal(fallbackFrames[1].transform,'translateX(-100%)');
 finishFallback();await flush();assert.equal(reader.busy,false);assert.deepEqual(incomingTurns,[-1]);
 reader.cornerAt=(x,y)=>{const corner=PaperDynamics.corner({left:0,top:0,width:400,height:600},x,y,1);return corner?{...corner,forward:true}:null;};
 scene.listeners.pointerdown(event(++id,390,10,0));await flush();scene.listeners.pointermove(event(id,320,55,200));scene.listeners.pointerup(event(id,320,55,400));await flush();
 assert.equal(reader.busy,true);assert.equal(fallbackFrames[1].transform,'translateX(0)');finishFallback();await flush();assert.equal(reader.busy,false);assert.deepEqual(forwardTurns,[1]);
 console.log('Forward finger checks passed: X/Y tracking, short spring return, completed turn and GPU fallback return.');
 console.log('Incoming fallback checks passed: failed GPU preparation retains the drag position and animates cancellation left.');
 console.log('Reader incoming finger checks passed: on-screen X/Y grip, short spring return and completed backward turn.');
 console.log('Reader single-page swipe checks passed: next/previous, direction lock, reversal and short-drag return.');
 console.log('Reader momentum checks passed: mirrored short flicks, pending textures, up-only movement, held release and cancellation.');
 console.log('Corner tap and hover checks passed: both directions, tap jitter, async preparation, cancellation, surface adoption and cleanup.');
 console.log('Reader corner checks passed: short return, completed turn, early release during preparation, pinch takeover.');
})().catch(error=>{console.error(error);process.exitCode=1;});
