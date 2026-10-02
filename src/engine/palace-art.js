        // The Demoness Palace: its floor (painted once), its glow after the darkness, and its decor
        // (dp_*). Obsidian and gold, crimson silk, ember light. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js); the decor drawer is a plain
        // function that entities/props-decor.js dispatches to.

        const PALACE = { obsidian: '#0b0509', obsidianHi: '#1c0d16', gold: '#e3a64a', goldDim: 'rgba(227,166,74,0.45)', blood: '#7a0618',
                      crimson: '#b0122e', ember: '#ff6a3a', bone: '#e9d8c6', thorn: '#2a0e12', rose: '#c0143e', water: '#14060c' };

        engineMixin({
            drawPalaceInterior(ctx) {
                if (!this._palaceFloor) this._palaceFloor = this._paintPalaceFloor();
                ctx.drawImage(this._palaceFloor, 0, 0);
            },

            _paintPalaceFloor() {
                const cv = document.createElement('canvas'); cv.width = 1800; cv.height = 1400;
                const c = cv.getContext('2d'), r = seededRandom(666);
                const fill = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
                fill(0, 0, 1800, 1400, '#0a0407');
                // Obsidian slabs with gold seams (throne hall, entrance, galleries)
                const slabs = (x0, y0, x1, y1, s, base) => {
                    for (let y = y0; y < y1; y += s) for (let x = x0; x < x1; x += s) { const v = r() * 6 | 0; c.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.4 | 0},${base[2] + v})`; c.fillRect(x, y, s, s); }
                    c.strokeStyle = 'rgba(227,166,74,0.16)'; c.lineWidth = 1; c.beginPath();
                    for (let x = x0; x <= x1; x += s) { c.moveTo(x, y0); c.lineTo(x, y1); }
                    for (let y = y0; y <= y1; y += s) { c.moveTo(x0, y); c.lineTo(x1, y); }
                    c.stroke();
                    for (let i = 0; i < (x1 - x0) * (y1 - y0) / 9000; i++) {                       // veins of ember in the stone
                        let x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); c.strokeStyle = `rgba(255,110,70,${0.04 + r() * 0.07})`; c.lineWidth = 0.6 + r();
                        c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke();
                    }
                };
                slabs(600, 380, 1200, 986, 60, [12, 6, 10]);
                slabs(600, 1000, 1200, 1386, 60, [14, 7, 11]);
                slabs(14, 380, 586, 986, 48, [16, 8, 14]); slabs(1214, 380, 1786, 986, 48, [16, 8, 14]);
                // The throne hall: a gold inlaid sigil before the throne, and a crimson runner from the arch
                c.save(); c.translate(900, 520);
                c.strokeStyle = PALACE.gold; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 96, 0, Math.PI * 2); c.stroke();
                c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 84, 0, Math.PI * 2); c.stroke();
                c.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 82, Math.sin(a) * 82); } c.closePath(); c.stroke();
                for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; c.fillStyle = i % 2 ? PALACE.gold : PALACE.crimson; c.beginPath(); c.arc(Math.cos(a) * 90, Math.sin(a) * 90, 2, 0, Math.PI * 2); c.fill(); }
                c.restore();
                fill(860, 760, 80, 226, '#4a0612'); fill(864, 760, 2, 226, PALACE.goldDim); fill(934, 760, 2, 226, PALACE.goldDim);
                fill(860, 1000, 80, 386, '#4a0612'); fill(864, 1000, 2, 386, PALACE.goldDim); fill(934, 1000, 2, 386, PALACE.goldDim);
                // The garden: dark earth, a path of bone-white stones to the fountain
                for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(60,10,16,0.35)' : 'rgba(0,0,0,0.3)'; c.fillRect(14 + r() * 872, 14 + r() * 352, 2 + r() * 4, 2 + r() * 3); }
                for (let y = 30; y < 366; y += 26) { c.fillStyle = 'rgba(233,216,198,0.18)'; c.beginPath(); c.ellipse(450 + (r() - 0.5) * 8, y, 14, 9, 0, 0, Math.PI * 2); c.fill(); }
                // Shrine: black stone and a ring of gold; the bath: ash-dark tiles
                slabs(900, 14, 1386, 366, 44, [10, 5, 9]);
                c.strokeStyle = PALACE.goldDim; c.lineWidth = 2; c.beginPath(); c.arc(1145, 210, 110, 0, Math.PI * 2); c.stroke();
                slabs(1400, 14, 1786, 366, 40, [20, 10, 8]);
                // Dressing room: rose carpet; the kennels: scored stone and straw
                fill(14, 1000, 572, 386, '#2a0a16'); for (let i = 0; i < 500; i++) { c.fillStyle = 'rgba(255,120,160,0.03)'; c.fillRect(14 + r() * 572, 1000 + r() * 386, 3, 3); }
                slabs(1214, 1000, 1786, 1386, 50, [18, 12, 8]);
                for (let i = 0; i < 260; i++) { c.strokeStyle = 'rgba(200,160,90,0.12)'; c.lineWidth = 1; const x = 1230 + r() * 540, y = 1110 + r() * 260, a = r() * 6.28; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); c.stroke(); }
                return cv;
            },

            /** After the darkness: braziers, the red moon, the embers, the fountain, drifting sparks */
            drawPalaceGlow(ctx) {
                const t = _frameTime / 1000, glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of this.props || []) {
                    if (!p.decorType || !p.decorType.startsWith('dp_')) continue;
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2, f = 0.8 + 0.2 * Math.sin(t * 9 + cx);
                    if (p.decorType === 'dp_brazier') { glow(cx, cy, 46, '255, 110, 60', 0.5 * f); glow(cx, cy, 14, '255, 220, 160', 0.7 * f); }
                    else if (p.decorType === 'dp_embers') glow(cx, cy, 140, '255, 90, 30', 0.28 + 0.06 * Math.sin(t * 1.3));
                    else if (p.decorType === 'dp_fountain') glow(cx, cy, 60, '255, 60, 100', 0.25 + 0.05 * Math.sin(t * 2));
                    else if (p.decorType === 'dp_altar') { glow(cx - 30, cy, 18, '255, 180, 110', 0.5 * f); glow(cx + 30, cy, 18, '255, 180, 110', 0.5 * f); glow(cx, cy, 50, '255, 70, 90', 0.25); }
                    else if (p.decorType === 'dp_throne') glow(cx, cy - 6, 70, '255, 40, 80', 0.22 + 0.06 * Math.sin(t * 0.9));
                    else if (p.decorType === 'dp_pool') glow(cx, cy, 70, '200, 20, 60', 0.14);
                    else if (p.decorType === 'dp_cage') glow(cx, cy, 30, '255, 60, 20', 0.12);
                }
                // The red moon through the oculus, over the throne
                glow(900, 470, 170, '255, 40, 70', 0.12 + 0.03 * Math.sin(t * 0.5));
                // Sparks rising from the braziers and the embers
                for (let i = 0; i < 36; i++) {
                    const src = i % 3 === 0 ? [1590, 175] : [[733, 573], [1067, 573], [733, 833], [1067, 833]][i % 4];
                    const ph = (t * (0.25 + (i % 5) * 0.05) + i * 0.137) % 1;
                    const x = src[0] + Math.sin(t * 2 + i) * 10 * ph + ((i * 37) % 30 - 15), y = src[1] - ph * 90;
                    ctx.globalAlpha = (1 - ph) * 0.7; ctx.fillStyle = i % 2 ? '#ffb070' : '#ff6a3a';
                    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
        });

        // The hunters (entities/hunters.js): their dashes and their eyes
        engineMixin({
            /** The hunters' crimson flits: a fading ghost where they were, jagged red lines to where they are (world space) */
            drawHunterDashes(ctx) {
                const L = this.hunterDashes; if (!L || !L.length) return;
                const now = _gameTimeSec;
                for (let i = L.length - 1; i >= 0; i--) {
                    const D = L[i], age = now - D.t0;
                    if (age > 0.6) { L.splice(i, 1); continue; }
                    const k = 1 - age / 0.6;
                    // the ghost: a silhouette in crimson, fading
                    ctx.save(); ctx.globalAlpha = 0.45 * k; ctx.fillStyle = D.boss ? '#ff2a4a' : '#c0142e';
                    ctx.translate(D.x0, D.y0); ctx.rotate(D.a);
                    ctx.beginPath(); ctx.ellipse(-2, 0, 7, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0, 6, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    // the trail: three jagged lines, re-jittered as they fade
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
                    const dx = D.x1 - D.x0, dy = D.y1 - D.y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, n = 9;
                    for (let j = 0; j < 3; j++) {
                        ctx.strokeStyle = j ? `rgba(255,60,80,${0.5 * k})` : `rgba(255,190,170,${0.8 * k})`; ctx.lineWidth = j ? 2.2 : 1;
                        ctx.beginPath(); ctx.moveTo(D.x0, D.y0);
                        for (let s = 1; s < n; s++) {
                            const f = s / n, jit = Math.sin(D.seed + s * 2.3 + j * 7 + Math.floor(now * 30)) * 7 * (1 - Math.abs(f - 0.5) * 1.4);
                            ctx.lineTo(D.x0 + dx * f + nx * jit, D.y0 + dy * f + ny * jit);
                        }
                        ctx.lineTo(D.x1, D.y1); ctx.stroke();
                    }
                    ctx.restore();
                }
            },

            /** After the darkness: hunters' eyes burn ember (night vision's tell) */
            drawHunterEyes(ctx) {
                for (const e of this.enemies || []) {
                    if (!e || e.dead || !e.hunter) continue;
                    const k = e.bossName ? (e._eyeK ?? 1) : 1; if (k < 0.05) continue;
                    const fx = Math.cos(e.angle), fy = Math.sin(e.angle), S = e.bossName ? 1.15 : 1;
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    for (const s of [-1, 1]) {
                        const x = e.x + fx * 6 * S - fy * 2.6 * s * S, y = e.y + fy * 6 * S + fx * 2.6 * s * S;
                        ctx.globalAlpha = 0.9 * k; ctx.fillStyle = '#ffb070'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 0.5 * k; drawGlow(ctx, x, y, 6 + 10 * (e._igniteFlash || 0), '255, 90, 40', 0.3);
                    }
                    ctx.restore();
                }
            }
        });

        /** Her palace's pieces, drawn on the floor pass (dispatched from entities/props-decor.js) */
        function drawPalaceDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, cx = x + w / 2, cy = y + h / 2, t = _frameTime / 1000, C = PALACE;
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => { ctx.beginPath(); ctx.roundRect(X, Y, W, H, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
            const circ = (X, Y, r, fill, stroke, lw = 1) => { ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
            const shadow = (r = 4) => rr(x + 3, y + 3, w, h, r, 'rgba(0,0,0,0.4)');
            switch (p.decorType) {
                case 'dp_throne': {
                    shadow(10);
                    rr(x, y, w, h, 10, '#1a0710', C.gold, 1.5);                                   // the seat
                    ctx.fillStyle = '#4a0612'; ctx.beginPath(); ctx.roundRect(x + 10, y + 14, w - 20, h - 20, 6); ctx.fill();   // crimson velvet
                    // the back: a crest of black horns rising behind the seat, gilded at the tips
                    for (const s of [-1, 1]) {
                        ctx.fillStyle = '#120408'; ctx.beginPath();
                        ctx.moveTo(cx + s * 8, y + 6); ctx.quadraticCurveTo(cx + s * 34, y - 6, cx + s * 40, y - 26); ctx.quadraticCurveTo(cx + s * 22, y - 8, cx + s * 4, y + 12); ctx.fill();
                        circ(cx + s * 40, y - 26, 2.4, C.gold);
                    }
                    circ(cx, y + 4, 5, C.crimson, C.gold, 1.2);
                    break;
                }
                case 'dp_pool': {
                    rr(x - 4, y - 4, w + 8, h + 8, 30, '#22101a', C.goldDim, 2);                   // the gold rim
                    rr(x, y, w, h, 26, C.water);
                    ctx.strokeStyle = 'rgba(255,80,120,0.12)'; ctx.lineWidth = 1;
                    for (let i = 0; i < 3; i++) { const k = ((t * 0.3 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(cx, cy, 10 + k * 60, 6 + k * 36, 0, 0, Math.PI * 2); ctx.stroke(); }
                    ctx.globalAlpha = 1;
                    break;
                }
                case 'dp_pillar': {
                    shadow(18); circ(cx, cy, w / 2, '#160810', C.gold, 1.4); circ(cx, cy, w / 2 - 6, '#24101a');
                    ctx.strokeStyle = 'rgba(176,18,46,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 3, t * 0.2, t * 0.2 + 4); ctx.stroke();
                    break;
                }
                case 'dp_brazier': {
                    shadow(13); circ(cx, cy, w / 2, '#1c0a0a', C.gold, 1.4); circ(cx, cy, w / 2 - 4, '#3a0c06');
                    const f = 0.7 + 0.3 * Math.sin(t * 13 + cx);
                    circ(cx, cy, 7 * f, '#ff6a3a'); circ(cx, cy, 3.5 * f, '#ffe0a0');
                    break;
                }
                case 'dp_fountain': {
                    circ(cx, cy, w / 2, '#1e0c12', C.goldDim, 2); circ(cx, cy, w / 2 - 8, C.water);
                    circ(cx, cy, 10, '#2a1018', C.gold, 1.2);                                      // the spout
                    ctx.strokeStyle = 'rgba(255,60,100,0.3)'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); ctx.quadraticCurveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24 - 6, cx + Math.cos(a) * 32, cy + Math.sin(a) * 32); ctx.stroke(); }
                    break;
                }
                case 'dp_roses': {
                    rr(x, y, w, h, 8, '#1a0a0c', 'rgba(0,0,0,0.4)');
                    const R = seededRandom((x * 31 + y) | 0);
                    for (let i = 0; i < 16; i++) { const px = x + 8 + R() * (w - 16), py = y + 6 + R() * (h - 12); circ(px, py, 3 + R() * 2, '#1e3a1a'); circ(px + 1, py - 1, 2.2 + R(), i % 3 ? C.rose : '#ff4a6a'); }
                    break;
                }
                case 'dp_hedge': {
                    rr(x, y, w, h, 6, '#140a0a');
                    ctx.strokeStyle = C.thorn; ctx.lineWidth = 1.2; for (let i = 0; i < 10; i++) { const py = y + 4 + i * (h - 8) / 9; ctx.beginPath(); ctx.moveTo(x + 2, py); ctx.lineTo(x + w - 2, py + 3); ctx.stroke(); }
                    break;
                }
                case 'dp_altar': {
                    shadow(6); rr(x, y, w, h, 6, '#160810', C.gold, 1.4);
                    ctx.fillStyle = '#e9d8c6'; ctx.beginPath(); ctx.ellipse(cx, cy, 12, 9, 0, 0, Math.PI * 2); ctx.fill();   // a skull of bone, horned
                    ctx.fillStyle = '#120408'; ctx.beginPath(); ctx.arc(cx - 4, cy - 1, 2.4, 0, 6.28); ctx.arc(cx + 4, cy - 1, 2.4, 0, 6.28); ctx.fill();
                    for (const s of [-1, 1]) { ctx.strokeStyle = '#2a1010'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + s * 8, cy - 6); ctx.quadraticCurveTo(cx + s * 20, cy - 16, cx + s * 16, cy - 22); ctx.stroke(); }
                    for (const s of [-1, 1]) { circ(cx + s * 30, cy, 3, C.bone); const f = 0.75 + 0.25 * Math.sin(t * 11 + s); circ(cx + s * 30, cy - 4, 2.4 * f, '#ffb46a'); }
                    break;
                }
                case 'dp_statue': {
                    shadow(15); circ(cx, cy, w / 2, '#241018', 'rgba(0,0,0,0.5)');
                    circ(cx, cy - 2, w / 2 - 6, '#3a1c24');                                        // a kneeling figure, from above
                    circ(cx, cy - 6, 4, '#4a2a30');
                    break;
                }
                case 'dp_embers': {
                    rr(x - 4, y - 4, w + 8, h + 8, 24, '#2a0e08', C.goldDim, 2);
                    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) / 2);
                    g.addColorStop(0, '#ff8a3a'); g.addColorStop(0.5, '#b0300a'); g.addColorStop(1, '#3a0a04');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 20); ctx.fill();
                    const R = seededRandom(17);
                    for (let i = 0; i < 40; i++) { const px = x + 10 + R() * (w - 20), py = y + 10 + R() * (h - 20), f = 0.5 + 0.5 * Math.sin(t * (3 + R() * 4) + i); circ(px, py, 1.5 + R() * 2, `rgba(255,${180 + (f * 60 | 0)},120,${0.4 + 0.5 * f})`); }
                    break;
                }
                case 'dp_mirror': {
                    rr(x, y, w, h, 3, '#e3a64a'); rr(x + 3, y + 3, w - 6, h - 6, 2, 'rgba(200,190,220,0.5)');
                    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 8, y + 4, 12, 2);
                    break;
                }
                case 'dp_vanity': { shadow(); rr(x, y, w, h, 5, '#2a0c16', C.goldDim, 1.2); circ(x + 20, cy, 5, '#ff8aa8'); circ(x + 40, cy, 4, '#e3a64a'); circ(x + 60, cy - 4, 3, '#b0122e'); break; }
                case 'dp_wardrobe': { shadow(); rr(x, y, w, h, 4, '#1a0710', C.gold, 1.2); ctx.fillStyle = C.goldDim; ctx.fillRect(cx - 1, y + 3, 2, h - 6); break; }
                case 'dp_cage': {
                    shadow(); rr(x, y, w, h, 4, 'rgba(20,8,6,0.8)');
                    ctx.strokeStyle = '#6a3a1a'; ctx.lineWidth = 1.6; for (let i = 0; i <= 8; i++) { const px = x + i * w / 8; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
                    rr(x, y, w, h, 4, null, '#8a4a2a', 2);
                    break;
                }
                default: rr(x, y, w, h, 4, '#2a0c14');
            }
        }
