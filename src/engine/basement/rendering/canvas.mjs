// ===== LV0 BASEMENT =====
import {renderFrame} from './frame.mjs';
import {BLENDS} from './values.mjs';

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
    else for(const command of g.commands){
        const [op,...v]=command;
        if(op==='move')target.moveTo(...v);else if(op==='line')target.lineTo(...v);else if(op==='quadratic')target.quadraticCurveTo(...v);else if(op==='cubic')target.bezierCurveTo(...v);else if(op==='ellipse')target.ellipse(...v.slice(0,7),!!v[7]);else target.closePath();
    }
}
const overlays=new WeakMap(),layers=new WeakMap();
const capabilities=Object.freeze(['shape','sprite','text','geometry:rect','geometry:ellipse','geometry:path','gradient:linear','gradient:radial','clip','shadow','dash','target',...Object.keys(BLENDS).map(name=>`blend:${name}`)]);

/** Canvas implementation of the packet contract. Contexts and Canvas/GPU-like handles stay private. */
export class canvasRenderer {
    #surface;#context;#viewport;#resources=new Map();#createSurface;#decodeImage;#createPath;#disposed=false;#generation=0;
    constructor({create_surface=createSurface,decode_image=decodeImage,create_path=()=>typeof Path2D==='undefined'?null:new Path2D()}={}){this.#createSurface=create_surface;this.#decodeImage=decode_image;this.#createPath=create_path;}
    /** Migration boundary for hosts which already own a Canvas pass. Artists still supply only data. */
    static drawPackets(context,packets){
        if(!context?.canvas||typeof context.getTransform!=='function')throw new TypeError('A host Canvas context is required');
        let entry=overlays.get(context);
        if(!entry){const renderer=new canvasRenderer();renderer.initialize(context.canvas,{viewport:{width:context.canvas.width,height:context.canvas.height,pixel_ratio:1}});entry={renderer,frame:new renderFrame()};overlays.set(context,entry);}
        const m=context.getTransform(),view={width:Math.max(1,context.canvas.width),height:Math.max(1,context.canvas.height),world_to_screen:[m.a,m.b,m.c,m.d,m.e,m.f]},opacity=context.globalAlpha;
        entry.frame.begin(view,{clear_color:false});
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
        if(!Object.hasOwn(BLENDS,blend))throw new TypeError('Unsupported blend');if(!(scale>0&&scale<=1))throw new TypeError('Layer scale is in (0, 1]');if(!(opacity>=0&&opacity<=1))throw new TypeError('Opacity must be in [0,1]');
        const canvas=context.canvas,w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
        let layer=layers.get(context);if(!layer){const surface=createSurface(w,h);layer={surface,context:surface.getContext('2d')};layers.set(context,layer);}
        if(layer.surface.width!==w)layer.surface.width=w;if(layer.surface.height!==h)layer.surface.height=h;
        const lc=layer.context,m=context.getTransform(),sx=w/canvas.width,sy=h/canvas.height;
        lc.setTransform(1,0,0,1,0,0);lc.globalAlpha=1;lc.globalCompositeOperation='source-over';lc.clearRect(0,0,w,h);
        lc.setTransform(m.a*sx,m.b*sy,m.c*sx,m.d*sy,m.e*sx,m.f*sy);
        let count=0,run=[];const flush=()=>{if(run.length)count+=canvasRenderer.drawPackets(lc,run);run=[];};
        for(const entry of packets){
            if(!entry.picture){run.push(entry);continue;}
            flush();if(!pictures)throw new TypeError('A layer with pictures needs a pictureCache');if(!Object.hasOwn(BLENDS,entry.blend??'normal'))throw new TypeError('Unsupported blend');
            lc.globalCompositeOperation=BLENDS[entry.blend??'normal'];
            try{pictures.draw(lc,{...entry.picture,layered:true,stamp:!entry.prepare},entry.picture.build);if(!entry.prepare)count++;}finally{lc.globalCompositeOperation='source-over';}
        }
        flush();
        context.save();
        try{context.setTransform(1,0,0,1,0,0);context.globalAlpha=opacity;context.globalCompositeOperation=BLENDS[blend];context.imageSmoothingEnabled=true;context.drawImage(layer.surface,0,0,canvas.width,canvas.height);}
        finally{context.restore();}
        return count;
    }
    get capabilities(){return capabilities;}
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
        const gradient=paint.type==='linear'?ctx.createLinearGradient(...paint.from,...paint.to):ctx.createRadialGradient(...paint.from,paint.inner_radius,...paint.to,paint.outer_radius);
        for(const [offset,color]of paint.stops)gradient.addColorStop(offset,color);return gradient;
    }
    #style(ctx,m,draw,sx,sy){
        ctx.globalAlpha=draw.opacity;ctx.globalCompositeOperation=BLENDS[draw.blend];
        ctx.fillStyle=this.#paint(ctx,m.fill)??'transparent';ctx.strokeStyle=this.#paint(ctx,m.stroke)??'transparent';ctx.lineWidth=m.stroke_width||1;ctx.lineCap=m.line_cap;ctx.lineJoin=m.line_join;
        ctx.setLineDash(m.dash);ctx.lineDashOffset=m.dash_offset;
        ctx.shadowColor=m.shadow?.color??'transparent';ctx.shadowBlur=(m.shadow?.blur??0)*Math.max(sx,sy);ctx.shadowOffsetX=(m.shadow?.offset[0]??0)*sx;ctx.shadowOffsetY=(m.shadow?.offset[1]??0)*sy;
    }
    #geometry(id,inline){return id?this.#resources.get(id):{descriptor:{geometry:inline},path:null};}
    #shape(ctx,entry,m){
        const g=entry.descriptor.geometry,rule=g.fill_rule??'nonzero';
        if(!entry.path)buildPath(ctx,g);
        if(m.fill!==null)entry.path?ctx.fill(entry.path,rule):ctx.fill(rule);
        if(m.stroke!==null&&m.stroke_width>0)entry.path?ctx.stroke(entry.path):ctx.stroke();
    }
    #draw(ctx,draw,view,sx,sy){
        ctx.save();
        try{
            const m=draw.space==='world'?view.world_to_screen:[1,0,0,1,0,0];ctx.setTransform(m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy);ctx.transform(...draw.transform);
            for(const clip of draw.clips){ctx.transform(...clip.transform);const entry=this.#geometry(clip.geometry_id,clip.geometry);if(entry.path)ctx.clip(entry.path,clip.rule);else{buildPath(ctx,entry.descriptor.geometry);ctx.clip(clip.rule);}ctx.transform(...clip.inverse);}
            const material=draw.material_id?this.#resources.get(draw.material_id).descriptor.material:draw.material;this.#style(ctx,material,draw,sx,sy);
            if(draw.type==='shape')this.#shape(ctx,this.#geometry(draw.geometry_id,draw.geometry),material);
            else if(draw.type==='sprite'){
                const image=this.#resources.get(draw.resource_id).image,[w,h]=draw.size;
                if(draw.source)ctx.drawImage(image,...draw.source,-w*draw.origin[0],-h*draw.origin[1],w,h);else ctx.drawImage(image,-w*draw.origin[0],-h*draw.origin[1],w,h);
            }else{
                const f=draw.font;ctx.font=`${f.style} ${f.weight} ${f.size}px ${f.family}`;ctx.textAlign=draw.align;ctx.textBaseline=draw.baseline;
                if(material.fill!==null)ctx.fillText(draw.text,0,0);if(material.stroke!==null&&material.stroke_width>0)ctx.strokeText(draw.text,0,0);
            }
        }finally{ctx.restore();}
    }
    render(frame){
        this.#live();
        if(frame.format_version!==1)throw new TypeError('Unsupported render frame version');
        for(const pass of frame.passes){
            const target=pass.target_id===null?{surface:this.#surface,context:this.#context}:this.#resources.get(pass.target_id),ctx=target.context;
            const sx=target.surface.width/pass.viewport.width,sy=target.surface.height/pass.viewport.height;
            ctx.save();
            try{
                if(pass.clear_color!==false){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.clearRect(0,0,target.surface.width,target.surface.height);ctx.fillStyle=pass.clear_color;ctx.fillRect(0,0,target.surface.width,target.surface.height);}
                for(const draw of pass.packets)this.#draw(ctx,draw,frame.view,sx,sy);
            }finally{ctx.restore();}
        }
    }
    dispose(){if(this.#disposed)return;this.#disposed=true;this.#generation++;for(const entry of this.#resources.values())this.#release(entry);this.#resources.clear();this.#context=null;this.#surface=null;}
}

let measurer=null;
/** The width and the ascent/descent above and below the baseline of one line of text in `font`
 *  {family, size, weight, style}, as the Canvas backend would draw it. */
export function measureText(text,font={},{create_surface=createSurface}={}){
    measurer??=create_surface(1,1).getContext('2d');
    measurer.font=`${font.style??'normal'} ${font.weight??400} ${font.size??16}px ${font.family??'sans-serif'}`;
    const m=measurer.measureText(String(text));
    return Object.freeze({width:m.width,ascent:m.actualBoundingBoxAscent??0,descent:m.actualBoundingBoxDescent??0});
}

const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
/**
 * Pictures painted once and stamped every frame: a migration boundary like drawPackets, for hosts that
 * own a Canvas pass. `draw(context, {key, bounds, matrix}, build)` stamps the picture `key` (the packets
 * `build()` returns, in local units inside `bounds` [x, y, w, h]) under the context's transform times
 * `matrix`. A picture is painted at the first of `densities` (device pixels per local unit) at or above
 * what the view needs, so it stays sharp as the view zooms; past the last it draws as vector. Painting
 * spends at most `budget_ms` a frame (`beginFrame()`); a picture waiting its turn draws as vector, as
 * does one with a blend other than normal (a picture's own blend has nothing under it to work on).
 * The least recently stamped pictures go first when `max_bytes` would be passed. The key must name
 * everything the picture shows: the cache never looks inside `build`. A `layered` picture paints its own
 * base first, so its blends work on that and it is cached too (a light layer's dark with its cuts).
 */
export class pictureCache{
    #entries=new Map();#bytes=0;#spent=0;#max_bytes;#budget_ms;#densities;#create_surface;#now;
    constructor({max_bytes=48*1048576,budget_ms=3,densities=[1,1.5,2,3,4],create_surface=createSurface,now=()=>performance.now()}={}){
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
     */
    draw(context,{key,bounds,matrix=[1,0,0,1,0,0],layered=false,stamp=true},build){
        if(!context?.canvas||typeof context.getTransform!=='function')throw new TypeError('A host Canvas context is required');
        if(typeof key!=='string'||!key)throw new TypeError('A picture needs a key');
        const [bx,by,bw,bh]=bounds;if(![bx,by,bw,bh].every(Number.isFinite)||!(bw>0&&bh>0))throw new TypeError('A picture needs finite bounds');
        const t=context.getTransform(),m=multiply([t.a,t.b,t.c,t.d,t.e,t.f],matrix),scale=Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]));
        const density=this.#densities.find(d=>d>=scale-1e-9);
        const vector=packets=>{context.save();try{context.transform(...matrix);context.beginPath();context.rect(bx,by,bw,bh);context.clip();canvasRenderer.drawPackets(context,packets??build());}finally{context.restore();}return 'vector';};   // a picture is only its bounds, painted or not
        if(density===undefined||this.#entries.get(key)?.vector)return stamp?vector():'later';
        const id=`${key}@${density}`;let entry=this.#entries.get(id),how='stamp';
        if(!stamp&&entry){this.#entries.delete(id);this.#entries.set(id,entry);return 'kept';}
        if(!entry){
            if(this.#spent>=this.#budget_ms)return stamp?vector():'later';
            const t0=this.#now(),packets=build();
            if(!layered&&packets.some(p=>(p.blend??'normal')!=='normal')){this.#entries.set(key,{vector:true,bytes:0});return stamp?vector(packets):'later';}
            const W=Math.ceil(bw*density),H=Math.ceil(bh*density),bytes=W*H*4;
            if(bytes>this.#max_bytes)return stamp?vector(packets):'later';
            this.#evict(bytes);
            const surface=this.#create_surface(W,H),ctx=surface.getContext('2d');if(!ctx)throw new Error('Picture surface unavailable');
            ctx.setTransform(W/bw,0,0,H/bh,-bx*W/bw,-by*H/bh);canvasRenderer.drawPackets(ctx,packets);
            entry={surface,bytes};this.#bytes+=bytes;this.#spent+=this.#now()-t0;how='paint';
        }else this.#entries.delete(id);
        this.#entries.set(id,entry);
        if(!stamp)return how;
        context.save();
        try{context.transform(...matrix);context.drawImage(entry.surface,bx,by,bw,bh);}finally{context.restore();}
        return how;
    }
    #evict(bytes){for(const [id,entry]of this.#entries){if(this.#bytes+bytes<=this.#max_bytes)break;if(entry.surface){this.#free(entry);this.#entries.delete(id);}}}
    #free(entry){this.#bytes-=entry.bytes;entry.surface.width=0;entry.surface.height=0;}
    /** Lets go of every picture whose key starts with `prefix` (all of them without one). */
    release(prefix=''){for(const [id,entry]of [...this.#entries])if(id.startsWith(prefix)){if(entry.surface)this.#free(entry);this.#entries.delete(id);}}
    clear(){this.release();}
}
