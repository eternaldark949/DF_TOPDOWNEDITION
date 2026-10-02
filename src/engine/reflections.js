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

        engineMixin({
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
                if (!q || wet < 0.02 || !this.view) return;
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
                const net = this.activeMap.id === 'hub_949' && this.traffic && this.traffic.network;
                if (net) {
                    mc.fillStyle = `rgba(255,255,255,${(REFLECT.ROAD * Math.min(1, wet * 1.3)).toFixed(3)})`;
                    for (const road of net.roads) {
                        if (road.x > v.x + hw || road.x + road.w < v.x - hw || road.y > v.y + hh || road.y + road.h < v.y - hh) continue;
                        const c = road.getCorners();
                        mc.beginPath(); mc.moveTo(c[0].x, c[0].y); for (let i = 1; i < 4; i++) mc.lineTo(c[i].x, c[i].y); mc.closePath(); mc.fill();
                    }
                }
                mc.fillStyle = `rgba(255,255,255,${(REFLECT.PAVE * Math.min(1, wet * 1.3)).toFixed(3)})`;
                for (const p of this.activeMap.pavements || []) {
                    if (p.x > v.x + hw || p.x + p.w < v.x - hw || p.y > v.y + hh || p.y + p.h < v.y - hh) continue;
                    mc.fillRect(p.x, p.y, p.w, p.h);
                }
                let any = !!net || !!(this.activeMap.pavements && this.activeMap.pavements.length);
                for (const p of this.puddlesFor(this.activeMap)) {
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
                const rs = this.roomSystem;
                if (night > 0.01) {
                    const LH = REFLECT.LAMP_H;
                    for (const l of this.lamps || []) {
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
                const cars = this.traffic && this.traffic.vehicles ? (this.isDriving && this.car ? [this.car, ...this.traffic.vehicles] : this.traffic.vehicles) : [];
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
                for (const fl of this.muzzleFlashes || []) glow(fl.x, fl.y + 16, fl.color && /^#[0-9a-f]{6}$/i.test(fl.color) ? fl.color : '#fff1d0', 40, 60, 0.8);
                for (const pj of this.projectiles || []) if (pj.active !== false) glow(pj.x, pj.y + 12, /^#[0-9a-f]{6}$/i.test(pj.color || '') ? pj.color : '#ffffff', 12, 26, 0.6);
                rc.globalAlpha = 1;

                // 3. Only where the ground is wet enough to mirror
                rc.setTransform(1, 0, 0, 1, 0, 0);
                rc.globalCompositeOperation = 'destination-in';
                rc.drawImage(M, 0, 0);
                rc.globalCompositeOperation = 'source-over';
                this._refl = { R, q, wet };
            },

            /** The puddles themselves on the ground (darker, glossy, a faint rim), in the world pass */
            drawPuddles(ctx) {
                const wet = this._wetHere();
                if (wet < 0.02 || !this.reflectQuality()) return;
                const v = this.view, z = v.zoom, hw = this.canvas.width / 2 / z + 80, hh = this.canvas.height / 2 / z + 80;
                ctx.save();
                for (const p of this.puddlesFor(this.activeMap)) {
                    if (p.x < v.x - hw - p.r || p.x > v.x + hw + p.r || p.y < v.y - hh - p.r || p.y > v.y + hh + p.r) continue;
                    const k = this._puddleK(p, wet); if (k <= 0) continue;
                    const g = 0.65 + 0.35 * k;
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
                    ctx.fillStyle = `rgba(6, 4, 18, ${(0.55 * k).toFixed(3)})`;
                    ctx.beginPath();
                    for (const L of p.lobes) { ctx.moveTo(L.dx + L.rx * g, L.dy); ctx.ellipse(L.dx, L.dy, L.rx * g, L.ry * g, 0, 0, Math.PI * 2); }
                    ctx.fill();
                    ctx.strokeStyle = `rgba(214, 196, 255, ${(0.12 * k).toFixed(3)})`; ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
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
