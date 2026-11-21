// ===== LV0 BASEMENT =====
// SCALE: how big an entity is against the record it was made from. A scale is [x, y, height]: a
// number s is [s, s, s]. An entity keeps its rest size (the collision, render and light shapes,
// the mass and the height span it was made with) and its body is always that rest size times its
// world scale, its own scale times its parent's. Mass changes only when the record says how:
// `mass_scales: 'area'` (by x × y), `'volume'` (by x × y × height) or false (the default).
import { rotate } from '../core/values.mjs';

export const MASS_SCALES = Object.freeze([false, 'area', 'volume']);
const RING = 16;

/** A scale as [x, y, height]: a positive number, or three of them. */
export function readScale(value) {
    const out = typeof value === 'number' ? [value, value, value] : value;
    if (!Array.isArray(out) || out.length !== 3 || !out.every(v => Number.isFinite(v) && v > 0)) throw new TypeError('A scale is a positive number, or [x, y, height] of them');
    return [out[0], out[1], out[2]];
}
export const multiplyScale = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const isUnit = s => s[0] === 1 && s[1] === 1 && s[2] === 1;

/** The mass factor a scale gives under a record's `mass_scales` switch. */
export function massFactor(scale, rule) {
    if (!MASS_SCALES.includes(rule)) throw new TypeError(`mass_scales is ${MASS_SCALES.map(String).join(', ')}`);
    return rule === 'area' ? scale[0] * scale[1] : rule === 'volume' ? scale[0] * scale[1] * scale[2] : 1;
}

/** A height span scaled by a height factor (null stays null: every height). */
export const scaleSpan = (span, z) => span ? [span[0] * z, span[1] * z] : null;

/**
 * A collision shape packet scaled by [x, y] in its body's frame. A uniform scale keeps the shape's
 * kind; a stretched circle, capsule or turned box becomes the convex polygon it turns into.
 */
export function scaleShape(packet, [sx, sy]) {
    if (!packet) return packet;
    const at = packet.local_position ?? [0, 0], turn = packet.local_rotation ?? 0, local_position = [at[0] * sx, at[1] * sy];
    if (packet.shape_type === 'compound') return { ...packet, local_position, children: packet.children.map(child => scaleShape(child, [sx, sy])) };
    if (sx === sy) {
        const s = sx;
        switch (packet.shape_type) {
            case 'circle': return { ...packet, local_position, radius: packet.radius * s };
            case 'box': return { ...packet, local_position, dimensions: packet.dimensions.map(v => v * s) };
            case 'capsule': case 'segment': return { ...packet, local_position, radius: (packet.radius ?? 0) * s, points: packet.points.map(p => p.map(v => v * s)) };
            case 'polygon': return { ...packet, local_position, points: packet.points.map(p => p.map(v => v * s)) };
        }
    }
    // Stretched: every outline point into the body's frame, scaled there, as one convex polygon.
    const outline = shapeOutline(packet).map(p => { const [x, y] = rotate(p, turn); return [(at[0] + x) * sx, (at[1] + y) * sy]; });
    if (packet.shape_type === 'box' && turn === 0) { const [w, h] = packet.dimensions; return { ...packet, local_position, dimensions: [w * sx, h * sy] }; }
    if (packet.shape_type === 'segment') return { ...packet, local_position: [0, 0], local_rotation: 0, points: outline.slice(0, 2) };
    const { radius, dimensions, points, ...rest } = packet;
    return { ...rest, shape_type: 'polygon', local_position: [0, 0], local_rotation: 0, points: hull(outline) };
}
function shapeOutline(p) {
    const ring = (cx, cy, r) => Array.from({ length: RING }, (_, i) => { const a = i / RING * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    switch (p.shape_type) {
        case 'circle': return ring(0, 0, p.radius);
        case 'box': { const [w, h] = p.dimensions; return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; }
        case 'capsule': return [...ring(...p.points[0], p.radius), ...ring(...p.points[1], p.radius)];
        case 'segment': return p.points.map(q => [...q]);
        case 'polygon': return p.points.map(q => [...q]);
    }
    throw new TypeError(`Cannot scale a ${p.shape_type}`);
}
/** Convex hull, counter-clockwise, with no three points in a line. */
function hull(points) {
    const p = [...new Map(points.map(q => [`${q[0].toFixed(9)},${q[1].toFixed(9)}`, q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = list => { const out = []; for (const q of list) { while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 1e-9) out.pop(); out.push(q); } out.pop(); return out; };
    return [...half(p), ...half([...p].reverse())];
}
