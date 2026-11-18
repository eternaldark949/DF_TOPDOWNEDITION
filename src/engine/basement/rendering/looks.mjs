// ===== LV0 BASEMENT =====
// LOOKS: an object's art as data. An entity whose `drawing` asset names a drawing resource
// ({kind: 'drawing', steps}) is drawn every frame at its own pose, with the values in its `look`
// property ({values, scale, layer, depth, visible}). A step's `material` names a material resource
// ({kind: 'material', fill, stroke, ..., surface}). `fitBounds` turns a drawing into the collision
// shape that matches it, the way Blender's collision bounds are worked out from a mesh.
import {artScene,DRAWING,readValues} from './art.mjs';
import {heightView} from './height.mjs';

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
export function drawLook(scene,entity,source,blend=1,{view=null}={}){
    const drawing_id=entity.assets?.drawing;if(!drawing_id)return false;
    const look=entity.get('look',{});if(look.visible===false)return false;
    const drawing=resource(source,drawing_id,'drawing'),pose=entity.getRenderState(blend);
    const [wx,wy]=entity.world_scale??[1,1],k=look.scale??1;
    // Leaning toward the camera, a look stands in the plane of its base's elevation.
    if(view)scene.enter({matrix:view.plane(view.k(pose.elevation??0))});
    scene.draw(drawing.steps,{at:pose.position,rotation:pose.rotation,scale:[wx*k,wy*k],values:look.values??{},materials:name=>materialOf(source,qualifyResource(name,drawing_id))});
    if(view)scene.leave();
    return true;
}
/**
 * The steps of an entity's components, placed in the entity's own space, as one drawing: each layer a
 * group at its component's `at` and `rotation`. `solid_only` keeps the solid layers (for collision
 * bounds). A component on a rig joint is placed at rest, on the entity's origin.
 */
export function componentSteps(components,source,{solid_only=false}={}){
    const out=[];
    for(const c of components)for(const layer of c.layers)if(!solid_only||layer.solid)out.push({shape:'group',x:c.at[0],y:c.at[1],rotation:c.rotation,steps:layerSteps(layer,source)});
    return out;
}
/**
 * Draws an entity's components, one scene per visible layer, lowest first: [{height, depth, layer, component,
 * packets}]; `depth` is the height its packets sort by (its component's base when it draws whole).
 * Heights are z in the world. A component off a joint stands on the entity's base (its elevation); one on a joint stands on the joint, placed by `joints(name)` ({position, rotation, scale,
 * height, pitch} in the world), when it gives one. Either way a layer's `height` counts up from there. A
 * joint's pitch tips its bone out of the ground plane, so from above the component is shortened along
 * the bone by the pitch's cosine, and its `at` rises with the bone. Layers draw by their height in the
 * world, then layer number, then component order, so taller parts cover lower ones. Leaning toward the
 * camera, parts at one height draw farthest from the camera first, and a component set on the entity above
 * its base (a bottle on a tray) draws whole from that base, so a near bottle covers the foot of a far one.
 */
export function drawComponents(entity,source,blend=1,{joints=()=>null,view=null}={}){
    if(view!==null&&!(view instanceof heightView))throw new TypeError('A height view is a heightView or null');
    const components=entity.get('components')??[];if(!components.length)return [];
    const look=entity.get('look',{});if(look.visible===false)return [];
    const pose=entity.getRenderState(blend),scale=look.scale??1,[wx,wy,wz]=entity.world_scale??[1,1,1],values=look.values??{},elevation=pose.elevation??0,parts=[];
    for(const {component:c,layer,order} of listLayers(components)){
        // A joint's world pose carries the rig's scale (a taller rig, a scaled entity) and its height; off a joint the entity's scale and the look's apply.
        const joint=c.joint?joints(c.joint):null,base=joint??{position:pose.position,rotation:pose.rotation},pitch=joint?.pitch??0,fore=Math.cos(pitch);
        const size=joint?.scale?[joint.scale[0]*scale,joint.scale[1]*scale]:[wx*scale,wy*scale],kx=joint?fore:wx*scale,ky=joint?1:wy*scale;
        const cos=Math.cos(base.rotation),sin=Math.sin(base.rotation),x=c.at[0]*kx,y=c.at[1]*ky;
        const ground=joint?(joint.height??elevation)+c.at[0]*Math.sin(pitch)*wz:elevation,z0=ground+layer.height*wz,z1=ground+(layer.height+layer.thickness)*wz;
        parts.push({c,layer,order,z0,z1,fore,rise:joint?Math.sin(pitch)*size[0]*wz:0,place:{at:[base.position[0]+x*cos-y*sin,base.position[1]+x*sin+y*cos],rotation:base.rotation+c.rotation,scale:size}});
    }
    // Leaning, a component off a joint that stands above the entity's base is a thing set on it (a bottle on a
    // tray): it draws whole, its layers in height order, and things on one base draw farthest from the camera
    // first, so a near one covers the foot of a far one, as from the eye above. Parts rising from the base (a
    // building's floors) and parts on joints keep drawing layer by layer, by height, so they sort with the world.
    const base=new Map();for(const p of parts)if(!p.c.joint)base.set(p.c,Math.min(base.get(p.c)??Infinity,p.z0));
    const whole=p=>view&&!p.c.joint&&base.get(p.c)>elevation;
    for(const p of parts){const w=whole(p);p.key=w?base.get(p.c):p.z0;p.far=view?-Math.hypot(p.place.at[0]-view.camera[0],p.place.at[1]-view.camera[1]):0;p.then=w?[p.order,p.z0,p.layer.layer]:[p.layer.layer,p.order,0];}
    parts.sort((a,b)=>a.key-b.key||a.far-b.far||a.then[0]-b.then[0]||a.then[1]-b.then[1]||a.then[2]-b.then[2]);
    return parts.map(({c,layer,z0,z1,fore,rise,place,key})=>{
        // A tipped bone is drawn in the plane of its joint, but its far end is lower or higher: leaning toward
        // the camera, it slants on to where that end is drawn, so a hanging leg reaches its knee and its foot.
        const lean=view&&rise?boneLean(view,place,z1,rise):null;
        const scene=new artScene(),steps=fore===1&&!lean?layerSteps(layer,source):foreshorten(layerSteps(layer,source),fore,lean??[0,0]);
        // Leaning toward the camera: the walls from the layer's base to its top, then its shapes in the plane of its top.
        const materials=name=>materialOf(source,qualifyResource(name,layer.drawing??entity.template_id??name));
        // A layer with walls draws them at its base's depth and its top at its top's height, so wherever two
        // walls meet, every face goes under every top at that height and none stands taller than the other.
        // Among faces, the farthest from the camera goes first, so a near wall's face hides the end of one behind it.
        // A part drawn whole (a bottle on a tray) keeps its walls and top together at its base.
        let sides=[],top=key;
        if(view&&layer.sides&&z1>z0){sides=drawSides(steps,place,values,sidesPaint(layer.sides,values,materials),view,z0,z1);if(whole({c}))for(const packet of sides)packet.depth=0;else top=key+z1-z0;}
        if(view)scene.enter({matrix:view.plane(view.k(z1))});
        scene.draw(steps,{...place,values,materials});
        if(view)scene.leave();
        return {height:z0,depth:key,top,layer:layer.layer,component:c.name,sides,packets:scene.finish()};
    });
}
// Every visible layer with its component and the component's place in the list.
function listLayers(components){const out=[];components.forEach((component,order)=>{for(const layer of component.layers)if(layer.visible!==false)out.push({component,layer,order});});return out.sort((a,b)=>a.layer.height-b.layer.height||a.layer.layer-b.layer.layer||a.order-b.order);}
// A layer's sides paint: a colour, a "$look" value, or {material} (its fill, else its stroke).
function sidesPaint(sides,values,materials){if(typeof sides==='string')return readValues({fill:sides},values).fill;const m=materials(readValues({m:sides.material},values).m);return m.fill??m.stroke;}
/**
 * A layer's walls, seen from above: each face of the hull of its shapes that the camera sees, from the plane of
 * its base to the plane of its top. Returns their packets, each with a `depth` a hair under 0 that is lower the
 * farther its face's nearest point is from the camera, so faces at one height draw farthest first (the painter's
 * order for walls standing on one floor: a nearer face is never behind a farther one where they overlap).
 */
function drawSides(steps,{at,rotation,scale},values,fill,view,z0,z1){
    if(z1<=z0)return [];
    const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,points=drawingOutline([{shape:'group',x:at[0],y:at[1],rotation,scale:[sx,sy],steps}],{values}).flatMap(part=>part.points),hull=convexHull(points);
    if(hull.length<3)return [];
    const cx=hull.reduce((t,p)=>t+p[0],0)/hull.length,cy=hull.reduce((t,p)=>t+p[1],0)/hull.length,k0=view.k(z0),k1=view.k(z1),out=[];
    for(let i=0;i<hull.length;i++){
        const a=hull[i],b=hull[(i+1)%hull.length],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;let nx=b[1]-a[1],ny=a[0]-b[0];if(nx*(mx-cx)+ny*(my-cy)<0){nx=-nx;ny=-ny;}
        if(!view.sees({x1:a[0],y1:a[1],x2:b[0],y2:b[1],nx,ny}))continue;
        const [p,q,r,t]=[view.scaled(a[0],a[1],k0),view.scaled(b[0],b[1],k0),view.scaled(b[0],b[1],k1),view.scaled(a[0],a[1],k1)];
        const scene=new artScene();scene.fill([['move',...p],['line',...q],['line',...r],['line',...t],['close']],fill);
        const d=nearest(view.camera,a,b),depth=-1e-3*d/(d+1000);
        for(const packet of scene.finish())out.push({...packet,depth});
    }
    return out;
}
// How far a point is from the segment a–b.
function nearest([px,py],a,b){const ex=b[0]-a[0],ey=b[1]-a[1],L=ex*ex+ey*ey,t=L?Math.max(0,Math.min(1,((px-a[0])*ex+(py-a[1])*ey)/L)):0;return Math.hypot(a[0]+ex*t-px,a[1]+ey*t-py);}
/**
 * Steps seen along a tilted bone: every place along x (a step's x, from, to and points) is shortened by `k`,
 * the cosine of the bone's pitch, and slanted by `lean` ([x, y] per unit of x, for a leaning view), and every size is kept, because body parts are round: a leg pointing
 * straight down is seen from above as the circle at its end, not as a squashed sliver.
 */
export function foreshorten(steps,k,[lx,ly]=[0,0]){
    const p=v=>Array.isArray(v)&&v.length===2&&typeof v[0]==='number'&&typeof v[1]==='number'?[v[0]*(k+lx),v[1]+v[0]*ly]:v;
    return steps.map(step=>{const out={...step};
        if(typeof out.x==='number'){if(ly&&(out.y===undefined||typeof out.y==='number'))out.y=(out.y??0)+out.x*ly;out.x*=k+lx;}
        for(const key of ['from','to'])if(out[key]!==undefined)out[key]=p(out[key]);
        if(Array.isArray(out.points))out.points=out.points.map(p);if(out.shape==='group'&&Array.isArray(out.steps))out.steps=foreshorten(out.steps,k,[lx,ly]);return out;});
}
/**
 * How a tipped bone slants when the view leans: per unit along the bone, the extra offset (in the part's own
 * frame and scale) that carries a point from the plane of the joint's height to where its own height is
 * drawn. `rise` is the height gained per unit along the bone.
 */
function boneLean(view,{at,rotation,scale},z,rise){
    const k=view.k(z),d=(view.k(z+rise)-view.k(z-rise))/(2*k),[cx,cy]=view.camera,wx=(at[0]-cx)*d,wy=(at[1]-cy)*d;
    const cos=Math.cos(rotation),sin=Math.sin(rotation),[sx,sy]=typeof scale==='number'?[scale,scale]:scale;
    return [(wx*cos+wy*sin)/sx,(-wx*sin+wy*cos)/sy];
}
function layerSteps(layer,source){return layer.steps??resource(source,layer.drawing,'drawing').steps;}
// A material record, with a texture its paint repeats named in the material's own library when written bare.
const QUALIFIED=new WeakMap();
function materialOf(source,id){
    const m=resource(source,id,'material');let out=QUALIFIED.get(m);if(out)return out;
    const paint=p=>p&&typeof p==='object'&&p.type==='pattern'&&typeof p.texture==='string'?{...p,texture:qualifyResource(p.texture,id)}:p;
    out={...m,fill:paint(m.fill),stroke:paint(m.stroke)};if(m.fill===undefined)delete out.fill;if(m.stroke===undefined)delete out.stroke;QUALIFIED.set(m,out);return out;
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
        case 'limb':{const [r0,rb,r1]=step.radii,t=step.belly_at??.3,m=[step.from[0]+(step.to[0]-step.from[0])*t,step.from[1]+(step.to[1]-step.from[1])*t];return [...ring(...step.from,r0,r0),...ring(...m,rb,rb),...ring(...step.to,r1,r1)];}
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
