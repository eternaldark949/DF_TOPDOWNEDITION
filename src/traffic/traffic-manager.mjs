import { TrafficVehicle } from './traffic-vehicle.mjs';
import { createGameVehicle } from '../directory/game-vehicle-factory.mjs';
/** Spawn, ownership and driver policy. The physics world owns every spatial/physical operation. */
export class TrafficManager {
    #pendingSpawns = new Set();
    constructor(world, { hooks = {}, despawn_on_completion = true } = {}) {
        Object.defineProperty(this, 'physics', { value: world }); this.hooks = hooks; this.despawn_on_completion = despawn_on_completion;
        if (!world.elements.listEntityTypes().includes(TrafficVehicle.entity_type)) world.elements.registerEntityType(TrafficVehicle.entity_type, TrafficVehicle);
    }
    registerRoute(route_id, packet) { return this.physics.traffic.registerRoute(route_id, packet); }
    setSignal(signal_id, state) { this.physics.traffic.setSignal(signal_id, state); }
    spawn(packet = {}) {
        const rules = this.physics.elements.asset_library.getResource('df_street:rules').data;
        for (const vehicle of this.#pendingSpawns) if (vehicle.destroyed || vehicle.registered) this.#pendingSpawns.delete(vehicle);
        if (this.getAmbientVehicles().length + this.#pendingSpawns.size >= rules.max_vehicles) return null;
        const vehicle = createGameVehicle(this.physics, { ...packet, purpose: 'ambient' }, { hooks: this.hooks });
        if (vehicle?.pending) this.#pendingSpawns.add(vehicle);
        return vehicle;
    }
    getAmbientVehicles(results = []) {
        const vehicles = this.getVehicles(); results.length = 0;
        for (const vehicle of vehicles) if (vehicle.data.purpose === 'ambient') results.push(vehicle);
        return results;
    }
    getVehicles(results = []) { return this.physics.elements.getEntities({ entity_type: TrafficVehicle.entity_type }, results); }
    getVisibleVehicles(bounds, results = []) {
        results.length = 0;
        for (const hit of this.physics.queryEntitiesInBounds({ bounds })) if (hit.entity instanceof TrafficVehicle) results.push(hit.entity);
        return results;
    }
    updateState() {
        for (const vehicle of this.getVehicles()) if (vehicle.data.route_complete && vehicle.data.control_mode === 'AI') {
            if (vehicle.data.purpose === 'ambient' && this.despawn_on_completion && !vehicle.data.persistent) vehicle.destroy(); else vehicle.setControlMode('PARKED');
        }
    }
    reconnectGameplay() { for (const v of this.getVehicles()) v.connectGameplay(this.hooks); }
    clearStreet() {
        for (const v of this.#pendingSpawns) v.destroy(); this.#pendingSpawns.clear();
        for (const v of this.getAmbientVehicles()) v.destroy();
    }
    reset() { this.clearStreet(); }
}
