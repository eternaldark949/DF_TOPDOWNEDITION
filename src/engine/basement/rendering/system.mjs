// ===== LV0 BASEMENT =====
import {renderFrame} from './frame.mjs';
import {geometry,material,requirements} from './packets.mjs';
import {effectStack,effectNeeds} from './effects.mjs';
import {finite,identifier,freezeData,CAPABILITIES} from './values.mjs';
import {artScene} from './art.mjs';
import {drawLook,drawComponents} from './looks.mjs';
import {heightView} from './height.mjs';
const PICK_STEPS=Object.freeze([1,.75,.5,.25,0]);   // top first: what the camera sees of a tall thing is its top

function normalizeResource(description){
    if(!description||typeof description!=='object')throw new TypeError('A data resource descriptor is required');
    const type=description.type;
    if(type==='geometry')return freezeData({type,geometry:geometry(description.geometry)});
    if(type==='material')return freezeData({type,material:material(description.material)});
    if(!['image','target'].includes(type))throw new TypeError('Unknown rendering resource');
    if(type==='image'&&description.url!==undefined){if(typeof description.url!=='string'||!description.url)throw new TypeError('Image URL required');return Object.freeze({type,url:description.url});}
    const width=finite(description.width,'resource width',1),height=finite(description.height,'resource height',1);if(!Number.isInteger(width)||!Number.isInteger(height))throw new TypeError('Resource sizes must be integral');
    if(type==='target')return Object.freeze({type,width,height});
    const data=description.pixels;if((!Array.isArray(data)&&!ArrayBuffer.isView(data))||data.length!==width*height*4||Array.prototype.some.call(data,v=>!Number.isFinite(v)||v<0||v>255))throw new TypeError('Expected width*height*4 RGBA bytes');
    return Object.freeze({type,width,height,pixels:new Uint8ClampedArray(data)});
}
const methods=['initialize','resize','render','registerResource','releaseResource','getSurfaceBounds','measureText','dispose'];

/**
 * Backend selection and frame orchestration. Visibility uses the existing native world index.
 * Backends are a light switch: register each once, then `setRenderer(id)` swaps to it between frames,
 * carrying every resource across. Give `create_surface(renderer_id)` (the host makes a fresh canvas
 * for that backend and puts it on screen) and a switch needs no surface; `onSurfaceChanged` tells the
 * host which surface is live.
 */
export class renderSystem {
    #createSurface=null;#lean=null;#textures=new Map();#texturesWanted=[];#textureChain=Promise.resolve();#world;#camera;#frame=new renderFrame();#renderers=new Map();#resources=new Map();#backend=null;#backendId=null;#surface=null;
    #effects=Object.freeze([]);#layerEffects=new Map();#collecting=false;#busy=false;#disposed=false;#generation=0;#last=null;#surfaceListeners=new Set();#frameListeners=new Set();#requirements=[];#visible=[];
    constructor({physics_system,camera,create_surface=null}={}){if(create_surface!==null&&typeof create_surface!=='function')throw new TypeError('create_surface makes a surface for a renderer id');this.#createSurface=create_surface;if(!physics_system?.queryEntitiesInBounds||!camera?.getView)throw new TypeError('renderSystem requires native world and camera');this.#world=physics_system;this.#camera=camera;}
    get renderer_id(){return this.#backendId;}
    get disposed(){return this.#disposed;}
    #live(){if(this.#disposed)throw new Error('renderSystem is disposed');}
    #boundary(){this.#live();if(this.#collecting||this.#busy)throw new Error('Rendering resources/backend changes require an idle boundary');}
    registerRenderer(renderer_id,Constructor){this.#boundary();identifier(renderer_id);if(typeof Constructor!=='function')throw new TypeError('Register a renderer class');if(this.#renderers.has(renderer_id))throw new Error('Renderer already registered');this.#renderers.set(renderer_id,Constructor);return this;}
    listRenderers(){return [...this.#renderers.keys()];}
    getCapabilities(){this.#live();return Object.freeze(this.#backend?[...this.#backend.capabilities]:[]);}
    getSurfaceBounds(){this.#live();return this.#backend?.getSurfaceBounds()??Object.freeze({left:0,top:0,width:this.#camera.viewport.width,height:this.#camera.viewport.height});}
    onSurfaceChanged(handler){this.#boundary();if(typeof handler!=='function')throw new TypeError('Surface handler must be a function');this.#surfaceListeners.add(handler);return ()=>this.#surfaceListeners.delete(handler);}
    onFrameRendered(handler){this.#boundary();if(typeof handler!=='function')throw new TypeError('Frame handler must be a function');this.#frameListeners.add(handler);return ()=>this.#frameListeners.delete(handler);}
    /** The backend now drawing, or null. */
    getRenderer(){this.#live();return this.#backendId;}
    async setRenderer(renderer_id,{surface}={}){
        this.#boundary();const Constructor=this.#renderers.get(renderer_id);if(!Constructor)throw new Error('Unknown renderer');
        if(renderer_id===this.#backendId&&surface===undefined)return;
        if(surface===undefined&&this.#createSurface)surface=this.#createSurface(renderer_id);
        if(this.#backend&&surface!=null&&surface===this.#surface){if(renderer_id===this.#backendId)return;throw new Error('A different backend requires a fresh surface; context types cannot share a canvas');}
        this.#busy=true;const generation=this.#generation;let next=null,installed=false;
        try{
            next=new Constructor();for(const method of methods)if(typeof next[method]!=='function')throw new TypeError(`Renderer is missing ${method}`);
            if(!Array.isArray(next.capabilities)||next.capabilities.some(v=>!CAPABILITIES.includes(v)))throw new TypeError(`Renderer must declare capabilities among ${CAPABILITIES.join(', ')}`);
            await next.initialize(surface,{viewport:this.#camera.viewport});
            for(const [id,resource]of this.#resources)await next.registerResource(id,resource);
            if(this.#disposed||generation!==this.#generation)throw new Error('Renderer preparation was cancelled');
            const old=this.#backend;this.#backend=next;this.#backendId=renderer_id;this.#surface=surface;installed=true;
            for(const entry of this.#textures.values())if(entry.state==='painted')entry.state='ready';
            const errors=[];
            try{old?.dispose();}catch(error){errors.push(error);}
            for(const handler of this.#surfaceListeners)try{handler(Object.freeze({surface,renderer_id}));}catch(error){errors.push(error);}
            if(errors.length)throw new AggregateError(errors,'Renderer installed; surface notification/old-backend cleanup failed');
        }finally{try{if(next&&!installed)next.dispose();}finally{this.#busy=false;}}
    }
    async registerResource(resource_id,description){
        this.#boundary();identifier(resource_id);const normalized=normalizeResource(description),generation=this.#generation;this.#busy=true;
        try{if(this.#backend)await this.#backend.registerResource(resource_id,normalized);if(this.#disposed||generation!==this.#generation)throw new Error('Resource registration was cancelled');this.#resources.set(resource_id,normalized);}
        finally{this.#busy=false;}return resource_id;
    }
    releaseResource(resource_id){this.#boundary();if(!this.#resources.has(resource_id))return false;this.#backend?.releaseResource(resource_id);return this.#resources.delete(resource_id);}
    /** One line of text's width, ascent and descent ({width, ascent, descent}) as the live backend draws it. */
    measureText(text,font={}){this.#live();if(!this.#backend)throw new Error('Measure text with a renderer set');return this.#backend.measureText(String(text),font);}
    listResources(){return [...this.#resources.keys()];}
    #resource(id,types){const data=this.#resources.get(id);if(!data||!(Array.isArray(types)?types:[types]).includes(data.type))throw new Error(`Missing or incompatible rendering resource: ${id}`);return data;}
    resize(dimensions){
        this.#boundary();const old=this.#camera.viewport;
        this.#camera.setViewport(dimensions);
        try{this.#backend?.resize(this.#camera.viewport);}catch(error){this.#camera.setViewport(old);throw error;}return this;
    }
    getVisibleEntities({blend=1,margin=0,...options}={},results=[]){this.#live();return this.#world.queryEntitiesInBounds({...options,bounds:this.#camera.getVisibleBounds({blend,margin}),bounds_type:'render'},results);}
    /**
     * Leans heights toward the camera, the way a camera `eye` world units above the ground sees them:
     * each component layer draws in the plane of its top, scaled about the camera, and a layer with
     * `sides` shows its walls. `lean` exaggerates (or softens) it. null draws everything flat.
     */
    setHeightView(options){this.#live();if(options===null){this.#lean=null;return this;}const {eye,lean=1}=options??{};new heightView({camera:[0,0],eye,lean}).k(0);if(!(eye>0))throw new RangeError('A height view needs an eye above the ground');this.#lean={eye,lean};return this;}
    getHeightView(){return this.#lean?{...this.#lean}:null;}
    /**
     * A paint that names a texture, `{type: 'pattern', texture, values, scale, rotation, offset, repeat}`, as the pattern
     * the backend draws: the texture resource's tile, painted once for these values into a target of its own and
     * repeated, `pixels_per_unit` pixels to a world unit, turned by `rotation`, scaled by `scale` and moved by `offset`
     * in the shape's space. The first frame a tile is asked for it is not painted yet, so the texture's `base` colour
     * stands in; its target is made after that frame and painted at the start of the next. Any other paint is returned.
     */
    resolvePaint(paint){
        if(!paint||typeof paint!=='object'||paint.type!=='pattern'||paint.texture===undefined)return paint;
        const id=paint.texture,texture=this.#world.elements.asset_library.getResource(id);if(texture?.kind!=='texture')throw new TypeError(`${id} is not a texture`);
        const values={...(texture.values??{}),...(paint.values??{})},key=`${id} ${JSON.stringify(values)}`;let entry=this.#textures.get(key);
        if(!entry){const ppu=texture.pixels_per_unit??4,[w,h]=texture.size;entry={key,resource_id:`texture:${this.#textures.size}:${id}`,size:[w,h],pixels:[Math.max(1,Math.round(w*ppu)),Math.max(1,Math.round(h*ppu))],ppu,steps:texture.steps,values,state:'wanted'};this.#textures.set(key,entry);this.#texturesWanted.push(entry);}
        if(entry.state!=='painted')return texture.base;
        const scale=paint.scale??1,turn=paint.rotation??0,[ox,oy]=paint.offset??[0,0],[sx,sy]=[entry.size[0]/entry.pixels[0]*scale,entry.size[1]/entry.pixels[1]*scale],c=Math.cos(turn),s=Math.sin(turn);
        return {type:'pattern',image:entry.resource_id,repeat:paint.repeat??'repeat',matrix:[c*sx,s*sx,-s*sy,c*sy,ox,oy]};
    }
    #textured(packet){const m=packet.material;if(!m)return packet;const fill=this.resolvePaint(m.fill),stroke=this.resolvePaint(m.stroke);return fill===m.fill&&stroke===m.stroke?packet:{...packet,material:{...m,fill,stroke}};}
    // After a frame: make a target for each tile asked for (a target is made at once; the promise settles before the next frame).
    /** Settles once every tile asked for so far has its target (for tests and loading screens). */
    texturesReady(){return this.#textureChain;}
    #registerTextures(){
        for(const entry of this.#texturesWanted.splice(0)){entry.state='registering';
            this.#textureChain=this.#textureChain.then(()=>this.registerResource(entry.resource_id,{type:'target',width:entry.pixels[0],height:entry.pixels[1]})).then(()=>{entry.state='ready';},error=>{entry.state='failed';entry.error=error;});}
    }
    // At the start of a frame: paint every tile whose target is ready, before anything that repeats it. A tile's
    // shapes are drawn nine times, shifted a tile each way, so a shape across an edge comes back on the other side.
    #paintTextures(frame){
        for(const entry of this.#textures.values()){if(entry.state!=='ready'||!this.#backend)continue;
            const [pw,ph]=entry.pixels,[w,h]=entry.size,scene=new artScene();
            for(const dx of [-w,0,w])for(const dy of [-h,0,h])scene.draw(entry.steps,{at:[dx*pw/w,dy*ph/h],scale:[pw/w,ph/h],values:entry.values});
            frame.beginPass({target_id:entry.resource_id,clear_color:'transparent',viewport:{width:pw,height:ph}});
            for(const packet of scene.finish())frame.submit({...packet,space:'screen'});
            frame.endPass();entry.state='painted';
        }
    }
    /** Draws every visible entity's look (a `drawing` asset) and its components into the open frame, at its `look.layer` and `look.depth`; a component layer's depth adds its height, so higher parts draw over lower ones. Returns how many entities it drew. */
    drawLooks(blend=1){
        this.#live();if(!this.#collecting)throw new Error('Draw looks inside an open render frame');
        const source=this.#world.elements.asset_library,view=this.#lean?new heightView({camera:this.#camera.getView(blend).position,...this.#lean}):null;let drawn=0;
        for(const {entity} of this.getVisibleEntities({blend},this.#visible)){
            if(!entity)continue;
            const look=entity.get('look',{}),layer=look.layer??0,depth=look.depth??0;let drew=false;
            if(entity.assets?.drawing){const scene=new artScene();if(drawLook(scene,entity,source,blend,{view})){const z=entity.world_elevation??0;for(const packet of scene.finish())this.#frame.submit(this.#textured({...packet,layer,depth:depth+z}));drew=true;}}
            if(entity.has('components')){
                let pose;const rigs=this.#world.rigs,joints=name=>{pose??=rigs?.getRig(entity)?rigs.getPose(entity,{blend,world_space:true}):null;return pose?.joints[name]??null;};
                for(const part of drawComponents(entity,source,blend,{joints,view})){for(const packet of part.sides)this.#frame.submit(this.#textured({...packet,layer,depth:depth+part.depth+packet.depth}));for(const packet of part.packets)this.#frame.submit(this.#textured({...packet,layer,depth:depth+part.top}));drew=true;}
            }
            if(drew)drawn++;
        }
        return drawn;
    }
    /**
     * Everything at a world point, top first, the way a ray from the camera meets it: higher `look.layer`
     * first, then the higher top (its elevation plus its components' highest top), then the one made later.
     * With a height view on, the ray leans like the drawing: a tall thing is hit where it is drawn. Each hit
     * is {entity, body, position (the ground point under the hit), height (its top), layer}. `bounds` is `collision` (default) or `render`; `kind`,
     * `tag` and `property` (an entity property it must have, like UPBGE's propName) filter. Without
     * `xray` the first thing met blocks the ray: only it can be hit. `ignore` lists entities to look past.
     */
    pickAllAt(point,{bounds='collision',kind,tag,property,xray=true,ignore=[],blend=1}={}){
        this.#live();const [x,y]=point;finite(x,'pick x');finite(y,'pick y');
        if(!['collision','render'].includes(bounds))throw new TypeError('Pick bounds are collision or render');
        const skip=new Set((Array.isArray(ignore)?ignore:[ignore]).map(e=>e?.entity_id??e)),hits=[];
        // Leaning toward the camera, what is drawn at this point stands somewhere between it and the camera: at
        // height z it is the ground point camera + (point − camera) / k(z). Each candidate is tested from its base to its top.
        const view=this.#lean?new heightView({camera:this.#camera.getView(blend).position,...this.#lean}):null,[cx,cy]=view?view.camera:[x,y];
        const area={left:Math.min(x,cx)-.5,top:Math.min(y,cy)-.5,right:Math.max(x,cx)+.5,bottom:Math.max(y,cy)+.5};
        for(const {entity,body} of this.#world.queryEntitiesInBounds({bounds:area,bounds_type:bounds},[])){
            if(!entity||skip.has(entity.entity_id))continue;
            const base=entity.world_elevation??0,top=base+(entity.height??0);
            const at=(view?PICK_STEPS.map(t=>base+(top-base)*t):[base]).map(z=>[z,view?view.scaled(x,y,1/view.k(z)):[x,y]]).find(([,p])=>this.#world.containsPoint(body,p,{bounds_type:bounds}));
            if(at)hits.push({entity,body,position:at[1],height:top,layer:entity.get('look',{}).layer??0});
        }
        hits.sort((a,b)=>b.layer-a.layer||b.height-a.height||b.entity.entity_id-a.entity.entity_id);
        const passes=h=>(kind===undefined||h.entity.kind===kind)&&(tag===undefined||h.entity.tags.includes(tag))&&(property===undefined||h.entity.has(property));
        if(!xray)return hits.length&&passes(hits[0])?[hits[0]]:[];
        return hits.filter(passes);
    }
    /** The top thing at a world point that passes the filters (see pickAllAt), or null. Without `xray: true`, something on top that fails them blocks the pick. */
    pickAt(point,options={}){return this.pickAllAt(point,{xray:false,...options})[0]??null;}
    /**
     * Effects on everything drawn from now on (a list of effects, or {preset, ...changes} naming an `effects`
     * resource in the world's data), or null for none. See effects.mjs.
     */
    setEffects(effects){this.#live();this.#effects=this.#stack(effects);return this;}
    /** Effects on one packet layer number alone, drawn as a pass of its own (null removes them). */
    setLayerEffects(layer,effects){this.#live();if(!Number.isFinite(layer))throw new TypeError('A layer is a number');const stack=this.#stack(effects);if(stack.length)this.#layerEffects.set(layer,stack);else this.#layerEffects.delete(layer);return this;}
    /** A stack read from a list or a preset in the world's data. */
    #stack(value){return effectStack(value,id=>this.#world.elements.asset_library.getResource(id));}
    getEffects(){return {frame:this.#effects,layers:Object.fromEntries(this.#layerEffects)};}
    beginFrame(blend=1){
        this.#live();if(this.#collecting)throw new Error('A render frame is already open');this.#collecting=true;
        try{const frame=this.#frame.begin(this.#camera.getView(blend));if(this.#effects.length)frame.setEffects(this.#effects);for(const [layer,stack] of this.#layerEffects)frame.setLayerEffects(layer,stack);this.#paintTextures(frame);return frame;}
        catch(error){this.#collecting=false;this.#frame.abort();throw error;}
    }
    endFrame(){
        this.#live();if(!this.#collecting)throw new Error('No open render frame');
        try{
            const frame=this.#frame.finish(),caps=this.#backend?new Set(this.#backend.capabilities):null;
            if(caps)for(const need of [...effectNeeds(frame.effects),...frame.passes.flatMap(pass=>pass.layer?effectNeeds(pass.layer.effects):[])])if(!caps.has(need))throw new Error(`Renderer capability unavailable: ${need}`);
            for(const pass of frame.passes){
                if(pass.target_id!==null){this.#resource(pass.target_id,'target');if(caps&&!caps.has('target'))throw new Error('Renderer does not support targets');}
                if(pass.layer&&caps&&!caps.has('layer'))throw new Error('Renderer capability unavailable: layer');
                const writes=pass.layer?pass.layer.into:pass.target_id;
                for(const draw of pass.packets){
                    if(draw.resource_id===writes&&writes!==null)throw new Error('A pass cannot sample its own render target');
                    for(const need of requirements(draw,(id,types)=>this.#resource(id,types),this.#requirements))if(caps&&!caps.has(need))throw new Error(`Renderer capability unavailable: ${need}`);
                }
            }
            const result=this.#backend?.render(frame);if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('Renderer.render must be synchronous');}
            this.#last=frame;
            if(this.#backend&&this.#frameListeners.size){const event=Object.freeze({targets:Object.freeze([...new Set(frame.passes.map(pass=>pass.target_id).filter(id=>id!==null))])});for(const handler of this.#frameListeners)handler(event);}
            return frame.packet_count;
        }finally{this.#collecting=false;this.#registerTextures();}
    }
    abortFrame(){this.#frame.abort();this.#collecting=false;}
    getFrameSnapshot(){this.#live();return this.#frame.snapshot();}
    getStatistics(){return {...this.#frame.getStatistics(),resources:this.#resources.size,renderer_id:this.#backendId};}
    dispose(){if(this.#disposed)return;this.#disposed=true;this.#generation++;this.abortFrame();try{this.#backend?.dispose();}finally{this.#backend=null;this.#surface=null;this.#resources.clear();this.#renderers.clear();this.#surfaceListeners.clear();this.#frameListeners.clear();this.#last=null;}}
}
