// ===== LV0 BASEMENT =====
// THE LIGHT LAYER: darkness over the scene with light cut out of it. A layer is built as frame packets:
// the dark (a tint over the bounds), areas where the dark is thinner (a lit room, an open sky), each
// light's cut (its reach, shadowed by an optional visibility polygon), then each light's colour, added.
// Draw it over the finished scene at the dark's strength (canvasRenderer.drawLayer, or a render target).
import {artScene,rect,circle,radial,linear} from './art.mjs';

const finite=(value,name,min=-Infinity)=>{if(!Number.isFinite(value)||value<min)throw new TypeError(`Light ${name} must be a finite number`);return value;};
export const LIGHT_CUT=Object.freeze([[0,1],[1,0]]);
const white=a=>`rgba(255,255,255,${+a.toFixed(4)})`;
const polygonPath=points=>[['move',...points[0]],...points.slice(1).map(p=>['line',...p]),['close']];
/** A rounded strip light (a window, a lit doorway): a band across its middle and a half-ellipse cap at each end. */
function area(scene,[x,y],[w,h],round,stops,opacity,blend){
    const hw=w/2,hh=h/2,r=Math.max(0,Math.min(hw,round??hh)),x0=x-hw+r,x1=x+hw-r;
    scene.enter({},{opacity,blend});
    const band=[];for(const [o,c] of stops){band.push([.5-o/2,c],[.5+o/2,c]);}band.sort((a,b)=>a[0]-b[0]);
    scene.fill(rect(x0,y-hh,x1-x0,hh*2),linear([0,y-hh],[0,y+hh],band));
    if(r>0)for(const side of [-1,1]){scene.enter();scene.clip(rect(side<0?x0-r:x1,y-hh,r,hh*2));scene.enter({position:[side<0?x0:x1,y],scale:[r,hh]});scene.fill([circle(0,0,1)],radial([0,0],0,[0,0],1,stops));scene.leave();scene.leave();}
    scene.leave();
}
function validLight(light,i){
    const name=`light ${i}`;if(!light||!Array.isArray(light.position))throw new TypeError(`${name} needs a position`);
    const shape=light.shape??'point';if(shape!=='point'&&shape!=='area')throw new TypeError(`${name}: shape is point or area`);
    if(shape==='point')finite(light.radius,'radius',0);else if(!Array.isArray(light.size))throw new TypeError(`${name}: an area light needs a size`);
    finite(light.intensity??1,'intensity',0);finite(light.glow??0,'glow',0);
    if(light.polygon!==undefined&&light.polygon!==null&&(!Array.isArray(light.polygon)||light.polygon.length<3))throw new TypeError(`${name}: a polygon needs three points`);
    return shape;
}
/**
 * The light layer's packets.
 *  bounds   {left, top, right, bottom}: where the dark is drawn (the view, with a margin)
 *  tint     the dark's colour, any CSS colour
 *  areas    [{rects: [{x, y, w, h}] | polygon: [[x, y], ...], cut}]: the dark thinned by `cut` (0..1) there
 *  lights   [{position, shape: 'point' | 'area', radius | size + round, inner_radius, polygon, intensity,
 *            cut: [[offset, alpha]], color, glow, glow_stops: [[offset, colour]]}]
 *           A point light cuts a radial gradient from inner_radius to radius (shaped by `cut`, scaled by
 *           `intensity` up to 1), limited to `polygon` when given (from getVisibilityPolygon). Its colour
 *           is added after every cut at `glow` opacity, through `glow_stops` (default: colour fading out).
 *           An area light does the same over a rounded strip of `size`.
 */
export function createLightLayer({bounds,tint,areas=[],lights=[]},{scene=new artScene()}={}){
    const {left,top,right,bottom}=bounds??{};for(const v of [left,top,right,bottom])finite(v,'bounds');
    if(typeof tint!=='string'||!tint)throw new TypeError('The light layer needs a tint colour');
    scene.fill(rect(left,top,right-left,bottom-top),tint);
    for(const a of areas){const k=finite(a.cut,'area cut',0);if(k<.001)continue;
        const shape=a.polygon?polygonPath(a.polygon):(a.rects??[]).flatMap(q=>rect(q.x,q.y,q.w,q.h));if(!shape.length)continue;
        scene.enter({},{blend:'destination-out',opacity:Math.min(1,k)});scene.fill(shape,'#ffffff');scene.leave();}
    const shapes=lights.map(validLight);
    lights.forEach((l,i)=>{
        const k=Math.min(1,l.intensity??1);if(k<.001)return;const stops=(l.cut??LIGHT_CUT).map(([o,a])=>[o,white(a)]);
        if(shapes[i]==='area'){area(scene,l.position,l.size,l.round,stops,k,'destination-out');return;}
        const [x,y]=l.position,shape=l.polygon?polygonPath(l.polygon):[circle(x,y,l.radius)];
        scene.enter({},{blend:'destination-out',opacity:k});scene.fill(shape,radial([x,y],l.inner_radius??0,[x,y],l.radius,stops));scene.leave();
    });
    lights.forEach((l,i)=>{
        const k=Math.min(1,l.glow??0);if(k<.001||!l.color)return;const stops=l.glow_stops??[[0,l.color],[1,'rgba(0,0,0,0)']];
        if(shapes[i]==='area'){area(scene,l.position,l.size,l.round,stops,k,'add');return;}
        const [x,y]=l.position;scene.enter({},{blend:'add',opacity:k});scene.fill([circle(x,y,l.radius)],radial([x,y],0,[x,y],l.radius,stops));scene.leave();
    });
    return scene.finish();
}
