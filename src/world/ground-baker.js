        /* =====================================================================
           GROUND BAKER — the city's streets and ground, painted once per tile
           ---------------------------------------------------------------------
           The hub's ground (lots, lawns, the scrapyard), roads, intersections,
           pavements and crossings are painted into 512 px tiles the first time
           they come into view, and after that the frame just blits them (it used
           to redraw every road in full every frame). Tiles are kept in a small
           LRU (sized by memory: a half-res tile counts a quarter); a couple are
           painted per frame, more while the frame has time, and ahead of a
           moving car. A tile not painted yet at this resolution borrows the
           other one; only a tile never painted shows the plain ground colour.

           Roads are painted from their own geometry — corners and lane offsets
           along the road (Road.getCorners / paramToWorld) — so a diagonal or
           curved road only needs to describe itself the same way (paintRoad).

           The look: wet asphalt with grain and repairs, champagne lane dashes and
           a lavender centre line, worn ivory crossings, paver pavements with a
           lit kerb, drains and manholes; lawns where the ground is green.
           ===================================================================== */
        const GROUND_LOOK = {
            lot: '#221e28', asphalt: '#16141b', asphaltHi: '#1e1b25', joint: '#121017',
            dash: 'rgba(232, 200, 140, 0.62)', centre: 'rgba(196, 168, 255, 0.55)', edge: 'rgba(226, 214, 240, 0.16)',
            paveA: '#2b2731', paveB: '#27232d', seam: 'rgba(8, 6, 12, 0.55)', kerb: '#3b3542', kerbLit: 'rgba(232, 200, 140, 0.22)',
            stripe: 'rgba(234, 226, 212, 0.6)', lawn: '#15281b', lawnHi: '#20402a', lawnLo: 'rgba(6, 18, 10, 0.7)'
        };

        class GroundBaker {
            constructor(game) {
                this.game = game;
                this.S = 512;                 // tile size (world px, painted 1:1)
                this.max = 40;                // full-size tiles' worth kept (≈ 40 MB at most; a half-res tile counts ¼)
                this.lod = 0;
                this.weight = 0;
                this.cache = new Map();
                this.mapId = null;
            }

            /** Only the city is baked (other maps keep their own ground). */
            activeFor(map) { return !!(map && map.id === 'hub_949' && this.game.traffic && this.game.traffic.network && this.game.traffic.network.roads.length); }

            invalidate() { this.cache.clear(); this.weight = 0; }

            /**
             * Blit the tiles under the view. Missing tiles are painted within a small
             * time budget; until one is ready, the same tile at the other resolution
             * stands in (scaled), and only a tile never painted at all shows the plain
             * ground. Spare budget paints ahead of the car, so fast driving meets
             * tiles that are already there. stats: this frame's counts (tests read it).
             */
            draw(ctx, view) {
                const map = this.game.activeMap, G = CONFIG.GROUND_BAKE;
                if (map.id !== this.mapId) { this.invalidate(); this.mapId = map.id; }
                const z = this.game.camera.zoom || 1;                            // zoomed out: half-resolution tiles (much cheaper to blit)
                if (this.lod === 0 && z < G.HALF_RES_BELOW) this.lod = 1;         // with a band, so a wobbling zoom doesn't
                else if (this.lod === 1 && z > G.FULL_RES_ABOVE) this.lod = 0;    // flip every tile back and forth
                const S = this.S, cols = Math.ceil(map.width / S) - 1, rows = Math.ceil(map.height / S) - 1;
                const range = (v) => [Math.max(0, Math.floor(v.left / S)), Math.max(0, Math.floor(v.top / S)),
                                      Math.min(cols, Math.floor(v.right / S)), Math.min(rows, Math.floor(v.bottom / S))];
                const [i0, j0, i1, j1] = range(view);
                this.t0 = performance.now(); this.baked = 0;
                this.stats = { flat: 0, stand: 0, baked: 0 };
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                    let t = this._tile(i, j, this.lod);
                    if (!t) { t = this.cache.get(i + ',' + j + ',' + (1 - this.lod)); if (t) this.stats.stand++; }
                    if (t) ctx.drawImage(t, i * S, j * S, S, S);
                    else { this.stats.flat++; ctx.fillStyle = GROUND_LOOK.lot; ctx.fillRect(i * S, j * S, S, S); }
                }
                // Ahead of the car: the tiles it's about to reach, while there's time left
                const car = this.game.isDriving && this.game.car;
                if (car && (car.vx || car.vy)) {
                    const lx = car.vx * G.AHEAD_TICKS, ly = car.vy * G.AHEAD_TICKS;
                    const [a0, b0, a1, b1] = range({ left: view.left + Math.min(0, lx), right: view.right + Math.max(0, lx),
                                                     top: view.top + Math.min(0, ly), bottom: view.bottom + Math.max(0, ly) });
                    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
                        if (i >= i0 && i <= i1 && j >= j0 && j <= j1) continue;
                        if (!this._canBake()) break;
                        this._tile(i, j, this.lod);
                    }
                }
                this.stats.baked = this.baked;
            }

            /** Room to paint another tile this frame: a couple always, more while the frame has time. */
            _canBake() {
                const G = CONFIG.GROUND_BAKE;
                return this.baked < G.MIN_PER_FRAME || (this.baked < G.MAX_PER_FRAME && performance.now() - this.t0 < G.FRAME_MS);
            }

            _tile(i, j, lod) {
                const key = i + ',' + j + ',' + lod;
                const hit = this.cache.get(key);
                if (hit) { this.cache.delete(key); this.cache.set(key, hit); return hit; }   // most recent last
                if (!this._canBake()) return null;
                this.baked++;
                const cv = this._bake(i, j, lod);
                cv._w = lod ? 0.25 : 1;                                          // memory, in full-size tiles
                this.cache.set(key, cv); this.weight = (this.weight || 0) + cv._w;
                while (this.weight > this.max && this.cache.size > 1) {         // the oldest go first
                    const k0 = this.cache.keys().next().value;
                    this.weight -= this.cache.get(k0)._w || 1; this.cache.delete(k0);
                }
                return cv;
            }

            _bake(i, j, lod = 0) {
                const S = this.S, g = this.game, map = g.activeMap, k = 1 / (1 << lod);
                const cv = document.createElement('canvas'); cv.width = S * k; cv.height = S * k;
                const c = cv.getContext('2d');
                c.scale(k, k);
                const x0 = i * S, y0 = j * S, R = { left: x0, top: y0, right: x0 + S, bottom: y0 + S };
                const hits = (x, y, w, h) => x < R.right && x + w > R.left && y < R.bottom && y + h > R.top;
                const rnd = seededRandom(i * 7919 + j * 104729 + 949);
                c.translate(-x0, -y0);
                // 1. The lots: a dark violet ground with a fine grain
                c.fillStyle = GROUND_LOOK.lot; c.fillRect(x0, y0, S, S);
                for (let k = 0; k < 420; k++) {
                    c.fillStyle = rnd() < 0.5 ? 'rgba(255, 240, 255, 0.022)' : 'rgba(0, 0, 0, 0.14)';
                    c.fillRect(x0 + rnd() * S, y0 + rnd() * S, 1 + rnd() * 3, 1 + rnd() * 2);
                }
                // 2. Floor zones: green ones are lawns, the rest tint the ground
                for (const z of map.floorZones || []) {
                    if (!hits(z.x, z.y, z.w, z.h)) continue;
                    if (this._isGreen(z.color)) this._paintLawn(c, z, R, rnd);
                    else { c.globalAlpha = 0.45; c.fillStyle = z.color; c.fillRect(z.x, z.y, z.w, z.h); c.globalAlpha = 1; }
                }
                // 3. Parks and plazas (city-layout zones)
                const city = map.cityLayout;
                if (city) for (const b of city.blocks) {
                    if ((b.type === 'PARK' || b.type === 'PLAZA') && hits(b.x, b.y, b.w, b.h) && typeof paintParkGround === 'function') paintParkGround(c, b, R);
                }
                // 4. Roads, then intersections over them
                const net = g.traffic.network;
                for (const road of net.roads) if (hits(road.x, road.y, road.w, road.h)) this.paintRoad(c, road, R, rnd);
                for (const ix of net.intersections) if (hits(ix.x, ix.y, ix.width, ix.height)) this._paintIntersection(c, ix);
                // 5. Pavements and crossings
                for (const p of map.pavements || []) if (hits(p.x, p.y, p.w, p.h)) this._paintPavement(c, p, R, rnd);
                for (const cw of map.crosswalks || []) if (hits(cw.x, cw.y, cw.w, cw.h)) this._paintCrossing(c, cw, rnd);
                return cv;
            }

            _isGreen(col) {
                const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(col || '');
                return !!m && parseInt(m[2], 16) > parseInt(m[1], 16) + 6 && parseInt(m[2], 16) > parseInt(m[3], 16) + 4;
            }

            _paintLawn(c, z, R, rnd) {
                const x = Math.max(z.x, R.left), y = Math.max(z.y, R.top), w = Math.min(z.x + z.w, R.right) - x, h = Math.min(z.y + z.h, R.bottom) - y;
                c.fillStyle = GROUND_LOOK.lawn; c.fillRect(x, y, w, h);
                for (let k = 0; k < (w * h) / 180; k++) { c.fillStyle = rnd() < 0.55 ? GROUND_LOOK.lawnHi : GROUND_LOOK.lawnLo; c.fillRect(x + rnd() * w, y + rnd() * h, 2, 1 + rnd() * 2); }
                for (let k = 0; k < (w * h) / 9000; k++) {                                      // soft darker hollows
                    const cx = x + rnd() * w, cy = y + rnd() * h, r = 20 + rnd() * 50, gr = c.createRadialGradient(cx, cy, 0, cx, cy, r);
                    gr.addColorStop(0, 'rgba(4, 14, 8, 0.35)'); gr.addColorStop(1, 'rgba(4, 14, 8, 0)'); c.fillStyle = gr; c.fillRect(cx - r, cy - r, r * 2, r * 2);
                }
            }

            /**
             * A road, painted from its geometry: asphalt with grain and repairs, wheel paths,
             * lane dashes, the centre line, faint edges and its name. Works for any angle; a
             * curved road would provide the same getCorners/paramToWorld along its path.
             */
            paintRoad(c, road, R, rnd) {
                const L = GROUND_LOOK, corners = road.getCorners(), halfT = road.thickness / 2;
                c.save();
                c.beginPath(); corners.forEach((p, k) => k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
                c.fillStyle = L.asphalt; c.fill();
                c.clip();
                // Grain, repairs (patches of fresher tar), wheel paths darker down each lane
                const x = Math.max(road.x, R.left), y = Math.max(road.y, R.top), w = Math.min(road.x + road.w, R.right) - x, h = Math.min(road.y + road.h, R.bottom) - y;
                for (let k = 0; k < (w * h) / 60; k++) { c.fillStyle = rnd() < 0.5 ? 'rgba(255,240,255,0.03)' : 'rgba(0,0,0,0.18)'; c.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1); }
                for (let k = 0; k < (w * h) / 40000; k++) { c.fillStyle = L.asphaltHi; c.fillRect(x + rnd() * w, y + rnd() * h, 30 + rnd() * 70, 16 + rnd() * 30); }
                const lanes = road.symmetrical ? road.numLanes * 2 : road.numLanes;
                c.lineWidth = 9; c.strokeStyle = 'rgba(0, 0, 0, 0.16)';
                for (let l = 0; l < lanes; l++) for (const off of [-13, 13]) {
                    const lat = -halfT + road.laneWidth * (l + 0.5) + off, a = road.paramToWorld(0, lat), b = road.paramToWorld(road.length, lat);
                    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
                }
                // Lane markings
                const line = (lat, style) => { const a = road.paramToWorld(0, lat), b = road.paramToWorld(road.length, lat); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
                for (let l = 1; l < lanes; l++) {
                    const lat = l * road.laneWidth - halfT;
                    if (road.symmetrical && l === road.numLanes) {                               // the centre: a double lavender line
                        c.setLineDash([]); c.strokeStyle = L.centre; c.lineWidth = 1.6; line(lat - 3, 'solid'); line(lat + 3, 'solid');
                    } else { c.setLineDash([22, 18]); c.strokeStyle = L.dash; c.lineWidth = 2; line(lat, 'dash'); }
                }
                c.setLineDash([]); c.strokeStyle = L.edge; c.lineWidth = 1.5; line(-halfT + 5); line(halfT - 5);
                // Its name, painted on the tarmac every 600 px, one per carriageway
                if (road.name) {
                    c.font = '600 11px Montserrat, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(232, 214, 190, 0.22)';
                    const n = Math.max(1, Math.round(road.length / 600)), lat = Math.min(13, road.laneWidth * 0.35) + 8;
                    for (let k = 0; k < n; k++) {
                        const along = road.length * (k + 0.5) / n;
                        for (const s of road.symmetrical ? [-1, 1] : [1]) {
                            const p = road.paramToWorld(along, s * lat);
                            c.save(); c.translate(p.x, p.y); c.rotate(road.angle + (s > 0 ? Math.PI : 0)); c.fillText(road.name.toUpperCase(), 0, 0); c.restore();
                        }
                    }
                }
                c.restore();
            }

            _paintIntersection(c, ix) {
                c.fillStyle = GROUND_LOOK.asphalt; c.fillRect(ix.x, ix.y, ix.width, ix.height);
                c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.strokeRect(ix.x + 0.5, ix.y + 0.5, ix.width - 1, ix.height - 1);
                const cx = ix.x + ix.width / 2, cy = ix.y + ix.height / 2;                      // a manhole, off-centre
                c.fillStyle = '#1d1a22'; c.beginPath(); c.arc(cx + 22, cy - 18, 11, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(232, 200, 140, 0.18)'; c.lineWidth = 1; c.stroke();
                c.strokeStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); for (let k = -6; k <= 6; k += 4) { c.moveTo(cx + 22 - 7, cy - 18 + k); c.lineTo(cx + 22 + 7, cy - 18 + k); } c.stroke();
            }

            _paintPavement(c, p, R, rnd) {
                const L = GROUND_LOOK, T = 25;
                c.save(); c.beginPath(); c.rect(Math.max(p.x, R.left), Math.max(p.y, R.top), Math.min(p.x + p.w, R.right) - Math.max(p.x, R.left), Math.min(p.y + p.h, R.bottom) - Math.max(p.y, R.top)); c.clip();
                c.fillStyle = L.paveA; c.fillRect(p.x, p.y, p.w, p.h);
                const gx0 = Math.floor(Math.max(p.x, R.left - T) / T) * T, gy0 = Math.floor(Math.max(p.y, R.top - T) / T) * T;
                for (let gx = gx0; gx < Math.min(p.x + p.w, R.right); gx += T) for (let gy = gy0; gy < Math.min(p.y + p.h, R.bottom); gy += T) {
                    const hsh = _bldHash(gx * 0.13 + gy * 0.71, 3);
                    if (hsh < 0.35) { c.fillStyle = L.paveB; c.fillRect(gx, gy, T, T); }
                    else if (hsh > 0.93) { c.fillStyle = 'rgba(255, 236, 250, 0.035)'; c.fillRect(gx, gy, T, T); }
                }
                c.strokeStyle = L.seam; c.lineWidth = 1; c.beginPath();
                for (let gx = gx0; gx <= p.x + p.w; gx += T) { c.moveTo(gx + 0.5, p.y); c.lineTo(gx + 0.5, p.y + p.h); }
                for (let gy = gy0; gy <= p.y + p.h; gy += T) { c.moveTo(p.x, gy + 0.5); c.lineTo(p.x + p.w, gy + 0.5); }
                c.stroke();
                // Kerbs all round, their top edge catching the light; a drain every so often
                c.strokeStyle = L.kerb; c.lineWidth = 4; c.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
                c.strokeStyle = L.kerbLit; c.lineWidth = 1; c.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
                const long = p.w > p.h;
                for (let s = 180; s < (long ? p.w : p.h) - 40; s += 260) {
                    const dx = long ? p.x + s : p.x + 6, dy = long ? p.y + 6 : p.y + s;
                    c.fillStyle = '#141218'; c.fillRect(dx, dy, long ? 22 : 8, long ? 8 : 22);
                    c.strokeStyle = 'rgba(120, 110, 130, 0.35)'; c.beginPath();
                    for (let k = 2; k < 22; k += 4) { if (long) { c.moveTo(dx + k, dy + 1); c.lineTo(dx + k, dy + 7); } else { c.moveTo(dx + 1, dy + k); c.lineTo(dx + 7, dy + k); } }
                    c.stroke();
                }
                c.restore();
            }

            _paintCrossing(c, cw, rnd) {
                c.fillStyle = GROUND_LOOK.asphalt; c.fillRect(cw.x, cw.y, cw.w, cw.h);
                c.fillStyle = GROUND_LOOK.stripe;
                const stripe = (x, y, w, h) => {                                                 // worn: a few gaps, softer ends
                    c.fillRect(x, y, w, h);
                    c.fillStyle = 'rgba(22, 20, 27, 0.55)';
                    for (let k = 0; k < 5; k++) c.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 4, 1 + rnd() * 3);
                    c.fillStyle = GROUND_LOOK.stripe;
                };
                if (cw.orientation === 'H') for (let sy = cw.y + 8; sy < cw.y + cw.h - 8; sy += 18) stripe(cw.x + 8, sy, cw.w - 16, 11);
                else for (let sx = cw.x + 8; sx < cw.x + cw.w - 8; sx += 18) stripe(sx, cw.y + 8, 11, cw.h - 16);
            }
        }
