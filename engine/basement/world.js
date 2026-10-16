/**
 * Basement / world: identity, transforms, attachments, and spatial membership.
 * Coordinates: x/y are horizontal world units; z is elevation; yaw is radians.
 * A world owns its entities. Identity is immutable and independent of array position.
 * Base orientations are unit quaternions; yaw adds procedural z rotation. Scale is uniform.
 * Uniform hierarchy scale avoids hidden shear. This is not a skeletal/physics solver.
 */
import { multiplyRotation, rotateVector } from './rotation.js';

export class Identities {
  /** Engine-local monotonically increasing IDs; caller chooses the namespace. */
  constructor() { this.next = 1; }
  /** IDs are never reused during this engine's lifetime, even after scene disposal. */
  create(namespace) { return `${namespace}:${this.next++}`; }
}

export class World {
  /** Construct an empty world with an explicitly shared identity allocator. */
  constructor(id, identities) {
    this.id = id;
    this.identities = identities;
    this.entities = new Map();
    this.revision = 0;
    this.disposed = false;
  }

  /**
   * Add one entity. Shape is optional; invisible anchors allocate no GPU geometry.
   * Parent must already exist in this world: this prevents cycles and foreign links.
   * Shape size is full width/depth/height; its origin is its center.
   */
  create({ x = 0, y = 0, z = 0, yaw = 0, parent = null, shape = null, rotation = [0,0,0,1], scale = 1 } = {}) {
    if (this.disposed) throw new Error('Cannot create in a disposed world');
    if (parent && this.entities.get(parent.id) !== parent) throw new Error('Parent belongs to another world');
    if(!Number.isFinite(scale)||scale<=0||rotation.length!==4||!rotation.every(Number.isFinite)||Math.abs(Math.hypot(...rotation)-1)>0.001)throw new RangeError('World requires a unit quaternion and positive uniform scale');
    const entity = {
      id: this.identities.create('entity'), worldId: this.id, parent,
      x, y, z, yaw, rotation:[...rotation], scale, previous: { x, y, z, yaw,rotation:[...rotation],scale },
      pose: { x, y, z, yaw,rotation:[...rotation],scale }, shape,
      // Transient presentation amount; never authored/saved or packed into shadow depth.
      highlight: 0,
    };
    this.entities.set(entity.id, entity);
    this.revision++;
    return entity;
  }

  /** Capture local transforms before a fixed update, for smooth render interpolation. */
  snapshot() {
    for (const e of this.entities.values()) {
      e.previous.x = e.x; e.previous.y = e.y;
      e.previous.z = e.z; e.previous.yaw = e.yaw;e.previous.scale=e.scale;
      for(let i=0;i<4;i++)e.previous.rotation[i]=e.rotation[i];
    }
  }

  /**
   * Resolve interpolated world transforms in insertion order, without per-frame objects.
   * Parent-before-child is guaranteed by create(); shortest-arc yaw avoids full spins.
   */
  resolve(alpha = 1) {
    const local=this.localRotation??=new Float64Array(4),offset=this.offset??=new Float64Array(3),yawRotation=this.yawRotation??=new Float64Array(4);
    for (const e of this.entities.values()) {
      const a = e.previous, p = e.pose;
      const x = a.x + (e.x - a.x) * alpha;
      const y = a.y + (e.y - a.y) * alpha;
      const z = a.z + (e.z - a.z) * alpha;
      const turn = Math.atan2(Math.sin(e.yaw - a.yaw), Math.cos(e.yaw - a.yaw));
      const yaw = a.yaw + turn * alpha;
      let dot=0;for(let i=0;i<4;i++)dot+=a.rotation[i]*e.rotation[i];
      for(let i=0;i<4;i++)local[i]=a.rotation[i]+((dot<0?-1:1)*e.rotation[i]-a.rotation[i])*alpha;
      const length=Math.hypot(...local);for(let i=0;i<4;i++)local[i]/=length;
      yawRotation[0]=yawRotation[1]=0;yawRotation[2]=Math.sin(yaw/2);yawRotation[3]=Math.cos(yaw/2);
      multiplyRotation(yawRotation,local,local);p.scale=a.scale+(e.scale-a.scale)*alpha;
      if(e.parent){
        const b=e.parent.pose;rotateVector(b.rotation,x*b.scale,y*b.scale,z*b.scale,offset);
        p.x=b.x+offset[0];p.y=b.y+offset[1];p.z=b.z+offset[2];p.yaw=b.yaw+yaw;p.scale*=b.scale;
        multiplyRotation(b.rotation,local,p.rotation);
      }else{p.x=x;p.y=y;p.z=z;p.yaw=yaw;for(let i=0;i<4;i++)p.rotation[i]=local[i];}
    }
  }

  /** Remove an entity and descendants; snapshot the map so recursive removal is safe. */
  remove(entity) {
    if (this.entities.get(entity.id) !== entity) return;
    for (const child of [...this.entities.values()]) if (child.parent === entity) this.remove(child);
    this.entities.delete(entity.id);
    this.revision++;
  }

  /** Release CPU membership; Directory separately owns GPU/resource leases. */
  dispose() {
    if (this.disposed) return;
    this.entities.clear(); this.revision++; this.disposed = true;
  }
}
