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
        // Settings → Reflections: Ultra / High / Medium / Off. Cinematic View has its own toggle
        // (GameSettings.photoReflections, on by default) so photos can always have them.

        const REFLECT_LEVELS = ['medium', 'high', 'ultra'];
        const ULTRA_RECTS = 8;
        // Ultra places each piece of art in its detail layer with one setTransform (the view, then the piece's own
        // mirror and turn), instead of save, translate, scale, rotate… restore: a few canvas calls a piece saved
        const _UM = [1, 0, 0, 1, 0, 0];
        const UltraM = {
            from(B) { for (let i = 0; i < 6; i++) _UM[i] = B[i]; return UltraM; },
            t(x, y) { _UM[4] += _UM[0] * x + _UM[2] * y; _UM[5] += _UM[1] * x + _UM[3] * y; return UltraM; },
            s(x, y) { _UM[0] *= x; _UM[1] *= x; _UM[2] *= y; _UM[3] *= y; return UltraM; },
            r(a) {
                const c = Math.cos(a), n = Math.sin(a), A = _UM[0], B = _UM[1], C = _UM[2], D = _UM[3];
                _UM[0] = A * c + C * n; _UM[1] = B * c + D * n; _UM[2] = C * c - A * n; _UM[3] = D * c - B * n;
                return UltraM;
            },
            put(ctx) { ctx.setTransform(_UM[0], _UM[1], _UM[2], _UM[3], _UM[4], _UM[5]); }
        };                                // Ultra's detail layer is laid down in at most this many rects   // the steps adaptive reflections move between (Off is only chosen)

        const REFLECT = {
            ROAD: 0.45,             // how strongly wet asphalt reflects (puddles: 1)
            PAVE: 0.28,             // and wet paving
            LAMP_H: 64,             // a street lamp's head, px above the ground
            SPACING: 210,           // puddle spacing along a road
            BANDS: 30,              // shimmer bands in the composite (High)
            PUDDLE_SCALE: 1.25,      // a little broader, without increasing the number of puddles
            FEATHER_SCALE: 1.08,     // a narrow damp fringe outside the water's original contour
            ULTRA_REPAINT_MS: 45     // Ultra: how often a reflected body or car repaints its art (every 3rd frame at 60 FPS); Stella's is every frame
        };

        // Floors that mirror, per map (stage 3): rects [x, y, w, h, strength], cut-outs (rugs and
        // runners don't shine), water [x, y, r] (always mirrors, ripples), mirror = colour reflections of
        // what stands on it; glowShift: how far down the room's hanging lights (its INTERIOR_ART glow:
        // chandeliers, candles, portals, beams) appear in the floor
        // Shared feathered ellipses: four tiny sprites for every puddle, with no live blur.
        const _puddleEdgeSprites = new Map();
        function _puddleEdgeSprite(kind = 'mask') {
            let cv = _puddleEdgeSprites.get(kind);
            if (cv) return cv;
            const colors = { mask: '255,255,255', night: '6,4,18', day: '178,190,226', rim: '214,196,255' };
            const rgb = colors[kind] || colors.mask;
            cv = document.createElement('canvas'); cv.width = cv.height = 96;
            const c = cv.getContext('2d'), g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
            const stops = kind === 'rim'
                ? [[0,0],[.74,0],[.84,.12],[.9,1],[.95,.3],[1,0]]
                : [[0,1],[.72,1],[.83,.96],[.93,.5],[1,0]];
            for (const [at,a] of stops) g.addColorStop(at, `rgba(${rgb},${a})`);
            c.fillStyle = g; c.fillRect(0, 0, 96, 96);
            _puddleEdgeSprites.set(kind, cv); return cv;
        }

        function _paintPuddleLobes(ctx, p, growth, sprite, alpha, ox = p.x, oy = p.y) {
            if (!(alpha > 0)) return;
            ctx.save(); ctx.translate(ox, oy); ctx.rotate(p.ang); ctx.globalAlpha *= alpha;
            for (const L of p.lobes) {
                const rx = L.rx * growth * REFLECT.FEATHER_SCALE, ry = L.ry * growth * REFLECT.FEATHER_SCALE;
                ctx.drawImage(sprite, L.dx - rx, L.dy - ry, rx * 2, ry * 2);
            }
            ctx.restore();
        }

        // Each puddle's lobes, baked: painted just as they'd be painted live (each lobe its own drawImage at its
        // alpha, layer after layer: source-over composes the same either way) into a canvas of its own at the
        // scale it's seen (`q`: canvas px per world px), and painted again only when its growth or a layer's
        // strength moves; on the other frames the puddle is one drawImage instead of a save, turn, lobes, restore
        // per layer. Layers are (sprite kind, alpha) pairs; an alpha of 0 leaves that layer out.
        const _puddleArts = new Map();          // puddle → { [slot]: { cv, half, q, g, al, used } }
        const PUDDLE_BAKE_TOL = 0.003;          // growth and alpha steps finer than this aren't re-baked (invisible)
        function _bakedPuddle(p, slot, q, g, k1, a1, k2 = null, a2 = 0, k3 = null, a3 = 0) {
            let rec = _puddleArts.get(p);
            if (!rec) _puddleArts.set(p, rec = {});
            let b = rec[slot];
            if (!b) b = rec[slot] = { cv: document.createElement('canvas'), half: 0, q: 0, g: -1, al: [0, 0, 0], used: 0 };
            b.used = _frameTime;
            const T = PUDDLE_BAKE_TOL, al = b.al;
            if (b.q === q && Math.abs(b.g - g) <= T && Math.abs(al[0] - a1) <= T && Math.abs(al[1] - a2) <= T && Math.abs(al[2] - a3) <= T) return b;
            const size = Math.max(2, Math.ceil((p.r + 2) * 2 * q));
            if (b.cv.width !== size || b.cv.height !== size) { b.cv.width = size; b.cv.height = size; }
            const c = b.cv.getContext('2d');
            c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
            c.clearRect(0, 0, size, size);
            c.setTransform(q, 0, 0, q, size / 2, size / 2);
            _paintPuddleLobes(c, p, g, _puddleEdgeSprite(k1), a1, 0, 0);
            if (k2) _paintPuddleLobes(c, p, g, _puddleEdgeSprite(k2), a2, 0, 0);
            if (k3) _paintPuddleLobes(c, p, g, _puddleEdgeSprite(k3), a3, 0, 0);
            b.half = size / 2 / q; b.q = q; b.g = g; al[0] = a1; al[1] = a2; al[2] = a3;
            return b;
        }
        function _drawBakedPuddle(ctx, p, b) { ctx.drawImage(b.cv, p.x - b.half, p.y - b.half, b.half * 2, b.half * 2); }

        const REFLECT_SURFACES = {
            hotel_lobby: { rects: [[50, 50, 900, 1100, 0.55]], cuts: [[440, 612, 120, 538]], water: [[500, 320, 82]], glowShift: 64 },
            house_of_death: { rects: [[574, 1014, 652, 486, 0.42], [574, 444, 652, 556, 0.58], [1574, 14, 212, 416, 0.38]],
                              cutCircles: [[900, 720, 152]], cuts: [[840, 1014, 120, 486]], waterProps: 'hod_fountain', glowShift: 58 },
            moon_city_nightclub: { rects: [[590, 310, 420, 380, 0.55]], glowShift: 40 },
            enni_cole_interior: { rects: [[50, 50, 1900, 1300, 0.3]], cuts: [[870, 1000, 260, 350], [650, 120, 450, 290], [1105, 100, 290, 320], [1120, 435, 270, 200]], mirror: true, glowShift: 42 },
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

            /** Ultra redraws detailed art; High/Medium keep the existing light and silhouette passes. The level in use can
                be below the chosen one while adaptive reflections have stepped it down (_adaptReflections). */
            reflectQuality() {
                if (this.cineCam) return GameSettings.photoReflections === false ? null : (GameSettings.reflections === 'ultra' ? 'ultra' : 'high');
                const q = GameSettings.reflections || 'high';
                if (q === 'off') return null;
                const cap = this._reflAdapt && this._reflAdapt.cap;
                return cap && REFLECT_LEVELS.indexOf(cap) < REFLECT_LEVELS.indexOf(q) ? cap : q;
            },

            /**
             * Adaptive reflections (with the Adaptive Lighting setting). `reflMs` is the reflection pass's own time on a
             * sampled frame (every 8th), or -1. Over a 3 s window: if frames run over budget (1.18 × the target) and the
             * reflections take a real share (over 2 ms), the level steps down one for this session (Ultra → High →
             * Medium; never to Off, which stays a choice). After 15 s, and three steady windows on target, it tries one
             * back up; when a try doesn't hold (down again within a minute), the next waits twice as long (up to 4 min).
             * The saved setting is never touched, and choosing a level again starts afresh.
             */
            _adaptReflections(reflMs) {
                const chosen = GameSettings.reflections || 'high', now = performance.now();
                let s = this._reflAdapt;
                if (!s || s.chosen !== chosen) {
                    s = this._reflAdapt = { chosen, cap: null, begin: now + 1000, count: 0, frames: 0, refl: 0, stable: 0,
                        downAt: 0, upAt: 0, lastUp: -Infinity, backoff: 15000 };
                }
                if (!GameSettings.adaptiveLighting) { s.cap = null; return; }   // (off: the chosen level, always)
                if (reflMs < 0 || !this._refl) return;
                const eligible = GameSettings.adaptiveLighting && chosen !== 'off' && chosen !== 'medium' && this.running && !this.paused &&
                    !this.cineCam && !this.cutscene?.active && !this.scenes?.running && !PerfBench.active && !this.showProfiler &&
                    !GameSettings.baseline && !document.hidden;
                const frameMs = this._renderFrameMs;
                if (!eligible || !Number.isFinite(frameMs) || frameMs < 2 || frameMs > 100) { s.begin = Math.max(s.begin, now + 500); s.count = s.frames = s.refl = 0; return; }
                if (now < s.begin) return;
                s.frames += frameMs; s.refl += reflMs; s.count++;
                if (now - s.begin < 3000 || s.count < 12) return;
                const frame = s.frames / s.count, refl = s.refl / s.count;
                const target = 1000 / (GameSettings.fpsLimit > 0 ? Math.min(60, GameSettings.fpsLimit) : 60);
                s.begin = now; s.count = s.frames = s.refl = 0;
                const level = this.reflectQuality(), i = REFLECT_LEVELS.indexOf(level);
                if (frame > target * 1.18 && refl > 2 && i > 0 && now >= s.downAt) {
                    if (now - s.lastUp < 60000) s.backoff = Math.min(240000, s.backoff * 2);   // a try back up that didn't hold
                    s.cap = REFLECT_LEVELS[i - 1]; s.stable = 0;
                    s.upAt = now + s.backoff; s.begin = now + 500;                     // (ignore the frames the change itself costs)
                } else if (s.cap) {
                    s.stable = frame <= target * 1.06 ? s.stable + 1 : 0;
                    if (s.stable >= 3 && now >= s.upAt) {
                        const up = REFLECT_LEVELS[i + 1];
                        s.cap = up === chosen ? null : up; s.stable = 0;
                        s.lastUp = now; s.downAt = now + 3000; s.begin = now + 500;
                    }
                }
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
                    size *= REFLECT.PUDDLE_SCALE;
                    const lobes = [], n = 2 + (rnd() < 0.5 ? 1 : 0);
                    for (let i = 0; i < n; i++) lobes.push({ dx: (rnd() - 0.5) * size * 1.1, dy: (rnd() - 0.5) * size * 0.4,
                        rx: size * (0.45 + rnd() * 0.45), ry: size * (0.22 + rnd() * 0.22) });
                    // Offset lobes and the damp fringe must fit the spatial/culling envelope.
                    const r = Math.max(...lobes.map(L => Math.hypot(L.dx, L.dy)
                        + Math.max(L.rx, L.ry) * REFLECT.FEATHER_SCALE));
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
                    const postScale = LAMP_TYPE_STYLE[l.lampType] ? LAMP_POST_SCALE : 1;
                    add(l.x + (rnd() - 0.5) * 30, l.y + REFLECT.LAMP_H * postScale * (0.7 + rnd() * 0.6), (rnd() - 0.5) * 0.6, 26 + rnd() * 26);
                }
                for (const p of map.pavements || []) {
                    if (p.poly) {                                                  // beside an angled road: along its kerb, inside its shape
                        const e = p.poly.reduce((best, a, i) => { const b = p.poly[(i + 1) % p.poly.length], l = Math.hypot(b.x - a.x, b.y - a.y); return l > best.l ? { a, b, l } : best; }, { l: 0 });
                        const n = Math.floor(e.l * 75 / 90000 + rnd() * 1.2), ang = Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x);
                        const cx = p.poly.reduce((s, q) => s + q.x, 0) / p.poly.length, cy = p.poly.reduce((s, q) => s + q.y, 0) / p.poly.length;
                        for (let i = 0; i < n; i++) {
                            const t = 0.1 + rnd() * 0.8, x = e.a.x + (e.b.x - e.a.x) * t, y = e.a.y + (e.b.y - e.a.y) * t;
                            const px = x + (cx - x) * 0.5, py = y + (cy - y) * 0.5;   // halfway in from the long edge, towards the middle
                            if (Poly.contains(p.poly, px, py)) add(px, py, ang, 14 + rnd() * 18);
                        }
                        continue;
                    }
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
                // Out of Ultra: its full-screen detail layer and scratch canvases go (they're rebuilt on the way back in)
                if (q !== 'ultra' && this._reflDetailCv) this._reflDetailCv = this._ultraArt = this._ultraArtFree = null;
                if (!q || !this.view || (wet < 0.02 && !surf)) return;
                // The lights and the mask at half size on High and Ultra (soft glows lose nothing), a quarter on Medium;
                // Ultra's own detail layer (people, cars, trees) is the one drawn at full size
                const W = this.canvas.width, H = this.canvas.height, s = q === 'medium' ? 0.25 : 0.5;
                const rw = Math.max(1, Math.round(W * s)), rh = Math.max(1, Math.round(H * s));
                let R = this._reflCv, M = this._reflMask;
                if (!R) { R = this._reflCv = document.createElement('canvas'); M = this._reflMask = document.createElement('canvas'); }
                if (R.width !== rw || R.height !== rh) { R.width = M.width = rw; R.height = M.height = rh; }
                const rc = R.getContext('2d'), mc = M.getContext('2d');
                const v = this.view, z = v.zoom;
                const toView = (c, k = s) => { c.setTransform(k, 0, 0, k, 0, 0); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-v.x + (v.shakeX || 0), -v.y + (v.shakeY || 0)); };
                const hw = W / 2 / z + 140, hh = H / 2 / z + 140;
                const near = (x, y, m = 0) => x > v.x - hw - m && x < v.x + hw + m && y > v.y - hh - m - 160 && y < v.y + hh + m;

                // 1. The mask: wet asphalt, then the puddles at full strength. Ultra notes each wet thing's
                // world box (flat x0, y0, x1, y1), so art whose reflection lands on none of them isn't painted
                const wetBox = q === 'ultra' ? (this._ultraWet || (this._ultraWet = [])) : null;
                if (wetBox) wetBox.length = 0;
                mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, rw, rh); toView(mc);
                const net = wet >= 0.02 && this.activeMap.id === 'hub_949' && this.traffic && this.traffic.network;
                if (net) {
                    mc.fillStyle = `rgba(255,255,255,${(REFLECT.ROAD * Math.min(1, wet * 1.3)).toFixed(3)})`;
                    for (const road of net.roads) {
                        if (road.x > v.x + hw || road.x + road.w < v.x - hw || road.y > v.y + hh || road.y + road.h < v.y - hh) continue;
                        const c = road.getCorners();
                        mc.beginPath(); Poly.trace(mc, c); mc.fill();
                        if (wetBox) wetBox.push(road.x, road.y, road.x + road.w, road.y + road.h);
                    }
                }
                mc.fillStyle = `rgba(255,255,255,${(REFLECT.PAVE * Math.min(1, wet * 1.3)).toFixed(3)})`;
                if (wet >= 0.02) for (const p of this.activeMap.pavements || []) {
                    if (p.x > v.x + hw || p.x + p.w < v.x - hw || p.y > v.y + hh || p.y + p.h < v.y - hh) continue;
                    if (p.poly) { mc.beginPath(); Poly.trace(mc, p.poly); mc.fill(); } else mc.fillRect(p.x, p.y, p.w, p.h);
                    if (wetBox) wetBox.push(p.x, p.y, p.x + p.w, p.y + p.h);
                }
                let any = !!net || !!(wet >= 0.02 && this.activeMap.pavements && this.activeMap.pavements.length);
                if (surf) {                                                    // polished floors and water
                    any = true;
                    for (const [x, y, w, h, k] of surf.rects) {
                        mc.fillStyle = `rgba(255,255,255,${k})`; mc.fillRect(x, y, w, h);
                        if (wetBox) wetBox.push(x, y, x + w, y + h);   // (its cut-outs aren't taken off: a box over one still paints)
                    }
                    mc.globalCompositeOperation = 'destination-out'; mc.fillStyle = '#fff';
                    for (const [x, y, w, h] of surf.cuts || []) mc.fillRect(x, y, w, h);
                    for (const [x, y, r] of surf.cutCircles || []) { mc.beginPath(); mc.arc(x, y, r, 0, Math.PI * 2); mc.fill(); }
                    mc.globalCompositeOperation = 'source-over'; mc.fillStyle = 'rgba(255,255,255,0.95)';
                    for (const [x, y, r] of surf.water) {
                        mc.beginPath(); mc.arc(x, y, r, 0, Math.PI * 2); mc.fill();
                        if (wetBox) wetBox.push(x - r, y - r, x + r, y + r);
                    }
                }
                for (const entry of wet >= 0.02 ? this._queryPuddleCandidates({ left: v.x - hw, right: v.x + hw,
                    top: v.y - hh - 160, bottom: v.y + hh }, 'puddleMask') : []) {
                    const p = entry.item;
                    if (!near(p.x, p.y, p.r)) continue;
                    const k = this._puddleK(p, wet); if (k <= 0) continue;
                    any = true;
                    const g = 0.65 + 0.35 * k;
                    _drawBakedPuddle(mc, p, _bakedPuddle(p, 'mask', z > 1.25 ? 1 : 0.5, g, 'mask', k));   // (the mask is half size)
                    if (wetBox) wetBox.push(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
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
                if (night > 0.01 && (q === 'high' || q === 'ultra') && CONFIG.BUILDINGS.LEAN) {
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
                    const LH = REFLECT.LAMP_H, maxLampReach = LH * Math.max(1, LAMP_POST_SCALE) * 2;
                    for (const entry of this._queryLampCandidates({ left: v.x - hw - maxLampReach, right: v.x + hw + maxLampReach,
                        top: v.y - hh - maxLampReach - 160, bottom: v.y + hh + maxLampReach }, 'lampReflections')) {
                        const l = entry.item, scale = LAMP_TYPE_STYLE[l.lampType] ? LAMP_POST_SCALE : 1, height = LH * scale;
                        if (!near(l.x, l.y, height * 2)) continue;
                        const k = (rs && rs.active ? rs.lampLight(l) : 1) * lampFlicker(l) * night;
                        if (k < 0.02) continue;
                        const col = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#ffeebb';
                        glow(l.x, l.y + height * 1.05, col, 54 * scale, 70 * scale, 1.0 * k); // the head, upside down below the lamp
                        glow(l.x, l.y + height * 1.05, '#ffffff', 16 * scale, 22 * scale, 0.8 * k); // its hot core
                        glow(l.x, l.y + height * 0.95, col, 24 * scale, height * 2.6, 0.7 * k); // the long smear down the wet street
                        rc.globalAlpha = 0.18 * k; rc.strokeStyle = col; rc.lineWidth = 2 * scale; // the pole, faint
                        rc.beginPath(); rc.moveTo(l.x, l.y + 4 * scale); rc.lineTo(l.x, l.y + height * 0.9); rc.stroke();
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
                if (q !== 'ultra') for (const m of movers) this._reflShape(rc, m, 0.85);
                rc.globalCompositeOperation = 'source-over';
                // A mirror floor gives back colour too: whoever stands on it, and the things set on it
                if (surf && surf.mirror) {
                    if (q !== 'ultra') for (const m of movers) { rc.fillStyle = m.col && /^#[0-9a-f]{6}$/i.test(m.col) ? m.col : '#b48cff'; this._reflShape(rc, m, 0.5); }
                    for (const pr of this.props || []) {
                        if (!near(pr.x, pr.y, 200)) continue;
                        rc.globalAlpha = 0.42; rc.fillStyle = pr.color || '#6a3aa0';
                        rc.fillRect(pr.x, pr.y + pr.height, pr.width, pr.height * 0.75);
                    }
                }
                rc.globalAlpha = 1;

                // Ultra's ordinary colours stay separate from emitted light: colour reflects
                // with source-over and never punches a bright hole in the darkness layer.
                let D = null, Dr = null, Drs = null;
                if (q === 'ultra') {
                    D = this._reflDetailCv || (this._reflDetailCv = document.createElement('canvas'));
                    if (D.width !== W || D.height !== H) { D.width = W; D.height = H; D._dirty = null; }
                    const dc = D.getContext('2d'), old = D._dirty;
                    dc.setTransform(1, 0, 0, 1, 0, 0);
                    if (old) for (const o of old) dc.clearRect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0);   // (all last frame drew was in these)
                    dc.globalAlpha = 1; dc.globalCompositeOperation = 'source-over';
                    const VM = this._ultraView || (this._ultraView = [1, 0, 0, 1, 0, 0]);   // the view, as toView(dc, 1) sets it
                    VM[0] = VM[3] = z; VM[1] = VM[2] = 0;
                    VM[4] = W / 2 + z * (-v.x + (v.shakeX || 0)); VM[5] = H / 2 + z * (-v.y + (v.shakeY || 0));
                    // What goes into it: each item's world box, so it's masked and laid down only there
                    const boxes = this._ultraBoxes || (this._ultraBoxes = []);
                    boxes.length = 0;
                    const mark = this._ultraMark || (this._ultraMark = (x0, y0, x1, y1) => { this._ultraBoxes.push(x0, y0, x1, y1); });
                    this._drawUltraReflectionFoliage(dc, near, {
                        left: v.x - hw - 260, right: v.x + hw + 260,
                        top: v.y - hh - 360, bottom: v.y + hh + 260
                    }, mark);
                    for (const m of this._ultraReflectionMovers(near)) {
                        if (m.kind === 'car') this._drawUltraReflectionCar(dc, m.e, undefined, mark);
                        else if (!this._drawUltraReflectionWalker(dc, m.e, undefined, mark, m.kind === 'crowd')) {
                            // no reflected art (drones, automata): their silhouette still blocks the reflected lights
                            rc.globalCompositeOperation = 'destination-out'; this._reflShape(rc, m, 0.85);
                            rc.globalCompositeOperation = 'source-over';
                        }
                    }
                    dc.globalAlpha = 1;
                    this._ultraArtSweep();
                    Drs = this._ultraRects(boxes, v, z, W, H);
                    D._dirty = Drs;
                    if (Drs) {
                        Dr = { x0: W, y0: H, x1: 0, y1: 0 };
                        for (const r of Drs) { Dr.x0 = Math.min(Dr.x0, r.x0); Dr.y0 = Math.min(Dr.y0, r.y0); Dr.x1 = Math.max(Dr.x1, r.x1); Dr.y1 = Math.max(Dr.y1, r.y1); }
                        // A reflected body interrupts the reflected lights through its actual art,
                        // including gaps between limbs and leaves, rather than the cheap silhouette.
                        rc.setTransform(1, 0, 0, 1, 0, 0);
                        rc.globalCompositeOperation = 'destination-out'; rc.globalAlpha = 0.85;
                        for (const r of Drs) {
                            const w = r.x1 - r.x0, h = r.y1 - r.y0;
                            rc.drawImage(D, r.x0, r.y0, w, h, r.x0 * s, r.y0 * s, w * s, h * s);
                        }
                        rc.globalAlpha = 1;
                        // and the art keeps only what's over wet ground (once, across the rects, clipped to them)
                        const w = Dr.x1 - Dr.x0, h = Dr.y1 - Dr.y0;
                        dc.setTransform(1, 0, 0, 1, 0, 0);
                        dc.save(); dc.beginPath(); for (const r of Drs) dc.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); dc.clip();
                        dc.globalCompositeOperation = 'destination-in'; dc.drawImage(M, Dr.x0 * s, Dr.y0 * s, w * s, h * s, Dr.x0, Dr.y0, w, h);
                        dc.restore();
                    } else D = null;
                }

                // 3. Only where the ground is wet enough to mirror
                rc.setTransform(1, 0, 0, 1, 0, 0);
                rc.globalCompositeOperation = 'destination-in';
                rc.drawImage(M, 0, 0);
                rc.globalCompositeOperation = 'source-over';
                this._refl = { R, D, Dr, Drs, q, wet };
            },


            /** Ultra uses the actual visible cast, including indoor guests and scene actors. */
            _ultraReflectionMovers(near) {
                const buffer = this._ultraMoverBuffer || (this._ultraMoverBuffer = { list: [], records: [], cars: [] });
                const out = buffer.list, previous = out.length;
                const seen = this._ultraActorSeen || (this._ultraActorSeen = new Set());
                seen.clear();
                let count = 0;
                const add = (e, kind = 'walker') => {
                    if (!e || seen.has(e) || e.dead || e.visible === false || e.inCar || !near(e.x, e.y, 80)) return;
                    seen.add(e);
                    const record = buffer.records[count] || (buffer.records[count] = {});
                    record.e = e; record.x = e.x; record.y = e.y; record.kind = kind; record.col = null;
                    out[count++] = record;
                };
                if (!this.isDriving) add(this.player);
                if (!(this.scenes && this.scenes.crewOffstage))
                    for (const e of this.teammates || []) if (e.recruited) add(e);
                // (the crowd, as the main pass counts it: passers-by, guests and staff, standing NPCs)
                for (const e of this.npcs || []) add(e, e.role === 'teammate' ? 'walker' : 'crowd');
                for (const e of this.enemies || []) add(e);
                for (const e of (this.pedestrians && this.pedestrians.pedestrians) || []) add(e, 'crowd');
                for (const life of [this.lobbyLife, this.clubLife, this.cafeLife])
                    for (const e of (life && life.walkers) || []) add(e, 'crowd');
                for (const e of (this.scenes && this.scenes.actors) || []) add(e);
                for (const e of this._ultraReflectionCars(buffer.cars)) add(e, 'car');
                for (let i = count; i < previous; i++) buffer.records[i].e = null;
                out.length = count;
                // Detailed reflections cost a full body draw each: the ULTRA_MAX nearest her (she's always first)
                const P = this.player, MAX = 12;
                if (count > MAX && P) {
                    const px = P.x, py = P.y;
                    out.sort((a, b) => ((a.x - px) ** 2 + (a.y - py) ** 2) - ((b.x - px) ** 2 + (b.y - py) ** 2));
                    out.length = MAX;
                }
                seen.clear();
                return out;
            },
            // Detailed Ultra scenery, painted only: no labels, ground-shadow pass or simulation.
            _ultraReflectionCars(out) {
                const cars = out || (this._ultraCars || (this._ultraCars = []));
                const seen = this._ultraCarSeen || (this._ultraCarSeen = new Set());
                cars.length = 0; seen.clear();
                const add = car => { if (car && !seen.has(car)) { seen.add(car); cars.push(car); } };
                add(this.car); add(this.ownedCar); add(this.deliveryVehicle);
                for (const car of (this.traffic && this.traffic.vehicles) || []) add(car);
                // The returned list owns its references; the dedup set must not retain old maps.
                seen.clear();
                return cars;
            },

            _drawUltraReflectionCar(ctx, e, alpha = 0.58, mark = null) {
                if (!e || e.dead || e.visible === false || !(alpha > 0)) return;
                if (![e.x, e.y, e.length, e.width].every(Number.isFinite) || e.length <= 0 || e.width <= 0) return;
                const fade = Math.max(0, Math.min(1, e.fade ?? 1));
                if (!(fade > 0)) return;
                const scale = this._ultraArtScale(), pad = CAR_ART.PAD + 16;
                const rw = Math.ceil((e.length + pad * 2) * scale);
                const rh = Math.ceil((e.width + pad * 2) * scale);
                // its box, turned any way, mirrored about the ground below it; none of it over wet ground: nothing to paint
                const groundY = e.y + (e.width || 20) * 0.55, r = Math.hypot(rw, rh) / scale / 2;
                const bx0 = e.x - r, by0 = groundY - 0.8 * (e.y + r - groundY), bx1 = e.x + r, by1 = groundY + 0.8 * (groundY - e.y + r);
                if (!this._ultraOnWet(bx0, by0, bx1, by1)) return;
                // Car art sets its own alpha for rims and lamps. Group it in its own small canvas so those
                // settings cannot override the reflected body's overall opacity; kept between repaints.
                const art = this._ultraArtFor(e, rw, rh, e === this.car && this.isDriving), cv = art.cv;
                if (art.due) {
                    const c = cv.getContext('2d');
                    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rw, rh);
                    c.save();
                    c.setTransform(scale, 0, 0, scale, rw / 2, rh / 2);
                    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
                    c.shadowBlur = 0; c.filter = 'none';
                    drawCarBody(c, e, false);
                    drawCarLamps(c, e, false);
                    c.restore();
                    this._ultraArtPainted(art);
                }
                // mirrored about the ground below it, turned to its heading (ctx: the detail layer, in this._ultraView)
                ctx.globalAlpha = Math.min(1, alpha) * fade;
                UltraM.from(this._ultraView).t(0, groundY).s(1, -0.8).t(e.x, e.y - groundY).r(-(e.angle || 0)).s(1, -1).put(ctx);
                ctx.drawImage(cv, 0, 0, rw, rh, -rw / scale / 2, -rh / scale / 2, rw / scale, rh / scale);
                if (mark) mark(bx0, by0, bx1, by1);
            },

            /** Ultra's art for one reflected actor or car: a canvas of its own, kept while it's reflected and
                repainted every ULTRA_REPAINT_MS (in faint, squashed, rippling water a pose a frame or two old can't
                be told apart), staggered so the cast doesn't all repaint on one frame. `live` repaints every frame. */
            _ultraArtFor(e, w, h, live) {
                const all = this._ultraArt || (this._ultraArt = new Map());
                let a = all.get(e);
                if (!a) {
                    const free = this._ultraArtFree;
                    this._ultraArtSeq = ((this._ultraArtSeq || 0) + 1) % 3;
                    a = { cv: (free && free.pop()) || document.createElement('canvas'), at: 0, fresh: true, hasArt: true, used: 0, seq: this._ultraArtSeq };
                    all.set(e, a);
                }
                a.used = this._renderDrawId;
                if (a.cv.width !== w || a.cv.height !== h) { a.cv.width = w; a.cv.height = h; a.fresh = true; }
                a.due = live || a.fresh || !(_frameTime - a.at < REFLECT.ULTRA_REPAINT_MS) || _frameTime < a.at;
                return a;
            },
            _ultraArtPainted(a) {
                // (a first paint is dated back by a third or two of the interval: the stagger)
                a.at = a.fresh ? _frameTime - a.seq * REFLECT.ULTRA_REPAINT_MS / 3 : _frameTime;
                a.fresh = false;
            },
            /** Art no longer reflected gives up its canvas (a few are kept for the next ones) */
            _ultraArtSweep() {
                if (!this._ultraArt) return;
                for (const [e, a] of this._ultraArt) if (a.used !== this._renderDrawId) {
                    const free = this._ultraArtFree || (this._ultraArtFree = []);
                    if (free.length < 4) free.push(a.cv);
                    this._ultraArt.delete(e);
                }
            },
            /**
             * Ultra's world boxes (flat x0, y0, x1, y1) as screen rects in whole half-size pixels (so each is exact in
             * the lights and the mask too). Rects that overlap are joined (a pixel laid down twice would show twice as
             * strong), and so are two that one rect round both covers for little more; at most ULTRA_RECTS remain.
             */
            _ultraRects(b, v, z, W, H) {
                const out = this._ultraRectList || (this._ultraRectList = []);
                out.length = 0;
                const sx = (x) => (x - v.x + (v.shakeX || 0)) * z + W / 2, sy = (y) => (y - v.y + (v.shakeY || 0)) * z + H / 2;
                for (let i = 0; i < b.length; i += 4) {
                    const x0 = Math.max(0, Math.floor(sx(b[i]) / 2 - 1) * 2), x1 = Math.min(W, Math.ceil(sx(b[i + 2]) / 2 + 1) * 2);
                    const y0 = Math.max(0, Math.floor(sy(b[i + 1]) / 2 - 1) * 2), y1 = Math.min(H, Math.ceil(sy(b[i + 3]) / 2 + 1) * 2);
                    if (x1 > x0 && y1 > y0) out.push({ x0, y0, x1, y1 });
                }
                const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
                for (;;) {
                    let bi = -1, bj = -1, best = Infinity;
                    for (let i = 0; i < out.length && best > 0; i++) for (let j = i + 1; j < out.length; j++) {
                        const a = out[i], c = out[j];
                        if (a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1) { bi = i; bj = j; best = 0; break; }
                        const u = (Math.max(a.x1, c.x1) - Math.min(a.x0, c.x0)) * (Math.max(a.y1, c.y1) - Math.min(a.y0, c.y0));
                        const k = u / (area(a) + area(c));
                        if (k < best) { best = k; bi = i; bj = j; }
                    }
                    if (bi < 0 || (best > 1.25 && out.length <= ULTRA_RECTS)) break;
                    const a = out[bi], c = out[bj];
                    a.x0 = Math.min(a.x0, c.x0); a.y0 = Math.min(a.y0, c.y0); a.x1 = Math.max(a.x1, c.x1); a.y1 = Math.max(a.y1, c.y1);
                    out.splice(bj, 1);
                }
                return out.length ? out.slice() : null;
            },
            /** Does a world box touch anything wet this frame (the mask's own pieces, noted as it's built)? */
            _ultraOnWet(x0, y0, x1, y1) {
                const b = this._ultraWet;
                if (!b) return true;
                for (let i = 0; i < b.length; i += 4) if (x0 < b[i + 2] && b[i] < x1 && y0 < b[i + 3] && b[i + 1] < y1) return true;
                return false;
            },
            /** Ultra's reflected art is painted at the scale it's seen: 1x up to zoom 1.25, 2x closer in */
            _ultraArtScale() { return this.view && this.view.zoom > 1.25 ? (CAR_ART.SCALE || 2) : 1; },

            _drawUltraReflectionFoliage(ctx, near, bounds, mark = null) {
                if (!this.activeMap || !this.activeMap.foliage) return;
                const wind = this.weather && Number.isFinite(this.weather.wind) ? this.weather.wind : 0.3;
                const windDir = this.weather && Number.isFinite(this.weather.windDirection) ? this.weather.windDirection : 1;
                const density = GameSettings.getFoliageScale();
                const stride = density < 1 ? Math.round(1 / density) : 1;
                const out = this._ultraFoliageCandidates || (this._ultraFoliageCandidates = []);
                const candidates = this._queryRenderFoliage(bounds, out);
                for (const entry of candidates) {
                    const f = entry.item;
                    if (!f || f.dead || f.visible === false || (density < 1 && entry.index % stride !== 0)) continue;
                    if (![f.x, f.y, f.size, f.phaseOffset, f.swayMultiplier].every(Number.isFinite) || f.size <= 0) continue;
                    const bush = f.type === 'bush', palm = f.type === 'palm';
                    const sway = Math.sin(_gameTimeSec * 2 + f.phaseOffset) * wind * 8 * f.swayMultiplier * windDir;
                    const cx = f.x + sway * (bush ? 0.6 : palm ? 0.3 : 1), cy = foliageCanopyY(f);
                    const variant = f._variant === undefined ? Math.floor(f.phaseOffset * 0.637) % 4 : f._variant;
                    const spr = floraSprite(f.type, f.size, variant);
                    const reflectedY = f.y - 0.8 * (cy - f.y);
                    // Use the reflected canopy centre, with its full uncompressed sprite radius,
                    // so foliage outside the view can still cast a reflection into it.
                    if (near && !near(cx, reflectedY, spr.w * 0.72)) continue;
                    const hw = spr.w * 0.6, bx0 = cx - hw, by0 = f.y - 0.8 * (cy + hw - f.y), bx1 = cx + hw, by1 = f.y - 0.8 * (cy - hw - f.y);
                    if (!this._ultraOnWet(bx0, by0, bx1, by1)) continue;   // (its reflection would land on nothing wet)
                    ctx.globalAlpha = 0.52;
                    UltraM.from(this._ultraView).t(0, f.y).s(1, -0.8);
                    if (palm) {
                        UltraM.t(cx, cy - f.y).r(sway * 0.012).put(ctx);
                        ctx.drawImage(spr.cv, -spr.w / 2, -spr.w / 2);
                    } else { UltraM.t(0, -f.y).put(ctx); ctx.drawImage(spr.cv, cx - spr.w / 2, cy - spr.w / 2); }
                    if (mark) mark(bx0, by0, bx1, by1);
                }
            },
            /** Scratch owners keep reflection paint from changing live animation or shot origins. */
            _ultraReflectionWalkerProxy(e) {
                const proxies = this._ultraWalkerProxies || (this._ultraWalkerProxies = new WeakMap());
                let record = proxies.get(e);
                if (!record) {
                    record = { proxy: Object.create(Object.getPrototypeOf(e)), states: Object.create(null), game: null };
                    proxies.set(e, record);
                }
                const proxy = record.proxy;
                Object.assign(proxy, e);
                proxy._reflectionProxy = true;
                proxy._reflectionSource = e;
                for (const key of ['_gait', '_animState', '_pose', '_glassSlosh']) {
                    if (e[key]) {
                        const state = record.states[key] || (record.states[key] = {});
                        for (const k of Object.keys(state)) if (!(k in e[key])) delete state[k];
                        Object.assign(state, e[key]);
                        proxy[key] = state;
                    } else delete proxy[key];
                }
                // Hair/cloth physics use rest geometry off the world canvas. Never share their owners.
                delete proxy._hairSim;
                delete proxy._clothSim;
                delete proxy._cloth;
                if (e._game) {
                    if (!record.game || Object.getPrototypeOf(record.game) !== e._game) record.game = Object.create(e._game);
                    // The player body advances these during weapon paint; the reflection has its own copy.
                    record.game.holsterAnim = e._game.holsterAnim;
                    record.game._holsterT = e._game._holsterT;
                    proxy._game = record.game;
                }
                return proxy;
            },

            /** The same body configuration used by the ordinary actor passes, without their UI. */
            _ultraReflectionWalkerConfig(e, proxy) {
                if (e === this.player) {
                    const cosmetic = this.cosmetics.getRenderConfig(), outfit = cosmetic.outfit;
                    const armed = (this.weaponMode === 'normal' || this.weaponMode === 'sniper') && !this.weaponHolstered;
                    let stance = armed
                        ? (this.currentWeapon ? stanceForWeapon(this.currentWeapon.id) : (this.weaponMode === 'sniper' ? 'sniper' : 'pistol'))
                        : this.weaponMode === 'none' && this.shootCooldown > 0 ? 'punch' : 'idle';
                    const pushing = this.furniture && this.furniture.holding;
                    if (pushing) stance = 'idle';
                    let kick = 0;
                    if (armed && this.currentWeapon && this.shootCooldown > 0) {
                        const stats = this.currentWeapon.stats || {}, fireRate = stats.fireRate || 20;
                        const heavy = Math.max(0.4, Math.min(2, (stats.recoil || 10) / 10));
                        const interp = RenderInterp.stepAdvanced ? RenderInterp.alpha : 1;
                        const since = Math.max(0, fireRate - this.shootCooldown - 1 + interp);
                        kick = Math.max(0, 1 - since / (4 + 4 * heavy)) * heavy;
                    }
                    const wx = weatherAt(proxy), rainOn = !!(wx && wx.rain > 0.05);
                    return {
                        skinColor: cosmetic.skinColor, hair: cosmetic.hair, gender: APPEARANCES['949'].gender,
                        stance, scopeK: stance === 'sniper' ? (this.scopeK || 0) : 0,
                        isDriving: false, isShootingFromCar: false, carAngle: this.car ? this.car.angle : 0,
                        recoil: stance === 'punch' && this.shootCooldown > 0 ? this.shootCooldown / 10 : 0,
                        kick, punchTicks: stance === 'punch'
                            ? Math.max(0, CONFIG.PUNCH.DURATION_TICKS - this.shootCooldown - 1 + RenderInterp.alpha) : undefined,
                        top: outfit.top, bottom: outfit.bottom, shoes: outfit.shoes, train: outfit.train || null,
                        hat: cosmetic.hat || (rainOn && outfit.top && outfit.top.type === 'hoodie'
                            ? { type: 'hood_up', color: outfit.top.color } : null),
                        jewelry: withFieldMask(this, cosmetic.jewelry),
                        pose: pushing ? 'push' : typeof phoneSystem !== 'undefined' && phoneSystem.isOpen ? 'phone' : this.sneaking ? 'sneak' : undefined,
                        poseWhileMoving: pushing || this.sneaking,
                        held: armed && cosmetic.held && cosmetic.held.type === 'umbrella' ? null : (cosmetic.held || outfit.held || null),
                        noShadow: true
                    };
                }
                if (typeof Ganger !== 'undefined' && e instanceof Ganger) {
                    const aiming = e.state === 'ALERT' || e.state === 'SUPPRESSING';
                    const id = e.equippedWeaponId || 'pistol_ganger';
                    const look = e.look || Ganger.makeLook(seededRandom('reflection|' + (e.id || '') + '|' + e.x + ',' + e.y));
                    return { ...look, stance: aiming ? stanceForWeapon(id) : 'idle', kick: aiming ? shotKick(proxy) : 0,
                        weapon: { id, ready: aiming }, noShadow: true };
                }
                if (typeof Pedestrian !== 'undefined' && e instanceof Pedestrian) {
                    const far = typeof _zoomLOD !== 'undefined' && _zoomLOD >= 1;
                    const raining = e._raining();
                    let look = far && e.look.hair ? { ...e.look, hair: { type: 'short', color: e.look.hair.color }, jewelry: null } : e.look;
                    if (e.look.umbrella) look = { ...look, held: { type: 'umbrella', color: e.look.umbrella, hand: 'right' } };
                    if (raining && e.look.rainHood && !look.hat && look.top && look.top.type === 'hoodie')
                        look = { ...look, hat: { type: 'hood_up', color: look.top.color } };
                    return { ...look, stance: 'idle', lerpSpeed: 0.15, noShadow: true };
                }
                if (typeof NPC !== 'undefined' && e instanceof NPC) {
                    const app = lookFor(proxy) || {};
                    if (e.role !== 'teammate') return { stance: 'idle', ...app, noShadow: true };
                    const fighting = e.recruited && (e.cooldown > 0 || e.shotsLeftInBurst < e.burstSize);
                    const id = e.recruited ? e.equippedWeaponId : null;
                    const crouch = !!(e.recruited && this.crewSneaking && this.crewSneaking() && this.activeMap.id !== 'apt_949');
                    return {
                        ...app, skinColor: app.skinColor || '#c68642', gender: app.gender || 'female',
                        stance: fighting ? stanceForWeapon(id) : 'idle',
                        pose: e._idlePose || app.pose || (crouch ? 'sneak' : undefined),
                        poseWhileMoving: crouch && !e._idlePose && !app.pose,
                        kick: fighting ? shotKick(proxy) : 0, weapon: id ? { id, ready: fighting } : null,
                        top: app.top || { type: 'suit', color: '#2a0a3a' }, bottom: app.bottom || { type: 'pants', color: '#1a0820' },
                        shoes: app.shoes || { type: 'boots', color: '#333' }, hair: app.hair || { type: 'short', color: '#111' },
                        hat: app.hat || null, noShadow: true
                    };
                }
                if (e.look) {
                    const sceneActor = typeof SceneActor !== 'undefined' && e instanceof SceneActor;
                    return { stance: 'idle', ...e.look,
                        ...(sceneActor ? { pose: e.path ? undefined : (e.pose || undefined) } : {}), noShadow: true };
                }
                // Drones and heavy automata have separate artwork; do not substitute human bodies.
                return null;
            },

            /** Detailed actor art reflected about the ground beneath its body, at current facing. */
            _drawUltraReflectionWalker(ctx, e, alpha = 0.58, mark = null, crowd = false) {
                if (!e || e.dead || e.visible === false || e.inCar || e === this.player && this.isDriving) return false;
                if (e.invincibleTimer > 0 && e.invincibleTimer % 6 < 3) return false;
                let angle = e.angle || 0, sx = 1, sy = 1, fade = e.life === undefined ? 1 : Math.max(0, Math.min(1, e.life));
                const ped = typeof Pedestrian !== 'undefined' && e instanceof Pedestrian;
                if (ped && e.state === 'sprawled') { sx = 1.1; sy = 0.55; }
                else if (ped && e.state === 'recovering') { const t = 1 - e.recoverTimer / 24; sx = 1.1 - 0.1 * t; sy = 0.55 + 0.45 * t; }
                // its box: the art's circle (turned, stretched up to 1.1), mirrored about the feet; none of it over
                // wet ground: nothing to paint (and nothing for a silhouette to block either)
                const radius = 96, quality = this._ultraArtScale(), rb = radius * Math.max(sx, sy, 1);
                const bx0 = e.x - rb, by0 = e.y + 12 - 0.8 * (rb + 12), bx1 = e.x + rb, by1 = e.y + 12 + 0.8 * (rb + 12);
                if (!this._ultraOnWet(bx0, by0, bx1, by1)) return true;
                // Body parts sometimes set their own alpha (weapons, glow, jewellery). Render them into the
                // actor's own art canvas, then apply reflection opacity to the complete result. Stella's every
                // frame; everyone else's every ULTRA_REPAINT_MS, turned and placed live in between.
                const art = this._ultraArtFor(e, radius * 2 * quality, radius * 2 * quality, e === this.player);
                let gait = null;
                if (art.due) {
                    const proxy = this._ultraReflectionWalkerProxy(e);
                    const cfg = this._ultraReflectionWalkerConfig(e, proxy);
                    art.hasArt = !!cfg;
                    if (cfg) {
                        gait = syncHumanoidGait(proxy);
                        proxy.angle = this._ultraWalkerAngle(e, gait, cfg);
                        const paint = art.cv.getContext('2d');
                        paint.setTransform(1, 0, 0, 1, 0, 0);
                        paint.clearRect(0, 0, art.cv.width, art.cv.height);
                        paint.globalAlpha = 1; paint.globalCompositeOperation = 'source-over';
                        paint.filter = 'none'; paint.shadowBlur = 0;
                        paint.shadowOffsetX = paint.shadowOffsetY = 0;
                        paint.setLineDash([]);
                        paint.setTransform(quality, 0, 0, quality, radius * quality, radius * quality);
                        // The crowd's reflections replay its baked walk (ui/crowd-impostors.js: one bake a frame, live until then):
                        // in rippling water, squashed and faint, nobody can tell, and it's one stamp instead of a whole body
                        // (its owner's bake, so the street's own baked crowd and its reflection share one, and any pace will do)
                        const stamped = crowd && CrowdImpostors.draw(paint, proxy, cfg, e, true);
                        if (!stamped) _drawProceduralHumanoid(paint, proxy, cfg);
                        art.ext = stamped ? CROWD_BAKE.R : radius;   // (a stamp keeps inside its bake's cell: a far smaller rect to lay down)
                        art.cfgIdle = cfg.idleAngle;
                    }
                    this._ultraArtPainted(art);
                }
                if (!art.hasArt) return false;
                angle = this._ultraWalkerAngle(e, gait || e._gait, { idleAngle: art.cfgIdle });
                if (ped) {
                    if (e.state === 'sprawled') fade *= 0.92;
                    else if (e.state === 'recovering') fade *= 0.92 + 0.08 * (1 - e.recoverTimer / 24);
                }
                if (e === this.player && (e.isHidden || this.flitState && this.flitState.active)) fade *= 0.5;
                ctx.globalAlpha = alpha * fade;
                // Mirror the body below its feet; compensate rotation so its world heading stays the same;
                // flip the sideways artwork while preserving its forward facing (ctx: the detail layer, in this._ultraView)
                UltraM.from(this._ultraView).t(e.x, e.y + 12).s(1, -0.8).t(0, -12).r(-angle).s(1, -1);
                if (sx !== 1 || sy !== 1) UltraM.s(sx, sy);
                UltraM.put(ctx);
                ctx.drawImage(art.cv, -radius, -radius, radius * 2, radius * 2);
                if (mark) {
                    const re = (art.ext || radius) * Math.max(sx, sy, 1);
                    mark(e.x - re, e.y + 12 - 0.8 * (re + 12), e.x + re, e.y + 12 + 0.8 * (re + 12));
                }
                return true;
            },

            /** Which way a reflected body faces (live every frame, whether or not its art repaints) */
            _ultraWalkerAngle(e, gait, cfg) {
                if (typeof Pedestrian !== 'undefined' && e instanceof Pedestrian) {
                    if (e.state === 'sprawled') return e.sprawlAngle;
                    if (e.state === 'recovering') return e.sprawlAngle + (e.facingAngle - e.sprawlAngle) * (1 - e.recoverTimer / 24);
                    return e.facingAngle || 0;
                }
                if (typeof NPC !== 'undefined' && e instanceof NPC) {
                    if (e.combatTargetTimer > 0 && e.combatTargetAngle !== undefined) return e.combatTargetAngle;
                    if (gait && gait.speed > 0.1) return Math.atan2(gait.dirY, gait.dirX);
                    if (e.role === 'teammate' && (e.hired || e.recruited) && this.player)
                        return Math.atan2(this.player.y - e.y, this.player.x - e.x);
                    return cfg && cfg.idleAngle !== undefined ? cfg.idleAngle : 0;
                }
                return e.angle || 0;
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
                const lookCol = (e) => { const L = e.look || e.appearance; return (L && topColor(L.top)) || null; };
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
                if (m.kind === 'walker' || m.kind === 'crowd') {
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
                const wet = this._wetHere(), surf = this._surfaces(), ultra = this.reflectQuality() === 'ultra';
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
                    if (!surf.mirror && !ultra) {
                        movers = this._reflMovers(near, buffer);
                        ctx.fillStyle = 'rgba(2, 1, 6, 1)'; for (const m of movers) this._reflShape(ctx, m, 0.26);
                    }
                    ctx.restore(); ctx.globalAlpha = 1;
                    if (wet < 0.02) { this._drawRipples(ctx, true); return; }
                }
                const night = Math.min(1, Math.max(0, (this.getAmbientDarkness() - 0.15) / 0.35)), day = 1 - night;
                const clip = new Path2D();
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
                    // Water darkens its bed at night and catches the pale sky by day.
                    // Both fade into damp pavement, with a faint meniscus instead of a hard outline.
                    _drawBakedPuddle(ctx, p, _bakedPuddle(p, 'ground', z > 1.25 ? 2 : 1, g,
                        'night', 0.55 * k * night, 'day', day > 0.01 ? 0.3 * k * day : 0, 'rim', 0.045 * k * Math.min(1, wet * 1.5)));
                    clip.addPath(path); n++;
                }
                if (n) {
                    // the mirrored shapes of whoever stands at the water, and the rings on it
                    ctx.save(); ctx.clip(clip);
                    if (!ultra) {
                        if (!movers) movers = this._reflMovers(near, buffer);
                        ctx.fillStyle = night > 0.5 ? 'rgba(2, 1, 6, 1)' : 'rgba(26, 22, 36, 1)';
                        for (const m of movers) this._reflShape(ctx, m, 0.42 + 0.2 * day);
                        for (const m of movers) if (m.col && /^#[0-9a-f]{6}$/i.test(m.col)) { ctx.fillStyle = m.col; this._reflShape(ctx, m, 0.12); }
                    }
                    this._drawRipples(ctx, night > 0.5);
                    ctx.restore();
                    ctx.globalAlpha = 1;
                    // The feathered meniscus is already painted with the puddle.

                }
                ctx.restore();
                if ((this._renderDrawId & 63) === 0) this._releasePuddleArt(_frameTime - 3000);
            },

            /** Baked puddles not seen since `before` (all of them without it) give up their canvases */
            _releasePuddleArt(before = Infinity) {
                for (const [p, rec] of _puddleArts) {
                    for (const slot in rec) if (rec[slot].used < before) delete rec[slot];
                    if (!Object.keys(rec).length) _puddleArts.delete(p);
                }
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
                if (F.q === 'ultra' && F.D) {
                    // The same horizontal water movement is applied to colour and light.
                    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.95;
                    for (const r of F.Drs) this._drawUltraReflectionBands(ctx, F.D, W, H, REFLECT.BANDS * 2, r);
                }
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.95;
                if (F.q === 'ultra') this._drawUltraReflectionBands(ctx, R, W, H, REFLECT.BANDS, null);
                else if (F.q === 'high') {
                    const rain = this.weather && this.weather.isRaining ? this.weather.intensity : 0;
                    const n = REFLECT.BANDS, bh = R.height / n, t = _gameTimeSec, amp = (1.2 + rain * 3.2) * (W / R.width) * 0.5;
                    for (let i = 0; i < n; i++) {
                        const sy = i * bh, dx = Math.sin(t * 2.1 + i * 0.9) * amp + Math.sin(t * 5.3 + i * 2.7) * amp * 0.35 * rain;
                        ctx.drawImage(R, 0, sy, R.width, bh, dx, sy * H / R.height, W, bh * H / R.height + 1);
                    }
                } else ctx.drawImage(R, 0, 0, W, H);
                ctx.restore();
            },

            /** Ultra's water shimmer: `n` bands across the screen, each slid sideways by the wave at its height (the same
                wave for the full-size detail and the half-size lights, whatever their band count); only the rows and
                columns of `rect` (screen px) when given: where the detail layer has anything. */
            _drawUltraReflectionBands(ctx, cv, W, H, n, rect) {
                const rain = this.weather && this.weather.isRaining ? this.weather.intensity : 0;
                const t = _gameTimeSec, amp = 0.6 + rain * 1.6, k = cv.height / H, kx = cv.width / W;
                n = Math.min(n, H);
                const x0 = rect ? rect.x0 : 0, x1 = rect ? rect.x1 : W;
                for (let i = 0; i < n; i++) {
                    let y0 = Math.floor(i * H / n), y1 = Math.floor((i + 1) * H / n);
                    if (rect) { if (y1 <= rect.y0 || y0 >= rect.y1) continue; y0 = Math.max(y0, rect.y0); y1 = Math.min(y1, rect.y1); }
                    const u = (Math.floor(i * H / n) + Math.floor((i + 1) * H / n)) / 2 / H * REFLECT.BANDS * 2;   // its place in 60 bands
                    const dx = Math.sin(t * 2.1 + u * 0.45) * amp
                        + Math.sin(t * 5.3 + u * 1.35) * amp * 0.35 * rain;
                    ctx.drawImage(cv, x0 * kx, y0 * k, (x1 - x0) * kx, (y1 - y0) * k, x0 + dx, y0, x1 - x0, y1 - y0);
                }
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
