// ===== LV3 PENTHOUSE =====
// OBJECTS: one way to make anything in the world from a catalog record. A record is a Directory
// template (or an inline record) whose fields switch its parts on:
//   kind   what it is to physics (prop, character, vehicle, ...)
//   assets.drawing  its look: a drawing resource, drawn every frame by the render system
//   look          {values, scale, layer, depth, visible}: the values the drawing reads, kept as the `look` property
//   bounds        circle | box | capsule | hull: collision bounds fitted from the drawing's solid steps
//   collision_shape  an explicit shape, which always wins over `bounds`
//   assets.material  a material resource whose `surface` sets the body's friction and restitution
//   components    the parts it is made of: [{name, at, rotation, joint, layers: [{layer, height, thickness, steps | drawing, solid, visible}]}]
//                 Fitted bounds take every solid layer of every component, with the drawing's solid steps.
//   data          its starting properties
// Nothing here knows which record it is making.
import { fitBounds, drawingReach, componentSteps, qualifyResource } from '../../basement/rendering/index.mjs';
import { readComponents } from '../../basement/physics/index.mjs';
import { validateDrawing, validateMaterial } from '../../directory/index.mjs';

const SURFACE = Object.freeze(['friction', 'restitution']);

/** The entity packet a record makes at `at`: the record's fields plus everything worked out from its look. */
export function objectPacket(source, record, at = [0, 0], overrides = {}) {
    if (!source || typeof source.resolveTemplate !== 'function' || typeof source.getResource !== 'function') throw new TypeError('createObject needs the world\'s data source');
    const base = typeof record === 'string' ? { template: record } : record;
    if (!base || typeof base !== 'object' || Array.isArray(base)) throw new TypeError('A record is a template id or a plain record');
    const packet = { ...base, ...overrides, position: at }, resolved = source.resolveTemplate(packet.template, packet);
    const extra = {}, look = resolved.look;
    if (look !== undefined) {
        if (!look || typeof look !== 'object' || Array.isArray(look)) throw new TypeError('A look is {values, scale, layer, depth, visible}');
        extra.data = { ...(packet.data ?? {}), look };
    }
    const drawing_id = resolved.assets?.drawing, components = resolved.components === undefined ? null : readComponents(resolved.components);
    // A layer's bare drawing name is in its record's own library.
    if (components && typeof packet.template === 'string') for (const c of components) for (const layer of c.layers) if (layer.drawing) layer.drawing = qualifyResource(layer.drawing, packet.template);
    if (resolved.bounds !== undefined && !drawing_id && !components) throw new TypeError('Fitted bounds need a drawing asset or components');
    if (drawing_id || components) {
        let drawing = null;
        if (drawing_id) {
            drawing = source.getResource(drawing_id);
            if (drawing.kind !== 'drawing') throw new TypeError(`${drawing_id} is not a drawing`);
            validateDrawing(drawing, drawing_id);
        }
        if (components) { extra.components = components; for (const c of components) for (const layer of c.layers) if (layer.drawing) validateDrawing(source.getResource(layer.drawing), layer.drawing); }
        const values = look?.values ?? {}, own = drawing?.steps ?? [];
        if (resolved.bounds !== undefined && resolved.collision_shape === undefined) extra.collision_shape = fitBounds([...own, ...(components ? componentSteps(components, source, { solid_only: true }) : [])], resolved.bounds, { values });
        if (resolved.render_shape === undefined) extra.render_shape = drawingReach([...own, ...(components ? componentSteps(components, source) : [])], { values });
    }
    // What it does to light: whether it stops the light grid's glow (a building), and the lights it carries.
    for (const key of ['blocks_light', 'lights']) if (resolved[key] !== undefined && packet[key] === undefined) extra[key] = resolved[key];
    const material_id = resolved.assets?.material;
    if (material_id) {
        const material = source.getResource(material_id);
        if (material.kind !== 'material') throw new TypeError(`${material_id} is not a material`);
        validateMaterial(material, material_id);
        for (const key of SURFACE) if (material.surface?.[key] !== undefined && resolved[key] === undefined) extra[key] = material.surface[key];
    }
    return { ...packet, ...extra };
}

/** Makes an object from a record at `at` in a world's `elements`. `engine.createObject` is the same call, with level lifetime. */
export function createObject(elements, record, at = [0, 0], overrides = {}) {
    return elements.createEntity(objectPacket(elements.asset_library, record, at, overrides));
}
