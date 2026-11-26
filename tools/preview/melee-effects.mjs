// Game-time traces sampled from the posed weapon or fist, painted through the drawing API.
import { readComponents } from '../../src/engine/basement/physics/index.mjs';

export function meleeTrace(engine, walker, anchor, profile) {
    const entity = engine.createEntity({
        template: 'engine:decoration', position: walker.position, rotation: walker.rotation,
        elevation: anchor.height, look: { layer: 5 }
    });
    return { entity, profile, age: 0, points: [] };
}

export function updateMeleeTrace(trace, walker, source, seconds) {
    const { entity, profile, points } = trace;
    trace.age += seconds;
    if (trace.age >= profile.life) { entity.destroy(); return false; }
    if (source) {
        entity.moveTo(walker.position);
        entity.rotateTo(walker.rotation);
        if (trace.age >= profile.cut[0] && trace.age <= profile.cut[1]) {
            points.push({ time: trace.age, at: entity.toLocal(source()) });
        }
    }
    const end = Math.min(trace.age, profile.cut[1]);
    while (points.length > 2 && points[1].time < end - profile.span) points.shift();
    const fade = 1 - trace.age / profile.life;
    const steps = profile.strokes
        ? points.length > 1 ? profile.strokes.map(([width, rgb, alpha]) => ({
            shape: 'line', points: points.map(point => point.at), line_width: width,
            line_cap: 'round', line_join: 'round', stroke: `rgba(${rgb},${fade * alpha})`, blend: 'add'
        })) : []
        : points.slice(-profile.copies).map(({ at: [x, y] }, index, copies) => ({
            shape: 'glow', x, y, radius: 6 + index, color: '#ffcd78', alpha: fade * .5 * (index + 1) / copies.length
        }));
    if (steps.length) entity.set('components', readComponents([{ name: 'melee_trail', layers: [{ layer: 0, solid: false, steps }] }]));
    return true;
}
