/** Transitional host calls only: both native and classic actors use the same portable art. */
const classicActorPackets={
    velvet:new WeakMap(),
    droneState(actor){return {x:actor.x,y:actor.y,angle:actor.angle,dead:actor.dead,invincibleTimer:actor.invincibleTimer,state:actor.state,alt:actor.alt,hoverOffset:actor.hoverOffset,_seed:actor._seed,isTelegraphing:actor.isTelegraphing,render_time:_frameTime/1000,render_clock:_gameTimeSec,_stateT:actor._stateT,_eyeHitT:actor._eyeHitT??null,_tell:actor._tell?{kind:actor._tell.kind,secs:actor._tell.secs,lock:actor._tell.lock,a:actor._tell.a}:null,_tether:actor._tether?{x:actor._tether.x,y:actor._tether.y,state:actor._tether.state}:null,_beam:actor._beam?{x0:actor._beam.x0,y0:actor._beam.y0,x1:actor._beam.x1,y1:actor._beam.y1,t0:actor._beam.t0}:null};},
    drawDrone(context,actor,pass='body'){return DFNative.canvasRenderer.drawPackets(context,DFNative.createDronePackets(this.droneState(actor),{pass}));},
    drawVelvet(context,actor){const art=DFNative.createVelvetCatArt(actor);this.velvet.set(actor,art.eyes);return DFNative.canvasRenderer.drawPackets(context,art.body);},
    drawVelvetEyes(context,actor,darkness){return DFNative.canvasRenderer.drawPackets(context,DFNative.createVelvetEyePackets(actor,{eyes:this.velvet.get(actor),darkness}));}
};
