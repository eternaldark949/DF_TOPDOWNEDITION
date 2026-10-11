        /* =====================================================================
           COZY CAFE — the hub's corner cafe on Crimson Blvd (style 'cozy_cafe')
           ---------------------------------------------------------------------
           A brick corner house: a shingled hip roof over the back two thirds
           with the hearth's chimney on its west slope (the fireplace inside sits
           against the west wall: HEARTHS.cozy_cafe_interior), and a roof terrace
           over the front with striped parasols and string lights. Down at the
           street, striped awnings over the shop windows and a wooden signboard
           over the door; a planter and a bistro table on the pavement.

           Every point is leaned with the walls' camera (LandmarkKit.k), so the
           roof's slopes, the chimney and the parasols stand at their own heights.
           Flat busy layers (the deck, the parasols, the pavement) are baked once;
           the roof planes and walls are a few projected fills a frame. The
           sections are untouched: collision, shadows and the block are as before.
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
            W: 350, D: 350, EAVE: 3, ROOF_Y1: 232, RISE: 48,
            CHIM: { x: 34, y: 98, w: 30, h: 30, up: 34 },
            PARASOLS: [[66, 292], [176, 284], [286, 292]], PARASOL_R: 25, PARASOL_Z: 17,
            LIGHTS_Z: 21, SKY: [[62, 112], [238, 288]]
        };

        Object.assign(BuildingV2.prototype, {
            _ccH() { return Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT; },
            _ccK(z) { return CONFIG.BUILDINGS.LEAN ? LandmarkKit.k(z) : 1; },
            _ccP(x, y, z) {
                const k = this._ccK(z), cam = game.camera;
                return [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
            },
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
                    c.fillStyle = 'rgba(0,0,0,.42)'; c.fillRect(x + 16, y + 16, CAFE_PLAN.W, CAFE_PLAN.D);
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

            /** One wall: brick courses, cream corners, windows (big shop windows below, flower-boxed ones above), cornice. */
            _ccFace(ctx, f, emissive) {
                const T = CAFE_EXTERIOR, H = this._ccH(), L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
                const P = (u, z) => this._ccP(f.x1 + (f.x2 - f.x1) * u, f.y1 + (f.y2 - f.y1) * u, z);
                const quad = (path, u0, u1, z0, z1) => {
                    const a = P(u0, z0), b = P(u1, z0), d = P(u0, z1), e = P(u1, z1);
                    path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(e[0], e[1]); path.lineTo(d[0], d[1]); path.closePath();
                    return path;
                };
                const front = f.side === 'S';
                // The door's span along this face (front only), so the shop windows sit either side of it
                const t = this.attachedTransition, du = front ? (t.x + t.w / 2 - f.x1) / (f.x2 - f.x1) : -1, dw = 34 / L;
                const lower = [], upper = [], z0 = 3, z1 = H * 0.48, z2 = H * 0.6, z3 = H * 0.86;
                if (front) {
                    for (const [a, b] of [[0.05, du - dw - 0.06], [du + dw + 0.06, 0.95]]) if (b > a) lower.push([Math.min(a, b), Math.max(a, b)]);
                } else {
                    const n = Math.max(2, Math.round(L / 90));
                    for (let i = 0; i < n; i++) lower.push([(i + 0.2) / n, (i + 0.8) / n]);
                }
                const nu = Math.max(3, Math.round(L / 70));
                for (let i = 0; i < nu; i++) upper.push([(i + 0.3) / nu, (i + 0.7) / nu]);
                if (!emissive) {
                    const g = ctx.createLinearGradient(...P(0.5, 0), ...P(0.5, H));
                    g.addColorStop(0, T.brickLo); g.addColorStop(1, front ? T.brickHi : T.brick);
                    ctx.fillStyle = g; ctx.fill(quad(new Path2D(), 0, 1, 0, H));
                    const courses = new Path2D();
                    for (let z = 2.5; z < H - 2; z += 2.5) { const a = P(0, z), b = P(1, z); courses.moveTo(a[0], a[1]); courses.lineTo(b[0], b[1]); }
                    ctx.strokeStyle = T.mortar; ctx.lineWidth = 0.7; ctx.stroke(courses);
                    const corners = new Path2D(); quad(corners, 0, 6 / L, 0, H); quad(corners, 1 - 6 / L, 1, 0, H);
                    ctx.fillStyle = T.cream; ctx.fill(corners);
                    const frames = new Path2D(), glass = new Path2D(), bars = new Path2D(), boxes = new Path2D();
                    for (const [a, b] of lower) {
                        quad(frames, a, b, z0, z1); quad(glass, a + 2 / L, b - 2 / L, z0 + 1, z1 - 1);
                        const n = Math.max(2, Math.round((b - a) * L / 26));
                        for (let i = 1; i < n; i++) quad(bars, a + (b - a) * i / n - 0.6 / L, a + (b - a) * i / n + 0.6 / L, z0, z1);
                        quad(bars, a, b, z1 - 3.2, z1 - 2.6);                            // the transom
                    }
                    for (const [a, b] of upper) {
                        quad(frames, a, b, z2, z3); quad(glass, a + 1.5 / L, b - 1.5 / L, z2 + 0.8, z3 - 0.8);
                        quad(bars, (a + b) / 2 - 0.5 / L, (a + b) / 2 + 0.5 / L, z2, z3);
                        quad(boxes, a - 2 / L, b + 2 / L, z2 - 1.6, z2 + 0.4);
                    }
                    ctx.fillStyle = T.cream; ctx.fill(frames);
                    const gg = ctx.createLinearGradient(...P(0.5, z0), ...P(0.5, z3));
                    gg.addColorStop(0, '#4a2e1c'); gg.addColorStop(1, T.glass);
                    ctx.fillStyle = gg; ctx.fill(glass);
                    ctx.fillStyle = 'rgba(255,200,120,.16)'; ctx.fill(glass);                  // a warm room behind the glass, even by day
                    ctx.fillStyle = T.wood; ctx.fill(bars);
                    ctx.fillStyle = T.leaf; ctx.fill(boxes);
                    // Cornice: a wood band and a cream lip along the top
                    ctx.fillStyle = T.wood; ctx.fill(quad(new Path2D(), 0, 1, H - 3.5, H - 1.5));
                    ctx.fillStyle = T.cream; ctx.fill(quad(new Path2D(), 0, 1, H - 1.5, H));
                    if (front && du > 0) {
                        // The door: dark wood, a lit glass panel, a cream surround
                        ctx.fillStyle = T.cream; ctx.fill(quad(new Path2D(), du - dw, du + dw, 0, z1 + 1.5));
                        ctx.fillStyle = T.wood; ctx.fill(quad(new Path2D(), du - dw + 2 / L, du + dw - 2 / L, 0, z1));
                        ctx.fillStyle = 'rgba(255,200,120,.35)'; ctx.fill(quad(new Path2D(), du - dw + 6 / L, du + dw - 6 / L, z1 * 0.35, z1 - 2));
                        ctx.fillStyle = T.wood; ctx.fill(quad(new Path2D(), du - 0.5 / L, du + 0.5 / L, 0, z1));
                    }
                } else {
                    const glow = new Path2D();
                    for (const [a, b] of lower) quad(glow, a + 2 / L, b - 2 / L, z0 + 1, z1 - 1);
                    if (front && du > 0) quad(glow, du - dw + 6 / L, du + dw - 6 / L, z1 * 0.35, z1 - 2);
                    ctx.fillStyle = 'rgba(255,186,96,.55)'; ctx.fill(glow);
                    const up = new Path2D();
                    for (let i = 0; i < upper.length; i++) if ((i * 7 + (f.side.charCodeAt(0))) % 3) quad(up, upper[i][0] + 1.5 / L, upper[i][1] - 1.5 / L, z2 + 0.8, z3 - 0.8);
                    ctx.fillStyle = 'rgba(255,214,140,.42)'; ctx.fill(up);
                }
            },

            /** The striped awnings over the shop windows and the signboard over the door (in front of the south wall). */
            _ccAwnings(ctx, emissive) {
                const T = CAFE_EXTERIOR, H = this._ccH(), wy = this.y + CAFE_PLAN.D, zt = H * 0.52, zf = H * 0.34, out = 20;
                const t = this.attachedTransition, cx = t.x + t.w / 2;
                const spans = [[this.x + 14, cx - 46], [cx + 46, this.x + CAFE_PLAN.W - 14]];
                if (!emissive) {
                    for (const [xa, xb] of spans) {
                        const n = Math.max(2, Math.round((xb - xa) / 13)), w = (xb - xa) / n;
                        const A = new Path2D(), B = new Path2D();
                        for (let i = 0; i < n; i++) {
                            const p = i % 2 ? B : A, a = xa + i * w, b = a + w;
                            const q0 = this._ccP(a, wy, zt), q1 = this._ccP(b, wy, zt), q2 = this._ccP(b, wy + out, zf), q3 = this._ccP(a, wy + out, zf);
                            p.moveTo(q0[0], q0[1]); p.lineTo(q1[0], q1[1]); p.lineTo(q2[0], q2[1]); p.lineTo(q3[0], q3[1]); p.closePath();
                        }
                        ctx.fillStyle = T.stripeA; ctx.fill(A); ctx.fillStyle = T.stripeB; ctx.fill(B);
                        // The scalloped valance, flat at the awning's front edge
                        LandmarkKit.flat(ctx, this._ccK(zf), c => {
                            const sa = new Path2D(), sb = new Path2D();
                            for (let i = 0; i < n; i++) { const mx = xa + (i + 0.5) * w, p = i % 2 ? sb : sa; p.moveTo(mx + w / 2, wy + out); p.arc(mx, wy + out, w / 2, 0, Math.PI); }
                            c.fillStyle = '#c2741f'; c.fill(sa); c.fillStyle = '#d9c7a2'; c.fill(sb);
                            c.strokeStyle = 'rgba(58,33,22,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(xa, wy + out); c.lineTo(xb, wy + out); c.stroke();
                        });
                    }
                }
                // The signboard over the door: dark wood, a brass edge, "Cozy Cafe" in amber script, a little steaming cup
                LandmarkKit.flat(ctx, this._ccK(H * 0.62), c => {
                    const bx = cx - 74, by = wy + 1, bw = 148, bh = 30;
                    c.beginPath(); c.roundRect(bx, by, bw, bh, [2, 2, 9, 9]);
                    if (!emissive) {
                        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(bx + 3, by + bh, bw - 6, 3);
                        const g = LandmarkKit.grad(this, 'cc_board', () => { const q = c.createLinearGradient(bx, by, bx, by + bh); q.addColorStop(0, '#4a2a1a'); q.addColorStop(1, '#2a160d'); return q; });
                        c.fillStyle = g; c.fill(); c.strokeStyle = '#c99a52'; c.lineWidth = 1.4; c.stroke();
                        c.beginPath(); c.roundRect(bx + 3, by + 3, bw - 6, bh - 6, [1, 1, 7, 7]); c.strokeStyle = 'rgba(232,190,120,.25)'; c.lineWidth = 0.7; c.stroke();
                    } else { c.strokeStyle = 'rgba(255,190,90,.55)'; c.lineWidth = 1; c.stroke(); }
                    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '25px "Great Vibes", "URW Chancery L", "Z003", cursive';
                    c.fillStyle = emissive ? 'rgba(255,196,96,.95)' : '#ffbf4d'; c.fillText('Cozy Cafe', cx + 8, by + bh / 2 + 1);
                    // the cup
                    const ux = bx + 17, uy = by + bh / 2 + 3;
                    c.fillStyle = emissive ? 'rgba(255,214,150,.8)' : T.cream;
                    c.beginPath(); c.roundRect(ux - 6, uy - 4, 11, 8, [0, 0, 4, 4]); c.fill();
                    c.strokeStyle = c.fillStyle; c.lineWidth = 1.2; c.beginPath(); c.arc(ux + 6, uy, 2.4, -Math.PI / 2, Math.PI / 2); c.stroke();
                    c.lineWidth = 0.9; c.beginPath(); c.moveTo(ux - 2, uy - 6); c.quadraticCurveTo(ux - 4, uy - 9, ux - 2, uy - 12); c.moveTo(ux + 2, uy - 6); c.quadraticCurveTo(ux, uy - 9, ux + 2, uy - 12); c.stroke();
                });
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

            _ccDrawTop(ctx) {
                ctx.save();
                const faces = CONFIG.BUILDINGS.LEAN ? this._visibleFaces(game.camera) : [];
                for (const f of faces) this._ccFace(ctx, f, false);
                this._ccAwnings(ctx, false);
                this._ccDrawRoof(ctx, false);
                this._ccDrawTerrace(ctx, false);
                this._ccDrawChimney(ctx, false);
                ctx.restore();
            },

            _ccDrawEmissive(ctx, dark) {
                const glow = Math.max(0.12, Math.min(0.85, dark * 1.0));
                ctx.save(); ctx.globalAlpha *= glow; ctx.globalCompositeOperation = 'lighter';
                const faces = CONFIG.BUILDINGS.LEAN ? this._visibleFaces(game.camera) : [];
                for (const f of faces) this._ccFace(ctx, f, true);
                this._ccAwnings(ctx, true);
                this._ccDrawRoof(ctx, true);
                this._ccDrawTerrace(ctx, true);
                this._ccDrawChimney(ctx, true);
                ctx.restore();
            }
        });
