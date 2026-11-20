// ===== LV0 BASEMENT =====
// LOOKS: an object's art as data. An entity whose `drawing` asset names a drawing resource
// ({kind: 'drawing', steps}) is drawn every frame at its own pose, with the values in its `look`
// property ({values, scale, layer, depth, visible}). A step's `material` names a material resource
// ({kind: 'material', fill, stroke, ..., surface}). `fitBounds` turns a drawing into the collision
// shape that matches it, the way Blender's collision bounds are worked out from a mesh.
import {artScene,DRAWING,readValues,readEmits} from './art.mjs';
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
export function drawingOutline(steps,{values={},fine=false}={}){
    const out=[];let marked=false;
    const walk=(list,m)=>{
        if(!Array.isArray(list))throw new TypeError('A drawing is a list of steps');
        for(const raw of list){
            const step=readValues(raw,values),{shape}=step;
            if(shape==='group'){const {steps,x=0,y=0,rotation=0,scale=1}=step,[sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);
                walk(steps,compose(m,[c*sx,s*sx,-s*sy,c*sy,x,y]));continue;}
            if(!DRAWING[shape])throw new TypeError(`Unknown drawing shape: ${shape}`);
            if(step.solid===true)marked=true;
            out.push({points:outline(step,fine).map(p=>apply(m,p)),solid:step.solid,shape});
        }
    };
    walk(steps,[1,0,0,1,0,0]);
    return out.map(({points,solid,shape})=>({points,solid:marked?solid===true:solid!==false&&!UNSOLID.has(shape)}));
}

/**
 * The steps of a drawing that glow (`emits` on the step, or on the material it names), each as
 * `{outline, open, width, bounds, color, strength, reach, height}` through `at`, `rotation` and `scale`:
 * `outline` the shape's points (a convex ring, or a polygon's own points), `open` true for a line (lit
 * along it, `width` across), `bounds` [left, top, right, bottom], `color` '#rrggbb' (the emits colour,
 * else the step's fill, else its stroke, else white), and the emits strength, reach and height (plus
 * `elevation` when given). `materials(name)` gives a material record. One list feeds the light grid
 * and the reflections, so a glowing step is marked once.
 */
export function drawingEmitters(steps,{at=[0,0],rotation=0,scale=1,values={},materials=null,elevation=0}={}){
    const out=[],[sx0,sy0]=typeof scale==='number'?[scale,scale]:scale,c0=Math.cos(rotation),s0=Math.sin(rotation);
    const walk=(list,m)=>{
        if(!Array.isArray(list))throw new TypeError('A drawing is a list of steps');
        for(const raw of list){
            const step=readValues(raw,values),{shape}=step;
            if(shape==='group'){const {steps,x=0,y=0,rotation=0,scale=1}=step,[sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);
                walk(steps,compose(m,[c*sx,s*sx,-s*sy,c*sy,x,y]));continue;}
            const record=step.material!==undefined&&materials?materials(step.material):null;
            const emits=readEmits(step.emits!==undefined?step.emits:record?.emits??null,`${shape} emits`);if(!emits||emits.strength<=0)continue;
            const fill=step.fill??record?.fill,stroke=step.stroke??record?.stroke,hex=v=>typeof v!=='string'?null:/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():/^#[0-9a-f]{3}$/i.test(v)?'#'+[...v.slice(1).toLowerCase()].map(d=>d+d).join(''):null;
            const open=shape==='line',k=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
            const local=outline(step),points=(open||shape==='polygon'||shape==='curve'?local:convexHull(local)).map(p=>apply(m,p));
            const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),width=open?(step.line_width??record?.line_width??1)*k:0;
            out.push({outline:points,open,width,bounds:[Math.min(...xs)-width/2,Math.min(...ys)-width/2,Math.max(...xs)+width/2,Math.max(...ys)+width/2],
                color:hex(emits.color)??hex(fill)??hex(stroke)??'#ffffff',strength:emits.strength,reach:emits.reach*k,height:emits.height+elevation});
        }
    };
    walk(steps,[c0*sx0,s0*sx0,-s0*sy0,c0*sy0,at[0],at[1]]);
    return out;
}

/**
 * The lit windows of a layer's facade as glowing shapes, for the light grid and the reflections: one per bay
 * of each wall whose panels say `emits` and have windows lit there, a short line along the bay a hair outside
 * the wall, at the mean height of its lit windows (from `z0`, the layer's base) and as strong as `emits.strength`
 * times how many are lit. The same windows are lit as the facade draws. `place` is {at, rotation, scale} as
 * the layer is drawn, `z1` its top. `color` is the emits colour, else the panel's lit fill.
 */
export function facadeEmitters(steps,facade,{at=[0,0],rotation=0,scale=1}={},values={},z0=0,z1=0,{follow='shapes',scale:vs=1}={}){
    if(!facade||!(z1>z0))return [];
    const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);
    const panels=(facade.panels??[]).map((p,k)=>({k,emits:readEmits(p.emits??null,`facade panel ${k} emits`)})).filter(p=>p.emits&&p.emits.strength>0);
    if(!panels.length)return [];
    const art=facadeArt(facade,values,Math.sqrt(Math.abs(sx*sy)),vs,z1-z0),where=`${at[0]},${at[1]},${rotation},${sx},${sy}`,out=[];
    const place=([x,y])=>{const px=x*sx,py=y*sy;return [at[0]+px*c-py*s,at[1]+px*s+py*c];},flip=sx*sy<0;
    const hex=v=>typeof v!=='string'?null:/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():/^#[0-9a-f]{3}$/i.test(v)?'#'+[...v.slice(1).toLowerCase()].map(d=>d+d).join(''):null;
    for(const loop of sideLoops(steps,values,follow)){
        const pts=loop.map(place),n=pts.length,plan=facadePlan(loop,where,pts,art),{storeys}=art;
        // a point s along wall W, and the wall's outward normal there
        const onWall=(W,s)=>{if(W.closed)s=((s%W.length)+W.length)%W.length;let f=W.facets[0];for(const g of W.facets)if(plan.facet[g].s0<=s)f=g;
            const F=plan.facet[f],t=Math.max(0,Math.min(1,(s-F.s0)/((F.s1-F.s0)||1))),p=pts[f],q=pts[(f+1)%n],L=Math.hypot(q[0]-p[0],q[1]-p[1])||1;
            let nx=(q[1]-p[1])/L,ny=-(q[0]-p[0])/L;if(flip){nx=-nx;ny=-ny;}return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,nx,ny];};
        for(const W of plan.walls){
            if(!W.count)continue;
            for(let b=0;b<W.count;b++){
                const mid=W.margin+(b+.5)*W.bay;
                for(const {k,emits} of panels){
                    const panel=art.panels[k];if((panel.shapes&&!panel.lit_shapes&&!panel.lit_fill)||!(panel.lit>0))continue;
                    let lit=0,zs=0;
                    for(let r=0;r<storeys.count;r++){
                        if(panel.storeys&&!panel.storeys.includes(r)&&!panel.storeys.includes(r-storeys.count))continue;
                        if(!((panel.lit_fill||panel.lit_shapes)&&hash(W.key,b,r,k,art.seed)<panel.lit))continue;
                        const za=storeys.base+r*storeys.height+panel.at,zb=za+(panel.height??storeys.height-panel.at);lit++;zs+=(za+zb)/2;
                    }
                    if(!lit)continue;
                    const half=Math.min(panel.width,W.bay)/2,[ax,ay,nx,ny]=onWall(W,mid-half),[bx,by,mx,my]=onWall(W,mid+half),o=1.5;
                    const outline=[[ax+nx*o,ay+ny*o],[bx+mx*o,by+my*o]],width=1;
                    out.push({outline,open:true,width,bounds:[Math.min(outline[0][0],outline[1][0])-width/2,Math.min(outline[0][1],outline[1][1])-width/2,Math.max(outline[0][0],outline[1][0])+width/2,Math.max(outline[0][1],outline[1][1])+width/2],
                        color:hex(emits.color)??hex(panel.lit_fill)??'#ffffff',strength:emits.strength*lit,reach:emits.reach,height:emits.height+z0+zs/lit});
                }
            }
        }
    }
    return out;
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
export function drawComponents(entity,source,blend=1,{joints=()=>null,view=null,mirror=null,pictures=false,screen=null,shines=false,covers=null}={}){
    if(view!==null&&!(view instanceof heightView))throw new TypeError('A height view is a heightView or null');
    if(mirror!==null&&!(Number.isFinite(mirror)&&mirror>=0))throw new TypeError('A mirror is how far a reflection falls per unit of height, 0 or more');
    // A reflection: each part where it falls, in the plane of its depth below the floor (k(-z)) and `mirror` × its height down the world's y.
    const below=mirror!==null?view:null;if(mirror!==null)view=null;
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
        // what the screen cannot show at all is not drawn: a still part whose box, leaning from its base to its top, misses it
        if(screen?.bounds&&view&&!c.joint&&offScreen(layerSteps(layer,source),values,place,view,z0,z1,screen.bounds))return null;
        const scene=new artScene(),steps=fore===1&&!lean?layerSteps(layer,source):foreshorten(layerSteps(layer,source),fore,lean??[0,0]);
        // Leaning toward the camera: the walls from the layer's base to its top, then its shapes in the plane of its top.
        const materials=name=>materialOf(source,qualifyResource(name,layer.drawing??entity.template_id??name));
        // A layer with walls draws them at its base's depth and its top at its top's height, so wherever two
        // walls meet, every face goes under every top at that height and none stands taller than the other.
        // Among faces, the farthest from the camera goes first, so a near wall's face hides the end of one behind it.
        // A part drawn whole (a bottle on a tray) keeps its walls and top together at its base.
        let sides=[],top=key;
        if(view&&layer.sides&&z1>z0){sides=drawSides(steps,place,values,sidesPaint(layer.sides,values,materials),view,z0,z1,{...layer.sides,facade:layer.facade,scale:layer.thickness>0?(z1-z0)/layer.thickness:1,screen,shines});if(whole({c}))for(const packet of sides)packet.depth=0;else top=key+z1-z0;}
        // with `covers` (a height), a walled part whose top stands over it gives its silhouette too: where the night comes back over the light on the ground
        const cover=covers!==null&&view&&layer.sides&&z1>covers&&!c.joint&&!lean?coverOf(steps,place,values,layer.sides.follow??'shapes',view,z0,z1):null;
        if(mirror!==null&&layer.sides&&z1>z0)sides=mirrorSides(steps,place,values,sidesPaint(layer.sides,values,materials),mirror,z0,z1,below);
        // A still layer (not on a tipped bone) is the same art wherever it stands: with `pictures` it is drawn once
        // into a picture, keyed by its steps and look, and stamped each frame under its place and its plane.
        // (with `shines`, a layer with glowing steps is drawn each frame, so they are found among its packets)
        if(pictures&&mirror===null&&fore===1&&!lean&&!(shines&&glowing(steps,materials))){
            const art=stillArt(steps,values,materials);
            if(art){const m=placeMatrix(place),matrix=view?compose(view.plane(view.k(z1)),m):m;
                return {height:z0,peak:z1,depth:key,top,layer:layer.layer,component:c.name,sides,cover,packets:[],picture:{key:art.key,bounds:art.bounds,matrix,build:art.build}};}
        }
        if(view)scene.enter({matrix:view.plane(view.k(z1))});
        else if(mirror!==null)scene.enter({matrix:fallen(below,mirror,z1)});
        scene.mark_shines=shines;scene.draw(steps,{...place,values,materials});
        if(view||mirror!==null)scene.leave();
        return {height:z0,peak:z1,depth:key,top,layer:layer.layer,component:c.name,sides,cover,packets:scene.finish()};
    }).filter(Boolean);
}
// A drawing's box in its own frame [left, top, right, bottom], once per steps and look values (null when it paints nothing).
const BOXES=new WeakMap();
function localBox(steps,values){
    let byValues=BOXES.get(steps);if(!byValues)BOXES.set(steps,byValues=new WeakMap());
    const key=values&&typeof values==='object'&&Object.keys(values).length?values:EMPTY;if(byValues.has(key))return byValues.get(key);   // (no values: one key, though each frame may give a fresh {})
    let box=null;try{const pts=drawingOutline(steps,{values}).flatMap(p=>p.points);if(pts.length){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);box=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}}catch{box=null;}
    byValues.set(key,box);return box;
}
// Whether a part placed at `place`, standing from z0 to z1, is drawn wholly off the screen's bounds (a margin kept for strokes and shading).
function offScreen(steps,values,{at,rotation,scale},view,z0,z1,B,pad=16){
    const box=localBox(steps,values);if(!box)return false;
    const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);
    let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
    for(const k of [view.k(z0),view.k(z1)])for(const [x,y] of [[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]]){
        const px=x*sx,py=y*sy,[X,Y]=view.scaled(at[0]+px*c-py*s,at[1]+px*s+py*c,k);if(X<l)l=X;if(X>r)r=X;if(Y<t)t=Y;if(Y>b)b=Y;}
    return r<B.left-pad||l>B.right+pad||b<B.top-pad||t>B.bottom+pad;
}
/**
 * What of an entity stands taller than `above`, leaning as `view` draws it: one fill packet per walled layer
 * (a layer with `sides`) whose top is over `above`, covering its top and every wall from its base up, as one
 * shape. The light layer lays the night back over these (its `covers`), so light on the ground (a street lamp,
 * a lit window's glow) does not show on a roof that leans over it. `paint` fills them.
 */
export function componentCovers(entity,source,view,{blend=1,above=24,paint='#ffffff'}={}){
    if(!(view instanceof heightView))throw new TypeError('Covers lean: give a heightView');
    const components=entity.get('components')??[];if(!components.length)return [];
    const look=entity.get('look',{});if(look.visible===false)return [];
    const pose=entity.getRenderState(blend),scale=look.scale??1,[wx,wy,wz]=entity.world_scale??[1,1,1],values=look.values??{},elevation=pose.elevation??0,out=[];
    const cos=Math.cos(pose.rotation),sin=Math.sin(pose.rotation);
    for(const {component:c,layer} of listLayers(components)){
        if(c.joint||!layer.sides)continue;
        const z0=elevation+layer.height*wz,z1=elevation+(layer.height+layer.thickness)*wz;if(!(z1>above))continue;
        const x=c.at[0]*wx*scale,y=c.at[1]*wy*scale,at=[pose.position[0]+x*cos-y*sin,pose.position[1]+x*sin+y*cos],r=pose.rotation+c.rotation,sx=wx*scale,sy=wy*scale;
        const cover=coverOf(layerSteps(layer,source),{at,rotation:r,scale:[sx,sy]},values,layer.sides.follow??'shapes',view,z0,z1,paint);if(cover)out.push(cover);
    }
    return out;
}
// One walled layer's silhouette, leaning: its top and every wall from base to top, as one fill packet (or null).
function coverOf(steps,{at,rotation,scale},values,follow,view,z0,z1,paint='#ffffff'){
    const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,cr=Math.cos(rotation),sr=Math.sin(rotation);
    const place=([u,v])=>{const px=u*sx,py=v*sy;return [at[0]+px*cr-py*sr,at[1]+px*sr+py*cr];};
    const k0=view.k(z0),k1=view.k(z1),path=[];
    for(const loop of sideLoops(steps,values,follow)){
        const pts=loop.map(place),n=pts.length,lo=pts.map(([px,py])=>view.scaled(px,py,k0)),hi=pts.map(([px,py])=>view.scaled(px,py,k1));
        // the top and each wall as a quad, all wound one way, so the nonzero fill joins them
        const ring=r=>{if(signedArea(r)<0)r=[...r].reverse();r.forEach(([px,py],j)=>path.push([j?'line':'move',px,py]));path.push(['close']);};
        ring(hi);for(let m=0;m<n;m++){const q=(m+1)%n;ring([lo[m],lo[q],hi[q],hi[m]]);}
    }
    if(!path.length)return null;
    const scene=new artScene();scene.fill(path,paint);return scene.finish()[0];
}
// Whether a drawing has a glowing step (`emits` on it or its material), once per steps list.
const GLOWING=new WeakMap();
function glowing(steps,materials){
    let v=GLOWING.get(steps);if(v!==undefined)return v;
    const walk=list=>list.some(st=>st?.shape==='group'?Array.isArray(st.steps)&&walk(st.steps):st?.emits!==undefined&&st.emits!==false||(typeof st?.material==='string'&&!!materials(st.material)?.emits));
    v=Array.isArray(steps)&&walk(steps);GLOWING.set(steps,v);return v;
}
// Every visible layer with its component and the component's place in the list.
function listLayers(components){const out=[];components.forEach((component,order)=>{for(const layer of component.layers)if(layer.visible!==false)out.push({component,layer,order});});return out.sort((a,b)=>a.layer.height-b.layer.height||a.layer.layer-b.layer.layer||a.order-b.order);}
// A layer's sides paint: a colour, a "$look" value, or {material} (its fill, else its stroke).
function sidesPaint(sides,values,materials){if(typeof sides==='string')return readValues({fill:sides},values).fill;const m=materials(readValues({m:sides.material},values).m);return m.fill??m.stroke;}
/**
 * A layer's walls, seen from above: from the plane of its base to the plane of its top, each face the camera sees.
 * By default every solid shape stands on its own true outline: a rounded rectangle rounds its corners, a circle or
 * an arc is faceted finely enough to read as a curve, and a hollow shape (a crescent, an L) keeps its hollow. A
 * shape lying wholly inside another (a button on a cushion) adds no walls. `follow: 'hull'` wraps the whole layer
 * in one convex skin instead. Each face is darkened by `shade` the more it turns from the light (from the upper
 * left), so a curve reads round. A `facade` lays windows, piers and bands on the walls (facadeArt). Returns their
 * packets, each with a `depth` a hair over 0 that is lower the farther its face's nearest point is from the camera,
 * so faces at one height draw farthest first (the painter's order for walls standing on one floor: a nearer face is
 * never behind a farther one where they overlap), and over anything flat at the height they stand on (the top of
 * the floor below, a roof they rise from), but under every top above it.
 */
function drawSides(steps,{at,rotation,scale},values,fill,view,z0,z1,{shade=.35,follow='shapes',facade=null,scale:vs=1,screen=null,shines=false}={}){
    if(z1<=z0)return [];
    const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);
    const place=([x,y])=>{const px=x*sx,py=y*sy;return [at[0]+px*c-py*s,at[1]+px*s+py*c];};
    const flip=sx*sy<0,loops=sideLoops(steps,values,follow);if(!loops.length)return [];
    const k0=view.k(z0),k1=view.k(z1),out=[];
    // A curve is many short faces: each unbroken run the camera sees is filled as one shape (no hairline seams
    // between facets), and its shading laid over in bands of faces that turn alike.
    const strip=(pts,i,j,path=[])=>{
        for(let m=i;m<=j;m++){const q=pts[m%pts.length],[x,y]=view.scaled(q[0],q[1],k0);path.push([m===i?'move':'line',x,y]);}
        for(let m=j;m>=i;m--){const q=pts[m%pts.length],[x,y]=view.scaled(q[0],q[1],k1);path.push(['line',x,y]);}
        path.push(['close']);return path;
    };
    const art=facade?facadeArt(facade,values,Math.sqrt(Math.abs(sx*sy)),vs,z1-z0):null,where=art?`${at[0]},${at[1]},${rotation},${sx},${sy}`:'';
    for(const loop of loops){
        const pts=loop.map(place),n=pts.length,face=[],plan=art?facadePlan(loop,where,pts,art):null;
        for(let i=0;i<n;i++){
            const a=pts[i],b=pts[(i+1)%n],ex=b[0]-a[0],ey=b[1]-a[1],L=Math.hypot(ex,ey);
            // loops run with a positive signed area, so the outward side is (ey, -ex); a mirror flips it
            let nx=L>1e-9?ey/L:0,ny=L>1e-9?-ex/L:0;if(flip){nx=-nx;ny=-ny;}
            const seen=L>1e-9&&view.sees({x1:a[0],y1:a[1],x2:b[0],y2:b[1],nx,ny});
            face.push({seen,dark:seen?Math.round(shade*(1-(nx*LIGHT[0]+ny*LIGHT[1]))/2*50)/50:0,d:seen?nearest(view.camera,a,b):Infinity});
        }
        // runs of seen faces, starting just after an unseen one so a run never wraps in two pieces
        let start=face.findIndex(f=>!f.seen);if(start<0)start=0;
        for(let m=0;m<n;){
            const i=(start+m)%n;if(!face[i].seen){m++;continue;}
            let len=0;while(len<n-m&&face[(i+len)%n].seen)len++;
            const scene=new artScene();scene.fill(strip(pts,i,i+len),fill);
            const lit=plan?paintFacade(scene,view,pts,plan,art,i,len,z0,face,screen):null;
            for(let u=0;u<len;){let v=u;while(v+1<len&&face[(i+v+1)%n].dark===face[(i+u)%n].dark)v++;const dk=face[(i+u)%n].dark;if(dk>.004)scene.fill(strip(pts,i+u,i+v+1),`rgba(0,0,0,${dk})`);u=v+1;}
            if(lit)lit(scene);
            let d=Infinity;for(let q=0;q<len;q++)d=Math.min(d,face[(i+q)%n].d);const depth=1/(d+1000);
            for(const packet of scene.finish())out.push({...packet,depth});
            // with `shines`, the lit windows again, marked: what shows through the night (the light layer's shines)
            if(lit&&shines){const glow=new artScene();lit(glow);for(const packet of glow.finish())out.push({...packet,depth,shine:true});}
            m+=len;
        }
    }
    return out;
}
/**
 * A layer's walls in a reflection below it: each face of its hull that looks down the screen (+y), from where its
 * base falls (`fall` × z0 below its foot) to where its top falls (`fall` × z1), as a still wet floor shows it.
 */
function mirrorSides(steps,{at,rotation,scale},values,fill,fall,z0,z1,view=null){
    const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,points=drawingOutline([{shape:'group',x:at[0],y:at[1],rotation,scale:[sx,sy],steps}],{values}).flatMap(part=>part.points),hull=convexHull(points);
    if(hull.length<3)return [];
    const cx=hull.reduce((t,p)=>t+p[0],0)/hull.length,cy=hull.reduce((t,p)=>t+p[1],0)/hull.length,m0=fallen(view,fall,z0),m1=fallen(view,fall,z1),at0=p=>[m0[0]*p[0]+m0[4],m0[3]*p[1]+m0[5]],at1=p=>[m1[0]*p[0]+m1[4],m1[3]*p[1]+m1[5]],scene=new artScene();
    for(let i=0;i<hull.length;i++){
        const a=hull[i],b=hull[(i+1)%hull.length];let nx=b[1]-a[1],ny=a[0]-b[0];if(nx*((a[0]+b[0])/2-cx)+ny*((a[1]+b[1])/2-cy)<0){nx=-nx;ny=-ny;}
        if(ny<=0)continue;
        scene.fill([['move',...at0(a)],['line',...at0(b)],['line',...at1(b)],['line',...at1(a)],['close']],fill);
    }
    return scene.finish().map(packet=>({...packet,depth:0}));
}
/**
 * Where a thing at height z shows in a wet floor, as a matrix on world coordinates: in the plane of its depth below the
 * floor (the view's k(-z), toward the camera, when a height view leans) and `fall` × z down the world's y.
 */
export function fallen(view,fall,z){
    if(!view)return [1,0,0,1,0,fall*z];
    const [cx,cy]=view.camera,k=view.k(-z);return [k,0,0,k,cx*(1-k),cy*(1-k)+fall*z];
}
// ----- Facades ---------------------------------------------------------------------------------------
// A layer's `facade` is the art on its walls, laid out as an architect would: the walls run from corner to corner
// (a curve or a rounded corner carries on round, a turn of more than 30 degrees starts a new wall); each wall is cut
// into equal bays about `bays.width` wide, `bays.margin` kept clear at each end, and the layer into `storeys`. A
// panel (a window, a spandrel, a door) stands in every bay of every storey, piers stand between the bays, and bands
// run along the whole wall. Every point is placed at its own height, so the art leans exactly with the wall.
const CORNER=Math.PI/6,SLIVER=.6;
// A panel's own drawing (a fan, a crest, a sign): each shape's outline in the panel's frame (x across from its middle,
// y down from its top), scaled to the wall, with its paint.
function panelShapes(steps,values,h,v){
    return steps.map(raw=>{const st=readValues(raw,values);
        // a text step stays text: drawn on the face under the wall's own matrix (a sign, a name, a number)
        if(st.shape==='text')return {text:String(st.text),x:(st.x??0)*h,y:(st.y??0)*v,h,v,font:{family:st.family??'sans-serif',size:st.size??16,weight:st.weight??400,style:st.style??'normal'},
            align:st.align??'left',baseline:st.baseline??'alphabetic',fill:st.fill===undefined&&st.stroke===undefined?'#000':st.fill,stroke:st.stroke,line_width:st.line_width??1};
        const [part]=drawingOutline([st],{values,fine:true});
        return {points:part.points.map(([x,y])=>[x*h,y*v]),fill:st.fill,stroke:st.stroke,line_width:(st.line_width??1)*h,open:st.shape==='line'};});
}
const near0=v=>Number.isFinite(v)?v:0;
/** A facade's fields with its look values read and its lengths in the world (h: along walls, v: up them). */
const ARTS=new WeakMap();
function facadeArt(facade,values,h,v,H){
    let byKey=ARTS.get(facade);if(!byKey)ARTS.set(facade,byKey=new Map());
    const key=`${h},${v},${H},${values&&typeof values==='object'?(VALUES_KEY.get(values)??(VALUES_KEY.set(values,JSON.stringify(values)),VALUES_KEY.get(values))):''}`;
    let art=byKey.get(key);if(!art){if(byKey.size>64)byKey.clear();byKey.set(key,art=readFacade(facade,values,h,v,H));}return art;
}
function readFacade(facade,values,h,v,H){
    const read=o=>o?readValues(o,values):null,up=x=>x===undefined?undefined:x*v,from=(x,d)=>{const z=x===undefined?d:x*v;return z<0?H+z:z;};
    const st=read(facade.storeys)??{},bays=read(facade.bays)??{};
    const height=Math.max(1e-6,(st.height??H/v)*v),base=from(st.from,0),count=st.count??Math.max(1,Math.floor((H-base)/height+1e-6));
    return {
        storeys:{base,height,count},seed:facade.seed??0,top:H,
        bays:{width:Math.max(1e-6,(bays.width??H/v)*h),margin:near0(bays.margin)*h},
        panels:(facade.panels??[]).map(read).map(p=>({...p,shapes:p.steps?panelShapes(p.steps,values,h,v):null,lit_shapes:p.lit_steps?panelShapes(p.lit_steps,values,h,v):null,width:p.width*h,height:up(p.height),at:up(p.at??0),line_width:p.line_width??1,bars:p.bars??0,bar_width:(p.bar_width??1)*h,lit:p.lit??0,storeys:p.storeys??null,detail:p.detail??0,plain:!!(p.fill||p.lit_fill)})),
        piers:(facade.piers??[]).map(read).map(p=>({...p,width:p.width*h,from:from(p.from,0),to:from(p.to,H),edge_width:(p.edge_width??1)*h})),
        bands:(facade.bands??[]).map(read).map(b=>({...b,from:from(b.from,0),to:from(b.to,H)}))
    };
}
/**
 * Where a loop's walls and bays fall: each facet's wall and its stretch [s0, s1] along it, and each wall's length,
 * bays and whether it closes on itself (a circle or a rounded block with no corner).
 */
const PLANS=new WeakMap();
function facadePlan(loop,where,pts,art){
    let byPlace=PLANS.get(loop);if(!byPlace)PLANS.set(loop,byPlace=new Map());
    const key=`${where}|${art.bays.width},${art.bays.margin}`;let plan=byPlace.get(key);
    if(!plan){if(byPlace.size>256)byPlace.clear();byPlace.set(key,plan=planWalls(pts,art));}return plan;
}
function planWalls(pts,art){
    const n=pts.length,ang=[],len=[];
    for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];len.push(Math.hypot(b[0]-a[0],b[1]-a[1]));ang.push(Math.atan2(b[1]-a[1],b[0]-a[0]));}
    const turn=i=>{let d=ang[i]-ang[(i-1+n)%n];while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return Math.abs(d);};
    let starts=[];for(let i=0;i<n;i++)if(len[i]>1e-9&&turn(i)>CORNER)starts.push(i);
    const closed=!starts.length;if(closed)starts=[0];
    const facet=new Array(n),walls=[];
    starts.forEach((a,w)=>{
        const b=starts[(w+1)%starts.length];let s=0,i=a;
        const list=[];do{facet[i]={wall:w,s0:s,s1:s+len[i]};list.push(i);s+=len[i];i=(i+1)%n;}while(i!==b);
        const {width,margin}=art.bays,m=closed?0:Math.min(margin,s/2),span=s-2*m,count=span>=width*.6?Math.max(1,Math.round(span/width)):0;
        const [x,y]=pts[a];walls.push({facets:list,length:s,closed,margin:m,bay:count?span/count:0,count,key:Math.round(x)*73856093^Math.round(y)*19349663});
    });
    return {facet,walls};
}
// A whole number from a few: which windows are lit is the same every frame and on every machine.
function hash(...k){let h=2166136261;for(const v of k){h=Math.imul(h^(v|0),16777619);h^=h>>>13;}h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h>>>0)/4294967296;}
/** Paints the facade on the run of facets i .. i+len-1 into `scene`; returns a painter for the lit panels (drawn over the shading), or null. */
function paintFacade(scene,view,pts,plan,art,i,len,z0,face,screen){
    const n=pts.length,{storeys}=art,paths=new Map(),get=(key)=>{let p=paths.get(key);if(!p)paths.set(key,p=[]);return p;},K=new Map(),kOf=z=>{let k=K.get(z);if(k===undefined)K.set(z,k=view.k(z0+z));return k;};
    // the stretch [a, b] of facet f at heights za .. zb (above the layer's base), as a quad on the wall
    // what the screen shows: a facet wholly off it is not dressed, and a piece thinner on screen than SLIVER px is left out
    const B=screen?.bounds,zoom=screen?.zoom??0,[cx,cy]=view.camera;
    const piece=(out,f,a,b,za,zb)=>{
        const F=plan.facet[f],L=F.s1-F.s0;if(!(L>0))return;const lo=Math.max(a,F.s0),hi=Math.min(b,F.s1);if(hi-lo<1e-6||zb-za<1e-6)return;
        const ka=kOf(za),kb=kOf(zb);if(zoom&&(Math.min((hi-lo)*ka,(kb-ka)*face[f].d)*zoom<SLIVER))return;
        const p=pts[f],q=pts[(f+1)%n],t0=(lo-F.s0)/L,t1=(hi-F.s0)/L;
        const x0=p[0]+(q[0]-p[0])*t0,y0=p[1]+(q[1]-p[1])*t0,x1=p[0]+(q[0]-p[0])*t1,y1=p[1]+(q[1]-p[1])*t1;
        const A=view.scaled(x0,y0,ka),B=view.scaled(x1,y1,ka),C=view.scaled(x1,y1,kb),D=view.scaled(x0,y0,kb);
        out.push(['move',A[0],A[1]],['line',B[0],B[1]],['line',C[0],C[1]],['line',D[0],D[1]],['close']);
    };
    // a point s along wall W at height z (above the layer's base), where it is drawn
    const onWall=(W,s,z)=>{
        if(W.closed)s=((s%W.length)+W.length)%W.length;
        const list=W.facets;let lo=0,hi=list.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(plan.facet[list[mid]].s0<=s)lo=mid;else hi=mid-1;}
        const f=list[lo],F=plan.facet[f],t=Math.max(0,Math.min(1,(s-F.s0)/((F.s1-F.s0)||1))),p=pts[f],q=pts[(f+1)%n],k=kOf(z);
        return view.scaled(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,k);
    };
    // every stretch [a, b] of a wall, wrapped round a closed one, met by facet f
    const spans=(f,a,b,fn)=>{const F=plan.facet[f],W=plan.walls[F.wall];if(W.closed&&b>W.length){fn(a,b);fn(a-W.length,b-W.length);}else if(W.closed&&a<0){fn(a,b);fn(a+W.length,b+W.length);}else fn(a,b);};
    for(let m=0;m<len;m++){
        const f=(i+m)%n,F=plan.facet[f],W=plan.walls[F.wall];
        // the stretch of the facet the screen shows, at its foot or its top (a long straight wall is mostly off it)
        let v0=F.s0,v1=F.s1;
        if(B){const p=pts[f],q=pts[(f+1)%n],L=F.s1-F.s0;let t0=Infinity,t1=-Infinity;
            for(const k of [kOf(0),kOf(art.top)]){
                let a=0,b=1;
                for(const [ax,lo,hi] of [[0,B.left,B.right],[1,B.top,B.bottom]]){
                    const c=view.camera[ax],u=c+(p[ax]-c)*k,d=(q[ax]-p[ax])*k;
                    if(Math.abs(d)<1e-12){if(u<lo||u>hi){a=1;b=0;}continue;}
                    let ta=(lo-u)/d,tb=(hi-u)/d;if(ta>tb)[ta,tb]=[tb,ta];a=Math.max(a,ta);b=Math.min(b,tb);
                }
                if(a<=b){t0=Math.min(t0,a);t1=Math.max(t1,b);}
            }
            if(!(t0<=t1))continue;
            const pad=W.bay||0;v0=Math.max(F.s0,F.s0+L*t0-pad);v1=Math.min(F.s1,F.s0+L*t1+pad);
        }
        art.bands.forEach((band,k)=>piece(get(`b${k}`),f,v0,v1,band.from,band.to));
        if(!W.count)continue;
        // the bays this facet meets
        const b0=Math.max(W.closed?-1:0,Math.floor((v0-W.margin)/W.bay)-1),b1=Math.min(W.closed?W.count+1:W.count,Math.ceil((v1-W.margin)/W.bay)+1);
        art.piers.forEach((pier,k)=>{for(let b=Math.max(b0,0);b<=Math.min(b1,W.count);b++){if(W.closed&&b===W.count)continue;const s=W.margin+b*W.bay;spans(f,s-pier.width/2,s+pier.width/2,(a,c)=>{piece(get(`p${k}`),f,a,c,pier.from,pier.to);if(pier.edge)piece(get(`e${k}`),f,a,a+pier.edge_width,pier.from,pier.to);});}});
        for(let b=Math.max(b0,0);b<Math.min(b1,W.count);b++){
            const mid=W.margin+(b+.5)*W.bay;
            art.panels.forEach((panel,k)=>{
                for(let r=0;r<storeys.count;r++){
                    if(panel.storeys&&!panel.storeys.includes(r)&&!panel.storeys.includes(r-storeys.count))continue;
                    // drawn as its steps when it stands at least `detail` px tall on screen; smaller, as the plain panel if it has one
                    const small=panel.shapes&&zoom&&(()=>{const za=storeys.base+r*storeys.height+panel.at,H=panel.height??storeys.height-panel.at;return (kOf(za+H)-kOf(za))*face[f].d*zoom<Math.max(SLIVER*3,panel.detail);})();
                    if(panel.shapes&&small&&!panel.plain)continue;
                    if(panel.shapes&&!small){
                        // drawn whole, once, from the facet its middle stands on; x runs left to right as seen from outside
                        const at=W.closed?((mid%W.length)+W.length)%W.length:mid;if(at<F.s0||at>=F.s1||at<v0-W.bay||at>v1+W.bay)continue;
                        const za=storeys.base+r*storeys.height+panel.at,H=panel.height??storeys.height-panel.at;
                        // a lit one (as many as `lit` says, the same every frame) is drawn as its `lit_steps`, with the lit panels
                        const lit=panel.lit_shapes&&panel.lit>0&&hash(W.key,b,r,k,art.seed)<panel.lit,shapes=lit?panel.lit_shapes:panel.shapes,tag=lit?'u':'x';
                        shapes.forEach((sh,j)=>{
                            // text: an affine map from the panel's frame onto the face, exact on the panel's own facet
                            // (it leans with the wall; text running past a corner is not bent round it)
                            if(sh.text!==undefined){
                                const p=pts[f],q=pts[(f+1)%n],L=(F.s1-F.s0)||1,u=at,on=(s,z)=>{const t=(s-F.s0)/L;return view.scaled(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,kOf(z));};
                                const O=on(u-sh.x,za+H-sh.y),X=on(u-sh.x-sh.h,za+H-sh.y),Y=on(u-sh.x,za+H-sh.y-sh.v);
                                get(`${lit?'T':'t'}${k}.${j}`).push([X[0]-O[0],X[1]-O[1],Y[0]-O[0],Y[1]-O[1],O[0],O[1]]);return;
                            }
                            const path=sh.points.map(([x,y],q)=>{const [X,Y]=onWall(W,mid-x,za+H-y);return [q?'line':'move',X,Y];});if(!sh.open)path.push(['close']);
                            if(sh.fill)get(`${tag}${k}.${j}`).push(...path);if(sh.stroke)get(`${lit?'v':'y'}${k}.${j}`).push(...path);
                        });
                        continue;
                    }
                    const za=storeys.base+r*storeys.height+panel.at,zb=za+(panel.height??storeys.height-panel.at),on=panel.lit>0&&panel.lit_fill&&hash(W.key,b,r,k,art.seed)<panel.lit;
                    spans(f,mid-panel.width/2,mid+panel.width/2,(a,c)=>{
                        piece(get(on?`l${k}`:`w${k}`),f,a,c,za,zb);
                        if(panel.stroke)piece(get(`s${k}`),f,a,c,za,zb);
                        for(let q=1;q<=panel.bars;q++){const x=mid-panel.width/2+panel.width*q/(panel.bars+1);if(x>=a&&x<=c)piece(get(`r${k}`),f,x-panel.bar_width/2,x+panel.bar_width/2,za,zb);}
                    });
                }
            });
        }
    }
    const fill=(key,paint,into=scene)=>{const p=paths.get(key);if(p&&p.length&&paint)into.fill(p,paint);};
    // a panel's text, once for each place it stands (each matrix maps the panel's frame onto the face)
    const words=(key,sh,into=scene)=>{for(const matrix of paths.get(key)??[]){into.enter({matrix});
        if(sh.fill)into.text(sh.text,0,0,{font:sh.font,align:sh.align,baseline:sh.baseline},{fill:sh.fill});
        if(sh.stroke)into.text(sh.text,0,0,{font:sh.font,align:sh.align,baseline:sh.baseline},{stroke:sh.stroke,stroke_width:sh.line_width});into.leave();}};
    art.bands.forEach((band,k)=>{if(!band.lit)fill(`b${k}`,band.fill);});   // (a lit band goes with the lit panels: over the shading, and shining at night)
    art.piers.forEach((pier,k)=>{fill(`p${k}`,pier.fill);fill(`e${k}`,pier.edge);});
    art.panels.forEach((panel,k)=>{fill(`w${k}`,panel.fill);fill(`r${k}`,panel.bar_fill);const s=paths.get(`s${k}`);if(s&&s.length)scene.stroke(s,panel.stroke,panel.line_width);
        panel.shapes?.forEach((sh,j)=>{if(sh.text!==undefined)return words(`t${k}.${j}`,sh);fill(`x${k}.${j}`,sh.fill);const t=paths.get(`y${k}.${j}`);if(t&&t.length)scene.stroke(t,sh.stroke,sh.line_width);});});
    const glows=art.panels.some((p,k)=>paths.get(`l${k}`)?.length||p.lit_shapes?.some((sh,j)=>paths.get(`u${k}.${j}`)?.length||paths.get(`v${k}.${j}`)?.length||paths.get(`T${k}.${j}`)?.length))||art.bands.some((b,k)=>b.lit&&paths.get(`b${k}`)?.length);
    return glows?into=>{art.bands.forEach((band,k)=>{if(band.lit)fill(`b${k}`,band.fill,into);});art.panels.forEach((panel,k)=>{fill(`l${k}`,panel.lit_fill,into);fill(`r${k}`,panel.bar_fill,into);
        panel.lit_shapes?.forEach((sh,j)=>{if(sh.text!==undefined)return words(`T${k}.${j}`,sh,into);fill(`u${k}.${j}`,sh.fill,into);const t=paths.get(`v${k}.${j}`);if(t&&t.length)into.stroke(t,sh.stroke,sh.line_width);});});}:null;
}
const LIGHT=(()=>{const x=-.55,y=-.83,l=Math.hypot(x,y);return [x/l,y/l];})();   // toward the light, upper left
/**
 * The closed loops a layer's walls stand on, in the drawing's own space, counter-clockwise (y down), worked out
 * once per drawing and look. 'shapes': each solid shape's fine outline that no larger one covers; 'hull': one hull.
 */
const LOOPS=new WeakMap();
function sideLoops(steps,values,follow){
    let byValues=LOOPS.get(steps);if(!byValues)LOOPS.set(steps,byValues=new WeakMap());
    const key=values&&typeof values==='object'&&Object.keys(values).length?values:EMPTY;let byFollow=byValues.get(key);if(!byFollow)byValues.set(key,byFollow={});
    if(byFollow[follow])return byFollow[follow];
    const parts=drawingOutline([{shape:'group',steps}],{values,fine:true}).filter(p=>p.solid&&p.points.length>=3);
    let loops;
    if(follow==='hull'){const h=convexHull(parts.flatMap(p=>p.points));loops=h.length>=3?[counterClockwise(h)]:[];}
    else{
        const sized=parts.map(p=>({points:counterClockwise(p.points),area:Math.abs(signedArea(p.points))})).filter(p=>p.area>1e-6).sort((a,b)=>b.area-a.area);
        // a shape covered by a larger one (a shine laid over its cushion, a button on it) adds no walls: tested
        // with its points drawn a hair toward its middle, so a copy of the same outline counts as covered
        loops=[];for(const p of sized){
            const [mx,my]=p.points.reduce((t,q)=>[t[0]+q[0]/p.points.length,t[1]+q[1]/p.points.length],[0,0]),pulled=p.points.map(([x,y])=>[x+(mx-x)*.02,y+(my-y)*.02]);
            if(!loops.some(o=>o.area>=p.area*.999&&pulled.every(q=>inside(q,o.points))))loops.push(p);
        }
        loops=loops.map(p=>p.points);
    }
    return byFollow[follow]=loops;
}
const EMPTY={};
function signedArea(pts){let a=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;}
// Counter-clockwise on screen (y down) is a positive signed area here.
function counterClockwise(pts){return signedArea(pts)<0?[...pts].reverse():pts;}
function inside([x,y],pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;}
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


// ----- Still art ------------------------------------------------------------------------------------
// A layer's art, painted once: its key names its steps (by identity) and its look values, its bounds hold every
// shape with room for strokes, blurs and shadows, and `build` draws it at the origin. One record per steps and look.
const STILL_AREA=800*800;   // the most a still picture covers, in square world units
const STILL=new WeakMap(),STEPS_ID=new WeakMap(),VALUES_KEY=new WeakMap();
// Two 32-bit hashes of the drawing's text and its length: a name for its content, made once per steps list.
function contentKey(steps){const t=JSON.stringify(steps);let a=2166136261,b=5381;for(let i=0;i<t.length;i++){const c=t.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}return `${(a>>>0).toString(36)}${(b>>>0).toString(36)}.${t.length}`;}
function stillArt(steps,values,materials){
    if(!Array.isArray(steps)||!steps.length||hasText(steps))return null;   // text's width is the font's: no sure bounds
    let byValues=STILL.get(steps);if(!byValues)STILL.set(steps,byValues=new Map());
    const vk=values&&typeof values==='object'?(VALUES_KEY.get(values)??(VALUES_KEY.set(values,JSON.stringify(values)),VALUES_KEY.get(values))):'';
    if(byValues.has(vk))return byValues.get(vk);
    let id=STEPS_ID.get(steps);if(id===undefined)STEPS_ID.set(steps,id=contentKey(steps));   // by content: copies of one drawing share it
    const points=drawingOutline(steps,{values}).flatMap(p=>p.points);let art=null;
    if(points.length){
        let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
        const pad=reach(steps)+1;
        // a big flat layer (a roof, a lawn) draws cheaply as shapes, and as a picture would crowd small, busy art out of the cache
        if((x1-x0+2*pad)*(y1-y0+2*pad)<=STILL_AREA)art={key:`still:${id}:${vk}`,bounds:[x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad],build:()=>new artScene().draw(steps,{values,materials}).finish()};
    }
    byValues.set(vk,art);return art;
}
const hasText=steps=>steps.some(st=>st&&(st.shape==='text'||(st.shape==='group'&&Array.isArray(st.steps)&&hasText(st.steps))));
// How far past its outline a drawing can paint: its widest stroke, its softest blur or shadow.
function reach(steps){let r=0;for(const st of steps){if(!st||typeof st!=='object')continue;r=Math.max(r,(+st.line_width||0)/2,(+st.blur||0)*3,st.shadow?(+st.shadow.blur||0)*3+Math.hypot(...(st.shadow.offset??[0,0])):0);if(st.shape==='group'&&Array.isArray(st.steps))r=Math.max(r,reach(st.steps)*Math.max(1,Math.abs(+(Array.isArray(st.scale)?Math.max(...st.scale):st.scale??1))));}return r;}
// The matrix a place draws under: moved to `at`, turned by `rotation`, scaled.
function placeMatrix({at,rotation,scale}){const [sx,sy]=typeof scale==='number'?[scale,scale]:scale,c=Math.cos(rotation),s=Math.sin(rotation);return [c*sx,s*sx,-s*sy,c*sy,at[0],at[1]];}

// ----- Geometry -------------------------------------------------------------------------------------
const compose=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const apply=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const ring=(x,y,rx,ry,turn=0,n=SAMPLES)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,c=Math.cos(turn),s=Math.sin(turn),px=Math.cos(a)*rx,py=Math.sin(a)*ry;return [x+px*c-py*s,y+px*s+py*c];});
// How many points round a curve of radius r when walls stand on it: about one every 3 units, 16 to 96.
const facets=r=>Math.max(16,Math.min(96,Math.ceil(2*Math.PI*Math.abs(r)/3)));
/** A rounded rectangle's outline: each corner a quarter circle of `n` steps (clockwise from the top left, y down). */
function roundedRect(x,y,w,h,r,n){
    const rr=Math.max(0,Math.min(Math.abs(r),Math.abs(w)/2,Math.abs(h)/2));if(!(rr>0))return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    const out=[],corner=(cx,cy,a0)=>{for(let i=0;i<=n;i++){const a=a0+i/n*Math.PI/2;out.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]);}};
    corner(x+w-rr,y+rr,-Math.PI/2);corner(x+w-rr,y+h-rr,0);corner(x+rr,y+h-rr,Math.PI/2);corner(x+rr,y+rr,Math.PI);return out;
}
/** A step's outline. `fine`: as walls stand on it, its curves faceted to their size and a rectangle's corners rounded. */
function outline(step,fine=false){
    const {shape,x=0,y=0}=step;
    switch(shape){
        case 'rectangle':return fine&&step.radius?roundedRect(x,y,step.width,step.height,step.radius,Math.max(3,Math.ceil(facets(step.radius)/4))):[[x,y],[x+step.width,y],[x+step.width,y+step.height],[x,y+step.height]];
        case 'circle':return ring(x,y,step.radius,step.radius,0,fine?facets(step.radius):SAMPLES);
        case 'ellipse':return ring(x,y,step.radius_x,step.radius_y,step.rotation??0,fine?facets(Math.max(step.radius_x,step.radius_y)):SAMPLES);
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
