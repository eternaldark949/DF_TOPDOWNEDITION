/**
 * Atrium example / authored layout. This is game content, deliberately outside engine/.
 * Change these placements/materials without editing renderer or toy implementations.
 * This generator yields actual construction chunks to Lobby preparation. It is not a timer.
 * This little courtyard is an engine exercise, not a replacement Enni Cole asset.
 */
export function* buildLayout(engine, world, profile) {
  const directory = engine.directory;
  /** Every visible object is requested through registered Penthouse library factories. */
  const box = options => directory.create('toy.box', { world, ...options });
  const stone = profile.stone, gold = profile.trim;
  box({ z: -0.25, size: [58,68,0.5], color: profile.floor });
  // Inlaid paths define a readable floor, all retained geometry rather than painted textures.
  box({ y: -5, z: 0.015, size: [7,38,0.025], color: [0.22,0.20,0.25] });
  for (const x of [-3.6,3.6]) box({ x, y:-5, z:0.035, size:[0.05,38,0.035], color:gold });
  yield; // Floor and paths are one bounded preparation chunk.
  directory.create('toy.pavilion', { world, y: 11, width: 24, depth: 9, height: profile.height,
    stone, trim:gold, glow:profile.glow });
  yield; // Architecture is prepared separately from side galleries and collision data.
  const colliders = [{ x:0, y:15.2, width:24, depth:0.7 }];
  for (const x of [-12,-6,6,12]) colliders.push({ x, y:6.5, width:0.6, depth:0.6 });
  // Side galleries frame the courtyard without teaching the engine what an atrium is.
  for (const side of [-1,1]) {
    const x = side * 20;
    box({ x, y:3, z:2.1, size:[2,29,4.2], color:stone });
    box({ x, y:3, z:4.3, size:[2.4,29.5,0.3], color:gold });
    colliders.push({ x, y:3, width:2, depth:29 });
    for (let y=-9; y<=15; y+=4) {
      box({ x:x-side*1.05, y, z:2.3, size:[0.06,1.8,2.7], color:profile.window, emission:0.55 });
      box({ x:x-side*1.13, y, z:3.7, size:[0.08,2,0.07], color:profile.glow, emission:2 });
    }
    for (const y of [-12,1]) {
      const px = side * 10;
      box({ x:px, y, z:0.55, size:[2.4,2.4,1.1], color:gold });
      for (let level=0;level<4;level++) box({ x:px, y, z:1.4+level*0.65,
        size:[2.2-level*0.4,2.2-level*0.4,0.9], color:profile.foliage });
      colliders.push({ x:px, y, width:2.4, depth:2.4 });
    }
    for (const y of [-18,-4,9]) {
      box({ x:side*15, y, z:1.8, size:[0.18,0.18,3.6], color:gold });
      box({ x:side*15, y, z:3.7, size:[0.6,0.6,0.8], color:profile.glow, emission:3 });
      box({ x:side*15, y, z:4.15, size:[0.9,0.9,0.12], color:gold });
    }
    yield; // One gallery/planting side per chunk; no per-frame full-world rebuild.
  }
  const lantern = box({ x:0,y:2,z:0.65,size:[1.9,1.9,1.3],color:stone });
  box({ parent:lantern,z:0.85,size:[2.1,2.1,0.22],color:gold });
  const crystal = box({ parent:lantern,z:1.75,yaw:Math.PI/4,size:[0.7,0.7,1.4],color:[0.25,0.62,1],emission:2 });
  colliders.push({x:0,y:2,width:2.1,depth:2.1});
  const prop = box({x:6,y:-12,z:0.65,size:[2,2,1.3],color:gold});
  const propCollider = {x:6,y:-12,width:2,depth:2}; colliders.push(propCollider);
  if (profile.ethereal) {
    // Alternate geometry makes this a distinct world, not just a palette uniform swap.
    for (const x of [-7,7]) {
      box({x,y:-3,z:2.5,yaw:Math.PI/4,size:[0.7,0.7,3.8],color:[0.22,0.50,0.67],emission:0.5});
      colliders.push({x,y:-3,width:1,depth:1});
    }
  }
  yield; // All geometry and horizontal collision information now exist.
  return { colliders, crystal, prop, propCollider };
}
