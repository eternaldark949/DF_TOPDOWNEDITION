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
export function polyline(points){if(!Array.isArray(points)||points.length<2)throw new TypeError('A polyline needs two points or more');return points.map(([x,y],i)=>[i?'line':'move',finite(x,'x'),finite(y,'y')]);}
/** A closed polygon through `points`. */
export function polygon(points){if(points?.length<3)throw new TypeError('A polygon needs three points or more');return [...polyline(points),['close']];}
/** A box from its top-left corner, the classic canvas convention. */
export const rect=(x,y,w,h)=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
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
    packets=[];matrix=identity();style={stroke_width:1,line_cap:'butt',line_join:'miter',dash:[],opacity:1,blend:'normal'};clips=[];#stack=[];
    enter(pose={},style={}){this.#stack.push({matrix:this.matrix,style:this.style,clips:this.clips});this.matrix=multiply(this.matrix,transform(pose));this.style={...this.style,...style};this.clips=[...this.clips];return this;}
    leave(){const state=this.#stack.pop();if(!state)throw new Error('Unbalanced art group');Object.assign(this,state);return this;}
    place(pose){this.matrix=multiply(this.matrix,transform(pose));return this;}
    /** Limits everything painted later in this group to the shape. */
    clip(commands,{rule='nonzero'}={}){this.clips.push({geometry:geometry(commands),matrix:[...this.matrix],rule});return this;}
    paint(commands,material){const {stroke_width,line_cap,line_join,dash}=this.style,inv=this.clips.length?inverse(this.matrix):null;
        this.packets.push({type:'shape',matrix:[...this.matrix],geometry:geometry(commands),material:{fill:null,stroke:null,stroke_width,line_cap,line_join,dash:[...dash],...copy(material)},opacity:this.style.opacity,blend:this.style.blend,clips:this.clips.map(clip=>({geometry:clip.geometry,transform:multiply(inv,clip.matrix),rule:clip.rule}))});return this;
    }
    fill(commands,color){return this.paint(commands,{fill:color});}
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
}

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
