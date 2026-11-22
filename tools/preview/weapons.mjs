// Preview controls exercise the game's weapon art without involving mission or inventory state.
import { readComponents } from '../../src/engine/basement/physics/index.mjs';

const CATALOG = 'weapons:catalog';
const TRAIL_SAMPLES = 9;
const TRAIL_FADE = .12;

export function weaponChoices(registry) {
    return [{ value: 'none', text: 'Unarmed' }, ...registry.getResource(CATALOG).entries.map(id => ({
        value: id, text: registry.getTemplate('weapons:' + id).data.label
    }))];
}

export function previewWeapons(engine, registry, walker) {
    const { physics, controls } = engine.basement;
    const { ui } = engine;
    const projectiles = new Map();
    const effects = new Map();
    let held = null;
    let selection = 'none';
    let requested = false;

    function equip(id) {
        held?.destroy();
        held = id === 'none' ? null : engine.createEntity({ template: 'weapons:' + id });
        if (held) walker.attach(held, { rig_anchor: 'hand_r', rotation: .52 });
        selection = id;
    }

    function fire() {
        const { effect, effect_scale, muzzle, projectile, color, trail, core } = held.data;
        const position = held.toWorld(muzzle), rotation = held.rotation, elevation = held.world_elevation;
        const look = { values: { color, core } };
        const flash = engine.createEntity({ template: 'weapons:' + effect, position, rotation, elevation, look: { ...look, scale: effect_scale } });
        effects.set(flash, flash.get('lifetime'));
        if (!projectile) return;
        const round = engine.createEntity({
            template: projectile, position, rotation, elevation, look,
            owner_id: walker.entity_id, direction: [Math.cos(rotation), Math.sin(rotation)]
        });
        const trace = engine.createEntity({ template: 'engine:decoration', position, elevation, look: { layer: 4 } });
        projectiles.set(round.entity_id, { round, trace, points: [position], color, style: trail, hit: null, remaining: TRAIL_FADE });
    }

    function paintTrail({ trace, points, color, style }, alpha) {
        const steps = [];
        for (let index = 1; index < points.length; index++) {
            const from = trace.toLocal(points[index - 1]);
            const to = trace.toLocal(points[index]);
            const dx = to[0] - from[0], dy = to[1] - from[1];
            const width = style === 'wisp' ? 2.4 : style === 'tracer' ? .65 : 1;
            const opacity = alpha * index / points.length;
            let path = [from, to];
            if (style === 'crackle' || style === 'static') {
                const sway = (index % 2 ? 1 : -1) * (style === 'static' ? .25 : .12);
                path = [from, [(from[0] + to[0]) / 2 - dy * sway, (from[1] + to[1]) / 2 + dx * sway], to];
            }
            if (style === 'wisp') {
                steps.push({ shape: 'glow', x: from[0], y: from[1], radius: 2.8, color, alpha: opacity * .45 });
            }
            steps.push({ shape: 'line', points: path, stroke: color, line_width: width, alpha: opacity });
        }
        trace.set('components', readComponents([{ name: 'trail', layers: [{ layer: 4, solid: false, steps }] }]));
    }

    return {
        attach(context) {
            context.defer(ui.on('preview_fire', () => { requested = true; }));
            context.defer(physics.on('projectileHit', ({ body, world_point, sensor_only }) => {
                const shot = projectiles.get(body.body_id);
                if (shot && !sensor_only) shot.hit = world_point;
            }));
        },
        beforePhysics() {
            const next = ui.getValue('preview_weapon');
            if (next !== selection) equip(next);
            if (held && (requested || controls.justActivated('preview_fire'))) fire();
            requested = false;
        },
        afterPhysics(context, seconds) {
            for (const [effect, time] of effects) {
                if (time <= seconds) {
                    effect.destroy();
                    effects.delete(effect);
                } else effects.set(effect, time - seconds);
            }
            for (const [id, shot] of projectiles) {
                const position = shot.hit ?? (shot.round.destroyed ? null : shot.round.position);
                if (position) {
                    const previous = shot.points.at(-1);
                    if (position[0] !== previous[0] || position[1] !== previous[1]) shot.points.push(position);
                    if (shot.points.length > TRAIL_SAMPLES) shot.points.shift();
                    shot.hit = null;
                }
                if (shot.round.destroyed) shot.remaining -= seconds;
                if (shot.remaining <= 0) {
                    shot.trace.destroy();
                    projectiles.delete(id);
                } else if (shot.points.length > 1) paintTrail(shot, shot.remaining / TRAIL_FADE);
            }
        },
        levelLeaving() {
            held = null;
            selection = 'none';
            requested = false;
            effects.clear();
            projectiles.clear();
        }
    };
}
