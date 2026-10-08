        /* =====================================================================
           MOON CITY — the nightclub on the hub (style 'moon_city')
           ---------------------------------------------------------------------
           In the house's own colours (the interior's brand): black lacquer walls
           ribbed with violet neon fins and gold cornices, a smoked-glass skylight
           over the dance floor that shows the floor's lights pulsing beneath it,
           a gold crescent on the roof, two slow searchlights, "Moon City" in
           script neon. At the door: a rose-velvet canopy on gold posts, a red
           carpet, velvet ropes on gold stanchions, a crimson pool of light, a
           little low mist, a bouncer in black and gold, and a queue that moves.
           The lights keep time with the club (clubBeatN; the real kick when the
           muffled track can be heard outside, audio/audio.js MAP_MUSIC).
           Same footprint and door as the old block, so nothing else moves.
           Hooks: building-v2.js (_applyStyle, lights, faces, roof, sign,
           emissive), engine/draw.js (ground), engine/map-loading.js (forecourt).
           ===================================================================== */
        /** Conservative viewport test for decorative bodies/effects that bypass normal actor culling.
         * The 160-unit reach exceeds current poses, maximum stride, tendrils, cloth trains and
         * umbrellas, with a warm-up margin. Body/head build scales and effect stretch are included.
         * Armed or unknown/custom looks retain the original draw path; their extent is not assumed.
         */
        function decorativeBodyInView(x, y, look, effectScale = 1, glowRadius = 0) {
            const cb = typeof game !== 'undefined' && game._cullBounds && game._cullBounds.view;
            if (!cb || !Number.isFinite(x) || !Number.isFinite(y) || !look) return true;
            if (x >= cb.left && x <= cb.right && y >= cb.top && y <= cb.bottom) return true;
            const height = look.height || 1, build = look.build && BUILDS[look.build];
            if (!Number.isFinite(height) || height <= 0 || (look.build && !build) || look.weapon) return true;
            if (look.pose && look.pose !== 'none' && !POSES[look.pose]) return true;
            if (look.body && look.body.kind !== 'android') return true;
            if (look.hair && !HAIR_RENDERERS[look.hair.type]) return true;
            for (const pair of [['hat', 'hats'], ['top', 'tops'], ['bottom', 'bottoms'], ['shoes', 'shoes']]) {
                const piece = look[pair[0]];
                if (piece && !WARDROBE[pair[1]][piece.type]) return true;
            }
            if (look.train && look.train.type !== 'dress_train' && look.train.type !== 'silk_flow') return true;
            if (look.jewelry && (!Array.isArray(look.jewelry) || look.jewelry.some(j => !j || !WARDROBE.jewelry[j.type]))) return true;
            if (look.held && !['glass', 'champagne_glass', 'umbrella'].includes(look.held.type)) return true;
            if (look.held && look.held.drink && !GLASS_DRINKS[look.held.drink]) return true;
            // Custom geometry controls are deliberately outside the bounded draw path.
            if (look.isDriving || look.isShootingFromCar ||
                ['recoil', 'kick', 'scopeK', 'lerpSpeed', 'punchTicks'].some(k => look[k] !== undefined)) return true;
            if (look.held && look.held.type === 'umbrella' && look.held.open !== undefined &&
                (!Number.isFinite(look.held.open) || look.held.open < 0 || look.held.open > 1)) return true;
            const breadth = build ? Math.max(build.w, build.d, build.head) : 1;
            const hover = look.body && look.body.hover ? 1.035 : 1;
            const zoom = game.view && game.view.zoom > 0 ? game.view.zoom : 1;
            // Contact shadows and the scene's small notepad stay unscaled even on tiny bodies.
            const radius = Math.max(160 * height * breadth * hover * effectScale, glowRadius, 48) + 60 / zoom;
            const epsilon = 1e-7 * Math.max(1, Math.abs(x), Math.abs(y), radius);
            return !(x + radius < cb.left - epsilon || x - radius > cb.right + epsilon ||
                     y + radius < cb.top - epsilon || y - radius > cb.bottom + epsilon);
        }

        /** Preserve hidden decorative-body gait, pose clocks and random seeds in draw order.
         * Hair/cloth/slosh pause outside the warm-up margin, as with normally culled actors.
         * Advancing their clocks avoids a 12-slice catch-up burst when the body returns.
         */
        function tickHiddenDecorativeBody(entity, look) {
            RenderStats.culled++;
            // Weather initializes its seed before pose/blink seeds and advances lightning
            // reactions even for a hidden outdoor body; preserve that order and state.
            if (!look.isDriving) weatherAt(entity);
            const gait = syncHumanoidGait(entity);
            if (!look.isDriving && look.pose !== 'none') {
                const ps = entity._pose || (entity._pose = { still: 0, t: 0, name: null, w: 0, last: _gameTimeSec, seed: Math.random() * 97 });
                const dt = Math.max(0, Math.min(0.1, _gameTimeSec - ps.last));
                ps.last = _gameTimeSec;
                const moving = gait.speed > 0.15;
                ps.still = moving ? 0 : ps.still + dt;
                const name = POSES[look.pose] ? look.pose : 'idle';
                if (name !== ps.name) { ps.name = name; ps.t = 0; }
                ps.t += dt;
                const target = look.poseWhileMoving || (!moving && ps.still > 0.4) ? 1 : 0;
                ps.w += (target - ps.w) * Math.min(1, dt * (target ? 3 : 10));
                if (look.poseInstant) ps.w = target;
            }
            if (entity._blinkSeed === undefined) entity._blinkSeed = Math.floor(Math.random() * 997);
            const held = look.held;
            if (!look.isDriving && held && (held.type === 'glass' || held.type === 'champagne_glass')) {
                const drink = GLASS_DRINKS[held.drink || 'champagne'] || GLASS_DRINKS.champagne;
                if (drink.glass !== 'mug' && entity._glintPhase === undefined) entity._glintPhase = Math.random() * 60;
            }
            if (entity._hairSim) { entity._hairSim.t = _gameTimeSec; entity._hairSim.acc = 0; }
            if (entity._cloth) for (const sim of Object.values(entity._cloth)) { sim.t = _gameTimeSec; sim.acc = 0; }
            if (entity._glassSlosh) { entity._glassSlosh.t = _gameTimeSec; entity._glassSlosh.acc = 0; }
        }

        const MCX = {
            CANOPY_Z: 12, SIGN_Z: 24, FIN: 46,
            C: {
                lacquer: '#0b0810', plum: '#1a1022', wall: '#140c1a', fin: '#2a1a36',
                violet: '#8a5cff', lavender: '#c8a8ff', lilac: '#e8d8ff',
                gold: '#e8c27a', goldDk: '#a8823e', goldLt: '#fff1c2',
                rose: '#ff5a8a', velvet: '#5a0c34', velvetLt: '#8a1a52', crimson: '#ff3a6a', marble: '#0e0a12'
            }
        };

        /** A crescent moon at (x, y), radius r, horns turned by `rot`. */
        function _mcCrescent(ctx, x, y, r, rot = -0.5) {
            ctx.beginPath();
            ctx.arc(x, y, r, rot + 0.35, rot + Math.PI * 2 - 0.35);
            ctx.arc(x + Math.cos(rot) * r * 0.42, y + Math.sin(rot) * r * 0.42, r * 0.78, rot + Math.PI * 2 - 0.62, rot + 0.62, true);
            ctx.closePath();
        }

        Object.assign(BuildingV2.prototype, {
            /** Footprint pieces in world space (made once). */
            _mcGeo() {
                if (this._mcG) return this._mcG;
                const X = this.x, Y = this.y, hall = this.sections[0], wing = this.sections[1] || hall;
                const wb = Y + wing.y + wing.h, dx = X + wing.x + wing.w / 2;
                return (this._mcG = {
                    hall: { x: X + hall.x, y: Y + hall.y, w: hall.w, h: hall.h },
                    wing: { x: X + wing.x, y: Y + wing.y, w: wing.w, h: wing.h },
                    door: { x: dx, y: wb },
                    sky: { cx: X + hall.x + hall.w * 0.55, cy: Y + hall.y + hall.h * 0.5, rx: hall.w * 0.3, ry: hall.h * 0.3 },
                    moon: { x: X + hall.x + hall.w * 0.88, y: Y + hall.y + hall.h * 0.24 },
                    medal: { x: X + wing.x + wing.w * 0.42, y: Y + wing.y + wing.h * 0.5, r: Math.min(wing.w, wing.h) * 0.3 },
                    sign: { x: X + hall.x + (wing.w + hall.w) / 2, y: Y + hall.y + hall.h + 10 },
                    court: { x: dx - 110, y: wb, w: 220, h: 104 },
                    queue: [0, 1, 2, 3, 4, 5].map(i => [dx + 64, wb + 22 + i * 17])
                });
            },

            /** Kept clear of street trees and lamps (engine/map-loading.js). */
            _mcForecourt() { const c = this._mcGeo().court; return { x: c.x - 30, y: c.y - 10, w: c.w + 60, h: c.h + 90 }; },   // (the carpet's end too)

            /** Hidden lights: the crimson pool at the door, the canopy, violet uplights, the sign's spill. */
            _mcLights() {
                const G = this._mcGeo(), C = MCX.C;
                const L = (x, y, color, r) => { const l = new LampEntity({ x, y, lampType: 4, color, lightRadius: r }); l.visible = false; l.keepColor = true; this.attachedLights.push(l); };
                L(G.door.x, G.door.y + 26, C.crimson, 230);
                L(G.door.x, G.door.y + 4, '#ffc890', 150);
                L(G.sign.x, G.sign.y + 10, C.lilac, 210);
                for (const u of [0.15, 0.5, 0.85]) L(G.wing.x + G.wing.w + (G.hall.w - G.wing.w) * u, G.hall.y + G.hall.h + 6, '#b48cff', 170);
                for (const u of [0.25, 0.75]) L(G.hall.x + G.hall.w * u, G.hall.y - 6, '#b48cff', 160);
                L(G.wing.x + G.wing.w + 6, G.wing.y + G.wing.h * 0.5, C.rose, 150);
            },

            /** The club's beat: count, position in the beat, the kick, and this bar's colour. */
            _mcBeat() {
                const n = typeof clubBeatN === 'function' ? clubBeatN() : _gameTimeSec * 140 / 60;
                const beat = ((n % 1) + 1) % 1, bar = Math.floor(n / 8);
                return { n, beat, bar, kick: Math.pow(1 - beat, 3) };
            },

            /** A wall: lacquer between violet neon fins, smoked-glass bands, gold cornices. Each kind on a face goes out
                as one path (panes, fins; nothing of one kind touches), the fins at night one stroke a fin (each breathes
                on its own). */
            _mcFace(ctx, f, P, emissive) {
                if (f.side === 'C') return;
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                if (Math.hypot(dx - ax, dy - ay) < 4) return;
                const at = (u, v) => { const x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u, x1 = dx + (cx - dx) * u, y1 = dy + (cy - dy) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
                const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / MCX.FIN)), C = MCX.C;
                const quad = (path, u0, u1, v0, v1) => { const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1); path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath(); return path; };
                const seg = (path, u0, v0, u1, v1) => { const a = at(u0, v0), b = at(u1, v1); path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); return path; };
                const panes = new Path2D();
                for (let i = 0; i < n; i++) quad(panes, (i + 0.18) / n, (i + 0.82) / n, 0.32, 0.72);
                if (!emissive) {
                    // smoked glass between the fins
                    const sun = sunNow(), day = sun ? sun.day : 0;
                    ctx.fillStyle = 'rgba(12, 6, 20, 0.92)'; ctx.fill(panes);
                    if (day > 0.05) { ctx.fillStyle = `rgba(168, 160, 220, ${0.22 * day})`; ctx.fill(panes); }
                    const fins = new Path2D();
                    for (let i = 0; i <= n; i++) seg(fins, i / n, 0.06, i / n, 0.96);
                    ctx.lineWidth = 2.2; ctx.strokeStyle = C.fin; ctx.stroke(fins);                                   // the fins
                    ctx.lineWidth = 1.4; ctx.strokeStyle = C.goldDk; ctx.stroke(seg(new Path2D(), 0, 0.97, 1, 0.97));   // gold cornice and plinth
                    ctx.lineWidth = 0.8; ctx.stroke(seg(new Path2D(), 0, 0.06, 1, 0.06));
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.25)'; ctx.stroke(seg(new Path2D(), 0, 0.8, 1, 0.8));
                    return;
                }
                // At night: the fins breathe violet and lavender, pumping on the kick
                const B = this._mcBeat(), t = _gameTimeSec, op = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = `rgba(200, 168, 255, ${0.07 + 0.05 * B.kick})`; ctx.fill(panes);                    // a lavender glow behind the glass
                for (let i = 0; i <= n; i++) {
                    const a = 0.32 + 0.22 * Math.sin(t * 0.9 + i * 0.8) + 0.35 * B.kick, fin = seg(new Path2D(), i / n, 0.08, i / n, 0.94);
                    ctx.lineWidth = 2.6; ctx.strokeStyle = `rgba(138, 92, 255, ${Math.max(0, a) * 0.7})`; ctx.stroke(fin);
                    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(232, 216, 255, ${Math.max(0, a)})`; ctx.stroke(fin);
                }
                ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255, 241, 194, 0.55)`; ctx.stroke(seg(new Path2D(), 0, 0.97, 1, 0.97));   // the cornice catches gold
                ctx.globalCompositeOperation = op;
            },

            /** The roof (drawn in the roof plane): lacquer decks, gold parapets, the skylight, the crescent. */
            _mcDrawRoof(ctx, emissive) {
                const G = this._mcGeo(), C = MCX.C, S = G.sky;
                if (!emissive) {
                    for (const s of [G.hall, G.wing]) {
                        ctx.fillStyle = LandmarkKit.grad(this, 'mcroof' + s.y, () => { const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h); g.addColorStop(0, '#171020'); g.addColorStop(1, C.lacquer); return g; });
                        ctx.fillRect(s.x, s.y, s.w, s.h);
                        ctx.strokeStyle = 'rgba(232, 194, 122, 0.06)'; ctx.lineWidth = 1;                // lacquer panels
                        for (let gx = 50; gx < s.w; gx += 50) { ctx.beginPath(); ctx.moveTo(s.x + gx, s.y); ctx.lineTo(s.x + gx, s.y + s.h); ctx.stroke(); }
                        ctx.strokeStyle = C.goldDk; ctx.lineWidth = 3; ctx.strokeRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
                        ctx.strokeStyle = 'rgba(255, 241, 194, 0.35)'; ctx.lineWidth = 0.8; ctx.strokeRect(s.x + 6, s.y + 6, s.w - 12, s.h - 12);
                    }
                    // The skylight over the dance floor: smoked glass in a gold ring, its leading in rays
                    ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.rx, S.ry, 0, 0, Math.PI * 2);
                    ctx.fillStyle = '#0d0814'; ctx.fill();
                    const sun = sunNow(), day = sun ? sun.day : 0;
                    if (day > 0.05) {                                                               // by day it holds the sky
                        ctx.fillStyle = LandmarkKit.grad(this, 'mcsky', () => { const g = ctx.createLinearGradient(S.cx - S.rx, S.cy - S.ry, S.cx + S.rx, S.cy + S.ry); g.addColorStop(0, 'rgba(190, 186, 236, 1)'); g.addColorStop(0.5, 'rgba(120, 110, 180, 1)'); g.addColorStop(1, 'rgba(60, 40, 100, 1)'); return g; });
                        ctx.globalAlpha = 0.35 * day; ctx.fill(); ctx.globalAlpha = 1;
                    }
                    ctx.save(); ctx.clip();
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.35)'; ctx.lineWidth = 1;
                    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(S.cx, S.cy); ctx.lineTo(S.cx + Math.cos(a) * S.rx * 1.2, S.cy + Math.sin(a) * S.ry * 1.2); ctx.stroke(); }
                    ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.rx * 0.55, S.ry * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                    ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.rx, S.ry, 0, 0, Math.PI * 2);
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke();
                    ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.rx + 5, S.ry + 5, 0, 0, Math.PI * 2); ctx.strokeStyle = C.goldDk; ctx.lineWidth = 1; ctx.stroke();
                    // The VIP wing: a gold medallion, the house crescent at its heart, rays of gold leaf
                    const M = G.medal;
                    ctx.beginPath(); ctx.arc(M.x, M.y, M.r, 0, Math.PI * 2); ctx.fillStyle = '#100a16'; ctx.fill();
                    ctx.strokeStyle = C.goldDk; ctx.lineWidth = 2; ctx.stroke();
                    ctx.beginPath(); ctx.arc(M.x, M.y, M.r - 6, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(232, 194, 122, 0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.3)';
                    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r0 = M.r * 0.42, r1 = M.r - 9; ctx.beginPath(); ctx.moveTo(M.x + Math.cos(a) * r0, M.y + Math.sin(a) * r0); ctx.lineTo(M.x + Math.cos(a) * r1, M.y + Math.sin(a) * r1); ctx.stroke(); }
                    ctx.fillStyle = C.gold; _mcCrescent(ctx, M.x, M.y, M.r * 0.32); ctx.fill();
                    // The gold crescent on its plinth
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; _mcCrescent(ctx, G.moon.x + 3, G.moon.y + 4, 26); ctx.fill();
                    ctx.fillStyle = LandmarkKit.grad(this, 'mcmoon', () => { const g = ctx.createLinearGradient(G.moon.x - 26, G.moon.y - 26, G.moon.x + 26, G.moon.y + 26); g.addColorStop(0, C.goldLt); g.addColorStop(0.5, C.gold); g.addColorStop(1, C.goldDk); return g; });
                    _mcCrescent(ctx, G.moon.x, G.moon.y, 26); ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
                    // Discreet plant: black lacquer units edged in gold
                    for (const [x, y, w, h] of [[G.hall.x + 40, G.hall.y + 30, 46, 30], [G.hall.x + 100, G.hall.y + 30, 24, 24], [G.wing.x + 190, G.wing.y + 40, 40, 28]]) {
                        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 3, w, h);
                        ctx.fillStyle = '#100a16'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(168, 130, 62, 0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
                    }
                    return;
                }
                // Night: the dance floor glows up through the skylight, in the club's colours, on the beat
                const B = this._mcBeat(), op = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                ctx.save(); ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.rx - 2, S.ry - 2, 0, 0, Math.PI * 2); ctx.clip();
                const cell = 26, base = ctx.globalAlpha;
                for (let gx = S.cx - S.rx; gx < S.cx + S.rx; gx += cell) for (let gy = S.cy - S.ry; gy < S.cy + S.ry; gy += cell) {
                    const i = Math.round((gx - S.cx) / cell), j = Math.round((gy - S.cy) / cell);
                    const pat = B.bar % 4, ph = pat === 0 ? Math.hypot(i, j) * 0.5 - B.n * 0.5 : pat === 1 ? (i + j) * 0.35 - B.n : pat === 2 ? ((i + j + Math.floor(B.n)) % 2) * 2 : Math.atan2(j, i) * 2 + B.n;
                    const a = 0.25 + 0.25 * Math.sin(ph * Math.PI) + 0.35 * B.kick;
                    ctx.globalAlpha = base * Math.max(0, a) * 0.55;
                    ctx.fillStyle = `rgb(${CLUB_PAL[(Math.abs(i * 3 + j) + B.bar) % 4]})`;
                    ctx.fillRect(gx + 2, gy + 2, cell - 4, cell - 4);
                }
                ctx.restore(); ctx.globalAlpha = base;
                ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.rx, S.ry, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 241, 194, ${0.5 + 0.3 * B.kick})`; ctx.lineWidth = 2; ctx.stroke();
                // The medallion glows rose at its heart
                glowA(ctx, G.medal.x, G.medal.y, G.medal.r * 1.3, '255, 90, 140', base * (0.35 + 0.25 * B.kick));
                ctx.globalAlpha = base;
                // The crescent's lavender halo
                glowA(ctx, G.moon.x, G.moon.y, 70, '200, 168, 255', base * (0.55 + 0.2 * Math.sin(_gameTimeSec * 0.6)));
                ctx.globalAlpha = base; ctx.fillStyle = 'rgba(255, 241, 194, 0.55)'; _mcCrescent(ctx, G.moon.x, G.moon.y, 26); ctx.fill();
                ctx.globalCompositeOperation = op;
            },

            /** Two slow searchlights from the roof, violet and rose, sweeping the night sky. */
            _mcBeams(ctx, dark) {
                if (dark < 0.25 || _zoomLOD >= 2) return;
                const G = this._mcGeo(), t = _gameTimeSec, k = 1 + this._leanScale();
                ctx.save(); LandmarkKit.plane(ctx, k); ctx.globalCompositeOperation = 'lighter';
                for (const [x, y, rgb, ph] of [[G.hall.x + 70, G.hall.y + 60, '170, 130, 255', 0], [G.hall.x + G.hall.w - 50, G.hall.y + G.hall.h - 40, '255, 90, 140', 2.4]]) {
                    const a = Math.sin(t * 0.22 + ph) * 1.1 + ph, L = 560, w = 0.08;
                    const g = ctx.createRadialGradient(x, y, 4, x, y, L);
                    g.addColorStop(0, `rgba(${rgb}, ${0.22 * dark})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
                    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, L, a - w, a + w); ctx.closePath(); ctx.fill();
                    glowA(ctx, x, y, 16, rgb, 0.8 * dark); ctx.globalAlpha = 1;
                }
                ctx.restore();
            },

            /** The rose-velvet canopy over the door on gold posts, its front edge scalloped; bulbs at night. */
            _mcDrawCanopy(ctx, emissive) {
                const G = this._mcGeo(), C = MCX.C, cam = game.camera, k = LandmarkKit.k(MCX.CANOPY_Z);
                const x0 = G.door.x - 62, x1 = G.door.x + 62, y0 = G.door.y - 4, y1 = G.door.y + 44;
                const Pk = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                if (!emissive) {
                    ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 2;                            // posts, ground to canopy
                    for (const x of [x0 + 6, x1 - 6]) { const [px, py] = Pk(x, y1 - 4); ctx.beginPath(); ctx.moveTo(x, y1 - 4); ctx.lineTo(px, py); ctx.stroke(); }
                    ctx.restore();
                }
                LandmarkKit.flat(ctx, k, (c) => {
                    if (!emissive) {
                        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0 + 4, y0 + 6, x1 - x0, y1 - y0);
                        const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, C.velvet); g.addColorStop(0.6, C.velvetLt); g.addColorStop(1, C.velvet);
                        c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1 - 6);
                        for (let x = x1; x > x0; x -= 12) c.quadraticCurveTo(x - 6, y1 + 4, x - 12, y1 - 6);     // scalloped valance
                        c.closePath(); c.fill();
                        c.strokeStyle = C.gold; c.lineWidth = 1.4; c.stroke();
                        c.strokeStyle = 'rgba(255, 241, 194, 0.25)'; c.lineWidth = 0.8;                       // velvet pleats
                        for (let x = x0 + 10; x < x1; x += 10) { c.beginPath(); c.moveTo(x, y0 + 2); c.lineTo(x, y1 - 8); c.stroke(); }
                        c.fillStyle = C.gold; _mcCrescent(c, G.door.x, (y0 + y1) / 2 - 2, 9); c.fill();          // the crescent on the canopy
                    } else {
                        const t = _frameTime / 1000;                                                    // marquee bulbs along the valance
                        c.globalCompositeOperation = 'lighter';
                        for (let x = x0 + 6, i = 0; x < x1; x += 12, i++) {
                            const tw = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.3);
                            c.globalAlpha = tw; c.fillStyle = '#ffe8f0'; c.beginPath(); c.arc(x, y1 - 3, 1.6, 0, Math.PI * 2); c.fill();
                            if (_zoomLOD < 1) { c.globalAlpha = tw * 0.35; drawGlow(c, x, y1 - 3, 7, '255, 180, 210', 0); }
                        }
                        c.globalAlpha = 0.9; c.fillStyle = 'rgba(255, 241, 194, 0.8)'; _mcCrescent(c, G.door.x, (y0 + y1) / 2 - 2, 9); c.fill();
                    }
                });
            },

            /** "Moon City" in script neon on the hall's front, the crescent beside it, NIGHTCLUB in gold beneath. */
            _mcDrawSign(ctx, emissive, dark = 0) {
                const G = this._mcGeo(), C = MCX.C, k = LandmarkKit.k(MCX.SIGN_Z), x = G.sign.x, y = G.sign.y;
                const t = _frameTime / 1000, flick = (t % 7.3) < 0.12 ? 0.35 : (t % 11.1) < 0.06 ? 0.6 : 1;
                LandmarkKit.flat(ctx, k, (c) => {
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.font = "46px 'Great Vibes', cursive";
                    if (!emissive) {
                        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText('Moon City', x + 2, y + 3);
                        c.fillStyle = '#d8c8f0'; c.fillText('Moon City', x, y);
                        c.fillStyle = C.gold; _mcCrescent(c, x - 118, y - 4, 13); c.fill();
                        c.font = '600 9px Montserrat, sans-serif'; c.fillStyle = C.goldDk;
                        c.fillText('N I G H T C L U B', x, y + 26);
                        return;
                    }
                    const a = Math.max(0.15, Math.min(1, dark * 1.3)) * flick;
                    c.globalCompositeOperation = 'lighter';
                    if (_zoomLOD < 1) { c.globalAlpha = a * 0.5; drawGlow(c, x, y, 150, '255, 120, 180', 0); }
                    c.globalAlpha = a; c.shadowColor = C.rose; c.shadowBlur = _zoomLOD < 1 ? 16 : 0;
                    c.fillStyle = '#ffb8d4'; c.fillText('Moon City', x, y);
                    c.shadowBlur = 0; c.fillStyle = 'rgba(255, 244, 250, 0.9)'; c.fillText('Moon City', x, y);
                    c.fillStyle = C.goldLt; _mcCrescent(c, x - 118, y - 4, 13); c.fill();
                    if (_zoomLOD < 1) { c.globalAlpha = a * 0.6; drawGlow(c, x - 118, y - 4, 26, '232, 194, 122', 0); }
                    c.globalAlpha = a * 0.85; c.font = '600 9px Montserrat, sans-serif'; c.fillStyle = C.gold;
                    c.fillText('N I G H T C L U B', x, y + 26);
                });
            },

            /** The forecourt: marble, gold crescents, the red carpet, the ropes (baked); the pool, mist, bouncer and queue (live). */
            _mcDrawGround(ctx) {
                const G = this._mcGeo(), Q = G.court, C = MCX.C;
                const spr = LandmarkKit.sprite(this, 'mcground', Q.x, Q.y, Q.w, Q.h, 2, (c) => {
                    c.fillStyle = C.marble; c.fillRect(Q.x, Q.y, Q.w, Q.h);
                    const r = seededRandom('mccourt');
                    c.strokeStyle = 'rgba(200, 168, 255, 0.07)'; c.lineWidth = 0.8;                       // veining
                    for (let i = 0; i < 14; i++) { const x = Q.x + r() * Q.w, y = Q.y + r() * Q.h; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 20, y + r() * 30, x + 40, y - r() * 20, x + 70, y + r() * 25); c.stroke(); }
                    c.strokeStyle = 'rgba(168, 130, 62, 0.55)'; c.lineWidth = 1; c.strokeRect(Q.x + 6, Q.y + 3, Q.w - 12, Q.h - 8);   // a fine gold inlay border
                    for (const sx of [-1, 1]) { c.fillStyle = 'rgba(232, 194, 122, 0.55)'; _mcCrescent(c, G.door.x + sx * 82, Q.y + 58, 13, sx < 0 ? 0.6 : Math.PI - 0.6); c.fill(); }
                    // The red carpet, door to kerb, gold-edged
                    const cw = 40; c.fillStyle = '#6a0a22'; c.fillRect(G.door.x - cw / 2, Q.y, cw, Q.h);
                    c.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = Q.y + 6; y < Q.y + Q.h; y += 8) c.fillRect(G.door.x - cw / 2, y, cw, 1);
                    c.fillStyle = C.gold; c.fillRect(G.door.x - cw / 2, Q.y, 2, Q.h); c.fillRect(G.door.x + cw / 2 - 2, Q.y, 2, Q.h);
                    // Velvet ropes on gold stanchions either side of the carpet
                    for (const sx of [-1, 1]) {
                        const xr = G.door.x + sx * 36, ys = [Q.y + 14, Q.y + 42, Q.y + 70, Q.y + 96];
                        c.strokeStyle = C.velvetLt; c.lineWidth = 2.6;
                        for (let i = 0; i < ys.length - 1; i++) { c.beginPath(); c.moveTo(xr, ys[i]); c.quadraticCurveTo(xr + sx * 5, (ys[i] + ys[i + 1]) / 2, xr, ys[i + 1]); c.stroke(); }
                        for (const y of ys) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(xr + 1.5, y + 2, 3.6, 0, Math.PI * 2); c.fill(); c.fillStyle = C.gold; c.beginPath(); c.arc(xr, y, 3.4, 0, Math.PI * 2); c.fill(); c.fillStyle = C.goldLt; c.beginPath(); c.arc(xr - 1, y - 1, 1.2, 0, Math.PI * 2); c.fill(); }
                    }
                });
                ctx.drawImage(spr.cv, spr.x, spr.y, spr.w, spr.h);
                const dark = typeof game !== 'undefined' && game.getAmbientDarkness ? game.getAmbientDarkness() : 0.6;
                const night = typeof game !== 'undefined' && game.dayCycle ? game.dayCycle().lampsOn : dark > 0.4;
                const B = this._mcBeat(), t = _gameTimeSec;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (night) {                                                                        // the crimson pool at the door, breathing on the kick
                    glowA(ctx, G.door.x, G.door.y + 30, 90, '255, 40, 90', 0.32 + 0.12 * B.kick);
                    if (_zoomLOD < 1) for (let i = 0; i < 5; i++) {                                // low mist curling about the door
                        const mx = G.door.x + Math.sin(t * 0.21 + i * 1.7) * 70, my = Q.y + 30 + Math.cos(t * 0.17 + i * 2.3) * 24 + i * 9;
                        glowA(ctx, mx, my, 46, i % 2 ? '200, 168, 255' : '255, 120, 170', 0.07);
                    }
                }
                ctx.restore();
                this._mcPeople(ctx, night);
            },

            /** The bouncer at the rope and the queue along it: the front one goes in now and then, others come out. */
            _mcPeople(ctx, night) {
                const G = this._mcGeo(), now = _gameTimeSec;
                const Q = this._mcQ || (this._mcQ = { people: [], t: now, next: now + 4, out: now + 20 });
                const dt = Math.min(0.1, Math.max(0, now - Q.t)); Q.t = now;
                if (!Q.bouncer) Q.bouncer = { x: G.door.x + 46, y: G.door.y + 16, angle: Math.PI / 2, walkPhase: 0, look: ROLE_LOOKS.mc_staff('bouncer', seededRandom('mcbouncer')), life: 1 };
                const want = night ? 5 : 1;
                const queued = Q.people.filter(p => p.state === 'queue');
                if (queued.length < want && Q.people.length < 9 && (!Q.spawnAt || now > Q.spawnAt)) {   // someone joins the end of the line
                    const p = { x: G.door.x + 120, y: G.court.y + G.court.h + 10, angle: Math.PI, walkPhase: 0, look: ROLE_LOOKS.clubgoer(seededRandom('mcq' + Math.random())), life: 0, state: 'queue' };
                    if (Math.random() < 0.4) p.look.held = null;
                    Q.people.push(p); Q.spawnAt = now + 1.5 + Math.random() * 2;
                }
                if (now > Q.next && queued.length) { queued[0].state = 'enter'; Q.next = now + (night ? 5 + Math.random() * 6 : 14); }   // the bouncer waves the front one in
                if (night && now > Q.out) {                                                         // someone leaves, down the carpet
                    Q.people.push({ x: G.door.x, y: G.door.y + 4, angle: Math.PI / 2, walkPhase: 0, look: ROLE_LOOKS.clubgoer(seededRandom('mco' + Math.random())), life: 0, state: 'leave' });
                    Q.out = now + 8 + Math.random() * 10;
                }
                let slot = 0;
                for (let i = Q.people.length - 1; i >= 0; i--) {
                    const p = Q.people[i];
                    let tx, ty;
                    if (p.state === 'queue') { const s = G.queue[Math.min(G.queue.length - 1, Q.people.filter(o => o.state === 'queue').indexOf(p))]; tx = s[0]; ty = s[1]; slot++; p.life = Math.min(1, p.life + dt * 1.5); }
                    else if (p.state === 'enter') { tx = G.door.x; ty = G.door.y + 2; if (Math.hypot(tx - p.x, ty - p.y) < 8) p.life -= dt * 2; else p.life = Math.min(1, p.life + dt); }
                    else { tx = G.door.x; ty = G.court.y + G.court.h + 30; p.life = ty - p.y < 30 ? p.life - dt * 1.5 : Math.min(1, p.life + dt * 2); }
                    if (p.life <= 0 && p.state !== 'queue') { Q.people.splice(i, 1); continue; }
                    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), sp = 1.1 * dt * 60;
                    let vx = 0, vy = 0;
                    if (d > 2) { vx = dx / d * Math.min(sp, d); vy = dy / d * Math.min(sp, d); p.x += vx; p.y += vy; p.angle = Math.atan2(vy, vx); p.look.pose = undefined; }
                    else { p.angle = p.state === 'queue' ? -Math.PI / 2 : p.angle; p.look.pose = pickFrom(seededRandom(p.look.skinColor + slot), ['idle', 'phone', 'fidget', 'breathe']); }
                    gaitCommand(p, vx, vy);
                }
                // the bouncer turns to whoever's at the front
                const front = Q.people.find(o => o.state !== 'leave');
                Q.bouncer.angle = front ? Math.atan2(front.y - Q.bouncer.y, front.x - Q.bouncer.x) : Math.PI / 2;
                Q.bouncer.look.pose = 'arms_crossed';
                const cam = typeof game !== 'undefined' ? game.camera : null;
                if (cam && Math.hypot(G.door.x - cam.x, G.door.y - cam.y) > 1400) return;          // off screen: don't draw
                for (const p of [...Q.people, Q.bouncer].sort((a, b) => a.y - b.y)) {
                    if (!decorativeBodyInView(p.x, p.y, p.look)) { tickHiddenDecorativeBody(p, p.look); continue; }
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                    drawProceduralHumanoid(ctx, p, { stance: 'idle', ...p.look });
                    ctx.restore();
                }
            }
        });
