        // GameEngine — the Keeper's hill and parlor (the prologue's fireside). Scene-only places:
        // everything is painted here, with no props to bump into.
        //   keepers_hill   a lone hill above a sea of clouds, deep green with pink flowers, the house at the top
        //   keepers_parlor checkerboard tiles, red and burgundy seats, the fire, the window above it
        // Floors: drawKeeperInterior (draw.js, under the lighting). Light: drawKeeperGlow (world-state.js).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        const KEEPER = {
            HILL: { w: 1800, h: 2800, house: { x: 900, y: 560 } },
            // The island's rim, clockwise from the top (x, y)
            ISLAND: [[900, 250], [1120, 280], [1290, 380], [1360, 560], [1330, 780], [1260, 980], [1240, 1250], [1230, 1550], [1200, 1850], [1150, 2150], [1080, 2380], [960, 2500],
                     [840, 2500], [720, 2390], [650, 2160], [600, 1860], [570, 1560], [560, 1260], [540, 980], [470, 780], [440, 560], [510, 380], [680, 280]],
            PATH: [[900, 2470], [860, 2280], [960, 2080], [850, 1880], [955, 1680], [865, 1470], [935, 1260], [875, 1060], [905, 880], [900, 740]],
            PARLOR: { w: 900, h: 700, fire: { x: 450, y: 62 }, keeper: { x: 450, y: 262 }, traveler: { x: 648, y: 306 } }
        };

        engineMixin({
            /** Under the lighting: the painted place, plus what moves in it (clouds, flowers, the floating gable). */
            drawKeeperInterior(ctx) {
                const id = this.activeMap.id;
                if (id === 'keepers_hill') {
                    if (!this._keeperHill) { this._keeperHill = this._paintKeeperHill(); this._keeperHouse = this._paintKeeperHouse(); }
                    ctx.drawImage(this._keeperHill, 0, 0, KEEPER.HILL.w, KEEPER.HILL.h);
                    this._drawHillLife(ctx);
                    ctx.drawImage(this._keeperHouse, 540, 320);
                    this._drawFloatingGable(ctx);
                } else if (id === 'keepers_parlor') {
                    if (!this._keeperParlor) this._keeperParlor = this._paintKeeperParlor();
                    ctx.drawImage(this._keeperParlor, 0, 0);
                }
            },

            /** The visible world rect (for drawing only what's on screen). */
            _keeperView(pad = 80) {
                const z = this.camera.zoom || 1, hw = this.canvas.width / 2 / z + pad, hh = this.canvas.height / 2 / z + pad;
                return { x0: this.camera.x - hw, x1: this.camera.x + hw, y0: this.camera.y - hh, y1: this.camera.y + hh };
            },

            _paintKeeperHill() {
                const W = KEEPER.HILL.w, H = KEEPER.HILL.h, k = 0.5;                 // painted at half size, drawn at full
                const cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k;
                const c = cv.getContext('2d'), r = seededRandom(6125);
                c.scale(k, k);
                // The sea of clouds far below: deep violet, rolling bands of lighter mist
                const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#140a26'); sky.addColorStop(0.5, '#1c0f33'); sky.addColorStop(1, '#241238'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
                for (let i = 0; i < 260; i++) {
                    const x = r() * W, y = r() * H, rr = 60 + r() * 180, a = 0.04 + r() * 0.07, pink = r() < 0.3;
                    const g = c.createRadialGradient(x, y, 0, x, y, rr);
                    g.addColorStop(0, pink ? `rgba(220,140,210,${a})` : `rgba(170,150,230,${a})`); g.addColorStop(1, 'rgba(120,90,180,0)');
                    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rr * 1.6, rr, (r() - 0.5) * 0.4, 0, Math.PI * 2); c.fill();
                }
                // The island: a drop shadow onto the clouds, the cliff rim, then the grass
                const island = () => { c.beginPath(); KEEPER.ISLAND.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };
                c.save(); c.translate(26, 60); c.filter = 'blur(30px)'; island(); c.fillStyle = 'rgba(6,2,12,0.75)'; c.fill(); c.restore();
                island(); c.fillStyle = '#1e1a1c'; c.fill();                                       // the rock lip
                c.save(); island(); c.clip();
                c.save(); c.translate(0, -14); island(); c.fillStyle = '#1b4a26'; c.fill(); c.restore();
                // Grass: a deep green, darker in the hollows, lighter where the moon catches the slope
                for (let i = 0; i < 900; i++) {
                    const x = 420 + r() * 960, y = 240 + r() * 2280, rr = 20 + r() * 70, v = r();
                    c.fillStyle = v < 0.5 ? `rgba(10,38,18,${0.2 + r() * 0.25})` : `rgba(60,120,62,${0.1 + r() * 0.14})`;
                    c.beginPath(); c.ellipse(x, y, rr * 1.4, rr, r() * 3, 0, Math.PI * 2); c.fill();
                }
                c.strokeStyle = 'rgba(90,160,86,0.28)'; c.lineWidth = 1.2;                                // blades
                for (let i = 0; i < 9000; i++) { const x = 420 + r() * 960, y = 240 + r() * 2280, a = -1.2 - r() * 0.7; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 9); c.stroke(); }
                // The path up: worn earth, flat stones set into it
                c.lineCap = 'round'; c.lineJoin = 'round';
                const path = () => { c.beginPath(); KEEPER.PATH.forEach(([x, y], i) => { if (!i) c.moveTo(x, y); else { const [px, py] = KEEPER.PATH[i - 1]; c.quadraticCurveTo(px, (py + y) / 2, (px + x) / 2, (py + y) / 2); } }); c.lineTo(900, 740); };
                c.strokeStyle = '#2a2016'; c.lineWidth = 44; path(); c.stroke();
                c.strokeStyle = '#4a3a28'; c.lineWidth = 32; path(); c.stroke();
                for (let i = 0; i < KEEPER.PATH.length - 1; i++) {
                    const [x0, y0] = KEEPER.PATH[i], [x1, y1] = KEEPER.PATH[i + 1];
                    for (let s = 0; s < 1; s += 0.14) { const x = x0 + (x1 - x0) * s + (r() - 0.5) * 16, y = y0 + (y1 - y0) * s; c.fillStyle = `rgb(${96 + r() * 20 | 0},${88 + r() * 16 | 0},${80 + r() * 14 | 0})`; c.beginPath(); c.ellipse(x, y, 9 + r() * 5, 6 + r() * 3, r() * 3, 0, Math.PI * 2); c.fill(); }
                }
                // The garden plateau round the house: a little lawn, a low stone wall, a gate
                c.fillStyle = 'rgba(30,70,36,0.35)'; c.beginPath(); c.ellipse(900, 600, 330, 250, 0, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#4a4450'; c.lineWidth = 10; c.setLineDash([14, 5]); c.beginPath(); c.ellipse(900, 610, 360, 280, 0, Math.PI * 0.56, Math.PI * 2.44); c.stroke(); c.setLineDash([]);
                c.fillStyle = '#5a5060'; c.fillRect(858, 880, 12, 22); c.fillRect(930, 880, 12, 22);                           // gateposts
                c.restore();
                // The cliff edge: a lighter rim where the grass breaks, rocks below it
                island(); c.strokeStyle = 'rgba(160,150,190,0.25)'; c.lineWidth = 3; c.stroke();
                for (let i = 0; i < KEEPER.ISLAND.length; i++) {
                    const [x0, y0] = KEEPER.ISLAND[i], [x1, y1] = KEEPER.ISLAND[(i + 1) % KEEPER.ISLAND.length];
                    for (let s = 0; s < 1; s += 0.2) { const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s + 10; c.fillStyle = `rgba(${40 + r() * 30 | 0},${36 + r() * 20 | 0},${50 + r() * 30 | 0},0.9)`; c.beginPath(); c.ellipse(x, y, 10 + r() * 14, 7 + r() * 8, r() * 3, 0, Math.PI * 2); c.fill(); }
                }
                return cv;
            },

            /** The house, from above: a country home made strange. Canvas origin = world (540, 320). */
            _paintKeeperHouse() {
                const cv = document.createElement('canvas'); cv.width = 720; cv.height = 560;
                const c = cv.getContext('2d'), r = seededRandom(747), O = { x: 540, y: 320 };
                c.translate(-O.x, -O.y);
                // Shadow on the lawn
                c.fillStyle = 'rgba(4,2,10,0.55)'; c.fillRect(708, 452, 450, 250);
                // Porch: boards, two posts, steps down to the path
                c.fillStyle = '#3a2a22'; c.fillRect(800, 668, 200, 70);
                c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; for (let x = 806; x < 1000; x += 10) { c.beginPath(); c.moveTo(x, 668); c.lineTo(x, 738); c.stroke(); }
                c.fillStyle = '#4a3a30'; c.fillRect(860, 738, 80, 10); c.fillRect(868, 748, 64, 10);
                c.fillStyle = '#e8dcc8'; c.fillRect(804, 726, 8, 8); c.fillRect(988, 726, 8, 8);
                // Main roof: plum shingles in rows, a ridge along the middle; hipped ends
                const roof = (x, y, w, h, ridgeY) => {
                    c.fillStyle = '#3a1a3a'; c.fillRect(x, y, w, h);
                    for (let yy = y; yy < y + h; yy += 9) {
                        const up = yy < ridgeY; c.fillStyle = up ? '#4a2448' : '#2e1430';
                        for (let xx = x + ((yy / 9) % 2) * 7; xx < x + w; xx += 14) { const v = r() * 12 | 0; c.fillStyle = up ? `rgb(${70 + v},${34 + v / 2},${68 + v})` : `rgb(${46 + v},${20 + v / 2},${48 + v})`; c.fillRect(xx, yy, 13, 8); }
                    }
                    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,220,255,0.10)'); g.addColorStop((ridgeY - y) / h, 'rgba(255,220,255,0.02)'); g.addColorStop((ridgeY - y) / h + 0.001, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
                    c.fillStyle = g; c.fillRect(x, y, w, h);
                    c.strokeStyle = '#1a0a1c'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
                };
                roof(690, 440, 440, 230, 555);
                // The ridge: dark caps carved with runes (they glow in the glow pass)
                c.fillStyle = '#231226'; c.fillRect(690, 549, 440, 12);
                // A dormer each side of the porch, a wing to the east with its own little roof
                roof(1060, 470, 110, 170, 555);
                for (const dx of [760, 980]) { c.fillStyle = '#2a1230'; c.fillRect(dx, 600, 60, 52); c.fillStyle = '#4a2448'; c.fillRect(dx + 4, 600, 52, 20); c.fillStyle = '#1a0a18'; c.fillRect(dx + 12, 626, 36, 22); }
                // The chimney, a little crooked, brick
                c.save(); c.translate(1046, 494); c.rotate(0.12); c.fillStyle = '#5a2e2a'; c.fillRect(-20, -26, 40, 50);
                c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; for (let y = -26; y < 24; y += 7) { c.beginPath(); c.moveTo(-20, y); c.lineTo(20, y); c.stroke(); }
                c.fillStyle = '#0a0406'; c.fillRect(-12, -18, 24, 24); c.restore();
                // Ivy up the walls and over the eaves, pale blossoms in it
                for (let i = 0; i < 70; i++) {
                    const side = r(), x = side < 0.5 ? 690 + r() * 30 : 1100 + r() * 30, y = 450 + r() * 210;
                    c.fillStyle = `rgba(${30 + r() * 20 | 0},${80 + r() * 40 | 0},${50 + r() * 20 | 0},0.85)`; c.beginPath(); c.ellipse(x, y, 5 + r() * 5, 3 + r() * 3, r() * 3, 0, Math.PI * 2); c.fill();
                }
                // A weathervane on the ridge: a crescent
                c.strokeStyle = '#c8b070'; c.lineWidth = 2; c.beginPath(); c.moveTo(930, 555); c.lineTo(930, 536); c.stroke();
                c.fillStyle = '#e8c27a'; c.beginPath(); c.arc(930, 530, 8, 0.6, Math.PI * 2 - 0.6); c.arc(934, 530, 6, Math.PI * 2 - 0.8, 0.8, true); c.fill();
                return cv;
            },

            /** The west gable: floating an inch off the house, turning ever so slightly. */
            _drawFloatingGable(ctx) {
                const t = _gameTimeSec, bob = Math.sin(t * 0.8) * 3, tilt = Math.sin(t * 0.37) * 0.035;
                ctx.save();
                ctx.fillStyle = 'rgba(4,2,10,0.6)'; ctx.fillRect(594, 488, 110, 146);                   // its shadow, where it should sit
                ctx.translate(626, 522 + bob); ctx.rotate(-0.07 + tilt);                                 // lifted clear of the house, a little askew
                ctx.fillStyle = '#3a1a3a'; ctx.fillRect(-60, -70, 110, 140);
                for (let y = -70; y < 70; y += 9) for (let x = -60 + ((y / 9 + 8) % 2) * 7; x < 50; x += 14) { ctx.fillStyle = y < 0 ? '#4e2a4c' : '#301632'; ctx.fillRect(x, y, 13, 8); }
                ctx.fillStyle = '#231226'; ctx.fillRect(-60, -6, 110, 12);
                ctx.strokeStyle = 'rgba(232,194,122,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-60, -70, 110, 140);
                ctx.restore();
                // Stones circling the house, slowly
                for (let i = 0; i < 5; i++) {
                    const a = t * 0.12 + i * 1.26, x = 900 + Math.cos(a) * 330, y = 560 + Math.sin(a) * 220, s = 6 + (i % 3) * 3;
                    ctx.fillStyle = 'rgba(4,2,10,0.4)'; ctx.beginPath(); ctx.ellipse(x + 8, y + 18, s, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#6a6278'; ctx.beginPath(); ctx.ellipse(x, y + Math.sin(t + i) * 3, s, s * 0.8, a, 0, Math.PI * 2); ctx.fill();
                }
            },

            /** What moves on the hill: the clouds drifting, flowers swaying (only what's on screen). */
            _drawHillLife(ctx) {
                const V = this._keeperView(), t = _gameTimeSec;
                // Clouds drifting past below the island's edges
                if (!this._keeperClouds) { const r = seededRandom(3); this._keeperClouds = Array.from({ length: 22 }, () => ({ x: r() * 1800, y: r() * 2800, s: 160 + r() * 260, v: 4 + r() * 10, pink: r() < 0.35 })); }
                ctx.save();
                for (const q of this._keeperClouds) {
                    const x = ((q.x + t * q.v) % 2200) - 200;
                    if (x < V.x0 - q.s || x > V.x1 + q.s || q.y < V.y0 - q.s || q.y > V.y1 + q.s) continue;
                    ctx.globalAlpha = 0.09; drawGlow(ctx, x, q.y, q.s, q.pink ? '230, 150, 215' : '180, 160, 240', 0);
                }
                ctx.restore();
                // Pink flowers across the field, nodding in the breeze
                if (!this._keeperFlowers) {
                    const r = seededRandom(19), F = [];
                    const inside = (x, y) => { let c = false; const P = KEEPER.ISLAND; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
                    const drifts = Array.from({ length: 34 }, () => ({ x: 460 + r() * 880, y: 280 + r() * 2200, R: 60 + r() * 130 }));
                    while (F.length < 1100) {
                        const d = drifts[r() * drifts.length | 0], a = r() * Math.PI * 2, q = Math.sqrt(r());
                        const loose = r() < 0.2, x = loose ? 440 + r() * 920 : d.x + Math.cos(a) * d.R * q, y = loose ? 260 + r() * 2240 : d.y + Math.sin(a) * d.R * q * 0.8;
                        if (!inside(x, y - 20)) continue;
                        if (x > 640 && x < 1180 && y > 400 && y < 760) continue;             // not on the house
                        if (y > 740 && Math.abs(x - this._pathX(y)) < 34) continue;                // not on the path
                        F.push({ x, y, s: 1.3 + r() * 1.3, ph: r() * 6, c: r() < 0.6 ? '#ff7fbf' : r() < 0.7 ? '#ffb6da' : '#f3e2ff', cl: 1 + (r() * 3 | 0) });
                    }
                    this._keeperFlowers = F;
                }
                for (const f of this._keeperFlowers) {
                    if (f.x < V.x0 || f.x > V.x1 || f.y < V.y0 || f.y > V.y1) continue;
                    const sway = Math.sin(t * 1.4 + f.ph + f.y * 0.004) * 1.6;
                    ctx.strokeStyle = '#2e5a30'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(f.x, f.y + 5); ctx.lineTo(f.x + sway, f.y); ctx.stroke();
                    for (let k = 0; k < f.cl; k++) {
                        const x = f.x + sway + (k - 1) * 3.2, y = f.y - (k % 2) * 2.4;
                        ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(x, y, f.s, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(x, y, f.s * 0.35, 0, Math.PI * 2); ctx.fill();
                    }
                }
            },

            _pathX(y) {
                const P = KEEPER.PATH;
                for (let i = 0; i < P.length - 1; i++) { const [x0, y0] = P[i], [x1, y1] = P[i + 1]; if (y <= y0 && y >= y1) return x0 + (x1 - x0) * (y0 - y) / (y0 - y1); }
                return 900;
            },

            _paintKeeperParlor() {
                const { w: W, h: H } = KEEPER.PARLOR;
                const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
                const c = cv.getContext('2d'), r = seededRandom(212), GOLD = '#e8c27a';
                // Checkerboard tiles, black and ivory, a soft sheen across them
                const T = 44;
                for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
                    const dark = ((x / T) + (y / T)) % 2 === 0, v = r() * 8 | 0;
                    c.fillStyle = dark ? `rgb(${16 + v},${13 + v},${18 + v})` : `rgb(${178 + v},${168 + v},${152 + v})`; c.fillRect(x, y, T, T);
                }
                c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
                for (let x = 0; x <= W; x += T) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y <= H; y += T) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
                const sheen = c.createLinearGradient(0, 0, W, H); sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)'); c.fillStyle = sheen; c.fillRect(0, 0, W, H);
                // The rug under the seats: burgundy, a gold border, a medallion
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(284, 164, 400, 330);
                c.fillStyle = '#4a0c1a'; c.fillRect(280, 160, 400, 330);
                c.strokeStyle = GOLD; c.lineWidth = 2; c.strokeRect(290, 170, 380, 310); c.lineWidth = 1; c.strokeRect(298, 178, 364, 294);
                c.strokeStyle = 'rgba(232,194,122,0.45)'; c.beginPath(); c.ellipse(480, 325, 90, 70, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(480, 325, 60, 46, 0, 0, Math.PI * 2); c.stroke();
                for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; c.beginPath(); c.moveTo(480 + Math.cos(a) * 60, 325 + Math.sin(a) * 46); c.lineTo(480 + Math.cos(a) * 90, 325 + Math.sin(a) * 70); c.stroke(); }
                // Walls: dark panelled wood, a band of wallpaper, a gold picture rail
                const wall = (x, y, w, h) => { c.fillStyle = '#1a0e10'; c.fillRect(x, y, w, h); c.fillStyle = '#2a1418'; c.fillRect(x + 3, y + 3, w - 6, h - 6); };
                wall(0, 0, W, 40); wall(0, H - 30, W, 30); wall(0, 0, 30, H); wall(W - 30, 0, 30, H);
                c.fillStyle = 'rgba(232,194,122,0.5)'; c.fillRect(30, 38, W - 60, 2); c.fillRect(28, 40, 2, H - 70); c.fillRect(W - 30, 40, 2, H - 70); c.fillRect(30, H - 32, W - 60, 2);
                // The window in the chimney breast, above the fire: the pink-violet sky (stars painted in the glow pass)
                c.fillStyle = '#3a2a36'; c.fillRect(356, 0, 188, 98);                                       // stone breast
                for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${90 + r() * 40 | 0},${76 + r() * 30 | 0},${90 + r() * 30 | 0},0.6)`; c.fillRect(356 + r() * 176, r() * 90, 10 + r() * 14, 7 + r() * 6); }
                const sk = c.createLinearGradient(0, 4, 0, 34); sk.addColorStop(0, '#5a2a6a'); sk.addColorStop(1, '#b0508a'); c.fillStyle = sk; c.fillRect(392, 4, 116, 30);
                c.strokeStyle = GOLD; c.lineWidth = 2; c.strokeRect(392, 4, 116, 30); c.beginPath(); c.moveTo(450, 4); c.lineTo(450, 34); c.stroke();
                // The mantle and the firebox
                c.fillStyle = '#5a4a44'; c.fillRect(366, 38, 168, 12);
                c.fillStyle = '#0c0606'; c.fillRect(398, 50, 104, 44);
                c.fillStyle = '#2a1a16'; c.fillRect(410, 80, 80, 8);                                          // the grate
                c.fillStyle = '#4a3a34'; c.fillRect(380, 94, 140, 16);                                        // the hearthstone
                // The Keeper's wingback: red velvet, facing the fire
                const K = KEEPER.PARLOR.keeper;
                c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(K.x - 34, K.y - 26, 74, 66);
                c.fillStyle = '#8a1424'; c.fillRect(K.x - 32, K.y - 30, 64, 60);
                c.fillStyle = '#6a0c1a'; c.fillRect(K.x - 36, K.y + 18, 72, 16);                                // the high back, behind her
                c.fillRect(K.x - 38, K.y - 30, 12, 54); c.fillRect(K.x + 26, K.y - 30, 12, 54);                // the wings/arms
                c.strokeStyle = 'rgba(232,194,122,0.35)'; c.lineWidth = 1; c.strokeRect(K.x - 32, K.y - 30, 64, 60);
                for (const [bx, by] of [[-18, -10], [0, -10], [18, -10], [-9, 6], [9, 6]]) { c.fillStyle = '#5a0a16'; c.beginPath(); c.arc(K.x + bx, K.y + by, 1.6, 0, Math.PI * 2); c.fill(); }
                // The Traveller's chesterfield, burgundy, a little off to her right, turned toward her and the fire
                const Tr = KEEPER.PARLOR.traveler;
                c.save(); c.translate(Tr.x, Tr.y); c.rotate(-0.45);
                c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(-34, -58, 74, 124);
                c.fillStyle = '#5a1020'; c.fillRect(-30, -60, 62, 120);
                c.fillStyle = '#420a18'; c.fillRect(22, -62, 16, 124); c.fillRect(-32, -66, 70, 12); c.fillRect(-32, 54, 70, 12);
                c.fillStyle = '#6a1628'; c.fillRect(-26, -54, 46, 52); c.fillRect(-26, 2, 46, 52);
                for (let y = -54; y < 56; y += 12) for (const x of [26, 32]) { c.fillStyle = '#2a0610'; c.beginPath(); c.arc(x, y, 1.3, 0, Math.PI * 2); c.fill(); }
                c.restore();
                // The side table between them: tea for two, a candle
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(563, 214, 22, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#3a2418'; c.beginPath(); c.arc(560, 210, 22, 0, Math.PI * 2); c.fill(); c.strokeStyle = GOLD; c.lineWidth = 1; c.stroke();
                for (const [x, y] of [[552, 204], [569, 216]]) { c.fillStyle = '#f0e8e0'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); c.fillStyle = '#7a4a2a'; c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI * 2); c.fill(); }
                c.fillStyle = '#e8dcc0'; c.fillRect(562, 198, 4, 4);
                // Bookshelves along the west wall, spines of every colour
                for (let y = 90; y < 560; y += 70) {
                    c.fillStyle = '#2a1810'; c.fillRect(32, y, 38, 64);
                    for (let x = 34; x < 68; x += 4 + (r() * 3 | 0)) { c.fillStyle = ['#6a1a24', '#2a3a5a', '#3a5a3a', '#6a5a2a', '#4a2a5a', '#8a6a3a'][r() * 6 | 0]; c.fillRect(34, y + 2 + (x - 34) * 1.8, 34, 1.6); }
                }
                // Trinkets from other realms: a brass orrery on a stand, a stack of old maps, a sleeping crystal
                c.fillStyle = '#2a1810'; c.beginPath(); c.arc(170, 600, 24, 0, Math.PI * 2); c.fill();
                c.strokeStyle = GOLD; c.lineWidth = 1; for (const rr of [8, 14, 20]) { c.beginPath(); c.arc(170, 600, rr, 0, Math.PI * 2); c.stroke(); }
                c.fillStyle = '#d9c9a0'; c.fillRect(760, 560, 60, 44); c.strokeStyle = 'rgba(80,60,40,0.6)'; c.strokeRect(760, 560, 60, 44); c.fillStyle = '#c9b890'; c.fillRect(766, 552, 52, 40);
                // A side window on the east wall (the cool draught comes from here)
                c.fillStyle = '#3a2a4a'; c.fillRect(W - 30, 210, 30, 180); c.fillStyle = '#6a3a7a'; c.fillRect(W - 24, 216, 18, 168);
                c.strokeStyle = GOLD; c.strokeRect(W - 24, 216, 18, 168); c.beginPath(); c.moveTo(W - 24, 300); c.lineTo(W - 6, 300); c.stroke();
                // Candles on the mantle and a tall stand by the shelves
                for (const [x, y] of [[374, 42], [526, 42], [96, 620]]) { c.fillStyle = '#efe4cc'; c.fillRect(x - 2, y - 2, 4, 6); }
                // The door, south, closed
                c.fillStyle = '#2a1a14'; c.fillRect(410, H - 30, 80, 30); c.fillStyle = GOLD; c.fillRect(478, H - 18, 3, 3);
                return cv;
            },

            /** An ember pops in the parlor fire: a burst of sparks and a surge of warmth (the scene calls this). */
            keeperEmberPop(n = 14) {
                const F = KEEPER.PARLOR.fire;
                this._keeperSurge = 1;
                const S = this._keeperSparks || (this._keeperSparks = []);
                for (let i = 0; i < n; i++) S.push({ x: F.x + (Math.random() - 0.5) * 50, y: F.y + 10, vx: (Math.random() - 0.5) * 2.6, vy: 0.6 + Math.random() * 2.4, life: 30 + Math.random() * 40 });
            },

            /** After the darkness: the glowing things. */
            drawKeeperGlow(ctx) {
                const id = this.activeMap.id, t = _gameTimeSec;
                const glow = (x, y, r, rgb, a) => { if (a <= 0.003) return; ctx.globalAlpha = Math.min(1, a); drawGlow(ctx, x, y, r, rgb, 0); };
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (id === 'keepers_hill') {
                    const V = this._keeperView(200);
                    // Portals breathing over the cloud sea, planets turning round the hill
                    const P = [[300, 700, 70, '190, 120, 255'], [1560, 1150, 90, '232, 194, 122'], [260, 1900, 60, '255, 120, 200'], [1520, 2350, 80, '160, 140, 255'], [1600, 380, 50, '255, 170, 220']];
                    for (const [x0, y0, R, rgb] of P) {
                        const x = x0 + Math.sin(t * 0.1 + y0) * 20, y = y0 + Math.cos(t * 0.13 + x0) * 14;
                        if (x < V.x0 || x > V.x1 || y < V.y0 || y > V.y1) continue;
                        const br = 0.75 + 0.25 * Math.sin(t * 0.9 + x0);
                        glow(x, y, R * 2.2, rgb, 0.18 * br);
                        ctx.globalAlpha = 0.7 * br; ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.55, Math.sin(t * 0.05 + x0) * 0.4, 0, Math.PI * 2); ctx.stroke();
                        ctx.globalAlpha = 0.35 * br; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, R * 0.8, R * 0.42, Math.sin(t * 0.05 + x0) * 0.4 + 0.2, t * 0.5, t * 0.5 + 4.5); ctx.stroke();
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    const PL = [[1450, 1600, 64, '#6a4ab0', '#c9a8ff', 0.05], [360, 1200, 40, '#b0506a', '#ffb0c8', 0.08], [1380, 520, 28, '#4a8a9a', '#a8f0ff', 0.11], [480, 2500, 52, '#8a6a3a', '#ffe0a0', 0.04]];
                    for (const [cx, cy, R, base, rim, sp] of PL) {
                        const a = t * sp, x = cx + Math.cos(a) * 40, y = cy + Math.sin(a) * 26;
                        if (x < V.x0 - R || x > V.x1 + R || y < V.y0 - R || y > V.y1 + R) continue;
                        ctx.globalAlpha = 0.9;
                        const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
                        g.addColorStop(0, rim); g.addColorStop(0.55, base); g.addColorStop(1, '#0a0614');
                        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
                        if (R > 50) { ctx.strokeStyle = 'rgba(232,210,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, R * 1.6, R * 0.35, -0.3, 0, Math.PI * 2); ctx.stroke(); }
                    }
                    ctx.globalCompositeOperation = 'lighter';
                    // The house: warm windows in the dormers, the porch lantern, the runes along the ridge, the blossoms
                    for (const dx of [760, 980]) glow(dx + 30, 637, 34, '255, 190, 120', 0.55 + 0.05 * Math.sin(t * 3 + dx));
                    for (const [x, y] of [[700, 600], [700, 520], [1130, 600], [1130, 520], [900, 668]]) glow(x, y, 46, '255, 180, 110', 0.22);
                    glow(900, 732, 60, '255, 200, 130', 0.5 + 0.06 * Math.sin(t * 7));
                    for (let i = 0; i < 12; i++) { const x = 710 + i * 36, a = 0.35 + 0.3 * Math.sin(t * 1.3 + i * 0.9); glow(x, 555, 9, '232, 194, 122', a); }
                    glow(640, 560, 80, '190, 140, 255', 0.22 + 0.06 * Math.sin(t * 0.8));        // light leaking from under the floating gable
                    const R = seededRandom(33);
                    for (let i = 0; i < 26; i++) { const side = R() < 0.5, x = side ? 690 + R() * 30 : 1100 + R() * 30, y = 450 + R() * 210; glow(x, y, 5, '230, 220, 255', 0.3 + 0.2 * Math.sin(t * 2 + i)); }
                    // Chimney smoke, faintly lit from below
                    for (let i = 0; i < 7; i++) { const ph = ((t * 0.12 + i / 7) % 1), x = 1046 + ph * 90 + Math.sin(t + i) * 8, y = 480 - ph * 160; glow(x, y, 14 + ph * 40, '200, 150, 230', 0.16 * (1 - ph)); }
                    // Fireflies over the field
                    for (let i = 0; i < 40; i++) {
                        const bx = 480 + ((i * 97) % 880), by = 300 + ((i * 241) % 2150), x = bx + Math.sin(t * 0.6 + i) * 30, y = by + Math.cos(t * 0.45 + i * 1.7) * 22;
                        if (x < V.x0 || x > V.x1 || y < V.y0 || y > V.y1) continue;
                        glow(x, y, 7, '220, 255, 170', 0.5 * Math.max(0, Math.sin(t * 1.7 + i * 2.1)));
                    }
                } else if (id === 'keepers_parlor') {
                    const F = KEEPER.PARLOR.fire, s = (this._keeperSurge || 0);
                    const flick = 0.82 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1) + 0.08 * Math.sin(t * 13.7);
                    // The fire's light on the tiles and the room, and a surge when an ember pops
                    glow(F.x, F.y + 30, 480, '255, 120, 50', (0.06 + 0.08 * s) * flick);
                    glow(F.x, F.y + 20, 150, '255, 150, 70', (0.14 + 0.2 * s) * flick);
                    // The flames themselves
                    for (let i = 0; i < 9; i++) {
                        const x = 414 + i * 9 + Math.sin(t * 5 + i) * 2, h = 9 + 7 * Math.abs(Math.sin(t * (3 + i * 0.4) + i));
                        ctx.globalAlpha = 0.5; const g = ctx.createRadialGradient(x, 84 - h * 0.5, 0.5, x, 84 - h * 0.5, h);
                        g.addColorStop(0, 'rgba(255,230,160,0.8)'); g.addColorStop(0.45, 'rgba(255,130,50,0.45)'); g.addColorStop(1, 'rgba(200,40,10,0)');
                        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, 84 - h * 0.45, 4, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    glow(450, 84, 26, '255, 90, 30', 0.35);
                    // Sparks from a popped ember
                    const S = this._keeperSparks || [];
                    for (let i = S.length - 1; i >= 0; i--) {
                        const p = S[i]; p.x += p.vx; p.y += p.vy; p.vy *= 0.97; p.vx *= 0.98; p.life--;
                        if (p.life <= 0) { S.splice(i, 1); continue; }
                        glow(p.x, p.y, 4, '255, 200, 110', Math.min(1, p.life / 25));
                    }
                    if (this._keeperSurge) this._keeperSurge = Math.max(0, this._keeperSurge - 0.012);
                    // Candles
                    for (const [x, y] of [[374, 40], [526, 40], [96, 618], [564, 200]]) glow(x, y, 16, '255, 200, 130', 0.35 * (0.85 + 0.15 * Math.sin(t * 9 + x)));
                    // The window above the fire: stars, a portal ring, and the deep pink-violet night
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.save(); ctx.beginPath(); ctx.rect(392, 4, 116, 30); ctx.clip();
                    const R = seededRandom(51);
                    for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 1.3 + i)); ctx.fillStyle = '#fff4ff'; ctx.fillRect(392 + R() * 116, 4 + R() * 30, 1, 1); }
                    ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffc0e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(482, 16, 9, 5, 0.3, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = '#e8c0ff'; ctx.beginPath(); ctx.arc(412, 22 + Math.sin(t * 0.2) * 2, 4, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.globalCompositeOperation = 'lighter';
                    glow(450, 20, 70, '200, 110, 200', 0.08);
                    glow(870, 300, 110, '120, 150, 255', 0.07);
                    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#000';   // nothing beyond the room's walls
                    const { w: PW, h: PH } = KEEPER.PARLOR; ctx.fillRect(-3000, -3000, PW + 6000, 3000); ctx.fillRect(-3000, PH, PW + 6000, 3000); ctx.fillRect(-3000, 0, 3000, PH); ctx.fillRect(PW, 0, 3000, PH);                   // the cool draught at the east window
                }
                ctx.restore();
            }
        });
