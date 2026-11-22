// THE ENGINE PREVIEW: walk the game's maps on the new engine. Not the game: no story, no mechanics, only the maps in
// src/game/data with a person to walk them, their exits to travel through, the world's clock and weather to change.
// It is built into one page by tools/build-preview.mjs, which hands it every library as `libraries`.
import { gameEngine } from '../../src/engine/game-engine.mjs';
import { mapLevel } from '../../src/engine/lobby/runtime/map-level.mjs';
import { travelSystem } from '../../src/engine/lobby/runtime/travel-system.mjs';
import { createEngineRegistry, mapDefinition, doorKindsOf } from '../../src/engine/directory/index.mjs';
import { humanoid, objectPacket } from '../../src/engine/penthouse/index.mjs';

const KEYMAP = {
    move_left: ['a', 'ArrowLeft'], move_right: ['d', 'ArrowRight'], move_up: ['w', 'ArrowUp'], move_down: ['s', 'ArrowDown'],
    interact: ['e', 'Enter', 'space', 'gamepadA', 'gamepadY', 'touchInteract'],
    run: ['Shift', 'gamepadRBumper'], zoom_in: ['=', '+', 'gamepadDUp'], zoom_out: ['-', '_', 'gamepadDDown']
};
const ZOOMS = [.5, .7, 1, 1.4, 2, 2.8];

/** Boots the preview on the page's `#view` canvas with the game's `libraries`; `hud` is the page's controls (see main.mjs). */
export async function bootPreview({ libraries, hud }) {
    const registry = createEngineRegistry({ libraries });
    const maps = libraries.filter(l => l.resources?.map?.kind === 'map').map(l => ({ id: l.library_id, label: l.resources.map.label ?? l.library_id }));
    const engine = new gameEngine({
        asset_library: registry, time: registry.getResource('time:city_clock'), weather: registry.getResource('weather:city_weather'),
        controls: { keymap: KEYMAP, vectors: { move: { gamepad: 'left', touch: 'move', dead_zone: .15 } } },
        camera: { zoom: 1 },
        // Each backend draws on a fresh canvas (a canvas keeps the first kind of context it gives): it takes the old one's place.
        render: { create_surface: () => { const next = document.createElement('canvas'); next.id = 'view'; document.getElementById('view').replaceWith(next); return next; } }
    });
    const { physics, camera, render, controls } = engine.basement;
    await render.setRenderer('canvas');
    const fit = () => { const ratio = Math.min(devicePixelRatio || 1, 2); render.resize({ width: innerWidth, height: innerHeight, pixel_ratio: ratio }); };
    fit(); addEventListener('resize', fit);

    // The person who walks: the engine's humanoid, kept across every map.
    const look = registry.resolveTemplate('engine:humanoid').look;
    const person = new humanoid(physics, { position: [0, 0], name: 'walker', look: { ...look, lean: .35, values: { ...look.values, shirt: '#6b3fa0', hair: '#1d1520' } } });
    engine.retainEntity(person.entity);
    let zoom = 3, speed = 1;

    class mapPlace extends mapLevel {
        mapDefinition({ assets }) {
            return { definition: mapDefinition(assets, `${this.level_id}:map`), map_options: { door_kinds: doorKindsOf(assets), make_object: (record, at, overrides) => objectPacket(assets, record, at, overrides) } };
        }
        // Only the walker streams the map and stands on its exits.
        mapFocuses() { return [{ position: person.entity.position, velocity: person.entity.linear_velocity }]; }
        exitFocuses() { return [person.entity]; }
        // The city's people are humanoids (a rig to animate each step); its cars are plain entities of their templates.
        makeAgent(context, name, profile, pose) {
            if (profile.template !== 'engine:humanoid') return super.makeAgent(context, name, profile, pose);
            const pick = profile.looks?.[Math.floor(Math.random() * profile.looks.length)] ?? {};
            const someone = new humanoid(physics, { position: pose.position, rotation: pose.rotation, name, look: { ...look, lean: .35, values: { ...look.values, ...pick } } });
            return { entity: someone.entity, updateState: () => someone.updateState(), remove: () => someone.remove() };
        }
        enter(context, prepared) {
            super.enter(context, prepared);
            const [w, h] = this.definition.size, top = this.definition.camera_bounds?.top ?? 0;
            camera.setBounds({ left: 0, top, right: w, bottom: h });
            camera.follow(person.entity, { smoothing: .12 });
            hud.arrived(this.level_id, this.definition.label ?? this.level_id);
        }
    }
    for (const { id } of maps) engine.registerLevel(id, mapPlace);

    const travel = new travelSystem({ get_travellers: () => [person.entity] });
    engine.registerSystem('travel', travel);
    travel.onExitChanged(exit => hud.exit(exit));
    // Each step: walk where the stick or keys say, face the way you walk, animate, take an exit when asked.
    engine.registerSystem('walker', {
        beforePhysics(context) {
            const [x, y] = controls.direction('move'), fast = controls.active('run') ? 1.8 : 1;
            person.entity.motor.setMovement([x * speed * fast, y * speed * fast], { face_movement: true });
            person.updateState();
            if (controls.justActivated('interact') && travel.exit?.available) go();
            if (controls.justActivated('zoom_in')) setZoom(zoom + 1);
            if (controls.justActivated('zoom_out')) setZoom(zoom - 1);
        },
        // An exit's doorway may open onto the map's edge: the walker stays on the map.
        afterPhysics(context) {
            const level = context.engine.active_level, size = level?.definition?.size; if (!size) return;
            const [x, y] = person.entity.position, r = 12, cx = Math.min(Math.max(x, r), size[0] - r), cy = Math.min(Math.max(y, r), size[1] - r);
            if (cx !== x || cy !== y) physics.updateBody(person.entity, { position: [cx, cy] });
        }
    });
    const setZoom = k => { zoom = Math.max(0, Math.min(ZOOMS.length - 1, k)); camera.setView({ zoom: ZOOMS[zoom] }); hud.zoomed(ZOOMS[zoom]); };

    let busy = null;
    const go = async (target) => {
        if (busy) return busy;
        busy = (async () => {
            hud.fade(true); await new Promise(r => setTimeout(r, 180));
            try { if (target) await engine.loadLevel(target, { travellers: [person.entity.entity_id] }); else await travel.travel(); }
            catch (error) { hud.error(error); }
            camera.setView({ position: person.entity.position, zoom: ZOOMS[zoom] });
            hud.fade(false);
        })();
        try { return await busy; } finally { busy = null; }
    };

    hud.setup({
        maps, zoom_now: ZOOMS[zoom],
        pick: id => go(id),
        take: () => travel.exit?.available && go(),
        setTime: hhmm => engine.time.setTime({ time: hhmm }),
        setSpeed: k => engine.time.setSpeed(k),
        setWeather: (state, intensity) => engine.weather.set(state, intensity),
        zoom: d => setZoom(zoom + d),
        stick: (zone, knob) => controls.touch.stick('move', { zone, knob, anchor: 'touch', travel: 48 }),
        button: element => controls.touch.button(element, 'touchInteract'),
        clock: () => engine.time.text(),
        weather: () => ({ state: engine.weather.state, intensity: engine.weather.intensity }),
        where: () => person.entity.position,
        // A backend that cannot start (no WebGL 2) leaves the old one drawing: its canvas goes back on the page.
        renderer: async id => { const old = document.getElementById('view'); try { await render.setRenderer(id); } catch (error) { document.getElementById('view').replaceWith(old); throw error; } fit(); return render.renderer_id; }
    });
    const start = decodeURIComponent(location.hash.slice(1)) || new URLSearchParams(location.search).get('map') || 'apt_949';   // (#sdc or ?map=sdc opens on that map)
    await go(maps.some(m => m.id === start) ? start : maps[0].id);
    engine.start();
    return engine;
}
