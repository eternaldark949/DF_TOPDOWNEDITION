        // GameEngine — The frame renderer (draw).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /* =====================================================================
               MAIN RENDER LOOP (DRAW)
               ---------------------------------------------------------------------
               Handles all visual rendering.
               Layers: Floor -> Roads -> Buildings -> Walls -> Entities -> Light -> UI
               Instrumented with Profiler.
               ===================================================================== */
            draw() {
                if (!this.running || this.paused) return;
            
                // --- PROFILER START ---
                this.profiler.beginFrame();
                this.profiler.start('Render:Total');
                this.profiler.markWrapper('Render:Total');
                /* Render:Setup — the full-screen clear, camera transform, cull
                   bounds and zoom LOD. This block used to sit inside Render:Total
                   but in no subsection, so the parts never summed to the whole
                   and the clear (a full-viewport fillRect — pure fill rate, and
                   precisely what resolution scaling targets) was invisible in the
                   breakdown. */
                this.profiler.start('Render:Setup');
            
                // 1. CLEAR & CAMERA SETUP
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
                this.ctx.save();
                this.ctx.translate(this.canvas.width/2, this.canvas.height/2);
                this.ctx.scale(this.camera.zoom, this.camera.zoom);
            
                // Camera Logic: Cutscene Director vs Player Tracking
                let camX, camY;
                if (this.cutscene && this.cutscene.active) {
                    camX = this.camera.x;
                    camY = this.camera.y;
                } else {
                    camX = this.player.x;
                    camY = this.player.y;
                    this.camera.x = camX; // Sync for smooth handoff
                    this.camera.y = camY;
                }
                
                this.ctx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                // World → screen matrix for this frame: lets the hair physics work out any
                // character's head position in world space, whatever transforms drew it
                _worldMatrix = this.ctx.getTransform();
                _worldCanvas = this.canvas;
                
                // PERFORMANCE: Pre-calculate viewport culling bounds once per frame
                // Uses AABB (rectangular) instead of radial distance for better screen coverage
                // cullZoom clamps the zoom used for cull bounds, preventing the cull rect from
                // exploding at low zoom (driving at speed). Margins stay unscaled as pop-in buffer.
                const cullZoom = Math.max(CONFIG.CULLING.ZOOM_MIN, Math.min(CONFIG.CULLING.ZOOM_MAX, this.camera.zoom));
                const cullHalfW = (this.canvas.width / 2) / cullZoom;
                const cullHalfH = (this.canvas.height / 2) / cullZoom;
                const cullBounds = {
                    buildings:    { left: camX - cullHalfW - CONFIG.CULLING.BUILDINGS,     right: camX + cullHalfW + CONFIG.CULLING.BUILDINGS,     top: camY - cullHalfH - CONFIG.CULLING.BUILDINGS,     bottom: camY + cullHalfH + CONFIG.CULLING.BUILDINGS },
                    buildingTops: { left: camX - cullHalfW - CONFIG.CULLING.BUILDING_TOPS, right: camX + cullHalfW + CONFIG.CULLING.BUILDING_TOPS, top: camY - cullHalfH - CONFIG.CULLING.BUILDING_TOPS, bottom: camY + cullHalfH + CONFIG.CULLING.BUILDING_TOPS },
                    foliage:      { left: camX - cullHalfW - CONFIG.CULLING.FOLIAGE,       right: camX + cullHalfW + CONFIG.CULLING.FOLIAGE,       top: camY - cullHalfH - CONFIG.CULLING.FOLIAGE,       bottom: camY + cullHalfH + CONFIG.CULLING.FOLIAGE },
                    lamps:        { left: camX - cullHalfW - CONFIG.CULLING.LAMPS,         right: camX + cullHalfW + CONFIG.CULLING.LAMPS,         top: camY - cullHalfH - CONFIG.CULLING.LAMPS,         bottom: camY + cullHalfH + CONFIG.CULLING.LAMPS },
                    lampGlow:     { left: camX - cullHalfW - CONFIG.CULLING.LAMP_GLOW,     right: camX + cullHalfW + CONFIG.CULLING.LAMP_GLOW,     top: camY - cullHalfH - CONFIG.CULLING.LAMP_GLOW,     bottom: camY + cullHalfH + CONFIG.CULLING.LAMP_GLOW },
                    props:        { left: camX - cullHalfW - CONFIG.CULLING.PROPS,         right: camX + cullHalfW + CONFIG.CULLING.PROPS,         top: camY - cullHalfH - CONFIG.CULLING.PROPS,         bottom: camY + cullHalfH + CONFIG.CULLING.PROPS },
                    neonSigns:    { left: camX - cullHalfW - CONFIG.CULLING.NEON_SIGNS,    right: camX + cullHalfW + CONFIG.CULLING.NEON_SIGNS,    top: camY - cullHalfH - CONFIG.CULLING.NEON_SIGNS,    bottom: camY + cullHalfH + CONFIG.CULLING.NEON_SIGNS },
                    headlights:   { left: camX - cullHalfW - CONFIG.CULLING.HEADLIGHTS,    right: camX + cullHalfW + CONFIG.CULLING.HEADLIGHTS,    top: camY - cullHalfH - CONFIG.CULLING.HEADLIGHTS,    bottom: camY + cullHalfH + CONFIG.CULLING.HEADLIGHTS },
                    vehicles:     { left: camX - cullHalfW - CONFIG.CULLING.VEHICLES,      right: camX + cullHalfW + CONFIG.CULLING.VEHICLES,      top: camY - cullHalfH - CONFIG.CULLING.VEHICLES,      bottom: camY + cullHalfH + CONFIG.CULLING.VEHICLES },
                    entities:     { left: camX - cullHalfW - CONFIG.CULLING.ENTITIES,      right: camX + cullHalfW + CONFIG.CULLING.ENTITIES,      top: camY - cullHalfH - CONFIG.CULLING.ENTITIES,      bottom: camY + cullHalfH + CONFIG.CULLING.ENTITIES },
                    world:        { left: camX - cullHalfW - CONFIG.CULLING.WORLD,         right: camX + cullHalfW + CONFIG.CULLING.WORLD,         top: camY - cullHalfH - CONFIG.CULLING.WORLD,         bottom: camY + cullHalfH + CONFIG.CULLING.WORLD }
                };
            
                // --- DYNAMIC LOD (Zoom-Aware) ---
                // Progressive quality reduction as camera zooms out.
                // At zoom 1.0: full detail. At 0.35: minimal detail.
                // zoomLOD 0 = full quality, 1 = reduced, 2 = minimal
                const zoom = this.camera.zoom;
                _zoomLOD = zoom > 0.7 ? 0 : (zoom > 0.5 ? 1 : 2);
                
                // Vehicle LOD threshold scales with zoom — entities that are small on screen skip effects
                const _vehicleLODThreshSq = Math.pow(300 / Math.max(0.35, zoom), 2);
                
                // Max shadow polygons drawn per frame in lighting pass (prevents zoom-out bomb)
                const _maxLitLamps = _zoomLOD === 2 ? 10 : (_zoomLOD === 1 ? 18 : 40);
                
                // Max neon sign layers (5 = full glow, 2 = core only, 1 = flat text)
                const _maxSignLayers = _zoomLOD === 2 ? 1 : (_zoomLOD === 1 ? 2 : 5);
                
                // Store on engine for access by sub-systems
                this._zoomLOD = _zoomLOD;
                this._maxLitLamps = _maxLitLamps;
                this._maxSignLayers = _maxSignLayers;
            
                this.profiler.stop('Render:Setup');

                // 2. WORLD GEOMETRY (BOTTOM LAYERS)
                this.profiler.start('Render:World');
                
                // Pre-calculate daylight factor for windows, lamps, and lighting
                // Indoor V2: If room system is active, use room type; otherwise use map type
                // worldMinutes is monotonic — derive hour-of-day with % 1440.
                const hour = (this.worldMinutes % 1440) / 60;
                const isEffectivelyOutdoor = this.activeMap.type === 'outdoor' || this.roomSystem.isPlayerOutdoor();
                const daylight = isEffectivelyOutdoor ? Math.max(0, 1 - (Math.abs(12 - hour) / 6)) : 0;
                // For windows: they always project based on world time, even in indoor maps
                const windowDaylight = Math.max(0, 1 - (Math.abs(12 - hour) / 6));
                this._windowDaylight = windowDaylight; // Store for lighting system access
                // Floor Base - PERFORMANCE: Clip to visible area instead of full map
                // Uses actual camera zoom (not cullZoom) so floor always fills the screen
                const viewHalfW = (this.canvas.width / 2) / this.camera.zoom;
                const viewHalfH = (this.canvas.height / 2) / this.camera.zoom;
                this.ctx.fillStyle = this.activeMap.floorColor;
                const floorLeft = Math.max(0, camX - viewHalfW - 50);
                const floorTop = Math.max(0, camY - viewHalfH - 50);
                const floorRight = Math.min(this.activeMap.width, camX + viewHalfW + 50);
                const floorBottom = Math.min(this.activeMap.height, camY + viewHalfH + 50);
                this.ctx.fillRect(floorLeft, floorTop, floorRight - floorLeft, floorBottom - floorTop);
                
                // Floor Zones (Grass, Industrial ground - drawn UNDER roads)
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                if (this._renderGridFloorZones) {
                    const visibleZones = this._renderGridFloorZones.query(cullBounds.world);
                    for (const z of visibleZones) {
                        this.ctx.fillStyle = z.color;
                        this.ctx.fillRect(z.x, z.y, z.w, z.h);
                    }
                }
                
                // Restricted Zone — in-world crimson hazard border
                if (this.restrictedZone && this.activeMap.id === 'hub_949') {
                    const rz = this.restrictedZone;
                    const wb = cullBounds.world;
                    // Only draw if zone is visible in viewport
                    if (rz.x + rz.w > wb.x && rz.x < wb.x + wb.w && rz.y + rz.h > wb.y && rz.y < wb.y + wb.h) {
                        this.ctx.save();
                        // Pulsing crimson dashed border
                        const t = _frameTime / 500;
                        const alpha = rz.active && !rz.cleared ? 0.6 + Math.sin(t) * 0.2 : 0.25;
                        this.ctx.strokeStyle = `rgba(200, 20, 0, ${alpha})`;
                        this.ctx.lineWidth = 3;
                        this.ctx.setLineDash([12, 8]);
                        this.ctx.lineDashOffset = _frameTime / 40;
                        this.ctx.strokeRect(rz.x, rz.y, rz.w, rz.h);
                        this.ctx.setLineDash([]);
                        
                        // Corner hazard chevrons
                        const cs = 20; // chevron size
                        this.ctx.strokeStyle = `rgba(255, 60, 0, ${alpha * 0.8})`;
                        this.ctx.lineWidth = 2;
                        // Top-left
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x, rz.y + cs); this.ctx.lineTo(rz.x, rz.y); this.ctx.lineTo(rz.x + cs, rz.y); this.ctx.stroke();
                        // Top-right
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x + rz.w - cs, rz.y); this.ctx.lineTo(rz.x + rz.w, rz.y); this.ctx.lineTo(rz.x + rz.w, rz.y + cs); this.ctx.stroke();
                        // Bottom-left
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x, rz.y + rz.h - cs); this.ctx.lineTo(rz.x, rz.y + rz.h); this.ctx.lineTo(rz.x + cs, rz.y + rz.h); this.ctx.stroke();
                        // Bottom-right
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x + rz.w - cs, rz.y + rz.h); this.ctx.lineTo(rz.x + rz.w, rz.y + rz.h); this.ctx.lineTo(rz.x + rz.w, rz.y + rz.h - cs); this.ctx.stroke();
                        
                        this.ctx.restore();
                    }
                }
                
                // Roads (Asphalt)
                this.traffic.drawNetwork(this.ctx, this.debugMode);
                
                // Puddle Reflections (draw on roads, before buildings/entities)
                if (this.puddles && this.weather?.isRaining && this.activeMap?.type === 'outdoor') {
                    this.puddles.draw(this.ctx);
                }
            
                this.profiler.stop('Render:World');
                
                // Buildings - BASE LAYER (shadows, ground floor) - drawn before entities
                this.profiler.start('Render:Buildings');
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.buildings) {
                    const cb = cullBounds.buildings;
                    this.activeMap.buildings.forEach(b => {
                        // AABB check - building bounds vs viewport bounds
                        const bRight = b.x + (b.w || 200);
                        const bBottom = b.y + (b.h || 200);
                        if (bRight < cb.left || b.x > cb.right || bBottom < cb.top || b.y > cb.bottom) return;
                        
                        if (b.drawBase) {
                            b.drawBase(this.ctx);
                        } else {
                            b.draw(this.ctx);
                        }
                    });
                }
                
                // BuildingV3 — Ground layer (beneath player: facade, sidewalk)
                if (this.activeMap._v3Buildings) {
                    this.activeMap._v3Buildings.forEach(b => {
                        b.drawGround(this.ctx, performance.now());
                    });
                }
                
                // Neon Signs on buildings - PERFORMANCE: AABB culling + cached frameTime
                const cbNeonMain = cullBounds.neonSigns;
                this.neonSigns.forEach(s => {
                    if (s.x < cbNeonMain.left || s.x > cbNeonMain.right || s.y < cbNeonMain.top || s.y > cbNeonMain.bottom) return;
                    s.draw(this.ctx, _frameTime);  // per-frame real time (was sampled once per tick)
                });
            
                // Walls & Indoor Zones (WITH BAKED TEXTURES)
                if (this.activeMap.zones) { 
                    this.activeMap.zones.forEach(z => { 
                        // Base color fill
                        this.ctx.fillStyle = z.color; 
                        this.ctx.fillRect(z.x, z.y, z.w, z.h); 
                        
                        // PERFORMANCE: Use pre-baked texture patterns instead of per-frame procedural
                        if (z.texture === 'wood') {
                            // Simple baked wood effect - just lines, no loops
                            this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
                            const plankHeight = 24; // Doubled for fewer draws
                            for (let py = z.y; py < z.y + z.h; py += plankHeight) {
                                this.ctx.fillRect(z.x, py, z.w, 1);
                            }
                            // Single polish overlay
                            this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
                            this.ctx.fillRect(z.x, z.y, z.w, z.h);
                            
                        } else if (z.texture === 'carpet') {
                            // Simple carpet overlay - single fill, no loops
                            this.ctx.fillStyle = 'rgba(0,0,0,0.06)';
                            this.ctx.fillRect(z.x, z.y, z.w, 4);
                            this.ctx.fillRect(z.x, z.y + z.h - 4, z.w, 4);
                            this.ctx.fillRect(z.x, z.y, 4, z.h);
                            this.ctx.fillRect(z.x + z.w - 4, z.y, 4, z.h);
                        }
                    }); 
                }
                
                // --- APARTMENT CITY BACKDROP ---
                // Draw AFTER zones so it overwrites the veranda zone color with a living cityscape
                if (this.activeMap.id === 'apt_949') {
                    this.drawApartmentBackdrop(this.ctx);
                    this.drawApartmentInterior(this.ctx);
                }
                if (this.activeMap.id === 'medbay_sw') {
                    this.drawClinicInterior(this.ctx);
                }
                
                // Indoor V2: Room floors, windows, and doors
                if (this.roomSystem.active) {
                    this.roomSystem.drawFloors(this.ctx);
                    this.roomSystem.drawWindows(this.ctx, windowDaylight);
                    // Doors drawn AFTER walls (see below) so they render on top
                }
                
                // Pavements
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                if (this._renderGridPavements) {
                    const visiblePavements = this._renderGridPavements.query(cullBounds.world);
                    for (const p of visiblePavements) {
                        p.draw(this.ctx);
                    }
                }
                
                // Crosswalks
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                if (this._renderGridCrosswalks) {
                    const visibleCrosswalks = this._renderGridCrosswalks.query(cullBounds.world);
                    for (const cw of visibleCrosswalks) {
                        this.ctx.fillStyle = '#1a1a20';
                        this.ctx.fillRect(cw.x, cw.y, cw.w, cw.h);
                        
                        // Zebra stripes
                        this.ctx.fillStyle = '#ddd';
                        const stripeWidth = 12;
                        const stripeGap = 18;
                        
                        if (cw.orientation === 'H') {
                            for (let sy = cw.y + 8; sy < cw.y + cw.h - 8; sy += stripeGap) {
                                this.ctx.fillRect(cw.x + 8, sy, cw.w - 16, stripeWidth);
                            }
                        } else {
                            for (let sx = cw.x + 8; sx < cw.x + cw.w - 8; sx += stripeGap) {
                                this.ctx.fillRect(sx, cw.y + 8, stripeWidth, cw.h - 16);
                            }
                        }
                    }
                }
                
                // Building forecourts sit on top of the pavement (Silver Queen portico floor, steps, carpet)
                if (this.activeMap.buildings && this.activeMap.type === 'outdoor') {
                    const cbW = cullBounds.world;
                    for (const b of this.activeMap.buildings) {
                        if (b.style !== 'silver_queen' || !b._sqDrawGround) continue;
                        if (b.x + b.w < cbW.left || b.x > cbW.right || b.y > cbW.bottom || b.y + b.h + 160 < cbW.top) continue;
                        b._sqDrawGround(this.ctx);
                    }
                }
                this.decals.draw(this.ctx, cullBounds.world);
                
                this.profiler.stop('Render:Buildings');
                
                // Entrance Markers (Holo-Zones) - Periwinkle/Lavender Glow
                this.profiler.start('Render:Entities');
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.transitions) {
                    const cbW = cullBounds.world;
                    const pulse = (Math.sin(_frameTime / 200) + 1) / 2;
                    this.ctx.save();
                    this.activeMap.transitions.forEach(t => {
                        if (t.x + t.w < cbW.left || t.x > cbW.right || t.y + t.h < cbW.top || t.y > cbW.bottom) return;
                        
                        const cx = t.x + t.w / 2;
                        const cy = t.y + t.h / 2;
                        const maxR = Math.max(t.w, t.h) * 0.8;
                        
                        // Radial glow gradient floor mat
                        const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
                        grad.addColorStop(0, `rgba(180, 170, 255, ${0.2 + pulse * 0.12})`);
                        grad.addColorStop(0.6, `rgba(200, 190, 255, ${0.1 + pulse * 0.08})`);
                        grad.addColorStop(1, `rgba(220, 210, 255, 0)`);
                        this.ctx.fillStyle = grad;
                        this.ctx.fillRect(t.x - 20, t.y - 20, t.w + 40, t.h + 40);
                
                        // Inner floor fill
                        this.ctx.fillStyle = `rgba(200, 190, 255, ${0.08 + pulse * 0.06})`;
                        this.ctx.fillRect(t.x, t.y, t.w, t.h);
                
                        // Glowing border with shadowBlur
                        this.ctx.shadowColor = 'rgba(180, 170, 255, 0.8)';
                        this.ctx.shadowBlur = 12 + pulse * 6;
                        this.ctx.strokeStyle = `rgba(200, 190, 255, ${0.5 + pulse * 0.35})`;
                        this.ctx.lineWidth = 2;
                        this.ctx.strokeRect(t.x, t.y, t.w, t.h);
                        this.ctx.shadowBlur = 0;
                
                        // Corner markers - brighter periwinkle
                        this.ctx.strokeStyle = `rgba(210, 200, 255, ${0.7 + pulse * 0.3})`;
                        this.ctx.lineWidth = 2;
                        const cornerSize = 10;
                
                        // Top-left
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x, t.y + cornerSize);
                        this.ctx.lineTo(t.x, t.y);
                        this.ctx.lineTo(t.x + cornerSize, t.y);
                        this.ctx.stroke();
                
                        // Top-right
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x + t.w - cornerSize, t.y);
                        this.ctx.lineTo(t.x + t.w, t.y);
                        this.ctx.lineTo(t.x + t.w, t.y + cornerSize);
                        this.ctx.stroke();
                
                        // Bottom-left
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x, t.y + t.h - cornerSize);
                        this.ctx.lineTo(t.x, t.y + t.h);
                        this.ctx.lineTo(t.x + cornerSize, t.y + t.h);
                        this.ctx.stroke();
                
                        // Bottom-right
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x + t.w - cornerSize, t.y + t.h);
                        this.ctx.lineTo(t.x + t.w, t.y + t.h);
                        this.ctx.lineTo(t.x + t.w, t.y + t.h - cornerSize);
                        this.ctx.stroke();
                
                        // "ENTRANCE" text
                        // Outdoor maps: place BELOW the rect (the area above is occluded
                        // by the building's art). Indoor maps: place ABOVE the rect (the
                        // doorway sits against a wall and the label belongs over it).
                        if (Math.hypot(this.player.x - cx, this.player.y - cy) < 150) {
                            const isIndoor = this.activeMap.type === 'indoor';
                            this.ctx.fillStyle = '#ddd8ff';
                            this.ctx.font = '12px Orbitron';
                            this.ctx.textAlign = 'center';
                            this.ctx.textBaseline = isIndoor ? 'bottom' : 'top';
                            this.ctx.shadowColor = 'rgba(180, 170, 255, 0.9)';
                            this.ctx.shadowBlur = 12;
                            const labelY = isIndoor ? (t.y - 8) : (t.y + t.h + 8);
                            this.ctx.fillText("ENTRANCE", cx, labelY);
                            this.ctx.shadowBlur = 0;
                            this.ctx.textBaseline = 'alphabetic';
                        }
                    });
                    this.ctx.restore();
                }
                
                // --- DELIVERY DROP-OFF MARKER (world-space spinning amber coffee cup) ---
                if (this.missions.activeMission && this.missions.activeMission.status === 'active'
                    && this.missions.activeMission.type === MISSION_TYPES.DELIVERY
                    && this.missions.activeMission.pickedUp && this.activeMap.id === 'hub_949') {
                    const m = this.missions.activeMission;
                    const tx = m.targetX;
                    const ty = m.targetY;
                    const t = _frameTime;
                    const pulse = (Math.sin(t / 400) + 1) / 2;
                    const spin = (t / 1000) % (Math.PI * 2);
                    
                    this.ctx.save();
                    this.ctx.translate(tx, ty);
                    
                    // Ground glow ring
                    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
                    grad.addColorStop(0, `rgba(255, 170, 0, ${0.15 + pulse * 0.1})`);
                    grad.addColorStop(0.6, `rgba(255, 170, 0, ${0.05 + pulse * 0.05})`);
                    grad.addColorStop(1, 'rgba(255, 170, 0, 0)');
                    this.ctx.fillStyle = grad;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, 50, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Spinning coffee cup icon
                    const scaleX = Math.cos(spin); // Creates 3D spin illusion
                    this.ctx.save();
                    this.ctx.scale(scaleX, 1);
                    
                    // Cup body (amber)
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 12 + pulse * 8;
                    this.ctx.fillStyle = `rgba(255, 170, 0, ${0.7 + pulse * 0.3})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(-8, -12);
                    this.ctx.lineTo(-6, 6);
                    this.ctx.quadraticCurveTo(0, 10, 6, 6);
                    this.ctx.lineTo(8, -12);
                    this.ctx.closePath();
                    this.ctx.fill();
                    
                    // Cup rim (champagne)
                    this.ctx.fillStyle = '#f5e6c8';
                    this.ctx.fillRect(-9, -14, 18, 3);
                    
                    // Handle
                    this.ctx.strokeStyle = `rgba(255, 170, 0, ${0.6 + pulse * 0.3})`;
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(10, -4, 5, -Math.PI / 2, Math.PI / 2);
                    this.ctx.stroke();
                    
                    // Steam wisps
                    for (let i = 0; i < 3; i++) {
                        const sx = -3 + i * 3;
                        const sy = -14 - 4 - Math.sin(t / 300 + i * 2) * 4;
                        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + pulse * 0.1})`;
                        this.ctx.beginPath();
                        this.ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                    
                    // "DELIVER HERE" text
                    this.ctx.font = 'bold 10px Orbitron';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillStyle = `rgba(255, 170, 0, ${0.6 + pulse * 0.4})`;
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 8;
                    this.ctx.fillText('DELIVER HERE', 0, 30);
                    this.ctx.shadowBlur = 0;
                    
                    this.ctx.restore();
                }
                
                // --- BOUNTY TARGET MARKER (world-space red skull indicator) ---
                if (this.missions.activeMission && this.missions.activeMission.status === 'active'
                    && this.missions.activeMission.type === MISSION_TYPES.BOUNTY
                    && this.missions.activeMission.targetEntity
                    && !this.missions.activeMission.targetEntity.dead
                    && this.activeMap.id === 'hub_949') {
                    const target = this.missions.activeMission.targetEntity;
                    const pulse = (Math.sin(_frameTime / 300) + 1) / 2;
                    
                    this.ctx.save();
                    this.ctx.translate(target.x, target.y - 35);
                    
                    // Red diamond marker above target
                    this.ctx.shadowColor = '#ff3355';
                    this.ctx.shadowBlur = 10 + pulse * 8;
                    this.ctx.fillStyle = `rgba(255, 51, 85, ${0.7 + pulse * 0.3})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -10);
                    this.ctx.lineTo(7, 0);
                    this.ctx.lineTo(0, 10);
                    this.ctx.lineTo(-7, 0);
                    this.ctx.closePath();
                    this.ctx.fill();
                    
                    // Skull icon (simplified)
                    this.ctx.fillStyle = '#fff';
                    this.ctx.font = 'bold 8px sans-serif';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('☠', 0, 4);
                    
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
            
                // Grid (Faint) - WITH VIEWPORT CULLING
                this.ctx.strokeStyle = 'rgba(164, 105, 255, 0.1)'; 
                this.ctx.lineWidth = 1;
                const gridSize = 100; 
                
                // Calculate visible area
                const halfW = (this.canvas.width / this.camera.zoom) / 2 + gridSize;
                const halfH = (this.canvas.height / this.camera.zoom) / 2 + gridSize;
                const gridMinX = Math.max(0, Math.floor((camX - halfW) / gridSize) * gridSize);
                const gridMaxX = Math.min(this.activeMap.width, Math.ceil((camX + halfW) / gridSize) * gridSize);
                const gridMinY = Math.max(0, Math.floor((camY - halfH) / gridSize) * gridSize);
                const gridMaxY = Math.min(this.activeMap.height, Math.ceil((camY + halfH) / gridSize) * gridSize);
                
                this.ctx.beginPath(); 
                for(let x = gridMinX; x <= gridMaxX; x += gridSize) { 
                    this.ctx.moveTo(x, gridMinY); 
                    this.ctx.lineTo(x, gridMaxY); 
                } 
                for(let y = gridMinY; y <= gridMaxY; y += gridSize) { 
                    this.ctx.moveTo(gridMinX, y); 
                    this.ctx.lineTo(gridMaxX, y); 
                } 
                this.ctx.stroke();
                
                // Map Walls
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                {
                    const visibleWalls = this._renderGridWalls.query(cullBounds.world);
                    for (const w of visibleWalls) {
                        this.ctx.fillStyle = '#222'; 
                        this.ctx.fillRect(w.x, w.y, w.w, w.h); 
                        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)'; 
                        this.ctx.strokeRect(w.x, w.y, w.w, w.h); 
                    }
                }
            
                // Indoor V2: Doors (drawn OVER walls so they're visible in wall gaps)
                if (this.roomSystem.active) {
                    this.roomSystem.drawDoors(this.ctx);
                }
            
                // 3. DYNAMIC ENTITIES & CARS
                // PERFORMANCE: AABB viewport culling for props
                {
                    const cbP = cullBounds.props;
                    this.props.forEach(p => {
                        const px = p.x + (p.w || 0) / 2;
                        const py = p.y + (p.h || 0) / 2;
                        if (px < cbP.left || px > cbP.right || py < cbP.top || py > cbP.bottom) return;
                        p.draw(this.ctx);
                    });
                }
                
                // Draw Traffic Cars
                // PERFORMANCE: AABB viewport culling + distance LOD
                {
                    const cbV = cullBounds.vehicles;
                    this.traffic.vehicles.forEach(v => {
                        if (!v.visible) return;
                        if (v.x < cbV.left || v.x > cbV.right || v.y < cbV.top || v.y > cbV.bottom) return;
                        // LOD: 0 = full effects, 1 = no glows/shadows
                        // Threshold scales with zoom — distant cars at max zoom-out skip effects earlier
                        const dx = v.x - camX, dy = v.y - camY;
                        v._lod = (dx * dx + dy * dy > _vehicleLODThreshSq) ? 1 : (_zoomLOD >= 2 ? 1 : 0);
                        v.draw(this.ctx);
                    });
                }
                
                // Draw Owned Car (if parked/separate)
                if (this.ownedCar && this.ownedCar !== this.car && this.ownedCar.visible) {
                    this.ownedCar.draw(this.ctx);
                }
                
                // Draw Delivery Vehicle (persistent, never despawns)
                if (this.deliveryVehicle && this.deliveryVehicle.visible) {
                    const cbV = cullBounds.vehicles;
                    const dv = this.deliveryVehicle;
                    if (!(dv.x < cbV.left || dv.x > cbV.right || dv.y < cbV.top || dv.y > cbV.bottom)) {
                        dv._lod = 0;
                        dv.draw(this.ctx);
                        
                        // Draw amber package beside the vehicle (if delivery mission active, not yet picked up)
                        if (this.missions.activeMission && this.missions.activeMission.type === MISSION_TYPES.DELIVERY
                            && !this.missions.activeMission.pickedUp) {
                            const pkgX = dv.x + Math.cos(dv.angle + Math.PI / 2) * (dv.vehicleWidth / 2 + 15);
                            const pkgY = dv.y + Math.sin(dv.angle + Math.PI / 2) * (dv.vehicleWidth / 2 + 15);
                            const pulse = (Math.sin(_frameTime / 500) + 1) / 2;
                            
                            this.ctx.save();
                            this.ctx.translate(pkgX, pkgY);
                            
                            // Glow
                            this.ctx.shadowColor = '#ffaa00';
                            this.ctx.shadowBlur = 8 + pulse * 6;
                            
                            // Amber box
                            this.ctx.fillStyle = '#cc8800';
                            this.ctx.fillRect(-8, -6, 16, 12);
                            
                            // Champagne stripe
                            this.ctx.fillStyle = '#f5e6c8';
                            this.ctx.fillRect(-8, -1, 16, 2);
                            
                            // Vertical champagne stripe
                            this.ctx.fillRect(-1, -6, 2, 12);
                            
                            // Box edge highlight
                            this.ctx.strokeStyle = '#ffcc44';
                            this.ctx.lineWidth = 0.5;
                            this.ctx.strokeRect(-8, -6, 16, 12);
                            
                            this.ctx.shadowBlur = 0;
                            this.ctx.restore();
                        }
                    }
                }
            
                this.lastKnownMarkers.forEach(m => m.draw(this.ctx));
                
                // PERFORMANCE: AABB viewport culling for entities
                {
                    const cbE = cullBounds.entities;
                    this.loot.forEach(l => {
                        if (l.x < cbE.left || l.x > cbE.right || l.y < cbE.top || l.y > cbE.bottom) return;
                        l.draw(this.ctx);
                    });
                    this.npcs.forEach(n => {
                        if (n.x < cbE.left || n.x > cbE.right || n.y < cbE.top || n.y > cbE.bottom) return;
                        n.draw(this.ctx);
                    });
                    this.pedestrians.draw(this.ctx, cbE); // Roaming civilians
                    this.teammates.forEach(tm => {
                        if (tm.x < cbE.left || tm.x > cbE.right || tm.y < cbE.top || tm.y > cbE.bottom) return;
                        tm.draw(this.ctx, this.player);
                    });
                    // Velvet Cat
                    if (this.velvetCat && this.velvetCat.visible && !this.velvetCat.inCar) {
                        this.velvetCat.draw(this.ctx);
                    }
                    this.enemies.forEach(e => {
                        if (e.x < cbE.left || e.x > cbE.right || e.y < cbE.top || e.y > cbE.bottom) return;
                        e.draw(this.ctx);
                    });
                    
                    // Sticky Orbs (Golden Child DOT — rendered on top of enemies)
                    for (const orb of this.stickyOrbs) {
                        if (!orb.target || orb.target.dead) continue;
                        const ox = orb.target.x + orb.offsetX;
                        const oy = orb.target.y + orb.offsetY;
                        // Smooth shrink as ticks deplete
                        const lifeRatio = orb.ticksLeft / orb.maxTicks;
                        const r = Math.max(orb.maxRadius * lifeRatio, 1);
                        
                        // Outer pulse glow
                        const pulse = 0.4 + 0.3 * Math.sin(_frameTime / 150);
                        this.ctx.shadowColor = '#FFD700';
                        this.ctx.shadowBlur = 8;
                        this.ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
                        this.ctx.beginPath();
                        this.ctx.arc(ox, oy, r + 2, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // Core orb
                        this.ctx.fillStyle = '#FFD700';
                        this.ctx.beginPath();
                        this.ctx.arc(ox, oy, r, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // White hot center
                        this.ctx.fillStyle = '#fffbe6';
                        this.ctx.beginPath();
                        this.ctx.arc(ox, oy, r * 0.4, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.shadowBlur = 0;
                    }
                }
                
                // Active Car (The one player is driving)
                if (this.car.visible) this.car.draw(this.ctx);
                
                // Bumper Car Minigame — draw all bumper cars
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    this.bumperMinigame.draw(this.ctx, this.camera);
                }
                
                // Indoor V2: Roof occlusion (fades in when player is on outdoor segment)
                if (this.roomSystem.active) {
                    this.roomSystem.drawRoofOcclusion(this.ctx);
                }
                
                // Flit VFX (ghost afterimage, lightning trails — drawn behind player)
                if (this.flitVFX.length > 0) this.drawFlitVFX(this.ctx);

                // Player
                if (this.player.visible) { 
                    if (this.flitState.active) this.ctx.globalAlpha = 0.5; 
                    this.drawPlayer(); 
                    this.ctx.globalAlpha = 1.0; 
                    this.drawPlayerEmote();
                }
                
                // ── UNIFIED BUBBLE PASS ──
                // Speech bubbles (NPC + pedestrian) draw AFTER all character
                // bodies so they're never covered by the player, teammates,
                // or other NPCs walking past. They still go under building
                // roofs, foliage canopy, and weather — those layers come
                // later in the render order, which is intentional: an
                // indoor pedestrian's bubble shouldn't punch through the
                // roof when you're standing outside.
                {
                    const cbE = cullBounds.entities;
                    for (const n of this.npcs) {
                        if (!n.quipText) continue;
                        if (n.x < cbE.left || n.x > cbE.right || n.y < cbE.top || n.y > cbE.bottom) continue;
                        n.drawQuipBubble(this.ctx);
                    }
                    this.pedestrians.drawQuipBubbles(this.ctx, cbE);
                    // Teammates can theoretically have quipText too (shared NPC class)
                    for (const tm of this.teammates) {
                        if (!tm.quipText) continue;
                        if (tm.x < cbE.left || tm.x > cbE.right || tm.y < cbE.top || tm.y > cbE.bottom) continue;
                        tm.drawQuipBubble(this.ctx);
                    }
                }
                
                // Laser Sight beam (drawn after player, in world space) — from the gun's muzzle
                // along the exact line the next shot takes (see getLaserSight / fireWeapon)
                const laser = this.getLaserSight();
                if (laser) {
                    const muzzleX = laser.x0, muzzleY = laser.y0, hitX = laser.x1, hitY = laser.y1;
                    
                    // Red laser beam
                    this.ctx.save();
                    this.ctx.strokeStyle = 'rgba(255, 20, 0, 0.35)';
                    this.ctx.lineWidth = 1.5;
                    this.ctx.setLineDash([6, 4]);
                    this.ctx.beginPath();
                    this.ctx.moveTo(muzzleX, muzzleY);
                    this.ctx.lineTo(hitX, hitY);
                    this.ctx.stroke();
                    this.ctx.setLineDash([]);
                    
                    // Bright dot at hit point
                    const dotPulse = 0.6 + 0.35 * Math.sin(_frameTime / 200);
                    this.ctx.fillStyle = `rgba(255, 0, 0, ${dotPulse})`;
                    this.ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
                    this.ctx.shadowBlur = 4;
                    this.ctx.beginPath();
                    this.ctx.arc(hitX, hitY, 2.5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
                
                // Passenger lean-out rendering — draw in-car companions at their seat positions
                // Uses drawProceduralHumanoid with isDriving flag for unified lean-out animation
                // Drawn BEFORE the car overlay so the car body partially covers them
                if (this.isDriving && this.car && this.car.seatLayout) {
                    for (let i = 1; i < this.car.seatLayout.length; i++) {
                        const occ = this.car.seatOccupants[i];
                        if (!occ || occ === true || !occ.inCar) continue;
                        
                        const seat = this.car.seatLayout[i];
                        const seatPos = this.car.getSeatWorldPos(i);
                        
                        // Draw at seat position (no lean offset)
                        const drawX = seatPos.x;
                        const drawY = seatPos.y;
                        
                        // Resolve appearance — teammates have it, dancers need defaults
                        const isShooting = occ.cooldown !== undefined && occ.cooldown > 0;
                        const app = occ.appearance || {};
                        const isDemon = occ.role === 'red_demon_dancer';
                        const isDancer = occ.role === 'dancer' || isDemon;
                        
                        // Build appearance config with fallbacks for dancers
                        const skinColor = app.skinColor || (isDemon ? '#8b2500' : '#c68642');
                        const topColor = app.top || (isDemon ? { type: 'sports_bra', color: '#440000' } : { type: 'sports_bra', color: '#ff55aa' });
                        const bottomColor = app.bottom || (isDemon ? { type: 'skirt', color: '#220000' } : { type: 'skirt', color: '#ff88cc' });
                        const shoesColor = app.shoes || { type: 'heels', color: isDemon ? '#660000' : '#ff69b4' };
                        const hairConfig = app.hair || (isDemon ? { type: 'long', color: '#330000' } : { type: 'curls', color: '#111' });
                        
                        // Set up canvas context — translate to seat position, rotate
                        // In combat: face target. Otherwise: face car forward.
                        const occAngle = (occ.combatTargetTimer > 0 && occ.combatTargetAngle !== undefined)
                            ? occ.combatTargetAngle
                            : this.car.angle;
                        this.ctx.save();
                        this.ctx.translate(drawX, drawY);
                        this.ctx.rotate(occAngle);
                        
                        drawProceduralHumanoid(this.ctx, occ, {
                            skinColor: skinColor,
                            gender: occ.gender || 'female',
                            isDriving: true,
                            isShootingFromCar: isShooting,
                            carAngle: this.car.angle,
                            recoil: isShooting ? 0.5 : 0,
                            stance: isShooting ? 'pistol' : 'idle',
                            top: topColor,
                            bottom: bottomColor,
                            shoes: shoesColor,
                            hair: hairConfig,
                            hat: app.hat || null
                        });
                        
                        this.ctx.restore();
                    }
                }
                
                // Car Door Frame Overlay (creates "leaning out" illusion)
                // Drawn AFTER player/occupants to make them appear INSIDE the car
                if (this.isDriving && this.car.visible && this.car.drawOccupantOverlay) {
                    this.car.drawOccupantOverlay(this.ctx);
                }
                
                // DEBUG: Draw red center dots for in-car occupants ON TOP of the car overlay
                if (this.debugMode && this.isDriving && this.car && this.car.seatLayout) {
                    for (let i = 1; i < this.car.seatLayout.length; i++) {
                        const occ = this.car.seatOccupants[i];
                        if (!occ || occ === true || !occ.inCar) continue;
                        const seat = this.car.seatLayout[i];
                        const seatPos = this.car.getSeatWorldPos(i);
                        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
                        this.ctx.beginPath();
                        this.ctx.arc(seatPos.x, seatPos.y, 3, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    // Player driver dot
                    const driverPos = this.car.getSeatWorldPos(0);
                    if (driverPos) {
                        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
                        this.ctx.beginPath();
                        this.ctx.arc(driverPos.x, driverPos.y, 3, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }
                
                // Ferris Wheel BASE (legs/shadow — under building roofs)
                if (this.activeMap.ferrisWheel) {
                    this.activeMap.ferrisWheel.drawBase(this.ctx);
                }
                
                // Buildings - TOP LAYER (roofs, upper floors) - drawn OVER player for occlusion
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.buildings) {
                    const cb = cullBounds.buildingTops;
                    this.activeMap.buildings.forEach(b => {
                        if (b.isV2 && b.drawTop) {
                            const bRight = b.x + (b.w || 200);
                            const bBottom = b.y + (b.h || 200);
                            if (bRight < cb.left || b.x > cb.right || bBottom < cb.top || b.y > cb.bottom) return;
                            
                            b.drawTop(this.ctx, this.worldMinutes);
                        }
                    });
                }
                
                // Billboards — tilted panels standing up from the ground, drawn over the player like roofs
                if (this.activeMap.billboards) {
                    for (const bb of this.activeMap.billboards) if (bb.inView(cullBounds.buildingTops)) bb.drawTop(this.ctx);
                }

                // BuildingV3 — Editor-exported buildings (full render with details)
                if (this.activeMap._v3Buildings) {
                    this.activeMap._v3Buildings.forEach(b => {
                        b.draw(this.ctx, performance.now());
                    });
                }
                
                // Buildings - SIGN LAYER (neon signs above entrance) - drawn OVER building tops
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.buildings) {
                    const cb = cullBounds.buildingTops;
                    this.activeMap.buildings.forEach(b => {
                        if (b.isV2 && b.drawSign) {
                            const bRight = b.x + (b.w || 200);
                            const bBottom = b.y + (b.h || 200);
                            if (bRight < cb.left || b.x > cb.right || bBottom < cb.top || b.y > cb.bottom) return;
                            
                            b.drawSign(this.ctx);
                        }
                    });
                }
                
                // Foliage (trees and bushes) - drawn AFTER player so canopy appears overhead
                // PERFORMANCE: AABB viewport culling + cached frameTime
                if (this.activeMap.foliage) {
                    const wind = this.weather ? this.weather.wind : 0.3;
                    const windDir = this.weather ? this.weather.windDirection : 1;
                    const cb = cullBounds.foliage;
                    const foliageScale = GameSettings.getFoliageScale();
                    this.activeMap.foliage.forEach((f, idx) => {
                        // Density culling: skip foliage based on setting (uses stable index so same trees always hidden)
                        if (foliageScale < 1.0 && (idx % Math.round(1 / foliageScale)) !== 0) return;
                        if (f.x < cb.left || f.x > cb.right || f.y < cb.top || f.y > cb.bottom) return;
                        f.draw(this.ctx, wind, windDir, _gameTimeSec);  // smooth game time (was sampled once per tick)
                    });
                }
                
                // Floating leaf particles - drawn after foliage, before weather
                if (this.leafParticles) {
                    this.leafParticles.draw(this.ctx);
                }
                
                // Ferris Wheel TOP (rims, gondolas, hub — above buildings, trees, everything)
                if (this.activeMap.ferrisWheel) {
                    this.activeMap.ferrisWheel.drawTop(this.ctx);
                }
                
                // Indoor V2: Silk linens (atmospheric cloth with pooled light)
                if (this.roomSystem.active && this.roomSystem.linens.length > 0) {
                    const wind = this.weather ? this.weather.wind : 0.3;
                    const windDir = this.weather ? this.weather.windDirection : 1;
                    this.roomSystem.drawLinens(this.ctx, wind, windDir, _gameTimeSec);
                }
                
                // Top Layer Props (Lamps/Weather)
                
                // 1. Calculate daylight intensity (pre-calculated above)
                // Lamps turn OFF when daylight value is > 0.2
            
                // 2. Draw lamps passing the calculated daylight factor
                // PERFORMANCE: AABB viewport culling
                const cbLamps = cullBounds.lamps;
                const _roofHidesIndoorLamps = this.roomSystem.active && (this.roomSystem._roofOpacity || 0) > 0.3;
                this.lamps.forEach(l => {
                    if (l.x < cbLamps.left || l.x > cbLamps.right || l.y < cbLamps.top || l.y > cbLamps.bottom) return;
                    // Skip indoor lamps when roof is occluding
                    if (_roofHidesIndoorLamps) {
                        for (const rid in this.roomSystem.rooms) {
                            const r = this.roomSystem.rooms[rid];
                            if (r.type !== 'outdoor' && l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h) return;
                        }
                    }
                    // Set per-frame forced-off flag for room light switches
                    l._forcedOff = this.roomSystem.isLampRoomDark(l);
                    l.draw(this.ctx, daylight);
                }); 
            
                // 3. Draw projectiles and weather effects
                this.projectiles.forEach(p => p.draw(this.ctx));
                
                // Debug: nav grid, companion paths and eyeline spots
                // (with the debug overlay, or on its own via `game.navDebug = true`)
                if (this.debugMode || this.navDebug) this.drawNavDebug(this.ctx);

                // Debug: visualize ALL projectile positions (catches invisible ghosts)
                if (this.debugMode) {
                    // Show game array projectiles as green dots
                    this.ctx.save();
                    for (const p of this.projectiles) {
                        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
                        this.ctx.beginPath();
                        this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    // Show registry projectiles as red dots (orphans would be red WITHOUT green)
                    const regProjs = GameEntity.registry.collidable.filter(e => 
                        e.collisionLayer === GameEntity.LAYER.PROJECTILE
                    );
                    for (const rp of regProjs) {
                        this.ctx.fillStyle = rp.active ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 255, 0, 0.4)';
                        this.ctx.beginPath();
                        this.ctx.arc(rp.x, rp.y, 10, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    this.ctx.restore();
                    
                    // Debug: Seat positions on player's car and nearby vehicles
                    if (this.isDriving && this.car && this.car.seatLayout) {
                        this.ctx.save();
                        const car = this.car;
                        for (let i = 0; i < car.seatLayout.length; i++) {
                            const seat = car.seatLayout[i];
                            const pos = car.getSeatWorldPos(i);
                            const occupied = car.seatOccupants[i] != null;
                            
                            // Seat dot
                            this.ctx.fillStyle = seat.isDriver ? 'rgba(255,215,0,0.8)' : 
                                occupied ? 'rgba(0,255,136,0.8)' : 'rgba(255,255,255,0.3)';
                            this.ctx.beginPath();
                            this.ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
                            this.ctx.fill();
                            
                            // Firing arc (180° hemisphere) — only for non-driver seats
                            if (!seat.isDriver) {
                                const arcCenter = car.angle + seat.fireAngle;
                                this.ctx.strokeStyle = occupied ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)';
                                this.ctx.lineWidth = 1;
                                this.ctx.beginPath();
                                this.ctx.arc(pos.x, pos.y, 30, arcCenter - Math.PI / 2, arcCenter + Math.PI / 2);
                                this.ctx.stroke();
                                
                                // Arc direction line
                                this.ctx.strokeStyle = occupied ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.15)';
                                this.ctx.beginPath();
                                this.ctx.moveTo(pos.x, pos.y);
                                this.ctx.lineTo(pos.x + Math.cos(arcCenter) * 25, pos.y + Math.sin(arcCenter) * 25);
                                this.ctx.stroke();
                            }
                            
                            // Seat label
                            this.ctx.fillStyle = '#fff';
                            this.ctx.font = '8px monospace';
                            this.ctx.textAlign = 'center';
                            this.ctx.fillText(`S${i}`, pos.x, pos.y - 7);
                        }
                        this.ctx.restore();
                    }
                    
                    // HUD counter (screen space)
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    this.ctx.fillStyle = '#0f0';
                    this.ctx.font = '12px monospace';
                    this.ctx.fillText(`PROJ array: ${this.projectiles.length}  |  registry: ${regProjs.length}`, 10, this.canvas.height - 30);
                    this.ctx.restore();
                }
                
                this.weather.draw(this.ctx);
                
                // Graveyard humanoid ghosts
                if (this.graveyardGhosts.length > 0) this.drawGraveyardGhosts(this.ctx);
                
                this.profiler.stop('Render:Entities');
                
                // 4. LIGHTING SYSTEM & DEBUG
                this.profiler.start('Render:Lighting');
                this.drawLightingSystem(this.ctx);
                // Glowing details drawn after the darkness layer: windows, neon, rooftops, sky
                this.drawEmissivePass(this.ctx);
                
                // Profiler (independent of debug mode)
                if (this.showProfiler) {
                    this.profiler.draw(this.ctx, 20, 150); 
                }
                
                // Debug Overlay (traffic network, entity stats, lighting debug)
                if (this.debugMode) {
                    this.drawDebugLighting(this.ctx);
                    
                    // Entity System Stats (Screen Space)
                    if (this.useNewCollisionSystem) {
                        this.ctx.save();
                        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                        
                        // Background panel
                        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                        this.ctx.fillRect(10, 400, 180, 105);
                        this.ctx.strokeStyle = '#00ff88';
                        this.ctx.lineWidth = 1;
                        this.ctx.strokeRect(10, 400, 180, 105);
                        
                        // Stats
                        this.ctx.font = 'bold 12px Consolas';
                        this.ctx.fillStyle = '#00ff88';
                        this.ctx.fillText('ENTITY SYSTEM', 20, 418);
                        
                        this.ctx.font = '11px Consolas';
                        this.ctx.fillStyle = '#00ffaa';
                        this.ctx.fillText(`Entities: ${GameEntity.registry.all.length}`, 20, 435);
                        this.ctx.fillText(`Collidable: ${GameEntity.registry.collidable.length}`, 20, 450);
                        this.ctx.fillText(`Checks: ${CollisionSystem.stats.totalChecks}`, 20, 465);
                        this.ctx.fillText(`Resolved: ${CollisionSystem.stats.collisionsResolved}`, 20, 480);
                        this.ctx.fillText(`Pedestrians: ${this.pedestrians.pedestrians.length}`, 20, 495);
                        
                        this.ctx.restore();
                    }
                }
            
                this.ctx.restore();
                
                this.profiler.stop('Render:Lighting');
                
                // 5. SCREEN SPACE UI (Overlays)
                this.profiler.start('Render:PostFX');
                
                // Wet-world post-processing (after lighting, before rain)
                const ambient = this.getAmbientDarkness();
                if (ambient > 0.2) {
                    this.drawWetReflections(this.ctx);
                    this.drawBloomPass(this.ctx);
                }
                this.drawAtmospherePass(this.ctx);
                
                const showRainOverlay = this.activeMap.type === 'outdoor' || this.roomSystem.isPlayerOutdoor();
                if (showRainOverlay) {
                    const rainLamps = this.activeMap._interiorLights ? [...this.lamps, ...this.activeMap._interiorLights] : this.lamps;
                    this.weather.drawRainOverlay(this.ctx, this.camera, rainLamps);
                }
                
                // Dynamic Bokeh (Screen-space dreampunk depth-of-field)
                if (this.bokeh) {
                    this.bokeh.update(this.deltaTime || 16);
                    this.bokeh.draw(this.ctx, this.canvas.width, this.canvas.height, _frameTime);
                }
                
                // Mission waypoint marker (screen-space indicator)
                if (this.missions.activeMission && this.missions.activeMission.status === 'active' 
                    && this.activeMap && this.activeMap.id === 'hub_949') {
                    this.drawMissionMarker();
                }
                
                // HUD mission objective text (top of screen)
                if (this.missions.activeMission && this.missions.activeMission.status === 'active') {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    const objText = this.missions.getObjectiveText();
                    if (objText) {
                        this.ctx.font = 'bold 11px Courier New';
                        this.ctx.textAlign = 'center';
                        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        this.ctx.fillRect(this.canvas.width / 2 - 200, 4, 400, 20);
                        this.ctx.fillStyle = '#ffaa00';
                        this.ctx.globalAlpha = 0.8 + 0.2 * Math.sin(_frameTime / 500);
                        this.ctx.fillText(objText, this.canvas.width / 2, 18);
                    }
                    this.ctx.restore();
                }
                
                // Vehicle HUD Info (bottom-left)
                if (this.isDriving && this.car && !(this.bumperMinigame && this.bumperMinigame.active)) {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen space
                    
                    const isOwnedCar = this.car === this.ownedCar;
                    const isZibRide = this.zibSystem && this.zibSystem.isPassenger;
                    const vhudY = this.canvas.height - 40;
                    this.ctx.font = 'bold 7px Courier New';
                    this.ctx.fillStyle = isZibRide ? '#8a2be2' : isOwnedCar ? '#FFD700' : '#ffaa00';
                    this.ctx.shadowColor = isZibRide ? '#8a2be2' : isOwnedCar ? '#FFD700' : '#ffaa00';
                    this.ctx.shadowBlur = 4;
                    this.ctx.textAlign = 'left';
                    
                    const vehicleText = isZibRide ?
                        '► ZIB AUTONOMOUS TAXI (PASSENGER)' :
                        isOwnedCar ? 
                        `► ${this.garage.getDisplayName(this.garage.activeIndex).toUpperCase()} (YOUR CAR)` : 
                        `► ${this.car.brand.toUpperCase()} ${this.car.modelName.toUpperCase()} (HIJACKED)`;
                    this.ctx.fillText(vehicleText, 20, vhudY);
                    
                    if (!isOwnedCar && this.ownedCar.visible) {
                        const dx = this.ownedCar.x - this.player.x;
                        const dy = this.ownedCar.y - this.player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        this.ctx.font = '6px Courier New';
                        this.ctx.fillStyle = '#FFD700';
                        this.ctx.shadowColor = '#FFD700';
                        this.ctx.shadowBlur = 3;
                        this.ctx.fillText(`YOUR CAR: ${Math.round(distance)}m away`, 20, vhudY + 9);
                    }
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
                
                // 6. CSS FILTERS (Night Vision / Grayscale / Color Grade)
                const targetNV = this.nightVision ? 1.0 : 0.0;
                this.nvIntensity += (targetNV - this.nvIntensity) * 0.08;
                
                // Color grade multipliers (from custom grade panel)
                const _gg = (typeof _gameGrade !== 'undefined') ? _gameGrade : null;
                const ggBright = _gg ? _gg.brightness / 100 : 1;
                const ggContrast = _gg ? _gg.contrast / 100 : 1;
                const ggSaturate = _gg ? _gg.saturate / 100 : 1;
                const ggExposure = _gg ? (1 + _gg.exposure / 200) : 1;
            
                let filterChain;
                if (this.nvIntensity > 0.98) {
                    filterChain = `grayscale(100%) brightness(${(1.4 * ggBright * ggExposure).toFixed(2)}) contrast(${(1.2 * ggContrast).toFixed(2)})`;
                    // Ms. Jean Soda: pink tinge over NV
                    if (this.player.buffSystem.isActive('jeanSoda')) {
                        filterChain = `grayscale(80%) brightness(${(1.4 * ggBright * ggExposure).toFixed(2)}) contrast(${(1.2 * ggContrast).toFixed(2)}) sepia(0.3) hue-rotate(300deg) saturate(${(1.5 * ggSaturate).toFixed(2)})`;
                    }
                } else {
                    if (this.player.visibility !== undefined) {
                        this.targetGrayscale = (1.0 - this.player.visibility) * 100;
                        this.visualGrayscale += (this.targetGrayscale - this.visualGrayscale) * 0.05;
                        if (this.visualGrayscale < 0.5) this.visualGrayscale = 0;
                    }
                    const sat = 1.4 * (1.0 - this.nvIntensity) * ggSaturate; 
                    const con = (1.35 + (0.15 * this.nvIntensity)) * ggContrast; 
                    const sepia = 0.18 * (1.0 - this.nvIntensity);
                    const bright = (1.1 + (1.4 * this.nvIntensity)) * ggBright * ggExposure;
                    const effectiveGray = Math.max(this.visualGrayscale, this.nvIntensity * 100);
                    filterChain = `grayscale(${effectiveGray.toFixed(0)}%) contrast(${con.toFixed(2)}) saturate(${sat.toFixed(2)}) sepia(${sepia.toFixed(2)}) brightness(${bright.toFixed(2)})`;
                    // Ms. Jean Soda: subtle pink warmth even outside NV
                    if (this.player.buffSystem.isActive('jeanSoda')) {
                        filterChain += ` hue-rotate(8deg)`;
                    }
                }
                
                if (this.canvas.style.filter !== filterChain) {
                    this.canvas.style.filter = filterChain;
                }
                
                // ── ECHO PULSE TACTICAL RADAR ──
                if (this.augments && this.augments.isEquipped('radar_ext') && !this.paused) {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    
                    const RADAR_RADIUS = 60;
                    const RADAR_RANGE = 600;  // world-px detection radius
                    const cx = this.canvas.width - RADAR_RADIUS - 16;
                    const cy = this.canvas.height - RADAR_RADIUS - 60;
                    const playerX = this.isDriving && this.car ? this.car.x : this.player.x;
                    const playerY = this.isDriving && this.car ? this.car.y : this.player.y;
                    const scale = RADAR_RADIUS / RADAR_RANGE;
                    
                    // Background disc
                    this.ctx.globalAlpha = 0.35;
                    this.ctx.fillStyle = '#0a0a18';
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Concentric rings
                    this.ctx.globalAlpha = 0.2;
                    this.ctx.strokeStyle = '#00f3ff';
                    this.ctx.lineWidth = 0.5;
                    for (let r = 1; r <= 3; r++) {
                        this.ctx.beginPath();
                        this.ctx.arc(cx, cy, RADAR_RADIUS * r / 3, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                    
                    // Sweep line
                    this.ctx.globalAlpha = 0.25;
                    this.ctx.strokeStyle = '#00f3ff';
                    this.ctx.lineWidth = 1;
                    const sweepAngle = (_frameTime / 1200) % (Math.PI * 2);
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx, cy);
                    this.ctx.lineTo(cx + Math.cos(sweepAngle) * RADAR_RADIUS, cy + Math.sin(sweepAngle) * RADAR_RADIUS);
                    this.ctx.stroke();
                    
                    // Sweep trail (fading arc behind sweep line)
                    const sweepGrad = this.ctx.createConicGradient(sweepAngle - 0.8, cx, cy);
                    sweepGrad.addColorStop(0, 'rgba(0, 243, 255, 0)');
                    sweepGrad.addColorStop(0.12, 'rgba(0, 243, 255, 0.08)');
                    sweepGrad.addColorStop(0.13, 'rgba(0, 243, 255, 0)');
                    this.ctx.globalAlpha = 1.0;
                    this.ctx.fillStyle = sweepGrad;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Enemy blips (crimson)
                    this.ctx.globalAlpha = 0.9;
                    for (const e of this.enemies) {
                        if (e.dead || !e.active) continue;
                        const dx = (e.x - playerX) * scale;
                        const dy = (e.y - playerY) * scale;
                        if (Math.hypot(dx, dy) > RADAR_RADIUS - 2) continue;
                        this.ctx.fillStyle = '#ff2244';
                        this.ctx.shadowColor = '#ff2244';
                        this.ctx.shadowBlur = 4;
                        this.ctx.beginPath();
                        this.ctx.arc(cx + dx, cy + dy, 2.5, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    
                    // Friendly NPC blips (teal) — teammates
                    for (const n of this.npcs) {
                        if (!n.active || n.dead || n.alliance === 'hostile') continue;
                        if (!n.isRecruited) continue;
                        const dx = (n.x - playerX) * scale;
                        const dy = (n.y - playerY) * scale;
                        if (Math.hypot(dx, dy) > RADAR_RADIUS - 2) continue;
                        this.ctx.fillStyle = '#00f3ff';
                        this.ctx.shadowColor = '#00f3ff';
                        this.ctx.shadowBlur = 3;
                        this.ctx.beginPath();
                        this.ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    this.ctx.shadowBlur = 0;
                    
                    // Player dot (gold center)
                    this.ctx.globalAlpha = 1.0;
                    this.ctx.fillStyle = '#ffd700';
                    this.ctx.shadowColor = '#ffd700';
                    this.ctx.shadowBlur = 5;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                    
                    // Border ring
                    this.ctx.globalAlpha = 0.5;
                    this.ctx.strokeStyle = '#00f3ff';
                    this.ctx.lineWidth = 1.5;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Label
                    this.ctx.globalAlpha = 0.4;
                    this.ctx.fillStyle = '#00f3ff';
                    this.ctx.font = 'bold 7px Courier New';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('ECHO PULSE', cx, cy - RADAR_RADIUS - 4);
                    
                    this.ctx.restore();
                }
            
                this.profiler.stop('Render:PostFX');
                
                // --- PROFILER END ---
                this.profiler.stop('Render:Total');
                if (PerfBench.active) PerfBench.sample(this.profiler.frameDeltas());
                // Bench overlay draws regardless of the profiler panel state, so a
                // sweep is always visible while it runs.
                PerfBench.draw(this.ctx, 20, this.canvas.height - 110);
                this.profiler.tick(); 
            },

        });

