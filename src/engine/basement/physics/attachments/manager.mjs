// ===== LV0 BASEMENT =====
import {normalizeEmitter} from './emitter.mjs';
import { invalidateMass, massProperties, massCenter, impulseCenter, centerVelocity, setCenterVelocity } from '../core/mass.mjs';
import { vector, number, rotate, add, angleDelta } from '../core/values.mjs';
import { enforceLocks, movable, bodyActive, inverseInertia } from '../core/state.mjs';
import { referenceBody } from '../spatial/queries.mjs';
import { pathGeometry } from '../motion/path-geometry.mjs';

/** Prescribed mounts link existing authoritative body records; they store no copied body state. */
export class attachmentManager {
    #entries = new Map(); #children = new Map(); #restoring = false; #nextId = 1;
    constructor(world) { this.world = world; }
    _hasReservation(record) { return this.#entries.has(record.id); }
    #entry(body) { return this.#entries.get(this.world._record(referenceBody(body)).id) ?? null; }
    #validate(child, parent) {
        if (child.removed || parent.removed) throw new Error('Attachment body was removed');
        if (this.#entries.has(child.id)) throw new Error('Body already has an attachment or pending attachment');
        let cursor = parent, depth = 0;
        while (cursor) {
            if (cursor === child) throw new TypeError('Attachment cycle');
            if (++depth > 64) throw new RangeError('Attachment hierarchy exceeds 64 bodies');
            cursor = this.#entries.get(cursor.id)?.parent;
        }
        const descendants = [[child.id, 1]];
        while (descendants.length) {
            const [id, below] = descendants.pop();
            if (depth + below > 64) throw new RangeError('Attachment hierarchy exceeds 64 bodies');
            for (const next of this.#children.get(id) ?? []) descendants.push([next, below + 1]);
        }
    }
    attachBody(body, { parent_body, local_position = [0, 0], local_rotation = 0, combine_mass = false, emitter = null, rig_anchor = null } = {}) {
        const child = this.world._record(referenceBody(body)), parent = this.world._record(referenceBody(parent_body));
        if (typeof combine_mass !== 'boolean') throw new TypeError('combine_mass must be boolean');
        if(rig_anchor!==null&&typeof rig_anchor!=='string')throw new TypeError('rig_anchor must name a parent rig anchor');
        if(rig_anchor!==null)this.world.rigs.getAnchor(parent.handle,rig_anchor,{world_space:false});
        const launchEmitter=normalizeEmitter(emitter);
        const position = vector(local_position), rotation = number(local_rotation, 'local_rotation'); this.#validate(child, parent);
        pathGeometry.transformPose({ position: parent.position, rotation: parent.rotation }, { local_position: position, local_rotation: rotation });
        const entry = { attachment_id:this.#nextId++,revision:0,emitter:launchEmitter,rig_anchor,anchor_offset_position:position,anchor_offset_rotation:rotation,child, parent, local_position: position, local_rotation: rotation, combine_mass, pending: true, detaching: false };
        // Reservation prevents event-time double attachment and cycles before commands commit.
        this.#entries.set(child.id, entry);
        let children = this.#children.get(parent.id); if (!children) this.#children.set(parent.id, children = new Set()); children.add(child.id);
        this.world._mutate(() => {
            if (this.#entries.get(child.id) !== entry) return;
            if (child.removed || parent.removed) { this.#forget(entry); return; }
            let root = parent;
            while (root.parent_mount?.combine_mass) root = root.parent_mount.parent;
            const capture = combine_mass && child.config.active && bodyActive(parent) && !this.#restoring && movable(root) ? {
                root, parent: { ...massProperties(root), center: massCenter(root), velocity: centerVelocity(root), spin: root.angular_velocity },
                child: { ...massProperties(child), velocity: centerVelocity(child), spin: child.angular_velocity }
            } : null;
            entry.pending = false; child.parent_mount = entry;
            (parent.mass_children ??= new Set()).add(entry); invalidateMass(parent); child.sleeping = false; child.force = [0, 0]; child.torque = 0;
            this.#place(entry, true);
            if (capture) {
                const { root, parent: a, child: b } = capture, center = impulseCenter(root), childCenter = massCenter(child);
                const momentum = [a.mass * a.velocity[0] + b.mass * b.velocity[0], a.mass * a.velocity[1] + b.mass * b.velocity[1]];
                const angular = (p, v, m) => (p[0] - center[0]) * v[1] * m - (p[1] - center[1]) * v[0] * m;
                const properties = massProperties(root);
                root.angular_velocity = inverseInertia(root) ? (a.inertia * a.spin + b.inertia * b.spin + angular(a.center, a.velocity, a.mass) + angular(childCenter, b.velocity, b.mass)) * inverseInertia(root) : a.spin;
                setCenterVelocity(root, momentum.map(v => v / properties.mass)); enforceLocks(root); root.sleeping = false; root.sleep_time = 0;
                this._syncDescendants(root, true);
            } else this._syncDescendants(child, true);
            this.#event('bodyAttached', entry);
        }); return child.handle;
    }
    getAttachedBodies(parent_body, results = []) {
        const parent = this.world._record(referenceBody(parent_body)); results.length = 0;
        for (const id of this.#children.get(parent.id) ?? []) results.push(this.#entries.get(id).child.handle);
        return results;
    }
    getAttachmentState(body) {
        const e = this.#entry(body); return e ? { body_id: e.child.id, parent_body_id: e.parent.id,
            attachment_id:e.attachment_id,revision:e.revision,rig_anchor:e.rig_anchor,anchor_offset_position:[...e.anchor_offset_position],anchor_offset_rotation:e.anchor_offset_rotation,emitter:e.emitter?structuredClone(e.emitter):null,local_position: [...e.local_position], local_rotation: e.local_rotation, combine_mass: e.combine_mass, pending: e.pending, detaching: e.detaching } : null;
    }
    setAttachmentEmitter(body, emitter) {
        const e=this.#entry(body);if(!e)throw new Error('Body is not attached');const normalized=normalizeEmitter(emitter);
        this.world._mutate(()=>{if(this.#entries.get(e.child.id)===e){e.emitter=normalized;e.revision++;}});return e.child.handle;
    }
    setAttachmentPose(body, changes = {}) {
        const e = this.#entry(body); if (!e) throw new Error('Body is not attached');
        const position = changes.local_position === undefined ? undefined : vector(changes.local_position);
        const rotation = changes.local_rotation === undefined ? undefined : number(changes.local_rotation, 'local_rotation');
        pathGeometry.transformPose({ position: e.parent.position, rotation: e.parent.rotation }, { local_position: position ?? e.local_position, local_rotation: rotation ?? e.local_rotation });
        this.world._mutate(() => {
            if (this.#entries.get(e.child.id) !== e) return;
            e.revision++;
            if(e.rig_anchor!==null){if(position)e.anchor_offset_position=position;if(rotation!==undefined)e.anchor_offset_rotation=rotation;}else{if (position) e.local_position = position; if (rotation !== undefined) e.local_rotation = rotation;}
            invalidateMass(e.parent);
            if (!e.pending) { this.#place(e, true); this._syncDescendants(e.child, true); }
        }); return e.child.handle;
    }
    #exit(e, points) {
        for (const local_position of points) {
            const target = pathGeometry.transformPose({ position: e.parent.position, rotation: e.parent.rotation }, { local_position });
            if (!this.world.isPlacementClear(e.child.handle, target.position, { rotation: e.child.rotation, include_ghosts: false, query_unmounted: true })) continue;
            const path = this.world.getPathClearance({ body: e.child.handle, from: e.child.position, to: target.position, from_rotation: e.child.rotation,
                ignore_body: [e.child.handle, e.parent.handle], include_ghosts: false, query_unmounted: true });
            if (path.clear) return target.position;
        }
        return null;
    }
    detachBody(body, { exit_points, inherit_velocity } = {}) {
        const e = this.#entry(body); if (!e) return null;
        if (!Array.isArray(exit_points) || !exit_points.length || exit_points.length > 64) throw new TypeError('Detach needs 1..64 parent-local exit points');
        if (e.pending) throw new Error('Attachment must commit before detaching');
        const points = exit_points.map(p => vector(p));
        if (inherit_velocity === undefined) inherit_velocity = e.combine_mass;
        if (typeof inherit_velocity !== 'boolean') throw new TypeError('inherit_velocity must be boolean');
        if (e.detaching) throw new Error('Detach request already pending');
        if (!this.#exit(e, points)) return null;
        e.detaching = true;
        this.world._mutate(() => {
            if (this.#entries.get(e.child.id) !== e) return;
            const position = this.#exit(e, points);
            if (!position) { e.detaching = false; this.#event('bodyDetachBlocked', e); return; }
            this.#forget(e); e.child.position = position; e.child.previous_position = [...position]; e.child.previous_rotation = e.child.rotation;
            if (!inherit_velocity) { e.child.velocity = [0, 0]; e.child.angular_velocity = 0; }
            e.child.sleeping = false; enforceLocks(e.child); this.world._syncBody(e.child.handle); this._syncDescendants(e.child, true);
            this.#event('bodyDetached', e, { reason: 'requested' });
        }); return e.child.handle;
    }
    #event(type, e, extra = {}) {
        if (this.#restoring) return;
        this.world._emit(type, { attachment_id:e.attachment_id,body: e.child.handle, parent_body: e.parent.handle, parent_entity: this.world.elements.fetchEntity(e.parent.id), ...extra });
    }
    #forget(e) {
        this.#entries.delete(e.child.id); e.parent.mass_children?.delete(e); invalidateMass(e.parent); e.child.parent_mount = null;
        const children = this.#children.get(e.parent.id); children?.delete(e.child.id); if (!children?.size) this.#children.delete(e.parent.id);
    }
    #anchorPose(e,blend=1){
        const anchor=this.world.rigs.getAnchor(e.parent.handle,e.rig_anchor,{world_space:false,blend}),m=anchor.matrix,p=e.anchor_offset_position;
        return {local_position:[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]],local_rotation:anchor.rotation+e.anchor_offset_rotation};
    }
    #refreshAnchor(e){
        if(e.rig_anchor===null)return;
        const pose=this.#anchorPose(e);
        if(pose.local_position[0]!==e.local_position[0]||pose.local_position[1]!==e.local_position[1]||pose.local_rotation!==e.local_rotation){
            e.local_position=pose.local_position;e.local_rotation=pose.local_rotation;e.revision++;invalidateMass(e.parent);
        }
        const previous=e.previous_anchor_pose,dt=e.anchor_step;
        const velocity=previous&&dt?[(e.local_position[0]-previous.position[0])/dt,(e.local_position[1]-previous.position[1])/dt]:[0,0];
        const spin=previous&&dt?angleDelta(previous.rotation,e.local_rotation)/dt:0;
        if(!e.anchor_velocity||velocity[0]!==e.anchor_velocity[0]||velocity[1]!==e.anchor_velocity[1]||spin!==e.anchor_spin)e.placement_cache=null;
        e.anchor_velocity=velocity;e.anchor_spin=spin;
    }
    #place(e, snap) {
        this.#refreshAnchor(e);
        const parent=e.parent,cache=e.placement_cache,active=bodyActive(e.child);
        if(!snap&&cache&&cache.x===parent.position[0]&&cache.y===parent.position[1]&&cache.rotation===parent.rotation&&cache.local_position===e.local_position&&cache.local_rotation===e.local_rotation
            &&cache.child_x===e.child.position[0]&&cache.child_y===e.child.position[1]&&cache.child_rotation===e.child.rotation&&cache.vx===parent.velocity[0]&&cache.vy===parent.velocity[1]&&cache.spin===parent.angular_velocity&&cache.active===active)return;
        e.placement_cache={x:parent.position[0],y:parent.position[1],rotation:parent.rotation,local_position:e.local_position,local_rotation:e.local_rotation,
            vx:parent.velocity[0],vy:parent.velocity[1],spin:parent.angular_velocity,active};
        e.child.metrics.attachment_placements++;
        const pose = pathGeometry.transformPose({ position: e.parent.position, rotation: e.parent.rotation }, e);
        e.child.position = pose.position; e.child.rotation = pose.rotation;
        const offset = rotate(e.local_position, e.parent.rotation);
        e.child.velocity = add(e.parent.velocity, [-e.parent.angular_velocity * offset[1], e.parent.angular_velocity * offset[0]]);
        if(e.rig_anchor!==null)e.child.velocity=add(e.child.velocity,rotate(e.anchor_velocity,e.parent.rotation));
        e.child.angular_velocity = e.parent.angular_velocity+(e.anchor_spin??0);
        if (snap) { e.child.previous_position = [...pose.position]; e.child.previous_rotation = pose.rotation; }
        e.placement_cache.child_x=e.child.position[0];e.placement_cache.child_y=e.child.position[1];e.placement_cache.child_rotation=e.child.rotation;
        this.world._syncBody(e.child.handle);
    }
    _syncDescendants(parent, snap = false) {
        for (const id of this.#children.get(parent.id) ?? []) {
            const e = this.#entries.get(id); if (e.pending) continue;
            this.#place(e, snap); this._syncDescendants(e.child, snap);
        }
    }
    _capturePrevious(seconds) {
        for(const e of this.#entries.values())if(!e.pending){
            const r=e.child;
            if(e.rig_anchor!==null){e.previous_anchor_pose={position:[...e.local_position],rotation:e.local_rotation};e.anchor_step=seconds;}
            if(r.previous_position[0]!==r.position[0]||r.previous_position[1]!==r.position[1]||r.previous_rotation!==r.rotation){r.previous_position=[...r.position];r.previous_rotation=r.rotation;}
        }
    }
    _syncAll(snap = false) {
        const done = new Set();
        const sync = e => {
            if (done.has(e.child.id) || e.pending) return;
            const parent = this.#entries.get(e.parent.id); if (parent) sync(parent);
            this.#place(e, snap); done.add(e.child.id);
        };
        for (const e of this.#entries.values()) sync(e);
    }
    _render(record, blend, result) {
        const e = record.parent_mount, parent = this.world._renderBody(e.parent.handle, blend, {});
        return Object.assign(result, { body_id: record.id, ...pathGeometry.transformPose(parent, e.rig_anchor===null?e:this.#anchorPose(e,blend)) });
    }
    _bodyRemoved(record) {
        const own = this.#entries.get(record.id); if (own) { this.#forget(own); this.#event('bodyDetached', own, { reason: 'body_removed' }); }
        for (const id of [...(this.#children.get(record.id) ?? [])]) {
            const e = this.#entries.get(id); this.#forget(e);
            if (!e.child.removed && !e.pending) { e.child.sleeping = false; enforceLocks(e.child); this.world._syncBody(e.child.handle); this._syncDescendants(e.child, true); }
            this.#event('bodyDetached', e, { reason: 'parent_removed' });
        }
    }
    _clear() { for (const e of this.#entries.values()) { e.child.parent_mount = null; e.parent.mass_children?.clear(); invalidateMass(e.parent); } this.#entries.clear(); this.#children.clear(); }
    _saveState() { return [...this.#entries.values()].map(e => ({ rig_motion:e.rig_anchor===null||!e.previous_anchor_pose?null:{previous_position:[...e.previous_anchor_pose.position],previous_rotation:e.previous_anchor_pose.rotation,step:e.anchor_step},attachment_id:e.attachment_id,revision:e.revision,rig_anchor:e.rig_anchor,emitter:e.emitter?structuredClone(e.emitter):null,body_id: e.child.id, parent_body_id: e.parent.id, local_position: [...(e.rig_anchor===null?e.local_position:e.anchor_offset_position)], local_rotation: e.rig_anchor===null?e.local_rotation:e.anchor_offset_rotation, combine_mass: e.combine_mass })); }
    _loadState(entries = []) {
        if (!Array.isArray(entries)) throw new TypeError('Invalid attachment state');
        this.#restoring = true;
        try { const seen=new Set();for (const e of entries) {
            this.attachBody(e.body_id, { parent_body: e.parent_body_id, local_position: e.local_position, local_rotation: e.local_rotation, combine_mass: e.combine_mass,emitter:e.emitter,rig_anchor:e.rig_anchor??null });
            const entry=this.#entry(e.body_id);
            if(e.rig_motion!=null){
                if(entry.rig_anchor===null)throw new TypeError('Rig motion requires an anchor mount');
                const motion=e.rig_motion;
                entry.previous_anchor_pose={position:vector(motion.previous_position),rotation:number(motion.previous_rotation,'previous anchor rotation')};
                entry.anchor_step=number(motion.step,'anchor step',1e-7,.1);this.#place(entry,true);
            }
            if(e.attachment_id!==undefined){number(e.attachment_id,'attachment_id',1);if(!Number.isSafeInteger(e.attachment_id)||seen.has(e.attachment_id))throw new TypeError('Invalid attachment identity');entry.attachment_id=e.attachment_id;}seen.add(entry.attachment_id);
            entry.revision=number(e.revision??0,'attachment revision',0);if(!Number.isSafeInteger(entry.revision))throw new TypeError('Invalid attachment revision');this.#nextId=Math.max(this.#nextId,entry.attachment_id+1);
        } }
        finally { this.#restoring = false; }
    }
}
