        // GameEngine — Lighting, bloom, wet reflections, atmosphere, colour grade.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /* =====================================================================
               LIGHTING SYSTEM RENDERER (OPTIMIZED)
               ---------------------------------------------------------------------
               Handles the dynamic lighting layer, shadows, and night vision.
               Supports dynamic resolution scaling via 'lightingScale'.
               ===================================================================== */
            /* =====================================================================
               LIGHTING SYSTEM RENDERER (FIXED)
               ---------------------------------------------------------------------
               Handles the dynamic lighting layer, shadows, and night vision.
               Now correctly syncs with Cutscene Camera.
               ===================================================================== */
            drawLightingSystem(ctx) {
                const ambient = this.getAmbientDarkness();
                
                // THE FIX: Maintain original shadow opacity (ambient), but fade it to 0 as NV turns on.
                const finalOpacity = ambient * (1.0 - this.nvIntensity);
                
                // Optimization: If shadows are invisible and we don't need the NV boost, stop.
                if (finalOpacity <= 0.01 && !this.nightVision) return; 
            
                // 1. CLEAR BUFFER
                this.lightCtx.clearRect(0, 0, this.lightCanvas.width, this.lightCanvas.height);
            
                this.lightCtx.save();
                
                // --- FIDELITY SCALE ---
                this.lightCtx.scale(this.lightingScale, this.lightingScale);
            
                // 2. CAMERA TRANSFORM (SYNCED WITH MAIN RENDERER)
                this.lightCtx.translate(this.canvas.width/2, this.canvas.height/2);
                this.lightCtx.scale(this.camera.zoom, this.camera.zoom);
                
                // --- FIX: USE ACTIVE CAMERA COORDINATES, NOT PLAYER COORDINATES ---
                let camX, camY;
                if (this.cutscene && this.cutscene.active) {
                    camX = this.camera.x;
                    camY = this.camera.y;
                } else {
                    camX = this.player.x;
                    camY = this.player.y;
                }
                this.lightCtx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                
                // PERFORMANCE: Pre-calculate viewport culling bounds for lighting pass
                const lightCullZoom = Math.max(CONFIG.CULLING.ZOOM_MIN, Math.min(CONFIG.CULLING.ZOOM_MAX, this.camera.zoom));
                const lightCullHalfW = (this.canvas.width / 2) / lightCullZoom;
                const lightCullHalfH = (this.canvas.height / 2) / lightCullZoom;
                const lightCullBounds = {
                    headlights: { left: camX - lightCullHalfW - CONFIG.CULLING.HEADLIGHTS, right: camX + lightCullHalfW + CONFIG.CULLING.HEADLIGHTS, top: camY - lightCullHalfH - CONFIG.CULLING.HEADLIGHTS, bottom: camY + lightCullHalfH + CONFIG.CULLING.HEADLIGHTS },
                    props:      { left: camX - lightCullHalfW - CONFIG.CULLING.PROPS,      right: camX + lightCullHalfW + CONFIG.CULLING.PROPS,      top: camY - lightCullHalfH - CONFIG.CULLING.PROPS,      bottom: camY + lightCullHalfH + CONFIG.CULLING.PROPS },
                    lampGlow:   { left: camX - lightCullHalfW - CONFIG.CULLING.LAMP_GLOW,  right: camX + lightCullHalfW + CONFIG.CULLING.LAMP_GLOW,  top: camY - lightCullHalfH - CONFIG.CULLING.LAMP_GLOW,  bottom: camY + lightCullHalfH + CONFIG.CULLING.LAMP_GLOW },
                    neonSigns:  { left: camX - lightCullHalfW - CONFIG.CULLING.NEON_SIGNS, right: camX + lightCullHalfW + CONFIG.CULLING.NEON_SIGNS, top: camY - lightCullHalfH - CONFIG.CULLING.NEON_SIGNS, bottom: camY + lightCullHalfH + CONFIG.CULLING.NEON_SIGNS }
                };
                
                // PERFORMANCE: Calculate visible world bounds for clipping large draws
                const lightViewMargin = 200; // Extra margin for light bleed
                const visLeft   = Math.max(0, camX - lightCullHalfW - lightViewMargin);
                const visTop    = Math.max(0, camY - lightCullHalfH - lightViewMargin);
                const visRight  = Math.min(this.activeMap.width, camX + lightCullHalfW + lightViewMargin);
                const visBottom = Math.min(this.activeMap.height, camY + lightCullHalfH + lightViewMargin);
                const visW = visRight - visLeft;
                const visH = visBottom - visTop;
            
                // 3. DRAW BASE DARKNESS (Viewport-Only)
                // NEW: No map-sized shadow canvas. Fill viewport with black, then cut
                // light holes using cached per-lamp shadow polygons. Cost scales with
                // visible lamp count (~10-15), not map pixel count (was 44M).
                this.lightCtx.fillStyle = '#000000';
                this.lightCtx.fillRect(visLeft, visTop, visW, visH);
            
                // 3b. INTERIOR LAMP PASS — Per-lamp shadow projection from building interior walls
                // Matches editor lighting pipeline: invisible emitters that cast real-time
                // shadow wedges from interior_wall segments on the same level.
                if (this.activeMap._interiorLights && this.activeMap._interiorLights.length > 0) {
                    const iLights = this.activeMap._interiorLights;
                    const iSegsByLevel = this.activeMap._interiorShadowSegs || {};
                    
                    iLights.forEach(lamp => {
                        // Viewport cull
                        if (lamp.x + lamp.radius < visLeft || lamp.x - lamp.radius > visRight ||
                            lamp.y + lamp.radius < visTop || lamp.y - lamp.radius > visBottom) return;
                        
                        // Step A: Cut this lamp's light hole
                        this.lightCtx.globalCompositeOperation = 'destination-out';
                        const grad = this.lightCtx.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${lamp.intensity})`);
                        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.arc(lamp.x, lamp.y, lamp.radius, 0, Math.PI * 2);
                        this.lightCtx.fill();
                        
                        // Step B: Add color glow (before shadows mask it)
                        this.lightCtx.globalCompositeOperation = 'lighter';
                        const cGrad = this.lightCtx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.colorRadius);
                        cGrad.addColorStop(0, '#ffffff');
                        cGrad.addColorStop(0.1, lamp.color);
                        cGrad.addColorStop(0.6, lamp.color);
                        cGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        this.lightCtx.globalAlpha = 0.08 * lamp.intensity;
                        this.lightCtx.fillStyle = cGrad;
                        this.lightCtx.beginPath();
                        this.lightCtx.arc(lamp.x, lamp.y, lamp.colorRadius, 0, Math.PI * 2);
                        this.lightCtx.fill();
                        this.lightCtx.globalAlpha = 1.0;
                        
                        // Step C: Paint shadow wedges back from same-level wall segments
                        this.lightCtx.globalCompositeOperation = 'source-over';
                        const segs = iSegsByLevel[lamp.level] || [];
                        segs.forEach(seg => {
                            const d1 = Math.hypot(seg.x1 - lamp.x, seg.y1 - lamp.y);
                            const d2 = Math.hypot(seg.x2 - lamp.x, seg.y2 - lamp.y);
                            if (d1 > lamp.radius * 1.5 && d2 > lamp.radius * 1.5) return;
                            const a1 = Math.atan2(seg.y1 - lamp.y, seg.x1 - lamp.x);
                            const a2 = Math.atan2(seg.y2 - lamp.y, seg.x2 - lamp.x);
                            const ext = lamp.radius * 1.2;
                            this.lightCtx.fillStyle = '#000000';
                            this.lightCtx.beginPath();
                            this.lightCtx.moveTo(seg.x1, seg.y1);
                            this.lightCtx.lineTo(lamp.x + Math.cos(a1) * ext, lamp.y + Math.sin(a1) * ext);
                            this.lightCtx.lineTo(lamp.x + Math.cos(a2) * ext, lamp.y + Math.sin(a2) * ext);
                            this.lightCtx.lineTo(seg.x2, seg.y2);
                            this.lightCtx.closePath();
                            this.lightCtx.fill();
                        });
                    });
                }
            
                // 4. CUT STATIC LAMP SHADOWS (Destination-Out from cached geometry)
                this.lightCtx.globalCompositeOperation = 'destination-out';
                
                if (this.lightingBaked) {
                    const cbLampShadow = lightCullBounds.lampGlow;
                    let litLampCount = 0;
                    
                    // Roof occlusion: when player is outdoors, skip lamps inside indoor rooms
                    // so their light doesn't punch through the roof
                    const roofActive = this.roomSystem.active && (this.roomSystem._roofOpacity || 0) > 0.3;
                    
                    // Collect visible lamps, then sort by distance to camera so the
                    // budget cap (_maxLitLamps) always prioritizes lamps closest to the
                    // player. Without this, lamps earlier in the array lit up while
                    // nearby lamps added later were dark.
                    const visibleLamps = [];
                    for (let lamp of this.lamps) {
                        // AABB cull — skip lamps outside viewport
                        if (lamp.x < cbLampShadow.left || lamp.x > cbLampShadow.right || 
                            lamp.y < cbLampShadow.top || lamp.y > cbLampShadow.bottom) continue;
                        
                        // Skip indoor lamps when roof is occluding
                        if (roofActive) {
                            let insideIndoor = false;
                            for (const rid in this.roomSystem.rooms) {
                                const r = this.roomSystem.rooms[rid];
                                if (r.type !== 'outdoor' && lamp.x >= r.x && lamp.x <= r.x + r.w && lamp.y >= r.y && lamp.y <= r.y + r.h) {
                                    insideIndoor = true;
                                    break;
                                }
                            }
                            if (insideIndoor) continue;
                        }
                        
                        if (!lamp._shadowPoly || lamp._shadowPoly.length === 0) continue;
                        
                        // Skip lamps in rooms where lights have been switched off
                        if (this.roomSystem.isLampRoomDark(lamp)) continue;
                        
                        // Squared distance to camera center (cheap, no sqrt needed for sort)
                        const dx = lamp.x - camX;
                        const dy = lamp.y - camY;
                        lamp._distSq = dx * dx + dy * dy;
                        visibleLamps.push(lamp);
                    }
                    
                    // Sort nearest-first so budget cap keeps the closest lights on
                    visibleLamps.sort((a, b) => a._distSq - b._distSq);
                    
                    for (const lamp of visibleLamps) {
                        if (litLampCount >= this._maxLitLamps) break;
                        
                        const poly = lamp._shadowPoly;
                        
                        // Draw the cached shadow polygon with radial gradient
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(poly[0].x, poly[0].y);
                        for (let i = 1; i < poly.length; i++) {
                            this.lightCtx.lineTo(poly[i].x, poly[i].y);
                        }
                        this.lightCtx.closePath();
                        
                        const range = lamp.radius;
                        const grad = this.lightCtx.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, range);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
                        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.fill();
                        litLampCount++;
                    }
                }
            
                // 5. CUT DYNAMIC HOLES (Destination-Out)
                this.lightCtx.globalCompositeOperation = 'destination-out';
                
                // Projectiles
                this.projectiles.forEach(p => {
                    this.lightCtx.beginPath(); this.lightCtx.arc(p.x, p.y, 45, 0, Math.PI*2);
                    this.lightCtx.fillStyle = 'rgba(255, 255, 255, 1.0)'; this.lightCtx.fill();
                });
            
                // Muzzle Flashes
                this.muzzleFlashes.forEach(f => {
                    this.lightCtx.beginPath(); this.lightCtx.arc(f.x, f.y, f.radius * 1.2, 0, Math.PI*2);
                    this.lightCtx.fillStyle = 'rgba(255, 255, 255, 1.0)'; this.lightCtx.fill();
                });
            
                // Laser Sight beam cuts through darkness (same geometry as the visible beam)
                const lsGeom = this.getLaserSight();
                if (lsGeom) {
                    const mx = lsGeom.x0, my = lsGeom.y0, hx = lsGeom.x1, hy = lsGeom.y1;
                    
                    // Thin faint light line cutting through shadow
                    const lsGrad = this.lightCtx.createLinearGradient(mx, my, hx, hy);
                    lsGrad.addColorStop(0, 'rgba(255, 50, 0, 0.6)');
                    lsGrad.addColorStop(1, 'rgba(255, 50, 0, 0.1)');
                    this.lightCtx.strokeStyle = lsGrad;
                    this.lightCtx.lineWidth = 3;
                    this.lightCtx.beginPath();
                    this.lightCtx.moveTo(mx, my);
                    this.lightCtx.lineTo(hx, hy);
                    this.lightCtx.stroke();
                    
                    // Small glow at hit point
                    this.lightCtx.beginPath();
                    this.lightCtx.arc(hx, hy, 8, 0, Math.PI * 2);
                    this.lightCtx.fillStyle = 'rgba(255, 50, 0, 0.4)';
                    this.lightCtx.fill();
                }
            
                // Car Headlights (Dynamic Beam Length)
                if (this.isDriving || (this.car && this.car.forceLights)) {
                    const bumperOffset = this.car.length / 2;
                    const cx = this.car.x + Math.cos(this.car.angle) * bumperOffset;
                    const cy = this.car.y + Math.sin(this.car.angle) * bumperOffset;
                    
                    const lightStat = this.car.lightRange || 60; 
                    const beamLength = lightStat * 6; 
                    const beamWidth = lightStat * 1.5;
            
                    this.lightCtx.save(); 
                    this.lightCtx.translate(cx, cy); 
                    this.lightCtx.rotate(this.car.angle);
                    
                    const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0); 
                    //const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                    const lightingElement = this.car.headlightColor || '#ffffdd';
                    //const LERGB = this.hexToRgb(lightingElement) || '255, 255, 170';
                    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                    const rgb = hexMatch 
                        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                        : '255, 255, 170';
                    const gradCol = lightingElement;
                    grad.addColorStop(0, gradCol);
                    grad.addColorStop(1, `rgba(${rgb}, 0)`)

                    //const gradCol = this.car.headlightColor || 'rgba(255, 0, 0, 0.0)';
                    //grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); 
                    //grad.addColorStop(1, 'rgba(255, 255, 255, 0)');   
                    //grad.addColorStop(0, gradCol);
                    //grad.addColorStop(1, gradCol);
                    
                    this.lightCtx.fillStyle = grad; 
                    this.lightCtx.beginPath(); 
                    this.lightCtx.moveTo(0, -15); 
                    this.lightCtx.lineTo(beamLength, -beamWidth); 
                    this.lightCtx.lineTo(beamLength, beamWidth); 
                    this.lightCtx.lineTo(0, 15); 
                    this.lightCtx.fill(); 
                    this.lightCtx.restore();
                }
                
                // AI Vehicle Headlights (same cone effect)
                // PERFORMANCE: AABB viewport culling + vehicle count limit
                if (this.traffic && this.traffic.vehicles) {
                    const cbHL = lightCullBounds.headlights;
                    let headlightCount = 0;
                    
                    for (let i = 0; i < this.traffic.vehicles.length && headlightCount < 6; i++) {
                        const v = this.traffic.vehicles[i];
                        if (!v.visible || v.dead || v === this.car) continue;
                        
                        // AABB check
                        if (v.x < cbHL.left || v.x > cbHL.right || v.y < cbHL.top || v.y > cbHL.bottom) continue;
                        
                        headlightCount++;
                        
                        const bumperOffset = v.length / 2;
                        const cx = v.x + Math.cos(v.angle) * bumperOffset;
                        const cy = v.y + Math.sin(v.angle) * bumperOffset;
                        
                        const lightStat = 40;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(v.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const vHlc = v.headlightColor || '#ffffee';
                        const vHex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(vHlc);
                        const vRgb = vHex ? `${parseInt(vHex[1],16)}, ${parseInt(vHex[2],16)}, ${parseInt(vHex[3],16)}` : '255, 255, 230';
                        grad.addColorStop(0, vHlc);
                        grad.addColorStop(1, `rgba(${vRgb}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }
                
                // Bumper Car Headlights (during minigame — same logic as player headlight)
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    for (const car of this.bumperMinigame.cars) {
                        if (car === this.bumperMinigame.playerCar) continue;
                        
                        const bumperOffset = car.length / 2;
                        const cx = car.x + Math.cos(car.angle) * bumperOffset;
                        const cy = car.y + Math.sin(car.angle) * bumperOffset;
                        
                        const lightStat = car.lightRange || 60;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(car.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const lightingElement = car.headlightColor || car.bodyColor || '#ffffdd';
                        const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                        const rgb = hexMatch 
                            ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                            : '255, 255, 170';
                        const gradCol = lightingElement;
                        grad.addColorStop(0, gradCol);
                        grad.addColorStop(1, `rgba(${rgb}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }
                
                this.lightCtx.shadowBlur = 0;
                
                // Indoor V2: Window daylight projections (cut light through shadow)
                if (this.roomSystem.active) {
                    this.roomSystem.drawWindowLightProjections(this.lightCtx, this._windowDaylight || 0);
                }
                
                // Soft lights: shadowless glow holes for decor lamps, candles, fire, string lights.
                // Fixed ones come from activeMap.softLights; props with a `light` carry theirs
                // with them when pushed. Lights in a room whose switch is off stay dark.
                const cbProps = lightCullBounds.props;
                const softLights = [];
                {
                    const rs = this.roomSystem, tNow = _frameTime / 1000;
                    const push = (src, x, y) => {
                        if (x < cbProps.left - src.radius || x > cbProps.right + src.radius || y < cbProps.top - src.radius || y > cbProps.bottom + src.radius) return;
                        if (rs && rs.active) { const room = rs.getRoomAt(x, y); if (room && room.lightsOff) return; }
                        const f = src.flicker ? 0.82 + 0.18 * Math.sin(tNow * src.flicker + x * 0.7) * Math.sin(tNow * src.flicker * 0.37 + y) : 1;
                        softLights.push({ src, x, y, r: src.radius, a: (src.intensity ?? 0.8) * f });
                    };
                    for (const s of (this.activeMap.softLights || [])) push(s, s.x, s.y);
                    for (const p of this.props) if (p.light && p.visible !== false) { const c = p.getCenter(); push(p.light, c.x + (p.light.dx || 0), c.y + (p.light.dy || 0)); }
                }
                const softGrad = (s, key, make) => {               // gradients are reused while the light stays put
                    const k = s.x + ',' + s.y;
                    if (s.src[key] && s.src[key + 'At'] === k) return s.src[key];
                    s.src[key + 'At'] = k; return (s.src[key] = make());
                };
                for (const s of softLights) {
                    this.lightCtx.globalAlpha = Math.min(1, s.a);
                    this.lightCtx.fillStyle = softGrad(s, '_holeGrad', () => {
                        const g = this.lightCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
                        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                        return g;
                    });
                    this.lightCtx.beginPath(); this.lightCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); this.lightCtx.fill();
                }
                this.lightCtx.globalAlpha = 1;

                // Prop Glows (Vending/Medbay) - PERFORMANCE: AABB culling
                // FIX: Use getCenter() for accurate tracking of pushed/rotated props
                // and stable entity ID seed so animation doesn't jump on movement
                this.props.forEach(p => {
                    if (p.interactionType === 'medbay_refill' || p.interactionType === 'vending_machine') {
                        const center = p.getCenter();
                        const px = center.x; const py = center.y;
                        if (px < cbProps.left || px > cbProps.right || py < cbProps.top || py > cbProps.bottom) return;
                        
                        const time = _frameTime; const offset = (p.id || 0) * 1337;
                        let radiusMod = p.interactionType === 'medbay_refill' ? 1.0 + (Math.sin((time + offset) / 400) * 0.05) : 1.0 + (Math.sin((time + offset) / 50) * 0.02);
                        const holeRadius = 170 * radiusMod;
                        const grad = this.lightCtx.createRadialGradient(px, py, 20, px, py, holeRadius);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)'); grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');   
                        this.lightCtx.fillStyle = grad; this.lightCtx.beginPath(); this.lightCtx.arc(px, py, holeRadius, 0, Math.PI*2); this.lightCtx.fill();
                    }
                });
                
                // 6. COLOR PASS (Lighter Blend)
                this.lightCtx.globalCompositeOperation = 'lighter'; 
                const isIndoor = this.activeMap.type === 'indoor';
                const baseAlpha = (isIndoor ? 0.08 : 0.18); 
                
                // Indoor V2: Window warm daylight color (lighter blend)
                if (this.roomSystem.active) {
                    this.roomSystem.drawWindowColorPass(this.lightCtx, this._windowDaylight || 0);
                }
            
                // Lamps - PERFORMANCE: AABB culling + cached gradients
                const cbLampGlow = lightCullBounds.lampGlow;
                const _roofBlocksColor = this.roomSystem.active && (this.roomSystem._roofOpacity || 0) > 0.3;
                this.lamps.forEach(l => {
                    if (l.x < cbLampGlow.left || l.x > cbLampGlow.right || l.y < cbLampGlow.top || l.y > cbLampGlow.bottom) return;
                    
                    // Skip indoor lamps when roof is occluding
                    if (_roofBlocksColor) {
                        for (const rid in this.roomSystem.rooms) {
                            const r = this.roomSystem.rooms[rid];
                            if (r.type !== 'outdoor' && l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h) return;
                        }
                    }
                    
                    // Skip lamps in rooms with lights switched off
                    if (this.roomSystem.isLampRoomDark(l)) return;
                    
                    if (!l._cachedGrad) {
                        l._cachedGrad = this.lightCtx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
                        l._cachedGrad.addColorStop(0, '#ffffff'); l._cachedGrad.addColorStop(0.1, l.color); l._cachedGrad.addColorStop(0.6, l.color); l._cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    }
                    this.lightCtx.globalAlpha = baseAlpha; 
                    this.lightCtx.fillStyle = l._cachedGrad; this.lightCtx.beginPath(); this.lightCtx.arc(l.x, l.y, l.radius, 0, Math.PI*2); this.lightCtx.fill();
                });
            
                // Neon Signs - PERFORMANCE: AABB culling + cached gradients
                const cbNeon = lightCullBounds.neonSigns;
                this.neonSigns.forEach(s => {
                    if (s.x < cbNeon.left || s.x > cbNeon.right || s.y < cbNeon.top || s.y > cbNeon.bottom) return;
                    
                    if (!s._cachedGrad) {
                        const radius = 150;
                        s._cachedGrad = this.lightCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
                        s._cachedGrad.addColorStop(0, s.color); s._cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        s._cachedRadius = radius;
                    }
                    this.lightCtx.globalAlpha = baseAlpha * 1.5; 
                    this.lightCtx.fillStyle = s._cachedGrad; this.lightCtx.beginPath(); this.lightCtx.arc(s.x, s.y, s._cachedRadius, 0, Math.PI*2); this.lightCtx.fill();
                });
            
                // Prop Colors - Dynamic glow tint (no caching — props can be pushed)
                this.props.forEach(p => {
                    if (p.interactionType === 'medbay_refill' || p.interactionType === 'vending_machine') {
                        const center = p.getCenter();
                        const px = center.x; const py = center.y;
                        if (px < cbProps.left || px > cbProps.right || py < cbProps.top || py > cbProps.bottom) return;
                        
                        const isMedbay = p.interactionType === 'medbay_refill';
                        const baseColor = isMedbay ? '#00ff00' : '#00f3ff';
                        const grad = this.lightCtx.createRadialGradient(px, py, 10, px, py, 180);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); grad.addColorStop(0.3, baseColor); grad.addColorStop(1, 'rgba(0,0,0,0)');
                        
                        const time = _frameTime; const offset = (p.id || 0) * 1337;
                        const intensityMod = isMedbay ? 0.9 + (Math.sin((time + offset) / 400) * 0.2) : (1.0 + Math.sin((time + offset) / 50) * 0.05);
                        this.lightCtx.globalAlpha = Math.min(1.0, 0.2 * intensityMod);
                        this.lightCtx.fillStyle = grad; this.lightCtx.beginPath(); this.lightCtx.arc(px, py, 180, 0, Math.PI*2); this.lightCtx.fill();
                    }
                });
            
                // Soft light colour (the warm pool each decor light casts)
                for (const s of softLights) {
                    this.lightCtx.globalAlpha = Math.min(1, 0.22 * s.a);
                    this.lightCtx.fillStyle = softGrad(s, '_tintGrad', () => {
                        const g = this.lightCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
                        g.addColorStop(0, s.src.color || '#ffd9b0'); g.addColorStop(1, 'rgba(0,0,0,0)');
                        return g;
                    });
                    this.lightCtx.beginPath(); this.lightCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); this.lightCtx.fill();
                }
                this.lightCtx.globalAlpha = 1;

                // Car Headlights (Color Haze)
                if (this.isDriving) {
                    this.lightCtx.globalAlpha = baseAlpha; 
                    const bumperOffset = this.car.length / 2;
                    const cx = this.car.x + Math.cos(this.car.angle) * bumperOffset;
                    const cy = this.car.y + Math.sin(this.car.angle) * bumperOffset;
                    
                    const lightStat = this.car.lightRange || 60; 
                    const beamLength = lightStat * 6; 
                    const beamWidth = lightStat * 1.5;
            
                    this.lightCtx.save(); 
                    this.lightCtx.translate(cx, cy); 
                    this.lightCtx.rotate(this.car.angle);
                    
                    const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                    const lightingElement = this.car.headlightColor || '#ffffdd';
                    //const LERGB = this.hexToRgb(lightingElement) || '255, 255, 170';
                    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                    const rgb = hexMatch 
                        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                        : '255, 255, 170';
                    const gradCol = lightingElement;
                    grad.addColorStop(0, gradCol);
                    grad.addColorStop(1, `rgba(${rgb}, 0)`)
                    //grad.addColorStop(0, '#ffffdd');
                    //grad.addColorStop(1, 'rgba(255,255,200,0)');
                    
                    this.lightCtx.fillStyle = grad; 
                    this.lightCtx.beginPath(); 
                    this.lightCtx.moveTo(0, -15); 
                    this.lightCtx.lineTo(beamLength, -beamWidth); 
                    this.lightCtx.lineTo(beamLength, beamWidth); 
                    this.lightCtx.lineTo(0, 15); 
                    this.lightCtx.fill(); 
                    this.lightCtx.restore();
                }
                
                // AI Vehicle Headlights (Color Haze)
                // PERFORMANCE: AABB viewport culling + vehicle count limit
                if (this.traffic && this.traffic.vehicles) {
                    this.lightCtx.globalAlpha = baseAlpha * 0.7;
                    const cbHL2 = lightCullBounds.headlights;
                    let headlightCount = 0;
                    
                    for (let i = 0; i < this.traffic.vehicles.length && headlightCount < 6; i++) {
                        const v = this.traffic.vehicles[i];
                        if (!v.visible || v.dead || v === this.car) continue;
                        
                        // AABB check
                        if (v.x < cbHL2.left || v.x > cbHL2.right || v.y < cbHL2.top || v.y > cbHL2.bottom) continue;
                        
                        headlightCount++;
                        
                        const bumperOffset = v.length / 2;
                        const cx = v.x + Math.cos(v.angle) * bumperOffset;
                        const cy = v.y + Math.sin(v.angle) * bumperOffset;
                        
                        const lightStat = 40;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(v.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const vHlc2 = v.headlightColor || '#ffffcc';
                        const vHex2 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(vHlc2);
                        const vRgb2 = vHex2 ? `${parseInt(vHex2[1],16)}, ${parseInt(vHex2[2],16)}, ${parseInt(vHex2[3],16)}` : '255, 255, 200';
                        grad.addColorStop(0, vHlc2);
                        grad.addColorStop(1, `rgba(${vRgb2}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }
            
                // Bumper Car Headlights (Color Haze — same pass as player/traffic)
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    this.lightCtx.globalAlpha = baseAlpha;
                    for (const car of this.bumperMinigame.cars) {
                        if (car === this.bumperMinigame.playerCar) continue;
                        
                        const bumperOffset = car.length / 2;
                        const cx = car.x + Math.cos(car.angle) * bumperOffset;
                        const cy = car.y + Math.sin(car.angle) * bumperOffset;
                        
                        const lightStat = car.lightRange || 60;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(car.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const lightingElement = car.headlightColor || car.bodyColor || '#ffffdd';
                        const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                        const rgb = hexMatch 
                            ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                            : '255, 255, 170';
                        const gradCol = lightingElement;
                        grad.addColorStop(0, gradCol);
                        grad.addColorStop(1, `rgba(${rgb}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }

                this.lightCtx.restore();
            
                // 7. RENDER TO SCREEN (UPSCALING)
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0); 
                ctx.globalAlpha = finalOpacity;
                
                // Soft Shadows: single GPU-accelerated blur over entire lighting layer.
                // Much smoother than per-polygon shadowBlur — uniform softness on all edges.
                if (GameSettings.softShadows) {
                    ctx.filter = 'blur(4px)';
                }
                
                ctx.drawImage(this.lightCanvas, 0, 0, this.canvas.width, this.canvas.height);
                
                if (GameSettings.softShadows) {
                    ctx.filter = 'none';
                }
                
                // 8. NV SIGNAL BOOST
                if (this.nvIntensity > 0.01) {
                    ctx.globalCompositeOperation = 'soft-light';
                    ctx.globalAlpha = 1.0;
                    ctx.fillStyle = `rgba(255, 255, 255, ${this.nvIntensity * 0.6})`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
            
                // Lightning Flash Effect
                if (this.weather.lightningFlash > 0) {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = this.weather.lightningFlash * 0.7;
                    ctx.fillStyle = `rgba(200, 220, 255, 1)`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
                ctx.restore();
            },
            
            darkenColor(hex, amount) { return darkenHex(hex, Math.floor(255 * amount)); },

            // ═══ WET-WORLD POST-PROCESSING ═══
            
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
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.15;
                ctx.filter = 'blur(12px)';
                ctx.drawImage(this.bloomCanvas, 0, 0, W, H);
                ctx.filter = 'blur(24px)';
                ctx.globalAlpha = 0.08;
                ctx.drawImage(this.bloomCanvas, 0, 0, W, H);
                ctx.filter = 'none';
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
                else { camX = this.player.x; camY = this.player.y; }
                ctx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                ctx.globalCompositeOperation = 'lighter';
                const halfW = (this.canvas.width / 2) / this.camera.zoom;
                const halfH = (this.canvas.height / 2) / this.camera.zoom;
                for (const l of this.lamps) {
                    if (l.x < camX - halfW - 300 || l.x > camX + halfW + 300 ||
                        l.y < camY - halfH - 300 || l.y > camY + halfH + 300) continue;
                    if (this.roomSystem && this.roomSystem.isLampRoomDark && this.roomSystem.isLampRoomDark(l)) continue;
                    const r = l.radius || 200;
                    const color = l.color || '#ffeebb';
                    const intensity = l.intensity || 0.8;
                    const hex = color.replace('#', '');
                    const cr = parseInt(hex.substr(0, 2), 16) || 255;
                    const cg = parseInt(hex.substr(2, 2), 16) || 238;
                    const cb = parseInt(hex.substr(4, 2), 16) || 187;
                    const reflectH = r * 1.2, reflectW = r * 0.4;
                    const grad = ctx.createRadialGradient(l.x, l.y + r * 0.3, 0, l.x, l.y + r * 0.3, reflectH);
                    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.06 * intensity})`);
                    grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.03 * intensity})`);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath(); ctx.ellipse(l.x, l.y + r * 0.3, reflectW, reflectH, 0, 0, Math.PI * 2); ctx.fill();
                    const hotGrad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 0.25);
                    hotGrad.addColorStop(0, `rgba(${Math.min(255, cr + 40)},${Math.min(255, cg + 40)},${Math.min(255, cb + 40)},${0.08 * intensity})`);
                    hotGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = hotGrad;
                    ctx.beginPath(); ctx.arc(l.x, l.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
                }
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
            
            applyColorGrade() {
                const GRADES = {
                    none: { brightness: 100, contrast: 100, saturate: 100, tempR: 128, tempG: 128, tempB: 128, tempOpacity: 0, vignette: 0 },
                    amber_night: { brightness: 95, contrast: 130, saturate: 110, tempR: 178, tempG: 118, tempB: 88, tempOpacity: 0.08, vignette: 35 },
                    violet_noir: { brightness: 90, contrast: 140, saturate: 80, tempR: 108, tempG: 88, tempB: 178, tempOpacity: 0.08, vignette: 45 },
                    crimson: { brightness: 92, contrast: 135, saturate: 120, tempR: 178, tempG: 98, tempB: 108, tempOpacity: 0.07, vignette: 30 },
                    cold_teal: { brightness: 95, contrast: 125, saturate: 75, tempR: 78, tempG: 138, tempB: 178, tempOpacity: 0.07, vignette: 25 },
                    dreampunk: { brightness: 93, contrast: 145, saturate: 95, tempR: 148, tempG: 108, tempB: 168, tempOpacity: 0.06, vignette: 50 }
                };
                const g = GRADES[GameSettings.colorGrade] || GRADES.none;
                const filters = [];
                if (g.brightness !== 100) filters.push(`brightness(${g.brightness / 100})`);
                if (g.contrast !== 100) filters.push(`contrast(${g.contrast / 100})`);
                if (g.saturate !== 100) filters.push(`saturate(${g.saturate / 100})`);
                this.canvas.style.filter = filters.length > 0 ? filters.join(' ') : 'none';
                // Temperature overlay
                let ov = document.getElementById('grade-overlay');
                if (!ov) {
                    ov = document.createElement('div');
                    ov.id = 'grade-overlay';
                    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;mix-blend-mode:soft-light;';
                    this.canvas.parentElement.appendChild(ov);
                }
                if (g.tempOpacity > 0) {
                    ov.style.background = `rgb(${g.tempR},${g.tempG},${g.tempB})`;
                    ov.style.opacity = g.tempOpacity;
                    ov.style.display = 'block';
                } else { ov.style.display = 'none'; }
                // Vignette
                if (g.vignette > 0) {
                    this.canvas.style.boxShadow = `inset 0 0 ${g.vignette * 2}px ${g.vignette}px rgba(0,0,0,${g.vignette / 100})`;
                } else { this.canvas.style.boxShadow = 'none'; }
            },

            roundRect(x, y, w, h, r) { if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2; this.ctx.beginPath(); this.ctx.moveTo(x + r, y); this.ctx.arcTo(x + w, y, x + w, y + h, r); this.ctx.arcTo(x + w, y + h, x, y + h, r); this.ctx.arcTo(x, y + h, x, y, r); this.ctx.arcTo(x, y, x + w, y, r); this.ctx.closePath(); },

        });

