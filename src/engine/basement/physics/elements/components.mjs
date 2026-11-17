// ===== LV0 BASEMENT =====
// COMPONENTS: the parts an entity is made of. A component is like a mesh: shapes, placed at `at`
// (turned by `rotation`) from the entity's origin, or from a rig joint when it names one. Its shapes
// sit on integer layers; each layer has its own base `height` above the component's layer 0 and its
// own `thickness`, in world units, so a floor slab, a gap and a roof are three layers. A layer with
// `sides` (a paint) shows its walls when the render system leans heights toward the camera. The entity's
// height is the highest top among its components. Components are plain data, kept in the entity's
// `components` property, so they save, load and change like any property. Lengths are world units:
// data written in metres is turned into units by the Directory when it loads.

const COMPONENT = Object.freeze(['name', 'at', 'rotation', 'joint', 'layers']);
const LAYER = Object.freeze(['layer', 'height', 'thickness', 'steps', 'drawing', 'solid', 'visible', 'sides']);
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
    if (packet.sides !== undefined && (typeof packet.sides !== 'string' || !packet.sides)) throw new TypeError(`${where}'s sides are a paint colour (or a "$look" value)`);
    for (const flag of ['solid', 'visible']) if (packet[flag] !== undefined && typeof packet[flag] !== 'boolean') throw new TypeError(`${where}'s ${flag} is true or false`);
    return { layer: packet.layer, height: length(packet.height ?? 0, `${where}'s height`, -Infinity), thickness: length(packet.thickness ?? 0, `${where}'s thickness`),
        ...(packet.steps !== undefined ? { steps: structuredClone(packet.steps) } : { drawing: packet.drawing }),
        solid: packet.solid ?? true, visible: packet.visible ?? true, ...(packet.sides !== undefined ? { sides: packet.sides } : {}) };
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
