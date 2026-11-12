import { number, vector, angleDelta } from '../core/values.mjs';

/**
 * Pure rail geometry: a fixed line a body can ride, sampled once so a rider reads its position, heading and bend
 * from the distance along it without solving a curve every step. It stores neither bodies nor a spatial index.
 *
 * RAIL TABLE  { length, count, distances, x, y, rotations, curvatures }
 *   distances[i]   arc length from the start to sample i
 *   rotations[i]   heading at sample i, radians
 *   curvatures[i]  signed bend at sample i, radians per unit: positive turns toward +rotation
 */
export class railGeometry {
    /**
     * Sample a rail from its points. `rotations` gives the heading at each point (an authored curve knows its own
     * tangent); left out, each point takes the direction of the line through its neighbours.
     */
    static sampleRail({ points, rotations } = {}) {
        if (!Array.isArray(points) || points.length < 2 || points.length > 4096) throw new TypeError('A rail needs 2..4096 points');
        if (rotations !== undefined && (!Array.isArray(rotations) || rotations.length !== points.length)) throw new TypeError('A rail needs one rotation per point');
        const count = points.length, last = count - 1;
        const distances = new Float64Array(count), x = new Float64Array(count), y = new Float64Array(count);
        const headings = new Float64Array(count), curvatures = new Float64Array(count);
        let length = 0;
        for (let i = 0; i < count; i++) {
            const point = vector(points[i], 'rail point');
            x[i] = point[0]; y[i] = point[1];
            if (i) {
                const step = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
                if (!(step > 0)) throw new TypeError('Rail points must not repeat');
                length += step;
            }
            distances[i] = length;
        }
        for (let i = 0; i < count; i++) {
            if (rotations) { headings[i] = number(rotations[i], 'rail rotation'); continue; }
            const before = Math.max(0, i - 1), after = Math.min(last, i + 1);
            headings[i] = Math.atan2(y[after] - y[before], x[after] - x[before]);
        }
        for (let i = 0; i < count; i++) {
            const before = Math.max(0, i - 1), after = Math.min(last, i + 1), span = distances[after] - distances[before];
            curvatures[i] = span > 1e-6 ? angleDelta(headings[before], headings[after]) / span : 0;
        }
        return Object.freeze({ length, count, distances, x, y, rotations: headings, curvatures });
    }

    /** Where `distance` along the rail is (held to its ends): fills and returns `out` { x, y, rotation, curvature }. */
    static pointOnRail(table, distance, out = {}) {
        const { distances } = table;
        if (!(distance > 0)) distance = 0; else if (distance > table.length) distance = table.length;
        let low = 0, high = table.count - 1;
        while (high - low > 1) { const middle = (low + high) >> 1; if (distances[middle] <= distance) low = middle; else high = middle; }
        const span = distances[high] - distances[low], share = span > 1e-9 ? (distance - distances[low]) / span : 0;
        out.x = table.x[low] + (table.x[high] - table.x[low]) * share;
        out.y = table.y[low] + (table.y[high] - table.y[low]) * share;
        out.rotation = table.rotations[low] + angleDelta(table.rotations[low], table.rotations[high]) * share;
        out.curvature = table.curvatures[low] + (table.curvatures[high] - table.curvatures[low]) * share;
        return out;
    }

    /** The point of the rail nearest (x, y): { distance (along), lateral (signed, + to the left of travel), rotation }. */
    static projectOnRail(table, position, out = {}) {
        const [px, py] = vector(position);
        let best = Infinity;
        for (let i = 0; i < table.count - 1; i++) {
            const ex = table.x[i + 1] - table.x[i], ey = table.y[i + 1] - table.y[i], size2 = ex * ex + ey * ey;
            const share = Math.max(0, Math.min(1, ((px - table.x[i]) * ex + (py - table.y[i]) * ey) / size2));
            const dx = px - table.x[i] - ex * share, dy = py - table.y[i] - ey * share, gap2 = dx * dx + dy * dy;
            if (gap2 >= best) continue;
            best = gap2;
            out.distance = table.distances[i] + (table.distances[i + 1] - table.distances[i]) * share;
            out.lateral = (ex * dy - ey * dx) / Math.sqrt(size2);
        }
        out.rotation = this.pointOnRail(table, out.distance, railScratch).rotation;
        return out;
    }

    /** The sharpest bend between two distances along the rail, as |curvature| (0 on a straight). */
    static sharpestBend(table, from, to) {
        let sharpest = Math.abs(this.pointOnRail(table, from, railScratch).curvature);
        sharpest = Math.max(sharpest, Math.abs(this.pointOnRail(table, to, railScratch).curvature));
        for (let i = 0; i < table.count; i++) {
            if (table.distances[i] < from) continue;
            if (table.distances[i] > to) break;
            sharpest = Math.max(sharpest, Math.abs(table.curvatures[i]));
        }
        return sharpest;
    }
}
const railScratch = { x: 0, y: 0, rotation: 0, curvature: 0 };
