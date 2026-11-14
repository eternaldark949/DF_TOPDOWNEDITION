import LIGHTING from '../data/game-lighting.json' with { type: 'json' };

/**
 * The lights the world makes as it moves, as placed lights for sceneLighting (beside levelLights): cars'
 * headlights, shots and muzzle flashes, a laser sight's line, and in the rain the lamps' and signs'
 * reflections lifting the dark on the wet street. Each reads plain data the host gathers from its
 * systems, and the look in `data/game-lighting.json`. Moving ones are marked `moving`, so they are never
 * baked: their shapes are stamped, or drawn live when walls cut them.
 */

/**
 * Each vehicle with its lights on: `{id, position, angle, length, width, range?, color?, haze?}` (`range` sets
 * the beam's reach, `haze` 0..1 how much its colour shows, 1 for the car she drives). A beam ahead of its
 * front, cut by walls, and a small glow at each headlamp.
 */
export function headlightLights(vehicles, { look = LIGHTING } = {}) {
    const H = look.headlight, out = [];
    for (const v of vehicles) {
        const a = v.angle, c = Math.cos(a), s = Math.sin(a), range = v.range ?? H.range, color = v.color ?? H.colour, haze = v.haze ?? .7;
        const front = [v.position[0] + c * v.length / 2, v.position[1] + s * v.length / 2], side = v.width * H.lamp_spacing;
        out.push({ id: `${v.id}:beam`, shape: 'beam', position: front, rotation: a, length: range * H.length, width: range * H.width, near_width: H.near_width,
            color, intensity: 1, glow: haze, shadows: 'static', animation: { kind: 'steady' }, moving: true });
        if (haze > 0) for (const k of [-1, 1]) out.push({ id: `${v.id}:lamp${k}`, position: [front[0] - s * side * k, front[1] + c * side * k], radius: H.lamp_radius,
            color, intensity: 0, glow: H.lamp_glow * haze, shadows: 'none', animation: { kind: 'steady' }, moving: true });
    }
    return out;
}

/** Shots in flight `{id, position, color?}` and muzzle flashes `{id, position, radius, life, color?}`: each lights softly round it in its colour. */
export function shotLights({ projectiles = [], muzzles = [] } = {}, { look = LIGHTING } = {}) {
    const S = look.shot, M = look.muzzle;
    return [
        ...projectiles.map(p => ({ id: `${p.id}:shot`, position: p.position, radius: S.radius, color: colour(p.color, S.colour), intensity: 1, glow: S.glow, shadows: 'none', animation: { kind: 'steady' }, moving: true })),
        ...muzzles.map(f => ({ id: `${f.id}:muzzle`, position: f.position, radius: f.radius * M.reach, color: colour(f.color, M.colour), intensity: 1, glow: M.glow * Math.min(1, (f.life ?? M.life) / M.life), shadows: 'none', animation: { kind: 'steady' }, moving: true }))
    ];
}

/** A laser sight from `from` to `to`: a thin line cut through the dark, and a dot where it lands. */
export function laserLights({ id = 'laser', from, to }, { look = LIGHTING } = {}) {
    const L = look.laser, dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
    if (!(length > 0)) return [];
    return [{ id: `${id}:line`, shape: 'strip', position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], size: [length, L.width], round: L.width / 2, rotation: Math.atan2(dy, dx),
            color: L.colour, intensity: L.intensity, glow: 0, shadows: 'none', animation: { kind: 'steady' }, moving: true },
        { id: `${id}:dot`, position: [...to], radius: L.dot_radius, color: L.colour, intensity: L.dot_intensity, glow: 0, shadows: 'none', animation: { kind: 'steady' }, moving: true }];
}

/**
 * In the rain the street mirrors what stands up from it: each street lamp's head and each sign, as a
 * streak down the wet ground below it that lifts the dark. `wetness` 0..1 is how wet the street is; it is
 * taken in steps, so the reflections are baked with the lamps and repainted only when it changes a step.
 */
export function wetLights(lights, wetness, { look = LIGHTING } = {}) {
    const W = look.wet, wet = Math.round(Math.max(0, Math.min(1, wetness)) * W.steps) / W.steps;
    if (wet <= 0) return [];
    const out = [];
    for (const l of lights) {
        const street = l.look === 'street', sign = l.intensity === 0 && l.glow > 0;
        if (!street && !sign) continue;
        const top = l.position[1] + (street ? W.head_height : 0);
        out.push({ id: `${l.id}:wet`, shape: 'strip', position: [l.position[0], top + W.streak / 2], size: [W.width, W.streak], round: W.width / 2, soft: true,
            color: l.color, intensity: W.lift * wet, glow: W.glow * wet, shadows: 'none', animation: l.animation, moving: !!l.moving, lit: l.lit });
    }
    return out;
}

const colour = (c, fallback) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
