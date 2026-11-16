        /* =====================================================================
           ORNAMENT KIT — carved stone and windows, painted into facade art
           ---------------------------------------------------------------------
           The vocabulary the tiered buildings paint their walls with (buildings/
           tiered-kit.js): relief (a cast shadow, the face, a lit upper-left
           rim), acanthus leaves, spiral scrolls, rosettes, a lion's mask, volute
           consoles, and mullioned windows with a room inside that glows warm at
           night. Each draws in world px into a day layer (d) and, where it
           lights up, a lit layer (l). The palette is Ornament.C: a painter sets
           it (Ornament.use) before it paints, so the same carving comes out in
           teal stone, cream limestone or brick trim.
           ===================================================================== */
        const Ornament = {
            C: null,
            /** Paint with this palette: stone, stoneMid, stoneLo, stoneDk, stoneHi, stoneLt, trim, trimLo, trimDk, frame. */
            use(C) { Ornament.C = C; return Ornament; }
        };

        /** Relief: a cast shadow down-right, the face, and a lit rim along its upper-left inside edge. */
        function _ornCarve(c, path, fill, hi = Ornament.C.stoneHi, lo = Ornament.C.stoneDk, o = 0.45) {
            c.save(); c.translate(o * 0.8, o); path(c); c.fillStyle = lo; c.fill(); c.restore();
            path(c); c.fillStyle = fill; c.fill();
            c.save(); path(c); c.clip(); c.translate(o, o * 1.1); path(c); c.lineWidth = o * 2; c.strokeStyle = hi; c.stroke(); c.restore();
        }
        const _ornEllipse = (x, y, rx, ry, rot = 0) => (c) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };

        /** An acanthus leaf from (x, y), `len` long toward `ang`: three rounded lobes down each edge, the tip curling over, a midrib. */
        function _ornLeaf(c, x, y, len, ang, w = 0.32, curl = 1) {
            const C = Ornament.C, ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, py = ca;
            const pt = (t, s) => [x + ca * len * t + px * len * w * s, y + sa * len * t + py * len * w * s];
            const path = (q) => {
                q.beginPath(); q.moveTo(x, y);
                for (let i = 0; i < 3; i++) { const t0 = i / 3, t1 = (i + 1) / 3, a = 1.5 * (1 - t0 * 0.45); q.quadraticCurveTo(...pt((t0 + t1) / 2, a), ...pt(t1, 0.35 * (1 - t1) + 0.12)); }
                q.quadraticCurveTo(...pt(1.18, 0.5 * curl), ...pt(1.02, 0.85 * curl));                                   // the tip curls over
                q.quadraticCurveTo(...pt(0.98, 0.2 * curl), ...pt(0.94, -0.1));
                for (let i = 2; i >= 0; i--) { const t0 = i / 3, t1 = (i + 1) / 3, a = -1.3 * (1 - t0 * 0.45); q.quadraticCurveTo(...pt((t0 + t1) / 2, a), ...pt(t0, i ? -0.35 * (1 - t0) - 0.12 : 0)); }
                q.closePath();
            };
            _ornCarve(c, path, C.stone, C.stoneHi, C.stoneDk, Math.min(0.5, len * 0.05));
            c.strokeStyle = C.stoneLo; c.lineWidth = Math.max(0.25, len * 0.03); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(...pt(0.5, 0.1), ...pt(0.92, 0.25 * curl)); c.stroke();
        }

        /** A spiral scroll round (x, y): outer radius r, turning `dir` (1 clockwise), opening toward `ang`; leaves on its outer turn. */
        function _ornScroll(c, x, y, r, dir, ang) {
            const C = Ornament.C, pts = [];
            for (let t = 0; t <= 2.6 * Math.PI; t += 0.12) { const rr = r * (1 - t / (3.1 * Math.PI)), a = ang + dir * t; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
            const tube = (w, col, dx = 0, dy = 0) => { c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px + dx, py + dy) : c.moveTo(px + dx, py + dy)); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); };
            tube(r * 0.3, C.stoneDk, 0.4, 0.5); tube(r * 0.26, C.stone); tube(r * 0.08, C.stoneHi, -0.3, -0.35);
            for (let i = 0; i < 4; i++) { const t = 0.3 + i * 0.42, a = ang + dir * t, rr = r * (1 - t / (3.1 * Math.PI)); _ornLeaf(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.55, a + dir * 1.1, 0.3); }
        }

        /** A rosette: a moulded ring, eight petals, a boss. */
        function _ornRosette(c, x, y, r) {
            const C = Ornament.C;
            _ornCarve(c, _ornEllipse(x, y, r, r), C.stoneMid);
            _ornCarve(c, _ornEllipse(x, y, r * 0.78, r * 0.78), C.stoneLo, C.stoneLt);
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; _ornCarve(c, _ornEllipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.3, r * 0.17, a), C.stone, C.stoneHi, C.stoneDk, 0.3); }
            _ornCarve(c, _ornEllipse(x, y, r * 0.22, r * 0.22), C.stoneLt, '#c8eadf', C.stoneDk, 0.3);
        }

        /** The lion's mask: a flame-lobed mane, a furrowed brow, deep eyes, broad nose and muzzle, the mouth a shadow. */
        function _ornLion(c, x, y, R) {
            const C = Ornament.C;
            c.fillStyle = 'rgba(8, 18, 18, 0.55)'; c.beginPath(); c.ellipse(x + 0.6, y + 0.9, R * 1.08, R * 1.02, 0, 0, Math.PI * 2); c.fill();
            for (const [n, rr, sz, off] of [[18, 0.82, 0.3, 0], [14, 0.62, 0.24, 0.2]]) {
                for (let k = 0; k < n; k++) {
                    const a = -Math.PI / 2 + (k + off) * Math.PI * 2 / n, sw = Math.sin(k * 1.7) * 0.25;
                    _ornCarve(c, _ornEllipse(x + Math.cos(a) * R * rr, y + Math.sin(a) * R * rr * 0.96, R * sz, R * sz * 0.5, a + sw), k % 2 ? C.stone : C.stoneMid, C.stoneHi, C.stoneDk, 0.35);
                }
            }
            _ornCarve(c, _ornEllipse(x, y + R * 0.06, R * 0.52, R * 0.6), C.stoneMid);                                   // the face
            _ornCarve(c, (q) => { q.beginPath(); q.moveTo(x - R * 0.52, y - R * 0.1); q.quadraticCurveTo(x - R * 0.26, y - R * 0.42, x, y - R * 0.2);    // the brow
                q.quadraticCurveTo(x + R * 0.26, y - R * 0.42, x + R * 0.52, y - R * 0.1); q.lineTo(x + R * 0.46, y - R * 0.01);
                q.quadraticCurveTo(x + R * 0.24, y - R * 0.24, x, y - R * 0.08); q.quadraticCurveTo(x - R * 0.24, y - R * 0.24, x - R * 0.46, y - R * 0.01); q.closePath(); }, C.stoneLt);
            for (const s of [-1, 1]) {                                                                                    // eyes, deep under the brow
                c.fillStyle = C.stoneDk; c.beginPath(); c.ellipse(x + s * R * 0.23, y - R * 0.02, R * 0.12, R * 0.055, s * 0.32, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(190, 230, 215, 0.55)'; c.beginPath(); c.arc(x + s * R * 0.2, y - R * 0.03, R * 0.022, 0, Math.PI * 2); c.fill();
            }
            _ornCarve(c, (q) => { q.beginPath(); q.moveTo(x - R * 0.08, y - R * 0.16); q.lineTo(x + R * 0.08, y - R * 0.16);              // the nose
                q.lineTo(x + R * 0.2, y + R * 0.2); q.quadraticCurveTo(x, y + R * 0.3, x - R * 0.2, y + R * 0.2); q.closePath(); }, C.stoneLt);
            c.fillStyle = C.stoneDk; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * R * 0.09, y + R * 0.2, R * 0.05, R * 0.03, 0, 0, Math.PI * 2); c.fill(); }
            for (const s of [-1, 1]) _ornCarve(c, _ornEllipse(x + s * R * 0.15, y + R * 0.34, R * 0.19, R * 0.14), C.stone);   // the muzzle
            c.fillStyle = C.stoneDk; c.beginPath(); c.ellipse(x, y + R * 0.47, R * 0.2, R * 0.06, 0, 0, Math.PI); c.fill();       // the mouth
            c.fillStyle = C.stoneLt; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * R * 0.12, y + R * 0.46); c.lineTo(x + s * R * 0.09, y + R * 0.53); c.lineTo(x + s * R * 0.06, y + R * 0.46); c.fill(); }
            _ornCarve(c, _ornEllipse(x, y + R * 0.6, R * 0.14, R * 0.08), C.stoneMid);                                    // the chin
            c.fillStyle = C.stoneDk; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + s * R * (0.2 + i * 0.05), y + R * (0.3 + i * 0.03), R * 0.015, 0, Math.PI * 2); c.fill(); }
        }

        /** A volute console down a pier: a scroll at the top, a smaller one at the foot, a leafed band between. */
        function _ornConsole(c, x, y0, y1, s) {
            const C = Ornament.C, h = y1 - y0, path = (q) => { q.beginPath(); q.moveTo(x - 1.6, y0 + 2); q.bezierCurveTo(x + s * 3, y0 + h * 0.3, x - s * 2, y0 + h * 0.7, x - 0.8, y1 - 1.5);
                q.lineTo(x + 0.8, y1 - 1.5); q.bezierCurveTo(x - s * 0.6, y0 + h * 0.7, x + s * 4.6, y0 + h * 0.3, x + 1.6, y0 + 2); q.closePath(); };
            _ornCarve(c, path, C.stone);
            _ornScroll(c, x, y0 + 2.6, 2.8, s, Math.PI / 2);
            _ornScroll(c, x, y1 - 2, 1.7, -s, -Math.PI / 2);
            _ornLeaf(c, x + s * 0.6, y0 + h * 0.42, h * 0.28, Math.PI / 2 + s * 0.3, 0.38);
        }

        /**
         * A mullioned window into the day (d) and lit (l) layers: a stone reveal, dark frames in 2 x 3 lights with a transom,
         * the room inside (a lamp, a bed's end, shelves) in silhouette; lit, the glass glows warm round them.
         */
        function _ornWindow(d, l, x0, y0, x1, y1, lit, r, stone) {
            const C = Ornament.C, W = x1 - x0, H = y1 - y0;
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

        Object.assign(Ornament, { carve: _ornCarve, ellipse: _ornEllipse, leaf: _ornLeaf, scroll: _ornScroll, rosette: _ornRosette, lion: _ornLion, console: _ornConsole, window: _ornWindow });
