// ===== LV0 BASEMENT =====
import {finite,vector,viewport,inverse,point,freezeData} from './values.mjs';

/** View state only. Following reads native poses; this class never moves a body. */
export class cameraSystem {
    #current;#previous;#viewport;#follow=null;#offset=[0,0];#smoothing=0;#bounds=null;
    constructor({position=[0,0],zoom=1,rotation=0,viewport:dimensions={width:640,height:360},bounds=null}={}){
        this.#current={position:vector(position),zoom:finite(zoom,'zoom',.0001),rotation:finite(rotation,'rotation')};
        this.#previous=structuredClone(this.#current);this.#viewport=viewport(dimensions);this.setBounds(bounds);
    }
    get viewport(){return this.#viewport;}
    setViewport(packet){this.#viewport=viewport(packet);return this;}
    setBounds(bounds){
        if(bounds!==null){const {left,top,right,bottom}=bounds;[left,top,right,bottom].forEach(v=>finite(v,'camera bounds'));if(left>=right||top>=bottom)throw new TypeError('Invalid camera bounds');bounds={left,top,right,bottom};}
        this.#bounds=bounds;return this;
    }
    setView({position=this.#current.position,zoom=this.#current.zoom,rotation=this.#current.rotation}={}){
        const next={position:vector(position),zoom:finite(zoom,'zoom',.0001),rotation:finite(rotation,'rotation')};this.#current=next;this.#previous=structuredClone(next);return this;
    }
    follow(entity,{offset=[0,0],smoothing=0,snap=true}={}){
        if(!entity||typeof entity.getRenderState!=='function'||entity.destroyed)throw new TypeError('Follow a live native entity');
        const nextOffset=vector(offset);finite(smoothing,'camera smoothing',0);
        this.#follow=entity;this.#offset=nextOffset;this.#smoothing=smoothing;
        if(snap)this.setView({position:entity.position.map((v,i)=>v+nextOffset[i])});return this;
    }
    stopFollowing(){this.#follow=null;return this;}
    updateState(seconds){
        finite(seconds,'camera seconds',0);this.#previous=structuredClone(this.#current);
        if(this.#follow?.destroyed)this.#follow=null;
        if(this.#follow){const p=this.#follow.position,k=this.#smoothing===0?1:1-Math.exp(-seconds/this.#smoothing);this.#current.position=this.#current.position.map((value,i)=>value+(p[i]+this.#offset[i]-value)*k);}
    }
    getView(blend=1){
        finite(blend,'blend',0);if(blend>1)throw new TypeError('Blend must be in [0,1]');
        const a=this.#previous,b=this.#current,p=a.position.map((v,i)=>v+(b.position[i]-v)*blend),zoom=a.zoom+(b.zoom-a.zoom)*blend,rotation=a.rotation+(b.rotation-a.rotation)*blend;
        const {width,height,pixel_ratio}=this.#viewport,c=Math.cos(rotation),s=Math.sin(rotation),hx=(Math.abs(c)*width+Math.abs(s)*height)/zoom/2,hy=(Math.abs(s)*width+Math.abs(c)*height)/zoom/2;
        if(this.#bounds){const box=this.#bounds;for(const [i,lo,hi,h]of [[0,box.left,box.right,hx],[1,box.top,box.bottom,hy]])p[i]=hi-lo<2*h?(lo+hi)/2:Math.max(lo+h,Math.min(hi-h,p[i]));}
        const m=[c*zoom,-s*zoom,s*zoom,c*zoom,width/2-(c*p[0]+s*p[1])*zoom,height/2-(-s*p[0]+c*p[1])*zoom];
        return freezeData({position:p,zoom,rotation,width,height,pixel_ratio,world_to_screen:m,screen_to_world:inverse(m),bounds:{left:p[0]-hx,top:p[1]-hy,right:p[0]+hx,bottom:p[1]+hy}});
    }
    worldToScreen(position,blend=1){return point(this.getView(blend).world_to_screen,vector(position));}
    screenToWorld(position,blend=1){return point(this.getView(blend).screen_to_world,vector(position));}
    clientToWorld(position,bounds,blend=1){
        const p=vector(position),v=this.#viewport;finite(bounds.left,'surface left');finite(bounds.top,'surface top');finite(bounds.width,'surface width',.0001);finite(bounds.height,'surface height',.0001);
        return this.screenToWorld([(p[0]-bounds.left)*v.width/bounds.width,(p[1]-bounds.top)*v.height/bounds.height],blend);
    }
    worldToClient(position,bounds,blend=1){
        const p=this.worldToScreen(position,blend),v=this.#viewport;finite(bounds.left,'surface left');finite(bounds.top,'surface top');finite(bounds.width,'surface width',.0001);finite(bounds.height,'surface height',.0001);
        return [bounds.left+p[0]*bounds.width/v.width,bounds.top+p[1]*bounds.height/v.height];
    }
    getVisibleBounds({blend=1,margin=0}={}){finite(margin,'margin',0);const b=this.getView(blend).bounds;return Object.freeze({left:b.left-margin,top:b.top-margin,right:b.right+margin,bottom:b.bottom+margin});}
}

/**
 * How far past each side of the view to ready what the camera will show next: `margin` all round, and
 * `lead` seconds of `velocity` (world units a second) on the side it is moving toward. Returns
 * `{left, top, right, bottom}` margins, for a tiled layer's `ahead`.
 */
export function aheadOf({margin=0,velocity=[0,0],lead=1}={}){
    finite(margin,'margin',0);finite(lead,'lead',0);const [vx,vy]=vector(velocity,'velocity');
    return Object.freeze({left:margin+Math.max(0,-vx*lead),top:margin+Math.max(0,-vy*lead),right:margin+Math.max(0,vx*lead),bottom:margin+Math.max(0,vy*lead)});
}
/** The view grown by `ahead`: a number of px all round, or per-side margins `{left, top, right, bottom}`. */
export function viewAhead(view,ahead=0){
    const m=typeof ahead==='number'?{left:ahead,top:ahead,right:ahead,bottom:ahead}:ahead;
    for(const k of ['left','top','right','bottom'])finite(m[k],`ahead ${k}`,0);
    return {left:view.left-m.left,top:view.top-m.top,right:view.right+m.right,bottom:view.bottom+m.bottom};
}

