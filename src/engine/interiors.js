        // GameEngine — Apartment and clinic interiors, the city backdrop from the veranda, mission marker.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        /* =====================================================================
           INTERIOR_ART — each painted place: its floor (under the lighting, draw.js)
           and its glow (after the darkness, world-state.js drawEmissivePass).
           A new place adds one line here; the painters live below and in keeper-art.js.
           ===================================================================== */
        const INTERIOR_ART = {
            apt_949:             { floor: (g, c) => { g.drawApartmentBackdrop(c); g.drawApartmentInterior(c); }, glow: (g, c) => g.drawApartmentGlow(c) },
            medbay_sw:           { floor: (g, c) => g.drawClinicInterior(c) },
            house_of_death:      { floor: (g, c) => g.drawHouseInterior(c),   glow: (g, c) => g.drawHouseGlow(c) },
            hotel_lobby:         { floor: (g, c) => g.drawLobbyInterior(c),   glow: (g, c) => g.drawLobbyGlow(c) },
            hotel_suite:         { floor: (g, c) => g.drawSuiteInterior(c),   glow: (g, c) => g.drawSuiteGlow(c) },
            church_boss:         { floor: (g, c) => g.drawSanctumInterior(c), glow: (g, c) => { g.drawSanctumGlow(c); g.drawBossGlow(c); } },   // the Sanctum, then the Triumvirate's eyes
            moon_city_nightclub: { floor: (g, c) => { g.drawClubInterior(c); g.drawClubFloorLights(c); }, glow: (g, c) => g.drawClubGlow(c) },
            keepers_hill:        { floor: (g, c) => g.drawKeeperInterior(c),  glow: (g, c) => g.drawKeeperGlow(c) },   // the prologue's fireside (engine/keeper-art.js)
            keepers_parlor:      { floor: (g, c) => g.drawKeeperInterior(c),  glow: (g, c) => g.drawKeeperGlow(c) },
            van_interior:        { floor: (g, c) => g.drawVanInterior(c),     glow: (g, c) => g.drawVanGlow(c) },     // chapter 1's ride (engine/van-art.js)
            hub_949:             { glow: (g, c) => g.drawGraveyardGlow(c) },
            ethereal_plane:      { glow: (g, c) => g.drawEtherealGlow(c) },
            enni_cole_interior:  { floor: (g, c) => g.drawEnniInterior(c),    glow: (g, c) => g.drawEnniGlow(c) },
            cozy_cafe_interior:  { floor: (g, c) => g.drawCafeInterior(c),    glow: (g, c) => g.drawCafeGlow(c) },     // the hearth, candles, pendants, steam
            demoness_palace:     { floor: (g, c) => g.drawPalaceInterior(c), glow: (g, c) => g.drawPalaceGlow(c) }   // engine/palace-art.js      // engine/reflections.js: its mirror floor gives this back
        };

        engineMixin({
            /* =====================================================================
               APARTMENT CITY BACKDROP
               ---------------------------------------------------------------------
               Draws a simplified city view visible from the apartment veranda.
               Small buildings, neon glows, tiny car/pedestrian sprites for life.
               ===================================================================== */
            /** Clinic floor details: tiles, wayfinding stripe, scanner platform, curtain tracks. */
            /** apt_949 floor art: veranda deck, living-room planks, kitchen tiles, rugs, bedroom boards, bathroom tiles —
             *  painted once (released when she leaves: MAP_BAKES), like every other interior's floor. */
            drawApartmentInterior(ctx) {
                if (!this._aptFloor) this._aptFloor = this._paintAptFloor();
                ctx.drawImage(this._aptFloor, 0, 0);
            },

            _paintAptFloor() {
                const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 900;
                this._drawAptFloorArt(cv.getContext('2d'));
                return cv;
            },

            _drawAptFloorArt(ctx) {
                const lines = (x0, y0, x1, y1, step, vertical, color, lw = 1) => {
                    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
                    if (vertical) for (let x = x0 + step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
                    else for (let y = y0 + step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
                    ctx.stroke();
                };
                const rug = (x, y, w, h, base, border, inner) => {
                    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.roundRect(x + 3, y + 3, w, h, 8); ctx.fill();
                    ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
                    ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x + 7, y + 7, w - 14, h - 14, 5); ctx.stroke();
                    if (inner) { ctx.strokeStyle = inner; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 14, y + 14, w - 28, h - 28, 4); ctx.stroke(); }
                };
                ctx.save();
                lines(8, 8, 1392, 200, 14, false, 'rgba(0,0,0,0.16)');                                   // veranda deck boards
                lines(8, 208, 900, 892, 28, true, 'rgba(0,0,0,0.14)');                                   // living-room planks
                ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath();                                   // staggered plank joints
                for (let i = 0, x = 8; x < 900; x += 28, i++) for (let y = 208 + (i % 3) * 70; y < 892; y += 210) { ctx.moveTo(x, y); ctx.lineTo(x + 28, y); }
                ctx.stroke();
                ctx.fillStyle = '#4a2a2c'; ctx.fillRect(84, 690, 520, 202);                              // kitchen stone tiles
                lines(84, 690, 604, 892, 40, true, 'rgba(0,0,0,0.2)'); lines(84, 690, 604, 892, 40, false, 'rgba(0,0,0,0.2)');
                ctx.strokeStyle = 'rgba(239,230,220,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(84.5, 690.5, 520, 202);
                rug(320, 396, 334, 214, APT.wineLt, APT.blush, 'rgba(239,230,220,0.35)');                  // lounge rug
                lines(908, 208, 1392, 548, 24, true, 'rgba(255,255,255,0.05)');                          // bedroom boards
                rug(975, 270, 160, 130, '#8a5560', APT.blushLt, null);                                   // bedroom rug under the bed foot
                lines(908, 556, 1392, 892, 32, true, 'rgba(0,0,0,0.09)'); lines(908, 556, 1392, 892, 32, false, 'rgba(0,0,0,0.09)');   // bathroom tiles
                ctx.fillStyle = APT.blushLt; ctx.beginPath(); ctx.roundRect(1270, 672, 76, 30, 8); ctx.fill();   // bath mat
                ctx.restore();
            },

            /** The House of Death's floors, painted once into a cached canvas: checkered marble, parquet,
             *  flagstones, runners and rugs, the reliquary's gold ring. */
            drawHouseInterior(ctx) {
                if (!this._houseFloor) this._houseFloor = this._paintHouseFloor();
                ctx.drawImage(this._houseFloor, 0, 0);
            },

            _paintHouseFloor() {
                const cv = document.createElement('canvas'); cv.width = 1800; cv.height = 1500;
                const c = cv.getContext('2d');
                const fill = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
                const grid = (x0, y0, x1, y1, sx, sy, col, stagger = 0) => {
                    c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
                    for (let y = y0; y <= y1; y += sy) { c.moveTo(x0, y); c.lineTo(x1, y); }
                    for (let row = 0, y = y0; y < y1; y += sy, row++) for (let x = x0 + (row % 2) * stagger; x <= x1; x += sx) { c.moveTo(x, y); c.lineTo(x, Math.min(y1, y + sy)); }
                    c.stroke();
                };
                const rug = (x, y, w, h, base, border) => {
                    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.roundRect(x + 3, y + 3, w, h, 6); c.fill();
                    c.fillStyle = base; c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill();
                    c.strokeStyle = border; c.lineWidth = 2.5; c.beginPath(); c.roundRect(x + 8, y + 8, w - 16, h - 16, 4); c.stroke();
                    c.lineWidth = 1; c.beginPath(); c.roundRect(x + 14, y + 14, w - 28, h - 28, 3); c.stroke();
                };
                const runner = (x, y, w, h) => { fill(x, y, w, h, '#4a1624'); fill(x + 4, y, 2, h, 'rgba(201,164,106,0.55)'); fill(x + w - 6, y, 2, h, 'rgba(201,164,106,0.55)'); };
                const veins = (x0, y0, w, h, n, col, seed) => {
                    const r = seededRandom(seed); c.strokeStyle = col; c.lineWidth = 1;
                    for (let i = 0; i < n; i++) {
                        let x = x0 + r() * w, y = y0 + r() * h; c.beginPath(); c.moveTo(x, y);
                        for (let k = 0; k < 4; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 40; c.lineTo(Math.max(x0, Math.min(x0 + w, x)), Math.max(y0, Math.min(y0 + h, y))); }
                        c.stroke();
                    }
                };
                fill(0, 0, 1800, 1500, '#0d0a10');
                // Foyer: checkered marble, a gold rosette, the red carpet from the door to the hall
                for (let y = 1014, j = 0; y < 1500; y += 40, j++) for (let x = 574, i = 0; x < 1226; x += 40, i++) fill(x, y, 40, 40, (i + j) % 2 ? '#241e2c' : '#141018');
                veins(574, 1014, 652, 486, 14, 'rgba(255,255,255,0.05)', 11);
                runner(840, 1014, 120, 486);
                c.save(); c.translate(900, 1260); c.strokeStyle = 'rgba(201,164,106,0.7)'; c.lineWidth = 2;
                c.beginPath(); c.arc(0, 0, 54, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.stroke();
                c.fillStyle = 'rgba(201,164,106,0.55)'; c.beginPath();
                for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 14 : 38; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
                c.closePath(); c.fill(); c.restore();
                // Grand hall: big black-marble tiles, veined; a round rug beneath the chandelier
                fill(574, 444, 652, 556, '#141018'); grid(574, 444, 1226, 1000, 80, 80, 'rgba(201,164,106,0.10)');
                veins(574, 444, 652, 556, 18, 'rgba(255,255,255,0.05)', 7);
                c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(903, 723, 150, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#3a1226'; c.beginPath(); c.arc(900, 720, 150, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(201,164,106,0.6)'; c.lineWidth = 3; c.beginPath(); c.arc(900, 720, 136, 0, Math.PI * 2); c.stroke();
                c.strokeStyle = 'rgba(180,140,255,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.arc(900, 720, 110, 0, Math.PI * 2); c.stroke();
                c.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.moveTo(900 + Math.cos(a) * 40, 720 + Math.sin(a) * 40); c.lineTo(900 + Math.cos(a) * 108, 720 + Math.sin(a) * 108); } c.stroke();
                // Chapel: staggered flagstones and the aisle to the altar
                grid(574, 14, 1226, 430, 60, 40, 'rgba(0,0,0,0.35)', 30);
                runner(840, 130, 120, 300);
                // Library and dining: parquet; rugs
                for (const [x0, y0, x1, y1] of [[14, 14, 560, 430], [14, 444, 560, 1000]]) grid(x0, y0, x1, y1, 22, 66, 'rgba(0,0,0,0.25)', 11);
                rug(160, 160, 220, 120, '#2c2248', 'rgba(201,164,106,0.55)');
                rug(110, 555, 340, 160, '#4a1624', 'rgba(201,164,106,0.55)');
                // Kitchen: poured concrete, a cyan line along the counters
                grid(14, 1014, 560, 1486, 60, 60, 'rgba(255,255,255,0.05)');
                fill(20, 1426, 470, 2, 'rgba(127,224,255,0.45)');
                // Bedroom: plum carpet with a faint lattice; bath: white marble
                grid(1240, 14, 1560, 430, 24, 24, 'rgba(255,160,220,0.04)');
                rug(1320, 150, 160, 110, '#5a2a4a', 'rgba(236,208,154,0.45)');
                grid(1574, 14, 1786, 430, 40, 40, 'rgba(0,0,0,0.12)'); veins(1574, 14, 212, 416, 8, 'rgba(120,110,130,0.25)', 3);
                // Courtyard: flagstones with moss joints, a path cross to the fountain
                const r = seededRandom(5);
                for (let y = 444; y < 1000; y += 46) for (let x = 1240 + (((y - 444) / 46) % 2) * 23; x < 1786; x += 46) {
                    const v = r() * 10 | 0;                                // slate, faintly violet, moss in the joints
                    c.fillStyle = `rgb(${24 + v},${24 + v},${32 + v})`; c.fillRect(x + 2, y + 2, 42, 42);
                    if (r() < 0.3) { c.fillStyle = 'rgba(60,90,60,0.35)'; c.fillRect(x + (r() < 0.5 ? 0 : 42), y + 2, 2, 42); }
                }
                fill(1490, 444, 40, 556, 'rgba(120,110,140,0.22)'); fill(1240, 700, 546, 40, 'rgba(120,110,140,0.22)');
                // Gallery: dark boards, a runner round the L; reliquary: dark stone and a gold ritual ring
                grid(1240, 1014, 1786, 1164, 22, 150, 'rgba(0,0,0,0.3)'); grid(1636, 1164, 1786, 1486, 150, 22, 'rgba(0,0,0,0.3)');
                fill(1250, 1064, 480, 50, '#3a1226'); fill(1686, 1064, 50, 412, '#3a1226');
                grid(1240, 1178, 1622, 1486, 50, 50, 'rgba(0,0,0,0.35)', 25);
                c.strokeStyle = 'rgba(201,164,106,0.55)'; c.lineWidth = 2; c.beginPath(); c.arc(1435, 1315, 112, 0, Math.PI * 2); c.stroke();
                c.lineWidth = 1; c.beginPath(); c.arc(1435, 1315, 98, 0, Math.PI * 2); c.stroke();
                c.fillStyle = 'rgba(201,164,106,0.5)'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.fillRect(1435 + Math.cos(a) * 105 - 2, 1315 + Math.sin(a) * 105 - 2, 4, 4); }
                return cv;
            },

            /** The House's glows, after the darkness layer: candle flames, the chandelier, the altar's
             *  crystal, the coffin, holograms, stained glass. Room switches and the veil don't dim them. */
            drawHouseGlow(ctx) {
                const t = _frameTime / 1000;
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of this.props) {
                    if (!p.decorType || !p.decorType.startsWith('hod_')) continue;
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2, f = 0.8 + 0.2 * Math.sin(t * 9 + cx);
                    if (p.decorType === 'hod_candelabra') glow(cx, cy, 34, '255, 180, 110', 0.45 * f);
                    else if (p.decorType === 'hod_altar') glow(cx, cy, 46, '170, 110, 255', 0.45 + 0.15 * Math.sin(t * 2.2));
                    else if (p.decorType === 'hod_coffin') glow(cx, cy, 60, '150, 90, 255', 0.3 + 0.15 * Math.sin(t * 1.7));
                    else if (p.decorType === 'hod_console') glow(cx, cy, 28, '127, 224, 255', 0.35);
                    else if (p.decorType === 'hod_reliquary') glow(cx, cy, 20, '200, 150, 255', 0.35);
                    else if (p.decorType === 'hod_fountain') glow(cx, cy, 26, '170, 120, 255', 0.4);
                    else if (p.decorType === 'hod_table' && p.decor && p.decor.candles) { glow(p.x + p.width * 0.25, cy, 22, '255, 190, 120', 0.5 * f); glow(p.x + p.width * 0.75, cy, 22, '255, 190, 120', 0.5 * f); }
                }
                // The chandelier: a ring of flames over the hall
                for (let i = 0; i < 10; i++) {
                    const a = i * Math.PI / 5 + 0.2, x = 900 + Math.cos(a) * 46, y = 720 + Math.sin(a) * 46;
                    glow(x, y, 16, '255, 200, 140', 0.5 * (0.8 + 0.2 * Math.sin(t * 10 + i)));
                    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,236,200,0.9)'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
                }
                glow(900, 720, 90, '255, 190, 120', 0.18);
                // Stained glass on the chapel's north wall, lit from within
                for (const [x, rgb] of [[670, '190, 130, 255'], [900, '255, 120, 170'], [1130, '190, 130, 255']]) glow(x, 16, 40, rgb, 0.35);
                ctx.restore();
            },

            /** The Double Nights lobby floor, painted once: black marble veined silver, a checker border,
             *  the crimson runner, the twin gold crescents under the chandelier, the motto at the door. */
            drawLobbyInterior(ctx) {
                if (!this._lobbyFloor) this._lobbyFloor = this._paintLobbyFloor();
                ctx.drawImage(this._lobbyFloor, 0, 0);
            },

            _paintLobbyFloor() {
                const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 1200;
                const c = cv.getContext('2d'), r = seededRandom(949), GOLD = '#e8c27a', SILVER = '#dfe6ff';
                c.fillStyle = '#0c0a0c'; c.fillRect(0, 0, 1000, 1200);
                // Black marble slabs, each a touch different, veined in silver
                for (let y = 50; y < 1150; y += 100) for (let x = 50; x < 950; x += 100) {
                    const v = r() * 8 | 0; c.fillStyle = `rgb(${18 + v},${15 + v},${20 + v})`; c.fillRect(x, y, 100, 100);
                }
                c.strokeStyle = 'rgba(232,194,122,0.16)'; c.lineWidth = 1; c.beginPath();
                for (let x = 150; x < 950; x += 100) { c.moveTo(x, 50); c.lineTo(x, 1150); }
                for (let y = 150; y < 1150; y += 100) { c.moveTo(50, y); c.lineTo(950, y); }
                c.stroke();
                for (let i = 0; i < 46; i++) {
                    let x = 50 + r() * 900, y = 50 + r() * 1100; c.strokeStyle = `rgba(223,230,255,${0.05 + r() * 0.08})`; c.lineWidth = 0.5 + r();
                    c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.3) * 70; y += (r() - 0.5) * 50; c.lineTo(x, y); } c.stroke();
                }
                // Checker border in ivory and gold
                const sq = 15;
                for (let x = 50, i = 0; x < 950; x += sq, i++) for (const [y, j] of [[50, 0], [1135, 1]]) { c.fillStyle = (i + j) % 2 ? '#e9e2d2' : '#b8914a'; c.fillRect(x, y, sq, sq); }
                for (let y = 65, i = 0; y < 1135; y += sq, i++) for (const [x, j] of [[80, 0], [905, 1]]) { c.fillStyle = (i + j) % 2 ? '#e9e2d2' : '#b8914a'; c.fillRect(x, y, sq, sq); }
                // Gilt sunbursts before each elevator bay
                for (const [bx, dir] of [[80, 1], [920, -1]]) for (const by of [450, 650]) {
                    c.save(); c.translate(bx, by); c.globalAlpha = 0.55;
                    for (let k = 0; k < 13; k++) { const a = -Math.PI / 2 + k * Math.PI / 12; c.strokeStyle = k % 2 ? GOLD : '#a8823e'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(dir * Math.cos(a) * 60, Math.sin(a) * 60); c.stroke(); }
                    c.restore();
                }
                // Around the fountain, a gold ring
                c.strokeStyle = GOLD; c.lineWidth = 2; c.beginPath(); c.arc(500, 320, 92, 0, Math.PI * 2); c.stroke();
                c.strokeStyle = 'rgba(223,230,255,0.4)'; c.lineWidth = 1; c.beginPath(); c.arc(500, 320, 100, 0, Math.PI * 2); c.stroke();
                // The crimson runner, door to desk, gold-bordered with a diamond stitch
                c.fillStyle = '#5a0a18'; c.fillRect(440, 612, 120, 538);
                c.fillStyle = GOLD; c.fillRect(444, 612, 2, 538); c.fillRect(554, 612, 2, 538);
                c.fillStyle = 'rgba(232,194,122,0.35)';
                for (let y = 630; y < 1140; y += 26) { c.beginPath(); c.moveTo(500, y - 5); c.lineTo(505, y); c.lineTo(500, y + 5); c.lineTo(495, y); c.closePath(); c.fill(); }
                // The medallion: silver and gold rings, and the twin crescents overlapping at its heart
                const M = { x: 500, y: 850 };
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(M.x + 3, M.y + 4, 150, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#100c12'; c.beginPath(); c.arc(M.x, M.y, 150, 0, Math.PI * 2); c.fill();
                c.strokeStyle = SILVER; c.lineWidth = 3; c.beginPath(); c.arc(M.x, M.y, 148, 0, Math.PI * 2); c.stroke();
                c.strokeStyle = GOLD; c.lineWidth = 2; c.beginPath(); c.arc(M.x, M.y, 136, 0, Math.PI * 2); c.stroke();
                c.lineWidth = 1; c.beginPath(); c.arc(M.x, M.y, 128, 0, Math.PI * 2); c.stroke();
                for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; c.fillStyle = k % 2 ? SILVER : GOLD; c.beginPath(); c.arc(M.x + Math.cos(a) * 142, M.y + Math.sin(a) * 142, 2, 0, Math.PI * 2); c.fill(); }
                const crescent = (cx, cy, R, off, color) => {                 // a disc less an offset disc
                    const t = document.createElement('canvas'); t.width = t.height = R * 2 + 8; const k = t.getContext('2d');
                    const g = k.createLinearGradient(0, 0, t.width, t.height); g.addColorStop(0, '#fff1c2'); g.addColorStop(0.5, color); g.addColorStop(1, '#a8823e');
                    k.fillStyle = g; k.beginPath(); k.arc(R + 4, R + 4, R, 0, Math.PI * 2); k.fill();
                    k.globalCompositeOperation = 'destination-out'; k.beginPath(); k.arc(R + 4 + off, R + 4, R * 0.82, 0, Math.PI * 2); k.fill();
                    c.drawImage(t, cx - R - 4, cy - R - 4);
                };
                crescent(M.x - 26, M.y, 78, 30, GOLD);                         // ☾ opening right…
                crescent(M.x + 26, M.y, 78, -30, GOLD);                        // …☽ opening left, the two overlapping
                c.fillStyle = '#fff1c2'; c.beginPath(); c.arc(M.x, M.y, 5, 0, Math.PI * 2); c.fill();
                // The motto, set in gold at the door
                c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 17px Georgia, serif';
                c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillText('THINK EXCELLENCE  ✦  THINK DOUBLE NIGHTS', 501, 1107);
                c.fillStyle = GOLD; c.fillText('THINK EXCELLENCE  ✦  THINK DOUBLE NIGHTS', 500, 1106);
                c.restore();
                return cv;
            },

            /** The lobby after the darkness layer: the chandelier, the rift, the portals, sconces, gold
             *  light strips, the elevator doors, the departures board, the motto banner, drifting stars. */
            drawLobbyGlow(ctx) {
                const t = _frameTime / 1000;
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // The chandelier: three tiers of warm lights and crystal glints
                glow(500, 850, 170, '255, 200, 130', 0.12);
                for (const [R, n, a0] of [[74, 16, 0], [50, 12, 0.2], [26, 8, 0.4]]) for (let i = 0; i < n; i++) {
                    const a = a0 + i * Math.PI * 2 / n, x = 500 + Math.cos(a) * R, y = 850 + Math.sin(a) * R;
                    const tw = 0.7 + 0.3 * Math.sin(t * 4 + i * 1.7 + R);
                    glow(x, y, 9, '255, 214, 150', 0.3 * tw);
                    ctx.globalAlpha = tw; ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
                }
                for (let i = 0; i < 6; i++) {                                         // glints flashing across the crystals
                    const ph = (t * 0.7 + i / 6) % 1, a = i * 1.05 + t * 0.1, R = 20 + (i * 13) % 55;
                    if (ph < 0.12) { const k = 1 - ph / 0.12, x = 500 + Math.cos(a) * R, y = 850 + Math.sin(a) * R; ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 6 * k, y); ctx.lineTo(x + 6 * k, y); ctx.moveTo(x, y - 6 * k); ctx.lineTo(x, y + 6 * k); ctx.stroke(); }
                }
                // The rift fountain
                glow(500, 320, 70, '190, 130, 255', 0.16 + 0.05 * Math.sin(t * 1.3));
                // Portals: rings of spinning arcs in gold and violet (angles wrapped: huge ones break arc())
                for (const [px, py] of LOBBY_PORTALS) {
                    glow(px, py, 60, '200, 150, 255', 0.2);
                    ctx.lineWidth = 2;
                    for (let k = 0; k < 3; k++) {
                        const R = 22 + k * 8, sp = (k % 2 ? -1 : 1) * (0.8 + k * 0.3);
                        ctx.globalAlpha = 0.75 - k * 0.15; ctx.strokeStyle = k === 1 ? 'rgba(232,194,122,1)' : 'rgba(190,140,255,1)';
                        for (let j = 0; j < 3; j++) { const a = ((t * sp) % (Math.PI * 2)) + j * Math.PI * 2 / 3; ctx.beginPath(); ctx.arc(px, py, R, a, a + 1.3); ctx.stroke(); }
                    }
                    glow(px, py, 16, '255, 230, 255', 0.15 + 0.08 * Math.sin(t * 5 + px));
                }
                // Sconces, desk under-glow, gold strips along the marble edges
                for (const y of [350, 550, 750]) { glow(86, y, 26, '255, 196, 110', 0.5); glow(914, y, 26, '255, 196, 110', 0.5); }
                glow(500, 600, 120, '255, 170, 90', 0.18);
                ctx.globalAlpha = 0.35 + 0.08 * Math.sin(t * 1.2); ctx.fillStyle = '#ffcf8a';
                ctx.fillRect(95, 66, 1.5, 1068); ctx.fillRect(903.5, 66, 1.5, 1068); ctx.fillRect(96, 66, 808, 1.5);
                // Stars drifting through the air
                for (let i = 0; i < 26; i++) {
                    const sx = 80 + ((i * 337) % 840) + Math.sin(t * 0.2 + i) * 20, sy = 1120 - ((t * (6 + i % 5) + i * 97) % 1060);
                    const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 2.1);
                    ctx.globalAlpha = 0.5 * tw; ctx.fillStyle = i % 3 ? '#fff1c2' : '#e8d8ff'; ctx.beginPath(); ctx.arc(sx, sy, 1.1, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
                // (Solid, not glowing) the elevator doors, the departures board and the motto banner
                ctx.save();
                for (const [wx, dir] of [[50, 1], [950, -1]]) for (const by of [400, 600]) {
                    const x0 = dir > 0 ? wx - 4 : wx - 8;
                    ctx.fillStyle = '#b8914a'; ctx.fillRect(x0, by + 6, 12, 88);
                    ctx.fillStyle = '#e8c27a'; ctx.fillRect(x0 + 2, by + 8, 8, 41); ctx.fillRect(x0 + 2, by + 51, 8, 41);
                    ctx.strokeStyle = '#6a4f22'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 2, by + 8, 8, 41); ctx.strokeRect(x0 + 2, by + 51, 8, 41);
                    // the dial on the pillar face above, its needle drifting between floors
                    const dx = dir > 0 ? 80 : 920, dy = by - 12, nd = Math.PI + (0.5 + 0.5 * Math.sin(t * 0.3 + by + wx)) * Math.PI;
                    ctx.fillStyle = '#1a1216'; ctx.beginPath(); ctx.arc(dx, dy, 10, Math.PI, 0); ctx.fill();
                    ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(dx, dy, 10, Math.PI, 0); ctx.stroke();
                    ctx.strokeStyle = '#ffb060'; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(nd) * 8, dy + Math.sin(nd) * 8); ctx.stroke();
                }
                // The departures board on the check-in wall: other dimensions, letters flipping
                ctx.fillStyle = '#07060a'; ctx.fillRect(360, 104, 280, 42);
                ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1.5; ctx.strokeRect(360, 104, 280, 42);
                ctx.font = 'bold 8px monospace'; ctx.textBaseline = 'middle';
                const rows = LOBBY_DEPARTURES, step = Math.floor(t / 6);
                for (let i = 0; i < 3; i++) {
                    const row = rows[(step + i) % rows.length], flip = (t % 6) < 0.35 && i === 0;
                    const scram = s => flip ? s.replace(/[A-Z]/g, () => String.fromCharCode(65 + Math.random() * 26 | 0)) : s;
                    ctx.fillStyle = '#ffcf8a'; ctx.textAlign = 'left'; ctx.fillText(scram(row[0]), 368, 114 + i * 11);
                    ctx.fillStyle = row[1] === 'DELAYED' ? '#ff7a8a' : row[1] === 'BOARDING' ? '#bfe6ff' : '#9fe0a0'; ctx.textAlign = 'right'; ctx.fillText(scram(row[1]), 632, 114 + i * 11);
                }
                // The motto, a warm hologram floating before the wall
                const sh = 0.82 + 0.1 * Math.sin(t * 2.3);
                ctx.textAlign = 'center'; ctx.font = 'italic bold 15px Georgia, serif';
                ctx.globalAlpha = 0.35 * sh; ctx.fillStyle = '#ffb060'; ctx.fillText('Think excellence, think Double Nights.', 500, 172);
                ctx.globalAlpha = 0.95 * sh; ctx.fillStyle = '#ffe2a8'; ctx.fillText('Think excellence, think Double Nights.', 500, 171);
                ctx.restore();
            },

            /** The Sanctum's floor, painted once: cracked flagstones, rain stains and moss; the three-step
             *  dais of the apse; the crimson runner up the nave; the Triumvirate's sigil inlaid in gold. */
            drawSanctumInterior(ctx) {
                if (!this._sanctumFloor) this._sanctumFloor = this._paintSanctumFloor();
                ctx.drawImage(this._sanctumFloor, 0, 0);
            },

            _paintSanctumFloor() {
                const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 1400;
                const c = cv.getContext('2d'), r = seededRandom(333), GOLD = '#c9a46a';
                c.fillStyle = '#16121a'; c.fillRect(0, 0, 1200, 1400);
                // Flagstones, staggered and uneven, each a touch different
                for (let row = 0, y = 50; y < 1350; y += 44, row++) for (let x = 50 - (row % 2) * 34; x < 1150; x += 68) {
                    const v = r() * 12 | 0; c.fillStyle = `rgb(${34 + v},${30 + v},${40 + v})`; c.fillRect(x + 1, y + 1, 66, 42);
                }
                c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5;
                for (let row = 0, y = 50; y < 1350; y += 44, row++) { c.beginPath(); c.moveTo(50, y); c.lineTo(1150, y); c.stroke(); for (let x = 50 - (row % 2) * 34; x < 1150; x += 68) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 44); c.stroke(); } }
                for (let i = 0; i < 40; i++) { let x = 60 + r() * 1080, y = 60 + r() * 1280; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }   // cracks
                for (let i = 0; i < 90; i++) { const x = 60 + r() * 1080, y = 60 + r() * 1280; c.fillStyle = `rgba(${50 + r() * 30 | 0},${80 + r() * 40 | 0},${50},${0.2 + r() * 0.3})`; c.beginPath(); c.arc(x, y, 1 + r() * 3, 0, Math.PI * 2); c.fill(); }   // moss
                for (let i = 0; i < 14; i++) { const x = 90 + r() * 1020, y = 400 + r() * 920; c.fillStyle = 'rgba(10,8,20,0.45)'; c.beginPath(); c.ellipse(x, y, 20 + r() * 40, 8 + r() * 16, r() * 3, 0, Math.PI * 2); c.fill(); }   // rain-dark puddles
                // The apse: a dais of three steps across the north end
                for (let k = 0; k < 3; k++) { const y0 = 50 + k * 0; c.fillStyle = `rgba(${40 + k * 8},${34 + k * 6},${48 + k * 8},0.9)`; c.fillRect(120 + k * 30, y0, 960 - k * 60, 250 - k * 30); c.fillStyle = 'rgba(200,180,255,0.12)'; c.fillRect(120 + k * 30, y0 + 250 - k * 30 - 2, 960 - k * 60, 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(120 + k * 30, y0 + 250 - k * 30, 960 - k * 60, 4); }
                // The crimson runner up the nave, gold-edged
                c.fillStyle = '#3a0a14'; c.fillRect(560, 250, 80, 1100); c.fillStyle = GOLD; c.fillRect(562, 250, 1.5, 1100); c.fillRect(636.5, 250, 1.5, 1100);
                c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 8; i++) c.fillRect(560, 300 + r() * 1000, 80, 3 + r() * 6);   // worn, rain-stained
                // The sigil: a great gold circle and three interlocking rings, one for each of them
                const X = 600, Y = 720;
                c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.arc(X, Y, 250, 0, Math.PI * 2); c.stroke();
                c.lineWidth = 1; c.beginPath(); c.arc(X, Y, 240, 0, Math.PI * 2); c.stroke();
                for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; c.lineWidth = 2.5; c.beginPath(); c.arc(X + Math.cos(a) * 95, Y + Math.sin(a) * 95, 130, 0, Math.PI * 2); c.stroke(); }
                c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(X, Y, 250, 0, Math.PI * 2); c.fill();
                // The narthex: a worn threshold at the door
                c.fillStyle = 'rgba(90,80,100,0.35)'; c.fillRect(520, 1300, 160, 50);
                return cv;
            },

            /** The Sanctum after the darkness layer: the shattered rose window and its light on the dais, the
             *  braziers and candles, and the sigil's runes — one ring per warden, going dark as each falls. */
            drawSanctumGlow(ctx) {
                const t = _frameTime / 1000;
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                const W = (this.enemies || []).filter(e => e.persona);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // The rose window's light pooled on the dais
                glow(600, 110, 240, '170, 80, 255', 0.1 + 0.03 * Math.sin(t * 0.7)); glow(600, 70, 110, '255, 70, 110', 0.12);
                // Braziers and candles
                for (const p of this.props) {
                    if (p.decorType === 'sc_brazier') { const f = 0.8 + 0.2 * Math.sin(t * 6.1 + p.x) * Math.sin(t * 2.3); glow(p.x + p.width / 2, p.y + p.height / 2, 70, '255, 120, 40', 0.45 * f); }
                    else if (p.decorType === 'sc_candles') glow(p.x + p.width / 2, p.y + p.height / 2, 26, '255, 190, 120', 0.45 * (0.8 + 0.2 * Math.sin(t * 9 + p.x)));
                    else if (p.decorType === 'sc_altar') { glow(p.x + p.width - 18, p.y + 16, 22, '255, 190, 120', 0.4); glow(p.x + 11, p.y + p.height / 2, 18, '255, 190, 120', 0.35); }
                }
                // The sigil: each ring's runes burn while its warden lives
                const X = 600, Y = 720;
                for (let k = 0; k < 3; k++) {
                    const a = -Math.PI / 2 + k * Math.PI * 2 / 3, cx = X + Math.cos(a) * 95, cy = Y + Math.sin(a) * 95;
                    const w = W.find(e => e.id === k), alive = w && !w.dead ? (w.dormant ? 0.35 + 0.65 * w._eyeK : 1) : 0.06;
                    const rgb = w ? { vesper: '255, 70, 60', matins: '255, 200, 110', compline: '190, 130, 255' }[w.persona] : '200, 180, 255';
                    for (let i = 0; i < 12; i++) {
                        const ra = i * Math.PI / 6 + t * 0.05 * (k % 2 ? -1 : 1), rx = cx + Math.cos(ra) * 130, ry = cy + Math.sin(ra) * 130;
                        const pulse = 0.6 + 0.4 * Math.sin(t * 2 + i + k * 2);
                        glow(rx, ry, 10, rgb, 0.5 * alive * pulse);
                        ctx.globalAlpha = 0.8 * alive * pulse; ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
                    }
                }
                ctx.restore();
                // (Solid) the rose window in the north wall: stained glass in a stone wheel, some panes broken out
                ctx.save();
                ctx.beginPath(); ctx.rect(430, 0, 340, 60); ctx.clip();
                ctx.translate(600, 44);
                ctx.fillStyle = '#2a2430'; ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.fill();
                const panes = ['#7a2cff', '#c42a52', '#e8c27a', '#4a2aa0', '#ff5a8a', '#8a5cff'];
                for (let i = 0; i < 16; i++) {
                    const a0 = i * Math.PI / 8, a1 = a0 + Math.PI / 8;
                    if (i === 5 || i === 11 || i === 12) continue;                   // broken out: the storm shows through
                    const f = 0.75 + 0.25 * Math.sin(t * 0.9 + i);
                    ctx.globalAlpha = f; ctx.fillStyle = panes[i % panes.length];
                    ctx.beginPath(); ctx.moveTo(Math.cos(a0) * 26, Math.sin(a0) * 26); ctx.arc(0, 0, 76, a0 + 0.03, a1 - 0.03); ctx.lineTo(Math.cos(a1) * 26, Math.sin(a1) * 26); ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1; ctx.strokeStyle = '#1a161e'; ctx.lineWidth = 3;
                for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a) * 80, Math.sin(a) * 80); ctx.stroke(); }
                ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#e8c27a'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            },

            /** The penthouse floors, painted once: black marble with gold grout and white inlays, the
             *  sunburst rug in the pit and the runner from the elevator; herringbone walnut in the
             *  bedroom; white marble in the bath; teak on the balcony and its glass balustrade. */
            drawSuiteInterior(ctx) {
                if (!this._suiteFloor) this._suiteFloor = this._paintSuiteFloor();
                ctx.drawImage(this._suiteFloor, 0, 0);
            },

            _paintSuiteFloor() {
                const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 1010;
                const c = cv.getContext('2d'), r = seededRandom(1919), GOLD = '#e8c27a';
                c.fillStyle = '#0c0a0e'; c.fillRect(0, 0, 1400, 1010);
                const clip = (x, y, w, h, fn) => { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); fn(); c.restore(); };
                // Living room: black marble slabs, gold grout, a white diamond at each crossing, silver veins
                clip(50, 50, 650, 900, () => {
                    for (let y = 50; y < 950; y += 75) for (let x = 50; x < 700; x += 75) { const v = r() * 7 | 0; c.fillStyle = `rgb(${17 + v},${14 + v},${20 + v})`; c.fillRect(x, y, 75, 75); }
                    c.strokeStyle = 'rgba(232,194,122,0.18)'; c.lineWidth = 1; c.beginPath();
                    for (let x = 50; x <= 700; x += 75) { c.moveTo(x, 50); c.lineTo(x, 950); } for (let y = 50; y <= 950; y += 75) { c.moveTo(50, y); c.lineTo(700, y); } c.stroke();
                    c.fillStyle = '#e9e2d8'; for (let y = 125; y < 950; y += 75) for (let x = 125; x < 700; x += 75) { c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.fill(); }
                    for (let i = 0; i < 26; i++) { let x = 50 + r() * 650, y = 50 + r() * 900; c.strokeStyle = `rgba(223,230,255,${0.05 + r() * 0.07})`; c.lineWidth = 0.5 + r(); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 45; c.lineTo(x, y); } c.stroke(); }
                });
                // The runner from the elevator to the pit
                c.fillStyle = '#12090e'; c.fillRect(100, 470, 120, 60); c.fillStyle = GOLD; c.fillRect(100, 472, 120, 1.5); c.fillRect(100, 526.5, 120, 1.5);
                // The pit's sunburst rug
                const P = { x: 330, y: 500 };
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(P.x + 3, P.y + 4, 150, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#4a0814'; c.beginPath(); c.arc(P.x, P.y, 150, 0, Math.PI * 2); c.fill();
                c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke(); c.lineWidth = 1; c.beginPath(); c.arc(P.x, P.y, 140, 0, Math.PI * 2); c.stroke();
                for (let k = 0; k < 32; k++) { const a = k * Math.PI / 16; c.strokeStyle = k % 2 ? 'rgba(232,194,122,0.45)' : 'rgba(184,32,58,0.8)'; c.lineWidth = k % 2 ? 1.2 : 3; c.beginPath(); c.moveTo(P.x + Math.cos(a) * 28, P.y + Math.sin(a) * 28); c.lineTo(P.x + Math.cos(a) * 136, P.y + Math.sin(a) * 136); c.stroke(); }
                c.fillStyle = '#2a0610'; c.beginPath(); c.arc(P.x, P.y, 28, 0, Math.PI * 2); c.fill(); c.strokeStyle = GOLD; c.lineWidth = 1.5; c.stroke();
                // Bedroom (the L): herringbone walnut, a crimson rug at the foot of the bed
                const herring = (x0, y0, w, h) => clip(x0, y0, w, h, () => {
                    c.fillStyle = '#20140f'; c.fillRect(x0, y0, w, h);
                    for (let y = y0 - 40; y < y0 + h + 40; y += 12) for (let x = x0 - 40; x < x0 + w + 40; x += 24) {
                        const v = r() * 10 | 0, sh = `rgb(${38 + v},${24 + v},${18 + v})`;
                        c.save(); c.translate(x + ((y / 12) % 2 ? 12 : 0), y); c.rotate(Math.PI / 4); c.fillStyle = sh; c.fillRect(0, 0, 30, 9); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6; c.strokeRect(0, 0, 30, 9); c.restore();
                    }
                });
                herring(720, 50, 380, 750); herring(1100, 320, 250, 480);
                c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(803, 283, 214, 90); c.fillStyle = '#5a0a18'; c.fillRect(800, 280, 214, 90);
                c.strokeStyle = GOLD; c.lineWidth = 1.5; c.strokeRect(806, 286, 202, 78); c.lineWidth = 0.7; c.strokeRect(812, 292, 190, 66);
                // Bath: white marble, grey veins, a gold border
                clip(1120, 50, 230, 250, () => {
                    c.fillStyle = '#6e6878'; c.fillRect(1120, 50, 230, 250);   // moonstone marble
                    for (let i = 0; i < 14; i++) { let x = 1120 + r() * 230, y = 50 + r() * 250; c.strokeStyle = `rgba(60,50,70,${0.2 + r() * 0.2})`; c.lineWidth = 0.6 + r(); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.3) * 40; c.lineTo(x, y); } c.stroke(); }
                    c.strokeStyle = 'rgba(168,130,62,0.7)'; c.lineWidth = 2; c.strokeRect(1128, 58, 214, 234);
                });
                // Balcony: teak decking, the glass balustrade along the edge
                clip(720, 810, 630, 190, () => {
                    for (let y = 810; y < 1000; y += 10) { const v = r() * 10 | 0; c.fillStyle = `rgb(${70 + v},${46 + v},${30 + v})`; c.fillRect(720, y, 630, 10); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(720, y + 9, 630, 1); }
                    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 740; x < 1350; x += 90) for (let y = 810; y < 1000; y += 20) c.fillRect(x + ((y / 10) % 2) * 45, y, 1, 10);
                });
                c.fillStyle = 'rgba(200,220,255,0.28)'; c.fillRect(720, 994, 630, 6); c.fillStyle = 'rgba(223,230,255,0.6)'; for (let x = 730; x < 1350; x += 60) c.fillRect(x, 993, 3, 8);
                return cv;
            },

            /** The penthouse after the darkness layer: the fire and the candles, the gold elevator doors, the
             *  pool's light, the city and the moon beyond the balcony, and the mirror rift in the bath —
             *  the violet tear the Dark Maker left through. A room she isn't in keeps a little of its glow. */
            drawSuiteGlow(ctx) {
                const t = _frameTime / 1000, rs = this.roomSystem;
                const seen = (x, y) => { const q = rs && rs.active ? rs.getRoomAt(x, y) : null; return q ? 0.25 + 0.75 * q.vis : 1; };
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                const flame = (x, y, k = 0) => { const f = 0.75 + 0.25 * Math.sin(t * 11 + x * 0.3 + k); glow(x, y, 14, '255, 190, 120', 0.5 * f * seen(x, y)); ctx.globalAlpha = seen(x, y); ctx.fillStyle = `rgb(255,${200 + 40 * f | 0},130)`; ctx.beginPath(); ctx.arc(x, y - 0.5, 1.5 * f, 0, Math.PI * 2); ctx.fill(); };
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // The fire, still burning low
                const ff = 0.8 + 0.2 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
                glow(330, 928, 80, '255, 130, 50', 0.4 * ff * seen(330, 900));
                // Candles: dinner for two, the desk
                flame(555, 708, 1); flame(555, 742, 2); flame(1278, 614, 3); flame(1288, 620, 4); flame(1282, 648, 5);
                // The pool, lit from beneath, light rippling up
                const ps = seen(905, 907);
                glow(905, 907, 110, '120, 210, 255', 0.3 * ps);
                for (let i = 0; i < 6; i++) { const cx = 840 + ((i * 47 + t * 9) % 130), cy = 884 + ((i * 29) % 46); glow(cx, cy + Math.sin(t * 2 + i) * 3, 14, '180, 240, 255', 0.25 * ps); }
                // The city and the moon beyond the balcony
                glow(1270, 1060, 90, '220, 225, 255', 0.25); glow(1270, 1060, 18, '255, 255, 255', 0.6);
                for (let i = 0; i < 40; i++) { const sx = 730 + (i * 157) % 610, sy = 1012 + (i * 37) % 70, tw = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1); ctx.globalAlpha = 0.5 * tw; ctx.fillStyle = i % 3 ? '#ffd9a0' : '#c8b0ff'; ctx.fillRect(sx, sy, 2, 2); }
                // The mirror rift: a violet tear in the bath mirror, where he left
                const rift = seen(1180, 150), RX = 1180, RY = 112;
                glow(RX, RY, 90, '150, 90, 255', (0.28 + 0.08 * Math.sin(t * 1.7)) * rift); glow(RX, RY, 40, '210, 160, 255', 0.35 * rift);
                ctx.save(); ctx.translate(RX, RY);
                for (let k = 0; k < 4; k++) {
                    const sp = (k % 2 ? -1 : 1) * (0.9 + k * 0.35), a0 = (t * sp) % (Math.PI * 2);
                    ctx.globalAlpha = (0.7 - k * 0.12) * rift; ctx.strokeStyle = k === 2 ? 'rgba(232,194,122,1)' : 'rgba(200,150,255,1)'; ctx.lineWidth = 2;
                    for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.ellipse(0, 0, 10 + k * 5, 34 + k * 9, 0, a0 + j * Math.PI, a0 + j * Math.PI + 1.4); ctx.stroke(); }
                }
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = rift; ctx.fillStyle = 'rgba(20,4,40,0.92)'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 30, 0, 0, Math.PI * 2); ctx.fill();   // the tear itself: a slit of the dark beyond
                ctx.strokeStyle = 'rgba(255,230,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 0, 6, 30, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                for (let i = 0; i < 14; i++) { const ph = (t * 0.35 + i / 14) % 1, a = i * 2.4; const sx = RX + Math.cos(a) * (18 + ph * 60), sy = RY + Math.sin(a) * (30 + ph * 50) + ph * 20; ctx.globalAlpha = (1 - ph) * 0.8 * rift; ctx.fillStyle = i % 3 ? '#e0c8ff' : '#fff1c2'; ctx.beginPath(); ctx.arc(sx, sy, 1.3, 0, Math.PI * 2); ctx.fill(); }
                ctx.restore();
                // (Solid) the elevator doors in the west wall, its dial, and the cracked mirror round the rift
                ctx.save();
                ctx.fillStyle = '#b8914a'; ctx.fillRect(44, 424, 12, 152);
                ctx.fillStyle = '#e8c27a'; ctx.fillRect(46, 426, 8, 73); ctx.fillRect(46, 501, 8, 73);
                ctx.strokeStyle = '#6a4f22'; ctx.lineWidth = 1; ctx.strokeRect(46, 426, 8, 73); ctx.strokeRect(46, 501, 8, 73);
                const nd = Math.PI + (0.5 + 0.5 * Math.sin(t * 0.3)) * Math.PI;
                ctx.fillStyle = '#1a1216'; ctx.beginPath(); ctx.arc(70, 410, 9, Math.PI, 0); ctx.fill();
                ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(70, 410, 9, Math.PI, 0); ctx.stroke();
                ctx.strokeStyle = '#ffb060'; ctx.beginPath(); ctx.moveTo(70, 410); ctx.lineTo(70 + Math.cos(nd) * 7, 410 + Math.sin(nd) * 7); ctx.stroke();
                ctx.fillStyle = 'rgba(200,210,240,0.35)'; ctx.fillRect(1128, 52, 104, 7); ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1; ctx.strokeRect(1128, 52, 104, 7);
                ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7; ctx.beginPath();
                for (const [dx, dy] of [[-30, 4], [-14, 6], [12, 5], [28, 3], [44, 6]]) { ctx.moveTo(1180, 55); ctx.lineTo(1180 + dx, 52 + dy); }
                ctx.stroke();
                ctx.restore();
            },

            /** Moon City's floors, painted once: obsidian veined violet in the hall, the glass dance floor,
             *  the pole plinths, walnut behind the bar, hex tile in the restrooms, plum carpet in the VIP
             *  wing, and the foyer's gold-inlaid crescent. */
            drawClubInterior(ctx) {
                if (!this._clubFloor) this._clubFloor = this._paintClubFloor();
                ctx.drawImage(this._clubFloor, 0, 0);
            },

            _paintClubFloor() {
                const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1200;
                const c = cv.getContext('2d'), r = seededRandom(949), GOLD = '#e8c27a';
                c.fillStyle = '#08060b'; c.fillRect(0, 0, 1600, 1200);
                const veins = (x0, y0, w, h, n, rgba) => {
                    for (let i = 0; i < n; i++) {
                        let x = x0 + r() * w, y = y0 + r() * h; c.strokeStyle = rgba(0.05 + r() * 0.1); c.lineWidth = 0.5 + r();
                        c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.4) * 60; y += (r() - 0.5) * 50; c.lineTo(x, y); } c.stroke();
                    }
                };
                const hexes = (x0, y0, w, h, S, a, b) => {                  // a hex-tile floor, every third tile the dark one
                    c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
                    c.fillStyle = a; c.fillRect(x0, y0, w, h);
                    const dx = S * Math.sqrt(3), dy = S * 1.5;
                    for (let row = 0, y = y0; y < y0 + h + S; y += dy, row++) for (let col = 0, x = x0 + (row % 2) * dx / 2; x < x0 + w + dx; x += dx, col++) {
                        c.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(an) * (S - 0.8), y + Math.sin(an) * (S - 0.8)); } c.closePath();
                        c.fillStyle = (col + row * 2) % 3 === 0 ? b : a; c.fill();
                    }
                    c.restore();
                };
                // The hall: obsidian slabs, lavender grout, violet veins
                for (let y = 14; y < 986; y += 71) for (let x = 374; x < 1226; x += 71) { const v = r() * 7 | 0; c.fillStyle = `rgb(${14 + v},${10 + v},${20 + v})`; c.fillRect(x, y, 71, 71); }
                c.strokeStyle = 'rgba(200,168,255,0.08)'; c.lineWidth = 1; c.beginPath();
                for (let x = 374; x <= 1226; x += 71) { c.moveTo(x, 14); c.lineTo(x, 986); } for (let y = 14; y <= 986; y += 71) { c.moveTo(374, y); c.lineTo(1226, y); } c.stroke();
                veins(374, 14, 852, 972, 50, a => `rgba(170,120,255,${a})`);
                // The dance floor: dark glass tiles (lit by drawClubFloorLights), a chrome frame
                c.fillStyle = '#100a18'; c.fillRect(580, 300, 440, 400);
                c.strokeStyle = 'rgba(255,255,255,0.06)'; c.beginPath();
                for (let x = 580; x <= 1020; x += 40) { c.moveTo(x, 300); c.lineTo(x, 700); } for (let y = 300; y <= 700; y += 40) { c.moveTo(580, y); c.lineTo(1020, y); } c.stroke();
                c.strokeStyle = '#8a8ea0'; c.lineWidth = 3; c.strokeRect(578, 298, 444, 404); c.strokeStyle = GOLD; c.lineWidth = 1; c.strokeRect(574, 294, 452, 412);
                // Pole plinths (the hall's three, one in each suite)
                for (const [px, py, R] of [[800, 370, 30], [660, 560, 30], [940, 560, 30], [1405, 345, 22], [1405, 649, 22], [1405, 953, 22]]) {
                    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(px + 3, py + 4, R, 0, Math.PI * 2); c.fill();
                    const g = c.createRadialGradient(px - R * 0.3, py - R * 0.3, 2, px, py, R); g.addColorStop(0, '#2e2440'); g.addColorStop(1, '#120c1a');
                    c.fillStyle = g; c.beginPath(); c.arc(px, py, R, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = '#c8ccdc'; c.lineWidth = 2; c.stroke(); c.strokeStyle = GOLD; c.lineWidth = 1; c.beginPath(); c.arc(px, py, R - 5, 0, Math.PI * 2); c.stroke();
                }
                // Behind the bar: walnut boards
                c.fillStyle = '#24160f'; c.fillRect(374, 220, 66, 560);
                c.strokeStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); for (let y = 232; y < 780; y += 12) { c.moveTo(374, y); c.lineTo(440, y); } c.stroke();
                // The restrooms: hex tile, blush in the powder room, cool in the gents
                hexes(14, 14, 346, 546, 9, '#8e7a8c', '#221824');
                hexes(14, 574, 346, 612, 9, '#7e8492', '#15161c');
                c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(14, 14, 346, 546); c.fillRect(14, 574, 346, 612);
                // The foyer: black marble, a gold border, the crescent inlaid, the name at the door
                for (let y = 1000; y < 1186; y += 62) for (let x = 374; x < 1226; x += 71) { const v = r() * 6 | 0; c.fillStyle = `rgb(${16 + v},${13 + v},${20 + v})`; c.fillRect(x, y, 71, 62); }
                veins(374, 1000, 852, 186, 16, a => `rgba(232,194,122,${a * 0.7})`);
                c.strokeStyle = GOLD; c.lineWidth = 1.5; c.strokeRect(384, 1010, 832, 166);
                const M = { x: 800, y: 1093 };
                c.fillStyle = '#0c0910'; c.beginPath(); c.arc(M.x, M.y, 52, 0, Math.PI * 2); c.fill();
                c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke(); c.lineWidth = 0.8; c.beginPath(); c.arc(M.x, M.y, 46, 0, Math.PI * 2); c.stroke();
                const t = document.createElement('canvas'); t.width = t.height = 90; const k = t.getContext('2d');
                const gg = k.createLinearGradient(0, 0, 90, 90); gg.addColorStop(0, '#fff1c2'); gg.addColorStop(0.5, GOLD); gg.addColorStop(1, '#a8823e');
                k.fillStyle = gg; k.beginPath(); k.arc(45, 45, 36, 0, Math.PI * 2); k.fill();
                k.globalCompositeOperation = 'destination-out'; k.beginPath(); k.arc(60, 38, 32, 0, Math.PI * 2); k.fill();
                c.drawImage(t, M.x - 45, M.y - 45);
                for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; c.fillStyle = '#e8d8ff'; c.beginPath(); c.arc(M.x + 12 + Math.cos(a) * 22, M.y - 4 + Math.sin(a) * 22, 1.4, 0, Math.PI * 2); c.fill(); }
                // The VIP wing: plum carpet in a diamond weave, a gold-edged runner down the corridor
                const carpet = (x, y, w, h) => {
                    c.fillStyle = '#2a0e24'; c.fillRect(x, y, w, h);
                    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
                    c.strokeStyle = 'rgba(255,120,170,0.07)'; c.lineWidth = 1; c.beginPath();
                    for (let s = -h; s < w + h; s += 22) { c.moveTo(x + s, y); c.lineTo(x + s + h, y + h); c.moveTo(x + s + h, y); c.lineTo(x + s, y + h); } c.stroke();
                    c.restore();
                };
                carpet(1240, 14, 346, 262); carpet(1240, 290, 90, 896);
                for (const y0 of [290, 594, 898]) carpet(1344, y0, 242, y0 === 898 ? 288 : 290);
                c.fillStyle = '#4a0c2c'; c.fillRect(1262, 290, 46, 896); c.fillStyle = GOLD; c.fillRect(1264, 290, 1.5, 896); c.fillRect(1304.5, 290, 1.5, 896);
                return cv;
            },

            /** Moon City's dance floor and pole plinths, lit from within: drawn on the floor, under the
             *  dancers (clubLightLayer lets them through the darkness and tints whoever stands on them).
             *  One of four patterns per 8-beat bar, colours walking the palette, on the music's beat. */
            drawClubFloorLights(ctx) {
                const beatN = clubBeatN(), beat = ((beatN % 1) + 1) % 1, bar = Math.floor(beatN / 8), kick = Math.pow(1 - beat, 3), mode = ((bar % 4) + 4) % 4;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 11; i++) for (let j = 0; j < 10; j++) {
                    const cx = 600 + i * 40, cy = 320 + j * 40, dx = (cx - 800) / 40, dy = (cy - 500) / 40;
                    let v;
                    if (mode === 0) v = Math.max(0, Math.cos((Math.hypot(dx, dy) - beatN * 1.5) * 1.3));                 // ripples out from the centre
                    else if (mode === 1) v = Math.max(0, Math.sin((dx + dy) * 0.8 - beatN * Math.PI * 0.5));             // a diagonal wave
                    else if (mode === 2) v = ((i + j + Math.floor(beatN)) % 2) ? kick : 0.12;                             // checker on the kick
                    else v = Math.max(0, Math.cos(Math.atan2(dy, dx) * 2 - beatN * 1.6)) * (0.4 + 0.6 * kick);           // a turning pinwheel
                    const col = CLUB_PAL[(i + j + bar) % 4 === 0 ? (bar + 2) % 4 : bar % 4 === 3 ? 0 : bar % 4];
                    ctx.globalAlpha = 0.1 + 0.45 * v; ctx.fillStyle = `rgb(${col})`; ctx.fillRect(cx - 18, cy - 18, 36, 36);
                }
                for (const p of this.props) {                              // the plinths glow up round each pole
                    if (p.decorType !== 'mc_pole') continue;
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
                    ctx.globalAlpha = Math.min(1, 0.5 + 0.3 * kick); drawGlow(ctx, cx, cy, 40, cx > 1300 ? '255, 70, 120' : '210, 160, 255', 0);
                }
                ctx.restore();
            },

            /** The club in the light layer (lighting.js): 'hole' lets the dance floor through the darkness,
             *  strongest on the kick; 'color' washes whoever's on it in the bar's colour, from below. */
            clubLightLayer(lc, phase) {
                const beatN = clubBeatN(), beat = ((beatN % 1) + 1) % 1, bar = Math.floor(beatN / 8), kick = Math.pow(1 - beat, 3);
                if (phase === 'hole') {
                    lc.globalAlpha = 0.5 + 0.3 * kick; lc.fillStyle = '#ffffff'; lc.fillRect(590, 310, 420, 380);
                    lc.globalAlpha = 0.35; drawGlow(lc, 800, 500, 300, '255, 255, 255', 0.4);
                } else {
                    lc.globalAlpha = 0.14 + 0.12 * kick; drawGlow(lc, 800, 500, 290, CLUB_PAL[((bar % 3) + 3) % 3], 0.3);
                }
                lc.globalAlpha = 1;
            },

            /** Moon City after the darkness layer, in time with the music (clubBeatN, audio.js): the dance floor's tiles, beams
             *  sweeping from the DJ rig, mirror-ball specks, pole uplights, the bar's backlight, the
             *  restroom mirrors, the VIP wing's red, the neon at the door. A room she isn't in keeps
             *  only a little of its glow (its veil eases it). */
            drawClubGlow(ctx) {
                const t = _frameTime / 1000, rs = this.roomSystem;
                const beatN = clubBeatN(), beat = ((beatN % 1) + 1) % 1, bar = Math.floor(beatN / 8), kick = Math.pow(1 - beat, 3);
                const seen = (x, y) => { const r = rs && rs.active ? rs.getRoomAt(x, y) : null; return r ? 0.2 + 0.8 * r.vis : 1; };
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                const PAL = CLUB_PAL;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // (The dance floor's tiles and the pole uplights are on the floor: drawClubFloorLights,
                //  lit through the darkness by clubLightLayer. What's drawn here hangs in the air.)
                const hall = seen(800, 500);
                if (hall > 0.01) {
                    // Beams from the rig over the stage, sweeping the floor
                    for (let b = 0; b < 3; b++) {
                        const sx = 700 + b * 100, sy = 100, a = Math.PI / 2 + Math.sin(t * (0.5 + b * 0.17) + b * 2) * 0.55, L = 620, spread = 0.07;
                        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, L); g.addColorStop(0, `rgba(${PAL[(b + bar) % 4]},0.3)`); g.addColorStop(1, `rgba(${PAL[(b + bar) % 4]},0)`);
                        ctx.globalAlpha = hall * (0.7 + 0.3 * kick); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy);
                        ctx.lineTo(sx + Math.cos(a - spread) * L, sy + Math.sin(a - spread) * L); ctx.lineTo(sx + Math.cos(a + spread) * L, sy + Math.sin(a + spread) * L); ctx.closePath(); ctx.fill();
                        glow(sx + Math.cos(a) * 380, sy + Math.sin(a) * 380, 40, PAL[(b + bar) % 4], 0.25 * hall);
                    }
                    // The mirror ball's specks drifting round the room
                    for (let i = 0; i < 48; i++) {
                        const a = t * 0.25 + i * 2.39996, R = 60 + (i * 97) % 380;
                        const sx = 800 + Math.cos(a) * R * 1.05, sy = 500 + Math.sin(a) * R * 0.95;
                        if (sx < 380 || sx > 1220 || sy < 20 || sy > 980) continue;
                        ctx.globalAlpha = 0.55 * hall * (0.5 + 0.5 * Math.sin(t * 5 + i)); ctx.fillStyle = i % 4 ? '#f0e8ff' : '#ffd8e8';
                        ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalAlpha = hall; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(800, 500, 3, 0, Math.PI * 2); ctx.fill();   // the ball, overhead
                    glow(800, 500, 20, '240, 230, 255', 0.3 * hall);
                    // Stage LEDs and the DJ's decks
                    for (let i = 0; i < 12; i++) glow(632 + i * 30, 114, 16, PAL[(i + Math.floor(beatN)) % 4], (0.25 + 0.35 * kick) * hall);
                    glow(800, 55, 26, '160, 200, 255', 0.3 * hall); glow(756, 69, 18, '200, 168, 255', 0.3 * hall); glow(844, 69, 18, '200, 168, 255', 0.3 * hall);
                    // Bar: the bottle wall lit from beneath, gold under the counter's rail
                    for (let y = 250; y < 770; y += 60) glow(392, y, 24, '255, 190, 120', 0.14 * seen(420, y));
                    for (let y = 280; y < 760; y += 80) glow(488, y, 16, '232, 194, 122', 0.12 * seen(470, y));
                }
                // Orbs, mirrors, tables, the dryers' ready-lights, the coat-check screen
                for (const p of this.props) {
                    if (!p.decorType || !p.decorType.startsWith('mc_')) continue;
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2, s = seen(cx, cy);
                    if (p.decorType === 'mc_orb') glow(cx, cy - 3, 26, '220, 200, 255', (0.35 + 0.08 * Math.sin(t * 1.5 + cx)) * s);
                    else if (p.decorType === 'mc_vanity') { const my = p.decor && p.decor.face === 'N' ? p.y + p.height : p.y - 1; for (let x = p.x + 12; x < p.x + p.width; x += 34) glow(x, my, 20, '255, 225, 200', 0.35 * s); }
                    else if (p.decorType === 'mc_lowtable') glow(cx, cy, 30, '255, 220, 170', 0.15 * s);
                    else if (p.decorType === 'mc_dryer') glow(cx, cy, 8, '120, 200, 255', 0.3 * s);
                    else if (p.decorType === 'mc_coatcheck') glow(p.x + p.width - 27, cy, 20, '200, 168, 255', 0.3 * s);
                    else if (p.decorType.startsWith('mc_lost_') && !p._searched) {           // an unsearched find catches the light now and then
                        const ph = (t * 0.45 + (p.x * 0.013 + p.y * 0.007)) % 1;
                        if (ph < 0.14) { const k = Math.sin(ph / 0.14 * Math.PI) * s, gx = p.x + p.width * 0.7, gy = p.y + 2;
                            glow(gx, gy, 10, '255, 236, 200', 0.55 * k);
                            ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(gx - 4 * k, gy); ctx.lineTo(gx + 4 * k, gy); ctx.moveTo(gx, gy - 4 * k); ctx.lineTo(gx, gy + 4 * k); ctx.stroke(); }
                    }
                }
                // The VIP wing: rose sconces down the corridor, a low red in every suite
                for (let y = 330; y < 1180; y += 110) { const s = seen(1285, y); glow(1244, y, 22, '255, 90, 140', 0.4 * s); glow(1326, y + 55, 22, '255, 90, 140', 0.4 * s); }
                for (const y0 of [290, 594, 898]) glow(1465, y0 + 145, 150, '255, 60, 110', 0.12 * seen(1465, y0 + 145));
                glow(1475, 60, 120, '255, 80, 120', 0.14 * seen(1475, 60));
                ctx.restore();
                // The neon at the door (solid strokes over a glow): a crescent and the name, a flicker now and then
                const fs = seen(800, 1093), fl = (t % 7.3) < 0.12 ? 0.35 : 1;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                glow(560, 1016, 40, '200, 150, 255', 0.45 * fs); glow(1060, 1016, 70, '255, 90, 150', 0.35 * fs * fl);
                ctx.globalAlpha = fs; ctx.strokeStyle = '#e0c8ff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(560, 1016, 10, Math.PI * 0.3, Math.PI * 1.7); ctx.stroke();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'italic bold 16px Georgia, serif';
                ctx.globalAlpha = 0.9 * fs * fl; ctx.fillStyle = '#ffb8d4'; ctx.fillText('Moon City', 1060, 1017);
                ctx.restore();
            },

            /** The hub graveyard's candle flames: only when the camera is near it. */
            drawGraveyardGlow(ctx) {
                const cam = this.camera, z = cam.zoom || 1, hw = this.canvas.width / 2 / z + 60, hh = this.canvas.height / 2 / z + 60;
                if (cam.x + hw < 500 || cam.x - hw > 3500 || cam.y + hh < 8800 || cam.y - hh > 10800) return;
                const t = _frameTime / 1000;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of this.props) {
                    if (p.decorType !== 'gy_stone') continue;
                    const L = gyStoneLayout(p);
                    if (L.acc !== 'candle') continue;
                    const { x, y } = L.candle;
                    if (Math.abs(x - cam.x) > hw || Math.abs(y - cam.y) > hh) continue;
                    const f = 0.75 + 0.25 * Math.sin(t * 9 + x) * Math.sin(t * 3.7 + y);
                    ctx.globalAlpha = 0.5 * f; drawGlow(ctx, x, y - 2, 18, '255, 190, 120', 0);
                    ctx.globalAlpha = 0.95; ctx.fillStyle = `rgb(255,${200 + 40 * f | 0},130)`; ctx.beginPath(); ctx.arc(x, y - 1.5, 1.3 * f, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            },

            /** Enni Cole: rose stone, cream marble and champagne inlay. Painted once and released on exit. */
            drawEnniInterior(ctx) {
                if (!this._enniFloor) this._enniFloor = this._paintEnniFloor();
                ctx.drawImage(this._enniFloor, 0, 0);
            },

            _paintEnniFloor() {
                const cv = document.createElement('canvas'); cv.width=2000; cv.height=1400;
                const c=cv.getContext('2d'),r=seededRandom(1849),GOLD='#c6a365',CREAM='#e8ded1';
                const rr=(x,y,w,h,rad,col,stroke,lw=1)=>{c.beginPath();c.roundRect(x,y,w,h,rad);c.fillStyle=col;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}};
                c.fillStyle='#432630';c.fillRect(0,0,2000,1400);
                // Large honed marble slabs: light enough to read the displays, soft warm-grey joints.
                for(let y=50,row=0;y<1350;y+=100,row++)for(let x=50,col=0;x<1950;x+=100,col++) {
                    const v=r()*10|0;c.fillStyle=`rgb(${204+v},${194+v},${181+v})`;c.fillRect(x,y,100,100);
                    c.strokeStyle='rgba(104,84,69,.18)';c.lineWidth=.7;c.strokeRect(x+.5,y+.5,99,99);
                }
                c.save();c.beginPath();c.rect(50,50,1900,1300);c.clip();
                for(let i=0;i<105;i++){
                    let x=50+r()*1900,y=50+r()*1300;c.strokeStyle=`rgba(117,88,84,${.045+r()*.08})`;c.lineWidth=.5+r()*1.7;c.beginPath();c.moveTo(x,y);
                    for(let k=0;k<4;k++){const nx=x+(r()-.45)*130,ny=y+(r()-.55)*100;c.quadraticCurveTo(x+30,y-22,nx,ny);x=nx;y=ny;}c.stroke();
                }
                // The rose/burgundy perimeter and dark polished brass-bordered promenade.
                c.strokeStyle='#8a5966';c.lineWidth=23;c.strokeRect(73,73,1854,1254);
                c.strokeStyle=GOLD;c.lineWidth=2;c.strokeRect(88,88,1824,1224);
                c.strokeStyle='rgba(246,231,199,.65)';c.lineWidth=1;c.strokeRect(92,92,1816,1216);
                for(const x of [605,1395]){c.fillStyle='#4b3b3f';c.fillRect(x-12,95,24,1210);c.fillStyle=GOLD;c.fillRect(x-14,95,2,1210);c.fillRect(x+12,95,2,1210);}
                for(const y of [565,1085]){c.fillStyle='#4b3b3f';c.fillRect(95,y-8,1810,16);c.fillStyle=GOLD;c.fillRect(95,y-9,1810,1);c.fillRect(95,y+8,1810,1);}
                // Showroom rugs are actual matte islands in the reflection mask, never obstacles.
                const rug=(x,y,w,h,col)=>{
                    rr(x+3,y+4,w,h,7,'rgba(56,30,34,.2)');rr(x,y,w,h,7,col,'#b59a75',2);
                    c.strokeStyle='rgba(228,203,164,.7)';c.lineWidth=1;c.strokeRect(x+9,y+9,w-18,h-18);
                    c.fillStyle='rgba(246,225,192,.11)';for(let yy=y+19;yy<y+h-15;yy+=15)for(let xx=x+20;xx<x+w-15;xx+=15){c.beginPath();c.arc(xx,yy,.8,0,Math.PI*2);c.fill();}
                };
                rug(650,120,450,290,'#8c796b');rug(1105,100,290,320,'#684552');rug(1120,435,270,200,'#9b8973');
                // Dark stone surrounds the open atrium medallion; the EC monogram lies in champagne metal.
                const mx=1000,my=780;
                c.fillStyle='#40353c';c.beginPath();c.arc(mx,my,196,0,Math.PI*2);c.fill();
                const mg=c.createRadialGradient(mx-55,my-65,10,mx,my,187);mg.addColorStop(0,'#eee4d3');mg.addColorStop(1,'#c7b49d');
                c.fillStyle=mg;c.beginPath();c.arc(mx,my,187,0,Math.PI*2);c.fill();
                for(const [rad,lw,col]of[[194,2,GOLD],[179,2,GOLD],[166,1,'#ac8b5c']]){c.strokeStyle=col;c.lineWidth=lw;c.beginPath();c.arc(mx,my,rad,0,Math.PI*2);c.stroke();}
                for(let i=0;i<48;i++){const a=i*Math.PI/24;c.strokeStyle=i%4?'#b29565':'#755161';c.lineWidth=i%4?1:2;c.beginPath();c.moveTo(mx+Math.cos(a)*170,my+Math.sin(a)*170);c.lineTo(mx+Math.cos(a)*177,my+Math.sin(a)*177);c.stroke();}
                c.textAlign='center';c.textBaseline='middle';c.font='italic 100px Georgia, serif';c.fillStyle='#895965';c.fillText('EC',mx,my+2);
                c.font='13px Georgia, serif';c.fillStyle='#725238';c.fillText('ENNI COLE',mx,my+83);
                c.font='10px Georgia, serif';c.fillText('LIVING EXCEPTIONALLY',mx,my+103);
                // A deep rose runner announces the front door while the entire middle aisle stays clear.
                rr(870,1000,260,350,6,'#71364d','#b89a66',2);c.strokeStyle='rgba(235,209,165,.7)';c.lineWidth=1;c.strokeRect(879,1010,242,330);
                c.fillStyle='rgba(207,161,165,.14)';for(let y=1018;y<1340;y+=17)for(let x=889;x<1115;x+=17){c.beginPath();c.arc(x,y,1,0,Math.PI*2);c.fill();}
                c.font='italic 40px Georgia, serif';c.fillStyle='#ead4a5';c.fillText('Enni Cole',1000,1265);
                c.font='10px Georgia, serif';c.fillText('FOOD  •  HOME  •  TECHNOLOGY',1000,1300);
                // Departments are set into the floor; no floating game labels or new shopping UI.
                const title=(str,x,y,sub)=>{c.font='22px Georgia, serif';c.fillStyle='#694450';c.fillText(str,x,y);c.font='9px Georgia, serif';c.fillStyle='#816d56';c.fillText(sub,x,y+22);};
                title('THE FOOD HALL',285,250,'FRESH  •  FINE FOODS  •  THE CELLAR');
                title('TECHNOLOGY',1710,250,'PERSONAL  •  AUDIO  •  HOME');
                c.font='17px Georgia, serif';c.fillStyle='#735663';c.fillText('LIVING & INTERIORS',1000,510);
                c.font='italic 12px Georgia, serif';c.fillStyle='#8c715a';c.fillText('Customer Services',740,1142);c.fillText('Concierge & Collection',1265,1142);
                // Low shopfront glass on each side of the open arched entrance: charcoal mullions,
                // warm reflected city light and small champagne handles.
                for(const [x0,x1]of[[80,780],[1220,1920]])for(let x=x0;x<x1;x+=100){
                    rr(x,1317,94,28,1,'#31333a',GOLD,.8);const g=c.createLinearGradient(x,1318,x+90,1340);g.addColorStop(0,'#6b6267');g.addColorStop(.6,'#aa8f77');g.addColorStop(1,'#4c464f');rr(x+4,1320,86,22,1,g);
                    c.fillStyle='rgba(249,226,180,.4)';c.fillRect(x+8,1321,2,19);c.fillStyle='#302c32';c.fillRect(x+46,1320,3,22);
                }
                c.restore();return cv;
            },

            /** Warm chandelier bulbs and restrained cabinet lighting, above the darkness layer. */
            drawEnniGlow(ctx) {
                const t=_frameTime/1000;
                ctx.save();ctx.globalCompositeOperation='lighter';
                glowA(ctx,1000,780,190,'255,218,162',.025);
                // Compact warm halos leave the marble and individual crystal fittings readable.
                for(const [R,n]of[[87,24],[57,16]])for(let i=0;i<n;i++){
                    const a=i*Math.PI*2/n;
                    glowA(ctx,1000+Math.cos(a)*R,780+Math.sin(a)*R,8.5,'255,222,176',.075);
                }
                // Small warm pendant shades over each department and both service counters.
                for(const [X,Y,R]of[[285,280,12],[285,790,12],[1710,280,12],[1710,870,12],[740,1190,9],[1265,1190,9]]){
                    ctx.globalCompositeOperation='lighter';glowA(ctx,X,Y,75,'255,220,169',.075);
                    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
                    ctx.fillStyle='#b69b65';ctx.strokeStyle='#5d4933';ctx.lineWidth=1;ctx.beginPath();ctx.arc(X,Y,R,0,Math.PI*2);ctx.fill();ctx.stroke();
                    ctx.fillStyle='#fff1cf';ctx.beginPath();ctx.arc(X,Y,3,0,Math.PI*2);ctx.fill();
                }
                // Faint practical illumination remains attached to the actual case/display coordinates.
                for(const p of this.props){
                    if(p.decorType==='ec_cold'){
                        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1;ctx.strokeStyle='rgba(218,245,247,.65)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(p.x+8,p.y+8);ctx.lineTo(p.x+p.width-8,p.y+8);ctx.stroke();
                    }else if(p.decorType==='ec_tvwall'){
                        ctx.globalCompositeOperation='lighter';glowA(ctx,p.x+p.width/2,p.y+p.height/2,85,'163,193,224',.055);
                    }else if(p.decorType==='ec_side'){
                        ctx.globalCompositeOperation='lighter';glowA(ctx,p.x+p.width/2,p.y+p.height/2,28,'255,219,161',.1);
                    }
                }
                // Paint opaque champagne hardware last: glowA changes globalAlpha, so explicitly reset
                // it before this solid fixture pass. The same pass stays legible in floor reflections.
                ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
                for(const R of [87,57]){
                    ctx.strokeStyle='#79623f';ctx.lineWidth=3.5;ctx.beginPath();ctx.arc(1000,780,R,0,Math.PI*2);ctx.stroke();
                    ctx.strokeStyle='#cfb889';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(1000,780,R-.7,-Math.PI*.95,Math.PI*.65);ctx.stroke();
                }
                for(let i=0;i<12;i++){
                    const a=i*Math.PI/6;ctx.strokeStyle='#a98c5b';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(1000+Math.cos(a)*15,780+Math.sin(a)*15);ctx.lineTo(1000+Math.cos(a)*87,780+Math.sin(a)*87);ctx.stroke();
                }
                ctx.fillStyle='#96784b';ctx.strokeStyle='#ecd5a4';ctx.lineWidth=1;ctx.beginPath();ctx.arc(1000,780,10,0,Math.PI*2);ctx.fill();ctx.stroke();
                for(const [R,n]of[[87,24],[57,16]])for(let i=0;i<n;i++){
                    const a=i*Math.PI*2/n,X=1000+Math.cos(a)*R,Y=780+Math.sin(a)*R;
                    ctx.fillStyle='#ab8b54';ctx.beginPath();ctx.arc(X,Y,3.4,0,Math.PI*2);ctx.fill();
                    ctx.fillStyle='#fff0c9';ctx.beginPath();ctx.arc(X,Y,2.15,0,Math.PI*2);ctx.fill();
                    ctx.strokeStyle='rgba(248,233,204,.85)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(X,Y+3);ctx.lineTo(X-2,Y+8);ctx.lineTo(X,Y+12);ctx.lineTo(X+2,Y+8);ctx.closePath();ctx.stroke();
                    if(Math.sin(t*.8+i*2.17)>.985){ctx.strokeStyle='#fffdf2';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(X-4,Y);ctx.lineTo(X+4,Y);ctx.moveTo(X,Y-4);ctx.lineTo(X,Y+4);ctx.stroke();}
                }
                ctx.restore();
            },

            /* =====================================================================
               COZY CAFE — the floor, painted once (released when she leaves: MAP_BAKES),
               and the glow: the fire, pendant lamps, candles, string lights, steam,
               and the windows by the benches (sky by day, the city's lights by night,
               rain running down them when it rains outside)
               ===================================================================== */
            drawCafeInterior(ctx) {
                if (!this._cafeFloor) this._cafeFloor = this._paintCafeFloor();
                ctx.drawImage(this._cafeFloor, 0, 0);
            },

            _paintCafeFloor() {
                const W = 1200, H = 1000, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
                const c = cv.getContext('2d'), r = seededRandom(5150);
                c.fillStyle = '#1c120a'; c.fillRect(0, 0, W, H);
                // Honey chevron parquet over the whole café floor, each plank its own shade, a little worn
                c.save(); c.beginPath(); c.rect(50, 50, 1100, 900); c.clip();
                const cw = 26, rh = 11, sl = 13;
                for (let y0 = 30; y0 < H; y0 += rh) for (let x0 = 40, col = 0; x0 < W; x0 += cw, col++) {
                    const up = col % 2 === 0, v = r();
                    c.fillStyle = `rgb(${132 + v * 40 | 0},${84 + v * 26 | 0},${44 + v * 16 | 0})`;
                    c.beginPath();
                    c.moveTo(x0, y0 + (up ? sl : 0)); c.lineTo(x0 + cw, y0 + (up ? 0 : sl));
                    c.lineTo(x0 + cw, y0 + (up ? 0 : sl) + rh); c.lineTo(x0, y0 + (up ? sl : 0) + rh); c.closePath(); c.fill();
                    c.strokeStyle = 'rgba(40,20,8,0.45)'; c.lineWidth = 0.8; c.stroke();
                }
                // Worn paths: door → counter, door → the tables (lighter, where the varnish has gone)
                for (const [x1, y1, x2, y2] of [[600, 940, 280, 320], [600, 940, 600, 560], [600, 940, 960, 500]]) {
                    for (let k = 0; k <= 1; k += 0.05) {
                        const x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k, g = c.createRadialGradient(x, y, 0, x, y, 60);
                        g.addColorStop(0, 'rgba(255,220,160,0.035)'); g.addColorStop(1, 'rgba(255,220,160,0)'); c.fillStyle = g; c.fillRect(x - 60, y - 60, 120, 120);
                    }
                }
                c.restore();
                // Behind the counter: terracotta squares
                for (let y = 50; y < 245; y += 22) for (let x = 50; x < 395; x += 22) { const v = r(); c.fillStyle = `rgb(${150 + v * 30 | 0},${72 + v * 18 | 0},${48 + v * 10 | 0})`; c.fillRect(x + 1, y + 1, 20, 20); }
                // The kitchen: black and cream checkers
                for (let y = 50, j = 0; y < 300; y += 25, j++) for (let x = 705, i = 0; x < 1150; x += 25, i++) { c.fillStyle = (i + j) % 2 ? '#e9dfc8' : '#1e1c1e'; c.fillRect(x, y, 25, 25); }
                c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(705, 50, 445, 250);
                // The storeroom: worn concrete
                c.fillStyle = '#4a443e'; c.fillRect(955, 715, 195, 235);
                for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '20,16,12' : '120,110,96'},${0.06 + r() * 0.08})`; c.beginPath(); c.arc(955 + r() * 195, 715 + r() * 235, 4 + r() * 18, 0, Math.PI * 2); c.fill(); }
                // The hearth rug: a deep red and saffron oval with a patterned border
                const rug = (cx, cy, rx, ry) => {
                    c.save(); c.translate(cx, cy);
                    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(3, 4, rx, ry, 0, 0, Math.PI * 2); c.fill();
                    const rings = [[1, '#5e1e1a'], [0.93, '#c0903a'], [0.88, '#7a2a22'], [0.62, '#8e3a2a'], [0.56, '#d9a35a'], [0.5, '#6e2420'], [0.2, '#c0903a']];
                    for (const [k, col] of rings) { c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, rx * k, ry * k, 0, 0, Math.PI * 2); c.fill(); }
                    c.fillStyle = '#e8c88a';
                    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * rx * 0.755, Math.sin(a) * ry * 0.755, 2.4, 0, Math.PI * 2); c.fill(); }
                    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.save(); c.rotate(a); c.fillStyle = '#d9a35a'; c.beginPath(); c.moveTo(rx * 0.22, 0); c.lineTo(rx * 0.4, -6); c.lineTo(rx * 0.48, 0); c.lineTo(rx * 0.4, 6); c.closePath(); c.fill(); c.restore(); }
                    c.strokeStyle = 'rgba(232,200,138,0.6)'; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.ellipse(0, 0, rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
                    c.restore();
                };
                rug(205, 536, 150, 132);
                // Under the booths: a long runner in sage and cream
                c.fillStyle = '#4a6244'; c.fillRect(952, 336, 196, 330); c.fillStyle = '#e8dcc4'; c.fillRect(956, 340, 188, 3); c.fillRect(956, 659, 188, 3);
                c.fillStyle = 'rgba(232,220,196,0.25)'; for (let y = 352; y < 656; y += 14) for (let x = 964; x < 1140; x += 14) { c.beginPath(); c.arc(x, y, 1.4, 0, Math.PI * 2); c.fill(); }
                // The doormat
                c.fillStyle = '#7a5a34'; c.fillRect(520, 842, 160, 62); c.strokeStyle = '#4a3420'; c.lineWidth = 3; c.strokeRect(524, 846, 152, 54);
                c.fillStyle = 'rgba(40,24,10,0.75)'; c.font = 'bold 15px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('come in, get cozy', 600, 873);
                // At the counter: "order here", in brass inlay
                c.fillStyle = 'rgba(201,162,74,0.55)'; c.font = 'italic 13px Georgia, serif'; c.fillText('✦  order here  ✦', 272, 296);
                return cv;
            },

            drawCafeGlow(ctx) {
                const t = _frameTime / 1000, dc = this.dayCycle(), night = dc.darkness > 0.3, rain = (this.weather && this.weather.intensity || 0) > 0.08;
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                const fl = (k) => 0.82 + 0.1 * Math.sin(t * 7.3 + k) + 0.08 * Math.sin(t * 12.1 + k * 2.3);   // a flame's breath
                ctx.save();
                // The windows by the benches, on the south wall: the sky by day, the city's lights by night, rain on the glass
                for (const [x0, x1] of [[80, 420], [760, 925]]) {
                    for (let wx = x0; wx < x1 - 20; wx += 58) {
                        const ww = Math.min(52, x1 - wx);
                        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
                        ctx.fillStyle = '#3a2416'; ctx.fillRect(wx - 3, 952, ww + 6, 30);
                        const g = ctx.createLinearGradient(0, 955, 0, 978);
                        if (night) { g.addColorStop(0, '#1a1438'); g.addColorStop(1, '#2c1e4a'); } else { g.addColorStop(0, '#9fc2e6'); g.addColorStop(1, '#d9e6f2'); }
                        ctx.fillStyle = g; ctx.fillRect(wx, 955, ww, 24);
                        if (night) for (let i = 0; i < 4; i++) { const lx = wx + 5 + ((i * 13 + wx) % (ww - 8)); ctx.fillStyle = ['#ffcf8a', '#ff8ec4', '#a6c8ff', '#ffd9a0'][i]; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.7 + i + wx); ctx.fillRect(lx, 964 + (i % 2) * 6, 2, 2); }
                        ctx.globalAlpha = 1;
                        if (rain) { ctx.strokeStyle = 'rgba(220,235,255,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 5; i++) { const sx = wx + 4 + ((i * 11 + (t * 30 | 0) * (i + 1)) % (ww - 6)), sy = 955 + ((t * 18 + i * 7) % 18); ctx.moveTo(sx, sy); ctx.lineTo(sx - 0.5, sy + 5); } ctx.stroke(); }
                        ctx.fillStyle = '#5a3a24'; ctx.fillRect(wx + ww / 2 - 1, 955, 2, 24); ctx.fillRect(wx, 966, ww, 2);
                    }
                }
                ctx.globalCompositeOperation = 'lighter';
                // Daylight through the windows across the benches and well into the room; at night a faint cool spill
                const day = Math.max(0, Math.min(1, dc.daylight != null ? dc.daylight : (night ? 0 : 1)));
                for (const [cx, w] of [[250, 340], [842, 170]]) glow(cx, 920, w * 0.7, night ? '150, 160, 255' : '255, 240, 210', night ? 0.05 : 0.18);
                if (day > 0.05) { glow(250, 860, 420, '255, 236, 200', 0.12 * day); glow(842, 860, 260, '255, 236, 200', 0.1 * day); glow(600, 600, 700, '255, 226, 180', 0.06 * day); }
                // The fire: a deep wash, the flames, sparks
                const f0 = fl(0);
                glow(120, 535, 260, '255, 120, 40', 0.2 * f0); glow(92, 535, 90, '255, 170, 70', 0.45 * f0);
                for (let i = 0; i < 6; i++) { const fy = 505 + i * 12, f = fl(i * 1.7); glow(86 + 4 * Math.sin(t * 9 + i), fy, 12 + 6 * f, '255, 150, 50', 0.55 * f); glow(84, fy, 6, '255, 230, 150', 0.6 * f); }
                for (let i = 0; i < 5; i++) { const ph = (t * 0.6 + i * 0.21) % 1; glow(92 + ph * 40 + Math.sin(t * 3 + i) * 5, 535 + Math.sin(i * 2.3) * 30 - ph * 10, 2.5, '255, 190, 90', 0.7 * (1 - ph)); }
                // Pendant lamps over the tables and the counter: a warm cone below a brass shade
                const pendants = [[190, 262], [330, 262], ...CAFE_TABLES];   // two over the counter (clear of Ren), one over each round table
                for (const [px, py] of pendants) glow(px, py, 120, '255, 196, 120', 0.12);
                // Candles on the tables, the booths, the low table and the mantel
                const candles = [...CAFE_TABLES.map(([x, y]) => [x, y]), ...CAFE_BOOTHS.map(y => [1061, y]), [199, 545], [58, 484], [58, 586]];
                candles.forEach(([x, y], i) => { const f = fl(i * 2.1); glow(x, y, 34, '255, 170, 80', 0.32 * f); glow(x, y, 7, '255, 235, 180', 0.75 * f); });
                // String lights: along the bookshelf wall, over the booths, above the window benches
                const bulbs = [];
                for (let x = 438; x <= 686; x += 18) bulbs.push([x, 84 + 4 * Math.sin((x - 438) / 248 * Math.PI)]);
                for (let y = 330; y <= 690; y += 20) bulbs.push([1142, y]);
                for (let x = 70; x <= 930; x += 20) if (x < 470 || x > 740) bulbs.push([x, 946]);
                bulbs.forEach(([x, y], i) => { const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + i * 1.7); glow(x, y, 9, i % 3 ? '255, 214, 150' : '255, 180, 200', 0.5 * tw); });
                // Steam: from the espresso machine, and a curl over each cup on the round tables
                const curl = (x, y, k, s = 1) => { for (let j = 0; j < 3; j++) { const ph = (t * 0.35 + j / 3 + k) % 1; glow(x + Math.sin(t * 1.4 + j + k) * 4 * ph, y - ph * 22 * s, (4 + ph * 7) * s, '255, 245, 235', 0.1 * (1 - ph)); } };
                curl(158, 60, 0, 1.4); curl(188, 60, 0.4, 1.4);
                CAFE_TABLES.forEach(([x, y], i) => curl(x - 13, y + 4, i * 0.37));
                ctx.restore();
                // The pendant shades themselves (seen from above), drawn solid
                ctx.lineWidth = 1.5; ctx.strokeStyle = '#c9a24a';
                for (const [px, py] of pendants) {
                    ctx.fillStyle = '#3a2416'; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = '#fff1d0'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
                }
            },

            /** apt_949 glows after the darkness layer: lamp shades, pendants, fireplace, cooktops, veranda string lights. */
            drawApartmentGlow(ctx) {
                if (this._cityView) this._cityView.drawGlow(ctx, this.dayCycle().darkness);   // the city below lights up with the sky's dark
                const t = _frameTime / 1000, rs = this.roomSystem;
                const lightAt = (x, y) => rs && rs.active ? rs.lightAt(x, y) : 1;   // room switches fade these
                // A glow sprite (core/draw-helpers.js) of colour `rgb`, alpha `a`
                const glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // Lamp shades and bar pendants (they follow the room switches)
                const shades = [[991, 232, 28], [1115, 232, 28], [307, 439, 34], [700, 700, 34], [109, 463, 34], [231, 759, 22], [350, 759, 22], [469, 759, 22]];
                for (const p of this.props) if (p.light && p.decorType === 'apt_side') {   // table lamps travel with their tables
                    const c = p.getCenter(); shades.push([c.x - 2, c.y - 1, 30]);
                }
                for (const [x, y, r] of shades) {                                                  // (glow and bulb in one stamp)
                    const k = lightAt(x, y);
                    if (k < 0.01) continue;
                    drawBulb(ctx, bulbSprite(ctx, '255,236,210', 0.8, 2.5, '255,210,160', 0.26, r, true), x, y, k);
                }
                // Fireplace
                const ff = 0.8 + 0.2 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
                glow(HEARTHS.apt_949.x, HEARTHS.apt_949.y, 60, '255, 140, 60', 0.35 * ff);
                // Induction zones (warm red) and two gas burners (blue flame)
                for (const [x, y] of [[433, 864], [460, 877]]) glow(x, y, 12, '255, 70, 40', 0.55);
                for (const [x, y, r] of [[312, 859, 7], [329, 873, 5.5]]) {
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = `rgba(90,160,255,${0.6 + 0.3 * Math.sin(t * 14 + x)})`; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.stroke();
                    glow(x, y, r + 6, '90, 150, 255', 0.25);
                }
                // Candles on the tub rim
                for (const [x, y] of [[1248, 619], [1256, 612], [1368, 619]]) {
                    const f = 0.75 + 0.25 * Math.sin(t * 9 + x);
                    glow(x, y, 12, '255, 200, 130', 0.5 * f);
                }
                // The workbench: the schematic tablet's violet, the soldering iron's ember
                for (const p of this.props) if (p.decorType === 'apt_craft') {
                    glow(p.x + p.width * 0.59, p.y + 11 + p.height * 0.21, 22, '180, 130, 255', 0.3 + 0.06 * Math.sin(t * 2.4));
                    glow(p.x + p.width - 29, p.y + p.height - 14.5, 7, '255, 150, 70', 0.5 + 0.2 * Math.sin(t * 7));
                }
                // Festoon string lights swagged along the veranda railing (glow and bulb in one stamp)
                const bulb = bulbSprite(ctx, '255,240,215', 0.9, 1.6, '255,214,160', 0.45, 9, true);
                for (let s = 0; s < 8; s++) {
                    const x0 = 20 + s * 170, x1 = x0 + 170;
                    for (let i = 0; i <= 8; i++) {
                        const u = i / 8, x = x0 + (x1 - x0) * u, y = 14 + Math.sin(u * Math.PI) * 12;
                        const f = 0.7 + 0.3 * Math.sin(t * 1.3 + s * 3 + i * 1.7);
                        drawBulb(ctx, bulb, x, y, f);
                    }
                }
                ctx.restore();
            },

            drawClinicInterior(ctx) {
                const t = _gameTimeSec;
                ctx.save();
                // Tile grid with a faint alternating tint
                for (let ty = 50; ty < 750; ty += 50) {
                    for (let tx = 50; tx < 750; tx += 50) {
                        if (((tx + ty) / 50) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(tx, ty, 50, 50); }
                    }
                }
                ctx.strokeStyle = 'rgba(40,55,65,0.22)'; ctx.lineWidth = 1;
                ctx.beginPath();
                for (let v = 50; v <= 750; v += 50) { ctx.moveTo(v, 50); ctx.lineTo(v, 750); ctx.moveTo(50, v); ctx.lineTo(750, v); }
                ctx.stroke();
                // Recovery-bay floor mats under the beds
                ctx.fillStyle = 'rgba(63,143,163,0.16)';
                ctx.fillRect(50, 270, 170, 320); ctx.fillRect(580, 270, 170, 320);
                // Wayfinding stripe: door → desk, splitting to both bays
                ctx.strokeStyle = 'rgba(63,182,201,0.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(400, 745); ctx.lineTo(400, 560); ctx.moveTo(400, 400); ctx.lineTo(400, 275);
                ctx.moveTo(400, 620); ctx.lineTo(240, 620); ctx.lineTo(240, 430); ctx.moveTo(400, 620); ctx.lineTo(560, 620); ctx.lineTo(560, 430);
                ctx.stroke(); ctx.lineCap = 'butt';
                // Diagnostic scanner platform (walk-on), slowly sweeping ring
                const cx = 400, cy = 480;
                ctx.fillStyle = '#5d6b74'; ctx.beginPath(); ctx.arc(cx, cy, 64, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#44525b'; ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(63,227,255,0.85)'; ctx.lineWidth = 3; ctx.shadowColor = '#3fe3ff'; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.stroke();
                const sweep = (t * 0.9) % (Math.PI * 2);
                ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 58, sweep, sweep + 0.9); ctx.stroke();
                ctx.shadowBlur = 0;
                const pulse = 0.5 + 0.5 * Math.sin(t * 2);
                ctx.strokeStyle = `rgba(63,227,255,${0.25 + 0.35 * pulse})`; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy, 30 + 18 * pulse, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(63,227,255,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
                // Medical cross inlay in front of the desk
                ctx.fillStyle = 'rgba(220,60,70,0.55)';
                ctx.fillRect(390, 300, 20, 56); ctx.fillRect(372, 318, 56, 20);
                // Privacy curtains between beds (ceiling tracks with drawn-back curtains)
                const curtain = (x0, x1, y) => {
                    ctx.strokeStyle = 'rgba(200,210,215,0.9)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
                    ctx.fillStyle = 'rgba(170,215,225,0.55)';
                    ctx.beginPath(); ctx.moveTo(x0, y - 4);
                    for (let xx = x0; xx <= x0 + 60; xx += 6) ctx.lineTo(xx, y + ((xx / 6) % 2 ? 4 : -4));
                    ctx.lineTo(x0 + 60, y + 4); ctx.lineTo(x0, y + 4); ctx.closePath(); ctx.fill();
                };
                curtain(55, 215, 413); curtain(585, 745, 413);
                ctx.restore();
            },

            /** The street below the Silver Queen's veranda: a CityView (buildings/city-view.js) in the strip above the
                railing (world y −394..6), the hub's own buildings, roads, lamps and cars seen from its upper floors. */
            _makeAptCityView() {
                return new CityView({ x: 0, y: -394, w: this.activeMap.width, h: 400, seed: 949 });
            },
            drawApartmentBackdrop(ctx) {
                if (!this._cityView) this._cityView = this._makeAptCityView();
                this._cityView.drawBase(ctx);
            },

            /* =====================================================================
               MISSION WAYPOINT MARKER
               ---------------------------------------------------------------------
               Draws a screen-edge indicator pointing toward the active mission target.
               ===================================================================== */
            drawMissionMarker() {
                const m = this.missions.activeMission;
                if (!m || m.status !== 'active') return;
                
                let targetX, targetY;
                if (m.type === MISSION_TYPES.DELIVERY && !m.pickedUp && this.deliveryVehicle) {
                    targetX = this.deliveryVehicle.x;
                    targetY = this.deliveryVehicle.y;
                } else {
                    targetX = m.targetX;
                    targetY = m.targetY;
                }
                
                const dx = targetX - this.player.x;
                const dy = targetY - this.player.y;
                const dist = Math.hypot(dx, dy);
                
                if (dist < (m.targetRadius || 80)) return; // Already there
                
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                
                const angle = Math.atan2(dy, dx);
                const margin = 60;
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                
                // Clamp to screen edge
                const edgeX = Math.max(margin, Math.min(this.canvas.width - margin, cx + Math.cos(angle) * (cx - margin)));
                const edgeY = Math.max(margin, Math.min(this.canvas.height - margin, cy + Math.sin(angle) * (cy - margin)));
                
                // Pulsing arrow
                const pulse = (Math.sin(_frameTime / 400) + 1) / 2;
                const color = m.type === MISSION_TYPES.DELIVERY ? '#ffaa00' : '#ff3355';
                
                this.ctx.save();
                this.ctx.translate(edgeX, edgeY);
                this.ctx.rotate(angle);
                
                // Arrow
                this.ctx.shadowColor = color;
                this.ctx.shadowBlur = 10 + pulse * 8;
                this.ctx.fillStyle = color;
                this.ctx.globalAlpha = 0.7 + pulse * 0.3;
                this.ctx.beginPath();
                this.ctx.moveTo(12, 0);
                this.ctx.lineTo(-6, -8);
                this.ctx.lineTo(-6, 8);
                this.ctx.closePath();
                this.ctx.fill();
                
                this.ctx.restore();
                
                // Distance text
                this.ctx.font = 'bold 10px Courier New';
                this.ctx.fillStyle = color;
                this.ctx.globalAlpha = 0.8;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`${Math.round(dist)}m`, edgeX, edgeY + 20);
                
                this.ctx.restore();
            },

        });

