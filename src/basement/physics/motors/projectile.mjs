import { bodyRecord } from '../core/state.mjs';
import { number, vector, unit, scale, length, rotate, sub, EPS } from '../core/values.mjs';
import { referencePosition } from '../spatial/queries.mjs';

export class projectileMotor {
    constructor(body, packet = {}) {
        this.body = body; this.config = {
            speed: number(packet.speed ?? 600, 'speed', 0), lifetime: number(packet.lifetime ?? 3, 'lifetime', 0),
            penetration_count: number(packet.penetration_count ?? 0, 'penetration_count', 0), penetration_loss: number(packet.penetration_loss ?? 0, 'penetration_loss', 0, 1),
            impact_strength: number(packet.impact_strength ?? 0, 'impact_strength', 0), owner_id: packet.owner_id ?? null,
        };
        if (!Number.isInteger(this.config.penetration_count)) throw new TypeError('penetration_count must be integral');
        this.interception=null;this.hit_bodies = new Set(); this.physical_hits = 0; this.remaining = this.config.lifetime; this.impact_scale = 1;
        vector(packet.direction ?? [1, 0]);
        if (body) this.launchProjectile(packet.direction ?? [1, 0]);
    }
    launchProjectile(direction, options = {}) {
        const r = bodyRecord(this.body);
        const v = options.target !== undefined ? sub(referencePosition(r.world,options.target),r.position) : options.reverse ? scale(r.velocity,-1) : options.angle!==undefined ? [Math.cos(number(options.angle,'angle')),Math.sin(options.angle)] : vector(direction);
        if(length(v)<EPS)throw new TypeError('Projectile heading must be nonzero');
        const d = rotate(unit(v),number(options.angle_offset??0,'angle_offset')), speed = number(options.speed ?? this.config.speed, 'speed', 0);
        this.body.setLinearVelocity(scale(d, speed)); return this;
    }
    redirectProjectile(direction, options = {}) {
        const r = bodyRecord(this.body), speed = length(r.velocity);
        if(options.owner_id!==undefined&&options.owner_id!==null)r.world._record(options.owner_id);
        if(options.at_fraction!==undefined){
            const fraction=number(options.at_fraction,'at_fraction',0,1),target=options.target===undefined?undefined:referencePosition(r.world,options.target);
            const command={at_fraction:fraction,...(target?{target}:{}),owner_id:options.owner_id??this.config.owner_id,min_lifetime:number(options.min_lifetime??0,'min_lifetime',0)};
            r.world._mutate(()=>{if(!this.interception||fraction<this.interception.at_fraction)this.interception=command;});return this;
        }
        this.launchProjectile(direction, { ...options, speed: options.speed ?? speed });
        r.world._mutate(() => { if (options.owner_id !== undefined) this.config.owner_id = options.owner_id; this.hit_bodies.clear(); this.physical_hits = 0; });
        return this;
    }
    removeProjectile() { bodyRecord(this.body).world.removeBody(this.body); }
    _update(dt) { this.remaining -= dt; }
}
