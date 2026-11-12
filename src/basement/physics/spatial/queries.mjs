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
// ===== SEGMENT AGAINST A SHAPE =====
// Where along the segment (fx, fy) + t (dx, dy), t in [0, 1], a shape is first met: the fraction, 0 when the
// segment starts inside it, or -1 when it misses. The normal of the surface met is left in rayHit, pointing from
// the ray into the shape (the engine's "from A toward B"). Nothing is allocated for circles and boxes.
// A surface touched within RAY_PAD counts as met, as it did for the thin swept circle this replaces.
const rayHit = { nx: 0, ny: 0 }, RAY_PAD = 2 * EPS;
function rayInside(dx, dy) {
    const size = Math.hypot(dx, dy);
    rayHit.nx = size > EPS ? dx / size : 1; rayHit.ny = size > EPS ? dy / size : 0;
    return 0;
}
function rayCircle(cx, cy, radius, fx, fy, dx, dy) {
    radius += RAY_PAD;
    const ox = fx - cx, oy = fy - cy, c = ox * ox + oy * oy - radius * radius;
    if (c <= 0) return rayInside(dx, dy);
    const a = dx * dx + dy * dy, b = ox * dx + oy * dy, disc = b * b - a * c;
    if (a === 0 || b >= 0 || disc < 0) return -1;
    const t = c / (-b + Math.sqrt(disc));                      // the nearer root, written to keep its precision
    if (t > 1) return -1;
    rayHit.nx = (cx - fx - dx * t) / radius; rayHit.ny = (cy - fy - dy * t) / radius;
    return t;
}
function rayBox(cx, cy, angle, hx, hy, fx, fy, dx, dy) {
    hx += RAY_PAD; hy += RAY_PAD;
    // The segment in the box's own frame, then one slab per axis
    const cos = Math.cos(angle), sin = Math.sin(angle), ox = fx - cx, oy = fy - cy;
    const lx = ox * cos + oy * sin, ly = oy * cos - ox * sin, ldx = dx * cos + dy * sin, ldy = dy * cos - dx * sin;
    if (Math.abs(lx) <= hx && Math.abs(ly) <= hy) return rayInside(dx, dy);
    let enter = 0, leave = 1, axis = -1;
    if (ldx === 0) { if (Math.abs(lx) > hx) return -1; }
    else {
        const a = (-hx - lx) / ldx, b = (hx - lx) / ldx, near = Math.min(a, b), far = Math.max(a, b);
        if (near > enter) { enter = near; axis = 0; }
        if (far < leave) leave = far;
        if (enter > leave) return -1;
    }
    if (ldy === 0) { if (Math.abs(ly) > hy) return -1; }
    else {
        const a = (-hy - ly) / ldy, b = (hy - ly) / ldy, near = Math.min(a, b), far = Math.max(a, b);
        if (near > enter) { enter = near; axis = 1; }
        if (far < leave) leave = far;
        if (enter > leave) return -1;
    }
    if (axis < 0) return -1;
    const mx = axis === 0 ? Math.sign(ldx) : 0, my = axis === 1 ? Math.sign(ldy) : 0;
    rayHit.nx = mx * cos - my * sin; rayHit.ny = mx * sin + my * cos;
    return enter;
}
function rayPolygon(points, fx, fy, dx, dy) {
    let first = 2, inside = true, turn = 0, ex = 0, ey = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length], ux = q[0] - p[0], uy = q[1] - p[1], wx = p[0] - fx, wy = p[1] - fy;
        const side = uy * wx - ux * wy;                          // which side of this edge the start is on
        if (side !== 0) { if (!turn) turn = Math.sign(side); else if (Math.sign(side) !== turn) inside = false; }
        const den = dx * uy - dy * ux;
        if (den === 0) continue;
        const t = (wx * uy - wy * ux) / den, along = (wx * dy - wy * dx) / den;
        if (t >= -RAY_PAD && t <= 1 + RAY_PAD && along >= -RAY_PAD && along <= 1 + RAY_PAD && t < first) { first = t; ex = ux; ey = uy; }
    }
    if (inside) return rayInside(dx, dy);
    if (first > 1 + RAY_PAD) return -1;
    first = Math.max(0, Math.min(1, first));
    const size = Math.hypot(ex, ey), flip = ey * dx - ex * dy < 0 ? -1 : 1;
    rayHit.nx = flip * ey / size; rayHit.ny = -flip * ex / size;
    return first;
}
function rayShape(packet, x, y, rotation, fx, fy, dx, dy) {
    const local = packet.local_position;
    let cx = x, cy = y;
    if (local[0] || local[1]) { const cos = Math.cos(rotation), sin = Math.sin(rotation); cx += local[0] * cos - local[1] * sin; cy += local[0] * sin + local[1] * cos; }
    if (packet.shape_type === 'circle') return rayCircle(cx, cy, packet.radius, fx, fy, dx, dy);
    if (packet.shape_type === 'box') return rayBox(cx, cy, rotation + packet.local_rotation, packet.dimensions[0] / 2, packet.dimensions[1] / 2, fx, fy, dx, dy);
    // Polygons, segments, capsules and compounds: their resolved pieces, the nearest of them
    let first = -1, nx = 0, ny = 0;
    for (const piece of pieces(packet, [x, y], rotation)) {
        const t = piece.radius !== undefined ? rayCircle(piece.center[0], piece.center[1], piece.radius, fx, fy, dx, dy) : rayPolygon(piece.points, fx, fy, dx, dy);
        if (t >= 0 && (first < 0 || t < first)) { first = t; nx = rayHit.nx; ny = rayHit.ny; }
    }
    rayHit.nx = nx; rayHit.ny = ny;
    return first;
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
        // Bodies predicted ahead of time move during the cast: that case stays a thin swept circle.
        if (packet.predict_seconds) {
            const hits = this.shapeCast({ ...packet, collision_shape: { shape_type: 'circle', radius: EPS }, max_results: 1 });
            if (!hits.length) return null;
            Object.assign(result, hits[0]); return result;
        }
        // Bodies at rest for the cast: the exact first crossing of the segment with each candidate's shape,
        // in scalar arithmetic. The grid walks only the cells the segment crosses.
        const from = vector(packet.from), to = vector(packet.to);
        const fx = from[0], fy = from[1], dx = to[0] - fx, dy = to[1] - fy;
        let best = -1, record = null, nx = 0, ny = 0;
        for (const b of this.world.spatial_grid.querySegment(from, to, this._rayCandidates ??= [])) {
            if (!accepts(this.world, b, packet)) continue;
            const r = this.world._record(b), t = rayShape(r.shape.packet, r.position[0], r.position[1], r.rotation, fx, fy, dx, dy);
            if (t < 0 || (record && (t > best || (t === best && r.id > record.id)))) continue;
            best = t; record = r; nx = rayHit.nx; ny = rayHit.ny;
        }
        if (!record) return null;
        return Object.assign(result, { normal: [nx, ny], penetration_depth: 0, separation: 0, world_point: [fx + dx * best, fy + dy * best],
            fraction: best, body: record.handle, body_id: record.id, entity: this.world.elements.fetchEntity(record.id), distance: Math.hypot(dx, dy) * best });
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
    findPath(packet, result = {}) {
        const from = referencePosition(this.world, packet.from ?? packet.body), to = vector(packet.to);
        const r = packet.body ? this.world._record(referenceBody(packet.body)) : null;
        const shape = packet.collision_shape ?? r?.config.collision_shape ?? { shape_type: 'circle', radius: 1 };
        const opts = { ...packet, collision_shape: shape, ignore_body: packet.ignore_body ?? r?.handle, include_ghosts: false };
        const clear = (a, b) => this.getPathClearance({ ...opts, from: a, to: b }).clear;
        if (clear(from, to)) return Object.assign(result, { points: [from, to], visited_nodes: 0 });
        const size = number(packet.node_spacing ?? Math.max(8, shapeReach(new collisionShape(shape))), 'node_spacing', 1);
        const max = number(packet.max_nodes ?? 2048, 'max_nodes', 1, 100000), margin = packet.search_margin ?? size * 16;
        const bounds = packet.search_bounds ?? { left: Math.min(from[0], to[0]) - margin, right: Math.max(from[0], to[0]) + margin, top: Math.min(from[1], to[1]) - margin, bottom: Math.max(from[1], to[1]) + margin };
        const heap = [], nodes = new Map(), key = (x, y) => `${x},${y}`;
        const point = (x, y) => [from[0] + x * size, from[1] + y * size];
        const push = n => { let i = heap.length; heap.push(n); while (i) { const p = (i - 1) >> 1; if (heap[p].f <= n.f) break; heap[i] = heap[p]; i = p; } heap[i] = n; };
        const pop = () => { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; heap[0] = last; for (;;) { const l = i * 2 + 1, rr = l + 1; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (rr < heap.length && heap[rr].f < heap[m].f) m = rr; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return first; };
        const first = { x: 0, y: 0, g: 0, f: length(sub(to, from)), parent: null }; nodes.set('0,0', first); push(first);
        let visited = 0;
        while (heap.length && visited < max) {
            const n = pop(); if (n.closed) continue; n.closed = true; visited++;
            const at = point(n.x, n.y);
            if (length(sub(at, to)) <= size * 1.5 && clear(at, to)) {
                const path = [to]; for (let cur = n; cur; cur = cur.parent) path.push(point(cur.x, cur.y)); path.reverse();
                return Object.assign(result, { points: path, visited_nodes: visited });
            }
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const x = n.x + dx, y = n.y + dy, p = point(x, y);
                if (p[0] < bounds.left || p[0] > bounds.right || p[1] < bounds.top || p[1] > bounds.bottom) continue;
                const k = key(x, y), old = nodes.get(k), g = n.g + size * Math.hypot(dx, dy);
                if ((old && old.g <= g) || !clear(at, p)) continue;
                const next = { x, y, g, f: g + length(sub(to, p)), parent: n }; nodes.set(k, next); push(next);
            }
        }
        return null;
    }
}
