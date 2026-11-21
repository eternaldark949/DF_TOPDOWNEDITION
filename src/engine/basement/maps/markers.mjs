// ===== LV0 BASEMENT =====
// MARKERS: what shows a trigger on the floor (an exit's glowing mat), as data. A map's `markers` give a look per
// trigger role (`{transition: {...}}`); the builder draws each trigger of that role with it, fitted to the
// trigger's rectangle: a soft glow round it, a faint fill, a lit border, brackets at its corners and a label.
// A trigger with `data.quiet: true` shows none (its map's own art marks it, as a lobby's gilded lifts).

/**
 * A marker's fields and their defaults (the classic's periwinkle exit mat).
 * - color: the mat's colour; glow, glow_alpha, glow_reach: the soft glow round it (its colour, strength at the
 *   heart, and how far past the rectangle it spreads, world units).
 * - fill_alpha: the inner fill; border_alpha, border_width: the lit border; corner, corner_alpha: the corner
 *   brackets' arm length and strength (0 for none).
 * - label: text shown by it (true: the trigger's own `data.label`; null: none); label_size, label_family,
 *   label_color; label_side: 'below' or 'above' the rectangle (by default below outdoors, above indoors).
 * - emits: how much the fill glows (lights the light grid, shines at night), or null; layer: the look's layer.
 */
export const MARKER = Object.freeze({ color: '#c8beff', glow: '#b4aaff', glow_alpha: .26, glow_reach: 20, fill_alpha: .11, border_alpha: .68, border_width: 2,
    corner: 10, corner_alpha: .85, label: null, label_size: 9, label_family: 'Orbitron, sans-serif', label_color: '#ddd8ff', label_side: null,
    emits: Object.freeze({ strength: .8, reach: 90 }), layer: -1 });
const COLOUR = /^#[0-9a-f]{6}$/i, NUMBERS = { glow_alpha: [0, 1], glow_reach: [0, 1000], fill_alpha: [0, 1], border_alpha: [0, 1], border_width: [0, 64], corner: [0, 1000], corner_alpha: [0, 1], label_size: [1, 512], layer: [-1e6, 1e6] };
/** A marker checked and filled in from the defaults (true is the defaults). Unknown fields are refused. */
export function readMarker(marker, where = 'marker') {
    if (marker === true) return MARKER;
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) throw new TypeError(`${where} is true or {${Object.keys(MARKER).join(', ')}}`);
    const out = { ...MARKER };
    for (const [key, value] of Object.entries(marker)) {
        if (!Object.hasOwn(MARKER, key)) throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(MARKER).join(', ')})`);
        if (['color', 'glow', 'label_color'].includes(key)) { if (typeof value !== 'string' || !COLOUR.test(value)) throw new TypeError(`${where}.${key} is '#rrggbb'`); }
        else if (key === 'label') { if (value !== null && value !== true && typeof value !== 'string') throw new TypeError(`${where}.label is text, true (the trigger's label) or null`); }
        else if (key === 'label_family') { if (typeof value !== 'string' || !value) throw new TypeError(`${where}.label_family is a font family`); }
        else if (key === 'label_side') { if (value !== null && value !== 'below' && value !== 'above') throw new TypeError(`${where}.label_side is 'below', 'above' or null`); }
        else if (key === 'emits') { if (value !== null && !(value && typeof value === 'object' && Number.isFinite(value.strength) && Number.isFinite(value.reach))) throw new TypeError(`${where}.emits is {strength, reach} or null`); }
        else { const [lo, hi] = NUMBERS[key]; if (!(Number.isFinite(value) && value >= lo && value <= hi)) throw new RangeError(`${where}.${key} is a number from ${lo} to ${hi}`); }
        out[key] = value;
    }
    return Object.freeze(out);
}
const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')}, ${+a.toFixed(4)})`;
/**
 * A marker's look for a `w` x `h` trigger, as a component in the trigger's own frame (its centre at 0, 0): the
 * glow, fill, border, corners and label as drawing steps. `label` is the trigger's own label; `side` the default side.
 */
export function markerComponent(marker, w, h, { label = null, side = 'below' } = {}) {
    const m = readMarker(marker), x = -w / 2, y = -h / 2, steps = [], lit = m.emits ? { emits: { strength: .05, reach: 8, color: m.glow } } : {};   // (so the lines and label shine through the night)
    if (m.glow_alpha > 0 && m.glow_reach > 0) {
        const r = Math.max(w, h) * .8, pad = m.glow_reach;
        steps.push({ shape: 'rectangle', x: x - pad, y: y - pad, width: w + 2 * pad, height: h + 2 * pad,
            fill: { type: 'radial', from: [0, 0], inner_radius: 0, to: [0, 0], outer_radius: r + pad, stops: [[0, rgba(m.glow, m.glow_alpha)], [.6, rgba(m.color, m.glow_alpha * .5)], [1, rgba(m.color, 0)]] } });
    }
    if (m.fill_alpha > 0) steps.push({ shape: 'rectangle', x, y, width: w, height: h, fill: rgba(m.color, m.fill_alpha), ...(m.emits ? { emits: { strength: m.emits.strength, reach: m.emits.reach, color: m.glow } } : {}) });
    if (m.border_alpha > 0 && m.border_width > 0) steps.push({ shape: 'rectangle', x, y, width: w, height: h, fill: null, stroke: rgba(m.color, m.border_alpha), line_width: m.border_width, ...lit });
    if (m.corner > 0 && m.corner_alpha > 0) {
        const c = Math.min(m.corner, w / 2, h / 2), s = rgba(m.color, m.corner_alpha);
        for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]])
            steps.push({ shape: 'line', points: [[cx, cy + dy * c], [cx, cy], [cx + dx * c, cy]], stroke: s, line_width: m.border_width, ...lit });
    }
    const text = m.label === true ? label : m.label;
    if (typeof text === 'string' && text) {
        const below = (m.label_side ?? side) === 'below';
        steps.push({ shape: 'text', text, x: 0, y: below ? y + h + 8 : y - 8, size: m.label_size, family: m.label_family, align: 'center', baseline: below ? 'top' : 'bottom', fill: m.label_color, ...lit });
    }
    return { name: 'marker', layers: [{ layer: 0, height: 0, thickness: 0, solid: false, steps }] };
}
