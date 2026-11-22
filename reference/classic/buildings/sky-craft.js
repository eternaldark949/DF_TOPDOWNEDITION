        // =====================================================================
        //  SKY CRAFT — hand-drawn spaceships from the sketchbook
        // =====================================================================
        //  Wobbly double-stroke ink, pencil hatching on the shade side and curly
        //  smoke, coloured with the game's neon palette. Each craft is drawn around
        //  (0,0) facing +x, about 220 px long. Used by SkyLayer._drawAirship.
        const SkyCraft = (() => {
            let glowK = 1;      // glows dim in daylight
            const P = { violet: '#b58cff', cyan: '#3fe3ff', gold: '#ffcf6a', pink: '#ff6fb5', mint: '#7dffc4',
                orange: '#ff7a1a', ink: '#3b1f6b', paper: '#fff6e6',
                weight: 0.7 };   // violet ink at a light pen weight sits closer to the city's thin neon lines than black
            const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
            const mix = (h, h2, k) => { const a = parseInt(h.slice(1), 16), b = parseInt(h2.slice(1), 16);
                const c = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
                return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1); };

            // --- shape point builders -------------------------------------------------
            const ell = (cx, cy, rx, ry, n = 36, a0 = 0, a1 = Math.PI * 2) => {
                const p = []; const closed = a1 - a0 >= Math.PI * 2 - 1e-6;
                for (let i = 0; i < (closed ? n : n + 1); i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
                return p;
            };
            const rrect = (x, y, w, h, r) => [...ell(x + w - r, y + r, r, r, 6, -Math.PI / 2, 0), ...ell(x + w - r, y + h - r, r, r, 6, 0, Math.PI / 2),
                ...ell(x + r, y + h - r, r, r, 6, Math.PI / 2, Math.PI), ...ell(x + r, y + r, r, r, 6, Math.PI, Math.PI * 1.5)];
            // subdivide so the wobble reads along long straight edges
            const dens = (pts, closed, step = 7) => {
                const out = []; const n = pts.length;
                for (let i = 0; i < (closed ? n : n - 1); i++) {
                    const a = pts[i], b = pts[(i + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
                    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
                }
                if (!closed) out.push(pts[n - 1]);
                return out;
            };
            const wob = (pts, amp, seed) => pts.map(([x, y], i) => [x + amp * Math.sin(i * 1.71 + seed * 3.1 + y * 0.05), y + amp * Math.cos(i * 1.33 + seed * 2.3 + x * 0.05)]);
            const trace = (ctx, pts, closed) => { ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1])); if (closed) ctx.closePath(); };

            // --- ink primitives -------------------------------------------------------
            function fill(ctx, pts, style) { trace(ctx, pts, true); ctx.fillStyle = style; ctx.fill(); }
            // Two offset passes like a pen going round twice; the second is thinner and lighter.
            function ink(ctx, pts, closed = true, w = 2.6, col = P.ink, seed = 1) {
                const d = dens(pts, closed);
                if (col === P.ink) w *= P.weight;
                ctx.lineJoin = ctx.lineCap = 'round';
                // faint paper-coloured halo under the ink so outlines still read over the dark city
                if (w >= 2) { ctx.strokeStyle = 'rgba(255,246,230,0.22)'; ctx.lineWidth = w + 3; trace(ctx, d, closed); ctx.stroke(); }
                ctx.strokeStyle = col; ctx.lineWidth = w; trace(ctx, wob(d, 0.9, seed), closed); ctx.stroke();
                const a = ctx.globalAlpha; ctx.globalAlpha = a * 0.55; ctx.lineWidth = w * 0.45;
                trace(ctx, wob(d, 1.6, seed + 7), closed); ctx.stroke(); ctx.globalAlpha = a;
            }
            // Diagonal pencil hatching inside a shape, only below the line y > from (the shade side)
            function hatch(ctx, pts, from, gap = 4.5, col = rgba(P.ink, 0.55), ang = 0.9) {
                ctx.save(); trace(ctx, pts, true); ctx.clip();
                let x0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
                ctx.beginPath(); ctx.rect(x0 - 2, from, x1 - x0 + 4, y1 - from + 2); ctx.clip();
                ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
                const h = y1 - from + 4, s = Math.tan(ang) * h;
                for (let x = x0 - s; x < x1 + 4; x += gap) { ctx.moveTo(x, y1 + 2); ctx.lineTo(x + s + Math.sin(x) * 1.5, from - 2); }
                ctx.stroke(); ctx.restore();
            }
            function glow(ctx, x, y, r, col, a = 0.8) {
                a *= glowK;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            function porthole(ctx, x, y, r, lit, t, seed) {
                const on = lit * (0.75 + 0.25 * Math.sin(t * 2 + seed));
                glow(ctx, x, y, r * 2.4, P.gold, 0.35 * on);
                const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
                g.addColorStop(0, mix('#3a2850', '#fffbe8', on)); g.addColorStop(1, mix('#2a1840', P.gold, on));
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = P.ink; ctx.lineWidth = 1.3; ctx.stroke();
            }
            // Curly smoke: a trail of little loops that drift and fade behind the craft (towards -x)
            function curls(ctx, x, y, t, col, n = 5, size = 7) {
                ctx.lineCap = 'round';
                for (let i = 0; i < n; i++) {
                    const age = (i + (t * 1.2) % 1), cx = x - age * size * 2.6, cy = y + Math.sin(age * 1.7 + t) * size * 0.6, r = size * (0.5 + age * 0.22);
                    ctx.strokeStyle = rgba(col, Math.max(0, 0.75 - age * 0.14)); ctx.lineWidth = Math.max(0.6, 2.2 - age * 0.3);
                    ctx.beginPath();
                    for (let k = 0; k <= 22; k++) { const a = k / 22 * Math.PI * 3.2 + i, rr = r * (1 - k / 30); ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
                    ctx.stroke();
                }
            }
            function speedLines(ctx, x, y, len, spread, t, col = 'rgba(255,255,255,0.7)') {
                ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
                for (let i = -1; i <= 1; i++) { const o = ((t * 60 + i * 23) % 14); ctx.beginPath(); ctx.moveTo(x - o, y + i * spread); ctx.lineTo(x - o - len * (1 - Math.abs(i) * 0.3), y + i * spread); ctx.stroke(); }
            }
            function eye(ctx, x, y, r, t, seed, look = 0.3) {
                const blink = ((t + seed) % 4.2) < 0.14 ? 0.12 : 1;
                const lid = [...ell(x, y, r, r * 0.62 * blink, 14, Math.PI, Math.PI * 2), ...ell(x, y, r, r * 0.62 * blink, 14, 0, Math.PI)];
                fill(ctx, lid, P.paper);
                if (blink > 0.5) {
                    ctx.save(); trace(ctx, lid, true); ctx.clip();
                    fill(ctx, ell(x + r * look, y, r * 0.42, r * 0.42, 14), P.cyan);
                    fill(ctx, ell(x + r * look, y, r * 0.2, r * 0.2, 10), P.ink);
                    fill(ctx, ell(x + r * look - r * 0.12, y - r * 0.14, r * 0.08, r * 0.08, 6), '#fff');
                    ctx.restore();
                }
                ink(ctx, lid, true, 1.8, P.ink, seed);
            }

            // --- the craft ------------------------------------------------------------
            // All drawn around (0,0) facing +x, roughly 220 px long like the old zeppelin.
            const CRAFT = {
                // Tin-can canister with ring collars, porthole row and a curly exhaust
                canister(ctx, t, o) {
                    const body = o.body || P.cyan, band = o.band || P.pink;
                    curls(ctx, -82, 0, t, mix(body, '#ffffff', 0.5), 6, 8);
                    glow(ctx, -76, 0, 26, P.gold, 0.7);
                    const noz = [[-62, -12], [-80, -17], [-80, 17], [-62, 12]];
                    fill(ctx, noz, '#3a2a48'); ink(ctx, noz, true, 2.2);
                    const hull = rrect(-64, -24, 128, 48, 10);
                    const g = ctx.createLinearGradient(0, -24, 0, 24); g.addColorStop(0, mix(body, '#ffffff', 0.45)); g.addColorStop(0.5, body); g.addColorStop(1, mix(body, P.ink, 0.35));
                    fill(ctx, hull, g); hatch(ctx, hull, 8);
                    const nose = ell(64, 0, 22, 22, 18, -Math.PI / 2, Math.PI / 2);
                    fill(ctx, [...nose, [64, 22]], mix(body, '#ffffff', 0.2)); hatch(ctx, [...nose, [64, 22]], 6); ink(ctx, nose, false, 2.6);
                    for (const bx of [-44, 30]) {
                        const r = rrect(bx, -28, 14, 56, 4); fill(ctx, r, band); hatch(ctx, r, 10, 3.5); ink(ctx, r, true, 2.2, P.ink, bx);
                        for (const s of [-1, 1]) { fill(ctx, ell(bx + 7, s * 28, 3.4, 3.4, 8), P.gold); ink(ctx, ell(bx + 7, s * 28, 3.4, 3.4, 8), true, 1.3); }
                    }
                    ink(ctx, hull, true, 2.8, P.ink, 2);
                    for (let i = 0; i < 3; i++) porthole(ctx, -16 + i * 14, -4, 4.6, 1, t, i);
                    // hand-drawn rivet dashes
                    ctx.strokeStyle = rgba(P.ink, 0.6); ctx.lineWidth = 1.2; ctx.setLineDash([2, 5]);
                    ctx.beginPath(); ctx.moveTo(-26, 14); ctx.lineTo(26, 14); ctx.stroke(); ctx.setLineDash([]);
                },

                // Three bean pods flying in a little V with speed lines
                beans(ctx, t, o) {
                    const cols = o.cols || [P.pink, P.gold, P.mint];
                    const spots = [[34, 0], [-22, -36], [-22, 36]];
                    spots.forEach(([x, y], i) => {
                        const bob = Math.sin(t * 2.4 + i * 1.9) * 3;
                        ctx.save(); ctx.translate(x, y + bob); ctx.rotate(Math.sin(t * 1.3 + i) * 0.06);
                        speedLines(ctx, -36, 0, 22, 7, t + i * 0.3);
                        const bean = [...ell(0, 0, 32, 15, 20, Math.PI, Math.PI * 2).map(([px, py]) => [px, py - 2 * Math.cos(px / 32 * 1.6)]),
                            ...ell(0, 0, 32, 15, 20, 0, Math.PI).map(([px, py]) => [px, py + 3 * Math.cos(px / 32 * 1.6)])];
                        const c = cols[i % cols.length];
                        const g = ctx.createLinearGradient(0, -15, 0, 15); g.addColorStop(0, mix(c, '#ffffff', 0.5)); g.addColorStop(1, mix(c, P.ink, 0.3));
                        fill(ctx, bean, g); hatch(ctx, bean, 5, 4);
                        ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 2, 24, -2.6, -1.9); ctx.stroke();
                        ink(ctx, bean, true, 2.4, P.ink, i + 3);
                        porthole(ctx, 6, -2, 3.8, 1, t, i); porthole(ctx, 18, -1, 3.2, 1, t, i + 2);
                        glow(ctx, -32, 0, 10, c, 0.9);
                        ctx.restore();
                    });
                },

                // Folded paper dart with a crease, two-tone faces and a loopy flight trail
                paperPlane(ctx, t, o) {
                    const c = o.body || P.violet;
                    ctx.strokeStyle = rgba('#ffffff', 0.65); ctx.lineWidth = 1.6; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
                    ctx.beginPath(); ctx.moveTo(-70, 0);
                    for (let k = 0; k <= 60; k++) { const f = k / 60, a = f * Math.PI * 4; ctx.lineTo(-70 - f * 110 + Math.cos(a) * 16 - 16, Math.sin(a) * 16 + Math.sin(f * 6 + t) * 6); }
                    ctx.stroke(); ctx.setLineDash([]);
                    const flap = Math.sin(t * 3) * 3;
                    const top = [[88, 0], [-70, -50 - flap], [-46, 0]], bot = [[88, 0], [-46, 0], [-70, 50 + flap]];
                    const keel = [[88, 0], [-58, -6], [-70, 0], [-58, 6]];
                    fill(ctx, top, mix(c, '#ffffff', 0.65)); ink(ctx, top, true, 2.6, P.ink, 4);
                    fill(ctx, bot, mix(c, '#ffffff', 0.2)); hatch(ctx, bot, 0, 4); ink(ctx, bot, true, 2.6, P.ink, 5);
                    fill(ctx, keel, mix(c, P.ink, 0.25)); ink(ctx, keel, true, 2, P.ink, 6);
                    // fold lines and a tiny pilot porthole
                    ctx.strokeStyle = rgba(P.ink, 0.5); ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(60, -4); ctx.lineTo(-60, -30); ctx.moveTo(60, 4); ctx.lineTo(-60, 30); ctx.stroke();
                    porthole(ctx, 20, -10, 4, 1, t, 1);
                    glow(ctx, -66, 0, 16, P.pink, 0.8);
                },

                // Floating crown: a ring of spires around a glowing core, turning slowly
                crownRing(ctx, t, o) {
                    const c = o.body || P.gold, core = o.core || P.cyan, R = 62, r = 40, spin = t * 0.25;
                    glow(ctx, 0, 0, 90, core, 0.35);
                    const outer = ell(0, 0, R, R, 48), inner = ell(0, 0, r, r, 40).reverse();
                    const pth = new Path2D(); dens(outer, true).forEach((p, i) => pth[i ? 'lineTo' : 'moveTo'](p[0], p[1])); pth.closePath();
                    dens(inner, true).forEach((p, i) => pth[i ? 'lineTo' : 'moveTo'](p[0], p[1])); pth.closePath();
                    const g = ctx.createRadialGradient(0, 0, r, 0, 0, R); g.addColorStop(0, mix(c, '#ffffff', 0.4)); g.addColorStop(1, mix(c, P.ink, 0.3));
                    ctx.fillStyle = g; ctx.fill(pth, 'evenodd');
                    // spires: little pointed towers standing on the rim, each with a lit window
                    for (let i = 0; i < 12; i++) {
                        const a = spin + i / 12 * Math.PI * 2, h = 20 + (i % 3) * 9, w = 7;
                        ctx.save(); ctx.rotate(a); ctx.translate(R - 4, 0);
                        const sp = [[0, -w], [h, 0], [0, w]];
                        fill(ctx, sp, i % 2 ? mix(c, '#ffffff', 0.25) : P.pink); hatch(ctx, sp, 0, 3.5); ink(ctx, sp, true, 1.8, P.ink, i);
                        fill(ctx, ell(5, 0, 1.8, 1.8, 6), P.paper);
                        ctx.restore();
                    }
                    ink(ctx, outer, true, 2.8, P.ink, 8); ink(ctx, ell(0, 0, r, r, 40), true, 2.4, P.ink, 9);
                    // windows around the band
                    for (let i = 0; i < 10; i++) { const a = -spin * 0.5 + i / 10 * Math.PI * 2; porthole(ctx, Math.cos(a) * 51, Math.sin(a) * 51, 3.4, i % 3 ? 1 : 0.25, t, i); }
                    // core: a little orb with an eye, like the floating eyes in the sketches
                    glow(ctx, 0, 0, 34, core, 0.9);
                    fill(ctx, ell(0, 0, 18, 18, 20), mix(core, '#ffffff', 0.3)); ink(ctx, ell(0, 0, 18, 18, 20), true, 2.2, P.ink, 11);
                    eye(ctx, 0, 0, 13, t, 0.7, Math.sin(t * 0.7) * 0.35);
                },

                // Fringed lampshade / jellyfish with pleats, scalloped rim and dangling lanterns
                lampshade(ctx, t, o) {
                    const c = o.body || P.pink, lamp = o.lamp || P.gold;
                    // seen from above it is a ring; drawn as a fringed dome so the silhouette reads like the sketch
                    glow(ctx, 0, 6, 80, lamp, 0.35);
                    for (let i = 0; i < 7; i++) {
                        const a = i / 7 * Math.PI * 2 + 0.3, sx = Math.cos(a) * 46, sy = Math.sin(a) * 46;
                        const L = 26 + (i % 3) * 8, ex = sx + Math.cos(a) * L + Math.sin(t * 1.8 + i) * 4, ey = sy + Math.sin(a) * L + Math.cos(t * 1.6 + i) * 4;
                        ctx.strokeStyle = 'rgba(255,246,230,0.6)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(sx, sy);
                        ctx.quadraticCurveTo((sx + ex) / 2 + Math.sin(t * 2 + i) * 6, (sy + ey) / 2, ex, ey); ctx.stroke();
                        glow(ctx, ex, ey, 9, lamp, 0.9); fill(ctx, ell(ex, ey, 3.4, 3.4, 8), P.paper); ink(ctx, ell(ex, ey, 3.4, 3.4, 8), true, 1.3);
                    }
                    // scalloped skirt
                    const sk = [];
                    for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2, rr = 52 + Math.abs(Math.sin(a * 9)) * 7 + Math.sin(t * 2 + a * 3) * 1.5; sk.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
                    const g = ctx.createRadialGradient(-10, -10, 8, 0, 0, 58); g.addColorStop(0, mix(c, '#ffffff', 0.55)); g.addColorStop(0.7, c); g.addColorStop(1, mix(c, P.ink, 0.35));
                    fill(ctx, sk, g); hatch(ctx, sk, 14, 4.5);
                    // pleats radiating from the top
                    ctx.strokeStyle = rgba(P.ink, 0.55); ctx.lineWidth = 1.3; ctx.beginPath();
                    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 54, Math.sin(a) * 54); }
                    ctx.stroke();
                    ink(ctx, sk, true, 2.6, P.ink, 12);
                    // crown cap with a finial
                    fill(ctx, ell(0, 0, 20, 20, 18), mix(c, '#ffffff', 0.3)); ink(ctx, ell(0, 0, 20, 20, 18), true, 2.2, P.ink, 13);
                    fill(ctx, ell(0, 0, 8, 8, 12), lamp); ink(ctx, ell(0, 0, 8, 8, 12), true, 1.8, P.ink, 14);
                    glow(ctx, 0, 0, 16, lamp, 0.6 + 0.3 * Math.sin(t * 3));
                },

                // Fish blimp carrying an ad on its flank, flicking tail, bubble-curl trail
                fishBlimp(ctx, t, o) {
                    const ad = o.ad, c = o.fishBody || ad.bg[1];
                    curls(ctx, -118, 0, t, mix(c, '#ffffff', 0.4), 4, 6);
                    const flick = Math.sin(t * 2.2) * 8;
                    const tail = [[-86, 0], [-122, -30 + flick], [-110, 0], [-122, 30 + flick]];
                    fill(ctx, tail, mix(c, P.ink, 0.15)); hatch(ctx, tail, 0, 3.5); ink(ctx, tail, true, 2.4, P.ink, 20);
                    for (const s of [-1, 1]) { const fin = [[0, s * 32], [-28, s * 52], [-34, s * 30]]; fill(ctx, fin, mix(c, '#ffffff', 0.25)); ink(ctx, fin, true, 2, P.ink, 21 + s); }
                    const body = [...ell(0, 0, 96, 36, 40)].map(([x, y]) => [x, y * (x > 0 ? 1 : 0.75 + 0.25 * (1 + x / 96))]);
                    const g = ctx.createLinearGradient(0, -36, 0, 36); g.addColorStop(0, mix(c, '#ffffff', 0.45)); g.addColorStop(0.55, c); g.addColorStop(1, mix(c, P.ink, 0.4));
                    fill(ctx, body, g); hatch(ctx, body, 14);
                    // scales
                    ctx.strokeStyle = rgba(P.ink, 0.4); ctx.lineWidth = 1.1;
                    for (let x = -70; x < -20; x += 10) for (let y = -20; y <= 20; y += 10) { ctx.beginPath(); ctx.arc(x + (y / 10 % 2 ? 5 : 0), y, 5, -1.2, 1.2); ctx.stroke(); }
                    // gill
                    ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(52, 0, 22, -1.1, 1.1); ctx.stroke();
                    ink(ctx, body, true, 2.8, P.ink, 23);
                    eye(ctx, 72, -10, 9, t, 2.2, 0.35);
                    // the ad screen, hand-framed
                    const scr = rrect(-14, -17, 62, 34, 5);
                    ctx.save(); ctx.shadowColor = ad.bg[1]; ctx.shadowBlur = 14;
                    const sg = ctx.createLinearGradient(-14, 0, 48, 0); sg.addColorStop(0, ad.bg[0]); sg.addColorStop(1, ad.bg[1]);
                    fill(ctx, scr, sg); ctx.restore(); ink(ctx, scr, true, 2, P.ink, 24);
                    // text is un-mirrored when the fish swims left
                    ctx.save(); ctx.translate(17, 0); if (o.flip) ctx.scale(-1, 1);
                    ctx.globalAlpha *= o.adFade == null ? 1 : 0.35 + 0.65 * o.adFade;
                    ctx.fillStyle = ad.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.font = `bold ${ad.brand.length > 7 ? 9 : 11}px Montserrat, sans-serif`; ctx.fillText(ad.brand, 0, ad.tag ? -4 : 0);
                    if (ad.tag) { ctx.font = '6px Montserrat, sans-serif'; ctx.fillText(ad.tag, 0, 7); }
                    ctx.restore();
                    // nav lights stay so it still reads as a vehicle at night
                    const blink = Math.sin(t * 4) > 0; if (blink) { glow(ctx, 10, -36, 8, '#ff3344', 1); glow(ctx, 10, 36, 8, '#33ff77', 1); }
                }
            };

            const KINDS = Object.keys(CRAFT);
            return {
                KINDS, P,
                // Side-view craft mirror rather than turn upside down when heading left
                draw(ctx, kind, heading, t, o, dark) {
                    glowK = 0.5 + 0.5 * dark;
                    const flip = Math.cos(heading) < 0, top = kind === 'crownRing' || kind === 'lampshade';
                    if (top) ctx.rotate(heading);
                    else if (flip) { ctx.scale(-1, 1); ctx.rotate(Math.PI - heading); }
                    else ctx.rotate(heading);
                    CRAFT[kind](ctx, t, { ...o, flip: flip && !top });
                }
            };
        })();
