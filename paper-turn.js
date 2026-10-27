/* A shared page raster stays on the resting page and supplies the curved GPU surface. */
(() => {
  function pageSize(face){return {width:face.offsetWidth||face.clientWidth,height:face.offsetHeight||face.clientHeight};}
  function splitCss(value){let depth=0,start=0,parts=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&!depth){parts.push(value.slice(start,i).trim());start=i+1;}}parts.push(value.slice(start).trim());return parts;}
  function paintGradient(ctx,value,width,height){
    if(!value?.startsWith('linear-gradient('))return;
    const parts=splitCss(value.slice(16,-1)),angle=parseFloat(parts[0]);if(!Number.isFinite(angle))return;
    const radians=angle*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians),length=Math.abs(width*dx)+Math.abs(height*dy);
    const gradient=ctx.createLinearGradient(width/2-dx*length/2,height/2-dy*length/2,width/2+dx*length/2,height/2+dy*length/2);
    const stops=parts.slice(1).map(part=>{const match=part.match(/^(.*?)\s+([\d.]+)%$/);return {color:match?match[1]:part,at:match?Number(match[2])/100:null};});
    if(!stops.length)return;stops[0].at??=0;stops.at(-1).at??=1;
    for(let i=1;i<stops.length-1;i++)if(stops[i].at===null){let end=i+1;while(stops[end].at===null)end++;const begin=i-1;for(let k=i;k<end;k++)stops[k].at=stops[begin].at+(stops[end].at-stops[begin].at)*(k-begin)/(end-begin);i=end-1;}
    for(const stop of stops)gradient.addColorStop(Math.max(0,Math.min(1,stop.at)),stop.color);
    ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  }
  async function fallbackSnapshot(face) {
    const {width,height}=pageSize(face);
    if(!width||!height)throw new Error('Page is not ready');
    const camera=face.closest('.book')?.parentElement;
    const screenScale=camera?camera.getBoundingClientRect().width/Math.max(1,camera.offsetWidth):1;
    const ratio=artworkRatio(width,height,screenScale,window.devicePixelRatio||1);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
    const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
    const faceStyle=getComputedStyle(face);ctx.fillStyle=faceStyle.backgroundColor;ctx.fillRect(0,0,width,height);paintGradient(ctx,faceStyle.backgroundImage,width,height);
    // Measure a flattened, hidden copy: live faces may already be rotated.
    const copy=face.cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('.page-artwork').forEach(node=>node.remove());copy.classList.remove('page-art-ready','paper-hidden','single-current','single-incoming','single-outgoing','single-returning','single-drag-incoming','turning','turning-back','dragging');
    copy.style.cssText=`position:fixed!important;left:-10000px!important;top:0!important;width:${width}px!important;height:${height}px!important;transform:none!important;visibility:hidden!important;animation:none!important;transition:none!important;zoom:1!important;`;
    document.body.append(copy);
    try {
      const origin=copy.getBoundingClientRect();
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.left-origin.left,y:r.top-origin.top,width:r.width,height:r.height};};
      const contain=(source,box)=>{
        const sw=source.naturalWidth||source.width,sh=source.naturalHeight||source.height;
        if(!sw||!sh)return;const scale=Math.min(box.width/sw,box.height/sh);
        ctx.drawImage(source,box.x+(box.width-sw*scale)/2,box.y+(box.height-sh*scale)/2,sw*scale,sh*scale);
      };
      // DOM cloning does not copy canvas pixels; pair each copy with its source.
      [...copy.querySelectorAll('canvas')].forEach((node,i)=>contain(face.querySelectorAll('canvas')[i],rect(node)));
      const sourceImages=[...face.querySelectorAll('img')];
      for(const [i,node] of [...copy.querySelectorAll('img')].entries()){
        const source=sourceImages[i];try{await source.decode();contain(source,rect(node));}catch{}
      }
      for(const node of copy.querySelectorAll('svg')){
        const box=rect(node),svg=node.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',box.width);svg.setAttribute('height',box.height);
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
        try{const img=new Image();img.src=url;await img.decode();contain(img,box);}catch{}finally{URL.revokeObjectURL(url);}
      }
      const walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode,parent=node.parentElement;
        if(parent.closest('svg,script,style')||!node.textContent.trim())continue;
        const style=getComputedStyle(parent);
        ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.color;ctx.textBaseline='alphabetic';
        if('fontKerning' in ctx)ctx.fontKerning=style.fontKerning;
        if('letterSpacing' in ctx)ctx.letterSpacing=style.letterSpacing==='normal'?'0px':style.letterSpacing;
        for(const match of node.textContent.matchAll(/\S+/g)){
          const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
          const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
          const text=style.textTransform==='uppercase'?match[0].toUpperCase():match[0];
          const metrics=ctx.measureText(text),ascent=metrics.fontBoundingBoxAscent??parseFloat(style.fontSize)*.8;
          ctx.fillText(text,r.left-origin.left,r.top-origin.top+ascent);
        }
      }
      const overlay=getComputedStyle(copy,'::after');ctx.save();ctx.globalAlpha=Number(overlay.opacity)||0;paintGradient(ctx,overlay.backgroundImage,width,height);ctx.restore();
      const border=parseFloat(faceStyle.borderLeftWidth)||0;if(border){ctx.strokeStyle=faceStyle.borderLeftColor;ctx.lineWidth=border;ctx.strokeRect(border/2,border/2,width-border,height-border);}
      return canvas;
    } finally {copy.remove();}
  }
  function artworkRatio(width,height,scale=1,dpr=1){
    // Headroom covers the small perspective enlargement at the raised corner.
    return Math.min(Math.max(2,scale*dpr*1.2),12,4096/Math.max(width,height),Math.sqrt(10e6/(width*height)));
  }
  function displayScale(face){const camera=face.closest('.book')?.parentElement;return camera?camera.getBoundingClientRect().width/Math.max(1,camera.offsetWidth):1;}
  async function imageData(source){
    if(source.startsWith('data:'))return source;
    const blob=await (await fetch(source)).blob();
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }
  async function browserSnapshot(face,ratio){
    await document.fonts?.ready;
    await Promise.all([...face.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));
    const {width,height}=pageSize(face),copy=face.cloneNode(true);
    copy.querySelectorAll('.page-artwork').forEach(node=>node.remove());copy.classList.remove('page-art-ready');
    const originals=[face,...face.querySelectorAll('*:not(.page-artwork)')],copies=[copy,...copy.querySelectorAll('*')];
    const prepared=face.classList.contains('page-art-ready');face.classList.remove('page-art-ready');
    let overlay;
    try{
      overlay=getComputedStyle(face,'::after');
      // Use the browser's own text shaping and layout, rather than repainting words.
      for(let i=0;i<originals.length;i++){
        const style=getComputedStyle(originals[i]),target=copies[i];
        for(const property of style)target.style.setProperty(property,style.getPropertyValue(property));
        target.style.visibility='visible';target.style.opacity=style.opacity;
        target.removeAttribute('id');
      }
      const shade=document.createElement('div');
      shade.style.cssText=`position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:${overlay.backgroundImage};opacity:${overlay.opacity}`;
      copy.append(shade);
    }finally{if(prepared)face.classList.add('page-art-ready');}
    copy.style.cssText+=`;position:relative!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;margin:0!important;width:${width}px!important;height:${height}px!important;transform:none!important;zoom:1!important;visibility:visible!important;opacity:1!important;animation:none!important;transition:none!important;box-shadow:none!important;`;
    const originalCanvases=[...face.querySelectorAll('canvas:not(.page-artwork)')];
    [...copy.querySelectorAll('canvas')].forEach((node,i)=>{const image=document.createElement('img');image.style.cssText=node.style.cssText;image.src=originalCanvases[i].toDataURL();image.width=originalCanvases[i].width;image.height=originalCanvases[i].height;node.replaceWith(image);});
    for(const image of copy.querySelectorAll('img'))image.setAttribute('src',await imageData(image.getAttribute('src')));
    copy.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
    const markup=new XMLSerializer().serializeToString(copy);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width*ratio)}" height="${Math.ceil(height*ratio)}" viewBox="0 0 ${width} ${height}"><foreignObject width="${width}" height="${height}">${markup}</foreignObject></svg>`;
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    // Some engines prohibit foreignObject canvas readback. Keep a shared fallback there.
    if(!canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3])throw new Error('Empty browser page raster');
    canvas.dataset.renderer='browser';return canvas;
  }
  // PDF.js already provides final pixels. Avoid serializing a live PDF canvas
  // through foreignObject, which can capture an incomplete/hidden compositor layer.
  function pdfSnapshot(face,ratio){
    const source=face.querySelector('canvas:not(.page-artwork)');
    if(!source?.width||!source?.height)throw new Error('PDF pixels are not ready');
    const {width,height}=pageSize(face),style=getComputedStyle(face);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
    const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
    ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,width,height);paintGradient(ctx,style.backgroundImage,width,height);
    const left=parseFloat(style.borderLeftWidth)||0,right=parseFloat(style.borderRightWidth)||0;
    const top=parseFloat(style.borderTopWidth)||0,bottom=parseFloat(style.borderBottomWidth)||0;
    const availableWidth=width-left-right,availableHeight=height-top-bottom;
    const fit=Math.min(availableWidth/source.width,availableHeight/source.height);
    const w=source.width*fit,h=source.height*fit;
    ctx.drawImage(source,left+(availableWidth-w)/2,top+(availableHeight-h)/2,w,h);
    const border=left;if(border){ctx.strokeStyle=style.borderLeftColor;ctx.lineWidth=border;ctx.strokeRect(border/2,border/2,width-border,height-border);}
    canvas.dataset.renderer='pdf';return canvas;
  }
  const artwork=new Map();
  function artworkKey(face){
    const {width,height}=pageSize(face),ratio=artworkRatio(width,height,displayScale(face),window.devicePixelRatio||1);
    const children=[...face.children].filter(node=>!node.classList.contains('page-artwork'));
    return {width,height,ratio,children,key:[width,height,Math.ceil(ratio*20),face.textContent,...face.querySelectorAll('canvas:not(.page-artwork),img')].map(value=>typeof value==='object'?[value.currentSrc||'',value.width,value.height].join(':'):value).join('|')};
  }
  function discardArtwork(face,entry){
    entry.stale=true;entry.canvas?.remove();entry.resting?.remove();face.classList.remove('page-art-ready');
    // An active turn owns its texture until destroy; do not zero its source.
    artwork.delete(face);
  }
  class PageArtwork {
    static async capture(face,ratio){
      if(face.classList.contains('pdf-page'))return pdfSnapshot(face,ratio);
      try{return await browserSnapshot(face,ratio);}catch{return fallbackSnapshot(face);}
    }
    static prepare(face){
      if(!face||face.isConnected===false)return Promise.resolve(null);
      if(face.dataset.rendering&&face.pdfRenderTask)return face.pdfRenderTask.then(()=>PageArtwork.prepare(face));
      const state=artworkKey(face),previous=artwork.get(face);
      if(previous&&previous.key===state.key&&previous.children.length===state.children.length&&previous.children.every((node,i)=>node===state.children[i]))return previous.promise;
      // Keep the existing visual layer until its replacement is ready, including zoom upgrades.
      const resting=[...face.children].find(node=>node.classList.contains('page-artwork'));
      if(previous)previous.stale=true;
      if(!resting)face.classList.remove('page-art-ready');
      const entry={...state,resting};artwork.set(face,entry);
      entry.promise=(async()=>{
        const canvas=await PageArtwork.capture(face,state.ratio);
        if(entry.stale||!face.isConnected){canvas.width=canvas.height=0;return null;}
        const style=getComputedStyle(face);canvas.className='page-artwork';canvas.setAttribute('aria-hidden','true');
        canvas.style.cssText=`left:-${style.borderLeftWidth};top:-${style.borderTopWidth};width:${state.width}px!important;height:${state.height}px!important;`;
        entry.resting?.remove();entry.resting=null;entry.canvas=canvas;face.append(canvas);face.classList.add('page-art-ready');
        return canvas;
      })().catch(error=>{if(artwork.get(face)===entry)discardArtwork(face,entry);throw error;});
      return entry.promise;
    }
    static refresh(book){
      // Detached books and distant pages must not keep high-resolution canvases alive.
      for(const [face,entry] of artwork)if(!face.isConnected)discardArtwork(face,entry);
      const visible=[...book.querySelectorAll('.face[aria-hidden="false"]')];
      visible.forEach(face=>PageArtwork.prepare(face).catch(()=>{}));
      if(artwork.size>8)for(const [face,entry] of artwork){if(artwork.size<=8)break;if(!visible.includes(face)&&!face.closest('.paper-hidden'))discardArtwork(face,entry);}
    }
    static clear(book){for(const [face,entry] of artwork)if(book.contains(face)||!face.isConnected)discardArtwork(face,entry);}
  }
  function neutralPaper(face){
    const canvas=document.createElement('canvas');const size=pageSize(face);canvas.width=size.width;canvas.height=size.height;
    const ctx=canvas.getContext('2d'),shade=ctx.createLinearGradient(0,0,canvas.width,0);
    shade.addColorStop(0,'#eee8d9');shade.addColorStop(.15,'#fcf8ed');shade.addColorStop(1,'#f6f1e5');
    ctx.fillStyle=shade;ctx.fillRect(0,0,canvas.width,canvas.height);return canvas;
  }
  const layerOwners=new WeakMap();
  class PaperTurn {
    static retainLayers(layers=[]){
      const owner={};let released=false;
      for(const face of layers){let owners=layerOwners.get(face);if(!owners){owners=new Set();layerOwners.set(face,owners);}owners.add(owner);face.classList.add('spread-layer');}
      return ()=>{if(released)return;released=true;for(const face of layers){const owners=layerOwners.get(face);owners?.delete(owner);if(!owners?.size){face.classList.remove('spread-layer');layerOwners.delete(face);}}};
    }
    static async create(options){
      const images=await Promise.all([options.blankSide==='front'?neutralPaper(options.front):PageArtwork.prepare(options.front),options.blankSide==='back'?neutralPaper(options.back):PageArtwork.prepare(options.back),options.underlay?PageArtwork.prepare(options.underlay):null,...(options.layers||[]).map(face=>PageArtwork.prepare(face))]);
      if(!images[0]||!images[1])throw new Error('Page changed during preparation');
      return new PaperTurn(options,images.slice(0,2));
    }
    constructor(options,images){
      this.options=options;this.images=images;const size=pageSize(options.front);this.width=size.width;this.height=size.height;
      this.surface=new PaperSurface(images,this.width,this.height,options);this.progress=options.delta>0?0:1;this.disposed=false;
    }
    mount(){
      const {book,delta,single,hidden}=this.options;
      this.overlay=document.createElement('div');this.overlay.className='paper-turn';this.overlay.setAttribute('aria-hidden','true');
      this.overlay.style.cssText=`width:${this.width}px;height:${this.height}px;left:${single&&delta<0&&!this.options.incoming?this.width:0}px;`;
      this.overlay.append(this.surface.canvas);
      this.releaseLayers=PaperTurn.retainLayers(this.options.layers);
      this.options.underlay?.classList.add('single-underlay');
      hidden.classList.add('paper-hidden');book.append(this.overlay);this.seek(this.progress);return this;
    }
    seek(progress){
      if(this.disposed||!this.overlay)return;
      this.progress=Math.max(0,Math.min(1,progress));
      const camera=this.options.book.parentElement;
      const scale=camera.getBoundingClientRect().width/Math.max(1,camera.offsetWidth);
      this.surface.draw(this.progress,scale,this.grip);

    }
    async reveal(){
      if(this.disposed||!this.overlay)return;
      this.options.hidden.classList.remove('paper-hidden');
      // Both surfaces now use the same artwork: no fade or second text rendering.
      this.overlay.style.opacity='0';
    }
    stopAnimation(){cancelAnimationFrame(this.raf);this.resolve?.();this.resolve=null;}
    follow(progress,grip=null){
      if(this.resolve)this.stopAnimation();
      if(grip)this.options.cornerV=grip.v;
      this.dragged=true;this.grip=grip;this.seek(progress);
    }
    setMomentum(velocity){this.dragged=true;this.velocity=Math.max(-4,Math.min(4,Number.isFinite(velocity)?velocity:0));}
    settle(target){
      // Start release at the angle actually drawn under the finger, rather than
      // the input's older roll mapping. This prevents a recoil at pointer-up.
      if(Number.isFinite(this.surface?.lastProgress))this.progress=this.surface.lastProgress;
      const distance=Math.max(.001,Math.abs(target-this.progress));
      // A quicker, near-critical landing preserves momentum without a long
      // barely-visible spring tail blocking the next gesture.
      const pace=Math.min(1,Math.abs(this.velocity||0)/3);
      let motion={value:this.progress,velocity:this.velocity||0},relax={value:this.grip?.strength||0,velocity:0};
      const roll=this.grip?.roll||(this.options.incoming&&this.grip?.incoming),releaseGrip=this.grip?{...this.grip}:null;
      const releaseCrease=(1+Math.cos(Math.PI*this.progress))/2;
      return new Promise(resolve=>{
        this.resolve=resolve;let last,began;
        const frame=now=>{
          if(this.disposed){resolve();return;}last??=now-16;began??=now;
          const dt=Math.min(.04,(now-last)/1000);last=now;
          // Keep the initial pull gentle, then remove the slow settling tail.
          // Ramping the spring avoids a sudden acceleration at finger release.
          const landedFraction=1-Math.min(1,Math.abs(target-motion.value)/distance);
          const ramp=landedFraction*landedFraction*(3-2*landedFraction);
          const stiffness=140+110*pace+(700+500*pace)*ramp,damping=2*Math.sqrt(stiffness)*1.03;
          motion=PaperDynamics.spring(motion,target,dt,stiffness,damping);relax=PaperDynamics.spring(relax,0,dt,100,21);
          const remaining=Math.max(0,Math.min(1,Math.abs(target-motion.value)/distance));
          if(this.grip){
            const strength=Math.max(0,Math.min(1,relax.value))*remaining*remaining*(3-2*remaining);
            if(roll){
              const progress=Math.max(0,Math.min(1,motion.value)),crease=(1+Math.cos(Math.PI*progress))/2;
              this.grip=PaperDynamics.rollGrip(progress,releaseGrip.v,crease+(releaseGrip.targetX-releaseCrease)*strength,releaseGrip.v+(releaseGrip.targetY-releaseGrip.v)*strength,strength);
              if(releaseGrip.incoming)this.grip.incoming=true;if(releaseGrip.forward)this.grip.forward=true;
            }else this.grip.strength=strength;
          }
          const landed=(target===1?motion.value>=1:motion.value<=0)&&motion.velocity*(target===1?1:-1)>0;
          this.seek(landed?target:motion.value);
          const done=landed||(Math.abs(motion.value-target)<.001&&Math.abs(motion.velocity)<.035);
          if(done||now-began>900){this.grip=null;this.seek(target);this.resolve=null;resolve();}
          else this.raf=requestAnimationFrame(frame);
        };this.raf=requestAnimationFrame(frame);
      });
    }
    animate(target,duration=480,options={}){
      if(this.disposed)return Promise.resolve();
      this.stopAnimation();
      if(this.dragged)return this.settle(target);
      const strength=this.grip?.strength||0,previewReturn=this.grip?.hover&&target===(this.options.delta>0?0:1);
      const start=this.progress,distance=Math.abs(target-start),time=Math.max(180,duration*distance);
      return new Promise(resolve=>{
        this.resolve=resolve;let began;
        const frame=now=>{if(this.disposed){resolve();return;}began??=now;const t=Math.min(1,(now-began)/time);const eased=t*t*t*(10+t*(-15+6*t));if(this.grip&&!options.preview&&!previewReturn)this.grip.strength=strength*(1-eased);this.seek(start+(target-start)*eased);if(t<1)this.raf=requestAnimationFrame(frame);else{this.resolve=null;resolve();}};
        this.raf=requestAnimationFrame(frame);
      });
    }
    destroy(){
      if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);this.resolve?.();
      if(this.overlay){this.options.hidden.classList.remove('paper-hidden');this.options.underlay?.classList.remove('single-underlay');}this.overlay?.remove();this.releaseLayers?.();
      this.images.forEach(canvas=>{if(!canvas.classList?.contains('page-artwork'))canvas.width=canvas.height=0;});
      this.surface?.destroy();
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={PaperTurn,PageArtwork,pageSize,paintGradient,artworkRatio,pdfSnapshot};
  else {window.PaperTurn=PaperTurn;window.PageArtwork=PageArtwork;}
})();
