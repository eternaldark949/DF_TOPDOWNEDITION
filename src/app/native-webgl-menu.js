// A separate entry point avoids running unsupported story/city scenes in this slice.
(() => {
    const renderer=game.nativeRenderer;
    const menu=document.getElementById('main-menu-list');
    const start=document.createElement('button');start.id='btn-native-apartment';start.textContent='PLAY WEBGL APARTMENT';
    start.style.cssText='padding:16px;margin:12px;color:#fff;background:#402060;border:1px solid #b78af8;font:inherit;cursor:pointer';
    menu.prepend(start);
    const description=document.createElement('p');description.textContent='Apartment preview: explore and move furniture. Simplified lighting; city and story scenes are not included yet.';
    description.style.cssText='max-width:420px;font-size:13px;color:#d9c9e5';start.after(description);
    const toolbar=document.createElement('div');toolbar.id='native-webgl-toolbar';
    toolbar.style.cssText='position:fixed;top:4px;left:4px;z-index:10000;color:#eee;background:#16101e;padding:6px;font:11px monospace;display:none';
    const panel=document.createElement('span');renderer.panel=panel;toolbar.append(panel);
    const notice=document.createElement('div');renderer.notice=notice;notice.hidden=true;toolbar.append(notice);
    const button=(text,action)=>{const b=document.createElement('button');b.textContent=text;b.style.marginLeft='6px';b.onclick=action;toolbar.append(b);};
    const launch=()=>{
        toolbar.style.display='block';
        if(renderer.failure){renderer.message('WebGL unavailable: '+renderer.failure);return;}
        game.resetGameState();game._doLoadMap('apt_949');game.player.visible=true;game.paused=false;
        // Sandbox entry has no story step: the default chapter would otherwise
        // initialize on the first simulation tick and teleport into an unported scene.
        game.story.state.part=0;game.story.currentStepData=null;game.story.initializedStep=true;
        renderer.map=null;game.showProfiler=false;
        // No auto-transition to unported maps; original apartment interactions remain.
        game.activeMap.transitions=[];
        game.enterWorld();game.draw();
    };
    start.onclick=()=>{try{audioSys.init();}catch(e){}launch();};
    button('Lighting',()=>{renderer.lightsOn=!renderer.lightsOn;});
    button('Export',()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(renderer.report(),null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='dfab-native-webgl-profile.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    button('Restart apartment',launch);
    document.body.append(toolbar);
    // Keep unsupported story entry points out of the experiment's menu.
    for(const id of ['btn-new-game','btn-continue','btn-load-game']){const el=document.getElementById(id);if(el)el.style.display='none';}
})();
