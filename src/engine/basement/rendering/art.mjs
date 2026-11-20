// ===== LV0 BASEMENT =====
// THE ART TOOLKIT: the shapes, effects and helpers every artist repeats, as frame packets. An artist
// builds a picture in an `artScene` (move, rotate, scale and paint inside nested groups, as with a
// canvas save/restore) and hands `finish()` to the frame. Nothing here touches a canvas: every
// result is plain data that any backend can draw.
import {transform,inverse} from './values.mjs';

const identity=()=>[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
// A paint call keeps the commands array it is given (no copy): build a fresh shape for each call.
const geometry=commands=>Array.isArray(commands)?{type:'path',commands}:copy(commands);
const copy=value=>Array.isArray(value)?value.map(copy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v)])):value;
const finite=(value,name)=>{if(!Number.isFinite(value))throw new TypeError(`Art ${name} must be a finite number`);return value;};

// ----- Shapes: path commands, composable in one paint call ---------------------------------------
export const ellipse=(x,y,rx,ry,rotation=0,start=0,end=Math.PI*2,reverse=0)=>['ellipse',x,y,rx,ry,rotation,start,end,Number(reverse)];
export const circle=(x,y,r,start=0,end=Math.PI*2)=>ellipse(x,y,r,r,0,start,end);
/** An open run of straight lines through `points` ([x, y] each). Stroke it; filling closes it implicitly. */
export function polyline(points){if(!Array.isArray(points)||points.length<2)throw new TypeError('A polyline needs two points or more');const out=new Array(points.length);for(let i=0;i<points.length;i++){const p=points[i];out[i]=[i?'line':'move',finite(p[0],'x'),finite(p[1],'y')];}return out;}
/** A closed polygon through `points`. */
export function polygon(points){if(points?.length<3)throw new TypeError('A polygon needs three points or more');return [...polyline(points),['close']];}
/** A box from its top-left corner, the classic canvas convention. */
export const rect=(x,y,w,h)=>[['rect',finite(x,'x'),finite(y,'y'),finite(w,'width'),finite(h,'height')]];   // (one command: a strip is grained with thousands of rects)
/** A box from its top-left corner with rounded corners, the same outline as a canvas roundRect (circular
 *  arcs); `r` is clamped to half the shorter side. */
export function roundRect(x,y,w,h,r){
    r=Math.max(0,Math.min(finite(r,'corner radius'),Math.abs(w)/2,Math.abs(h)/2));if(!r)return rect(x,y,w,h);
    const q=Math.PI/2;
    return [['move',x+r,y],['line',x+w-r,y],ellipse(x+w-r,y+r,r,r,0,-q,0),['line',x+w,y+h-r],ellipse(x+w-r,y+h-r,r,r,0,0,q),['line',x+r,y+h],ellipse(x+r,y+h-r,r,r,0,q,2*q),['line',x,y+r],ellipse(x+r,y+r,r,r,0,2*q,3*q),['close']];
}
/** A stadium from `from` to `to` with round ends: a limb, a cable, a pipe. Fill it. */
export function capsule([ax,ay],[bx,by],r){
    finite(r,'capsule radius');const angle=Math.atan2(by-ay,bx-ax),turn=Math.PI/2;
    return [ellipse(ax,ay,r,r,0,angle+turn,angle-turn+Math.PI*2),ellipse(bx,by,r,r,0,angle-turn,angle+turn),['close']];
}
/**
 * A limb from joint `from` to joint `to`: round at each joint (radius `radii[0]` and `radii[2]`, so the next
 * limb carries on from the same circle) and swelling to `radii[1]` a `belly_at` (0..1) of the way along: a
 * thigh, a calf, a forearm. Fill it.
 */
export function limb([ax,ay],[bx,by],[r0,rb,r1],belly_at=.3){
    for(const [v,n] of [[r0,'start radius'],[rb,'belly radius'],[r1,'end radius'],[belly_at,'belly position']])finite(v,`limb ${n}`);
    const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1e-6,a=Math.atan2(dy,dx),ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
    const c1=Math.max(.05,belly_at*.85)*L,c2=(belly_at+(1-belly_at)*.5)*L,w1=Math.max(rb*1.05,r0),w2=(rb+r1)*.5;
    return [ellipse(ax,ay,r0,r0,0,a+Math.PI/2,a+Math.PI*1.5),
        ['cubic',ax+ux*c1-nx*w1,ay+uy*c1-ny*w1,ax+ux*c2-nx*w2,ay+uy*c2-ny*w2,bx-nx*r1,by-ny*r1],
        ellipse(bx,by,r1,r1,0,a-Math.PI/2,a+Math.PI/2),
        ['cubic',ax+ux*c2+nx*w2,ay+uy*c2+ny*w2,ax+ux*c1+nx*w1,ay+uy*c1+ny*w1,ax+nx*r0,ay+ny*r0],['close']];
}
/** A closed shape through `points` with corners rounded by quadratic curves (a blob, a cushion). */
export function smoothShape(points){
    if(points?.length<3)throw new TypeError('A smooth shape needs three points or more');
    const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],n=points.length,start=mid(points[n-1],points[0]),out=[['move',...start]];
    for(let i=0;i<n;i++){const end=mid(points[i],points[(i+1)%n]);out.push(['quadratic',...points[i],...end]);}
    out.push(['close']);return out;
}

// ----- Paint ---------------------------------------------------------------------------------------
export const linear=(from,to,stops)=>({type:'linear',from,to,stops});
export const radial=(from,inner_radius,to,outer_radius,stops)=>({type:'radial',from,inner_radius,to,outer_radius,stops});

/**
 * A data-only scene builder, the packet form of canvas save/translate/rotate/restore. `enter(pose)`
 * opens a group (position, rotation, scale or matrix, and optional style overrides), `leave()` closes
 * it; `paint(shape, material)` emits one shape packet with the group's transform, style and clips.
 */
export class artScene{
    packets=[];mark_shines=false;matrix=identity();style={stroke_width:1,line_cap:'butt',line_join:'miter',dash:[],opacity:1,blend:'normal'};clips=[];#stack=[];
    enter(pose={},style={}){this.#stack.push({matrix:this.matrix,style:this.style,clips:this.clips});this.matrix=multiply(this.matrix,transform(pose));this.style={...this.style,...style};this.clips=[...this.clips];return this;}
    leave(){const state=this.#stack.pop();if(!state)throw new Error('Unbalanced art group');Object.assign(this,state);return this;}
    place(pose){this.matrix=multiply(this.matrix,transform(pose));return this;}
    /** Limits everything painted later in this group to the shape. */
    clip(commands,{rule='nonzero'}={}){this.clips.push({geometry:geometry(commands),matrix:[...this.matrix],rule});return this;}
    paint(commands,material){const {stroke_width,line_cap,line_join,dash}=this.style,inv=this.clips.length?inverse(this.matrix):null;
        this.packets.push({type:'shape',matrix:[...this.matrix],geometry:geometry(commands),material:{fill:null,stroke:null,stroke_width,line_cap,line_join,dash:[...dash],...copy(material)},opacity:this.style.opacity,blend:this.style.blend,clips:this.clips.map(clip=>({geometry:clip.geometry,transform:multiply(inv,clip.matrix),rule:clip.rule}))});return this;
    }
    fill(commands,color){return this.paint(commands,{fill:color});}
    /**
     * A small image of its own in the group (`pixels` {width, height, data}: RGBA bytes, rows top down), its
     * `source` [x, y, w, h] pixels drawn with their top-left at the group's origin, `scale` local units a
     * pixel, read smoothly between pixel centres. Backends upload a data array once.
     */
    sprite(pixels,source=[0,0,pixels.width,pixels.height],scale=1){const inv=this.clips.length?inverse(this.matrix):null;
        this.packets.push({type:'sprite',matrix:[...this.matrix],pixels,source:[...source],size:[source[2]*scale,source[3]*scale],origin:[0,0],material:{fill:null,stroke:null},opacity:this.style.opacity,blend:this.style.blend,clips:this.clips.map(clip=>({geometry:clip.geometry,transform:multiply(inv,clip.matrix),rule:clip.rule}))});return this;}
    stroke(commands,color,stroke_width=this.style.stroke_width){return this.paint(commands,{stroke:color,stroke_width});}
    /** The fill-then-outline pair the classic art draws for nearly every part. */
    outlined(commands,fill,stroke,stroke_width=this.style.stroke_width){return this.paint(commands,{fill,stroke,stroke_width});}
    /** One line of text at (x, y) in the group: `font` {family, size, weight, style}, `align` left|center|right,
     *  `baseline` top|middle|bottom|alphabetic; `material` as for paint (fill, or stroke for outlined text). */
    text(string,x,y,{font={},align='left',baseline='alphabetic'}={},material={fill:'#000'}){
        const m=multiply(this.matrix,[1,0,0,1,finite(x,'x'),finite(y,'y')]),inv=this.clips.length?inverse(m):null,{stroke_width,line_cap,line_join,dash}=this.style;
        this.packets.push({type:'text',text:String(string),matrix:m,font:{...font},align,baseline,material:{fill:null,stroke:null,stroke_width,line_cap,line_join,dash:[...dash],...copy(material)},opacity:this.style.opacity,blend:this.style.blend,clips:this.clips.map(clip=>({geometry:clip.geometry,transform:multiply(inv,clip.matrix),rule:clip.rule}))});return this;
    }
    finish(){if(this.#stack.length)throw new Error('Unclosed art group');return this.packets;}

    // ----- Readable drawing calls: one shape each, in the group's local space ----------------------
    // Every call takes one object: where the shape sits (around the group's origin) and how it is
    // painted (`fill`, `stroke`, `line_width`, `alpha`, `blend`, `shadow`, `blur`). See DRAWING below.
    /** A box with its top-left corner at (x, y), rounded when `radius` is set. */
    drawRectangle({x=0,y=0,width,height,radius=0,...paint}){return this.#draw(radius?roundRect(x,y,width,height,radius):rect(x,y,width,height),paint);}
    /** A circle round (x, y). */
    drawCircle({x=0,y=0,radius,...paint}){return this.#draw([circle(x,y,radius)],paint);}
    /** An ellipse round (x, y), turned by `rotation`. */
    drawEllipse({x=0,y=0,radius_x,radius_y,rotation=0,...paint}){return this.#draw([ellipse(x,y,radius_x,radius_y,rotation)],paint);}
    /** A stadium from `from` to `to` with round ends of `radius`. */
    drawCapsule({from,to,radius,...paint}){return this.#draw(capsule(from,to,radius),paint);}
    /** A limb from `from` to `to`, `radii` [start, belly, end], swelling `belly_at` of the way along. */
    drawLimb({from,to,radii,belly_at=.3,...paint}){return this.#draw(limb(from,to,radii,belly_at),paint);}
    /** An open line through `points`; it is stroked (black, 1 wide, unless told). */
    drawLine({points,...paint}){return this.#draw(polyline(points),{stroke:'#000',...paint});}
    /** A closed polygon through `points`. */
    drawPolygon({points,...paint}){return this.#draw(polygon(points),paint);}
    /** A closed shape through `points` with its corners rounded. */
    drawCurve({points,...paint}){return this.#draw(smoothShape(points),paint);}
    /** One line of `text` at (x, y): `size`, `family`, `weight`, `style`, `align`, `baseline`. */
    drawText({text,x=0,y=0,size=16,family='sans-serif',weight=400,style='normal',align='left',baseline='alphabetic',...paint}){
        const {material,opacity,blend}=drawPaint({fill:'#000',...paint});
        return this.#styled(opacity,blend,()=>this.text(text,x,y,{font:{family,size,weight,style},align,baseline},material));
    }
    /** A soft round light round (x, y): `color` as '#rrggbb' or 'r,g,b', bright in the middle (`core`), gone at `radius`. */
    drawGlow({x=0,y=0,radius,color,core=.35,alpha=1,blend}){glow(this,x,y,radius,rgbString(color),core,{alpha,...(blend?{blend}:{})});return this;}
    /** The soft dark ellipse that sets something on the floor. */
    drawGroundShadow({x=0,y=0,radius_x,radius_y,strength=1}){groundShadow(this,x,y,radius_x,radius_y,{strength});return this;}
    /**
     * Draws a drawing (a list of steps, see DRAWING) moved to `at`, turned by `rotation` and sized by
     * `scale` (a number or [x, y]). A step's string value `"$name"` is read from `values` (a look's
     * fields), so one drawing serves every variant of a thing. A step's `material` names a material
     * record (see MATERIAL) read through `materials`, an object or a function of the name; the step's
     * own paint fields win over the material's. `solid` marks the steps that collision bounds fit.
     */
    draw(steps,{at=[0,0],rotation=0,scale=1,values={},materials=NO_MATERIALS}={}){
        if(!Array.isArray(steps))throw new TypeError('A drawing is a list of steps');
        this.enter({position:at,rotation,scale:typeof scale==='number'?[scale,scale]:scale});
        try{for(const step of steps)this.#step(readValues(step,values),values,materials);}finally{this.leave();}
        return this;
    }
    #step(step,values,materials){
        const {shape,material,solid,emits,reflect,...fields}=step??{};
        if(shape==='group'){const {steps,x=0,y=0,rotation=0,scale=1}=fields;return this.draw(steps,{at:[x,y],rotation,scale,values,materials});}
        const call=DRAWING[shape];if(!call)throw new TypeError(`Unknown drawing shape: ${shape} (one of ${Object.keys(DRAWING).join(', ')}, group)`);
        if(solid!==undefined&&typeof solid!=='boolean')throw new TypeError('solid is true or false');
        if(emits!==undefined)readEmits(emits);
        if(reflect!==undefined)readReflect(reflect);
        // with `mark_shines` on, what a glowing step paints is marked `shine` (it shows through the night: renderSystem.nightOver)
        const n=this.packets.length,out=this[call](material===undefined?fields:{...materialPaint(material,materials),...fields});
        if(this.mark_shines&&this.packets.length>n){
            const record=material===undefined?null:typeof materials==='function'?materials(material):materials?.[material];
            const glow=emits!==undefined?readEmits(emits):record?.emits!==undefined?readEmits(record.emits):null;
            if(glow&&glow.strength>0)for(let i=n;i<this.packets.length;i++)this.packets[i].shine=true;
        }
        return out;
    }
    #draw(commands,paint){const {material,opacity,blend}=drawPaint(paint);return this.#styled(opacity,blend,()=>this.paint(commands,material));}
    #styled(opacity,blend,fn){if(opacity===1&&blend===undefined)return fn();this.enter({},{opacity:this.style.opacity*opacity,...(blend?{blend}:{})});try{fn();}finally{this.leave();}return this;}
}

/** The shapes a drawing step may name, and the readable call each one is. */
export const DRAWING=Object.freeze({rectangle:'drawRectangle',circle:'drawCircle',ellipse:'drawEllipse',capsule:'drawCapsule',limb:'drawLimb',line:'drawLine',polygon:'drawPolygon',curve:'drawCurve',text:'drawText',glow:'drawGlow',ground_shadow:'drawGroundShadow'});
const PAINT_KEYS=new Set(['fill','stroke','line_width','line_cap','line_join','dash','alpha','blend','shadow','blur']);
const NO_MATERIALS=Object.freeze({});
/** The fields a material record may hold: its paint, plus `kind` and the physical `surface` that drawing ignores. */
export const MATERIAL=Object.freeze({paint:Object.freeze([...PAINT_KEYS]),other:Object.freeze(['kind','surface','emits','reflect'])});
/**
 * The fields of `emits`, on a drawing step or a material: the shape glows and lights what is round it
 * (the light grid, reflections). `true` takes every default; `false` or null (on a step) turns off its material's.
 *  strength  how bright the light it casts is, 0 or more (default 1)
 *  reach     how far it reaches, world units (default 96)
 *  color     the light's colour, '#rrggbb' or '#rgb' (default the step's own fill, else its stroke, else white)
 *  height    how high above the ground it glows, world units (default 0): a high light reaches farther and softer
 * Drawing ignores it: an emitting step draws as it would without.
 */
/**
 * The fields of `reflect`, on a material or a floor step: the surface shines and shows what stands over it
 * (reflections.mjs). `true` takes every default; `false` or null turns it off (on a step, its material's too).
 *  strength  how much it reflects, 0 to 1 (default .5)
 *  wet       true when it shines only as wet as the weather makes it (asphalt, pavers), false when it
 *            always shines (marble, polished stone, still water)
 *  plane     true for a true mirror (a reflection plane): what stands over it is drawn again whole, in full art
 * Drawing ignores it.
 */
export const REFLECT=Object.freeze({strength:.5,wet:false,plane:false});
/** `reflect` in its one form, {strength, wet, plane}, or null when it is off. Unknown fields are refused. */
export function readReflect(reflect,where='reflect'){
    if(reflect===false||reflect===null)return null;
    if(reflect===true)return {...REFLECT};
    if(!reflect||typeof reflect!=='object'||Array.isArray(reflect))throw new TypeError(`${where} is true, false or {${Object.keys(REFLECT).join(', ')}}`);
    for(const key of Object.keys(reflect))if(!Object.hasOwn(REFLECT,key))throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(REFLECT).join(', ')})`);
    const out={...REFLECT,...reflect};
    if(!(Number.isFinite(out.strength)&&out.strength>=0&&out.strength<=1))throw new TypeError(`${where}.strength is a number from 0 to 1`);
    for(const key of ['wet','plane'])if(typeof out[key]!=='boolean')throw new TypeError(`${where}.${key} is true or false`);
    return out;
}
export const EMITS=Object.freeze({strength:1,reach:96,color:null,height:0});
/** `emits` in its one form, {strength, reach, color, height}, or null when it is off. Unknown fields are refused. */
export function readEmits(emits,where='emits'){
    if(emits===false||emits===null)return null;
    if(emits===true)return {...EMITS};
    if(!emits||typeof emits!=='object'||Array.isArray(emits))throw new TypeError(`${where} is true, false or {${Object.keys(EMITS).join(', ')}}`);
    for(const key of Object.keys(emits))if(!Object.hasOwn(EMITS,key))throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(EMITS).join(', ')})`);
    const out={...EMITS,...emits};
    if(!(Number.isFinite(out.strength)&&out.strength>=0))throw new TypeError(`${where}.strength is a number of 0 or more`);
    if(!(Number.isFinite(out.reach)&&out.reach>0))throw new TypeError(`${where}.reach is a positive number of world units`);
    if(!(Number.isFinite(out.height)&&out.height>=0))throw new TypeError(`${where}.height is a number of 0 or more`);
    if(out.color!==null&&!(typeof out.color==='string'&&/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(out.color)))throw new TypeError(`${where}.color is '#rrggbb' or '#rgb'`);
    return out;
}
/** A material record's paint fields, read by name. A material with an unknown field is refused. */
function materialPaint(name,materials){
    if(typeof name!=='string'||!name)throw new TypeError('A step names its material by id');
    const record=typeof materials==='function'?materials(name):Object.hasOwn(materials,name)?materials[name]:undefined;
    if(!record||typeof record!=='object')throw new TypeError(`Unknown material: ${name}`);
    const paint={};
    for(const [key,value] of Object.entries(record)){if(PAINT_KEYS.has(key))paint[key]=value;else if(!MATERIAL.other.includes(key))throw new TypeError(`Unknown material field: ${key} in ${name} (a material holds ${[...PAINT_KEYS,...MATERIAL.other].join(', ')})`);}
    return paint;
}
/** A step's paint fields as a material, its opacity and its blend. Unknown fields are refused, so a typo never draws silently wrong. */
function drawPaint({fill=null,stroke=null,line_width,line_cap,line_join,dash,alpha=1,blend,shadow,blur,...rest}){
    const unknown=Object.keys(rest);if(unknown.length)throw new TypeError(`Unknown drawing field: ${unknown.join(', ')} (paint is ${[...PAINT_KEYS].join(', ')})`);
    if(fill===null&&stroke===null)fill='#000';
    const material={fill,stroke};if(line_width!==undefined)material.stroke_width=line_width;if(line_cap)material.line_cap=line_cap;if(line_join)material.line_join=line_join;if(dash)material.dash=dash;
    if(shadow)material.shadow={color:shadow.color??'rgba(0,0,0,.5)',blur:shadow.blur??0,offset:shadow.offset??[0,0]};
    if(blur)material.blur=blur;
    if(!(alpha>=0&&alpha<=1))throw new TypeError('alpha must be in [0,1]');
    return {material,opacity:alpha,blend};
}
/** A copy of `step` with every "$name" string read from `values`; groups keep theirs for their own steps. */
export function readValues(step,values){
    const read=value=>{
        if(typeof value==='string'&&value.startsWith('$')){const key=value.slice(1);if(!Object.hasOwn(values,key))throw new TypeError(`The drawing reads ${value}, which its values do not have`);return values[key];}
        if(Array.isArray(value))return value.map(read);
        return value;
    };
    return Object.fromEntries(Object.entries(step??{}).map(([k,v])=>[k,k==='steps'?v:read(v)]));
}
const rgbString=colour=>typeof colour==='string'&&colour.startsWith('#')?hexToRgb(colour).join(','):colour;

// ----- Effects -------------------------------------------------------------------------------------
/** A soft round light: `rgb` as 'r,g,b', bright at the centre, gone at `r`. It takes the group's blend unless given one (`'add'` brightens). */
export function glow(scene,x,y,r,rgb,core=.35,{blend=scene.style.blend,alpha=1}={}){
    const stops=[[0,`rgba(${rgb},${alpha})`]];if(core>0)stops.push([core,`rgba(${rgb},${.45*alpha})`]);stops.push([1,`rgba(${rgb},0)`]);
    scene.enter({},{blend});scene.paint([circle(x,y,r)],{fill:radial([x,y],0,[x,y],r,stops)});scene.leave();
}
/** The soft dark ellipse that sets an object on the floor. */
export function groundShadow(scene,x,y,rx,ry,{strength=1}={}){
    const a=k=>`rgba(0,0,0,${+(k*strength).toFixed(4)})`;
    scene.enter({position:[x,y],scale:[rx,ry]});scene.paint([circle(0,0,1)],{fill:radial([0,0],0,[0,0],1,[[0,a(.30)],[.65,a(.24)],[.85,a(.12)],[1,a(0)]])});scene.leave();
}

// ----- Colour --------------------------------------------------------------------------------------
/** '#rgb' or '#rrggbb' -> [r, g, b] (0..255). */
export function hexToRgb(hex){
    if(typeof hex!=='string'||!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex))throw new TypeError(`Not a hex colour: ${hex}`);
    const h=hex.length===4?[...hex.slice(1)].map(c=>c+c).join(''):hex.slice(1);return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
}
export const rgbToHex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
/** A CSS rgba() string from a hex colour or an [r, g, b] triple. */
export function rgba(colour,a=1){const [r,g,b]=Array.isArray(colour)?colour:hexToRgb(colour);return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;}
/** Between two hex colours: k 0 is `a`, 1 is `b`. */
export function mix(a,b,k){const x=hexToRgb(a),y=hexToRgb(b);return rgbToHex(x.map((v,i)=>v+(y[i]-v)*k));}
/** Darker (k < 0, toward black) or lighter (k > 0, toward white), k in -1..1. */
export const shade=(hex,k)=>mix(hex,k<0?'#000000':'#ffffff',Math.min(1,Math.abs(k)));

// ----- Seeded randomness, for procedural detail that is the same every frame -----------------------
/** A repeatable random source: returns a function giving numbers in [0, 1). */
export function seededRandom(seed){let s=(finite(seed,'seed')>>>0)||0x9e3779b9;return ()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
/** A repeatable number in [0, 1) for a grid cell (x, y) and a seed: the same cell always gets the same value. */
export function hash2(x,y,seed=0){let h=Math.imul((x|0)^0x27d4eb2d,0x85ebca6b)^Math.imul((y|0)+0x165667b1,0xc2b2ae35)^Math.imul(seed|0,0x9e3779b1);h=Math.imul(h^(h>>>15),0x2c1b3c6d);h=Math.imul(h^(h>>>12),0x297a2d39);return ((h^(h>>>15))>>>0)/4294967296;}
