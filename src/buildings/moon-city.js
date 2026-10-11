        /* =====================================================================
           MOON CITY — the nightclub on the hub (style 'moon_city')
           ---------------------------------------------------------------------
           In the house's own colours (the interior's brand), art deco: black
           lacquer walls ribbed with violet neon fins between gold pilasters, a
           chevron frieze under the gold cornice; stepped lacquer roof decks in
           gold parapets ringed in violet neon at night. On the hall, a smoked-glass
           moon dome over the dance floor (its lights pulse up through it) in a
           ring of the moon's eight phases on a gold sunburst, the gold crescent on
           its plinth, two searchlight turrets. On the VIP wing, a roof terrace: a
           crescent pool lit violet, rose-velvet cabanas, loungers, festoon lights.
           "Moon City" in script neon on a gold-framed marquee board over the
           door, above a rising-moon canopy in rose
           velvet on gold posts, a sunburst forecourt, a red carpet, velvet ropes
           on gold stanchions, topiary, a crimson pool of light, a little low
           mist, a bouncer in black and gold, and a queue that moves.
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
            CANOPY_Z: 12, SIGN_Z: 24, FIN: 46, CANOPY_R: 60,
            C: {
                lacquer: '#0b0810', plum: '#1a1022', wall: '#140c1a', fin: '#2a1a36',
                violet: '#8a5cff', lavender: '#c8a8ff', lilac: '#e8d8ff',
                gold: '#e8c27a', goldDk: '#a8823e', goldLt: '#fff1c2',
                rose: '#ff5a8a', velvet: '#5a0c34', velvetLt: '#8a1a52', crimson: '#ff3a6a', marble: '#0e0a12',
                water: '#1c1240'
            }
        };

        /** A crescent moon at (x, y), radius r, horns turned by `rot`. */
        function _mcCrescent(ctx, x, y, r, rot = -0.5) {
            ctx.beginPath();
            ctx.arc(x, y, r, rot + 0.35, rot + Math.PI * 2 - 0.35);
            ctx.arc(x + Math.cos(rot) * r * 0.42, y + Math.sin(rot) * r * 0.42, r * 0.78, rot + Math.PI * 2 - 0.62, rot + 0.62, true);
            ctx.closePath();
        }

        /** A clean lune (the crescent pool): a disc at (x, y), radius r, less a disc 0.8 r across set 0.45 r toward `rot`. */
        function _mcLune(ctx, x, y, r, rot) {
            const th = 0.896, ph = 1.35, d = r * 0.45;                                    // where the two circles cross, on each
            ctx.beginPath();
            ctx.arc(x, y, r, rot + th, rot + Math.PI * 2 - th);
            ctx.arc(x + Math.cos(rot) * d, y + Math.sin(rot) * d, r * 0.8, rot - ph, rot + ph, true);
            ctx.closePath();
        }

        /** The lit part of the moon at phase ph (0 new, 0.5 full, 1 new again) on a disc at (x, y), radius r. */
        function _mcPhase(ctx, x, y, r, ph) {
            const w = Math.cos(ph * Math.PI * 2) * r, flip = ph > 0.5 ? -1 : 1;      // waxing lit on the right, waning on the left
            ctx.beginPath();
            ctx.ellipse(x, y, r, r, 0, -Math.PI / 2, Math.PI / 2, flip < 0);
            if (w >= 0) ctx.ellipse(x, y, Math.max(0.01, w), r, 0, Math.PI / 2, -Math.PI / 2, flip > 0);
            else ctx.ellipse(x, y, -w, r, 0, Math.PI / 2, Math.PI * 1.5, flip < 0);
            ctx.closePath();
        }

        Object.assign(BuildingV2.prototype, {
            /** Footprint pieces in world space (made once). */
            _mcGeo() {
                if (this._mcG) return this._mcG;
                const X = this.x, Y = this.y, hall = this.sections[0], wing = this.sections[1] || hall;
                const wb = Y + wing.y + wing.h, dx = X + wing.x + wing.w / 2;
                const dome = { x: X + hall.x + hall.w * 0.55, y: Y + hall.y + hall.h * 0.5, r: Math.min(hall.h * 0.33, hall.w * 0.2) };
                return (this._mcG = {
                    hall: { x: X + hall.x, y: Y + hall.y, w: hall.w, h: hall.h },
                    wing: { x: X + wing.x, y: Y + wing.y, w: wing.w, h: wing.h },
                    door: { x: dx, y: wb },
                    dome,
                    phases: [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = -Math.PI / 2 + i * Math.PI / 4, R = dome.r + 22; return { x: dome.x + Math.cos(a) * R, y: dome.y + Math.sin(a) * R, ph: i / 8 }; }),
                    moon: { x: X + hall.x + hall.w * 0.88, y: Y + hall.y + hall.h * 0.24 },
                    turrets: [[X + hall.x + 70, Y + hall.y + 60, '170, 130, 255', 0], [X + hall.x + hall.w - 50, Y + hall.y + hall.h - 40, '255, 90, 140', 2.4]],
                    plant: [[X + hall.x + 36, Y + hall.y + hall.h - 98, 52, 32], [X + hall.x + 96, Y + hall.y + hall.h - 92, 26, 26], [X + hall.x + 36, Y + hall.y + hall.h - 58, 30, 22]],
                    pool: { x: X + wing.x + wing.w * 0.56, y: Y + wing.y + wing.h * 0.5, r: Math.min(wing.w, wing.h) * 0.29 },
                    cabanas: [[X + wing.x + 20, Y + wing.y + 26, 42, 36], [X + wing.x + 20, Y + wing.y + wing.h - 62, 42, 36]],
                    loungers: [0, 1, 2, 3].map(i => [X + wing.x + wing.w - 44, Y + wing.y + 28 + i * 38, 26, 13]),
                    sign: { x: dx, y: wb + 16 },                                          // the marquee board over the door
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

            /** A wall: lacquer between violet neon fins, gold pilasters every third, smoked-glass bands, a deco chevron
                frieze under the gold cornice. Each kind on a face goes out as one path (panes, fins, pilasters, the
                frieze; nothing of one kind touches), the fins at night one stroke a fin (each breathes on its own). */
            _mcFace(ctx, f, P, emissive) {
                if (f.side === 'C') return;
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                if (Math.hypot(dx - ax, dy - ay) < 4) return;
                const at = (u, v) => { const x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u, x1 = dx + (cx - dx) * u, y1 = dy + (cy - dy) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
                const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / MCX.FIN)), C = MCX.C;
                const quad = (path, u0, u1, v0, v1) => { const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1); path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath(); return path; };
                const seg = (path, u0, v0, u1, v1) => { const a = at(u0, v0), b = at(u1, v1); path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); return path; };
                const panes = new Path2D(), frieze = new Path2D(), pil = new Path2D();
                for (let i = 0; i < n; i++) quad(panes, (i + 0.18) / n, (i + 0.82) / n, 0.3, 0.74);
                for (let j = 0, m = n * 3; j <= m; j++) { const p = at(j / m, j % 2 ? 0.83 : 0.91); if (j) frieze.lineTo(p[0], p[1]); else frieze.moveTo(p[0], p[1]); }   // the chevrons
                for (let i = 0; i <= n; i += 3) seg(pil, i / n, 0.04, i / n, 0.98);
                if (n % 3) seg(pil, 1, 0.04, 1, 0.98);                                                                      // (a pilaster at each corner)
                if (!emissive) {
                    // smoked glass between the fins
                    const sun = sunNow(), day = sun ? sun.day : 0;
                    ctx.fillStyle = 'rgba(12, 6, 20, 0.92)'; ctx.fill(panes);
                    if (day > 0.05) { ctx.fillStyle = `rgba(168, 160, 220, ${0.22 * day})`; ctx.fill(panes); }
                    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(232, 194, 122, 0.3)'; ctx.stroke(panes);                // a hairline of gold round each pane
                    const fins = new Path2D();
                    for (let i = 0; i <= n; i++) if (i % 3) seg(fins, i / n, 0.06, i / n, 0.96);
                    ctx.lineWidth = 2.2; ctx.strokeStyle = C.fin; ctx.stroke(fins);                                   // the fins
                    ctx.lineWidth = 3.4; ctx.strokeStyle = C.goldDk; ctx.stroke(pil);                                 // gold pilasters
                    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 241, 194, 0.35)'; ctx.stroke(pil);
                    ctx.lineWidth = 1.4; ctx.strokeStyle = C.goldDk; ctx.stroke(seg(new Path2D(), 0, 0.97, 1, 0.97));   // gold cornice and plinth
                    ctx.lineWidth = 0.8; ctx.stroke(seg(new Path2D(), 0, 0.06, 1, 0.06));
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.25)'; ctx.stroke(seg(new Path2D(), 0, 0.8, 1, 0.8));
                    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232, 194, 122, 0.55)'; ctx.stroke(frieze);              // the chevron frieze
                    return;
                }
                // At night: the fins breathe violet and lavender, pumping on the kick; the chevrons run rose
                const B = this._mcBeat(), t = _gameTimeSec, op = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = `rgba(200, 168, 255, ${0.07 + 0.05 * B.kick})`; ctx.fill(panes);                    // a lavender glow behind the glass
                for (let i = 0; i <= n; i++) {
                    if (!(i % 3) || (i === n && n % 3)) continue;
                    const a = 0.32 + 0.22 * Math.sin(t * 0.9 + i * 0.8) + 0.35 * B.kick, fin = seg(new Path2D(), i / n, 0.08, i / n, 0.94);
                    ctx.lineWidth = 2.6; ctx.strokeStyle = `rgba(138, 92, 255, ${Math.max(0, a) * 0.7})`; ctx.stroke(fin);
                    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(232, 216, 255, ${Math.max(0, a)})`; ctx.stroke(fin);
                }
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 241, 194, 0.4)'; ctx.stroke(pil);                      // the pilasters catch gold
                ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(255, 90, 138, ${0.3 + 0.3 * B.kick})`; ctx.stroke(frieze);
                ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255, 241, 194, 0.55)`; ctx.stroke(seg(new Path2D(), 0, 0.97, 1, 0.97));   // the cornice catches gold
                ctx.globalCompositeOperation = op;
            },

            /** The roof (drawn in the roof plane): stepped lacquer decks in gold parapets; on the hall the moon dome over
                the dance floor in a ring of gold moon phases on a sunburst, the gold crescent on its plinth, the
                searchlight turrets; on the VIP wing a roof terrace with a crescent pool, cabanas and loungers. */
            _mcDrawRoof(ctx, emissive) {
                const G = this._mcGeo(), C = MCX.C, D = G.dome, PL = G.pool;
                if (!emissive) {
                    // (Painted once with the roof, PlaneSprites; only the sky in the dome and the pool is live, by day. Each
                    // segment makes its own paths: a painted run starts with no current path.)
                    const dome = (c) => { c.beginPath(); c.arc(D.x, D.y, D.r, 0, Math.PI * 2); };
                    if (PropPass.seg(false)) {
                    for (const s of [G.hall, G.wing]) {
                        const wing = s === G.wing, I = 16;
                        ctx.fillStyle = LandmarkKit.grad(this, 'mcroof' + s.y, () => { const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h); g.addColorStop(0, '#171020'); g.addColorStop(1, C.lacquer); return g; });
                        ctx.fillRect(s.x, s.y, s.w, s.h);
                        // the stepped deck: a raised inner tier, lit on its north-west lip, shadowed on its south-east
                        ctx.fillStyle = wing ? C.plum : '#0d0912'; ctx.fillRect(s.x + I, s.y + I, s.w - I * 2, s.h - I * 2);
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(s.x + s.w - I, s.y + I); ctx.lineTo(s.x + s.w - I, s.y + s.h - I); ctx.lineTo(s.x + I, s.y + s.h - I); ctx.stroke();
                        ctx.strokeStyle = 'rgba(232, 194, 122, 0.3)'; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(s.x + I, s.y + s.h - I); ctx.lineTo(s.x + I, s.y + I); ctx.lineTo(s.x + s.w - I, s.y + I); ctx.stroke();
                        if (wing) {                                                                   // the terrace's decking
                            ctx.strokeStyle = 'rgba(232, 194, 122, 0.06)'; ctx.beginPath();
                            for (let gy = s.y + I + 8; gy < s.y + s.h - I; gy += 8) { ctx.moveTo(s.x + I, gy); ctx.lineTo(s.x + s.w - I, gy); }
                            ctx.stroke();
                        }
                        ctx.strokeStyle = C.goldDk; ctx.lineWidth = 3; ctx.strokeRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
                        ctx.strokeStyle = 'rgba(255, 241, 194, 0.35)'; ctx.lineWidth = 0.8; ctx.strokeRect(s.x + 6, s.y + 6, s.w - 12, s.h - 12);
                        for (const [x, y] of [[s.x + 4, s.y + 4], [s.x + s.w - 4, s.y + 4], [s.x + 4, s.y + s.h - 4], [s.x + s.w - 4, s.y + s.h - 4]]) {   // gold corner studs
                            ctx.fillStyle = C.gold; ctx.fillRect(x - 3, y - 3, 6, 6);
                        }
                    }
                    // A sunburst in fine gold from the dome across the hall's deck, and two deco rings stepping out from it
                    const H = G.hall;
                    ctx.save(); ctx.beginPath(); ctx.rect(H.x + 17, H.y + 17, H.w - 34, H.h - 34); ctx.clip();
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.08)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ctx.moveTo(D.x + Math.cos(a) * (D.r + 34), D.y + Math.sin(a) * (D.r + 34)); ctx.lineTo(D.x + Math.cos(a) * 640, D.y + Math.sin(a) * 640); }
                    ctx.stroke();
                    ctx.restore();
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.22)'; ctx.lineWidth = 1;
                    for (const r of [D.r + 34, D.r + 10]) { ctx.beginPath(); ctx.arc(D.x, D.y, r, 0, Math.PI * 2); ctx.stroke(); }
                    // The dome over the dance floor: smoked glass
                    dome(ctx); ctx.fillStyle = '#0d0814'; ctx.fill();
                    // The crescent pool on the VIP terrace
                    _mcLune(ctx, PL.x, PL.y, PL.r, -0.35);
                    ctx.fillStyle = LandmarkKit.grad(this, 'mcpool', () => { const g = ctx.createRadialGradient(PL.x - PL.r * 0.3, PL.y - PL.r * 0.3, 4, PL.x, PL.y, PL.r); g.addColorStop(0, '#3a2470'); g.addColorStop(1, C.water); return g; });
                    ctx.fill();
                    }
                    const sun = sunNow(), day = sun ? sun.day : 0;
                    if (PropPass.seg(true) && day > 0.05) {                                         // by day the glass and the water hold the sky (marked live day or night: the runs stay the same)
                        ctx.fillStyle = LandmarkKit.grad(this, 'mcsky', () => { const g = ctx.createLinearGradient(D.x - D.r, D.y - D.r, D.x + D.r, D.y + D.r); g.addColorStop(0, 'rgba(190, 186, 236, 1)'); g.addColorStop(0.5, 'rgba(120, 110, 180, 1)'); g.addColorStop(1, 'rgba(60, 40, 100, 1)'); return g; });
                        dome(ctx); ctx.globalAlpha = 0.35 * day; ctx.fill();
                        ctx.fillStyle = 'rgba(190, 186, 236, 1)'; _mcLune(ctx, PL.x, PL.y, PL.r, -0.35); ctx.globalAlpha = 0.18 * day; ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    if (!PropPass.seg(false)) return;
                    // The dome's leading: rings and ribs in gold, in a gold collar
                    ctx.save(); dome(ctx); ctx.clip();
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.35)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.moveTo(D.x + Math.cos(a) * D.r * 0.34, D.y + Math.sin(a) * D.r * 0.34); ctx.lineTo(D.x + Math.cos(a) * D.r, D.y + Math.sin(a) * D.r); }
                    ctx.stroke();
                    for (const u of [0.34, 0.67]) { ctx.beginPath(); ctx.arc(D.x, D.y, D.r * u, 0, Math.PI * 2); ctx.stroke(); }
                    ctx.fillStyle = 'rgba(200, 168, 255, 0.05)'; _mcPhase(ctx, D.x, D.y, D.r, 0.32); ctx.fill();   // a pale gibbous in the glass: the moon itself
                    ctx.restore();
                    ctx.beginPath(); ctx.arc(D.x, D.y, D.r, 0, Math.PI * 2); ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.stroke();
                    ctx.beginPath(); ctx.arc(D.x, D.y, D.r + 5, 0, Math.PI * 2); ctx.strokeStyle = C.goldDk; ctx.lineWidth = 1; ctx.stroke();
                    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(D.x, D.y, 5, 0, Math.PI * 2); ctx.fill();          // the boss at the top
                    // The eight phases of the moon round it, in gold on lacquer
                    for (const p of G.phases) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; ctx.beginPath(); ctx.arc(p.x + 1.5, p.y + 2, 9, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#100a16'; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = C.goldDk; ctx.lineWidth = 1; ctx.stroke();
                        if (p.ph) { ctx.fillStyle = C.gold; _mcPhase(ctx, p.x, p.y, 7, p.ph); ctx.fill(); }
                    }
                    // The gold crescent on its stepped plinth
                    const MO = G.moon;
                    for (const [r, f] of [[38, '#100a16'], [32, '#171020']]) { ctx.beginPath(); ctx.arc(MO.x, MO.y, r, 0, Math.PI * 2); ctx.fillStyle = f; ctx.fill(); ctx.strokeStyle = C.goldDk; ctx.lineWidth = 1.2; ctx.stroke(); }
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; _mcCrescent(ctx, MO.x + 3, MO.y + 4, 26); ctx.fill();
                    ctx.fillStyle = LandmarkKit.grad(this, 'mcmoon', () => { const g = ctx.createLinearGradient(MO.x - 26, MO.y - 26, MO.x + 26, MO.y + 26); g.addColorStop(0, C.goldLt); g.addColorStop(0.5, C.gold); g.addColorStop(1, C.goldDk); return g; });
                    _mcCrescent(ctx, MO.x, MO.y, 26); ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
                    // The searchlight turrets
                    for (const [x, y] of G.turrets) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, 14, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#100a16'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = C.goldDk; ctx.lineWidth = 2; ctx.stroke();
                        ctx.fillStyle = C.fin; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(232, 216, 255, 0.5)'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2); ctx.fill();
                    }
                    // Discreet plant: louvred lacquer units edged in gold
                    for (const [x, y, w, h] of G.plant) {
                        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 3, w, h);
                        ctx.fillStyle = '#100a16'; ctx.fillRect(x, y, w, h);
                        ctx.strokeStyle = 'rgba(232, 194, 122, 0.14)'; ctx.lineWidth = 1; ctx.beginPath();
                        for (let ly = y + 4; ly < y + h - 1; ly += 4) { ctx.moveTo(x + 3, ly); ctx.lineTo(x + w - 3, ly); }
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(168, 130, 62, 0.6)'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
                    }
                    // The terrace: the pool's gold coping, cabanas in rose velvet, loungers, violet topiary at the corners
                    _mcLune(ctx, PL.x, PL.y, PL.r, -0.35); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke();
                    ctx.strokeStyle = 'rgba(232, 216, 255, 0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
                    for (const [x, y, w, h] of G.cabanas) {
                        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 3, y + 4, w, h);
                        ctx.fillStyle = C.velvet; ctx.fillRect(x, y, w, h);
                        ctx.fillStyle = C.velvetLt; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w / 2, y + h / 2); ctx.closePath(); ctx.fill();   // the pitched top, lit from the north
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = 'rgba(138, 26, 82, 0.6)'; ctx.fill();
                        ctx.strokeStyle = 'rgba(255, 241, 194, 0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
                        ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
                        ctx.fillStyle = C.goldLt; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 2, 0, Math.PI * 2); ctx.fill();
                    }
                    for (const [x, y, w, h] of G.loungers) {
                        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 2, y + 3, w, h);
                        ctx.fillStyle = C.fin; ctx.fillRect(x, y, w, h);
                        ctx.fillStyle = '#4a3468'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);                           // a violet cushion
                        ctx.fillStyle = '#7a5aa8'; ctx.fillRect(x + w - 8, y + 2, 6, h - 4);                           // the pillow end
                        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x - 6, y + h / 2, 2.4, 0, Math.PI * 2); ctx.fill();   // a little gold side table
                    }
                    const W = G.wing;
                    for (const [x, y] of [[W.x + W.w - 30, W.y + W.h - 30], [W.x + 82, W.y + 30], [W.x + 82, W.y + W.h - 30]]) {
                        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(x + 2, y + 3, 10, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = LandmarkKit.grad(this, 'mctop' + x + ',' + y, () => { const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10); g.addColorStop(0, '#7a52c8'); g.addColorStop(1, '#2a1a50'); return g; });
                        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = C.goldDk; ctx.lineWidth = 1; ctx.stroke();
                    }
                    return;
                }
                // Night: the dance floor glows up through the dome, in the club's colours, on the beat
                const B = this._mcBeat(), op = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                ctx.save(); ctx.beginPath(); ctx.arc(D.x, D.y, D.r - 2, 0, Math.PI * 2); ctx.clip();
                const cell = 22, base = ctx.globalAlpha;
                for (let gx = D.x - D.r; gx < D.x + D.r; gx += cell) for (let gy = D.y - D.r; gy < D.y + D.r; gy += cell) {
                    const i = Math.round((gx - D.x) / cell), j = Math.round((gy - D.y) / cell);
                    const pat = B.bar % 4, ph = pat === 0 ? Math.hypot(i, j) * 0.5 - B.n * 0.5 : pat === 1 ? (i + j) * 0.35 - B.n : pat === 2 ? ((i + j + Math.floor(B.n)) % 2) * 2 : Math.atan2(j, i) * 2 + B.n;
                    const a = 0.25 + 0.25 * Math.sin(ph * Math.PI) + 0.35 * B.kick;
                    ctx.globalAlpha = base * Math.max(0, a) * 0.55;
                    ctx.fillStyle = `rgb(${CLUB_PAL[(Math.abs(i * 3 + j) + B.bar) % 4]})`;
                    ctx.fillRect(gx + 2, gy + 2, cell - 4, cell - 4);
                }
                ctx.restore(); ctx.globalAlpha = base;
                ctx.beginPath(); ctx.arc(D.x, D.y, D.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 241, 194, ${0.5 + 0.3 * B.kick})`; ctx.lineWidth = 2.4; ctx.stroke();
                // The phases light one after another round the dome, a step a beat
                const lit = ((Math.floor(B.n) % 8) + 8) % 8;
                for (let i = 0; i < 8; i++) {
                    const p = G.phases[i], d = (lit - i + 8) % 8, a = d === 0 ? 0.7 + 0.3 * B.kick : d === 1 ? 0.35 : d === 2 ? 0.15 : 0.05;
                    glowA(ctx, p.x, p.y, 22, '200, 168, 255', base * a);
                }
                ctx.globalAlpha = base;
                // Violet neon round each deck's step
                ctx.lineWidth = 2.4; ctx.strokeStyle = `rgba(138, 92, 255, ${0.45 + 0.25 * B.kick})`;
                for (const s of [G.hall, G.wing]) ctx.strokeRect(s.x + 16, s.y + 16, s.w - 32, s.h - 32);
                ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(232, 216, 255, 0.75)';
                for (const s of [G.hall, G.wing]) ctx.strokeRect(s.x + 16, s.y + 16, s.w - 32, s.h - 32);
                // The pool lit violet from beneath, its coping in lavender
                glowA(ctx, PL.x, PL.y, PL.r * 1.5, '138, 92, 255', base * (0.45 + 0.1 * Math.sin(_gameTimeSec * 0.8)));
                ctx.globalAlpha = base; _mcLune(ctx, PL.x, PL.y, PL.r - 2, -0.35); ctx.strokeStyle = 'rgba(200, 168, 255, 0.6)'; ctx.lineWidth = 1.4; ctx.stroke();
                // Festoon lights across the terrace
                if (_zoomLOD < 2) {
                    const W = G.wing, bulb = bulbSprite(ctx, '255,232,200', 1, 1.4, '255,200,150', 0.3, 5, true), br = bulb.r, t = _frameTime / 1000;
                    for (let row = 0; row < 3; row++) {
                        const y = W.y + 40 + row * 60, x0 = W.x + 20, x1 = W.x + W.w - 20;
                        for (let u = 0, i = 0; u <= 1.0001; u += 1 / 14, i++) {
                            const x = x0 + (x1 - x0) * u, sag = 10 * 4 * u * (1 - u);
                            ctx.globalAlpha = base * (0.7 + 0.3 * Math.sin(t * 1.7 + i * 0.9 + row));
                            ctx.drawImage(bulb, x - br, y + sag - br, br * 2, br * 2);
                        }
                    }
                    ctx.globalAlpha = base;
                }
                // The crescent's lavender halo
                glowA(ctx, G.moon.x, G.moon.y, 70, '200, 168, 255', base * (0.55 + 0.2 * Math.sin(_gameTimeSec * 0.6)));
                ctx.globalAlpha = base; ctx.fillStyle = 'rgba(255, 241, 194, 0.55)'; _mcCrescent(ctx, G.moon.x, G.moon.y, 26); ctx.fill();
                ctx.globalCompositeOperation = op;
            },

            /** Two slow searchlights from the roof turrets, violet and rose, sweeping the night sky. */
            _mcBeams(ctx, dark) {
                if (dark < 0.25 || _zoomLOD >= 2) return;
                const G = this._mcGeo(), t = _gameTimeSec, k = 1 + this._leanScale();
                ctx.save(); LandmarkKit.plane(ctx, k); ctx.globalCompositeOperation = 'lighter';
                for (const [x, y, rgb, ph] of G.turrets) {
                    const a = Math.sin(t * 0.22 + ph) * 1.1 + ph, L = 560, w = 0.08;
                    const g = ctx.createRadialGradient(x, y, 4, x, y, L);
                    g.addColorStop(0, `rgba(${rgb}, ${0.22 * dark})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
                    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, L, a - w, a + w); ctx.closePath(); ctx.fill();
                    glowA(ctx, x, y, 16, rgb, 0.8 * dark); ctx.globalAlpha = 1;
                }
                ctx.restore();
            },

            /** The canopy over the door: a rising moon in rose velvet, gold ribs fanning from the door, its rim scalloped;
                on gold posts, with marquee bulbs round the rim at night. */
            _mcDrawCanopy(ctx, emissive) {
                const G = this._mcGeo(), cam = game.camera, k = LandmarkKit.k(MCX.CANOPY_Z), R = MCX.CANOPY_R;
                const cx = G.door.x, cy = G.door.y - 4;
                const Pk = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                if (!emissive) {
                    ctx.save(); ctx.strokeStyle = MCX.C.gold; ctx.lineWidth = 2;                       // posts, ground to canopy
                    for (const a of [Math.PI / 2 - 0.8, Math.PI / 2 + 0.8]) {
                        const x = cx + Math.cos(a) * (R - 6), y = cy + Math.sin(a) * (R - 6), [px, py] = Pk(x, y);
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px, py); ctx.stroke();
                    }
                    ctx.restore();
                }
                LandmarkKit.flat(ctx, k, (cf) => {
                    if (!emissive) PlaneSprites.draw(cf, this, 'canopy', k, (c) => this._mcCanopyPlane(c), { x: cx - R - 10, y: cy - 4, w: R * 2 + 24, h: R + 22 });   // (painted once in its plane)
                    else {
                        const c = cf, t = _frameTime / 1000;                                            // marquee bulbs round the rim
                        c.globalCompositeOperation = 'lighter';
                        const bulb = _zoomLOD < 1 ? bulbSprite(c, '255,232,240', 1, 1.6, '255,180,210', 0.35, 7, true) : bulbSprite(c, '255,232,240', 1, 1.6), br = bulb.r;
                        for (let i = 0; i <= 14; i++) {                                                       // (core and glow in one stamp)
                            const a = Math.PI * i / 14, x = cx + Math.cos(a) * (R - 4), y = cy + Math.sin(a) * (R - 4);
                            c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.3); c.drawImage(bulb, x - br, y - br, br * 2, br * 2);
                        }
                    }
                });
            },

            /** The canopy's velvet, ribs and scalloped rim (the marquee board hangs over its top half), in its own plane (still: PlaneSprites paints it once) */
            _mcCanopyPlane(c) {
                const G = this._mcGeo(), C = MCX.C, R = MCX.CANOPY_R, cx = G.door.x, cy = G.door.y - 4, N = 14;
                const rim = (r0, bulge) => {
                    c.beginPath(); c.moveTo(cx + r0, cy);
                    for (let i = 0; i < N; i++) {
                        const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N, am = (a0 + a1) / 2;
                        c.quadraticCurveTo(cx + Math.cos(am) * (r0 + bulge), cy + Math.sin(am) * (r0 + bulge), cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0);
                    }
                    c.closePath();
                };
                c.save(); c.translate(4, 6); rim(R, 8); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.restore();
                const g = c.createRadialGradient(cx, cy, 6, cx, cy, R + 6); g.addColorStop(0, C.velvet); g.addColorStop(0.65, C.velvetLt); g.addColorStop(1, C.velvet);
                rim(R, 8); c.fillStyle = g; c.fill();
                c.strokeStyle = C.gold; c.lineWidth = 1.4; c.stroke();
                c.strokeStyle = 'rgba(255, 241, 194, 0.3)'; c.lineWidth = 0.8; c.beginPath();       // gold ribs fanning from the door
                for (let i = 1; i < N; i++) { const a = Math.PI * i / N; c.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); c.lineTo(cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2)); }
                c.stroke();
                c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI); c.closePath(); c.fillStyle = '#100a16'; c.fill();   // a lacquer half-disc at the door
                c.strokeStyle = C.gold; c.lineWidth = 1.2; c.stroke();
                c.beginPath(); c.arc(cx, cy, R - 10, 0, Math.PI); c.strokeStyle = 'rgba(232, 194, 122, 0.6)'; c.lineWidth = 0.8; c.stroke();
            },

            /** The marquee board over the door, above the canopy: lacquer in a gold frame, "Moon City" in script neon
                with the crescent before it, NIGHTCLUB in gold beneath between gold rules. */
            _mcDrawSign(ctx, emissive, dark = 0) {
                const G = this._mcGeo(), C = MCX.C, k = LandmarkKit.k(MCX.SIGN_Z), x = G.sign.x, y = G.sign.y;
                const t = _frameTime / 1000, flick = (t % 7.3) < 0.12 ? 0.35 : (t % 11.1) < 0.06 ? 0.6 : 1;
                const W = 108, ty = y - 4, cx = x - 78;                                                  // half the board's width, the script's line, the crescent
                const board = (c) => { c.beginPath(); c.roundRect(x - W, y - 22, W * 2, 46, [6, 6, 14, 14]); };
                const rules = (c) => { c.beginPath(); for (const s of [-1, 1]) { c.moveTo(x + s * 38, y + 15); c.lineTo(x + s * 70, y + 15); } c.stroke();
                    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 74, y + 12.5); c.lineTo(x + s * 76.5, y + 15); c.lineTo(x + s * 74, y + 17.5); c.lineTo(x + s * 71.5, y + 15); c.closePath(); c.fill(); } };
                LandmarkKit.flat(ctx, k, (c) => {
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    if (!emissive) {
                        c.save(); c.translate(3, 4); board(c); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill(); c.restore();
                        board(c);
                        c.fillStyle = LandmarkKit.grad(this, 'mcboard', () => { const g = c.createLinearGradient(0, y - 22, 0, y + 24); g.addColorStop(0, '#1d1328'); g.addColorStop(1, C.lacquer); return g; });
                        c.fill(); c.strokeStyle = C.gold; c.lineWidth = 2; c.stroke();
                        c.beginPath(); c.roundRect(x - W + 4, y - 18, W * 2 - 8, 38, [4, 4, 11, 11]); c.strokeStyle = 'rgba(255, 241, 194, 0.3)'; c.lineWidth = 0.8; c.stroke();
                        c.font = "34px 'Great Vibes', cursive";
                        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText('Moon City', x + 6 + 1.5, ty + 2);
                        c.fillStyle = '#d8c8f0'; c.fillText('Moon City', x + 6, ty);
                        c.fillStyle = C.gold; _mcCrescent(c, cx, ty - 2, 9); c.fill();
                        c.font = '600 6.5px Montserrat, sans-serif'; c.fillStyle = C.gold;
                        c.fillText('N I G H T C L U B', x, y + 15);
                        c.strokeStyle = C.goldDk; c.fillStyle = C.goldDk; c.lineWidth = 0.8; rules(c);
                        return;
                    }
                    const a = Math.max(0.15, Math.min(1, dark * 1.3)) * flick;
                    c.globalCompositeOperation = 'lighter';
                    if (_zoomLOD < 1) { c.globalAlpha = a * 0.25; drawGlow(c, x, y, 100, '255, 120, 180', 0); }
                    c.globalAlpha = a * 0.6; board(c); c.strokeStyle = C.rose; c.lineWidth = 1.2; c.stroke();         // the frame's neon edge
                    c.globalAlpha = a; c.font = "34px 'Great Vibes', cursive"; c.shadowColor = C.rose; c.shadowBlur = _zoomLOD < 1 ? 14 : 0;
                    c.fillStyle = '#ffb8d4'; c.fillText('Moon City', x + 6, ty);
                    c.shadowBlur = 0; c.fillStyle = 'rgba(255, 244, 250, 0.9)'; c.fillText('Moon City', x + 6, ty);
                    c.fillStyle = C.goldLt; _mcCrescent(c, cx, ty - 2, 9); c.fill();
                    if (_zoomLOD < 1) { c.globalAlpha = a * 0.6; drawGlow(c, cx, ty - 2, 20, '232, 194, 122', 0); }
                    c.globalAlpha = a * 0.85; c.font = '600 6.5px Montserrat, sans-serif'; c.fillStyle = C.gold;
                    c.fillText('N I G H T C L U B', x, y + 15);
                    c.strokeStyle = C.gold; c.lineWidth = 0.8; rules(c);
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
                    // A sunburst inlaid in gold, fanning from the door, stepped by two deco arcs
                    c.save(); c.beginPath(); c.rect(Q.x + 6, Q.y + 3, Q.w - 12, Q.h - 8); c.clip();
                    c.strokeStyle = 'rgba(232, 194, 122, 0.2)'; c.lineWidth = 1; c.beginPath();
                    for (let i = 1; i < 18; i++) { const a = Math.PI * i / 18; c.moveTo(G.door.x + Math.cos(a) * 24, Q.y + Math.sin(a) * 24); c.lineTo(G.door.x + Math.cos(a) * 160, Q.y + Math.sin(a) * 160); }
                    c.stroke();
                    c.strokeStyle = 'rgba(232, 194, 122, 0.35)';
                    for (const r of [66, 94]) { c.beginPath(); c.arc(G.door.x, Q.y, r, 0, Math.PI); c.stroke(); }
                    c.restore();
                    c.strokeStyle = 'rgba(168, 130, 62, 0.55)'; c.lineWidth = 1; c.strokeRect(Q.x + 6, Q.y + 3, Q.w - 12, Q.h - 8);   // a fine gold inlay border
                    for (const sx of [-1, 1]) {                                                         // a gold crescent in a gold ring either side
                        c.beginPath(); c.arc(G.door.x + sx * 82, Q.y + 50, 17, 0, Math.PI * 2); c.strokeStyle = 'rgba(232, 194, 122, 0.45)'; c.stroke();
                        c.fillStyle = 'rgba(232, 194, 122, 0.6)'; _mcCrescent(c, G.door.x + sx * 82, Q.y + 50, 11, sx < 0 ? 0.6 : Math.PI - 0.6); c.fill();
                    }
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
                    // Lacquer planters at the front corners, a violet topiary ball in each
                    for (const sx of [-1, 1]) {
                        const px = G.door.x + sx * 92, py = Q.y + Q.h - 18;
                        c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(px - 9, py - 8, 22, 22);
                        c.fillStyle = '#100a16'; c.fillRect(px - 11, py - 11, 22, 22); c.strokeStyle = C.goldDk; c.lineWidth = 1.2; c.strokeRect(px - 11, py - 11, 22, 22);
                        const g = c.createRadialGradient(px - 3, py - 3, 1, px, py, 10); g.addColorStop(0, '#7a52c8'); g.addColorStop(1, '#2a1a50');
                        c.fillStyle = g; c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.fill();
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
