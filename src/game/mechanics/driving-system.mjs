import { gameVehicle } from '../../engine/basement/physics/index.mjs';
import DRIVING from '../data/game-driving.json' with { type: 'json' };

/**
 * The player at the wheel. On foot, `interact` takes the driver's seat of the nearest car within reach
 * that no one drives (a parked or a player's car, not traffic on its route); at the wheel, `interact`
 * stops the car, parks it and steps out. While driving, `move` drives: forward is the throttle, back
 * brakes and then reverses once the car is nearly still, sideways steers, and `flit` pulls the handbrake.
 * Tuning is Directory data (`game-driving.json`). No physical math: the car's own motor does the driving.
 */
export class drivingSystem {
    #get_player; #rules; vehicle = null;
    constructor({ get_player, rules = DRIVING } = {}) { if (typeof get_player !== 'function') throw new TypeError('drivingSystem needs get_player'); this.#get_player = get_player; this.#rules = rules; }
    /** The car the player could take now, or null. */
    nearestVehicle(context) {
        const player = this.#get_player(); if (!player) return null;
        let best = null, dist = this.#rules.reach;
        for (const car of context.basement.physics.elements.getEntities({ instance_of: gameVehicle })) {
            if (typeof car.assignDriver !== 'function' || car.destroyed || car.data.control_mode === 'AI' || car.data.occupants?.[0] != null) continue;
            const d = Math.hypot(car.position[0] - player.position[0], car.position[1] - player.position[1]);
            if (d < dist) { dist = d; best = car; }
        }
        return best;
    }
    /** Takes the wheel of `vehicle`; true when seated. */
    enter(vehicle) {
        const player = this.#get_player();
        vehicle.setControlMode('PLAYER');
        if (vehicle.assignDriver(player) !== 0) { vehicle.setControlMode('PARKED'); return false; }
        this.vehicle = vehicle; return true;
    }
    /** Parks the car and steps out; true when out. */
    leave() {
        const car = this.vehicle, player = this.#get_player(); if (!car) return false;
        if (car.destroyed) { this.vehicle = null; return true; }
        car.setControls({}); car.releasePassenger(player);
        if (car.physics_system.getAttachmentState(player)) { car.setControls({ brake: 1 }); return false; }   // (no room to step out: it waits, braking)
        car.setControlMode('PARKED'); this.vehicle = null; return true;
    }
    beforePhysics(context) {
        const player = this.#get_player(), input = context.basement.controls; if (!player) return;
        if (this.vehicle && (this.vehicle.destroyed || context.basement.physics.getAttachmentState(player)?.parent_body_id !== this.vehicle.body_id)) this.vehicle = null;
        if (input.justActivated('interact')) { if (this.vehicle) this.leave(); else { const car = this.nearestVehicle(context); if (car) this.enter(car); } }
        const car = this.vehicle; if (!car) return;
        const [x, y] = input.direction('move'), ahead = -y, speed = car.getSpeed(), r = this.#rules;
        const reverse = ahead < 0 && speed < r.reverse_below;
        car.setControls({ accelerator: ahead > 0 ? ahead : reverse ? -ahead : 0, brake: ahead < 0 && !reverse ? -ahead : 0, steering: Math.max(-1, Math.min(1, x)), handbrake: input.active('flit') ? 1 : 0, reverse });
    }
    levelLeaving() { if (this.vehicle) this.leave(); this.vehicle = null; }
}
