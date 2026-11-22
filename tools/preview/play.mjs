// THE ENGINE PREVIEW: walk the game's maps on the new engine. Not the game: no story, no mechanics, only the maps in
// src/game/data with a person to walk them, their exits to travel through, the world's clock and weather to change.
// It is built into one page by tools/build-preview.mjs, which hands it every library as `libraries`.
import { gameEngine } from '../../src/engine/game-engine.mjs';
import { readComponents } from '../../src/engine/basement/physics/index.mjs';
import { mapLevel } from '../../src/engine/lobby/runtime/map-level.mjs';
import { travelSystem } from '../../src/engine/lobby/runtime/travel-system.mjs';
import { createEngineRegistry, mapDefinition, doorKindsOf, screensOf, fontsOf } from '../../src/engine/directory/index.mjs';
import { mountPreviewSticks } from './sticks.mjs';
import { previewWeapons, weaponChoices } from './weapons.mjs';
import { humanoid, objectPacket } from '../../src/engine/penthouse/index.mjs';

const KEYMAP = {
    move_left: ['a', 'ArrowLeft'], move_right: ['d', 'ArrowRight'], move_up: ['w', 'ArrowUp'], move_down: ['s', 'ArrowDown'],
    preview_fire: ['f'], aim_fire: ['touchAimFire', 'gamepadRTrigger'],
    interact: ['e', 'Enter', 'space', 'gamepadA', 'gamepadY', 'touchInteract'],
    run: ['Shift', 'gamepadRBumper'], pause: ['Escape', 'p', 'gamepadStart'], zoom_in: ['=', '+', 'gamepadDUp'], zoom_out: ['-', '_', 'gamepadDDown']
};
const ZOOMS = [.5, .7, 1, 1.4, 2, 2.8];

/** Boots the preview on the page's `#view` canvas with the game's `libraries`; `hud` is the page's controls (see main.mjs). */
export async function bootPreview({ libraries, hud }) {
    const registry = createEngineRegistry({ libraries });
    const maps = libraries.filter(l => l.resources?.map?.kind === 'map').map(l => ({ id: l.library_id, label: l.resources.map.label ?? l.library_id }));
    const engine = new gameEngine({
        asset_library: registry, time: registry.getResource('time:city_clock'), weather: registry.getResource('weather:city_weather'),
        controls: { keymap: KEYMAP, vectors: { move: { gamepad: 'left', touch: 'move', dead_zone: .15 }, aim: { gamepad: 'right', touch: 'aim', dead_zone: .08 } } },
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
    const walker_look = { ...look, lean: .35, values: { ...look.values, shirt: '#6b3fa0', hair: '#1d1520' } };
    const template = 'wardrobe:preview_walker';
    const person = new humanoid(physics, { template, position: [0, 0], name: 'walker', look: walker_look });
    const base_parts = registry.resolveTemplate(template).components;
    const outfit = registry.resolveTemplate('wardrobe:outfit_sorcerer_long');
    const wig = registry.resolveTemplate('wardrobe:wig_ponytail_black');
    const chain = wig.data.chain;
    let wardrobe_changed = false;

    function applyWardrobe() {
        wardrobe_changed = false;
        const outfit_on = ui.getValue('wardrobe.outfit_sorcerer_long');
        const wig_on = ui.getValue('wardrobe.wig_ponytail_black');
        const parts = new Map(base_parts.map(part => [part.name, part]));
        const values = { ...walker_look.values };
        for (const item of [outfit_on && outfit, wig_on && wig].filter(Boolean)) {
            for (const part of item.components) parts.set(part.name, part);
            Object.assign(values, item.look.values);
        }
        person.entity.set('components', readComponents([...parts.values()]));
        person.entity.set('look', { ...walker_look, values });
        const wearing_wig = physics.rigs.getPhysicalChains(person.entity).some(current => current.chain_id === chain.chain_id);
        if (wig_on && !wearing_wig) physics.rigs.createPhysicalChain(person.entity, chain);
        if (!wig_on && wearing_wig) physics.rigs.removePhysicalChain(person.entity, chain.chain_id);
    }
    engine.retainEntity(person.entity);
    let zoom = 3, speed = 1, place = '';

    // The screens: the game's main menu, pause menu and its pages and HUD, all data (src/game/data/libraries/screens.json).
    // The preview hands them live values by name and hears what they set and ask for.
    const ui = engine.ui;
    const choices = weaponChoices(registry);
    const screens = screensOf(registry);
    const settings = screens.find(screen => screen.name === 'pause.settings');
    settings.items.find(item => item.id === 'panel').items.find(item => item.id === 'preview_weapon').choices = choices;
    ui.define(screens); ui.addFonts(fontsOf(registry)).catch(error => console.warn('A font did not load', error));
    const titled = word => word ? word[0].toUpperCase() + word.slice(1) : '';
    ui.provide('place', () => place).provide('clock', () => engine.time.text()).provide('weather', () => titled(engine.weather.state))
      .provide('player', { health: 100, pp: 0 }).provide('saves', { can_save: false, slots: [] });
    ui.setValue('options', { time_speed: 12, weather: engine.weather.state, zoom: ZOOMS[zoom], renderer: 'canvas', dev_bar: true });
    ui.setValue('preview_weapon', 'none');
    const weapons = previewWeapons(engine, registry, person.entity);
    engine.registerSystem('preview_weapons', weapons);
    ui.setValue('wardrobe', { available: true, outfit_sorcerer_long: false, wig_ponytail_black: false });
    ui.on('set', ({ path, value }) => {
        if (path === 'wardrobe.outfit_sorcerer_long' || path === 'wardrobe.wig_ponytail_black') wardrobe_changed = true;
        if (path === 'options.time_speed') engine.time.setSpeed(value);
        if (path === 'options.weather' && engine.weather.state !== value) engine.weather.set(value, 'normal');
        if (path === 'options.zoom' && ZOOMS[zoom] !== value) setZoom(ZOOMS.indexOf(value));
        if (path === 'options.renderer' && render.renderer_id !== value) switchRenderer(value).then(id => hud.rendered(id), error => { hud.error(error); ui.setValue('options.renderer', render.renderer_id); });
        if (path === 'options.dev_bar') document.body.classList.toggle('no-bar', !value);
    });
    ui.on('new_game', () => ui.close('main'));
    ui.on('exit', () => ui.close('main'));

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
            place = this.definition.label ?? this.level_id;
            hud.arrived(this.level_id, place);
        }
    }
    for (const { id } of maps) engine.registerLevel(id, mapPlace);

    const travel = new travelSystem({ get_travellers: () => [person.entity] });
    engine.registerSystem('travel', travel);
    travel.onExitChanged(exit => hud.exit(exit));
    // Each step: walk where the stick or keys say, face the way you walk, animate, take an exit when asked.
    engine.registerSystem('walker', {
        beforePhysics(context) {
            if (wardrobe_changed) applyWardrobe();
            const [x, y] = controls.direction('move'), fast = controls.active('run') ? 1.8 : 1;
            const aim = weapons.aimDirection(), aiming = aim.some(Boolean);
            const motor = person.entity.motor;
            motor.setMovement([x * speed * fast, y * speed * fast], { face_movement: !aiming });
            if (aiming) motor.lookInDirection(aim, { turn_speed: 60 });
            else if (motor.facing) motor.clearFacing();
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
    const setZoom = k => { zoom = Math.max(0, Math.min(ZOOMS.length - 1, k)); camera.setView({ zoom: ZOOMS[zoom] }); hud.zoomed(ZOOMS[zoom]); if (ui.getValue('options.zoom') !== ZOOMS[zoom]) ui.setValue('options.zoom', ZOOMS[zoom]); };

    // A backend that cannot start (no WebGL 2) leaves the old one drawing: its canvas goes back on the page.
    async function switchRenderer(id) { const old = document.getElementById('view'); try { await render.setRenderer(id); } catch (error) { document.getElementById('view').replaceWith(old); throw error; } fit(); return render.renderer_id; }

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
        setSpeed: k => { engine.time.setSpeed(k); ui.setValue('options.time_speed', k); },
        setWeather: (state, intensity) => { engine.weather.set(state, intensity); ui.setValue('options.weather', state); },
        zoom: d => setZoom(zoom + d),
        button: element => controls.touch.button(element, 'touchInteract'),
        clock: () => engine.time.text(),
        weather: () => ({ state: engine.weather.state, intensity: engine.weather.intensity }),
        where: () => person.entity.position,
        renderer: async id => { const now = await switchRenderer(id); ui.setValue('options.renderer', now); return now; }
    });
    const start = decodeURIComponent(location.hash.slice(1)) || new URLSearchParams(location.search).get('map') || 'apt_949';   // (#sdc or ?map=sdc opens on that map)
    await go(maps.some(m => m.id === start) ? start : maps[0].id);
    ui.open('hud');
    mountPreviewSticks(ui, controls, weapons);
    if (!new URLSearchParams(location.search).has('nomenu')) ui.open('main');   // (?nomenu goes straight to walking)
    engine.start();
    return engine;
}
