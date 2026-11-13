import LIGHTING from '../data/game-lighting.json' with {type:'json'};
import {createLightLayer} from '../../engine/basement/rendering/index.mjs';
export {LIGHTING};
const stops=(list,color)=>list.map(([o,c])=>[o,c==='$color'?color:c]);
/**
 * The game's lighting look over the Basement light layer. A scene gives its rooms and its lights;
 * this keeps each shadowed lamp's visibility polygon (rebuilt only when the lamp moves or changes
 * reach) and returns the layer's packets with the strength to draw it at.
 *
 * Lights: {id, kind: 'lamp' | 'soft', position, radius | size + round + soft, color, intensity, flicker, lit}
 *  lamp  a fixture: shadowed by walls, a warm glow over its reach
 *  soft  a pool of light with no shadow (a candle, a screen, sun through a window); with `size` it is a
 *        rounded strip. `flicker` (rad/s) makes it breathe.
 * `lit` (0..1) is the room's light switch. Rooms: {rects, type: 'outdoor' | 'indoor', fill, lit}:
 * an outdoor room shows the sky's darkness, a room with `fill` is no darker than that while lit.
 */
export class sceneLighting{
    #world;#polygons=new Map();
    constructor(world,{look=LIGHTING}={}){this.#world=world;this.look=look;}
    #polygon(light){
        const key=light.id??`${light.position}`,at=`${light.position[0]},${light.position[1]},${light.radius}`,cached=this.#polygons.get(key);
        if(cached?.at===at)return cached.points;
        const points=this.#world.getVisibilityPolygon({origin:light.position,radius:light.radius,resolution:this.look.lamp.resolution}).points;
        this.#polygons.set(key,{at,points});return points;
    }
    createLayer({bounds,kind='indoor',sky_darkness=0,rooms=[],lights=[],time=0}){
        const look=this.look,ambient=look.indoor.darkness,base=kind==='indoor'?look.indoor.lamp_glow:look.outdoor.lamp_glow;
        const areas=rooms.map(r=>({rects:r.rects,cut:r.type==='outdoor'?1-Math.min(1,sky_darkness/ambient):r.fill!==undefined?(1-Math.min(1,r.fill/ambient))*(r.lit??1):0}));
        const out=[];
        for(const l of lights){
            const lit=l.lit??1;if(lit<.01)continue;
            if(l.kind==='lamp'){const k=(l.intensity??1)*lit;out.push({position:l.position,radius:l.radius,inner_radius:look.lamp.inner_radius,polygon:this.#polygon(l),intensity:k,cut:look.lamp.cut,color:l.color,glow:base*Math.min(1,k),glow_stops:stops(look.lamp.glow_stops,l.color)});continue;}
            const f=l.flicker?look.flicker.floor+look.flicker.swing*Math.sin(time*l.flicker+l.position[0]*.7)*Math.sin(time*l.flicker*.37+l.position[1]):1;
            const a=(l.intensity??look.soft.intensity)*f*lit,color=l.color??look.soft.color;
            if(l.size)out.push({shape:'area',position:l.position,size:l.size,round:l.round,intensity:a,cut:l.soft?look.area.soft_cut:look.area.cut,color,glow:Math.min(1,look.area.glow*a),glow_stops:stops(look.area.glow_stops,color)});
            else out.push({position:l.position,radius:l.radius,intensity:a,cut:look.soft.cut,color,glow:Math.min(1,look.soft.glow*a),glow_stops:stops(look.soft.glow_stops,color)});
        }
        // Lamps cut first, then the soft lights, as the classic layer did.
        out.sort((a,b)=>(a.polygon?0:1)-(b.polygon?0:1));
        return {packets:createLightLayer({bounds,tint:look.indoor.tint,areas,lights:out}),opacity:ambient};
    }
}
/** A native level's lights: its lamps, the props that carry a light, and the layout's soft lights. */
export function levelLights(level,{blend=1,lightAt=()=>1}={}){
    const lights=[],reach=body=>{const b=level.physics.getBodyBounds(body,{bounds_type:'light'});return (b.right-b.left)/2;};
    for(const lamp of level.lamps){const a=lamp.data.appearance??{},p=lamp.getRenderState(blend).position;lights.push({id:lamp.data.authored_id,kind:'lamp',position:[...p],radius:reach(lamp),color:a.color,intensity:a.intensity??1,lit:lightAt(...p)});}
    for(const prop of level.props){
        const e=prop.data.emission;if(!e||prop.visible===false)continue;
        const p=prop.getRenderState(blend).position,at=[p[0]+(e.position?.[0]??0),p[1]+(e.position?.[1]??0)],soft=prop.data.appearance?.light;
        lights.push(soft?{id:prop.data.authored_id,kind:'soft',position:at,radius:e.radius,color:soft.color,intensity:soft.intensity,flicker:soft.flicker,lit:lightAt(...at)}
            :{id:prop.data.authored_id,kind:'lamp',position:at,radius:e.radius,color:e.color,lit:lightAt(...at)});
    }
    (level.definition.soft_lights??[]).forEach((s,i)=>lights.push({id:`soft_${i}`,kind:'soft',position:[s.x,s.y],...(s.w?{size:[s.w,s.h],round:s.round,soft:!!s.soft}:{radius:s.radius}),color:s.color,intensity:s.intensity,flicker:s.flicker,lit:lightAt(s.x,s.y)}));
    return lights;
}
