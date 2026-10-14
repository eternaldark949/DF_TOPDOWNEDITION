// Two resident meshes replace thousands of stroke/circle tessellation vertices.
// Simulation remains authoritative; quads use the authored projection/lag math.
const NATIVE_RAIN_CORNERS=[[-1,-1],[1,-1],[1,1],[-1,1]];
class NativeRainMesh extends PIXI.Mesh {
    constructor(kind){
        const buffer=new PIXI.Buffer(new Float32Array(0),false,false),geometry=new PIXI.Geometry();
        geometry.addAttribute('aVertexPosition',buffer,2,false,PIXI.TYPES.FLOAT,56,0)
            .addAttribute('aLocal',buffer,4,false,PIXI.TYPES.FLOAT,56,8)
            .addAttribute('aStyle',buffer,4,false,PIXI.TYPES.FLOAT,56,24)
            .addAttribute('aLight',buffer,4,false,PIXI.TYPES.FLOAT,56,40).addIndex(new Uint16Array(0));
        const shader=PIXI.Shader.from(`precision highp float;attribute vec2 aVertexPosition;attribute vec4 aLocal;attribute vec4 aStyle;attribute vec4 aLight;
            uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec4 local;varying vec4 style;varying vec4 light;
            void main(){local=aLocal;style=aStyle;light=aLight;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.)).xy,0.,1.);}`,
            `precision highp float;uniform float kind;varying vec4 local;varying vec4 style;varying vec4 light;
            float coverage(float d){return 1.-smoothstep(-.5,.5,d);}
            float capsule(float width){return coverage(length(vec2(max(abs(local.x)-local.z,0.),local.y))-width);}
            void main(){vec3 rgb;float alpha;
                if(kind<.5){float a=style.x*capsule(local.w),c=style.x*.3*style.y*capsule(max(.15,local.w*.35));
                    rgb=vec3(185.,195.,220.)/255.*a*(1.-c)+vec3(210.,220.,240.)/255.*c;alpha=a*(1.-c)+c;
                    float lit=light.a*capsule(local.w*(1.+style.z*.6));rgb=rgb*(1.-lit)+light.rgb*lit;alpha=alpha*(1.-lit)+lit;
                }else{float d=length(local.xy),a=local.z>.1?.12*coverage(abs(d-local.z)-.35):0.;float c=style.z>0.?.2*coverage(d-style.z):0.;
                    rgb=vec3(180.,190.,210.)/255.*a*(1.-c)+vec3(205.,215.,235.)/255.*c;alpha=a*(1.-c)+c;}
                gl_FragColor=vec4(rgb,alpha)*style.w;
            }`,{kind});
        super(geometry,shader);this.buffer=buffer;this.capacity=0;this.count=0;this.vertices=new Float32Array(0);this.size=0;
    }
    begin(){this.count=0;this.visible=false;}
    reserve(count){if(count<=this.capacity)return;let capacity=Math.max(64,this.capacity);while(capacity<count)capacity*=2;capacity=Math.min(16384,capacity);
        const data=new Float32Array(capacity*56);data.set(this.vertices);this.vertices=data;this.capacity=capacity;
        const index=new Uint16Array(capacity*6);for(let i=0;i<capacity;i++){const v=i*4;index.set([v,v+1,v+2,v,v+2,v+3],i*6);}this.geometry.getIndex().update(index);
    }
    quad(cx,cy,dx,dy,ex,ey,radius,width,style,light){
        if(this.count>=16384)return;this.reserve(this.count+1);let i=this.count++*56;
        for(const [a,b]of NATIVE_RAIN_CORNERS){const x=a*ex,y=b*ey;
            this.vertices[i++]=cx+dx*x-dy*y;this.vertices[i++]=cy+dy*x+dx*y;
            this.vertices[i++]=x;this.vertices[i++]=y;this.vertices[i++]=radius;this.vertices[i++]=width;
            for(const v of style)this.vertices[i++]=v;for(const v of light)this.vertices[i++]=v;
        }
    }
    finish(parent){this.size=this.count*6;this.visible=this.count>0;if(this.visible){this.buffer.update(this.vertices.subarray(0,this.count*56));parent.addChild(this);}}
}
class NativeRainBatch {
    constructor(){this.drops=new NativeRainMesh(0);this.splashes=new NativeRainMesh(1);this.colors=new Map();this.stats={};}
    clear(){this.drops.destroy();this.splashes.destroy();}
    begin(){this.drops.begin();this.splashes.begin();this.stats={dropQuads:0,splashQuads:0,vertexBytes:0};}
    draw(ctx,game,view){
        const weather=game.weather,L=game.nativeRenderer.layers,zoom=view.zoom,hw=weather._halfW,hh=weather._halfH;
        const lag=RenderInterp.lagTicks(),wind=weather.windVec,parallax=CONFIG.WEATHER.RAIN_PARALLAX,drift=CONFIG.WEATHER.RAIN_WIND_DRIFT;
        const scale=Math.min(1.35,Math.pow(Math.max(0,weather.intensity),.75)),lamps=[];
        for(const l of game.lamps){const x=(l.x-view.x)*zoom+hw,y=(l.y-view.y)*zoom+hh,r=(l.radius||200)*zoom*.6;
            if(x<-r||x>weather.width+r||y<-r||y>weather.height+r)continue;
            const key=l.color||'#ffeebb';let color=this.colors.get(key);if(!color){color=new PIXI.Color(key).toArray().slice(0,3);this.colors.set(key,color);}
            lamps.push({x,y,r,color,intensity:l.intensity||.8});
        }
        if(L.rainDrops)for(const d of weather.drops){
            const h=d.height+d.fallSpeed*lag,sx=(d.groundX-view.x)*zoom+hw,sy=(d.groundY-view.y)*zoom+hh;
            if(sx<-40||sx>weather.width+40||sy<-40||sy>weather.height+40)continue;
            const p=h*h*parallax,ax=sx+(sx-hw)*p-wind.x*drift*h,ay=sy+(sy-hh)*p-wind.y*drift*h;
            const length=Math.min((h*(CONFIG.WEATHER.RAIN_LENGTH_FACTOR||14)+1)*zoom,Math.hypot(ax-sx,ay-sy)*1.8);
            const norm=Math.hypot(d.dirX,d.dirY)||1,dx=d.dirX/norm,dy=d.dirY/norm,half=length*norm/2;
            const band=Math.min(3,Math.floor(h*4)),mid=(band+.5)/4,width=(.4+mid*1.6)*Math.min(zoom,1.5)/2;
            let f=0,light=[0,0,0,0];for(const l of lamps){const dist=Math.hypot(ax-l.x,ay-l.y);if(dist<l.r){const falloff=1-dist/l.r,q=Math.min(RAIN_LIT_STEPS-1,Math.floor(falloff*RAIN_LIT_STEPS));f=(q+.5)/RAIN_LIT_STEPS;
                light=[...l.color,Math.min(.5,.12+f*.38)*l.intensity];break;}}
            const ext=width*(1+f*.6)+1,alpha=(.08+mid*.2)*.7*scale;
            this.drops.quad(ax-dx*half,ay-dy*half,dx,dy,half+ext,ext,half,width,[alpha,h>.4?1:0,f,ctx.globalAlpha],light);
        }
        if(L.rainSplashes)for(const s of weather.splashes){const x=(s.x-view.x)*zoom+hw,y=(s.y-view.y)*zoom+hh;
            if(x<-20||x>weather.width+20||y<-20||y>weather.height+20)continue;
            const age=Math.max(0,s.t-16.67*lag)/s.lifespan,r=s.maxR*age*zoom,dot=age<.25?(1+(1-age/.25)*1.2)*zoom:0,ext=Math.max(r+.85,dot+.5);
            this.splashes.quad(x,y,1,0,ext,ext,r,.35,[.12,0,dot,ctx.globalAlpha],[0,0,0,0]);
        }
        this.drops.finish(ctx.container);this.splashes.finish(ctx.container);
        this.stats={dropQuads:this.drops.count,splashQuads:this.splashes.count,vertexBytes:(this.drops.count+this.splashes.count)*224};
    }
}
