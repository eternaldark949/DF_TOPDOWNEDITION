import GROUND from '../data/city-ground.json' with { type: 'json' };
import { artScene, rect, polygon, polyline, circle, radial, seededRandom, hash2, viewAhead } from '../../engine/basement/rendering/index.mjs';

/**
 * The city's ground as art, painted once per tile: the lots with their grain, the floor zones and lawns,
 * the roads (asphalt, wheel paths, lane dashes, the centre line, edges and names), the junctions, the
 * pavements with their kerbs and drains, and the crossings. It reads the city's exported data
 * (`cityMapDefinition().city`) and the look in `data/city-ground.json`; given the city's `buildings`
 * (`cityBuildings`), their shadows, footprints and pavement dressing are painted into the tiles too.
 *
 * `createDraws({view, ahead})` gives one draw per tile meeting the view, then (marked `prepare`) those
 * within `ahead` of it (px all round, or per-side margins from the camera's motion, rendering `aheadOf`): `{key, bounds, build, prepare}`, for a Basement pictureCache
 * (`pictures.draw(context, {...draw, stamp: !draw.prepare}, draw.build)`). The ground never changes, so a
 * tile is painted once and stamped after that.
 */
export class cityGround {
    #city; #look; #roads; #buildings;
    constructor(city, { look = GROUND, size, buildings = null } = {}) {
        this.#city = city; this.#look = look; this.size = size ?? null; this.#buildings = buildings;
        this.#roads = city.streets.roads.map(road => ({ ...road, lengths: lengthsOf(road.stops) }));
    }
    /** The tiles meeting the view, then those within `ahead` of it, as draws. */
    createDraws({ view, ahead = this.#look.tile_ahead, tile_size = this.#look.tile_size }) {
        const [W, H] = this.size ?? [Infinity, Infinity], out = [], later = [], near = viewAhead(view, ahead);
        const x0 = Math.max(0, Math.floor(near.left / tile_size)), y0 = Math.max(0, Math.floor(near.top / tile_size));
        for (let x = x0 * tile_size; x < Math.min(W, near.right); x += tile_size) for (let y = y0 * tile_size; y < Math.min(H, near.bottom); y += tile_size) {
            const bounds = [x, y, tile_size, tile_size], shown = x < view.right && x + tile_size > view.left && y < view.bottom && y + tile_size > view.top;
            (shown ? out : later).push({ key: `city_ground:${tile_size}:${x},${y}`, bounds, build: () => this.tileArt(bounds), prepare: !shown });
        }
        return [...out, ...later];
    }
    /** The packets of one tile [x, y, w, h], in paint order. */
    tileArt([x0, y0, S, T = S]) {
        const L = this.#look, city = this.#city, scene = new artScene(), tile = { left: x0, top: y0, right: x0 + S, bottom: y0 + T };
        const meets = (x, y, w, h) => x < tile.right && x + w > tile.left && y < tile.bottom && y + h > tile.top;
        const rnd = seededRandom(Math.round(x0 / S) * 7919 + Math.round(y0 / T) * 104729 + 949);
        // 1. The lots: dark violet ground with a fine grain
        scene.fill(rect(x0, y0, S, T), L.lot);
        grain(scene, rnd, L.lot_grain, L.lot_grain_count, () => [x0 + rnd() * S, y0 + rnd() * T, 1 + rnd() * 3, 1 + rnd() * 2]);
        // 2. Floor zones tint the ground; green ones are lawns
        for (const z of city.floor_zones) if (meets(z.x, z.y, z.w, z.h) && !isGreen(z.color)) { scene.enter({}, { opacity: L.zone_tint }); scene.fill(rect(z.x, z.y, z.w, z.h), z.color); scene.leave(); }
        for (const z of city.floor_zones) if (meets(z.x, z.y, z.w, z.h) && isGreen(z.color)) lawn(scene, L, clipTo(z, tile), rnd);
        // 3. Roads, then the junctions over them
        for (const road of this.#roads) if (meets(road.x, road.y, road.w, road.h)) this.#road(scene, road, tile, rnd);
        for (const j of city.streets.intersections) if (meets(j.x, j.y, j.w, j.h)) junction(scene, L, j);
        // 4. Pavements and crossings
        for (const p of city.pavements) if (meets(p.x, p.y, p.w, p.h)) pavement(scene, L, p, tile);
        for (const c of city.crosswalks) if (meets(c.x, c.y, c.w, c.h)) crossing(scene, L, c, rnd);
        // 5. What the buildings lay on the ground: their shadows and footprints, the street variants' stoops and planters
        this.#buildings?.groundArt(scene, [x0, y0, S, T]);
        return scene.finish();
    }
    /** A road from its geometry: any line along it is its stops moved across by their offsets. */
    #road(scene, road, tile, rnd) {
        const L = this.#look, half = road.thickness / 2, lanes = road.symmetrical ? road.lanes * 2 : road.lanes;
        const along = lat => polyline(road.stops.map(([x, y, nx, ny]) => [x + nx * lat, y + ny * lat]));
        const outline = polygon(road.outline);
        scene.fill(outline, L.asphalt);
        scene.enter(); scene.clip(outline);
        const area = clipTo(road, tile);
        grain(scene, rnd, L.asphalt_grain, area.w * area.h / 60, () => [area.x + rnd() * area.w, area.y + rnd() * area.h, 1 + rnd() * 2, 1]);
        const patches = []; for (let k = 0; k < area.w * area.h / 40000; k++) patches.push(rect(area.x + rnd() * area.w, area.y + rnd() * area.h, 30 + rnd() * 70, 16 + rnd() * 30));
        if (patches.length) scene.fill(patches.flat(), L.asphalt_hi);
        const wheels = []; for (let l = 0; l < lanes; l++) for (const off of [-13, 13]) wheels.push(...along(-half + road.lane_width * (l + .5) + off));
        scene.stroke(wheels, L.wheel_path, 9);
        for (let l = 1; l < lanes; l++) {
            const lat = l * road.lane_width - half;
            if (road.symmetrical && l === road.lanes) scene.stroke([...along(lat - 3), ...along(lat + 3)], L.centre, 1.6);
            else { scene.enter({}, { dash: L.dash_pattern }); scene.stroke(along(lat), L.dash, 2); scene.leave(); }
        }
        scene.stroke([...along(-half + 5), ...along(half - 5)], L.edge, 1.5);
        // Its name on the tarmac every so often, one per carriageway, reading along it
        if (road.name) {
            const total = road.lengths.at(-1), n = Math.max(1, Math.round(total / L.road_name.every)), lat = Math.min(13, road.lane_width * .35) + 8;
            for (let k = 0; k < n; k++) for (const side of road.symmetrical ? [-1, 1] : [1]) {
                const [x, y, ux, uy, nx, ny] = pointAlong(road, total * (k + .5) / n), at = [x + nx * side * lat, y + ny * side * lat];
                if (at[0] < tile.left - 80 || at[0] > tile.right + 80 || at[1] < tile.top - 80 || at[1] > tile.bottom + 80) continue;
                scene.enter({ position: at, rotation: Math.atan2(uy, ux) + (side > 0 ? Math.PI : 0) });
                scene.text(road.name.toUpperCase(), 0, 0, { font: L.road_name.font, align: 'center', baseline: 'middle' }, { fill: L.road_name.colour });
                scene.leave();
            }
        }
        scene.leave();
    }
}

/** Many small rectangles in two colours, one packet each: grain over a ground. */
function grain(scene, rnd, [light, dark], count, place) {
    const a = [], b = [];
    for (let k = 0; k < count; k++) { const pick = rnd() < .5; (pick ? a : b).push(rect(...place())); }
    if (a.length) scene.fill(a.flat(), light);
    if (b.length) scene.fill(b.flat(), dark);
}
const clipTo = (o, t) => { const x = Math.max(o.x, t.left), y = Math.max(o.y, t.top); return { x, y, w: Math.max(0, Math.min(o.x + o.w, t.right) - x), h: Math.max(0, Math.min(o.y + o.h, t.bottom) - y) }; };
/** A floor zone's colour is a lawn's when green leads red and blue. */
function isGreen(colour) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(colour || '');
    return !!m && parseInt(m[2], 16) > parseInt(m[1], 16) + 6 && parseInt(m[2], 16) > parseInt(m[3], 16) + 4;
}
function lawn(scene, L, { x, y, w, h }, rnd) {
    if (!(w > 0 && h > 0)) return;
    scene.fill(rect(x, y, w, h), L.lawn);
    grain(scene, rnd, [L.lawn_hi, L.lawn_lo], w * h / 180, () => [x + rnd() * w, y + rnd() * h, 2, 1 + rnd() * 2]);
    for (let k = 0; k < w * h / 9000; k++) {                                       // soft darker hollows
        const cx = x + rnd() * w, cy = y + rnd() * h, r = 20 + rnd() * 50;
        scene.paint(rect(cx - r, cy - r, 2 * r, 2 * r), { fill: radial([cx, cy], 0, [cx, cy], r, [[0, L.lawn_hollow], [1, 'rgba(4, 14, 8, 0)']]) });
    }
}
function junction(scene, L, j) {
    if (j.poly) scene.fill(polygon(j.poly), L.asphalt);                            // where an angled road meets: its own shape
    else { scene.fill(rect(j.x, j.y, j.w, j.h), L.asphalt); scene.stroke(rect(j.x + .5, j.y + .5, j.w - 1, j.h - 1), L.junction_edge, 1); }
    const mx = j.x + j.w / 2 + 22, my = j.y + j.h / 2 - 18;                       // a manhole, off-centre
    scene.outlined([circle(mx, my, 11)], L.manhole, L.manhole_rim, 1);
    const grill = []; for (let k = -6; k <= 6; k += 4) grill.push(...polyline([[mx - 7, my + k], [mx + 7, my + k]]));
    scene.stroke(grill, L.manhole_grill, 1);
}
function pavement(scene, L, p, tile) {
    const T = L.pave_size, area = clipTo(p, tile);
    scene.enter(); scene.clip(rect(area.x, area.y, area.w, area.h));
    if (p.poly) scene.clip(polygon(p.poly));                                        // beside an angled road: its own shape
    scene.fill(rect(p.x, p.y, p.w, p.h), L.pave_a);
    const gx0 = Math.floor(Math.max(p.x, tile.left - T) / T) * T, gy0 = Math.floor(Math.max(p.y, tile.top - T) / T) * T, gx1 = Math.min(p.x + p.w, tile.right), gy1 = Math.min(p.y + p.h, tile.bottom);
    const dark = [], light = [], seams = [];
    for (let gx = gx0; gx < gx1; gx += T) for (let gy = gy0; gy < gy1; gy += T) {
        const h = hash2(gx / T, gy / T, 3);
        if (h < .35) dark.push(rect(gx, gy, T, T)); else if (h > .93) light.push(rect(gx, gy, T, T));
    }
    if (dark.length) scene.fill(dark.flat(), L.pave_b);
    if (light.length) scene.fill(light.flat(), L.pave_hi);
    for (let gx = gx0; gx <= gx1; gx += T) seams.push(...polyline([[gx + .5, Math.max(p.y, tile.top)], [gx + .5, gy1]]));
    for (let gy = gy0; gy <= gy1; gy += T) seams.push(...polyline([[Math.max(p.x, tile.left), gy + .5], [gx1, gy + .5]]));
    scene.stroke(seams, L.seam, 1);
    // Kerbs all round, their top edge catching the light; a drain every so often
    if (p.poly) { scene.stroke(polygon(p.poly), L.kerb, 8); scene.stroke(polygon(p.poly), L.kerb_lit, 2); scene.leave(); return; }
    scene.stroke(rect(p.x + 2, p.y + 2, p.w - 4, p.h - 4), L.kerb, 4);
    scene.stroke(rect(p.x + .5, p.y + .5, p.w - 1, p.h - 1), L.kerb_lit, 1);
    const long = p.w > p.h;
    for (let s = 180; s < (long ? p.w : p.h) - 40; s += 260) {
        const dx = long ? p.x + s : p.x + 6, dy = long ? p.y + 6 : p.y + s, grill = [];
        scene.fill(rect(dx, dy, long ? 22 : 8, long ? 8 : 22), L.drain);
        for (let k = 2; k < 22; k += 4) grill.push(...polyline(long ? [[dx + k, dy + 1], [dx + k, dy + 7]] : [[dx + 1, dy + k], [dx + 7, dy + k]]));
        scene.stroke(grill, L.drain_grill, 1);
    }
    scene.leave();
}
/** Worn white stripes over the asphalt, across the road; an angled road's laid in its own frame. */
function crossing(scene, L, c, rnd) {
    const stripes = [], wear = [];
    const stripe = (x, y, w, h) => { stripes.push(rect(x, y, w, h)); for (let k = 0; k < 5; k++) wear.push(rect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 4, 1 + rnd() * 3)); };
    if (c.axis) {
        const A = c.axis, len = A.a1 - A.a0 - 16;
        scene.fill(polygon(c.poly), L.asphalt);
        scene.enter({ matrix: [A.ux, A.uy, A.nx, A.ny, A.ox, A.oy] });
        for (let l = -A.hT + 8; l < A.hT - 8; l += 18) stripe(A.a0 + 8, l, len, 11);
    } else {
        scene.fill(rect(c.x, c.y, c.w, c.h), L.asphalt);
        scene.enter();
        if (c.orientation === 'H') for (let sy = c.y + 8; sy < c.y + c.h - 8; sy += 18) stripe(c.x + 8, sy, c.w - 16, 11);
        else for (let sx = c.x + 8; sx < c.x + c.w - 8; sx += 18) stripe(sx, c.y + 8, 11, c.h - 16);
    }
    if (stripes.length) { scene.fill(stripes.flat(), L.stripe); scene.fill(wear.flat(), L.stripe_wear); }
    scene.leave();
}
/** Distance along a road's centre line at each stop. */
function lengthsOf(stops) { const out = [0]; for (let i = 1; i < stops.length; i++) out.push(out[i - 1] + Math.hypot(stops[i][0] - stops[i - 1][0], stops[i][1] - stops[i - 1][1])); return out; }
/** The point `d` along a road's centre line, its direction and its offset across: [x, y, ux, uy, nx, ny]. */
function pointAlong(road, d) {
    const { stops, lengths } = road;
    let i = 1; while (i < stops.length - 1 && lengths[i] < d) i++;
    const [ax, ay, anx, any] = stops[i - 1], [bx, by, bnx, bny] = stops[i], span = lengths[i] - lengths[i - 1] || 1, k = Math.max(0, Math.min(1, (d - lengths[i - 1]) / span));
    return [ax + (bx - ax) * k, ay + (by - ay) * k, (bx - ax) / span, (by - ay) / span, anx + (bnx - anx) * k, any + (bny - any) * k];
}
