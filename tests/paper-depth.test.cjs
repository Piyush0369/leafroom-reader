const assert=require('node:assert/strict');
const {edgeTopology,materialStyle,PaperSurface}=require('../paper-surface.js');
const {PaperTurn,pageSize}=require('../paper-turn.js');
// Border-box dimensions keep the native page and its texture on the same grid.
assert.deepEqual(pageSize({offsetWidth:350,offsetHeight:480,clientWidth:348,clientHeight:478}),{width:350,height:480});
assert.deepEqual(pageSize({clientWidth:300,clientHeight:412}),{width:300,height:412});
for(const [columns,rows] of [[4,3],[112,72]]){
 const edge=edgeTopology(columns,rows);assert.equal(edge.segments,2*(columns+rows));
 assert.equal(edge.vertices.length,edge.segments*6);assert.equal(edge.indices.length,edge.segments*6);
 for(let i=0;i<edge.segments;i++){
  const [u,v,front,u2,v2,back]=edge.vertices.slice(i*6,i*6+6);
  assert.equal(u,u2);assert.equal(v,v2);assert.equal(front,-1);assert.equal(back,1);
  assert.ok(u===0||u===1||v===0||v===1,'Sidewalls run only around the page perimeter');
 }
 const counts=new Map();for(let i=0;i<edge.indices.length;i+=3){const tri=edge.indices.slice(i,i+3);for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');counts.set(key,(counts.get(key)||0)+1);}}
 assert.ok([...counts.values()].every(n=>n===1||n===2));assert.equal([...counts.values()].filter(n=>n===1).length,edge.segments*2,'Both rim rings remain continuous');
}
assert.ok(materialStyle(false).thickness<1);assert.ok(materialStyle(true).thickness>materialStyle(false).thickness);
// All additional buffers and textures must be released exactly once.
const freed=[],gl={deleteBuffer:x=>freed.push(x),deleteTexture:x=>freed.push(x),deleteProgram:x=>freed.push(x),deleteShader:x=>freed.push(x),getExtension:()=>({loseContext:()=>freed.push('context')})};
const surface=Object.create(PaperSurface.prototype);Object.assign(surface,{gl,vertices:'face-v',indices:'face-i',edgeVertices:'edge-v',edgeIndices:'edge-i',shadowVertices:'shadow-v',shadowIndices:'shadow-i',textures:['front','back'],program:'program',vertex:'vertex',fragment:'fragment',canvas:{width:100,height:100}});
surface.destroy();surface.destroy();assert.equal(new Set(freed).size,12);assert.equal(freed.length,12);assert.equal(surface.canvas.width,0);
(async()=>{
 const classes=new Set(['paper-hidden']);let animations=0;
 const shared={width:700,height:960,classList:{contains:name=>name==='page-artwork'}};
 const turn=Object.create(PaperTurn.prototype);Object.assign(turn,{options:{hidden:{classList:{remove:v=>classes.delete(v)}}},overlay:{style:{},animate(){animations++;},remove(){}},images:[shared],surface:{destroy(){}}});
 global.cancelAnimationFrame=()=>{};
 await turn.reveal();assert.equal(classes.has('paper-hidden'),false);assert.equal(turn.overlay.style.opacity,'0');assert.equal(animations,0,'Identical artwork needs no settling fade');
 turn.destroy();assert.equal(shared.width,700,'Destroying a turn must preserve its shared resting artwork');
 console.log('Paper depth checks passed: border-box sizing, continuous thin rims, material thickness, GPU cleanup and immediate shared-artwork reveal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
