        // Gamma: High's caster/visibility preparation, followed by ONE tiled GPU
        // resolve for all shadowed contributions. No scene redraw per source.
        // Cached Canvas masks are inputs, not a 3D depth/normal G-buffer.
        const GammaShadows = {
            TILE: 32, LIMIT: 96, active: false, records: [], frame: 0,
            stats: { backend: 'high-fallback', draws: 0, uploads: 0, contributions: 0, tileMax: 0 },
            _init() {
                if (this.failed) return false;
                if (this.gl && !this.gl.isContextLost()) return true;
                try {
                    const cv = this.canvas = document.createElement('canvas');
                    const gl = this.gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
                    if (!gl) throw new Error('WebGL2 unavailable');
                    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); this.failed = true; });
                    const compile = (type, code) => {
                        const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s);
                        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
                    };
                    const vs = compile(gl.VERTEX_SHADER, `#version 300 es
                        void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}`);
                    const fs = compile(gl.FRAGMENT_SHADER, `#version 300 es
                        precision highp float; precision highp int; precision highp usampler2D;
                        uniform sampler2D baseHole,baseColor,veil,atlas,records;
                        uniform usampler2D tiles; uniform vec2 size; uniform int columns;
                        out vec4 outColor;
                        void main(){
                            vec2 p=vec2(gl_FragCoord.x,size.y-gl_FragCoord.y),uv=p/size;
                            vec4 dark=texture(baseHole,uv),color=texture(baseColor,uv);
                            int tile=int(p.y)/32*columns+int(p.x)/32;
                            int count=int(texelFetch(tiles,ivec2(0,tile),0).r);float transmission=1.0;
                            for(int n=0;n<96;n++){
                                if(n>=count)break;int i=int(texelFetch(tiles,ivec2(n+1,tile),0).r);
                                vec4 rect=texelFetch(records,ivec2(0,i),0);
                                vec2 local=(p-rect.xy)/rect.zw;
                                if(any(lessThan(local,vec2(0)))||any(greaterThan(local,vec2(1))))continue;
                                vec4 region=texelFetch(records,ivec2(1,i),0),info=texelFetch(records,ivec2(2,i),0);
                                vec4 light=texture(atlas,region.xy+local*region.zw)*info.x;
                                if(info.y<0.5)transmission*=1.0-light.a;else color+=light;
                            }
                            dark*=transmission;vec4 v=texture(veil,uv);dark=v+dark*(1.0-v.a);
                            outColor=min(vec4(1),dark+color);
                        }`);
                    const program = this.program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
                    gl.deleteShader(vs); gl.deleteShader(fs);
                    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                    gl.useProgram(program); this.uniforms = {};
                    for (const n of ['baseHole','baseColor','veil','atlas','records','tiles','size','columns']) this.uniforms[n] = gl.getUniformLocation(program,n);
                    this.textures = [];this.textureSizes=[];
                    for (let i=0;i<6;i++) {
                        const t=gl.createTexture();this.textures.push(t);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);
                        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,i>=4?gl.NEAREST:gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,i>=4?gl.NEAREST:gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                        gl.uniform1i(this.uniforms[['baseHole','baseColor','veil','atlas','records','tiles'][i]],i);
                    }
                    this.pitch=258;this.atlasColumns=Math.min(8,Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE)/this.pitch));this.atlasSize=this.atlasColumns*this.pitch;
                    this.slots=Array.from({length:Math.min(96,this.atlasColumns*this.atlasColumns)},(_,i)=>({x:i%this.atlasColumns*this.pitch,y:Math.floor(i/this.atlasColumns)*this.pitch,at:0}));
                    this.atlasHeight=Math.ceil(this.slots.length/this.atlasColumns)*this.pitch;
                    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);
                    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,this.atlasSize,this.atlasHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
                    this.slotMap=new WeakMap();this.pad=document.createElement('canvas');
                    this.hole=document.createElement('canvas');this.veil=document.createElement('canvas');
                    this.recordData=new Float32Array(this.LIMIT*12);
                    return true;
                } catch (_) { this.failed=true;return false; }
            },
            reset() {
                this.records.length=0;this.active=false;this.slotMap=new WeakMap();
                for(const s of this.slots || []){s.cv=null;s.signature=null;s.at=0;}
            },
            begin(ctx) {
                this.frame++;this.records.length=0;this.holeReady=false;
                this.stats={backend:'high-fallback',draws:0,uploads:0,contributions:0,tileMax:0};
                this.active=GameSettings.lampShadows==='gamma' && this._init();
                if(this.active){this.stats.backend='webgl2';this.target=ctx.canvas;}
                return this.active;
            },
            collect(ctx,s,mode) {
                if(!this.active||ctx.canvas!==this.target||this.records.length>=this.LIMIT)return false;
                const m=ctx.getTransform();
                // The normal lighting camera is axis-aligned. Preserve High on unusual transforms.
                if(Math.abs(m.b)>1e-6||Math.abs(m.c)>1e-6||m.a<=0||m.d<=0)return false;
                const cv=s[mode];let slot=this.slotMap.get(cv);
                if(!slot){
                    slot=this.slots.find(t=>t.at!==this.frame);
                    if(!slot)return false;
                    if(slot.cv)this.slotMap.delete(slot.cv);
                    slot.cv=cv;slot.signature=null;this.slotMap.set(cv,slot);
                }
                slot.at=this.frame;
                if(slot.signature!==s.signature){
                    const gl=this.gl,pad=this.pad;pad.width=cv.width+2;pad.height=cv.height+2;
                    const g=pad.getContext('2d');g.drawImage(cv,1,1);
                    // Clamp each sprite independently, preventing atlas seams on bilinear samples.
                    g.drawImage(cv,0,0,cv.width,1,1,0,cv.width,1);g.drawImage(cv,0,cv.height-1,cv.width,1,1,cv.height+1,cv.width,1);
                    g.drawImage(pad,1,0,1,pad.height,0,0,1,pad.height);g.drawImage(pad,cv.width,0,1,pad.height,cv.width+1,0,1,pad.height);
                    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
                    gl.texSubImage2D(gl.TEXTURE_2D,0,slot.x,slot.y,gl.RGBA,gl.UNSIGNED_BYTE,pad);
                    slot.signature=s.signature;this.stats.uploads++;
                }
                this.records.push({cv,mode,alpha:ctx.globalAlpha,x:m.a*s.x+m.e,y:m.d*s.y+m.f,w:m.a*s.w,h:m.d*s.h,slot});
                this.stats.contributions=this.records.length;return true;
            },
            split(ctx,paintVeil) {
                if(!this.active)return;
                for(const cv of [this.hole,this.veil]){if(cv.width!==ctx.canvas.width)cv.width=ctx.canvas.width;if(cv.height!==ctx.canvas.height)cv.height=ctx.canvas.height;}
                const hc=this.hole.getContext('2d');hc.globalCompositeOperation='copy';hc.drawImage(ctx.canvas,0,0);this.holeReady=true;
                const v=this.veil.getContext('2d');v.setTransform(1,0,0,1,0,0);v.clearRect(0,0,this.veil.width,this.veil.height);v.setTransform(ctx.getTransform());if(paintVeil)paintVeil(v);
                ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
            },
            _cpu(ctx) {
                const color=document.createElement('canvas');color.width=ctx.canvas.width;color.height=ctx.canvas.height;color.getContext('2d').drawImage(ctx.canvas,0,0);
                ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(this.hole,0,0);
                for(const r of this.records)if(r.mode==='hole'){ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=r.alpha;ctx.drawImage(r.cv,r.x,r.y,r.w,r.h);}
                ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(this.veil,0,0);ctx.globalCompositeOperation='lighter';ctx.drawImage(color,0,0);
                for(const r of this.records)if(r.mode==='color'){ctx.globalAlpha=r.alpha;ctx.drawImage(r.cv,r.x,r.y,r.w,r.h);}ctx.restore();
            },
            finish(ctx) {
                if(!this.active||!this.holeReady){this.active=false;return;}
                try {
                    const gl=this.gl,w=ctx.canvas.width,h=ctx.canvas.height,columns=Math.ceil(w/this.TILE),rows=Math.ceil(h/this.TILE),count=columns*rows;
                    if(count>gl.getParameter(gl.MAX_TEXTURE_SIZE)||gl.isContextLost())throw new Error('Gamma surface limit');
                    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;gl.viewport(0,0,w,h);gl.useProgram(this.program);gl.disable(gl.BLEND);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
                    for(const [i,cv]of [[0,this.hole],[1,ctx.canvas],[2,this.veil]]){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);if(this.textureSizes[i]!==w+':'+h){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);this.textureSizes[i]=w+':'+h;}else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,cv);}
                    const stride=this.LIMIT+1;
                    if(!this.tileData||this.tileData.length!==count*stride)this.tileData=new Uint16Array(count*stride);else this.tileData.fill(0);
                    this.recordData.fill(0);
                    this.records.forEach((r,i)=>{
                        this.recordData.set([r.x,r.y,r.w,r.h,(r.slot.x+1)/this.atlasSize,(r.slot.y+1)/this.atlasHeight,r.cv.width/this.atlasSize,r.cv.height/this.atlasHeight,r.alpha,r.mode==='hole'?0:1,0,0],i*12);
                        const x0=Math.max(0,Math.floor(r.x/32)),y0=Math.max(0,Math.floor(r.y/32)),x1=Math.min(columns-1,Math.floor((r.x+r.w)/32)),y1=Math.min(rows-1,Math.floor((r.y+r.h)/32));
                        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const offset=(y*columns+x)*stride,n=++this.tileData[offset];this.tileData[offset+n]=i;this.stats.tileMax=Math.max(this.stats.tileMax,n);}
                    });
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
                    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.textures[4]);if(!this.textureSizes[4]){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,3,this.LIMIT,0,gl.RGBA,gl.FLOAT,this.recordData);this.textureSizes[4]=true;}else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,3,this.LIMIT,gl.RGBA,gl.FLOAT,this.recordData);
                    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,this.textures[5]);if(this.textureSizes[5]!==count){gl.texImage2D(gl.TEXTURE_2D,0,gl.R16UI,stride,count,0,gl.RED_INTEGER,gl.UNSIGNED_SHORT,this.tileData);this.textureSizes[5]=count;}else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,stride,count,gl.RED_INTEGER,gl.UNSIGNED_SHORT,this.tileData);
                    gl.uniform2f(this.uniforms.size,w,h);gl.uniform1i(this.uniforms.columns,columns);gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw new Error('Gamma GPU resolve failed');this.stats.draws=1;
                    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.drawImage(this.canvas,0,0);ctx.restore();
                } catch (_) {this._cpu(ctx);this.failed=true;this.stats.backend='high-fallback';}
                this.active=false;this.records.length=0;
            }
        };
