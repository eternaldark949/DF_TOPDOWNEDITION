// Native prop art against the classic prop artwork, pixel by pixel in Chromium, for every piece in the
// cafe, the apartment, the House of Death, the Double Nights lobby and suite and the Moon City
// Nightclub as it is placed there; the families and presets in the catalog; and the picture cache's
// stamps against the vector art.
// Run: node --test tools/test-prop-art.mjs   (the pixel tests need Playwright with Chromium; skip without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { validatePropCatalog, validateMapLayout, resolvePlacement } from '../src/engine/directory/index.mjs';
import { PROP_FAMILIES, hasPropArt, propArtLoop, propArtPacket, createPropDraws } from '../src/game/presentation/props/index.mjs';
import PROPS from '../src/game/data/game-assets/props.json' with { type: 'json' };
import CAFE from '../src/game/data/game-assets/maps/cozy_cafe_interior.json' with { type: 'json' };
import LOBBY from '../src/game/data/game-assets/maps/hotel_lobby.json' with { type: 'json' };
import SUITE from '../src/game/data/game-assets/maps/hotel_suite.json' with { type: 'json' };
import CLUB from '../src/game/data/game-assets/maps/moon_city_nightclub.json' with { type: 'json' };
import HOUSE from '../src/game/data/game-assets/maps/house_of_death.json' with { type: 'json' };
import APARTMENT from '../src/game/data/game-assets/maps/apt_949.json' with { type: 'json' };
import SANCTUM from '../src/game/data/game-assets/maps/church_boss.json' with { type: 'json' };
import CLINIC from '../src/game/data/game-assets/maps/medbay_sw.json' with { type: 'json' };
import TORQUE from '../src/game/data/game-assets/maps/auto_shop.json' with { type: 'json' };
import PALACE from '../src/game/data/game-assets/maps/demoness_palace.json' with { type: 'json' };
import ENNI from '../src/game/data/game-assets/maps/enni_cole_interior.json' with { type: 'json' };
import ENNI_UPPER from '../src/game/data/game-assets/maps/enni_cole_upper.json' with { type: 'json' };
import NEURAL from '../src/game/data/game-assets/maps/neural_sys_interior.json' with { type: 'json' };
import ITEMS from '../src/game/data/game-db/items.json' with { type: 'json' };
import PLACES from '../src/game/data/game-db/places.json' with { type: 'json' };
import { resolveApartmentDyer } from '../src/game/levels/apartment-definition.mjs';
import { MAP_IDS, createMapLibraries } from '../src/game/data/game-maps.mjs';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}
const CATALOG = PROPS.resources.catalog.data, TYPES = CATALOG.types;
// A time on one of the plant's phase frames (frame 3 of 10 of its sway), so the classic clock and the native loop agree.
const TIME = 3 * (2 * Math.PI / 0.8) / 10;
// A beat count part way through a kick, so the club's pulsing pieces are mid-pulse
const BEAT = 7.3;
const piecesOf = map => map.props.filter(p => hasPropArt(resolvePlacement(p, TYPES).family)).map(p => ({ placement: p, ...resolvePlacement(p, TYPES) }));
const PIECES = piecesOf(CAFE);
// (Enni Cole's tall aisles are no prop art at all: the floor draws them, the prop is only their collision.)
const DECOR = '/src/legacy/entities/props-decor.js';
const STILL_CLASSIC = /^ec_tall_aisle$|^ta_(lift|wrap|turntable)$|^block$/;
// The apartment's pieces, and the clothing dyer's station once it is made (placed by the level, not the map)
const DYER = resolveApartmentDyer({ places: PLACES }).data.appearance;
const HOME = [...piecesOf(APARTMENT), { placement: { type: 'apt_dyer' }, ...DYER }];

test('every family has an artist, every preset and every map placement fits its family', () => {
    assert.doesNotThrow(() => validatePropCatalog(CATALOG));
    for (const family of Object.keys(CATALOG.families)) assert.ok(hasPropArt(family), `${family} has a native artist`);
    // Every type in the catalog is drawn by a family but those still waiting their pass (this list only shrinks)
    for (const [type, { defaults }] of Object.entries(TYPES)) if (!STILL_CLASSIC.test(type)) assert.ok(hasPropArt(defaults.family), `${type} is a preset of a drawn family`);
    const maps = createMapLibraries()[1].resources;
    for (const id of MAP_IDS) assert.doesNotThrow(() => validateMapLayout(maps[id].data, TYPES, id, CATALOG.families));
    assert.equal(PIECES.length, CAFE.props.length, 'every cafe piece is native');
    const classic = APARTMENT.props.filter(p => !resolvePlacement(p, TYPES).family).map(p => p.type).sort();
    assert.deepEqual(HOUSE.props.filter(p => !resolvePlacement(p, TYPES).family), [], 'every House piece is native');
    for (const map of [LOBBY, SUITE, CLUB]) assert.deepEqual(map.props.filter(p => !resolvePlacement(p, TYPES).family), [], 'every piece is native');
    const cart = CATALOG.families.bar_cart.look;
    assert.deepEqual([cart.bottles.default[0], cart.bottles.default[2], cart.decanter.default], [ITEMS.drinks.red_wine.liquid, ITEMS.drinks.whiskey.liquid, ITEMS.drinks.whiskey.liquid], 'the bar cart pours what the bar does');
    assert.deepEqual(classic, [], 'every apartment piece is native');
});

test('a placement tweaks its preset through the look, and a wrong field is refused', () => {
    const plant = PIECES.find(p => p.placement.look?.fern), crate = PIECES.find(p => p.placement.look?.label);
    assert.deepEqual(propArtPacket({ appearance: plant, position: [0, 0], width: 36, height: 36 }).look.fern, true);
    assert.equal(propArtPacket({ appearance: crate, position: [0, 0], width: 56, height: 40 }).look.label, 'COCOA');
    const red = propArtPacket({ appearance: { ...resolvePlacement({ type: 'cc_chair', x: 1, y: 2, look: { seats: ['#ff0000'] } }, TYPES) }, position: [0, 0], width: 22, height: 22 });
    assert.ok(createPropDraws(red).flatMap(d => d.build()).some(p => p.material.fill === '#ff0000'), 'a map can recolour one chair');
    assert.throws(() => propArtPacket({ appearance: { ...resolvePlacement({ type: 'cc_chair', x: 1, y: 2, look: { legs: 4 } }, TYPES) }, position: [0, 0], width: 22, height: 22 }), /unknown look field legs/);
    assert.throws(() => validateMapLayout({ props: [{ type: 'cc_chair', x: 1, y: 1, look: { seats: 'red' } }] }, TYPES, 'cafe', PROP_FAMILIES), /seats must be a colors/);
});

test('still runs are pictures with stable keys; moving parts are live; the plant sways in phase frames', () => {
    const at = type => PIECES.find(p => p.placement.type === type);
    const draws = (type, time) => { const p = at(type); return createPropDraws(propArtPacket({ appearance: p, position: [0, 0], width: p.width, height: p.height }), { time }); };
    assert.deepEqual(draws('cc_espresso', 1).map(d => !!d.key), [false, true, false, true], 'shadow, machine, needle, cups');
    assert.deepEqual(draws('cc_fireplace', 1).map(d => !!d.key), [false, true, false, true]);
    assert.deepEqual(draws('cc_record', 1).map(d => !!d.key), [false, true, false, true]);
    assert.deepEqual(draws('cc_chair', 1).map(d => d.key), [undefined, draws('cc_chair', 9)[1].key], 'a still piece keeps its picture as time passes');
    assert.notEqual(draws('cc_plant', 0)[1].key, draws('cc_plant', TIME)[1].key, 'each phase frame is its own picture');
    assert.equal(draws('cc_plant', TIME)[1].key, draws('cc_plant', TIME + 0.05)[1].key, 'and the time between frames shows the nearest');
    const chairs = PIECES.filter(p => p.placement.type === 'cc_chair').map(p => createPropDraws(propArtPacket({ appearance: p, position: [0, 0], width: 22, height: 22 }))[1].key);
    assert.equal(new Set(chairs).size, chairs.length, 'each chair, seeded from where it stands, is its own picture');
});

test('a piece in play keeps a picture for each state it shows: a lost thing open once searched, a switch lit or dark', () => {
    const piece = type => piecesOf(createMapLibraries()[1].resources[type === 'light_switch' ? 'apt_949' : 'hotel_lobby'].data).find(p => p.placement.type === type);
    for (const [type, states] of [['dn_lost_luggage', [{ searched: false }, { searched: true }]], ['light_switch', [{ lit: true }, { lit: false }]]]) {
        const p = piece(type), [a, b] = states.map(state => createPropDraws(propArtPacket({ appearance: p, state, position: [0, 0], width: p.width, height: p.height })).filter(d => d.key));
        assert.notEqual(a[0].key, b[0].key, `${type}: each state its own picture`);
        assert.notDeepEqual(a[0].build(), b[0].build(), `${type}: and each looks its part`);
    }
});

test('every native piece on the maps paints its still runs the same at any time, and a loop the same one period on', () => {
    // A still run becomes a picture painted once: an animation left in one would freeze. (The classic
    // pieces are proven the same way by the furniture-sprite regression in test-game-regressions.cjs.)
    const all = [...PIECES, ...HOME, ...[HOUSE, LOBBY, SUITE, CLUB, SANCTUM, CLINIC, NEURAL, TORQUE, PALACE, ENNI, ENNI_UPPER].flatMap(piecesOf)];
    const measure = text => ({ width: text.length * 4 });   // (no Canvas here to size a sign's words; any fixed measure proves the art still)
    const stills = (p, time, beat) => createPropDraws(propArtPacket({ appearance: p, position: [3, 4], width: p.width, height: p.height }), { time, beat, measure })
        .filter(d => d.key).map(d => [d.key, JSON.stringify(d.build())]);
    let loops = 0;
    for (const p of all) {
        const name = p.placement.type, loop = propArtLoop(p.family);
        if (loop) { assert.deepEqual(stills(p, 5, null), stills(p, 5 + loop.period, null), `${name}: one period on, the same frame`); loops++; continue; }
        assert.deepEqual(stills(p, 5, 2.25), stills(p, 987654.321, 41.8), `${name}: its painted art never changes over time or with the beat`);
    }
    assert.ok(all.length > 250 && loops >= 3, `checked ${all.length} pieces and ${loops} loops`);
});

/** Serves the checkout, opens a blank page and runs `fn(args)` there. */
async function inChromium(fn, args) {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/plain' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try { const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {}); return await page.evaluate(fn, args); }
    finally { await browser.close(); server.close(); }
}

/**
 * Draws every piece both ways in Chromium, the classic drawer (`venue.drawer`, cut from props-decor.js
 * between `venue.from` and `venue.to`) against the native draws, and compares them channel by channel.
 */
async function compare(pieces, venue) {
    // A piece with play state is compared in each: a lost thing closed and full, and open once searched; a switch lit and dark
    const states = p => p.interactionType === 'lost_luggage' ? [{ searched: false }, { searched: true }] : p.interactionType === 'light_switch' ? [{ lit: true }, { lit: false }] : [null];
    const cells = pieces.flatMap(p => states(p).map(state => ({ type: p.placement.type + (state ? ` ${JSON.stringify(state)}` : ''), base: p.placement.type, x: p.x, y: p.y, w: p.width, h: p.height,
        classic: { x: p.x, y: p.y, width: p.width, height: p.height, decorType: p.decorType, interactionType: p.interactionType, color: p.color, noteId: p.noteId, _searched: !!state?.searched, _switchState: !!state?.lit,
            decor: { face: p.face, vertical: !!p.vertical, candles: !!p.candles, variant: venue.variant?.(p) ?? p.variant | 0 }, ...venue.classic?.(p) },
        native: propArtPacket({ appearance: p, state, position: [p.x + p.width / 2, p.y + p.height / 2], width: p.width, height: p.height }) })));
    return inChromium(async ({ cells, time, beat, venue }) => {
        for (const list of Object.values(venue.cuts)) for (const c of list) c.splice(0, 2, ...c.slice(0, 2).map(f => (0, eval)(f)));
        const { createPropDraws } = await import('/src/game/presentation/props/index.mjs'), { canvasRenderer } = await import('/src/engine/basement/rendering/index.mjs');
        const text = async url => (await fetch(url)).text(), source = await text(venue.file), lamps = await text('/src/legacy/entities/lamps.js');
        const cut = (src, from, to) => src.slice(src.indexOf(from), to ? src.indexOf(to, src.indexOf(from)) : undefined);
        let prelude = ''; for (const [file, from, to] of venue.prelude) prelude += file ? cut(await text(file), from, to) : from;
        const drinks = (await (await fetch('/src/game/data/game-db/items.json')).json()).drinks;
        // The classic art's hosts: a split run draws all its segments in order; a lamp fixture draws as the vector its sprite is painted from
        const fixtures = lamps.slice(lamps.indexOf('        const FX_BRASS'), lamps.indexOf('        // An iron carriage lantern')) + lamps.slice(lamps.indexOf('        function _fxColor'), lamps.indexOf('        /** The sprite size for ctx'));
        const classic = (0, eval)(`(()=>{let _frameTime=${time * 1000};const PropPass={seg:()=>true},clubBeatN=()=>${beat},GLASS_DRINKS=${JSON.stringify(drinks)};
            const _lampTint=(hex,t)=>{const W=[255,246,228];return '#'+[1,3,5].map((i,j)=>{const v=parseInt(hex.slice(i,i+2),16);return Math.round(v+(W[j]-v)*t).toString(16).padStart(2,'0');}).join('');};${fixtures};
            function drawLampFixture(c,name,x,y,o={}){const s=o.scale||1;c.save();c.translate(x,y);c.scale(s,s);LAMP_FIXTURES[name].paint(c,!!o.lit,_fxColor(o.color));c.restore();}
            ${prelude}${venue.from ? cut(source, venue.from, venue.to) : ""};return ${venue.drawer};})()`);
        const PAD = 16, draw = (cell, paint) => { const W = Math.ceil(cell.w + 2 * PAD), H = Math.ceil(cell.h + 2 * PAD), canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = canvas.getContext('2d');
            ctx.fillStyle = '#20202a'; ctx.fillRect(0, 0, W, H); ctx.translate(PAD - cell.x, PAD - cell.y); paint(ctx); return ctx.getImageData(0, 0, W, H).data; };
        return cells.map(cell => {
            const a = draw(cell, ctx => classic(ctx, cell.classic));
            const b = draw(cell, ctx => { for (const d of createPropDraws(cell.native, { time, beat }).slice(1)) { ctx.save(); ctx.transform(...d.matrix); canvasRenderer.drawPackets(ctx, d.build()); ctx.restore(); } });
            const W = Math.ceil(cell.w + 2 * PAD), cut = k => (venue.cuts[cell.base] ?? []).some(([cx, cy, r]) => { const i = k >> 2, px = i % W - PAD + .5, py = (i / W | 0) - PAD + .5; return Math.hypot(px - cx(cell), py - cy(cell)) <= r + 1.5; });
            let worst = 0, off = 0, inked = 0; for (let k = 0; k < a.length; k++) { if (cut(k)) continue; const d = Math.abs(a[k] - b[k]); worst = Math.max(worst, d); if (d > 3) off++; }
            for (let k = 0; k < a.length; k += 4) if (a[k] !== 0x20 || a[k + 1] !== 0x20 || a[k + 2] !== 0x2a) inked++;
            let at = null; for (let k = 0; k < a.length; k++) if (!cut(k) && Math.abs(a[k] - b[k]) === worst && worst) { const i = k >> 2; at = [i % W - PAD, (i / W | 0) - PAD, [...a.slice(i * 4, i * 4 + 4)], [...b.slice(i * 4, i * 4 + 4)]]; break; }
            return { type: cell.type, worst, off, inked, at };
        });
    }, { cells, time: TIME, beat: BEAT, venue: { from: venue.from, to: venue.to, drawer: venue.drawer, cuts: venue.cuts ?? {}, file: venue.file ?? '/src/legacy/entities/props-decor.js', prelude: venue.prelude ?? [] } });
}
// Pieces whose classic art ruled hairlines (1 to 1.5 px, or under one, as a gondola's spine and highlight
// rails) with fillRect at fractional heights: the canvas covers a fillRect's edge rows differently from a
// path's, by up to this much along every such line. (A gondola's three nested outlines also part by up
// to 37/255 on a handful of pixels at its rounded left corners; checked by eye side by side.)
const FILL_RECTS = { ta_chest: 16, ec_gondola: 40, ec_cloth_aisle: 40, medbay_refill: 24 };   // (the health station's vials stand at half-pixel x)
// Pieces packed with tiny overlapping shapes in strongly contrasting colours (the rose bed's petals, a few
// pixels across): where two antialiased edges meet in one pixel, a quarter-pixel shift in coverage moves
// that pixel a long way between crimson and dark leaf. Still under 1% of the channels; worst up to this.
const TINY_OVERLAPS = { dp_roses: 64 };
function assertParity(results) {
    if (process.env.PROP_ART_REPORT) console.log(results.map(r => `${r.type} off ${r.off} worst ${r.worst} ${JSON.stringify(r.at)}`).join('\n'));
    for (const r of results) {
        assert.ok(r.inked > 100, `${r.type} draws something (${r.inked} pixels)`);
        // A canvas antialiases a few edge pixels a shade apart between a fillRect and a path, and along a curve
        // drawn under a transform instead of in world coordinates (most along a piece caught mid-bob at a
        // fractional height, as a floating chaise, and thin strokes at fractional x, as the fitting table's
        // garment rims): every channel within 8/255, or a handful
        // of edge channels (under 1% of the piece's) within 32/255. Each was checked by eye side by side.
        if (FILL_RECTS[r.type]) { assert.ok(r.worst <= FILL_RECTS[r.type], `${r.type} matches the classic art within its thin rules: worst ${r.worst}`); continue; }
        assert.ok(r.worst <= 8 || (r.off < r.inked * 4 * .01 && r.worst <= (TINY_OVERLAPS[r.type] ?? 32)), `${r.type} matches the classic art: ${r.off} channels off of ${r.inked * 4}, worst ${r.worst}`);
    }
}

test('native prop art matches the classic artwork pixel for pixel, for every piece in the cafe', { skip: !chromium && 'Playwright is not installed' }, async () => {
    // (The tote is a stash, compared with the others.) The classic art read the fern and the cocoa crate from `variant`; their placements now set the look.
    assertParity(await compare(PIECES.filter(p => p.placement.type.startsWith('cc_')), { from: '        const CC = {', to: "        // Enni Cole's display furniture", drawer: 'drawCafeDecorProp', variant: p => p.look?.fern || p.look?.label === 'COCOA' ? 1 : p.variant | 0 }));
});

test('native prop art matches the classic artwork pixel for pixel, for every piece in the apartment', { skip: !chromium && 'Playwright is not installed' }, async () => {
    assertParity(await compare(HOME.filter(p => p.placement.type.startsWith('apt_')), { from: '        const APT = {', to: '        // The House of Death (gauntlet)', drawer: 'drawApartmentDecorProp' }));
});

test('native prop art matches the classic artwork pixel for pixel, for every House piece in the House of Death', { skip: !chromium && 'Playwright is not installed' }, async () => {
    assertParity(await compare(piecesOf(HOUSE).filter(p => p.placement.type.startsWith('hod_')), { from: '        const HOD = {', to: '        // Double Nights (hotel lobby)', drawer: 'drawHouseDecorProp' }));
});

// The classic art bit its crescents out with a destination-out composite, which also cut through what lay
// beneath; the native crescents are shapes, so each crescent's disc and its bite (cx, cy, r in the piece's box)
// are not compared: the bite itself differs by design, and a canvas antialiases a crescent's outline a little apart
// from the plain circle it was cut from.
const CUTS = {
    ps_console: [['c => c.w / 2', 'c => c.h - 18', 2.6], ['c => c.w / 2 + 1.2', 'c => c.h - 18.6', 2.3]],
    ps_desk: [['c => 110', 'c => 40', 2.4], ['c => 111.2', 'c => 39.4', 2.1]],
    mc_stage: [['c => c.w / 2', 'c => 16', 9], ['c => c.w / 2 + 4', 'c => 14', 8]],
    mc_lost_purse: [['c => c.w / 2 + 1', 'c => c.h * .45 - .6', 1.9]]
};
const TORQUE_CLASSIC = p => ({ decor: { face: p.face, variant: p.look?.rim === '#ff9a2a' || p.look?.paint === '#7a1f1a' ? 1 : 0 } });   // the classic tyres and drum read their colour off the variant
const NEURAL_CLASSIC = p => ({ decor: { variant: ['wig', 'skin', 'vocal', 'chroma'].indexOf(p.look?.station ?? 'wig') } });   // the classic console read its station off the variant
const ENNI_CLASSIC = p => ({ decor: { face: p.face, variant: p.variant | 0, aisle: p.look?.aisle } });   // the classic gondolas read their aisle off the decor
const CLINIC_CLASSIC = p => ({ headSide: p.look?.head ?? 'left', patient: !!p.look?.patient });   // the classic bed read these off the placement
for (const [name, map, from, to, drawer, more] of [
    ['the Double Nights lobby', LOBBY, '        const DNL = {', '        /* The two machines every map shares', 'drawLobbyDecorProp', { only: /^dn_/ }],
    ['the Double Nights suite', SUITE, '        const DNL = {', '        /* The Sanctum (sc_*)', 'drawSuiteDecorProp', { only: /^ps_/ }],
    ['the Moon City Nightclub', CLUB, '        const MC = {', '        /* The hub graveyard', 'drawClubDecorProp', { only: /^mc_/ }],
    ['the Sanctum', SANCTUM, '        /* The Sanctum (sc_*)', '        /* =====', 'drawSanctumDecorProp'],
    ['the clinic', CLINIC, '        function drawClinicDecorProp', '        /** Pure prop artwork.', 'drawClinicDecorProp', { classic: CLINIC_CLASSIC }],
    ['Neural Systems', NEURAL, 'function drawNeuralDecorProp', '// The artificial trees', 'drawNeuralDecorProp', { classic: NEURAL_CLASSIC, file: '/src/legacy/engine/neural-art.js',
        prelude: [['/src/legacy/buildings/neural-systems.js', 'const NEURAL = {', 'const _nsFront']] }],
    ["Torque's auto shop", TORQUE, 'function drawTorqueDecorProp', 'engineMixin({', 'drawTorqueDecorProp', { classic: TORQUE_CLASSIC, file: '/src/legacy/engine/torque-art.js',
        prelude: [['/src/legacy/engine/torque-art.js', 'const TQ = {', '// The cars on show'], ['/src/legacy/engine/torque-art.js', 'const TorqueArt = {', '    /** One of TQ_CARS'], [null, '};']] }],
    ['the Demoness Palace', PALACE, '        function drawPalaceDecorProp', null, 'drawPalaceDecorProp', { file: '/src/legacy/engine/palace-art.js',
        prelude: [['/src/legacy/engine/palace-art.js', '        const PALACE = {', '        // Fixed lights'], ['/src/legacy/engine/palace-art.js', '        function palaceFlowers', '        function palaceFlowerGlow'],
            ['/src/legacy/core/utils.js', '        function seededRandom', '        const pickFrom']] }],
    ['the machines every map shares', { props: MAP_IDS.flatMap(id => createMapLibraries()[1].resources[id].data.props) }, null, null, 'drawMachine', { only: /^(vending_machine|medbay_refill|armory|light_switch|read_note)$/, file: null,
        // the classic drew them inline in drawPropAppearance, by what each is for: that chain, cut round its other branches
        prelude: [[DECOR, '        function drawMiniSpree', '        // Moon City Nightclub:'],
            [null, "function drawMachine(ctx,p){const center={x:p.x+p.width/2,y:p.y+p.height/2};ctx.save();ctx.translate(center.x,center.y);ctx.rotate(0);ctx.fillStyle=p.color;if(p.interactionType==='medbay_refill'){ctx.translate(-center.x,-center.y);drawHealthStation(ctx,p);}else if(p.interactionType==='vending_machine'){ctx.translate(-center.x,-center.y);drawMiniSpree(ctx,p);"],
            [DECOR, "                } else if (p.interactionType === 'armory') {", "                } else if (p.interactionType === 'vending_machine') {"],
            [DECOR, "                } else if (p.interactionType === 'light_switch') {", "                } else if (p.interactionType === 'bedside_table') {"],
            [DECOR, "                } else {\n                    // Default prop with 3D highlights", "\n                }\n\n                ctx.restore();"], [null, '}ctx.restore();}']] }],
    ['the stashes round the city', { props: [CAFE, HOUSE, TORQUE, PALACE, ENNI, ENNI_UPPER].flatMap(m => m.props) }, '        /* Stashes round the city', '        function drawClinicDecorProp', 'drawStashDecorProp', { only: /^ls_/ }],
    ['Enni Cole', ENNI, '        function drawEnniDecorProp', '        /* Stashes round the city', 'drawEnniDecorProp', { classic: ENNI_CLASSIC }],
    ['Enni Cole upstairs', ENNI_UPPER, '        function drawEnniDecorProp', '        /* Stashes round the city', 'drawEnniDecorProp', { classic: ENNI_CLASSIC }]])
    test(`native prop art matches the classic artwork pixel for pixel, for every piece in ${name}`, { skip: !chromium && 'Playwright is not installed' }, async () => {
        assertParity(await compare(piecesOf(map).filter(p => !STILL_CLASSIC.test(p.placement.type) && (more?.only ?? /^(?!ls_|(vending_machine|medbay_refill|armory|light_switch|read_note)$)/).test(p.placement.type)), { from, to, drawer, cuts: CUTS, ...more }));
    });

test('a stamped picture looks like the vector art it was painted from', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const cells = ['cc_counter', 'cc_armchair', 'cc_bookshelf', 'cc_fireplace'].map(type => { const p = PIECES.find(q => q.placement.type === type);
        return { type, w: p.width, h: p.height, native: propArtPacket({ appearance: p, position: [p.width / 2 + 16, p.height / 2 + 16], rotation: 0, width: p.width, height: p.height }) }; });
    const results = await inChromium(async ({ cells, time }) => {
        const { drawPropArt, createPropDraws } = await import('/src/game/presentation/props/index.mjs'), { canvasRenderer, pictureCache } = await import('/src/engine/basement/rendering/index.mjs');
        const pictures = new pictureCache();
        const draw = (cell, scale, paint) => { const W = Math.ceil((cell.w + 32) * scale), H = Math.ceil((cell.h + 32) * scale), canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = canvas.getContext('2d');
            ctx.fillStyle = '#20202a'; ctx.fillRect(0, 0, W, H); ctx.scale(scale, scale); paint(ctx); return ctx.getImageData(0, 0, W, H).data; };
        return cells.flatMap(cell => [1, 2].map(scale => {
            const a = draw(cell, scale, ctx => { for (const d of createPropDraws(cell.native, { time })) { ctx.save(); ctx.transform(...d.matrix); canvasRenderer.drawPackets(ctx, d.build()); ctx.restore(); } });
            pictures.beginFrame(); draw(cell, scale, ctx => drawPropArt(ctx, cell.native, { pictures, time }));
            const b = draw(cell, scale, ctx => drawPropArt(ctx, cell.native, { pictures, time }));
            let total = 0; for (let k = 0; k < a.length; k++) total += Math.abs(a[k] - b[k]);
            return { type: cell.type, scale, mean: total / a.length, pictures: pictures.statistics.pictures };
        }));
    }, { cells, time: TIME });
    for (const r of results) assert.ok(r.mean < 1.5, `${r.type} at ${r.scale}x: stamped within ${r.mean.toFixed(2)}/255 of its vector art on average`);
    assert.ok(results.at(-1).pictures >= 8, 'the pictures were kept');
});
