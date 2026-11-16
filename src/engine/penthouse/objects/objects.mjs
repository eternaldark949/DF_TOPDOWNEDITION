// ===== LV3 PENTHOUSE =====
// OBJECTS: one way to make anything in the world from a catalog record. A record is a Directory
// template (or an inline record) whose fields switch its parts on:
//   kind   what it is to physics (prop, character, vehicle, ...)
//   assets.drawing  its look: a drawing resource, drawn every frame by the render system
//   look          {values, scale, layer, depth, visible}: the values the drawing reads, kept as the `look` property
//   bounds        circle | box | capsule | hull: collision bounds fitted from the drawing's solid steps
//   collision_shape  an explicit shape, which always wins over `bounds`
//   assets.material  a material resource whose `surface` sets the body's friction and restitution
//   data          its starting properties
// Nothing here knows which record it is making.
import { fitBounds, drawingReach } from '../../basement/rendering/index.mjs';
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
    const drawing_id = resolved.assets?.drawing;
    if (resolved.bounds !== undefined && !drawing_id) throw new TypeError('Fitted bounds need a drawing asset');
    if (drawing_id) {
        const drawing = source.getResource(drawing_id);
        if (drawing.kind !== 'drawing') throw new TypeError(`${drawing_id} is not a drawing`);
        validateDrawing(drawing, drawing_id);
        const values = look?.values ?? {};
        if (resolved.bounds !== undefined && resolved.collision_shape === undefined) extra.collision_shape = fitBounds(drawing.steps, resolved.bounds, { values });
        if (resolved.render_shape === undefined) extra.render_shape = drawingReach(drawing.steps, { values });
    }
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
