// ===== LV0 BASEMENT =====
// GLARE: the lens over a bright light, as a camera sees it. Two layers stamped additively over a light: a
// fog (a wide, soft haze round it) and a star (four long rays and four shorter diagonals over a hot core,
// turned for drama). It is the lens, not the light, so it does not turn with what carries the light. A light
// asks for it with `glare: true` (or its own changes, `glare: {reach: 40}`); the night's `glare` settings give
// the rest. The star is baked once per colour into a small image (pixels, no backend needed) and stamped.
import {artScene,radial,circle,hexToRgb} from './art.mjs';

/**
 * The glare's settings and their defaults. `reach` is the star's reach in world units; `turn` the long rays'
 * angle (radians, clockwise on screen); `diagonal` the short rays' length as a share of the long ones';
 * `width` a long ray's half-width at its root as a share of `reach` (the short ones are three quarters of it);
 * `core` the hot white core's radius as a share of `reach`; `fog` the haze's reach as a share of `reach` and
 * `fog_strength` its strength at its heart; `strength` scales the whole stamp (a light's `intensity` too).
 */
export const GLARE=Object.freeze({reach:58,turn:38*Math.PI/180,diagonal:.5,width:.022,core:.12,fog:.85,fog_strength:.42,strength:1});
const RANGE={reach:[1,4096],turn:[-7,7],diagonal:[0,1],width:[.001,.25],core:[0,1],fog:[0,8],fog_strength:[0,1],strength:[0,8]};
/** One glare settings object, checked and filled in from `base` (the defaults). Unknown fields are refused. */
export function readGlare(glare,base=GLARE,where='glare'){
    if(glare===true||glare===undefined||glare===null)return base;
    if(!glare||typeof glare!=='object'||Array.isArray(glare))throw new TypeError(`${where} is true or {${Object.keys(GLARE).join(', ')}}`);
    const out={...base};
    for(const [key,value] of Object.entries(glare)){
        if(!Object.hasOwn(GLARE,key))throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(GLARE).join(', ')})`);
        const [lo,hi]=RANGE[key];if(!(Number.isFinite(value)&&value>=lo&&value<=hi))throw new RangeError(`${where}.${key} is a number from ${lo} to ${hi}`);out[key]=value;
    }
    return Object.freeze(out);
}

const SIZE=128,stars=new Map();
/** The star baked for one colour and shape: SIZE square RGBA, the reach at the edge. Kept, so backends upload it once. */
function starPixels(rgb,{turn,diagonal,width,core}){
    const key=`${rgb}|${turn}|${diagonal}|${width}|${core}`;let out=stars.get(key);if(out)return out;
    const data=new Uint8ClampedArray(SIZE*SIZE*4),R=SIZE/2,acc=new Float32Array(4);
    // The ray's colour along it, from its root (0) to its tip (1): a white-hot root, the light's colour, nothing.
    const stops=[[0,[255,250,238,1]],[.12,[255,244,226,.9]],[.3,[...rgb,.6]],[.65,[...rgb,.18]],[1,[...rgb,0]]];
    const along=t=>{for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const [t0,a]=stops[i-1],[t1,b]=stops[i],k=(t-t0)/(t1-t0);return a.map((v,j)=>v+(b[j]-v)*k);}return stops[stops.length-1][1];};
    const rays=Array.from({length:8},(_,i)=>{const a=turn+i*Math.PI/4;return {c:Math.cos(a),s:Math.sin(a),len:R*(i%2?diagonal:1),w:R*width*(i%2?.75:1)};});
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
        const px=x+.5-R,py=y+.5-R;acc.fill(0);
        for(const r of rays){const u=px*r.c+py*r.s;if(u<0||u>r.len)continue;const v=Math.abs(-px*r.s+py*r.c),half=r.w*(1-u/r.len),cover=Math.min(1,Math.max(0,half-v+.5));if(cover<=0)continue;
            const [cr,cg,cb,ca]=along(u/r.len),a=ca*cover;acc[0]+=cr*a;acc[1]+=cg*a;acc[2]+=cb*a;acc[3]+=a;}
        const d=Math.hypot(px,py),cr=R*core;if(cr>0&&d<cr){const t=d/cr,a=t<.4?.75+(.3-.75)*t/.4:.3*(1-(t-.4)/.6),c=t<.4?[255,250,238]:rgb;acc[0]+=c[0]*a;acc[1]+=c[1]*a;acc[2]+=c[2]*a;acc[3]+=a;}
        // Added light: the colour is the sum, its alpha the brightest channel (a premultiplied sum, shown straight).
        const m=Math.min(1,Math.max(acc[0],acc[1],acc[2])/255),i=(y*SIZE+x)*4;if(m<=0)continue;
        data[i]=Math.min(255,acc[0]/m);data[i+1]=Math.min(255,acc[1]/m);data[i+2]=Math.min(255,acc[2]/m);data[i+3]=Math.round(m*255);
    }
    out=Object.freeze({width:SIZE,height:SIZE,data});stars.set(key,out);return out;
}

/**
 * The glare over `lights` (light records in the world, as entityLights gives them): a fog and a star stamped
 * additively over each light that asks for it (`glare: true` or its changes), in its colour (`#ffeebb` when
 * it has none), at its `intensity` (up to 1) times the strength. `settings` are the night's (readGlare).
 * Returns render packets in world space, drawn over everything (`blend: 'add'`).
 */
export function glarePackets(lights,settings=GLARE){
    const base=readGlare(settings),scene=new artScene();scene.enter({},{blend:'add'});
    for(const light of lights){
        if(!light?.glare)continue;
        const g=readGlare(light.glare,base,'light glare'),hex=/^#[0-9a-f]{6}$/i.test(light.color??'')?light.color:'#ffeebb',rgb=hexToRgb(hex),[x,y]=light.position;
        const k=g.strength*Math.min(1,light.intensity??1);if(!(k>.01))continue;
        scene.enter({},{opacity:Math.min(1,k)});
        if(g.fog>0&&g.fog_strength>0){const f=g.reach*g.fog,A=g.fog_strength,c=a=>`rgba(${rgb.join(',')},${+a.toFixed(4)})`;
            scene.paint([circle(x,y,f)],{fill:radial([x,y],0,[x,y],f,[[0,c(A)],[.1,c(A*.7)],[.28,c(A*.3)],[.55,c(A*.09)],[1,c(0)]])});}
        const pixels=starPixels(rgb,g);scene.enter({position:[x-g.reach,y-g.reach]});scene.sprite(pixels,[0,0,SIZE,SIZE],2*g.reach/SIZE);scene.leave();
        scene.leave();
    }
    scene.leave();return scene.finish();
}
