// The drawing helpers every prop artist repeats, on the art toolkit: the classic art's rounded box,
// disc and line runs, a choice by the piece's number, and turning a piece to its face.
import {circle} from '../../../engine/basement/rendering/index.mjs';

export const FACE={S:0,W:Math.PI/2,N:Math.PI,E:-Math.PI/2};

/** A filled and/or outlined rounded box, as the classic art's `rr`: the backend's own rounded rectangle, so its corners are a canvas roundRect's exactly. */
export function box(s,x,y,w,h,r,fill,stroke,width=1){s.enter({position:[x+w/2,y+h/2]});s.paint({type:'rect',size:[w,h],radius:r},{fill:fill??null,stroke:stroke??null,stroke_width:width});s.leave();}
/** A filled and/or outlined circle, as the classic art's `circ`. */
export function disc(s,cx,cy,r,fill,stroke,width=1){s.paint([circle(cx,cy,r)],{fill:fill??null,stroke:stroke??null,stroke_width:width});}
/** Straight segments [x1, y1, x2, y2] stroked as one path. */
export function lines(s,segments,color,width){s.stroke(segments.flatMap(([a,b,c,d])=>[['move',a,b],['line',c,d]]),color,width);}
/** One of `list`, chosen by the piece's number `k`: the first above one half, as the classic art chose between two. */
export function choose(list,p){return list[list.length-1-Math.min(list.length-1,Math.floor(p*list.length))];}
/** Draws `fn(X, Y, W, H)` as the piece stands facing south, turned to its face about its centre. */
export function turned(s,piece,fn){
    const a=FACE[piece.face]??0,side=Math.abs(Math.sin(a))>.5,W=side?piece.height:piece.width,H=side?piece.width:piece.height;
    s.enter({position:[piece.width/2,piece.height/2],rotation:a});fn(-W/2,-H/2,W,H);s.leave();
}
