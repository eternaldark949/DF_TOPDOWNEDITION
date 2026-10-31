        /* =====================================================================
           MOON CITY — the nightclub, on the tiered kit
           ---------------------------------------------------------------------
           Rebuilt on the tiered kit (buildings/tiered-kit.js) after ETERNAL's
           concept pictures, in the house colours it had (black lacquer, violet
           neon, champagne gold) with the concepts' rose-magenta light inside:
             · the hall, tall: arched windows glowing pink between fluted gold
               pilasters, dancers' shadows in them, black banners with gold
               crescents hung on the pilasters, a chevron frieze and a row of
               bulbs under its gold cornice;
             · on the hall, the drum: a ring of little arched windows under the
               smoked-glass moon dome over the dance floor (the floor's lights
               pulse up through it on the beat), the eight phases of the moon
               round it on the roof, the gold crescent on its plinth and two
               searchlight turrets;
             · the VIP wing, lower: lounge windows, its roof terrace with the
               crescent pool, cabanas, loungers and festoon lights;
             · out of the wing's front, over the door, the glass drum: its
               curved glass lit pink, people at the rail of the mezzanine, and
               a great gold crescent in a neon ring;
             · kept from before: the rose canopy (the umbrella), the script
               "Moon City" board, the red carpet, velvet ropes, the bouncer and
               the queue (buildings/moon-city.js);
             · the forecourt: polished black marble with a gold sunburst fading
               into the paving; palms in gold planters; east of the wing a
               marble terrace along the hall's front and a valet bay with a
               black car waiting in it.
           Same footprint and door as before, so nothing else moves. It fronts
           south. Collision is the hall and the wing; the glass drum overhangs
           the door, the palms stand free.
           ===================================================================== */
        const MCD = {
            HERO: 2,
            PLAN: { W: 600, D: 500 },
            Z: { WING: 46, ROT0: 18, ROT: 82, HALL: 92, DRUM: 110, DOME: 30 },
            DOOR: [140, 500],
            DRUM: { x: 330, y: 150, r: 92 },
            ROT: [66, 214, 42],                                                  // the glass drum: its cheeks' x, how far it stands out
            MOON: [528, 72],
            TURRETS: [[58, 56, '200, 168, 255', 0], [560, 252, '255, 120, 180', 2.3]],
            PALMS: [[20, 548], [260, 548], [394, 338], [494, 338], [584, 338]],
            BAY: { x: 330, y: 578, w: 236, h: 104 },                             // the valet bay
            CAR: [448, 624],
            PINK: '255, 70, 160', ROSE_LT: '255, 150, 200'
        };

        // ── wall art (strip coordinates: x along the plan from vertex 0, y down from the tier's top) ──

        /** Each visible edge of a tier with its index and its vertices (world). */
        function _mcdEdges(t) {
            const out = [];
            t.mitre.forEach((e, i) => { if (e && !e.hidden) out.push({ ...e, i, a: t.poly[i], b: t.poly[(i + 1) % t.poly.length] }); });
            return out;
        }
        /** Where along the strip the wall facing (roughly) ny passes world x, or null. */
        function _mcdU(t, wx, minNy = 0.5) {
            for (const e of _mcdEdges(t)) {
                if (e.ny < minNy) continue;
                const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
                if (wx < x0 - 0.01 || wx > x1 + 0.01 || x1 - x0 < 0.5) continue;
                return e.u0 + Math.abs(wx - e.a[0]) / (x1 - x0) * e.L;
            }
            return null;
        }

        /** Black lacquer with a breath of plum low down, faint vertical sheen. */
        function _mcdLacquer(d, H, L, r) {
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b0810'); g.addColorStop(1, '#180d20');
            d.fillStyle = g; d.fillRect(0, 0, L, H);
            for (let i = 0; i < L / 9; i++) { d.fillStyle = `rgba(200, 168, 255, ${0.015 + r() * 0.025})`; d.fillRect(r() * L, 0, 0.6 + r() * 1.4, H); }
        }

        /** The top: a stepped parapet in gold, a row of bulbs, the chevron frieze (rose at night). 14 deep. */
        function _mcdCrown(d, l, L, bulbs = true) {
            const C = MCX.C, PAR = 5, BULB = 7.5, FR0 = 9.5, FR1 = 14;
            d.fillStyle = '#07050a'; d.fillRect(0, 0, L, PAR); d.fillStyle = C.gold; d.fillRect(0, PAR - 0.8, L, 0.8);
            for (let x = 18; x < L - 8; x += 46) { d.fillStyle = C.gold; d.fillRect(x - 6, 0.2, 12, 0.5); d.fillRect(x - 3, 1.4, 6, 0.5); }
            if (bulbs) for (let x = 2; x < L - 1; x += 3.2) {
                d.fillStyle = '#6a5530'; d.beginPath(); d.arc(x, BULB, 0.75, 0, Math.PI * 2); d.fill();
                l.fillStyle = 'rgba(255, 236, 190, 1)'; l.beginPath(); l.arc(x, BULB, 0.8, 0, Math.PI * 2); l.fill();
                l.fillStyle = 'rgba(255, 200, 140, 0.3)'; l.beginPath(); l.arc(x, BULB, 2.2, 0, Math.PI * 2); l.fill();
            }
            d.fillStyle = C.plum; d.fillRect(0, FR0, L, FR1 - FR0);
            for (const [c, col, w] of [[d, 'rgba(232, 194, 122, 0.75)', 0.6], [l, 'rgba(255, 90, 160, 0.85)', 0.8]]) {
                c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (let x = 0, k = 0; x <= L; x += 3, k++) c.lineTo(x, k % 2 ? FR0 + 1 : FR1 - 1); c.stroke();
            }
            d.fillStyle = C.goldDk; d.fillRect(0, FR0, L, 0.5); d.fillRect(0, FR1 - 0.5, L, 0.5);
        }

        /** The marble plinth along the foot. */
        function _mcdPlinth(d, L, H) { d.fillStyle = MCX.C.marble; d.fillRect(0, H - 4, L, 4); d.fillStyle = MCX.C.goldDk; d.fillRect(0, H - 4, L, 0.6); }

        /** Dancers' shadows: heads and shoulders, a raised arm here and there, cut out of the lit glass (darker on the day layer). */
        function _mcdCrowd(d, l, x0, x1, yb, r, n, scale = 1) {
            for (let k = 0; k < n; k++) {
                const x = x0 + (x1 - x0) * (k + 0.2 + r() * 0.6) / n, h = (7 + r() * 3) * scale, w = 2.4 * scale, y = yb;
                const fig = (c) => {
                    c.beginPath(); c.arc(x, y - h, 1.25 * scale, 0, Math.PI * 2);
                    c.moveTo(x - w, y); c.lineTo(x - w * 0.7, y - h + 1.6 * scale); c.lineTo(x + w * 0.7, y - h + 1.6 * scale); c.lineTo(x + w, y); c.closePath();
                    if (r() < 0.45) { const s = r() < 0.5 ? -1 : 1; c.moveTo(x + s * w * 0.6, y - h + 2 * scale); c.lineTo(x + s * (w + 1.6 * scale), y - h - 3 * scale); c.lineTo(x + s * (w + 0.6 * scale), y - h - 3.4 * scale); c.lineTo(x + s * w * 0.2, y - h + 2.6 * scale); c.closePath(); }
                };
                fig(d); d.fillStyle = 'rgba(4, 2, 8, 0.55)'; d.fill();
                l.save(); l.globalCompositeOperation = 'destination-out'; fig(l); l.fillStyle = 'rgba(0, 0, 0, 0.72)'; l.fill(); l.restore();
            }
        }

        /** An arched window x0..x1, y0 (the crown of the arch)..y1: smoked glass, pink-lit inside, gold frame, mullion and transom. */
        function _mcdArch(d, l, x0, y0, x1, y1, r, crowd = true) {
            const w = x1 - x0, rr = w / 2, sp = y0 + rr, C = MCX.C;
            const path = (c, inset = 0) => { c.beginPath(); c.moveTo(x0 + inset, y1); c.lineTo(x0 + inset, sp); c.arc(x0 + rr, sp, rr - inset, Math.PI, 0); c.lineTo(x1 - inset, y1); c.closePath(); };
            path(d); { const g = d.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#120a1c'); g.addColorStop(0.7, '#1c0c22'); g.addColorStop(1, '#2a0e2a'); d.fillStyle = g; d.fill(); }
            d.save(); path(d); d.clip(); d.fillStyle = 'rgba(214, 200, 240, 0.08)'; d.beginPath(); d.moveTo(x0, y0); d.lineTo(x0 + w * 0.6, y0); d.lineTo(x0, y0 + (y1 - y0) * 0.55); d.fill();
            d.fillStyle = 'rgba(255, 80, 160, 0.10)'; d.fillRect(x0, y1 - (y1 - y0) * 0.4, w, (y1 - y0) * 0.4); d.restore();
            path(l); { const g = l.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(190, 80, 255, 0.55)'); g.addColorStop(0.55, 'rgba(255, 70, 160, 0.78)'); g.addColorStop(1, 'rgba(255, 110, 170, 0.95)'); l.fillStyle = g; l.fill(); }
            l.fillStyle = 'rgba(255, 236, 200, 0.9)'; for (let k = 0; k < 3; k++) { l.beginPath(); l.arc(x0 + w * (0.25 + 0.25 * k), sp + 1.5 + r() * 2, 0.55, 0, Math.PI * 2); l.fill(); }   // a chandelier's lights
            if (crowd) { l.save(); path(l); l.clip(); d.save(); path(d); d.clip(); _mcdCrowd(d, l, x0, x1, y1 + 1, r, Math.max(1, Math.round(w / 4.5))); d.restore(); l.restore(); }
            d.strokeStyle = C.gold; d.lineWidth = 0.8; path(d); d.stroke();
            d.strokeStyle = 'rgba(232, 194, 122, 0.6)'; d.lineWidth = 0.4; d.beginPath(); d.moveTo(x0 + rr, y0); d.lineTo(x0 + rr, y1); d.moveTo(x0, sp); d.lineTo(x1, sp); d.stroke();
            l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = '#000'; l.fillRect(x0 + rr - 0.25, y0, 0.5, y1 - y0); l.fillRect(x0, sp - 0.25, w, 0.5); l.restore();
            d.fillStyle = C.gold; d.fillRect(x0 - 1, y1, w + 2, 0.9);                                               // the sill
        }

        /** A fluted gold pilaster at x, w wide, y0..y1, its capital and base; at night a warm glow up it and a pink uplight at its foot. */
        function _mcdPilaster(d, l, x, w, y0, y1) {
            const C = MCX.C;
            d.fillStyle = C.goldDk; d.fillRect(x, y0, w, y1 - y0);
            d.fillStyle = 'rgba(255, 241, 194, 0.55)'; for (let k = 0; k < Math.max(2, Math.floor(w / 1.3)); k++) d.fillRect(x + 0.6 + k * 1.25, y0 + 3, 0.4, y1 - y0 - 7);
            d.fillStyle = 'rgba(40, 20, 10, 0.35)'; d.fillRect(x + w - 0.7, y0, 0.7, y1 - y0);
            d.fillStyle = C.gold; d.fillRect(x - 1, y0, w + 2, 1.5); d.fillRect(x - 0.5, y0 + 1.5, w + 1, 1); d.fillRect(x - 1, y1 - 2, w + 2, 2);
            l.fillStyle = 'rgba(255, 214, 150, 0.22)'; l.fillRect(x, y0, w, y1 - y0);
            const ug = l.createLinearGradient(0, y1, 0, y0); ug.addColorStop(0, 'rgba(255, 120, 190, 0.85)'); ug.addColorStop(0.5, 'rgba(255, 90, 170, 0.22)'); ug.addColorStop(1, 'rgba(255, 90, 170, 0)');
            l.fillStyle = ug; l.beginPath(); l.moveTo(x + w / 2 - 1.5, y1); l.lineTo(x - 5, y0 + (y1 - y0) * 0.25); l.lineTo(x + w + 5, y0 + (y1 - y0) * 0.25); l.lineTo(x + w / 2 + 1.5, y1); l.closePath(); l.fill();
        }

        /** A black banner hung on a pilaster: gold border, a gold crescent, three gold lines for the name, a swallowtail foot. */
        function _mcdBanner(d, l, cx, y0, h, w = 9) {
            const C = MCX.C, x0 = cx - w / 2, path = (c) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + w, y0); c.lineTo(x0 + w, y0 + h); c.lineTo(cx, y0 + h - 3); c.lineTo(x0, y0 + h); c.closePath(); };
            d.fillStyle = 'rgba(0, 0, 0, 0.35)'; d.save(); d.translate(0.8, 0.8); path(d); d.fill(); d.restore();
            path(d); d.fillStyle = '#0a070e'; d.fill(); d.strokeStyle = C.gold; d.lineWidth = 0.5; d.stroke();
            d.fillStyle = C.gold; d.fillRect(x0 - 1, y0 - 0.8, w + 2, 0.8);                                         // the rod
            const my = y0 + h * 0.3;
            for (const [c, col] of [[d, C.gold], [l, 'rgba(255, 228, 170, 1)']]) { c.fillStyle = col; _mcCrescent(c, cx, my, w * 0.28, -0.5); c.fill(); }
            l.fillStyle = 'rgba(255, 200, 140, 0.25)'; l.beginPath(); l.arc(cx, my, w * 0.5, 0, Math.PI * 2); l.fill();
            d.fillStyle = 'rgba(232, 194, 122, 0.8)'; for (let k = 0; k < 3; k++) { const lw = k === 2 ? w * 0.4 : w * 0.6; d.fillRect(cx - lw / 2, y0 + h * (0.52 + k * 0.1), lw, 0.45); }
        }

        /** "MOON CITY" in gold capitals on a lacquer panel, a crescent either side. */
        function _mcdName(d, l, cx, cy) {
            const C = MCX.C;
            d.fillStyle = '#0b0810'; d.fillRect(cx - 44, cy - 6, 88, 12);
            for (const [c, col] of [[d, C.gold], [l, 'rgba(255, 236, 214, 1)']]) {
                c.save(); c.font = 'bold 7.5px Montserrat, "Poiret One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col;
                if (c === l) { c.shadowColor = 'rgba(255, 100, 170, 1)'; c.shadowBlur = 4; }
                c.fillText('M O O N   C I T Y', cx, cy + 0.3); c.restore();
                c.fillStyle = col; _mcCrescent(c, cx - 38, cy, 3, -0.5); c.fill(); _mcCrescent(c, cx + 38, cy, 3, Math.PI + 0.5); c.fill();
            }
            d.strokeStyle = C.goldDk; d.lineWidth = 0.5; d.strokeRect(cx - 44, cy - 6, 88, 12);
        }

        /** The hall: bays of arched windows between gold pilasters, banners on every third, the name midway along the long walls. */
        function _mcdHall(d, l, t, H, L) {
            const r = seededRandom(6113), PW = 5, top = 17;
            _mcdLacquer(d, H, L, r);
            for (const e of _mcdEdges(t)) {
                const n = Math.max(1, Math.round(e.L / 44)), bw = e.L / n, mid = e.L > 260 ? Math.floor(n / 2) : -1;
                for (let i = 0; i < n; i++) {
                    const X0 = e.u0 + i * bw + PW / 2 + 4, X1 = e.u0 + (i + 1) * bw - PW / 2 - 4;
                    if (i === mid) {                                                                                 // the name, on a tall lacquer panel with a porthole
                        d.fillStyle = '#0d0912'; d.fillRect(X0 - 1, top + 2, X1 - X0 + 2, H - top - 9); d.strokeStyle = 'rgba(232, 194, 122, 0.4)'; d.lineWidth = 0.5; d.strokeRect(X0 + 1, top + 4, X1 - X0 - 2, H - top - 13);
                        const cx = (X0 + X1) / 2, py = top + 16, pr = Math.min(9, (X1 - X0) * 0.3);
                        d.fillStyle = '#0a0610'; d.beginPath(); d.arc(cx, py, pr, 0, Math.PI * 2); d.fill(); d.strokeStyle = MCX.C.gold; d.lineWidth = 1; d.stroke();
                        for (const [c, col] of [[d, '#c9a35a'], [l, 'rgba(255, 236, 200, 1)']]) { c.fillStyle = col; _mcCrescent(c, cx, py, pr * 0.72, -0.5); c.fill(); }
                        l.fillStyle = 'rgba(255, 120, 190, 0.35)'; l.beginPath(); l.arc(cx, py, pr + 3, 0, Math.PI * 2); l.fill();
                        continue;
                    }
                    _mcdArch(d, l, X0, top + 3, X1, H - 7, r);
                }
                for (let i = 0; i <= n; i++) {
                    const end = i === 0 || i === n, w = end ? 7 : PW, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + i * bw - w / 2));
                    _mcdPilaster(d, l, x, w, top - 1, H - 4);
                    if (!end && i % 3 === 1 && e.L > 120) _mcdBanner(d, l, x + w / 2, top + 6, Math.min(34, H * 0.42));
                }
                if (mid >= 0) _mcdName(d, l, e.u0 + (mid + 0.5) * bw, top + 34 > H - 12 ? H - 12 : top + 34);
            }
            _mcdCrown(d, l, L);
            _mcdPlinth(d, L, H);
        }

        /** The VIP wing: low lounge windows (people at the tables), pilasters, the door's portal under the glass drum. */
        function _mcdWing(d, l, t, H, L) {
            const r = seededRandom(6229), C = MCX.C, PW = 4.5, top = 16;
            _mcdLacquer(d, H, L, r);
            const b = t.owner, doorU = b ? _mcdU(t, b.x + MCD.DOOR[0], 0.99) : null;
            for (const e of _mcdEdges(t)) {
                const n = Math.max(1, Math.round(e.L / 40)), bw = e.L / n;
                for (let i = 0; i < n; i++) {
                    const X0 = e.u0 + i * bw + PW / 2 + 4, X1 = e.u0 + (i + 1) * bw - PW / 2 - 4, cx = (X0 + X1) / 2;
                    if (doorU !== null && Math.abs(cx - doorU) < 70) continue;                                      // (the portal's)
                    _mcdArch(d, l, X0, top + 3, X1, H - 6, r);
                }
                for (let i = 0; i <= n; i++) {
                    const end = i === 0 || i === n, w = end ? 6 : PW, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + i * bw - w / 2));
                    if (doorU !== null && Math.abs(x + w / 2 - doorU) < 62) continue;
                    _mcdPilaster(d, l, x, w, top - 1, H - 4);
                }
            }
            if (doorU !== null) {                                                                                    // the portal: glass doors, gold frames, rose light, a chandelier inside
                const cx = doorU, y0 = H - MCD.Z.ROT0 - 1, bot = H - 4;
                d.fillStyle = '#07050a'; d.fillRect(cx - 62, top, 124, bot - top);
                for (let k = -2; k <= 2; k++) {
                    const x0 = cx + k * 14 - 6, x1 = x0 + 12;
                    d.fillStyle = '#1a0a1c'; d.fillRect(x0, y0 + 2, x1 - x0, bot - y0 - 2);
                    const g = l.createLinearGradient(0, y0, 0, bot); g.addColorStop(0, 'rgba(255, 120, 190, 0.7)'); g.addColorStop(1, 'rgba(255, 70, 140, 0.95)');
                    l.fillStyle = g; l.fillRect(x0, y0 + 2, x1 - x0, bot - y0 - 2);
                    d.strokeStyle = C.gold; d.lineWidth = 0.7; d.strokeRect(x0, y0 + 2, x1 - x0, bot - y0 - 2);
                    d.fillStyle = C.goldLt; d.fillRect(x1 - 2.5, y0 + 8, 0.6, 4);                                     // the pulls
                }
                _mcdCrowd(d, l, cx - 30, cx + 30, bot + 0.5, r, 4, 0.9);
                d.fillStyle = C.gold; d.fillRect(cx - 40, y0, 80, 1.2); d.fillRect(cx - 62, bot, 124, 0.8);
                l.fillStyle = 'rgba(255, 236, 200, 1)'; for (let k = -1; k <= 1; k++) { l.beginPath(); l.arc(cx + k * 6, y0 + 4, 0.7, 0, Math.PI * 2); l.fill(); }
            }
            _mcdCrown(d, l, L);
            _mcdPlinth(d, L, H);
        }

        /** The glass drum over the door: curved glass, a mezzanine rail with people at it, gold mullions, and the great crescent in its neon ring. */
        function _mcdRotunda(d, l, t, H, L) {
            const r = seededRandom(6337), C = MCX.C, F = 6, B = 5, rail = Math.round(H * 0.56);
            d.fillStyle = '#0c0712'; d.fillRect(0, 0, L, H);
            { const g = d.createLinearGradient(0, F, 0, H - B); g.addColorStop(0, '#160a20'); g.addColorStop(1, '#2a0d2a'); d.fillStyle = g; d.fillRect(0, F, L, H - F - B); }
            { const g = l.createLinearGradient(0, F, 0, H - B); g.addColorStop(0, 'rgba(200, 80, 255, 0.55)'); g.addColorStop(0.6, 'rgba(255, 70, 160, 0.8)'); g.addColorStop(1, 'rgba(255, 110, 170, 0.9)'); l.fillStyle = g; l.fillRect(0, F, L, H - F - B); }
            d.fillStyle = 'rgba(214, 200, 240, 0.07)'; for (let x = -20; x < L; x += 34) { d.beginPath(); d.moveTo(x, F); d.lineTo(x + 14, F); d.lineTo(x + 4, H - B); d.lineTo(x - 10, H - B); d.fill(); }
            l.fillStyle = 'rgba(255, 236, 200, 0.9)'; for (let x = 6; x < L; x += 11) { l.beginPath(); l.arc(x + r() * 3, F + 4 + r() * 3, 0.6, 0, Math.PI * 2); l.fill(); }   // chandeliers inside
            _mcdCrowd(d, l, 0, L, rail - 0.5, r, Math.round(L / 6), 1.05);                                          // at the rail
            _mcdCrowd(d, l, 0, L, H - B + 0.5, r, Math.round(L / 8), 0.95);                                         // on the stair below
            d.fillStyle = C.gold; d.fillRect(0, rail, L, 1); d.fillStyle = 'rgba(232, 194, 122, 0.5)'; for (let x = 1; x < L; x += 2.4) d.fillRect(x, rail - 3.4, 0.35, 3.4);   // the rail and its balusters
            d.fillRect(0, rail - 3.6, L, 0.4);
            l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = 'rgba(0, 0, 0, 0.6)'; l.fillRect(0, rail, L, 1.2); l.restore();
            for (let x = 0; x < L; x += 12) { d.fillStyle = C.goldDk; d.fillRect(x - 0.5, F, 1, H - F - B); d.fillStyle = 'rgba(255, 241, 194, 0.5)'; d.fillRect(x - 0.5, F, 0.35, H - F - B);
                l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = '#000'; l.fillRect(x - 0.5, F, 1, H - F - B); l.restore(); l.fillStyle = 'rgba(255, 214, 150, 0.3)'; l.fillRect(x - 0.5, F, 1, H - F - B); }
            // the fascias: the cornice at the top (bulbs), the band over the canopy at the foot
            d.fillStyle = '#07050a'; d.fillRect(0, 0, L, F); d.fillStyle = C.gold; d.fillRect(0, F - 0.8, L, 0.8); d.fillRect(0, 0.6, L, 0.4);
            for (let x = 2; x < L - 1; x += 3.2) { d.fillStyle = '#6a5530'; d.beginPath(); d.arc(x, 3, 0.65, 0, Math.PI * 2); d.fill(); l.fillStyle = 'rgba(255, 236, 190, 1)'; l.beginPath(); l.arc(x, 3, 0.75, 0, Math.PI * 2); l.fill(); }
            d.fillStyle = '#07050a'; d.fillRect(0, H - B, L, B); d.fillStyle = C.gold; d.fillRect(0, H - B, L, 0.8); d.fillRect(0, H - 0.8, L, 0.8);
            l.fillStyle = 'rgba(255, 90, 160, 0.9)'; l.fillRect(0, H - B + 1.6, L, 0.8);                           // a neon line round the band
            // the crescent in its ring, on the front
            const b = t.owner, uc = b ? _mcdU(t, b.x + MCD.DOOR[0], 0.9) : null;
            if (uc === null) return;
            const cy = F + (rail - F) * 0.5 + 2, R = Math.min(rail - F - 4, 30) / 2 + 6;
            d.fillStyle = '#0a0610'; d.beginPath(); d.arc(uc, cy, R, 0, Math.PI * 2); d.fill();
            l.save(); l.globalCompositeOperation = 'destination-out'; l.beginPath(); l.arc(uc, cy, R, 0, Math.PI * 2); l.fill(); l.restore();
            { const g = d.createRadialGradient(uc + 3, cy - 2, 1, uc + 3, cy, R * 0.8); g.addColorStop(0, '#5a2040'); g.addColorStop(1, '#2a0c22'); d.fillStyle = g; d.beginPath(); d.arc(uc + 3, cy, R * 0.72, 0, Math.PI * 2); d.fill(); }   // the rose moon behind
            { const g = l.createRadialGradient(uc + 3, cy - 2, 1, uc + 3, cy, R * 0.8); g.addColorStop(0, 'rgba(255, 130, 180, 0.8)'); g.addColorStop(1, 'rgba(200, 40, 110, 0.35)'); l.fillStyle = g; l.beginPath(); l.arc(uc + 3, cy, R * 0.72, 0, Math.PI * 2); l.fill(); }
            const cg = d.createLinearGradient(uc - R, cy - R, uc + R, cy + R); cg.addColorStop(0, C.goldLt); cg.addColorStop(0.5, C.gold); cg.addColorStop(1, C.goldDk);
            d.fillStyle = cg; _mcCrescent(d, uc - 2, cy, R * 0.82, -0.25); d.fill();
            d.fillStyle = 'rgba(120, 80, 30, 0.45)'; for (let k = 0; k < 7; k++) { const a = Math.PI * (0.6 + r() * 0.8), rr = R * (0.55 + r() * 0.2); d.beginPath(); d.arc(uc - 2 + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.6 + r() * 1.1, 0, Math.PI * 2); d.fill(); }   // its craters
            l.fillStyle = 'rgba(255, 232, 170, 1)'; _mcCrescent(l, uc - 2, cy, R * 0.82, -0.25); l.fill();
            d.strokeStyle = C.gold; d.lineWidth = 1.4; d.beginPath(); d.arc(uc, cy, R, 0, Math.PI * 2); d.stroke();
            d.strokeStyle = C.goldDk; d.lineWidth = 0.5; d.beginPath(); d.arc(uc, cy, R + 2, 0, Math.PI * 2); d.stroke();
            l.save(); l.shadowColor = 'rgba(255, 90, 170, 1)'; l.shadowBlur = 5; l.strokeStyle = 'rgba(255, 170, 215, 1)'; l.lineWidth = 1.3; l.beginPath(); l.arc(uc, cy, R + 0.5, 0, Math.PI * 2); l.stroke(); l.restore();
            l.strokeStyle = 'rgba(255, 220, 160, 0.9)'; l.lineWidth = 0.5; l.beginPath(); l.arc(uc, cy, R + 2.4, 0, Math.PI * 2); l.stroke();
        }

        /** The drum under the dome: lacquer, a ring of little arched windows lit violet and rose, gold bands. */
        function _mcdDrum(d, l, t, H, L) {
            const r = seededRandom(6451), C = MCX.C;
            d.fillStyle = '#0d0912'; d.fillRect(0, 0, L, H);
            for (let x = 4, k = 0; x < L - 6; x += 12, k++) {
                const x0 = x + 2, x1 = x + 8, w = x1 - x0, sp = 5 + w / 2;
                const path = (c) => { c.beginPath(); c.moveTo(x0, H - 4); c.lineTo(x0, sp); c.arc(x0 + w / 2, sp, w / 2, Math.PI, 0); c.lineTo(x1, H - 4); c.closePath(); };
                path(d); d.fillStyle = '#1a0c22'; d.fill(); d.strokeStyle = 'rgba(232, 194, 122, 0.7)'; d.lineWidth = 0.5; d.stroke();
                path(l); l.fillStyle = k % 2 ? 'rgba(200, 140, 255, 0.85)' : 'rgba(255, 90, 170, 0.85)'; l.fill();
                d.fillStyle = C.goldDk; d.fillRect(x - 0.6, 2, 1.2, H - 4);
            }
            d.fillStyle = C.gold; d.fillRect(0, 0, L, 1.2); d.fillRect(0, H - 2, L, 1.2); d.fillStyle = '#07050a'; d.fillRect(0, H - 0.8, L, 0.8);
            l.fillStyle = 'rgba(255, 220, 160, 0.5)'; l.fillRect(0, 0, L, 1);
        }

        /** A palm's planter: black lacquer banded in gold. */
        function _mcdPlanter(d, l, t, H, L) {
            const C = MCX.C; d.fillStyle = '#0d0912'; d.fillRect(0, 0, L, H);
            d.fillStyle = C.gold; d.fillRect(0, 0, L, 1); d.fillRect(0, H - 1.6, L, 1); d.fillStyle = C.goldDk; d.fillRect(0, H * 0.45, L, 0.6);
            l.fillStyle = 'rgba(255, 210, 140, 0.35)'; l.fillRect(0, 0, L, 1.2);
        }

        // ── roofs (world coordinates, painted once) and what stands on them (live) ──

        function _mcdPath(c, poly) { c.beginPath(); poly.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }
        const _mcdCentre = (poly) => { let x = 0, y = 0; for (const p of poly) { x += p[0] / poly.length; y += p[1] / poly.length; } return [x, y]; };

        /** A lacquer deck in its gold parapet, a stepped inner tier. */
        function _mcdDeck(c, t, inner) {
            const [x0, y0, x1, y1] = t.box, C = MCX.C, I = 14;
            _mcdPath(c, t.poly); { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#171020'); g.addColorStop(1, C.lacquer); c.fillStyle = g; c.fill(); }
            c.fillStyle = inner; c.fillRect(x0 + I, y0 + I, x1 - x0 - I * 2, y1 - y0 - I * 2);
            c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x1 - I, y0 + I); c.lineTo(x1 - I, y1 - I); c.lineTo(x0 + I, y1 - I); c.stroke();
            c.strokeStyle = 'rgba(232, 194, 122, 0.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + I, y1 - I); c.lineTo(x0 + I, y0 + I); c.lineTo(x1 - I, y0 + I); c.stroke();
            c.strokeStyle = C.goldDk; c.lineWidth = 3; c.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
            c.strokeStyle = 'rgba(255, 241, 194, 0.35)'; c.lineWidth = 0.8; c.strokeRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
            for (const [x, y] of [[x0 + 4, y0 + 4], [x1 - 4, y0 + 4], [x0 + 4, y1 - 4], [x1 - 4, y1 - 4]]) { c.fillStyle = C.gold; c.fillRect(x - 3, y - 3, 6, 6); }
        }

        /** The hall's roof: the deck, a fine gold sunburst from the drum, the eight phases round it, the crescent on its plinth, the turrets, the plant. */
        function _mcdHallRoof(c, e, t) {
            if (e) return;
            const b = t.owner, C = MCX.C, D = { x: b.x + MCD.DRUM.x, y: b.y + MCD.DRUM.y, r: MCD.DRUM.r }, [x0, y0, x1, y1] = t.box;
            _mcdDeck(c, t, '#120c1a');
            c.save(); c.beginPath(); c.rect(x0 + 15, y0 + 15, x1 - x0 - 30, y1 - y0 - 30); c.clip();
            c.strokeStyle = 'rgba(232, 194, 122, 0.04)'; c.lineWidth = 1; c.beginPath();                         // a fine deco grid in the deck
            for (let x = x0 + 15; x < x1; x += 30) { c.moveTo(x, y0); c.lineTo(x, y1); } for (let y = y0 + 15; y < y1; y += 30) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke();
            c.strokeStyle = 'rgba(232, 194, 122, 0.13)'; c.lineWidth = 1; c.beginPath();
            for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; c.moveTo(D.x + Math.cos(a) * (D.r + 40), D.y + Math.sin(a) * (D.r + 40)); c.lineTo(D.x + Math.cos(a) * 640, D.y + Math.sin(a) * 640); }
            c.stroke(); c.restore();
            c.strokeStyle = 'rgba(232, 194, 122, 0.22)'; for (const rr of [D.r + 40, D.r + 8]) { c.beginPath(); c.arc(D.x, D.y, rr, 0, Math.PI * 2); c.stroke(); }
            for (const p of _mcdPhases(b)) {
                c.fillStyle = 'rgba(0, 0, 0, 0.45)'; c.beginPath(); c.arc(p.x + 1.5, p.y + 2, 9, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#100a16'; c.beginPath(); c.arc(p.x, p.y, 9, 0, Math.PI * 2); c.fill(); c.strokeStyle = C.goldDk; c.lineWidth = 1; c.stroke();
                if (p.ph) { c.fillStyle = C.gold; _mcPhase(c, p.x, p.y, 7, p.ph); c.fill(); }
            }
            const MO = { x: b.x + MCD.MOON[0], y: b.y + MCD.MOON[1] };
            for (const [rr, f] of [[38, '#100a16'], [32, '#171020']]) { c.beginPath(); c.arc(MO.x, MO.y, rr, 0, Math.PI * 2); c.fillStyle = f; c.fill(); c.strokeStyle = C.goldDk; c.lineWidth = 1.2; c.stroke(); }
            c.fillStyle = 'rgba(0, 0, 0, 0.45)'; _mcCrescent(c, MO.x + 3, MO.y + 4, 26); c.fill();
            { const g = c.createLinearGradient(MO.x - 26, MO.y - 26, MO.x + 26, MO.y + 26); g.addColorStop(0, C.goldLt); g.addColorStop(0.5, C.gold); g.addColorStop(1, C.goldDk); c.fillStyle = g; }
            _mcCrescent(c, MO.x, MO.y, 26); c.fill(); c.strokeStyle = 'rgba(255, 255, 255, 0.35)'; c.lineWidth = 0.8; c.stroke();
            for (const [lx, ly] of MCD.TURRETS) {
                const x = b.x + lx, y = b.y + ly;
                c.fillStyle = 'rgba(0, 0, 0, 0.45)'; c.beginPath(); c.arc(x + 3, y + 4, 14, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#100a16'; c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.fill(); c.strokeStyle = C.goldDk; c.lineWidth = 2; c.stroke();
                c.fillStyle = C.fin; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(232, 216, 255, 0.5)'; c.beginPath(); c.arc(x - 2, y - 2, 2, 0, Math.PI * 2); c.fill();
            }
            for (const [lx, ly, w, h] of [[36, 196, 52, 32], [96, 202, 26, 26], [36, 236, 30, 22]]) {
                const x = b.x + lx, y = b.y + ly;
                c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 3, y + 3, w, h); c.fillStyle = '#100a16'; c.fillRect(x, y, w, h);
                c.strokeStyle = 'rgba(232, 194, 122, 0.14)'; c.lineWidth = 1; c.beginPath(); for (let yy = y + 4; yy < y + h - 1; yy += 4) { c.moveTo(x + 3, yy); c.lineTo(x + w - 3, yy); } c.stroke();
                c.strokeStyle = 'rgba(168, 130, 62, 0.6)'; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
            }
        }
        function _mcdPhases(b) {
            const D = MCD.DRUM, R = D.r + 24;
            return [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = -Math.PI / 2 + i * Math.PI / 4; return { x: b.x + D.x + Math.cos(a) * R, y: b.y + D.y + Math.sin(a) * R, ph: i / 8 }; });
        }
        /** At night on the hall's roof: the phases lighting one after another a step a beat, violet neon round the deck's step, the crescent's halo. */
        function _mcdHallTop(ctx, e, t, b) {
            if (!e) return;
            const B = b._mcBeat(), base = ctx.globalAlpha, [x0, y0, x1, y1] = t.box;
            LandmarkKit.flat(ctx, b._tkK(t.z1), (c) => {
                c.globalCompositeOperation = 'lighter';
                const lit = ((Math.floor(B.n) % 8) + 8) % 8, P = _mcdPhases(b);
                for (let i = 0; i < 8; i++) { const d = (lit - i + 8) % 8, a = d === 0 ? 0.7 + 0.3 * B.kick : d === 1 ? 0.35 : d === 2 ? 0.15 : 0.05; glowA(c, P[i].x, P[i].y, 22, '200, 168, 255', base * a); }
                c.globalAlpha = base; c.lineWidth = 2.4; c.strokeStyle = `rgba(138, 92, 255, ${0.45 + 0.25 * B.kick})`; c.strokeRect(x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28);
                c.lineWidth = 0.9; c.strokeStyle = 'rgba(232, 216, 255, 0.75)'; c.strokeRect(x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28);
                const MO = [b.x + MCD.MOON[0], b.y + MCD.MOON[1]];
                glowA(c, MO[0], MO[1], 70, '200, 168, 255', base * (0.55 + 0.2 * Math.sin(_gameTimeSec * 0.6)));
                c.globalAlpha = base; c.fillStyle = 'rgba(255, 241, 194, 0.55)'; _mcCrescent(c, MO[0], MO[1], 26); c.fill();
                for (const [lx, ly, rgb] of MCD.TURRETS) glowA(c, b.x + lx, b.y + ly, 16, rgb, base * 0.8);
            });
            ctx.globalAlpha = base;
        }

        /** The wing's roof: the terrace deck, the crescent pool, rose-velvet cabanas, loungers, violet topiary. */
        function _mcdWingRoof(c, e, t) {
            if (e) return;
            const b = t.owner, C = MCX.C, [x0, y0, x1, y1] = t.box, W = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, I = 14;
            _mcdDeck(c, t, C.plum);
            c.strokeStyle = 'rgba(232, 194, 122, 0.06)'; c.beginPath(); for (let gy = W.y + I + 8; gy < W.y + W.h - I; gy += 8) { c.moveTo(W.x + I, gy); c.lineTo(W.x + W.w - I, gy); } c.stroke();
            const PL = _mcdPool(t);
            _mcLune(c, PL.x, PL.y, PL.r, -0.35);
            { const g = c.createRadialGradient(PL.x - PL.r * 0.3, PL.y - PL.r * 0.3, 4, PL.x, PL.y, PL.r); g.addColorStop(0, '#3a2470'); g.addColorStop(1, C.water); c.fillStyle = g; c.fill(); }
            c.strokeStyle = C.gold; c.lineWidth = 3; c.stroke(); c.strokeStyle = 'rgba(232, 216, 255, 0.35)'; c.lineWidth = 0.8; c.stroke();
            for (const [x, y, w, h] of [[W.x + 20, W.y + 24, 42, 36], [W.x + 20, W.y + W.h - 60, 42, 36]]) {
                c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x + 3, y + 4, w, h);
                c.fillStyle = C.velvet; c.fillRect(x, y, w, h);
                c.fillStyle = C.velvetLt; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w / 2, y + h / 2); c.closePath(); c.fill();
                c.beginPath(); c.moveTo(x, y); c.lineTo(x + w / 2, y + h / 2); c.lineTo(x, y + h); c.closePath(); c.fillStyle = 'rgba(138, 26, 82, 0.6)'; c.fill();
                c.strokeStyle = 'rgba(255, 241, 194, 0.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + h); c.moveTo(x + w, y); c.lineTo(x, y + h); c.stroke();
                c.strokeStyle = C.gold; c.lineWidth = 1.2; c.strokeRect(x, y, w, h);
                c.fillStyle = C.goldLt; c.beginPath(); c.arc(x + w / 2, y + h / 2, 2, 0, Math.PI * 2); c.fill();
            }
            for (let i = 0; i < 4; i++) {
                const x = W.x + W.w - 44, y = W.y + 26 + i * 38, w = 26, h = 13;
                c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 2, y + 3, w, h); c.fillStyle = C.fin; c.fillRect(x, y, w, h);
                c.fillStyle = '#4a3468'; c.fillRect(x + 2, y + 2, w - 4, h - 4); c.fillStyle = '#7a5aa8'; c.fillRect(x + w - 8, y + 2, 6, h - 4);
                c.fillStyle = C.gold; c.beginPath(); c.arc(x - 6, y + h / 2, 2.4, 0, Math.PI * 2); c.fill();
            }
            for (const [x, y] of [[W.x + W.w - 30, W.y + W.h - 28], [W.x + 82, W.y + 28], [W.x + 82, W.y + W.h - 28]]) {
                c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(x + 2, y + 3, 10, 0, Math.PI * 2); c.fill();
                const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, 10); g.addColorStop(0, '#7a52c8'); g.addColorStop(1, '#2a1a50'); c.fillStyle = g;
                c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill(); c.strokeStyle = C.goldDk; c.lineWidth = 1; c.stroke();
            }
        }
        function _mcdPool(t) { const [x0, y0, x1, y1] = t.box, w = x1 - x0, h = y1 - y0; return { x: x0 + w * 0.56, y: y0 + h * 0.5, r: Math.min(w, h) * 0.29 }; }
        /** The terrace at night: the pool lit violet from beneath, festoon lights over it. By day the pool holds the sky. */
        function _mcdWingTop(ctx, e, t, b) {
            const PL = _mcdPool(t), base = ctx.globalAlpha, [x0, y0, x1] = t.box;
            if (!e) {
                const sun = sunNow(), day = sun ? sun.day : 0;
                if (day > 0.05) LandmarkKit.flat(ctx, b._tkK(t.z1), (c) => { c.fillStyle = 'rgba(190, 186, 236, 1)'; _mcLune(c, PL.x, PL.y, PL.r - 1.5, -0.35); c.globalAlpha = 0.18 * day; c.fill(); });
                return;
            }
            LandmarkKit.flat(ctx, b._tkK(t.z1), (c) => {
                c.globalCompositeOperation = 'lighter';
                glowA(c, PL.x, PL.y, PL.r * 1.5, '138, 92, 255', base * (0.45 + 0.1 * Math.sin(_gameTimeSec * 0.8)));
                c.globalAlpha = base; _mcLune(c, PL.x, PL.y, PL.r - 2, -0.35); c.strokeStyle = 'rgba(200, 168, 255, 0.6)'; c.lineWidth = 1.4; c.stroke();
            });
            if (_zoomLOD >= 2) return;
            const bulb = bulbSprite(ctx, '255,232,200', 1, 1.4, '255,200,150', 0.3, 5, true), br = bulb.r, tt = _frameTime / 1000;
            LandmarkKit.flat(ctx, b._tkK(t.z1 + 10), (c) => {
                c.globalCompositeOperation = 'lighter';
                for (let row = 0; row < 3; row++) {
                    const y = y0 + 40 + row * 60, xa = x0 + 20, xb = x1 - 20;
                    for (let u = 0, i = 0; u <= 1.0001; u += 1 / 14, i++) { const x = xa + (xb - xa) * u, sag = 10 * 4 * u * (1 - u); c.globalAlpha = base * (0.7 + 0.3 * Math.sin(tt * 1.7 + i * 0.9 + row)); c.drawImage(bulb, x - br, y + sag - br, br * 2, br * 2); }
                }
            });
            ctx.globalAlpha = base;
        }

        /** The glass drum's roof: lacquer in a gold rim, an oculus with a crescent; at night a rose neon ring. */
        function _mcdRotRoof(c, e, t) {
            const C = MCX.C, [cx, cy] = _mcdCentre(t.poly);
            if (e) { c.save(); c.translate(cx, cy); c.scale(0.86, 0.8); c.translate(-cx, -cy); _mcdPath(c, t.poly); c.restore(); c.strokeStyle = 'rgba(255, 110, 180, 0.9)'; c.lineWidth = 1.6; c.stroke();
                c.fillStyle = 'rgba(255, 220, 160, 0.6)'; _mcCrescent(c, cx, cy + 4, 9); c.fill(); return; }
            _mcdPath(c, t.poly); { const g = c.createLinearGradient(cx, cy - 30, cx, cy + 30); g.addColorStop(0, '#1d1328'); g.addColorStop(1, C.lacquer); c.fillStyle = g; c.fill(); }
            c.lineWidth = 5; c.strokeStyle = '#07050a'; c.stroke(); c.lineWidth = 1.2; c.strokeStyle = C.gold; c.stroke();
            c.save(); c.translate(cx, cy); c.scale(0.86, 0.8); c.translate(-cx, -cy); _mcdPath(c, t.poly); c.restore(); c.lineWidth = 0.7; c.strokeStyle = 'rgba(232, 194, 122, 0.5)'; c.stroke();
            c.beginPath(); c.arc(cx, cy + 4, 13, 0, Math.PI * 2); c.fillStyle = '#0a0610'; c.fill(); c.strokeStyle = C.goldDk; c.lineWidth = 1.2; c.stroke();
            c.fillStyle = C.gold; _mcCrescent(c, cx, cy + 4, 9); c.fill();
        }

        /** The drum's top: the dome's collar (the dome itself stands live on it: _mcdDome). */
        function _mcdDrumRoof(c, e, t) {
            if (e) return;
            const b = t.owner, D = MCD.DRUM, x = b.x + D.x, y = b.y + D.y;
            c.beginPath(); c.arc(x, y, D.r, 0, Math.PI * 2); c.fillStyle = '#0d0814'; c.fill();
            c.lineWidth = 4; c.strokeStyle = MCX.C.gold; c.stroke(); c.beginPath(); c.arc(x, y, D.r - 5, 0, Math.PI * 2); c.lineWidth = 1; c.strokeStyle = MCX.C.goldDk; c.stroke();
        }

        /** The smoked-glass moon dome: rings stacked up its curve, gold ribs to a gold boss; by day the sky in it,
            at night the dance floor's lights pulsing up through it on the beat. */
        function _mcdDome(ctx, e, t, b) {
            const D = MCD.DRUM, cx = b.x + D.x, cy = b.y + D.y, R = D.r - 6, Hd = MCD.Z.DOME, z0 = t.z1, N = 10;
            const ring = (i) => { const th = i / N * Math.PI / 2 * 0.94; return { z: z0 + Hd * Math.sin(th), r: R * Math.cos(th) }; };
            if (e) {
                const B = b._mcBeat(), base = ctx.globalAlpha, mid = ring(4);
                LandmarkKit.flat(ctx, b._tkK(mid.z), (c) => {
                    c.globalCompositeOperation = 'lighter';
                    c.save(); c.beginPath(); c.arc(cx, cy, mid.r, 0, Math.PI * 2); c.clip();
                    const cell = 20;
                    for (let gx = cx - mid.r; gx < cx + mid.r; gx += cell) for (let gy = cy - mid.r; gy < cy + mid.r; gy += cell) {
                        const i = Math.round((gx - cx) / cell), j = Math.round((gy - cy) / cell), pat = B.bar % 4;
                        const ph = pat === 0 ? Math.hypot(i, j) * 0.5 - B.n * 0.5 : pat === 1 ? (i + j) * 0.35 - B.n : pat === 2 ? ((i + j + Math.floor(B.n)) % 2) * 2 : Math.atan2(j, i) * 2 + B.n;
                        c.globalAlpha = base * Math.max(0, 0.25 + 0.25 * Math.sin(ph * Math.PI) + 0.35 * B.kick) * 0.55;
                        c.fillStyle = `rgb(${CLUB_PAL[(Math.abs(i * 3 + j) + B.bar) % 4]})`; c.fillRect(gx + 2, gy + 2, cell - 4, cell - 4);
                    }
                    c.restore();
                });
                LandmarkKit.flat(ctx, b._tkK(z0 + 1), (c) => { c.globalCompositeOperation = 'lighter'; c.globalAlpha = base; c.beginPath(); c.arc(cx, cy, R + 2, 0, Math.PI * 2); c.strokeStyle = `rgba(255, 241, 194, ${0.5 + 0.3 * B.kick})`; c.lineWidth = 2.4; c.stroke(); });
                ctx.globalAlpha = base; return;
            }
            const sun = sunNow(), day = sun ? sun.day : 0;
            for (let i = 0; i <= N; i++) {
                const q = ring(i), s = 0.5 + 0.5 * (i / N);
                LandmarkKit.flat(ctx, b._tkK(q.z), (c) => {
                    c.beginPath(); c.arc(cx, cy, q.r, 0, Math.PI * 2);
                    c.fillStyle = `rgb(${Math.round(16 + 18 * s)}, ${Math.round(9 + 10 * s)}, ${Math.round(26 + 26 * s)})`; c.fill();
                    if (day > 0.05) { c.fillStyle = `rgba(190, 186, 236, ${0.05 * day * s})`; c.fill(); }
                    if (i === 0) { c.lineWidth = 2; c.strokeStyle = MCX.C.goldDk; c.stroke(); }
                });
            }
            // the ribs, and a pale gibbous highlight in the glass: the moon itself
            ctx.strokeStyle = 'rgba(232, 194, 122, 0.45)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (let i = 0; i <= N; i++) { const q = ring(i), p = b._tkP(cx + Math.cos(a) * q.r, cy + Math.sin(a) * q.r, q.z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } }
            ctx.stroke();
            const top = ring(N), kt = b._tkK(top.z);
            LandmarkKit.flat(ctx, kt, (c) => {
                c.fillStyle = `rgba(220, 200, 255, ${0.06 + 0.12 * day})`; _mcPhase(c, cx - R * 0.15, cy - R * 0.15, R * 0.55, 0.32); c.fill();
                c.fillStyle = MCX.C.gold; c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill();
            });
        }

        /** A palm out of its planter: a ringed trunk curving up, fronds fanning from its crown; at night lit gold from its foot. */
        function _mcdPalm(ctx, e, t, b) {
            const [cx, cy] = _mcdCentre(t.poly), seed = (cx * 7 + cy * 3) | 0, lean = (seed % 2 ? 1 : -1) * 4, ZT = 52, N = 12;
            const at = (u) => [cx + lean * u * u, cy - 2 * u, t.z1 + (ZT - t.z1) * u];
            if (e) {
                const base = ctx.globalAlpha, m = at(0.4), p = b._tkP(m[0], m[1], m[2]), f = at(1), pf = b._tkP(f[0], f[1], f[2]);
                const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
                glowA(ctx, p[0], p[1], 18 * b._tkK(m[2]), '255, 200, 120', base * 0.35);
                glowA(ctx, pf[0], pf[1], 26 * b._tkK(f[2]), '255, 150, 200', base * 0.18);
                ctx.globalCompositeOperation = op; ctx.globalAlpha = base; return;
            }
            ctx.save(); ctx.lineCap = 'round';
            for (let i = 0; i < N; i++) {                                                          // the trunk, a segment a ring
                const u0 = i / N, u1 = (i + 1) / N, a = at(u0), q = at(u1), p0 = b._tkP(a[0], a[1], a[2]), p1 = b._tkP(q[0], q[1], q[2]), w = (6.4 - 2.4 * u0) * b._tkK(a[2]);
                ctx.strokeStyle = i % 2 ? '#4a3426' : '#5e4330'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
                ctx.strokeStyle = 'rgba(230, 190, 140, 0.22)'; ctx.lineWidth = w * 0.3; ctx.beginPath(); ctx.moveTo(p0[0] - w * 0.2, p0[1]); ctx.lineTo(p1[0] - w * 0.2, p1[1]); ctx.stroke();
            }
            ctx.restore();
            const [fx, fy, fz] = at(1), r = seededRandom(seed);
            for (const [layer, zz, len, col, rib] of [[0, fz - 2, 30, '#173b25', '#2f6a3c'], [1, fz, 24, '#245a34', '#4c8c52']]) {
                LandmarkKit.flat(ctx, b._tkK(zz), (c) => {
                    const n = layer ? 7 : 9;
                    for (let i = 0; i < n; i++) {
                        const a = (i + (layer ? 0.5 : 0)) / n * Math.PI * 2 + r() * 0.3, L = len * (0.85 + r() * 0.3), w = 5.5, ex = fx + Math.cos(a) * L, ey = fy + Math.sin(a) * L + 3, mx = fx + Math.cos(a) * L * 0.5, my = fy + Math.sin(a) * L * 0.5;
                        const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
                        c.fillStyle = 'rgba(0, 0, 0, 0.18)'; c.beginPath(); c.moveTo(fx + 2, fy + 3); c.quadraticCurveTo(mx + nx + 2, my + ny + 3, ex + 2, ey + 3); c.quadraticCurveTo(mx - nx + 2, my - ny + 3, fx + 2, fy + 3); c.fill();
                        c.fillStyle = col; c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(mx + nx, my + ny, ex, ey); c.quadraticCurveTo(mx - nx, my - ny, fx, fy); c.fill();
                        c.strokeStyle = rib; c.lineWidth = 0.7; c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
                    }
                    if (layer) { c.fillStyle = '#5e4330'; c.beginPath(); c.arc(fx, fy, 2.4, 0, Math.PI * 2); c.fill(); }
                });
            }
        }

        // ── the building ──

        class MoonCityBuilding extends TieredBuilding {
            /** It keeps the 'moon_city' style (its ground pass, the street trees and the club's music go by it), none of the old body's settings. */
            _applyStyle(config) {
                this.style = 'moon_city';
                this._seed = Math.round(this.x * 0.37 + this.y * 1.13);
                this.roofFeatures = [];
                this.emissiveReach = 700;                                          // the searchlights reach well past it
            }
            _setupSign() { this.attachedSign = null; }
            _generateLights() {}
            /** The name on the hall's walls waits for its webfont: a strip painted before it came is painted again once it's in. */
            _tkArt(t) {
                if (t.art && t.art.fontless && _mcFontReady()) t.art = null;
                if (!t.art) { const ready = _mcFontReady(); super._tkArt(t).fontless = !ready; }
                return t.art;
            }
            /** A tier standing out in front of a wall (front: the glass drum) draws right after the one it's on, or that wall, below its top, would paint over it. */
            _tkOrder() {
                const order = super._tkOrder(), fronts = order.filter(t => t.front);
                if (!fronts.length) return order;
                const rest = order.filter(t => !t.front);
                for (const f of fronts) rest.splice(rest.indexOf(f.support) + 1, 0, f);
                return rest;
            }

            /** Where things are (world): the door, the sign, the court, the queue (buildings/moon-city.js draws the canopy, sign and people from it). */
            _mcGeo() {
                if (this._mcG && this._mcG.x === this.x && this._mcG.y === this.y) return this._mcG;
                const X = this.x, Y = this.y, dx = X + MCD.DOOR[0], dy = Y + MCD.DOOR[1];
                return (this._mcG = {
                    x: X, y: Y,
                    door: { x: dx, y: dy },
                    sign: { x: dx, y: dy + MCD.ROT[2] + 20 },                        // out in front of the glass drum, over the canopy's back
                    canopy: { x: dx, y: dy + MCD.ROT[2] + 4 },                       // the canopy fans out from the drum's front (its centre: _mcDrawCanopy takes door.y - 4)
                    court: { x: X - 10, y: dy, w: 300, h: 200 },
                    bouncer: { x: dx + 46, y: dy + 112 },
                    queue: [0, 1, 2, 3, 4, 5, 6].map(i => [dx + 54, dy + 120 + i * 13]),
                    spawn: { x: dx + 120, y: dy + 214 }, exit: { x: dx, y: dy + 230 }
                });
            }
            /** Kept clear of street trees and lamps (engine/map-loading.js): the plaza and the carpet's end. */
            _mcForecourt() { const c = this._mcGeo().court; return { x: c.x - 20, y: c.y - 10, w: c.w + 40, h: c.h + 10 }; }

            /** The rotunda's outline on screen, from its foot to its top: what hides the canopy's back. */
            _mcdRotHull() { const t = this._tkGeo().tiers.find(q => q.id === 'rotunda'); return t ? this._tkHull(t) : null; }
            _mcdLean(fn) { return LandmarkKit.using((z) => this._tkK(z), fn); }
            /** The canopy, less what's behind the glass drum over it. */
            _mcdCanopy(ctx, emissive) {
                const h = this._mcdRotHull();
                ctx.save();
                if (h) { ctx.beginPath(); ctx.rect(-1e7, -1e7, 2e7, 2e7); h.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip('evenodd'); }
                const G = this._mcGeo(), door = G.door;                    // (the canopy draws round G.door: here, round the drum's front)
                G.door = G.canopy;
                try { this._mcDrawCanopy(ctx, emissive); } finally { G.door = door; ctx.restore(); }
            }

            drawTop(ctx, worldMinutes) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) { super.drawTop(ctx, worldMinutes); return; }
                super.drawTop(ctx, worldMinutes);
                this._mcdLean(() => { this._mcdCanopy(ctx, false); this._mcDrawSign(ctx, false); });
            }

            /** Night: the tiers' light (it swells a little on the kick), the canopy's bulbs and the sign, then the searchlights (those alone when it's far off). */
            drawEmissive(ctx, dark, beamsOnly) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                if (!beamsOnly) {
                    const B = this._mcBeat(), glow = Math.max(0.15, Math.min(1, dark * 1.1));
                    ctx.save(); ctx.globalAlpha *= 0.82 + 0.18 * B.kick; super.drawEmissive(ctx, dark, false); ctx.restore();
                    ctx.save(); ctx.globalAlpha = glow;
                    this._mcdLean(() => { this._mcdCanopy(ctx, true); this._mcDrawSign(ctx, true, dark); });
                    ctx.restore();
                }
                this._mcdBeams(ctx, dark);
            }

            /** Two searchlights from the turrets, violet and rose, sweeping the night sky. */
            _mcdBeams(ctx, dark) {
                if (dark < 0.2 || _zoomLOD >= 2) return;
                const t = _gameTimeSec, a = Math.min(1, (dark - 0.2) / 0.3), z0 = MCD.Z.HALL + 8;
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
                for (const [lx, ly, rgb, ph] of MCD.TURRETS) {
                    const sx = this.x + lx, sy = this.y + ly;
                    const az = -Math.PI / 2 + (ph ? 0.5 : -0.5) + Math.sin(t * 0.22 + ph) * 1.0, elev = 1.02 + 0.16 * Math.sin(t * 0.13 + ph * 1.7);
                    const C = leanCamHeight(), zTop = C * 0.8, run = (zTop - z0) / Math.tan(elev);
                    const p0 = this._tkP(sx, sy, z0), cam = game.camera, k1 = C / (C - Math.min(zTop, C * 0.86)), ex = sx + Math.cos(az) * run, ey = sy + Math.sin(az) * run;
                    const p1 = [cam.x + (ex - cam.x) * k1, cam.y + (ey - cam.y) * k1];
                    const vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
                    const beam = (w0, w1, c0, c1) => {
                        const gr = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); gr.addColorStop(0, c0); gr.addColorStop(0.3, c1); gr.addColorStop(1, `rgba(${rgb}, 0)`);
                        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(p0[0] + nx * w0, p0[1] + ny * w0); ctx.lineTo(p1[0] + nx * w1, p1[1] + ny * w1); ctx.lineTo(p1[0] - nx * w1, p1[1] - ny * w1); ctx.lineTo(p0[0] - nx * w0, p0[1] - ny * w0); ctx.closePath(); ctx.fill();
                    };
                    const w1 = Math.max(60, L * 0.13);
                    beam(6, w1, `rgba(${rgb}, ${0.2 * a})`, `rgba(${rgb}, ${0.07 * a})`);
                    beam(2, w1 * 0.3, `rgba(255, 244, 252, ${0.3 * a})`, `rgba(${rgb}, ${0.08 * a})`);
                    glowA(ctx, p0[0], p0[1], 14, '255, 248, 255', 0.9 * a);
                }
                ctx.restore();
            }

            /** The ground in front: the marble plaza, carpet and ropes; the terrace and the valet bay with its car; then the light at the door and the people. */
            _mcDrawGround(ctx) {
                const X = this.x, Y = this.y, G = this._mcGeo(), Q = G.court;
                const s1 = LandmarkKit.sprite(this, 'mcd_plaza', Q.x - 10, Q.y, Q.w + 20, Q.h + 6, 2, (c) => this._mcdPaintPlaza(c));
                ctx.drawImage(s1.cv, s1.x, s1.y, s1.w, s1.h);
                const s2 = LandmarkKit.sprite(this, 'mcd_east', X + 284, Y + 300, 316, 404, 1.5, (c) => this._mcdPaintEast(c));
                ctx.drawImage(s2.cv, s2.x, s2.y, s2.w, s2.h);
                this._mcdCar(ctx);
                const dark = typeof game !== 'undefined' && game.getAmbientDarkness ? game.getAmbientDarkness() : 0.6;
                const night = typeof game !== 'undefined' && game.dayCycle ? game.dayCycle().lampsOn : dark > 0.4;
                const B = this._mcBeat(), t = _gameTimeSec;
                if (night) {
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    glowA(ctx, G.door.x, G.door.y + 40, 110, '255, 40, 110', 0.3 + 0.12 * B.kick);                       // the crimson pool at the door, breathing on the kick
                    if (_zoomLOD < 1) for (let i = 0; i < 5; i++) {                                                        // low mist curling about the door
                        const mx = G.door.x + Math.sin(t * 0.21 + i * 1.7) * 80, my = Q.y + 50 + Math.cos(t * 0.17 + i * 2.3) * 30 + i * 11;
                        glowA(ctx, mx, my, 46, i % 2 ? '200, 168, 255' : '255, 120, 170', 0.07);
                    }
                    const BY = MCD.BAY; glowA(ctx, X + BY.x + BY.w / 2, Y + BY.y + 10, 150, '255, 190, 140', 0.12);
                    for (const [lx, ly] of [[BY.x + 6, BY.y - 8], [BY.x + 80, BY.y - 8], [BY.x + 156, BY.y - 8], [BY.x + 230, BY.y - 8]]) glowA(ctx, X + lx, Y + ly, 14, '255, 214, 150', 0.6);
                    ctx.restore();
                }
                this._mcdPeople(ctx, night);
            }

            /** The plaza: black marble, a gold sunburst from the door in deco arcs, crescents in rings, the red carpet and the ropes; its edges fade into the paving. */
            _mcdPaintPlaza(c) {
                const G = this._mcGeo(), Q = G.court, C = MCX.C, dx = G.door.x, r = seededRandom('mcd-plaza');
                c.save(); c.beginPath(); c.roundRect(Q.x, Q.y, Q.w, Q.h, [0, 0, 26, 26]); c.clip();
                c.fillStyle = '#1a1222'; c.fillRect(Q.x, Q.y, Q.w, Q.h);
                for (let y = Q.y; y < Q.y + Q.h; y += 20) for (let x = Q.x; x < Q.x + Q.w; x += 20) { c.fillStyle = r() < 0.5 ? 'rgba(62, 40, 78, 0.5)' : 'rgba(40, 26, 52, 0.5)'; c.fillRect(x + 0.5, y + 0.5, 19, 19); }
                c.strokeStyle = 'rgba(200, 168, 255, 0.08)'; c.lineWidth = 0.8;
                for (let i = 0; i < 26; i++) { const x = Q.x + r() * Q.w, y = Q.y + r() * Q.h; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 20, y + r() * 30, x + 40, y - r() * 20, x + 70, y + r() * 25); c.stroke(); }
                c.fillStyle = 'rgba(255, 255, 255, 0.05)'; for (let i = 0; i < 40; i++) c.fillRect(Q.x + r() * Q.w, Q.y + r() * Q.h, 6 + r() * 14, 0.8);   // the polish
                c.strokeStyle = 'rgba(232, 194, 122, 0.22)'; c.lineWidth = 1; c.beginPath();
                for (let i = 1; i < 24; i++) { const a = Math.PI * i / 24; c.moveTo(dx + Math.cos(a) * 28, Q.y + Math.sin(a) * 28); c.lineTo(dx + Math.cos(a) * 240, Q.y + Math.sin(a) * 240); }
                c.stroke();
                c.strokeStyle = 'rgba(232, 194, 122, 0.4)'; for (const rr of [74, 112, 150]) { c.beginPath(); c.arc(dx, Q.y, rr, 0, Math.PI); c.stroke(); }
                for (const sx of [-1, 1]) {
                    const px = dx + sx * 96, py = Q.y + 150;
                    c.beginPath(); c.arc(px, py, 17, 0, Math.PI * 2); c.strokeStyle = 'rgba(232, 194, 122, 0.5)'; c.stroke();
                    c.fillStyle = 'rgba(232, 194, 122, 0.65)'; _mcCrescent(c, px, py, 11, sx < 0 ? 0.6 : Math.PI - 0.6); c.fill();
                }
                // the red carpet, door to kerb, gold-edged, and the velvet ropes on gold stanchions either side of it
                const cw = 40; c.fillStyle = '#6a0a22'; c.fillRect(dx - cw / 2, Q.y, cw, Q.h);
                c.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = Q.y + 6; y < Q.y + Q.h; y += 8) c.fillRect(dx - cw / 2, y, cw, 1);
                c.fillStyle = C.gold; c.fillRect(dx - cw / 2, Q.y, 2, Q.h); c.fillRect(dx + cw / 2 - 2, Q.y, 2, Q.h);
                for (const sx of [-1, 1]) {
                    const xr = dx + sx * 34, ys = [Q.y + 110, Q.y + 132, Q.y + 154, Q.y + 176, Q.y + 198];
                    c.strokeStyle = C.velvetLt; c.lineWidth = 2.6;
                    for (let i = 0; i < ys.length - 1; i++) { c.beginPath(); c.moveTo(xr, ys[i]); c.quadraticCurveTo(xr + sx * 5, (ys[i] + ys[i + 1]) / 2, xr, ys[i + 1]); c.stroke(); }
                    for (const y of ys) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(xr + 1.5, y + 2, 3.6, 0, Math.PI * 2); c.fill(); c.fillStyle = C.gold; c.beginPath(); c.arc(xr, y, 3.4, 0, Math.PI * 2); c.fill(); c.fillStyle = C.goldLt; c.beginPath(); c.arc(xr - 1, y - 1, 1.2, 0, Math.PI * 2); c.fill(); }
                }
                c.restore();
                c.strokeStyle = 'rgba(168, 130, 62, 0.7)'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(Q.x + 4, Q.y + 1, Q.w - 8, Q.h - 5, [0, 0, 22, 22]); c.stroke();   // a gold inlay round it
                // fade the edges (not the top, against the wall) into the paving
                c.save(); c.globalCompositeOperation = 'destination-out';
                { const g = c.createLinearGradient(Q.x - 1, 0, Q.x + 12, 0); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(Q.x - 1, Q.y, 13, Q.h + 2); }
                { const g = c.createLinearGradient(Q.x + Q.w + 1, 0, Q.x + Q.w - 12, 0); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(Q.x + Q.w - 12, Q.y, 13, Q.h + 2); }
                { const g = c.createLinearGradient(0, Q.y + Q.h + 1, 0, Q.y + Q.h - 12); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(Q.x, Q.y + Q.h - 12, Q.w, 13); }
                c.restore();
            }

            /** East of the wing: a marble terrace along the hall's front, and the valet bay (lacquer paving, a gold kerb, bollards, the podium). */
            _mcdPaintEast(c) {
                const X = this.x, Y = this.y, C = MCX.C, r = seededRandom('mcd-east'), BY = MCD.BAY;
                const tx = X + 284, ty = Y + 300, tw = 316, th = 70;
                c.fillStyle = C.marble; c.beginPath(); c.roundRect(tx, ty, tw, th, [0, 0, 16, 16]); c.fill();
                for (let y = ty; y < ty + th; y += 18) for (let x = tx; x < tx + tw; x += 18) { c.fillStyle = r() < 0.5 ? 'rgba(40, 24, 52, 0.5)' : 'rgba(26, 16, 34, 0.5)'; c.fillRect(x + 0.5, y + 0.5, 17, 17); }
                c.fillStyle = 'rgba(255, 255, 255, 0.05)'; for (let i = 0; i < 30; i++) c.fillRect(tx + r() * tw, ty + r() * th, 6 + r() * 14, 0.8);
                c.strokeStyle = 'rgba(168, 130, 62, 0.7)'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(tx + 4, ty + 1, tw - 8, th - 5, [0, 0, 13, 13]); c.stroke();
                c.strokeStyle = 'rgba(232, 194, 122, 0.25)'; c.lineWidth = 1; c.beginPath(); for (let x = tx + 22; x < tx + tw - 10; x += 26) { c.moveTo(x, ty + th - 14); c.lineTo(x + 6, ty + th - 8); c.lineTo(x + 12, ty + th - 14); } c.stroke();   // a chevron inlay
                // the valet bay
                const bx = X + BY.x, by = Y + BY.y;
                c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.beginPath(); c.roundRect(bx - 3, by - 3, BY.w + 6, BY.h + 6, 18); c.fill();
                c.fillStyle = '#120c18'; c.beginPath(); c.roundRect(bx, by, BY.w, BY.h, 16); c.fill();
                c.fillStyle = 'rgba(200, 168, 255, 0.04)'; for (let i = 0; i < 260; i++) c.fillRect(bx + 8 + r() * (BY.w - 16), by + 8 + r() * (BY.h - 16), 1, 1);
                c.strokeStyle = C.goldDk; c.lineWidth = 3; c.beginPath(); c.roundRect(bx, by, BY.w, BY.h, 16); c.stroke();
                c.strokeStyle = 'rgba(255, 241, 194, 0.35)'; c.lineWidth = 0.8; c.beginPath(); c.roundRect(bx + 4, by + 4, BY.w - 8, BY.h - 8, 13); c.stroke();
                c.strokeStyle = 'rgba(232, 194, 122, 0.35)'; c.setLineDash([10, 8]); c.beginPath(); c.moveTo(bx + 20, by + BY.h / 2 + 30); c.lineTo(bx + BY.w - 20, by + BY.h / 2 + 30); c.stroke(); c.setLineDash([]);
                c.save(); c.font = '600 9px Montserrat, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(232, 194, 122, 0.55)'; c.fillText('V A L E T', bx + BY.w / 2, by + BY.h - 14); c.restore();
                for (const lx of [6, 80, 156, 230]) {                                                                           // gold bollards along the kerb
                    const x = bx + lx, y = by - 8;
                    c.fillStyle = 'rgba(0, 0, 0, 0.4)'; c.beginPath(); c.arc(x + 1.5, y + 2, 4.5, 0, Math.PI * 2); c.fill();
                    c.fillStyle = C.goldDk; c.beginPath(); c.arc(x, y, 4.2, 0, Math.PI * 2); c.fill(); c.fillStyle = C.goldLt; c.beginPath(); c.arc(x - 1, y - 1, 1.6, 0, Math.PI * 2); c.fill();
                }
                const vx = bx - 18, vy = by + 10;                                                                                 // the valet's podium
                c.fillStyle = 'rgba(0, 0, 0, 0.4)'; c.fillRect(vx + 2, vy + 2, 12, 9); c.fillStyle = '#100a16'; c.fillRect(vx, vy, 12, 9); c.strokeStyle = C.gold; c.lineWidth = 1; c.strokeRect(vx, vy, 12, 9);
            }

            /** The black car waiting in the bay, nose to the door. */
            _mcdCar(ctx) {
                if (typeof carSprite !== 'function' || typeof VEHICLE_BRANDS === 'undefined' || !VEHICLE_BRANDS.LADY) return;
                const m = VEHICLE_BRANDS.LADY.models.suv2; if (!m) return;
                const v = this._mcdV || (this._mcdV = { brand: 'LADY', model: 'suv2', visualStyle: VEHICLE_BRANDS.LADY.visualStyle, length: m.length, width: m.width, noHearseCap: !!m.noHearseCap, color: '#050505', glowColor: null });
                const sp = carSprite(v), P = CAR_ART.PAD, x = this.x + MCD.CAR[0], y = this.y + MCD.CAR[1];
                ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.beginPath(); ctx.roundRect(-sp.L / 2 - 2, -sp.W / 2 + 2, sp.L + 4, sp.W, 10); ctx.fill();
                ctx.drawImage(sp.cv, -sp.L / 2 - P, -sp.W / 2 - P, sp.L + P * 2, sp.W + P * 2);
                ctx.restore();
            }

            /** The bouncer at the rope and the queue along it: the front one goes in now and then, others come out. */
            _mcdPeople(ctx, night) {
                const G = this._mcGeo(), now = _gameTimeSec;
                const Q = this._mcQ || (this._mcQ = { people: [], t: now, next: now + 4, out: now + 20 });
                const dt = Math.min(0.1, Math.max(0, now - Q.t)); Q.t = now;
                if (!Q.bouncer) Q.bouncer = { x: G.bouncer.x, y: G.bouncer.y, angle: Math.PI / 2, walkPhase: 0, look: ROLE_LOOKS.mc_staff('bouncer', seededRandom('mcbouncer')), life: 1 };
                const want = night ? 7 : 1, queued = Q.people.filter(p => p.state === 'queue');
                if (queued.length < want && Q.people.length < 11 && (!Q.spawnAt || now > Q.spawnAt)) {
                    const p = { x: G.spawn.x, y: G.spawn.y, angle: Math.PI, walkPhase: 0, look: ROLE_LOOKS.clubgoer(seededRandom('mcq' + Math.random())), life: 0, state: 'queue' };
                    if (Math.random() < 0.4) p.look.held = null;
                    Q.people.push(p); Q.spawnAt = now + 1.5 + Math.random() * 2;
                }
                if (now > Q.next && queued.length) { queued[0].state = 'enter'; Q.next = now + (night ? 5 + Math.random() * 6 : 14); }
                if (night && now > Q.out) { Q.people.push({ x: G.door.x, y: G.door.y + 4, angle: Math.PI / 2, walkPhase: 0, look: ROLE_LOOKS.clubgoer(seededRandom('mco' + Math.random())), life: 0, state: 'leave' }); Q.out = now + 8 + Math.random() * 10; }
                let slot = 0;
                for (let i = Q.people.length - 1; i >= 0; i--) {
                    const p = Q.people[i];
                    let tx, ty;
                    if (p.state === 'queue') { const s = G.queue[Math.min(G.queue.length - 1, Q.people.filter(o => o.state === 'queue').indexOf(p))]; tx = s[0]; ty = s[1]; slot++; p.life = Math.min(1, p.life + dt * 1.5); }
                    else if (p.state === 'enter') {                                                    // round the rope's head, then up the carpet
                        const head = p.y > G.bouncer.y - 6 && Math.abs(p.x - G.door.x) > 6; tx = G.door.x; ty = head ? G.bouncer.y - 10 : G.door.y + 2;
                        if (Math.hypot(G.door.x - p.x, G.door.y + 2 - p.y) < 8) p.life -= dt * 2; else p.life = Math.min(1, p.life + dt);
                    }
                    else { tx = G.exit.x; ty = G.exit.y; p.life = ty - p.y < 30 ? p.life - dt * 1.5 : Math.min(1, p.life + dt * 2); }
                    if (p.life <= 0 && p.state !== 'queue') { Q.people.splice(i, 1); continue; }
                    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), sp = 1.1 * dt * 60;
                    let vx = 0, vy = 0;
                    if (d > 2) { vx = dx / d * Math.min(sp, d); vy = dy / d * Math.min(sp, d); p.x += vx; p.y += vy; p.angle = Math.atan2(vy, vx); p.look.pose = undefined; }
                    else { p.angle = p.state === 'queue' ? -Math.PI / 2 : p.angle; p.look.pose = pickFrom(seededRandom(p.look.skinColor + slot), ['idle', 'phone', 'fidget', 'breathe']); }
                    gaitCommand(p, vx, vy);
                }
                const front = Q.people.find(o => o.state !== 'leave');
                Q.bouncer.angle = front ? Math.atan2(front.y - Q.bouncer.y, front.x - Q.bouncer.x) : Math.PI / 2;
                Q.bouncer.look.pose = 'arms_crossed';
                const cam = typeof game !== 'undefined' ? game.camera : null;
                if (cam && Math.hypot(G.door.x - cam.x, G.door.y - cam.y) > 1400) return;
                for (const p of [...Q.people, Q.bouncer].sort((a, b) => a.y - b.y)) {
                    if (!decorativeBodyInView(p.x, p.y, p.look)) { tickHiddenDecorativeBody(p, p.look); continue; }
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                    drawProceduralHumanoid(ctx, p, { stance: 'idle', ...p.look });
                    ctx.restore();
                }
            }
        }

        /** Moon City: x, y its corner; it fronts south. */
        function createMoonCity(x, y, config = {}) {
            const Z = MCD.Z, P = MCD.PLAN, C = MCX.C;
            const gold = (z, out = 3.5, th = 4) => ({ z, out, th, top: '#1a1022', band: [168, 130, 62], lip: C.goldLt });
            const plinth = { z: 3, out: 1.4, th: 3, top: '#120c18', band: [40, 26, 48] };
            const circle = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos(-i * Math.PI * 2 / n) * r, cy + Math.sin(-i * Math.PI * 2 / n) * r]);
            const palm = (id, lx, ly) => ({ id, solid: false, poly: circle(lx, ly, 9, 8), z0: 0, z1: 8, S: 3, fill: '#0d0912', paint: _mcdPlanter, shade: [10, 6, 16],
                roof: (c, e, t) => { if (!e) { _mcdPath(c, t.poly); c.fillStyle = '#20160f'; c.fill(); c.strokeStyle = C.gold; c.lineWidth = 1; c.stroke(); } }, top: _mcdPalm, rise: 60 });
            const [rx0, rx1, rd] = MCD.ROT, D = MCD.DRUM;
            const b = new MoonCityBuilding({
                id: 'moon_city', x, y, label: 'Moon City Nightclub', type: 'club', style: 'moon_city', facing: 'S', hero: MCD.HERO, plan: P,
                roofColor: '#120a18', roofLightColor: '#1a1022', wallColor: '#140c1a', wallLightColor: '#1a1022', accentColor: '#b48cff',
                windowColor: '#0c0612', windowLitColor: '#ff7ab8', windowFrameColor: '#0a050a', balconies: [], roofProps: [{ type: 'vent', section: 0, x: 20, y: 20, w: 1, h: 1 }],
                sign: { text: 'Moon City', color: '#c8a8ff', size: 40 },
                door: { target: config.doorTarget || 'moon_city_nightclub', label: 'Enter Club', lightColor: null },
                tiers: [
                    { id: 'hall', rect: [0, 0, 600, 300], z0: 0, z1: Z.HALL, S: 2, fill: '#140c1a', paint: _mcdHall, ledges: [plinth, gold(Z.HALL)], shade: [20, 6, 30],
                      roofRes: 1, roofGlow: false, roof: _mcdHallRoof, top: _mcdHallTop },
                    { id: 'wing', rect: [0, 300, 280, 200], z0: 0, z1: Z.WING, S: 2, fill: '#140c1a', paint: _mcdWing, ledges: [plinth, gold(Z.WING)], shade: [20, 6, 30],
                      roofRes: 1, roofGlow: false, roof: _mcdWingRoof, top: _mcdWingTop },
                    { id: 'rotunda', on: 'wing', front: true, solid: false, poly: TierKit.bay(rx0, rx1, 500, 2, rd, 12), z0: Z.ROT0, z1: Z.ROT, S: 3, fill: '#0c0712', paint: _mcdRotunda, shade: [16, 4, 22],
                      ledges: [{ z: Z.ROT0 + 2, out: 2, th: 2.5, top: '#1a1022', band: [168, 130, 62] }, gold(Z.ROT, 3, 3.5)], roofRes: 2, roofGlow: true, roof: _mcdRotRoof },
                    { id: 'drum', on: 'hall', poly: circle(D.x, D.y, D.r, 24), z0: Z.HALL, z1: Z.DRUM, S: 2.5, fill: '#0d0912', paint: _mcdDrum, shade: [16, 4, 22],
                      ledges: [gold(Z.DRUM, 3, 3.5)], roofRes: 1, roofGlow: false, roof: _mcdDrumRoof, top: _mcdDome, rise: Z.DOME },
                    ...MCD.PALMS.map(([lx, ly], i) => palm('palm' + i, lx, ly))
                ],
                ...config,
                facing: 'S'   // (a landmark keeps its own front, whatever street it's placed on)
            });
            for (const t of b._tkDefs) t.owner = b;                                                          // (the painters find the door and the drum in the building's frame)
            // its lights (light only, no fixtures): the crimson pool at the door, the canopy, the sign, the glass drum, uplights along the hall's front, the terrace, the valet bay, the palms
            for (const [lx, ly, color, r] of [[140, 530, C.crimson, 230], [140, 506, '#ffc890', 150], [140, 560, '#ffb8d4', 180], [140, 548, '#ff5aa8', 170],
                                              [330, 306, '#ff5aa8', 170], [450, 306, '#d08cff', 170], [570, 306, '#ff5aa8', 170], [-6, 400, '#b48cff', 150],
                                              [150, -6, '#b48cff', 160], [450, -6, '#b48cff', 160], [452, 610, '#ffd2a0', 150], [20, 548, '#ffd28a', 90], [260, 548, '#ffd28a', 90]]) {
                const lamp = new LampEntity({ x: b.x + lx, y: b.y + ly, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; lamp.visible = false; b.attachedLights.push(lamp);
            }
            b.topReach = 130; b.glowReach = 130;
            b.viewDrift = true;   // out in front of it, the view drifts toward it (engine/draw.js _landmarkDriftTarget)
            return b;
        }

        BuildingV2Registry.register('moon_city', {
            factory: createMoonCity,
            sections: [{ x: 0, y: 0, w: 600, h: 300 }, { x: 0, y: 300, w: 280, h: 200 }],
            accentColor: '#b48cff', label: 'Moon City Nightclub', type: 'club', category: 'entertainment', floors: 13,
            sign: { text: 'CLUB', color: '#c8a8ff', size: 40 },
            door: { target: 'moon_city_nightclub', label: 'Enter Club', lightColor: '#ff3a6a' },
            apron: { x: 0, y: 490, w: 600, h: 194 }   // the plaza, the queue, the terrace and the valet bay (MoonCityBuilding._mcDrawGround): the same box as before, nothing round it moves
        });
