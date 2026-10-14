        // Gamma keeps High's shadow preparation, but batches cached sprites using
        // fixed-function blending. GPU blur feeds the scene directly; no tile lists
        // or intermediate WebGL -> Canvas light-layer copy on the game path.
        const GammaShadows = {
            LIMIT: 96, active: false, records: [], frame: 0,
            stats: { backend: 'high-fallback', resolves: 0, draws: 0, uploads: 0, layerUploads: 0, contributions: 0, blurPasses: 0 },
            _init() {
                if (this.failed || (this.software && !this.forceGPU)) return false;
                if (this.ready && this.gl && !this.gl.isContextLost()) return true;
                try {
                    const cv = this.canvas = this.canvas || document.createElement('canvas');
                    const gl = this.gl = this.gl || cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
                    if (!gl) throw new Error('WebGL2 unavailable');
                    // Software GL lost to High in the completed-frame experiment.
                    // Only probe during initialization; tests/benchmarks can force GPU.
                    const debug=gl.getExtension('WEBGL_debug_renderer_info');
                    this.software=!!debug && /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
                    if(this.software && !this.forceGPU)return false;
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
                this.active=GameSettings.lampShadows==='gamma' && this._init();
                if(this.active){this.stats.backend='webgl2';this.target=ctx.canvas;}
                else if(this.software && !this.forceGPU)this.stats.reason='software-gpu';
                return this.active;
            },
            collect(ctx,s,mode) {
                if(!this.active||this.uploadFailed||ctx.canvas!==this.target||this.records.length>=this.LIMIT)return false;
                const m=ctx.getTransform();
                if(Math.abs(m.b)>1e-6||Math.abs(m.c)>1e-6||m.a<=0||m.d<=0)return false;
                const cv=s[mode]; let slot=this.slotMap.get(cv);
                if(!slot){
                    // Prefer unused slots, then least-recently-used sprites. Never evict
                    // a sprite referenced by this frame's queued draws.
                    slot=this.slots.filter(t=>t.at!==this.frame).reduce((best,t)=>!best||!t.cv||(best.cv&&t.at<best.at)?t:best,null);
                    if(!slot)return false;
                    if(slot.cv)this.slotMap.delete(slot.cv);
                    slot.cv=cv;slot.signature=null;this.slotMap.set(cv,slot);
                }
                slot.at=this.frame;
                if(slot.signature!==s.signature){
                    try {
                    const gl=this.gl,pad=this.pad;pad.width=cv.width+2;pad.height=cv.height+2;
                    const g=pad.getContext('2d');g.drawImage(cv,1,1);
                    g.drawImage(cv,0,0,cv.width,1,1,0,cv.width,1);g.drawImage(cv,0,cv.height-1,cv.width,1,1,cv.height+1,cv.width,1);
                    g.drawImage(pad,1,0,1,pad.height,0,0,1,pad.height);g.drawImage(pad,cv.width,0,1,pad.height,cv.width+1,0,1,pad.height);
                    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
                    gl.texSubImage2D(gl.TEXTURE_2D,0,slot.x,slot.y,gl.RGBA,gl.UNSIGNED_BYTE,pad);
                    slot.signature=s.signature;this.stats.uploads++;
                    } catch (_) { this.uploadFailed=true; return false; }
                }
                this.records.push({cv,mode,alpha:ctx.globalAlpha,x:m.a*s.x+m.e,y:m.d*s.y+m.f,w:m.a*s.w,h:m.d*s.h,slot});
                this.stats.contributions=this.records.length;return true;
            },
            split(ctx,paintVeil) {
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
                    const gl=this.gl,w=ctx.canvas.width,h=ctx.canvas.height,soft=!!options?.soft;
                    if(this.uploadFailed||w>this.maxSize||h>this.maxSize||gl.isContextLost())throw new Error('Gamma surface limit');
                    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
                    gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
                    for(const [i,cv]of this.hasVeil?[[0,this.hole],[1,ctx.canvas],[2,this.veil]]:[[0,this.hole],[1,ctx.canvas]]){
                        gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);
                        if(this.textureSizes[i]!==w+':'+h){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);this.textureSizes[i]=w+':'+h;}
                        else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,cv);
                        this.stats.layerUploads++;
                    }
                    if(soft)for(let i=0;i<2;i++){
                        gl.bindTexture(gl.TEXTURE_2D,this.textures[4+i]);
                        if(this.textureSizes[4+i]!==w+':'+h){
                            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.textureSizes[4+i]=w+':'+h;
                            gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbos[i]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.textures[4+i],0);
                            if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Gamma blur target failed');
                        }
                    }
                    gl.bindFramebuffer(gl.FRAMEBUFFER,soft?this.fbos[0]:null);gl.disable(gl.BLEND);this._copy(this.textures[0],true);
                    gl.enable(gl.BLEND);gl.blendFunc(gl.ZERO,gl.ONE_MINUS_SRC_ALPHA);this._sprites('hole',w,h);
                    if(this.hasVeil){gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);this._copy(this.textures[2],true);}
                    gl.blendFunc(gl.ONE,gl.ONE);this._copy(this.textures[1],true);this._sprites('color',w,h);
                    gl.disable(gl.BLEND);
                    if(soft){
                        gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbos[1]);this._copy(this.textures[4],false,1/w,0);
                        gl.bindFramebuffer(gl.FRAMEBUFFER,null);this._copy(this.textures[5],false,0,1/h);this.stats.blurPasses=2;
                    }
                    if(gl.getError()!==gl.NO_ERROR)throw new Error('Gamma GPU resolve failed');
                    this.stats.resolves=1;
                    if(options?.direct)result=this.canvas;
                    else {ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(this.canvas,0,0);ctx.restore();}
                } catch (_) {this._cpu(ctx);this.failed=true;this.stats.backend='high-fallback';}
                this.active=false;this.records.length=0;return result;
            }
        };
