import LOOK from '../data/city-foliage.json' with { type: 'json' };
import { artScene, circle, ellipse, radial, heightView, depthBatches } from '../../engine/basement/rendering/index.mjs';

/**
 * The city's plants as art, from its exported foliage: trees (the green ones and the dream trees in
 * blossom), bushes and palms, swaying in the wind. A bush is its canopy picture on the ground. A tree or
 * palm stands up toward the camera like a building (Basement `heightView`): its trunk is a ring of bark
 * faces, a tree's boughs carry canopy pictures leaned to their height, a palm's fronds droop from its crown.
 * The faces of every plant in view are painted lowest first, kept off the roofs of taller buildings that
 * lean over them.
 *
 * `createDraws({view, camera, zoom, time, wind, direction, sun, covers})` gives packets and picture
 * entries (`canvasRenderer.drawEntries`), to draw over the buildings. `covers` ({z, polygon} each, from
 * `cityBuildings.covers`) are the roofs that may stand in front of a plant: one taller than the plant
 * keeps it behind; `sun` true leaves the shadows to a sun shadow layer.
 * The look is `data/city-foliage.json`; the classic artist is `legacy/entities/street-objects.js` (Foliage).
 */

/** The classic seeded random (FNV over the seed's text, then mulberry32), so the canopies match. */
function classicRandom(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const CLEAR = 'rgba(0,0,0,0)';

/** The canopy picture for a kind at a size (bucketed to 0.2), one of 4 variants, centred on 0. */
export function canopyPicture(type, size, variant, look = LOOK) {
    const sz = Math.round(size * 5) / 5, palm = type === 'palm', bush = type === 'bush';
    const R = look.canopy_r[palm ? 'palm' : bush ? 'bush' : 'tree'] * sz, W = Math.ceil(R * 2.6 + 6);
    return { key: `flora:${type}|${sz}|${variant}`, bounds: [-W / 2, -W / 2, W, W], width: W, build: () => canopyArt(type, sz, variant, R, look) };
}
function canopyArt(type, sz, variant, R, look) {
    const K = look.kinds[type] ?? look.kinds.tree, rnd = classicRandom(variant * 977 + Math.round(sz * 100) + type.length * 31), art = new artScene();
    if (type === 'palm') {
        const n = 8 + (variant % 2);
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + rnd() * 0.3, len = R * (0.85 + rnd() * 0.3);
            art.enter({ rotation: a });
            art.fill([['move', 0, 0], ['quadratic', len * 0.45, -len * 0.22, len, 0], ['quadratic', len * 0.45, len * 0.22, 0, 0], ['close']], i % 2 ? K.mid : K.base);
            art.enter({}, { opacity: 0.5 }).stroke([['move', 2, 0], ['line', len * 0.95, 0]], K.hi, 0.8).leave();
            const ribs = [];
            for (let t = 0.2; t < 0.9; t += 0.12) ribs.push(['move', len * t, 0], ['line', len * (t + 0.06), len * 0.12 * (1 - t)], ['move', len * t, 0], ['line', len * (t + 0.06), -len * 0.12 * (1 - t)]);
            art.stroke(ribs, K.dark, 0.6);
            art.leave();
        }
        art.fill([circle(0, 0, R * 0.16)], '#4a3420');
        return art.finish();
    }
    const lumps = type === 'bush' ? 5 : 8;
    art.fill([circle(1, 1, R * 1.02)], K.dark);
    for (let i = 0; i < lumps; i++) {
        const a = i / lumps * Math.PI * 2 + rnd() * 0.5, d = R * (0.45 + rnd() * 0.15), r = R * (0.48 + rnd() * 0.12);
        art.fill([circle(Math.cos(a) * d, Math.sin(a) * d, r)], K.base);
    }
    art.fill([circle(0, 0, R * 0.62)], K.base);
    for (let i = 0; i < lumps; i++) {
        const a = i / lumps * Math.PI * 2 + 0.4, d = R * 0.38, r = R * 0.36, x = Math.cos(a) * d, y = Math.sin(a) * d;
        art.paint([circle(x, y, r)], { fill: radial([x - r * 0.35, y - r * 0.35], 1, [x, y], r, [[0, K.mid], [1, CLEAR]]) });
    }
    art.enter({}, { opacity: 0.55 }).paint([circle(0, 0, R)], { fill: radial([-R * 0.4, -R * 0.45], 1, [-R * 0.2, -R * 0.2], R * 0.9, [[0, K.hi], [1, CLEAR]]) }).leave();
    art.paint([circle(0, 0, R)], { fill: radial([R * 0.5, R * 0.55], 1, [R * 0.4, R * 0.45], R * 0.9, [[0, 'rgba(0,0,0,0.35)'], [1, CLEAR]]) });
    art.enter({}, { opacity: 0.35 });
    for (let i = 0; i < R * 4; i++) {                                                          // leaf grain
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.95, x = Math.cos(a) * d, y = Math.sin(a) * d;
        art.fill([['move', x, y], ['line', x + 1.4, y], ['line', x + 1.4, y + 1.4], ['line', x, y + 1.4], ['close']], rnd() < 0.5 ? K.hi : K.dark);
    }
    art.leave();
    if (K.petals) for (let i = 0; i < R * 2; i++) {                                            // blossom, heavier toward the light
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.92, x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (x + y > R * 0.5 && rnd() < 0.6) continue;
        const o = 0.55 + rnd() * 0.4, colour = K.petals[Math.floor(rnd() * K.petals.length)];
        art.enter({}, { opacity: o }).fill([circle(x, y, 0.7 + rnd() * 0.9)], colour).leave();
    }
    return art.finish();
}

/** Is a side face, given as flat points [a_i, a_j, b_j, b_i], turned to the camera (by its winding)? */
const facing = pts => { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a > 0; };
const boxOf = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const BOXES = new WeakMap(), boxOfPoly = poly => { let b = BOXES.get(poly); if (!b) BOXES.set(poly, b = boxOf(poly)); return b; };
const meets = (a, b) => !(a[0] >= b[2] || a[2] <= b[0] || a[1] >= b[3] || a[3] <= b[1]);
const outside = poly => [['move', -1e7, -1e7], ['line', 1e7, -1e7], ['line', 1e7, 1e7], ['line', -1e7, 1e7], ['close'], ...poly.map(([x, y], i) => [i ? 'line' : 'move', x, y]), ['close']];

export class cityFoliage {
    #look; #plants; #cells = new Map(); #canopies = new Map();
    #canopy(type, size, variant) { const key = `${type}|${Math.round(size * 5)}|${variant}`; let c = this.#canopies.get(key); if (!c) this.#canopies.set(key, c = canopyPicture(type, size, variant, this.#look)); return c; }
    constructor(city, { look = LOOK } = {}) {
        this.#look = look;
        this.#plants = (city.foliage ?? []).filter(f => Object.hasOwn(look.kinds, f.type) && f.size > 0).map((f, index) => ({
            ...f, index, variant: Math.floor(f.phase_offset * 0.637) % 4, phase: f.phase_offset, swing: f.sway_multiplier, trunk: f.trunk_color
        }));
        for (const p of this.#plants) { const key = `${Math.floor(p.x / 1024)},${Math.floor(p.y / 1024)}`; let list = this.#cells.get(key); if (!list) this.#cells.set(key, list = []); list.push(p); }
    }
    get plants() { return this.#plants; }
    #height(p) { const H = this.#look.height; return (H[p.type] ?? H.tree) * p.size; }
    /** The plants whose shadow, canopy or leaned crown may show in `view`, in map order. */
    visible(view, camera, eye) {
        const base = new heightView({ camera, eye }), out = [];
        const x0 = Math.floor((view.left - 300) / 1024), x1 = Math.floor((view.right + 300) / 1024), y0 = Math.floor((view.top - 300) / 1024), y1 = Math.floor((view.bottom + 300) / 1024);
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const p of this.#cells.get(`${cx},${cy}`) ?? []) {
            const z = this.#height(p) + 12 * p.size, k = base.k(z), [tx, ty] = base.scaled(p.x, p.y, k), r = 55 * p.size * k;
            if (Math.min(p.x, tx) - r <= view.right && Math.max(p.x, tx) + r >= view.left && Math.min(p.y, ty) - r <= view.bottom && Math.max(p.y, ty) + r >= view.top) out.push(p);
        }
        return out.sort((a, b) => a.index - b.index);
    }
    /**
     * The plants in view: shadows (unless `sun`) and bushes first, then every trunk face, bough, canopy and
     * frond lowest first, kept behind the `covers` taller than each.
     */
    createDraws({ view, camera, zoom = 1, eye = 700 * Math.max(.7, Math.min(3.2, 1 / zoom)), time = 0, wind = .5, direction = 1, sun = false, covers = [] }) {
        const L = this.#look, base = new heightView({ camera, eye }), out = [], ground = new artScene(), items = [];
        for (const p of this.visible(view, camera, eye)) {
            const s = p.size, palm = p.type === 'palm', bush = p.type === 'bush';
            const sway = Math.sin(time * L.sway.rate + p.phase) * wind * L.sway.reach * p.swing * direction;
            const cx = p.x + sway * (bush ? 0.6 : palm ? 0.3 : 1), cy = p.y - (bush ? 2 : 0) * s;
            if (!sun) { const r = (L.shadow_r[p.type] ?? L.shadow_r.tree) * s; ground.fill([ellipse(cx + 3 * s, cy + 4 * s, r, r * 0.82)], L.shadow); }
            if (bush) { const c = this.#canopy(p.type, s, p.variant); out.push(...ground.finish().splice(0), { picture: { key: c.key, bounds: c.bounds, matrix: [1, 0, 0, 1, cx, cy], build: c.build } }); continue; }
            this.#stand(p, base, sway * (palm ? .3 : 1), covers, items);
        }
        out.push(...ground.finish());
        let art = new artScene();
        for (const group of depthBatches(items)) {
            const first = group[0];
            if (first.kind === 'picture') { out.push(...art.finish()); art = new artScene(); out.push({ picture: first.picture, clips: first.clip.map(poly => ({ geometry: { type: 'path', commands: outside(poly), fill_rule: 'evenodd' } })) }); continue; }
            const shape = []; for (const it of group) for (const c of it.shape) shape.push(c);
            art.enter(); for (const poly of first.clip) art.clip(outside(poly), { rule: 'evenodd' });
            if (first.kind === 'fill') art.fill(shape, first.colour); else art.stroke(shape, first.colour, first.width);
            art.leave();
        }
        out.push(...art.finish());
        return out;
    }
    /** A tree's or palm's faces, each with its height, into `items`. */
    #stand(p, base, sway, covers, items) {
        const L = this.#look, s = p.size, H = this.#height(p), palm = p.type === 'palm';
        const point = (x, y, z) => base.at(p.x + x + sway * z / H, p.y + y, z);
        let clip = [];
        if (covers.length) {
            const top = point(0, 0, H + 12 * s), r = 50 * s * base.k(H + 12 * s), reach = [Math.min(p.x, top[0]) - r, Math.min(p.y, top[1]) - r, Math.max(p.x, top[0]) + r, Math.max(p.y, top[1]) + r];
            clip = covers.filter(c => c.z >= H + 12 * s && meets(reach, boxOfPoly(c.polygon))).map(c => c.polygon);
        }
        const add = (kind, z, pts, colour, width, closed, convex = false) => {
            const box = boxOf(pts), kept = clip.filter(poly => meets(box, boxOfPoly(poly)));
            const shape = pts.map(([x, y], i) => [i ? 'line' : 'move', x, y]); if (closed) shape.push(['close']);
            items.push({ kind, z, box, convex: convex ? pts : null, key: `${kind}|${colour}|${width}|${kept.map(poly => clip.indexOf(poly)).join(',')}`, colour, width, shape, clip: kept });
        };
        const bark = [p.trunk, ...L.bark];
        // The trunk: a tapered ring of bark faces in stretches 8 high. Each column of faces turned to the camera
        // is painted as one strip until something of this plant sits between its stretches (a ring, a bough).
        const levels = [0, 14 * s], radius = z => z <= 14 * s ? 5 * s - 2 * s * z / (14 * s) : 3 * s - (z - 14 * s) / (H - 14 * s) * 1.4 * s;
        for (let z = 14 * s; z < H; z += 8) levels.push(Math.min(H, z + 8));
        const rings = levels.map(z => { const r = radius(z); return Array.from({ length: 6 }, (_, i) => point(Math.cos(i * Math.PI / 3) * r, Math.sin(i * Math.PI / 3) * r, z)); });
        const breaks = palm ? (() => { const out = []; for (let z = 20 * s; z < H; z += 13 * s) out.push(z); return out; })() : [H - 16 * s, H - 9 * s, H + 9 * s];
        const band = z => breaks.filter(b => b <= z).length;
        for (let i = 0, j = 1; i < 6; i++, j = (i + 1) % 6) {
            let from = -1;
            const flush = to => { if (from < 0) return; const pts = []; for (let l = from; l <= to + 1; l++) pts.push(rings[l][i]); for (let l = to + 1; l >= from; l--) pts.push(rings[l][j]); add('fill', (levels[to] + levels[to + 1]) / 2, pts, bark[i], 0, true, from === to); from = -1; };
            for (let l = 0; l + 1 < levels.length; l++) {
                const shown = facing([rings[l][i], rings[l][j], rings[l + 1][j], rings[l + 1][i]]);
                if (from >= 0 && (!shown || band((levels[l] + levels[l + 1]) / 2) !== band((levels[from] + levels[from + 1]) / 2))) flush(l - 1);
                if (shown && from < 0) from = l;
            }
            flush(levels.length - 2);
        }
        if (palm) {
            for (let z = 20 * s; z < H; z += 13 * s) {
                const [x, y] = point(0, 0, z), k = base.k(z), rx = 2.4 * s * k, ry = 1.5 * s * k, pts = [];
                for (let i = 0; i < 24; i++) pts.push([x + Math.cos(i / 24 * Math.PI * 2) * rx, y + Math.sin(i / 24 * Math.PI * 2) * ry]);
                add('stroke', z, pts, L.palm_ring, 1, true);
            }
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4 + p.phase * .2, pts = [], ca = Math.cos(a), sa = Math.sin(a);
                for (let j = 0; j <= 12; j++) { const u = j / 12, d = 29 * s * u, w = 5 * s * Math.sin(u * Math.PI); pts.push({ x: ca * d - sa * w, y: sa * d + ca * w, z: H + 12 * s * Math.sin(u * Math.PI) - 14 * s * u }); }
                for (let j = 12; j >= 0; j--) { const u = j / 12, d = 29 * s * u, w = 5 * s * Math.sin(u * Math.PI); pts.push({ x: ca * d + sa * w, y: sa * d - ca * w, z: H + 12 * s * Math.sin(u * Math.PI) - 14 * s * u }); }
                add('fill', pts.reduce((t, q) => t + q.z, 0) / pts.length, pts.map(q => point(q.x, q.y, q.z)), L.palm_fronds[i % 2], 0, true);
                add('stroke', (2 * H - 14 * s) / 2, [point(0, 0, H), point(ca * 29 * s, sa * 29 * s, H - 14 * s)], L.palm_rib, .8 * s, false);
            }
            return;
        }
        const boughs = Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5 + p.phase; return { x: Math.cos(a) * 12 * s, y: Math.sin(a) * 12 * s, z: H - (i % 2 ? 16 : 9) * s, size: s * .62 }; });
        boughs.push({ x: 0, y: 0, z: H + 9 * s, size: s * .72 });
        for (const b of boughs) add('stroke', (H * .62 + b.z) / 2, [point(0, 0, H * .62), point(b.x, b.y, b.z)], p.trunk, 2.5 * s, false);
        boughs.sort((a, b) => a.z - b.z);
        boughs.forEach((b, i) => {
            const [x, y] = point(b.x, b.y, b.z), k = base.k(b.z), c = this.#canopy(p.type, b.size, (p.variant + i) % 4), half = c.width * k / 2;
            const kept = clip.filter(poly => meets([x - half, y - half, x + half, y + half], boxOfPoly(poly)));
            items.push({ kind: 'picture', z: b.z, box: [x - half, y - half, x + half, y + half], key: null, picture: { key: c.key, bounds: c.bounds, matrix: [k, 0, 0, k, x, y], build: c.build }, clip: kept });
        });
    }
}
