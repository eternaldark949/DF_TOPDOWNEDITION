        /* =====================================================================
           TOWN GATE — the way into Darklands' gated suburb (DRAFT)
           ---------------------------------------------------------------------
           The classic gated-community entrance, on the tiered kit
           (buildings/tiered-kit.js), so every piece stands up with the lean:
             · two tall red-brick piers either side of the road, each with sunk
               panels and a stone plinth, a stepped stone cap and an iron lantern
               on top that lights the road at night;
             · the wings: a low brick wall under a stone coping, broken by
               shorter brick posts with stone caps and ball finials;
             · a black iron fence set into the coping along each wing: spear-
               topped pickets between two rails, a band of rings under the top
               rail. Each picket is a real upright: its foot on the coping, its
               head projected at its own height (_gtP), so the fence leans with
               the camera like the walls do, and doesn't sit at one baked angle;
             · in the gap, a pair of iron gates (open 0..1, swinging inward, to
               the north) under a bowed top, and above them an iron arch between
               the piers with the town's name on a plate.
           The plan is laid out with its front (outside the town) to the south,
           +y; config.wing is how far each wing runs out from the piers.
           ===================================================================== */
        const GATE_PLAN = {
            GAP: 150, PIER: 44, PIER_Z: 34,             // the road's width; the piers' side and height (design units)
            T: 16, WALL_Z: 7, FENCE: 17,                // the wing wall's thickness and height; the fence above its coping
            POST: 24, POST_Z: 20, BAY: 112,             // the wings' posts, and how far apart
            GATE: [24, 34],                             // the gates' height at the piers and in the middle (the bow)
            ARCH: [3, 15]                               // the arch over them: its springing above the piers' caps, and its crown
        };
        const GATE_COL = {
            brick: '#7b3427', brickHi: '#93432f', brickLo: '#5a241b', mortar: '#3a2420',
            stone: '#77726a', stoneHi: '#8c877d', stoneLo: '#55514b',
            iron: '#121315', ironHi: 'rgba(150,160,175,.45)', glass: '#2a2a22'
        };

        /** Brick: courses with staggered joints, a few bricks off-colour, a stone plinth; on the piers a sunk panel on each face */
        function _gtBrick(d, l, t, H, L) {
            const C = GATE_COL, r = seededRandom(t.seed || 5), bh = 1.5, bw = 8;
            d.fillStyle = C.brick; d.fillRect(0, 0, L, H);
            for (let row = 0, y = 0; y < H; row++, y += bh) {
                const off = row % 2 ? bw / 2 : 0;
                for (let x = -off; x < L; x += bw) {
                    const v = r();
                    if (v < 0.22) { d.fillStyle = v < 0.08 ? C.brickLo : C.brickHi; d.fillRect(x + 0.3, y + 0.15, bw - 0.6, bh - 0.3); }
                    d.fillStyle = C.mortar; d.fillRect(x, y, 0.45, bh);
                }
                d.fillStyle = C.mortar; d.fillRect(0, y, L, 0.22);
            }
            for (let i = 0; i < L / 5; i++) { d.fillStyle = `rgba(20,14,12,${0.06 + r() * 0.1})`; d.fillRect(r() * L, r() * H * 0.7, 0.5 + r() * 1.5, 1 + r() * 5); }   // weathering
            const pl = Math.min(3, H * 0.3);
            d.fillStyle = C.stone; d.fillRect(0, H - pl, L, pl);
            d.fillStyle = C.stoneHi; d.fillRect(0, H - pl, L, 0.35); d.fillStyle = 'rgba(0,0,0,.25)'; d.fillRect(0, H - 0.5, L, 0.5);
            if (!t.panel) return;
            for (const e of t.mitre) {
                if (!e) continue;
                const x0 = e.u0 + 5, w = e.L - 10, y0 = 6, y1 = H - pl - 4;
                d.fillStyle = C.stone; d.fillRect(x0 - 1, y0 - 1, w + 2, y1 - y0 + 2);
                d.fillStyle = C.brickLo; d.fillRect(x0, y0, w, y1 - y0);
                for (let y = y0 + bh; y < y1; y += bh) { d.fillStyle = 'rgba(30,16,14,.7)'; d.fillRect(x0, y, w, 0.22); }
                d.fillStyle = 'rgba(0,0,0,.35)'; d.fillRect(x0, y0, w, 0.8); d.fillRect(x0, y0, 0.8, y1 - y0);   // the panel's sunk edge in shadow
            }
        }
        function _gtIronStrip(d, l, t, H, L) { d.fillStyle = GATE_COL.iron; d.fillRect(0, 0, L, H); }
        function _gtStoneRoof(c, glow, t) {
            if (glow) return; const [x0, y0, x1, y1] = t.box, C = GATE_COL;
            c.fillStyle = C.stone; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            c.fillStyle = 'rgba(0,0,0,.14)'; for (let x = x0 + 22; x < x1; x += 22) c.fillRect(x, y0, 1, y1 - y0);   // the coping's joints
        }
        function _gtNone() {}
        function _gtFenceTop(ctx, emissive, t, b) { if (!emissive) b._gtFence(ctx, t); }
        function _gtPierTop(ctx, emissive, t, b) { b._gtPierCap(ctx, t, emissive); }
        function _gtPostTop(ctx, emissive, t, b) { if (!emissive) b._gtPostCap(ctx, t); }
        function _gtGateTop(ctx, emissive, t, b) { if (!emissive) b._gtGates(ctx); }

        class TownGate extends TieredBuilding {
            constructor(config) {
                super(config);
                this._gt = config._gt;
                this.crownZ = (GATE_PLAN.PIER_Z + 18) * TierKit.Z_SCALE * this.hero;
                this.regenerateLights();                    // (the lanterns need _gt, set after the stock constructor made the lights)
            }
            _setupSign() { this.attachedSign = null; }
            _generateLights() {
                this.topReach = 30;
                if (!this._gt) return;
                for (const px of this._gt.piers) {
                    const [x, y] = this._tkLocal(px + GATE_PLAN.PIER / 2, GATE_PLAN.PIER / 2);
                    const l = new LampEntity({ x: this.x + x, y: this.y + y + 30, lampType: 3, color: '#ffcf8a', lightRadius: 230 });
                    l.visible = false; l.keepColor = true; this.attachedLights.push(l);
                }
            }
            drawSign() {}
            /** Closed gates are solid too */
            getCollisionShapes() {
                const s = super.getCollisionShapes(), g = this._gt;
                if (g && g.open < 0.05) { const [x0] = this._tkLocal(g.gapX, 0); s.push({ x: this.x + Math.min(x0, this._tkLocal(g.gapX + GATE_PLAN.GAP, 0)[0]), y: this.y + GATE_PLAN.PIER / 2 - 3, w: GATE_PLAN.GAP, h: 6 }); }
                return s;
            }
        }
        TierKit.profile(TownGate);

        /**
         * The gate: x, y its corner (the far end of the west wing, its back), the road through the middle running north–south.
         * config: wing (each wing's length, px; 0 for the piers alone), open (the gates, 0 shut .. 1 wide), name (on the arch), seed.
         */
        function createTownGate(x, y, config = {}) {
            const P = GATE_PLAN, wing = config.wing ?? P.BAY * 3, W = wing * 2 + P.PIER * 2 + P.GAP, D = P.PIER, yc = D / 2;
            const piers = [wing, wing + P.PIER + P.GAP], gapX = wing + P.PIER;
            const ledge = (z, out, th, top) => ({ z, out, th, top, band: [112, 107, 99], lip: 'rgba(220,214,200,.5)' });
            const tiers = [];
            piers.forEach((px, i) => tiers.push({
                id: 'pier' + i, rect: [px, 0, P.PIER, P.PIER], z0: 0, z1: P.PIER_Z, S: 3, seed: 11 + i, panel: true, fill: GATE_COL.brick, paint: _gtBrick,
                shade: [20, 10, 8], ledges: [ledge(4.5, 1.2, 1.2, GATE_COL.stone), ledge(P.PIER_Z - 1.6, 1.6, 1.4, GATE_COL.stone), ledge(P.PIER_Z, 3, 1.6, GATE_COL.stoneHi)],
                roofRes: 1, roof: _gtStoneRoof, top: _gtPierTop
            }));
            // Each wing: its posts every BAY from the far end, and the wall (with its fence) between them
            for (const side of [0, 1]) {
                if (wing <= 0) break;
                const a = side ? piers[1] + P.PIER : 0, b = side ? W : wing;
                const posts = [];
                for (let k = 0; ; k++) { const px = side ? b - P.POST - k * P.BAY : a + k * P.BAY; if (side ? px < a + P.BAY * 0.5 : px > b - P.BAY * 0.5) break; posts.push(px); }
                posts.sort((p, q) => p - q);
                posts.forEach((px, k) => tiers.push({
                    id: `post${side}_${k}`, rect: [px, yc - P.POST / 2, P.POST, P.POST], z0: 0, z1: P.POST_Z, S: 3, seed: 30 + side * 10 + k, fill: GATE_COL.brick, paint: _gtBrick,
                    shade: [20, 10, 8], ledges: [ledge(P.POST_Z, 2.2, 1.4, GATE_COL.stoneHi)], roofRes: 1, roof: _gtStoneRoof, top: _gtPostTop
                }));
                // the runs of wall between the posts and the pier
                const stops = posts.map(px => [px, px + P.POST]);
                if (side) stops.unshift([a - P.PIER, a]); else stops.push([b, b + P.PIER]);
                for (let k = 0; k < stops.length - 1; k++) {
                    const x0 = stops[k][1], x1 = stops[k + 1][0];
                    if (x1 - x0 < 4) continue;
                    tiers.push({
                        id: `wall${side}_${k}`, rect: [x0, yc - P.T / 2, x1 - x0, P.T], z0: 0, z1: P.WALL_Z, S: 3, seed: 50 + side * 10 + k, fill: GATE_COL.brick, paint: _gtBrick,
                        shade: [20, 10, 8], ledges: [ledge(P.WALL_Z, 1.8, 1.3, GATE_COL.stoneHi)], roofRes: 1, roof: _gtStoneRoof, top: _gtFenceTop, run: [x0, x1]
                    });
                }
            }
            // The gates and arch: drawn from a sill across the road (the threshold, an iron strip)
            tiers.push({ id: 'gate', solid: false, rect: [gapX, yc - 1.5, P.GAP, 3], z0: 0, z1: 0.6, S: 2, fill: GATE_COL.iron, paint: _gtIronStrip, roofRes: 1, roof: _gtNone, top: _gtGateTop });
            return new TownGate({
                id: config.id || 'town_gate', x, y, label: config.label || 'Gate', type: 'gate', facing: 'S', hero: 1.1,
                plan: { W, D },
                roofColor: GATE_COL.stone, roofLightColor: GATE_COL.stone, wallColor: GATE_COL.brick, wallLightColor: GATE_COL.brick, accentColor: GATE_COL.stone,
                windowColor: '#000', windowLitColor: '#ffcf8a', windowFrameColor: GATE_COL.stone, balconies: [], roofProps: [], sign: null,
                _gt: { piers, gapX, open: Math.max(0, Math.min(1, config.open ?? 0.15)), name: config.name ?? 'DARKLANDS', seed: config.seed || 3 },
                tiers,
                ...config
            });
        }

        Object.assign(TownGate.prototype, {
            // (plan → world, then the lean; heights in design units)
            _gtW(x, y) { const [wx, wy] = this._tkLocal(x, y); return [this.x + wx, this.y + wy]; },
            _gtP(x, y, z) { const [wx, wy] = this._gtW(x, y); return this._tkP(wx, wy, z); },
            _gtPx() { return Math.max(0.6, (game.camera && game.camera.zoom) ? 1 / Math.sqrt(game.camera.zoom) : 1); },

            /** A polyline of plan points at heights: [[x, y, z], ...] */
            _gtLine(ctx, pts, w, col) {
                ctx.beginPath(); pts.forEach(([x, y, z], i) => { const p = this._gtP(x, y, z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
                ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
            },
            /** One upright of iron from z0 to z1 with a spear head on top (the head flat in the fence's line, dx dy along it) */
            _gtPicket(ctx, x, y, z0, z1, dx, dy, w, head) {
                // (x, y world, not plan)
                const a = this._tkP(x, y, z0), b = this._tkP(x, y, z1);
                ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                if (head) {
                    const l = this._tkP(x - dx * 1.6, y - dy * 1.6, z1), r = this._tkP(x + dx * 1.6, y + dy * 1.6, z1), tip = this._tkP(x, y, z1 + 2.6), n = this._tkP(x, y, z1 + 0.8);
                    head.moveTo(n[0], n[1]); head.lineTo(l[0], l[1]); head.lineTo(tip[0], tip[1]); head.lineTo(r[0], r[1]); head.closePath();
                }
            },

            /** A wing's fence: pickets set into the coping, a bottom and a top rail, a band of rings under the top rail */
            _gtFence(ctx, t) {
                const P = GATE_PLAN, C = GATE_COL, [x0, x1] = t.run, yc = P.PIER / 2, zb = P.WALL_Z + 0.4, zt = zb + P.FENCE, px = this._gtPx();
                const [ux, uy] = (() => { const a = this._gtW(0, 0), b = this._gtW(1, 0); return [b[0] - a[0], b[1] - a[1]]; })();
                ctx.save(); ctx.lineCap = 'round';
                const bars = new Path2D(), heads = new Path2D();
                const n = Math.max(2, Math.round((x1 - x0 - 6) / 7));
                for (let i = 0; i <= n; i++) { const x = x0 + 3 + (x1 - x0 - 6) * i / n, [wx, wy] = this._gtW(x, yc); this._gtPicket(bars, wx, wy, zb, zt, ux, uy, 0, heads); }
                // the uprights (drawn in world points: _gtPicket takes world x, y)
                ctx.strokeStyle = C.iron; ctx.lineWidth = 1.7 * px; ctx.stroke(bars);
                ctx.strokeStyle = C.ironHi; ctx.lineWidth = 0.5 * px; ctx.save(); ctx.translate(-0.5, 0); ctx.stroke(bars); ctx.restore();
                ctx.fillStyle = C.iron; ctx.fill(heads);
                for (const z of [zb + 1.6, zt - 2.4, zt - 0.4]) this._gtLine(ctx, [[x0, yc, z], [x1, yc, z]], (z === zb + 1.6 ? 2 : 1.6) * px, C.iron);
                // the rings between the two upper rails, one in every bay of pickets
                ctx.strokeStyle = C.iron; ctx.lineWidth = 0.9 * px; ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const x = x0 + 3 + (x1 - x0 - 6) * (i + 0.5) / n, c = this._gtP(x, yc, zt - 1.4), top = this._gtP(x, yc, zt - 0.4);
                    const rr = Math.max(1, Math.hypot(top[0] - c[0], top[1] - c[1])); ctx.moveTo(c[0] + rr, c[1]); ctx.arc(c[0], c[1], rr, 0, Math.PI * 2);
                }
                ctx.stroke();
                ctx.restore();
            },

            /** A box of plan coordinates (x0, y0)–(x1, y1), z0..z1 */
            _gtBox(ctx, x0, y0, x1, y1, z0, z1, wall, cap) {
                const [ax, ay] = this._gtW(x0, y0), [bx, by] = this._gtW(x1, y1);
                EntranceLamps.prism(ctx, this, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), z0, z1, wall, cap);
            },
            /** A pyramid on a square of plan coordinates from z0 to an apex at z1: the far faces first */
            _gtPyramid(ctx, x0, y0, x1, y1, z0, z1, cols) {
                const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => this._gtP(x, y, z0)), apex = this._gtP((x0 + x1) / 2, (y0 + y1) / 2, z1);
                const tris = [0, 1, 2, 3].map(i => ({ q: [c[i], c[(i + 1) % 4], apex], col: cols[i] }));
                const area = q => (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
                tris.sort((a, b) => (area(a.q) > 0) - (area(b.q) > 0));
                for (const { q, col } of tris) { ctx.beginPath(); ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.lineTo(...q[2]); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.6; ctx.stroke(); }
            },

            /** On a pier: the stone cap's low pyramid, a plinth, and the iron lantern (its glass lit in the glow pass) */
            _gtPierCap(ctx, t, emissive) {
                const P = GATE_PLAN, C = GATE_COL, i = +t.id.slice(4), px = this._gt.piers[i], x0 = px, x1 = px + P.PIER, z = P.PIER_Z, m = (x0 + x1) / 2, yc = P.PIER / 2;
                if (!emissive) {
                    this._gtPyramid(ctx, x0 - 1, -1, x1 + 1, P.PIER + 1, z, z + 4, [C.stoneLo, C.stone, C.stoneHi, C.stone]);
                    this._gtBox(ctx, m - 6, yc - 6, m + 6, yc + 6, z + 2.5, z + 5, C.stone, C.stoneHi);
                    // the lantern: a post, a cage of four iron corners round the glass, a pointed roof
                    this._gtBox(ctx, m - 2, yc - 2, m + 2, yc + 2, z + 5, z + 7, C.iron, C.iron);
                    this._gtBox(ctx, m - 4.5, yc - 4.5, m + 4.5, yc + 4.5, z + 7, z + 15, C.glass, null);
                    ctx.save(); ctx.lineCap = 'round'; ctx.beginPath();
                    for (const [cx, cy] of [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]]) { const [wx, wy] = this._gtW(m + cx, yc + cy); this._gtPicket(ctx, wx, wy, z + 7, z + 15, 0, 0, 0, null); }
                    ctx.strokeStyle = C.iron; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
                    this._gtPyramid(ctx, m - 6, yc - 6, m + 6, yc + 6, z + 15, z + 19, [C.iron, '#1d1f22', '#2a2c30', '#1d1f22']);
                } else {
                    // the glass, warm, and a halo round it
                    const c = this._gtP(m, yc, z + 11), top = this._gtP(m, yc, z + 15), r = Math.max(4, Math.hypot(top[0] - c[0], top[1] - c[1]) * 1.4);
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    this._gtBox(ctx, m - 4, yc - 4, m + 4, yc + 4, z + 7.5, z + 14.5, 'rgba(255,190,110,.75)', 'rgba(255,215,150,.6)');
                    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r * 5); g.addColorStop(0, 'rgba(255,200,120,.45)'); g.addColorStop(1, 'rgba(255,170,90,0)');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], r * 5, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            },

            /** On a wing post: its stone cap's pyramid and a ball */
            _gtPostCap(ctx, t) {
                const P = GATE_PLAN, C = GATE_COL, [[x0, y0], , [x1, y1]] = TierKit.rect(...t.rect), z = P.POST_Z;
                this._gtPyramid(ctx, x0 - 1, y0 - 1, x1 + 1, y1 + 1, z, z + 3, [C.stoneLo, C.stone, C.stoneHi, C.stone]);
                const m = (x0 + x1) / 2, yc = (y0 + y1) / 2, c = this._gtP(m, yc, z + 6.5), top = this._gtP(m, yc, z + 9), r = Math.max(2.5, Math.hypot(top[0] - c[0], top[1] - c[1]) + 3.5);
                const n = this._gtP(m, yc, z + 3); ctx.fillStyle = C.stoneLo; ctx.fillRect(n[0] - 2, Math.min(n[1], c[1]), 4, Math.abs(c[1] - n[1]) + 0.1);
                const g = ctx.createRadialGradient(c[0] - r * 0.35, c[1] - r * 0.4, r * 0.1, c[0], c[1], r); g.addColorStop(0, C.stoneHi); g.addColorStop(1, C.stoneLo);
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.fill();
            },

            /** The pair of gates in the road, then the arch over them with the name on its plate */
            _gtGates(ctx) {
                const P = GATE_PLAN, C = GATE_COL, g = this._gt, yc = P.PIER / 2, half = P.GAP / 2, px = this._gtPx();
                const ang = g.open * Math.PI * 0.42;
                ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (const side of [-1, 1]) {
                    // hinged at the pier, swinging north into town; s runs 0 (hinge) .. 1 (the meeting stile)
                    const hx = side < 0 ? g.gapX + 2 : g.gapX + P.GAP - 2, len = half - 3;
                    const at = (s) => [hx - side * len * s * Math.cos(ang), yc - len * s * Math.sin(ang)];
                    const zTop = (s) => P.GATE[0] + (P.GATE[1] - P.GATE[0]) * Math.sin(Math.PI / 2 * s);   // the bow: up toward the middle of the road
                    const [dx, dy] = (() => { const a = this._gtW(...at(0)), b = this._gtW(...at(1)); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; })();
                    const bars = new Path2D(), heads = new Path2D(), n = 11;
                    for (let i = 1; i < n; i++) { const s = i / n, [wx, wy] = this._gtW(...at(s)); this._gtPicket(bars, wx, wy, 1, zTop(s) + 1.2, dx, dy, 0, heads); }
                    ctx.strokeStyle = C.iron; ctx.lineWidth = 1.5 * px; ctx.stroke(bars); ctx.fillStyle = C.iron; ctx.fill(heads);
                    // the stiles, the rails (the top one bowed), the band of rings and the dog bars at the foot
                    const stile = new Path2D();
                    for (const s of [0, 1]) { const [wx, wy] = this._gtW(...at(s)); this._gtPicket(stile, wx, wy, 0.5, zTop(s) + (s ? 0 : 0.5), 0, 0, 0, null); }
                    ctx.lineWidth = 2.6 * px; ctx.stroke(stile);
                    const curve = (f) => Array.from({ length: 13 }, (_, i) => { const s = i / 12; return [...at(s), f(s)]; });
                    this._gtLine(ctx, curve(s => zTop(s)), 2.2 * px, C.iron);
                    this._gtLine(ctx, curve(s => zTop(s) - 3.2), 1.6 * px, C.iron);
                    this._gtLine(ctx, curve(() => 9), 1.8 * px, C.iron);
                    this._gtLine(ctx, curve(() => 2), 2 * px, C.iron);
                    ctx.lineWidth = 0.9 * px; ctx.beginPath();
                    for (let i = 0; i < n; i++) {
                        const s = (i + 0.5) / n, z = zTop(s) - 1.6, c = this._gtP(...at(s), z), tp = this._gtP(...at(s), z + 1.1), rr = Math.max(1, Math.hypot(tp[0] - c[0], tp[1] - c[1]));
                        ctx.moveTo(c[0] + rr, c[1]); ctx.arc(c[0], c[1], rr, 0, Math.PI * 2);
                    }
                    ctx.stroke();
                    // a scroll in the lower panel by the hinge, and the highlight down the stiles
                    const sc = this._gtP(...at(0.16), 5.5), st = this._gtP(...at(0.16), 8.2), sr = Math.max(2, Math.hypot(st[0] - sc[0], st[1] - sc[1]));
                    ctx.lineWidth = 1.1 * px; ctx.beginPath(); ctx.arc(sc[0], sc[1], sr, 0.2, Math.PI * 1.7); ctx.arc(sc[0] + sr * 0.3, sc[1], sr * 0.5, Math.PI * 1.7, Math.PI * 3.1); ctx.stroke();
                    ctx.strokeStyle = C.ironHi; ctx.lineWidth = 0.5 * px; ctx.save(); ctx.translate(-0.6, 0); ctx.stroke(stile); ctx.restore();
                }
                // The arch: two bowed iron bands from pier to pier, rings between, and the plate with the name at its crown
                const ax0 = g.gapX - 4, ax1 = g.gapX + P.GAP + 4, z0 = P.PIER_Z + P.ARCH[0], z1 = P.PIER_Z + P.ARCH[1];
                const arch = (dz) => Array.from({ length: 25 }, (_, i) => { const s = i / 24; return [ax0 + (ax1 - ax0) * s, yc, z0 + (z1 - z0) * Math.sin(Math.PI * s) - dz]; });
                this._gtLine(ctx, arch(0), 2.6 * px, C.iron);
                this._gtLine(ctx, arch(4.2), 2 * px, C.iron);
                ctx.strokeStyle = C.iron; ctx.lineWidth = 1 * px; ctx.beginPath();
                for (let i = 1; i < 16; i++) {
                    const s = i / 16; if (Math.abs(s - 0.5) < 0.16) continue;
                    const x = ax0 + (ax1 - ax0) * s, z = z0 + (z1 - z0) * Math.sin(Math.PI * s) - 2.1, c = this._gtP(x, yc, z), tp = this._gtP(x, yc, z + 1.6), rr = Math.max(1.2, Math.hypot(tp[0] - c[0], tp[1] - c[1]));
                    ctx.moveTo(c[0] + rr, c[1]); ctx.arc(c[0], c[1], rr, 0, Math.PI * 2);
                }
                ctx.stroke();
                if (g.name) this._gtPlate(ctx, (ax0 + ax1) / 2, yc, z1 - 6.2, z1 + 2.4, 44, g.name);
                ctx.restore();
            },

            /** A plate standing in the arch (a vertical plane along x at plan y), its letters drawn in its own plane */
            _gtPlate(ctx, cx, y, zb, zt, w, text) {
                const C = GATE_COL, x0 = cx - w / 2, x1 = cx + w / 2;
                const A = this._gtP(x0, y, zt), B = this._gtP(x1, y, zt), D = this._gtP(x0, y, zb), Bb = this._gtP(x1, y, zb), h = (zt - zb);
                ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...Bb); ctx.lineTo(...D); ctx.closePath();
                ctx.fillStyle = C.iron; ctx.fill(); ctx.strokeStyle = 'rgba(180,170,150,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
                // (an affine map of the plate's own frame: u along it, v down it, onto its quad on screen)
                ctx.save();
                ctx.transform((B[0] - A[0]) / w, (B[1] - A[1]) / w, (D[0] - A[0]) / h, (D[1] - A[1]) / h, A[0], A[1]);
                ctx.fillStyle = '#b9b2a2'; ctx.font = `bold ${h * 0.62}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const tw = ctx.measureText(text).width, sx = Math.min(1, (w - 4) / Math.max(1, tw));
                ctx.translate(w / 2, h / 2 + h * 0.04); ctx.scale(sx, 1); ctx.fillText(text, 0, 0);
                ctx.restore();
            }
        });
