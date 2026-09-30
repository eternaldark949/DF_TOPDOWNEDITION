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
            
            constructor(config = {}) {
                this.width = config.width || 4000;
                this.height = config.height || 5000;
                this.margin = config.margin || 25;
                this.pavementWidth = config.pavementWidth || 75;
                this.laneWidth = config.laneWidth || 60;
                
                this.horizontalRoads = [];
                this.verticalRoads = [];
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
                        v2Id: id
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
                const template = this.buildingTemplates[templateId];
                if (!template) { console.error(`Template '${templateId}' not found`); return null; }
                
                const block = this.blockMap[blockName];
                if (!block) { console.error(`Block '${blockName}' not found`); return null; }
                
                const zoneType = this._getZoneType(blockName);
                if (zoneType === CityLayout.ZONE.RESTRICTED || zoneType === CityLayout.ZONE.ROAD) return null;
                
                const w = options.w || template.w;
                const h = options.h || template.h;
                const margin = options.margin || template.margin || 30;
                
                const coords = this._calculateBuildingPosition(block, w, h, margin, options.align || 'center');
                if (!coords) { console.warn(`Not enough space in ${blockName} for ${templateId}`); return null; }
                
                if (this._intersectsSafeZone(coords.x, coords.y, w, h)) {
                    console.warn(`Building ${templateId} intersects safe zone in ${blockName}`);
                    return null;
                }
                
                const placement = {
                    templateId, template, blockName,
                    x: coords.x, y: coords.y, w, h, options
                };
                
                this.placedBuildings.push(placement);
                this._addSafeZone(coords.x - margin/2, coords.y - margin/2, w + margin, h + margin, `Building: ${template.label}`);
                
                // Auto-set block lamp color for V2 buildings from their accent color
                if (template.isV2 && template.color) {
                    this.setBlockLampColor(blockName, template.color);
                    console.log(`CityLayout: Auto-set lamp color for ${blockName} to ${template.color} (from ${templateId})`);
                }
                
                return placement;
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
                    
                    allPlacements.push(...this.autoFillBlock(block.name, templateIds, options));
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
                );
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
                    
                    // Calculate entrance position (bottom center of building, offset forward)
                    const entranceX = placement.x + placement.w / 2;
                    const entranceY = placement.y + placement.h + 50; // 50px in front of door
                    
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
                    gaps.sort((a, b) => a.start - b.start);
                    
                    // Create segments between gaps
                    const segments = [];
                    let currentX = this.margin;
                    for (let gap of gaps) {
                        if (gap.start > currentX) {
                            segments.push({ start: currentX, end: gap.start });
                        }
                        currentX = gap.end;
                    }
                    if (currentX < this.width - this.margin) {
                        segments.push({ start: currentX, end: this.width - this.margin });
                    }
                    
                    // Create nodes along each segment
                    for (let seg of segments) {
                        const topNodes = [];
                        const bottomNodes = [];
                        
                        for (let x = seg.start + walkOffset; x < seg.end - walkOffset; x += nodeSpacing) {
                            const topNode = createNode(x, topWalkY);
                            topNode.side = 'top';
                            topNode.roadName = hRoad.name;
                            topNodes.push(topNode);
                            
                            const bottomNode = createNode(x, bottomWalkY);
                            bottomNode.side = 'bottom';
                            bottomNode.roadName = hRoad.name;
                            bottomNodes.push(bottomNode);
                        }
                        
                        // Connect nodes in sequence
                        for (let i = 1; i < topNodes.length; i++) connect(topNodes[i-1], topNodes[i]);
                        for (let i = 1; i < bottomNodes.length; i++) connect(bottomNodes[i-1], bottomNodes[i]);
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
                    gaps.sort((a, b) => a.start - b.start);
                    
                    // Create segments between gaps
                    const segments = [];
                    let currentY = this.margin;
                    for (let gap of gaps) {
                        if (gap.start > currentY) {
                            segments.push({ start: currentY, end: gap.start });
                        }
                        currentY = gap.end;
                    }
                    if (currentY < this.height - this.margin) {
                        segments.push({ start: currentY, end: this.height - this.margin });
                    }
                    
                    // Create nodes along each segment
                    for (let seg of segments) {
                        const leftNodes = [];
                        const rightNodes = [];
                        
                        for (let y = seg.start + walkOffset; y < seg.end - walkOffset; y += nodeSpacing) {
                            const leftNode = createNode(leftWalkX, y);
                            leftNode.side = 'left';
                            leftNode.roadName = vRoad.name;
                            leftNodes.push(leftNode);
                            
                            const rightNode = createNode(rightWalkX, y);
                            rightNode.side = 'right';
                            rightNode.roadName = vRoad.name;
                            rightNodes.push(rightNode);
                        }
                        
                        // Connect nodes in sequence
                        for (let i = 1; i < leftNodes.length; i++) connect(leftNodes[i-1], leftNodes[i]);
                        for (let i = 1; i < rightNodes.length; i++) connect(rightNodes[i-1], rightNodes[i]);
                    }
                }
                
                // ====== CROSSWALK CONNECTIONS ======
                // Create crosswalk nodes and connect them to nearby sidewalk nodes
                for (let cw of crosswalks) {
                    const cwCenterX = cw.x + cw.w / 2;
                    const cwCenterY = cw.y + cw.h / 2;
                    
                    if (cw.orientation === 'V') {
                        // Vertical road crossing - nodes at top and bottom of crosswalk
                        const topNode = createNode(cwCenterX, cw.y - 10, true, cw);
                        const bottomNode = createNode(cwCenterX, cw.y + cw.h + 10, true, cw);
                        connect(topNode, bottomNode);
                        
                        // Connect to nearby sidewalk nodes
                        for (let n of nodes) {
                            if (n.isCrosswalk) continue;
                            const dist = Math.hypot(n.x - topNode.x, n.y - topNode.y);
                            if (dist < 80) connect(topNode, n);
                            const dist2 = Math.hypot(n.x - bottomNode.x, n.y - bottomNode.y);
                            if (dist2 < 80) connect(bottomNode, n);
                        }
                    } else {
                        // Horizontal road crossing - nodes at left and right of crosswalk
                        const leftNode = createNode(cw.x - 10, cwCenterY, true, cw);
                        const rightNode = createNode(cw.x + cw.w + 10, cwCenterY, true, cw);
                        connect(leftNode, rightNode);
                        
                        // Connect to nearby sidewalk nodes
                        for (let n of nodes) {
                            if (n.isCrosswalk) continue;
                            const dist = Math.hypot(n.x - leftNode.x, n.y - leftNode.y);
                            if (dist < 80) connect(leftNode, n);
                            const dist2 = Math.hypot(n.x - rightNode.x, n.y - rightNode.y);
                            if (dist2 < 80) connect(rightNode, n);
                        }
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
        
