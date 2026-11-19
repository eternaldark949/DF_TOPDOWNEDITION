// ===== LV0 BASEMENT =====
// THE LIGHT GRID OF A MAP: one baked light grid (lighting.mjs) per streamed region, from the steps marked
// `emits` in the map's floors, walls and objects, stopped by its walls. It joins a map as a tier, so a
// region's grid is baked when the region comes near a focus and let go when it goes far. A moving
// emitter (a car's underglow, a glowing character) re-bakes the regions it reaches as it moves on, and
// keeps a small live light of its own on top. Nothing here knows which map it is: the map's
// `light_grid` settings say the cell size (16 or 32, with per-region overrides) and how strong it is.
import {bakeLightGrid,readLightGrid} from './lighting.mjs';
import {drawingEmitters} from './looks.mjs';

const finiteBox=([l,t,r,b])=>[l,t,r,b].every(Number.isFinite);
/** A packet's collision box as an outline in the world ([x, y] corners), or null. */
function boxOutline(packet){
    const s=packet.collision_shape;if(!s||s.shape_type!=='box'||!Array.isArray(s.dimensions))return null;
    const [w,h]=s.dimensions,[x,y]=packet.position,a=packet.rotation??0,c=Math.cos(a),n=Math.sin(a);
    return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([u,v])=>[x+u*c-v*n,y+u*n+v*c]);
}
/** Whether a packet stops light: a wall unless it says not (glass), or anything marked `blocks_light`. */
function blocksLight(packet){
    if(packet.blocks_light!==undefined)return !!packet.blocks_light;
    const layers=(packet.components??[]).flatMap(c=>c.layers??[]);
    if(layers.some(l=>l.blocks_light===false))return false;
    return packet.data?.role==='wall';
}
/**
 * The glowing shapes of an entity or entity packet, in the world at its pose: its drawing asset's steps
 * (read from `source`) and its components' layers, each at its elevation and layer height.
 */
export function entityEmitters(body,source,{pose=null}={}){
    const at=pose?.position??body.position,rotation=pose?.rotation??body.rotation??0,elevation=pose?.elevation??body.elevation??0;
    const materials=source?name=>source.getResource(name):null,out=[];
    const values=(typeof body.get==='function'?body.get('look',{}):body.data?.look)?.values??{};
    const drawing=body.assets?.drawing;
    if(drawing&&source){const steps=source.getResource(drawing)?.steps;if(steps)out.push(...drawingEmitters(steps,{at,rotation,values,materials,elevation}));}
    const components=typeof body.get==='function'?body.get('components')??body.components??[]:body.components??[];
    for(const c of components)for(const layer of c.layers??[]){
        const steps=layer.steps??(layer.drawing&&source?source.getResource(layer.drawing)?.steps:null);if(!steps)continue;
        const [cx,cy]=c.at??[0,0];
        out.push(...drawingEmitters([{shape:'group',x:cx,y:cy,rotation:c.rotation??0,steps}],{at,rotation,values,materials,elevation:elevation+(layer.height??0)}));
    }
    return out;
}

/**
 * A map's light grids, kept current. `settings` is the map's `light_grid` (see readLightGrid): cell
 * 16 or 32 by default and per region (`regions: {'<rx>,<ry>': {cell}}`, the map's region keys), blur
 * passes, strength. `source` is the world's data source (drawings and materials by id).
 *
 *  attach(map, {radius})   gathers the map's still emitters and blockers from its packets and joins it as
 *                          the tier `light_grid`: a region's grid is queued to bake when it comes in reach
 *  setMovers(movers)       the moving emitters this step: [{id, emitters}] (emitters as entityEmitters
 *                          gives them); one that moved half a cell, appeared or went re-bakes what it reaches
 *  updateState({budget_ms})  bakes queued regions until the budget is spent (at least one a call), the
 *                          old grid showing until its new one is ready. The Lobby calls it.
 *  grids(view)             the baked grids meeting view {left, top, right, bottom}, for createLightLayerParts
 *  sample(x, y)            the light arriving at a point, [r, g, b] (reflections and tools read it)
 *  liveLights()            a small live point light per moving emitter, for the light layer's live lights
 */
export class lightGridSystem{
    #settings;#source;#map=null;#size=0;#still=new Map();#walls=new Map();#grids=new Map();#loaded=new Set();#queue=[];#queued=new Set();#movers=new Map();
    #stats={bakes:0,bake_ms:0,last_bake_ms:0,max_bake_ms:0};
    constructor({settings={},source=null}={}){this.#settings=readLightGrid(settings);this.#source=source;}
    get settings(){return this.#settings;}
    /** The settings a region bakes with: the map's, or its region's override. */
    regionSettings(key){return this.#settings.regions[key]??this.#settings;}
    attach(map,{radius=2048,keep}={}){
        if(this.#map)throw new Error('A light grid system serves one map');
        this.#map=map;this.#size=map.region_size;
        for(const packet of map.packets()){
            if(blocksLight(packet)){const outline=boxOutline(packet);if(outline)this.#bucket(this.#walls,{outline},outline,0);}
            if(packet.physics_type==='dynamic'||packet.kind==='character')continue;    // (moving things are movers)
            for(const e of entityEmitters(packet,this.#source))this.#bucket(this.#still,e,null,e.reach+(e.height??0));
        }
        map.addTier('light_grid',{radius,keep:keep??this.#size,every:true,load:key=>{this.#loaded.add(key);this.#want(key);},release:key=>{this.#loaded.delete(key);this.#grids.delete(key);this.#queued.delete(key);}});
        return this;
    }
    #keysOf([l,t,r,b],pad){const s=this.#size,out=[];for(let x=Math.floor((l-pad)/s);x<=Math.floor((r+pad)/s);x++)for(let y=Math.floor((t-pad)/s);y<=Math.floor((b+pad)/s);y++)out.push(`${x},${y}`);return out;}
    #bucket(index,item,outline,pad){
        const box=item.bounds??(item.bounds=[Math.min(...outline.map(p=>p[0])),Math.min(...outline.map(p=>p[1])),Math.max(...outline.map(p=>p[0])),Math.max(...outline.map(p=>p[1]))]);
        if(!finiteBox(box))return;
        for(const key of this.#keysOf(box,pad+32)){let list=index.get(key);if(!list)index.set(key,list=[]);list.push(item);}
    }
    #want(key){if(this.#loaded.has(key)&&!this.#queued.has(key)){this.#queued.add(key);this.#queue.push(key);}}
    #bounds(key){const [x,y]=key.split(',').map(Number),s=this.#size;return {left:x*s,top:y*s,right:(x+1)*s,bottom:(y+1)*s};}
    setMovers(movers=[]){
        const seen=new Set();
        for(const {id,emitters} of movers){
            seen.add(id);
            const reach=emitters.map(e=>{const R=e.reach+(e.height??0),[l,t,r,b]=e.bounds;return [l-R,t-R,r+R,b+R];});
            const keys=new Set(reach.flatMap(box=>this.#keysOf(box,0)));
            const half=Math.min(...[...keys].map(k=>this.regionSettings(k).cell))/2;
            const sign=emitters.map(e=>[Math.round(e.bounds[0]/half),Math.round(e.bounds[1]/half),e.color,Math.round(e.strength*64),Math.round(e.reach)].join(':')).join('|');
            const before=this.#movers.get(id);
            if(!before||before.sign!==sign){for(const k of before?.keys??[])this.#want(k);for(const k of keys)this.#want(k);}
            this.#movers.set(id,{emitters,keys,sign});
        }
        for(const [id,m] of this.#movers)if(!seen.has(id)){for(const k of m.keys)this.#want(k);this.#movers.delete(id);}
        return this;
    }
    /** Bakes queued regions until `budget_ms` is spent; returns {baked, pending}. */
    updateState({budget_ms=2,now=()=>performance.now()}={}){
        const t0=now();let baked=0;
        while(this.#queue.length&&(!baked||now()-t0<budget_ms)){
            const key=this.#queue.shift();if(!this.#queued.delete(key)||!this.#loaded.has(key))continue;
            const t=now();this.#grids.set(key,this.bakeRegion(key));const ms=now()-t;
            baked++;this.#stats.bakes++;this.#stats.bake_ms+=ms;this.#stats.last_bake_ms=ms;this.#stats.max_bake_ms=Math.max(this.#stats.max_bake_ms,ms);
        }
        return {baked,pending:this.#queue.length};
    }
    /** One region's grid from its still emitters, the movers reaching it and its walls. */
    bakeRegion(key){
        const s=this.regionSettings(key),movers=[...this.#movers.values()].filter(m=>m.keys.has(key)).flatMap(m=>m.emitters);
        return bakeLightGrid({bounds:this.#bounds(key),cell:s.cell,spread:s.spread,strength:s.strength,cut:s.cut,glow:s.glow,pass:s.pass,emitters:[...(this.#still.get(key)??[]),...movers],blockers:this.#walls.get(key)??[]});
    }
    grids(view=null){const out=[];for(const g of this.#grids.values())if(!view||(g.left<view.right&&g.right>view.left&&g.top<view.bottom&&g.bottom>view.top))out.push(g);return out;}
    sample(x,y){const g=this.#grids.get(`${Math.floor(x/this.#size)},${Math.floor(y/this.#size)}`);return g?g.sample(x,y):[0,0,0];}
    liveLights({radius=.5,glow=.35,intensity=.2}={}){
        const out=[];for(const m of this.#movers.values())for(const e of m.emitters){const [l,t,r,b]=e.bounds;out.push({position:[(l+r)/2,(t+b)/2],radius:Math.max(8,e.reach*radius),color:e.color,glow:glow*Math.min(1,e.strength),intensity:intensity*Math.min(1,e.strength)});}
        return out;
    }
    /**
     * Movers from live entities: each that is not static and whose drawing or components glow, at its
     * pose now, by its id. Whether a drawing or a component list glows is worked out once and kept.
     */
    moversOf(entities){
        const out=[];
        for(const e of entities){
            if(e.destroyed||e.physics_type==='static')continue;
            const drawing=e.assets?.drawing??null,components=e.get?.('components')??e.components??null;
            const glows=(drawing!==null&&this.#glows(drawing,()=>entityEmitters({assets:{drawing},position:[0,0]},this.#source).length>0))||(components?.length>0&&this.#glows(components,()=>entityEmitters({components,position:[0,0]},this.#source).length>0));
            if(!glows)continue;
            const emitters=entityEmitters(e,this.#source);if(emitters.length)out.push({id:e.id,emitters});
        }
        return out;
    }
    #glowing=new Map();#glowingLists=new WeakMap();
    #glows(key,test){const store=typeof key==='string'?this.#glowing:this.#glowingLists;let v=store.get(key);if(v===undefined){v=test();store.set(key,v);}return v;}
    get pending(){return this.#queue.length;}
    getStatistics(){return {...this.#stats,grids:this.#grids.size,pending:this.#queue.length,movers:this.#movers.size,still_emitters:new Set([...this.#still.values()].flat()).size,walls:new Set([...this.#walls.values()].flat()).size};}
}
