        /* =====================================================================
           TORQUE AUTO — Crimson Blvd's garage, beside the Cozy Cafe
           ---------------------------------------------------------------------
           The garage hall under a sawtooth roof (its north-light glazing glows
           amber at night), the Torque script on a lit board along its front,
           two roll-up doors either side of the glass entry. The showroom wing
           has a skylight over the plinth and Lady's billboard on its roof.
           Graphite walls with an amber pinstripe. The sections, door and
           collision are the factory's; this only paints them.
           ===================================================================== */
        const TQX = { wall: '#1f1f25', wallHi: '#34343c', rib: 'rgba(0,0,0,.28)', amber: '#ff9a2a', amberHi: '#ffc46a',
            steel: '#9aa3ad', steelHi: '#dfe3ea', roseGold: '#f4b49a', roof: '#2a2b31', roofLo: '#17171c', glass: '#26384a', glassHi: '#4d6880', ink: '#0c0b0f' };
        // Relative to the building's corner: the sawtooth bands, the sign board, the doors on the front wall, the wing's skylight and billboard
        const TQ_PLAN = { TEETH: 4, TEETH_D: 65, BOARD: [60, 272, 380, 64], ROLLUPS: [[28, 130], [342, 130]], ENTRY: [190, 120],
            SKY: [522, 76, 156, 168], BILL: [514, 266, 172, 70] };

        class TorqueAutoBuilding extends BuildingV2 {
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
                this.topReach = 60; this.glowReach = 60;
            }
            _k() { return CONFIG.BUILDINGS.LEAN ? 1 + this._leanScale() : 1; }
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
            /** Over her: the walls (ribs, pinstripe, the doors and the showroom glass), then the roof */
            drawTop(c) {
                const cam = game.camera, k = this._k(), T = TQX;
                const P = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                const at = (x, y, f) => { const q = P(x, y); return [x + (q[0] - x) * f, y + (q[1] - y) * f]; };   // a point f of the way up the wall
                const quad = (x0, y0, x1, y1, f0, f1) => { const a = at(x0, y0, f0), b = at(x1, y1, f0), cc = at(x1, y1, f1), d = at(x0, y0, f1);
                    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...cc); c.lineTo(...d); c.closePath(); };
                c.save();
                for (const f of this._visibleFaces(cam)) {
                    const a = P(f.x1, f.y1), b = P(f.x2, f.y2), g = c.createLinearGradient(f.x1, f.y1, a[0], a[1]);
                    g.addColorStop(0, '#141418'); g.addColorStop(1, f.side === 'S' ? T.wallHi : T.wall);
                    c.fillStyle = g; c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.lineTo(...b); c.lineTo(...a); c.closePath(); c.fill();
                    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.stroke();
                    // Corrugated ribs, an amber pinstripe under the eave
                    const len = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), n = Math.floor(len / 9);
                    c.strokeStyle = T.rib; c.lineWidth = 1; c.beginPath();
                    for (let i = 1; i < n; i++) { const u = i / n, x = f.x1 + (f.x2 - f.x1) * u, y = f.y1 + (f.y2 - f.y1) * u, q = P(x, y); c.moveTo(x, y); c.lineTo(...q); }
                    c.stroke();
                    c.strokeStyle = T.amber; c.lineWidth = 1.6; c.beginPath(); c.moveTo(...at(f.x1, f.y1, 0.86)); c.lineTo(...at(f.x2, f.y2, 0.86)); c.stroke();
                    if (f.side !== 'S') continue;
                    const lo = Math.min(f.x1, f.x2), hi = Math.max(f.x1, f.x2), y = f.y1, wx = (dx) => this.x + dx;
                    const span = (x0, w, fill, top) => { const a0 = Math.max(lo, x0), a1 = Math.min(hi, x0 + w); if (a1 - a0 < 4) return false; quad(a0, y, a1, y, 0, top); c.fillStyle = fill; c.fill(); return [a0, a1]; };
                    // The roll-up doors: steel slats in a hazard-striped frame
                    for (const [dx, w] of TQ_PLAN.ROLLUPS) {
                        const r = span(wx(dx) - 5, w + 10, '#e0a028', 0.66); if (!r) continue;
                        const s = span(wx(dx), w, '#5b616a', 0.6);
                        if (s) { c.strokeStyle = 'rgba(20,20,24,.55)'; c.lineWidth = 1; c.beginPath();
                            for (let i = 1; i < 10; i++) { const f0 = 0.6 * i / 10; c.moveTo(...at(s[0], y, f0)); c.lineTo(...at(s[1], y, f0)); } c.stroke(); }
                    }
                    // The glass entry and the showroom's glass
                    const [ex, ew] = TQ_PLAN.ENTRY, gl = c.createLinearGradient(0, y, 0, y - 30);
                    gl.addColorStop(0, '#3a3020'); gl.addColorStop(1, '#6a5a40');
                    if (span(wx(ex), ew, gl, 0.62)) { c.strokeStyle = T.steel; c.lineWidth = 1.2; c.stroke(); }
                    if (span(wx(512), 176, gl, 0.74)) { c.strokeStyle = T.steel; c.lineWidth = 1.2; c.stroke();
                        c.beginPath(); for (let i = 1; i < 4; i++) { const xx = wx(512) + i * 44; c.moveTo(...at(xx, y, 0)); c.lineTo(...at(xx, y, 0.74)); } c.stroke(); }
                }
                c.restore();
                this._layer(c, 'tq_roof', -6, -6, 712, 362, p => this._roof(p, false), k);
            }
            _roof(p, glow) {
                const x = this.x, y = this.y, T = TQX, B = TorqueArt.box, Pl = TQ_PLAN;
                if (!glow) {
                    // The hall: sawtooth bays, each a metal slope rising to its glazed north light
                    B(p, x, y, 500, 350, T.roofLo, '#45454e', 3, 2);
                    for (let i = 0; i < Pl.TEETH; i++) {
                        const ty = y + 8 + i * Pl.TEETH_D, g = p.createLinearGradient(0, ty, 0, ty + Pl.TEETH_D);
                        g.addColorStop(0, '#3a3b43'); g.addColorStop(1, '#1a1a1f');
                        p.fillStyle = g; p.fillRect(x + 8, ty + 8, 484, Pl.TEETH_D - 8);
                        p.strokeStyle = 'rgba(0,0,0,.25)'; p.lineWidth = 1; p.beginPath();
                        for (let xx = x + 14; xx < x + 492; xx += 7) { p.moveTo(xx, ty + 9); p.lineTo(xx, ty + Pl.TEETH_D); } p.stroke();
                        const gg = p.createLinearGradient(0, ty, 0, ty + 8); gg.addColorStop(0, T.glassHi); gg.addColorStop(1, T.glass);
                        p.fillStyle = gg; p.fillRect(x + 8, ty, 484, 8);
                        p.fillStyle = 'rgba(223,227,234,.35)'; for (let xx = x + 8; xx < x + 492; xx += 40) p.fillRect(xx, ty, 1.2, 8);
                    }
                    // Rooftop kit between the teeth: two vents and a unit
                    for (const [dx, dy] of [[40, 230], [455, 40]]) { B(p, x + dx, y + dy, 26, 20, '#4a4d55', '#2a2c31', 2, 1); p.strokeStyle = '#2a2c31'; p.beginPath(); for (let i = 1; i < 4; i++) { p.moveTo(x + dx + 3, y + dy + i * 5); p.lineTo(x + dx + 23, y + dy + i * 5); } p.stroke(); }
                    // The wing: flat roof, the skylight over the plinth, the billboard
                    B(p, x + 500, y + 50, 200, 300, '#26262c', '#45454e', 3, 2);
                    const [sx, sy, sw, sh] = Pl.SKY;
                    B(p, x + sx, y + sy, sw, sh, T.glass, T.steel, 3, 1.5);
                    p.strokeStyle = 'rgba(223,227,234,.4)'; p.lineWidth = 1; p.beginPath();
                    for (let i = 1; i < 4; i++) { p.moveTo(x + sx + i * sw / 4, y + sy); p.lineTo(x + sx + i * sw / 4, y + sy + sh); }
                    for (let i = 1; i < 3; i++) { p.moveTo(x + sx, y + sy + i * sh / 3); p.lineTo(x + sx + sw, y + sy + i * sh / 3); } p.stroke();
                    p.fillStyle = 'rgba(200,225,255,.12)'; p.beginPath(); p.moveTo(x + sx + 6, y + sy + 6); p.lineTo(x + sx + 50, y + sy + 6); p.lineTo(x + sx + 6, y + sy + 60); p.closePath(); p.fill();
                }
                // The board along the hall's front: the Torque script lit amber, the trades under it
                const [bx, by, bw, bh] = Pl.BOARD;
                if (!glow) { B(p, x + bx, y + by, bw, bh, '#0d0c10', T.steel, 6, 2); B(p, x + bx + 5, y + by + 5, bw - 10, bh - 10, null, 'rgba(255,154,42,.4)', 4, 1); }
                TorqueArt.text(p, 'Torque', x + bx + bw / 2, y + by + 26, 40, glow ? '#ff8800' : '#e88a2a', '"Great Vibes", cursive');
                TorqueArt.text(p, 'A U T O   ·   S E R V I C E   ·   W R A P S', x + bx + bw / 2, y + by + 52, 7, glow ? '#ffd9a0' : '#b8aca2');
                // Lady's billboard on the wing
                const [lx, ly, lw, lh] = Pl.BILL;
                if (!glow) { B(p, x + lx, y + ly, lw, lh, '#08080a', T.steelHi, 3, 1.5); p.fillStyle = 'rgba(223,227,234,.08)'; p.fillRect(x + lx + 4, y + ly + 4, lw - 8, lh * 0.4); }
                TorqueArt.text(p, 'L A D Y', x + lx + lw / 2, y + ly + 20, 15, glow ? '#ffffff' : T.steelHi);
                TorqueArt.text(p, 'BlackMark V3', x + lx + lw / 2, y + ly + 40, 16, glow ? '#f2f2f6' : '#c9ccd2', '"Great Vibes", cursive');
                TorqueArt.text(p, 'est. 5930  ·  at Torque', x + lx + lw / 2, y + ly + 58, 6, glow ? '#f8d2c2' : '#8d8178');
                if (glow) {
                    // The north lights lit from inside, the wing's skylight rose gold, a string of bulbs round the board
                    for (let i = 0; i < Pl.TEETH; i++) { p.fillStyle = 'rgba(255,136,0,.85)'; p.fillRect(x + 8, y + 8 + i * Pl.TEETH_D, 484, 7); }
                    const [sx, sy, sw, sh] = Pl.SKY; p.fillStyle = 'rgba(248,190,168,.4)'; p.fillRect(x + sx + 2, y + sy + 2, sw - 4, sh - 4);
                    p.fillStyle = '#ffa030';
                    for (let xx = bx + 8; xx < bx + bw - 4; xx += 14) for (const yy of [by + 2, by + bh - 2]) { p.beginPath(); p.arc(x + xx, y + yy, 1.6, 0, Math.PI * 2); p.fill(); }
                }
            }
            drawEmissive(c, dark, beamsOnly) {
                if (beamsOnly || dark <= 0.04) return;
                c.save(); c.globalAlpha *= Math.min(0.9, dark * 0.9); c.globalCompositeOperation = 'lighter';
                this._layer(c, 'tq_glow', -6, -6, 712, 362, p => this._roof(p, true), this._k());
                c.restore();
            }
            drawSign() {}
        }
