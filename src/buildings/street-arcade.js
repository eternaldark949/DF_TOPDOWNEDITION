        /* =====================================================================
           STREET ARCADES — the shopping streets in limestone
           ---------------------------------------------------------------------
           The street variant most generic shops take (buildings/street-variants.js,
           id 'arcade'): a limestone house of seven to nine storeys, built from a
           few shared parts so a row of them reads as one shopping street.

             · the arcade: tall arched shopfronts the width of the front, one
               every ARCADE.BAY px, laid out from the door outward (the door's
               arch is the middle one); voussoirs and keystones, a stall riser,
               bronze-framed glass lit warm inside, and a dark awning over each
               arch; over the door and its two neighbours a wide canopy with the
               shop's name in gold;
             · over it a cornice, then a wrought-iron balcony the length of the
               front, French windows with hoods (balconettes on the second
               storey), the main cornice, and a slate mansard storey with
               pedimented dormers;
             · the roof: the mansard's four slate slopes, dormers on the front
               and back, chimney stacks on the party walls, a zinc flat;
             · on the pavement: a stone step at each arch, clipped cone
               topiaries in iron planters at the piers.
           It leans ARCADE.HERO times as hard as the street (leanHero), as the
           landmarks do, so its front reads from across the street.
           Variation per shop (from its seed): the stone's tone (cream, honey,
           pearl), the awning colour, seven to nine storeys, the name.

           Everything is drawn the way the other variants are: the walls are a
           few projected fills a face (_vArcUnder, _vArcFace), the ledges and
           balconies are the landmark kit's (LandmarkKit.ledge / veranda), the
           roof and the pavement dressing are baked once per tone, frame and
           door place (StreetArt) and stamped. Sections, doors, collision and
           lights are unchanged.
           ===================================================================== */
        const ARCADE = {
            A: 18,          // the arcade's height: the ground floor's arches stand this tall (a double-height shop floor)
            HERO: 3.5,      // it leans this many times as hard as the street (the Ashgrove leans 2.1)
            BAY: 32,        // an arch (and the windows over it) every this far along the front
            AW: 20,         // an arch's width
            M: 8,           // the mansard storey
            TONES: [
                { id: 'cream', stone: '#ddd2b8', lo: '#bcb094', hi: '#f6efdc', dk: '#8a7f66' },
                { id: 'honey', stone: '#dbc59a', lo: '#b9a276', hi: '#f4e4c0', dk: '#86724c' },
                { id: 'pearl', stone: '#d3d0c6', lo: '#aeaaa0', hi: '#f0eee8', dk: '#7c786e' }
            ],
            SLATE: { slate: '#3b4450', lo: '#2a313a', hi: '#5b6674', zinc: '#3c424a', zincLo: '#30353c' },
            IRON: '#17181c', GOLD: '#d8b46a', GLASS: '#28241f', BRONZE: '#3a2a1c', PANE: '#22272e'
        };

        Object.assign(BuildingV2.prototype, {
            /** An arcade's own picks (from _pickVariant): its stone, no generic facade feature */
            _vArcInit(v, r) {
                v.tone = ARCADE.TONES[Math.floor(r(6) * ARCADE.TONES.length)];
                this.colors.wall = v.tone.stone;
                this.facadeFeature = null;
                this.leanHero = ARCADE.HERO;                                       // BuildingV2._leanScale
                this.crownZ = this._vH() * ARCADE.HERO;                             // the render query's reach (perspective at crownZ ≥ the hero lean at the roof)
            },

            /** Run fn with the landmark kit leaning as hard as this building does (ledges, balconies, awnings, the board) */
            _vLean(fn) {
                const h = this.leanHero;
                return LandmarkKit.using((z) => { const C = leanCamHeight(); return 1 + (C / (C - Math.min(z, C * 0.86)) - 1) * h; }, fn);
            },

            /** The bays along the front (frame x of each arch's middle), laid out from the door, and the door's frame x */
            _vArcBays() {
                const F = this._vFrame();
                if (this._vArc && this._vArc.F === F) return this._vArc;
                const B = ARCADE.BAY, xs = [];
                for (let k = -12; k <= 12; k++) { const x = F.door + k * B; if (x - B / 2 >= 2 && x + B / 2 <= F.fw - 2) xs.push(x); }
                return (this._vArc = { F, xs, door: F.door, side: this.facing === 'N' || this.facing === 'E' ? -1 : 1 });
            },

            /** The key its shared bakes go under: tone and door place */
            _vArcKey() { const B = this._vArcBays(); return `${this.variant.tone.id}|${Math.round(B.door)}`; },

            /** Bays on a face as u (0..1 along it): the front's arches, or evenly spaced on the other faces */
            _vArcU(f, G) {
                if (f.side === this.facing) {
                    const B = this._vArcBays(), g = this._frontGeo(), ex = f.x2 - f.x1, ey = f.y2 - f.y1, L2 = ex * ex + ey * ey;
                    return B.xs.map(x => {
                        const s = (x - B.F.fw / 2) * B.side, px = g.cx + g.ux * s, py = g.cy + g.uy * s;
                        return { u: ((px - f.x1) * ex + (py - f.y1) * ey) / L2, door: Math.abs(x - B.door) < 1 };
                    }).filter(b => b.u > 0 && b.u < 1);
                }
                const n = Math.max(1, Math.floor(G.L / ARCADE.BAY)), out = [];
                for (let i = 0; i < n; i++) out.push({ u: (i + 0.5) / n, door: false });
                return out;
            },

            /** The storeys between the arcade and the mansard: [z0, z1] each */
            _vArcStoreys(H) {
                const z0 = ARCADE.A + 2, top = H - ARCADE.M, n = Math.max(1, Math.round((top - z0) / 10)), sh = (top - z0) / n, out = [];
                for (let i = 0; i < n; i++) out.push([z0 + i * sh, z0 + (i + 1) * sh]);
                return out;
            },

            /* ---------------- walls ---------------- */

            /** Under everything on a face: the plinth, the arcade's rusticated joints, ashlar courses, the slate mansard */
            _vArcUnder(ctx, f, G, H) {
                const A = ARCADE, T = this.variant.tone, top = H - A.M, fine = _zoomLOD < 2 && G.depth > 8;
                ctx.fillStyle = T.lo; ctx.fill(G.quad(new Path2D(), 0, 1, 0, 0.9 / H));
                ctx.fillStyle = A.SLATE.slate; ctx.fill(G.quad(new Path2D(), 0, 1, top / H, 1));
                if (!fine) return;
                const rj = new Path2D(), aj = new Path2D(), sj = new Path2D();
                for (let z = 2.3; z < A.A; z += 2.3) G.line(rj, 0, z / H, 1, z / H);
                for (let z = A.A + 4; z < top - 1; z += 3.6) G.line(aj, 0, z / H, 1, z / H);
                for (let z = top + 1.8; z < H - 0.5; z += 1.8) G.line(sj, 0, z / H, 1, z / H);
                ctx.lineWidth = 0.6;
                ctx.strokeStyle = hexToRgba(T.dk, 0.45); ctx.stroke(rj);
                ctx.strokeStyle = hexToRgba(T.dk, 0.18); ctx.stroke(aj);
                ctx.strokeStyle = 'rgba(14,18,24,.45)'; ctx.stroke(sj);
            },

            /**
             * A face's openings: on the front the arches (glass, door, voussoirs, keystones); on every face the French
             * windows over each bay and the dormers in the mansard. emissive: just what's lit, in the glow pass.
             */
            _vArcFace(ctx, f, G, H, emissive) {
                const A = ARCADE, T = this.variant.tone, L = G.L, front = f.side === this.facing, seed = this.variant.seed;
                const bays = this._vArcU(f, G), storeys = this._vArcStoreys(H), top = H - A.M, fine = _zoomLOD < 2 && G.depth > 6;
                const rect = (p, u0, u1, z0, z1) => G.quad(p, u0, u1, z0 / H, z1 / H);
                const poly = (p, pts) => { pts.forEach(([u, z], i) => { const q = G.at(u, z / H); if (i) p.lineTo(q[0], q[1]); else p.moveTo(q[0], q[1]); }); p.closePath(); return p; };
                const R = 4.2, zs = A.A - 1.6 - R, z0 = 2.2;   // the arch: its glass from z0, springing at zs, an elliptic head R tall
                const arch = (p, u, a, r, zb) => {
                    const pts = [[u - a, zb], [u - a, zs]];
                    for (let i = 1; i < 8; i++) { const t = Math.PI - i * Math.PI / 8; pts.push([u + a * Math.cos(t), zs + r * Math.sin(t)]); }
                    pts.push([u + a, zs], [u + a, zb]);
                    return poly(p, pts);
                };
                const lit = (i, p) => _bldHash(seed, 520 + i * 7 + f.side.charCodeAt(0) * 3) < p;
                const hw = 6.5 / L, glass = new Path2D(), warm = new Path2D(), dorm = new Path2D();
                if (emissive) {
                    if (front) for (const b of bays) {
                        const a = A.AW / 2 / L;
                        arch(b.door ? warm : glass, b.u, a, R, b.door ? 0.6 : z0);
                    }
                    bays.forEach((b, i) => storeys.forEach(([s0, s1], j) => { if (lit(i * 5 + j, 0.6)) rect(glass, b.u - hw, b.u + hw, s0 + 1.4, s1 - 1.6); }));
                    bays.forEach((b, i) => { if (lit(i + 40, 0.35)) rect(dorm, b.u - 3.2 / L, b.u + 3.2 / L, top + 1.8, H - 2.2); });
                    ctx.fillStyle = 'rgba(255,186,104,.62)'; ctx.fill(glass);
                    ctx.fillStyle = 'rgba(255,214,150,.9)'; ctx.fill(warm);
                    ctx.fillStyle = 'rgba(255,200,130,.55)'; ctx.fill(dorm);
                    return;
                }
                const stone = new Path2D(), dark = new Path2D(), bars = new Path2D(), keys = new Path2D(), riser = new Path2D(), leaves = new Path2D();
                if (front) for (const b of bays) {
                    const a = A.AW / 2 / L, u = b.u;
                    arch(stone, u, a + 1.7 / L, R + 1.6, 0.4);                                     // the voussoirs round it
                    if (b.door) {
                        arch(glass, u, a, R, 0.6);
                        rect(leaves, u - a + 0.8 / L, u + a - 0.8 / L, 0.6, zs - 0.5);             // the door's two leaves under a fanlight
                    } else {
                        arch(glass, u, a, R, z0); rect(riser, u - a, u + a, 0.6, z0);
                        if (fine) for (const m of [-1 / 3, 1 / 3]) rect(bars, u + a * m - 0.35 / L, u + a * m + 0.35 / L, z0, zs);
                    }
                    rect(bars, u - a, u + a, zs - 0.3, zs + 0.4);                                  // the transom
                    if (fine) rect(bars, u - 0.35 / L, u + 0.35 / L, b.door ? zs : z0, zs + R);    // the mullion
                    poly(keys, [[u - 1.4 / L, A.A + 0.2], [u + 1.4 / L, A.A + 0.2], [u + 0.8 / L, zs + R - 0.6], [u - 0.8 / L, zs + R - 0.6]]);
                }
                bays.forEach((b) => {
                    for (const [s0, s1] of storeys) {                                              // French windows, a stone surround and a hood
                        const w0 = s0 + 1.4, w1 = s1 - 1.6;
                        rect(stone, b.u - hw - 1.1 / L, b.u + hw + 1.1 / L, w0 - 0.8, w1 + 0.6);
                        rect(stone, b.u - hw - 2 / L, b.u + hw + 2 / L, w1 + 0.9, w1 + 1.7);
                        rect(dark, b.u - hw, b.u + hw, w0, w1);
                        if (fine) { rect(bars, b.u - 0.3 / L, b.u + 0.3 / L, w0, w1); rect(bars, b.u - hw, b.u + hw, w1 - 2.2, w1 - 1.7); }
                    }
                    const d0 = top + 1.8, d1 = H - 2.2, dw = 3.2 / L;                              // a dormer, its pediment
                    rect(stone, b.u - dw - 1.1 / L, b.u + dw + 1.1 / L, d0 - 0.6, d1 + 0.4);
                    poly(stone, [[b.u - dw - 1.9 / L, d1 + 0.4], [b.u + dw + 1.9 / L, d1 + 0.4], [b.u, H - 0.2]]);
                    rect(dorm, b.u - dw, b.u + dw, d0, d1);
                });
                ctx.fillStyle = T.hi; ctx.fill(stone);
                ctx.fillStyle = T.lo; ctx.fill(riser);
                ctx.fillStyle = A.GLASS; ctx.fill(glass);
                ctx.fillStyle = 'rgba(255,196,120,.2)'; ctx.fill(glass);                           // a warm room behind, even by day
                ctx.fillStyle = A.PANE; ctx.fill(dark); ctx.fill(dorm);
                ctx.fillStyle = 'rgba(176,190,214,.16)'; ctx.fill(dark);                           // the sky in the panes
                ctx.fillStyle = A.BRONZE; ctx.fill(leaves);
                ctx.fillStyle = A.IRON; ctx.fill(bars);
                ctx.fillStyle = T.stone; ctx.fill(keys);
                if (fine) { ctx.strokeStyle = hexToRgba(T.dk, 0.6); ctx.lineWidth = 0.5; ctx.stroke(keys); }
            },

            /** Over the windows on all faces: the openings, then the cornices, the balcony and balconettes, the zinc cap */
            _vArcOver(ctx, faces, P) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vArcOver(ctx, faces, P));
                const A = ARCADE, T = this.variant.tone, H = this._vH(), K = LandmarkKit, top = H - A.M, storeys = this._vArcStoreys(H);
                const edges = [], fronts = [], ettes = [], last = storeys.length - 1;
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P), L = G.L, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
                    edges.push({ a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny });
                    if (f.side === this.facing) {
                        fronts.push({ a: [f.x1 + ux * 6, f.y1 + uy * 6], b: [f.x2 - ux * 6, f.y2 - uy * 6], nx: f.nx, ny: f.ny });
                        for (const b of this._vArcU(f, G)) {
                            const x = f.x1 + (f.x2 - f.x1) * b.u, y = f.y1 + (f.y2 - f.y1) * b.u;
                            ettes.push({ a: [x - ux * 8, y - uy * 8], b: [x + ux * 8, y + uy * 8], nx: f.nx, ny: f.ny });
                        }
                    }
                    if (G.depth >= 3) this._vArcFace(ctx, f, G, H, false);
                }
                const lip = hexToRgba(T.hi, 0.85);
                K.ledge(ctx, edges, A.A + 2, 1.8, 2, T.hi, T.lo, lip);                              // the arcade's cornice
                if (_zoomLOD < 2) {
                    // a balcony the length of the front on the first storey and the top one, balconettes on every other storey between
                    storeys.forEach(([z0], i) => {
                        if (i === 0 || (i === last && last > 1)) { if (fronts.length) K.veranda(ctx, fronts, z0 + 0.6, 4.5, 2.4, 3.2, T.stone, T.lo, A.IRON); }
                        else if (i % 2 && ettes.length) K.veranda(ctx, ettes, z0 + 0.6, 2.4, 2, 2.6, T.stone, T.lo, A.IRON);
                    });
                }
                K.ledge(ctx, edges, top, 3, 2.4, T.hi, T.lo, lip);                                  // the main cornice
                K.ledge(ctx, edges, H, 1.2, 1, A.SLATE.hi, A.SLATE.lo, null);                       // the mansard's zinc cap
            },

            /* ---------------- the street front: awnings, the canopy with the name, wall lanterns ---------------- */

            _vArcFront(ctx, emissive) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vArcFront(ctx, emissive));
                const A = ARCADE, v = this.variant, S = v.spec, g = this._frontGeo(), K = LandmarkKit, B = this._vArcBays(), F = B.F;
                const sOf = (x) => (x - F.fw / 2) * B.side, sd = sOf(B.door), cw = A.BAY * 3 - 4, [ca, cb] = v.awning, zc = A.A + 0.4, oc = 15;
                // the name, sized to the canopy
                let font = `17px "Great Vibes", "URW Chancery L", "Z003", cursive`;
                const tw = this._vTextW(ctx, font);
                if (tw > cw - 14) font = `${Math.max(10, Math.floor(17 * (cw - 14) / tw))}px "Great Vibes", "URW Chancery L", "Z003", cursive`;
                const q = [0, 0], lamps = new Path2D(), halo = new Path2D();
                for (const x of B.xs) for (const px of [x - A.BAY / 2, x + A.BAY / 2]) {                 // a lantern on each pier, either side of the canopy too
                    if (Math.abs(px - B.door) < A.BAY * 1.4 || px < 4 || px > F.fw - 4) continue;
                    const p = this._vFrontPt(sOf(px), 1.6, A.A * 0.62);
                    lamps.moveTo(p[0] + 1.3, p[1]); lamps.arc(p[0], p[1], 1.3, 0, Math.PI * 2);
                    halo.moveTo(p[0] + 5, p[1]); halo.arc(p[0], p[1], 5, 0, Math.PI * 2);
                }
                if (emissive) {
                    ctx.fillStyle = 'rgba(255,190,110,.22)'; ctx.fill(halo);
                    ctx.fillStyle = 'rgba(255,232,180,.95)'; ctx.fill(lamps);
                } else {
                    // a dark awning over each arch outside the canopy, its valance hanging at the front edge
                    const aw = new Path2D(), val = new Path2D(), edge = new Path2D(), zt = A.A - 0.6, zf = A.A - 6.5, zv = zf - 2, out = 13, half = A.AW / 2 + 1.5;
                    const quad = (p, a, b, c, d) => { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath(); };
                    for (const x of B.xs) {
                        if (Math.abs(x - B.door) < A.BAY * 1.2) continue;
                        const s = sOf(x), s0 = s - half, s1 = s + half;
                        const t0 = this._vFrontPt(s0, 0, zt), t1 = this._vFrontPt(s1, 0, zt), f1 = this._vFrontPt(s1, out, zf), f0 = this._vFrontPt(s0, out, zf);
                        quad(aw, t0, t1, f1, f0);
                        quad(val, f0, f1, this._vFrontPt(s1, out, zv), this._vFrontPt(s0, out, zv));
                        edge.moveTo(f0[0], f0[1]); edge.lineTo(f1[0], f1[1]);
                    }
                    ctx.fillStyle = ca; ctx.fill(aw);
                    ctx.fillStyle = cb; ctx.fill(val);
                    ctx.strokeStyle = hexToRgba(A.GOLD, 0.55); ctx.lineWidth = 0.7; ctx.stroke(edge);
                    ctx.fillStyle = A.IRON; ctx.fill(lamps);
                    // the canopy over the door
                    K.ledge(ctx, [{ a: this._frontPt0(sd - cw / 2), b: this._frontPt0(sd + cw / 2), nx: g.nx, ny: g.ny }], zc, oc, 2.6, ca, cb, A.GOLD);
                }
                this._vBoard(ctx, zc, 0, (c, os) => {
                    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
                    c.fillStyle = emissive ? S.glow : S.ink; c.fillText(v.name, 0, os * oc / 2 + 1);
                });
            },

            /* ---------------- painters (once a tone, frame and door place) ---------------- */

            /** The roof: a cornice rim, the mansard's four slate slopes with their hips, dormers front and back, chimney stacks on the party walls, a zinc flat */
            _vArcPaintRoof(c, v, fw, fd) {
                const A = ARCADE, T = v.tone, Sl = A.SLATE, r0 = 3, m = 30, i0 = r0 + m, xs = this._vArcBays().xs;
                c.fillStyle = T.stone; c.fillRect(0, 0, fw, fd);
                c.strokeStyle = T.hi; c.lineWidth = 1; c.strokeRect(0.5, 0.5, fw - 1, fd - 1);
                const o = [[r0, r0], [fw - r0, r0], [fw - r0, fd - r0], [r0, fd - r0]], n = [[i0, i0], [fw - i0, i0], [fw - i0, fd - i0], [i0, fd - i0]];
                const slopes = [[[o[0], o[1], n[1], n[0]], '#232933', [0, 1]], [[o[1], o[2], n[2], n[1]], '#2f3742', [-1, 0]],
                                [[o[2], o[3], n[3], n[2]], '#3d4652', [0, -1]], [[o[3], o[0], n[0], n[3]], '#29303a', [1, 0]]];
                for (const [pts, col, nn] of slopes) {
                    c.save(); c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
                    c.fillStyle = col; c.fill(); c.clip();
                    const e0 = pts[0], ux = nn[1] ? 1 : 0, uy = nn[0] ? 1 : 0;
                    c.strokeStyle = 'rgba(12,16,22,.5)'; c.lineWidth = 0.6; c.beginPath();               // slate courses, and the joints staggered
                    for (let d = 2.4; d < m; d += 2.4) { c.moveTo(e0[0] + nn[0] * d - ux * 999, e0[1] + nn[1] * d - uy * 999); c.lineTo(e0[0] + nn[0] * d + ux * 999, e0[1] + nn[1] * d + uy * 999); }
                    c.stroke();
                    c.strokeStyle = 'rgba(12,16,22,.28)'; c.beginPath();
                    for (let d = 0, k = 0; d < m; d += 2.4, k++) for (let t = (k % 2) * 1.8 - 999; t < 999; t += 3.6) {
                        const x = e0[0] + nn[0] * d + ux * t, y = e0[1] + nn[1] * d + uy * t; c.moveTo(x, y); c.lineTo(x + nn[0] * 2.4, y + nn[1] * 2.4);
                    }
                    c.stroke(); c.restore();
                }
                c.strokeStyle = Sl.hi; c.lineWidth = 1.2; c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(o[i][0], o[i][1]); c.lineTo(n[i][0], n[i][1]); } c.stroke();
                // the zinc flat: standing seams
                const zg = c.createLinearGradient(i0, i0, fw - i0, fd - i0); zg.addColorStop(0, Sl.zinc); zg.addColorStop(1, Sl.zincLo);
                c.fillStyle = zg; c.fillRect(i0, i0, fw - 2 * i0, fd - 2 * i0);
                c.lineWidth = 0.7; c.strokeStyle = 'rgba(255,255,255,.1)'; c.beginPath(); for (let x = i0 + 6; x < fw - i0; x += 6) { c.moveTo(x, i0); c.lineTo(x, fd - i0); } c.stroke();
                c.strokeStyle = 'rgba(0,0,0,.22)'; c.beginPath(); for (let x = i0 + 7; x < fw - i0; x += 6) { c.moveTo(x, i0); c.lineTo(x, fd - i0); } c.stroke();
                c.strokeStyle = Sl.hi; c.lineWidth = 1.4; c.strokeRect(i0, i0, fw - 2 * i0, fd - 2 * i0);
                // dormers on the front and back slopes, one over each bay
                for (const x of xs) for (const [ye, dir] of [[fd - r0, -1], [r0, 1]]) {
                    const yi = ye + dir * 14, y0 = Math.min(ye, yi), h = Math.abs(yi - ye);
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 5 + 1.5, y0 + 1.5, 10, h);
                    c.fillStyle = '#414b57'; c.fillRect(x - 5, y0, 5, h); c.fillStyle = '#5a6572'; c.fillRect(x, y0, 5, h);
                    c.strokeStyle = T.hi; c.lineWidth = 0.9; c.strokeRect(x - 5, y0, 10, h);
                    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + h); c.lineWidth = 0.7; c.stroke();
                    c.fillStyle = T.hi; c.beginPath(); c.moveTo(x - 5.6, ye); c.lineTo(x + 5.6, ye); c.lineTo(x, ye + dir * 3.2); c.closePath(); c.fill();   // the pediment
                    c.fillStyle = A.PANE; c.fillRect(x - 3, ye + (dir > 0 ? 0 : -1.4), 6, 1.4);
                }
                // chimney stacks astride the party walls, pots on top
                for (const x of [0, fw - 12]) for (const y of [fd * 0.3, fd * 0.62]) {
                    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + 2.5, y + 3, 12, 22);
                    c.fillStyle = T.dk; c.fillRect(x, y, 12, 22); c.strokeStyle = T.lo; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 11, 21);
                    for (let i = 0; i < 3; i++) { c.fillStyle = '#9a5a3a'; c.beginPath(); c.arc(x + 6, y + 4.5 + i * 6.5, 2.5, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a0f0b'; c.beginPath(); c.arc(x + 6, y + 4.5 + i * 6.5, 1.3, 0, Math.PI * 2); c.fill(); }
                }
                // two roof lights in the zinc
                for (const [x, y, w, h] of this._vArcSkylights(fw, fd)) {
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 2, y + 2, w, h);
                    c.fillStyle = '#2b2f36'; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(170,196,226,.2)'; c.fillRect(x, y, w, h / 2);
                    c.strokeStyle = Sl.hi; c.lineWidth = 1.2; c.strokeRect(x, y, w, h);
                    c.beginPath(); for (let k = 1; k < 3; k++) { c.moveTo(x + w * k / 3, y); c.lineTo(x + w * k / 3, y + h); } c.lineWidth = 0.7; c.stroke();
                }
            },
            _vArcSkylights(fw, fd) { const w = 30, h = 14; return [[fw * 0.36 - w / 2, fd * 0.5 - h / 2, w, h], [fw * 0.64 - w / 2, fd * 0.5 - h / 2, w, h]]; },

            /** The roof's night light: some dormers lit, the roof lights */
            _vArcGlowPath(p, v, fw, fd) {
                const r0 = 3, xs = this._vArcBays().xs;
                xs.forEach((x, i) => {
                    if (_bldHash(v.seed, 600 + i) < 0.45) p.rect(x - 3, fd - r0 - 1.4, 6, 1.4);
                    if (_bldHash(v.seed, 640 + i) < 0.3) p.rect(x - 3, r0, 6, 1.4);
                });
                for (const [x, y, w, h] of this._vArcSkylights(fw, fd)) p.rect(x + 1, y + 1, w - 2, h - 2);
            },

            /** The pavement in front: a stone step at each arch, cone topiaries in iron planters at the piers */
            _vArcPaintBase(c, v, fw, fd, door) {
                const A = ARCADE, T = v.tone, B = A.BAY, xs = this._vArcBays().xs, y = fd;
                c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, y, fw, 2);
                c.fillStyle = hexToRgba(T.hi, 0.7);
                for (const x of xs) c.fillRect(x - A.AW / 2 - 1, y, A.AW + 2, Math.abs(x - door) < 1 ? 5 : 2.6);
                const piers = [];
                for (const x of xs) for (const px of [x - B / 2, x + B / 2]) if (px > 6 && px < fw - 6 && Math.abs(px - door) > B * 1.4 && !piers.some(q => Math.abs(q - px) < 1)) piers.push(px);
                piers.push(door - B * 1.5, door + B * 1.5);
                for (const x of piers) {
                    if (x < 6 || x > fw - 6) continue;
                    const yy = y + 7;
                    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 4, yy - 3, 10, 10);
                    c.fillStyle = '#1c1d21'; c.fillRect(x - 5, yy - 5, 10, 10); c.strokeStyle = '#4a4b52'; c.lineWidth = 0.9; c.strokeRect(x - 4.5, yy - 4.5, 9, 9);
                    const g = c.createRadialGradient(x - 1.2, yy - 1.4, 0.4, x, yy, 4.6); g.addColorStop(0, '#6f9a62'); g.addColorStop(0.45, '#2f5a38'); g.addColorStop(1, '#173222');
                    c.fillStyle = g; c.beginPath(); c.arc(x, yy, 4.4, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = 'rgba(10,26,16,.5)'; c.lineWidth = 0.5; c.beginPath(); c.arc(x, yy, 2.6, 0, Math.PI * 2); c.stroke();
                    c.fillStyle = '#a9c98e'; c.beginPath(); c.arc(x - 0.4, yy - 0.5, 0.8, 0, Math.PI * 2); c.fill();
                }
            },

            /** The night: arches, windows and dormers lit, lanterns, the name, the balcony and cornices in the lamps' colour */
            _vArcGlow(ctx, faces, P, dark) {
                if (this.leanHero && !LandmarkKit._lean) return this._vLean(() => this._vArcGlow(ctx, faces, P, dark));
                const A = ARCADE, H = this._vH(), K = LandmarkKit, edges = [];
                for (const f of faces) {
                    if (f.side === 'C') continue;
                    const G = this._vFaceAt(f, P);
                    if (G.depth >= 3) this._vArcFace(ctx, f, G, H, true);
                    edges.push({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny });
                }
                const rim = K.rim(this, dark);
                if (rim.a > 0.01 && edges.length) for (const [z, out] of [[A.A + 2, 1.8], [H - A.M, 3]])
                    K.ledge(ctx, edges, z, out, 0.01, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', `rgba(${rim.rgb}, ${0.55 * rim.a})`);
                this._vArcFront(ctx, true);
            }
        });
