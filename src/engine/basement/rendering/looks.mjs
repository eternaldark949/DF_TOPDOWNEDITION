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
export function drawComponents(entity,source,blend=1,{joints=()=>null,view=null,pictures=false}={}){
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
        if(view&&layer.sides&&z1>z0){sides=drawSides(steps,place,values,sidesPaint(layer.sides,values,materials),view,z0,z1,layer.sides);if(whole({c}))for(const packet of sides)packet.depth=0;else top=key+z1-z0;}
        // A still layer (not on a tipped bone) is the same art wherever it stands: with `pictures` it is drawn once
        // into a picture, keyed by its steps and look, and stamped each frame under its place and its plane.
        if(pictures&&fore===1&&!lean){
            const art=stillArt(steps,values,materials);
            if(art){const m=placeMatrix(place),matrix=view?compose(view.plane(view.k(z1)),m):m;
                return {height:z0,depth:key,top,layer:layer.layer,component:c.name,sides,packets:[],picture:{key:art.key,bounds:art.bounds,matrix,build:art.build}};}
        }
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
 * A layer's walls, seen from above: from the plane of its base to the plane of its top, each face the camera sees.
 * By default every solid shape stands on its own true outline: a rounded rectangle rounds its corners, a circle or
 * an arc is faceted finely enough to read as a curve, and a hollow shape (a crescent, an L) keeps its hollow. A
 * shape lying wholly inside another (a button on a cushion) adds no walls. `follow: 'hull'` wraps the whole layer
 * in one convex skin instead. Each face is darkened by `shade` the more it turns from the light (from the upper
 * left), so a curve reads round. Returns their packets, each with a `depth` a hair under 0 that is lower the
 * farther its face's nearest point is from the camera, so faces at one height draw farthest first (the painter's
 * order for walls standing on one floor: a nearer face is never behind a farther one where they overlap).
 */
function drawSides(steps,{at,rotation,scale},values,fill,view,z0,z1,{shade=.35,follow='shapes'}={}){
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
    for(const loop of loops){
        const pts=loop.map(place),n=pts.length,face=[];
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
            for(let u=0;u<len;){let v=u;while(v+1<len&&face[(i+v+1)%n].dark===face[(i+u)%n].dark)v++;const dk=face[(i+u)%n].dark;if(dk>.004)scene.fill(strip(pts,i+u,i+v+1),`rgba(0,0,0,${dk})`);u=v+1;}
            let d=Infinity;for(let q=0;q<len;q++)d=Math.min(d,face[(i+q)%n].d);const depth=-1e-3*d/(d+1000);
            for(const packet of scene.finish())out.push({...packet,depth});
            m+=len;
        }
    }
    return out;
}
const LIGHT=(()=>{const x=-.55,y=-.83,l=Math.hypot(x,y);return [x/l,y/l];})();   // toward the light, upper left
/**
 * The closed loops a layer's walls stand on, in the drawing's own space, counter-clockwise (y down), worked out
 * once per drawing and look. 'shapes': each solid shape's fine outline that no larger one covers; 'hull': one hull.
 */
const LOOPS=new WeakMap();
function sideLoops(steps,values,follow){
    let byValues=LOOPS.get(steps);if(!byValues)LOOPS.set(steps,byValues=new WeakMap());
    const key=values&&typeof values==='object'?values:EMPTY;let byFollow=byValues.get(key);if(!byFollow)byValues.set(key,byFollow={});
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
        art={key:`still:${id}:${vk}`,bounds:[x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad],build:()=>new artScene().draw(steps,{values,materials}).finish()};
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
