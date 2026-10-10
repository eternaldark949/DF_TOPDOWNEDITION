
        /** Full-profiler-only stage hooks. Restored entirely when Full mode is off. */
        const PeopleProfiler = {
            active: false, hooks: null,
            keys: ['Hair physics', 'Hair drawing', 'Cloth physics', 'Cloth drawing', 'Shading', 'Held items', 'Crowd sprites', 'Crowd baking'],

            _wrap(part, original, entry, opaque) {
                return function() {
                    const S = RenderStats;
                    if (!S.peopleScope || S.peopleOpaque || (!entry && !S.peopleDepth)) return original.apply(this, arguments);
                    const parent = S.peoplePart, wasOpaque = S.peopleOpaque;
                    const t = performance.now();
                    if (parent !== null) S.peopleParts[parent] += t - S.peoplePartT;
                    S.peoplePart = part; S.peoplePartT = t;
                    if (entry) S.peopleDepth++;
                    if (opaque) S.peopleOpaque = true;
                    try { return original.apply(this, arguments); }
                    finally {
                        const end = performance.now();
                        S.peopleParts[part] += end - S.peoplePartT;
                        S.peoplePart = parent; S.peoplePartT = end; S.peopleOpaque = wasOpaque;
                        if (entry) S.peopleDepth--;
                    }
                };
            },

            sync(on) {
                on = !!on;
                if (on === this.active) return;
                if (!this.hooks) {
                    const hooks = this.hooks = [];
                    const bind = (part, get, set, entry = false, opaque = false) => {
                        const original = get();
                        hooks.push({ original, wrapped: this._wrap(part, original, entry, opaque), set });
                    };
                    bind('Hair physics', () => hairGeometry, fn => { hairGeometry = fn; });
                    bind('Cloth physics', () => clothGeometry, fn => { clothGeometry = fn; });
                    bind('Cloth drawing', () => drawClothPanel, fn => { drawClothPanel = fn; });
                    bind('Shading', () => humanShade, fn => { humanShade = fn; });
                    bind('Shading', () => drawHumanContactShadow, fn => { drawHumanContactShadow = fn; });
                    bind('Shading', () => _softSpot, fn => { _softSpot = fn; });
                    bind('Held items', () => drawHeldGlass, fn => { drawHeldGlass = fn; });
                    bind('Held items', () => drawWeapon, fn => { drawWeapon = fn; });
                    bind('Held items', () => drawUmbrella, fn => { drawUmbrella = fn; });
                    bind('Crowd sprites', () => CrowdImpostors.draw, fn => { CrowdImpostors.draw = fn; }, true);
                    bind('Crowd baking', () => CrowdImpostors._bake, fn => { CrowdImpostors._bake = fn; }, false, true);
                    for (const type of Object.keys(HAIR_RENDERERS)) {
                        bind('Hair drawing', () => HAIR_RENDERERS[type], fn => { HAIR_RENDERERS[type] = fn; });
                    }
                }
                for (const h of this.hooks) h.set(on ? h.wrapped : h.original);
                this.active = on;
            },

            beginEntities() {
                const S = RenderStats;
                S.peopleScope = true; S.peoplePart = null; S.peopleOpaque = false;
                for (const key of this.keys) S.peopleParts[key] = 0;
            },

            endEntities(profiler, ms) {
                const S = RenderStats;
                S.peopleScope = false;
                profiler.add('Entities: People', ms, true);
                let known = 0;
                for (const key of this.keys) {
                    const value = S.peopleParts[key]; known += value;
                    profiler.add('People: ' + key, value, true);
                }
                // Uninstrumented body, limbs, outfits and pose setup, plus hook overhead.
                profiler.add('People: Body and limbs', Math.max(0, ms - known), true);
            }
        };
        /** Buildings/World tops detail hooks exist only while the Full profiler is shown.
            Stage rows are exclusive; body drawing stays in its existing People rows. */
        const WorldRenderProfiler = {
            active: false, hooks: null, scope: null, part: null, partT: 0, partP: 0,
            parts: Object.create(null),
            keys: {
                Buildings: ['Base', 'Forecourts', 'Reflection prep', 'Wet ground', 'Reflections', 'Sun shadows', 'Cloud shadows', 'Indoor floors', 'Windows', 'Signs'],
                'World tops': ['Roofs and facades', 'Windows', 'Signs', 'Ferris wheel', 'Foliage', 'Leaves', 'Lamp bodies', 'Linens']
            },

            _wrap(tag, original) {
                const stage = this;
                return function() {
                    if (!stage.scope) return original.apply(this, arguments);
                    const part = tag === 'geometry' ? (stage.scope === 'Buildings' ? 'Base' : 'Roofs and facades') : tag;
                    // Hooks shared with lighting/interior passes only charge their own draw scope.
                    if (!Object.prototype.hasOwnProperty.call(stage.parts, part)) return original.apply(this, arguments);
                    const parent = stage.part, t = performance.now(), p = RenderStats.peopleMs;
                    if (parent !== null) stage.parts[parent] += (t - stage.partT) - (p - stage.partP);
                    stage.part = part; stage.partT = t; stage.partP = p;
                    try { return original.apply(this, arguments); }
                    finally {
                        const end = performance.now(), ep = RenderStats.peopleMs;
                        stage.parts[part] += (end - stage.partT) - (ep - stage.partP);
                        stage.part = parent; stage.partT = end; stage.partP = ep;
                    }
                };
            },

            sync(on) {
                on = !!on;
                if (on === this.active) return;
                if (!this.hooks) {
                    const hooks = this.hooks = [];
                    // Capture the finished rendering implementation, including optimizations.
                    const bind = (tag, owner, key) => {
                        const original = owner[key];
                        if (typeof original !== 'function') return;
                        hooks.push({ owner, key, original, wrapped: this._wrap(tag, original) });
                    };
                    const E = GameEngine.prototype, B = BuildingV2.prototype;
                    bind('geometry', E, '_prepareRenderBuildingLists');
                    for (const C of [Building, BuildingV2]) {
                        bind('geometry', C.prototype, 'drawBase');
                        bind('geometry', C.prototype, 'drawTop');
                    }
                    bind('geometry', BuildingV3.prototype, 'drawGround');
                    bind('geometry', BuildingV3.prototype, 'draw');
                    bind('geometry', Billboard.prototype, 'drawTop');
                    for (const key of ['_sqDrawGround', '_dnDrawGround', '_mcDrawGround']) bind('Forecourts', B, key);
                    bind('Reflection prep', E, 'prepareReflections');
                    bind('Wet ground', E, 'drawPuddles');
                    bind('Reflections', E, 'drawReflections');
                    bind('Sun shadows', E, 'drawCastShadows');
                    bind('Cloud shadows', E, '_drawCloudShadows');
                    bind('Indoor floors', RoomSystem.prototype, 'drawFloors');
                    bind('Windows', RoomSystem.prototype, 'drawWindows');
                    bind('Windows', B, '_drawFaceWindows');
                    bind('Signs', NeonSign.prototype, 'draw');
                    for (const key of ['drawSign', '_paintSign', '_dnDrawSign', '_mcDrawSign']) bind('Signs', B, key);
                    bind('Ferris wheel', FerrisWheel.prototype, 'drawBase');
                    bind('Ferris wheel', FerrisWheel.prototype, 'drawTop');
                    bind('Foliage', Foliage.prototype, 'draw');
                    bind('Leaves', LeafParticleSystem.prototype, 'draw');
                    bind('Lamp bodies', LampEntity.prototype, 'draw');
                    bind('Linens', RoomSystem.prototype, 'drawLinens');
                }
                for (const h of this.hooks) h.owner[h.key] = on ? h.wrapped : h.original;
                this.active = on; this.scope = null; this.part = null;
            },

            begin(scope, profiler, parentLabel) {
                this.scope = scope; this.part = null;
                this.parentLabel = parentLabel;
                this.parentBase = profiler.metrics[parentLabel]?.current || 0;
                this.peopleBase = RenderStats.peopleMs;
                for (const key of Object.keys(this.parts)) delete this.parts[key];
                for (const key of this.keys[scope]) this.parts[key] = 0;
            },

            end(profiler) {
                const scope = this.scope;
                if (!scope) return;
                this.scope = null; this.part = null;
                const ms = (profiler.metrics[this.parentLabel]?.current || 0) - this.parentBase;
                let known = 0;
                for (const key of this.keys[scope]) {
                    const value = this.parts[key]; known += value;
                    profiler.add(scope + ': ' + key, value, true);
                }
                // Buildings includes its decorative bodies; World tops' lap already excludes People.
                const people = scope === 'Buildings' ? RenderStats.peopleMs - this.peopleBase : 0;
                profiler.add(scope + ': Other', Math.max(0, ms - known - people), true);
            }
        };
        // =============================================================================
        //  CITY LAYOUT SYSTEM v2.0
        //  Grid-based procedural city generator with block management
        // =============================================================================
        class CityLayout {
            static ZONE = {
                BLOCK: 'BLOCK',
                PARK: 'PARK',
                PLAZA: 'PLAZA',
                RESTRICTED: 'RESTRICTED',
                ROAD: 'ROAD'
            };
            
            /** The side a placement faces: its facing option, else the side of the street its row fronts, else south */
            static facing(placement) {
                const o = placement.options || {}, f = o.facing || { south: 'S', north: 'N', east: 'E', west: 'W' }[o.row];
                return ['N', 'E', 'W'].includes(f) ? f : 'S';
            }
            
            constructor(config = {}) {
                this.width = config.width || 4000;
                this.height = config.height || 5000;
                this.margin = config.margin || 25;
                this.pavementWidth = config.pavementWidth || 75;
                this.laneWidth = config.laneWidth || 60;
                
                this.horizontalRoads = [];
                this.verticalRoads = [];
                this.angledRoads = [];
                this.blocks = [];
                this.blockMap = {};
                this.zoneOverrides = {};
                this.blockLampColors = {};  // Custom lamp colors per block
                this.safeZones = [];
                this.buildingTemplates = {};
                this.placedBuildings = [];
                this.generated = false;
            }
            
            // === ROAD DEFINITION ===
            
            addHorizontalRoad(centerY, name, lanes = 2, options = {}) {
                const roadHeight = lanes * 2 * this.laneWidth;
                const footprint = roadHeight + (this.pavementWidth * 2);
                const roadY = centerY - roadHeight / 2;
                
                const road = {
                    y: roadY,
                    centerY: centerY,
                    name: name,
                    lanes: lanes,
                    roadHeight: roadHeight,
                    footprint: footprint,
                    topPavement: roadY - this.pavementWidth,
                    bottomPavement: roadY + roadHeight,
                    orientation: 'H'
                };
                
                this.horizontalRoads.push(road);
                this.horizontalRoads.sort((a, b) => a.y - b.y);
                this._addSafeZone(0, road.topPavement, this.width, footprint, `Road: ${name}`);
                return road;
            }
            
            addVerticalRoad(centerX, name, lanes = 2, options = {}) {
                const roadWidth = lanes * 2 * this.laneWidth;
                const footprint = roadWidth + (this.pavementWidth * 2);
                const roadX = centerX - roadWidth / 2;
                
                const road = {
                    x: roadX,
                    centerX: centerX,
                    name: name,
                    lanes: lanes,
                    roadWidth: roadWidth,
                    footprint: footprint,
                    leftPavement: roadX - this.pavementWidth,
                    rightPavement: roadX + roadWidth,
                    orientation: 'V'
                };
                
                this.verticalRoads.push(road);
                this.verticalRoads.sort((a, b) => a.x - b.x);
                this._addSafeZone(road.leftPavement, 0, footprint, this.height, `Road: ${name}`);
                return road;
            }
            
            /**
             * An angled street from one road to another: (x1, y1) and (x2, y2) sit on the centre lines of the two
             * roads it joins, so each end is a T. It runs through the blocks between them; buildings keep off it and
             * its pavements (auto-fill lines it with a stepped row facing it), and the road network, pavements,
             * crossings, lamps and the pedestrians' walks are built from it like the rest. Add it before placing buildings.
             */
            addAngledRoad(x1, y1, x2, y2, name, lanes = 2) {
                return this._addPathRoad([[x1, y1], [x2, y2]], name, lanes);
            }
            
            /**
             * A curved street, as an angled one (above) but along a polyline whose corners are rounded off to `radius`:
             * [[x, y], ...], its first and last points on the centre lines of the roads it joins. Keep the first and
             * last legs straight for a while (300 px or so past the junction) so its ends meet those roads square on.
             */
            addCurvedRoad(points, name, lanes = 2, { radius = 300 } = {}) {
                return this._addPathRoad(RoadPath.rounded(points, radius), name, lanes);
            }
            
            _addPathRoad(points, name, lanes) {
                const path = new RoadPath(points), a = path.points[0], b = path.points[path.points.length - 1];
                const road = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, name, lanes, path, points: path.points, length: path.length, curved: path.pieces.length > 1, thickness: lanes * 2 * this.laneWidth, orientation: 'D' };
                const hT = road.thickness / 2, pw = this.pavementWidth;
                road.ends = [this._angledEnd(road, 0), this._angledEnd(road, 1)];
                if (!road.ends[0] || !road.ends[1]) console.warn(`addAngledRoad ${name}: both ends should sit on the centre line of a road`);
                road.carriageway = path.band(-hT, hT);
                road.corridor = path.band(-hT - pw, hT + pw);   // and its pavements (both concave on a curve)...
                const cuts = [0, ...path.bends(), path.length];
                road.corridorPieces = cuts.slice(1).map((s1, k) => path.band(-hT - pw, hT + pw, cuts[k], s1));   // ...as convex pieces
                this.angledRoads.push(road);
                return road;
            }
            
            /** A point on an angled road: `along` from its start, `lat` across (positive: to the right of its direction) */
            _along(road, along, lat = 0) {
                return road.path.at(along, lat);
            }
            
            /** Where an angled road meets the road at one end (0: its start, 1: its end): that road, the angled road's
             *  direction there (`f`) and end point (`p`), and how far in from the end its carriageway is clear of it
             *  (`mouth`, where its lanes start and its crossing begins) */
            _angledEnd(road, which) {
                const p = which ? { x: road.x2, y: road.y2 } : { x: road.x1, y: road.y1 }, s = which ? -1 : 1, hT = road.thickness / 2;
                const f = road.path.frame(which ? road.length : 0);
                const H = this.horizontalRoads.find(r => Math.abs(r.centerY - p.y) < 2), V = !H && this.verticalRoads.find(r => Math.abs(r.centerX - p.x) < 2);
                if (!H && !V) return null;
                const kind = H ? 'H' : 'V', dir = Math.sign(H ? f.uy * s : f.ux * s);   // +1: it heads off towards larger y (x)
                const kerb = H ? (dir > 0 ? H.y + H.roadHeight : H.y) : (dir > 0 ? V.x + V.roadWidth : V.x);
                let mouth = 0;
                for (const l of [-hT, hT]) {
                    const c0 = H ? p.y + f.ny * l : p.x + f.nx * l, v = H ? f.uy * s : f.ux * s;
                    mouth = Math.max(mouth, (kerb - c0) / v);
                }
                return { road: H || V, kind, dir, kerb, mouth, along: which ? road.length - mouth : mouth, f, p };
            }
            
            /** The part of a polygon on one side of an angled road's end: sign·lateral >= off (across its end piece) */
            static _sideOf(poly, e, sign, off) {
                const { f, p } = e;
                return Poly.clipHalf(poly, sign * f.nx, sign * f.ny, off + sign * (f.nx * p.x + f.ny * p.y));
            }
            
            /** The angled roads' pavements, two each, from kerb to kerb of the roads they join: [{ poly, road (its name) }] */
            angledPavements() {
                const out = [], pw = this.pavementWidth;
                for (const road of this.angledRoads) {
                    const hT = road.thickness / 2;
                    for (const side of [-1, 1]) {
                        let poly = road.path.band(side * hT, side * (hT + pw));
                        for (const e of road.ends) if (e) poly = e.kind === 'H' ? Poly.clipHalf(poly, 0, e.dir, e.dir * e.kerb) : Poly.clipHalf(poly, e.dir, 0, e.dir * e.kerb);
                        if (poly.length >= 3) out.push({ poly, road: road.name });
                    }
                }
                return out;
            }
            
            /**
             * The other roads' pavements, cut where an angled road joins: each ({x, y, w, h}, or with a `poly`) comes back
             * whole, or as the pieces either side of the angled carriageway (each with its `poly`)
             */
            cutPavements(paves) {
                let out = paves;
                for (const road of this.angledRoads) {
                    const hT = road.thickness / 2, next = [];
                    for (const p of out) {
                        const poly = p.poly || [{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h }];
                        const over = Poly.clip(road.carriageway, poly);
                        if (over.length < 3 || Math.abs(Poly.area(over)) < 1) { next.push(p); continue; }
                        // cut across the end it meets (the one nearest where they overlap)
                        const c = Poly.box(over), cx = c.x + c.w / 2, cy = c.y + c.h / 2;
                        const e = road.ends.filter(Boolean).reduce((a, b) => Math.hypot(b.p.x - cx, b.p.y - cy) < Math.hypot(a.p.x - cx, a.p.y - cy) ? b : a);
                        for (const sign of [-1, 1]) {
                            const piece = CityLayout._sideOf(poly, e, sign, hT);
                            if (piece.length >= 3 && Math.abs(Poly.area(piece)) > 200) next.push({ ...Poly.box(piece), poly: piece });
                        }
                    }
                    out = next;
                }
                return out;
            }
            
            /** Does a rect reach an angled road or its pavements? */
            _onAngledRoad(x, y, w, h) {
                return this.angledRoads.some(r => Poly.hitsRect(r.corridor, { x, y, w, h }));
            }
            
            // === ZONE MANAGEMENT ===
            
            setZoneType(blockName, zoneType, options = {}) {
                this.zoneOverrides[blockName] = { type: zoneType, options: options };
                return this;
            }
            
            // === BLOCK LAMP COLORS ===
            
            setBlockLampColor(blockName, color, options = {}) {
                // Set custom lamp color for a specific block
                // Options: { radius: number, intensity: number, includeAdjacent: boolean }
                this.blockLampColors[blockName] = { 
                    color: color, 
                    radius: options.radius || null,  // null = keep original
                    intensity: options.intensity || 1.0,
                    includeAdjacent: options.includeAdjacent || false
                };
                return this;
            }
            
            setBlockLampColors(colorMap) {
                // Batch set: { 'block_2_2': '#ff00aa', 'block_4_4': { color: '#00f3ff', radius: 200 } }
                for (let blockName in colorMap) {
                    const val = colorMap[blockName];
                    if (typeof val === 'string') {
                        this.setBlockLampColor(blockName, val);
                    } else {
                        this.setBlockLampColor(blockName, val.color, val);
                    }
                }
                return this;
            }
            
            applyBlockLampColors(lamps) {
                // Post-process lamps array to apply custom block colors
                if (Object.keys(this.blockLampColors).length === 0) return lamps;
                
                // Build spatial lookup: which blocks have custom colors
                const coloredBlocks = [];
                for (let blockName in this.blockLampColors) {
                    const block = this.blockMap[blockName];
                    if (!block) continue;
                    
                    const config = this.blockLampColors[blockName];
                    // Expand bounds slightly to catch lamps on block edges (road-side lamps)
                    const padding = 100;
                    coloredBlocks.push({
                        x: block.x - padding,
                        y: block.y - padding,
                        x2: block.x + block.w + padding,
                        y2: block.y + block.h + padding,
                        color: config.color,
                        radius: config.radius,
                        intensity: config.intensity
                    });
                }
                
                // Apply colors to lamps within colored blocks
                lamps.forEach(lamp => {
                    if (lamp.keepColor) return;                          // a landmark's own lights (e.g. Moon City's crimson door pool)
                    const lx = lamp.x || lamp.baseX || 0;
                    const ly = lamp.y || lamp.baseY || 0;
                    
                    for (let cb of coloredBlocks) {
                        if (lx >= cb.x && lx <= cb.x2 && ly >= cb.y && ly <= cb.y2) {
                            // Lamp is within this colored block
                            lamp.color = cb.color;
                            if (lamp.baseColor !== undefined) lamp.baseColor = cb.color;
                            if (cb.radius && lamp.radius !== undefined) lamp.radius = cb.radius;
                            if (cb.radius && lamp.baseRadius !== undefined) lamp.baseRadius = cb.radius;
                            break;  // First match wins
                        }
                    }
                });
                
                return lamps;
            }
            
            // === BUILDING TEMPLATES ===
            
            registerTemplate(id, config) {
                // Check if this is a V2 building in the registry
                if (typeof BuildingV2Registry !== 'undefined' && BuildingV2Registry.has(id)) {
                    const v2Data = BuildingV2Registry.get(id);
                    // The sections' box and everything it draws on the ground (its apron), in its own frame
                    const footprint = { x: v2Data.ox || 0, y: v2Data.oy || 0, w: v2Data.w, h: v2Data.h }, a = v2Data.apron;
                    const extent = a ? (() => {
                        const x = Math.min(footprint.x, a.x), y = Math.min(footprint.y, a.y);
                        return { x, y, w: Math.max(footprint.x + footprint.w, a.x + a.w) - x, h: Math.max(footprint.y + footprint.h, a.y + a.h) - y };
                    })() : footprint;
                    this.buildingTemplates[id] = {
                        id: id,
                        w: v2Data.w,
                        h: v2Data.h,
                        color: v2Data.accentColor,
                        label: v2Data.label,
                        type: v2Data.type,
                        sign: v2Data.sign,
                        door: config.door || v2Data.door,  // Allow override
                        weight: config.weight || 1,
                        unique: v2Data.unique,
                        category: v2Data.category,
                        margin: config.margin || 30,
                        landmarkId: config.landmarkId || null,
                        isV2: true,
                        v2Id: id,
                        footprint, extent
                    };
                    console.log(`CityLayout: Registered V2 building '${id}' from registry (${v2Data.w}x${v2Data.h})`);
                } else {
                    // Standard template registration
                    this.buildingTemplates[id] = {
                        id: id,
                        w: config.w || config.width || 400,
                        h: config.h || config.height || 300,
                        color: config.color || '#333',
                        label: config.label || config.name || '',
                        type: config.type || 'generic',
                        sign: config.sign || null,
                        door: config.door || null,
                        weight: config.weight || 1,
                        unique: config.unique || false,
                        category: config.category || 'general',
                        margin: config.margin || 30,
                        landmarkId: config.landmarkId || null,
                        isV2: false
                    };
                }
                return this;
            }
            
            /**
             * Auto-register all V2 buildings from the registry.
             * Call this before placing V2 buildings.
             */
            registerV2Buildings() {
                if (typeof BuildingV2Registry === 'undefined') return this;
                
                BuildingV2Registry.list().forEach(id => {
                    if (!this.buildingTemplates[id]) {
                        this.registerTemplate(id, {});  // Will pull from registry
                    }
                });
                return this;
            }
            
            registerTemplates(templates) {
                for (let id in templates) this.registerTemplate(id, templates[id]);
                return this;
            }
            
            // === BUILDING PLACEMENT ===
            
            placeBuilding(templateId, blockName, options = {}) {
                const ready = this._ready(templateId, blockName);
                if (!ready) return null;
                const { template, block } = ready, S = this._shape(template, options);
                
                const coords = this._calculateBuildingPosition(block, S.ext.w, S.ext.h, S.margin, options.align || 'center');
                if (!coords) { console.warn(`Not enough space in ${blockName} for ${templateId}`); return null; }
                
                if (this._intersectsSafeZone(coords.x, coords.y, S.ext.w, S.ext.h)) {
                    console.warn(`Building ${templateId} intersects safe zone in ${blockName}`);
                    return null;
                }
                
                const placement = this._commit(template, blockName, S, coords.x, coords.y, options);
                this._addSafeZone(coords.x - S.margin/2, coords.y - S.margin/2, S.ext.w + S.margin, S.ext.h + S.margin, `Building: ${template.label}`);
                return placement;
            }
            
            // === HAND-AUTHORED LAYOUT ===
            // Blocks laid out the way streets are: buildings lined up along a street front, side by side
            // (sharing a wall at gap 0), on a corner, on a plot, or at an exact spot. A side names the street
            // the buildings front ('south' = the road below the block); a row's buildings face it (their door,
            // sign awning and entrance lights on that side). Anything else takes a facing option: 'S', 'N', 'E', 'W'.
            
            /**
             * A row of buildings along one side of a block.
             * @param {string} side - 'south' | 'north' | 'west' | 'east'
             * @param {string[]} templateIds - in order: west to east along a south/north side, north to south along a west/east one
             * @param {object} [options] - gap (px between neighbours, default 0), setback (from the block edge, default the margin),
             *   justify ('start' | 'center' | 'end', default 'center'), margin (clear of the block's other edges, default 30),
             *   facing (default: towards the side's street), span ([from, to]: the stretch of the side to use, world)
             * @returns {object[]} the placements (what didn't fit is left out, with a warning)
             */
            row(blockName, side, templateIds, options = {}) {
                const block = this.blockMap[blockName];
                if (!block || !this._ready(templateIds[0], blockName)) return [];
                const along = side === 'south' || side === 'north';
                const margin = options.margin ?? 30, gap = options.gap ?? 0, setback = options.setback ?? margin;
                const items = templateIds.map(id => this.buildingTemplates[id]).filter(Boolean).map(t => ({ template: t, S: this._shape(t, {}) }));
                // span: the stretch of the side to use (world [from, to] along it), by default the whole side inside the margin
                const [from, to] = options.span || [(along ? block.x : block.y) + margin, (along ? block.x + block.w : block.y + block.h) - margin];
                const room = to - from, depthRoom = (along ? block.h : block.w) - setback - margin;
                const fits = [];
                let len = 0;
                for (const it of items) {
                    const l = along ? it.S.ext.w : it.S.ext.h, d = along ? it.S.ext.h : it.S.ext.w, next = len + (fits.length ? gap : 0) + l;
                    if (next > room || d > depthRoom) { console.warn(`row ${blockName} ${side}: no room for ${it.template.id}`); continue; }
                    fits.push(it); len = next;
                }
                const justify = options.justify || 'center';
                let cursor = from + (justify === 'end' ? room - len : justify === 'center' ? (room - len) / 2 : 0);
                const spots = fits.map(it => {
                    const e = it.S.ext;
                    const x = along ? cursor : side === 'west' ? block.x + setback : block.x + block.w - setback - e.w;
                    const y = !along ? cursor : side === 'north' ? block.y + setback : block.y + block.h - setback - e.h;
                    cursor += (along ? e.w : e.h) + gap;
                    return { it, x: Math.floor(x), y: Math.floor(y) };
                });
                // Neighbours may touch each other, but not anything already reserved
                const clear = spots.filter(p => {
                    const ok = !this._intersectsSafeZone(p.x, p.y, p.it.S.ext.w, p.it.S.ext.h);
                    if (!ok && !options.autoPlaced) console.warn(`row ${blockName} ${side}: ${p.it.template.id} intersects a safe zone`);
                    return ok;
                });
                const facing = options.facing || { south: 'S', north: 'N', east: 'E', west: 'W' }[side];
                const placed = clear.map(p => this._commit(p.it.template, blockName, p.it.S, p.x, p.y, { row: side, facing, ...(options.autoPlaced ? { autoPlaced: true } : {}) }));
                for (const p of clear) this._addSafeZone(p.x - margin / 2, p.y - margin / 2, p.it.S.ext.w + margin, p.it.S.ext.h + margin, `Row: ${blockName} ${side}`);
                return placed;
            }
            
            /** A building on a block's corner: 'nw' | 'ne' | 'sw' | 'se' (options as placeBuilding's) */
            corner(blockName, corner, templateId, options = {}) {
                const align = { nw: 'top-left', ne: 'top-right', sw: 'bottom-left', se: 'bottom-right' }[corner];
                if (!align) { console.error(`corner: '${corner}' is not nw, ne, sw or se`); return null; }
                return this.placeBuilding(templateId, blockName, { ...options, align });
            }
            
            /**
             * A plot along one side of a block (world rect), for laying a block out by hand.
             * @param {object} o - offset (along the side from its west/north end, default 0), frontage (along it), depth (into the block), setback (default 30)
             */
            lot(blockName, side, { offset = 0, frontage, depth, setback = 30 } = {}) {
                const b = this.blockMap[blockName];
                if (!b || !frontage || !depth) return null;
                const r = side === 'south' ? { x: b.x + offset, y: b.y + b.h - setback - depth, w: frontage, h: depth }
                    : side === 'north' ? { x: b.x + offset, y: b.y + setback, w: frontage, h: depth }
                    : side === 'west' ? { x: b.x + setback, y: b.y + offset, w: depth, h: frontage }
                    : side === 'east' ? { x: b.x + b.w - setback - depth, y: b.y + offset, w: depth, h: frontage } : null;
                if (!r || r.x < b.x || r.y < b.y || r.x + r.w > b.x + b.w || r.y + r.h > b.y + b.h) return null;
                return r;
            }
            
            /**
             * A building at an exact spot: x, y is where everything it occupies (sections and apron) starts.
             * Pass a lot() as { x, y } to fill a plot. The spot must be inside a block and clear.
             */
            placeAt(templateId, x, y, options = {}) {
                const template = this.buildingTemplates[templateId];
                if (!template) { console.error(`Template '${templateId}' not found`); return null; }
                const S = this._shape(template, options);
                const block = this.blocks.find(b => x >= b.x && y >= b.y && x + S.ext.w <= b.x + b.w && y + S.ext.h <= b.y + b.h);
                if (!block) { console.warn(`placeAt ${templateId}: (${x}, ${y}) isn't inside a block`); return null; }
                if (!this._ready(templateId, block.name)) return null;
                if (this._intersectsSafeZone(x, y, S.ext.w, S.ext.h)) { console.warn(`placeAt ${templateId}: (${x}, ${y}) intersects a safe zone`); return null; }
                const placement = this._commit(template, block.name, S, Math.floor(x), Math.floor(y), options);
                this._addSafeZone(x - S.margin / 2, y - S.margin / 2, S.ext.w + S.margin, S.ext.h + S.margin, `Building: ${template.label}`);
                return placement;
            }
            
            /** Template and block, if a building may go there */
            _ready(templateId, blockName) {
                const template = this.buildingTemplates[templateId];
                if (!template) { console.error(`Template '${templateId}' not found`); return null; }
                const block = this.blockMap[blockName];
                if (!block) { console.error(`Block '${blockName}' not found`); return null; }
                const zoneType = this._getZoneType(blockName);
                if (zoneType === CityLayout.ZONE.RESTRICTED || zoneType === CityLayout.ZONE.ROAD) return null;
                return { template, block };
            }
            
            /** What a building occupies: its sections plus its apron (portico, forecourt, drive), in its own frame */
            _shape(template, options) {
                const w = options.w || template.w, h = options.h || template.h;
                const sized = options.w || options.h || !template.extent;
                return {
                    w, h, margin: options.margin || template.margin || 30,
                    ext: sized ? { x: 0, y: 0, w, h } : template.extent,
                    foot: sized ? { x: 0, y: 0 } : template.footprint
                };
            }
            
            /** Record a placement whose extent starts at ex, ey */
            _commit(template, blockName, S, ex, ey, options) {
                // x, y, w, h: the sections' box in the world; originX/Y: where the building itself goes (its frame's 0, 0)
                const originX = ex - S.ext.x, originY = ey - S.ext.y;
                const placement = {
                    templateId: template.id, template, blockName,
                    x: originX + S.foot.x, y: originY + S.foot.y, w: S.w, h: S.h, originX, originY,
                    extent: { x: ex, y: ey, w: S.ext.w, h: S.ext.h }, options
                };
                this.placedBuildings.push(placement);
                // Auto-set block lamp color for V2 buildings from their accent color
                if (template.isV2 && template.color) this.setBlockLampColor(blockName, template.color);
                return placement;
            }
            
            /**
             * Everything placed that reaches a street or another building (for the City debug layer and tests).
             * @param {object[]} street - rects ({x, y, w, h}) of the pavements and roads
             */
            layoutIssues(street = []) {
                const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
                // an angled road, or a pavement cut along one, by its shape (its box takes in the lots beside it)
                const shape = z => z.poly || (z.isDiagonal && z.getCorners ? z.getCorners() : null);
                const onStreet = (e, z) => hit(e, z) && (!shape(z) || Poly.hitsRect(shape(z), e));
                const issues = [];
                this.placedBuildings.forEach((p, i) => {
                    const e = p.extent || p;
                    if (street.some(z => onStreet(e, z)) || this._onAngledRoad(e.x, e.y, e.w, e.h)) issues.push({ placement: p, what: 'street' });
                    for (let j = i + 1; j < this.placedBuildings.length; j++) {
                        const q = this.placedBuildings[j], f = q.extent || q;
                        if (hit(e, f)) issues.push({ placement: p, other: q, what: 'building' });
                    }
                });
                return issues;
            }
            
            autoFillBlock(blockName, templateIds = null, options = {}) {
                const block = this.blockMap[blockName];
                if (!block) return [];
                
                const zoneType = this._getZoneType(blockName);
                if (zoneType !== CityLayout.ZONE.BLOCK) return [];
                
                const templates = templateIds 
                    ? templateIds.map(id => this.buildingTemplates[id]).filter(t => t)
                    : Object.values(this.buildingTemplates).filter(t => !t.unique);
                
                if (templates.length === 0) return [];
                if (!options.scatter) return this._fillStreetFronts(block, templates, options);
                
                const density = options.density || 0.5;
                const margin = options.margin || 40;
                const maxAttempts = options.maxAttempts || 30;
                
                const placements = [];
                const usableArea = Math.max(1, (block.w - margin * 2) * (block.h - margin * 2));
                let filledArea = 0;
                let attempts = 0;
                
                while (filledArea / usableArea < density && attempts < maxAttempts) {
                    attempts++;
                    
                    const template = this._selectWeightedTemplate(templates);
                    if (!template) continue;
                    if (template.unique && this.placedBuildings.some(p => p.templateId === template.id)) continue;
                    
                    const w = template.w;
                    const h = template.h;
                    
                    const position = this._findValidPosition(block, w, h, margin);
                    if (!position) continue;
                    
                    const placement = {
                        templateId: template.id, template, blockName,
                        x: position.x, y: position.y, w, h,
                        options: { autoPlaced: true }
                    };
                    
                    this.placedBuildings.push(placement);
                    placements.push(placement);
                    this._addSafeZone(position.x - margin/2, position.y - margin/2, w + margin, h + margin, `Building: ${template.label}`);
                    filledArea += w * h;
                }
                
                return placements;
            }
            
            /** The sides of a block that front a road ('south' = a road along its bottom edge); a map edge isn't a street */
            streetSides(block) {
                const pw = this.pavementWidth, sides = [];
                if (this.horizontalRoads.some(r => r.topPavement === block.y + block.h)) sides.push('south');
                if (this.horizontalRoads.some(r => r.bottomPavement + pw === block.y)) sides.push('north');
                if (this.verticalRoads.some(r => r.rightPavement + pw === block.x)) sides.push('west');
                if (this.verticalRoads.some(r => r.leftPavement === block.x + block.w)) sides.push('east');
                return sides;
            }
            
            /**
             * Fill a block the way a street grows: a row of buildings along each street it fronts, facing the road,
             * mostly wall to wall (now and then an alley between them), the yard behind left open. North and south
             * rows first, then west and east rows in what's left between them. options.fill (0–1, default 1): how
             * much of each street front to build on.
             */
            _fillStreetFronts(block, templates, options = {}) {
                const sides = this.streetSides(block), setback = options.setback ?? 12, margin = 30, alley = 30;
                const placed = [], both = (a, b) => sides.includes(a) && sides.includes(b);
                const pick = (room, maxDepth, alongW) => {                                   // a random run of buildings that fits
                    const ids = [], ok = templates.filter(t => !t.unique && (alongW ? t.extent?.h ?? t.h : t.extent?.w ?? t.w) <= maxDepth);
                    if (!ok.length) return ids;
                    let len = 0;
                    for (let tries = 0; tries < 24; tries++) {
                        const t = this._selectWeightedTemplate(ok), l = alongW ? (t.extent?.w ?? t.w) : (t.extent?.h ?? t.h);
                        if (len + l > room) continue;
                        ids.push(t.id); len += l;
                    }
                    return ids;
                };
                // An angled street through the block: the straight rows stop either side of it (where it crosses their front, as deep as
                // most buildings go; one deeper that would reach it is left out), and it gets stepped rows of its own (below)
                const clearOf = (side, span, depth) => {                                       // span, less where the street crosses the row
                    const along = side === 'south' || side === 'north';
                    const band = side === 'south' ? { x: block.x, y: block.y + block.h - depth, w: block.w, h: depth }
                        : side === 'north' ? { x: block.x, y: block.y, w: block.w, h: depth }
                        : side === 'west' ? { x: block.x, y: block.y, w: depth, h: block.h } : { x: block.x + block.w - depth, y: block.y, w: depth, h: block.h };
                    const bandPoly = [{ x: band.x, y: band.y }, { x: band.x + band.w, y: band.y }, { x: band.x + band.w, y: band.y + band.h }, { x: band.x, y: band.y + band.h }];
                    let spans = [span];
                    for (const r of this.angledRoads) for (const piece of r.corridorPieces) {   // (a curve's piece by piece: its box takes in the lots inside the bend)
                        const cut = Poly.clip(piece, bandPoly);
                        if (cut.length < 3 || Math.abs(Poly.area(cut)) < 1) continue;
                        const b = Poly.box(cut), lo = (along ? b.x : b.y) - alley, hi = (along ? b.x + b.w : b.y + b.h) + alley;
                        spans = spans.flatMap(([a, z]) => [[a, Math.min(z, lo)], [Math.max(a, hi), z]]).filter(([a, z]) => z - a > 120);
                    }
                    return spans;
                };
                const run = (side, span, maxDepth) => clearOf(side, span, Math.min(maxDepth, 260) + setback).flatMap(sp => runSpan(side, sp, maxDepth));
                const runSpan = (side, span, maxDepth) => {
                    const along = side === 'south' || side === 'north', gap = Math.random() < 0.65 ? 0 : alley;
                    const room = (span[1] - span[0]) * (options.fill ?? 1);   // fill < 1 leaves part of each street front open (fewer buildings to draw)
                    let ids = pick(room, maxDepth, along);
                    while (ids.length > 1 && ids.reduce((n, id) => n + (along ? this.buildingTemplates[id].w : this.buildingTemplates[id].h), 0) + gap * (ids.length - 1) > room) ids.pop();
                    if (!ids.length) return [];
                    const row = this.row(block.name, side, ids, { gap, setback, span, margin, autoPlaced: true });
                    placed.push(...row);
                    return row;
                };
                const nsDepth = (both('north', 'south') ? (block.h - margin) / 2 : block.h - margin * 2) - setback;
                const ns = { north: [], south: [] };
                for (const side of ['south', 'north']) if (sides.includes(side)) ns[side] = run(side, [block.x + margin, block.x + block.w - margin], nsDepth);
                const top = ns.north.length ? Math.max(...ns.north.map(p => p.extent.y + p.extent.h)) + alley : block.y + margin;
                const bottom = ns.south.length ? Math.min(...ns.south.map(p => p.extent.y)) - alley : block.y + block.h - margin;
                const weDepth = (both('west', 'east') ? (block.w - margin) / 2 : block.w - margin * 2) - setback;
                if (bottom - top > 150) for (const side of ['west', 'east']) if (sides.includes(side)) run(side, [top, bottom], weDepth);
                placed.push(...this._fillAngledFronts(block, templates, options));
                return placed;
            }
            
            /**
             * The buildings along an angled street where it crosses a block: a stepped row on each side, each building's
             * nearest corner on the line `setback` back from its pavement, facing it (whichever of N, E, S or W looks
             * most onto it), side by side up the street.
             */
            _fillAngledFronts(block, templates, options = {}) {
                const placed = [], setback = options.setback ?? 12, margin = 30, pw = this.pavementWidth;
                const inBlock = (x, y, w, h) => x >= block.x + margin && y >= block.y + margin && x + w <= block.x + block.w - margin && y + h <= block.y + block.h - margin;
                for (const road of this.angledRoads) {
                    const bp = [{ x: block.x, y: block.y }, { x: block.x + block.w, y: block.y }, { x: block.x + block.w, y: block.y + block.h }, { x: block.x, y: block.y + block.h }];
                    if (Poly.clip(road.corridor, bp).length < 3) continue;
                    const hT = road.thickness / 2;
                    for (const side of [-1, 1]) {
                        const line = hT + pw + setback, gap = Math.random() < 0.65 ? 0 : 30;
                        const pool = templates.filter(t => !t.unique);
                        for (let cursor = 0; cursor < road.length && pool.length;) {
                            // the street's direction here (on a curve it turns), and towards it from this side the facing that looks most that way
                            const f = road.path.frame(cursor), tx = -side * f.nx, ty = -side * f.ny;
                            const facing = Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 'E' : 'W') : (ty > 0 ? 'S' : 'N');
                            // the weighted pick first, then whatever else fits here; nothing does: a little further up
                            const first = this._selectWeightedTemplate(pool), order = [first, ...pool.filter(t => t !== first).sort(() => Math.random() - 0.5)];
                            let spot = null;
                            for (const t of order) {
                                const S = this._shape(t, {}), e = S.ext;
                                // the corner nearest the street, and how far the box runs along it from that corner
                                const corners = [[0, 0], [e.w, 0], [e.w, e.h], [0, e.h]];
                                const lat = ([cx, cy]) => side * (cx * f.nx + cy * f.ny), alongOf = ([cx, cy]) => cx * f.ux + cy * f.uy;
                                const near = corners.reduce((a, b) => lat(b) < lat(a) ? b : a);
                                const as = corners.map(c => alongOf(c) - alongOf(near)), a0 = Math.min(...as), a1 = Math.max(...as);
                                const p = this._along(road, cursor - a0, side * line);
                                const x = Math.floor(p.x - near[0]), y = Math.floor(p.y - near[1]);
                                if (inBlock(x, y, e.w, e.h) && !this._intersectsSafeZone(x, y, e.w, e.h)) { spot = { t, S, e, x, y, run: a1 - a0, facing }; break; }
                            }
                            if (!spot) { cursor += 40; continue; }
                            placed.push(this._commit(spot.t, block.name, spot.S, spot.x, spot.y, { facing: spot.facing, angled: road.name, autoPlaced: true }));
                            this._addSafeZone(spot.x, spot.y, spot.e.w, spot.e.h, `Angled: ${road.name}`);   // exact: the next one up the street may touch it
                            cursor += spot.run + gap;
                        }
                    }
                }
                return placed;
            }
            
            autoFillAll(options = {}) {
                const allPlacements = [];
                for (let block of this.blocks) {
                    if (this._getZoneType(block.name) !== CityLayout.ZONE.BLOCK) continue;
                    if (this.placedBuildings.some(p => p.blockName === block.name) && !options.fillPartial) continue;
                    
                    let templateIds = options.templateIds;
                    if (options.categories) {
                        templateIds = Object.keys(this.buildingTemplates)
                            .filter(id => options.categories.includes(this.buildingTemplates[id].category));
                    }
                    
                    const scatter = options.scatter === true || (Array.isArray(options.scatter) && options.scatter.includes(block.name));
                    allPlacements.push(...this.autoFillBlock(block.name, templateIds, { ...options, scatter }));
                }
                return allPlacements;
            }
            
            // === GENERATION ===
            
            generateBlocks() {
                this.blocks = [];
                this.blockMap = {};
                
                const hEdges = [0];
                this.horizontalRoads.forEach(r => {
                    hEdges.push(r.topPavement);
                    hEdges.push(r.bottomPavement + this.pavementWidth);
                });
                hEdges.push(this.height);
                
                const vEdges = [0];
                this.verticalRoads.forEach(r => {
                    vEdges.push(r.leftPavement);
                    vEdges.push(r.rightPavement + this.pavementWidth);
                });
                vEdges.push(this.width);
                
                const uniqueH = [...new Set(hEdges)].sort((a, b) => a - b);
                const uniqueV = [...new Set(vEdges)].sort((a, b) => a - b);
                
                let blockId = 0;
                for (let row = 0; row < uniqueH.length - 1; row++) {
                    for (let col = 0; col < uniqueV.length - 1; col++) {
                        const x = uniqueV[col];
                        const y = uniqueH[row];
                        const w = uniqueV[col + 1] - x;
                        const h = uniqueH[row + 1] - y;
                        
                        if (this._isRoadZone(x, y, w, h)) continue;
                        
                        const name = `block_${row}_${col}`;
                        const block = {
                            id: blockId++, name, row, col,
                            x, y, w, h,
                            centerX: x + w / 2,
                            centerY: y + h / 2,
                            type: CityLayout.ZONE.BLOCK,
                            buildings: []
                        };
                        
                        this.blocks.push(block);
                        this.blockMap[name] = block;
                    }
                }
                
                // Apply zone overrides
                for (let blockName in this.zoneOverrides) {
                    const block = this.blockMap[blockName];
                    if (!block) continue;
                    const override = this.zoneOverrides[blockName];
                    block.type = override.type;
                    block.zoneOptions = override.options;
                    
                    if (override.type === CityLayout.ZONE.PARK || override.type === CityLayout.ZONE.PLAZA) {
                        this._addSafeZone(block.x, block.y, block.w, block.h, `${override.type}: ${override.options.name || blockName}`);
                    }
                }
                
                return this.blocks;
            }
            
            generateWalls(mapWidth, mapHeight) {
                // Border walls removed — map bounds collision is handled by
                // checkEnvironmentCollision clamping. The thick rendered walls
                // were costing draw calls for geometry the player never sees.
                return [];
            }
            
            /**
             * Generate crosswalks at all intersections.
             * Each intersection edge gets a crosswalk spanning the road width.
             * Crosswalk thickness = pavement width.
             * Orientation = the road being CROSSED (for stripe direction)
             */
            generateCrosswalks() {
                const crosswalks = [];
                const pw = this.pavementWidth;
                
                // For each intersection of horizontal and vertical roads
                for (let hRoad of this.horizontalRoads) {
                    for (let vRoad of this.verticalRoads) {
                        // Intersection bounds (road surfaces only, not pavements)
                        const ixLeft = vRoad.x;
                        const ixRight = vRoad.x + vRoad.roadWidth;
                        const ixTop = hRoad.y;
                        const ixBottom = hRoad.y + hRoad.roadHeight;
                        
                        // North crosswalk (crosses vertical road at north edge)
                        // Only if there's road continuing north (not at map edge)
                        if (ixTop > pw) {
                            crosswalks.push({
                                x: ixLeft,
                                y: ixTop - pw,
                                w: vRoad.roadWidth,
                                h: pw,
                                orientation: 'V' // Crossing vertical road
                            });
                        }
                        
                        // South crosswalk (crosses vertical road at south edge)
                        if (ixBottom < this.height - pw) {
                            crosswalks.push({
                                x: ixLeft,
                                y: ixBottom,
                                w: vRoad.roadWidth,
                                h: pw,
                                orientation: 'V' // Crossing vertical road
                            });
                        }
                        
                        // West crosswalk (crosses horizontal road at west edge)
                        if (ixLeft > pw) {
                            crosswalks.push({
                                x: ixLeft - pw,
                                y: ixTop,
                                w: pw,
                                h: hRoad.roadHeight,
                                orientation: 'H' // Crossing horizontal road
                            });
                        }
                        
                        // East crosswalk (crosses horizontal road at east edge)
                        if (ixRight < this.width - pw) {
                            crosswalks.push({
                                x: ixRight,
                                y: ixTop,
                                w: pw,
                                h: hRoad.roadHeight,
                                orientation: 'H' // Crossing horizontal road
                            });
                        }
                    }
                }
                
                // Across each angled road at both ends, just clear of the junction (in the pavement's line, as above)
                for (const road of this.angledRoads) for (const e of road.ends) {
                    if (!e) continue;
                    const hT = road.thickness / 2, a0 = e === road.ends[0] ? e.along : e.along - pw, a1 = a0 + pw;
                    const at = (a, l) => this._along(road, a, l);
                    const poly = [at(a0, -hT), at(a1, -hT), at(a1, hT), at(a0, hT)];
                    crosswalks.push({
                        ...Poly.box(poly), orientation: 'D', poly, road: road.name,
                        // the stripes run with the road, laid across it; the walk lights sit along both kerbs; people step off at its ends
                        axis: (() => { const o = at(a0, 0), f = e.f; return { ox: o.x, oy: o.y, ux: f.ux, uy: f.uy, nx: f.nx, ny: f.ny, a0: 0, a1: pw, hT }; })(),
                        kerbs: [-1, 1].map(sd => { const p = at(a0 + 7, sd * (hT - 3)), q = at(a1 - 7, sd * (hT - 3)); return [p.x, p.y, q.x, q.y]; }),
                        ends: [-1, 1].map(sd => at((a0 + a1) / 2, sd * (hT + 10)))
                    });
                }
                
                return crosswalks;
            }
            
            // === HELPERS ===
            
            _addSafeZone(x, y, w, h, reason = '') {
                this.safeZones.push({ x, y, w, h, reason });
            }
            
            _intersectsSafeZone(x, y, w, h) {
                return this.safeZones.some(zone => 
                    x < zone.x + zone.w && x + w > zone.x &&
                    y < zone.y + zone.h && y + h > zone.y
                ) || this._onAngledRoad(x, y, w, h);
            }
            
            _isRoadZone(x, y, w, h) {
                const cx = x + w / 2, cy = y + h / 2;
                for (let r of this.horizontalRoads) {
                    if (cy >= r.topPavement && cy <= r.bottomPavement + this.pavementWidth) return true;
                }
                for (let r of this.verticalRoads) {
                    if (cx >= r.leftPavement && cx <= r.rightPavement + this.pavementWidth) return true;
                }
                return false;
            }
            
            _getZoneType(blockName) {
                if (this.zoneOverrides[blockName]) return this.zoneOverrides[blockName].type;
                const block = this.blockMap[blockName];
                return block ? block.type : CityLayout.ZONE.BLOCK;
            }
            
            _calculateBuildingPosition(block, w, h, margin, align) {
                const safeX = block.x + margin;
                const safeY = block.y + margin;
                const safeW = block.w - margin * 2;
                const safeH = block.h - margin * 2;
                
                if (w > safeW || h > safeH) return null;
                
                let x, y;
                switch (align) {
                    case 'top-left': x = safeX; y = safeY; break;
                    case 'top': case 'top-center': x = safeX + (safeW - w) / 2; y = safeY; break;
                    case 'top-right': x = safeX + safeW - w; y = safeY; break;
                    case 'left': case 'center-left': x = safeX; y = safeY + (safeH - h) / 2; break;
                    case 'center': default: x = safeX + (safeW - w) / 2; y = safeY + (safeH - h) / 2; break;
                    case 'right': case 'center-right': x = safeX + safeW - w; y = safeY + (safeH - h) / 2; break;
                    case 'bottom-left': x = safeX; y = safeY + safeH - h; break;
                    case 'bottom': case 'bottom-center': x = safeX + (safeW - w) / 2; y = safeY + safeH - h; break;
                    case 'bottom-right': x = safeX + safeW - w; y = safeY + safeH - h; break;
                }
                return { x: Math.floor(x), y: Math.floor(y) };
            }
            
            _findValidPosition(block, w, h, margin) {
                const safeX = block.x + margin;
                const safeY = block.y + margin;
                const safeW = block.w - margin * 2;
                const safeH = block.h - margin * 2;
                
                if (w > safeW || h > safeH) return null;
                
                for (let attempt = 0; attempt < 20; attempt++) {
                    const x = safeX + Math.random() * (safeW - w);
                    const y = safeY + Math.random() * (safeH - h);
                    if (!this._intersectsSafeZone(x, y, w, h)) {
                        return { x: Math.floor(x), y: Math.floor(y) };
                    }
                }
                
                for (let x = safeX; x <= safeX + safeW - w; x += 50) {
                    for (let y = safeY; y <= safeY + safeH - h; y += 50) {
                        if (!this._intersectsSafeZone(x, y, w, h)) {
                            return { x: Math.floor(x), y: Math.floor(y) };
                        }
                    }
                }
                return null;
            }
            
            _selectWeightedTemplate(templates) {
                const total = templates.reduce((sum, t) => sum + (t.weight || 1), 0);
                let rand = Math.random() * total;
                for (let t of templates) {
                    rand -= (t.weight || 1);
                    if (rand <= 0) return t;
                }
                return templates[0];
            }
            
            
            /**
             * Extract landmarks from placed buildings.
             * Returns an object mapping landmarkId -> { x, y } world coordinates.
             * Position is calculated as the door/entrance location (bottom center + offset).
             */
            extractLandmarks() {
                const landmarks = {};
                
                for (const placement of this.placedBuildings) {
                    const template = placement.template;
                    
                    // Only process buildings with a landmarkId
                    if (!template.landmarkId) continue;
                    
                    // Entrance position: the middle of the side it faces (south unless placed with a facing), 50 px out
                    const f = CityLayout.facing(placement), p = placement;
                    const entranceX = f === 'E' ? p.x + p.w + 50 : f === 'W' ? p.x - 50 : p.x + p.w / 2;
                    const entranceY = f === 'S' ? p.y + p.h + 50 : f === 'N' ? p.y - 50 : p.y + p.h / 2;
                    
                    landmarks[template.landmarkId] = {
                        x: entranceX,
                        y: entranceY,
                        buildingLabel: template.label,
                        templateId: placement.templateId
                    };
                }
                
                return landmarks;
            }
            
            /**
             * Compute Zib taxi drop-off points for each building landmark.
             * Strategy: doors are south-facing by convention (V1: line 16168, V2: line 16521),
             * so project the door X onto the centerline of the nearest horizontal road BELOW
             * the building. Falls back to road-above, then Euclidean nearest-road.
             * 
             * Waypoints are advanced by Euclidean distance (see TrafficVehicle.advanceToRelevantWaypoint),
             * so lane membership of the destination point is irrelevant — only road alignment matters.
             *
             * @param {RoadNetwork} network - Built road network (for fallback Euclidean snap)
             * @param {Building[]} buildings - Built building instances, aligned with placedBuildings.
             *   Used for accurate door X (V2 multi-section buildings have door at entrance section,
             *   not building center).
             * @returns {Object} landmarkId -> { x, y, roadName, approach }
             *   approach: 'south' | 'north' | 'fallback' — useful for debug rendering.
             */
            computeDropOffs(network, buildings) {
                const dropOffs = {};

                this.placedBuildings.forEach((placement, i) => {
                    const template = placement.template;
                    if (!template.landmarkId) return;

                    const building = buildings ? buildings[i] : null;
                    // Prefer the actual door position from attachedTransition (handles V2
                    // multi-section buildings where door isn't at building center).
                    const tr = building && building.attachedTransition;
                    const doorX = tr ? (tr.x + tr.w / 2) : (placement.x + placement.w / 2);
                    const buildingBottomY = placement.y + placement.h;
                    const buildingTopY = placement.y;

                    // Optional per-template offset for buildings with deep setbacks (e.g. hotels).
                    const offsetX = template.dropOffsetX || 0;
                    const offsetY = template.dropOffsetY || 0;

                    // --- FACING NORTH, EAST OR WEST: the nearest road on that side, level with the door ---
                    const f = CityLayout.facing(placement);
                    if (f !== 'S') {
                        const doorY = tr ? (tr.y + tr.h / 2) : (placement.y + placement.h / 2);
                        const roads = f === 'N' ? this.horizontalRoads : this.verticalRoads;
                        const gapTo = (r) => f === 'N' ? buildingTopY - r.centerY : f === 'E' ? r.centerX - (placement.x + placement.w) : placement.x - r.centerX;
                        let best = null;
                        for (const r of roads) { const g = gapTo(r); if (g > 0 && (!best || g < gapTo(best))) best = r; }
                        if (best) {
                            dropOffs[template.landmarkId] = f === 'N'
                                ? { x: doorX + offsetX, y: best.centerY + offsetY, roadName: best.name, approach: 'north' }
                                : { x: best.centerX + offsetX, y: doorY + offsetY, roadName: best.name, approach: f === 'E' ? 'east' : 'west' };
                            return;
                        }
                    }

                    // --- PRIMARY: nearest horizontal road BELOW the building ---
                    let roadBelow = null, gapBelow = Infinity;
                    for (const road of this.horizontalRoads) {
                        const gap = road.centerY - buildingBottomY;
                        if (gap > 0 && gap < gapBelow) { gapBelow = gap; roadBelow = road; }
                    }
                    if (roadBelow) {
                        dropOffs[template.landmarkId] = {
                            x: doorX + offsetX,
                            y: roadBelow.centerY + offsetY,
                            roadName: roadBelow.name,
                            approach: 'south'
                        };
                        return;
                    }

                    // --- FALLBACK 1: building on south edge of map → use road ABOVE ---
                    let roadAbove = null, gapAbove = Infinity;
                    for (const road of this.horizontalRoads) {
                        const gap = buildingTopY - road.centerY;
                        if (gap > 0 && gap < gapAbove) { gapAbove = gap; roadAbove = road; }
                    }
                    if (roadAbove) {
                        dropOffs[template.landmarkId] = {
                            x: doorX + offsetX,
                            y: roadAbove.centerY + offsetY,
                            roadName: roadAbove.name,
                            approach: 'north'
                        };
                        return;
                    }

                    // --- FALLBACK 2: no horizontal roads at all → Euclidean nearest road ---
                    if (network && network.findNearestRoadPoint) {
                        const ex = placement.x + placement.w / 2;
                        const ey = placement.y + placement.h + 50;
                        const pt = network.findNearestRoadPoint(ex, ey);
                        if (pt) dropOffs[template.landmarkId] = {
                            x: pt.x, y: pt.y,
                            roadName: pt.road && pt.road.name,
                            approach: 'fallback'
                        };
                    }
                });

                return dropOffs;
            }
            
            listBlocks() {
                return this.blocks.map(b => `${b.name}: (${b.x}, ${b.y}) ${b.w}x${b.h} [${this._getZoneType(b.name)}]`);
            }
            
            /**
             * Generate a sidewalk network for pedestrian navigation.
             * Creates waypoints along pavements with crosswalk connections.
             * 
             * @returns {Object} { nodes: [], crosswalks: [] }
             *   - nodes: Waypoints with { x, y, connections: [], isCrosswalk, crosswalkData }
             *   - crosswalks: Crosswalk data for rendering/collision
             */
            /**
             * Where an angled road's mouth breaks a road's walk on one side (dir: -1 the top/left side, +1 the
             * bottom/right), as gaps along it ({start, end}, in x along a horizontal road, y along a vertical one)
             */
            _mouthGaps(straight, dir, walkAt) {
                const gaps = [];
                for (const road of this.angledRoads) for (const e of road.ends) {
                    if (!e || e.road !== straight || e.dir !== dir) continue;
                    const H = e.kind === 'H', hT = road.thickness / 2 + this.pavementWidth, { f, p } = e;
                    // the carriageway and its pavements, where they cross the walk's line (along the end piece)
                    const xs = [-hT, hT].map(l => {
                        const c0 = H ? p.y + f.ny * l : p.x + f.nx * l, v = H ? f.uy : f.ux;
                        const t = (walkAt - c0) / v;
                        return H ? p.x + f.ux * t + f.nx * l : p.y + f.uy * t + f.ny * l;
                    });
                    gaps.push({ start: Math.min(...xs) - 10, end: Math.max(...xs) + 10 });
                }
                return gaps;
            }
            
            generateSidewalkNetwork() {
                const nodes = [];
                const pw = this.pavementWidth;
                const walkOffset = 25; // Distance from road edge where pedestrians walk
                const nodeSpacing = 150; // Distance between waypoints along sidewalk
                
                // Helper to create a node
                const createNode = (x, y, isCrosswalk = false, crosswalkData = null) => {
                    const node = { 
                        id: nodes.length, 
                        x, y, 
                        connections: [], 
                        isCrosswalk, 
                        crosswalkData,
                        side: null // Will be set to identify which side of road
                    };
                    nodes.push(node);
                    return node;
                };
                
                // Helper to connect two nodes bidirectionally
                const connect = (n1, n2) => {
                    if (!n1.connections.includes(n2.id)) n1.connections.push(n2.id);
                    if (!n2.connections.includes(n1.id)) n2.connections.push(n1.id);
                };
                
                // Helper to find node near position
                const findNodeNear = (x, y, maxDist = 30) => {
                    for (let n of nodes) {
                        if (Math.hypot(n.x - x, n.y - y) < maxDist) return n;
                    }
                    return null;
                };
                
                // Generate crosswalks first (we need their positions)
                const crosswalks = this.generateCrosswalks();
                
                // ====== HORIZONTAL ROADS ======
                for (let hRoad of this.horizontalRoads) {
                    const roadTop = hRoad.y;
                    const roadBottom = hRoad.y + hRoad.roadHeight;
                    
                    // Top sidewalk (walk on inner edge, near road)
                    const topWalkY = roadTop - walkOffset;
                    // Bottom sidewalk
                    const bottomWalkY = roadBottom + walkOffset;
                    
                    // Find intersection gaps
                    const gaps = [];
                    for (let vRoad of this.verticalRoads) {
                        gaps.push({
                            start: vRoad.x - pw - 10,
                            end: vRoad.x + vRoad.roadWidth + pw + 10
                        });
                    }
                    
                    // Each side's walk, between the gaps (and, on the side an angled road joins, either side of its mouth)
                    for (const [side, walkY, dir] of [['top', topWalkY, -1], ['bottom', bottomWalkY, 1]]) {
                        const sideGaps = gaps.concat(this._mouthGaps(hRoad, dir, walkY)).sort((a, b) => a.start - b.start);
                        const segments = [];
                        let currentX = this.margin;
                        for (let gap of sideGaps) {
                            if (gap.start > currentX) segments.push({ start: currentX, end: gap.start });
                            currentX = Math.max(currentX, gap.end);
                        }
                        if (currentX < this.width - this.margin) segments.push({ start: currentX, end: this.width - this.margin });
                        
                        for (let seg of segments) {
                            const run = [];
                            for (let x = seg.start + walkOffset; x < seg.end - walkOffset; x += nodeSpacing) {
                                const node = createNode(x, walkY);
                                node.side = side;
                                node.roadName = hRoad.name;
                                run.push(node);
                            }
                            for (let i = 1; i < run.length; i++) connect(run[i-1], run[i]);
                        }
                    }
                }
                
                // ====== VERTICAL ROADS ======
                for (let vRoad of this.verticalRoads) {
                    const roadLeft = vRoad.x;
                    const roadRight = vRoad.x + vRoad.roadWidth;
                    
                    // Left sidewalk
                    const leftWalkX = roadLeft - walkOffset;
                    // Right sidewalk
                    const rightWalkX = roadRight + walkOffset;
                    
                    // Find intersection gaps
                    const gaps = [];
                    for (let hRoad of this.horizontalRoads) {
                        gaps.push({
                            start: hRoad.y - pw - 10,
                            end: hRoad.y + hRoad.roadHeight + pw + 10
                        });
                    }
                    
                    // Each side's walk, between the gaps (and either side of an angled road's mouth on its side)
                    for (const [side, walkX, dir] of [['left', leftWalkX, -1], ['right', rightWalkX, 1]]) {
                        const sideGaps = gaps.concat(this._mouthGaps(vRoad, dir, walkX)).sort((a, b) => a.start - b.start);
                        const segments = [];
                        let currentY = this.margin;
                        for (let gap of sideGaps) {
                            if (gap.start > currentY) segments.push({ start: currentY, end: gap.start });
                            currentY = Math.max(currentY, gap.end);
                        }
                        if (currentY < this.height - this.margin) segments.push({ start: currentY, end: this.height - this.margin });
                        
                        for (let seg of segments) {
                            const run = [];
                            for (let y = seg.start + walkOffset; y < seg.end - walkOffset; y += nodeSpacing) {
                                const node = createNode(walkX, y);
                                node.side = side;
                                node.roadName = vRoad.name;
                                run.push(node);
                            }
                            for (let i = 1; i < run.length; i++) connect(run[i-1], run[i]);
                        }
                    }
                }
                
                // ====== ANGLED ROADS ======
                // A walk down each pavement, from just past one end's crossing to just short of the other's
                for (const road of this.angledRoads) {
                    const hT = road.thickness / 2, [e0, e1] = road.ends;
                    const from = (e0 ? e0.along + pw : 0) + walkOffset, to = (e1 ? e1.along - pw : road.length) - walkOffset;
                    const count = Math.max(1, Math.round((to - from) / nodeSpacing));
                    // a node every nodeSpacing, and round a bend one at each of its joints (so the walk keeps to the pavement)
                    const at = [...Array(count + 1).keys()].map(i => from + (to - from) * i / count);
                    for (const b of road.path.bends()) if (b > from && b < to && at.every(a => Math.abs(a - b) > 20)) at.push(b);
                    at.sort((a, b) => a - b);
                    for (const sd of [-1, 1]) {
                        const run = [];
                        for (const a of at) {
                            const p = this._along(road, a, sd * (hT + walkOffset));
                            const node = createNode(p.x, p.y);
                            node.side = sd < 0 ? 'left' : 'right';
                            node.roadName = road.name;
                            run.push(node);
                        }
                        for (let i = 1; i < run.length; i++) connect(run[i-1], run[i]);
                    }
                }
                
                // ====== CROSSWALK CONNECTIONS ======
                // Create crosswalk nodes and connect them to nearby sidewalk nodes (and, where a gap in the pavement's
                // walk leaves none near, to the nearest: a crossing is never a dead end)
                const linkNearest = (cn) => {
                    if (cn.connections.some(id => !nodes[id].isCrosswalk)) return;
                    let best = null, bd = 260;
                    for (const n of nodes) {
                        if (n.isCrosswalk) continue;
                        const d = Math.hypot(n.x - cn.x, n.y - cn.y);
                        if (d < bd) { bd = d; best = n; }
                    }
                    if (best) connect(cn, best);
                };
                for (let cw of crosswalks) {
                    const cwCenterX = cw.x + cw.w / 2;
                    const cwCenterY = cw.y + cw.h / 2;
                    
                    // A crosswalk carries the pavement across the road it crosses: its ends are on the kerbs either
                    // side of that road (a vertical road's crossing runs left to right; a horizontal road's, top to bottom)
                    if (cw.ends) {
                        // An angled road's crossing: its ends are given (on the kerbs either side, halfway across it)
                        const [a, b] = cw.ends.map(p => createNode(p.x, p.y, true, cw));
                        connect(a, b);
                        for (const cn of [a, b]) {
                            for (let n of nodes) if (!n.isCrosswalk && Math.hypot(n.x - cn.x, n.y - cn.y) < 130) connect(cn, n);
                            linkNearest(cn);
                        }
                    } else if (cw.orientation === 'H') {
                        const topNode = createNode(cwCenterX, cw.y - 10, true, cw);
                        const bottomNode = createNode(cwCenterX, cw.y + cw.h + 10, true, cw);
                        connect(topNode, bottomNode);
                        
                        // Connect to nearby sidewalk nodes (the walks along both pavements stop ~100 px short of the corner)
                        for (let n of nodes) {
                            if (n.isCrosswalk) continue;
                            const dist = Math.hypot(n.x - topNode.x, n.y - topNode.y);
                            if (dist < 130) connect(topNode, n);
                            const dist2 = Math.hypot(n.x - bottomNode.x, n.y - bottomNode.y);
                            if (dist2 < 130) connect(bottomNode, n);
                        }
                        linkNearest(topNode); linkNearest(bottomNode);
                    } else {
                        const leftNode = createNode(cw.x - 10, cwCenterY, true, cw);
                        const rightNode = createNode(cw.x + cw.w + 10, cwCenterY, true, cw);
                        connect(leftNode, rightNode);
                        
                        // Connect to nearby sidewalk nodes (as above)
                        for (let n of nodes) {
                            if (n.isCrosswalk) continue;
                            const dist = Math.hypot(n.x - leftNode.x, n.y - leftNode.y);
                            if (dist < 130) connect(leftNode, n);
                            const dist2 = Math.hypot(n.x - rightNode.x, n.y - rightNode.y);
                            if (dist2 < 130) connect(rightNode, n);
                        }
                        linkNearest(leftNode); linkNearest(rightNode);
                    }
                }
                
                // ====== CORNER CONNECTIONS ======
                // Connect sidewalk endpoints at intersections
                const cornerRadius = 100;
                for (let hRoad of this.horizontalRoads) {
                    for (let vRoad of this.verticalRoads) {
                        // Four corners of intersection
                        const corners = [
                            { x: vRoad.x - walkOffset, y: hRoad.y - walkOffset }, // NW
                            { x: vRoad.x + vRoad.roadWidth + walkOffset, y: hRoad.y - walkOffset }, // NE
                            { x: vRoad.x - walkOffset, y: hRoad.y + hRoad.roadHeight + walkOffset }, // SW
                            { x: vRoad.x + vRoad.roadWidth + walkOffset, y: hRoad.y + hRoad.roadHeight + walkOffset } // SE
                        ];
                        
                        // Find and connect nodes near each corner
                        for (let corner of corners) {
                            const nearbyNodes = nodes.filter(n => 
                                !n.isCrosswalk && Math.hypot(n.x - corner.x, n.y - corner.y) < cornerRadius
                            );
                            // Connect all nearby nodes to each other (corner turns)
                            for (let i = 0; i < nearbyNodes.length; i++) {
                                for (let j = i + 1; j < nearbyNodes.length; j++) {
                                    connect(nearbyNodes[i], nearbyNodes[j]);
                                }
                            }
                        }
                    }
                }
                
                return { nodes, crosswalks };
            }
        }
        
