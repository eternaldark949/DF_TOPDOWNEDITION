// ===== LV0 BASEMENT =====
import {renderFrame} from './frame.mjs';
import {BLENDS,CAPABILITIES} from './values.mjs';

/** Canvas's own composite operation for each engine blend name. */
const COMPOSITE=Object.freeze({normal:'source-over',add:'lighter',multiply:'multiply',screen:'screen','source-in':'source-in','source-out':'source-out','destination-in':'destination-in','destination-out':'destination-out','source-atop':'source-atop','destination-over':'destination-over',overlay:'overlay','soft-light':'soft-light',lighten:'lighten',darken:'darken'});
import {geometry} from './packets.mjs';
import {flattenGeometry,pathBounds} from './paths.mjs';
import {GRAIN_SIZE,grainPixels,grainOffset,GLOWS,glowPlan,glowSizes,thresholdFilter,bokehPlan} from './effects.mjs';
import {readColor} from './colors.mjs';

function createSurface(width,height){
    if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
    if(typeof document==='undefined')throw new Error('Supply a Canvas surface factory on this platform');
    const surface=document.createElement('canvas');surface.width=width;surface.height=height;return surface;
}
function decodeImage(url){
    if(typeof Image==='undefined')throw new Error('Supply an image decoder on this platform');
    return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Cannot decode image: ${url.slice(0,100)}`));image.src=url;});
}
function buildPath(target,g){
    target.beginPath?.();
    if(g.type==='rect'){const [w,h]=g.size;if(g.radius)target.roundRect(-w/2,-h/2,w,h,Math.min(g.radius,w/2,h/2));else target.rect(-w/2,-h/2,w,h);}
    else if(g.type==='ellipse'){target.ellipse(0,0,...g.radii,0,0,Math.PI*2);target.closePath();}
    else for(const c of g.commands){
        const op=c[0];
        if(op==='line')target.lineTo(c[1],c[2]);else if(op==='move')target.moveTo(c[1],c[2]);else if(op==='close')target.closePath();else if(op==='rect')target.rect(c[1],c[2],c[3],c[4]);
        else if(op==='quadratic')target.quadraticCurveTo(c[1],c[2],c[3],c[4]);else if(op==='cubic')target.bezierCurveTo(c[1],c[2],c[3],c[4],c[5],c[6]);
        else target.ellipse(c[1],c[2],c[3],c[4],c[5],c[6],c[7],!!c[8]);
    }
}
const overlays=new WeakMap(),layers=new WeakMap();
const capabilities=CAPABILITIES;   // Canvas draws the whole vocabulary

/** Canvas implementation of the packet contract. Contexts and Canvas/GPU-like handles stay private. */
export class canvasRenderer {
    #surface;#context;#viewport;#resources=new Map();#createSurface;#decodeImage;#createPath;#disposed=false;#generation=0;#pictures;#layer=null;#ask={};#lend=null;
    /** `pictures` is the pictureCache that picture packets are stamped from, or the options for a new one. */
    constructor({create_surface=createSurface,decode_image=decodeImage,create_path=()=>typeof Path2D==='undefined'?null:new Path2D(),pictures={}}={}){
        this.#createSurface=create_surface;this.#decodeImage=decode_image;this.#createPath=create_path;
        this.#pictures=pictures instanceof pictureCache?pictures:new pictureCache({create_surface,lend:id=>this.#resources.get(id),...pictures});
    }
    /** Migration boundary for hosts which already own a Canvas pass. Artists still supply only data. */
    static drawPackets(context,packets,{lend=null}={}){
        if(!context?.canvas||typeof context.getTransform!=='function')throw new TypeError('A host Canvas context is required');
        let entry=overlays.get(context);
        if(!entry){const renderer=new canvasRenderer();renderer.initialize(context.canvas,{viewport:{width:context.canvas.width,height:context.canvas.height,pixel_ratio:1}});entry={renderer,frame:new renderFrame()};overlays.set(context,entry);}
        const m=context.getTransform(),view={width:Math.max(1,context.canvas.width),height:Math.max(1,context.canvas.height),world_to_screen:[m.a,m.b,m.c,m.d,m.e,m.f]},opacity=context.globalAlpha;
        entry.frame.begin(view,{clear_color:false});entry.renderer.#lend=lend;
        try{for(const packet of packets){if(packet.resource_id||packet.geometry_id||packet.material_id||(packet.clips??[]).some(clip=>clip.geometry_id))throw new Error('Canvas overlay accepts inline packets; use renderSystem for resources');entry.frame.submit({...packet,opacity:(packet.opacity??1)*opacity});}entry.renderer.render(entry.frame.finish());}catch(error){entry.frame.abort();throw error;}
        return entry.frame.getStatistics().packets;
    }
    /**
     * Migration boundary, like drawPackets: draws `packets` into an off-screen layer the size of the
     * context's canvas (times `scale`, for a cheaper softer layer) under the context's current transform,
     * then lays that layer over the canvas at `opacity` with `blend`. The light layer is drawn this way.
     * An entry of `packets` may instead be `{picture: {key, bounds, build}, blend}`: a picture stamped from
     * `pictures` (a pictureCache) into the layer with `blend`, its own blends kept inside it (`layered`).
     */
    static drawLayer(context,packets,{opacity=1,blend='normal',scale=1,pictures}={}){
        if(!context?.canvas||typeof context.getTransform!=='function')throw new TypeError('A host Canvas context is required');
        if(!BLENDS.includes(blend))throw new TypeError('Unsupported blend');if(!(scale>0&&scale<=1))throw new TypeError('Layer scale is in (0, 1]');if(!(opacity>=0&&opacity<=1))throw new TypeError('Opacity must be in [0,1]');
        const canvas=context.canvas,w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
        let layer=layers.get(context);if(!layer){const surface=createSurface(w,h);layer={surface,context:surface.getContext('2d')};layers.set(context,layer);}
        if(layer.surface.width!==w)layer.surface.width=w;if(layer.surface.height!==h)layer.surface.height=h;
        const lc=layer.context,m=context.getTransform(),sx=w/canvas.width,sy=h/canvas.height;
        lc.setTransform(1,0,0,1,0,0);lc.globalAlpha=1;lc.globalCompositeOperation='source-over';lc.clearRect(0,0,w,h);
        lc.setTransform(m.a*sx,m.b*sy,m.c*sx,m.d*sy,m.e*sx,m.f*sy);
        const count=canvasRenderer.drawEntries(lc,packets,{pictures,layered:true});
        context.save();
        try{context.setTransform(1,0,0,1,0,0);context.globalAlpha=opacity;context.globalCompositeOperation=COMPOSITE[blend];context.imageSmoothingEnabled=true;context.drawImage(layer.surface,0,0,canvas.width,canvas.height);}
        finally{context.restore();}
        return count;
    }
    /**
     * Migration boundary, like drawPackets, for a run that mixes packets and pictures: each packet as
     * drawPackets draws it, each `{picture: {key, bounds, matrix, build}, blend, opacity, prepare}` entry
     * stamped from `pictures` (a pictureCache) in order, with `blend` at `opacity` (a `prepare` entry is only
     * painted ahead of need). `layered` paints each picture with its own base under its blends, as a light
     * layer's are; a picture marked `layered` itself is painted so wherever it is drawn. Returns how many packets and pictures were drawn.
     */
    static drawEntries(context,entries,{pictures,layered=false}={}){
        // the clip stays set while the entries after it carry the same clips array, so tiles of one strip share it
        let count=0,run=[],open=null;const close=()=>{if(open){context.restore();open=null;}},flush=()=>{if(run.length){close();count+=canvasRenderer.drawPackets(context,run);}run=[];};
        try{
            for(const entry of entries){
                if(!entry.picture){run.push(entry);continue;}
                flush();if(!pictures)throw new TypeError('Entries with pictures need a pictureCache');if(!BLENDS.includes(entry.blend??'normal'))throw new TypeError('Unsupported blend');
                const clips=!entry.prepare&&entry.clips?.length?entry.clips:null;
                if(clips!==open){close();if(clips){context.save();for(const clip of clips){buildPath(context,geometry(clip.geometry));context.clip(clip.geometry.fill_rule??'nonzero');}open=clips;}}
                const composite=context.globalCompositeOperation,alpha=context.globalAlpha;
                context.globalCompositeOperation=COMPOSITE[entry.blend??'normal'];context.globalAlpha=alpha*finiteOpacity(entry.opacity??1);
                try{pictures.draw(context,{...entry.picture,layered:layered||entry.picture.layered===true,stamp:!entry.prepare,blend:entry.blend??null},entry.picture.build);if(!entry.prepare)count++;}finally{context.globalCompositeOperation=composite;context.globalAlpha=alpha;}
            }
            flush();
        }finally{close();}
        return count;
    }
    get capabilities(){return capabilities;}
    /** One line of text's width, ascent and descent, as this backend draws it. */
    measureText(text,font={}){return measureText(text,font,{create_surface:this.#createSurface});}
    initialize(surface,{viewport}){
        if(this.#disposed||this.#context)throw new Error('Renderer cannot initialize twice');
        if(!surface||typeof surface.getContext!=='function')throw new TypeError('Canvas renderer requires a surface');
        const ctx=surface.getContext('2d');if(!ctx)throw new Error('Canvas 2D context unavailable');this.#surface=surface;this.#context=ctx;this.resize(viewport);
    }
    #live(){if(this.#disposed||!this.#context)throw new Error('Canvas renderer is not initialized');}
    getSurfaceBounds(){this.#live();const r=this.#surface.getBoundingClientRect?.();return Object.freeze(r?{left:r.left,top:r.top,width:r.width,height:r.height}:{left:0,top:0,width:this.#viewport.width,height:this.#viewport.height});}
    resize(viewport){
        this.#live();const w=Math.max(1,Math.round(viewport.width*viewport.pixel_ratio)),h=Math.max(1,Math.round(viewport.height*viewport.pixel_ratio));
        if(this.#surface.width!==w)this.#surface.width=w;if(this.#surface.height!==h)this.#surface.height=h;this.#viewport=viewport;
    }
    async registerResource(id,descriptor){
        this.#live();const generation=this.#generation;let entry={descriptor};
        try{
            if(descriptor.type==='image'){
                if(descriptor.url)entry.image=await this.#decodeImage(descriptor.url);
                else{
                    const surface=this.#createSurface(descriptor.width,descriptor.height);entry.surface=surface;const ctx=surface.getContext('2d');if(!ctx)throw new Error('Image surface unavailable');
                    const data=ctx.createImageData(descriptor.width,descriptor.height);data.data.set(descriptor.pixels);ctx.putImageData(data,0,0);entry.image=surface;
                }
            }else if(descriptor.type==='target'){
                entry.surface=this.#createSurface(descriptor.width,descriptor.height);entry.context=entry.surface.getContext('2d');if(!entry.context)throw new Error('Render target unavailable');entry.image=entry.surface;
            }else if(descriptor.type==='geometry'){
                entry.path=this.#createPath();if(entry.path)buildPath(entry.path,descriptor.geometry);
            }
            if(this.#disposed||generation!==this.#generation)throw new Error('Resource creation was cancelled');
            const old=this.#resources.get(id);this.#resources.set(id,entry);entry=null;if(old)this.#release(old);
        }finally{if(entry)this.#release(entry);}
    }
    #release(entry){entry.image?.close?.();if(entry.surface){entry.surface.width=0;entry.surface.height=0;}}
    releaseResource(id){const entry=this.#resources.get(id);if(!entry)return;this.#resources.delete(id);this.#release(entry);}
    #paint(ctx,paint){
        if(typeof paint==='string'||paint===null)return paint;
        if(paint.type==='pattern'){const source=this.#resources.get(paint.image)??this.#lend?.(paint.image);if(!source)return null;const pattern=ctx.createPattern(source.image,paint.repeat);if(paint.matrix){const [a,b,c,d,e,f]=paint.matrix;pattern.setTransform({a,b,c,d,e,f});}return pattern;}
        const gradient=paint.type==='linear'?ctx.createLinearGradient(...paint.from,...paint.to):ctx.createRadialGradient(...paint.from,paint.inner_radius,...paint.to,paint.outer_radius);
        for(const [offset,color]of paint.stops)gradient.addColorStop(offset,color);return gradient;
    }
    // What the context was last set to by #style, so a run of packets alike sets only what changes (setting
    // a canvas colour parses it every time). Cleared when anything else may have touched the context.
    #set={};
    #style(ctx,m,draw,sx,sy){
        const st=this.#set,set=(key,value)=>{if(st[key]!==value){ctx[key]=value;st[key]=value;}};
        set('globalAlpha',draw.opacity);set('globalCompositeOperation',COMPOSITE[draw.blend]);
        if(typeof m.fill==='object'&&m.fill!==null){ctx.fillStyle=this.#paint(ctx,m.fill);st.fillStyle=null;}else set('fillStyle',m.fill??'transparent');
        if(typeof m.stroke==='object'&&m.stroke!==null){ctx.strokeStyle=this.#paint(ctx,m.stroke);st.strokeStyle=null;}else set('strokeStyle',m.stroke??'transparent');
        set('lineWidth',m.stroke_width||1);set('lineCap',m.line_cap);set('lineJoin',m.line_join);
        const dash=m.dash.length?m.dash.join(','):'';if(st.dash!==dash){ctx.setLineDash(m.dash);st.dash=dash;}set('lineDashOffset',m.dash_offset);
        set('shadowColor',m.shadow?.color??'transparent');set('shadowBlur',(m.shadow?.blur??0)*Math.max(sx,sy));set('shadowOffsetX',(m.shadow?.offset[0]??0)*sx);set('shadowOffsetY',(m.shadow?.offset[1]??0)*sy);
        set('filter',m.blur&&m.blur_spread[0]===m.blur_spread[1]?`blur(${m.blur*Math.max(sx,sy)}px)`:'none');
    }
    #geometry(id,inline){return id?this.#resources.get(id):{descriptor:{geometry:inline},path:null};}
    #shape(ctx,entry,m){
        const g=entry.descriptor.geometry,rule=g.fill_rule??'nonzero';
        if(!entry.path)buildPath(ctx,g);
        if(m.fill!==null)entry.path?ctx.fill(entry.path,rule):ctx.fill(rule);
        if(m.stroke!==null&&m.stroke_width>0)entry.path?ctx.stroke(entry.path):ctx.stroke();
    }
    // A picture stamped from the cache under the packet's transform; inside a layer its own base comes with it.
    #picture(ctx,draw,layered){
        const st=this.#set,alpha=draw.opacity,composite=COMPOSITE[draw.blend];
        if(st.globalAlpha!==alpha){ctx.globalAlpha=alpha;st.globalAlpha=alpha;}if(st.globalCompositeOperation!==composite){ctx.globalCompositeOperation=composite;st.globalCompositeOperation=composite;}
        if(st.filter!=='none'){ctx.filter='none';st.filter='none';}if(st.shadowColor!=='transparent'){ctx.shadowColor='transparent';st.shadowColor='transparent';}   // a stamp is not blurred or shadowed by the packet before it
        const p=draw.picture,ask=this.#ask;ask.key=p.key;ask.bounds=p.bounds;ask.matrix=p.matrix;ask.source=p.source;ask.layered=layered||p.layered;ask.stamp=!draw.prepare;ask.blend=draw.blend;
        if(this.#pictures.draw(ctx,ask,draw.build)==='vector')this.#set={};   // the vector fallback drew packets of its own
    }
    #draw(ctx,draw,view,sx,sy,layered=false){
        const clipped=draw.clips.length>0;   // only a clip needs the context saved: everything else is set for each packet
        if(clipped){ctx.save();this.#set={};}
        try{
            const m=draw.space==='world'?view.world_to_screen:[1,0,0,1,0,0];ctx.setTransform(m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy);ctx.transform(...draw.transform);
            for(const clip of draw.clips){ctx.transform(...clip.transform);const entry=this.#geometry(clip.geometry_id,clip.geometry);if(entry.path)ctx.clip(entry.path,clip.rule);else{buildPath(ctx,entry.descriptor.geometry);ctx.clip(clip.rule);}ctx.transform(...clip.inverse);}
            if(draw.type==='picture'){this.#picture(ctx,draw,layered);return;}
            const material=draw.material_id?this.#resources.get(draw.material_id).descriptor.material:draw.material;
            if(material.blur&&material.blur_spread[0]!==material.blur_spread[1]){this.#streak(ctx,draw,material,sx,sy);return;}
            this.#style(ctx,material,draw,sx,sy);this.#paint2d(ctx,draw,material);
        }finally{if(clipped){ctx.restore();this.#set={};}}
    }
    // What a packet draws, with the context already placed and styled.
    #paint2d(ctx,draw,material){
            if(draw.type==='shape')this.#shape(ctx,this.#geometry(draw.geometry_id,draw.geometry),material);
            else if(draw.type==='sprite'){
                const image=this.#resources.get(draw.resource_id).image,[w,h]=draw.size;
                if(draw.source)ctx.drawImage(image,...draw.source,-w*draw.origin[0],-h*draw.origin[1],w,h);else ctx.drawImage(image,-w*draw.origin[0],-h*draw.origin[1],w,h);
            }else{
                const f=draw.font;ctx.font=`${f.style} ${f.weight} ${f.size}px ${f.family}`;ctx.textAlign=draw.align;ctx.textBaseline=draw.baseline;if(f.letter_spacing&&'letterSpacing' in ctx)ctx.letterSpacing=`${f.letter_spacing}px`;
                if(material.fill!==null)ctx.fillText(draw.text,0,0);if(material.stroke!==null&&material.stroke_width>0)ctx.strokeText(draw.text,0,0);
                if(f.letter_spacing&&'letterSpacing' in ctx)ctx.letterSpacing='0px';
            }
    }
    /**
     * A directional blur, which Canvas's blur filter cannot spread: the packet is drawn sharp on a scratch surface
     * around it (smaller when the blur is wide), stamped along its angle and then across it with Gaussian weights
     * (the sum the WebGL backend's passes take), then laid on the context under its clips, blend and shadow.
     */
    #streak(ctx,draw,m,sx,sy){
        const T=ctx.getTransform(),M=[T.a,T.b,T.c,T.d,T.e,T.f],k=Math.max(sx,sy),[along,across]=m.blur_spread.map(v=>v*k),sigma=Math.max(along,across),pad=Math.ceil(3*sigma)+2;
        const ox=m.shadow?m.shadow.offset[0]*sx:0,oy=m.shadow?m.shadow.offset[1]*sy:0,box=this.#extent(draw,m,M);if(!box)return;
        const x0=Math.floor(Math.max(box[0]-pad,-pad-Math.abs(ox))),y0=Math.floor(Math.max(box[1]-pad,-pad-Math.abs(oy))),x1=Math.ceil(Math.min(box[2]+pad,ctx.canvas.width+pad+Math.abs(ox))),y1=Math.ceil(Math.min(box[3]+pad,ctx.canvas.height+pad+Math.abs(oy)));
        if(!(x1>x0&&y1>y0))return;
        const s=Math.min(1,sigma>8?8/sigma:1,2048/(x1-x0),2048/(y1-y0)),w=Math.ceil((x1-x0)*s),h=Math.ceil((y1-y0)*s),[a,b]=this.#scratchFor(w,h);
        const fresh=c=>{c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.shadowColor='transparent';c.shadowBlur=0;c.clearRect(0,0,w,h);};
        fresh(a.context);a.context.setTransform(s*M[0],s*M[1],s*M[2],s*M[3],s*(M[4]-x0),s*(M[5]-y0));
        this.#set={};try{this.#style(a.context,{...m,blur:0,shadow:null},{opacity:1,blend:'normal'},sx,sy);this.#paint2d(a.context,draw,m);}finally{this.#set={};}
        const t=m.blur_angle,dx=M[0]*Math.cos(t)+M[2]*Math.sin(t),dy=M[1]*Math.cos(t)+M[3]*Math.sin(t),l=Math.hypot(dx,dy)||1,ux=dx/l,uy=dy/l;
        const stamp=(from,into,vx,vy,sig)=>{
            const c=into.context;fresh(c);if(sig<=.05){c.drawImage(from.surface,0,0,w,h,0,0,w,h);return;}
            const r=Math.ceil(sig*3),weights=[];let total=0;for(let i=-r;i<=r;i++){const v=Math.exp(-i*i/(2*sig*sig));weights.push(v);total+=v;}
            c.globalCompositeOperation='lighter';for(let i=-r;i<=r;i++){c.globalAlpha=weights[i+r]/total;c.drawImage(from.surface,0,0,w,h,i*vx,i*vy,w,h);}
        };
        stamp(a,b,ux,uy,along*s);stamp(b,a,-uy,ux,across*s);
        ctx.save();
        try{
            ctx.setTransform(1/s,0,0,1/s,x0,y0);ctx.globalAlpha=draw.opacity;ctx.globalCompositeOperation=COMPOSITE[draw.blend];ctx.filter='none';
            if(m.shadow){ctx.shadowColor=m.shadow.color;ctx.shadowBlur=m.shadow.blur*k;ctx.shadowOffsetX=ox;ctx.shadowOffsetY=oy;}else ctx.shadowColor='transparent';
            ctx.imageSmoothingEnabled=true;ctx.drawImage(a.surface,0,0,w,h,0,0,w,h);
        }finally{ctx.restore();this.#set={};}
    }
    // Where a packet draws under the matrix M: [left, top, right, bottom] in the surface's pixels, or null.
    #extent(draw,m,M){
        let local;
        if(draw.type==='shape'){const pad=m.stroke!==null&&m.stroke_width>0?m.stroke_width*(m.line_join==='miter'?5:1):0;local=pathBounds(flattenGeometry(this.#geometry(draw.geometry_id,draw.geometry).descriptor.geometry,1),pad+1);}
        else if(draw.type==='sprite'){const [w,h]=draw.size,x0=-w*draw.origin[0],y0=-h*draw.origin[1];local=[x0,y0,x0+w,y0+h];}
        else{const f=draw.font,size=measureText(draw.text,f,{create_surface:this.#createSurface}),x=draw.align==='center'?-size.width/2:draw.align==='right'?-size.width:0;local=[x-f.size,-f.size*1.5,x+size.width+f.size,f.size*1.5];}
        if(!local)return null;let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
        for(const [x,y] of [[local[0],local[1]],[local[2],local[1]],[local[0],local[3]],[local[2],local[3]]]){const px=M[0]*x+M[2]*y+M[4],py=M[1]*x+M[3]*y+M[5];if(px<l)l=px;if(px>r)r=px;if(py<t)t=py;if(py>b)b=py;}
        return [l,t,r,b];
    }
    #scratch=null;
    // Two scratch surfaces at least w by h, grown in steps of 256 and kept.
    #scratchFor(w,h){
        const sc=this.#scratch;if(sc&&sc[0].surface.width>=w&&sc[0].surface.height>=h)return sc;
        const W=Math.ceil(Math.max(w,sc?.[0].surface.width??0)/256)*256,H=Math.ceil(Math.max(h,sc?.[0].surface.height??0)/256)*256;
        this.#scratch=[0,1].map(()=>{const surface=this.#createSurface(W,H),context=surface.getContext('2d');if(!context)throw new Error('Scratch surface unavailable');return {surface,context};});return this.#scratch;
    }
    render(frame){
        this.#live();
        if(frame.format_version!==1)throw new TypeError('Unsupported render frame version');
        this.#pictures.beginFrame();
        const main={surface:this.#surface,context:this.#context},find=id=>id===null?main:this.#resources.get(id);
        for(const pass of frame.passes){
            const layer=pass.layer,into=layer?find(layer.into):null,target=layer?this.#layerOver(into.surface,layer.scale):find(pass.target_id),ctx=target.context;
            const sx=target.surface.width/pass.viewport.width,sy=target.surface.height/pass.viewport.height;
            ctx.save();this.#set={};
            try{
                if(pass.clear_color!==false||layer){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.filter='none';ctx.clearRect(0,0,target.surface.width,target.surface.height);if(pass.clear_color!==false){ctx.fillStyle=pass.clear_color;ctx.fillRect(0,0,target.surface.width,target.surface.height);}}
                for(const draw of pass.packets)this.#draw(ctx,draw,frame.view,sx,sy,!!layer);
            }finally{ctx.restore();this.#set={};}
            if(layer){
                if(layer.effects.length)this.#applyEffects(target,layer.effects,sx);
                const out=into.context;out.save();
                try{out.setTransform(1,0,0,1,0,0);out.globalAlpha=layer.opacity;out.globalCompositeOperation=COMPOSITE[layer.blend];out.shadowColor='transparent';out.shadowBlur=0;out.filter='none';out.imageSmoothingEnabled=true;out.drawImage(target.surface,0,0,into.surface.width,into.surface.height);}
                finally{out.restore();}
            }
        }
        if(frame.effects?.length)this.#applyEffects(main,frame.effects,main.surface.width/frame.view.width,opaqueFrame(frame));
        this.#frames++;
    }
    #frames=0;#copy=null;#grain=null;#glows=new Map();
    // Kept surfaces for the light effects, by name; each is resized as needed.
    #glowSurface(key,w,h){
        let s=this.#glows.get(key);if(!s){const surface=this.#createSurface(w,h);s={surface,context:surface.getContext('2d')};this.#glows.set(key,s);}
        if(s.surface.width!==w)s.surface.width=w;if(s.surface.height!==h)s.surface.height=h;
        const c=s.context;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.shadowColor='transparent';c.shadowBlur=0;c.imageSmoothingEnabled=true;c.clearRect(0,0,w,h);return s;
    }
    // `surface` out of focus as bokehPlan says (see effects.mjs): drawn small, then laid back over the whole of it.
    #bokeh(surface,ctx,e,sx){
        const W=surface.width,H=surface.height,plan=bokehPlan(e,sx),sizes=glowSizes(W,H,plan.level),[w,h]=sizes[plan.level];let from=surface,lit=null;
        for(let l=1;l<=plan.level;l++){
            const [lw,lh]=sizes[l],s=this.#glowSurface(`level${l}`,lw,lh),b=this.#glowSurface(`bokeh_bright${l}`,lw,lh);s.context.drawImage(from,0,0,lw,lh);
            if(l===1){b.context.filter=thresholdFilter(plan.threshold);b.context.drawImage(surface,0,0,lw,lh);b.context.filter='none';}else b.context.drawImage(lit,0,0,lw,lh);
            from=s.surface;lit=b.surface;
        }
        const rest=this.#glowSurface('bokeh_rest',w,h),rc=rest.context;rc.drawImage(from,0,0);rc.globalCompositeOperation='difference';rc.globalAlpha=1-plan.threshold;rc.drawImage(lit,0,0);
        // the rest, halved `soft` times, repeats its edge pixels outward before blurring, so the picture does not darken at its borders
        let kept=rest.surface;const more=glowSizes(w,h,plan.soft);for(let i=1;i<=plan.soft;i++){const [lw,lh]=more[i],s=this.#glowSurface(`bokeh_rest${i}`,lw,lh);s.context.drawImage(kept,0,0,lw,lh);kept=s.surface;}
        const [bw,bh]=more[plan.soft],p=Math.ceil(plan.sigma*3)+1,padded=this.#glowSurface('bokeh_pad',bw+2*p,bh+2*p),pc=padded.context;pc.imageSmoothingEnabled=false;pc.drawImage(kept,p,p);
        for(const [sx0,sy0,sw,sh,dx,dy,dw,dh] of [[0,0,1,bh,0,p,p,bh],[bw-1,0,1,bh,bw+p,p,p,bh],[0,0,bw,1,p,0,bw,p],[0,bh-1,bw,1,p,bh+p,bw,p],[0,0,1,1,0,0,p,p],[bw-1,0,1,1,bw+p,0,p,p],[0,bh-1,1,1,0,bh+p,p,p],[bw-1,bh-1,1,1,bw+p,bh+p,p,p]])pc.drawImage(kept,sx0,sy0,sw,sh,dx,dy,dw,dh);
        const soft=this.#glowSurface('bokeh_soft',bw+2*p,bh+2*p);soft.context.filter=`blur(${plan.sigma}px)`;soft.context.drawImage(padded.surface,0,0);soft.context.filter='none';
        const base=this.#glowSurface('bokeh_base',bw,bh);base.context.drawImage(soft.surface,p,p,bw,bh,0,0,bw,bh);
        // the lights grown along each side: each step keeps the brighter of the image and a copy moved whole pixels
        const a=this.#glowSurface('bokeh_a',w,h),b=this.#glowSurface('bokeh_b',w,h);let disc=lit;
        for(const [dx,dy] of plan.steps){const out=disc===a.surface?b:a,c=out.context;c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,w,h);
            c.drawImage(disc,0,0);c.globalCompositeOperation='lighten';c.drawImage(disc,dx,dy);disc=out.surface;}
        const sum=this.#glowSurface('bokeh_sum',w,h),c=sum.context;c.drawImage(base.surface,0,0,w,h);c.globalCompositeOperation='lighter';
        for(let k=plan.highlights;k>1e-4;k-=1){c.globalAlpha=Math.min(1,k);c.drawImage(disc,...plan.centre);}
        ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.imageSmoothingEnabled=true;ctx.drawImage(sum.surface,0,0,W,H);ctx.globalCompositeOperation='source-over';
    }
    // The bright part of `surface` spread as glowPlan says, added to it (see effects.mjs).
    #glow(surface,ctx,e,sx,opaque){
        const W=surface.width,H=surface.height,plan=glowPlan(e,sx),sizes=glowSizes(W,H,plan.levels),levels=[null],[r,g,b]=readColor(plan.color),tinted=r<1||g<1||b<1;
        for(let l=1;l<=plan.levels;l++){
            const [w,h]=sizes[l],s=this.#glowSurface(`level${l}`,w,h),c=s.context;
            if(l===1){c.filter=thresholdFilter(plan.threshold);c.drawImage(surface,0,0,w,h);c.filter='none';
                if(tinted){const shape=opaque?null:this.#glowSurface('shape',w,h);if(shape)shape.context.drawImage(s.surface,0,0);
                    c.globalCompositeOperation='multiply';c.fillStyle=`rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;c.fillRect(0,0,w,h);if(shape){c.globalCompositeOperation='destination-in';c.drawImage(shape.surface,0,0);}c.globalCompositeOperation='source-over';}}
            else c.drawImage(levels[l-1].surface,0,0,w,h);
            levels.push(s);
        }
        const spreads=plan.spreads.map((sp,i)=>{
            const [w,h]=sizes[sp.level],from=levels[sp.level].surface,o=this.#glowSurface(`spread${i}`,w,h),c=o.context;
            if(!sp.dir){c.filter=`blur(${sp.sigma}px)`;c.drawImage(from,0,0);c.filter='none';}
            else{const n=Math.ceil(sp.sigma*3),weights=steps255(n,sp.sigma);
                c.globalCompositeOperation='lighter';for(let k=-n;k<=n;k++)if(weights[k+n]){c.globalAlpha=weights[k+n]/255;c.drawImage(from,k*sp.dir[0],k*sp.dir[1]);}}
            return [o.surface,sp.weight];
        });
        const [sw,sh]=sizes[plan.sum],sum=this.#glowSurface('sum',sw,sh),c=sum.context;c.globalCompositeOperation='lighter';
        for(const [o,weight] of spreads)for(let k=plan.strength*weight;k>1e-4;k-=1){c.globalAlpha=Math.min(1,k);c.drawImage(o,0,0,sw,sh);}
        ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='lighter';ctx.imageSmoothingEnabled=true;ctx.globalAlpha=1;ctx.drawImage(sum.surface,0,0,W,H);
    }
    // A copy of a surface's pixels, on a kept surface the same size.
    #copyOf(surface){
        if(!this.#copy){const s=this.#createSurface(surface.width,surface.height);this.#copy={surface:s,context:s.getContext('2d')};}
        const c=this.#copy;if(c.surface.width!==surface.width)c.surface.width=surface.width;if(c.surface.height!==surface.height)c.surface.height=surface.height;
        c.context.setTransform(1,0,0,1,0,0);c.context.globalAlpha=1;c.context.globalCompositeOperation='copy';c.context.filter='none';c.context.drawImage(surface,0,0);return c.surface;
    }
    /** A surface's image changed in place by each effect in turn (see effects.mjs); `sx` is its pixels per pass unit. */
    #applyEffects({surface,context:ctx},stack,sx,opaque=false){
        const W=surface.width,H=surface.height;
        ctx.save();
        try{
            for(const e of stack){
                ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.imageSmoothingEnabled=true;
                if(e.type==='grade'){
                    const filter=[e.exposure?`brightness(${2**e.exposure})`:'',e.contrast!==1?`contrast(${e.contrast})`:'',e.saturation!==1?`saturate(${e.saturation})`:''].filter(Boolean).join(' ');
                    if(filter){ctx.globalCompositeOperation='copy';ctx.filter=filter;ctx.drawImage(this.#copyOf(surface),0,0);ctx.filter='none';}
                    if(e.tint_amount>0){const shape=opaque?null:this.#copyOf(surface);ctx.globalCompositeOperation='multiply';ctx.globalAlpha=e.tint_amount;ctx.fillStyle=e.tint;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;if(shape){ctx.globalCompositeOperation='destination-in';ctx.drawImage(shape,0,0);}}
                }else if(e.type==='vignette'){
                    const reach=Math.hypot(W,H)/2,[r,g,b,a]=readColor(e.color),paint=k=>`rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a*k})`,ring=ctx.createRadialGradient(W/2,H/2,e.radius*reach,W/2,H/2,(e.radius+e.softness)*reach);
                    ring.addColorStop(0,paint(0));ring.addColorStop(1,paint(e.strength));ctx.fillStyle=ring;ctx.fillRect(0,0,W,H);
                }else if(e.type==='grain'){
                    if(!this.#grain){const s=this.#createSurface(GRAIN_SIZE,GRAIN_SIZE),c=s.getContext('2d'),data=c.createImageData(GRAIN_SIZE,GRAIN_SIZE);data.data.set(grainPixels());c.putImageData(data,0,0);this.#grain=s;}
                    const shape=opaque?null:this.#copyOf(surface),size=e.size*sx,[ox,oy]=grainOffset(this.#frames,e.animated),pattern=ctx.createPattern(this.#grain,'repeat');
                    ctx.imageSmoothingEnabled=false;ctx.globalCompositeOperation='overlay';ctx.globalAlpha=e.amount;ctx.fillStyle=pattern;
                    ctx.setTransform(size,0,0,size,-ox*size,-oy*size);ctx.fillRect(ox,oy,W/size,H/size);
                    if(shape){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(shape,0,0);}
                }else if(GLOWS.includes(e.type))this.#glow(surface,ctx,e,sx,opaque);
                else if(e.type==='bokeh')this.#bokeh(surface,ctx,e,sx);
            }
        }finally{ctx.restore();this.#set={};}
    }
    // One off-screen surface serves every layer pass in turn: each is laid over its pass before the next begins.
    #layerOver(base,scale){
        const w=Math.max(1,Math.round(base.width*scale)),h=Math.max(1,Math.round(base.height*scale));
        if(!this.#layer){const surface=this.#createSurface(w,h),context=surface.getContext('2d');if(!context)throw new Error('Layer surface unavailable');this.#layer={surface,context};}
        if(this.#layer.surface.width!==w)this.#layer.surface.width=w;if(this.#layer.surface.height!==h)this.#layer.surface.height=h;return this.#layer;
    }
    dispose(){if(this.#disposed)return;this.#disposed=true;this.#generation++;for(const entry of this.#resources.values())this.#release(entry);this.#resources.clear();this.#pictures.clear();if(this.#layer)this.#release(this.#layer);this.#layer=null;this.#scratch=null;this.#glows.clear();this.#copy=null;this.#context=null;this.#surface=null;}
}

// A Gaussian's 2n+1 weights in 255ths summing to exactly 255: Canvas keeps an opacity in 255ths, so weights
// rounded one by one would add up to more or less than the whole and brighten or dim a streak.
function steps255(n,sigma){
    const raw=[];let total=0;for(let k=-n;k<=n;k++){const v=Math.exp(-k*k/(2*sigma*sigma));raw.push(v);total+=v;}
    const exact=raw.map(v=>v/total*255),out=exact.map(Math.floor);let left=255-out.reduce((a,b)=>a+b,0);
    for(const i of exact.map((v,i)=>[v-Math.floor(v),i]).sort((a,b)=>b[0]-a[0]).map(([,i])=>i)){if(left<=0)break;out[i]++;left--;}
    return out;
}
// Whether a frame's screen ends fully opaque: cleared to an opaque colour first, and nothing drawn on it cuts
// holes. Then effects need not keep its shape, which saves two copies of the screen each.
const CUTS=new Set(['source-in','source-out','destination-in','destination-out']);
function opaqueFrame(frame){
    const first=frame.passes.find(p=>p.target_id===null&&!p.layer);if(!first||first.clear_color===false||readColor(first.clear_color)[3]<1)return false;
    for(const pass of frame.passes){if(pass.layer){if(pass.layer.into===null&&CUTS.has(pass.layer.blend))return false;continue;}if(pass.target_id===null)for(const d of pass.packets)if(CUTS.has(d.blend))return false;}
    return true;
}

let measurer=null;
/** Canvas's measuring, behind canvasRenderer.measureText. The width and the ascent/descent above and below the baseline of one line of text in `font`
 *  {family, size, weight, style, letter_spacing}, as the Canvas backend would draw it. */
function measureText(text,font={},{create_surface=createSurface}={}){
    measurer??=create_surface(1,1).getContext('2d');
    measurer.font=`${font.style??'normal'} ${font.weight??400} ${font.size??16}px ${font.family??'sans-serif'}`;
    const m=measurer.measureText(String(text));
    return Object.freeze({width:m.width+(font.letter_spacing??0)*[...String(text)].length,ascent:m.actualBoundingBoxAscent??0,descent:m.actualBoundingBoxDescent??0});
}

const finiteOpacity=v=>{if(!(v>=0&&v<=1))throw new TypeError('A picture entry\'s opacity is in [0, 1]');return v;};
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
/**
 * Pictures painted once and stamped every frame: a migration boundary like drawPackets, for hosts that
 * own a Canvas pass. `draw(context, {key, bounds, matrix}, build)` stamps the picture `key` (the packets
 * `build()` returns, in local units inside `bounds` [x, y, w, h]) under the context's transform times
 * `matrix`. A picture is painted at the first of `densities` (device pixels per local unit) at or above
 * what the view needs, so it stays sharp as the view zooms; past the last it draws as vector. Painting
 * spends at most `budget_ms` a frame (`beginFrame()`); a picture waiting its turn draws as vector (a tile, given
 * a `source`, is painted at once instead: as vector it would draw the whole picture), as
 * does one with a blend other than normal (a picture's own blend has nothing under it to work on).
 * The least recently stamped pictures go first when `max_bytes` would be passed. The key must name
 * everything the picture shows: the cache never looks inside `build`. A `layered` picture paints its own
 * base first, so its blends work on that and it is cached too (a light layer's dark with its cuts).
 */
export class pictureCache{
    #entries=new Map();#bytes=0;#spent=0;#max_bytes;#budget_ms;#densities;#create_surface;#now;#lend;
    constructor({max_bytes=48*1048576,budget_ms=3,densities=[1,1.5,2,3,4],create_surface=createSurface,now=()=>performance.now(),lend=null}={}){
        this.#lend=lend;   // a renderer's images, for patterns inside a picture
        if(!(max_bytes>0)||!(budget_ms>=0))throw new TypeError('A picture cache needs a memory budget and a time budget');
        if(!Array.isArray(densities)||!densities.length||densities.some((d,i)=>!(d>0)||(i&&d<=densities[i-1])))throw new TypeError('Densities must rise');
        this.#max_bytes=max_bytes;this.#budget_ms=budget_ms;this.#densities=[...densities];this.#create_surface=create_surface;this.#now=now;
    }
    /** A fresh painting budget, once a frame. */
    beginFrame(){this.#spent=0;}
    get statistics(){return Object.freeze({pictures:[...this.#entries.values()].filter(e=>e.surface).length,bytes:this.#bytes});}
    /**
     * Draws the picture; returns how: 'stamp' (from the cache), 'paint' (painted now, then stamped) or 'vector'.
     * With `stamp: false` it only paints the picture ahead of need, if the frame's budget allows ('paint'),
     * and draws nothing ('kept' when it is already painted, 'later' when the budget is spent).
     * `blend` is the blend the picture is stamped with (the context's composite, set by the caller): drawn
     * as vector, its normal packets take it, so the fallback looks the same as the stamp.
     */
    draw(context,{key,bounds,matrix=[1,0,0,1,0,0],source=null,layered=false,stamp=true,blend=null},build){
        if(!context?.canvas||typeof context.getTransform!=='function')throw new TypeError('A host Canvas context is required');
        if(typeof key!=='string'||!key)throw new TypeError('A picture needs a key');
        const [bx,by,bw,bh]=bounds;if(![bx,by,bw,bh].every(Number.isFinite)||!(bw>0&&bh>0))throw new TypeError('A picture needs finite bounds');
        const t=context.getTransform(),m=multiply([t.a,t.b,t.c,t.d,t.e,t.f],matrix),scale=Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]));
        const density=this.#densities.find(d=>d>=scale-1e-9);
        const [rx,ry,rw,rh]=source??bounds;if(source&&![rx,ry,rw,rh].every(Number.isFinite))throw new TypeError('A picture source is a finite rect');
        const vector=packets=>{packets??=build();if(blend)packets=packets.map(p=>(p.blend??'normal')==='normal'?{...p,blend}:p);context.save();try{context.transform(...matrix);context.beginPath();context.rect(rx,ry,rw,rh);context.clip();canvasRenderer.drawPackets(context,packets,{lend:this.#lend});}finally{context.restore();}return 'vector';};   // a picture is only its bounds, painted or not
        if(density===undefined||this.#entries.get(key)?.vector)return stamp?vector():'later';
        const id=`${key}@${density}`;let entry=this.#entries.get(id),how='stamp';
        if(!stamp&&entry){this.#entries.delete(id);this.#entries.set(id,entry);return 'kept';}
        if(!entry){
            if(this.#spent>=this.#budget_ms&&!(stamp&&source))return stamp?vector():'later';   // a tile waits for nothing: as vector it would draw the whole picture, clipped, which costs more than painting it
            const t0=this.#now(),packets=build();
            if(!layered&&packets.some(p=>(p.blend??'normal')!=='normal')){this.#entries.set(key,{vector:true,bytes:0});return stamp?vector(packets):'later';}
            const W=Math.ceil(bw*density),H=Math.ceil(bh*density),bytes=W*H*4;
            if(bytes>this.#max_bytes)return stamp?vector(packets):'later';
            this.#evict(bytes);
            const surface=this.#create_surface(W,H),ctx=surface.getContext('2d');if(!ctx)throw new Error('Picture surface unavailable');
            ctx.setTransform(W/bw,0,0,H/bh,-bx*W/bw,-by*H/bh);canvasRenderer.drawPackets(ctx,packets,{lend:this.#lend});
            entry={surface,bytes};this.#bytes+=bytes;this.#spent+=this.#now()-t0;how='paint';
        }else this.#entries.delete(id);
        this.#entries.set(id,entry);
        if(!stamp)return how;
        context.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);   // the stamp changes only the transform, so put it back rather than save the whole state
        try{
            if(!source)context.drawImage(entry.surface,bx,by,bw,bh);
            else{const sx=entry.surface.width/bw,sy=entry.surface.height/bh,x0=Math.max(rx,bx),y0=Math.max(ry,by),x1=Math.min(rx+rw,bx+bw),y1=Math.min(ry+rh,by+bh);if(x1>x0&&y1>y0)context.drawImage(entry.surface,(x0-bx)*sx,(y0-by)*sy,(x1-x0)*sx,(y1-y0)*sy,x0,y0,x1-x0,y1-y0);}
        }finally{context.setTransform(t);}
        return how;
    }
    #evict(bytes){for(const [id,entry]of this.#entries){if(this.#bytes+bytes<=this.#max_bytes)break;if(entry.surface){this.#free(entry);this.#entries.delete(id);}}}
    #free(entry){this.#bytes-=entry.bytes;entry.surface.width=0;entry.surface.height=0;}
    /** Lets go of every picture whose key starts with `prefix` (all of them without one). */
    release(prefix=''){for(const [id,entry]of [...this.#entries])if(id.startsWith(prefix)){if(entry.surface)this.#free(entry);this.#entries.delete(id);}}
    clear(){this.release();}
}

/**
 * Canvas's text drawing for backends that have none (WebGL draws text as a picture of it). One line of
 * `text` in `font`, aligned on its origin by `align` and `baseline`, painted with `material` (colour or
 * gradient fill and stroke, in local units) at `scale` device pixels per local unit. Returns
 * `{surface, x, y, width, height}`: a surface holding the line and the local box it covers, or null
 * when nothing would show. The caller uploads the surface and lets it go (`surface.width = 0`).
 */
export function rasterizeCanvasText(text,font,{align='left',baseline='alphabetic',material},scale,{create_surface=createSurface,max_size=4096}={}){
    const fontText=`${font.style??'normal'} ${font.weight??400} ${font.size??16}px ${font.family??'sans-serif'}`,spacing=font.letter_spacing??0;
    measurer??=create_surface(1,1).getContext('2d');
    const setup=ctx=>{ctx.font=fontText;ctx.textAlign=align;ctx.textBaseline=baseline;if('letterSpacing' in ctx)ctx.letterSpacing=`${spacing}px`;};
    setup(measurer);const m=measurer.measureText(String(text));if('letterSpacing' in measurer)measurer.letterSpacing='0px';
    const stroked=material.stroke!==null&&material.stroke_width>0,pad=(stroked?material.stroke_width:0)+2;
    const x=-(m.actualBoundingBoxLeft??0)-pad,y=-(m.actualBoundingBoxAscent??font.size??16)-pad,width=(m.actualBoundingBoxLeft??0)+(m.actualBoundingBoxRight??m.width)+pad*2,height=(m.actualBoundingBoxAscent??0)+(m.actualBoundingBoxDescent??0)+pad*2;
    if(!(width>0&&height>0))return null;
    scale=Math.min(scale,max_size/width,max_size/height);
    const W=Math.max(1,Math.ceil(width*scale)),H=Math.max(1,Math.ceil(height*scale)),surface=create_surface(W,H),ctx=surface.getContext('2d');if(!ctx)throw new Error('Text surface unavailable');
    ctx.setTransform(W/width,0,0,H/height,-x*W/width,-y*H/height);setup(ctx);
    const paint=p=>{if(typeof p==='string')return p;if(p.type==='pattern')throw new Error('Text cannot be filled with a pattern in this backend');const g=p.type==='linear'?ctx.createLinearGradient(...p.from,...p.to):ctx.createRadialGradient(...p.from,p.inner_radius,...p.to,p.outer_radius);for(const [offset,color]of p.stops)g.addColorStop(offset,color);return g;};
    if(material.fill!==null){ctx.fillStyle=paint(material.fill);ctx.fillText(String(text),0,0);}
    if(stroked){ctx.strokeStyle=paint(material.stroke);ctx.lineWidth=material.stroke_width;ctx.lineCap=material.line_cap;ctx.lineJoin=material.line_join;ctx.setLineDash(material.dash);ctx.lineDashOffset=material.dash_offset;ctx.strokeText(String(text),0,0);}
    return {surface,x,y,width,height};
}
/** Canvas's text measuring, for backends that have none: the same numbers as canvasRenderer.measureText. */
export function measureCanvasText(text,font={},options={}){return measureText(text,font,options);}
