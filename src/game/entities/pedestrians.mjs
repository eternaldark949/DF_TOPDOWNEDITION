import { gameCharacter, gameVehicle, BODY_GROUP } from '../../engine/basement/physics/index.mjs';
const bindings = new WeakMap();
/** Civilian decisions and reactions. Movement, prediction and impacts stay in Basement. */
export class Pedestrian extends gameCharacter {
    static entity_type = 'df_pedestrian';
    constructor(elements, packet) { super(elements, packet); this.connectGameplay(); }
    connectGameplay(hooks = {}) {
        bindings.get(this)?.forEach(drop => drop());
        bindings.set(this, [
            this.on('bodyDetached', () => { if (!['dead', 'sprawled', 'recovering'].includes(this.data.state)) { this.data.state = 'idle'; this.data.arrived = false; } }),
            this.on('destinationReached', () => {
                if (this.data.state === 'walking' || this.data.state === 'crossing') this.data.arrived = true;
            }),
            this.on('contactBegin', event => this._vehicleContact(event, hooks)),
            this.on('contactStay', event => this._vehicleContact(event, hooks)),
        ]); return this;
    }
    _vehicleContact(event, hooks) {
        if (event.sensor_only || this.data.state === 'dead' || this.data.damage_grace > 0) return;
        const other = event.entity_a === this ? event.entity_b : event.entity_a;
        const rules = this.getAsset('street_rules').data;
        // A car hits a walker by driving into it: walking into a car standing still is no hit.
        if (!(other instanceof gameVehicle) || event.relative_speed < rules.vehicle_hit_speed || Math.abs(other.getSpeed()) < rules.vehicle_hit_speed / 2) return;
        this.takeDamage(rules.vehicle_damage);
        if (this.data.state !== 'dead') {
            this.data.state = 'sprawled'; this.data.state_seconds = rules.sprawl_seconds;
            this.cancelMovement(); this.suspendMovement(rules.sprawl_seconds);
            this.say('Watch where you’re driving!', rules.sprawl_seconds);
        }
        hooks.onVehicleHit?.(this, other, event);
    }
    takeDamage(amount) {
        if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Damage must be nonnegative');
        if (this.data.state === 'dead' || this.data.damage_grace > 0) return false;
        this.data.health -= amount;
        this.data.damage_grace = this.getAsset('street_rules').data.damage_grace_seconds;
        if (this.data.health <= 0) { this.data.state = 'dead'; this.cancelMovement(); this.suspendMovement(Number.MAX_VALUE); }
        return true;
    }
    say(text, seconds = 2) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError('Invalid quip lifetime');
        this.data.quip = String(text); this.data.quip_seconds = seconds;
    }
    hearNoise(source) {
        if (this.physics_system.getAttachmentState(this)) return;
        if (this.data.state === 'dead' || this.data.state === 'sprawled' || this.data.state === 'recovering') return;
        this.fleeTarget(source, { safety_distance: 200, face_movement: true });
        this.data.state = 'fleeing'; this.data.state_seconds = 1.5; this.say('What was that?');
    }
    updateState(seconds, { target, crossing = false, signal = 'go', wait_at = null } = {}) {
        if (this.destroyed || !this.active) return;
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 0.1) throw new TypeError('Invalid gameplay step');
        const d = this.data, rules = this.getAsset('street_rules').data;
        d.damage_grace = Math.max(0, d.damage_grace - seconds);
        d.quip_seconds = Math.max(0, d.quip_seconds - seconds); if (!d.quip_seconds) d.quip = null;
        if (d.state === 'dead' || this.physics_system.getAttachmentState(this)) return;
        if (['sprawled', 'recovering', 'dodging', 'fleeing'].includes(d.state)) {
            d.state_seconds = Math.max(0, d.state_seconds - seconds);
            if (d.state_seconds) return;
            if (d.state === 'sprawled') { d.state = 'recovering'; d.state_seconds = rules.recovery_seconds; this.stopMovement(); return; }
            d.state = 'idle';
        }
        if (!target) { this.stopMovement(); d.state = 'idle'; return; }
        // A walker waiting at the kerb with a car stood at it gets out of the car's way (each would wait for the other).
        if (d.state === 'waiting' && (d.sense_seconds = (d.sense_seconds ?? 0) - seconds) <= 0) {
            d.sense_seconds = rules.sense_seconds ?? 0;
            const near = this.physics_system.peruseNearbyEntities(this, { near_range: rules.personal_space * 2, include_groups: BODY_GROUP.VEHICLE, max_results: 1 })[0];
            if (near && Math.abs(near.entity?.getSpeed?.() ?? 0) < 30 && this.evadeBody(near.body, { distance: rules.dodge_distance, speed: rules.crossing_speed })) {
                d.state = 'dodging'; d.state_seconds = rules.dodge_seconds; return;
            }
        }
        if (crossing && d.state !== 'crossing') {
            const hits = this.physics_system.predictMovementContacts({ body: this, to: target, speed: rules.crossing_speed, seconds: rules.prediction_seconds, include_groups: BODY_GROUP.VEHICLE, max_results: 1 });
            if (signal !== 'go' || hits.length) {
                // It waits a step back from the kerb (`wait_at`), so it never stands in a turning car's way.
                if (d.state !== 'waiting') { if (wait_at) this.moveTo(wait_at, { direct: true, avoid_groups: BODY_GROUP.CHARACTER, personal_space: rules.personal_space, face_movement: false }); else this.stopMovement(); }
                d.state = 'waiting'; return;
            }
        }
        if (d.state !== 'walking' && d.state !== 'crossing') {
            this.moveTo(target, { direct: true, avoid_groups: BODY_GROUP.CHARACTER, speed: crossing ? rules.crossing_speed : undefined, personal_space: rules.personal_space, face_movement: true });
            d.state = crossing ? 'crossing' : 'walking';
        }
        // A walker looks out for cars a few times a second, not every step: a car is seconds away when first seen.
        d.sense_seconds = (d.sense_seconds ?? 0) - seconds; if (d.sense_seconds > 0) return;
        d.sense_seconds = rules.sense_seconds ?? 0;
        const threats = this.physics_system.predictMovementContacts({ body: this, seconds: rules.prediction_seconds, include_groups: BODY_GROUP.VEHICLE, max_results: 1 });
        if (threats.length && this.evadeBody(threats[0].body, { distance: rules.dodge_distance, speed: rules.dodge_speed })) {
            d.state = 'dodging'; d.state_seconds = rules.dodge_seconds; this.say('Look out!');
        }
    }
}
