// ===== LV0 BASEMENT =====
// Easing: how a change spreads over its time. Shared by scripted motion and tweens, named in data.
import { number } from '../core/values.mjs';

const back = 1.70158, elastic = 2 * Math.PI / 3;
function bounce(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + .75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + .9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + .984375;
}
/** Every named easing: t in [0, 1] to progress (0 at the start, 1 at the end; back and elastic overshoot). */
export const EASINGS = Object.freeze({
    linear: t => t,
    smooth: t => t * t * (3 - 2 * t),
    ease_in: t => t * t, ease_out: t => 1 - (1 - t) * (1 - t), ease_in_out: t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
    cubic_in: t => t ** 3, cubic_out: t => 1 - (1 - t) ** 3, cubic_in_out: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
    sine_in: t => 1 - Math.cos(t * Math.PI / 2), sine_out: t => Math.sin(t * Math.PI / 2), sine_in_out: t => -(Math.cos(Math.PI * t) - 1) / 2,
    back_in: t => (back + 1) * t ** 3 - back * t * t, back_out: t => 1 + (back + 1) * (t - 1) ** 3 + back * (t - 1) ** 2,
    elastic_out: t => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * elastic) + 1,
    bounce_out: bounce, bounce_in: t => 1 - bounce(1 - t),
});
// A CSS cubic-bezier from (0,0) to (1,1) through (x1,y1) and (x2,y2): x is solved for t by Newton's method, then y read.
function bezier([x1, y1, x2, y2], t) {
    const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3, slope = (a, b, s) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
    let s = t;
    for (let i = 0; i < 8; i++) { const d = slope(x1, x2, s); if (Math.abs(d) < 1e-6) break; s = Math.min(1, Math.max(0, s - (at(x1, x2, s) - t) / d)); }
    return at(y1, y2, s);
}
/** An easing as data: a name from EASINGS, [x1, y1, x2, y2] for a cubic bezier (CSS's), or {steps: n} for n even jumps. Throws on anything else. */
export function readEasing(value = 'linear') {
    if (typeof value === 'string') { if (!EASINGS[value]) throw new TypeError(`Unknown easing: ${value} (one of ${Object.keys(EASINGS).join(', ')}, a bezier [x1, y1, x2, y2] or {steps})`); return value; }
    if (Array.isArray(value)) { if (value.length !== 4) throw new TypeError('A bezier easing is [x1, y1, x2, y2]'); value.forEach((v, i) => number(v, 'bezier easing', i % 2 ? -Infinity : 0, i % 2 ? Infinity : 1)); return [...value]; }
    if (value && typeof value === 'object' && Object.keys(value).length === 1) { const n = number(value.steps, 'easing steps', 1); if (!Number.isInteger(n)) throw new TypeError('Easing steps are a whole number'); return { steps: n }; }
    throw new TypeError('An easing is a name, a bezier [x1, y1, x2, y2] or {steps}');
}
/** Progress at `t` (clamped to [0, 1]) under an easing read by readEasing. */
export function ease(easing, t) {
    t = Math.min(1, Math.max(0, t));
    if (typeof easing === 'string') return EASINGS[easing](t);
    if (Array.isArray(easing)) return bezier(easing, t);
    return t >= 1 ? 1 : Math.floor(t * easing.steps) / easing.steps;
}
