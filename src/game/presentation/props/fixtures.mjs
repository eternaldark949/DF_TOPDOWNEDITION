// Lamp fixtures that stand on furniture, seen from above: the pleated fabric shades of a table or
// floor lamp, unlit (their light is drawn after the darkness, by the lighting) or burning (the hotel
// lobby's), and a spun-brass pendant. Each draws centred on (0, 0) in the scene's current group, at its own size.
import {circle,ellipse,radial,linear} from '../../../engine/basement/rendering/index.mjs';
import {lines} from './draw.mjs';

const BRASS=['#f0d79a','#c9a46a','#8d6a32'],BRONZE='#2a211c',TAU=Math.PI*2;
/** The fixtures by name, as the lamp library has them: the shades' radius, the top ring's, their pleats, fabric and trim. */
export const SHADES={
    shade_floor:{R:13,r0:5,pleats:26,fabric:['#f4ead8','#cdb89a'],trim:'#6e4a22'},
    shade_table:{R:9,r0:3.6,pleats:16,fabric:['#f6ecdc','#d6c2a4'],trim:'#7a2e3c'}
};
const channels=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),toHex=v=>'#'+v.map(c=>Math.round(c).toString(16).padStart(2,'0')).join('');
/** The lamp library's colour helpers: darkened (f < 1) or lifted towards white (f > 1, by f - 1); mixed t of the way to b; tinted t of the way to warm white. */
const shadeHex=(hex,f)=>toHex(channels(hex).map(v=>f<=1?v*f:v+(255-v)*(f-1)));
const mixHex=(a,b,t)=>{const v=channels(b);return toHex(channels(a).map((u,i)=>u+(v[i]-u)*t));};
const tintHex=(hex,t)=>{const W=[255,246,228];return toHex(channels(hex).map((v,i)=>v+(W[i]-v)*t));};
/** A fixture's glass colour: the lamp's own, or warm white when that's missing or a dull grey. */
export function fixtureColor(color){
    if(!/^#[0-9a-f]{6}$/i.test(color||''))return '#ffeebb';
    const v=channels(color);return Math.max(...v)-Math.min(...v)<24&&Math.max(...v)<200?'#ffe2b8':color;
}
function fixtureShadow(s,r){s.fill([ellipse(1.6,2.2,r,r*.94)],'rgba(0,0,0,0.26)');}
function brassKnob(s,x,y,r){s.fill([circle(x,y,r)],radial([x-r*.4,y-r*.45],r*.05,[x,y],r,[[0,BRASS[0]],[.5,BRASS[1]],[1,BRASS[2]]]));}

/** A pleated fabric shade: the cloth falling from the top ring to a braided rim, the socket seen down
 *  through the top; burning (`lit`, in the light's `color`), the cloth glows, hottest by the bulb. */
export function fabricShade(s,{R,r0,pleats,fabric,trim},{lit=false,color='#ffeebb'}={}){
    fixtureShadow(s,R+.6);
    const rim=[];
    for(let i=0;i<=pleats*4;i++){const a=i/(pleats*4)*TAU,r=R-.55*(1-Math.abs(Math.cos(a*pleats/2)));rim.push([i?'line':'move',Math.cos(a)*r,Math.sin(a)*r]);}
    rim.push(['close']);
    const cloth=mixHex(fabric[0],color,.6);
    s.fill(rim,radial([0,0],r0,[0,0],R,lit?[[0,shadeHex(mixHex(cloth,'#f0a050',.15),.97)],[.35,shadeHex(mixHex(cloth,'#e08840',.22),.82)],[1,shadeHex(mixHex(cloth,'#b85a24',.3),.56)]]:[[0,fabric[0]],[1,fabric[1]]]));
    const step=TAU/pleats,folds=[],crests=[];                  // every other fold in shadow, a crest of light between
    for(let i=0;i<pleats;i++){const a=i*step;folds.push(['move',Math.cos(a)*r0,Math.sin(a)*r0],ellipse(0,0,R-.5,R-.5,0,a,a+step*.5),ellipse(0,0,r0,r0,0,a+step*.5,a,1),['close']);}
    s.fill(folds,lit?'rgba(110, 40, 8, 0.3)':'rgba(90, 60, 40, 0.16)');
    for(let i=0;i<pleats;i++){const b=(i+.75)*step;crests.push([Math.cos(b)*(r0+.8),Math.sin(b)*(r0+.8),Math.cos(b)*(R-.9),Math.sin(b)*(R-.9)]);}
    lines(s,crests,lit?'rgba(255, 236, 200, 0.4)':'rgba(255, 255, 255, 0.22)',.45);
    if(!lit)s.fill([circle(0,0,R-.4)],linear([-R,-R],[R,R],[[0,'rgba(255, 255, 255, 0.16)'],[.55,'rgba(255, 255, 255, 0)'],[1,'rgba(40, 20, 10, 0.18)']]));   // daylight on the far slope
    s.stroke([circle(0,0,R-1)],trim,1.3);
    s.stroke([circle(0,0,R-1.2,Math.PI*1.05,Math.PI*1.65)],'rgba(255, 240, 200, 0.35)',.4);
    s.outlined([circle(0,0,r0)],lit?radial([0,0],0,[0,0],r0,[[0,'#ffffff'],[.55,'#fff6e0'],[1,tintHex(color,.5)]]):'#3a2e28',BRASS[1],.9);   // the bulb or its socket, the brass ring, the harp's spider
    lines(s,[[-r0,0,r0,0],[0,-r0,0,r0]],BRASS[2],.6);
    brassKnob(s,0,0,Math.max(1.2,r0*.3));
    s.fill([circle(-.4,-.45,.4)],'rgba(255, 250, 230, 0.8)');
}
/** A spun-brass bell pendant: its dome and the rings spun into it, the cord's cap. */
export function brassPendant(s){
    const R=8.5;
    fixtureShadow(s,R);brassKnob(s,0,0,R);
    for(const r of [3,5.4,7.6])s.stroke([circle(0,0,r)],'rgba(90, 60, 20, 0.45)',.5);
    s.stroke([circle(0,0,6.4,Math.PI*1.1,Math.PI*1.55)],'rgba(255, 245, 210, 0.55)',.6);
    s.fill([circle(0,0,1.5)],BRONZE);
}
/** Draws `fn` centred at (x, y), `scale` times its own size. */
export function fixtureAt(s,x,y,scale,fn){s.enter({position:[x,y],scale:[scale,scale]});fn(s);s.leave();}
