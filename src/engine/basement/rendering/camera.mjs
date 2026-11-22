// ===== LV0 BASEMENT =====
import {finite,vector,viewport,inverse,point,freezeData} from './values.mjs';
import {heightScale} from './height.mjs';

/** View state only. Following reads native poses; this class never moves a body. */
export class cameraSystem {
    #current;#previous;#viewport;#follow=null;#offset=[0,0];#smoothing=0;#bounds=null;#height=null;
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
    /**
     * How high the camera's eye stands over the ground and how far tall things lean from it (`{eye, lean = 1}`, or
     * null: flat). The render system's `setHeightView` sets it here, so the view checks below lean as the drawing does.
     */
    setHeightView(options){
        if(options===null){this.#height=null;return this;}
        const {eye,lean=1}=options??{};if(!(Number.isFinite(eye)&&eye>0))throw new RangeError('A height view needs an eye above the ground');finite(lean,'lean');
        this.#height=Object.freeze({eye,lean});return this;
    }
    getHeightView(){return this.#height?{...this.#height}:null;}
    /**
     * Is any of a box seen (world units)? `box` is {left, top, right, bottom} or [x, y, width, height]; `height` is
     * its top (number) or its [base, top]: with a height view a thing at height z draws scaled about the camera by
     * k(z), so a box is seen if any of it between its base and its top lands on screen (`margin` world units past it).
     */
    boundsInView(box,{height=0,margin=0,blend=1}={}){
        const b=Array.isArray(box)?{left:box[0],top:box[1],right:box[0]+box[2],bottom:box[1]+box[3]}:box;
        for(const k of ['left','top','right','bottom'])finite(b?.[k],`box ${k}`);finite(margin,'margin',0);
        const [z0,z1]=Array.isArray(height)?height:[0,height];finite(z0,'height base');finite(z1,'height top');
        const v=this.getView(blend),[cx,cy]=v.position,k0=this.#scale(Math.min(z0,z1)),k1=this.#scale(Math.max(z0,z1)),s=v.bounds;
        const x=[b.left,b.right].flatMap(x=>[cx+(x-cx)*k0,cx+(x-cx)*k1]),y=[b.top,b.bottom].flatMap(y=>[cy+(y-cy)*k0,cy+(y-cy)*k1]);
        return Math.max(...x)>=s.left-margin&&Math.min(...x)<=s.right+margin&&Math.max(...y)>=s.top-margin&&Math.min(...y)<=s.bottom+margin;
    }
    /** Is a world point seen, at `height` over the ground (leaning with the height view)? */
    pointInView(position,{height=0,margin=0,blend=1}={}){const [x,y]=vector(position);return this.boundsInView({left:x,top:y,right:x,bottom:y},{height:[height,height],margin,blend});}
    /**
     * Is an entity seen? Its `render` bounds (or `bounds_type` 'collision' or 'light') where it is drawn at `blend`,
     * from its base (`world_elevation`) to its top (plus `height`), leaning with the height view. A destroyed entity is not.
     */
    inView(entity,{margin=0,blend=1,bounds_type='render'}={}){
        if(!entity||typeof entity.getRenderState!=='function')throw new TypeError('inView takes a native entity');
        if(entity.destroyed||!entity.physics_system)return false;
        const b=entity.physics_system.getBodyBounds(entity.body,{bounds_type}),now=entity.position,at=blend===1?now:entity.getRenderState(blend).position,dx=at[0]-now[0],dy=at[1]-now[1];
        const z=entity.world_elevation??0;
        return this.boundsInView({left:b.left+dx,top:b.top+dy,right:b.right+dx,bottom:b.bottom+dy},{height:[z,z+(entity.height??0)],margin,blend});
    }
    #scale(z){const h=this.#height;return h&&z>0?1+(heightScale(z,h.eye)-1)*h.lean:1;}
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

