import LIGHTING from '../data/game-lighting.json' with {type:'json'};
import {createLightLayer,createLightLayerParts} from '../../engine/basement/rendering/index.mjs';
import {declaredLight} from '../../engine/basement/maps/index.mjs';
export {LIGHTING};
const stops=(list,color)=>list.map(([o,c])=>[o,c==='$color'?color:c]);
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
 *  animation  steady, flicker (the light breathes at `rate`) or pulse (1 ± `depth` at `rate` rad/s)
 * `lit` (0..1) is the room's light switch. Rooms: {rects, type: 'outdoor' | 'indoor', fill, lit}:
 * an outdoor room shows the sky's darkness, a room with `fill` is no darker than that while lit.
 *
 * A polygon is kept until its light moves or changes reach, or (dynamic shadows) a blocker in reach
 * moves; a light stays a still picture once its blockers have been at rest for `look.lamp.settle` s.
 */
export class sceneLighting{
    #world;#polygons=new Map();
    constructor(world,{look=LIGHTING}={}){this.#world=world;this.look=look;}
    #polygon(light,time){
        const key=light.id??`${light.position}`,at=`${light.position[0]},${light.position[1]},${light.radius},${light.shadows}`,cached=this.#polygons.get(key);
        const query={origin:light.position,radius:light.radius,include_moving:light.shadows==='dynamic'};
        if(cached?.at===at&&(!query.include_moving||same(cached.moving,this.#world.getMovingLightBlockers(query))))return cached;
        const {points,moving}=this.#world.getVisibilityPolygon({...query,resolution:this.look.lamp.resolution});
        const next={at,points,moving,changed_at:cached?time:-Infinity};this.#polygons.set(key,next);return next;
    }
    #animate(l,time){
        const a=l.animation;
        if(a?.kind==='flicker')return this.look.flicker.floor+this.look.flicker.swing*Math.sin(time*a.rate+l.position[0]*.7)*Math.sin(time*a.rate*.37+l.position[1]);
        if(a?.kind==='pulse')return 1+a.depth*Math.sin(time*a.rate+phase(l.id));
        return 1;
    }
    /**
     * The layer's packets and the strength to draw it at. With `extent` (the map's {left, top, right,
     * bottom}) the lamps and the steady soft lights are kept as pictures over it, repainted only when one
     * of them changes (a room's switch, a lamp moved), and only flickering lights are drawn live: draw the
     * packets with canvasRenderer.drawLayer and a pictureCache. Without it, every light is drawn live.
     */
    createLayer({bounds,extent,kind='indoor',sky_darkness=0,rooms=[],lights=[],time=0}){
        const look=this.look,ambient=look.indoor.darkness,base=kind==='indoor'?look.indoor.lamp_glow:look.outdoor.lamp_glow;
        const areas=rooms.map(r=>({rects:r.rects,cut:r.type==='outdoor'?1-Math.min(1,sky_darkness/ambient):r.fill!==undefined?(1-Math.min(1,r.fill/ambient))*(r.lit??1):0}));
        const out=[];
        for(const l of lights){
            const lit=l.lit??1;if(lit<.01)continue;
            const f=this.#animate(l,time),steady=(l.animation?.kind??'steady')==='steady';
            if(l.shadows!=='none'){
                const shadow=this.#polygon(l,time),k=(l.intensity??1)*lit*f,still=steady&&time-shadow.changed_at>=look.lamp.settle;
                out.push({still,position:l.position,radius:l.radius,inner_radius:look.lamp.inner_radius,polygon:shadow.points,intensity:k,cut:look.lamp.cut,color:l.color,glow:base*Math.min(1,k),glow_stops:stops(look.lamp.glow_stops,l.color)});continue;
            }
            const a=(l.intensity??look.soft.intensity)*f*lit,color=l.color??look.soft.color;
            if(l.shape==='strip')out.push({still:steady,shape:'area',position:l.position,size:l.size,round:l.round,intensity:a,cut:l.soft?look.area.soft_cut:look.area.cut,color,glow:Math.min(1,look.area.glow*a),glow_stops:stops(look.area.glow_stops,color)});
            else out.push({still:steady,position:l.position,radius:l.radius,intensity:a,cut:look.soft.cut,color,glow:Math.min(1,look.soft.glow*a),glow_stops:stops(look.soft.glow_stops,color)});
        }
        // Lamps cut first, then the soft lights, as the classic layer did.
        out.sort((a,b)=>(a.polygon?0:1)-(b.polygon?0:1));
        if(extent)return {packets:createLightLayerParts({extent,tint:look.indoor.tint,areas,lights:out,key:'scene_light'}),opacity:ambient};
        return {packets:createLightLayer({bounds,tint:look.indoor.tint,areas,lights:out}),opacity:ambient};
    }
}
/** A native level's lights: its lamps and the props that carry a light (their declared `emission`), and the layout's soft lights. */
export function levelLights(level,{blend=1,lightAt=()=>1}={}){
    const lights=[],place=(id,e,p)=>{const at=[p[0]+e.position[0],p[1]+e.position[1]];lights.push({...e,id,position:at,lit:lightAt(...at)});};
    for(const lamp of level.lamps)place(lamp.data.authored_id,lamp.data.emission,lamp.getRenderState(blend).position);
    for(const prop of level.props)if(prop.data.emission&&prop.visible!==false)place(prop.data.authored_id,prop.data.emission,prop.getRenderState(blend).position);
    (level.definition.soft_lights??[]).forEach((s,i)=>place(`soft_${i}`,declaredLight({...s,...(s.w?{size:[s.w,s.h]}:{}),shadows:'none'}),[s.x,s.y]));
    return lights;
}
const same=(a,b)=>a.length===b.length&&a.every((m,i)=>m.body_id===b[i].body_id&&m.rotation===b[i].rotation&&m.position[0]===b[i].position[0]&&m.position[1]===b[i].position[1]);
/** A steady phase for a light's pulse from its id, so lights pulse out of step and keep their beat when pushed. */
function phase(id=''){let h=2166136261;for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/2**32*Math.PI*2;}
