const assert=require('node:assert/strict');
const {arcFrame,fold,deform,topology}=require('../paper-surface.js');
const width=350,mesh=topology();
assert.equal(mesh.uv.length,(mesh.columns+1)*(mesh.rows+1)*2);
assert.equal(mesh.indices.length,mesh.columns*mesh.rows*6);
assert.ok([...mesh.uv].every(value=>value>=0&&value<=1));
assert.equal(Math.max(...mesh.indices),mesh.uv.length/2-1);
// Every triangle uses shared grid indices. Internal edges belong to exactly two
// triangles; boundary edges to one. No overlapping strip geometry exists.
const edges=new Map();
for(let i=0;i<mesh.indices.length;i+=3){
 const tri=[...mesh.indices.slice(i,i+3)];
 for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(key,(edges.get(key)||0)+1);}
}
assert.ok([...edges.values()].every(value=>value===1||value===2));
assert.equal([...edges.values()].filter(value=>value===1).length,2*(mesh.columns+mesh.rows));
// Test the actual surface, including all four corner/direction combinations.
for(const direction of [1,-1])for(const corner of [0,1])for(let q=0;q<=1;q+=.025)for(let u=0;u<=1;u+=.1)for(let v=0;v<=1;v+=.1){
 const p=direction>0?q:1-q,current=deform(u,v,p,width,480,0,null,undefined,direction,corner);
 assert.ok(Object.values(current).every(Number.isFinite));assert.ok(current.z>-1e-8);
 const back=deform(u,v,1-p,width,480,0,null,undefined,-direction,corner);
 assert.ok(Math.abs(current.x+back.x)<1e-7);assert.ok(Math.abs(current.y-back.y)<1e-7);assert.ok(Math.abs(current.z-back.z)<1e-7);
 if(u===0){assert.ok(Math.abs(current.x)<1e-7);assert.ok(Math.abs(current.z)<1e-7);assert.ok(Math.abs(current.y-v*480)<1e-7);}
}
for(const q of [0,1])for(const v of [0,.5,1]){
 const flat=fold(1,v,q,width,480,0);assert.ok(Math.abs(flat.x-(q?-width:width))<1e-7);assert.ok(Math.abs(flat.y-v*480)<1e-7);assert.ok(Math.abs(flat.z)<1e-7);
}
// The full page participates, with only a small additional curl at the chosen corner.
const peeled=fold(1,0,.3,width,480,0),farCorner=fold(1,1,.3,width,480,0);
assert.ok(peeled.z>width*.7&&farCorner.z>width*.7);assert.ok(Math.hypot(peeled.x-farCorner.x,peeled.z-farCorner.z)<width*.025);
for(const q of [.15,.3,.5,.7,.9])for(const v of [0,.25,.5,.75,1]){
 const top=fold(.9,v,q,width,480,0),bottom=fold(.9,1-v,q,width,480,1);
 assert.ok(Math.abs(top.x-bottom.x)<1e-7);assert.ok(Math.abs(top.z-bottom.z)<1e-7);assert.ok(Math.abs(top.y+bottom.y-480)<1e-7);
}
// Main text stays isometric; the small corner margin has bounded shear below 0.3%.
for(const q of [.2,.4,.65,.85])for(const u of [.25,.63,.92])for(const v of [.1,.45,.86]){
 const h=1e-6,a=fold(u,v,q,width,480,0),b=fold(u+h,v,q,width,480,0),c=fold(u,v+h,q,width,480,0);
 const du={x:(b.x-a.x)/h,y:(b.y-a.y)/h,z:(b.z-a.z)/h},dv={x:(c.x-a.x)/h,y:(c.y-a.y)/h,z:(c.z-a.z)/h};
 assert.ok(Math.abs(Math.hypot(du.x,du.y,du.z)-width)<.01);assert.ok(Math.abs(Math.hypot(dv.x,dv.y,dv.z)-480)<.4);
 assert.ok(Math.abs((du.x*dv.x+du.y*dv.y+du.z*dv.z)/(width*480))<.003);
}
// Covers remain stiff while paper has a diagonal fold.
const paper=deform(1,0,.5,width,480,0,null,undefined,1,0),cover=deform(1,0,.5,width,480,.94,null,undefined,1,0);
assert.ok(Math.abs(cover.x)<Math.abs(paper.x));assert.ok(Math.abs(cover.z-width)<Math.abs(paper.z-width));
console.log('Page arc checks passed: shared edges, whole-page bending, top/bottom reflection, both directions, anchored spine, flat endpoints and stiff covers.');

// A stale snapshot that never mounted must not unhide a newer owner's page.
const {PaperTurn}=require('../paper-turn.js');
global.cancelAnimationFrame=()=>{};
let removed=0,released=0;
const pending=Object.create(PaperTurn.prototype);
Object.assign(pending,{options:{hidden:{classList:{remove(){removed++;}}}},images:[],surface:{destroy(){released++;}}});
pending.destroy();pending.destroy();assert.equal(removed,0);assert.equal(released,1);
console.log('Surface lifecycle checks passed: stale preparation preserves the visible owner and releases once.');

// Releasing the finger retains the chosen subtle corner while the whole page bends.
for(const strength of [1,.5,0]){
 const g={u:.98,v:.02,strength,targetY:.02};
 const tip=deform(1,0,.3,width,480,0,g),far=deform(1,1,.3,width,480,0,g);
 assert.ok(tip.z>width*.7&&far.z>width*.7);assert.ok(Math.abs(tip.z-far.z)<width*.025);
}
const tracked=Object.create(PaperTurn.prototype);
Object.assign(tracked,{options:{cornerV:1},progress:0,seek(p){this.progress=p;}});
tracked.follow(.3,{u:.98,v:.02,strength:1});tracked.follow(.35,null);
assert.equal(tracked.options.cornerV,.02);
console.log('Release checks passed: selected corner survives strength relaxation and automatic continuation.');

// Leaving a hovered corner lowers just the corner; it must not rotate the full page.
for(const delta of [1,-1]){
 let queue=[],id=0;global.requestAnimationFrame=fn=>{queue.push({id:++id,fn});return id;};global.cancelAnimationFrame=cancel=>queue=queue.filter(f=>f.id!==cancel);
 const hover=Object.create(PaperTurn.prototype),frames=[];
 Object.assign(hover,{options:{delta},progress:delta>0?.075:.925,grip:{hover:1,strength:1},seek(q){this.progress=q;frames.push(this.grip.strength);}});
 hover.animate(delta>0?0:1,180);let now=0;while(queue.length){now+=16;queue.shift().fn(now);}
 assert.ok(frames.length>4&&frames.every(value=>value===1));assert.equal(hover.progress,delta>0?0:1);
}
// The main tangent span stays shallow across the sheet, rather than making a
// 180-degree U-turn. Its printed interior is exactly inextensible.
for(const q of [.1,.3,.5,.7,.9]){
 const spine=arcFrame(0,.5,q),edge=arcFrame(.83,.5,q);
 const angle=Math.acos(Math.max(-1,Math.min(1,spine.ux*edge.ux+spine.uz*edge.uz)));
 assert.ok(angle<.45);
}
console.log('Arc checks passed: shallow full-page curvature, a confined corner detail and preserved printed lengths.');
