        /* =====================================================================
           CITY VIEW — a stretch of the hub's city seen from high up: the street
           below the Silver Queen's veranda (apt_949), or any interior's window.
           Built from the hub's own kit, laid out in hub units and drawn `scale`
           the size in its world rect (x, y, w, h), the viewer standing below it:
             - buildings: the hub's generic apartments, shops and warehouses
               (buildings/factories.js, the mix the hub fills its blocks with),
               leaning away from a camera at the viewer as the hub's do;
             - ground: GroundBaker's painters (world/ground-baker.js) for the
               roads, junctions, pavements and zebra crossings;
             - street lamps (entities/lamps.js) and trees (entities/street-objects.js);
             - traffic: the hub's car sprites (traffic/car-art.js); people on the
               pavements; signals at the junctions; beacons on the tall roofs.
           The still city is painted once (bakeBase), and its night lights once
           (bakeGlow: lit windows, signs, lamp heads and pools), each in its own
           canvas; per frame only what moves draws, only where it shows, and
           nothing at all while the rect is off screen (viewHasRect).
           ===================================================================== */
        const CITY_VIEW_LAMP = '#ffcf8a';
        const CITY_VIEW_PEOPLE = ['200,155,255', '255,216,176', '169,191,255', '255,143,184', '232,194,122', '243,230,208'];

        class CityView {
            /** o: { x, y, w, h (world rect), seed, scale (world px a hub px), res / glowRes (canvas px a world px) } */
            constructor(o) {
                Object.assign(this, { seed: 1, scale: 0.5, res: 1.5, glowRes: 1 }, o);
                this.VW = this.w / this.scale; this.VH = this.h / this.scale;
                this.base = null; this.glow = null; this.bakeMs = 0;
                this._stamps = new Map();
                this._layout();
            }

            _rand(seed) {
                let s = (seed * 2654435761) >>> 0;
                return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
            }

            /** Hub units, y down; the viewer's own building is at the bottom (VH), the city runs out to the top */
            _layout() {
                const VW = this.VW, VH = this.VH, rnd = this._rand(this.seed), range = (a, b) => a + (b - a) * rnd();
                const B = this.bands = {
                    chasm: VH - 40,                     // our own building's foot, in its shadow, below this
                    nearPave: VH - 110,                 // the near pavement: nearPave..chasm
                    street: VH - 270,                   // the main street, two lanes each way: street..nearPave
                    farPave: VH - 340                   // the far pavement: farPave..street; the blocks beyond
                };
                B.back = B.farPave - 330;                // the first row's backs; the second row beyond, into the haze
                this.CW = 100; this.PW = 36;              // a cross street, and the pavements down its sides
                this.cross = [];
                for (let x = range(220, 520); x < VW - 220; x += range(760, 980)) this.cross.push(Math.round(x));
                // Blocks: the hub's generic buildings, in its own mix (apartments 3 : shops 3 : warehouses 2)
                this.buildings = [];
                const make = (k, x, y, w, d) => {
                    const f = k === 'apt' ? createGenericApartment : k === 'shop' ? createGenericShop : createGenericWarehouse;
                    const b = f(Math.round(x), Math.round(y), { id: 'city_view_' + this.buildings.length, sections: [{ x: 0, y: 0, w: Math.round(w), h: Math.round(d) }] });
                    this.buildings.push(b);
                };
                const fill = (x0, x1, front, maxD) => {
                    let x = x0 + range(10, 34);
                    while (x < x1 - 130) {
                        const r = rnd() * 8, k = r < 3 ? 'apt' : r < 6 ? 'shop' : 'ware';
                        const w = Math.min(x1 - x, k === 'apt' ? range(220, 320) : k === 'shop' ? range(170, 250) : range(280, 400));
                        const d = Math.min(maxD, k === 'apt' ? range(200, 270) : k === 'shop' ? range(150, 210) : range(240, 300));
                        if (w < 130) break;
                        make(k, x, front - d, w, d);
                        x += w + range(24, 64);
                    }
                };
                const edges = [-60, ...this.cross.flatMap(x => [x - this.PW, x + this.CW + this.PW]), VW + 60];
                for (let i = 0; i < edges.length; i += 2) {
                    fill(edges[i], edges[i + 1], B.farPave - range(12, 26), 300);           // the row across the street
                    fill(edges[i], edges[i + 1], B.back - range(16, 40), 280);              // the row behind, mostly in the haze
                }
                // Street lamps along both pavements (none in a junction's mouth), trees between them on the far side
                this.lamps = []; this.trees = [];
                const inMouth = (x, m) => this.cross.some(cx => x > cx - m && x < cx + this.CW + m);
                for (let x = range(60, 200); x < VW; x += range(250, 300)) {
                    if (!inMouth(x, 40)) this.lamps.push({ x, y: B.farPave + 12, style: rnd() < 0.5 ? 'antique_twin' : 'antique_crook' });
                    this.lamps.push({ x: x + range(-40, 40), y: B.chasm - 12, style: rnd() < 0.5 ? 'antique_twin' : 'antique_crook' });
                    const tx = x + range(110, 150);
                    if (!inMouth(tx, 50) && rnd() < 0.7) this.trees.push({ x: tx, y: B.farPave + 38, kind: ['tree', 'glow_purple', 'glow_pink', 'tree'][Math.floor(rnd() * 4)], size: range(0.85, 1.15), variant: Math.floor(rnd() * 4) });
                }
                // Traffic: two lanes each way on the main street (right-hand: eastbound on the near side), one car down each cross street
                const brands = Object.keys(VEHICLE_BRANDS);
                const look = () => {
                    const key = brands[Math.floor(rnd() * brands.length)], br = VEHICLE_BRANDS[key], models = Object.keys(br.models);
                    const m = models[Math.floor(rnd() * models.length)], md = br.models[m];
                    return { brand: key, model: m, length: md.length, width: md.width, visualStyle: br.visualStyle, glowColor: br.glowColor,
                             color: br.colors[Math.floor(rnd() * br.colors.length)], noHearseCap: md.noHearseCap || false };
                };
                this.cars = [];
                for (let l = 0; l < 4; l++) {
                    const dir = l < 2 ? -1 : 1, y = B.street + 20 + l * 40;
                    for (let n = Math.round(VW / range(560, 720)), i = 0; i < n; i++)
                        this.cars.push({ axis: 'h', y, dir, offset: rnd() * (VW + 240), speed: range(150, 230), v: look() });
                }
                for (const cx of this.cross) {
                    const dir = rnd() < 0.5 ? -1 : 1;
                    this.cars.push({ axis: 'v', x: cx + this.CW / 2 + (dir > 0 ? -25 : 25), dir, offset: rnd() * 1000, speed: range(110, 170), v: look() });
                }
                // People on both pavements
                this.peds = [];
                for (const [y0, y1] of [[B.farPave + 10, B.street - 10], [B.nearPave + 10, B.chasm - 6]])
                    for (let i = 0; i < 10; i++) this.peds.push({ y: range(y0, y1), offset: rnd() * (VW + 60), speed: range(16, 32) * (rnd() < 0.5 ? -1 : 1),
                                                                  tint: CITY_VIEW_PEOPLE[Math.floor(rnd() * CITY_VIEW_PEOPLE.length)], bob: rnd() * 6 });
                this.signals = this.cross.map(cx => ({ x0: cx - 10, x1: cx + this.CW + 10, y: B.street - 8, phase: rnd() * 11 }));
            }

            /** Draw with the hub's lean, from a camera at the viewer (and full detail); the game's camera comes back after */
            _asViewer(fn) {
                const g = game, cam = g.camera, lod = _zoomLOD;
                g.camera = { x: this.VW / 2, y: this.VH + 120, zoom: CONFIG.BUILDINGS.REF_ZOOM, shakeX: 0, shakeY: 0 };
                _zoomLOD = 0;
                try { fn(); } finally { g.camera = cam; _zoomLOD = lod; }
            }
            _byDepth() { return this.buildings.slice().sort((a, b) => (a.y + a.h) - (b.y + b.h)); }   // far rows first
            _canvas(res) {
                const cv = document.createElement('canvas'), k = this.scale * res;
                cv.width = Math.ceil(this.w * res); cv.height = Math.ceil(this.h * res);
                const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
                return [cv, c];
            }

            /** The still city, painted once */
            bakeBase() {
                const t0 = performance.now(), [cv, c] = this._canvas(this.res);
                this._asViewer(() => {
                    this._paintGround(c);
                    for (const b of this.buildings) if (b.drawBase) b.drawBase(c);
                    for (const b of this._byDepth()) b.drawTop(c, game.worldMinutes);
                    for (const b of this.buildings) if (b.drawSign) b.drawSign(c);
                });
                for (const t of this.trees) {
                    const spr = floraSprite(t.kind, t.size, t.variant), r = spr.w * 0.36;
                    c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(t.x + 3, t.y + 4, r, r * 0.82, 0, 0, Math.PI * 2); c.fill();
                    c.drawImage(spr.cv, t.x - spr.w / 2, t.y - spr.w / 2);
                }
                for (const l of this.lamps) this._lamp(c, l, false);
                this._paintAir(c);
                this.base = cv; this.bakeMs += performance.now() - t0;
            }

            /** The night lights, painted once: lit windows, signs and rims (each building's own glow pass), lamp heads and pools */
            bakeGlow() {
                const t0 = performance.now(), [cv, c] = this._canvas(this.glowRes);
                this._asViewer(() => { for (const b of this._byDepth()) b.drawEmissive(c, 1); });
                c.globalCompositeOperation = 'lighter';
                const head = bulbSprite(c, '255,240,214', 1, 2.2, '255,207,138', 0.45, 16, true);
                for (const l of this.lamps) {
                    glowA(c, l.x, l.y + 6, 140, '255, 196, 140', 0.4);                     // its pool on the pavement
                    for (const p of LAMP_STYLES[l.style].bulbs) drawBulb(c, head, l.x + p.x * LAMP_POST_SCALE, l.y + p.y * LAMP_POST_SCALE, 1);
                }
                this.glow = cv; this.bakeMs += performance.now() - t0;
            }

            _lamp(c, l, lit) {
                const [bx, by, bw, bh] = LAMP_STYLES[l.style].box, S = LAMP_POST_SCALE;
                c.drawImage(lampSprite(l.style, CITY_VIEW_LAMP, lit), l.x + bx * S, l.y + by * S, bw * S, bh * S);
            }

            _paintGround(c) {
                const GB = GroundBaker.prototype, L = GROUND_LOOK, VW = this.VW, VH = this.VH, B = this.bands, CW = this.CW, PW = this.PW;
                const rnd = this._rand(this.seed + 7), R = { left: -60, top: -420, right: VW + 60, bottom: VH };
                c.fillStyle = L.lot; c.fillRect(-60, -420, VW + 120, VH + 420);
                // Pavements: ours, the far side (broken by each cross street), and down both sides of the cross streets
                GB._paintPavement(c, { x: -60, y: B.nearPave, w: VW + 120, h: VH - B.nearPave + 20 }, R, rnd);
                const xs = [-60, ...this.cross.flatMap(x => [x, x + CW]), VW + 60];
                for (let i = 0; i < xs.length; i += 2) GB._paintPavement(c, { x: xs[i], y: B.farPave, w: xs[i + 1] - xs[i], h: B.street - B.farPave }, R, rnd);
                for (const x of this.cross) for (const px of [x - PW, x + CW]) GB._paintPavement(c, { x: px, y: -420, w: PW, h: B.farPave + 420 }, R, rnd);
                // Roads (GroundBaker paints the hub's from its traffic network; these are straight, so a few fields do)
                const road = (x, y, w, h, horiz, lanes, laneW) => ({
                    x, y, w, h, thickness: lanes * 2 * laneW, symmetrical: true, numLanes: lanes, laneWidth: laneW,
                    length: horiz ? w : h, angle: horiz ? 0 : Math.PI / 2, name: null,
                    getCorners: () => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
                    paramToWorld: (t, lat) => horiz ? { x: x + t, y: y + h / 2 + lat } : { x: x + w / 2 - lat, y: y + t }
                });
                GB.paintRoad(c, road(-60, B.street, VW + 120, B.nearPave - B.street, true, 2, 40), R, rnd);
                for (const x of this.cross) {
                    GB.paintRoad(c, road(x, -420, CW, B.street + 420, false, 1, CW / 2), R, rnd);
                    GB._paintIntersection(c, { x, y: B.street, width: CW, height: B.nearPave - B.street });
                    GB._paintCrossing(c, { x, y: B.farPave + 4, w: CW, h: B.street - B.farPave - 8, orientation: 'H' }, rnd);           // over the side street's mouth
                    GB._paintCrossing(c, { x: x - 72, y: B.street, w: 60, h: B.nearPave - B.street, orientation: 'V' }, rnd);          // over the main street
                }
            }

            /** Distance haze (the far rows fade into the night), and our own building's shadow at its foot */
            _paintAir(c) {
                const VW = this.VW, VH = this.VH, B = this.bands;
                const hz = c.createLinearGradient(0, 0, 0, B.farPave);
                hz.addColorStop(0, 'rgba(8, 6, 16, 0.94)'); hz.addColorStop(0.3, 'rgba(16, 12, 30, 0.6)');
                hz.addColorStop(0.7, 'rgba(18, 13, 34, 0.16)'); hz.addColorStop(1, 'rgba(18, 13, 34, 0)');
                c.fillStyle = hz; c.fillRect(-60, 0, VW + 120, B.farPave);
                const sh = c.createLinearGradient(0, VH, 0, B.chasm - 40);
                sh.addColorStop(0, 'rgba(0, 0, 0, 0.88)'); sh.addColorStop(0.55, 'rgba(0, 0, 0, 0.4)'); sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
                c.fillStyle = sh; c.fillRect(-60, B.chasm - 40, VW + 120, VH - B.chasm + 40);
            }

            /** A car's look turned to face east, west, south or north (rot 0..3), at twice the view's resolution */
            _carStamp(v, rot) {
                const sp = carSprite(v), key = v.brand + v.model + v.color + rot;
                let st = this._stamps.get(key);
                if (st) return st;
                const P = CAR_ART.PAD, Lw = sp.L + P * 2, Ww = sp.W + P * 2, r = this.scale * 2, side = rot > 1;
                const cv = document.createElement('canvas'); cv.width = Math.ceil((side ? Ww : Lw) * r); cv.height = Math.ceil((side ? Lw : Ww) * r);
                const c = cv.getContext('2d');
                c.translate(cv.width / 2, cv.height / 2); c.rotate([0, Math.PI, Math.PI / 2, -Math.PI / 2][rot]); c.scale(r, r);
                c.drawImage(sp.cv, -Lw / 2, -Ww / 2, Lw, Ww);
                st = { cv, w: (side ? Ww : Lw) * this.scale, h: (side ? Lw : Ww) * this.scale, L: sp.L };
                this._stamps.set(key, st);
                return st;
            }
            /** Where a car is now (hub units), which way it faces, how much of it shows (the cross streets fade in and out of the haze) */
            _carAt(car, t) {
                if (car.axis === 'h') {
                    const span = this.VW + 240;
                    return { x: ((car.offset + t * car.speed * car.dir) % span + span) % span - 120, y: car.y, rot: car.dir > 0 ? 0 : 1, a: 1 };
                }
                const y0 = -60, y1 = this.bands.farPave + 20, span = y1 - y0, y = ((car.offset + t * car.speed * car.dir) % span + span) % span + y0;
                return { x: car.x, y, rot: car.dir > 0 ? 2 : 3, a: Math.max(0, Math.min(1, Math.min(y - y0, y1 - y) / 70)) };
            }
            _pedStamp(tint) {
                const key = 'ped' + tint;
                let st = this._stamps.get(key);
                if (st) return st;
                const cv = document.createElement('canvas'); cv.width = cv.height = 16;
                const c = cv.getContext('2d');
                c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(9.5, 10, 4.5, 3.5, 0, 0, Math.PI * 2); c.fill();
                c.fillStyle = `rgb(${tint})`; c.beginPath(); c.arc(8, 8, 3.6, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(20,14,26,0.85)'; c.beginPath(); c.arc(8, 7.6, 1.8, 0, Math.PI * 2); c.fill();    // a head of dark hair, seen from above
                this._stamps.set(key, cv);
                return cv;
            }

            /** The floor pass: the still city, then the traffic and the people that show */
            drawBase(ctx) {
                if (!viewHasRect(this.x, this.y, this.w, this.h)) return;
                if (!this.base) this.bakeBase();
                ctx.drawImage(this.base, this.x, this.y, this.w, this.h);
                const V = game._cullBounds && game._cullBounds.view, vl = V ? V.left : -Infinity, vr = V ? V.right : Infinity;
                const s = this.scale, t = _frameTime / 1000;
                ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
                for (const car of this.cars) {
                    const p = this._carAt(car, t);
                    if (p.a <= 0.02) continue;
                    const st = this._carStamp(car.v, p.rot), x = this.x + p.x * s - st.w / 2;
                    if (x + st.w < vl || x > vr) continue;
                    ctx.globalAlpha = p.a; ctx.drawImage(st.cv, x, this.y + p.y * s - st.h / 2, st.w, st.h);
                }
                ctx.globalAlpha = 1;
                const span = this.VW + 60, pw = 8 * s * 2;
                for (const ped of this.peds) {
                    const x = this.x + (((ped.offset + t * ped.speed) % span + span) % span - 30) * s;
                    if (x + pw < vl || x - pw > vr) continue;
                    ctx.drawImage(this._pedStamp(ped.tint), x - pw / 2, this.y + ped.y * s + Math.sin(t * 6 + ped.bob) * 0.4 - pw / 2, pw, pw);
                }
                ctx.restore();
            }

            /** The glow pass (additive, after the darkness): the city's night lights, headlights and tail lights, signals, beacons */
            drawGlow(ctx, dark) {
                if (!viewHasRect(this.x, this.y, this.w, this.h)) return;
                if (!this.glow) this.bakeGlow();
                const V = game._cullBounds && game._cullBounds.view, vl = V ? V.left : -Infinity, vr = V ? V.right : Infinity;
                const s = this.scale, t = _frameTime / 1000, op = ctx.globalCompositeOperation, a0 = ctx.globalAlpha;
                ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = Math.max(0.15, Math.min(1, dark * 1.1));                  // as the hub's buildings glow
                ctx.drawImage(this.glow, this.x, this.y, this.w, this.h);
                const on = Math.max(0, Math.min(1, (dark - 0.2) / 0.3));
                if (on > 0) {
                    const head = bulbSprite(ctx, '255,243,214', 0.9, 1.3, '255,236,200', 0.3, 9, true), tail = bulbSprite(ctx, '255,70,50', 0.9, 1, '255,42,0', 0.4, 5, true);
                    for (const car of this.cars) {
                        const p = this._carAt(car, t);
                        if (p.a <= 0.02) continue;
                        const st = this._carStamp(car.v, p.rot), hl = st.L * 0.5 * s, d = [[1, 0], [-1, 0], [0, 1], [0, -1]][p.rot];
                        const cx = this.x + p.x * s, cy = this.y + p.y * s;
                        if (cx + hl + 12 < vl || cx - hl - 12 > vr) continue;
                        drawBulb(ctx, head, cx + d[0] * hl, cy + d[1] * hl, on * p.a);
                        drawBulb(ctx, tail, cx - d[0] * hl, cy - d[1] * hl, on * p.a);
                    }
                }
                // Signals on a shared 11 s cycle, and the red aviation beacons on the tallest roofs
                const cols = [bulbSprite(ctx, '0,255,110', 1, 1, '0,255,110', 0.3, 4, true), bulbSprite(ctx, '255,170,0', 1, 1, '255,170,0', 0.3, 4, true), bulbSprite(ctx, '255,42,42', 1, 1, '255,42,42', 0.3, 4, true)];
                for (const g of this.signals) {
                    const ph = ((t + g.phase) % 11) / 11, b = cols[ph < 0.46 ? 0 : ph < 0.54 ? 1 : 2];
                    for (const x of [g.x0, g.x1]) { const wx = this.x + x * s; if (wx >= vl - 4 && wx <= vr + 4) drawBulb(ctx, b, wx, this.y + g.y * s, 0.95); }
                }
                if (!this._beacons) this._beacons = this._findBeacons();
                const red = bulbSprite(ctx, '255,48,64', 1, 1.2, '255,48,64', 0.35, 6, true);
                for (const bc of this._beacons) {
                    const blink = Math.sin(t * 1.6 + bc.phase);
                    if (blink < 0.55) continue;
                    const wx = this.x + bc.x * s;
                    if (wx >= vl - 6 && wx <= vr + 6) drawBulb(ctx, red, wx, this.y + bc.y * s, (blink - 0.55) / 0.45);
                }
                ctx.restore(); ctx.globalCompositeOperation = op; ctx.globalAlpha = a0;
            }
            /** The roofs of the tallest buildings, where they lean to from the viewer */
            _findBeacons() {
                const out = [], cam = { x: this.VW / 2, y: this.VH + 120 };
                this._asViewer(() => {
                    for (const b of this.buildings) {
                        if (Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) < 8) continue;
                        const k = 1 + b._leanScale(), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                        out.push({ x: cam.x + (cx - cam.x) * k, y: cam.y + (cy - cam.y) * k, phase: b.x * 0.01 });
                    }
                });
                return out;
            }

            /** Turn each car's stamp and each person's ahead of time (a warmup job), so the first frame that shows the street turns none */
            warm() {
                for (const c of this.cars) this._carStamp(c.v, c.axis === 'h' ? (c.dir > 0 ? 0 : 1) : (c.dir > 0 ? 2 : 3));
                for (const p of this.peds) this._pedStamp(p.tint);
            }

            /** Its canvases, for the memory line (bytes) */
            bytes() { return [this.base, this.glow].reduce((n, cv) => n + (cv ? cv.width * cv.height * 4 : 0), 0); }
        }
