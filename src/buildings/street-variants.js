        /* =====================================================================
           STREET VARIANTS — the city's own shops and apartments, in the style
           of the landmarks (Enni Cole, the Cozy Cafe, Moon City)
           ---------------------------------------------------------------------
           Every generic shop and apartment picks a variant from where it stands
           (the same seed as its palette), so a street reads as a run of
           different houses:

             shops       bakery (brick, striped awnings, wooden signboard, hip
                         roof), florist (green timber, flower buckets, roof
                         garden), boutique (rose stone, gold-framed windows,
                         black canopy, glass lantern), lounge (lacquer, neon
                         fins, velvet canopy, red carpet, moon dome)
             apartments  brownstone (brick, quoins, lintels, cornice), deco
                         (pilasters, gilt bands), terrace (verandas on the
                         front), loft (steel spandrels and mullions)

           Cheap on a phone: what doesn't move is painted once and SHARED by
           every building of that variant and size (StreetArt: a shop roof,
           an apartment's roof trim, the pavement dressing; N and S fronts share
           a bake, E and W another, stamped turned). Walls, awnings, canopies and
           signboards are a few batched, projected fills a frame, on the landmark
           kit. Nothing here touches sections, doors, lights or accent colours:
           collision, navigation, the street rows and every block's lamp colour
           are exactly what they were. A config `variant: 'plain'` keeps the old
           look; `variant: '<id>'` asks for one.
           ===================================================================== */
        const STREET_SHOPS = [
            { id: 'arcade', weight: 18, floors: [7, 8, 9], wall: '#ddd2b8', roof: '#3b4450', material: 'limestone',
              trim: '#f6efdc', frame: '#28241f', mull: '#17181c', glass: '#28241f', ink: '#e9cf8e', glow: 'rgba(255,214,150,.95)',
              awnings: [['#16171b', '#2c2d33'], ['#1d3a2c', '#2e5641'], ['#4a1a1f', '#6c2c32'], ['#1b2236', '#2e3854'], ['#3a2619', '#57402c']],
              neons: ['#ffb45a'],
              names: ['Maison Clair', 'Galerie Ondine', 'Mercer & Vane', 'Le Comptoir', 'Bellamy', 'Atelier Rose', 'Vauclair', 'Chandelle', 'Hartwell', 'Rue Dorée', 'The Gilded Hour', 'Ambre'] },
            { id: 'bakery', weight: 3, floors: [2, 3], wall: '#5a2b22', roof: '#4a2a20', material: 'brick',
              trim: '#efdcb6', frame: '#efdcb6', mull: '#3a2116', glass: '#2a1b14', board: ['#4a2a1a', '#2a160d'], edge: '#c99a52', ink: '#ffbf4d', glow: 'rgba(255,196,96,.95)',
              awnings: [['#e2902c', '#f1e0bd'], ['#b8433a', '#f1e0bd'], ['#3f7f7a', '#efe6cf'], ['#8a5a9e', '#efe2f2']],
              names: ['Crumb & Co', 'Little Oven', 'Butter Moon', 'Sugar Row', 'Daily Loaf', 'Honey Bun', 'Rye & Rose'] },
            { id: 'florist', weight: 2, floors: [2], wall: '#2c3a31', roof: '#4a4c40', material: 'timber',
              trim: '#e8e2cc', frame: '#e8e2cc', mull: '#1f2a22', glass: '#1b2620', board: ['#2f4a37', '#1c2e22'], edge: '#d9cfa8', ink: '#f4ecd2', glow: 'rgba(214,255,200,.85)',
              awnings: [['#3f7a4a', '#ecebd8'], ['#5a8a3c', '#f2efd8'], ['#c46a8a', '#f4ece4']],
              names: ['Petal House', 'Wild Iris', 'Fern & Bloom', 'Moss & Mint', 'Dahlia', 'Green Hour'] },
            { id: 'boutique', weight: 2, floors: [2, 3], wall: '#5e2f42', roof: '#2d242c', material: 'stone',
              trim: '#d0ac72', frame: '#d0ac72', mull: '#1c2028', glass: '#352d30', stone: '#71354d', stoneLo: '#422031', steel: '#1c2028', gold: '#d0ac72', goldHi: '#f3ddb0', ink: '#f3ddb0', glow: 'rgba(255,226,170,.95)',
              names: ['Maison Vel', 'Atelier Noor', 'Opaline', 'Silk Row', 'Lumière', 'Velour'] },
            { id: 'lounge', weight: 2, floors: [2, 3], wall: '#1d1424', roof: '#18121f', material: 'lacquer',
              trim: '#d9b26a', frame: '#d9b26a', mull: '#120c19', glass: '#2a1f3a', gold: '#d9b26a', velvet: '#8e2148', velvetLo: '#5a1530', ink: '#ffd9ec', glow: 'rgba(255,120,190,.95)',
              neons: ['#b48cff', '#ff5fa2', '#7fd8ff'],
              names: ['The Velvet', 'Lune', 'Halo Bar', 'Noir Nine', 'Starling', 'Afterglow'] }
        ];
        const STREET_APTS = [
            { id: 'brownstone', weight: 3, sills: { lip: 'rgba(239,220,182,0.8)', shade: 'rgba(16,8,6,0.5)' } },
            { id: 'deco', weight: 2, sills: { lip: 'rgba(226,198,146,0.8)', shade: 'rgba(10,8,16,0.5)' }, noBalconies: true },
            { id: 'terrace', weight: 2, sills: { lip: 'rgba(240,236,228,0.7)', shade: 'rgba(10,8,16,0.45)' }, noBalconies: true },
            { id: 'loft', weight: 2, sills: null, noBalconies: true }
        ];
        const STREET_GOLD = '#d8b77a';
        const _vArcMask = () => true;

        /** Shared paint for every building of a variant: sprites and paths in the variant's own frame. */
        const StreetArt = {
            sprites: new Map(), paths: new Map(), stats: { baked: 0, bytes: 0 },

            /** Its front's frame: x along the front (left to right, seen from the street), y in from the back,
                the front at y = fd. m maps it onto the footprint (W × D, the building's corner at 0, 0). */
            frame(facing, W, D) {
                switch (facing) {
                    case 'N': return { fw: W, fd: D, m: [-1, 0, 0, -1, W, D] };
                    case 'E': return { fw: D, fd: W, m: [0, -1, 1, 0, 0, D] };
                    case 'W': return { fw: D, fd: W, m: [0, 1, -1, 0, W, 0] };
                    default:  return { fw: W, fd: D, m: [1, 0, 0, 1, 0, 0] };
                }
            },

            /** A layer painted once in the frame (x0, y0, w, h, res px per world px), kept under key. */
            sprite(key, x0, y0, w, h, res, paint) {
                let s = this.sprites.get(key);
                if (s) return s;
                const cv = document.createElement('canvas');
                cv.width = Math.max(1, Math.ceil(w * res)); cv.height = Math.max(1, Math.ceil(h * res));
                const c = cv.getContext('2d');
                c.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
                paint(c);
                this.stats.baked++; this.stats.bytes += cv.width * cv.height * 4;
                this.sprites.set(key, s = { cv, x: x0, y: y0, w, h });
                return s;
            },

            /** A Path2D in the frame, made once under key. */
            path(key, make) {
                let p = this.paths.get(key);
                if (!p) this.paths.set(key, p = make(new Path2D()));
                return p;
            },

            clear() { this.sprites.clear(); this.paths.clear(); this.stats.bytes = 0; }
        };

        const _stPick = (list, u) => {
            let total = 0; for (const v of list) total += v.weight;
            let t = u * total;
            for (const v of list) { if ((t -= v.weight) < 0) return v; }
            return list[list.length - 1];
        };

        Object.assign(BuildingV2.prototype, {
            /** Which variant it is, from where it stands (constructor, after its style and facing). */
            _pickVariant(config) {
                this.variant = null;
                if (config.variant === 'plain') return;
                const shop = this.id === 'shop_small', apt = this.id === 'apartment_small' && this.style === 'apartment';
                if (!shop && !apt) return;
                const seed = this._seed != null ? this._seed : Math.round(this.x * 0.37 + this.y * 1.13);
                const r = (i) => _bldHash(seed, 300 + i), list = shop ? STREET_SHOPS : STREET_APTS;
                const spec = (config.variant && list.find(v => v.id === config.variant)) || _stPick(list, r(1));
                const v = this.variant = { kind: shop ? 'shop' : 'apt', id: spec.id, spec, seed };
                if (shop) {
                    this.floors = spec.floors[Math.floor(r(2) * spec.floors.length)];
                    this.colors.wall = spec.wall; this.colors.roof = spec.roof;
                    this.sills = { lip: hexToRgba(spec.trim, 0.75), shade: 'rgba(10,6,4,0.5)' };
                    v.name = spec.names[Math.floor(r(3) * spec.names.length)];
                    if (spec.awnings) v.awning = spec.awnings[Math.floor(r(4) * spec.awnings.length)];
                    if (spec.neons) v.neon = spec.neons[Math.floor(r(5) * spec.neons.length)];
                    if (spec.id === 'arcade') this._vArcInit(v, r);                     // its stone (buildings/street-arcade.js)
                } else {
                    this.sills = spec.sills;
                    if (spec.id === 'brownstone') this._vBrInit(v, r);                 // its brick, the arcades' lean (buildings/street-brownstone.js)
                    if (spec.noBalconies && this.facadeFeature === 'balconies') this.facadeFeature = null;
                }
            },

            _vOn() { return !!(this.variant && CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera); },
            _vH() { return Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT; },
            /** A world point at height z, leaned (the landmarks' projection) */
            _vP(x, y, z) { const k = LandmarkKit.k(z), c = game.camera; return [c.x + (x - c.x) * k, c.y + (y - c.y) * k]; },
            /** The frame for its main section, and the door's place along the front (frame x) */
            _vFrame() {
                const s = this.sections[0];
                if (this._vFr && this._vFr.facing === this.facing && this._vFr.x === this.x && this._vFr.y === this.y) return this._vFr;
                const F = StreetArt.frame(this.facing, s.w, s.h), g = this._frontGeo(), E = this._entrance() || g;
                const along = (E.cx - g.cx) * g.ux + (E.cy - g.cy) * g.uy;
                return (this._vFr = { ...F, facing: this.facing, x: this.x, y: this.y, ox: this.x + s.x, oy: this.y + s.y, door: F.fw / 2 + (this.facing === 'N' || this.facing === 'E' ? -along : along) });
            },
            /** Draw fn(ctx) in the frame (ctx already in the plane it belongs to) */
            _vInFrame(ctx, fn) {
                const F = this._vFrame(), m = F.m;
                ctx.save(); ctx.translate(F.ox, F.oy); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); fn(ctx, F); ctx.restore();
            },
            /** The window mask: a shop's ground floor front is its shopfront (_drawFaceWindows) */
            _vWindowMask(f) {
                if (this.variant && (this.variant.id === 'arcade' || this.variant.id === 'brownstone')) return _vArcMask;   // its own windows on every face
                if (!this.variant || this.variant.kind !== 'shop' || f.side !== this.facing) return null;
                return this._vMaskFn || (this._vMaskFn = (fl) => fl === 0);
            },

            /** A face's (u along it, v up it) → screen, as the walls and windows lerp from footprint to roof */
            _vFaceAt(f, P) {
                const [rx1, ry1] = P(f.x1, f.y1), [rx2, ry2] = P(f.x2, f.y2), ax = f.x1, ay = f.y1, ex = f.x2 - f.x1, ey = f.y2 - f.y1, tx = rx2 - rx1, ty = ry2 - ry1, ux = rx1 - ax, uy = ry1 - ay;
                const at = (u, v) => [ax + ex * u + (ux + tx * u - ex * u) * v, ay + ey * u + (uy + ty * u - ey * u) * v];
                const quad = (path, u0, u1, v0, v1) => {
                    let p = at(u0, v0); path.moveTo(p[0], p[1]); p = at(u1, v0); path.lineTo(p[0], p[1]);
                    p = at(u1, v1); path.lineTo(p[0], p[1]); p = at(u0, v1); path.lineTo(p[0], p[1]); path.closePath();
                    return path;
                };
                const line = (path, u0, v0, u1, v1) => { let p = at(u0, v0); path.moveTo(p[0], p[1]); p = at(u1, v1); path.lineTo(p[0], p[1]); return path; };
                return { at, quad, line, L: Math.hypot(ex, ey), depth: Math.hypot(ux, uy) };
            },

            /** The door's u on a front face (or -1) */
            _vDoorU(f) {
                if (f.side !== this.facing) return -1;
                const E = this._entrance(); if (!E) return -1;
                const u = f.y1 === f.y2 ? (E.cx - f.x1) / (f.x2 - f.x1) : (E.cy - f.y1) / (f.y2 - f.y1);
                return u > 0.05 && u < 0.95 ? u : -1;
            },

            /* ---------------- walls ---------------- */

            /** Under the windows: the face's material (brick courses, stone and steel, timber, lacquer), quoins */
            _vFaceUnder(ctx, f, P) {
                const v = this.variant, S = v.spec, H = this._vH(), G = this._vFaceAt(f, P);
                if (G.depth < 3 || f.side === 'C') return;
                const FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, fine = _zoomLOD < 2 && G.depth > 8, front = f.side === this.facing;
                if (v.id === 'brownstone') { this._vBrUnder(ctx, f, G, H); return; }
                const mat = v.kind === 'shop' ? S.material : null;
                if (mat === 'limestone') { this._vArcUnder(ctx, f, G, H); return; }
                if (mat === 'stone') {                                             // rose stone to the belt, dark steel over it (Enni Cole)
                    const hi = Math.min(1, FH * 1.15 / H);
                    ctx.fillStyle = S.stoneLo; ctx.fill(G.quad(new Path2D(), 0, 1, 0, hi * 0.5));
                    ctx.fillStyle = S.stone; ctx.fill(G.quad(new Path2D(), 0, 1, hi * 0.5, hi));
                    if (hi < 1) { ctx.fillStyle = S.steel; ctx.fill(G.quad(new Path2D(), 0, 1, hi, 1)); }
                    if (fine) { const j = new Path2D(); for (let u = 0.08; u < 1; u += 30 / G.L) G.line(j, u, 0, u, hi); ctx.strokeStyle = 'rgba(211,166,112,.22)'; ctx.lineWidth = 0.7; ctx.stroke(j); }
                } else if (mat === 'brick' && fine) {                              // mortar courses, every 2.5 px up the wall
                    const c = new Path2D(); for (let z = 2.5; z < H - 1; z += 2.5) G.line(c, 0, z / H, 1, z / H);
                    ctx.strokeStyle = v.kind === 'shop' ? 'rgba(232,190,140,.16)' : 'rgba(232,200,160,.08)'; ctx.lineWidth = 0.7; ctx.stroke(c);
                } else if (mat === 'timber' && front) {                            // the painted shopfront, its boards
                    ctx.fillStyle = '#25402e'; ctx.fill(G.quad(new Path2D(), 0, 1, 0, Math.min(1, FH * 1.05 / H)));
                    if (fine) { const b = new Path2D(); for (let u = 0; u < 1; u += 7 / G.L) G.line(b, u, 0, u, Math.min(1, FH * 1.05 / H)); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.6; ctx.stroke(b); }
                } else if (mat === 'lacquer' && fine) {                            // a sheen band and a chevron frieze under the cornice
                    const zf = Math.max(0.6, 1 - 3.2 / H), ch = new Path2D(), n = Math.max(4, Math.round(G.L / 9));
                    for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 0.5) / n, u2 = (i + 1) / n; G.line(ch, u0, zf, u1, zf + 1.8 / H); G.line(ch, u1, zf + 1.8 / H, u2, zf); }
                    ctx.strokeStyle = S.gold; ctx.globalAlpha *= 0.75; ctx.lineWidth = 0.8; ctx.stroke(ch); ctx.globalAlpha /= 0.75;
                }
                if ((mat === 'brick' || (v.kind === 'apt' && v.id === 'deco')) && fine) {   // quoins: stone blocks up both ends, long and short by turns
                    const q = new Path2D(), floors = Math.round(H / FH);
                    for (let i = 0; i < floors * 2; i++) {
                        const z0 = i * FH / 2 + 0.4, z1 = (i + 1) * FH / 2 - 0.4, w = (i % 2 ? 5 : 8) / G.L;
                        G.quad(q, 0, w, z0 / H, z1 / H); G.quad(q, 1 - w, 1, z0 / H, z1 / H);
                    }
                    ctx.fillStyle = v.kind === 'shop' ? S.trim : lightenHex(this.colors.wall, 30); ctx.fill(q);
                }
            },

            /** Over the windows, on every face: the shopfront, lintels, spandrels, then (once for all faces) ledges and fins */
            _vFaceOver(ctx, faces, P) {
                if (this.variant.id === 'arcade') { this._vArcOver(ctx, faces, P); return; }
                if (this.variant.id === 'brownstone') { this._vBrOver(ctx, faces, P); this._vBrLanterns(ctx, false); return; }
                const v = this.variant, S = v.spec, H = this._vH(), FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, K = LandmarkKit;
                const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS), fine = _zoomLOD < 2;
                const edges = [], fins = [];
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P);
                    const out = (a, b) => ({ a: [f.x1 - (f.x2 - f.x1) / G.L * a, f.y1 - (f.y2 - f.y1) / G.L * a], b: [f.x2 + (f.x2 - f.x1) / G.L * b, f.y2 + (f.y2 - f.y1) / G.L * b], nx: f.nx, ny: f.ny });
                    edges.push(out(2, 2));
                    if (G.depth < 3) continue;
                    const cols = Math.max(1, Math.floor(G.L / 26));
                    if (v.kind === 'shop' && f.side === this.facing) this._vShopfront(ctx, f, G, H, false);
                    if (v.kind === 'apt' && fine && G.depth > floors * 2.4) {
                        if (v.id === 'brownstone') {                               // lintels over every window
                            const l = new Path2D();
                            for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) G.line(l, (c + 0.2) / cols, (fl + 0.84) / floors, (c + 0.8) / cols, (fl + 0.84) / floors);
                            ctx.strokeStyle = 'rgba(232,214,180,0.55)'; ctx.lineWidth = 1.1; ctx.stroke(l);
                        } else if (v.id === 'loft') {                              // steel spandrels between the floors and mullions between the bays
                            const sp = new Path2D(), mu = new Path2D();
                            for (let fl = 1; fl <= floors; fl++) G.quad(sp, 0, 1, (fl - 0.16) / floors, Math.min(1, (fl + 0.06) / floors));
                            for (let c = 0; c <= cols; c++) G.quad(mu, Math.max(0, c / cols - 0.9 / G.L), Math.min(1, c / cols + 0.9 / G.L), 0, 1);
                            ctx.fillStyle = 'rgba(18,20,26,0.82)'; ctx.fill(sp); ctx.fill(mu);
                            ctx.strokeStyle = 'rgba(214,190,150,0.22)'; ctx.lineWidth = 0.6; ctx.stroke(sp);
                            ctx.fillStyle = lightenHex(this.colors.wall, 26); ctx.fill(G.quad(new Path2D(), 0, 1, 0, 0.3 / floors));   // stone plinth
                        }
                    }
                    if ((v.kind === 'shop' && v.id === 'lounge') || (v.kind === 'apt' && v.id === 'deco')) {
                        for (let c = 0; c <= cols; c++) {                          // a pilaster at every bay
                            const u = c / cols, x = f.x1 + (f.x2 - f.x1) * u, y = f.y1 + (f.y2 - f.y1) * u;
                            fins.push({ x, y, nx: f.nx, ny: f.ny });
                        }
                    }
                }
                // The depth vocabulary, one fill a kind for all the faces (buildings/landmark-kit.js)
                if (v.kind === 'shop') {
                    if (fins.length) K.fins(ctx, fins, 0, H - 2, 3, 2, '#2a1e33', hexToRgba(v.neon, 0.55));
                    const lipC = S.id === 'bakery' ? S.trim : S.id === 'florist' ? '#e8e2cc' : S.gold;
                    if (S.id !== 'florist') K.ledge(ctx, edges, FH * 1.02, 1.6, 1.2, darkenHex(S.wall, -18), darkenHex(S.wall, 10), hexToRgba(lipC, 0.6));
                    K.ledge(ctx, edges, H, 2.6, 2.2, S.id === 'bakery' ? S.trim : S.id === 'florist' ? '#d9d2b8' : S.id === 'boutique' ? '#5d303e' : '#2a2030',
                            S.id === 'bakery' ? '#3a2116' : S.id === 'florist' ? '#1f2a22' : '#24161e', hexToRgba(lipC, 0.85));
                } else {
                    const wall = this.colors.wall, top = lightenHex(wall, 24), band = darkenHex(wall, 4);
                    if (v.id === 'deco' && fins.length) {
                        K.fins(ctx, fins, 0, H, 3.5, 2.2, lightenHex(wall, 14), 'rgba(226,198,146,0.55)');
                        for (let fl = 3; fl < floors; fl += 3) K.ledge(ctx, edges, fl * FH, 2.2, 1.4, 'rgba(216,183,122,0.85)', darkenHex(wall, 2), 'rgba(243,221,176,0.6)');
                        K.ledge(ctx, edges, H, 3.4, 3, top, band, 'rgba(243,221,176,0.75)');
                    } else if (v.id === 'brownstone') {
                        K.ledge(ctx, edges, FH, 1.8, 1.4, top, band, 'rgba(239,220,182,0.5)');
                        K.ledge(ctx, edges, H, 4, 3.2, lightenHex(wall, 30), darkenHex(wall, 6), 'rgba(239,220,182,0.75)');
                    } else if (v.id === 'terrace') {
                        K.ledge(ctx, edges, FH * 0.35, 1.6, FH * 0.35, top, lightenHex(wall, 10), null);   // plinth
                        const fr = faces.filter(f => f.side === this.facing);
                        const ve = fr.map(f => { const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
                            return { a: [f.x1 + ux * 10, f.y1 + uy * 10], b: [f.x2 - ux * 10, f.y2 - uy * 10], nx: f.nx, ny: f.ny }; });
                        if (ve.length && fine) for (let fl = 1; fl < floors; fl += 2)
                            K.veranda(ctx, ve, fl * FH + 0.6, 6, 6, 3.4, lightenHex(wall, 34), darkenHex(wall, 2), 'rgba(236,230,244,0.75)');
                        K.ledge(ctx, edges, H, 3, 2.4, top, band, 'rgba(240,236,228,0.6)');
                    } else {
                        K.ledge(ctx, edges, H, 2.4, 2, '#2a2e36', '#14171d', 'rgba(214,190,150,0.55)');
                    }
                }
            },

            /** A shop's ground floor along its front: display windows either side of the door, the door */
            _vShopfront(ctx, f, G, H, emissive) {
                const S = this.variant.spec, FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, du = this._vDoorU(f), dw = 15 / G.L;
                const z0 = 1 / H, z1 = Math.min(0.96, FH * 0.86 / H), zt = Math.min(0.98, FH * 0.94 / H);
                const spans = du > 0 ? [[0.05, du - dw - 0.03], [du + dw + 0.03, 0.95]] : [[0.05, 0.95]];
                const glass = new Path2D(), frames = new Path2D(), bars = new Path2D();
                for (const [a, b] of spans) {
                    if (b - a < 0.04) continue;
                    G.quad(frames, a, b, z0 * 0.4, zt); G.quad(glass, a + 1.6 / G.L, b - 1.6 / G.L, z0, z1);
                    const n = Math.max(1, Math.round((b - a) * G.L / (S.id === 'boutique' ? 30 : 20)));
                    for (let i = 1; i < n; i++) { const u = a + (b - a) * i / n; G.quad(bars, u - 0.6 / G.L, u + 0.6 / G.L, z0, z1); }
                    if (S.id !== 'lounge') G.quad(bars, a + 1.6 / G.L, b - 1.6 / G.L, z1 - 1.6 / H, z1 - 1 / H);   // the transom
                }
                if (emissive) {
                    if (du > 0) G.quad(glass, du - dw + 4 / G.L, du + dw - 4 / G.L, z1 * 0.3, z1 * 0.95);
                    ctx.fillStyle = S.id === 'lounge' ? hexToRgba(this.variant.neon, 0.45) : S.id === 'florist' ? 'rgba(255,236,190,.5)' : 'rgba(255,190,110,.55)';
                    ctx.fill(glass); return;
                }
                ctx.fillStyle = S.frame; ctx.fill(frames);
                ctx.fillStyle = S.glass; ctx.fill(glass);
                ctx.fillStyle = S.id === 'lounge' ? 'rgba(180,140,255,.14)' : 'rgba(255,200,120,.14)'; ctx.fill(glass);   // a lit room behind, even by day
                ctx.fillStyle = S.mull; ctx.fill(bars);
                if (du > 0) {
                    const d = new Path2D(); G.quad(d, du - dw, du + dw, 0, zt);
                    ctx.fillStyle = S.frame; ctx.fill(d);
                    ctx.fillStyle = S.id === 'lounge' ? S.velvetLo : S.mull; ctx.fill(G.quad(new Path2D(), du - dw + 2 / G.L, du + dw - 2 / G.L, 0, z1));
                    ctx.fillStyle = 'rgba(255,200,120,.3)'; ctx.fill(G.quad(new Path2D(), du - dw + 4 / G.L, du + dw - 4 / G.L, z1 * 0.3, z1 * 0.95));
                }
            },

            /* ---------------- the street front: awnings, canopies, signboards ---------------- */

            /** A point on the front: s along it from its middle, o out from it, at height z (leaned) */
            _vFrontPt(s, o, z) {
                const g = this._frontGeo();
                return this._vP(g.cx + g.ux * s + g.nx * o, g.cy + g.uy * s + g.ny * o, z);
            },

            /** Draw fn(c, os) flat at height z, o out from the wall at the door, x along the front (os: +1 when
                its local y points out from the wall, -1 when in), so boards and canopy tops stay readable */
            _vBoard(ctx, z, o, fn) {
                const E = this._entrance() || this._frontGeo();
                LandmarkKit.flat(ctx, LandmarkKit.k(z), c => {
                    c.translate(E.cx + E.nx * o, E.cy + E.ny * o);
                    if (E.nx) c.rotate(E.nx * Math.PI / 2);
                    fn(c, E.ny > 0 ? 1 : -1);
                });
            },

            /** Its name's width in the board's font (measured once) */
            _vTextW(ctx, font) {
                if (this._vTW && this._vTW.font === font) return this._vTW.w;
                ctx.save(); ctx.font = font; const w = ctx.measureText(this.variant.name).width; ctx.restore();
                return (this._vTW = { font, w }).w;
            },

            _vFront(ctx, emissive) {
                if (this.variant.id === 'arcade') { this._vArcFront(ctx, emissive); return; }
                const v = this.variant, S = v.spec, FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, g = this._frontGeo(), K = LandmarkKit;
                const F = this._vFrame(), half = F.fw / 2, door = F.door - half, side = this.facing === 'N' || this.facing === 'E' ? -1 : 1;
                const font = `${S.id === 'bakery' || S.id === 'florist' ? 15 : 17}px "Great Vibes", "URW Chancery L", "Z003", cursive`;
                const tw = Math.min(F.fw - 40, this._vTextW(ctx, font) + 26);
                if (S.id === 'bakery' || S.id === 'florist') {
                    // Striped awnings either side of the door, a scalloped valance at their front edge
                    const zt = FH * 0.98, zf = FH * 0.56, out = 13, [ca, cb] = v.awning;
                    if (!emissive) {
                        const A = new Path2D(), B = new Path2D(), sa = [];
                        for (const [s0, s1] of [[-half + 8, door * side - tw / 2 - 2], [door * side + tw / 2 + 2, half - 8]]) {
                            if (s1 - s0 < 16) continue;
                            const n = Math.max(2, Math.round((s1 - s0) / 11)), w = (s1 - s0) / n;
                            for (let i = 0; i < n; i++) {
                                const a = s0 + i * w, b = a + w, p = i % 2 ? B : A;
                                const q0 = this._vFrontPt(a, 0, zt), q1 = this._vFrontPt(b, 0, zt), q2 = this._vFrontPt(b, out, zf), q3 = this._vFrontPt(a, out, zf);
                                p.moveTo(q0[0], q0[1]); p.lineTo(q1[0], q1[1]); p.lineTo(q2[0], q2[1]); p.lineTo(q3[0], q3[1]); p.closePath();
                            }
                            sa.push([s0, s1, n, w]);
                        }
                        ctx.fillStyle = ca; ctx.fill(A); ctx.fillStyle = cb; ctx.fill(B);
                        if (_zoomLOD < 2 && sa.length) K.flat(ctx, K.k(zf), c => {   // the valance: half-discs along the front edge
                            const pa = new Path2D(), pb = new Path2D();
                            for (const [s0, , n, w] of sa) for (let i = 0; i < n; i++) {
                                const m = s0 + (i + 0.5) * w, x = g.cx + g.ux * m + g.nx * out, y = g.cy + g.uy * m + g.ny * out, a0 = Math.atan2(g.ny, g.nx) - Math.PI / 2;
                                (i % 2 ? pb : pa).moveTo(x + Math.cos(a0) * w / 2, y + Math.sin(a0) * w / 2); (i % 2 ? pb : pa).arc(x, y, w / 2, a0, a0 + Math.PI);
                            }
                            c.fillStyle = darkenHex(ca, 22); c.fill(pa); c.fillStyle = darkenHex(cb, 26); c.fill(pb);
                        });
                    }
                    // The signboard over the door
                    this._vBoard(ctx, FH * 1.12, 1, (c, os) => {
                        const bh = 17, y0 = os > 0 ? 0 : -bh;
                        c.beginPath(); c.roundRect(-tw / 2, y0, tw, bh, os > 0 ? [2, 2, 7, 7] : [7, 7, 2, 2]);
                        if (!emissive) {
                            c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(-tw / 2 + 3, y0 + (os > 0 ? bh : -3), tw - 6, 3);
                            c.fillStyle = S.board[0]; c.fill(); c.strokeStyle = S.edge; c.lineWidth = 1.2; c.stroke();
                        } else { c.strokeStyle = 'rgba(255,200,120,.4)'; c.lineWidth = 1; c.stroke(); }
                        c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
                        c.fillStyle = emissive ? S.glow : S.ink; c.fillText(v.name, 0, y0 + bh / 2 + 1);
                    });
                } else {
                    // A canopy over the door: black and gold (boutique) or rose velvet with marquee bulbs (lounge)
                    const z = FH * 1.04, out = S.id === 'lounge' ? 20 : 17, cw = Math.max(64, tw + 6), s = door * side;
                    const a = this._frontPt0(s - cw / 2), b = this._frontPt0(s + cw / 2);
                    if (!emissive) K.ledge(ctx, [{ a, b, nx: g.nx, ny: g.ny }], z, out, 2.6,
                        S.id === 'lounge' ? S.velvet : '#171a21', S.id === 'lounge' ? S.velvetLo : '#0e1116', S.gold);
                    if (emissive) {
                        const kz = K.k(z), q = [0, 0, 0, 0], p = new Path2D(), n = Math.round(cw / 7);
                        if (S.id === 'lounge') {                                   // marquee bulbs along the front edge
                            for (let i = 0; i <= n; i++) {
                                const ss = s - cw / 2 + cw * i / n; K._p(q, 0, g.cx + g.ux * ss + g.nx * out, g.cy + g.uy * ss + g.ny * out, kz);
                                p.moveTo(q[0] + 1.2, q[1]); p.arc(q[0], q[1], 1.2, 0, Math.PI * 2);
                            }
                            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,226,170,.95)'; ctx.fill(p); ctx.restore();
                        }
                    }
                    this._vBoard(ctx, z, 0, (c, os) => {
                        c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
                        c.fillStyle = emissive ? S.glow : S.ink; c.fillText(v.name, 0, os * out / 2 + 1);
                    });
                }
            },
            /** A point on the front wall's footprint, s along it from the middle */
            _frontPt0(s) { const g = this._frontGeo(); return [g.cx + g.ux * s, g.cy + g.uy * s]; },

            /* ---------------- roofs ---------------- */

            /** A shop's roof: its variant's roof, painted once for every shop of that variant and frame */
            _vShopRoof(ctx) {
                const v = this.variant, F = this._vFrame(), key = `shop|${this._vId()}|${F.fw}x${F.fd}`;
                const spr = StreetArt.sprite(key, 0, 0, F.fw, F.fd, 1, c => this._vPaintShopRoof(c, v.spec, F.fw, F.fd));
                this._vInFrame(ctx, c => c.drawImage(spr.cv, 0, 0, F.fw, F.fd));
            },

            /** An apartment's roof trim (coping, chimneys, planters, skylights): painted once a variant and frame,
                over its own roof colour and under its rooftop features */
            _vAptRoof(ctx) {
                const v = this.variant, F = this._vFrame(), key = `apt|${v.id}|${F.fw}x${F.fd}`;
                const spr = StreetArt.sprite(key, 0, 0, F.fw, F.fd, 1, c => this._vPaintAptRoof(c, v.spec, F.fw, F.fd));
                this._vInFrame(ctx, c => c.drawImage(spr.cv, 0, 0, F.fw, F.fd));
            },

            /** The roof's night lights (skylights, lanterns, the dome, string lights): a shared path, one or two fills */
            _vRoofGlow(ctx) {
                const v = this.variant, F = this._vFrame(), key = `${v.kind}|${this._vId()}|${F.fw}x${F.fd}`;
                const p = StreetArt.path(key + '|glow', path => { this._vGlowPath(path, v, F.fw, F.fd); return path; });
                const bulbs = StreetArt.path(key + '|bulbs', path => { this._vBulbPath(path, v, F.fw, F.fd); return path; });
                this._vInFrame(ctx, c => {
                    const col = v.kind === 'apt' || v.id === 'arcade' ? 'rgba(255,214,150,.75)' : v.id === 'lounge' ? hexToRgba(v.neon, 0.55) : v.id === 'florist' ? 'rgba(220,255,210,.4)' : 'rgba(255,196,110,.55)';
                    c.fillStyle = col; c.fill(p);
                    c.fillStyle = v.id === 'lounge' ? 'rgba(255,226,170,.95)' : 'rgba(255,224,160,.95)'; c.fill(bulbs);
                });
            },

            /* ---------------- the pavement in front ---------------- */

            _vBase(ctx) {
                const v = this.variant, F = this._vFrame(), key = `base|${v.kind}|${this._vId()}|${F.fw}`, door = Math.round(F.door);
                const spr = StreetArt.sprite(key + '|' + door, -6, F.fd - 3, F.fw + 12, 52, 1, c => this._vPaintBase(c, v, F.fw, F.fd, door));
                this._vInFrame(ctx, c => c.drawImage(spr.cv, spr.x, spr.y, spr.w, spr.h));
            },

            /** What its shared bakes are kept under: the variant (an arcade's also by its stone and door place) */
            _vId() { return this.variant.id === 'arcade' ? 'arcade|' + this._vArcKey() : this.variant.id; },

            /* ---------------- painters (run once a variant, in its frame) ---------------- */

            _vPaintShopRoof(c, S, fw, fd) {
                const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
                if (S.id === 'arcade') { this._vArcPaintRoof(c, this.variant, fw, fd); return; }
                if (S.id === 'bakery') {
                    // A shingled hip roof: four planes, courses parallel to each eave, hips and ridge, a chimney and two skylights
                    const long = fw >= fd, half = Math.min(fw, fd) / 2, A = [0, 0], B = [fw, 0], C = [fw, fd], D = [0, fd];
                    const R0 = long ? [half, fd / 2] : [fw / 2, half], R1 = long ? [fw - half, fd / 2] : [fw / 2, fd - half];
                    const planes = long ? [[[A, B, R1, R0], '#3f251c', [0, 1]], [[D, A, R0], '#4e2c1f', [1, 0]], [[B, C, R1], '#5c3424', [-1, 0]], [[C, D, R0, R1], '#7a4432', [0, -1]]]
                                        : [[[A, B, R0], '#3f251c', [0, 1]], [[D, A, R0, R1], '#4e2c1f', [1, 0]], [[B, C, R1, R0], '#5c3424', [-1, 0]], [[C, D, R1], '#7a4432', [0, -1]]];
                    for (const [pts, col, n] of planes) {
                        c.save(); c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
                        c.fillStyle = col; c.fill(); c.clip();
                        const e0 = pts[0], e1 = pts[1], ux = (e1[0] - e0[0]) / Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), uy = (e1[1] - e0[1]) / Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
                        c.strokeStyle = 'rgba(20,10,6,.38)'; c.lineWidth = 1; c.beginPath();
                        for (let d = 6; d < half; d += 6) { c.moveTo(e0[0] + n[0] * d - ux * 400, e0[1] + n[1] * d - uy * 400); c.lineTo(e0[0] + n[0] * d + ux * 400, e0[1] + n[1] * d + uy * 400); }
                        c.stroke();
                        c.strokeStyle = 'rgba(20,10,6,.22)'; c.lineWidth = 0.7; c.beginPath();
                        for (let d = 0, r = 0; d < half; d += 6, r++) for (let t = -400 + (r % 2) * 6; t < 400; t += 12) {
                            const x = e0[0] + n[0] * d + ux * t, y = e0[1] + n[1] * d + uy * t; c.moveTo(x, y); c.lineTo(x + n[0] * 6, y + n[1] * 6);
                        }
                        c.stroke();
                        c.strokeStyle = 'rgba(255,214,160,.07)'; c.lineWidth = 0.6; c.beginPath();
                        for (let d = 7, i = 0; d < half; d += 6, i++) { c.moveTo(e0[0] + n[0] * d - ux * 400, e0[1] + n[1] * d - uy * 400); c.lineTo(e0[0] + n[0] * d + ux * 400, e0[1] + n[1] * d + uy * 400); }
                        c.stroke(); c.restore();
                    }
                    c.lineCap = 'round';
                    c.beginPath(); for (const P of [A, B, C, D]) { const R = Math.hypot(P[0] - R0[0], P[1] - R0[1]) < Math.hypot(P[0] - R1[0], P[1] - R1[1]) ? R0 : R1; c.moveTo(P[0], P[1]); c.lineTo(R[0], R[1]); }
                    c.moveTo(R0[0], R0[1]); c.lineTo(R1[0], R1[1]);
                    c.strokeStyle = '#2a1711'; c.lineWidth = 3.2; c.stroke(); c.strokeStyle = 'rgba(214,160,104,.42)'; c.lineWidth = 1; c.stroke();
                    c.lineCap = 'butt'; c.strokeStyle = '#3a2116'; c.lineWidth = 2.4; c.strokeRect(1.2, 1.2, fw - 2.4, fd - 2.4);
                    // The chimney on the back slope, its shadow and pot
                    const cx = fw * 0.24, cy = Math.min(fd * 0.24, half * 0.55);
                    rect(cx + 4, cy + 5, 18, 18, 'rgba(0,0,0,.35)'); rect(cx - 9, cy - 9, 18, 18, '#6a3426');
                    c.strokeStyle = S.trim; c.lineWidth = 1.6; c.strokeRect(cx - 9, cy - 9, 18, 18);
                    c.strokeStyle = 'rgba(232,190,140,.25)'; c.lineWidth = 0.6; c.beginPath(); for (let y = cy - 6; y < cy + 9; y += 3) { c.moveTo(cx - 9, y); c.lineTo(cx + 9, y); } c.stroke();
                    c.fillStyle = '#8a4a32'; c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a0f0b'; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
                    for (const [x, y, w, h] of this._vSkylights(S, fw, fd)) {
                        rect(x + 2, y + 3, w, h, 'rgba(0,0,0,.3)'); rect(x, y, w, h, '#2b2422'); rect(x, y, w, h, 'rgba(160,190,220,.16)');
                        c.strokeStyle = S.trim; c.lineWidth = 1.4; c.strokeRect(x, y, w, h);
                        c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.lineWidth = 0.8; c.stroke();
                    }
                } else if (S.id === 'florist') {
                    // A roof garden: pavers, raised beds round the edge, a glasshouse at the back, a bench
                    rect(0, 0, fw, fd, '#6a4a3c');                                  // terracotta pavers
                    c.fillStyle = 'rgba(255,220,190,.06)';
                    for (let y = 0, r = 0; y < fd; y += 14, r++) for (let x = (r % 2) * 14; x < fw; x += 28) c.fillRect(x, y, 14, 14);
                    c.strokeStyle = 'rgba(30,16,10,.3)'; c.lineWidth = 0.8; c.beginPath();
                    for (let x = 14; x < fw; x += 14) { c.moveTo(x, 0); c.lineTo(x, fd); } for (let y = 14; y < fd; y += 14) { c.moveTo(0, y); c.lineTo(fw, y); } c.stroke();
                    const bed = (x, y, w, h) => {
                        rect(x + 2, y + 3, w, h, 'rgba(0,0,0,.3)'); rect(x, y, w, h, '#4a2e1c'); c.strokeStyle = '#6b4a2e'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
                        const n = Math.round(w * h / 40);
                        for (let i = 0; i < n; i++) { const px = x + 3 + (i * 37 % Math.max(1, w - 6)), py = y + 3 + (i * 17 % Math.max(1, h - 6)); c.fillStyle = ['#3c7d44', '#2f6a3a', '#5c9a4c'][i % 3]; c.beginPath(); c.arc(px, py, 3.2, 0, Math.PI * 2); c.fill(); }
                        for (let i = 0; i < n / 3; i++) { const px = x + 4 + (i * 53 % Math.max(1, w - 8)), py = y + 4 + (i * 23 % Math.max(1, h - 8)); c.fillStyle = ['#f2c14e', '#e86a8c', '#f6ecd8', '#b58cff'][i % 4]; c.beginPath(); c.arc(px, py, 1.5, 0, Math.PI * 2); c.fill(); }
                    };
                    bed(8, 8, fw - 96, 18); bed(8, 30, 18, fd - 70); bed(fw - 26, fd - 92, 18, 60);
                    // the glasshouse
                    const gx = fw - 82, gy = 8, gw = 74, gh = 56;
                    rect(gx + 3, gy + 4, gw, gh, 'rgba(0,0,0,.3)'); rect(gx, gy, gw, gh, 'rgba(176,214,200,.45)');
                    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#3c7d44' : '#5c9a4c'; c.beginPath(); c.arc(gx + 9 + (i * 23 % (gw - 16)), gy + 10 + (i * 13 % (gh - 18)), 4, 0, Math.PI * 2); c.fill(); }
                    c.fillStyle = 'rgba(230,245,240,.18)'; c.fillRect(gx, gy, gw, gh / 2);
                    c.strokeStyle = '#eef0e6'; c.lineWidth = 1.4; c.strokeRect(gx, gy, gw, gh);
                    c.lineWidth = 0.8; c.beginPath(); for (let x = gx + gw / 4; x < gx + gw - 1; x += gw / 4) { c.moveTo(x, gy); c.lineTo(x, gy + gh); } c.moveTo(gx, gy + gh / 2); c.lineTo(gx + gw, gy + gh / 2); c.stroke();
                    // a bench and two pots by the front parapet
                    rect(fw / 2 - 20, fd - 24, 40, 8, '#6b4a2e'); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.8; c.strokeRect(fw / 2 - 20, fd - 24, 40, 8);
                    for (const x of [fw / 2 - 34, fw / 2 + 34]) { c.fillStyle = '#9a5a3a'; c.beginPath(); c.arc(x, fd - 20, 6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#4f8a46'; c.beginPath(); c.arc(x, fd - 21, 4.5, 0, Math.PI * 2); c.fill(); }
                    c.strokeStyle = '#3a4a3c'; c.lineWidth = 5; c.strokeRect(2.5, 2.5, fw - 5, fd - 5);
                    c.strokeStyle = 'rgba(232,226,204,.6)'; c.lineWidth = 1; c.strokeRect(5.5, 5.5, fw - 11, fd - 11);
                } else if (S.id === 'boutique') {
                    // Dark stone with brass coping and a glass lantern over the shop floor, its chandeliers showing
                    const g = c.createLinearGradient(0, 0, fw, fd); g.addColorStop(0, '#382934'); g.addColorStop(0.5, '#2d242c'); g.addColorStop(1, '#201e27');
                    c.fillStyle = g; c.fillRect(0, 0, fw, fd);
                    c.strokeStyle = 'rgba(143,86,107,.22)'; c.lineWidth = 1; c.beginPath(); for (let y = 18; y < fd; y += 30) { c.moveTo(8, y); c.lineTo(fw - 8, y); } c.stroke();
                    const [lx, ly, lw, lh] = this._vLantern(fw, fd);
                    c.save(); c.beginPath(); c.roundRect(lx, ly, lw, lh, 14); c.clip();
                    const lg = c.createLinearGradient(lx, ly, lx + lw, ly + lh); lg.addColorStop(0, '#3b3439'); lg.addColorStop(0.52, '#514034'); lg.addColorStop(1, '#23282d');
                    c.fillStyle = lg; c.fillRect(lx, ly, lw, lh);
                    c.fillStyle = 'rgba(195,145,91,.12)'; c.fillRect(lx + 6, ly + 6, lw - 12, lh - 12);
                    const cols = Math.max(2, Math.round(lw / 40)), rows = Math.max(2, Math.round(lh / 40));
                    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
                        const cx = lx + lw * (i + 0.5) / cols, cy = ly + lh * (j + 0.5) / rows;
                        c.strokeStyle = 'rgba(181,136,83,.65)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.stroke();
                        c.fillStyle = '#ceaa73'; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.arc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1, 0, Math.PI * 2); c.fill(); }
                    }
                    c.fillStyle = 'rgba(183,193,211,.08)'; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + lw * 0.45, ly); c.lineTo(lx + lw, ly + lh * 0.8); c.lineTo(lx + lw, ly + lh); c.lineTo(lx + lw * 0.75, ly + lh); c.closePath(); c.fill();
                    c.strokeStyle = '#1d2028'; c.lineWidth = 4; c.beginPath();
                    for (let i = 1; i < cols * 2; i++) { const x = lx + lw * i / (cols * 2); c.moveTo(x, ly); c.lineTo(x, ly + lh); }
                    for (let j = 1; j < rows * 2; j++) { const y = ly + lh * j / (rows * 2); c.moveTo(lx, y); c.lineTo(lx + lw, y); }
                    c.stroke(); c.strokeStyle = 'rgba(221,197,153,.2)'; c.lineWidth = 0.8; c.stroke();
                    c.restore();
                    c.beginPath(); c.roundRect(lx, ly, lw, lh, 14); c.lineWidth = 3; c.strokeStyle = S.steel; c.stroke();
                    c.beginPath(); c.roundRect(lx + 3, ly + 3, lw - 6, lh - 6, 11); c.lineWidth = 1; c.strokeStyle = 'rgba(208,172,114,.62)'; c.stroke();
                    for (const x of [16, fw - 34]) { rect(x + 2, 14, 18, 12, 'rgba(0,0,0,.35)'); rect(x, 12, 18, 12, '#2a2e36'); c.strokeStyle = 'rgba(208,172,114,.35)'; c.lineWidth = 0.8; c.strokeRect(x + 0.5, 12.5, 17, 11); }
                    c.strokeStyle = S.stone; c.lineWidth = 6; c.strokeRect(3, 3, fw - 6, fd - 6);
                    c.strokeStyle = 'rgba(230,199,153,.7)'; c.lineWidth = 1.2; c.strokeRect(6.5, 6.5, fw - 13, fd - 13);
                } else {
                    // Lacquer with a gold coping, and a moon dome ringed by a gold sunburst over the bar
                    const g = c.createLinearGradient(0, 0, fw, fd); g.addColorStop(0, '#221829'); g.addColorStop(1, '#130e18');
                    c.fillStyle = g; c.fillRect(0, 0, fw, fd);
                    c.strokeStyle = 'rgba(217,178,106,.08)'; c.lineWidth = 1; c.beginPath(); for (let x = 12; x < fw; x += 12) { c.moveTo(x, 6); c.lineTo(x, fd - 6); } c.stroke();
                    const [dx, dy, r] = this._vDome(fw, fd);
                    c.strokeStyle = 'rgba(217,178,106,.5)'; c.lineWidth = 1; c.beginPath();
                    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; c.moveTo(dx + Math.cos(a) * r * 1.12, dy + Math.sin(a) * r * 1.12); c.lineTo(dx + Math.cos(a) * r * (i % 2 ? 1.36 : 1.55), dy + Math.sin(a) * r * (i % 2 ? 1.36 : 1.55)); }
                    c.stroke();
                    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(dx + 3, dy + 4, r, 0, Math.PI * 2); c.fill();
                    const dg = c.createRadialGradient(dx - r * 0.35, dy - r * 0.35, r * 0.1, dx, dy, r); dg.addColorStop(0, '#4a3a66'); dg.addColorStop(0.6, '#2a1f3a'); dg.addColorStop(1, '#120c19');
                    c.fillStyle = dg; c.beginPath(); c.arc(dx, dy, r, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = 'rgba(217,178,106,.45)'; c.lineWidth = 0.8; c.beginPath();
                    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.moveTo(dx + Math.cos(a) * r * 0.2, dy + Math.sin(a) * r * 0.2); c.lineTo(dx + Math.cos(a) * r, dy + Math.sin(a) * r); }
                    c.stroke(); c.beginPath(); c.arc(dx, dy, r * 0.55, 0, Math.PI * 2); c.stroke();
                    c.strokeStyle = S.gold; c.lineWidth = 2.6; c.beginPath(); c.arc(dx, dy, r, 0, Math.PI * 2); c.stroke();
                    c.fillStyle = S.gold; c.beginPath(); c.arc(dx, dy, r * 0.18, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#2a1f3a'; c.beginPath(); c.arc(dx + r * 0.08, dy - r * 0.05, r * 0.16, 0, Math.PI * 2); c.fill();   // (a crescent)
                    for (const x of [18, fw - 18]) { c.fillStyle = '#0d0a11'; c.beginPath(); c.arc(x, 18, 7, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(217,178,106,.5)'; c.lineWidth = 1; c.stroke(); }
                    c.strokeStyle = '#2a2030'; c.lineWidth = 6; c.strokeRect(3, 3, fw - 6, fd - 6);
                    c.strokeStyle = S.gold; c.lineWidth = 1.4; c.strokeRect(6.5, 6.5, fw - 13, fd - 13);
                }
            },

            _vSkylights(S, fw, fd) {
                const half = Math.min(fw, fd) / 2, y = fd - half * 0.62, w = 22, h = 15;
                return (fw >= fd ? [fw * 0.34, fw * 0.66] : [fw * 0.5]).map(x => [x - w / 2, y, w, h]);
            },
            _vLantern(fw, fd) { const lw = Math.round(fw * 0.5), lh = Math.round(fd * 0.42); return [(fw - lw) / 2, fd * 0.2, lw, lh]; },
            _vDome(fw, fd) { return [fw / 2, fd * 0.46, Math.min(fw, fd) * 0.22]; },

            /** The trim an apartment's roof gets, in neutral tones over its own roof colour, kept to the edges
                (its rooftop features — pool, garden, laundry, tanks — keep the middle) */
            _vPaintAptRoof(c, S, fw, fd) {
                if (S.id === 'brownstone') {
                    c.fillStyle = 'rgba(255,232,200,.10)'; c.fillRect(0, 0, fw, 7); c.fillRect(0, fd - 7, fw, 7); c.fillRect(0, 7, 7, fd - 14); c.fillRect(fw - 7, 7, 7, fd - 14);
                    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 0.8; c.beginPath();
                    for (let x = 12; x < fw; x += 12) { c.moveTo(x, 0); c.lineTo(x, 7); c.moveTo(x, fd - 7); c.lineTo(x, fd); }
                    for (let y = 12; y < fd; y += 12) { c.moveTo(0, y); c.lineTo(7, y); c.moveTo(fw - 7, y); c.lineTo(fw, y); }
                    c.stroke();
                    // a pair of chimney stacks on the back parapet
                    for (const x of [fw * 0.36, fw * 0.6]) {
                        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + 3, 6, 22, 12);
                        c.fillStyle = '#5a2e24'; c.fillRect(x, 3, 22, 11); c.strokeStyle = 'rgba(239,220,182,.6)'; c.lineWidth = 1; c.strokeRect(x + 0.5, 3.5, 21, 10);
                        for (let i = 0; i < 3; i++) { c.fillStyle = '#8a4a32'; c.beginPath(); c.arc(x + 4.5 + i * 6.5, 8.5, 2.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a0f0b'; c.beginPath(); c.arc(x + 4.5 + i * 6.5, 8.5, 1.2, 0, Math.PI * 2); c.fill(); }
                    }
                } else if (S.id === 'deco') {
                    // Stepped corners and a double gilt line round the parapet
                    c.fillStyle = 'rgba(255,240,215,.09)';
                    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [fw, 0, -1, 1], [fw, fd, -1, -1], [0, fd, 1, -1]]) {
                        c.fillRect(Math.min(x, x + sx * 34), Math.min(y, y + sy * 12), 34, 12); c.fillRect(Math.min(x, x + sx * 12), Math.min(y, y + sy * 34), 12, 34);
                        c.fillRect(Math.min(x, x + sx * 20), Math.min(y, y + sy * 20), 20, 20);
                    }
                    c.strokeStyle = 'rgba(216,183,122,.55)'; c.lineWidth = 1; c.strokeRect(9.5, 9.5, fw - 19, fd - 19);
                    c.strokeStyle = 'rgba(216,183,122,.3)'; c.strokeRect(13.5, 13.5, fw - 27, fd - 27);
                    c.fillStyle = STREET_GOLD; for (const [x, y] of [[9.5, 9.5], [fw - 9.5, 9.5], [fw - 9.5, fd - 9.5], [9.5, fd - 9.5]]) { c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); }
                } else if (S.id === 'terrace') {
                    // Planter troughs along the front and down the sides, a timber deck strip behind the front
                    const trough = (x, y, w, h) => {
                        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 2, y + 2, w, h); c.fillStyle = '#4a2e1c'; c.fillRect(x, y, w, h);
                        const n = Math.round(w * h / 36);
                        for (let i = 0; i < n; i++) { const px = x + 3 + (i * 29 % Math.max(1, w - 6)), py = y + 3 + (i * 11 % Math.max(1, h - 6)); c.fillStyle = ['#3c7d44', '#2f6a3a', '#5c9a4c'][i % 3]; c.beginPath(); c.arc(px, py, 2.8, 0, Math.PI * 2); c.fill(); }
                        for (let i = 0; i < n / 4; i++) { c.fillStyle = ['#f2c14e', '#e86a8c', '#f6ecd8'][i % 3]; c.beginPath(); c.arc(x + 4 + (i * 41 % Math.max(1, w - 8)), y + 3 + (i * 7 % Math.max(1, h - 6)), 1.3, 0, Math.PI * 2); c.fill(); }
                    };
                    c.fillStyle = 'rgba(166,118,78,.22)'; c.fillRect(8, fd - 34, fw - 16, 22);
                    c.strokeStyle = 'rgba(40,24,12,.3)'; c.lineWidth = 0.8; c.beginPath(); for (let x = 14; x < fw - 8; x += 6) { c.moveTo(x, fd - 34); c.lineTo(x, fd - 12); } c.stroke();
                    trough(6, fd - 12, fw - 12, 7); trough(6, fd * 0.45, 7, fd * 0.45 - 14); trough(fw - 13, fd * 0.45, 7, fd * 0.45 - 14);
                } else {
                    // Steel coping, a run of north-light skylights along the back, a faint grid of roof pavers
                    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1; c.beginPath();
                    for (let x = 20; x < fw; x += 20) { c.moveTo(x, 8); c.lineTo(x, fd - 8); } for (let y = 20; y < fd; y += 20) { c.moveTo(8, y); c.lineTo(fw - 8, y); } c.stroke();
                    for (let x = fw * 0.32; x < fw * 0.84; x += 24) {
                        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + 2, 5, 18, 10);
                        c.fillStyle = '#3a4250'; c.fillRect(x, 3, 18, 10); c.fillStyle = 'rgba(176,196,220,.25)'; c.fillRect(x + 1.5, 4.5, 15, 4);
                        c.strokeStyle = '#1c2028'; c.lineWidth = 1; c.strokeRect(x + 0.5, 3.5, 17, 9);
                    }
                    c.strokeStyle = 'rgba(16,18,24,.55)'; c.lineWidth = 5; c.strokeRect(2.5, 2.5, fw - 5, fd - 5);
                    c.strokeStyle = 'rgba(214,190,150,.35)'; c.lineWidth = 0.8; c.strokeRect(5.5, 5.5, fw - 11, fd - 11);
                }
            },

            /** What glows on the roof at night (filled once with the variant's light) */
            _vGlowPath(p, v, fw, fd) {
                const S = v.spec;
                if (v.kind === 'apt') {
                    if (S.id === 'loft') for (let x = fw * 0.32; x < fw * 0.84; x += 24) p.rect(x + 1.5, 4.5, 15, 7);
                    return;
                }
                if (S.id === 'arcade') this._vArcGlowPath(p, v, fw, fd);
                else if (S.id === 'bakery') for (const [x, y, w, h] of this._vSkylights(S, fw, fd)) p.rect(x + 1, y + 1, w - 2, h - 2);
                else if (S.id === 'florist') p.rect(fw - 81, 9, 72, 54);
                else if (S.id === 'boutique') { const [lx, ly, lw, lh] = this._vLantern(fw, fd); p.roundRect(lx + 2, ly + 2, lw - 4, lh - 4, 12); }
                else { const [dx, dy, r] = this._vDome(fw, fd); p.moveTo(dx + r, dy); p.arc(dx, dy, r, 0, Math.PI * 2); }
            },

            /** The roof's night bulbs: the florist's string lights, the boutique's chandeliers, the lounge's sunburst tips, the deco corners */
            _vBulbPath(p, v, fw, fd) {
                const S = v.spec, dot = (x, y, r) => { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); };
                if (v.kind === 'apt') { if (S.id === 'deco') for (const [x, y] of [[9.5, 9.5], [fw - 9.5, 9.5], [fw - 9.5, fd - 9.5], [9.5, fd - 9.5]]) dot(x, y, 2.2); return; }
                if (S.id === 'florist') {
                    const runs = [[10, fd * 0.45, fw - 10, fd - 30], [10, fd - 30, fw - 10, fd * 0.45]];
                    for (const [ax, ay, bx, by] of runs) { const n = Math.round(Math.hypot(bx - ax, by - ay) / 12); for (let i = 1; i < n; i++) { const t = i / n; dot(ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(t * Math.PI) * 8, 1.6); } }
                } else if (S.id === 'boutique') {
                    const [lx, ly, lw, lh] = this._vLantern(fw, fd), cols = Math.max(2, Math.round(lw / 40)), rows = Math.max(2, Math.round(lh / 40));
                    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const cx = lx + lw * (i + 0.5) / cols, cy = ly + lh * (j + 0.5) / rows; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; dot(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1.3); } }
                } else if (S.id === 'lounge') {
                    const [dx, dy, r] = this._vDome(fw, fd);
                    for (let i = 0; i < 24; i += 2) { const a = i * Math.PI / 12; dot(dx + Math.cos(a) * r * 1.55, dy + Math.sin(a) * r * 1.55, 1.5); }
                }
            },

            /** The pavement just in front: a strip from the wall out, painted once a variant (and door place) */
            _vPaintBase(c, v, fw, fd, door) {
                let y = fd; const S = v.spec, dot = (x, yy, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, Math.PI * 2); c.fill(); };
                if (S.id === 'brownstone') { this._vBrPaintBase(c, v, fw, fd, door); return; }
                if (v.kind === 'apt') {
                    // A stoop: stone steps up to the door, and a planter either side
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(door - 20, y + 2, 44, 14);
                    c.fillStyle = S.id === 'loft' ? '#3a3e46' : S.id === 'deco' ? '#4a4038' : '#5a4a44'; c.fillRect(door - 22, y, 44, 13);
                    c.strokeStyle = 'rgba(232,214,180,.35)'; c.lineWidth = 1; c.beginPath(); for (const yy of [y + 4.5, y + 8.5]) { c.moveTo(door - 22, yy); c.lineTo(door + 22, yy); } c.stroke();
                    for (const x of [door - 34, door + 34]) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 6, y + 3, 14, 12); c.fillStyle = '#3a2a22'; c.fillRect(x - 7, y + 1, 14, 11); dot(x, y + 6, 5, '#3c7d44'); dot(x - 2, y + 5, 2.4, '#5c9a4c'); }
                    return;
                }
                if (S.id === 'arcade') { this._vArcPaintBase(c, v, fw, fd, door); return; }
                // A shop's awning, canopy or signboard covers the first stride out, so its things stand past that
                y += 16;
                if (S.id === 'bakery') {
                    // a planter of herbs at one end, the chalkboard and a bistro table at the other (clear of the door's lamps)
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(12, y + 4, 44, 12); c.fillStyle = '#3a2116'; c.fillRect(10, y + 2, 44, 12);
                    c.strokeStyle = '#5d3a24'; c.lineWidth = 1; c.strokeRect(10.5, y + 2.5, 43, 11);
                    for (let i = 0; i < 13; i++) dot(14 + (i * 37 % 38), y + 5 + (i * 13 % 7), 3.2, i % 3 ? '#4f7d43' : '#77a25d');
                    for (let i = 0; i < 7; i++) dot(15 + i * 6, y + 6 + (i % 2) * 4, 1.5, ['#f2c14e', '#e86a5c', '#f6ecd8'][i % 3]);
                    const bx = door + 62;
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(bx + 2, y + 9, 16, 12); c.fillStyle = '#5d3a24'; c.fillRect(bx, y + 6, 16, 12);
                    c.fillStyle = '#1f2421'; c.fillRect(bx + 2, y + 8, 12, 8); c.strokeStyle = 'rgba(240,235,220,.75)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(bx + 3.5, y + 10.5); c.lineTo(bx + 12, y + 10.5); c.moveTo(bx + 3.5, y + 13.5); c.lineTo(bx + 10, y + 13.5); c.stroke();
                    const tx = fw - 24, ty = y + 15;
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(tx + 2, ty + 3, 11, 9, 0, 0, Math.PI * 2); c.fill();
                    for (const dx of [-13, 13]) { c.fillStyle = '#2b1a12'; c.beginPath(); c.roundRect(tx + dx - 4.5, ty - 4.5, 9, 9, 2.5); c.fill(); c.strokeStyle = '#8c6a46'; c.lineWidth = 0.8; c.stroke(); }
                    dot(tx, ty, 8, '#efe4cc'); c.strokeStyle = '#7a5a38'; c.lineWidth = 1.2; c.beginPath(); c.arc(tx, ty, 8, 0, Math.PI * 2); c.stroke();
                    dot(tx - 2.5, ty - 1.5, 2.2, '#fff'); dot(tx - 2.5, ty - 1.5, 1.3, '#5b3420'); dot(tx + 3, ty + 2, 1.4, '#ffc66a');
                } else if (S.id === 'florist') {
                    // Buckets of flowers on wooden stands, either side and clear of the door
                    for (const [x0, x1] of [[10, door - 34], [door + 34, fw - 10]]) {
                        if (x1 - x0 < 20) continue;
                        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x0 + 2, y + 4, x1 - x0, 16); c.fillStyle = '#6b4a2e'; c.fillRect(x0, y + 2, x1 - x0, 15);
                        c.strokeStyle = '#8c6a46'; c.lineWidth = 0.8; c.strokeRect(x0 + 0.5, y + 2.5, x1 - x0 - 1, 14);
                        for (let x = x0 + 7, i = 0; x < x1 - 4; x += 11, i++) {
                            dot(x, y + 9.5, 5.2, '#5a6a72');
                            const col = ['#e86a8c', '#f2c14e', '#f6ecd8', '#b58cff', '#ff8a5c', '#d94a6a'][(i * 5 + x0) % 6];
                            for (let k = 0; k < 6; k++) dot(x + Math.cos(k * 1.1) * 3, y + 9.5 + Math.sin(k * 1.1) * 3, 2.1, k % 3 ? col : '#4f8a46');
                        }
                    }
                } else if (S.id === 'boutique') {
                    // Clipped topiaries in brass pots, either side past the canopy
                    for (const x of [door - 62, door + 62]) {
                        dot(x + 3, y + 14, 10, 'rgba(0,0,0,.35)');
                        const g = c.createLinearGradient(x - 9, 0, x + 9, 0); g.addColorStop(0, '#58432c'); g.addColorStop(0.45, S.gold); g.addColorStop(1, '#755539');
                        c.fillStyle = g; c.beginPath(); c.ellipse(x, y + 12, 9.5, 7.5, 0, 0, Math.PI * 2); c.fill();
                        c.strokeStyle = S.goldHi; c.lineWidth = 0.8; c.stroke();
                        dot(x, y + 10, 8, '#294b36'); dot(x - 2.5, y + 7.5, 4.2, '#547654');
                        for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 2 + i % 3 * 1.8; dot(x + Math.cos(a) * r, y + 10 + Math.sin(a) * r, 1.6, 'rgba(124,159,103,.45)'); }
                    }
                } else {
                    // The red carpet out to the kerb, and a velvet rope on brass posts down each side of it
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(door - 10, fd + 2, 24, y + 30 - fd);
                    c.fillStyle = '#8e1a34'; c.fillRect(door - 12, fd, 24, y + 31 - fd); c.strokeStyle = S.gold; c.lineWidth = 1; c.beginPath(); c.moveTo(door - 11.5, fd); c.lineTo(door - 11.5, y + 31); c.moveTo(door + 11.5, fd); c.lineTo(door + 11.5, y + 31); c.stroke();
                    for (const s of [-1, 1]) {
                        const posts = [[door + s * 44, y + 6], [door + s * 60, y + 6], [door + s * 76, y + 6], [door + s * 44, y + 26]];
                        c.strokeStyle = '#b0204a'; c.lineWidth = 2; c.beginPath();
                        for (let i = 0; i < 2; i++) { const [ax, ay] = posts[i], [bx, by] = posts[i + 1]; c.moveTo(ax, ay); c.quadraticCurveTo((ax + bx) / 2, ay + 5, bx, by); }
                        c.moveTo(posts[0][0], posts[0][1]); c.quadraticCurveTo(posts[0][0] + s * 4, y + 16, posts[3][0], posts[3][1]); c.stroke();
                        for (const [x, yy] of posts) { dot(x + 1, yy + 1.5, 3, 'rgba(0,0,0,.35)'); dot(x, yy, 2.8, S.gold); dot(x - 0.7, yy - 0.7, 1.1, '#fff2cf'); }
                    }
                }
            },

            /* ---------------- passes ---------------- */

            /** The night: the shopfront and the sign lit, neon fins, canopy bulbs, ledge lips catching the lamps */
            _vGlow(ctx, faces, P, dark) {
                const v = this.variant, S = v.spec, K = LandmarkKit, H = this._vH();
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (v.id === 'arcade') this._vArcGlow(ctx, faces, P, dark);
                else if (v.id === 'brownstone') this._vBrGlow(ctx, faces, P, dark);
                else if (v.kind === 'shop') {
                    for (const f of faces) if (f.side === this.facing && f.side !== 'C') { const G = this._vFaceAt(f, P); if (G.depth >= 3) this._vShopfront(ctx, f, G, H, true); }
                    if (S.id === 'lounge') {
                        const fins = [];
                        for (const f of faces) {
                            if (f.side === 'C') continue;
                            const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), cols = Math.max(1, Math.floor(L / 26));
                            for (let c = 0; c <= cols; c++) fins.push({ x: f.x1 + (f.x2 - f.x1) * c / cols, y: f.y1 + (f.y2 - f.y1) * c / cols, nx: f.nx, ny: f.ny });
                        }
                        if (fins.length) K.fins(ctx, fins, 1, H - 2, 1.4, 2.4, hexToRgba(v.neon, 0.85), null);
                    }
                    this._vFront(ctx, true);
                } else {
                    const rim = K.rim(this, dark);
                    if (rim.a > 0.01 && (v.id === 'deco' || v.id === 'terrace')) {   // gilt bands and veranda rails in the lamps' colour
                        const edges = faces.filter(f => f.side !== 'C').map(f => ({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny }));
                        K.ledge(ctx, edges, H, v.id === 'deco' ? 3.4 : 3, 0.01, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', `rgba(${rim.rgb}, ${0.6 * rim.a})`);
                    }
                }
                ctx.restore();
            }
        });
