import { EPS } from '../core/values.mjs';

/** Exact distances between segments and convex obstacle pieces from `pieces()`. */
export function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay, len = ex * ex + ey * ey;
    const u = len > EPS ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len)) : 0;
    return Math.hypot(px - ax - ex * u, py - ay - ey * u);
}
const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = orient(cx, cy, dx, dy, ax, ay), d2 = orient(cx, cy, dx, dy, bx, by), d3 = orient(ax, ay, bx, by, cx, cy), d4 = orient(ax, ay, bx, by, dx, dy);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
export function segmentSegmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(pointSegmentDistance(ax, ay, cx, cy, dx, dy), pointSegmentDistance(bx, by, cx, cy, dx, dy),
        pointSegmentDistance(cx, cy, ax, ay, bx, by), pointSegmentDistance(dx, dy, ax, ay, bx, by));
}
function insideConvex(points, px, py) {
    let sign = 0;
    for (let e = 0; e < points.length; e++) {
        const a = points[e], c = points[(e + 1) % points.length], s = orient(a[0], a[1], c[0], c[1], px, py);
        if (Math.abs(s) <= EPS) continue;
        if (!sign) sign = Math.sign(s); else if (sign !== Math.sign(s)) return false;
    }
    return true;
}
/** Distance from segment a→b to a piece; 0 when touching or overlapping. */
export function segmentPieceDistance(a, b, piece) {
    if (piece.radius !== undefined) return Math.max(0, pointSegmentDistance(piece.center[0], piece.center[1], a[0], a[1], b[0], b[1]) - piece.radius);
    const pts = piece.points;
    if (insideConvex(pts, a[0], a[1]) || insideConvex(pts, b[0], b[1])) return 0;
    let best = Infinity;
    for (let e = 0; e < pts.length; e++) {
        const p = pts[e], q = pts[(e + 1) % pts.length];
        const d = segmentSegmentDistance(a[0], a[1], b[0], b[1], p[0], p[1], q[0], q[1]);
        if (d < best) { best = d; if (!d) return 0; }
    }
    return best;
}
