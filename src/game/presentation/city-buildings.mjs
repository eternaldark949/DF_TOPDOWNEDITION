import LOOK from '../data/city-buildings.json' with { type: 'json' };
import { artScene, rect, circle, ellipse, linear, radial, heightView, boxFaces, measureText } from '../../engine/basement/rendering/index.mjs';
import { buildingHash, darken, lighten, alpha, rgbOf, boxPath, dotPath, moveLine, fillIf, strokeIf } from './city-building-art.mjs';
import { streetShop } from './city-street-shops.mjs';
import { streetArcade } from './city-street-arcade.mjs';
import { streetApartment } from './city-street-apartments.mjs';

/**
 * The city's street buildings as art, from the looks its generator resolved (the `look` of each exported
 * building): leaned walls with their windows and street fronts, roofs, and at night their lights. A
 * building leans away from the camera as it rises (Basement `heightView`): its walls are drawn live each
 * frame from where the camera is, its roof is one picture in the plane of its height, painted once and
 * stamped under the lean's scale, shared by every building of the same street variant and size.
 *
 * `createDraws({view, camera, zoom, time})` gives the buildings over the people, farthest first, as packets
 * and picture entries (`canvasRenderer.drawEntries`). `createGlow({view, camera, zoom, time, dark})` gives
 * what shines after the light layer (lit windows, shopfronts, signs, roof lights), each building kept off
 * the nearer ones in front of it. `groundArt(scene, tile)` adds what lies on the ground (the buildings'
 * shadows and footprints, the street variants' stoops, carpets and planters) to a ground tile.
 * The look is `data/city-buildings.json`; the classic artists are `legacy/buildings/building-v2.js` and
 * `street-*.js`.
 */
export class cityBuildings {
    #look; #houses; #cells = new Map();
    constructor(city, { look = LOOK } = {}) {
        this.#look = look;
        this.#houses = city.buildings.map((record, index) => record.kind === 'BuildingV2' && record.look ? new house(record, index, look) : null).filter(Boolean);
        for (const h of this.#houses) for (const key of cellsOf(h.reach)) { let list = this.#cells.get(key); if (!list) this.#cells.set(key, list = []); list.push(h); }
    }
    get houses() { return this.#houses; }
    /** The camera's eye height at `zoom` (zoomed out, the camera rises so heights keep with footprints). */
    eye(zoom = 1) { const E = this.#look.eye; return E.height * Math.max(E.min, Math.min(E.max, E.ref_zoom / zoom)); }
    /** The buildings whose walls or roof may show in `view` from `camera`, farthest first. */
    visible(view, camera, zoom = 1) {
        const base = new heightView({ camera, eye: this.eye(zoom) }), seen = new Set(), out = [];
        for (const key of cellsOf([view.left - 400, view.top - 400, view.right + 400, view.bottom + 400])) for (const h of this.#cells.get(key) ?? []) {
            if (seen.has(h)) continue; seen.add(h);
            const [L, T, R, B] = h.box(base);
            if (R < view.left || L > view.right || B < view.top || T > view.bottom) continue;
            const dx = Math.max(h.bounds[0] - camera[0], 0, camera[0] - h.bounds[2]), dy = Math.max(h.bounds[1] - camera[1], 0, camera[1] - h.bounds[3]);
            out.push({ h, dist: dx * dx + dy * dy, height: Math.max(h.floors, h.crown_z / this.#look.floor_height) });
        }
        return out.sort((a, b) => (b.dist - a.dist) || (a.height - b.height) || (a.h.index - b.h.index)).map(e => e.h);
    }
    /** Every building over the people, farthest first: packets and roof pictures, in paint order. */
    createDraws({ view, camera, zoom = 1, time = 0 }) {
        const base = new heightView({ camera, eye: this.eye(zoom) }), out = [];
        for (const h of this.visible(view, camera, zoom)) {
            const ctx = h.context(base, time), art = new artScene();
            h.walls(ctx, art);
            out.push(...art.finish(), h.roofPicture(ctx));
            const live = new artScene(); h.roofLive(ctx, live); out.push(...live.finish());
        }
        return out;
    }
    /** What shines after the light layer, building by building, each kept off the nearer ones' walls and roofs. */
    createGlow({ view, camera, zoom = 1, time = 0, dark = 1 }) {
        const base = new heightView({ camera, eye: this.eye(zoom) }), order = this.visible(view, camera, zoom), boxes = order.map(h => h.box(base)), art = new artScene();
        order.forEach((h, i) => {
            const bb = boxes[i];
            art.enter();
            for (let j = i + 1; j < order.length; j++) {
                const o = boxes[j];
                if (o[0] > bb[2] || o[2] < bb[0] || o[1] > bb[3] || o[3] < bb[1]) continue;
                for (const poly of order[j].silhouettes(base)) art.clip([...rect(-1e7, -1e7, 2e7, 2e7), ...poly], { rule: 'evenodd' });
            }
            h.glow(h.context(base, time, dark), art);
            art.leave();
        });
        return art.finish();
    }
    /** Adds the buildings' ground (shadows, footprints, the street variants' pavement dressing) meeting `tile` [x, y, w, h] to `scene`. */
    groundArt(scene, [x, y, w, h]) {
        const tile = [x, y, x + w, y + h], seen = new Set();
        for (const key of cellsOf(tile)) for (const b of this.#cells.get(key) ?? []) {
            if (seen.has(b)) continue; seen.add(b);
            const g = b.groundBox;
            if (g[2] < tile[0] || g[0] > tile[2] || g[3] < tile[1] || g[1] > tile[3]) continue;
            b.ground(scene);
        }
        return scene;
    }
}

const CELL = 1024, WIDTHS = new Map();
function* cellsOf([x0, y0, x1, y1]) { for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let y = Math.floor(y0 / CELL); y <= Math.floor(y1 / CELL); y++) yield x * 65536 + y; }
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const VARIANTS = { shop: streetShop, arcade: streetArcade, apt: streetApartment };

/** Its front's frame: x along the front (left to right, seen from the street), y in from the back, the front at y = fd. */
function frameOf(facing, W, D) {
    switch (facing) {
        case 'N': return { fw: W, fd: D, m: [-1, 0, 0, -1, W, D] };
        case 'E': return { fw: D, fd: W, m: [0, -1, 1, 0, 0, D] };
        case 'W': return { fw: D, fd: W, m: [0, 1, -1, 0, W, 0] };
        default: return { fw: W, fd: D, m: [1, 0, 0, 1, 0, 0] };
    }
}

/** One street building: its geometry, picks and look, and the artists for its variant. */
class house {
    constructor(record, index, look) {
        const L = record.look;
        Object.assign(this, { record, index, look, id: record.id, style: record.style ?? null, facing: record.facing ?? 'S', floors: Math.min(record.floors ?? 8, look.max_floors) });
        this.sections = L.sections; this.colors = L.colors; this.sills = L.sills ?? null; this.seed = L.window_seed; this.style_seed = record._seed ?? 1;
        this.roof_features = L.roof_features ?? []; this.entrance = L.entrance ?? null; this.hero = L.lean_hero ?? 1; this.crown_z = L.crown_z ?? 0;
        this.H = this.floors * look.floor_height;
        this.faces = boxFaces(this.sections);
        const xs = this.sections.flatMap(s => [s.x, s.x + s.w]), ys = this.sections.flatMap(s => [s.y, s.y + s.h]);
        this.bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        this.front = this.#frontGeo();
        const v = L.variant;
        if (v) {
            const s = this.sections[0], F = frameOf(this.facing, s.w, s.h), g = this.front, E = this.entrance ?? g, along = (E.cx - g.cx) * g.ux + (E.cy - g.cy) * g.uy;
            this.frame = { ...F, ox: s.x, oy: s.y, door: F.fw / 2 + (this.facing === 'N' || this.facing === 'E' ? -along : along), side: this.facing === 'N' || this.facing === 'E' ? -1 : 1 };
            this.variant = { ...v, spec: v.kind === 'shop' ? look.shops[v.id] : look.apts[v.id], st: v.kind === 'apt' ? look.apt_kit[v.id] : null };
            this.artist = VARIANTS[v.kind === 'apt' ? 'apt' : v.id === 'arcade' ? 'arcade' : 'shop'];
        }
        const depth = this.floors * 3, base = this.artist?.groundReach ?? 0;
        this.groundBox = [this.bounds[0] - 60, this.bounds[1] - 60, this.bounds[2] + depth + 60, this.bounds[3] + depth + 60 + base];
        this.reach = [this.bounds[0] - 1200, this.bounds[1] - 1200, this.bounds[2] + 1200, this.bounds[3] + 1200];
    }
    /** The middle of the facing wall of the section furthest out that way, its outward normal and the wall's direction. */
    #frontGeo() {
        const f = this.facing, out = s => f === 'S' ? s.y + s.h : f === 'N' ? -s.y : f === 'E' ? s.x + s.w : -s.x;
        let sec = this.sections[0]; for (const s of this.sections) if (out(s) > out(sec)) sec = s;
        const nx = f === 'E' ? 1 : f === 'W' ? -1 : 0, ny = f === 'S' ? 1 : f === 'N' ? -1 : 0;
        return { side: f, sec, nx, ny, ux: ny ? 1 : 0, uy: nx ? 1 : 0, cx: nx ? (nx > 0 ? sec.x + sec.w : sec.x) : sec.x + sec.w / 2, cy: ny ? (ny > 0 ? sec.y + sec.h : sec.y) : sec.y + sec.h / 2 };
    }
    /** What a frame draws with: the view leaning as hard as this building, its roof's scale, the faces seen. */
    context(base, time, dark = 0) {
        const view = base.leaning(this.hero), k = view.k(this.H);
        return { view, k, time, dark, faces: this.faces.filter(f => view.sees(f)), glow: Math.max(.15, Math.min(1, dark * 1.1)) };
    }
    /** The box its walls and roof cover (footprint to a roof a few floors higher, or its crown). */
    box(base) {
        const view = base.leaning(this.hero), k = Math.max(view.k(this.H + 3 * this.look.floor_height), this.crown_z ? view.k(this.crown_z) : 0), [x0, y0, x1, y1] = this.bounds;
        const [ax, ay] = view.scaled(x0, y0, k), [bx, by] = view.scaled(x1, y1, k);
        return [Math.min(x0, ax, bx), Math.min(y0, ay, by), Math.max(x1, ax, bx), Math.max(y1, ay, by)];
    }
    /** What it hides of the glow behind it: each section, footprint to roof. */
    silhouettes(base) {
        const view = base.leaning(this.hero), k = view.k(this.H);
        return this.sections.map(s => { const pts = view.silhouette([[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]], k); return [...pts.map(([x, y], i) => [i ? 'line' : 'move', x, y]), ['close']]; });
    }
    /** The frame's matrix (frame units to world) and its door's place. */
    get frameMatrix() { const F = this.frame; return mul([1, 0, 0, 1, F.ox, F.oy], F.m); }
    /** A point on the front: s along it from its middle, o out from it, at height z (leaned in `view`). */
    frontPoint(view, s, o, z) { const g = this.front; return view.at(g.cx + g.ux * s + g.nx * o, g.cy + g.uy * s + g.ny * o, z); }
    /** A point on the front wall's footprint, s along it from the middle. */
    frontFoot(s) { const g = this.front; return [g.cx + g.ux * s, g.cy + g.uy * s]; }
    /** The width of a line of text in `font` (measured once a text and font; estimated where nothing can measure). */
    measure(text, font) {
        const key = `${text}|${font.family}|${font.size}|${font.weight}|${font.letter_spacing ?? 0}`;
        let w = WIDTHS.get(key);
        if (w === undefined) { try { w = measureText(text, font).width; } catch { w = [...text].length * (font.size * .5 + (font.letter_spacing ?? 0)); } WIDTHS.set(key, w); }
        return w;
    }
    /** The door's u along a front face, or -1. */
    doorU(f) {
        if (f.side !== this.facing || !this.entrance) return -1;
        const E = this.entrance, u = f.y1 === f.y2 ? (E.cx - f.x1) / (f.x2 - f.x1) : (E.cy - f.y1) / (f.y2 - f.y1);
        return u > .05 && u < .95 ? u : -1;
    }
    /** Draw fn(art, os) flat at height z, o out from the wall at the door, x along the front (os: +1 when its y points out). */
    board(ctx, art, z, o, fn) {
        const E = this.entrance ?? this.front, k = ctx.view.k(z);
        art.enter({ matrix: ctx.view.plane(k) }); art.enter({ position: [E.cx + E.nx * o, E.cy + E.ny * o], rotation: E.nx ? E.nx * Math.PI / 2 : 0 });
        fn(art, E.ny > 0 ? 1 : -1);
        art.leave(); art.leave();
    }

    /* ---------------- the top pass: walls, fronts, roof ---------------- */

    walls(ctx, art) {
        const { view, k, faces } = ctx, wall = this.colors.wall;
        for (const f of faces) {
            const G = view.wall(f, k), [a, b] = [[f.x1, f.y1], [f.x2, f.y2]], [c, d] = [G.top[1], G.top[0]];
            const shade = f.side === 'S' ? 18 : f.side === 'N' ? -8 : 6;
            art.paint(G.outline(), { fill: linear([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2], [[0, darken(wall, 6)], [1, shade >= 0 ? lighten(wall, shade) : darken(wall, -shade)]]), stroke: 'rgba(0,0,0,0.35)', stroke_width: 1 });
            if (this.variant) this.artist.faceUnder(this, ctx, art, f, G);
            if (this.artist?.windows !== false) this.#windows(ctx, art, f, G, false);
        }
        if (this.variant) { this.artist.faceOver(this, ctx, art); this.artist.front(this, ctx, art, false); }
    }

    /** The roof as one picture in the plane of its height: shared by its variant and size, or its own. */
    roofPicture(ctx) {
        const plane = ctx.view.plane(ctx.k);
        if (this.artist?.roof) { const r = this.artist.roof(this); return { picture: { key: `city_roof:${r.key}`, bounds: [0, 0, this.frame.fw, this.frame.fd], matrix: mul(plane, this.frameMatrix), build: r.build } }; }
        const [x0, y0, x1, y1] = this.bounds;
        return { picture: { key: `city_roof:house:${this.index}`, bounds: [x0, y0, x1 - x0, y1 - y0], matrix: plane, build: () => { const art = new artScene(); this.#roof(art); return art.finish(); } } };
    }
    /** What moves on the roof (the washing in the wind), in the roof's plane. */
    roofLive(ctx, art) {
        if (this.artist?.roof || !this.roof_features.includes('laundry')) return;
        art.enter({ matrix: ctx.view.plane(ctx.k) }); this.#laundry(art, ctx.time); art.leave();
    }
    /** An apartment's roof: each section with its tar seams and parapet, its variant's trim, its rooftop features. */
    #roof(art) {
        const roof = this.colors.roof;
        for (const s of this.sections) {
            art.fill(rect(s.x, s.y, s.w, s.h), roof);
            const seams = []; for (let gx = 36; gx < s.w; gx += 36) moveLine(seams, [s.x + gx, s.y], [s.x + gx, s.y + s.h]);
            strokeIf(art, seams, 'rgba(255,255,255,0.05)', 1);
            art.stroke(rect(s.x + 2.5, s.y + 2.5, s.w - 5, s.h - 5), lighten(roof, 22), 5);
        }
        if (this.variant) { const F = this.frame; art.enter({ matrix: this.frameMatrix }); this.artist.roofTrim?.(this, art, F.fw, F.fd); art.leave(); }
        this.#roofFeatures(art, false, 0);
    }
    /** The rooftop features' slots on the main section ([x, y, w, h] as fractions). */
    #slot(name) {
        const S = { stair: [.08, .1, .18, .2], pool: [.4, .14, .42, .34], garden: [.38, .12, .46, .36], laundry: [.12, .56, .5, .3], tank: [.76, .6, .14, .18], solar: [.56, .56, .34, .32], lights: [.06, .08, .88, .84], antenna: [.88, .1, .05, .05], dish: [.74, .12, .1, .1] }[name], m = this.sections[0];
        return [m.x + S[0] * m.w, m.y + S[1] * m.h, S[2] * m.w, S[3] * m.h];
    }
    #roofFeatures(art, emissive, t) {
        const acc = this.colors.accent;
        for (const f of this.roof_features) {
            const [x, y, w, h] = this.#slot(f);
            if (f === 'stair') {
                if (!emissive) { art.fill(rect(x, y, w, h), lighten(this.colors.roof, 18)); art.fill(rect(x + w, y + 4, 4, h), 'rgba(0,0,0,0.35)'); }
                else art.fill(rect(x + w * .35, y + h - 3, w * .3, 3), '#ffd9a0');
            } else if (f === 'pool') {
                if (!emissive) { art.fill(rect(x - 5, y - 5, w + 10, h + 10), '#d9d2c4'); art.fill(rect(x, y, w, h), linear([x, y], [x + w, y + h], [[0, '#4fc3e0'], [1, '#1f6fa8']])); }
                else {
                    art.enter({}, { opacity: art.style.opacity * .8 }); art.fill(rect(x, y, w, h), linear([x, y], [x + w, y + h], [[0, '#2bb8d8'], [1, '#0f4f8a']])); art.leave();
                    const caustics = [];
                    for (let i = 0; i < 4; i++) { const yy = y + h * (.2 + i * .2) + Math.sin(t * 1.5 + i) * 2; caustics.push(['move', x + 4, yy], ['quadratic', x + w / 2, yy + Math.sin(t * 2 + i) * 3, x + w - 4, yy]); }
                    art.stroke(caustics, 'rgba(255,255,255,0.45)', 1);
                }
            } else if (f === 'garden') {
                if (!emissive) {
                    art.fill(rect(x, y, w, h), '#3b2e24');
                    const greens = ['#2f7d3a', '#3c9b47', '#27643a'], beds = [[], [], []], rr = Math.min(w, h) * .14;
                    for (let i = 0; i < 9; i++) dotPath(beds[i % 3], x + w * (.12 + (i % 3) * .38), y + h * (.2 + Math.floor(i / 3) * .3), rr);
                    beds.forEach((b, k) => art.fill(b, greens[k]));
                } else { const l = []; for (let i = 0; i < 4; i++) dotPath(l, x + w * (.3 + (i % 2) * .4), y + h * (.35 + Math.floor(i / 2) * .3), 1.6); art.fill(l, '#ffcf7a'); }
            } else if (f === 'tank' && !emissive) {
                const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) / 2;
                art.fill([circle(cx, cy, rr)], '#5a4a3a'); art.stroke([circle(cx, cy, rr * .65)], '#7a6650', 2); art.fill([circle(cx, cy, rr * .25)], '#3e3328');
            } else if (f === 'solar' && !emissive) {
                const panels = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) boxPath(panels, x + i * w / 3 + 2, y + j * h / 2 + 2, w / 3 - 4, h / 2 - 4);
                art.fill(panels, '#1c2a4a'); art.stroke(panels, 'rgba(120,160,255,0.35)', .6);
            } else if (f === 'lights' && emissive) {
                const cols = ['#ffd27a', acc, '#ffd27a', '#ff9ecf'], rows = [];
                for (let z = 0; z < 3; z++) { const y0 = y + h * (.15 + z * .35), y1 = y0 + h * .18; for (let i = 0; i <= 12; i++) dotPath(rows[i + z] ??= [], x + w * i / 12, (i % 2 ? y1 : y0) + Math.sin(i * .9) * 2, 1.5); }
                rows.forEach((r, s) => { art.enter({}, { opacity: art.style.opacity * (.75 + .25 * Math.sin(t * 3 + s)) }); art.fill(r, cols[s % cols.length]); art.leave(); });
            } else if (f === 'antenna') {
                const cx = x + w / 2, cy = y + h / 2;
                if (!emissive) art.stroke([...moveLine([], [cx - 6, cy], [cx + 6, cy]), ...moveLine([], [cx, cy - 6], [cx, cy + 6])], '#8a8f99', 1.5);
                else if (Math.sin(t * 3 + this.style_seed) > .3) art.paint([circle(cx, cy, 2.2)], { fill: '#ff3040', shadow: { color: '#ff3040', blur: 8 } });
            } else if (f === 'dish' && !emissive) {
                const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) / 2;
                art.fill([ellipse(cx, cy, rr, rr * .8, .6)], '#c9ced6'); art.fill([circle(cx, cy, 1.8)], '#8a9099');
            }
        }
    }
    /** The washing on its lines, swaying. */
    #laundry(art, t) {
        const [x, y, w, h] = this.#slot('laundry'), r = i => buildingHash(this.style_seed || 1, 100 + i), cloth = ['#ff6b8a', '#6bc6ff', '#ffe066', '#b58cff', '#ffffff', '#7dffb3'];
        for (let row = 0; row < 3; row++) {
            const yy = y + h * (.2 + row * .3);
            art.stroke(moveLine([], [x, yy], [x + w, yy]), 'rgba(220,220,220,0.5)', .7);
            for (let i = 0; i < 5; i++) art.fill(rect(x + w * (.08 + i * .18) + Math.sin(t * 1.3 + i + row) * 1.2, yy, w * .1, h * .14), cloth[(i + row * 2 + Math.floor(r(row) * 6)) % cloth.length]);
        }
    }

    /* ---------------- windows (the plain grid: the bakery, florist, boutique and lounge) ---------------- */

    #windows(ctx, art, f, G, emissive) {
        const floors = this.floors, depth = G.depth;
        if (depth < floors * 1.6 || f.side === 'C') return;
        const cols = Math.max(1, Math.floor(G.length / 26)), mask = this.artist?.windowMask?.(this, f) ?? null;
        const sills = !!(this.sills && depth > floors * 2.4), nxo = f.nx, nyo = f.ny;
        const glass = [], lip = [], shade = [], lit = [], tvA = [], tvB = [], t = Math.floor(ctx.time / 7);
        for (let fl = 0; fl < floors; fl++) {
            const v0 = (fl + .28) / floors, v1 = (fl + .78) / floors;
            for (let c = 0; c < cols; c++) {
                if (mask && mask(fl, (c + .5) / cols)) continue;
                const u0 = (c + .25) / cols, u1 = (c + .75) / cols;
                if (emissive) {
                    if (sills) moveLine(lip, ...this.#sill(G, u0, u1, v0 - .2 / floors, cols, nxo, nyo));
                    const hsh = buildingHash(this.seed + f.section * 31 + f.side.charCodeAt(0), fl * 57 + c * 13 + (buildingHash(this.seed, fl + c) > .93 ? t : 0));
                    if (hsh < (this.style ? .5 : .3)) G.quad(u0, u1, v0, v1, hsh < .06 ? (Math.sin(ctx.time * 9 + c) > 0 ? tvA : tvB) : lit);
                    continue;
                }
                G.quad(u0, u1, v0, v1, glass);
                if (sills) { moveLine(lip, ...this.#sill(G, u0, u1, v0 - .2 / floors, cols, nxo, nyo)); moveLine(shade, ...this.#sill(G, u0, u1, v0 - .5 / floors, cols, nxo, nyo)); }
            }
        }
        if (emissive) {
            fillIf(art, lit, this.colors.window_lit || '#ffe2a8'); fillIf(art, tvA, '#9ec8ff'); fillIf(art, tvB, '#6f9fe8');
            const rim = this.rim(ctx.dark);
            if (rim.a > .01 && lip.length) { art.enter({}, { blend: 'add' }); art.stroke(lip, `rgba(${rim.rgb}, ${.5 * rim.a})`, 1); art.leave(); }
            return;
        }
        fillIf(art, glass, 'rgba(20,28,48,0.9)');
        if (sills) { strokeIf(art, shade, this.sills.shade, 1.2); strokeIf(art, lip, this.sills.lip, 1); }
    }
    #sill(G, u0, u1, v, cols, nx, ny) { const w0 = u0 - .06 / cols, w1 = u1 + .06 / cols, a = G.at(w0, v), b = G.at(w1, v); return [[a[0] + nx * 1.6, a[1] + ny * 1.6], [b[0] + nx * 1.6, b[1] + ny * 1.6]]; }
    /** The night rim: how strongly its details catch its lamp colour (its accent, the colour its block's lamps burn). */
    rim(dark) { return { rgb: rgbOf(this.colors.accent || '#ffcf8a'), a: Math.max(0, Math.min(1, (dark - .15) * 1.6)) }; }

    /* ---------------- the glow pass ---------------- */

    glow(ctx, art) {
        const { view, k, faces } = ctx;
        art.enter({}, { opacity: ctx.glow });
        for (const f of faces) {
            const G = view.wall(f, k);
            if (this.style && f.side === this.facing && this.entrance) this.#frontWash(art, f, G);
            if (this.artist?.windows !== false) this.#windows(ctx, art, f, G, true);
        }
        if (this.variant) this.artist.glow(this, ctx, art);
        art.enter({ matrix: view.plane(k) });
        const rim = this.style ? this.colors.accent : '#8fa0c8';
        art.enter({}, { opacity: ctx.glow * (this.style ? .55 : .18) });
        const rims = []; for (const s of this.sections) boxPath(rims, s.x + 1, s.y + 1, s.w - 2, s.h - 2);
        art.paint(rims, { stroke: rim, stroke_width: this.style ? 1.6 : 1, ...(this.style ? { shadow: { color: rim, blur: 8 } } : {}) });
        art.leave();
        if (this.variant && this.artist.roofGlow) { art.enter({ matrix: this.frameMatrix }); this.artist.roofGlow(this, art); art.leave(); }
        if (this.style) this.#roofFeatures(art, true, ctx.time);
        art.leave(); art.leave();
    }
    /** The entrance lamps' wash up the front face (accent-tinted). */
    #frontWash(art, f, G) {
        const E = this.entrance, vert = !!E.nx, door = vert ? E.cy : E.cx, lo = vert ? Math.min(f.y1, f.y2) : Math.min(f.x1, f.x2), hi = vert ? Math.max(f.y1, f.y2) : Math.max(f.x1, f.x2);
        if (door < lo - 40 || door > hi + 40 || G.depth < 6) return;
        const gx = vert ? f.x1 : door, gy = vert ? door : f.y1, pts = [[f.x1, f.y1], [f.x2, f.y2], G.top[1], G.top[0]];
        const X0 = Math.min(...pts.map(p => p[0])), Y0 = Math.min(...pts.map(p => p[1])), X1 = Math.max(...pts.map(p => p[0])), Y1 = Math.max(...pts.map(p => p[1]));
        art.enter({}, { blend: 'add' }); art.clip(G.outline());
        art.fill(rect(X0 - 5, Y0 - 5, X1 - X0 + 10, Y1 - Y0 + 10), radial([gx, gy], 0, [gx, gy], 120, [[0, alpha(this.colors.accent, .35)], [1, alpha(this.colors.accent, 0)]]));
        art.leave();
    }

    /* ---------------- the ground ---------------- */

    ground(scene) {
        const depth = this.floors * 3;
        for (const s of this.sections) scene.fill(rect(s.x + depth, s.y + depth, s.w, s.h), 'rgba(0, 0, 0, 0.5)');
        for (const s of this.sections) scene.fill(rect(s.x - 5, s.y - 5, s.w + 10, s.h + 10), 'rgba(10, 10, 15, 0.3)');
        if (this.artist?.base) { const F = this.frame; scene.enter({ matrix: this.frameMatrix }); this.artist.base(this, scene, F.fw, F.fd, Math.round(F.door)); scene.leave(); }
    }
}

