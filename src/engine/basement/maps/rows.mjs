// ===== LV0 BASEMENT =====
// ROWS: buildings laid along a street front, as data. A map's `rows` line a side of a block (or of any rectangle)
// with catalog objects, wall to wall, each turned to face the street: the ones named in order, or as many as fit
// picked by weight from a seed, so a street reads as a run of different houses and is the same every load. The
// builder turns each into an ordinary object placement (map `placements`), so rows stream, save and draw like them.

const SIDES = Object.freeze({ south: 0, north: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 });
/** A row's fields and their defaults. */
export const ROW = Object.freeze({ block: null, rect: null, side: 'south', objects: null, pick: null, count: null, seed: 0, gap: 0, setback: 12, margin: 30, justify: 'center', span: null });
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = (v, where, min = -Infinity) => { if (!(Number.isFinite(v) && v >= min)) throw new TypeError(`${where} is a number of at least ${min}`); return v; };
// A small seeded generator (mulberry32): the same picks on every machine.
function random(seed) { let a = (seed >>> 0) || 0x9e3779b9; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function readItem(item, where) {
    if (!plain(item) || typeof item.object !== 'string' || !item.object) throw new TypeError(`${where} is {object, width, depth, weight, looks}`);
    for (const key of Object.keys(item)) if (!['object', 'width', 'depth', 'weight', 'looks', 'data'].includes(key)) throw new TypeError(`Unknown ${where} field: ${key}`);
    finite(item.width, `${where}.width`, 1e-6); finite(item.depth, `${where}.depth`, 1e-6); if (item.weight !== undefined) finite(item.weight, `${where}.weight`, 0);
    if (item.looks !== undefined && !(Array.isArray(item.looks) && item.looks.length && item.looks.every(plain))) throw new TypeError(`${where}.looks are a list of looks ({values, ...}), one picked for each`);
    return item;
}
/** A row checked and filled in from the defaults. Unknown fields are refused. */
export function readRow(row, where = 'row') {
    if (!plain(row)) throw new TypeError(`${where} is {${Object.keys(ROW).join(', ')}}`);
    for (const key of Object.keys(row)) if (!Object.hasOwn(ROW, key)) throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(ROW).join(', ')})`);
    const out = { ...ROW, ...row };
    if ((out.block === null) === (out.rect === null)) throw new TypeError(`${where} lines a named block or a rect {x, y, w, h}, one of the two`);
    if (out.rect !== null && !(plain(out.rect) && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(out.rect[k])))) throw new TypeError(`${where}.rect is {x, y, w, h}`);
    if (!Object.hasOwn(SIDES, out.side)) throw new TypeError(`${where}.side is one of ${Object.keys(SIDES).join(', ')}: the street it fronts`);
    if ((out.objects === null) === (out.pick === null)) throw new TypeError(`${where} names its objects in order or a pick to choose from, one of the two`);
    if (out.objects !== null) { if (!Array.isArray(out.objects) || !out.objects.length) throw new TypeError(`${where}.objects are a list`); out.objects = out.objects.map((o, i) => readItem(o, `${where}.objects[${i}]`)); }
    if (out.pick !== null) { if (!Array.isArray(out.pick) || !out.pick.length) throw new TypeError(`${where}.pick is a list`); out.pick = out.pick.map((o, i) => readItem(o, `${where}.pick[${i}]`)); if (!out.pick.some(o => (o.weight ?? 1) > 0)) throw new TypeError(`${where}.pick has nothing with weight`); }
    if (out.count !== null && !(Number.isInteger(out.count) && out.count >= 0)) throw new TypeError(`${where}.count is a whole number`);
    for (const key of ['gap', 'setback', 'margin']) finite(out[key], `${where}.${key}`, key === 'gap' ? -1e6 : 0);
    finite(out.seed, `${where}.seed`);
    if (!['start', 'center', 'end'].includes(out.justify)) throw new TypeError(`${where}.justify is 'start', 'center' or 'end'`);
    if (out.span !== null && !(Array.isArray(out.span) && out.span.length === 2 && out.span.every(Number.isFinite) && out.span[1] > out.span[0])) throw new TypeError(`${where}.span is [from, to] along the side, in world units`);
    return out;
}
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/**
 * The placements a map's rows make: `[{object, at, rotation, look?, data}]`, in row order. A row lines `side` of its
 * block (by name, from the map's `blocks`) or `rect`: its fronts `setback` in from that edge, along the side west to
 * east (north to south on the east and west sides), clear of `margin` at each end or within `span`, `gap` apart
 * (0: wall to wall), placed by `justify`. `objects` are laid in order while they fit; `pick` chooses by `weight` (1
 * by default) with the row's `seed` until no more fit (or `count` are laid). An item's `width` runs along the street
 * and `depth` back from it, in its own frame its front facing south (+y); each is turned to face the street, and
 * given one of its `looks` by the seed. A building that would stand on one already laid by a row, or on one of the
 * map's `keep_clear` rectangles, is left out.
 */
export function rowPlacements(definition) {
    const rows = definition.rows ?? [];if (!Array.isArray(rows)) throw new TypeError('A map\'s rows are a list');
    const blocks = new Map((definition.blocks ?? []).map(b => [b.name, b])), taken = [...(definition.keep_clear ?? [])], out = [];
    rows.forEach((raw, r) => {
        const row = readRow(raw, `rows[${r}]`), rect = row.rect ?? blocks.get(row.block);
        if (!rect) throw new TypeError(`rows[${r}] lines block ${row.block}, which the map's blocks do not have`);
        const along = row.side === 'south' || row.side === 'north', length = along ? rect.w : rect.h, origin = along ? rect.x : rect.y;
        const [from, to] = row.span ? [Math.max(row.span[0], origin), Math.min(row.span[1], origin + length)] : [origin + row.margin, origin + length - row.margin];
        const room = to - from, rand = random((row.seed * 2654435761) ^ (r + 1) * 40503), weigh = list => { const total = list.reduce((s, o) => s + (o.weight ?? 1), 0); let t = rand() * total; for (const o of list) { t -= o.weight ?? 1; if (t < 0) return o; } return list.at(-1); };
        // what goes in, in order, while it fits
        const chosen = []; let used = 0;
        const fits = item => used + (chosen.length ? row.gap : 0) + item.width <= room + 1e-9;
        if (row.objects) { for (const item of row.objects) { if (!fits(item)) break; used += (chosen.length ? row.gap : 0) + item.width; chosen.push(item); } }
        else { for (let tries = 0; tries < 256 && (row.count === null || chosen.length < row.count); tries++) {
            const fitting = row.pick.filter(fits); if (!fitting.length || !fitting.some(o => (o.weight ?? 1) > 0)) break;
            const item = weigh(fitting.filter(o => (o.weight ?? 1) > 0)); used += (chosen.length ? row.gap : 0) + item.width; chosen.push(item); } }
        let s = from + (row.justify === 'start' ? 0 : row.justify === 'end' ? room - used : (room - used) / 2);
        for (const item of chosen) {
            const mid = s + item.width / 2, inward = row.setback + item.depth / 2;
            const at = row.side === 'south' ? [mid, rect.y + rect.h - inward] : row.side === 'north' ? [mid, rect.y + inward] : row.side === 'east' ? [rect.x + rect.w - inward, mid] : [rect.x + inward, mid];
            const foot = along ? { x: mid - item.width / 2, y: at[1] - item.depth / 2, w: item.width, h: item.depth } : { x: at[0] - item.depth / 2, y: mid - item.width / 2, w: item.depth, h: item.width };
            s += item.width + row.gap;
            if (taken.some(t => overlaps(foot, t))) continue;
            taken.push(foot);
            const look = item.looks ? item.looks[Math.floor(rand() * item.looks.length)] : null;
            out.push({ object: item.object, at, rotation: SIDES[row.side], ...(look ? { look } : {}), data: { row: r, ...(item.data ?? {}) } });
        }
    });
    return out;
}
