        /* =====================================================================
           BAY TOWER — an ornate rounded bay on a pale brick house (demo)
           ---------------------------------------------------------------------
           A rounded multi-storey bay in green-teal stone stands out of the
           middle of a pale brick front: mullioned windows lit warm inside,
           moulded cornice bands round the bay between floors (real ledges,
           projected, so they stand proud of the curve), recessed panels under
           them, and a carved crown: a lion's mask over the top window, rosette
           roundels in acanthus scrolls either side, volute consoles beside the
           window. The brick house has stone-framed windows with hoods and
           sills, quoins, string courses and a deep cornice.

           The bay's plan is a polygon (two short cheeks and a half-ellipse in
           facets), not a section rectangle: _leanFaces is overridden so the
           lean, visibility and culling see it. The whole bay is painted as ONE
           strip (unrolled round its faces) so the carving runs across the facet
           joints; each face maps its slice of the strip onto its leaning quad,
           tiled in z because the lean is a perspective. It leans twice as hard
           as the street (BTX.HERO, as Enni Cole does) so the storeys read.
           Collision stays the two section rectangles.
           ===================================================================== */
        const BTX = {
            HERO: 2,                                                  // lean multiplier (walls show this much taller)
            S_BAY: 4, S_BRICK: 3,                                     // facade art px per world px
            // plan (relative to the building's corner): the brick block W x D; the bay between bx0 and bx1,
            // cheeks `cheek` deep, then a half-ellipse `b` deep in n facets
            G: { W: 300, D: 180, bx0: 80, bx1: 220, cheek: 16, b: 54, n: 5 },
            // rows of the wall art, world px down from the top of the wall (H = 126)
            ROWS: { cap: 4, crown: 32, storeys: [[35, 52], [69, 86], [103, 119]], bands: [54, 88], panels: [[61, 66], [95, 100]], plinth: 121 },
            CHIMNEYS: [[36, 26, 26, 16], [238, 26, 26, 16]], CHIMNEY_Z: 16,
            C: {
                stone: '#40806f', stoneMid: '#336a5c', stoneLo: '#214b40', stoneDk: '#0e2622', stoneHi: '#9ad6bf', stoneLt: '#5f9e89',
                brick: '#ccc7b6', brickLo: '#b3ad9b', mortar: 'rgba(84, 80, 68, 0.32)', trim: '#e6e1d2', trimLo: '#a29c8d', trimDk: '#6f6a5f',
                roof: '#34373b', roofLo: '#22252a', frame: '#11171a', warm: '#ffcf8a'
            }
        };

        /** Relief: a cast shadow down-right, the face, and a lit rim along its upper-left inside edge. */
        function _btCarve(c, path, fill, hi = BTX.C.stoneHi, lo = BTX.C.stoneDk, o = 0.45) {
            c.save(); c.translate(o * 0.8, o); path(c); c.fillStyle = lo; c.fill(); c.restore();
            path(c); c.fillStyle = fill; c.fill();
            c.save(); path(c); c.clip(); c.translate(o, o * 1.1); path(c); c.lineWidth = o * 2; c.strokeStyle = hi; c.stroke(); c.restore();
        }
        const _btEllipse = (x, y, rx, ry, rot = 0) => (c) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };

        /** An acanthus leaf from (x, y), `len` long toward `ang`: three rounded lobes down each edge, the tip curling over, a midrib. */
        function _btLeaf(c, x, y, len, ang, w = 0.32, curl = 1) {
            const C = BTX.C, ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, py = ca;
            const pt = (t, s) => [x + ca * len * t + px * len * w * s, y + sa * len * t + py * len * w * s];
            const path = (q) => {
                q.beginPath(); q.moveTo(x, y);
                for (let i = 0; i < 3; i++) { const t0 = i / 3, t1 = (i + 1) / 3, a = 1.5 * (1 - t0 * 0.45); q.quadraticCurveTo(...pt((t0 + t1) / 2, a), ...pt(t1, 0.35 * (1 - t1) + 0.12)); }
                q.quadraticCurveTo(...pt(1.18, 0.5 * curl), ...pt(1.02, 0.85 * curl));                                   // the tip curls over
                q.quadraticCurveTo(...pt(0.98, 0.2 * curl), ...pt(0.94, -0.1));
                for (let i = 2; i >= 0; i--) { const t0 = i / 3, t1 = (i + 1) / 3, a = -1.3 * (1 - t0 * 0.45); q.quadraticCurveTo(...pt((t0 + t1) / 2, a), ...pt(t0, i ? -0.35 * (1 - t0) - 0.12 : 0)); }
                q.closePath();
            };
            _btCarve(c, path, C.stone, C.stoneHi, C.stoneDk, Math.min(0.5, len * 0.05));
            c.strokeStyle = C.stoneLo; c.lineWidth = Math.max(0.25, len * 0.03); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(...pt(0.5, 0.1), ...pt(0.92, 0.25 * curl)); c.stroke();
        }

        /** A spiral scroll round (x, y): outer radius r, turning `dir` (1 clockwise), opening toward `ang`; leaves on its outer turn. */
        function _btScroll(c, x, y, r, dir, ang) {
            const C = BTX.C, pts = [];
            for (let t = 0; t <= 2.6 * Math.PI; t += 0.12) { const rr = r * (1 - t / (3.1 * Math.PI)), a = ang + dir * t; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
            const tube = (w, col, dx = 0, dy = 0) => { c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px + dx, py + dy) : c.moveTo(px + dx, py + dy)); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); };
            tube(r * 0.3, C.stoneDk, 0.4, 0.5); tube(r * 0.26, C.stone); tube(r * 0.08, C.stoneHi, -0.3, -0.35);
            for (let i = 0; i < 4; i++) { const t = 0.3 + i * 0.42, a = ang + dir * t, rr = r * (1 - t / (3.1 * Math.PI)); _btLeaf(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.55, a + dir * 1.1, 0.3); }
        }

        /** A rosette: a moulded ring, eight petals, a boss. */
        function _btRosette(c, x, y, r) {
            const C = BTX.C;
            _btCarve(c, _btEllipse(x, y, r, r), C.stoneMid);
            _btCarve(c, _btEllipse(x, y, r * 0.78, r * 0.78), C.stoneLo, C.stoneLt);
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; _btCarve(c, _btEllipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.3, r * 0.17, a), C.stone, C.stoneHi, C.stoneDk, 0.3); }
            _btCarve(c, _btEllipse(x, y, r * 0.22, r * 0.22), C.stoneLt, '#c8eadf', C.stoneDk, 0.3);
        }

        /** The lion's mask: a flame-lobed mane, a furrowed brow, deep eyes, broad nose and muzzle, the mouth a shadow. */
        function _btLion(c, x, y, R) {
            const C = BTX.C;
            c.fillStyle = 'rgba(8, 18, 18, 0.55)'; c.beginPath(); c.ellipse(x + 0.6, y + 0.9, R * 1.08, R * 1.02, 0, 0, Math.PI * 2); c.fill();
            for (const [n, rr, sz, off] of [[18, 0.82, 0.3, 0], [14, 0.62, 0.24, 0.2]]) {
                for (let k = 0; k < n; k++) {
                    const a = -Math.PI / 2 + (k + off) * Math.PI * 2 / n, sw = Math.sin(k * 1.7) * 0.25;
                    _btCarve(c, _btEllipse(x + Math.cos(a) * R * rr, y + Math.sin(a) * R * rr * 0.96, R * sz, R * sz * 0.5, a + sw), k % 2 ? C.stone : C.stoneMid, C.stoneHi, C.stoneDk, 0.35);
                }
            }
            _btCarve(c, _btEllipse(x, y + R * 0.06, R * 0.52, R * 0.6), C.stoneMid);                                   // the face
            _btCarve(c, (q) => { q.beginPath(); q.moveTo(x - R * 0.52, y - R * 0.1); q.quadraticCurveTo(x - R * 0.26, y - R * 0.42, x, y - R * 0.2);    // the brow
                q.quadraticCurveTo(x + R * 0.26, y - R * 0.42, x + R * 0.52, y - R * 0.1); q.lineTo(x + R * 0.46, y - R * 0.01);
                q.quadraticCurveTo(x + R * 0.24, y - R * 0.24, x, y - R * 0.08); q.quadraticCurveTo(x - R * 0.24, y - R * 0.24, x - R * 0.46, y - R * 0.01); q.closePath(); }, C.stoneLt);
            for (const s of [-1, 1]) {                                                                                    // eyes, deep under the brow
                c.fillStyle = C.stoneDk; c.beginPath(); c.ellipse(x + s * R * 0.23, y - R * 0.02, R * 0.12, R * 0.055, s * 0.32, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(190, 230, 215, 0.55)'; c.beginPath(); c.arc(x + s * R * 0.2, y - R * 0.03, R * 0.022, 0, Math.PI * 2); c.fill();
            }
            _btCarve(c, (q) => { q.beginPath(); q.moveTo(x - R * 0.08, y - R * 0.16); q.lineTo(x + R * 0.08, y - R * 0.16);              // the nose
                q.lineTo(x + R * 0.2, y + R * 0.2); q.quadraticCurveTo(x, y + R * 0.3, x - R * 0.2, y + R * 0.2); q.closePath(); }, C.stoneLt);
            c.fillStyle = C.stoneDk; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * R * 0.09, y + R * 0.2, R * 0.05, R * 0.03, 0, 0, Math.PI * 2); c.fill(); }
            for (const s of [-1, 1]) _btCarve(c, _btEllipse(x + s * R * 0.15, y + R * 0.34, R * 0.19, R * 0.14), C.stone);   // the muzzle
            c.fillStyle = C.stoneDk; c.beginPath(); c.ellipse(x, y + R * 0.47, R * 0.2, R * 0.06, 0, 0, Math.PI); c.fill();       // the mouth
            c.fillStyle = C.stoneLt; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * R * 0.12, y + R * 0.46); c.lineTo(x + s * R * 0.09, y + R * 0.53); c.lineTo(x + s * R * 0.06, y + R * 0.46); c.fill(); }
            _btCarve(c, _btEllipse(x, y + R * 0.6, R * 0.14, R * 0.08), C.stoneMid);                                    // the chin
            c.fillStyle = C.stoneDk; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + s * R * (0.2 + i * 0.05), y + R * (0.3 + i * 0.03), R * 0.015, 0, Math.PI * 2); c.fill(); }
        }

        /** A volute console down a pier: a scroll at the top, a smaller one at the foot, a leafed band between. */
        function _btConsole(c, x, y0, y1, s) {
            const C = BTX.C, h = y1 - y0, path = (q) => { q.beginPath(); q.moveTo(x - 1.6, y0 + 2); q.bezierCurveTo(x + s * 3, y0 + h * 0.3, x - s * 2, y0 + h * 0.7, x - 0.8, y1 - 1.5);
                q.lineTo(x + 0.8, y1 - 1.5); q.bezierCurveTo(x - s * 0.6, y0 + h * 0.7, x + s * 4.6, y0 + h * 0.3, x + 1.6, y0 + 2); q.closePath(); };
            _btCarve(c, path, C.stone);
            _btScroll(c, x, y0 + 2.6, 2.8, s, Math.PI / 2);
            _btScroll(c, x, y1 - 2, 1.7, -s, -Math.PI / 2);
            _btLeaf(c, x + s * 0.6, y0 + h * 0.42, h * 0.28, Math.PI / 2 + s * 0.3, 0.38);
        }

        /**
         * A mullioned window into the day (d) and lit (l) layers: a stone reveal, dark frames in 2 x 3 lights with a transom,
         * the room inside (a lamp, a bed's end, shelves) in silhouette; lit, the glass glows warm round them.
         */
        function _btWindow(d, l, x0, y0, x1, y1, lit, r, stone) {
            const C = BTX.C, W = x1 - x0, H = y1 - y0;
            // the reveal and its architrave
            d.fillStyle = stone ? C.stoneDk : C.trimDk; d.fillRect(x0 - 1.1, y0 - 1.1, W + 2.2, H + 2.2);
            d.fillStyle = stone ? C.stoneHi : '#fffaf0'; d.fillRect(x0 - 1.5, y0 - 1.5, W + 3, 0.5); d.fillRect(x0 - 1.5, y0 - 1.5, 0.5, H + 3);
            d.fillStyle = stone ? C.stoneLo : C.trimLo; d.fillRect(x0 - 1.5, y1 + 1, W + 3, 0.5); d.fillRect(x1 + 1, y0 - 1.5, 0.5, H + 3);
            // the glass: the room in it by day, the sky's sheen on it
            const g = d.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#2a3a42'); g.addColorStop(1, '#1b262c'); d.fillStyle = g; d.fillRect(x0, y0, W, H);
            d.fillStyle = 'rgba(190, 220, 230, 0.13)'; d.beginPath(); d.moveTo(x0, y0); d.lineTo(x0 + W * 0.55, y0); d.lineTo(x0, y0 + H * 0.75); d.fill();
            const lampX = x0 + W * (r() < 0.5 ? 0.22 : 0.78), bedY = y0 + H * 0.68;
            const room = (c, col) => {
                c.fillStyle = col;
                c.fillRect(x0 + W * 0.15, bedY, W * 0.7, H * 0.32);                                                          // a bed's end, a quilt over it
                c.beginPath(); c.moveTo(lampX - W * 0.08, y0 + H * 0.5); c.lineTo(lampX + W * 0.08, y0 + H * 0.5); c.lineTo(lampX + W * 0.05, y0 + H * 0.38); c.lineTo(lampX - W * 0.05, y0 + H * 0.38); c.fill();   // a lamp's shade
                c.fillRect(lampX - 0.25, y0 + H * 0.5, 0.5, H * 0.18);
                if (r() < 0.6) c.fillRect(x0 + W * (lampX < x0 + W / 2 ? 0.6 : 0.08), y0 + H * 0.2, W * 0.32, 0.6);         // a shelf
            };
            room(d, 'rgba(12, 16, 18, 0.45)');
            if (lit) {
                const lg = l.createLinearGradient(0, y0, 0, y1); lg.addColorStop(0, 'rgba(255, 168, 92, 0.6)'); lg.addColorStop(1, 'rgba(255, 206, 130, 0.95)');
                l.fillStyle = lg; l.fillRect(x0, y0, W, H);
                const rg = l.createRadialGradient(lampX, y0 + H * 0.45, 0, lampX, y0 + H * 0.45, W * 0.6); rg.addColorStop(0, 'rgba(255, 244, 210, 0.95)'); rg.addColorStop(1, 'rgba(255, 220, 160, 0)');
                l.fillStyle = rg; l.fillRect(x0, y0, W, H);
                l.save(); l.globalCompositeOperation = 'destination-out'; room(l, 'rgba(0, 0, 0, 0.55)'); l.restore();
                // the light on the sill and the stone round it
                const sg = l.createLinearGradient(0, y1, 0, y1 + 3); sg.addColorStop(0, 'rgba(255, 200, 130, 0.45)'); sg.addColorStop(1, 'rgba(255, 200, 130, 0)');
                l.fillStyle = sg; l.fillRect(x0 - 1, y1, W + 2, 3);
            }
            // the frames: 2 lights across, a transom, 3 rows
            const bars = (c, col) => {
                c.fillStyle = col;
                c.fillRect(x0, y0, W, 0.8); c.fillRect(x0, y1 - 0.8, W, 0.8); c.fillRect(x0, y0, 0.8, H); c.fillRect(x1 - 0.8, y0, 0.8, H);
                c.fillRect(x0 + W / 2 - 0.4, y0 + H * 0.24, 0.8, H * 0.76);
                c.fillRect(x0, y0 + H * 0.24 - 0.45, W, 0.9);
                c.fillRect(x0, y0 + H * 0.62 - 0.3, W, 0.6);
                for (const u of [1 / 3, 2 / 3]) c.fillRect(x0 + W * u - 0.25, y0, 0.5, H * 0.24);
            };
            bars(d, C.frame);
            if (lit) { l.save(); l.globalCompositeOperation = 'destination-out'; bars(l, '#000'); l.restore(); }
        }

        class BayTowerBuilding extends BuildingV2 {
            _setupSign() { this.attachedSign = null; }
            _generateLights() {
                // warm light washing up the bay from the pavement, and the two door lamps of the brick house
                const X = this.x, Y = this.y;
                for (const [dx, dy, color, r] of [[150, 268, '#ffd29a', 170], [36, 194, '#ffe2b4', 110], [264, 194, '#ffe2b4', 110]]) {
                    const lamp = new LampEntity({ x: X + dx, y: Y + dy, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; this.attachedLights.push(lamp);
                }
                this.topReach = 60; this.glowReach = 60;
            }

            _btH() { return Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT; }
            _btK(z) { if (!CONFIG.BUILDINGS.LEAN) return 1; const C = leanCamHeight(); return 1 + (C / (C - Math.min(z, C * 0.86)) - 1) * BTX.HERO; }
            _btP(x, y, z) { const k = this._btK(z), c = game.camera; return [c.x + (x - c.x) * k, c.y + (y - c.y) * k]; }
            _hullK() { return Math.max(super._hullK(), this._btK(this._btH() + BTX.CHIMNEY_Z + CONFIG.CULLING.LEAN_EXTRA * CONFIG.BUILDINGS.FLOOR_HEIGHT)); }

            /** The plan: the brick block's walls and the bay's (cheeks, then the half-ellipse in facets), each face left to right seen from outside. */
            _btGeo() {
                if (this._bt && this._bt.x === this.x && this._bt.y === this.y) return this._bt;
                const G = BTX.G, X = this.x, Y = this.y, wy = Y + G.D, ey = wy + G.cheek, cx = X + (G.bx0 + G.bx1) / 2, a = (G.bx1 - G.bx0) / 2;
                const V = [[X + G.bx0, wy], [X + G.bx0, ey]];
                for (let i = 1; i < G.n; i++) { const t = Math.PI - i * Math.PI / G.n; V.push([cx + a * Math.cos(t), ey + G.b * Math.sin(t)]); }
                V.push([X + G.bx1, ey], [X + G.bx1, wy]);
                const face = (x1, y1, x2, y2, side, part, section) => { const L = Math.hypot(x2 - x1, y2 - y1); return { side, part, section, x1, y1, x2, y2, L, nx: -(y2 - y1) / L, ny: (x2 - x1) / L }; };
                const bay = [];
                let u = 0;
                for (let i = 0; i < V.length - 1; i++) {
                    const side = i === 0 ? 'W' : i === V.length - 2 ? 'E' : 'C';
                    const f = face(V[i][0], V[i][1], V[i + 1][0], V[i + 1][1], side, 'bay', 1); f.u0 = u; f.i = i; u += f.L; bay.push(f);
                }
                const brick = [
                    face(X, wy, X + G.bx0, wy, 'S', 'brick', 0), face(X + G.bx1, wy, X + G.W, wy, 'S', 'brick', 0),
                    face(X + G.W, wy, X + G.W, Y, 'E', 'brick', 0), face(X, Y, X, wy, 'W', 'brick', 0), face(X + G.W, Y, X, Y, 'N', 'brick', 0)
                ];
                return (this._bt = { x: X, y: Y, V, bay, brick, faces: brick.concat(bay), bayL: u, cx, wy, front: bay[Math.floor(bay.length / 2)] });
            }
            _leanFaces() { return this._btGeo().faces; }

            /** A face's art, mapped onto its leaning quad in tiles (u along it, z up), from the strip `tex` at x offset u0. */
            _btMap(ctx, f, tex, S, u0, base) {
                const H = this._btH(), L = f.L, nu = Math.max(1, Math.ceil(L / 36)), ZS = [0, 0.1, 0.21, 0.33, 0.45, 0.57, 0.69, 0.8, 0.9, 1];
                const P = (u, z) => this._btP(f.x1 + (f.x2 - f.x1) * u, f.y1 + (f.y2 - f.y1) * u, z);
                if (base) { this._btQuad(ctx, f, 0, H); ctx.fillStyle = base; ctx.fill(); }
                const ov = base ? S : 0.5;            // tiles overlap a world px (no seams); the additive glow barely, or the overlaps glow twice
                for (let j = 0; j < ZS.length - 1; j++) for (let i = 0; i < nu; i++) {
                    const ua = i / nu, ub = (i + 1) / nu, z0 = ZS[j] * H, z1 = ZS[j + 1] * H;
                    const a = P(ua, z0), b = P(ub, z0), d = P(ua, z1);
                    const sx = (u0 + ua * L) * S, sw = Math.min(tex.width - sx, (ub - ua) * L * S + ov), sy = (H - z1) * S, sh = Math.min(tex.height - sy, (z1 - z0) * S + ov);
                    ctx.save();
                    ctx.transform((b[0] - a[0]) / ((ub - ua) * L * S), (b[1] - a[1]) / ((ub - ua) * L * S), (a[0] - d[0]) / ((z1 - z0) * S), (a[1] - d[1]) / ((z1 - z0) * S), d[0], d[1]);
                    ctx.drawImage(tex, sx, sy, sw, sh, 0, 0, sw, sh);
                    ctx.restore();
                }
            }
            _btQuad(ctx, f, z0, z1) {
                const a = this._btP(f.x1, f.y1, z0), b = this._btP(f.x2, f.y2, z0), c = this._btP(f.x2, f.y2, z1), d = this._btP(f.x1, f.y1, z1);
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
            }
            /** How much a face turns from the light (moon or sun, from the west and the street): 0 lit .. 1 turned away. */
            _btTurn(f) { const lx = -0.78, ly = 0.62; return Math.max(0, Math.min(1, 0.5 - 0.5 * (f.nx * lx + f.ny * ly))); }

            /** The whole bay, unrolled: one strip of art (day, lit) round its faces, so the carving runs across the joints. */
            _btBayArt() {
                if (this._btBay) return this._btBay;
                const g = this._btGeo(), C = BTX.C, R = BTX.ROWS, S = BTX.S_BAY, H = this._btH(), L = g.bayL, r = seededRandom(9491);
                const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.ceil(L * S); cv.height = Math.ceil(H * S); const c = cv.getContext('2d'); c.scale(S, S); return [cv, c]; };
                const [dcv, d] = mk(), [lcv, l] = mk();
                // the stone, a little darker low down; faint ashlar joints; weathering
                { const gr = d.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, C.stone); gr.addColorStop(1, C.stoneMid); d.fillStyle = gr; d.fillRect(0, 0, L, H); }
                d.strokeStyle = 'rgba(16, 36, 36, 0.22)'; d.lineWidth = 0.3; d.beginPath();
                for (let y = R.crown + 3; y < R.plinth; y += 4.5) { d.moveTo(0, y); d.lineTo(L, y); }
                d.stroke();
                for (let i = 0; i < L * H / 6; i++) { d.fillStyle = r() < 0.5 ? 'rgba(10, 30, 30, 0.08)' : 'rgba(190, 230, 220, 0.06)'; d.fillRect(r() * L, r() * H, 0.5 + r() * 0.8, 0.5 + r() * 1.6); }
                const facets = g.bay.filter(f => f.side === 'C'), mid = Math.floor(facets.length / 2);
                // the cheeks: a tall recessed panel each
                for (const f of g.bay.filter(f => f.side !== 'C')) {
                    const x0 = f.u0 + 3, x1 = f.u0 + f.L - 3;
                    for (const [y0, y1] of R.storeys) { d.fillStyle = C.stoneLo; d.fillRect(x0, y0, x1 - x0, y1 - y0); d.fillStyle = C.stoneHi; d.fillRect(x0, y1 - 0.4, x1 - x0, 0.4); d.fillRect(x1 - 0.4, y0, 0.4, y1 - y0); d.fillStyle = C.stoneDk; d.fillRect(x0, y0, x1 - x0, 0.5); d.fillRect(x0, y0, 0.5, y1 - y0); }
                }
                // each facet: a window a storey, recessed panels under the bands, piers with sunk channels between
                facets.forEach((f, i) => {
                    const pier = Math.max(4, f.L * 0.15), x0 = f.u0 + pier, x1 = f.u0 + f.L - pier;
                    R.storeys.forEach(([y0, y1], s) => _btWindow(d, l, x0, y0, x1, y1, !(s === 2 && i === 0) && !(s === 1 && i === facets.length - 1) && r() < 0.92, r, true));
                    for (const [y0, y1] of R.panels) {
                        d.fillStyle = C.stoneMid; d.fillRect(x0, y0, x1 - x0, y1 - y0);
                        d.fillStyle = C.stoneDk; d.fillRect(x0, y0, x1 - x0, 0.5); d.fillRect(x0, y0, 0.5, y1 - y0);
                        d.fillStyle = C.stoneHi; d.fillRect(x0, y1 - 0.4, x1 - x0, 0.4); d.fillRect(x1 - 0.4, y0, 0.4, y1 - y0);
                        d.strokeStyle = 'rgba(150, 200, 190, 0.35)'; d.lineWidth = 0.3; d.strokeRect(x0 + 2, y0 + 1.5, x1 - x0 - 4, y1 - y0 - 3);
                    }
                    for (const X of [f.u0 + pier / 2, f.u0 + f.L - pier / 2]) {
                        d.fillStyle = 'rgba(14, 32, 32, 0.4)'; d.fillRect(X - 0.35, R.crown + 2, 0.7, R.plinth - R.crown - 4);
                        d.fillStyle = 'rgba(170, 220, 205, 0.18)'; d.fillRect(X + 0.35, R.crown + 2, 0.35, R.plinth - R.crown - 4);
                    }
                    // a carved keystone over the lower windows
                    for (const [y0] of R.storeys.slice(1)) _btCarve(d, (q) => { const xc = (x0 + x1) / 2; q.beginPath(); q.moveTo(xc - 1.6, y0 - 2.2); q.lineTo(xc + 1.6, y0 - 2.2); q.lineTo(xc + 1.1, y0 + 1); q.lineTo(xc - 1.1, y0 + 1); q.closePath(); }, C.stoneLt, C.stoneHi, C.stoneDk, 0.3);
                });
                // the moulded bands between floors (the ledges stand proud of them, _btLedges), the crown's bead, the plinth
                const band = (y, h) => { d.fillStyle = C.stoneLt; d.fillRect(0, y, L, h * 0.35); d.fillStyle = C.stone; d.fillRect(0, y + h * 0.35, L, h * 0.35); d.fillStyle = C.stoneLo; d.fillRect(0, y + h * 0.7, L, h * 0.3); d.fillStyle = 'rgba(8, 20, 20, 0.45)'; d.fillRect(0, y + h, L, 1.2); };
                for (const y of R.bands) band(y, 6);
                band(R.crown, 2.5);
                d.fillStyle = C.stoneLo; d.fillRect(0, R.plinth, L, H - R.plinth); d.fillStyle = C.stoneLt; d.fillRect(0, R.plinth, L, 0.6);
                // the crown: a sunk field, then the carving — the lion over the front window, rosettes in scrolls either side, a garland of acanthus
                d.fillStyle = 'rgba(10, 26, 26, 0.35)'; d.fillRect(0, R.cap, L, R.crown - R.cap);
                const fm = facets[mid], lx = fm.u0 + fm.L / 2, ly = (R.cap + R.crown) / 2 + 0.5;
                for (let x = 3; x < L; x += 9) { const dn = Math.round(x / 9) % 2; if (Math.abs(x - lx) < 18) continue; _btLeaf(d, x, R.crown - 2, 9, dn ? -0.3 : Math.PI + 0.3, 0.3, dn ? -1 : 1); }
                facets.forEach((f, i) => {
                    if (i === mid) return;
                    const xc = f.u0 + f.L / 2, s = i < mid ? 1 : -1, near = Math.abs(i - mid) === 1, rr = near ? 9 : 7.5;
                    _btScroll(d, xc, ly, rr * 1.15, s, s > 0 ? 0 : Math.PI);
                    _btRosette(d, xc, ly, rr * 0.62);
                    _btLeaf(d, xc + s * rr * 1.1, ly + 2, rr * 1.4, s > 0 ? -0.35 : Math.PI + 0.35, 0.3);
                    _btLeaf(d, xc - s * rr * 1.05, ly - 3, rr * 1.1, s > 0 ? Math.PI + 0.6 : -0.6, 0.28);
                });
                for (const s of [-1, 1]) { _btLeaf(d, lx + s * 11, ly + 6, 12, s > 0 ? -0.45 : Math.PI + 0.45, 0.32, -s); _btLeaf(d, lx + s * 10, ly - 6, 11, s > 0 ? 0.35 : Math.PI - 0.35, 0.3, s); }
                _btLion(d, lx, ly + 1, 13.5);
                // volute consoles down the piers beside the top windows
                facets.forEach((f) => { const pier = Math.max(4, f.L * 0.15); _btConsole(d, f.u0 + pier * 0.55, R.crown + 1, R.storeys[0][1] - 2, 1); _btConsole(d, f.u0 + f.L - pier * 0.55, R.crown + 1, R.storeys[0][1] - 2, -1); });
                // the cap: a cyma moulding and a row of dentils
                d.fillStyle = C.stoneLt; d.fillRect(0, 0, L, 1.6); d.fillStyle = C.stone; d.fillRect(0, 1.6, L, 1.2); d.fillStyle = C.stoneLo; d.fillRect(0, 2.8, L, R.cap - 2.8);
                d.fillStyle = C.stoneLt; for (let x = 0.6; x < L; x += 2.2) d.fillRect(x, 2.9, 1.1, 1);
                // lit: the windows' warmth catches the carving above the front window, and the stone round the lit lights
                { const gl = l.createRadialGradient(lx, R.storeys[0][0], 0, lx, R.storeys[0][0], 20); gl.addColorStop(0, 'rgba(255, 190, 120, 0.2)'); gl.addColorStop(1, 'rgba(255, 190, 120, 0)'); l.fillStyle = gl; l.fillRect(lx - 22, R.cap, 44, 28); }
                // the stone keeps a little of its own colour at night (the grade would leave it grey-blue): a faint copy of the day art
                l.save(); l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-over'; l.globalAlpha = 0.2; l.drawImage(dcv, 0, 0); l.restore();
                return (this._btBay = { day: dcv, lit: lcv, S });
            }

            /** A brick face: pale brick, quoins, stone-framed windows with hoods and sills, string courses, the cornice. */
            _btBrickArt(f) {
                const store = this._btBricks || (this._btBricks = {}), key = `${f.x1 | 0},${f.y1 | 0},${f.x2 | 0},${f.y2 | 0}`;
                if (store[key]) return store[key];
                const C = BTX.C, R = BTX.ROWS, S = BTX.S_BRICK, H = this._btH(), L = f.L, r = seededRandom(((f.x1 * 7 + f.y1 * 13) | 0) + 77);
                const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.ceil(L * S); cv.height = Math.ceil(H * S); const c = cv.getContext('2d'); c.scale(S, S); return [cv, c]; };
                const [dcv, d] = mk(), [lcv, l] = mk();
                { const gr = d.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, C.brick); gr.addColorStop(1, C.brickLo); d.fillStyle = gr; d.fillRect(0, 0, L, H); }
                for (let y = 7, k = 0; y < R.plinth; y += 2.4, k++) for (let x = (k % 2) * -2.6; x < L; x += 5.2) { if (r() < 0.3) { d.fillStyle = r() < 0.5 ? 'rgba(120, 110, 90, 0.12)' : 'rgba(255, 252, 240, 0.12)'; d.fillRect(x, y, 5.2, 2.4); } }
                d.strokeStyle = C.mortar; d.lineWidth = 0.28; d.beginPath();
                for (let y = 7, k = 0; y < R.plinth; y += 2.4, k++) { d.moveTo(0, y); d.lineTo(L, y); for (let x = (k % 2) * 2.6; x < L; x += 5.2) { d.moveTo(x, y); d.lineTo(x, y + 2.4); } }
                d.stroke();
                // quoins at the corners
                for (const X of [0, L - 5]) for (let y = 7, k = 0; y < R.plinth - 4; y += 4.8, k++) { const w = k % 2 ? 4 : 5.5, x = X ? L - w : 0; d.fillStyle = C.trim; d.fillRect(x, y, w, 4.4); d.fillStyle = C.trimLo; d.fillRect(x, y + 4, w, 0.4); }
                // string courses, the plinth
                for (const y of R.bands) { d.fillStyle = C.trim; d.fillRect(0, y, L, 3); d.fillStyle = '#fffaf0'; d.fillRect(0, y, L, 0.5); d.fillStyle = 'rgba(60, 56, 46, 0.35)'; d.fillRect(0, y + 3, L, 1); }
                d.fillStyle = C.trimLo; d.fillRect(0, R.plinth, L, H - R.plinth); d.fillStyle = C.trim; d.fillRect(0, R.plinth, L, 0.6);
                // the windows, framed in stone: a hood with a keystone over each, a sill under
                const n = Math.max(1, Math.floor(L / 38)), ww = 14;
                for (let i = 0; i < n; i++) {
                    const xc = (i + 0.5) * L / n, x0 = xc - ww / 2, x1 = xc + ww / 2;
                    R.storeys.forEach(([y0, y1]) => {
                        d.fillStyle = C.trim; d.fillRect(x0 - 2.4, y0 - 2.4, ww + 4.8, y1 - y0 + 4.8);
                        d.fillStyle = '#fffaf0'; d.fillRect(x0 - 2.4, y0 - 2.4, ww + 4.8, 0.5); d.fillStyle = C.trimLo; d.fillRect(x1 + 1.9, y0 - 2.4, 0.5, y1 - y0 + 4.8);
                        _btWindow(d, l, x0, y0, x1, y1, r() < 0.55, r, false);
                        d.fillStyle = C.trim; d.fillRect(x0 - 4, y0 - 5.4, ww + 8, 2.6); d.fillStyle = '#fffaf0'; d.fillRect(x0 - 4, y0 - 5.4, ww + 8, 0.5);
                        d.fillStyle = 'rgba(60, 56, 46, 0.4)'; d.fillRect(x0 - 4, y0 - 2.8, ww + 8, 0.5);
                        d.fillStyle = C.trim; d.fillRect(xc - 1.4, y0 - 5.8, 2.8, 4); d.fillStyle = C.trimLo; d.fillRect(xc + 1, y0 - 5.8, 0.4, 4);
                        d.fillStyle = C.trim; d.fillRect(x0 - 3.2, y1 + 2.4, ww + 6.4, 1.6); d.fillStyle = 'rgba(60, 56, 46, 0.45)'; d.fillRect(x0 - 3.2, y1 + 4, ww + 6.4, 0.8);
                    });
                }
                // the cornice: a deep moulding with modillions under its lip
                d.fillStyle = C.trim; d.fillRect(0, 0, L, 6); d.fillStyle = '#fffaf0'; d.fillRect(0, 0, L, 0.8);
                d.fillStyle = C.trimLo; d.fillRect(0, 3.2, L, 0.4);
                for (let x = 1; x < L; x += 3.4) { d.fillStyle = C.trim; d.fillRect(x, 6, 1.6, 1.6); d.fillStyle = 'rgba(60, 56, 46, 0.4)'; d.fillRect(x, 7.6, 1.6, 0.5); }
                d.fillStyle = 'rgba(60, 56, 46, 0.35)'; d.fillRect(0, 6, L, 0.4);
                return (store[key] = { day: dcv, lit: lcv, S });
            }

            /**
             * Ledges round the bay at height z (`out` proud, `th` thick), mitred at the facet joints so the band runs
             * unbroken round the curve; each facet's front shaded by how it turns from the light.
             */
            _btLedges(ctx, faces, z, out, th, emissive) {
                const g = this._btGeo(), V = g.V, C = BTX.C, n = g.bay.length, kT = this._btK(z), kB = this._btK(z - th), cam = game.camera;
                const O = V.map((v, i) => {
                    const fa = g.bay[Math.max(0, i - 1)], fb = g.bay[Math.min(n - 1, i)];
                    if (i === 0) return [v[0] + fb.nx * out, v[1] + fb.ny * out];
                    if (i === n) return [v[0] + fa.nx * out, v[1] + fa.ny * out];
                    let mx = fa.nx + fb.nx, my = fa.ny + fb.ny; const m = Math.hypot(mx, my); mx /= m; my /= m;
                    const s = out / Math.max(0.5, mx * fa.nx + my * fa.ny); return [v[0] + mx * s, v[1] + my * s];
                });
                const p = (x, y, k) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                for (const f of faces) {
                    const i = f.i, a = V[i], b = V[i + 1], oa = O[i], ob = O[i + 1];
                    const A = p(oa[0], oa[1], kB), B = p(ob[0], ob[1], kB), Bt = p(ob[0], ob[1], kT), At = p(oa[0], oa[1], kT), a1 = p(a[0], a[1], kT), b1 = p(b[0], b[1], kT);
                    const t = this._btTurn(f);
                    if (!emissive) {
                        ctx.fillStyle = `rgb(${Math.round(82 - 50 * t)}, ${Math.round(138 - 78 * t)}, ${Math.round(120 - 66 * t)})`;
                        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(At[0], At[1]); ctx.closePath(); ctx.fill();
                        ctx.fillStyle = C.stoneLt; ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(At[0], At[1]); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = `rgba(200, 240, 228, ${0.75 - 0.5 * t})`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(At[0], At[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.stroke();
                        ctx.strokeStyle = 'rgba(6, 16, 16, 0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
                    }
                }
            }

            /** The brick block's ledges (string courses, the cornice) along its visible walls, in its own lean. */
            _btBrickLedges(ctx, faces) {
                const H = this._btH(), C = BTX.C, edges = faces.map(f => ({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny }));
                LandmarkKit.using((z) => this._btK(z), () => {
                    for (const y of BTX.ROWS.bands) LandmarkKit.ledge(ctx, edges, H - y, 1.6, 3, C.trim, C.brickLo, '#fffaf0');
                    LandmarkKit.ledge(ctx, edges, H, 5, 6, '#efeadc', C.trim, '#ffffff');
                });
            }

            /** The roofs (one plane, the top of the walls): tar and gravel in a stone parapet, a skylight; the bay's
                ribbed teal cap and its finial; the cornice's top round both. */
            _btRoofSprite(emissive) {
                const G = BTX.G, g = this._btGeo(), C = BTX.C, X = this.x, Y = this.y;
                return LandmarkKit.sprite(this, emissive ? 'bt_roof_lit' : 'bt_roof', X - 12, Y - 12, G.W + 24, G.D + G.cheek + G.b + 24, 2, (c) => {
                    const sky = [X + 118, Y + 58, 64, 40];
                    if (emissive) {
                        c.fillStyle = 'rgba(255, 200, 130, 0.55)'; c.fillRect(...sky);
                        const rg = c.createRadialGradient(sky[0] + 32, sky[1] + 20, 0, sky[0] + 32, sky[1] + 20, 50); rg.addColorStop(0, 'rgba(255, 200, 130, 0.25)'); rg.addColorStop(1, 'rgba(255, 200, 130, 0)');
                        c.fillStyle = rg; c.fillRect(sky[0] - 20, sky[1] - 30, 104, 100);
                        return;
                    }
                    const r = seededRandom(1207);
                    { const gr = c.createLinearGradient(X, Y, X + G.W, Y + G.D); gr.addColorStop(0, C.roof); gr.addColorStop(1, C.roofLo); c.fillStyle = gr; c.fillRect(X, Y, G.W, G.D); }
                    for (let i = 0; i < 1400; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.12)'; c.fillRect(X + r() * G.W, Y + r() * G.D, 1, 1); }
                    c.fillStyle = '#1c2a33'; c.fillRect(...sky); c.strokeStyle = C.trimLo; c.lineWidth = 2; c.strokeRect(...sky);
                    c.strokeStyle = 'rgba(200, 220, 230, 0.25)'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(sky[0] + i * 16, sky[1]); c.lineTo(sky[0] + i * 16, sky[1] + 40); } c.stroke();
                    // the bay's cap: teal copper in ribs from the wall to each corner of the curve
                    const bayPath = () => { c.beginPath(); g.V.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };
                    bayPath(); const dg = c.createRadialGradient(g.cx - 14, g.wy + 14, 4, g.cx, g.wy + 20, 80); dg.addColorStop(0, '#46625f'); dg.addColorStop(0.6, '#2e4544'); dg.addColorStop(1, '#1c2c2c'); c.fillStyle = dg; c.fill();
                    for (const [x, y] of g.V.slice(1, -1)) { c.strokeStyle = 'rgba(10, 24, 24, 0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(g.cx, g.wy + 4); c.lineTo(x, y); c.stroke(); c.strokeStyle = 'rgba(170, 220, 205, 0.5)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(g.cx - 1, g.wy + 4); c.lineTo(x - 1, y - 1); c.stroke(); }
                    // the cornice's top: the brick house's round the block (not across the bay), the bay's round its curve
                    const main = () => { c.beginPath(); c.moveTo(X + G.bx0, g.wy); c.lineTo(X, g.wy); c.lineTo(X, Y); c.lineTo(X + G.W, Y); c.lineTo(X + G.W, g.wy); c.lineTo(X + G.bx1, g.wy); };
                    main(); c.lineJoin = 'miter'; c.strokeStyle = '#efeadc'; c.lineWidth = 10; c.stroke(); main(); c.strokeStyle = C.trimLo; c.lineWidth = 1; c.stroke();
                    c.strokeStyle = 'rgba(0, 0, 0, 0.35)'; c.lineWidth = 2; c.strokeRect(X + 6, Y + 6, G.W - 12, G.D - 12);
                    c.beginPath(); g.V.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.lineJoin = 'round'; c.strokeStyle = C.stoneLt; c.lineWidth = 14; c.stroke();
                    c.beginPath(); g.V.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = 'rgba(200, 240, 228, 0.6)'; c.lineWidth = 1; c.stroke();
                    // the finial on the cap
                    c.fillStyle = '#22423e'; c.beginPath(); c.arc(g.cx, g.wy + 12, 5, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#8cc4b6'; c.beginPath(); c.arc(g.cx - 1, g.wy + 11, 3, 0, Math.PI * 2); c.fill();
                });
            }

            /** The chimneys: brick stacks standing BTX.CHIMNEY_Z over the roof, the faces toward the camera, a stone cap. */
            _btChimneys(ctx) {
                const H = this._btH(), Z = H + BTX.CHIMNEY_Z, cam = game.camera, C = BTX.C;
                for (const [dx, dy, w, h] of BTX.CHIMNEYS) {
                    const x0 = this.x + dx, y0 = this.y + dy, x1 = x0 + w, y1 = y0 + h;
                    const walls = [];
                    if (cam.y > y1) walls.push([x0, y1, x1, y1, '#d4cebd']); if (cam.y < y0) walls.push([x1, y0, x0, y0, '#a49e8c']);
                    if (cam.x > x1) walls.push([x1, y1, x1, y0, '#bdb7a5']); if (cam.x < x0) walls.push([x0, y0, x0, y1, '#bdb7a5']);
                    for (const [ax, ay, bx, by, col] of walls) {
                        const a = this._btP(ax, ay, H), b = this._btP(bx, by, H), c2 = this._btP(bx, by, Z), d2 = this._btP(ax, ay, Z);
                        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = C.mortar; ctx.lineWidth = 0.6; ctx.beginPath();
                        for (let t = 0.2; t < 1; t += 0.2) { const p = this._btP(ax, ay, H + (Z - H) * t), q = this._btP(bx, by, H + (Z - H) * t); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
                        ctx.stroke();
                    }
                    LandmarkKit.flat(ctx, this._btK(Z), (c) => {
                        c.fillStyle = C.trim; c.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
                        for (let i = 0; i < 3; i++) { c.fillStyle = '#5a3a2c'; c.fillRect(x0 + 3 + i * (w - 6) / 3, y0 + 3, (w - 6) / 3 - 2, h - 6); c.fillStyle = '#1a1414'; c.beginPath(); c.arc(x0 + 3 + (i + 0.5) * (w - 6) / 3 - 1, y0 + h / 2, 2, 0, Math.PI * 2); c.fill(); }
                    });
                }
            }

            _btVisible() { return CONFIG.BUILDINGS.LEAN ? this._visibleFaces(game.camera) : []; }

            drawTop(ctx) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) { super.drawTop(ctx); return; }
                const vis = this._btVisible(), brick = vis.filter(f => f.part === 'brick'), cam = game.camera, H = this._btH();
                const bay = vis.filter(f => f.part === 'bay').sort((a, b) => Math.hypot(cam.x - (b.x1 + b.x2) / 2, cam.y - (b.y1 + b.y2) / 2) - Math.hypot(cam.x - (a.x1 + a.x2) / 2, cam.y - (a.y1 + a.y2) / 2));
                ctx.save();
                // the brick house
                for (const f of brick) {
                    const art = this._btBrickArt(f); this._btMap(ctx, f, art.day, art.S, 0, BTX.C.brickLo);
                    const sh = f.side === 'S' ? 0.04 : f.side === 'N' ? 0.4 : 0.22;
                    this._btQuad(ctx, f, 0, H); ctx.fillStyle = `rgba(20, 24, 30, ${sh})`; ctx.fill();
                }
                this._btBrickLedges(ctx, brick);
                // the bay: its strip on each face, shaded as each turns from the light, a darker foot; then its ledges, low to high
                const art = this._btBayArt();
                for (const f of bay) {
                    this._btMap(ctx, f, art.day, art.S, f.u0, BTX.C.stoneMid);
                    this._btQuad(ctx, f, 0, H); ctx.fillStyle = `rgba(6, 18, 20, ${0.04 + 0.42 * this._btTurn(f)})`; ctx.fill();
                    const ao = ctx.createLinearGradient(...this._btP(f.x1, f.y1, 0), ...this._btP(f.x1, f.y1, H * 0.35)); ao.addColorStop(0, 'rgba(4, 12, 14, 0.4)'); ao.addColorStop(1, 'rgba(4, 12, 14, 0)');
                    this._btQuad(ctx, f, 0, H * 0.35); ctx.fillStyle = ao; ctx.fill();
                }
                const R = BTX.ROWS;
                this._btLedges(ctx, bay, H - R.plinth + 1, 1.5, 4, false);
                for (const y of R.bands.slice().reverse()) this._btLedges(ctx, bay, H - y, 3.2, 6, false);
                this._btLedges(ctx, bay, H - R.crown, 1.4, 2.5, false);
                this._btLedges(ctx, bay, H, 7, 4, false);
                // the roofs, then the chimneys standing on them
                LandmarkKit.drawSprite(ctx, this._btRoofSprite(false), this._btK(H));
                this._btChimneys(ctx);
                ctx.restore();
            }

            drawEmissive(ctx, dark, beamsOnly) {
                if (beamsOnly || !(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                const glow = Math.max(0.12, Math.min(0.92, dark * 1.05)), vis = this._btVisible();
                ctx.save(); ctx.globalAlpha *= glow; ctx.globalCompositeOperation = 'lighter';
                const art = this._btBayArt();
                for (const f of vis) {
                    if (f.part === 'bay') this._btMap(ctx, f, art.lit, art.S, f.u0);
                    else { const b = this._btBrickArt(f); this._btMap(ctx, f, b.lit, b.S, 0); }
                }
                LandmarkKit.drawSprite(ctx, this._btRoofSprite(true), this._btK(this._btH()));
                ctx.restore();
            }
        }

        /** The demo bay tower: a pale brick house 300 x 180 with the rounded teal bay standing 70 out of its front (south). */
        function createBayTower(x, y, config = {}) {
            const G = BTX.G;
            return new BayTowerBuilding({
                id: 'bay_tower', x, y, label: 'Bay Tower', type: 'apartment', floors: 14,
                sections: [
                    { x: 0, y: 0, w: G.W, h: G.D },
                    { x: G.bx0, y: G.D, w: G.bx1 - G.bx0, h: G.cheek + G.b }
                ],
                roofColor: BTX.C.roof, roofLightColor: BTX.C.roofLo,
                wallColor: BTX.C.brick, wallLightColor: BTX.C.trim, accentColor: '#ffd29a',
                windowColor: '#1d2a33', windowLitColor: BTX.C.warm, windowFrameColor: BTX.C.frame,
                balconies: [], roofProps: [{ type: 'vent', section: 0, x: 20, y: 20, w: 1, h: 1 }],
                ...config
            });
        }
