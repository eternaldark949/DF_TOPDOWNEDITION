        /* =====================================================================
           DOUBLE NIGHTS HOTEL — the city's landmark (BuildingV2 style 'double_nights')
           ---------------------------------------------------------------------
           Its emblem made architecture: two crescent towers in black lacquer,
           crimson and champagne gold, facing each other across a lens-shaped
           glass atrium (the vesica where the two moons overlap), lit from below
           by the lobby's chandelier. The west crown carries a helipad, the east
           the penthouse and its pool (chapter 1's suite). At the front a
           porte-cochère, a circular drive round a double-crescent fountain, the
           carpet. At night gold uplights climb the towers, halo crowns breathe
           crimson and two gold searchlights cross over the roofs.

           Real curves: the towers are polygons extruded with the same lean
           projection as every other building (leanCamHeight), not section boxes.
           The sections (bands) are only for collision and shadows.
           All geometry is in the building's local frame (800 × 450, the south
           forecourt below it); _dnGeo() turns it into world coordinates once.
           ===================================================================== */
        const DN = {
            FLOORS: 14,
            OUT: [260, 225, 210], IN: [360, 225, 190],            // the west crescent: outer and inner circles (the east mirrors it)
            ATRIUM_Z: 30, CANOPY_Z: 36, CROWN_Z: 16,             // heights above the ground / above the roofs
            CANOPY: { x0: 292, x1: 508, y0: 396, y1: 534 },
            DOOR: { x: 350, y: 420, w: 100, h: 56 },
            COURT: { cx: 400, cy: 672, rx: 236, ry: 128, lane: 46, fountain: 62 },
            FORECOURT_H: 420,                                      // paving south of the footprint
            C: { lacquer: '#0e070c', lacquerHi: '#2b1422', crimson: '#6d0c26', crimsonHi: '#d11e4c', gold: '#e8c27a', goldHi: '#fff1c9',
                 glass: '#140a14', stone: '#2c2427', stoneHi: '#43363b', lawn: '#16301f', lawnHi: '#24482f', carpet: '#8a1030' }
        };

        /** The crescent's x-range across a horizontal line (local, west tower), for the collision bands. */
        function _dnCrescentSpan(y) {
            const [ox, oy, R] = DN.OUT, [ix, , r] = DN.IN, dy = y - oy;
            if (Math.abs(dy) >= R) return null;
            const oh = Math.sqrt(R * R - dy * dy), lo = ox - oh, hi = ox + oh;
            if (Math.abs(dy) >= r) return [lo, hi];
            const ih = Math.sqrt(r * r - dy * dy), iLo = ix - ih;
            return [lo, Math.min(iLo, hi)];
        }

        /** Collision/shadow bands for the whole building (local sections). */
        function doubleNightsSections() {
            const S = [], band = 30;
            for (let y = DN.OUT[1] - DN.OUT[2] + 6; y < DN.OUT[1] + DN.OUT[2] - 6; y += band) {
                const sp = _dnCrescentSpan(y + band / 2); if (!sp || sp[1] - sp[0] < 8) continue;
                const x0 = Math.round(sp[0]), w = Math.round(sp[1] - sp[0]), h = Math.min(band, DN.OUT[1] + DN.OUT[2] - 6 - y);
                S.push({ x: x0, y: Math.round(y), w, h }, { x: 800 - x0 - w, y: Math.round(y), w, h });   // west, and its mirror
            }
            // The atrium lens: where the two inner circles overlap
            const [ix, iy, r] = DN.IN, d = 400 - ix;
            for (let y = iy - 180; y < iy + 180; y += band) {
                const dy = y + band / 2 - iy; if (Math.abs(dy) >= r) continue;
                const hw = Math.sqrt(r * r - dy * dy) - d; if (hw < 6) continue;
                S.push({ x: Math.round(400 - hw), y: Math.round(y), w: Math.round(hw * 2), h: band });
            }
            return S;
        }

        Object.assign(BuildingV2.prototype, {
            /** World-space geometry, built once: the two crescents, the lens, the canopy, the court. */
            _dnGeo() {
                if (this._dnG) return this._dnG;
                const X = this.x, Y = this.y, deg = Math.PI / 180;
                const [ox, oy, R] = DN.OUT, [ix, iy, r] = DN.IN;
                const d = ix - ox, tx = (d * d + R * R - r * r) / (2 * d), th = Math.sqrt(R * R - tx * tx);
                const tO = Math.atan2(th, tx), tI = Math.atan2(th, tx - d);                    // tip angles on the outer and inner circle
                const west = [];
                for (let a = tO; a <= 2 * Math.PI - tO + 1e-6; a += 7 * deg) west.push([ox + R * Math.cos(a), oy + R * Math.sin(a)]);
                west.push([ox + R * Math.cos(2 * Math.PI - tO), oy + R * Math.sin(2 * Math.PI - tO)]);
                const nOuter = west.length;
                for (let a = 2 * Math.PI - tI; a >= tI - 1e-6; a -= 7 * deg) west.push([ix + r * Math.cos(a), iy + r * Math.sin(a)]);
                const east = west.map(([x, y]) => [800 - x, y]).reverse();
                // The lens: the east inner circle's west arc, then the west inner circle's east arc
                const lens = [], hd = 400 - ix, lh = Math.sqrt(r * r - hd * hd), la = Math.atan2(lh, -hd), lb = Math.atan2(lh, hd);
                const eix = 800 - ix;
                for (let a = 2 * Math.PI - la; a >= la - 1e-6; a -= 6 * deg) lens.push([eix + r * Math.cos(a), iy + r * Math.sin(a)]);
                for (let a = lb; a >= -lb - 1e-6; a -= 6 * deg) lens.push([ix + r * Math.cos(a), iy + r * Math.sin(a)]);
                const W = (p) => p.map(([x, y]) => [X + x, Y + y]);
                const shape = (pts) => {                                                        // outward normals, per edge
                    const inside = (px, py) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
                    const edges = [];
                    for (let i = 0; i < pts.length; i++) {
                        const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
                        let nx = dy / L, ny = -dx / L;
                        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
                        if (inside(mx + nx * 2, my + ny * 2)) { nx = -nx; ny = -ny; }
                        edges.push({ a, b, nx, ny, mx, my, len: L });
                    }
                    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; }
                    return { pts, edges, cx: cx / pts.length, cy: cy / pts.length };
                };
                const Cn = DN.CANOPY, Ct = DN.COURT;
                const wS = shape(W(west)), eS = shape(W(east));
                wS.outer = wS.pts.slice(0, nOuter); eS.outer = W(west.slice(0, nOuter).map(([x, y]) => [800 - x, y]));
                return (this._dnG = {
                    west: wS, east: eS, lens: shape(W(lens)),
                    canopy: { x0: X + Cn.x0, x1: X + Cn.x1, y0: Y + Cn.y0, y1: Y + Cn.y1 },
                    cols: [[Cn.x0 + 10, Cn.y1 - 10], [Cn.x1 - 10, Cn.y1 - 10], [Cn.x0 + 10, Cn.y0 + 34], [Cn.x1 - 10, Cn.y0 + 34]].map(([x, y]) => [X + x, Y + y]),
                    court: { cx: X + Ct.cx, cy: Y + Ct.cy, rx: Ct.rx, ry: Ct.ry },
                    helipad: [X + 112, Y + 225], penthouse: [X + 688, Y + 225]
                });
            },

            _dnK(z) { const C = leanCamHeight(); return C / (C - Math.min(z, C * 0.86)); },
            _dnP(x, y, z) { const cam = game.camera, k = this._dnK(z); return [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k]; },
            _dnH() { return DN.FLOORS * CONFIG.BUILDINGS.FLOOR_HEIGHT; },

            /** The forecourt rect (for keeping street trees and lamps off it). */
            _dnForecourt() { return { x: this.x - 10, y: this.y + 380, w: 820, h: DN.FORECOURT_H + 60 }; },

            _dnDoor(doorConfig) {
                const D = DN.DOOR;
                this._doorLightColor = null;
                this.attachedTransition = { x: this.x + D.x, y: this.y + D.y, w: D.w, h: D.h, target: doorConfig.target, label: doorConfig.label };
            },

            _dnLights() {
                const X = this.x, Y = this.y, add = (x, y, color, r, type = 4) => this.attachedLights.push(Object.assign(new LampEntity({ x: X + x, y: Y + y, lampType: type, color, lightRadius: r }), { visible: false }));
                add(400, 474, '#ffd9a0', 250);                       // under the canopy
                add(400, 672, '#ffc870', 160);                       // the fountain
                for (const a of [0.35, 0.8, 1.25, 1.9, 2.35, 2.8]) add(400 + Math.cos(a) * 262, 672 + Math.sin(a) * 150, '#ffcf95', 120);   // drive lanterns
                add(150, 432, '#ff6a8a', 120); add(650, 432, '#ff6a8a', 120);   // tower-foot uplights, rose
                add(250, 60, '#ffd08a', 120); add(550, 60, '#ffd08a', 120);
                add(400, 225, '#ffdca8', 170);                       // the atrium, from within
            },

            // ── Base pass (under the entities) ───────────────────────────────
            _dnDrawBase(ctx) {
                const G = this._dnGeo();
                ctx.save();
                ctx.fillStyle = 'rgba(6, 2, 8, 0.55)';                   // contact shadow, a little offset
                for (const s of [G.west, G.east, G.lens]) { ctx.beginPath(); s.pts.forEach(([x, y], i) => i ? ctx.lineTo(x + 7, y + 9) : ctx.moveTo(x + 7, y + 9)); ctx.closePath(); ctx.fill(); }
                ctx.restore();
            },

            /** The forecourt and the courtyard gardens, painted once into a sprite; the water moves live. */
            _dnDrawGround(ctx) {
                if (!this._dnGround) this._dnGround = this._dnPaintGround();
                const g = this._dnGround;
                ctx.drawImage(g.cv, this.x + g.ox, this.y + g.oy, g.w, g.h);
                // The fountain's water: ripples out from the two crescents, glints
                const C = this._dnGeo().court, t = _gameTimeSec;
                ctx.save();
                ctx.strokeStyle = 'rgba(200, 230, 255, 0.35)'; ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    const k = ((t * 0.45 + i / 3) % 1), rr = 10 + k * (DN.COURT.fountain - 16);
                    ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.ellipse(C.cx, C.cy, rr, rr * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255, 245, 220, 0.8)';
                for (let i = 0; i < 6; i++) { const a = t * 0.7 + i * 1.05, rr = 18 + (i * 7) % 30; if (Math.sin(t * 5 + i * 2) > 0.6) ctx.fillRect(C.cx + Math.cos(a) * rr, C.cy + Math.sin(a) * rr * 0.9, 1.5, 1.5); }
                ctx.restore();
            },

            _dnPaintGround() {
                const ox = -20, oy = 0, w = 840, h = 450 + DN.FORECOURT_H, S = 1;
                const cv = document.createElement('canvas'); cv.width = w * S; cv.height = h * S;
                const c = cv.getContext('2d'), rnd = seededRandom(6012);
                c.scale(S, S); c.translate(-ox, -oy);
                const Cr = DN.COURT, Cn = DN.CANOPY, P = DN.C;
                // Rose-grey stone paving across the forecourt, laid in a fan from the door
                c.fillStyle = P.stone; c.fillRect(-20, 380, 840, h - 380);
                c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1;
                for (let rr = 40; rr < 520; rr += 26) { c.beginPath(); c.arc(400, 400, rr, 0.05, Math.PI - 0.05); c.stroke(); }
                c.strokeStyle = 'rgba(255,230,210,0.05)';
                for (let a = 0.1; a < Math.PI; a += 0.09) { c.beginPath(); c.moveTo(400 + Math.cos(a) * 40, 400 + Math.sin(a) * 40); c.lineTo(400 + Math.cos(a) * 520, 400 + Math.sin(a) * 520); c.stroke(); }
                for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,220,230'},${0.03 + rnd() * 0.04})`; c.fillRect(-20 + rnd() * 840, 380 + rnd() * (h - 380), 2 + rnd() * 6, 1 + rnd() * 3); }
                // A gold band framing the forecourt
                
                // The circular drive: dark asphalt ring, gold kerbs
                const ring = (rx, ry) => { c.beginPath(); c.ellipse(Cr.cx, Cr.cy, rx, ry, 0, 0, Math.PI * 2); };
                c.fillStyle = '#17131a'; ring(Cr.rx + Cr.lane / 2, Cr.ry + Cr.lane / 2); c.fill();
                c.fillStyle = P.stone; ring(Cr.rx - Cr.lane / 2, Cr.ry - Cr.lane / 2); c.fill();
                c.strokeStyle = 'rgba(232,194,122,0.55)'; c.lineWidth = 2; ring(Cr.rx + Cr.lane / 2, Cr.ry + Cr.lane / 2); c.stroke(); ring(Cr.rx - Cr.lane / 2, Cr.ry - Cr.lane / 2); c.stroke();
                c.setLineDash([10, 12]); c.strokeStyle = 'rgba(232,194,122,0.3)'; c.lineWidth = 1.2; ring(Cr.rx, Cr.ry); c.stroke(); c.setLineDash([]);
                // Two spurs out to the avenue
                c.fillStyle = '#17131a';
                for (const s of [-1, 1]) { c.beginPath(); c.roundRect(Cr.cx + s * 150 - 23, Cr.cy + Cr.ry - 4, 46, h - (Cr.cy + Cr.ry) + 4, 6); c.fill(); }
                // The island: a lawn, pink and violet flower beds round the fountain
                c.fillStyle = P.lawn; ring(Cr.rx - Cr.lane / 2 - 10, Cr.ry - Cr.lane / 2 - 10); c.fill();
                for (let i = 0; i < 380; i++) { const a = rnd() * Math.PI * 2, k = Math.sqrt(rnd()); c.fillStyle = rnd() < 0.5 ? P.lawnHi : 'rgba(8,24,14,0.7)'; c.fillRect(Cr.cx + Math.cos(a) * (Cr.rx - 40) * k, Cr.cy + Math.sin(a) * (Cr.ry - 40) * k, 2, 2); }
                for (let i = 0; i < 140; i++) {
                    const a = rnd() * Math.PI * 2, rr = DN.COURT.fountain + 10 + rnd() * 26;
                    c.fillStyle = ['#ff8fc8', '#ffb3dc', '#c79bff', '#fff0f8'][Math.floor(rnd() * 4)];
                    c.beginPath(); c.arc(Cr.cx + Math.cos(a) * rr * 1.5, Cr.cy + Math.sin(a) * rr * 0.9, 1.4 + rnd() * 1.4, 0, Math.PI * 2); c.fill();
                }
                // The fountain: a stone basin, the water, two gilt crescents rising from it
                const F = DN.COURT.fountain;
                c.fillStyle = '#3a2f33'; c.beginPath(); c.arc(Cr.cx, Cr.cy, F + 6, 0, Math.PI * 2); c.fill();
                const wg = c.createRadialGradient(Cr.cx, Cr.cy, 4, Cr.cx, Cr.cy, F);
                wg.addColorStop(0, '#3a2c5a'); wg.addColorStop(1, '#150f28'); c.fillStyle = wg; c.beginPath(); c.arc(Cr.cx, Cr.cy, F, 0, Math.PI * 2); c.fill();
                c.strokeStyle = P.gold; c.lineWidth = 2; c.beginPath(); c.arc(Cr.cx, Cr.cy, F + 3, 0, Math.PI * 2); c.stroke();
                const crescent = (x, y, R, dx, col) => { c.save(); c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.arc(x + dx, y, R * 0.86, 0, Math.PI * 2, true); c.fillStyle = col; c.fill('evenodd'); c.restore(); };
                crescent(Cr.cx - 8, Cr.cy, 22, 9, P.gold); crescent(Cr.cx + 8, Cr.cy, 22, -9, P.goldHi);
                // The porte-cochère: its floor is marble, the carpet runs from the drive to the door
                c.fillStyle = '#3a3034'; c.fillRect(Cn.x0, 400, Cn.x1 - Cn.x0, Cn.y1 - 400 + 8);
                c.strokeStyle = 'rgba(255,240,230,0.07)'; for (let x = Cn.x0; x < Cn.x1; x += 24) { c.beginPath(); c.moveTo(x, 400); c.lineTo(x, Cn.y1 + 8); c.stroke(); }
                c.fillStyle = P.carpet; c.fillRect(372, 404, 56, Cn.y1 - 404 + 26);
                c.strokeStyle = P.gold; c.lineWidth = 1.5; c.strokeRect(374, 404, 52, Cn.y1 - 404 + 24);
                c.fillStyle = 'rgba(232,194,122,0.5)';                                     // stair nosings at the door
                for (let i = 0; i < 3; i++) c.fillRect(344, 404 + i * 6, 112, 1.5);
                // Stanchions and rope along the carpet
                for (let y = 470; y < Cn.y1 + 20; y += 22) for (const x of [364, 436]) { c.fillStyle = P.gold; c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill(); }
                c.strokeStyle = 'rgba(160,20,50,0.9)'; c.lineWidth = 1.6;
                for (const x of [364, 436]) { c.beginPath(); for (let y = 470; y < Cn.y1 + 20; y += 22) { c.moveTo(x, y); c.quadraticCurveTo(x, y + 11 + 3, x, y + 22); } c.stroke(); }
                // Planters with clipped topiary spheres along the frontage
                for (const x of [70, 170, 630, 730]) {
                    c.fillStyle = '#3a2f33'; c.beginPath(); c.arc(x, 484, 17, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = 'rgba(232,194,122,0.55)'; c.lineWidth = 1.2; c.stroke();
                    const tg = c.createRadialGradient(x - 4, 480, 2, x, 484, 14); tg.addColorStop(0, '#4d8a58'); tg.addColorStop(1, '#14331d'); c.fillStyle = tg; c.beginPath(); c.arc(x, 484, 13, 0, Math.PI * 2); c.fill();
                    for (let i = 0; i < 7; i++) { const a = i * 0.9; c.fillStyle = i % 2 ? '#ff9ccf' : '#d7a8ff'; c.beginPath(); c.arc(x + Math.cos(a) * 9, 484 + Math.sin(a) * 9, 1.6, 0, Math.PI * 2); c.fill(); }
                }
                // The courtyards between the crescents and the atrium: reflecting pools in a lawn
                c.save();
                c.beginPath(); c.arc(DN.IN[0], DN.IN[1], DN.IN[2], 0, Math.PI * 2); c.arc(800 - DN.IN[0], DN.IN[1], DN.IN[2], 0, Math.PI * 2); c.clip('nonzero');
                c.fillStyle = P.lawn; c.fillRect(160, 30, 480, 390);
                for (let i = 0; i < 400; i++) { c.fillStyle = rnd() < 0.5 ? P.lawnHi : 'rgba(8,24,14,0.7)'; c.fillRect(160 + rnd() * 480, 30 + rnd() * 390, 2, 2); }
                for (const s of [-1, 1]) {
                    const x = 400 + s * 162;
                    c.fillStyle = '#18103a'; c.beginPath(); c.ellipse(x, 225, 22, 120, 0, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = 'rgba(232,194,122,0.6)'; c.lineWidth = 1.5; c.stroke();
                }
                c.restore();
                return { cv, ox, oy, w, h };
            },

            // ── Top pass (over the entities) ─────────────────────────────────
            /** Draw an extruded shape: the walls that face the camera (far first), then the roof. */
            _dnExtrude(ctx, sh, z0, z1, wallPaint, roofPaint) {
                const cam = game.camera, P = (p, z) => z ? this._dnP(p[0], p[1], z) : p;
                const vis = sh.edges.filter(e => (cam.x - e.mx) * e.nx + (cam.y - e.my) * e.ny > 0)
                    .sort((a, b) => Math.hypot(b.mx - cam.x, b.my - cam.y) - Math.hypot(a.mx - cam.x, a.my - cam.y));
                for (const e of vis) wallPaint(ctx, e, P(e.a, z0), P(e.b, z0), P(e.b, z1), P(e.a, z1));
                if (roofPaint) {
                    ctx.beginPath(); sh.pts.forEach((p, i) => { const q = P(p, z1); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
                    roofPaint(ctx);
                }
                return vis;
            },

            _dnTowerWalls(ctx, sh, H) {
                const C = DN.C, FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, cam = game.camera;
                const floors = [];
                const vis = this._dnExtrude(ctx, sh, 0, H, (c, e, a, b, bT, aT) => {
                    const lit = 0.5 + 0.5 * Math.max(0, e.ny * 0.6 - e.nx * 0.4);                  // a little lighter where it faces south-west
                    const g = c.createLinearGradient(a[0], a[1], aT[0], aT[1]);
                    g.addColorStop(0, C.lacquer); g.addColorStop(1, lit > 0.7 ? C.lacquerHi : '#1a0c14');
                    c.fillStyle = g; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(bT[0], bT[1]); c.lineTo(aT[0], aT[1]); c.closePath(); c.fill();
                }, null);
                // Spandrels (crimson bands with a gold lip) every floor, mullions at each facet: one path each
                ctx.save();
                ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(160, 24, 58, 0.55)'; ctx.beginPath();
                for (const e of vis) for (let f = 1; f < DN.FLOORS; f++) { const p = this._dnP(e.a[0], e.a[1], f * FH), q = this._dnP(e.b[0], e.b[1], f * FH); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
                ctx.stroke();
                ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(232, 194, 122, 0.45)'; ctx.beginPath();
                for (const e of vis) { const p = e.a, t = this._dnP(p[0], p[1], H); ctx.moveTo(p[0], p[1]); ctx.lineTo(t[0], t[1]); }
                ctx.stroke();
                ctx.restore();
                return vis;
            },

            _dnDrawTop(ctx) {
                const G = this._dnGeo(), C = DN.C, H = this._dnH();
                ctx.save();
                // The atrium first (low), then the towers over it
                this._dnExtrude(ctx, G.lens, 0, DN.ATRIUM_Z, (c, e, a, b, bT, aT) => {
                    c.fillStyle = '#1b1017'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(bT[0], bT[1]); c.lineTo(aT[0], aT[1]); c.closePath(); c.fill();
                    c.strokeStyle = 'rgba(232,194,122,0.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(aT[0], aT[1]); c.lineTo(bT[0], bT[1]); c.stroke();
                }, (c) => {
                    const cp = this._dnP(G.lens.cx, G.lens.cy, DN.ATRIUM_Z);
                    const g = c.createRadialGradient(cp[0], cp[1], 10, cp[0], cp[1], 190);
                    g.addColorStop(0, '#3a2530'); g.addColorStop(1, C.glass); c.fillStyle = g; c.fill();
                    c.strokeStyle = C.gold; c.lineWidth = 1.6; c.stroke();
                });
                this._dnAtriumRibs(ctx, G, false);
                this._dnCanopy(ctx, G, false);
                for (const [sh, key] of [[G.west, 'w'], [G.east, 'e']]) {
                    this._dnTowerWalls(ctx, sh, H);
                    // The roof: lacquer with a gold parapet and a crimson inner band
                    ctx.beginPath(); sh.pts.forEach((p, i) => { const q = this._dnP(p[0], p[1], H); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
                    const cp = this._dnP(sh.cx, sh.cy, H), g = ctx.createRadialGradient(cp[0], cp[1], 10, cp[0], cp[1], 220);
                    g.addColorStop(0, '#3a1a2c'); g.addColorStop(0.7, '#1c0c16'); g.addColorStop(1, '#12080e'); ctx.fillStyle = g; ctx.fill();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 2.2; ctx.stroke();
                    // Art-deco fins across the crown, outer arc to inner arc, and a crimson band just inside the parapet
                    const n = sh.outer.length, inner = sh.pts.slice(n).reverse();
                    ctx.strokeStyle = 'rgba(232, 194, 122, 0.28)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i = 2; i < n - 2; i += 2) {
                        const o = sh.outer[i], j = Math.round(i / (n - 1) * (inner.length - 1)), q = inner[Math.max(0, Math.min(inner.length - 1, j))];
                        const a = this._dnP(o[0], o[1], H), b = this._dnP(o[0] + (q[0] - o[0]) * 0.8, o[1] + (q[1] - o[1]) * 0.8, H);
                        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                    }
                    ctx.stroke();
                    ctx.beginPath(); sh.outer.forEach((p, i) => { const q = this._dnP(sh.cx + (p[0] - sh.cx) * 0.95, sh.cy + (p[1] - sh.cy) * 0.95, H); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
                    ctx.strokeStyle = 'rgba(160, 20, 56, 0.6)'; ctx.lineWidth = 2; ctx.stroke();
                    this._dnCrown(ctx, sh, key, H, false);
                }
                ctx.restore();
            },

            /** Ribs of the atrium's glass roof, fanning from the emblem at its centre. */
            _dnAtriumRibs(ctx, G, emissive) {
                const z = DN.ATRIUM_Z, c0 = this._dnP(G.lens.cx, G.lens.cy, z);
                ctx.save();
                ctx.strokeStyle = emissive ? 'rgba(255,225,170,0.22)' : 'rgba(232,194,122,0.3)'; ctx.lineWidth = 0.8; ctx.beginPath();
                const pts = G.lens.pts;
                for (let i = 0; i < pts.length; i += 2) { const q = this._dnP(pts[i][0], pts[i][1], z); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(q[0], q[1]); }
                ctx.stroke();
                // The emblem inlaid at the centre: two overlapping crescents
                const k = this._dnK(z), r = 26 * k;
                ctx.lineWidth = 2; ctx.strokeStyle = emissive ? 'rgba(255,236,190,0.9)' : DN.C.gold;
                for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(c0[0] + s * 8 * k, c0[1], r, s < 0 ? Math.PI * 0.35 : -Math.PI * 0.65, s < 0 ? Math.PI * 1.65 : Math.PI * 0.65); ctx.stroke(); }
                ctx.restore();
            },

            /** The porte-cochère: a lacquer slab on four gilt columns, a skylight down its middle. */
            _dnCanopy(ctx, G, emissive) {
                const z = DN.CANOPY_Z, Cn = G.canopy, C = DN.C;
                const q = [[Cn.x0, Cn.y0], [Cn.x1, Cn.y0], [Cn.x1, Cn.y1], [Cn.x0, Cn.y1]].map(([x, y]) => this._dnP(x, y, z));
                // Someone under it (her, or anyone the camera follows): the slab thins to a veil so they stay in view
                const p = game.player, cam = game.camera, fx = p && p.visible ? p.x : cam.x, fy = p && p.visible ? p.y : cam.y;
                const under = fx > Cn.x0 - 20 && fx < Cn.x1 + 20 && fy > Cn.y0 - 10 && fy < Cn.y1 + 40;
                this._dnFade = (this._dnFade == null ? 1 : this._dnFade) + ((under ? 0.3 : 1) - (this._dnFade == null ? 1 : this._dnFade)) * 0.12;
                ctx.save();
                ctx.globalAlpha *= this._dnFade;
                if (!emissive) {
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 3.2 * this._dnK(z * 0.5);          // columns, ground to slab
                    for (const [x, y] of G.cols) { const t = this._dnP(x, y, z); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t[0], t[1]); ctx.stroke(); }
                    const kz = this._dnK(z), rad = 46 * kz;
                    ctx.beginPath(); ctx.roundRect(q[0][0], q[0][1], q[1][0] - q[0][0], q[3][1] - q[0][1], [6 * kz, 6 * kz, rad, rad]);
                    const cg = ctx.createLinearGradient(q[0][0], q[0][1], q[0][0], q[3][1]); cg.addColorStop(0, '#1d0c16'); cg.addColorStop(1, '#2c1220');
                    ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.stroke();
                    ctx.strokeStyle = 'rgba(160, 20, 56, 0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(q[0][0] + 5 * kz, q[0][1] + 5 * kz, q[1][0] - q[0][0] - 10 * kz, q[3][1] - q[0][1] - 10 * kz, [4 * kz, 4 * kz, rad - 5 * kz, rad - 5 * kz]); ctx.stroke();
                }
                const s0 = this._dnP(390, Cn.y0 + 12, z), s1 = this._dnP(410, Cn.y1 - 12, z);   // the skylight strip
                const [ax, ay] = this._dnP((Cn.x0 + Cn.x1) / 2 - 12, Cn.y0 + 14, z), [bx, by] = this._dnP((Cn.x0 + Cn.x1) / 2 + 12, Cn.y1 - 14, z);
                ctx.fillStyle = emissive ? 'rgba(255, 214, 150, 0.22)' : '#2a1a24'; ctx.fillRect(ax, ay, bx - ax, by - ay);
                ctx.restore();
            },

            /** A tower's crown: the crimson halo, a gilt finial; the helipad (west) or the penthouse and its pool (east). */
            _dnCrown(ctx, sh, key, H, emissive) {
                const C = DN.C, G = this._dnGeo(), t = _gameTimeSec, zc = H + DN.CROWN_Z;
                ctx.save();
                // The halo: the outer arc of the crescent, lifted and inset
                const outer = sh.outer;
                const inset = (p) => [sh.cx + (p[0] - sh.cx) * 0.9, sh.cy + (p[1] - sh.cy) * 0.9];
                ctx.beginPath(); outer.forEach((p, i) => { const q = this._dnP(...inset(p), zc); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
                if (emissive) {
                    const br = 0.65 + 0.35 * Math.sin(t * 1.3 + (key === 'w' ? 0 : 1.7));
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = `rgba(209, 30, 76, ${0.35 * br})`; ctx.lineWidth = 9; ctx.stroke();
                    ctx.strokeStyle = `rgba(255, 90, 130, ${0.8 * br})`; ctx.lineWidth = 2.5; ctx.stroke();
                } else { ctx.strokeStyle = '#3a0c1c'; ctx.lineWidth = 3; ctx.stroke(); }
                ctx.globalCompositeOperation = 'source-over';
                if (key === 'w') {                                                             // the helipad
                    const [hx, hy] = G.helipad, p = this._dnP(hx, hy, H + 1), k = this._dnK(H);
                    if (!emissive) {
                        ctx.fillStyle = '#1d1419'; ctx.beginPath(); ctx.arc(p[0], p[1], 40 * k, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.stroke();
                        ctx.font = `600 ${26 * k}px Montserrat, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(232,194,122,0.85)'; ctx.fillText('H', p[0], p[1] + 1);
                    } else {
                        ctx.globalCompositeOperation = 'lighter';
                        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, on = Math.sin(t * 3 - i * 0.8) > 0.2; ctx.fillStyle = on ? 'rgba(255,220,150,0.9)' : 'rgba(255,220,150,0.25)'; ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * 40 * k, p[1] + Math.sin(a) * 40 * k, 1.8 * k, 0, Math.PI * 2); ctx.fill(); }
                    }
                } else {                                                                       // the penthouse: a glass pavilion, the pool balcony
                    const [px, py] = G.penthouse, k = this._dnK(H + 10);
                    const pc = this._dnP(px + 6, py, H + 1), kp = this._dnK(H + 1);
                    const pool = { x: pc[0] - 11 * kp, y: pc[1] - 58 * kp, w: 22 * kp, h: 116 * kp };
                    const vc = this._dnP(px - 26, py, H + 10), kv = this._dnK(H + 10);
                    const pav = { x: vc[0] - 12 * kv, y: vc[1] - 38 * kv, w: 24 * kv, h: 76 * kv };
                    const poly = (Q) => { ctx.beginPath(); ctx.roundRect(Q.x, Q.y, Q.w, Q.h, Q.w / 2); };
                    if (!emissive) {
                        poly(pool); const g = ctx.createLinearGradient(pool.x, pool.y, pool.x + pool.w, pool.y + pool.h);
                        g.addColorStop(0, '#1a2250'); g.addColorStop(1, '#34215e'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                        ctx.strokeStyle = 'rgba(190, 210, 255, 0.35)'; ctx.lineWidth = 0.8; ctx.beginPath();                 // caustic
                        for (let i = 1; i < 5; i++) { const yy = pool.y + pool.h * i / 5 + Math.sin(t * 1.6 + i) * 2; ctx.moveTo(pool.x + 3, yy); ctx.quadraticCurveTo(pool.x + pool.w / 2, yy + 3, pool.x + pool.w - 3, yy); }
                        ctx.stroke();
                        poly(pav); ctx.fillStyle = '#1b1220'; ctx.fill(); ctx.strokeStyle = 'rgba(232,194,122,0.7)'; ctx.stroke();
                    } else {
                        ctx.globalCompositeOperation = 'lighter';
                        poly(pav); ctx.fillStyle = 'rgba(255, 214, 160, 0.35)'; ctx.fill();         // the suite is always lit
                        poly(pool); ctx.fillStyle = `rgba(90, 130, 255, ${0.12 + 0.05 * Math.sin(t * 2)})`; ctx.fill();
                    }
                }
                ctx.restore();
            },

            // ── Emissive pass (after the darkness) ───────────────────────────
            _dnDrawEmissive(ctx, dark) {
                const G = this._dnGeo(), H = this._dnH(), FH = CONFIG.BUILDINGS.FLOOR_HEIGHT, t = _gameTimeSec, cam = game.camera;
                const glow = Math.max(0.15, Math.min(1, dark * 1.1));
                ctx.save();
                ctx.globalAlpha = glow;
                ctx.globalCompositeOperation = 'lighter';
                // Atrium: the chandelier's warmth through the glass
                const ap = this._dnP(G.lens.cx, G.lens.cy, DN.ATRIUM_Z), ag = ctx.createRadialGradient(ap[0], ap[1], 6, ap[0], ap[1], 170);
                ag.addColorStop(0, 'rgba(255, 206, 140, 0.3)'); ag.addColorStop(0.6, 'rgba(255, 160, 110, 0.1)'); ag.addColorStop(1, 'rgba(255,150,100,0)');
                ctx.beginPath(); G.lens.pts.forEach((p, i) => { const q = this._dnP(p[0], p[1], DN.ATRIUM_Z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
                ctx.fillStyle = ag; ctx.fill();
                this._dnAtriumRibs(ctx, G, true);
                this._dnCanopy(ctx, G, true);
                for (const [sh, key] of [[G.west, 'w'], [G.east, 'e']]) {
                    const vis = sh.edges.filter(e => (cam.x - e.mx) * e.nx + (cam.y - e.my) * e.ny > 0);
                    // Lit rooms: a curated scatter, the top floors of the east tower always on
                    ctx.fillStyle = 'rgba(255, 214, 150, 0.85)';
                    ctx.beginPath();
                    vis.forEach((e, ei) => {
                        const idx = sh.edges.indexOf(e);
                        for (let f = 0; f < DN.FLOORS; f++) {
                            const on = (key === 'e' && f >= DN.FLOORS - 2) || _bldHash(this._seed || 7, idx * 31 + f * 7 + (key === 'e' ? 500 : 0)) < 0.34;
                            if (!on) continue;
                            const z0 = f * FH + 2, z1 = f * FH + FH - 2, u0 = 0.18, u1 = 0.82;
                            const A = [e.a[0] + (e.b[0] - e.a[0]) * u0, e.a[1] + (e.b[1] - e.a[1]) * u0], B = [e.a[0] + (e.b[0] - e.a[0]) * u1, e.a[1] + (e.b[1] - e.a[1]) * u1];
                            const p0 = this._dnP(A[0], A[1], z0), p1 = this._dnP(B[0], B[1], z0), p2 = this._dnP(B[0], B[1], z1), p3 = this._dnP(A[0], A[1], z1);
                            ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
                        }
                    });
                    ctx.fill();
                    // Gold uplights climbing the faces from the ground
                    for (const e of vis) {
                        const a = e.a, b = e.b, aT = this._dnP(a[0], a[1], H * 0.55), bT = this._dnP(b[0], b[1], H * 0.55);
                        const g = ctx.createLinearGradient(e.mx, e.my, (aT[0] + bT[0]) / 2, (aT[1] + bT[1]) / 2);
                        g.addColorStop(0, 'rgba(255, 196, 110, 0.32)'); g.addColorStop(1, 'rgba(255, 196, 110, 0)');
                        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(bT[0], bT[1]); ctx.lineTo(aT[0], aT[1]); ctx.closePath(); ctx.fill();
                    }
                    // The parapet glints
                    ctx.beginPath(); sh.pts.forEach((p, i) => { const q = this._dnP(p[0], p[1], H); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
                    ctx.strokeStyle = 'rgba(255, 220, 160, 0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.globalCompositeOperation = 'source-over';
                    this._dnCrown(ctx, sh, key, H, true);
                    ctx.globalCompositeOperation = 'lighter';
                }
                // Ground: the fountain's gold, the lanterns round the drive, the carpet's pool of light
                const Cr = G.court;
                glowA(ctx, Cr.cx, Cr.cy, 90, '255, 200, 120', 0.14);
                for (const a of [0.35, 0.8, 1.25, 1.9, 2.35, 2.8]) {
                    const x = Cr.cx + Math.cos(a) * (Cr.rx + 26), y = Cr.cy + Math.sin(a) * (Cr.ry + 22);
                    glowA(ctx, x, y, 26, '255, 214, 150', 0.5); ctx.fillStyle = 'rgba(255, 240, 210, 0.9)'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
                }
                // Two gold searchlights crossing over the roofs (not when zoomed far out)
                if (dark > 0.25 && _zoomLOD < 2) {
                    for (const [sh, ph] of [[G.west, 0], [G.east, 2.4]]) {
                        const o = this._dnP(sh.cx, sh.cy, H + 20), ang = -Math.PI / 2 + Math.sin(t * 0.22 + ph) * 0.85 + (sh === G.west ? 0.35 : -0.35);
                        const L = 900, wid = 0.07, x1 = o[0] + Math.cos(ang - wid) * L, y1 = o[1] + Math.sin(ang - wid) * L, x2 = o[0] + Math.cos(ang + wid) * L, y2 = o[1] + Math.sin(ang + wid) * L;
                        const g = ctx.createLinearGradient(o[0], o[1], (x1 + x2) / 2, (y1 + y2) / 2);
                        g.addColorStop(0, `rgba(255, 224, 160, ${0.34 * dark})`); g.addColorStop(1, 'rgba(255, 224, 160, 0)');
                        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill();
                    }
                }
                ctx.restore();
            },

            /** "Double Nights" in script on the canopy's fascia, in the canopy's height plane. */
            _dnDrawSign(ctx) {
                const G = this._dnGeo(), z = DN.CANOPY_Z, cam = game.camera, k = this._dnK(z);
                const x = (G.canopy.x0 + G.canopy.x1) / 2, y = G.canopy.y1 - 16;
                const dark = this.getAmbientDarknessSafe ? this.getAmbientDarknessSafe() : (game.getAmbientDarkness ? game.getAmbientDarkness() : 0.6);
                const t = _frameTime, a = Math.max(0.55, Math.min(1, 0.9 + Math.sin(t / 1300) * 0.08 + (Math.sin(t / 4100) > 0.95 ? -0.35 : 0)));
                ctx.save();
                ctx.globalAlpha = Math.max(0.45, this._dnFade == null ? 1 : this._dnFade);
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                ctx.font = '30px "Great Vibes", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const on = 0.35 + 0.65 * Math.min(1, dark * 1.4);
                if (_zoomLOD < 1) { ctx.shadowColor = '#ff1a55'; ctx.shadowBlur = 18 * a * on; }
                ctx.fillStyle = `rgba(255, 40, 90, ${a * on})`; ctx.fillText('Double Nights', x, y);
                ctx.shadowBlur = 0; ctx.fillStyle = `rgba(255, 236, 240, ${0.55 * a * on})`; ctx.fillText('Double Nights', x, y);
                ctx.restore();
            }
        });
