#!/usr/bin/env node
/*
 * Checks each landmark's declared reaches against what it actually puts on screen. The culling
 * (BuildingV2.inView) draws a landmark's pass only when its outline (footprint and leaned roof, or crown),
 * widened by a reach, touches the view:
 *   topReach      the base and roof passes (porticos, canopies, posts in front of it)
 *   glowReach     the glow pass without its beams (lamp halos, mist, the crown)
 *   emissiveReach the whole glow pass, beams and all
 * For cameras all round each landmark, near and far, at several zooms, in landscape and portrait, by day and night
 * and across its animations, this draws each pass into a canvas the size of the screen. Whenever any of it shows,
 * the reach that pass needs is at least the gap between the outline and the view. A landmark that needs more than
 * it declares would be cut off at the screen's edge, so after changing a landmark's art, or adding a new one, run
 * this and set the numbers it prints (with a margin).
 *
 *   node tools/build.mjs && node tools/measure-landmark-reach.cjs ["DFAB V8.html"] [map ...]
 *
 * Needs Playwright with a Chromium (npm i -D playwright, or NODE_PATH to a global install). Maps default to the
 * hub; every building on them that declares a topReach or glowReach is checked. Exits 1 if any needs more than it declares.
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright not found: npm i -D playwright (or set NODE_PATH to a global install).'); process.exit(2); }

const args = process.argv.slice(2), file = path.resolve(args[0] || 'DFAB V8.html'), maps = args.length > 1 ? args.slice(1) : ['hub_949'];

(async () => {
    const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 915, height: 412 } })).newPage();
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('file://' + file); await page.waitForTimeout(1500);
    let failed = false;
    for (const map of maps) {
        const rows = await page.evaluate((map) => {
            game.loop = () => {}; game.resetGameState(); game.story.update = () => {}; game._doLoadMap(map, null); game.running = false; game.enterWorld(); game.loop = () => {};
            for (let i = 0; i < 3; i++) { game.update(); game.draw(); }
            const LZ = CONFIG.LOD_ZOOM, pad = CONFIG.CULLING.BUILDINGS_VIEW, out = [];
            const cv = document.createElement('canvas'), c = cv.getContext('2d', { willReadFrequently: true });
            // Does any of this pass show in the view V (screen px W x H at zoom z)?
            const shows = (V, z, draw) => {
                c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
                c.setTransform(z, 0, 0, z, -V.left * z, -V.top * z);
                c.save(); try { draw(c); } finally { c.restore(); }
                const d = new Uint32Array(c.getImageData(0, 0, cv.width, cv.height).data.buffer);
                for (let i = 0; i < d.length; i++) if (d[i] >>> 24) return true;
                return false;
            };
            const beamsOff = (bl, fn) => { bl._sqDrawBeams = bl._mcBeams = () => {}; try { fn(); } finally { delete bl._sqDrawBeams; delete bl._mcBeams; } };
            for (const bl of game.activeMap.buildings) {
                if (!bl.isV2 || (bl.topReach === undefined && bl.glowReach === undefined)) continue;
                const bw = bl.w || 200, bh = bl.h || 200, cx = bl.x + bw / 2, cy = bl.y + bh / 2, need = { top: 0, glow: 0, all: 0 };
                let n = 0;
                for (const [W, H] of [[915, 412], [412, 915]]) {
                    cv.width = W; cv.height = H;
                    for (const z of [0.55, 0.75, 1, 1.43, 2.5]) {
                        let lod = 0; while (lod < 2 && z < LZ[lod].in) lod++; _zoomLOD = lod;
                        for (let a = 0; a < 16; a++) {
                            const ang = (a + 0.5) / 16 * Math.PI * 2;
                            for (let d = 0; d < 8000; d += 60) {
                                const camx = cx + Math.cos(ang) * d, camy = cy + Math.sin(ang) * d;
                                const V = { left: camx - W / 2 / z, right: camx + W / 2 / z, top: camy - H / 2 / z, bottom: camy + H / 2 / z };
                                // The outline inView reckons, and its gap to the view (what reach + BUILDINGS_VIEW must cover)
                                const k = bl._hullK();
                                const xs = [bl.x, bl.x + bw, camx + (bl.x - camx) * k, camx + (bl.x + bw - camx) * k], ys = [bl.y, bl.y + bh, camy + (bl.y - camy) * k, camy + (bl.y + bh - camy) * k];
                                const gap = Math.max(V.left - Math.max(...xs), Math.min(...xs) - V.right, V.top - Math.max(...ys), Math.min(...ys) - V.bottom) - pad;
                                if (gap <= 0) continue;
                                if (gap > 2000) break;
                                game.camera.x = camx; game.camera.y = camy; game.camera.zoom = z; game.player.x = camx; game.player.y = camy;
                                game.view = { x: camx, y: camy, zoom: z, shakeX: 0, shakeY: 0 };
                                _gameTimeSec = (n * 3.7) % 240; _frameTime = _gameTimeSec * 1000; _frameTimeSec = _gameTimeSec;    // across the beams' sweeps and the other animations
                                game.worldMinutes = (n % 2 ? 22 : 12) * 60;
                                const dark = n % 2 ? 1 : 0.5;
                                n++;
                                if (gap > need.top && shows(V, z, (q) => { if (bl.drawBase) bl.drawBase(q); bl.drawTop(q, game.worldMinutes); })) need.top = gap;
                                if (gap > need.all && shows(V, z, (q) => bl.drawEmissive(q, dark))) need.all = gap;
                                if (gap > need.glow) beamsOff(bl, () => { if (shows(V, z, (q) => bl.drawEmissive(q, dark))) need.glow = gap; });
                            }
                        }
                    }
                }
                out.push({ style: bl.style, samples: n, need: [need.top, need.glow, need.all].map(Math.ceil), declared: [bl.topReach, bl.glowReach, bl.emissiveReach || 0] });
            }
            return out;
        }, map);
        console.log(`${map}: the reach each pass needs to show everything it draws (needed / declared, world px)`);
        if (!rows.length) console.log('  no building here declares a topReach or glowReach');
        for (const r of rows) {
            const cells = ['topReach', 'glowReach', 'emissiveReach'].map((name, i) => {
                const dec = r.declared[i], over = dec != null && r.need[i] > dec;
                if (over) failed = true;
                return `${name} ${r.need[i]} / ${dec == null ? '-' : dec}${over ? '  OVER' : ''}`;
            });
            console.log(`  ${r.style.padEnd(14)} ${cells.join('   ')}   (${r.samples} views)`);
        }
    }
    await browser.close();
    if (failed) { console.log('A landmark would be cut off at the screen edge: raise that reach to what it needs plus a margin.'); process.exit(1); }
})();
