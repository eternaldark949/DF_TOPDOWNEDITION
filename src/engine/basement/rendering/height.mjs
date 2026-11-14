// ===== LV0 BASEMENT =====
// HEIGHT: art that stands up from the ground, seen by a camera above it. A point at height z draws at
// camera + (point - camera) * k(z), with k(z) = eye / (eye - z): at any one height that is a uniform scale
// about the camera, so a flat thing up there (a roof, an awning) is drawn in world units under one matrix,
// and a wall is the quad between its foot and its leaned top. The parts architecture repeats (walls of
// boxes, fins, ledges, verandas, columns, sills) come back as shapes, for the artist to paint.

const finite=(value,name)=>{if(!Number.isFinite(value))throw new TypeError(`Height ${name} must be a finite number`);return value;};
const quad=(out,a,b,c,d)=>{out.push(['move',a[0],a[1]],['line',b[0],b[1]],['line',c[0],c[1]],['line',d[0],d[1]],['close']);return out;};
const segment=(out,a,b)=>{out.push(['move',a[0],a[1]],['line',b[0],b[1]]);return out;};
const shape=commands=>commands.length?commands:null;

/** How much a point at height `z` is scaled about the camera, for a camera `eye` above the ground (heights
 *  past 86% of the eye are held there, so nothing reaches it). */
export function heightScale(z,eye){finite(z,'z');finite(eye,'eye');if(eye<=0)throw new RangeError('Height eye must be above the ground');return eye/(eye-Math.min(z,eye*.86));}

/** The view of heights from a camera at `camera` ([x, y], world) and `eye` above the ground. `lean`
 *  scales how far everything leans (1: as the camera sees it; a building drawn bolder leans more). */
export class heightView{
    constructor({camera,eye,lean=1}){this.camera=[finite(camera[0],'camera x'),finite(camera[1],'camera y')];this.eye=finite(eye,'eye');this.lean=finite(lean,'lean');}
    /** The scale at height z. */
    k(z){return 1+(heightScale(z,this.eye)-1)*this.lean;}
    /** The view leaning `lean` times as hard. */
    leaning(lean){return lean===this.lean?this:new heightView({camera:this.camera,eye:this.eye,lean});}
    /** Where (x, y) at height z draws. */
    at(x,y,z){return this.scaled(x,y,this.k(z));}
    /** Where (x, y) draws in the plane of scale k. */
    scaled(x,y,k){const [cx,cy]=this.camera;return [cx+(x-cx)*k,cy+(y-cy)*k];}
    /** The matrix that draws world coordinates in the plane of scale k (for `artScene.enter({matrix})`). */
    plane(k){const [cx,cy]=this.camera;return [k,0,0,k,cx*(1-k),cy*(1-k)];}
    /** Can the camera see the face (its outward side toward the camera)? */
    sees(face){const [cx,cy]=this.camera;return (cx-(face.x1+face.x2)/2)*face.nx+(cy-(face.y1+face.y2)/2)*face.ny>0;}
    /**
     * A wall: the face from its foot up to the plane of scale `k`. `at(u, v)` is a point on it (u along the
     * face from its first end, v up it, both 0..1), `quad(u0, u1, v0, v1)` a patch of it, `line(u0, v0, u1, v1)`
     * a line on it, `outline` the whole wall; `length` is the face's length and `depth` how far its top leans.
     */
    wall(face,k){
        const ax=face.x1,ay=face.y1,ex=face.x2-ax,ey=face.y2-ay,[rx1,ry1]=this.scaled(ax,ay,k),[rx2,ry2]=this.scaled(face.x2,face.y2,k);
        const tx=rx2-rx1,ty=ry2-ry1,ux=rx1-ax,uy=ry1-ay;
        const at=(u,v)=>[ax+ex*u+(ux+tx*u-ex*u)*v,ay+ey*u+(uy+ty*u-ey*u)*v];
        return {at,length:Math.hypot(ex,ey),depth:Math.hypot(ux,uy),top:[[rx1,ry1],[rx2,ry2]],
            quad:(u0,u1,v0,v1,out=[])=>quad(out,at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)),
            line:(u0,v0,u1,v1,out=[])=>segment(out,at(u0,v0),at(u1,v1)),
            outline:()=>quad([],[ax,ay],[face.x2,face.y2],[rx2,ry2],[rx1,ry1])};
    }
    /**
     * Vertical plates standing proud of a wall: at each anchor {x, y, nx, ny} (a point on the wall and its
     * outward normal) a plate `w` wide, `out` in front, from height z0 to z1. `front` is every plate's face;
     * `edge` the lit edge of those `lit(anchor)` picks (all of them without it).
     */
    fins(anchors,z0,z1,w,out,lit=null){
        const k0=this.k(z0),k1=this.k(z1),front=[],edge=[];
        for(const a of anchors){
            const tx=-a.ny*w/2,ty=a.nx*w/2,fx=a.x+a.nx*out,fy=a.y+a.ny*out,p0=this.scaled(fx-tx,fy-ty,k0),p1=this.scaled(fx+tx,fy+ty,k0),p2=this.scaled(fx+tx,fy+ty,k1),p3=this.scaled(fx-tx,fy-ty,k1);
            quad(front,p0,p1,p2,p3);if(!lit||lit(a)>.5)segment(edge,p1,p2);
        }
        return {front:shape(front),edge:shape(edge)};
    }
    /**
     * A slab along wall edges ({a: [x, y], b: [x, y], nx, ny}) at height z, `out` deep and `th` thick: its
     * `top`, its front `band` and its front `lip` line.
     */
    ledge(edges,z,out,th){
        const kT=this.k(z),kB=this.k(Math.max(0,z-th)),top=[],band=[],lip=[];
        for(const e of edges){
            const ax=e.a[0]+e.nx*out,ay=e.a[1]+e.ny*out,bx=e.b[0]+e.nx*out,by=e.b[1]+e.ny*out,f0=this.scaled(ax,ay,kT),f1=this.scaled(bx,by,kT);
            quad(top,this.scaled(e.a[0],e.a[1],kT),this.scaled(e.b[0],e.b[1],kT),f1,f0);segment(lip,f0,f1);
            quad(band,this.scaled(ax,ay,kB),this.scaled(bx,by,kB),f1,f0);
        }
        return {top:shape(top),band:shape(band),lip:shape(lip)};
    }
    /** A veranda: a 2 px slab `out` deep (`ledge`) with posts every `step` px and a rail `rh` above it. */
    veranda(edges,z,out,step,rh){
        const slab=this.ledge(edges,z,out,2),kz=this.k(z),kr=this.k(z+rh),posts=[],rail=[];
        for(const e of edges){
            const ax=e.a[0]+e.nx*(out-1),ay=e.a[1]+e.ny*(out-1),bx=e.b[0]+e.nx*(out-1),by=e.b[1]+e.ny*(out-1),n=Math.max(1,Math.round(Math.hypot(bx-ax,by-ay)/step));
            segment(rail,this.scaled(ax,ay,kr),this.scaled(bx,by,kr));
            for(let i=0;i<=n;i++){const x=ax+(bx-ax)*i/n,y=ay+(by-ay)*i/n;segment(posts,this.scaled(x,y,kz),this.scaled(x,y,kr));}
        }
        return {...slab,posts:shape(posts),rail:shape(rail)};
    }
    /** Round columns at `points` from z0 to z1, `r` thick: their `shafts` and `caps`. */
    columns(points,r,z0,z1){
        const k0=this.k(z0),k1=this.k(z1),shafts=[],caps=[];
        for(const [x,y] of points){
            const a=this.scaled(x,y,k0),b=this.scaled(x,y,k1),vx=b[0]-a[0],vy=b[1]-a[1],L=Math.hypot(vx,vy)||1,px=-vy/L,py=vx/L;
            quad(shafts,[a[0]-px*r*k0,a[1]-py*r*k0],[b[0]-px*r*k1,b[1]-py*r*k1],[b[0]+px*r*k1,b[1]+py*r*k1],[a[0]+px*r*k0,a[1]+py*r*k0]);
            caps.push(['move',b[0]+r*1.4*k1,b[1]],['ellipse',b[0],b[1],r*1.4*k1,r*1.4*k1,0,0,Math.PI*2,0]);
        }
        return {shafts:shape(shafts),caps:shape(caps)};
    }
    /** The outline a box covers from its foot to the plane of scale k: the convex hull of `points` (its
     *  footprint) and their leaned copies, as [x, y] points round it. */
    silhouette(points,k){
        const all=[...points,...points.map(([x,y])=>this.scaled(x,y,k))].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),half=list=>{const out=[];for(const p of list){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}out.pop();return out;};
        return [...half(all),...half([...all].reverse())];
    }
    /** Window sills: under each window's bottom edge {x0, y0, x1, y1, nx, ny, z}, a `lip` `out` proud of the wall and its `shade` below. */
    sills(windows,out){
        const lip=[],shade=[];
        for(const w of windows){
            const k=this.k(w.z),ks=this.k(Math.max(0,w.z-1.5)),ax=w.x0+w.nx*out,ay=w.y0+w.ny*out,bx=w.x1+w.nx*out,by=w.y1+w.ny*out;
            segment(lip,this.scaled(ax,ay,k),this.scaled(bx,by,k));segment(shade,this.scaled(ax,ay,ks),this.scaled(bx,by,ks));
        }
        return {lip:shape(lip),shade:shape(shade)};
    }
}

/**
 * The outside walls of a block made of rectangles ({x, y, w, h}, world): each section's edges with the
 * stretches another section stands against taken out, so an L or a U grows no inner walls. Each face is
 * {side: 'N' | 'S' | 'E' | 'W', section, x1, y1, x2, y2, nx, ny} (the outward normal).
 */
export function boxFaces(sections){
    const S=sections.map(s=>({x0:s.x,y0:s.y,x1:s.x+s.w,y1:s.y+s.h})),faces=[];
    const subtract=(segs,a,b)=>segs.flatMap(([lo,hi])=>b<=lo||a>=hi?[[lo,hi]]:[...(a>lo?[[lo,a]]:[]),...(b<hi?[[b,hi]]:[])]);
    S.forEach((s,i)=>{
        for(const e of [{side:'N',fixed:s.y0,lo:s.x0,hi:s.x1,horiz:true},{side:'S',fixed:s.y1,lo:s.x0,hi:s.x1,horiz:true},{side:'W',fixed:s.x0,lo:s.y0,hi:s.y1,horiz:false},{side:'E',fixed:s.x1,lo:s.y0,hi:s.y1,horiz:false}]){
            let segs=[[e.lo,e.hi]];
            S.forEach((o,j)=>{
                if(j===i)return;
                if(e.horiz){if((e.side==='S'&&Math.abs(o.y0-e.fixed)<1)||(e.side==='N'&&Math.abs(o.y1-e.fixed)<1))segs=subtract(segs,o.x0,o.x1);}
                else if((e.side==='E'&&Math.abs(o.x0-e.fixed)<1)||(e.side==='W'&&Math.abs(o.x1-e.fixed)<1))segs=subtract(segs,o.y0,o.y1);
            });
            const nx=e.side==='E'?1:e.side==='W'?-1:0,ny=e.side==='S'?1:e.side==='N'?-1:0;
            for(const [lo,hi] of segs)if(hi-lo>=2)faces.push(e.horiz?{side:e.side,section:i,x1:lo,y1:e.fixed,x2:hi,y2:e.fixed,nx,ny}:{side:e.side,section:i,x1:e.fixed,y1:lo,x2:e.fixed,y2:hi,nx,ny});
        }
    });
    return faces;
}
