// Exercise the app's responsive focus lifecycle and actual gesture handlers.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ReadingLayout=require('../reading-layout.js'),PaperDynamics=require('../paper-dynamics.js'),ViewGestures=require('../view-gestures.js');
function element(){const classes=new Set();return {style:{},listeners:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle(v,on){if(on===undefined)on=!classes.has(v);on?classes.add(v):classes.delete(v);return on;}},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},setPointerCapture(){},closest(){return null;},focus(){document.activeElement=this;},getBoundingClientRect(){return {left:0,top:0,width:390,height:844};}};}
let openDialog=null;
const elements=new Map(),documentListeners={},document={body:element(),activeElement:null,querySelector(s){if(s==='dialog[open]')return openDialog;if(!elements.has(s))elements.set(s,element());return elements.get(s);},addEventListener(k,fn){documentListeners[k]=fn;}};
const window={innerWidth:390,addEventListener(){}};
// A deterministic clock verifies idle deadlines without waiting in real time.
let clock=0,nextTimer=0;const timers=new Map();
const setTimer=(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:clock+delay});return id;};
const clearTimer=id=>timers.delete(id);
function advance(ms){const end=clock+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;clock=next[1].at;timers.delete(next[0]);next[1].fn();}clock=end;}
const sandbox={document,window,ReadingLayout,PaperDynamics,ViewGestures,matchMedia:q=>({matches:q.includes('reduced-motion')}),requestAnimationFrame:fn=>fn(),setTimeout:setTimer,clearTimeout:clearTimer};
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
const reader=Object.create(sandbox.Reader.prototype);
Object.assign(reader,{viewZoom:1,pan:{x:0,y:0},generation:1,busy:false,position:2,total:8,readingView:'single',book:element(),pdf:{}});
let updates=0,turns=0;
reader.updateView=()=>updates++;reader.render=reader.renderPdfPages=reader.persistReading=()=>{};reader.turn=()=>turns++;reader.cornerAt=()=>null;reader.currentFace=()=>element();
reader.syncMobileReading();
assert.equal(reader.mobileReading,true);assert.equal(reader.fullscreenMode,true);assert.equal(reader.controlsVisible,false);
assert.ok(document.body.classList.contains('mobile-reading'));
const baseline=updates;
reader.setReadingControls(true);reader.setReadingControls(false);
assert.equal(updates,baseline+2,'Revealing and hiding controls refits the unobstructed reading viewport');
assert.equal(reader.position,2);assert.equal(reader.viewZoom,1,'Control reveal preserves reading location and zoom');
reader.toggleFullscreen();assert.equal(reader.mobileReading,false);reader.syncMobileReading();assert.equal(reader.mobileReading,false,'Manual exit lasts through mobile resizing');
reader.toggleFullscreen();assert.equal(reader.mobileReading,true);assert.equal(reader.controlsVisible,false);
window.innerWidth=1200;reader.syncMobileReading();assert.equal(reader.mobileReading,false);assert.equal(reader.fullscreenMode,false);
window.innerWidth=390;reader.syncMobileReading();assert.equal(reader.mobileReading,true);assert.equal(reader.controlsVisible,false);
reader.bind();const scene=document.querySelector('#scene');let time=0;
const e=(id,x,y=420)=>({pointerId:id,button:0,clientX:x,clientY:y,timeStamp:time+=20});
scene.listeners.pointerdown(e(1,195));scene.listeners.pointerup(e(1,198));assert.equal(reader.controlsVisible,true);assert.equal(turns,0);
scene.listeners.pointerdown(e(2,195));scene.listeners.pointerup(e(2,195));assert.equal(reader.controlsVisible,false);
reader.viewZoom=2;
scene.listeners.pointerdown(e(3,195));scene.listeners.pointermove(e(3,250));scene.listeners.pointermove(e(3,195));scene.listeners.pointerup(e(3,195));
assert.equal(reader.controlsVisible,false,'A pan returning to its start is still a gesture');
scene.listeners.pointerdown(e(4,195));scene.listeners.pointerup(e(4,195));assert.equal(reader.controlsVisible,true,'A stationary tap works while zoomed');
reader.setReadingControls(false);reader.viewZoom=1;
scene.listeners.pointerdown(e(5,100));scene.listeners.pointerdown(e(6,300));scene.listeners.pointermove(e(6,360));scene.listeners.pointerup(e(5,100));scene.listeners.pointerup(e(6,360));
assert.equal(reader.controlsVisible,false);assert.equal(turns,0,'Pinch release must not toggle controls or turn');
scene.listeners.pointerdown(e(7,195));scene.listeners.pointercancel();assert.equal(reader.controlsVisible,false);
const key=(key,target={tagName:'DIV',id:'scene'})=>documentListeners.keydown({key,target,preventDefault(){}});
key('Tab');assert.equal(reader.controlsVisible,true);key('Escape');assert.equal(reader.controlsVisible,false);key('Enter');assert.equal(reader.controlsVisible,true);key(' ');assert.equal(reader.controlsVisible,false);
key('Escape');assert.equal(reader.mobileReading,false);assert.equal(document.body.classList.contains('mobile-controls-visible'),false);
// Timer reset, gesture suspension, dialog dismissal and keyboard focus.
reader.mobileFocusDisabled=false;reader.syncMobileReading();reader.setReadingControls(true);
advance(3999);assert.equal(reader.controlsVisible,true);advance(1);assert.equal(reader.controlsVisible,false);
scene.listeners.pointerdown(e(20,195));scene.listeners.pointerup(e(20,195));assert.equal(reader.controlsVisible,true,'Tap reveals controls after timeout');
advance(3000);reader.noteReadingActivity({type:'input'});advance(3000);assert.equal(reader.controlsVisible,true);advance(1000);assert.equal(reader.controlsVisible,false);
reader.setReadingControls(true);reader.noteReadingActivity({type:'pointerdown',pointerId:99});advance(12000);assert.equal(reader.controlsVisible,true,'Do not hide a held control');
reader.noteReadingActivity({type:'pointerup',pointerId:99});advance(3999);assert.equal(reader.controlsVisible,true);advance(1);assert.equal(reader.controlsVisible,false);
reader.setReadingControls(true);reader.busy=true;advance(8000);assert.equal(reader.controlsVisible,true,'A page turn cannot lose its viewport halfway through');reader.busy=false;advance(4000);assert.equal(reader.controlsVisible,false);
reader.setReadingControls(true);openDialog=element();advance(8000);assert.equal(reader.controlsVisible,true,'Dialogs keep controls available');
openDialog=null;documentListeners.close();advance(3999);assert.equal(reader.controlsVisible,true);advance(1);assert.equal(reader.controlsVisible,false);
document.activeElement={closest:()=>({})};key('Tab');advance(8000);assert.equal(reader.controlsVisible,true,'Keyboard-focused controls must remain available');
document.activeElement=scene;advance(4000);assert.equal(reader.controlsVisible,false,'Leaving the toolbar allows hiding');
reader.setReadingControls(true);reader.noteReadingActivity({type:'pointerdown',pointerId:100});reader.noteReadingActivity({type:'pointercancel',pointerId:100});advance(4000);assert.equal(reader.controlsVisible,false);
reader.setReadingControls(true);reader.mobileFocusDisabled=true;reader.syncMobileReading();assert.equal(timers.size,0,'Exiting mobile focus clears the idle timer');
advance(8000);assert.equal(reader.controlsVisible,false);
console.log('Control inactivity checks passed: four-second deadline, input reset, tap to reveal, held/canceled pointers, dialogs, keyboard access and timer cleanup.');
console.log('Mobile reading checks passed: focus defaults, breakpoint changes, manual exit, unobstructed controls, taps, pan/pinch isolation and keyboard access.');

// Reader shortcuts must not steal browser chords, composition or field navigation.
const turnsBefore=turns;
for(const flags of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{defaultPrevented:true}])documentListeners.keydown({key:'ArrowRight',target:{tagName:'DIV'},preventDefault(){},...flags});
key('ArrowRight',{tagName:'SELECT'});key('ArrowLeft',{tagName:'TEXTAREA'});key('ArrowRight',{tagName:'DIV',isContentEditable:true});
assert.equal(turns,turnsBefore,'Browser modifiers and editable controls must not turn pages');
key('ArrowRight',{tagName:'DIV'});assert.equal(turns,turnsBefore+1,'An ordinary arrow still turns the page');
// Preferences restore independently of book progress and tolerate restricted storage.
let stored=JSON.stringify({sound:false,night:true});
sandbox.localStorage={getItem:()=>stored,setItem:(key,value)=>{assert.equal(key,'folio-preferences');stored=value;}};
reader.sound=true;reader.restorePreferences();assert.equal(reader.sound,false);assert.equal(document.body.classList.contains('night'),true);
assert.equal(document.querySelector('#sound')['aria-pressed'],false);assert.equal(document.querySelector('#theme')['aria-label'],'Use light theme');
reader.sound=true;document.body.classList.remove('night');reader.savePreferences();assert.deepEqual(JSON.parse(stored),{sound:true,night:false});
stored='invalid';reader.restorePreferences();assert.equal(reader.sound,true,'Invalid stored JSON keeps usable defaults');
stored=JSON.stringify({sound:'false',night:'true'});reader.restorePreferences();assert.equal(reader.sound,true);assert.equal(document.body.classList.contains('night'),false,'Untrusted preference types are ignored');
sandbox.localStorage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};assert.doesNotThrow(()=>reader.restorePreferences());assert.doesNotThrow(()=>reader.savePreferences());
console.log('Reader controls checks passed: browser shortcuts, editable fields, persistent sound/theme choices and unavailable storage.');
// Native fullscreen is not reliable in embedded browsers; CSS reading mode
// should expand immediately even if the browser never settles its promise.
window.innerWidth=1200;reader.mobileFocusDisabled=false;reader.syncMobileReading();
document.documentElement={requestFullscreen:()=>new Promise(()=>{})};
reader.toggleFullscreen();assert.equal(reader.fullscreenMode,true);assert.equal(document.body.classList.contains('focus-reading'),true);
reader.toggleFullscreen();assert.equal(reader.fullscreenMode,false,'Exit works while the native request is pending');
document.fullscreenElement={};document.body.classList.add('focus-reading');reader.syncFullscreen();assert.equal(reader.fullscreenMode,true);assert.equal(document.body.classList.contains('focus-reading'),false,'Native fullscreen owns its exit lifecycle');
document.fullscreenElement=null;reader.syncFullscreen();assert.equal(reader.fullscreenMode,false,'Native Escape leaves fullscreen without a stale CSS fallback');
console.log('Fullscreen checks passed: pending native requests, immediate viewport mode, early exit and native Escape.');
