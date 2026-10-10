        // Shared immutable falloff tables; softArea only reads these stops.
        const HOLE_AREA = [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']];
        const HOLE_AREA_SOFT = [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.85)'], [0.7, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']];   // long, gentle edge
        // One warm, wide falloff reused for the fireball and its dying flame stream.
        let _fireballLightSprite = null;
        function _getFireballLightSprite() {
            if (_fireballLightSprite) return _fireballLightSprite;
            const cv = document.createElement('canvas'); cv.width = cv.height = 256;
            const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
            g.addColorStop(0, 'rgba(255, 177, 65, 1)');
            g.addColorStop(0.12, 'rgba(255, 151, 36, 0.96)');
            g.addColorStop(0.35, 'rgba(255, 112, 20, 0.68)');
            g.addColorStop(0.64, 'rgba(255, 83, 12, 0.27)');
            g.addColorStop(1, 'rgba(255, 70, 8, 0)');
            c.fillStyle = g; c.fillRect(0, 0, 256, 256);
            return (_fireballLightSprite = cv);
        }

        // GameEngine — Lighting, bloom, wet reflections, atmosphere.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /**
             * Clip the light canvas to what a headlight beam can reach: a visibility polygon cast
             * from where the beam's edges meet (just behind the bumper), ignoring anything nearer
             * than the bumper, so buildings and walls cast the beam's shadow. Cached per vehicle.
             */
            _clipBeam(ctx, owner, cx, cy, beamLength, beamWidth) {
                const a = owner.angle, slope = Math.max(0.05, (beamWidth - 15) / beamLength);
                const back = 15 / slope, half = Math.atan(slope) + 0.02;
                const c = owner._beamCache, tick = _simTick;
                let poly, dx = 0, dy = 0;
                const same = c && c.L === beamLength && c.map === this.activeMap;
                if (same && Math.abs(c.x - cx) < 1.5 && Math.abs(c.y - cy) < 1.5 && Math.abs(c.a - a) < 0.01) poly = c.poly;
                // A moving car: reuse its last shape (slid along with it) for a couple of ticks
                else if (same && tick - c.tick < 3 && Math.hypot(c.x - cx, c.y - cy) < 30 && Math.abs(c.a - a) < 0.08) { poly = c.poly; dx = cx - c.x; dy = cy - c.y; }
                else {
                    const ax = cx - Math.cos(a) * back, ay = cy - Math.sin(a) * back;
                    poly = computeVisibilityPoly(ax, ay, beamLength + back, getOccluders(this.activeMap),
                        { aMin: a - half, aMax: a + half, arcStep: 0.1, minDist: back });
                    poly.ax = ax; poly.ay = ay;
                    owner._beamCache = { x: cx, y: cy, a, L: beamLength, map: this.activeMap, poly, tick };
                }
                ctx.beginPath(); ctx.moveTo(poly.ax + dx, poly.ay + dy);
                for (const pt of poly) ctx.lineTo(pt.x + dx, pt.y + dy);
                ctx.closePath(); ctx.clip();
            },

            /** A headlight beam, pre-rendered once per colour and size: fades along its length and toward its edges. */
            _beamSprite(color, L, W) {
                const cache = this._beamSprites || (this._beamSprites = new Map());
                const key = color + '|' + L + '|' + W;
                let cv = cache.get(key);
                if (cv) return cv;
                const S = 0.5, rgb = /^#[0-9a-f]{6}$/i.test(color) ? hexToRgb(color) : '255, 255, 220';
                cv = document.createElement('canvas'); cv.width = Math.ceil(L * S); cv.height = Math.ceil(2 * W * S);
                const c = cv.getContext('2d');
                c.scale(S, S); c.translate(0, W);
                const along = c.createLinearGradient(0, 0, L, 0);
                along.addColorStop(0, `rgba(${rgb}, 1)`); along.addColorStop(1, `rgba(${rgb}, 0)`);
                c.fillStyle = along; c.beginPath();
                c.moveTo(0, -15); c.lineTo(L, -W); c.lineTo(L, W); c.lineTo(0, 15); c.fill();
                c.globalCompositeOperation = 'destination-in';                 // softer toward the edges
                const across = c.createLinearGradient(0, -W, 0, W);
                across.addColorStop(0, 'rgba(0,0,0,0.3)'); across.addColorStop(0.5, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0.3)');
                c.fillStyle = across; c.fillRect(0, -W, L, 2 * W);
                cache.set(key, cv);
                return cv;
            },

            /** Stamp one headlight beam (clipped by walls and buildings) into the light layer. */
            _drawBeam(b) {
                const ctx = this.lightCtx;
                ctx.save();
                this._clipBeam(ctx, b.owner, b.cx, b.cy, b.L, b.W);
                ctx.translate(b.cx, b.cy); ctx.rotate(b.owner.angle);
                ctx.drawImage(this._beamSprite(b.color, b.L, b.W), 0, -b.W, b.L, 2 * b.W);
                ctx.restore();
            },

            /** Firelight follows the same opaque walls/buildings as vehicle headlights. */
            _clipFireLight(ctx, owner, x, y, r) {
                const map = this.activeMap, revision = map._renderSpatialRevision || 0;
                // Runtime geometry edits invalidate the joined obstacle list as well as the clip.
                if (map._fireLightOccluderRevision !== revision) { map._occluderCache = null; map._fireLightOccluderRevision = revision; }
                const occluders = getOccluders(map);
                let cached = owner._fireLightClip;
                if (!cached || cached.map !== map || cached.occluders !== occluders || cached.revision !== revision ||
                    cached.x !== x || cached.y !== y || cached.r !== r) {
                    const poly = computeVisibilityPoly(x, y, r, occluders, { aMin: 0, aMax: Math.PI * 2, arcStep: 0.18 });
                    const path = new Path2D();
                    if (poly.length) {
                        path.moveTo(poly[0].x, poly[0].y);
                        for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
                        path.closePath();
                    }
                    cached = owner._fireLightClip = { map, occluders, revision, x, y, r, path };
                }
                ctx.clip(cached.path);
            },

            /** Broad live firelight, with a bounded set of fading pools along the stream. */
            _drawFireLights(ctx, mode, inView, gain = 1) {
                const now = _gameTimeMs(), sprite = _getFireballLightSprite(), color = mode === 'color';
                const stamp = (owner, x, y, r, strength) => {
                    if (!Number.isFinite(x) || !Number.isFinite(y) || strength <= 0.01 || !inView(x, y, r)) return;
                    ctx.save();
                    this._clipFireLight(ctx, owner, x, y, r);
                    ctx.globalAlpha = Math.min(1, strength * gain);
                    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
                    ctx.restore();
                };
                for (const p of this.projectiles) {
                    if (!p.isFireball || p.active === false || p.visible === false || p.dead || p.markedForDestroy || p.life <= 0 ||
                        !Number.isFinite(p.vx) || !Number.isFinite(p.vy) || p.vx * p.vx + p.vy * p.vy < 0.0001) continue;
                    const pulse = 0.96 + 0.04 * Math.sin(now * 0.023 + (p.id || 0));
                    stamp(p, p.x, p.y, FIREBALL_LIGHT_RADIUS, (color ? 0.32 : 0.98) * pulse);
                }
                const trail = this._fireTrail || [], cells = this._fireCells || (this._fireCells = new Set());
                cells.clear();   // (one reused set, numeric cell keys: no strings or sets per pass)
                let lit = 0;
                for (let i = trail.length - 1; i >= 0 && lit < 48; i--) {
                    const p = trail[i], f = Math.max(0, Math.min(1, 1 - (now - p.born) / p.life));
                    if (f <= 0.02 || !inView(p.x, p.y, FIRE_TRAIL_LIGHT_RADIUS)) continue;
                    // Flames are dense; one pool per 40px cell gives a continuous wash without hundreds of raycasts.
                    const cell = Math.floor(p.x / 40) * 100003 + Math.floor(p.y / 40);
                    if (cells.has(cell)) continue;
                    cells.add(cell); lit++;
                    const fade = Math.pow(f, 1.35), flicker = 0.90 + 0.10 * Math.sin(now * 0.034 + (p.seed || 0) * 7);
                    stamp(p, p.x, p.y, FIRE_TRAIL_LIGHT_RADIUS, (color ? 0.14 : 0.58) * fade * flicker);
                }
            },

            /** Warm orange spill also reads by day or in a map with no ambient-darkness layer. */
            drawFireLightGlow(ctx) {
                if (!this.projectiles.some(p => p.isFireball) && !(this._fireTrail && this._fireTrail.length)) return;
                const V = this.view || this.camera, x = V.x, y = V.y;
                const zoom = V.zoom || this.camera.zoom;
                const hw = this.canvas.width / (2 * zoom), hh = this.canvas.height / (2 * zoom);
                const inView = (px, py, r) => px + r > x - hw && px - r < x + hw && py + r > y - hh && py - r < y + hh;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                this._drawFireLights(ctx, 'color', inView, 0.38 * (1 - 0.70 * this.getAmbientDarkness()));
                ctx.restore();
            },

            /**
             * Interior lights (building interiors on the city map) are static, and so are the
             * walls that shadow them: bake each one's light — minus its wall shadows — once, into
             * a hole sprite and a colour sprite. Each light only ever shadows its own light.
             */
            _interiorLightSprites(lamp, segs) {
                if (lamp._sprites) return lamp._sprites;
                const R = Math.max(lamp.radius, lamp.colorRadius || 0), S = 0.5, size = Math.max(2, Math.ceil(2 * R * S));
                const wedges = new Path2D(), ext = lamp.radius * 1.2;
                for (const seg of segs) {
                    const d1 = Math.hypot(seg.x1 - lamp.x, seg.y1 - lamp.y), d2 = Math.hypot(seg.x2 - lamp.x, seg.y2 - lamp.y);
                    if (d1 > lamp.radius * 1.5 && d2 > lamp.radius * 1.5) continue;
                    const a1 = Math.atan2(seg.y1 - lamp.y, seg.x1 - lamp.x), a2 = Math.atan2(seg.y2 - lamp.y, seg.x2 - lamp.x);
                    wedges.moveTo(seg.x1, seg.y1);
                    wedges.lineTo(lamp.x + Math.cos(a1) * ext, lamp.y + Math.sin(a1) * ext);
                    wedges.lineTo(lamp.x + Math.cos(a2) * ext, lamp.y + Math.sin(a2) * ext);
                    wedges.lineTo(seg.x2, seg.y2); wedges.closePath();
                }
                const bake = paint => {
                    const cv = document.createElement('canvas'); cv.width = cv.height = size;
                    const c = cv.getContext('2d');
                    c.scale(S, S); c.translate(R - lamp.x, R - lamp.y);
                    paint(c);
                    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.fill(wedges);
                    return cv;
                };
                const hole = bake(c => {
                    const g = c.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius);
                    g.addColorStop(0, `rgba(255, 255, 255, ${lamp.intensity})`); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    c.fillStyle = g; c.beginPath(); c.arc(lamp.x, lamp.y, lamp.radius, 0, Math.PI * 2); c.fill();
                });
                const color = bake(c => {
                    const g = c.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.colorRadius);
                    g.addColorStop(0, '#ffffff'); g.addColorStop(0.1, lamp.color); g.addColorStop(0.6, lamp.color); g.addColorStop(1, 'rgba(0,0,0,0)');
                    c.fillStyle = g; c.beginPath(); c.arc(lamp.x, lamp.y, lamp.colorRadius, 0, Math.PI * 2); c.fill();
                });
                return (lamp._sprites = { hole, color, x: lamp.x - R, y: lamp.y - R, d: 2 * R });
            },

            /* =====================================================================
               LIGHTING — the darkness layer
               ---------------------------------------------------------------------
               An offscreen layer filled with the colour of the dark (violet-indigo at
               night, gold at dusk, rose at dawn: dayCycle), then light holes cut into
               it (lamps, soft lights, windows, headlights, shots), then light colour
               added, then laid over the scene at the ambient darkness.
               Static lights are cached: lamp shadow shapes (Path2D) and gradients,
               interior lights baked into sprites, headlight beams as sprites.
               Soft shadows render the layer at half resolution and blur that.
               ===================================================================== */
            /** Keep the original stable full sort for small or unusual inputs. For a wide
             * view, retain only the nearest budget of lamps, with original-order ties. */
            _selectLightingLamps(lamps, limit, heap, nearest) {
                heap.length = nearest.length = 0;
                const n = lamps.length;
                if (!Number.isInteger(limit) || limit <= 0 || limit >= n || n <= 64 || n <= limit * 2 ||
                    lamps.some(lamp => !Number.isFinite(lamp._distSq))) {
                    lamps.sort((a, b) => a._distSq - b._distSq);
                    return lamps;
                }
                const compare = (i, j) => lamps[i]._distSq - lamps[j]._distSq || i - j;
                // A max-heap: its root is the farthest retained lamp (latest on a tie).
                for (let i = 0; i < n; i++) {
                    if (heap.length < limit) {
                        let child = heap.length;
                        heap.push(i);
                        while (child > 0) {
                            const parent = (child - 1) >> 1;
                            if (compare(heap[parent], i) >= 0) break;
                            heap[child] = heap[parent]; child = parent;
                        }
                        heap[child] = i;
                    } else if (compare(i, heap[0]) < 0) {
                        let parent = 0;
                        while (parent * 2 + 1 < heap.length) {
                            let child = parent * 2 + 1;
                            if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child++;
                            if (compare(i, heap[child]) >= 0) break;
                            heap[parent] = heap[child]; parent = child;
                        }
                        heap[parent] = i;
                    }
                }
                heap.sort(compare);
                for (const i of heap) nearest.push(lamps[i]);
                return nearest;
            },

            /** Scratch records never retain a map's lights or vehicles between frames. */
            _releaseLightingScratch(scratch) {
                for (const b of scratch.beams) b.owner = null;
                for (const s of scratch.softLights) s.src = null;
                for (const g of scratch.propGlows) g.p = null;
                scratch.iVisible.length = scratch.litLamps.length = scratch.visibleLamps.length = 0;
                scratch.beams.length = scratch.softLights.length = scratch.propGlows.length = 0;
                scratch.lampHeap.length = scratch.nearestLamps.length = scratch.parked.length = 0;
                scratch.cars.clear();
                // Bound the retained empty records even after exceptionally crowded views.
                if (scratch.beamPool.length > 64) scratch.beamPool.length = 64;
                if (scratch.softPool.length > 512) scratch.softPool.length = 512;
                if (scratch.propPool.length > 128) scratch.propPool.length = 128;
                scratch.busy = false;
            },

            /** Only the already-soft outdoor light layer can change resolution. Trials are
             * rare and bounded (80% per axis), and stay only when both frame cadence and
             * measured light submission improve. This is not a GPU-completion timer.
             * Photos, cinematics, benchmarks, interiors and manual sharp shadows use full
             * selected fidelity; the main canvas, people, particles and UI never resize. */
            _lightingAdaptiveScale() {
                const eligible = GameSettings.adaptiveLighting && GameSettings.softShadows && this.running &&
                    !this.paused && !this.cineCam && !this.cutscene?.active && !this.scenes?.running &&
                    !PerfBench.active && !this.showProfiler && !GameSettings.baseline && !document.hidden &&
                    this.activeMap?.type === 'outdoor' && !this.nightVision;
                // A lightning flash pauses measuring (its frames aren't typical); it doesn't reset the state.
                // Nor does the zoom's lamp budget: crossing a zoom step mustn't throw the light layer back to full.
                const flashing = this.weather?.lightningFlash > 0.01;
                const baseScale = this.lightingScale, renderScale = this._renderScale || 1;
                const fpsLimit = GameSettings.fpsLimit;
                const now = eligible ? performance.now() : 0;
                let s = this._adaptiveLighting;
                if (!s || s.map !== this.activeMap || s.baseScale !== baseScale || s.renderScale !== renderScale ||
                    s.fpsLimit !== fpsLimit || s.eligible !== !!eligible || (eligible && now - s.last > 800)) {
                    s = this._adaptiveLighting = { map: this.activeMap, baseScale, renderScale, fpsLimit,
                        key: `${baseScale}:${renderScale}:${fpsLimit}`, eligible: !!eligible, factor: 1, mode: 'full',
                        last: now, begin: now + 1000, cooldown: now + 3000, count: 0, frames: 0, lights: 0,
                        baselineFrame: 0, baselineLight: 0, stable: 0,
                        backoff: s && s.backoff || 15000 };   // (remembered: how long to wait after giving reduced back)
                }
                s.flashing = flashing;
                if (eligible) s.last = now;
                return s.factor;
            },

            _sampleAdaptiveLighting(lightMs, now) {
                const s = this._adaptiveLighting, frameMs = this._renderFrameMs;
                if (!s?.eligible || s.flashing || !Number.isFinite(lightMs) || !Number.isFinite(frameMs) ||
                    frameMs < 2 || frameMs > 100 || now < s.begin) return;
                s.frames += frameMs; s.lights += lightMs; s.count++;
                if (now - s.begin < 3000 || s.count < 12) return;
                const frame = s.frames / s.count, light = s.lights / s.count;
                const target = 1000 / (GameSettings.fpsLimit > 0 ? Math.min(60, GameSettings.fpsLimit) : 60);
                s.begin = now; s.count = s.frames = s.lights = 0;
                if (s.mode === 'trial') {
                    if (frame < s.baselineFrame * 0.95 && light < s.baselineLight * 0.92) {
                        s.mode = 'reduced'; s.stable = 0; s.cooldown = now + 15000;
                    } else {
                        s.factor = 1; s.mode = 'full'; s.cooldown = now + 30000;
                    }
                    s.begin = now + 500;   // ignore buffer rebuilds when entering either state
                } else if (s.mode === 'reduced') {
                    s.stable = frame <= target * 1.06 ? s.stable + 1 : 0;
                    if (s.stable >= 3 && now >= s.cooldown) {
                        // Back to full; if it needs reducing again, the next trial waits twice as long (up to 4 min),
                        // so a borderline phone settles instead of flipping resolution every half minute
                        s.factor = 1; s.mode = 'full'; s.cooldown = now + s.backoff; s.begin = now + 500;
                        s.backoff = Math.min(240000, s.backoff * 2);
                    }
                } else if (now >= s.cooldown && frame > target * 1.18 && light > 2.5) {
                    s.baselineFrame = frame; s.baselineLight = light;
                    s.factor = 0.8; s.mode = 'trial'; s.stable = 0; s.begin = now + 500;
                }
            },

            drawLightingSystem(ctx) {
                this._lightingAdaptiveScale();
                const ambient = this.getAmbientDarkness();
                const flash = this.weather.lightningFlash > 0 ? this.weather.lightningFlash : 0;
                // Maintain the shadow opacity (ambient), fading it as night vision turns on; lightning lifts it
                const finalOpacity = ambient * (1.0 - this.nvIntensity) * (1 - 0.8 * flash);
                
                // Optimization: If shadows are invisible and we don't need the NV boost, stop.
                if (finalOpacity <= 0.01 && !this.nightVision) return;

                let scratch = this._lightingScratch;
                if (!scratch || scratch.busy) {
                    scratch = { iVisible: [], litLamps: [], visibleLamps: [], beams: [], softLights: [], propGlows: [],
                        lampHeap: [], nearestLamps: [], beamPool: [], softPool: [], propPool: [], cars: new Set(), parked: [], busy: false };
                    // A reentrant render receives its own buffers while the outer frame is using its pools.
                    if (!this._lightingScratch) this._lightingScratch = scratch;
                }
                scratch.busy = true;
                const sample = this._adaptiveLighting.eligible && ((this._renderDrawId & 7) === 0);
                const started = sample ? performance.now() : 0;
                try {
                    this._renderLightingSystem(ctx, ambient, flash, finalOpacity, scratch);
                } finally {
                    this._releaseLightingScratch(scratch);
                    if (sample) { const now = performance.now(); this._sampleAdaptiveLighting(now - started, now); }
                }
            },

            _renderLightingSystem(ctx, ambient, flash, finalOpacity, scratch) {
                // Layer resolution: lighting quality, halved for soft shadows (the upscale softens edges)
                const LS = this.lightingScale * (GameSettings.softShadows ? 0.5 : 1) * (this._adaptiveLighting?.factor || 1);
                const lw = Math.max(1, Math.round(this.canvas.width * LS)), lh = Math.max(1, Math.round(this.canvas.height * LS));
                if (this.lightCanvas.width !== lw || this.lightCanvas.height !== lh) { this.lightCanvas.width = lw; this.lightCanvas.height = lh; }
                const lc = this.lightCtx;
                const rs = this.roomSystem, rsOn = rs && rs.active;
                const dc = this.dayCycle();
                
                // 1. CLEAR BUFFER
                lc.clearRect(0, 0, lw, lh);
                lc.save();
                lc.scale(LS, LS);
            
                // 2. CAMERA TRANSFORM (SYNCED WITH MAIN RENDERER)
                const V = this.viewTransform(lc), camX = V.x, camY = V.y;   // the frame's one view (draw.js)
                
                // The view, at the actual zoom (lights are culled by their own reach)
                const halfW = (this.canvas.width / 2) / this.camera.zoom, halfH = (this.canvas.height / 2) / this.camera.zoom;
                const vL = camX - halfW, vR = camX + halfW, vT = camY - halfH, vB = camY + halfH;
                const inView = (x, y, r) => x + r > vL && x - r < vR && y + r > vT && y - r < vB;
                const lightViewMargin = 200;
                const visLeft   = Math.max(0, vL - lightViewMargin);
                const visTop    = Math.max(0, vT - lightViewMargin);
                const visRight  = Math.min(this.activeMap.width, vR + lightViewMargin);
                const visBottom = Math.min(this.activeMap.height, vB + lightViewMargin);
            
                // 3. THE DARK — tinted: the hour's colour outdoors, night's violet-indigo indoors
                const tint = this.activeMap.type === 'indoor' ? '22, 10, 48' : dc.tintRGB;
                lc.fillStyle = `rgb(${tint})`;
                lc.fillRect(visLeft, visTop, visRight - visLeft, visBottom - visTop);
                // Outdoor rooms (a veranda) carry the sky's light
                if (rsOn) rs.carveSkyLight(lc, ambient, dc.darkness);
            
                // 3b. INTERIOR LIGHTS (buildings on the city map) — baked sprites, each with its own wall shadows
                const iLights = this.activeMap._interiorLights;
                const iVisible = scratch.iVisible;
                if (iLights && iLights.length > 0) {
                    const iSegsByLevel = this.activeMap._interiorShadowSegs || {};
                    lc.globalCompositeOperation = 'destination-out';
                    for (const lamp of iLights) {
                        if (!inView(lamp.x, lamp.y, lamp.radius)) continue;
                        const sp = this._interiorLightSprites(lamp, iSegsByLevel[lamp.level] || []);
                        lc.drawImage(sp.hole, sp.x, sp.y, sp.d, sp.d);
                        iVisible.push(lamp);
                    }
                }
            
                // 4. STREET AND ROOM LAMPS — cached shadow shapes and gradients, nearest first within the budget
                lc.globalCompositeOperation = 'destination-out';
                const litLamps = scratch.litLamps;
                if (this.lightingBaked) {
                    const visibleLamps = scratch.visibleLamps;
                    for (const entry of this._queryLampCandidates({ left: vL, right: vR, top: vT, bottom: vB }, 'lampLighting')) {
                        const lamp = entry.item;
                        if (!inView(lamp.x, lamp.y, lamp.radius)) continue;
                        if (!lamp._shadowPoly || lamp._shadowPoly.length === 0) continue;
                        // Room switches fade lamps; a faulty street lamp stutters now and then
                        const k = (rsOn ? rs.lampLight(lamp) : 1) * lampFlicker(lamp) * lampWake(lamp) * (lamp.intensity ?? 1);
                        if (k < 0.01) continue;
                        lamp._litK = k;
                        const dx = lamp.x - camX, dy = lamp.y - camY;
                        lamp._distSq = dx * dx + dy * dy;
                        visibleLamps.push(lamp);
                    }
                    const nearest = this._selectLightingLamps(visibleLamps, this._maxLitLamps, scratch.lampHeap, scratch.nearestLamps);
                    for (const lamp of nearest) {
                        if (litLamps.length >= this._maxLitLamps) break;
                        const poly = lamp._shadowPoly;
                        if (lamp._shadowPathOf !== poly) {
                            const path = new Path2D();
                            path.moveTo(poly[0].x, poly[0].y);
                            for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
                            path.closePath();
                            lamp._shadowPath = path; lamp._shadowPathOf = poly;
                        }
                        if (!lamp._holeGrad || lamp._holeGradX !== lamp.x || lamp._holeGradY !== lamp.y || lamp._holeGradRadius !== lamp.radius) {
                            const g = lc.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius);
                            g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                            lamp._holeGrad = g; lamp._holeGradX = lamp.x; lamp._holeGradY = lamp.y; lamp._holeGradRadius = lamp.radius;
                        }
                        lc.globalAlpha = Math.min(1, lamp._litK);
                        lc.fillStyle = lamp._holeGrad;
                        lc.fill(lamp._shadowPath);
                        litLamps.push(lamp);
                    }
                    lc.globalAlpha = 1;
                }
            
                // 5. DYNAMIC HOLES — shots and muzzle flashes light softly around them
                const white = glowSprite('255, 255, 255', 0.3);
                for (const p of this.projectiles) if (!p.isFireball && inView(p.x, p.y, 50)) lc.drawImage(white, p.x - 50, p.y - 50, 100, 100);
                this._drawFireLights(lc, 'hole', inView);
                for (const f of this.muzzleFlashes) {
                    const r = f.radius * 1.6;
                    if (inView(f.x, f.y, r)) lc.drawImage(white, f.x - r, f.y - r, r * 2, r * 2);
                }
                // Reflections in the wet street lift the dark where they shine (engine/reflections.js)
                this.liftReflections(lc, lw, lh);
            
                // Laser Sight beam cuts through darkness (same geometry as the visible beam)
                const lsGeom = this.getLaserSight();
                if (lsGeom) {
                    lc.strokeStyle = 'rgba(255, 50, 0, 0.45)';
                    lc.lineWidth = 3;
                    lc.beginPath(); lc.moveTo(lsGeom.x0, lsGeom.y0); lc.lineTo(lsGeom.x1, lsGeom.y1); lc.stroke();
                    lc.beginPath(); lc.arc(lsGeom.x1, lsGeom.y1, 8, 0, Math.PI * 2);
                    lc.fillStyle = 'rgba(255, 50, 0, 0.4)'; lc.fill();
                }
            
                // Headlights: the player's car, hers standing with the lights left on, up to six in traffic, bumper cars
                const beams = scratch.beams;
                const beamOf = (owner, stat, color, haze) => {
                    const off = owner.length / 2;
                    const b = scratch.beamPool[beams.length] || (scratch.beamPool[beams.length] = {});
                    beams.push(b);   // register before reading source fields, so finally can always release it
                    b.owner = owner; b.cx = owner.x + Math.cos(owner.angle) * off; b.cy = owner.y + Math.sin(owner.angle) * off;
                    b.L = stat * 6; b.W = stat * 1.5; b.color = color; b.haze = haze;
                };
                if (this.isDriving || (this.car && this.car.forceLights)) beamOf(this.car, this.car.lightRange || 60, this.car.headlightColor || '#ffffdd', this.isDriving ? 1 : 0);
                for (const v of this.parkedCars(scratch.parked)) {
                    if ((v === this.car && v.forceLights) || !carLampsOn(v) || !inView(v.x, v.y, 260)) continue;
                    beamOf(v, 40, v.headlightColor || '#ffffee', 0.7);
                }
                if (this.traffic && this.traffic.vehicles) {
                    let n = 0;
                    for (let i = 0; i < this.traffic.vehicles.length && n < 6; i++) {
                        const v = this.traffic.vehicles[i];
                        if (!v.visible || v.dead || v === this.car || !inView(v.x, v.y, 260)) continue;
                        n++; beamOf(v, 40, v.headlightColor || '#ffffee', 0.7);
                    }
                }
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    for (const car of this.bumperMinigame.cars) {
                        if (car === this.bumperMinigame.playerCar) continue;
                        beamOf(car, car.lightRange || 60, car.headlightColor || car.bodyColor || '#ffffdd', 1);
                    }
                }
                for (const b of beams) this._drawBeam(b);
                // Underglow: each pool lights its own patch of street
                if (this.traffic) {
                    const soft = glowSprite('255, 255, 255', 0.5), cars = scratch.cars;
                    for (const v of this.traffic.vehicles || []) cars.add(v);
                    if (this.car) cars.add(this.car); if (this.ownedCar) cars.add(this.ownedCar); if (this.deliveryVehicle) cars.add(this.deliveryVehicle);
                    lc.globalAlpha = 0.55;
                    for (const v of cars) {
                        if (!v.glowColor || !v.visible || v.dead || !v.length || !inView(v.x, v.y, 80)) continue;
                        lc.save(); lc.translate(v.x, v.y); lc.rotate(v.angle);
                        lc.drawImage(soft, -v.length / 2 - 16, -v.width / 2 - 16, v.length + 32, v.width + 32); lc.restore();
                    }
                    lc.globalAlpha = 1;
                }
                
                // Indoor V2: Window daylight projections (cut light through shadow)
                if (rsOn) rs.drawWindowLightProjections(lc, this._windowDaylight || 0);
                
                // Soft lights: shadowless glow holes for decor lamps, candles, fire, string lights.
                // Fixed ones come from activeMap.softLights; props with a `light` carry theirs
                // with them when pushed. Room switches fade the lights in that room.
                // (Props are walked once: lights, and vending machines / medbays.)
                const softLights = scratch.softLights, propGlows = scratch.propGlows;
                {
                    const tNow = _frameTime / 1000;
                    const push = (src, x, y) => {
                        if (!src.radius) src.radius = Math.max(src.w || 0, src.h || 0) / 2;
                        const r = src.radius || Math.max(src.w, src.h) / 2;
                        if (!inView(x, y, r)) return;
                        const k = rsOn ? rs.lightAt(x, y) : 1;
                        if (k < 0.01) return;
                        const f = src.flicker ? 0.82 + 0.18 * Math.sin(tNow * src.flicker + x * 0.7) * Math.sin(tNow * src.flicker * 0.37 + y) : 1;
                        const s = scratch.softPool[softLights.length] || (scratch.softPool[softLights.length] = {});
                        softLights.push(s);
                        s.src = src; s.x = x; s.y = y; s.r = r; s.a = (src.intensity ?? 0.8) * f * k;
                    };
                    for (const s of (this.activeMap.softLights || [])) push(s, s.x, s.y);
                    for (const p of this.props) {
                        if (p.light && p.visible !== false) { const c = p.getCenter(); push(p.light, c.x + (p.light.dx || 0), c.y + (p.light.dy || 0)); }
                        if (p.interactionType === 'medbay_refill' || p.interactionType === 'vending_machine') {
                            const c = p.getCenter();
                            if (inView(c.x, c.y, 180)) {
                                const g = scratch.propPool[propGlows.length] || (scratch.propPool[propGlows.length] = {});
                                propGlows.push(g);
                                g.p = p; g.x = c.x; g.y = c.y; g.medbay = p.interactionType === 'medbay_refill';
                            }
                        }
                    }
                }
                const softGrad = (s, key, make) => {               // gradients are reused while the light stays put
                    const src = s.src;
                    if (src[key] && src[key + 'X'] === s.x && src[key + 'Y'] === s.y) return src[key];
                    src[key + 'X'] = s.x; src[key + 'Y'] = s.y; return (src[key] = make());
                };
                // Area lights (w × h): a rounded rectangle with a soft edge. A band across the
                // middle plus two half-oval end caps that share the same falloff, so no seams.
                // stops: [[offset from the centre line 0..1, colour], …]
                const softArea = (s, key, stops) => {
                    const hw = s.src.w / 2, hh = s.src.h / 2, r = Math.min(hw, s.src.round ?? hh);
                    const x0 = s.x - hw + r, x1 = s.x + hw - r;
                    const band = softGrad(s, key + 'Band', () => {
                        const g = lc.createLinearGradient(0, s.y - hh, 0, s.y + hh);
                        for (const [o, c] of stops) { g.addColorStop(0.5 - o / 2, c); g.addColorStop(0.5 + o / 2, c); }
                        return g;
                    });
                    lc.fillStyle = band; lc.fillRect(x0, s.y - hh, x1 - x0, hh * 2);
                    const cap = s.src[key + 'Cap'] || (s.src[key + 'Cap'] = (() => {
                        const g = lc.createRadialGradient(0, 0, 0, 0, 0, 1);
                        for (const [o, c] of stops) g.addColorStop(o, c);
                        return g;
                    })());
                    for (const side of [-1, 1]) {
                        lc.save();
                        lc.beginPath(); lc.rect(side < 0 ? x0 - r : x1, s.y - hh, r, hh * 2); lc.clip();
                        lc.translate(side < 0 ? x0 : x1, s.y); lc.scale(r, hh);
                        lc.fillStyle = cap; lc.beginPath(); lc.arc(0, 0, 1, 0, Math.PI * 2); lc.fill();
                        lc.restore();
                    }
                };
                for (const s of softLights) {
                    lc.globalAlpha = Math.min(1, s.a);
                    if (s.src.w) { softArea(s, '_hole', s.src.soft ? HOLE_AREA_SOFT : HOLE_AREA); continue; }
                    lc.fillStyle = softGrad(s, '_holeGrad', () => {
                        const g = lc.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
                        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                        return g;
                    });
                    lc.beginPath(); lc.arc(s.x, s.y, s.r, 0, Math.PI * 2); lc.fill();
                }
                lc.globalAlpha = 1;

                // Vending machines and medbays glow (pulsing; they can be pushed, so sprites, not cached gradients)
                const time = _frameTime;
                const holeGlow = glowSprite('255, 255, 255', 0.4);
                for (const g of propGlows) {
                    const offset = (g.p.id || 0) * 1337;
                    const r = 170 * (g.medbay ? 1.0 + Math.sin((time + offset) / 400) * 0.05 : 1.0 + Math.sin((time + offset) / 50) * 0.02);
                    lc.drawImage(holeGlow, g.x - r, g.y - r, r * 2, r * 2);
                }
                
                if (this.activeMap.id === 'moon_city_nightclub') this.clubLightLayer(lc, 'hole');   // the dance floor, through the dark

                // Rooms she isn't in: the veil dims their pools of light (their glow stays, below)
                if (rsOn && ambient >= 0.5) { lc.globalCompositeOperation = 'source-over'; rs.drawVeil(lc, 1); }

                // 6. COLOR PASS (Lighter Blend)
                lc.globalCompositeOperation = 'lighter'; 
                const isIndoor = this.activeMap.type === 'indoor';
                const baseAlpha = (isIndoor ? 0.08 : 0.22);   // lamps read warm against the tinted night
                
                if (rsOn) rs.drawWindowColorPass(lc, this._windowDaylight || 0);

                // Interior lights' colour (baked with their wall shadows)
                for (const lamp of iVisible) {
                    const sp = lamp._sprites;
                    lc.globalAlpha = 0.08 * lamp.intensity;
                    lc.drawImage(sp.color, sp.x, sp.y, sp.d, sp.d);
                }
            
                // Lamps — the same ones lit above
                for (const l of litLamps) {
                    if (!l._cachedGrad) {
                        l._cachedGrad = lc.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
                        l._cachedGrad.addColorStop(0, '#ffffff'); l._cachedGrad.addColorStop(0.1, l.color); l._cachedGrad.addColorStop(0.6, l.color); l._cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    }
                    lc.globalAlpha = baseAlpha * Math.min(1, l._litK);
                    lc.fillStyle = l._cachedGrad; lc.beginPath(); lc.arc(l.x, l.y, l.radius, 0, Math.PI*2); lc.fill();
                }
            
                // Neon Signs — cached gradients; the odd one buzzes
                for (const s of this.neonSigns) {
                    if (!inView(s.x, s.y, 150)) continue;
                    if (!s._cachedGrad) {
                        const radius = 150;
                        s._cachedGrad = lc.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
                        s._cachedGrad.addColorStop(0, s.color); s._cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        s._cachedRadius = radius;
                    }
                    lc.globalAlpha = baseAlpha * 1.5 * lampFlicker(s);
                    lc.fillStyle = s._cachedGrad; lc.beginPath(); lc.arc(s.x, s.y, s._cachedRadius, 0, Math.PI*2); lc.fill();
                }
            
                // Vending / medbay colour
                for (const g of propGlows) {
                    const offset = (g.p.id || 0) * 1337;
                    const mod = g.medbay ? 0.9 + Math.sin((time + offset) / 400) * 0.2 : 1.0 + Math.sin((time + offset) / 50) * 0.05;
                    lc.globalAlpha = Math.min(1.0, 0.2 * mod);
                    drawGlow(lc, g.x, g.y, 180, g.medbay ? '#00ff00' : '#00f3ff', 0.3);
                }
            
                if (this.activeMap.id === 'moon_city_nightclub') this.clubLightLayer(lc, 'color');  // the floor's colour on whoever dances on it

                // Soft light colour (the warm pool each decor light casts)
                for (const s of softLights) {
                    lc.globalAlpha = Math.min(1, 0.22 * s.a);
                    if (s.src.w) { softArea(s, '_tint', [[0, s.src.color || '#ffd9b0'], [0.55, s.src.color || '#ffd9b0'], [1, 'rgba(0,0,0,0)']]); continue; }
                    lc.fillStyle = softGrad(s, '_tintGrad', () => {
                        const g = lc.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
                        g.addColorStop(0, s.src.color || '#ffd9b0'); g.addColorStop(1, 'rgba(0,0,0,0)');
                        return g;
                    });
                    lc.beginPath(); lc.arc(s.x, s.y, s.r, 0, Math.PI * 2); lc.fill();
                }

                // Fireballs and their dying flames cast a wide orange pool, not the small ordinary-shot tint.
                lc.globalAlpha = 1; this._drawFireLights(lc, 'color', inView);

                // Shots light in their own colour
                const hexOr = (c, d) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d;
                for (const p of this.projectiles) {
                    if (p.isFireball || !inView(p.x, p.y, 40)) continue;
                    lc.globalAlpha = 0.3; drawGlow(lc, p.x, p.y, 40, hexOr(p.color, '#ffd9a0'), 0.25);
                }
                for (const f of this.muzzleFlashes) {
                    const r = f.radius * 1.4;
                    if (!inView(f.x, f.y, r)) continue;
                    lc.globalAlpha = 0.45 * Math.min(1, (f.life || 3) / 3); drawGlow(lc, f.x, f.y, r, hexOr(f.color, '#ffcc88'), 0.25);
                }

                // Headlight haze, and a glow at each headlamp
                for (const b of beams) {
                    if (!b.haze) continue;
                    lc.globalAlpha = baseAlpha * b.haze;
                    this._drawBeam(b);
                    const nx = -Math.sin(b.owner.angle), ny = Math.cos(b.owner.angle), side = (b.owner.width || 22) * 0.35;
                    lc.globalAlpha = Math.min(1, baseAlpha * 2.2 * b.haze);
                    for (const sgn of [-1, 1]) drawGlow(lc, b.cx + nx * side * sgn, b.cy + ny * side * sgn, 22, hexOr(b.color, '#ffffdd'), 0.2);
                }
                lc.globalAlpha = 1;

                // 6b. LAMP SHADOWS — behind each person in a lamp's light, the dark and its colour come back (ui/humanoid-render.js)
                drawLampShadowsInto(lc, tint);

                lc.restore();
            
                // 7. RENDER TO SCREEN (UPSCALING) — soft shadows: blur the small layer, then scale it up
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0); 
                ctx.globalAlpha = finalOpacity;
                let layer = this.lightCanvas;
                if (GameSettings.softShadows) {
                    // Soft edges, the same in every browser and no ctx.filter (Safari before 18 has none): a separable
                    // box blur on the half-resolution light layer — three whole-pixel shifts across, then three down,
                    // each a third, added up. Six plain copies of a small canvas.
                    const pair = this._softCanvas || (this._softCanvas = [document.createElement('canvas'), document.createElement('canvas')]);
                    let src = this.lightCanvas;
                    for (let pass = 0; pass < 2; pass++) {
                        const cv = pair[pass];
                        if (cv.width !== lw || cv.height !== lh) { cv.width = lw; cv.height = lh; }
                        const sx = cv.getContext('2d');
                        sx.globalCompositeOperation = 'copy'; sx.globalAlpha = 1 / 3;
                        sx.drawImage(src, 0, 0);
                        sx.globalCompositeOperation = 'lighter';
                        if (pass === 0) { sx.drawImage(src, -1, 0); sx.drawImage(src, 1, 0); }
                        else { sx.drawImage(src, 0, -1); sx.drawImage(src, 0, 1); }
                        sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1;
                        src = cv;
                    }
                    layer = src;
                }
                ctx.imageSmoothingEnabled = true;
                if (layer === this.lightCanvas) ctx.drawImage(layer, 0, 0, this.canvas.width, this.canvas.height);
                else ctx.drawImage(layer, 1, 1, lw - 2, lh - 2, 0, 0, this.canvas.width, this.canvas.height);   // the blur's outer pixel is half-covered: crop it
                
                // 8. NV SIGNAL BOOST
                if (this.nvIntensity > 0.01) {
                    ctx.globalCompositeOperation = 'soft-light';
                    ctx.globalAlpha = 1.0;
                    ctx.fillStyle = `rgba(255, 255, 255, ${this.nvIntensity * 0.6})`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
            
                // Lightning: the dark lifts (above) and the night goes briefly cold blue-white
                if (flash > 0) {
                    ctx.globalCompositeOperation = 'screen';
                    ctx.globalAlpha = flash * 0.4;
                    ctx.fillStyle = 'rgb(170, 195, 255)';
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
                ctx.restore();
            },
            
            darkenColor(hex, amount) { return darkenHex(hex, Math.floor(255 * amount)); },

            // ═══ WET-WORLD POST-PROCESSING ═══
            
            /** Light bleed: a third-size copy, blurred small (cheap), then scaled up twice. */
            drawBloomPass(ctx) {
                if (!GameSettings.bloom) return;
                const W = this.canvas.width, H = this.canvas.height;
                const bw = Math.floor(W / 3), bh = Math.floor(H / 3);
                if (this.bloomCanvas.width !== bw || this.bloomCanvas.height !== bh) {
                    this.bloomCanvas.width = bw; this.bloomCanvas.height = bh;
                }
                this.bloomCtx.clearRect(0, 0, bw, bh);
                this.bloomCtx.drawImage(this.canvas, 0, 0, bw, bh);
                this.bloomCtx.globalCompositeOperation = 'lighter';
                this.bloomCtx.globalAlpha = 0.5;
                this.bloomCtx.drawImage(this.bloomCanvas, 0, 0);
                this.bloomCtx.globalAlpha = 1.0;
                this.bloomCtx.globalCompositeOperation = 'source-over';
                // The blur is a downscale chain (no ctx.filter: slow on many phones, unsupported in Safari):
                // halving twice averages the light out; stretched back up with smoothing it reads as a soft
                // bleed of about 12 and 24 px on screen, at a sixth and a twelfth of the resolution
                const blurred = this._bloomBlur || (this._bloomBlur = [document.createElement('canvas'), document.createElement('canvas')]);
                const sizes = [[Math.max(1, bw >> 1), Math.max(1, bh >> 1)], [Math.max(1, bw >> 2), Math.max(1, bh >> 2)]];
                let src = this.bloomCanvas;
                blurred.forEach((cv, i) => {
                    const [w, h] = sizes[i];
                    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
                    const c = cv.getContext('2d'); c.imageSmoothingEnabled = true;
                    c.clearRect(0, 0, w, h); c.drawImage(src, 0, 0, w, h);
                    src = cv;
                });
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'lighter';
                ctx.imageSmoothingEnabled = true;
                // Fold the wide layer into the narrow one at small size, so the screen takes a single stretch
                const c0 = blurred[0].getContext('2d'), [w0, h0] = sizes[0];
                c0.globalCompositeOperation = 'lighter'; c0.globalAlpha = 0.08 / 0.15;
                c0.drawImage(blurred[1], 0, 0, w0, h0);
                c0.globalCompositeOperation = 'source-over'; c0.globalAlpha = 1;
                ctx.globalAlpha = 0.15; ctx.drawImage(blurred[0], 0, 0, W, H);
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            },
            
            
            drawAtmospherePass(ctx) {
                const tintMap = {
                    amber: 'rgba(255,160,50,0.04)',
                    violet: 'rgba(120,60,200,0.04)',
                    crimson: 'rgba(200,50,70,0.03)',
                    teal: 'rgba(50,180,200,0.03)'
                };
                const tint = tintMap[GameSettings.atmosphereTint];
                if (!tint) return;
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = tint;
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.restore();
            },
            
            roundRect(x, y, w, h, r) { if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2; this.ctx.beginPath(); this.ctx.moveTo(x + r, y); this.ctx.arcTo(x + w, y, x + w, y + h, r); this.ctx.arcTo(x + w, y + h, x, y + h, r); this.ctx.arcTo(x, y + h, x, y, r); this.ctx.arcTo(x, y, x + w, y, r); this.ctx.closePath(); },

        });

