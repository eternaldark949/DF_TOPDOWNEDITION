        /* =====================================================================
           THE ASHGROVE — a mansion block across Ashgrove St from Biggs Park
           ---------------------------------------------------------------------
           Built on the tiered kit (buildings/tiered-kit.js), every part at its
           own height:
             · two pale brick wings, eight floors, a limestone ground floor, and
               a slate mansard with dormers and chimneys on top of each;
             · roof terraces in front of the mansards, festoon-lit after dark;
             · between them the tower, fourteen floors, on the street front: a
               limestone ground floor with arched windows, the name in its
               frieze and the door under the bay; skylights, air handlers and
               a water tank on its roof;
             · out of the tower's front, from the second floor up, the
               ornate bay in green-teal stone: mullioned windows lit warm,
               cornice bands round the curve, a carved crown (a lion's mask,
               rosettes in acanthus scrolls, volute consoles), rising past the
               tower's roof into a turret with an open loggia and a ribbed
               copper dome;
             · on each wing's front a small teal oriel from the second floor up.
           It stands in the block across Ashgrove St from the park, its back to
           the park and its front on Foundry Rd: a front facing north would lie
           upside down on the screen (the camera looks down from the street), so
           the carving faces south (config.facing 'N' turns it round).
           Collision is the wings and tower; the bay, oriels and turret
           overhang.
           ===================================================================== */
        const ASH = {
            HERO: 2.1,
            PLAN: { W: 820, D: 470 },
            TEAL: { stone: '#40806f', stoneMid: '#336a5c', stoneLo: '#214b40', stoneDk: '#0e2622', stoneHi: '#9ad6bf', stoneLt: '#5f9e89',
                    trim: '#e6e1d2', trimLo: '#a29c8d', trimDk: '#6f6a5f', frame: '#11171a' },
            LIME: { stone: '#d8cdb3', stoneMid: '#c7bb9f', stoneLo: '#a89c80', stoneDk: '#6e6450', stoneHi: '#fbf4e2', stoneLt: '#e8dfc8',
                    trim: '#ece5d2', trimLo: '#b3a98f', trimDk: '#7a705c', frame: '#15181b' },
            BRICK: { brick: '#cfc6b2', brickLo: '#b8ae98', mortar: 'rgba(84, 78, 64, 0.3)' },
            SLATE: { slate: '#3b4450', slateLo: '#2a313a', slateHi: '#5b6674', copper: '#5f9e89' },
            GOLD: '#d8b46a', WARM: '#ffcf8a',
            STOREY: 18
        };

        // ── painters: each paints a tier's strip, x along its plan, y down from its top ──

        /** The tier's edges along the strip (u0, L), with those hidden against the tier it stands out of marked. */
        const _ashEdges = (t) => t.mitre.filter(Boolean);

        /** Pale brick: courses, quoins at the corners, string courses every other floor, stone-framed windows with hoods and
            sills; a limestone ground floor with arched windows (plinth: its height). */
        function _ashBrick(d, l, t, H, L, opt = {}) {
            const B = ASH.BRICK, O = Ornament.use(ASH.LIME), C = O.C, r = seededRandom(opt.seed || 11), plinth = opt.plinth || 0, top = 7;
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, B.brick); g.addColorStop(1, B.brickLo); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            for (let y = top, k = 0; y < H - plinth; y += 2.4, k++) for (let x = (k % 2) * -2.6; x < L; x += 5.2) if (r() < 0.25) { d.fillStyle = r() < 0.5 ? 'rgba(120, 104, 84, 0.12)' : 'rgba(255, 250, 238, 0.12)'; d.fillRect(x, y, 5.2, 2.4); }
            d.strokeStyle = B.mortar; d.lineWidth = 0.3; d.beginPath();
            for (let y = top, k = 0; y < H - plinth; y += 2.4, k++) { d.moveTo(0, y); d.lineTo(L, y); for (let x = (k % 2) * 2.6; x < L; x += 5.2) { d.moveTo(x, y); d.lineTo(x, y + 2.4); } }
            d.stroke();
            const edges = _ashEdges(t), rows = [];
            for (let y = top; y + ASH.STOREY <= H - plinth + 0.5; y += ASH.STOREY) rows.push(y);
            for (const e of edges) {
                if (e.hidden) continue;
                // quoins at both corners
                for (const X of [e.u0, e.u0 + e.L]) for (let y = top, k = 0; y < H - plinth - 4; y += 4.6, k++) {
                    const w = k % 2 ? 4 : 5.5, x = X === e.u0 ? X : X - w; d.fillStyle = C.trim; d.fillRect(x, y, w, 4.2); d.fillStyle = C.trimLo; d.fillRect(x, y + 3.8, w, 0.4);
                }
                const n = Math.max(1, Math.floor((e.L - 10) / 30)), ww = 10;
                for (let i = 0; i < n; i++) {
                    const xc = e.u0 + (i + 0.5) * e.L / n, x0 = xc - ww / 2, x1 = xc + ww / 2;
                    for (const y of rows) {
                        const y0 = y + 4.5, y1 = y + ASH.STOREY - 2.5;
                        d.fillStyle = C.trim; d.fillRect(x0 - 1.8, y0 - 1.8, ww + 3.6, y1 - y0 + 3.6);
                        O.window(d, l, x0, y0, x1, y1, r() < 0.55, r, false);
                        d.fillStyle = C.trim; d.fillRect(x0 - 3, y0 - 4.2, ww + 6, 2.2); d.fillStyle = '#fffaf0'; d.fillRect(x0 - 3, y0 - 4.2, ww + 6, 0.5);
                        d.fillStyle = 'rgba(60, 56, 46, 0.4)'; d.fillRect(x0 - 3, y0 - 2, ww + 6, 0.5);
                        d.fillStyle = C.trim; d.fillRect(x0 - 2.4, y1 + 1.8, ww + 4.8, 1.3); d.fillStyle = 'rgba(60, 56, 46, 0.45)'; d.fillRect(x0 - 2.4, y1 + 3.1, ww + 4.8, 0.7);
                    }
                }
            }
            // string courses every other floor, the cornice, the plinth
            rows.forEach((y, i) => { if (i % 2 || !i) return; d.fillStyle = C.trim; d.fillRect(0, y - 0.6, L, 2.2); d.fillStyle = '#fffaf0'; d.fillRect(0, y - 0.6, L, 0.5); d.fillStyle = 'rgba(60, 56, 46, 0.3)'; d.fillRect(0, y + 1.6, L, 0.8); });
            d.fillStyle = C.trim; d.fillRect(0, 0, L, 6); d.fillStyle = '#fffaf0'; d.fillRect(0, 0, L, 0.8); d.fillStyle = C.trimLo; d.fillRect(0, 3.2, L, 0.4);
            for (let x = 1; x < L; x += 3.4) { d.fillStyle = C.trim; d.fillRect(x, 6, 1.6, 1.4); d.fillStyle = 'rgba(60, 56, 46, 0.4)'; d.fillRect(x, 7.4, 1.6, 0.5); }
            if (plinth) _ashLime(d, l, t, H, L, { y0: H - plinth, seed: (opt.seed || 11) + 3, arches: true, ...opt.lime });
        }

        /** Limestone: rusticated ashlar, arched windows with voussoirs and keystones (or a door), a frieze with the name. */
        function _ashLime(d, l, t, H, L, opt = {}) {
            const O = Ornament.use(ASH.LIME), C = O.C, r = seededRandom(opt.seed || 23), y0 = opt.y0 || 0;
            { const g = d.createLinearGradient(0, y0, 0, H); g.addColorStop(0, C.stoneLt); g.addColorStop(1, C.stoneMid); d.fillStyle = g; d.fillRect(0, y0, L, H - y0); }
            d.strokeStyle = 'rgba(90, 78, 56, 0.35)'; d.lineWidth = 0.45; d.beginPath();
            for (let y = y0 + (opt.frieze ? 9 : 2), k = 0; y < H - 2; y += 4.4, k++) { d.moveTo(0, y); d.lineTo(L, y); for (let x = (k % 2) * 6; x < L; x += 12) { d.moveTo(x, y); d.lineTo(x, y + 4.4); } }
            d.stroke();
            d.fillStyle = C.stoneLo; d.fillRect(0, H - 2.5, L, 2.5);
            for (const e of _ashEdges(t)) {
                if (e.hidden) continue;
                const top = y0 + (opt.frieze ? 11 : 3), bot = H - 3, n = Math.max(1, Math.floor(e.L / 40)), aw = Math.min(16, e.L / n * 0.5);
                const door = opt.door && e === opt.door(t) ? Math.floor(n / 2) : -1;
                for (let i = 0; i < n; i++) {
                    const xc = e.u0 + (i + 0.5) * e.L / n, isDoor = i === door, w = isDoor ? aw * 1.3 : aw, spring = top + w / 2 + 1;
                    const arch = (c) => { c.beginPath(); c.moveTo(xc - w / 2, bot); c.lineTo(xc - w / 2, spring); c.arc(xc, spring, w / 2, Math.PI, 0); c.lineTo(xc + w / 2, bot); c.closePath(); };
                    // voussoirs round the arch, the keystone
                    d.save(); d.lineWidth = 2.6; d.strokeStyle = C.stoneLt; arch(d); d.stroke(); d.lineWidth = 0.35; d.strokeStyle = 'rgba(90, 78, 56, 0.6)';
                    for (let k = 1; k < 9; k++) { const a = Math.PI + k * Math.PI / 9; d.beginPath(); d.moveTo(xc + Math.cos(a) * w / 2, spring + Math.sin(a) * w / 2); d.lineTo(xc + Math.cos(a) * (w / 2 + 2.6), spring + Math.sin(a) * (w / 2 + 2.6)); d.stroke(); }
                    d.restore();
                    arch(d); const g = d.createLinearGradient(0, top, 0, bot); g.addColorStop(0, '#26323a'); g.addColorStop(1, '#3a3530'); d.fillStyle = g; d.fill();
                    d.save(); arch(d); d.clip(); d.fillStyle = 'rgba(200, 225, 235, 0.12)'; d.fillRect(xc - w / 2, top, w * 0.35, bot - top); d.restore();
                    if (isDoor) {                                                                       // the door: two leaves under a fanlight
                        d.fillStyle = '#2c1d16'; d.fillRect(xc - w / 2 + 1, spring + 1, w - 2, bot - spring - 1);
                        d.fillStyle = ASH.GOLD; d.fillRect(xc - 0.3, spring + 1, 0.6, bot - spring - 1); d.fillRect(xc - 2.5, (spring + bot) / 2, 1, 1); d.fillRect(xc + 1.5, (spring + bot) / 2, 1, 1);
                        l.save(); arch(l); l.clip(); const lg = l.createRadialGradient(xc, spring, 0, xc, spring, w); lg.addColorStop(0, 'rgba(255, 220, 160, 1)'); lg.addColorStop(1, 'rgba(255, 180, 100, 0.2)'); l.fillStyle = lg; l.fillRect(xc - w, top, w * 2, spring - top + 1); l.restore();
                    } else {
                        // a shop or a hall inside: warm, a pendant lamp, figures of furniture
                        d.fillStyle = 'rgba(14, 16, 18, 0.5)'; d.fillRect(xc - w / 2 + 2, bot - 6, w - 4, 3);
                        d.strokeStyle = O.C.frame; d.lineWidth = 0.6; arch(d); d.stroke(); d.beginPath(); d.moveTo(xc, spring - w / 2); d.lineTo(xc, bot); d.moveTo(xc - w / 2, spring); d.lineTo(xc + w / 2, spring); d.stroke();
                        if (r() < 0.8) {
                            l.save(); arch(l); l.clip();
                            const lg = l.createLinearGradient(0, top, 0, bot); lg.addColorStop(0, 'rgba(255, 176, 100, 0.65)'); lg.addColorStop(1, 'rgba(255, 210, 140, 0.95)'); l.fillStyle = lg; l.fillRect(xc - w / 2, top, w, bot - top);
                            l.globalCompositeOperation = 'destination-out'; l.fillStyle = 'rgba(0, 0, 0, 0.6)'; l.fillRect(xc - w / 2 + 2, bot - 6, w - 4, 3);
                            l.fillStyle = '#000'; l.fillRect(xc - 0.3, top, 0.6, bot - top); l.fillRect(xc - w / 2, spring - 0.3, w, 0.6); l.restore();
                        }
                    }
                    Ornament.carve(d, (q) => { q.beginPath(); q.moveTo(xc - 2, spring - w / 2 - 3.2); q.lineTo(xc + 2, spring - w / 2 - 3.2); q.lineTo(xc + 1.3, spring - w / 2 + 0.6); q.lineTo(xc - 1.3, spring - w / 2 + 0.6); q.closePath(); }, C.stoneLt, C.stoneHi, C.stoneDk, 0.3);
                }
            }
            if (opt.frieze) {                                                                           // the frieze and its cornice; the name on the front
                d.fillStyle = C.stone; d.fillRect(0, y0, L, 9); d.fillStyle = C.stoneHi; d.fillRect(0, y0, L, 0.8); d.fillStyle = C.stoneLo; d.fillRect(0, y0 + 8.4, L, 0.6);
                for (let x = 1; x < L; x += 2.6) { d.fillStyle = C.stoneLt; d.fillRect(x, y0 + 1.2, 1.3, 1.2); }
                const f = opt.door && opt.door(t);
                if (f) for (const [c, col] of [[d, '#9a7a3c'], [l, 'rgba(255, 220, 160, 1)']]) {
                    c.save(); c.font = 'bold 5px Montserrat, "Cinzel", serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col;
                    for (const at of opt.names || [0.5]) c.fillText('T H E  A S H G R O V E', f.u0 + f.L * at, y0 + 5.2);   // (either side of the bay)
                    c.restore();
                }
            }
        }

        /** The teal bay: a window a floor in each facet, cornice bands between, panels on the cheeks; the carved crown at the top. */
        function _ashBay(d, l, t, H, L) {
            const O = Ornament.use(ASH.TEAL), C = O.C, r = seededRandom(9491), crown = 28, cap = 4;
            const storeys = [[31, 46], [53, 68], [75, 87]], bands = [48, 70];
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.stone); g.addColorStop(1, C.stoneMid); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            d.strokeStyle = 'rgba(16, 36, 36, 0.22)'; d.lineWidth = 0.3; d.beginPath(); for (let y = crown + 3; y < H; y += 4.5) { d.moveTo(0, y); d.lineTo(L, y); } d.stroke();
            for (let i = 0; i < L * H / 6; i++) { d.fillStyle = r() < 0.5 ? 'rgba(10, 30, 30, 0.08)' : 'rgba(190, 230, 220, 0.06)'; d.fillRect(r() * L, r() * H, 0.5 + r() * 0.8, 0.5 + r() * 1.6); }
            const edges = _ashEdges(t), hid = edges.findIndex(e => e.hidden), ring = edges.slice(hid + 1).concat(edges.slice(0, hid));   // round the bay from one cheek to the other
            const cheeks = [ring[0], ring[ring.length - 1]], facets = ring.slice(1, -1), mid = Math.floor(facets.length / 2);
            for (const e of cheeks) for (const [y0, y1] of storeys) {
                const x0 = e.u0 + 2.5, x1 = e.u0 + e.L - 2.5;
                d.fillStyle = C.stoneLo; d.fillRect(x0, y0, x1 - x0, y1 - y0); d.fillStyle = C.stoneHi; d.fillRect(x0, y1 - 0.4, x1 - x0, 0.4); d.fillRect(x1 - 0.4, y0, 0.4, y1 - y0); d.fillStyle = C.stoneDk; d.fillRect(x0, y0, x1 - x0, 0.5); d.fillRect(x0, y0, 0.5, y1 - y0);
            }
            facets.forEach((e, i) => {
                const pier = Math.max(4, e.L * 0.15), x0 = e.u0 + pier, x1 = e.u0 + e.L - pier;
                storeys.forEach(([y0, y1], s) => O.window(d, l, x0, y0, x1, y1, !(s === 2 && i === 0) && r() < 0.9, r, true));
                for (const X of [e.u0 + pier / 2, e.u0 + e.L - pier / 2]) { d.fillStyle = 'rgba(14, 32, 32, 0.4)'; d.fillRect(X - 0.35, crown + 2, 0.7, H - crown - 4); d.fillStyle = 'rgba(170, 220, 205, 0.18)'; d.fillRect(X + 0.35, crown + 2, 0.35, H - crown - 4); }
                for (const [y0] of storeys.slice(1)) O.carve(d, (q) => { const xc = (x0 + x1) / 2; q.beginPath(); q.moveTo(xc - 1.6, y0 - 2.2); q.lineTo(xc + 1.6, y0 - 2.2); q.lineTo(xc + 1.1, y0 + 1); q.lineTo(xc - 1.1, y0 + 1); q.closePath(); }, C.stoneLt, C.stoneHi, C.stoneDk, 0.3);
            });
            const band = (y, h) => { d.fillStyle = C.stoneLt; d.fillRect(0, y, L, h * 0.35); d.fillStyle = C.stone; d.fillRect(0, y + h * 0.35, L, h * 0.35); d.fillStyle = C.stoneLo; d.fillRect(0, y + h * 0.7, L, h * 0.3); d.fillStyle = 'rgba(8, 20, 20, 0.45)'; d.fillRect(0, y + h, L, 1.2); };
            for (const y of bands) band(y, 5);
            band(crown, 2.5);
            // the crown: a sunk field; the lion over the front window, rosettes in scrolls either side, a garland of acanthus
            d.fillStyle = 'rgba(10, 26, 26, 0.35)'; d.fillRect(0, cap, L, crown - cap);
            const fm = facets[mid], lx = fm.u0 + fm.L / 2, ly = (cap + crown) / 2 + 0.5;
            for (let x = 3; x < L; x += 9) { const dn = Math.round(x / 9) % 2; if (Math.abs(x - lx) < 18) continue; O.leaf(d, x, crown - 2, 9, dn ? -0.3 : Math.PI + 0.3, 0.3, dn ? -1 : 1); }
            facets.forEach((e, i) => {
                if (i === mid) return;
                const xc = e.u0 + e.L / 2, s = i < mid ? 1 : -1, rr = Math.abs(i - mid) === 1 ? 9 : 7.5;
                O.scroll(d, xc, ly, rr * 1.15, s, s > 0 ? 0 : Math.PI); O.rosette(d, xc, ly, rr * 0.62);
                O.leaf(d, xc + s * rr * 1.1, ly + 2, rr * 1.4, s > 0 ? -0.35 : Math.PI + 0.35, 0.3);
                O.leaf(d, xc - s * rr * 1.05, ly - 3, rr * 1.1, s > 0 ? Math.PI + 0.6 : -0.6, 0.28);
            });
            for (const s of [-1, 1]) { O.leaf(d, lx + s * 11, ly + 6, 12, s > 0 ? -0.45 : Math.PI + 0.45, 0.32, -s); O.leaf(d, lx + s * 10, ly - 6, 11, s > 0 ? 0.35 : Math.PI - 0.35, 0.3, s); }
            O.lion(d, lx, ly + 1, 12.5);
            facets.forEach((e) => { const pier = Math.max(4, e.L * 0.15); O.console(d, e.u0 + pier * 0.55, crown + 1, storeys[0][1] - 2, 1); O.console(d, e.u0 + e.L - pier * 0.55, crown + 1, storeys[0][1] - 2, -1); });
            d.fillStyle = C.stoneLt; d.fillRect(0, 0, L, 1.6); d.fillStyle = C.stone; d.fillRect(0, 1.6, L, 1.2); d.fillStyle = C.stoneLo; d.fillRect(0, 2.8, L, cap - 2.8);
            d.fillStyle = C.stoneLt; for (let x = 0.6; x < L; x += 2.2) d.fillRect(x, 2.9, 1.1, 1);
            { const gl = l.createRadialGradient(lx, storeys[0][0], 0, lx, storeys[0][0], 18); gl.addColorStop(0, 'rgba(255, 190, 120, 0.2)'); gl.addColorStop(1, 'rgba(255, 190, 120, 0)'); l.fillStyle = gl; l.fillRect(lx - 20, cap, 40, 28); }
            l.save(); l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-over'; l.globalAlpha = 0.2; l.drawImage(d.canvas, 0, 0); l.restore();
        }

        /** A small teal oriel: a window a floor, bands, a rosette in each facet's frieze. */
        function _ashOriel(d, l, t, H, L) {
            const O = Ornament.use(ASH.TEAL), C = O.C, r = seededRandom(313);
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.stone); g.addColorStop(1, C.stoneMid); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            const rows = []; for (let y = 12; y + ASH.STOREY <= H + 0.5; y += ASH.STOREY) rows.push(y);
            for (const e of _ashEdges(t)) {
                if (e.hidden) continue;
                const pier = Math.max(3, e.L * 0.16), x0 = e.u0 + pier, x1 = e.u0 + e.L - pier;
                if (x1 - x0 > 5) for (const y of rows) O.window(d, l, x0, y + 3, x1, y + ASH.STOREY - 3, r() < 0.7, r, true);
                if (e.L > 18) O.rosette(d, e.u0 + e.L / 2, 6.5, 3.6);
            }
            d.fillStyle = C.stoneLt; d.fillRect(0, 0, L, 1.4); d.fillStyle = C.stoneLo; d.fillRect(0, 10.5, L, 1);
            for (const y of rows.slice(1)) { d.fillStyle = C.stoneLt; d.fillRect(0, y, L, 1.2); d.fillStyle = 'rgba(8, 20, 20, 0.4)'; d.fillRect(0, y + 1.2, L, 0.8); }
            l.save(); l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-over'; l.globalAlpha = 0.18; l.drawImage(d.canvas, 0, 0); l.restore();
        }

        /** The turret over the bay: an open loggia, an arch in each facet with a lantern hanging in it, pilasters, a cap. */
        function _ashTurret(d, l, t, H, L) {
            const O = Ornament.use(ASH.TEAL), C = O.C;
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.stoneLt); g.addColorStop(1, C.stone); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            for (const e of _ashEdges(t)) {
                if (e.hidden) continue;
                const w = Math.min(e.L * 0.6, 18), xc = e.u0 + e.L / 2, top = 7, bot = H - 3, spring = top + w / 2;
                if (w < 6) continue;
                const arch = (c) => { c.beginPath(); c.moveTo(xc - w / 2, bot); c.lineTo(xc - w / 2, spring); c.arc(xc, spring, w / 2, Math.PI, 0); c.lineTo(xc + w / 2, bot); c.closePath(); };
                arch(d); d.fillStyle = '#0b1716'; d.fill(); d.lineWidth = 1.2; d.strokeStyle = C.stoneHi; d.stroke();
                d.fillStyle = C.stoneDk; d.fillRect(xc - w / 2, bot - 3, w, 3);                                 // the balustrade's rail
                for (let x = xc - w / 2 + 1.5; x < xc + w / 2; x += 2.4) d.fillRect(x, bot - 5.5, 0.9, 2.5);
                d.fillStyle = '#3a2a1a'; d.fillRect(xc - 0.2, top + 2, 0.4, w / 2);                           // a lantern on its chain
                d.fillStyle = '#7a5a2a'; d.fillRect(xc - 1.2, spring + 1, 2.4, 3);
                const lg = l.createRadialGradient(xc, spring + 2.5, 0, xc, spring + 2.5, w * 0.7); lg.addColorStop(0, 'rgba(255, 236, 190, 1)'); lg.addColorStop(0.25, 'rgba(255, 196, 120, 0.7)'); lg.addColorStop(1, 'rgba(255, 170, 90, 0)');
                l.save(); arch(l); l.clip(); l.fillStyle = lg; l.fillRect(xc - w, top, w * 2, bot - top); l.restore();
                O.carve(d, O.ellipse(e.u0 + 1.5, H / 2, 1.2, H / 2 - 2), C.stoneLt, C.stoneHi, C.stoneDk, 0.3);
            }
            d.fillStyle = C.stoneHi; d.fillRect(0, 0, L, 1); d.fillStyle = C.stoneLo; d.fillRect(0, 4.5, L, 1.5);
            for (let x = 0.6; x < L; x += 2.2) { d.fillStyle = C.stoneLt; d.fillRect(x, 3, 1.1, 1.2); }
            l.save(); l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-over'; l.globalAlpha = 0.2; l.drawImage(d.canvas, 0, 0); l.restore();
        }

        /** The mansard: slate in fish-scale rows, dormers with little pediments (some lit), copper cresting along the top. */
        function _ashMansard(d, l, t, H, L) {
            const S = ASH.SLATE, r = seededRandom(707);
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.slateLo); g.addColorStop(1, S.slate); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            for (let y = 2, k = 0; y < H; y += 2.2, k++) for (let x = (k % 2) * 1.6; x < L; x += 3.2) { d.fillStyle = r() < 0.5 ? S.slateHi : S.slateLo; d.globalAlpha = 0.35; d.beginPath(); d.arc(x, y, 1.5, 0, Math.PI); d.fill(); }
            d.globalAlpha = 1;
            const O = Ornament.use(ASH.LIME), C = O.C;
            for (const e of _ashEdges(t)) {
                if (e.hidden) continue;
                const n = Math.max(1, Math.floor((e.L - 10) / 30));
                for (let i = 0; i < n; i++) {
                    const xc = e.u0 + (i + 0.5) * e.L / n, w = 7, y0 = 4, y1 = H - 2;
                    d.fillStyle = C.trim; d.beginPath(); d.moveTo(xc - w / 2 - 2, y0 + 1); d.lineTo(xc, y0 - 3); d.lineTo(xc + w / 2 + 2, y0 + 1); d.closePath(); d.fill();
                    d.fillStyle = C.trim; d.fillRect(xc - w / 2 - 1.2, y0 + 1, w + 2.4, y1 - y0 - 1);
                    O.window(d, l, xc - w / 2, y0 + 2, xc + w / 2, y1 - 1, r() < 0.45, r, false);
                }
            }
            d.fillStyle = S.copper; d.fillRect(0, 0, L, 1.2);
            for (let x = 1; x < L; x += 3) { d.fillStyle = S.copper; d.fillRect(x, -0.5, 0.6, 1.6); }
            d.fillStyle = 'rgba(0, 0, 0, 0.35)'; d.fillRect(0, H - 1, L, 1);
        }

        /** The water tank: staves and iron hoops. */
        function _ashTank(d, l, t, H, L) {
            d.fillStyle = '#6a4a32'; d.fillRect(0, 0, L, H);
            for (let x = 0; x < L; x += 2.6) { d.fillStyle = (x / 2.6) % 2 < 1 ? 'rgba(255, 220, 180, 0.08)' : 'rgba(0, 0, 0, 0.15)'; d.fillRect(x, 0, 2.6, H); }
            d.fillStyle = '#2a2420'; for (const y of [2, H * 0.4, H * 0.75]) d.fillRect(0, y, L, 0.9);
        }

        // ── roofs (world coordinates, in each tier's plane) ──

        function _ashFlatRoof(c, t, opt = {}) {
            const r = seededRandom(opt.seed || 5), path = () => { c.beginPath(); t.poly.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };
            const [x0, y0, x1, y1] = t.box;
            path(); const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, opt.a || '#8a8478'); g.addColorStop(1, opt.b || '#6c675e'); c.fillStyle = g; c.fill();
            c.save(); path(); c.clip();
            for (let i = 0; i < (x1 - x0) * (y1 - y0) / 30; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.12)'; c.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1, 1); }
            c.restore();
            path(); c.lineJoin = 'miter'; c.strokeStyle = opt.parapet || '#e6e1d2'; c.lineWidth = opt.pw || 8; c.stroke();
            path(); c.strokeStyle = 'rgba(0, 0, 0, 0.3)'; c.lineWidth = 1; c.stroke();
        }

        /** A roof terrace in box [x0, y0, x1, y1]: tiles, planters, festoon strings (emissive: their bulbs). */
        function _ashTerraceRoof(c, box, emissive) {
            const [x0, y0, x1, y1] = box, rows = 3, row = (i) => y0 + 24 + i * (y1 - y0 - 48) / (rows - 1);
            if (emissive) {                                                                             // festoon lights over the terrace
                for (let i = 0; i < rows; i++) { const y = row(i); for (let x = x0 + 20; x < x1 - 20; x += 21) { const yy = y + Math.sin(x * 0.2) * 3, g = c.createRadialGradient(x, yy, 0, x, yy, 3.5); g.addColorStop(0, 'rgba(255, 236, 190, 0.85)'); g.addColorStop(0.35, 'rgba(255, 200, 120, 0.35)'); g.addColorStop(1, 'rgba(255, 200, 120, 0)'); c.fillStyle = g; c.fillRect(x - 4, yy - 4, 8, 8); } }
                return;
            }
            c.fillStyle = '#b9ab90'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            for (let y = y0; y < y1; y += 10) for (let x = x0 + ((y - y0) / 10 % 2) * 10; x < x1; x += 20) { c.fillStyle = '#a99b80'; c.fillRect(x, y, 10, 10); }
            for (const [px, py] of [[x0 + 18, y0 + 18], [x1 - 18, y0 + 18], [x0 + 18, y1 - 18], [x1 - 18, y1 - 18], [(x0 + x1) / 2, y1 - 18]]) {
                c.fillStyle = '#5a4636'; c.fillRect(px - 9, py - 9, 18, 18); c.fillStyle = '#2f5a34'; c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(140, 200, 120, 0.4)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(px - 3 + (k * 37 % 7), py - 3 + (k * 23 % 7), 2, 0, Math.PI * 2); c.fill(); }
            }
            c.strokeStyle = 'rgba(40, 30, 20, 0.5)'; c.lineWidth = 0.6; for (let i = 0; i < rows; i++) { const y = row(i); c.beginPath(); for (let x = x0 + 20; x <= x1 - 20; x += 7) c.lineTo(x, y + Math.sin(x * 0.2) * 3); c.stroke(); }
            c.strokeStyle = '#ece5d2'; c.lineWidth = 4; c.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
            c.fillStyle = '#7a5a40'; for (let x = x0 + 40; x < x1 - 30; x += 46) { c.fillRect(x, y0 + 8, 14, 5); c.fillRect(x + 2, y0 + 14, 10, 1.5); }   // benches along the mansard
        }

        /** Skylights: glazed panes in a frame (emissive: lit from below). */
        function _ashSkylights(c, x0, y0, n, w, h, gap, emissive) {
            for (let i = 0; i < n; i++) {
                const x = x0 + i * (w + gap);
                if (emissive) { const g = c.createLinearGradient(x, y0, x, y0 + h); g.addColorStop(0, 'rgba(255, 196, 120, 0.12)'); g.addColorStop(1, 'rgba(255, 206, 140, 0.32)'); c.fillStyle = g; c.fillRect(x + 2, y0 + 2, w - 4, h - 4); c.fillStyle = 'rgba(0, 0, 0, 1)'; for (let k = 1; k < 3; k++) c.fillRect(x + 2, y0 + 2 + k * (h - 4) / 3, w - 4, 0.8); continue; }
                c.fillStyle = '#d8d2c2'; c.fillRect(x, y0, w, h);
                const g = c.createLinearGradient(x, y0, x + w, y0 + h); g.addColorStop(0, '#5d7a88'); g.addColorStop(1, '#2c3c46'); c.fillStyle = g; c.fillRect(x + 2, y0 + 2, w - 4, h - 4);
                c.fillStyle = 'rgba(0, 0, 0, 0.35)'; for (let k = 1; k < 3; k++) c.fillRect(x + 2, y0 + 2 + k * (h - 4) / 3, w - 4, 0.8);
                c.fillStyle = 'rgba(220, 240, 255, 0.25)'; c.fillRect(x + 3, y0 + 3, (w - 6) * 0.4, 1.2);
            }
        }

        // ── what stands on the roofs, drawn live ──

        /** A box standing from z0 to z1 (chimneys, the roof hatch): its walls toward the camera, then its cap. */
        function _ashPrism(ctx, b, x0, y0, x1, y1, z0, z1, wall, cap) {
            const cam = game.camera, walls = [];
            if (cam.y > y1) walls.push([x0, y1, x1, y1, 0]); if (cam.y < y0) walls.push([x1, y0, x0, y0, 0.3]);
            if (cam.x > x1) walls.push([x1, y1, x1, y0, 0.15]); if (cam.x < x0) walls.push([x0, y0, x0, y1, 0.15]);
            for (const [ax, ay, bx, by, s] of walls) {
                const a = b._tkP(ax, ay, z0), q = b._tkP(bx, by, z0), c2 = b._tkP(bx, by, z1), d2 = b._tkP(ax, ay, z1);
                ctx.fillStyle = wall; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]); ctx.closePath(); ctx.fill();
                if (s) { ctx.fillStyle = `rgba(0, 0, 0, ${s})`; ctx.fill(); }
            }
            LandmarkKit.flat(ctx, b._tkK(z1), (c) => { c.fillStyle = cap; c.fillRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3); });
        }

        /** The dome over the turret: rings stacked up its curve, ribs to the lantern, a finial. */
        function _ashDome(ctx, emissive, t, b) {
            const g = b._tkGeo(), base = t.poly, n = base.length, R = 15, N = 9;
            let cx = 0, cy = 0; for (const [x, y] of base) { cx += x; cy += y; } cx /= n; cy /= n;
            if (emissive) {                                                                             // the lantern's glow at the top
                const p = b._tkP(cx, cy, t.z1 + R + 4), k = b._tkK(t.z1 + R);
                const lg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 14 * k); lg.addColorStop(0, 'rgba(255, 230, 170, 0.9)'); lg.addColorStop(1, 'rgba(255, 190, 110, 0)');
                ctx.fillStyle = lg; ctx.fillRect(p[0] - 14 * k, p[1] - 14 * k, 28 * k, 28 * k); return;
            }
            for (let i = 0; i <= N; i++) {
                const th = i / N * Math.PI / 2 * 0.92, s = Math.cos(th), z = t.z1 + R * Math.sin(th), k = b._tkK(z), shade = 0.45 + 0.55 * (i / N);
                LandmarkKit.flat(ctx, k, (c) => {
                    c.beginPath(); base.forEach(([x, y], j) => { const px = cx + (x - cx) * s, py = cy + (y - cy) * s; j ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath();
                    c.fillStyle = `rgb(${Math.round(60 * shade + 20)}, ${Math.round(130 * shade + 22)}, ${Math.round(112 * shade + 20)})`; c.fill();
                    if (i === 0) { c.lineWidth = 2; c.strokeStyle = '#1c3a33'; c.stroke(); }
                });
            }
            const top = b._tkP(cx, cy, t.z1 + R * 0.98);
            ctx.strokeStyle = 'rgba(14, 40, 34, 0.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
            for (const [x, y] of base) {
                for (let i = 0; i <= N; i++) { const th = i / N * Math.PI / 2 * 0.92, s = Math.cos(th), p = b._tkP(cx + (x - cx) * s, cy + (y - cy) * s, t.z1 + R * Math.sin(th)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
            }
            ctx.stroke();
            const f0 = b._tkP(cx, cy, t.z1 + R), f1 = b._tkP(cx, cy, t.z1 + R + 9), k = b._tkK(t.z1 + R + 6);
            ctx.strokeStyle = '#c9a457'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(f1[0], f1[1]); ctx.stroke();
            ctx.fillStyle = '#e8c97a'; ctx.beginPath(); ctx.arc(f0[0] + (f1[0] - f0[0]) * 0.55, f0[1] + (f1[1] - f0[1]) * 0.55, 2.2 * k, 0, Math.PI * 2); ctx.fill();
        }

        class AshgroveBuilding extends TieredBuilding {
            _setupSign() { this.attachedSign = null; }
            _generateLights() {}
        }

        /** The Ashgrove: x, y its corner; it fronts south (config.facing 'N' turns it round to front north). */
        function createAshgrove(x, y, config = {}) {
            const L = ASH.LIME, T = ASH.TEAL, facing = config.facing === 'N' ? 'N' : 'S', front = facing === 'N' ? [0, -1] : [0, 1];
            const frontEdge = (t) => _ashEdges(t).find(e => Math.abs(e.nx - front[0]) < 0.01 && Math.abs(e.ny - front[1]) < 0.01);
            const brickLedges = (z1, plinth) => [
                { z: plinth, out: 2.2, th: 3, top: L.trim, band: [205, 196, 176], lip: '#fffaf0' },
                { z: z1, out: 5, th: 6, top: '#efe8d6', band: [222, 214, 196], lip: '#ffffff' }
            ];
            const wing = (id, x0, seed) => ({ id, rect: [x0, 0, 240, 420], z0: 0, z1: 72, S: 2, fill: ASH.BRICK.brickLo, paint: (d, l, t, H, Ln) => _ashBrick(d, l, t, H, Ln, { plinth: 18, seed }), ledges: brickLedges(72, 18), shade: [20, 22, 28],
                roofRes: 1, roofGlow: true, roof: (c, e, t) => { if (!e) _ashFlatRoof(c, t, { seed }); _ashTerraceRoof(c, [t.box[0] + 16, t.box[1] + 268, t.box[2] - 16, t.box[3] - 14], e); } });
            const mansard = (id, x0, on) => ({ id, on, rect: [x0 + 10, 10, 220, 250], z0: 72, z1: 86, S: 2, fill: ASH.SLATE.slate, paint: _ashMansard, shade: [10, 14, 20], roofRes: 1,
                roofGlow: true, roof: (c, e, t) => {
                    const [a, b2, cc, dd] = t.box;
                    if (!e) {
                        _ashFlatRoof(c, t, { a: '#56626f', b: '#3e4853', parapet: '#5f9e89', pw: 3, seed: x0 });
                        c.strokeStyle = 'rgba(20, 26, 32, 0.35)'; c.lineWidth = 0.6; c.beginPath(); for (let y = b2 + 6; y < dd - 4; y += 5) { c.moveTo(a + 4, y); c.lineTo(cc - 4, y); } c.stroke();   // slate courses
                        c.strokeStyle = ASH.SLATE.copper; c.lineWidth = 3; c.beginPath(); c.moveTo((a + cc) / 2, b2 + 10); c.lineTo((a + cc) / 2, dd - 10); c.stroke();   // the copper ridge
                    }
                    for (const sx of [a + 22, (a + cc) / 2 + 12]) _ashSkylights(c, sx, b2 + 100, 2, 26, 34, 10, e);
                },
                top: (ctx, e, t, b) => { if (e) return; const [a, b2, cc] = t.box; for (const [cx, cy] of [[a + 40, b2 + 50], [cc - 40, b2 + 190]]) _ashPrism(ctx, b, cx - 9, cy - 6, cx + 9, cy + 6, t.z1, t.z1 + 14, '#c9bfa8', '#7a5a46'); } });
            const oriel = (id, x0, on) => ({ id, on, solid: false, poly: TierKit.bay(x0, x0 + 120, 420, 8, 30, 4), z0: 18, z1: 72, S: 3, fill: T.stoneMid, paint: _ashOriel,
                ledges: [{ z: 19, out: 2.5, th: 4, top: T.stoneLt, band: [70, 128, 110], lip: T.stoneHi }, { z: 72, out: 4, th: 4, top: T.stoneLt, band: [82, 140, 122], lip: T.stoneHi }],
                roof: (c, e, t) => { if (!e) { c.beginPath(); t.poly.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath(); c.fillStyle = '#2f4a46'; c.fill(); c.lineWidth = 5; c.strokeStyle = T.stoneLt; c.stroke(); } } });
            const bayPoly = TierKit.bay(330, 490, 420, 14, 46, 5);
            const b = new AshgroveBuilding({
                id: 'ashgrove', x, y, label: 'The Ashgrove', type: 'apartment', style: 'ashgrove', facing, hero: ASH.HERO, plan: ASH.PLAN,
                roofColor: '#2a2c30', roofLightColor: '#3a3c40', wallColor: ASH.BRICK.brick, wallLightColor: L.trim, accentColor: '#ffd29a',
                windowColor: '#1d2a33', windowLitColor: ASH.WARM, windowFrameColor: L.frame, balconies: [], roofProps: [{ type: 'vent', section: 0, x: 20, y: 20, w: 1, h: 1 }],
                tiers: [
                    wing('wingW', 0, 31), wing('wingE', 580, 47),
                    mansard('mansW', 0, 'wingW'), mansard('mansE', 580, 'wingE'),
                    { id: 'tower', rect: [240, 20, 340, 400], z0: 0, z1: 126, S: 2, fill: ASH.BRICK.brickLo, paint: (d, l, t, H, Ln) => _ashBrick(d, l, t, H, Ln, { plinth: 36, seed: 59, lime: { frieze: true, door: frontEdge, names: [0.13, 0.87] } }), shade: [20, 22, 28],
                      ledges: [{ z: 36, out: 4, th: 4, top: '#efe8d6', band: [226, 216, 194], lip: '#ffffff' }, { z: 90, out: 2, th: 3, top: L.trim, band: [205, 196, 176], lip: '#fffaf0' }, { z: 126, out: 6, th: 7, top: '#efe8d6', band: [222, 214, 196], lip: '#ffffff' }],
                      roofRes: 1, roofGlow: true,
                      roof: (c, e, t) => {
                          const [a, b2, cc] = t.box;
                          if (!e) {
                              _ashFlatRoof(c, t, { seed: 9 });
                              c.fillStyle = '#2a2c30'; c.fillRect(a + 30, b2 + 150, 26, 20); c.strokeStyle = '#8a8070'; c.lineWidth = 1.5; c.strokeRect(a + 30, b2 + 150, 26, 20);
                              c.strokeStyle = 'rgba(30, 28, 24, 0.25)'; c.lineWidth = 0.7; c.beginPath(); for (let x = a + 20; x < cc - 10; x += 24) { c.moveTo(x, b2 + 10); c.lineTo(x, b2 + 380); } c.stroke();   // the roll seams
                              c.fillStyle = '#9a8f78'; c.fillRect(a + 90, b2 + 30, 200, 6); c.fillRect(a + 90, b2 + 30, 6, 330);   // duct runs
                          }
                          _ashSkylights(c, a + 110, b2 + 200, 4, 34, 46, 12, e);
                      },
                      top: (ctx, e, t, b2) => {
                          if (e) return;
                          _ashPrism(ctx, b2, t.box[0] + 30, t.box[1] + 150, t.box[0] + 56, t.box[1] + 170, t.z1, t.z1 + 7, '#bdb3a0', '#55504a');   // the roof hatch
                          for (const [px, py] of [[t.box[0] + 120, t.box[1] + 60], [t.box[0] + 200, t.box[1] + 60], [t.box[0] + 30, t.box[1] + 270]])   // the plant: air handlers
                              _ashPrism(ctx, b2, px, py, px + 50, py + 34, t.z1, t.z1 + 10, '#b7b9b4', '#8e918c');
                          const [cx, cy] = b2._tkLocal(300, 70), X = b2.x + cx, Y = b2.y + cy;                                                  // the tank's legs
                          ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.4; ctx.beginPath();
                          for (const [dx, dy] of [[-12, -12], [12, -12], [12, 12], [-12, 12]]) { const p = b2._tkP(X + dx, Y + dy, 126), q = b2._tkP(X + dx, Y + dy, 132); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
                          ctx.stroke();
                      } },
                    { id: 'tank', on: 'tower', solid: false, poly: Array.from({ length: 12 }, (_, i) => [300 + Math.cos(-i * Math.PI / 6) * 18, 70 + Math.sin(-i * Math.PI / 6) * 18]), z0: 132, z1: 150, S: 2, fill: '#5a3e2a', paint: _ashTank, shade: [20, 12, 8],
                      roof: (c, e, t) => { if (e) return; const [a, b2, cc, dd] = t.box, cx = (a + cc) / 2, cy = (b2 + dd) / 2; c.fillStyle = '#4a3a2c'; c.beginPath(); c.arc(cx, cy, 19, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(0, 0, 0, 0.4)'; c.lineWidth = 0.8; for (let i = 0; i < 12; i++) { const a2 = i * Math.PI / 6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a2) * 19, cy + Math.sin(a2) * 19); c.stroke(); } c.fillStyle = '#2a2420'; c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill(); },
                    },
                    { id: 'bay', on: 'tower', solid: false, poly: bayPoly, z0: 36, z1: 126, S: 4, fill: T.stoneMid, paint: _ashBay, shade: [6, 18, 20],
                      ledges: [{ z: 37, out: 2, th: 3, top: T.stoneLt, band: [70, 128, 110], lip: T.stoneHi }, { z: 126 - 48 - 0.5, out: 3.2, th: 5, top: T.stoneLt, band: [82, 138, 120], lip: T.stoneHi },
                               { z: 126 - 70 - 0.5, out: 3.2, th: 5, top: T.stoneLt, band: [82, 138, 120], lip: T.stoneHi }, { z: 126 - 28, out: 1.4, th: 2.5, top: T.stoneLt, band: [82, 138, 120], lip: T.stoneHi },
                               { z: 126, out: 6, th: 4, top: T.stoneLt, band: [82, 138, 120], lip: T.stoneHi }] },
                    { id: 'turret', on: 'bay', solid: false, poly: bayPoly, z0: 126, z1: 150, S: 4, fill: T.stone, paint: _ashTurret, shade: [6, 18, 20],
                      ledges: [{ z: 150, out: 4, th: 3, top: T.stoneLt, band: [82, 138, 120], lip: T.stoneHi }], top: _ashDome, rise: 24 },   // (the dome and finial)
                    oriel('orielW', 60, 'wingW'), oriel('orielE', 640, 'wingE')
                ],
                ...config, facing
            });
            // its lights: the door's lanterns, the shop arches' spill, the wings' corners (warm, its own)
            const at = (lx, ly) => { const [wx, wy] = b._tkLocal(lx, ly); return [b.x + wx, b.y + wy]; };
            for (const [lx, ly, color, r] of [[410, 452, '#ffd29a', 190], [300, 440, '#ffe2b4', 120], [520, 440, '#ffe2b4', 120], [120, 470, '#ffe2b4', 140], [700, 470, '#ffe2b4', 140]]) {
                const [wx, wy] = at(lx, ly), lamp = new LampEntity({ x: wx, y: wy, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; lamp.visible = false; b.attachedLights.push(lamp);   // (light only: no fixture on the pavement)
            }
            b.topReach = 80; b.glowReach = 80;
            b.viewDrift = true;   // out in front of it, the view drifts toward it (engine/draw.js _landmarkDriftTarget)
            return b;
        }

        BuildingV2Registry.register('ashgrove', {
            factory: createAshgrove,
            sections: [{ x: 0, y: 0, w: ASH.PLAN.W, h: ASH.PLAN.D }],
            accentColor: '#ffd29a', label: 'The Ashgrove', type: 'apartment', category: 'landmark', floors: 14
        });
