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
