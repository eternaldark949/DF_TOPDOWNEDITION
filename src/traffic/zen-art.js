        /* =====================================================================
           ZEN ART — the Zenxera supercars, cut like jewels (traffic/car-art.js
           paints them into each car's sprite)
           ---------------------------------------------------------------------
           Three designs, one per model, every one built of flat planes, each
           plane one shade of the paint as it faces the light (from the front
           left), creases picked out in the brand's cyan:
             prism   (Stratos, Freighter)  a Countach wedge: flat nose, fender
                     crests, notched side intakes, a kite canopy, a louvred deck
             gem     (Apex)  cut like a brilliant: a crystal table canopy with
                     star facets, facets fanning out to an octagonal girdle,
                     diamond jewel lamps
             arrow   (Bolt)  a Ferrari arrowhead: pointed nose, big angular
                     haunches, a faceted teardrop canopy, glowing side blades
           Everything is drawn in the design's own units (63 × 36, the Bolt's
           size, nose at +31.5, y to the right) and scaled to the car.
           ===================================================================== */
        const ZenArt = (() => {
            const U = { L: 63, W: 36 }, CY = '#00f3ff';
            const DESIGN = { sports: 'arrow', sedan: 'prism', suv: 'gem', truck: 'prism' };
            const OUTLINE = {                                           // the +y half, nose to tail
                prism: [[31.5, 0], [31.5, 6.5], [29, 13], [22, 17.5], [6, 18], [2, 15.5], [-7, 15.5], [-11, 18], [-27, 18], [-31.5, 14], [-31.5, 0]],
                gem:   [[31.5, 0], [30, 7], [25, 14], [16, 18], [-14, 18], [-25, 16], [-31.5, 9], [-31.5, 0]],
                arrow: [[31.5, 0], [30, 4.5], [21, 11], [11, 14], [2, 14.5], [-9, 18], [-24, 18], [-30, 15], [-31.5, 9], [-31.5, 0]]
            };
            /** Lamps (live: drawn each frame in drawCarLamps): a stroke (a, b) or a filled shape (pts), on the +y side unless whole */
            const LAMPS = {
                prism: { head: { a: [31.5, 3], b: [30.6, 11], w: 1.1 }, tail: { a: [-31.7, -13], b: [-31.7, 13], w: 1, whole: true } },
                gem:   { head: { pts: [[31.4, 9], [29.6, 10.3], [27.8, 9], [29.6, 7.7]] }, tail: { pts: [[-28.8, 11.5], [-30.6, 12.8], [-32.4, 11.5], [-30.6, 10.2]] } },
                arrow: { head: { a: [30.6, 3], b: [24, 9], w: 1.1 }, tail: { pts: [[-31.8, 2.5], [-30.4, 14], [-29.4, 13], [-30.8, 2.5]] } }
            };
            const mix = (P, k) => { const t = k > 0 ? 255 : 0, a = Math.min(1, Math.abs(k)); return `rgb(${P.map(v => Math.round(v + (t - v) * a)).join(',')})`; };
            const mirror = pts => [...pts, ...pts.slice().reverse().map(([x, y]) => [x, -y])];
            function poly(c, pts, fill, stroke, lw) {
                c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
                if (fill) { c.fillStyle = fill; c.fill(); }
                if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 0.3; c.stroke(); }
            }
            /** Draw f for the +y half and again mirrored (s: +1 / -1) */
            const both = (pts, f) => { f(pts, 1); f(pts.map(([x, y]) => [x, -y]), -1); };
            function line(c, pts) { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.stroke(); }
            function glass(c, pts, x0, x1) {
                const g = c.createLinearGradient(x0, -6, x1, 6);
                g.addColorStop(0, '#3a3f7a'); g.addColorStop(0.35, '#0c0b1e'); g.addColorStop(0.7, '#141236'); g.addColorStop(1, '#2a2160');
                poly(c, pts, g);
            }

            const PAINT = {
                prism(c, P, truck) {
                    const out = mirror(OUTLINE.prism);
                    poly(c, out, mix(P, -0.15));
                    both([[31.5, 0], [31.5, 6.5], [13, 9], [13, 0]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.05 : 0.28)));             // hood planes
                    both([[31.5, 6.5], [29, 13], [22, 17.5], [13, 13.5], [13, 9]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.22 : 0.12)));  // fender crests
                    both([[22, 17.5], [6, 18], [2, 15.5], [-7, 15.5], [-11, 18], [-27, 18], [-20, 12], [-10, 8], [4, 9], [13, 13.5]],
                         (p, s) => poly(c, p, mix(P, s > 0 ? -0.35 : 0)));                                                             // flanks
                    both([[-27, 18], [-31.5, 14], [-31.5, 0], [-27, 0], [-24, 9], [-20, 12]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.3 : 0.05)));   // tail planes
                    both([[6, 18], [2, 15.5], [-7, 15.5], [-11, 18]], p => poly(c, p, '#0a0812'));                                      // intakes
                    const can = [[13, 0], [8, 8], [-10, 8], [-14, 0], [-10, -8], [8, -8]];
                    glass(c, can, 13, -14);
                    poly(c, [[13, 0], [8, 8], [8, -8]], 'rgba(150,170,255,0.18)');                                                     // windscreen facet
                    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 0.35; line(c, [[8, 8], [-14, 0], [8, -8]]);
                    if (truck) {                                                                                                        // the Freighter: a faceted cab, then its bed
                        poly(c, [[-14, 0], [-10, 9], [-30, 13], [-30, -13], [-10, -9]], '#17141d');
                        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.6;
                        for (let y = -10; y <= 10; y += 3.4) line(c, [[-13, y * 0.85], [-29, y * 1.15]]);
                        poly(c, [[-14, 0], [-10, 9], [-30, 13], [-30, -13], [-10, -9]], null, mix(P, -0.2), 1.2);
                    } else {
                        poly(c, [[-14, 0], [-10, 8], [-24, 9], [-27, 0], [-24, -9], [-10, -8]], mix(P, -0.45));                        // engine deck…
                        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.7; for (let x = -15; x > -25; x -= 2) line(c, [[x, -7], [x, 7]]);   // …louvred
                    }
                    c.strokeStyle = CY; c.globalAlpha = 0.6; c.lineWidth = 0.35;                                                        // cyan seams down the creases
                    both([[31.5, 6.5], [13, 9], [4, 9], [-10, 8], [-24, 9], [-27, 18]], p => line(c, p)); c.globalAlpha = 1;
                    poly(c, out, null, 'rgba(0,0,0,0.7)', 0.6);
                    for (const s of [-1, 1]) poly(c, [[31.7, 3 * s], [30.8, 11 * s], [30, 11 * s], [30.9, 3 * s]], '#14121c');          // lamp housings
                },
                gem(c, P) {
                    const out = mirror(OUTLINE.gem);
                    poly(c, out, mix(P, -0.1));
                    const F = [[[31.5, 0], [30, 7], [14, 0]], [[30, 7], [25, 14], [8, 7.5], [14, 0]], [[25, 14], [16, 18], [8, 7.5]], [[16, 18], [-14, 18], [-8, 7.5], [8, 7.5]],
                               [[-14, 18], [-25, 16], [-8, 7.5]], [[-25, 16], [-31.5, 9], [-15, 0], [-8, 7.5]], [[-31.5, 9], [-31.5, 0], [-15, 0]]];
                    const K = [0.3, 0.12, -0.05, -0.25, 0, -0.15, -0.3];
                    F.forEach((f, i) => both(f, (p, s) => poly(c, p, mix(P, s > 0 ? K[i] - 0.25 : K[i] + 0.12), 'rgba(255,255,255,0.12)', 0.3)));
                    const tab = mirror([[14, 0], [8, 7.5], [-8, 7.5], [-15, 0]]);                                                    // the crystal table
                    const g = c.createLinearGradient(14, -8, -15, 8);
                    g.addColorStop(0, '#7af7ff'); g.addColorStop(0.3, '#2b2c78'); g.addColorStop(0.6, '#120f2e'); g.addColorStop(1, '#7a4fd8');
                    poly(c, tab, g);
                    c.strokeStyle = 'rgba(200,250,255,0.45)'; c.lineWidth = 0.3;                                                       // its star facets
                    for (const q of [[14, 0], [8, 7.5], [-8, 7.5], [-15, 0], [-8, -7.5], [8, -7.5]]) line(c, [[-0.5, 0], q]);
                    poly(c, tab, null, CY, 0.45);
                    poly(c, out, null, 'rgba(0,0,0,0.7)', 0.6);
                    for (const d of [LAMPS.gem.head, LAMPS.gem.tail]) both(d.pts, p => poly(c, p, '#14121c', 'rgba(255,255,255,0.7)', 0.4));   // the jewel lamps' settings
                },
                arrow(c, P) {
                    const out = mirror(OUTLINE.arrow);
                    poly(c, out, mix(P, -0.12));
                    both([[31.5, 0], [30, 4.5], [21, 11], [14, 6], [14, 0]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.1 : 0.3)));           // nose planes
                    both([[21, 11], [11, 14], [2, 14.5], [-2, 9], [9, 6.5], [14, 6]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.3 : 0.05)));  // waist
                    both([[2, 14.5], [-9, 18], [-24, 18], [-20, 10], [-2, 9]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.05 : 0.32)));        // haunch tops, lit
                    both([[-24, 18], [-30, 15], [-31.5, 9], [-31.5, 0], [-22, 0], [-20, 10]], (p, s) => poly(c, p, mix(P, s > 0 ? -0.35 : -0.05)));   // haunch backs
                    const can = [[15, 0], [9, 6.5], [-2, 7.5], [-12, 6], [-19, 0], [-12, -6], [-2, -7.5], [9, -6.5]];
                    glass(c, can, 15, -19);
                    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.35;
                    for (const x of [9, -2, -12]) { const y = x === 9 ? 6.5 : x === -2 ? 7.5 : 6; line(c, [[x, y], [x, -y]]); }
                    poly(c, [[15, 0], [9, 6.5], [9, -6.5]], 'rgba(150,170,255,0.16)');
                    poly(c, [[-19, 0], [-22, 4], [-30, 2], [-30, -2], [-22, -4]], mix(P, -0.5));                                       // the spine fin
                    for (const s of [-1, 1]) {                                                                                          // the side blades, glowing
                        const g = c.createRadialGradient(1, 15.5 * s, 0, 1, 15.5 * s, 6); g.addColorStop(0, 'rgba(0,243,255,0.5)'); g.addColorStop(1, 'rgba(0,243,255,0)');
                        c.fillStyle = g; c.fillRect(-5, 15.5 * s - 6, 12, 12);
                        c.strokeStyle = CY; c.lineWidth = 0.9; line(c, [[9, 13.6 * s], [-6, 16.8 * s]]);
                    }
                    poly(c, out, null, 'rgba(0,0,0,0.7)', 0.6);
                    for (const s of [-1, 1]) poly(c, [[31, 2.6 * s], [24.6, 8.4 * s], [23.6, 9.4 * s], [30.2, 3.4 * s]], '#14121c');   // lamp housings
                }
            };

            return {
                design: v => v.visualStyle === 'angular' ? DESIGN[v.model] || 'prism' : null,
                /** The body outline, scaled to the car */
                path(p, d, L, W) {
                    const kx = L / U.L, ky = W / U.W;
                    mirror(OUTLINE[d]).forEach(([x, y], i) => i ? p.lineTo(x * kx, y * ky) : p.moveTo(x * kx, y * ky)); p.closePath();
                },
                paint(c, d, rgb, L, W, truck) {
                    c.save(); c.scale(L / U.L, W / U.W); PAINT[d](c, rgb, truck); c.restore();
                },
                /** The lit lamps (part 'head' or 'tail'), in the current fill colour */
                lamps(ctx, d, part, L, W) {
                    const m = LAMPS[d][part];
                    ctx.save(); ctx.scale(L / U.L, W / U.W); ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = 'round';
                    const sides = m.whole ? [1] : [-1, 1];
                    for (const s of sides) {
                        if (m.pts) poly(ctx, m.pts.map(([x, y]) => [x, y * s]), ctx.fillStyle);
                        else { ctx.lineWidth = m.w; line(ctx, [[m.a[0], m.a[1] * s], [m.b[0], m.b[1] * s]]); }
                    }
                    ctx.restore();
                },
                /** How far out the front tyres' centres sit (the arrow's nose is narrow: they tuck in under it) */
                frontTyreY: (d, W) => W / 2 * (d === 'arrow' ? 0.66 : 1) - 0.4,
                /** Where the lamps glow (car frame): [x, y] of the +y side's head and tail */
                glowAt(d, part, L, W) {
                    const m = LAMPS[d][part], pts = m.pts || [m.a, m.b];
                    const x = pts.reduce((a, p) => a + p[0], 0) / pts.length, y = m.whole ? 7 : pts.reduce((a, p) => a + p[1], 0) / pts.length;
                    return [x * L / U.L, y * W / U.W];
                }
            };
        })();
