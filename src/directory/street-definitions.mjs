/** Directory authoring only: convert immutable catalog units once, never during simulation. */
const vehicleDefinitions = new WeakMap();
export function resolveStreetVehicle(library, { brand, model, control_mode = 'AI', color } = {}) {
    const catalog = library.getResource('df:vehicle_brands').data;
    brand ??= Object.keys(catalog)[0];
    const maker = catalog[brand]; if (!maker) throw new TypeError(`Unknown vehicle brand: ${brand}`);
    model ??= Object.keys(maker.models)[0];
    const spec = maker.models[model]; if (!spec) throw new TypeError(`Unknown vehicle model: ${model}`);
    if (!['AI', 'PLAYER', 'PARKED'].includes(control_mode)) throw new TypeError('Invalid control_mode');
    let cache = vehicleDefinitions.get(library); if (!cache) vehicleDefinitions.set(library, cache = new Map());
    const key = JSON.stringify([brand, model, control_mode === 'PLAYER']);
    if (!cache.has(key)) {
        const driven = control_mode === 'PLAYER', stats = maker.baseStats;
        const top = driven ? spec.driven?.top ?? stats.maxSpeed * spec.speedMod : stats.maxSpeed * spec.speedMod;
        const acceleration = driven ? spec.driven?.accel ?? stats.acceleration : stats.acceleration;
        cache.set(key, {
            template: 'df_street:vehicle', collision_shape: { shape_type: 'box', dimensions: [spec.length, spec.width] },
            mass: spec.mass ?? stats.mass ?? 1200,
            vehicle_template: { tyre_model: driven ? 'two_axle' : 'bicycle', max_speed: top * 60, reverse_speed: top * 18,
                acceleration: acceleration * 3600, braking: (stats.brake ?? 0.3) * 3600,
                wheel_base: spec.length * 0.65, drag: -60 * Math.log(top / (top + acceleration)),
                front_grip: maker.drive?.gripF ?? 1, rear_grip: maker.drive?.gripR ?? 1 },
            data: { brand, model, model_name: spec.name, seats: spec.seats ?? stats.seats ?? 4,
                color: maker.colors[0], visual_style: maker.visualStyle, glow_color: maker.glowColor,
                headlight_color: maker.headlightColor ?? '#ffffaa' },
        });
    }
    const definition = structuredClone(cache.get(key));
    definition.data.control_mode = control_mode;
    if (color !== undefined) definition.data.color = color;
    return definition;
}


const seatDefinitions = new WeakMap();
/** Resolve authored cabin data once per model, independently of simulation or rendering. */
export function resolveVehicleSeats(library, { brand, model }) {
    const maker = library.getResource('df:vehicle_brands').data[brand], spec = maker?.models[model];
    if (!spec) throw new TypeError('Seat layout requires a known vehicle model');
    let cache = seatDefinitions.get(library); if (!cache) seatDefinitions.set(library, cache = new Map());
    const key = JSON.stringify([brand, model]); if (cache.has(key)) return cache.get(key);
    const count = spec.seats ?? maker.baseStats.seats ?? 4;
    if (!Number.isInteger(count) || count < 1 || count > 32) throw new TypeError('Vehicle needs 1..32 seats');
    const rules = library.getResource('df:vehicle_seating').data;
    const rows = Math.ceil(count / 2);
    const layout = spec.seat_layout ?? Array.from({ length: count }, (_, index) => {
        const row = Math.floor(index / 2), side = index % 2 ? 1 : -1;
        const x = spec.length * (rules.front_fraction + (rows === 1 ? 0 : row / (rows - 1)) * (rules.rear_fraction - rules.front_fraction));
        const y = side * (spec.width / 2 + rules.exit_clearance);
        return { local_position: [x, side * spec.width * rules.side_fraction], local_rotation: 0, exit_points: [[x, y], [x, -y]] };
    });
    if (!Array.isArray(layout) || layout.length !== count) throw new TypeError('Invalid authored seat count');
    const point = p => { if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) throw new TypeError('Invalid seat point'); return Object.freeze([...p]); };
    const resolved = Object.freeze(layout.map((seat, index) => {
        const rotation = seat.local_rotation ?? 0, combine_mass = seat.combine_mass ?? rules.combine_mass ?? false;
        if (typeof combine_mass !== 'boolean') throw new TypeError('Invalid seat combine_mass');
        if (!Number.isFinite(rotation) || !Array.isArray(seat.exit_points) || !seat.exit_points.length || seat.exit_points.length > 64) throw new TypeError('Invalid seat configuration');
        const side=seat.local_position[1]<0?-1:1,attack=rules.attacks;
        const authored=seat.emitter===undefined?(attack?{enabled:index===0?attack.driver_enabled:attack.passenger_enabled,local_position:[seat.local_position[0],side*(spec.width/2+attack.window_clearance)],local_rotation:side*attack.outward_rotation,half_angle:attack.half_angle,inherit_velocity:attack.inherit_velocity}:null):seat.emitter;
        if(authored&&(typeof authored.enabled!=='boolean'||typeof authored.inherit_velocity!=='boolean'||!Number.isFinite(authored.local_rotation)||!Number.isFinite(authored.half_angle)||authored.half_angle<0||authored.half_angle>Math.PI))throw new TypeError('Invalid seat emitter');
        const emitter=authored?Object.freeze({...authored,local_position:point(authored.local_position)}):null;
        return Object.freeze({ seat_index: index, role: index ? 'passenger' : 'driver', emitter,combine_mass, local_position: point(seat.local_position), local_rotation: rotation,
            exit_points: Object.freeze(seat.exit_points.map(point)) });
    }));
    cache.set(key, resolved); return resolved;
}
