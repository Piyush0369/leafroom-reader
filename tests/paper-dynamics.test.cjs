const assert=require('node:assert/strict');
const {corner,drag,peek,spring}=require('../paper-dynamics.js');
const {deform,solveGrip,posePoint}=require('../paper-surface.js');
const rect={left:200,top:100,width:350,height:480};
const top=corner(rect,540,110,1),bottom=corner(rect,540,570,1),left=corner(rect,210,110,-1);
assert.ok(top&&bottom&&left);assert.ok(top.v<.1&&bottom.v>.9);
assert.equal(corner(rect,400,340,1),null);assert.equal(corner(rect,540,340,1),null);
const short=drag(top,465,150),long=drag(top,310,150),reverse=drag(left,440,160);
assert.equal(short.complete,false);assert.equal(long.complete,true);assert.equal(reverse.complete,true);
assert.ok(short.progress>0&&short.progress<long.progress);assert.ok(reverse.progress<1);
// Both corners deform differently; the spine is anchored for all rows.
for(const grip of [short.grip,drag(bottom,465,530).grip])for(let v=0;v<=1;v+=.1){
 const p=deform(0,v,.3,350,480,0,grip,{x:30,y:40});assert.ok(Math.abs(p.x)<1e-8&&Math.abs(p.z)<1e-8);assert.ok(Math.abs(p.y-v*480)<1e-8);
}
assert.notEqual(deform(1,0,.3,350,480,0,short.grip).z,deform(1,1,.3,350,480,0,short.grip).z);
// A constrained pose improves pointer contact without a local stretch field.
const grip=short.grip,p=short.progress,width=350,height=480,distance=1200;
const pose=solveGrip(p,width,height,0,grip,distance,0,1);
assert.ok(pose.error<.1);assert.ok(pose.progress>=0&&pose.progress<=1);
const binding=posePoint(0,grip.v,pose,width,height);assert.ok(Math.abs(binding.x)<1e-7&&Math.abs(binding.z)<1e-7);
function simulate(fps,target){let state={value:.36,velocity:1.2};for(let i=0;i<fps*2;i++)state=spring(state,target,1/fps);return state;}
for(const fps of [30,60,120])for(const target of [0,1]){const result=simulate(fps,target);assert.ok(Math.abs(result.value-target)<.0001&&Math.abs(result.velocity)<.001);}
assert.ok(Math.abs(simulate(30,0).value-simulate(120,0).value)<.0001);
console.log('Corner checks passed: hit regions, completion threshold, anchored spine/finger, top/bottom folds, stable spring return.');

for(const original of [top,bottom,left]){
 const preview=peek(original),g=preview.grip;
 assert.equal(g.hover,1);assert.equal(g.strength,1);
 assert.equal(preview.progress,original.delta>0?.075:.925);
 const tip=deform(1,g.v,preview.progress,350,480,0,g,undefined,original.delta);
 const far=deform(1,1-g.v,preview.progress,350,480,0,g,undefined,original.delta);
 assert.ok(tip.z>far.z*10); // Lift is concentrated at the indicated corner.
 const spine=deform(0,g.v,preview.progress,350,480,0,g,undefined,original.delta);
 assert.ok(Math.abs(spine.x)<1e-8);assert.ok(Math.abs(spine.z)<1e-8);
}
for(let p=.1;p<1;p+=.1)for(const v of [.02,.5,.98]){
 const g={u:.98,v:.02,strength:1},forward=deform(.9,v,p,350,480,0,g,{x:12,y:8},1);
 const back=deform(.9,v,1-p,350,480,0,g,{x:-12,y:8},-1);
 assert.ok(Math.abs(forward.x+back.x)<1e-7);assert.ok(Math.abs(forward.z-back.z)<1e-7);assert.ok(Math.abs(forward.y-back.y)<1e-7);
}
console.log('Hover geometry checks passed: localized corner lift, anchored spine and mirrored reverse grips.');

// Large pulls change the sheet pose, not its material lengths or binding.
for(const direction of [1,-1])for(const v of [.02,.98])for(const pull of [-.2,.2])for(const eye of [0,direction*width/2]){
 const g={u:.97,v,strength:1,targetX:direction*.5,targetY:v+pull};
 const p=direction>0?.43:.57,pose=solveGrip(p,width,height,0,g,distance,eye,direction);
 assert.ok(Number.isFinite(pose.progress)&&pose.progress>=0&&pose.progress<=1);
 const h=1e-6,a=posePoint(.45,.5,pose,width,height,0,direction),b=posePoint(.45+h,.5,pose,width,height,0,direction),c=posePoint(.45,.5+h,pose,width,height,0,direction);
 assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/h-width)<.02);
 assert.ok(Math.abs(Math.hypot(c.x-a.x,c.y-a.y,c.z-a.z)/h-height)<.02);
}
console.log('Paper constraint checks passed: coherent pointer poses, material lengths and anchored binding.');
