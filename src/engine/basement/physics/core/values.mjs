// ===== LV0 BASEMENT =====
/** Units: world units, seconds, kilograms and radians. No game globals. */
export const BODY_GROUP = Object.freeze({ STATIC: 1, CHARACTER: 2, VEHICLE: 4, PROP: 8, PROJECTILE: 16, SENSOR: 32, PARTICLE: 64, ALL: 0x7fffffff });
export const QUERY_GROUP = Object.freeze({ ALL: 0x7fffffff });
export const PHYSICS_TYPES = Object.freeze(['static', 'rigid', 'kinematic', 'character', 'no_collision']);
export const EPS = 1e-7;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const length = v => Math.hypot(v[0], v[1]);
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const scale = (a, s) => [a[0] * s, a[1] * s];
export const unit = v => { const n = length(v); return n > EPS ? scale(v, 1 / n) : [1, 0]; };
export const rotate = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
export const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export function number(v, name, min = -Infinity, max = Infinity) {
    if (!Number.isFinite(v) || v < min || v > max) throw new TypeError(`${name} must be finite in [${min}, ${max}]`);
    return v;
}
export function vector(v, name = 'vector') {
    if (!Array.isArray(v) || v.length !== 2) throw new TypeError(`${name} must be [x, y]`);
    return [number(v[0], name), number(v[1], name)];
}
export function mask(v, name) { number(v, name, 0, BODY_GROUP.ALL); if (!Number.isInteger(v)) throw new TypeError(`${name} must be an integer`); return v; }
export function freeze(v) {
    if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
    return v;
}
export const clone = v => structuredClone(v);
export const boundsMeet = (a, b) => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
export const unionBounds = (a, b) => ({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) });
export function validBounds(b) {
    for (const k of ['left', 'right', 'top', 'bottom']) number(b?.[k], k);
    if (b.left > b.right || b.top > b.bottom) throw new TypeError('Reversed bounds');
    return { ...b };
}
