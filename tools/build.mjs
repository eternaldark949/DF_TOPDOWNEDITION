#!/usr/bin/env node
/*
 * DFAB build: stitches src/ back into the single playable file.
 *
 *   node tools/build.mjs          build "DFAB V8.html"
 *   node tools/build.mjs --check  exit 1 if "DFAB V8.html" is out of date (CI)
 *
 * Files in assets/images and assets/audio are embedded as data URIs in the
 * ASSETS table (see src/core/assets.js for getImage / drawAsset / playSound).
 * Files in assets/fonts become @font-face rules, named after the file.
 *
 * No dependencies. The game is plain classic <script> code sharing one global
 * scope, so the ORDER below matters: a file can only use, at load time, what
 * files above it declared (classes before subclasses, systems before the code
 * that instantiates them). Add a new file by putting it in the right place here.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'DFAB V8.html';

const STYLES = [
    'styles/base.css',
    'styles/hud-menus.css',
    'styles/panels-phone.css',
    'styles/cinematic.css',
    'styles/coach.css',
    'styles/dossier.css',
    'styles/shops.css',
    'styles/landscape.css',
];

const SCRIPTS = [
    'core/config.js',
    '@assets',              // generated from the assets/ folder
    'core/assets.js',
    'core/registries.js',
    'core/resonance.js',
    'core/utils.js',
    'world/navigation.js',
    'world/walker.js',
    'core/draw-helpers.js',
    'core/cache-db.js',
    'core/appearances.js',
    'core/settings.js',
    'story/story-db.js',
    'story/captions.js',
    'audio/audio.js',
    'world/weather.js',
    'world/weather-response.js',
    'world/particles-decals.js',
    'world/rooms.js',
    'world/maps.js',
    'world/map-entities.js',
    'physics/spatial.js',
    'physics/game-entity.js',
    'physics/collision.js',
    'entities/props-decor.js',
    'entities/prop-sprites.js',
    'entities/vehicles-minigames.js',
    'entities/lamps.js',
    'entities/actors.js',
    'entities/static-builders-profiler.js',
    'entities/performance-bench.js',
    'entities/street-objects.js',
    'entities/npc.js',
    'entities/pedestrians.js',
    'world/lobby-life.js',
    'world/club-life.js',
    'world/cafe-life.js',
    'engine/furniture.js',
    'entities/enemies.js',
    'entities/hunters.js',
    'buildings/building-v1.js',
    'buildings/building-v2.js',
    'buildings/landmark-kit.js',
    'buildings/silver-queen.js',
    'buildings/double-nights.js',
    'buildings/moon-city.js',
    'buildings/cozy-cafe.js',
    'buildings/street-variants.js',
    'buildings/sky-craft.js',
    'buildings/sky-layer.js',
    'buildings/factories.js',
    'buildings/city-view.js',
    'buildings/registry-v3.js',
    'buildings/biggs-park.js',
    'buildings/neural-systems.js',
    'buildings/torque-auto.js',
    'traffic/roads.js',
    'traffic/garage-zib.js',
    'traffic/zen-art.js',
    'traffic/car-art.js',
    'traffic/traffic-vehicle.js',
    'traffic/vehicle-occupants.js',
    'traffic/traffic-people.js',
    'traffic/traffic-signals.js',
    'traffic/traffic-manager.js',
    'traffic/traffic-profiler.js',
    'world/parks.js',
    'world/lot-grounds.js',
    'world/ground-baker.js',
    'ui/map-icons.js',
    'ui/ui-system.js',
    'ui/music-widget.js',
    'story/narrative-cutscenes.js',
    'ui/poses.js',
    'ui/expressions.js',
    'ui/bodies.js',
    'ui/cloth.js',
    'ui/wardrobe.js',
    'ui/color-picker.js',
    'ui/weapon-models.js',
    'ui/humanoid-render.js',
    'ui/portrait-real.js',
    'ui/comms.js',
    'ui/crowd-impostors.js',
    'ui/silhouette-fx.js',
    'world/city-layout.js',
    'world/billboards.js',
    'ui/inventory-augments.js',
    'ui/action-dock.js',
    'world/bokeh.js',
    'story/missions.js',
    'story/dialogue-bonding.js',
    'story/npc-dialogue.js',
    'story/scene-vision.js',
    'ui/cinematic-dialogue.js',
    'ui/hud-reveal.js',
    'ui/coach.js',
    'story/scene-runner.js',
    'story/scenes/cast.js',
    'story/scenes/prologue.js',
    'story/scenes/van.js',
    'engine/pause-system.js',
    'engine/game-engine.js',
    'engine/events.js',
    'engine/combat-effects.js',
    'engine/quick-draw.js',
    'engine/player-fire.js',
    'engine/combat-fx.js',
    'engine/boss-intro.js',
    'engine/noise.js',
    'world/map-edge.js',
    'engine/finisher.js',
    'engine/reflections.js',
    'engine/street-mist.js',
    'engine/shopfront-light.js',
    'engine/paving-inlays.js',
    'engine/footsteps.js',
    'engine/status-effects.js',
    'engine/executions.js',
    'engine/sneak.js',
    'engine/npc-posts.js',
    'engine/spills.js',
    'engine/dyer.js',
    'engine/knuckles.js',
    'engine/pools.js',
    'ui/dev-overlay.js',
    'ui/render-layers.js',
    'engine/scope.js',
    'engine/tuning-ui.js',
    'engine/shops-menus.js',
    'engine/daytime-flit.js',
    'engine/screens-ui.js',
    'engine/save-load.js',
    'engine/map-loading.js',
    'engine/world-state.js',
    'engine/cars.js',
    'engine/markers.js',
    'engine/update.js',
    'engine/overhead.js',
    'engine/draw.js',
    'engine/interiors.js',
    'engine/biggs-art.js',
    'engine/palace-art.js',
    'engine/neural-art.js',
    'engine/torque-art.js',
    'engine/keeper-art.js',
    'engine/van-art.js',
    'engine/lighting.js',
    'engine/daylight.js',
    'engine/player-draw-input.js',
    'engine/loop.js',
    'app/menu-wiring.js',
    'ui/phone.js',
    'ui/messages.js',
    'ui/amber-app.js',
    'story/crew-nights.js', 'story/talks.js',
    'ui/screens.js',
    'ui/sidebars.js',
    'ui/save-slots-pause-menu.js',
    'app/boot.js',
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

function assetsScript() {
    const table = { images: scanAssets('images'), audio: scanAssets('audio') };
    return `        const ASSETS = ${JSON.stringify(table)};\n\n`;
}

// Each font in assets/fonts as an @font-face; the family is the file name without its extension.
function fontFaces() {
    const fonts = scanAssets('fonts');
    return Object.entries(fonts).map(([family, uri]) => {
        const format = FONT_FORMAT['.' + uri.slice(5, uri.indexOf(';')).split('/')[1]];
        return `        @font-face { font-family: '${family}'; src: url(${uri}) format('${format}'); font-display: swap; }\n`;
    }).join('');
}

const read = (p) => p === '@assets' ? assetsScript() : readFileSync(join(ROOT, 'src', p), 'utf8');

export function build() {
    let html = read('index.html');
    const styles = fontFaces() + STYLES.map(read).join('');
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
    const size = Buffer.byteLength(out);
    console.log(`Built ${OUTPUT}: ${(size / 1024).toFixed(0)} KB, ${SCRIPTS.length - 1} scripts, ${STYLES.length} stylesheets, ${assetReport.length} assets.`);
    for (const [name, bytes] of assetReport) console.log(`  asset ${name}  ${(bytes / 1024).toFixed(0)} KB`);
    if (size > WARN_BYTES) console.warn(`  warning: the game file is over ${WARN_BYTES / 1048576} MB; long music tracks are the usual cause.`);
}
