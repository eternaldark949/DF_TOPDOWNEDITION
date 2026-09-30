        // GameEngine — Daylight: the sun, the shadows it casts, drifting cloud shadows, and the
        // day's warm grade. Night belongs to the lighting layer (lighting.js); from dawn to
        // dusk this takes over: the city in peach-rose morning, clear warm noon and an
        // amber-magenta golden hour, its shadows long, lavender and swinging with the sun.
        //   sunState()            where the sun is and what colour (from dayCycle)
        //   drawCastShadows(ctx)  after the ground, under everything else (buildings, trees)
        //   drawDaylight(ctx)     after the lighting pass, screen space: the sunlight wash
        // Outdoors only (and the apartment veranda by its outdoorness); interiors are untouched.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        let _sunShadow = { on: false, dx: 0, dy: 0, len: 0, k: 0 };   // read by Foliage.draw (its shadow follows the sun)

        /**
         * The light right now, read once a frame for anything that catches it (car paint, glass):
         * day (0…1 sun reaching here, dimmed by cloud), dx/dy (unit vector toward the sun),
         * rgb (the sun's colour), night (0…1, outdoors).
         */
        let _sunNowAt = -1, _sunNow = null;
        function sunNow() {
            if (_sunNowAt === _frameTime && _sunNow) return _sunNow;
            _sunNowAt = _frameTime;
            let day = 0, dx = 0, dy = 0, rgb = '255, 248, 234';
            try {
                const S = game.sunState(), reach = game._sunReach();
                day = S.k * reach * (1 - 0.6 * S.overcast); rgb = S.colRGB;
                const n = Math.hypot(S.dx, S.dy) || 1; dx = -S.dx / n; dy = -S.dy / n;
            } catch (e) { }
            const outdoor = typeof game !== 'undefined' && game.activeMap && game.activeMap.type === 'outdoor';
            return (_sunNow = { day, dx, dy, rgb, night: outdoor ? 1 - day : 0.5 });
        }

        engineMixin({
            /**
             * The sun now: k (how much it's day, 0…1, fading through dawn and dusk), the direction
             * shadows fall (dx, dy), how long they are per px of height (len), its colour, and
             * golden (0…1 near sunrise and sunset). Cached per world minute.
             */
            sunState() {
                const dc = this.dayCycle();
                if (this._sun && this._sun.key === dc.key) return this._sun;
                const h = dc.hour, wet = this.weather ? Math.min(1, Math.max(0, this.weather.intensity || 0)) : 0;
                const k = Math.max(0, Math.min(1, 1 - dc.darkness / 0.6));
                // Sunrise in the east (06:00) → high in the south at noon → sunset in the west (18:00)
                const u = Math.max(0, Math.min(1, (h - 6) / 12));
                const az = Math.PI + u * Math.PI;                 // direction the shadow falls: west at dawn, north at noon, east at dusk
                const elev = Math.max(0.08, Math.sin(Math.PI * u));
                const len = Math.min(2.2, 0.28 + 1.5 * Math.pow(1 - elev, 1.6));
                const golden = Math.max(0, 1 - Math.min(Math.abs(h - 6.5), Math.abs(h - 17.5)) / 1.6);
                const noon = [255, 248, 234], gold = h < 12 ? [255, 206, 186] : [255, 190, 168];
                const col = noon.map((v, i) => Math.round(v + (gold[i] - v) * golden));
                return (this._sun = {
                    key: dc.key, k, overcast: wet, golden, len, elev,
                    dx: Math.cos(az), dy: Math.sin(az) * 0.7,        // foreshortened north-south (the view looks a little down the street)
                    col, colRGB: col.join(', ')
                });
            },

            /** How much of the sun reaches her here: 1 outdoors, the veranda by its outdoorness, 0 inside. */
            _sunReach() {
                if (this.activeMap.type === 'outdoor') return 1;
                const rs = this.roomSystem;
                return rs && rs.active ? rs.outdoorness : 0;
            },

            /**
             * Cast shadows, one soft layer (no double-darkening where shadows overlap): buildings
             * swept along the sun, tree canopies thrown on the ground. Tinted lavender, multiplied.
             */
            drawCastShadows(ctx, cull) {
                const S = this.sunState(), map = this.activeMap;
                const strength = S.k * (1 - 0.75 * S.overcast) * (map.type === 'outdoor' ? 1 : 0);
                _sunShadow = { on: strength > 0.02, dx: S.dx, dy: S.dy, len: S.len, k: strength };
                if (strength <= 0.02) return;
                const R = 0.5, W = Math.ceil(this.canvas.width * R), H = Math.ceil(this.canvas.height * R);
                const cv = this._shadowCv || (this._shadowCv = document.createElement('canvas'));
                if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
                const c = cv.getContext('2d'), m = ctx.getTransform();
                c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
                c.setTransform(m.a * R, m.b * R, m.c * R, m.d * R, m.e * R, m.f * R);
                c.fillStyle = '#000'; c.beginPath();
                const B = CONFIG.BUILDINGS, dx = S.dx * S.len, dy = S.dy * S.len;
                const hull = (pts) => {                                                        // convex hull (monotone chain)
                    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
                    const lo = [], up = [];
                    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
                    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
                    return lo.slice(0, -1).concat(up.slice(0, -1));
                };
                for (const b of map.buildings || []) {
                    if (!b.isV2 || b.x > cull.right + 300 || b.x + b.w < cull.left - 300 || b.y > cull.bottom + 300 || b.y + b.h < cull.top - 300) continue;
                    const hgt = Math.min(b.floors, B.MAX_FLOORS) * B.FLOOR_HEIGHT, ox = dx * hgt, oy = dy * hgt;
                    for (const s of b.sections) {
                        const x0 = b.x + s.x, y0 = b.y + s.y, x1 = x0 + s.w, y1 = y0 + s.h;
                        const h = hull([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + ox, y0 + oy], [x1 + ox, y0 + oy], [x1 + ox, y1 + oy], [x0 + ox, y1 + oy]]);
                        h.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
                    }
                }
                const cars = new Set(this.traffic ? this.traffic.vehicles : []);                // cars, low and long
                for (const v of [this.car, this.ownedCar, this.deliveryVehicle]) if (v) cars.add(v);
                for (const v of cars) {
                    if (!v.visible || !v.length || v.x < cull.left - 60 || v.x > cull.right + 60 || v.y < cull.top - 60 || v.y > cull.bottom + 60) continue;
                    const ht = v.model === 'truck' || /suv/.test(v.model) ? 17 : 13, ca = Math.cos(v.angle), sa = Math.sin(v.angle);
                    const hl = v.length / 2 - 3, hw = v.width / 2 - 2, pts = [];
                    for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]]) {
                        const x = v.x + a * ca - b * sa, y = v.y + a * sa + b * ca;
                        pts.push([x, y], [x + dx * ht, y + dy * ht]);
                    }
                    hull(pts).forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
                }
                for (const f of map.foliage || []) {                                             // canopies, thrown along the sun
                    if (f.x < cull.left - 120 || f.x > cull.right + 120 || f.y < cull.top - 120 || f.y > cull.bottom + 120) continue;
                    const s = f.size || 1, ht = (f.type === 'bush' ? 8 : 34) * s, r = (f.type === 'bush' ? 12 : f.type === 'palm' ? 17 : 19) * s;
                    const cx = f.x + dx * ht, cy = f.y + dy * ht - (f.type === 'bush' ? 0 : 8 * s);
                    c.moveTo(cx + r * (1 + S.len * 0.25), cy); c.ellipse(cx, cy, r * (1 + S.len * 0.25), r * 0.8, Math.atan2(dy, dx), 0, Math.PI * 2);
                }
                c.fill();
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = 0.62 * strength;
                // Lavender-tinted shade: multiply by a violet-grey rather than black
                const tint = this._shadowTint || (this._shadowTint = (() => { const t = document.createElement('canvas'); return t; })());
                if (tint.width !== W || tint.height !== H) { tint.width = W; tint.height = H; }
                const tc = tint.getContext('2d');
                tc.globalCompositeOperation = 'copy'; tc.drawImage(cv, 0, 0);
                tc.globalCompositeOperation = 'source-in'; tc.fillStyle = 'rgb(92, 76, 150)'; tc.fillRect(0, 0, W, H);
                ctx.drawImage(tint, 0, 0, this.canvas.width, this.canvas.height);
                ctx.restore();
                // Clouds drifting over the city (softer, lighter; many when it's grey)
                this._drawCloudShadows(ctx, cull, strength, S);
            },

            _drawCloudShadows(ctx, cull, strength, S) {
                const t = _gameTimeSec, wind = this.weather && this.weather.windVec ? this.weather.windVec : { x: 1, y: 0.3 };
                const cell = 900, drift = { x: t * 14 * (wind.x || 1), y: t * 6 * (wind.y || 0.3) };
                const i0 = Math.floor((cull.left - drift.x) / cell) - 1, i1 = Math.floor((cull.right - drift.x) / cell) + 1;
                const j0 = Math.floor((cull.top - drift.y) / cell) - 1, j1 = Math.floor((cull.bottom - drift.y) / cell) + 1;
                const a = (0.1 + 0.08 * S.overcast) * strength;
                ctx.save(); ctx.globalCompositeOperation = 'multiply';
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                    const h = _bldHash(i * 13.1 + j * 7.7, 5);
                    if (h > 0.55 + 0.4 * S.overcast) continue;
                    const cx = i * cell + drift.x + _bldHash(i, j + 3) * cell, cy = j * cell + drift.y + _bldHash(j, i + 9) * cell, r = 280 + _bldHash(i + j, 2) * 320;
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                    g.addColorStop(0, `rgba(96, 84, 150, ${a})`); g.addColorStop(1, 'rgba(96, 84, 150, 0)');
                    ctx.fillStyle = g; ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.4, r, 0.3, 0, Math.PI * 2);
                    // multiply by (1 - a·lavender) — approximate with a lavender-grey fill at low alpha
                    ctx.fillStyle = g; ctx.fill();
                }
                ctx.restore();
            },

            /**
             * The day's light over the frame (screen space, after the lighting pass): a warm sun wash
             * that lifts the shadows, a haze at golden hour, and a soft violet vignette.
             */
            drawDaylight(ctx) {
                const reach = this._sunReach();
                if (reach <= 0.001) return;
                const S = this.sunState(), k = S.k * reach;
                if (k <= 0.01) return;
                const W = this.canvas.width, H = this.canvas.height, light = 1 - 0.6 * S.overcast;
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                // Lift: the city is painted for the night; the sun opens it up
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = `rgba(${S.colRGB}, ${(0.09 * light + 0.03 * S.golden) * k})`; ctx.fillRect(0, 0, W, H);
                // Warmth: soft-light the sun's colour through everything
                ctx.globalCompositeOperation = 'soft-light';
                ctx.fillStyle = `rgba(${S.colRGB}, ${(0.42 + 0.1 * S.golden) * k * light})`; ctx.fillRect(0, 0, W, H);
                // Golden hour: a low haze of amber-rose from the sun's side
                if (S.golden > 0.02) {
                    ctx.globalCompositeOperation = 'screen';
                    const sx = W / 2 - S.dx * W * 0.7, sy = H / 2 - S.dy * H * 0.7;
                    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 1.1);
                    g.addColorStop(0, `rgba(255, 160, 150, ${0.12 * S.golden * k})`); g.addColorStop(1, 'rgba(255, 160, 150, 0)');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                }
                // A soft violet vignette keeps the frame dreamy
                ctx.globalCompositeOperation = 'multiply';
                const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
                v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(1, `rgba(150, 130, 205, ${0.3 * k})`);
                ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
                ctx.restore();
            }
        });
