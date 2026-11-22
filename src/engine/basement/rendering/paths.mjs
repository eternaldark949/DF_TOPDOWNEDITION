// ===== LV0 BASEMENT =====
// PATHS: packet geometry turned into points and triangles, for backends that draw triangles (WebGL).
// `flattenGeometry` follows Canvas path rules (a line with no subpath starts one, an arc joins the
// current point with a line, `rect` is a closed subpath of its own) so a shape outlines the same in
// every backend. `strokeTriangles` builds a stroke's outline as triangles that may overlap: the backend
// covers each pixel once (WebGL uses the stencil), so overlaps never double the paint.

const TAU = Math.PI * 2;
/** Canvas's default miter limit: a corner sharper than this many line widths is bevelled. */
export const MITER_LIMIT = 10;
const MAX_SEGMENTS = 1024;

function arcSweep(start, end, anticlockwise) {
    if (!anticlockwise && end - start >= TAU) return TAU;
    if (anticlockwise && start - end >= TAU) return -TAU;
    let sweep = (end - start) % TAU;
    if (!anticlockwise && sweep < 0) sweep += TAU;
    if (anticlockwise && sweep > 0) sweep -= TAU;
    return sweep;
}
const arcSegments = (radius, sweep, tolerance) => {
    if (!(radius > tolerance)) return Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
    const step = 2 * Math.acos(1 - tolerance / radius);
    return Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.abs(sweep) / step)));
};

/**
 * Points of every subpath of a geometry (`rect`, `ellipse` or `path`, as packets.mjs normalizes them),
 * with curves cut into lines no farther than `tolerance` (local units) from the curve.
 * Returns [{points: [x0, y0, x1, y1, ...], closed}].
 */
export function flattenGeometry(g, tolerance = .25) {
    const paths = []; let current = null, cx = 0, cy = 0;
    const begin = (x, y) => { current = { points: [x, y], closed: false }; paths.push(current); cx = x; cy = y; };
    const to = (x, y) => { if (!current) begin(x, y); else { current.points.push(x, y); cx = x; cy = y; } };
    const close = () => { if (!current) return; current.closed = true; const [x, y] = current.points; current = null; begin(x, y); paths.pop(); current = { points: [x, y], closed: false, pending: true }; };
    // a subpath opened by close() only counts once something is drawn from it
    const ensure = () => { if (current?.pending) { delete current.pending; paths.push(current); } };
    const ellipse = (x, y, rx, ry, rotation, start, end, anticlockwise, join) => {
        const sweep = arcSweep(start, end, anticlockwise), n = arcSegments(Math.max(rx, ry), sweep, tolerance), c = Math.cos(rotation), s = Math.sin(rotation);
        for (let i = 0; i <= n; i++) {
            const a = start + sweep * i / n, ex = rx * Math.cos(a), ey = ry * Math.sin(a), px = x + ex * c - ey * s, py = y + ex * s + ey * c;
            if (i === 0 && !(join && current)) begin(px, py); else to(px, py);
        }
    };
    if (g.type === 'rect') {
        const [w, h] = g.size, r = Math.min(g.radius ?? 0, w / 2, h / 2), x = -w / 2, y = -h / 2;
        if (!(r > 0)) { begin(x, y); to(x + w, y); to(x + w, y + h); to(x, y + h); }
        else {
            begin(x + r, y);
            ellipse(x + w - r, y + r, r, r, 0, -Math.PI / 2, 0, false, true); ellipse(x + w - r, y + h - r, r, r, 0, 0, Math.PI / 2, false, true);
            ellipse(x + r, y + h - r, r, r, 0, Math.PI / 2, Math.PI, false, true); ellipse(x + r, y + r, r, r, 0, Math.PI, Math.PI * 1.5, false, true);
        }
        current.closed = true; return paths;
    }
    if (g.type === 'ellipse') { ellipse(0, 0, g.radii[0], g.radii[1], 0, 0, TAU, false, false); current.closed = true; return paths; }
    for (const command of g.commands) {
        const op = command[0];
        if (op === 'move') { if (current?.pending) current = null; begin(command[1], command[2]); }
        else if (op === 'line') { ensure(); to(command[1], command[2]); }
        else if (op === 'close') { ensure(); close(); }
        else if (op === 'rect') { const [, x, y, w, h] = command; if (current?.pending) current = null; begin(x, y); to(x + w, y); to(x + w, y + h); to(x, y + h); current.closed = true; current = null; begin(x, y); paths.pop(); current = { points: [x, y], closed: false, pending: true }; }
        else if (op === 'ellipse') { ensure(); const [, x, y, rx, ry, rotation, start, end, anti] = command; ellipse(x, y, rx, ry, rotation, start, end, !!anti, true); }
        else {
            ensure(); if (!current) begin(command[1], command[2]);
            const x0 = cx, y0 = cy;
            if (op === 'quadratic') {
                const [, qx, qy, x, y] = command, d = Math.hypot(x0 - 2 * qx + x, y0 - 2 * qy + y), n = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt(d / (8 * tolerance)))));
                for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; to(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y); }
            } else {
                const [, ax, ay, bx, by, x, y] = command, d = Math.max(Math.hypot(x0 - 2 * ax + bx, y0 - 2 * ay + by), Math.hypot(ax - 2 * bx + x, ay - 2 * by + y));
                const n = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt(.75 * d / tolerance))));
                for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; to(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y); }
            }
        }
    }
    return paths.filter(path => !path.pending);
}

/** The bounding box [left, top, right, bottom] of flattened subpaths, grown by `pad`. Null when empty. */
export function pathBounds(paths, pad = 0) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const { points } of paths) for (let i = 0; i < points.length; i += 2) { const x = points[i], y = points[i + 1]; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    return l <= r ? [l - pad, t - pad, r + pad, b + pad] : null;
}

/**
 * Triangles that fill subpaths by winding: a fan from each subpath's first point. Drawn into a stencil
 * (counting front faces up and back faces down, or flipping a bit for even-odd) they mark exactly the
 * filled pixels, holes and self-crossings included. Returns a Float32Array of x, y pairs.
 */
export function fillTriangles(paths) {
    let count = 0; for (const { points } of paths) if (points.length >= 6) count += (points.length / 2 - 2) * 6;
    const out = new Float32Array(count); let k = 0;
    for (const { points } of paths) {
        if (points.length < 6) continue;
        const x0 = points[0], y0 = points[1];
        for (let i = 2; i + 3 < points.length; i += 2) { out[k++] = x0; out[k++] = y0; out[k++] = points[i]; out[k++] = points[i + 1]; out[k++] = points[i + 2]; out[k++] = points[i + 3]; }
    }
    return out;
}

/** Subpaths cut into dashes along their length (`dash` lengths alternate on and off, an odd list repeats twice), starting `offset` into the pattern. */
export function dashPaths(paths, dash, offset = 0) {
    const pattern = dash.length % 2 ? [...dash, ...dash] : dash, total = pattern.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return paths;
    const out = [];
    for (const { points, closed } of paths) {
        const p = closed ? [...points, points[0], points[1]] : points;
        let phase = ((offset % total) + total) % total, index = 0;
        while (phase >= pattern[index]) { phase -= pattern[index]; index = (index + 1) % pattern.length; }
        let left = pattern[index] - phase, on = index % 2 === 0, piece = on ? [p[0], p[1]] : null;
        for (let i = 0; i + 3 < p.length; i += 2) {
            let ax = p[i], ay = p[i + 1]; const bx = p[i + 2], by = p[i + 3]; let length = Math.hypot(bx - ax, by - ay);
            while (length > left) {
                const k = left / length; ax += (bx - ax) * k; ay += (by - ay) * k; length -= left;
                if (on) { piece.push(ax, ay); out.push({ points: piece, closed: false }); piece = null; } else piece = [ax, ay];
                on = !on; index = (index + 1) % pattern.length; left = pattern[index];
            }
            left -= length; if (on) piece.push(bx, by);
        }
        if (on && piece && piece.length >= 4) out.push({ points: piece, closed: false });
    }
    return out;
}

/**
 * A stroke `width` wide along each subpath as triangles (x, y pairs), with Canvas's caps
 * (`butt`, `round`, `square`) and joins (`miter` up to MITER_LIMIT, `bevel`, `round`).
 * Triangles overlap at joins; draw them so each pixel is covered once.
 */
export function strokeTriangles(paths, { width = 1, line_cap = 'butt', line_join = 'miter', tolerance = .25 } = {}) {
    const out = [], hw = width / 2;
    const tri = (ax, ay, bx, by, cx, cy) => out.push(ax, ay, bx, by, cx, cy);
    const disc = (x, y) => { const n = Math.max(8, arcSegments(hw, TAU, tolerance)); let px = x + hw, py = y; for (let i = 1; i <= n; i++) { const a = TAU * i / n, qx = x + hw * Math.cos(a), qy = y + hw * Math.sin(a); tri(x, y, px, py, qx, qy); px = qx; py = qy; } };
    for (const path of paths) {
        const p = [], src = path.points;
        for (let i = 0; i < src.length; i += 2) if (!p.length || src[i] !== p[p.length - 2] || src[i + 1] !== p[p.length - 1]) p.push(src[i], src[i + 1]);
        let closed = path.closed;
        if (closed && p.length >= 4 && p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) p.length -= 2;
        const n = p.length / 2; if (n < 2) continue; if (n === 2) closed = false;
        const segments = closed ? n : n - 1, dirs = [];
        for (let i = 0; i < segments; i++) { const ax = p[i * 2], ay = p[i * 2 + 1], j = (i + 1) % n, bx = p[j * 2], by = p[j * 2 + 1], l = Math.hypot(bx - ax, by - ay); dirs.push((bx - ax) / l, (by - ay) / l); }
        for (let i = 0; i < segments; i++) {
            const ax = p[i * 2], ay = p[i * 2 + 1], j = (i + 1) % n, bx = p[j * 2], by = p[j * 2 + 1], nx = -dirs[i * 2 + 1] * hw, ny = dirs[i * 2] * hw;
            tri(ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny); tri(ax - nx, ay - ny, bx - nx, by - ny, bx + nx, by + ny);
        }
        const first = closed ? 0 : 1, last = closed ? n : n - 1;
        for (let v = first; v < last; v++) {
            const x = p[v * 2], y = p[v * 2 + 1], a = (v - 1 + segments) % segments, b = v % segments;
            const d0x = dirs[a * 2], d0y = dirs[a * 2 + 1], d1x = dirs[b * 2], d1y = dirs[b * 2 + 1], cross = d0x * d1y - d0y * d1x, dot = d0x * d1x + d0y * d1y;
            if (Math.abs(cross) < 1e-9 && dot > 0) continue;
            if (line_join === 'round') { disc(x, y); continue; }
            const side = cross > 0 ? -1 : 1, n0x = -d0y * hw * side, n0y = d0x * hw * side, n1x = -d1y * hw * side, n1y = d1x * hw * side;
            tri(x, y, x + n0x, y + n0y, x + n1x, y + n1y);
            if (line_join === 'miter') {
                const mx = n0x + n1x, my = n0y + n1y, ml = Math.hypot(mx, my); if (ml < 1e-9) continue;
                const cosHalf = (mx * n0x + my * n0y) / (ml * hw); if (!(cosHalf > 1 / MITER_LIMIT)) continue;   // the miter is longer than the limit: bevel
                const k = hw / cosHalf / ml, tx = x + mx * k, ty = y + my * k;
                tri(x + n0x, y + n0y, tx, ty, x + n1x, y + n1y);
            }
        }
        if (!closed && line_cap !== 'butt') for (const [v, dir] of [[0, -1], [n - 1, 1]]) {
            const x = p[v * 2], y = p[v * 2 + 1], s = v === 0 ? 0 : segments - 1, dx = dirs[s * 2] * dir, dy = dirs[s * 2 + 1] * dir;
            if (line_cap === 'round') { disc(x, y); continue; }
            const nx = -dy * hw, ny = dx * hw, ex = x + dx * hw, ey = y + dy * hw;
            tri(x + nx, y + ny, x - nx, y - ny, ex + nx, ey + ny); tri(x - nx, y - ny, ex - nx, ey - ny, ex + nx, ey + ny);
        }
    }
    return new Float32Array(out);
}
