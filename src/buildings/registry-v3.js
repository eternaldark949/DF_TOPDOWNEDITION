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
            
            /** Parsed editor data keeps its draw ordering until membership/level assignments change. */
            _prepareDrawLists() {
                let cached = this._drawLists;
                let changed = !cached || cached.footprint !== this.footprint || cached.details !== this.details || cached.levels !== this.levels ||
                    cached.groundLevel !== this._groundLevel || cached.fpSlots.length !== this.footprint.length ||
                    cached.detailSlots.length !== this.details.length || cached.levelIds.length !== this.levels.length;
                if (!changed) {
                    for (let i = 0; i < this.footprint.length; i++) if (cached.fpSlots[i][0] !== this.footprint[i] || cached.fpSlots[i][1] !== this.footprint[i].level) { changed = true; break; }
                    if (!changed) for (let i = 0; i < this.details.length; i++) if (cached.detailSlots[i][0] !== this.details[i] || cached.detailSlots[i][1] !== this.details[i].level) { changed = true; break; }
                    if (!changed) for (let i = 0; i < this.levels.length; i++) if (cached.levelIds[i] !== this.levels[i].id) { changed = true; break; }
                }
                if (changed) {
                    const order = {};
                    this.levels.forEach((level, i) => order[level.id] = i);
                    cached = this._drawLists = { footprint: this.footprint, details: this.details, levels: this.levels, groundLevel: this._groundLevel,
                        fpSlots: this.footprint.map(shape => [shape, shape.level]), detailSlots: this.details.map(shape => [shape, shape.level]),
                        levelIds: this.levels.map(level => level.id), groundFP: [], groundDetails: [], upperFP: [], upperDetails: [] };
                    for (const shape of this.footprint) (shape.level === this._groundLevel ? cached.groundFP : cached.upperFP).push(shape);
                    for (const shape of this.details) (shape.level === this._groundLevel ? cached.groundDetails : cached.upperDetails).push(shape);
                    cached.upperFP.sort((a, b) => (order[a.level] || 0) - (order[b.level] || 0));
                    cached.upperDetails.sort((a, b) => (order[a.level] || 0) - (order[b.level] || 0));
                }
                return cached;
            }

            /** Unknown text/glow detail extents retain the full draw; known geometric exports can be culled. */
            _paintBounds(footprints, details, ctx) {
                if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) return null;
                let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
                const add = (shape, bounds, radial) => {
                    const cx = radial ? shape.x : shape.x + (shape.w || 0) / 2, cy = radial ? shape.y : shape.y + (shape.h || 0) / 2;
                    const sx = shape.scaleX || 1, sy = shape.scaleY || 1, angle = shape.rotation || 0;
                    if (![cx, cy, sx, sy, angle, bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return false;
                    const ca = Math.cos(angle), sa = Math.sin(angle);
                    for (const x of [bounds.left, bounds.right]) for (const y of [bounds.top, bounds.bottom]) {
                        const ax = (x - cx) * sx, ay = (y - cy) * sy;
                        const px = this.x + cx + ax * ca - ay * sa, py = this.y + cy + ax * sa + ay * ca;
                        left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
                    }
                    return true;
                };
                for (const shape of footprints) {
                    if (![shape.x, shape.y, shape.w, shape.h].every(Number.isFinite)) return null;
                    const sw = shape.stroke ? (shape.strokeWidth || 1) : 0;
                    if (sw < 0 || !Number.isFinite(sw)) return null;
                    const pad = Math.max(1, sw * Math.max(1, ctx.miterLimit || 10));
                    if (!add(shape, { left: Math.min(shape.x, shape.x + shape.w) - pad, right: Math.max(shape.x, shape.x + shape.w) + pad,
                        top: Math.min(shape.y, shape.y + shape.h) - pad, bottom: Math.max(shape.y, shape.y + shape.h) + pad }, false)) return null;
                }
                for (const shape of details) {
                    let bounds;
                    if (shape.type === 'skylight') {
                        const w = shape.w || 40, h = shape.h || 30;
                        bounds = { left: Math.min(shape.x, shape.x + w) - 20, right: Math.max(shape.x, shape.x + w) + 20,
                            top: Math.min(shape.y, shape.y + h) - 20, bottom: Math.max(shape.y, shape.y + h) + 20 };
                    } else if (shape.type === 'skylight_corner') {
                        const w = shape.w || 30, h = shape.h || 30, cx = shape.x + (shape.curveX !== undefined ? shape.curveX : 0), cy = shape.y + (shape.curveY !== undefined ? shape.curveY : h);
                        bounds = { left: Math.min(shape.x, shape.x + w, cx) - 20, right: Math.max(shape.x, shape.x + w, cx) + 20,
                            top: Math.min(shape.y, shape.y + h, cy) - 20, bottom: Math.max(shape.y, shape.y + h, cy) + 20 };
                    } else if (shape.type === 'interior_wall') {
                        const x2 = shape.x2 !== undefined ? shape.x2 : shape.x, y2 = shape.y2 !== undefined ? shape.y2 : shape.y + 40;
                        bounds = { left: Math.min(shape.x, x2) - 4, right: Math.max(shape.x, x2) + 4,
                            top: Math.min(shape.y, y2) - 4, bottom: Math.max(shape.y, y2) + 4 };
                    } else if (shape.type === 'lamp' || shape.type === 'interior_lamp') {
                        continue; // emitters are rendered separately, and this detail paints no pixels
                    } else return null;
                    if (!add(shape, bounds, false)) return null;
                }
                return { left, right, top, bottom };
            }

            // Ground-level shapes — drawn BENEATH the player (crimson facade, sidewalk)
            drawGround(ctx, time) {
                const lists = this._prepareDrawLists(), view = paintViewBounds(ctx);
                if (view && !paintBoundsIntersect(view, this._paintBounds(lists.groundFP, lists.groundDetails, ctx))) return;
                ctx.save();
                ctx.translate(this.x, this.y);
                const t = (time || 0) / 1000;
                for (const shape of lists.groundFP) this._drawFootprint(ctx, shape);
                for (const shape of lists.groundDetails) this._drawDetail(ctx, shape, t);
                ctx.restore();
            }
            
            // Everything above ground — drawn OVER the player (building body, roof, signs, lamps)
            draw(ctx, time) {
                const lists = this._prepareDrawLists(), view = paintViewBounds(ctx);
                if (view && !paintBoundsIntersect(view, this._paintBounds(lists.upperFP, lists.upperDetails, ctx))) return;
                ctx.save();
                ctx.translate(this.x, this.y);
                const t = (time || 0) / 1000;
                for (const shape of lists.upperFP) this._drawFootprint(ctx, shape);
                for (const shape of lists.upperDetails) this._drawDetail(ctx, shape, t);
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
             * @param {object} [metadata.apron] - {x, y, w, h} in the building's frame: forecourt it draws outside its sections
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
                    ox: bounds.x, oy: bounds.y,       // where the sections start in the building's own frame (Double Nights' start at 50, 21)
                    apron: metadata.apron || null,    // ground it draws outside its sections (portico, forecourt, drive), local: CityLayout keeps it in the block
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
            door: { target: 'apt_949', label: 'Enter Apartment', lightColor: '#9900ff' },
            apron: { x: -40, y: 880, w: 430, h: 150 }   // the portico, steps and carpet: _sqForecourt (buildings/silver-queen.js)
        });
        
        BuildingV2Registry.register('enni_cole', {
            factory: createEnniCole,
            sections: [
                { x: 0, y: 0, w: 900, h: 280 },
                { x: 0, y: 280, w: 250, h: 420 },
                { x: 650, y: 280, w: 250, h: 420 }
            ],
            accentColor: '#d0ac72',
            label: 'Enni Cole',
            type: 'shopping',
            category: 'shopping',
            floors: 6,
            sign: { text: 'Enni Cole', color: '#f3ddb0', size: 38 },
            door: { target: 'enni_cole_interior', label: 'Enter Store', lightColor: '#ffd392' }
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
            sections: doubleNightsSections(),     // twin crescents and the atrium, as collision bands (buildings/double-nights.js)
            accentColor: '#ffcf8a',               // warm gold: the block's street lamps take this colour
            label: 'Double Nights Hotel',
            type: 'hotel',
            category: 'hospitality',
            floors: 14,
            sign: { text: 'Double Nights', color: '#ff1a55', size: 32 },
            door: { target: 'hotel_lobby', label: 'Enter Hotel', lightColor: '#ffdf80' },
            apron: { x: -10, y: 380, w: 820, h: 480 }   // the drive, fountain and forecourt: _dnForecourt (buildings/double-nights.js)
        });
        
        BuildingV2Registry.register('moon_city', {
            factory: createMoonCityNightclub,
            sections: [
                { x: 0, y: 0, w: 600, h: 300 },
                { x: 0, y: 300, w: 280, h: 200 }
            ],
            accentColor: '#b48cff',
            label: 'Moon City Nightclub',
            type: 'club',
            category: 'entertainment',
            floors: 4,
            sign: { text: 'CLUB', color: '#c8a8ff', size: 40 },
            door: { target: 'moon_city_nightclub', label: 'Enter Club', lightColor: '#ff3a6a' },
            apron: { x: 0, y: 490, w: 280, h: 194 }     // the court, the queue and the carpet's end: _mcForecourt (buildings/moon-city.js)
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

