        // GameEngine — the crew's van: the cabin the chapter opens in (van_interior), and the van
        // itself for the street (drawVanExterior, drawn by a scene prop). Scene-only: painted, no props.
        //   van_interior  top-down with the roof off, nose up: the cab, the partition, two benches
        //                 of violet webbing, the gun rack, the rear doors; the road runs by beneath
        // Floor: drawVanInterior (draw.js, under the lighting). Light: drawVanGlow (world-state.js).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        const VAN = {
            W: 400, H: 820,
            BODY: { x: 104, y: 70, w: 192, h: 670 },          // the van's outline
            CABIN: { x: 116, y: 196, w: 168, h: 520 },         // the cargo bay the crew rides in
            PARTITION_Y: 186,
            BENCH: { left: 116, right: 250, w: 34 },
            // Where everyone sits (x, y, facing) — 949 across from 747, the novel's order
            SEATS: {
                '949':    { x: 136, y: 404, a: 0 },       'Yenna':    { x: 136, y: 470, a: 0 },      'Sabrina': { x: 136, y: 536, a: 0 },
                '747':    { x: 264, y: 404, a: Math.PI }, 'Max':      { x: 264, y: 470, a: Math.PI },
                'Victoria': { x: 264, y: 536, a: Math.PI }, 'Josh':   { x: 264, y: 602, a: Math.PI }
            },
            NEON: ['255, 60, 170', '80, 220, 255', '232, 194, 122', '164, 105, 255']
        };

        /** The van on the street (a scene prop): matte violet-black, gold pinstripe, rear doors that open (v.doors 0..1). */
        function drawVanExterior(ctx, v) {
            const L = 120, W = 54, doors = v.doors || 0;
            ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle || 0);
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(-L / 2 + 4, -W / 2 + 5, L, W, 8); ctx.fill();   // shadow
            ctx.fillStyle = '#17111f'; ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 8); ctx.fill();                  // body
            ctx.fillStyle = '#1f1729'; ctx.beginPath(); ctx.roundRect(-L / 2 + 6, -W / 2 + 5, L - 30, W - 10, 5); ctx.fill();   // roof panel
            ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
            for (let x = -L / 2 + 14; x < L / 2 - 26; x += 12) { ctx.beginPath(); ctx.moveTo(x, -W / 2 + 7); ctx.lineTo(x, W / 2 - 7); ctx.stroke(); }   // roof ribs
            ctx.strokeStyle = '#3a2f46'; ctx.lineWidth = 2; ctx.strokeRect(-L / 2 + 16, -W / 2 + 10, L - 50, W - 20);      // roof rack
            ctx.fillStyle = '#0c0a12'; ctx.beginPath(); ctx.roundRect(L / 2 - 24, -W / 2 + 5, 17, W - 10, 3); ctx.fill();    // windshield
            ctx.fillStyle = 'rgba(160,140,220,0.18)'; ctx.fillRect(L / 2 - 21, -W / 2 + 8, 3, W - 16);
            ctx.strokeStyle = 'rgba(232,194,122,0.75)'; ctx.lineWidth = 1;                                                   // gold pinstripe
            ctx.beginPath(); ctx.roundRect(-L / 2 + 2, -W / 2 + 2, L - 4, W - 4, 7); ctx.stroke();
            ctx.fillStyle = '#fff6e0'; ctx.fillRect(L / 2 - 2, -W / 2 + 4, 2, 9); ctx.fillRect(L / 2 - 2, W / 2 - 13, 2, 9);   // headlights
            ctx.fillStyle = '#ff2a4a'; ctx.fillRect(-L / 2, -W / 2 + 4, 2, 7); ctx.fillRect(-L / 2, W / 2 - 11, 2, 7);       // tail lights
            // The rear doors swing out from the back corners
            for (const s of [-1, 1]) {
                ctx.save(); ctx.translate(-L / 2, s * W / 2); ctx.rotate(s * doors * 1.7);
                ctx.fillStyle = '#1d1526'; ctx.fillRect(-3, s > 0 ? -W / 2 : 0, 3, W / 2);
                ctx.fillStyle = 'rgba(232,194,122,0.6)'; ctx.fillRect(-3, s > 0 ? -W / 2 + 2 : W / 2 - 4, 3, 2);
                ctx.restore();
            }
            if (doors > 0.05) {                                                                                              // the dim red cabin inside
                ctx.fillStyle = `rgba(120,20,40,${0.5 * doors})`; ctx.fillRect(-L / 2 + 1, -W / 2 + 6, 10, W - 12);
            }
            ctx.restore();
        }

        engineMixin({
            /** Under the lighting: the road going by, then the van's cabin (painted once). */
            drawVanInterior(ctx) {
                const t = _gameTimeSec, moving = this.vanMoving !== false;
                // The road beneath: asphalt, lane dashes and streetlight pools sliding back (the van drives up)
                ctx.fillStyle = '#0b0a10'; ctx.fillRect(0, 0, VAN.W, VAN.H);
                const run = moving ? (t * 520) % 160 : 0;
                ctx.fillStyle = 'rgba(232,220,200,0.22)';
                for (let y = -160 + run; y < VAN.H; y += 160) { ctx.fillRect(40, y, 5, 70); ctx.fillRect(355, y, 5, 70); }
                const pool = moving ? (t * 520) % 900 : 300;
                for (let y = -300 + pool; y < VAN.H + 300; y += 900) {
                    const g = ctx.createRadialGradient(60, y, 0, 60, y, 180); g.addColorStop(0, 'rgba(255,200,140,0.12)'); g.addColorStop(1, 'rgba(255,200,140,0)');
                    ctx.fillStyle = g; ctx.fillRect(0, y - 180, 260, 360);
                }
                if (!this._vanCabin) this._vanCabin = this._paintVanCabin();
                ctx.drawImage(this._vanCabin, 0, 0);
            },

            _paintVanCabin() {
                const cv = document.createElement('canvas'); cv.width = VAN.W; cv.height = VAN.H;
                const c = cv.getContext('2d'), B = VAN.BODY, C = VAN.CABIN;
                // The body, its shadow on the road, the gold pinstripe
                c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.roundRect(B.x + 8, B.y + 10, B.w, B.h, 26); c.fill();
                c.fillStyle = '#17111f'; c.beginPath(); c.roundRect(B.x, B.y, B.w, B.h, 26); c.fill();
                c.strokeStyle = 'rgba(232,194,122,0.7)'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(B.x + 4, B.y + 4, B.w - 8, B.h - 8, 22); c.stroke();
                // The cab: dash, windshield, two seats (the driver stays a shape in the dark)
                c.fillStyle = '#0c0a12'; c.beginPath(); c.roundRect(B.x + 14, B.y + 10, B.w - 28, 30, 10); c.fill();
                c.fillStyle = 'rgba(140,120,210,0.16)'; c.fillRect(B.x + 20, B.y + 14, B.w - 40, 6);
                c.fillStyle = '#211a2b'; c.fillRect(B.x + 16, B.y + 42, B.w - 32, 18);                                  // dash
                c.fillStyle = 'rgba(80,220,255,0.5)'; c.fillRect(B.x + 40, B.y + 48, 22, 5);                              // a readout
                for (const sx of [B.x + 34, B.x + B.w - 74]) {                                                             // cab seats
                    c.fillStyle = '#2a1f33'; c.beginPath(); c.roundRect(sx, B.y + 70, 40, 44, 8); c.fill();
                    c.fillStyle = '#1c1524'; c.beginPath(); c.roundRect(sx + 3, B.y + 100, 34, 14, 5); c.fill();
                }
                c.fillStyle = '#0d0a12'; c.beginPath(); c.arc(B.x + B.w - 54, B.y + 90, 12, 0, Math.PI * 2); c.fill();     // the driver
                // The partition, with its slot
                c.fillStyle = '#261d31'; c.fillRect(B.x + 8, VAN.PARTITION_Y - 8, B.w - 16, 12);
                c.fillStyle = '#07050b'; c.fillRect(B.x + B.w / 2 - 22, VAN.PARTITION_Y - 6, 44, 6);
                c.strokeStyle = 'rgba(232,194,122,0.4)'; c.lineWidth = 1; c.strokeRect(B.x + B.w / 2 - 22.5, VAN.PARTITION_Y - 6.5, 45, 7);
                // The cargo floor: ribbed steel, tie-down rails
                const fl = c.createLinearGradient(C.x, 0, C.x + C.w, 0);
                fl.addColorStop(0, '#16121c'); fl.addColorStop(0.5, '#221c2a'); fl.addColorStop(1, '#16121c');
                c.fillStyle = fl; c.fillRect(C.x, C.y, C.w, C.h);
                for (let y = C.y + 6; y < C.y + C.h; y += 10) {
                    c.fillStyle = 'rgba(255,255,255,0.035)'; c.fillRect(C.x + 36, y, C.w - 72, 2);
                    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(C.x + 36, y + 2, C.w - 72, 1);
                }
                for (const x of [C.x + 40, C.x + C.w - 42]) {
                    c.fillStyle = '#2e2638'; c.fillRect(x, C.y + 10, 2, C.h - 20);
                    for (let y = C.y + 20; y < C.y + C.h - 10; y += 40) { c.fillStyle = '#4a3f58'; c.beginPath(); c.arc(x + 1, y, 2.2, 0, Math.PI * 2); c.fill(); }
                }
                // The benches: dark leather pads, violet webbing straps behind the seats
                for (const [bx, side] of [[VAN.BENCH.left, 1], [VAN.BENCH.right, -1]]) {
                    c.fillStyle = '#0f0b14'; c.fillRect(bx, C.y + 150, VAN.BENCH.w, C.h - 180);
                    for (let y = C.y + 154; y < C.y + C.h - 34; y += 33) {
                        c.fillStyle = '#2a1d30'; c.beginPath(); c.roundRect(bx + 3, y, VAN.BENCH.w - 6, 30, 5); c.fill();
                        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(bx + 6, y + 3, VAN.BENCH.w - 12, 3);
                    }
                    const wx = side > 0 ? bx + 2 : bx + VAN.BENCH.w - 4;
                    c.strokeStyle = 'rgba(120,70,190,0.75)'; c.lineWidth = 2.5;
                    for (let y = C.y + 160; y < C.y + C.h - 40; y += 22) { c.beginPath(); c.moveTo(wx, y); c.lineTo(wx, y + 18); c.stroke(); }
                    c.strokeStyle = 'rgba(120,70,190,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(wx, C.y + 158); c.lineTo(wx, C.y + C.h - 32); c.stroke();
                }
                // Up front: the gun rack (left) and the first-aid case (right)
                c.fillStyle = '#0f0b14'; c.fillRect(C.x + 4, C.y + 12, 34, 120);
                for (let i = 0; i < 4; i++) {
                    const y = C.y + 22 + i * 28;
                    c.fillStyle = '#2b2533'; c.fillRect(C.x + 8, y, 26, 6); c.fillStyle = '#45394f'; c.fillRect(C.x + 8, y + 1, 10, 4);
                    c.fillStyle = 'rgba(232,194,122,0.5)'; c.fillRect(C.x + 30, y + 2, 3, 2);
                }
                c.fillStyle = '#e8e2ee'; c.beginPath(); c.roundRect(C.x + C.w - 34, C.y + 30, 26, 20, 3); c.fill();
                c.fillStyle = '#c0304a'; c.fillRect(C.x + C.w - 24, C.y + 34, 6, 12); c.fillRect(C.x + C.w - 27, C.y + 37, 12, 6);
                c.fillStyle = '#1a1422'; c.beginPath(); c.roundRect(C.x + C.w - 36, C.y + 70, 30, 56, 4); c.fill();           // an ammo locker
                c.strokeStyle = 'rgba(232,194,122,0.35)'; c.strokeRect(C.x + C.w - 35.5, C.y + 70.5, 29, 55);
                // The rear doors, with their two small windows
                const ry = C.y + C.h;
                c.fillStyle = '#1d1526'; c.fillRect(B.x + 8, ry, B.w - 16, B.y + B.h - ry - 8);
                c.fillStyle = '#07050b'; c.fillRect(B.x + B.w / 2 - 1, ry, 2, B.y + B.h - ry - 8);
                for (const wx of [B.x + 30, B.x + B.w / 2 + 12]) { c.fillStyle = '#0a0812'; c.fillRect(wx, ry + 6, 50, 10); c.fillStyle = 'rgba(160,140,230,0.18)'; c.fillRect(wx + 2, ry + 7, 46, 3); }
                c.fillStyle = 'rgba(232,194,122,0.6)'; c.fillRect(B.x + B.w / 2 - 12, ry + 18, 8, 2); c.fillRect(B.x + B.w / 2 + 4, ry + 18, 8, 2);   // handles
                return cv;
            },

            /** After the darkness: the dome light, the strip light, passing neon sweeping through, rain on the rear windows. */
            drawVanGlow(ctx) {
                const t = _gameTimeSec, C = VAN.CABIN, moving = this.vanMoving !== false;
                const flick = 0.92 + Math.sin(t * 13) * 0.03 + (Math.sin(t * 2.3) > 0.97 ? -0.25 : 0);
                glowA(ctx, 200, 440, 130, '190, 30, 60', 0.15 * flick);                                  // the red dome light
                glowA(ctx, 200, 440, 18, '255, 120, 130', 0.4 * flick);
                const strip = ctx.createLinearGradient(0, C.y, 0, C.y + C.h);
                strip.addColorStop(0, 'rgba(164,105,255,0)'); strip.addColorStop(0.5, 'rgba(164,105,255,0.1)'); strip.addColorStop(1, 'rgba(164,105,255,0)');
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = strip; ctx.fillRect(196, C.y, 8, C.h);                                   // the violet strip overhead
                if (moving) {                                                                            // street neon, sliding back through the bay
                    for (let i = 0; i < 3; i++) {
                        const period = 3.4 + i * 1.3, k = ((t + i * 1.7) % period) / period, y = C.y - 120 + k * (C.h + 240);
                        const col = VAN.NEON[(Math.floor((t + i * 1.7) / period) + i) % VAN.NEON.length];
                        const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
                        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},0.13)`); g.addColorStop(1, `rgba(${col},0)`);
                        ctx.fillStyle = g; ctx.fillRect(VAN.BODY.x, y - 60, VAN.BODY.w, 120);
                    }
                }
                ctx.restore();
                // Rain running down the rear windows
                const ry = C.y + C.h + 6;
                ctx.strokeStyle = 'rgba(200,190,255,0.35)'; ctx.lineWidth = 0.6;
                for (let i = 0; i < 10; i++) {
                    const x = VAN.BODY.x + 32 + ((i * 37) % 130) + (i > 4 ? 12 : 0), k = ((t * 0.6 + i * 0.29) % 1);
                    ctx.beginPath(); ctx.moveTo(x, ry + k * 8); ctx.lineTo(x + 0.6, ry + k * 8 + 2.5); ctx.stroke();
                }
            },
        });
