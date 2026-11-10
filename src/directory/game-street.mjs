import { TrafficVehicle } from '../traffic/traffic-vehicle.mjs';
import { TrafficManager } from '../traffic/traffic-manager.mjs';
import { Pedestrian } from '../entities/pedestrians.mjs';
import { PedestrianManager } from '../entities/pedestrian-manager.mjs';
export { TrafficVehicle, TrafficManager, Pedestrian, PedestrianManager };
export { createGameVehicle } from './game-vehicle-factory.mjs';
export function registerStreetEntityTypes(world) {
    for (const Constructor of [TrafficVehicle, Pedestrian]) if (!world.elements.listEntityTypes().includes(Constructor.entity_type)) world.elements.registerEntityType(Constructor.entity_type, Constructor);
}
/** One client of an existing session world; never constructs a second physics world or grid. */
export class StreetPopulation {
    constructor(world, { traffic = {}, pedestrians = {} } = {}) {
        Object.defineProperty(this, 'physics', { value: world }); registerStreetEntityTypes(world);
        this.traffic = new TrafficManager(world, traffic); this.pedestrians = new PedestrianManager(world, pedestrians);
    }
    updateState(seconds = this.physics.config.fixed_step) {
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.1) throw new TypeError('Invalid policy step');
        this.traffic.updateState(); this.pedestrians.updateState(seconds);
    }
    reconnectGameplay() { this.traffic.reconnectGameplay(); this.pedestrians.reconnectGameplay(); }
    clearStreet() { this.traffic.clearStreet(); this.pedestrians.clearStreet(); }
}
