        /* =====================================================================
           DOUBLE NIGHTS HOTEL — the city's landmark, on the tiered kit
           ---------------------------------------------------------------------
           Rebuilt on the tiered kit (buildings/tiered-kit.js) after ETERNAL's
           concept picture: a grand hotel in warm limestone, black iron and
           champagne gold, the crescent idea carried by its emblem and its
           rounded corner tower rather than by the plan.
             · the rotunda: a rounded tower out of the middle of the front,
               the tallest tier, iron balconies with planters on every floor
               up it, the tall glazed entrance at its foot (the chandelier and
               the lobby's fountain behind the glass), the DOUBLE NIGHTS HOTEL
               sign over the door and the gold double crescent over that;
             · on it, a round lantern with a slate dome and the emblem in gold
               on top of it;
             · the core behind it, with the penthouse terrace and its pool
               (chapter 1's suite) on its attic;
             · the two wings either side, lower, under slate mansards with
               dormers; arched windows over their doors;
             · out of the wings, two curved canopies with iron cresting,
               "ONE NIGHT" and "ANOTHER NIGHT" on their fascias, a doorman
               and clipped topiaries at each;
             · the forecourt: a marble terrace, a basalt drop-off lane with
               two black cars, granite paving with the emblem inlaid in brass,
               lamp posts with crescent banners, the SAME SKY / DIFFERENT
               STORIES plinth, lawns. At night the stone is wet: the lamps,
               the canopies and the entrance throw long gold reflections.
           Same footprint, door target and forecourt as before, so nothing round
           it moves. It fronts south. Collision is the wings, the core and the
           rotunda; the canopies overhang; topiaries, posts, plinth and cars
           stand free (getCollisionShapes).
           ===================================================================== */
        const DN = {
            HERO: 2,
            PLAN: { W: 800, D: 430 },
            G: 22, ST: 11,                                                       // the ground floor's and each storey's height
            Z: { WING: 92, MANS: 106, CORE: 114, ATTIC: 126, ROT: 132, CROWN: 146, DOME: 20, CAN0: 25, CAN1: 32, PLINTH: 30 },
            ROT: [270, 530, 320, 10, 100],                                       // the rotunda: a bay from x0 to x1 out of the wall at y, cheek, depth
            CROWN: [400, 372, 40],                                               // the lantern on it: centre, radius
            CAN: [[90, 250, 'ONE NIGHT'], [550, 710, 'ANOTHER NIGHT']],          // the canopies out of the wings (66 deep)
            DOOR: { x: 366, y: 424, w: 68, h: 44 },
            LAMPS: [[30, 600], [262, 600], [538, 600], [770, 600]],
            TOPI: [[112, 398], [228, 398], [572, 398], [688, 398], [336, 446], [464, 446]],
            DOORMEN: [[170, 402], [630, 402]],
            PLINTH: [586, 646, 44, 14],
            CARS: [[158, 538, 0], [642, 538, Math.PI]],
            MEDAL: [400, 730, 76],
            BEAMS: [[322, 396], [478, 396]],
            SERIF: 'Georgia, "Times New Roman", serif',
            C: { stone: '#b9a98f', stoneHi: '#d3c5aa', stoneLo: '#8f7f69', stoneDk: '#4a3f36', cream: '#efe4cc',
                 iron: '#17141a', ironHi: '#3a3540', gold: '#e3c07a', goldHi: '#fff0c4', goldDk: '#9a7a3e',
                 slate: '#3e4250', slateHi: '#5a5f70', slateDk: '#262934', lacquer: '#120f16', leaf: '#2f5a32', leafHi: '#4d8650' }
        };

        /** The rotunda's collision: bands down its curve (local), for the registry and the building. */
        function _dnRotundaBands() {
            const [x0, x1, wy, cheek, depth] = DN.ROT, cx = (x0 + x1) / 2, a = (x1 - x0) / 2, out = [], band = 20;
            for (let y = wy; y < wy + cheek + depth - 4; y += band) {
                const m = Math.min(1, Math.max(0, (y + band / 2 - wy - cheek) / depth)), hw = y + band / 2 < wy + cheek ? a : a * Math.sqrt(1 - m * m);
                out.push({ x: Math.round(cx - hw), y, w: Math.round(hw * 2), h: Math.min(band, wy + cheek + depth - 4 - y) });
            }
            return out;
        }
        /** Collision for the whole building (local): the wings, the core, the rotunda's bands. */
        function doubleNightsSections() {
            return [{ x: 20, y: 40, w: 250, h: 280 }, { x: 530, y: 40, w: 250, h: 280 }, { x: 270, y: 0, w: 260, h: 320 }, ..._dnRotundaBands()];
        }

        // ── wall art (strip coordinates: x along the plan from vertex 0, y down from the tier's top) ──

        /** A tier's walls in runs: neighbouring edges that turn less than ~30° (a curve's facets) run on as one wall. */
        function _dnRuns(t) {
            const es = [];
            t.mitre.forEach((m, i) => { if (m) es.push({ ...m, i, a: t.poly[i], b: t.poly[(i + 1) % t.poly.length] }); });
            es.sort((p, q) => p.u0 - q.u0);
            const runs = [];
            for (const e of es) {
                const last = runs[runs.length - 1], prev = last && last.edges[last.edges.length - 1];
                if (prev && Math.abs(prev.u0 + prev.L - e.u0) < 0.01 && prev.nx * e.nx + prev.ny * e.ny > 0.85 && !prev.hidden === !e.hidden) { last.edges.push(e); last.len += e.L; }
                else runs.push({ u0: e.u0, len: e.L, edges: [e], hidden: e.hidden });
            }
            for (const r of runs) { let nx = 0, ny = 0; for (const e of r.edges) { nx += e.nx * e.L; ny += e.ny * e.L; } const m = Math.hypot(nx, ny) || 1; r.nx = nx / m; r.ny = ny / m; }
            return runs;
        }
        /** Where along a run u falls (world point, its edge's normal). */
        function _dnAt(run, u) {
            for (const e of run.edges) if (u <= e.u0 + e.L + 1e-6) { const s = Math.max(0, (u - e.u0) / e.L); return { x: e.a[0] + (e.b[0] - e.a[0]) * s, y: e.a[1] + (e.b[1] - e.a[1]) * s, nx: e.nx, ny: e.ny }; }
            const e = run.edges[run.edges.length - 1]; return { x: e.b[0], y: e.b[1], nx: e.nx, ny: e.ny };
        }
        /** Where along the strip the wall facing (roughly) south passes world x, or null. */
        function _dnU(t, wx, minNy = 0.8) {
            for (const r of _dnRuns(t)) for (const e of r.edges) {
                if (e.hidden || e.ny < minNy) continue;
                const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
                if (wx < x0 - 0.01 || wx > x1 + 0.01 || x1 - x0 < 0.5) continue;
                return e.u0 + Math.abs(wx - e.a[0]) / (x1 - x0) * e.L;
            }
            return null;
        }

        /** The double crescent: two crescents opening on each other, a four-point star between. */
        function _dnEmblem(c, cx, cy, R) {
            _mcCrescent(c, cx - R * 0.42, cy, R * 0.62, 0); c.fill();
            _mcCrescent(c, cx + R * 0.42, cy, R * 0.62, Math.PI); c.fill();
            _dnStar(c, cx, cy, R * 0.34); c.fill();
        }
        function _dnStar(c, x, y, r) {
            c.beginPath();
            for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r * 0.22 : r; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
            c.closePath();
        }
        /** Spaced capitals, where the canvas can (letterSpacing), at x centre. */
        function _dnText(c, text, x, y, px, weight = 600, spacing = 0.18) {
            c.font = `${weight} ${px}px ${DN.SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
            if ('letterSpacing' in c) c.letterSpacing = (px * spacing).toFixed(2) + 'px';
            c.fillText(text, x, y);
            if ('letterSpacing' in c) c.letterSpacing = '0px';
        }

        /** Limestone: a warm wash, fine coursing, rusticated below the ground floor's cornice. */
        function _dnStone(d, l, t, H, L, r) {
            const C = DN.C, g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.stoneHi); g.addColorStop(0.55, C.stone); g.addColorStop(1, C.stoneLo);
            d.fillStyle = g; d.fillRect(0, 0, L, H);
            for (let i = 0; i < L / 6; i++) { d.fillStyle = `rgba(${r() < 0.5 ? '255, 245, 225' : '70, 55, 40'}, ${0.03 + r() * 0.04})`; d.fillRect(r() * L, r() * H, 3 + r() * 10, 1 + r() * 2.5); }
            d.fillStyle = 'rgba(80, 64, 48, 0.16)'; for (let y = H - 4.5; y > 0; y -= 4.5) d.fillRect(0, y, L, 0.35);
            if (t.z0 === 0) {                                                                        // the rusticated base
                const top = H - DN.G;
                d.fillStyle = 'rgba(60, 46, 34, 0.35)';
                for (let y = H - 3.6, k = 0; y > top; y -= 3.6, k++) { d.fillRect(0, y, L, 0.6); for (let x = (k % 2) * 6; x < L; x += 12) d.fillRect(x, y - 3.6, 0.5, 3.6); }
            }
        }
        /** A window from y (its top) h tall: the reveal, glass, curtains, mullion; lit warm at night (most of them). */
        function _dnWin(d, l, x, y, w, h, r, arch, litP = 0.62) {
            const C = DN.C, rr = w / 2, sp = y + (arch ? rr : 0);
            const path = (c, i = 0) => { c.beginPath(); if (arch) { c.moveTo(x + i, y + h - i); c.lineTo(x + i, sp); c.arc(x + rr, sp, rr - i, Math.PI, 0); c.lineTo(x + w - i, y + h - i); c.closePath(); } else c.rect(x + i, y + i, w - i * 2, h - i * 2); };
            d.fillStyle = 'rgba(52, 40, 30, 0.6)'; path(d, -0.8); d.fill();
            d.fillStyle = '#242733'; path(d); d.fill();
            d.fillStyle = 'rgba(205, 214, 232, 0.14)'; d.fillRect(x, sp, w * 0.5, (y + h - sp) * 0.45);                       // the sky in it
            d.fillStyle = 'rgba(232, 214, 184, 0.5)'; d.fillRect(x + 0.4, sp, w * 0.2, y + h - sp - 0.4); d.fillRect(x + w * 0.8 - 0.4, sp, w * 0.2, y + h - sp - 0.4);   // curtains
            d.fillStyle = C.iron; d.fillRect(x + rr - 0.25, y + (arch ? 0 : 0.5), 0.5, h - 0.5); d.fillRect(x, y + h * (arch ? 0.42 : 0.3), w, 0.45);
            d.fillStyle = C.stoneHi; d.fillRect(x - 1, y + h, w + 2, 0.9);                                                     // the sill
            if (!arch) { d.fillStyle = C.cream; d.fillRect(x + rr - 1.2, y - 1.6, 2.4, 1.6); }                                // a keystone
            const v = r();
            if (v < litP) {
                path(l); { const g = l.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255, 222, 160, 0.95)'); g.addColorStop(1, 'rgba(255, 168, 90, 0.92)'); l.fillStyle = g; } l.fill();
                l.fillStyle = 'rgba(255, 240, 210, 1)'; l.fillRect(x + 0.4, sp, w * 0.2, y + h - sp - 0.4); l.fillRect(x + w * 0.8 - 0.4, sp, w * 0.2, y + h - sp - 0.4);
                l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = '#000'; l.fillRect(x + rr - 0.25, y, 0.5, h); l.fillRect(x, y + h * (arch ? 0.42 : 0.3), w, 0.45); l.restore();
            } else if (v < litP + 0.14) { path(l); l.fillStyle = 'rgba(255, 190, 120, 0.28)'; l.fill(); }
        }
        /** An iron balcony rail whose foot is at y: the top bar, balusters, a scroll in each panel; planters spilling over it, ivy hanging under. */
        function _dnRail(d, l, x0, x1, y, r, plants) {
            const C = DN.C, top = y - 3.6;
            d.fillStyle = 'rgba(30, 22, 18, 0.35)'; d.fillRect(x0, y, x1 - x0, 1.1);                                          // the slab's shadow
            d.fillStyle = C.iron; d.fillRect(x0, top, x1 - x0, 0.6); d.fillRect(x0, y - 0.6, x1 - x0, 0.6);
            for (let x = x0; x <= x1 + 0.01; x += 0.9) d.fillRect(x, top, 0.22, 3.6);
            d.strokeStyle = C.iron; d.lineWidth = 0.3;
            for (let x = x0 + 2; x < x1 - 1; x += 4) { d.beginPath(); d.arc(x, y - 1.8, 0.9, 0, Math.PI * 1.6); d.stroke(); }
            l.fillStyle = 'rgba(255, 214, 150, 0.35)'; l.fillRect(x0, top, x1 - x0, 0.5);
            if (!plants) return;
            for (let x = x0 + 0.8; x < x1 - 0.6; x += 1.3 + r() * 1.2) {
                d.fillStyle = r() < 0.5 ? C.leaf : C.leafHi; d.beginPath(); d.arc(x, top - 0.4 + r() * 0.8, 0.9 + r() * 0.8, 0, Math.PI * 2); d.fill();
                if (r() < 0.25) { d.fillStyle = r() < 0.5 ? '#f2e6ef' : '#e98ab0'; d.beginPath(); d.arc(x + 0.3, top - 0.8, 0.45, 0, Math.PI * 2); d.fill(); }
            }
            if (r() < 0.45) { const x = x0 + r() * (x1 - x0), n = 3 + r() * 6; d.fillStyle = C.leaf; for (let k = 0; k < n; k++) { d.beginPath(); d.arc(x + Math.sin(k) * 0.6, y + 0.6 + k * 0.9, 0.6, 0, Math.PI * 2); d.fill(); } }
        }
        /** Warm uplights washing up the wall from the pavement. */
        function _dnUplight(l, x, H, h) {
            const g = l.createLinearGradient(0, H, 0, H - h); g.addColorStop(0, 'rgba(255, 196, 120, 0.55)'); g.addColorStop(1, 'rgba(255, 196, 120, 0)');
            l.fillStyle = g; l.beginPath(); l.moveTo(x - 1.5, H); l.lineTo(x - 9, H - h); l.lineTo(x + 9, H - h); l.lineTo(x + 1.5, H); l.closePath(); l.fill();
        }
        /** A pair of glass doors from y0 to the foot, a fanlight over them, gold frames, the lobby's light (revolving, under the canopies). */
        function _dnDoorway(d, l, cx, H, w, h) {
            const C = DN.C, y0 = H - h, rr = w / 2;
            d.fillStyle = C.stoneDk; d.beginPath(); d.moveTo(cx - rr - 1.2, H); d.lineTo(cx - rr - 1.2, y0 + rr); d.arc(cx, y0 + rr, rr + 1.2, Math.PI, 0); d.lineTo(cx + rr + 1.2, H); d.fill();
            d.fillStyle = '#2a1f1a'; d.beginPath(); d.moveTo(cx - rr, H); d.lineTo(cx - rr, y0 + rr); d.arc(cx, y0 + rr, rr, Math.PI, 0); d.lineTo(cx + rr, H); d.fill();
            const g = l.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(255, 214, 150, 0.85)'); g.addColorStop(1, 'rgba(255, 186, 110, 1)');
            l.fillStyle = g; l.beginPath(); l.moveTo(cx - rr, H); l.lineTo(cx - rr, y0 + rr); l.arc(cx, y0 + rr, rr, Math.PI, 0); l.lineTo(cx + rr, H); l.fill();
            d.strokeStyle = C.gold; d.lineWidth = 0.45;
            for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; d.beginPath(); d.moveTo(cx, y0 + rr); d.lineTo(cx + Math.cos(a) * rr, y0 + rr + Math.sin(a) * rr); d.stroke(); }   // the fanlight's spokes
            d.fillStyle = C.gold; d.fillRect(cx - rr, y0 + rr, w, 0.6); d.fillRect(cx - 0.3, y0 + rr, 0.6, h - rr);
            d.fillRect(cx - rr, H - 0.8, w, 0.8); d.strokeRect(cx - rr + 0.8, y0 + rr + 1.2, w / 2 - 1.6, h - rr - 2); d.strokeRect(cx + 0.8, y0 + rr + 1.2, w / 2 - 1.6, h - rr - 2);
            l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = 'rgba(0, 0, 0, 0.7)'; l.fillRect(cx - 0.3, y0 + rr, 0.6, h - rr); l.fillRect(cx - rr, y0 + rr, w, 0.6); l.restore();
            l.fillStyle = 'rgba(255, 245, 220, 1)'; for (const s of [-1, 1]) { l.beginPath(); l.arc(cx + s * (rr + 2.4), y0 + rr + 3, 0.8, 0, Math.PI * 2); l.fill(); }   // wall lanterns either side
            d.fillStyle = C.goldDk; for (const s of [-1, 1]) d.fillRect(cx + s * (rr + 2.4) - 0.7, y0 + rr + 2, 1.4, 2.4);
        }

        /**
         * A tier's limestone walls: a bay of windows every o.bay along each run, a storey every DN.ST up from the ground floor's
         * cornice; balconies where o.balc says (1 rail, 2 rail and planters); o.ground: arched windows in the base, doors at
         * o.doors (local x, on the front); o.skip(lx, z, u): leave a window out; o.after(d, l, t, H, L, r) paints over the lot.
         */
        function _dnFacade(d, l, t, H, L, o) {
            const r = seededRandom(o.seed), b = t.owner, z1 = t.z1, G = DN.G, ST = DN.ST;
            _dnStone(d, l, t, H, L, r);
            for (const run of _dnRuns(t)) {
                if (run.hidden) continue;
                const n = Math.max(1, Math.round(run.len / o.bay)), bw = run.len / n, w = Math.min(bw * 0.46, o.win || 10.5);
                for (let i = 0; i < n; i++) {
                    const uc = run.u0 + (i + 0.5) * bw, P = _dnAt(run, uc), lx = P.x - b.x, front = run.ny > 0.75;
                    if (t.z0 === 0) {
                        const door = front && o.doors && o.doors.some(dx => Math.abs(dx - lx) < bw * 0.55);
                        if (door) _dnDoorway(d, l, uc, H, Math.min(bw * 0.62, 16), G - 2.5);
                        else if (!o.skip || !o.skip(lx, G / 2, uc)) _dnWin(d, l, uc - w * 0.55, H - G + 3, w * 1.1, G - 5.5, r, true, 0.7);
                        if (front && i % 3 === 1) _dnUplight(l, run.u0 + i * bw, H, Math.min(H * 0.7, 70));
                    }
                    for (let f = t.z0 === 0 ? G : t.z0 + 2, k = 0; f + ST <= z1 - 3; f += ST, k++) {
                        if (o.skip && o.skip(lx, f + ST / 2, uc)) continue;
                        const top = z1 - (f + ST - 2.2), bot = z1 - (f + 1.8);
                        _dnWin(d, l, uc - w / 2, top, w, bot - top, r, k === 0 && t.z0 === 0);
                        const bal = o.balc ? o.balc(f, k, i, run, lx) : 0;
                        if (bal) _dnRail(d, l, uc - w / 2 - 2.2, uc + w / 2 + 2.2, z1 - f, r, bal === 2 || (bal === 3 && r() < 0.55));
                    }
                    if (i > 0 && !o.plain) { d.fillStyle = 'rgba(255, 246, 228, 0.12)'; d.fillRect(run.u0 + i * bw - 0.8, 0, 1.6, H - (t.z0 === 0 ? G : 0)); }   // a pilaster's light edge
                }
            }
            if (o.after) o.after(d, l, t, H, L, r);
        }

        /** The rotunda: balconies with planters on every floor; at its front the glazed entrance, the sign and the emblem over it. */
        function _dnRotunda(d, l, t, H, L) {
            const b = t.owner, uc = b ? _dnU(t, b.x + 400, 0.9) : null, FRONT = 32;
            _dnFacade(d, l, t, H, L, {
                seed: 7313, bay: 22, win: 9.5,
                skip: (lx, z, u) => uc !== null && Math.abs(u - uc) < FRONT && z < 66,
                balc: (f) => f >= 77 ? 3 : f === 33 || f === 44 || f === 55 || f === 66 ? 1 : 0,
                after: (d, l, t, H, L, r) => { if (uc !== null) _dnEntrance(d, l, uc, H, r); }
            });
        }
        /** The tall glazed entrance (two storeys), the chandelier and the fountain inside; the sign over it; the emblem over that. */
        function _dnEntrance(d, l, uc, H, r) {
            const C = DN.C, ew = 34, eh = 36, x0 = uc - ew / 2, y0 = H - eh;
            // the bronze frame and the glass
            d.fillStyle = C.iron; d.fillRect(x0 - 3, y0 - 3, ew + 6, eh + 3);
            d.fillStyle = '#2b2018'; d.fillRect(x0, y0, ew, eh);
            { const g = l.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(255, 210, 140, 0.8)'); g.addColorStop(0.6, 'rgba(255, 196, 120, 0.95)'); g.addColorStop(1, 'rgba(255, 176, 96, 1)'); l.fillStyle = g; l.fillRect(x0, y0, ew, eh); }
            d.fillStyle = 'rgba(255, 220, 170, 0.18)'; d.fillRect(x0, y0, ew, eh);
            // the curtains drawn back in swags
            for (const [c, col] of [[d, 'rgba(236, 220, 192, 0.55)'], [l, 'rgba(255, 238, 205, 1)']]) {
                c.fillStyle = col; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 6, y0 + 12, x0 + 2, H); c.lineTo(x0, H); c.closePath(); c.fill();
                c.beginPath(); c.moveTo(x0 + ew, y0); c.quadraticCurveTo(x0 + ew - 6, y0 + 12, x0 + ew - 2, H); c.lineTo(x0 + ew, H); c.closePath(); c.fill();
            }
            // the chandelier: tiers of lights round a gold drop
            d.fillStyle = C.goldDk; d.fillRect(uc - 0.3, y0, 0.6, 7);
            for (let k = 0; k < 3; k++) {
                const yy = y0 + 7 + k * 2.6, w = 7 - k * 1.8;
                d.fillStyle = C.gold; d.fillRect(uc - w, yy, w * 2, 0.5);
                for (let x = -w; x <= w + 0.01; x += 1.4) { l.fillStyle = 'rgba(255, 252, 235, 1)'; l.beginPath(); l.arc(uc + x, yy - 0.3, 0.45, 0, Math.PI * 2); l.fill(); }
            }
            l.fillStyle = 'rgba(255, 240, 200, 0.6)'; l.beginPath(); l.arc(uc, y0 + 10, 7, 0, Math.PI * 2); l.fill();
            // the lobby's fountain: a basin on a stem, the tiers above, water catching the light
            for (const [c, col] of [[d, 'rgba(70, 52, 40, 0.75)']]) { c.fillStyle = col; c.fillRect(uc - 7, H - 4, 14, 2.4); c.fillRect(uc - 1, H - 10, 2, 6); c.fillRect(uc - 4, H - 10.6, 8, 1.2); c.fillRect(uc - 0.6, H - 14, 1.2, 3.4); }
            l.fillStyle = 'rgba(210, 230, 255, 0.7)'; l.fillRect(uc - 6, H - 4.4, 12, 0.6); l.fillRect(uc - 3.6, H - 11, 7.2, 0.5);
            // figures inside: a couple on the mezzanine, a guest crossing
            d.fillStyle = 'rgba(30, 20, 14, 0.75)';
            for (const [fx, fy, s] of [[uc - 3, y0 + 21, 0.9], [uc + 2.4, y0 + 21, 1], [uc + 10, H - 1, 1.2]]) { d.beginPath(); d.arc(fx, fy - 7 * s, 0.9 * s, 0, Math.PI * 2); d.fill(); d.fillRect(fx - 1.1 * s, fy - 6 * s, 2.2 * s, 6 * s); }
            l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = 'rgba(0, 0, 0, 0.7)';
            for (const [fx, fy, s] of [[uc - 3, y0 + 21, 0.9], [uc + 2.4, y0 + 21, 1], [uc + 10, H - 1, 1.2]]) { l.beginPath(); l.arc(fx, fy - 7 * s, 0.9 * s, 0, Math.PI * 2); l.fill(); l.fillRect(fx - 1.1 * s, fy - 6 * s, 2.2 * s, 6 * s); }
            l.restore();
            // the mezzanine rail and the frame's mullions (the doors at the foot)
            d.fillStyle = C.gold; d.fillRect(x0, y0 + 21, ew, 0.6); d.fillRect(x0, H - 13, ew, 0.5);
            for (const x of [x0 + ew / 4, uc, x0 + ew * 3 / 4]) d.fillRect(x - 0.3, H - 13, 0.6, 13);
            d.fillRect(x0 - 3, y0 - 3, ew + 6, 0.8); d.fillRect(x0 - 3, y0 - 3, 0.8, eh + 3); d.fillRect(x0 + ew + 2.2, y0 - 3, 0.8, eh + 3);
            l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = 'rgba(0, 0, 0, 0.6)'; l.fillRect(x0, y0 + 21, ew, 0.6); l.fillRect(x0, H - 13, ew, 0.5); l.restore();
            // the sign: a black band, DOUBLE NIGHTS in gold capitals, HOTEL under it
            const sy = H - 50, sw = 70;
            d.fillStyle = C.lacquer; d.fillRect(uc - sw / 2, sy, sw, 12);
            d.fillStyle = C.goldDk; d.fillRect(uc - sw / 2, sy, sw, 0.5); d.fillRect(uc - sw / 2, sy + 11.5, sw, 0.5);
            for (const [c, col] of [[d, C.gold], [l, 'rgba(255, 238, 200, 1)']]) {
                c.save(); c.fillStyle = col; if (c === l) { c.shadowColor = 'rgba(255, 196, 110, 1)'; c.shadowBlur = 4; }
                _dnText(c, 'DOUBLE NIGHTS', uc, sy + 4.6, 6.2, 600, 0.08); _dnText(c, 'HOTEL', uc, sy + 9.4, 3, 600, 0.6);
                c.restore();
            }
            // the emblem over it, in a ring, ivy round the band
            const ey = H - 59, R = 7.5;
            d.fillStyle = C.lacquer; d.beginPath(); d.arc(uc, ey, R + 1.6, 0, Math.PI * 2); d.fill();
            d.strokeStyle = C.goldDk; d.lineWidth = 0.5; d.stroke();
            for (const [c, col] of [[d, C.gold], [l, 'rgba(255, 236, 190, 1)']]) { c.fillStyle = col; _dnEmblem(c, uc, ey, R); }
            l.fillStyle = 'rgba(255, 210, 140, 0.35)'; l.beginPath(); l.arc(uc, ey, R + 5, 0, Math.PI * 2); l.fill();
            for (let k = 0; k < 70; k++) {
                const side = r() < 0.5 ? -1 : 1, x = uc + side * (sw / 2 + r() * 8), y = sy - 2 + r() * 18;
                d.fillStyle = r() < 0.5 ? DN.C.leaf : DN.C.leafHi; d.beginPath(); d.arc(x, y, 0.6 + r() * 0.8, 0, Math.PI * 2); d.fill();
            }
        }
        /** The lantern on the rotunda: tall arched windows lit gold between pilasters, a gold band. */
        function _dnLantern(d, l, t, H, L) {
            const C = DN.C, r = seededRandom(7411);
            d.fillStyle = C.stone; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(255, 246, 228, 0.1)'; d.fillRect(0, 0, L, 2);
            for (let x = 3; x < L - 6; x += 13) {
                const w = 6, y0 = 3.5, y1 = H - 2.5;
                _dnWin(d, l, x + 1, y0, w, y1 - y0, r, true, 1);
                d.fillStyle = C.stoneHi; d.fillRect(x + w + 2.4, 1, 2, H - 2);
            }
            d.fillStyle = C.gold; d.fillRect(0, 0.6, L, 0.6); d.fillRect(0, H - 1.4, L, 0.6);
        }
        /** A slate mansard: the slope's light, standing seams, dormers with stone frames and pediments. */
        function _dnMansard(d, l, t, H, L) {
            const C = DN.C, r = seededRandom(7519 + t.i);
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.slateDk); g.addColorStop(1, C.slateHi);
            d.fillStyle = g; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(0, 0, 0, 0.18)'; for (let x = 0; x < L; x += 2.2) d.fillRect(x, 0, 0.3, H);
            for (const run of _dnRuns(t)) {
                if (run.hidden) continue;
                const n = Math.max(1, Math.round(run.len / 28)), bw = run.len / n;
                for (let i = 0; i < n; i++) {
                    const uc = run.u0 + (i + 0.5) * bw, w = 6, y0 = H - 11;
                    d.fillStyle = C.stoneHi; d.fillRect(uc - w / 2 - 1.4, y0 - 1, w + 2.8, 10);
                    d.fillStyle = C.cream; d.beginPath(); d.moveTo(uc - w / 2 - 2, y0 - 0.6); d.lineTo(uc, y0 - 4); d.lineTo(uc + w / 2 + 2, y0 - 0.6); d.closePath(); d.fill();
                    _dnWin(d, l, uc - w / 2, y0 + 0.6, w, 7, r, true, 0.5);
                }
            }
            d.fillStyle = '#7a7c86'; d.fillRect(0, 0, L, 1.2);                                                                 // the zinc cap
        }
        /** A canopy's fascia: black lacquer between gold lines, its name over the door, bulbs along its foot. */
        function _dnCanopyArt(text) {
            return (d, l, t, H, L) => {
                const C = DN.C, b = t.owner, uc = b ? _dnU(t, b.x + (t.cx || 0), 0.9) : null;
                d.fillStyle = C.lacquer; d.fillRect(0, 0, L, H);
                d.fillStyle = C.gold; d.fillRect(0, 0.4, L, 0.7); d.fillRect(0, H - 1.6, L, 0.7);
                d.fillStyle = 'rgba(232, 194, 122, 0.35)'; for (let x = 4; x < L; x += 8) d.fillRect(x, 1.6, 0.4, H - 3.6);
                for (let x = 1.5; x < L - 1; x += 2.6) { d.fillStyle = '#6a5530'; d.beginPath(); d.arc(x, H - 0.5, 0.4, 0, Math.PI * 2); d.fill();
                    l.fillStyle = 'rgba(255, 236, 190, 1)'; l.beginPath(); l.arc(x, H - 0.5, 0.5, 0, Math.PI * 2); l.fill(); }
                if (uc === null) return;
                d.fillStyle = C.lacquer; d.fillRect(uc - text.length * 2.3, 1.4, text.length * 4.6, H - 3.2);
                for (const [c, col] of [[d, C.gold], [l, 'rgba(255, 240, 205, 1)']]) {
                    c.save(); c.fillStyle = col; if (c === l) { c.shadowColor = 'rgba(255, 190, 110, 1)'; c.shadowBlur = 3; }
                    _dnText(c, text, uc, H / 2 - 0.2, 3.6, 600, 0.22); c.restore();
                }
            };
        }
        /** The plinth's front: dark stone, SAME SKY / DIFFERENT STORIES in gold, the emblem under it. */
        function _dnPlinthArt(d, l, t, H, L) {
            const C = DN.C;
            d.fillStyle = '#26222a'; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(255, 255, 255, 0.05)'; d.fillRect(0, 0, L, 1.2);
            const e = _dnRuns(t).find(q => q.ny > 0.9);
            if (!e) return;
            const cx = e.u0 + e.len / 2;
            d.strokeStyle = C.goldDk; d.lineWidth = 0.4; d.strokeRect(e.u0 + 3, 2.5, e.len - 6, H - 6);
            for (const [c, col] of [[d, C.gold], [l, 'rgba(255, 236, 196, 0.9)']]) {
                c.fillStyle = col;
                ['SAME', 'SKY', 'DIFFERENT', 'STORIES'].forEach((w, i) => _dnText(c, w, cx, 6.5 + i * 4.2, 2.6, 600, 0.12));
                _dnEmblem(c, cx, H - 7.5, 2.4);
            }
        }
        /** A planter: black, a gold band at its rim. */
        function _dnPot(d, l, t, H, L) {
            d.fillStyle = DN.C.lacquer; d.fillRect(0, 0, L, H);
            d.fillStyle = DN.C.gold; d.fillRect(0, 0.4, L, 0.7); d.fillStyle = 'rgba(255, 255, 255, 0.06)'; d.fillRect(0, 1.2, L, 1.2);
        }

        // ── roofs (world coordinates, painted once) and what stands on them (live) ──

        function _dnPath(c, poly) { c.beginPath(); poly.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }
        const _dnCentre = (poly) => { let x = 0, y = 0; for (const p of poly) { x += p[0] / poly.length; y += p[1] / poly.length; } return [x, y]; };

        /** Lead flats round a setback, a stone gutter. */
        function _dnLeadRoof(c, e, t) {
            if (e) return;
            _dnPath(c, t.poly); c.fillStyle = '#45434c'; c.fill();
            c.strokeStyle = DN.C.stoneHi; c.lineWidth = 3; c.stroke(); c.strokeStyle = 'rgba(0, 0, 0, 0.3)'; c.lineWidth = 1; c.stroke();
        }
        /** A mansard's top: four zinc slopes up to a deck (seams down each, hips at the corners), skylights, chimney stacks with their pots. */
        function _dnZincRoof(c, e, t) {
            const [x0, y0, x1, y1] = t.box, r = seededRandom('dn-zinc' + t.i), w = x1 - x0, h = y1 - y0, I = 24;
            const sky = [0.22, 0.5, 0.78].map((v) => [x0 + w / 2 - 12, y0 + I + 8 + (h - I * 2 - 16) * v - 16, 24, 32]);
            if (e) { c.fillStyle = 'rgba(255, 210, 150, 0.6)'; for (const [x, y, sw, sh] of sky) c.fillRect(x + 2, y + 2, sw - 4, sh - 4); return; }
            const O = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], N = [[x0 + I, y0 + I], [x1 - I, y0 + I], [x1 - I, y1 - I], [x0 + I, y1 - I]];
            const shade = ['#6a6e7c', '#4c4f5c', '#5c606d', '#777b89'];                                   // north, east, south, west (the light from the west)
            for (let q = 0; q < 4; q++) {
                const a = O[q], b = O[(q + 1) % 4], bi = N[(q + 1) % 4], ai = N[q];
                c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(bi[0], bi[1]); c.lineTo(ai[0], ai[1]); c.closePath();
                c.fillStyle = shade[q]; c.fill();
                c.save(); c.clip(); c.strokeStyle = 'rgba(0, 0, 0, 0.2)'; c.lineWidth = 0.8; c.beginPath();
                if (q % 2 === 0) for (let x = x0 + 3; x < x1; x += 5) { c.moveTo(x, y0); c.lineTo(x, y1); }
                else for (let y = y0 + 3; y < y1; y += 5) { c.moveTo(x0, y); c.lineTo(x1, y); }
                c.stroke(); c.restore();
            }
            c.fillStyle = '#5e6270'; c.fillRect(N[0][0], N[0][1], w - I * 2, h - I * 2);                     // the deck
            c.strokeStyle = 'rgba(255, 255, 255, 0.06)'; c.lineWidth = 0.8; c.beginPath(); for (let x = N[0][0] + 4; x < N[1][0]; x += 6) { c.moveTo(x, N[0][1]); c.lineTo(x, N[3][1]); } c.stroke();
            c.strokeStyle = '#9a9ca6'; c.lineWidth = 1.4; c.beginPath();                                       // the hips and the deck's edge
            for (let q = 0; q < 4; q++) { c.moveTo(O[q][0], O[q][1]); c.lineTo(N[q][0], N[q][1]); }
            c.rect(N[0][0], N[0][1], w - I * 2, h - I * 2); c.stroke();
            c.strokeStyle = '#8a8c96'; c.lineWidth = 2; c.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
            for (const [x, y, sw, sh] of sky) { c.fillStyle = 'rgba(0, 0, 0, 0.3)'; c.fillRect(x + 2, y + 3, sw, sh); c.fillStyle = '#1e2330'; c.fillRect(x, y, sw, sh); c.strokeStyle = DN.C.goldDk; c.lineWidth = 1.2; c.strokeRect(x, y, sw, sh);
                c.strokeStyle = 'rgba(232, 194, 122, 0.4)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + sw / 2, y); c.lineTo(x + sw / 2, y + sh); c.stroke(); c.fillStyle = 'rgba(190, 205, 230, 0.15)'; c.fillRect(x + 2, y + 2, sw * 0.4, sh - 4); }
            // chimney stacks astride the slopes, east and west, each with a row of pots
            for (let k = 0; k < 6; k++) {
                const side = k % 2, y = y0 + 30 + Math.floor(k / 2) * (h - 70) / 2 + r() * 8, x = side ? x1 - I - 6 : x0 + I - 22;
                c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.fillRect(x + 4, y + 5, 28, 12);
                c.fillStyle = '#a08c70'; c.fillRect(x, y, 28, 12); c.fillStyle = '#c0ad8c'; c.fillRect(x, y, 28, 2.5); c.fillStyle = '#7d6b54'; c.fillRect(x, y + 10, 28, 2);
                for (let p = 0; p < 4; p++) { c.fillStyle = '#a5583b'; c.beginPath(); c.arc(x + 4 + p * 6.6, y + 6, 2.2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2a1a14'; c.beginPath(); c.arc(x + 4 + p * 6.6, y + 6, 1, 0, Math.PI * 2); c.fill(); }
            }
        }
        /** The attic's top: the penthouse terrace, a teak deck, the pool (chapter 1's suite), loungers, planters, the glass pavilion. */
        function _dnPenthouseRoof(c, e, t) {
            const [x0, y0, x1, y1] = t.box, C = DN.C, cx = (x0 + x1) / 2;
            const pool = [cx - 34, y0 + 70, 68, 150], pav = [x0 + 18, y0 + 14, x1 - x0 - 36, 36];
            if (e) {
                c.fillStyle = 'rgba(90, 140, 255, 0.45)'; c.fillRect(...pool);
                c.fillStyle = 'rgba(255, 214, 160, 0.5)'; c.fillRect(pav[0] + 3, pav[1] + 3, pav[2] - 6, pav[3] - 6);
                c.fillStyle = 'rgba(255, 220, 160, 0.8)'; for (let y = y0 + 64; y < y1 - 20; y += 26) for (const x of [x0 + 12, x1 - 12]) { c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); }
                return;
            }
            _dnPath(c, t.poly); c.fillStyle = '#5b3f2c'; c.fill();
            c.strokeStyle = 'rgba(30, 18, 10, 0.35)'; c.lineWidth = 0.8; c.beginPath(); for (let y = y0 + 3; y < y1; y += 4) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke();
            c.strokeStyle = C.stoneHi; c.lineWidth = 4; _dnPath(c, t.poly); c.stroke();
            // the pool: a gold rim, deep blue, a crescent mosaic at its foot
            c.fillStyle = C.stoneHi; c.fillRect(pool[0] - 5, pool[1] - 5, pool[2] + 10, pool[3] + 10);
            { const g = c.createLinearGradient(pool[0], pool[1], pool[0] + pool[2], pool[1] + pool[3]); g.addColorStop(0, '#1b2f62'); g.addColorStop(1, '#2d5a94'); c.fillStyle = g; c.fillRect(...pool); }
            c.strokeStyle = C.gold; c.lineWidth = 1.5; c.strokeRect(...pool);
            c.strokeStyle = 'rgba(200, 225, 255, 0.25)'; c.lineWidth = 0.8; c.beginPath(); for (let y = pool[1] + 14; y < pool[1] + pool[3]; y += 18) { c.moveTo(pool[0] + 4, y); c.quadraticCurveTo(cx, y + 5, pool[0] + pool[2] - 4, y); } c.stroke();
            c.fillStyle = 'rgba(232, 194, 122, 0.55)'; _dnEmblem(c, cx, pool[1] + pool[3] - 22, 14);
            // loungers both sides, planters at the corners
            for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
                const x = cx + s * 64 - 9, y = pool[1] + 10 + k * 36;
                c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.fillRect(x + 2, y + 2, 18, 26); c.fillStyle = '#efe6d6'; c.fillRect(x, y, 18, 26); c.fillStyle = '#d8c8b0'; c.fillRect(x, y, 18, 7);
            }
            for (const [x, y] of [[x0 + 14, y1 - 14], [x1 - 14, y1 - 14], [x0 + 14, y0 + 64], [x1 - 14, y0 + 64]]) {
                c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.beginPath(); c.arc(x + 2, y + 3, 9, 0, Math.PI * 2); c.fill();
                c.fillStyle = C.lacquer; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
                const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, 8); g.addColorStop(0, C.leafHi); g.addColorStop(1, '#173a1e'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
            }
            // the pavilion: the suite's glass room on the north side
            c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.fillRect(pav[0] + 3, pav[1] + 4, pav[2], pav[3]);
            c.fillStyle = '#1f1c26'; c.fillRect(...pav); c.strokeStyle = C.gold; c.lineWidth = 1.4; c.strokeRect(...pav);
            c.strokeStyle = 'rgba(232, 194, 122, 0.35)'; c.lineWidth = 0.8; c.beginPath(); for (let x = pav[0] + 12; x < pav[0] + pav[2]; x += 12) { c.moveTo(x, pav[1]); c.lineTo(x, pav[1] + pav[3]); } c.stroke();
        }
        /** The rotunda's top round the lantern: lead, a stone parapet, planters spilling greenery all round its curve. */
        function _dnRotundaRoof(c, e, t) {
            if (e) return;
            const C = DN.C, r = seededRandom('dn-rot-roof');
            _dnPath(c, t.poly); c.fillStyle = '#4a4650'; c.fill();
            c.strokeStyle = C.stoneHi; c.lineWidth = 4; c.stroke();
            const [cx, cy] = DN.CROWN, b = t.owner, X = b.x + cx, Y = b.y + cy;
            c.strokeStyle = 'rgba(232, 194, 122, 0.3)'; c.lineWidth = 1; c.beginPath();
            for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.moveTo(X + Math.cos(a) * 44, Y + Math.sin(a) * 44); c.lineTo(X + Math.cos(a) * 140, Y + Math.sin(a) * 140); }
            c.save(); _dnPath(c, t.poly); c.clip(); c.stroke(); c.restore();
            const pts = t.poly;
            for (let i = 0; i < pts.length; i++) {
                const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
                if (Math.abs(ay - by) < 0.5 && Math.abs(ay - (b.y + DN.ROT[2])) < 1) continue;           // (not along the core)
                const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 3));
                for (let k = 0; k < n; k++) {
                    const u = (k + 0.5) / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, ix = x + (X - x) * 0.05, iy = y + (Y - y) * 0.05;
                    c.fillStyle = r() < 0.5 ? C.leaf : C.leafHi; c.beginPath(); c.arc(ix, iy, 2.6 + r() * 2, 0, Math.PI * 2); c.fill();
                    if (r() < 0.2) { c.fillStyle = r() < 0.5 ? '#f3e8f0' : '#e78db2'; c.beginPath(); c.arc(ix + 1, iy - 1, 1, 0, Math.PI * 2); c.fill(); }
                }
            }
        }
        /** The lantern's top under the dome. */
        function _dnCrownRoof(c, e, t) {
            if (e) return;
            _dnPath(c, t.poly); c.fillStyle = DN.C.slateDk; c.fill(); c.strokeStyle = DN.C.gold; c.lineWidth = 2; c.stroke();
        }
        /** The canopy's top: dark glass in iron ribs fanning from the wall, a gold rim; lit from under at night. */
        function _dnCanopyRoof(c, e, t) {
            const pts = t.poly, b = t.owner, C = DN.C;
            const wy = b.y + DN.ROT[2], [cx] = _dnCentre(pts);
            if (e) { _dnPath(c, pts); c.fillStyle = 'rgba(255, 210, 150, 0.22)'; c.fill(); return; }
            _dnPath(c, pts); { const g = c.createLinearGradient(0, wy, 0, wy + 66); g.addColorStop(0, '#1e1a22'); g.addColorStop(1, '#2c2630'); c.fillStyle = g; c.fill(); }
            c.strokeStyle = 'rgba(232, 194, 122, 0.4)'; c.lineWidth = 0.8; c.beginPath();
            for (const [x, y] of pts) { if (Math.abs(y - wy) < 1) continue; c.moveTo(cx, wy); c.lineTo(x, y); } c.stroke();
            c.strokeStyle = C.gold; c.lineWidth = 1.8; _dnPath(c, pts); c.stroke();
            c.fillStyle = 'rgba(255, 255, 255, 0.06)'; _dnPath(c, pts); c.fill();
        }

        /** The canopy's iron cresting: a rail round its curve, scrolls, gold finials at the corners. */
        function _dnCresting(ctx, e, t, b) {
            if (e || _zoomLOD >= 2) return;
            const wy = b.y + DN.ROT[2], pts = t.poly.filter(([, y]) => Math.abs(y - wy) > 0.5), z0 = t.z1, z1 = t.z1 + 4;
            const rail = new Path2D();
            pts.forEach(([x, y], j) => { const p = b._tkP(x, y, z1); j ? rail.lineTo(p[0], p[1]) : rail.moveTo(p[0], p[1]); });
            for (let j = 0; j < pts.length; j++) {
                const [x, y] = pts[j], p0 = b._tkP(x, y, z0), p1 = b._tkP(x, y, z1 + (j % 2 ? 0 : 1.6));
                rail.moveTo(p0[0], p0[1]); rail.lineTo(p1[0], p1[1]);
            }
            ctx.strokeStyle = DN.C.iron; ctx.lineWidth = 0.9; ctx.stroke(rail);
            ctx.fillStyle = DN.C.gold;
            for (const j of [0, pts.length - 1]) { const p = b._tkP(pts[j][0], pts[j][1], z1 + 2.4); ctx.beginPath(); ctx.arc(p[0], p[1], 1.4 * b._tkK(z1), 0, Math.PI * 2); ctx.fill(); }
        }
        /** The lantern's dome: slate rings up its curve, gold ribs, the gold emblem on its crown; lit gold at night. */
        function _dnDome(ctx, e, t, b) {
            const [cx, cy] = _dnCentre(t.poly), R = DN.CROWN[2] - 3, Hd = DN.Z.DOME, z0 = t.z1, N = 8;
            const ring = (i) => { const th = i / N * Math.PI / 2 * 0.92; return { z: z0 + Hd * Math.sin(th), r: R * Math.cos(th) }; };
            const top = ring(N);
            if (e) {
                const base = ctx.globalAlpha;
                LandmarkKit.flat(ctx, b._tkK(top.z), (c) => {
                    c.globalCompositeOperation = 'lighter';
                    glowA(c, cx, cy, 34, '255, 200, 120', base * 0.5);
                    c.globalAlpha = base; c.fillStyle = 'rgba(255, 236, 190, 0.9)'; _dnEmblem(c, cx, cy, 13);
                });
                LandmarkKit.flat(ctx, b._tkK(z0 + 1), (c) => { c.globalCompositeOperation = 'lighter'; c.globalAlpha = base; c.beginPath(); c.arc(cx, cy, R + 2, 0, Math.PI * 2); c.strokeStyle = 'rgba(255, 220, 160, 0.6)'; c.lineWidth = 2; c.stroke(); });
                ctx.globalAlpha = base; return;
            }
            for (let i = 0; i <= N; i++) {
                const q = ring(i), s = 0.5 + 0.5 * (i / N);
                LandmarkKit.flat(ctx, b._tkK(q.z), (c) => {
                    c.beginPath(); c.arc(cx, cy, q.r, 0, Math.PI * 2);
                    c.fillStyle = `rgb(${Math.round(40 + 40 * s)}, ${Math.round(42 + 42 * s)}, ${Math.round(54 + 46 * s)})`; c.fill();
                    if (i === 0) { c.lineWidth = 2; c.strokeStyle = DN.C.goldDk; c.stroke(); }
                    if (i === N) { c.fillStyle = DN.C.gold; _dnEmblem(c, cx, cy, 13); c.strokeStyle = DN.C.goldDk; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, q.r, 0, Math.PI * 2); c.stroke(); }
                });
            }
            if (_zoomLOD >= 2) return;
            ctx.strokeStyle = 'rgba(232, 194, 122, 0.55)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (let i = 0; i < N; i++) { const q = ring(i), p = b._tkP(cx + Math.cos(a) * q.r, cy + Math.sin(a) * q.r, q.z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } }
            ctx.stroke();
        }
        /** A clipped cone of box out of its planter. */
        function _dnTopiary(ctx, e, t, b) {
            if (e) return;
            const [cx, cy] = _dnCentre(t.poly), N = _zoomLOD >= 1 ? 4 : 6, R = 7.5, Hc = 26;
            for (let i = 0; i <= N; i++) {
                const u = i / N, z = t.z1 + Hc * u, rr = R * (1 - u) + 0.8, s = 0.55 + 0.45 * u;
                LandmarkKit.flat(ctx, b._tkK(z), (c) => {
                    c.fillStyle = `rgb(${Math.round(30 * s + 10)}, ${Math.round(74 * s + 16)}, ${Math.round(44 * s + 12)})`;
                    c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill();
                    c.fillStyle = 'rgba(150, 200, 120, 0.16)'; c.beginPath(); c.arc(cx - rr * 0.3, cy - rr * 0.3, rr * 0.45, 0, Math.PI * 2); c.fill();
                });
            }
        }

        // ── the building ──

        class DoubleNightsBuilding extends TieredBuilding {
            /** It keeps the 'double_nights' style (its ground pass and the street trees go by it), none of the old body's settings. */
            _applyStyle(config) {
                this.style = 'double_nights';
                this._seed = Math.round(this.x * 0.37 + this.y * 1.13);
                this.roofFeatures = [];
                this.emissiveReach = 700;                                          // the searchlights reach well past it
            }
            _setupSign() { this.attachedSign = null; }
            /** The door: the glazed entrance at the rotunda's foot. */
            _setupDoor(doorConfig) {
                const D = DN.DOOR;
                this._doorLightColor = null;
                this.attachedTransition = { x: this.x + D.x, y: this.y + D.y, w: D.w, h: D.h, target: doorConfig.target, label: doorConfig.label };
            }
            _generateLights() {}
            _dnDrawSign() {}                                                       // (its name is on the rotunda's wall)
            /** A tier standing out in front of a wall (front: the canopies) draws right after the one it's on, or that wall, below its top, would paint over it. */
            _tkOrder() {
                const order = super._tkOrder(), fronts = order.filter(t => t.front);
                if (!fronts.length) return order;
                const rest = order.filter(t => !t.front);
                for (const f of fronts) rest.splice(rest.indexOf(f.support) + 1, 0, f);
                return rest;
            }
            /** Kept clear of street trees and lamps (engine/map-loading.js): all it draws on the ground, the registry's apron. */
            _dnForecourt() { return { x: this.x - 10, y: this.y + 380, w: 820, h: 480 }; }

            /** Its shade on the ground, close under it (the tiers' own sun shadows do the rest). */
            drawBase(ctx) {
                ctx.save(); ctx.fillStyle = 'rgba(6, 3, 8, 0.45)';
                for (const s of this.sections) ctx.fillRect(this.x + s.x + 4, this.y + s.y + 5, s.w, s.h);
                ctx.restore();
            }

            /** Solid: its walls, and out front the planters, the posts, the plinth and the cars. */
            getCollisionShapes() {
                const s = super.getCollisionShapes(), X = this.x, Y = this.y;
                for (const [x, y] of DN.TOPI) s.push({ x: X + x - 7, y: Y + y - 7, w: 14, h: 14 });
                for (const [x, y] of DN.LAMPS) s.push({ x: X + x - 3, y: Y + y - 3, w: 6, h: 6 });
                const [px, py, pw, ph] = DN.PLINTH; s.push({ x: X + px, y: Y + py, w: pw, h: ph });
                for (const [x, y] of DN.CARS) s.push({ x: X + x - 48, y: Y + y - 20, w: 96, h: 40 });
                return s;
            }

            /** The ground in front, painted once; the cars, the doormen. */
            _dnDrawGround(ctx) {
                const s = LandmarkKit.sprite(this, 'dn_court', this.x - 10, this.y + 318, 820, 542, 1.5, (c) => this._dnPaintGround(c));
                ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
                this._dnCars(ctx);
                this._dnDoormen(ctx);
            }

            _dnPaintGround(c) {
                const X = (x) => this.x + x, Y = (y) => this.y + y, r = seededRandom('dn-court'), C = DN.C;
                // the terrace along the front: pale marble slabs, a brass line, three steps down
                for (let y = 320; y < 470; y += 16) for (let x = 10, k = 0; x < 790; x += 24, k++) { c.fillStyle = (k + (y / 16 | 0)) % 2 ? '#8d867b' : '#857e73'; c.fillRect(X(x) + 0.5, Y(y) + 0.5, 23, 15); }
                c.fillStyle = 'rgba(255, 255, 255, 0.07)'; for (let i = 0; i < 60; i++) c.fillRect(X(10 + r() * 780), Y(322 + r() * 146), 6 + r() * 14, 0.8);
                c.strokeStyle = C.goldDk; c.lineWidth = 1.2; c.strokeRect(X(14), Y(322), 772, 144);
                for (let k = 0; k < 3; k++) { c.fillStyle = ['#7b756b', '#716b62', '#68625a'][k]; c.fillRect(X(10), Y(470 + k * 5), 780, 5); c.fillStyle = 'rgba(0, 0, 0, 0.25)'; c.fillRect(X(10), Y(474.4 + k * 5), 780, 0.6); }
                // the drop-off lane: basalt setts between kerbs
                c.fillStyle = '#34313a'; c.fillRect(X(-10), Y(486), 820, 104);
                for (let y = 488; y < 588; y += 6) for (let x = -10 + ((y / 6 | 0) % 2) * 4; x < 810; x += 8) { const v = r(); c.fillStyle = v < 0.33 ? '#3e3a44' : v < 0.66 ? '#38353f' : '#423e48'; c.fillRect(X(x) + 0.5, Y(y) + 0.5, 7, 5); }
                for (const y of [486, 588]) { c.fillStyle = '#6e675d'; c.fillRect(X(-10), Y(y), 820, 3); c.fillStyle = 'rgba(255, 240, 210, 0.15)'; c.fillRect(X(-10), Y(y), 820, 0.8); }
                c.strokeStyle = 'rgba(232, 194, 122, 0.25)'; c.setLineDash([12, 10]); c.lineWidth = 1; c.beginPath(); c.moveTo(X(-10), Y(538)); c.lineTo(X(810), Y(538)); c.stroke(); c.setLineDash([]);
                // the plaza: granite slabs, a marble walk down the middle
                for (let y = 591; y < 860; y += 30) for (let x = -10; x < 810; x += 30) { const v = r(); c.fillStyle = v < 0.5 ? '#4f4b55' : '#55515b'; c.fillRect(X(x) + 0.6, Y(y) + 0.6, 29, 29); }
                for (let y = 591; y < 860; y += 20) for (let x = 340; x < 460; x += 30) { c.fillStyle = ((x + y) / 10 | 0) % 2 ? '#7a746b' : '#837d73'; c.fillRect(X(x) + 0.5, Y(y) + 0.5, 29, 19); }
                c.strokeStyle = C.goldDk; c.lineWidth = 1; c.strokeRect(X(340), Y(591), 120, 270);
                // the medallion: brass rings, rays, the double crescent inlaid in gold
                const [mx, my, mr] = DN.MEDAL;
                c.fillStyle = '#2c2930'; c.beginPath(); c.arc(X(mx), Y(my), mr, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(232, 194, 122, 0.3)'; c.lineWidth = 1; c.beginPath();
                for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; c.moveTo(X(mx) + Math.cos(a) * 34, Y(my) + Math.sin(a) * 34); c.lineTo(X(mx) + Math.cos(a) * (mr - 6), Y(my) + Math.sin(a) * (mr - 6)); }
                c.stroke();
                for (const [rr, w] of [[mr, 3], [mr - 6, 1], [32, 1.5]]) { c.strokeStyle = C.goldDk; c.lineWidth = w; c.beginPath(); c.arc(X(mx), Y(my), rr, 0, Math.PI * 2); c.stroke(); }
                c.fillStyle = C.gold; _dnEmblem(c, X(mx), Y(my), 26);
                // the lawns either side: a box hedge round them, flowers, a clipped ball or two
                for (const [x0, x1] of [[-10, 170], [630, 810]]) {
                    c.fillStyle = '#1f3d22'; c.fillRect(X(x0), Y(640), x1 - x0, 220);
                    c.fillStyle = '#2f5230'; c.fillRect(X(x0) + 7, Y(647), x1 - x0 - 14, 213);
                    for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.5 ? '#3a6338' : 'rgba(10, 30, 14, 0.5)'; c.fillRect(X(x0 + 8 + r() * (x1 - x0 - 16)), Y(648 + r() * 210), 2, 2); }
                    for (let i = 0; i < 120; i++) { const v = r(); c.fillStyle = v < 0.4 ? '#f2eaf3' : v < 0.75 ? '#c79bff' : '#ff9ccf'; c.beginPath(); c.arc(X(x0 + 12 + r() * (x1 - x0 - 24)), Y(652 + r() * 40), 1.2 + r(), 0, Math.PI * 2); c.fill(); }
                    for (const [bx, by] of [[x0 + 50, 740], [x1 - 50, 800]]) {
                        c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.beginPath(); c.arc(X(bx) + 3, Y(by) + 4, 15, 0, Math.PI * 2); c.fill();
                        const g = c.createRadialGradient(X(bx) - 4, Y(by) - 4, 2, X(bx), Y(by), 15); g.addColorStop(0, '#4d8650'); g.addColorStop(1, '#173a1e'); c.fillStyle = g; c.beginPath(); c.arc(X(bx), Y(by), 14, 0, Math.PI * 2); c.fill();
                    }
                }
                // wet: puddles holding the sky, a dark sheen
                for (let i = 0; i < 18; i++) {
                    const x = 0 + r() * 800, y = 492 + r() * 360;
                    if (y > 640 && (x < 175 || x > 625)) continue;
                    const w = 14 + r() * 34, h = 4 + r() * 8;
                    c.fillStyle = 'rgba(18, 18, 34, 0.32)'; c.beginPath(); c.ellipse(X(x), Y(y), w, h, 0, 0, Math.PI * 2); c.fill();
                    c.fillStyle = 'rgba(190, 200, 230, 0.12)'; c.beginPath(); c.ellipse(X(x) - w * 0.2, Y(y) - h * 0.2, w * 0.5, h * 0.3, 0, 0, Math.PI * 2); c.fill();
                }
                // the lamp posts' footings
                for (const [x, y] of DN.LAMPS) { c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.fillRect(X(x) - 4, Y(y) - 3, 10, 10); c.fillStyle = '#26222a'; c.fillRect(X(x) - 5, Y(y) - 5, 10, 10); }
            }

            /** The black cars waiting in the lane. */
            _dnCars(ctx) {
                if (typeof carSprite !== 'function' || typeof VEHICLE_BRANDS === 'undefined' || !VEHICLE_BRANDS.LADY) return;
                const m = VEHICLE_BRANDS.LADY.models.suv; if (!m) return;
                const v = this._dnV || (this._dnV = { brand: 'LADY', model: 'suv', visualStyle: VEHICLE_BRANDS.LADY.visualStyle, length: m.length, width: m.width, noHearseCap: !!m.noHearseCap, color: '#050505', glowColor: null });
                const sp = carSprite(v), P = CAR_ART.PAD;
                for (const [lx, ly, a] of DN.CARS) {
                    ctx.save(); ctx.translate(this.x + lx, this.y + ly); ctx.rotate(a);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.beginPath(); ctx.roundRect(-sp.L / 2 - 2, -sp.W / 2 + 2, sp.L + 4, sp.W, 10); ctx.fill();
                    ctx.drawImage(sp.cv, -sp.L / 2 - P, -sp.W / 2 - P, sp.L + P * 2, sp.W + P * 2);
                    ctx.restore();
                }
            }

            /** The doormen at the canopies, in the house's gold livery; they turn to whoever comes near. */
            _dnDoormen(ctx) {
                const cam = typeof game !== 'undefined' ? game.camera : null;
                if (!cam || Math.hypot(this.x + 400 - cam.x, this.y + 400 - cam.y) > 1500) return;
                const D = this._dnDM || (this._dnDM = DN.DOORMEN.map(([x, y], i) => ({ x: this.x + x, y: this.y + y, angle: Math.PI / 2, walkPhase: 0, look: ROLE_LOOKS.dn_staff('gold', seededRandom('dn-door' + i)) })));
                const p = game.player;
                for (const m of D) {
                    const near = p && p.visible !== false && Math.hypot(p.x - m.x, p.y - m.y) < 160;
                    const want = near ? Math.atan2(p.y - m.y, p.x - m.x) : Math.PI / 2;
                    let da = want - m.angle; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
                    m.angle += da * 0.08;
                    m.look.pose = 'concierge';
                    gaitCommand(m, 0, 0);
                    if (!decorativeBodyInView(m.x, m.y, m.look)) { tickHiddenDecorativeBody(m, m.look); continue; }
                    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle); drawProceduralHumanoid(ctx, m, { stance: 'idle', ...m.look }); ctx.restore();
                }
            }

            drawTop(ctx, worldMinutes) {
                super.drawTop(ctx, worldMinutes);
                if (CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera) this._dnPosts(ctx, false);
            }

            /** The lamp posts: an iron column, a lantern on top, a black banner with the gold emblem on an arm (turned outward). */
            _dnPosts(ctx, e) {
                const C = DN.C, fine = _zoomLOD < 2;
                for (const [lx, ly] of DN.LAMPS) {
                    const x = this.x + lx, y = this.y + ly, s = lx < 400 ? -1 : 1;
                    const P = (dx, z) => this._tkP(x + dx, y, z), kL = this._tkK(38);
                    if (e) { const q = P(0, 38); glowA(ctx, q[0], q[1], 24 * kL, '255, 210, 140', 0.9); continue; }
                    ctx.lineCap = 'round';
                    let a = P(0, 0), b2 = P(0, 6); ctx.strokeStyle = C.iron; ctx.lineWidth = 4 * this._tkK(3); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
                    a = P(0, 6); b2 = P(0, 34); ctx.lineWidth = 1.8 * this._tkK(20); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
                    if (fine) {                                                                    // the arm and its banner
                        a = P(0, 30); b2 = P(s * 9, 30); ctx.lineWidth = 0.8 * kL; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
                        const q = [P(s * 2, 29.5), P(s * 9, 29.5), P(s * 9, 15), P(s * 5.5, 17.5), P(s * 2, 15)];
                        ctx.fillStyle = '#121016'; ctx.beginPath(); q.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = C.goldDk; ctx.lineWidth = 0.6; ctx.stroke();
                        const m = P(s * 5.5, 24.5), k = this._tkK(24);
                        ctx.save(); ctx.translate(m[0], m[1]); ctx.scale(k, k); ctx.fillStyle = C.gold; _dnEmblem(ctx, 0, 0, 2.6); ctx.restore();
                    }
                    const g0 = P(0, 34), g1 = P(0, 42), w = 2.6 * kL;                               // the lantern
                    ctx.fillStyle = '#efe0b0'; ctx.fillRect(Math.min(g0[0], g1[0]) - w, Math.min(g0[1], g1[1]), w * 2, Math.abs(g1[1] - g0[1]) + 0.5);
                    ctx.strokeStyle = C.iron; ctx.lineWidth = 0.7; ctx.strokeRect(Math.min(g0[0], g1[0]) - w, Math.min(g0[1], g1[1]), w * 2, Math.abs(g1[1] - g0[1]) + 0.5);
                    const cap = P(0, 44); ctx.fillStyle = C.iron; ctx.beginPath(); ctx.arc(cap[0], cap[1], w * 1.1, 0, Math.PI * 2); ctx.fill();
                }
            }

            /** Night: the tiers' light, the lamps, the canopies' and entrance's light on the wet stone and its reflections, the searchlights. */
            drawEmissive(ctx, dark, beamsOnly) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                if (!beamsOnly) {
                    super.drawEmissive(ctx, dark, false);
                    this._dnGroundGlow(ctx, dark);
                }
                this._dnBeams(ctx, dark);
            }

            _dnGroundGlow(ctx, dark) {
                if (dark < 0.05) return;
                const glow = this._tkGlow(dark), X = this.x, Y = this.y, wet = typeof game !== 'undefined' && game.weather && game.weather.isRaining ? 1 : 0.65;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // light pooled under the canopies and at the entrance, round the plinth
                for (const [x0, x1] of DN.CAN) glowA(ctx, X + (x0 + x1) / 2, Y + 380, 120, '255, 200, 130', 0.32 * glow);
                glowA(ctx, X + 400, Y + 460, 130, '255, 206, 140', 0.38 * glow);
                glowA(ctx, X + DN.PLINTH[0] + 22, Y + DN.PLINTH[1] + 22, 34, '255, 210, 150', 0.4 * glow);
                for (const [lx, ly] of DN.LAMPS) glowA(ctx, X + lx, Y + ly, 80, '255, 200, 130', 0.22 * glow);
                // the reflections in the wet stone, stretched toward the eye
                ctx.save(); ctx.beginPath(); ctx.rect(X - 10, Y + 330, 820, 530); ctx.clip();
                for (const [x0, x1] of DN.CAN) this._dnStreak(ctx, X + (x0 + x1) / 2, Y + 392, 30, 34, 0.32 * glow * wet);
                this._dnStreak(ctx, X + 400, Y + 436, 44, 30, 0.4 * glow * wet);
                for (const [lx, ly] of DN.LAMPS) this._dnStreak(ctx, X + lx, Y + ly + 4, 26, 22, 0.42 * glow * wet);
                ctx.restore();
                ctx.globalAlpha = Math.min(1, glow); this._dnPosts(ctx, true);
                ctx.restore();
            }
            /** A light's reflection on wet ground: a gold streak from under it toward the camera, longer the higher the light, with a ripple. */
            _dnStreak(ctx, x, y, h, w, a) {
                if (a < 0.01) return;
                const cam = game.camera; let dx = cam.x - x, dy = cam.y - y; const D = Math.hypot(dx, dy) || 1; dx /= D; dy /= D;
                const len = Math.min(D + 40, 70 + h * 3.4), ex = x + dx * len, ey = y + dy * len, nx = -dy, ny = dx, t = _gameTimeSec;
                const g = ctx.createLinearGradient(x, y, ex, ey);
                g.addColorStop(0, 'rgba(255, 206, 130, 1)'); g.addColorStop(0.3, 'rgba(255, 190, 110, 0.45)'); g.addColorStop(1, 'rgba(255, 180, 100, 0)');
                ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = g;
                const w0 = w * 0.5, w1 = w * 0.8;
                ctx.beginPath(); ctx.moveTo(x + nx * w0, y + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1); ctx.lineTo(ex - nx * w1, ey - ny * w1); ctx.lineTo(x - nx * w0, y - ny * w0); ctx.closePath(); ctx.fill();
                if (_zoomLOD >= 1) return;
                ctx.fillStyle = 'rgba(255, 236, 190, 1)';                                          // glints breaking it up
                for (let i = 0; i < 7; i++) {
                    const u = 0.08 + i * 0.12, wob = Math.sin(t * 2.2 + i * 1.9 + x * 0.01) * w * 0.25, px = x + dx * len * u + nx * wob, py = y + dy * len * u + ny * wob;
                    ctx.globalAlpha = Math.min(1, a * (1 - u) * (0.6 + 0.4 * Math.sin(t * 3.1 + i)));
                    ctx.beginPath(); ctx.ellipse(px, py, w * 0.22 * (1 - u * 0.5), 1, Math.atan2(ny, nx), 0, Math.PI * 2); ctx.fill();
                }
            }

            /** Two gold searchlights from the rotunda's roof, crossing over it. */
            _dnBeams(ctx, dark) {
                if (dark < 0.2 || _zoomLOD >= 2) return;
                const t = _gameTimeSec, a = Math.min(1, (dark - 0.2) / 0.3), z0 = DN.Z.ROT + 4;
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
                DN.BEAMS.forEach(([lx, ly], i) => {
                    const ph = i * 2.4, sx = this.x + lx, sy = this.y + ly;
                    const az = -Math.PI / 2 + (i ? 0.45 : -0.45) + Math.sin(t * 0.2 + ph) * 0.9, elev = 1.02 + 0.16 * Math.sin(t * 0.12 + ph * 1.7);
                    const C = leanCamHeight(), zTop = C * 0.8, run = (zTop - z0) / Math.tan(elev);
                    const p0 = this._tkP(sx, sy, z0), cam = game.camera, k1 = C / (C - Math.min(zTop, C * 0.86)), ex = sx + Math.cos(az) * run, ey = sy + Math.sin(az) * run;
                    const p1 = [cam.x + (ex - cam.x) * k1, cam.y + (ey - cam.y) * k1];
                    const vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
                    const beam = (w0, w1, c0, c1) => {
                        const gr = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); gr.addColorStop(0, c0); gr.addColorStop(0.3, c1); gr.addColorStop(1, 'rgba(255, 210, 140, 0)');
                        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(p0[0] + nx * w0, p0[1] + ny * w0); ctx.lineTo(p1[0] + nx * w1, p1[1] + ny * w1); ctx.lineTo(p1[0] - nx * w1, p1[1] - ny * w1); ctx.lineTo(p0[0] - nx * w0, p0[1] - ny * w0); ctx.closePath(); ctx.fill();
                    };
                    const w1 = Math.max(60, L * 0.13);
                    beam(6, w1, `rgba(255, 214, 150, ${0.18 * a})`, `rgba(255, 196, 120, ${0.06 * a})`);
                    beam(2, w1 * 0.3, `rgba(255, 246, 225, ${0.28 * a})`, `rgba(255, 214, 150, ${0.07 * a})`);
                    glowA(ctx, p0[0], p0[1], 14, '255, 248, 230', 0.9 * a);
                });
                ctx.restore();
            }
        }
        TierKit.profile(DoubleNightsBuilding);

        /** The Double Nights Hotel: x, y its corner; it fronts south. */
        function createDoubleNightsHotel(x, y, config = {}) {
            const Z = DN.Z, C = DN.C, G = DN.G;
            const cornice = (z, out = 4, th = 4.5) => ({ z, out, th, top: C.stoneHi, band: [200, 186, 160], lip: C.cream });
            const stone = (z1) => [{ z: 2.4, out: 1.2, th: 2.4, top: C.stoneLo, band: [120, 108, 94] }, cornice(G, 2.2, 2.6), cornice(z1)];
            const iron = (z) => ({ z, out: 3.2, th: 1.3, top: '#4a4048', band: [52, 44, 46], lip: 'rgba(232, 194, 122, 0.8)' });
            const circle = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos(-i * Math.PI * 2 / n) * r, cy + Math.sin(-i * Math.PI * 2 / n) * r]);
            const [rx0, rx1, ry, rch, rdp] = DN.ROT, [cx, cy, cr] = DN.CROWN;
            const wing = (id, x0, doorX) => ({ id, rect: [x0, 40, 250, 280], z0: 0, z1: Z.WING, S: 2, fill: C.stone, shade: [40, 30, 24], ledges: stone(Z.WING), roofRes: 1, roof: _dnLeadRoof,
                paint: (d, l, t, H, L) => _dnFacade(d, l, t, H, L, { seed: 7100 + x0, bay: 26, doors: [doorX], balc: (f, k, i) => f === 33 ? (i % 2 ? 2 : 0) : f === 66 ? 1 : 0 }) });
            const mansard = (id, on, x0) => ({ id, on, rect: [x0 + 10, 50, 230, 260], z0: Z.WING, z1: Z.MANS, S: 2, fill: C.slate, paint: _dnMansard, shade: [14, 16, 24],
                ledges: [{ z: Z.MANS, out: 1.5, th: 1.8, top: '#8a8c96', band: [110, 112, 122] }], roofRes: 1, roofGlow: true, roof: _dnZincRoof });
            const canopy = (id, on, x0, x1, text) => ({ id, on, front: true, solid: false, cx: (x0 + x1) / 2, poly: TierKit.bay(x0, x1, ry, 2, 64, 12), z0: Z.CAN0, z1: Z.CAN1, S: 4, fill: C.lacquer,
                paint: _dnCanopyArt(text), shade: [10, 8, 14], ledges: [{ z: Z.CAN1, out: 1.2, th: 1.4, top: C.goldDk, band: [154, 122, 62], lip: C.goldHi }],
                roofRes: 2, roofGlow: true, roof: _dnCanopyRoof, top: _dnCresting });
            const topiary = (id, lx, ly) => ({ id, solid: false, poly: circle(lx, ly, 7, 8), z0: 0, z1: 7, S: 3, fill: C.lacquer, paint: _dnPot, shade: [10, 8, 14],
                roof: (c, e, t) => { if (!e) { _dnPath(c, t.poly); c.fillStyle = '#2a1e16'; c.fill(); } }, top: _dnTopiary, rise: 28 });
            const [px, py, pw, ph] = DN.PLINTH;
            const b = new DoubleNightsBuilding({
                id: 'double_nights', x, y, label: 'Double Nights Hotel', type: 'hotel', style: 'double_nights', facing: 'S', hero: DN.HERO, plan: DN.PLAN,
                roofColor: '#3e4250', roofLightColor: '#5a5f70', wallColor: C.stone, wallLightColor: C.stoneHi, accentColor: '#ffcf8a',
                windowColor: '#242733', windowLitColor: '#ffd696', windowFrameColor: C.iron, balconies: [], roofProps: [{ type: 'vent', section: 0, x: 20, y: 20, w: 1, h: 1 }],
                sign: { text: 'Double Nights', color: '#e3c07a', size: 32 },
                door: { target: config.doorTarget || 'hotel_lobby', label: 'Enter Hotel', lightColor: null },
                tiers: [
                    wing('wingW', 20, 170), wing('wingE', 530, 630),
                    { id: 'core', rect: [270, 0, 260, 320], z0: 0, z1: Z.CORE, S: 2, fill: C.stone, shade: [40, 30, 24], ledges: stone(Z.CORE), roofRes: 1, roof: _dnLeadRoof,
                      paint: (d, l, t, H, L) => _dnFacade(d, l, t, H, L, { seed: 7207, bay: 26, balc: (f) => f >= 99 ? 1 : 0 }) },
                    { id: 'rotunda', solid: false, poly: TierKit.bay(rx0, rx1, ry, rch, rdp, 16), z0: 0, z1: Z.ROT, S: 3, fill: C.stone, paint: _dnRotunda, shade: [40, 30, 24],
                      ledges: [...stone(Z.ROT), iron(37), iron(77), iron(88), iron(99), iron(110), iron(121)], roofRes: 1.5, roof: _dnRotundaRoof },
                    mansard('mansW', 'wingW', 20), mansard('mansE', 'wingE', 530),
                    { id: 'attic', on: 'core', rect: [284, 12, 232, 296], z0: Z.CORE, z1: Z.ATTIC, S: 2, fill: C.slate, paint: _dnMansard, shade: [14, 16, 24],
                      ledges: [{ z: Z.ATTIC, out: 1.5, th: 1.8, top: '#8a8c96', band: [110, 112, 122] }], roofRes: 1, roofGlow: true, roof: _dnPenthouseRoof },
                    { id: 'crown', on: 'rotunda', poly: circle(cx, cy, cr, 24), z0: Z.ROT, z1: Z.CROWN, S: 3, fill: C.stone, paint: _dnLantern, shade: [40, 30, 24],
                      ledges: [cornice(Z.CROWN, 2.5, 3)], roofRes: 1.5, roof: _dnCrownRoof, top: _dnDome, rise: Z.DOME + 4 },
                    canopy('canW', 'wingW', ...DN.CAN[0]), canopy('canE', 'wingE', ...DN.CAN[1]),
                    { id: 'plinth', solid: false, rect: [px, py, pw, ph], z0: 0, z1: Z.PLINTH, S: 5, fill: '#26222a', paint: _dnPlinthArt, shade: [10, 8, 14],
                      ledges: [{ z: Z.PLINTH, out: 1.2, th: 1.6, top: '#3a3540', band: [70, 62, 72], lip: C.gold }], roof: (c, e, t) => { if (!e) { _dnPath(c, t.poly); c.fillStyle = '#3a3540'; c.fill(); } } },
                    ...DN.TOPI.map(([lx, ly], i) => topiary('topi' + i, lx, ly))
                ],
                ...config,
                facing: 'S'   // (a landmark keeps its own front, whatever street it's placed on)
            });
            for (const t of b._tkDefs) t.owner = b;                                                          // (the painters find the door and the sign in the building's frame)
            b.sections.push(..._dnRotundaBands());                                                           // (the rotunda's curve, in bands)
            // its lights (light only, no fixtures): under the canopies, the entrance, the lamp posts, the plinth, uplights along the front, the terrace
            for (const [lx, ly, color, r] of [[170, 372, '#ffd9a0', 190], [630, 372, '#ffd9a0', 190], [400, 452, '#ffd08a', 230], [400, 560, '#ffc890', 160],
                                              ...DN.LAMPS.map(([lx, ly]) => [lx, ly, '#ffcf8a', 150]), [608, 672, '#ffd08a', 80],
                                              [60, 328, '#ffcf95', 110], [740, 328, '#ffcf95', 110], [400, 730, '#ffc870', 140]]) {
                const lamp = new LampEntity({ x: b.x + lx, y: b.y + ly, lampType: 3, color, lightRadius: r }); lamp.keepColor = true; lamp.visible = false; b.attachedLights.push(lamp);
            }
            b.topReach = 130; b.glowReach = 130;
            b.viewDrift = true;   // out in front of it, the view drifts toward it (engine/draw.js _landmarkDriftTarget)
            return b;
        }
