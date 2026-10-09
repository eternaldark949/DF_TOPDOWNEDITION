        // ═══ SILHOUETTE FX — her glow, and hostiles burning white in night vision ═══
        // A body is drawn once, into a small canvas round it instead of the frame, then stamped onto
        // the frame exactly where it would have gone (so nothing about it changes and nothing ticks
        // twice). The capture is its silhouette, and two effects read from it:
        //   heat  — while night vision is on, a hostile's silhouette goes over it again in white-hot,
        //           with a white bloom (draw.js sets `heat` round the enemy loop)
        //   glow  — her silhouette, tinted, is kept for after the darkness: drawPlayerGlow lays a soft
        //           halo outside her edge (only outside, so her clothes read as they are), lit by day,
        //           by night and in night vision alike
        // The contact shadow stays on the frame, outside the capture: no glow round a shadow.
        const SILHOUETTE = {
            R: 84,                          // world px captured round the body: a long gun, an umbrella, a train
            MAX_SIDE: 1600,                 // larger than this on screen (a very close camera): drawn plainly
            HEAT_RGB: '255, 252, 244',      // white-hot, a hair warm
            HEAT_ALPHA: 0.9,                // a hint of the body still shows through
            HEAT_BLUR: 10,                  // CSS px of white bloom
            GLOW_RGB: '226, 206, 255',      // her halo: pale lavender
            GLOW_ALPHA: 0.85,
            GLOW_BLUR: 9                    // CSS px the halo reaches past her edge
        };

        const SilhouetteFX = {
            heat: 0,                        // night vision's strength while hostiles draw (0: off)
            glow: false,                    // the next body drawn is hers
            _cv: {},                        // pooled canvases by slot: 'cap', 'keep', 'halo'
            _cur: null, _kept: null,

            _canvas(slot, side) {
                let cv = this._cv[slot];
                if (!cv) { cv = this._cv[slot] = document.createElement('canvas'); cv.width = cv.height = 0; }
                if (cv.width < side || cv.height < side) {           // grows only, in 64 px steps
                    const s = Math.ceil(side / 64) * 64;
                    cv.width = Math.max(cv.width, s); cv.height = Math.max(cv.height, s);
                }
                return cv;
            },

            /** Which effect, if any, the body about to be drawn takes (and the glow request is used up). */
            take(entity, config) {
                const glow = this.glow;
                this.glow = false;
                if (config._crowdBake || config.isDriving || entity._reflectionProxy) return null;
                if (glow) return 'glow';
                return this.heat > 0.01 ? 'heat' : null;
            },

            /** Start capturing a body drawn round ctx's current origin. Returns the context to draw it
             *  into, or null (draw it on ctx as usual). */
            begin(ctx, R = SILHOUETTE.R) {
                if (this._cur || typeof document === 'undefined' || !ctx.getTransform) return null;
                const M = ctx.getTransform(), s = Math.hypot(M.a, M.b);
                const half = Math.ceil(R * s), side = half * 2;
                if (!(side > 0) || side > SILHOUETTE.MAX_SIDE || !Number.isFinite(M.e) || !Number.isFinite(M.f)) return null;
                const cv = this._canvas('cap', side), g = cv.getContext('2d');
                if (!g) return null;
                const ox = Math.floor(M.e) - half, oy = Math.floor(M.f) - half;
                g.setTransform(1, 0, 0, 1, 0, 0);
                g.clearRect(0, 0, side, side);
                g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
                // This canvas stands in for the world while the body draws (as the finisher's corpse
                // snapshots do), so hair, cloth and a glass's slosh still read where it is
                const cur = this._cur = { ctx, g, cv, ox, oy, side, wm: _worldMatrix, wc: _worldCanvas };
                if (_worldMatrix && ctx.canvas === _worldCanvas) {
                    const W = _worldMatrix;
                    g.setTransform(W.a, W.b, W.c, W.d, W.e - ox, W.f - oy);
                    _worldMatrix = g.getTransform(); _worldCanvas = cv;
                }
                g.setTransform(M.a, M.b, M.c, M.d, M.e - ox, M.f - oy);
                return cur.g;
            },

            /** Stamp the captured body onto the frame, then its effect. */
            end(kind, k = 1) {
                const c = this._cur;
                if (!c) return;
                this._cur = null;
                _worldMatrix = c.wm; _worldCanvas = c.wc;
                const { ctx, g, cv, ox, oy, side } = c;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                ctx.drawImage(cv, 0, 0, side, side, ox, oy, side, side);     // the body, as drawn
                if (kind === 'heat' || kind === 'glow') {
                    // The silhouette in one colour (the capture is spent after this)
                    g.save();
                    g.setTransform(1, 0, 0, 1, 0, 0);
                    g.globalCompositeOperation = 'source-in';
                    g.fillStyle = `rgb(${kind === 'heat' ? SILHOUETTE.HEAT_RGB : SILHOUETTE.GLOW_RGB})`;
                    g.fillRect(0, 0, side, side);
                    g.restore();
                }
                if (kind === 'heat') {
                    const dpr = (typeof game !== 'undefined' && game && game._renderScale) || 1;
                    ctx.globalAlpha *= SILHOUETTE.HEAT_ALPHA * Math.min(1, k);
                    ctx.shadowColor = `rgba(${SILHOUETTE.HEAT_RGB}, 0.85)`;
                    ctx.shadowBlur = SILHOUETTE.HEAT_BLUR * dpr * Math.min(1, k);
                    ctx.drawImage(cv, 0, 0, side, side, ox, oy, side, side);
                } else if (kind === 'glow') {
                    // Kept for after the darkness (the capture canvas is reused by the next body)
                    const keep = this._canvas('keep', side), kg = keep.getContext('2d');
                    if (kg) {
                        kg.setTransform(1, 0, 0, 1, 0, 0);
                        kg.clearRect(0, 0, keep.width, keep.height);
                        kg.drawImage(cv, 0, 0, side, side, 0, 0, side, side);
                        this._kept = { x: ox, y: oy, side, alpha: ctx.globalAlpha };
                    }
                }
                ctx.restore();
            },

            /** Her halo, after the darkness: the tinted silhouette blurred outwards, its inside cut away. */
            drawGlow(ctx, dpr = 1) {
                const K = this._kept;
                this._kept = null;
                if (!K) return;
                const keep = this._cv.keep, blur = SILHOUETTE.GLOW_BLUR * dpr;
                const pad = Math.ceil(blur * 2), side = K.side + pad * 2;
                const halo = this._canvas('halo', side), h = halo.getContext('2d');
                if (!h || !keep) return;
                h.save();
                h.setTransform(1, 0, 0, 1, 0, 0);
                h.clearRect(0, 0, side, side);
                // Only the shadow lands on the canvas: the image itself is drawn a canvas-width away
                const away = side * 2;
                h.shadowColor = `rgba(${SILHOUETTE.GLOW_RGB}, 1)`;
                h.shadowBlur = blur; h.shadowOffsetX = away; h.shadowOffsetY = 0;
                h.drawImage(keep, 0, 0, K.side, K.side, pad - away, pad, K.side, K.side);
                h.drawImage(keep, 0, 0, K.side, K.side, pad - away, pad, K.side, K.side);   // twice: brighter at her edge
                h.shadowBlur = 0; h.shadowOffsetX = 0; h.shadowColor = 'rgba(0,0,0,0)';
                h.globalCompositeOperation = 'destination-out';
                h.drawImage(keep, 0, 0, K.side, K.side, pad, pad, K.side, K.side);
                h.restore();
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = SILHOUETTE.GLOW_ALPHA * K.alpha;
                ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                ctx.drawImage(halo, 0, 0, side, side, K.x - pad, K.y - pad, side, side);
                ctx.restore();
            }
        };
