        /* =====================================================================
           BUILDING V2 - COMPLEX SHAPES & LAYERED RENDERING
           ---------------------------------------------------------------------
           Advanced building system with:
           - Complex polygon footprints (L-shapes, U-shapes, etc.)
           - Split rendering: drawBase() under player, drawTop() over player
           - Detailed facades with windows, balconies, architectural details
           - Procedural window lighting based on time of day
           ===================================================================== */
        const _FW_CAMERA_MOTION = { camera: null, drawId: 0, x: 0, y: 0, zoom: 0, moving: true };
        const _FW_GEOMETRY = new WeakMap(); // owner -> weak face map; latest projection, at most two visible path sets
        const _FW_SHEEN = [];   // _drawFaceWindows: the sun sheen's windows, reused every face
        const _FW_SHEEN_GROUPS = new Map();   // _drawFaceWindows: sheen alpha -> the windows sharing it (one fill each)
        // How far a landmark's base and roof passes draw past its leaned outline (world px, measured at every
        // angle and zoom, plus a margin): the glow pass's emissiveReach is for the beams alone
        const SQ_TOP_REACH = 200, DN_TOP_REACH = 190, MC_TOP_REACH = 100;
        // ...and how far the glow pass draws past it without the beams (lamp halos, portico mist, the crown):
        // past this, only the beams can reach the screen (drawEmissive's beamsOnly)
        const SQ_GLOW_REACH = 240, MC_GLOW_REACH = 100;
        const BUILDING_LANDMARK_STYLES = ['silver_queen', 'double_nights', 'moon_city', 'enni_cole'];

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
                // The street it fronts: 'S' (default), 'N', 'E' or 'W'. Its door, sign awning, entrance lights,
                // front wash and balconies go on that side. The landmarks draw their own fronts and stay south.
                this.facing = BUILDING_LANDMARK_STYLES.includes(this.style) ? 'S' : (['N', 'E', 'W'].includes(config.facing) ? config.facing : 'S');
                this._shopfront = this.facing === config.facing || !!config.shopfront;   // hand-placed with a facing: a front (sign, lights) even without a door
                
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
                if (this.style === 'double_nights' || this.style === 'moon_city' || this.style === 'enni_cole') { this.attachedSign = null; return; }   // these landmarks draw their own script signs
                const mainSection = this.sections[0];
                const titleCase = (str) => str.replace(/\w\S*/g, (txt) => 
                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
                
                // Position sign on roof near its front edge (entrance area)
                const fx = { E: mainSection.w / 2 - 28, W: -mainSection.w / 2 + 28 }[this.facing] || 0;
                const fy = { S: mainSection.h / 2 - 28, N: -mainSection.h / 2 + 28 }[this.facing] || 0;
                this.attachedSign = new NeonSign(
                    this.x + mainSection.x + mainSection.w / 2 + fx,
                    this.y + mainSection.y + mainSection.h / 2 + fy, // Near the front edge of the roof
                    titleCase(signConfig.text),
                    signConfig.color || this.colors.accent,
                    (signConfig.size || 20) * 1.2, // Slightly smaller for roof
                    'Great Vibes'
                );
            }
            
            _setupDoor(doorConfig) {
                if (this.style === 'double_nights') { this._dnDoor(doorConfig); return; }   // the door is under the porte-cochère
                this._doorLightColor = doorConfig.lightColor || null;
                // On the front wall of the section furthest out on its facing side (the southernmost, facing south)
                const g = this._frontGeo(), D = 10, L = 100, T = 60;
                this.attachedTransition = {
                    x: g.nx ? (g.nx > 0 ? g.cx + D : g.cx - D - T) : g.cx - L / 2,
                    y: g.ny ? (g.ny > 0 ? g.cy + D : g.cy - D - T) : g.cy - L / 2,
                    w: g.nx ? T : L, h: g.nx ? L : T,
                    target: doorConfig.target,
                    label: doorConfig.label
                };
                
                if (doorConfig.lightColor && this.style !== 'moon_city') {           // (Moon City lights its door itself: _mcLights)
                    this.attachedLights.push(new LampEntity({ x: g.cx - g.nx * 5, y: g.cy - g.ny * 5, lampType: 3, color: doorConfig.lightColor, lightRadius: 200 }));
                }
            }

            /**
             * Its front: the middle of the facing wall of the section furthest out that way (world), the outward
             * normal nx, ny and the wall's direction ux, uy. The door, sign, lights and wash are placed from it.
             */
            _frontGeo() {
                if (this._front && this._front.side === this.facing) return this._front;
                const f = this.facing, out = (s) => f === 'S' ? s.y + s.h : f === 'N' ? -s.y : f === 'E' ? s.x + s.w : -s.x;
                let sec = this.sections[0];
                this.sections.forEach(s2 => { if (out(s2) > out(sec)) sec = s2; });
                const x0 = this.x + sec.x, y0 = this.y + sec.y, nx = f === 'E' ? 1 : f === 'W' ? -1 : 0, ny = f === 'S' ? 1 : f === 'N' ? -1 : 0;
                return (this._front = {
                    side: f, sec, nx, ny, ux: ny ? 1 : 0, uy: nx ? 1 : 0,
                    cx: nx ? (nx > 0 ? x0 + sec.w : x0) : x0 + sec.w / 2,
                    cy: ny ? (ny > 0 ? y0 + sec.h : y0) : y0 + sec.h / 2
                });
            }

            /** Where its entrance is (the front, with the door's position along it), or null: no door and no shopfront */
            _entrance() {
                const t = this.attachedTransition;
                if (!t && !this._shopfront) return null;
                const g = this._frontGeo();
                if (!t) return g;
                return { ...g, cx: g.nx ? g.cx : t.x + t.w / 2, cy: g.ny ? g.cy : t.y + t.h / 2 };
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
                if (this._doorLightColor && this.style !== 'silver_queen' && this.style !== 'double_nights' && this.style !== 'moon_city') {
                    const g = this._frontGeo();
                    this.attachedLights.push(new LampEntity({ x: g.cx - g.nx * 5, y: g.cy - g.ny * 5, lampType: 3, color: this._doorLightColor, lightRadius: 200 }));
                }
            }
            
            
            /**
             * Draw base layer (under player): shadow, ground floor, entrance.
             */
            drawBase(ctx) {
                if (this.style === 'double_nights') { this._dnDrawBase(ctx); return; }   // buildings/double-nights.js
                if (this.style === 'enni_cole') { this._ecDrawBase(ctx); return; }
                ctx.save();
                
                // Draw shadow for each section
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                if (this.roundR) this._leanFaces();                                // (rounded corners: the shadow follows them)
                this.sections.forEach((section, si) => {
                    const sx = this.x + section.x;
                    const sy = this.y + section.y;
                    const shadowOffset = this.facadeDepth;
                    if (this._roundSec) { ctx.save(); ctx.translate(shadowOffset, shadowOffset); ctx.fill(this._roofPath(section, si)); ctx.restore(); }
                    else ctx.fillRect(sx + shadowOffset, sy + shadowOffset, section.w, section.h);
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
                if (this.style === 'enni_cole' && typeof game !== 'undefined' && game.camera) { this._ecDrawTop(ctx); return; }
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
             * The sign layer the engine draws after every building's top. With the lean on,
             * each sign is drawn inside its own building's top pass instead (_paintSign, after
             * the walls, before the roof), so a roof or a taller wall in front of it hides it —
             * the perspective holds. Without the lean, it's drawn here as before.
             */
            drawSign(ctx) {
                if (CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera) return;
                this._paintSign(ctx);
            }

            /**
             * A neon sign over the entrance. Double Nights: script on the porte-cochère.
             * Silver Queen: on the portico's roof, in its plane. Everyone else: on a small
             * cantilevered awning two floors up over the door, in that plane (_signAwning).
             */
            _paintSign(ctx) {
                if (this.style === 'double_nights') { if (typeof game !== 'undefined' && game.camera) this._dnDrawSign(ctx); return; }
                if (this.style === 'moon_city') { if (typeof game !== 'undefined' && game.camera) { this._mcDrawCanopy(ctx, false); this._mcDrawSign(ctx, false); } return; }
                const E = this.attachedSign && this._entrance();
                if (!E) return;
                
                ctx.save();
                
                const signText = this.attachedSign.text;
                const signFontSize = this.attachedSign.fontSize || 45;
                
                // Use building lamp color (accent) directly
                const lampColor = this.colors ? this.colors.accent : (this.attachedSign.color || '#a469ff');
                
                // Anchored over the entrance, just inside its front wall
                const inset = signFontSize / 2 + 10;
                let textX = E.cx - E.nx * inset;
                let textY = E.cy - E.ny * inset;
                // Silver Queen: the script sign stands on the portico roof, in the portico's height plane
                if (this.style === 'silver_queen' && CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera && this._sqPortico()) {
                    const sqG = this._sqPortico(), cam = game.camera, k = this._sqK(sqG.z);
                    ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                    textY = sqG.yf + SQ_PORTICO.depth * 0.5;
                    ctx.globalAlpha = Math.max(0.45, this._sqFade == null ? 1 : this._sqFade);
                } else if (CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera) {
                    const A = this._signAwning(ctx, signText, signFontSize);                 // the awning, then the sign lying on it
                    LandmarkKit.plane(ctx, A.k);
                    textX = A.x; textY = A.y;
                }
                if (E.nx) { ctx.translate(textX, textY); ctx.rotate(E.nx * Math.PI / 2); textX = 0; textY = 0; }   // an east or west front: the sign runs along the wall
                
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
                } else if (this._signSprites(signText, signFontSize, lampColor, rgb)) {
                    // Full quality from the baked layers: the dark backdrop as is, the neon bloom with the flicker
                    const S = this._signSpr, a0 = ctx.globalAlpha;
                    ctx.drawImage(S.shadow, textX - S.w / 2, textY - S.h / 2 + 3, S.w, S.h);
                    ctx.globalAlpha = a0 * alpha; ctx.drawImage(S.glow, textX - S.w / 2, textY - S.h / 2, S.w, S.h);
                    ctx.globalAlpha = a0;
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * alpha})`; ctx.fillText(signText, textX, textY);   // the white-hot core, live
                } else {
                // Full quality: 5 glow layers (live, until the sign's font has loaded and its layers are baked)
                
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
            }

            /**
             * A cantilevered entrance awning for the sign: a slab two floors up, out from the wall
             * over the door, as wide as the sign. Draws it (LandmarkKit.ledge) and returns the plane
             * and the line the sign sits on.
             */
            _signAwning(ctx, text, size) {
                if (!this._awn || this._awn.text !== text) {
                    const E = this._entrance();
                    const m = document.createElement('canvas').getContext('2d'); m.font = `${size}px "Great Vibes", cursive`;
                    const tw = Math.min((E.nx ? this.h : this.w) - 20, m.measureText(text).width + 34), d = Math.round(size * 0.95);
                    this._awn = { text, a: [E.cx - E.ux * tw / 2, E.cy - E.uy * tw / 2], b: [E.cx + E.ux * tw / 2, E.cy + E.uy * tw / 2],
                                  nx: E.nx, ny: E.ny, x: E.cx + E.nx * d / 2, y: E.cy + E.ny * d / 2, d, z: 2 * CONFIG.BUILDINGS.FLOOR_HEIGHT };
                }
                const A = this._awn, K = LandmarkKit;
                K.ledge(ctx, [{ a: A.a, b: A.b, nx: A.nx, ny: A.ny }], A.z, A.d, 3,
                        darkenHex(this.colors.wall || '#2a2436', 8), darkenHex(this.colors.wall || '#2a2436', 22), `rgba(${hexToRgb(this.colors.accent || '#a469ff')}, 0.55)`);
                return { k: K.k(A.z + 0.5), x: A.x, y: A.y };
            }
            
            
            
            /**
             * The sign's blurred layers, baked once (the neon's shadowBlur passes were the costliest
             * thing a building drew each frame): `shadow`, the dark backdrop, and `glow`, the wide,
             * medium and core blooms at full strength. Stamped with the flicker as alpha. Only baked
             * once the script font is ready, so a fallback face is never frozen in. Returns ready.
             */
            _signSprites(text, size, lampColor, rgb) {
                const key = text + '|' + size + '|' + lampColor;
                if (this._signSpr && this._signSpr.key === key) return true;
                if (typeof document === 'undefined' || !document.fonts || !document.fonts.check(`${size}px "Great Vibes"`)) return false;
                const R = 2, pad = 60, m = document.createElement('canvas').getContext('2d');
                m.font = `${size}px "Great Vibes", cursive`;
                const w = Math.ceil(m.measureText(text).width) + pad * 2, h = Math.ceil(size * 1.6) + pad * 2;
                const layer = (paint) => {
                    const cv = document.createElement('canvas'); cv.width = w * R; cv.height = h * R;
                    const c = cv.getContext('2d'); c.scale(R, R);
                    c.font = `${size}px "Great Vibes", cursive`; c.textAlign = 'center'; c.textBaseline = 'middle';
                    paint(c, w / 2, h / 2); return cv;
                };
                const shadow = layer((c, x, y) => {
                    c.shadowColor = '#000000'; c.shadowBlur = 18 * R; c.fillStyle = 'rgba(0, 0, 0, 0.85)'; c.fillText(text, x, y);
                    c.shadowBlur = 8 * R; c.fillStyle = 'rgba(0, 0, 0, 0.6)'; c.fillText(text, x, y);
                });
                const glow = layer((c, x, y) => {
                    c.shadowColor = lampColor;
                    c.shadowBlur = 40 * R; c.fillStyle = `rgba(${rgb}, 0.3)`; c.fillText(text, x, y);
                    c.shadowBlur = 20 * R; c.fillStyle = `rgba(${rgb}, 0.7)`; c.fillText(text, x, y);
                    c.shadowBlur = 8 * R; c.fillStyle = `rgba(${rgb}, 1)`; c.fillText(text, x, y);
                    c.shadowBlur = 4 * R; c.shadowColor = '#ffffff'; c.fillStyle = 'rgba(0, 0, 0, 0)'; c.fillText(text, x, y);
                });
                this._signSpr = { key, shadow, glow, w, h };
                return true;
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
                    this.topReach = DN_TOP_REACH;                           // base and roof passes: the canopy and court in front
                } else if (this.style === 'moon_city') {
                    this.roofFeatures = []; this.facadeFeature = 'moon_city'; this.emissiveReach = 600;   // fins, skylight, searchlights (buildings/moon-city.js)
                    this.topReach = MC_TOP_REACH;                           // base and roof passes: the canopy and sign
                    this.glowReach = MC_GLOW_REACH;                         // glow pass, all but the searchlights
                } else if (this.style === 'silver_queen') {
                    this.roofFeatures = ['penthouse'];                     // the rest of the roof is _sqDrawRoof
                    this.facadeFeature = 'silver_queen';
                    this.sills = { lip: 'rgba(236, 232, 250, 0.75)', shade: 'rgba(20, 10, 48, 0.55)' };   // window sills (_drawFaceWindows)
                    this.roundR = CONFIG.BUILDINGS.SQ_CORNER_R;                  // rounded outer corners (_roundCorners)
                    this.emissiveReach = 700;                              // searchlight beams reach well past the footprint
                    this.crownZ = SQ_ROOF.ringZ;                           // the crown ring leans from 256 px up
                    this.topReach = SQ_TOP_REACH;                          // base and roof passes: the ring's radius, the portico and posts
                    this.glowReach = SQ_GLOW_REACH;                        // glow pass, all but the beams
                }
            },

            _generateStyledLights() {
                const t = this.attachedTransition;
                const accent = this.colors.accent;
                if (this.style === 'silver_queen' && t) { this._sqLights(); return; }
                if (this.style === 'double_nights') { this._dnLights(); return; }
                if (this.style === 'moon_city') { this._mcLights(); return; }
                if (this.style === 'enni_cole') { this._ecLights(); return; }
                const E = this._entrance();
                if (E) {
                    const cx = E.cx, cy = E.cy, at = (u, n) => ({ x: cx + E.ux * u + E.nx * n, y: cy + E.uy * u + E.ny * n });
                    // Entrance pair, warm pool at the door — purposeful light instead of a bulb grid
                    this.attachedLights.push(new LampEntity({ ...at(-46, 0), lampType: 3, color: accent, lightRadius: 120 }));
                    this.attachedLights.push(new LampEntity({ ...at(46, 0), lampType: 3, color: accent, lightRadius: 120 }));
                    this.attachedLights.push(new LampEntity({ ...at(0, 26), lampType: 4, color: '#ffe2b8', lightRadius: this.style === 'silver_queen' ? 260 : 170 }));
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
                            const nx = e.side === 'E' ? 1 : e.side === 'W' ? -1 : 0, ny = e.side === 'S' ? 1 : e.side === 'N' ? -1 : 0;
                            faces.push(e.horiz ? { side: e.side, section: i, x1: lo, y1: e.fixed, x2: hi, y2: e.fixed, nx, ny }
                                               : { side: e.side, section: i, x1: e.fixed, y1: lo, x2: e.fixed, y2: hi, nx, ny });
                        }
                    }
                });
                if (this.roundR) this._roundCorners(faces, S);
                return (this._faces = faces);
            },

            /**
             * Rounded outer corners (this.roundR, px): each straight face stops R short of an outer
             * corner and the corner becomes an arc of short facets (side 'C', with their own outward
             * normal). A corner where another section continues the wall stays square.
             */
            _roundCorners(faces, S) {
                const R = this.roundR, N = 5, inside = (x, y, j) => S.some((o, k) => k !== j && x >= o.x0 - 0.5 && x <= o.x1 + 0.5 && y >= o.y0 - 0.5 && y <= o.y1 + 0.5);
                this._roundSec = S.map((s, j) => {
                    const corners = [[s.x0, s.y0, -1, -1], [s.x1, s.y0, 1, -1], [s.x1, s.y1, 1, 1], [s.x0, s.y1, -1, 1]];   // tl, tr, br, bl
                    return corners.map(([x, y, sx, sy]) => {
                        if (inside(x, y, j)) return 0;
                        // trim the two straight faces that meet here
                        for (const f of faces) {
                            if (f.section !== j) continue;
                            if (f.x1 === x && f.y1 === y) { if (f.y1 === f.y2) f.x1 += R * (f.x2 > f.x1 ? 1 : -1); else f.y1 += R * (f.y2 > f.y1 ? 1 : -1); }
                            if (f.x2 === x && f.y2 === y) { if (f.y1 === f.y2) f.x2 -= R * (f.x2 > f.x1 ? 1 : -1); else f.y2 -= R * (f.y2 > f.y1 ? 1 : -1); }
                        }
                        // the arc: centre R in from the corner, from one face's end round to the other's
                        const cx = x - sx * R, cy = y - sy * R, a0 = Math.atan2(sy, 0), a1 = Math.atan2(0, sx);
                        let da = a1 - a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
                        for (let i = 0; i < N; i++) {
                            const t0 = a0 + da * i / N, t1 = a0 + da * (i + 1) / N, tm = (t0 + t1) / 2;
                            faces.push({ side: 'C', section: j, x1: cx + Math.cos(t0) * R, y1: cy + Math.sin(t0) * R, x2: cx + Math.cos(t1) * R, y2: cy + Math.sin(t1) * R, nx: Math.cos(tm), ny: Math.sin(tm) });
                        }
                        return R;
                    });
                });
            },

            /** A section's footprint as points (its rounded corners traced), for shadows. */
            _footprint(section, si) {
                const x0 = this.x + section.x, y0 = this.y + section.y, x1 = x0 + section.w, y1 = y0 + section.h;
                if (this.roundR) this._leanFaces();
                const r = this._roundSec && this._roundSec[si];
                if (!r) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
                const pts = [], arc = (cx, cy, R, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + i / 5 * Math.PI / 2; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); } };
                if (r[0]) arc(x0 + r[0], y0 + r[0], r[0], Math.PI); else pts.push([x0, y0]);
                if (r[1]) arc(x1 - r[1], y0 + r[1], r[1], -Math.PI / 2); else pts.push([x1, y0]);
                if (r[2]) arc(x1 - r[2], y1 - r[2], r[2], 0); else pts.push([x1, y1]);
                if (r[3]) arc(x0 + r[3], y1 - r[3], r[3], Math.PI / 2); else pts.push([x0, y1]);
                return pts;
            },

            /** A section's roof outline, with its rounded corners (world coordinates). */
            _roofPath(section, si, inset = 0) {
                const r = this._roundSec && this._roundSec[si];
                // Keep the three inset variants used by the renderer; unusual caller insets remain uncached.
                const cacheable = inset === 0 || inset === 2.5 || inset === 6;
                let cached, bySection;
                if (cacheable) {
                    bySection = this._roofOutlines || (this._roofOutlines = new WeakMap());
                    cached = bySection.get(section);
                    let same = cached && cached.si === si && cached.x === this.x && cached.y === this.y &&
                        cached.sx === section.x && cached.sy === section.y && cached.w === section.w && cached.h === section.h &&
                        cached.rounds === this._roundSec && cached.r === r && (!r || cached.radii.length === r.length);
                    if (same && r) for (let i = 0; i < r.length; i++) if (cached.radii[i] !== r[i]) { same = false; break; }
                    if (!same) {
                        cached = { si, x: this.x, y: this.y, sx: section.x, sy: section.y, w: section.w, h: section.h,
                            rounds: this._roundSec, r, radii: r ? r.slice() : null, paths: new Map() };
                        bySection.set(section, cached);
                    }
                    const hit = cached.paths.get(inset);
                    if (hit) return hit;
                }
                const p = new Path2D(), x = this.x + section.x + inset, y = this.y + section.y + inset;
                const w = section.w - inset * 2, h = section.h - inset * 2;
                if (r) p.roundRect(x, y, w, h, r.map(v => Math.max(0, v - inset))); else p.rect(x, y, w, h);
                if (cacheable) cached.paths.set(inset, p);
                return p;
            },

            /** Could any of it be on screen? Its footprint, its leaned walls and roof (reckoned a few floors
                higher, or to its crown's height, for crowns, spires and signs) and a reach past that, against the
                real view rect V. The reach defaults to emissiveReach (the glow pass: beams, plazas); the base and
                roof passes ask with topReach (what they draw in front of the footprint: porticos, canopies). */
            inView(V, cam, reach) {
                const C = CONFIG.CULLING, r = (reach === undefined ? (this.emissiveReach || 0) : reach) + C.BUILDINGS_VIEW;
                const x0 = this.x, y0 = this.y, x1 = this.x + (this.w || 200), y1 = this.y + (this.h || 200);
                let L = x0, R = x1, T = y0, Bt = y1;
                if (CONFIG.BUILDINGS.LEAN) {
                    const k = this._hullK();                                    // roof = cam + (p - cam) * k
                    const rx0 = cam.x + (x0 - cam.x) * k, rx1 = cam.x + (x1 - cam.x) * k, ry0 = cam.y + (y0 - cam.y) * k, ry1 = cam.y + (y1 - cam.y) * k;
                    L = Math.min(L, rx0, rx1); R = Math.max(R, rx0, rx1); T = Math.min(T, ry0, ry1); Bt = Math.max(Bt, ry0, ry1);
                }
                return !(R + r < V.left || L - r > V.right || Bt + r < V.top || T - r > V.bottom);
            },

            /** The lean of the highest thing it draws: LEAN_EXTRA floors over the roof, or its crown (crownZ, world px
                up, leaned as LandmarkKit.k / _sqK lean it) if that's higher */
            _hullK() {
                const k = 1 + this._leanScale(CONFIG.CULLING.LEAN_EXTRA);
                if (!this.crownZ) return k;
                const C = leanCamHeight();
                return Math.max(k, C / (C - Math.min(this.crownZ, C * 0.86)));
            },

            _leanScale(extraFloors = 0) {
                const B = CONFIG.BUILDINGS;
                const h = (Math.min(this.floors, B.MAX_FLOORS) + extraFloors) * B.FLOOR_HEIGHT;
                return h / (leanCamHeight() - h);          // roof = cam + (p - cam) * (1 + s)
            },

            /** Faces the camera can see (outward side toward the camera). */
            _visibleFaces(cam) {
                const all = this._leanFaces();
                // A four-sided building is cheaper to filter directly than to validate a geometry snapshot.
                if (all.length <= 4) return all.filter(f =>
                    (f.side === 'S' && cam.y > f.y1) || (f.side === 'N' && cam.y < f.y1) ||
                    (f.side === 'E' && cam.x > f.x1) || (f.side === 'W' && cam.x < f.x1) ||
                    (f.side === 'C' && (cam.x - (f.x1 + f.x2) / 2) * f.nx + (cam.y - (f.y1 + f.y2) / 2) * f.ny > 0));
                const cached = this._visibleFaceCache;
                // Faces are mutable world geometry: check their identity and fields before sharing a result.
                let same = cached && cached.all === all && cached.geometry.length === all.length;
                if (same) for (let i = 0; i < all.length; i++) {
                    const f = all[i], g = cached.geometry[i];
                    if (g.face !== f || g.side !== f.side || g.x1 !== f.x1 || g.y1 !== f.y1 ||
                        g.x2 !== f.x2 || g.y2 !== f.y2 || g.nx !== f.nx || g.ny !== f.ny) { same = false; break; }
                }
                if (same && cached.x === cam.x && cached.y === cam.y) return cached.visible;
                const geometry = same ? cached.geometry : all.map(f => ({ face: f, side: f.side,
                    x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, nx: f.nx, ny: f.ny }));
                const visible = all.filter(f =>
                    (f.side === 'S' && cam.y > f.y1) || (f.side === 'N' && cam.y < f.y1) ||
                    (f.side === 'E' && cam.x > f.x1) || (f.side === 'W' && cam.x < f.x1) ||
                    (f.side === 'C' && (cam.x - (f.x1 + f.x2) / 2) * f.nx + (cam.y - (f.y1 + f.y2) / 2) * f.ny > 0));
                this._visibleFaceCache = { all, geometry, x: cam.x, y: cam.y, visible };
                return visible;
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
                    const shade = f.side === 'S' ? 18 : f.side === 'N' ? -8 : f.side === 'C' ? Math.round(6 + (f.ny > 0 ? 12 : 14) * f.ny) : 6;
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
                this._paintSign(ctx);                                                          // the sign, before the roof (so the roof can hide it)
                if (this.style === 'silver_queen') this._sqDrawColumns(ctx);                   // the lantern columns stand in front of the portico
                // --- Roofs (drawn in world coords under the scale-about-camera transform) ---
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                const sq = this.style === 'silver_queen';
                // The landmarks' roofs are painted once (PlaneSprites, entities/prop-sprites.js): what moves on them
                // (cabanas, ripples, the sky in the skylight) and the penthouse walls stay live, at their depth
                if (this.style === 'moon_city') { PlaneSprites.draw(ctx, this, 'roof', k, c => this._mcDrawRoof(c, false)); ctx.restore(); return; }
                if (sq) PlaneSprites.draw(ctx, this, 'roof', k, c => this._leanRoof(c, true));
                else this._leanRoof(ctx, false);
                ctx.restore();
                if (sq) this._sqDrawCrown(ctx, false);
            },

            /** The roof in the roof plane (ctx already scaled about the camera): sections, seams, parapets, features */
            _leanRoof(ctx, sq) {
                if (PropPass.seg(false)) this.sections.forEach((section, si) => {
                    const sx = this.x + section.x, sy = this.y + section.y;
                    if (sq) {                                                                  // lavender slab with a soft sheen (world-space gradients, made once)
                        ctx.fillStyle = LandmarkKit.grad(this, 'roof' + si, () => { const g = ctx.createLinearGradient(sx, sy, sx + section.w, sy + section.h); g.addColorStop(0, SQ_THEME.roof); g.addColorStop(1, SQ_THEME.roofLo); return g; });
                    } else ctx.fillStyle = this.colors.roof;
                    const outline = this._roundSec ? this._roofPath(section, si) : null;
                    if (outline) { ctx.save(); ctx.fill(outline); ctx.clip(outline); } else ctx.fillRect(sx, sy, section.w, section.h);
                    if (sq) {                                                                  // a pearl sheen pooled toward the north-west corner
                        ctx.fillStyle = LandmarkKit.grad(this, 'sheen' + si, () => {
                            const pg = ctx.createRadialGradient(sx + section.w * 0.25, sy + section.h * 0.2, 10, sx + section.w * 0.25, sy + section.h * 0.2, Math.max(section.w, section.h) * 0.8);
                            pg.addColorStop(0, 'rgba(214,200,255,0.18)'); pg.addColorStop(1, 'rgba(214,200,255,0)'); return pg; });
                        ctx.fillRect(sx, sy, section.w, section.h);
                    }
                    ctx.strokeStyle = sq ? 'rgba(217,191,134,0.08)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;          // tar seams (one world path a section)
                    ctx.stroke(this._seamPath(section, sx, sy));
                    if (outline) ctx.restore();
                    ctx.strokeStyle = sq ? SQ_THEME.trim : lightenHex(this.colors.roof, 22); ctx.lineWidth = sq ? 4 : 5;       // parapet
                    if (outline) ctx.stroke(this._roofPath(section, si, 2.5)); else ctx.strokeRect(sx + 2.5, sy + 2.5, section.w - 5, section.h - 5);
                    if (sq) { ctx.strokeStyle = 'rgba(45,29,89,0.45)'; ctx.lineWidth = 1; if (outline) ctx.stroke(this._roofPath(section, si, 6)); else ctx.strokeRect(sx + 6, sy + 6, section.w - 12, section.h - 12); }
                });
                if (sq && PropPass.seg(false)) this._sqRoofEdgeLights(ctx, false);
                if (this.style) this._drawRoofFeatures(ctx, false);
                else this._drawRoofProps(ctx);
            },

            /** A roof prop's disc (fan hub, tank): one world path, made once and kept on the prop */
            _roofPropDisc(p, x, y, r, key = 'disc') {
                const k = '_' + key;
                if (!p[k] || p[k + 'x'] !== x || p[k + 'y'] !== y || p[k + 'r'] !== r) { const d = new Path2D(); d.arc(x, y, r, 0, Math.PI * 2); p[k] = d; p[k + 'x'] = x; p[k + 'y'] = y; p[k + 'r'] = r; }
                return p[k];
            },

            /** A roof section's tar seams, every 36 px: one world-space path, made once */
            _seamPath(section, sx, sy) {
                const m = this._seams || (this._seams = new WeakMap());
                let e = m.get(section);
                if (!e || e.sx !== sx || e.sy !== sy || e.w !== section.w || e.h !== section.h) {
                    const p = new Path2D();
                    for (let gx = 36; gx < section.w; gx += 36) { p.moveTo(sx + gx, sy); p.lineTo(sx + gx, sy + section.h); }
                    m.set(section, e = { sx, sy, w: section.w, h: section.h, p });
                }
                return e.p;
            },

            /** Emissive layer (after lighting): lit windows, neon trim, rooftop lights. dark = ambient darkness 0..1 */
            drawEmissive(ctx, dark, beamsOnly) {
                if (this.style === 'enni_cole' && typeof game !== 'undefined' && game.camera) { this._ecDrawEmissive(ctx, dark); return; }
                if (!(CONFIG.BUILDINGS.LEAN && typeof game !== 'undefined' && game.camera)) return;
                if (this.style === 'double_nights') { this._dnDrawEmissive(ctx, dark); return; }
                if (beamsOnly) {   // all but the beams is past glowReach, off screen (world-state.js drawEmissivePass)
                    if (this.style === 'silver_queen') { this._sqDark = dark; this._sqDrawBeams(ctx, dark); }
                    if (this.style === 'moon_city') this._mcBeams(ctx, dark);
                    return;
                }
                const cam = game.camera, s = this._leanScale(), k = 1 + s;
                const P = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
                const glow = Math.max(0.15, Math.min(1, dark * 1.1));
                ctx.save();
                ctx.globalAlpha = glow;
                if (this.style === 'silver_queen') this._sqDark = dark;
                for (const f of this._visibleFaces(cam)) {
                    if (this.style && f.side === this.facing && this._entrance()) this._drawFrontWash(ctx, f, P);
                    this._drawFaceWindows(ctx, f, P, true); this._drawFaceFeature(ctx, f, P, true);
                }
                if (this.style === 'silver_queen') { this._sqEmissiveStructure(ctx, dark, glow); ctx.globalAlpha = glow; ctx.globalCompositeOperation = 'source-over'; }
                if (this.style === 'moon_city') { this._mcDrawCanopy(ctx, true); this._mcDrawSign(ctx, true, dark); ctx.globalAlpha = glow; ctx.globalCompositeOperation = 'source-over'; }
                // Roof: rim light along parapets reads the silhouette at night, plus neon/rooftop lights
                ctx.translate(cam.x, cam.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
                const rim = this.style ? this.colors.accent : '#8fa0c8';
                ctx.strokeStyle = rim; ctx.globalAlpha = glow * (this.style ? 0.55 : 0.18); ctx.lineWidth = this.style ? 1.6 : 1;
                if (this.style) { ctx.shadowColor = rim; ctx.shadowBlur = 8; }
                this.sections.forEach(section => ctx.strokeRect(this.x + section.x + 1, this.y + section.y + 1, section.w - 2, section.h - 2));
                ctx.shadowBlur = 0; ctx.globalAlpha = glow;
                if (this.style === 'silver_queen') this._sqRoofEdgeLights(ctx, true);
                if (this.style === 'moon_city') this._mcDrawRoof(ctx, true);
                if (this.style) this._drawRoofFeatures(ctx, true);
                ctx.restore();
                if (this.style === 'silver_queen') { this._sqVeil(ctx, dark); this._sqDrawCrown(ctx, true); this._sqDrawBeams(ctx, dark); }
                if (this.style === 'moon_city') this._mcBeams(ctx, dark);
            },

            /** Floodlight wash up the front face from the entrance lamps (accent-tinted). */
            _drawFrontWash(ctx, f, P) {
                if (this.style === 'silver_queen') return;               // Silver Queen lights its facade from the portico (_sqFace)
                const E = this._entrance(), vert = !!E.nx, door = vert ? E.cy : E.cx;   // the door's place along this face
                const lo = vert ? Math.min(f.y1, f.y2) : Math.min(f.x1, f.x2), hi = vert ? Math.max(f.y1, f.y2) : Math.max(f.x1, f.x2);
                if (door < lo - 40 || door > hi + 40) return;
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                if (Math.hypot(dx - ax, dy - ay) < 6) return;
                const reach = this.style === 'silver_queen' ? 260 : 120;
                const gx = vert ? ax : door, gy = vert ? door : ay;
                const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, reach);
                g.addColorStop(0, hexToRgba(this.colors.accent, this.style === 'silver_queen' ? 0.55 : 0.35));
                g.addColorStop(1, hexToRgba(this.colors.accent, 0));
                ctx.save();
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.clip();
                ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
                const X0 = Math.min(ax, bx, cx, dx), Y0 = Math.min(ay, by, cy, dy);
                ctx.fillRect(X0 - 5, Y0 - 5, Math.max(ax, bx, cx, dx) - X0 + 10, Math.max(ay, by, cy, dy) - Y0 + 10);
                ctx.restore();
            },

            /** Window grid on a face. emissive=false: dark glass; true: only the lit windows, glowing. */
            /**
             * The windows of one face, batched: one path per colour (glass; the sky it holds by
             * day; lit / lavender / TV-blue by night), so a face costs a handful of fills however
             * many windows it has. Only the few in the sun's sheen band fill on their own. With
             * this.sills (the landmarks), each window has a sill: a pale lip and its shadow, and
             * at night the lips catch the building's lamp colour (LandmarkKit.rim).
             */
            _drawFaceWindows(ctx, f, P, emissive) {
                // Moving cameras use the original one-loop renderer. Building vector caches
                // become useful after a consecutive stationary frame; same-frame repeated passes
                // never count as stability. Standalone draws without a frame stamp retain caching.
                const drawId = typeof game !== 'undefined' ? game._renderDrawId : 0;
                if (Number.isSafeInteger(drawId) && drawId > 0 && game.camera) {
                    const camera = game.camera, motion = _FW_CAMERA_MOTION;
                    if (motion.drawId !== drawId || motion.camera !== camera || motion.x !== camera.x || motion.y !== camera.y || motion.zoom !== camera.zoom) {
                        const stable = motion.drawId + 1 === drawId && motion.camera === camera && motion.x === camera.x && motion.y === camera.y && motion.zoom === camera.zoom;
                        motion.camera = camera; motion.drawId = drawId; motion.x = camera.x; motion.y = camera.y; motion.zoom = camera.zoom; motion.moving = !stable;
                    }
                    if (motion.moving) return this._drawFaceWindowsUncached(ctx, f, P, emissive);
                }
                if (f.side === 'C' || this.style === 'moon_city') return;
                // An overridden mask can carry arbitrary callbacks/state. Keep that path unchanged.
                if (this.facadeFeature === 'silver_queen' && this._sqWindowMask !== _FW_DEFAULT_WINDOW_MASK)
                    return this._drawFaceWindowsUncached(ctx, f, P, emissive);
                const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS);
                if (!Number.isInteger(floors) || floors < 1) return this._drawFaceWindowsUncached(ctx, f, P, emissive);
                const ax = f.x1, ay = f.y1, bx = f.x2, by = f.y2;
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                const depth = Math.hypot(dx - ax, dy - ay);
                if (depth < floors * 1.6) return;
                const len = Math.hypot(bx - ax, by - ay);
                const cols = Math.max(1, Math.floor(len / (this.style === 'silver_queen' ? 30 : 26)));
                // Authoring/custom geometry may exceed normal maps: do not retain unbounded window records.
                // P was already sampled at both endpoints; pass those exact samples to the fallback.
                if (!Number.isFinite(cols) || floors * cols > 4096) {
                    let sample = 0;
                    return this._drawFaceWindowsUncached(ctx, f, () => sample++ === 0 ? [cx, cy] : [dx, dy], emissive);
                }
                const ex = bx - ax, ey = by - ay, tx = cx - dx, ty = cy - dy, ux = dx - ax, uy = dy - ay;
                const seed = this._seed || Math.round(this.x + this.y);
                const t = Math.floor(_gameTimeSec / 7);
                let lightHashes = null;
                if (emissive) {
                    const byFace = this._windowLightHashes || (this._windowLightHashes = new WeakMap());
                    lightHashes = byFace.get(f);
                    if (!lightHashes || lightHashes.seed !== seed || lightHashes.section !== f.section || lightHashes.side !== f.side ||
                        lightHashes.floors !== floors || lightHashes.cols !== cols || lightHashes.t !== t) {
                        lightHashes = { seed, section: f.section, side: f.side, floors, cols, t, values: [] };
                        byFace.set(f, lightHashes);
                    }
                }
                const lit = this.colors.windowLit || '#ffe2a8';
                const mask = this.facadeFeature === 'silver_queen' ? this._sqWindowMask(f) : null;
                const sun = emissive ? null : sunNow(), day = sun ? sun.day : 0;
                let skyA = 0, sheenA = 0, uc = 0.5;
                if (day > 0.03) {
                    const nx = f.side === 'E' ? 1 : f.side === 'W' ? -1 : 0, ny = f.side === 'S' ? 1 : f.side === 'N' ? -1 : 0;
                    const facing = Math.max(0, nx * sun.dx + ny * sun.dy);
                    skyA = day * (0.3 + 0.34 * facing); sheenA = day * (0.18 + 0.6 * facing);
                    uc = 0.5 + 0.55 * (ny ? sun.dx : sun.dy);
                }
                const sq = this.style === 'silver_queen', glassRGB = sq ? '176, 158, 236' : '168, 172, 226';
                const sills = !!(this.sills && _zoomLOD < 2 && depth > floors * 2.4);
                const rim = sills && emissive ? LandmarkKit.rim(this, this._sqDark != null ? this._sqDark : 0.6) : null;
                const nxo = f.side === 'E' ? 1 : f.side === 'W' ? -1 : 0, nyo = f.side === 'S' ? 1 : f.side === 'N' ? -1 : 0;
                // Compare mask results, rather than a newly allocated mask closure: entrance/portico
                // edits remain live, and nothing assumes an immutable building configuration.
                let maskBits = '';
                if (mask) for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) maskBits += mask(fl, (c + 0.5) / cols) ? '1' : '0';
                const view = paintViewBounds(ctx, 16);
                let faceBounds = null;
                if (view) {
                    // Full face hull, including first-floor sills below the wall's base. The 2.5
                    // world-unit guard covers their outward offset and the 1.2-wide sill stroke.
                    const lowV = sills ? -0.22 / floors : 0;
                    const lax = ax + ux * lowV, lay = ay + uy * lowV;
                    const lbx = ax + ex + (ux + tx - ex) * lowV, lby = ay + ey + (uy + ty - ey) * lowV;
                    const guard = 2.5 + 1e-7 * Math.max(1, Math.abs(ax), Math.abs(ay), Math.abs(bx), Math.abs(by), Math.abs(cx), Math.abs(cy), Math.abs(dx), Math.abs(dy));
                    faceBounds = { left: Math.min(ax, bx, cx, dx, lax, lbx) - guard, right: Math.max(ax, bx, cx, dx, lax, lbx) + guard,
                        top: Math.min(ay, by, cy, dy, lay, lby) - guard, bottom: Math.max(ay, by, cy, dy, lay, lby) + guard };
                    if (!paintBoundsIntersect(view, faceBounds)) {
                        // Suppress only paint/geometry. Keep hash membership and the final Canvas
                        // state/current path exactly as the original fully offscreen pass left them.
                        if (emissive) {
                            for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) {
                                const index = fl * cols + c;
                                if (maskBits && maskBits[index] === '1') continue;
                                if (lightHashes.values[index] === undefined) lightHashes.values[index] = _bldHash(seed + f.section * 31 + f.side.charCodeAt(0), fl * 57 + c * 13 + (_bldHash(seed, fl + c) > 0.93 ? t : 0));
                            }
                            ctx.fillStyle = '#6f9fe8';
                            if (rim && rim.a > 0.01) { ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${rim.rgb}, ${0.5 * rim.a})`; }
                        } else {
                            ctx.fillStyle = sq ? 'rgba(23,0,92,0.9)' : 'rgba(20,28,48,0.9)';
                            if (skyA > 0) {
                                ctx.fillStyle = `rgba(${glassRGB}, ${skyA})`;
                                lastSheen: for (let fl = floors - 1; fl >= 0; fl--) for (let c = cols - 1; c >= 0; c--) {
                                    if (maskBits && maskBits[fl * cols + c] === '1') continue;
                                    const u0 = (c + 0.25) / cols, u1 = (c + 0.75) / cols;
                                    const du = Math.abs((u0 + u1) / 2 - uc), sh = sheenA * Math.max(0, 1 - du / 0.16) * (0.7 + 0.3 * (fl % 2));
                                    if (!(sh > 0.01)) continue;
                                    const v0 = (fl + 0.28) / floors, v1 = (fl + 0.78) / floors;
                                    ctx.beginPath();
                                    ctx.moveTo(ax + ex * u0 + (ux + tx * u0 - ex * u0) * v0, ay + ey * u0 + (uy + ty * u0 - ey * u0) * v0);
                                    ctx.lineTo(ax + ex * u1 + (ux + tx * u1 - ex * u1) * v0, ay + ey * u1 + (uy + ty * u1 - ey * u1) * v0);
                                    ctx.lineTo(ax + ex * u1 + (ux + tx * u1 - ex * u1) * v1, ay + ey * u1 + (uy + ty * u1 - ey * u1) * v1);
                                    ctx.lineTo(ax + ex * u0 + (ux + tx * u0 - ex * u0) * v1, ay + ey * u0 + (uy + ty * u0 - ey * u0) * v1); ctx.closePath();
                                    ctx.fillStyle = `rgba(${sun.rgb}, ${sh})`; break lastSheen;
                                }
                            }
                            if (sills) { ctx.lineWidth = 1; ctx.strokeStyle = this.sills.lip; }
                        }
                        return;
                    }
                }
                let faces = _FW_GEOMETRY.get(this);
                if (!faces) { faces = new WeakMap(); _FW_GEOMETRY.set(this, faces); }
                let geom = faces.get(f);
                if (!geom || geom.ax !== ax || geom.ay !== ay || geom.bx !== bx || geom.by !== by ||
                    geom.cx !== cx || geom.cy !== cy || geom.dx !== dx || geom.dy !== dy || geom.floors !== floors ||
                    geom.cols !== cols || geom.sills !== sills || geom.nxo !== nxo || geom.nyo !== nyo || geom.maskBits !== maskBits) {
                    if (!geom) geom = { windows: [], pool: [], paths: [], bounds: { left: 0, right: 0, top: 0, bottom: 0 } };
                    Object.assign(geom, { ax, ay, bx, by, cx, cy, dx, dy, floors, cols, sills, nxo, nyo, maskBits });
                    geom.windows.length = 0; geom.paths.length = 0; geom.boundsReady = false;
                    const sOut = 1.6, sLo = 0.2 / floors, sSh = 0.5 / floors;
                    for (let fl = 0; fl < floors; fl++) {
                        const v0 = (fl + 0.28) / floors, v1 = (fl + 0.78) / floors;
                        for (let c = 0; c < cols; c++) {
                            if (maskBits && maskBits[fl * cols + c] === '1') continue;
                            const u0 = (c + 0.25) / cols, u1 = (c + 0.75) / cols;
                            const index = geom.windows.length;
                            const w = geom.pool[index] || (geom.pool[index] = { points: [], lip: [], shade: [], bounds: {} });
                            geom.windows.push(w);
                            w.fl = fl; w.c = c; w.u0 = u0; w.u1 = u1; w.v0 = v0; w.v1 = v1;
                            const points = w.points, lip = w.lip, shade = w.shade;
                            points[0] = ax + ex * u0 + (ux + tx * u0 - ex * u0) * v0; points[1] = ay + ey * u0 + (uy + ty * u0 - ey * u0) * v0;
                            points[2] = ax + ex * u1 + (ux + tx * u1 - ex * u1) * v0; points[3] = ay + ey * u1 + (uy + ty * u1 - ey * u1) * v0;
                            points[4] = ax + ex * u1 + (ux + tx * u1 - ex * u1) * v1; points[5] = ay + ey * u1 + (uy + ty * u1 - ey * u1) * v1;
                            points[6] = ax + ex * u0 + (ux + tx * u0 - ex * u0) * v1; points[7] = ay + ey * u0 + (uy + ty * u0 - ey * u0) * v1;
                            if (sills) {
                                const w0 = u0 - 0.06 / cols, w1 = u1 + 0.06 / cols, vl = v0 - sLo, vs = v0 - sSh;
                                lip[0] = ax + ex * w0 + (ux + tx * w0 - ex * w0) * vl + nxo * sOut; lip[1] = ay + ey * w0 + (uy + ty * w0 - ey * w0) * vl + nyo * sOut;
                                lip[2] = ax + ex * w1 + (ux + tx * w1 - ex * w1) * vl + nxo * sOut; lip[3] = ay + ey * w1 + (uy + ty * w1 - ey * w1) * vl + nyo * sOut;
                                shade[0] = ax + ex * w0 + (ux + tx * w0 - ex * w0) * vs + nxo * sOut; shade[1] = ay + ey * w0 + (uy + ty * w0 - ey * w0) * vs + nyo * sOut;
                                shade[2] = ax + ex * w1 + (ux + tx * w1 - ex * w1) * vs + nxo * sOut; shade[3] = ay + ey * w1 + (uy + ty * w1 - ey * w1) * vs + nyo * sOut;
                            }
                        }
                    }
                    geom.pool.length = geom.windows.length;
                    faces.set(f, geom);
                }
                // Fully contained faces do not pay per-window bounds calculations. Partial faces
                // build those bounds once per projection; both normal and reflected passes share them.
                const all = !view || (faceBounds.left >= view.left && faceBounds.right <= view.right && faceBounds.top >= view.top && faceBounds.bottom <= view.bottom);
                let visibleBits = all ? '*' : '';
                if (!all) {
                    if (!geom.boundsReady) {
                        for (const w of geom.windows) {
                            const p = w.points, lip = w.lip, shade = w.shade;
                            let left = Math.min(p[0], p[2], p[4], p[6]), right = Math.max(p[0], p[2], p[4], p[6]);
                            let top = Math.min(p[1], p[3], p[5], p[7]), bottom = Math.max(p[1], p[3], p[5], p[7]);
                            if (sills) {
                                left = Math.min(left, lip[0], lip[2], shade[0], shade[2]); right = Math.max(right, lip[0], lip[2], shade[0], shade[2]);
                                top = Math.min(top, lip[1], lip[3], shade[1], shade[3]); bottom = Math.max(bottom, lip[1], lip[3], shade[1], shade[3]);
                            }
                            w.bounds.left = left - 1; w.bounds.right = right + 1; w.bounds.top = top - 1; w.bounds.bottom = bottom + 1;
                        }
                        geom.boundsReady = true;
                    }
                    for (const w of geom.windows) visibleBits += paintBoundsIntersect(view, w.bounds) ? '1' : '0';
                }
                let paths = geom.paths.find(p => p.visibleBits === visibleBits);
                if (!paths) {
                    paths = { visibleBits, visible: [], glass: null, lip: null, shade: null, lighting: null, tvBits: null };
                    for (let i = 0; i < geom.windows.length; i++) if (all || visibleBits[i] === '1') paths.visible.push(geom.windows[i]);
                    if (geom.paths.length === 2) geom.paths.shift();
                    geom.paths.push(paths);
                }
                const quad = (path, w) => { const p = w.points; path.moveTo(p[0], p[1]); path.lineTo(p[2], p[3]); path.lineTo(p[4], p[5]); path.lineTo(p[6], p[7]); path.closePath(); };
                const lines = (key, part) => {
                    if (paths[key]) return paths[key];
                    const p = paths[key] = new Path2D();
                    for (const w of paths.visible) { const v = w[part]; p.moveTo(v[0], v[1]); p.lineTo(v[2], v[3]); }
                    return p;
                };
                if (emissive) {
                    const threshold = this.style ? 0.5 : 0.3, lavender = this.facadeFeature === 'silver_queen';
                    if (!paths.lighting || paths.lighting.hashes !== lightHashes || paths.lighting.threshold !== threshold || paths.lighting.lavender !== lavender) {
                        const lighting = paths.lighting = { hashes: lightHashes, threshold, lavender, lit: new Path2D(), lav: new Path2D(), tvWindows: [] };
                        // Seed every unmasked window, including culled ones, as in the original pass.
                        for (const w of geom.windows) {
                            const index = w.fl * cols + w.c;
                            if (lightHashes.values[index] === undefined) lightHashes.values[index] = _bldHash(seed + f.section * 31 + f.side.charCodeAt(0), w.fl * 57 + w.c * 13 + (_bldHash(seed, w.fl + w.c) > 0.93 ? t : 0));
                        }
                        for (const w of paths.visible) {
                            const h = lightHashes.values[w.fl * cols + w.c];
                            if (!(h < threshold)) continue;
                            if (h < 0.06) lighting.tvWindows.push(w);
                            else quad(lavender && h > 0.36 ? lighting.lav : lighting.lit, w);
                        }
                        paths.tvBits = null;
                    }
                    const lighting = paths.lighting;
                    let tvBits = '';
                    for (const w of lighting.tvWindows) tvBits += Math.sin(_gameTimeSec * 9 + w.c) > 0 ? '1' : '0';
                    if (paths.tvBits !== tvBits) {
                        paths.tvBits = tvBits; paths.tvA = new Path2D(); paths.tvB = new Path2D();
                        for (let i = 0; i < lighting.tvWindows.length; i++) quad(tvBits[i] === '1' ? paths.tvA : paths.tvB, lighting.tvWindows[i]);
                    }
                    ctx.fillStyle = lit; ctx.fill(lighting.lit);
                    ctx.fillStyle = '#d9c2ff'; ctx.fill(lighting.lav);
                    ctx.fillStyle = '#9ec8ff'; ctx.fill(paths.tvA);
                    ctx.fillStyle = '#6f9fe8'; ctx.fill(paths.tvB);
                    if (rim && rim.a > 0.01) {
                        const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
                        ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${rim.rgb}, ${0.5 * rim.a})`; ctx.stroke(lines('lip', 'lip'));
                        ctx.globalCompositeOperation = op;
                    }
                    return;
                }
                if (!paths.glass) { paths.glass = new Path2D(); for (const w of paths.visible) quad(paths.glass, w); }
                ctx.fillStyle = sq ? 'rgba(23,0,92,0.9)' : 'rgba(20,28,48,0.9)'; ctx.fill(paths.glass);
                if (skyA > 0) {
                    ctx.fillStyle = `rgba(${glassRGB}, ${skyA})`; ctx.fill(paths.glass);
                    // Sun color, direction, band position and alternating floor sheen stay live.
                    // Retain paint order and the final Canvas state even for offscreen sheen windows.
                    // Windows of one column and floor parity share the sheen's alpha: one fill a group (they never overlap)
                    const groups = _FW_SHEEN_GROUPS; groups.clear();
                    for (let i = 0; i < geom.windows.length; i++) {
                        const w = geom.windows[i], du = Math.abs((w.u0 + w.u1) / 2 - uc), sh = sheenA * Math.max(0, 1 - du / 0.16) * (0.7 + 0.3 * (w.fl % 2));
                        if (!(sh > 0.01) || !(all || visibleBits[i] === '1')) continue;
                        let g = groups.get(sh); if (!g) groups.set(sh, g = new Path2D());
                        quad(g, w);
                    }
                    for (const [sh, g] of groups) { ctx.fillStyle = `rgba(${sun.rgb}, ${sh})`; ctx.fill(g); }
                    groups.clear();
                }
                if (sills) {
                    ctx.lineWidth = 1.2; ctx.strokeStyle = this.sills.shade; ctx.stroke(lines('shade', 'shade'));
                    ctx.lineWidth = 1; ctx.strokeStyle = this.sills.lip; ctx.stroke(lines('lip', 'lip'));
                }
            },

            _drawFaceWindowsUncached(ctx, f, P, emissive) {
                if (f.side === 'C' || this.style === 'moon_city') return;             // (Moon City: no windows, its fins and smoked glass are _mcFace)                          // rounded corners: no windows on the curve
                const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS);
                const ax = f.x1, ay = f.y1, bx = f.x2, by = f.y2;
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                const depth = Math.hypot(dx - ax, dy - ay);
                if (depth < floors * 1.6) return;                   // too edge-on to read
                const len = Math.hypot(bx - ax, by - ay);
                const cols = Math.max(1, Math.floor(len / (this.style === 'silver_queen' ? 30 : 26)));
                // at(u, v): u along the edge, v up the wall — inlined into the loops below
                const ex = bx - ax, ey = by - ay, tx = cx - dx, ty = cy - dy, ux = dx - ax, uy = dy - ay;
                const seed = this._seed || Math.round(this.x + this.y);
                const t = Math.floor(_gameTimeSec / 7);             // lights change every few seconds
                // A face retains only its latest seven-second lighting bucket. TV flicker stays live below.
                let lightHashes = null;
                if (emissive) {
                    const byFace = this._windowLightHashes || (this._windowLightHashes = new WeakMap());
                    lightHashes = byFace.get(f);
                    if (!lightHashes || lightHashes.seed !== seed || lightHashes.section !== f.section || lightHashes.side !== f.side ||
                        lightHashes.floors !== floors || lightHashes.cols !== cols || lightHashes.t !== t) {
                        lightHashes = { seed, section: f.section, side: f.side, floors, cols, t, values: [] };
                        byFace.set(f, lightHashes);
                    }
                }
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
                const sills = this.sills && _zoomLOD < 2 && depth > floors * 2.4;
                const rim = sills && emissive ? LandmarkKit.rim(this, this._sqDark != null ? this._sqDark : 0.6) : null;
                const nxo = f.side === 'E' ? 1 : f.side === 'W' ? -1 : 0, nyo = f.side === 'S' ? 1 : f.side === 'N' ? -1 : 0;
                // Each pass creates only the paths it fills; window lighting hashes are emissive-only.
                const glass = emissive ? null : new Path2D();
                const litP = emissive ? new Path2D() : null, lavP = emissive ? new Path2D() : null;
                const tvA = emissive ? new Path2D() : null, tvB = emissive ? new Path2D() : null;
                const lipP = sills ? new Path2D() : null, shP = sills && !emissive ? new Path2D() : null, sheen = _FW_SHEEN;
                sheen.length = 0;                                   // [u0, u1, v0, v1, a] × n, reused
                const sOut = 1.6, sLo = 0.2 / floors, sSh = 0.5 / floors;
                // a sill's line at height vv from w0 to w1, and a window corner at (u, v): made once a face, not per window
                const sill = (P2, w0, w1, vv) => {
                    P2.moveTo(ax + ex * w0 + (ux + tx * w0 - ex * w0) * vv + nxo * sOut, ay + ey * w0 + (uy + ty * w0 - ey * w0) * vv + nyo * sOut);
                    P2.lineTo(ax + ex * w1 + (ux + tx * w1 - ex * w1) * vv + nxo * sOut, ay + ey * w1 + (uy + ty * w1 - ey * w1) * vv + nyo * sOut);
                };
                const q = (path, u, v) => path.lineTo(ax + ex * u + (ux + tx * u - ex * u) * v, ay + ey * u + (uy + ty * u - ey * u) * v);
                for (let fl = 0; fl < floors; fl++) {
                    const v0 = (fl + 0.28) / floors, v1 = (fl + 0.78) / floors;
                    for (let c = 0; c < cols; c++) {
                        if (mask && mask(fl, (c + 0.5) / cols)) continue;
                        const u0 = (c + 0.25) / cols, u1 = (c + 0.75) / cols;
                        let h = 0;
                        if (emissive) {
                            const index = fl * cols + c;
                            h = lightHashes.values[index];
                            if (h === undefined) {
                                h = _bldHash(seed + f.section * 31 + (f.side.charCodeAt(0)), fl * 57 + c * 13 + (_bldHash(seed, fl + c) > 0.93 ? t : 0));
                                lightHashes.values[index] = h;
                            }
                        }
                        const isLit = h < (this.style ? 0.5 : 0.3);
                        if (sills && (!emissive || rim.a > 0.01)) {                 // the sill: a lip just under the glass, a shadow under it
                            const w0 = u0 - 0.06 / cols, w1 = u1 + 0.06 / cols;
                            sill(lipP, w0, w1, v0 - sLo);
                            if (!emissive) sill(shP, w0, w1, v0 - sSh);
                        }
                        if (emissive && !isLit) continue;
                        const path = !emissive ? glass : h < 0.06 ? (Math.sin(_gameTimeSec * 9 + c) > 0 ? tvA : tvB)
                                   : (this.facadeFeature === 'silver_queen' && h > 0.36) ? lavP : litP;   // someone's watching TV; some rooms lit lavender
                        // the four corners: at(u0,v0), at(u1,v0), at(u1,v1), at(u0,v1)
                        path.moveTo(ax + ex * u0 + (ux + tx * u0 - ex * u0) * v0, ay + ey * u0 + (uy + ty * u0 - ey * u0) * v0);
                        q(path, u1, v0); q(path, u1, v1); q(path, u0, v1); path.closePath();
                        if (!emissive && skyA > 0) {
                            const du = Math.abs((u0 + u1) / 2 - uc), sh = sheenA * Math.max(0, 1 - du / 0.16) * (0.7 + 0.3 * (fl % 2));
                            if (sh > 0.01) sheen.push(u0, u1, v0, v1, sh);
                        }
                    }
                }
                if (emissive) {
                    ctx.fillStyle = lit; ctx.fill(litP);
                    ctx.fillStyle = '#d9c2ff'; ctx.fill(lavP);
                    ctx.fillStyle = '#9ec8ff'; ctx.fill(tvA);
                    ctx.fillStyle = '#6f9fe8'; ctx.fill(tvB);
                    if (rim && rim.a > 0.01) {
                        const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
                        ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${rim.rgb}, ${0.5 * rim.a})`; ctx.stroke(lipP);
                        ctx.globalCompositeOperation = op;
                    }
                    return;
                }
                ctx.fillStyle = sq ? 'rgba(23,0,92,0.9)' : 'rgba(20,28,48,0.9)'; ctx.fill(glass);
                if (skyA > 0) {
                    ctx.fillStyle = `rgba(${glassRGB}, ${skyA})`; ctx.fill(glass);
                    const groups = _FW_SHEEN_GROUPS; groups.clear();                         // (one fill a shared alpha, as above)
                    for (let i = 0; i < sheen.length; i += 5) {
                        const u0 = sheen[i], u1 = sheen[i + 1], v0 = sheen[i + 2], v1 = sheen[i + 3], sh = sheen[i + 4];
                        let g = groups.get(sh); if (!g) groups.set(sh, g = new Path2D());
                        g.moveTo(ax + ex * u0 + (ux + tx * u0 - ex * u0) * v0, ay + ey * u0 + (uy + ty * u0 - ey * u0) * v0);
                        q(g, u1, v0); q(g, u1, v1); q(g, u0, v1); g.closePath();
                    }
                    for (const [sh, g] of groups) { ctx.fillStyle = `rgba(${sun.rgb}, ${sh})`; ctx.fill(g); }
                    groups.clear();
                }
                if (sills) {
                    ctx.lineWidth = 1.2; ctx.strokeStyle = this.sills.shade; ctx.stroke(shP);
                    ctx.lineWidth = 1; ctx.strokeStyle = this.sills.lip; ctx.stroke(lipP);
                }
            },

            /** Facade features: balconies / fire escapes on apartments, the Silver Queen front. */
            _drawFaceFeature(ctx, f, P, emissive) {
                if (!this.facadeFeature) return;
                if (this.facadeFeature === 'silver_queen') { this._sqFace(ctx, f, P, emissive); return; }
                if (this.facadeFeature === 'moon_city') { this._mcFace(ctx, f, P, emissive); return; }
                const floors = Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS);
                const [ax, ay] = [f.x1, f.y1], [bx, by] = [f.x2, f.y2];
                const [cx, cy] = P(bx, by), [dx, dy] = P(ax, ay);
                if (Math.hypot(dx - ax, dy - ay) < 6) return;
                const at = (u, v) => { const x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u, x1 = dx + (cx - dx) * u, y1 = dy + (cy - dy) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
                const acc = this.colors.accent;
                const seg = (path, p, q) => { path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]); };
                if (this.facadeFeature === 'balconies' && f.side === this.facing) {
                    const path = new Path2D();                          // (one path: the rails never touch, nor the lights)
                    for (let fl = 1; fl < floors; fl += 2) {
                        const v = fl / floors;
                        if (!emissive) seg(path, at(0.08, v), at(0.92, v));
                        else for (let u = 0.12; u < 0.9; u += 0.19) { const p = at(u, v); path.moveTo(p[0] + 1.1, p[1]); path.arc(p[0], p[1], 1.1, 0, Math.PI * 2); }   // little string of balcony lights
                    }
                    if (!emissive) { ctx.strokeStyle = 'rgba(200,210,225,0.55)'; ctx.lineWidth = 1.4; ctx.stroke(path); }
                    else { ctx.fillStyle = acc; ctx.fill(path); }
                } else if (this.facadeFeature === 'fire_escape' && (f.side === 'E' || f.side === 'W') && !emissive) {
                    // Landings, odd stairs, even stairs: three paths, none touching itself, so every joint still takes
                    // its two (or three) coats of the 0.7 alpha, as line by line did
                    const landings = new Path2D(), odd = new Path2D(), even = new Path2D();
                    for (let fl = 1; fl < floors; fl++) {
                        const v = fl / floors, u0 = fl % 2 ? 0.3 : 0.6, u1 = fl % 2 ? 0.6 : 0.3;
                        seg(landings, at(0.25, v), at(0.65, v));
                        seg(fl % 2 ? odd : even, at(u0, v), at(u1, (fl + 1) / floors));
                    }
                    ctx.strokeStyle = 'rgba(150,120,110,0.7)'; ctx.lineWidth = 1;
                    ctx.stroke(landings); ctx.stroke(odd); ctx.stroke(even);
                }
            },

            /** The procedural roof props (AC, tanks, vents, fans) for buildings without a style. */
            _drawRoofProps(ctx) {
                for (const p of this.roofProps) {
                    const sec = this.sections[p.section] || this.sections[0];
                    const x = this.x + sec.x + p.x, y = this.y + sec.y + p.y;
                    if (p.type === 'ac_unit') { ctx.fillStyle = '#3a3f48'; ctx.fillRect(x, y, p.w, p.h); ctx.strokeStyle = '#555c66'; ctx.strokeRect(x + 3, y + 3, p.w - 6, p.h - 6); }
                    else if (p.type === 'water_tank') { ctx.fillStyle = '#4a4238'; ctx.fill(this._roofPropDisc(p, x, y, p.r)); ctx.strokeStyle = '#6a5e50'; ctx.lineWidth = 2; ctx.stroke(this._roofPropDisc(p, x, y, p.r * 0.7, 'in')); }
                    else if (p.type === 'vent') { ctx.fillStyle = '#2e333a'; ctx.fillRect(x, y, p.w, p.h); }
                    else if (p.type === 'roof_fan') {                   // the hub, then its four blades turning (one opaque stroke: they only meet at the hub)
                        ctx.fillStyle = '#333841'; ctx.fill(this._roofPropDisc(p, x, y, p.r));
                        const blades = new Path2D();
                        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + _gameTimeSec * 2; blades.moveTo(x, y); blades.lineTo(x + Math.cos(a) * p.r * 0.8, y + Math.sin(a) * p.r * 0.8); }
                        ctx.strokeStyle = '#4b525c'; ctx.lineWidth = 1; ctx.stroke(blades);
                    }
                }
            },

            /** Styled rooftops. Coordinates are world coords (caller has applied the roof transform). */
            _drawRoofFeatures(ctx, emissive) {
                if (this.style === 'silver_queen') { this._sqDrawRoof(ctx, emissive); if (emissive || PropPass.seg(true)) this._drawPenthouse(ctx, emissive); return; }   // (its walls lean with the camera: live)
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
                                ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;   // caustic shimmer (one path: the curves stay apart)
                                const caustics = new Path2D();
                                for (let i = 0; i < 4; i++) { const yy = y + h * (0.2 + i * 0.2) + Math.sin(t * 1.5 + i) * 2; caustics.moveTo(x + 4, yy); caustics.quadraticCurveTo(x + w / 2, yy + Math.sin(t * 2 + i) * 3, x + w - 4, yy); }
                                ctx.stroke(caustics);
                            }
                            break;
                        }
                        case 'garden': {
                            if (!emissive) {
                                ctx.fillStyle = '#3b2e24'; ctx.fillRect(x, y, w, h);
                                const greens = ['#2f7d3a', '#3c9b47', '#27643a'], beds = [new Path2D(), new Path2D(), new Path2D()], rr = Math.min(w, h) * 0.14;   // (a path a green: the planters never touch)
                                for (let i = 0; i < 9; i++) { const px = x + w * (0.12 + (i % 3) * 0.38), py = y + h * (0.2 + Math.floor(i / 3) * 0.3); beds[i % 3].moveTo(px + rr, py); beds[i % 3].arc(px, py, rr, 0, Math.PI * 2); }
                                for (let k = 0; k < 3; k++) { ctx.fillStyle = greens[k]; ctx.fill(beds[k]); }
                            } else {                                        // lanterns between the planters
                                const lanterns = new Path2D();
                                for (let i = 0; i < 4; i++) { const px = x + w * (0.3 + (i % 2) * 0.4), py = y + h * (0.35 + Math.floor(i / 2) * 0.3); lanterns.moveTo(px + 1.6, py); lanterns.arc(px, py, 1.6, 0, Math.PI * 2); }
                                ctx.fillStyle = '#ffcf7a'; ctx.fill(lanterns);
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
                            const panels = new Path2D();                    // (one path: the six panels stand apart)
                            for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) panels.rect(x + i * w / 3 + 2, y + j * h / 2 + 2, w / 3 - 4, h / 2 - 4);
                            ctx.fillStyle = '#1c2a4a'; ctx.fill(panels);
                            ctx.strokeStyle = 'rgba(120,160,255,0.35)'; ctx.lineWidth = 0.6; ctx.stroke(panels);
                            break;
                        }
                        case 'lights': {                                    // festoon string lights zig-zagging across
                            if (!emissive) break;
                            // Every bulb at its own shimmer of the string's brightness. Bulbs at the same i + z share colour and
                            // shimmer: one fill each (the string's 39 bulbs in 15)
                            const cols = ['#ffd27a', acc, '#ffd27a', '#ff9ecf'], a0 = ctx.globalAlpha, rows = [];
                            for (let z = 0; z < 3; z++) {
                                const y0 = y + h * (0.15 + z * 0.35), y1 = y0 + h * 0.18;
                                for (let i = 0; i <= 12; i++) {
                                    const px = x + w * i / 12, py = (i % 2 ? y1 : y0) + Math.sin(i * 0.9) * 2, s = i + z;
                                    const path = rows[s] || (rows[s] = new Path2D()); path.moveTo(px + 1.5, py); path.arc(px, py, 1.5, 0, Math.PI * 2);
                                }
                            }
                            for (let s = 0; s < rows.length; s++) {
                                ctx.fillStyle = cols[s % cols.length]; ctx.globalAlpha = a0 * (0.75 + 0.25 * Math.sin(t * 3 + s)); ctx.fill(rows[s]);
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


