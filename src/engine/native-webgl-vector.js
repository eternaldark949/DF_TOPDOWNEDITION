/* Canvas path vocabulary, GPU rasterization. Loaded only by the native fork.
 * Path2D remains a real browser Path2D for portraits/asset bakers; retaining its
 * commands lets the same authored body paths also reach the WebGL tessellator. */
(() => {
    const BrowserPath=window.Path2D;
    class NativeRecordedPath extends BrowserPath {
        constructor(path){super(path);this.nativeCommands=path?.nativeCommands?.slice()||[];}
    }
    for(const name of ['moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','rect','roundRect','closePath','arcTo','addPath']){
        NativeRecordedPath.prototype[name]=function(...args){this.nativeCommands.push([name,args]);return BrowserPath.prototype[name].apply(this,args);};
    }
    window.Path2D=NativeRecordedPath;
    // Landmark caches can cross between live GPU paths and one-time Canvas
    // sprite painters. Convert a native gradient only at the authoring boundary.
    for(const name of ['fillStyle','strokeStyle']){
        const descriptor=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,name);
        Object.defineProperty(CanvasRenderingContext2D.prototype,name,{...descriptor,set(value){
            if(value?.nativeGradient&&!(value instanceof CanvasGradient)){
                const g=value.type?this.createRadialGradient(...value.args):this.createLinearGradient(...value.args);
                for(const [at,color]of value.stops)g.addColorStop(at,color);value=g;
            }descriptor.set.call(this,value);
        }});
    }

    // Cached authored gradients may be created by an asset baker before a live
    // native draw. Retain their stops while preserving real Canvas semantics.
    for(const [name,type]of [['createLinearGradient',0],['createRadialGradient',1]]){
        const make=CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name]=function(...args){const g=make.apply(this,args),add=g.addColorStop.bind(g);
            Object.assign(g,{nativeGradient:true,type,args,stops:[]});g.addColorStop=(at,color)=>{add(at,color);g.stops.push([at,color]);};return g;};
    }

})();

class NativeVectorContext {
    constructor(owner){
        this.owner=owner;this.nativeVector=true;this.root=new PIXI.Container();this.pool=[];this.pools=new Map();this.gradients=[];this.images=new Map();this.imageViews=new Map();this.colors=new Map();
        this.canvas={width:192,height:192};this.begin();
    }
    begin(){
        for(const n of this.pool){n.visible=false;n.mask=null;}
        this.root.removeChildren();for(const list of this.pools.values())list.used=0;this.hash=2166136261;this.gradientIndex=0;this.stack=[];this.matrix=new PIXI.Matrix();this.container=this.root;this.current=null;
        Object.assign(this,{fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',shadowBlur:0,shadowColor:'transparent',font:'11px sans-serif',textAlign:'start',textBaseline:'alphabetic'});
        this.beginPath();this.pathsPainted=0;
    }
    destroy(){for(const n of this.pool)n.mask=null;for(const n of this.pool){if(n.parent)n.parent.removeChild(n);n.destroy();}this.root.destroy();for(const r of this.gradients){r.stage.destroy({children:true});r.texture.destroy(true);}this.gradients=[];this.pool=[];this.pools.clear();for(const t of this.images.values())this.owner.releaseImage(t);this.images.clear();for(const t of this.imageViews.values())t.destroy(false);this.imageViews.clear();}
    node(Type){let list=this.pools.get(Type);if(!list){list=[];list.used=0;this.pools.set(Type,list);}
        let n=list[list.used];if(!n){n=(Type===PIXI.BitmapText?new PIXI.BitmapText('',{fontName:'NativeDetailFont'}):new Type());list.push(n);this.pool.push(n);}list.used++;
        n.visible=true;n.mask=null;this.container.addChild(n);if(n instanceof PIXI.Graphics)n.clear();else if(Type===PIXI.Container)n.removeChildren();return n;
    }
    hashValue(v){if(typeof v==='number'){this.hash=Math.imul(this.hash^Math.round(v*1024),16777619);return;}
        const text=String(v);for(let i=0;i<text.length;i++)this.hash=Math.imul(this.hash^text.charCodeAt(i),16777619);
    }
    hashPath(paths,style){this.hashValue(style);this.hashValue(this.globalAlpha);this.hashValue(this.globalCompositeOperation);
        for(const p of paths){this.hashValue(p.closed);for(const v of p.points)this.hashValue(v);}}
    color(value){
        let c=this.colors.get(value);if(c)return c;
        const color=new PIXI.Color(value);c={color:color.toNumber(),alpha:color.toArray()[3]};
        if(this.colors.size>512)this.colors.clear();this.colors.set(value,c);return c;
    }
    save(){const s={matrix:this.matrix.clone(),container:this.container};
        for(const k of ['fillStyle','strokeStyle','globalAlpha','globalCompositeOperation','lineWidth','lineCap','lineJoin','shadowBlur','shadowColor','font','textAlign','textBaseline'])s[k]=this[k];this.stack.push(s);
    }
    restore(){const s=this.stack.pop();if(!s)return;Object.assign(this,s);this.current=null;}
    transform(a,b,c,d,e,f){this.matrix.append(new PIXI.Matrix(a,b,c,d,e,f));}
    setTransform(a,b,c,d,e,f){this.matrix=a instanceof Object?new PIXI.Matrix(a.a,a.b,a.c,a.d,a.e,a.f):new PIXI.Matrix(a,b,c,d,e,f);}
    resetTransform(){this.matrix.identity();}
    translate(x,y){this.transform(1,0,0,1,x,y);}
    rotate(a){this.transform(Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0);}
    scale(x,y){this.transform(x,0,0,y,0,0);}
    // Hair and cloth still simulate in world space, even though the body raster
    // target is local. Their existing camera-cancellation contract is preserved.
    getTransform(){const m=this.matrix,b=this.worldFrame;
        const v=this.sceneFrame?this.sceneFrame.multiply(new DOMMatrix([m.a,m.b,m.c,m.d,m.tx,m.ty])):b?b.multiply(new DOMMatrix([m.a,m.b,m.c,m.d,m.tx-96,m.ty-96])):m;
        return new DOMMatrix([v.a,v.b,v.c,v.d,v.e??v.tx,v.f??v.ty]);
    }
    setLineDash(values){this.dash=values;}
    beginPath(){this.path=[];this.part=null;}
    point(x,y){const m=this.matrix;return [m.a*x+m.c*y+m.tx,m.b*x+m.d*y+m.ty];}
    moveTo(x,y){const p=this.point(x,y);this.part={points:p,closed:false};this.path.push(this.part);}
    lineTo(x,y){if(!this.part)return this.moveTo(x,y);this.part.points.push(...this.point(x,y));}
    closePath(){if(this.part)this.part.closed=true;}
    curve(points,quadratic){if(!this.part)return;const a=this.part.points,last=a.slice(-2),q=points.map(p=>this.point(...p));
        const length=q.reduce((s,p,i)=>s+Math.hypot(p[0]-(i?q[i-1][0]:last[0]),p[1]-(i?q[i-1][1]:last[1])),0);
        const n=Math.min(24,Math.max(4,Math.ceil(length/2)));
        for(let i=1;i<=n;i++){const t=i/n,u=1-t;
            a.push(quadratic?u*u*last[0]+2*u*t*q[0][0]+t*t*q[1][0]:u*u*u*last[0]+3*u*u*t*q[0][0]+3*u*t*t*q[1][0]+t*t*t*q[2][0],
                quadratic?u*u*last[1]+2*u*t*q[0][1]+t*t*q[1][1]:u*u*u*last[1]+3*u*u*t*q[0][1]+3*u*t*t*q[1][1]+t*t*t*q[2][1]);}
    }
    bezierCurveTo(a,b,c,d,e,f){this.curve([[a,b],[c,d],[e,f]],false);}
    quadraticCurveTo(a,b,c,d){this.curve([[a,b],[c,d]],true);}
    ellipse(x,y,rx,ry,rotation,start,end,anticlockwise=false){
        const tau=Math.PI*2,raw=end-start;let span=raw;
        if(!anticlockwise){if(raw>=tau)span=tau;else span=((raw%tau)+tau)%tau;}
        else {if(raw<=-tau)span=-tau;else span=-(((-raw%tau)+tau)%tau);}
        const n=Math.max(2,Math.ceil(Math.abs(span)*Math.max(4,Math.sqrt(Math.max(rx,ry))*2))),c=Math.cos(rotation),s=Math.sin(rotation);
        for(let i=0;i<=n;i++){const a=start+span*i/n,px=x+Math.cos(a)*rx*c-Math.sin(a)*ry*s,py=y+Math.cos(a)*rx*s+Math.sin(a)*ry*c;
            if(!this.part)this.moveTo(px,py);else this.lineTo(px,py);}
    }
    arc(x,y,r,start,end,anticlockwise){this.ellipse(x,y,r,r,0,start,end,anticlockwise);}
    rect(x,y,w,h){this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();}
    roundRect(x,y,w,h,r){r=Math.min(Math.abs(w)/2,Math.abs(h)/2,typeof r==='number'?r:r?.[0]||0);
        this.moveTo(x+r,y);this.lineTo(x+w-r,y);this.quadraticCurveTo(x+w,y,x+w,y+r);this.lineTo(x+w,y+h-r);this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        this.lineTo(x+r,y+h);this.quadraticCurveTo(x,y+h,x,y+h-r);this.lineTo(x,y+r);this.quadraticCurveTo(x,y,x+r,y);this.closePath();
    }
    replay(path){if(!path?.nativeCommands)throw new Error('Native vector path has no retained commands');
        for(const [name,args]of path.nativeCommands){if(name==='addPath'){this.save();if(args[1])this.transform(args[1].a,args[1].b,args[1].c,args[1].d,args[1].e,args[1].f);this.replay(args[0]);this.restore();}else this[name](...args);}
    }
    withPath(path,fn){if(!path||typeof path==='string')return fn(this.path,path);
        const previous=this.path,part=this.part;this.beginPath();this.replay(path);const result=fn(this.path);this.path=previous;this.part=part;return result;
    }
    graphics(){const blend=this.globalCompositeOperation==='lighter'?PIXI.BLEND_MODES.ADD:this.globalCompositeOperation==='destination-out'?PIXI.BLEND_MODES.ERASE:PIXI.BLEND_MODES.NORMAL;
        if(!this.current||this.current.parent!==this.container||this.current.blendMode!==blend){this.current=this.node(PIXI.Graphics);this.current.blendMode=blend;}
        return this.current;
    }
    polygons(g,path,hole=false){for(let i=0;i<path.length;i++){const p=path[i];if(p.points.length<6)continue;
        if(hole&&i)g.beginHole();g.drawPolygon(p.points);if(hole&&i)g.endHole();}}
    fill(path,rule){this.withPath(path,(paths,r)=>{
        if(this.globalAlpha<=0)return;const g=this.graphics();g.lineStyle(0);const style=this.fillStyle;
        if(style?.nativeGradient){const record=this.gradient(style);g.beginTextureFill({texture:record.texture,matrix:record.matrix,alpha:this.globalAlpha});}
        else {const c=this.color(style);g.beginFill(c.color,c.alpha*this.globalAlpha);}
        this.hashPath(paths,style?.nativeGradient?JSON.stringify([style.args,style.stops,this.matrix.a,this.matrix.b,this.matrix.c,this.matrix.d,this.matrix.tx,this.matrix.ty]):style);this.polygons(g,paths,rule==='evenodd'||r==='evenodd');g.endFill();this.pathsPainted++;
    });}
    stroke(path){this.withPath(path,paths=>{const g=this.graphics(),scale=Math.sqrt(Math.abs(this.matrix.a*this.matrix.d-this.matrix.b*this.matrix.c));
        this.hashPath(paths,this.strokeStyle);this.hashValue(this.lineWidth);if(this.strokeStyle?.nativeGradient){const r=this.gradient(this.strokeStyle);g.lineTextureStyle({width:this.lineWidth*scale,texture:r.texture,matrix:r.matrix,alpha:this.globalAlpha,cap:this.lineCap,join:this.lineJoin});}
        else {const c=this.color(this.strokeStyle);g.lineStyle({width:this.lineWidth*scale,color:c.color,alpha:c.alpha*this.globalAlpha,cap:this.lineCap,join:this.lineJoin});}
        for(const p of paths){if(p.points.length<4)continue;g.moveTo(p.points[0],p.points[1]);for(let i=2;i<p.points.length;i+=2)g.lineTo(p.points[i],p.points[i+1]);if(p.closed)g.closePath();}g.lineStyle(0);this.pathsPainted++;
    });}
    clip(path,rule){this.withPath(path,(paths,r)=>{
        this.hashPath(paths,'clip');this.current=null;const group=this.node(PIXI.Container);group.removeChildren();this.container=group;
        const mask=this.node(PIXI.Graphics);mask.beginFill(0xffffff);this.polygons(mask,paths,rule==='evenodd'||r==='evenodd');mask.endFill();group.mask=mask;
        this.current=null;this.container=group;this.clipCount=(this.clipCount||0)+1;
    });}
    fillRect(x,y,w,h){const old=this.path,part=this.part;this.beginPath();this.rect(x,y,w,h);this.fill();this.path=old;this.part=part;}
    strokeRect(x,y,w,h){const old=this.path,part=this.part;this.beginPath();this.rect(x,y,w,h);this.stroke();this.path=old;this.part=part;}
    drawImage(image,...args){
        let t=this.images.get(image);if(!t){t=this.owner.retainImage(image);this.images.set(image,t);}
        let x,y,w,h;if(args.length===2){[x,y]=args;w=image.width;h=image.height;}else if(args.length===4)[x,y,w,h]=args;
        else if(args.length===8){const [sx,sy,sw,sh,dx,dy,dw,dh]=args,key=[t.baseTexture.uid,sx,sy,sw,sh].join(':');let view=this.imageViews.get(key);
            if(!view){view=new PIXI.Texture(t.baseTexture,new PIXI.Rectangle(sx,sy,sw,sh));this.imageViews.set(key,view);}t=view;[x,y,w,h]=[dx,dy,dw,dh];}
        else throw new Error('Unsupported native image arguments');
        this.current=null;const s=this.node(PIXI.Sprite);s.texture=t;s.alpha=this.globalAlpha;s.blendMode=this.globalCompositeOperation==='lighter'?PIXI.BLEND_MODES.ADD:PIXI.BLEND_MODES.NORMAL;
        this.hashValue(t.baseTexture.uid);this.hashValue(this.globalAlpha);for(const v of [...args,this.matrix.a,this.matrix.b,this.matrix.c,this.matrix.d,this.matrix.tx,this.matrix.ty])this.hashValue(v);
        s.transform.setFromMatrix(this.matrix.clone().append(new PIXI.Matrix(w/t.width,0,0,h/t.height,x,y)));this.current=null;
    }
    measureText(text){const size=Number(/([0-9.]+)px/.exec(this.font)?.[1]||11);return {width:String(text).length*size*.62};}
    fillText(text,x,y){
        this.hashValue(text);this.hashValue(this.font);this.hashValue(this.fillStyle);this.hashValue(this.globalAlpha);this.hashValue(x);this.hashValue(y);
        this.current=null;const n=this.node(PIXI.BitmapText),match=/([0-9.]+)px/.exec(this.font),size=match?Number(match[1]):11;
        n.text=String(text);n.fontSize=size;const color=this.color(this.fillStyle);n.tint=color.color;n.alpha=this.globalAlpha*color.alpha;
        n.blendMode=this.globalCompositeOperation==='lighter'?PIXI.BLEND_MODES.ADD:PIXI.BLEND_MODES.NORMAL;
        const width=n.textWidth,height=n.textHeight,dx=this.textAlign==='center'?-width/2:this.textAlign==='right'||this.textAlign==='end'?-width:0;
        const dy=this.textBaseline==='middle'?-height/2:this.textBaseline==='top'?0:-height*.8;
        n.transform.setFromMatrix(this.matrix.clone().append(new PIXI.Matrix(1,0,0,1,x+dx,y+dy)));this.current=null;
    }
    // The resident glyph atlas includes an outline, keeping pop-size changes
    // and moving damage text off Canvas without a bitmap for each string.
    strokeText(){}
    createRadialGradient(...args){return {nativeGradient:true,type:1,args,matrix:this.matrix.clone(),stops:[],addColorStop(at,color){this.stops.push([at,color]);}};}
    createLinearGradient(...args){return {nativeGradient:true,type:0,args,matrix:this.matrix.clone(),stops:[],addColorStop(at,color){this.stops.push([at,color]);}};}
    gradient(style){
        const index=this.gradientIndex++;let r=this.gradients[index];
        if(!r){const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[0,0,128,0,128,128,0,128],2).addIndex([0,1,2,0,2,3]);
            const shader=PIXI.Shader.from(`precision highp float;attribute vec2 aVertexPosition;uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec2 p;
                void main(){p=aVertexPosition/128.0;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.0,1.0);}`,
                `precision highp float;varying vec2 p;uniform float kind;uniform vec3 c0;uniform vec3 c1;uniform vec4 colors[8];uniform float stops[8];uniform float count;
                void main(){vec2 v=p-c0.xy,d=c1.xy-c0.xy;float t;
                    if(kind<.5)t=dot(v,d)/max(.000001,dot(d,d));else {float dr=c1.z-c0.z,A=dot(d,d)-dr*dr,B=-2.0*(dot(v,d)+c0.z*dr),C=dot(v,v)-c0.z*c0.z;
                        t=abs(A)<.000001?-C/B:(-B-sqrt(max(0.0,B*B-4.0*A*C)))/(2.0*A);}
                    vec4 color=colors[0];for(int i=1;i<8;i++){if(float(i)<count&&t>=stops[i-1])color=mix(colors[i-1],colors[i],clamp((t-stops[i-1])/max(.000001,stops[i]-stops[i-1]),0.0,1.0));}
                    gl_FragColor=vec4(color.rgb*color.a,color.a);}`,
                {kind:0,c0:new Float32Array(3),c1:new Float32Array(3),colors:new Float32Array(32),stops:new Float32Array(8),count:0});
            const stage=new PIXI.Container();stage.addChild(new PIXI.Mesh(geometry,shader));r={stage,shader,texture:PIXI.RenderTexture.create({width:128,height:128}),key:null};this.gradients[index]=r;
        }
        const a=style.args;let ox,oy,sx,sy;
        if(style.type){ox=a[3]-a[5];oy=a[4]-a[5];sx=sy=Math.max(.001,a[5]*2);}
        else {ox=Math.min(a[0],a[2]);oy=Math.min(a[1],a[3]);sx=Math.max(1,Math.abs(a[2]-a[0]));sy=Math.max(1,Math.abs(a[3]-a[1]));}
        const c0=[(a[0]-ox)/sx,(a[1]-oy)/sy,style.type?a[2]/sx:0],c1=[(a[style.type?3:2]-ox)/sx,(a[style.type?4:3]-oy)/sy,style.type?a[5]/sx:0];
        const key=JSON.stringify([style.type,[...c0,...c1].map(v=>Math.round(v*1e6)/1e6),style.stops]);
        if(key!==r.key){const u=r.shader.uniforms;u.kind=style.type;
            u.c0.set(c0);u.c1.set(c1);
            const stops=style.stops.slice().sort((a,b)=>a[0]-b[0]);if(stops.length>8)throw new Error('Native gradient exceeds eight stops');u.count=stops.length;
            stops.forEach(([at,value],i)=>{u.stops[i]=at;const c=this.color(value);u.colors.set([(c.color>>16)/255,((c.color>>8)&255)/255,(c.color&255)/255,c.alpha],i*4);});
            this.owner.renderer.render(r.stage,{renderTexture:r.texture,clear:true});r.key=key;
        }
        r.matrix=this.matrix.clone().append(new PIXI.Matrix(sx/128,0,0,sy/128,ox,oy));return r;
    }
}

// Optional asynchronous GPU measurements. Never request a result until ready;
// unsupported phones still report CPU submission and actual frame cadence.
class NativeGpuTimer {
    constructor(gl){this.gl=gl;this.extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.samples=[];this.status=this.extension?'awaiting GPU samples':'GPU timer unavailable';}
    begin(label,frame){if(!this.extension||this.active||this.pending.length>=12)return;
        const q=this.gl.createQuery();this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT,q);this.active={q,label,frame};}
    end(){if(!this.active)return;this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}
    clear(){for(const e of this.pending)this.gl.deleteQuery(e.q);this.pending=[];this.samples=[];this.active=null;}
    poll(){if(!this.extension||!this.pending.length)return;
        if(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)){this.clear();this.status='disjoint samples discarded';return;}
        while(this.pending.length&&this.gl.getQueryParameter(this.pending[0].q,this.gl.QUERY_RESULT_AVAILABLE)){
            const e=this.pending.shift();this.samples.push({label:e.label,frame:e.frame,ms:this.gl.getQueryParameter(e.q,this.gl.QUERY_RESULT)/1e6});this.gl.deleteQuery(e.q);
            if(this.samples.length>18000)this.samples.shift();this.status='asynchronous GPU samples';}
    }
}
