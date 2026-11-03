        /* =====================================================================
           COZY CAFE — the hub's corner cafe on Crimson Blvd
           ---------------------------------------------------------------------
           A brick corner house on the tiered kit (buildings/tiered-kit.js):
             · the house: brick courses between cream quoins, big multi-pane shop
               windows on the ground floor (warm inside, even by day), flower-
               boxed windows above, a wood cornice; on the street the door and
               over it the signboard, "Cozy Cafe" in amber script;
             · two striped awnings over the shop windows (canopy tiers);
             · over the house, drawn with the kit's lean (its `top`): a shingled
               hip roof over the back two thirds with the hearth's chimney on its
               west slope (the fireplace inside sits against the west wall:
               HEARTHS.cozy_cafe_interior), and a roof terrace over the front
               with striped parasols and string lights.
           Collision is the house (the old section). Down on the pavement: a
           planter, the chalkboard and two bistro tables.
           ===================================================================== */
        const CAFE_EXTERIOR = {
            brick: '#6a3426', brickHi: '#7d4130', brickLo: '#43201a', mortar: 'rgba(232,190,140,.16)',
            cream: '#efdcb6', wood: '#3a2116', woodHi: '#5d3a24', amber: '#ffaa00', amberSoft: '#ffc66a',
            glass: '#2a1b14', warm: '#ffd690', stripeA: '#e2902c', stripeB: '#f1e0bd',
            roofS: '#6c3e2d', roofN: '#3d241b', roofE: '#55301f', roofW: '#4b2b1e', ridge: '#2a1711',
            deck: '#6f4a31', deckLo: '#563723', leaf: '#4f7d43', leafHi: '#77a25d'
        };
        // The plan, relative to the building's corner: the hip roof's eaves (an overhang past the walls on three
        // sides), its rise, the terrace in front of it, the chimney on the west slope, the door's signboard.
        const CAFE_PLAN = {
            W: 350, D: 350, HOUSE: 30, DOOR: 175, AWN: [[14, 115], [221, 115]], AWN_Z: [13, 16], EAVE: 3, ROOF_Y1: 232, RISE: 48,
            CHIM: { x: 34, y: 98, w: 30, h: 30, up: 34 },
            PARASOLS: [[66, 292], [176, 284], [286, 292]], PARASOL_R: 25, PARASOL_Z: 17,
            LIGHTS_Z: 21, SKY: [[62, 112], [238, 288]]
        };

        /** The house's walls: brick, quoins, the shop windows and the windows above, the cornice; the door and signboard on the front */
        function _ccWall(d, l, t, H, L) {
            const T = CAFE_EXTERIOR, front = t.mitre.find(e => e && !e.hidden && e.ny > 0.99), r = seededRandom(5150);
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.brick); g.addColorStop(1, T.brickLo); d.fillStyle = g; d.fillRect(0, 0, L, H);
            for (let i = 0; i < L * H / 30; i++) { d.fillStyle = r() < 0.5 ? 'rgba(125,65,48,.5)' : 'rgba(52,24,18,.35)'; d.fillRect(r() * L, r() * H, 2.4, 0.6); }   // odd bricks
            d.fillStyle = T.mortar; for (let y = 1.25; y < H; y += 1.25) d.fillRect(0, y, L, 0.25);
            const cx = front ? front.u0 + CAFE_PLAN.DOOR : -1e4, gl = H - 1.5, gt = H - 13, ut = H - 26, ub = H - 18;
            for (const e of t.mitre) {
                if (!e || e.hidden) continue;
                d.fillStyle = T.cream; d.fillRect(e.u0, 0, 5, H); d.fillRect(e.u0 + e.L - 5, 0, 5, H);          // the quoins
                d.fillStyle = 'rgba(120,90,60,.35)'; for (let y = 2; y < H; y += 2.5) { d.fillRect(e.u0, y, 5, 0.3); d.fillRect(e.u0 + e.L - 5, y, 5, 0.3); }
                // the shop windows below (either side of the door on the front)
                const spans = [];
                if (e === front) { spans.push([e.u0 + 16, cx - 30], [cx + 30, e.u0 + e.L - 16]); }
                else { const n = Math.max(2, Math.round(e.L / 90)); for (let i = 0; i < n; i++) spans.push([e.u0 + e.L * (i + 0.18) / n, e.u0 + e.L * (i + 0.82) / n]); }
                for (const [a, b] of spans) {
                    d.fillStyle = T.cream; d.fillRect(a - 1.6, gt - 0.8, b - a + 3.2, gl - gt + 0.8);
                    const gg = d.createLinearGradient(0, gt, 0, gl); gg.addColorStop(0, '#4a2e1c'); gg.addColorStop(1, T.glass); d.fillStyle = gg; d.fillRect(a, gt, b - a, gl - gt - 0.6);
                    d.fillStyle = 'rgba(255,200,120,.2)'; d.fillRect(a, gt, b - a, gl - gt - 0.6);
                    l.fillStyle = 'rgba(255,186,96,.8)'; l.fillRect(a, gt, b - a, gl - gt - 0.6);
                    const n = Math.max(2, Math.round((b - a) / 22));
                    d.fillStyle = T.wood; l.fillStyle = '#000';
                    for (let i = 1; i < n; i++) { const x = a + (b - a) * i / n; d.fillRect(x - 0.6, gt, 1.2, gl - gt); l.fillRect(x - 0.6, gt, 1.2, gl - gt); }
                    d.fillRect(a, gt + 2.6, b - a, 0.5); l.fillRect(a, gt + 2.6, b - a, 0.5);                    // the transom
                    d.fillStyle = T.wood; d.fillRect(a - 1.6, gl - 0.8, b - a + 3.2, 0.8);                       // the sill
                    // a shadow of the room: tables and a lamp or two
                    for (let x = a + 8; x < b - 6; x += 18) { d.fillStyle = 'rgba(40,20,10,.35)'; d.fillRect(x, gl - 4.6, 9, 0.6); d.fillRect(x + 4, gl - 4.6, 1, 3.6); l.fillStyle = 'rgba(255,230,170,.9)'; l.beginPath(); l.arc(x + 4.5, gt + 4.6, 1.2, 0, Math.PI * 2); l.fill(); }
                }
                // the windows above, flower boxes under them (none behind the signboard)
                const nu = Math.max(3, Math.round(e.L / 70));
                for (let i = 0; i < nu; i++) {
                    const a = e.u0 + e.L * (i + 0.3) / nu, b = e.u0 + e.L * (i + 0.7) / nu;
                    if (e === front && b > cx - 58 && a < cx + 58) continue;
                    d.fillStyle = T.cream; d.fillRect(a - 1.2, ut - 0.8, b - a + 2.4, ub - ut + 1.6);
                    d.fillStyle = T.glass; d.fillRect(a, ut, b - a, ub - ut); d.fillStyle = 'rgba(255,200,120,.14)'; d.fillRect(a, ut, b - a, ub - ut);
                    d.fillStyle = T.cream; d.fillRect((a + b) / 2 - 0.5, ut, 1, ub - ut); d.fillRect(a, (ut + ub) / 2 - 0.3, b - a, 0.6);
                    if ((i * 7 + Math.round(e.u0)) % 3) { l.fillStyle = 'rgba(255,214,140,.6)'; l.fillRect(a, ut, b - a, ub - ut); l.fillStyle = '#000'; l.fillRect((a + b) / 2 - 0.5, ut, 1, ub - ut); l.fillRect(a, (ut + ub) / 2 - 0.3, b - a, 0.6); }
                    d.fillStyle = T.wood; d.fillRect(a - 2, ub + 0.8, b - a + 4, 1.4);                        // the flower box
                    for (let x = a - 1.4; x < b + 2; x += 2.2) { d.fillStyle = r() < 0.6 ? T.leaf : T.leafHi; d.beginPath(); d.arc(x, ub + 0.6, 1, 0, Math.PI * 2); d.fill(); if (r() < 0.4) { d.fillStyle = ['#f2c14e', '#e86a5c', '#f6ecd8'][Math.floor(r() * 3)]; d.fillRect(x - 0.4, ub, 0.8, 0.6); } }
                }
            }
            // the cornice: a cream lip over a wood band
            d.fillStyle = T.cream; d.fillRect(0, 0, L, 0.9); d.fillStyle = T.wood; d.fillRect(0, 0.9, L, 1.4); d.fillStyle = 'rgba(0,0,0,.25)'; d.fillRect(0, 2.3, L, 0.4);
            if (!front) return;
            // the door: dark wood in a cream surround, a lit glass panel, the brass handle
            const dt = H - 14;
            d.fillStyle = T.cream; d.fillRect(cx - 14, dt - 1, 28, H - dt + 1);
            d.fillStyle = T.wood; d.fillRect(cx - 12, dt, 24, H - dt);
            d.fillStyle = 'rgba(255,200,120,.35)'; for (const x of [cx - 10, cx + 1.5]) d.fillRect(x, dt + 2, 8.5, 6);
            l.fillStyle = 'rgba(255,200,120,.95)'; for (const x of [cx - 10, cx + 1.5]) l.fillRect(x, dt + 2, 8.5, 6);
            d.fillStyle = T.woodHi; d.fillRect(cx - 0.4, dt, 0.8, H - dt);
            d.fillStyle = '#d8b26a'; d.fillRect(cx - 2.6, dt + 9, 1, 1.6); d.fillRect(cx + 1.6, dt + 9, 1, 1.6);
            // the signboard over it: dark wood, a brass edge, the name in amber script and a steaming cup
            const bx = cx - 52, by = H - 22.6, bw = 104, bh = 7.4;
            d.fillStyle = 'rgba(0,0,0,.35)'; d.fillRect(bx + 1, by + bh, bw - 2, 0.8);
            const bg = d.createLinearGradient(0, by, 0, by + bh); bg.addColorStop(0, '#4a2a1a'); bg.addColorStop(1, '#2a160d'); d.fillStyle = bg; d.fillRect(bx, by, bw, bh);
            d.strokeStyle = '#c99a52'; d.lineWidth = 0.5; d.strokeRect(bx + 0.25, by + 0.25, bw - 0.5, bh - 0.5);
            l.strokeStyle = 'rgba(255,190,90,.55)'; l.lineWidth = 0.4; l.strokeRect(bx + 0.25, by + 0.25, bw - 0.5, bh - 0.5);
            for (const [c, col] of [[d, '#ffbf4d'], [l, 'rgba(255,196,96,1)']]) {
                c.save(); c.translate(cx + 6, by + bh / 2 + 0.4); c.scale(1, 0.5);                           // (the strip's y is design units, twice the world's)
                c.font = '12.5px "Great Vibes", "URW Chancery L", "Z003", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText('Cozy Cafe', 0, 0);
                c.restore();
                const ux = bx + 11, uy = by + bh / 2 + 1;
                c.fillStyle = c === d ? T.cream : 'rgba(255,214,150,.8)'; c.fillRect(ux - 3, uy - 1.6, 5.5, 3); c.fillRect(ux + 2.5, uy - 1, 1, 1.6);
                c.fillRect(ux - 1.4, uy - 3.2, 0.5, 1.2); c.fillRect(ux + 0.8, uy - 3.4, 0.5, 1.2);
            }
            // a lantern either side of the door
            for (const s of [-1, 1]) { const lx = cx + s * 20; d.fillStyle = '#1e1410'; d.fillRect(lx - 1.4, dt + 1, 2.8, 3.2); d.fillStyle = '#ffd690'; d.fillRect(lx - 0.9, dt + 1.6, 1.8, 2); l.fillStyle = 'rgba(255,200,110,1)'; l.fillRect(lx - 0.9, dt + 1.6, 1.8, 2); }
        }

        /** An awning's edges: amber and cream stripes, a scalloped valance, warm light under it at night */
        function _ccAwning(d, l, t, H, L) {
            const T = CAFE_EXTERIOR, w = 6.5;
            for (let x = 0, i = 0; x < L; x += w, i++) { d.fillStyle = i % 2 ? T.stripeB : T.stripeA; d.fillRect(x, 0, w, H); }
            d.fillStyle = 'rgba(0,0,0,.18)'; d.fillRect(0, 0, L, 0.5);
            for (let x = 0, i = 0; x < L; x += w, i++) { d.fillStyle = i % 2 ? '#d9c7a2' : '#c2741f'; d.beginPath(); d.ellipse(x + w / 2, H - 0.9, w / 2, 0.9, 0, 0, Math.PI); d.fill(); }
            l.fillStyle = 'rgba(255,190,110,.35)'; l.fillRect(0, H - 0.6, L, 0.6);
        }

        function _ccHouseRoof(c, glow, t) {
            if (glow) return;
            const [x, y] = t.box;
            c.fillStyle = CAFE_EXTERIOR.ridge; c.fillRect(x, y, CAFE_PLAN.W, CAFE_PLAN.D);               // (under the hip roof and the terrace's deck)
        }

        function _ccAwningRoof(c, glow, t) {
            const [x0, y0, x1, y1] = t.box, T = CAFE_EXTERIOR, w = 13;
            if (glow) return;
            for (let x = x0, i = 0; x < x1; x += w, i++) { c.fillStyle = i % 2 ? T.stripeB : T.stripeA; c.fillRect(x, y0, Math.min(w, x1 - x), y1 - y0); }
            const sh = c.createLinearGradient(0, y0, 0, y1); sh.addColorStop(0, 'rgba(60,30,10,.28)'); sh.addColorStop(1, 'rgba(255,240,210,.12)'); c.fillStyle = sh; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            c.strokeStyle = 'rgba(58,33,22,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x0, y1 - 0.4); c.lineTo(x1, y1 - 0.4); c.stroke();
        }

        /** The hip roof, the terrace and the chimney, drawn over the house with its lean */
        function _ccTop(ctx, emissive, t, b) {
            ctx.save();
            b._ccDrawRoof(ctx, emissive); b._ccDrawTerrace(ctx, emissive); b._ccDrawChimney(ctx, emissive);
            ctx.restore();
        }

        const _ccFontsReady = () => !document.fonts || document.fonts.check('25px "Great Vibes"');

        class CozyCafeBuilding extends TieredBuilding {
            constructor(config) {
                super(config);
                this.crownZ = (CAFE_PLAN.HOUSE * TierKit.Z_SCALE + CAFE_PLAN.RISE + CAFE_PLAN.CHIM.up + 50) * this.hero;   // the chimney and its smoke stand over the roof
            }
            _setupSign() { this.attachedSign = null; }                  // the signboard is on the front wall
            _generateLights() { this._ccLights(); this.topReach = 60; }  // (the awnings and the bistro tables)
            drawBase(c) { super.drawBase(c); this._ccDrawBase(c); }
            /** The signboard's script waits for its font: the walls are painted again once it has loaded. */
            drawTop(c) {
                if (!this._ccFonts && _ccFontsReady()) { this._ccFonts = true; this._lkSprites = {}; for (const t of this._tkGeo().tiers) t.art = null; }
                super.drawTop(c);
            }
            drawSign() {}
        }
        TierKit.profile(CozyCafeBuilding);

        /** The Cozy Cafe: x, y its corner, the door on its front (south). */
        function createCozyCafeTiered(x, y, config = {}) {
            const T = CAFE_EXTERIOR, P = CAFE_PLAN, [za, zb] = P.AWN_Z;
            const awning = (i) => ({ id: 'awning' + i, solid: false, rect: [P.AWN[i][0], P.D + 1, P.AWN[i][1], 20], z0: za, z1: zb, S: 4, fill: T.stripeA, paint: _ccAwning, shade: [30, 14, 8],
                roofRes: 1, roof: _ccAwningRoof });
            return new CozyCafeBuilding({
                id: 'cozy_cafe', x, y, label: 'Cozy Cafe', type: 'cafe', facing: 'S', hero: 1.5, plan: { W: P.W, D: P.D },
                roofColor: '#4a3028', roofLightColor: '#5a3a30', wallColor: T.brick, wallLightColor: T.brickHi, accentColor: '#ffaa00',
                windowColor: '#2a1b14', windowLitColor: '#ffe0a0', windowFrameColor: T.cream, balconyColor: '#3e2723', balconies: [], roofProps: [],
                sign: { text: 'Cozy Cafe', color: '#ffaa00', size: 28 },
                door: { target: config.doorTarget || 'cozy_cafe_interior', label: 'Enter Cafe', lightColor: null },   // (lit by _ccLights)
                tiers: [
                    { id: 'house', rect: [0, 0, P.W, P.D], z0: 0, z1: P.HOUSE, S: 2, fill: T.brick, paint: _ccWall, shade: [30, 14, 8],
                      ledges: [{ z: P.HOUSE, out: 2, th: 1.6, top: T.wood, band: [58, 33, 22], lip: 'rgba(239,220,182,.7)' }], roofRes: 1, roof: _ccHouseRoof, top: _ccTop },
                    // (a px off the wall: a tier back to back with a wall hides it below its top, _tkGeo)
                    awning(0), awning(1)
                ],
                ...config
            });
        }

        Object.assign(CozyCafeBuilding.prototype, {
            // (heights here are world px; the kit's are design units, Z_SCALE times smaller)
            _ccH() { return CAFE_PLAN.HOUSE * TierKit.Z_SCALE; },
            _ccK(z) { return this._tkK(z / TierKit.Z_SCALE); },
            _ccP(x, y, z) { return this._tkP(x, y, z / TierKit.Z_SCALE); },
            /** The hip roof: its four planes as world points with heights (eave corners, ridge ends). */
            _ccRoof() {
                if (this._ccRoofGeo && this._ccRoofGeo.x === this.x && this._ccRoofGeo.y === this.y) return this._ccRoofGeo;
                const H = this._ccH(), e = CAFE_PLAN.EAVE, x0 = this.x - e, x1 = this.x + CAFE_PLAN.W + e, y0 = this.y - e, y1 = this.y + CAFE_PLAN.ROOF_Y1;
                const half = (y1 - y0) / 2, zr = H + CAFE_PLAN.RISE, ry = y0 + half;
                const A = [x0, y0, H], B = [x1, y0, H], C = [x1, y1, H], D = [x0, y1, H], R0 = [x0 + half, ry, zr], R1 = [x1 - half, ry, zr];
                return (this._ccRoofGeo = {
                    x: this.x, y: this.y, x0, x1, y0, y1, half, zr, H,
                    planes: [
                        { name: 'N', pts: [A, B, R1, R0], fill: CAFE_EXTERIOR.roofN },
                        { name: 'W', pts: [D, A, R0], fill: CAFE_EXTERIOR.roofW },
                        { name: 'E', pts: [B, C, R1], fill: CAFE_EXTERIOR.roofE },
                        { name: 'S', pts: [C, D, R0, R1], fill: CAFE_EXTERIOR.roofS }
                    ]
                });
            },
            /** Height of the roof's surface at x, y (for the chimney's foot) */
            _ccRoofZ(x, y) {
                const g = this._ccRoof(), d = Math.min(x - g.x0, g.x1 - x, y - g.y0, g.y1 - y);
                return g.H + CAFE_PLAN.RISE * Math.max(0, Math.min(1, d / g.half));
            },

            _ccLights() {
                const t = this.attachedTransition, cx = t.x + t.w / 2, wy = this.y + CAFE_PLAN.D;
                // The two lanterns by the door, the warm pool on the step, and the bistro table's glow
                for (const [x, y, color, r] of [
                    [cx - 62, wy + 8, '#ffb347', 120], [cx + 62, wy + 8, '#ffb347', 120],
                    [cx, wy + 30, '#ffe2b8', 170], [this.x + 282, wy + 34, '#ffcf8a', 105]
                ]) this.attachedLights.push(new LampEntity({ x, y, lampType: 3, color, lightRadius: r }));
            },

            /** Under the player: the shadow and the pavement dressing (doormat, planter, bistro set, chalkboard) */
            _ccDrawBase(ctx) {
                const s = LandmarkKit.sprite(this, 'cc_ground', this.x - 16, this.y - 12, CAFE_PLAN.W + 52, CAFE_PLAN.D + 66, 1, c => {
                    const x = this.x, y = this.y, T = CAFE_EXTERIOR, wy = y + CAFE_PLAN.D;
                    const t = this.attachedTransition, cx = t.x + t.w / 2;
                    // Brick step and a coir mat at the door
                    c.fillStyle = '#5a3326'; c.beginPath(); c.roundRect(cx - 48, wy, 96, 16, [0, 0, 6, 6]); c.fill();
                    c.strokeStyle = 'rgba(232,190,140,.22)'; c.lineWidth = 1; c.beginPath();
                    for (let i = 1; i < 6; i++) { c.moveTo(cx - 48 + i * 16, wy); c.lineTo(cx - 48 + i * 16, wy + 16); } c.stroke();
                    c.fillStyle = '#8a6a43'; c.beginPath(); c.roundRect(cx - 24, wy + 3, 48, 10, 2); c.fill();
                    c.strokeStyle = 'rgba(40,24,10,.6)'; c.strokeRect(cx - 21, wy + 5, 42, 6);
                    // Planter box with flowers by the west corner (the van parks just east of it)
                    c.fillStyle = T.wood; c.fillRect(x + 10, wy + 2, 52, 13);
                    c.strokeStyle = T.woodHi; c.strokeRect(x + 10.5, wy + 2.5, 51, 12);
                    for (let i = 0; i < 14; i++) {
                        const px = x + 14 + (i * 37 % 46), py = wy + 5 + (i * 13 % 8);
                        c.fillStyle = i % 3 ? T.leaf : T.leafHi; c.beginPath(); c.arc(px, py, 3.4, 0, Math.PI * 2); c.fill();
                    }
                    for (let i = 0; i < 9; i++) {
                        c.fillStyle = ['#f2c14e', '#e86a5c', '#f6ecd8'][i % 3];
                        c.beginPath(); c.arc(x + 16 + i * 5.2, wy + 6 + (i % 2) * 5, 1.6, 0, Math.PI * 2); c.fill();
                    }
                    // Chalkboard A-frame, just east of the door
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(cx + 66, wy + 22, 20, 14);
                    c.fillStyle = T.woodHi; c.fillRect(cx + 63, wy + 18, 20, 14);
                    c.fillStyle = '#1f2421'; c.fillRect(cx + 65, wy + 20, 16, 10);
                    c.strokeStyle = 'rgba(240,235,220,.7)'; c.lineWidth = .8; c.beginPath();
                    c.moveTo(cx + 67, wy + 23); c.lineTo(cx + 78, wy + 23); c.moveTo(cx + 67, wy + 26); c.lineTo(cx + 75, wy + 26); c.stroke();
                    // Two bistro tables with their chairs, cups and a candle
                    for (const [tx, ty] of [[x + 252, wy + 30], [x + 308, wy + 30]]) {
                        c.fillStyle = 'rgba(0,0,0,.32)'; c.beginPath(); c.ellipse(tx + 3, ty + 4, 13, 11, 0, 0, Math.PI * 2); c.fill();
                        for (const a of [Math.PI * .5, Math.PI * 1.5]) {
                            const chx = tx + Math.cos(a) * 15, chy = ty + Math.sin(a) * 13;
                            c.fillStyle = '#2b1a12'; c.beginPath(); c.roundRect(chx - 6, chy - 5, 12, 10, 3); c.fill();
                            c.strokeStyle = '#8c6a46'; c.lineWidth = 1; c.stroke();
                        }
                        c.fillStyle = '#efe4cc'; c.beginPath(); c.arc(tx, ty, 9, 0, Math.PI * 2); c.fill();
                        c.strokeStyle = '#7a5a38'; c.lineWidth = 1.2; c.stroke();
                        c.fillStyle = '#fff'; c.beginPath(); c.arc(tx - 3, ty - 2, 2.4, 0, Math.PI * 2); c.fill();
                        c.fillStyle = '#5b3420'; c.beginPath(); c.arc(tx - 3, ty - 2, 1.4, 0, Math.PI * 2); c.fill();
                        c.fillStyle = T.amberSoft; c.beginPath(); c.arc(tx + 3, ty + 2, 1.5, 0, Math.PI * 2); c.fill();
                    }
                });
                ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
            },

            /** The hip roof: planes away from the camera first, then those facing it, with shingle courses and hips. */
            _ccDrawRoof(ctx, emissive) {
                const g = this._ccRoof(), T = CAFE_EXTERIOR;
                const proj = g.planes.map(pl => ({ pl, q: pl.pts.map(p => this._ccP(p[0], p[1], p[2])) }));
                const area = q => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
                const poly = q => { const p = new Path2D(); q.forEach((v, i) => i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1])); p.closePath(); return p; };
                if (!emissive) {
                    // (the planes are listed clockwise from above; one seen from behind turns anticlockwise on screen)
                    proj.sort((a, b) => (area(a.q) > 0) - (area(b.q) > 0));
                    const half = g.half, zr = g.zr, H = g.H;
                    for (const { pl, q } of proj) {
                        const path = poly(q);
                        ctx.fillStyle = pl.fill; ctx.fill(path);
                        // shingle courses, parallel to the eave, between the hips
                        const courses = new Path2D(), ticks = new Path2D();
                        for (let i = 1; i < 11; i++) {
                            const fr = i / 11, d = half * fr, z = H + CAFE_PLAN.RISE * fr;
                            let a, b;
                            if (pl.name === 'S') { a = [g.x0 + d, g.y1 - d]; b = [g.x1 - d, g.y1 - d]; }
                            else if (pl.name === 'N') { a = [g.x0 + d, g.y0 + d]; b = [g.x1 - d, g.y0 + d]; }
                            else if (pl.name === 'W') { a = [g.x0 + d, g.y0 + d]; b = [g.x0 + d, g.y1 - d]; }
                            else { a = [g.x1 - d, g.y0 + d]; b = [g.x1 - d, g.y1 - d]; }
                            const pa = this._ccP(a[0], a[1], z), pb = this._ccP(b[0], b[1], z);
                            courses.moveTo(pa[0], pa[1]); courses.lineTo(pb[0], pb[1]);
                            // staggered joints along the course
                            const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(len / 16);
                            for (let j = 1; j < n; j++) {
                                const u = (j + (i % 2) * 0.5) / n; if (u >= 1) continue;
                                const fr2 = (i - 1) / 11, d2 = half * fr2, z2 = H + CAFE_PLAN.RISE * fr2;
                                const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
                                const ox = pl.name === 'W' ? -(d - d2) : pl.name === 'E' ? (d - d2) : 0, oy = pl.name === 'N' ? -(d - d2) : pl.name === 'S' ? (d - d2) : 0;
                                const p0 = this._ccP(x, y, z), p1 = this._ccP(x + ox, y + oy, z2);
                                ticks.moveTo(p0[0], p0[1]); ticks.lineTo(p1[0], p1[1]);
                            }
                        }
                        ctx.strokeStyle = 'rgba(20,10,6,.38)'; ctx.lineWidth = 1; ctx.stroke(courses);
                        ctx.strokeStyle = 'rgba(20,10,6,.22)'; ctx.lineWidth = 0.7; ctx.stroke(ticks);
                        ctx.strokeStyle = pl.name === 'S' ? 'rgba(255,214,160,.10)' : 'rgba(255,214,160,.05)'; ctx.lineWidth = 0.6; ctx.stroke(courses);
                    }
                    // Hips, ridge and eaves
                    const [A, B, R1, R0] = g.planes[0].pts, C = g.planes[2].pts[1], D = g.planes[1].pts[0];
                    const line = (p, a, b) => { const pa = this._ccP(...a), pb = this._ccP(...b); p.moveTo(pa[0], pa[1]); p.lineTo(pb[0], pb[1]); };
                    const hips = new Path2D(); line(hips, A, R0); line(hips, D, R0); line(hips, B, R1); line(hips, C, R1); line(hips, R0, R1);
                    ctx.strokeStyle = T.ridge; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.stroke(hips);
                    ctx.strokeStyle = 'rgba(214,160,104,.45)'; ctx.lineWidth = 1; ctx.stroke(hips);
                    const eave = new Path2D(); line(eave, A, B); line(eave, B, C); line(eave, D, A);
                    ctx.strokeStyle = T.wood; ctx.lineWidth = 2.4; ctx.stroke(eave);
                    ctx.lineCap = 'butt';
                }
                // Two skylights on the front slope: warm by night
                const sky = new Path2D();
                for (const [xa, xb] of CAFE_PLAN.SKY) {
                    const f0 = 0.16, f1 = 0.5, d0 = g.half * f0, d1 = g.half * f1, z0 = g.H + CAFE_PLAN.RISE * f0, z1 = g.H + CAFE_PLAN.RISE * f1;
                    const pts = [[this.x + xa, g.y1 - d0, z0], [this.x + xb, g.y1 - d0, z0], [this.x + xb, g.y1 - d1, z1], [this.x + xa, g.y1 - d1, z1]].map(p => this._ccP(...p));
                    pts.forEach((v, i) => i ? sky.lineTo(v[0], v[1]) : sky.moveTo(v[0], v[1])); sky.closePath();
                }
                if (!emissive) {
                    ctx.fillStyle = '#2b2422'; ctx.fill(sky); ctx.fillStyle = 'rgba(160,190,220,.14)'; ctx.fill(sky);
                    ctx.strokeStyle = T.cream; ctx.lineWidth = 1.3; ctx.stroke(sky);
                } else { ctx.fillStyle = 'rgba(255,170,80,.26)'; ctx.fill(sky); }
            },

            /** The hearth's brick chimney on the west slope, its pot and a little smoke */
            _ccDrawChimney(ctx, emissive) {
                const T = CAFE_EXTERIOR, c = CAFE_PLAN.CHIM, x0 = this.x + c.x, y0 = this.y + c.y, x1 = x0 + c.w, y1 = y0 + c.h;
                const zb = this._ccRoofZ(x0 + c.w / 2, y0 + c.h / 2) - 4, zt = zb + c.up, cam = game.camera;
                const side = (ax, ay, bx, by, fill) => {
                    const p = [this._ccP(ax, ay, zb), this._ccP(bx, by, zb), this._ccP(bx, by, zt), this._ccP(ax, ay, zt)];
                    ctx.beginPath(); p.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
                    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = 'rgba(232,190,140,.18)'; ctx.lineWidth = 0.7; ctx.stroke();
                };
                const top = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => this._ccP(x, y, zt));
                if (!emissive) {
                    if (cam.y > y1) side(x0, y1, x1, y1, T.brickHi); if (cam.y < y0) side(x0, y0, x1, y0, T.brickLo);
                    if (cam.x > x1) side(x1, y0, x1, y1, T.brick); if (cam.x < x0) side(x0, y0, x0, y1, T.brick);
                    ctx.beginPath(); top.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
                    ctx.fillStyle = T.brick; ctx.fill(); ctx.strokeStyle = T.cream; ctx.lineWidth = 2; ctx.stroke();
                }
                LandmarkKit.flat(ctx, this._ccK(zt), cc => {
                    const mx = x0 + c.w / 2, my = y0 + c.h / 2;
                    if (!emissive) {
                        cc.fillStyle = '#8a4a32'; cc.beginPath(); cc.arc(mx, my, 8, 0, Math.PI * 2); cc.fill();
                        cc.fillStyle = '#1a0f0b'; cc.beginPath(); cc.arc(mx, my, 5, 0, Math.PI * 2); cc.fill();
                    } else { cc.fillStyle = 'rgba(255,120,40,.5)'; cc.beginPath(); cc.arc(mx, my, 4.5, 0, Math.PI * 2); cc.fill(); }
                });
                if (emissive) return;
                // Smoke: a few soft puffs rising from the pot and drifting east
                const now = (typeof _frameTimeSec !== 'undefined' ? _frameTimeSec : performance.now() / 1000);
                for (let i = 0; i < 5; i++) {
                    const ph = (now * 0.22 + i / 5) % 1, z = zt + 4 + ph * 46;
                    const p = this._ccP(x0 + c.w / 2 + ph * 26 + Math.sin(now + i * 2) * 3, y0 + c.h / 2 - ph * 10, z);
                    ctx.fillStyle = `rgba(214,206,198,${(0.22 * (1 - ph)).toFixed(3)})`;
                    ctx.beginPath(); ctx.arc(p[0], p[1], 5 + ph * 11, 0, Math.PI * 2); ctx.fill();
                }
            },

            /** The roof terrace over the front: a plank deck, a brick parapet with planters, bistro tables */
            _ccTerraceSprite() {
                const x = this.x, y = this.y + CAFE_PLAN.ROOF_Y1, w = CAFE_PLAN.W, h = CAFE_PLAN.D - CAFE_PLAN.ROOF_Y1, T = CAFE_EXTERIOR;
                return LandmarkKit.sprite(this, 'cc_terrace', x - 2, y - 2, w + 4, h + 4, 1, c => {
                    c.fillStyle = T.deckLo; c.fillRect(x, y, w, h);
                    c.strokeStyle = 'rgba(30,16,8,.45)'; c.lineWidth = 1; c.beginPath();
                    for (let yy = y + 7; yy < y + h; yy += 7) { c.moveTo(x, yy); c.lineTo(x + w, yy); } c.stroke();
                    c.fillStyle = 'rgba(160,110,70,.20)';
                    for (let r = 0, yy = y; yy < y + h; yy += 7, r++) for (let xx = x + (r % 3) * 23; xx < x + w; xx += 70) c.fillRect(xx, yy + 1, 44, 5);
                    c.strokeStyle = 'rgba(30,16,8,.35)'; c.beginPath();
                    for (let r = 0, yy = y; yy < y + h; yy += 7, r++) for (let xx = x + 31 + (r % 4) * 17; xx < x + w; xx += 68) { c.moveTo(xx, yy); c.lineTo(xx, yy + 7); } c.stroke();
                    // parapet on the three open sides
                    c.fillStyle = T.brick; c.fillRect(x, y, 7, h); c.fillRect(x + w - 7, y, 7, h); c.fillRect(x, y + h - 7, w, 7);
                    c.strokeStyle = T.cream; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 3.5, y); c.lineTo(x + 3.5, y + h - 3.5); c.lineTo(x + w - 3.5, y + h - 3.5); c.lineTo(x + w - 3.5, y); c.stroke();
                    // a step down from the roof's eave and the roof door
                    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, y, w, 5);
                    c.fillStyle = T.wood; c.fillRect(x + 160, y, 32, 6);
                    // planters in the corners, chairs round each table (the parasols cover the tops)
                    for (const [px, py] of [[x + 16, y + h - 16], [x + w - 16, y + h - 16], [x + 16, y + 16], [x + w - 16, y + 16]]) {
                        c.fillStyle = '#3a2116'; c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.fill();
                        for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 2 + (i % 3) * 2.2; c.fillStyle = i % 2 ? T.leaf : T.leafHi; c.beginPath(); c.arc(px + Math.cos(a) * r, py + Math.sin(a) * r, 3.2, 0, Math.PI * 2); c.fill(); }
                    }
                    for (const [tx, ty] of CAFE_PLAN.PARASOLS) for (let i = 0; i < 4; i++) {
                        const a = Math.PI / 4 + i * Math.PI / 2, chx = this.x + tx + Math.cos(a) * 24, chy = this.y + ty + Math.sin(a) * 20;
                        c.fillStyle = '#2b1a12'; c.beginPath(); c.roundRect(chx - 5, chy - 5, 10, 10, 3); c.fill(); c.strokeStyle = '#8c6a46'; c.lineWidth = 1; c.stroke();
                    }
                });
            },

            /** The parasols: eight panels each, amber and cream, a wooden finial */
            _ccParasolSprite() {
                const T = CAFE_EXTERIOR, R = CAFE_PLAN.PARASOL_R;
                return LandmarkKit.sprite(this, 'cc_parasols', this.x, this.y + CAFE_PLAN.ROOF_Y1, CAFE_PLAN.W, CAFE_PLAN.D - CAFE_PLAN.ROOF_Y1, 2, c => {
                    for (const [tx, ty] of CAFE_PLAN.PARASOLS) {
                        const px = this.x + tx, py = this.y + ty;
                        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(px + 4, py + 5, R, 0, Math.PI * 2); c.fill();
                        for (let i = 0; i < 8; i++) {
                            const a0 = i * Math.PI / 4, a1 = a0 + Math.PI / 4;
                            c.fillStyle = i % 2 ? T.stripeB : T.stripeA;
                            c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a0) * R, py + Math.sin(a0) * R); c.lineTo(px + Math.cos(a1) * R, py + Math.sin(a1) * R); c.closePath(); c.fill();
                        }
                        const sh = c.createRadialGradient(px - 6, py - 6, 2, px, py, R);
                        sh.addColorStop(0, 'rgba(255,240,210,.18)'); sh.addColorStop(1, 'rgba(60,30,10,.25)');
                        c.fillStyle = sh; c.beginPath(); c.arc(px, py, R, 0, Math.PI * 2); c.fill();
                        c.strokeStyle = 'rgba(90,50,20,.55)'; c.lineWidth = 0.8; c.beginPath();
                        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.moveTo(px, py); c.lineTo(px + Math.cos(a) * R, py + Math.sin(a) * R); }
                        c.stroke();
                        c.fillStyle = T.woodHi; c.beginPath(); c.arc(px, py, 2.6, 0, Math.PI * 2); c.fill();
                    }
                });
            },

            /** String lights over the terrace: four sagging runs, a bulb every 13 px (world path, made once) */
            _ccBulbs() {
                return LandmarkKit.path(this, 'cc_bulbs', p => {
                    const y0 = this.y + CAFE_PLAN.ROOF_Y1 + 6, y1 = this.y + CAFE_PLAN.D - 6, x0 = this.x + 6, x1 = this.x + CAFE_PLAN.W - 6;
                    const runs = [[x0, y0, x1, y1], [x1, y0, x0, y1], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]];
                    const wire = new Path2D(), bulbs = new Path2D();
                    for (const [ax, ay, bx, by] of runs) {
                        const L = Math.hypot(bx - ax, by - ay), n = Math.round(L / 13), mx = (ax + bx) / 2, my = (ay + by) / 2 + 8;
                        wire.moveTo(ax, ay); wire.quadraticCurveTo(mx, my, bx, by);
                        for (let i = 1; i < n; i++) {
                            const t = i / n, x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx, y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by;
                            bulbs.moveTo(x + 1.7, y); bulbs.arc(x, y, 1.7, 0, Math.PI * 2);
                        }
                    }
                    p.wire = wire; p.bulbs = bulbs;
                    return p;
                });
            },

            _ccDrawTerrace(ctx, emissive) {
                const H = this._ccH(), b = this._ccBulbs();
                if (!emissive) LandmarkKit.drawSprite(ctx, this._ccTerraceSprite(), this._ccK(H));
                if (!emissive) LandmarkKit.drawSprite(ctx, this._ccParasolSprite(), this._ccK(H + CAFE_PLAN.PARASOL_Z));
                LandmarkKit.flat(ctx, this._ccK(H + CAFE_PLAN.LIGHTS_Z), c => {
                    if (!emissive) {
                        c.strokeStyle = 'rgba(30,20,14,.7)'; c.lineWidth = 0.8; c.stroke(b.wire);
                        c.fillStyle = '#f3dfb0'; c.fill(b.bulbs);
                    } else {
                        c.fillStyle = 'rgba(255,200,110,.95)'; c.fill(b.bulbs);
                        c.lineWidth = 5; c.strokeStyle = 'rgba(255,170,60,.10)'; c.stroke(b.wire);
                    }
                });
            },
        });
