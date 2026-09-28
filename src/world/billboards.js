        /* =====================================================================
           BILLBOARDS — your artwork on tilted A-frame panels around the city
           ---------------------------------------------------------------------
           A panel stands on its front (south) edge and leans back toward the sky,
           so the picture always reads upright on screen, with the same
           lean perspective as the buildings (a point at height z draws at
           cam + (p - cam) * CAM_HEIGHT / (CAM_HEIGHT - z)). At night spotlights
           on the front edge light it up.

           Add one by copying a line below:
             map     which map it's on ('hub_949' is the city)
             x, y    centre of the panel's front (bottom) edge, in world px;
                     the picture extends north (up the screen) from there
             w       panel width in world px (the height follows the picture)
             image   an image name from assets/images (see assets/images/README.md)
             frame   frame colour; light: colour of the night spotlights
           ===================================================================== */
        const BILLBOARDS = [
            { map: 'hub_949', x: 560, y: 1610, w: 150, image: 'posters/anavia',             frame: '#e8c27a', light: '#ffd9a0' },
            { map: 'hub_949', x: 890, y: 900,  w: 150, image: 'posters/art_builds_freedom', frame: '#c9a46a', light: '#d9c2ff' },
        ];

        class Billboard {
            constructor(cfg) {
                Object.assign(this, { w: 150, lift: 10, frame: '#e8c27a', light: '#ffd9a0' }, cfg);
                this.R = [1, 0]; this.U = [0, -1];                    // picture's right = east, picture's up = north
                const img = typeof ASSETS !== 'undefined' && ASSETS.images[this.image] ? getImage(this.image) : null;
                this.img = img;
                this._size(1.3);                                      // until the picture has decoded
                this._fit();
            }

            _size(aspect) {                                           // aspect = picture height / width
                this.depth = this.w * aspect;                         // how far back the panel reaches on the ground
                this.rise = Math.min(60, this.depth * 0.32);          // how high its back edge stands
                const pts = [this._ground(-0.5, 0), this._ground(0.5, 0), this._ground(-0.5, 1), this._ground(0.5, 1)];
                const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
                this.bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
            }

            _fit() {                                                  // match the panel to the picture once it has loaded
                if (this._fitted || !this.img || !this.img.naturalWidth) return;
                this._fitted = true;
                this._size(this.img.naturalHeight / this.img.naturalWidth);
            }

            /** Ground-plane point: s across the width (-0.5..0.5), t from the front edge (0) to the back (1). */
            _ground(s, t) {
                return [this.x + this.R[0] * s * this.w + this.U[0] * t * this.depth,
                        this.y + this.R[1] * s * this.w + this.U[1] * t * this.depth];
            }

            /** Projected point on the panel face at (s, t), or at an explicit height z. */
            _P(s, t, z) {
                const B = CONFIG.BUILDINGS, cam = game.camera, g = this._ground(s, t);
                const zz = z != null ? z : this.lift + t * this.rise;
                const k = B.CAM_HEIGHT / (B.CAM_HEIGHT - Math.min(zz, B.CAM_HEIGHT * 0.86));
                return [cam.x + (g[0] - cam.x) * k, cam.y + (g[1] - cam.y) * k];
            }

            inView(cb) {
                const m = 220, b = this.bounds;
                return !(b.x + b.w + m < cb.left || b.x - m > cb.right || b.y + b.h + m < cb.top || b.y - m > cb.bottom);
            }

            /** Solid legs, so you can't walk through the frame. */
            colliders() {
                return [[-0.46, 0], [0.46, 0], [-0.46, 1], [0.46, 1]].map(([s, t]) => {
                    const [gx, gy] = this._ground(s, t);
                    return new StaticEntity({ x: gx - 4, y: gy - 4, width: 8, height: 8, type: 'billboard', data: { color: '#222', label: 'Billboard' } });
                });
            }

            _quad(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

            /** The picture mapped onto the leaning panel in thin strips (each strip is an affine patch). */
            _drawPicture(ctx) {
                const img = this.img, iw = img.naturalWidth, ih = img.naturalHeight, N = _zoomLOD >= 1 ? 10 : 22;
                for (let i = 0; i < N; i++) {
                    const t0 = i / N, t1 = (i + 1) / N;                // t0 = nearer the front edge = bottom of the picture
                    const TL = this._P(-0.5, t1), TR = this._P(0.5, t1), BL = this._P(-0.5, t0);
                    const sy = ih * (1 - t1), sh = ih / N;
                    ctx.save();
                    ctx.transform((TR[0] - TL[0]) / iw, (TR[1] - TL[1]) / iw, (BL[0] - TL[0]) / sh, (BL[1] - TL[1]) / sh, TL[0], TL[1]);
                    ctx.drawImage(img, 0, sy, iw, sh, 0, -0.4, iw, sh + 0.8);
                    ctx.restore();
                }
            }

            /** Base pass (before lighting): shadow, legs, panel, picture, frame. */
            drawTop(ctx) {
                if (!game.camera) return;
                this._fit();
                const top = this.lift + this.rise;
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.28)';                   // soft shadow under the panel
                this._quad(ctx, [this._ground(-0.5, 0), this._ground(0.5, 0), this._ground(0.5, 1.08), this._ground(-0.5, 1.08)]); ctx.fill();
                ctx.strokeStyle = '#3a3542'; ctx.lineWidth = 3; ctx.lineCap = 'round';   // steel legs
                for (const s of [-0.46, 0.46]) {
                    const b0 = this._P(s, 1, 0), b1 = this._P(s, 1, top), f0 = this._P(s, 0, 0), f1 = this._P(s, 0, this.lift);
                    ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.stroke();
                }
                const face = [this._P(-0.5, 0), this._P(0.5, 0), this._P(0.5, 1), this._P(-0.5, 1)];
                ctx.fillStyle = '#16121f'; this._quad(ctx, face); ctx.fill();
                if (this.img && this.img.naturalWidth) {
                    ctx.save(); this._quad(ctx, face); ctx.clip(); this._drawPicture(ctx); ctx.restore();
                }
                ctx.strokeStyle = this.frame; ctx.lineWidth = 3; this._quad(ctx, face); ctx.stroke();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; this._quad(ctx, face); ctx.stroke();
                const l0 = this._P(-0.52, -0.05, this.lift), l1 = this._P(0.52, -0.05, this.lift);   // spotlight rail on the front edge
                ctx.strokeStyle = '#2a2530'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke();
                ctx.restore();
            }

            /** Night pass (after lighting): spotlights washing up the picture. */
            drawEmissive(ctx, dark) {
                if (!game.camera || dark < 0.05 || !this.img || !this.img.naturalWidth) return;
                const a = Math.min(1, dark * 1.2), rgb = hexToRgb(this.light);
                const face = [this._P(-0.5, 0), this._P(0.5, 0), this._P(0.5, 1), this._P(-0.5, 1)];
                ctx.save();
                this._quad(ctx, face); ctx.clip();
                ctx.globalAlpha = 0.55 * a; this._drawPicture(ctx);   // the lit picture over the darkness
                ctx.globalCompositeOperation = 'lighter';
                const lamps = _zoomLOD >= 2 ? [0] : [-0.36, -0.12, 0.12, 0.36];
                for (const s of lamps) {                              // cones of light fanning up the panel
                    const p0 = this._P(s, 0), p1 = this._P(s, 0.75), r = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
                    const g = ctx.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], r);
                    g.addColorStop(0, `rgba(${rgb},${0.28 * a})`); g.addColorStop(1, `rgba(${rgb},0)`);
                    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p0[0], p0[1], r, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const s of lamps) {                              // the lamp heads themselves
                    const p = this._P(s, -0.05, this.lift + 2);
                    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 9);
                    g.addColorStop(0, `rgba(${rgb},${0.9 * a})`); g.addColorStop(1, `rgba(${rgb},0)`);
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
        }

