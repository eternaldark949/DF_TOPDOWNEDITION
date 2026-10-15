/**
 * Atrium example / scene: owns controls, phase registrations and the game's journey.
 * Layout/reconstruction, locomotion and world policy have their own focused modules.
 * Nothing here installs an engine patch or creates an independent animation loop.
 */
import { Lifetime } from '../../engine/basement/lifetime.js';
import { createJourney } from './journey.js';
import { playerController } from './player.js';

/** Start preparing the scene immediately. Rendering remains valid while the first world loads. */
export function createScene(engine,{controlsHost,onStatus=()=>{},onError=()=>{}}){
  const life=new Lifetime(),{basement,lobby,directory}=engine;
  const journey=createJourney(engine);life.own(()=>journey.dispose());
  const {input,renderer}=basement;
  input.bind({
    move:{kind:'vector',negativeX:['KeyA','ArrowLeft'],positiveX:['KeyD','ArrowRight'],negativeY:['KeyW','ArrowUp'],positiveY:['KeyS','ArrowDown'],axes:[0,1],deadZone:0.18},
    interact:{kind:'button',keys:['KeyE'],pointerButtons:[0],buttons:[0]},
    load:{kind:'button',keys:['KeyB'],buttons:[2]},
    flit:{kind:'button',keys:['KeyF'],buttons:[1]},
    cancel:{kind:'button',keys:['KeyX'],buttons:[3]},
    prop:{kind:'button',keys:['KeyG']},
  });
  life.own(()=>input.bind({}));
  const prefix=basement.identities.create('controls');
  const controls=[
    directory.create('control.joystick',{input,host:controlsHost,sourceId:`${prefix}:stick`,action:'move',radius:52}),
    directory.create('control.button',{input,host:controlsHost,sourceId:`${prefix}:light`,action:'interact',label:'Light',diameter:70}),
    directory.create('control.button',{input,host:controlsHost,sourceId:`${prefix}:flit`,action:'flit',label:'Flit',diameter:62,placement:{right:44,bottom:132}}),
  ];
  controls.forEach(control=>life.own(()=>control.dispose()));
  life.own(lobby.on('pause',()=>controls.forEach(control=>control.cancel())));
  renderer.camera.x=0;renderer.camera.y=0;renderer.camera.halfHeight=22;
  let player=null,statusAt=-1;
  journey.ready.then(()=>{if(!life.disposed)player=playerController(journey.actor,input,renderer);})
    .catch(error=>{if(!life.disposed&&error.name!=='AbortError')onError(error);});

  life.own(lobby.on('update',(dt,time)=>{
    const resource=journey.current;
    if(resource&&player){
      resource.world.snapshot();
      if(input.consume('cancel'))journey.cancel();
      else if(input.consume('flit'))journey.flit();
      if(input.consume('interact'))journey.toggleLight();
      if(input.consume('prop'))journey.moveProp();
      player.update(dt,resource);resource.layout.crystal.yaw+=dt*0.3;
    }
    if(time-statusAt>0.12){
      statusAt=time;
      const root=journey.actor?.root;
      onStatus({worldId:resource?.world.id??'preparing',name:resource?.profile.name??'Opening the worlds',
        actorId:root?.id??'',x:root?.x??0,y:root?.y??0,loaded:player?.loaded??true,
        cool:resource?.state.cool??true,propX:resource?.layout.prop.x??6,time,
        entities:resource?.world.entities.size??0,...journey.inspect()});
    }
  }));
  life.own(lobby.on('render',alpha=>{
    const resource=journey.current;
    if(!resource){renderer.render();return;}
    renderer.ambient.set(resource.profile.ambient);renderer.lights.set(resource.lights);renderer.lightColors.set(resource.lightColors);
    resource.world.resolve(alpha);renderer.render(resource.batch);
  }));
  return {journey,dispose:()=>life.dispose()};
}
