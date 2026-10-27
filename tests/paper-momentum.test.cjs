const assert=require('node:assert/strict');
const D=require('../paper-dynamics.js'),{PaperTurn}=require('../paper-turn.js');
const rect={left:100,top:50,width:400,height:600};
const slow=[[0,0],[180,90],[320,90]],flick=[[0,0],[20,35],[40,90],[45,90]];
function gesture(delta,v,points,width=400,cancel=false){
 const r={...rect,width},x=delta>0?r.left+width-10:r.left+10,y=r.top+v*r.height;
 const grip=D.corner(r,x,y,delta);let samples=[];
 for(const [time,travel] of points)samples=D.sampleMotion(samples,x-delta*travel*width/400,y,time);
 const last=samples.at(-1);return D.release(grip,last.x,last.y,samples,last.time,cancel);
}
for(const delta of [1,-1])for(const v of [.02,.98]){
 const gentle=gesture(delta,v,slow),quick=gesture(delta,v,flick);
 assert.equal(gentle.complete,false);assert.equal(gentle.velocity,0);
 assert.equal(quick.complete,true);assert.ok(quick.velocity*delta>2);
 const paused=gesture(delta,v,[[0,0],[40,90],[180,90]]);
 assert.equal(paused.complete,false);assert.equal(paused.velocity,0);
 const long=gesture(delta,v,[[0,0],[250,260],[450,260]]);
 assert.equal(long.complete,true);assert.equal(long.velocity,0);
 const reversed=gesture(delta,v,[[0,0],[80,290],[100,270],[120,250]]);
 assert.equal(reversed.complete,false);assert.ok(reversed.velocity*delta<0);
 assert.equal(gesture(delta,v,[[0,0],[5,8],[10,18]]).complete,false);
 const canceled=gesture(delta,v,flick,400,true);
 assert.equal(canceled.complete,false);assert.equal(canceled.velocity,0);
}
const forward=gesture(1,.02,flick),back=gesture(-1,.02,flick);
assert.ok(Math.abs(forward.velocity+back.velocity)<1e-9);assert.equal(forward.complete,back.complete);
// Equivalent gestures remain equivalent at narrow mobile page sizes.
const mobile=gesture(1,.02,flick,200);
assert.equal(mobile.complete,forward.complete);assert.ok(Math.abs(mobile.velocity-forward.velocity)<.06);
// Weighted input samples give consistent velocity across sampling frequencies.
for(const hz of [30,60,120,240]){
 let samples=[];for(let t=0;t<=120;t+=1000/hz)samples=D.sampleMotion(samples,400-2*t,20,t);
 samples=D.sampleMotion(samples,160,20,120);
 assert.ok(Math.abs(D.motionVelocity(samples,120)+2000)<1e-5);
 const duplicate=D.sampleMotion(samples,160,20,120);assert.equal(duplicate.length,samples.length);
 assert.equal(D.motionVelocity(D.sampleMotion(samples,160,20,300),300),0);
}
// Subpixel motion also accumulates correctly on high-rate pen/touch hardware.
let fine=[];for(let t=0;t<=120;t+=1000/480)fine=D.sampleMotion(fine,400-.045*t,20,t);
fine=D.sampleMotion(fine,394.6,20,120);assert.ok(Math.abs(D.motionVelocity(fine,120)+45)<1e-5);
// Run the actual release animation on a deterministic animation-frame clock.
global.PaperDynamics=D;
let queue=[],frameId=0;
global.requestAnimationFrame=fn=>{queue.push({id:++frameId,fn});return frameId;};
global.cancelAnimationFrame=id=>{queue=queue.filter(item=>item.id!==id);};
function animate(delta,velocity,targetAmount=1,fps=60,start=.3){
 queue=[];let time=0;const frames=[];
 const paper=Object.create(PaperTurn.prototype);
 Object.assign(paper,{options:{delta,cornerV:.02},dragged:velocity!==null,progress:delta>0?start:1-start,grip:{v:.02,strength:1},seek(p){this.progress=Math.min(1,Math.max(0,p));frames.push({time,amount:delta>0?this.progress:1-this.progress});}});
 if(velocity!==null)paper.setMomentum(delta*velocity);paper.animate(delta>0?targetAmount:1-targetAmount);
 for(let i=0;queue.length&&i<150;i++){
  time+=1000/fps;const frame=queue.shift();frame.fn(time);
 }
 assert.equal(queue.length,0);assert.equal(paper.progress,delta>0?targetAmount:1-targetAmount);
 return {frames,duration:time};
}
const calm=animate(1,0),fast=animate(1,3),reverseFast=animate(-1,3);
assert.ok(fast.frames[4].amount>calm.frames[4].amount+.08);
assert.ok(fast.duration<calm.duration*.85);
assert.equal(fast.frames.length,reverseFast.frames.length);
for(const motion of [calm,fast])for(let i=1;i<motion.frames.length;i++)assert.ok(motion.frames[i].amount>=motion.frames[i-1].amount-1e-9,'Paper lands without repeated elastic oscillations');
for(let i=0;i<fast.frames.length;i++)assert.ok(Math.abs(fast.frames[i].amount-reverseFast.frames[i].amount)<1e-9);
const rollback=animate(1,2,0);
assert.ok(rollback.frames.some(frame=>frame.amount>.3)); // Retains a small outward impulse before the damped return.
// Landing resolves promptly (and releases the reader's input lock), including
// short spring-backs and nearly completed turns on different refresh rates.
for(const fps of [30,60,120])for(const delta of [1,-1]){
 for(const start of [.1,.3,.8,.97])for(const target of [0,1]){
  assert.ok(animate(delta,0,target,fps,start).duration<=550,'No long spring tail after a slow release');
  assert.ok(animate(delta,3,target,fps,start).duration<=550,'Carried momentum must settle promptly');
 }
 assert.ok(animate(delta,null,1,fps,0).duration<=550,'Corner taps and buttons finish in about half a second, including frame scheduling');
}
console.log(`Release timing at 60 Hz: gentle ${Math.round(calm.duration)} ms, flick ${Math.round(fast.duration)} ms; mirrored turns and spring-backs finish within 550 ms at 30/60/120 Hz.`);
console.log('Momentum checks passed: flick/slow/hold/reversal/cancel, mirrored corners, mobile scaling, input rates, carried release velocity and faster landing.');
