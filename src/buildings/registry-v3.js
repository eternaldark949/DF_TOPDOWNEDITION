        /**
         * =====================================================================
         *  BUILDINGV2 REGISTRY - Self-Describing Building System
         * =====================================================================
         * Buildings register themselves with all metadata. CityLayout queries
         * this registry to get dimensions, colors, and create instances.
         * 
         * Benefits:
         * - Single source of truth for building dimensions
         * - Auto-calculates bounding box from sections
         * - Auto-sets block lamp colors from accent
         * - No duplicate template definitions needed
         * - Simple building creation without if/else chains
         */
        // ═══ BuildingV3 — Reads editor-exported building JSON ═══
        class BuildingV3 {
            constructor(x, y, data) {
                this.isV3 = true;
                this.x = x; this.y = y;
                this.data = data;
                this.name = data.name || 'building';
                this.w = data.w || 200;
                this.h = data.h || 200;
                this.footprint = data.footprint || [];
                this.details = data.details || [];
                this.levels = data.levels || [];
                this._neonPhase = Math.random() * Math.PI * 2;
                // Identify ground level (first level, typically "Ground Details") for split rendering
                this._groundLevel = this.levels.length > 0 ? this.levels[0].id : null;
                // Identify top level (the one named containing "Top" or the last structural level)
                this._topLevel = null;
                for (const lv of this.levels) {
                    if (lv.name && lv.name.toLowerCase().includes('top') && !lv.name.toLowerCase().includes('detail')) {
                        this._topLevel = lv.id; break;
                    }
                }
            }
            
            // Ground-level shapes — drawn BENEATH the player (crimson facade, sidewalk)
            drawGround(ctx, time) {
                ctx.save();
                ctx.translate(this.x, this.y);
                const t = (time || 0) / 1000;
                // Only draw ground-level footprints and details
                this.footprint.forEach(s => {
                    if (s.level === this._groundLevel) this._drawFootprint(ctx, s);
                });
                this.details.forEach(s => {
                    if (s.level === this._groundLevel) this._drawDetail(ctx, s, t);
                });
                ctx.restore();
            }
            
            // Everything above ground — drawn OVER the player (building body, roof, signs, lamps)
            draw(ctx, time) {
                ctx.save();
                ctx.translate(this.x, this.y);
                const t = (time || 0) / 1000;
                
                // Level ordering
                const levelOrder = {};
                this.levels.forEach((lv, i) => levelOrder[lv.id] = i);
                
                // Draw footprint shapes (sorted by level, skip ground level)
                const sortedFP = [...this.footprint]
                    .filter(s => s.level !== this._groundLevel)
                    .sort((a, b) => (levelOrder[a.level] || 0) - (levelOrder[b.level] || 0));
                sortedFP.forEach(s => this._drawFootprint(ctx, s));
                
                // Draw details (sorted by level, skip ground level)
                const sortedDetails = [...this.details]
                    .filter(s => s.level !== this._groundLevel)
                    .sort((a, b) => (levelOrder[a.level] || 0) - (levelOrder[b.level] || 0));
                sortedDetails.forEach(s => this._drawDetail(ctx, s, t));
                
                ctx.restore();
            }
            
            _drawFootprint(ctx, s) {
                ctx.save();
                ctx.globalAlpha = s.opacity !== undefined ? s.opacity : 1;
                if (s.rotation) {
                    const cx = s.x + (s.w || 0) / 2, cy = s.y + (s.h || 0) / 2;
                    ctx.translate(cx, cy); ctx.rotate(s.rotation); ctx.translate(-cx, -cy);
                }
                if (s.scaleX || s.scaleY) {
                    const cx = s.x + (s.w || 0) / 2, cy = s.y + (s.h || 0) / 2;
                    ctx.translate(cx, cy); ctx.scale(s.scaleX || 1, s.scaleY || 1); ctx.translate(-cx, -cy);
                }
                const cr = s.cornerRadius || 0;
                if (s.fill) {
                    ctx.fillStyle = s.fill;
                    if (s.type === 'roundrect' && cr && ctx.roundRect) {
                        ctx.beginPath(); ctx.roundRect(s.x, s.y, s.w, s.h, cr); ctx.fill();
                    } else { ctx.fillRect(s.x, s.y, s.w, s.h); }
                }
                if (s.stroke) {
                    ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeWidth || 1;
                    if (s.type === 'roundrect' && cr && ctx.roundRect) {
                        ctx.beginPath(); ctx.roundRect(s.x, s.y, s.w, s.h, cr); ctx.stroke();
                    } else { ctx.strokeRect(s.x, s.y, s.w, s.h); }
                }
                // Inset shading
                if (s.w > 20 && s.h > 20) {
                    const shG = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h * 0.3);
                    shG.addColorStop(0, 'rgba(0,0,0,0.15)'); shG.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = shG; ctx.fillRect(s.x, s.y, s.w, s.h * 0.3);
                }
                ctx.restore();
            }
            
            _drawDetail(ctx, s, t) {
                ctx.save();
                const hasRotation = s.rotation;
                const hasScale = (s.scaleX && s.scaleX !== 1) || (s.scaleY && s.scaleY !== 1);
                if (hasRotation || hasScale) {
                    const isRadial = ['roof_fan','roof_light','tree','interior_lamp','lamp'].includes(s.type);
                    const cx = isRadial ? s.x : s.x + (s.w || 0) / 2;
                    const cy = isRadial ? s.y : s.y + (s.h || 0) / 2;
                    ctx.translate(cx, cy);
                    if (hasRotation) ctx.rotate(s.rotation);
                    if (hasScale) ctx.scale(s.scaleX || 1, s.scaleY || 1);
                    ctx.translate(-cx, -cy);
                }
                switch (s.type) {
                    case 'skylight': {
                        const w = s.w || 40, h = s.h || 30;
                        const hex = (s.color || '#78a0c8').replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
                        ctx.fillStyle = `rgba(${r},${g},${b},0.25)`; ctx.fillRect(s.x, s.y, w, h);
                        ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`; ctx.lineWidth = 1.5; ctx.strokeRect(s.x, s.y, w, h);
                        ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + w, s.y + h);
                        ctx.moveTo(s.x + w, s.y); ctx.lineTo(s.x, s.y + h); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(s.x + w / 2, s.y); ctx.lineTo(s.x + w / 2, s.y + h);
                        ctx.moveTo(s.x, s.y + h / 2); ctx.lineTo(s.x + w, s.y + h / 2); ctx.stroke();
                        break;
                    }
                    case 'skylight_corner': {
                        const cw = s.w || 30, ch = s.h || 30;
                        const cpx = s.x + (s.curveX !== undefined ? s.curveX : 0);
                        const cpy = s.y + (s.curveY !== undefined ? s.curveY : ch);
                        const hex = (s.color || '#78a0c8').replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
                        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + cw, s.y); ctx.lineTo(s.x + cw, s.y + ch);
                        ctx.quadraticCurveTo(cpx, cpy, s.x, s.y); ctx.closePath();
                        ctx.fillStyle = `rgba(${r},${g},${b},0.25)`; ctx.fill();
                        ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`; ctx.lineWidth = 1.5; ctx.stroke();
                        break;
                    }
                    case 'entrance': {
                        const w = s.w || 40, h = s.h || 24;
                        const pulse = (Math.sin(t * 3) + 1) / 2;
                        const cx = s.x + w / 2, cy = s.y + h / 2;
                        ctx.fillStyle = `rgba(200,190,255,${0.08 + pulse * 0.06})`; ctx.fillRect(s.x, s.y, w, h);
                        ctx.shadowColor = 'rgba(180,170,255,0.8)'; ctx.shadowBlur = 8 + pulse * 4;
                        ctx.strokeStyle = `rgba(200,190,255,${0.5 + pulse * 0.3})`; ctx.lineWidth = 1.5;
                        ctx.strokeRect(s.x, s.y, w, h); ctx.shadowBlur = 0;
                        break;
                    }
                    case 'neon_sign': {
                        const text = s.text || 'SIGN';
                        const color = s.color || '#ff2266';
                        const fontSize = s.fontSize || 12;
                        const pulse = 0.7 + Math.sin(t * 2 + this._neonPhase) * 0.3;
                        ctx.font = `italic bold ${fontSize}px 'Brush Script MT', cursive`;
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.shadowColor = color; ctx.shadowBlur = 15 * pulse;
                        ctx.fillStyle = color; ctx.globalAlpha = pulse;
                        ctx.fillText(text, s.x, s.y);
                        ctx.globalAlpha = Math.min(1, pulse + 0.3);
                        ctx.shadowBlur = 5;
                        ctx.fillText(text, s.x, s.y);
                        ctx.shadowBlur = 0; ctx.textAlign = 'start'; ctx.globalAlpha = 1;
                        break;
                    }
                    case 'roof_light': {
                        const lr = s.r || 5;
                        ctx.fillStyle = s.color || '#ffcc44';
                        ctx.shadowColor = s.color || '#ffcc44'; ctx.shadowBlur = 8;
                        ctx.beginPath(); ctx.arc(s.x, s.y, lr, 0, Math.PI * 2); ctx.fill();
                        ctx.shadowBlur = 0;
                        break;
                    }
                    case 'wall_lamp': {
                        const wlc = s.color || '#ffeebb';
                        const wls = s.shape === 'square' ? 'rect' : 'round';
                        // Dark backing plate (mounted fixture look)
                        ctx.fillStyle = '#222';
                        if (wls === 'rect') { ctx.fillRect(s.x - 4, s.y - 4, 8, 8); }
                        else { ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }
                        // Glowing element
                        ctx.fillStyle = wlc; ctx.shadowColor = wlc; ctx.shadowBlur = 10;
                        if (wls === 'rect') { ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
                        else { ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill(); }
                        ctx.shadowBlur = 0;
                        break;
                    }
                    case 'interior_wall': {
                        const x2 = s.x2 !== undefined ? s.x2 : s.x;
                        const y2 = s.y2 !== undefined ? s.y2 : s.y + 40;
                        ctx.strokeStyle = s.color || '#8a7a6a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x2, y2); ctx.stroke();
                        break;
                    }
                    // lamp, interior_lamp are invisible in scene — they're converted to LampEntity
                }
                ctx.restore();
            }
            
            // Convert building details to game LampEntity instances (visible fixtures only)
            getLamps() {
                const lamps = [];
                this.details.forEach(s => {
                    if (s.type === 'lamp') {
                        lamps.push(new LampEntity({
                            x: this.x + s.x,
                            y: this.y + s.y,
                            lampType: s.lampType || 4,
                            color: s.color || '#ffeebb',
                            lightRadius: s.radius || 200,
                            angle: s.angle || 0,
                            intensity: s.intensity || 0.8
                        }));
                    } else if (s.type === 'roof_light') {
                        lamps.push(new LampEntity({
                            x: this.x + s.x,
                            y: this.y + s.y,
                            lampType: 4,
                            color: s.color || '#ffcc44',
                            lightRadius: 80,
                            angle: 0,
                            intensity: 0.7
                        }));
                    }
                    // NOTE: wall_lamp visual is rendered by _drawDetail (respects square/round shape)
                    // NOTE: interior_lamp is handled by getInteriorLights()
                });
                return lamps;
            }
            
            // Interior light sources — invisible emitters that cast shadows from interior walls
            // Includes: interior_lamp (ambient room lighting) and wall_lamp (fixture lighting)
            getInteriorLights() {
                const lights = [];
                this.details.forEach(s => {
                    if (s.type === 'interior_lamp') {
                        lights.push({
                            x: this.x + s.x,
                            y: this.y + s.y,
                            radius: s.radius || 100,
                            colorRadius: (s.radius || 100) * 0.85,
                            color: s.color || '#ffeebb',
                            intensity: s.intensity || 0.7,
                            level: s.level || 'base'
                        });
                    } else if (s.type === 'wall_lamp') {
                        lights.push({
                            x: this.x + s.x,
                            y: this.y + s.y,
                            radius: s.radius || 60,
                            colorRadius: (s.radius || 60) * 0.85,
                            color: s.color || '#ffeebb',
                            intensity: s.intensity || 0.6,
                            level: s.level || 'base'
                        });
                    }
                });
                return lights;
            }
            
            // Get edge segments for interior shadow casting (interior walls + footprint edges on a given level)
            getShadowSegments(level) {
                const segs = [];
                // Interior walls on this level
                this.details.forEach(s => {
                    if (s.type === 'interior_wall' && (s.level || 'base') === level) {
                        segs.push({
                            x1: this.x + s.x,
                            y1: this.y + s.y,
                            x2: this.x + (s.x2 !== undefined ? s.x2 : s.x),
                            y2: this.y + (s.y2 !== undefined ? s.y2 : s.y + 40)
                        });
                    }
                });
                // Footprint edges on this level (rects become 4 edge segments)
                this.footprint.forEach(s => {
                    if ((s.level || 'base') !== level) return;
                    if (s.w && s.h) {
                        const sx = this.x + s.x, sy = this.y + s.y, sw = s.w, sh = s.h;
                        segs.push(
                            { x1: sx, y1: sy, x2: sx + sw, y2: sy },
                            { x1: sx + sw, y1: sy, x2: sx + sw, y2: sy + sh },
                            { x1: sx + sw, y1: sy + sh, x2: sx, y2: sy + sh },
                            { x1: sx, y1: sy + sh, x2: sx, y2: sy }
                        );
                    }
                });
                return segs;
            }
            
            // Get all shadow segments grouped by level (for efficient lookup during lighting)
            getAllShadowSegments() {
                const byLevel = {};
                const levels = new Set();
                this.details.forEach(s => {
                    if (s.type === 'interior_lamp' || s.type === 'wall_lamp') levels.add(s.level || 'base');
                });
                levels.forEach(lv => { byLevel[lv] = this.getShadowSegments(lv); });
                return byLevel;
            }
            
            // Get collision walls — only the top-level footprint (main building body)
            getWalls() {
                const walls = [];
                if (this.data.hasCollision && this._topLevel) {
                    this.footprint.forEach(s => {
                        if (s.level === this._topLevel && s.w && s.h) {
                            walls.push({ x: this.x + s.x, y: this.y + s.y, w: s.w, h: s.h });
                        }
                    });
                }
                return walls;
            }
            
            // Get entrance transition
            getTransition(targetMap, returnLabel) {
                const ent = this.details.find(s => s.type === 'entrance');
                if (!ent) return null;
                return {
                    x: this.x + ent.x, y: this.y + ent.y,
                    w: ent.w || 80, h: ent.h || 24,
                    target: targetMap, label: returnLabel || 'Enter'
                };
            }
        }

        const BuildingV2Registry = {
            _registry: {},
            
            /**
             * Register a V2 building type.
             * @param {string} id - Unique building ID (e.g., 'silver_queen')
             * @param {object} metadata - Building metadata
             * @param {Function} metadata.factory - Factory function(x, y, config)
             * @param {Array} metadata.sections - Array of {x, y, w, h} for bounding box calc
             * @param {string} metadata.accentColor - Accent/lamp color
             * @param {string} metadata.label - Display name
             * @param {string} metadata.type - Building type (apartment, shopping, etc.)
             * @param {string} metadata.category - Category for auto-fill (residential, commercial, etc.)
             * @param {object} metadata.sign - Sign config {text, color, size}
             * @param {object} metadata.door - Door config {target, label, lightColor}
             * @param {number} metadata.floors - Number of floors (for facade depth)
             */
            register(id, metadata) {
                // Calculate bounding box from sections
                const bounds = this._calculateBounds(metadata.sections);
                
                this._registry[id] = {
                    id,
                    factory: metadata.factory,
                    sections: metadata.sections,
                    w: bounds.w,
                    h: bounds.h,
                    accentColor: metadata.accentColor,
                    label: metadata.label,
                    type: metadata.type,
                    category: metadata.category || 'commercial',
                    sign: metadata.sign,
                    door: metadata.door,
                    floors: metadata.floors || 8,
                    unique: metadata.unique !== false  // Default true for V2 buildings
                };
                
                console.log(`BuildingV2Registry: Registered '${id}' (${bounds.w}x${bounds.h})`);
                return this._registry[id];
            },
            
            /**
             * Calculate bounding box from sections array.
             */
            _calculateBounds(sections) {
                if (!sections || sections.length === 0) {
                    return { x: 0, y: 0, w: 200, h: 150 };
                }
                
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                
                sections.forEach(s => {
                    minX = Math.min(minX, s.x);
                    minY = Math.min(minY, s.y);
                    maxX = Math.max(maxX, s.x + s.w);
                    maxY = Math.max(maxY, s.y + s.h);
                });
                
                return {
                    x: minX,
                    y: minY,
                    w: maxX - minX,
                    h: maxY - minY
                };
            },
            
            /**
             * Check if a building ID is registered.
             */
            has(id) {
                return id in this._registry;
            },
            
            /**
             * Get building metadata.
             */
            get(id) {
                return this._registry[id] || null;
            },
            
            /**
             * Get building dimensions.
             */
            getDimensions(id) {
                const entry = this._registry[id];
                if (!entry) return null;
                return { w: entry.w, h: entry.h };
            },
            
            /**
             * Get building accent color (for lamp colors).
             */
            getAccentColor(id) {
                const entry = this._registry[id];
                return entry ? entry.accentColor : null;
            },
            
            /**
             * Create a building instance.
             */
            create(id, x, y, config = {}) {
                const entry = this._registry[id];
                if (!entry) {
                    console.error(`BuildingV2Registry: Unknown building '${id}'`);
                    return null;
                }
                return entry.factory(x, y, config);
            },
            
            /**
             * Get all registered building IDs.
             */
            list() {
                return Object.keys(this._registry);
            },
            
            /**
             * Generate a CityLayout-compatible template from registry entry.
             * This bridges V2 buildings with the existing template system.
             */
            toTemplate(id) {
                const entry = this._registry[id];
                if (!entry) return null;
                
                return {
                    w: entry.w,
                    h: entry.h,
                    type: entry.type,
                    label: entry.label,
                    color: entry.accentColor,  // Use accent as base color
                    unique: entry.unique,
                    category: entry.category,
                    mapCategory: entry.mapCategory || null,
                    sign: entry.sign,
                    door: entry.door,
                    isV2: true,  // Flag for CityLayout
                    v2Id: id    // Reference back to registry
                };
            }
        };

        // =====================================================================
        //  REGISTER V2 BUILDINGS
        // =====================================================================
        
        BuildingV2Registry.register('silver_queen', {
            factory: createSilverQueenApartments,
            sections: [
                { x: 0, y: 0, w: 700, h: 500 },
                { x: 0, y: 500, w: 350, h: 380 }
            ],
            accentColor: '#8142ff',
            label: 'Silver Queen Apts',
            type: 'apartment',
            category: 'residential',
            floors: 18,
            sign: { text: 'Silver Queen', color: '#8142ff', size: 32 },
            door: { target: 'apt_949', label: 'Enter Apartment', lightColor: '#9900ff' }
        });
        
        BuildingV2Registry.register('enni_cole', {
            factory: createEnniCole,
            sections: [
                { x: 0, y: 0, w: 900, h: 280 },
                { x: 0, y: 280, w: 250, h: 420 },
                { x: 650, y: 280, w: 250, h: 420 }
            ],
            accentColor: '#ff69b4',
            label: 'Enni Cole',
            type: 'shopping',
            category: 'shopping',
            floors: 6,
            sign: { text: 'Enni Cole', color: '#ff69b4', size: 36 },
            door: { target: 'enni_cole_interior', label: 'Enter Store', lightColor: '#ff69b4' }
        });
        
        BuildingV2Registry.register('cozy_cafe', {
            factory: createCozyCafe,
            sections: [
                { x: 0, y: 0, w: 350, h: 350 }
            ],
            accentColor: '#ffaa00',
            label: 'Cozy Cafe',
            type: 'cafe',
            category: 'food',
            mapCategory: 'restaurant',
            floors: 3,
            sign: { text: 'Cozy Cafe', color: '#ffaa00', size: 28 },
            door: { target: 'cozy_cafe_interior', label: 'Enter Cafe', lightColor: '#ffaa00' }
        });
        
        BuildingV2Registry.register('double_nights', {
            factory: createDoubleNightsHotel,
            sections: [
                { x: 0, y: 0, w: 800, h: 150 },
                { x: 0, y: 150, w: 200, h: 300 },
                { x: 600, y: 150, w: 200, h: 300 }
            ],
            accentColor: '#ff0055',
            label: 'Double Nights Hotel',
            type: 'hotel',
            category: 'hospitality',
            floors: 12,
            sign: { text: 'Double Nights', color: '#ff0055', size: 32 },
            door: { target: 'hotel_lobby', label: 'Enter Hotel', lightColor: '#ffdf80' }
        });
        
        BuildingV2Registry.register('moon_city', {
            factory: createMoonCityNightclub,
            sections: [
                { x: 0, y: 0, w: 600, h: 300 },
                { x: 0, y: 300, w: 280, h: 200 }
            ],
            accentColor: '#ff00aa',
            label: 'Moon City Nightclub',
            type: 'club',
            category: 'entertainment',
            floors: 4,
            sign: { text: 'CLUB', color: '#ff00aa', size: 40 },
            door: { target: 'moon_city_nightclub', label: 'Enter Club', lightColor: '#ff00aa' }
        });
        
        // Generic V2 buildings for auto-fill (not unique — can be placed multiple times)
        BuildingV2Registry.register('apartment_small', {
            factory: createGenericApartment,
            sections: [
                { x: 0, y: 0, w: 300, h: 250 }
            ],
            accentColor: '#a469ff',
            label: 'Apartments',
            type: 'apartment',
            category: 'residential',
            floors: 6,
            unique: false,
            sign: { text: 'APTS', color: '#a469ff', size: 18 }
        });
        
        BuildingV2Registry.register('shop_small', {
            factory: createGenericShop,
            sections: [
                { x: 0, y: 0, w: 250, h: 200 }
            ],
            accentColor: '#FFF1C2',
            label: 'Shop',
            type: 'shop',
            category: 'shopping',
            floors: 2,
            unique: false,
            sign: { text: 'SHOP', color: '#FFF1C2', size: 16 }
        });
        
        BuildingV2Registry.register('warehouse', {
            factory: createGenericWarehouse,
            sections: [
                { x: 0, y: 0, w: 500, h: 400 }
            ],
            accentColor: '#666666',
            label: 'Warehouse',
            type: 'warehouse',
            category: 'industrial',
            floors: 2,
            unique: false
        });
        
        BuildingV2Registry.register('neural_sys', {
            factory: createNeuralSystems,
            sections: [
                { x: 0, y: 0, w: 400, h: 200 },
                { x: 75, y: 200, w: 250, h: 200 }
            ],
            accentColor: '#0088ff',
            label: 'Neural Sys',
            type: 'tech',
            category: 'commercial',
            floors: 8,
            sign: { text: 'NEURAL', color: '#0088ff', size: 22 },
            door: { target: 'neural_sys_interior', label: 'Enter Neural Systems', lightColor: '#0088ff' }
        });
        
        BuildingV2Registry.register('dr_yins', {
            factory: createDrYinsClinic,
            sections: [
                { x: 0, y: 0, w: 250, h: 400 },
                { x: 250, y: 150, w: 250, h: 250 }
            ],
            accentColor: '#00f3ff',
            label: "Dr. Yin's",
            type: 'clinic',
            category: 'services',
            mapCategory: 'medical',
            floors: 5,
            sign: { text: 'CLINIC', color: '#00f3ff', size: 28 },
            door: { target: 'medbay_sw', label: 'Enter Clinic', lightColor: '#00f3ff' }
        });

        BuildingV2Registry.register('torque_auto', {
            factory: createTorqueAutoShop,
            sections: [
                { x: 0, y: 0, w: 500, h: 350 },
                { x: 500, y: 50, w: 200, h: 300 }
            ],
            accentColor: '#ff8800',
            label: 'Torque Auto',
            type: 'auto_shop',
            category: 'services',
            floors: 2,
            sign: { text: 'TORQUE', color: '#ff8800', size: 36 },
            door: { target: 'auto_shop', label: 'Enter Auto Shop', lightColor: '#ff8800' }
        });

        /**
         * Factory function to create Biggs Amusement Park.
         * Flashy, wide building with violet/amber carnival theming.
         */
        function createBiggsAmusementPark(x, y, config = {}) {
            return new BuildingV2({
                id: 'biggs_park',
                x: x, y: y,
                label: 'Biggs Park',
                type: 'entertainment',
                floors: 3,
                
                sections: [
                    { x: 0, y: 0, w: 450, h: 250 },
                    { x: 50, y: 250, w: 350, h: 150 }
                ],
                
                windowWidth: 12,
                windowHeight: 14,
                windowSpacingX: 30,
                windowSpacingY: 22,
                windowMarginX: 20,
                windowMarginY: 14,
                
                // Carnival colors — deep violet with amber accents
                roofColor: '#1a0a28',
                roofLightColor: '#220e32',
                wallColor: '#160820',
                wallLightColor: '#1e0c2a',
                accentColor: '#ff8800',
                windowColor: '#0a0410',
                windowLitColor: '#ff8800',
                windowFrameColor: '#0c0616',
                balconyColor: '#120818',
                
                balconies: [],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 30, y: 20, w: 50, h: 35 },
                    { type: 'vent', section: 0, x: 380, y: 20, w: 30, h: 25 },
                ],
                
                sign: { text: 'BIGGS', color: '#ff8800', size: 32 },
                
                door: {
                    target: config.doorTarget || 'biggs_arena',
                    label: 'Enter Biggs Amusement Park',
                    lightColor: '#ff8800'
                },
                
                ...config
            });
        }

        BuildingV2Registry.register('biggs_park', {
            factory: createBiggsAmusementPark,
            sections: [
                { x: 0, y: 0, w: 450, h: 250 },
                { x: 50, y: 250, w: 350, h: 150 }
            ],
            accentColor: '#ff8800',
            label: 'Biggs Park',
            type: 'entertainment',
            category: 'entertainment',
            floors: 3,
            sign: { text: 'BIGGS', color: '#ff8800', size: 32 },
            door: { target: 'biggs_arena', label: 'Enter Biggs Amusement Park', lightColor: '#ff8800' }
        });

