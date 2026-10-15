/**
 * Penthouse / toys: reusable procedural box-based architecture and actor assemblies.
 * These are early test toys, not Freelancer art or the final procedural humanoid.
 * Everything is created through World; no toy owns a scheduler or a GPU context.
 */

/** Add a solid box. Colors are linear RGB; emission is a dimensionless gain.
 * Set ambientBlocker=false for decorative shapes that should not contribute analytic AO. */
export function box(world, { x = 0, y = 0, z = 0, size = [1,1,1], color = [0.3,0.3,0.4], emission = 0, parent = null, yaw = 0, ambientBlocker = true } = {}) {
  return world.create({ x, y, z, yaw, parent, shape: { size, color, emission, ambientBlocker } });
}

/**
 * Generate a small colonnade with configurable dimensions/materials. Its returned root
 * owns all descendant geometry, so deleting the root removes the full instance.
 */
export function pavilion({ world, x = 0, y = 10, width = 18, depth = 8, height = 6,
  stone = [0.22,0.21,0.29], trim = [0.68,0.48,0.27], glow = [1,0.46,0.16] }) {
  const root = world.create({ x, y });
  /** Use local positions so the entire toy can move/rotate through one transform. */
  const part = (px, py, pz, size, color, emission = 0) => box(world, { parent: root, x: px, y: py, z: pz, size, color, emission });
  part(0,0,0.2,[width+2,depth+2,0.4],stone);
  part(0,depth/2-0.3,height/2,[width,0.6,height],stone);
  part(0,0,height,[width+1,depth+1,0.6],stone);
  part(0,-depth/2,height-0.6,[width,0.12,0.09],glow,2.5);
  part(0,-depth/2,height-0.9,[width,0.16,0.10],trim);
  for (const px of [-width/2, -width/4, width/4, width/2]) {
    part(px,-depth/2,height/2,[0.5,0.5,height],stone);
    part(px,-depth/2,0.45,[0.9,0.9,0.4],trim);
    part(px,-depth/2,height-0.35,[0.8,0.8,0.25],trim);
  }
  for (let i=0;i<7;i++) {
    const px = (i-3) * width / 8;
    part(px,depth/2-0.65,height*0.52,[width/10,0.08,height*0.65],[0.35,0.19,0.16],0.3);
    part(px,depth/2-0.72,height*0.52,[0.055,0.05,height*0.65],trim);
  }
  return root;
}

/** Build a stylized figure and backpack around a transform anchor; sizes in world units. */
export function actor({ world, color = [0.42,0.34,0.58], bagColor = [0.54,0.30,0.17] }) {
  const root = world.create({ z: 0.1 });
  const body = box(world, { parent: root, z: 1, size: [0.62,0.36,0.85], color });
  box(world, { parent: body, z: 0.68, size: [0.38,0.38,0.43], color: [0.65,0.45,0.34] });
  box(world, { parent: body, z: 0.91, size: [0.42,0.4,0.13], color: [0.08,0.055,0.09] });
  const legs = [-1,1].map(side => box(world, { parent: root, x: side*0.18, z: 0.35,
    size: [0.23,0.25,0.6], color: [0.09,0.085,0.14] }));
  const arms = [-1,1].map(side => box(world, { parent: body, x: side*0.44,
    size: [0.18,0.25,0.8], color }));
  const bag = box(world, { parent: body, y: 0.3, z: 0.02, size: [0.5,0.26,0.62], color: bagColor });
  box(world, { parent: bag, y: 0.15, z: -0.1, size: [0.34,0.08,0.23], color: [0.7,0.5,0.23] });
  return { root, body, legs, arms, bag };
}
