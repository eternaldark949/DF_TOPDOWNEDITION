        /* =====================================================================
           TORQUE AUTO — Crimson Blvd's garage, beside the Cozy Cafe
           ---------------------------------------------------------------------
           Built on the tiered kit (buildings/tiered-kit.js), every part at its
           own height:
             · the garage hall, double height, in graphite corrugated steel with
               an amber pinstripe under the eave: two roll-up doors in hazard-
               striped frames either side of the glass entry, a row of
               clerestory windows over them, lit amber after dark; the sawtooth
               roof on top, its north lights glowing amber at night;
             · the Torque board on the hall's roof at the front, the script in
               amber, the trades under it, a string of bulbs round it;
             · the showroom wing, lower, its front all glass: Lady, the
               BlackMark V3, on her plinth behind it, lit rose gold at night; a
               skylight over the plinth and Lady's billboard on its roof.
           Collision is the hall and the wing (the factory's sections). The
           apron in front is painted under her (drawBase).
           ===================================================================== */
        const TQX = { wall: '#1f1f25', wallHi: '#34343c', rib: 'rgba(0,0,0,.28)', amber: '#ff9a2a', amberHi: '#ffc46a',
            steel: '#9aa3ad', steelHi: '#dfe3ea', roseGold: '#f4b49a', roof: '#2a2b31', roofLo: '#17171c', glass: '#26384a', glassHi: '#4d6880', ink: '#0c0b0f',
            HERO: 1.5, HALL: 30, WING: 24 };
        // Relative to the building's corner: the sawtooth bands, the doors on the front wall, the boards on the roofs, the wing's skylight
        const TQ_PLAN = { W: 700, D: 350, TEETH: 4, TEETH_D: 65, ROLLUPS: [[28, 130], [342, 130]], ENTRY: [190, 120],
            BOARD: [60, 272, 380, 64], BILL: [514, 266, 172, 70], SKY: [522, 76, 156, 168] };
        const _tqFontsReady = () => !document.fonts || (document.fonts.check('36px "Great Vibes"') && document.fonts.check('12px Orbitron'));

        // ── painters: each paints a tier's strip, x along its plan from vertex 0, y down from its top ──

        /** The edge of a tier that faces the street (S), and where plan x lies along the strip on it */
        const _tqFront = (t) => t.mitre.find(e => e && !e.hidden && e.ny > 0.99);

        /** Graphite corrugated steel: ribs, a dark cap, the pinstripe under the eave, clerestory windows (lit warm). */
        function _tqSteel(d, l, t, H, L, opt = {}) {
            const T = TQX, stripe = opt.stripe || T.amber;
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.wallHi); g.addColorStop(1, '#141418'); d.fillStyle = g; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(0,0,0,.3)'; for (let x = 0; x < L; x += 3) d.fillRect(x, 0, 0.9, H);           // the ribs
            d.fillStyle = 'rgba(255,255,255,.04)'; for (let x = 1.4; x < L; x += 3) d.fillRect(x, 0, 0.5, H);
            d.fillStyle = '#111115'; d.fillRect(0, 0, L, 2);                                                     // the cap
            d.fillStyle = stripe; d.fillRect(0, 3.2, L, 0.9);                                                    // the pinstripe
            d.fillStyle = '#0c0c10'; d.fillRect(0, H - 1.6, L, 1.6);                                             // the kerb
            if (opt.clerestory) for (const e of t.mitre) {
                if (!e || e.hidden) continue;
                const n = Math.floor((e.L - 12) / 16);
                for (let i = 0; i < n; i++) {
                    const x = e.u0 + 6 + (e.L - 12) * (i + 0.5) / n - 5, y = 5.5;
                    d.fillStyle = '#0d0f14'; d.fillRect(x - 0.6, y - 0.6, 11.2, 4.2);
                    d.fillStyle = T.glass; d.fillRect(x, y, 10, 3); d.fillStyle = 'rgba(200,220,240,.18)'; d.fillRect(x, y, 10, 1);
                    d.fillStyle = '#0d0f14'; for (const k of [2.5, 5, 7.5]) d.fillRect(x + k - 0.2, y, 0.4, 3);
                    if ((i * 7 + Math.round(e.u0)) % 5 !== 1) { l.fillStyle = 'rgba(255,160,60,.75)'; l.fillRect(x, y, 10, 3); l.fillStyle = '#000'; for (const k of [2.5, 5, 7.5]) l.fillRect(x + k - 0.2, y, 0.4, 3); }
                }
            }
        }

        /** The hall: steel, and on its front the roll-up doors in hazard frames and the glass entry under a canopy */
        function _tqHall(d, l, t, H, L) {
            _tqSteel(d, l, t, H, L, { clerestory: true });
            const e = _tqFront(t); if (!e) return;
            const X = (px) => e.u0 + px, top = H - 21;                                                          // (the hall starts at plan x 0)
            for (const [dx, w] of TQ_PLAN.ROLLUPS) {
                const x0 = X(dx), x1 = x0 + w;
                d.save(); d.beginPath(); d.rect(x0 - 4, top - 3, w + 8, H - top + 3); d.rect(x0, top, w, H - top); d.clip('evenodd');   // the hazard frame
                d.fillStyle = '#e0a028'; d.fillRect(x0 - 4, top - 3, w + 8, H - top + 3);
                d.fillStyle = '#16161a'; for (let k = x0 - 8; k < x1 + 8; k += 5) { d.beginPath(); d.moveTo(k, top - 3); d.lineTo(k + 2.5, top - 3); d.lineTo(k + 2.5 + H - top, H); d.lineTo(k + H - top, H); d.closePath(); d.fill(); }
                d.restore();
                const g = d.createLinearGradient(0, top, 0, H); g.addColorStop(0, '#6b727b'); g.addColorStop(1, '#4a5058'); d.fillStyle = g; d.fillRect(x0, top, w, H - top);
                d.fillStyle = 'rgba(20,20,24,.55)'; for (let y = top + 2; y < H; y += 2) d.fillRect(x0, y, w, 0.45);   // the slats
                d.fillStyle = 'rgba(255,255,255,.12)'; for (let y = top + 2.45; y < H; y += 2) d.fillRect(x0, y, w, 0.3);
                d.fillStyle = '#2a2c31'; d.fillRect(x0 + w / 2 - 6, H - 3.2, 12, 1.2);                          // the handle
                d.fillStyle = '#1b1c20'; d.fillRect(x0 - 4, top - 6, w + 8, 2.6);                                   // the roller box
                l.fillStyle = 'rgba(255,170,70,.5)'; l.fillRect(x0, H - 1.2, w, 1.2);                                // light under the door
            }
            // the glass entry: a steel frame, mullions, the doors, a canopy over it, TORQUE on the canopy's fascia
            const [ex, ew] = TQ_PLAN.ENTRY, x0 = X(ex), gt = H - 19;
            d.fillStyle = TQX.steel; d.fillRect(x0 - 1.2, gt - 1.2, ew + 2.4, H - gt + 1.2);
            const gg = d.createLinearGradient(0, gt, 0, H); gg.addColorStop(0, '#6a5a40'); gg.addColorStop(1, '#3a3020'); d.fillStyle = gg; d.fillRect(x0, gt, ew, H - gt);
            d.fillStyle = 'rgba(255,220,170,.12)'; d.beginPath(); d.moveTo(x0 + 8, gt); d.lineTo(x0 + 26, gt); d.lineTo(x0 + 12, H); d.lineTo(x0 - 6 + 8, H); d.closePath(); d.fill();
            d.fillStyle = TQX.steel; for (let k = 1; k < 6; k++) d.fillRect(x0 + ew * k / 6 - 0.4, gt, 0.8, H - gt);
            d.fillRect(x0, gt + 5, ew, 0.6);
            d.fillStyle = '#c9ccd2'; d.fillRect(x0 + ew / 2 - 3, gt + 10, 0.8, 4); d.fillRect(x0 + ew / 2 + 2.2, gt + 10, 0.8, 4);   // the door pulls
            const lg = l.createLinearGradient(0, gt, 0, H); lg.addColorStop(0, 'rgba(255,190,110,.55)'); lg.addColorStop(1, 'rgba(255,214,150,.9)'); l.fillStyle = lg; l.fillRect(x0, gt, ew, H - gt);
            l.fillStyle = '#000'; for (let k = 1; k < 6; k++) l.fillRect(x0 + ew * k / 6 - 0.4, gt, 0.8, H - gt); l.fillRect(x0, gt + 5, ew, 0.6);
            d.fillStyle = '#0d0c10'; d.fillRect(x0 - 6, gt - 6, ew + 12, 4.4); d.fillStyle = TQX.amber; d.fillRect(x0 - 6, gt - 1.8, ew + 12, 0.6);
            for (const [c, col] of [[d, TQX.amberHi], [l, 'rgba(255,190,100,1)']]) { c.save(); c.font = '3px Orbitron, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText('T O R Q U E', x0 + ew / 2, gt - 3.8); c.restore(); }
        }

        /** The showroom wing: steel, its front all glass, Lady on her plinth behind it (lit rose gold) */
        function _tqWing(d, l, t, H, L) {
            _tqSteel(d, l, t, H, L, { stripe: TQX.roseGold });
            const e = _tqFront(t); if (!e) return;
            const x0 = e.u0 + 12, w = 176, gt = 6.5;
            d.fillStyle = TQX.steel; d.fillRect(x0 - 1.2, gt - 1.2, w + 2.4, H - gt - 0.4);
            const g = d.createLinearGradient(0, gt, 0, H); g.addColorStop(0, '#2c3442'); g.addColorStop(1, '#1a1d24'); d.fillStyle = g; d.fillRect(x0, gt, w, H - gt - 1.6);
            // the plinth and Lady on it: a low black coupe, rose gold lines, her lamps
            const cx = x0 + w / 2, py = H - 4.5;
            d.fillStyle = '#2a2a30'; d.fillRect(cx - 34, py, 68, 2.9); d.fillStyle = TQX.roseGold; d.fillRect(cx - 34, py, 68, 0.4);
            d.fillStyle = '#08080a'; d.beginPath(); d.moveTo(cx - 28, py); d.lineTo(cx - 27, py - 4); d.quadraticCurveTo(cx - 14, py - 6, cx - 8, py - 9.5); d.lineTo(cx + 9, py - 9.5); d.quadraticCurveTo(cx + 18, py - 6, cx + 28, py - 4.5); d.lineTo(cx + 28.5, py); d.closePath(); d.fill();
            d.fillStyle = '#3a4250'; d.beginPath(); d.moveTo(cx - 6, py - 8.6); d.lineTo(cx + 8, py - 8.6); d.lineTo(cx + 14, py - 5.4); d.lineTo(cx - 12, py - 5.4); d.closePath(); d.fill();
            d.strokeStyle = TQX.roseGold; d.lineWidth = 0.35; d.beginPath(); d.moveTo(cx - 27, py - 3.6); d.quadraticCurveTo(cx, py - 5.2, cx + 28, py - 3.8); d.stroke();
            for (const wx of [cx - 18, cx + 18]) { d.fillStyle = '#111'; d.beginPath(); d.arc(wx, py - 0.5, 3.2, 0, Math.PI * 2); d.fill(); d.fillStyle = '#9aa3ad'; d.beginPath(); d.arc(wx, py - 0.5, 1.5, 0, Math.PI * 2); d.fill(); }
            d.fillStyle = TQX.steel; for (let k = 1; k < 4; k++) d.fillRect(x0 + w * k / 4 - 0.4, gt, 0.8, H - gt - 1.6);   // the mullions
            d.fillStyle = 'rgba(200,225,255,.1)'; d.beginPath(); d.moveTo(x0 + 4, gt); d.lineTo(x0 + 30, gt); d.lineTo(x0 + 14, H - 2); d.lineTo(x0 - 4 + 4, H - 2); d.closePath(); d.fill();
            const lg = l.createRadialGradient(cx, py - 6, 2, cx, py - 6, 70); lg.addColorStop(0, 'rgba(255,214,196,.95)'); lg.addColorStop(1, 'rgba(248,170,140,.35)');
            l.fillStyle = lg; l.fillRect(x0, gt, w, H - gt - 1.6);
            l.save(); l.globalCompositeOperation = 'destination-out'; l.fillStyle = 'rgba(0,0,0,.85)';                    // her silhouette against it
            l.beginPath(); l.moveTo(cx - 28, py); l.lineTo(cx - 27, py - 4); l.quadraticCurveTo(cx - 14, py - 6, cx - 8, py - 9.5); l.lineTo(cx + 9, py - 9.5); l.quadraticCurveTo(cx + 18, py - 6, cx + 28, py - 4.5); l.lineTo(cx + 28.5, py); l.closePath(); l.fill();
            l.fillStyle = '#000'; for (let k = 1; k < 4; k++) l.fillRect(x0 + w * k / 4 - 0.4, gt, 0.8, H - gt - 1.6); l.restore();
        }

        // ── roofs (world coordinates, in each tier's plane) ──

        /** The hall's sawtooth: metal slopes, each rising to its glazed north light (emissive: the north lights lit amber) */
        function _tqHallRoof(c, emissive, t) {
            const [x, y] = t.box, T = TQX, B = TorqueArt.box, Pl = TQ_PLAN;
            if (emissive) { for (let i = 0; i < Pl.TEETH; i++) { c.fillStyle = 'rgba(255,136,0,.85)'; c.fillRect(x + 8, y + 8 + i * Pl.TEETH_D, 484, 7); } _tqTorqueBoard(c, x, y, true); return; }
            B(c, x, y, 500, 350, T.roofLo, '#45454e', 3, 2);
            for (let i = 0; i < Pl.TEETH; i++) {
                const ty = y + 8 + i * Pl.TEETH_D, g = c.createLinearGradient(0, ty, 0, ty + Pl.TEETH_D);
                g.addColorStop(0, '#3a3b43'); g.addColorStop(1, '#1a1a1f');
                c.fillStyle = g; c.fillRect(x + 8, ty + 8, 484, Pl.TEETH_D - 8);
                c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.beginPath();
                for (let xx = x + 14; xx < x + 492; xx += 7) { c.moveTo(xx, ty + 9); c.lineTo(xx, ty + Pl.TEETH_D); } c.stroke();
                const gg = c.createLinearGradient(0, ty, 0, ty + 8); gg.addColorStop(0, T.glassHi); gg.addColorStop(1, T.glass);
                c.fillStyle = gg; c.fillRect(x + 8, ty, 484, 8);
                c.fillStyle = 'rgba(223,227,234,.35)'; for (let xx = x + 8; xx < x + 492; xx += 40) c.fillRect(xx, ty, 1.2, 8);
            }
            c.fillStyle = '#26262c'; c.fillRect(x + 8, y + 8 + Pl.TEETH * Pl.TEETH_D, 484, 350 - 16 - Pl.TEETH * Pl.TEETH_D);   // the flat strip at the front, under the board
            c.strokeStyle = TQX.amber; c.lineWidth = 1.2; c.strokeRect(x + 3, y + 3, 494, 344);
            _tqTorqueBoard(c, x, y, false);
        }

        /** The board along the hall's front, lying on its roof: the Torque script lit amber, the trades under it, bulbs round it */
        function _tqTorqueBoard(p, x, y, glow) {
            const T = TQX, B = TorqueArt.box, [bx, by, bw, bh] = TQ_PLAN.BOARD;
            if (!glow) { B(p, x + bx, y + by, bw, bh, '#0d0c10', T.steel, 6, 2); B(p, x + bx + 5, y + by + 5, bw - 10, bh - 10, null, 'rgba(255,154,42,.4)', 4, 1); }
            TorqueArt.text(p, 'Torque', x + bx + bw / 2, y + by + 26, 40, glow ? '#ff8800' : '#e88a2a', '"Great Vibes", cursive');
            TorqueArt.text(p, 'A U T O   ·   S E R V I C E   ·   W R A P S', x + bx + bw / 2, y + by + 52, 7, glow ? '#ffd9a0' : '#b8aca2');
            if (glow) { p.fillStyle = '#ffa030'; for (let xx = bx + 8; xx < bx + bw - 4; xx += 14) for (const yy of [by + 2, by + bh - 2]) { p.beginPath(); p.arc(x + xx, y + yy, 1.6, 0, Math.PI * 2); p.fill(); } }
        }

        /** Lady's billboard, lying on the wing's roof (x, y: the building's corner) */
        function _tqLadyBoard(p, x, y, glow) {
            const T = TQX, B = TorqueArt.box, [lx, ly, lw, lh] = TQ_PLAN.BILL;
            if (!glow) { B(p, x + lx, y + ly, lw, lh, '#08080a', T.steelHi, 3, 1.5); p.fillStyle = 'rgba(223,227,234,.08)'; p.fillRect(x + lx + 4, y + ly + 4, lw - 8, lh * 0.4); }
            TorqueArt.text(p, 'L A D Y', x + lx + lw / 2, y + ly + 20, 15, glow ? '#ffffff' : T.steelHi);
            TorqueArt.text(p, 'BlackMark V3', x + lx + lw / 2, y + ly + 40, 16, glow ? '#f2f2f6' : '#c9ccd2', '"Great Vibes", cursive');
            TorqueArt.text(p, 'est. 5930  ·  at Torque', x + lx + lw / 2, y + ly + 58, 6, glow ? '#f8d2c2' : '#8d8178');
        }

        /** The wing's flat roof and the skylight over Lady's plinth (emissive: rose gold) */
        function _tqWingRoof(c, emissive, t) {
            const [x, y] = t.box, T = TQX, B = TorqueArt.box, [sx, sy, sw, sh] = TQ_PLAN.SKY, ox = x - 500, oy = y - 50;
            if (emissive) { c.fillStyle = 'rgba(248,190,168,.4)'; c.fillRect(ox + sx + 2, oy + sy + 2, sw - 4, sh - 4); _tqLadyBoard(c, ox, oy, true); return; }
            B(c, x, y, 200, 300, '#26262c', '#45454e', 3, 2);
            B(c, ox + sx, oy + sy, sw, sh, T.glass, T.steel, 3, 1.5);
            c.strokeStyle = 'rgba(223,227,234,.4)'; c.lineWidth = 1; c.beginPath();
            for (let i = 1; i < 4; i++) { c.moveTo(ox + sx + i * sw / 4, oy + sy); c.lineTo(ox + sx + i * sw / 4, oy + sy + sh); }
            for (let i = 1; i < 3; i++) { c.moveTo(ox + sx, oy + sy + i * sh / 3); c.lineTo(ox + sx + sw, oy + sy + i * sh / 3); } c.stroke();
            c.fillStyle = 'rgba(200,225,255,.12)'; c.beginPath(); c.moveTo(ox + sx + 6, oy + sy + 6); c.lineTo(ox + sx + 50, oy + sy + 6); c.lineTo(ox + sx + 6, oy + sy + 60); c.closePath(); c.fill();
            c.strokeStyle = TQX.roseGold; c.lineWidth = 1.2; c.strokeRect(x + 3, y + 3, 194, 294);
            _tqLadyBoard(c, ox, oy, false);
        }

        class TorqueAutoBuilding extends TieredBuilding {
            _setupSign() { this.attachedSign = null; }                  // the script is on the roof's board
            _generateLights() {
                // The hall keeps Torque's hot orange lamps round every edge (its accent, #ff8800: ETERNAL's block colour);
                // the showroom wing's are rose gold so the BlackMark's corner reads apart
                const all = this.sections, accent = this.colors.accent;
                this.sections = all.slice(0, 1); super._generateLights();
                const n = this.attachedLights.length;
                this.sections = all.slice(1); this.colors.accent = TQX.roseGold; super._generateLights();
                for (const l of this.attachedLights.slice(n)) l.keepColor = true;   // the block's orange tint passes them by
                this.sections = all; this.colors.accent = accent;
                this.topReach = 120; this.glowReach = 120;
            }
            _layer(c, key, x, y, w, h, paint, k = 1) {
                const ready = !document.fonts || (document.fonts.check('36px "Great Vibes"') && document.fonts.check('12px Orbitron'));
                if (!ready) { c.save(); LandmarkKit.plane(c, k); paint(c); c.restore(); return; }
                LandmarkKit.drawSprite(c, LandmarkKit.sprite(this, key, this.x + x, this.y + y, w, h, 1, paint), k);
            }
            /** Under her feet: the apron in front, chevrons before each roll-up, the A-frame and the air station */
            drawBase(c) {
                super.drawBase(c);
                this._layer(c, 'tq_apron', -10, 340, 720, 60, p => {
                    const x = this.x, y = this.y + 350, B = TorqueArt.box;
                    p.fillStyle = 'rgba(40,40,46,.85)'; p.fillRect(x, y, 700, 40);
                    p.strokeStyle = 'rgba(0,0,0,.35)'; p.lineWidth = 1; p.beginPath();
                    for (let xx = 50; xx < 700; xx += 50) { p.moveTo(x + xx, y); p.lineTo(x + xx, y + 40); } p.stroke();
                    for (const [dx, w] of TQ_PLAN.ROLLUPS) {
                        p.save(); p.beginPath(); p.rect(x + dx, y + 4, w, 32); p.clip();
                        for (let k = -2; k < w / 14 + 2; k++) { p.fillStyle = 'rgba(255,170,40,.55)'; p.beginPath(); p.moveTo(x + dx + k * 14, y + 4); p.lineTo(x + dx + k * 14 + 7, y + 4); p.lineTo(x + dx + k * 14 + 19, y + 36); p.lineTo(x + dx + k * 14 + 12, y + 36); p.closePath(); p.fill(); }
                        p.restore();
                    }
                    const [ex, ew] = TQ_PLAN.ENTRY;
                    B(p, x + ex + 20, y + 4, ew - 40, 18, '#1c1c20', 'rgba(255,154,42,.6)', 2, 1);
                    TorqueArt.text(p, 'TORQUE', x + ex + ew / 2, y + 13, 7, 'rgba(255,170,70,.75)');
                    // The A-frame by the door (WRAPS · TINT · TUNES) and a tyre display on the other side
                    B(p, x + ex + ew + 4, y + 8, 22, 26, '#2a2a30', TQX.amber, 2, 1);
                    TorqueArt.text(p, 'WRAPS', x + ex + ew + 15, y + 15, 4.5, TQX.amberHi);
                    TorqueArt.text(p, 'TINT', x + ex + ew + 15, y + 21, 4.5, '#ffffff');
                    TorqueArt.text(p, 'TUNES', x + ex + ew + 15, y + 27, 4.5, TQX.amberHi);
                    for (const [tx, ty] of [[x + ex - 18, y + 22], [x + ex - 32, y + 16]]) {
                        p.fillStyle = TQX.ink; p.beginPath(); p.arc(tx, ty, 9, 0, Math.PI * 2); p.fill();
                        p.strokeStyle = TQX.steelHi; p.lineWidth = 1; p.beginPath(); p.arc(tx, ty, 4.5, 0, Math.PI * 2); p.stroke();
                    }
                    // The air and water station at the west corner
                    B(p, x + 6, y + 6, 14, 22, '#b4321e', '#4e120a', 2, 1);
                    p.fillStyle = TQX.steelHi; p.fillRect(x + 9, y + 10, 8, 4);
                    p.strokeStyle = '#111'; p.lineWidth = 1.4; p.beginPath(); p.moveTo(x + 20, y + 20); p.quadraticCurveTo(x + 30, y + 34, x + 22, y + 36); p.stroke();
                });
            }
            /** Over her: the tiers (the kit). The boards' lettering (on the roofs) waits for its fonts: baked before they load, the roofs are baked again once they have. */
            drawTop(c) {
                if (!this._tqFonts && _tqFontsReady()) { this._tqFonts = true; this._lkSprites = {}; }
                super.drawTop(c);
            }
            drawSign() {}
        }
        TierKit.profile(TorqueAutoBuilding);

        /** Torque Auto: x, y its corner; the hall and the showroom wing front south. */
        function createTorqueAuto(x, y, config = {}) {
            const T = TQX, Pl = TQ_PLAN;
            const eave = (z, lip) => ({ z, out: 2.4, th: 2.4, top: '#34343c', band: [38, 38, 44], lip });
            return new TorqueAutoBuilding({
                id: 'torque_auto', x, y, label: 'Torque Auto', type: 'auto_shop', facing: 'S', hero: T.HERO, plan: { W: Pl.W, D: Pl.D },
                roofColor: '#1a1a14', roofLightColor: '#222218', wallColor: T.wall, wallLightColor: T.wallHi, accentColor: '#ff8800',
                windowColor: '#1a1808', windowLitColor: '#ffaa00', windowFrameColor: '#111', balconies: [], roofProps: [],
                sign: { text: 'TORQUE', color: '#ff8800', size: 36 },
                door: { target: config.doorTarget || 'auto_shop', label: 'Enter Auto Shop', lightColor: '#ff8800' },
                tiers: [
                    { id: 'hall', rect: [0, 0, 500, 350], z0: 0, z1: T.HALL, S: 2, fill: T.wall, paint: _tqHall, shade: [10, 10, 14],
                      ledges: [eave(T.HALL, T.amber)], roofRes: 1, roofGlow: true, roof: _tqHallRoof },
                    { id: 'wing', rect: [500, 50, 200, 300], z0: 0, z1: T.WING, S: 2, fill: T.wall, paint: _tqWing, shade: [10, 10, 14],
                      ledges: [eave(T.WING, T.roseGold)], roofRes: 1, roofGlow: true, roof: _tqWingRoof }
                ],
                ...config
            });
        }
