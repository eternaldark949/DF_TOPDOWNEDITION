import { aheadOf } from '../../engine/basement/rendering/index.mjs';
import { cityGround } from './city-ground.mjs';
import { cityBuildings } from './city-buildings.mjs';
import { cityFoliage } from './city-foliage.mjs';
import { sceneLighting, levelLights } from './lighting.mjs';
import GROUND from '../data/city-ground.json' with { type: 'json' };

/**
 * What a map's pictures need from the backend's picture cache (`new canvasRenderer({pictures})`): room
 * for the ground tiles, the buildings' strips and the light tiles round a moving view, a painting budget
 * a frame, and densities down to the light layer's (a half-size layer paints at half a pixel a unit).
 */
export const MAP_PICTURES = Object.freeze({ max_bytes: 160 * 1048576, budget_ms: 8, densities: Object.freeze([.125, .25, .5, 1, 1.5, 2, 3, 4]) });

/**
 * Any map drawn into a runtime frame, its parts by the map's switches, in paint order: the ground (`ground`),
 * what stands on it (`bodies(frame)`), the buildings over it (`buildings`), the plants behind the roofs taller
 * than each (`plants`), the night's light layer (`lighting`, a layer pass at `light_scale`), and what shines
 * through the dark (lit windows, signs and lamps, added). `new mapScene({sections, definition, physics, rooms,
 * switches, soft_lights})` takes the map's sections and Basement definition; `render(frame, {view, zoom, time,
 * lamps, props, bodies})` takes the view's world bounds, the lamps and props the map has streamed in, and the
 * time in seconds; the camera's motion is read from the view, so what is readied ahead leads it.
 */
export class mapScene {
    #ground = null; #buildings = null; #foliage = null; #lighting = null; #extent; #rooms; #sky; #scale; #definition; #last = null; #velocity = [0, 0]; #kind;
    constructor({ sections, definition, physics, rooms, switches, soft_lights = [], sky_darkness = .6, light_scale = .5 }) {
        if (switches.buildings) this.#buildings = new cityBuildings(sections);
        if (switches.plants) this.#foliage = new cityFoliage(sections);
        if (switches.ground) this.#ground = new cityGround(sections, { size: definition.size, buildings: this.#buildings });
        if (switches.lighting) this.#lighting = new sceneLighting(physics);
        this.#definition = { ...definition, soft_lights }; this.#rooms = rooms; this.#sky = sky_darkness; this.#scale = light_scale;
        this.#kind = definition.kind === 'exterior' ? 'outdoor' : 'indoor';
        this.#extent = { left: 0, top: 0, right: definition.size[0], bottom: definition.size[1] };
    }
    render(frame, { view, zoom = 1, time = 0, lamps = [], props = [], bodies = () => {} }) {
        const camera = [(view.left + view.right) / 2, (view.top + view.bottom) / 2];
        if (this.#last) { const dt = time - this.#last.time; if (dt > 0) { const k = Math.min(1, dt * 6); for (let i = 0; i < 2; i++) this.#velocity[i] += ((camera[i] - this.#last.camera[i]) / dt - this.#velocity[i]) * k; } }
        this.#last = { time, camera };
        const velocity = this.#velocity;
        if (this.#ground) for (const d of this.#ground.createDraws({ view, ahead: aheadOf({ margin: GROUND.tile_ahead, velocity }) }))
            frame.submit({ type: 'picture', picture: { key: d.key, bounds: d.bounds, build: d.build }, prepare: d.prepare });
        bodies(frame);
        if (this.#buildings) submitEntries(frame, this.#buildings.createDraws({ view, camera, zoom, time }));
        if (this.#foliage) submitEntries(frame, this.#foliage.createDraws({ view, camera, zoom, time, covers: this.#buildings?.covers(view, camera, zoom) ?? [] }));
        if (this.#lighting) {
            const level = { lamps, props, definition: this.#definition };
            const layer = this.#lighting.createLayer({ extent: this.#extent, bounds: view, ahead: aheadOf({ margin: this.#lighting.look.tile_ahead, velocity }), kind: this.#kind, rooms: this.#rooms, sky_darkness: this.#sky, lights: levelLights(level), time });
            frame.beginPass({ layer: { scale: this.#scale, opacity: layer.opacity } }); submitEntries(frame, layer.packets); frame.endPass();
        }
        if (this.#buildings) { frame.beginPass({ layer: { blend: 'add' } }); submitEntries(frame, this.#buildings.createGlow({ view, camera, zoom, time, dark: .9 })); frame.endPass(); }
    }
}

/** Draw entries (packets, and `{picture, blend, opacity, prepare, clips}` pictures) as frame packets, in order. */
export function submitEntries(frame, entries) {
    for (const e of entries) {
        if (!e.picture) { frame.submit(e); continue; }
        frame.submit({ type: 'picture', picture: e.picture, blend: e.blend ?? 'normal', opacity: e.opacity ?? 1, prepare: e.prepare === true, ...(!e.prepare && e.clips?.length ? { clips: e.clips } : {}) });
    }
}
