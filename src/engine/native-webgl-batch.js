// Shape batches: the engine's output stage for solid vector art.
// A Canvas-style routine's solid fills and strokes are written straight into one GPU vertex
// stream per run of shapes (same container, blend mode and face tag) and drawn with a single
// call, in painter's order. Triangulation is cached by topology: a shape whose outline has the
// same structure as one seen before (point counts and convex/reflex pattern per subpath)
// reuses its triangles, so a moving limb, a swaying strand or a breathing torso costs only
// its new point positions. Strokes are expanded here with a fixed topology per point count.
// Textured fills (gradients, patterns), clips, images and text keep their own nodes.
class NativeShapeBatch extends PIXI.Mesh {
    static shader(){
        return NativeShapeBatch._shader||(NativeShapeBatch._shader=PIXI.Shader.from(`precision highp float;
            attribute vec2 aPos;attribute vec4 aColor;uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec4 vColor;
            void main(){vColor=aColor;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aPos,1.)).xy,0.,1.);}`,
            `precision mediump float;varying vec4 vColor;uniform float uAlpha;void main(){gl_FragColor=vColor*uAlpha;}`,{uAlpha:1}));
    }
    constructor(){
        const g=new PIXI.Geometry().addAttribute('aPos',new PIXI.Buffer(new Float32Array(0),false,false),2).addAttribute('aColor',new PIXI.Buffer(new Float32Array(0),false,false),4).addIndex(new PIXI.Buffer(new Uint16Array(0),false,true));
        super(g,NativeShapeBatch.shader());
        this.pos=new Float32Array(256);this.col=new Float32Array(512);this.idx=new Uint32Array(384);this.reset();
    }
    reset(){this.vn=0;this.inN=0;this.dirty=true;this.minX=this.minY=Infinity;this.maxX=this.maxY=-Infinity;}
    clear(){this.reset();}
    reserve(v,i){
        if((this.vn+v)*2>this.pos.length){let n=this.pos.length;while(n<(this.vn+v)*2)n*=2;const p=new Float32Array(n);p.set(this.pos);this.pos=p;const c=new Float32Array(n*2);c.set(this.col);this.col=c;}
        if(this.inN+i>this.idx.length){let n=this.idx.length;while(n<this.inN+i)n*=2;const x=new Uint32Array(n);x.set(this.idx);this.idx=x;}
    }
    vertex(x,y,r,g,b,a){const v=this.vn++,p=v*2,c=v*4;this.pos[p]=x;this.pos[p+1]=y;this.col[c]=r;this.col[c+1]=g;this.col[c+2]=b;this.col[c+3]=a;
        if(x<this.minX)this.minX=x;if(x>this.maxX)this.maxX=x;if(y<this.minY)this.minY=y;if(y>this.maxY)this.maxY=y;return v;}
    upload(){
        if(!this.dirty)return;this.dirty=false;const g=this.geometry,big=this.vn>65535;
        g.getBuffer('aPos').update(this.pos.subarray(0,this.vn*2));g.getBuffer('aColor').update(this.col.subarray(0,this.vn*4));
        const ib=g.getIndex();if(big){ib.update(this.idx.slice(0,this.inN));}else {const u=ib.data instanceof Uint16Array&&ib.data.length>=this.inN?ib.data:new Uint16Array(Math.max(64,this.inN*2));for(let i=0;i<this.inN;i++)u[i]=this.idx[i];ib.update(u.subarray(0,this.inN));}
        this.size=this.inN;this.start=0;
    }
    _render(renderer){if(!this.inN)return;this.upload();this.shader.uniforms.uAlpha=this.worldAlpha;super._render(renderer);}
    _calculateBounds(){if(this.vn)this._bounds.addFrame(this.transform,this.minX,this.minY,this.maxX,this.maxY);}
    containsPoint(){return false;}
}

(() => {
    const P=NativeVectorContext.prototype;
    const BLEND={lighter:'ADD','destination-out':'ERASE',screen:'SCREEN',multiply:'MULTIPLY'};
    const topo=new Map();const TOPO_MAX=8192;
    // Topology key of one polygon: point count and the convex/reflex turn at each vertex.
    function polyKey(a,n){
        let k=n+':',bits=0,cnt=0;
        for(let i=0;i<n;i++){const p=(i+n-1)%n,q=(i+1)%n,cr=(a[i*2]-a[p*2])*(a[q*2+1]-a[i*2+1])-(a[i*2+1]-a[p*2+1])*(a[q*2]-a[i*2]);
            bits=bits<<1|(cr>0?1:0);if(++cnt===28){k+=bits.toString(36)+'.';bits=0;cnt=0;}}
        return k+bits.toString(36);
    }
    // Triangles of polygon a (n points) by topology, re-triangulated if any cached triangle
    // turns the wrong way on these points (the outline changed shape beyond its topology).
    function triangulate(a,n,holes){
        const key=holes?null:polyKey(a,n);let t=key&&topo.get(key);
        if(t){let sign=0,ok=true;
            for(let i=0;i<t.length;i+=3){const i0=t[i]*2,i1=t[i+1]*2,i2=t[i+2]*2,ar=(a[i1]-a[i0])*(a[i2+1]-a[i0+1])-(a[i1+1]-a[i0+1])*(a[i2]-a[i0]);
                if(Math.abs(ar)<1e-6)continue;const s=ar>0?1:-1;if(!sign)sign=s;else if(s!==sign){ok=false;break;}}
            if(ok)return t;}
        t=PIXI.utils.earcut(a.length===n*2?a:a.slice(0,n*2),holes||undefined,2);
        if(key){if(topo.size>=TOPO_MAX)topo.clear();topo.set(key,t);}
        return t;
    }
    P.batchable=function(style){return !this.retainedOff&&this.owner.layers?.shapeBatches!==false&&typeof style==='string'&&!this.dash?.length;};
    P.batch=function(){
        const blend=PIXI.BLEND_MODES[BLEND[this.globalCompositeOperation]||'NORMAL'];
        let b=this.currentBatch;
        if(!b||b.parent!==this.container||b.blendMode!==blend||b._faceTag!==this.faceTag||this.current!==null||this.container.children[this.container.children.length-1]!==b){
            b=this.node(NativeShapeBatch);b.reset();b.blendMode=blend;this.currentBatch=b;
        }
        this.current=null;return b;
    };
    P.batchFill=function(parts,style,evenodd){
        const c=this.color(style),al=c.alpha*this.globalAlpha;if(al<=0)return;
        const r=((c.color>>16)&255)/255*al,g=((c.color>>8)&255)/255*al,bl=(c.color&255)/255*al;
        const b=this.batch();
        const emit=(pts,n,holes)=>{
            if(n<3)return;const tri=triangulate(pts,n,holes);b.reserve(n,tri.length);const base=b.vn;
            for(let i=0;i<n;i++)b.vertex(pts[i*2],pts[i*2+1],r,g,bl,al);
            for(let i=0;i<tri.length;i++)b.idx[b.inN++]=base+tri[i];
        };
        if(evenodd&&parts.length>1){
            const outer=parts[0].points,all=outer.slice(),holes=[];
            for(let i=1;i<parts.length;i++){if(parts[i].points.length<6)continue;holes.push(all.length/2);for(const v of parts[i].points)all.push(v);}
            emit(all,all.length/2,holes.length?holes:null);
        }else for(const p of parts){if(p.points.length>=6)emit(p.points,p.points.length>>1,null);}
        b.dirty=true;
    };
    // Stroke expansion: two vertices per point (mitred, clamped so sharp turns don't spike),
    // butt/square caps by extension, round caps as fans. Fixed topology per point count.
    P.batchStroke=function(parts,style,width){
        const c=this.color(style),al=c.alpha*this.globalAlpha;if(al<=0||width<=0)return;
        const r=((c.color>>16)&255)/255*al,g=((c.color>>8)&255)/255*al,bl=(c.color&255)/255*al,hw=width/2,cap=this.lineCap,b=this.batch();
        for(const part of parts){
            const a=part.points;let n=a.length>>1;if(n<2)continue;const closed=part.closed&&n>2;
            // drop a closing point that repeats the first
            if(closed&&Math.abs(a[0]-a[n*2-2])<1e-6&&Math.abs(a[1]-a[n*2-1])<1e-6)n--;
            const fan=cap==='round'&&!closed?6:0;b.reserve(n*2+(fan?2*(fan+1):0),(closed?n:n-1)*6+(fan?fan*6:0));
            const base=b.vn;let pnx=0,pny=0;
            for(let i=0;i<n;i++){
                const x=a[i*2],y=a[i*2+1];
                const ip=i>0?i-1:closed?n-1:-1,inx=i<n-1?i+1:closed?0:-1;
                let dx0=0,dy0=0,dx1=0,dy1=0;
                if(ip>=0){dx0=x-a[ip*2];dy0=y-a[ip*2+1];const l=Math.hypot(dx0,dy0);if(l>1e-9){dx0/=l;dy0/=l;}else dx0=dy0=0;}
                if(inx>=0){dx1=a[inx*2]-x;dy1=a[inx*2+1]-y;const l=Math.hypot(dx1,dy1);if(l>1e-9){dx1/=l;dy1/=l;}else dx1=dy1=0;}
                if(!dx0&&!dy0){dx0=dx1;dy0=dy1;}if(!dx1&&!dy1){dx1=dx0;dy1=dy0;}
                let nx=-(dy0+dy1),ny=dx0+dx1;let l=Math.hypot(nx,ny);
                if(l<1e-6){nx=-dy1;ny=dx1;l=1;if(!dx1&&!dy1){nx=pnx;ny=pny;}}else{nx/=l;ny/=l;}
                const dot=nx*-dy1+ny*dx1,m=Math.min(4,1/Math.max(.25,Math.abs(dot)||1))*hw;
                let px=x,py=y;
                if(!closed&&cap==='square'){if(i===0){px-=dx1*hw;py-=dy1*hw;}else if(i===n-1){px+=dx0*hw;py+=dy0*hw;}}
                b.vertex(px+nx*m,py+ny*m,r,g,bl,al);b.vertex(px-nx*m,py-ny*m,r,g,bl,al);pnx=nx;pny=ny;
            }
            const seg=closed?n:n-1;
            for(let i=0;i<seg;i++){const p0=base+i*2,p1=base+((i+1)%n)*2;b.idx[b.inN++]=p0;b.idx[b.inN++]=p0+1;b.idx[b.inN++]=p1;b.idx[b.inN++]=p1;b.idx[b.inN++]=p0+1;b.idx[b.inN++]=p1+1;}
            if(fan)for(const end of [0,n-1]){
                const x=a[end*2],y=a[end*2+1],j=end?end-1:1;let dx=(x-a[j*2])*(end?1:-1),dy=(y-a[j*2+1])*(end?1:-1);const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
                const center=b.vertex(x,y,r,g,bl,al),a0=Math.atan2(dy,dx)-Math.PI/2;let prev=-1;
                for(let k=0;k<=fan;k++){const t=a0+Math.PI*k/fan,v=b.vertex(x+Math.cos(t)*hw,y+Math.sin(t)*hw,r,g,bl,al);if(prev>=0){b.idx[b.inN++]=center;b.idx[b.inN++]=prev;b.idx[b.inN++]=v;}prev=v;}
            }
        }
        b.dirty=true;
    };
    // Route solid fills/strokes into batches; everything else keeps the established paths.
    const drawShape=P.drawShape;
    P.drawShape=function(path,kind,style,build,live){
        if(this.batchable(style)){
            let parts=null;
            if(path&&typeof path==='object'){const flat=this.flatPath(path);if(flat)parts=this.worldParts(flat.parts,this.matrix);}
            else parts=this.path;
            if(parts){
                this.hashPath(parts,style);
                if(kind[0]==='f')this.batchFill(parts,style,kind==='fe');
                else {const m=this.matrix,scale=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));this.hashValue(this.lineWidth);this.batchStroke(parts,style,this.lineWidth*scale);}
                this.pathsPainted++;return;
            }
        }
        return drawShape.call(this,path,kind,style,build,live);
    };
    // Any other node breaks the run (draw order); node() is the single place nodes are added.
    const node=P.node;
    P.node=function(Type){const n=node.call(this,Type);if(Type!==NativeShapeBatch)this.currentBatch=null;else n.reset();return n;};
    const begin=P.begin;
    P.begin=function(){this.currentBatch=null;return begin.call(this);};
})();
