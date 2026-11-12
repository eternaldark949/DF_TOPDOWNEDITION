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
const overlays=new WeakMap();
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
