        // Full-profiler diagnostics only. CPU values include browser/driver waits;
        // GPU timer queries are asynchronous, bounded, and never force completion.
        const LightingProfile = {
            enabled: false, history: [], pending: [], gpu: {}, deviceInfo: null, wrapped: [],
            start() { return this.enabled && this.recording ? performance.now() : null; },
            end(name,t) {
                if(t===null || !this.enabled)return;
                const ms=Math.max(0,performance.now()-t),m=this.stages[name] || (this.stages[name]={ms:0,calls:0,maxCall:0});
                m.ms+=ms;m.calls++;m.maxCall=Math.max(m.maxCall,ms);
            },
            wrap(object,key,label) {
                const original=object[key],p=this;
                const wrapped=object[key]=function(...args){const t=p.start();try{return original.apply(this,args);}finally{p.end(label,t);}};
                this.wrapped.push({object,key,original,wrapped});
            },
            disable() {
                for(const w of this.wrapped)if(w.object[w.key]===w.wrapped)w.object[w.key]=w.original;
                this.wrapped.length=0;this.instrumented=false;
                this.clearQueries();this.enabled=false;this.recording=false;this.history.length=0;this.latest=null;this.gpu={};this.key=null;
            },
            begin(game) {
                const on=!!(game.showProfiler && GameSettings.profilerMode==='full');
                if(!on){if(this.enabled)this.disable();return;}
                const key=[game.activeMap?.id,GameSettings.lampShadows,GameSettings.softShadows,game.canvas.width,game.canvas.height,game.lightingScale].join('|');
                if(key!==this.key){this.clearQueries();this.history.length=0;this.latest=null;this.gpu={};this.gpuStatus=this.timer?'awaiting sample':'GPU timer unavailable';}
                this.key=key;this.enabled=on;this.recording=true;this.frameId=game._renderDrawId;this.stages={};this.bytes={mask:0,layers:0};this.churn={new:0,changed:0,evicted:0};
                if(!this.instrumented){
                    this.instrumented=true;
                    for(const [key,label]of [['begin','caster registry'],['prepare','shadow preparation'],['_pairs','source/caster pairs'],['_path','visibility paths'],['keepSilhouette','silhouette cache copy']])this.wrap(DynamicShadows,key,label);
                }
                this.poll();
            },
            device(gl) {
                if(!this.enabled || this.gl===gl)return;
                this.clearQueries();this.gl=gl;
                try {
                    const d=gl.getExtension('WEBGL_debug_renderer_info');
                    this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
                    this.deviceInfo={renderer:gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(d?d.UNMASKED_VENDOR_WEBGL:gl.VENDOR),version:gl.getParameter(gl.VERSION),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),timerAvailable:!!this.timer};
                    this.gpuStatus=this.timer?'awaiting sample':'GPU timer unavailable';
                } catch(_){this.timer=null;this.gpuStatus='GPU timer unavailable';}
            },
            beginGPU(label) {
                if(!this.enabled||!this.recording||!this.timer||this.activeQuery||this.pending.length>=8||this.frameId%4!==0)return false;
                let q;
                try {q=this.gl.createQuery();if(!q)return false;this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT,q);this.activeQuery={q,label,frameId:this.frameId};return true;}
                catch(_){if(q)try{this.gl.deleteQuery(q);}catch(_){}this.gpuStatus='GPU query unavailable';return false;}
            },
            endGPU() {
                if(!this.activeQuery)return;
                const entry=this.activeQuery;this.activeQuery=null;
                try{this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pending.push(entry);}
                catch(_){try{this.gl.deleteQuery(entry.q);}catch(_){}this.gpuStatus='GPU query interrupted';}
            },
            clearQueries() {
                this.endGPU();
                for(const p of this.pending)try{this.gl.deleteQuery(p.q);}catch(_){}
                this.pending.length=0;
            },
            poll() {
                if(!this.pending.length||!this.timer)return;
                try {
                    if(this.gl.isContextLost()){this.clearQueries();this.gpu={};this.gpuStatus='GPU context lost';return;}
                    if(this.gl.getParameter(this.timer.GPU_DISJOINT_EXT)){this.clearQueries();this.gpu={};this.gpuStatus='disjoint samples discarded';return;}
                    const keep=[];
                    for(const p of this.pending){
                        if(this.gl.getQueryParameter(p.q,this.gl.QUERY_RESULT_AVAILABLE)){
                            this.gpu[p.label]={ms:this.gl.getQueryParameter(p.q,this.gl.QUERY_RESULT)/1e6,frameId:p.frameId};this.gl.deleteQuery(p.q);this.gpuStatus='asynchronous GPU samples';
                        } else if(this.frameId-p.frameId>120){this.gl.deleteQuery(p.q);this.gpuStatus='GPU query expired';}
                        else keep.push(p);
                    }
                    this.pending=keep;
                } catch(_){this.clearQueries();this.gpu={};this.gpuStatus='GPU query unavailable';}
            },
            finish(game) {
                if(!this.enabled)return;
                const g=GammaShadows,s=g.stats,fresh=s.frameId===this.frameId;
                this.latest={frameId:this.frameId,at:performance.now(),mode:GameSettings.lampShadows,backend:fresh?s.backend:'idle',stages:this.stages,bytes:{...this.bytes},churn:{...this.churn},shadows:{...DynamicShadows.stats},maskCacheBytes:DynamicShadows.bytes,sourceFamilies:{...DynamicShadows._families},
                    layer:[game.lightCanvas.width,game.lightCanvas.height],scene:[game.canvas.width,game.canvas.height],lightingScale:game.lightingScale,adaptiveFactor:game._adaptiveLighting?.factor||1,soft:GameSettings.softShadows,
                    gamma:fresh?{...s}:null,atlasSlots:g.slots?.length||0,atlasResident:g.slots?.filter(s=>s.cv).length||0,atlasBytes:g.atlasSize*g.atlasHeight*4||0,gpuTextureBytes:(g.atlasSize*g.atlasHeight*4||0)+(g.textureSizes||[]).reduce((n,s)=>{if(typeof s!=='string')return n;const [w,h]=s.split(':').map(Number);return n+(Number.isFinite(w*h)?w*h*4:0);},0)};
                this.history.push(this.latest);if(this.history.length>60)this.history.shift();this.recording=false;
            },
            summary() {
                const keys=new Set(this.history.flatMap(f=>Object.keys(f.stages))),rows=[];
                for(const name of keys){const values=this.history.map(f=>f.stages[name]?.ms||0).sort((a,b)=>a-b),last=this.latest?.stages[name];
                    rows.push({name,last:last?.ms||0,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.ceil(values.length*.95)-1],peak:values[values.length-1],calls:last?.calls||0,maxCall:last?.maxCall||0});}
                return rows.sort((a,b)=>b.mean-a.mean);
            },
            snapshot(game) {
                return {format:'dfab-lighting-profile-v1',createdAt:new Date().toISOString(),device:this.deviceInfo,gpuStatus:this.gpuStatus||'not sampled',gpu:{...this.gpu},gpuPending:this.pending.length,
                    jsHeapBytes:Number.isFinite(performance.memory?.usedJSHeapSize)?performance.memory.usedJSHeapSize:null,frameMs:game._renderFrameMs,pixelRatio:window.devicePixelRatio||1,map:game.activeMap?.id,zoom:game.camera.zoom,settings:{shadows:GameSettings.lampShadows,soft:GameSettings.softShadows,adaptive:GameSettings.adaptiveLighting,lightingScale:game.lightingScale,renderScale:game._renderScale||1,fpsLimit:GameSettings.fpsLimit},
                    gameSections:game.profiler?.report||[],latest:this.latest,summary:this.summary(),frames:this.history.slice(),memory:DevOverlay._canvasMB(game),note:'CPU timings are inclusive and can contain driver waits; nested rows overlap. GPU samples are asynchronous and identify their source frame. No forced readback or gl.finish.'};
            },
            download(game) {
                const blob=new Blob([JSON.stringify(this.snapshot(game),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
                a.href=url;a.download='dfab-lighting-profile.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
            }
        };
        // Gamma keeps High's shadow preparation, but batches cached sprites using
        // fixed-function blending. GPU blur feeds the scene directly; no tile lists
        // or intermediate WebGL -> Canvas light-layer copy on the game path.
        const GammaShadows = {
            LIMIT: 96, active: false, records: [], frame: 0,
            stats: { backend: 'high-fallback', resolves: 0, draws: 0, uploads: 0, layerUploads: 0, contributions: 0, blurPasses: 0 },
            _init() {
                if (this.failed) return false;
                if (this.ready && this.gl && !this.gl.isContextLost()) return true;
                try {
                    const cv = this.canvas = this.canvas || document.createElement('canvas');
                    const gl = this.gl = this.gl || cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
                    if (!gl) throw new Error('WebGL2 unavailable');
                    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); this.failed = true; });
                    const program = (vertex, fragment) => {
                        const p = gl.createProgram();
                        for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
                            const s = gl.createShader(type); gl.shaderSource(s, '#version 300 es\n' + code); gl.compileShader(s);
                            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                            gl.attachShader(p, s); gl.deleteShader(s);
                        }
                        gl.linkProgram(p);
                        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
                        return p;
                    };
                    this.copyProgram = program(`out vec2 uv;
                        void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`, `
                        precision highp float; uniform sampler2D image; uniform bool flip; uniform vec2 stepUV; in vec2 uv; out vec4 outColor;
                        vec4 sampleAt(vec2 p){if(any(lessThan(p,vec2(0)))||any(greaterThan(p,vec2(1))))return vec4(0);return texture(image,p);}
                        void main(){vec2 p=vec2(uv.x,flip?1.0-uv.y:uv.y);outColor=(sampleAt(p-stepUV)+sampleAt(p)+sampleAt(p+stepUV))/3.0;}`);
                    this.spriteProgram = program(`
                        layout(location=0)in vec4 rect; layout(location=1)in vec4 region; layout(location=2)in float alpha;
                        uniform vec2 size; out vec2 uv; out float opacity;
                        void main(){vec2 p=vec2((gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1.0:0.0,(gl_VertexID>=2&&gl_VertexID<=4)?1.0:0.0);
                        vec2 screen=(rect.xy+p*rect.zw)/size;gl_Position=vec4(screen.x*2.0-1.0,1.0-screen.y*2.0,0,1);uv=region.xy+p*region.zw;opacity=alpha;}`, `
                        precision highp float; uniform sampler2D image; in vec2 uv; in float opacity; out vec4 outColor;
                        void main(){outColor=texture(image,uv)*opacity;}`);
                    this.copyUniforms = {};
                    for (const n of ['image','flip','stepUV']) this.copyUniforms[n] = gl.getUniformLocation(this.copyProgram,n);
                    this.spriteSize = gl.getUniformLocation(this.spriteProgram,'size');
                    gl.useProgram(this.spriteProgram); gl.uniform1i(gl.getUniformLocation(this.spriteProgram,'image'),0);
                    gl.useProgram(this.copyProgram); gl.uniform1i(this.copyUniforms.image,0);
                    this.copyVAO = gl.createVertexArray(); this.spriteVAO = gl.createVertexArray();
                    gl.bindVertexArray(this.spriteVAO);
                    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
                    gl.bufferData(gl.ARRAY_BUFFER,this.LIMIT*9*4,gl.DYNAMIC_DRAW);
                    for (const [i,n,offset] of [[0,4,0],[1,4,16],[2,1,32]]) {
                        gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i,n,gl.FLOAT,false,36,offset); gl.vertexAttribDivisor(i,1);
                    }
                    gl.bindVertexArray(this.copyVAO);
                    this.textures = []; this.textureSizes = [];
                    for (let i=0;i<6;i++) {
                        const t=gl.createTexture(); this.textures.push(t); gl.bindTexture(gl.TEXTURE_2D,t);
                        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                    }
                    this.maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE); this.pitch=258;
                    this.atlasColumns=Math.min(8,Math.floor(this.maxSize/this.pitch)); this.atlasSize=this.atlasColumns*this.pitch;
                    const atlasRows=Math.min(12,Math.floor(this.maxSize/this.pitch));
                    this.slots=Array.from({length:Math.min(this.LIMIT,this.atlasColumns*atlasRows)},(_,i)=>({x:i%this.atlasColumns*this.pitch,y:Math.floor(i/this.atlasColumns)*this.pitch,at:0}));
                    this.atlasHeight=Math.ceil(this.slots.length/this.atlasColumns)*this.pitch;
                    gl.bindTexture(gl.TEXTURE_2D,this.textures[3]); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,this.atlasSize,this.atlasHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
                    this.fbos=[gl.createFramebuffer(),gl.createFramebuffer()];
                    this.slotMap=new WeakMap(); this.pad=document.createElement('canvas');
                    this.hole=document.createElement('canvas'); this.veil=document.createElement('canvas');
                    this.recordData=new Float32Array(this.LIMIT*9);
                    if(gl.getError()!==gl.NO_ERROR)throw new Error('Gamma initialization failed');
                    this.ready=true; return true;
                } catch (_) { this.failed=true; return false; }
            },
            reset() {
                this.records.length=0; this.active=false; this.slotMap=new WeakMap();
                for(const s of this.slots || []){s.cv=null;s.signature=null;s.at=0;}
            },
            begin(ctx, frameId = null) {
                this.frame++; this.records.length=0; this.holeReady=false; this.uploadFailed=false;
                this.stats={backend:'high-fallback',resolves:0,draws:0,uploads:0,layerUploads:0,contributions:0,blurPasses:0,frameId};
                const initTime=LightingProfile.start();
                this.active=GameSettings.lampShadows==='gamma' && this._init();
                if(this.active){this.stats.backend='webgl2';this.target=ctx.canvas;LightingProfile.device(this.gl);}
                LightingProfile.end('backend initialization',initTime);
                return this.active;
            },
            collect(ctx,s,mode) {
                const t=LightingProfile.start();try{return this._collect(ctx,s,mode);}finally{LightingProfile.end('atlas collection (includes uploads)',t);}
            },
            _collect(ctx,s,mode) {
                if(!this.active||this.uploadFailed||ctx.canvas!==this.target||this.records.length>=this.LIMIT)return false;
                const m=ctx.getTransform();
                if(Math.abs(m.b)>1e-6||Math.abs(m.c)>1e-6||m.a<=0||m.d<=0)return false;
                const cv=s[mode]; let slot=this.slotMap.get(cv);
                if(!slot){
                    // Prefer unused slots, then least-recently-used sprites. Never evict
                    // a sprite referenced by this frame's queued draws.
                    slot=this.slots.filter(t=>t.at!==this.frame).reduce((best,t)=>!best||!t.cv||(best.cv&&t.at<best.at)?t:best,null);
                    if(!slot)return false;
                    if(slot.cv){this.slotMap.delete(slot.cv);if(LightingProfile.enabled)LightingProfile.churn.evicted++;}
                    if(LightingProfile.enabled)LightingProfile.churn.new++;
                    slot.cv=cv;slot.signature=null;this.slotMap.set(cv,slot);
                }
                slot.at=this.frame;
                if(slot.signature!==s.signature){
                    if(LightingProfile.enabled && slot.signature!==null)LightingProfile.churn.changed++;
                    try {
                    const padTime=LightingProfile.start();
                    const gl=this.gl,pad=this.pad;pad.width=cv.width+2;pad.height=cv.height+2;
                    const g=pad.getContext('2d');g.drawImage(cv,1,1);
                    g.drawImage(cv,0,0,cv.width,1,1,0,cv.width,1);g.drawImage(cv,0,cv.height-1,cv.width,1,1,cv.height+1,cv.width,1);
                    g.drawImage(pad,1,0,1,pad.height,0,0,1,pad.height);g.drawImage(pad,cv.width,0,1,pad.height,cv.width+1,0,1,pad.height);
                    LightingProfile.end('mask padding',padTime);
                    const uploadTime=LightingProfile.start();
                    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
                    gl.texSubImage2D(gl.TEXTURE_2D,0,slot.x,slot.y,gl.RGBA,gl.UNSIGNED_BYTE,pad);
                    LightingProfile.end('mask uploads (CPU wait)',uploadTime);
                    if(LightingProfile.enabled)LightingProfile.bytes.mask+=pad.width*pad.height*4;
                    slot.signature=s.signature;this.stats.uploads++;
                    } catch (_) { this.uploadFailed=true; return false; }
                }
                this.records.push({cv,mode,alpha:ctx.globalAlpha,x:m.a*s.x+m.e,y:m.d*s.y+m.f,w:m.a*s.w,h:m.d*s.h,slot});
                this.stats.contributions=this.records.length;return true;
            },
            split(ctx,paintVeil) {
                const t=LightingProfile.start();try{return this._split(ctx,paintVeil);}finally{LightingProfile.end('Canvas hole snapshot + room veil',t);}
            },
            _split(ctx,paintVeil) {
                if(!this.active)return;
                this.hasVeil=!!paintVeil;
                for(const cv of this.hasVeil?[this.hole,this.veil]:[this.hole]){if(cv.width!==ctx.canvas.width)cv.width=ctx.canvas.width;if(cv.height!==ctx.canvas.height)cv.height=ctx.canvas.height;}
                const hc=this.hole.getContext('2d');hc.globalCompositeOperation='copy';hc.drawImage(ctx.canvas,0,0);this.holeReady=true;
                if(this.hasVeil){const v=this.veil.getContext('2d');v.setTransform(1,0,0,1,0,0);v.clearRect(0,0,this.veil.width,this.veil.height);v.setTransform(ctx.getTransform());paintVeil(v);}
                ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
            },
            _cpu(ctx) {
                const color=this.fallbackColor || (this.fallbackColor=document.createElement('canvas'));color.width=ctx.canvas.width;color.height=ctx.canvas.height;color.getContext('2d').drawImage(ctx.canvas,0,0);
                ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(this.hole,0,0);
                for(const r of this.records)if(r.mode==='hole'){ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=r.alpha;ctx.drawImage(r.cv,r.x,r.y,r.w,r.h);}
                ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';if(this.hasVeil)ctx.drawImage(this.veil,0,0);ctx.globalCompositeOperation='lighter';ctx.drawImage(color,0,0);
                for(const r of this.records)if(r.mode==='color'){ctx.globalAlpha=r.alpha;ctx.drawImage(r.cv,r.x,r.y,r.w,r.h);}ctx.restore();
            },
            _copy(texture,flip=false,dx=0,dy=0) {
                const gl=this.gl;gl.useProgram(this.copyProgram);gl.bindVertexArray(this.copyVAO);gl.bindTexture(gl.TEXTURE_2D,texture);
                gl.uniform1i(this.copyUniforms.flip,flip);gl.uniform2f(this.copyUniforms.stepUV,dx,dy);gl.drawArrays(gl.TRIANGLES,0,3);this.stats.draws++;
            },
            _sprites(mode,w,h) {
                let n=0;
                for(const r of this.records)if(r.mode===mode){this.recordData.set([r.x,r.y,r.w,r.h,(r.slot.x+1)/this.atlasSize,(r.slot.y+1)/this.atlasHeight,r.cv.width/this.atlasSize,r.cv.height/this.atlasHeight,r.alpha],n++*9);}
                if(!n)return;
                const gl=this.gl;gl.useProgram(this.spriteProgram);gl.bindVertexArray(this.spriteVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
                gl.bufferSubData(gl.ARRAY_BUFFER,0,this.recordData.subarray(0,n*9));gl.uniform2f(this.spriteSize,w,h);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);
                gl.drawArraysInstanced(gl.TRIANGLES,0,6,n);this.stats.draws++;
            },
            finish(ctx, options = null) {
                if(!this.active||!this.holeReady){this.active=false;return null;}
                let result=null;
                try {
                    const setupTime=LightingProfile.start();
                    const gl=this.gl,w=ctx.canvas.width,h=ctx.canvas.height,soft=!!options?.soft;
                    if(this.uploadFailed||w>this.maxSize||h>this.maxSize||gl.isContextLost())throw new Error('Gamma surface limit');
                    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
                    gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
                    LightingProfile.end('surface setup',setupTime);
                    for(const [i,cv]of this.hasVeil?[[0,this.hole],[1,ctx.canvas],[2,this.veil]]:[[0,this.hole],[1,ctx.canvas]]){
                        const uploadTime=LightingProfile.start();
                        gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);
                        if(this.textureSizes[i]!==w+':'+h){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);this.textureSizes[i]=w+':'+h;}
                        else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,cv);
                        LightingProfile.end(['base darkness upload','base colour upload','room veil upload'][i],uploadTime);
                        if(LightingProfile.enabled)LightingProfile.bytes.layers+=cv.width*cv.height*4;
                        this.stats.layerUploads++;
                    }
                    const targetsTime=LightingProfile.start();
                    if(soft)for(let i=0;i<2;i++){
                        gl.bindTexture(gl.TEXTURE_2D,this.textures[4+i]);
                        if(this.textureSizes[4+i]!==w+':'+h){
                            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.textureSizes[4+i]=w+':'+h;
                            gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbos[i]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.textures[4+i],0);
                            if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Gamma blur target failed');
                        }
                    }
                    LightingProfile.end('blur target allocation/setup',targetsTime);
                    const renderTime=LightingProfile.start();LightingProfile.beginGPU('resolve');
                    gl.bindFramebuffer(gl.FRAMEBUFFER,soft?this.fbos[0]:null);gl.disable(gl.BLEND);this._copy(this.textures[0],true);
                    gl.enable(gl.BLEND);gl.blendFunc(gl.ZERO,gl.ONE_MINUS_SRC_ALPHA);this._sprites('hole',w,h);
                    if(this.hasVeil){gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);this._copy(this.textures[2],true);}
                    gl.blendFunc(gl.ONE,gl.ONE);this._copy(this.textures[1],true);this._sprites('color',w,h);
                    gl.disable(gl.BLEND);LightingProfile.endGPU();LightingProfile.end('GPU resolve submission',renderTime);
                    const blurTime=LightingProfile.start();
                    if(soft){
                        LightingProfile.beginGPU('blur');
                        gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbos[1]);this._copy(this.textures[4],false,1/w,0);
                        gl.bindFramebuffer(gl.FRAMEBUFFER,null);this._copy(this.textures[5],false,0,1/h);this.stats.blurPasses=2;LightingProfile.endGPU();
                    }
                    LightingProfile.end('GPU blur submission',blurTime);
                    const checkTime=LightingProfile.start();
                    const error=gl.getError();LightingProfile.end('GPU error check (CPU wait)',checkTime);
                    if(error!==gl.NO_ERROR)throw new Error('Gamma GPU resolve failed');
                    this.stats.resolves=1;
                    if(options?.direct)result=this.canvas;
                    else {const copyTime=LightingProfile.start();ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(this.canvas,0,0);ctx.restore();LightingProfile.end('GPU to Canvas light copy',copyTime);}
                } catch (error) {LightingProfile.endGPU();const t=LightingProfile.start();this._cpu(ctx);LightingProfile.end('High failure recovery',t);this.failed=true;this.stats.backend='high-fallback';this.stats.failure=String(error?.message||error);}
                this.active=false;this.records.length=0;return result;
            }
        };
