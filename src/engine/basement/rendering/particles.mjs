// ===== LV0 BASEMENT =====
// PARTICLE LOOKS: how a particle system's particles are drawn, as data. Physics moves them (a particle system
// record, basement/physics/particles); its `look` says what each one is on screen: a streak along its motion
// (rain, sparks), a dot (snow, embers) or a ring that grows (a splash, a ripple). A particle has a height, so
// with a height view it leans away from the camera as tall things do. Particles of one system are batched into
// a few strokes or fills whatever their number: by height band, and by light for those that take a light's colour.
import {artScene,circle,hexToRgb} from './art.mjs';
import {heightView} from './height.mjs';

/**
 * A look's fields and their defaults.
 * - shape: 'streak' (a line from where it was `trail` seconds ago to where it is), 'dot' (a disc of radius
 *   `size`) or 'ring' (a circle of radius `size`).
 * - color ('#rrggbb') and alpha; width: a streak's or ring's line width in screen pixels.
 * - trail: seconds of motion a streak spans. size: a dot's or ring's radius (world units).
 * - grow: a ring or dot grows from nothing to `size` over its life; fade: its alpha falls to nothing over its life.
 * - bands: drawn nearer the camera the higher it is, in `band_count` height bands, the highest `band_width`
 *   times as wide and `band_alpha` times as bright as the lowest (rain near the lens).
 * - lit: near a point light (within `lit_reach` of its radius) a particle takes the light's colour (`lit_color`
 *   for a light that gives none), `lit_alpha` times as bright and `lit_width` times as wide.
 * - eye: the camera's height when the frame has no height view (world units): particles still lean from it.
 */
export const PARTICLE_LOOK=Object.freeze({shape:'dot',color:'#ffffff',alpha:1,width:1,trail:.05,size:1,grow:false,fade:false,bands:false,band_count:4,band_alpha:3,band_width:2,lit:false,lit_reach:.6,lit_color:'#ffeebb',lit_alpha:1.6,lit_width:1.3,eye:700});
const SHAPES=['streak','dot','ring'],RANGE={alpha:[0,1],width:[.05,64],trail:[0,10],size:[0,4096],band_count:[2,16],band_alpha:[.1,16],band_width:[.1,16],lit_reach:[0,4],lit_alpha:[0,8],lit_width:[.1,8],eye:[1,1e6]};
/** A look checked and filled in from the defaults. Unknown fields are refused. */
export function readParticleLook(look,where='look'){
    if(look===null||look===undefined)return PARTICLE_LOOK;
    if(typeof look!=='object'||Array.isArray(look))throw new TypeError(`${where} is {${Object.keys(PARTICLE_LOOK).join(', ')}}`);
    const out={...PARTICLE_LOOK};
    for(const [key,value] of Object.entries(look)){
        if(!Object.hasOwn(PARTICLE_LOOK,key))throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(PARTICLE_LOOK).join(', ')})`);
        if(key==='shape'){if(!SHAPES.includes(value))throw new TypeError(`${where}.shape is ${SHAPES.join(', ')}`);out[key]=value;continue;}
        if(key==='color'||key==='lit_color'){hexToRgb(value);out[key]=value;continue;}
        if(typeof PARTICLE_LOOK[key]==='boolean'){if(typeof value!=='boolean')throw new TypeError(`${where}.${key} is true or false`);out[key]=value;continue;}
        const [lo,hi]=RANGE[key];if(!(Number.isFinite(value)&&value>=lo&&value<=hi))throw new RangeError(`${where}.${key} is a number from ${lo} to ${hi}`);
        if(key==='band_count'&&!Number.isInteger(value))throw new RangeError(`${where}.band_count is a whole number`);out[key]=value;
    }
    return Object.freeze(out);
}

const looks=new WeakMap();
const lookOf=look=>{if(!look||typeof look!=='object')return readParticleLook(look);let out=looks.get(look);if(!out)looks.set(look,out=readParticleLook(look));return out;};
/**
 * The packets for particle systems as physics reads them (`readParticleSystems()`), in world space, between the
 * last step and the one before at `blend`. `bounds` ({left, top, right, bottom}) is what can be seen; `view` the
 * frame's height view (or null: a flat one at `camera` with each look's `eye`); `zoom` the camera's (widths are
 * screen pixels); `lights` light records in the world, for looks that are `lit`. Systems without a look are not drawn.
 */
export function particlePackets(systems,{bounds,blend=1,view=null,camera=null,zoom=1,lights=[]}){
    const scene=new artScene(),px=w=>w/Math.max(zoom,.05);scene.enter({},{line_cap:'round'});
    const inside=(x,y,m)=>x>=bounds.left-m&&x<=bounds.right+m&&y>=bounds.top-m&&y<=bounds.bottom+m;
    const centre=camera??[(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2];
    for(const s of systems){
        if(!s.look||!s.count)continue;
        const L=lookOf(s.look),v=view??new heightView({camera:centre,eye:L.eye}),[r,g,b]=hexToRgb(L.color),[wx,wy]=s.wind??[0,0],top=Math.max(s.top||0,1e-6);
        const near=L.lit?lights.filter(l=>(l.shape??'point')==='point'&&l.radius>0&&Array.isArray(l.position)&&inside(l.position[0],l.position[1],l.radius)).map(l=>({x:l.position[0],y:l.position[1],r:l.radius*L.lit_reach,color:/^#[0-9a-f]{6}$/i.test(l.color??'')?l.color:L.lit_color,k:Math.min(1,l.intensity??1)})):[];
        {const colours=new Map();for(const l of near){if(!colours.has(l.color))colours.set(l.color,colours.size);l.i=colours.get(l.color);}}
        // The lights by cell (as wide as the widest reach), so a particle looks only in the nine cells round it.
        const cell=Math.max(1,...near.map(l=>l.r)),cells=new Map();for(const l of near){const key=Math.floor(l.x/cell)*65536+Math.floor(l.y/cell);let list=cells.get(key);if(!list)cells.set(key,list=[]);list.push(l);}
        const lightAt=(x,y)=>{if(!near.length)return null;const gx=Math.floor(x/cell),gy=Math.floor(y/cell);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const list=cells.get((gx+i)*65536+gy+j);if(list)for(const l of list){const dx=x-l.x,dy=y-l.y;if(dx*dx+dy*dy<l.r*l.r)return l;}}return null;};
        // The height view's scale at z, inlined (k(z) = 1 + (eye / (eye - z) - 1) lean, z held under 86% of the eye).
        const BANDS=L.band_count,[cx,cy]=v.camera,eye=v.eye,lean=v.lean,hold=eye*.86,k=z=>z<=0?1:1+(eye/(eye-(z<hold?z:hold))-1)*lean;
        // Batches: [band][alpha step] for plain ones, keyed by light and band for lit ones.
        const plain=new Map(),lit=new Map(),steps=L.fade?8:1,margin=L.shape==='streak'?0:L.size;
        const l0=bounds.left-margin,r0=bounds.right+margin,t0=bounds.top-margin,b0=bounds.bottom+margin,trail=L.trail,streak=L.shape==='streak';
        const batch=(map,key,make)=>{let e=map.get(key);if(!e)map.set(key,e=make());return e;};
        for(let i=0;i<s.count;i++){
            const x=s.px[i]+(s.x[i]-s.px[i])*blend,y=s.py[i]+(s.y[i]-s.py[i])*blend,z=Math.max(0,s.pz[i]+(s.z[i]-s.pz[i])*blend),kh=k(z),hx=cx+(x-cx)*kh,hy=cy+(y-cy)*kh;
            const t=s.life[i]>0?Math.min(1,s.age[i]/s.life[i]):1,band=L.bands?Math.min(BANDS-1,Math.max(0,Math.floor(z/top*BANDS))):0,step=L.fade?Math.min(steps-1,Math.floor(t*steps)):0;
            let a,b;
            if(streak){const kt=k(Math.max(0,z-s.vz[i]*trail)),tx=cx+(x-(s.vx[i]+wx)*trail-cx)*kt,ty=cy+(y-(s.vy[i]+wy)*trail-cy)*kt;
                if(!(hx>=l0&&hx<=r0&&hy>=t0&&hy<=b0)&&!(tx>=l0&&tx<=r0&&ty>=t0&&ty<=b0))continue;a=['move',tx,ty];b=['line',hx,hy];}
            else{const rad=L.size*(L.grow?t:1)*kh;if(!(rad>.05)||!(hx>=l0&&hx<=r0&&hy>=t0&&hy<=b0))continue;a=['move',hx+rad,hy];b=circle(hx,hy,rad);}
            const light=lightAt(hx,hy);
            const path=light?batch(lit,(light.i*BANDS+band)*steps+step,()=>({light,band,step,path:[]})).path:batch(plain,band*steps+step,()=>({band,step,path:[]})).path;
            path.push(a,b);
        }
        const strength=(band,step)=>{const h=(band+.5)/BANDS;return {a:L.alpha*(L.bands?(1+(L.band_alpha-1)*h)/L.band_alpha:1)*(L.fade?1-(step+.5)/steps:1),w:L.width*(L.bands?1+(L.band_width-1)*h:1)};};
        const paint=(path,[cr,cg,cb],a,w)=>{const colour=`rgba(${cr},${cg},${cb},${+a.toFixed(4)})`;if(L.shape==='dot')scene.fill(path,colour);else scene.stroke(path,colour,px(w));};
        for(const {band,step,path} of plain.values()){const {a,w}=strength(band,step);paint(path,[r,g,b],a,w);}
        for(const {light,band,step,path} of lit.values()){const {a,w}=strength(band,step);paint(path,hexToRgb(light.color),Math.min(1,a*L.lit_alpha)*light.k,w*L.lit_width);}
    }
    scene.leave();return scene.finish();
}
