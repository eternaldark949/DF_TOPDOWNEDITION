// Native entry points retain sandbox previews and the original save schema.
(() => {
    const renderer=game.nativeRenderer;
    const liveCrowd=drawCrowdHumanoid;
    drawCrowdHumanoid=(ctx,e,c)=>{if(ctx.nativeVector&&ctx.owner.layers.crowdSprites&&ctx.owner.crowdAtlas?.draw(ctx,e,c))return;return liveCrowd(ctx,e,c);};
    // Keep a body's paths and atlas mesh together before sorting by its feet.
    for(const Type of [NPC,Pedestrian,Ganger,GatlingGunner,Drone,VelvetCat,SceneActor]){
        const draw=Type.prototype.draw;if(!draw)continue;
        Type.prototype.draw=function(ctx,...args){
            if(ctx.nativeVector&&ctx===ctx.owner.peopleContext&&ctx.owner.layers.depthSort&&game.activeMap.type==='outdoor')
                return ctx.withDepth(this,()=>draw.call(this,ctx,...args));
            return draw.call(this,ctx,...args);
        };
    }
    const menu=document.getElementById('main-menu-list');
    const start=document.createElement('button');start.id='btn-native-apartment';start.textContent='PLAY WEBGL APARTMENT';
    start.style.cssText='padding:16px;margin:12px;color:#fff;background:#402060;border:1px solid #b78af8;font:inherit;cursor:pointer';
    menu.prepend(start);
    const description=document.createElement('p');description.textContent='Apartment preview: explore, move furniture, and compare visual layers. City travel is enabled. Import Canvas saves into the fork’s separate save slots.';
    description.style.cssText='max-width:420px;font-size:13px;color:#d9c9e5';start.after(description);
    const toolbar=document.createElement('div');toolbar.id='native-webgl-toolbar';
    toolbar.style.cssText='position:fixed;top:4px;left:4px;max-width:calc(100vw - 68px);z-index:10000;color:#eee;background:#16101e;padding:6px;font:11px monospace;display:none';
    const panel=document.createElement('span');renderer.panel=panel;toolbar.append(panel);
    const notice=document.createElement('div');renderer.notice=notice;notice.hidden=true;toolbar.append(notice);
    const button=(text,action)=>{const b=document.createElement('button');b.textContent=text;b.style.marginLeft='6px';b.onclick=action;toolbar.append(b);};
    const launch=(mapId='apt_949')=>{
        const startAt=performance.now(),entry=renderer.entryTiming={pageAgeMs:startAt,stages:{}};let lap=startAt;
        toolbar.style.display='block';
        if(renderer.failure){renderer.message('WebGL unavailable: '+renderer.failure);return;}
        game.resetGameState();entry.stages.resetMs=performance.now()-lap;lap=performance.now();game._doLoadMap(mapId);entry.stages.mapLoadMs=performance.now()-lap;lap=performance.now();game.player.visible=true;game.paused=false;
        // Sandbox entry has no story step: the default chapter would otherwise
        // initialize on the first simulation tick and teleport into an unported scene.
        game.story.state.part=0;game.story.currentStepData=null;game.story.initializedStep=true;
        renderer.map=null;game.showProfiler=false;
        // No auto-transition to unported maps; original apartment interactions remain.
        // Keep authored exits: the native world renderer handles arriving maps.
        game.enterWorld();entry.stages.enterWorldMs=performance.now()-lap;lap=performance.now();game.draw();entry.stages.firstDrawMs=performance.now()-lap;entry.totalMs=performance.now()-startAt;
    };
    const city=document.createElement('button');city.id='btn-native-city';city.textContent='PLAY WEBGL CITY';city.style.cssText=start.style.cssText;start.after(city);
    city.onclick=()=>{try{audioSys.init();}catch(e){}launch('hub_949');};
    const saves=document.createElement('button');saves.id='btn-native-saves';saves.textContent='LOAD / IMPORT SAVES';saves.style.cssText=start.style.cssText;city.after(saves);
    const originalLoad=game.loadGame.bind(game);
    game.loadGame=key=>{const raw=NativeWebGLStorage.getItem(key||saveSlotManager.getActiveKey());if(!raw)return originalLoad(key);
        try{JSON.parse(raw);}catch(e){showMessage('ERROR LOADING SAVE FILE.');return false;}
        game.resetGameState();const ok=originalLoad(key);if(ok){renderer.map=null;toolbar.style.display='block';game.enterWorld();}return ok;};
    saves.onclick=()=>{try{audioSys.init();}catch(e){}saveSlotManager.open('load',success=>{if(success)game.enterWorld();});};
    start.onclick=()=>{try{audioSys.init();}catch(e){}launch();};
    const layers=document.createElement('div');layers.id='native-webgl-layers';layers.hidden=true;
    layers.style.cssText='position:fixed;top:68px;left:8px;max-width:330px;max-height:65vh;overflow:auto;background:#1b1228;color:white;border:1px solid #a887cd;padding:12px;z-index:10001;font:13px sans-serif';
    const heading=document.createElement('strong');heading.textContent='RENDER LAYERS';layers.append(heading);
    const note=document.createElement('p');note.textContent='Changes reset the sample. Shadows require Lighting. Freeze Character animation or switch Shape-accurate shadows to compare their cost. Record 20s exports after warmup; Export repeats the finished run.';layers.append(note);
    const qualityRow=document.createElement('label');qualityRow.textContent='Texture quality ';const quality=document.createElement('select');quality.id='native-texture-quality';
    for(const [key,label]of [['standard','Standard'],['auto','Auto (sharper furniture)'],['high','High (2× textures)']]){const option=document.createElement('option');option.value=key;option.textContent=label;quality.append(option);}
    quality.value=renderer.textureQuality;quality.onchange=()=>renderer.setTextureQuality(quality.value);renderer.onQualityChanged=()=>quality.value=renderer.textureQuality;qualityRow.append(quality);layers.append(qualityRow);
    const qualityNote=document.createElement('p');qualityNote.textContent='Quality rebuilds cached art once. Render resolution and shadow detail remain separate.';layers.append(qualityNote);
    const presets=document.createElement('div');
    for(const [name,label] of [['baseline','Baseline'],['shadows','Lighting + shadows'],['canvas','Canvas look']]){
        const b=document.createElement('button');b.textContent=label;b.onclick=()=>renderer.preset(name);presets.append(b);
    }layers.append(presets);
    const checks=new Map();
    for(const [key,label] of Object.entries(NATIVE_LAYER_LABELS)){
        const row=document.createElement('label');row.style.cssText='display:inline-flex;align-items:center;width:48%;min-height:36px;gap:6px';
        const c=document.createElement('input');c.type='checkbox';c.dataset.nativeLayer=key;c.checked=renderer.layers[key];
        c.onchange=()=>renderer.setLayers({[key]:c.checked});checks.set(key,c);row.append(c,document.createTextNode(label));layers.append(row);
    }
    renderer.onLayersChanged=()=>{for(const [k,c] of checks)c.checked=renderer.layers[k];};
    document.body.append(layers);
    button('Layers',()=>{layers.hidden=!layers.hidden;});
    const download=()=>{
        const report=renderer.completedCapture||renderer.report();
        const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='dfab-native-webgl-v8-'+(report.capture?.finished?'recorded-'+Math.round(report.capture.durationMs/1000)+'s':'rolling-'+Math.round(report.sampleDurationMs/1000)+'s')+'-config-'+report.configurationId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    button('Record 20s',()=>{
        layers.hidden=true;renderer.frames=[];renderer.warmFrames=15;renderer.lastStart=renderer.lastEnd=0;
        renderer.completedCapture=null;renderer.capture={durationMs:20000,startedAt:null,finished:false};
    });
    renderer.onCaptureComplete=download;
    button('Export',download);
    button('Saves',()=>saveSlotManager.open('load'));
    button('Restart apartment',()=>launch());
    document.body.append(toolbar);
    // New story starts stay separate; imported progress uses the original story system.
    for(const id of ['btn-new-game','btn-continue','btn-load-game']){const el=document.getElementById(id);if(el)el.style.display='none';}
})();
