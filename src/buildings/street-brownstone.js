        /* =====================================================================
           STREET BROWNSTONES — the apartment houses, built like the arcades
           ---------------------------------------------------------------------
           The 'brownstone' apartment variant (buildings/street-variants.js),
           built the way the shops' arcades are (buildings/street-arcade.js), so
           a street of homes reads as well from across the road as a street of
           shops:

             · the garden level: rusticated brownstone, low windows behind iron
               grilles; over it the parlour floor, tall windows under stone
               pediments, and the front door in the middle bay: two panelled
               leaves under a fanlight, a hood on brackets over it and a lantern
               either side (the stoop up to it is on the pavement, _vPaintBase);
             · a sill course, then the brick storeys: sash windows (a meeting
               rail and a mullion) with stone lintels and sills, a bay every
               BROWNSTONE.BAY laid out from the door;
             · a frieze and a deep bracketed cornice in painted metal.
           It leans BROWNSTONE.HERO times as hard as the street, as the arcades
           do (leanHero), so the front reads from across the road. Variation per
           house (from its seed): the brick's tone (brown, red, umber).

           Drawn the arcade's way: a few projected fills a face (_vBrUnder,
           _vBrFace), ledges and brackets from the landmark kit, the generic
           windows masked off. Sections, doors, collision and lights are
           unchanged; the roof trim and the stoop are the variant's own.
           ===================================================================== */
        const BROWNSTONE = {
            HERO: 3.5,      // as the arcades lean (ARCADE.HERO)
            BAY: 42,        // a window bay every this far along the front, laid out from the door
            WW: 19,         // a window's width (the humanoid is about 30 across the shoulders)
            G: 9,           // the garden level's height
            P: 25,          // the parlour floor's top (the sill course)
            CORN: 6,        // the frieze under the cornice
            TONES: [
                { id: 'brown', brick: '#6a3f2e', lo: '#4e2d21', base: '#5a4334', baseLo: '#3f2f25' },
                { id: 'red', brick: '#7a3528', lo: '#57251c', base: '#5e4434', baseLo: '#423024' },
                { id: 'umber', brick: '#5b3b2c', lo: '#3f281e', base: '#544032', baseLo: '#3a2c22' }
            ],
            TRIM: '#d6c09a', TRIM_LO: '#a68f6c', TRIM_HI: '#f1e2c4', CORNICE: '#332824', CORNICE_LO: '#1d1714',
            IRON: '#15161a', PANE: '#1f242c', DOOR: '#2c1a12', GOLD: '#d8b46a'
        };

        Object.assign(BuildingV2.prototype, {
            /** A brownstone's own picks (from _pickVariant): its brick, no generic facade feature, the arcades' lean */
            _vBrInit(v, r) {
                v.tone = BROWNSTONE.TONES[Math.floor(r(6) * BROWNSTONE.TONES.length)];
                this.colors.wall = v.tone.brick;
                this.colors.roof = '#2e2a2a'; this.colors.roofLight = '#3c3636';         // a tar roof over the brick, not the palette's
                this.facadeFeature = null;
                this.leanHero = BROWNSTONE.HERO;                                   // BuildingV2._leanScale
                this.crownZ = this._vH() * BROWNSTONE.HERO;                         // the render query's reach
            },

            /** The bays along the front (frame x of each window's middle), laid out from the door */
            _vBrBays() {
                const F = this._vFrame();
                if (this._vBr && this._vBr.F === F) return this._vBr;
                const B = BROWNSTONE.BAY, xs = [];
                for (let k = -12; k <= 12; k++) { const x = F.door + k * B; if (x - B / 2 >= 2 && x + B / 2 <= F.fw - 2) xs.push(x); }
                return (this._vBr = { F, xs, door: F.door, side: this.facing === 'N' || this.facing === 'E' ? -1 : 1 });
            },

            /** Bays on a face as u (0..1 along it): the front's from the door, or evenly spaced on the other faces */
            _vBrU(f, G) {
                if (f.side === this.facing) {
                    const B = this._vBrBays(), g = this._frontGeo(), ex = f.x2 - f.x1, ey = f.y2 - f.y1, L2 = ex * ex + ey * ey;
                    return B.xs.map(x => {
                        const s = (x - B.F.fw / 2) * B.side, px = g.cx + g.ux * s, py = g.cy + g.uy * s;
                        return { u: ((px - f.x1) * ex + (py - f.y1) * ey) / L2, door: Math.abs(x - B.door) < 1 };
                    }).filter(b => b.u > 0 && b.u < 1);
                }
                const n = Math.max(1, Math.floor(G.L / BROWNSTONE.BAY)), out = [];
                for (let i = 0; i < n; i++) out.push({ u: (i + 0.5) / n, door: false });
                return out;
            },

            /** The brick storeys between the sill course and the frieze: [z0, z1] each */
            _vBrStoreys(H) {
                const z0 = BROWNSTONE.P + 1, top = H - BROWNSTONE.CORN, n = Math.max(1, Math.round((top - z0) / 13.5)), sh = (top - z0) / n, out = [];
                for (let i = 0; i < n; i++) out.push([z0 + i * sh, z0 + (i + 1) * sh]);
                return out;
            },

            /* ---------------- walls ---------------- */

            /** Under the openings: the brownstone base and its rustication, the brick's courses */
            _vBrUnder(ctx, f, G, H) {
                const B = BROWNSTONE, T = this.variant.tone, fine = _zoomLOD < 2 && G.depth > 8;
                ctx.fillStyle = T.base; ctx.fill(G.quad(new Path2D(), 0, 1, 0, B.P / H));
                ctx.fillStyle = T.baseLo; ctx.fill(G.quad(new Path2D(), 0, 1, 0, B.G / H));
                ctx.fillStyle = hexToRgba(B.CORNICE, 0.9); ctx.fill(G.quad(new Path2D(), 0, 1, (H - B.CORN) / H, 1));
                if (!fine) return;
                const rj = new Path2D(), bj = new Path2D();
                for (let z = 2.2; z < B.P; z += 2.2) G.line(rj, 0, z / H, 1, z / H);
                for (let z = B.P + 2.4; z < H - B.CORN; z += 2.4) G.line(bj, 0, z / H, 1, z / H);
                ctx.lineWidth = 0.6;
                ctx.strokeStyle = 'rgba(20,12,8,.4)'; ctx.stroke(rj);
                ctx.strokeStyle = 'rgba(232,200,160,.09)'; ctx.stroke(bj);
            },

            /**
             * A face's openings: the garden windows and their grilles, the parlour windows under pediments (the door
             * in its bay on the front), the sash windows with lintels and sills. emissive: just what's lit.
             */
            _vBrFace(ctx, f, G, H, emissive) {
                const B = BROWNSTONE, L = G.L, front = f.side === this.facing, seed = this.variant.seed;
                const bays = this._vBrU(f, G), storeys = this._vBrStoreys(H), fine = _zoomLOD < 2 && G.depth > 6;
                const rect = (p, u0, u1, z0, z1) => G.quad(p, u0, u1, z0 / H, z1 / H);
                const poly = (p, pts) => { pts.forEach(([u, z], i) => { const q = G.at(u, z / H); if (i) p.lineTo(q[0], q[1]); else p.moveTo(q[0], q[1]); }); p.closePath(); return p; };
                const hw = B.WW / 2 / L, dw = 8.5 / L, lit = (i, p) => _bldHash(seed, 560 + i * 7 + f.side.charCodeAt(0) * 3) < p;
                const gw = [1.6, B.G - 1.8], pw = [B.G + 2.4, B.P - 4], dz = [0.6, B.P - 2.2];    // garden window, parlour window, the door (from the stoop)
                const glass = new Path2D(), warm = new Path2D();
                if (emissive) {
                    bays.forEach((b, i) => {
                        if (b.door && front) { rect(warm, b.u - dw + 0.8 / L, b.u + dw - 0.8 / L, dz[1] - 4, dz[1] - 0.6); return; }   // the fanlight
                        if (lit(i, 0.5)) rect(glass, b.u - hw, b.u + hw, pw[0], pw[1]);
                        if (lit(i + 20, 0.3)) rect(glass, b.u - hw * 0.8, b.u + hw * 0.8, gw[0], gw[1]);
                        storeys.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, 0.55)) rect(glass, b.u - hw, b.u + hw, s0 + 2, s1 - 2.4); });
                    });
                    ctx.fillStyle = 'rgba(255,186,104,.6)'; ctx.fill(glass);
                    ctx.fillStyle = 'rgba(255,214,150,.9)'; ctx.fill(warm);
                    return;
                }
                const stone = new Path2D(), dark = new Path2D(), bars = new Path2D(), door = new Path2D(), panel = new Path2D(), base = new Path2D();
                for (const b of bays) {
                    const u = b.u;
                    if (b.door && front) {                                                         // the door: a stone surround, two leaves, a fanlight
                        rect(stone, u - dw - 1.6 / L, u + dw + 1.6 / L, dz[0], dz[1] + 1.2);
                        rect(door, u - dw, u + dw, dz[0], dz[1] - 4.4);
                        rect(dark, u - dw + 0.6 / L, u + dw - 0.6 / L, dz[1] - 4, dz[1] - 0.6);
                        if (fine) {
                            rect(bars, u - 0.3 / L, u + 0.3 / L, dz[0], dz[1] - 4.4);
                            for (const s of [-1, 1]) for (const [z0, z1] of [[2.5, 9], [11, dz[1] - 6]]) rect(panel, u + s * 1.2 / L, u + s * (dw - 1.1 / L), z0, z1);
                        }
                    } else {
                        rect(base, u - hw * 0.8 - 0.8 / L, u + hw * 0.8 + 0.8 / L, gw[0] - 0.5, gw[1] + 0.5);   // the garden window, its grille
                        rect(dark, u - hw * 0.8, u + hw * 0.8, gw[0], gw[1]);
                        if (fine) for (const m of [-0.5, 0, 0.5]) rect(bars, u + hw * 0.8 * m - 0.3 / L, u + hw * 0.8 * m + 0.3 / L, gw[0], gw[1]);
                        rect(stone, u - hw - 1.1 / L, u + hw + 1.1 / L, pw[0] - 0.9, pw[1] + 0.5);   // the parlour window under a pediment
                        poly(stone, [[u - hw - 2.2 / L, pw[1] + 0.6], [u + hw + 2.2 / L, pw[1] + 0.6], [u, pw[1] + 3.5]]);
                        rect(dark, u - hw, u + hw, pw[0], pw[1]);
                        if (fine) { rect(bars, u - 0.3 / L, u + 0.3 / L, pw[0], pw[1]); rect(bars, u - hw, u + hw, (pw[0] + pw[1]) / 2 - 0.25, (pw[0] + pw[1]) / 2 + 0.25); }
                    }
                    for (const [s0, s1] of storeys) {                                              // sash windows: a lintel, a sill
                        const w0 = s0 + 2, w1 = s1 - 2.4;
                        rect(stone, u - hw - 1.8 / L, u + hw + 1.8 / L, w1, w1 + 1.8);
                        rect(stone, u - hw - 0.9 / L, u + hw + 0.9 / L, w0 - 0.9, w0);
                        rect(dark, u - hw, u + hw, w0, w1);
                        if (fine) { rect(bars, u - 0.3 / L, u + 0.3 / L, w0, w1); rect(bars, u - hw, u + hw, (w0 + w1) / 2 - 0.25, (w0 + w1) / 2 + 0.25); }
                    }
                }
                ctx.fillStyle = B.TRIM; ctx.fill(stone);
                ctx.fillStyle = this.variant.tone.baseLo; ctx.fill(base);
                ctx.fillStyle = B.PANE; ctx.fill(dark);
                ctx.fillStyle = 'rgba(176,190,214,.15)'; ctx.fill(dark);                           // the sky in the panes
                ctx.fillStyle = 'rgba(255,196,120,.12)'; ctx.fill(dark);                           // a room behind
                ctx.fillStyle = B.DOOR; ctx.fill(door);
                ctx.fillStyle = 'rgba(255,230,190,.08)'; ctx.fill(panel);
                ctx.fillStyle = B.IRON; ctx.fill(bars);
                if (fine) { ctx.strokeStyle = 'rgba(80,60,40,.45)'; ctx.lineWidth = 0.5; ctx.stroke(stone); }
            },

            /** Over the walls on all faces: the openings, then the sill course, the door's hood, the frieze, the bracketed cornice */
            _vBrOver(ctx, faces, P) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrOver(ctx, faces, P));
                const B = BROWNSTONE, H = this._vH(), K = LandmarkKit, edges = [], brackets = [];
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P), L = G.L, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
                    edges.push({ a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny });
                    if (G.depth >= 3) this._vBrFace(ctx, f, G, H, false);
                    if (_zoomLOD < 2) for (const b of this._vBrU(f, G)) for (const o of [-B.BAY / 2 + 2, B.BAY / 2 - 2]) {
                        const t = b.u + o / L; if (t <= 0.01 || t >= 0.99) continue;
                        brackets.push({ x: f.x1 + (f.x2 - f.x1) * t, y: f.y1 + (f.y2 - f.y1) * t, nx: f.nx, ny: f.ny });
                    }
                }
                K.ledge(ctx, edges, B.P, 1.6, 1.4, B.TRIM, B.TRIM_LO, hexToRgba(B.TRIM_HI, 0.7));         // the sill course
                const fr = this._vBrDoorHood();
                if (fr) K.ledge(ctx, [fr], B.P - 1.2, 10, 2, B.CORNICE, B.CORNICE_LO, hexToRgba(B.GOLD, 0.85));   // the hood over the door
                if (brackets.length) K.fins(ctx, brackets, H - B.CORN, H - 0.5, 1.6, 3.6, B.CORNICE, 'rgba(214,190,150,.35)');
                K.ledge(ctx, edges, H, 4.5, 2.6, B.CORNICE, B.CORNICE_LO, 'rgba(214,190,150,.55)');       // the cornice
            },

            /** The door's hood (dark, gold-edged, the name on it): a ledge the width of the door bay along the front (null without a door on the front) */
            _vBrDoorHood() {
                const Bs = this._vBrBays(), g = this._frontGeo(), s = (Bs.door - Bs.F.fw / 2) * Bs.side, w = 19;
                return { a: this._frontPt0(s - w), b: this._frontPt0(s + w), nx: g.nx, ny: g.ny };
            },

            /** The door's lanterns, either side of it on the parlour floor */
            _vBrLanterns(ctx, emissive) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrLanterns(ctx, emissive));
                const Bs = this._vBrBays(), s = (Bs.door - Bs.F.fw / 2) * Bs.side, lamps = new Path2D(), halo = new Path2D();
                for (const d of [-13.5, 13.5]) {
                    const p = this._vFrontPt(s + d, 1.4, BROWNSTONE.P - 9);
                    lamps.moveTo(p[0] + 1.3, p[1]); lamps.arc(p[0], p[1], 1.3, 0, Math.PI * 2);
                    halo.moveTo(p[0] + 5, p[1]); halo.arc(p[0], p[1], 5, 0, Math.PI * 2);
                }
                if (emissive) { ctx.fillStyle = 'rgba(255,190,110,.22)'; ctx.fill(halo); ctx.fillStyle = 'rgba(255,232,180,.95)'; ctx.fill(lamps); }
                else { ctx.fillStyle = BROWNSTONE.IRON; ctx.fill(lamps); }
            },

            /** Its name in gilt script lying on the door's hood (the generic sign's place, _paintSign) */
            _vBrFront(ctx, emissive) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrFront(ctx, emissive));
                const v = this.variant;
                if (v.name == null) v.name = (this.attachedSign && this.attachedSign.text) || '';
                if (!v.name) return;
                let font = `14px "Great Vibes", "URW Chancery L", "Z003", cursive`;
                const tw = this._vTextW(ctx, font);
                if (tw > 34) font = `${Math.max(9, Math.floor(14 * 34 / tw))}px "Great Vibes", "URW Chancery L", "Z003", cursive`;
                this._vBoard(ctx, BROWNSTONE.P - 1.2, 0, (c, os) => {
                    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
                    c.fillStyle = emissive ? 'rgba(255,214,150,.95)' : BROWNSTONE.GOLD; c.fillText(v.name, 0, os * 5 + 0.5);
                });
            },

            /** The pavement in front: the stoop (brownstone treads between iron rails, newel posts), the areaway's railing
                along the front either side of it, a planter at each end */
            _vBrPaintBase(c, v, fw, fd, door) {
                const B = BROWNSTONE, T = v.tone, y = fd, sw = 26, sd = 24, n = 6;
                const dot = (x, yy, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, Math.PI * 2); c.fill(); };
                c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(door - sw / 2 + 3, y + 2, sw, sd + 3);
                for (let i = 0; i < n; i++) {                                                       // the treads, lighter as they climb toward the door
                    const t = i / (n - 1), yy = y + sd * (1 - (i + 1) / n);
                    c.fillStyle = i % 2 ? T.base : T.baseLo; c.fillRect(door - sw / 2, yy, sw, sd / n + 0.5);
                    c.fillStyle = `rgba(241,226,196,${0.12 + 0.18 * t})`; c.fillRect(door - sw / 2, yy, sw, 1);
                }
                const rail = (x) => { c.fillStyle = B.IRON; c.fillRect(x - 1.2, y, 2.4, sd); dot(x, y + sd, 2.6, B.IRON); dot(x - 0.6, y + sd - 0.6, 0.9, '#5a5c64'); };
                rail(door - sw / 2 - 1.5); rail(door + sw / 2 + 1.5);
                c.strokeStyle = B.IRON; c.lineWidth = 1.6; c.beginPath();                          // the areaway's railing, a stride out from the wall
                for (const [x0, x1] of [[3, door - sw / 2 - 3], [door + sw / 2 + 3, fw - 3]]) {
                    if (x1 - x0 < 6) continue;
                    c.moveTo(x0, y + 9); c.lineTo(x1, y + 9);
                    for (let x = x0; x <= x1; x += 4) { c.moveTo(x, y + 9); c.lineTo(x, y + 7.2); }
                }
                c.stroke();
                c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(3, y, door - sw / 2 - 6, 8); c.fillRect(door + sw / 2 + 3, y, fw - door - sw / 2 - 6, 8);   // the areaway, sunk
                for (const x of [door - sw / 2 - 16, door + sw / 2 + 16]) {                        // a planter either side of the stoop
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 5, y + 13, 13, 11); c.fillStyle = '#2b1e17'; c.fillRect(x - 6.5, y + 11, 13, 11);
                    dot(x, y + 16.5, 5, '#3c7d44'); dot(x - 2, y + 15, 2.4, '#5c9a4c'); dot(x + 1.5, y + 17.5, 1.2, '#e8b8c8');
                }
            },

            /** The night: windows and the fanlight lit, the lanterns, the cornice's lip in the lamps' colour */
            _vBrGlow(ctx, faces, P, dark) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrGlow(ctx, faces, P, dark));
                const H = this._vH(), K = LandmarkKit, edges = [];
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P);
                    if (G.depth >= 3) this._vBrFace(ctx, f, G, H, true);
                    edges.push({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny });
                }
                const rim = K.rim(this, dark);
                if (rim.a > 0.01 && edges.length) K.ledge(ctx, edges, H, 4.5, 0.01, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', `rgba(${rim.rgb}, ${0.5 * rim.a})`);
                this._vBrLanterns(ctx, true);
                this._vBrFront(ctx, true);
            }
        });
