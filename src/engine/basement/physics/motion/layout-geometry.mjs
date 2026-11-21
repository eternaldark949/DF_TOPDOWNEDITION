// ===== LV0 BASEMENT =====
import { vector, number, rotate, sub, add, clamp } from '../core/values.mjs';

/** Build-time authored geometry and body-local interaction geometry. No obstacle store. */
export class layoutGeometry {
    static cutWallOpenings(walls, openings, { margin = 2 } = {}) {
        number(margin, 'margin', 0);
        const rect = p => { for (const k of ['x', 'y', 'w', 'h']) number(p[k], k, k === 'w' || k === 'h' ? 1e-7 : -Infinity); return { ...p }; };
        let result = walls.map(rect); const cuts = openings.map(rect);
        for (const d of cuts) {
            const next = [];
            for (const w of result) {
                if (w.x + w.w <= d.x || w.x >= d.x + d.w || w.y + w.h <= d.y || w.y >= d.y + d.h) { next.push(w); continue; }
                const horizontal = w.w > w.h, key = horizontal ? 'x' : 'y', extent = horizontal ? 'w' : 'h';
                const lo = d[key] - margin, hi = d[key] + d[extent] + margin;
                if (lo > w[key] + 2) next.push({ ...w, [extent]: lo - w[key] });
                if (hi < w[key] + w[extent] - 2) next.push({ ...w, [key]: hi, [extent]: w[key] + w[extent] - hi });
            }
            result = next;
        }
        return result;
    }
    static boxGrip(shape, pose, { near, side, direction, gap = 0 } = {}) {
        const packet = shape.packet ?? shape;
        if (packet.shape_type !== 'box') throw new TypeError('Grip requires a box');
        vector(near); number(gap, 'gap', 0);
        vector(pose.position);number(pose.rotation??0,'rotation');
        const rotation = (pose.rotation??0) + (packet.local_rotation ?? 0), center = add(pose.position, rotate(packet.local_position ?? [0,0], pose.rotation??0));
        const at = rotate(sub(near,center),-rotation), local = direction ? rotate(vector(direction), -rotation) : at, [w, h] = packet.dimensions.map(v => v / 2);
        if (side === undefined) side = Math.abs(local[0]) / w > Math.abs(local[1]) / h ? (local[0] > 0 ? 0 : 2) : (local[1] > 0 ? 1 : 3);
        if (!Number.isInteger(side) || side < 0 || side > 3) throw new TypeError('Grip side must be 0..3');
        const offset = side === 0 ? [w + gap, 0] : side === 1 ? [0, h + gap] : side === 2 ? [-w - gap, 0] : [0, -h - gap];
        const position = add(center, rotate(offset, rotation));
        return { side, position, local_position: add(packet.local_position ?? [0,0], rotate(offset, packet.local_rotation ?? 0)),
            rotation: rotation + (side + 2) * Math.PI / 2,
            distance: Math.hypot(at[0] - clamp(at[0], -w, w), at[1] - clamp(at[1], -h, h)) };
    }
}
