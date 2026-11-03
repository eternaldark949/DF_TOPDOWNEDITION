        /* =====================================================================
           THE WAREHOUSE — the hub's storage hall (the registry's 'warehouse')
           ---------------------------------------------------------------------
           Built on the tiered kit (buildings/tiered-kit.js), in its cold grey:
             · the shed: corrugated steel streaked with rust over a concrete
               plinth, a band of high windows (some lit a sodium yellow-white),
               its name stencilled faint along the front; three loading docks
               on the front, roll-up doors in black-and-yellow bumpers, a lamp
               over each, the personnel door at the end;
             · the monitor roof along its ridge: a ribbon of clerestory glass,
               lit from inside after dark;
             · a steel canopy over the docks, and the dock apron in front.
           The city view's backdrop warehouses (buildings/city-view.js) stay on
           the stock factory, createGenericWarehouse; this is the map's.
           ===================================================================== */
        const WH = { steel: '#3a3c40', steelLo: '#25272a', steelHi: '#55585e', conc: '#55524c', yellow: '#e0b02a', sodium: 'rgba(255,226,150,.85)', W: 500, D: 400, SHED: 34, MON: 8,
            DOCKS: [125, 250, 375], DOCK_W: 60, DOCK_H: 22 };
        const _whFront = (t) => t.mitre.find(e => e && !e.hidden && e.ny > 0.99);

        /** The shed: ribbed steel, rust streaks, the plinth, high windows; the docks and the personnel door on the front */
        function _whShed(d, l, t, H, L) {
            const r = seededRandom(4471), front = _whFront(t);
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, WH.steelHi); g.addColorStop(0.15, WH.steel); g.addColorStop(1, WH.steelLo); d.fillStyle = g; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(0,0,0,.28)'; for (let x = 0; x < L; x += 2.6) d.fillRect(x, 2, 0.8, H - 6);
            d.fillStyle = 'rgba(255,255,255,.05)'; for (let x = 1.2; x < L; x += 2.6) d.fillRect(x, 2, 0.4, H - 6);
            for (let i = 0; i < L / 9; i++) { const x = r() * L, y = 2 + r() * 8, h = 4 + r() * 12; d.fillStyle = `rgba(130,74,40,${0.08 + r() * 0.12})`; d.fillRect(x, y, 0.8 + r() * 1.6, h); }   // rust
            d.fillStyle = '#1c1d20'; d.fillRect(0, 0, L, 2); d.fillStyle = 'rgba(255,255,255,.1)'; d.fillRect(0, 0, L, 0.4);
            d.fillStyle = WH.conc; d.fillRect(0, H - 4, L, 4); d.fillStyle = 'rgba(0,0,0,.25)'; d.fillRect(0, H - 4, L, 0.5);
            for (const e of t.mitre) {
                if (!e || e.hidden) continue;
                for (let x = e.u0 + 12, k = 0; x < e.u0 + e.L - 14; x += 24, k++) {                   // the high windows
                    d.fillStyle = '#121416'; d.fillRect(x - 0.6, 3.6, 13.2, 4.2); d.fillStyle = '#1e2a30'; d.fillRect(x, 4.2, 12, 3);
                    d.fillStyle = 'rgba(190,210,220,.16)'; d.fillRect(x, 4.2, 12, 1); d.fillStyle = '#121416'; for (const m of [4, 8]) d.fillRect(x + m - 0.2, 4.2, 0.4, 3);
                    if ((k * 5 + Math.round(e.u0)) % 3) { l.fillStyle = WH.sodium; l.fillRect(x, 4.2, 12, 3); l.fillStyle = '#000'; for (const m of [4, 8]) l.fillRect(x + m - 0.2, 4.2, 0.4, 3); }
                }
            }
            if (!front) return;
            const X = (px) => front.u0 + px, name = (t.name || 'Warehouse').toUpperCase().split('').join(' ');
            d.save(); d.font = 'bold 4px Montserrat, Helvetica, sans-serif'; d.textAlign = 'center'; d.textBaseline = 'middle'; d.fillStyle = 'rgba(230,226,214,.32)'; d.fillText(name, X(250), 10.6); d.restore();
            WH.DOCKS.forEach((dx, i) => {
                const x0 = X(dx) - WH.DOCK_W / 2, w = WH.DOCK_W, y0 = H - 4 - WH.DOCK_H, y1 = H - 4;
                d.fillStyle = '#16171a'; d.fillRect(x0 - 2, y0 - 2, w + 4, y1 - y0 + 2);
                const dg = d.createLinearGradient(0, y0, 0, y1); dg.addColorStop(0, '#70757c'); dg.addColorStop(1, '#4c5056'); d.fillStyle = dg; d.fillRect(x0, y0, w, y1 - y0);
                d.fillStyle = 'rgba(16,16,18,.5)'; for (let y = y0 + 1.6; y < y1; y += 1.6) d.fillRect(x0, y, w, 0.35);
                d.fillStyle = '#121214'; d.fillRect(x0 - 3, y1 - 5, 2.4, 5); d.fillRect(x0 + w + 0.6, y1 - 5, 2.4, 5);   // the bumpers
                d.fillStyle = WH.yellow; for (let k = 0; k < 3; k++) { d.fillRect(x0 - 3, y1 - 5 + k * 1.8, 2.4, 0.8); d.fillRect(x0 + w + 0.6, y1 - 5 + k * 1.8, 2.4, 0.8); }
                d.fillStyle = WH.yellow; d.fillRect(X(dx) - 3, y0 - 6.2, 6, 3.4); d.fillStyle = '#16171a'; d.font = 'bold 3px Montserrat, sans-serif'; d.textAlign = 'center'; d.textBaseline = 'middle'; d.fillText(String(i + 1), X(dx), y0 - 4.4);
                for (const s of [-1, 1]) { const lx = X(dx) + s * (w / 2 - 4); d.fillStyle = '#2a2c30'; d.fillRect(lx - 1.4, y0 - 4.4, 2.8, 1.4); l.fillStyle = 'rgba(255,230,170,1)'; l.fillRect(lx - 1.4, y0 - 3.4, 2.8, 0.8); }
                l.fillStyle = 'rgba(255,214,140,.4)'; l.fillRect(x0, y1 - 0.8, w, 0.8);
            });
            const px = X(468);                                                                            // the personnel door
            d.fillStyle = '#2c3036'; d.fillRect(px - 5, H - 4 - 15, 10, 15); d.strokeStyle = '#16171a'; d.lineWidth = 0.5; d.strokeRect(px - 5, H - 4 - 15, 10, 15);
            d.fillStyle = '#1e2a30'; d.fillRect(px - 2, H - 4 - 13, 4, 4); l.fillStyle = WH.sodium; l.fillRect(px - 2, H - 4 - 13, 4, 4);
            d.fillStyle = '#c9ccd2'; d.fillRect(px + 2.6, H - 4 - 7, 1.4, 0.6);
            d.fillStyle = '#2a2c30'; d.fillRect(px - 2, H - 4 - 17.6, 4, 1.2); l.fillStyle = 'rgba(255,230,170,1)'; l.fillRect(px - 2, H - 4 - 16.6, 4, 0.6);
        }

        /** The monitor: a ribbon of clerestory glass, lit from inside */
        function _whMonitor(d, l, t, H, L) {
            d.fillStyle = WH.steel; d.fillRect(0, 0, L, H);
            d.fillStyle = '#1c1d20'; d.fillRect(0, 0, L, 1.4);
            d.fillStyle = '#1e2a30'; d.fillRect(0, 2, L, H - 3); d.fillStyle = 'rgba(190,210,220,.18)'; d.fillRect(0, 2, L, 1.4);
            l.fillStyle = WH.sodium; l.fillRect(0, 2, L, H - 3);
            d.fillStyle = '#121416'; l.fillStyle = '#000'; for (let x = 0; x < L; x += 6) { d.fillRect(x - 0.3, 2, 0.6, H - 3); l.fillRect(x - 0.3, 2, 0.6, H - 3); }
            d.fillStyle = WH.steelLo; d.fillRect(0, H - 1, L, 1);
        }

        /** The dock canopy's edge: steel with a yellow lip */
        function _whCanopy(d, l, t, H, L) { d.fillStyle = '#2c2e33'; d.fillRect(0, 0, L, H); d.fillStyle = WH.yellow; d.fillRect(0, H - 0.4, L, 0.4); }

        // ── roofs ──

        function _whShedRoof(c, glow, t) {
            const [x, y] = t.box, r = seededRandom(99);
            const sky = []; for (let i = 0; i < 4; i++) for (const sy of [40, 300]) sky.push([x + 50 + i * 110, y + sy, 60, 36]);
            if (glow) { for (const [sx, sy, w, h] of sky) { c.fillStyle = 'rgba(255,226,150,.28)'; c.fillRect(sx + 2, sy + 2, w - 4, h - 4); } return; }
            c.fillStyle = '#34363a'; c.fillRect(x, y, 500, 400);
            c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath(); for (let xx = x + 8; xx < x + 500; xx += 8) { c.moveTo(xx, y); c.lineTo(xx, y + 400); } c.stroke();
            c.strokeStyle = 'rgba(255,255,255,.04)'; c.beginPath(); for (let xx = x + 11; xx < x + 500; xx += 8) { c.moveTo(xx, y); c.lineTo(xx, y + 400); } c.stroke();
            for (let i = 0; i < 26; i++) { const rx = x + r() * 480, ry = y + r() * 380; const g = c.createRadialGradient(rx, ry, 0, rx, ry, 10 + r() * 18); g.addColorStop(0, 'rgba(130,74,40,.3)'); g.addColorStop(1, 'rgba(130,74,40,0)'); c.fillStyle = g; c.fillRect(rx - 30, ry - 30, 60, 60); }
            for (const [sx, sy, w, h] of sky) { c.fillStyle = '#1c1d20'; c.fillRect(sx - 1.5, sy - 1.5, w + 3, h + 3); c.fillStyle = 'rgba(200,214,220,.35)'; c.fillRect(sx, sy, w, h); c.strokeStyle = 'rgba(30,32,36,.6)'; c.lineWidth = 0.8; c.beginPath(); for (let k = 1; k < 4; k++) { c.moveTo(sx + k * w / 4, sy); c.lineTo(sx + k * w / 4, sy + h); } c.stroke(); }
            c.strokeStyle = '#1c1d20'; c.lineWidth = 6; c.strokeRect(x + 3, y + 3, 494, 394);
            for (const [px, py] of [[x + 30, y + 120], [x + 440, y + 120], [x + 30, y + 250]]) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px + 4, py + 4, 34, 26); c.fillStyle = '#6a6e74'; c.fillRect(px, py, 34, 26); c.fillStyle = '#3a3e44'; c.beginPath(); c.arc(px + 17, py + 13, 9, 0, Math.PI * 2); c.fill(); }
        }

        function _whMonitorRoof(c, glow, t) {
            if (glow) return;
            const [x0, y0, x1, y1] = t.box;
            c.fillStyle = '#3e4044'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            c.fillStyle = '#2c2e32'; c.fillRect(x0, (y0 + y1) / 2 - 1, x1 - x0, 2);                  // the ridge
            c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath(); for (let xx = x0 + 8; xx < x1; xx += 8) { c.moveTo(xx, y0); c.lineTo(xx, y1); } c.stroke();
            c.strokeStyle = '#1c1d20'; c.lineWidth = 3; c.strokeRect(x0 + 1.5, y0 + 1.5, x1 - x0 - 3, y1 - y0 - 3);
        }

        function _whCanopyRoof(c, glow, t) {
            if (glow) return;
            const [x0, y0, x1, y1] = t.box;
            c.fillStyle = '#3a3c42'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.beginPath(); for (let xx = x0 + 10; xx < x1; xx += 10) { c.moveTo(xx, y0); c.lineTo(xx, y1); } c.stroke();
            c.strokeStyle = WH.yellow; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0, y1 - 0.6); c.lineTo(x1, y1 - 0.6); c.stroke();
        }

        class WarehouseHall extends TieredBuilding {
            /** The dock apron in front: concrete, a yellow guide line to each dock, wheel chocks */
            drawBase(c) {
                super.drawBase(c);
                const N = this.facing === 'N';
                const s = LandmarkKit.sprite(this, 'wh_apron', this.x - 10, this.y + (N ? -50 : WH.D), 520, 50, 1, p => {
                    const x = this.x, y = N ? this.y - 46 : this.y + WH.D, X = (px) => N ? x + WH.W - px : x + px;
                    p.fillStyle = 'rgba(70,68,64,.92)'; p.fillRect(x, y, WH.W, 46);
                    p.strokeStyle = 'rgba(0,0,0,.3)'; p.lineWidth = 1; p.beginPath(); for (let xx = 50; xx < WH.W; xx += 50) { p.moveTo(x + xx, y); p.lineTo(x + xx, y + 46); } p.stroke();
                    for (const dx of WH.DOCKS) {
                        p.strokeStyle = 'rgba(224,176,42,.75)'; p.lineWidth = 2; p.beginPath(); p.moveTo(X(dx) - 34, y + (N ? 0 : 46)); p.lineTo(X(dx) - 34, y + (N ? 46 : 0)); p.moveTo(X(dx) + 34, y + (N ? 0 : 46)); p.lineTo(X(dx) + 34, y + (N ? 46 : 0)); p.stroke();
                        p.fillStyle = WH.yellow; p.fillRect(X(dx) - 26, y + (N ? 34 : 6), 8, 6); p.fillRect(X(dx) + 18, y + (N ? 34 : 6), 8, 6);
                    }
                });
                LandmarkKit.drawSprite(c, s, 1);
            }
        }
        TierKit.profile(WarehouseHall);

        /** The map's warehouse: x, y its corner; the docks on its front (south, or north with config.facing 'N'). */
        function createWarehouseHall(x, y, config = {}) {
            const ledge = (z) => ({ z, out: 2, th: 2, top: '#4a4c52', band: [30, 31, 34], lip: 'rgba(255,255,255,.18)' }), name = config.label || 'Warehouse';
            return new WarehouseHall({
                id: 'warehouse', x, y, label: name, type: 'warehouse', hero: 1.5, plan: { W: WH.W, D: WH.D },
                roofColor: '#282828', roofLightColor: '#323232', wallColor: '#202020', wallLightColor: '#2a2a2a', accentColor: '#666666',
                windowColor: '#0a0a0a', windowLitColor: '#ccccaa', windowFrameColor: '#111111', balconies: [], roofProps: [], sign: config.sign || null,
                tiers: [
                    { id: 'shed', name, rect: [0, 0, WH.W, WH.D], z0: 0, z1: WH.SHED, S: 2, fill: WH.steel, paint: _whShed, shade: [12, 12, 14],
                      ledges: [ledge(WH.SHED)], roofRes: 1, roofGlow: true, roof: _whShedRoof },
                    { id: 'monitor', on: 'shed', solid: false, rect: [60, 140, 380, 120], z0: WH.SHED, z1: WH.SHED + WH.MON, S: 2, fill: WH.steel, paint: _whMonitor, shade: [12, 12, 14],
                      ledges: [ledge(WH.SHED + WH.MON)], roofRes: 1, roofGlow: true, roof: _whMonitorRoof },
                    // (a px off the wall: a tier back to back with a wall hides it below its top, _tkGeo)
                    { id: 'canopy', solid: false, rect: [40, WH.D + 1, 420, 26], z0: WH.DOCK_H + 7, z1: WH.DOCK_H + 8.5, S: 4, fill: '#2c2e33', paint: _whCanopy, shade: [12, 12, 14],
                      roofRes: 1, roof: _whCanopyRoof }
                ],
                ...config
            });
        }
