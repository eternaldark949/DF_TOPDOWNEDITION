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
            drawLightingSystem(ctx) {
                const ambient = this.getAmbientDarkness();
                const flash = this.weather.lightningFlash > 0 ? this.weather.lightningFlash : 0;
                // Maintain the shadow opacity (ambient), fading it as night vision turns on; lightning lifts it
                const finalOpacity = ambient * (1.0 - this.nvIntensity) * (1 - 0.8 * flash);
                
                // Optimization: If shadows are invisible and we don't need the NV boost, stop.
                if (finalOpacity <= 0.01 && !this.nightVision) return; 

                // Layer resolution: lighting quality, halved for soft shadows (the upscale softens edges)
                const LS = this.lightingScale * (GameSettings.softShadows ? 0.5 : 1);
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
                lc.translate(this.canvas.width/2, this.canvas.height/2);
                lc.scale(this.camera.zoom, this.camera.zoom);
                let camX, camY;
                if (this.cutscene && this.cutscene.active) { camX = this.camera.x; camY = this.camera.y; }
                else { camX = this.player.x + (this.scopeLeanX || 0); camY = this.player.y + (this.scopeLeanY || 0); }   // same camera as draw.js (scope lean included)
                lc.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                
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
                const iVisible = [];
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
                const litLamps = [];
                if (this.lightingBaked) {
                    const visibleLamps = [];
                    for (const lamp of this.lamps) {
                        if (!inView(lamp.x, lamp.y, lamp.radius)) continue;
                        if (!lamp._shadowPoly || lamp._shadowPoly.length === 0) continue;
                        // Room switches fade lamps; a faulty street lamp stutters now and then
                        const k = (rsOn ? rs.lampLight(lamp) : 1) * lampFlicker(lamp) * (lamp.intensity ?? 1);
                        if (k < 0.01) continue;
                        lamp._litK = k;
                        const dx = lamp.x - camX, dy = lamp.y - camY;
                        lamp._distSq = dx * dx + dy * dy;
                        visibleLamps.push(lamp);
                    }
                    visibleLamps.sort((a, b) => a._distSq - b._distSq);
                    for (const lamp of visibleLamps) {
                        if (litLamps.length >= this._maxLitLamps) break;
                        const poly = lamp._shadowPoly;
                        if (lamp._shadowPathOf !== poly) {
                            const path = new Path2D();
                            path.moveTo(poly[0].x, poly[0].y);
                            for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
                            path.closePath();
                            lamp._shadowPath = path; lamp._shadowPathOf = poly;
                        }
                        if (!lamp._holeGrad || lamp._holeGradAt !== lamp.x + ',' + lamp.y + ',' + lamp.radius) {
                            const g = lc.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius);
                            g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                            lamp._holeGrad = g; lamp._holeGradAt = lamp.x + ',' + lamp.y + ',' + lamp.radius;
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
                for (const p of this.projectiles) if (inView(p.x, p.y, 50)) lc.drawImage(white, p.x - 50, p.y - 50, 100, 100);
                for (const f of this.muzzleFlashes) {
                    const r = f.radius * 1.6;
                    if (inView(f.x, f.y, r)) lc.drawImage(white, f.x - r, f.y - r, r * 2, r * 2);
                }
            
                // Laser Sight beam cuts through darkness (same geometry as the visible beam)
                const lsGeom = this.getLaserSight();
                if (lsGeom) {
                    lc.strokeStyle = 'rgba(255, 50, 0, 0.45)';
                    lc.lineWidth = 3;
                    lc.beginPath(); lc.moveTo(lsGeom.x0, lsGeom.y0); lc.lineTo(lsGeom.x1, lsGeom.y1); lc.stroke();
                    lc.beginPath(); lc.arc(lsGeom.x1, lsGeom.y1, 8, 0, Math.PI * 2);
                    lc.fillStyle = 'rgba(255, 50, 0, 0.4)'; lc.fill();
                }
            
                // Headlights: the player's car, up to six in traffic, bumper cars
                const beams = [];
                const beamOf = (owner, stat, color, haze) => {
                    const off = owner.length / 2;
                    beams.push({ owner, cx: owner.x + Math.cos(owner.angle) * off, cy: owner.y + Math.sin(owner.angle) * off,
                                 L: stat * 6, W: stat * 1.5, color, haze });
                };
                if (this.isDriving || (this.car && this.car.forceLights)) beamOf(this.car, this.car.lightRange || 60, this.car.headlightColor || '#ffffdd', this.isDriving ? 1 : 0);
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
                
                // Indoor V2: Window daylight projections (cut light through shadow)
                if (rsOn) rs.drawWindowLightProjections(lc, this._windowDaylight || 0);
                
                // Soft lights: shadowless glow holes for decor lamps, candles, fire, string lights.
                // Fixed ones come from activeMap.softLights; props with a `light` carry theirs
                // with them when pushed. Room switches fade the lights in that room.
                // (Props are walked once: lights, and vending machines / medbays.)
                const softLights = [], propGlows = [];
                {
                    const tNow = _frameTime / 1000;
                    const push = (src, x, y) => {
                        if (!src.radius) src.radius = Math.max(src.w || 0, src.h || 0) / 2;
                        const r = src.radius || Math.max(src.w, src.h) / 2;
                        if (!inView(x, y, r)) return;
                        const k = rsOn ? rs.lightAt(x, y) : 1;
                        if (k < 0.01) return;
                        const f = src.flicker ? 0.82 + 0.18 * Math.sin(tNow * src.flicker + x * 0.7) * Math.sin(tNow * src.flicker * 0.37 + y) : 1;
                        softLights.push({ src, x, y, r, a: (src.intensity ?? 0.8) * f * k });
                    };
                    for (const s of (this.activeMap.softLights || [])) push(s, s.x, s.y);
                    for (const p of this.props) {
                        if (p.light && p.visible !== false) { const c = p.getCenter(); push(p.light, c.x + (p.light.dx || 0), c.y + (p.light.dy || 0)); }
                        if (p.interactionType === 'medbay_refill' || p.interactionType === 'vending_machine') {
                            const c = p.getCenter();
                            if (inView(c.x, c.y, 180)) propGlows.push({ p, x: c.x, y: c.y, medbay: p.interactionType === 'medbay_refill' });
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
                const HOLE_AREA = [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']];
                const HOLE_AREA_SOFT = [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.85)'], [0.7, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']];   // long, gentle edge
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

                // Shots light in their own colour
                const hexOr = (c, d) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d;
                for (const p of this.projectiles) {
                    if (!inView(p.x, p.y, 40)) continue;
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

                lc.restore();
            
                // 7. RENDER TO SCREEN (UPSCALING) — soft shadows: blur the small layer, then scale it up
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0); 
                ctx.globalAlpha = finalOpacity;
                let layer = this.lightCanvas;
                if (GameSettings.softShadows) {
                    const sc = this._softCanvas || (this._softCanvas = document.createElement('canvas'));
                    if (sc.width !== lw || sc.height !== lh) { sc.width = lw; sc.height = lh; }
                    const sx = sc.getContext('2d');
                    sx.clearRect(0, 0, lw, lh); sx.filter = 'blur(1.5px)'; sx.drawImage(this.lightCanvas, 0, 0); sx.filter = 'none';
                    layer = sc;
                }
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(layer, 0, 0, this.canvas.width, this.canvas.height);
                
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
                const blurred = this._bloomBlur || (this._bloomBlur = [document.createElement('canvas'), document.createElement('canvas')]);
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'lighter';
                ctx.imageSmoothingEnabled = true;
                [[4, 0.15], [8, 0.08]].forEach(([px, alpha], i) => {          // 4 / 8 px here ≈ 12 / 24 px on screen
                    const cv = blurred[i];
                    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
                    const c = cv.getContext('2d');
                    c.clearRect(0, 0, bw, bh); c.filter = `blur(${px}px)`; c.drawImage(this.bloomCanvas, 0, 0); c.filter = 'none';
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(cv, 0, 0, W, H);
                });
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            },
            
            drawWetReflections(ctx) {
                if (!GameSettings.wetReflections || !this.lamps || this.lamps.length === 0) return;
                const ambient = this.getAmbientDarkness();
                if (ambient < 0.2) return; // No reflections in daylight
                ctx.save();
                ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
                ctx.scale(this.camera.zoom, this.camera.zoom);
                let camX, camY;
                if (this.cutscene && this.cutscene.active) { camX = this.camera.x; camY = this.camera.y; }
                else { camX = this.player.x + (this.scopeLeanX || 0); camY = this.player.y + (this.scopeLeanY || 0); }   // same camera as draw.js (scope lean included)
                ctx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                ctx.globalCompositeOperation = 'lighter';
                const halfW = (this.canvas.width / 2) / this.camera.zoom;
                const halfH = (this.canvas.height / 2) / this.camera.zoom;
                const rs = this.roomSystem;
                for (const l of this.lamps) {
                    if (l.x < camX - halfW - 300 || l.x > camX + halfW + 300 ||
                        l.y < camY - halfH - 300 || l.y > camY + halfH + 300) continue;
                    const k = (rs && rs.active ? rs.lampLight(l) : 1) * lampFlicker(l);
                    if (k < 0.01) continue;
                    const r = l.radius || 200;
                    if (!l._wet || l._wetAt !== l.x + ',' + l.y + ',' + r) {         // lamps don't move: build once
                        const color = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#ffeebb';
                        const [cr, cg, cb] = hexToRgb(color).split(',').map(Number);
                        const intensity = l.intensity || 0.8;
                        const reflectH = r * 1.2;
                        const grad = ctx.createRadialGradient(l.x, l.y + r * 0.3, 0, l.x, l.y + r * 0.3, reflectH);
                        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.06 * intensity})`);
                        grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.03 * intensity})`);
                        grad.addColorStop(1, 'rgba(0,0,0,0)');
                        const hot = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 0.25);
                        hot.addColorStop(0, `rgba(${Math.min(255, cr + 40)},${Math.min(255, cg + 40)},${Math.min(255, cb + 40)},${0.08 * intensity})`);
                        hot.addColorStop(1, 'rgba(0,0,0,0)');
                        l._wet = { grad, hot, reflectH, reflectW: r * 0.4 }; l._wetAt = l.x + ',' + l.y + ',' + r;
                    }
                    const w = l._wet;
                    ctx.globalAlpha = Math.min(1, k);
                    ctx.fillStyle = w.grad;
                    ctx.beginPath(); ctx.ellipse(l.x, l.y + r * 0.3, w.reflectW, w.reflectH, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = w.hot;
                    ctx.beginPath(); ctx.arc(l.x, l.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1;
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

