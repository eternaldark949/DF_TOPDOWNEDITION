// ===== LV0 BASEMENT =====
// RAIN: drops falling past a camera above the ground, as a picture. Rain holds no state: each drop is where
// the time says it is. The ground is cut into cells; each cell holds drops at fixed phases, and each fall
// lands somewhere new in its cell (a hash of the cell, the drop and how many times it has fallen). A drop
// falls from `height` to the ground in `fall` seconds, then splashes for `splash_time`. Seen from above it
// is a short streak from where it was to where it is, leaning away from the camera as tall things do (the
// height view, or a flat camera `eye` high when there is none), so drops near the middle of the view are
// dots and those at the edges streak outward. Near a light a drop takes the light's colour.
import {artScene,circle,hash2,hexToRgb} from './art.mjs';
import {heightView} from './height.mjs';

/**
 * Rain's settings and their defaults.
 * - amount: how hard it rains, 0 (dry) to 1 (the full `density`).
 * - density: drops falling at once per 100 x 100 world units at full amount.
 * - fall: seconds a drop takes from `height` to the ground; height: where it starts, as a share of the eye's
 *   height (rain is seen near the lens: drops at the edges of the view streak outward, those in the middle are dots).
 * - streak: how long a streak is, as a share of the eye's height it spans (it reaches back to where the drop was).
 * - width: a streak's width (px) at the ground, growing to twice that near the top, as nearer things are bigger.
 * - color, alpha: the drops' colour and how strongly the highest ones show (the lowest a third of it).
 * - wind: [x, y] world units a drop drifts per unit of height it falls (it slants down the wind).
 * - splash: the ripple's radius (world units); splash_time: seconds it spreads and fades. 0 draws none.
 * - lit: near a light (within `lit_reach` of its radius) a drop takes the light's colour.
 * - eye: the camera's height when the frame has no height view (world units).
 * - cell: the size of a cell (world units); seed: which rain it is.
 */
export const RAIN=Object.freeze({amount:1,density:10,fall:.55,height:.12,streak:.015,width:.9,color:'#b9c3dc',alpha:.32,wind:[0,0],splash:3.5,splash_time:.4,lit:true,lit_reach:.6,eye:700,cell:128,seed:0});
const RANGE={amount:[0,1],density:[0,200],fall:[.05,30],height:[.001,.8],streak:[0,.5],width:[.1,16],alpha:[0,1],splash:[0,256],splash_time:[0,30],lit_reach:[0,4],eye:[1,1e6],cell:[16,4096],seed:[-1e9,1e9]};
/** Rain's settings checked and filled in from the defaults (or `base`). Unknown fields are refused. */
export function readRain(rain,base=RAIN,where='rain'){
    if(rain===true||rain===undefined||rain===null)return base;
    if(!rain||typeof rain!=='object'||Array.isArray(rain))throw new TypeError(`${where} is true or {${Object.keys(RAIN).join(', ')}}`);
    const out={...base};
    for(const [key,value] of Object.entries(rain)){
        if(!Object.hasOwn(RAIN,key))throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(RAIN).join(', ')})`);
        if(key==='color'){hexToRgb(value);out[key]=value;continue;}
        if(key==='lit'){if(typeof value!=='boolean')throw new TypeError(`${where}.lit is true or false`);out[key]=value;continue;}
        if(key==='wind'){if(!(Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)))throw new TypeError(`${where}.wind is [x, y]`);out[key]=[...value];continue;}
        const [lo,hi]=RANGE[key];if(!(Number.isFinite(value)&&value>=lo&&value<=hi))throw new RangeError(`${where}.${key} is a number from ${lo} to ${hi}`);out[key]=value;
    }
    return Object.freeze(out);
}

const BANDS=4;
/**
 * The rain over `bounds` ({left, top, right, bottom}, world) at `time` (seconds on the game clock): render
 * packets in world space. `view` is the frame's height view (or null: a flat one at the camera with the
 * rain's `eye`, `camera` [x, y] its centre); `zoom` is the camera's (streak widths are screen pixels);
 * `lights` are light records in the world (point lights with `position`, `radius`, `color`) whose colour
 * nearby drops take. Drops are batched by height into a few strokes, lit ones by light, splashes into one
 * stroke and one fill.
 */
export function rainPackets({bounds,time,settings=RAIN,view=null,camera=null,zoom=1,lights=[]}){
    const s=readRain(settings);if(!(s.amount>0&&s.density>0))return [];
    const v=view??new heightView({camera:camera??[(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2],eye:s.eye});
    const C=s.cell,per=s.density*s.amount*(C/100)**2,cycle=s.fall+s.splash_time,seed=s.seed|0;
    const H=s.height*v.eye,S=s.streak*v.eye,[wx,wy]=s.wind,reach=H+S,pad=Math.max(Math.abs(wx),Math.abs(wy))*reach+C;
    // A drop high up draws further from the camera than its landing point, so look a little past the view.
    const c0=Math.floor((bounds.left-pad)/C),c1=Math.floor((bounds.right+pad)/C),r0=Math.floor((bounds.top-pad)/C),r1=Math.floor((bounds.bottom+pad)/C);
    const bands=Array.from({length:BANDS},()=>[]),lit=new Map(),rings=[],dots=[];
    const near=s.lit?lights.filter(l=>(l.shape??'point')==='point'&&l.radius>0&&Array.isArray(l.position)).map(l=>({x:l.position[0],y:l.position[1],r:l.radius*s.lit_reach,color:/^#[0-9a-f]{6}$/i.test(l.color??'')?l.color:'#ffeebb',k:Math.min(1,l.intensity??1)})).filter(l=>l.x+l.r>=bounds.left&&l.x-l.r<=bounds.right&&l.y+l.r>=bounds.top&&l.y-l.r<=bounds.bottom):[];
    const inside=(x,y)=>x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom;
    for(let cy=r0;cy<=r1;cy++)for(let cx=c0;cx<=c1;cx++){
        const whole=Math.floor(per),n=whole+(hash2(cx,cy,seed^0x51)<per-whole?1:0);
        for(let j=0;j<n;j++){
            const phase=hash2(cx*31+j,cy,seed^0x1f),t=time/cycle+phase,round=Math.floor(t),u=(t-round)*cycle;   // seconds into this fall
            const gx=(cx+hash2(cx+j*7919,cy+round,seed^0x2a))*C,gy=(cy+hash2(cx,cy+j*104729+round,seed^0x3b))*C;
            if(u<s.fall){
                const z=H*(1-u/s.fall),top=z+S,head=v.at(gx-wx*z,gy-wy*z,z),tail=v.at(gx-wx*top,gy-wy*top,top);
                if(!inside(head[0],head[1])&&!inside(tail[0],tail[1]))continue;
                const band=Math.min(BANDS-1,Math.floor(z/H*BANDS)),seg=[['move',tail[0],tail[1]],['line',head[0],head[1]]];
                let light=null;for(const l of near){const dx=head[0]-l.x,dy=head[1]-l.y;if(dx*dx+dy*dy<l.r*l.r){light=l;break;}}
                if(light){const key=`${light.color}|${band}`;let entry=lit.get(key);if(!entry)lit.set(key,entry={light,band,path:[]});entry.path.push(...seg);}
                else bands[band].push(...seg);
            }else if(s.splash>0&&inside(gx,gy)){
                const k=(u-s.fall)/s.splash_time,r=s.splash*k;if(r>.1)rings.push(['move',gx+r,gy],circle(gx,gy,r));
                if(k<.25){const d=(1+(1-k/.25)*1.2)*.5;dots.push(['move',gx+d,gy],circle(gx,gy,d));}
            }
        }
    }
    const [r,g,b]=hexToRgb(s.color),paint=a=>`rgba(${r},${g},${b},${+a.toFixed(4)})`,scene=new artScene(),width=w=>w/Math.max(zoom,.05);
    scene.enter({},{line_cap:'round'});
    for(let i=0;i<BANDS;i++)if(bands[i].length){const h=(i+.5)/BANDS;scene.stroke(bands[i],paint(s.alpha*(1+2*h)/3),width(s.width*(1+h)));}
    for(const {light,band,path} of lit.values()){const h=(band+.5)/BANDS,[lr,lg,lb]=hexToRgb(light.color);scene.stroke(path,`rgba(${lr},${lg},${lb},${+(Math.min(.6,s.alpha*1.6)*light.k).toFixed(4)})`,width(s.width*(1+h)*1.3));}
    if(rings.length)scene.stroke(rings,paint(s.alpha*.4),width(.7));
    if(dots.length)scene.fill(dots,paint(s.alpha*.6));
    scene.leave();const out=scene.finish();
    return out;
}
