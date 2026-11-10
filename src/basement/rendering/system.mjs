import {renderFrame} from './frame.mjs';
import {geometry,material,requirements} from './packets.mjs';
import {finite,identifier,freezeData} from './values.mjs';

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
const methods=['initialize','resize','render','registerResource','releaseResource','getSurfaceBounds','dispose'];

/** Backend selection and frame orchestration. Visibility uses the existing native world index. */
export class renderSystem {
    #world;#camera;#frame=new renderFrame();#renderers=new Map();#resources=new Map();#backend=null;#backendId=null;#surface=null;
    #collecting=false;#busy=false;#disposed=false;#generation=0;#last=null;#surfaceListeners=new Set();#requirements=[];
    constructor({physics_system,camera}={}){if(!physics_system?.queryEntitiesInBounds||!camera?.getView)throw new TypeError('renderSystem requires native world and camera');this.#world=physics_system;this.#camera=camera;}
    get renderer_id(){return this.#backendId;}
    get disposed(){return this.#disposed;}
    #live(){if(this.#disposed)throw new Error('renderSystem is disposed');}
    #boundary(){this.#live();if(this.#collecting||this.#busy)throw new Error('Rendering resources/backend changes require an idle boundary');}
    registerRenderer(renderer_id,Constructor){this.#boundary();identifier(renderer_id);if(typeof Constructor!=='function')throw new TypeError('Register a renderer class');if(this.#renderers.has(renderer_id))throw new Error('Renderer already registered');this.#renderers.set(renderer_id,Constructor);return this;}
    listRenderers(){return [...this.#renderers.keys()];}
    getCapabilities(){this.#live();return Object.freeze(this.#backend?[...this.#backend.capabilities]:[]);}
    getSurfaceBounds(){this.#live();return this.#backend?.getSurfaceBounds()??Object.freeze({left:0,top:0,width:this.#camera.viewport.width,height:this.#camera.viewport.height});}
    onSurfaceChanged(handler){this.#boundary();if(typeof handler!=='function')throw new TypeError('Surface handler must be a function');this.#surfaceListeners.add(handler);return ()=>this.#surfaceListeners.delete(handler);}
    async setRenderer(renderer_id,{surface}={}){
        this.#boundary();const Constructor=this.#renderers.get(renderer_id);if(!Constructor)throw new Error('Unknown renderer');
        if(this.#backend&&surface===this.#surface){if(renderer_id===this.#backendId)return;throw new Error('A different backend requires a fresh surface; context types cannot share a canvas');}
        this.#busy=true;const generation=this.#generation;let next=null,installed=false;
        try{
            next=new Constructor();for(const method of methods)if(typeof next[method]!=='function')throw new TypeError(`Renderer is missing ${method}`);
            if(!Array.isArray(next.capabilities)||next.capabilities.some(v=>typeof v!=='string'))throw new TypeError('Renderer must declare capabilities');
            await next.initialize(surface,{viewport:this.#camera.viewport});
            for(const [id,resource]of this.#resources)await next.registerResource(id,resource);
            if(this.#disposed||generation!==this.#generation)throw new Error('Renderer preparation was cancelled');
            const old=this.#backend;this.#backend=next;this.#backendId=renderer_id;this.#surface=surface;installed=true;
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
    listResources(){return [...this.#resources.keys()];}
    #resource(id,types){const data=this.#resources.get(id);if(!data||!(Array.isArray(types)?types:[types]).includes(data.type))throw new Error(`Missing or incompatible rendering resource: ${id}`);return data;}
    resize(dimensions){
        this.#boundary();const old=this.#camera.viewport;
        this.#camera.setViewport(dimensions);
        try{this.#backend?.resize(this.#camera.viewport);}catch(error){this.#camera.setViewport(old);throw error;}return this;
    }
    getVisibleEntities({blend=1,margin=0,...options}={},results=[]){this.#live();return this.#world.queryEntitiesInBounds({...options,bounds:this.#camera.getVisibleBounds({blend,margin}),bounds_type:'render'},results);}
    beginFrame(blend=1){this.#live();if(this.#collecting)throw new Error('A render frame is already open');this.#collecting=true;try{return this.#frame.begin(this.#camera.getView(blend));}catch(error){this.#collecting=false;throw error;}}
    endFrame(){
        this.#live();if(!this.#collecting)throw new Error('No open render frame');
        try{
            const frame=this.#frame.finish(),caps=this.#backend?new Set(this.#backend.capabilities):null;
            for(const pass of frame.passes){
                if(pass.target_id!==null){this.#resource(pass.target_id,'target');if(caps&&!caps.has('target'))throw new Error('Renderer does not support targets');}
                for(const draw of pass.packets){
                    if(draw.resource_id===pass.target_id&&pass.target_id!==null)throw new Error('A pass cannot sample its own render target');
                    for(const need of requirements(draw,(id,types)=>this.#resource(id,types),this.#requirements))if(caps&&!caps.has(need))throw new Error(`Renderer capability unavailable: ${need}`);
                }
            }
            const result=this.#backend?.render(frame);if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('Renderer.render must be synchronous');}
            this.#last=frame;return frame.packet_count;
        }finally{this.#collecting=false;}
    }
    abortFrame(){this.#frame.abort();this.#collecting=false;}
    getFrameSnapshot(){this.#live();return this.#frame.snapshot();}
    getStatistics(){return {...this.#frame.getStatistics(),resources:this.#resources.size,renderer_id:this.#backendId};}
    dispose(){if(this.#disposed)return;this.#disposed=true;this.#generation++;this.abortFrame();try{this.#backend?.dispose();}finally{this.#backend=null;this.#surface=null;this.#resources.clear();this.#renderers.clear();this.#surfaceListeners.clear();this.#last=null;}}
}
