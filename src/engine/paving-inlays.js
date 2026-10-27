        // GameEngine — Paving inlays. Methods are added to GameEngine.prototype (see engineMixin in
        // game-engine.js).
        //
        // Round medallions set into the ground: champagne and bronze strips in dark polished granite
        // by day, and at night a violet light in their grooves that breathes slowly. Where Stella
        // steps on one, a ring of light runs out from her feet through the grooves. Three motifs in
        // PAVING_MOTIFS: 'spiral' (log-spiral arms round a rosette), 'compass' (a four-point star over
        // an eight-point one, a ticked ring) and 'vine' (Art Nouveau whiplash stems, leaves, tendrils).
        //
        // Kept for Darklands (not placed anywhere yet). A map uses them by listing `inlays` in its
        // data: [{ x, y, r, motif }] (motif optional: one of the three, picked by where it stands).
        // drawPavingInlays lays the stone on the ground before the puddles and reflections (draw.js);
        // drawPavingGlow lights the grooves after the darkness (drawEmissivePass).

        const PAVING = {
            W: { major: 2.6, minor: 1.6, fine: 1.0 },   // groove widths by weight
            FROM: 0.25, FULL: 0.55,                     // ambient darkness where the glow starts, and where it's full
            GLOW: 0.55,                                 // the grooves' light at its breath's peak
            RIPPLE_EVERY: 0.9,                          // s between rings while she stands on one
            RIPPLE_LIFE: 1.6,                           // s a ring runs before it's gone
            RIPPLE_SPEED: 1.1,                          // radii a ring runs out each second
            RIPPLE_BAND: 16                             // px either side of a ring that lights
        };
        const _PTAU = Math.PI * 2;
        /** Each motif's line work at radius r round 0, 0; `S(weight)` sets the stroke for 'major' | 'minor' | 'fine' */
        const PAVING_MOTIFS = {
            spiral(c, r, S) {
                S('major'); c.beginPath(); c.arc(0, 0, r * 0.94, 0, _PTAU); c.stroke();
                S('minor'); c.beginPath(); c.arc(0, 0, r * 0.86, 0, _PTAU); c.stroke();
                S('minor'); c.beginPath(); c.arc(0, 0, r * 0.2, 0, _PTAU); c.stroke();
                for (let k = 0; k < 12; k++) {
                    S(k % 2 ? 'fine' : 'major'); c.beginPath();
                    for (let s = 0; s <= 1.0001; s += 0.025) {
                        const rad = r * 0.22 + s * r * 0.62, a = k * _PTAU / 12 + s * 2.2;
                        if (s) c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
                    }
                    c.stroke();
                }
                S('fine');
                for (let k = 0; k < 8; k++) { c.save(); c.rotate(k * _PTAU / 8); c.beginPath(); c.ellipse(r * 0.11, 0, r * 0.08, r * 0.03, 0, 0, _PTAU); c.stroke(); c.restore(); }
            },
            compass(c, r, S) {
                S('major'); c.beginPath(); c.arc(0, 0, r * 0.94, 0, _PTAU); c.stroke();
                S('minor'); c.beginPath(); c.arc(0, 0, r * 0.82, 0, _PTAU); c.stroke();
                S('fine');
                for (let k = 0; k < 64; k++) {
                    const a = k * _PTAU / 64, l = k % 4 ? 0.04 : 0.08;
                    c.beginPath(); c.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); c.lineTo(Math.cos(a) * r * (0.82 + l), Math.sin(a) * r * (0.82 + l)); c.stroke();
                }
                const star = (n, outer, inner, off, weight) => {
                    S(weight); c.beginPath();
                    for (let i = 0; i <= n * 2; i++) { const a = off + i * Math.PI / n, rr = i % 2 ? inner : outer; if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
                    c.stroke();
                };
                star(8, r * 0.5, r * 0.2, _PTAU / 16, 'fine');
                star(4, r * 0.78, r * 0.16, 0, 'major');
                S('minor');
                for (let k = 0; k < 4; k++) { const a = k * _PTAU / 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); c.stroke(); }
                c.beginPath(); c.arc(0, 0, r * 0.1, 0, _PTAU); c.stroke();
            },
            vine(c, r, S) {
                S('major'); c.beginPath(); c.arc(0, 0, r * 0.94, 0, _PTAU); c.stroke();
                S('fine'); c.beginPath(); c.arc(0, 0, r * 0.88, 0, _PTAU); c.stroke();
                for (let k = 0; k < 4; k++) {
                    c.save(); c.rotate(k * _PTAU / 4);
                    S('major'); c.beginPath(); c.moveTo(r * 0.12, 0);                       // a whiplash stem, curling back on itself
                    c.bezierCurveTo(r * 0.45, -r * 0.35, r * 0.75, r * 0.1, r * 0.55, r * 0.32);
                    c.bezierCurveTo(r * 0.42, r * 0.46, r * 0.3, r * 0.28, r * 0.42, r * 0.2); c.stroke();
                    S('minor'); c.beginPath(); c.moveTo(r * 0.35, -r * 0.18);              // a leaf off it
                    c.quadraticCurveTo(r * 0.5, -r * 0.48, r * 0.72, -r * 0.42); c.quadraticCurveTo(r * 0.5, -r * 0.28, r * 0.35, -r * 0.18); c.stroke();
                    S('fine'); c.beginPath(); c.moveTo(r * 0.62, -r * 0.05);               // and a tendril
                    for (let s = 0; s <= 1.0001; s += 0.05) { const a = -0.3 + s * 4.2, rr = r * (0.16 - s * 0.12); c.lineTo(r * 0.62 + Math.cos(a) * rr, -r * 0.05 + Math.sin(a) * rr); }
                    c.stroke();
                    S('minor'); c.beginPath(); c.arc(r * 0.88, 0, r * 0.1, Math.PI * 0.6, Math.PI * 1.4); c.stroke();   // a lobe on the rim
                    c.restore();
                }
                S('minor');
                for (let k = 0; k < 4; k++) { const a = k * _PTAU / 4 + _PTAU / 8; c.beginPath(); c.arc(Math.cos(a) * r * 0.08, Math.sin(a) * r * 0.08, r * 0.07, 0, _PTAU); c.stroke(); }
            }
        };
        const PAVING_MOTIF_NAMES = Object.keys(PAVING_MOTIFS);
        const _pavingSprites = new Map();

        /** An inlay's motif: its own, else one of the three by where it stands */
        function pavingMotif(inlay) {
            return PAVING_MOTIFS[inlay.motif] ? inlay.motif : PAVING_MOTIF_NAMES[Math.abs(Math.round(inlay.x * 0.013 + inlay.y * 0.007)) % PAVING_MOTIF_NAMES.length];
        }
        /** The stone by day: dark granite with champagne and bronze in its grooves, a lit edge on the metal, a sheen (baked per motif and size) */
        function pavingInlaySprite(motif, r) {
            r = Math.round(r);
            const key = 'i' + motif + r;
            let s = _pavingSprites.get(key);
            if (s) return s;
            const P = 6, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(r * 2 + P * 2);
            const c = cv.getContext('2d'), M = PAVING_MOTIFS[motif], W = PAVING.W;
            c.translate(r + P, r + P);
            const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
            g.addColorStop(0, '#2c2632'); g.addColorStop(1, '#17131b');
            c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, _PTAU); c.fill();
            const rnd = seededRandom(r * 31 + motif.length * 7);                     // the granite's fleck
            for (let i = 0; i < r * 6; i++) {
                const a = rnd() * _PTAU, d = Math.sqrt(rnd()) * r * 0.97;
                c.fillStyle = rnd() < 0.15 ? 'rgba(214,180,120,.25)' : rnd() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.3)';
                c.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.2, 1.2);
            }
            c.lineCap = 'round'; c.lineJoin = 'round';
            M(c, r, k => { c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = W[k] + 2; });                                         // the cut
            M(c, r, k => { c.strokeStyle = k === 'major' ? '#b8894c' : k === 'minor' ? '#d7bd8a' : '#9c7446'; c.lineWidth = W[k]; });   // the metal in it
            c.save(); c.translate(-0.6, -0.6);
            M(c, r, k => { c.strokeStyle = 'rgba(255,240,210,.35)'; c.lineWidth = W[k] * 0.4; });                                // its lit edge
            c.restore();
            c.strokeStyle = '#8a6a3e'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, _PTAU); c.stroke();
            const sh = c.createLinearGradient(-r, -r, r, r);
            sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.06)'); sh.addColorStop(0.65, 'rgba(255,255,255,0)');
            c.fillStyle = sh; c.beginPath(); c.arc(0, 0, r, 0, _PTAU); c.fill();
            s = { cv, P };
            _pavingSprites.set(key, s);
            return s;
        }
        /** The night's light in the grooves: the same line work, soft violet round a hot core (baked per motif and size) */
        function pavingGlowSprite(motif, r) {
            r = Math.round(r);
            const key = 'g' + motif + r;
            let s = _pavingSprites.get(key);
            if (s) return s;
            const P = 14, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(r * 2 + P * 2);
            const c = cv.getContext('2d'), M = PAVING_MOTIFS[motif];
            c.translate(r + P, r + P); c.lineCap = 'round'; c.lineJoin = 'round';
            for (const [w, col] of [[9, 'rgba(150,90,255,.10)'], [5, 'rgba(170,110,255,.22)'], [2.2, 'rgba(200,160,255,.6)'], [0.9, 'rgba(240,225,255,.9)']])
                M(c, r, k => { c.strokeStyle = col; c.lineWidth = w * (k === 'major' ? 1 : k === 'minor' ? 0.75 : 0.55); });
            s = { cv, P };
            _pavingSprites.set(key, s);
            return s;
        }

        engineMixin({
            /** The map's inlays in view (margin m), or none */
            _pavingInView(m) {
                const list = this.activeMap && this.activeMap.inlays, cb = this._cullBounds;
                if (!list || !list.length || !cb) return null;
                const v = cb.view, out = this._pavingVisible || (this._pavingVisible = []);
                out.length = 0;
                for (const q of list) if (q.x + q.r + m >= v.left && q.x - q.r - m <= v.right && q.y + q.r + m >= v.top && q.y - q.r - m <= v.bottom) out.push(q);
                return out;
            },

            /** On the ground, before the puddles and reflections: each inlay's stone */
            drawPavingInlays(ctx) {
                const list = this._pavingInView(8);
                if (!list) return;
                for (const q of list) { const S = pavingInlaySprite(pavingMotif(q), q.r); ctx.drawImage(S.cv, q.x - q.r - S.P, q.y - q.r - S.P); }
            },

            /** After the darkness: the grooves' violet light, breathing, and the rings running out from her feet */
            drawPavingGlow(ctx, dark) {
                const P = PAVING, night = Math.max(0, Math.min(1, (dark - P.FROM) / (P.FULL - P.FROM)));
                const list = night > 0.01 && this._pavingInView(P.RIPPLE_BAND);
                if (!list) return;
                const t = _frameTime / 1000, p = this.player;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (const q of list) {
                    const G = pavingGlowSprite(pavingMotif(q), q.r), gx = q.x - q.r - G.P, gy = q.y - q.r - G.P;
                    const breathe = 0.55 + 0.25 * Math.sin(t * 0.7 + q.x * 0.01) + 0.08 * Math.sin(t * 2.3 + q.y * 0.02);
                    ctx.globalAlpha = night * breathe * P.GLOW;
                    ctx.drawImage(G.cv, gx, gy);
                    // where she steps on it, a ring of light runs out from her feet
                    const R = q._ripples || (q._ripples = []);
                    if (p && Math.hypot(p.x - q.x, p.y - q.y) < q.r && !(t - (q._rippleAt || -1e9) < P.RIPPLE_EVERY)) { R.push({ x: p.x, y: p.y, t0: t }); q._rippleAt = t; }
                    for (let i = R.length - 1; i >= 0; i--) {
                        const w = R[i], age = t - w.t0, a = 1 - age / P.RIPPLE_LIFE;
                        if (a <= 0 || age < 0) { R.splice(i, 1); continue; }
                        const rad = age * q.r * P.RIPPLE_SPEED;
                        ctx.save();
                        ctx.beginPath(); ctx.arc(w.x, w.y, rad + P.RIPPLE_BAND, 0, _PTAU); ctx.arc(w.x, w.y, Math.max(0, rad - P.RIPPLE_BAND), 0, _PTAU, true); ctx.clip();
                        ctx.globalAlpha = night * a;
                        ctx.drawImage(G.cv, gx, gy); ctx.drawImage(G.cv, gx, gy);
                        ctx.restore();
                    }
                }
                ctx.restore();
            }
        });
