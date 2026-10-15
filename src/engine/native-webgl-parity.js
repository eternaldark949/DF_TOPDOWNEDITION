// Bounded live caster textures, shared crowd alpha and ordered world artwork.
// No scene readback or per-frame Canvas silhouettes.
class NativeCasterBodies {
    constructor(owner){this.owner=owner;this.entries=new Map();this.begin();}
    begin(game=null){
        this.lights=[];
        if(game){
            for(const l of game.lamps||[])if(l.visible!==false&&game.roomSystem.lampLight(l)>.01&&(game.activeMap.type!=='outdoor'||game.dayCycle().lampsOn))this.lights.push(l);
            if(this.owner.layers.decorLights){
                for(const p of game.props||[])if(p.light&&p.visible!==false){
                    const c=p.getCenter();if(game.roomSystem.lightAt(c.x,c.y)<.005)continue;
                    this.lights.push({x:c.x+(p.light.dx||0),y:c.y+(p.light.dy||0),radius:p.light.radius||Math.max(p.light.w||0,p.light.h||0)/2||180});
                }
                this.lights.push(...(game.activeMap.softLights||[]));
            }
            this.lights.push(...(this.owner.transientSources||[]));
        }
        this.bodies=new Map();this.captures=0;
        this.stats={shared:0,captures:0,refreshes:0,fallbacks:0,blocked:0,dropped:0,pairs:0,lights:0};
    }
    note(ctx,e,body){
        if(ctx!==this.owner.peopleContext||!this.owner.layers.npcShadows||_zoomLOD>=2||e._reflectionProxy||e.inCar||e.dead||e.visible===false)return;
        if(!this.owner.layers.shapeShadows){this.circle(e);return;}
        const m=ctx.matrix,scale=Math.hypot(m.a,m.b)||1;
        this.bodies.set(e,{...body,owner:e,x:m.tx,y:m.ty,angle:Math.atan2(m.b,m.a),scale,opacity:ctx.globalAlpha,elevation:24});
        this.stats.shared++;
    }
    nearLight(e){return this.lights.some(l=>Math.hypot(l.x-e.x,l.y-e.y)<(l.lightRadius||l.radius||Math.hypot(l.w||0,l.h||0)/2||200));}
    capture(ctx,e,c,draw){
        const heat=this.owner.nightHeat.wants(e),shadow=this.owner.layers.lighting&&_zoomLOD<2&&this.owner.layers.npcShadows&&this.owner.layers.shapeShadows&&this.nearLight(e);
        if((!heat&&!shadow)||e._reflectionProxy||e.inCar||e.dead)return false;
        if(this.captures>=(heat||!this.owner.nightHeat.stats.active?16:12)){if(heat)this.owner.nightHeat.stats.dropped++;return false;}
        let r=this.entries.get(e);
        if(!r){
            if(this.entries.size>=32){const old=[...this.entries].find(([,v])=>v.used<this.owner.frameId-2);if(!old){if(heat)this.owner.nightHeat.stats.dropped++;return false;}this.dispose(old[1]);this.entries.delete(old[0]);}
            const slot=this.slotFor();if(slot===undefined){if(heat)this.owner.nightHeat.stats.dropped++;return false;}
            r={ctx:new NativeVectorContext(this.owner),...slot,hash:null,revision:0};r.ctx.label='body-'+slot.slot;r.ctx.root.position.set(slot.x,slot.y);this.atlasStage.addChild(r.ctx.root);this.entries.set(e,r);
        }
        this.captures++;if(heat&&!shadow)this.owner.nightHeat.stats.forcedCaptures++;r.used=this.owner.frameId;r.ctx.begin();r.ctx.canvas=ctx.canvas;r.ctx.translate(96,96);
        const m=ctx.matrix;r.ctx.worldFrame=_worldMatrix.multiply(new DOMMatrix([m.a,m.b,m.c,m.d,m.tx,m.ty]));
        if(this.owner.layers.contactShadows&&!c.noShadow&&_zoomLOD<2){const t=ctx.getTransform();_bodyRot=Math.atan2(t.b,t.a);drawHumanContactShadow(ctx,e);}
        draw(r.ctx,e,{...c,noShadow:true,_crowdBake:true});
        if(r.hash!==r.ctx.hash){this.atlasDirty=true;r.hash=r.ctx.hash;r.revision++;r.bounds=r.ctx.root.getLocalBounds();this.stats.refreshes++;}
        ctx.current=null;const sprite=ctx.node(PIXI.Sprite);sprite.texture=r.view;sprite.alpha=ctx.globalAlpha;sprite.blendMode=ctx.globalCompositeOperation==='lighter'?PIXI.BLEND_MODES.ADD:PIXI.BLEND_MODES.NORMAL;
        sprite.transform.setFromMatrix(ctx.matrix.clone().append(new PIXI.Matrix(1,0,0,1,-96,-96)));ctx.current=null;
        this.owner.nightHeat.paint(ctx,e,{texture:r.view,rect:r.rect,size:192});
        const sharedBefore=this.stats.shared;this.note(ctx,e,{texture:r.view,rect:r.rect,size:192,bounds:r.bounds,key:'body:'+r.slot+':'+r.revision});this.stats.shared=sharedBefore;this.stats.captures++;
        return true;
    }
    circle(e,opacity=1){
        if(!this.owner.layers.npcShadows||_zoomLOD>=2||this.bodies.has(e)||e._reflectionProxy||e.inCar||e.dead||e.visible===false)return;
        const cat=e instanceof VelvetCat,radius=cat?8:Math.min(18,e.radius||9),points=Array.from({length:12},(_,i)=>[e.x+Math.cos(i*Math.PI/6)*radius,e.y+Math.sin(i*Math.PI/6)*radius]);
        this.bodies.set(e,{owner:e,x:e.x,y:e.y,points,opacity,elevation:cat?8:24,key:points.flat().join(',')});this.stats.fallbacks++;
    }
    vehicle(e){
        if(!this.owner.layers.vehicleShadows||_zoomLOD>=2||(e.fade??1)<.005||e.dead||e.visible===false)return;
        const c=Math.cos(e.angle||0),s=Math.sin(e.angle||0),w=e.length||e.width||40,h=e.vehicleWidth||e.width||24;
        const points=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>[e.x+x*c-y*s,e.y+x*s+y*c]);
        this.bodies.set(e,{owner:e,x:e.x,y:e.y,points,elevation:15,opacity:e.fade??1,key:points.flat().join(',')});
    }
    invalidate(){for(const r of this.entries.values()){r.hash=null;for(const g of r.ctx.gradients)g.key=null;}}
    trim(){for(const [e,r]of this.entries)if(r.used<this.owner.frameId-120){this.dispose(r);this.entries.delete(e);}}
    // Every captured body lives in one atlas (8x4 slots of 192px) and the whole atlas is drawn in a
    // single pass per frame (flush), instead of one render-target switch per body: on tiled mobile
    // GPUs each switch is a full tile flush.
    slotFor(){
        if(!this.atlas){const W=192*8,H=192*4;this.atlas=this.owner.target(PIXI.RenderTexture.create({width:W,height:H,resolution:1,scaleMode:PIXI.SCALE_MODES.LINEAR}),'body-atlas');
            this.atlasStage=new PIXI.Container();this.freeSlots=Array.from({length:32},(_,i)=>31-i);}
        const slot=this.freeSlots.pop();if(slot===undefined)return undefined;
        const W=this.atlas.width,H=this.atlas.height,x=(slot%8)*192,y=Math.floor(slot/8)*192;
        return {slot,x,y,view:new PIXI.Texture(this.atlas.baseTexture,new PIXI.Rectangle(x,y,192,192)),rect:[x/W,y/H,192/W,192/H]};
    }
    flush(){if(!this.atlasDirty)return;this.atlasDirty=false;this.owner.renderer.render(this.atlasStage,{renderTexture:this.atlas,clear:true});this.stats.atlasPasses=(this.stats.atlasPasses||0)+1;}
    dispose(r){r.ctx.destroy();r.view.destroy(false);this.freeSlots.push(r.slot);}
    clear(){for(const r of this.entries.values())this.dispose(r);this.entries.clear();this.begin();}
    report(){return {...this.stats,casters:this.bodies.size,liveTargets:this.entries.size,bodyBytes:this.atlas?192*8*192*4*4:0,gradientBytes:[...this.entries.values()].reduce((n,r)=>n+r.ctx.gradients.length*128*128*4,0)};}
}

Object.assign(NativeWebGLRenderer.prototype,{
    syncBackdrop(game){
        const ctx=this.backdropContext,L=this.layers,active=game.activeMap.id==='apt_949'&&L.backdrop&&L.liveBackdrop;
        for(const child of this.backdrop.children)child.visible=child===ctx.root?active:!active;
        ctx.begin();const start=performance.now(),clock=_frameTime;
        if(active){
            const city=game._cityView;
            if(!this.backdropPrepared&&viewHasRect(city.x,city.y,city.w,city.h)){
                const keep=image=>{if(!ctx.images.has(image))ctx.images.set(image,this.retainImage(image,'veranda-assets'));};
                for(const car of city.cars)keep(city._carStamp(car.v,car.axis==='h'?(car.dir>0?0:1):(car.dir>0?2:3)).cv);
                for(const ped of city.peds)keep(city._pedStamp(ped.tint));this.backdropPrepared=true;
            }
            ctx.canvas=game.canvas;ctx.sceneFrame=_worldMatrix;try{if(!L.decorAnimation)_frameTime=0;game.drawApartmentBackdrop(ctx);}finally{_frameTime=clock;}}
        this.backdropStats={live:active,visible:active&&ctx.root.children.length>0,images:ctx.images.size,hash:ctx.hash,slide:[game._cityView?.dx||0,game._cityView?.dy||0],cpuMs:performance.now()-start};
    },
    syncSceneDepth(game){
        const root=this.peopleContext.root,L=this.layers;root.sortableChildren=!!L.depthSort;
        for(const [p,r]of this.props){r.group.zIndex=p.y+(p.height||p.h||0)/2;const parent=L.depthSort&&p.hasCollision&&!p.noNav?root:this.objects;parent.addChild(r.group);}
        // Interior lamp bodies stay over furniture, as Canvas paints them last (engine/draw.js); city lamps depth-sort.
        const sortLamps=L.depthSort&&L.fixtures&&game.activeMap.id==='hub_949';for(const r of this.fixtureNodes.values())(sortLamps?root:this.fixtures).addChild(r.node);
        for(const [d,r]of this.doorNodes){r.node.zIndex=d.y+(d.h||0)/2;(L.depthSort&&L.doors?root:this.doors).addChild(r.node);}
        for(const group of this.trafficContext.root.children.slice())if(group._nativeEntity&&L.depthSort)root.addChild(group);
        if(L.depthSort){this.playerSprite.zIndex=game.player.y;root.addChild(this.playerSprite);root.sortChildren();}
        this.buildingBaseStage.sortableChildren=this.roofStage.sortableChildren=!!L.depthSort;
        for(const [b,r]of this.nativeBuildings){r.base.root.zIndex=r.top.root.zIndex=b.y+(b.h||b.height||0);}
        this.roofDetailContext.root.zIndex=Infinity;
        if(L.depthSort){this.buildingBaseStage.sortChildren();this.roofStage.sortChildren();}
    },
    multiShadowTexture(source,base,game,walls){
        const bodies=[...this.nativeCasters.bodies.values()],L=this.layers,stats=this.nativeCasters.stats;
        if(L.playerShadows&&L.shapeShadows&&game.player.visible!==false&&!game.player.dead&&!game.isDriving)
            bodies.unshift({owner:game.player,x:game.player.x,y:game.player.y,angle:game.player.angle||0,scale:1,elevation:24,texture:this.actorTexture,size:192,bounds:this.actorBounds,key:'player:'+this.actorRevision});
        let nearby=bodies.filter(a=>a.owner!==source.owner&&a.texture!==PIXI.Texture.EMPTY&&Math.hypot(a.x-source.x,a.y-source.y)>1&&Math.hypot(a.x-source.x,a.y-source.y)<source.radius);
        if(!nearby.length)return base;
        if(stats.lights>=16||stats.pairs>=192){stats.dropped+=nearby.length;return base;}
        const priority=a=>a.owner===game.player||(game.isDriving&&a.owner===game.car)?0:1;
        nearby.sort((a,b)=>priority(a)-priority(b)||Math.hypot(a.x-source.x,a.y-source.y)-Math.hypot(b.x-source.x,b.y-source.y));
        const max=Math.min(24,192-stats.pairs);stats.dropped+=Math.max(0,nearby.length-max);nearby.length=Math.min(max,nearby.length);
        nearby=nearby.filter(a=>{const blocked=L.wallOcclusion&&(_physicsSpatial.query(walls,{left:Math.min(source.x,a.x),right:Math.max(source.x,a.x),top:Math.min(source.y,a.y),bottom:Math.max(source.y,a.y)}).some(w=>segCrossesRect(source.x,source.y,a.x,a.y,w.x,w.y,w.w??w.width,w.h??w.height))||game.roomSystem.doors.some(d=>d.leaves().some(([ax,ay,bx,by])=>segmentsCross(source.x,source.y,a.x,a.y,ax,ay,bx,by))));if(blocked)stats.blocked++;return !blocked;});
        if(!nearby.length)return base;
        const r=this.shadowCache.get(source.owner);if(!r)return base;
        stats.lights++;stats.pairs+=nearby.length;this.shadowStats.silhouettePairs+=nearby.filter(a=>a.texture).length;
        const key=[r.key,...nearby.map(a=>[a.owner.id||a.owner.type||'',a.key,a.x,a.y,a.angle||0,a.opacity??1].join(':'))].join('|');
        if(r.dynamicKey===key){this.shadowStats.dynamicHits++;return r.dynamicTexture;}
        const start=performance.now();
        if(!r.dynamicStage){
            const needed=r.texture.baseTexture.realWidth*r.texture.baseTexture.realHeight*4;
            if(this.shadowBytes()+needed>48*1048576){stats.dropped+=nearby.length;return base;}
            r.dynamicStage=new PIXI.Container();r.dynamicBase=new PIXI.Sprite(base);r.dynamicStage.addChild(r.dynamicBase);
            r.dynamicTexture=PIXI.RenderTexture.create({width:source.radius*2,height:source.radius*2,resolution:r.density,scaleMode:PIXI.SCALE_MODES.LINEAR});
        }
        r.dynamicBase.texture=base;r.dynamicBase.width=r.dynamicBase.height=source.radius*2;
        r.dynamicMeshes||=[];for(const mesh of r.dynamicMeshes)mesh.visible=false;if(r.actorShadow)r.actorShadow.visible=false;
        if(!r.dynamicGeometry){r.dynamicGeometry=new PIXI.Graphics();r.dynamicGeometry.blendMode=PIXI.BLEND_MODES.ERASE;r.dynamicStage.addChild(r.dynamicGeometry);}r.dynamicGeometry.clear();
        let index=0;
        for(const a of nearby){
            const dx=a.x-source.x,dy=a.y-source.y,d=Math.hypot(dx,dy),len=Math.min(120,source.radius-d,d*a.elevation/Math.max(1,(source.elevation??84)-a.elevation));
            if(a.points){
                const crosses=a.points.map(([x,y],i)=>{const [nx,ny]=a.points[(i+1)%a.points.length];return (nx-x)*(source.y-y)-(ny-y)*(source.x-x);});
                if(crosses.every(v=>v>=0)||crosses.every(v=>v<=0))continue;
                const scale=1+len/d,hull=DynamicShadows._hull(a.points.flatMap(([x,y])=>[[x,y],[source.x+(x-source.x)*scale,source.y+(y-source.y)*scale]]));
                const local=p=>p.flatMap(([x,y])=>[x-source.x+source.radius,y-source.y+source.radius]);
                r.dynamicGeometry.beginFill(0xffffff,.85*(a.opacity??1)).drawPolygon(local(hull)).beginHole().drawPolygon(local(a.points)).endHole().endFill();continue;
            }
            let mesh=r.dynamicMeshes[index++];if(!mesh){mesh=new NativeActorShadowMesh();r.dynamicMeshes.push(mesh);r.dynamicStage.addChild(mesh);}mesh.visible=true;
            const u=mesh.shader.uniforms;u.body=a.texture;u.bodySize=a.size*(a.scale||1);u.direction.set([dx/d,dy/d]);u.rotation.set([Math.cos(a.angle||0),Math.sin(a.angle||0)]);
            u.stretch=1+len/CONFIG.HUMAN_SHADE.LAMP_SHADOW_DEPTH;u.offset=len/2;u.opacity=.85*(a.opacity??1);
            u.frameA.set(a.rect||(a.frames?[a.frames[0]/17,0,1/17,1]:[0,0,1,1]));u.frameB.set(a.rect||(a.frames?[a.frames[1]/17,0,1/17,1]:[0,0,1,1]));u.blend=a.blend||0;
            const b=a.bounds||{x:0,y:0,width:a.size,height:a.size},coords=[];
            for(const x of [b.x-a.size/2,b.x+b.width-a.size/2])for(const y of [b.y-a.size/2,b.y+b.height-a.size/2]){
                const wx=(x*u.rotation[0]-y*u.rotation[1])*(a.scale||1),wy=(x*u.rotation[1]+y*u.rotation[0])*(a.scale||1),shift=(wx*u.direction[0]+wy*u.direction[1])*(u.stretch-1)+u.offset;coords.push([wx+u.direction[0]*shift,wy+u.direction[1]*shift]);}
            const x0=Math.min(...coords.map(p=>p[0]))-2,y0=Math.min(...coords.map(p=>p[1]))-2,x1=Math.max(...coords.map(p=>p[0]))+2,y1=Math.max(...coords.map(p=>p[1]))+2;
            u.bounds.set([x0,y0,x1-x0,y1-y0]);mesh.position.set(dx+source.radius,dy+source.radius);
        }
        this.renderer.render(r.dynamicStage,{renderTexture:r.dynamicTexture,clear:true});r.dynamicKey=key;
        this.shadowStats.rebuilds++;this.shadowStats.dynamicRebuilds++;this.layerStages.animatedShadowMs=(this.layerStages.animatedShadowMs||0)+performance.now()-start;
        return r.dynamicTexture;
    }
});

// Mirror draw.js's final browser grade. CSS filters run on the composited WebGL
// canvas without copying pixels to Canvas2D. Keep the original Canvas path intact.
function nativeCanvasColorGrade() {
    const targetNV = this.nightVision ? 1.0 : 0.0;
    this.nvIntensity += (targetNV - this.nvIntensity) * 0.08;

    // Color grade multipliers (from custom grade panel)
    const _gg = (typeof _gameGrade !== 'undefined') ? _gameGrade : null;
    const ggBright = _gg ? _gg.brightness / 100 : 1;
    const ggContrast = _gg ? _gg.contrast / 100 : 1;
    const ggSaturate = _gg ? _gg.saturate / 100 : 1;
    const ggExposure = _gg ? (1 + _gg.exposure / 200) : 1;

    let filterChain;
    if (this.nvIntensity > 0.98) {
        filterChain = `grayscale(100%) brightness(${(1.4 * ggBright * ggExposure).toFixed(2)}) contrast(${(1.2 * ggContrast).toFixed(2)})`;
        // Ms. Jean Soda: pink tinge over NV
        if (this.player.buffSystem.isActive('jeanSoda')) {
            filterChain = `grayscale(80%) brightness(${(1.4 * ggBright * ggExposure).toFixed(2)}) contrast(${(1.2 * ggContrast).toFixed(2)}) sepia(0.3) hue-rotate(300deg) saturate(${(1.5 * ggSaturate).toFixed(2)})`;
        }
    } else {
        if (this.scenes && this.scenes.running) {
            // A scene has the stage: Stella is off-camera, so her stealth doesn't grey the story out
            this.targetGrayscale = 0; this.visualGrayscale = 0;
        } else if (this.player.visibility !== undefined) {
            this.targetGrayscale = GameSettings.stealthGray === false ? 0 : (1.0 - this.player.visibility) * 100;
            this.visualGrayscale += (this.targetGrayscale - this.visualGrayscale) * 0.05;
            if (this.visualGrayscale < 0.5) this.visualGrayscale = 0;
        }
        // The grade follows the hour: the night's rich contrast, the day's softer, clearer light
        const dayG = this.sunState().k * this._sunReach();
        const sat = (1.4 - 0.1 * dayG) * (1.0 - this.nvIntensity) * ggSaturate;
        const con = (1.35 - 0.08 * dayG + (0.15 * this.nvIntensity)) * ggContrast;
        const sepia = (0.18 - 0.12 * dayG) * (1.0 - this.nvIntensity);
        const bright = (1.1 + 0.2 * dayG + (1.4 * this.nvIntensity)) * ggBright * ggExposure;
        // Cinematic View's "Full colour" chip lifts the stealth grey for the photo (night vision stays)
        const stealthGray = this.cineCam && GameSettings.photoFullColour ? 0 : this.visualGrayscale;
        const effectiveGray = Math.max(stealthGray, this.nvIntensity * 100);
        filterChain = `grayscale(${effectiveGray.toFixed(0)}%) contrast(${con.toFixed(2)}) saturate(${sat.toFixed(2)}) sepia(${sepia.toFixed(2)}) brightness(${bright.toFixed(2)})`;
        // Ms. Jean Soda: subtle pink warmth even outside NV
        if (this.player.buffSystem.isActive('jeanSoda')) {
            filterChain += ` hue-rotate(8deg)`;
        }
    }

    // A flashback (story/scene-runner.js s.memory): cooler, softer, a little faded
    const memK = this.scenes && this.scenes.ui ? (this.scenes.ui.memK || 0) : 0;
    if (memK > 0.001) filterChain += ` saturate(${(1 - 0.5 * memK).toFixed(3)}) sepia(${(0.14 * memK).toFixed(3)}) hue-rotate(${(-22 * memK).toFixed(1)}deg) contrast(${(1 - 0.08 * memK).toFixed(3)})`;
    return filterChain;
}
Object.assign(NativeWebGLRenderer.prototype,{
    syncColorGrade(game){
        const filter=nativeCanvasColorGrade.call(game);
        const applied=this.layers.colorGrade?filter:'none';
        if(game.canvas.style.filter!==applied)game.canvas.style.filter=applied;
        this.colorGrade={enabled:this.layers.colorGrade,filter:game.canvas.style.filter};
    }
});
