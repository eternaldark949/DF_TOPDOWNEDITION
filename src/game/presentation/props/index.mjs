// Props drawn natively, by family. A prop type in the catalog (game-assets/props.json) that names a
// `family` is a preset of it; its look is the family's defaults, then the type's look, then the
// placement's, checked against the family's schema. `propArtPacket` gathers what one piece shows,
// and `drawPropArt` draws it: a ground shadow, then the family's still runs from pictures painted
// once (Basement pictureCache) and its live parts as vector, in drawing order.
import PROPS from '../../data/game-assets/props.json' with {type:'json'};
import {resolvePropLook} from '../../../engine/directory/index.mjs';
import {artScene,groundShadow,canvasRenderer,measureText} from '../../../engine/basement/rendering/index.mjs';
import {CAFE_ARTISTS} from './cafe.mjs';
import {APARTMENT_ARTISTS} from './apartment.mjs';
import {HOUSE_ARTISTS} from './house.mjs';
import {HOTEL_ARTISTS} from './hotel.mjs';
import {CLUB_ARTISTS} from './club.mjs';
import {SANCTUM_ARTISTS} from './sanctum.mjs';
import {CLINIC_ARTISTS} from './clinic.mjs';
import {NEURAL_ARTISTS} from './neural.mjs';
import {TORQUE_ARTISTS} from './torque.mjs';
import {PALACE_ARTISTS} from './palace.mjs';
import {ENNI_ARTISTS} from './enni.mjs';

export const PROP_FAMILIES=PROPS.resources.catalog.data.families;
/** Every venue's artists under one name each: a family drawn by two venues would silently lose one. */
const ARTISTS=Object.freeze([CAFE_ARTISTS,APARTMENT_ARTISTS,HOUSE_ARTISTS,HOTEL_ARTISTS,CLUB_ARTISTS,SANCTUM_ARTISTS,CLINIC_ARTISTS,NEURAL_ARTISTS,TORQUE_ARTISTS,PALACE_ARTISTS,ENNI_ARTISTS].reduce((all,venue)=>{
    for(const family of Object.keys(venue))if(family in all)throw new Error(`prop family ${family} has two artists`);
    return Object.assign(all,venue);
},{}));
/** The pad round a piece's box its art may reach past (lips, drop shadows, a hearth), in px. */
const PAD=8;
/** The tempo a piece keeps when its host has no music to give it (`beat`, in beats since the start). */
const BPM=140;
for(const family of Object.keys(ARTISTS))if(!PROP_FAMILIES[family])throw new Error(`Prop artist ${family} has no family in the catalog`);

/** Whether a family has a native artist. */
export const hasPropArt=family=>typeof family==='string'&&Object.hasOwn(ARTISTS,family);
/** A family's loop ({frames, period} in seconds: its still runs painted as that many phase frames), or null. */
export const propArtLoop=family=>hasPropArt(family)?ARTISTS[family].loop??null:null;

const looks=new WeakMap();
/** A piece's whole look and its picture key, worked out once per authored appearance. */
function lookOf(appearance,width,height){
    let entry=looks.get(appearance);
    if(!entry||entry.width!==width||entry.height!==height){
        const look=resolvePropLook(PROP_FAMILIES,appearance.family,appearance.look??{}),decor=appearance.decor??{};
        const piece={face:decor.face??appearance.face??'S',vertical:!!(decor.vertical??appearance.vertical),variant:(decor.variant??appearance.variant)|0,candles:!!(decor.candles??appearance.candles),seed:[appearance.x??0,appearance.y??0]};
        entry={width,height,look,piece,key:JSON.stringify([appearance.family,width,height,piece,look])};looks.set(appearance,entry);
    }
    return entry;
}
/** The seeded number the classic art drew a piece's detail from, so each piece keeps its old look. */
const picker=([x,y])=>k=>{const v=Math.sin(x*12.9898+y*78.233+k*37.719)*43758.5453;return v-Math.floor(v);};

/**
 * What one piece shows: `appearance` is its authored placement (family, look, face, vertical, candles, x and
 * y where it was placed, which seed its detail); `state` what has happened to it in play, as plain flags
 * ({searched: true}: a lost thing lies open), which its artist reads as `piece.state` and its pictures are
 * kept apart by; `position` and `rotation` its centre's pose now.
 */
export function propArtPacket({appearance,state=null,position,rotation=0,width,height}){
    if(!hasPropArt(appearance?.family))throw new TypeError(`No native art for prop family ${appearance?.family}`);
    const {look,piece,key}=lookOf(appearance,width,height),flags=Object.freeze({...state});
    return {family:appearance.family,key:state?`${key}|${JSON.stringify(flags)}`:key,look,width,height,...piece,state:flags,position:[...position],rotation};
}

/** The piece's draws in order: {key, bounds, matrix, build} for a still run, {matrix, build} for a live one.
 *  `time` is in seconds; `beat` is the music's beat count (a club's kick), else counted from `time`;
 *  `measure(text, font)` sizes a line of text as the host's backend will draw it (a sign fitted to its words). */
export function createPropDraws(packet,{time=0,beat=null,measure=measureText}={}){
    const artist=ARTISTS[packet.family],{width:w,height:h}=packet,loop=artist.loop;
    let frame=null;
    if(loop){frame=Math.round((time%loop.period)/loop.period*loop.frames)%loop.frames;time=frame*loop.period/loop.frames;}
    const piece={width:w,height:h,face:packet.face,vertical:packet.vertical,variant:packet.variant,candles:packet.candles,state:packet.state,seed:packet.seed,pick:picker(packet.seed),measure,time,beat:beat??time*BPM/60};
    const [px,py]=packet.position,c=Math.cos(packet.rotation),s=Math.sin(packet.rotation);
    const pose=[c,s,-s,c,px,py],matrix=[c,s,-s,c,px-c*w/2+s*h/2,py-s*w/2-c*h/2],pad=artist.pad??PAD;
    const scene=fn=>()=>{const scene=new artScene();fn(scene);return scene.finish();};
    const draws=[{matrix:pose,build:scene(s=>groundShadow(s,0,0,w/2+5,h/2+5))}];
    let run=0;
    artist.draw({
        still:fn=>{draws.push({key:`${packet.key}#${run++}${frame===null?'':`@${frame}`}`,bounds:[-pad,-pad,w+2*pad,h+2*pad],matrix,build:scene(fn)});},
        live:fn=>{draws.push({matrix,build:scene(fn)});}
    },piece,packet.look);
    return draws;
}

/**
 * Draws a piece on a host Canvas pass (the migration boundary, as canvasRenderer.drawPackets): still
 * runs through `pictures` (a Basement pictureCache), live parts and the shadow as vector packets.
 */
export function drawPropArt(context,packet,{pictures,time=0,beat=null}){
    for(const draw of createPropDraws(packet,{time,beat})){
        if(draw.key)pictures.draw(context,draw,draw.build);
        else{context.save();try{context.transform(...draw.matrix);canvasRenderer.drawPackets(context,draw.build());}finally{context.restore();}}
    }
}
