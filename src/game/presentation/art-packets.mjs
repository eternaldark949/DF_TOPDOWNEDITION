import {transform,inverse} from '../../engine/basement/rendering/values.mjs';
const identity=()=>[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const geometry=commands=>Array.isArray(commands)?{type:'path',commands:commands.map(command=>[...command])}:structuredClone(commands);
export const ellipse=(x,y,rx,ry,rotation=0,start=0,end=Math.PI*2,reverse=0)=>['ellipse',x,y,rx,ry,rotation,start,end,Number(reverse)];
export const circle=(x,y,r,start=0,end=Math.PI*2)=>ellipse(x,y,r,r,0,start,end);
export const linear=(from,to,stops)=>({type:'linear',from,to,stops});
export const radial=(from,inner_radius,to,outer_radius,stops)=>({type:'radial',from,inner_radius,to,outer_radius,stops});
/** Small data-only scene builder. There is no Canvas interface, device handle or command replay here. */
export class artScene{
 packets=[];matrix=identity();style={fill:'#000',stroke:'#000',stroke_width:1,line_cap:'butt',line_join:'miter',dash:[],opacity:1,blend:'normal'};clips=[];#stack=[];
 enter(pose={}){this.#stack.push({matrix:this.matrix,style:this.style,clips:this.clips});this.matrix=multiply(this.matrix,transform(pose));this.style={...this.style};this.clips=[...this.clips];return this;}
 leave(){const state=this.#stack.pop();if(!state)throw new Error('Unbalanced art group');Object.assign(this,state);return this;}
 place(pose){this.matrix=multiply(this.matrix,transform(pose));return this;}
 clip(commands){this.clips.push({geometry:geometry(commands),matrix:[...this.matrix]});return this;}
 paint(commands,material){const {stroke_width,line_cap,line_join,dash}=this.style,inv=this.clips.length?inverse(this.matrix):null;
  this.packets.push({type:'shape',matrix:[...this.matrix],geometry:geometry(commands),material:{fill:null,stroke:null,stroke_width,line_cap,line_join,dash:[...dash],...structuredClone(material)},opacity:this.style.opacity,blend:this.style.blend,clips:this.clips.map(clip=>({geometry:clip.geometry,transform:multiply(inv,clip.matrix)}))});return this;
 }
 finish(){if(this.#stack.length)throw new Error('Unclosed art group');return this.packets;}
}
export function glow(scene,x,y,r,rgb,core=.35){const stops=[[0,`rgba(${rgb},1)`]];if(core>0)stops.push([core,`rgba(${rgb},.45)`]);stops.push([1,`rgba(${rgb},0)`]);scene.paint([circle(x,y,r)],{fill:radial([x,y],0,[x,y],r,stops)});}
export function groundShadow(scene,x,y,rx,ry){scene.enter({position:[x,y],scale:[rx,ry]});scene.paint([circle(0,0,1)],{fill:radial([0,0],0,[0,0],1,[[0,'rgba(0,0,0,.30)'],[.65,'rgba(0,0,0,.24)'],[.85,'rgba(0,0,0,.12)'],[1,'rgba(0,0,0,0)']])});scene.leave();}
