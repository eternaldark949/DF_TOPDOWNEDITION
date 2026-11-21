// ===== LV0 BASEMENT =====
/** Pure authored-path geometry. It stores neither bodies nor a spatial index. */
export class pathGeometry {
    static transformPose(anchor, { local_position = [0, 0], local_rotation = 0 } = {}) {
        this._point(anchor.position); this._point(local_position);
        const rotation = anchor.rotation ?? 0;
        if (!Number.isFinite(rotation) || !Number.isFinite(local_rotation)) throw new TypeError('Invalid pose rotation');
        const c = Math.cos(rotation), s = Math.sin(rotation);
        const position = [anchor.position[0] + local_position[0] * c - local_position[1] * s, anchor.position[1] + local_position[0] * s + local_position[1] * c];
        this._point(position);
        if (!Number.isFinite(rotation + local_rotation)) throw new TypeError('Invalid transformed rotation');
        return { position, rotation: rotation + local_rotation };
    }
    static pointOnPath(points, distance, { end_clearance = 0 } = {}) {
        return this._atSegments(this._segments(points), distance, { end_clearance });
    }
    static _atSegments(segments, distance, { end_clearance = 0 } = {}) {
        if (!Number.isFinite(distance)) throw new TypeError('Invalid path distance');
        if (!Number.isFinite(end_clearance) || end_clearance < 0) throw new TypeError('Invalid end_clearance');
        const total = segments.at(-1).end, margin = Math.min(end_clearance, total / 2);
        const along = Math.max(margin, Math.min(distance, total - margin));
        const segment = segments.find(s => s.end >= along) ?? segments.at(-1);
        const fraction = (along - segment.start) / segment.length;
        return { position: [segment.from[0] + segment.dx * fraction, segment.from[1] + segment.dy * fraction],
            rotation: Math.atan2(segment.dy, segment.dx), distance_along: along, path_length: total, segment_index: segment.index };
    }
    static projectOnPath(points, position, options = {}) {
        this._point(position); const segments = this._segments(points); let nearest = Infinity, along = 0;
        for (const s of segments) {
            const t = Math.max(0, Math.min(1, ((position[0] - s.from[0]) * s.dx + (position[1] - s.from[1]) * s.dy) / (s.length * s.length)));
            const dx = position[0] - s.from[0] - s.dx * t, dy = position[1] - s.from[1] - s.dy * t, d2 = dx * dx + dy * dy;
            if (d2 < nearest) { nearest = d2; along = s.start + s.length * t; }
        }
        const result = this._atSegments(segments, along, options);
        return { ...result, distance: Math.hypot(position[0] - result.position[0], position[1] - result.position[1]) };
    }
    static nearestPath(paths, { position, near_range = Infinity, end_clearance = 0 } = {}) {
        this._point(position);
        if (!(near_range >= 0) || (near_range !== Infinity && !Number.isFinite(near_range))) throw new TypeError('Invalid near_range');
        let best = null;
        for (const path of paths) {
            const projected = this.projectOnPath(path.points, position, { end_clearance });
            if (projected.distance <= near_range && (!best || projected.distance < best.distance)) best = { ...projected, path };
        }
        return best;
    }
    static _point(p) { if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) throw new TypeError('Path points must be finite [x, y] pairs'); }
    static _segments(points) {
        if (!Array.isArray(points) || points.length < 2 || points.length > 4096) throw new TypeError('Path needs 2..4096 points');
        points.forEach(p => this._point(p)); let total = 0; const segments = [];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1], length = Math.hypot(dx, dy);
            if (!(length > 0) || !Number.isFinite(length) || !Number.isFinite(total + length)) throw new TypeError('Path segments must have finite nonzero length');
            segments.push({ index: i - 1, from: points[i - 1], dx, dy, length, start: total, end: total + length }); total += length;
        }
        return segments;
    }
}
