const assert=require('node:assert/strict');
const D=require('../paper-dynamics.js'),{deform,posePoint,solveGrip}=require('../paper-surface.js'),{PaperTurn}=require('../paper-turn.js');
// The actual rendered pose tracks reachable input while preserving paper lengths.
for(const delta of [1,-1])for(const width of [200,350,650])for(const v of [.02,.98])for(const dy of [-.12,.12])for(const travel of [.04,.2,.45,.7])for(const stiff of [0,1]){
 const height=width*1.37,rect={left:70,top:40,width,height},startX=rect.left+width*(delta>0?.98:.02),startY=rect.top+height*v;
 const corner={...D.corner(rect,startX,startY,delta),...(delta<0?{incoming:true}:{forward:true})};
 const state=D.drag(corner,startX-delta*travel*width,startY+dy*height),g=state.grip;
 const pose=solveGrip(state.progress,width,height,stiff,g,Math.max(width*3,2200),width/2,1);
 assert.ok(pose.progress>=0&&pose.progress<=1);
 if(!stiff&&g.targetY>.03&&g.targetY<.97)assert.ok(pose.error<.003,'Reachable finger input remains within about two screen pixels');
 if(stiff)assert.equal(pose.progress,state.progress,'Covers rotate as a solid board');
 const h=1e-6;
 for(const u of [.12,.45,.86])for(const row of [.15,.5,.85]){
  const a=posePoint(u,row,pose,width,height,stiff),b=posePoint(u+h,row,pose,width,height,stiff),c=posePoint(u,row+h,pose,width,height,stiff);
  const du={x:(b.x-a.x)/h,y:(b.y-a.y)/h,z:(b.z-a.z)/h},dv={x:(c.x-a.x)/h,y:(c.y-a.y)/h,z:(c.z-a.z)/h};
  assert.ok(Math.abs(Math.hypot(du.x,du.y,du.z)-width)<.03,'Horizontal paper lengths cannot stretch');
  assert.ok(Math.abs(Math.hypot(dv.x,dv.y,dv.z)-height)<.03,'Vertical paper lengths cannot stretch');
  assert.ok(Math.abs((du.x*dv.x+du.y*dv.y+du.z*dv.z)/(width*height))<.0002,'Printed text cannot shear');
 }
 const spine=posePoint(0,.5,pose,width,height,stiff);assert.ok(Math.abs(spine.x)<1e-8&&Math.abs(spine.z)<1e-8);
}
const origin={incoming:true,delta:-1,x:10,y:10,width:400,height:600,u:.975,v:10/600};
let prior=1;
for(let dx=0;dx<=380;dx+=5){const state=D.drag(origin,10+dx,10);assert.ok(state.progress<=prior+1e-12);prior=state.progress;}
const outward=D.drag(origin,170,60),reversed=D.drag(origin,90,30);assert.ok(reversed.progress>outward.progress);
// Progress velocity is the derivative of the incoming finger-to-curl mapping.
for(const x of [.2,.4,.7]){
 const h=1e-6,p=Math.acos(2*x-1)/Math.PI,derivative=(Math.acos(2*(x+h)-1)/Math.PI-p)/h;
 assert.ok(Math.abs(D.incomingVelocity(p,1)-derivative)<1e-4);
}
let samples=[];for(const [x,y,t] of [[10,10,0],[90,40,200],[90,40,400]])samples=D.sampleMotion(samples,x,y,t);
assert.equal(D.release(origin,90,40,samples,400).complete,false);assert.equal(D.release(origin,90,40,samples,400).velocity,0);
assert.equal(D.release(origin,90,40,samples,400,true).complete,false);
// Run the actual spring: a short incoming drag returns its leading edge left.
global.PaperDynamics=D;
for(const fps of [30,60,120]){
 let queue=[],id=0;global.requestAnimationFrame=fn=>{queue.push({id:++id,fn});return id;};global.cancelAnimationFrame=cancel=>queue=queue.filter(f=>f.id!==cancel);
 const paper=Object.create(PaperTurn.prototype),start=D.drag(origin,130,65),frames=[];
 Object.assign(paper,{options:{incoming:true,delta:-1},progress:start.progress,grip:start.grip,dragged:true,velocity:0,seek(p){this.progress=p;frames.push({p,grip:this.grip?{...this.grip}:null});}});
 paper.animate(1);let now=0;
 for(let frame=0;queue.length&&frame<fps*2;frame++){now+=1000/fps;queue.shift().fn(now);}
 assert.equal(queue.length,0);assert.equal(paper.progress,1);assert.equal(paper.grip,null);
 const live=frames.filter(f=>f.grip);assert.ok(live.length>3);assert.ok(live[0].grip.targetX<start.grip.targetX);
 for(let i=1;i<live.length;i++)assert.ok(live[i].grip.targetX<=live[i-1].grip.targetX+1e-8,'Spring return travels toward the left');
 assert.ok(live.at(-1).grip.targetX<.01);
}
// Equal gestures in opposite directions must have equal spring timing and feel.
function releaseFrames(delta,fps,complete,velocity){
 let queue=[],id=0;global.requestAnimationFrame=fn=>{queue.push({id:++id,fn});return id;};global.cancelAnimationFrame=cancel=>queue=queue.filter(f=>f.id!==cancel);
 const startGrip={delta,x:delta>0?390:10,y:12,width:400,height:600,u:.975,v:.02,...(delta<0?{incoming:true}:{forward:true})};
 const start=D.drag(startGrip,startGrip.x-delta*120,62),paper=Object.create(PaperTurn.prototype),frames=[];
 Object.assign(paper,{options:{incoming:delta<0,delta},progress:start.progress,grip:start.grip,dragged:true,velocity:delta*velocity,seek(p){this.progress=p;frames.push({p,x:this.grip?.targetX,strength:this.grip?.strength});}});
 const target=delta>0?(complete?1:0):(complete?0:1);paper.animate(target);let now=0;
 for(let i=0;queue.length&&i<fps*2;i++){now+=1000/fps;queue.shift().fn(now);}
 assert.equal(queue.length,0);assert.equal(paper.progress,target);assert.equal(paper.grip,null);return frames;
}
for(const fps of [30,60,120])for(const complete of [false,true])for(const velocity of [0,1.5,-.8]){
 const forward=releaseFrames(1,fps,complete,velocity),backward=releaseFrames(-1,fps,complete,velocity);
 assert.equal(forward.length,backward.length,'Identical release timing in both directions');
 for(let i=0;i<forward.length;i++){
  assert.ok(Math.abs(forward[i].p+backward[i].p-1)<1e-8);
  if(forward[i].x!==undefined){assert.ok(Math.abs(forward[i].x+backward[i].x-1)<1e-8);assert.ok(Math.abs(forward[i].strength-backward[i].strength)<1e-8);}
 }
}
console.log('Bidirectional consistency checks passed: matching logical finger controls, return/completion timing, vertical relaxation and carried momentum at 30/60/120 Hz.');
console.log('Finger-tracking checks passed: constrained finger tracking, top/bottom corners, viewport sizes, rigid covers, preserved material lengths and angles, reversals, velocity and spring return at 30/60/120 Hz.');

// Exercise the actual arc solver during release, rather than only logical input
// progress. The first release frame must continue from the rendered finger pose.
for(const fps of [30,60,120])for(const delta of [1,-1])for(const complete of [false,true]){
 let queue=[],id=0;global.requestAnimationFrame=fn=>{queue.push({id:++id,fn});return id;};global.cancelAnimationFrame=cancel=>queue=queue.filter(f=>f.id!==cancel);
 const origin={delta,x:delta>0?392:8,y:12,width:400,height:600,u:.98,v:.02,...(delta<0?{incoming:true}:{forward:true})};
 const start=D.drag(origin,origin.x-delta*120,62),paper=Object.create(PaperTurn.prototype),frames=[];
 Object.assign(paper,{options:{incoming:delta<0,delta},progress:start.progress,grip:start.grip,dragged:true,velocity:complete?delta*1.5:0,surface:{},seek(p){this.progress=p;this.surface.lastProgress=solveGrip(p,400,600,0,this.grip,2200,200,1).progress;frames.push(this.surface.lastProgress);}});
 paper.seek(start.progress);const target=delta>0?(complete?1:0):(complete?0:1),sign=Math.sign(target-frames[0]);
 paper.animate(target);let now=0;
 for(let frame=0;queue.length&&frame<fps*2;frame++){now+=1000/fps;queue.shift().fn(now);}
 assert.equal(queue.length,0);assert.equal(frames.at(-1),target);
 for(let i=1;i<frames.length;i++){
  const step=(frames[i]-frames[i-1])*sign;assert.ok(step>=-.001,'The visible page cannot recoil on release');
  assert.ok(Math.abs(step)<6/fps,'Release must be a continuous arc, without a pose jump');
 }
}
console.log('Rendered arc release checks passed: no recoil, bounded per-frame motion and flat landings in both directions at 30/60/120 Hz.');
