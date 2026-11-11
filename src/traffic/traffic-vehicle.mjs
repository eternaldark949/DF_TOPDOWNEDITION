import { resolveStreetVehicle, resolveVehicleSeats } from '../directory/street-definitions.mjs';
import { gameVehicle } from '../basement/physics/index.mjs';
const bindings = new WeakMap();
/** Official gameplay entity. Body state and driving calculations belong to Basement. */
export class TrafficVehicle extends gameVehicle {
    static entity_type = 'df_traffic_vehicle';
    constructor(elements, packet) { super(elements, packet); this.connectGameplay(); }
    connectGameplay(hooks = {}) {
        if (Number.isInteger(this.data.seats) && this.data.seats > 0 && !this.data.occupants?.length) this.data.occupants = Array(this.data.seats).fill(null);
        if(!this.data.seat_emitter_version){if(this.data.occupants?.some(id=>id!=null))for(const seat of this.getSeatLayout()){const occupant=this.physics_system.elements.fetchEntity(this.data.occupants[seat.seat_index]),mount=occupant&&this.physics_system.getAttachmentState(occupant);if(mount?.parent_body_id===this.body_id&&!mount.emitter)this.physics_system.setAttachmentEmitter(occupant,seat.emitter);}this.data.seat_emitter_version=1;}
        const previous = bindings.get(this); previous?.forEach(drop => drop());
        bindings.set(this, [
            this.on('contactBegin', event => hooks.onContact?.(this, event)),
            this.on('bodyAttached', event => { if (event.parent_body?.body_id === this.body_id) hooks.onPassengerEntered?.(this, event.entity, event); }),
            this.on('bodyDetached', event => {
                if (event.parent_body?.body_id !== this.body_id) return;
                const index = this.data.occupants.indexOf(event.body.body_id); if (index !== -1) this.data.occupants[index] = null;
                hooks.onPassengerExited?.(this, event.entity, event);
            }),
            this.on('trafficRouteCompleted', event => { this.data.route_complete = true; hooks.onRouteCompleted?.(this, event); }),
        ]);
        return this;
    }
    getSeatLayout() { return resolveVehicleSeats(this.physics_system.elements.asset_library, { brand: this.data.brand, model: this.data.model }); }
    getSeatWorldPose(seat_index, { blend = 1 } = {}) {
        const seat = this.getSeatLayout()[seat_index]; if (!seat) throw new RangeError('Unknown seat');
        return this.physics_system.getBodyPoint(this, seat.local_position, { blend, local_rotation: seat.local_rotation });
    }
    assignSeat(entity, seat_index, { combine_mass } = {}) {
        const seat = this.getSeatLayout()[seat_index];
        if (!Number.isInteger(seat_index) || !seat) throw new RangeError('Unknown seat');
        if (!entity || entity.destroyed || entity.physics_system !== this.physics_system || entity === this) throw new TypeError('Passenger must be a live entity in the same world');
        if (this.data.occupants[seat_index] != null || this.physics_system.getAttachmentState(entity)) return -1;
        entity.cancelMovement?.();
        this.physics_system.attachBody(entity, { parent_body: this, local_position: seat.local_position, local_rotation: seat.local_rotation, combine_mass: combine_mass ?? seat.combine_mass,emitter:seat.emitter });
        this.data.occupants[seat_index] = entity.entity_id; return seat_index;
    }
    setSeatAttackEnabled(seat_index,enabled){
        if(typeof enabled!=='boolean')throw new TypeError('Seat attack enabled must be boolean');const seat=this.getSeatLayout()[seat_index];if(!seat)throw new RangeError('Unknown seat');
        const occupant=this.physics_system.elements.fetchEntity(this.data.occupants[seat_index]),mount=occupant&&this.physics_system.getAttachmentState(occupant);
        if(!seat.emitter||mount?.parent_body_id!==this.body_id)return false;
        this.physics_system.setAttachmentEmitter(occupant,{...seat.emitter,enabled});return true;
    }
    assignDriver(entity, options) { return this.assignSeat(entity, 0, options); }
    assignPassenger(entity, options) {
        const layout = this.getSeatLayout();
        for (let index = 1; index < layout.length; index++) if (this.data.occupants[index] == null) return this.assignSeat(entity, index, options);
        return -1;
    }
    getPassengers(results = []) {
        results.length = 0;
        for (const id of this.data.occupants) {
            const entity = this.physics_system.elements.fetchEntity(id);
            if (entity && this.physics_system.getAttachmentState(entity)?.parent_body_id === this.body_id) results.push(entity);
        }
        return results;
    }
    releasePassenger(entity, { inherit_velocity } = {}) {
        if (!entity || entity.destroyed || entity.physics_system !== this.physics_system) return null;
        const index = this.data.occupants.indexOf(entity.entity_id); if (index === -1) return null;
        const request = this.physics_system.detachBody(entity, { exit_points: this.getSeatLayout()[index].exit_points, inherit_velocity });
        if (request && !this.physics_system.getAttachmentState(entity)) this.data.occupants[index] = null;
        return request;
    }
    followRoute(route_id, options = {}) {
        // The owner is an engine reference, not a game-side driving service.
        const profile = resolveStreetVehicle(this.physics_system.elements.asset_library, { brand: this.data.brand, model: this.data.model, control_mode: 'AI' });
        this.physics_system.traffic.addVehicle(this, { ...options, route_id });
        this.assembleVehicle(profile.vehicle_template);
        this.data.control_mode = 'AI'; this.data.route_id = route_id; this.data.route_complete = false; return this;
    }
    setControlMode(mode) {
        if (!['AI', 'PLAYER', 'PARKED'].includes(mode)) throw new TypeError('Invalid control mode');
        if (mode === 'AI') {
            if (!this.data.route_id) throw new Error('AI driving needs an itinerary');
            return this.followRoute(this.data.route_id);
        }
        const profile = resolveStreetVehicle(this.physics_system.elements.asset_library, { brand: this.data.brand, model: this.data.model, control_mode: mode });
        this.assembleVehicle(profile.vehicle_template);
        this.physics_system.traffic.removeVehicle(this);
        if (mode === 'PARKED') this.parkVehicle(); else this.stopVehicle();
        this.data.control_mode = mode; return this;
    }
    setControls({ accelerator = 0, brake = 0, steering = 0, handbrake = 0, reverse = false } = {}) {
        if (this.data.control_mode !== 'PLAYER') throw new Error('Manual controls require PLAYER mode');
        for (const [key, value] of Object.entries({ accelerator, brake, steering, handbrake })) if (!Number.isFinite(value) || value < (key === 'steering' ? -1 : 0) || value > 1) throw new TypeError(`Invalid ${key}`);
        if (typeof reverse !== 'boolean') throw new TypeError('reverse must be boolean');
        if (reverse) this.reverseVehicle(accelerator); else this.accelerateVehicle(accelerator);
        this.brakeVehicle(brake); this.steerVehicle(steering); this.setHandbrake(handbrake); return this;
    }
}
