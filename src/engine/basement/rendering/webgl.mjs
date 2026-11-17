// ===== LV0 BASEMENT =====
// WEBGL: the packet contract drawn with WebGL 2. It takes the same frames as the Canvas backend and
// declares the part of the vocabulary it draws exactly (WEBGL_CAPABILITIES); the render system refuses a
// frame that needs anything else before it is drawn, so a missing feature fails loudly and never draws
// wrong. Every shape is stencil-then-cover: its outline's triangles mark the covered pixels in the
// stencil (by winding, so holes and both fill rules come out as Canvas draws them), then one quad over
// the shape paints those pixels once with its colour, gradient or pattern. Clips are the stencil's top
// bit. Offscreen targets, layers and pictures are framebuffers. Text is drawn as a picture of the line,
// rasterized by the platform's text drawing (canvas.mjs), because WebGL has no text of its own.
import {CAPABILITIES} from './values.mjs';
import {packet as normalizePacket,requirements} from './packets.mjs';
import {premultiplied,gradientRamp} from './colors.mjs';
import {flattenGeometry,fillTriangles,strokeTriangles,dashPaths} from './paths.mjs';
import {rasterizeCanvasText,measureCanvasText} from './canvas.mjs';

/**
 * WebGL's blend functions for each engine blend it draws exactly, as premultiplied colour
 * [source colour, destination colour, source alpha, destination alpha]. `multiply` is exact over an
 * opaque destination (a scene), which is where the engine uses it.
 */
const BLEND_FUNCTIONS=Object.freeze({
    normal:['ONE','ONE_MINUS_SRC_ALPHA','ONE','ONE_MINUS_SRC_ALPHA'],
    add:['ONE','ONE','ONE','ONE'],
    multiply:['DST_COLOR','ONE_MINUS_SRC_ALPHA','ONE','ONE_MINUS_SRC_ALPHA'],
    screen:['ONE','ONE_MINUS_SRC_COLOR','ONE','ONE_MINUS_SRC_ALPHA'],
    'source-atop':['DST_ALPHA','ONE_MINUS_SRC_ALPHA','ZERO','ONE'],
    'destination-out':['ZERO','ONE_MINUS_SRC_ALPHA','ZERO','ONE_MINUS_SRC_ALPHA'],
    'destination-over':['ONE_MINUS_DST_ALPHA','ONE','ONE_MINUS_DST_ALPHA','ONE'],
});
/**
 * What this backend draws. Not yet: the blends that read the destination
 * per pixel (`overlay`, `soft-light`, `lighten`, `darken`) and the ones Canvas applies to the whole
 * surface outside the shape (`source-in`, `source-out`, `destination-in`).
 */
export const WEBGL_CAPABILITIES=Object.freeze(['shape','sprite','text','picture','geometry:rect','geometry:ellipse','geometry:path','gradient:linear','gradient:radial','pattern','clip','shadow','blur','dash','target','layer',...Object.keys(BLEND_FUNCTIONS).map(name=>`blend:${name}`)]);
if(WEBGL_CAPABILITIES.some(need=>!CAPABILITIES.includes(need)))throw new Error('WebGL declares a capability the engine does not name');

const VERTEX=`#version 300 es
in vec2 a_position;uniform vec3 u_row0,u_row1;out vec2 v_local;
void main(){v_local=a_position;vec3 p=vec3(a_position,1.);gl_Position=vec4(dot(u_row0,p),dot(u_row1,p),0.,1.);}`;
// Modes: 0 colour, 1 linear gradient, 2 radial gradient (Canvas's two circles), 3 pattern, 4 texture, 5 a texture's alpha in one colour (a shadow).
// Outside a gradient's cone or a pattern that does not repeat the paint is transparent, never discarded:
// the cover pass must still reset the stencil there.
const FRAGMENT=`#version 300 es
precision highp float;in vec2 v_local;
uniform int u_mode;uniform vec4 u_color,u_points,u_uv;uniform vec2 u_radii,u_repeat;uniform float u_opacity;uniform sampler2D u_texture;out vec4 color;
void main(){
 if(u_mode==0){color=u_color;return;}
 if(u_mode==4){color=texture(u_texture,v_local*u_uv.xy+u_uv.zw)*u_opacity;return;}
 if(u_mode==5){color=u_color*texture(u_texture,v_local*u_uv.xy+u_uv.zw).a;return;}
 if(u_mode==3){vec2 uv=v_local*u_uv.xy;bool out_x=u_repeat.x<.5&&(uv.x<0.||uv.x>1.),out_y=u_repeat.y<.5&&(uv.y<0.||uv.y>1.);color=out_x||out_y?vec4(0):texture(u_texture,uv)*u_opacity;return;}
 float t;
 if(u_mode==1){vec2 d=u_points.zw-u_points.xy;float l=dot(d,d);if(l<1e-12){color=vec4(0);return;}t=dot(v_local-u_points.xy,d)/l;}
 else{
  vec2 cd=u_points.zw-u_points.xy,pd=v_local-u_points.xy;float r0=u_radii.x,dr=u_radii.y-u_radii.x;
  float a=dot(cd,cd)-dr*dr,b=dot(pd,cd)+r0*dr,c=dot(pd,pd)-r0*r0;
  if(abs(a)<1e-6){if(abs(b)<1e-9){color=vec4(0);return;}t=c/(2.*b);if(r0+t*dr<0.){color=vec4(0);return;}}
  else{float q=b*b-a*c;if(q<0.){color=vec4(0);return;}float s=sqrt(q),hi=max((b+s)/a,(b-s)/a),lo=min((b+s)/a,(b-s)/a);
   if(r0+hi*dr>=0.)t=hi;else if(r0+lo*dr>=0.)t=lo;else{color=vec4(0);return;}}
 }
 color=texture(u_texture,vec2(clamp(t,0.,1.)*(255./256.)+.5/256.,.5))*u_opacity;
}`;

// One direction of a Gaussian blur over the top-left `u_region` pixels of a surface `u_size` big, read with
// the surface's rows bottom-up. Taps past the region repeat its edge, which the caller pads with clear pixels.
const MAX_TAPS=24;
const BLUR_FRAGMENT=`#version 300 es
precision highp float;in vec2 v_local;uniform sampler2D u_texture;uniform vec2 u_size,u_region,u_dir;uniform float u_sigma;out vec4 color;
void main(){
 vec2 lo=vec2(.5,u_size.y-u_region.y+.5),hi=vec2(u_region.x-.5,u_size.y-.5),at=vec2(v_local.x,u_size.y-v_local.y);
 int r=int(ceil(u_sigma*3.));vec4 sum=vec4(0);float total=0.;
 for(int i=-${MAX_TAPS};i<=${MAX_TAPS};i++){if(i<-r||i>r)continue;float w=exp(-float(i*i)/(2.*u_sigma*u_sigma));sum+=texture(u_texture,clamp(at+u_dir*float(i),lo,hi)/u_size)*w;total+=w;}
 color=sum/total;
}`;
const BLUR_SIGMA=MAX_TAPS/3;   // a wider blur is drawn smaller and stretched back

const IDENTITY=Object.freeze([1,0,0,1,0,0]);
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const scaled=(m,sx,sy)=>[m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy];
const scaleOf=m=>Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]),1e-6);
const quad=(l,t,r,b)=>new Float32Array([l,t,r,t,l,b,r,t,r,b,l,b]);
function bounds(triangles){let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(let i=0;i<triangles.length;i+=2){const x=triangles[i],y=triangles[i+1];if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}return l<=r?quad(l,t,r,b):null;}
function decodeImage(url){
    if(typeof Image==='undefined')throw new Error('Supply an image decoder on this platform');
    return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Cannot decode image: ${url.slice(0,100)}`));image.src=url;});
}
// Least recently used first: a Map read moves its entry to the back.
function touch(map,key){const value=map.get(key);if(value!==undefined){map.delete(key);map.set(key,value);}return value;}

/** WebGL 2 implementation of the packet contract. The context and every GPU handle stay private. */
export class webglRenderer {
    #surface=null;#gl=null;#viewport=null;#main=null;#program=null;#uniforms={};#buffer=null;#vao=null;#samplers=null;#samples=0;#maxTexture=4096;
    #resources=new Map();#ramps=new Map();#texts=new Map();#pictures=new Map();#pictureBytes=0;#vectorPictures=new Set();#layer=null;#bound=null;
    #decodeImage;#createSurface;#maxPictureBytes;#densities;#disposed=false;#generation=0;#blurProgram=null;#blurUniforms={};#scratch=null;
    /**
     * `decode_image(url)` gives an image WebGL can upload (default: the browser's Image); `create_surface(w, h)`
     * makes the 2D surfaces text is rasterized on (default: canvas.mjs's). Pictures are painted at the first of
     * `densities` (device pixels per local unit) the view needs, kept up to `max_picture_bytes`, least recently stamped going first.
     */
    constructor({decode_image=decodeImage,create_surface,max_picture_bytes=64*1048576,densities=[1,1.5,2,3,4]}={}){
        if(!Array.isArray(densities)||!densities.length||densities.some((d,i)=>!(d>0)||(i&&d<=densities[i-1])))throw new TypeError('Densities must rise');
        if(!(max_picture_bytes>0))throw new TypeError('Pictures need a memory budget');
        this.#decodeImage=decode_image;this.#createSurface=create_surface;this.#maxPictureBytes=max_picture_bytes;this.#densities=[...densities];
    }
    get capabilities(){return WEBGL_CAPABILITIES;}
    /** One line of text's width, ascent and descent: text is rasterized by the platform, so it measures as the Canvas backend does. */
    measureText(text,font={}){return measureCanvasText(text,font,this.#createSurface?{create_surface:this.#createSurface}:{});}
    initialize(surface,{viewport}){
        if(this.#disposed||this.#gl)throw new Error('Renderer cannot initialize twice');
        if(!surface||typeof surface.getContext!=='function')throw new TypeError('WebGL renderer requires a surface');
        const gl=surface.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true,stencil:true,depth:false,preserveDrawingBuffer:false});
        if(!gl)throw new Error('WebGL 2 context unavailable');
        if(!gl.getContextAttributes()?.stencil)throw new Error('WebGL context has no stencil buffer');
        this.#surface=surface;this.#gl=gl;this.#setup();this.resize(viewport);
    }
    #setup(){
        const gl=this.#gl,shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`WebGL shader: ${gl.getShaderInfoLog(s)}`);return s;};
        const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.bindAttribLocation(program,0,'a_position');gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`WebGL program: ${gl.getProgramInfoLog(program)}`);
        this.#program=program;
        const blur=gl.createProgram();gl.attachShader(blur,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(blur,shader(gl.FRAGMENT_SHADER,BLUR_FRAGMENT));gl.bindAttribLocation(blur,0,'a_position');gl.linkProgram(blur);
        if(!gl.getProgramParameter(blur,gl.LINK_STATUS))throw new Error(`WebGL program: ${gl.getProgramInfoLog(blur)}`);
        this.#blurProgram=blur;gl.useProgram(blur);for(const name of ['u_row0','u_row1','u_texture','u_size','u_region','u_dir','u_sigma'])this.#blurUniforms[name]=gl.getUniformLocation(blur,name);gl.uniform1i(this.#blurUniforms.u_texture,0);
        gl.useProgram(program);
        for(const name of ['u_row0','u_row1','u_mode','u_color','u_points','u_uv','u_radii','u_repeat','u_opacity','u_texture'])this.#uniforms[name]=gl.getUniformLocation(program,name);
        gl.uniform1i(this.#uniforms.u_texture,0);
        this.#vao=gl.createVertexArray();gl.bindVertexArray(this.#vao);this.#buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.#buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        const sampler=wrap=>{const s=gl.createSampler();gl.samplerParameteri(s,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.samplerParameteri(s,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.samplerParameteri(s,gl.TEXTURE_WRAP_S,wrap);gl.samplerParameteri(s,gl.TEXTURE_WRAP_T,wrap);return s;};
        this.#samplers={clamp:sampler(gl.CLAMP_TO_EDGE),repeat:sampler(gl.REPEAT)};
        this.#samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES)||0);this.#maxTexture=gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096;
        gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.enable(gl.STENCIL_TEST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
        this.#main={width:1,height:1,fbo:null,flip:false};
    }
    #live(){if(this.#disposed||!this.#gl)throw new Error('WebGL renderer is not initialized');}
    getSurfaceBounds(){this.#live();const r=this.#surface.getBoundingClientRect?.();return Object.freeze(r?{left:r.left,top:r.top,width:r.width,height:r.height}:{left:0,top:0,width:this.#viewport.width,height:this.#viewport.height});}
    resize(viewport){
        this.#live();const w=Math.max(1,Math.round(viewport.width*viewport.pixel_ratio)),h=Math.max(1,Math.round(viewport.height*viewport.pixel_ratio));
        if(this.#surface.width!==w)this.#surface.width=w;if(this.#surface.height!==h)this.#surface.height=h;this.#main.width=w;this.#main.height=h;this.#viewport=viewport;
    }

    // ----- GPU objects -----
    #texture(width,height,{pixels=null,image=null}={}){
        const gl=this.#gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        if(image){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}finally{gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);}}
        else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        return texture;
    }
    // A surface to draw into: a texture to sample, drawn through a multisampled buffer with its own stencil and
    // resolved into the texture after each pass. Its rows run bottom-up, so sampling it flips v.
    #target(width,height){
        const gl=this.#gl;if(width>this.#maxTexture||height>this.#maxTexture)throw new Error(`Render target larger than ${this.#maxTexture}px`);
        const texture=this.#texture(width,height),resolve=gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER,resolve);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
        const target={width,height,texture,resolve,fbo:resolve,color:null,stencil:gl.createRenderbuffer(),flip:true};
        if(this.#samples>0){
            target.fbo=gl.createFramebuffer();target.color=gl.createRenderbuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);
            gl.bindRenderbuffer(gl.RENDERBUFFER,target.color);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,this.#samples,gl.RGBA8,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,target.color);
            gl.bindRenderbuffer(gl.RENDERBUFFER,target.stencil);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,this.#samples,gl.DEPTH24_STENCIL8,width,height);
        }else{gl.bindRenderbuffer(gl.RENDERBUFFER,target.stencil);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH24_STENCIL8,width,height);}
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,target.stencil);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){this.#freeTarget(target);throw new Error('WebGL render target incomplete');}
        this.#bound=null;this.#bind(target);gl.clearColor(0,0,0,0);gl.clearStencil(0);gl.stencilMask(0xff);gl.clear(gl.COLOR_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);this.#resolve(target);
        return target;
    }
    #freeTarget(target){const gl=this.#gl;gl.deleteTexture(target.texture);if(target.fbo!==target.resolve)gl.deleteFramebuffer(target.fbo);gl.deleteFramebuffer(target.resolve);if(target.color)gl.deleteRenderbuffer(target.color);gl.deleteRenderbuffer(target.stencil);if(this.#bound===target)this.#bound=null;}
    #bind(target){const gl=this.#gl;if(this.#bound===target)return;gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.viewport(0,0,target.width,target.height);this.#bound=target;}
    #resolve(target){
        if(target.fbo===target.resolve||target.fbo===null)return;const gl=this.#gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,target.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,target.resolve);
        gl.blitFramebuffer(0,0,target.width,target.height,0,0,target.width,target.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER,this.#bound?.fbo??null);
    }

    // ----- Resources -----
    async registerResource(id,descriptor){
        this.#live();const generation=this.#generation;let entry={descriptor};
        try{
            if(descriptor.type==='image'){
                if(descriptor.url){const image=await this.#decodeImage(descriptor.url);if(this.#disposed||generation!==this.#generation){image.close?.();throw new Error('Resource creation was cancelled');}
                    try{entry.width=image.naturalWidth||image.width;entry.height=image.naturalHeight||image.height;entry.texture=this.#texture(entry.width,entry.height,{image});}finally{image.close?.();}}
                else{
                    const bytes=new Uint8Array(descriptor.pixels.length);for(let i=0;i<bytes.length;i+=4){const a=descriptor.pixels[i+3]/255;bytes[i]=Math.round(descriptor.pixels[i]*a);bytes[i+1]=Math.round(descriptor.pixels[i+1]*a);bytes[i+2]=Math.round(descriptor.pixels[i+2]*a);bytes[i+3]=descriptor.pixels[i+3];}
                    entry.width=descriptor.width;entry.height=descriptor.height;entry.texture=this.#texture(entry.width,entry.height,{pixels:bytes});
                }
                entry.flip=false;
            }else if(descriptor.type==='target'){entry.target=this.#target(descriptor.width,descriptor.height);entry.texture=entry.target.texture;entry.width=descriptor.width;entry.height=descriptor.height;entry.flip=true;}
            else if(descriptor.type==='geometry')entry.flat=new Map();
            if(this.#disposed||generation!==this.#generation)throw new Error('Resource creation was cancelled');
            const old=this.#resources.get(id);this.#resources.set(id,entry);entry=null;if(old)this.#release(old);
        }finally{if(entry&&!this.#disposed)this.#release(entry);}
    }
    #release(entry){if(entry.target)this.#freeTarget(entry.target);else if(entry.texture)this.#gl.deleteTexture(entry.texture);}
    releaseResource(id){const entry=this.#resources.get(id);if(!entry)return;this.#resources.delete(id);this.#release(entry);}
    #descriptor=(id,types)=>{const entry=this.#resources.get(id),kinds=Array.isArray(types)?types:[types];if(!entry||!kinds.includes(entry.descriptor.type))throw new Error(`Missing or incompatible rendering resource: ${id}`);return entry.descriptor;};

    // ----- Drawing -----
    #draw(vertices){const gl=this.#gl;gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/2);}
    #rows(m){const gl=this.#gl,t=this.#bound,W=t.width,H=t.height;gl.uniform3f(this.#uniforms.u_row0,2*m[0]/W,2*m[2]/W,2*m[4]/W-1);gl.uniform3f(this.#uniforms.u_row1,-2*m[1]/H,-2*m[3]/H,1-2*m[5]/H);}
    #blend(name){const gl=this.#gl,f=BLEND_FUNCTIONS[name];if(!f)throw new Error(`Renderer capability unavailable: blend:${name}`);gl.blendEquation(gl.FUNC_ADD);gl.blendFuncSeparate(gl[f[0]],gl[f[1]],gl[f[2]],gl[f[3]]);}
    #ramp(stops){
        const key=JSON.stringify(stops);let texture=touch(this.#ramps,key);
        if(!texture){texture=this.#texture(256,1,{pixels:gradientRamp(stops,256)});this.#ramps.set(key,texture);if(this.#ramps.size>128){const [first,old]=this.#ramps.entries().next().value;this.#gl.deleteTexture(old);this.#ramps.delete(first);}}
        return texture;
    }
    #paint(paint,opacity){
        const gl=this.#gl,u=this.#uniforms;
        if(typeof paint==='string'){gl.uniform1i(u.u_mode,0);gl.uniform4fv(u.u_color,premultiplied(paint,opacity));return;}
        gl.uniform1f(u.u_opacity,opacity);gl.activeTexture(gl.TEXTURE0);
        if(paint.type==='pattern'){
            const image=this.#resources.get(paint.image);gl.uniform1i(u.u_mode,3);gl.bindTexture(gl.TEXTURE_2D,image.texture);gl.bindSampler(0,this.#samplers.repeat);
            gl.uniform4f(u.u_uv,1/image.width,1/image.height,0,0);gl.uniform2f(u.u_repeat,paint.repeat==='repeat'||paint.repeat==='repeat-x'?1:0,paint.repeat==='repeat'||paint.repeat==='repeat-y'?1:0);return;
        }
        gl.uniform1i(u.u_mode,paint.type==='linear'?1:2);gl.uniform4f(u.u_points,...paint.from,...paint.to);gl.uniform2f(u.u_radii,paint.inner_radius??0,paint.outer_radius??0);
        gl.bindTexture(gl.TEXTURE_2D,this.#ramp(paint.stops));gl.bindSampler(0,this.#samplers.clamp);
    }
    #texturePaint(texture,uv,opacity){const gl=this.#gl,u=this.#uniforms;gl.uniform1i(u.u_mode,4);gl.uniform1f(u.u_opacity,opacity);gl.uniform4fv(u.u_uv,uv);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindSampler(0,this.#samplers.clamp);}
    // The stencil: bit 7 is the clip, bits 0-6 a shape's coverage, always zero again between shapes.
    #mark(clipped,stroke,rule){
        const gl=this.#gl;gl.colorMask(false,false,false,false);gl.stencilMask(0x7f);
        if(stroke){gl.stencilFunc(clipped?gl.EQUAL:gl.ALWAYS,clipped?0x81:1,clipped?0x80:0xff);gl.stencilOp(gl.KEEP,gl.KEEP,gl.REPLACE);}
        else{gl.stencilFunc(clipped?gl.EQUAL:gl.ALWAYS,clipped?0x80:0,clipped?0x80:0xff);if(rule==='evenodd')gl.stencilOp(gl.KEEP,gl.KEEP,gl.INVERT);else{gl.stencilOpSeparate(gl.FRONT,gl.KEEP,gl.KEEP,gl.INCR_WRAP);gl.stencilOpSeparate(gl.BACK,gl.KEEP,gl.KEEP,gl.DECR_WRAP);}}
    }
    #cover(){const gl=this.#gl;gl.colorMask(true,true,true,true);gl.stencilMask(0x7f);gl.stencilFunc(gl.NOTEQUAL,0,0x7f);gl.stencilOp(gl.KEEP,gl.KEEP,gl.ZERO);}
    #direct(clipped){const gl=this.#gl;gl.colorMask(true,true,true,true);gl.stencilMask(0);gl.stencilFunc(clipped?gl.EQUAL:gl.ALWAYS,clipped?0x80:0,clipped?0x80:0xff);gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);}
    #flatten(entry,g,m){
        const tolerance=.25/scaleOf(m);if(!entry)return flattenGeometry(g,tolerance);
        const bucket=2**Math.floor(Math.log2(tolerance));let paths=entry.flat.get(bucket);if(!paths){paths=flattenGeometry(g,bucket);if(entry.flat.size>6)entry.flat.clear();entry.flat.set(bucket,paths);}return paths;
    }
    #geometry(id,inline){return id?{entry:this.#resources.get(id),g:this.#resources.get(id).descriptor.geometry}:{entry:null,g:inline};}
    // Each clip narrows bit 7 to where it and every clip before it cover.
    #clip(clips){
        const gl=this.#gl;
        clips.forEach(({entry,g,matrix},index)=>{
            const triangles=fillTriangles(this.#flatten(entry,g,matrix));
            this.#mark(index>0,false,clips[index].rule);this.#rows(matrix);if(triangles.length)this.#draw(triangles);
            gl.stencilMask(0xff);gl.stencilFunc(gl.NOTEQUAL,0x80,0x7f);gl.stencilOp(gl.ZERO,gl.ZERO,gl.REPLACE);gl.uniform3f(this.#uniforms.u_row0,1,0,0);gl.uniform3f(this.#uniforms.u_row1,0,1,0);this.#draw(quad(-1,-1,1,1));
        });
    }
    #clearStencil(){const gl=this.#gl;gl.stencilMask(0xff);gl.clearStencil(0);gl.clear(gl.STENCIL_BUFFER_BIT);}
    #shape(d,m,material,clipped,opacity){
        const {entry,g}=this.#geometry(d.geometry_id,d.geometry),paths=this.#flatten(entry,g,m);this.#rows(m);
        if(material.fill!==null){const triangles=fillTriangles(paths),box=bounds(triangles);if(box){this.#mark(clipped,false,g.fill_rule);this.#draw(triangles);this.#cover();this.#paint(material.fill,opacity);this.#draw(box);}}
        if(material.stroke!==null&&material.stroke_width>0){
            const lines=material.dash.length?dashPaths(paths,material.dash,material.dash_offset):paths;
            const triangles=strokeTriangles(lines,{width:material.stroke_width,line_cap:material.line_cap,line_join:material.line_join,tolerance:.25/scaleOf(m)}),box=bounds(triangles);
            if(box){this.#mark(clipped,true);this.#draw(triangles);this.#cover();this.#paint(material.stroke,opacity);this.#draw(box);}
        }
    }
    #sprite(d,m,clipped,opacity){
        const image=this.#resources.get(d.resource_id),[w,h]=d.size,x0=-w*d.origin[0],y0=-h*d.origin[1],[sx,sy,sw,sh]=d.source??[0,0,image.width,image.height];
        let su=sw/(w*image.width),ou=(sx-x0*sw/w)/image.width,sv=sh/(h*image.height),ov=(sy-y0*sh/h)/image.height;if(image.flip){sv=-sv;ov=1-ov;}
        this.#rows(m);this.#direct(clipped);this.#texturePaint(image.texture,[su,sv,ou,ov],opacity);this.#draw(quad(x0,y0,x0+w,y0+h));
    }
    #text(d,m,material,clipped,opacity){
        const line=this.#textLine(d,m,material);if(!line)return;
        this.#rows(m);this.#direct(clipped);this.#texturePaint(line.texture,[1/line.width,1/line.height,-line.x/line.width,-line.y/line.height],opacity);this.#draw(quad(line.x,line.y,line.x+line.width,line.y+line.height));
    }
    #textLine(d,m,material){
        const scale=2**(Math.ceil(Math.log2(scaleOf(m))*4)/4),paint=p=>p===null||typeof p==='string'?p:JSON.stringify(p);
        const key=JSON.stringify([d.text,d.font,d.align,d.baseline,paint(material.fill),paint(material.stroke),material.stroke_width,material.line_cap,material.line_join,material.dash,material.dash_offset,scale]);
        let line=touch(this.#texts,key);
        if(line===undefined){
            const raster=rasterizeCanvasText(d.text,d.font,{align:d.align,baseline:d.baseline,material},scale,{max_size:this.#maxTexture,...(this.#createSurface?{create_surface:this.#createSurface}:{})});
            line=null;if(raster){try{line={texture:this.#texture(raster.surface.width,raster.surface.height,{image:raster.surface}),x:raster.x,y:raster.y,width:raster.width,height:raster.height};}finally{raster.surface.width=0;raster.surface.height=0;}}
            this.#texts.set(key,line);if(this.#texts.size>512){const [first,old]=this.#texts.entries().next().value;if(old)this.#gl.deleteTexture(old.texture);this.#texts.delete(first);}
        }
        return line;
    }
    // A picture's packets, checked against what this backend draws, the way the render system checks a frame's.
    #build(d){
        return d.build().map(description=>{const p=normalizePacket(description,{});if(p.type==='picture')throw new Error('A picture cannot hold a picture');for(const need of requirements(p,this.#descriptor))if(!WEBGL_CAPABILITIES.includes(need))throw new Error(`Renderer capability unavailable: ${need}`);return p;});
    }
    #picture(d,m,context,clips,opacity,blend){
        const p=d.picture,[bx,by,bw,bh]=p.bounds,local=multiply(m,p.matrix),density=this.#densities.find(x=>x>=scaleOf(local)-1e-9),[rx,ry,rw,rh]=p.source??p.bounds;
        const vector=packets=>{   // drawn shape by shape, kept inside the picture's bounds (or its source), the way Canvas draws a picture it does not keep
            if(d.prepare)return;packets??=this.#build(d);
            const box={entry:null,g:{type:'path',commands:[['rect',rx,ry,rw,rh]],fill_rule:'nonzero'},matrix:local,rule:'nonzero'};
            const inner={view:local,sx:1,sy:1,clips:[...clips,box],opacity,blend};for(const packet of packets)this.#packet(packet,inner);
        };
        if(density===undefined||this.#vectorPictures.has(p.key))return vector();
        const id=`${p.key}@${density}`;let entry=touch(this.#pictures,id);
        if(!entry){
            const packets=this.#build(d);
            if(!(context.layered||p.layered)&&packets.some(packet=>packet.blend!=='normal')){this.#vectorPictures.add(p.key);return vector(packets);}   // its blends need what is under it
            const W=Math.ceil(bw*density),H=Math.ceil(bh*density),bytes=W*H*4;
            if(bytes>this.#maxPictureBytes||W>this.#maxTexture||H>this.#maxTexture)return vector(packets);
            for(const [key,old]of this.#pictures){if(this.#pictureBytes+bytes<=this.#maxPictureBytes)break;this.#freeTarget(old.target);this.#pictureBytes-=old.bytes;this.#pictures.delete(key);}
            const back=this.#bound,target=this.#target(W,H);
            try{const inner={view:[W/bw,0,0,H/bh,-bx*W/bw,-by*H/bh],sx:1,sy:1,clips:[],opacity:1,blend:null,layered:true};this.#bind(target);for(const packet of packets)this.#packet(packet,inner);this.#resolve(target);}
            catch(error){this.#freeTarget(target);throw error;}
            finally{this.#bind(back);}
            entry={target,bytes};this.#pictures.set(id,entry);this.#pictureBytes+=bytes;
        }
        if(d.prepare)return;
        const x0=Math.max(rx,bx),y0=Math.max(ry,by),x1=Math.min(rx+rw,bx+bw),y1=Math.min(ry+rh,by+bh);if(!(x1>x0&&y1>y0))return;
        if(clips.length)this.#clip(clips);
        this.#blend(blend??d.blend);this.#rows(local);this.#direct(clips.length>0);this.#texturePaint(entry.target.texture,[1/bw,-1/bh,-bx/bw,1+by/bh],opacity);this.#draw(quad(x0,y0,x1,y1));
        if(clips.length)this.#clearStencil();
    }
    // One packet under `context`: {view, sx, sy, clips, opacity, blend, layered}. `blend` and `clips` come from a picture drawn as vector.
    #packet(d,context){
        const base=d.space==='world'?scaled(context.view,context.sx,context.sy):[context.sx,0,0,context.sy,0,0],m=multiply(base,d.transform);
        const clips=context.clips.length||d.clips.length?[...context.clips,...d.clips.map(clip=>({...this.#geometry(clip.geometry_id,clip.geometry),matrix:multiply(m,clip.transform),rule:clip.rule}))]:context.clips;
        const opacity=d.opacity*context.opacity,blend=context.blend&&d.blend==='normal'?context.blend:d.blend;
        if(d.type==='picture')return this.#picture(d,m,context,clips,opacity,blend);
        const material=d.material_id?this.#resources.get(d.material_id).descriptor.material:d.material;
        if(material.blur||material.shadow)return this.#soft(d,m,material,clips,opacity,blend,context);
        this.#plain(d,m,material,clips,opacity,blend);
    }
    #plain(d,m,material,clips,opacity,blend){
        const clipped=clips.length>0;if(clipped)this.#clip(clips);
        try{
            this.#blend(blend);
            if(d.type==='shape')this.#shape(d,m,material,clipped,opacity);
            else if(d.type==='sprite')this.#sprite(d,m,clipped,opacity);
            else this.#text(d,m,material,clipped,opacity);
        }finally{if(clipped)this.#clearStencil();}
    }
    // Where a packet draws on the bound surface: [left, top, right, bottom] in its pixels, or null.
    #extent(d,m,material){
        let local;
        if(d.type==='shape'){
            const {entry,g}=this.#geometry(d.geometry_id,d.geometry),pad=material.stroke!==null&&material.stroke_width>0?material.stroke_width*(material.line_join==='miter'?5:1):0;let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
            for(const path of this.#flatten(entry,g,m))for(let i=0;i<path.points.length;i+=2){const x=path.points[i],y=path.points[i+1];if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
            if(!(l<=r))return null;local=[l-pad,t-pad,r+pad,b+pad];
        }else if(d.type==='sprite'){const [w,h]=d.size,x0=-w*d.origin[0],y0=-h*d.origin[1];local=[x0,y0,x0+w,y0+h];}
        else{const line=this.#textLine(d,m,material);if(!line)return null;local=[line.x,line.y,line.x+line.width,line.y+line.height];}
        let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
        for(const [x,y] of [[local[0],local[1]],[local[2],local[1]],[local[0],local[3]],[local[2],local[3]]]){const px=m[0]*x+m[2]*y+m[4],py=m[1]*x+m[3]*y+m[5];if(px<l)l=px;if(px>r)r=px;if(py<t)t=py;if(py>b)b=py;}
        return [l,t,r,b];
    }
    /**
     * A blurred or shadowed packet: drawn sharp on a scratch surface around it (smaller when the blur is wide),
     * blurred there in two passes, then laid on the surface under the packet's clips and blend: the shadow in its
     * colour at its offset first, then the packet itself, blurred or sharp. Blurs are Canvas's: `blur` is the
     * spread, a shadow's `blur` twice it, both in pass units.
     */
    #soft(d,m,material,clips,opacity,blend,context){
        const back=this.#bound,k=Math.max(context.sx,context.sy),shadow=material.shadow,box=this.#extent(d,m,material);
        const blur=material.blur*k,cast=shadow?Math.hypot(shadow.blur*k/2,blur):0,sigma=Math.max(blur,cast),pad=Math.ceil(3*sigma)+2;
        const ox=shadow?shadow.offset[0]*context.sx:0,oy=shadow?shadow.offset[1]*context.sy:0;
        if(box){
            const x0=Math.floor(Math.max(box[0]-pad,-pad-Math.abs(ox))),y0=Math.floor(Math.max(box[1]-pad,-pad-Math.abs(oy))),x1=Math.ceil(Math.min(box[2]+pad,back.width+pad+Math.abs(ox))),y1=Math.ceil(Math.min(box[3]+pad,back.height+pad+Math.abs(oy)));
            if(x1>x0&&y1>y0){
                const most=Math.min(this.#maxTexture,2048),s=Math.min(1,sigma>BLUR_SIGMA?BLUR_SIGMA/sigma:1,most/(x1-x0),most/(y1-y0)),w=Math.ceil((x1-x0)*s),h=Math.ceil((y1-y0)*s);
                const [a]=this.#scratchFor(w,h);
                try{
                    this.#bind(a);this.#clearRegion(w,h);this.#plain(d,multiply([s,0,0,s,-x0*s,-y0*s],m),material,[],1,'normal');this.#resolve(a);
                    const lay=(surface,mode,dx,dy)=>{
                        this.#bind(back);const clipped=clips.length>0;if(clipped)this.#clip(clips);
                        try{this.#blend(blend);this.#rows([1/s,0,0,1/s,x0+dx,y0+dy]);this.#direct(clipped);this.#texturePaint(surface.texture,[1/surface.width,-1/surface.height,0,1],opacity);
                            if(mode===5){this.#gl.uniform1i(this.#uniforms.u_mode,5);this.#gl.uniform4fv(this.#uniforms.u_color,premultiplied(shadow.color,opacity));}
                            this.#draw(quad(0,0,w,h));}
                        finally{if(clipped)this.#clearStencil();}
                    };
                    if(shadow&&premultiplied(shadow.color,1)[3]>0)lay(cast*s>.05?this.#blurred(w,h,cast*s):a,5,ox,oy);
                    if(blur*s>.05){lay(this.#blurred(w,h,blur*s),4,0,0);return;}
                }finally{this.#bind(back);}
            }
        }
        if(!material.blur)this.#plain(d,m,material,clips,opacity,blend);
    }
    #clearRegion(w,h){const gl=this.#gl;gl.enable(gl.SCISSOR_TEST);gl.scissor(0,this.#bound.height-h,w,h);gl.colorMask(true,true,true,true);gl.stencilMask(0xff);gl.clearColor(0,0,0,0);gl.clearStencil(0);gl.clear(gl.COLOR_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);gl.disable(gl.SCISSOR_TEST);}
    // Three scratch surfaces at least w by h, grown in steps of 256 and kept.
    #scratchFor(w,h){
        const sc=this.#scratch;if(sc&&sc[0].width>=w&&sc[0].height>=h)return sc;
        const W=Math.ceil(Math.max(w,sc?.[0].width??0)/256)*256,H=Math.ceil(Math.max(h,sc?.[0].height??0)/256)*256;
        if(sc)for(const t of sc)this.#freeTarget(t);this.#scratch=null;this.#scratch=[this.#target(W,H),this.#target(W,H),this.#target(W,H)];return this.#scratch;
    }
    // The first scratch surface's top-left w by h blurred by sigma (pixels) into the third, through the second.
    #blurred(w,h,sigma){
        const gl=this.#gl,u=this.#blurUniforms,[a,b,c]=this.#scratch;gl.useProgram(this.#blurProgram);
        try{
            gl.blendEquation(gl.FUNC_ADD);gl.blendFuncSeparate(gl.ONE,gl.ZERO,gl.ONE,gl.ZERO);gl.activeTexture(gl.TEXTURE0);gl.bindSampler(0,this.#samplers.clamp);
            for(const [from,into,dir] of [[a,b,[1,0]],[b,c,[0,1]]]){
                this.#bind(into);this.#clearRegion(w,h);this.#direct(false);
                const W=into.width,H=into.height;gl.uniform3f(u.u_row0,2/W,0,-1);gl.uniform3f(u.u_row1,0,-2/H,1);
                gl.bindTexture(gl.TEXTURE_2D,from.texture);gl.uniform2f(u.u_size,from.width,from.height);gl.uniform2f(u.u_region,w,h);gl.uniform2f(u.u_dir,...dir);gl.uniform1f(u.u_sigma,sigma);
                this.#draw(quad(0,0,w,h));this.#resolve(into);
            }
        }finally{gl.useProgram(this.#program);}
        return c;
    }
    #clear(color){const gl=this.#gl,[r,g,b,a]=color===false?[0,0,0,0]:premultiplied(color);gl.colorMask(true,true,true,true);gl.stencilMask(0xff);gl.clearColor(r,g,b,a);gl.clearStencil(0);gl.clear(color===false?gl.STENCIL_BUFFER_BIT:gl.COLOR_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);}
    render(frame){
        this.#live();if(frame.format_version!==1)throw new TypeError('Unsupported render frame version');
        for(const pass of frame.passes){   // what the render system does not check per packet, checked before anything is drawn
            if(pass.layer&&!BLEND_FUNCTIONS[pass.layer.blend])throw new Error(`Renderer capability unavailable: blend:${pass.layer.blend}`);
            for(const d of pass.packets)if(d.type==='text'){const m=d.material_id?this.#resources.get(d.material_id).descriptor.material:d.material;if([m.fill,m.stroke].some(p=>p?.type==='pattern'))throw new Error('WebGL cannot fill text with a pattern');}
        }
        const gl=this.#gl;gl.useProgram(this.#program);gl.bindVertexArray(this.#vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.#buffer);this.#bound=null;
        const find=id=>id===null?this.#main:this.#resources.get(id).target;
        for(const pass of frame.passes){
            const layer=pass.layer,into=layer?find(layer.into):null;let target;
            if(layer){
                const w=Math.max(1,Math.round(into.width*layer.scale)),h=Math.max(1,Math.round(into.height*layer.scale));
                if(this.#layer&&(this.#layer.width!==w||this.#layer.height!==h)){this.#freeTarget(this.#layer);this.#layer=null;}
                target=this.#layer??=this.#target(w,h);
            }else target=find(pass.target_id);
            this.#bind(target);this.#clear(layer&&pass.clear_color===false?'transparent':pass.clear_color);
            const context={view:frame.view.world_to_screen,sx:target.width/pass.viewport.width,sy:target.height/pass.viewport.height,clips:[],opacity:1,blend:null,layered:!!layer};
            for(const d of pass.packets)this.#packet(d,context);
            if(target!==this.#main)this.#resolve(target);
            if(layer){
                this.#bind(into);this.#blend(layer.blend);this.#direct(false);this.#rows(IDENTITY);
                this.#texturePaint(target.texture,[1/into.width,-1/into.height,0,1],layer.opacity);this.#draw(quad(0,0,into.width,into.height));
            }
        }
        gl.bindSampler(0,null);
    }
    /** Pictures held and the bytes they use; for tests and tuning. */
    get statistics(){return Object.freeze({pictures:this.#pictures.size,picture_bytes:this.#pictureBytes,texts:this.#texts.size,ramps:this.#ramps.size,resources:this.#resources.size});}
    dispose(){
        if(this.#disposed)return;this.#disposed=true;this.#generation++;const gl=this.#gl;
        if(gl){
            for(const entry of this.#resources.values())this.#release(entry);for(const texture of this.#ramps.values())gl.deleteTexture(texture);
            for(const line of this.#texts.values())if(line)gl.deleteTexture(line.texture);for(const entry of this.#pictures.values())this.#freeTarget(entry.target);if(this.#layer)this.#freeTarget(this.#layer);for(const t of this.#scratch??[])this.#freeTarget(t);gl.deleteProgram(this.#blurProgram);
            gl.deleteBuffer(this.#buffer);gl.deleteVertexArray(this.#vao);gl.deleteProgram(this.#program);for(const sampler of Object.values(this.#samplers??{}))gl.deleteSampler(sampler);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        this.#resources.clear();this.#ramps.clear();this.#texts.clear();this.#pictures.clear();this.#vectorPictures.clear();this.#layer=null;this.#scratch=null;this.#gl=null;this.#surface=null;this.#bound=null;
    }
}
