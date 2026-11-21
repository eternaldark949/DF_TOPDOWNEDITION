// ===== LV1 LOBBY =====
import { gameLevel } from './game-level.mjs';
import { mapInstance } from '../../basement/maps/index.mjs';
import { lightGridSystem, readNight } from '../../basement/rendering/index.mjs';
import { readParticleSystem } from '../../basement/physics/index.mjs';

/**
 * A level that is one Basement map. A subclass says which map with `mapDefinition`; the level builds
 * it on entry, keeps its doors and rooms current each step, and releases it on exit. Its exits are
 * the map's triggers whose data names a `target` level (with an optional `label`, and `auto` to travel
 * on contact). Arriving travellers are placed just inside the exit that leads back where they came
 * from, stepping in from the map edge the exit sits on, or at the map's spawn.
 */
export class mapLevel extends gameLevel {
    map = null;
    /** Returns `{definition, map_options}` for this level; `assets` is the Directory data source. */
    mapDefinition({ assets }, options) { throw new Error(`${this.constructor.name} must give its map definition`); }
    async prepare(context, options = {}) {
        const { definition, map_options = {} } = await this.mapDefinition(context, options);
        if (!definition?.size) throw new TypeError('A map level needs a map definition with a size');
        return { definition, map_options, arrival: options.arrival ?? null, travellers: [...(options.travellers ?? [])] };
    }
    enter(context, prepared) {
        this.map = new mapInstance(context.basement.physics, prepared.definition, prepared.map_options);
        this.definition = prepared.definition;
        const travellers = prepared.travellers.map(id => context.basement.elements.fetchEntity(id)).filter(e => e && !e.destroyed);
        if (travellers.length) this.placeTravellers(context, travellers, this.arrivalPose(context, prepared.arrival?.from ?? null, travellers[0]));
        // The light grid, when the map's switches turn it on: its regions bake behind the level change too.
        // The camera's height view, when the map gives one: how high the eye stands and how far walls lean from it.
        this.height_view = prepared.definition.height_view ?? null;
        if (this.height_view) context.basement.render?.setHeightView(this.height_view);
        // How the map looks at night, as its data says: whoever draws the frame reads it (drawNight with `night`);
        // setNight turns the night's frame effects on and off.
        this.night = prepared.definition.night ? readNight(prepared.definition.night) : null;
        this.night_on = false; this.night_amount = 1;
        // With the map's `day_night` switch its night follows the world's clock: on while the clock's darkness is
        // above nothing, laid at that darkness (a dusk deepens into the night, a dawn lifts it).
        this.day_night = !!(prepared.definition.switches?.day_night && this.night);
        this.followClock(context);
        // The map's particle systems (rain, snow, embers): made now, stepped by physics, removed on leaving. One
        // whose area is 'view' is kept on what the camera sees after each step, so it falls wherever you look.
        this.particles = (prepared.definition.particles ?? []).map(p => ({ id: context.basement.physics.createParticleSystem(p.system, { ...(Array.isArray(p.area) ? { area: p.area } : {}), ...(p.at ? { at: p.at } : {}) }), view: p.area === 'view', margin: p.margin ?? 96 }));
        // With the map's `weather` switch, every state of the world's weather brings its particle systems here, each born
        // at its systems' own rates times how much of that state there is (none while the weather is another).
        if (prepared.definition.switches?.weather) this.makeWeather(context);
        this.followWeather(context);
        this.followView(context);
        this.light_grid = prepared.definition.switches?.light_grid ? new lightGridSystem({ settings: prepared.definition.light_grid ?? {}, source: context.assets ?? context.basement.physics.elements?.asset_library ?? null }).attach(this.map, this.lightGridOptions(context)) : null;
        this.map.setFocus(this.mapFocuses(context), { budget_ms: Infinity });   // (the arriving regions, whole, behind the level change)
        this.light_grid?.updateState({ budget_ms: Infinity });
    }
    afterPhysics(context, seconds) {
        this.followWeather(context); this.followView(context); this.followClock(context);
        this.map.setFocus(this.mapFocuses(context), { budget_ms: this.mapStreamBudget(context) }); this.map.updateState(this.mapUpdateOptions(context));
        if (this.light_grid) { this.light_grid.setMovers(this.light_grid.moversOf(this.lightGridMovers(context))); this.light_grid.updateState({ budget_ms: this.lightGridBudget(context) }); }
    }
    /** The light grid's tier options (`radius`: how far round a focus regions keep a baked grid). */
    lightGridOptions(context) { return {}; }
    /** The entities that may carry glowing art as they move (by default every character and vehicle). */
    lightGridMovers(context) { const elements = context.basement.physics.elements; return [...elements.getEntities({ kind: 'character' }), ...elements.getEntities({ kind: 'vehicle' })]; }
    /** Milliseconds a step may spend baking light grid regions (the old grid shows until its new one is ready). */
    lightGridBudget(context) { return 2; }
    /**
     * What the map streams round: `[x, y]` points or `{position, velocity}`. By default every active
     * character body (so no one walks where walls are not built), or the map's spawn when there is none.
     * A level overrides it to stream round fewer (the player, companions, a pinned mission point).
     */
    mapFocuses(context) {
        // By class, from the characters' own list: reading a body's state would copy it.
        const focuses = context.basement.physics.elements.getEntities({ kind: 'character' }).filter(e => e.active !== false && !e.destroyed).map(e => ({ position: e.position, velocity: e.linear_velocity }));
        return focuses.length ? focuses : [this.map.spawn ?? this.definition.size.map(v => v / 2)];
    }
    /** Milliseconds a step may spend building regions (the rest wait for the next step). */
    mapStreamBudget(context) { return 3; }
    /** What `map.updateState` is given each step (door ranges, who opens doors). */
    mapUpdateOptions(context) { return {}; }
    /**
     * Turns the map's night on or off for drawing: on, the frame takes the night's `effects` (render.setEffects);
     * off, they are cleared. The world's clock says when it is night (the `day_night` switch calls this from it);
     * the level only keeps the look. Returns whether the night is on. A map with no `night` stays off.
     */
    setNight(context, on) {
        const render = context.basement.render, next = !!on && !!this.night, amount = this.day_night ? this.night_amount : 1;
        // The night's effects come in with it, at as much of the night as there is (re-laid as that changes by a step's worth).
        if (render && this.night?.effects && (next !== this.night_on || (next && Math.abs(amount - (this.effects_amount ?? 1)) > .01))) { render.setEffects(next ? this.night.effects : null, { amount: next ? amount : 1 }); this.effects_amount = amount; }
        this.night_on = next; return next;
    }
    /** With the `day_night` switch, turns the night on and off and sets how much of it there is from the world's clock. */
    followClock(context) {
        if (!this.day_night) return; const time = context.lobby?.time; if (!time?.settings.phases.length) return;   // (a clock with no phases says nothing of the night)
        const dark = time.darkness; this.night_amount = dark; this.setNight(context, dark > .001);
    }
    /** At night the looks keep what stands over the night's `covers` height (roofs keep the dark; lit windows shine). */
    lookOptions(context, blend) { return this.night_on ? { covers: this.night.covers } : {}; }
    /**
     * Draws what the map's data says over the looks: at night the night (its tint, scale and glare, the light
     * grid's baked grids and its moving emitters' lights), then the particle systems (rain, snow), day or night.
     */
    render(context, blend, frame) {
        const render = context.basement.render; if (!render) return;
        if (this.night_on) {
            const view = context.basement.camera?.getVisibleBounds({ blend, margin: 64 }) ?? null;
            render.drawNight({ tint: this.night.tint, scale: this.night.scale, glare: this.night.glare, amount: this.day_night ? this.night_amount : 1, grids: this.light_grid?.grids(view) ?? [], lights: this.light_grid?.liveLights() ?? [], blend });
        }
        if (this.particles?.length) render.drawParticles({ blend });
    }
    /** Makes the particle systems of every state of the world's weather (born at none until the weather brings them). */
    makeWeather(context) {
        const weather = context.lobby?.weather; if (!weather) return;
        const physics = context.basement.physics, source = physics.elements?.asset_library;
        for (const [state, { particles }] of Object.entries(weather.settings.states)) for (const p of particles) {
            const record = readParticleSystem(typeof p.system === 'string' ? source?.getResource(p.system) ?? (() => { throw new TypeError(`Unknown particle system: ${p.system}`); })() : p.system, p.system);
            const id = physics.createParticleSystem(p.system, { ...(Array.isArray(p.area) ? { area: p.area } : {}), ...(p.at ? { at: p.at } : {}) });
            physics.setParticleRate(id, { rate: 0, density: 0 });
            this.particles.push({ id, view: p.area === 'view', margin: p.margin ?? 96, weather: state, rate: record.rate, density: record.density, amount: 0 });
        }
    }
    /** Sets the weather's particle systems' rates from how much of their state there is now. */
    followWeather(context) {
        const weather = context.lobby?.weather; if (!weather) return;
        for (const p of this.particles ?? []) if (p.weather) {
            const amount = weather.amount(p.weather); if (Math.abs(amount - p.amount) < .002 && (amount > 0 || p.amount === 0)) continue;
            p.amount = amount; context.basement.physics.setParticleRate(p.id, { rate: p.rate * amount, density: p.density * amount });
        }
    }
    /** Keeps the particle systems marked area 'view' on what the camera sees (with their margin). */
    followView(context) {
        const camera = context.basement.camera; if (!camera) return;
        for (const p of this.particles ?? []) if (p.view) { const b = camera.getVisibleBounds({ margin: p.margin }); context.basement.physics.setParticleArea(p.id, [b.left, b.top, b.right - b.left, b.bottom - b.top]); }
    }
    leave(context) { for (const p of this.particles ?? []) context.basement.physics.removeParticleSystem(p.id); this.particles = []; if (this.night_on) this.setNight(context, false); this.night = null; this.map?.destroy(); this.map = null; this.light_grid = null; if (this.height_view) context.basement.render?.setHeightView(null); this.height_view = null; }
    /** Every exit: `{entity, target, label, auto, bounds}`. */
    getExits() {
        if (!this.map) return [];
        return this.map.entities(undefined, { section: 'triggers' }).filter(e => typeof e.data?.target === 'string').map(entity => {
            const b = entity.physics_system.getBodyBounds(entity); return { entity, target: entity.data.target, label: entity.data.label ?? null, auto: !!entity.data.auto, bounds: b };
        });
    }
    /** The exit a body stands in, or null. */
    exitAt(body) {
        const [x, y] = body.position;
        for (const exit of this.getExits()) { const b = exit.bounds; if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom && exit.entity.physics_system.containsPoint(exit.entity, body.position)) return exit; }
        return null;
    }
    /** Where someone arriving from `from` stands: inside the exit leading back there, else the map's spawn. */
    arrivalPose(context, from, body) {
        const world = context.basement.physics, [width, height] = this.definition.size, spawn = this.definition.spawn ?? [width / 2, height / 2];
        const gate = from === null ? null : this.getExits().find(exit => exit.target === from);
        if (!gate) return { position: [...spawn], rotation: -Math.PI / 2 };
        const b = gate.bounds, cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
        const edges = { S: height - b.bottom, N: b.top, W: b.left, E: width - b.right }, side = Object.keys(edges).reduce((a, k) => edges[a] <= edges[k] ? a : k);
        const dir = { S: [0, -1], N: [0, 1], W: [1, 0], E: [-1, 0] }[side];
        const inExit = p => this.getExits().some(exit => world.containsPoint(exit.entity, p));
        for (let step = 20; step <= 200; step += 10) {
            const position = [side === 'S' || side === 'N' ? cx : (dir[0] > 0 ? b.right : b.left) + dir[0] * step, side === 'W' || side === 'E' ? cy : (dir[1] > 0 ? b.bottom : b.top) + dir[1] * step];
            if (!inExit(position) && world.isPlacementClear(body, position, { ignore_body: body, include_ghosts: false })) return { position, rotation: Math.atan2(dir[1], dir[0]) };
        }
        return { position: [...spawn], rotation: -Math.PI / 2 };
    }
    /** The leader at the pose; each follower in the nearest clear spot beside it or further in, never in an exit. */
    placeTravellers(context, [leader, ...followers], pose) {
        const world = context.basement.physics, ahead = [Math.cos(pose.rotation), Math.sin(pose.rotation)], side = [-ahead[1], ahead[0]];
        const put = (body, position) => world.updateBody(body, { position, rotation: pose.rotation, linear_velocity: [0, 0], angular_velocity: 0 });
        const inExit = p => this.getExits().some(exit => world.containsPoint(exit.entity, p));
        put(leader, pose.position);
        const spots = [];
        for (let ring = 0; ring <= 6; ring++) for (const lateral of ring ? [0, 1, -1, 2, -2] : [1, -1, 2, -2]) spots.push([pose.position[0] + ahead[0] * 26 * ring + side[0] * 24 * lateral, pose.position[1] + ahead[1] * 26 * ring + side[1] * 24 * lateral]);
        for (const body of followers) put(body, spots.find(p => !inExit(p) && world.isPlacementClear(body, p, { ignore_body: body, include_ghosts: false })) ?? pose.position);
    }
}
