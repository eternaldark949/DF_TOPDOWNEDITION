        // GameEngine — Reflections. Methods are added to GameEngine.prototype
        // (see engineMixin in game-engine.js).
        //
        // From straight above, what a wet street mirrors is the things that stand up from it:
        // a lamp's head, a car's lights, a muzzle flash. Each frame those are redrawn, mirrored
        // down the screen below where they stand, into a small reflection layer (half size on
        // High, quarter on Medium). A mask says where the ground can show it: the city's
        // puddles (fixed spots on its roads and pavements that fill as the rain soaks in and
        // shrink as it dries) and, fainter, the wet asphalt. The masked layer goes down on the
        // ground before anyone is drawn, so people and cars walk over it, broken into
        // shimmering bands; and it lifts the night's darkness where it shines, so the dark
        // doesn't swallow it.
        //
        // Settings → Reflections: High / Medium / Off. Cinematic View has its own toggle
        // (GameSettings.photoReflections, on by default) so photos can always have them.

        const REFLECT = {
            ROAD: 0.45,             // how strongly wet asphalt reflects (puddles: 1)
            PAVE: 0.28,             // and wet paving
            LAMP_H: 64,             // a street lamp's head, px above the ground
            SPACING: 210,           // puddle spacing along a road
            BANDS: 30               // shimmer bands in the composite (High)
        };

        // Floors that mirror, per map (stage 3): rects [x, y, w, h, strength], cut-outs (rugs and
        // runners don't shine), water [x, y, r] (always mirrors, ripples), mirror = colour reflections of
        // what stands on it; glowShift: how far down the room's hanging lights (its INTERIOR_ART glow:
        // chandeliers, candles, portals, beams) appear in the floor
        const REFLECT_SURFACES = {
            hotel_lobby: { rects: [[50, 50, 900, 1100, 0.55]], cuts: [[440, 612, 120, 538]], water: [[500, 320, 82]], glowShift: 64 },
            house_of_death: { rects: [[574, 1014, 652, 486, 0.42], [574, 444, 652, 556, 0.58], [1574, 14, 212, 416, 0.38]],
                              cutCircles: [[900, 720, 152]], cuts: [[840, 1014, 120, 486]], waterProps: 'hod_fountain', glowShift: 58 },
            moon_city_nightclub: { rects: [[590, 310, 420, 380, 0.55]], glowShift: 40 },
            ethereal_plane: { rects: [[100, 100, 1000, 1000, 0.85]], mirror: true, glowShift: 70 },
            demoness_palace: { rects: [[600, 380, 600, 606, 0.6], [600, 1000, 600, 386, 0.5], [900, 14, 486, 352, 0.4]],
                               cuts: [[860, 760, 80, 226], [860, 1000, 80, 386]], water: [[900, 695, 70], [450, 190, 34]], glowShift: 60 }
        };

        engineMixin({
            /** This map's mirroring floors, resolved (fountain props found once) */
            _surfaces() {
                const map = this.activeMap, S = REFLECT_SURFACES[map.id];
                if (!S) return null;
                if (map._reflSurf && map._reflSurf.props === this.props) return map._reflSurf;
                const water = (S.water || []).slice();
                if (S.waterProps) for (const p of this.props || []) if (p.decorType === S.waterProps) water.push([p.x + p.width / 2, p.y + p.height / 2, Math.min(p.width, p.height) * 0.42]);
                return (map._reflSurf = { ...S, water, props: this.props });
            },

            /**
             * The Ethereal Plane's light (after the darkness): the pillars' crowns burn violet, each
             * spirit wears a pale aura, motes drift up from the floor. Its mirror floor gives it all back.
             */
            drawEtherealGlow(ctx) {
                const t = _frameTime / 1000;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of this.props || []) {
                    const cx = p.x + p.width / 2, top = p.y + 8, f = 0.8 + 0.2 * Math.sin(t * 1.6 + cx);
                    glowA(ctx, cx, top, 46, '190, 120, 255', 0.55 * f);
                    glowA(ctx, cx, top, 14, '245, 225, 255', 0.8 * f);
                }
                for (const n of this.npcs || []) {
                    if (n.role !== 'spirit') continue;
                    const f = 0.75 + 0.25 * Math.sin(t * 2.3 + n.x * 0.01);
                    glowA(ctx, n.x, n.y, 40, '170, 210, 255', 0.45 * f);
                    glowA(ctx, n.x, n.y - 4, 12, '235, 245, 255', 0.6 * f);
                }
                for (let i = 0; i < 40; i++) {
                    const x = 130 + ((i * 263) % 940) + Math.sin(t * 0.4 + i) * 18, y = 1080 - ((t * (8 + i % 6) + i * 131) % 960);
                    const a = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.9);
                    ctx.globalAlpha = 0.55 * a; ctx.fillStyle = i % 3 ? '#d8b8ff' : '#bfe4ff';
                    ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            },

            /** Which quality reflections run at right now: 'high' | 'medium' | null */
            reflectQuality() {
                if (this.cineCam) return GameSettings.photoReflections === false ? null : 'high';
                const q = GameSettings.reflections || 'high';
                return q === 'off' ? null : q;
            },

            /**
             * The city's puddles: fixed spots, seeded from the map, on roads (more toward the
             * kerbs) and pavements. Each is two or three soft lobes; `d` is how deep it is, so
             * the deep ones appear first in a drizzle and stay longest as the street dries.
             */
            puddlesFor(map) {
                if (map._puddles) return map._puddles;
                const P = [], rnd = seededRandom(String(map.id).split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 949));
                const add = (x, y, ang, size) => {
                    const lobes = [], n = 2 + (rnd() < 0.5 ? 1 : 0);
                    for (let i = 0; i < n; i++) lobes.push({ dx: (rnd() - 0.5) * size * 1.1, dy: (rnd() - 0.5) * size * 0.4,
                        rx: size * (0.45 + rnd() * 0.45), ry: size * (0.22 + rnd() * 0.22) });
                    const r = size * 1.3;
                    P.push({ x, y, ang, lobes, d: 0.25 + rnd() * 0.75, r });
                };
                const net = this.traffic && this.traffic.network;
                if (net && map.id === 'hub_949') {
                    for (const road of net.roads) {
                        if (!road.length) continue;
                        const ang = Math.atan2(road.y2 - road.y1, road.x2 - road.x1), half = road.thickness / 2;
                        for (let t = 50 + rnd() * 120; t < road.length - 50; t += REFLECT.SPACING * (0.6 + rnd() * 0.9)) {
                            if (rnd() < 0.35) continue;
                            const side = rnd() < 0.5 ? -1 : 1, lat = side * half * (rnd() < 0.65 ? 0.55 + rnd() * 0.3 : rnd() * 0.5);
                            const fx = road.x1 + (road.x2 - road.x1) * (t / road.length), fy = road.y1 + (road.y2 - road.y1) * (t / road.length);
                            add(fx + road.nx * lat, fy + road.ny * lat, ang, 22 + rnd() * 34);
                        }
                    }
                }
                // Water gathers under the street lamps (most of them): the puddle that catches the lamp
                for (const l of map.lamps || []) {
                    if (rnd() < 0.3) continue;
                    add(l.x + (rnd() - 0.5) * 30, l.y + REFLECT.LAMP_H * (0.7 + rnd() * 0.6), (rnd() - 0.5) * 0.6, 26 + rnd() * 26);
                }
                for (const p of map.pavements || []) {
                    const n = Math.floor(p.w * p.h / 90000 + rnd() * 1.2);
                    for (let i = 0; i < n; i++) add(p.x + 20 + rnd() * Math.max(1, p.w - 40), p.y + 20 + rnd() * Math.max(1, p.h - 40), p.w > p.h ? 0 : Math.PI / 2, 14 + rnd() * 18);
                }
                map._puddles = P;
                return P;
            },

            /** Is (x, y) in a puddle that's showing? Its strength (0 = dry ground) */
            _inPuddle(x, y) {
                const wet = this._wetHere(); if (wet < 0.05) return 0;
                for (const entry of this._queryPuddleCandidates({ left: x, right: x, top: y, bottom: y }, 'puddlePoint')) {
                    const p = entry.item;
                    if (Math.abs(p.x - x) > p.r + 4 || Math.abs(p.y - y) > p.r + 4) continue;
                    const k = this._puddleK(p, wet); if (k <= 0) continue;
                    const g = 0.65 + 0.35 * k, c = Math.cos(-p.ang), sn = Math.sin(-p.ang), dx = x - p.x, dy = y - p.y;
                    const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
                    if (p.lobes.some(L => ((lx - L.dx) / (L.rx * g)) ** 2 + ((ly - L.dy) / (L.ry * g)) ** 2 <= 1)) return k;
                }
                return 0;
            },

            /** How much of a puddle shows at this wetness (0..1) */
            _puddleK(p, wet) { return Math.max(0, Math.min(1, (wet - (1 - p.d) * 0.75) / 0.25)); },

            _wetHere() {
                const W = this.weather, rs = this.roomSystem;
                const out = this.activeMap.type === 'outdoor' ? 1 : (rs && rs.active ? rs.outdoorness : 0);
                return (W ? (W.wetness || 0) : 0) * out;
            },

            /**
             * Build this frame's reflection layer (screen space): the mirrored lights, masked
             * to the puddles and wet asphalt. Leaves this._refl ready (or null).
             */
            prepareReflections() {
                this._refl = null;
                const q = this.reflectQuality(), wet = this._wetHere();
                const surf = this._surfaces();
                if (!q || !this.view || (wet < 0.02 && !surf)) return;
                const W = this.canvas.width, H = this.canvas.height, s = q === 'high' ? 0.5 : 0.25;
                const rw = Math.max(1, Math.round(W * s)), rh = Math.max(1, Math.round(H * s));
                let R = this._reflCv, M = this._reflMask;
                if (!R) { R = this._reflCv = document.createElement('canvas'); M = this._reflMask = document.createElement('canvas'); }
                if (R.width !== rw || R.height !== rh) { R.width = M.width = rw; R.height = M.height = rh; }
                const rc = R.getContext('2d'), mc = M.getContext('2d');
                const v = this.view, z = v.zoom;
                const toView = (c) => { c.setTransform(s, 0, 0, s, 0, 0); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-v.x + (v.shakeX || 0), -v.y + (v.shakeY || 0)); };
                const hw = W / 2 / z + 140, hh = H / 2 / z + 140;
                const near = (x, y, m = 0) => x > v.x - hw - m && x < v.x + hw + m && y > v.y - hh - m - 160 && y < v.y + hh + m;

                // 1. The mask: wet asphalt, then the puddles at full strength
                mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, rw, rh); toView(mc);
                const net = wet >= 0.02 && this.activeMap.id === 'hub_949' && this.traffic && this.traffic.network;
                if (net) {
                    mc.fillStyle = `rgba(255,255,255,${(REFLECT.ROAD * Math.min(1, wet * 1.3)).toFixed(3)})`;
                    for (const road of net.roads) {
                        if (road.x > v.x + hw || road.x + road.w < v.x - hw || road.y > v.y + hh || road.y + road.h < v.y - hh) continue;
                        const c = road.getCorners();
                        mc.beginPath(); mc.moveTo(c[0].x, c[0].y); for (let i = 1; i < 4; i++) mc.lineTo(c[i].x, c[i].y); mc.closePath(); mc.fill();
                    }
                }
                mc.fillStyle = `rgba(255,255,255,${(REFLECT.PAVE * Math.min(1, wet * 1.3)).toFixed(3)})`;
                if (wet >= 0.02) for (const p of this.activeMap.pavements || []) {
                    if (p.x > v.x + hw || p.x + p.w < v.x - hw || p.y > v.y + hh || p.y + p.h < v.y - hh) continue;
                    mc.fillRect(p.x, p.y, p.w, p.h);
                }
                let any = !!net || !!(wet >= 0.02 && this.activeMap.pavements && this.activeMap.pavements.length);
                if (surf) {                                                    // polished floors and water
                    any = true;
                    for (const [x, y, w, h, k] of surf.rects) { mc.fillStyle = `rgba(255,255,255,${k})`; mc.fillRect(x, y, w, h); }
                    mc.globalCompositeOperation = 'destination-out'; mc.fillStyle = '#fff';
                    for (const [x, y, w, h] of surf.cuts || []) mc.fillRect(x, y, w, h);
                    for (const [x, y, r] of surf.cutCircles || []) { mc.beginPath(); mc.arc(x, y, r, 0, Math.PI * 2); mc.fill(); }
                    mc.globalCompositeOperation = 'source-over'; mc.fillStyle = 'rgba(255,255,255,0.95)';
                    for (const [x, y, r] of surf.water) { mc.beginPath(); mc.arc(x, y, r, 0, Math.PI * 2); mc.fill(); }
                }
                for (const entry of wet >= 0.02 ? this._queryPuddleCandidates({ left: v.x - hw, right: v.x + hw,
                    top: v.y - hh - 160, bottom: v.y + hh }, 'puddleMask') : []) {
                    const p = entry.item;
                    if (!near(p.x, p.y, p.r)) continue;
                    const k = this._puddleK(p, wet); if (k <= 0) continue;
                    any = true;
                    const g = 0.65 + 0.35 * k;
                    mc.save(); mc.translate(p.x, p.y); mc.rotate(p.ang);
                    for (const L of p.lobes) {
                        mc.globalAlpha = k * 0.45; mc.fillStyle = '#fff';                      // a soft rim, then the body
                        mc.beginPath(); mc.ellipse(L.dx, L.dy, L.rx * g * 1.15, L.ry * g * 1.2, 0, 0, Math.PI * 2); mc.fill();
                        mc.globalAlpha = k;
                        mc.beginPath(); mc.ellipse(L.dx, L.dy, L.rx * g, L.ry * g, 0, 0, Math.PI * 2); mc.fill();
                    }
                    mc.restore();
                }
                mc.globalAlpha = 1;
                if (!any) return;

                // 2. The mirrored lights: each falls down the screen below where it stands
                rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, rw, rh); toView(rc);
                rc.globalCompositeOperation = 'lighter';
                const night = Math.min(1, Math.max(0, (this.getAmbientDarkness() - 0.15) / 0.35));
                const glow = (x, y, col, w, h, a) => {
                    if (a < 0.01 || !near(x, y, h)) return;
                    rc.globalAlpha = Math.min(1, a);
                    rc.drawImage(puffSprite(col), x - w / 2, y - h / 2, w, h);
                };
                // Lit windows, neon and signs: each building's facade mirrored about the line where it
                // meets the street (foreshortened), billboards about their front edge
                const dark = this.getAmbientDarkness();
                if (night > 0.01 && q === 'high' && CONFIG.BUILDINGS.LEAN) {
                    const reflectedBuildings = this._queryRenderBuildings({ left: v.x - hw, right: v.x + hw,
                        top: v.y - hh - 40, bottom: v.y + hh + 260 }, this._effectCandidateBuffer('reflectedBuildings'));
                    for (const entry of reflectedBuildings) {
                        const b = entry.item;
                        if (!b.isV2 || !b.drawEmissive) continue;
                        const gy = b.y + b.h;
                        if (gy < v.y - hh - 40 || gy > v.y + hh + 260 || b.x > v.x + hw || b.x + b.w < v.x - hw) continue;
                        rc.save(); rc.globalCompositeOperation = 'lighter';
                        rc.translate(0, gy); rc.scale(1, -0.75); rc.translate(0, -gy);
                        try { b.drawEmissive(rc, dark); } catch (e) { /* a facade that can't mirror is left out */ }
                        rc.restore();
                    }
                    for (const bb of this.activeMap.billboards || []) {
                        const gy = bb.y;
                        if (gy < v.y - hh - 40 || gy > v.y + hh + 200 || bb.x > v.x + hw + 100 || bb.x < v.x - hw - 100) continue;
                        rc.save(); rc.translate(0, gy); rc.scale(1, -0.75); rc.translate(0, -gy);
                        try { bb.drawEmissive(rc, dark); } catch (e) { /* ditto */ }
                        rc.restore();
                    }
                    // a facade mirrors softer than a lamp: wet stone, not glass
                    rc.globalCompositeOperation = 'destination-out'; rc.globalAlpha = 0.55;
                    rc.setTransform(1, 0, 0, 1, 0, 0); rc.fillRect(0, 0, rw, rh); toView(rc);
                    rc.globalAlpha = 1; rc.globalCompositeOperation = 'lighter';
                }
                const rs = this.roomSystem;
                if (night > 0.01) {
                    const LH = REFLECT.LAMP_H;
                    for (const entry of this._queryLampCandidates({ left: v.x - hw - LH * 2, right: v.x + hw + LH * 2,
                        top: v.y - hh - LH * 2 - 160, bottom: v.y + hh + LH * 2 }, 'lampReflections')) {
                        const l = entry.item;
                        if (!near(l.x, l.y, LH * 2)) continue;
                        const k = (rs && rs.active ? rs.lampLight(l) : 1) * lampFlicker(l) * night;
                        if (k < 0.02) continue;
                        const col = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#ffeebb';
                        glow(l.x, l.y + LH * 1.05, col, 54, 70, 1.0 * k);                // the head, upside down below the lamp
                        glow(l.x, l.y + LH * 1.05, '#ffffff', 16, 22, 0.8 * k);           // its hot core
                        glow(l.x, l.y + LH * 0.95, col, 24, LH * 2.6, 0.7 * k);           // the long smear down the wet street
                        rc.globalAlpha = 0.18 * k; rc.strokeStyle = col; rc.lineWidth = 2;   // the pole, faint
                        rc.beginPath(); rc.moveTo(l.x, l.y + 4); rc.lineTo(l.x, l.y + LH * 0.9); rc.stroke();
                    }
                }
                const cars = this._reflCars(this._reflLightCars || (this._reflLightCars = []));
                if (night > 0.01) for (const c of cars) {
                    if (!c || c.dead || c.visible === false || !near(c.x, c.y, 60)) continue;
                    const ca = Math.cos(c.angle), sa = Math.sin(c.angle), h = (c.length || 40) / 2, wd = (c.width || 20) / 3, f = (c.fade ?? 1) * night;
                    const hc = /^#[0-9a-f]{6}$/i.test(c.headlightColor || '') ? c.headlightColor : '#fff2d6';
                    for (const sgn of [-1, 1]) {
                        const px = -sa * wd * sgn, py = ca * wd * sgn;
                        glow(c.x + ca * h + px, c.y + sa * h + py + 14, hc, 12, 44, 0.9 * f);
                        glow(c.x - ca * h + px, c.y - sa * h + py + 12, '#ff3048', 10, 34, 0.75 * f);
                    }
                }
                // The room's hanging lights in its floor: its whole glow pass, a little lower down
                const art = surf && typeof INTERIOR_ART !== 'undefined' && INTERIOR_ART[this.activeMap.id];
                if (art && art.glow) {
                    // (twice: a polished floor gives back the light at about its full strength)
                    for (let pass = 0; pass < 2; pass++) {
                        rc.save(); rc.translate(0, surf.glowShift || 0);
                        try { art.glow(this, rc); } catch (e) { /* a glow that can't mirror is left out */ }
                        rc.restore();
                    }
                    rc.globalCompositeOperation = 'lighter';
                }
                for (const fl of this.muzzleFlashes || []) glow(fl.x, fl.y + 16, fl.color && /^#[0-9a-f]{6}$/i.test(fl.color) ? fl.color : '#fff1d0', 40, 60, 0.8);
                for (const pj of this.projectiles || []) if (pj.active !== false) glow(pj.x, pj.y + 12, /^#[0-9a-f]{6}$/i.test(pj.color || '') ? pj.color : '#ffffff', 12, 26, 0.6);
                // Whoever stands between a light and its reflection blocks it: their mirrored shape
                rc.globalCompositeOperation = 'destination-out';
                const movers = this._reflMovers(near, this._reflPrepareMovers || (this._reflPrepareMovers = { list: [], records: [], cars: [] }), cars);
                for (const m of movers) this._reflShape(rc, m, 0.85);
                rc.globalCompositeOperation = 'source-over';
                // A mirror floor gives back colour too: whoever stands on it, and the things set on it
                if (surf && surf.mirror) {
                    for (const m of movers) { rc.fillStyle = m.col && /^#[0-9a-f]{6}$/i.test(m.col) ? m.col : '#b48cff'; this._reflShape(rc, m, 0.5); }
                    for (const pr of this.props || []) {
                        if (!near(pr.x, pr.y, 200)) continue;
                        rc.globalAlpha = 0.42; rc.fillStyle = pr.color || '#6a3aa0';
                        rc.fillRect(pr.x, pr.y + pr.height, pr.width, pr.height * 0.75);
                    }
                }
                rc.globalAlpha = 1;

                // 3. Only where the ground is wet enough to mirror
                rc.setTransform(1, 0, 0, 1, 0, 0);
                rc.globalCompositeOperation = 'destination-in';
                rc.drawImage(M, 0, 0);
                rc.globalCompositeOperation = 'source-over';
                this._refl = { R, q, wet };
            },

            /** Reflection car order: the driven car first, then traffic, including any duplicate. */
            _reflCars(out) {
                const vehicles = this.traffic && this.traffic.vehicles;
                if (!vehicles || !this.isDriving || !this.car) {
                    if (out) out.length = 0;
                    return vehicles || out || [];
                }
                const cars = out || [];
                cars.length = 0; cars.push(this.car);
                for (const c of vehicles) cars.push(c);
                return cars;
            },

            /**
             * Everyone near the view, in the original actor order. Default calls own fresh results.
             * A caller-owned buffer reuses records until its next fill; every fill refreshes all fields.
             * Separate prepare, ground, and update buffers keep their distinct visibility bounds apart.
             */
            _reflMovers(near, buffer, cars) {
                const out = buffer ? buffer.list : [], pool = buffer && buffer.records;
                const previous = out.length;
                let count = 0;
                const add = (e, kind, col) => {
                    const m = pool ? (pool[count] || (pool[count] = {})) : {};
                    m.e = e; m.x = e.x; m.y = e.y; m.kind = kind; m.col = col;
                    out[count++] = m;
                };
                const walker = (e, col) => { if (e && !e.dead && e.visible !== false && !e.inCar && near(e.x, e.y, 40)) add(e, 'walker', col); };
                const lookCol = (e) => { const L = e.look || e.appearance; return (L && L.top && L.top.color) || null; };
                if (!this.isDriving) walker(this.player, '#c9a6ff');
                for (const t of this.teammates || []) if (t.recruited) walker(t, lookCol(t));
                for (const n of this.npcs || []) walker(n, lookCol(n));
                for (const e of this.enemies || []) walker(e, lookCol(e));
                for (const p of (this.pedestrians && this.pedestrians.pedestrians) || []) walker(p, lookCol(p));
                if (!cars) cars = this._reflCars(buffer && buffer.cars);
                for (const c of cars) if (c && !c.dead && c.visible !== false && near(c.x, c.y, 60)) add(c, 'car', c.bodyColor || c.color || null);
                // Retired pool slots must not retain actors from an old view or map.
                if (pool) for (let i = count; i < previous; i++) { pool[i].e = null; pool[i].col = null; }
                out.length = count;
                return out;
            },

            /** A mirrored shape below where it stands: a figure (body, then head) or a car's flank */
            _reflShape(c, m, a) {
                c.globalAlpha = a;
                if (m.kind === 'walker') {
                    c.beginPath(); c.ellipse(m.x, m.y + 17, 5.5, 14, 0, 0, Math.PI * 2); c.fill();
                    c.beginPath(); c.arc(m.x, m.y + 33, 5.5, 0, Math.PI * 2); c.fill();
                } else {
                    const e = m.e, L = e.length || 40, Wd = e.width || 20;
                    c.save(); c.translate(m.x, m.y + Wd * 0.55); c.rotate(e.angle || 0);
                    c.beginPath(); c.rect(-L / 2, -Wd / 2, L, Wd); c.fill(); c.restore();
                }
            },

            /**
             * The puddles on the ground, in the world pass: dark and glossy at night, holding a
             * pale sky by day; the mirrored shapes of whoever stands at them; the rings of
             * raindrops and splashes; a faint rim.
             */
            drawPuddles(ctx) {
                const wet = this._wetHere(), surf = this._surfaces();
                if ((wet < 0.02 && !surf) || !this.reflectQuality()) return;
                const v = this.view, z = v.zoom, hw = this.canvas.width / 2 / z + 80, hh = this.canvas.height / 2 / z + 80;
                const near = (x, y, m = 0) => x > v.x - hw - m && x < v.x + hw + m && y > v.y - hh - m - 60 && y < v.y + hh + m;
                const buffer = this._reflGroundMovers || (this._reflGroundMovers = { list: [], records: [], cars: [] });
                let movers = null;
                if (surf) {
                    // people mirrored in polished floors (softer than in a puddle) and rings on the water
                    const fl = new Path2D();
                    for (const [x, y, w, h] of surf.rects) fl.rect(x, y, w, h);
                    for (const [x, y, r] of surf.water) { fl.moveTo(x + r, y); fl.arc(x, y, r, 0, Math.PI * 2); }
                    ctx.save(); ctx.clip(fl);
                    if (!surf.mirror) {
                        movers = this._reflMovers(near, buffer);
                        ctx.fillStyle = 'rgba(2, 1, 6, 1)'; for (const m of movers) this._reflShape(ctx, m, 0.26);
                    }
                    ctx.restore(); ctx.globalAlpha = 1;
                    if (wet < 0.02) { this._drawRipples(ctx, true); return; }
                }
                const night = Math.min(1, Math.max(0, (this.getAmbientDarkness() - 0.15) / 0.35)), day = 1 - night;
                const clip = new Path2D(), rim = new Path2D();
                let n = 0;
                ctx.save();
                for (const entry of this._queryPuddleCandidates({ left: v.x - hw, right: v.x + hw,
                    top: v.y - hh, bottom: v.y + hh }, 'puddleGround')) {
                    const p = entry.item;
                    if (p.x < v.x - hw - p.r || p.x > v.x + hw + p.r || p.y < v.y - hh - p.r || p.y > v.y + hh + p.r) continue;
                    const k = this._puddleK(p, wet); if (k <= 0) continue;
                    const g = 0.65 + 0.35 * k, c = Math.cos(p.ang), sn = Math.sin(p.ang);
                    const path = new Path2D();
                    for (const L of p.lobes) {
                        const lx = p.x + L.dx * c - L.dy * sn, ly = p.y + L.dx * sn + L.dy * c;
                        path.moveTo(lx + Math.cos(p.ang) * L.rx * g, ly + Math.sin(p.ang) * L.rx * g);
                        path.ellipse(lx, ly, L.rx * g, L.ry * g, p.ang, 0, Math.PI * 2);
                    }
                    // night: a dark glossy pool; day: the pale sky in it
                    ctx.fillStyle = `rgba(6, 4, 18, ${(0.55 * k * night).toFixed(3)})`; ctx.fill(path);
                    if (day > 0.01) { ctx.fillStyle = `rgba(178, 190, 226, ${(0.3 * k * day).toFixed(3)})`; ctx.fill(path); }
                    clip.addPath(path); rim.addPath(path); n++;
                }
                if (n) {
                    // the mirrored shapes of whoever stands at the water, and the rings on it
                    ctx.save(); ctx.clip(clip);
                    if (!movers) movers = this._reflMovers(near, buffer);
                    ctx.fillStyle = night > 0.5 ? 'rgba(2, 1, 6, 1)' : 'rgba(26, 22, 36, 1)';
                    for (const m of movers) this._reflShape(ctx, m, 0.42 + 0.2 * day);
                    for (const m of movers) if (m.col && /^#[0-9a-f]{6}$/i.test(m.col)) { ctx.fillStyle = m.col; this._reflShape(ctx, m, 0.12); }
                    this._drawRipples(ctx, night > 0.5);
                    ctx.restore();
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = `rgba(214, 196, 255, ${(0.12 * Math.min(1, wet * 1.5)).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke(rim);
                }
                ctx.restore();
            },

            /** The rings on the water: raindrops, splashes, the fountain */
            _drawRipples(ctx, night) {
                const R = this._ripples; if (!R || !R.length) return;
                ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = night ? '#d8c6ff' : '#ffffff';
                for (const r of R) {
                    const f = r.t / r.life;
                    ctx.globalAlpha = (1 - f) * (r.big ? 0.55 : 0.4);
                    ctx.beginPath(); ctx.ellipse(r.x, r.y, 1 + f * r.r, (1 + f * r.r) * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
                    if (r.big && f < 0.6) { ctx.beginPath(); ctx.ellipse(r.x, r.y, 1 + f * r.r * 0.55, (1 + f * r.r * 0.55) * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); }
                }
                ctx.restore();
            },

            /**
             * Once per tick: raindrops ring the puddles in view (more in heavier rain), and
             * anyone walking or driving through one splashes it (rings and spray).
             */
            updatePuddles() {
                const R = this._ripples || (this._ripples = []);
                for (let i = R.length - 1; i >= 0; i--) if (++R[i].t >= R[i].life) R.splice(i, 1);
                const wet = this._wetHere(), surf = this._surfaces();
                if (!this.reflectQuality() || !this.view) return;
                // the fountains and pools stir by themselves
                if (surf) for (const [x, y, r] of surf.water) if (Math.random() < 0.12 && R.length < 70) {
                    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.8;
                    R.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, t: 0, life: 40, r: 7 + Math.random() * 6 });
                }
                if (wet < 0.05) return;
                const v = this.view, z = v.zoom, hw = this.canvas.width / 2 / z + 40, hh = this.canvas.height / 2 / z + 40;
                const visible = this._reflVisiblePuddles || (this._reflVisiblePuddles = { list: [], records: [] });
                const vis = visible.list, previous = vis.length;
                let count = 0;
                for (const entry of this._queryPuddleCandidates({ left: v.x - hw, right: v.x + hw,
                    top: v.y - hh, bottom: v.y + hh }, 'puddleUpdate')) {
                    const p = entry.item;
                    if (p.x < v.x - hw || p.x > v.x + hw || p.y < v.y - hh || p.y > v.y + hh) continue;
                    const k = this._puddleK(p, wet);
                    if (k > 0.2) {
                        const entry = visible.records[count] || (visible.records[count] = [null, 0]);
                        entry[0] = p; entry[1] = k; vis[count++] = entry;
                    }
                }
                for (let i = count; i < previous; i++) visible.records[i][0] = null;
                vis.length = count;
                if (!vis.length) return;
                const W = this.weather, rain = W && W.isRaining ? W.intensity : 0;
                // raindrops
                let drops = rain * 2.2 + (Math.random() < (rain * 2.2) % 1 ? 1 : 0);
                while (drops-- >= 1 && R.length < 70) {
                    const [p, k] = vis[(Math.random() * vis.length) | 0], L = p.lobes[(Math.random() * p.lobes.length) | 0];
                    const g = 0.65 + 0.35 * k, a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.8;
                    const lx = L.dx + Math.cos(a) * L.rx * g * rr, ly = L.dy + Math.sin(a) * L.ry * g * rr, c = Math.cos(p.ang), sn = Math.sin(p.ang);
                    R.push({ x: p.x + lx * c - ly * sn, y: p.y + lx * sn + ly * c, t: 0, life: 26 + (Math.random() * 12 | 0), r: 5 + Math.random() * 4 });
                }
                // splashes: footsteps every so often, tyres often
                const inside = (p, k, x, y) => {
                    const g = 0.65 + 0.35 * k, c = Math.cos(-p.ang), sn = Math.sin(-p.ang), dx = x - p.x, dy = y - p.y;
                    const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
                    return p.lobes.some(L => ((lx - L.dx) / (L.rx * g)) ** 2 + ((ly - L.dy) / (L.ry * g)) ** 2 <= 1);
                };
                const near = (x, y, m = 0) => x > v.x - hw - m && x < v.x + hw + m && y > v.y - hh - m && y < v.y + hh + m;
                const movers = this._reflMovers(near, this._reflUpdateMovers || (this._reflUpdateMovers = { list: [], records: [], cars: [] }));
                for (const m of movers) {
                    const e = m.e, px = e._splX ?? e.x, py = e._splY ?? e.y, sp = Math.hypot(e.x - px, e.y - py);
                    e._splX = e.x; e._splY = e.y;
                    const every = m.kind === 'car' ? 3 : 15;
                    if (sp < (m.kind === 'car' ? 1.2 : 0.5) || ((e._splT = (e._splT || 0) + 1) % every)) continue;
                    for (const [p, k] of vis) {
                        if (Math.abs(p.x - e.x) > p.r + 10 || Math.abs(p.y - e.y) > p.r + 10 || !inside(p, k, e.x, e.y)) continue;
                        const car = m.kind === 'car';
                        if (R.length < 80) R.push({ x: e.x, y: e.y, t: 0, life: car ? 30 : 34, r: car ? 26 : 15, big: true });
                        if (this.weather && this.weather.spawnSpray) this.weather.spawnSpray(e.x, e.y, Math.atan2(e.y - py, e.x - px) + Math.PI, 'rgba(206, 214, 255, 0.55)', car ? 8 : 4);
                        // tyres hiss through it (her own and others' footsteps splash in engine/footsteps.js)
                        if (car && typeof ambience !== 'undefined' && ambience.splash) {
                            const pl = this.player, d = Math.hypot(e.x - pl.x, e.y - pl.y);
                            ambience.splash(Math.max(0, 1 - d / 600), (e.x - pl.x) / 400, Math.hypot(e.x - px, e.y - py) > 4);
                        }
                        break;
                    }
                }
            },

            /**
             * Lay the reflection layer on the ground (before buildings and people), broken into
             * bands that shimmer sideways, more in the rain. Screen space.
             */
            drawReflections(ctx) {
                const F = this._refl; if (!F) return;
                const W = this.canvas.width, H = this.canvas.height, R = F.R;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.95;
                if (F.q === 'high') {
                    const rain = this.weather && this.weather.isRaining ? this.weather.intensity : 0;
                    const n = REFLECT.BANDS, bh = R.height / n, t = _gameTimeSec, amp = (1.2 + rain * 3.2) * (W / R.width) * 0.5;
                    for (let i = 0; i < n; i++) {
                        const sy = i * bh, dx = Math.sin(t * 2.1 + i * 0.9) * amp + Math.sin(t * 5.3 + i * 2.7) * amp * 0.35 * rain;
                        ctx.drawImage(R, 0, sy, R.width, bh, dx, sy * H / R.height, W, bh * H / R.height + 1);
                    }
                } else ctx.drawImage(R, 0, 0, W, H);
                ctx.restore();
            },

            /** In the light layer: where a reflection shines, the dark lifts (screen space) */
            liftReflections(lc, lw, lh) {
                const F = this._refl; if (!F) return;
                lc.save();
                lc.setTransform(1, 0, 0, 1, 0, 0);
                lc.globalCompositeOperation = 'destination-out';
                lc.globalAlpha = 0.85;
                lc.drawImage(F.R, 0, 0, lw, lh);
                lc.restore();
            }
        });
