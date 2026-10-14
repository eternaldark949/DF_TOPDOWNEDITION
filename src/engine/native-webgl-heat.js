// Hostile-only night vision: the same resident body alpha used for animation
// and shape shadows supplies the white core and soft halo. No Canvas capture.
class NativeHeatMesh extends PIXI.Mesh {
    constructor(){
        const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',new Float32Array([-96,-96,96,-96,96,96,-96,96]),2).addAttribute('aUV',new Float32Array([0,0,1,0,1,1,0,1]),2).addIndex([0,1,2,0,2,3]);
        super(geometry,PIXI.Shader.from(`precision highp float;
            attribute vec2 aVertexPosition;attribute vec2 aUV;uniform mat3 projectionMatrix;uniform mat3 translationMatrix;uniform float size;varying vec2 uv;
            void main(){uv=aUV;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition*(size/192.),1.)).xy,0.,1.);}`,
            `precision highp float;varying vec2 uv;uniform sampler2D body;uniform vec2 frames;uniform float columns;uniform float blend;uniform float strength;uniform float opacity;uniform float blur;
            float alphaAt(vec2 p){if(p.x<0.||p.y<0.||p.x>1.||p.y>1.)return 0.;return mix(texture2D(body,vec2((p.x+frames.x)/columns,p.y)).a,texture2D(body,vec2((p.x+frames.y)/columns,p.y)).a,blend);}
            void main(){float core=alphaAt(uv),halo=0.;for(int i=0;i<8;i++){float a=float(i)*2.39996323,r=sqrt((float(i)+.5)/8.)*blur;halo+=alphaAt(uv+vec2(cos(a),sin(a))*r)/8.;}
                float k=.9*strength,a=(core+halo*.85*(1.-core*k))*k*opacity;gl_FragColor=vec4(vec3(1.,252./255.,244./255.)*a,a);}`,
            {body:PIXI.Texture.EMPTY,frames:new Float32Array(2),columns:1,blend:0,size:192,strength:0,opacity:1,blur:0}));
    }
}
class NativeNightHeat {
    constructor(owner){this.owner=owner;this.begin();}
    begin(game=null){
        this.strength=game&&this.owner.layers.nightHeat&&this.owner.layers.people?Math.min(1,Math.max(0,game.nvIntensity||0)):0;
        this.hostiles=new Set(this.strength>.02?game.enemies||[]:[]);
        this.stats={active:this.strength>.02,strength:this.strength,bodies:0,forcedCaptures:0,dropped:0};
    }
    wants(e){return this.strength>.02&&this.hostiles.has(e)&&!e.dead&&!e.inCar&&e.visible!==false;}
    paint(ctx,e,body){
        if(ctx!==this.owner.peopleContext||!this.wants(e))return;
        if(this.stats.bodies>=24){this.stats.dropped++;return;}
        ctx.current=null;const n=ctx.node(NativeHeatMesh),u=n.shader.uniforms;
        u.body=body.texture;u.frames.set(body.frames||[0,0]);u.columns=body.frames?17:1;u.blend=body.blend||0;u.size=body.size||192;
        u.strength=this.strength;u.opacity=ctx.globalAlpha;u.blur=10*(game._renderScale||1)*this.strength/(game.view.zoom*u.size);
        n.transform.setFromMatrix(ctx.matrix);ctx.current=null;this.stats.bodies++;
    }
    report(){return {...this.stats};}
    clear(){this.hostiles.clear();}
}
