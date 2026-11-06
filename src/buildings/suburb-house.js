        /* =====================================================================
           SUBURB HOUSE — a Darklands home (DRAFT)
           ---------------------------------------------------------------------
           A two-storey American house on the tiered kit (buildings/tiered-kit.js),
           for the gated suburb in Darklands. Too neat, and too quiet:
             · the house: clapboard siding over a brick foundation, white corner
               boards and trim, sash windows with black shutters, the front door
               in the middle under a fanlight; some windows boarded over, one or
               two lit a weak amber that doesn't look like anyone's home;
             · a covered porch across the front on four white posts, its own
               light by the door;
             · the garage on one side (`garage: 'E' | 'W'`), a paneled door, its
               own low hip roof;
             · over the house, drawn with the kit's lean (its `top`): a side-
               gabled shingle roof with siding in the gables, the chimney on one
               end, and the garage's hip roof;
             · out front (drawBase): the lawn gone long, a concrete walk to the
               porch steps, the drive to the garage, a mailbox, dead shrubs.
           SUBURB_SCHEMES are the paint jobs; a house picks one by `scheme`, and
           `boarded` / `lit` say which windows are which.
           ===================================================================== */
        const SUBURB_PLAN = {
            W: 230, D: 140, HOUSE: 28, EAVE: 6, RISE: 46,
            GARAGE: { W: 110, Y: 24, D: 116, H: 15, RISE: 20 },
            PORCH: { X: 50, W: 130, D: 34, Z: 13 },
            CHIM: { w: 20, h: 22, up: 12 }
        };
        const SUBURB_SCHEMES = {
            ash:   { siding: '#8f9498', sidingLo: '#5f6468', trim: '#e7e4dc', shutter: '#1d2024', door: '#3b1f22', roof: ['#3a3d42', '#2c2e33', '#33363b', '#30333a'], ridge: '#1d1f23' },
            sage:  { siding: '#7f8d7a', sidingLo: '#56634f', trim: '#e9e6da', shutter: '#20261d', door: '#5a1e1e', roof: ['#463c36', '#342c27', '#3d342f', '#392f2a'], ridge: '#221b17' },
            blue:  { siding: '#7488a0', sidingLo: '#4c5d72', trim: '#ecebe4', shutter: '#161b24', door: '#2a2f45', roof: ['#3b3a40', '#2b2a30', '#333238', '#2f2e35'], ridge: '#1b1a1f' },
            cream: { siding: '#c9bc9c', sidingLo: '#91856b', trim: '#f2efe6', shutter: '#2b2621', door: '#1f3324', roof: ['#4a3b32', '#372b24', '#40332b', '#3b2f27'], ridge: '#241b16' }
        };
        const _shFront = (t) => t.mitre.find(e => e && !e.hidden && e.ny > 0.99);

        /** Clapboard, corner boards, the foundation; the sash windows (shuttered, boarded or lit) in two storeys; the door on the front */
        function _shWall(d, l, t, H, L) {
            const C = t.scheme, front = _shFront(t), b = t.house, r = seededRandom(b.seed);
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.siding); g.addColorStop(1, C.sidingLo); d.fillStyle = g; d.fillRect(0, 0, L, H);
            for (let y = 1.1; y < H - 2.5; y += 1.1) { d.fillStyle = 'rgba(0,0,0,.18)'; d.fillRect(0, y, L, 0.25); d.fillStyle = 'rgba(255,255,255,.07)'; d.fillRect(0, y + 0.25, L, 0.2); }
            for (let i = 0; i < L / 6; i++) { d.fillStyle = `rgba(30,32,30,${0.05 + r() * 0.1})`; d.fillRect(r() * L, r() * H * 0.6, 0.6 + r(), 2 + r() * 8); }   // weather streaks
            d.fillStyle = '#4a2c24'; d.fillRect(0, H - 2.5, L, 2.5); d.fillStyle = 'rgba(0,0,0,.3)'; d.fillRect(0, H - 2.5, L, 0.4);   // brick foundation
            d.fillStyle = C.trim; d.fillRect(0, 0, L, 1.1);                                               // the frieze under the eaves
            const door = front ? front.u0 + b.doorU : -1e4, rows = [[H - 12.5, H - 5], [H - 25, H - 17.5]];
            let k = 0;
            for (const e of t.mitre) {
                if (!e || e.hidden) continue;
                d.fillStyle = C.trim; d.fillRect(e.u0, 0, 2.2, H - 2.5); d.fillRect(e.u0 + e.L - 2.2, 0, 2.2, H - 2.5);   // corner boards
                const n = Math.max(1, Math.round(e.L / 48));
                for (const [y0, y1] of rows) for (let i = 0; i < n; i++, k++) {
                    const cx = e.u0 + e.L * (i + 0.5) / n, w = 9;
                    if (e === front && Math.abs(cx - door) < 20 && y0 > H - 14) continue;                // the door's place
                    const boarded = b.boarded.includes(k), lit = b.lit.includes(k);
                    d.fillStyle = C.shutter; d.fillRect(cx - w / 2 - 4.4, y0 - 0.3, 3.6, y1 - y0 + 0.6); d.fillRect(cx + w / 2 + 0.8, y0 - 0.3, 3.6, y1 - y0 + 0.6);
                    d.fillStyle = 'rgba(255,255,255,.08)'; for (let y = y0 + 1; y < y1; y += 1.2) { d.fillRect(cx - w / 2 - 4.2, y, 3.2, 0.3); d.fillRect(cx + w / 2 + 1, y, 3.2, 0.3); }
                    d.fillStyle = C.trim; d.fillRect(cx - w / 2 - 0.8, y0 - 0.8, w + 1.6, y1 - y0 + 1.6);
                    d.fillStyle = '#14181c'; d.fillRect(cx - w / 2, y0, w, y1 - y0);
                    if (boarded) {
                        d.fillStyle = '#6e5a44'; for (const [a, yy] of [[-0.25, y0 + 1.6], [0.2, y0 + 3.6], [-0.1, y1 - 1.8]]) { d.save(); d.translate(cx, yy); d.rotate(a * 0.5); d.fillRect(-w / 2 - 1.5, -0.8, w + 3, 1.6); d.fillStyle = 'rgba(0,0,0,.3)'; d.fillRect(-w / 2 - 1.5, 0.5, w + 3, 0.3); d.restore(); d.fillStyle = '#6e5a44'; }
                    } else {
                        d.fillStyle = 'rgba(160,180,200,.14)'; d.fillRect(cx - w / 2, y0, w, (y1 - y0) / 2);
                        if (lit) { l.fillStyle = 'rgba(255,190,110,.55)'; l.fillRect(cx - w / 2, y0, w, y1 - y0); d.fillStyle = 'rgba(255,200,130,.18)'; d.fillRect(cx - w / 2, y0, w, y1 - y0); }
                        d.fillStyle = C.trim; d.fillRect(cx - 0.3, y0, 0.6, y1 - y0); d.fillRect(cx - w / 2, (y0 + y1) / 2 - 0.35, w, 0.7);   // the sash bars
                        if (lit) { l.fillStyle = '#000'; l.fillRect(cx - 0.3, y0, 0.6, y1 - y0); l.fillRect(cx - w / 2, (y0 + y1) / 2 - 0.35, w, 0.7); }
                    }
                    d.fillStyle = C.trim; d.fillRect(cx - w / 2 - 1.4, y1 + 0.6, w + 2.8, 0.8);         // the sill
                }
            }
            if (!front) return;
            // The door: paneled, under a fanlight, in a white surround
            const dt = H - 13.5;
            d.fillStyle = C.trim; d.fillRect(door - 8, dt - 3.4, 16, H - 2.5 - dt + 3.4);
            d.fillStyle = '#1c2024'; d.beginPath(); d.ellipse(door, dt - 0.2, 5.6, 2.6, 0, Math.PI, Math.PI * 2); d.fill();
            l.fillStyle = 'rgba(255,200,130,.45)'; l.beginPath(); l.ellipse(door, dt - 0.2, 5.6, 2.6, 0, Math.PI, Math.PI * 2); l.fill();
            d.fillStyle = C.door; d.fillRect(door - 5.6, dt, 11.2, H - 2.5 - dt);
            d.strokeStyle = 'rgba(0,0,0,.35)'; d.lineWidth = 0.4; for (const [px, py] of [[-4.4, 1.2], [0.6, 1.2], [-4.4, 6], [0.6, 6]]) d.strokeRect(door + px, dt + py, 3.8, 4);
            d.fillStyle = '#c9a85a'; d.fillRect(door + 3.6, dt + 6, 0.8, 0.8);
        }

        /** The garage: the same siding, a wide paneled door on the front, a small window on the side */
        function _shGarage(d, l, t, H, L) {
            const C = t.scheme, front = _shFront(t);
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.siding); g.addColorStop(1, C.sidingLo); d.fillStyle = g; d.fillRect(0, 0, L, H);
            for (let y = 1.1; y < H - 2; y += 1.1) { d.fillStyle = 'rgba(0,0,0,.18)'; d.fillRect(0, y, L, 0.25); }
            d.fillStyle = '#4a2c24'; d.fillRect(0, H - 2, L, 2); d.fillStyle = C.trim; d.fillRect(0, 0, L, 1);
            for (const e of t.mitre) { if (!e || e.hidden) continue; d.fillStyle = C.trim; d.fillRect(e.u0, 0, 2, H - 2); d.fillRect(e.u0 + e.L - 2, 0, 2, H - 2); }
            if (!front) return;
            const x0 = front.u0 + 14, w = front.L - 28, y0 = 3.2, y1 = H - 2;
            d.fillStyle = C.trim; d.fillRect(x0 - 1.4, y0 - 1.4, w + 2.8, y1 - y0 + 1.4);
            d.fillStyle = '#d8d5cc'; d.fillRect(x0, y0, w, y1 - y0);
            d.fillStyle = 'rgba(0,0,0,.16)'; for (let y = y0 + (y1 - y0) / 4; y < y1 - 0.5; y += (y1 - y0) / 4) d.fillRect(x0, y - 0.2, w, 0.4);
            for (let i = 0; i < 8; i++) { d.strokeStyle = 'rgba(0,0,0,.1)'; d.lineWidth = 0.3; d.strokeRect(x0 + 1 + i * w / 8, y0 + 0.8, w / 8 - 2, (y1 - y0) / 4 - 1.6); }
            d.fillStyle = 'rgba(40,30,20,.35)'; d.fillRect(x0, y1 - 2.2, w, 2.2);                  // rust and dirt at its foot
        }

        /** The porch roof's fascia, and its posts: white */
        function _shPorch(d, l, t, H, L) { d.fillStyle = t.scheme.trim; d.fillRect(0, 0, L, H); d.fillStyle = 'rgba(0,0,0,.2)'; d.fillRect(0, H - 0.3, L, 0.3); }
        function _shPost(d, l, t, H, L) { const g = d.createLinearGradient(0, 0, L, 0); g.addColorStop(0, '#f2efe6'); g.addColorStop(1, '#b9b5ab'); d.fillStyle = g; d.fillRect(0, 0, L, H); }
        function _shFlatRoof(c, glow, t) { if (glow) return; const [x0, y0, x1, y1] = t.box; c.fillStyle = t.scheme.ridge; c.fillRect(x0, y0, x1 - x0, y1 - y0); }
        function _shPorchRoof(c, glow, t) {
            if (glow) return; const [x0, y0, x1, y1] = t.box, R = t.scheme.roof;
            c.fillStyle = R[0]; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath(); for (let y = y0 + 5; y < y1; y += 5) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke();
            c.strokeStyle = t.scheme.trim; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, y1 - 0.7); c.lineTo(x1, y1 - 0.7); c.stroke();
        }
        function _shTop(ctx, emissive, t, b) { ctx.save(); b._shDrawRoofs(ctx, emissive); ctx.restore(); }
        function _shGarageTop(ctx, emissive, t, b) { ctx.save(); b._shDrawRoof(ctx, b._shRoofs().garage, emissive); ctx.restore(); }

        class SuburbHouse extends TieredBuilding {
            constructor(config) {
                super(config);
                this._sh = config._sh;
                this.crownZ = (SUBURB_PLAN.HOUSE * TierKit.Z_SCALE + SUBURB_PLAN.RISE + SUBURB_PLAN.CHIM.up + 20) * this.hero;
            }
            _setupSign() { this.attachedSign = null; }
            _generateLights() { this.topReach = 40; }
            drawSign() {}
            /** The porch light: one lantern by the door, under the porch roof */
            _entranceLamps() {
                const P = SUBURB_PLAN, du = this._shDoorU();
                return [{ kind: 'lantern', x: du + 14, y: P.D, z: 10, out: 4, rgb: '255, 196, 120', light: [90, '#ffc477'] }];
            }
            drawBase(c) { super.drawBase(c); this._shDrawGround(c); }
        }
        TierKit.profile(SuburbHouse);

        /**
         * A Darklands house: x, y its corner, its front south. config: scheme (a SUBURB_SCHEMES key), garage 'E' | 'W',
         * boarded / lit (window numbers, counted along the walls), seed.
         */
        function createSuburbHouse(x, y, config = {}) {
            const P = SUBURB_PLAN, scheme = SUBURB_SCHEMES[config.scheme] || SUBURB_SCHEMES.ash, G = P.GARAGE, west = config.garage === 'W';
            const ox = west ? G.W : 0;                                            // the house shifts right when the garage is on the west
            const house = { seed: config.seed || 7, boarded: config.boarded || [], lit: config.lit || [], doorU: P.PORCH.X + P.PORCH.W / 2 };
            const tier = (o) => Object.assign({ scheme, house, S: 2, shade: [16, 16, 18] }, o);
            const ledge = (z, top) => ({ z, out: 1.5, th: 1.2, top, band: [60, 60, 60], lip: 'rgba(240,236,226,.55)' });
            const posts = [0, 1, 2, 3].map(i => tier({ id: 'post' + i, solid: false, rect: [ox + P.PORCH.X + 3 + i * (P.PORCH.W - 8) / 3, P.D + P.PORCH.D - 5, 3, 3], z0: 0, z1: P.PORCH.Z, S: 4, fill: '#e8e4da', paint: _shPost, roofRes: 1, roof: _shFlatRoof }));
            return new SuburbHouse({
                id: config.id || 'suburb_house', x, y, label: config.label || 'House', type: 'house', facing: 'S', hero: 1.2,
                plan: { W: P.W + G.W, D: P.D },
                roofColor: scheme.roof[0], roofLightColor: scheme.roof[0], wallColor: scheme.siding, wallLightColor: scheme.siding, accentColor: scheme.trim,
                windowColor: '#14181c', windowLitColor: '#ffc477', windowFrameColor: scheme.trim, balconies: [], roofProps: [], sign: null,
                _sh: { ox, west, scheme, seed: house.seed },
                tiers: [
                    tier({ id: 'house', rect: [ox, 0, P.W, P.D], z0: 0, z1: P.HOUSE, fill: scheme.siding, paint: _shWall, ledges: [ledge(P.HOUSE, scheme.trim)], roofRes: 1, roof: _shFlatRoof, top: _shTop }),
                    tier({ id: 'garage', rect: [west ? 0 : P.W, G.Y, G.W, G.D], z0: 0, z1: G.H, fill: scheme.siding, paint: _shGarage, ledges: [ledge(G.H, scheme.trim)], roofRes: 1, roof: _shFlatRoof, top: _shGarageTop }),
                    // (a px off the wall: a tier back to back with a wall hides it below its top, _tkGeo)
                    tier({ id: 'porch', solid: false, rect: [ox + P.PORCH.X, P.D + 1, P.PORCH.W, P.PORCH.D], z0: P.PORCH.Z, z1: P.PORCH.Z + 1.4, S: 4, fill: scheme.trim, paint: _shPorch, roofRes: 1, roof: _shPorchRoof }),
                    ...posts
                ],
                ...config
            });
        }

        Object.assign(SuburbHouse.prototype, {
            // (heights here are world px; the kit's are design units, Z_SCALE times smaller)
            _shP(x, y, z) { return this._tkP(x, y, z / TierKit.Z_SCALE); },
            _shK(z) { return this._tkK(z / TierKit.Z_SCALE); },
            _shDoorU() { return (this._sh ? this._sh.ox : 0) + SUBURB_PLAN.PORCH.X + SUBURB_PLAN.PORCH.W / 2; },

            /** The roofs' planes as world points with heights: the house's side gable (two slopes, two gable walls), the garage's hip */
            _shRoofs() {
                if (this._shGeo && this._shGeo.x === this.x && this._shGeo.y === this.y) return this._shGeo;
                const P = SUBURB_PLAN, G = P.GARAGE, S = this._sh.scheme, e = P.EAVE, Z = TierKit.Z_SCALE;
                const hx0 = this.x + this._sh.ox - e, hx1 = hx0 + P.W + 2 * e, y0 = this.y - e, y1 = this.y + P.D + e, H = P.HOUSE * Z, zr = H + P.RISE, ry = (y0 + y1) / 2;
                const A = [hx0, y0, H], B = [hx1, y0, H], C = [hx1, y1, H], D = [hx0, y1, H], R0 = [hx0, ry, zr], R1 = [hx1, ry, zr];
                const gx0 = this.x + (this._sh.west ? 0 : P.W) - (this._sh.west ? e : 0), gx1 = gx0 + G.W + e, gy0 = this.y + G.Y - e, gy1 = this.y + G.Y + G.D + e, GH = G.H * Z, gzr = GH + G.RISE;
                const half = Math.min((gx1 - gx0), (gy1 - gy0)) / 2, gry = (gy0 + gy1) / 2;
                const gA = [gx0, gy0, GH], gB = [gx1, gy0, GH], gC = [gx1, gy1, GH], gD = [gx0, gy1, GH], gR0 = [gx0 + half, gry, gzr], gR1 = [gx1 - half, gry, gzr];
                return (this._shGeo = {
                    x: this.x, y: this.y, H, zr, ry, hx0, hx1,
                    house: [
                        { kind: 'slope', pts: [A, B, R1, R0], fill: S.roof[1] },
                        { kind: 'slope', pts: [C, D, R0, R1], fill: S.roof[0] },
                        { kind: 'gable', pts: [D, A, R0], fill: S.siding },
                        { kind: 'gable', pts: [B, C, R1], fill: S.sidingLo }
                    ],
                    garage: [
                        { kind: 'slope', pts: [gA, gB, gR1, gR0], fill: S.roof[1] },
                        { kind: 'slope', pts: [gD, gA, gR0], fill: S.roof[3] },
                        { kind: 'slope', pts: [gB, gC, gR1], fill: S.roof[2] },
                        { kind: 'slope', pts: [gC, gD, gR0, gR1], fill: S.roof[0] }
                    ]
                });
            },

            /** One roof: planes turned away first, then those facing the camera; shingle courses on the slopes, siding in the gables */
            _shDrawRoof(ctx, planes, emissive) {
                const S = this._sh.scheme;
                const proj = planes.map(pl => ({ pl, q: pl.pts.map(p => this._shP(p[0], p[1], p[2])) }));
                const area = q => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
                const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
                if (emissive) return;
                proj.sort((a, b) => (area(a.q) > 0) - (area(b.q) > 0));
                for (const { pl, q } of proj) {
                    const path = new Path2D(); q.forEach((v, i) => i ? path.lineTo(v[0], v[1]) : path.moveTo(v[0], v[1])); path.closePath();
                    ctx.fillStyle = pl.fill; ctx.fill(path);
                    // Courses: lines from the eave (pts 0–1) up to the top (pts 3–2, or the apex)
                    const p = pl.pts, top0 = p[p.length - 1], top1 = p.length === 4 ? p[2] : p[2], n = pl.kind === 'gable' ? 14 : 9, lines = new Path2D();
                    for (let i = 1; i < n; i++) {
                        const f = i / n, a = lerp3(p[0], top0, f), b = lerp3(p[1], top1, f), pa = this._shP(...a), pb = this._shP(...b);
                        lines.moveTo(pa[0], pa[1]); lines.lineTo(pb[0], pb[1]);
                    }
                    ctx.save(); ctx.clip(path);
                    ctx.strokeStyle = pl.kind === 'gable' ? 'rgba(0,0,0,.2)' : 'rgba(10,10,12,.35)'; ctx.lineWidth = pl.kind === 'gable' ? 0.6 : 1; ctx.stroke(lines);
                    if (pl.kind === 'gable') {                                       // a little attic vent in the gable
                        const c = lerp3(lerp3(p[0], p[1], 0.5), p[2], 0.42), v = this._shP(...c);
                        ctx.fillStyle = S.trim; ctx.beginPath(); ctx.arc(v[0], v[1], 4.5, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#16181b'; ctx.beginPath(); ctx.arc(v[0], v[1], 3.2, 0, Math.PI * 2); ctx.fill();
                    } else {
                        // moss and stains, seeded so they don't crawl
                        const r = seededRandom(this._shSeed()), ctr = this._shP(...lerp3(lerp3(p[0], p[1], 0.5), top0, 0.4));
                        for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '60,70,40' : '20,20,22'},${0.12 + r() * 0.1})`; ctx.beginPath(); ctx.ellipse(ctr[0] + (r() - 0.5) * 120, ctr[1] + (r() - 0.5) * 30, 10 + r() * 22, 5 + r() * 8, 0, 0, Math.PI * 2); ctx.fill(); }
                    }
                    ctx.restore();
                    ctx.strokeStyle = pl.kind === 'gable' ? S.trim : S.ridge; ctx.lineWidth = pl.kind === 'gable' ? 1.4 : 1.6; ctx.stroke(path);
                }
            },
            _shSeed() { return this._sh.seed || 7; },

            /** The chimney: brick, standing out of the gable end on the garage's far side */
            _shDrawChimney(ctx) {
                const P = SUBURB_PLAN, c = P.CHIM, g = this._shRoofs(), atW = !this._sh.west;
                const x0 = atW ? g.hx0 + 28 : g.hx1 - 28 - c.w, x1 = x0 + c.w, y0 = g.ry - c.h / 2, y1 = y0 + c.h;
                const zb = g.zr - 8, zt = g.zr + c.up, cam = game.camera;
                const side = (ax, ay, bx, by, fill) => {
                    const p = [this._shP(ax, ay, zb), this._shP(bx, by, zb), this._shP(bx, by, zt), this._shP(ax, ay, zt)];
                    ctx.beginPath(); p.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
                    ctx.strokeStyle = 'rgba(232,190,140,.12)'; ctx.lineWidth = 0.6; ctx.stroke();
                };
                if (cam.y > y1) side(x0, y1, x1, y1, '#4e2c22'); if (cam.y < y0) side(x0, y0, x1, y0, '#2e1914');
                if (cam.x > x1) side(x1, y0, x1, y1, '#3e2419'); if (cam.x < x0) side(x0, y0, x0, y1, '#3e2419');
                const top = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => this._shP(x, y, zt));
                ctx.beginPath(); top.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
                ctx.fillStyle = '#44271d'; ctx.fill(); ctx.strokeStyle = '#2a1712'; ctx.lineWidth = 1.5; ctx.stroke();
                const m = this._shP((x0 + x1) / 2, (y0 + y1) / 2, zt); ctx.fillStyle = '#120b08'; ctx.beginPath(); ctx.ellipse(m[0], m[1], 5, 6, 0, 0, Math.PI * 2); ctx.fill();
            },

            _shDrawRoofs(ctx, emissive) {
                const g = this._shRoofs();
                this._shDrawRoof(ctx, g.house, emissive);
                if (!emissive) this._shDrawChimney(ctx);
            },

            /** Out front: the lawn gone long, the walk, the drive, the porch floor and steps, a mailbox, dead shrubs */
            _shDrawGround(ctx) {
                const P = SUBURB_PLAN, G = P.GARAGE, W = P.W + G.W, Y = 90;
                const s = LandmarkKit.sprite(this, 'sh_ground', this.x - 20, this.y + P.D - 4, W + 40, Y + 24, 1, c => {
                    const x = this.x, y = this.y + P.D, r = seededRandom(this._shSeed() + 3), du = this.x + this._shDoorU();
                    const gx = this.x + (this._sh.west ? 0 : P.W);
                    // The lawn
                    c.fillStyle = '#26301f'; c.fillRect(x - 16, y, W + 32, Y);
                    for (let i = 0; i < 420; i++) { c.fillStyle = r() < 0.5 ? 'rgba(70,86,48,.5)' : 'rgba(18,22,14,.5)'; const gx2 = x - 16 + r() * (W + 32), gy = y + r() * Y; c.fillRect(gx2, gy, 1, 2 + r() * 4); }
                    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(90,80,50,.25)'; c.beginPath(); c.ellipse(x + r() * W, y + 20 + r() * (Y - 30), 10 + r() * 16, 5 + r() * 6, 0, 0, Math.PI * 2); c.fill(); }   // dead patches
                    // The drive: cracked concrete out to the street
                    c.fillStyle = '#5b5a55'; c.fillRect(gx + 12, y - 4, G.W - 24, Y + 4);
                    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.8; c.beginPath(); for (let yy = y + 26; yy < y + Y; yy += 30) { c.moveTo(gx + 12, yy); c.lineTo(gx + G.W - 12, yy); } c.moveTo(gx + 40, y + 10); c.lineTo(gx + 52, y + 34); c.lineTo(gx + 47, y + 58); c.stroke();
                    c.fillStyle = 'rgba(30,26,20,.35)'; c.beginPath(); c.ellipse(gx + G.W / 2, y + 40, 18, 9, 0, 0, Math.PI * 2); c.fill();   // an old oil stain
                    // The porch floor and its steps, then the walk
                    c.fillStyle = '#6b6258'; c.fillRect(this.x + this._sh.ox + P.PORCH.X, y, P.PORCH.W, P.PORCH.D);
                    c.strokeStyle = 'rgba(0,0,0,.25)'; c.beginPath(); for (let xx = this.x + this._sh.ox + P.PORCH.X + 6; xx < this.x + this._sh.ox + P.PORCH.X + P.PORCH.W; xx += 6) { c.moveTo(xx, y); c.lineTo(xx, y + P.PORCH.D); } c.stroke();
                    c.fillStyle = '#7d766c'; for (let i = 0; i < 2; i++) c.fillRect(du - 16, y + P.PORCH.D + i * 4, 32, 4);
                    c.fillStyle = '#6f6c66'; c.fillRect(du - 9, y + P.PORCH.D + 8, 18, Y - P.PORCH.D - 8);
                    c.strokeStyle = 'rgba(0,0,0,.3)'; c.beginPath(); for (let yy = y + P.PORCH.D + 20; yy < y + Y; yy += 12) { c.moveTo(du - 9, yy); c.lineTo(du + 9, yy); } c.stroke();
                    // Dead shrubs along the front
                    for (const sx of [this.x + this._sh.ox + 14, this.x + this._sh.ox + P.PORCH.X - 14, this.x + this._sh.ox + P.PORCH.X + P.PORCH.W + 14, this.x + this._sh.ox + P.W - 16]) {
                        c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx + 3, y + 10, 12, 7, 0, 0, Math.PI * 2); c.fill();
                        c.strokeStyle = '#4a3a28'; c.lineWidth = 1; c.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; c.moveTo(sx, y + 8); c.lineTo(sx + Math.cos(a) * (6 + r() * 6), y + 8 + Math.sin(a) * (4 + r() * 4)); } c.stroke();
                        c.fillStyle = 'rgba(70,60,36,.6)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(sx + (r() - 0.5) * 12, y + 8 + (r() - 0.5) * 8, 1.6, 0, Math.PI * 2); c.fill(); }
                    }
                    // The mailbox at the curb, its flag down
                    const mx = du + 34, my = y + Y - 8;
                    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(mx + 2, my + 2, 12, 7);
                    c.fillStyle = '#2b2d30'; c.beginPath(); c.roundRect(mx, my, 12, 7, [3, 3, 1, 1]); c.fill();
                    c.fillStyle = '#7a1e1e'; c.fillRect(mx + 11, my + 3, 3, 1.2);
                });
                ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
            }
        });
