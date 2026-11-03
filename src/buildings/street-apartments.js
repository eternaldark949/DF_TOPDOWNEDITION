        /* =====================================================================
           STREET APARTMENTS — the apartment houses, built like the arcades
           ---------------------------------------------------------------------
           The apartment variants (buildings/street-variants.js), built the way
           the shops' arcades are (buildings/street-arcade.js), so a street of
           homes reads as well from across the road as a street of shops. Each
           is a ground floor with its own door, storeys of windows sized to the
           humanoid, and a crown, at the arcades' lean (leanHero):

             brownstone  a rusticated garden level and a parlour floor under
                         pediments, brick storeys of sash windows with stone
                         lintels, a bracketed cornice; a stoop and an areaway
                         on the pavement, the name in gilt on the door's hood.
             deco        a polished granite plinth, a stepped bronze entrance
                         with a sunburst transom under a black marquee, piers
                         running the full height between strips of windows and
                         gilt-chevron spandrels; a terrazzo fan on the pavement.
             terrace     stucco: a rusticated ground floor, a portico on two
                         columns, a balcony along the first floor and iron
                         balconettes over it, white-barred french windows, a
                         white cornice on brackets; a chequered tile path.
             loft        a warehouse: a steel-and-glass ground floor, wide
                         steel-gridded windows under brick soldier arches, tie
                         plates, a steel canopy and gooseneck lamps over the
                         door; a loading dock with a hazard edge on the pavement.

           Variation per house (from its seed): the material's tone. Drawn the
           arcade's way: a few projected fills a face (_vBrUnder, _vBrFace),
           ledges, piers, columns and verandas from the landmark kit, the
           generic windows masked off. Sections, doors, collision and lights are
           unchanged; the roof trim and the pavement are the variant's own.
           ===================================================================== */
        const APT_KIT = {
            brownstone: {
                HERO: 3.5,      // as the arcades lean (ARCADE.HERO)
                BAY: 42,        // a window bay every this far along the front, laid out from the door
                WW: 19,         // a window's width (the humanoid is about 30 across the shoulders)
                G: 9,           // the garden level's height
                P: 25,          // the parlour floor's top (the sill course)
                CORN: 6,        // the frieze under the cornice
                STOREY: 13.5,
                DOOR_W: 8.5,    // half the door's width
                TONES: [
                    { id: 'brown', wall: '#6a3f2e', lo: '#4e2d21', base: '#5a4334', baseLo: '#3f2f25' },
                    { id: 'red', wall: '#7a3528', lo: '#57251c', base: '#5e4434', baseLo: '#423024' },
                    { id: 'umber', wall: '#5b3b2c', lo: '#3f281e', base: '#544032', baseLo: '#3a2c22' }
                ],
                TRIM: '#d6c09a', TRIM_LO: '#a68f6c', TRIM_HI: '#f1e2c4', CORNICE: '#332824', CORNICE_LO: '#1d1714',
                IRON: '#15161a', PANE: '#1f242c', DOOR: '#2c1a12', GOLD: '#d8b46a',
                ROOF: ['#2e2a2a', '#3c3636'],
                HOOD: { z: 23.8, out: 10, th: 2, w: 19, top: '#332824', band: '#1d1714', lip: 'rgba(216,180,106,.85)' },
                NAME: { font: '"Great Vibes", "URW Chancery L", "Z003", cursive', px: 14, ink: '#d8b46a', glow: 'rgba(255,214,150,.95)' },
                LAMPS: { d: [-13.5, 13.5], out: 1.4, z: 16, r: 1.3 },
                LIT: 'rgba(255,186,104,.6)', RIM: 4.5
            },
            deco: {
                HERO: 3.5, BAY: 34, WW: 16, G: 7, P: 26, CORN: 7, STOREY: 13, DOOR_W: 9,
                TONES: [
                    { id: 'limestone', wall: '#d3c6a6', lo: '#a99b7c', base: '#c2b391', baseLo: '#1d1b22' },
                    { id: 'rose', wall: '#cfa999', lo: '#a58174', base: '#bd9686', baseLo: '#1f1a1e' },
                    { id: 'celadon', wall: '#a9bfae', lo: '#82998a', base: '#98ae9d', baseLo: '#191d1d' }
                ],
                GOLD: '#d9b46a', BRONZE: '#4a3826', PANE: '#1d222a', SPANDREL: '#2b2723', IRON: '#15161a',
                ROOF: ['#3a3740', '#46434c'],
                HOOD: { z: 22.5, out: 14, th: 3, w: 26, top: '#141318', band: '#0b0a0e', lip: 'rgba(217,180,106,.9)' },
                NAME: { font: 'Montserrat, "Futura", sans-serif', weight: '600 ', px: 8, caps: true, spacing: 1.4, ink: '#d9b46a', glow: 'rgba(255,220,150,.95)' },
                LAMPS: { d: [-16, 16], out: 1, z: 13, r: 1.4 },
                LIT: 'rgba(255,200,140,.6)', RIM: 2.6
            },
            terrace: {
                HERO: 3.5, BAY: 40, WW: 17, G: 4, P: 24, CORN: 7, STOREY: 14, DOOR_W: 7.5,
                TONES: [
                    { id: 'stone', wall: '#d2c9b8', lo: '#a69d8c', base: '#c4bba9', baseLo: '#a0977f' },
                    { id: 'cream', wall: '#d8c49e', lo: '#ab9875', base: '#cab68f', baseLo: '#a5916c' },
                    { id: 'blue', wall: '#a9bcc6', lo: '#82959f', base: '#9caeb8', baseLo: '#7d8f99' },
                    { id: 'pink', wall: '#d3b0a4', lo: '#a8877c', base: '#c5a296', baseLo: '#a17f74' }
                ],
                DOORS: ['#15171c', '#1d2b4a', '#5a1f24', '#1f3a2c'],
                TRIM: '#f6f2ea', TRIM_LO: '#bdb5a6', IRON: '#17191f', PANE: '#161b25',
                ROOF: ['#4b4f57', '#5a5e66'],
                HOOD: { z: 22, out: 12, th: 3, w: 17, top: '#f6f2ea', band: '#bdb5a6', lip: 'rgba(255,255,255,.85)' },
                NAME: { font: 'Montserrat, Helvetica, sans-serif', weight: '700 ', px: 7.5, caps: true, spacing: 1.2, ink: '#1a2030', glow: 'rgba(255,224,176,.95)' },
                LAMPS: { d: [0], out: 6, z: 17, r: 1.6 },
                LIT: 'rgba(255,196,124,.6)', RIM: 4.2
            },
            loft: {
                HERO: 3.5, BAY: 48, WW: 30, G: 3, P: 26, CORN: 5, STOREY: 16, DOOR_W: 10,
                TONES: [
                    { id: 'red', wall: '#7b4331', lo: '#5a2f22', base: '#33363c', baseLo: '#24262b' },
                    { id: 'charcoal', wall: '#4a484c', lo: '#333236', base: '#2b2d32', baseLo: '#1e2024' },
                    { id: 'yellow', wall: '#94784f', lo: '#6e5838', base: '#3a3a3e', baseLo: '#27282c' }
                ],
                STEEL: '#22252b', STEEL_HI: '#5a606a', PANE: '#1c2328', CONC: '#9c968c', IRON: '#15161a',
                ROOF: ['#34373d', '#41444b'],
                HOOD: { z: 24, out: 13, th: 1.6, w: 24, top: '#2b2f36', band: '#16181c', lip: 'rgba(214,190,150,.55)' },
                NAME: { font: 'Montserrat, Helvetica, sans-serif', weight: '800 ', px: 7.5, caps: true, spacing: 1.8, ink: '#ece6da', glow: 'rgba(255,236,200,.95)' },
                LAMPS: { d: [-19, 19], out: 4, z: 30, r: 1.5 },
                LIT: 'rgba(255,196,120,.55)', LIT2: 'rgba(196,216,255,.45)', RIM: 1.6
            }
        };

        Object.assign(BuildingV2.prototype, {
            /** An apartment's own picks (from _pickVariant): its style and tone, no generic facade feature, the arcades' lean */
            _vBrInit(v, r) {
                const B = v.st = APT_KIT[v.id];
                v.tone = B.TONES[Math.floor(r(6) * B.TONES.length)];
                if (B.DOORS) v.door = B.DOORS[Math.floor(r(7) * B.DOORS.length)];
                this.colors.wall = v.tone.wall;
                this.colors.roof = B.ROOF[0]; this.colors.roofLight = B.ROOF[1];
                this.facadeFeature = null;
                this.leanHero = B.HERO;                                            // BuildingV2._leanScale
                this.crownZ = this._vH() * B.HERO;                                  // the render query's reach
            },

            /** The bays along the front (frame x of each window's middle), laid out from the door */
            _vBrBays() {
                const F = this._vFrame();
                if (this._vBr && this._vBr.F === F) return this._vBr;
                const B = this.variant.st.BAY, xs = [];
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
                const n = Math.max(1, Math.floor(G.L / this.variant.st.BAY)), out = [];
                for (let i = 0; i < n; i++) out.push({ u: (i + 0.5) / n, door: false });
                return out;
            },

            /** The storeys between the ground floor and the frieze: [z0, z1] each */
            _vBrStoreys(H) {
                const B = this.variant.st, z0 = B.P + 1, top = H - B.CORN, n = Math.max(1, Math.round((top - z0) / B.STOREY)), sh = (top - z0) / n, out = [];
                for (let i = 0; i < n; i++) out.push([z0 + i * sh, z0 + (i + 1) * sh]);
                return out;
            },

            /** Shared face tools: a rect and a polygon in (u, z), the face's length */
            _vAptT(G, H) {
                return {
                    L: G.L,
                    rect: (p, u0, u1, z0, z1) => G.quad(p, u0, u1, z0 / H, z1 / H),
                    poly: (p, pts) => { pts.forEach(([u, z], i) => { const q = G.at(u, z / H); if (i) p.lineTo(q[0], q[1]); else p.moveTo(q[0], q[1]); }); p.closePath(); return p; }
                };
            },

            /** Fill a face's panes: the glass, the sky in it, a room behind */
            _vAptGlass(ctx, dark, pane) {
                ctx.fillStyle = pane; ctx.fill(dark);
                ctx.fillStyle = 'rgba(176,190,214,.15)'; ctx.fill(dark);
                ctx.fillStyle = 'rgba(255,196,120,.12)'; ctx.fill(dark);
            },

            /* ---------------- walls ---------------- */

            /** Under the openings: the ground floor's material and the plinth, the frieze, the courses */
            _vBrUnder(ctx, f, G, H) {
                const v = this.variant, B = v.st, T = v.tone, id = v.id, fine = _zoomLOD < 2 && G.depth > 8;
                const band = (z0, z1, col) => { ctx.fillStyle = col; ctx.fill(G.quad(new Path2D(), 0, 1, z0 / H, z1 / H)); };
                band(0, B.P, T.base); band(0, B.G, T.baseLo);
                band(H - B.CORN, H, id === 'brownstone' ? hexToRgba(B.CORNICE, 0.9) : id === 'deco' ? B.SPANDREL : id === 'terrace' ? B.TRIM : T.lo);
                if (!fine) return;
                const lines = (z0, z1, step, col, w) => { const p = new Path2D(); for (let z = z0 + step; z < z1; z += step) G.line(p, 0, z / H, 1, z / H); ctx.lineWidth = w || 0.6; ctx.strokeStyle = col; ctx.stroke(p); };
                if (id === 'brownstone') {
                    lines(0, B.P, 2.2, 'rgba(20,12,8,.4)');                              // rustication
                    lines(B.P, H - B.CORN, 2.4, 'rgba(232,200,160,.09)');                // brick courses
                } else if (id === 'deco') {
                    lines(B.G, B.P, 4, 'rgba(40,30,20,.16)');                             // ashlar joints
                    lines(B.P, H - B.CORN, 4.5, 'rgba(40,30,20,.08)');
                    band(B.G - 0.5, B.G, 'rgba(255,240,210,.35)');                        // the granite's polish
                    band(B.G, B.G + 0.7, hexToRgba(B.GOLD, 0.8));                         // a gilt line over it
                    if (H - B.CORN > B.P) {                                               // the frieze's gilt chevrons
                        const p = new Path2D(), n = Math.max(4, Math.round(G.L / 8)), z0 = (H - B.CORN + 1.6) / H, z1 = (H - 1.6) / H;
                        for (let i = 0; i < n; i++) { G.line(p, i / n, z0, (i + 0.5) / n, z1); G.line(p, (i + 0.5) / n, z1, (i + 1) / n, z0); }
                        ctx.strokeStyle = hexToRgba(B.GOLD, 0.7); ctx.lineWidth = 0.7; ctx.stroke(p);
                    }
                } else if (id === 'terrace') {
                    lines(0, B.P - 1, 3, 'rgba(60,50,40,.22)', 0.8);                      // rusticated stucco
                } else {
                    lines(B.P, H - B.CORN, 2.4, 'rgba(232,200,160,.08)');                 // brick courses
                    lines(H - B.CORN, H, 1.6, 'rgba(0,0,0,.18)');                         // the corbelled band
                    band(B.P - 1.2, B.P + 0.6, B.STEEL);                                  // the steel beam over the ground floor
                }
            },

            /** A face's openings, in the style's way. emissive: just what's lit. */
            _vBrFace(ctx, f, G, H, emissive) {
                const id = this.variant.id;
                if (id === 'deco') return this._vAptFaceDeco(ctx, f, G, H, emissive);
                if (id === 'terrace') return this._vAptFaceTerrace(ctx, f, G, H, emissive);
                if (id === 'loft') return this._vAptFaceLoft(ctx, f, G, H, emissive);
                return this._vAptFaceBrown(ctx, f, G, H, emissive);
            },

            /** Window lights: by the house, the bay and the face */
            _vAptLit(f) { const seed = this.variant.seed, c = f.side.charCodeAt(0) * 3; return (i, p) => _bldHash(seed, 560 + i * 7 + c) < p; },

            /**
             * A brownstone face: the garden windows and their grilles, the parlour windows under pediments (the door
             * in its bay on the front), the sash windows with lintels and sills.
             */
            _vAptFaceBrown(ctx, f, G, H, emissive) {
                const B = this.variant.st, front = f.side === this.facing, { L, rect, poly } = this._vAptT(G, H);
                const bays = this._vBrU(f, G), storeys = this._vBrStoreys(H), fine = _zoomLOD < 2 && G.depth > 6;
                const hw = B.WW / 2 / L, dw = B.DOOR_W / L, lit = this._vAptLit(f);
                const gw = [1.6, B.G - 1.8], pw = [B.G + 2.4, B.P - 4], dz = [0.6, B.P - 2.2];    // garden window, parlour window, the door (from the stoop)
                if (emissive) {
                    const glass = new Path2D(), warm = new Path2D();
                    bays.forEach((b, i) => {
                        if (b.door && front) { rect(warm, b.u - dw + 0.8 / L, b.u + dw - 0.8 / L, dz[1] - 4, dz[1] - 0.6); return; }   // the fanlight
                        if (lit(i, 0.5)) rect(glass, b.u - hw, b.u + hw, pw[0], pw[1]);
                        if (lit(i + 20, 0.3)) rect(glass, b.u - hw * 0.8, b.u + hw * 0.8, gw[0], gw[1]);
                        storeys.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, 0.55)) rect(glass, b.u - hw, b.u + hw, s0 + 2, s1 - 2.4); });
                    });
                    ctx.fillStyle = B.LIT; ctx.fill(glass);
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
                this._vAptGlass(ctx, dark, B.PANE);
                ctx.fillStyle = B.DOOR; ctx.fill(door);
                ctx.fillStyle = 'rgba(255,230,190,.08)'; ctx.fill(panel);
                ctx.fillStyle = B.IRON; ctx.fill(bars);
                if (fine) { ctx.strokeStyle = 'rgba(80,60,40,.45)'; ctx.lineWidth = 0.5; ctx.stroke(stone); }
            },

            /**
             * A deco face: a stepped bronze entrance with a sunburst transom, tall bronze-framed windows on the ground
             * floor, then strips of windows over gilt-chevron spandrels up to the frieze.
             */
            _vAptFaceDeco(ctx, f, G, H, emissive) {
                const B = this.variant.st, T = this.variant.tone, front = f.side === this.facing, { L, rect, poly } = this._vAptT(G, H);
                const bays = this._vBrU(f, G), storeys = this._vBrStoreys(H), fine = _zoomLOD < 2 && G.depth > 6;
                const hw = B.WW / 2 / L, dw = B.DOOR_W / L, lit = this._vAptLit(f);
                const gw = [B.G + 1.5, B.P - 3], dz = [0.4, B.P - 10], tz = [B.P - 9.4, B.P - 5.6];   // ground window, door, transom
                const win = (s0, s1) => [s0 + 1.4, s1 - 1.4];
                if (emissive) {
                    const glass = new Path2D(), warm = new Path2D();
                    bays.forEach((b, i) => {
                        if (b.door && front) { rect(warm, b.u - dw, b.u + dw, tz[0], tz[1]); return; }
                        if (lit(i, 0.6)) rect(glass, b.u - hw, b.u + hw, gw[0], gw[1]);
                        storeys.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, 0.55)) { const [w0, w1] = win(s0, s1); rect(glass, b.u - hw, b.u + hw, w0, w1); } });
                    });
                    ctx.fillStyle = B.LIT; ctx.fill(glass);
                    ctx.fillStyle = 'rgba(255,214,140,.9)'; ctx.fill(warm);
                    return;
                }
                const surround = new Path2D(), inner = new Path2D(), bronze = new Path2D(), dark = new Path2D(), spand = new Path2D(), gold = new Path2D(), bars = new Path2D();
                for (const b of bays) {
                    const u = b.u;
                    if (b.door && front) {                                                         // the entrance: a stepped surround, bronze leaves, a sunburst
                        const o = dw + 4 / L, m = dw + 2 / L;
                        poly(surround, [[u - o, 0], [u - o, B.P - 6], [u - m, B.P - 6], [u - m, B.P - 4.4], [u + m, B.P - 4.4], [u + m, B.P - 6], [u + o, B.P - 6], [u + o, 0]]);
                        rect(inner, u - dw - 1 / L, u + dw + 1 / L, 0, tz[1] + 0.6);
                        rect(bronze, u - dw, u + dw, dz[0], dz[1]);
                        rect(dark, u - dw, u + dw, tz[0], tz[1]);
                        for (const s of [-1, 1]) rect(dark, u + s * 1.2 / L, u + s * (dw - 1.2 / L), 3, dz[1] - 2);
                        if (fine) {
                            for (let k = -3; k <= 3; k++) G.line(gold, u, tz[0] / H, u + k / 3 * dw, tz[1] / H);
                            G.line(gold, u - dw, tz[0] / H, u + dw, tz[0] / H);
                            rect(bars, u - 0.35 / L, u + 0.35 / L, dz[0], dz[1]);
                        }
                    } else {
                        rect(bronze, u - hw - 0.9 / L, u + hw + 0.9 / L, gw[0] - 0.9, gw[1] + 0.9);   // a tall ground floor window
                        rect(dark, u - hw, u + hw, gw[0], gw[1]);
                        if (fine) {
                            for (const m of [-1 / 3, 1 / 3]) rect(bars, u + hw * m * 2 - 0.3 / L, u + hw * m * 2 + 0.3 / L, gw[0], gw[1]);
                            G.line(gold, u - hw, (gw[1] - 4) / H, u + hw, (gw[1] - 4) / H);
                        }
                    }
                    storeys.forEach(([s0, s1], j) => {
                        const [w0, w1] = win(s0, s1);
                        rect(bronze, u - hw - 0.7 / L, u + hw + 0.7 / L, w0 - 0.4, w1 + 0.4);
                        rect(dark, u - hw, u + hw, w0, w1);
                        if (fine) rect(bars, u - 0.3 / L, u + 0.3 / L, w0, w1);
                        if (j < storeys.length - 1) {                                              // the spandrel up to the next window, a gilt chevron on it
                            const z0 = w1 + 0.4, z1 = s1 + 1.0;
                            rect(spand, u - hw - 0.7 / L, u + hw + 0.7 / L, z0, z1);
                            if (fine) { const zm = (z0 + z1) / 2; G.line(gold, u - hw, (zm - 0.6) / H, u, (zm + 0.6) / H); G.line(gold, u, (zm + 0.6) / H, u + hw, (zm - 0.6) / H); }
                        }
                    });
                }
                ctx.fillStyle = T.lo; ctx.fill(surround);
                ctx.fillStyle = lightenHex(T.wall, 14); ctx.fill(inner);
                ctx.fillStyle = B.BRONZE; ctx.fill(bronze);
                ctx.fillStyle = B.SPANDREL; ctx.fill(spand);
                this._vAptGlass(ctx, dark, B.PANE);
                ctx.fillStyle = B.BRONZE; ctx.fill(bars);
                if (fine) { ctx.strokeStyle = hexToRgba(B.GOLD, 0.75); ctx.lineWidth = 0.55; ctx.stroke(gold); ctx.strokeStyle = 'rgba(60,40,24,.5)'; ctx.stroke(surround); }
            },

            /**
             * A terrace face: a black-glossed door under a fanlight (the portico stands in front of it), ground floor
             * windows in architraves with keystones, french windows above, the first floor's under cornice hoods.
             */
            _vAptFaceTerrace(ctx, f, G, H, emissive) {
                const B = this.variant.st, front = f.side === this.facing, { L, rect, poly } = this._vAptT(G, H);
                const bays = this._vBrU(f, G), storeys = this._vBrStoreys(H), fine = _zoomLOD < 2 && G.depth > 6;
                const hw = B.WW / 2 / L, dw = B.DOOR_W / L, lit = this._vAptLit(f);
                const gw = [B.G + 2, B.P - 5], dz = [0.4, B.P - 9.5];
                const win = (s0, s1, j) => [s0 + (j ? 1.6 : 0.6), s1 - 2.8];
                const fan = (p, u, z, r) => { const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; pts.push([u - Math.cos(a) * r / L, z + Math.sin(a) * r * 0.55]); } return poly(p, pts); };
                if (emissive) {
                    const glass = new Path2D(), warm = new Path2D();
                    bays.forEach((b, i) => {
                        if (b.door && front) { fan(warm, b.u, dz[1] + 0.4, B.DOOR_W - 0.6); return; }
                        if (lit(i, 0.5)) rect(glass, b.u - hw, b.u + hw, gw[0], gw[1]);
                        storeys.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, 0.55)) { const [w0, w1] = win(s0, s1, j); rect(glass, b.u - hw, b.u + hw, w0, w1); } });
                    });
                    ctx.fillStyle = B.LIT; ctx.fill(glass);
                    ctx.fillStyle = 'rgba(255,220,160,.9)'; ctx.fill(warm);
                    return;
                }
                const stone = new Path2D(), dark = new Path2D(), bars = new Path2D(), door = new Path2D(), fanP = new Path2D(), lines = new Path2D();
                for (const b of bays) {
                    const u = b.u;
                    if (b.door && front) {                                                         // the door: an architrave, the leaf, a fanlight
                        rect(stone, u - dw - 1.6 / L, u + dw + 1.6 / L, 0, dz[1] + B.DOOR_W * 0.55 + 1.6);
                        rect(door, u - dw, u + dw, dz[0], dz[1]);
                        fan(fanP, u, dz[1] + 0.4, B.DOOR_W - 0.6);
                        if (fine) {
                            for (let k = 1; k < 4; k++) { const a = Math.PI * k / 4; G.line(lines, u, (dz[1] + 0.4) / H, u - Math.cos(a) * (B.DOOR_W - 0.6) / L, (dz[1] + 0.4 + Math.sin(a) * (B.DOOR_W - 0.6) * 0.55) / H); }
                            for (const [z0, z1] of [[2.5, 7.5], [9, dz[1] - 1.6]]) rect(bars, u - dw + 1.4 / L, u + dw - 1.4 / L, z0, z0 + 0.5), rect(bars, u - dw + 1.4 / L, u + dw - 1.4 / L, z1 - 0.5, z1);
                        }
                    } else {
                        rect(stone, u - hw - 1.3 / L, u + hw + 1.3 / L, gw[0] - 1.3, gw[1] + 1.3);   // an architrave and a keystone
                        rect(stone, u - 1.3 / L, u + 1.3 / L, gw[1] + 1.3, gw[1] + 3.2);
                        rect(dark, u - hw, u + hw, gw[0], gw[1]);
                        if (fine) { rect(bars, u - 0.3 / L, u + 0.3 / L, gw[0], gw[1]); for (const t of [1 / 3, 2 / 3]) { const z = gw[0] + (gw[1] - gw[0]) * t; rect(bars, u - hw, u + hw, z - 0.25, z + 0.25); } }
                    }
                    storeys.forEach(([s0, s1], j) => {                                             // french windows: an architrave, the first floor's under a hood
                        const [w0, w1] = win(s0, s1, j);
                        rect(stone, u - hw - 1.1 / L, u + hw + 1.1 / L, w0, w1 + 1.1);
                        if (j === 0) rect(stone, u - hw - 2.6 / L, u + hw + 2.6 / L, w1 + 1.4, w1 + 2.7);
                        rect(dark, u - hw, u + hw, w0, w1);
                        if (fine) { const z = w0 + (w1 - w0) * 0.62; rect(bars, u - 0.3 / L, u + 0.3 / L, w0, w1); rect(bars, u - hw, u + hw, z - 0.25, z + 0.25); }
                    });
                }
                ctx.fillStyle = B.TRIM; ctx.fill(stone);
                this._vAptGlass(ctx, dark, B.PANE);
                this._vAptGlass(ctx, fanP, B.PANE);
                ctx.fillStyle = this.variant.door || B.DOORS[0]; ctx.fill(door);
                ctx.fillStyle = B.TRIM; ctx.fill(bars);
                if (fine) { ctx.strokeStyle = B.TRIM; ctx.lineWidth = 0.5; ctx.stroke(lines); ctx.strokeStyle = 'rgba(120,110,96,.4)'; ctx.stroke(stone); }
            },

            /**
             * A loft face: steel-and-glass on the ground floor, the door in a glazed screen, wide steel-gridded
             * windows under brick soldier arches with concrete sills, tie plates at the floors.
             */
            _vAptFaceLoft(ctx, f, G, H, emissive) {
                const B = this.variant.st, T = this.variant.tone, front = f.side === this.facing, { L, rect } = this._vAptT(G, H);
                const bays = this._vBrU(f, G), storeys = this._vBrStoreys(H), fine = _zoomLOD < 2 && G.depth > 6;
                const hw = B.WW / 2 / L, dw = B.DOOR_W / L, lit = this._vAptLit(f);
                const gw = [B.G + 1.4, B.P - 3.4], win = (s0, s1) => [s0 + 1.8, s1 - 2.6];
                const grid = (p, u0, u1, z0, z1, cols, rows) => {
                    for (let c = 1; c < cols; c++) { const u = u0 + (u1 - u0) * c / cols; rect(p, u - 0.3 / L, u + 0.3 / L, z0, z1); }
                    for (let r = 1; r < rows; r++) { const z = z0 + (z1 - z0) * r / rows; rect(p, u0, u1, z - 0.3, z + 0.3); }
                };
                if (emissive) {
                    const warm = new Path2D(), cool = new Path2D(), door = new Path2D();   // the lobby behind the screen, dimmer than a room
                    bays.forEach((b, i) => {
                        if (b.door && front) { rect(door, b.u - dw - 4 / L, b.u + dw + 4 / L, 0.8, gw[1]); return; }
                        if (lit(i, 0.35)) rect(lit(i + 9, 0.6) ? warm : cool, b.u - hw, b.u + hw, gw[0], gw[1]);
                        storeys.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, 0.55)) { const [w0, w1] = win(s0, s1); rect(lit(i * 3 + j + 70, 0.65) ? warm : cool, b.u - hw, b.u + hw, w0, w1); } });
                    });
                    ctx.fillStyle = B.LIT; ctx.fill(warm);
                    ctx.fillStyle = 'rgba(255,214,160,.28)'; ctx.fill(door);
                    ctx.fillStyle = B.LIT2; ctx.fill(cool);
                    return;
                }
                const steel = new Path2D(), dark = new Path2D(), bars = new Path2D(), arch = new Path2D(), sill = new Path2D(), plates = new Path2D(), push = new Path2D();
                for (const b of bays) {
                    const u = b.u;
                    if (b.door && front) {                                                         // a glazed screen: sidelights, the door's two leaves
                        const o = dw + 5 / L;
                        rect(steel, u - o - 1 / L, u + o + 1 / L, 0, gw[1] + 1);
                        rect(dark, u - o, u + o, 0.8, gw[1]);
                        if (fine) {
                            for (const x of [-dw, 0, dw]) rect(bars, u + x - 0.5 / L, u + x + 0.5 / L, 0.8, gw[1]);
                            rect(bars, u - o, u + o, gw[1] - 5, gw[1] - 4.3);
                            for (const s of [-1, 1]) rect(push, u + s * 2 / L - 0.4 / L, u + s * 2 / L + 0.4 / L, 6, 13);
                        }
                    } else {
                        rect(steel, u - hw - 1 / L, u + hw + 1 / L, gw[0] - 1, gw[1] + 1);
                        rect(dark, u - hw, u + hw, gw[0], gw[1]);
                        if (fine) grid(bars, u - hw, u + hw, gw[0], gw[1], 4, 3);
                    }
                    for (const [s0, s1] of storeys) {                                              // a factory window: soldier arch, steel grid, concrete sill
                        const [w0, w1] = win(s0, s1);
                        rect(arch, u - hw - 1.6 / L, u + hw + 1.6 / L, w1, w1 + 2.2);
                        rect(sill, u - hw - 1.2 / L, u + hw + 1.2 / L, w0 - 1.2, w0);
                        rect(steel, u - hw, u + hw, w0, w1);
                        rect(dark, u - hw + 0.8 / L, u + hw - 0.8 / L, w0 + 0.6, w1 - 0.6);
                        if (fine) {
                            grid(bars, u - hw + 0.8 / L, u + hw - 0.8 / L, w0 + 0.6, w1 - 0.6, 5, 3);
                            for (const s of [-1, 1]) { const x = u + s * B.BAY / 2 / L; if (x > 0.02 && x < 0.98) rect(plates, x - 1.2 / L, x + 1.2 / L, s0 - 1.2, s0 + 1.2); }
                        }
                    }
                }
                ctx.fillStyle = T.lo; ctx.fill(arch);
                ctx.fillStyle = B.CONC; ctx.fill(sill);
                ctx.fillStyle = B.STEEL; ctx.fill(steel);
                this._vAptGlass(ctx, dark, B.PANE);
                ctx.fillStyle = 'rgba(160,200,190,.06)'; ctx.fill(dark);
                ctx.fillStyle = B.STEEL; ctx.fill(bars);
                ctx.fillStyle = B.IRON; ctx.fill(plates);
                ctx.fillStyle = B.STEEL_HI; ctx.fill(push);
                if (fine) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.5; ctx.stroke(arch); }
            },

            /** Over the walls on all faces: the openings, then the style's ledges, piers, portico, balconies, the door's hood, the cornice */
            _vBrOver(ctx, faces, P) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrOver(ctx, faces, P));
                const v = this.variant, B = v.st, T = v.tone, id = v.id, H = this._vH(), K = LandmarkKit, fine = _zoomLOD < 2;
                const edges = [], fronts = [], sides = [], brackets = [], piers = [], balc = [];
                const at = (f, t) => ({ x: f.x1 + (f.x2 - f.x1) * t, y: f.y1 + (f.y2 - f.y1) * t, nx: f.nx, ny: f.ny });
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P), L = G.L, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
                    const e = { a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny };
                    edges.push(e); if (f.side !== this.facing) sides.push(e);
                    if (f.side === this.facing) fronts.push({ a: [f.x1 + ux * 3, f.y1 + uy * 3], b: [f.x2 - ux * 3, f.y2 - uy * 3], nx: f.nx, ny: f.ny });
                    if (G.depth >= 3) this._vBrFace(ctx, f, G, H, false);
                    if (!fine) continue;
                    const bays = this._vBrU(f, G);
                    if (id === 'brownstone' || id === 'terrace') for (const b of bays) for (const o of [-B.BAY / 2 + 2, B.BAY / 2 - 2]) {
                        const t = b.u + o / L; if (t > 0.01 && t < 0.99) brackets.push(at(f, t));
                    }
                    if (id === 'deco') bays.forEach((b, i) => {
                        for (const s of i === bays.length - 1 ? [-1, 1] : [-1]) { const t = b.u + s * B.BAY / 2 / L; if (t > 0.01 && t < 0.99) piers.push(at(f, t)); }
                    });
                    if (id === 'terrace' && f.side === this.facing) {
                        const hw = (B.WW / 2 + 1.6) / L;
                        for (const b of bays) if (b.u - hw > 0 && b.u + hw < 1) { const a = at(f, b.u - hw), c = at(f, b.u + hw); balc.push({ a: [a.x, a.y], b: [c.x, c.y], nx: f.nx, ny: f.ny }); }
                    }
                }
                const hood = this._vBrDoorHood(), Hd = B.HOOD;
                if (id === 'brownstone') {
                    K.ledge(ctx, edges, B.P, 1.6, 1.4, B.TRIM, B.TRIM_LO, hexToRgba(B.TRIM_HI, 0.7));     // the sill course
                    K.ledge(ctx, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);                   // the hood over the door
                    if (brackets.length) K.fins(ctx, brackets, H - B.CORN, H - 0.5, 1.6, 3.6, B.CORNICE, 'rgba(214,190,150,.35)');
                    K.ledge(ctx, edges, H, 4.5, 2.6, B.CORNICE, B.CORNICE_LO, 'rgba(214,190,150,.55)');   // the cornice
                } else if (id === 'deco') {
                    if (piers.length) K.fins(ctx, piers, B.G, H, 4, 1.8, lightenHex(T.wall, 10), hexToRgba(B.GOLD, 0.55));
                    K.ledge(ctx, edges, B.P, 1.2, 1, hexToRgba(B.GOLD, 0.9), darkenHex(T.wall, 20), null);  // a gilt course over the ground floor
                    K.ledge(ctx, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);                   // the marquee
                    K.ledge(ctx, edges, H, 2.6, 2.4, lightenHex(T.wall, 16), T.lo, hexToRgba(B.GOLD, 0.8));
                } else if (id === 'terrace') {
                    const s = this._vAptDoorS(), g = this._frontGeo(), cols = [-12, 12].map(d => { const p = this._frontPt0(s + d); return [p[0] + g.nx * (Hd.out - 2.5), p[1] + g.ny * (Hd.out - 2.5)]; });
                    if (fronts.length) K.veranda(ctx, fronts, B.P + 0.4, 6, 4, 4.4, B.TRIM, B.TRIM_LO, B.IRON);   // the first floor's balcony
                    K.columns(ctx, cols, 1.8, 0.4, Hd.z - Hd.th, B.TRIM, B.TRIM_LO);                    // the portico, standing proud of it
                    K.ledge(ctx, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);
                    if (sides.length) K.ledge(ctx, sides, B.P + 0.4, 1.4, 1.2, B.TRIM, B.TRIM_LO, null);
                    if (balc.length) this._vBrStoreys(H).slice(1).forEach(([s0]) => K.veranda(ctx, balc, s0 + 1.4, 2.8, 2.6, 4, B.IRON, B.IRON, B.IRON));
                    if (brackets.length) K.fins(ctx, brackets, H - B.CORN + 1, H - 0.5, 1.6, 3.4, B.TRIM, 'rgba(120,110,96,.5)');
                    K.ledge(ctx, edges, H, 4.2, 3, B.TRIM, B.TRIM_LO, 'rgba(255,255,255,.8)');
                } else {
                    K.ledge(ctx, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);                   // the steel canopy
                    K.ledge(ctx, edges, H, 1.6, 2.2, B.CONC, '#6a665f', null);                            // the parapet's coping
                }
            },

            /** The door's place along the front (from the front's middle, as _frontPt0 takes it) */
            _vAptDoorS() { const Bs = this._vBrBays(); return (Bs.door - Bs.F.fw / 2) * Bs.side; },

            /** The door's hood (or marquee, portico, canopy): a ledge along the front either side of the door */
            _vBrDoorHood() {
                const g = this._frontGeo(), s = this._vAptDoorS(), w = this.variant.st.HOOD.w;
                return { a: this._frontPt0(s - w), b: this._frontPt0(s + w), nx: g.nx, ny: g.ny };
            },

            /** The door's lamps (lanterns, sconces, the portico's lantern, goosenecks) */
            _vBrLanterns(ctx, emissive) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrLanterns(ctx, emissive));
                const B = this.variant.st, Lm = B.LAMPS, s = this._vAptDoorS(), lamps = new Path2D(), halo = new Path2D();
                for (const d of Lm.d) {
                    const p = this._vFrontPt(s + d, Lm.out, Lm.z);
                    lamps.moveTo(p[0] + Lm.r, p[1]); lamps.arc(p[0], p[1], Lm.r, 0, Math.PI * 2);
                    halo.moveTo(p[0] + Lm.r * 4, p[1]); halo.arc(p[0], p[1], Lm.r * 4, 0, Math.PI * 2);
                }
                if (emissive) { ctx.fillStyle = 'rgba(255,190,110,.22)'; ctx.fill(halo); ctx.fillStyle = 'rgba(255,232,180,.95)'; ctx.fill(lamps); }
                else { ctx.fillStyle = this.variant.id === 'deco' ? B.GOLD : B.IRON; ctx.fill(lamps); }
            },

            /** Its name lying on the door's hood (the generic sign's place, _paintSign) */
            _vBrFront(ctx, emissive) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrFront(ctx, emissive));
                const v = this.variant, N = v.st.NAME, Hd = v.st.HOOD;
                if (v.name == null) v.name = (this.attachedSign && this.attachedSign.text) || '';
                if (!v.name) return;
                const text = N.caps ? v.name.toUpperCase() : v.name, sp = N.spacing || 0, max = Hd.w * 2 - 6;
                let px = N.px, font = `${N.weight || ''}${px}px ${N.font}`;
                if (!v.nameW || v.nameW.font !== font) { ctx.save(); ctx.font = font; v.nameW = { font, w: ctx.measureText(text).width + sp * text.length }; ctx.restore(); }
                if (v.nameW.w > max) { px = Math.max(5, Math.floor(px * max / v.nameW.w * 10) / 10); font = `${N.weight || ''}${px}px ${N.font}`; }
                this._vBoard(ctx, Hd.z, 0, (c, os) => {
                    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
                    if (sp && 'letterSpacing' in c) c.letterSpacing = sp + 'px';
                    c.fillStyle = emissive ? N.glow : N.ink; c.fillText(text, sp / 2, os * Hd.out / 2 + 0.5);
                    if (sp && 'letterSpacing' in c) c.letterSpacing = '0px';
                });
            },

            /** The pavement in front, painted once (frame units: x along the front, y out from the wall at fd) */
            _vBrPaintBase(c, v, fw, fd, door) {
                const dot = (x, yy, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, Math.PI * 2); c.fill(); };
                const ok = (x, w) => x - w / 2 > 4 && x + w / 2 < fw - 4;
                if (v.id === 'deco') return this._vAptBaseDeco(c, v, fw, fd, door, dot, ok);
                if (v.id === 'terrace') return this._vAptBaseTerrace(c, v, fw, fd, door, dot, ok);
                if (v.id === 'loft') return this._vAptBaseLoft(c, v, fw, fd, door, dot, ok);
                // brownstone: the stoop (brownstone treads between iron rails, newel posts), the areaway's railing, a planter at each end
                const B = v.st, T = v.tone, y = fd, sw = 26, sd = 24, n = 6;
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

            /** Deco: a black granite step with a gilt nosing, a terrazzo sunburst fan, potted palms in black-and-gold planters */
            _vAptBaseDeco(c, v, fw, fd, door, dot, ok) {
                const B = v.st, y = fd;
                c.fillStyle = '#2a2730'; c.beginPath(); c.moveTo(door - 26, y + 8); c.arc(door, y + 8, 26, 0, Math.PI); c.closePath(); c.fill();
                c.strokeStyle = hexToRgba(B.GOLD, 0.75); c.lineWidth = 0.9; c.beginPath();
                for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8; c.moveTo(door + Math.cos(a) * 7, y + 8 + Math.sin(a) * 7); c.lineTo(door + Math.cos(a) * 25, y + 8 + Math.sin(a) * 25); }
                c.stroke();
                c.beginPath(); c.arc(door, y + 8, 25.5, 0, Math.PI); c.stroke(); c.beginPath(); c.arc(door, y + 8, 7, 0, Math.PI); c.stroke();
                c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(door - 20 + 2, y + 2, 40, 8);
                c.fillStyle = '#1d1b22'; c.fillRect(door - 20, y, 40, 8);
                c.fillStyle = hexToRgba(B.GOLD, 0.85); c.fillRect(door - 20, y + 7.2, 40, 0.9);
                for (const x of [door - 38, door + 38]) {
                    if (!ok(x, 16)) continue;
                    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 6, y + 9, 15, 15);
                    c.fillStyle = '#16151a'; c.fillRect(x - 7.5, y + 7, 15, 15); c.strokeStyle = B.GOLD; c.lineWidth = 1; c.strokeRect(x - 7, y + 7.5, 14, 14);
                    c.strokeStyle = '#2f6a3a'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath();
                    for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3; c.moveTo(x, y + 14.5); c.lineTo(x + Math.cos(a) * 10, y + 14.5 + Math.sin(a) * 10); }
                    c.stroke(); c.lineCap = 'butt';
                    dot(x, y + 14.5, 2.4, '#4f8a46');
                }
            },

            /** Terrace: a chequered tile path to the step, box hedges behind low railings, bay trees in white planters */
            _vAptBaseTerrace(c, v, fw, fd, door, dot, ok) {
                const B = v.st, y = fd, pw = 24, pd = 28, t = 4;
                c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(door - pw / 2 + 2, y + 2, pw, pd);
                for (let j = 0; j * t < pd; j++) for (let i = 0; i * t < pw; i++) { c.fillStyle = (i + j) % 2 ? '#1c1d22' : '#ece8de'; c.fillRect(door - pw / 2 + i * t, y + j * t, t, t); }
                c.fillStyle = B.TRIM; c.fillRect(door - pw / 2 - 2, y, pw + 4, 5); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(door - pw / 2 - 2, y + 4.2, pw + 4, 0.8);
                for (const [x0, x1] of [[4, door - pw / 2 - 4], [door + pw / 2 + 4, fw - 4]]) {   // box hedges and their railing
                    if (x1 - x0 < 8) continue;
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x0 + 1, y + 2, x1 - x0, 9);
                    c.fillStyle = '#2f5a34'; c.beginPath(); c.roundRect(x0, y + 0.5, x1 - x0, 8, 3); c.fill();
                    c.fillStyle = 'rgba(140,190,120,.25)'; c.fillRect(x0 + 1, y + 1, x1 - x0 - 2, 2);
                    c.strokeStyle = B.IRON; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, y + 11); c.lineTo(x1, y + 11);
                    for (let x = x0; x <= x1; x += 3.5) { c.moveTo(x, y + 11); c.lineTo(x, y + 9.4); }
                    c.stroke();
                }
                for (const x of [door - pw / 2 - 11, door + pw / 2 + 11]) {
                    if (!ok(x, 12)) continue;
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 4, y + 16, 11, 11);
                    c.fillStyle = B.TRIM; c.fillRect(x - 5.5, y + 14, 11, 11); c.strokeStyle = B.TRIM_LO; c.lineWidth = 0.8; c.strokeRect(x - 5, y + 14.5, 10, 10);
                    dot(x, y + 19.5, 6, '#2f6a3a'); dot(x - 1.8, y + 17.8, 3, '#4f8a46');
                }
            },

            /** Loft: a concrete loading dock with a hazard edge, a bike rack and corten planters of grasses */
            _vAptBaseLoft(c, v, fw, fd, door, dot, ok) {
                const B = v.st, y = fd, dw = 58, dd = 12;
                c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(door - dw / 2 + 2, y + 2, dw, dd + 2);
                c.fillStyle = '#77736c'; c.fillRect(door - dw / 2, y, dw, dd);
                c.fillStyle = '#f2c14e'; c.fillRect(door - dw / 2, y + dd - 2.4, dw, 2.4);
                c.fillStyle = '#1b1c20'; c.beginPath();
                for (let x = door - dw / 2; x < door + dw / 2 - 3; x += 6) { c.moveTo(x, y + dd); c.lineTo(x + 3, y + dd); c.lineTo(x + 5, y + dd - 2.4); c.lineTo(x + 2, y + dd - 2.4); c.closePath(); }
                c.fill();
                c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 0.6; c.beginPath(); for (let x = door - dw / 2 + 14; x < door + dw / 2; x += 14) { c.moveTo(x, y); c.lineTo(x, y + dd - 2.4); } c.stroke();
                const rx = door + dw / 2 + 14;
                if (ok(rx + 8, 20)) {                                                                // a bike rack: steel hoops
                    c.strokeStyle = B.STEEL_HI; c.lineWidth = 1.6; c.beginPath();
                    for (let i = 0; i < 3; i++) { const x = rx + i * 7; c.moveTo(x, y + 8); c.lineTo(x, y + 22); }
                    c.stroke(); for (let i = 0; i < 3; i++) dot(rx + i * 7, y + 8, 1.2, '#8a909a');
                }
                const px = door - dw / 2 - 16;
                if (ok(px, 22)) {                                                                    // a corten planter of grasses
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(px - 9, y + 6, 22, 11);
                    c.fillStyle = '#7a4a2a'; c.fillRect(px - 11, y + 4, 22, 11);
                    c.strokeStyle = '#8a9a5a'; c.lineWidth = 1; c.beginPath();
                    for (let i = 0; i < 9; i++) { const x = px - 9 + i * 2.2; c.moveTo(x, y + 13); c.lineTo(x + (i % 3 - 1) * 2, y + 5.5); }
                    c.stroke();
                }
            },

            /** The night: windows and the door lit, the lamps, the cornice's lip in the lamps' colour, the name */
            _vBrGlow(ctx, faces, P, dark) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vBrGlow(ctx, faces, P, dark));
                const B = this.variant.st, H = this._vH(), K = LandmarkKit, edges = [];
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P);
                    if (G.depth >= 3) this._vBrFace(ctx, f, G, H, true);
                    edges.push({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny });
                }
                const rim = K.rim(this, dark);
                if (rim.a > 0.01 && edges.length) K.ledge(ctx, edges, H, B.RIM, 0.01, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', `rgba(${rim.rgb}, ${0.5 * rim.a})`);
                this._vBrLanterns(ctx, true);
                this._vBrFront(ctx, true);
            }
        });
