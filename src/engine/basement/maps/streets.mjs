// ===== LV0 BASEMENT =====
// STREETS: a map's roads, junctions, pavements and crosswalks turned into one navigation network, as data. Roads are
// centrelines with a number of lanes each way; where a road passes through a junction (an authored one, or where its
// end meets another road) it is cut into arms, each arm a lane per lane each way, driven on the right. Through each
// junction the lanes join by turns (straight on in the same lane, right from the kerb lane, left from the inner lane),
// each turn a lane of its own, under a signal of its junction's phase. Pavements and crosswalks become lanes on foot;
// a crosswalk is a walkway the cars crossing it stop before while someone is on it, and those on foot cross it while
// the road it crosses has a red light. The result is plain data for a roadNetwork, a trafficController and agents.

/** The street network's settings and their defaults. */
export const STREETS = Object.freeze({
    lane_width: 60,            // across one lane, when a road does not say
    speed_limit: 180,          // along a road, units a second
    turn_speed: 90,            // through a turn
    turn_samples: 6,           // points along a turn's curve
    straight_angle: .6,        // a turn within this many radians of straight on is straight on
    join: 120,                 // a pavement end this near another foot end is joined to it
    stop_setback: 4,           // a car stops this far before a stop line or a crosswalk
    box_exit: 110,             // past a junction, how far a car must have room (and the crosswalk be clear) before it goes in
    car: 'car', foot: 'foot'   // the profiles on the lanes
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const len = v => Math.hypot(v[0], v[1]), unit = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; }, cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const right = d => [-d[1], d[0]];   // the right hand of a heading, y down
const angleDelta = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const heading = d => Math.atan2(d[1], d[0]);
const round = p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];

function lengths(points) { const out = [0]; for (let i = 1; i < points.length; i++) out.push(out[i - 1] + len(sub(points[i], points[i - 1]))); return out; }
function at(points, cum, s) {
    s = Math.max(0, Math.min(cum.at(-1), s)); let i = 1; while (i < points.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return add(points[i - 1], mul(sub(points[i], points[i - 1]), t));
}
function slice(points, cum, a, b) { const out = [at(points, cum, a)]; for (let i = 1; i < points.length - 1; i++) if (cum[i] > a + 1e-6 && cum[i] < b - 1e-6) out.push(points[i]); out.push(at(points, cum, b)); return out; }
/** A polyline moved `d` to its right, each corner along the mean of its two segments' normals. */
function offset(points, d) {
    return points.map((p, i) => {
        const a = unit(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]));
        return add(p, mul(right(a), d));
    });
}
/** The stretches [enter, leave] of a polyline inside a convex polygon, by distance along it. */
function clip(points, cum, poly) {
    const out = []; let inside = null;
    const contains = p => { let sign = 0; for (let i = 0; i < poly.length; i++) { const c = cross(sub(poly[(i + 1) % poly.length], poly[i]), sub(p, poly[i])); if (Math.abs(c) < 1e-9) continue; const s = Math.sign(c); if (sign && s !== sign) return false; sign = s; } return true; };
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], d = sub(b, a); let t0 = 0, t1 = 1, ok = true;
        // Cyrus-Beck against each edge, whichever way the polygon winds.
        const centre = poly.reduce((s, p) => add(s, mul(p, 1 / poly.length)), [0, 0]);
        for (let k = 0; k < poly.length && ok; k++) {
            const p = poly[k], q = poly[(k + 1) % poly.length], e = sub(q, p); let n = right(e); if ((n[0] * (centre[0] - p[0]) + n[1] * (centre[1] - p[1])) < 0) n = mul(n, -1);
            const num = n[0] * (a[0] - p[0]) + n[1] * (a[1] - p[1]), den = n[0] * d[0] + n[1] * d[1];
            if (Math.abs(den) < 1e-12) { if (num < 0) ok = false; continue; }
            const t = -num / den; if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
            if (t0 > t1) ok = false;
        }
        if (!ok) { if (inside) { out.push(inside); inside = null; } continue; }
        const s0 = cum[i - 1] + t0 * (cum[i] - cum[i - 1]), s1 = cum[i - 1] + t1 * (cum[i] - cum[i - 1]);
        if (inside && Math.abs(inside[1] - s0) < 1e-6) inside[1] = s1; else { if (inside) out.push(inside); inside = [s0, s1]; }
        if (t1 < 1) { out.push(inside); inside = null; }
    }
    if (inside) out.push(inside);
    return out.filter(([a, b]) => b - a > 1e-6 || contains(at(points, cum, a)));
}
const rectPoly = r => r.poly ?? [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
/** Where a lane's polyline first enters a convex polygon and leaves it again, by distance along it, or null. */
function through(points, poly) { const cum = lengths(points), parts = clip(points, cum, poly); return parts.length ? [parts[0][0], parts.at(-1)[1]] : null; }
function bezier(a, c, b, samples) { const out = []; for (let i = 1; i < samples; i++) { const t = i / samples, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return out; }
const box = ps => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); } return b; };
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function meet(p, d, q, e) { const den = cross(d, e); if (Math.abs(den) < 1e-6) return null; const t = cross(sub(q, p), e) / den; return add(p, mul(d, t)); }

/**
 * The street network of a map's `streets` (`{roads: [{id, lanes, lane_width, thickness, stops: [[x, y, ...]]}],
 * intersections: [{id, x, y, w, h, poly?}]}`), `pavements` ([{x, y, w, h}]) and `crosswalks` ([{x, y, w, h,
 * orientation: 'H' | 'V' | 'D', poly?, axis?}]): `{nodes: [{node_id, position}], lanes: [{lane_id, from, to, points,
 * speed_limit, profiles, kind, ...}], junctions: [{junction_id, position, phases: [[signal_id]]}] (a phase for each way in, round the junction), crossings:
 * [{walkway_id, lane_id, waits_for: [signal_id]}]}`. A car lane's `stops` are `[{distance, signal_id | walkway_id}]`
 * along it, ready for a traffic route. `kind` is `road` (an arm's lane), `turn` (through a junction), `pavement` or
 * `crossing`.
 */
export function streetNetwork({ streets = null, pavements = [], crosswalks = [], size = null } = {}, settings = {}) {
    const S = { ...STREETS, ...settings }, nodes = new Map(), lanes = [];
    const node = (id, p) => { if (!nodes.has(id)) nodes.set(id, { node_id: id, position: round(p) }); return id; };
    const roads = (streets?.roads ?? []).filter(r => Array.isArray(r.stops) && r.stops.length >= 2).map(r => {
        const points = r.stops.map(s => [s[0], s[1]]).filter((p, i, a) => !i || len(sub(p, a[i - 1])) > 1e-6), cum = lengths(points);
        return { id: String(r.id), name: r.name ?? null, per_side: Math.max(1, r.lanes | 0), lane_width: r.lane_width ?? S.lane_width, thickness: r.thickness ?? 2 * Math.max(1, r.lanes | 0) * (r.lane_width ?? S.lane_width), points, cum };
    });
    // Junctions: the authored ones, and one where a road ends on another road's carriageway.
    const junctions = (streets?.intersections ?? []).map(j => ({ id: String(j.id), poly: rectPoly(j) }));
    for (const r of roads) for (const [end, s] of [['start', 0], ['end', r.cum.at(-1)]]) {
        const p = at(r.points, r.cum, s);
        if (junctions.some(j => clip([p, add(p, [1e-3, 0])], [0, 1e-3], j.poly).length)) continue;
        const host = roads.find(o => o !== r && (() => { let best = Infinity; for (let i = 1; i < o.points.length; i++) { const a = o.points[i - 1], b = o.points[i], d = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]))); best = Math.min(best, len(sub(p, add(a, mul(d, t))))); } return best < o.thickness / 2; })());
        if (!host) continue;
        const h = Math.max(host.thickness, r.thickness) / 2;
        junctions.push({ id: `${r.id}:${end}`, poly: [[p[0] - h, p[1] - h], [p[0] + h, p[1] - h], [p[0] + h, p[1] + h], [p[0] - h, p[1] + h]] });
    }
    for (const j of junctions) j.centre = j.poly.reduce((s, p) => add(s, mul(p, 1 / j.poly.length)), [0, 0]);
    // Each road cut into arms between the junctions it passes through; each arm a lane per lane each way.
    const arms = [];
    for (const r of roads) {
        const cuts = []; for (const j of junctions) for (const [a, b] of clip(r.points, r.cum, j.poly)) cuts.push({ j, a, b });
        cuts.sort((x, y) => x.a - y.a);
        let from = 0, from_j = null, n = 0;
        const arm = (a, b, ja, jb) => {
            if (b - a < 1) return;
            const centre = slice(r.points, r.cum, a, b), id = `${r.id}.${n++}`, rec = { id, road: r, from: ja, to: jb, lanes: [] };
            for (const [dir, line, start_j, end_j] of [['f', centre, ja, jb], ['b', [...centre].reverse(), jb, ja]]) for (let k = 0; k < r.per_side; k++) {
                const points = offset(line, (k + .5) * r.lane_width).map(round), lane_id = `${id}${dir}${k}`;
                const lane = { lane_id, from: node(`${lane_id}:in`, points[0]), to: node(`${lane_id}:out`, points.at(-1)), points: points.slice(1, -1), all: points, speed_limit: S.speed_limit, profiles: [S.car], kind: 'road', road: r.id, name: r.name, arm: id, k, per_side: r.per_side, from_junction: start_j?.id ?? null, to_junction: end_j?.id ?? null, stops: [] };
                lanes.push(lane); rec.lanes.push(lane);
            }
            arms.push(rec);
        };
        for (const c of cuts) { arm(from, c.a, from_j, c.j); from = c.b; from_j = c.j; }
        arm(from, r.cum.at(-1), from_j, null);
    }
    // Through each junction: the turns, each under its phase's signal.
    const out_junctions = [];
    for (const j of junctions) {
        const ins = lanes.filter(l => l.kind === 'road' && l.to_junction === j.id), outs = lanes.filter(l => l.kind === 'road' && l.from_junction === j.id);
        if (!ins.length || !outs.length) continue;
        const end_heading = l => unit(sub(l.all.at(-1), l.all.at(-2))), start_heading = l => unit(sub(l.all[1], l.all[0]));
        // A phase for each way in, in turn round the junction (straight on, right and left together): no two ways that
        // are green at once cross, so a junction needs no arbitration inside it.
        const axis = heading(end_heading(ins[0])), phase = l => (Math.round(angleDelta(axis, heading(end_heading(l))) / (Math.PI / 2)) + 4) % 4;
        const phases = new Set(ins.map(phase)), signalled = phases.size > 1, used = new Set();
        for (const a of ins) for (const b of outs) {
            if (a.arm === b.arm) continue;   // (no U-turns)
            const ha = end_heading(a), hb = start_heading(b), turn = angleDelta(heading(ha), heading(hb));
            const kind = Math.abs(turn) < S.straight_angle ? 'straight' : Math.abs(turn) > Math.PI - .5 ? null : turn > 0 ? 'right' : 'left';
            if (!kind) continue;
            // Straight on in the same lane; from a middle lane (no turns of its own) also into the lanes either side.
            const middle = a.k > 0 && a.k < a.per_side - 1;
            if (kind === 'straight' && !(a.k === b.k || (a.k >= b.per_side && b.k === b.per_side - 1) || (middle && Math.abs(a.k - b.k) === 1))) continue;
            if (kind === 'right' && !(a.k === a.per_side - 1 && b.k === b.per_side - 1)) continue;
            if (kind === 'left' && !(a.k === 0 && b.k === 0)) continue;
            const p0 = a.all.at(-1), p2 = b.all[0], c = kind === 'straight' ? null : meet(p0, ha, p2, hb);
            const points = (c ? bezier(p0, c, p2, S.turn_samples) : []).map(round);
            const signal_id = signalled ? `${j.id}/${phase(a)}` : null;
            if (signal_id) used.add(signal_id);
            lanes.push({ lane_id: `${a.lane_id}>${b.lane_id}`, from: a.to, to: b.from, points, all: [p0, ...points, p2], speed_limit: kind === 'straight' ? S.speed_limit : S.turn_speed, profiles: [S.car], kind: 'turn', turn: kind, junction: j.id, signal_id, stops: [] });
        }
        const order = [0, 1, 2, 3].map(p => `${j.id}/${p}`).filter(id => used.has(id));
        out_junctions.push({ junction_id: j.id, position: round(j.centre), phases: order.map(id => [id]) });
    }
    // On foot: each pavement along its length, each crosswalk across its road, joined end to end.
    const foot = [];
    pavements.forEach((p, i) => {
        const along = p.w >= p.h, c = along ? [[p.x, p.y + p.h / 2], [p.x + p.w, p.y + p.h / 2]] : [[p.x + p.w / 2, p.y], [p.x + p.w / 2, p.y + p.h]];
        foot.push({ lane_id: `pave${i}`, ends: c, kind: 'pavement' });
    });
    crosswalks.forEach((x, i) => {
        let ends;
        if (x.orientation === 'D' && x.axis) { const { ux, uy, nx, ny, ox, oy, a0 = 0, a1 = 0, hT } = x.axis, c = [ox + ux * (a0 + a1) / 2, oy + uy * (a0 + a1) / 2]; ends = [add(c, mul([nx, ny], -hT)), add(c, mul([nx, ny], hT))]; }
        else { const along = x.orientation === 'V' ? x.w >= x.h : x.w >= x.h; ends = along ? [[x.x, x.y + x.h / 2], [x.x + x.w, x.y + x.h / 2]] : [[x.x + x.w / 2, x.y], [x.x + x.w / 2, x.y + x.h]]; }
        foot.push({ lane_id: `cross${i}`, ends, kind: 'crossing', walkway_id: `cross${i}`, poly: rectPoly(x) });
    });
    // Ends that touch are one node; a loose end is joined to the nearest other end within `join`.
    const ends = foot.flatMap(f => f.ends.map((p, e) => ({ f, e, p, id: null })));
    const near = (a, b) => len(sub(a.p, b.p));
    for (const a of ends) if (!a.id) { a.id = `${a.f.lane_id}:${a.e ? 'b' : 'a'}`; for (const b of ends) if (!b.id && b.f !== a.f && near(a, b) < 14) b.id = a.id; }
    for (const a of ends) node(a.id, a.p);
    // Pavements meet side on (one runs into the side of another, or two cross): each is cut where another's end
    // reaches it, or where they cross, and joined there. Crosswalks are never cut: each stays one walkway.
    const cuts = new Map(foot.map(f => [f, []])), joins = [];
    const reach = S.join / 3;
    for (const f of foot) if (f.kind === 'pavement') {
        const [p, q] = f.ends, d = sub(q, p), L2 = d[0] * d[0] + d[1] * d[1], L = Math.sqrt(L2);
        for (const e of ends) {
            if (e.f === f) continue;
            const t = ((e.p[0] - p[0]) * d[0] + (e.p[1] - p[1]) * d[1]) / L2; if (t * L < 14 || (1 - t) * L < 14) continue;
            const c = add(p, mul(d, t)); if (len(sub(c, e.p)) > reach) continue;
            if (!cuts.get(f).some(k => Math.abs(k.t - t) * L < 14)) cuts.get(f).push({ t, id: `${f.lane_id}@${cuts.get(f).length}`, p: c });
            joins.push([e, cuts.get(f).find(k => Math.abs(k.t - t) * L < 14)]);
        }
        for (const g of foot) if (g !== f && g.kind === 'pavement' && g.lane_id > f.lane_id) {
            const [r, w] = g.ends, e = sub(w, r), den = cross(d, e); if (Math.abs(den) < 1e-9) continue;
            const t = cross(sub(r, p), e) / den, u = cross(sub(r, p), d) / den, Lg = len(e);
            if (t * L < 14 || (1 - t) * L < 14 || u * Lg < 14 || (1 - u) * Lg < 14) continue;
            const c = add(p, mul(d, t)), have_f = cuts.get(f).find(k => Math.abs(k.t - t) * L < 14), have_g = cuts.get(g).find(k => Math.abs(k.t - u) * Lg < 14);
            const id = have_f?.id ?? have_g?.id ?? `${f.lane_id}x${g.lane_id}`;
            if (!have_f) cuts.get(f).push({ t, id, p: have_g?.p ?? c }); if (!have_g) cuts.get(g).push({ t: u, id, p: have_f?.p ?? c });
            if (have_f && have_g && have_f.id !== have_g.id) joins.push([{ id: have_f.id, p: have_f.p }, have_g]);
        }
    }
    for (const f of foot) {
        const [a, b] = ends.filter(x => x.f === f), stops = [{ t: 0, id: a.id, p: a.p }, ...cuts.get(f).sort((x, y) => x.t - y.t), { t: 1, id: b.id, p: b.p }];
        for (const k of stops) node(k.id, k.p);
        for (let i = 1; i < stops.length; i++) lanes.push({ lane_id: stops.length > 2 ? `${f.lane_id}.${i - 1}` : f.lane_id, from: stops[i - 1].id, to: stops[i].id, points: [], all: [stops[i - 1].p, stops[i].p].map(round), speed_limit: 60, profiles: [S.foot], two_way: true, kind: f.kind, ...(f.walkway_id ? { walkway_id: f.walkway_id } : {}) });
    }
    const joined = new Set();
    for (const [e, k] of joins) { const key = [e.id, k.id].sort().join('~'); if (e.id === k.id || joined.has(key)) continue; joined.add(key); lanes.push({ lane_id: `link:${key}`, from: e.id, to: k.id, points: [], all: [e.p, k.p].map(round), speed_limit: 60, profiles: [S.foot], two_way: true, kind: 'link' }); }
    const degree = new Map(); for (const l of lanes) if (l.profiles.includes(S.foot)) for (const n of [l.from, l.to]) degree.set(n, (degree.get(n) ?? 0) + 1);
    const ids = [...new Set(ends.map(e => e.id))].map(id => nodes.get(id)), linked = joined;
    for (const a of ids) if (degree.get(a.node_id) === 1) {
        const others = ids.filter(b => b !== a && len(sub(a.position, b.position)) < S.join).sort((x, y) => len(sub(a.position, x.position)) - len(sub(a.position, y.position)));
        for (const b of others.slice(0, 2)) {
            const key = [a.node_id, b.node_id].sort().join('~'); if (linked.has(key)) continue; linked.add(key);
            lanes.push({ lane_id: `link:${key}`, from: a.node_id, to: b.node_id, points: [], all: [a.position, b.position], speed_limit: 60, profiles: [S.foot], two_way: true, kind: 'link' });
        }
    }
    // Foot nodes at one spot are one node (a pavement's cut where another's end already is): their links go.
    const same = new Map(), alias = new Map();
    for (const l of lanes) if (l.profiles.includes(S.foot)) for (const id of [l.from, l.to]) {
        const p = nodes.get(id).position, key = `${Math.round(p[0])},${Math.round(p[1])}`;
        if (!same.has(key)) same.set(key, id); else if (same.get(key) !== id) alias.set(id, same.get(key));
    }
    if (alias.size) {
        for (const l of lanes) { l.from = alias.get(l.from) ?? l.from; l.to = alias.get(l.to) ?? l.to; }
        for (const id of alias.keys()) nodes.delete(id);
        for (let i = lanes.length - 1; i >= 0; i--) if (lanes[i].from === lanes[i].to) lanes.splice(i, 1);
    }
    // Where the cars cross a crosswalk they stop before it while someone is on it; those on foot wait for the red.
    const crossings = [], by_junction = new Map();
    for (const t of lanes) if (t.kind === 'turn' && t.signal_id) { if (!by_junction.has(t.junction)) by_junction.set(t.junction, []); by_junction.get(t.junction).push(t); }
    for (const f of foot) if (f.walkway_id) f.box = box(f.poly);
    for (const f of foot) if (f.walkway_id) {
        const waits = new Set();
        for (const l of lanes) if (l.profiles.includes(S.car)) {
            if (!overlaps(box(l.all), f.box)) continue;
            const span = through(l.all, f.poly); if (!span) continue;
            l.stops.push({ distance: Math.max(0, span[0] - S.stop_setback), walkway_id: f.walkway_id });
            // At a junction those on foot cross while every way in has its red (the walk between the phases), so
            // no car turns across them and none waits in the junction for them.
            const j = l.kind === 'road' ? (l.to_junction ?? l.from_junction) : null;
            if (j) for (const t of by_junction.get(j) ?? []) waits.add(t.signal_id);
        }
        crossings.push({ walkway_id: f.walkway_id, lane_id: f.lane_id, waits_for: [...waits] });
    }
    // A signal's stop line: before the turn, or before a crosswalk the arm reaches just before it.
    for (const t of lanes) if (t.kind === 'turn' && t.signal_id) {
        const a = lanes.find(l => l.kind === 'road' && l.to === t.from), last = a.stops.filter(s => s.walkway_id).map(s => s.distance).filter(d => d > lengths(a.all).at(-1) - 160);
        a.stops.push({ distance: Math.max(0, (last.length ? Math.min(...last) : lengths(a.all).at(-1) - S.stop_setback)), signal_id: t.signal_id, turn: t.lane_id, clearance: Math.round(lengths(a.all).at(-1) - (last.length ? Math.min(...last) : lengths(a.all).at(-1)) + lengths(t.all).at(-1) + S.box_exit) });
    }
    for (const l of lanes) { l.stops?.sort((a, b) => a.distance - b.distance); delete l.all; }
    return { nodes: [...nodes.values()], lanes, junctions: out_junctions, crossings, size };
}
