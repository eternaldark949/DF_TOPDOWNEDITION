// The drawing helpers every prop artist repeats, on the art toolkit: the classic art's rounded box,
// disc and line runs, a choice by the piece's number, and turning a piece to its face.
import {circle,seededRandom} from '../../../engine/basement/rendering/index.mjs';

export const FACE={S:0,W:Math.PI/2,N:Math.PI,E:-Math.PI/2};

/** A filled and/or outlined rounded box, as the classic art's `rr`: the backend's own rounded rectangle, so its corners are a canvas roundRect's exactly. A gradient fill is drawn in the box's own frame, about its centre. */
export function box(s,x,y,w,h,r,fill,stroke,width=1){s.enter({position:[x+w/2,y+h/2]});s.paint({type:'rect',size:[w,h],radius:r},{fill:fill??null,stroke:stroke??null,stroke_width:width});s.leave();}
/** A filled and/or outlined circle, as the classic art's `circ`. */
export function disc(s,cx,cy,r,fill,stroke,width=1){s.paint([circle(cx,cy,r)],{fill:fill??null,stroke:stroke??null,stroke_width:width});}
/** Separate discs [x, y, r] as one path: each its own subpath, so a fill never joins them. */
export function dots(points){return points.flatMap(([x,y,r])=>[['move',x+r,y],circle(x,y,r)]);}
/** Straight segments [x1, y1, x2, y2] stroked as one path. */
export function lines(s,segments,color,width){s.stroke(segments.flatMap(([a,b,c,d])=>[['move',a,b],['line',c,d]]),color,width);}
/** One of `list`, chosen by the piece's number `k`: the first above one half, as the classic art chose between two. */
export function choose(list,p){return list[list.length-1-Math.min(list.length-1,Math.floor(p*list.length))];}
/** Draws `fn(X, Y, W, H)` as the piece stands facing south, turned to its face about its centre. */
export function turned(s,piece,fn){
    const a=FACE[piece.face]??0,side=Math.abs(Math.sin(a))>.5,W=side?piece.height:piece.width,H=side?piece.width:piece.height;
    s.enter({position:[piece.width/2,piece.height/2],rotation:a});fn(-W/2,-H/2,W,H);s.leave();
}
/**
 * A crescent: the disc (cx, cy, r) with the disc (bx, by, br) bitten out of it, as one closed outline
 * (the far arc of the first circle, then back along the bite). The classic art cut the bite with a
 * destination-out composite, which also cut through whatever lay beneath; this keeps what is beneath.
 */
export function crescent(cx,cy,r,bx,by,br){
    const dx=bx-cx,dy=by-cy,d=Math.hypot(dx,dy),phi=Math.atan2(dy,dx);
    const a=(r*r-br*br+d*d)/(2*d),alpha=Math.acos(Math.max(-1,Math.min(1,a/r))),beta=Math.acos(Math.max(-1,Math.min(1,(d-a)/br)));
    // The first circle from one meeting point round its far side to the other; the bite's circle back through the side that faces it.
    return [['ellipse',cx,cy,r,r,0,phi+alpha,phi+TAU-alpha,0],['ellipse',bx,by,br,br,0,phi+Math.PI+beta,phi+Math.PI-beta,1],['close']];
}
const TAU=Math.PI*2;
/** The classic art's seeded random (a string seed hashed, then the Basement's generator), so a piece scatters its detail as it did. */
export function classicRandom(seed){let h=2166136261;for(const ch of String(seed)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return seededRandom(h>>>0);}
