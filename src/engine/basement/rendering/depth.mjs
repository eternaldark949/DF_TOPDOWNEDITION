// ===== LV0 BASEMENT =====
// DEPTH BATCHES: things that stand up toward the camera (trunk faces, posts, canopies) must be painted
// lowest first, but a frame of them is hundreds of small shapes. Sorted by height, a shape may still join
// an earlier group of the same look when nothing painted since that group overlaps it: the picture is the
// same, painted in a few calls. Plain data in, groups out; the artist paints each group.

const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
// Two convex polygons cross when no edge of either separates them; touching along an edge (within a
// quarter pixel) does not count, so the faces of one post do not hold each other apart.
function separates(p,q){
    for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],nx=a[1]-b[1],ny=b[0]-a[0],len=Math.hypot(nx,ny);if(!len)continue;
        let p0=Infinity,p1=-Infinity,q0=Infinity,q1=-Infinity;
        for(const v of p){const d=(v[0]*nx+v[1]*ny)/len;if(d<p0)p0=d;if(d>p1)p1=d;}
        for(const v of q){const d=(v[0]*nx+v[1]*ny)/len;if(d<q0)q0=d;if(d>q1)q1=d;}
        if(Math.min(p1,q1)-Math.max(p0,q0)<=.25)return true;
    }
    return false;
}
const crosses=(a,b)=>overlap(a.box,b.box)&&(!a.convex||!b.convex||!(separates(a.convex,b.convex)||separates(b.convex,a.convex)));

/**
 * Groups `items` ({z, key, box: [left, top, right, bottom], convex}, key null for one that never groups) for
 * painting in order: lowest z first (ties in the order given), each group one key. An item joins the
 * latest group of its key unless a group of another key painted after that one overlaps its box;
 * `lookback` caps how many groups back it looks. A group is one paint, so where its members overlap they
 * are covered once: that is the same picture for opaque paint, so give translucent paint a null key.
 * An item's `convex` ([[x, y], ...], optional) is its outline when convex: then it is tested exactly, not
 * by its box. Returns the groups as arrays of items, in paint order.
 */
const CELL=64,cells=(box,visit)=>{const x0=Math.floor(box[0]/CELL),x1=Math.floor(box[2]/CELL),y0=Math.floor(box[1]/CELL),y1=Math.floor(box[3]/CELL);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)if(visit(x*65536+y))return true;return false;};
const hits=(group,item)=>overlap(group.box,item.box)&&cells(item.box,cell=>group.grid.get(cell)?.some(other=>crosses(other,item)));
function join(group,item){
    const b=group.box;b[0]=Math.min(b[0],item.box[0]);b[1]=Math.min(b[1],item.box[1]);b[2]=Math.max(b[2],item.box[2]);b[3]=Math.max(b[3],item.box[3]);
    group.items.push(item);cells(item.box,cell=>{let list=group.grid.get(cell);if(!list)group.grid.set(cell,list=[]);list.push(item);return false;});
}
export function depthBatches(items,{lookback=64}={}){
    const order=items.map((item,i)=>[item.z,i]).sort((a,b)=>(a[0]-b[0])||(a[1]-b[1])),groups=[];
    for(const [,i]of order){
        const item=items[i];let target=null;
        if(item.key!==null&&item.key!==undefined)for(let g=groups.length-1,steps=0;g>=0&&steps<lookback;g--,steps++){
            const group=groups[g];
            if(group.key===item.key){target=group;break;}
            if(hits(group,item))break;
        }
        if(!target)groups.push(target={key:item.key,items:[],box:[...item.box],grid:new Map()});
        join(target,item);
    }
    return groups.map(group=>group.items);
}

// OCCLUSION ORDER: heights alone cannot order a scene seen from an eye above the camera. A rail in front of a
// tall wall starts lower than the wall's foot, yet stands between the eye and the wall. Two pieces that each
// say what they fill (a solid: convex footprints and the heights they span) are ordered by what can hide what:
// a piece wholly lower than another never hides it (every sight line comes down from above), and a piece on
// the far side of a line from the other, with the eye on the other's side, never hides it either (the eye's
// sight lines to the near one never cross the line). Everything else keeps the order it was given.
const EPS_Z=1e-6,EPS_XY=.01;
// Whether `a` (one convex footprint) is held off `b` by a line with the eye on b's side.
function heldOff(a,b,eye){
    for(const p of [a,b])for(let i=0;i<p.length;i++){
        const u=p[i],v=p[(i+1)%p.length];let nx=u[1]-v[1],ny=v[0]-u[0];
        for(let turn=0;turn<(p.length===2?2:1);turn++){
            if(turn){const t=nx;nx=-ny;ny=t;}   // (a footprint two points long is a wall: its line, and across its ends)
            const len=Math.hypot(nx,ny);if(!len)continue;
            let a0=Infinity,a1=-Infinity,b0=Infinity,b1=-Infinity;
            for(const q of a){const d=(q[0]*nx+q[1]*ny)/len;if(d<a0)a0=d;if(d>a1)a1=d;}
            for(const q of b){const d=(q[0]*nx+q[1]*ny)/len;if(d<b0)b0=d;if(d>b1)b1=d;}
            const e=(eye[0]*nx+eye[1]*ny)/len;
            // a line between them with the eye on b's side of it: at a's edge, when the eye is past that edge
            if(a1<=b0+EPS_XY&&e>=a1-EPS_XY)return true;
            if(b1<=a0+EPS_XY&&e<=a0+EPS_XY)return true;
        }
    }
    return false;
}
/** Whether solid `a` can hide any of solid `b` from an eye above `a.eye` (false only when it is proved it cannot). */
export function canHide(a,b){
    if(a.z1<=b.z0+EPS_Z)return false;
    if(!a.hulls.length||!b.hulls.length)return true;
    for(const p of a.hulls)for(const q of b.hulls)if(!heldOff(p,q,a.eye))return true;
    return false;
}
const boxesMeet=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
/**
 * `items` in paint order, kept where they are unless what they fill says otherwise. `solid(item)` is null or
 * `{hulls: [[[x, y], ...], ...], z0, z1, box: [left, top, right, bottom], eye: [x, y]}`: its convex
 * footprints in the world, the heights it spans, its box as drawn and the camera under the eye. Items in a
 * row that share one solid move together. `group(item)` keeps items of different groups (layers) apart.
 * Where two solids' boxes meet and one can hide the other but not the other way round, the one that can
 * hide goes after; among the rest, and where solids contradict each other, the given order holds.
 */
export function occlusionOrder(items,{solid=item=>item.solid??null,group=()=>0}={}){
    const pieces=[];
    for(const item of items){const s=solid(item),last=pieces[pieces.length-1];if(s&&last&&last.solid===s&&last.group===group(item))last.items.push(item);else pieces.push({solid:s,group:group(item),items:[item],after:[],need:0,firm:0});}
    const solids=pieces.filter(p=>p.solid);if(solids.length<2)return items;
    // pairs whose boxes meet, by a sweep across x
    const byLeft=solids.slice().sort((a,b)=>a.solid.box[0]-b.solid.box[0]);let edges=0;
    pieces.forEach((p,i)=>p.index=i);
    for(let i=0;i<byLeft.length;i++){const p=byLeft[i],pb=p.solid.box;
        for(let j=i+1;j<byLeft.length&&byLeft[j].solid.box[0]<pb[2];j++){
            const q=byLeft[j];if(q.group!==p.group||q.solid.bias!==p.solid.bias||!boxesMeet(pb,q.solid.box))continue;
            const pq=canHide(p.solid,q.solid),qp=canHide(q.solid,p.solid);if(pq===qp)continue;
            // (a solid of one convex footprint is firm; one of several, spread apart, can stand on both sides of another)
            const [first,then]=pq?[q,p]:[p,q],firm=p.solid.hulls.length===1&&q.solid.hulls.length===1;first.after.push({then,firm});then.need++;if(firm)then.firm++;edges++;
        }
    }
    if(!edges)return items;
    // the given order, bent only where a piece must wait for the ones it can hide
    const heap=[],push=p=>{heap.push(p);let i=heap.length-1;while(i){const up=(i-1)>>1;if(heap[up].index<=heap[i].index)break;[heap[up],heap[i]]=[heap[i],heap[up]];i=up;}},
        pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l].index<heap[m].index)m=l;if(r<heap.length&&heap[r].index<heap[m].index)m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
    for(const p of pieces)if(!p.need)push(p);
    const out=[],done=new Set();
    while(out.length<items.length){
        let p=heap.length?pop():null;
        // Solids that contradict each other (a ring, which only pieces of several footprints can make): the earliest
        // left that waits on no firm piece goes on, so what a firm piece says still holds; failing that, the earliest.
        if(!p){let loose=null,any=null;for(const q of pieces)if(!done.has(q)){any??=q;if(!q.firm){loose=q;break;}}p=loose??any;}
        if(done.has(p))continue;done.add(p);out.push(...p.items);
        for(const {then,firm} of p.after){if(firm)then.firm--;if(--then.need===0&&!done.has(then))push(then);}
    }
    return out;
}
