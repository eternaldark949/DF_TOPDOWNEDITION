/**
 * Atrium example / game behavior. Owns one world, one GPU lease, controls and phase hooks.
 * This is intentionally outside engine/: movement rules, obstacles, palette changes,
 * and the player identity can all change without editing ETRNLNINE or its levels.
 */
import { Lifetime } from '../../engine/basement/lifetime.js';
import { circleOverlapsBox } from '../../engine/basement/geometry.js';
import { buildLayout } from './layout.js';

/** Create a self-contained scene. dispose() releases every registration and owned resource. */
export function createScene(engine, { controlsHost, onStatus = () => {} }) {
  const life = new Lifetime(), { basement, lobby, directory } = engine;
  const world = directory.adopt(basement.createWorld());
  life.own(() => directory.releaseWorld(world.id));
  try {
    const layout = buildLayout(engine, world);
    const actor = directory.create('toy.actor', { world }); actor.root.y = -8;
    // Resolve the edited start pose without interpolating from the toy's origin.
    for (const entity of world.entities.values()) Object.assign(entity.previous,
      { x:entity.x, y:entity.y, z:entity.z, yaw:entity.yaw });
    const lease = directory.acquire(`batch:${world.id}`, () => basement.renderer.createBatch(world));
    life.own(lease.release);
    const input = basement.input, renderer = basement.renderer;
    input.bind({
      move: { kind:'vector', negativeX:['KeyA','ArrowLeft'], positiveX:['KeyD','ArrowRight'],
        negativeY:['KeyW','ArrowUp'], positiveY:['KeyS','ArrowDown'], axes:[0,1], deadZone:0.18 },
      interact: { kind:'button', keys:['KeyE'], pointerButtons:[0], buttons:[0] },
      load: { kind:'button', keys:['KeyB'], buttons:[2] },
    });
    life.own(() => input.bind({}));
    const stick = directory.create('control.joystick', { input, host:controlsHost,
      sourceId:`${world.id}:stick`, action:'move', radius:52 });
    life.own(() => stick.dispose());
    const button = directory.create('control.button', { input, host:controlsHost,
      sourceId:`${world.id}:button`, action:'interact', label:'Light', diameter:70 });
    life.own(() => button.dispose());
    life.own(lobby.on('pause', () => { stick.cancel(); button.cancel(); }));

    // Renderer inputs are generic numeric light slots; the game authors their arrangement.
    renderer.camera.x = 0; renderer.camera.y = 0; renderer.camera.halfHeight = 22;
    renderer.lights.fill(0); renderer.lightColors.fill(0);
    const lightPositions = [[0,7,5,16],[-15,-4,4,12],[15,-4,4,12],[-15,9,4,12],[15,9,4,12],[0,2,3,10],[-15,-18,4,12],[15,-18,4,12]];
    for (let i=0;i<lightPositions.length;i++) {
      renderer.lights.set(lightPositions[i],i*4);
      renderer.lightColors.set(i===5 ? [0.3,1.1,2.7] : [2.4,0.85,0.3],i*3);
    }
    let vx=0, vy=0, distance=0, loaded=true, cool=true, statusAt=-1;
    const pointerGround = {};
    /** Keep movement legal against the example's horizontal geometry and world boundary. */
    const legal = (x,y) => Math.abs(x)<18.3 && y>-23 && y<17
      && !layout.colliders.some(box => circleOverlapsBox(x,y,0.5,box));

    life.own(lobby.on('update', (dt,time) => {
      world.snapshot();
      if (input.consume('load')) loaded = !loaded;
      if (input.consume('interact')) {
        cool = !cool;
        const color = cool ? [0.25,0.62,1] : [1,0.34,0.19];
        layout.crystal.shape.color = color;
        renderer.lightColors.set(cool ? [0.3,1.1,2.7] : [3,0.5,0.2],15);
      }
      const move = input.read('move');
      // Illustrative steering profile: load slows directional response, widening turns.
      // This is not the planned mass-distribution/body simulation from section 10.4.
      const response = 1-Math.exp(-(loaded?4:10)*dt), speed = loaded?6:7;
      vx += (move.x*speed-vx)*response;
      vy += (-move.y*speed-vy)*response;
      const root=actor.root;
      if (legal(root.x+vx*dt,root.y)) root.x+=vx*dt; else vx=0;
      if (legal(root.x,root.y+vy*dt)) root.y+=vy*dt; else vy=0;
      const moving=Math.hypot(vx,vy);
      let heading = root.yaw;
      if (moving>0.1) heading=Math.atan2(vy,vx)+Math.PI/2;
      else if (input.pointer.active) {
        renderer.groundPoint(input.pointer.x,input.pointer.y,pointerGround);
        heading=Math.atan2(pointerGround.y-root.y,pointerGround.x-root.x)+Math.PI/2;
      }
      const turn=Math.atan2(Math.sin(heading-root.yaw),Math.cos(heading-root.yaw));
      root.yaw+=turn*(1-Math.exp(-9*dt)); distance+=moving*dt;
      // Procedural gait derives from actual distance, so blocked movement doesn't moonwalk.
      actor.body.z=1+Math.sin(distance*5)*Math.min(moving,1)*0.035;
      actor.legs[0].y=Math.sin(distance*5)*Math.min(moving,1)*0.18;
      actor.legs[1].y=-actor.legs[0].y;
      actor.arms[0].y=-actor.legs[0].y*0.6; actor.arms[1].y=-actor.arms[0].y;
      actor.bag.shape.emission=loaded?0:0.12;
      layout.crystal.yaw+=dt*0.3;
      if (time-statusAt>0.2) {
        statusAt=time;
        onStatus({ worldId:world.id, x:root.x, y:root.y, loaded, cool, time, entities:world.entities.size });
      }
    }));
    life.own(lobby.on('render', alpha => {
      world.resolve(alpha); renderer.render(lease.value);
    }));
    return { world, actor, dispose: () => life.dispose() };
  } catch (error) { life.dispose(); throw error; }
}
