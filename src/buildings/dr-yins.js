        /* =====================================================================
           DR. YIN'S — the clinic on the hub's south-west corner
           ---------------------------------------------------------------------
           Built on the tiered kit (buildings/tiered-kit.js), in the clinic's dark
           teal and medical cyan:
             · the ward, the tall west block: dark teal spandrels with a cyan LED
               line in each, ribbon windows behind slim fins, lit cool white
               after dark; the glass lobby on the street with the sliding doors
               under DR. YIN'S CLINIC in cyan, a glass canopy over the door; on
               its roof the medical cross, lit cyan at night, and the plant;
             · the treatment wing, lower, east: frosted glass panels (lit soft
               cyan), the pharmacy's window and its cross on the street, and the
               healing garden on its roof (a deck, raked gravel, bamboo).
           Collision is the ward and the wing (the old sections); the canopy
           overhangs. Lights are the stock ones, in the clinic's cyan.
           ===================================================================== */
        const YIN = { teal: '#1c3434', tealLo: '#0e1c1c', tealHi: '#2a4a4a', fin: '#0b1616', glass: '#0a1a1c', cyan: '#00f3ff', cyanSoft: '#7affd8',
            frost: '#5f8a88', frostHi: '#86b0ad', ink: '#061010', W: 500, D: 400, WARD: 54, WING: 30, LOBBY: 14 };
        const _yinFront = (t) => t.mitre.find(e => e && !e.hidden && e.ny > 0.99);

        /** Cyan letters on the strip (and lit on the light layer) */
        function _yinText(d, l, s, x, y, px, col, spacing) {
            for (const [c, cc] of [[d, col], [l, YIN.cyan]]) {
                c.save(); c.font = `600 ${px}px Montserrat, Helvetica, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = cc;
                if (spacing && 'letterSpacing' in c) c.letterSpacing = spacing + 'px';
                c.fillText(s, x, y); c.restore();
            }
        }

        /** The ward: ribbon windows over cyan-lined spandrels between slim fins; the glass lobby on the street front */
        function _yinWard(d, l, t, H, L) {
            const Y = YIN, lobby = Y.LOBBY, top = 4, rows = 4, rh = (H - lobby - 3 - top) / rows;
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, Y.teal); g.addColorStop(1, Y.tealLo); d.fillStyle = g; d.fillRect(0, 0, L, H);
            d.fillStyle = Y.tealHi; d.fillRect(0, 0, L, 2.6); d.fillStyle = 'rgba(255,255,255,.12)'; d.fillRect(0, 0, L, 0.5);
            d.fillStyle = Y.cyan; d.fillRect(0, 3, L, 0.4); l.fillStyle = Y.cyan; l.fillRect(0, 2.9, L, 0.6);
            const front = _yinFront(t);
            for (const e of t.mitre) {
                if (!e || e.hidden) continue;
                const x0 = e.u0 + 3, x1 = e.u0 + e.L - 3;
                for (let r = 0; r < rows; r++) {                                                   // the ribbon windows
                    const y0 = top + r * rh + 2, y1 = top + (r + 1) * rh - 1.6;
                    d.fillStyle = Y.glass; d.fillRect(x0, y0, x1 - x0, y1 - y0);
                    d.fillStyle = 'rgba(160,220,230,.14)'; d.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.35);
                    d.fillStyle = 'rgba(0,243,255,.05)'; d.fillRect(x0, y0, x1 - x0, y1 - y0);
                    for (let x = x0, k = 0; x < x1; x += 10, k++) {
                        const w = Math.min(10, x1 - x), on = ((k * 7 + r * 3 + Math.round(e.u0)) % 9);
                        if (on < 6) { l.fillStyle = on < 4 ? 'rgba(222,250,255,.8)' : 'rgba(0,243,255,.55)'; l.fillRect(x, y0, w, y1 - y0); }
                        d.fillStyle = Y.fin; d.fillRect(x - 0.3, y0, 0.6, y1 - y0);
                    }
                    d.fillStyle = Y.cyan; d.globalAlpha = 0.5; d.fillRect(x0, y1 + 0.6, x1 - x0, 0.3); d.globalAlpha = 1;   // the spandrel's LED line
                    l.fillStyle = 'rgba(0,243,255,.8)'; l.fillRect(x0, y1 + 0.5, x1 - x0, 0.5);
                }
                for (let x = e.u0 + 12.5; x < e.u0 + e.L - 2; x += 25) { d.fillStyle = Y.fin; d.fillRect(x - 0.7, top, 1.4, H - lobby - 3 - top); d.fillStyle = 'rgba(122,255,216,.15)'; d.fillRect(x - 0.7, top, 0.3, H - lobby - 3 - top); }
                // the ground floor: the lobby's glass on the street front, dark panels and a few windows round the rest
                const gy = H - lobby;
                if (e === front) {
                    d.fillStyle = '#081416'; d.fillRect(e.u0, gy - 3, e.L, 3);                         // the fascia
                    _yinText(d, l, "DR. YIN'S CLINIC", e.u0 + e.L / 2, gy - 1.4, 2.4, '#5fe6ee', 0.6);
                    d.fillStyle = '#0f2a2e'; d.fillRect(e.u0 + 2, gy, e.L - 4, lobby - 1);
                    d.fillStyle = 'rgba(180,240,245,.12)'; d.beginPath(); d.moveTo(e.u0 + 20, gy); d.lineTo(e.u0 + 44, gy); d.lineTo(e.u0 + 30, H - 1); d.lineTo(e.u0 + 6, H - 1); d.closePath(); d.fill();
                    const lg = l.createLinearGradient(0, gy, 0, H); lg.addColorStop(0, 'rgba(200,250,255,.55)'); lg.addColorStop(1, 'rgba(230,255,255,.85)'); l.fillStyle = lg; l.fillRect(e.u0 + 2, gy, e.L - 4, lobby - 1);
                    const dc = e.u0 + 125;                                                              // the sliding doors
                    d.fillStyle = '#c8d6d8'; d.fillRect(dc - 11, gy + 1, 22, 0.6); d.fillRect(dc - 0.3, gy + 1, 0.6, lobby - 2);
                    d.fillStyle = 'rgba(0,243,255,.6)'; d.fillRect(dc - 11, gy + 0.4, 22, 0.4);
                    d.fillStyle = '#8fb6b8'; l.fillStyle = '#000';
                    for (let x = e.u0 + 2; x < e.u0 + e.L - 2; x += 12) { if (Math.abs(x - dc) < 12) continue; d.fillRect(x - 0.3, gy, 0.6, lobby - 1); l.fillRect(x - 0.3, gy, 0.6, lobby - 1); }
                    d.fillStyle = 'rgba(20,40,40,.8)'; for (const px of [dc - 40, dc + 40]) { d.fillRect(px - 5, H - 4, 10, 3); }   // the waiting room's benches
                } else {
                    d.fillStyle = '#132626'; d.fillRect(e.u0, gy - 3, e.L, lobby + 3);
                    for (let x = e.u0 + 15; x < e.u0 + e.L - 10; x += 30) { d.fillStyle = Y.glass; d.fillRect(x, gy + 2, 12, 7); if ((x | 0) % 3) { l.fillStyle = 'rgba(222,250,255,.6)'; l.fillRect(x, gy + 2, 12, 7); } }
                }
                d.fillStyle = '#081010'; d.fillRect(e.u0, H - 1, e.L, 1);
            }
        }

        /** The treatment wing: frosted glass panels in a grid (lit soft cyan), the pharmacy's window and cross on the street */
        function _yinWing(d, l, t, H, L) {
            const Y = YIN, front = _yinFront(t), gy = H - Y.LOBBY;
            d.fillStyle = Y.tealLo; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(200,240,240,.35)'; d.fillRect(0, 0, L, 2.2);                     // the garden's glass balustrade
            d.fillStyle = Y.tealHi; d.fillRect(0, 2.2, L, 1.4);
            for (const e of t.mitre) {
                if (!e || e.hidden) continue;
                const pw = 9, n = Math.floor(e.L / pw), x0 = e.u0 + (e.L - n * pw) / 2;
                for (let i = 0; i < n; i++) for (let y = 4.6; y + 6 <= (e === front ? gy - 1 : H - 2); y += 6.4) {
                    const x = x0 + i * pw, k = (i * 5 + Math.round(y) * 3 + Math.round(e.u0)) % 7;
                    d.fillStyle = k === 0 ? Y.glass : Y.frost; d.fillRect(x + 0.4, y, pw - 0.8, 5.8);
                    if (k) { d.fillStyle = 'rgba(255,255,255,.08)'; d.fillRect(x + 0.4, y, pw - 0.8, 2); }
                    l.fillStyle = k === 0 ? 'rgba(222,250,255,.7)' : 'rgba(122,255,216,.32)'; l.fillRect(x + 0.4, y, pw - 0.8, 5.8);
                }
                if (e !== front) continue;
                d.fillStyle = '#081416'; d.fillRect(e.u0, gy - 1, e.L, 1.4);
                d.fillStyle = '#0f2a2e'; d.fillRect(e.u0 + 6, gy + 1, e.L - 12, Y.LOBBY - 2);        // the pharmacy's window
                l.fillStyle = 'rgba(210,255,250,.7)'; l.fillRect(e.u0 + 6, gy + 1, e.L - 12, Y.LOBBY - 2);
                d.fillStyle = '#8fb6b8'; l.fillStyle = '#000'; for (let x = e.u0 + 6; x <= e.u0 + e.L - 6; x += 16) { d.fillRect(x - 0.3, gy + 1, 0.6, Y.LOBBY - 2); l.fillRect(x - 0.3, gy + 1, 0.6, Y.LOBBY - 2); }
                const cx = e.u0 + e.L - 30, cy = gy - 6;                                                // the pharmacy's cross over it
                for (const [c, col] of [[d, '#2fd6a8'], [l, '#7affd8']]) { c.fillStyle = col; c.fillRect(cx - 1.4, cy - 4, 2.8, 8); c.fillRect(cx - 4, cy - 1.4, 8, 2.8); }
                _yinText(d, l, 'P H A R M A C Y', e.u0 + 70, gy - 6, 2.6, '#5fe6ee', 0.4);
            }
        }

        /** The canopy's edge: a thin glass slab with a cyan lip */
        function _yinCanopy(d, l, t, H, L) {
            d.fillStyle = '#2a4a4e'; d.fillRect(0, 0, L, H); d.fillStyle = 'rgba(200,250,255,.5)'; d.fillRect(0, 0, L, 0.4);
            d.fillStyle = YIN.cyan; d.fillRect(0, H - 0.5, L, 0.5); l.fillStyle = YIN.cyan; l.fillRect(0, 0, L, H);
        }

        // ── roofs (world coordinates; x, y the building's corner) ──

        function _yinWardRoof(c, glow, t) {
            const [x, y] = t.box, Y = YIN, cx = x + 125, cy = y + 210;
                        if (glow) { c.fillStyle = 'rgba(0,243,255,.5)'; c.fillRect(cx - 10, cy - 32, 20, 64); c.fillRect(cx - 32, cy - 10, 64, 20); c.strokeStyle = Y.cyan; c.lineWidth = 2; c.strokeRect(x + 6, y + 6, 238, 388); return; }
            c.fillStyle = '#1a2c2c'; c.fillRect(x, y, 250, 400);
            c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.beginPath(); for (let xx = x + 20; xx < x + 250; xx += 20) { c.moveTo(xx, y + 8); c.lineTo(xx, y + 392); } c.stroke();
            c.strokeStyle = Y.tealHi; c.lineWidth = 8; c.strokeRect(x + 4, y + 4, 242, 392);
            c.strokeStyle = 'rgba(0,243,255,.5)'; c.lineWidth = 1; c.strokeRect(x + 9, y + 9, 232, 382);
            c.fillStyle = '#cfe4e4'; c.fillRect(cx - 12, cy - 34, 24, 68); c.fillRect(cx - 34, cy - 12, 68, 24);
            c.fillStyle = '#0f9aa6'; c.fillRect(cx - 10, cy - 32, 20, 64); c.fillRect(cx - 32, cy - 10, 64, 20);
            for (const [px, py, w, h] of [[x + 24, y + 24, 56, 38], [x + 170, y + 24, 50, 34], [x + 24, y + 320, 40, 40]]) {   // the plant
                c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px + 4, py + 4, w, h);
                c.fillStyle = '#9aa6a6'; c.fillRect(px, py, w, h); c.strokeStyle = '#5a6666'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
                c.fillStyle = '#4a5656'; c.beginPath(); c.arc(px + w / 2, py + h / 2, Math.min(w, h) * 0.32, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#2a3434'; c.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; c.moveTo(px + w / 2 - Math.cos(a) * h * 0.3, py + h / 2 - Math.sin(a) * h * 0.3); c.lineTo(px + w / 2 + Math.cos(a) * h * 0.3, py + h / 2 + Math.sin(a) * h * 0.3); } c.stroke();
            }
        }

        /** The healing garden: a timber deck, raked gravel round stones, bamboo, benches, path lights (emissive) */
        function _yinGardenRoof(c, glow, t) {
            const [x, y] = t.box, Y = YIN;
            const lights = [[x + 30, y + 30], [x + 220, y + 30], [x + 30, y + 220], [x + 220, y + 220], [x + 125, y + 125]];
            if (glow) { for (const [px, py] of lights) { const g = c.createRadialGradient(px, py, 0, px, py, 14); g.addColorStop(0, 'rgba(200,255,240,.8)'); g.addColorStop(1, 'rgba(122,255,216,0)'); c.fillStyle = g; c.fillRect(px - 14, py - 14, 28, 28); } return; }
            c.fillStyle = '#2a3a34'; c.fillRect(x, y, 250, 250);
            c.fillStyle = '#7a5a40'; c.fillRect(x + 10, y + 10, 230, 60);                           // the deck
            c.strokeStyle = 'rgba(40,24,12,.35)'; c.lineWidth = 0.8; c.beginPath(); for (let xx = x + 16; xx < x + 240; xx += 6) { c.moveTo(xx, y + 10); c.lineTo(xx, y + 70); } c.stroke();
            c.fillStyle = '#9e9a8e'; c.fillRect(x + 10, y + 80, 230, 160);                          // the gravel, raked round its stones
            c.strokeStyle = 'rgba(70,66,56,.45)'; c.lineWidth = 0.8;
            for (let yy = y + 86; yy < y + 236; yy += 5) { c.beginPath(); c.moveTo(x + 12, yy); c.lineTo(x + 238, yy); c.stroke(); }
            for (const [sx, sy, r] of [[x + 90, y + 140, 14], [x + 170, y + 190, 10], [x + 60, y + 205, 8]]) {
                c.fillStyle = '#9e9a8e'; c.beginPath(); c.arc(sx, sy, r * 2.4, 0, Math.PI * 2); c.fill();
                for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(sx, sy, r + k * 4, 0, Math.PI * 2); c.stroke(); }
                c.fillStyle = '#5a5c58'; c.beginPath(); c.ellipse(sx, sy, r, r * 0.8, 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.ellipse(sx - r * 0.3, sy - r * 0.3, r * 0.4, r * 0.3, 0.4, 0, Math.PI * 2); c.fill();
            }
            for (const [bx, by] of [[x + 225, y + 95], [x + 225, y + 130], [x + 25, y + 95]]) for (let k = 0; k < 9; k++) {   // the bamboo
                c.fillStyle = k % 2 ? '#4f8a46' : '#77a25d'; c.beginPath(); c.arc(bx + Math.cos(k * 2.4) * 6, by + Math.sin(k * 2.4) * 6, 4, 0, Math.PI * 2); c.fill();
            }
            c.fillStyle = '#5a4030'; for (const bx of [x + 60, x + 150]) c.fillRect(bx, y + 30, 40, 9);   // benches on the deck
            for (const [px, py] of lights) { c.fillStyle = '#2a3434'; c.beginPath(); c.arc(px, py, 2.5, 0, Math.PI * 2); c.fill(); }
            c.strokeStyle = 'rgba(200,240,240,.6)'; c.lineWidth = 3; c.strokeRect(x + 2.5, y + 2.5, 245, 245);   // the glass balustrade
        }

        function _yinCanopyRoof(c, glow, t) {
            const [x0, y0, x1, y1] = t.box;
            if (glow) { c.strokeStyle = 'rgba(0,243,255,.8)'; c.lineWidth = 2; c.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2); return; }
            c.fillStyle = 'rgba(58,106,112,.85)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            c.strokeStyle = 'rgba(200,250,255,.35)'; c.lineWidth = 0.8; c.beginPath(); for (let x = x0 + 13; x < x1; x += 13) { c.moveTo(x, y0); c.lineTo(x, y1); } c.stroke();
            c.strokeStyle = YIN.cyan; c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
        }

        class DrYinsBuilding extends TieredBuilding {
            _setupSign() { this.attachedSign = null; }                  // the name is on the lobby's fascia, the cross on the roof
        }
        TierKit.profile(DrYinsBuilding);

        /** Dr. Yin's: x, y its corner; the ward (west) and the treatment wing (east) front south. */
        function createDrYins(x, y, config = {}) {
            const Y = YIN, ledge = (z, lip) => ({ z, out: 2.4, th: 2.4, top: Y.tealHi, band: [24, 44, 44], lip });
            return new DrYinsBuilding({
                id: 'dr_yins', x, y, label: "Dr. Yin's", type: 'clinic', facing: 'S', hero: 1.5, plan: { W: Y.W, D: Y.D },
                roofColor: '#142828', roofLightColor: '#1a3434', wallColor: Y.teal, wallLightColor: Y.tealHi, accentColor: Y.cyan,
                windowColor: '#04100f', windowLitColor: Y.cyan, windowFrameColor: '#060e0e', balconies: [], roofProps: [],
                sign: { text: 'CLINIC', color: Y.cyan, size: 28 },
                door: { target: config.doorTarget || 'medbay_sw', label: 'Enter Clinic', lightColor: Y.cyan },
                tiers: [
                    { id: 'ward', rect: [0, 0, 250, 400], z0: 0, z1: Y.WARD, S: 2, fill: Y.teal, paint: _yinWard, shade: [6, 16, 18],
                      ledges: [ledge(Y.LOBBY, 'rgba(0,243,255,.8)'), ledge(Y.WARD, 'rgba(122,255,216,.7)')], roofRes: 1, roofGlow: true, roof: _yinWardRoof },
                    { id: 'wing', rect: [250, 150, 250, 250], z0: 0, z1: Y.WING, S: 2, fill: Y.tealLo, paint: _yinWing, shade: [6, 16, 18],
                      ledges: [ledge(Y.WING, 'rgba(200,240,240,.7)')], roofRes: 1, roofGlow: true, roof: _yinGardenRoof },
                    // (a px off the wall: a tier back to back with a wall hides it below its top, _tkGeo)
                    { id: 'canopy', solid: false, rect: [60, 401, 130, 22], z0: Y.LOBBY - 1.5, z1: Y.LOBBY, S: 4, fill: '#2a4a4e', paint: _yinCanopy, shade: [6, 16, 18],
                      roofRes: 1, roofGlow: true, roof: _yinCanopyRoof }
                ],
                ...config
            });
        }
