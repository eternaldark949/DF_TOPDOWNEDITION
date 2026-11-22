// Classic-client construction boundary. This is the single remaining legacy vehicle
// constructor call, retired when the client switches to game-vehicle-factory.mjs.
// It creates a new entity; it does not adopt or mirror an engine body.
const gameVehicles = Object.freeze({
    create({ purpose = 'ambient', lane = null, along = null, brand, model, control_mode, position, rotation, anchor, mission_id,
        color, glow_color, headlight_color } = {}) {
        if (!['ambient', 'owned', 'mission', 'taxi'].includes(purpose)) throw new TypeError('Invalid vehicle purpose');
        const preset = purpose === 'owned' ? GAME_DB.vehicles.blackmark_defaults : purpose === 'taxi' ? GAME_DB.vehicles.zib : purpose === 'mission' && mission_id ? GAME_DB.vehicles.mission_vehicles[mission_id] : {};
        if (!preset) throw new TypeError('Unknown mission vehicle');
        if (anchor) { const pose = pathGeometry.transformPose(anchor, preset.spawn); position ??= pose.position; rotation ??= pose.rotation; }
        control_mode ??= purpose === 'owned' ? 'PLAYER' : purpose === 'mission' ? 'PARKED' : 'AI';
        if (!['AI', 'PLAYER', 'PARKED'].includes(control_mode)) throw new TypeError('Invalid vehicle control mode');
        if (position && (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite))) throw new TypeError('Invalid vehicle position');
        if (rotation !== undefined && !Number.isFinite(rotation)) throw new TypeError('Invalid vehicle rotation');
        const vehicle = new TrafficVehicle(lane, brand ?? preset.brand, model ?? preset.model, control_mode, along);
        vehicle.data.purpose = purpose;
        if (mission_id) vehicle.data.mission_id = mission_id;
        vehicle.data.persistent = purpose === 'owned' || purpose === 'mission';
        if (position) { vehicle.x = position[0]; vehicle.y = position[1]; }
        if (rotation !== undefined) vehicle.angle = rotation;
        if (color !== undefined || preset.paintColor !== undefined) vehicle.color = color ?? preset.paintColor;
        if (glow_color !== undefined || preset.underglowColor !== undefined) vehicle.glowColor = glow_color !== undefined ? glow_color : preset.underglowColor;
        if (headlight_color !== undefined || preset.headlightColor !== undefined) vehicle.headlightColor = headlight_color !== undefined ? headlight_color : preset.headlightColor;
        if (purpose === 'owned') vehicle.isOwnedCar = true;
        if (purpose === 'mission') { vehicle.isDeliveryVehicle = mission_id === 'amber_delivery'; vehicle.hasDriver = false; }
        if (purpose === 'taxi') { vehicle.isZib = true; vehicle.driverType = 'traffic'; vehicle.hasDriver = false; }
        return vehicle;
    }
});
