import { TrafficVehicle } from '../entities/traffic-vehicle.mjs';
import { pathGeometry } from '../../engine/basement/physics/index.mjs';
import { resolveStreetVehicle } from '../data/street-definitions.mjs';

const purposes = new Set(['ambient', 'owned', 'mission', 'taxi']);
/** Shared official creation. Population limits belong to the requesting population manager. */
export function createGameVehicle(world, packet = {}, { hooks = {} } = {}) {
    const { purpose = 'ambient', route_id, position, rotation, anchor, mission_id, replaces, data = {}, color, glow_color, headlight_color } = packet;
    if (!purposes.has(purpose)) throw new TypeError('Invalid vehicle purpose');
    if (!world.elements.listEntityTypes().includes(TrafficVehicle.entity_type)) world.elements.registerEntityType(TrafficVehicle.entity_type, TrafficVehicle);
    const preset = purpose === 'owned' ? world.elements.asset_library.getResource('df:owned_vehicle_defaults').data
        : purpose === 'taxi' ? world.elements.asset_library.getResource('df:taxi_vehicle_defaults').data
        : purpose === 'mission' && mission_id ? world.elements.asset_library.getResource('df:mission_vehicle_defaults').data[mission_id] : {};
    if (!preset) throw new TypeError('Unknown mission vehicle');
    if (replaces && (!(replaces instanceof TrafficVehicle) || replaces.physics_system !== world || replaces.destroyed)) throw new TypeError('Invalid replacement vehicle');
    if (replaces && world.getAttachedBodies(replaces).length) throw new Error('Release passengers and mounted bodies before replacing the vehicle');
    const control_mode = packet.control_mode ?? (purpose === 'ambient' || purpose === 'taxi' ? 'AI' : 'PARKED');
    const definition = resolveStreetVehicle(world.elements.asset_library, { brand: packet.brand ?? preset.brand, model: packet.model ?? preset.model,
        control_mode, color: color ?? preset.paintColor });
    if (control_mode === 'AI' && !route_id) throw new TypeError('AI vehicle creation needs a registered route');
    const start = anchor ? pathGeometry.transformPose(anchor, preset.spawn)
        : replaces ? { position: replaces.position, rotation: replaces.rotation }
        : route_id ? world.traffic.getRouteStart(route_id) : { position: [0, 0], rotation: 0 };
    const pose = { position: position ?? start.position, rotation: rotation ?? start.rotation };
    if (!world.isPlacementClear(definition.collision_shape, pose.position, { rotation: pose.rotation, include_ghosts: false, ignore_body: replaces?.body })) return null;
    const vehicle = world.elements.createVehicle({ ...definition, ...pose, data: { ...data, ...definition.data, purpose, mission_id: mission_id ?? null,
        persistent: data.persistent ?? (purpose === 'owned' || purpose === 'mission'),
        glow_color: glow_color !== undefined ? glow_color : preset.underglowColor !== undefined ? preset.underglowColor : definition.data.glow_color,
        headlight_color: headlight_color !== undefined ? headlight_color : preset.headlightColor !== undefined ? preset.headlightColor : definition.data.headlight_color,
    } });
    try {
        if (!(vehicle instanceof TrafficVehicle)) throw new TypeError('Vehicle factory requires the official TrafficVehicle class');
        vehicle.connectGameplay(hooks);
        if (control_mode === 'AI') vehicle.followRoute(route_id);
        if (replaces) world.removeBody(replaces.body);
    } catch (error) { world.removeBody(vehicle.body); throw error; }
    return vehicle;
}
