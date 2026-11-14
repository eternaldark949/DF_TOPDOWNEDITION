import { artScene, rect, linear } from '../../engine/basement/rendering/index.mjs';
import { entranceLamps, lampAt } from './city-entrance-lamps.mjs';

/**
 * The city's landmarks as stacks of tiers, each a prism of its own: any polygon plan, its own base z0 and
 * top z1 (design units, `z_scale` times taller in the world). A tier's walls are painted once as one strip
 * unrolled round its plan, by day and its light by night (the tier's `paint(day, lit, tier, H, L)`, two
 * artScenes in strip units: x along the plan from its first corner, y down from its top), and laid on each
 * face it turns to the camera in tiles (Basement `heightView.tiles`). Ledges are real slabs mitred round
 * the plan; each tier's roof is a picture in the plane of its top (`roof(art, emissive, tier, building)`),
 * what stands on it is drawn live (`top(art, emissive, tier, building, view, time)`).
 *
 * The definition (one per landmark, `city-landmark-*.mjs`) is `{plan: {W, D}, hero, facing, origin, tiers, ground, ground_area, shade, order, glow, lamps}`
 * (`origin`: where the plan's corner sits from the record's x, y; `shade`: `{offset, color}`, its own shade on the ground
 * in place of the usual one; `ground_area`: [x, y, w, h] in the plan, how far
 * its `ground(scene, building)` reaches; `glow(art, building, view, time)`: what it adds to its glow after its tiers):
 * each tier `{id, poly | rect: [x, y, w, h], z0, z1, on, fill, paint, roof, roof_glow, top, ledges: [{z,
 * out, th, top, band, lip}], shade: [r, g, b], solid, rise, lit_under}` (`lit_under`: its day strip shows faintly
 * under its light by night, at that alpha), laid out with its front at the bottom (+y);
 * facing 'N' turns it round. The classic kit is `legacy/buildings/tiered-kit.js`.
 */
/** A bay out of a wall at wy (a tier's plan): x0..x1 wide, straight cheeks `cheek` deep, then a half-polygon `depth` deep in n facets. */
export function bayPlan(x0, x1, wy, cheek, depth, n) {
    const cx = (x0 + x1) / 2, a = (x1 - x0) / 2, ey = wy + cheek, pts = [[x0, wy], [x0, ey]];
    for (let i = 1; i < n; i++) { const th = Math.PI - i * Math.PI / n; pts.push([cx + a * Math.cos(th), ey + depth * Math.sin(th)]); }
    pts.push([x1, ey], [x1, wy]);
    return pts;
}

export const TIER = { z_scale: 2, tile: [40, 14], chunk: [256, 24], error: .75, foot: 22, contact: 8, light: [-.78, .62] };

const rectPoly = (x, y, w, h) => [[x, y], [x, y + h], [x + w, y + h], [x + w, y]];
const signedArea = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const pathOf = pts => [...pts.map(([x, y], i) => [i ? 'line' : 'move', x, y]), ['close']];
function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
}
const boxOf = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };

export class tieredBuilding {
    constructor(record, index, def, look, tier = TIER) {
        const P = def.plan, N = def.facing === 'N', Z = tier.z_scale;
        const [ox, oy] = def.origin ?? [0, 0];
        Object.assign(this, { record, index, def, look, tier, id: record.id, x: record.x + ox, y: record.y + oy, hero: def.hero ?? 1, facing: N ? 'N' : 'S' });
        this.local = (x, y) => N ? [P.W - x, P.D - y] : [x, y];
        this.tiers = this.#geometry();
        this.faces = this.tiers.flatMap(t => t.faces);
        this.top = Math.max(...this.tiers.map(t => t.z1));
        this.floors = Math.min(look.max_floors, Math.ceil(this.top * Z / look.floor_height));
        this.H = this.top * Z;
        this.crown_z = record.look?.crown_z ?? this.H * this.hero;
        this.sections = record.look?.sections ?? [];
        this.bounds = boxOf(this.tiers.flatMap(t => t.poly));
        this.colors = record.look?.colors ?? {};
        const depth = this.floors * 3;
        this.groundBox = [this.bounds[0] - 80, this.bounds[1] - 80, this.bounds[2] + depth + 80, this.bounds[3] + depth + 120];
        if (def.ground_area) {
            const [gx, gy, gw, gh] = def.ground_area, g = boxOf([this.local(gx, gy), this.local(gx + gw, gy + gh)].map(([x, y]) => [this.x + x, this.y + y]));
            this.groundBox = [Math.min(this.groundBox[0], g[0]), Math.min(this.groundBox[1], g[1]), Math.max(this.groundBox[2], g[2]), Math.max(this.groundBox[3], g[3])];
        }
        this.reach = [this.bounds[0] - 1200, this.bounds[1] - 1200, this.bounds[2] + 1200, this.bounds[3] + 1200];
        this.strips = this.tiers.map(t => this.#strip(t));
        this.lamps = def.lamps ?? [];
    }

    /* ---------------- geometry: tiers in the world, their faces, mitres ---------------- */

    #geometry() {
        const tiers = this.def.tiers.map((d, i) => {
            let poly = (d.poly ?? rectPoly(...d.rect)).map(([x, y]) => { const [wx, wy] = this.local(x, y); return [this.x + wx, this.y + wy]; });
            if (signedArea(poly) > 0) poly = poly.slice().reverse();
            return { ...d, i, poly, box: boxOf(poly), faces: [] };
        });
        const byId = Object.fromEntries(tiers.map(t => [t.id, t]));
        for (const t of tiers) t.support = t.on ? byId[t.on] : null;
        for (const t of tiers) { let r = t; while (r.support) r = r.support; t.root = r; }
        for (const t of tiers) {
            let u = 0; const n = t.poly.length; t.mitre = [];
            for (let i = 0; i < n; i++) {
                const a = t.poly[i], b = t.poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
                if (L < .5) { t.mitre.push(null); continue; }
                const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, cuts = [0, 1], against = [];
                for (const o of tiers) {
                    if (o === t || o.z0 > t.z0 + .5) continue;
                    for (let j = 0; j < o.poly.length; j++) {
                        const p = o.poly[j], q = o.poly[(j + 1) % o.poly.length], Lo = Math.hypot(q[0] - p[0], q[1] - p[1]);
                        if (Lo < .5) continue;
                        const onx = -(q[1] - p[1]) / Lo, ony = (q[0] - p[0]) / Lo;
                        if (onx * nx + ony * ny > -.999) continue;
                        if (Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) > .5) continue;
                        const s = (x, y) => ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (L * L);
                        const s0 = Math.max(0, Math.min(s(...p), s(...q))), s1 = Math.min(1, Math.max(s(...p), s(...q)));
                        if (s1 - s0 < 1e-4) continue;
                        cuts.push(s0, s1); against.push([s0, s1, o.z1]);
                    }
                }
                cuts.sort((x, y) => x - y);
                for (let c = 0; c < cuts.length - 1; c++) {
                    const s0 = cuts[c], s1 = cuts[c + 1]; if (s1 - s0 < 1e-4) continue;
                    const m = (s0 + s1) / 2; let z0 = t.z0;
                    for (const [g0, g1, oz] of against) if (m > g0 && m < g1) z0 = Math.max(z0, oz);
                    if (z0 >= t.z1 - .5) continue;
                    t.faces.push({ tier: t, edge: i, x1: a[0] + (b[0] - a[0]) * s0, y1: a[1] + (b[1] - a[1]) * s0, x2: a[0] + (b[0] - a[0]) * s1, y2: a[1] + (b[1] - a[1]) * s1,
                        nx, ny, L: L * (s1 - s0), z0, z1: t.z1, u0: u + L * s0, atA: s0 < 1e-4, atB: s1 > 1 - 1e-4 });
                }
                t.mitre.push({ nx, ny, u0: u, L, hidden: !t.faces.some(f => f.edge === i) });
                u += L;
            }
            t.perimeter = u;
            t.ledgesByZ = (t.ledges ?? []).slice().sort((a, b) => a.z - b.z);
        }
        return tiers;
    }
    /** A tier's mitred offset of polygon vertex i, `out` from the wall. */
    mitre(t, i, out) {
        const n = t.poly.length, v = t.poly[i];
        let ia = (i - 1 + n) % n; while (!t.mitre[ia] && ia !== i) ia = (ia - 1 + n) % n;
        let fa = t.mitre[ia], fb = t.mitre[i] || fa;
        if (fa.hidden) fa = fb; else if (fb.hidden) fb = fa;
        let mx = fa.nx + fb.nx, my = fa.ny + fb.ny; const m = Math.hypot(mx, my);
        if (m < 1e-3) return [v[0] + fb.nx * out, v[1] + fb.ny * out];
        mx /= m; my /= m;
        const s = out / Math.max(.35, mx * fb.nx + my * fb.ny);
        return [v[0] + mx * s, v[1] + my * s];
    }
    /** How far a face turns from the moon (from the west and a little south): 0 lit .. 1 turned away. */
    turn(f) { const [lx, ly] = this.tier.light; return Math.max(0, Math.min(1, .5 - .5 * (f.nx * lx + f.ny * ly))); }

    /* ---------------- the view from the camera ---------------- */

    /** The view leaning as hard as this building. Heights given to it are world px (design units times z_scale). */
    view(base) { return base.leaning(this.hero); }
    /** The scale at design height z, and where (x, y) at design height z draws. */
    k(view, z) { return view.k(z * this.tier.z_scale); }
    at(view, x, y, z) { return view.at(x, y, z * this.tier.z_scale); }
    /** The tiers in drawing order: farthest group first (a tier and those on it), then lower tops first; the definition's `order(tiers, view, building)` may reorder them. */
    order(view) {
        const [cx, cy] = view.camera, dist = t => { const [x0, y0, x1, y1] = t.root.box, dx = Math.max(x0 - cx, 0, cx - x1), dy = Math.max(y0 - cy, 0, cy - y1); return dx * dx + dy * dy; };
        const order = this.tiers.slice().sort((a, b) => (dist(b) - dist(a)) || (a.z1 - b.z1) || (a.z0 - b.z0) || (a.i - b.i));
        return this.def.order?.(order, view, this) ?? order;
    }
    /** A tier's faces turned to the camera, farthest first. */
    seen(view, t) {
        const [cx, cy] = view.camera, d = f => Math.hypot(cx - (f.x1 + f.x2) / 2, cy - (f.y1 + f.y2) / 2);
        return t.faces.filter(f => (cx - (f.x1 + f.x2) / 2) * f.nx + (cy - (f.y1 + f.y2) / 2) * f.ny > 0).sort((a, b) => d(b) - d(a));
    }
    /** A tier on screen: the hull of its plan at its foot and its top (and its `rise`'s apex). */
    hull(view, t) {
        const pts = [];
        for (const [x, y] of t.poly) pts.push(this.at(view, x, y, t.z0), this.at(view, x, y, t.z1));
        if (t.rise) { let cx = 0, cy = 0; for (const [x, y] of t.poly) { cx += x / t.poly.length; cy += y / t.poly.length; } pts.push(this.at(view, cx, cy, t.z1 + t.rise)); }
        return hull(pts);
    }
    box(base) {
        const view = this.view(base), pts = this.tiers.flatMap(t => this.hull(view, t)), [x0, y0, x1, y1] = this.bounds, k = view.k(this.crown_z / this.hero);
        for (const s of this.lamps) { const [x, y] = lampAt(this, s); for (const [dx, dy] of [[-30, -30], [30, 50]]) pts.push(this.at(view, x + dx, y + dy, 0), this.at(view, x + dx, y + dy, s.z * 1.5 + 10)); }   // a lamp stands out in front, with its halo
        pts.push(view.scaled(x0, y0, k), view.scaled(x1, y1, k));
        return boxOf(pts);
    }
    silhouettes(base) { const view = this.view(base); return this.tiers.map(t => pathOf(this.hull(view, t))); }

    /* ---------------- walls: strips laid in tiles ---------------- */

    /**
     * A tier's strips (day and lit), painted once, as pictures in chunks along the strip: a whole long wall in one picture
     * would hold a tall building's every face at the view's density, and push the faces in view out of the cache.
     * Chunk c is `chunk[0]` long and reaches `chunk[1]` past each end, so a tile (never longer than that) lies whole in one.
     * The art behind them (x along the plan from its first corner, y down from its top) is made once for all of them.
     */
    #strip(t) {
        const Z = this.tier.z_scale, H = t.z1 - t.z0, L = t.perimeter, [CH, PAD] = this.tier.chunk, key = `city_tier:${this.id}:${t.i}`;
        let art = null;
        // painted in design units, kept in world px up the wall: a strip kept in design units would need z_scale times the density round its whole length
        const made = () => { if (!art) { const d = new artScene().enter({ scale: [1, Z] }), l = new artScene().enter({ scale: [1, Z] }); t.paint?.(d, l, t, H, L, this); art = { day: d.leave().finish(), lit: l.leave().finish() }; } return art; };
        const chunks = (lit, name) => Array.from({ length: Math.max(1, Math.ceil(L / CH)) }, (_, c) => {
            const u0 = Math.max(0, c * CH - PAD), u1 = Math.min(L, (c + 1) * CH + PAD);
            return { key: `${key}:${name}:${c}`, bounds: [u0, 0, u1 - u0, H * Z], ...(lit ? { layered: true } : {}), build: () => made()[name] };   // (a lit strip's cut-outs act on its own light)
        });
        return { day: chunks(false, 'day'), lit: chunks(true, 'lit') };
    }
    /** A face's slice of its tier's strip, as stamps in tiles, each from the chunk its middle falls in; none for a tile off `area` (the screen's {left, top, right, bottom}). */
    #lay(view, f, strip, zoom, area, extra = {}) {
        const Z = this.tier.z_scale, out = [], overlap = extra.blend || extra.opacity !== undefined ? .25 : 1;
        for (const tile of view.tiles(f, f.z0 * Z, f.z1 * Z, { zoom, error: this.tier.error, max: [this.tier.tile[0], this.tier.tile[1] * Z], overlap })) {
            const m = tile.matrix, matrix = [m[0], m[1], m[2], m[3], m[4] - f.u0 * m[0], m[5] - f.u0 * m[1]], u0 = f.u0 + tile.u0, u1 = f.u0 + tile.u1;
            if (area) {
                const y0 = f.z1 * Z - tile.z1, y1 = f.z1 * Z - tile.z0, xs = [], ys = [];
                for (const [u, y] of [[u0, y0], [u1, y0], [u0, y1], [u1, y1]]) { xs.push(matrix[0] * u + matrix[2] * y + matrix[4]); ys.push(matrix[1] * u + matrix[3] * y + matrix[5]); }
                if (Math.max(...xs) < area.left || Math.min(...xs) > area.right || Math.max(...ys) < area.top || Math.min(...ys) > area.bottom) continue;
            }
            const chunk = strip[Math.min(strip.length - 1, Math.floor((u0 + u1) / 2 / this.tier.chunk[0]))];
            out.push({ picture: { ...chunk, matrix, source: [u0, f.z1 * Z - tile.z1, u1 - u0, tile.z1 - tile.z0] }, ...extra });
        }
        return out;
    }
    /** A box standing on a roof, for a tier's `top`: x0..x1, y0..y1 from design height z0 to z1, the walls turned to the camera (shaded by their side), then its cap. */
    prism(art, view, x0, y0, x1, y1, z0, z1, wall, cap) {
        const [cx, cy] = view.camera, walls = [];
        if (cy > y1) walls.push([x0, y1, x1, y1, 0]); if (cy < y0) walls.push([x1, y0, x0, y0, .3]);
        if (cx > x1) walls.push([x1, y1, x1, y0, .15]); if (cx < x0) walls.push([x0, y0, x0, y1, .15]);
        for (const [ax, ay, bx, by, s] of walls) {
            const q = pathOf([this.at(view, ax, ay, z0), this.at(view, bx, by, z0), this.at(view, bx, by, z1), this.at(view, ax, ay, z1)]);
            art.fill(q, wall); if (s) art.fill(q, `rgba(0, 0, 0, ${s})`);
        }
        art.enter({ matrix: view.plane(this.k(view, z1)) }).fill(rect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3), cap).leave();
    }
    quad(view, f, z0, z1) { return pathOf([this.at(view, f.x1, f.y1, z0), this.at(view, f.x2, f.y2, z0), this.at(view, f.x2, f.y2, z1), this.at(view, f.x1, f.y1, z1)]); }

    /** The building over the people: each tier's walls, shade and ledges, its roof, what stands on it. */
    draws(base, { zoom = 1, time = 0, area = null } = {}) {
        const view = this.view(base), out = [], Z = this.tier.z_scale;
        for (const t of this.order(view)) {
            const faces = this.seen(view, t), sh = t.shade ?? [6, 16, 18], strip = this.strips[t.i];
            for (const f of faces) {
                const under = new artScene(); under.fill(this.quad(view, f, f.z0, f.z1), t.fill ?? '#555'); out.push(...under.finish());
                out.push(...this.#lay(view, f, strip.day, zoom, area));
                const art = new artScene();
                art.fill(this.quad(view, f, f.z0, f.z1), `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, ${.03 + .4 * this.turn(f)})`);
                const fz = f.z0 < 1 ? this.tier.foot / Z : this.tier.contact, z0 = f.z0 < 1 ? 0 : f.z0, c0 = f.z0 < 1 ? `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, 0.35)` : 'rgba(0, 0, 0, 0.3)', c1 = f.z0 < 1 ? `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, 0)` : 'rgba(0, 0, 0, 0)';
                const A = this.at(view, f.x1, f.y1, z0), B = this.at(view, f.x1, f.y1, z0 + fz);
                if (Math.hypot(B[0] - A[0], B[1] - A[1]) > 1e-3) art.paint(this.quad(view, f, z0, z0 + fz), { fill: linear(A, B, [[0, c0], [1, c1]]) });
                out.push(...art.finish());
            }
            const ledges = new artScene(); for (const g of t.ledgesByZ) this.#ledge(view, ledges, t, faces, g); out.push(...ledges.finish());
            if (t.roof) out.push({ picture: this.#roof(view, t, false) });
            if (t.top) { const art = new artScene(); t.top(art, false, t, this, view, time); out.push(...art.finish()); }
        }
        if (this.lamps.length) { const art = new artScene(); entranceLamps(art, this, view, this.lamps, false); out.push(...art.finish()); }   // the entrance lamps stand in front of its walls
        return out;
    }
    /** A ledge round a tier at its height along the faces seen: mitred slabs, each front shaded by its turn. */
    #ledge(view, art, t, faces, g) {
        const n = t.poly.length, kT = this.k(view, g.z), kB = this.k(view, Math.max(t.z0, g.z - g.th)), [r, gg, b] = g.band;
        for (const f of faces) {
            if (g.z <= f.z0 + .5 || g.z > f.z1 + .5) continue;
            const i = f.edge, s = 1 - .5 * this.turn(f);
            const oa = f.atA ? this.mitre(t, i, g.out) : [f.x1 + f.nx * g.out, f.y1 + f.ny * g.out], ob = f.atB ? this.mitre(t, (i + 1) % n, g.out) : [f.x2 + f.nx * g.out, f.y2 + f.ny * g.out];
            const wa = f.atA ? t.poly[i] : [f.x1, f.y1], wb = f.atB ? t.poly[(i + 1) % n] : [f.x2, f.y2];
            const A = view.scaled(...oa, kB), B = view.scaled(...ob, kB), Bt = view.scaled(...ob, kT), At = view.scaled(...oa, kT), a1 = view.scaled(...wa, kT), b1 = view.scaled(...wb, kT);
            art.fill(pathOf([A, B, Bt, At]), `rgb(${Math.round(r * s)}, ${Math.round(gg * s)}, ${Math.round(b * s)})`);
            art.fill(pathOf([a1, b1, Bt, At]), g.top);
            if (g.lip) art.enter({}, { opacity: 1 - .6 * this.turn(f) }).stroke([['move', ...At], ['line', ...Bt]], g.lip, .8).leave();
            art.stroke([['move', ...A], ['line', ...B]], 'rgba(6, 12, 14, 0.45)', 1);
        }
    }
    /** A tier's roof as a picture in the plane of its top (world coordinates, a margin round its plan). */
    #roof(view, t, emissive) {
        const [x0, y0, x1, y1] = t.box, m = 16;
        return { key: `city_tier_roof:${this.id}:${t.i}:${emissive ? 'lit' : 'day'}`, bounds: [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m], matrix: view.plane(this.k(view, t.z1)),
            build: () => { const art = new artScene(); t.roof(art, emissive, t, this); return art.finish(); } };
    }

    /* ---------------- the night light ---------------- */

    /** How strongly the tiers' light shows: 12% at the least once the sky starts to darken, none in full day. */
    glowStrength(dark) { return Math.max(.12, Math.min(.92, dark * 1.05)) * Math.min(1, Math.max(0, dark) / .12); }
    /** The lit strips, roofs and tops, tier by tier in drawing order, for the glow layer (`cityBuildings.createGlow`): each tier first erases the glow behind it. */
    glowDraws(base, { zoom = 1, time = 0, dark = 1, area = null } = {}) {
        const glow = this.glowStrength(dark); if (glow < .004) return [];
        const view = this.view(base), out = [];
        for (const t of this.order(view)) {
            const art = new artScene(); art.enter({}, { blend: 'destination-out' }).fill(pathOf(this.hull(view, t)), '#000').leave(); out.push(...art.finish());
            if (t.lit_under) for (const f of this.seen(view, t)) out.push(...this.#lay(view, f, this.strips[t.i].day, zoom, area, { opacity: glow * t.lit_under }));
            for (const f of this.seen(view, t)) out.push(...this.#lay(view, f, this.strips[t.i].lit, zoom, area, { blend: 'add', opacity: glow }));
            if (t.roof && t.roof_glow) out.push({ picture: this.#roof(view, t, true), blend: 'add', opacity: glow });
            if (t.top) { const top = new artScene(); top.enter({}, { blend: 'add', opacity: glow }); t.top(top, true, t, this, view, time); top.leave(); out.push(...top.finish()); }
        }
        if (this.def.glow) { const art = new artScene(); art.enter({}, { blend: 'add', opacity: glow }); this.def.glow(art, this, view, time); art.leave(); out.push(...art.finish()); }
        if (this.lamps.length) { const art = new artScene(); art.enter({}, { blend: 'add' }); entranceLamps(art, this, view, this.lamps, true, glow); art.leave(); out.push(...art.finish()); }
        return out;
    }

    /* ---------------- the ground ---------------- */

    ground(scene) {
        const depth = this.floors * 3, shade = this.def.shade;
        if (shade) for (const s of this.sections) scene.fill(rect(s.x + shade.offset[0], s.y + shade.offset[1], s.w, s.h), shade.color);
        else {
            for (const s of this.sections) scene.fill(rect(s.x + depth, s.y + depth, s.w, s.h), 'rgba(0, 0, 0, 0.5)');
            for (const s of this.sections) scene.fill(rect(s.x - 5, s.y - 5, s.w + 10, s.h + 10), 'rgba(10, 10, 15, 0.3)');
        }
        this.def.ground?.(scene, this);
    }
}
