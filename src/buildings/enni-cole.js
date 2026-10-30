        /* =====================================================================
           ENNI COLE — the luxury department store on Clinic Way
           ---------------------------------------------------------------------
           Built on the tiered kit (buildings/tiered-kit.js), after ETERNAL's
           reference photo:
             · a two-storey podium in rose stone: rusticated ashlar, pilasters
               with a pink uplight at each foot, tall bronze-framed display
               windows with an upper window over each, and a recessed panel
               with the name in script near each end of every face;
             · out of the middle of its front, the entrance pavilion, taller
               than the podium: the name in script over a tall arch, glazed
               with a fanlight over a dark marquee and glass doors, lit warm
               inside, slim sconces either side;
             · over the podium, set back, the glass floor: black steel piers,
               mullions and a transom, amber light and mannequins behind it;
             · on the pavilion, the curved-glass showroom, its front corners
               rounded, standing proud of the glass floor;
             · clipped cypresses in brass planters either side of the steps.
           It fronts south (its door and steps on Clinic Way's side of the
           block). Collision is the podium and the pavilion; the showroom
           overhangs. It leans harder than the street (EC.HERO).
           ===================================================================== */
        const EC = {
            HERO: 2,
            PLAN: { W: 900, D: 700 },
            STONE: { stone: '#b8698a', stoneMid: '#a85d7e', stoneLo: '#8a4566', stoneDk: '#55223c', stoneHi: '#e6b0c6', stoneLt: '#c97c9c' },
            STEEL: '#15161c', STEEL_HI: '#2b2c35', BRONZE: '#7d5c3c', GOLD: '#d6b277', GOLD_HI: '#f5dfb2', NEON: 'rgba(255, 234, 196, 1)',
            // heights (z): the podium's cornice, the pavilion's, the glass floor's and the showroom's tops
            Z: { POD: 62, PAV: 92, GLASS: 112, SHOW: 132 },
            SCRIPT: 'Anthropology, "Great Vibes", "URW Chancery L", "Z003", cursive'
        };
        const _ecFontReady = () => { try { return !document.fonts || document.fonts.check('12px Anthropology'); } catch (e) { return true; } };
        const _ecEdges = (t) => t.mitre.filter(Boolean);

        /** The name in script: champagne on the day layer, a neon core with its glow on the lit one. */
        function _ecScript(d, l, str, x, y, size) {
            for (const [c, lit] of [[d, false], [l, true]]) {
                c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${size}px ${EC.SCRIPT}`;
                if (lit) { c.shadowColor = 'rgba(255, 196, 120, 1)'; c.shadowBlur = size * 0.5; c.fillStyle = EC.NEON; c.fillText(str, x, y); c.shadowBlur = 0; c.fillText(str, x, y); }
                else { c.fillStyle = 'rgba(70, 20, 40, 0.55)'; c.fillText(str, x + size * 0.04, y + size * 0.05); c.fillStyle = EC.GOLD_HI; c.fillText(str, x, y); }
                c.restore();
            }
        }

        /** Rose ashlar over the whole strip: courses, staggered joints, a little grain. */
        function _ecAshlar(d, H, L, r, y0 = 0, course = 4.4) {
            const S = EC.STONE, g = d.createLinearGradient(0, y0, 0, H); g.addColorStop(0, S.stoneLt); g.addColorStop(0.5, S.stone); g.addColorStop(1, S.stoneMid);
            d.fillStyle = g; d.fillRect(0, y0, L, H - y0);
            d.strokeStyle = 'rgba(80, 20, 48, 0.24)'; d.lineWidth = 0.35; d.beginPath();
            for (let y = y0 + course, k = 0; y < H - 2; y += course, k++) { d.moveTo(0, y); d.lineTo(L, y); for (let x = (k % 2) * 6; x < L; x += 12) { d.moveTo(x, y); d.lineTo(x, y + course); } }
            d.stroke();
            for (let i = 0; i < L * (H - y0) / 9; i++) { d.fillStyle = r() < 0.5 ? 'rgba(255, 225, 238, 0.07)' : 'rgba(70, 18, 44, 0.07)'; d.fillRect(r() * L, y0 + r() * (H - y0), 0.6 + r(), 0.6); }
        }

        /** A cornice band at y (moulding, dentils, a brass fillet), h deep. */
        function _ecCornice(d, l, L, y, h) {
            const S = EC.STONE;
            d.fillStyle = S.stoneLt; d.fillRect(0, y, L, h); d.fillStyle = S.stoneHi; d.fillRect(0, y, L, 0.8);
            d.fillStyle = S.stoneDk; for (let x = 1; x < L; x += 2.6) d.fillRect(x, y + h * 0.55, 1.3, h * 0.25);
            d.fillStyle = EC.GOLD; d.fillRect(0, y + h - 0.7, L, 0.5); d.fillStyle = 'rgba(50, 10, 30, 0.35)'; d.fillRect(0, y + h, L, 1.6);
            l.fillStyle = 'rgba(255, 150, 200, 0.22)'; l.fillRect(0, y, L, h);
        }

        /** A pier from y0 to y1 at x, w wide: lit edge, shadowed edge, a capital and a base; its pink uplight on the lit layer. */
        function _ecPier(d, l, x, w, y0, y1) {
            const S = EC.STONE;
            d.fillStyle = S.stoneLt; d.fillRect(x, y0, w, y1 - y0);
            d.fillStyle = 'rgba(255, 236, 244, 0.18)'; d.fillRect(x + 0.6, y0, 0.9, y1 - y0);
            d.fillStyle = 'rgba(70, 14, 40, 0.3)'; d.fillRect(x + w - 1, y0, 1, y1 - y0);
            d.fillStyle = S.stoneHi; d.fillRect(x - 1, y0, w + 2, 2); d.fillStyle = S.stoneLo; d.fillRect(x - 1, y0 + 2, w + 2, 0.6);
            d.fillStyle = S.stoneLo; d.fillRect(x - 1, y1 - 3, w + 2, 3);
            const ug = l.createLinearGradient(0, y1, 0, y0); ug.addColorStop(0, 'rgba(255, 110, 175, 0.95)'); ug.addColorStop(0.55, 'rgba(240, 80, 150, 0.3)'); ug.addColorStop(1, 'rgba(240, 80, 150, 0)');
            l.fillStyle = ug; l.beginPath(); l.moveTo(x + w / 2 - 2, y1); l.lineTo(x - 7, y0); l.lineTo(x + w + 7, y0); l.lineTo(x + w / 2 + 2, y1); l.closePath(); l.fill();
            l.fillStyle = 'rgba(255, 250, 240, 0.95)'; l.fillRect(x + w / 2 - 1.2, y1 - 2, 2.4, 1.2);
        }

        /** A shop window x0..x1, y0..y1: bronze frame, glass, what's inside (forms on stands, a lamp), lit warm at night. */
        function _ecWindow(d, l, x0, y0, x1, y1, r, forms = 2, mull = 1) {
            const w = x1 - x0, h = y1 - y0;
            d.fillStyle = EC.BRONZE; d.fillRect(x0 - 1.2, y0 - 1.2, w + 2.4, h + 2.4);
            const g = d.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#3a3034'); g.addColorStop(0.6, '#4c3b31'); g.addColorStop(1, '#2e2a2f'); d.fillStyle = g; d.fillRect(x0, y0, w, h);
            d.fillStyle = 'rgba(214, 160, 104, 0.18)'; d.fillRect(x0, y0 + h * 0.55, w, h * 0.45);                          // the warm floor inside
            const lg = l.createLinearGradient(0, y0, 0, y1); lg.addColorStop(0, 'rgba(255, 200, 128, 0.7)'); lg.addColorStop(1, 'rgba(255, 176, 96, 0.95)'); l.fillStyle = lg; l.fillRect(x0, y0, w, h);
            for (let k = 0; k < forms; k++) {                                                                              // the forms: a gown on a stand
                const mx = x0 + w * (k + 0.5) / forms + (r() - 0.5) * 2, fh = Math.min(h * 0.62, 15), my = y1 - 1;
                const col = ['#e9d3a6', '#1c1a1f', '#b0475f', '#f3ece0', '#2f5a4d', '#7b3fa0'][Math.floor(r() * 6)];
                const form = (c) => { c.beginPath(); c.moveTo(mx - 0.9, my - fh); c.lineTo(mx + 0.9, my - fh); c.lineTo(mx + fh * 0.22, my - 1.5); c.lineTo(mx - fh * 0.22, my - 1.5); c.closePath(); };
                form(d); d.fillStyle = col; d.fill(); d.fillStyle = '#efe4d6'; d.beginPath(); d.arc(mx, my - fh - 1.4, 1.3, 0, Math.PI * 2); d.fill();
                l.save(); l.globalCompositeOperation = 'destination-out'; form(l); l.fillStyle = 'rgba(0, 0, 0, 0.6)'; l.fill(); l.beginPath(); l.arc(mx, my - fh - 1.4, 1.3, 0, Math.PI * 2); l.fill(); l.restore();
            }
            for (let k = 0; k < 4; k++) { const px = x0 + 1 + r() * (w - 2), py = y0 + 1 + r() * h * 0.3; l.fillStyle = 'rgba(255, 244, 214, 1)'; l.fillRect(px, py, 0.8, 0.8); d.fillStyle = 'rgba(232, 206, 150, 0.6)'; d.fillRect(px, py, 0.6, 0.6); }
            d.fillStyle = 'rgba(214, 228, 240, 0.12)'; d.beginPath(); d.moveTo(x0, y0); d.lineTo(x0 + w * 0.4, y0); d.lineTo(x0, y0 + h * 0.6); d.closePath(); d.fill();   // the sky in the glass
            d.fillStyle = '#2a2018'; for (let k = 1; k <= mull; k++) d.fillRect(x0 + w * k / (mull + 1) - 0.4, y0, 0.8, h);
            l.fillStyle = '#000'; l.save(); l.globalCompositeOperation = 'destination-out'; for (let k = 1; k <= mull; k++) l.fillRect(x0 + w * k / (mull + 1) - 0.4, y0, 0.8, h); l.restore();
            d.fillStyle = EC.GOLD; d.fillRect(x0 - 1.2, y0 - 1.2, w + 2.4, 0.4);
        }

        /** The podium: per face, bays of a pilaster, a display window with an upper window over it (or a script panel), the cornice. */
        function _ecPodium(d, l, t, H, L) {
            const S = EC.STONE, r = seededRandom(5101), C = 8;
            _ecAshlar(d, H, L, r);
            for (const e of _ecEdges(t)) {
                if (e.hidden) continue;
                const n = Math.max(1, Math.round(e.L / 60)), bw = e.L / n, pier = 6.5;
                for (let i = 0; i < n; i++) {
                    const X0 = e.u0 + i * bw + pier + 2.5, X1 = e.u0 + (i + 1) * bw - pier - 2.5;
                    if (n >= 6 && (i === 1 || i === n - 2)) {                                                       // a recessed panel with the name
                        d.fillStyle = S.stoneLo; d.fillRect(X0, C + 4, X1 - X0, H - C - 9); d.fillStyle = S.stoneMid; d.fillRect(X0 + 1.2, C + 5.2, X1 - X0 - 2.4, H - C - 11.4);
                        d.strokeStyle = 'rgba(245, 200, 220, 0.5)'; d.lineWidth = 0.5; d.strokeRect(X0 + 2.5, C + 6.5, X1 - X0 - 5, H - C - 14);
                        const cx = (X0 + X1) / 2, cy = (C + H - 5) / 2 + 2;
                        l.fillStyle = 'rgba(255, 120, 180, 0.3)'; l.fillRect(X0 + 1.2, C + 5.2, X1 - X0 - 2.4, H - C - 11.4);
                        _ecScript(d, l, 'Enni', cx - 1, cy - 6, 11); _ecScript(d, l, 'Cole', cx + 1, cy + 6, 11);
                        continue;
                    }
                    const up0 = C + 4, up1 = 26, sp1 = 30, dn1 = H - 5;
                    _ecWindow(d, l, X0, up0, X1, up1, r, 0, 2);
                    d.fillStyle = EC.BRONZE; d.fillRect(X0 - 1.2, up1 + 1.2, X1 - X0 + 2.4, sp1 - up1 - 1.2);                // the spandrel: bronze, a gilt grille
                    d.fillStyle = 'rgba(214, 178, 119, 0.55)'; for (let x = X0 + 1.5; x < X1 - 1; x += 3) d.fillRect(x, up1 + 2, 1, sp1 - up1 - 3);
                    _ecWindow(d, l, X0, sp1 + 1.2, X1, dn1, r, 2, 1);
                    d.fillStyle = S.stoneLt; d.fillRect(X0 - 2, up0 - 3.4, X1 - X0 + 4, 2.2); d.fillStyle = EC.GOLD; d.fillRect(X0 - 2, up0 - 1.4, X1 - X0 + 4, 0.4);   // the hood
                }
                for (let i = 0; i <= n; i++) {                                                                     // the pilasters, the corners wider
                    const end = i === 0 || i === n, w = end ? 9 : pier * 2, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + i * bw - w / 2));
                    _ecPier(d, l, x, w, C, H - 3);
                }
            }
            _ecCornice(d, l, L, 0, C);
            d.fillStyle = S.stoneDk; d.fillRect(0, H - 3, L, 3); d.fillStyle = 'rgba(214, 178, 119, 0.6)'; d.fillRect(0, H - 3, L, 0.4);   // the plinth
        }

        /** The pavilion: the name over the tall arch on its front (fanlight, marquee, glass doors), sconces, corner pilasters; panels on its cheeks. */
        function _ecPavilion(d, l, t, H, L) {
            const S = EC.STONE, r = seededRandom(7207), C = 7;
            _ecAshlar(d, H, L, r, 0, 5.2);
            for (const e of _ecEdges(t)) {
                if (e.hidden) continue;
                const front = e.ny > 0.99;
                _ecPier(d, l, e.u0, 12, C, H - 3); _ecPier(d, l, e.u0 + e.L - 12, 12, C, H - 3);
                if (!front) {                                                                                       // a cheek: one tall recessed panel
                    if (e.L < 30) continue;
                    d.fillStyle = S.stoneLo; d.fillRect(e.u0 + 17, C + 8, e.L - 34, H - C - 16); d.fillStyle = S.stoneMid; d.fillRect(e.u0 + 18.5, C + 9.5, e.L - 37, H - C - 19);
                    continue;
                }
                const cx = e.u0 + e.L / 2, aw = 32, top = 30, spring = top + aw, bot = H - 3;
                // recessed panels either side of the arch
                for (const s of [-1, 1]) { const x0 = s < 0 ? e.u0 + 18 : cx + aw + 16, x1 = s < 0 ? cx - aw - 16 : e.u0 + e.L - 18;
                    d.fillStyle = S.stoneLo; d.fillRect(x0, top, x1 - x0, bot - top - 6); d.fillStyle = S.stoneMid; d.fillRect(x0 + 1.4, top + 1.4, x1 - x0 - 2.8, bot - top - 8.8);
                    d.strokeStyle = 'rgba(245, 200, 220, 0.45)'; d.lineWidth = 0.5; d.strokeRect(x0 + 3, top + 3, x1 - x0 - 6, bot - top - 12); }
                const arch = (c, a = aw) => { c.beginPath(); c.moveTo(cx - a, bot); c.lineTo(cx - a, spring); c.arc(cx, spring, a, Math.PI, 0); c.lineTo(cx + a, bot); c.closePath(); };
                // the archivolt: a moulded ring of voussoirs, the keystone
                arch(d, aw + 5); d.fillStyle = S.stoneLt; d.fill(); arch(d, aw + 1.5); d.fillStyle = S.stoneLo; d.fill();
                d.strokeStyle = 'rgba(80, 20, 48, 0.4)'; d.lineWidth = 0.4;
                for (let k = 1; k < 15; k++) { const a = Math.PI + k * Math.PI / 15; d.beginPath(); d.moveTo(cx + Math.cos(a) * (aw + 1.5), spring + Math.sin(a) * (aw + 1.5)); d.lineTo(cx + Math.cos(a) * (aw + 5), spring + Math.sin(a) * (aw + 5)); d.stroke(); }
                d.fillStyle = S.stoneHi; d.beginPath(); d.moveTo(cx - 3.5, spring - aw - 6.5); d.lineTo(cx + 3.5, spring - aw - 6.5); d.lineTo(cx + 2.4, spring - aw + 0.5); d.lineTo(cx - 2.4, spring - aw + 0.5); d.closePath(); d.fill();
                // the glass: warm inside, a chandelier in the fanlight
                arch(d); const g = d.createLinearGradient(0, top, 0, bot); g.addColorStop(0, '#4a3a33'); g.addColorStop(1, '#5a4434'); d.fillStyle = g; d.fill();
                arch(l); const lg = l.createLinearGradient(0, top, 0, bot); lg.addColorStop(0, 'rgba(255, 214, 140, 0.85)'); lg.addColorStop(1, 'rgba(255, 186, 104, 1)'); l.fillStyle = lg; l.fill();
                for (let k = 0; k < 13; k++) { const a = k / 12 * Math.PI, px = cx + Math.cos(a) * 11, py = spring - 8 + Math.sin(a) * 3.5; l.fillStyle = '#fff6dc'; l.fillRect(px - 0.5, py - 0.5, 1.1, 1.1); d.fillStyle = '#e7c98e'; d.fillRect(px - 0.4, py - 0.4, 0.8, 0.8); }
                for (const c of [d, l]) {                                                                           // the fanlight's bars and the doors' frames
                    c.save(); arch(c); c.clip(); c.strokeStyle = c === d ? '#1d1a1e' : 'rgba(60, 30, 18, 0.7)'; c.lineWidth = 0.9; c.beginPath();
                    for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; c.moveTo(cx, spring); c.lineTo(cx + Math.cos(a) * aw, spring + Math.sin(a) * aw); }
                    c.moveTo(cx + aw * 0.45, spring); c.arc(cx, spring, aw * 0.45, 0, Math.PI, true);
                    for (let k = -3; k <= 3; k++) { c.moveTo(cx + k * aw / 4, spring + 8); c.lineTo(cx + k * aw / 4, bot); }
                    c.moveTo(cx - aw, spring + 18); c.lineTo(cx + aw, spring + 18); c.stroke(); c.restore();
                }
                // the marquee across the springing: dark, its brass rim lit
                d.fillStyle = '#1b1c22'; d.beginPath(); d.roundRect(cx - aw - 2, spring - 1, aw * 2 + 4, 8, [1, 1, 3, 3]); d.fill(); d.fillStyle = EC.GOLD; d.fillRect(cx - aw - 2, spring - 1, aw * 2 + 4, 0.6);
                l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = '#000'; l.fillRect(cx - aw - 2, spring - 0.4, aw * 2 + 4, 7.4); l.restore();
                l.fillStyle = 'rgba(255, 220, 160, 0.9)'; l.fillRect(cx - aw - 2, spring - 1, aw * 2 + 4, 0.7); l.fillRect(cx - aw, spring + 6.4, aw * 2, 0.6);
                // the sconces either side: slim bars of light
                for (const s of [-1, 1]) { const x = cx + s * (aw + 10) - 1; d.fillStyle = EC.BRONZE; d.fillRect(x, spring - 6, 2, 18); d.fillStyle = '#e9d3a6'; d.fillRect(x + 0.5, spring - 5, 1, 16);
                    const sg = l.createRadialGradient(x + 1, spring + 3, 0, x + 1, spring + 3, 12); sg.addColorStop(0, 'rgba(255, 236, 200, 1)'); sg.addColorStop(1, 'rgba(255, 190, 120, 0)'); l.fillStyle = sg; l.fillRect(x - 11, spring - 9, 24, 24); }
                _ecScript(d, l, 'Enni Cole', cx, 18, 17);
            }
            _ecCornice(d, l, L, 0, C);
            d.fillStyle = S.stoneDk; d.fillRect(0, H - 3, L, 3);
        }

        /** Glass between black steel: piers every bay, mullions and a transom, the floor inside lit amber with tiny lights and forms. */
        function _ecGlass(d, l, t, H, L, opt = {}) {
            const r = seededRandom(opt.seed || 3301), F = opt.fascia || 6, bay = opt.bay || 66, panes = opt.panes || 3, tr = F + (H - F) * 0.28;
            d.fillStyle = EC.STEEL; d.fillRect(0, 0, L, H);
            const pane = (X, W, y0, y1, big) => {
                const g = d.createLinearGradient(X, y0, X + W, y1); g.addColorStop(0, '#2f2b33'); g.addColorStop(0.55, '#463830'); g.addColorStop(1, '#27262e'); d.fillStyle = g; d.fillRect(X, y0, W, y1 - y0);
                d.fillStyle = 'rgba(214, 160, 104, 0.16)'; d.fillRect(X, y0 + (y1 - y0) * 0.5, W, (y1 - y0) * 0.5);
                d.fillStyle = 'rgba(205, 222, 236, 0.09)'; d.beginPath(); d.moveTo(X, y0); d.lineTo(X + W * 0.5, y0); d.lineTo(X, y0 + (y1 - y0) * 0.7); d.closePath(); d.fill();
                const lg = l.createLinearGradient(0, y0, 0, y1); lg.addColorStop(0, 'rgba(255, 196, 118, 0.5)'); lg.addColorStop(1, 'rgba(255, 172, 92, 0.8)'); l.fillStyle = lg; l.fillRect(X, y0, W, y1 - y0);
                for (let k = 0; k < (big ? 6 : 2); k++) { const px = X + 0.6 + r() * (W - 1.2), py = y0 + 0.6 + r() * (y1 - y0) * 0.4;   // the ceiling's tiny lights
                    l.fillStyle = 'rgba(255, 244, 214, 1)'; l.fillRect(px, py, 0.7, 0.7); l.fillStyle = 'rgba(255, 220, 160, 0.3)'; l.beginPath(); l.arc(px + 0.35, py + 0.35, 1.6, 0, Math.PI * 2); l.fill();
                    d.fillStyle = 'rgba(230, 200, 150, 0.45)'; d.fillRect(px, py, 0.5, 0.5); }
                if (big && r() < 0.75) {                                                                            // a form or two in silhouette
                    for (let k = 0; k < 2; k++) { if (r() < 0.4) continue; const mx = X + W * (0.3 + k * 0.4), my = y1 - 1, fh = Math.min(10, (y1 - y0) * 0.5);
                        const form = (c) => { c.beginPath(); c.moveTo(mx - 0.7, my - fh); c.lineTo(mx + 0.7, my - fh); c.lineTo(mx + fh * 0.2, my); c.lineTo(mx - fh * 0.2, my); c.closePath(); c.moveTo(mx + 1.1, my - fh - 1.1); c.arc(mx, my - fh - 1.1, 1.1, 0, Math.PI * 2); };
                        form(d); d.fillStyle = 'rgba(22, 16, 20, 0.75)'; d.fill(); l.save(); l.globalCompositeOperation = 'destination-out'; form(l); l.fillStyle = 'rgba(0, 0, 0, 0.55)'; l.fill(); l.restore(); }
                }
            };
            for (const e of _ecEdges(t)) {
                if (e.hidden) continue;
                const n = Math.max(1, Math.round(e.L / bay)), bw = e.L / n, pier = opt.pier || 4.5;
                for (let i = 0; i < n; i++) {
                    const X0 = e.u0 + i * bw + pier / 2, W = bw - pier, pw = W / panes;
                    for (let k = 0; k < panes; k++) { const X = X0 + k * pw + 0.6; pane(X, pw - 1.2, F + 1, tr - 0.6, false); pane(X, pw - 1.2, tr + 0.6, H - 2, true); }
                }
                for (let i = 0; i <= n; i++) { const X = Math.max(e.u0, Math.min(e.u0 + e.L - pier, e.u0 + i * bw - pier / 2));   // the piers, a champagne edge on each
                    d.fillStyle = '#0d0e12'; d.fillRect(X, 0, pier, H); d.fillStyle = EC.STEEL_HI; d.fillRect(X + 0.5, 0, 1, H); d.fillStyle = 'rgba(214, 178, 119, 0.45)'; d.fillRect(X, 0, 0.5, H); }
            }
            d.fillStyle = '#0d0e12'; d.fillRect(0, tr - 0.6, L, 1.2); d.fillRect(0, H - 2, L, 2);
            d.fillStyle = EC.STEEL; d.fillRect(0, 0, L, F); d.fillStyle = EC.STEEL_HI; d.fillRect(0, F * 0.35, L, 0.6); d.fillStyle = EC.GOLD; d.fillRect(0, F - 0.6, L, 0.5);   // the fascia
        }

        /** A plan polygon of a rectangle with its front (+y) corners rounded, radius R in n facets each. */
        function _ecRoundFront(x, y, w, h, R, n) {
            const pts = [[x, y]];
            for (let i = 0; i <= n; i++) { const a = Math.PI - i * Math.PI / 2 / n; pts.push([x + R + R * Math.cos(a), y + h - R + R * Math.sin(a)]); }
            for (let i = 0; i <= n; i++) { const a = Math.PI / 2 - i * Math.PI / 2 / n; pts.push([x + w - R + R * Math.cos(a), y + h - R + R * Math.sin(a)]); }
            pts.push([x + w, y]);
            return pts;
        }

        // ── roofs (world coordinates, painted once) ──

        function _ecPolyPath(c, poly) { c.beginPath(); poly.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }

        /** A stone tier's roof: dark membrane, a rose parapet with a brass line inside it. */
        function _ecStoneRoof(c, e, t) {
            if (e) return;
            _ecPolyPath(c, t.poly); c.fillStyle = '#2e252b'; c.fill();
            c.save(); _ecPolyPath(c, t.poly); c.clip(); c.lineWidth = 9; c.strokeStyle = EC.STONE.stoneLt; c.stroke(); c.lineWidth = 1; c.strokeStyle = 'rgba(214, 178, 119, 0.7)';
            c.translate(0, 0); const [x0, y0, x1, y1] = t.box; c.strokeRect(x0 + 5, y0 + 5, x1 - x0 - 10, y1 - y0 - 10); c.restore();
        }

        /** The glass floor's roof: black membrane, steel edge, lantern skylights glowing at night, the name in gold. */
        function _ecGlassRoof(c, e, t) {
            const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2;
            if (!e) {
                _ecPolyPath(c, t.poly); const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#2a2530'); g.addColorStop(1, '#1d1c23'); c.fillStyle = g; c.fill();
                c.strokeStyle = 'rgba(120, 90, 110, 0.18)'; c.lineWidth = 0.8; c.beginPath(); for (let x = x0 + 24; x < x1 - 10; x += 32) { c.moveTo(x, y0 + 8); c.lineTo(x, y1 - 8); } c.stroke();
                _ecPolyPath(c, t.poly); c.lineWidth = 6; c.strokeStyle = EC.STEEL; c.stroke(); c.lineWidth = 1; c.strokeStyle = 'rgba(214, 178, 119, 0.65)'; c.stroke();
            }
            // the lanterns over the two halls and the atrium, most of the roof: the chandeliers' rings of lights below each pane, warm at night
            const gap = 18, m = 24, aw = (x1 - x0 - m * 2 - gap * 2) * 0.38, ww = (x1 - x0 - m * 2 - gap * 2 - aw) / 2, ly = y0 + m, lh = y1 - y0 - m - 64;
            for (const [lx, lw] of [[x0 + m, ww], [x0 + m + ww + gap, aw], [x1 - m - ww, ww]]) {
                const cols = Math.max(2, Math.round(lw / 60)), rows = Math.max(2, Math.round(lh / 64));
                c.save(); c.beginPath(); c.roundRect(lx, ly, lw, lh, 16); c.clip();
                if (!e) {
                    const g = c.createLinearGradient(lx, ly, lx + lw, ly + lh); g.addColorStop(0, '#3b3439'); g.addColorStop(0.52, '#514034'); g.addColorStop(1, '#23282d'); c.fillStyle = g; c.fillRect(lx, ly, lw, lh);
                    c.fillStyle = 'rgba(195, 145, 91, 0.10)'; c.fillRect(lx + 8, ly + 8, lw - 16, lh - 16);                                   // the floors below, lit warm
                    c.fillStyle = 'rgba(183, 193, 211, 0.07)'; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + lw * 0.45, ly); c.lineTo(lx + lw, ly + lh * 0.82); c.lineTo(lx + lw, ly + lh); c.lineTo(lx + lw * 0.77, ly + lh); c.closePath(); c.fill();
                } else {
                    const g = c.createLinearGradient(lx, ly, lx, ly + lh); g.addColorStop(0, 'rgba(236, 164, 83, 0.10)'); g.addColorStop(0.5, 'rgba(255, 197, 113, 0.2)'); g.addColorStop(1, 'rgba(255, 190, 98, 0.10)'); c.fillStyle = g; c.fillRect(lx, ly, lw, lh);
                }
                for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {                                                           // a chandelier under each pane
                    const px = lx + lw * (i + 0.5) / cols, py = ly + lh * (j + 0.5) / rows;
                    if (e) { const g = c.createRadialGradient(px, py, 0, px, py, 28); g.addColorStop(0, 'rgba(255, 214, 145, 0.32)'); g.addColorStop(1, 'rgba(255, 192, 105, 0)'); c.fillStyle = g; c.fillRect(px - 28, py - 28, 56, 56); }
                    c.strokeStyle = e ? 'rgba(255, 221, 164, 0.8)' : 'rgba(181, 136, 83, 0.65)'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.stroke();
                    c.fillStyle = e ? '#fff0c4' : '#ceaa73'; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.arc(px + Math.cos(a) * 8, py + Math.sin(a) * 8, e ? 1.5 : 1.1, 0, Math.PI * 2); c.fill(); }
                    if (e) { c.fillStyle = 'rgba(255, 246, 220, 0.9)'; c.beginPath(); c.arc(px, py, 1.6, 0, Math.PI * 2); c.fill(); }
                }
                if (!e) {                                                                                                             // the glazing bars
                    c.strokeStyle = '#1d2028'; c.lineWidth = 4; c.beginPath();
                    for (let i = 1; i < cols * 2; i++) { const x = lx + lw * i / (cols * 2); c.moveTo(x, ly); c.lineTo(x, ly + lh); }
                    for (let j = 1; j < rows * 2; j++) { const y = ly + lh * j / (rows * 2); c.moveTo(lx, y); c.lineTo(lx + lw, y); } c.stroke();
                    c.strokeStyle = 'rgba(221, 197, 153, 0.2)'; c.lineWidth = 0.8; c.stroke();
                }
                c.restore();
                c.beginPath(); c.roundRect(lx, ly, lw, lh, 16); c.lineWidth = e ? 1 : 4; c.strokeStyle = e ? 'rgba(237, 187, 123, 0.35)' : EC.STEEL; c.stroke();
                if (!e) { c.beginPath(); c.roundRect(lx + 3, ly + 3, lw - 6, lh - 6, 13); c.lineWidth = 1; c.strokeStyle = 'rgba(208, 172, 114, 0.62)'; c.stroke(); }
            }
        }

        /** The showroom's roof: dark, its curved steel edge with a brass line, and the name on it in gilt script, lit at night. */
        function _ecShowRoof(c, e, t) {
            const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 3;
            if (!e) {
                _ecPolyPath(c, t.poly); const g = c.createLinearGradient(x0, y0, x0, y1); g.addColorStop(0, '#26232b'); g.addColorStop(1, '#1b1a20'); c.fillStyle = g; c.fill();
                c.lineWidth = 6; c.strokeStyle = EC.STEEL; c.stroke(); c.lineWidth = 1; c.strokeStyle = 'rgba(214, 178, 119, 0.75)'; c.stroke();
                c.save(); c.translate(cx, cy); c.scale(0.86, 0.8); c.translate(-cx, -cy); _ecPolyPath(c, t.poly); c.restore(); c.lineWidth = 0.7; c.strokeStyle = 'rgba(214, 178, 119, 0.45)'; c.stroke();
            }
            c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `34px ${EC.SCRIPT}`;
            if (e) { c.shadowColor = 'rgba(255, 190, 110, 1)'; c.shadowBlur = 10; c.fillStyle = EC.NEON; c.fillText('Enni Cole', cx, cy); c.shadowBlur = 0; }
            else { c.fillStyle = 'rgba(0, 0, 0, 0.45)'; c.fillText('Enni Cole', cx + 1, cy + 1.5); c.fillStyle = EC.GOLD_HI; }
            c.fillText('Enni Cole', cx, cy); c.restore();
        }

        /** A clipped cypress out of its planter: rings of foliage stacked up a cone, darker at the foot. */
        function _ecCypress(ctx, e, t, b) {
            if (e) return;
            let cx = 0, cy = 0; for (const [x, y] of t.poly) { cx += x / t.poly.length; cy += y / t.poly.length; }
            const N = 12, R = 11, Hc = 50;
            for (let i = 0; i <= N; i++) {
                const z = t.z1 + Hc * i / N, rr = R * Math.sin(Math.PI * Math.min(1, 0.18 + 0.82 * i / N)) * (1 - 0.35 * i / N) + 0.8, s = 0.55 + 0.45 * i / N, k = b._tkK(z);
                LandmarkKit.flat(ctx, k, (c) => {
                    c.fillStyle = `rgb(${Math.round(34 * s + 8)}, ${Math.round(80 * s + 14)}, ${Math.round(52 * s + 10)})`;
                    c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill();
                    c.fillStyle = 'rgba(150, 190, 120, 0.18)'; c.beginPath(); c.arc(cx - rr * 0.3, cy - rr * 0.3, rr * 0.45, 0, Math.PI * 2); c.fill();
                });
            }
        }

        class EnniColeBuilding extends TieredBuilding {
            _setupSign() { this.attachedSign = null; }
            _generateLights() {}
            /** The script signs wait for their webfont: a strip painted before it came is painted again once it's in. */
            _tkArt(t) {
                if (t.art && t.art.fontless && _ecFontReady()) t.art = null;
                if (!t.art) { const ready = _ecFontReady(); super._tkArt(t).fontless = !ready; }
                return t.art;
            }
            _tkRoof(t, emissive) {
                if (t.script && this._lkSprites && !this._ecRoofFont && _ecFontReady()) { this._ecRoofFont = true; for (const k of Object.keys(this._lkSprites)) if (k.endsWith('_' + t.i)) delete this._lkSprites[k]; }
                return super._tkRoof(t, emissive);
            }
            /** The kit orders groups by the distance to each one's plan, so from out along the street (past an end of the
                pavilion, nearer the podium than it) the podium and its glass floor drew after the pavilion and the
                glass roof covered the showroom with the name. Seen from anywhere in front of the podium's middle, the
                pavilion and what stands on it (and the cypresses) are in front: they draw last. */
            _tkOrder() {
                const order = super._tkOrder();
                if (game.camera.y < this.y + 400) return order;
                const front = (t) => t.root.id !== 'podium';
                return order.filter(t => !front(t)).concat(order.filter(front));
            }
            /** Under the player: the shadows, then the entry steps down to the pavement. */
            drawBase(ctx) {
                super.drawBase(ctx);
                const s = LandmarkKit.sprite(this, 'ec_steps', this.x + 330, this.y + 690, 240, 50, 2, (c) => {
                    const cx = this.x + 450, y = this.y + 700;
                    for (let k = 2; k >= 0; k--) { c.fillStyle = ['#7a5a68', '#6c4e5c', '#5e4350'][k]; c.beginPath(); c.roundRect(cx - 74 - k * 10, y - 4, 148 + k * 20, 12 + k * 9, [0, 0, 6, 6]); c.fill();
                        c.strokeStyle = 'rgba(214, 178, 119, 0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(cx - 74 - k * 10, y + 8 + k * 9); c.lineTo(cx + 74 + k * 10, y + 8 + k * 9); c.stroke(); }
                    c.fillStyle = 'rgba(70, 18, 40, 0.75)'; c.fillRect(cx - 34, y - 4, 68, 30);   // the carpet up the middle
                    c.fillStyle = EC.GOLD; c.fillRect(cx - 34, y - 4, 1, 30); c.fillRect(cx + 33, y - 4, 1, 30);
                });
                ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
            }
        }

        /** Enni Cole: x, y its corner; it fronts south. */
        function createEnniCole(x, y, config = {}) {
            const S = EC.STONE, Z = EC.Z, P = EC.PLAN;
            const stoneLedges = (z1) => [{ z: 3, out: 1.6, th: 3, top: S.stoneLo, band: [120, 50, 86] }, { z: z1, out: 4, th: 5, top: S.stoneLt, band: [214, 128, 166], lip: S.stoneHi }];
            const planter = (id, lx, ly) => ({ id, solid: false, poly: Array.from({ length: 8 }, (_, i) => [lx + Math.cos(-i * Math.PI / 4) * 11, ly + Math.sin(-i * Math.PI / 4) * 11]), z0: 0, z1: 8, S: 3, fill: EC.BRONZE,
                paint: (d, l, t, H, L) => { const g = d.createLinearGradient(0, 0, L, 0); for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#5d432b' : EC.GOLD); d.fillStyle = g; d.fillRect(0, 0, L, H); d.fillStyle = EC.GOLD_HI; d.fillRect(0, 0, L, 0.8); },
                shade: [30, 18, 8], roof: (c, e, t) => { if (!e) { _ecPolyPath(c, t.poly); c.fillStyle = '#2a2018'; c.fill(); } }, top: _ecCypress, rise: 50 });
            const b = new EnniColeBuilding({
                id: 'enni_cole', x, y, label: 'Enni Cole', type: 'shopping', style: 'enni_cole', facing: 'S', hero: EC.HERO, plan: P,
                roofColor: '#2d242c', roofLightColor: '#463541', wallColor: S.stone, wallLightColor: S.stoneLt, accentColor: EC.GOLD,
                windowColor: '#352d30', windowLitColor: '#ffd392', windowFrameColor: EC.STEEL, balconies: [], roofProps: [{ type: 'vent', section: 0, x: 20, y: 20, w: 1, h: 1 }],
                sign: { text: 'Enni Cole', color: EC.GOLD_HI, size: 38 },
                door: { target: config.doorTarget || 'enni_cole_interior', label: 'Enter Store', lightColor: null },
                tiers: [
                    { id: 'podium', rect: [0, 0, 900, 640], z0: 0, z1: Z.POD, S: 2.5, fill: S.stoneMid, paint: _ecPodium, ledges: stoneLedges(Z.POD), shade: [40, 8, 26], roofRes: 1, roof: _ecStoneRoof },
                    { id: 'pavilion', rect: [340, 640, 220, 60], z0: 0, z1: Z.PAV, S: 3.5, fill: S.stoneMid, paint: _ecPavilion, ledges: stoneLedges(Z.PAV), shade: [40, 8, 26], roofRes: 1, roof: _ecStoneRoof },
                    { id: 'glass', on: 'podium', rect: [22, 22, 856, 600], z0: Z.POD, z1: Z.GLASS, S: 2.5, fill: EC.STEEL, paint: (d, l, t, H, L) => _ecGlass(d, l, t, H, L), shade: [8, 6, 12],
                      ledges: [{ z: Z.GLASS, out: 2.5, th: 3, top: '#24252d', band: [30, 31, 38], lip: 'rgba(214, 178, 119, 0.8)' }], roofRes: 1, roofGlow: true, roof: _ecGlassRoof,
                      top: (ctx, e, t, b2) => { if (e) return; const [x0, , x1, y1] = t.box; for (const [px, py] of [[x0 + 60, y1 - 50], [x1 - 100, y1 - 50]]) _ashPrism(ctx, b2, px, py, px + 40, py + 24, t.z1, t.z1 + 7, '#3a3940', '#4c4b52'); } },   // the plant (buildings/ashgrove.js)
                    { id: 'showroom', on: 'pavilion', solid: false, poly: _ecRoundFront(352, 622, 196, 72, 30, 5), z0: Z.PAV, z1: Z.SHOW, S: 4, fill: EC.STEEL,
                      paint: (d, l, t, H, L) => _ecGlass(d, l, t, H, L, { seed: 4409, fascia: 5, bay: 30, panes: 2, pier: 2.5 }), shade: [8, 6, 12],
                      ledges: [{ z: Z.PAV + 1, out: 2, th: 2.5, top: '#24252d', band: [30, 31, 38] }, { z: Z.SHOW, out: 3, th: 3.5, top: '#24252d', band: [30, 31, 38], lip: 'rgba(214, 178, 119, 0.85)' }],
                      roofRes: 2, roofGlow: true, roof: _ecShowRoof, script: true },
                    planter('cypW', 318, 716), planter('cypE', 582, 716)
                ],
                ...config
            });
            // its lights: the doorway's warm spill, the pink uplights along the front and up the pavilion (light only: no fixtures)
            for (const [lx, ly, color, r] of [[450, 716, '#ffd69a', 200], [348, 708, '#e070a4', 130], [552, 708, '#e070a4', 130], [120, 652, '#dd79a2', 150], [780, 652, '#dd79a2', 150], [240, 652, '#f4c88b', 120], [660, 652, '#f4c88b', 120]]) {
                const lamp = new LampEntity({ x: b.x + lx, y: b.y + ly, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; lamp.visible = false; b.attachedLights.push(lamp);
            }
            b.topReach = 80; b.glowReach = 80;
            b.viewDrift = true;   // out in front of it, the view drifts toward it (engine/draw.js _landmarkDriftTarget)
            return b;
        }

        BuildingV2Registry.register('enni_cole', {
            factory: createEnniCole,
            sections: [{ x: 0, y: 0, w: 900, h: 640 }, { x: 340, y: 640, w: 220, h: 60 }],
            accentColor: EC.GOLD, label: 'Enni Cole', type: 'shopping', category: 'shopping', floors: 14,
            sign: { text: 'Enni Cole', color: EC.GOLD_HI, size: 38 },
            door: { target: 'enni_cole_interior', label: 'Enter Store', lightColor: '#ffd392' }
        });
