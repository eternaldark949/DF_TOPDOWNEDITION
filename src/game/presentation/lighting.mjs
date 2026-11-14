import LIGHTING from '../data/game-lighting.json' with {type:'json'};
import {createLightLayer,createLightLayerParts,viewAhead} from '../../engine/basement/rendering/index.mjs';
import {declaredLight} from '../../engine/basement/maps/index.mjs';
export {LIGHTING};
/** A look's colour stops for a light: `$color` is its colour, `$warm:T` its colour pulled T toward a warm white, `$warm:T@A` that at alpha A. */
const stopsMade=new WeakMap();
function stops(list,color){
    let made=stopsMade.get(list);if(!made)stopsMade.set(list,made=new Map());
    let out=made.get(color);if(out)return out;   // (once per look and colour: every lamp of a colour shares them)
    out=list.map(([o,c])=>{
        if(c==='$color')return [o,color];
        const m=/^\$warm:([\d.]+)(?:@([\d.]+))?$/.exec(c);if(!m)return [o,c];
        const rgb=warm(color,+m[1]);return [o,m[2]===undefined?`rgb(${rgb})`:`rgba(${rgb},${m[2]})`];
    });
    made.set(color,out);return out;
}
/** A colour pulled toward a candle's warm white by t (0..1): the hot heart of a street lamp's light. */
function warm(hex,t){
    if(!/^#[0-9a-f]{6}$/i.test(hex??''))hex='#ffeebb';
    return [1,3,5].map((i,j)=>Math.round(parseInt(hex.slice(i,i+2),16)+([255,241,220][j]-parseInt(hex.slice(i,i+2),16))*t)).join(',');
}
/**
 * The game's lighting look over the Basement light layer. A scene gives its rooms and its lights;
 * this keeps each shadowed light's visibility polygon and returns the layer's packets with the strength
 * to draw it at.
 *
 * Lights are the engine's declared lights (maps `declaredLight`) placed in the world:
 *  {id, position, shape: 'point' | 'strip', radius | size + round + soft, color, intensity, shadows, animation, lit}
 *  shadows 'dynamic' | 'static'  a fixture: shadowed (by walls, and with 'dynamic' by every body that
 *                                blocks light, a door leaf), a warm glow over its reach
 *  shadows 'none'                a pool of light with no shadow (a candle, a screen, a vending machine);
 *                                a strip is a rounded rectangle
 *  animation  steady, flicker (the light breathes at `rate`), pulse (1 ± `depth` at `rate` rad/s) or
 *             stutter (a faulty lamp: steady but for `burst` s every `period` s, dropping by `depth`)
 *  glow       its colour's strength against the look's (1 by default); `intensity: 0, glow: 1.5` colours
 *             the street without lifting the dark (a neon sign)
 *  look       a profile in the look's `profiles` for its cut and colour (a street lamp's pool)
 *  moving     it moves every frame (a shot, a car's headlight): never baked, its shape stamped or drawn live
 * The host adds its own lights the same way: a `beam` (a headlight: `rotation`, `length`, `width`,
 * `near_width`, shadowed by walls) and turned strips (a laser's line).
 * `lit` (0..1) is the room's light switch. Rooms: {rects, type: 'outdoor' | 'indoor', fill, lit}:
 * an outdoor room shows the sky's darkness, deepened at night by the look's `outdoor.deepen` so the lamps'
 * pools stand out of real dark; a room with `fill` is no darker than that while lit.
 *
 * A polygon is kept until its light moves or changes reach, or a light blocker in its reach changes
 * (the world's light revision). Stale shadows are rebuilt nearest the view first within
 * `look.lamp.shadow_budget_ms` a frame; one past the budget keeps its last shape for a frame, and one
 * off the tiles in view with no shape yet waits (one on them is always cast, so a tile in view is
 * painted whole, and a tile ahead is readied once its lights are all cast). A light goes back into the still pictures once its shadow has held for `look.lamp.settle` s.
 */
export class sceneLighting{
    #world;#polygons=new Map();#now;#spent=0;
    constructor(world,{look=LIGHTING,now=()=>performance.now()}={}){this.#world=world;this.look=look;this.#now=now;}
    /** The light's kept shadow, rebuilt when it is stale and the frame's shadow budget allows (a light with none yet is always built). */
    #polygon(light,time,urgent){
        const reach=light.radius??light.length,key=light.id??`${light.position}`,at=`${light.position[0]},${light.position[1]},${reach},${light.shadows}`,cached=this.#polygons.get(key);
        const query={origin:light.position,radius:reach,include_moving:light.shadows==='dynamic'},revision=this.#world.getLightRevision(query);
        if(cached?.at===at&&cached.revision===revision)return cached;
        if(this.#spent>=this.look.lamp.shadow_budget_ms){
            if(cached){cached.changed_at=time;return cached;}   // waits a frame with its last shape
            if(!urgent)return null;                              // one not yet in view waits for its first
        }
        const t0=this.#now(),next={at,revision,points:this.#world.getVisibilityPolygon({...query,resolution:this.look.lamp.resolution}).points,changed_at:cached?time:-Infinity};
        this.#spent+=this.#now()-t0;this.#polygons.set(key,next);return next;
    }
    #animate(l,time){
        const a=l.animation;
        if(a?.kind==='flicker')return this.look.flicker.floor+this.look.flicker.swing*Math.sin(time*a.rate+l.position[0]*.7)*Math.sin(time*a.rate*.37+l.position[1]);
        if(a?.kind==='pulse')return 1+a.depth*Math.sin(time*a.rate+phase(l.id));
        if(a?.kind==='stutter'){const t=(time+a.offset)%a.period;return t>a.burst||Math.sin(t*47)*Math.sin(t*23+1.3)<=.15?1:1-a.depth;}
        return 1;
    }
    /**
     * The layer's packets and the strength to draw it at. With `extent` (the map's {left, top, right,
     * bottom}) the still lights are baked into tiles of `tile_size` over it (the map's regions; the look's
     * `tile_size` by default), only those meeting `bounds` (the view), each repainted only when a light
     * reaching it changes (a room's switch, a lamp moved, a door come to rest); the rest are drawn live:
     * draw the packets with canvasRenderer.drawLayer and a pictureCache. Without it, every light is live.
     * The tiles within `ahead` of the view are readied too: px all round (the look's `tile_ahead`), or per-side
     * margins from the camera's motion (rendering `aheadOf`), so a moving view readies only what it is heading for.
     */
    createLayer({bounds,extent,tile_size=this.look.tile_size,ahead=this.look.tile_ahead,kind='indoor',sky_darkness=0,rooms=[],lights=[],time=0}){
        const look=this.look,ambient=look.indoor.darkness,base=kind==='indoor'?look.indoor.lamp_glow:look.outdoor.lamp_glow;
        // Outdoors at night the dark goes deeper than the sky's darkness, so the lamps' pools stand out of real dark.
        const deep=look.outdoor.deepen,night=kind==='indoor'?0:Math.max(0,Math.min(1,(sky_darkness-deep.from)/(deep.full-deep.from))),sky=Math.min(ambient,sky_darkness+deep.opacity*night);
        const areas=rooms.map(r=>({rects:r.rects,cut:r.type==='outdoor'?1-Math.min(1,sky/ambient):r.fill!==undefined?(1-Math.min(1,r.fill/ambient))*(r.lit??1):0}));
        // The lights to look at: those reaching the view, or (still) the tiles that meet it or are readied ahead of it, whole.
        const snap=(v,o,down)=>tile_size?o+(down?Math.floor:Math.ceil)((v-o)/tile_size)*tile_size:v;
        const grid=b=>b&&(extent?{left:snap(b.left,extent.left,true),top:snap(b.top,extent.top,true),right:snap(b.right,extent.left,false),bottom:snap(b.bottom,extent.top,false)}:b);
        const near=grid(bounds&&viewAhead(bounds,ahead)),shown=grid(bounds);   // (the tiles readied ahead, and the tiles drawn)
        const meets=(l,b)=>{const [x,y]=l.position,r=reachOf(l);return x+r>b.left&&x-r<b.right&&y+r>b.top&&y-r<b.bottom;};
        if(near)lights=lights.filter(l=>meets(l,near));
        const out=[],[cx,cy]=bounds?[(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2]:extent?[(extent.left+extent.right)/2,(extent.top+extent.bottom)/2]:[0,0];
        this.#spent=0;   // shadow rebuilds share one budget a frame, nearest the view first
        const order=lights.map((l,i)=>[l.shadows==='none'?Infinity:Math.hypot(l.position[0]-cx,l.position[1]-cy),i]).sort((a,b)=>a[0]-b[0]),shadows=new Map();
        for(const [d,i] of order){if(d===Infinity)break;const l=lights[i];if((l.lit??1)>=.01)shadows.set(i,this.#polygon(l,time,!bounds||meets(l,shown)));}
        const waiting=[];
        for(const [i,l] of lights.entries()){
            const lit=l.lit??1;if(lit<.01)continue;
            const f=this.#animate(l,time),steady=(l.animation?.kind??'steady')==='steady'&&!l.moving;
            if(l.shadows!=='none'){
                const shadow=shadows.get(i),r=reachOf(l);if(!shadow){waiting.push([l.position[0]-r,l.position[1]-r,l.position[0]+r,l.position[1]+r]);continue;}
                const k=(l.intensity??1)*lit*f,settled=time-shadow.changed_at>=look.lamp.settle,profile=look.profiles[l.look]??null;
                // A still lamp is baked (its colour too while its shadow moves); an animated one with a settled shadow is stamped; the rest cut live.
                const still=steady?(settled?true:'glow'):!l.moving&&settled?'stamp':false;
                if(still!==true&&bounds&&!meets(l,bounds))continue;
                const glow=(base+(profile?.glow_boost??0)*night)*Math.min(1,k)*(l.glow??1);
                if(l.shape==='beam'){out.push({still,shape:'beam',position:l.position,rotation:l.rotation,length:l.length,width:l.width,near_width:l.near_width,polygon:shadow.points,intensity:k,cut:look.beam.cut,color:l.color,glow,glow_stops:stops(look.beam.glow_stops,l.color)});continue;}
                out.push({still,position:l.position,radius:l.radius,inner_radius:look.lamp.inner_radius,polygon:shadow.points,intensity:k,cut:profile?.cut??look.lamp.cut,color:l.color,glow,glow_stops:stops(profile?.glow_stops??look.lamp.glow_stops,l.color)});continue;
            }
            if(!steady&&bounds&&!meets(l,bounds))continue;
            const still=steady?true:'stamp';   // (a shadowless light keeps its shape: animated or moving, it is stamped)
            const a=(l.intensity??look.soft.intensity)*f*lit,g=(l.glow??(l.intensity??look.soft.intensity))*f*lit,color=l.color??look.soft.color;
            if(l.shape==='strip')out.push({still,shape:'area',position:l.position,size:l.size,round:l.round,rotation:l.rotation??0,intensity:a,cut:l.soft?look.area.soft_cut:look.area.cut,color,glow:Math.min(1,look.area.glow*g),glow_stops:stops(look.area.glow_stops,color)});
            else out.push({still,position:l.position,radius:l.radius,intensity:a,cut:look.soft.cut,color,glow:Math.min(1,look.soft.glow*g),glow_stops:stops(look.soft.glow_stops,color)});
        }
        // Lamps cut first, then the soft lights, as the classic layer did.
        out.sort((a,b)=>(a.polygon?0:1)-(b.polygon?0:1));
        const live=out.filter(l=>l.still!==true).length;
        if(extent)return {packets:createLightLayerParts({extent,tint:look.indoor.tint,areas,lights:out,key:'scene_light',tile_size,view:bounds,ahead,waiting}),opacity:ambient,live};
        return {packets:createLightLayer({bounds,tint:look.indoor.tint,areas,lights:out}),opacity:ambient,live:out.length};
    }
}
/** A native level's lights: its lamps and the props that carry a light (their declared `emission`), and the layout's soft lights. */
export function levelLights(level,{blend=1,lightAt=()=>1}={}){
    const lights=[],place=(id,e,p,owner)=>{
        const x=p[0]+e.position[0],y=p[1]+e.position[1],lit=lightAt(x,y),kept=owner&&placed.get(owner);
        if(kept&&kept.e===e&&kept.x===x&&kept.y===y&&kept.lit===lit){lights.push(kept.light);return;}   // (a light that stayed put is the same object: nothing downstream is redone for it)
        const light={...e,id,position:[x,y],lit};if(owner)placed.set(owner,{e,x,y,lit,light});lights.push(light);
    };
    for(const lamp of level.lamps)place(lamp.data.authored_id,lamp.data.emission,lamp.getRenderState(blend,scratch).position,lamp);
    for(const prop of level.props)if(prop.data.emission&&prop.visible!==false)place(prop.data.authored_id,prop.data.emission,prop.getRenderState(blend,scratch).position,prop);
    (level.definition.soft_lights??[]).forEach((s,i)=>place(`soft_${i}`,declaredLight({...s,...(s.w?{size:[s.w,s.h]}:{}),shadows:'none'}),[s.x,s.y]));
    return lights;
}
const placed=new WeakMap(),scratch={};
/** How far a light reaches from its position, any way it points. */
function reachOf(l){return l.shape==='strip'?Math.hypot(l.size[0],l.size[1])/2:l.shape==='beam'?l.length:l.radius;}
/** A steady phase for a light's pulse from its id, so lights pulse out of step and keep their beat when pushed. */
function phase(id=''){let h=2166136261;for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/2**32*Math.PI*2;}
