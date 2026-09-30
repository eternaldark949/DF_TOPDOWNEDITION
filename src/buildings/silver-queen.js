        // =====================================================================
        //  SILVER QUEEN — portico, pilasters, verandas, crown and searchlights
        // =====================================================================
        //  Everything here uses the same lean projection as the walls: a point at
        //  height z (px) draws at cam + (p - cam) * k(z). k is linear in z up to the
        //  capped roof height (so details line up with the window rows) and true
        //  perspective above it (the searchlight beams).
        //  Base pass (drawTop): solid structure, so street lamps light it.
        //  Emissive pass: glow, plus the balcony slabs, which are drawn there so
        //  lit windows never shine through them.
        const SQ_THEME = {
            silverHi: '#efecf8', silver: '#bdb6d6', silverLo: '#5f5782', silverDk: '#453e62',
            plum: '#2d1d59', terrace: '#3a2a6e', marble: '#1c1242',
            // from the silver_queen_exp editor design
            roof: '#4c3a94', roofLo: '#2a1d5c', trim: '#d9bf86', bay: '#2d1d59', glass: '#17005c', ground: '#100033',
            gold: '#e8c27a', goldHi: '#fff1c9'
        };
        const SQ_PORTICO = {
            depth: 52, floors: 4, overhang: 6, colR: 3.6,
            colLine: 74, colFloors: 3.5,        // lantern columns: free-standing on the floor well in front of the portico, lanterns under its roof line
            // Column offsets from the door centre (px). The paired columns flank the
            // door; ±80 and ±143 line up with the pilasters that run up the wall.
            cols: [-168, -143, -80, -62, 62, 80, 143, 168],
            pilasters: [-143, -80, 80, 143]
        };

        Object.assign(BuildingV2.prototype, {
            _sqH() { const B = CONFIG.BUILDINGS; return Math.min(this.floors, B.MAX_FLOORS) * B.FLOOR_HEIGHT; },

            _sqK(z) {
                const C = leanCamHeight(), H = this._sqH();
                if (z <= H) return 1 + z / (C - H);
                return C / (C - Math.min(z, C * 0.86));
            },

            _sqP(x, y, z) { const cam = game.camera, k = this._sqK(z); return [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k]; },

            /** Portico geometry, anchored to the entrance face (south edge of the door's section). */
            _sqPortico() {
                if (this._sqPort !== undefined) return this._sqPort;
                const door = this.attachedTransition;
                if (!door) return (this._sqPort = null);
                let sec = this.sections[0], maxY = -Infinity;
                this.sections.forEach(s => { if (s.y + s.h > maxY) { maxY = s.y + s.h; sec = s; } });
                const P = SQ_PORTICO, wx0 = this.x + sec.x, wx1 = wx0 + sec.w, yf = this.y + sec.y + sec.h;
                const dx = door.x + door.w / 2, yc = yf + P.colLine, FH = CONFIG.BUILDINGS.FLOOR_HEIGHT;
                return (this._sqPort = {
                    x0: wx0 - P.overhang, x1: wx1 + P.overhang, wx0, wx1, yf, yb: yf + P.depth, yc, dx,
                    z: P.floors * FH, zCol: P.colFloors * FH,
                    cols: P.cols.filter(o => dx + o > wx0 - 1 && dx + o < wx1 + 1).map(o => ({ x: dx + o, y: yc }))
                });
            },

            /** Area in front of the building kept clear of street trees (portico, steps, carpet). */
            _sqForecourt() {
                const g = this._sqPortico();
                return g ? { x: g.x0 - 34, y: g.yf, w: g.x1 - g.x0 + 68, h: 150 } : null;
            },

            /** Entrance lighting: a warm pool under the portico (the columns throw shadows) and uplights. */
            _sqLights() {
                const g = this._sqPortico();
                if (!g) return;
                this.attachedLights = this.attachedLights.filter(l => l.y > g.yb);   // the old door lamp sat inside the wall
                const add = (x, y, color, r) => { const l = new LampEntity({ x, y, lampType: 3, color, lightRadius: r }); l.visible = false; this.attachedLights.push(l); };
                add(g.dx, g.yf + 30, '#ffe2b8', 210);
                add(g.dx - 71, g.yc + 9, '#c8a8ff', 85); add(g.dx + 71, g.yc + 9, '#c8a8ff', 85);
                add(g.dx - 156, g.yc + 9, '#a469ff', 95); add(g.dx + 156, g.yc + 9, '#a469ff', 95);
                add(g.dx - 56, g.yf + 114, '#ffd9a0', 110); add(g.dx + 56, g.yf + 114, '#ffd9a0', 110);   // the globe lamps along the carpet
            },

            /** Pilaster positions (u along the face) and width. The entrance face aligns with the portico columns. */
            _sqPilasters(f) {
                if (f._sqPil) return f._sqPil;
                const len = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), g = this._sqPortico(), us = [0, 1];
                if (g && f.side === 'S' && Math.abs(f.y1 - g.yf) < 1 && g.dx > f.x1 && g.dx < f.x2) {
                    f._sqEntrance = true;
                    for (const o of SQ_PORTICO.pilasters) { const u = (g.dx + o - f.x1) / (f.x2 - f.x1); if (u > 0.04 && u < 0.96) us.push(u); }
                } else {
                    const cols = Math.max(1, Math.floor(len / 30));
                    for (let c = 2; c < cols - 1; c += 2) us.push(c / cols);
                }
                us.sort((a, b) => a - b);
                return (f._sqPil = { us, w: 8 / len, len });
            },

            _sqSpan(pil, u) { return u <= 0.001 ? [0, pil.w] : u >= 0.999 ? [1 - pil.w, 1] : [u - pil.w / 2, u + pil.w / 2]; },

            /** Windows hidden on the entrance face: behind the portico and the grand arched window. */
            _sqWindowMask(f) {
                this._sqPilasters(f);
                if (!f._sqEntrance) return null;
                const g = this._sqPortico(), um = (g.dx - f.x1) / (f.x2 - f.x1), hw = 60 / (f.x2 - f.x1);
                return (fl, u) => fl < SQ_PORTICO.floors || (fl <= 8 && Math.abs(u - um) < hw);
            },

            /** Verandas: glass-railed balconies in the bays between pilasters, every fourth floor. */
            _sqBalconies(f) {
                if (f._sqBal) return f._sqBal;
                const pil = this._sqPilasters(f), out = [];
                if (!f._sqEntrance) {
                    const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS);
                    for (let i = 0; i < pil.us.length - 1; i++) {
                        const u0 = this._sqSpan(pil, pil.us[i])[1] + pil.w * 0.45, u1 = this._sqSpan(pil, pil.us[i + 1])[0] - pil.w * 0.45;
                        if ((u1 - u0) * pil.len < 18) continue;
                        for (let fl = 4; fl < floors - 1; fl += 4) out.push({ u0, u1, fl, lit: _bldHash((this._seed || 7) + f.section * 13, i * 31 + fl) < 0.4 });
                    }
                    out.sort((a, b) => a.fl - b.fl);
                }
                return (f._sqBal = out);
            },

            /**
             * Per-face facade, on the landmark kit: the pilasters stand proud of the wall (fins),
             * the base course, the belt course at the portico's roof line and the crown cornice are
             * real ledges; capitals, plinths, fluting and dentils go out one path each. Emissive:
             * the uplights grazing the pilasters and the crown's downwash, one path per face, and the
             * ledges' lips catching the lamps' violet (LandmarkKit.rim).
             */
            _sqFace(ctx, f, P, emissive) {
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                const depth = Math.hypot(dx - ax, dy - ay);
                if (depth < 4) return;
                const ex = bx - ax, ey = by - ay, tx = cx - dx, ty = cy - dy, ux = dx - ax, uy = dy - ay;
                const at = (u, v) => [ax + ex * u + (ux + tx * u - ex * u) * v, ay + ey * u + (uy + ty * u - ey * u) * v];
                const sub = (p, u0, u1, v0, v1) => { const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1); p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath(); };
                const pil = this._sqPilasters(f), H = this._sqH(), lod = _zoomLOD, K = LandmarkKit, T = SQ_THEME;
                const vBelt = SQ_PORTICO.floors * CONFIG.BUILDINGS.FLOOR_HEIGHT / H;
                const nx = f.side === 'E' ? 1 : f.side === 'W' ? -1 : 0, ny = f.side === 'S' ? 1 : f.side === 'N' ? -1 : 0;
                const edge = [{ a: [ax, ay], b: [bx, by], nx, ny }];
                ctx.save();
                ctx.globalAlpha *= Math.min(1, (depth - 4) / 14);
                K.using(z => this._sqK(z), () => {
                    if (!emissive) {
                        const lips = [];
                        lips.push(K.ledge(ctx, edge, 0.025 * H, 2.5, 0.025 * H, '#3a2f5c', T.ground, 'rgba(217, 191, 134, 0.35)'));     // base course
                        // Pilasters: silver plates 3 px proud of the wall, a bright edge toward the light
                        const anchors = pil.us.map(u => ({ x: ax + ex * u, y: ay + ey * u, nx, ny }));
                        K.fins(ctx, anchors, 0.02 * H, 0.95 * H, 8, 3, T.silver, T.silverHi, null);
                        const caps = new Path2D(), plinths = new Path2D(), flutes = new Path2D();
                        for (const u of pil.us) {
                            const [u0, u1] = this._sqSpan(pil, u), cw = pil.w * 0.3;
                            sub(caps, Math.max(0, u0 - cw), Math.min(1, u1 + cw), 0.92, 0.955);
                            sub(plinths, Math.max(0, u0 - cw), Math.min(1, u1 + cw), 0, 0.03);
                            if (lod === 0) for (const tt of [0.28, 0.72]) { const uu = u0 + (u1 - u0) * tt, p0 = at(uu, 0.05), p1 = at(uu, 0.92); flutes.moveTo(p0[0], p0[1]); flutes.lineTo(p1[0], p1[1]); }
                        }
                        if (lod === 0) { ctx.strokeStyle = 'rgba(40,30,62,0.4)'; ctx.lineWidth = 0.6; ctx.stroke(flutes); }
                        ctx.fillStyle = T.silverHi; ctx.fill(caps);
                        ctx.fillStyle = '#8a82a8'; ctx.fill(plinths);
                        // Belt course at the portico's roof line, the crown cornice at the top
                        lips.push(K.ledge(ctx, edge, (vBelt + 0.012) * H, 3, 0.022 * H, '#6b5cae', T.roof, 'rgba(236, 226, 255, 0.55)'));
                        lips.push(K.ledge(ctx, edge, H, 4, 0.045 * H, '#ddd8ee', '#9d95bd', 'rgba(255, 250, 255, 0.7)'));
                        if (lod === 0) {                                                                         // dentils under the cornice
                            const n = Math.floor(pil.len / 6), den = new Path2D();
                            for (let i = 0; i < n; i++) { const u = (i + 0.3) / n; sub(den, u, u + 0.4 / n, 0.935, 0.952); }
                            ctx.fillStyle = 'rgba(38,28,58,0.55)'; ctx.fill(den);
                        }
                        f._sqLips = lips;
                        if (f._sqEntrance) this._sqArch(ctx, f, at, false);
                    } else if ((this._sqDark || 0) > 0.05) {
                        ctx.globalCompositeOperation = 'lighter';
                        const pulse = 0.82 + 0.18 * Math.sin(_gameTimeSec * 0.7 + (this._seed || 0));
                        const v0 = f._sqEntrance ? vBelt : 0, v1 = Math.min(1, v0 + 0.62);                     // entrance face is lit from the portico roof
                        if (f._sqEntrance) {                                                                     // violet wash rising from the portico
                            const um = (this._sqPortico().dx - f.x1) / (f.x2 - f.x1), c0 = at(um, vBelt), rr = Math.max(60, pil.len * 0.55);
                            const g = ctx.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], rr);
                            g.addColorStop(0, 'rgba(164,105,255,0.42)'); g.addColorStop(1, 'rgba(164,105,255,0)');
                            const w = new Path2D(); sub(w, 0, 1, vBelt, 1); ctx.fillStyle = g; ctx.fill(w);
                        }
                        // Uplights: a cone grazing up each pilaster and spilling onto the wall, and a hot stripe — one path each, one gradient each
                        const cones = new Path2D(), stripes = new Path2D();
                        for (const u of pil.us) {
                            const [u0, u1] = this._sqSpan(pil, u), um = (u0 + u1) / 2, w = u1 - u0;
                            const a = at(um - w * 0.7, v0), b = at(um + w * 0.7, v0), c = at(Math.min(1, um + w * 2.8), v1), d = at(Math.max(0, um - w * 2.8), v1);
                            cones.moveTo(a[0], a[1]); cones.lineTo(b[0], b[1]); cones.lineTo(c[0], c[1]); cones.lineTo(d[0], d[1]); cones.closePath();
                            sub(stripes, um - w * 0.2, um + w * 0.2, v0, v1);
                        }
                        const b0 = at(0.5, v0), t0 = at(0.5, v1);
                        const g = ctx.createLinearGradient(b0[0], b0[1], t0[0], t0[1]);
                        g.addColorStop(0, 'rgba(196,160,255,0.6)'); g.addColorStop(0.35, 'rgba(164,105,255,0.24)'); g.addColorStop(1, 'rgba(164,105,255,0)');
                        ctx.fillStyle = g; ctx.fill(cones);
                        const g2 = ctx.createLinearGradient(b0[0], b0[1], t0[0], t0[1]);
                        g2.addColorStop(0, 'rgba(255,240,255,0.55)'); g2.addColorStop(0.5, 'rgba(255,240,255,0)');
                        ctx.fillStyle = g2; ctx.fill(stripes);
                        const top = at(0.5, 1), low = at(0.5, 0.84);                                            // crown: downwash under the cornice
                        const g3 = ctx.createLinearGradient(top[0], top[1], low[0], low[1]);
                        g3.addColorStop(0, `rgba(200,168,255,${0.5 * pulse})`); g3.addColorStop(1, 'rgba(164,105,255,0)');
                        const dw = new Path2D(); sub(dw, 0, 1, 0.84, 1); ctx.fillStyle = g3; ctx.fill(dw);
                        const l0 = at(0, 0.99), l1 = at(1, 0.99);
                        ctx.strokeStyle = `rgba(236,226,255,${0.95 * pulse})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke();
                        const rim = K.rim(this, this._sqDark);                                                   // the ledges catch the lamps' violet
                        if (rim.a > 0.01 && f._sqLips) { ctx.strokeStyle = `rgba(${rim.rgb}, ${0.6 * rim.a})`; ctx.lineWidth = 1.2; for (const lp of f._sqLips) if (lp) ctx.stroke(lp); }
                        if (f._sqEntrance) this._sqArch(ctx, f, at, true);
                    }
                });
                ctx.restore();
            },

            /** Grand arched window above the portico, with an Art Deco sunburst fanlight and a hexagon keystone. */
            _sqArch(ctx, f, at, emissive) {
                const g = this._sqPortico(), H = this._sqH(), FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, L = f.x2 - f.x1;
                const um = (g.dx - f.x1) / L, hw = 54 / L;
                const v0 = (SQ_PORTICO.floors * FH + 4) / H, vs = 7.2 * FH / H, v1 = 9.1 * FH / H;   // sill, spring line, crown
                const arc = (a) => at(um + hw * Math.cos(a), vs + (v1 - vs) * Math.sin(a));
                const outline = () => {
                    const p0 = at(um - hw, v0), p1 = at(um + hw, v0);
                    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
                    for (let i = 0; i <= 12; i++) { const p = arc(i / 12 * Math.PI); ctx.lineTo(p[0], p[1]); }
                    ctx.closePath();
                };
                const line = (p, q) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
                const spring = at(um, vs), key = at(um, v1);
                const hex = (c, r) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.8); } ctx.closePath(); };
                if (!emissive) {
                    outline(); ctx.fillStyle = '#16122a'; ctx.fill();
                    ctx.strokeStyle = SQ_THEME.silver; ctx.lineWidth = 1.6; ctx.stroke();
                    ctx.strokeStyle = 'rgba(190,182,220,0.7)'; ctx.lineWidth = 0.8;
                    line(at(um - hw, vs), at(um + hw, vs));
                    for (const t of [-1 / 3, 1 / 3]) line(at(um + hw * t, v0), at(um + hw * t, vs));
                    for (let i = 1; i < 8; i++) line(spring, arc(i / 8 * Math.PI));
                    hex(key, 4.5); ctx.fillStyle = SQ_THEME.silverHi; ctx.fill();
                } else {
                    const a = at(um, v0), b = at(um, v1);
                    const gg = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
                    gg.addColorStop(0, 'rgba(255,205,160,0.28)'); gg.addColorStop(0.55, 'rgba(190,150,255,0.34)'); gg.addColorStop(1, 'rgba(164,105,255,0.5)');
                    outline(); ctx.fillStyle = gg; ctx.fill();
                    ctx.strokeStyle = 'rgba(226,210,255,0.85)'; ctx.lineWidth = 1;
                    for (let i = 1; i < 8; i++) line(spring, arc(i / 8 * Math.PI));
                    line(at(um - hw, vs), at(um + hw, vs));
                    outline(); ctx.strokeStyle = 'rgba(214,190,255,0.9)'; ctx.lineWidth = 1.4; ctx.stroke();
                    hex(key, 4.5); ctx.fillStyle = 'rgba(240,228,255,0.95)'; ctx.fill();
                }
            },

            /** Clip away the other sections' roofs (things drawn after the roof must still sit behind them). */
            _sqClipOtherRoofs(ctx, secIdx) {
                if (this.sections.length < 2) return;
                const H = this._sqH();
                ctx.beginPath(); ctx.rect(-1e6, -1e6, 2e6, 2e6);
                this.sections.forEach((s, i) => {
                    if (i === secIdx) return;
                    const a = this._sqP(this.x + s.x, this.y + s.y, H), b = this._sqP(this.x + s.x + s.w, this.y + s.y + s.h, H);
                    ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
                });
                ctx.clip('evenodd');
            },

            /** Veranda slabs (emissive pass, opaque, shaded to match the darkness layer) with glowing handrails. */
            _sqDrawBalconies(ctx, f, P, dark, glow) {
                const bals = this._sqBalconies(f);
                if (!bals.length || _zoomLOD >= 2) return;
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [dx, dy] = P(ax, ay);
                const depth = Math.hypot(dx - ax, dy - ay);
                if (depth < 6) return;
                const fade = Math.min(1, (depth - 6) / 16);
                const n = f.side === 'S' ? [0, 1] : f.side === 'N' ? [0, -1] : f.side === 'E' ? [1, 0] : [-1, 0];
                const FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, D = 6, RH = 3.5;
                const s = 1 - Math.min(1, dark) * 0.78;
                const rgb = (r, g, b) => `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)})`;
                const slab = rgb(60, 50, 88), glass = rgb(150, 140, 190), rail = rgb(228, 224, 244);
                const E = (u, o, z) => this._sqP(ax + (bx - ax) * u + n[0] * o, ay + (by - ay) * u + n[1] * o, z);
                const lit = dark > 0.05;
                // All the face's verandas batched: slabs, glass fronts and rails one path each (drawn in
                // order of height they'd overlap the same way; they never overlap on one face)
                const slabs = new Path2D(), fronts = new Path2D(), rails = new Path2D(), warm = new Path2D(), tops = new Path2D();
                const add = (P2, pts, close) => { P2.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) P2.lineTo(pts[i][0], pts[i][1]); if (close) P2.closePath(); };
                for (const b of bals) {
                    const z = (b.fl + 0.1) * FH, zr = z + RH;
                    const A = E(b.u0, 0, z), B = E(b.u1, 0, z), C = E(b.u1, D, z), Dd = E(b.u0, D, z);
                    const At = E(b.u0, 0, zr), Bt = E(b.u1, 0, zr), Ct = E(b.u1, D, zr), Dt = E(b.u0, D, zr);
                    add(slabs, [A, B, C, Dd], true); add(fronts, [Dd, C, Ct, Dt], true); add(rails, [At, Dt, Ct, Bt], false);
                    add(tops, [Dt, Ct], false);
                    if (b.lit) add(warm, [A, B, C, Dd], true);
                }
                ctx.save();
                this._sqClipOtherRoofs(ctx, f.section);
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade;
                ctx.fillStyle = slab; ctx.fill(slabs);
                ctx.globalAlpha = fade * 0.3; ctx.fillStyle = glass; ctx.fill(fronts);
                ctx.globalAlpha = fade; ctx.strokeStyle = rail; ctx.lineWidth = 0.9; ctx.stroke(rails);
                if (lit) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = fade * glow; ctx.fillStyle = 'rgba(255,196,140,0.22)'; ctx.fill(warm);
                    ctx.globalAlpha = fade * Math.min(1, glow * 1.4); ctx.strokeStyle = 'rgba(200,168,255,0.9)'; ctx.lineWidth = 1.1; ctx.stroke(tops);
                    const rim = LandmarkKit.rim(this, dark);                                                 // the rails catch the lamps' violet
                    if (rim.a > 0.01) { ctx.globalAlpha = fade * rim.a; ctx.strokeStyle = `rgba(${rim.rgb}, 0.45)`; ctx.lineWidth = 0.9; ctx.stroke(rails); }
                }
                ctx.restore();
            },

            /** Base pass: the portico's columns and roof terrace. */
            _sqDrawPortico(ctx) {
                const g = this._sqPortico();
                if (!g) return;
                const cam = game.camera, T = SQ_THEME, lod = _zoomLOD, P3 = (x, y, z) => this._sqP(x, y, z);
                const pl = game.player;
                const under = !game.isDriving && pl && pl.x > g.x0 - 8 && pl.x < g.x1 + 8 && pl.y > g.yf - 8 && pl.y < g.yb + 12;
                const f0 = this._sqFade == null ? 1 : this._sqFade;
                this._sqFade = f0 + ((under ? 0.3 : 1) - f0) * 0.15;
                ctx.save();
                // Portico roof, faded while the player is underneath
                ctx.globalAlpha *= this._sqFade;
                const zc = g.z, zf = zc - 4;
                const fascia = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); ctx.fill(); };
                ctx.fillStyle = '#a79fc8';
                if (cam.y > g.yb) fascia([P3(g.x0, g.yb, zf), P3(g.x1, g.yb, zf), P3(g.x1, g.yb, zc), P3(g.x0, g.yb, zc)]);
                if (cam.x < g.x0) fascia([P3(g.x0, g.yf, zf), P3(g.x0, g.yb, zf), P3(g.x0, g.yb, zc), P3(g.x0, g.yf, zc)]);
                if (cam.x > g.x1) fascia([P3(g.x1, g.yf, zf), P3(g.x1, g.yb, zf), P3(g.x1, g.yb, zc), P3(g.x1, g.yf, zc)]);
                const k = this._sqK(zc), w = g.x1 - g.x0, d = SQ_PORTICO.depth;
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                ctx.fillStyle = T.plum; ctx.fillRect(g.x0, g.yf, w, d);
                ctx.fillStyle = T.terrace; ctx.fillRect(g.x0 + 5, g.yf + 4, w - 10, d - 9);
                if (lod === 0) {                                                                             // marble inlay
                    ctx.save(); ctx.beginPath(); ctx.rect(g.x0 + 5, g.yf + 4, w - 10, d - 9); ctx.clip();
                    ctx.strokeStyle = 'rgba(210,195,250,0.08)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let x = g.x0 - d; x < g.x1 + d; x += 14) { ctx.moveTo(x, g.yf); ctx.lineTo(x + d, g.yf + d); ctx.moveTo(x + d, g.yf); ctx.lineTo(x, g.yf + d); }
                    ctx.stroke(); ctx.restore();
                }
                ctx.strokeStyle = '#9d95bd'; ctx.lineWidth = 2; ctx.strokeRect(g.x0 + 1, g.yf + 1, w - 2, d - 2);
                // Balustrade along the front edge
                ctx.strokeStyle = '#d8d2ea'; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.moveTo(g.x0 + 3, g.yb - 3); ctx.lineTo(g.x1 - 3, g.yb - 3); ctx.moveTo(g.x0 + 3, g.yf + 3); ctx.lineTo(g.x0 + 3, g.yb - 3); ctx.moveTo(g.x1 - 3, g.yf + 3); ctx.lineTo(g.x1 - 3, g.yb - 3); ctx.stroke();
                if (lod === 0) { ctx.fillStyle = '#bdb6d6'; for (let x = g.x0 + 7; x < g.x1 - 5; x += 5) ctx.fillRect(x - 0.6, g.yb - 4.6, 1.2, 3.2); }
                // Winged hexagon lanterns either side of the sign
                for (const s of [-1, 1]) this._sqWingedHex(ctx, g.dx + s * SQ_ENTRY.hexX, g.yf + d * 0.5, 9, false);
                // Uplight housings at the pilaster feet, against the wall
                ctx.fillStyle = '#7d75a0';
                for (const o of SQ_PORTICO.pilasters) ctx.fillRect(g.dx + o - 5, g.yf + 1, 10, 3);
                ctx.restore();
            },

            /** Lantern columns: hexagonal plinth, silver shaft, a gilt collar under the lantern, hexagon lantern on top.
                Drawn after the sign (they stand in front of the portico), before the building's roof. */
            _sqDrawColumns(ctx) {
                const g = this._sqPortico();
                if (!g) return;
                const T = SQ_THEME, r = SQ_PORTICO.colR, P3 = (x, y, z) => this._sqP(x, y, z);
                const hex = (x, y, rr) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); };
                const zC = g.zCol * 0.8, kT = this._sqK(g.zCol), kC = this._sqK(zC);
                ctx.save();
                // All eight columns batched: plinths, shafts (silver, a bright line down the lit side, a dark one down the other), collars, lanterns
                const plin = new Path2D(), shafts = new Path2D(), hiL = new Path2D(), loL = new Path2D(), collars = new Path2D(), lanO = new Path2D(), lanI = new Path2D();
                const hexP = (P2, x, y, rr) => { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; P2[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } P2.closePath(); };
                for (const c of g.cols) {
                    hexP(plin, c.x, c.y, r + 2.8);
                    const t0 = P3(c.x, c.y, g.zCol);
                    const vx = t0[0] - c.x, vy = t0[1] - c.y, L = Math.hypot(vx, vy) || 1, px = -vy / L, py = vx / L;
                    shafts.moveTo(c.x - px * r, c.y - py * r); shafts.lineTo(t0[0] - px * r * kT, t0[1] - py * r * kT);
                    shafts.lineTo(t0[0] + px * r * kT, t0[1] + py * r * kT); shafts.lineTo(c.x + px * r, c.y + py * r); shafts.closePath();
                    shafts.moveTo(c.x + r, c.y); shafts.arc(c.x, c.y, r, 0, Math.PI * 2);
                    hiL.moveTo(c.x - px * r * 0.2, c.y - py * r * 0.2); hiL.lineTo(t0[0] - px * r * 0.2 * kT, t0[1] - py * r * 0.2 * kT);
                    loL.moveTo(c.x + px * r * 0.75, c.y + py * r * 0.75); loL.lineTo(t0[0] + px * r * 0.75 * kT, t0[1] + py * r * 0.75 * kT);
                    const cc = P3(c.x, c.y, zC);                                                           // gilt collar under the lantern
                    collars.moveTo(cc[0] - px * r * kC * 1.15, cc[1] - py * r * kC * 1.15); collars.lineTo(cc[0] + px * r * kC * 1.15, cc[1] + py * r * kC * 1.15);
                    hexP(lanO, t0[0], t0[1], (r + 1.8) * kT); hexP(lanI, t0[0], t0[1], (r + 0.2) * kT);  // lantern: silver frame, violet glass
                }
                ctx.fillStyle = '#4c4468'; ctx.fill(plin); ctx.strokeStyle = '#a49cc6'; ctx.lineWidth = 1; ctx.stroke(plin);
                ctx.fillStyle = T.silver; ctx.fill(shafts);
                ctx.lineWidth = r * 0.7; ctx.strokeStyle = T.silverHi; ctx.stroke(hiL); ctx.strokeStyle = T.silverDk; ctx.lineWidth = r * 0.45; ctx.stroke(loL);
                ctx.strokeStyle = '#d9bf86'; ctx.lineWidth = 1.6; ctx.stroke(collars);
                ctx.fillStyle = '#e4e0f2'; ctx.fill(lanO); ctx.fillStyle = '#5b4d86'; ctx.fill(lanI);
                for (const [ox, oy] of SQ_ENTRY.posts) {                                                    // triple-globe lamp posts
                    const x = g.dx + ox, y = g.yf + oy, top = P3(x, y, 26), kk = this._sqK(26);
                    ctx.strokeStyle = '#3a2a6e'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(top[0], top[1]); ctx.stroke();
                    const l = P3(x - 9, y, 26), rr = P3(x + 9, y, 26);
                    ctx.strokeStyle = T.gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(rr[0], rr[1]); ctx.stroke();
                    for (const gx of [-9, 0, 9]) {
                        const q = P3(x + gx, y, gx ? 26 : 30);
                        ctx.fillStyle = '#f4ecff'; ctx.beginPath(); ctx.arc(q[0], q[1], 3.3 * kk, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = 'rgba(189,168,238,0.9)'; ctx.lineWidth = 0.7; ctx.stroke();
                    }
                }
                ctx.restore();
            },

            /** Ground layer: marble portico floor, steps and the violet carpet to the curb. */
            _sqDrawGround(ctx) {
                const g = this._sqPortico();
                if (!g) return;
                const w = g.x1 - g.x0, d = SQ_PORTICO.colLine + 8;
                ctx.save();
                // The floor: square marble flags (not the roof's diagonal inlay, so the two never read as one)
                ctx.fillStyle = '#231a44'; ctx.fillRect(g.x0, g.yf, w, d);
                ctx.strokeStyle = 'rgba(205,190,245,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
                for (let x = g.x0 + 17; x < g.x1; x += 17) { ctx.moveTo(x, g.yf); ctx.lineTo(x, g.yf + d); }
                for (let y = g.yf + 17; y < g.yf + d; y += 17) { ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); }
                ctx.stroke();
                // The portico's shade on the floor under it: deep by the doors, lifting at its front edge
                const sh = ctx.createLinearGradient(0, g.yf, 0, g.yb + 6);
                sh.addColorStop(0, 'rgba(6, 2, 16, 0.55)'); sh.addColorStop(0.85, 'rgba(6, 2, 16, 0.35)'); sh.addColorStop(1, 'rgba(6, 2, 16, 0)');
                ctx.fillStyle = sh; ctx.fillRect(g.x0, g.yf, w, g.yb + 6 - g.yf);
                // Each lantern column's contact shadow, where it meets the floor
                ctx.fillStyle = 'rgba(6, 2, 16, 0.45)'; ctx.beginPath();
                for (const c of g.cols) { ctx.moveTo(c.x + 9, c.y + 2); ctx.ellipse(c.x + 1.5, c.y + 2, 7.5, 4, 0, 0, Math.PI * 2); }
                ctx.fill();
                ctx.restore();
                ctx.save();
                const ys = g.yf + d;                                                                          // steps
                ctx.fillStyle = '#3b3452'; ctx.fillRect(g.x0 - 3, ys, w + 6, 5);
                ctx.fillStyle = '#2f2943'; ctx.fillRect(g.x0 - 6, ys + 5, w + 12, 5);
                ctx.fillStyle = 'rgba(220,210,245,0.28)'; ctx.fillRect(g.x0 - 3, ys, w + 6, 1); ctx.fillRect(g.x0 - 6, ys + 5, w + 12, 1);
                const rw = 40, rx = g.dx - rw / 2, rl = 132;                                                  // carpet
                ctx.fillStyle = '#3a1d63'; ctx.fillRect(rx, g.yf, rw, rl);
                ctx.fillStyle = '#56309a'; ctx.fillRect(rx + 3, g.yf, rw - 6, rl);
                ctx.strokeStyle = 'rgba(217,191,134,0.6)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(rx + 5, g.yf); ctx.lineTo(rx + 5, g.yf + rl); ctx.moveTo(rx + rw - 5, g.yf); ctx.lineTo(rx + rw - 5, g.yf + rl); ctx.stroke();
                const E = SQ_ENTRY, T = SQ_THEME;
                for (const s of [-1, 1]) {                                                                    // velvet rope on gold stanchions
                    const xs = g.dx + s * E.ropeX;
                    ctx.beginPath();
                    for (let i = 0; i < E.ropeY.length - 1; i++) { const y0 = g.yf + E.ropeY[i], y1 = g.yf + E.ropeY[i + 1]; ctx.moveTo(xs, y0); ctx.quadraticCurveTo(xs + s * 3, (y0 + y1) / 2, xs, y1); }
                    ctx.strokeStyle = '#5a1fa8'; ctx.lineWidth = 1.8; ctx.stroke();
                    ctx.strokeStyle = 'rgba(200,160,255,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
                    for (const yo of E.ropeY) {
                        const y = g.yf + yo;
                        ctx.fillStyle = '#6b5023'; ctx.beginPath(); ctx.arc(xs, y, 3.4, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = T.gold; ctx.beginPath(); ctx.arc(xs, y, 2.3, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = T.goldHi; ctx.beginPath(); ctx.arc(xs - 0.7, y - 0.7, 0.9, 0, Math.PI * 2); ctx.fill();
                    }
                }
                const px = g.dx + E.podium[0], py = g.yf + E.podium[1];                                      // doorman's podium and guest book
                ctx.fillStyle = T.bay; ctx.fillRect(px - 7, py - 5, 14, 10);
                ctx.strokeStyle = T.gold; ctx.lineWidth = 1; ctx.strokeRect(px - 7, py - 5, 14, 10);
                ctx.fillStyle = T.trim; ctx.fillRect(px - 4, py - 3, 8, 3);
                for (const [ox, oy] of E.posts) {                                                             // lamp post footings
                    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(g.dx + ox + 2, g.yf + oy + 2, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = T.bay; ctx.beginPath(); ctx.arc(g.dx + ox, g.yf + oy, 4, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = T.gold; ctx.lineWidth = 1; ctx.stroke();
                }
                ctx.restore();
            },

            /** Emissive: marquee bulbs, column uplights, lanterns. */
            _sqDrawPorticoGlow(ctx, dark, glow) {
                const g = this._sqPortico();
                if (!g || dark < 0.05) return;
                const cam = game.camera, t = _gameTimeSec, lod = _zoomLOD, fade = this._sqFade == null ? 1 : this._sqFade;
                const P3 = (x, y, z) => this._sqP(x, y, z), a = Math.min(1, glow * 1.4);
                const line = (p, q) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
                for (const c of g.cols) {                                                                    // hot stripe up each shaft
                    const t0 = P3(c.x, c.y, g.zCol);
                    const gr = ctx.createLinearGradient(c.x, c.y + 2, t0[0], t0[1]);
                    gr.addColorStop(0, `rgba(240,222,255,${0.85 * a})`); gr.addColorStop(1, 'rgba(164,105,255,0)');
                    ctx.strokeStyle = gr; ctx.lineWidth = 2.2; line([c.x, c.y + 2], t0);
                    ctx.fillStyle = `rgba(236,220,255,${0.9 * a})`; ctx.beginPath(); ctx.arc(c.x, c.y + SQ_PORTICO.colR + 3.5, 1.5, 0, Math.PI * 2); ctx.fill();
                }
                if (!lod) {                                                                                  // glitter on the wet marble and carpet
                    const wet = game.weather && game.weather.isRaining ? 1 : 0.6, pl = game.player;
                    for (let i = 0; i < 34; i++) {
                        const gx = g.x0 - 20 + (g.x1 - g.x0 + 40) * _bldHash(4242, i), gy = g.yf + 58 + 76 * _bldHash(4243, i);
                        const tw = Math.pow(Math.max(0, Math.sin(t * (1.6 + _bldHash(4244, i)) + i * 2.3)), 10);
                        if (tw < 0.04 || (pl && Math.abs(pl.x - gx) < 14 && Math.abs(pl.y - gy) < 18)) continue;
                        ctx.fillStyle = i % 4 ? `rgba(236,224,255,${tw * a * wet})` : `rgba(255,226,180,${tw * a * wet})`;
                        sqGlint(ctx, gx, gy, 1 + tw * 3.5);
                    }
                }
                for (let i = 0; i < 5; i++) {                                                                // low mist rolling off the steps
                    const u = (t * 0.015 + i / 5) % 1, m = Math.sin(u * Math.PI);
                    sqGlow(ctx, g.x0 - 30 + (g.x1 - g.x0 + 60) * u, g.yf + 92 + Math.sin(t * 0.3 + i * 1.7) * 14, 70,
                           `rgba(170,140,255,${0.1 * a * m})`, 'rgba(170,140,255,0)');
                }
                ctx.globalAlpha = fade;
                if (cam.y > g.yb - 2) {                                                                      // marquee bulbs chasing along the fascia
                    const zb = g.z - 2, n = Math.floor((g.x1 - g.x0 - 8) / (lod ? 14 : 9));
                    for (let i = 0; i <= n; i++) {
                        const p = P3(g.x0 + 4 + (g.x1 - g.x0 - 8) * i / n, g.yb, zb);
                        const on = 0.35 + 0.65 * Math.pow(Math.max(0, Math.cos(i * 0.55 - t * 4.2)), 3);
                        ctx.fillStyle = i % 2 ? `rgba(214,186,255,${on * a})` : `rgba(255,238,214,${on * a})`;
                        ctx.beginPath(); ctx.arc(p[0], p[1], 1.5, 0, Math.PI * 2); ctx.fill();
                        if (!lod) { ctx.fillStyle = `rgba(200,168,255,${on * a * 0.22})`; ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2); ctx.fill(); }
                    }
                    ctx.strokeStyle = `rgba(190,150,255,${0.75 * a})`; ctx.lineWidth = 1.2;
                    line(P3(g.x0, g.yb, g.z - 4.5), P3(g.x1, g.yb, g.z - 4.5));
                }
                const k = this._sqK(g.z), d = SQ_PORTICO.depth;
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                ctx.fillStyle = `rgba(244,232,255,${0.95 * a})`;                                             // uplight slots at the pilaster feet
                for (const o of SQ_PORTICO.pilasters) ctx.fillRect(g.dx + o - 4, g.yf + 1.5, 8, 1.8);
                ctx.globalAlpha = fade * a;
                for (const s of [-1, 1]) this._sqWingedHex(ctx, g.dx + s * SQ_ENTRY.hexX, g.yf + d * 0.5, 9, true);
                ctx.restore();
                // Hexagon lanterns crowning the columns (the pair at the door burns warmest)
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const kT = this._sqK(g.zCol);
                for (const c of g.cols) {
                    const p = P3(c.x, c.y, g.zCol), near = Math.abs(c.x - g.dx) < 100, flick = 0.92 + 0.08 * Math.sin(t * 2.7 + c.x);
                    const rr = (near ? 20 : 15) * kT, a0 = ctx.globalAlpha;                                      // glow sprites, violet halo round a warm core
                    ctx.globalAlpha = a0 * 0.3 * a * flick; drawGlow(ctx, p[0], p[1], rr, '180, 130, 255', 0);
                    ctx.globalAlpha = a0 * (near ? 0.75 : 0.6) * a * flick; drawGlow(ctx, p[0], p[1], rr * 0.4, near ? '255, 236, 220' : '214, 186, 255', 0);
                    ctx.globalAlpha = a0;
                    ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](p[0] + Math.cos(an) * 5.6 * kT, p[1] + Math.sin(an) * 5.6 * kT); } ctx.closePath();
                    ctx.fillStyle = near ? `rgba(255,244,236,${0.95 * a})` : `rgba(232,218,255,${0.9 * a})`; ctx.fill();
                }
                for (const [ox, oy] of SQ_ENTRY.posts) for (const gx of [-9, 0, 9]) {                         // glitter globes on the lamp posts
                    const q = P3(g.dx + ox + gx, g.yf + oy, gx ? 26 : 30), f = 0.9 + 0.1 * Math.sin(t * 3.1 + gx + oy);
                    sqGlow(ctx, q[0], q[1], 13, `rgba(255,220,170,${0.55 * a * f})`, 'rgba(255,200,150,0)');
                    ctx.fillStyle = `rgba(255,248,235,${0.95 * a})`; ctx.beginPath(); ctx.arc(q[0], q[1], 2.8, 0, Math.PI * 2); ctx.fill();
                    const tw = lod ? 0 : Math.pow(Math.max(0, Math.sin(t * 4.3 + gx * 0.7 + oy)), 8);
                    if (tw > 0.05) { ctx.fillStyle = `rgba(255,255,255,${tw * a})`; sqGlint(ctx, q[0] + 1.5, q[1] - 1.5, 2 + tw * 4); }
                }
                ctx.restore();
            },

            /** Emissive structure: verandas on every visible face, then the portico glow. */
            _sqEmissiveStructure(ctx, dark, glow) {
                const cam = game.camera, k = 1 + this._leanScale();
                const P = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                for (const f of this._visibleFaces(cam)) this._sqDrawBalconies(ctx, f, P, dark, glow);
                this._sqDrawPorticoGlow(ctx, dark, glow);
            },

            /** Two violet searchlights sweeping the night sky from the tower's front corners. */
            _sqDrawBeams(ctx, dark) {
                if (dark < 0.2 || _zoomLOD >= 2) return;
                const H = this._sqH(), main = this.sections[0], t = _gameTimeSec;
                const a = Math.min(1, (dark - 0.2) / 0.3);
                const srcs = [[this.x + main.x + 34, this.y + main.y + main.h - 34, 0], [this.x + main.x + main.w - 34, this.y + main.y + main.h - 34, 2.3]];
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
                for (const [sx, sy, ph] of srcs) {
                    const az = -Math.PI / 2 + (ph ? 0.45 : -0.45) + Math.sin(t * 0.19 + ph) * 0.95;
                    const elev = 1.02 + 0.16 * Math.sin(t * 0.11 + ph * 1.7);
                    const zTop = leanCamHeight() * 0.8, run = (zTop - H) / Math.tan(elev);
                    const p0 = this._sqP(sx, sy, H), p1 = this._sqP(sx + Math.cos(az) * run, sy + Math.sin(az) * run, zTop);
                    const vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
                    const beam = (w0, w1, c0, c1) => {
                        const gr = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
                        gr.addColorStop(0, c0); gr.addColorStop(0.3, c1); gr.addColorStop(1, 'rgba(120,70,255,0)');
                        ctx.fillStyle = gr; ctx.beginPath();
                        ctx.moveTo(p0[0] + nx * w0, p0[1] + ny * w0); ctx.lineTo(p1[0] + nx * w1, p1[1] + ny * w1);
                        ctx.lineTo(p1[0] - nx * w1, p1[1] - ny * w1); ctx.lineTo(p0[0] - nx * w0, p0[1] - ny * w0); ctx.closePath(); ctx.fill();
                    };
                    const w1 = Math.max(60, L * 0.13);
                    beam(8, w1, `rgba(200,168,255,${0.2 * a})`, `rgba(164,105,255,${0.07 * a})`);
                    beam(2.5, w1 * 0.3, `rgba(246,236,255,${0.32 * a})`, `rgba(200,168,255,${0.08 * a})`);
                    const rg = ctx.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], 16);
                    rg.addColorStop(0, `rgba(255,248,255,${0.9 * a})`); rg.addColorStop(1, 'rgba(200,168,255,0)');
                    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p0[0], p0[1], 16, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            },

            /** Glass walls for the raised penthouse tier (called inside the roof transform). */
            _sqPenthouseWalls(ctx, px, py, pw, ph, k, emissive) {
                const cam = game.camera, Q = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                const sides = [];
                if (cam.y > py + ph) sides.push([[px, py + ph], [px + pw, py + ph]]);
                if (cam.y < py) sides.push([[px + pw, py], [px, py]]);
                if (cam.x < px) sides.push([[px, py], [px, py + ph]]);
                if (cam.x > px + pw) sides.push([[px + pw, py + ph], [px + pw, py]]);
                for (const [a, b] of sides) {
                    const c = Q(b[0], b[1]), d = Q(a[0], a[1]);
                    if (Math.hypot(d[0] - a[0], d[1] - a[1]) < 2) continue;
                    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
                    const m0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m1 = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
                    const gr = ctx.createLinearGradient(m0[0], m0[1], m1[0], m1[1]);
                    if (!emissive) {
                        gr.addColorStop(0, '#1a0d52'); gr.addColorStop(1, '#3b2c86'); ctx.fillStyle = gr; ctx.fill();
                        const n = Math.max(2, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
                        ctx.strokeStyle = '#b3a6ea'; ctx.lineWidth = 0.8; ctx.beginPath();
                        for (let i = 1; i < n; i++) { const u = i / n; ctx.moveTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u); ctx.lineTo(d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u); }
                        ctx.stroke();
                    } else {
                        const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
                        gr.addColorStop(0, 'rgba(255,205,160,0.3)'); gr.addColorStop(1, 'rgba(190,150,255,0.45)'); ctx.fillStyle = gr; ctx.fill();
                        ctx.globalCompositeOperation = op;
                    }
                }
            }
        });

        // =====================================================================
        //  SILVER QUEEN — the dream layer: moon garden, reflecting pool, eclipse
        //  pad, crescent spire under a floating crown, and the entrance dressing
        // =====================================================================
        const SQ_ROOF = {
            garden: [0.05, 0.08, 0.42, 0.36],      // [x, y, w, h] as fractions of the main block
            pool: [0.54, 0.13, 0.36, 0.27],
            spireZ: 232, ringZ: 256, ringR: 40
        };
        const SQ_ENTRY = {                          // offsets from the door centre / entrance face (px)
            posts: [[-56, 100], [56, 100], [-56, 128], [56, 128]],
            ropeX: 25, ropeY: [82, 104, 126], podium: [86, 96], hexX: 142
        };

        function sqHex(ctx, cx, cy, r, rot = 0) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
            ctx.closePath();
        }
        /** Crescent of radius R with its horns pointing along rot; thick = body width as a fraction of R. */
        function sqCrescent(ctx, cx, cy, R, rot, thick = 0.5, a = 0.9) {
            const m = R * (1 - thick), d = (R * R - m * m) / (2 * (m + R * Math.cos(a))), r2 = d + m;
            const h = Math.atan2(R * Math.sin(a), R * Math.cos(a) - d);
            ctx.beginPath();
            ctx.arc(cx, cy, R, rot + a, rot + Math.PI * 2 - a);
            ctx.arc(cx + Math.cos(rot) * d, cy + Math.sin(rot) * d, r2, rot - h, rot + h, true);
            ctx.closePath();
        }
        function sqGlint(ctx, x, y, s) { ctx.fillRect(x - s, y - 0.5, s * 2, 1); ctx.fillRect(x - 0.5, y - s, 1, s * 2); }
        /** A soft round glow from colour c0 at the centre to nothing at r — a stamped glow sprite
            (core/draw-helpers.js), not a new gradient per call. c0 is 'rgba(r,g,b,a)'. */
        const _sqGlowParse = new Map();
        function sqGlow(ctx, x, y, r, c0) {
            let q = _sqGlowParse.get(c0);
            if (!q) { const m = c0.match(/[\d.]+/g); q = [m[0] + ', ' + m[1] + ', ' + m[2], m[3] == null ? 1 : +m[3]]; if (_sqGlowParse.size > 400) _sqGlowParse.clear(); _sqGlowParse.set(c0, q); }
            if (q[1] <= 0.003 || r <= 0) return;
            const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * Math.min(1, q[1]);
            drawGlow(ctx, x, y, r, q[0], 0);
            ctx.globalAlpha = a0;
        }

        Object.assign(BuildingV2.prototype, {
            /** Roof transform is applied by the caller (world coords at roof height). */
            /** Night finish: a low mist veil round the base, moonlight sliding slowly over the lacquer roofs. */
            _sqVeil(ctx, dark) {
                if (dark < 0.2) return;
                const t = _gameTimeSec, a = Math.min(1, (dark - 0.2) * 1.6);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (_zoomLOD === 0) for (const s of this.sections) {                                           // mist hugging the footprint
                    const x = this.x + s.x, y = this.y + s.y;
                    for (let i = 0; i < 2; i++) {
                        const u = ((t * 0.015 + i * 0.5 + s.x * 0.001) % 1), px = x + s.w * u, py = y + s.h + 10 + Math.sin(t * 0.3 + i) * 6;
                        sqGlow(ctx, px, py, 70, `rgba(190,170,255,${0.1 * a * Math.sin(u * Math.PI)})`, 'rgba(190,170,255,0)');
                    }
                }
                const cam = game.camera, k = 1 + this._leanScale();                                            // moonlit specular across the roofs
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                const b = this.getBounds(), sweep = ((t * 0.012) % 1.6) - 0.3, sx = b.x + b.w * sweep;
                ctx.beginPath(); for (const s of this.sections) ctx.rect(this.x + s.x, this.y + s.y, s.w, s.h); ctx.clip();
                const g = ctx.createLinearGradient(sx - 140, b.y, sx + 140, b.y + 90);
                g.addColorStop(0, 'rgba(220,210,255,0)'); g.addColorStop(0.5, `rgba(220,210,255,${0.07 * a})`); g.addColorStop(1, 'rgba(220,210,255,0)');
                ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.restore();
            },

            _sqDrawRoof(ctx, emissive) {
                if (emissive && (this._sqDark || 0) <= 0.05) return;
                const main = this.sections[0], mx = this.x + main.x, my = this.y + main.y;
                const box = (s) => [mx + s[0] * main.w, my + s[1] * main.h, s[2] * main.w, s[3] * main.h];
                this._sqGarden(ctx, box(SQ_ROOF.garden), emissive);
                this._sqPool(ctx, box(SQ_ROOF.pool), emissive);
                const wing = this.sections[1];
                if (wing) this._sqEclipsePad(ctx, this.x + wing.x, this.y + wing.y, wing.w, wing.h, emissive);
            },

            /** Moon garden: wisteria trees, an arched pergola walk, two silk cabanas that stir in the wind. */
            _sqGarden(ctx, [x, y, w, h], emissive) {
                const t = _gameTimeSec, lod = _zoomLOD, T = SQ_THEME, r = (i) => _bldHash(777, i);
                const y0 = y + h * 0.43, y1 = y + h * 0.57, ribs = 7, ribX = (i) => x + w * (0.08 + i * 0.66 / (ribs - 1));
                const cabs = [[x + w * 0.86, y + h * 0.22], [x + w * 0.86, y + h * 0.78]];
                if (!emissive) {
                    ctx.fillStyle = '#2e2266'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
                    ctx.strokeStyle = 'rgba(217,191,134,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
                    ctx.fillStyle = 'rgba(214,202,240,0.22)'; ctx.fillRect(x + w * 0.05, y0, w * 0.9, y1 - y0);      // pale stone walk
                    for (let i = 0; i < 8; i++) {
                        const cx = x + w * (0.1 + (i >> 1) * 0.17), cy = (i & 1) ? y + h * 0.8 : y + h * 0.2, rr = 11 + r(i) * 6, wist = r(i + 40) < 0.5;
                        ctx.fillStyle = 'rgba(16,0,51,0.35)'; ctx.beginPath(); ctx.arc(cx + 3, cy + 3, rr, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = wist ? '#6a4fb8' : '#2c6a4f'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = wist ? '#9d7de6' : '#3f8a62'; ctx.beginPath(); ctx.arc(cx - rr * 0.25, cy - rr * 0.25, rr * 0.6, 0, Math.PI * 2); ctx.fill();
                        if (wist && lod === 0) {
                            ctx.fillStyle = '#e2d4ff';
                            for (let j = 0; j < 5; j++) { const a = j * 1.26 + i; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr * 0.55, cy + Math.sin(a) * rr * 0.55, 1.3, 0, Math.PI * 2); ctx.fill(); }
                        }
                    }
                    ctx.strokeStyle = T.trim; ctx.lineWidth = 1.4; ctx.beginPath();                         // pergola rails and arched ribs
                    ctx.moveTo(ribX(0) - 6, y0 - 4); ctx.lineTo(ribX(ribs - 1) + 6, y0 - 4);
                    ctx.moveTo(ribX(0) - 6, y1 + 4); ctx.lineTo(ribX(ribs - 1) + 6, y1 + 4); ctx.stroke();
                    ctx.lineWidth = 2.2; ctx.beginPath();
                    for (let i = 0; i < ribs; i++) { const rx = ribX(i); ctx.moveTo(rx, y0 - 8); ctx.quadraticCurveTo(rx + 6, (y0 + y1) / 2, rx, y1 + 8); }
                    ctx.stroke();
                    if (lod < 2) {                                                                              // wisteria hanging from the ribs
                        const cols = ['#b79cf0', '#9d7de6', '#d8c6ff'], span = ribX(ribs - 1) - ribX(0);
                        for (let i = 0; i < (lod ? 16 : 34); i++) {
                            ctx.fillStyle = cols[i % 3]; ctx.beginPath();
                            ctx.arc(ribX(0) + span * r(i + 60), y0 - 6 + (y1 - y0 + 12) * r(i + 90), 1.5 + r(i + 120) * 2, 0, Math.PI * 2); ctx.fill();
                        }
                    }
                    const wind = game.weather ? game.weather.windVec : { x: 1, y: 0.5 };
                    cabs.forEach(([cx, cy], i) => this._sqCabana(ctx, cx, cy, 15, i, wind, t));
                } else {
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    const a = ctx.globalAlpha;
                    for (let i = 0; i < ribs; i++) for (const py of [y0 - 4, y1 + 4]) {                   // gold lanterns on the pergola
                        const rx = ribX(i), f = 0.8 + 0.2 * Math.sin(t * 2.1 + i * 1.3 + py);
                        if (lod === 0) sqGlow(ctx, rx, py, 10, `rgba(255,214,150,${0.5 * f})`, 'rgba(255,214,150,0)');
                        ctx.fillStyle = `rgba(255,240,210,${0.95 * f})`; ctx.beginPath(); ctx.arc(rx, py, 1.5, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 0.6));                                  // wisteria breathing over the walk
                    const g = ctx.createLinearGradient(0, y0 - 10, 0, y1 + 10);
                    g.addColorStop(0, 'rgba(180,150,255,0)'); g.addColorStop(0.5, 'rgba(180,150,255,0.24)'); g.addColorStop(1, 'rgba(180,150,255,0)');
                    ctx.fillStyle = g; ctx.fillRect(ribX(0) - 8, y0 - 10, ribX(ribs - 1) - ribX(0) + 16, y1 - y0 + 20);
                    ctx.globalAlpha = a;
                    for (const [cx, cy] of cabs) sqGlow(ctx, cx, cy, 28, 'rgba(255,186,214,0.4)', 'rgba(255,186,214,0)');   // candlelight in the cabanas
                    ctx.restore();
                }
            },

            /** A cabana from above: folded canopy, sheer curtains billowing out on the downwind sides. */
            _sqCabana(ctx, cx, cy, s, seed, wind, t) {
                const wl = Math.hypot(wind.x, wind.y) || 1, wx = wind.x / wl, wy = wind.y / wl, gust = Math.min(1, wl / 4);
                ctx.fillStyle = 'rgba(185,162,245,0.55)';
                [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([nx, ny], k) => {
                    const push = Math.max(0, nx * wx + ny * wy), tx = -ny, ty = nx, ex = cx + nx * s, ey = cy + ny * s;
                    ctx.beginPath(); ctx.moveTo(ex - tx * s, ey - ty * s);
                    for (let j = 0; j <= 6; j++) {
                        const u = j / 3 - 1, billow = (1.5 + push * gust * (3 + 2.5 * Math.sin(t * 1.8 + seed * 2 + k + j * 0.9))) * Math.sin(j / 6 * Math.PI);
                        ctx.lineTo(ex + tx * s * u + nx * billow, ey + ty * s * u + ny * billow);
                    }
                    ctx.closePath(); ctx.fill();
                });
                ctx.fillStyle = '#efe9ff'; ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
                ctx.strokeStyle = '#c9bdf2'; ctx.lineWidth = 0.8; ctx.beginPath();
                ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
                ctx.fillStyle = SQ_THEME.gold; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
            },

            /** Reflecting pool: dark water holding the stars, the moon and a scatter of lotus. */
            _sqPool(ctx, [x, y, w, h], emissive) {
                const t = _gameTimeSec, lod = _zoomLOD, T = SQ_THEME, r = (i) => _bldHash(911, i);
                const lotus = [];
                for (let i = 0; i < 9; i++) lotus.push([x + w * (0.08 + r(i) * 0.84), y + h * (0.14 + r(i + 20) * 0.72), 5 + r(i + 40) * 3, r(i + 60) * 6.28]);
                if (!emissive) {
                    ctx.fillStyle = '#b8acdc'; ctx.beginPath(); ctx.roundRect(x - 9, y - 9, w + 18, h + 18, 6); ctx.fill();   // pearl marble deck
                    ctx.strokeStyle = 'rgba(217,191,134,0.6)'; ctx.lineWidth = 1; ctx.stroke();
                    ctx.strokeStyle = 'rgba(118,100,206,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x - 4.5, y - 4.5, w + 9, h + 9);
                    ctx.fillStyle = LandmarkKit.grad(this, 'pool', () => { const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#3b2c9e'); g.addColorStop(0.55, '#1f0f70'); g.addColorStop(1, T.glass); return g; });
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = 'rgba(210,200,255,0.16)'; ctx.lineWidth = 1;                           // slow ripples of sky
                    for (let i = 0; i < 3; i++) {
                        const yy = y + h * (0.25 + i * 0.25) + Math.sin(t * 0.8 + i) * 2;
                        ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.quadraticCurveTo(x + w / 2, yy + Math.sin(t + i) * 3, x + w - 8, yy); ctx.stroke();
                    }
                    lotus.forEach(([lx, ly, lr, rot], i) => {
                        ctx.fillStyle = '#2e6b5c'; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, lr, rot + 0.35, rot + Math.PI * 2 - 0.35); ctx.closePath(); ctx.fill();
                        if (i % 2 === 0 && lod < 2) this._sqLotus(ctx, lx, ly, lr * 0.8, rot);
                    });
                    for (let i = 0; i < 4; i++) {                                                             // loungers on the north deck
                        const lx = x + w * (0.1 + i * 0.25) + (i % 2 ? -4 : 4), ly = y - 34;
                        ctx.fillStyle = '#f4f1fc'; ctx.beginPath(); ctx.roundRect(lx - 4.5, ly - 10, 9, 20, 3); ctx.fill();
                        ctx.fillStyle = '#b8a6ee'; ctx.beginPath(); ctx.roundRect(lx - 3.5, ly - 9, 7, 11, 2); ctx.fill();
                    }
                    for (const u of [0.225, 0.725]) {                                                        // parasols, striped white and lavender
                        const cx = x + w * u, cy = y - 36;
                        for (let j = 0; j < 8; j++) { ctx.fillStyle = j % 2 ? '#b8a6ee' : '#f7f4ff'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 12, j * Math.PI / 4, (j + 1) * Math.PI / 4); ctx.closePath(); ctx.fill(); }
                        ctx.fillStyle = T.gold; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
                    }
                } else {
                    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
                    ctx.globalCompositeOperation = 'lighter';
                    const a = ctx.globalAlpha;
                    for (let i = 0; i < 22; i++) {                                                            // reflected stars
                        const tw = Math.pow(Math.max(0, Math.sin(t * 1.3 + i * 2.1)), 3);
                        ctx.fillStyle = `rgba(240,232,255,${0.25 + 0.6 * tw})`; sqGlint(ctx, x + w * r(i + 200), y + h * r(i + 230), 1 + tw * 2.2);
                    }
                    const mx = x + w * 0.72, my = y + h * 0.36, wob = Math.sin(t * 1.7) * 1.2;             // the moon on the water
                    sqGlow(ctx, mx, my, 36, 'rgba(200,180,255,0.3)', 'rgba(200,180,255,0)');
                    ctx.fillStyle = 'rgba(244,238,255,0.85)'; sqCrescent(ctx, mx + wob, my, 11, -2.4, 0.42); ctx.fill();
                    lotus.forEach(([lx, ly], i) => {                                                          // lotus lights
                        if (i % 2) return;
                        sqGlow(ctx, lx, ly, 14, `rgba(255,190,225,${0.5 * (0.75 + 0.25 * Math.sin(t * 1.6 + i))})`, 'rgba(255,190,225,0)');
                    });
                    for (let i = 0; i < 3; i++) {                                                            // mist drifting across
                        const u = (t * 0.02 + i / 3) % 1;
                        ctx.globalAlpha = a * Math.sin(u * Math.PI);
                        sqGlow(ctx, x + w * u, y + h * (0.3 + 0.3 * Math.sin(i * 2.1 + t * 0.1)), 60, 'rgba(190,170,255,0.16)', 'rgba(190,170,255,0)');
                    }
                    ctx.restore();
                }
            },

            _sqLotus(ctx, cx, cy, r, rot) {
                for (let j = 0; j < 6; j++) {
                    const a = rot + j * Math.PI / 3;
                    ctx.fillStyle = j % 2 ? '#ffc6e0' : '#fbeeff';
                    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.5, r * 0.24, a, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = '#ffd36e'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill();
            },

            /** South wing: a hexagon pad with an eclipse set into it; the corona lights up at night. */
            _sqEclipsePad(ctx, sx, sy, sw, sh, emissive) {
                const cx = sx + sw / 2, cy = sy + sh / 2, R = Math.min(sw, sh) * 0.34, E = R * 0.52, t = _gameTimeSec, T = SQ_THEME;
                const rot = -0.8, corners = [[sx + 34, sy + 34], [sx + sw - 34, sy + 34], [sx + 34, sy + sh - 34], [sx + sw - 34, sy + sh - 34]];
                if (!emissive) {
                    for (const [px, py] of corners) {                                                        // wisteria in round planters
                        ctx.fillStyle = '#8f86b0'; ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#6a4fb8'; ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#9d7de6'; ctx.beginPath(); ctx.arc(px - 3, py - 3, 8, 0, Math.PI * 2); ctx.fill();
                    }
                    sqHex(ctx, cx, cy, R); ctx.fillStyle = T.bay; ctx.fill(); ctx.strokeStyle = T.trim; ctx.lineWidth = 2; ctx.stroke();
                    sqHex(ctx, cx, cy, R - 8); ctx.strokeStyle = 'rgba(217,191,134,0.3)'; ctx.lineWidth = 1; ctx.stroke();
                    ctx.setLineDash([5, 7]); ctx.strokeStyle = 'rgba(217,191,134,0.4)';
                    ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
                    ctx.fillStyle = T.ground; ctx.beginPath(); ctx.arc(cx, cy, E, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = T.gold; ctx.lineWidth = 3; ctx.stroke();
                    ctx.fillStyle = '#d9d2f5'; sqCrescent(ctx, cx, cy, E - 2, rot + Math.PI, 0.16, 1.2); ctx.fill();
                } else {
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    const pulse = 0.85 + 0.15 * Math.sin(t * 0.9);
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, E * 1.9);                       // corona (the disc itself stays dark)
                    g.addColorStop(0, 'rgba(255,214,150,0)'); g.addColorStop(0.5, 'rgba(255,214,150,0)');
                    g.addColorStop(0.54, `rgba(255,214,150,${0.5 * pulse})`); g.addColorStop(0.68, `rgba(180,140,255,${0.28 * pulse})`); g.addColorStop(1, 'rgba(164,105,255,0)');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, E * 1.9, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = `rgba(255,248,255,${0.9 * pulse})`; sqCrescent(ctx, cx, cy, E - 2, rot + Math.PI, 0.16, 1.2); ctx.fill();
                    const dx = cx + Math.cos(rot) * (E - 3), dy = cy + Math.sin(rot) * (E - 3);               // the diamond ring
                    sqGlow(ctx, dx, dy, 18, 'rgba(255,250,240,0.9)', 'rgba(255,230,200,0)');
                    ctx.fillStyle = 'rgba(255,255,255,0.95)'; sqGlint(ctx, dx, dy, 10 + 3 * Math.sin(t * 2.2));
                    for (let i = 0; i < 24; i++) {                                                            // landing lights chasing round the pad
                        const s = i / 4, k = Math.floor(s), f = s - k, a0 = k * Math.PI / 3, a1 = a0 + Math.PI / 3;
                        const px = cx + (Math.cos(a0) * (1 - f) + Math.cos(a1) * f) * R, py = cy + (Math.sin(a0) * (1 - f) + Math.sin(a1) * f) * R;
                        const on = 0.25 + 0.75 * Math.pow(Math.max(0, Math.cos(i * 0.26 - t * 2.4)), 4);
                        ctx.fillStyle = i % 4 ? `rgba(214,190,255,${on})` : `rgba(255,226,170,${on})`;
                        ctx.beginPath(); ctx.arc(px, py, 1.7, 0, Math.PI * 2); ctx.fill();
                    }
                    for (const [px, py] of corners) sqGlow(ctx, px, py, 22, 'rgba(190,160,255,0.28)', 'rgba(190,160,255,0)');
                    ctx.restore();
                }
            },

            /** The crown: a silver spire rising from the penthouse, a crescent moon finial, a crown ring floating above. */
            _sqDrawCrown(ctx, emissive) {
                const main = this.sections[0], B = CONFIG.BUILDINGS, cam = game.camera, T = SQ_THEME, t = _gameTimeSec;
                const bx = this.x + main.x + main.w * 0.35, by = this.y + main.y + main.h * 0.72;
                const z0 = (Math.min(this.floors, B.MAX_FLOORS) + 4) * B.FLOOR_HEIGHT, z1 = SQ_ROOF.spireZ;
                const p0 = this._sqP(bx, by, z0), p1 = this._sqP(bx, by, z1), k0 = this._sqK(z0), k1 = this._sqK(z1);
                const vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L, rot = Math.atan2(vy, vx);
                const kr = this._sqK(SQ_ROOF.ringZ), rc = this._sqP(bx, by, SQ_ROOF.ringZ), R = SQ_ROOF.ringR * kr, spin = t * 0.12;
                const fade = Math.max(0.12, Math.min(1, (Math.hypot(rc[0] - cam.x, rc[1] - cam.y) - R * 0.4) / 160));   // never hide the player
                ctx.save();
                if (!emissive) {
                    const w0 = 4.5 * k0, w1 = 0.9 * k1;
                    const gr = ctx.createLinearGradient(p0[0] - nx * w0, p0[1] - ny * w0, p0[0] + nx * w0, p0[1] + ny * w0);
                    gr.addColorStop(0, T.silverLo); gr.addColorStop(0.4, T.silverHi); gr.addColorStop(0.7, T.silver); gr.addColorStop(1, T.silverDk);
                    ctx.fillStyle = gr; ctx.beginPath();
                    ctx.moveTo(p0[0] - nx * w0, p0[1] - ny * w0); ctx.lineTo(p1[0] - nx * w1, p1[1] - ny * w1);
                    ctx.lineTo(p1[0] + nx * w1, p1[1] + ny * w1); ctx.lineTo(p0[0] + nx * w0, p0[1] + ny * w0); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = T.gold; ctx.lineWidth = 1.2; ctx.beginPath();                          // gold collars
                    for (const f of [0.2, 0.42, 0.62]) {
                        const qx = p0[0] + vx * f, qy = p0[1] + vy * f, w = (w0 + (w1 - w0) * f) * 1.7;
                        ctx.moveTo(qx - nx * w, qy - ny * w); ctx.lineTo(qx + nx * w, qy + ny * w);
                    }
                    ctx.stroke();
                    ctx.fillStyle = T.goldHi; sqCrescent(ctx, p1[0], p1[1], 7 * k1, rot, 0.42); ctx.fill();
                    ctx.strokeStyle = T.gold; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.globalAlpha *= fade;
                    this._sqCrownRing(ctx, rc[0], rc[1], R, spin, false);
                } else if ((this._sqDark || 0) > 0.05) {
                    const a = Math.min(1, this._sqDark * 1.3);
                    ctx.globalCompositeOperation = 'lighter';
                    const gl = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);                         // light running up the needle
                    gl.addColorStop(0, `rgba(200,168,255,${0.1 * a})`); gl.addColorStop(1, `rgba(240,226,255,${0.7 * a})`);
                    ctx.strokeStyle = gl; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
                    sqGlow(ctx, p1[0], p1[1], 28 * k1, `rgba(220,200,255,${0.5 * a})`, 'rgba(164,105,255,0)');   // halo round the moon
                    ctx.fillStyle = `rgba(255,244,220,${0.85 * a})`; sqCrescent(ctx, p1[0], p1[1], 7 * k1, rot, 0.42); ctx.fill();
                    if (Math.sin(t * 3.2) > 0.45) sqGlow(ctx, p1[0] - vx / L * 3, p1[1] - vy / L * 3, 9, `rgba(255,60,80,${0.9 * a})`, 'rgba(255,60,80,0)');   // aviation beacon
                    ctx.globalAlpha = fade * a;
                    this._sqCrownRing(ctx, rc[0], rc[1], R, spin, true);
                }
                ctx.restore();
            },

            _sqCrownRing(ctx, cx, cy, R, spin, emissive) {
                const T = SQ_THEME, n = 8, t = _gameTimeSec;
                const tip = (i) => { const an = spin + i * Math.PI * 2 / n, hh = R * (i % 2 ? 0.16 : 0.27); return [an, cx + Math.cos(an) * (R + hh), cy + Math.sin(an) * (R + hh)]; };
                if (!emissive) {
                    ctx.fillStyle = T.silverHi;
                    for (let i = 0; i < n; i++) {                                                            // crown points
                        const [an, tx, ty] = tip(i), bw = 0.14;
                        ctx.beginPath(); ctx.moveTo(cx + Math.cos(an - bw) * R, cy + Math.sin(an - bw) * R); ctx.lineTo(tx, ty);
                        ctx.lineTo(cx + Math.cos(an + bw) * R, cy + Math.sin(an + bw) * R); ctx.closePath(); ctx.fill();
                    }
                    ctx.strokeStyle = T.silverHi; ctx.lineWidth = Math.max(1.5, R * 0.07); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
                    ctx.strokeStyle = T.gold; ctx.lineWidth = Math.max(0.8, R * 0.03); ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2); ctx.stroke();
                    for (let i = 0; i < n; i++) { const [, tx, ty] = tip(i); ctx.fillStyle = i % 2 ? '#b89cff' : T.gold; ctx.beginPath(); ctx.arc(tx, ty, 1 + R * 0.035, 0, Math.PI * 2); ctx.fill(); }
                } else {
                    ctx.strokeStyle = 'rgba(180,140,255,0.35)'; ctx.lineWidth = R * 0.22; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,236,200,0.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2); ctx.stroke();
                    for (let i = 0; i < n; i++) { const [, tx, ty] = tip(i); sqGlow(ctx, tx, ty, 7, i % 2 ? 'rgba(200,170,255,0.8)' : 'rgba(255,220,160,0.8)', 'rgba(164,105,255,0)'); }
                    ctx.fillStyle = 'rgba(255,250,255,0.9)';                                                   // motes orbiting the other way
                    for (let j = 0; j < 10; j++) { const an = -t * 0.35 + j * 0.628, tw = 0.5 + 0.5 * Math.sin(t * 3 + j * 1.7); sqGlint(ctx, cx + Math.cos(an) * R * 1.12, cy + Math.sin(an) * R * 1.12, 0.8 + tw * 2.2); }
                }
            },

            /** Winged hexagon lantern (the editor design's motif): white frame, indigo glass, swept wings. */
            _sqWingedHex(ctx, x, y, r, emissive) {
                const wing = (s) => {
                    ctx.beginPath(); ctx.moveTo(x + s * r * 0.7, y - r * 0.55); ctx.lineTo(x + s * r * 2.5, y - r * 0.55);
                    ctx.quadraticCurveTo(x + s * r * 1.4, y - r * 0.2, x + s * r * 0.8, y + r * 0.62); ctx.closePath();
                };
                if (!emissive) {
                    ctx.fillStyle = SQ_THEME.trim; wing(-1); ctx.fill(); wing(1); ctx.fill();
                    sqHex(ctx, x, y, r + 1.5); ctx.fill();
                    sqHex(ctx, x, y, r - 1.5); ctx.fillStyle = SQ_THEME.glass; ctx.fill();
                } else {
                    sqGlow(ctx, x, y, r * 3.4, 'rgba(214,190,255,0.55)', 'rgba(164,105,255,0)');
                    sqHex(ctx, x, y, r - 1.5); ctx.fillStyle = 'rgba(236,224,255,0.9)'; ctx.fill();
                    ctx.strokeStyle = 'rgba(214,190,255,0.8)'; ctx.lineWidth = 0.8; wing(-1); ctx.stroke(); wing(1); ctx.stroke();
                }
            },

            /** Fairy lights tracing the inside of the roof outline (outer edges only); each bulb shimmers on its own. */
            _sqRoofEdgeLights(ctx, emissive) {
                const lod = _zoomLOD;
                if (lod >= 2 || (emissive && (this._sqDark || 0) <= 0.05)) return;
                if (!this._sqBulbs) {
                    const inset = 10, step = 22, bulbs = [];
                    for (const f of this._leanFaces()) {
                        const horiz = f.y1 === f.y2, lo = horiz ? f.x1 : f.y1, hi = horiz ? f.x2 : f.y2;
                        const inward = f.side === 'S' || f.side === 'E' ? -inset : inset;
                        const n = Math.max(1, Math.round((hi - lo - 2 * inset) / step));
                        for (let i = 0; i <= n; i++) {
                            const u = lo + inset + (hi - lo - 2 * inset) * i / n;
                            bulbs.push(horiz ? [u, f.y1 + inward] : [f.x1 + inward, u]);
                        }
                    }
                    this._sqBulbs = bulbs;
                }
                const t = _gameTimeSec;
                ctx.save();
                if (!emissive) {
                    if (!this._sqBulbPath) { const p = new Path2D(); for (const [x, y] of this._sqBulbs) { p.moveTo(x + 1.6, y); p.arc(x, y, 1.6, 0, Math.PI * 2); } this._sqBulbPath = p; }
                    ctx.fillStyle = '#e9e4fb'; ctx.fill(this._sqBulbPath);
                } else {
                    ctx.globalCompositeOperation = 'lighter';
                    // Each bulb shimmers on its own; the cores go out in a few brightness bands (8 fills, not one per bulb)
                    const bands = [[], [], [], [], [], [], [], []], a0 = ctx.globalAlpha;
                    this._sqBulbs.forEach(([x, y], i) => {
                        const h = _bldHash(5151, i), on = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * (1.1 + h) + h * 20)), 4);
                        const warm = i % 2 === 0;
                        if (lod === 0) { ctx.globalAlpha = a0 * 0.45 * on; drawGlow(ctx, x, y, 7, warm ? '255, 217, 160' : '217, 194, 255', 0); }
                        bands[(warm ? 0 : 4) + Math.min(3, Math.floor((on - 0.55) / 0.45 * 4))].push(x, y);
                    });
                    bands.forEach((pts, bi) => {
                        if (!pts.length) return;
                        const on = 0.55 + 0.45 * ((bi % 4) + 0.5) / 4, p = new Path2D();
                        for (let j = 0; j < pts.length; j += 2) { p.moveTo(pts[j] + 1.5, pts[j + 1]); p.arc(pts[j], pts[j + 1], 1.5, 0, Math.PI * 2); }
                        ctx.globalAlpha = a0 * on; ctx.fillStyle = bi < 4 ? 'rgb(255,236,205)' : 'rgb(236,224,255)'; ctx.fill(p);
                    });
                    ctx.globalAlpha = a0;
                }
                ctx.restore();
            }
        });

