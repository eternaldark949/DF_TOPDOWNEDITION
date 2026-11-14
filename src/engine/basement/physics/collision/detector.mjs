// ===== LV0 BASEMENT =====
import { EPS, dot, sub, add, scale, unit, length } from '../core/values.mjs';
import { pieces, shapeReach } from './shape.mjs';

function axesOf(p) {
    if (!p.points) return [];
    return p.points.map((v, i) => { const d = sub(p.points[(i + 1) % p.points.length], v); return unit([-d[1], d[0]]); });
}
function project(p, n) {
    if (p.radius !== undefined) { const c = dot(p.center, n); return [c - p.radius, c + p.radius]; }
    let lo = Infinity, hi = -Infinity;
    for (const v of p.points) { const d = dot(v, n); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    return [lo, hi];
}
function support(p, n) {
    if (p.radius !== undefined) return add(p.center, scale(n, p.radius));
    let best = -Infinity, x = 0, y = 0, count = 0;
    for (const v of p.points) {
        const d = dot(v, n);
        if (d > best + EPS) { best = d; x = v[0]; y = v[1]; count = 1; }
        else if (Math.abs(d - best) <= EPS) { x += v[0]; y += v[1]; count++; }
    }
    return [x / count, y / count];
}
function pieceContact(a, b) {
    const axes = [...axesOf(a), ...axesOf(b)];
    if (a.radius !== undefined && b.radius !== undefined) axes.push(unit(sub(b.center, a.center)));
    const circlePoly = (c, p) => {
        let nearest = null, d = Infinity;
        for (const v of p.points) { const dv = sub(v, c.center), q = dot(dv, dv); if (q < d) { nearest = dv; d = q; } }
        if (nearest && d > EPS * EPS) axes.push(unit(nearest));
    };
    if (a.radius !== undefined && b.points) circlePoly(a, b);
    if (b.radius !== undefined && a.points) circlePoly(b, a);
    let depth = Infinity, normal = [1, 0], gap = -Infinity;
    for (const n of axes) {
        const [al, ah] = project(a, n), [bl, bh] = project(b, n);
        gap = Math.max(gap, bl - ah, al - bh);
        const forward = ah - bl, backward = bh - al;
        const penetration = Math.min(forward, backward);
        if (penetration < depth) { depth = penetration; normal = forward <= backward ? n : scale(n, -1); }
    }
    const pa = support(a, normal), pb = support(b, scale(normal, -1));
    return { normal, penetration_depth: Math.max(0, depth), world_point: scale(add(pa, pb), 0.5), separation: gap };
}

// Fixed-orientation sweeps have exact translation intervals. Circle/polygon
// boundaries comprise offset edge segments and circular vertex caps.
function circleTime(offset, velocity, radius) {
    const c = dot(offset, offset) - radius * radius, a = dot(velocity, velocity), b = 2 * dot(offset, velocity);
    if (c <= 0) return 0;
    const discriminant = b * b - 4 * a * c;
    if (a <= EPS * EPS || b >= 0 || discriminant < 0) return null;
    const t = 2 * c / (-b + Math.sqrt(discriminant)); return t <= 1 ? t : null;
}
function translationFraction(a, da, b, db) {
    if (pieceContact(a, b).separation <= EPS) return 0;
    const v = sub(da, db);
    if (a.radius !== undefined && b.radius !== undefined) return circleTime(sub(a.center, b.center), v, a.radius + b.radius + EPS);
    if (a.points && b.radius !== undefined) return translationFraction(b, db, a, da);
    if (a.radius !== undefined) {
        const radius = a.radius + EPS; let first = Infinity;
        for (let i = 0; i < b.points.length; i++) {
            const from = b.points[i], end = b.points[(i + 1) % b.points.length], edge = sub(end, from), size2 = dot(edge, edge), size = Math.sqrt(size2);
            const n = [-edge[1] / size, edge[0] / size], offset = sub(a.center, from), rate = dot(v, n), distance = dot(offset, n);
            if (Math.abs(rate) > EPS) for (const side of [-1, 1]) {
                const t = (side * radius - distance) / rate;
                if (t < 0 || t > 1 || t >= first) continue;
                const along = dot(add(offset, scale(v, t)), edge) / size2;
                if (along >= 0 && along <= 1) first = t;
            }
            const vertex = circleTime(offset, v, radius); if (vertex !== null) first = Math.min(first, vertex);
        }
        return first === Infinity ? null : first;
    }
    let enter = 0, leave = 1;
    for (const n of [...axesOf(a), ...axesOf(b)]) {
        const [al, ah] = project(a, n), [bl, bh] = project(b, n), speed = dot(v, n);
        if (Math.abs(speed) <= EPS) { if (bl - ah > EPS || al - bh > EPS) return null; continue; }
        const x = (bl - ah - EPS) / speed, y = (bh - al + EPS) / speed;
        enter = Math.max(enter, Math.min(x, y)); leave = Math.min(leave, Math.max(x, y));
        if (enter > leave) return null;
    }
    return enter <= 1 && leave >= 0 ? Math.max(0, enter) : null;
}

/** Geometry only. Normals point from A toward B. */
export class collisionDetector {
    static contact(shape_a, pose_a, shape_b, pose_b) {
        let best = null, separation = Infinity;
        for (const a of pieces(shape_a, pose_a.position, pose_a.rotation)) for (const b of pieces(shape_b, pose_b.position, pose_b.rotation)) {
            const c = pieceContact(a, b); separation = Math.min(separation, c.separation);
            if (c.separation <= EPS && (!best || c.penetration_depth > best.penetration_depth)) best = c;
        }
        return best ? { ...best, separation } : null;
    }
    static separation(shape_a, pose_a, shape_b, pose_b) {
        let separation = Infinity;
        for (const a of pieces(shape_a, pose_a.position, pose_a.rotation)) for (const b of pieces(shape_b, pose_b.position, pose_b.rotation)) separation = Math.min(separation, pieceContact(a, b).separation);
        return separation;
    }
    /** Conservative advancement bounds translational AND rotational motion. No sampled tunnelling. */
    static sweep(shape_a, from_a, to_a, shape_b, from_b, to_b = from_b) {
        const circle_a = shape_a.packet ?? shape_a, circle_b = shape_b.packet ?? shape_b;
        const linearCenter = (shape, from, to) => from.rotation === to.rotation || !(shape.local_position?.[0] || shape.local_position?.[1]);
        if (circle_a.shape_type === 'circle' && circle_b.shape_type === 'circle' && linearCenter(circle_a, from_a, to_a) && linearCenter(circle_b, from_b, to_b)) {
            const ca = pieces(shape_a, from_a.position, from_a.rotation)[0], cb = pieces(shape_b, from_b.position, from_b.rotation)[0];
            const ea = pieces(shape_a, to_a.position, to_a.rotation)[0], eb = pieces(shape_b, to_b.position, to_b.rotation)[0];
            const offset = sub(cb.center, ca.center), travel = sub(sub(eb.center, cb.center), sub(ea.center, ca.center));
            const radius = ca.radius + cb.radius + EPS, c = dot(offset, offset) - radius * radius;
            const qa = dot(travel, travel), qb = 2 * dot(offset, travel);
            let fraction = 0;
            if (c > 0) {
                const disc = qb * qb - 4 * qa * c;
                if (qa <= EPS * EPS || qb >= 0 || disc < 0) return null;
                // This root form avoids cancellation when a small gap precedes a long sweep.
                fraction = 2 * c / (-qb + Math.sqrt(disc));
                if (fraction > 1) return null;
            }
            const a = { position: add(from_a.position, scale(sub(to_a.position, from_a.position), fraction)), rotation: from_a.rotation + (to_a.rotation - from_a.rotation) * fraction };
            const b = { position: add(from_b.position, scale(sub(to_b.position, from_b.position), fraction)), rotation: from_b.rotation + (to_b.rotation - from_b.rotation) * fraction };
            const at_a = add(ca.center, scale(sub(ea.center, ca.center), fraction)), at_b = add(cb.center, scale(sub(eb.center, cb.center), fraction)), normal = unit(sub(at_b, at_a));
            return { ...(this.contact(shape_a, a, shape_b, b) ?? { normal, penetration_depth: 0, separation: EPS, world_point: add(at_a, scale(normal, ca.radius)) }), fraction };
        }
        if (from_a.rotation === to_a.rotation && from_b.rotation === to_b.rotation) {
            const da = sub(to_a.position, from_a.position), db = sub(to_b.position, from_b.position); let first = Infinity;
            for (const a of pieces(shape_a, from_a.position, from_a.rotation)) for (const b of pieces(shape_b, from_b.position, from_b.rotation)) {
                const t = translationFraction(a, da, b, db); if (t !== null) first = Math.min(first, t);
            }
            if (first === Infinity) return null;
            const pa = { position: add(from_a.position, scale(da, first)), rotation: from_a.rotation }, pb = { position: add(from_b.position, scale(db, first)), rotation: from_b.rotation };
            let contact = this.contact(shape_a, pa, shape_b, pb);
            if (!contact) for (const a of pieces(shape_a, pa.position, pa.rotation)) for (const b of pieces(shape_b, pb.position, pb.rotation)) {
                const candidate = pieceContact(a, b); if (!contact || candidate.separation < contact.separation) contact = candidate;
            }
            return { ...contact, fraction: first };
        }
        const da = sub(to_a.position, from_a.position), db = sub(to_b.position, from_b.position);
        const ra = to_a.rotation - from_a.rotation, rb = to_b.rotation - from_b.rotation;
        const rate = length(sub(da, db)) + Math.abs(ra) * shapeReach(shape_a) + Math.abs(rb) * shapeReach(shape_b);
        const at = (from, d, r, t) => ({ position: add(from.position, scale(d, t)), rotation: from.rotation + r * t });
        let t = 0;
        for (let i = 0; i < 256; i++) {
            const a = at(from_a, da, ra, t), b = at(from_b, db, rb, t);
            const c = this.contact(shape_a, a, shape_b, b);
            if (c) return { ...c, fraction: t };
            if (rate <= EPS) return null;
            const gap = this.separation(shape_a, a, shape_b, b);
            t += Math.max(EPS / rate, gap / rate * 0.95);
            if (t > 1) return null;
        }
        throw new Error('Sweep convergence limit reached; shorten the motion or simplify the shape');
    }
}
