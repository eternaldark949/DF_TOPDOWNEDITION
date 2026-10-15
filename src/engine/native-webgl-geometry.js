// Retained shape geometry: the engine's universal path for vector art.
// Every solid fill and stroke a Canvas-style routine issues is keyed by its shape in the
// coordinates it was authored in (before the current transform). A shape seen again in a
// later frame is triangulated once into a GPU geometry and from then on only moved: its
// transform, colour and alpha change per frame, its triangles never do. Characters' rigid
// parts, props, signs and building details all qualify without per-entity code; shapes that
// genuinely change every frame (a swinging hem, a flame) fall through to the live tessellator.
(() => {
    const P=NativeVectorContext.prototype;
    const SEEN_TTL=90,REC_TTL=240,SWEEP=60,MAX_RECS=4096;
    // Matrix revision: any transform change bumps it so a path knows whether its parts share one frame.
    for(const name of ['transform','setTransform','resetTransform','restore']){
        const base=P[name];P[name]=function(...a){const r=base.apply(this,a);this.mrev=(this.mrev||0)+1;return r;};
    }
    const begin=P.begin;
    P.begin=function(){
        begin.call(this);this.mrev=(this.mrev||0)+1;
        const frame=this.owner.frameId|0;this.geoFrame=frame;
        if(!this.geo){this.geo=new Map();this.geoSeen=new Map();this.geoStats={hits:0,builds:0,live:0,recs:0};}
        else if(frame-(this.geoSwept||0)>=SWEEP){this.geoSwept=frame;this.sweepGeometry(frame);}
        this.geoStats.hits=this.geoStats.builds=this.geoStats.live=0;this.geoStats.recs=this.geo.size;
        if(this.geo)for(const rec of this.geo.values())rec.used=0;
    };
    P.sweepGeometry=function(frame){
        for(const [k,f]of this.geoSeen)if(frame-f>SEEN_TTL)this.geoSeen.delete(k);
        const over=this.geo.size>MAX_RECS;
        for(const [k,rec]of this.geo)if(frame-rec.frame>REC_TTL||(over&&frame-rec.frame>2))this.dropGeometry(k,rec);
    };
    P.dropGeometry=function(key,rec){
        for(const n of rec.nodes){const i=this.pool.indexOf(n);if(i>=0)this.pool.splice(i,1);if(n.parent)n.parent.removeChild(n);n.destroy();}
        rec.builder.destroy();this.geo.delete(key);
    };
    const destroy=P.destroy;
    P.destroy=function(){if(this.geo){for(const rec of this.geo.values())rec.builder.destroy();this.geo.clear();}destroy.call(this);};

    // Path recording keeps authored (local) points beside the transformed ones.
    P.moveTo=function(x,y){const p=this.point(x,y);this.part={points:p,local:[x,y],closed:false,mrev:this.mrev,mixed:false};this.path.push(this.part);};
    P.lineTo=function(x,y){if(!this.part)return this.moveTo(x,y);const part=this.part;part.points.push(...this.point(x,y));part.local.push(x,y);if(part.mrev!==this.mrev)part.mixed=true;};
    P.curve=function(points,quadratic){
        const part=this.part;if(!part)return;if(part.mrev!==this.mrev)part.mixed=true;
        const a=part.points,l=part.local,last=a.slice(-2),ll=l.slice(-2),q=points.map(p=>this.point(...p));
        const length=q.reduce((s,p,i)=>s+Math.hypot(p[0]-(i?q[i-1][0]:last[0]),p[1]-(i?q[i-1][1]:last[1])),0);
        const n=this.segments(Math.min(24,Math.max(4,Math.ceil(length*(this._flatScale||1)/2))));
        for(let i=1;i<=n;i++){const t=i/n,u=1-t;
            if(quadratic){const [p0,p1]=points;
                a.push(u*u*last[0]+2*u*t*q[0][0]+t*t*q[1][0],u*u*last[1]+2*u*t*q[0][1]+t*t*q[1][1]);
                l.push(u*u*ll[0]+2*u*t*p0[0]+t*t*p1[0],u*u*ll[1]+2*u*t*p0[1]+t*t*p1[1]);}
            else {const [p0,p1,p2]=points;
                a.push(u*u*u*last[0]+3*u*u*t*q[0][0]+3*u*t*t*q[1][0]+t*t*t*q[2][0],u*u*u*last[1]+3*u*u*t*q[0][1]+3*u*t*t*q[1][1]+t*t*t*q[2][1]);
                l.push(u*u*u*ll[0]+3*u*u*t*p0[0]+3*u*t*t*p1[0]+t*t*t*p2[0],u*u*u*ll[1]+3*u*u*t*p0[1]+3*u*t*t*p1[1]+t*t*t*p2[1]);}
        }
    };

    // Segment tape: projection captures (native-webgl-projection.js) draw a layer twice from a
    // nudged camera and need identical topology, so the second pass replays the first pass's
    // curve and arc subdivision counts instead of deriving them from slightly different sizes.
    P.segments=function(n){const t=this.segTape;if(!t)return n;if(t.record){t.list.push(n);return n;}return t.list[t.i++]??n;};
    P.ellipse=function(x,y,rx,ry,rotation,start,end,anticlockwise=false){
        const tau=Math.PI*2,raw=end-start;let span=raw;
        if(!anticlockwise){if(raw>=tau)span=tau;else span=((raw%tau)+tau)%tau;}
        else {if(raw<=-tau)span=-tau;else span=-(((-raw%tau)+tau)%tau);}
        const n=this.segments(Math.max(2,Math.ceil(Math.abs(span)*Math.max(4,Math.sqrt(Math.max(rx,ry))*2)))),c=Math.cos(rotation),s=Math.sin(rotation);
        for(let i=0;i<=n;i++){const a=start+span*i/n,px=x+Math.cos(a)*rx*c-Math.sin(a)*ry*s,py=y+Math.cos(a)*rx*s+Math.sin(a)*ry*c;
            if(!this.part)this.moveTo(px,py);else this.lineTo(px,py);}
    };
    // Shape key: authored points (1/256 px), closure, rule and stroke shape. Two independent
    // 32-bit hashes keep accidental collisions out of reach for a few thousand live shapes.
    // Translation-invariant: points are taken relative to the first one, so the same shape drawn
    // somewhere else (a bouncing curl, a stepping foot) reuses its geometry.
    function shapeKey(paths,extra,ox,oy){
        let h1=2166136261,h2=5381;const mix=v=>{h1=Math.imul(h1^v,16777619);h2=(Math.imul(h2,33)^v)|0;};
        for(let i=0;i<extra.length;i++)mix(extra.charCodeAt(i));
        for(const p of paths){mix(p.closed?1:2);const l=p.local;mix(l.length);for(let i=0;i<l.length;i+=2){mix(((l[i]-ox)*256)|0);mix(((l[i+1]-oy)*256)|0);}}
        return (h1>>>0).toString(36)+':'+(h2>>>0).toString(36);
    }
    // Paths built entirely under one transform qualify; returns that transform (the current one).
    function sharedFrame(ctx,paths){
        if(!paths.length)return null;const r=paths[0].mrev;
        for(const p of paths)if(p.mixed||p.mrev!==r||!p.local)return null;
        return r===ctx.mrev?ctx.matrix:null;
    }
    const BLEND={lighter:'ADD','destination-out':'ERASE',screen:'SCREEN',multiply:'MULTIPLY'};
    // Draw resident geometry `key` (built from `local` on first use) under transform m.
    P.retained=function(kind,style,build,local,key,m){
        if(this.retainedOff||this.owner.layers?.retainedGeometry===false)return false;
        if(typeof style!=='string'||this.dash?.length||!m)return false;
        const frame=this.geoFrame;let rec=this.geo.get(key);
        if(!rec){
            // One-off shapes stay live; a shape seen in an earlier frame earns resident geometry.
            const seen=this.geoSeen.get(key);if(seen===undefined||seen===frame){this.geoSeen.set(key,frame);this.geoStats.live++;return false;}
            const builder=new PIXI.Graphics();build(builder,typeof local==='function'?local():local);
            rec={builder,nodes:[],used:0,frame};this.geo.set(key,rec);this.geoSeen.delete(key);this.geoStats.builds++;
        }else this.geoStats.hits++;
        rec.frame=frame;
        let n=rec.nodes[rec.used];
        if(!n){n=new PIXI.Graphics(rec.builder.geometry);rec.nodes.push(n);this.pool.push(n);}
        rec.used++;n.visible=true;n.mask=null;this.container.addChild(n);
        const c=this.color(style);n.tint=c.color;n.alpha=c.alpha*this.globalAlpha;n.blendMode=PIXI.BLEND_MODES[BLEND[this.globalCompositeOperation]||'NORMAL'];
        n.transform.setFromMatrix(m);this.current=null;
        this.hashValue(key);this.hashValue(style);this.hashValue(this.globalAlpha);this.hashValue(this.globalCompositeOperation);
        this.hashValue(m.a);this.hashValue(m.b);this.hashValue(m.c);this.hashValue(m.d);this.hashValue(m.tx);this.hashValue(m.ty);
        this.pathsPainted++;return true;
    };
    // Authored Path2D objects are flattened once per scale band in their own space, then reused:
    // no replay, no curve subdivision and no point hashing on later frames.
    const flatCache=new WeakMap();let pathUid=0;
    P.flatPath=function(path){
        if(!path?.nativeCommands)return null;
        const m=this.matrix,s=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))||1,band=Math.round(Math.log2(s)*2);
        let bands=flatCache.get(path);if(!bands){bands=new Map();bands.uid=++pathUid;flatCache.set(path,bands);}
        let f=bands.get(band);
        if(!f){
            const matrix=this.matrix,saved=this.path,part=this.part,stack=this.stack.length;
            this.matrix=new PIXI.Matrix();this._flatScale=Math.pow(2,band/2);this.beginPath();
            try{this.replay(path);f={parts:this.path.map(p=>({points:p.points,closed:p.closed})),key:'p'+bands.uid+':'+band};}
            finally{this._flatScale=0;this.stack.length=stack;this.matrix=matrix;this.path=saved;this.part=part;this.mrev++;}
            bands.set(band,f);
        }
        return f;
    };
    P.worldParts=function(parts,m){
        return parts.map(p=>{const a=p.points,o=new Array(a.length);for(let i=0;i<a.length;i+=2){const x=a[i],y=a[i+1];o[i]=m.a*x+m.c*y+m.tx;o[i+1]=m.b*x+m.d*y+m.ty;}return {points:o,local:a,closed:p.closed,mrev:this.mrev,mixed:false};});
    };
    // Shared front end for fill and stroke: resident geometry when it qualifies, otherwise the
    // live tessellator, fed already-flattened points for Path2D input.
    P.drawShape=function(path,kind,style,build,live){
        const flat=path&&typeof path==='object'?this.flatPath(path):null;
        if(flat){
            if(this.retained(kind,style,build,flat.parts,flat.key+kind,this.matrix))return;
            const prev=this.path,part=this.part;this.path=this.worldParts(flat.parts,this.matrix);
            try{return live(true);}finally{this.path=prev;this.part=part;}
        }
        if(!path||typeof path==='string'){
            const paths=this.path,m=sharedFrame(this,paths);
            if(m&&typeof style==='string'&&!this.retainedOff){
                const ox=paths[0].local[0],oy=paths[0].local[1];
                const local=()=>paths.map(p=>({points:p.local.map((v,i)=>v-(i&1?oy:ox)),closed:p.closed}));
                if(this.retained(kind,style,build,local,shapeKey(paths,kind,ox,oy),new PIXI.Matrix(m.a,m.b,m.c,m.d,m.a*ox+m.c*oy+m.tx,m.b*ox+m.d*oy+m.ty)))return;
            }
        }
        return live(false);
    };
    const fill=P.fill,stroke=P.stroke;
    P.fill=function(path,rule){
        if(this.globalAlpha<=0)return;
        const evenodd=(typeof path==='string'?path:rule)==='evenodd';
        return this.drawShape(path,evenodd?'fe':'fn',this.fillStyle,(g,local)=>{g.beginFill(0xffffff,1);this.polygons(g,local,evenodd);g.endFill();},
            flat=>fill.call(this,flat?rule:path,rule));
    };
    P.stroke=function(path){
        const w=this.lineWidth,cap=this.lineCap,join=this.lineJoin;
        return this.drawShape(path,'s'+w+cap+join,this.strokeStyle,(g,local)=>{g.lineStyle({width:w,color:0xffffff,alpha:1,cap,join});
                for(const p of local){if(p.points.length<4)continue;g.moveTo(p.points[0],p.points[1]);for(let i=2;i<p.points.length;i+=2)g.lineTo(p.points[i],p.points[i+1]);if(p.closed)g.closePath();}
                g.lineStyle(0);},
            flat=>stroke.call(this,flat?undefined:path));
    };
})();
