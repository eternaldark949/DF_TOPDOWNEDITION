#!/usr/bin/env node
/*
 * DFAB build: stitches src/ back into the single playable file.
 *
 *   node tools/build.mjs          build "DFAB V8.html"
 *   node tools/build.mjs --check  exit 1 if "DFAB V8.html" is out of date (CI)
 *
 * Files in assets/images and assets/audio are embedded as data URIs in the
 * ASSETS table (see reference/classic/core/assets.js for getImage / drawAsset / playSound).
 * Files in assets/fonts become @font-face rules, named after the file.
 * A .json file in SCRIPTS is a GAME_DB chapter (src/game/data/game-db/): it goes in as
 * `GAME_DB.<file name> = <its JSON>;`, so the data stays plain JSON that editors and tools can read.
 *
 * No dependencies. The game is plain classic <script> code sharing one global
 * scope, so the ORDER below matters: a file can only use, at load time, what
 * files above it declared (classes before subclasses, systems before the code
 * that instantiates them). Add a new file by putting it in the right place here.
 *
 * Each file is its own script (reference/classic/app/boot-loader.js runs them one after another
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
    'classic/styles/loading-screen.css',   // first: the loading screen paints before anything else has parsed
    'classic/styles/base.css',
    'classic/styles/hud-menus.css',
    'classic/styles/panels-phone.css',
    'classic/styles/cinematic.css',
    'classic/styles/coach.css',
    'classic/styles/dossier.css',
    'classic/styles/shops.css',
    'classic/styles/landscape.css',
];

const SCRIPTS = [
    'classic/basement/frame-clock.js',     // LV0 Basement: the frame clock's globals (_frameTime, _simTick, _gameTimeSec), first
    'classic/basement/timer-kit.js',       // LV0 Basement: gTimer and game_timers (timers in game time, on the sim ticks)
    'classic/basement/canvas-kit.js',      // LV0 Basement: canvasKit (off-screen layers)
    'classic/basement/life-kit.js',        // LV0 Basement: lifeKit (lists of short-lived things)
    'classic/basement/sound-kit.js',       // LV0 Basement: soundKit (Web Audio building blocks)
    'classic/basement/sound-system.js',    // LV0 Basement: soundSystem (context, channels, volume dial, reverb, sounds by packet)
    'classic/basement/entity-base.js',     // LV0 Basement: GameEntity (the base of everything that moves or collides)
    'classic/basement/shape-kit.js',       // LV0 Basement: shapeKit (collision geometry)
    'classic/basement/spatial-grid.js',    // LV0 Basement: SpatialHashGrid and the render / transition grids
    'classic/basement/collision-kit.js',   // LV0 Basement: collisionKit and collisionWorld (the collision step, game-free: layers, grid, passes, solver)
    'classic/basement/vehicle-kit.js',     // LV0 Basement: vehicleKit (driving, out of walls, car-to-car contact: game-free)
    '@native',                    // Native ESM engine/Directory graph, linked from the original sources
    'classic/basement/controls-system.js', // LV0 Basement: controlsSystem (keyboard, mouse, touch and gamepad instances, touch sticks, keymap, action table)
    'classic/basement/recorder-kit.js',    // LV0 Basement: gRecorder (inputs recorded per tick, played back through the controls)
    'classic/basement/lane-rail-kit.js',   // LV0 Basement: railKit (things that run along a line: sampled curves, pedals, following)
    'classic/basement/ui-kit.js',          // LV0 Basement: uiKit (making, showing and hiding DOM panels)
    'classic/basement/draw-list.js',       // LV0 Basement: drawList and canvasRenderer (what to draw, apart from how)
    'classic/basement/material-kit.js',    // LV0 Basement: materialKit (linked materials and finish rules)
    'classic/basement/virtual-child.js',   // LV0 Basement: virtualChild (things that ride on a parent without being its child)
    'classic/basement/angle-kit.js',       // LV0 Basement: angleKit (degrees in the data, radians in the code)
    'classic/basement/query-kit.js',       // LV0 Basement: queryKit (find, filter and sort location packets)
    'classic/basement/render-system.js',   // LV0 Basement: renderQueue (shapes sorted by depth, same-style ones drawn in one call)
    'classic/basement/awareness-kit.js',   // LV0 Basement: awarenessMatrix (what a character knows of what's around them)
    'classic/directory/game-db/game-db.js',   // LV2 Directory: GAME_DB, the game's data; its chapters (JSON) follow
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
    'classic/core/config.js',                   // reads GAME_DB.vehicles and .places, so it comes after the chapters
    '@assets',              // generated from the assets/ folder
    'classic/core/assets.js',
    'classic/core/registries.js',
    'classic/directory/game-materials.js',    // LV2 Directory: the game's finishes and named materials (links the cosmetics)
    'classic/core/resonance.js',
    'classic/core/utils.js',
    'classic/world/navigation.js',
    'classic/world/walker.js',
    'classic/core/draw-helpers.js',
    'classic/core/cache-db.js',
    'classic/core/appearances.js',
    'classic/core/settings.js',
    'classic/story/story-db.js',
    'classic/story/captions.js',
    'classic/directory/game-sound.js',
    'classic/directory/game-controls.js',    // LV2 Directory: dfKeyMap and dfActions (which keys and buttons do what)
    'classic/world/weather.js',
    'classic/world/weather-response.js',
    'classic/world/particles-decals.js',
    'classic/presentation/indoor-door.js',
    'classic/world/rooms.js',
    'classic/world/maps.js',
    'classic/world/map-entities.js',
    'classic/directory/collision-system.js',
    'classic/entities/props-decor.js',
    'classic/entities/prop-sprites.js',
    'classic/entities/vehicles-minigames.js',
    'classic/entities/lamps.js',
    'classic/entities/actors.js',
    'classic/entities/static-builders-profiler.js',
    'classic/entities/performance-bench.js',
    'classic/entities/street-objects.js',
    'classic/entities/npc.js',
    'classic/entities/pedestrians.js',
    'classic/directory/venue-crowd.js',
    'classic/directory/lobby-life.js',
    'classic/directory/club-life.js',
    'classic/directory/cafe-life.js',
    'classic/directory/world-query.js',    // LV2 Directory: worldQuery (rooms, seats, NPCs, loot, doors, landmarks, buildings as packets)
    'classic/engine/furniture.js',
    'classic/presentation/gatling-gunner.js',
    'classic/presentation/classic-actor-packets.js',
    'classic/entities/enemies.js',
    'classic/entities/hunters.js',
    'classic/entities/drones.js',
    'classic/presentation/marionette.js',
    'classic/entities/marionettes.js',
    'classic/buildings/building-v1.js',
    'classic/buildings/building-v2.js',
    'classic/buildings/landmark-kit.js',
    'classic/buildings/ornament-kit.js',
    'classic/buildings/tiered-kit.js',
    'classic/buildings/entrance-lamps.js',
    'classic/buildings/silver-queen.js',
    'classic/buildings/double-nights.js',
    'classic/buildings/moon-city.js',
    'classic/buildings/cozy-cafe.js',
    'classic/buildings/street-variants.js',
    'classic/buildings/street-arcade.js',
    'classic/buildings/street-apartments.js',
    'classic/buildings/sky-craft.js',
    'classic/buildings/sky-layer.js',
    'classic/buildings/factories.js',
    'classic/buildings/city-view.js',
    'classic/buildings/registry-v3.js',
    'classic/buildings/biggs-park.js',
    'classic/buildings/neural-systems.js',
    'classic/buildings/torque-auto.js',
    'classic/buildings/dr-yins.js',
    'classic/buildings/warehouse-hall.js',
    'classic/buildings/suburb-house.js', 'classic/buildings/town-gate.js',
    'classic/buildings/ashgrove.js',
    'classic/buildings/enni-cole.js',
    'classic/buildings/silver-queen-deco.js',
    'classic/buildings/moon-city-deco.js',
    'classic/traffic/roads.js',
    'classic/traffic/garage-zib.js',
    'classic/traffic/zen-art.js',
    'classic/traffic/car-art.js',
    'classic/traffic/traffic-vehicle.js',
    'classic/directory/game-vehicles.js', // One classic-client vehicle construction boundary
    'classic/traffic/vehicle-occupants.js',
    'classic/traffic/traffic-people.js',
    'classic/traffic/traffic-signals.js',
    'classic/traffic/lane-runner.js',
    'classic/traffic/traffic-manager.js',
    'classic/traffic/traffic-profiler.js',
    'classic/world/parks.js',
    'classic/world/lot-grounds.js',
    'classic/world/ground-baker.js',
    'classic/ui/map-icons.js',
    'classic/ui/ui-system.js',
    'classic/ui/music-widget.js',
    'classic/story/narrative-cutscenes.js',
    'classic/ui/poses.js',
    'classic/ui/expressions.js',
    'classic/ui/bodies.js',
    'classic/ui/cloth.js',
    'classic/ui/wardrobe.js',
    'classic/ui/color-picker.js',
    'classic/ui/weapon-models.js',
    'classic/ui/humanoid-render.js',
    'classic/penthouse/procedural-humanoid.js',
    'classic/ui/portrait-real.js',
    'classic/ui/face-cache.js',
    'classic/ui/comms.js',
    'classic/ui/crowd-impostors.js',
    'classic/ui/silhouette-fx.js',
    'classic/world/city-layout.js',
    'classic/world/scrapyard.js',
    'classic/world/billboards.js',
    'classic/ui/inventory-augments.js',
    'classic/gameplay/abilities/legacy-ability-launch.js',
    'classic/ui/action-dock.js',
    'classic/world/bokeh.js',
    'classic/story/missions.js',
    'classic/story/dialogue-bonding.js',
    'classic/story/npc-dialogue.js',
    'classic/story/scene-vision.js',
    'classic/ui/cinematic-dialogue.js',
    'classic/ui/hud-reveal.js',
    'classic/ui/coach.js',
    'classic/story/scene-runner.js',
    'classic/story/scenes/cast.js',
    'classic/story/scenes/prologue.js',
    'classic/story/scenes/van.js',
    'classic/lobby/level-lobby.js',        // LV1 Lobby: the game loop's clock (GameEngine builds one)
    'classic/lobby/level-pause.js',       // LV1 Lobby: levelPause (the pause registry)
    'classic/lobby/level-stages.js',      // LV1 Lobby: levelStages (which stage the engine is on: menu, loading, world)
    'classic/engine/pause-system.js',
    'classic/directory/effects-system.js',   // LV2 Directory: effectsSystem and EFFECTS (the world's short-lived effects)
    'classic/engine/game-engine.js',
    'classic/engine/events.js',
    'classic/engine/combat-effects.js',
    'classic/engine/breach-fx.js',
    'classic/engine/quick-draw.js',
    'classic/engine/player-fire.js',
    'classic/engine/combat-fx.js',
    'classic/engine/boss-intro.js',
    'classic/engine/boss-hazards.js',
    'classic/engine/noise.js',
    'classic/world/map-edge.js',
    'classic/engine/finisher.js',
    'classic/engine/reflections.js',
    'classic/engine/street-mist.js',
    'classic/engine/shopfront-light.js',
    'classic/engine/paving-inlays.js',
    'classic/engine/footsteps.js',
    'classic/engine/status-effects.js',
    'classic/engine/executions.js',
    'classic/engine/sneak.js',
    'classic/engine/npc-posts.js',
    'classic/engine/spills.js',
    'classic/engine/dyer.js',
    'classic/engine/knuckles.js',
    'classic/engine/pools.js',
    'classic/ui/dev-overlay.js',
    'classic/ui/render-layers.js',
    'classic/engine/scope.js',
    'classic/engine/tuning-ui.js',
    'classic/engine/shops-menus.js',
    'classic/engine/daytime-flit.js',
    'classic/engine/screens-ui.js',
    'classic/engine/save-load.js',
    'classic/engine/map-loading.js',
    'classic/engine/world-state.js',
    'classic/engine/cars.js',
    'classic/engine/markers.js',
    'classic/engine/update.js',
    'classic/engine/overhead.js',
    'classic/engine/draw.js',
    'classic/engine/interiors.js',
    'classic/engine/biggs-art.js',
    'classic/engine/palace-art.js',
    'classic/engine/neural-art.js',
    'classic/engine/torque-art.js',
    'classic/engine/keeper-art.js',
    'classic/engine/van-art.js',
    'classic/engine/lighting.js',
    'classic/engine/daylight.js',
    'classic/engine/player-draw-input.js',
    'classic/directory/new-game-state.js',   // LV2 Directory: resetGameState, the game's new-game defaults
    'classic/directory/world-session.js',    // LV2 Directory: menu <-> world (enterWorld, the loading screen, stop)
    'classic/engine/loop.js',
    'classic/engine/apartment-rooms.js',
    'classic/engine/apartment-renderer.js',
    'classic/engine/apartment-level.js',
    'classic/app/menu-wiring.js',
    'classic/ui/phone.js',
    'classic/ui/app-launch.js',
    'classic/ui/messages.js',
    'classic/ui/amber-app.js',
    'classic/story/crew-nights.js', 'classic/story/talks.js',
    'classic/ui/screens.js',
    'classic/ui/sidebars.js',
    'classic/ui/pause-look.js',
    'classic/ui/save-slots-pause-menu.js',
    'classic/app/boot.js',
    'classic/ui/gamepad.js',        // controller support: after boot, so game, pauseMenu and Screens exist
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

// Classic scripts are read from reference/classic/ (classic/...), everything else from src/.
const read = (p) => readFileSync(p.startsWith("classic/") ? join(ROOT, "reference", p) : join(ROOT, "src", p), "utf8");

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
 * (reference/classic/app/boot-loader.js, the one plain script) runs them in this order, one task apiece, so the
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
    // that made them (every app's painted faces, classic/ui/face-cache.js)
    const build = createHash('sha1').update(blocks.filter(([n]) => !n.startsWith('assets#')).map(([, c]) => c).join('\n')).digest('hex').slice(0, 12);
    blocks.unshift(['@build', `        const DFAB_BUILD = '${build}';\n`]);
    // data-cost: roughly how long the block takes to run, for the bar. The music is long but cheap (one string
    // literal per track); code is the slow part.
    const cost = (name, code) => Math.max(1, Math.round(code.length * (name.startsWith('assets#') ? 0.15 : 1) / 100));
    return blocks.map(([name, code]) => `    <script type="text/dfab" data-src="${escapeAttr(name)}" data-cost="${cost(name, code)}">\n${code}    </script>\n`).join('')
        + `    <script>\n${read('classic/app/boot-loader.js')}    </script>\n`;
}

export function build() {
    let html = read('classic/index.html');
    const styles = fontFaces() + inlineLoadingArt(STYLES.map(read).join(''));
    const scripts = scriptBlocks();
    const put = (marker, text) => {
        const tag = `<!-- @${marker} -->\n`;
        if (!html.includes(tag)) throw new Error(`reference/classic/index.html is missing ${tag.trim()}`);
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
