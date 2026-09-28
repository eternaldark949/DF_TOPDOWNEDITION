        // =====================================================================
        //  SKY LAYER — ad airships and floating shards above the city
        // =====================================================================
        //  Everything up here is between the camera and the ground, so it's drawn
        //  with parallax k > 1 around the camera: bigger, and drifting faster than
        //  the streets below. Drawn after lighting (it has its own lights). Objects
        //  passing over the middle of the screen fade out so they never hide you.
        const SKY_ADS = [
            { brand: 'Ms. Jean', tag: 'Cream Soda', bg: ['#b8326a', '#ffb6c1'], fg: '#ffffff' },
            { brand: "JJ's", tag: 'Stellar Lemonade', bg: ['#e8c23a', '#ff9a3c'], fg: '#3a1800' },
            { brand: 'LADY 89.5', tag: 'effortlessly lux', bg: ['#4a1070', '#ff5fa2'], fg: '#ffffff' },
            { brand: 'Bellafore', tag: "Bella's finest", bg: ['#2a040c', '#8a1030'], fg: '#ffd9a0' },
            { brand: 'ATEKUDAS', tag: '', bg: ['#062536', '#17b8e0'], fg: '#e0ffff' },
            { brand: 'BONFIRE', tag: '', bg: ['#3a1000', '#ff7a1a'], fg: '#fff3d0' },
            { brand: 'Stella & Jacks', tag: '', bg: ['#3a2a00', '#ffd23f'], fg: '#2a1a00' },
            { brand: 'Zib', tag: 'fast · reliable · cheap', bg: ['#08301f', '#2de08a'], fg: '#eafff4' }
        ];

        class SkyLayer {
            constructor(map) {
                this.map = map;
                const W = map.width || 4000, H = map.height || 4000;
                const r = (i) => _bldHash(9491, i);
                this.airships = [];
                const shipCount = Math.max(3, Math.round(W * H / 9e6));
                for (let i = 0; i < shipCount; i++) {
                    this.airships.push({
                        x0: r(i * 7 + 1) * W, y0: r(i * 7 + 2) * H,
                        heading: (r(i * 7 + 3) < 0.5 ? 0 : Math.PI) + (r(i * 7 + 4) - 0.5) * 0.6,
                        speed: 14 + r(i * 7 + 5) * 10,                  // px per game second
                        k: 1.3 + r(i * 7 + 6) * 0.12, ad: i % SKY_ADS.length, phase: r(i * 7 + 7) * 10
                    });
                }
                this.shards = [];
                const types = ['isle', 'ring', 'crystal', 'cube', 'orb'];
                const colors = ['#b58cff', '#3fe3ff', '#ffcf6a', '#ff6fb5', '#7dffc4'];
                const shardCount = Math.max(8, Math.round(W * H / 2e6));
                for (let i = 0; i < shardCount; i++) {
                    this.shards.push({
                        x: r(500 + i * 9) * W, y: r(501 + i * 9) * H,
                        type: types[Math.floor(r(502 + i * 9) * types.length)],
                        color: colors[Math.floor(r(503 + i * 9) * colors.length)],
                        k: 1.12 + r(504 + i * 9) * 0.4, size: 22 + r(505 + i * 9) * 26,
                        rot: r(506 + i * 9) * Math.PI * 2, spin: (r(507 + i * 9) - 0.5) * 0.4, bob: r(508 + i * 9) * 6
                    });
                }
            }

            draw(ctx, cam, canvas, dark) {
                const t = _gameTimeSec, W = this.map.width || 4000, H = this.map.height || 4000;
                const z = cam.zoom || 1, vw = canvas.width / 2 / z, vh = canvas.height / 2 / z;
                const items = [];
                for (const s of this.airships) {
                    const d = t * s.speed;
                    let x = s.x0 + Math.cos(s.heading) * d, y = s.y0 + Math.sin(s.heading) * d;
                    x = ((x % (W + 800)) + W + 800) % (W + 800) - 400; y = ((y % (H + 800)) + H + 800) % (H + 800) - 400;
                    items.push({ kind: 'ship', o: s, x, y, k: s.k });
                }
                for (const s of this.shards) items.push({ kind: 'shard', o: s, x: s.x, y: s.y + Math.sin(t * 0.5 + s.bob) * 6, k: s.k });
                items.sort((a, b) => a.k - b.k);
                for (const it of items) {
                    const X = cam.x + (it.x - cam.x) * it.k, Y = cam.y + (it.y - cam.y) * it.k;
                    const reach = (it.kind === 'ship' ? 160 : 60) * it.k;
                    if (X < cam.x - vw - reach || X > cam.x + vw + reach || Y < cam.y - vh - reach || Y > cam.y + vh + reach) continue;
                    // Fade anything passing over the middle of the screen (that's where you are)
                    const rr = Math.hypot(X - cam.x, Y - cam.y);
                    const fade = Math.max(0.12, Math.min(1, (rr - 120) / 260));
                    ctx.save();
                    ctx.translate(X, Y); ctx.scale(it.k, it.k);
                    if (it.kind === 'ship') { ctx.globalAlpha = 0.95 * fade; this._drawAirship(ctx, it.o, t, dark); }
                    else { ctx.globalAlpha = (0.45 + 0.25 * dark) * fade; this._drawShard(ctx, it.o, t); }
                    ctx.restore();
                }
            }

            _drawAirship(ctx, s, t, dark) {
                ctx.rotate(s.heading);
                const a0 = ctx.globalAlpha;
                // Hull
                const g = ctx.createLinearGradient(0, -34, 0, 34);
                g.addColorStop(0, '#3a3548'); g.addColorStop(0.5, '#5a5470'); g.addColorStop(1, '#2a2636');
                ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 110, 32, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
                for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(i * 26, 0, 3, 31 * Math.sqrt(1 - Math.pow(i * 26 / 110, 2)), 0, 0, Math.PI * 2); ctx.stroke(); }
                // Tail fins and engine pods with spinning props
                ctx.fillStyle = '#2e2a3c';
                ctx.beginPath(); ctx.moveTo(-92, -8); ctx.lineTo(-128, -30); ctx.lineTo(-118, 0); ctx.lineTo(-128, 30); ctx.lineTo(-92, 8); ctx.closePath(); ctx.fill();
                for (const side of [-1, 1]) {
                    ctx.fillStyle = '#3e3950'; ctx.beginPath(); ctx.ellipse(-25, side * 40, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = 'rgba(200,200,220,0.5)'; ctx.lineWidth = 1.5;
                    const pa = t * 20; ctx.beginPath(); ctx.moveTo(-42, side * 40 + Math.cos(pa) * 8); ctx.lineTo(-42, side * 40 - Math.cos(pa) * 8); ctx.stroke();
                }
                // LED ad screen on top (kept upright when flying left)
                const cycle = Math.floor((t + s.phase) / 10), ad = SKY_ADS[(s.ad + cycle) % SKY_ADS.length];
                const fadeIn = Math.min(1, ((t + s.phase) % 10) / 0.6);
                ctx.save();
                if (Math.cos(s.heading) < 0) ctx.rotate(Math.PI);
                ctx.shadowColor = ad.bg[1]; ctx.shadowBlur = 16 * (0.4 + dark);
                const sg = ctx.createLinearGradient(-62, 0, 62, 0); sg.addColorStop(0, ad.bg[0]); sg.addColorStop(1, ad.bg[1]);
                ctx.globalAlpha = a0 * (0.35 + 0.65 * fadeIn);
                ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(-62, -19, 124, 38, 6); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = ad.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = `bold ${ad.tag ? 15 : 18}px Montserrat, sans-serif`;
                ctx.fillText(ad.brand, 0, ad.tag ? -5 : 0);
                if (ad.tag) { ctx.font = '8px Montserrat, sans-serif'; ctx.fillText(ad.tag, 0, 10); }
                ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-62, -19, 124, 3);   // scanline sheen
                ctx.restore();
                ctx.globalAlpha = a0;
                // Navigation lights: red port, green starboard, white tail strobe
                const blink = Math.sin(t * 4 + s.phase) > 0;
                const light = (x, y, c, on, r = 2.6) => { if (!on) return; ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; };
                light(10, -31, '#ff3344', blink); light(10, 31, '#33ff77', blink);
                light(-120, 0, '#ffffff', ((t + s.phase) % 1.6) < 0.12, 3.2);
            }

            _drawShard(ctx, s, t) {
                const c = s.color, n = s.size;
                ctx.rotate(s.rot + t * s.spin);
                ctx.shadowColor = c; ctx.shadowBlur = 14;
                switch (s.type) {
                    case 'isle': {                      // a little floating island (Piratia)
                        ctx.shadowBlur = 8;
                        ctx.fillStyle = '#4a3a4e'; ctx.beginPath();
                        for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = n * (0.95 + 0.18 * Math.sin(i * 2.3)); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr * 0.8); }
                        ctx.closePath(); ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = '#3f7d4a'; ctx.beginPath(); ctx.ellipse(0, -2, n * 0.8, n * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#d9c7a8'; ctx.fillRect(-n * 0.3, -n * 0.25, n * 0.32, n * 0.28);          // cottage
                        ctx.fillStyle = '#8a3b3b'; ctx.beginPath(); ctx.moveTo(-n * 0.34, -n * 0.25); ctx.lineTo(-n * 0.14, -n * 0.42); ctx.lineTo(n * 0.06, -n * 0.25); ctx.fill();
                        ctx.fillStyle = '#2f6b3a'; ctx.beginPath(); ctx.arc(n * 0.35, n * 0.1, n * 0.2, 0, Math.PI * 2); ctx.fill();   // tree
                        ctx.strokeStyle = 'rgba(150,215,255,0.8)'; ctx.lineWidth = 2;                                           // waterfall off the edge
                        ctx.beginPath(); ctx.moveTo(n * 0.7, n * 0.3); ctx.lineTo(n * 1.25, n * 0.55); ctx.stroke();
                        break;
                    }
                    case 'ring': {                      // portal ring
                        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, n, 0, Math.PI * 2); ctx.stroke();
                        ctx.lineWidth = 1; ctx.globalAlpha *= 0.6;
                        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, n * (0.3 + i * 0.2), t * (1 + i) , t * (1 + i) + 3.5); ctx.stroke(); }
                        break;
                    }
                    case 'crystal': {                   // faceted shard
                        ctx.fillStyle = hexToRgba(c, 0.35); ctx.strokeStyle = c; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.moveTo(0, -n); ctx.lineTo(n * 0.45, 0); ctx.lineTo(0, n * 0.9); ctx.lineTo(-n * 0.45, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(0, -n); ctx.lineTo(0, n * 0.9); ctx.moveTo(-n * 0.45, 0); ctx.lineTo(n * 0.45, 0); ctx.stroke();
                        break;
                    }
                    case 'cube': {                      // spinning wireframe cube
                        const a = t * 0.6, pts = [];
                        for (const X of [-1, 1]) for (const Y of [-1, 1]) for (const Z of [-1, 1]) {
                            const x1 = X * Math.cos(a) - Z * Math.sin(a), z1 = X * Math.sin(a) + Z * Math.cos(a);
                            const y1 = Y * Math.cos(a * 0.7) - z1 * Math.sin(a * 0.7);
                            pts.push([x1 * n * 0.55, y1 * n * 0.55]);
                        }
                        ctx.strokeStyle = c; ctx.lineWidth = 1.5;
                        const E = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
                        ctx.beginPath(); for (const [i, j] of E) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); } ctx.stroke();
                        break;
                    }
                    case 'orb': {                       // little planet with an orbit ring
                        const g = ctx.createRadialGradient(-n * 0.2, -n * 0.2, 0, 0, 0, n * 0.6);
                        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, c); g.addColorStop(1, hexToRgba(c, 0.2));
                        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, n * 0.6, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = hexToRgba(c, 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 0, n, n * 0.3, 0.4, 0, Math.PI * 2); ctx.stroke();
                        break;
                    }
                }
                ctx.shadowBlur = 0;
            }
        }

