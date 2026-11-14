/**
 * The small vocabulary the city's building artists share: the classic hash their picks come from, the
 * classic colour helpers (absolute RGB steps, not the toolkit's blends), and path builders that add to a
 * shape (an array of path commands) the way the classic artists added to one Path2D.
 */

/** The classic buildings' hash: a repeatable number in [0, 1) for a seed and an index. */
export const buildingHash = (seed, i) => { const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return s - Math.floor(s); };

const channels = hex => { let h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** A hex colour `amount` (0..255) darker or lighter in every channel, as `rgb(r,g,b)`. */
export const darken = (hex, amount) => `rgb(${channels(hex).map(v => clamp(v - amount, 0, 255)).join(',')})`;
export const lighten = (hex, amount) => `rgb(${channels(hex).map(v => clamp(v + amount, 0, 255)).join(',')})`;
/** 'r, g, b' of a hex colour, and the colour at alpha `a`. */
export const rgbOf = hex => channels(hex).join(', ');
export const alpha = (hex, a) => `rgba(${rgbOf(hex)}, ${a})`;

/** Path builders: each adds to `out` and returns it. */
export const moveLine = (out, a, b) => { out.push(['move', a[0], a[1]], ['line', b[0], b[1]]); return out; };
export const quadPath = (out, a, b, c, d) => { out.push(['move', a[0], a[1]], ['line', b[0], b[1]], ['line', c[0], c[1]], ['line', d[0], d[1]], ['close']); return out; };
export const boxPath = (out, x, y, w, h) => quadPath(out, [x, y], [x + w, y], [x + w, y + h], [x, y + h]);
export const polyPath = (out, points) => { points.forEach(([x, y], i) => out.push([i ? 'line' : 'move', x, y])); out.push(['close']); return out; };
/** A circle as a closed sub-path (a classic moveTo then arc). */
export const dotPath = (out, x, y, r) => { out.push(['move', x + r, y], ['ellipse', x, y, r, r, 0, 0, Math.PI * 2, 0]); return out; };
/** An arc from a0 to a1 continuing the current sub-path (or starting one). */
export const arcPath = (out, x, y, r, a0, a1) => { out.push(['ellipse', x, y, r, r, 0, a0, a1, 0]); return out; };

/** Paint a shape if it has anything in it. */
export const fillIf = (art, shape, colour) => { if (shape?.length) art.fill(shape, colour); };
export const strokeIf = (art, shape, colour, width) => { if (shape?.length) art.stroke(shape, colour, width); };

/** On a wall (`heightView.wall`), in its own units: u along it, z up it in px (the wall `H` tall). */
export const wallTools = (G, H) => ({
    L: G.length,
    rect: (out, u0, u1, z0, z1) => G.quad(u0, u1, z0 / H, z1 / H, out),
    poly: (out, points) => polyPath(out, points.map(([u, z]) => G.at(u, z / H))),
    line: (out, u0, z0, u1, z1) => G.line(u0, z0 / H, u1, z1 / H, out)
});
