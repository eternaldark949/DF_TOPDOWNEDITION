        class UISystem {
            constructor(gameEngine) {
                this.game = gameEngine;
                this.mapCanvas = document.getElementById('golden-map-canvas');
                this.mapCtx = this.mapCanvas.getContext('2d');
                
                // --- VIEWPORT-EXTENDED CACHE ---
                // Instead of caching the entire map (which for hub_949 is 4000×11000 =
                // 44 Mp / ~176 MB and crashes iPads), we cache only the currently
                // visible viewport plus a 50% buffer ring on each side, at current
                // display scale. Memory becomes constant (~6 Mp / 22 MB) regardless
                // of map size or zoom level. Pan within the buffer is free; pan or
                // zoom past it triggers a partial rebuild that only renders static
                // geometry intersecting the new region.
                //
                // Cache state:
                //   cacheMapId       — which map's data is in the cache
                //   cacheBoundsMap   — region of map-space the cache covers (x,y,w,h)
                //   cacheFinalScale  — display scale (baseScale × zoom) used at build
                //
                // Dynamic icons (player, NPCs, nav markers) live on a separate
                // canvas layer and update independently at 60fps.
                this.cacheCanvas = document.createElement('canvas');
                this.cacheCtx = this.cacheCanvas.getContext('2d');
                this.isCacheDirty = true;          // External "force rebuild" flag
                this.cacheMapId = null;
                this.cacheBoundsMap = null;        // {x, y, w, h} in map-space
                this.cacheFinalScale = 0;          // baseScale × zoom at build time
                
                this.mapView = {
                    zoom: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                    isDragging: false,
                    lastX: 0,
                    lastY: 0,
                    lastPinchDist: 0
                };
                
                // --- NAVIGATION MARKER SYSTEM ---
                this.navMarker = null;        // { x, y } - Player-set destination marker
                this.navPath = [];            // Array of {x, y} points along roads to destination
                this.roadLevelPath = [];      // Simple path through road/intersection centers (for map display)
                this.navPathDirty = false;    // Flag to recalculate path
                this.lastPlayerNavPos = null; // Last position used for nav calculation
                
                // --- ANIMATION LAYER ---
                // Separate canvas for animated icons (runs at 60fps when map is open)
                this.iconCanvas = document.createElement('canvas');
                this.iconCtx = this.iconCanvas.getContext('2d');
                this.mapContainer = document.getElementById('map-interface');
                this.iconCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
                this.mapContainer.appendChild(this.iconCanvas);
                this.isAnimating = false;
                this.animationFrameId = null;
        
                document.getElementById('map-close-btn').addEventListener('click', () => this.toggleMap(false));
                // close-menu button is handled by InventorySystem.toggleMenu()
                
                window.addEventListener('resize', () => {
                    this.resizeMap();
                    if(document.getElementById('map-interface').style.display === 'block') this.renderGoldenMap();
                });
                this.resizeMap();
                this.initMapControls();
            }
        
            // --- 1. CONTROLS (Updated to trigger Render) ---
            initMapControls() {
                const canvas = this.mapCanvas;
                
                // --- MARKER PLACEMENT (Click/Tap to set destination) ---
                const handleMarkerPlacement = (clientX, clientY) => {
                    // Only place markers on outdoor maps with road networks
                    if (this.game.activeMap.type === 'indoor') return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const canvasX = clientX - rect.left;
                    const canvasY = clientY - rect.top;
                    
                    // Convert screen coordinates to world coordinates
                    const worldCoords = this.screenToWorld(canvasX, canvasY);
                    
                    // Check if clicking near existing marker to remove it
                    if (this.navMarker) {
                        const distToMarker = Math.hypot(worldCoords.x - this.navMarker.x, worldCoords.y - this.navMarker.y);
                        if (distToMarker < 100) {
                            // Remove marker
                            this.navMarker = null;
                            this.navPath = [];
                            this.roadLevelPath = [];
                            this.game.navDestination = null;
                            showMessage("NAVIGATION CANCELLED");
                            this.renderGoldenMap();
                            return;
                        }
                    }
                    
                    // Set new marker
                    this.navMarker = { x: worldCoords.x, y: worldCoords.y };
                    this.navPathDirty = true;
                    this.calculateNavPath();
                    this.game.navDestination = this.navMarker; // Share with game engine for AutoDrive
                    showMessage("DESTINATION SET");
                    this.renderGoldenMap();
                };
                
                // Double-click for desktop marker placement
                canvas.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    handleMarkerPlacement(e.clientX, e.clientY);
                });
                
                // Long-press for touch marker placement
                let longPressTimer = null;
                let longPressTriggered = false;
                
                canvas.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 1) {
                        longPressTriggered = false;
                        const touch = e.touches[0];
                        longPressTimer = setTimeout(() => {
                            longPressTriggered = true;
                            handleMarkerPlacement(touch.clientX, touch.clientY);
                        }, 500); // 500ms long press
                    }
                });
                
                canvas.addEventListener('touchend', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });
                
                canvas.addEventListener('touchmove', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });
        
                canvas.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const zoomSpeed = 0.1;
                    const direction = e.deltaY > 0 ? -1 : 1;
                    let newZoom = this.mapView.zoom + (direction * zoomSpeed * this.mapView.zoom);
                    this.mapView.zoom = Math.max(0.5, Math.min(newZoom, 5.0));
                    this.renderGoldenMap();
                });
        
                canvas.addEventListener('mousedown', (e) => {
                    this.mapView.isDragging = true;
                    this.mapView.lastX = e.clientX;
                    this.mapView.lastY = e.clientY;
                    canvas.style.cursor = 'grabbing';
                });
        
                window.addEventListener('mousemove', (e) => {
                    if (!this.mapView.isDragging) return;
                    const dx = e.clientX - this.mapView.lastX;
                    const dy = e.clientY - this.mapView.lastY;
                    this.mapView.lastX = e.clientX;
                    this.mapView.lastY = e.clientY;
                    this.mapView.offsetX += dx;
                    this.mapView.offsetY += dy;
                    this.renderGoldenMap();
                });
        
                window.addEventListener('mouseup', () => {
                    this.mapView.isDragging = false;
                    canvas.style.cursor = 'default';
                });
                
                // Touch events (Standard)
                canvas.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 1) {
                        this.mapView.isDragging = true;
                        this.mapView.lastX = e.touches[0].clientX;
                        this.mapView.lastY = e.touches[0].clientY;
                    } else if (e.touches.length === 2) {
                        this.mapView.isDragging = false;
                        const dx = e.touches[0].clientX - e.touches[1].clientX;
                        const dy = e.touches[0].clientY - e.touches[1].clientY;
                        this.mapView.lastPinchDist = Math.hypot(dx, dy);
                    }
                });
        
                canvas.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    // Cancel long press if moved
                    if (longPressTimer && !longPressTriggered) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    if (e.touches.length === 1 && this.mapView.isDragging && !longPressTriggered) {
                        const dx = e.touches[0].clientX - this.mapView.lastX;
                        const dy = e.touches[0].clientY - this.mapView.lastY;
                        this.mapView.lastX = e.touches[0].clientX;
                        this.mapView.lastY = e.touches[0].clientY;
                        this.mapView.offsetX += dx;
                        this.mapView.offsetY += dy;
                        this.renderGoldenMap();
                    } else if (e.touches.length === 2) {
                        const dx = e.touches[0].clientX - e.touches[1].clientX;
                        const dy = e.touches[0].clientY - e.touches[1].clientY;
                        const dist = Math.hypot(dx, dy);
                        if (this.mapView.lastPinchDist > 0) {
                            const zoomFactor = dist / this.mapView.lastPinchDist;
                            this.mapView.zoom = Math.max(0.5, Math.min(this.mapView.zoom * zoomFactor, 5.0));
                            this.renderGoldenMap();
                        }
                        this.mapView.lastPinchDist = dist;
                    }
                });
            }
            
            // --- COORDINATE CONVERSION ---
            screenToWorld(screenX, screenY) {
                const mapData = this.game.activeMap;
                const w = this.mapCanvas.width;
                const h = this.mapCanvas.height;
                
                const scaleX = w / mapData.width;
                const scaleY = h / mapData.height;
                const baseScale = Math.min(scaleX, scaleY) * 0.9;
                const finalScale = baseScale * this.mapView.zoom;
                
                const mapVisualWidth = mapData.width * finalScale;
                const mapVisualHeight = mapData.height * finalScale;
                
                // Reverse the transform from renderGoldenMap
                const offsetX = (w - mapVisualWidth) / 2 + this.mapView.offsetX;
                const offsetY = (h - mapVisualHeight) / 2 + this.mapView.offsetY;
                
                const worldX = (screenX - offsetX) / finalScale;
                const worldY = (screenY - offsetY) / finalScale;
                
                return { x: worldX, y: worldY };
            }
            
            // --- NAVIGATION PATH CALCULATION (Uses Pre-built Nav Graph) ---
            calculateNavPath() {
                if (!this.navMarker) {
                    this.navPath = [];
                    this.roadLevelPath = [];
                    this.precisePath = null;
                    return;
                }
                
                const player = this.game.player;
                const network = this.game.traffic?.network;
                
                if (!network || !network.roads || network.roads.length === 0) {
                    console.log('[NAV] No road network, using direct line');
                    this.navPath = [
                        { x: player.x, y: player.y },
                        { x: this.navMarker.x, y: this.navMarker.y }
                    ];
                    this.precisePath = null;
                    return;
                }
                
                // === V2 PRECISE PATHFINDING ===
                if (network.buildPrecisePath) {
                    this.precisePath = network.buildPrecisePath(
                        player.x, player.y,
                        this.navMarker.x, this.navMarker.y
                    );
                    
                    // Convert to navPath format preserving all V2 data
                    this.navPath = this.precisePath.map(wp => ({
                        x: wp.x,
                        y: wp.y,
                        type: wp.type,
                        // Lane/Segment info
                        lane: wp.lane,
                        laneId: wp.laneId,
                        segment: wp.segment,
                        segmentId: wp.segmentId,
                        // Turn path info (critical for V2 precise turns)
                        turnPath: wp.turnPath,
                        turnPathId: wp.turnPathId,
                        controlPoints: wp.controlPoints,
                        fromLaneId: wp.fromLaneId,
                        toLaneId: wp.toLaneId,
                        toSegmentId: wp.toSegmentId,
                        // Intersection/Gate info
                        intersection: wp.intersection,
                        intersectionId: wp.intersectionId,
                        gate: wp.gate,
                        gateId: wp.gateId,
                        // Road info (use direct road property first, then fallback)
                        road: wp.road || wp.lane?.road || wp.segment?.road,
                        roadId: wp.roadId || wp.lane?.roadId || wp.segment?.roadId
                    }));
                    
                    // Get drawable segments for rendering
                    this.drawablePathSegments = network.getDrawablePath(this.precisePath);
                    
                    // === BUILD SIMPLE ROAD-LEVEL PATH (for map display) ===
                    // Just intersection centers + start/end - no lane detail
                    this.roadLevelPath = this._buildRoadLevelPath(player, network);
                    
                    console.log(`[NAV] Precise path: ${this.precisePath.length} waypoints, ${this.drawablePathSegments.length} drawable segments, ${this.roadLevelPath.length} road points`);
                    this.lastPlayerNavPos = { x: player.x, y: player.y };
                    return;
                }
                
                // === V1 FALLBACK PATHFINDING ===
                const startRoadPoint = network.findNearestRoadPoint(player.x, player.y);
                const endRoadPoint = network.findNearestRoadPoint(this.navMarker.x, this.navMarker.y);
                
                if (!startRoadPoint || !endRoadPoint) {
                    this.navPath = [
                        { x: player.x, y: player.y },
                        { x: this.navMarker.x, y: this.navMarker.y }
                    ];
                    return;
                }
                
                // Find nearest intersections using the pre-built nav graph
                const startIntersection = network.findNearestIntersection(startRoadPoint.x, startRoadPoint.y);
                const endIntersection = network.findNearestIntersection(endRoadPoint.x, endRoadPoint.y);
                
                if (!startIntersection || !endIntersection) {
                    console.log('[NAV] No intersections found - direct path');
                    this.navPath = [
                        { x: player.x, y: player.y },
                        startRoadPoint,
                        endRoadPoint,
                        { x: this.navMarker.x, y: this.navMarker.y, road: endRoadPoint.road, roadId: endRoadPoint.roadId }
                    ];
                    return;
                }
                
                // Use the pre-built navigation graph from RoadNetwork
                const graphPath = network.findPath(startIntersection.id, endIntersection.id);
                
                if (!graphPath || graphPath.length === 0) {
                    console.log('[NAV] No path found via nav graph - direct path');
                    this.navPath = [
                        { x: player.x, y: player.y },
                        startRoadPoint,
                        endRoadPoint,
                        { x: this.navMarker.x, y: this.navMarker.y, road: endRoadPoint.road, roadId: endRoadPoint.roadId }
                    ];
                    return;
                }
                
                // Build final path: player -> start road point -> graph path -> end road point -> destination
                this.navPath = [{ x: player.x, y: player.y }];
                
                // Add start road point with road reference
                this.navPath.push({ 
                    x: startRoadPoint.x, 
                    y: startRoadPoint.y, 
                    road: startRoadPoint.road,
                    roadId: startRoadPoint.roadId 
                });
                
                // Add graph path waypoints (already have road info from findPath)
                for (let waypoint of graphPath) {
                    this.navPath.push({
                        x: waypoint.x,
                        y: waypoint.y,
                        road: waypoint.road,
                        roadId: waypoint.roadId,
                        intersectionId: waypoint.intersectionId
                    });
                }
                
                // Add end road point (for dead-end handling)
                const lastWaypoint = graphPath[graphPath.length - 1];
                const distToEnd = Math.hypot(endRoadPoint.x - lastWaypoint.x, endRoadPoint.y - lastWaypoint.y);
                if (distToEnd > 100) {
                    this.navPath.push({
                        x: endRoadPoint.x,
                        y: endRoadPoint.y,
                        road: endRoadPoint.road,
                        roadId: endRoadPoint.roadId
                    });
                    console.log(`[NAV] Dead-end: Adding end road point ${distToEnd.toFixed(0)}px past last intersection`);
                }
                
                // Final destination
                this.navPath.push({ 
                    x: this.navMarker.x, 
                    y: this.navMarker.y, 
                    road: endRoadPoint.road,
                    roadId: endRoadPoint.roadId 
                });
                
                // Build road-level path from graph path
                this.roadLevelPath = [
                    { x: startRoadPoint.x, y: startRoadPoint.y, type: 'start' }
                ];
                for (let wp of graphPath) {
                    this.roadLevelPath.push({ x: wp.x, y: wp.y, type: 'intersection', id: wp.intersectionId });
                }
                this.roadLevelPath.push({ x: endRoadPoint.x, y: endRoadPoint.y, type: 'end' });
                
                this.precisePath = null;
                this.drawablePathSegments = null;
                console.log(`[NAV] Path calculated: ${this.navPath.length} waypoints, ${this.roadLevelPath.length} road points using pre-built nav graph`);
                this.lastPlayerNavPos = { x: player.x, y: player.y };
            }
            
            // --- DRAW NAVIGATION PATH (Glowing Purple Line with V2 Curves) ---
            drawNavPath(ctx) {
                if (!this.navPath || this.navPath.length < 2) return;
                
                const time = _frameTimeSec;
                const dashOffset = time * 50;
                
                ctx.save();
                
                // === V2 PRECISE PATH WITH CURVES ===
                if (this.drawablePathSegments && this.drawablePathSegments.length > 0) {
                    // Outer glow
                    ctx.strokeStyle = 'rgba(138, 43, 226, 0.4)';
                    ctx.lineWidth = 24;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.shadowColor = '#8a2be2';
                    ctx.shadowBlur = 30;
                    this._drawPathSegments(ctx, this.drawablePathSegments);
                    
                    // Middle glow
                    ctx.strokeStyle = 'rgba(148, 0, 211, 0.7)';
                    ctx.lineWidth = 12;
                    ctx.shadowBlur = 15;
                    this._drawPathSegments(ctx, this.drawablePathSegments);
                    
                    // Core line with animated dash
                    ctx.strokeStyle = '#da70d6';
                    ctx.lineWidth = 4;
                    ctx.shadowBlur = 10;
                    ctx.setLineDash([20, 15]);
                    ctx.lineDashOffset = -dashOffset;
                    this._drawPathSegments(ctx, this.drawablePathSegments);
                    
                    ctx.restore();
                    return;
                }
                
                // === V1 FALLBACK: Simple line path ===
                // Outer glow
                ctx.strokeStyle = 'rgba(138, 43, 226, 0.4)';
                ctx.lineWidth = 24;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = '#8a2be2';
                ctx.shadowBlur = 30;
                ctx.beginPath();
                ctx.moveTo(this.navPath[0].x, this.navPath[0].y);
                for (let i = 1; i < this.navPath.length; i++) {
                    ctx.lineTo(this.navPath[i].x, this.navPath[i].y);
                }
                ctx.stroke();
                
                // Middle glow
                ctx.strokeStyle = 'rgba(148, 0, 211, 0.7)';
                ctx.lineWidth = 12;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.moveTo(this.navPath[0].x, this.navPath[0].y);
                for (let i = 1; i < this.navPath.length; i++) {
                    ctx.lineTo(this.navPath[i].x, this.navPath[i].y);
                }
                ctx.stroke();
                
                // Core line with animated dash
                ctx.strokeStyle = '#da70d6';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 10;
                ctx.setLineDash([20, 15]);
                ctx.lineDashOffset = -dashOffset;
                ctx.beginPath();
                ctx.moveTo(this.navPath[0].x, this.navPath[0].y);
                for (let i = 1; i < this.navPath.length; i++) {
                    ctx.lineTo(this.navPath[i].x, this.navPath[i].y);
                }
                ctx.stroke();
                
                ctx.restore();
            }
            
            // Helper: Draw path segments (lines and curves)
            _drawPathSegments(ctx, segments) {
                ctx.beginPath();
                let started = false;
                
                for (const seg of segments) {
                    if (seg.type === 'line' && seg.points && seg.points.length >= 2) {
                        if (!started) {
                            ctx.moveTo(seg.points[0].x, seg.points[0].y);
                            started = true;
                        } else {
                            ctx.lineTo(seg.points[0].x, seg.points[0].y);
                        }
                        ctx.lineTo(seg.points[1].x, seg.points[1].y);
                    } else if (seg.type === 'curve' && seg.controlPoints) {
                        const cp = seg.controlPoints;
                        if (!started) {
                            ctx.moveTo(cp[0].x, cp[0].y);
                            started = true;
                        } else {
                            ctx.lineTo(cp[0].x, cp[0].y);
                        }
                        
                        if (cp.length === 3) {
                            // Quadratic bezier
                            ctx.quadraticCurveTo(cp[1].x, cp[1].y, cp[2].x, cp[2].y);
                        } else if (cp.length === 4) {
                            // Cubic bezier
                            ctx.bezierCurveTo(cp[1].x, cp[1].y, cp[2].x, cp[2].y, cp[3].x, cp[3].y);
                        }
                    }
                }
                
                ctx.stroke();
            }
            
            // --- BUILD SIMPLE ROAD-LEVEL PATH ---
            // Creates a path through intersection centers for clean map display
            _buildRoadLevelPath(player, network) {
                if (!this.navMarker) return [];
                
                const path = [];
                
                // Start: Player position projected to nearest road center
                const startRoad = network.findNearestRoadPoint?.(player.x, player.y);
                if (startRoad) {
                    path.push({ x: startRoad.x, y: startRoad.y, type: 'start' });
                } else {
                    path.push({ x: player.x, y: player.y, type: 'start' });
                }
                
                // Middle: Extract intersection centers from precise path
                if (this.precisePath) {
                    const seenIntersections = new Set();
                    for (const wp of this.precisePath) {
                        if (wp.intersection && !seenIntersections.has(wp.intersectionId)) {
                            seenIntersections.add(wp.intersectionId);
                            path.push({
                                x: wp.intersection.centerX,
                                y: wp.intersection.centerY,
                                type: 'intersection',
                                id: wp.intersectionId
                            });
                        }
                    }
                }
                
                // End: Destination projected to nearest road center
                const endRoad = network.findNearestRoadPoint?.(this.navMarker.x, this.navMarker.y);
                if (endRoad) {
                    path.push({ x: endRoad.x, y: endRoad.y, type: 'end' });
                } else {
                    path.push({ x: this.navMarker.x, y: this.navMarker.y, type: 'end' });
                }
                
                return path;
            }
            
            // --- DRAW ROAD-LEVEL PATH (Simple purple line on map) ---
            drawRoadLevelPath(ctx) {
                if (!this.roadLevelPath || this.roadLevelPath.length < 2) return;
                
                const time = _frameTimeSec;
                const dashOffset = time * 40; // Animated dash
                
                ctx.save();
                
                // Outer glow
                ctx.strokeStyle = 'rgba(138, 43, 226, 0.5)';
                ctx.lineWidth = 18;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = '#8a2be2';
                ctx.shadowBlur = 25;
                
                ctx.beginPath();
                ctx.moveTo(this.roadLevelPath[0].x, this.roadLevelPath[0].y);
                for (let i = 1; i < this.roadLevelPath.length; i++) {
                    ctx.lineTo(this.roadLevelPath[i].x, this.roadLevelPath[i].y);
                }
                ctx.stroke();
                
                // Middle layer
                ctx.strokeStyle = 'rgba(180, 100, 255, 0.7)';
                ctx.lineWidth = 10;
                ctx.shadowBlur = 15;
                
                ctx.beginPath();
                ctx.moveTo(this.roadLevelPath[0].x, this.roadLevelPath[0].y);
                for (let i = 1; i < this.roadLevelPath.length; i++) {
                    ctx.lineTo(this.roadLevelPath[i].x, this.roadLevelPath[i].y);
                }
                ctx.stroke();
                
                // Core line with animated dash
                ctx.strokeStyle = '#da70d6';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 8;
                ctx.setLineDash([20, 12]);
                ctx.lineDashOffset = -dashOffset;
                
                ctx.beginPath();
                ctx.moveTo(this.roadLevelPath[0].x, this.roadLevelPath[0].y);
                for (let i = 1; i < this.roadLevelPath.length; i++) {
                    ctx.lineTo(this.roadLevelPath[i].x, this.roadLevelPath[i].y);
                }
                ctx.stroke();
                
                ctx.restore();
            }
            
            // --- DEBUG: Draw car's actual navigation waypoints (cyan over purple) ---
            drawCarActualPath(ctx) {
                const car = this.game.car;
                if (!car || !car.navWaypoints || car.navWaypoints.length < 2) return;
                
                ctx.save();
                
                // Draw actual waypoints as cyan line
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
                ctx.lineWidth = 4;
                ctx.setLineDash([]);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                ctx.beginPath();
                ctx.moveTo(car.x, car.y);
                
                for (let i = car.currentWaypointIndex; i < car.navWaypoints.length; i++) {
                    const wp = car.navWaypoints[i];
                    ctx.lineTo(wp.x, wp.y);
                }
                ctx.stroke();
                
                // Draw waypoint markers
                for (let i = car.currentWaypointIndex; i < car.navWaypoints.length; i++) {
                    const wp = car.navWaypoints[i];
                    const isCurrent = (i === car.currentWaypointIndex);
                    
                    ctx.beginPath();
                    ctx.arc(wp.x, wp.y, isCurrent ? 10 : 5, 0, Math.PI * 2);
                    ctx.fillStyle = isCurrent ? '#00ffff' : 'rgba(0, 255, 255, 0.6)';
                    ctx.fill();
                    
                    // Label waypoints with type
                    if (isCurrent || wp.type === 'CURVE_POINT' || wp.type === 'TURN_PATH') {
                        ctx.fillStyle = '#fff';
                        ctx.font = '10px Orbitron';
                        ctx.fillText(`${i}:${wp.type || 'WP'}`, wp.x + 12, wp.y - 8);
                    }
                }
                
                ctx.setLineDash([]);
                ctx.restore();
            }
            
            // --- DRAW DIRECT DISTANCE LINE (White dashed line with distance) ---
            drawDistanceLine(ctx, iconScale) {
                if (!this.navMarker) return;
                
                const player = this.game.player;
                const marker = this.navMarker;
                
                // Calculate distance
                const distPixels = Math.hypot(marker.x - player.x, marker.y - player.y);
                const distMeters = Math.round(distPixels / 10); // 10 pixels = 1 meter (adjust as needed)
                
                ctx.save();
                
                // Animated dash for visual flow
                const time = _frameTimeSec;
                const dashOffset = time * 30;
                
                // Draw white dashed line from player to marker
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 3 * iconScale;
                ctx.setLineDash([15, 10]);
                ctx.lineDashOffset = -dashOffset;
                ctx.lineCap = 'round';
                
                ctx.beginPath();
                ctx.moveTo(player.x, player.y);
                ctx.lineTo(marker.x, marker.y);
                ctx.stroke();
                
                // Draw distance label at midpoint
                const midX = (player.x + marker.x) / 2;
                const midY = (player.y + marker.y) / 2;
                
                // Format distance nicely
                let distText;
                if (distMeters >= 1000) {
                    distText = (distMeters / 1000).toFixed(1) + ' km';
                } else {
                    distText = distMeters + ' m';
                }
                
                // Background pill for text
                const fontSize = 52 * iconScale;
                ctx.font = `bold ${fontSize}px Orbitron`;
                const textWidth = ctx.measureText(distText).width;
                const pillPadding = 8 * iconScale;
                const pillHeight = fontSize + pillPadding * 2;
                const pillWidth = textWidth + pillPadding * 3;
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                ctx.beginPath();
                ctx.roundRect(midX - pillWidth/2, midY - pillHeight/2, pillWidth, pillHeight, 4 * iconScale);
                ctx.fill();
                
                // Border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1 * iconScale;
                ctx.setLineDash([]);
                ctx.stroke();
                
                // Distance text
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(distText, midX, midY);
                
                ctx.restore();
            }
            
            // --- DRAW NAVIGATION MARKER (Ruby Colored) ---
            drawNavMarker(ctx, iconScale) {
                if (!this.navMarker) return;
                
                const time = _frameTime;
                const pulse = (Math.sin(time / 300) + 1) / 2;
                
                ctx.save();
                ctx.translate(this.navMarker.x, this.navMarker.y);
                
                // Ruby glow
                ctx.shadowColor = '#e0115f'; // Ruby red
                ctx.shadowBlur = 25 + pulse * 15;
                
                // Outer ring (pulsing)
                const ringSize = (40 + pulse * 10) * iconScale;
                ctx.strokeStyle = `rgba(224, 17, 95, ${0.6 + pulse * 0.3})`; // Ruby
                ctx.lineWidth = 4 * iconScale;
                ctx.beginPath();
                ctx.arc(0, 0, ringSize, 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner diamond marker
                ctx.fillStyle = '#e0115f'; // Ruby
                ctx.beginPath();
                const diamondSize = 20 * iconScale;
                ctx.moveTo(0, -diamondSize);
                ctx.lineTo(diamondSize * 0.6, 0);
                ctx.lineTo(0, diamondSize);
                ctx.lineTo(-diamondSize * 0.6, 0);
                ctx.closePath();
                ctx.fill();
                
                // White center dot
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.arc(0, 0, 5 * iconScale, 0, Math.PI * 2);
                ctx.fill();
                
                // Label
                if (this.mapView.zoom > 1.2) {
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${55 * iconScale}px Orbitron`;
                    ctx.textAlign = 'center';
                    ctx.fillText("DESTINATION", 0, -ringSize - 20 * iconScale);
                }
                
                ctx.restore();
            }
            
            // --- DRAW MAP LEGEND ---
            drawMapLegend(ctx, w, h) {
                const padding = 15;
                const legendWidth = 160;
                const legendHeight = 160;
                const x = w - legendWidth - padding;
                const y = padding;
                
                ctx.save();
                
                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.strokeStyle = 'rgba(205, 127, 50, 0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(x, y, legendWidth, legendHeight, 8);
                ctx.fill();
                ctx.stroke();
                
                // Title
                ctx.fillStyle = '#cd7f32';
                ctx.font = 'bold 12px Orbitron';
                ctx.textAlign = 'left';
                ctx.fillText('LEGEND', x + 10, y + 20);
                
                // Legend items
                const items = [
                    { color: '#E6E6FA', label: 'You', shape: 'triangle' },
                    { color: '#ff3366', label: 'Your Vehicle', shape: 'rect' },
                    { color: '#e0115f', label: 'Destination', shape: 'diamond' },
                    { color: '#FFD700', label: 'NPC', shape: 'circle' },
                    { color: '#8f99fb', label: 'Transition', shape: 'circle' },
                    { color: '#ff2200', label: 'Danger Zone', shape: 'hazard' }
                ];
                
                let itemY = y + 38;
                for (let item of items) {
                    // Icon
                    ctx.fillStyle = item.color;
                    ctx.shadowColor = item.color;
                    ctx.shadowBlur = 5;
                    
                    if (item.shape === 'triangle') {
                        ctx.beginPath();
                        ctx.moveTo(x + 18, itemY - 4);
                        ctx.lineTo(x + 12, itemY + 4);
                        ctx.lineTo(x + 24, itemY + 4);
                        ctx.closePath();
                        ctx.fill();
                    } else if (item.shape === 'rect') {
                        ctx.fillRect(x + 10, itemY - 4, 16, 8);
                    } else if (item.shape === 'diamond') {
                        ctx.beginPath();
                        ctx.moveTo(x + 18, itemY - 5);
                        ctx.lineTo(x + 23, itemY);
                        ctx.lineTo(x + 18, itemY + 5);
                        ctx.lineTo(x + 13, itemY);
                        ctx.closePath();
                        ctx.fill();
                    } else if (item.shape === 'hazard') {
                        // Dashed square icon
                        ctx.strokeStyle = item.color;
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([3, 2]);
                        ctx.strokeRect(x + 10, itemY - 5, 16, 10);
                        ctx.setLineDash([]);
                        // Small warning symbol inside
                        ctx.font = 'bold 8px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('⚠', x + 18, itemY + 3);
                    } else {
                        ctx.beginPath();
                        ctx.arc(x + 18, itemY, 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    // Label
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#ddd';
                    ctx.font = '10px Montserrat';
                    ctx.fillText(item.label, x + 35, itemY + 3);
                    
                    itemY += 20;
                }
                
                ctx.restore();
            }
            
            // --- DRAW ZOOM READOUT ---
            drawZoomReadout(ctx, w, h) {
                const padding = 15;
                
                ctx.save();
                
                // Background pill
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.strokeStyle = 'rgba(205, 127, 50, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(padding, h - 40, 90, 28, 5);
                ctx.fill();
                ctx.stroke();
                
                // Zoom text
                ctx.fillStyle = '#cd7f32';
                ctx.font = 'bold 12px Orbitron';
                ctx.textAlign = 'left';
                ctx.fillText(`${this.mapView.zoom.toFixed(1)}x`, padding + 12, h - 21);
                
                // Zoom icon
                ctx.fillStyle = '#888';
                ctx.font = '14px sans-serif';
                ctx.fillText('🔍', padding + 55, h - 20);
                
                ctx.restore();
            }
        
            // Inside UISystem class
        
            // --- 2. THE VIEWPORT-EXTENDED CACHE RENDERER ---
            // Renders static geometry (walls, roads, buildings, labels) into a
            // canvas sized to the viewport+buffer, at current display scale. Only
            // geometry whose AABB intersects the cache region gets drawn — the
            // expensive shadowBlur / lighter-composite road passes are confined
            // to roughly one screenful instead of the entire map.
            updateMapCache(visibleX, visibleY, visibleW, visibleH, finalScale) {
                const mapData = this.game.activeMap;
                
                // 50% buffer on each side → cache is 2× viewport in each dim.
                // Pan up to one viewport before triggering a rebuild.
                const bufferX = visibleW * 0.5;
                const bufferY = visibleH * 0.5;
                const cacheBoundsX = visibleX - bufferX;
                const cacheBoundsY = visibleY - bufferY;
                const cacheBoundsW = visibleW + bufferX * 2;
                const cacheBoundsH = visibleH + bufferY * 2;
                
                // Cache canvas in display pixels. Clamp to a sane max in case of
                // extreme high-DPR or unusual viewport — typical is ~2k×3k.
                const MAX_CACHE_DIM = 4096;
                let canvasW = Math.ceil(cacheBoundsW * finalScale);
                let canvasH = Math.ceil(cacheBoundsH * finalScale);
                let effectiveScale = finalScale;
                if (canvasW > MAX_CACHE_DIM || canvasH > MAX_CACHE_DIM) {
                    const ratio = Math.min(MAX_CACHE_DIM / canvasW, MAX_CACHE_DIM / canvasH);
                    canvasW = Math.ceil(canvasW * ratio);
                    canvasH = Math.ceil(canvasH * ratio);
                    effectiveScale = finalScale * ratio;
                }
                
                this.cacheCanvas.width = canvasW;
                this.cacheCanvas.height = canvasH;
                
                this.cacheBoundsMap = { x: cacheBoundsX, y: cacheBoundsY, w: cacheBoundsW, h: cacheBoundsH };
                this.cacheFinalScale = effectiveScale;
                this.cacheMapId = mapData.id || null;
                this.isCacheDirty = false;
                
                const ctx = this.cacheCtx;
                
                // Map-space → cache pixels. After this transform, drawing at map
                // coords (e.g. road.x1, road.y1) lands at the right cache pixel.
                ctx.setTransform(
                    effectiveScale, 0, 0, effectiveScale,
                    -cacheBoundsX * effectiveScale,
                    -cacheBoundsY * effectiveScale
                );
                
                // AABB intersect helper — generous PAD covers line widths + glow
                // bleed so we don't clip half-drawn roads at the cache edge.
                const PAD = 100;
                const intersects = (rx, ry, rw, rh) => (
                    rx + rw + PAD >= cacheBoundsX &&
                    rx - PAD <= cacheBoundsX + cacheBoundsW &&
                    ry + rh + PAD >= cacheBoundsY &&
                    ry - PAD <= cacheBoundsY + cacheBoundsH
                );
                
                ctx.lineCap = 'round';
                
                // --- WALLS (Universal) ---
                if (mapData.walls) {
                    ctx.lineWidth = 6;
                    mapData.walls.forEach(w => {
                        if (!intersects(w.x, w.y, w.w, w.h)) return;
                        ctx.fillStyle = '#4a2c18';
                        ctx.fillRect(w.x, w.y, w.w, w.h);
                        ctx.strokeStyle = '#cd7f32';
                        ctx.strokeRect(w.x, w.y, w.w, w.h);
                    });
                }
                
                // --- OUTDOOR MAPS (Buildings + Roads + Labels) ---
                if (mapData.type !== 'indoor') {
                    // 1. Buildings (bottom layer)
                    if (mapData.buildings) {
                        ctx.lineWidth = 6;
                        mapData.buildings.forEach(b => {
                            if (!intersects(b.x, b.y, b.w, b.h)) return;
                            ctx.fillStyle = '#4a2c18';
                            ctx.fillRect(b.x, b.y, b.w, b.h);
                            ctx.strokeStyle = '#cd7f32';
                            ctx.strokeRect(b.x, b.y, b.w, b.h);
                        });
                    }
                    
                    // 2. Roads — pre-filter to only those touching the cache region.
                    // Three-pass paint (red base, lighter orange core, gold hotspot
                    // with shadowBlur) is the most expensive part of the whole render;
                    // culling here is what makes large maps cheap.
                    const roadIntersects = (r) => {
                        const minX = Math.min(r.x1, r.x2);
                        const minY = Math.min(r.y1, r.y2);
                        const maxX = Math.max(r.x1, r.x2);
                        const maxY = Math.max(r.y1, r.y2);
                        return intersects(minX, minY, maxX - minX, maxY - minY);
                    };
                    const visibleRoads = this.game.traffic.network.roads.filter(roadIntersects);
                    
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.lineWidth = 120;
                    ctx.strokeStyle = '#550000';
                    visibleRoads.forEach(r => this.drawRoadLine(ctx, r));
                    
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.lineWidth = 60;
                    ctx.strokeStyle = '#ff4500';
                    visibleRoads.forEach(r => this.drawRoadLine(ctx, r));
                    
                    ctx.lineWidth = 20;
                    ctx.strokeStyle = '#FFD700';
                    ctx.shadowColor = '#FFD700';
                    ctx.shadowBlur = 20;
                    visibleRoads.forEach(r => this.drawRoadLine(ctx, r));
                    
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.shadowBlur = 0;
                    
                    // Building and road labels are NOT rendered into the cache.
                    // They live on a separate text layer drawn in screen-space at
                    // a screen-fixed font size — see drawMapTextLayer() in
                    // renderGoldenMap. This keeps text always crisp regardless
                    // of zoom and lets us tier visibility (hide labels when zoomed
                    // out far enough that they'd be cluttered or unreadable).
                }
                
                // Reset transform so subsequent direct cache writes (if any) start fresh.
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
        
            renderGoldenMap() {
                const ctx = this.mapCtx;
                const w = this.mapCanvas.width;
                const h = this.mapCanvas.height;
                const mapData = this.game.activeMap;
                
                // Auto-Fit Calculation
                const scaleX = w / mapData.width;
                const scaleY = h / mapData.height;
                const baseScale = Math.min(scaleX, scaleY) * 0.9;
                const finalScale = baseScale * this.mapView.zoom;
                
                const mapVisualWidth = mapData.width * finalScale;
                const mapVisualHeight = mapData.height * finalScale;
                
                // Where the map's (0,0) lands on the screen
                const screenOriginX = (w - mapVisualWidth) / 2 + this.mapView.offsetX;
                const screenOriginY = (h - mapVisualHeight) / 2 + this.mapView.offsetY;
                
                // Visible region in map-space — derived by inverse-transforming the
                // canvas corners back through the pan/zoom.
                const visibleX = -screenOriginX / finalScale;
                const visibleY = -screenOriginY / finalScale;
                const visibleW = w / finalScale;
                const visibleH = h / finalScale;
                
                // Cache valid if: same map, same scale (within tolerance), and
                // the visible region is fully inside cacheBoundsMap. Pan stays
                // free until the visible window touches a cache edge.
                const SCALE_TOL = 0.0005;
                const b = this.cacheBoundsMap;
                const cacheValid = !this.isCacheDirty &&
                    this.cacheMapId === mapData.id &&
                    b !== null &&
                    Math.abs(this.cacheFinalScale - finalScale) < SCALE_TOL &&
                    visibleX >= b.x &&
                    visibleY >= b.y &&
                    visibleX + visibleW <= b.x + b.w &&
                    visibleY + visibleH <= b.y + b.h;
                
                if (!cacheValid) {
                    this.updateMapCache(visibleX, visibleY, visibleW, visibleH, finalScale);
                }
                
                // 1. Clear screen
                ctx.fillStyle = '#020103';
                ctx.fillRect(0, 0, w, h);
                
                // 2. Blit cache at the screen position corresponding to
                //    cacheBoundsMap's top-left in map-space.
                //    Round to integer pixels to avoid sub-pixel filtering smear during pan.
                const cacheScreenX = Math.round(screenOriginX + this.cacheBoundsMap.x * finalScale);
                const cacheScreenY = Math.round(screenOriginY + this.cacheBoundsMap.y * finalScale);
                // If MAX_CACHE_DIM clamping reduced effective scale, the cache pixels
                // need to be drawn at a slightly different size to land correctly.
                // Compute target screen size from cache canvas dims and effective scale.
                const cacheDrawW = this.cacheCanvas.width * (finalScale / this.cacheFinalScale);
                const cacheDrawH = this.cacheCanvas.height * (finalScale / this.cacheFinalScale);
                ctx.drawImage(this.cacheCanvas, cacheScreenX, cacheScreenY, cacheDrawW, cacheDrawH);
                
                // 3. Text layer — building/road labels drawn at screen-fixed size
                //    with zoom-tiered visibility. Stays crisp regardless of zoom
                //    because text is rendered fresh each frame in display space.
                this.drawMapTextLayer(ctx, w, h, screenOriginX, screenOriginY, finalScale);
                
                // 4. SCANLINES (on top of everything)
                this.drawScanlines(ctx, w, h);
                
                // 5. MAP LEGEND (Top-right, overlays scanlines)
                this.drawMapLegend(ctx, w, h);
                
                // 6. ZOOM LEVEL READOUT (Bottom-left)
                this.drawZoomReadout(ctx, w, h);
                
                // NOTE: Animated icons (player, NPCs, nav markers, etc.) are drawn
                // on a separate icon canvas layer via animateIcons() at 60fps
            }
        
            // ── MAP TEXT LAYER ──
            // Renders building and road labels in screen-space at fixed font size.
            // Three zoom tiers control visibility — at low zoom there's no label
            // text at all (would be cluttered or unreadable); at moderate zoom
            // building labels appear; at high zoom road names appear too.
            //
            // Because rendering happens in display coordinates each frame, text
            // is always pixel-crisp regardless of zoom level. Cost is low because
            // text rendering is fast and we cull anything off-screen.
            drawMapTextLayer(ctx, w, h, screenOriginX, screenOriginY, finalScale) {
                const mapData = this.game.activeMap;
                if (!mapData || mapData.type === 'indoor') return;
                
                // Zoom tier thresholds (tune as needed)
                const ZOOM_BUILDINGS = 1.6;  // Below this, no building labels
                const ZOOM_ROADS = 2.4;      // Below this, no road labels
                const zoom = this.mapView.zoom;
                
                const showBuildings = zoom >= ZOOM_BUILDINGS && mapData.buildings;
                const showRoads = zoom >= ZOOM_ROADS;
                if (!showBuildings && !showRoads) return;
                
                // Convert a map-space (mx, my) point to screen pixels
                const toScreenX = (mx) => screenOriginX + mx * finalScale;
                const toScreenY = (my) => screenOriginY + my * finalScale;
                
                // Screen-space AABB cull — skip labels outside the canvas
                const onScreen = (sx, sy, halfW, halfH) => (
                    sx + halfW >= 0 && sx - halfW <= w &&
                    sy + halfH >= 0 && sy - halfH <= h
                );
                
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // ── BUILDING LABELS ──
                if (showBuildings) {
                    // Font size eases up with zoom — at threshold 1.6× a ~14px
                    // label is comfortable; at max 5× a ~22px label feels right
                    // without dominating the map.
                    const fontPx = Math.round(7 + (zoom - ZOOM_BUILDINGS) * 2.5);
                    ctx.font = `bold ${fontPx}px Orbitron, sans-serif`;
                    
                    mapData.buildings.forEach(b => {
                        if (!b.label || !b.label.trim()) return;
                        const sx = toScreenX(b.x + b.w / 2);
                        const sy = toScreenY(b.y + b.h / 2);
                        if (!onScreen(sx, sy, 80, 20)) return;
                        const text = b.label.toUpperCase();
                        // Glow pass
                        ctx.shadowColor = '#ffaa00';
                        ctx.shadowBlur = 8;
                        ctx.fillStyle = '#ffcc44';
                        ctx.fillText(text, sx, sy);
                        // Sharp overlay
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = '#fff8e0';
                        ctx.fillText(text, sx, sy);
                    });
                }
                
                // ── ROAD LABELS ──
                if (showRoads) {
                    const fontPx = Math.round(6 + (zoom - ZOOM_ROADS) * 2);
                    ctx.font = `bold ${fontPx}px Orbitron, sans-serif`;
                    const LABEL_SPACING = 600; // Map-space spacing between repeats on long roads
                    
                    this.game.traffic.network.roads.forEach(road => {
                        if (!road.name || !road.name.trim()) return;
                        const isH = road.orientation === 'H';
                        const longDim = isH ? road.w : road.h;
                        const labelCount = Math.max(1, Math.round(longDim / LABEL_SPACING));
                        const angle = isH ? 0 : -Math.PI / 2;
                        const text = road.name.toUpperCase();
                        const textWidth = ctx.measureText(text).width;
                        
                        for (let i = 0; i < labelCount; i++) {
                            const t = (i + 0.5) / labelCount;
                            const mx = isH ? (road.x + road.w * t) : (road.x + road.w / 2);
                            const my = isH ? (road.y + road.h / 2) : (road.y + road.h * t);
                            const sx = toScreenX(mx);
                            const sy = toScreenY(my);
                            // Generous cull radius — accounts for rotated bounding box
                            if (!onScreen(sx, sy, textWidth / 2 + 20, 20)) continue;
                            
                            ctx.save();
                            ctx.translate(sx, sy);
                            ctx.rotate(angle);
                            // Dark pill background for readability over road glow
                            const padY = Math.ceil(fontPx * 0.65);
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                            ctx.beginPath();
                            ctx.roundRect(-textWidth/2 - 8, -padY, textWidth + 16, padY * 2, 6);
                            ctx.fill();
                            // Glow pass
                            ctx.shadowColor = '#ff8800';
                            ctx.shadowBlur = 6;
                            ctx.fillStyle = '#ffaa44';
                            ctx.fillText(text, 0, 0);
                            // Sharp overlay
                            ctx.shadowBlur = 0;
                            ctx.fillStyle = '#ffeedd';
                            ctx.fillText(text, 0, 0);
                            ctx.restore();
                        }
                    });
                }
                
                ctx.restore();
            }
            
            drawRoadLine(ctx, road) {
                ctx.beginPath();
                ctx.moveTo(road.x1, road.y1);
                ctx.lineTo(road.x2, road.y2);
                ctx.stroke();
            }
        
            drawScanlines(ctx, w, h) {
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                for(let i=0; i<h; i+=4) { ctx.fillRect(0, i, w, 1); }
            }
        
            toggleMap(show) {
                const mapUI = document.getElementById('map-interface');
                mapUI.style.display = show ? 'block' : 'none';
                if (show) this.game.pauseSystem.acquire('map_ui');
                else this.game.pauseSystem.release('map_ui');
                
                // Mark cache dirty ONLY if the current map differs from the one
                // the cache was built for. Static geometry (roads, walls, buildings,
                // labels) is invariant while on the same map, so reusing the cache
                // across opens is safe. Dynamic content (player position, traffic,
                // nav markers) is drawn on a separate icon canvas at 60fps.
                if(show) {
                    const currentMapId = this.game.activeMap?.id || null;
                    if (currentMapId !== this.cacheMapId) {
                        this.isCacheDirty = true;
                    }
                    this.resizeMap(); // Ensure icon canvas is sized
                    this.centerOnPlayer(); // Center map on player when opening
                    this.renderGoldenMap();
                    this.startIconAnimation(); // Start animating icons
                    this.game.renderSidebarPortrait();
                    
                    // Update nav highlight
                    if (typeof mapSidebar !== 'undefined') {
                        mapSidebar.setActiveNav('map');
                    }
                } else {
                    this.stopIconAnimation(); // Stop animation when map closes
                }
            }
            
            // --- ICON ANIMATION LOOP ---
            startIconAnimation() {
                if (this.isAnimating) return;
                this.isAnimating = true;
                this.animateIcons();
            }
            
            stopIconAnimation() {
                this.isAnimating = false;
                if (this.animationFrameId) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.animationFrameId = null;
                }
            }
            
            animateIcons() {
                if (!this.isAnimating) return;
                
                const ctx = this.iconCtx;
                const w = this.iconCanvas.width;
                const h = this.iconCanvas.height;
                const mapData = this.game.activeMap;
                
                // Get filter state from map sidebar
                let filterEnabled = false;
                let activeFilter = null;
                if (typeof mapSidebar !== 'undefined') {
                    filterEnabled = mapSidebar.filterEnabled;
                    activeFilter = mapSidebar.activeFilter;
                }
                
                // Helper to check if a marker category should be shown
                const shouldShow = (category) => {
                    if (!filterEnabled) return true; // Filter OFF = show all
                    return activeFilter === category;
                };
                
                // Clear icon layer
                ctx.clearRect(0, 0, w, h);
                
                // Calculate transform (same as main map)
                const scaleX = w / mapData.width;
                const scaleY = h / mapData.height;
                const baseScale = Math.min(scaleX, scaleY) * 0.9;
                const finalScale = baseScale * this.mapView.zoom;
                const mapVisualWidth = mapData.width * finalScale;
                const mapVisualHeight = mapData.height * finalScale;
                const iconScale = 1 / finalScale * (w / 1920);
                
                ctx.save();
                ctx.translate((w - mapVisualWidth) / 2 + this.mapView.offsetX, (h - mapVisualHeight) / 2 + this.mapView.offsetY);
                ctx.scale(finalScale, finalScale);
                
                // --- DRAW ANIMATED ICONS ---
                
                // 1. Transition Points (Always visible - essential navigation)
                if (mapData.transitions) {
                    const t = _frameTime / 300;
                    const pulse = 1 + Math.sin(t) * 0.3;
                    ctx.fillStyle = '#8f99fb'; ctx.shadowColor = '#8f99fb'; ctx.shadowBlur = 15;
                    mapData.transitions.forEach(trans => {
                        ctx.beginPath();
                        ctx.arc(trans.x + trans.w/2, trans.y + trans.h/2, 25*iconScale*pulse, 0, Math.PI*2);
                        ctx.fill();
                    });
                    ctx.shadowBlur = 0;
                }
                
                // 2. Navigation Path (Simple road-level path - player set)
                this.drawRoadLevelPath(ctx);
                
                // 2b. DEBUG: Draw car's actual waypoints (cyan over purple)
                this.drawCarActualPath(ctx);
                
                // 3. Distance Line (Always visible)
                this.drawDistanceLine(ctx, iconScale);
                
                // 4. Navigation Marker (Always visible - player set)
                this.drawNavMarker(ctx, iconScale);
                
                // 5. NPCs (Filtered: clients)
                if (this.game.npcs && shouldShow('clients')) {
                    const npcPulse = 0.8 + Math.sin(_frameTime / 400) * 0.2;
                    ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10 + npcPulse * 8;
                    this.game.npcs.forEach(npc => {
                        ctx.beginPath();
                        ctx.arc(npc.x, npc.y, 15 * iconScale * npcPulse, 0, Math.PI*2);
                        ctx.fill();
                    });
                    ctx.shadowBlur = 0;
                }
                
                // 6. Pedestrians (Always visible - ambient)
                if (this.game.pedestrians && this.game.pedestrians.pedestrians && !filterEnabled) {
                    const pedPulse = 0.9 + Math.sin(_frameTime / 600) * 0.1;
                    ctx.fillStyle = '#88aacc'; ctx.shadowColor = '#88aacc'; ctx.shadowBlur = 5;
                    this.game.pedestrians.pedestrians.forEach(ped => {
                        if (!ped.dead) {
                            ctx.beginPath();
                            ctx.arc(ped.x, ped.y, 8 * iconScale * pedPulse, 0, Math.PI*2);
                            ctx.fill();
                        }
                    });
                    ctx.shadowBlur = 0;
                }
                
                // 7. Owned Car (Always visible - player's vehicle)
                if (this.game.ownedCar && this.game.ownedCar.visible) {
                    const car = this.game.ownedCar;
                    const carPulse = 0.9 + Math.sin(_frameTime / 500) * 0.1;
                    ctx.save();
                    ctx.translate(car.x, car.y);
                    ctx.rotate(car.angle);
                    ctx.fillStyle = '#ff3366'; ctx.shadowColor = '#ff3366'; ctx.shadowBlur = 15 + carPulse * 10;
                    const carW = 26 * iconScale; const carL = 52 * iconScale;
                    ctx.beginPath(); ctx.roundRect(-carL/2, -carW/2, carL, carW, 4); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.shadowBlur = 5;
                    ctx.fillRect(carL/2 - 2, -carW/2 + 2, 4, 6);
                    ctx.fillRect(carL/2 - 2, carW/2 - 8, 4, 6);
                    ctx.restore();
                }
                
                // 8. Home Base / Spawn Point (Filtered: homebases)
                if (shouldShow('homebases')) {
                    // Try to get the parking_spot landmark (building location)
                    // Fallback to spawn point if not available
                    let homeX, homeY;
                    if (this.game.landmarkRegistry && this.game.landmarkRegistry['parking_spot']) {
                        const landmark = this.game.landmarkRegistry['parking_spot'];
                        homeX = landmark.x;
                        homeY = landmark.y;
                    } else if (mapData.spawn) {
                        homeX = mapData.spawn.x;
                        homeY = mapData.spawn.y;
                    } else {
                        return; // No location to draw
                    }
                    
                    const hbPulse = 0.9 + Math.sin(_frameTime / 600) * 0.15;
                    
                    // House icon - green with white glow
                    ctx.fillStyle = '#00ff88'; 
                    ctx.shadowColor = '#00ff88'; 
                    ctx.shadowBlur = 20 + hbPulse * 10;
                    
                    // Draw a simple house shape
                    const size = 40 * iconScale * hbPulse;
                    ctx.beginPath();
                    // Roof (triangle)
                    ctx.moveTo(homeX, homeY - size * 0.8);
                    ctx.lineTo(homeX - size * 0.7, homeY - size * 0.1);
                    ctx.lineTo(homeX + size * 0.7, homeY - size * 0.1);
                    ctx.closePath();
                    ctx.fill();
                    // Base (rectangle)
                    ctx.fillRect(homeX - size * 0.5, homeY - size * 0.1, size, size * 0.8);
                    
                    // Door
                    ctx.fillStyle = '#006633';
                    ctx.fillRect(homeX - size * 0.15, homeY + size * 0.2, size * 0.3, size * 0.5);
                    
                    ctx.shadowBlur = 0;
                }
                
                // 9. Objective Marker (Filtered: missions) - Golden objective marker
                if (shouldShow('missions')) {
                    this.drawObjectiveMarker(ctx);
                }
                
                // 9. Player Marker (Animated pulse)
                const p = this.game.player;
                const playerPulse = 0.9 + Math.sin(_frameTime / 350) * 0.15;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = '#E6E6FA'; ctx.shadowColor = '#E6E6FA'; ctx.shadowBlur = 15 + playerPulse * 15;
                const size = 50 * iconScale * playerPulse;
                ctx.beginPath();
                ctx.moveTo(size, 0);
                ctx.lineTo(-size/2, -size/2);
                ctx.lineTo(-size/4, 0);
                ctx.lineTo(-size/2, size/2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                
                // 10. RESTRICTED ZONE — Crimson danger area with pulsing hazard border
                // Always visible — critical gameplay landmark, not filtered
                if (this.game.restrictedZone) {
                    const rz = this.game.restrictedZone;
                    const t = _frameTime / 400;
                    const pulse = 0.9 + Math.sin(t) * 0.15;
                    const cx = rz.x + rz.w / 2;
                    const cy = rz.y + rz.h / 2;
                    
                    ctx.save();
                    
                    // Layer 1: Deep crimson fill over the zone
                    ctx.fillStyle = rz.cleared ? 'rgba(40, 10, 0, 0.25)' : 'rgba(120, 0, 0, 0.3)';
                    ctx.fillRect(rz.x, rz.y, rz.w, rz.h);
                    
                    // Layer 2: Inner glow (brighter when hostiles active)
                    ctx.globalCompositeOperation = 'lighter';
                    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rz.w, rz.h) * 0.5);
                    if (rz.active && !rz.cleared) {
                        grad.addColorStop(0, 'rgba(255, 30, 0, 0.12)');
                        grad.addColorStop(0.6, 'rgba(180, 0, 0, 0.06)');
                        grad.addColorStop(1, 'rgba(80, 0, 0, 0)');
                    } else {
                        grad.addColorStop(0, 'rgba(200, 60, 0, 0.06)');
                        grad.addColorStop(1, 'rgba(60, 0, 0, 0)');
                    }
                    ctx.fillStyle = grad;
                    ctx.fillRect(rz.x, rz.y, rz.w, rz.h);
                    ctx.globalCompositeOperation = 'source-over';
                    
                    // Layer 3: Pulsing hazard border
                    ctx.strokeStyle = rz.cleared ? 'rgba(200, 80, 0, 0.35)' : `rgba(255, 30, 0, ${0.4 + Math.sin(t * 1.5) * 0.2})`;
                    ctx.lineWidth = 6 * pulse;
                    ctx.setLineDash([20, 12]);
                    ctx.lineDashOffset = _frameTime / 50;
                    ctx.strokeRect(rz.x, rz.y, rz.w, rz.h);
                    ctx.setLineDash([]);
                    
                    // Layer 4: Skull / danger icon at center
                    const iconSize = 35 * iconScale * pulse;
                    ctx.fillStyle = rz.cleared ? '#cc6600' : '#ff2200';
                    ctx.shadowColor = rz.cleared ? '#cc6600' : '#ff2200';
                    ctx.shadowBlur = 12 + pulse * 8;
                    ctx.font = `bold ${Math.round(iconSize * 1.2)}px Orbitron`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚠', cx, cy);
                    
                    // Label below icon
                    ctx.shadowBlur = 4;
                    ctx.font = `bold ${Math.round(iconSize * 0.5)}px Orbitron`;
                    ctx.fillStyle = '#ffaa44';
                    ctx.fillText(rz.name, cx, cy + iconSize * 0.9);
                    
                    // Clear count badge (if cleared at least once)
                    if (rz.clearCount > 0) {
                        ctx.font = `bold ${Math.round(iconSize * 0.4)}px Orbitron`;
                        ctx.fillStyle = '#ff8800';
                        ctx.fillText(`×${rz.clearCount} CLEARED`, cx, cy + iconSize * 1.5);
                    }
                    
                    ctx.shadowBlur = 0;
                    ctx.restore();
                }
                
                // 11. Side Quest Mission Area (Textured red circle — no outline)
                // Uses molten road-style layered fill similar to golden map roads
                if (shouldShow('missions')) {
                    const m = this.game.missions?.activeMission;
                    if (m && m.status === 'active') {
                        let sqx, sqy;
                        const mRadius = m.targetRadius || 100;
                        
                        // Determine target position
                        if (m.type === MISSION_TYPES.DELIVERY && !m.pickedUp && this.game.deliveryVehicle) {
                            sqx = this.game.deliveryVehicle.x;
                            sqy = this.game.deliveryVehicle.y;
                        } else {
                            sqx = m.targetX;
                            sqy = m.targetY;
                        }
                        
                        if (sqx !== undefined && sqy !== undefined) {
                            const t = _frameTime / 600;
                            const pulse = 1 + Math.sin(t) * 0.08;
                            const radius = (mRadius * iconScale) * pulse;
                            
                            ctx.save();
                            
                            // Layer 1: Deep red base fill
                            ctx.globalCompositeOperation = 'source-over';
                            ctx.fillStyle = 'rgba(85, 0, 0, 0.35)';
                            ctx.beginPath();
                            ctx.arc(sqx, sqy, radius, 0, Math.PI * 2);
                            ctx.fill();
                            
                            // Layer 2: Orange mid-tone with lighter blend
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.fillStyle = 'rgba(255, 69, 0, 0.12)';
                            ctx.beginPath();
                            ctx.arc(sqx, sqy, radius * 0.75, 0, Math.PI * 2);
                            ctx.fill();
                            
                            // Layer 3: Inner gold hotspot
                            ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
                            ctx.beginPath();
                            ctx.arc(sqx, sqy, radius * 0.4, 0, Math.PI * 2);
                            ctx.fill();
                            
                            // Layer 4: Noise texture — scattered micro-dots for that molten look
                            ctx.globalCompositeOperation = 'source-over';
                            const dotCount = Math.floor(radius * 0.6);
                            for (let d = 0; d < dotCount; d++) {
                                const angle = (d / dotCount) * Math.PI * 2 + t * 0.3;
                                const dist = Math.random() * radius * 0.9;
                                const dx = sqx + Math.cos(angle) * dist;
                                const dy = sqy + Math.sin(angle) * dist;
                                const dotAlpha = 0.08 + Math.random() * 0.12;
                                ctx.fillStyle = `rgba(255, ${Math.floor(80 + Math.random() * 80)}, 0, ${dotAlpha})`;
                                ctx.fillRect(dx - 1, dy - 1, 2 + Math.random() * 2, 2 + Math.random() * 2);
                            }
                            
                            // Layer 5: Soft radial edge glow (no hard outline)
                            const gradient = ctx.createRadialGradient(sqx, sqy, radius * 0.7, sqx, sqy, radius);
                            gradient.addColorStop(0, 'rgba(255, 69, 0, 0)');
                            gradient.addColorStop(0.8, 'rgba(180, 30, 0, 0.08)');
                            gradient.addColorStop(1, 'rgba(100, 0, 0, 0.2)');
                            ctx.globalCompositeOperation = 'source-over';
                            ctx.fillStyle = gradient;
                            ctx.beginPath();
                            ctx.arc(sqx, sqy, radius, 0, Math.PI * 2);
                            ctx.fill();
                            
                            ctx.restore();
                        }
                    }
                }
                
                // 11. Story Objective Marker (Beautiful Red with White Stroke) - Filtered: missions
                if (shouldShow('missions')) {
                    const stepData = this.game.story?.currentStepData;
                    if (stepData && stepData.targetMap === mapData.id) {
                        let tx, ty;
                        
                        // Resolve coordinates from landmark or direct target
                        if (typeof stepData.target === 'string') {
                            const loc = this.game.getLandmark(stepData.target);
                            if (loc) { tx = loc.x; ty = loc.y; }
                        } else if (stepData.target) {
                            tx = stepData.target.x; 
                            ty = stepData.target.y;
                        } else if (typeof stepData.targetX === 'number') {
                            tx = stepData.targetX;
                            ty = stepData.targetY;
                        }
                        
                        if (tx !== undefined && ty !== undefined) {
                            const t = _frameTime / 200;
                            const pulse = 1 + Math.sin(t) * 0.2;
                            
                            // Semi-transparent red fill with white stroke
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 8 * iconScale;
                            ctx.fillStyle = 'rgba(170, 0, 0, 0.4)';
                            ctx.shadowColor = '#ff0000';
                            ctx.shadowBlur = 30;
                            
                            ctx.beginPath();
                            ctx.arc(tx, ty, (80 * iconScale) * pulse, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.stroke();
                            ctx.shadowBlur = 0;
                        }
                    }
                }
                
                ctx.restore();
                
                // Continue animation
                this.animationFrameId = requestAnimationFrame(() => this.animateIcons());
            }
            
            // Center the map view on the player's current position
            centerOnPlayer() {
                const mapData = this.game.activeMap;
                const player = this.game.player;
                const w = this.mapCanvas.width;
                const h = this.mapCanvas.height;
                
                // Always set zoom to 2x when centering on player
                this.mapView.zoom = 2.0;
                
                // Calculate the scale (same as in renderGoldenMap)
                const scaleX = w / mapData.width;
                const scaleY = h / mapData.height;
                const baseScale = Math.min(scaleX, scaleY) * 0.9;
                const finalScale = baseScale * this.mapView.zoom;
                
                const mapVisualWidth = mapData.width * finalScale;
                const mapVisualHeight = mapData.height * finalScale;
                
                // Calculate offset to center player
                // Player position in visual coordinates
                const playerVisualX = player.x * finalScale;
                const playerVisualY = player.y * finalScale;
                
                // Default center offset (when offset is 0)
                const defaultCenterX = (w - mapVisualWidth) / 2;
                const defaultCenterY = (h - mapVisualHeight) / 2;
                
                // Calculate offset to put player in center of screen
                this.mapView.offsetX = (w / 2) - defaultCenterX - playerVisualX;
                this.mapView.offsetY = (h / 2) - defaultCenterY - playerVisualY;
                
                // Recalculate nav path if marker exists
                if (this.navMarker) {
                    this.calculateNavPath();
                }
            }
        
            resizeMap() {
                this.mapCanvas.width = window.innerWidth;
                this.mapCanvas.height = window.innerHeight;
                // Also resize icon animation layer
                this.iconCanvas.width = window.innerWidth;
                this.iconCanvas.height = window.innerHeight;
            }
            
            // ... (Keep your Control Node / Banner logic here) ...
            // --- 1. CONTROL NODE GENERATOR ---
            createItemPill(item) {
                const pill = document.createElement('div');
                pill.className = 'ui-pill';
            
                // Item Details Container
                // 'overflow: hidden' ensures the description doesn't spill out
                pill.innerHTML = `
                    <div style="flex:1; overflow:hidden; padding-right:10px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:2px;">
                            <div style="font-family:'Orbitron'; font-size:0.9rem; color:#fff; white-space:nowrap;">
                                ${item.name.toUpperCase()}
                            </div>
                            <div style="font-family:'Orbitron'; font-size:0.7rem; color:var(--gold-primary); opacity:0.8;">
                                x${item.qty || 1}
                            </div>
                        </div>
                        <div style="font-family:'Montserrat'; font-size:0.65rem; color:#bbb; line-height:1.2; font-style:italic; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                            ${item.desc || "Standard issue gear."}
                        </div>
                    </div>
                `;
            
                // The Control Node (Right Anchor)
                const node = document.createElement('div');
                node.className = 'control-node';
            
                // The Hidden Menu
                const menu = document.createElement('div');
                menu.className = 'node-menu';
                menu.innerHTML = `
                    <button class="node-btn" onclick="game.inventory.equipItem('${item.id}')">EQUIP</button>
                    <button class="node-btn" style="color:#ff5555" onclick="game.inventory.dropItem('${item.id}')">DROP</button>
                `;
            
                pill.appendChild(node);
                pill.appendChild(menu);
            
                this.bindDragLogic(node, pill);
                return pill;
            }
        
            bindDragLogic(node, pill) {
                node.addEventListener('mousedown', (e) => {
                    e.stopPropagation(); // Prevent clicking the pill itself
                    // Drag logic goes here (using HTML5 Drag & Drop API or custom)
                    console.log("Dragging Item via Control Node");
                });
            }
        
            showMissionBanner(text, type = 'new', status = '') {
                const banner = document.getElementById('mission-banner');
                const txt = document.getElementById('mission-text');
                const statusText = document.getElementById('mission-status-text');
                
                // 1. Reset Classes (Remove old active/color states)
                banner.className = 'mission-banner'; 
                // Force reflow (Browser trick to restart CSS animations)
                void banner.offsetWidth;
                
                // 2. Set Content
                txt.textContent = text;
                
                // 3. Auto-detect status text if not provided
                if (!status) {
                    if (type === 'gold') status = 'COMPLETED';
                    else if (type === 'red') status = 'FAILED';
                    else status = 'NEW';
                }
                statusText.textContent = status;
                
                // 4. Apply Color Type
                if (type === 'gold') banner.classList.add('gold');
                else if (type === 'red') banner.classList.add('red');
                else banner.classList.add('new');
                
                // 5. Trigger Slide In
                requestAnimationFrame(() => {
                    banner.classList.add('active');
                });
                
                // 6. Auto-Hide after 5 seconds
                if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
                this.bannerTimeout = setTimeout(() => {
                    banner.classList.remove('active');
                }, 5000);
            }
            
            /* --- ADD TO UISystem class --- */
            
            drawObjectiveMarker(ctx) {
                // 1. Get Current Mission Data
                // We access the story state directly from the manager
                const story = this.game.story;
                if (!story || !story.nsm) return;
            
                const state = story.state;
                const stepData = story.nsm.getStepData(state.part, state.chapter, state.mission, state.step);
                
                if (!stepData) return;
            
                // 2. Check Validity
                // Only show if the objective is on the CURRENT viewing map
                // (Assuming activeMap.id matches the IDs in your STORY_DB like 'hub_949')
                if (stepData.targetMap !== this.game.activeMap.id) return;
            
                // 3. Resolve Coordinates
                let targetX = null;
                let targetY = null;
            
                // A. Use Modular Landmark System (Preferred)
                if (stepData.target && this.game.getLandmark) {
                    const loc = this.game.getLandmark(stepData.target);
                    if (loc) {
                        targetX = loc.x;
                        targetY = loc.y;
                    }
                } 
                // B. Fallback to hardcoded X/Y if legacy data exists
                else if (stepData.x !== undefined) {
                    targetX = stepData.x;
                    targetY = stepData.y;
                }
            
                if (targetX === null || targetY === null) return;
            
                // 4. Draw the "Golden Marker"
                const time = _frameTime;
                const pulse = (Math.sin(time / 200) + 1) / 2; // Fast pulse (0 to 1)
                
                // Calculate size (Counter-scale with zoom so it stays visible)
                // We divide by zoom so the marker stays roughly same screen size even when zoomed out
                const zoomFactor = Math.max(1, this.mapView.zoom); 
                const size = (80 + (pulse * 30)) / zoomFactor; 
            
                ctx.save();
                ctx.translate(targetX, targetY);
                
                // Glow
                ctx.shadowColor = '#FFD700'; // Gold
                ctx.shadowBlur = 30 + (pulse * 20);
                
                // 1. Rotating Outer Diamond
                ctx.save();
                ctx.rotate(time / 1500); 
                ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + pulse * 0.4})`;
                ctx.lineWidth = 6 / zoomFactor;
                ctx.strokeRect(-size/2, -size/2, size, size);
                ctx.restore();
            
                // 2. Counter-Rotating Inner Diamond
                ctx.save();
                ctx.rotate(-time / 1500); 
                const innerSize = size * 0.6;
                ctx.strokeStyle = `rgba(255, 255, 255, 0.8)`;
                ctx.lineWidth = 3 / zoomFactor;
                ctx.strokeRect(-innerSize/2, -innerSize/2, innerSize, innerSize);
                ctx.restore();
                
                // 3. Center Dot
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, 0, 8 / zoomFactor, 0, Math.PI*2);
                ctx.fill();
                
                // 4. Label (Optional)
                // Only show if zoomed in closer
                if (this.mapView.zoom > 1.5) {
                    ctx.fillStyle = '#FFD700';
                    ctx.font = `bold ${24/zoomFactor}px Orbitron`;
                    ctx.textAlign = 'center';
                    ctx.shadowBlur = 0;
                    ctx.fillText("OBJECTIVE", 0, -size/1.5);
                }
            
                ctx.restore();
            }

        }
        
