/* One indexed surface, two page textures, and continuous lighting. No strip layers. */
(() => {
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const sinc=x=>Math.abs(x)<.001?1-x*x/6:Math.sin(x)/x;
  const nodes=[-.8611363116,-.3399810436,.3399810436,.8611363116];
  const weights=[.3478548451,.6521451549,.6521451549,.3478548451];
  // A page rotates as one sheet. Its tangent varies by only about 25 degrees
  // across its width; the small corner correction is confined to the margin.
  function arcFrame(u,v,q,corner=1,pull=0,hover=0,hoverBase=0){
    const wave=Math.max(0,Math.sin(Math.PI*q));
    const angle=Math.PI*(q*(1-hover)+hoverBase*hover),bow=.22*wave*(1-hover)*(1+pull*.15);
    const curl=.22*wave*(1-hover)+.6*hover*Math.min(1,Math.min(q,1-q)/.075);
    const cv=corner<.5?1-v:v,t=clamp((cv-.68)/.32,0,1),mask=t*t*(3-2*t);
    const maskV=6*t*(1-t)/.32*(corner<.5?-1:1),mid=angle+bow*(u-1);
    let x=u*sinc(bow*u)*Math.cos(mid),z=u*sinc(bow*u)*Math.sin(mid),vx=0,vz=0;
    const span=Math.max(0,u-.84);
    if(span){
      for(let i=0;i<4;i++){
        const sample=.84+span*(nodes[i]+1)/2,e=smooth(.84,1,sample),base=angle+bow*(2*sample-1),theta=base+curl*mask*e,w=span*weights[i]/2;
        x+=w*(Math.cos(theta)-Math.cos(base));z+=w*(Math.sin(theta)-Math.sin(base));
        vx-=w*Math.sin(theta)*curl*e*maskV;vz+=w*Math.cos(theta)*curl*e*maskV;
      }
    }
    const theta=angle+bow*(2*u-1)+curl*mask*smooth(.84,1,u);
    return {x,z,ux:Math.cos(theta),uz:Math.sin(theta),vx,vz};
  }
  function fold(u,v,amount,width,height,corner=1,pull=0,hover=0,hoverBase=0){
    const p=arcFrame(u,v,clamp(amount,0,1),corner,pull,hover,hoverBase);
    return {x:p.x*width,y:v*height,z:p.z*width};
  }
  function posePoint(u,v,pose,width,height,stiffness=0,direction=1){
    const q=direction>0?pose.progress:1-pose.progress;
    if(stiffness>=.9)return {x:direction*u*width*Math.cos(Math.PI*q),y:v*height,z:u*width*Math.sin(Math.PI*q)};
    const p=fold(u,v,q,width,height,pose.corner,pose.pull,pose.hover||0,pose.hoverBase||0);return {x:direction*p.x,y:p.y,z:p.z};
  }
  function deform(u,v,progress,width,height,stiffness=0,grip=null,_offset={x:0,y:0},direction=1,corner=1){
    const gripV=grip?.v??corner,side=gripV<.5?-1:1;
    const pull=((grip?.targetY??gripV)-gripV)*-side*(grip?.strength||0);
    return posePoint(u,v,{progress:clamp(progress,0,1),corner:gripV,pull,hover:grip?.hover?(grip.strength??1):0,hoverBase:grip?.incoming?1:0},width,height,stiffness,direction);
  }
  // Solve a coherent page angle and an edge contact point. The whole sheet
  // follows the finger without stretching the printed area or forming a roll.
  function solveGrip(progress,width,height,stiffness,grip,distance,eye=width/2,direction=1,corner=1){
    const physical=direction>0?progress:1-progress,originalCorner=grip?.v??corner,side=originalCorner<.5?-1:1;
    const pull=clamp(((grip?.targetY??originalCorner)-originalCorner)*-side*(grip?.strength||0)*.55,-.14,.14);
    const base={progress,corner:originalCorner,pull,hover:grip?.hover?(grip.strength??1):0,hoverBase:grip?.incoming?1:0};
    if(!grip?.strength||grip.hover||stiffness>=.9||!Number.isFinite(grip.targetX)||!Number.isFinite(grip.targetY))return base;
    const target={x:grip.targetX,y:clamp(grip.targetY,0,1)},u=(grip.roll||grip.incoming) ? .98 : grip.u;
    const point=(q,v)=>{const p=fold(u,v,q,width,height,originalCorner,pull),w=1-p.z/distance;return {x:(eye+(direction*p.x-eye)/w)/width,y:.5+(p.y/height-.5)/w,u,v};};
    let q=Math.acos(clamp(target.x/(direction*u),-1,1))/Math.PI,v=clamp(target.y,0,1);
    let result=point(q,v),error=(result.x-target.x)**2+(result.y-target.y)**2;
    for(let i=0;i<10&&error>1e-9;i++){
      const h=1e-4,qs=q>.999?-h:h,vs=v>.999?-h:h,a=point(clamp(q+qs,0,1),v),b=point(q,clamp(v+vs,0,1));
      const ax=(a.x-result.x)/qs,ay=(a.y-result.y)/qs,bx=(b.x-result.x)/vs,by=(b.y-result.y)/vs,ex=target.x-result.x,ey=target.y-result.y,det=ax*by-ay*bx;
      let dq,ds;if(Math.abs(det)>1e-7){dq=(ex*by-ey*bx)/det;ds=(ax*ey-ay*ex)/det;}else{dq=(ax*ex+ay*ey)/(ax*ax+ay*ay+1e-6);ds=(bx*ex+by*ey)/(bx*bx+by*by+1e-6);}
      dq=clamp(dq,-.16,.16);ds=clamp(ds,-.18,.18);let improved=false;
      for(const step of [1,.5,.25]){const nq=clamp(q+dq*step,0,1),nv=clamp(v+ds*step,0,1),next=point(nq,nv),ne=(next.x-target.x)**2+(next.y-target.y)**2;if(ne<error){q=nq;v=nv;result=next;error=ne;improved=true;break;}}
      if(!improved)break;
    }
    const strength=clamp(grip.strength,0,1),solved=physical+(q-physical)*strength;
    return {...base,progress:direction>0?solved:1-solved,anchor:result,error:Math.sqrt(error)};
  }

  function topology(columns=112,rows=72) {
    const uv=new Float32Array((columns+1)*(rows+1)*2),indices=new Uint16Array(columns*rows*6);
    let index=0;
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      const at=(y*(columns+1)+x)*2;uv[at]=x/columns;uv[at+1]=y/rows;
    }
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const a=y*(columns+1)+x,b=a+columns+1;
      // Counterclockwise after the screen's downward Y axis is projected.
      indices.set([a,b,a+1,a+1,b,b+1],index);index+=6;
    }
    return {uv,indices,columns,rows};
  }
  function edgeTopology(columns=112,rows=72){
    const boundary=[];
    for(let x=0;x<=columns;x++)boundary.push([x/columns,0]);
    for(let y=1;y<=rows;y++)boundary.push([1,y/rows]);
    for(let x=columns-1;x>=0;x--)boundary.push([x/columns,1]);
    for(let y=rows-1;y>0;y--)boundary.push([0,y/rows]);
    const vertices=new Float32Array(boundary.length*6),indices=new Uint16Array(boundary.length*6);
    boundary.forEach(([u,v],i)=>{vertices.set([u,v,-1,u,v,1],i*6);const a=i*2,b=((i+1)%boundary.length)*2;indices.set([a,b,a+1,a+1,b,b+1],i*6);});
    return {vertices,indices,segments:boundary.length};
  }
  const materialStyle=stiff=>({thickness:stiff?1.35:.7,shadowOpacity:stiff?.30:.24});
  // Incoming single pages unfold around the left binding, from left to right.
  const surfaceDirection=options=>options.incoming?1:options.delta||1;
  function surfaceRatio(width,height,scale=1,dpr=1,maxSize=8192){
    // Reserve pixels for the displayed page, including its transparent curl bounds.
    return Math.min(Math.max(2,scale*dpr*1.2),5,maxSize/Math.max(width,height),Math.sqrt(12e6/(width*height)));
  }
  class PaperSurface {
    constructor(images,width,height,options={}) {
      this.width=width;this.height=height;this.options=options;this.canvas=document.createElement('canvas');this.canvas.className='paper-surface';
      const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
      if(!gl)throw new Error('WebGL is unavailable');
      this.maxRenderSize=Math.min(8192,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;});
      try {this.initialize(images);}catch(error){this.destroy();throw error;}
    }
    initialize(images) {
      const gl=this.gl;
      const vertex=`
        attribute vec2 aUV;
        attribute float aSide;
        uniform mediump float uMode;
        uniform float uThickness;
        uniform vec2 uShadowOffset;
        uniform mediump float uProgress;
        uniform float uWidth,uHeight,uStiffness,uDistance,uEyeX;
        uniform vec4 uGrip;
        uniform float uPull;
        varying highp vec2 vUV;
        varying mediump vec3 vNormal;
        varying mediump float vHeight;
        uniform vec2 uHover;
        float sinc(float x){return abs(x)<.001?1.0-x*x/6.0:sin(x)/x;}
        vec3 position(vec2 uv,out vec3 du,out vec3 dv){
          float pi=3.14159265359,q=uGrip.w>0.0?uProgress:1.0-uProgress,wave=max(0.0,sin(pi*q));
          float angle=pi*mix(q,uHover.y,uHover.x),bow=.22*wave*(1.0-uHover.x)*(1.0+uPull*.15);
          float curl=.22*wave*(1.0-uHover.x)+.6*uHover.x*min(1.0,min(q,1.0-q)/.075);
          float cv=uGrip.x<.5?1.0-uv.y:uv.y,t=clamp((cv-.68)/.32,0.0,1.0),mask=t*t*(3.0-2.0*t);
          float maskV=6.0*t*(1.0-t)/.32*(uGrip.x<.5?-1.0:1.0),mid=angle+bow*(uv.x-1.0);
          vec2 p=uv.x*sinc(bow*uv.x)*vec2(cos(mid),sin(mid)),edgeV=vec2(0.0);
          float span=max(0.0,uv.x-.84);
          if(span>0.0){
            vec4 samples=.84+span*.5*(vec4(-.8611363116,-.3399810436,.3399810436,.8611363116)+1.0);
            vec4 weights=vec4(.3478548451,.6521451549,.6521451549,.3478548451),e=smoothstep(.84,1.0,samples);
            vec4 base=angle+bow*(2.0*samples-1.0),theta=base+curl*mask*e;
            p+=span*.5*vec2(dot(weights,cos(theta)-cos(base)),dot(weights,sin(theta)-sin(base)));
            edgeV=span*.5*curl*maskV*vec2(dot(weights,-sin(theta)*e),dot(weights,cos(theta)*e));
          }
          float theta=angle+bow*(2.0*uv.x-1.0)+curl*mask*smoothstep(.84,1.0,uv.x);
          vec3 sheet=vec3(p.x*uWidth,uv.y*uHeight,p.y*uWidth),rigid=vec3(uv.x*uWidth*cos(pi*q),uv.y*uHeight,uv.x*uWidth*sin(pi*q));
          du=mix(vec3(cos(theta)*uWidth,0.0,sin(theta)*uWidth),vec3(cos(pi*q)*uWidth,0.0,sin(pi*q)*uWidth),uStiffness);
          dv=mix(vec3(edgeV.x*uWidth,uHeight,edgeV.y*uWidth),vec3(0.0,uHeight,0.0),uStiffness);
          vec3 pos=mix(sheet,rigid,uStiffness);pos.x*=uGrip.w;du.x*=uGrip.w;dv.x*=uGrip.w;return pos;
        }
        void main(){
          vec3 du,dv;
          vec3 pos=position(aUV,du,dv),normal=normalize(cross(du,dv));
          pos+=normal*aSide*uThickness*.5;
          vHeight=max(0.0,pos.z)/uWidth;
          if(uMode>1.5){pos.xy+=vec2(.28,.18)*max(0.0,pos.z)+uShadowOffset*(1.0+max(0.0,pos.z)*.035);pos.z=0.0;}
          float w=1.0-pos.z/uDistance;
          float cx=(pos.x-uEyeX*pos.z/uDistance)/(1.6*uWidth);
          float cy=-(pos.y/uHeight-.5)/.9;
          gl_Position=vec4(cx,cy,-pos.z/(2.0*uWidth)*w,w);
          vUV=aUV;vNormal=normal;
          if(uMode>.5&&uMode<1.5){
            if(aUV.y<.001)vNormal=normalize(-dv);else if(aUV.y>.999)vNormal=normalize(dv);
            else vNormal=normalize(aUV.x<.5?-du:du);
          }
        }`;
      const fragment=`
        precision highp float;
        uniform sampler2D uFront,uBack;
        uniform mediump float uProgress,uMode;
        uniform float uShadowOpacity,uShadowWeight;
        uniform vec2 uPageSize;
        varying highp vec2 vUV;
        varying mediump vec3 vNormal;
        varying mediump float vHeight;
        void main(){
          float turn=max(0.0,sin(3.14159265359*uProgress));
          if(uMode>1.5){gl_FragColor=vec4(vec3(.05,.07,.04),uShadowOpacity*uShadowWeight*turn*exp(-vHeight/.8));return;}
          vec3 n=normalize(vNormal);
          if(uMode>.5){float edgeLight=.72+.28*abs(dot(n,normalize(vec3(-.35,-.2,1.0))));gl_FragColor=vec4(vec3(.91,.875,.79)*edgeLight,1.0);return;}
          if(!gl_FrontFacing)n=-n;
          vec4 tex=gl_FrontFacing?texture2D(uFront,vUV):texture2D(uBack,vec2(1.0-vUV.x,vUV.y));
          float diffuse=max(0.0,dot(n,normalize(vec3(-.35,.18,1.0))));
          float grazing=1.0-abs(n.z);
          float light=mix(1.0,(.85+.15*diffuse)*(1.0-.12*grazing),turn);
          float sheen=pow(max(0.0,dot(n,normalize(vec3(.3,.1,1.0)))),12.0)*.012*turn;
          vec2 edgePixels=min(vUV,1.0-vUV)*uPageSize;
          float rim=(1.0-smoothstep(.15,.8,min(edgePixels.x,edgePixels.y)))*turn;
          vec3 color=mix(tex.rgb*light+sheen,vec3(.94,.91,.83)*light,rim*.65);
          gl_FragColor=vec4(color,tex.a);
        }`;
      const shader=(type,source)=>{
        const handle=gl.createShader(type);gl.shaderSource(handle,source);gl.compileShader(handle);
        if(!gl.getShaderParameter(handle,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(handle);gl.deleteShader(handle);throw new Error(message);}
        return handle;
      };
      this.vertex=shader(gl.VERTEX_SHADER,vertex);this.fragment=shader(gl.FRAGMENT_SHADER,fragment);
      const program=this.program=gl.createProgram();gl.attachShader(program,this.vertex);gl.attachShader(program,this.fragment);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);this.uniforms={};
      for(const name of ['uProgress','uWidth','uHeight','uStiffness','uDistance','uEyeX','uGrip','uPull','uHover','uFront','uBack','uMode','uThickness','uShadowOffset','uShadowOpacity','uShadowWeight','uPageSize'])this.uniforms[name]=gl.getUniformLocation(program,name);
      this.mesh=topology();
      this.vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices);gl.bufferData(gl.ARRAY_BUFFER,this.mesh.uv,gl.STATIC_DRAW);
      const location=this.uvLocation=gl.getAttribLocation(program,'aUV');this.sideLocation=gl.getAttribLocation(program,'aSide');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      this.indices=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.mesh.indices,gl.STATIC_DRAW);
      this.edgeMesh=edgeTopology();this.shadowMesh=topology(20,12);
      const buffer=(target,data)=>{const value=gl.createBuffer();gl.bindBuffer(target,value);gl.bufferData(target,data,gl.STATIC_DRAW);return value;};
      this.edgeVertices=buffer(gl.ARRAY_BUFFER,this.edgeMesh.vertices);this.edgeIndices=buffer(gl.ELEMENT_ARRAY_BUFFER,this.edgeMesh.indices);
      this.shadowVertices=buffer(gl.ARRAY_BUFFER,this.shadowMesh.uv);this.shadowIndices=buffer(gl.ELEMENT_ARRAY_BUFFER,this.shadowMesh.indices);
      this.textures=[];
      const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic')||gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      images.forEach((image,i)=>{
        const texture=gl.createTexture();this.textures.push(texture);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(this.uniforms[i?'uBack':'uFront'],i);
      });
      const material=materialStyle(this.options.stiff);gl.uniform1f(this.uniforms.uThickness,material.thickness);gl.uniform1f(this.uniforms.uShadowOpacity,material.shadowOpacity);gl.uniform2f(this.uniforms.uPageSize,this.width,this.height);
      gl.uniform1f(this.uniforms.uWidth,this.width);gl.uniform1f(this.uniforms.uHeight,this.height);
      gl.uniform1f(this.uniforms.uStiffness,this.options.stiff ? 1 : 0);
      const eye=this.options.single?(surfaceDirection(this.options)>0?this.width/2:-this.width/2):0;
      gl.uniform1f(this.uniforms.uEyeX,eye);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
    }
    draw(progress,scale=1,grip=null) {
      if(this.disposed||this.lost)return;
      const gl=this.gl,w=this.width*3.2,h=this.height*1.8;
      const ratio=surfaceRatio(w,h,scale,window.devicePixelRatio||1,this.maxRenderSize||4096);
      const width=Math.ceil(w*ratio),height=Math.ceil(h*ratio);
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
      gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const distance=Math.max(this.width*3,2200/Math.max(.1,scale));
      const direction=surfaceDirection(this.options),eye=this.options.single?(direction>0?this.width/2:-this.width/2):0;
      const pose=solveGrip(progress,this.width,this.height,this.options.stiff?1:0,grip,distance,eye,direction,this.options.cornerV??1);
      this.lastProgress=pose.progress;
      gl.uniform4f(this.uniforms.uGrip,pose.corner,grip?.u??1,grip?.strength??0,direction);
      gl.uniform1f(this.uniforms.uPull,pose.pull);gl.uniform2f(this.uniforms.uHover,pose.hover||0,pose.hoverBase||0);
      gl.uniform1f(this.uniforms.uProgress,pose.progress);gl.uniform1f(this.uniforms.uDistance,distance);
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.disableVertexAttribArray(this.sideLocation);gl.vertexAttrib1f(this.sideLocation,0);
      // Coarse projected caster + five soft samples, independent of the page texture.
      gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowVertices);gl.vertexAttribPointer(this.uvLocation,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.shadowIndices);
      gl.uniform1f(this.uniforms.uMode,2);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      for(const [x,y,weight] of [[0,0,.4],[-1,0,.15],[1,0,.15],[0,-1,.15],[0,1,.15]]){
        gl.uniform2f(this.uniforms.uShadowOffset,x,y);gl.uniform1f(this.uniforms.uShadowWeight,weight);gl.drawElements(gl.TRIANGLES,this.shadowMesh.indices.length,gl.UNSIGNED_SHORT,0);
      }
      gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
      gl.uniform1f(this.uniforms.uMode,0);gl.uniform2f(this.uniforms.uShadowOffset,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices);gl.vertexAttribPointer(this.uvLocation,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);
      gl.drawElements(gl.TRIANGLES,this.mesh.indices.length,gl.UNSIGNED_SHORT,0);
      // Closed sidewall ribbons give the actual curl a thin physical rim.
      gl.uniform1f(this.uniforms.uMode,1);gl.bindBuffer(gl.ARRAY_BUFFER,this.edgeVertices);
      gl.vertexAttribPointer(this.uvLocation,2,gl.FLOAT,false,12,0);gl.enableVertexAttribArray(this.sideLocation);gl.vertexAttribPointer(this.sideLocation,1,gl.FLOAT,false,12,8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.edgeIndices);gl.drawElements(gl.TRIANGLES,this.edgeMesh.indices.length,gl.UNSIGNED_SHORT,0);

    }
    destroy() {
      if(this.disposed)return;this.disposed=true;
      const gl=this.gl;if(!gl)return;
      this.textures?.forEach(texture=>gl.deleteTexture(texture));
      if(this.vertices)gl.deleteBuffer(this.vertices);if(this.indices)gl.deleteBuffer(this.indices);
      for(const buffer of [this.edgeVertices,this.edgeIndices,this.shadowVertices,this.shadowIndices])if(buffer)gl.deleteBuffer(buffer);
      if(this.program)gl.deleteProgram(this.program);if(this.vertex)gl.deleteShader(this.vertex);if(this.fragment)gl.deleteShader(this.fragment);
      gl.getExtension('WEBGL_lose_context')?.loseContext();this.canvas.width=this.canvas.height=0;
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={arcFrame,fold,deform,posePoint,solveGrip,topology,edgeTopology,materialStyle,surfaceDirection,surfaceRatio,PaperSurface};
  else window.PaperSurface=PaperSurface;
})();
