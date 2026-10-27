const assert=require('node:assert/strict');
const {fold,arcFrame}=require('../paper-surface.js');
// Mid-turn must remain a curved sheet. The old symmetric roll reflected over
// a quarter of the entire page into a flat, diagonal wing at 63% progress.
for(const width of [240,350,650])for(const corner of [0,1]){
 const height=width*1.37;
 for(const q of [.55,.6,.65]){
  let flatBack=0,samples=0;
  for(let u=.01;u<1;u+=.025)for(let v=.01;v<1;v+=.025){
   const h=1e-5,p=fold(u,v,q,width,height,corner),a=fold(u+h,v,q,width,height,corner),b=fold(u,v+h,q,width,height,corner);
   const du=[a.x-p.x,a.y-p.y,a.z-p.z],dv=[b.x-p.x,b.y-p.y,b.z-p.z];
   const normal=[du[1]*dv[2]-du[2]*dv[1],du[2]*dv[0]-du[0]*dv[2],du[0]*dv[1]-du[1]*dv[0]];
   if(normal[2]/Math.hypot(...normal)<-.995)flatBack++;samples++;
  }
  assert.ok(flatBack/samples<.04,'The middle of the turn cannot become a large flat flap');
 }
 // As a turned sheet approaches its destination it should line up with the
 // binding, rather than send its top/bottom edge far across the other page.
 for(let u=0;u<=1;u+=.025)for(let v=0;v<=1;v+=.025){
  const p=fold(u,v,.8,width,height,corner);assert.ok(p.y>=-width*.07&&p.y<=height+width*.07);
 }
 for(const [u,v] of [[1,corner],[.8,.5],[.3,1-corner]]){
  let previous=fold(u,v,0,width,height,corner);
  for(let i=1;i<=1000;i++){
   const p=fold(u,v,i/1000,width,height,corner);
   assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)<width*.02,'The broadened bend and landing must remain continuous');previous=p;
  }
 }
}
// The entire sheet travels together; a roll would reverse its tangent direction
// by nearly pi within a single page. Normal reading curvature stays below 26°.
for(const q of [.1,.25,.5,.75,.9])for(const row of [0,.5,1]){
 const a=arcFrame(0,row,q),b=arcFrame(.83,row,q);
 assert.ok(Math.acos(Math.max(-1,Math.min(1,a.ux*b.ux+a.uz*b.uz)))<.45);
}
// Hover alone lifts only the corner margin, leaving the rest of the page flat.
for(const corner of [0,1]){
 const fixed=fold(.8,.5,.075,350,480,corner,0,1,0),tip=fold(1,corner,.075,350,480,corner,0,1,0);
 assert.ok(Math.abs(fixed.x-280)<1e-8&&Math.abs(fixed.z)<1e-8);assert.ok(tip.z>5&&tip.z<20);
}
console.log('Spread arc checks passed: full-sheet bending, limited tangent span, subtle hover curl and continuous mirrored landings.');
