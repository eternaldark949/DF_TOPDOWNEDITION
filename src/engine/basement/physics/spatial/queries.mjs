// ===== LV0 BASEMENT =====
import { pose, physical, bodyBounds } from '../core/state.mjs';
import { collisionShape, shapeBounds, shapeReach, pieces } from '../collision/shape.mjs';
import { collisionDetector } from '../collision/detector.mjs';
import { vector, number, sub, add, scale, unit, length, BODY_GROUP, EPS, validBounds, boundsMeet, unionBounds, angleDelta, rotate } from '../core/values.mjs';

export function referenceBody(value) { return value?.physics_controller?.body ?? value?.body ?? value; }
export function referencePosition(world, value) {
    if (Array.isArray(value)) return vector(value);
    return [...world._record(referenceBody(value)).position];
}
function accepts(world, body, options) {
    if (!body?.body_id) return false;
    const r = world._record(body), c = r.config;
    const spatialEntity = options.spatial_entities && world.elements.fetchEntity(r.id);
    if (!c.active || (!physical(r) && !spatialEntity)) return false;
    const included = spatialEntity && !c.collision_group && options.include_groups === undefined
        ? true : !!(c.collision_group & (options.include_groups ?? BODY_GROUP.ALL));
    if (!included || (c.collision_group & (options.exclude_groups ?? 0))) return false;
    if ((!spatialEntity && !(c.query_mask & (options.query_bit ?? BODY_GROUP.ALL))) || (options.include_ghosts === false && c.ghost)) return false;
    if (options.query_body && !world._canCollide(referenceBody(options.query_body), body, { unmounted_a: !!options.query_unmounted })) return false;
    const ignore = options.ignore_body;
    return !(Array.isArray(ignore) ? ignore.some(v => referenceBody(v) === body) : referenceBody(ignore) === body);
}
function finish(hits, options, results) {
    if (options.sort_by !== 'none') hits.sort((a, b) => (a.fraction ?? a.distance ?? 0) - (b.fraction ?? b.distance ?? 0) || a.body_id - b.body_id);
    const max = options.max_results ?? Infinity;
    if (max !== Infinity) { number(max, 'max_results', 0); if (!Number.isInteger(max)) throw new TypeError('max_results must be integral'); }
    if (hits.length > max) hits.length = max;
    results.length = 0; results.push(...hits); return results;
}
const circlePoints = p => Array.from({ length: 16 }, (_, k) => [p.center[0] + p.radius * Math.cos(k * Math.PI / 8), p.center[1] + p.radius * Math.sin(k * Math.PI / 8)]);
/**
 * The edges of one closed outline that face a light at (ox, oy) and come within its reach. A ray that
 * meets a back edge has already met a front one, so only front edges can stop light. An outline
 * holding the light blocks nothing.
 */
function frontEdges(points, ox, oy, radius, out) {
    let area = 0, inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        area += xj * yi - xi * yj;
        if ((yi > oy) !== (yj > oy) && ox < (xj - xi) * (oy - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside || Math.abs(area) < 1e-12) return;
    const turn = area > 0 ? 1 : -1;                          // outward normal side of each edge
    for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length], ex = bx - ax, ey = by - ay;
        if (turn * (ex * (oy - ay) - ey * (ox - ax)) >= 0) continue;   // the light is behind (or on) it
        const len2 = ex * ex + ey * ey, t = len2 ? Math.max(0, Math.min(1, ((ox - ax) * ex + (oy - ay) * ey) / len2)) : 0;
        if (Math.hypot(ax + ex * t - ox, ay + ey * t - oy) > radius) continue;
        out.push([ax, ay, bx, by]);
    }
}
/** Edges that lie end to end on one line, facing the same way, become one (cut walls, wall runs). */
function mergeEdges(edges) {
    if (edges.length < 2) return edges;
    const lines = new Map();
    for (const e of edges) {
        const dx = e[2] - e[0], dy = e[3] - e[1], len = Math.hypot(dx, dy); if (len < 1e-9) continue;
        const ux = dx / len, uy = dy / len, key = `${ux.toFixed(6)},${uy.toFixed(6)},${(e[0] * uy - e[1] * ux).toFixed(4)}`;
        let line = lines.get(key); if (!line) lines.set(key, line = { ux, uy, spans: [] });
        line.spans.push([e[0] * ux + e[1] * uy, e[2] * ux + e[3] * uy, e]);
    }
    const out = [];
    for (const { ux, uy, spans } of lines.values()) {
        if (spans.length === 1) { out.push(spans[0][2]); continue; }
        spans.sort((a, b) => a[0] - b[0]);
        let [s0, s1, first] = spans[0], ax = first[0], ay = first[1], bx = first[2], by = first[3];
        for (let i = 1; i <= spans.length; i++) {
            const next = spans[i];
            if (next && next[0] <= s1 + 1e-6) { if (next[1] > s1) { s1 = next[1]; bx = next[2][2]; by = next[2][3]; } continue; }
            out.push([ax, ay, bx, by]);
            if (next) { s0 = next[0]; s1 = next[1]; ax = next[2][0]; ay = next[2][1]; bx = next[2][2]; by = next[2][3]; }
        }
        void s0; void ux; void uy;
    }
    return out;
}
/**
 * One sweep round the light by angle: `resolution` rays plus three at each edge end in reach, sorted;
 * each edge is active only over the angles it spans, so a ray is tested against the few edges at its
 * angle, not against every edge in reach.
 */
function sweep(edges, ox, oy, radius, resolution) {
    const angles = Array.from({ length: resolution }, (_, k) => -Math.PI + 2 * Math.PI * k / resolution), spans = [];
    for (const e of edges) {
        let a = Math.atan2(e[1] - oy, e[0] - ox), b = Math.atan2(e[3] - oy, e[2] - ox);
        for (const [x, y, t] of [[e[0], e[1], a], [e[2], e[3], b]]) if (Math.hypot(x - ox, y - oy) <= radius * 1.5) angles.push(t - 1e-5, t, t + 1e-5);
        if (b < a) { const w = a; a = b; b = w; }
        const pad = 1e-7;
        if (b - a <= Math.PI) spans.push([a - pad, b + pad, e]);
        else { spans.push([-Math.PI - pad, a + pad, e], [b - pad, Math.PI + pad, e]); }   // the edge crosses the angle ±π
    }
    angles.sort((a, b) => a - b); spans.sort((a, b) => a[0] - b[0]);
    const points = [], active = [];
    let next = 0;
    for (const angle of angles) {
        while (next < spans.length && spans[next][0] <= angle) active.push(spans[next++]);
        const dx = Math.cos(angle), dy = Math.sin(angle); let reach = radius;
        for (let i = active.length - 1; i >= 0; i--) {
            const span = active[i];
            if (span[1] < angle) { active[i] = active[active.length - 1]; active.pop(); continue; }
            const [ax, ay, bx, by] = span[2], ex = bx - ax, ey = by - ay, d = dx * ey - dy * ex; if (Math.abs(d) < 1e-12) continue;
            const qx = ax - ox, qy = ay - oy, t = (qx * ey - qy * ex) / d, u = (qx * dy - qy * dx) / d;
            if (t >= 0 && t < reach && u >= -1e-9 && u <= 1 + 1e-9) reach = t;   // a ray grazing a corner is stopped there, as a raycast is
        }
        const last = points.at(-1), point = [ox + dx * reach, oy + dy * reach];
        if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 1e-6) points.push(point);
    }
    return points;
}

export class physicsQueries {
    constructor(world) { this.world = world; }
    resolveAim(source,{target,direction,angle,angle_offset=0}={}){
        const r=this.world._record(referenceBody(source));
        const v=target!==undefined?sub(referencePosition(this.world,target),r.position):angle!==undefined?[Math.cos(number(angle,'angle')),Math.sin(angle)]:direction!==undefined?vector(direction):[Math.cos(r.rotation),Math.sin(r.rotation)];
        if(length(v)<EPS)throw new TypeError('Aim heading must be nonzero');
        const heading=rotate(unit(v),number(angle_offset,'angle_offset'));
        return {direction:heading,rotation:Math.atan2(heading[1],heading[0])};
    }
    observeTarget(observer,target,{near_range=400,fov=Math.PI*2,personal_space=0,touch_distance=0,occlusion_groups=BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE}={}){
        const r=this.world._record(referenceBody(observer)),at=referencePosition(this.world,target),delta=sub(at,r.position),distance=length(delta);
        number(near_range,'near_range',0);number(fov,'fov',0,Math.PI*2);number(personal_space,'personal_space',0);number(touch_distance,'touch_distance',0);
        const bearing=distance>EPS?Math.atan2(delta[1],delta[0]):r.rotation,relative=angleDelta(r.rotation,bearing),targetBody=Array.isArray(target)?null:referenceBody(target);
        return {position:[...at],distance,direction:unit(delta),bearing,relative_angle:relative,behind:Math.abs(relative)>Math.PI/2,in_range:distance<=near_range,in_cone:Math.abs(relative)<=fov/2,close:distance<=personal_space,touching:distance<=touch_distance,
            line_clear:!this.raycast({from:r.position,to:at,include_groups:occlusion_groups,ignore_body:[r.handle,...(targetBody?[targetBody]:[])],include_ghosts:false})};
    }
    predictTargetPosition(observer,target,{projectile_speed,max_seconds=2}={}){
        const r=this.world._record(referenceBody(target)),from=referencePosition(this.world,observer);number(projectile_speed,'projectile_speed',EPS);number(max_seconds,'max_seconds',0);
        const seconds=Math.min(max_seconds,length(sub(r.position,from))/projectile_speed);return {position:add(r.position,scale(r.velocity,seconds)),seconds};
    }
    findWanderPlacement(body,{origin,near_range=200,inner_range=0,angle_sample=.5,radius_sample=.5,...options}={}){
        number(near_range,'near_range',0);number(inner_range,'inner_range',0,near_range);number(angle_sample,'angle_sample',0,1);number(radius_sample,'radius_sample',0,1);
        const at=origin?vector(origin):referencePosition(this.world,body),radius=Math.sqrt(inner_range**2+radius_sample*(near_range**2-inner_range**2)),angle=angle_sample*Math.PI*2;
        const result=this.findClearPlacement({...options,body,from:at,to:add(at,[Math.cos(angle)*radius,Math.sin(angle)*radius]),query_unmounted:true});return result&&length(sub(result.position,at))+EPS>=inner_range?result:null;
    }
    getBodyBounds(body, { bounds_type = 'collision' } = {}) {
        const r = this.world._record(referenceBody(body));
        if (!['collision', 'render', 'light'].includes(bounds_type)) throw new TypeError('Invalid bounds_type');
        return {...bodyBounds(r,bounds_type)};
    }
    queryEntitiesInBounds(packet, results = []) {
        const bounds = validBounds(packet.bounds), hits = [], seen = new Set();
        const bounds_type = packet.bounds_type ?? 'render';
        if (!['collision', 'render', 'light'].includes(bounds_type)) throw new TypeError('Invalid bounds_type');
        for (const body of this.world.spatial_grid.queryBounds(bounds)) {
            if (!body?.body_id || seen.has(body.body_id)) continue;
            seen.add(body.body_id);
            if (!accepts(this.world, body, { ...packet, spatial_entities: true })) continue;
            const extent = this.getBodyBounds(body, { bounds_type });
            if (boundsMeet(bounds, extent)) hits.push({ body, body_id: body.body_id, entity: this.world.elements.fetchEntity(body.body_id), bounds: extent });
        }
        return finish(hits, { sort_by: 'none', ...packet }, results);
    }
    containsPoint(body, position, { bounds_type = 'collision' } = {}) {
        const r = this.world._record(referenceBody(body));
        if (!['collision', 'render', 'light'].includes(bounds_type)) throw new TypeError('Invalid bounds_type');
        const shape = bounds_type === 'collision' ? r.shape : new collisionShape(r.config[`${bounds_type}_shape`] ?? r.config.collision_shape);
        return !!collisionDetector.contact(shape, pose(r), new collisionShape({ shape_type: 'circle', radius: EPS }), { position: vector(position), rotation: 0 });
    }
    peruseNearbyEntities(reference, options = {}, results = []) {
        const at = referencePosition(this.world, reference), range = number(options.near_range ?? 400, 'near_range', 0), hits = [];
        const ignore = options.ignore_body ?? (Array.isArray(reference) ? undefined : referenceBody(reference));
        for (const b of this.world.spatial_grid.queryRadius(at, range)) {
            if (!accepts(this.world, b, { ...options, ignore_body: ignore })) continue;
            const r = this.world._record(b), d = sub(r.position, at), distance = length(d);
            if (distance <= range) hits.push({ body: b, body_id: r.id, entity: this.world.elements.fetchEntity(r.id), distance, direction: distance > EPS ? scale(d, 1 / distance) : [0, 0] });
        }
        return finish(hits, options, results);
    }
    shapeCast(packet, results = []) {
        const shape = packet.collision_shape instanceof collisionShape ? packet.collision_shape : new collisionShape(packet.collision_shape);
        const from = { position: vector(packet.from), rotation: number(packet.from_rotation ?? 0, 'from_rotation') };
        const to = { position: vector(packet.to), rotation: number(packet.to_rotation ?? from.rotation, 'to_rotation') };
        const seconds=number(packet.predict_seconds??0,'predict_seconds',0,10);
        const reach = shapeReach(shape), hits = [], delta = sub(to.position, from.position), distance = length(delta);
        const envelope=seconds?this.world._getMotionEnvelope():null;
        const search=reach+(envelope?envelope.max_speed*seconds+envelope.max_reach:0);
        for (const b of this.world.spatial_grid.querySweep({ from: from.position, to: to.position, radius: search })) {
            if (!accepts(this.world, b, packet)) continue;
            const r = this.world._record(b), c = collisionDetector.sweep(shape, from, to, r.shape, pose(r), seconds?{position:add(r.position,scale(r.velocity,seconds)),rotation:r.rotation+r.angular_velocity*seconds}:pose(r));
            if (c) hits.push({ ...c, body: b, body_id: r.id, entity: this.world.elements.fetchEntity(r.id), distance: distance * c.fraction });
        }
        return finish(hits, packet, results);
    }
    raycast(packet, result = {}) {
        // Thin finite circle avoids a separate and inconsistent segment implementation.
        const hits = this.shapeCast({ ...packet, collision_shape: { shape_type: 'circle', radius: EPS }, max_results: 1 });
        if (!hits.length) return null;
        Object.assign(result, hits[0]); return result;
    }
    /**
     * What a point light at `origin` can reach: the polygon of every ray out to `radius` stopped at the
     * first blocking body. A body blocks light by its `blocks_light`: true always (a door leaf, a big prop),
     * false never (glass), null (the default) when it is in `include_groups` (static bodies by default).
     * Ghosts never block, nor does a body that holds the origin. `include_moving: false` leaves out every
     * body that is not static. The cast keeps only the edges facing the light within its reach, joins
     * edges end to end on one line, and sweeps once round the light: `resolution` rays plus three at each
     * edge end, so shadow edges are exact. The cost grows with the edges near the light, not the map.
     * getLightRevision says when a kept polygon is stale.
     */
    getVisibilityPolygon(packet) {
        const origin = vector(packet.origin), radius = number(packet.radius, 'radius', EPS), resolution = number(packet.resolution ?? 64, 'resolution', 8, 4096);
        const [ox, oy] = origin, edges = [];
        for (const b of this.#lightBlockers(origin, radius, packet)) {
            const r = this.world._record(b);
            for (const piece of pieces(r.shape, r.position, r.rotation)) frontEdges(piece.points ?? circlePoints(piece), ox, oy, radius, edges);
        }
        return { origin, radius, points: sweep(mergeEdges(edges), ox, oy, radius, resolution) };
    }
    *#lightBlockers(origin, radius, packet) {
        const options = { include_groups: BODY_GROUP.STATIC, ...packet, include_ghosts: false }, always = { ...options, include_groups: BODY_GROUP.ALL };
        for (const b of this.world.spatial_grid.queryRadius(origin, radius)) {
            const c = this.world._record(b).config;
            if (c.blocks_light === false || (packet.include_moving === false && c.physics_type !== 'static')) continue;
            if (accepts(this.world, b, c.blocks_light ? always : options)) yield b;
        }
    }
    overlapShape(packet, results = []) {
        const shape = new collisionShape(packet.collision_shape), p = { position: vector(packet.position), rotation: number(packet.rotation ?? 0, 'rotation') }, hits = [];
        for (const b of this.world.spatial_grid.queryBounds(shapeBounds(shape, p.position, p.rotation))) {
            if (!accepts(this.world, b, packet)) continue;
            const r = this.world._record(b), c = collisionDetector.contact(shape, p, r.shape, pose(r));
            if (c) hits.push({ ...c, body: b, body_id: r.id, entity: this.world.elements.fetchEntity(r.id), distance: length(sub(r.position, p.position)) });
        }
        return finish(hits, packet, results);
    }
    isPlacementClear(body_or_shape, position, options = {}) {
        const b = referenceBody(body_or_shape), r = b?.body_id ? this.world._record(b) : null;
        if(options.placement_bounds){
            const limit=validBounds(options.placement_bounds),extent=shapeBounds(r?.shape??new collisionShape(body_or_shape),position,options.rotation??r?.rotation??0);
            if(extent.left<limit.left||extent.right>limit.right||extent.top<limit.top||extent.bottom>limit.bottom)return false;
        }
        return !this.overlapShape({ ...options, collision_shape: r?.config.collision_shape ?? body_or_shape,
            position, rotation: options.rotation ?? r?.rotation ?? 0, query_body: options.query_body ?? r?.handle, ignore_body: options.ignore_body ?? b, max_results: 1 }).length;
    }
    findNearbyPlacement(body, {near_range=240,spacing=20,max_samples=512,fallback_position,...options}={}){
        const r=this.world._record(referenceBody(body)),origin=r.position;
        number(near_range,'near_range',0);number(spacing,'spacing',EPS);number(max_samples,'max_samples',1,4096);
        if(!Number.isInteger(max_samples))throw new TypeError('max_samples must be integral');
        let checked=0;
        const inspect=position=>{checked++;return this.isPlacementClear(r.handle,position,options)?{position:[...position],distance:length(sub(position,origin)),checked_samples:checked}:null;};
        let result=inspect(origin);if(result)return result;
        for(let radius=spacing;radius<=near_range&&checked<max_samples;radius+=spacing){
            const count=Math.max(8,Math.ceil(2*Math.PI*radius/spacing));
            for(let i=0;i<count&&checked<max_samples;i++){const angle=i*2*Math.PI/count;result=inspect([origin[0]+Math.cos(angle)*radius,origin[1]+Math.sin(angle)*radius]);if(result)return result;}
        }
        return fallback_position?inspect(vector(fallback_position)):null;
    }
    findClearPlacement(packet, result = {}) {
        const from = referencePosition(this.world, packet.from ?? packet.body), to = vector(packet.to);
        if (packet.max_attempts !== undefined) { number(packet.max_attempts, 'max_attempts', 1, 4096); if (!Number.isInteger(packet.max_attempts)) throw new TypeError('max_attempts must be integral'); }
        const body = packet.body ? this.world._record(referenceBody(packet.body)) : null;
        const shape = new collisionShape(packet.collision_shape ?? body?.config.collision_shape);
        const rotation = number(packet.rotation ?? body?.rotation ?? 0, 'rotation'), delta = sub(to, from), distance = length(delta);
        const minDistance = number(packet.min_distance ?? 0, 'min_distance', 0);
        if(distance < minDistance)return null;
        const options = { ...packet, include_ghosts: packet.include_ghosts ?? false, query_body: body?.handle, ignore_body: packet.ignore_body ?? body?.handle };
        if (this.isPlacementClear(body?.handle ?? shape.packet, to, options)) return Object.assign(result, { position: to, fraction: 1, distance });
        if (distance <= EPS) return null;
        const skin = number(packet.clearance ?? 1e-4, 'clearance', EPS), intervals = [];
        if(packet.placement_bounds){
            const limit=validBounds(packet.placement_bounds),extent=shapeBounds(shape,[0,0],rotation);let lo=0,hi=1;
            for(const [index,min,max]of [[0,limit.left-extent.left,limit.right-extent.right],[1,limit.top-extent.top,limit.bottom-extent.bottom]]){
                if(min>max)return null;
                if(Math.abs(delta[index])<=EPS){if(from[index]<min||from[index]>max)return null;continue;}
                let a=(min-from[index])/delta[index],b=(max-from[index])/delta[index];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);
            }
            if(lo>hi)return null;if(lo>0)intervals.push([0,lo]);if(hi<1)intervals.push([hi,1]);
        }
        // Along a translation, each pair of convex shapes has one occupied interval.
        // Decompose compound/capsule pieces once, then union the intervals. Unlike a
        // fixed sample scan this cannot skip a small free gap between two obstacles.
        const convex = value => pieces(value, [0, 0]).map(p => new collisionShape(p.radius !== undefined
            ? { shape_type: 'circle', radius: p.radius, local_position: p.center }
            : { shape_type: 'polygon', points: p.points }));
        const sourcePieces = convex(shape), a = { position: from, rotation }, b = { position: to, rotation };
        for (const candidate of this.world.spatial_grid.querySweep({ from, to, radius: shapeReach(shape) })) {
            if (!accepts(this.world, candidate, options)) continue;
            const r = this.world._record(candidate), target = pose(r);
            for (const source of sourcePieces) for (const obstacle of convex(r.shape)) {
                const enter = collisionDetector.sweep(source, a, b, obstacle, target);
                if (!enter) continue;
                const exit = collisionDetector.sweep(source, b, a, obstacle, target);
                if (exit) intervals.push([enter.fraction, 1 - exit.fraction]);
            }
        }
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const interval of intervals) {
            const last = merged.at(-1);
            if (last && interval[0] <= last[1] + EPS) last[1] = Math.max(last[1], interval[1]);
            else merged.push([...interval]);
        }
        let fraction = 1;
        for (let i = merged.length - 1; i >= 0; i--) {
            const [lo, hi] = merged[i];
            if (fraction >= lo - EPS && fraction <= hi + EPS) fraction = lo - skin / distance;
        }
        if (fraction < 0 || distance * fraction < minDistance) return null;
        const position = add(from, scale(delta, fraction));
        if (!this.isPlacementClear(body?.handle ?? shape.packet, position, options)) return null;
        return Object.assign(result, { position, fraction, distance: distance * fraction });
    }

    getPathClearance(packet, result = {}) {
        const r = packet.body ? this.world._record(referenceBody(packet.body)) : null;
        const hits = this.shapeCast({ ...packet, from_rotation: packet.from_rotation ?? r?.rotation ?? 0, collision_shape: packet.collision_shape ?? r?.config.collision_shape,
            query_body: r?.handle, ignore_body: packet.ignore_body ?? r?.handle, max_results: 1 });
        const hit = hits[0] ?? null, total = length(sub(packet.to, packet.from));
        return Object.assign(result, { clear: !hit, distance: hit?.distance ?? total, fraction: hit?.fraction ?? 1, hit });
    }
    predictMovementContacts(packet, results = []) {
        const r = this.world._record(referenceBody(packet.body)), from = pose(r);
        let seconds = number(packet.seconds ?? 1, 'seconds', 0, 10), velocity = r.velocity;
        if (packet.to !== undefined) {
            const delta = sub(vector(packet.to), r.position), speed = number(packet.speed, 'speed', EPS);
            seconds = Math.min(seconds, length(delta) / speed); velocity = scale(unit(delta), speed);
        }
        const to = { position: add(r.position, scale(velocity, seconds)), rotation: r.rotation + (packet.to === undefined ? r.angular_velocity * seconds : 0) };
        const envelope = this.world._getMotionEnvelope(), reach = envelope.max_speed * seconds + envelope.max_reach + shapeReach(r.shape);
        const bounds = unionBounds(shapeBounds(r.shape, from.position, from.rotation), shapeBounds(r.shape, to.position, to.rotation));
        const search = { left: bounds.left - reach, right: bounds.right + reach, top: bounds.top - reach, bottom: bounds.bottom + reach }, hits = [];
        for (const body of this.world.spatial_grid.queryBounds(search)) {
            if (!accepts(this.world, body, { ...packet, include_ghosts: false, query_body: r.handle, ignore_body: r.handle })) continue;
            const target = this.world._record(body), end = { position: add(target.position, scale(target.velocity, seconds)), rotation: target.rotation + target.angular_velocity * seconds };
            const contact = collisionDetector.sweep(r.shape, from, to, target.shape, pose(target), end);
            if (contact) hits.push({ ...contact, seconds: contact.fraction * seconds, body, body_id: target.id, entity: this.world.elements.fetchEntity(target.id) });
        }
        return finish(hits, packet, results);
    }
    predictCollision(packet, result = {}) {
        const a = this.world._record(referenceBody(packet.body_a)), b = this.world._record(referenceBody(packet.body_b));
        const seconds = number(packet.seconds ?? 1, 'seconds', 0);
        const end = r => ({ position: add(r.position, scale(r.velocity, seconds)), rotation: r.rotation + r.angular_velocity * seconds });
        const c = collisionDetector.sweep(a.shape, pose(a), end(a), b.shape, pose(b), end(b));
        return c ? Object.assign(result, c, { seconds: c.fraction * seconds, body_a: a.handle, body_b: b.handle }) : null;
    }
}
