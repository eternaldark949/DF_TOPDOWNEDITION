// ===== LV0 BASEMENT =====
import { vector, number, freeze, clone, EPS, cross, sub, add, rotate } from '../core/values.mjs';

/** Immutable, validated shape. Box dimensions are full extents, centred on the body. */
export class collisionShape {
    constructor(packet) {
        const p = clone(packet?.packet ?? packet);
        p.local_position = vector(p.local_position ?? [0, 0]);
        p.local_rotation = number(p.local_rotation ?? 0, 'local_rotation');
        switch (p.shape_type) {
            case 'circle': number(p.radius, 'radius', EPS); break;
            case 'box': p.dimensions = vector(p.dimensions); for (const v of p.dimensions) number(v, 'dimension', EPS); break;
            case 'capsule':
            case 'segment':
                p.points = p.points?.map(v => vector(v));
                if (p.points?.length !== 2) throw new TypeError('Segment/capsule needs two points');
                number(p.radius ??= 0, 'radius', p.shape_type === 'capsule' ? EPS : 0);
                if (Math.hypot(...sub(p.points[1], p.points[0])) < EPS) throw new TypeError('Segment must have length');
                break;
            case 'polygon': {
                p.points = p.points?.map(v => vector(v));
                if (!p.points || p.points.length < 3) throw new TypeError('Polygon needs at least 3 points');
                let sign = 0;
                for (let i = 0; i < p.points.length; i++) {
                    const c = cross(sub(p.points[(i + 1) % p.points.length], p.points[i]), sub(p.points[(i + 2) % p.points.length], p.points[(i + 1) % p.points.length]));
                    if (Math.abs(c) < EPS) throw new TypeError('Polygon vertices must be strictly convex');
                    if (sign && sign !== Math.sign(c)) throw new TypeError('Polygon must be convex and ordered');
                    sign = Math.sign(c);
                }
                for (let i = 0; i < p.points.length; i++) for (let j = 0; j < p.points.length; j++) {
                    const c = cross(sub(p.points[(i + 1) % p.points.length], p.points[i]), sub(p.points[j], p.points[i]));
                    if (c * sign < -EPS) throw new TypeError('Polygon must not intersect itself');
                }
                break;
            }
            case 'compound':
                if (!p.children?.length) throw new TypeError('Compound needs children');
                p.children = p.children.map(c => new collisionShape(c).packet);
                break;
            default: throw new TypeError(`Unknown shape_type: ${p.shape_type}`);
        }
        this.packet = freeze(p);
        Object.freeze(this);
    }
}

export function pieces(shape, position, rotation = 0, out = []) {
    const p = shape.packet ?? shape;
    const at = add(position, rotate(p.local_position ?? [0, 0], rotation));
    const a = rotation + (p.local_rotation ?? 0);
    const point = v => add(at, rotate(v, a));
    const poly = pts => out.push({ points: pts.map(point), center: at });
    switch (p.shape_type) {
        case 'circle': out.push({ center: at, radius: p.radius }); break;
        case 'box': { const [x, y] = p.dimensions.map(v => v / 2); poly([[-x, -y], [x, -y], [x, y], [-x, y]]); break; }
        case 'polygon': poly(p.points); break;
        case 'segment':
        case 'capsule': {
            const [u, v] = p.points, d = sub(v, u), l = Math.hypot(...d), r = p.radius || EPS;
            const n = [-d[1] / l * r, d[0] / l * r];
            poly([add(u, n), add(v, n), sub(v, n), sub(u, n)]);
            if (p.radius) { out.push({ center: point(u), radius: r }, { center: point(v), radius: r }); }
            break;
        }
        case 'compound': for (const c of p.children) pieces(c, at, a, out); break;
    }
    return out;
}

export function shapeBounds(shape, position, rotation = 0) {
    const packet=shape.packet??shape;
    if(packet.shape_type==='circle'){
        const local=packet.local_position,center=local&&(local[0]||local[1])?add(position,rotate(local,rotation)):position;
        return {left:center[0]-packet.radius,right:center[0]+packet.radius,top:center[1]-packet.radius,bottom:center[1]+packet.radius};
    }
    const b = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const p of pieces(shape, position, rotation)) {
        if (p.radius !== undefined) {
            b.left = Math.min(b.left, p.center[0] - p.radius); b.right = Math.max(b.right, p.center[0] + p.radius);
            b.top = Math.min(b.top, p.center[1] - p.radius); b.bottom = Math.max(b.bottom, p.center[1] + p.radius);
        } else for (const [x, y] of p.points) { b.left = Math.min(b.left, x); b.right = Math.max(b.right, x); b.top = Math.min(b.top, y); b.bottom = Math.max(b.bottom, y); }
    }
    return b;
}
const reaches=new WeakMap();
export function shapeReach(shape) {
    const cached=shape instanceof collisionShape?reaches.get(shape):undefined;
    if(cached!==undefined)return cached;
    const b = shapeBounds(shape, [0, 0]);
    const reach=Math.hypot(Math.max(Math.abs(b.left), Math.abs(b.right)), Math.max(Math.abs(b.top), Math.abs(b.bottom)));
    if(shape instanceof collisionShape)reaches.set(shape,reach);
    return reach;
}
