        /* =====================================================================
           BUILDING V2 - COMPLEX SHAPES & LAYERED RENDERING
           ---------------------------------------------------------------------
           Advanced building system with:
           - Complex polygon footprints (L-shapes, U-shapes, etc.)
           - Split rendering: drawBase() under player, drawTop() over player
           - Detailed facades with windows, balconies, architectural details
           - Procedural window lighting based on time of day
           ===================================================================== */
        class BuildingV2 {
            constructor(config) {
                this.isV2 = true;
                
                // Position & Identity
                this.x = config.x || 0;
                this.y = config.y || 0;
                this.id = config.id || 'building_' + Math.random().toString(36).substr(2, 9);
                this.label = config.label || '';
                this.type = config.type || 'apartment';
                
                // Shape: Array of {x, y, w, h} rectangles that form the building
                // Coordinates relative to this.x, this.y
                this.sections = config.sections || [{ x: 0, y: 0, w: 200, h: 150 }];
                
                // Calculate overall bounds
                this._calculateBounds();
                
                // Visual properties
                this.colors = {
                    roof: config.roofColor || '#1a1a22',
                    roofLight: config.roofLightColor || '#252530',
                    wall: config.wallColor || '#0a0a10',
                    wallLight: config.wallLightColor || '#151520',
                    accent: config.accentColor || '#a469ff',
                    window: config.windowColor || '#1a2a40',
                    windowLit: config.windowLitColor || '#ffd080',
                    windowFrame: config.windowFrameColor || '#1a1a25',
                    balcony: config.balconyColor || '#2a2a35'
                };
                
                // Building height (affects shadow and facade depth)
                this.floors = config.floors || 8;
                this.floorHeight = 12; // Visual height per floor in pixels
                // Design style (roof/facade/neon treatment); may adjust colors, floors, sign
                this._applyStyle(config);
                
                // Facade depth (3D effect on south/east walls)
                this.facadeDepth = this.floors * 3;
                
                // Windows configuration
                this.windowConfig = {
                    width: config.windowWidth || 12,
                    height: config.windowHeight || 16,
                    spacingX: config.windowSpacingX || 28,
                    spacingY: config.windowSpacingY || 24,
                    marginX: config.windowMarginX || 20,
                    marginY: config.windowMarginY || 15
                };
                
                // Balconies (array of {section, side, floors[]})
                this.balconies = config.balconies || [];
                
                // Rooftop props
                this.roofProps = config.roofProps || [];
                
                // Generate procedural details if not specified
                if (this.roofProps.length === 0) {
                    this._generateRoofProps();
                }
                
                // Attachments (signs, transitions, lights)
                this.attachedSign = null;
                this.attachedTransition = null;
                this.attachedLights = [];
                
                // Set up attachments from config
                if (config.sign) {
                    this._setupSign(config.sign);
                }
                if (config.door) {
                    this._setupDoor(config.door);
                }
                
                // Generate perimeter and accent lights
                this._generateLights();
                
                // Cache window states for performance
                this._windowStates = null;
                this._lastWindowUpdate = 0;
            }
            
            _calculateBounds() {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                this.sections.forEach(s => {
                    minX = Math.min(minX, s.x);
                    minY = Math.min(minY, s.y);
                    maxX = Math.max(maxX, s.x + s.w);
                    maxY = Math.max(maxY, s.y + s.h);
                });
                this.localBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
                this.w = this.localBounds.w;
                this.h = this.localBounds.h;
            }
            
            _generateRoofProps() {
                const seed = this.x + this.y;
                const random = (i) => {
                    const s = Math.sin(seed + i * 127.1) * 43758.5453;
                    return s - Math.floor(s);
                };
                
                // Add AC units
                this.sections.forEach((section, si) => {
                    if (section.w > 80 && section.h > 80) {
                        this.roofProps.push({
                            type: 'ac_unit',
                            section: si,
                            x: 15 + random(si * 10) * 30,
                            y: 15 + random(si * 10 + 1) * 30,
                            w: 35, h: 25
                        });
                    }
                    
                    // Water tank on larger sections
                    if (section.w > 150 && section.h > 150 && random(si * 20) > 0.5) {
                        this.roofProps.push({
                            type: 'water_tank',
                            section: si,
                            x: section.w - 60,
                            y: 20,
                            r: 25
                        });
                    }
                    
                    // Vents (fewer, larger)
                    const ventCount = Math.floor(section.w * section.h / 20000);
                    for (let i = 0; i < ventCount; i++) {
                        this.roofProps.push({
                            type: 'vent',
                            section: si,
                            x: 30 + random(si * 100 + i) * (section.w - 60),
                            y: 30 + random(si * 100 + i + 50) * (section.h - 60),
                            w: 15 + random(si * 100 + i + 25) * 15,
                            h: 15 + random(si * 100 + i + 75) * 15
                        });
                    }
                    
                    // Roof fans (exhaust fans scattered across roof)
                    const fanCount = Math.max(1, Math.floor(section.w * section.h / 12000));
                    for (let i = 0; i < fanCount; i++) {
                        this.roofProps.push({
                            type: 'roof_fan',
                            section: si,
                            x: 40 + random(si * 200 + i) * (section.w - 80),
                            y: 40 + random(si * 200 + i + 100) * (section.h - 80),
                            r: 10 + random(si * 200 + i + 50) * 6
                        });
                    }
                });
            }
            
            _setupSign(signConfig) {
                if (this.style === 'double_nights') { this.attachedSign = null; return; }   // its script sign is on the canopy (_dnDrawSign)
                const mainSection = this.sections[0];
                const titleCase = (str) => str.replace(/\w\S*/g, (txt) => 
                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
                
                // Position sign on roof near south edge (entrance area)
                this.attachedSign = new NeonSign(
                    this.x + mainSection.x + mainSection.w / 2,
                    this.y + mainSection.y + mainSection.h - 28, // Near south edge of roof
                    titleCase(signConfig.text),
                    signConfig.color || this.colors.accent,
                    (signConfig.size || 20) * 1.2, // Slightly smaller for roof
                    'Great Vibes'
                );
            }
            
            _setupDoor(doorConfig) {
                if (this.style === 'double_nights') { this._dnDoor(doorConfig); return; }   // the door is under the porte-cochère
                this._doorLightColor = doorConfig.lightColor || null;
                // Find the southernmost section for entrance
                let entranceSection = this.sections[0];
                let maxY = entranceSection.y + entranceSection.h;
                this.sections.forEach(s => {
                    if (s.y + s.h > maxY) {
                        entranceSection = s;
                        maxY = s.y + s.h;
                    }
                });
                
                this.attachedTransition = {
                    x: this.x + entranceSection.x + entranceSection.w / 2 - 50,
                    y: this.y + entranceSection.y + entranceSection.h + 10,
                    w: 100, h: 60,
                    target: doorConfig.target,
                    label: doorConfig.label
                };
                
                if (doorConfig.lightColor) {
                    this.attachedLights.push(new LampEntity({ x: this.x + entranceSection.x + entranceSection.w / 2, y: this.y + entranceSection.y + entranceSection.h - 5, lampType: 3, color: doorConfig.lightColor, lightRadius: 200 }));
                }
            }
            
            _generateLights() {
                if (this.style || this.id === 'shop_small') { this._generateStyledLights(); return; }
                const targetSpacing = 200; // Desired spacing between lamps
                const margin = 30;         // Inset from corners
                
                // Helper: place N lamps evenly along an edge from start to end
                const distributeAlongEdge = (x1, y1, x2, y2) => {
                    const edgeLen = Math.hypot(x2 - x1, y2 - y1);
                    const usableLen = edgeLen - margin * 2;
                    if (usableLen <= 0) return;
                    
                    const count = Math.max(1, Math.round(usableLen / targetSpacing));
                    const dx = (x2 - x1) / edgeLen;
                    const dy = (y2 - y1) / edgeLen;
                    const step = usableLen / count;
                    
                    for (let i = 0; i <= count; i++) {
                        const t = margin + i * step;
                        this.attachedLights.push(new LampEntity({
                            x: x1 + dx * t,
                            y: y1 + dy * t,
                            lampType: 3,
                            color: this.colors.accent,
                            lightRadius: 100
                        }));
                    }
                };
                
                this.sections.forEach(section => {
                    const sx = this.x + section.x;
                    const sy = this.y + section.y;
                    const sr = sx + section.w;
                    const sb = sy + section.h;
                    
                    // All four edges
                    distributeAlongEdge(sx, sy, sr, sy);  // Top
                    distributeAlongEdge(sx, sb, sr, sb);  // Bottom
                    distributeAlongEdge(sx, sy, sx, sb);  // Left
                    distributeAlongEdge(sr, sy, sr, sb);  // Right
                    
                    // Center light
                    this.attachedLights.push(new LampEntity({
                        x: sx + section.w / 2,
                        y: sy + section.h / 2,
                        lampType: 3,
                        color: this.colors.accent,
                        lightRadius: 400
                    }));
                });
            }
            
            regenerateLights() {
                this.attachedLights = [];
                this._generateLights();
                // Recreate door light if applicable (Silver Queen has its own entrance rig)
                if (this._doorLightColor && this.style !== 'silver_queen' && this.style !== 'double_nights') {
                    let entranceSection = this.sections[0];
                    let maxY = entranceSection.y + entranceSection.h;
                    this.sections.forEach(s => { if (s.y + s.h > maxY) { entranceSection = s; maxY = s.y + s.h; } });
                    this.attachedLights.push(new LampEntity({ x: this.x + entranceSection.x + entranceSection.w / 2, y: this.y + entranceSection.y + entranceSection.h - 5, lampType: 3, color: this._doorLightColor, lightRadius: 200 }));
                }
            }
            
            
            /**
             * Draw base layer (under player): shadow, ground floor, entrance.
             */
            drawBase(ctx) {
                if (this.style === 'double_nights') { this._dnDrawBase(ctx); return; }   // buildings/double-nights.js
                ctx.save();
                
                // Draw shadow for each section
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.sections.forEach(section => {
                    const sx = this.x + section.x;
                    const sy = this.y + section.y;
                    const shadowOffset = this.facadeDepth;
                    ctx.fillRect(sx + shadowOffset, sy + shadowOffset, section.w, section.h);
                });
                
                // Draw ground-level elements (entrance area, ground floor)
                this.sections.forEach(section => {
                    const sx = this.x + section.x;
                    const sy = this.y + section.y;
                    
                    // Ground floor footprint (slightly visible under building)
                    ctx.fillStyle = 'rgba(10, 10, 15, 0.3)';
                    ctx.fillRect(sx - 5, sy - 5, section.w + 10, section.h + 10);
                });
                
                ctx.restore();
            }
            
            /**
             * Draw top layer (over player): roof, facades, windows, details.
             */
            drawTop(ctx, worldMinutes = 1260) {
                if (this.style === 'double_nights' && typeof game !== 'undefined' && game.camera) { this._dnDrawTop(ctx); return; }
                if (CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera) { this._drawLeanTop(ctx); return; }
                ctx.save();
                
                // Draw each section
                this.sections.forEach((section, sectionIdx) => {
                    const sx = this.x + section.x;
                    const sy = this.y + section.y;
                    
                    // --- ROOF SURFACE ---
                    ctx.fillStyle = this.colors.roof;
                    ctx.fillRect(sx, sy, section.w, section.h);
                    
                    // Roof edge (dark border for depth)
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(sx, sy, section.w, section.h);
                    
                    // Roof texture (subtle grid - simplified for performance)
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
                    ctx.lineWidth = 1;
                    const gridStep = 40; // Larger steps = fewer draws
                    for (let gx = gridStep; gx < section.w; gx += gridStep) {
                        ctx.beginPath();
                        ctx.moveTo(sx + gx, sy);
                        ctx.lineTo(sx + gx, sy + section.h);
                        ctx.stroke();
                    }
                    for (let gy = gridStep; gy < section.h; gy += gridStep) {
                        ctx.beginPath();
                        ctx.moveTo(sx, sy + gy);
                        ctx.lineTo(sx + section.w, sy + gy);
                        ctx.stroke();
                    }
                    
                    // Inner roof highlight
                    ctx.strokeStyle = this.colors.roofLight;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(sx + 8, sy + 8, section.w - 16, section.h - 16);
                    
                });
                
                // --- ROOF PROPS (disabled for rework) ---
                // (Roof props removed - using simplified roof rendering)
                
                ctx.restore();
            }
            
            /**
             * Draw neon sign layer (ABOVE drawTop) - positioned over the entrance
             * so the player can see it while approaching the transition point.
             */
            drawSign(ctx) {
                if (this.style === 'double_nights') { if (typeof game !== 'undefined' && game.camera) this._dnDrawSign(ctx); return; }
                if (!this.attachedSign || !this.attachedTransition) return;
                
                ctx.save();
                
                const signText = this.attachedSign.text;
                const signFontSize = this.attachedSign.fontSize || 45;
                
                // Use building lamp color (accent) directly
                const lampColor = this.colors ? this.colors.accent : (this.attachedSign.color || '#a469ff');
                
                // Anchor to transition point center X, positioned just above it
                const transitionCenterX = this.attachedTransition.x + this.attachedTransition.w / 2;
                const transitionTopY = this.attachedTransition.y;
                
                const textX = transitionCenterX;
                let textY = transitionTopY - signFontSize / 2 - 20;
                // Silver Queen: the script sign stands on the portico roof, in the portico's height plane
                if (this.style === 'silver_queen' && CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera && this._sqPortico()) {
                    const sqG = this._sqPortico(), cam = game.camera, k = this._sqK(sqG.z);
                    ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                    textY = sqG.yf + SQ_PORTICO.depth * 0.5;
                    ctx.globalAlpha = Math.max(0.45, this._sqFade == null ? 1 : this._sqFade);
                }
                
                // --- FLICKER ENGINE ---
                // Multi-frequency sine waves create organic neon flicker
                const t = _frameTime;
                const seed = (this.x + this.y) * 7; // Per-building phase offset
                
                // Slow breathing (base intensity)
                const breathe = 0.85 + Math.sin((t + seed) / 1200) * 0.1;
                
                // Medium flutter (electrical hum)
                const flutter = 1.0 + Math.sin((t + seed * 1.3) / 80) * 0.04;
                
                // Fast micro-flicker (filament vibration)
                const micro = 1.0 + Math.sin((t + seed * 2.7) / 30) * 0.03;
                
                // Occasional brownout (rare, sharp dip)
                const brownoutCycle = Math.sin((t + seed * 0.5) / 4000);
                const brownout = brownoutCycle > 0.92 ? 0.4 + Math.random() * 0.3 : 1.0;
                
                // Combined flicker multiplier
                const flicker = breathe * flutter * micro * brownout;
                const alpha = Math.max(0.3, Math.min(1.0, flicker));
                
                // Parse lamp color to RGB for alpha manipulation
                const rgb = this._hexToRgb(lampColor);
                
                // --- GLOW RENDERING (no background) ---
                ctx.font = `${signFontSize}px "Great Vibes", cursive`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Zoom LOD: progressively reduce glow layers when zoomed out
                // Full (5 layers) → Reduced (2 layers) → Minimal (1 flat layer)
                if (_zoomLOD >= 2) {
                    // Minimal: single flat text, no blur
                    ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
                    ctx.fillText(signText, textX, textY);
                } else if (_zoomLOD >= 1) {
                    // Reduced: core glow + white center (2 layers)
                    ctx.shadowColor = lampColor;
                    ctx.shadowBlur = 15 * alpha;
                    ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
                    ctx.fillText(signText, textX, textY);
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = '#ffffff';
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * alpha})`;
                    ctx.fillText(signText, textX, textY);
                } else {
                // Full quality: 5 glow layers
                
                // Layer 0: Dark drop shadow (contrast backdrop)
                const shadowOffY = 3;
                ctx.shadowColor = '#000000';
                ctx.shadowBlur = 18;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                ctx.fillText(signText, textX, textY + shadowOffY);
                // Second pass for denser shadow
                ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillText(signText, textX, textY + shadowOffY);
                
                // Layer 1: Wide ambient glow (soft halo)
                ctx.shadowColor = lampColor;
                ctx.shadowBlur = 40 * alpha;
                ctx.fillStyle = `rgba(${rgb}, ${0.3 * alpha})`;
                ctx.fillText(signText, textX, textY);
                
                // Layer 2: Medium glow (main neon bloom)
                ctx.shadowBlur = 20 * alpha;
                ctx.fillStyle = `rgba(${rgb}, ${0.7 * alpha})`;
                ctx.fillText(signText, textX, textY);
                
                // Layer 3: Tight core glow
                ctx.shadowBlur = 8;
                ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
                ctx.fillText(signText, textX, textY);
                
                // Layer 4: White-hot center (neon tube core)
                ctx.shadowBlur = 4;
                ctx.shadowColor = '#ffffff';
                ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * alpha})`;
                ctx.fillText(signText, textX, textY);
                } // End full quality else block
                
                ctx.restore();
                if (this.style === 'silver_queen' && CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera) this._sqDrawColumns(ctx);
            }
            
            
            
            /**
             * Helper: Convert hex color to RGB string.
             */
            _hexToRgb(hex) { return hexToRgb(hex); }
            
            
            // Legacy compatibility
            draw(ctx, worldMinutes) {
                this.drawBase(ctx);
                this.drawTop(ctx, worldMinutes);
            }
            
            getBounds() {
                return {
                    x: this.x + this.localBounds.x,
                    y: this.y + this.localBounds.y,
                    w: this.localBounds.w,
                    h: this.localBounds.h
                };
            }
            
            /**
             * Return per-section collision AABBs in world coordinates.
             * For L-shaped or complex buildings, this returns one rect per section
             * instead of a single bounding box, so collision matches the drawn shape.
             */
            getCollisionShapes() {
                const shapes = this.sections.map(s => ({
                    x: this.x + s.x,
                    y: this.y + s.y,
                    w: s.w,
                    h: s.h
                }));
                // Silver Queen portico columns are solid (and cast shadows from the entrance light)
                if (this.style === 'silver_queen' && this._sqPortico()) {
                    for (const c of this._sqPortico().cols) shapes.push({ x: c.x - 5, y: c.y - 5, w: 10, h: 10 });
                }
                if (this.style === 'double_nights') for (const [x, y] of this._dnGeo().cols) shapes.push({ x: x - 5, y: y - 5, w: 10, h: 10 });   // the canopy's columns
                return shapes;
            }
        }
        
        /**
         * Factory function to create Silver Queen Apartments.
         */
        // =====================================================================
        //  BUILDING LEAN + STYLES (BuildingV2)
        // =====================================================================
        const _bldHash = (seed, i) => { const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return s - Math.floor(s); };

        // The city's curated palette: plum, charcoal and brass, ivory stone, rose, midnight
        const APARTMENT_PALETTES = [
            { name: 'plum',     roof: '#2a1c30', wall: '#22152a', accent: '#c89bff', lit: '#ffd8b0' },
            { name: 'charcoal', roof: '#25242b', wall: '#1c1b22', accent: '#e8c27a', lit: '#ffe2b0' },
            { name: 'ivory',    roof: '#3a3440', wall: '#2c2733', accent: '#f3e6d0', lit: '#fff1d6' },
            { name: 'rose',     roof: '#2e1d27', wall: '#26171f', accent: '#ff8fb8', lit: '#ffd6c8' },
            { name: 'midnight', roof: '#1d2032', wall: '#161827', accent: '#a9bfff', lit: '#e8eeff' },
            { name: 'brass',    roof: '#2c2419', wall: '#221b12', accent: '#e8b860', lit: '#ffe0a8' }
        ];
        const APARTMENT_NAMES = ['Luna Court', 'Velvet Arms', 'The Marlowe', 'Crescent House', 'Starlight Flats', 'Neon Terrace',
                                 'Orchid Row', 'Halcyon', 'The Violet', 'Moonrise', 'Echo Lofts', 'Solace Place', 'Nocturne', 'Aurelia'];

        Object.assign(BuildingV2.prototype, {
            _applyStyle(config) {
                this.style = config.style || null;
                if (!this.style) return;
                const seed = Math.round(this.x * 0.37 + this.y * 1.13);
                this._seed = seed;
                if (this.style === 'apartment') {
                    const r = (i) => _bldHash(seed, i);
                    const pal = APARTMENT_PALETTES[Math.floor(r(1) * APARTMENT_PALETTES.length)];
                    this.palette = pal;
                    Object.assign(this.colors, { roof: pal.roof, roofLight: lightenHex(pal.roof, 14), wall: pal.wall, accent: pal.accent, windowLitColor: pal.lit });
                    this.colors.windowLit = pal.lit;
                    if (!config.floors || config.floors === 6) this.floors = 4 + Math.floor(r(2) * 6);
                    // A name on the door instead of "APTS"
                    if (!config.sign || !config.sign.text || config.sign.text === 'APTS') {
                        config.sign = { text: APARTMENT_NAMES[Math.floor(r(3) * APARTMENT_NAMES.length)], color: pal.accent, size: 18 };
                    }
                    // Rooftop character: pick 3 features
                    const pool = ['pool', 'garden', 'laundry', 'tank', 'solar', 'lights', 'antenna', 'dish'];
                    const picked = [];
                    for (let i = 0; picked.length < 3 && i < 20; i++) {
                        const f = pool[Math.floor(r(10 + i) * pool.length)];
                        const clash = (f === 'pool' && picked.includes('garden')) || (f === 'garden' && picked.includes('pool')) || (f === 'lights' && picked.includes('laundry'));
                        if (!picked.includes(f) && !clash) picked.push(f);
                    }
                    this.roofFeatures = ['stair', ...picked];
                    this.facadeFeature = r(4) < 0.55 ? 'balconies' : 'fire_escape';
                } else if (this.style === 'double_nights') {
                    this.floors = DN.FLOORS; this.roofFeatures = []; this.emissiveReach = 950;   // crowns, beams (buildings/double-nights.js)
                } else if (this.style === 'silver_queen') {
                    this.roofFeatures = ['penthouse'];                     // the rest of the roof is _sqDrawRoof
                    this.facadeFeature = 'silver_queen';
                    this.emissiveReach = 700;                              // searchlight beams reach well past the footprint
                }
            },

            _generateStyledLights() {
                const t = this.attachedTransition;
                const accent = this.colors.accent;
                if (this.style === 'silver_queen' && t) { this._sqLights(); return; }
                if (this.style === 'double_nights') { this._dnLights(); return; }
                if (t) {
                    const cx = t.x + t.w / 2, cy = t.y - 10;
                    // Entrance pair, warm pool at the door — purposeful light instead of a bulb grid
                    this.attachedLights.push(new LampEntity({ x: cx - 46, y: cy, lampType: 3, color: accent, lightRadius: 120 }));
                    this.attachedLights.push(new LampEntity({ x: cx + 46, y: cy, lampType: 3, color: accent, lightRadius: 120 }));
                    this.attachedLights.push(new LampEntity({ x: cx, y: cy + 26, lampType: 4, color: '#ffe2b8', lightRadius: this.style === 'silver_queen' ? 260 : 170 }));
                    if (this.style === 'silver_queen') {   // the hexagon wing lamps
                        this.attachedLights.push(new LampEntity({ x: cx - 150, y: cy, lampType: 3, color: '#c8a8ff', lightRadius: 190 }));
                        this.attachedLights.push(new LampEntity({ x: cx + 150, y: cy, lampType: 3, color: '#c8a8ff', lightRadius: 190 }));
                    }
                }
            },

            /** Section edges with the parts shared between sections removed (so L-shapes don't grow inner walls). */
            _leanFaces() {
                if (this._faces) return this._faces;
                const faces = [];
                const S = this.sections.map(s => ({ x0: this.x + s.x, y0: this.y + s.y, x1: this.x + s.x + s.w, y1: this.y + s.y + s.h }));
                const subtract = (segs, a, b) => {                 // remove [a,b] from a list of [lo,hi]
                    const out = [];
                    for (const [lo, hi] of segs) {
                        if (b <= lo || a >= hi) { out.push([lo, hi]); continue; }
                        if (a > lo) out.push([lo, a]);
                        if (b < hi) out.push([b, hi]);
                    }
                    return out;
                };
                S.forEach((s, i) => {
                    const edges = [
                        { side: 'N', fixed: s.y0, lo: s.x0, hi: s.x1, horiz: true },
                        { side: 'S', fixed: s.y1, lo: s.x0, hi: s.x1, horiz: true },
                        { side: 'W', fixed: s.x0, lo: s.y0, hi: s.y1, horiz: false },
                        { side: 'E', fixed: s.x1, lo: s.y0, hi: s.y1, horiz: false }
                    ];
                    for (const e of edges) {
                        let segs = [[e.lo, e.hi]];
                        S.forEach((o, j) => {
                            if (j === i) return;
                            if (e.horiz) {
                                // Another section sitting against this edge hides it
                                if ((e.side === 'S' && Math.abs(o.y0 - e.fixed) < 1) || (e.side === 'N' && Math.abs(o.y1 - e.fixed) < 1)) segs = subtract(segs, o.x0, o.x1);
                            } else {
                                if ((e.side === 'E' && Math.abs(o.x0 - e.fixed) < 1) || (e.side === 'W' && Math.abs(o.x1 - e.fixed) < 1)) segs = subtract(segs, o.y0, o.y1);
                            }
                        });
                        for (const [lo, hi] of segs) {
                            if (hi - lo < 2) continue;
                            faces.push(e.horiz ? { side: e.side, section: i, x1: lo, y1: e.fixed, x2: hi, y2: e.fixed }
                                               : { side: e.side, section: i, x1: e.fixed, y1: lo, x2: e.fixed, y2: hi });
                        }
                    }
                });
                return (this._faces = faces);
            },

            _leanScale(extraFloors = 0) {
                const B = CONFIG.BUILDINGS;
                const h = (Math.min(this.floors, B.MAX_FLOORS) + extraFloors) * B.FLOOR_HEIGHT;
                return h / (leanCamHeight() - h);          // roof = cam + (p - cam) * (1 + s)
            },

            /** Faces the camera can see (outward side toward the camera). */
            _visibleFaces(cam) {
                return this._leanFaces().filter(f =>
                    (f.side === 'S' && cam.y > f.y1) || (f.side === 'N' && cam.y < f.y1) ||
                    (f.side === 'E' && cam.x > f.x1) || (f.side === 'W' && cam.x < f.x1));
            },

            _drawLeanTop(ctx) {
                const cam = game.camera, s = this._leanScale(), k = 1 + s;
                const P = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                const faces = this._visibleFaces(cam);
                ctx.save();
                // --- Walls ---
                const wall = this.colors.wall;
                for (const f of faces) {
                    const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                    const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                    const shade = f.side === 'S' ? 18 : f.side === 'N' ? -8 : 6;
                    const g = ctx.createLinearGradient((ax + bx) / 2, (ay + by) / 2, (cx + dx) / 2, (cy + dy) / 2);
                    g.addColorStop(0, darkenHex(wall, 6));
                    g.addColorStop(1, shade >= 0 ? lightenHex(wall, shade) : darkenHex(wall, -shade));
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
                    this._drawFaceWindows(ctx, f, P, false);
                    this._drawFaceFeature(ctx, f, P, false);
                }
                if (this.style === 'silver_queen') this._sqDrawPortico(ctx);
                // --- Roofs (drawn in world coords under the scale-about-camera transform) ---
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                const sq = this.style === 'silver_queen';
                this.sections.forEach(section => {
                    const sx = this.x + section.x, sy = this.y + section.y;
                    if (sq) {                                                                  // lavender slab with a soft sheen
                        const g = ctx.createLinearGradient(sx, sy, sx + section.w, sy + section.h);
                        g.addColorStop(0, SQ_THEME.roof); g.addColorStop(1, SQ_THEME.roofLo); ctx.fillStyle = g;
                    } else ctx.fillStyle = this.colors.roof;
                    ctx.fillRect(sx, sy, section.w, section.h);
                    if (sq) {                                                                  // a pearl sheen pooled toward the north-west corner
                        const pg = ctx.createRadialGradient(sx + section.w * 0.25, sy + section.h * 0.2, 10, sx + section.w * 0.25, sy + section.h * 0.2, Math.max(section.w, section.h) * 0.8);
                        pg.addColorStop(0, 'rgba(214,200,255,0.18)'); pg.addColorStop(1, 'rgba(214,200,255,0)');
                        ctx.fillStyle = pg; ctx.fillRect(sx, sy, section.w, section.h);
                    }
                    ctx.strokeStyle = sq ? 'rgba(217,191,134,0.08)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;          // tar seams
                    for (let gx = 36; gx < section.w; gx += 36) { ctx.beginPath(); ctx.moveTo(sx + gx, sy); ctx.lineTo(sx + gx, sy + section.h); ctx.stroke(); }
                    ctx.strokeStyle = sq ? SQ_THEME.trim : lightenHex(this.colors.roof, 22); ctx.lineWidth = sq ? 4 : 5;       // parapet
                    ctx.strokeRect(sx + 2.5, sy + 2.5, section.w - 5, section.h - 5);
                    if (sq) { ctx.strokeStyle = 'rgba(45,29,89,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 6, sy + 6, section.w - 12, section.h - 12); }
                });
                if (sq) this._sqRoofEdgeLights(ctx, false);
                if (this.style) this._drawRoofFeatures(ctx, false);
                else this._drawRoofProps(ctx);
                ctx.restore();
                if (sq) this._sqDrawCrown(ctx, false);
            },

            /** Emissive layer (after lighting): lit windows, neon trim, rooftop lights. dark = ambient darkness 0..1 */
            drawEmissive(ctx, dark) {
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                if (this.style === 'double_nights') { this._dnDrawEmissive(ctx, dark); return; }
                const cam = game.camera, s = this._leanScale(), k = 1 + s;
                const P = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                const glow = Math.max(0.15, Math.min(1, dark * 1.1));
                ctx.save();
                ctx.globalAlpha = glow;
                if (this.style === 'silver_queen') this._sqDark = dark;
                for (const f of this._visibleFaces(cam)) {
                    if (this.style && f.side === 'S' && this.attachedTransition) this._drawFrontWash(ctx, f, P);
                    this._drawFaceWindows(ctx, f, P, true); this._drawFaceFeature(ctx, f, P, true);
                }
                if (this.style === 'silver_queen') { this._sqEmissiveStructure(ctx, dark, glow); ctx.globalAlpha = glow; ctx.globalCompositeOperation = 'source-over'; }
                // Roof: rim light along parapets reads the silhouette at night, plus neon/rooftop lights
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                const rim = this.style ? this.colors.accent : '#8fa0c8';
                ctx.strokeStyle = rim; ctx.globalAlpha = glow * (this.style ? 0.55 : 0.18); ctx.lineWidth = this.style ? 1.6 : 1;
                if (this.style) { ctx.shadowColor = rim; ctx.shadowBlur = 8; }
                this.sections.forEach(section => ctx.strokeRect(this.x + section.x + 1, this.y + section.y + 1, section.w - 2, section.h - 2));
                ctx.shadowBlur = 0; ctx.globalAlpha = glow;
                if (this.style === 'silver_queen') this._sqRoofEdgeLights(ctx, true);
                if (this.style) this._drawRoofFeatures(ctx, true);
                ctx.restore();
                if (this.style === 'silver_queen') { this._sqVeil(ctx, dark); this._sqDrawCrown(ctx, true); this._sqDrawBeams(ctx, dark); }
            },

            /** Floodlight wash up the front face from the entrance lamps (accent-tinted). */
            _drawFrontWash(ctx, f, P) {
                if (this.style === 'silver_queen') return;               // Silver Queen lights its facade from the portico (_sqFace)
                const door = this.attachedTransition, doorX = door.x + door.w / 2;
                if (doorX < Math.min(f.x1, f.x2) - 40 || doorX > Math.max(f.x1, f.x2) + 40) return;
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                if (Math.hypot(dx - ax, dy - ay) < 6) return;
                const reach = this.style === 'silver_queen' ? 260 : 120;
                const g = ctx.createRadialGradient(doorX, ay, 0, doorX, ay, reach);
                g.addColorStop(0, hexToRgba(this.colors.accent, this.style === 'silver_queen' ? 0.55 : 0.35));
                g.addColorStop(1, hexToRgba(this.colors.accent, 0));
                ctx.save();
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.clip();
                ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
                ctx.fillRect(Math.min(ax, dx) - 5, Math.min(ay, dy, cy) - 5, Math.abs(bx - ax) + 10 + Math.abs(cx - bx), Math.abs(dy - ay) + 10);
                ctx.restore();
            },

            /** Window grid on a face. emissive=false: dark glass; true: only the lit windows, glowing. */
            _drawFaceWindows(ctx, f, P, emissive) {
                const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS);
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                const depth = Math.hypot(dx - ax, dy - ay);
                if (depth < floors * 1.6) return;                   // too edge-on to read
                const len = Math.hypot(bx - ax, by - ay);
                const cols = Math.max(1, Math.floor(len / (this.style === 'silver_queen' ? 30 : 26)));
                const at = (u, v) => {                                // u along edge, v up the wall
                    const x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u, x1 = dx + (cx - dx) * u, y1 = dy + (cy - dy) * u;
                    return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v];
                };
                const seed = this._seed || Math.round(this.x + this.y);
                const t = Math.floor(_gameTimeSec / 7);             // lights change every few seconds
                const lit = this.colors.windowLit || '#ffe2a8';
                const mask = this.facadeFeature === 'silver_queen' ? this._sqWindowMask(f) : null;
                // By day the glass holds the sky, brightest on faces turned to the sun, a sheen sliding along with it
                const sun = emissive ? null : sunNow(), day = sun ? sun.day : 0;
                let skyA = 0, sheenA = 0, uc = 0.5;
                if (day > 0.03) {
                    const nx = f.side === 'E' ? 1 : f.side === 'W' ? -1 : 0, ny = f.side === 'S' ? 1 : f.side === 'N' ? -1 : 0;
                    const facing = Math.max(0, nx * sun.dx + ny * sun.dy);
                    skyA = day * (0.3 + 0.34 * facing); sheenA = day * (0.18 + 0.6 * facing);
                    uc = 0.5 + 0.55 * (ny ? sun.dx : sun.dy);
                }
                const sq = this.style === 'silver_queen', glassRGB = sq ? '176, 158, 236' : '168, 172, 226';
                for (let fl = 0; fl < floors; fl++) {
                    const v0 = (fl + 0.28) / floors, v1 = (fl + 0.78) / floors;
                    for (let c = 0; c < cols; c++) {
                        if (mask && mask(fl, (c + 0.5) / cols)) continue;
                        const u0 = (c + 0.25) / cols, u1 = (c + 0.75) / cols;
                        const h = _bldHash(seed + f.section * 31 + (f.side.charCodeAt(0)), fl * 57 + c * 13 + (_bldHash(seed, fl + c) > 0.93 ? t : 0));
                        const isLit = h < (this.style ? 0.5 : 0.3);
                        if (emissive && !isLit) continue;
                        const q = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
                        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
                        if (emissive) {
                            const tv = h < 0.06;                              // someone's watching TV
                            const lav = this.facadeFeature === 'silver_queen' && h > 0.36;   // some rooms lit lavender
                            ctx.fillStyle = tv ? (Math.sin(_gameTimeSec * 9 + c) > 0 ? '#9ec8ff' : '#6f9fe8') : lav ? '#d9c2ff' : lit;
                            ctx.fill();
                        } else {
                            ctx.fillStyle = sq ? 'rgba(23,0,92,0.9)' : 'rgba(20,28,48,0.9)'; ctx.fill();
                            if (skyA > 0) {
                                const du = Math.abs((u0 + u1) / 2 - uc), sh = sheenA * Math.max(0, 1 - du / 0.16) * (0.7 + 0.3 * (fl % 2));
                                ctx.fillStyle = `rgba(${glassRGB}, ${skyA})`; ctx.fill();
                                if (sh > 0.01) { ctx.fillStyle = `rgba(${sun.rgb}, ${sh})`; ctx.fill(); }
                            }
                        }
                    }
                }
            },

            /** Facade features: balconies / fire escapes on apartments, the Silver Queen front. */
            _drawFaceFeature(ctx, f, P, emissive) {
                if (!this.facadeFeature) return;
                if (this.facadeFeature === 'silver_queen') { this._sqFace(ctx, f, P, emissive); return; }
                const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS);
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                if (Math.hypot(dx - ax, dy - ay) < 6) return;
                const at = (u, v) => { const x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u, x1 = dx + (cx - dx) * u, y1 = dy + (cy - dy) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
                const line = (p, q) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
                const acc = this.colors.accent;
                if (this.facadeFeature === 'balconies' && f.side === 'S') {
                    for (let fl = 1; fl < floors; fl += 2) {
                        const v = fl / floors;
                        if (!emissive) { ctx.strokeStyle = 'rgba(200,210,225,0.55)'; ctx.lineWidth = 1.4; line(at(0.08, v), at(0.92, v)); }
                        else {                                          // little string of balcony lights
                            ctx.fillStyle = acc;
                            for (let u = 0.12; u < 0.9; u += 0.19) { const p = at(u, v); ctx.beginPath(); ctx.arc(p[0], p[1], 1.1, 0, Math.PI * 2); ctx.fill(); }
                        }
                    }
                } else if (this.facadeFeature === 'fire_escape' && (f.side === 'E' || f.side === 'W') && !emissive) {
                    ctx.strokeStyle = 'rgba(150,120,110,0.7)'; ctx.lineWidth = 1;
                    for (let fl = 1; fl < floors; fl++) {
                        const v = fl / floors, u0 = fl % 2 ? 0.3 : 0.6, u1 = fl % 2 ? 0.6 : 0.3;
                        line(at(0.25, v), at(0.65, v));               // landing
                        line(at(u0, v), at(u1, (fl + 1) / floors));   // stair
                    }
                }
            },

            /** The procedural roof props (AC, tanks, vents, fans) for buildings without a style. */
            _drawRoofProps(ctx) {
                for (const p of this.roofProps) {
                    const sec = this.sections[p.section] || this.sections[0];
                    const x = this.x + sec.x + p.x, y = this.y + sec.y + p.y;
                    if (p.type === 'ac_unit') { ctx.fillStyle = '#3a3f48'; ctx.fillRect(x, y, p.w, p.h); ctx.strokeStyle = '#555c66'; ctx.strokeRect(x + 3, y + 3, p.w - 6, p.h - 6); }
                    else if (p.type === 'water_tank') { ctx.fillStyle = '#4a4238'; ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#6a5e50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, p.r * 0.7, 0, Math.PI * 2); ctx.stroke(); }
                    else if (p.type === 'vent') { ctx.fillStyle = '#2e333a'; ctx.fillRect(x, y, p.w, p.h); }
                    else if (p.type === 'roof_fan') { ctx.fillStyle = '#333841'; ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4b525c'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + _gameTimeSec * 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * p.r * 0.8, y + Math.sin(a) * p.r * 0.8); ctx.stroke(); } }
                }
            },

            /** Styled rooftops. Coordinates are world coords (caller has applied the roof transform). */
            _drawRoofFeatures(ctx, emissive) {
                if (this.style === 'silver_queen') { this._sqDrawRoof(ctx, emissive); this._drawPenthouse(ctx, emissive); return; }
                const main = this.sections[0], mx = this.x + main.x, my = this.y + main.y, mw = main.w, mh = main.h;
                const r = (i) => _bldHash(this._seed || 1, 100 + i);
                const acc = this.colors.accent, t = _gameTimeSec;
                const feat = this.roofFeatures || [];
                // Layout slots on the main section: [x, y, w, h] as fractions
                const slots = { stair: [0.08, 0.1, 0.18, 0.2], pool: [0.4, 0.14, 0.42, 0.34], garden: [0.38, 0.12, 0.46, 0.36], laundry: [0.12, 0.56, 0.5, 0.3],
                                tank: [0.76, 0.6, 0.14, 0.18], solar: [0.56, 0.56, 0.34, 0.32], lights: [0.06, 0.08, 0.88, 0.84], antenna: [0.88, 0.1, 0.05, 0.05], dish: [0.74, 0.12, 0.1, 0.1] };
                const box = (name) => { const s = slots[name]; return [mx + s[0] * mw, my + s[1] * mh, s[2] * mw, s[3] * mh]; };
                for (const f of feat) {
                    if (f === 'penthouse') continue;
                    const [x, y, w, h] = box(f);
                    switch (f) {
                        case 'stair': {                                   // stairwell hut with a lit door
                            if (!emissive) { ctx.fillStyle = lightenHex(this.colors.roof, 18); ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + w, y + 4, 4, h); }
                            else { ctx.fillStyle = '#ffd9a0'; ctx.fillRect(x + w * 0.35, y + h - 3, w * 0.3, 3); }
                            break;
                        }
                        case 'pool': {
                            if (!emissive) {
                                ctx.fillStyle = '#d9d2c4'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);          // deck
                                const gw = ctx.createLinearGradient(x, y, x + w, y + h); gw.addColorStop(0, '#4fc3e0'); gw.addColorStop(1, '#1f6fa8');
                                ctx.fillStyle = gw; ctx.fillRect(x, y, w, h);                                       // water (daylight)
                            }
                            else {
                                const a0 = ctx.globalAlpha;
                                const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#2bb8d8'); g.addColorStop(1, '#0f4f8a');
                                ctx.globalAlpha = a0 * 0.8; ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.globalAlpha = a0;
                                ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;   // caustic shimmer
                                for (let i = 0; i < 4; i++) { const yy = y + h * (0.2 + i * 0.2) + Math.sin(t * 1.5 + i) * 2; ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.quadraticCurveTo(x + w / 2, yy + Math.sin(t * 2 + i) * 3, x + w - 4, yy); ctx.stroke(); }
                            }
                            break;
                        }
                        case 'garden': {
                            if (!emissive) {
                                ctx.fillStyle = '#3b2e24'; ctx.fillRect(x, y, w, h);
                                const greens = ['#2f7d3a', '#3c9b47', '#27643a'];
                                for (let i = 0; i < 9; i++) { ctx.fillStyle = greens[i % 3]; ctx.beginPath(); ctx.arc(x + w * (0.12 + (i % 3) * 0.38), y + h * (0.2 + Math.floor(i / 3) * 0.3), Math.min(w, h) * 0.14, 0, Math.PI * 2); ctx.fill(); }
                            } else {                                        // lanterns between the planters
                                ctx.fillStyle = '#ffcf7a';
                                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + w * (0.3 + (i % 2) * 0.4), y + h * (0.35 + Math.floor(i / 2) * 0.3), 1.6, 0, Math.PI * 2); ctx.fill(); }
                            }
                            break;
                        }
                        case 'laundry': {
                            if (emissive) break;
                            ctx.strokeStyle = 'rgba(220,220,220,0.5)'; ctx.lineWidth = 0.7;
                            const cloth = ['#ff6b8a', '#6bc6ff', '#ffe066', '#b58cff', '#ffffff', '#7dffb3'];
                            for (let row = 0; row < 3; row++) {
                                const yy = y + h * (0.2 + row * 0.3);
                                ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
                                for (let i = 0; i < 5; i++) {
                                    const sway = Math.sin(t * 1.3 + i + row) * 1.2;
                                    ctx.fillStyle = cloth[(i + row * 2 + Math.floor(r(row) * 6)) % cloth.length];
                                    ctx.fillRect(x + w * (0.08 + i * 0.18) + sway, yy, w * 0.1, h * 0.14);
                                }
                            }
                            break;
                        }
                        case 'tank': {
                            if (emissive) break;
                            const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) / 2;
                            ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
                            ctx.strokeStyle = '#7a6650'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rr * 0.65, 0, Math.PI * 2); ctx.stroke();
                            ctx.fillStyle = '#3e3328'; ctx.beginPath(); ctx.arc(cx, cy, rr * 0.25, 0, Math.PI * 2); ctx.fill();
                            break;
                        }
                        case 'solar': {
                            if (emissive) break;
                            for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
                                const px = x + i * w / 3 + 2, py = y + j * h / 2 + 2;
                                ctx.fillStyle = '#1c2a4a'; ctx.fillRect(px, py, w / 3 - 4, h / 2 - 4);
                                ctx.strokeStyle = 'rgba(120,160,255,0.35)'; ctx.lineWidth = 0.6; ctx.strokeRect(px, py, w / 3 - 4, h / 2 - 4);
                            }
                            break;
                        }
                        case 'lights': {                                    // festoon string lights zig-zagging across
                            if (!emissive) break;
                            const cols = ['#ffd27a', acc, '#ffd27a', '#ff9ecf'];
                            for (let z = 0; z < 3; z++) {
                                const y0 = y + h * (0.15 + z * 0.35), y1 = y0 + h * 0.18;
                                for (let i = 0; i <= 12; i++) {
                                    const px = x + w * i / 12, py = (i % 2 ? y1 : y0) + Math.sin(i * 0.9) * 2;
                                    ctx.fillStyle = cols[(i + z) % cols.length];
                                    ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0) * (0.75 + 0.25 * Math.sin(t * 3 + i + z));
                                    ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
                                }
                            }
                            ctx.globalAlpha = Math.max(0.15, Math.min(1, (typeof game !== 'undefined' ? game.getAmbientDarkness() : 1) * 1.1));
                            break;
                        }
                        case 'antenna': {
                            const cx = x + w / 2, cy = y + h / 2;
                            if (!emissive) { ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6); ctx.stroke(); }
                            else if (Math.sin(t * 3 + (this._seed || 0)) > 0.3) { ctx.fillStyle = '#ff3040'; ctx.shadowColor = '#ff3040'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
                            break;
                        }
                        case 'dish': {
                            if (emissive) break;
                            const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) / 2;
                            ctx.fillStyle = '#c9ced6'; ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.8, 0.6, 0, Math.PI * 2); ctx.fill();
                            ctx.fillStyle = '#8a9099'; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
                            break;
                        }
                    }
                }
                if (feat.includes('penthouse')) this._drawPenthouse(ctx, emissive);
            },

            /** Silver Queen crown: a raised penthouse tier with hexagon skylights and its own lean. */
            _drawPenthouse(ctx, emissive) {
                const main = this.sections[0], mx = this.x + main.x, my = this.y + main.y;
                const px = mx + main.w * 0.1, py = my + main.h * 0.55, pw = main.w * 0.5, ph = main.h * 0.34;
                // The tier stands ~4 floors above the roof: extra scale on top of the roof transform
                const cam = game.camera, base = 1 + this._leanScale(), top = 1 + this._leanScale(4), k = top / base;
                ctx.save();
                this._sqPenthouseWalls(ctx, px, py, pw, ph, k, emissive);   // glass walls up to the raised tier
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                const hexAt = (i, rr) => { const cx = px + pw * (0.2 + i * 0.3), cy = py + ph / 2; ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = Math.PI / 6 + j * Math.PI / 3; ctx[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); };
                if (!emissive && this.style === 'silver_queen') {
                    ctx.fillStyle = SQ_THEME.bay; ctx.fillRect(px, py, pw, ph);
                    ctx.strokeStyle = SQ_THEME.trim; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
                    for (let i = 0; i < 3; i++) {                          // glass hexagons; the middle one is the spire's plinth
                        hexAt(i, ph * 0.26); ctx.fillStyle = SQ_THEME.glass; ctx.fill(); ctx.strokeStyle = '#cfc6f5'; ctx.lineWidth = 1.5; ctx.stroke();
                        if (i !== 1) { hexAt(i, ph * 0.13); ctx.strokeStyle = 'rgba(207,198,245,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
                    }
                    ctx.fillStyle = SQ_THEME.silver; ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = SQ_THEME.gold; ctx.lineWidth = 1.5; ctx.stroke();
                } else if (!emissive) {
                    ctx.fillStyle = '#2d2442'; ctx.fillRect(px, py, pw, ph);
                    ctx.strokeStyle = '#9d95bd'; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
                } else {
                    ctx.strokeStyle = '#c8a8ff'; ctx.shadowColor = '#c8a8ff'; ctx.shadowBlur = 10; ctx.lineWidth = 1.5;
                    for (let i = 0; i < 3; i++) {                          // hexagon skylights
                        const cx = px + pw * (0.2 + i * 0.3), cy = py + ph / 2, rr = ph * 0.26;
                        ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = Math.PI / 6 + j * Math.PI / 3; ctx[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath();
                        ctx.fillStyle = 'rgba(180,140,255,0.35)'; ctx.fill(); ctx.stroke();
                    }
                    ctx.shadowBlur = 0;
                    ctx.font = 'italic 22px "Great Vibes", cursive'; ctx.fillStyle = '#e8dcff'; ctx.textAlign = 'center';
                    ctx.fillText('SQ', px + pw / 2, py + ph + 22);
                }
                ctx.restore();
            }
        });


