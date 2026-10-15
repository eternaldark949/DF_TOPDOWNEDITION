/**
 * Atrium example / locomotion: game-owned steering/gait profile, independent of realm residency.
 * Actor references and velocity survive transfers. This is not a full physical body solver.
 */
import { legalLanding } from './worlds.js';

/** Create one controller whose mutable velocity/load state belongs only to this actor. */
export function playerController(actor, input, renderer) {
  let vx=0,vy=0,distance=0,loaded=true;
  const pointerGround={};
  return {
    get loaded(){return loaded;},
    /** Advance movement against the active destination's actual collision data. dt is seconds. */
    update(dt,resource){
      if(input.consume('load'))loaded=!loaded;
      const move=input.read('move');
      const response=1-Math.exp(-(loaded?4:10)*dt),speed=loaded?6:7;
      vx+=(move.x*speed-vx)*response;vy+=(-move.y*speed-vy)*response;
      const root=actor.root;
      if(legalLanding(resource,{x:root.x+vx*dt,y:root.y,z:root.z}))root.x+=vx*dt;else vx=0;
      if(legalLanding(resource,{x:root.x,y:root.y+vy*dt,z:root.z}))root.y+=vy*dt;else vy=0;
      const moving=Math.hypot(vx,vy);let heading=root.yaw;
      if(moving>0.1)heading=Math.atan2(vy,vx)+Math.PI/2;
      else if(input.pointer.active){
        renderer.groundPoint(input.pointer.x,input.pointer.y,pointerGround);
        heading=Math.atan2(pointerGround.y-root.y,pointerGround.x-root.x)+Math.PI/2;
      }
      const turn=Math.atan2(Math.sin(heading-root.yaw),Math.cos(heading-root.yaw));
      root.yaw+=turn*(1-Math.exp(-9*dt));distance+=moving*dt;
      actor.body.z=1+Math.sin(distance*5)*Math.min(moving,1)*0.035;
      actor.legs[0].y=Math.sin(distance*5)*Math.min(moving,1)*0.18;actor.legs[1].y=-actor.legs[0].y;
      actor.arms[0].y=-actor.legs[0].y*0.6;actor.arms[1].y=-actor.arms[0].y;
      actor.bag.shape.emission=loaded?0:0.12;
    },
  };
}
