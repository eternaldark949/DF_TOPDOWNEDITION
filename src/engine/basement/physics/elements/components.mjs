// ===== LV0 BASEMENT =====
// COMPONENTS: the parts an entity is made of. A component is like a mesh: shapes, placed at `at`
// (turned by `rotation`) from the entity's origin, or from a rig joint when it names one. Its shapes
// sit on integer layers; each layer has its own base `height` above the component's layer 0 and its
// own `thickness`, in world units, so a floor slab, a gap and a roof are three layers. A layer with
// `sides` (a paint, or {material, shade, follow}) shows its walls when the render system leans heights toward the camera:
// they follow each solid shape's true outline (rounded corners, curves, hollows), `shade` (0..1, default .35) darkens
// a face the more it turns from the light, and `follow: 'hull'` wraps the layer in one convex skin instead. The entity's
// height is the highest top among its components. A walled layer marked `cover: false` (a post, a pole: too thin to hide
// the light under it) gives no cover at night (renderSystem.drawLooks({covers})). A layer with sides may carry a `facade`: windows, spandrels and doors
// (`panels`) in every bay of every storey, `piers` between the bays and `bands` along the walls (see readFacade). Components are plain data, kept in the entity's
// `components` property, so they save, load and change like any property. A layer may `pulse` ({period, low}: its strength
// swells and fades over `period` seconds of play, down to `low` of full) and be `shown_when` a property of its entity is
// set ("occupied") or not ("!occupied"): one switch in data swaps a look. Switched layers do not light the light grid. Lengths are world units:
// data written in metres is turned into units by the Directory when it loads.

const COMPONENT = Object.freeze(['name', 'at', 'rotation', 'joint', 'layers']);
const SIDES = Object.freeze(['material', 'shade', 'follow']);
const LAYER = Object.freeze(['layer', 'height', 'thickness', 'steps', 'drawing', 'solid', 'visible', 'sides', 'facade', 'cover', 'pulse', 'shown_when', 'slope']);
const SWITCH = /^!?[a-z_][a-z0-9_]*$/i;
const FACADE = Object.freeze({
    facade: ['storeys', 'bays', 'panels', 'piers', 'bands', 'seed'],
    storeys: 'from height count'.split(' '), bays: ['width', 'margin'],
    panels: ['width', 'height', 'at', 'fill', 'stroke', 'line_width', 'bars', 'bar_width', 'bar_fill', 'lit', 'lit_fill', 'emits', 'storeys', 'steps', 'lit_steps', 'detail', 'faces', 'bays'],
    piers: 'width from to fill edge edge_width faces'.split(' '), bands: 'from to fill lit faces'.split(' ')
});
const SAFE = value => typeof value === 'string' && value && !['__proto__', 'prototype', 'constructor'].includes(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, allowed, where) => { const extra = Object.keys(value).find(key => !allowed.includes(key)); if (extra) throw new TypeError(`${where} has no field ${extra} (one of ${allowed.join(', ')})`); };
const length = (value, where, min = 0) => { if (!Number.isFinite(value)) throw new TypeError(`${where} is a length in world units (the Directory turns "3 m" into units when it loads data)`); const n = value; if (n < min) throw new TypeError(`${where} is at least ${min}`); return n; };

/** One layer, checked: {layer, height, thickness, steps | drawing, solid, visible}. */
export function readLayer(packet, where = 'A layer') {
    if (!plain(packet)) throw new TypeError(`${where} is {layer, height, thickness, steps or drawing, solid, visible}`);
    only(packet, LAYER, where);
    if (!Number.isInteger(packet.layer)) throw new TypeError(`${where} needs an integer layer`);
    if ((packet.steps === undefined) === (packet.drawing === undefined)) throw new TypeError(`${where} has its shapes as steps or names a drawing, one of the two`);
    if (packet.steps !== undefined && !Array.isArray(packet.steps)) throw new TypeError(`${where}'s steps are a list of drawing steps`);
    if (packet.drawing !== undefined && !SAFE(packet.drawing)) throw new TypeError(`${where}'s drawing is a resource id`);
    const sides = packet.sides, material = plain(sides) ? sides.material : undefined;
    const sideKeys = plain(sides) && Object.keys(sides).every(k => SIDES.includes(k)) && (sides.shade === undefined || (Number.isFinite(sides.shade) && sides.shade >= 0 && sides.shade <= 1)) && (sides.follow === undefined || ['shapes', 'hull'].includes(sides.follow));
    if (sides !== undefined && !(typeof sides === 'string' && sides) && !(sideKeys && typeof material === 'string' && material)) throw new TypeError(`${where}'s sides are a paint colour, a "$look" value, or {material: id or "$look" value, shade: 0..1, follow: 'shapes' or 'hull'}`);
    if (packet.facade !== undefined) readFacade(packet.facade, where);
    if (packet.facade !== undefined && packet.sides === undefined) throw new TypeError(`${where}'s facade is laid on its walls: give it sides too`);
    const pulse = packet.pulse;
    if (pulse !== undefined && !(plain(pulse) && Object.keys(pulse).every(k => k === 'period' || k === 'low') && Number.isFinite(pulse.period) && pulse.period > 0 && (pulse.low === undefined || (Number.isFinite(pulse.low) && pulse.low >= 0 && pulse.low <= 1)))) throw new TypeError(`${where}'s pulse is {period: seconds above 0, low: 0..1 (its faintest, of its full strength)}`);
    if (packet.shown_when !== undefined && !(typeof packet.shown_when === 'string' && SWITCH.test(packet.shown_when) && !['__proto__', 'prototype', 'constructor'].includes(packet.shown_when.replace('!', '')))) throw new TypeError(`${where}'s shown_when names an entity property ("occupied"), or "!" and one ("!occupied")`);
    if (packet.slope !== undefined && !(Array.isArray(packet.slope) && packet.slope.length === 2 && packet.slope.every(v => Number.isFinite(v) && Math.abs(v) <= 10))) throw new TypeError(`${where}'s slope is [across, down]: how far its top rises per unit along its own x and y (an awning falling toward the street: [0, -0.5])`);
    for (const flag of ['solid', 'visible', 'cover']) if (packet[flag] !== undefined && typeof packet[flag] !== 'boolean') throw new TypeError(`${where}'s ${flag} is true or false`);
    return { layer: packet.layer, height: length(packet.height ?? 0, `${where}'s height`, -Infinity), thickness: length(packet.thickness ?? 0, `${where}'s thickness`),
        ...(packet.steps !== undefined ? { steps: structuredClone(packet.steps) } : { drawing: packet.drawing }),
        solid: packet.solid ?? true, visible: packet.visible ?? true, ...(packet.sides !== undefined ? { sides: structuredClone(packet.sides) } : {}),
        ...(packet.facade !== undefined ? { facade: structuredClone(packet.facade) } : {}), ...(packet.cover === false ? { cover: false } : {}),
        ...(pulse !== undefined ? { pulse: { period: pulse.period, low: pulse.low ?? 0 } } : {}), ...(packet.shown_when !== undefined ? { shown_when: packet.shown_when } : {}), ...(packet.slope !== undefined ? { slope: [...packet.slope] } : {}) };
}
// A number, or a "$look" value the drawing reads when it is drawn.
const lookOr = (value, test) => (typeof value === 'string' && value.startsWith('$')) || test(value);
const paint = value => value === undefined || (typeof value === 'string' && value) || plain(value);
/** A layer's facade, checked: {storeys, bays, panels, piers, bands, seed}; lengths in world units. */
function readFacade(facade, where) {
    const at = `${where}'s facade`, num = (v, name, min = -Infinity) => { if (v !== undefined && !lookOr(v, x => Number.isFinite(x) && x >= min)) throw new TypeError(`${at}'s ${name} is a number of at least ${min} (world units), or a "$look" value`); };
    if (!plain(facade)) throw new TypeError(`${at} is {storeys, bays, panels, piers, bands, seed}`);
    only(facade, FACADE.facade, at);
    for (const key of ['storeys', 'bays']) if (facade[key] !== undefined) { if (!plain(facade[key])) throw new TypeError(`${at}'s ${key} is {${FACADE[key].join(', ')}}`); only(facade[key], FACADE[key], `${at}'s ${key}`); }
    num(facade.storeys?.height, 'storey height', 1e-6); num(facade.storeys?.from, 'first storey'); num(facade.storeys?.count, 'storey count', 1); num(facade.bays?.width, 'bay width', 1e-6); num(facade.bays?.margin, 'bay margin', 0); num(facade.seed, 'seed');
    for (const key of ['panels', 'piers', 'bands']) {
        if (facade[key] === undefined) continue;
        if (!Array.isArray(facade[key])) throw new TypeError(`${at}'s ${key} are a list of {${FACADE[key].join(', ')}}`);
        facade[key].forEach((item, i) => {
            const it = `${at}'s ${key}[${i}]`;
            if (!plain(item)) throw new TypeError(`${it} is {${FACADE[key].join(', ')}}`);
            only(item, FACADE[key], it);
            for (const field of ['fill', 'stroke', 'bar_fill', 'lit_fill', 'edge']) if (!paint(item[field])) throw new TypeError(`${it}'s ${field} is a paint: a colour, a gradient or a "$look" value`);
            if (key !== 'bands') num(item.width, `${key}[${i}] width`, 1e-6);
            if (key !== 'bands' && item.width === undefined) throw new TypeError(`${it} needs a width`);
            for (const field of ['height', 'line_width', 'bar_width', 'edge_width', 'detail']) num(item[field], `${key}[${i}] ${field}`, 0);
            for (const field of 'at from to bars'.split(' ')) num(item[field], `${key}[${i}] ${field}`);
            if (key !== 'bands' && item.lit !== undefined && !lookOr(item.lit, x => Number.isFinite(x) && x >= 0 && x <= 1)) throw new TypeError(`${it}'s lit is the share of them lit, 0..1`);
            if (key === 'bands' && item.lit !== undefined && typeof item.lit !== 'boolean') throw new TypeError(`${it}'s lit is true or false: a lit band (a lamp line under a ledge) is painted over the shading and shines at night`);
            if (item.emits !== undefined && !(typeof item.emits === 'boolean' || plain(item.emits))) throw new TypeError(`${it}'s emits is true, false or {strength, reach, color, height}: its lit windows light what is round them`);
            if (item.lit_steps !== undefined && !(Array.isArray(item.lit_steps) && item.lit_steps.every(plain) && item.steps !== undefined)) throw new TypeError(`${it}'s lit_steps are the drawing of a lit one (with steps for an unlit one), in the panel's frame`);
            if (item.steps !== undefined && !(Array.isArray(item.steps) && item.steps.every(plain))) throw new TypeError(`${it}'s steps are a drawing (a list of steps) in the panel's frame: x across from its middle, y down from its top`);
            if (item.faces !== undefined && !(Array.isArray(item.faces) && item.faces.length && item.faces.every(f => ['north', 'south', 'east', 'west'].includes(f)))) throw new TypeError(`${it}'s faces are the walls it is laid on, in its thing's own frame: some of 'north', 'south', 'east', 'west' (south is +y, the way a front usually faces)`);
            if (key === 'panels' && item.bays !== undefined && !(Array.isArray(item.bays) && item.bays.every(Number.isInteger))) throw new TypeError(`${it}'s bays are a list of bay numbers along each wall (from 0; -1 is the last)`);
            if (item.storeys !== undefined && !(Array.isArray(item.storeys) && item.storeys.every(Number.isInteger))) throw new TypeError(`${it}'s storeys are a list of storey numbers (from 0 at the bottom; -1 is the top one)`);
        });
    }
}

/** One component, checked, with its layers in layer order: {name, at, rotation, joint, layers}. */
export function readComponent(packet) {
    if (!plain(packet)) throw new TypeError('A component is {name, at, rotation, joint, layers}');
    if (!SAFE(packet.name)) throw new TypeError('A component needs a name');
    const where = `Component ${packet.name}`;
    only(packet, COMPONENT, where);
    const at = packet.at ?? [0, 0];
    if (!Array.isArray(at) || at.length !== 2) throw new TypeError(`${where}'s at is [x, y]`);
    const rotation = packet.rotation ?? 0;
    if (!Number.isFinite(rotation)) throw new TypeError(`${where}'s rotation is a finite angle`);
    if (packet.joint !== undefined && packet.joint !== null && !SAFE(packet.joint)) throw new TypeError(`${where}'s joint is a rig joint name`);
    if (!Array.isArray(packet.layers) || !packet.layers.length) throw new TypeError(`${where} needs one layer or more`);
    const layers = packet.layers.map((layer, i) => readLayer(layer, `${where}'s layer ${layer?.layer ?? i}`)).sort((a, b) => a.layer - b.layer);
    for (let i = 1; i < layers.length; i++) if (layers[i].layer === layers[i - 1].layer) throw new TypeError(`${where} has layer ${layers[i].layer} twice`);
    return { name: packet.name, at: [length(at[0], `${where}'s x`, -Infinity), length(at[1], `${where}'s y`, -Infinity)], rotation, joint: packet.joint ?? null, layers };
}

/** A whole component list, checked: names are unique. */
export function readComponents(list) {
    if (!Array.isArray(list)) throw new TypeError('Components are a list');
    const out = list.map(readComponent), names = new Set();
    for (const { name } of out) { if (names.has(name)) throw new TypeError(`Two components are named ${name}`); names.add(name); }
    return out;
}

/** The lowest base and the highest top of a component's layers. */
export function componentSpan(component) { return { base: Math.min(...component.layers.map(l => l.height)), top: Math.max(...component.layers.map(l => l.height + l.thickness)) }; }

/**
 * The span its solid layers fill, [base, top] across every component, or null when none is solid: the
 * body's height_span. A component on a rig joint stands on that joint: `joint_height(name)` gives the
 * joint's posed height (null or omitted: the joint is at the entity's base), so a crouch lowers the span.
 */
export function solidSpan(components, joint_height = () => null) { return layersSpan(components, joint_height, true); }
/** The span its layers fill, [base, top], as solidSpan does, over every layer (`solid_only` false) or the solid ones. */
export function layersSpan(components, joint_height = () => null, solid_only = false) {
    let base = Infinity, top = -Infinity;
    for (const c of components) {
        const z = (c.joint ? joint_height(c.joint) : null) ?? 0;
        for (const l of c.layers) if (!solid_only || l.solid) { base = Math.min(base, z + l.height); top = Math.max(top, z + l.height + l.thickness); }
    }
    return base === Infinity ? null : [base, top];
}

/** A component's layers to draw, lowest first: [{component, layer}] across the list, by height, then layer, then list order. */
export function layersByHeight(components, { visible_only = true } = {}) {
    const out = [];
    components.forEach((component, order) => { for (const layer of component.layers) if (!visible_only || layer.visible) out.push({ component, layer, order }); });
    return out.sort((a, b) => a.layer.height - b.layer.height || a.layer.layer - b.layer.layer || a.order - b.order);
}

/**
 * A live view of one of an entity's components. Reads come from the entity's `components` property;
 * every change writes that property again, so it is saved and heard (`propertyChanged`) like any other.
 */
export class entityComponent {
    #entity; #name;
    constructor(entity, name) { this.#entity = entity; this.#name = name; Object.freeze(this); }
    #data() { const found = (this.#entity.get('components') ?? []).find(c => c.name === this.#name); if (!found) throw new Error(`The component ${this.#name} has been removed`); return found; }
    #change(edit) { const list = structuredClone(this.#entity.get('components')), i = list.findIndex(c => c.name === this.#name); if (i < 0) throw new Error(`The component ${this.#name} has been removed`); edit(list[i]); list[i] = readComponent(list[i]); this.#entity.set('components', list); return this; }
    get entity() { return this.#entity; }
    get name() { return this.#name; }
    get at() { return [...this.#data().at]; }
    get rotation() { return this.#data().rotation; }
    get joint() { return this.#data().joint; }
    get layers() { return structuredClone(this.#data().layers); }
    /** Its lowest layer's base height, above the entity's ground. */
    get base() { return componentSpan(this.#data()).base; }
    /** The top of its highest layer: base height plus thickness. */
    get top() { return componentSpan(this.#data()).top; }
    getLayer(layer) { const found = this.#data().layers.find(l => l.layer === layer); return found ? structuredClone(found) : null; }
    hasLayer(layer) { return this.#data().layers.some(l => l.layer === layer); }
    moveTo(x, y) { const at = Array.isArray(x) ? x : [x, y]; return this.#change(c => { c.at = at; }); }
    rotateTo(rotation) { return this.#change(c => { c.rotation = rotation; }); }
    /** Puts it on a rig joint (or back on the entity's origin with null). */
    setJoint(joint) { return this.#change(c => { c.joint = joint; }); }
    setLayerVisible(layer, visible) { return this.#editLayer(layer, l => { l.visible = visible; }); }
    setLayerSolid(layer, solid) { return this.#editLayer(layer, l => { l.solid = solid; }); }
    setLayerHeight(layer, height, thickness) { return this.#editLayer(layer, l => { l.height = height; if (thickness !== undefined) l.thickness = thickness; }); }
    /** Adds a layer, or replaces the one with the same number. */
    setLayer(packet) { const layer = readLayer(packet); return this.#change(c => { c.layers = [...c.layers.filter(l => l.layer !== layer.layer), layer]; }); }
    removeLayer(layer) { return this.#change(c => { if (c.layers.length === 1 && c.layers[0].layer === layer) throw new TypeError('A component keeps one layer or more'); c.layers = c.layers.filter(l => l.layer !== layer); }); }
    /** A point in the component's own space, in the entity's space (on its origin; a joint's offset is the rig's). */
    toEntity(local) { const [x, y] = local, { at, rotation } = this.#data(), c = Math.cos(rotation), s = Math.sin(rotation); return [at[0] + x * c - y * s, at[1] + x * s + y * c]; }
    #editLayer(layer, edit) { return this.#change(c => { const found = c.layers.find(l => l.layer === layer); if (!found) throw new TypeError(`${this.#name} has no layer ${layer}`); edit(found); }); }
}
