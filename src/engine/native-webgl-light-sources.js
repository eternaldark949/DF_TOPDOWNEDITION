// Canvas light-layer sources that the native lamp list doesn't model (engine/lighting.js
// steps 5-6): vending machines and medbays, and the nightclub's dance floor. Their own
// paint routines replay into two GPU vector layers inside the light stage: 'hole' into
// the illumination target (screen-blended white lifts the darkness, as destination-out
// does in Canvas) and 'color' into the colour wash (additive, as 'lighter').
// Floors that move (the club's tiles, Keepers Hill's life) are drawn live over the baked floor.
// The live half of each map's floor; the static half is baked once (native-webgl-layers.js).
const LIVE_FLOORS={
    moon_city_nightclub:(g,c)=>g.drawClubFloorLights(c),
    keepers_hill:(g,c)=>{g._drawHillLife(c);c.drawImage(g._keeperHouse,540,320);g._drawFloatingGable(c);}
};
Object.assign(NativeWebGLRenderer.prototype,{
    initLightSources(){
        this.sourceHole=new NativeVectorContext(this);this.sourceHole.label='source-holes';
        this.sourceColor=new NativeVectorContext(this);this.sourceColor.label='source-color';
        this.lightStage.addChild(this.sourceHole.root,this.sourceColor.root);this.sourceColor.root.visible=false;
    },
    paintLightSources(game,view){
        // Map changes release the textures these layers cached; start each map with fresh ones.
        if(this.sourceHole&&this.sourceMap!==game.activeMap){for(const c of [this.sourceHole,this.sourceColor])c.destroy();this.sourceHole=null;}
        if(!this.sourceHole){this.initLightSources();this.sourceMap=game.activeMap;}
        const hole=this.sourceHole,color=this.sourceColor,L=this.layers;
        for(const c of [hole,color]){c.begin();c.canvas=game.canvas;c.setTransform(view.zoom,0,0,view.zoom,this.world.x,this.world.y);}
        hole.root.visible=true;color.root.visible=false;
        if(!L.decorLights)return;
        const hw=game.canvas.width/(2*view.zoom),hh=game.canvas.height/(2*view.zoom);
        const inView=(x,y,r)=>Math.abs(x-view.x)<hw+r&&Math.abs(y-view.y)<hh+r;
        // Fallback paint path: the authored falloff without Canvas's per-source occlusion masks.
        const drawLight=DynamicShadows.drawLight;DynamicShadows.drawLight=()=>false;
        try{
            hole.globalCompositeOperation='screen';color.globalCompositeOperation='lighter';
            const time=_frameTime;
            for(const p of game.props||[]){
                if(p.visible===false||(p.interactionType!=='medbay_refill'&&p.interactionType!=='vending_machine'))continue;
                const c=p.getCenter();if(!inView(c.x,c.y,180))continue;
                const g={p,x:c.x,y:c.y,medbay:p.interactionType==='medbay_refill'},offset=(p.id||0)*1337;
                const r=170*(g.medbay?1+Math.sin((time+offset)/400)*.05:1+Math.sin((time+offset)/50)*.02);
                const mod=g.medbay?.9+Math.sin((time+offset)/400)*.2:1+Math.sin((time+offset)/50)*.05;
                hole.globalAlpha=1;game._drawPropGlow(hole,g,'hole',r);
                color.globalAlpha=Math.min(1,.2*mod);game._drawPropGlow(color,g,'color',r);
            }
            if(game.activeMap.id==='moon_city_nightclub'){game.clubLightLayer(hole,'hole');game.clubLightLayer(color,'color');}
        }finally{DynamicShadows.drawLight=drawLight;}
    },
    // The colour pass renders the same light stage with the hole layers swapped for colour ones.
    showLightSourceColor(on){if(!this.sourceHole)return;this.sourceHole.root.visible=!on;this.sourceColor.root.visible=on;},
    // Floors with moving parts: the club's beat-driven tiles, and Keepers Hill's drifting clouds,
    // nodding flowers and floating gable (the house sits between them, so it is drawn live too).
    syncLiveFloor(game){
        const id=game.activeMap?.id,draw=LIVE_FLOORS[id];
        if(!draw){if(this.liveFloor)this.liveFloor.root.visible=false;return;}
        if(this.liveFloor&&(this.liveFloor.root.destroyed||this.liveFloorMap!==game.activeMap)){if(!this.liveFloor.root.destroyed)this.liveFloor.destroy();this.liveFloor=null;}   // fresh per map
        if(!this.liveFloor){this.liveFloor=new NativeVectorContext(this);this.liveFloor.label='live-floor';this.liveFloorMap=game.activeMap;}
        const ctx=this.liveFloor;if(ctx.root.parent!==this.floorArt)this.floorArt.addChild(ctx.root);
        ctx.root.visible=true;ctx.begin();ctx.canvas=game.canvas;draw(game,ctx);
    }
});
