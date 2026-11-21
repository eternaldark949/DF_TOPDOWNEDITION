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
 *   label_color; label_side: 'below' or 'above' the rectangle (by default below outdoors, above indoors); label_plate,
 *   label_plate_color: a dark plate behind it at that strength, so it reads over a busy floor (0: none).
 * - emits: how much the fill glows (lights the light grid, shines at night), or null; layer: the look's layer.
 * - pulse_period, pulse_low: the mat breathes over pulse_period seconds of play, down to pulse_low of its full
 *   strength (pulse_low 1: steady); the classic's mats pulsed about every 1.26 s.
 * - active_color, active_glow, active_glow_alpha, active_label_color: the look while someone stands on it (the
 *   trigger's `occupied` property, which a map level keeps): a deeper purple, glowing harder; active_pulse_low its pulse.
 */
export const MARKER = Object.freeze({ color: '#c8beff', glow: '#b4aaff', glow_alpha: .26, glow_reach: 20, fill_alpha: .11, border_alpha: .68, border_width: 2,
    corner: 10, corner_alpha: .85, label: null, label_size: 9, label_family: 'Orbitron, sans-serif', label_color: '#ddd8ff', label_side: null, label_plate: .55, label_plate_color: '#0c0a16',
    emits: Object.freeze({ strength: .8, reach: 90 }), layer: -1, pulse_period: 1.26, pulse_low: .55,
    active_color: '#9a6bff', active_glow: '#7b3dff', active_glow_alpha: .75, active_label_color: '#efe6ff', active_pulse_low: .75 });
const COLOUR = /^#[0-9a-f]{6}$/i, COLOURS = ['color', 'glow', 'label_color', 'label_plate_color', 'active_color', 'active_glow', 'active_label_color'];
const NUMBERS = { glow_alpha: [0, 1], glow_reach: [0, 1000], fill_alpha: [0, 1], border_alpha: [0, 1], border_width: [0, 64], corner: [0, 1000], corner_alpha: [0, 1], label_size: [1, 512], layer: [-1e6, 1e6],
    label_plate: [0, 1], pulse_period: [.01, 3600], pulse_low: [0, 1], active_glow_alpha: [0, 1], active_pulse_low: [0, 1] };
/** A marker checked and filled in from the defaults (true is the defaults). Unknown fields are refused. */
export function readMarker(marker, where = 'marker') {
    if (marker === true) return MARKER;
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) throw new TypeError(`${where} is true or {${Object.keys(MARKER).join(', ')}}`);
    const out = { ...MARKER };
    for (const [key, value] of Object.entries(marker)) {
        if (!Object.hasOwn(MARKER, key)) throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(MARKER).join(', ')})`);
        if (COLOURS.includes(key)) { if (typeof value !== 'string' || !COLOUR.test(value)) throw new TypeError(`${where}.${key} is '#rrggbb'`); }
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
// The mat's glow, fill, border, corners and label in one colour set: its look at rest, or while someone stands on it.
function matSteps(m, w, h, text, below, { color, glow, glow_alpha, label_color, fill }) {
    const x = -w / 2, y = -h / 2, steps = [], lit = m.emits ? { emits: { strength: .05, reach: 8, color: glow } } : {};   // (so the lines and label shine through the night)
    if (glow_alpha > 0 && m.glow_reach > 0) {
        // rings that follow the rectangle out to glow_reach, each fainter: a soft halo of its own shape (a radial fill would be cut square by a long mat)
        const rings = 10;
        for (let i = rings; i >= 1; i--) { const pad = m.glow_reach * i / rings;
            steps.push({ shape: 'rectangle', x: x - pad, y: y - pad, width: w + 2 * pad, height: h + 2 * pad, radius: pad + 2, fill: rgba(i > rings / 2 ? color : glow, glow_alpha * .17) }); }
    }
    if (fill > 0) steps.push({ shape: 'rectangle', x, y, width: w, height: h, fill: rgba(color, fill), ...lit });
    if (m.border_alpha > 0 && m.border_width > 0) steps.push({ shape: 'rectangle', x, y, width: w, height: h, fill: null, stroke: rgba(color, m.border_alpha), line_width: m.border_width, ...lit });
    if (m.corner > 0 && m.corner_alpha > 0) {
        const c = Math.min(m.corner, w / 2, h / 2), s = rgba(color, m.corner_alpha);
        for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]])
            steps.push({ shape: 'line', points: [[cx, cy + dy * c], [cx, cy], [cx + dx * c, cy]], stroke: s, line_width: m.border_width, ...lit });
    }
    if (typeof text === 'string' && text && m.label_plate > 0) {   // (its width from the text's length: a wide face like Orbitron runs about .68 of its size a letter)
        const pw = text.length * m.label_size * .68 + 12, ph = m.label_size + 6, py = below ? y + h + 8 - 3 : y - 8 - m.label_size - 3;
        steps.push({ shape: 'rectangle', x: -pw / 2, y: py, width: pw, height: ph, radius: 3, fill: rgba(m.label_plate_color, m.label_plate) });
    }
    if (typeof text === 'string' && text) steps.push({ shape: 'text', text, x: 0, y: below ? y + h + 8 : y - 8, size: m.label_size, family: m.label_family, align: 'center', baseline: below ? 'top' : 'bottom', fill: label_color, ...lit });
    return steps;
}
/**
 * A marker's look for a `w` x `h` trigger, as a component in the trigger's own frame (its centre at 0, 0). `label`
 * is the trigger's own label; `side` the default side. Up to three layers: a faint steady fill that lights the light
 * grid (with `emits`); the mat at rest, shown while the trigger is not `occupied`; and the deeper, brighter mat while
 * it is. Both mats pulse.
 */
export function markerComponent(marker, w, h, { label = null, side = 'below' } = {}) {
    const m = readMarker(marker), text = m.label === true ? label : m.label, below = (m.label_side ?? side) === 'below';
    const base = m.fill_alpha > 0 && m.emits ? [{ shape: 'rectangle', x: -w / 2, y: -h / 2, width: w, height: h, fill: rgba(m.color, m.fill_alpha * .5), emits: { strength: m.emits.strength, reach: m.emits.reach, color: m.glow } }] : [];
    const rest = matSteps(m, w, h, text, below, { color: m.color, glow: m.glow, glow_alpha: m.glow_alpha, label_color: m.label_color, fill: m.fill_alpha * (base.length ? .5 : 1) });
    const active = matSteps(m, w, h, text, below, { color: m.active_color, glow: m.active_glow, glow_alpha: m.active_glow_alpha, label_color: m.active_label_color, fill: Math.min(1, m.fill_alpha * 2.2) });
    let n = 0; const layer = (steps, more = {}) => ({ layer: n++, height: 0, thickness: 0, solid: false, steps, ...more });
    const pulse = low => low < 1 ? { pulse: { period: m.pulse_period, low } } : {};
    return { name: 'marker', layers: [...(base.length ? [layer(base)] : []), layer(rest, { shown_when: '!occupied', ...pulse(m.pulse_low) }), layer(active, { shown_when: 'occupied', ...pulse(m.active_pulse_low) })] };
}
