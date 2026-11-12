import {rigSystem} from '../animation/rig-system.mjs';
import {mountedLaunchState} from '../attachments/emitter.mjs';
import { massProperties, massCenter, invalidateMass, integrateAtCenter, changeAngularSpeed, centerVelocity, setCenterVelocity } from './mass.mjs';
import { BODY_GROUP, EPS, vector, number, clone, freeze, validBounds, boundsMeet, sub, add, scale, length, unit, rotate, unionBounds } from './values.mjs';
import { bodyConfig, bodyRecord, pose, previousPose, liveBounds, bodyBounds, sweptBounds, snapshot, bodyActive, movable, physical, changeVelocity, enforceLocks, inverseInertia } from './state.mjs';
import { physicsBody } from './body.mjs';
import { collisionShape, shapeReach, shapeBounds } from '../collision/shape.mjs';
import { collisionDetector } from '../collision/detector.mjs';
import { contactSolver } from '../collision/solver.mjs';
import { spatialGrid } from '../spatial/grid.mjs';
import { physicsQueries, referenceBody, referencePosition } from '../spatial/queries.mjs';
import { characterMotor } from '../motors/character.mjs';
import { vehicleMotor } from '../motors/vehicle.mjs';
import { projectileMotor } from '../motors/projectile.mjs';
import { awarenessMatrix } from '../elements/elements.mjs';
import { gameElements } from '../elements/registry.mjs';
import { physicsConstraint, constraintRecord, updateConstraint, constraintSolver } from '../constraints/constraint.mjs';
import { motionController } from '../motion/controller.mjs';
import { trafficController } from '../traffic/controller.mjs';
import { railController } from '../motion/rail-controller.mjs';
import { attachmentManager } from '../attachments/manager.mjs';
import { pathGeometry } from '../motion/path-geometry.mjs';
import { layoutGeometry } from '../motion/layout-geometry.mjs';
import { particlePhysics } from '../particles/particles.mjs';

/** Standalone fixed-step world. Exactly one spatialGrid is constructed here. */
export class physicsSystem {
    #bodies = new Map(); #moving = new Set(); #constraints = new Map(); #listeners = new Map();
    #queue = []; #events = []; #contacts = new Map(); #stepContacts = new Map();
    #nextId = 1; #nextConstraint = 1;
    #stepping = false; #dispatching = false; #committing = false;
    #tick = 0; #motionEnvelope = null;
    #stepAuthority; #broadphaseEpoch=0; #candidateCache=null;
    #queries; #particles; #attachments; #projectilePolicies=new Set();
    #stats = { steps: 0, narrow_checks: 0, candidate_pairs: 0, active_movers: 0, spatial_sync_requests: 0, spatial_sync_skips: 0, bounds_calculations: 0, swept_bounds_calculations: 0, attachment_placements: 0, broadphase_builds: 0, broadphase_reuses: 0 };
    constructor({ cell_size = 128, fixed_step = 1 / 60, gravity = [0, 0], solver_iterations = 6, sleep_speed = 0.05, sleep_delay = 0.5, asset_library, step_authority } = {}) {
        if (step_authority !== undefined && typeof step_authority !== 'symbol') throw new TypeError('step_authority must be a private Symbol');
        this.#stepAuthority = step_authority;
        Object.defineProperty(this, 'config', { value: freeze({ cell_size: number(cell_size, 'cell_size', 1), fixed_step: number(fixed_step, 'fixed_step', EPS, 0.1), gravity: vector(gravity),
            solver_iterations: number(solver_iterations, 'solver_iterations', 1, 32), sleep_speed: number(sleep_speed, 'sleep_speed', 0), sleep_delay: number(sleep_delay, 'sleep_delay', 0) }), enumerable: true });
        if (!Number.isInteger(solver_iterations)) throw new TypeError('solver_iterations must be integral');
        Object.defineProperty(this, 'spatial_grid', { value: new spatialGrid({ cell_size }), enumerable: true });
        Object.defineProperty(this, 'elements', { value: new gameElements(this, { asset_library }), enumerable: true });
        Object.defineProperty(this, 'motion', { value: new motionController(this), enumerable: true });
        Object.defineProperty(this, 'rigs', { value: new rigSystem(this), enumerable: true });
        Object.defineProperty(this, 'traffic', { value: new trafficController(this), enumerable: true });
        Object.defineProperty(this, 'rails', { value: new railController(this), enumerable: true });
        this.#attachments = new attachmentManager(this); this.#queries = new physicsQueries(this); this.#particles = new particlePhysics(this);
    }
    get simulation_tick() { return this.#tick; }
    _record(value) {
        const b = typeof value === 'number' ? this.#bodies.get(value)?.handle : referenceBody(value);
        const r = bodyRecord(b);
        if (r.world !== this || r.removed) throw new Error('Body does not belong to this world or was removed');
        return r;
    }
    _syncBody(body) { this.#sync(this._record(body)); }
    _canReuseMotorRequest(){return !this.#stepping&&!this.#dispatching&&!this.#committing&&!this.#queue.length;}
    _mutate(fn) { if (!this.#committing && (this.#stepping || this.#dispatching || this.#queue.length)) this.#queue.push(fn); else fn(); }
    _emit(type, packet) {
        const entityFor = body => body?.body_id ? this.elements.fetchEntity(body.body_id) : null;
        this.#events.push({ type, simulation_tick: this.simulation_tick,
            entity: entityFor(packet.body), entity_a: entityFor(packet.body_a), entity_b: entityFor(packet.body_b), target_entity: entityFor(packet.target_body), ...packet });
    }
    _getMotionEnvelope() {
        if (!this.#motionEnvelope) {
            let max_speed = 0, max_reach = 0;
            for (const r of this.#moving) if (physical(r) && !r.config.ghost && r.config.collision_group && !r.removed) {
                max_speed = Math.max(max_speed, length(r.velocity)); max_reach = Math.max(max_reach, shapeReach(r.shape));
            }
            this.#motionEnvelope = { max_speed, max_reach };
        }
        return this.#motionEnvelope;
    }
    #sync(r, swept = false) {
        this.#motionEnvelope=null;this.#stats.spatial_sync_requests++;
        if(r.removed)return;
        if(r.broadphase_config!==r.config||r.broadphase_mount!==r.parent_mount){
            const old=r.broadphase_config,next=r.config;
            if(!old||old.physics_type!==next.physics_type||old.active!==next.active||old.collision_group!==next.collision_group||old.collision_mask!==next.collision_mask
                ||old.collision_exclusions!==next.collision_exclusions||r.broadphase_mount!==r.parent_mount)this.#broadphaseEpoch++;
            r.broadphase_config=next;r.broadphase_mount=r.parent_mount;
        }
        if(!bodyActive(r)){
            if(r.indexed)this.spatial_grid.removeInstance(r.id);
            r.indexed=false;r.spatial_cache=null;this.#moving.delete(r);r.moving_member=false;return;
        }
        const moving=r.config.physics_type!=='static';
        if(moving!==r.moving_member){if(moving)this.#moving.add(r);else this.#moving.delete(r);r.moving_member=moving;}
        const x=r.position[0],y=r.position[1],rotation=r.rotation,px=r.previous_position[0],py=r.previous_position[1];
        // Zero travel must not expand a stationary body's entry to its circumradius.
        swept=swept&&(x!==px||y!==py||rotation!==r.previous_rotation);
        const cache=r.spatial_cache,render=r.config.render_shape,light=r.config.light_shape;
        // A broad render/light extent can keep the grid AABB constant while the
        // collision shape moves inside it. Physical candidate validity must track
        // the collision pose/sweep as well as the shared grid's revision.
        if(!cache||cache.x!==x||cache.y!==y||cache.rotation!==rotation||cache.shape!==r.shape||cache.swept!==swept
            ||swept&&(cache.px!==px||cache.py!==py||cache.previous_rotation!==r.previous_rotation))this.#broadphaseEpoch++;
        if(r.indexed&&cache&&cache.x===x&&cache.y===y&&cache.rotation===rotation&&cache.shape===r.shape&&cache.render===render&&cache.light===light
            &&cache.swept===swept&&(!swept||cache.px===px&&cache.py===py&&cache.previous_rotation===r.previous_rotation)){
            this.#stats.spatial_sync_skips++;return;
        }
        let bounds=swept?sweptBounds(r):liveBounds(r);
        if(render)bounds=unionBounds(bounds,bodyBounds(r,'render'));
        if(light)bounds=unionBounds(bounds,bodyBounds(r,'light'));
        if(r.indexed)this.spatial_grid.updateInstance(r.id,bounds);
        else{this.spatial_grid.registerInstance(r.id,bounds,r.handle);r.indexed=true;}
        if(cache){cache.x=x;cache.y=y;cache.rotation=rotation;cache.shape=r.shape;cache.render=render;cache.light=light;cache.swept=swept;cache.px=px;cache.py=py;cache.previous_rotation=r.previous_rotation;}
        else r.spatial_cache={x,y,rotation,shape:r.shape,render,light,swept,px,py,previous_rotation:r.previous_rotation};
    }
    createBody(packet = {}) {
        const config = bodyConfig(packet), id = this.#nextId++;
        const r = { world: this, metrics:this.#stats, id, config, shape: new collisionShape(config.collision_shape), position: [...config.position], rotation: config.rotation,
            previous_position: [...config.position], previous_rotation: config.rotation, velocity: [...config.linear_velocity], angular_velocity: config.angular_velocity,
            force: [0, 0], torque: 0, sleeping: false, sleep_time: 0, removed: false, indexed: false, motor: null };
        r.handle = new physicsBody(r);
        enforceLocks(r);
        this._mutate(() => { this.#nextId = Math.max(this.#nextId, id + 1); this.#bodies.set(id,r);
            try{this.#sync(r);}catch(error){this.#bodies.delete(id);this.#moving.delete(r);this.spatial_grid.removeInstance(id);r.indexed=false;r.removed=true;throw error;}
        });
        return r.handle;
    }
    createEntity(packet = {}) { return this.elements.createEntity(packet); }
    createCharacter(packet = {}) { return this.elements.createCharacter(packet); }
    createVehicle(packet = {}) { return this.elements.createVehicle(packet); }
    createProjectileFrom(source, { local_position = [0,0], target, direction, angle, angle_offset=0, ...packet } = {}) {
        const r = this._record(referenceBody(source));
        if(this.getAttachmentState(source)){
            const resolved=this.elements.asset_library.resolveTemplate(packet.template,packet),state=this.getMountedLaunchState(source,{local_position,target,direction,angle,angle_offset,collision_shape:resolved.collision_shape});
            if(!state.allowed)return null;
            const deferred=this.#stepping||this.#dispatching||this.#queue.length>0;
            const projectile=this.createProjectile({...packet,position:state.position,rotation:state.launch_rotation,owner_id:r.id});
            if(deferred){this._mutate(()=>{
                if(!this.fetchBody(projectile.body_id))return;
                const targetId=target!==undefined&&!Array.isArray(target)?(typeof target==='number'?target:referenceBody(target)?.body_id):null;
                const current=!this.fetchBody(r.id)?{allowed:false,reason:'source_removed'}:targetId!==null&&!this.fetchBody(targetId)?{allowed:false,reason:'target_removed'}:this.getMountedLaunchState(source,{local_position,target,direction,angle,angle_offset,collision_shape:resolved.collision_shape});
                if(current.allowed&&(current.attachment_id!==state.attachment_id||current.revision!==state.revision)){current.allowed=false;current.reason='attachment_changed';}
                if(!current.allowed){this._emit('projectileLaunchBlocked',{body:projectile.body,source_body:r.handle,reason:current.reason});this.removeBody(projectile);return;}
                projectile.updateBody({position:current.position,rotation:current.launch_rotation});projectile.launchProjectile(current.direction,{inherited_velocity:current.carrier_velocity});
            });return projectile;}
            try{projectile.launchProjectile(state.direction,{inherited_velocity:state.carrier_velocity});return projectile;}catch(error){this.removeBody(projectile);throw error;}
        }
        const pose = this.getBodyPoint(source, local_position);
        const projectile = this.createProjectile({ ...packet, position:r.position, owner_id:r.id });
        try {
            const path = this.getPathClearance({body:projectile,from:r.position,to:pose.position,ignore_body:[r.handle,projectile],include_ghosts:false});
            if(path.clear)projectile.body.setPosition(pose.position);
            projectile.launchProjectile(direction ?? [Math.cos(r.rotation),Math.sin(r.rotation)],{...(target===undefined?{}:{target}),...(angle===undefined?{}:{angle}),angle_offset});
            return projectile;
        } catch(error) { this.removeBody(projectile); throw error; }
    }
    getMountedLaunchState(source, options) { return mountedLaunchState(this,source,options); }
    setAttachmentEmitter(body, emitter) { return this.#attachments.setAttachmentEmitter(body,emitter); }
    createProjectile(packet = {}) { return this.elements.createProjectile(packet); }
    _createEntityComponents(role, packet) {
        // Mechanical roles only. Concrete shapes, tuning, assets and gameplay data come from definitions.
        const roles = {
            entity: { physics_type: 'static', collision_group: 0, collision_mask: 0, query_mask: 0 },
            decoration: { physics_type: 'static', collision_group: 0, collision_mask: 0, query_mask: 0 },
            character: { physics_type: 'character', collision_group: BODY_GROUP.CHARACTER },
            vehicle: { physics_type: 'rigid', collision_group: BODY_GROUP.VEHICLE },
            projectile: { physics_type: 'rigid', collision_group: BODY_GROUP.PROJECTILE, friction: 0, linear_damping: 0, angular_damping: 0 },
            prop: { physics_type: 'rigid', collision_group: BODY_GROUP.PROP },
            static: { physics_type: 'static', collision_group: BODY_GROUP.STATIC },
            trigger: { physics_type: 'static', collision_group: BODY_GROUP.SENSOR, ghost: true },
        };
        if (!roles[role]) throw new TypeError(`Unknown physics_role: ${role}`);
        const motor = role === 'character' ? new characterMotor(null, packet.movement)
            : role === 'vehicle' ? new vehicleMotor(null, packet.vehicle_template)
            : role === 'projectile' ? new projectileMotor(null, packet) : null;
        const body = this.createBody({ ...roles[role], ...packet });
        if (motor) {
            motor.body = body; this._record(body).motor = motor;
            if (role === 'vehicle') motor.path_controller.body = body;
            if (role === 'projectile') {
                try { motor.launchProjectile(packet.direction ?? [1, 0], { target: packet.target }); }
                catch (error) { this.removeBody(body); throw error; }
            }
        }
        try {
            if (packet.constraints !== undefined && !Array.isArray(packet.constraints)) throw new TypeError('constraints must be an array');
            for (const joint of packet.constraints ?? []) {
                if (joint.body_a !== undefined || joint.body_b !== undefined) throw new TypeError('Template joints attach their entity to the world; create body-to-body joints explicitly');
                this.createConstraint({ world_target: [...this._record(body).position], ...joint, body_a: body });
            }
            if (packet.motion) {
                if (packet.motion.motion_type === 'orbit') this.motion.orbitBody(body, packet.motion);
                else if (packet.motion.motion_type === 'move') this.motion.moveBodyTo(body, packet.motion);
                else throw new TypeError('Invalid motion_type');
            }
        } catch (error) { this.removeBody(body); throw error; }
        return { body, controller: motor ?? body, awareness: role === 'character' ? new awarenessMatrix(this, body) : null };
    }
    _restoreEntityComponents(body_id, role) {
        const record = this._record(body_id), motor = record.motor;
        if ((role === 'character' && !(motor instanceof characterMotor)) || (role === 'vehicle' && !(motor instanceof vehicleMotor))
            || (role === 'projectile' && !(motor instanceof projectileMotor))) throw new TypeError('Saved entity role does not match its body controller');
        if (!['character', 'vehicle', 'projectile'].includes(role) && motor) throw new TypeError('Saved entity unexpectedly owns a specialized motor');
        return { body: record.handle, controller: motor ?? record.handle, awareness: role === 'character' ? new awarenessMatrix(this, record.handle) : null };
    }
    fetchBody(body_id) { return this.#bodies.get(body_id)?.handle ?? null; }
    removeBody(value) {
        const r = this._record(value);
        this._mutate(() => {
            if (r.removed) return;
            this.#motionEnvelope = null;this.#candidateCache=null; this.spatial_grid.removeInstance(r.id); r.indexed = false; r.removed = true; this.#bodies.delete(r.id); this.#moving.delete(r);
            this.#attachments._bodyRemoved(r); this.rigs._bodyRemoved(r.id); this.elements._bodyRemoved(r.id); this.traffic.removeVehicle(r.id); this.motion._remove(r.id); this.rails._remove(r.id); this.#particles._bodyRemoved(r.id);
            for (const [id, c] of this.#constraints) { const cr = constraintRecord(c); if (cr.a === r || cr.b === r) this.#constraints.delete(id); }
        });
    }
    updateBody(value, changes) {
        const r = this._record(value), change = clone(changes);
        for (const k of Object.keys(change)) if (!(k in r.config)) throw new TypeError(`Unknown body property: ${k}`);
        const checkMountedChanges = () => {
            if ((r.parent_mount || (!this.#committing && this.#attachments._hasReservation(r))) && ['position', 'rotation', 'linear_velocity', 'angular_velocity'].some(key => Object.hasOwn(change, key))) throw new Error('Update the attachment pose or detach before changing mounted motion');
        };
        checkMountedChanges();
        // Validate before queuing; apply against current state when the command is committed.
        bodyConfig({ ...snapshot(r), active: r.config.active, ...change });
        this._mutate(() => {
            if (r.removed) return;
            checkMountedChanges();
            const previous={config:r.config,shape:r.shape,position:r.position,rotation:r.rotation,velocity:r.velocity,angular_velocity:r.angular_velocity,
                previous_position:r.previous_position,previous_rotation:r.previous_rotation,sleeping:r.sleeping};
            const next=bodyConfig({...snapshot(r),active:r.config.active,...change});
            if(!Object.hasOwn(change,'collision_shape'))next.collision_shape=r.config.collision_shape;
            if(!Object.hasOwn(change,'render_shape'))next.render_shape=r.config.render_shape;
            if(!Object.hasOwn(change,'light_shape'))next.light_shape=r.config.light_shape;
            if(!Object.hasOwn(change,'collision_exclusions'))next.collision_exclusions=r.config.collision_exclusions;
            r.config=next;invalidateMass(r);
            if(Object.hasOwn(change,'collision_shape'))r.shape=new collisionShape(next.collision_shape);
            r.position = [...next.position]; r.rotation = next.rotation; r.velocity = [...next.linear_velocity]; r.angular_velocity = next.angular_velocity;
            if(r.previous_position[0]!==r.position[0]||r.previous_position[1]!==r.position[1]||r.previous_rotation!==r.rotation)this.#broadphaseEpoch++;
            r.previous_position=[...r.position];r.previous_rotation=r.rotation;r.sleeping=false;enforceLocks(r);
            try{this.#sync(r);}catch(error){Object.assign(r,previous);invalidateMass(r);this.#sync(r);throw error;}
            this.elements._bodyUpdated(r.id, next); this.#attachments._syncDescendants(r, true);
        }); return r.handle;
    }
    activateBody(b) { return this.updateBody(b, { active: true }); }
    deactivateBody(b) { return this.updateBody(b, { active: false }); }
    _readBody(b, result) { Object.assign(result, snapshot(this._record(b))); return result; }
    _renderBody(b, blend, result) {
        const r = this._record(b); number(blend, 'blend', 0, 1);
        if (r.parent_mount) return this.#attachments._render(r, blend, result);
        return Object.assign(result, { body_id: r.id, position: add(r.previous_position, scale(sub(r.position, r.previous_position), blend)), rotation: r.previous_rotation + (r.rotation - r.previous_rotation) * blend });
    }
    _command(b, action, packet) {
        const requested = this._record(b), p = { ...packet }; let r = requested;
        const checkMounted = () => {
            r = requested;
            if (!this.#committing && this.#attachments._hasReservation(r) && !r.parent_mount) throw new Error('Attachment must commit before commanding a mounted body');
            while (r.parent_mount) {
                if (!r.parent_mount.combine_mass || !['force', 'torque', 'impulse', 'angular_impulse'].includes(action)) throw new Error('Update the attachment pose or detach before commanding a mounted body');
                r = r.parent_mount.parent;
            }
        };
        checkMounted();
        for (const k of ['position', 'velocity', 'force', 'impulse', 'world_point']) if (p[k] !== undefined) p[k] = vector(p[k], k);
        for (const k of ['rotation', 'angular_velocity', 'torque', 'angular_impulse', 'strength']) if (p[k] !== undefined) number(p[k], k, k === 'strength' ? 0 : -Infinity);
        if(p.placement_bounds)p.placement_bounds=validBounds(p.placement_bounds);
        if (p.space && !['world', 'local'].includes(p.space)) throw new TypeError('Invalid space');
        if (p.placement_mode && !['exact', 'clear'].includes(p.placement_mode)) throw new TypeError('Invalid placement_mode');
        const source = action === 'impact' ? this._record(p.source_body) : null;
        this._mutate(() => {
            if (requested.removed || r.removed || (requested.parent_mount && !bodyActive(requested))) return;
            checkMounted();
            const local = v => p.space === 'local' ? rotate(v, requested.rotation) : v;
            const point = p.world_point ?? (r !== requested ? requested.position : null);
            switch (action) {
                case 'position':
                case 'rotation': {
                    const position = p.position ?? r.position, rotation = p.rotation ?? r.rotation;
                    const previous={position:r.position,rotation:r.rotation,velocity:r.velocity,angular_velocity:r.angular_velocity,previous_position:r.previous_position,previous_rotation:r.previous_rotation};
                    if (p.placement_mode === 'clear' && !this.isPlacementClear(b, position, { rotation, include_ghosts: false, placement_bounds:p.placement_bounds })) { this._emit('movementBlocked', { body: b, reason: 'occupied_placement' }); break; }
                    r.position = [...position]; r.rotation = rotation;
                    if (!p.preserve_velocity) { r.velocity = [0, 0]; r.angular_velocity = 0; }
                    if(r.previous_position[0]!==r.position[0]||r.previous_position[1]!==r.position[1]||r.previous_rotation!==r.rotation)this.#broadphaseEpoch++;
                    r.previous_position=[...r.position];r.previous_rotation=r.rotation;
                    try{this.#sync(r);}catch(error){Object.assign(r,previous);this.#sync(r);throw error;}
                    break;
                }
                case 'velocity': if (r.config.physics_type !== 'static') r.velocity = local(p.velocity); break;
                case 'angular_velocity': if (r.config.physics_type !== 'static') r.angular_velocity = p.angular_velocity; break;
                case 'force': if (movable(r)) { const f = local(p.force); r.force = add(r.force, f); if (point) r.torque += (point[0] - massCenter(r)[0]) * f[1] - (point[1] - massCenter(r)[1]) * f[0]; } break;
                case 'torque': if (movable(r)) r.torque += p.torque; break;
                case 'impulse': changeVelocity(r, local(p.impulse), point); break;
                case 'angular_impulse': changeAngularSpeed(r, p.angular_impulse * inverseInertia(r)); break;
                case 'impact': {
                    if (!physical(r) || r.config.ghost || source.config.ghost || !this.#meets(source, r)) break;
                    const direction = unit(sub(r.position, source.position)); changeVelocity(r, scale(direction, p.strength), p.world_point); break;
                }
                case 'stop': r.velocity = [0, 0]; r.angular_velocity = 0; r.force = [0, 0]; r.torque = 0; break;
                case 'sleep': r.sleeping = true; r.velocity = [0, 0]; r.angular_velocity = 0; break;
                case 'wake': r.sleeping = false; r.sleep_time = 0; break;
                default: throw new Error(`Unknown physics command: ${action}`);
            }
            if (action !== 'sleep') { r.sleeping = false; r.sleep_time = 0; }
            enforceLocks(r); this.#motionEnvelope = null; this.#attachments._syncDescendants(r, action === 'position' || action === 'rotation');
        }); return b;
    }
    #meets(a, b, unmounted_a = false) { return (unmounted_a ? a.config.physics_type !== 'no_collision' : physical(a)) && physical(b) && !a.config.collision_exclusions.includes(b.id) && !b.config.collision_exclusions.includes(a.id) && !!(a.config.collision_mask & b.config.collision_group) && !!(b.config.collision_mask & a.config.collision_group); }
    _canCollide(a, b, { unmounted_a = false } = {}) { return this.#meets(this._record(a), this._record(b), unmounted_a); }
    #report(a, b, contact, response = {}) {
        const lo = a.id < b.id, key = lo ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        const packet = { body_a: (lo ? a : b).handle, body_b: (lo ? b : a).handle, world_point: [...contact.world_point],
            entity_a: this.elements.fetchEntity((lo ? a : b).id), entity_b: this.elements.fetchEntity((lo ? b : a).id),
            normal: scale(contact.normal, lo ? 1 : -1), penetration_depth: contact.penetration_depth,
            relative_velocity: scale(response.relative_velocity ?? sub(b.velocity, a.velocity), lo ? 1 : -1),
            relative_speed: length(response.relative_velocity ?? sub(b.velocity, a.velocity)),
            normal_impulse: response.normal_impulse ?? 0, tangent_impulse: response.tangent_impulse ?? 0, sensor_only: a.config.ghost || b.config.ghost };
        const prior = this.#stepContacts.get(key);
        if (prior) { prior.normal_impulse += packet.normal_impulse; prior.tangent_impulse += packet.tangent_impulse; }
        else this.#stepContacts.set(key, packet);
    }
    #redirectAtContact(r,motor,from,to,fraction,decision){
        const at=add(from.position,scale(sub(to.position,from.position),fraction));
        const heading=decision.target!==undefined?sub(referencePosition(this,decision.target),at):scale(r.velocity,-1);
        if(length(heading)<EPS)throw new TypeError('Projectile redirection heading must be nonzero');
        let owner=decision.owner_id??motor.config.owner_id;if(owner!==null){if(decision.at_fraction!==undefined&&!this.fetchBody(owner))owner=null;else this._record(owner);}
        const lifetime=number(decision.min_lifetime??0,'min_lifetime',0);
        r.position=at;r.previous_position=[...at];r.velocity=scale(unit(heading),length(r.velocity));
        motor.config.owner_id=owner;motor.hit_bodies.clear();motor.physical_hits=0;motor.remaining=Math.max(motor.remaining,lifetime);
        this._emit('projectileRedirected',{projectile:this.elements.fetchEntity(r.id),body:r.handle,owner_id:owner});
    }
    #projectiles(moving) {
        for (const r of moving) {
            const motor = r.motor; if (!(motor instanceof projectileMotor) || r.parent_mount || !bodyActive(r)) continue;
            const hits = [];
            const reach = shapeReach(r.shape), from = previousPose(r), to = pose(r);
            for (const body of this.spatial_grid.querySweep({ from: from.position, to: to.position, radius: reach })) {
                if (!body.body_id || body === r.handle || motor.hit_bodies.has(body.body_id) || body.body_id === motor.config.owner_id) continue;
                const target = this._record(body); if (!this.#meets(r, target) || target.motor instanceof projectileMotor) continue;
                this.#stats.narrow_checks++;
                const c = collisionDetector.sweep(r.shape, from, to, target.shape, target.config.physics_type === 'static' ? pose(target) : previousPose(target), pose(target));
                if (c) hits.push({ target, contact: c });
            }
            if(motor.interception){hits.push({interception:motor.interception,contact:{fraction:motor.interception.at_fraction}});motor.interception=null;}
            hits.sort((a, b) => a.contact.fraction - b.contact.fraction || (a.target?.id??Infinity) - (b.target?.id??Infinity));
            for (const { target, contact, interception } of hits) {
                if(interception){this.#redirectAtContact(r,motor,from,to,contact.fraction,interception);break;}
                let decision=null;
                for(const handler of this.#projectilePolicies){
                    const result=handler(Object.freeze({projectile:this.elements.fetchEntity(r.id),target_entity:this.elements.fetchEntity(target.id),target_body:target.handle,world_point:Object.freeze([...contact.world_point])}));
                    if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('Projectile contact policies must be synchronous');}
                    if(result){decision=result;break;}
                }
                if(decision?.action==='ignore')continue;
                if(decision?.action==='redirect'){
                    this.#redirectAtContact(r,motor,from,to,contact.fraction,decision);break;
                }
                if(decision&&decision.action!=='hit')throw new TypeError('Unknown projectile contact decision');
                const contactLoss=number(decision?.penetration_loss??motor.config.penetration_loss,'contact penetration_loss',0,1);
                motor.hit_bodies.add(target.id);
                const sensor = r.config.ghost || target.config.ghost;
                if (!sensor && motor.config.impact_strength) changeVelocity(target, scale(unit(r.velocity), motor.config.impact_strength * motor.impact_scale), contact.world_point);
                this.#report(r, target, contact);
                this._emit('projectileHit', { projectile: this.elements.fetchEntity(r.id) ?? motor, body: r.handle, target_body: target.handle, world_point: [...contact.world_point], incoming_direction:scale(unit(r.velocity),-1),normal: [...contact.normal], fraction: contact.fraction, impact_scale: motor.impact_scale, sensor_only: sensor });
                if (!sensor) {
                    motor.physical_hits++;
                    if (motor.physical_hits > motor.config.penetration_count) {
                        r.position = add(from.position, scale(sub(to.position, from.position), contact.fraction));
                        r.config.active = false; break;
                    }
                    motor.impact_scale *= 1 - contactLoss;
                }
            }
            if (motor.remaining <= 0) r.config.active = false;
            this.#sync(r);
            if (!r.config.active) this.removeBody(r.handle);
        }
    }
    #collisionBounds(r) { return sweptBounds(r); }
    #collide(moving, iteration) {
        let candidates;
        const revision=this.spatial_grid.revision,cache=this.#candidateCache;
        if(cache&&cache.revision===revision&&cache.epoch===this.#broadphaseEpoch){candidates=cache.pairs;this.#stats.broadphase_reuses++;}
        else{
            const sources=moving.filter(r=>physical(r)&&r.config.collision_mask&&!(r.motor instanceof projectileMotor));
            candidates=this.spatial_grid.collectCandidatePairs(sources.map(r=>({id:r.id,bounds:this.#collisionBounds(r)})),[],
                (a,b)=>boundsMeet(this.#collisionBounds(this._record(a)),this.#collisionBounds(this._record(b)))&&this.#meets(this._record(a),this._record(b))&&!(this._record(b).motor instanceof projectileMotor));
            this.#candidateCache={revision,epoch:this.#broadphaseEpoch,pairs:candidates};this.#stats.broadphase_builds++;
        }
        this.#stats.candidate_pairs += candidates.length;
        const contacts = [];
        for (const [ha, hb] of candidates) {
            const a = this._record(ha), b = this._record(hb);
            if (!this.#meets(a, b) || a.motor instanceof projectileMotor || b.motor instanceof projectileMotor) continue;
            this.#stats.narrow_checks++;
            let contact = collisionDetector.contact(a.shape, pose(a), b.shape, pose(b));
            if (!contact && iteration === 0 && (a.config.continuous_collision || b.config.continuous_collision)) {
                const pa = a.config.physics_type === 'static' ? pose(a) : previousPose(a), pb = b.config.physics_type === 'static' ? pose(b) : previousPose(b);
                const start = collisionDetector.contact(a.shape, pa, b.shape, pb);
                // Touching and approaching is a t=0 hit, not permission to tunnel through the solid.
                if (start) {
                    const stepAt = (r, p) => {
                        const d = sub(r.position, p.position), angle = r.rotation - p.rotation, off = sub(start.world_point, p.position);
                        return [d[0] - angle * off[1], d[1] + angle * off[0]];
                    };
                    const relative = sub(stepAt(b, pb), stepAt(a, pa));
                    if (relative[0] * start.normal[0] + relative[1] * start.normal[1] < -EPS) contact = { ...start, fraction: 0 };
                } else contact = collisionDetector.sweep(a.shape, pa, pose(a), b.shape, pb, pose(b));
            }
            if (contact) contacts.push({ a, b, contact });
        }
        contacts.sort((a, b) => (a.contact.fraction ?? 1) - (b.contact.fraction ?? 1) || a.a.id - b.a.id || a.b.id - b.b.id);
        let changed = false;
        for (const entry of contacts) {
            const { a, b } = entry; let c = entry.contact;
            const sensor = a.config.ghost || b.config.ghost;
            if (c.fraction !== undefined && !sensor) {
                for (const r of [a, b]) if (r.config.physics_type !== 'static') {
                    r.position = add(r.previous_position, scale(sub(r.position, r.previous_position), c.fraction));
                    r.rotation = r.previous_rotation + (r.rotation - r.previous_rotation) * c.fraction;
                }
            } else c = collisionDetector.contact(a.shape, pose(a), b.shape, pose(b));
            if (!c) continue;
            const response = sensor ? {} : contactSolver.resolve(a, b, c);
            if (!sensor && (c.penetration_depth > 1e-5 || c.fraction !== undefined || response.normal_impulse > EPS)) changed = true;
            this.#report(a, b, c, response);
            if (!sensor) {
                this.#sync(a); this.#sync(b);
                if (iteration === 0) for (const r of [a, b]) if (r.motor instanceof characterMotor && r.motor.intent) this._emit('movementBlocked', { body: r.handle, reason: 'contact' });
            }
        }
        return changed;
    }
    commitCommands() {
        if(this.#stepping || this.#dispatching || this.#committing)throw new Error('Command commits are not reentrant');
        const queued = this.#queue; this.#queue = []; this.#committing = true;
        try { for (const fn of queued) fn(); } finally { this.#committing = false; }
    }
    updateState(step_seconds = this.config.fixed_step, authority) {
        if (this.#stepAuthority !== undefined && authority !== this.#stepAuthority) throw new Error('Only the owning runtime may step this physicsSystem');
        number(step_seconds, 'step_seconds', EPS, 0.1);
        if (this.#stepping || this.#dispatching) throw new Error('Physics updates are not reentrant');
        this.commitCommands();
        this.rigs._beforeStep(step_seconds);
        this.#stepping = true; this.#tick++; this.#stepContacts.clear(); this.#stats.steps++;
        try {
            const moving = [...this.#moving].filter(r => bodyActive(r));
            this.#stats.active_movers = moving.length;
            for(const r of moving){
                // Previous poses affect swept candidate bounds even when the current
                // index is already tight, so dropping an old sweep invalidates pairs.
                if(r.previous_position[0]!==r.position[0]||r.previous_position[1]!==r.position[1]||r.previous_rotation!==r.rotation){
                    this.#broadphaseEpoch++;r.previous_position=[...r.position];r.previous_rotation=r.rotation;
                }
            }
            this.#attachments._capturePrevious(step_seconds); this.rigs._capturePrevious();
            this.traffic._update(); this.rails._update(step_seconds);
            this.#particles._beforeStep(step_seconds);
            for (const r of moving) {
                r.motion_step = r.motor instanceof projectileMotor ? Math.min(step_seconds, Math.max(0, r.motor.remaining)) : step_seconds;
                if (r.parent_mount) { r.force[0]=r.force[1]=0;r.torque=0;continue; }
                if (r.sleeping) continue;
                const scripted = this.motion._controls(r, step_seconds) || this.rails._controls(r, step_seconds); r.prescribed_step = scripted || r.config.physics_type === 'kinematic';
                if (!scripted) r.motor?._update(step_seconds);
                if (movable(r) && !scripted) {
                    if (r.force[0] || r.force[1]) changeVelocity(r, scale(r.force, step_seconds));
                    if (this.config.gravity[0] || this.config.gravity[1]) changeVelocity(r, scale(this.config.gravity, massProperties(r).mass * step_seconds), massCenter(r));
                    if(r.torque)changeAngularSpeed(r,r.torque*inverseInertia(r)*step_seconds);
                    if((r.config.linear_damping||r.config.angular_damping)&&(r.velocity[0]||r.velocity[1]||r.angular_velocity)){
                        const velocity=scale(centerVelocity(r),Math.exp(-r.config.linear_damping*step_seconds));
                        r.angular_velocity*=Math.exp(-r.config.angular_damping*step_seconds);setCenterVelocity(r,velocity);
                    }
                }
                enforceLocks(r);
                r.force[0]=r.force[1]=0;r.torque=0;this.#sync(r);
            }
            // Resolve existing contacts after motors/forces but before travel. Otherwise
            // a requested inward component can repeatedly clip the whole CCD step at
            // t=0, freezing valid tangential walking despite a nonzero slide velocity.
            this.#collide(moving.filter(r => r.config.active), -1);
            for (const r of moving) {
                if (r.sleeping || r.parent_mount) continue;
                enforceLocks(r);
                if(r.velocity[0]||r.velocity[1]||r.angular_velocity){
                    if(r.prescribed_step){r.position=add(r.position,scale(r.velocity,r.motion_step));r.rotation+=r.angular_velocity*r.motion_step;}
                    else integrateAtCenter(r,r.motion_step);
                }
                this.#sync(r, true);
            }
            this.#attachments._syncAll();
            this.#particles._syncAnchors();
            this.#projectiles(moving);
            for (const c of this.#constraints.values()) constraintRecord(c).applied_impulse = 0;
            for (let i = 0; i < this.config.solver_iterations; i++) {
                const changed = this.#collide(moving.filter(r => r.config.active), i);
                this.#attachments._syncAll();
                this.#particles._syncAnchors();
                for (const c of this.#constraints.values()) constraintSolver.solve(c, step_seconds / this.config.solver_iterations);
                for (const c of this.#constraints.values()) { const cr = constraintRecord(c); this.#sync(cr.a); if (cr.b) this.#sync(cr.b); }
                if (!changed && !this.#constraints.size) break;
            }
            for (const r of moving) {
                if (!r.config.active || r.removed) continue;
                enforceLocks(r);
                if (!r.motor && r.config.sleep_enabled && length(r.velocity) < this.config.sleep_speed && Math.abs(r.angular_velocity) < this.config.sleep_speed) {
                    r.sleep_time += step_seconds;
                    if (r.sleep_time >= this.config.sleep_delay) { r.sleeping = true; r.velocity = [0, 0]; r.angular_velocity = 0; }
                } else r.sleep_time = 0;
                this.#sync(r);
            }
            this.rigs._update(step_seconds);
            this.#attachments._syncAll();
            this.#particles._update(step_seconds);
            for (const [key, packet] of this.#stepContacts) this._emit(this.#contacts.has(key) ? 'contactStay' : 'contactBegin', packet);
            for (const [key, packet] of this.#contacts) if (!this.#stepContacts.has(key)) this._emit('contactEnd', packet);
            this.#contacts = new Map(this.#stepContacts);
        } finally { this.#stepping = false; }
        this.#dispatching = true;
        const errors = [], events = this.#events; this.#events = [];
        try {
            for (const ev of events) {
                const event = { ...ev };
                for (const k of ['normal', 'world_point', 'relative_velocity', 'position', 'requested_position']) if (Array.isArray(event[k])) event[k] = Object.freeze([...event[k]]);
                Object.freeze(event);
                for (const fn of [...(this.#listeners.get(ev.type) ?? [])]) try { fn(event); } catch (e) { errors.push(e); }
            }
        } finally { this.#dispatching = false; }
        if (errors.length) throw new AggregateError(errors, 'Physics event handler failed');
        return this.getStatistics();
    }
    on(event_name, handler) {
        if (typeof handler !== 'function') throw new TypeError('Event handler must be a function');
        let set = this.#listeners.get(event_name); if (!set) this.#listeners.set(event_name, set = new Set()); set.add(handler);
        return () => set.delete(handler);
    }
    findNearbyPlacement(body,options){return this.#queries.findNearbyPlacement(body,options);}
    findDirectionalPlacement(body, {direction,angle,distance,...options}){
        const r=this._record(referenceBody(body));number(distance,'distance',0);if(angle!==undefined)number(angle,'angle');
        const heading=vector(direction??[Math.cos(angle??r.rotation),Math.sin(angle??r.rotation)]);
        if(length(heading)<=EPS)return null;
        return this.findClearPlacement({...options,body,from:r.position,to:add(r.position,scale(unit(heading),distance))});
    }
    getBodyGrip(body, options) { const r = this._record(referenceBody(body)); return layoutGeometry.boxGrip(r.shape, pose(r), options); }
    getMassProperties(body) {
        const r = this._record(referenceBody(body)), p = massProperties(r);
        return { ...p, local_center: [...p.local_center], center: massCenter(r) };
    }
    attachBody(body, packet) { return this.#attachments.attachBody(body, packet); }
    detachBody(body, packet) { return this.#attachments.detachBody(body, packet); }
    getAttachedBodies(parent, results) { return this.#attachments.getAttachedBodies(parent, results); }
    getAttachmentState(body) { return this.#attachments.getAttachmentState(body); }
    setAttachmentPose(body, changes) { return this.#attachments.setAttachmentPose(body, changes); }
    getBodyPoint(body, local_position, { blend = 1, local_rotation = 0 } = {}) {
        return pathGeometry.transformPose(this._renderBody(body, blend, {}), { local_position, local_rotation });
    }
    /** Detached motion sample from the last fixed step, for presentation and telemetry. */
    /** Shared-grid radial region, including swept expanding rings and bounded outside-safe zones. */
    isDirectionInArc(body,direction,{half_angle=Math.PI}={}){const r=this._record(referenceBody(body)),v=vector(direction);number(half_angle,'half_angle',0,Math.PI);return length(v)>EPS&&Math.abs(Math.atan2(Math.sin(Math.atan2(v[1],v[0])-r.rotation),Math.cos(Math.atan2(v[1],v[0])-r.rotation)))<=half_angle;}
    queryRadialRegion(source,{radius,radius_to=radius,progress=0,previous_progress=progress,thickness=null,outside=false,limit_radius,include_groups=BODY_GROUP.CHARACTER,...filters}={}) {
        number(radius,'radius',0);number(radius_to,'radius_to',0);number(progress,'progress',0,1);number(previous_progress,'previous_progress',0,1);
        if(thickness!==null)number(thickness,'thickness',0);if(typeof outside!=='boolean')throw new TypeError('outside must be boolean');
        const r=this._record(referenceBody(source)),current=radius+(radius_to-radius)*progress,prior=radius+(radius_to-radius)*previous_progress;
        let inner=outside?current:thickness===null?0:Math.max(0,Math.min(prior,current)-thickness),outer=outside?number(limit_radius,'limit_radius',current):thickness===null?current:Math.max(prior,current)+thickness;
        const hits=this.overlapShape({...filters,collision_shape:{shape_type:'circle',radius:Math.max(EPS,outer)},position:r.position,include_groups,include_ghosts:false,ignore_body:r.handle}).filter(hit=>{const target=this._record(hit.body),distance=length(sub(target.position,r.position)),reach=shapeReach(target.shape);return distance+reach>=inner&&distance-reach<=outer;});
        return {radius:current,hits};
    }
    /** Native authored-frame placement, checked from the anchor to each candidate. */
    findRelativePlacement(body,anchor,{distance,angle_offsets=[Math.PI],...options}={}) {
        number(distance,'distance',0);if(!Array.isArray(angle_offsets)||!angle_offsets.length)throw new TypeError('Expected relative angles');
        const origin=referencePosition(this,anchor),rotation=Array.isArray(anchor)?0:this._record(referenceBody(anchor)).rotation;
        for(const angle of angle_offsets){number(angle,'angle offset');const to=add(origin,scale([Math.cos(rotation+angle),Math.sin(rotation+angle)],distance)),landing=this.findClearPlacement({...options,body,from:origin,to,query_unmounted:true,include_ghosts:false});if(landing&&landing.fraction>=1-EPS&&this.getPathClearance({body,from:origin,to:landing.position,include_ghosts:false,ignore_body:[referenceBody(body),...(Array.isArray(anchor)?[]:[referenceBody(anchor)])]}).clear)return landing;}
        return null;
    }
    /** Ranged tactical placement uses native path/sight queries with a bounded candidate budget. */
    findFiringPlacement(body,target,{near_range=420,inner_range=140,max_candidates=24}={}) {
        number(max_candidates,'max_candidates',1,256);if(!Number.isInteger(max_candidates))throw new TypeError('Candidate count must be integral');const at=referencePosition(this,target);
        for(let i=0;i<max_candidates;i++){const spot=this.findWanderPlacement(body,{origin:at,near_range,inner_range,angle_sample:i/max_candidates,radius_sample:(i%3)/2,include_ghosts:false});if(!spot)continue;if(this.raycast({from:spot.position,to:at,include_groups:BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE,ignore_body:[referenceBody(body),...(Array.isArray(target)?[]:[referenceBody(target)])],include_ghosts:false}))continue;const path=this.findPath({body,to:spot.position});if(path)return spot;}return null;
    }
    getBodyMotion(body) { const r=this._record(referenceBody(body)); return {distance:length(sub(r.position,r.previous_position)),previous_rotation:r.previous_rotation}; }
    /** Test an authored local hit region against a world-space impact footprint. */
    testBodyRegion(body,{collision_shape,point,radius=0}={}) { const r=this._record(referenceBody(body));number(radius,'radius',0);return !!collisionDetector.contact(new collisionShape(collision_shape),pose(r),new collisionShape({shape_type:'circle',radius:Math.max(EPS,radius)}),{position:vector(point),rotation:0}); }
    /** A finite-width beam uses the shared sweep index; optional cover clipping is native. */
    castBeamFrom(source,{local_position=[0,0],range,width=1,penetrating=false,include_groups=BODY_GROUP.CHARACTER,...aim}={}) {
        number(range,'range',0);number(width,'width',EPS);if(typeof penetrating!=='boolean')throw new TypeError('penetrating must be boolean');
        const r=this._record(referenceBody(source)),from=this.getBodyPoint(source,local_position).position,heading=this.resolveAim(source,aim),end=add(from,scale(heading.direction,range));
        const blocker=penetrating?null:this.shapeCast({from,to:end,collision_shape:{shape_type:'circle',radius:width},include_groups:BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE,include_ghosts:false,ignore_body:r.handle,max_results:1})[0]??null;
        const to=blocker?add(from,scale(sub(end,from),blocker.fraction)):end;
        return {from,to,rotation:heading.rotation,hits:this.shapeCast({from,to,collision_shape:{shape_type:'circle',radius:width},include_groups,include_ghosts:false,ignore_body:r.handle})};
    }
    getConstraint(value) { return this.#constraints.get(value?.constraint_id??value)??null; }
    createConstraint(packet) { const id = this.#nextConstraint++, c = new physicsConstraint(this, id, packet); this._mutate(() => this.#constraints.set(id, c)); return c; }
    getBodyConstraints(body, results = []) {
        const r = this._record(body); results.length = 0;
        for (const c of this.#constraints.values()) { const joint = constraintRecord(c); if (joint.a === r || joint.b === r) results.push(c); }
        return results;
    }
    removeConstraint(value) { const id = value?.constraint_id ?? value; this._mutate(() => this.#constraints.delete(id)); }
    #constraint(value) { const c = this.#constraints.get(value?.constraint_id ?? value); if (!c) throw new Error('Unknown constraint'); return c; }
    setConstraintTarget(c, world_target) { const target = vector(world_target), v = this.#constraint(c); this._mutate(() => updateConstraint(v, { world_target: target })); }
    setConstraintMotor(c, packet) { const v = this.#constraint(c), changes = clone(packet); this._mutate(() => updateConstraint(v, changes)); }
    beginDrag(body, packet = {}) { return this.createConstraint({ ...packet, constraint_type: 'drag', body_a: referenceBody(body), world_target: packet.world_target ?? referencePosition(this, body) }); }
    setDragTarget(c, position) { return this.setConstraintTarget(c, position); }
    rotateDraggedBody(c, rotation) { const v = constraintRecord(this.#constraint(c)); v.a.handle.setRotation(rotation, { preserve_velocity: true }); }
    endDrag(c) { this.removeConstraint(c); }
    advanceBody(source,{distance,direction,angle,placement_bounds}={}){
        const r=this._record(referenceBody(source));number(distance,'distance',0);if(angle!==undefined)number(angle,'angle');
        const heading=direction?unit(vector(direction)):[Math.cos(angle??r.rotation),Math.sin(angle??r.rotation)];
        if(length(heading)<=EPS)return 0;
        const requested=add(r.position,scale(heading,distance));
        const clearance=this.getPathClearance({body:source,from:r.position,to:requested,include_ghosts:false});
        const traveled=Math.max(0,distance*clearance.fraction-(clearance.clear?0:1e-4));
        const position=add(r.position,scale(heading,traveled));
        if(!traveled||!this.isPlacementClear(source,position,{include_ghosts:false,placement_bounds}))return 0;
        r.handle.setPosition(position,{preserve_velocity:true});return traveled;
    }
    onProjectileContact(handler){if(typeof handler!=='function')throw new TypeError('Projectile policy must be a function');this.#projectilePolicies.add(handler);return ()=>this.#projectilePolicies.delete(handler);}
    applyImpulseBetween(source,target,{strength,world_point,if_supported=false}={}){
        const a=this._record(referenceBody(source)),b=this._record(referenceBody(target));number(strength,'strength',0);
        if(typeof if_supported!=='boolean')throw new TypeError('if_supported must be boolean');
        if(if_supported)for(let r=b;r.parent_mount;r=r.parent_mount.parent)if(!r.parent_mount.combine_mass)return null;
        const direction=unit(sub(b.position,a.position));b.handle.applyImpulse(scale(direction,strength),world_point?{world_point}:{});return b.handle;
    }
    sweepAttachedShape(source,{collision_shape,from_local_position=[0,0],to_local_position=from_local_position,from_local_rotation=0,to_local_rotation=from_local_rotation,line_of_sight=false,occlusion_groups=BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE,...options}={},results=[]){
        const r=this._record(referenceBody(source)),from=this.getBodyPoint(source,from_local_position,{local_rotation:from_local_rotation}),to=this.getBodyPoint(source,to_local_position,{local_rotation:to_local_rotation});
        const hits=this.shapeCast({...options,collision_shape,from:from.position,to:to.position,from_rotation:from.rotation,to_rotation:to.rotation,ignore_body:options.ignore_body??r.handle});
        results.length=0;
        for(const hit of hits){if(line_of_sight&&this.raycast({from:r.position,to:hit.body.position,include_groups:occlusion_groups,include_ghosts:false,ignore_body:[r.handle,hit.body]}))continue;results.push(hit);}return results;
    }
    createHitVolume(packet) { return this.elements.createTrigger({ ...packet, ghost: true, physics_type: 'kinematic', collision_group: packet.collision_group ?? BODY_GROUP.SENSOR }); }
    sweepHitVolume(body, to, options = {}, results = []) { const r = this._record(body); return this.shapeCast({ ...options, collision_shape: r.config.collision_shape, from: r.position, to, from_rotation: r.rotation, ignore_body: r.handle }, results); }
    removeHitVolume(body) { this.removeBody(body); }
    launchProjectile(projectile, direction, options) { return projectile.launchProjectile(direction, options); }
    redirectProjectile(projectile, direction, options) { return projectile.redirectProjectile(direction, options); }
    removeProjectile(projectile) { this.removeBody(projectile.body); }
    registerSpatialInstance(instance_id, bounds, data = {}) {
        const id = `spatial:${instance_id}`, value = freeze({ instance_id, ...clone(data) });
        this._mutate(() => this.spatial_grid.registerInstance(id, bounds, value)); return value;
    }
    updateSpatialInstance(id, bounds) { this._mutate(() => this.spatial_grid.updateInstance(`spatial:${id}`, bounds)); }
    removeSpatialInstance(id) { this._mutate(() => this.spatial_grid.removeInstance(`spatial:${id}`)); }
    getStatistics() { return { ...this.#stats, bodies: this.#bodies.size, entities: this.elements.getStatistics().entities, constraints: this.#constraints.size, spatial: this.spatial_grid.getStatistics() }; }
    resolveAim(source,options){return this.#queries.resolveAim(source,options);}
    observeTarget(observer,target,options){return this.#queries.observeTarget(observer,target,options);}
    predictTargetPosition(observer,target,options){return this.#queries.predictTargetPosition(observer,target,options);}
    findWanderPlacement(body,options){return this.#queries.findWanderPlacement(body,options);}
    peruseNearbyEntities(reference, options, results) { return this.#queries.peruseNearbyEntities(reference, options, results); }
    findNearestEntity(reference, options = {}) { return this.peruseNearbyEntities(reference, { ...options, max_results: 1 })[0] ?? null; }
    raycast(packet, result) { return this.#queries.raycast(packet, result); }
    shapeCast(packet, results) { return this.#queries.shapeCast(packet, results); }
    overlapShape(packet, results) { return this.#queries.overlapShape(packet, results); }
    isPlacementClear(body_or_shape, position, options) { return this.#queries.isPlacementClear(body_or_shape, position, options); }
    findClearPlacement(packet, result) { return this.#queries.findClearPlacement(packet, result); }
    findPath(packet, result) { return this.#queries.findPath(packet, result); }
    getPathClearance(packet, result) { return this.#queries.getPathClearance(packet, result); }
    queryEntitiesInBounds(packet, results) { return this.#queries.queryEntitiesInBounds(packet, results); }
    getBodyBounds(body, options) { return this.#queries.getBodyBounds(body, options); }
    containsPoint(body, position, options) { return this.#queries.containsPoint(body, position, options); }
    predictMovementContacts(packet, results) { return this.#queries.predictMovementContacts(packet, results); }
    predictCollision(packet, result) { return this.#queries.predictCollision(packet, result); }
    createParticlePool(packet) { return this.#particles.createParticlePool(packet); }
    emitParticles(pool, packet) { return this.#particles.emitParticles(pool, packet); }
    getParticleState(pool, result) { return this.#particles.getParticleState(pool, result); }
    clearParticles(pool) { return this.#particles.clearParticles(pool); }
    createCloth(packet) { return this.#particles.createCloth(packet); }
    setClothAnchors(cloth, positions) { return this.#particles.setClothAnchors(cloth, positions); }
    setClothWind(cloth, wind) { return this.#particles.setClothWind(cloth, wind); }
    getClothState(cloth, result) { return this.#particles.getClothState(cloth, result); }
    removeCloth(cloth) { return this.#particles.removeCloth(cloth); }
    createChain(packet) { return this.#particles.createChain(packet); }
    setChainAnchors(chain, positions) { return this.#particles.setChainAnchors(chain, positions); }
    getChainState(chain, result) { return this.#particles.getChainState(chain, result); }
    removeChain(chain) { return this.#particles.removeChain(chain); }
    clearWorld() {
        this._mutate(() => { for (const r of this.#bodies.values()) r.removed = true; this.#bodies.clear(); this.#moving.clear(); this.#constraints.clear(); this.#contacts.clear(); this.#stepContacts.clear();
            this.#attachments._clear(); this.rigs._clear(); this.elements._clear(); this.traffic._clear(); this.rails._clear(); this.motion._clear(); this.spatial_grid.clear(); this.#particles._clear(); this.#events = []; this.#nextId = 1; this.#nextConstraint = 1; this.#tick = 0; this.#motionEnvelope = null;this.#candidateCache=null;this.#broadphaseEpoch++; });
    }
    // Versioned exchange; validate a replacement before changing the live registry.
    _exportState() {
        if (this.#stepping || this.#dispatching || this.#committing || this.#queue.length) throw new Error('Save physics between steps with no pending commands');
        return { format_version: 2, config: clone(this.config), simulation_tick: this.simulation_tick, entities: this.elements._saveState(),
            attachments: this.#attachments._saveState(), rigs:this.rigs._saveState(),
            bodies: [...this.#bodies.values()].map(r => ({ ...snapshot(r), active: r.config.active, force: [...r.force], torque: r.torque, sleep_time: r.sleep_time, motor: this._saveMotor(r.motor) })),
            constraints: [...this.#constraints.values()].map(c => c.getState()), particles: this.#particles._saveState(), traffic: this.traffic._saveState(), motion: this.motion._saveState(), rails: this.rails._saveState(),
            spatial_instances: this.spatial_grid.exportInstances().filter(e => typeof e.id === 'string'),
            next_body_id: this.#nextId, next_constraint_id: this.#nextConstraint };
    }
    _saveMotor(m) {
        if (!m) return null;
        if (m instanceof characterMotor) {
            const target = value => {
                if (!value) return null;
                if (Array.isArray(value)) return { position: [...value] };
                const id = typeof value === 'number' ? value : referenceBody(value)?.body_id;
                return this.#bodies.has(id) ? { body_id: id } : null;
            };
            const savedIntent = m.intent ? { ...m.intent, target: target(m.intent.target) } : null;
            const savedFacing = m.facing ? { ...m.facing, target: target(m.facing.target) } : null;
            const intent = savedIntent && (savedIntent.mode === 'direction' || savedIntent.target) ? savedIntent : null;
            const facing = savedFacing && (savedFacing.direction || savedFacing.target) ? savedFacing : null;
            return { type: 'character', config: clone(m.config), intent: clone(intent), facing: clone(facing),
                suspended_for: m.suspended_for, path: intent ? clone(m.path) : null, path_index: m.path_index ?? 1, replan: m.replan };
        }
        if (m instanceof vehicleMotor) return { type: 'vehicle', config: clone(m.config), inputs: clone(m.inputs), steering: m.steering, axles: clone(m.axles), surface: clone(m.surface), path: clone(m.path_controller.path), path_index: m.path_controller.index, options: clone(m.path_controller.options) };
        return { type: 'projectile', config: clone(m.config), remaining: m.remaining, impact_scale: m.impact_scale, physical_hits: m.physical_hits, hit_bodies: [...m.hit_bodies],...(m.interception?{interception:clone(m.interception)}:{}) };
    }
    savePhysicsState() { return this._exportState(); }
    loadPhysicsState(packet) {
        const saved = clone(packet);
        if (this.#stepping || this.#dispatching || this.#committing || this.#queue.length) throw new Error('Load physics between steps with no pending commands');
        // Validate the whole exchange in a disposable independent world before replacing this one.
        if (JSON.stringify(saved.config) !== JSON.stringify(this.config)) throw new TypeError('Load into a physicsSystem constructed with the saved config');
        const trial = new physicsSystem({ ...saved.config, asset_library: this.elements.asset_library });
        this.elements._copyTypesTo(trial.elements); trial._importState(saved);
        this.clearWorld(); this._importState(saved);
    }
    _importState(saved) {
        if (saved.format_version !== 2 || !Array.isArray(saved.bodies) || !Array.isArray(saved.constraints) || !Array.isArray(saved.entities)) throw new TypeError('Unsupported physics save');
        const ids = new Set();
        for (const p of saved.bodies) {
            if (!Number.isSafeInteger(p.body_id) || p.body_id < 1 || ids.has(p.body_id)) throw new TypeError('Invalid saved body id'); ids.add(p.body_id);
            this.#nextId = p.body_id; const b = this.createBody(p), r = this._record(b); r.sleeping = !!p.sleeping; r.sleep_time = number(p.sleep_time ?? 0, 'sleep_time', 0);
            r.force = vector(p.force ?? [0, 0]); r.torque = number(p.torque ?? 0, 'torque');
        }
        for (const p of saved.bodies) {
            const r = this.#bodies.get(p.body_id), m = p.motor; if (!m) continue;
            if (m.type === 'character') {
                r.motor = new characterMotor(r.handle, m.config);
                const target = t => t?.position ?? (t ? this._record(t.body_id).handle : null);
                r.motor.intent = m.intent ? { ...m.intent, target: target(m.intent.target) } : null;
                if(r.motor.intent?.acceleration!==undefined)number(r.motor.intent.acceleration,'acceleration',0);
                if(r.motor.intent?.mode==='orbit'){characterMotor._validateOrbit(r.motor.intent);r.motor.intent.orbit_time=number(r.motor.intent.orbit_time??0,'orbit_time',0);}
                r.motor.facing = m.facing ? { ...m.facing, target: target(m.facing.target) } : null;
                r.motor.suspended_for = number(m.suspended_for ?? 0, 'suspended_for', 0);
                r.motor.path = clone(m.path ?? null); r.motor.path_index = m.path_index ?? 1; r.motor.replan = number(m.replan ?? 0, 'replan');
            } else if (m.type === 'vehicle') {
                r.motor = new vehicleMotor(r.handle, m.config); r.motor.inputs = m.inputs; r.motor.steering = number(m.steering, 'steering');
                if (m.surface) r.motor.setSurface(m.surface);
                if (m.axles) { for (const [key, value] of Object.entries(m.axles)) number(value, key); r.motor.axles = clone(m.axles); }
                if (m.path) { r.motor.followPath(m.path, m.options); r.motor.path_controller.index = m.path_index; }
            } else if (m.type === 'projectile') {
                const velocity = [...r.velocity]; r.motor = new projectileMotor(r.handle, m.config); r.velocity = velocity;
                r.motor.remaining = number(m.remaining, 'remaining'); r.motor.impact_scale = number(m.impact_scale, 'impact_scale', 0, 1); r.motor.physical_hits = number(m.physical_hits ?? 0, 'physical_hits', 0); r.motor.hit_bodies = new Set(m.hit_bodies);if(m.interception){const command=m.interception;number(command.at_fraction,'at_fraction',0,1);number(command.min_lifetime,'min_lifetime',0);if(command.target!==undefined)vector(command.target);if(command.owner_id!==null&&(!Number.isSafeInteger(command.owner_id)||command.owner_id<1))throw new TypeError('Invalid interception owner');r.motor.interception=clone(command);}
            } else throw new TypeError('Unknown saved motor');
        }
        const constraintIds = new Set();
        for (const c of saved.constraints) {
            if (!Number.isSafeInteger(c.constraint_id) || c.constraint_id < 1 || constraintIds.has(c.constraint_id)) throw new TypeError('Invalid constraint id'); constraintIds.add(c.constraint_id);
            this.#nextConstraint = c.constraint_id; this.createConstraint({ ...c, body_a: c.body_a, body_b: c.body_b });
        }
        this.#nextId = number(saved.next_body_id, 'next_body_id', Math.max(0, ...ids) + 1);
        this.#nextConstraint = number(saved.next_constraint_id, 'next_constraint_id', Math.max(0, ...constraintIds) + 1);
        this.#tick = number(saved.simulation_tick, 'simulation_tick', 0);
        if (![this.#nextId, this.#nextConstraint, this.#tick].every(Number.isSafeInteger)) throw new TypeError('Saved counters must be safe integers');
        this.#particles._loadState(saved.particles);
        for (const e of saved.spatial_instances ?? []) this.registerSpatialInstance(e.value.instance_id, e.bounds, e.value);
        this.elements._restoreState(saved.entities);
        this.traffic._loadState(saved.traffic); this.motion._loadState(saved.motion); this.rails._loadState(saved.rails);
        this.rigs._loadState(saved.rigs);
        this.#attachments._loadState(saved.attachments);
    }
}
