/** Basement / input-independent planar locomotion. Game chooses speed, direction and legality.
 * Fixed maximum displacement per substep prevents tunnelling through thin street fixtures.
 * This is a sliding kinematic circle, not rigid-body or stair/contact simulation. */
export class PlanarMotor {
  /** Velocity belongs to this actor; root follows the public World transform contract.
   * speed is metres/second, response is 1/second and maxStep is metres. Parameter
   * limits bound worst-case collision work even if an authored profile is unreasonable. */
  constructor(root, { speed = 4.2, response = 9, maxStep = 0.12 } = {}) {
    if (
      ![speed, response, maxStep].every(Number.isFinite) ||
      speed <= 0 ||
      speed > 100 ||
      response <= 0 ||
      response > 1000 ||
      maxStep < 0.01 ||
      maxStep > 1
    )
      throw new Error("Invalid motor parameters");
    this.root = root;
    this.speed = speed;
    this.response = response;
    this.maxStep = maxStep;
    this.vx = 0;
    this.vy = 0;
    this.distance = 0;
  }
  /** Clear momentum at a doorway commit, avoiding a held stride through the destination wall. */
  reset() {
    this.vx = this.vy = 0;
  }
  /** dt is seconds, vector is world XY; legal receives a prospective root pose. */
  update(dt, x, y, legal) {
    if (
      !Number.isFinite(dt) ||
      dt < 0 ||
      dt > 0.25 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      throw new Error("Invalid motor step");
    const magnitude = Math.max(1, Math.hypot(x, y)),
      gain = 1 - Math.exp(-this.response * dt);
    this.vx += ((x / magnitude) * this.speed - this.vx) * gain;
    this.vy += ((y / magnitude) * this.speed - this.vy) * gain;
    const root = this.root,
      startX = root.x,
      startY = root.y,
      steps = Math.max(
        1,
        Math.ceil((Math.hypot(this.vx, this.vy) * dt) / this.maxStep),
      ),
      step = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (legal({ x: root.x + this.vx * step, y: root.y, z: root.z }))
        root.x += this.vx * step;
      else this.vx = 0;
      if (legal({ x: root.x, y: root.y + this.vy * step, z: root.z }))
        root.y += this.vy * step;
      else this.vy = 0;
    }
    const traveled = Math.hypot(root.x - startX, root.y - startY);
    this.distance += traveled;
    if (traveled > 1e-5) {
      const heading =
          Math.atan2(root.y - startY, root.x - startX) + Math.PI / 2,
        turn = Math.atan2(
          Math.sin(heading - root.yaw),
          Math.cos(heading - root.yaw),
        );
      root.yaw += turn * (1 - Math.exp(-10 * dt));
    }
    return traveled;
  }
}
