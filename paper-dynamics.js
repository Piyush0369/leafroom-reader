/* Pointer-space grips, timestamped velocity, and frame-rate-independent release physics. */
(() => {
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function corner(rect,x,y,delta){
    const width=rect.width,height=rect.height;if(!width||!height)return null;
    const zone=clamp(Math.min(width,height)*.22,30,80);
    if(x<rect.left-5||x>rect.left+width+5||y<rect.top-5||y>rect.top+height+5)return null;
    const outer=delta>0?x>=rect.left+width-zone:x<=rect.left+zone;
    if(!outer||(y>rect.top+zone&&y<rect.top+height-zone))return null;
    const pageX=clamp((x-rect.left)/width,0,1);
    return {delta,width,height,x,y,v:clamp((y-rect.top)/height,0,1),u:clamp(delta>0?pageX:1-pageX,.55,1)};
  }
  // Both directions pin the visible roll using the same bounded correction.
  function rollGrip(progress,v,targetX=(1+Math.cos(Math.PI*progress))/2,targetY=v,strength=1){
    const wave=Math.sin(Math.PI*progress),side=v<.5?-1:1;
    const pull=(targetY-v)*-side*strength;
    const slope=side*clamp(.46+pull*.55,.30,.68)*wave;
    const crease=(1+Math.cos(Math.PI*progress))/2;
    const u=clamp(crease-(v-(side<0?0:1))*slope,.025,.975);
    return {roll:true,u,v,strength,targetX,targetY};
  }
  function incomingGrip(...args){return {...rollGrip(...args),incoming:true};}
  function forwardGrip(...args){return {...rollGrip(...args),forward:true};}
  function forwardDrag(grip,x,y){
    const travel=grip.x-x,vertical=clamp((y-grip.y)/grip.height,-.35,.35);
    const targetX=clamp(grip.u-travel/grip.width,-.25,1.25);
    const progress=Math.acos(2*clamp(targetX,0,1)-1)/Math.PI;
    return {amount:progress,progress,complete:travel>=grip.width*.55,
      grip:forwardGrip(progress,grip.v,targetX,grip.v+vertical)};
  }
  function incomingDrag(grip,x,y){
    const travel=x-grip.x,vertical=clamp((y-grip.y)/grip.height,-.35,.35);
    const targetX=clamp(1-grip.u+travel/grip.width,-.25,1.25);
    const progress=Math.acos(2*clamp(targetX,0,1)-1)/Math.PI;
    return {amount:1-progress,progress,complete:travel>=grip.width*.55,
      grip:incomingGrip(progress,grip.v,targetX,grip.v+vertical)};
  }
  function rollVelocity(progress,speed){return clamp(-2*speed/(Math.PI*Math.max(.2,Math.sin(Math.PI*progress))),-4,4);}
  const incomingVelocity=rollVelocity;
  function drag(grip,x,y){
    if(grip.forward)return forwardDrag(grip,x,y);
    if(grip.incoming)return incomingDrag(grip,x,y);
    const travel=(x-grip.x)*-grip.delta,vertical=clamp((y-grip.y)/grip.height,-.35,.35);
    const distance=clamp((travel+Math.abs(vertical)*grip.width*.12)/(grip.width*grip.u),0,1.98);
    const amount=Math.acos(1-distance)/Math.PI;
    return {amount,progress:grip.delta>0?amount:1-amount,complete:travel>=grip.width*.55,
      grip:{u:grip.u,v:grip.v,strength:1,targetX:grip.delta*grip.u+(x-grip.x)/grip.width,targetY:grip.v+vertical}};
  }
  // Input timestamps, rather than rendered frames, keep flicks consistent when
  // textures are preparing or pointer events arrive at different frame rates.
  function sampleMotion(samples,x,y,time){
    if(!Number.isFinite(time))return samples;
    const last=samples.at(-1);if(last&&time<last.time)return samples;
    const next=last&&time===last.time?samples.slice(0,-1):samples.slice();
    next.push({x,y,time});
    while(next.length>2&&next[1].time<time-160)next.shift();
    return next.slice(-48);
  }
  function motionVelocity(samples,now){
    if(samples.length<2)return 0;
    let moved=-Infinity,anchor=samples[0];
    for(let i=1;i<samples.length;i++)if(Math.abs(samples[i].x-anchor.x)>.3){moved=samples[i].time;anchor=samples[i];}
    if(now-moved>=100)return 0;
    const cutoff=now-100;
    let points=samples.filter(point=>point.time>=cutoff);
    const prior=samples.filter(point=>point.time<cutoff).at(-1);
    if(prior&&points.length){const first=points[0],t=(cutoff-prior.time)/(first.time-prior.time);points=[{x:prior.x+(first.x-prior.x)*t,time:cutoff},...points];}
    if(points.length<2)return 0;
    let weight=0,meanT=0,meanX=0;
    for(const p of points){const w=Math.exp((p.time-now)/50);weight+=w;meanT+=w*(p.time-now)/1000;meanX+=w*p.x;}
    meanT/=weight;meanX/=weight;
    let covariance=0,variance=0;
    for(const p of points){const w=Math.exp((p.time-now)/50),t=(p.time-now)/1000-meanT;covariance+=w*t*(p.x-meanX);variance+=w*t*t;}
    let speed=variance>1e-8?covariance/variance:0;
    // A deliberate last-moment reversal must override older forward samples.
    const last=points.at(-1);
    for(let i=points.length-2;i>=0;i--){
      const dt=last.time-points[i].time,dx=last.x-points[i].x;
      if(dt>50)break;
      if(dt>=4&&Math.abs(dx)>=4){const tail=dx/(dt/1000);if(tail*speed<0)speed=tail;break;}
    }
    return speed*Math.exp(-Math.max(0,now-moved-16)/45);
  }
  function release(grip,x,y,samples,now,cancel=false){
    const state=drag(grip,x,y),travel=(x-grip.x)*-grip.delta;
    const speed=cancel?0:clamp(-grip.delta*motionVelocity(samples,now)/grip.width,-8,8);
    const projected=travel/grip.width+speed*.18;
    const flick=travel>=Math.max(24,grip.width*.09)&&speed>.75&&projected>=.55;
    const pulledBack=speed<-.8&&projected<.55;
    const velocity=cancel||speed===0?0:(grip.incoming||grip.forward)?rollVelocity(state.progress,-grip.delta*speed):grip.delta*clamp(speed/(Math.PI*grip.u*Math.max(.2,Math.sin(Math.PI*state.amount))),-4,4);
    return {complete:!cancel&&!pulledBack&&(state.complete||flick),velocity,speed,projected};
  }
  // Lock a body swipe to its initial direction. A reversal cancels that turn,
  // rather than unexpectedly starting a different sheet at pointer release.
  function swipeRelease(delta,dx,dy,width,samples,now,cancel=false){
    const travel=-delta*dx,speed=clamp(-delta*motionVelocity(samples,now)/width,-8,8);
    const threshold=clamp(width*.23,40,110),projected=travel/width+speed*.15;
    const flick=travel>=18&&speed>.65&&projected>=.23;
    const reverse=speed<-.8&&projected<.23;
    return {complete:!cancel&&Math.abs(dx)>Math.abs(dy)*1.2&&travel>0&&!reverse&&(travel>=threshold||flick),velocity:cancel?0:delta*clamp(speed,-4,4)};
  }
  function peek(grip){
    if(grip.incoming)return {progress:.925,grip:{...incomingGrip(.925,grip.v),hover:1}};
    if(grip.forward)return {progress:.075,grip:{...forwardGrip(.075,grip.v),hover:1}};
    return {progress:grip.delta>0?.075:.925,grip:{u:grip.u,v:grip.v,strength:1,hover:1,targetX:grip.delta*(grip.u-.012),targetY:grip.v+(grip.v<.5?.012:-.012)}};
  }
  function spring(state,target,dt,stiffness=190,damping=24){
    let {value,velocity}=state;
    const count=Math.max(1,Math.ceil(Math.min(.064,Math.max(0,dt))*120)),step=Math.min(.064,Math.max(0,dt))/count;
    for(let i=0;i<count;i++){velocity+=((target-value)*stiffness-velocity*damping)*step;value+=velocity*step;}
    return {value,velocity};
  }
  const api={corner,drag,rollGrip,rollVelocity,forwardGrip,forwardDrag,incomingGrip,incomingDrag,incomingVelocity,sampleMotion,motionVelocity,release,swipeRelease,peek,spring};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.PaperDynamics=api;
})();
