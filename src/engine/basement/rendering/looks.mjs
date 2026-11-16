// ===== LV0 BASEMENT =====
// LOOKS: an object's art as data. An entity whose `drawing` asset names a drawing resource
// ({kind: 'drawing', steps}) is drawn every frame at its own pose, with the values in its `look`
// property ({values, scale, layer, depth, visible}). A step's `material` names a material resource
// ({kind: 'material', fill, stroke, ..., surface}). `fitBounds` turns a drawing into the collision
// shape that matches it, the way Blender's collision bounds are worked out from a mesh.
import {artScene,DRAWING,readValues} from './art.mjs';

/** The collision bounds a drawing can be fitted to. */
export const BOUNDS=Object.freeze(['circle','box','capsule','hull']);
const UNSOLID=new Set(['glow','ground_shadow','text','line']);   // never solid unless a step says so
const SAMPLES=16;

/** The id of a material named in a drawing: a bare name is in the drawing's own library. */
export function qualifyResource(name,drawing_id){return name.includes(':')||!drawing_id.includes(':')?name:`${drawing_id.split(':')[0]}:${name}`;}

/**
 * Every outline point of a drawing in its own space, each tagged solid or not: [{points, solid}].
 * A step is solid when it says `solid: true`; when no step in the drawing says so, every shape but
 * glows, ground shadows, text and lines is.
 */
export function drawingOutline(steps,{values={}}={}){
    const out=[];let marked=false;
    const walk=(list,m)=>{
        if(!Array.isArray(list))throw new TypeError('A drawing is a list of steps');
        for(const raw of list){
            const step=readValues(raw,values),{shape}=step;
            if(shape==='group'){const {steps,x=0,y=0,rotation=0,scale=1}=step,[sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);
                walk(steps,compose(m,[c*sx,s*sx,-s*sy,c*sy,x,y]));continue;}
            if(!DRAWING[shape])throw new TypeError(`Unknown drawing shape: ${shape}`);
            if(step.solid===true)marked=true;
            out.push({points:outline(step).map(p=>apply(m,p)),solid:step.solid,shape});
        }
    };
    walk(steps,[1,0,0,1,0,0]);
    return out.map(({points,solid,shape})=>({points,solid:marked?solid===true:solid!==false&&!UNSOLID.has(shape)}));
}

/**
 * The collision shape that fits a drawing: `bounds` is circle, box, capsule or hull. It reads only the
 * drawing's solid steps, at rest, once. Returns a collision_shape packet for the physics body.
 */
export function fitBounds(steps,bounds,{values={}}={}){
    if(!BOUNDS.includes(bounds))throw new TypeError(`Collision bounds are ${BOUNDS.join(', ')}`);
    const points=drawingOutline(steps,{values}).filter(part=>part.solid).flatMap(part=>part.points);
    if(!points.length)throw new TypeError('The drawing has no solid steps to fit bounds to');
    return fit(points,bounds);
}
/** A circle round everything the drawing paints, glows included: what the camera must see to draw it. */
export function drawingReach(steps,{values={}}={}){
    const points=drawingOutline(steps,{values}).flatMap(part=>part.points);
    if(!points.length)throw new TypeError('The drawing paints nothing');
    return fit(points,'circle');
}

/**
 * Draws one entity's look into `scene` at its render pose, or does nothing when it has none. The
 * drawing and its materials are read from `source` (the world's data source).
 */
export function drawLook(scene,entity,source,blend=1){
    const drawing_id=entity.assets?.drawing;if(!drawing_id)return false;
    const look=entity.get('look',{});if(look.visible===false)return false;
    const drawing=resource(source,drawing_id,'drawing'),pose=entity.getRenderState(blend);
    scene.draw(drawing.steps,{at:pose.position,rotation:pose.rotation,scale:look.scale??1,values:look.values??{},materials:name=>resource(source,qualifyResource(name,drawing_id),'material')});
    return true;
}
function resource(source,id,kind){const value=source.getResource(id);if(value.kind!==kind)throw new TypeError(`${id} is a ${value.kind}, not a ${kind}`);return value;}

// ----- Geometry -------------------------------------------------------------------------------------
const compose=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const apply=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const ring=(x,y,rx,ry,turn=0)=>Array.from({length:SAMPLES},(_,i)=>{const a=i/SAMPLES*Math.PI*2,c=Math.cos(turn),s=Math.sin(turn),px=Math.cos(a)*rx,py=Math.sin(a)*ry;return [x+px*c-py*s,y+px*s+py*c];});
function outline(step){
    const {shape,x=0,y=0}=step;
    switch(shape){
        case 'rectangle':return [[x,y],[x+step.width,y],[x+step.width,y+step.height],[x,y+step.height]];
        case 'circle':return ring(x,y,step.radius,step.radius);
        case 'ellipse':return ring(x,y,step.radius_x,step.radius_y,step.rotation??0);
        case 'capsule':return [...ring(...step.from,step.radius,step.radius),...ring(...step.to,step.radius,step.radius)];
        case 'line':case 'polygon':case 'curve':return step.points.map(p=>[...p]);
        case 'glow':return ring(x,y,step.radius,step.radius);
        case 'ground_shadow':return ring(x,y,step.radius_x,step.radius_y);
        case 'text':{const size=step.size??16,w=String(step.text).length*size*.6;return [[x,y-size],[x+w,y-size],[x+w,y],[x,y]];}
    }
    return [];
}
function fit(points,bounds){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const centre=[(left+right)/2,(top+bottom)/2],w=right-left,h=bottom-top;
    const circle=()=>({shape_type:'circle',radius:Math.max(1e-6,...points.map(([x,y])=>Math.hypot(x-centre[0],y-centre[1]))),local_position:centre});
    if(bounds==='circle')return circle();
    if(bounds==='box')return w>0&&h>0?{shape_type:'box',dimensions:[w,h],local_position:centre}:circle();
    if(bounds==='capsule'){
        const r=Math.min(w,h)/2,half=Math.max(w,h)/2-r;if(!(r>0)||half<1e-6)return circle();
        const [cx,cy]=centre;return {shape_type:'capsule',radius:r,points:w>=h?[[cx-half,cy],[cx+half,cy]]:[[cx,cy-half],[cx,cy+half]]};
    }
    const hull=convexHull(points);return hull.length>=3?{shape_type:'polygon',points:hull}:circle();
}
/** The convex hull, counter-clockwise, with no three points in a line. */
function convexHull(points){
    const p=[...new Map(points.map(q=>[`${q[0].toFixed(6)},${q[1].toFixed(6)}`,q])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    if(p.length<3)return p;
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),half=list=>{const out=[];for(const q of list){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],q)<=1e-9)out.pop();out.push(q);}out.pop();return out;};
    return [...half(p),...half([...p].reverse())];
}
