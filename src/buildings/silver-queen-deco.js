        /* =====================================================================
           THE SILVER QUEEN — home, on the tiered kit
           ---------------------------------------------------------------------
           Rebuilt on the tiered kit (buildings/tiered-kit.js) after ETERNAL's
           reference picture: an Art Deco apartment house in pale silver stone
           that steps up toward its middle, wedding-cake fashion.
             · the front wings, five storeys either side of the entrance, curved
               balconies with black iron railings on every floor;
             · out of the middle of the front, the entrance pavilion, taller: a
               glass door under a curved marquee with SILVER QUEEN · APARTMENTS
               on it (downlights under its rim, a railed terrace on top), a tall
               glazed bay over it between silver fins with light strips, and a
               silver fan crest over its cornice;
             · behind, the tower, eight storeys, its front over the motor court
               and its east side full of balconies; on it a two-storey setback
               (a roof terrace round it, a pool on its roof), and on that the
               crown: one tall storey under a big fan crest, searchlights at
               night from its corners;
             · the motor court in the L between tower and wing stays (the court,
               its bays and drive and the fountain: buildings/silver-queen.js);
             · the forecourt: pale paving and steps, urns of white flowers,
               lavender in clipped box, lantern posts, cypresses either side of
               the door and the monument sign on the lawn.
           Every storey is ST px; the ground floor is G. Walls are one painted
           strip per tier (_sqdWall), balconies live (_sqdBalconies: slabs,
           floors and railings, three fills a frame for all of them).
           It fronts south. Collision is the tower, the two wings and the
           pavilion; the marquee, the cypresses and the sign stand free.
           ===================================================================== */
        const SQD = {
            HERO: 2,
            PLAN: { W: 700, D: 880 },
            STONE: { stone: '#a4a0ae', stoneMid: '#96919f', stoneLo: '#7a7489', stoneDk: '#46415a', stoneHi: '#cac7d4', stoneLt: '#aeabb8',
                     trim: '#b6b3c0', trimLo: '#8e8a9c', trimDk: '#5e5970', frame: '#17151e' },
            CHAR: '#2c2a36', CHAR_HI: '#45424f', SILVER: '#a3a0b2', SILVER_HI: '#d2cfdd', SILVER_LO: '#6c6982',
            GOLD: '#d9bf86', WARM: '#ffcf8a', IRON: '#1b1922',
            G: 22, ST: 13, BAY: 40,                                            // the ground floor's and each storey's height, the window bay
            Z: { WING: 80, PAV: 96, TOWER: 126, SET: 158, CROWN: 182 },
            SERIF: '"Cinzel", "Trajan Pro", "Optima", Georgia, "Times New Roman", serif'
        };

        /** A tier's edges (u0, L, normal, hidden) with their index and world end points. */
        const _sqdEdges = (t) => t.mitre.map((m, i) => m && { ...m, i, a: t.poly[i], b: t.poly[(i + 1) % t.poly.length] }).filter(Boolean);
        /** The floors of a tier: the z each storey stands on (from the ground floor's top, or the tier's foot). */
        function _sqdFloors(t) {
            const out = [];
            for (let f = t.z0 === 0 ? SQD.G : t.z0; f + SQD.ST <= t.z1 - 4; f += SQD.ST) out.push(f);
            return out;
        }
        /** A bay's middle on an edge, in the building's own frame (for the balcony rules). */
        const _sqdLocal = (t, e, along) => [e.a[0] + (e.b[0] - e.a[0]) * along / e.L - t.owner.x, e.a[1] + (e.b[1] - e.a[1]) * along / e.L - t.owner.y];

        /** A Deco fan: petals radiating up from (cx, by) to radius R, a half-disc at the hub, a ring round it. */
        function _sqdFan(c, cx, by, R, fill, line, n = 7) {
            c.save();
            c.fillStyle = fill; c.strokeStyle = line; c.lineWidth = Math.max(0.25, R * 0.05);
            c.beginPath(); c.arc(cx, by, R, Math.PI, 0); c.stroke();
            for (let i = 0; i < n; i++) {
                const a0 = Math.PI + (i + 0.12) * Math.PI / n, a1 = Math.PI + (i + 0.88) * Math.PI / n, am = (a0 + a1) / 2, r0 = R * 0.34, r1 = R * 0.9;
                c.beginPath(); c.moveTo(cx + Math.cos(a0) * r0, by + Math.sin(a0) * r0); c.lineTo(cx + Math.cos(a0) * r1 * 0.86, by + Math.sin(a0) * r1 * 0.86);
                c.lineTo(cx + Math.cos(am) * r1, by + Math.sin(am) * r1); c.lineTo(cx + Math.cos(a1) * r1 * 0.86, by + Math.sin(a1) * r1 * 0.86); c.lineTo(cx + Math.cos(a1) * r0, by + Math.sin(a1) * r0); c.closePath();
                c.fill(); c.stroke();
            }
            c.beginPath(); c.arc(cx, by, R * 0.26, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
            c.restore();
        }

        /** A fluted pier from y0 to y1 at x, w wide: a lit edge, a shadowed one, two flutes; a stepped Deco cap. */
        function _sqdPier(d, x, w, y0, y1) {
            const S = SQD.STONE;
            d.fillStyle = S.stoneLt; d.fillRect(x, y0, w, y1 - y0);
            d.fillStyle = 'rgba(255, 255, 255, 0.5)'; d.fillRect(x, y0, 0.45, y1 - y0);
            d.fillStyle = 'rgba(70, 60, 100, 0.28)'; d.fillRect(x + w - 0.55, y0, 0.55, y1 - y0);
            d.fillStyle = 'rgba(120, 110, 150, 0.35)'; for (const u of [0.36, 0.64]) d.fillRect(x + w * u - 0.15, y0 + 2, 0.3, y1 - y0 - 3);
            d.fillStyle = S.stoneHi; d.fillRect(x - 0.6, y0, w + 1.2, 0.9); d.fillStyle = S.stoneMid; d.fillRect(x - 0.3, y0 + 0.9, w + 0.6, 0.7);
        }

        /** Pale ashlar over the whole strip: courses, staggered joints, a little grain; the ground floor rusticated. */
        function _sqdAshlar(d, t, H, L, r) {
            const S = SQD.STONE;
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.stoneLt); g.addColorStop(1, S.stone); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            d.strokeStyle = 'rgba(96, 86, 130, 0.12)'; d.lineWidth = 0.3; d.beginPath();
            for (let y = 3.25, k = 0; y < H; y += 3.25, k++) { d.moveTo(0, y); d.lineTo(L, y); for (let x = (k % 2) * 4.5; x < L; x += 9) { d.moveTo(x, y); d.lineTo(x, y + 3.25); } }
            d.stroke();
            for (let i = 0; i < L * H / 10; i++) { d.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(90, 80, 120, 0.06)'; d.fillRect(r() * L, r() * H, 0.5 + r(), 0.5); }
            if (t.z0 === 0) {
                const g0 = t.z1 - SQD.G;
                d.fillStyle = S.stoneMid; d.fillRect(0, g0, L, H - g0);
                d.fillStyle = 'rgba(70, 60, 100, 0.26)'; for (let y = g0 + 3.6; y < H - 2.5; y += 3.6) d.fillRect(0, y, L, 0.55);
                d.fillStyle = 'rgba(255, 255, 255, 0.35)'; for (let y = g0 + 4.15; y < H - 2.5; y += 3.6) d.fillRect(0, y, L, 0.3);
                d.fillStyle = S.stoneLo; d.fillRect(0, H - 2.4, L, 2.4); d.fillStyle = 'rgba(255, 255, 255, 0.3)'; d.fillRect(0, H - 2.4, L, 0.35);
            }
        }

        /**
         * A wall of the Silver Queen: the stone, a window in every bay of every storey (french doors where a balcony stands
         * in front of it), a charcoal spandrel under each, fluted piers between the bays, a charcoal attic panel with a silver
         * fan over each bay, tall lobby windows on the ground floor. opt.balc(e, k, n, f, local) says where the balconies are;
         * opt.skip(e, along) leaves a stretch to a special painter.
         */
        function _sqdWall(d, l, t, H, L, opt = {}) {
            const S = SQD.STONE, O = Ornament.use(S), r = seededRandom(opt.seed || 17), Y = (z) => t.z1 - z;
            _sqdAshlar(d, t, H, L, r);
            const floors = _sqdFloors(t), top = floors.length ? floors[floors.length - 1] + SQD.ST : t.z0 === 0 ? SQD.G : t.z0, ground = t.z0 === 0;
            for (const e of _sqdEdges(t)) {
                if (e.hidden) continue;
                const n = Math.max(1, Math.round(e.L / SQD.BAY)), bw = e.L / n;
                for (let k = 0; k < n; k++) {
                    const along = (k + 0.5) * bw, cx = e.u0 + along;
                    if (opt.skip && opt.skip(e, along)) continue;
                    const loc = _sqdLocal(t, e, along);
                    for (const f of floors) {
                        const balc = opt.balc && opt.balc(e, k, n, f, loc);
                        if (balc) O.window(d, l, cx - 8.5, Y(f + 11.4), cx + 8.5, Y(f + 0.5), r() < 0.62, r, false);   // french doors out to it
                        else {
                            O.window(d, l, cx - 9.5, Y(f + 10.6), cx + 9.5, Y(f + 3), r() < 0.5, r, false);
                            d.fillStyle = SQD.CHAR; d.fillRect(cx - 9.5, Y(f + 2.6), 19, 1.8);                       // the spandrel
                            d.fillStyle = SQD.SILVER; d.fillRect(cx - 9.5, Y(f + 2.6), 19, 0.3); d.fillRect(cx - 1.5, Y(f + 2.2), 3, 0.3);
                        }
                    }
                    if (ground && !(opt.lobby && opt.lobby(e, along))) O.window(d, l, cx - 11, Y(SQD.G - 3.5), cx + 11, Y(4), r() < 0.75, r, true);   // tall lobby windows
                    if (top < t.z1 - 5) {                                                                                  // the attic: a fan over each bay
                        const y0 = Y(t.z1 - 2.2), y1 = Y(top + 1.2), x0 = cx - bw / 2 + 3, x1 = cx + bw / 2 - 3;
                        d.fillStyle = SQD.CHAR; d.fillRect(x0, y0, x1 - x0, y1 - y0); d.fillStyle = SQD.CHAR_HI; d.fillRect(x0, y0, x1 - x0, 0.4);
                        _sqdFan(d, cx, y1 - 0.6, Math.min(y1 - y0 - 1.2, bw * 0.3), SQD.SILVER, SQD.SILVER_LO);
                        l.fillStyle = 'rgba(210, 196, 255, 0.22)'; l.fillRect(x0, y1 - 0.8, x1 - x0, 0.8);                    // a cove light under each
                    }
                }
                for (let k = 0; k <= n; k++) {                                                                             // the piers, wider at the corners
                    const w = k === 0 || k === n ? 4.5 : 3.2, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + k * bw - w / 2));
                    _sqdPier(d, x, w, top < t.z1 - 5 ? Y(t.z1 - 2.2) : 0, ground ? Y(SQD.G) : H);
                    if (ground && opt.uplights) {                                                                         // an uplight at its foot, lighting it at night
                        const ug = l.createLinearGradient(0, Y(SQD.G), 0, Y(SQD.G + 26)); ug.addColorStop(0, 'rgba(255, 226, 180, 0.55)'); ug.addColorStop(1, 'rgba(255, 226, 180, 0)');
                        l.fillStyle = ug; l.beginPath(); l.moveTo(x + w / 2 - 1.5, Y(SQD.G)); l.lineTo(x - 5, Y(SQD.G + 26)); l.lineTo(x + w + 5, Y(SQD.G + 26)); l.lineTo(x + w / 2 + 1.5, Y(SQD.G)); l.closePath(); l.fill();
                    }
                }
            }
        }

        /** The pavilion's front: the glass doors with sconces either side, the tall glazed bay between silver fins and their light strips, a fan over it. */
        function _sqdPavilion(d, l, t, H, L) {
            const Y = (z) => t.z1 - z, front = _sqdEdges(t).find(e => e.ny > 0.99), isFront = (e) => !!front && e.i === front.i;
            _sqdWall(d, l, t, H, L, { seed: 71, skip: isFront, lobby: isFront });
            if (!front) return;
            const cx = front.u0 + front.L / 2, r = seededRandom(73);
            // the narrow outer bays: a slim window each storey
            for (const s of [-1, 1]) for (const f of _sqdFloors(t)) Ornament.window(d, l, cx + s * 41 - 3.5, Y(f + 10.4), cx + s * 41 + 3.5, Y(f + 2.6), r() < 0.5, r, false);
            // the bay: a charcoal recess, glass in a grid of mullions, the floors inside lit warm, a chandelier at the top
            const b0 = Y(SQD.G + 12), b1 = Y(SQD.Z.PAV - 10), bx0 = cx - 21, bx1 = cx + 21;
            d.fillStyle = SQD.CHAR; d.fillRect(bx0 - 2, b1 - 1.5, bx1 - bx0 + 4, b0 - b1 + 3);
            { const g = d.createLinearGradient(bx0, b1, bx1, b0); g.addColorStop(0, '#3a3a4e'); g.addColorStop(0.5, '#4a4458'); g.addColorStop(1, '#2a2a38'); d.fillStyle = g; d.fillRect(bx0, b1, bx1 - bx0, b0 - b1); }
            d.fillStyle = 'rgba(214, 222, 240, 0.12)'; d.beginPath(); d.moveTo(bx0, b1); d.lineTo(bx0 + 18, b1); d.lineTo(bx0, b1 + 40); d.closePath(); d.fill();
            { const g = l.createLinearGradient(0, b1, 0, b0); g.addColorStop(0, 'rgba(255, 214, 150, 0.95)'); g.addColorStop(1, 'rgba(255, 190, 110, 0.75)'); l.fillStyle = g; l.fillRect(bx0, b1, bx1 - bx0, b0 - b1); }
            for (let k = 0; k < 14; k++) { const a = k / 13 * Math.PI, px = cx + Math.cos(a) * 9, py = b1 + 10 + Math.sin(a) * 3; l.fillStyle = '#fff6dc'; l.fillRect(px - 0.5, py - 0.5, 1.1, 1.1); d.fillStyle = '#e7cf9e'; d.fillRect(px - 0.4, py - 0.4, 0.8, 0.8); }
            for (const c of [d, l]) {                                                                                      // mullions and transoms
                const col = c === d ? SQD.IRON : 'rgba(40, 24, 10, 0.75)';
                c.fillStyle = col; for (let k = 1; k < 5; k++) c.fillRect(bx0 + (bx1 - bx0) * k / 5 - 0.35, b1, 0.7, b0 - b1);
                for (let z = SQD.G + 12 + SQD.ST; z < SQD.Z.PAV - 10; z += SQD.ST) c.fillRect(bx0, Y(z) - 0.5, bx1 - bx0, 1);
            }
            // the fins either side, a light strip down each
            for (const s of [-1, 1]) {
                const x = cx + s * 26 - 2.5;
                d.fillStyle = SQD.SILVER; d.fillRect(x, Y(SQD.Z.PAV - 3), 5, Y(SQD.G + 10) - Y(SQD.Z.PAV - 3)); d.fillStyle = SQD.SILVER_HI; d.fillRect(x, Y(SQD.Z.PAV - 3), 1, Y(SQD.G + 10) - Y(SQD.Z.PAV - 3));
                d.fillStyle = SQD.SILVER_LO; d.fillRect(x + 4.2, Y(SQD.Z.PAV - 3), 0.8, Y(SQD.G + 10) - Y(SQD.Z.PAV - 3)); d.fillStyle = '#c8c4d6'; d.fillRect(x + 2, Y(SQD.Z.PAV - 4), 1, Y(SQD.G + 11) - Y(SQD.Z.PAV - 4));
                l.fillStyle = 'rgba(246, 240, 255, 1)'; l.fillRect(x + 1.9, Y(SQD.Z.PAV - 4), 1.2, Y(SQD.G + 11) - Y(SQD.Z.PAV - 4));
                const lg = l.createLinearGradient(x - 4, 0, x + 9, 0); lg.addColorStop(0, 'rgba(200, 180, 255, 0)'); lg.addColorStop(0.5, 'rgba(220, 205, 255, 0.4)'); lg.addColorStop(1, 'rgba(200, 180, 255, 0)');
                l.fillStyle = lg; l.fillRect(x - 4, Y(SQD.Z.PAV - 4), 13, Y(SQD.G + 11) - Y(SQD.Z.PAV - 4));
            }
            // a fan over the bay, under the cornice
            _sqdFan(d, cx, Y(SQD.Z.PAV - 9.2), 7.5, SQD.SILVER, SQD.SILVER_LO, 9);
            l.fillStyle = 'rgba(230, 220, 255, 0.35)'; l.beginPath(); l.arc(cx, Y(SQD.Z.PAV - 9.2), 7.5, Math.PI, 0); l.fill();
            // the ground floor: piers, the glass doors, the chandelier through them, sconces either side
            const g0 = Y(SQD.G), gb = H - 2.4, dx0 = cx - 15, dx1 = cx + 15, dt = Y(SQD.G - 3);
            d.fillStyle = SQD.CHAR; d.fillRect(dx0 - 2, dt - 2, dx1 - dx0 + 4, gb - dt + 2);
            { const g = d.createLinearGradient(0, dt, 0, gb); g.addColorStop(0, '#4b4250'); g.addColorStop(1, '#5c4e46'); d.fillStyle = g; d.fillRect(dx0, dt, dx1 - dx0, gb - dt); }
            { const g = l.createLinearGradient(0, dt, 0, gb); g.addColorStop(0, 'rgba(255, 220, 160, 0.9)'); g.addColorStop(1, 'rgba(255, 196, 120, 1)'); l.fillStyle = g; l.fillRect(dx0, dt, dx1 - dx0, gb - dt); }
            for (let k = 0; k < 12; k++) { const a = k / 11 * Math.PI, px = cx + Math.cos(a) * 6, py = dt + 4 + Math.sin(a) * 2; l.fillStyle = '#fff8e4'; l.fillRect(px - 0.5, py - 0.5, 1, 1); d.fillStyle = '#e9d6a8'; d.fillRect(px - 0.4, py - 0.4, 0.8, 0.8); }
            for (const c of [d, l]) {
                const col = c === d ? SQD.IRON : 'rgba(40, 24, 10, 0.8)';
                c.fillStyle = col; c.fillRect(cx - 0.5, dt, 1, gb - dt); c.fillRect(dx0, dt + 5, dx1 - dx0, 0.8);
                for (const s of [-1, 1]) { c.fillRect(cx + s * 7.5 - 0.3, dt + 5, 0.6, gb - dt - 5); c.fillRect(cx + s * 11 - 0.3, dt + 8, 0.6, 7); }
                c.fillRect(dx0, dt, 0.8, gb - dt); c.fillRect(dx1 - 0.8, dt, 0.8, gb - dt);
            }
            for (const s of [-1, 1]) {
                _sqdPier(d, cx + s * 21 - 3, 6, g0, gb);
                const x = cx + s * 30 - 1;                                                                                  // the sconce: a bronze bar, an opal glass
                d.fillStyle = '#5c4a35'; d.fillRect(x, dt + 3, 2, 9); d.fillStyle = '#c8bfa9'; d.fillRect(x + 0.4, dt + 4, 1.2, 7);
                const sg = l.createRadialGradient(x + 1, dt + 7.5, 0, x + 1, dt + 7.5, 9); sg.addColorStop(0, 'rgba(255, 238, 205, 1)'); sg.addColorStop(1, 'rgba(255, 196, 130, 0)'); l.fillStyle = sg; l.fillRect(x - 8, dt - 1.5, 18, 18);
                l.fillStyle = 'rgba(255, 250, 236, 1)'; l.fillRect(x + 0.4, dt + 4, 1.2, 7);
            }
        }

        /** The crown's walls: one tall storey; on its front a slot window between fins under a fan, plain windows round the rest. */
        function _sqdCrown(d, l, t, H, L) {
            const Y = (z) => t.z1 - z, front = _sqdEdges(t).find(e => e.ny > 0.99);
            _sqdWall(d, l, t, H, L, { seed: 91, skip: (e, along) => !!front && e.i === front.i && Math.abs(along - e.L / 2) < 30 });
            if (!front) return;
            const cx = front.u0 + front.L / 2, z0 = t.z0 + 2, z1 = t.z0 + SQD.ST + 1;
            d.fillStyle = SQD.CHAR; d.fillRect(cx - 12, Y(z1 + 1), 24, Y(z0) - Y(z1 + 1));
            { const g = l.createLinearGradient(0, Y(z1), 0, Y(z0)); g.addColorStop(0, 'rgba(255, 210, 150, 0.85)'); g.addColorStop(1, 'rgba(255, 186, 110, 0.7)'); l.fillStyle = g; l.fillRect(cx - 10, Y(z1), 20, Y(z0) - Y(z1)); }
            d.fillStyle = '#3d3a4c'; d.fillRect(cx - 10, Y(z1), 20, Y(z0) - Y(z1));
            d.fillStyle = SQD.IRON; for (let k = 1; k < 4; k++) d.fillRect(cx - 10 + 5 * k - 0.3, Y(z1), 0.6, Y(z0) - Y(z1));
            for (const s of [-1, 1]) {
                const x = cx + s * 16 - 2;
                d.fillStyle = SQD.SILVER; d.fillRect(x, 0, 4, Y(t.z0)); d.fillStyle = SQD.SILVER_HI; d.fillRect(x, 0, 0.8, Y(t.z0));
                l.fillStyle = 'rgba(246, 240, 255, 1)'; l.fillRect(x + 1.6, 1, 0.9, Y(t.z0) - 2);
            }
        }

        /** The marquee: a charcoal band round its curve, SILVER QUEEN in silver capitals over APARTMENTS, downlights along its foot. */
        function _sqdMarquee(d, l, t, H, L) {
            const edges = _sqdEdges(t).filter(e => e.ny > -0.9), u0 = edges.length ? Math.min(...edges.map(e => e.u0)) : 0, u1 = edges.length ? Math.max(...edges.map(e => e.u0 + e.L)) : L, cx = (u0 + u1) / 2;   // (not the back, against the wall)
            { const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, SQD.CHAR_HI); g.addColorStop(0.2, SQD.CHAR); g.addColorStop(1, '#1f1d27'); d.fillStyle = g; d.fillRect(0, 0, L, H); }
            d.fillStyle = SQD.SILVER; d.fillRect(0, 0.6, L, 0.7); d.fillRect(0, H - 1.6, L, 0.6); d.fillStyle = SQD.SILVER_HI; d.fillRect(0, 0.6, L, 0.25);
            for (const [c, lit] of [[d, false], [l, true]]) {
                c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
                c.font = `600 6.4px ${SQD.SERIF}`; try { c.letterSpacing = '0.5px'; } catch (e) { /* older canvases */ }
                if (lit) { c.shadowColor = 'rgba(220, 205, 255, 1)'; c.shadowBlur = 3; c.fillStyle = 'rgba(250, 247, 255, 0.95)'; }
                else { c.fillStyle = 'rgba(0, 0, 0, 0.5)'; c.fillText('SILVER QUEEN', cx + 0.2, H * 0.4 + 0.3); c.fillStyle = SQD.SILVER_HI; }
                c.fillText('SILVER QUEEN', cx, H * 0.4);
                c.font = `500 2.6px ${SQD.SERIF}`; try { c.letterSpacing = '1.1px'; } catch (e) { /* older canvases */ }
                c.fillText('APARTMENTS', cx, H * 0.76);
                c.restore();
                const lineC = lit ? 'rgba(230, 220, 255, 0.7)' : SQD.SILVER;
                c.fillStyle = lineC; c.fillRect(cx - 17, H * 0.76 - 0.15, 8, 0.3); c.fillRect(cx + 9, H * 0.76 - 0.15, 8, 0.3);
            }
            for (let u = u0 + 4; u < u1 - 2; u += 7) {                                                                     // the downlights along its rim
                d.fillStyle = '#b8b2c4'; d.fillRect(u - 0.5, H - 1, 1, 0.8);
                l.fillStyle = 'rgba(255, 246, 228, 1)'; l.fillRect(u - 0.6, H - 1.1, 1.2, 1);
            }
        }

        /** A balcony slab's or monument's charcoal-and-silver strip, the generic fill for small pieces. */
        function _sqdPlain(fill, band) {
            return (d, l, t, H, L) => { d.fillStyle = fill; d.fillRect(0, 0, L, H); if (band) { d.fillStyle = band; d.fillRect(0, 0, L, 0.8); } };
        }

        /** The monument sign on the lawn: a pale stone wall with the name carved and lit, lanterns on its piers. */
        function _sqdMonument(d, l, t, H, L) {
            const S = SQD.STONE, r = seededRandom(5);
            _sqdAshlar(d, { z0: 1, z1: 1 }, H, L, r);
            const front = _sqdEdges(t).find(e => e.ny > 0.99);
            if (!front) return;
            const cx = front.u0 + front.L / 2, w = front.L - 8;
            d.fillStyle = S.stoneMid; d.fillRect(cx - w / 2, 2, w, H - 4); d.strokeStyle = 'rgba(120, 110, 150, 0.6)'; d.lineWidth = 0.4; d.strokeRect(cx - w / 2 + 1, 3, w - 2, H - 6);
            for (const [c, lit] of [[d, false], [l, true]]) {
                c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
                if (lit) { c.shadowColor = 'rgba(255, 220, 170, 1)'; c.shadowBlur = 2; c.fillStyle = 'rgba(255, 240, 214, 0.6)'; } else c.fillStyle = '#3a3646';
                c.font = `600 4.2px ${SQD.SERIF}`; c.fillText('SILVER QUEEN', cx, H * 0.5);
                c.font = `500 1.9px ${SQD.SERIF}`; try { c.letterSpacing = '0.7px'; } catch (e) { /* older canvases */ } c.fillText('APARTMENTS', cx, H * 0.78);
                c.restore();
            }
            _sqdFan(d, cx, H * 0.32, 2.6, '#4a465a', '#2c2a36', 5);
        }

        // ── roofs (world coordinates, each in its tier's plane, painted once) ──

        const _sqdPolyPath = (c, poly) => { c.beginPath(); poly.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };

        /** A terrace roof: pale pavers laid on the diagonal, a silver-capped parapet, planters along it (lit: their little lamps). */
        function _sqdTerrace(c, e, t, opt = {}) {
            const [x0, y0, x1, y1] = t.box, r = seededRandom(opt.seed || 3);
            if (e) {
                if (!opt.lamps) return;
                for (let x = x0 + 26; x < x1 - 20; x += 52) { const g = c.createRadialGradient(x, y1 - 12, 0, x, y1 - 12, 14); g.addColorStop(0, 'rgba(255, 226, 170, 0.5)'); g.addColorStop(1, 'rgba(255, 210, 150, 0)'); c.fillStyle = g; c.fillRect(x - 14, y1 - 26, 28, 28); }
                return;
            }
            _sqdPolyPath(c, t.poly); c.fillStyle = opt.paving || '#6a6479'; c.fill();
            c.save(); _sqdPolyPath(c, t.poly); c.clip();
            c.strokeStyle = 'rgba(40, 30, 70, 0.22)'; c.lineWidth = 0.7; c.beginPath();
            for (let s = -(y1 - y0); s < x1 - x0; s += 12) { c.moveTo(x0 + s, y0); c.lineTo(x0 + s + (y1 - y0), y1); c.moveTo(x0 + s + (y1 - y0), y0); c.lineTo(x0 + s, y1); }
            c.stroke();
            for (let i = 0; i < (x1 - x0) * (y1 - y0) / 40; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(60, 50, 90, 0.06)'; c.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1.2, 1.2); }
            c.restore();
            if (opt.planters) for (let x = x0 + 14; x < x1 - 22; x += 52) {                                              // box planters with clipped balls along the front
                c.fillStyle = '#4e4a5c'; c.fillRect(x, y1 - 18, 24, 9); c.fillStyle = '#2f4a32'; c.beginPath(); c.arc(x + 6, y1 - 14, 4.5, 0, Math.PI * 2); c.arc(x + 18, y1 - 14, 4.5, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(160, 210, 150, 0.35)'; c.beginPath(); c.arc(x + 5, y1 - 15.5, 1.8, 0, Math.PI * 2); c.arc(x + 17, y1 - 15.5, 1.8, 0, Math.PI * 2); c.fill();
            }
            _sqdPolyPath(c, t.poly); c.lineJoin = 'miter'; c.strokeStyle = SQD.STONE.stoneLt; c.lineWidth = opt.pw || 7; c.stroke();
            c.save(); _sqdPolyPath(c, t.poly); c.clip(); _sqdPolyPath(c, t.poly); c.lineWidth = (opt.pw || 7) + 2; c.strokeStyle = SQD.SILVER; c.stroke(); _sqdPolyPath(c, t.poly); c.lineWidth = opt.pw || 7; c.strokeStyle = SQD.STONE.stoneLt; c.stroke(); c.restore();
            _sqdPolyPath(c, t.poly); c.strokeStyle = 'rgba(40, 30, 60, 0.35)'; c.lineWidth = 0.8; c.stroke();
        }

        /** A wing's roof garden: the terrace, a lawn down the middle with clipped balls, a pergola and loungers at the front. */
        function _sqdWingRoof(c, e, t, seed) {
            const [x0, y0, x1, y1] = t.box, w = x1 - x0;
            _sqdTerrace(c, e, t, { seed, planters: true, lamps: true, paving: '#5f596d' });
            if (e) { for (let y = y0 + 90; y < y1 - 120; y += 70) { const g = c.createRadialGradient((x0 + x1) / 2, y, 0, (x0 + x1) / 2, y, 22); g.addColorStop(0, 'rgba(255, 220, 160, 0.4)'); g.addColorStop(1, 'rgba(255, 210, 150, 0)'); c.fillStyle = g; c.fillRect(x0, y - 22, w, 44); } return; }
            c.fillStyle = '#3d5a3c'; c.beginPath(); c.roundRect(x0 + 24, y0 + 40, w - 48, y1 - y0 - 170, 8); c.fill();
            c.strokeStyle = '#7c768a'; c.lineWidth = 3; c.stroke();
            for (let y = y0 + 70; y < y1 - 140; y += 46) for (const x of [x0 + 42, x1 - 42]) {
                c.fillStyle = 'rgba(0, 0, 0, 0.3)'; c.beginPath(); c.arc(x + 1.5, y + 2, 9, 0, Math.PI * 2); c.fill();
                for (const [k, col] of [[9, '#2f5a36'], [6, '#3f7a4a'], [3, '#5a9a62']]) { c.fillStyle = col; c.beginPath(); c.arc(x - (9 - k) * 0.3, y - (9 - k) * 0.3, k, 0, Math.PI * 2); c.fill(); }
            }
            c.fillStyle = '#a49eb0'; c.fillRect((x0 + x1) / 2 - 5, y0 + 40, 10, y1 - y0 - 170);                                // the path
            const py = y1 - 118;                                                                                                // the pergola: posts, beams, slats
            c.fillStyle = 'rgba(0, 0, 0, 0.25)'; c.fillRect(x0 + 20, py + 3, w - 40, 54);
            c.fillStyle = '#2c2a36'; for (const x of [x0 + 20, x1 - 24]) for (const y of [py, py + 50]) c.fillRect(x, y, 4, 4);
            c.fillStyle = '#c4bfcf'; for (let x = x0 + 24; x < x1 - 24; x += 7) c.fillRect(x, py, 2.5, 54);
            c.fillStyle = '#3a3746'; c.fillRect(x0 + 18, py - 1, w - 36, 3); c.fillRect(x0 + 18, py + 52, w - 36, 3);
            for (let x = x0 + 30; x < x1 - 40; x += 30) { c.fillStyle = '#c4bfcf'; c.fillRect(x, py + 64, 20, 9); c.fillStyle = SQD.CHAR; c.fillRect(x, py + 64, 20, 1.4); }
        }

        /** The setback's roof: a terrace with the pool (lit violet at night), loungers, a lawn with a path. */
        function _sqdSetbackRoof(c, e, t) {
            const [x0, y0, x1, y1] = t.box, px = x0 + 360, py = y0 + 40, pw = 220, ph = 120;
            if (e) {
                const g = c.createRadialGradient(px + pw / 2, py + ph / 2, 10, px + pw / 2, py + ph / 2, pw * 0.7); g.addColorStop(0, 'rgba(160, 140, 255, 0.45)'); g.addColorStop(1, 'rgba(120, 100, 255, 0)');
                c.fillStyle = g; c.fillRect(px - 40, py - 40, pw + 80, ph + 80);
                c.strokeStyle = 'rgba(230, 220, 255, 0.55)'; c.lineWidth = 1.5; c.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
                return;
            }
            _sqdTerrace(c, e, t, { seed: 41, pw: 6 });
            c.fillStyle = '#3d5a3c'; c.beginPath(); c.roundRect(x0 + 30, y0 + 30, 280, 150, 10); c.fill();                // the lawn, a path across it
            c.fillStyle = 'rgba(120, 170, 110, 0.18)'; for (let i = 0; i < 60; i++) { c.beginPath(); c.arc(x0 + 40 + (i * 53 % 260), y0 + 40 + (i * 37 % 130), 2, 0, Math.PI * 2); c.fill(); }
            c.fillStyle = '#a29cad'; c.fillRect(x0 + 160, y0 + 30, 16, 150);
            c.fillStyle = '#a49eb0'; c.fillRect(px - 8, py - 8, pw + 16, ph + 16);                                         // the pool: coping, water, lane lines
            const g = c.createLinearGradient(px, py, px + pw, py + ph); g.addColorStop(0, '#4a58b0'); g.addColorStop(1, '#2b2c7a'); c.fillStyle = g; c.fillRect(px, py, pw, ph);
            c.strokeStyle = 'rgba(230, 236, 255, 0.35)'; c.lineWidth = 1; c.beginPath(); for (let y = py + 30; y < py + ph; y += 30) { c.moveTo(px + 8, y); c.lineTo(px + pw - 8, y); } c.stroke();
            _sqdFan(c, px + pw / 2, py + ph - 2, 26, 'rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.18)', 9);
            for (let x = px + 10; x < px + pw - 20; x += 36) { c.fillStyle = '#c4bfcf'; c.fillRect(x, py + ph + 18, 22, 10); c.fillStyle = SQD.CHAR; c.fillRect(x, py + ph + 18, 22, 1.5); }   // loungers
        }

        /** A charcoal roof with a silver rim and a hexagon skylight (the Silver Queen's hexagon), lit from below at night. */
        function _sqdDarkRoof(c, e, t, opt = {}) {
            const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + (opt.dy || 0), R = opt.hex || 0;
            const hex = () => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.92); } c.closePath(); };
            if (e) { if (R) { hex(); const g = c.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, 'rgba(255, 220, 170, 0.5)'); g.addColorStop(1, 'rgba(200, 170, 255, 0.25)'); c.fillStyle = g; c.fill(); } return; }
            _sqdPolyPath(c, t.poly); const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#3d3a4b'); g.addColorStop(1, '#2a2835'); c.fillStyle = g; c.fill();
            c.save(); _sqdPolyPath(c, t.poly); c.clip(); c.strokeStyle = 'rgba(200, 190, 230, 0.07)'; c.lineWidth = 0.8; c.beginPath(); for (let x = x0 + 10; x < x1; x += 14) { c.moveTo(x, y0); c.lineTo(x, y1); } c.stroke(); c.restore();
            _sqdPolyPath(c, t.poly); c.lineJoin = 'miter'; c.lineWidth = opt.pw || 5; c.strokeStyle = SQD.STONE.stoneLt; c.stroke(); c.lineWidth = 0.8; c.strokeStyle = SQD.SILVER_LO; c.stroke();
            if (R) {
                hex(); c.fillStyle = '#1a1830'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = SQD.SILVER; c.stroke();
                c.save(); hex(); c.clip(); c.strokeStyle = 'rgba(200, 190, 240, 0.4)'; c.lineWidth = 0.8; c.beginPath();
                for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } c.stroke();
                c.fillStyle = 'rgba(220, 230, 255, 0.12)'; c.fillRect(cx - R, cy - R, R, R * 0.8); c.restore();
            }
        }

        // ── what stands on the tiers, drawn live ──

        /**
         * The balconies of tier t (the rule says where), every one a curved stone slab with an iron railing round it: the
         * slabs' fronts, their floors and the railings each go out in one fill or stroke. Emissive: the railings again,
         * dark, so the lit french doors behind them don't wash through.
         */
        function _sqdBalconies(ctx, e, t, b, rule) {
            if (!t._bal) {
                const out = [];
                for (const m of _sqdEdges(t)) {
                    if (m.hidden) continue;
                    const n = Math.max(1, Math.round(m.L / SQD.BAY)), bw = m.L / n, dx = (m.b[0] - m.a[0]) / m.L, dy = (m.b[1] - m.a[1]) / m.L;
                    for (let k = 0; k < n; k++) for (const f of _sqdFloors(t)) {
                        const along = (k + 0.5) * bw;
                        if (!rule(m, k, n, f, _sqdLocal(t, m, along))) continue;
                        const cx = m.a[0] + dx * along, cy = m.a[1] + dy * along, hw = 14, dep = 10, N = 8, pts = [];
                        for (let j = 0; j <= N; j++) { const th = Math.PI - j * Math.PI / N; pts.push([cx + dx * hw * Math.cos(th) + m.nx * dep * Math.sin(th), cy + dy * hw * Math.cos(th) + m.ny * dep * Math.sin(th)]); }
                        out.push({ pts, z: f, nx: m.nx, ny: m.ny, cx, cy });
                    }
                }
                t._bal = out;
            }
            const cam = game.camera, P = (x, y, z) => b._tkP(x, y, z), lod = _zoomLOD;
            const vis = t._bal.filter(B => (cam.x - B.cx) * B.nx + (cam.y - B.cy) * B.ny > 0);
            if (!vis.length) return;
            const rails = new Path2D(), tops = e ? null : new Path2D();
            for (const B of vis) {
                const zt = B.z + 4.2;
                B.pts.forEach(([x, y], j) => { const p = P(x, y, zt); j ? (tops || rails).lineTo(p[0], p[1]) : (tops || rails).moveTo(p[0], p[1]); });
                if (lod < 2) {
                    B.pts.forEach(([x, y], j) => { const p = P(x, y, B.z + 2.1); j ? rails.lineTo(p[0], p[1]) : rails.moveTo(p[0], p[1]); });
                    for (let j = 0; j < B.pts.length - 1; j++) {
                        const [ax, ay] = B.pts[j], [bx, by] = B.pts[j + 1], len = Math.hypot(bx - ax, by - ay), nb = Math.max(1, Math.round(len / 3.2));
                        for (let q = j ? 1 : 0; q <= nb; q++) { const u = q / nb, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, p0 = P(x, y, B.z), p1 = P(x, y, zt); rails.moveTo(p0[0], p0[1]); rails.lineTo(p1[0], p1[1]); }
                    }
                }
            }
            ctx.save();
            if (e) {                                                                                                       // the railings over the light behind them
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.85; ctx.strokeStyle = '#0d0c12'; ctx.lineWidth = 0.75; ctx.stroke(rails);
                ctx.restore(); return;
            }
            const fronts = new Path2D(), floors = new Path2D();
            for (const B of vis) {
                for (let j = 0; j < B.pts.length - 1; j++) {                                                               // the slab's edge, where it faces the camera
                    const [ax, ay] = B.pts[j], [bx, by] = B.pts[j + 1], mx = (ax + bx) / 2, my = (ay + by) / 2;
                    if ((cam.x - mx) * (mx - B.cx) + (cam.y - my) * (my - B.cy) <= 0) continue;              // (its outside, away from the middle, toward the camera)
                    const a0 = P(ax, ay, B.z - 1.8), b0 = P(bx, by, B.z - 1.8), b1 = P(bx, by, B.z), a1 = P(ax, ay, B.z);
                    fronts.moveTo(a0[0], a0[1]); fronts.lineTo(b0[0], b0[1]); fronts.lineTo(b1[0], b1[1]); fronts.lineTo(a1[0], a1[1]); fronts.closePath();
                }
                B.pts.forEach(([x, y], j) => { const p = P(x, y, B.z); j ? floors.lineTo(p[0], p[1]) : floors.moveTo(p[0], p[1]); }); floors.closePath();
            }
            ctx.fillStyle = '#a6a2b2'; ctx.fill(fronts); ctx.strokeStyle = 'rgba(60, 50, 90, 0.45)'; ctx.lineWidth = 0.6; ctx.stroke(fronts);
            ctx.fillStyle = '#69637a'; ctx.fill(floors);
            ctx.strokeStyle = '#26232e'; ctx.lineWidth = 0.6; ctx.stroke(rails);
            if (tops) { ctx.strokeStyle = SQD.SILVER; ctx.lineWidth = 0.9; ctx.stroke(tops); }
            ctx.restore();
        }

        /**
         * A fan crest standing on a front edge: silver petals in the wall's plane from z0 up, R high, its middle at (cx, wy);
         * at night the petals' edges glow.
         */
        function _sqdCrest(ctx, e, b, cx, wy, z0, R, n = 9) {
            const P = (u, h) => b._tkP(cx + u, wy, z0 + h), petals = [];
            for (let i = 0; i < n; i++) {
                const a0 = Math.PI - (i + 0.1) * Math.PI / n, a1 = Math.PI - (i + 0.9) * Math.PI / n, am = (a0 + a1) / 2, r0 = R * 0.3, r1 = R * (i % 2 ? 0.84 : 1);
                petals.push([[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a0) * r1 * 0.84, Math.sin(a0) * r1 * 0.84], [Math.cos(am) * r1, Math.sin(am) * r1], [Math.cos(a1) * r1 * 0.84, Math.sin(a1) * r1 * 0.84], [Math.cos(a1) * r0, Math.sin(a1) * r0]]);
            }
            const path = new Path2D();
            for (const pet of petals) { pet.forEach(([u, h], j) => { const p = P(u, h); j ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]); }); path.closePath(); }
            const hub = new Path2D(); for (let j = 0; j <= 12; j++) { const a = Math.PI - j * Math.PI / 12, p = P(Math.cos(a) * R * 0.24, Math.sin(a) * R * 0.24); j ? hub.lineTo(p[0], p[1]) : hub.moveTo(p[0], p[1]); } hub.closePath();
            const base = new Path2D(); { const pts = [P(-R * 1.05, 0), P(R * 1.05, 0), P(R * 0.95, -1.5), P(-R * 0.95, -1.5)]; pts.forEach((p, j) => j ? base.lineTo(p[0], p[1]) : base.moveTo(p[0], p[1])); base.closePath(); }
            ctx.save();
            if (e) {
                ctx.strokeStyle = 'rgba(236, 228, 255, 0.85)'; ctx.lineWidth = 0.9; ctx.stroke(path); ctx.fillStyle = 'rgba(255, 240, 220, 0.6)'; ctx.fill(hub);
                const c = P(0, R * 0.5), k = b._tkK(z0 + R * 0.5), g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * 1.3 * k);
                g.addColorStop(0, 'rgba(200, 180, 255, 0.35)'); g.addColorStop(1, 'rgba(160, 130, 255, 0)'); ctx.fillStyle = g; ctx.fillRect(c[0] - R * 1.3 * k, c[1] - R * 1.3 * k, R * 2.6 * k, R * 2.6 * k);
            } else {
                ctx.fillStyle = SQD.SILVER; ctx.fill(path); ctx.strokeStyle = SQD.SILVER_LO; ctx.lineWidth = 0.7; ctx.stroke(path);
                ctx.fillStyle = SQD.SILVER_HI; ctx.fill(hub); ctx.stroke(hub);
                ctx.fillStyle = SQD.STONE.stoneLt; ctx.fill(base);
            }
            ctx.restore();
        }

        /** The marquee's roof, the sign the street sees from above: SILVER QUEEN in silver capitals over APARTMENTS, lit at night. */
        function _sqdMarqueeRoof(c, e, t) {
            const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2, cy = y0 + 13;
            if (!e) {
                _sqdPolyPath(c, t.poly); const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#3a3746'); g.addColorStop(1, '#2a2834'); c.fillStyle = g; c.fill();
                c.lineWidth = 3; c.strokeStyle = SQD.SILVER; c.stroke(); c.lineWidth = 0.8; c.strokeStyle = SQD.SILVER_LO; c.stroke();
            }
            c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
            const text = (str, y, size, sp) => { c.font = `600 ${size}px ${SQD.SERIF}`; try { c.letterSpacing = sp + 'px'; } catch (err) { /* older canvases */ } c.fillText(str, cx, y); };
            if (e) { c.shadowColor = 'rgba(214, 196, 255, 1)'; c.shadowBlur = 6; c.fillStyle = 'rgba(250, 247, 255, 0.95)'; }
            else { c.fillStyle = 'rgba(0, 0, 0, 0.55)'; c.translate(0.6, 0.8); text('SILVER QUEEN', cy, 14, 1.2); text('APARTMENTS', cy + 11, 5.2, 2.4); c.translate(-0.6, -0.8); c.fillStyle = SQD.SILVER_HI; }
            text('SILVER QUEEN', cy, 14, 1.2); text('APARTMENTS', cy + 11, 5.2, 2.4);
            c.restore();
            c.fillStyle = e ? 'rgba(230, 220, 255, 0.8)' : SQD.SILVER; c.fillRect(cx - 44, cy + 10.6, 22, 0.8); c.fillRect(cx + 22, cy + 10.6, 22, 0.8);
        }

        /** The marquee's terrace railing, round its curve. */
        function _sqdMarqueeRail(ctx, e, t, b) {
            if (e) return;
            const pts = t.poly.slice(0, -1), z0 = t.z1, z1 = t.z1 + 3.6, rail = new Path2D();
            pts.forEach(([x, y], j) => { const p = b._tkP(x, y, z1); j ? rail.lineTo(p[0], p[1]) : rail.moveTo(p[0], p[1]); });
            if (_zoomLOD < 2) for (let j = 0; j < pts.length - 1; j++) {
                const [ax, ay] = pts[j], [bx, by] = pts[j + 1], nb = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.4));
                for (let q = 0; q <= nb; q++) { const x = ax + (bx - ax) * q / nb, y = ay + (by - ay) * q / nb, p0 = b._tkP(x, y, z0), p1 = b._tkP(x, y, z1); rail.moveTo(p0[0], p0[1]); rail.lineTo(p1[0], p1[1]); }
            }
            ctx.strokeStyle = SQD.IRON; ctx.lineWidth = 0.7; ctx.stroke(rail);
        }

        /** The lantern piers in front (local x, y): a stone pier and a lantern on it, drawn after the tiers (they stand nearest
            the street); at night their glow. */
        const SQD_LANTERNS = [[298, 964], [382, 964], [-20, 1018], [60, 1018], [290, 1018], [370, 1018]];
        function _sqdLanterns(ctx, e, b) {
            for (const [lx, ly] of SQD_LANTERNS) {
                const x = b.x + lx, y = b.y + ly;
                if (e) { const p = b._tkP(x, y, 15.5), k = b._tkK(15.5); drawGlow(ctx, p[0], p[1], 12 * k, '255, 226, 176', 0); continue; }
                _ashPrism(ctx, b, x - 4, y - 4, x + 4, y + 4, 0, 12, SQD.STONE.stoneMid, SQD.STONE.stoneLt);
                _ashPrism(ctx, b, x - 2.6, y - 2.6, x + 2.6, y + 2.6, 13, 18, '#bcb39b', '#2c2a36');
            }
        }

        class SilverQueenBuilding extends TieredBuilding {
            /** It keeps the 'silver_queen' style (the court's ground pass and the street trees go by it), none of the old body's settings. */
            _applyStyle(config) {
                this.style = 'silver_queen';
                this._seed = Math.round(this.x * 0.37 + this.y * 1.13);
                this.roofFeatures = [];
                this.emissiveReach = 700;                                          // the searchlights reach well past it
            }
            _setupSign() { this.attachedSign = null; }
            _generateLights() {}
            _sqPortico() { return null; }                                         // (the old portico: gone with its columns)
            /** The kit draws a group's tiers low top first; a tier standing out in front of a wall (front: the marquee) goes
                right after the one it's on instead, or that wall, below its top, would paint over it. */
            _tkOrder() {
                const order = super._tkOrder(), fronts = order.filter(t => t.front);
                if (!fronts.length) return order;
                const rest = order.filter(t => !t.front);
                for (const f of fronts) rest.splice(rest.indexOf(f.support) + 1, 0, f);
                return rest;
            }
            /** The forecourt kept clear of street trees: paving, steps, urns, the lawn and its sign. */
            _sqForecourt() { return { x: this.x - 40, y: this.y + 880, w: 430, h: 150 }; }

            /** The ground in front: the court (buildings/silver-queen.js), then the forecourt, painted once. */
            _sqDrawGround(ctx, phase) {
                if (phase === 'top') return;                              // all paving: it goes under the puddles and reflections
                this._sqDrawCourt(ctx);
                const s = LandmarkKit.sprite(this, 'sqd_forecourt', this.x - 40, this.y + 878, 430, 152, 2, (c) => this._sqdPaintForecourt(c));
                ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
            }

            _sqdPaintForecourt(c) {
                const X = (x) => this.x + x, Y = (y) => this.y + y, r = seededRandom('sqd-forecourt'), S = SQD.STONE;
                // the plaza: pale, polished slabs out to the pavement, a silver inlay line round it
                c.fillStyle = '#6b6578'; c.fillRect(X(60), Y(880), 230, 150);
                for (let y = 880; y < 1030; y += 15) for (let x = 60; x < 290; x += 23) { c.fillStyle = r() < 0.5 ? '#7a748a' : '#716b80'; c.fillRect(X(x) + 0.5, Y(y) + 0.5, 22, 14); }
                c.fillStyle = 'rgba(255, 255, 255, 0.12)'; for (let i = 0; i < 30; i++) c.fillRect(X(60 + r() * 230), Y(880 + r() * 150), 6 + r() * 12, 0.8);   // the sheen
                c.strokeStyle = SQD.SILVER_LO; c.lineWidth = 1; c.strokeRect(X(64), Y(884), 222, 150);
                _sqdFan(c, X(175), Y(1000), 26, 'rgba(110, 100, 140, 0.18)', 'rgba(110, 100, 140, 0.4)', 9);
                // the steps up to the door
                for (let k = 2; k >= 0; k--) { c.fillStyle = ['#918b9f', '#857f94', '#797388'][k]; c.fillRect(X(118 - k * 8), Y(896), 114 + k * 16, 9 + k * 6); c.fillStyle = 'rgba(70, 60, 100, 0.3)'; c.fillRect(X(118 - k * 8), Y(905 + k * 6), 114 + k * 16, 0.8); }
                // lawns and beds either side: box hedging round lavender and white flowers
                const bed = (x, y, w, h) => {
                    c.fillStyle = 'rgba(0, 0, 0, 0.25)'; c.beginPath(); c.roundRect(X(x) + 1.5, Y(y) + 2, w, h, 5); c.fill();
                    c.fillStyle = '#2c4a2e'; c.beginPath(); c.roundRect(X(x), Y(y), w, h, 5); c.fill();
                    c.fillStyle = '#3a2e2c'; c.beginPath(); c.roundRect(X(x) + 4, Y(y) + 4, w - 8, h - 8, 3); c.fill();
                    for (let k = 0; k < w * h / 18; k++) { const v = r(); c.fillStyle = v < 0.55 ? '#9a7ce0' : v < 0.75 ? '#c3b2f2' : v < 0.9 ? '#f4f1fa' : '#7aa070'; c.beginPath(); c.arc(X(x + 6 + r() * (w - 12)), Y(y + 6 + r() * (h - 12)), 1.1 + r() * 1.1, 0, Math.PI * 2); c.fill(); }
                    c.strokeStyle = 'rgba(130, 180, 120, 0.4)'; c.lineWidth = 1; c.beginPath(); c.roundRect(X(x) + 1, Y(y) + 1, w - 2, h - 2, 4); c.stroke();
                };
                c.fillStyle = '#3f6a3a'; c.fillRect(X(-40), Y(880), 100, 150); c.fillRect(X(290), Y(880), 100, 150);
                c.fillStyle = 'rgba(120, 170, 100, 0.25)'; for (let i = 0; i < 300; i++) { const x = r() < 0.5 ? -40 + r() * 100 : 290 + r() * 100; c.fillRect(X(x), Y(880 + r() * 150), 1, 1.6); }
                bed(-34, 886, 92, 24); bed(292, 886, 92, 24); bed(64, 912, 44, 30); bed(242, 912, 44, 30);
                // the urns either side of the steps: dark bronze, heaped with white flowers
                for (const ux of [104, 246]) {
                    c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.beginPath(); c.arc(X(ux) + 2, Y(900) + 2.5, 9, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#2b2830'; c.beginPath(); c.arc(X(ux), Y(900), 9, 0, Math.PI * 2); c.fill(); c.strokeStyle = SQD.SILVER_LO; c.lineWidth = 1; c.stroke();
                    for (let k = 0; k < 26; k++) { const a = r() * Math.PI * 2, rr = r() * 7; c.fillStyle = r() < 0.8 ? '#f6f3fb' : '#9dbf8f'; c.beginPath(); c.arc(X(ux) + Math.cos(a) * rr, Y(900) + Math.sin(a) * rr, 1.3, 0, Math.PI * 2); c.fill(); }
                }
                // the lantern posts' footings along the pavement edge
                for (const lx of [-20, 60, 290, 370]) { c.fillStyle = 'rgba(0, 0, 0, 0.3)'; c.beginPath(); c.arc(X(lx) + 1.5, Y(1018) + 2, 5, 0, Math.PI * 2); c.fill(); c.fillStyle = S.stoneMid; c.fillRect(X(lx) - 4, Y(1018) - 4, 8, 8); }
            }

            drawTop(ctx, worldMinutes) {
                super.drawTop(ctx, worldMinutes);
                if (CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera) _sqdLanterns(ctx, false, this);
            }

            /** Night: the tiers' light, then the court's and forecourt's lamps, and the searchlights (those alone when it's far off). */
            drawEmissive(ctx, dark, beamsOnly) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                if (!beamsOnly) {
                    super.drawEmissive(ctx, dark, false);
                    this._sqdGroundGlow(ctx, dark);
                }
                this._sqDrawBeams(ctx, dark);
            }

            /** The court's fountain and bollards, the forecourt's lanterns and urns, at night. */
            _sqdGroundGlow(ctx, dark) {
                if (dark < 0.05) return;
                const glow = Math.max(0.12, Math.min(0.92, dark * 1.05)), C = this._sqCourt();
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (C) {
                    glowA(ctx, C.fx, C.fy, C.fr + 40, '150, 130, 255', 0.3 * glow); glowA(ctx, C.fx, C.fy, 22, '230, 220, 255', 0.45 * glow);
                    const D = C.drive;
                    for (const [bx, by] of [[D.x - 6, D.y + 14], [D.x + D.w + 6, D.y + 14], [D.x - 6, D.y + D.h - 16], [D.x + D.w + 6, D.y + D.h - 16]]) { glowA(ctx, bx, by, 26, '220, 200, 255', 0.4 * glow); glowA(ctx, bx, by, 6, '255, 250, 255', 0.8 * glow); }
                }
                for (const [lx, ly] of SQD_LANTERNS) glowA(ctx, this.x + lx, this.y + ly, 30, '255, 220, 170', 0.3 * glow);
                ctx.globalAlpha = Math.min(1, glow); _sqdLanterns(ctx, true, this);
                glowA(ctx, this.x + 175, this.y + 960, 90, '255, 214, 160', 0.18 * glow);                                     // the plaza, under the marquee's light
                ctx.restore();
            }

            /** Two violet searchlights sweeping the sky from the crown's front corners. */
            _sqDrawBeams(ctx, dark) {
                if (dark < 0.2 || _zoomLOD >= 2) return;
                const t = _gameTimeSec, a = Math.min(1, (dark - 0.2) / 0.3), z0 = SQD.Z.CROWN + 2;
                const srcs = [[this.x + 278, this.y + 446, 0], [this.x + 422, this.y + 446, 2.3]];
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
                for (const [sx, sy, ph] of srcs) {
                    const az = -Math.PI / 2 + (ph ? 0.45 : -0.45) + Math.sin(t * 0.19 + ph) * 0.95, elev = 1.02 + 0.16 * Math.sin(t * 0.11 + ph * 1.7);
                    const C = leanCamHeight(), zTop = C * 0.8, run = (zTop - z0) / Math.tan(elev);
                    const p0 = this._tkP(sx, sy, z0), cam = game.camera, k1 = C / (C - Math.min(zTop, C * 0.86)), ex = sx + Math.cos(az) * run, ey = sy + Math.sin(az) * run;
                    const p1 = [cam.x + (ex - cam.x) * k1, cam.y + (ey - cam.y) * k1];
                    const vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
                    const beam = (w0, w1, c0, c1) => {
                        const gr = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); gr.addColorStop(0, c0); gr.addColorStop(0.3, c1); gr.addColorStop(1, 'rgba(120,70,255,0)');
                        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(p0[0] + nx * w0, p0[1] + ny * w0); ctx.lineTo(p1[0] + nx * w1, p1[1] + ny * w1); ctx.lineTo(p1[0] - nx * w1, p1[1] - ny * w1); ctx.lineTo(p0[0] - nx * w0, p0[1] - ny * w0); ctx.closePath(); ctx.fill();
                    };
                    const w1 = Math.max(60, L * 0.13);
                    beam(6, w1, `rgba(200,168,255,${0.2 * a})`, `rgba(164,105,255,${0.07 * a})`);
                    beam(2, w1 * 0.3, `rgba(246,236,255,${0.32 * a})`, `rgba(200,168,255,${0.08 * a})`);
                    glowA(ctx, p0[0], p0[1], 14, '255, 248, 255', 0.9 * a);
                }
                ctx.restore();
            }
        }
        TierKit.profile(SilverQueenBuilding);

        /** The Silver Queen: x, y its corner; it fronts south. */
        function createSilverQueen(x, y, config = {}) {
            const S = SQD.STONE, Z = SQD.Z, P = SQD.PLAN;
            const stoneLedges = (z1, belt = true) => [
                { z: 2.4, out: 1.2, th: 2.4, top: S.stoneLo, band: [110, 105, 125] },
                ...(belt ? [{ z: SQD.G, out: 2, th: 2.6, top: S.trim, band: [160, 157, 170], lip: S.stoneHi }] : []),
                { z: z1, out: 4, th: 4.5, top: S.trim, band: [172, 169, 182], lip: '#d8d5e2' }
            ];
            const upper = (z1) => [{ z: z1, out: 3.5, th: 4, top: S.trim, band: [172, 169, 182], lip: '#d8d5e2' }];
            const near = (v, list, tol = 4) => list.some(w => Math.abs(v - w) < tol);
            // where the balconies stand: [face, bay rule, floors]
            const towerBalc = (e, k, n, f, [lx, ly]) =>
                (e.ny > 0.99 && lx > 360 && near(lx, [408, 525, 642], 6) && f >= 35) ||           // the front, over the court
                (e.ny > 0.99 && lx < 350 && near(lx, [58, 292], 6) && f >= 100) ||                 // the front, over the wing
                (e.nx > 0.99 && (k === 2 || k === 6 || k === 10) && (f - 22) % 26 === 0);          // the east side, every other floor
            const wingBalc = (e, k, n, f, [lx, ly]) =>
                (e.ny > 0.99 && k === 1 && f !== SQD.G) ||                                         // the front: a stack beside the pavilion
                (e.nx > 0.99 && (k === 2 || k === 7) && f !== SQD.G) ||                            // over the court
                (e.nx < -0.99 && (k === 2 || k === 7) && (f - 22) % 26 === 13);                    // the west side
            const wallPaint = (opt) => (d, l, t, H, L) => _sqdWall(d, l, t, H, L, opt);
            const cypress = (id, lx, ly) => ({ id, solid: false, poly: Array.from({ length: 8 }, (_, i) => [lx + Math.cos(-i * Math.PI / 4) * 9, ly + Math.sin(-i * Math.PI / 4) * 9]), z0: 0, z1: 7, S: 3, fill: '#2b2830',
                paint: _sqdPlain('#2b2830', SQD.SILVER), shade: [20, 16, 30], roof: (c, e, t) => { if (!e) { _sqdPolyPath(c, t.poly); c.fillStyle = '#2a2018'; c.fill(); } }, top: _ecCypress, rise: 50 });
            const b = new SilverQueenBuilding({
                id: 'silver_queen', x, y, label: 'Silver Queen Apts', type: 'apartment', style: 'silver_queen', facing: 'S', hero: SQD.HERO, plan: P,
                roofColor: '#3d3a4b', roofLightColor: '#55516a', wallColor: S.stone, wallLightColor: S.stoneLt, accentColor: '#8142ff',
                windowColor: '#2a3a42', windowLitColor: SQD.WARM, windowFrameColor: S.frame, balconies: [], roofProps: [{ type: 'vent', section: 0, x: 20, y: 20, w: 1, h: 1 }],
                sign: { text: 'Silver Queen', color: '#8142ff', size: 32 },
                door: { target: config.doorTarget || 'apt_949', label: 'Enter Apartment', lightColor: null },
                tiers: [
                    // the ground tiers, in this order: the court is the L between the first two (_sqCourt, buildings/silver-queen.js)
                    { id: 'tower', rect: [0, 0, 700, 500], z0: 0, z1: Z.TOWER, S: 2, fill: S.stoneMid, paint: wallPaint({ seed: 11, balc: towerBalc, uplights: true }), ledges: stoneLedges(Z.TOWER),
                      shade: [40, 30, 70], roofRes: 1, roofGlow: true, roof: (c, e, t) => _sqdTerrace(c, e, t, { seed: 7, planters: true, lamps: true }),
                      top: (ctx, e, t, b2) => _sqdBalconies(ctx, e, t, b2, towerBalc) },
                    { id: 'wingE', rect: [225, 500, 125, 380], z0: 0, z1: Z.WING, S: 2, fill: S.stoneMid, paint: wallPaint({ seed: 23, balc: wingBalc, uplights: true }), ledges: stoneLedges(Z.WING),
                      shade: [40, 30, 70], roofRes: 1, roofGlow: true, roof: (c, e, t) => _sqdWingRoof(c, e, t, 13), top: (ctx, e, t, b2) => _sqdBalconies(ctx, e, t, b2, wingBalc) },
                    { id: 'wingW', rect: [0, 500, 125, 380], z0: 0, z1: Z.WING, S: 2, fill: S.stoneMid, paint: wallPaint({ seed: 29, balc: wingBalc, uplights: true }), ledges: stoneLedges(Z.WING),
                      shade: [40, 30, 70], roofRes: 1, roofGlow: true, roof: (c, e, t) => _sqdWingRoof(c, e, t, 19), top: (ctx, e, t, b2) => _sqdBalconies(ctx, e, t, b2, wingBalc) },
                    { id: 'pavilion', rect: [125, 500, 100, 396], z0: 0, z1: Z.PAV, S: 3, fill: S.stoneMid, paint: _sqdPavilion, ledges: stoneLedges(Z.PAV), shade: [40, 30, 70],
                      roofRes: 1, roofGlow: true, roof: (c, e, t) => _sqdDarkRoof(c, e, t, { hex: 26, dy: 120 }),
                      top: (ctx, e, t, b2) => _sqdCrest(ctx, e, b2, b2.x + 175, b2.y + 896, Z.PAV + 1, 24), rise: 26 },
                    // the marquee over the door
                    { id: 'marquee', on: 'pavilion', front: true, solid: false, poly: TierKit.bay(92, 258, 896, 2, 30, 8), z0: SQD.G - 1, z1: SQD.G + 9, S: 4, fill: SQD.CHAR, paint: _sqdMarquee, shade: [10, 8, 18],
                      ledges: [{ z: SQD.G + 9, out: 1.2, th: 1.4, top: SQD.SILVER, band: [150, 147, 162], lip: SQD.SILVER_HI }], roofRes: 3, roofGlow: true, roof: _sqdMarqueeRoof,
                      top: _sqdMarqueeRail },
                    // the setback over the tower, and the crown on that
                    { id: 'setback', on: 'tower', rect: [30, 20, 640, 440], z0: Z.TOWER, z1: Z.SET, S: 2, fill: S.stoneMid, paint: wallPaint({ seed: 37 }), ledges: upper(Z.SET), shade: [40, 30, 70],
                      roofRes: 1, roofGlow: true, roof: _sqdSetbackRoof },
                    { id: 'crown', on: 'setback', rect: [270, 230, 160, 230], z0: Z.SET, z1: Z.CROWN, S: 3, fill: S.stoneMid, paint: _sqdCrown, ledges: upper(Z.CROWN), shade: [40, 30, 70],
                      roofRes: 1.5, roofGlow: true, roof: (c, e, t) => _sqdDarkRoof(c, e, t, { hex: 40, dy: -10, pw: 6 }),
                      top: (ctx, e, t, b2) => _sqdCrest(ctx, e, b2, b2.x + 350, b2.y + 460, Z.CROWN + 1, 34, 11), rise: 36 },
                    // the forecourt's pieces: cypresses by the door, the monument on the lawn, lantern posts on the pavement edge
                    cypress('cypW', 84, 926), cypress('cypE', 266, 926),
                    { id: 'monument', solid: false, rect: [300, 960, 80, 8], z0: 0, z1: 12, S: 4, fill: S.stoneMid, paint: _sqdMonument, shade: [40, 30, 70],
                      ledges: [{ z: 12, out: 1, th: 1.4, top: S.trim, band: [172, 169, 182], lip: '#d8d5e2' }], roof: (c, e, t) => { if (!e) { _sqdPolyPath(c, t.poly); c.fillStyle = S.stoneLt; c.fill(); } } },
                ],
                ...config,
                facing: 'S'   // (a landmark keeps its own front, whatever street it's placed on)
            });
            for (const t of b._tkDefs) t.owner = b;                                                          // (the painters find their bays in the building's frame)
            // its lights (light only, no fixtures): the door under the marquee, the marquee's downlights, the plaza, the court, the lanterns
            const C = b._sqCourt();
            for (const [lx, ly, color, r] of [[175, 914, '#ffe2b8', 200], [118, 930, '#ffe8c8', 110], [232, 930, '#ffe8c8', 110], [175, 990, '#ffe0b0', 140],
                                              [60, 1018, '#ffdcae', 110], [290, 1018, '#ffdcae', 110], [340, 975, '#ffdcae', 110], [40, 890, '#c8b4ff', 120], [310, 890, '#c8b4ff', 120]]) {
                const lamp = new LampEntity({ x: b.x + lx, y: b.y + ly, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; lamp.visible = false; b.attachedLights.push(lamp);
            }
            if (C) for (const [lx, ly, color, r] of [[C.fx, C.fy, '#b9a4ff', 170], [C.x + 60, C.y + C.h * 0.45, '#ffe2b8', 160]]) {
                const lamp = new LampEntity({ x: lx, y: ly, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; lamp.visible = false; b.attachedLights.push(lamp);
            }
            b.topReach = 160; b.glowReach = 160;
            b.viewDrift = true;   // out in front of it, the view drifts toward it (engine/draw.js _landmarkDriftTarget)
            return b;
        }

        BuildingV2Registry.register('silver_queen', {
            factory: createSilverQueen,
            sections: [{ x: 0, y: 0, w: 700, h: 500 }, { x: 0, y: 500, w: 350, h: 396 }],
            accentColor: '#8142ff', label: 'Silver Queen Apts', type: 'apartment', category: 'residential', floors: 14,
            sign: { text: 'Silver Queen', color: '#8142ff', size: 32 },
            door: { target: 'apt_949', label: 'Enter Apartment', lightColor: '#9900ff' },
            apron: { x: -40, y: 880, w: 430, h: 150 }   // the forecourt: paving, steps, beds, cypresses, the sign (SilverQueenBuilding._sqdPaintForecourt)
        });
