        /* =====================================================================
           THE VEIL — the edge of an outdoor map. The city doesn't stop in black: past
           its last stretch the dimension thins out into a deep indigo void of drifting
           stars and nebula, behind a curtain of light along the seam. Near her the seam
           brightens and a row of ◆ diamonds (the HUD's motif) shimmers up; pressing into
           it sends a ripple of light running along the seam both ways.
           Drawn in world space after the emissive pass (above the darkness layer), and
           skipped whenever no edge is near the screen, which is nearly always.
           Maps: type 'outdoor', unless the map says edge: false.
           Each edge is drawn in its own frame: x runs along the seam, -y points out into
           the void, +y in over the city — so one set of gradients serves all four.
           ===================================================================== */
        const MAP_EDGE = {
            HAZE: 150,          // the violet haze reaching in over the city
            GLOW: 120,          // the curtain of light falling out into the void
            NEAR: 240,          // she's this close: the seam wakes up around her
            BAND: 64,           // spacing of the aurora streaks along the seam
            PARALLAX: 0.35,     // the void drifts at this share of the camera's motion: it's far away
            TILE: 512,          // the void's starfield tile
            DIAMOND: 28,        // spacing of the ◆ row
            RIPPLE_LIFE: 1.2, RIPPLE_SPEED: 300, RIPPLE_EVERY: 0.9
        };

        let _edgeTile = null, _edgeStreak = null;

        /** The void: one seeded 512 px tile of nebula and stars, wrapped so it repeats seamlessly. */
        function _edgeVoidTile() {
            if (_edgeTile) return _edgeTile;
            const S = MAP_EDGE.TILE, cv = document.createElement('canvas'); cv.width = cv.height = S;
            const c = cv.getContext('2d'), rng = seededRandom('the veil'), TAU = Math.PI * 2;
            c.fillStyle = '#080320'; c.fillRect(0, 0, S, S);
            const cols = ['92, 40, 170', '168, 44, 150', '48, 60, 180', '124, 84, 224'];
            for (let i = 0; i < 16; i++) {
                const x = rng() * S, y = rng() * S, r = 60 + rng() * 190, col = cols[i % cols.length], a = 0.1 + rng() * 0.12;
                for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
                    const X = x + ox, Y = y + oy;
                    if (X + r < 0 || X - r > S || Y + r < 0 || Y - r > S) continue;
                    const g = c.createRadialGradient(X, Y, 0, X, Y, r);
                    g.addColorStop(0, `rgba(${col}, ${a})`); g.addColorStop(1, `rgba(${col}, 0)`);
                    c.fillStyle = g; c.fillRect(X - r, Y - r, r * 2, r * 2);
                }
            }
            for (let i = 0; i < 180; i++) {
                const x = 4 + rng() * (S - 8), y = 4 + rng() * (S - 8), big = rng() < 0.07, r = big ? 1.3 + rng() : 0.4 + rng() * 0.7, tint = rng();
                c.fillStyle = tint < 0.6 ? '#ffffff' : tint < 0.85 ? '#d8c6ff' : '#ffc2e6';
                c.globalAlpha = 0.3 + rng() * 0.6;
                c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
                if (big) { c.globalAlpha *= 0.45; c.fillRect(x - r * 3, y - 0.3, r * 6, 0.6); c.fillRect(x - 0.3, y - r * 3, 0.6, r * 6); }
            }
            c.globalAlpha = 1;
            return _edgeTile = cv;
        }

        /** An aurora streak: a soft upright blade of light, brightest at its foot (the seam). */
        function _edgeStreakSprite() {
            if (_edgeStreak) return _edgeStreak;
            const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128;
            const c = cv.getContext('2d');
            const h = c.createLinearGradient(0, 0, 32, 0);
            h.addColorStop(0, 'rgba(214, 196, 255, 0)'); h.addColorStop(0.5, 'rgba(214, 196, 255, 1)'); h.addColorStop(1, 'rgba(214, 196, 255, 0)');
            c.fillStyle = h; c.fillRect(0, 0, 32, 128);
            const v = c.createLinearGradient(0, 128, 0, 0);
            v.addColorStop(0, 'rgba(0, 0, 0, 1)'); v.addColorStop(0.35, 'rgba(0, 0, 0, 0.5)'); v.addColorStop(1, 'rgba(0, 0, 0, 0)');
            c.globalCompositeOperation = 'destination-in'; c.fillStyle = v; c.fillRect(0, 0, 32, 128);
            return _edgeStreak = cv;
        }

        engineMixin({
            /** The veil along every outdoor map edge on screen (world space, ctx in the camera's transform). */
            drawMapEdge(ctx) {
                const m = this.activeMap, CB = this._cullBounds;
                if (!m || m.type !== 'outdoor' || m.edge === false || !CB || !CB.view) return;
                const E = MAP_EDGE, V = CB.view, W = m.width, H = m.height;
                // nothing near the screen: the usual case, and free
                if (V.left > E.HAZE && V.top > E.HAZE && V.right < W - E.HAZE && V.bottom < H - E.HAZE) return;
                const t = _gameTimeSec;
                ctx.save();
                // 1. The void beyond the map, a starfield drifting slowly behind the parallax
                const pat = this._edgePat || (this._edgePat = ctx.createPattern(_edgeVoidTile(), 'repeat'));
                if (pat.setTransform) {
                    const M = this._edgeMat || (this._edgeMat = new DOMMatrix());
                    // far away: it drifts with a share of the camera, and shrinks less than the city when zoomed out
                    const sc = Math.pow(Math.max(0.2, this.view.zoom), -0.6);
                    M.a = M.d = sc; M.e = this.view.x * E.PARALLAX + t * 5; M.f = this.view.y * E.PARALLAX + t * 2;
                    pat.setTransform(M);
                }
                ctx.fillStyle = pat;
                const x0 = V.left - 2, x1 = V.right + 2, y0 = V.top - 2, y1 = V.bottom + 2;
                if (x0 < 0) ctx.fillRect(x0, y0, -x0, y1 - y0);
                if (x1 > W) ctx.fillRect(W, y0, x1 - W, y1 - y0);
                const cx0 = Math.max(0, x0), cx1 = Math.min(W, x1);
                if (cx1 > cx0) {
                    if (y0 < 0) ctx.fillRect(cx0, y0, cx1 - cx0, -y0);
                    if (y1 > H) ctx.fillRect(cx0, H, cx1 - cx0, y1 - H);
                }
                // 2. Each edge on screen, in its own frame (x along the seam, -y out into the void)
                const F = this.isDriving && this.car ? this.car : this.player;
                const fx = F ? F.x : -1e9, fy = F ? F.y : -1e9;
                const G = this._edgeGrads || (this._edgeGrads = this._edgeGradients(ctx));
                if (V.top < E.HAZE && V.bottom > -E.GLOW)     this._drawEdge(ctx, G, 'n', 0, 0, 0, W, V.left, V.right, fx, fy, t);
                if (V.bottom > H - E.HAZE && V.top < H + E.GLOW) this._drawEdge(ctx, G, 's', W, H, Math.PI, W, W - V.right, W - V.left, W - fx, H - fy, t);
                if (V.left < E.HAZE && V.right > -E.GLOW)     this._drawEdge(ctx, G, 'w', 0, H, -Math.PI / 2, H, H - V.bottom, H - V.top, H - fy, fx, t);
                if (V.right > W - E.HAZE && V.left < W + E.GLOW) this._drawEdge(ctx, G, 'e', W, 0, Math.PI / 2, H, V.top, V.bottom, fy, W - fx, t);
                // the corners: the curtain's light rounds them, clipped to the void's quarter
                ctx.globalCompositeOperation = 'lighter';
                for (const [cx, cy, sx, sy] of [[0, 0, -1, -1], [W, 0, 1, -1], [0, H, -1, 1], [W, H, 1, 1]]) {
                    if (cx + E.GLOW < V.left || cx - E.GLOW > V.right || cy + E.GLOW < V.top || cy - E.GLOW > V.bottom) continue;
                    ctx.save(); ctx.translate(cx, cy);
                    ctx.fillStyle = G.corner; ctx.fillRect(sx < 0 ? -E.GLOW : 0, sy < 0 ? -E.GLOW : 0, E.GLOW, E.GLOW);
                    ctx.restore();
                }
                ctx.restore();
            },

            /** The veil's gradients, in an edge's own frame (shared by all four edges). */
            _edgeGradients(ctx) {
                const E = MAP_EDGE;
                const haze = ctx.createLinearGradient(0, 0, 0, E.HAZE);                      // in over the city
                haze.addColorStop(0, 'rgba(84, 46, 176, 0.55)'); haze.addColorStop(0.35, 'rgba(62, 28, 132, 0.24)'); haze.addColorStop(1, 'rgba(40, 14, 90, 0)');
                const glow = ctx.createLinearGradient(0, 0, 0, -E.GLOW);                     // out into the void
                glow.addColorStop(0, 'rgba(206, 180, 255, 0.34)'); glow.addColorStop(0.3, 'rgba(140, 96, 230, 0.12)'); glow.addColorStop(1, 'rgba(90, 50, 190, 0)');
                const corner = ctx.createRadialGradient(0, 0, 0, 0, 0, E.GLOW);            // the same curtain, rounding a corner
                corner.addColorStop(0, 'rgba(206, 180, 255, 0.34)'); corner.addColorStop(0.3, 'rgba(140, 96, 230, 0.12)'); corner.addColorStop(1, 'rgba(90, 50, 190, 0)');
                return { haze, glow, corner };
            },

            /**
             * One edge: translate/rotate puts its frame at (ox, oy) turned by `rot`; it is `len`
             * long and [u0, u1] of it is on screen. (fu, fn): her place along it and how far in.
             */
            _drawEdge(ctx, G, id, ox, oy, rot, len, u0, u1, fu, fn, t) {
                const E = MAP_EDGE;
                u0 = Math.max(0, u0 - 4); u1 = Math.min(len, u1 + 4);
                if (u1 <= u0) return;
                ctx.save();
                ctx.translate(ox, oy); if (rot) ctx.rotate(rot);
                const L = u1 - u0;
                // the haze in over the city, and the curtain of light out over the void
                ctx.fillStyle = G.haze; ctx.fillRect(u0, 0, L, E.HAZE);
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = G.glow; ctx.fillRect(u0, -E.GLOW, L, E.GLOW);
                // aurora streaks: anchored to the world, each breathing on its own beat, drifting a little
                const sp = _edgeStreakSprite(), B = E.BAND;
                for (let i = Math.floor(u0 / B) - 1, n = Math.ceil(u1 / B) + 1; i <= n; i++) {
                    const u = i * B + Math.sin(t * 0.3 + i * 1.9) * 14;
                    if (u < 10 || u > len - 10) continue;                                   // not past the corners
                    const a = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 2.3));
                    const h = E.GLOW * (0.7 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.45 + i * 1.3)));
                    ctx.globalAlpha = a; ctx.drawImage(sp, u - 13, -h, 26, h);
                }
                // the seam: a thread of light with a soft halo, shimmering slowly
                const sh = 0.85 + 0.15 * Math.sin(t * 1.3);
                ctx.globalAlpha = 0.2 * sh; ctx.fillStyle = '#c8b2ff'; ctx.fillRect(u0, -4, L, 8);
                ctx.globalAlpha = 0.7 * sh; ctx.fillStyle = '#f1e8fe'; ctx.fillRect(u0, -0.8, L, 1.6);
                // near her: the seam brightens and the ◆ row shimmers up
                if (fn < E.NEAR && fn > -E.NEAR && fu > -E.NEAR && fu < len + E.NEAR) {
                    const k = Math.pow(1 - Math.max(0, fn) / E.NEAR, 1.5);
                    ctx.globalAlpha = 0.28 * k; drawGlow(ctx, fu, 0, 40 + 100 * k, '214, 196, 255', 0);
                    const D = E.DIAMOND, reach = 170;
                    ctx.fillStyle = '#f1e8fe';
                    for (let j = Math.floor((fu - reach) / D), n = Math.ceil((fu + reach) / D); j <= n; j++) {
                        const u = j * D; if (u < 0 || u > len) continue;
                        const fall = 1 - Math.abs(u - fu) / reach; if (fall <= 0) continue;
                        const a = k * fall * (0.55 + 0.45 * Math.sin(t * 3 + j * 0.9));
                        if (a < 0.02) continue;
                        const y = -12 - 4 * Math.sin(t * 2 + j * 0.7), s = 2.6 + 1.6 * k;
                        ctx.globalAlpha = a;
                        ctx.beginPath(); ctx.moveTo(u, y - s); ctx.lineTo(u + s * 0.7, y); ctx.lineTo(u, y + s); ctx.lineTo(u - s * 0.7, y); ctx.closePath(); ctx.fill();
                    }
                    // pressing into it (moving, right at the edge): a ripple sets off along the seam
                    const st = this._edgeTouch || (this._edgeTouch = {});
                    const last = st[id], moved = last && Math.hypot(fu - last.u, fn - last.n) > 0.2;
                    st[id] = { u: fu, n: fn };
                    const R = this._edgeRipples || (this._edgeRipples = []);
                    if (fn < 26 && moved && t - (st[id + 'T'] || -9) > E.RIPPLE_EVERY && R.length < 6) { R.push({ id, u: fu, t0: t }); st[id + 'T'] = t; }
                }
                const R = this._edgeRipples;
                if (R && R.length) for (let i = R.length - 1; i >= 0; i--) {
                    const r = R[i], age = t - r.t0;
                    if (age > E.RIPPLE_LIFE || age < 0) { R.splice(i, 1); continue; }
                    if (r.id !== id) continue;
                    const k = 1 - age / E.RIPPLE_LIFE, d = 20 + age * E.RIPPLE_SPEED;
                    ctx.globalAlpha = 0.55 * k * k; drawGlow(ctx, r.u, 0, 40 + 40 * (1 - k), '214, 196, 255', 0);
                    ctx.globalAlpha = 0.85 * k;
                    drawGlow(ctx, r.u - d, 0, 22, '241, 232, 254', 0.3); drawGlow(ctx, r.u + d, 0, 22, '241, 232, 254', 0.3);
                }
                ctx.restore();
            }
        });
