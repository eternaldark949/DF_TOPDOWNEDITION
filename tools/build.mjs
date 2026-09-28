#!/usr/bin/env node
/*
 * DFAB build: stitches src/ back into the single playable file.
 *
 *   node tools/build.mjs          build "DFAB V8.html"
 *   node tools/build.mjs --check  exit 1 if "DFAB V8.html" is out of date (CI)
 *
 * No dependencies. The game is plain classic <script> code sharing one global
 * scope, so the ORDER below matters: a file can only use, at load time, what
 * files above it declared (classes before subclasses, systems before the code
 * that instantiates them). Add a new file by putting it in the right place here.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'DFAB V8.html';

const STYLES = [
    'styles/base.css',
    'styles/hud-menus.css',
    'styles/panels-phone.css',
];

const SCRIPTS = [
    'core/config.js',
    'core/registries.js',
    'core/utils.js',
    'world/navigation.js',
    'core/draw-helpers.js',
    'core/settings.js',
    'story/story-db.js',
    'story/captions.js',
    'audio/audio.js',
    'world/weather.js',
    'world/particles-decals.js',
    'world/rooms.js',
    'world/maps.js',
    'world/map-entities.js',
    'physics/spatial.js',
    'physics/game-entity.js',
    'physics/collision.js',
    'entities/props-decor.js',
    'entities/vehicles-minigames.js',
    'entities/lamps.js',
    'entities/actors.js',
    'entities/static-builders-profiler.js',
    'entities/street-objects.js',
    'entities/npc.js',
    'entities/pedestrians.js',
    'entities/enemies.js',
    'buildings/building-v1.js',
    'buildings/building-v2.js',
    'buildings/silver-queen.js',
    'buildings/sky-layer.js',
    'buildings/factories.js',
    'buildings/registry-v3.js',
    'traffic/roads.js',
    'traffic/garage-zib.js',
    'traffic/traffic-vehicle.js',
    'traffic/traffic-manager.js',
    'ui/ui-system.js',
    'ui/music-widget.js',
    'story/narrative-cutscenes.js',
    'ui/humanoid-render.js',
    'world/city-layout.js',
    'ui/inventory-augments.js',
    'world/bokeh.js',
    'story/missions.js',
    'story/dialogue-bonding.js',
    'engine/pause-system.js',
    'engine/game-engine.js',
    'engine/events.js',
    'engine/combat-effects.js',
    'engine/shops-menus.js',
    'engine/daytime-flit.js',
    'engine/screens-ui.js',
    'engine/save-load.js',
    'engine/map-loading.js',
    'engine/world-state.js',
    'engine/update.js',
    'engine/draw.js',
    'engine/interiors.js',
    'engine/lighting.js',
    'engine/player-draw-input.js',
    'engine/loop.js',
    'app/menu-wiring.js',
    'ui/phone.js',
    'ui/sidebars.js',
    'ui/save-slots-pause-menu.js',
    'app/boot.js',
];

const read = (p) => readFileSync(join(ROOT, 'src', p), 'utf8');

export function build() {
    let html = read('index.html');
    const styles = STYLES.map(read).join('');
    const scripts = SCRIPTS.map(read).join('');
    const put = (marker, text) => {
        const tag = `<!-- @${marker} -->\n`;
        if (!html.includes(tag)) throw new Error(`src/index.html is missing ${tag.trim()}`);
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
    console.log(`Built ${OUTPUT}: ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB, ${SCRIPTS.length} scripts, ${STYLES.length} stylesheets.`);
}
