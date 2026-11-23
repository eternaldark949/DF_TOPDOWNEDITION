// Preview controls exercise the game's weapon art without involving mission or inventory state.
import { readComponents } from '../../src/engine/basement/physics/index.mjs';
import { shotSteps } from './shot-effects.mjs';

const CATALOG = 'weapons:catalog';
const STANCE = 'weapon_stance';
const ATTACK = 'weapon_attack';
const ARM_JOINTS = ['shoulder_l', 'elbow_l', 'hand_l', 'shoulder_r', 'elbow_r', 'hand_r'];

export function weaponChoices(registry) {
    return [{ value: 'none', text: 'Unarmed' }, ...registry.getResource(CATALOG).entries.map(id => ({
        value: id, text: registry.getTemplate('weapons:' + id).data.label
    }))];
}

export function previewWeapons(engine, registry, walker) {
    const { physics, controls } = engine.basement;
    const { ui } = engine;
    const rig = physics.rigs.getRig(walker);
    for (const clip of registry.getResource('wardrobe:preview_combat_clips').clips) rig.addClip(clip);
    const projectiles = new Map();
    const effects = new Map();
    let held = null;
    let selection = 'none';
    let requested = false;
    let released = null;
    let cooldown = 0;
    let attack = null;
    let contact = false;
    let recovered = false;

    const aimDirection = () => released ?? controls.direction('aim');
    const melee = () => held?.get('effect') === 'slash' || held?.get('effect') === 'strike';
    const firesOnRelease = () => !held || melee() || Boolean(held.get('fire_on_release'));

    function resetAttack() {
        rig.stop(ATTACK);
        attack = null;
        contact = false;
        recovered = false;
    }

    function equip(id) {
        resetAttack();
        rig.stop(STANCE);
        held?.destroy();
        held = id === 'none' ? null : engine.createEntity({ template: 'weapons:' + id });
        if (held) walker.attach(held, { rig_anchor: 'hand_r', rotation: .52 });
        selection = id;
        cooldown = 0;
    }

    function fire() {
        const { effect, effect_scale, muzzle, projectile, color, trail, core, trail_color, streak_length } = held.data;
        const position = held.toWorld(muzzle), rotation = held.rotation, elevation = held.world_elevation;
        const look = { values: { color, core } };
        const flash = engine.createEntity({ template: 'weapons:' + effect, position, rotation, elevation, look: { ...look, scale: effect_scale } });
        const lifetime = flash.get('lifetime');
        effects.set(flash, { lifetime, remaining: lifetime, scale: effect_scale, fade: effect === 'flash' });
        if (!projectile) return;
        const round = engine.createEntity({
            template: projectile, position, rotation, elevation, look,
            owner_id: walker.entity_id, direction: [Math.cos(rotation), Math.sin(rotation)]
        });
        const trace = engine.createEntity({ template: 'engine:decoration', position, elevation, look: { layer: 4 } });
        const style = registry.getResource(trail);
        projectiles.set(round.entity_id, {
            round, trace, points: [[0, 0]], style, color, core, trail_color, streak_length,
            hit: null, age: 0, seed: round.entity_id, remaining: style.fade,
            lifetime: registry.getTemplate(projectile).lifetime, puffs: [], next_puff: style.sample_interval
        });
    }

    function updateTrail(shot, seconds) {
        shot.age += seconds;
        const position = shot.hit ?? (shot.round.destroyed ? null : shot.round.position);
        if (position) {
            const at = shot.trace.toLocal(position);
            const previous = shot.points.at(-1);
            if (at[0] !== previous[0] || at[1] !== previous[1]) {
                shot.points.push(at);
                if (shot.points.length > shot.style.samples) shot.points.shift();
                if (shot.style.sample_interval && shot.age >= shot.next_puff) {
                    const phase = (shot.seed * 2.39996323 + shot.age * 37) % (2 * Math.PI);
                    shot.puffs.push({ at, born: shot.age, phase });
                    shot.next_puff = shot.age + shot.style.sample_interval;
                }
            }
            shot.hit = null;
        }
        while (shot.puffs.length && shot.age - shot.puffs[0].born >= shot.style.lifetime) shot.puffs.shift();
        if (shot.round.destroyed) shot.remaining = Math.max(0, shot.remaining - seconds);
        if (!shot.remaining && !shot.puffs.length) return false;

        const steps = shotSteps(shot);
        if (steps.length) {
            shot.trace.set('components', readComponents([{ name: 'trail', layers: [{ layer: 4, solid: false, steps }] }]));
        }
        return true;
    }

    return {
        aimDirection,
        firesOnRelease,
        releaseShot(direction) { released = direction; },
        attach(context) {
            context.defer(ui.on('preview_fire', () => { requested = true; }));
            context.defer(physics.on('animationMarker', ({ body, layer, clip_id, name }) => {
                if (body.body_id !== walker.entity_id || layer !== ATTACK || clip_id !== attack) return;
                if (name === 'contact') contact = true;
                if (name === 'recovered') recovered = true;
            }));
            context.defer(physics.on('projectileHit', ({ body, world_point, sensor_only }) => {
                const shot = projectiles.get(body.body_id);
                if (shot && !sensor_only) shot.hit = world_point;
            }));
        },
        beforePhysics() {
            const next = ui.getValue('preview_weapon');
            if (next !== selection) equip(next);
            requested ||= controls.justActivated('preview_fire');
            const aiming = aimDirection().some(Boolean);
            if (held) {
                const family = held.get('hold', 'pistol');
                const pose = melee() ? 'melee_hold' : family + (aiming ? '_aim' : '_hold');
                rig.play(pose, { layer: STANCE, mask: ARM_JOINTS, fade: .12 });
            }
            const trigger = aiming && controls.gamepad.isActive('gamepadRTrigger') && controls.justActivated('aim_fire');
            if ((!held || melee()) && !attack && (requested || released || trigger)) {
                attack = !held ? 'punch' : held.get('attack_clip', held.get('effect'));
                rig.play(attack, { layer: ATTACK, mask: ARM_JOINTS });
            }
        },
        afterPhysics(context, seconds) {
            for (const [effect, shot] of effects) {
                shot.remaining -= seconds;
                if (shot.remaining <= 1e-8) {
                    effect.destroy();
                    effects.delete(effect);
                } else if (shot.fade) {
                    const ratio = shot.remaining / shot.lifetime;
                    const look = effect.get('look');
                    effect.set('look', { ...look, scale: shot.scale * (.7 + .3 * ratio),
                        values: { ...look.values, fade: .35 + .65 * ratio } });
                }
            }
            const direction = aimDirection(), aiming = direction.some(Boolean);
            if (held) {
                const anchor = physics.rigs.getAnchor(walker, 'hand_r');
                const rotation = melee() ? .08 : aiming ? Math.atan2(direction[1], direction[0]) - anchor.rotation : .20;
                const mount = physics.getAttachmentState(held);
                if (Math.abs(rotation - mount.anchor_offset_rotation) > 1e-5) {
                    physics.setAttachmentPose(held, { local_rotation: rotation });
                }
                cooldown = Math.max(0, cooldown - seconds);
                const firing = aiming && controls.active('aim_fire') &&
                    (!firesOnRelease() || controls.gamepad.isActive('gamepadRTrigger'));
                if (!melee() && (requested || ((released || firing) && cooldown === 0))) {
                    fire();
                    cooldown = held.get('fire_interval', .25);
                }
                if (melee() && contact) fire();
            }
            contact = false;
            if (recovered) resetAttack();
            requested = false;
            released = null;
            for (const [id, shot] of projectiles) {
                if (updateTrail(shot, seconds)) continue;
                shot.trace.destroy();
                projectiles.delete(id);
            }
        },
        gameplayPaused() { released = null; },
        levelLeaving() {
            resetAttack();
            rig.stop(STANCE);
            held = null;
            selection = 'none';
            requested = false;
            released = null;
            effects.clear();
            projectiles.clear();
        }
    };
}
