#!/usr/bin/env node
/*
 * DFAB build: stitches src/ back into the single playable file.
 *
 *   node tools/build.mjs          build "DFAB V8.html"
 *   node tools/build.mjs --check  exit 1 if "DFAB V8.html" is out of date (CI)
 *
 * Files in assets/images and assets/audio are embedded as data URIs in the
 * ASSETS table (see src/legacy/core/assets.js for getImage / drawAsset / playSound).
 * Files in assets/fonts become @font-face rules, named after the file.
 * A .json file in SCRIPTS is a GAME_DB chapter (src/game/data/game-db/): it goes in as
 * `GAME_DB.<file name> = <its JSON>;`, so the data stays plain JSON that editors and tools can read.
 *
 * No dependencies. The game is plain classic <script> code sharing one global
 * scope, so the ORDER below matters: a file can only use, at load time, what
 * files above it declared (classes before subclasses, systems before the code
 * that instantiates them). Add a new file by putting it in the right place here.
 *
 * Each file is its own script (src/legacy/app/boot-loader.js runs them one after another
 * under the loading screen), so a function declared in a later file is not hoisted
 * into an earlier one either: at load time, `factory: createThing` needs createThing's
 * file above; `factory: (...a) => createThing(...a)` works from anywhere. Inside a
 * function body anything goes, as before. The regression runner runs the files the
 * same way, so a slip shows up there as a ReferenceError naming the file.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inlineLoadingArt } from './loading-art.mjs';
import { bundleNative } from './bundle-native.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'DFAB V8.html';

const STYLES = [
    'legacy/styles/loading-screen.css',   // first: the loading screen paints before anything else has parsed
    'legacy/styles/base.css',
    'legacy/styles/hud-menus.css',
    'legacy/styles/panels-phone.css',
    'legacy/styles/cinematic.css',
    'legacy/styles/coach.css',
    'legacy/styles/dossier.css',
    'legacy/styles/shops.css',
    'legacy/styles/landscape.css',
];

const SCRIPTS = [
    'legacy/basement/frame-clock.js',     // LV0 Basement: the frame clock's globals (_frameTime, _simTick, _gameTimeSec), first
    'legacy/basement/timer-kit.js',       // LV0 Basement: gTimer and game_timers (timers in game time, on the sim ticks)
    'legacy/basement/canvas-kit.js',      // LV0 Basement: canvasKit (off-screen layers)
    'legacy/basement/life-kit.js',        // LV0 Basement: lifeKit (lists of short-lived things)
    'legacy/basement/sound-kit.js',       // LV0 Basement: soundKit (Web Audio building blocks)
    'legacy/basement/sound-system.js',    // LV0 Basement: soundSystem (context, channels, volume dial, reverb, sounds by packet)
    'legacy/basement/entity-base.js',     // LV0 Basement: GameEntity (the base of everything that moves or collides)
    'legacy/basement/shape-kit.js',       // LV0 Basement: shapeKit (collision geometry)
    'legacy/basement/spatial-grid.js',    // LV0 Basement: SpatialHashGrid and the render / transition grids
    'legacy/basement/collision-kit.js',   // LV0 Basement: collisionKit and collisionWorld (the collision step, game-free: layers, grid, passes, solver)
    'legacy/basement/vehicle-kit.js',     // LV0 Basement: vehicleKit (driving, out of walls, car-to-car contact: game-free)
    '@native',                    // Native ESM engine/Directory graph, linked from the original sources
    'legacy/basement/controls-system.js', // LV0 Basement: controlsSystem (keyboard, mouse, touch and gamepad instances, touch sticks, keymap, action table)
    'legacy/basement/recorder-kit.js',    // LV0 Basement: gRecorder (inputs recorded per tick, played back through the controls)
    'legacy/basement/lane-rail-kit.js',   // LV0 Basement: railKit (things that run along a line: sampled curves, pedals, following)
    'legacy/basement/ui-kit.js',          // LV0 Basement: uiKit (making, showing and hiding DOM panels)
    'legacy/basement/draw-list.js',       // LV0 Basement: drawList and canvasRenderer (what to draw, apart from how)
    'legacy/basement/material-kit.js',    // LV0 Basement: materialKit (linked materials and finish rules)
    'legacy/basement/virtual-child.js',   // LV0 Basement: virtualChild (things that ride on a parent without being its child)
    'legacy/basement/angle-kit.js',       // LV0 Basement: angleKit (degrees in the data, radians in the code)
    'legacy/basement/query-kit.js',       // LV0 Basement: queryKit (find, filter and sort location packets)
    'legacy/basement/render-system.js',   // LV0 Basement: renderQueue (shapes sorted by depth, same-style ones drawn in one call)
    'legacy/basement/awareness-kit.js',   // LV0 Basement: awarenessMatrix (what a character knows of what's around them)
    'legacy/directory/game-db/game-db.js',   // LV2 Directory: GAME_DB, the game's data; its chapters (JSON) follow
    'game/data/game-db/items.json',   // GAME_DB.items: gear, augments, furniture, consumables, drinks, notes, schematics
    'game/data/game-db/shops.json',   // GAME_DB.shops: the auto shop's prices and colours, the dyer's fee and palette
    'game/data/game-db/progression.json',   // GAME_DB.progression: Resonance, the three trees, abilities, talk perks
    'game/data/game-db/audio.json',   // GAME_DB.audio: music per map, reverb rooms, sound lengths and caps, motors, footstep floors
    'game/data/game-db/enemies.json',   // GAME_DB.enemies: enemy kinds, drones, the bosses and their hazards, the Horde Gauntlet
    'game/data/game-db/vehicles.json',  // GAME_DB.vehicles: car brands and models, the BlackMark's look, the Zibs, traffic tempers, the driving feel
    'game/data/game-db/places.json',    // GAME_DB.places: the maps, their rooms and doors, the city's landmark blocks, the fireplaces
    'game/data/game-db/story.json',     // GAME_DB.story: the story's parts and steps (code in STORY_STEP_HOOKS), mission kinds, crew nights, the van's drop
    'game/data/game-db/dialogue.json',  // GAME_DB.dialogue: the bonding talks and tiers, the crew's lines and texts, the prologue's poem
    'game/data/game-db/cast.json',      // GAME_DB.cast: speaker colours, the scene cast, the crew's spots at home, every named look, the wardrobe, finishes and materials
    'legacy/core/config.js',                   // reads GAME_DB.vehicles and .places, so it comes after the chapters
    '@assets',              // generated from the assets/ folder
    'legacy/core/assets.js',
    'legacy/core/registries.js',
    'legacy/directory/game-materials.js',    // LV2 Directory: the game's finishes and named materials (links the cosmetics)
    'legacy/core/resonance.js',
    'legacy/core/utils.js',
    'legacy/world/navigation.js',
    'legacy/world/walker.js',
    'legacy/core/draw-helpers.js',
    'legacy/core/cache-db.js',
    'legacy/core/appearances.js',
    'legacy/core/settings.js',
    'legacy/story/story-db.js',
    'legacy/story/captions.js',
    'legacy/directory/game-sound.js',
    'legacy/directory/game-controls.js',    // LV2 Directory: dfKeyMap and dfActions (which keys and buttons do what)
    'legacy/world/weather.js',
    'legacy/world/weather-response.js',
    'legacy/world/particles-decals.js',
    'legacy/presentation/indoor-door.js',
    'legacy/world/rooms.js',
    'legacy/world/maps.js',
    'legacy/world/map-entities.js',
    'legacy/directory/collision-system.js',
    'legacy/entities/props-decor.js',
    'legacy/entities/prop-sprites.js',
    'legacy/entities/vehicles-minigames.js',
    'legacy/entities/lamps.js',
    'legacy/entities/actors.js',
    'legacy/entities/static-builders-profiler.js',
    'legacy/entities/performance-bench.js',
    'legacy/entities/street-objects.js',
    'legacy/entities/npc.js',
    'legacy/entities/pedestrians.js',
    'legacy/directory/venue-crowd.js',
    'legacy/directory/lobby-life.js',
    'legacy/directory/club-life.js',
    'legacy/directory/cafe-life.js',
    'legacy/directory/world-query.js',    // LV2 Directory: worldQuery (rooms, seats, NPCs, loot, doors, landmarks, buildings as packets)
    'legacy/engine/furniture.js',
    'legacy/presentation/gatling-gunner.js',
    'legacy/presentation/classic-actor-packets.js',
    'legacy/entities/enemies.js',
    'legacy/entities/hunters.js',
    'legacy/entities/drones.js',
    'legacy/presentation/marionette.js',
    'legacy/entities/marionettes.js',
    'legacy/buildings/building-v1.js',
    'legacy/buildings/building-v2.js',
    'legacy/buildings/landmark-kit.js',
    'legacy/buildings/ornament-kit.js',
    'legacy/buildings/tiered-kit.js',
    'legacy/buildings/entrance-lamps.js',
    'legacy/buildings/silver-queen.js',
    'legacy/buildings/double-nights.js',
    'legacy/buildings/moon-city.js',
    'legacy/buildings/cozy-cafe.js',
    'legacy/buildings/street-variants.js',
    'legacy/buildings/street-arcade.js',
    'legacy/buildings/street-apartments.js',
    'legacy/buildings/sky-craft.js',
    'legacy/buildings/sky-layer.js',
    'legacy/buildings/factories.js',
    'legacy/buildings/city-view.js',
    'legacy/buildings/registry-v3.js',
    'legacy/buildings/biggs-park.js',
    'legacy/buildings/neural-systems.js',
    'legacy/buildings/torque-auto.js',
    'legacy/buildings/dr-yins.js',
    'legacy/buildings/warehouse-hall.js',
    'legacy/buildings/suburb-house.js', 'legacy/buildings/town-gate.js',
    'legacy/buildings/ashgrove.js',
    'legacy/buildings/enni-cole.js',
    'legacy/buildings/silver-queen-deco.js',
    'legacy/buildings/moon-city-deco.js',
    'legacy/traffic/roads.js',
    'legacy/traffic/garage-zib.js',
    'legacy/traffic/zen-art.js',
    'legacy/traffic/car-art.js',
    'legacy/traffic/traffic-vehicle.js',
    'legacy/directory/game-vehicles.js', // One classic-client vehicle construction boundary
    'legacy/traffic/vehicle-occupants.js',
    'legacy/traffic/traffic-people.js',
    'legacy/traffic/traffic-signals.js',
    'legacy/traffic/lane-runner.js',
    'legacy/traffic/traffic-manager.js',
    'legacy/traffic/traffic-profiler.js',
    'legacy/world/parks.js',
    'legacy/world/lot-grounds.js',
    'legacy/world/ground-baker.js',
    'legacy/ui/map-icons.js',
    'legacy/ui/ui-system.js',
    'legacy/ui/music-widget.js',
    'legacy/story/narrative-cutscenes.js',
    'legacy/ui/poses.js',
    'legacy/ui/expressions.js',
    'legacy/ui/bodies.js',
    'legacy/ui/cloth.js',
    'legacy/ui/wardrobe.js',
    'legacy/ui/color-picker.js',
    'legacy/ui/weapon-models.js',
    'legacy/ui/humanoid-render.js',
    'legacy/penthouse/procedural-humanoid.js',
    'legacy/ui/portrait-real.js',
    'legacy/ui/face-cache.js',
    'legacy/ui/comms.js',
    'legacy/ui/crowd-impostors.js',
    'legacy/ui/silhouette-fx.js',
    'legacy/world/city-layout.js',
    'legacy/world/scrapyard.js',
    'legacy/world/billboards.js',
    'legacy/ui/inventory-augments.js',
    'legacy/gameplay/abilities/legacy-ability-launch.js',
    'legacy/ui/action-dock.js',
    'legacy/world/bokeh.js',
    'legacy/story/missions.js',
    'legacy/story/dialogue-bonding.js',
    'legacy/story/npc-dialogue.js',
    'legacy/story/scene-vision.js',
    'legacy/ui/cinematic-dialogue.js',
    'legacy/ui/hud-reveal.js',
    'legacy/ui/coach.js',
    'legacy/story/scene-runner.js',
    'legacy/story/scenes/cast.js',
    'legacy/story/scenes/prologue.js',
    'legacy/story/scenes/van.js',
    'legacy/lobby/level-lobby.js',        // LV1 Lobby: the game loop's clock (GameEngine builds one)
    'legacy/lobby/level-pause.js',       // LV1 Lobby: levelPause (the pause registry)
    'legacy/lobby/level-stages.js',      // LV1 Lobby: levelStages (which stage the engine is on: menu, loading, world)
    'legacy/engine/pause-system.js',
    'legacy/directory/effects-system.js',   // LV2 Directory: effectsSystem and EFFECTS (the world's short-lived effects)
    'legacy/engine/game-engine.js',
    'legacy/engine/events.js',
    'legacy/engine/combat-effects.js',
    'legacy/engine/breach-fx.js',
    'legacy/engine/quick-draw.js',
    'legacy/engine/player-fire.js',
    'legacy/engine/combat-fx.js',
    'legacy/engine/boss-intro.js',
    'legacy/engine/boss-hazards.js',
    'legacy/engine/noise.js',
    'legacy/world/map-edge.js',
    'legacy/engine/finisher.js',
    'legacy/engine/reflections.js',
    'legacy/engine/street-mist.js',
    'legacy/engine/shopfront-light.js',
    'legacy/engine/paving-inlays.js',
    'legacy/engine/footsteps.js',
    'legacy/engine/status-effects.js',
    'legacy/engine/executions.js',
    'legacy/engine/sneak.js',
    'legacy/engine/npc-posts.js',
    'legacy/engine/spills.js',
    'legacy/engine/dyer.js',
    'legacy/engine/knuckles.js',
    'legacy/engine/pools.js',
    'legacy/ui/dev-overlay.js',
    'legacy/ui/render-layers.js',
    'legacy/engine/scope.js',
    'legacy/engine/tuning-ui.js',
    'legacy/engine/shops-menus.js',
    'legacy/engine/daytime-flit.js',
    'legacy/engine/screens-ui.js',
    'legacy/engine/save-load.js',
    'legacy/engine/map-loading.js',
    'legacy/engine/world-state.js',
    'legacy/engine/cars.js',
    'legacy/engine/markers.js',
    'legacy/engine/update.js',
    'legacy/engine/overhead.js',
    'legacy/engine/draw.js',
    'legacy/engine/interiors.js',
    'legacy/engine/biggs-art.js',
    'legacy/engine/palace-art.js',
    'legacy/engine/neural-art.js',
    'legacy/engine/torque-art.js',
    'legacy/engine/keeper-art.js',
    'legacy/engine/van-art.js',
    'legacy/engine/lighting.js',
    'legacy/engine/daylight.js',
    'legacy/engine/player-draw-input.js',
    'legacy/directory/new-game-state.js',   // LV2 Directory: resetGameState, the game's new-game defaults
    'legacy/directory/world-session.js',    // LV2 Directory: menu <-> world (enterWorld, the loading screen, stop)
    'legacy/engine/loop.js',
    'legacy/engine/apartment-rooms.js',
    'legacy/engine/apartment-renderer.js',
    'legacy/engine/apartment-level.js',
    'legacy/app/menu-wiring.js',
    'legacy/ui/phone.js',
    'legacy/ui/app-launch.js',
    'legacy/ui/messages.js',
    'legacy/ui/amber-app.js',
    'legacy/story/crew-nights.js', 'legacy/story/talks.js',
    'legacy/ui/screens.js',
    'legacy/ui/sidebars.js',
    'legacy/ui/pause-look.js',
    'legacy/ui/save-slots-pause-menu.js',
    'legacy/app/boot.js',
    'legacy/ui/gamepad.js',        // controller support: after boot, so game, pauseMenu and Screens exist
];

const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2'
};
const FONT_FORMAT = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
const WARN_BYTES = 8 * 1024 * 1024;
const assetReport = [];

function scanAssets(kind) {
    const dir = join(ROOT, 'assets', kind), table = {};
    if (!existsSync(dir)) return table;
    const walk = (d) => {
        for (const name of readdirSync(d).sort()) {
            if (name.startsWith('.') || name.toLowerCase() === 'readme.md') continue;
            const full = join(d, name);
            if (statSync(full).isDirectory()) { walk(full); continue; }
            const ext = extname(name).toLowerCase(), mime = MIME[ext];
            if (!mime) { console.warn(`  skipping assets/${kind}/${relative(dir, full)} (unsupported type ${ext})`); continue; }
            const key = relative(dir, full).slice(0, -ext.length).split(sep).join('/');
            const bytes = readFileSync(full);
            table[key] = `data:${mime};base64,${bytes.toString('base64')}`;
            assetReport.push([`${kind}/${key}`, bytes.length]);
        }
    };
    walk(dir);
    return table;
}

// The asset table is most of the file's weight (the music). It is declared empty and then filled a piece
// at a time, so the loading screen's bar moves through it instead of sitting on one long parse.
const ASSET_PIECE_BYTES = 768 * 1024;
function assetPieces() {
    const table = { images: scanAssets('images'), audio: scanAssets('audio') };
    const pieces = ['        const ASSETS = { images: {}, audio: {} };\n'];
    for (const kind of ['images', 'audio']) {
        let part = {}, bytes = 0;
        const flush = () => { if (bytes) pieces.push(`        Object.assign(ASSETS.${kind}, ${JSON.stringify(part)});\n`); part = {}; bytes = 0; };
        for (const [key, uri] of Object.entries(table[kind])) {
            part[key] = uri; bytes += uri.length;
            if (bytes >= ASSET_PIECE_BYTES) flush();
        }
        flush();
    }
    return pieces;
}

// Each font in assets/fonts as an @font-face; the family is the file name without its extension.
function fontFaces() {
    const fonts = scanAssets('fonts');
    return Object.entries(fonts).map(([family, uri]) => {
        const format = FONT_FORMAT['.' + uri.slice(5, uri.indexOf(';')).split('/')[1]];
        return `        @font-face { font-family: '${family}'; src: url(${uri}) format('${format}'); font-display: swap; }\n`;
    }).join('');
}

const read = (p) => readFileSync(join(ROOT, 'src', p), 'utf8');

/** A GAME_DB chapter: game/data/game-db/items.json becomes `GAME_DB.items = {...};` (parsed first, so bad JSON fails the build). */
function chapterScript(p) {
    const chapter = p.split('/').pop().slice(0, -'.json'.length);
    if (!/^[a-z][a-z0-9_]*$/.test(chapter)) throw new Error(`src/${p}: a chapter's file name must be snake_case`);
    let data;
    try { data = JSON.parse(read(p)); } catch (e) { throw new Error(`src/${p} is not valid JSON: ${e.message}`); }
    return `        GAME_DB.${chapter} = ${JSON.stringify(data)};\n`;
}

/*
 * Each script file goes into the page as an inert <script type="text/dfab"> block. The boot loader
 * (src/legacy/app/boot-loader.js, the one plain script) runs them in this order, one task apiece, so the
 * browser paints the loading screen between them and its bar shows how much has run. They are still
 * classic scripts sharing one global scope, exactly as when the game was one big <script>.
 */
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function scriptBlocks() {
    const blocks = [];
    for (const p of SCRIPTS) {
        if (p === '@native') blocks.push(['game/boot/native-entry.mjs', bundleNative(ROOT, 'src/game/boot/native-entry.mjs') + '\nconst pathGeometry = DFNative.pathGeometry;']);
        else if (p === '@assets') assetPieces().forEach((code, i) => blocks.push([`assets#${i}`, code]));
        else if (p.endsWith('.mjs')) {
            // Explicit bridge for import-free engine modules; this is not a general ESM bundler.
            const source = read(p);
            if (/^\s*import\s|^\s*export\s+(?!class\s)/m.test(source)) throw new Error(`src/${p} needs a full module bundle`);
            blocks.push([p, source.replace(/^export class /gm, 'class ')]);
        }
        else if (p.endsWith('.json')) blocks.push([p, chapterScript(p)]);
        else blocks.push([p, read(p)]);
    }
    for (const [name, code] of blocks) {
        if (/<\/script/i.test(code)) throw new Error(`src/${name} contains "</script", which would end its block early`);
    }
    // DFAB_BUILD: a fingerprint of this build's code, for caches kept across sessions that must not outlive the code
    // that made them (every app's painted faces, legacy/ui/face-cache.js)
    const build = createHash('sha1').update(blocks.filter(([n]) => !n.startsWith('assets#')).map(([, c]) => c).join('\n')).digest('hex').slice(0, 12);
    blocks.unshift(['@build', `        const DFAB_BUILD = '${build}';\n`]);
    // data-cost: roughly how long the block takes to run, for the bar. The music is long but cheap (one string
    // literal per track); code is the slow part.
    const cost = (name, code) => Math.max(1, Math.round(code.length * (name.startsWith('assets#') ? 0.15 : 1) / 100));
    return blocks.map(([name, code]) => `    <script type="text/dfab" data-src="${escapeAttr(name)}" data-cost="${cost(name, code)}">\n${code}    </script>\n`).join('')
        + `    <script>\n${read('legacy/app/boot-loader.js')}    </script>\n`;
}

export function build() {
    let html = read('legacy/index.html');
    const styles = fontFaces() + inlineLoadingArt(STYLES.map(read).join(''));
    const scripts = scriptBlocks();
    const put = (marker, text) => {
        const tag = `<!-- @${marker} -->\n`;
        if (!html.includes(tag)) throw new Error(`src/legacy/index.html is missing ${tag.trim()}`);
        html = html.replace(tag, () => text);
    };
    put('styles', styles);
    put('scripts', scripts);
    return html;
}

const out = build();
const target = join(ROOT, OUTPUT);
if (process.argv.includes('--check')) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (current !== out) { console.error(`${OUTPUT} is out of date: run  node tools/build.mjs`); process.exit(1); }
    console.log(`${OUTPUT} is up to date.`);
} else {
    writeFileSync(target, out);
    const size = Buffer.byteLength(out);
    console.log(`Built ${OUTPUT}: ${(size / 1024).toFixed(0)} KB, ${SCRIPTS.length - 1} scripts, ${STYLES.length} stylesheets, ${assetReport.length} assets.`);
    for (const [name, bytes] of assetReport) console.log(`  asset ${name}  ${(bytes / 1024).toFixed(0)} KB`);
    if (size > WARN_BYTES) console.warn(`  warning: the game file is over ${WARN_BYTES / 1048576} MB; long music tracks are the usual cause.`);
}
