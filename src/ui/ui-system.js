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
                this.cacheBand = 0;                // the zoom band the cache was painted for (0.5 / 1 / 2 / 4)
                this.dpr = 1;                      // device pixels per CSS pixel (canvases are sized in device px)
                
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
                    if (this.game.zibSystem?.isPassenger) return;
                    
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
                            if (this.game.isDriving && this.game.car?.controlMode === 'AI') {
                                this.game.car.disableAutoDrive();
                                this.game.car.clearNavWaypoints();
                                this.game.autodriveBtn.classList.remove('engaged');
                            }
                            showMessage("NAVIGATION CANCELLED");
                            this.renderGoldenMap();
                            return;
                        }
                    }
                    
                    // Set new marker
                    this.navMarker = { x: worldCoords.x, y: worldCoords.y };
                    this.navPathDirty = true;
                    this.game.navDestination = this.navMarker; // Share with game engine for AutoDrive
                    if (this.game.isDriving && this.game.car?.controlMode === 'AI') this.game.car.navDestination = null;
                    if (this.game.isDriving && this.game.car?.controlMode === 'AI' && !this.game.car.currentTurnPath) {
                        if (!this.game._refreshAutoDriveRoute()) {
                            this.game.car.disableAutoDrive();
                            this.game.car.clearNavWaypoints();
                            this.game.autodriveBtn.classList.remove('engaged');
                        }
                    }
                    this.calculateNavPath();
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
                    this.mapView.offsetX += dx * this.dpr;
                    this.mapView.offsetY += dy * this.dpr;
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
                        this.mapView.offsetX += dx * this.dpr;
                        this.mapView.offsetY += dy * this.dpr;
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
                
                const worldX = (screenX * this.dpr - offsetX) / finalScale;      // screenX/Y arrive in CSS px
                const worldY = (screenY * this.dpr - offsetY) / finalScale;
                
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
                    const drivingRoute = this.game.isDriving && this.game.car?.controlMode === 'AI'
                        ? this.game.car._driveRoute : null;
                    this.precisePath = drivingRoute ? drivingRoute.waypoints : network.buildPrecisePath(
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
                const dashOffset = time * 40 * (this._u || 1); // Animated dash
                
                ctx.save();
                
                // Outer glow (widths in CSS px: this._u is map units per CSS px)
                const U = this._u || 1;
                ctx.strokeStyle = 'rgba(138, 43, 226, 0.28)';
                ctx.lineWidth = 14 * U;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                ctx.beginPath();
                ctx.moveTo(this.roadLevelPath[0].x, this.roadLevelPath[0].y);
                for (let i = 1; i < this.roadLevelPath.length; i++) {
                    ctx.lineTo(this.roadLevelPath[i].x, this.roadLevelPath[i].y);
                }
                ctx.stroke();
                
                // Middle layer
                ctx.strokeStyle = 'rgba(180, 100, 255, 0.7)';
                ctx.lineWidth = 6 * U;
                
                ctx.beginPath();
                ctx.moveTo(this.roadLevelPath[0].x, this.roadLevelPath[0].y);
                for (let i = 1; i < this.roadLevelPath.length; i++) {
                    ctx.lineTo(this.roadLevelPath[i].x, this.roadLevelPath[i].y);
                }
                ctx.stroke();
                
                // Core line with animated dash
                ctx.strokeStyle = '#efd9ff';
                ctx.lineWidth = 2.2 * U;
                ctx.setLineDash([10 * U, 7 * U]);
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
            drawDistanceLine(ctx) {
                // Screen space (device px): a fine dashed line from you to the destination, its distance in a violet pill
                if (!this.navMarker || !this._toScreen) return;
                const D = this.dpr, a = this._toScreen(this.game.player.x, this.game.player.y), b = this._toScreen(this.navMarker.x, this.navMarker.y);
                const distM = Math.round(Math.hypot(this.navMarker.x - this.game.player.x, this.navMarker.y - this.game.player.y) / 10);
                const text = distM >= 1000 ? (distM / 1000).toFixed(1) + ' km' : distM + ' m';
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 243, 207, 0.55)'; ctx.lineWidth = 1.5 * D; ctx.lineCap = 'round';
                ctx.setLineDash([7 * D, 6 * D]); ctx.lineDashOffset = -(_frameTimeSec * 24 * D);
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                ctx.font = `600 ${11 * D}px Montserrat, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const tw = ctx.measureText(text).width, pw = tw + 18 * D, ph = 20 * D;
                ctx.fillStyle = 'rgba(28, 12, 52, 0.88)'; ctx.strokeStyle = 'rgba(217, 204, 255, 0.6)'; ctx.lineWidth = 1 * D;
                ctx.beginPath(); ctx.roundRect(mx - pw / 2, my - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#f3e6c2'; ctx.fillText(text, mx, my + 0.5 * D);
                ctx.restore();
            }
            
            // --- DRAW NAVIGATION MARKER (Ruby Colored) ---
            drawNavMarker(ctx) {
                // Your destination: a crimson pin with a gold flag (fixed size), a soft gold ring breathing under it
                if (!this.navMarker || !this._toScreen) return;
                const D = this.dpr, p = this._toScreen(this.navMarker.x, this.navMarker.y), k = this._zk;
                const pulse = (Math.sin(_frameTime / 300) + 1) / 2;
                ctx.save();
                ctx.strokeStyle = `rgba(255, 207, 106, ${0.25 + 0.35 * (1 - pulse)})`; ctx.lineWidth = 1.5 * D;
                ctx.beginPath(); ctx.arc(p.x, p.y, (8 + 10 * pulse) * D * k, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                MapIcons.draw(ctx, 'dest', p.x, p.y, { dpr: D, css: MapIcons.SIZE.dest * k });
            }
            
            // --- DRAW MAP LEGEND ---
            drawMapLegend(ctx, w, h) {
                // Built from the same icons and sizes as the map; kept inside the free area between the sidebars
                // On a short screen (a phone on its side) the whole legend scales down
                const D = this.dpr * Math.max(0.62, Math.min(1, h / this.dpr / 640)), items = [['player', 'You'], ['car', 'Your vehicle'], ['car:amber', 'Delivery van'], ['dest', 'Destination'], ['objective', 'Objective'], ['client', 'Client'], ['transition', 'Way through'], ['danger', 'Danger zone']];
                const lw = 150 * D, row = 21 * D, lh = (34 + items.length * 21) * D, area = this._freeArea(w, h);
                const x = area.right - lw - 14 * D, y = area.bottom - lh - 14 * D;
                ctx.save();
                ctx.fillStyle = 'rgba(16, 7, 32, 0.78)'; ctx.strokeStyle = 'rgba(217, 204, 255, 0.35)'; ctx.lineWidth = 1 * D;
                ctx.setLineDash([2 * D, 3 * D]);
                ctx.beginPath(); ctx.roundRect(x, y, lw, lh, 14 * D); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = '#ffd76a'; ctx.font = `600 ${10 * D}px Montserrat, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText('L E G E N D', x + 14 * D, y + 17 * D);
                ctx.font = `${10.5 * D}px Montserrat, sans-serif`;
                items.forEach(([k, label], i) => {
                    const cy = y + (36 + i * 21) * D;
                    MapIcons.draw(ctx, k, x + 24 * D, cy + (k === 'dest' ? 7 * D : 0), { dpr: this.dpr, css: (k === 'dest' ? 16 : 14) * D / this.dpr });
                    ctx.fillStyle = '#e6dcff'; ctx.fillText(label, x + 44 * D, cy);
                });
                ctx.restore();
            }
            
            // --- DRAW ZOOM READOUT ---
            drawZoomReadout(ctx, w, h) {
                const D = this.dpr, area = this._freeArea(w, h), x = area.left + 14 * D, y = area.bottom - 40 * D;
                ctx.save();
                ctx.fillStyle = 'rgba(16, 7, 32, 0.78)'; ctx.strokeStyle = 'rgba(217, 204, 255, 0.35)'; ctx.lineWidth = 1 * D;
                ctx.beginPath(); ctx.roundRect(x, y, 78 * D, 26 * D, 13 * D); ctx.fill(); ctx.stroke();
                MapIcons.draw(ctx, 'search', x + 18 * D, y + 13 * D, { dpr: D });
                ctx.fillStyle = '#ffd76a'; ctx.font = `600 ${11 * D}px Montserrat, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(`${this.mapView.zoom.toFixed(1)}×`, x + 34 * D, y + 13.5 * D);
                ctx.restore();
            }

            /** The canvas area not under the sidebars (device px), so overlays never hide behind them. */
            _freeArea(w, h) {
                const D = this.dpr, cr = this.mapCanvas.getBoundingClientRect();
                let left = 0, right = w;
                const L = document.getElementById('map-sidebar-left'), R = document.getElementById('map-sidebar-right');
                const vis = (el) => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
                if (vis(L)) { const r = L.getBoundingClientRect(); if (r.width > 0 && r.right < cr.width * 0.5) left = Math.max(0, (r.right - cr.left) * D); }
                if (vis(R)) { const r = R.getBoundingClientRect(); if (r.width > 0 && r.left > cr.width * 0.5) right = Math.min(w, (r.left - cr.left) * D); }
                return { left, right, top: 0, bottom: h };
            }
        
            // --- 2. THE VIEWPORT-EXTENDED CACHE RENDERER ---
            // Renders static geometry (walls, roads, buildings, labels) into a
            // canvas sized to the viewport+buffer, at current display scale. Only
            // geometry whose AABB intersects the cache region gets drawn — the
            // expensive shadowBlur / lighter-composite road passes are confined
            // to roughly one screenful instead of the entire map.
            updateMapCache(visibleX, visibleY, visibleW, visibleH, finalScale, band, bandScale) {
                // The static city, painted at a fixed zoom BAND (0.5 / 1 / 2 / 4 × the fit scale) over the view plus a
                // margin, then stretched to the exact zoom: pinching and wheeling within a band reuse it; only a band
                // change or panning past the margin repaints. Capped at 2560 px a side (Safari's canvas memory).
                const mapData = this.game.activeMap;
                const bufX = visibleW * 0.3, bufY = visibleH * 0.3;
                const bx = visibleX - bufX, by = visibleY - bufY, bw = visibleW + bufX * 2, bh = visibleH + bufY * 2;
                const MAX = 2560;
                let cw = Math.ceil(bw * bandScale), ch = Math.ceil(bh * bandScale), eff = bandScale;
                if (cw > MAX || ch > MAX) { const r = Math.min(MAX / cw, MAX / ch); cw = Math.ceil(cw * r); ch = Math.ceil(ch * r); eff = bandScale * r; }
                this.cacheCanvas.width = cw; this.cacheCanvas.height = ch;
                this.cacheBoundsMap = { x: bx, y: by, w: bw, h: bh };
                this.cacheFinalScale = eff; this.cacheBand = band;
                this.cacheMapId = mapData.id || null;
                this.isCacheDirty = false;
                this.cacheBuilds = (this.cacheBuilds || 0) + 1;
                const ctx = this.cacheCtx;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = MAP_PAL.base; ctx.fillRect(0, 0, cw, ch);
                ctx.setTransform(eff, 0, 0, eff, -bx * eff, -by * eff);
                MapArt.paintCity(ctx, mapData, { px: eff, dpr: this.dpr, bounds: this.cacheBoundsMap,
                    network: mapData.type !== 'indoor' && this.game.traffic ? this.game.traffic.network : null,
                    lamps: mapData.type !== 'indoor' ? this.game.lamps : null });
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                MapArt.bloom(this.cacheCanvas);
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
                // Zoom band: the nearest of 0.5 / 1 / 2 / 4 (the cache is stretched at most ~1.4× either way)
                const band = Math.max(0.5, Math.min(4, Math.pow(2, Math.round(Math.log2(this.mapView.zoom)))));
                const b = this.cacheBoundsMap;
                const cacheValid = !this.isCacheDirty &&
                    this.cacheMapId === mapData.id &&
                    b !== null &&
                    this.cacheBand === band &&
                    visibleX >= b.x &&
                    visibleY >= b.y &&
                    visibleX + visibleW <= b.x + b.w &&
                    visibleY + visibleH <= b.y + b.h;
                
                if (!cacheValid) {
                    this.updateMapCache(visibleX, visibleY, visibleW, visibleH, finalScale, band, baseScale * band);
                }
                
                // 1. Clear screen (deep violet beyond the map's edge)
                ctx.fillStyle = MAP_PAL.base;
                ctx.fillRect(0, 0, w, h);
                ctx.imageSmoothingEnabled = true;
                
                // 2. Blit cache at the screen position corresponding to
                //    cacheBoundsMap's top-left in map-space.
                //    Round to integer pixels to avoid sub-pixel filtering smear during pan.
                const cacheScreenX = screenOriginX + this.cacheBoundsMap.x * finalScale;
                const cacheScreenY = screenOriginY + this.cacheBoundsMap.y * finalScale;
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
                // Labels in screen space at fixed CSS sizes: building names in champagne small caps, road names in
                // gold italics; a dark violet keyline instead of a blur; nothing drawn where a label already sits.
                const mapData = this.game.activeMap;
                if (!mapData || mapData.type === 'indoor') return;
                const D = this.dpr, zoom = this.mapView.zoom;
                const showBuildings = zoom >= 1.4 && mapData.buildings, showRoads = zoom >= 1.0;
                if (!showBuildings && !showRoads) return;
                const sx = (mx) => screenOriginX + mx * finalScale, sy = (my) => screenOriginY + my * finalScale;
                const placed = [];
                const free = (x, y, hw, hh) => {
                    if (x + hw < 0 || x - hw > w || y + hh < 0 || y - hh > h) return false;
                    for (const r of placed) if (Math.abs(r[0] - x) < r[2] + hw && Math.abs(r[1] - y) < r[3] + hh) return false;
                    placed.push([x, y, hw, hh]); return true;
                };
                ctx.save();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(11, 5, 22, 0.88)';
                if (showRoads) {
                    const fs = Math.round((9 + Math.min(3, (zoom - 1) * 1.2)) * D);
                    ctx.font = `italic 600 ${fs}px Montserrat, sans-serif`; ctx.lineWidth = 3 * D;
                    for (const road of this.game.traffic.network.roads) {
                        if (!road.name || !road.name.trim()) continue;
                        const isH = road.orientation === 'H', text = road.name.toUpperCase().split('').join(' '), tw = ctx.measureText(text).width;
                        const len = (isH ? road.w : road.h) * finalScale, n = Math.max(1, Math.floor(len / (tw + 260 * D)));
                        for (let i = 0; i < n; i++) {
                            const t = (i + 0.5) / n, x = sx(isH ? road.x + road.w * t : road.x + road.w / 2), y = sy(isH ? road.y + road.h / 2 : road.y + road.h * t);
                            if (!free(x, y, isH ? tw / 2 + 6 * D : fs, isH ? fs : tw / 2 + 6 * D)) continue;
                            ctx.save(); ctx.translate(x, y); if (!isH) ctx.rotate(-Math.PI / 2);
                            ctx.strokeText(text, 0, 0); ctx.fillStyle = '#ffd76a'; ctx.fillText(text, 0, 0);
                            ctx.restore();
                        }
                    }
                }
                if (showBuildings) {
                    const fs = Math.round((9.5 + Math.min(3, (zoom - 1.4) * 1.1)) * D);
                    ctx.font = `600 ${fs}px Montserrat, sans-serif`; ctx.lineWidth = 3 * D;
                    for (const b of mapData.buildings) {
                        if (!b.label || !b.label.trim()) continue;
                        const text = b.label.toUpperCase(), tw = ctx.measureText(text).width, x = sx(b.x + b.w / 2), y = sy(b.y + b.h / 2);
                        if (!free(x, y, tw / 2 + 4 * D, fs * 0.75)) continue;
                        ctx.strokeText(text, x, y); ctx.fillStyle = '#f3e6c2'; ctx.fillText(text, x, y);
                    }
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
                // A whisper of scanlines (cached tile), so the gold reads as a display, not as noise
                if (!this._scanPat || this._scanDpr !== this.dpr) {
                    const t = document.createElement('canvas'), D = this.dpr; t.width = 4; t.height = Math.max(2, Math.round(3 * D));
                    const c = t.getContext('2d'); c.fillStyle = 'rgba(6, 2, 14, 0.16)'; c.fillRect(0, 0, 4, Math.max(1, Math.round(D)));
                    this._scanPat = ctx.createPattern(t, 'repeat'); this._scanDpr = D;
                }
                ctx.save(); ctx.fillStyle = this._scanPat; ctx.fillRect(0, 0, w, h); ctx.restore();
            }
        
            // Every screen opens through Screens (ui/screens.js), so the map and the menu never stack
            toggleMap(show) {
                if (show) Screens.open('map');
                else if (Screens.mapOpen()) Screens.close();
            }

            _showMap(show) {
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
                this.animationFrameId = requestAnimationFrame(() => this.animateIcons());
                const ctx = this.iconCtx, w = this.iconCanvas.width, h = this.iconCanvas.height, mapData = this.game.activeMap, D = this.dpr;
                if (!mapData) return;
                let filterEnabled = false, activeFilter = null;
                if (typeof mapSidebar !== 'undefined') { filterEnabled = mapSidebar.filterEnabled; activeFilter = mapSidebar.activeFilter; }
                const shouldShow = (category) => !filterEnabled || activeFilter === category;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, w, h);
                // The same transform as the map
                const baseScale = Math.min(w / mapData.width, h / mapData.height) * 0.9, finalScale = baseScale * this.mapView.zoom;
                const ox = (w - mapData.width * finalScale) / 2 + this.mapView.offsetX, oy = (h - mapData.height * finalScale) / 2 + this.mapView.offsetY;
                this._toScreen = (mx, my) => ({ x: ox + mx * finalScale, y: oy + my * finalScale });
                this._u = D / finalScale;                                   // map units per CSS px
                this._zk = MapIcons.zoomK(this.mapView.zoom);               // icons grow a little with zoom, never with the screen
                const S = this._toScreen, k = this._zk, on = (p, m = 40 * D) => p.x > -m && p.x < w + m && p.y > -m && p.y < h + m;

                // ── Areas and routes, in map space ──
                ctx.save(); ctx.translate(ox, oy); ctx.scale(finalScale, finalScale);
                const rz = this.game.restrictedZone;
                if (rz) {                                                   // the danger zone: a crimson wash and a travelling pulsing edge
                    const borderNow = performance.now();
                    const t = (borderNow % (Math.PI * 2 * 400 / 1.5)) / 400; // one bounded pulse cycle
                    ctx.fillStyle = rz.cleared ? 'rgba(60, 14, 30, 0.28)' : 'rgba(150, 10, 40, 0.24)';
                    ctx.fillRect(rz.x, rz.y, rz.w, rz.h);
                    ctx.strokeStyle = rz.cleared ? 'rgba(255, 170, 90, 0.45)' : `rgba(255, 60, 70, ${0.5 + Math.sin(t * 1.5) * 0.2})`;
                    ctx.lineWidth = 2 * this._u; ctx.setLineDash([10 * this._u, 7 * this._u]);
                    ctx.lineDashOffset = ((borderNow % 850) / 50) * this._u; // bounded to one 17-unit dash cycle before zoom scaling
                    ctx.strokeRect(rz.x, rz.y, rz.w, rz.h); ctx.setLineDash([]);
                }
                let quest = null;
                if (shouldShow('missions')) {                               // the side quest's area: a soft molten-gold pool, no outline
                    const m = this.game.missions?.activeMission;
                    if (m && m.status === 'active') {
                        let qx = m.targetX, qy = m.targetY;
                        if (m.type === MISSION_TYPES.DELIVERY && !m.pickedUp && this.game.deliveryVehicle) { qx = this.game.deliveryVehicle.x; qy = this.game.deliveryVehicle.y; }
                        if (qx !== undefined && qy !== undefined) {
                            const r = (m.targetRadius || 100) * (1 + Math.sin(_frameTime / 600) * 0.06);
                            const g = ctx.createRadialGradient(qx, qy, 0, qx, qy, r);
                            g.addColorStop(0, 'rgba(255, 215, 120, 0.22)'); g.addColorStop(0.7, 'rgba(255, 150, 60, 0.12)'); g.addColorStop(1, 'rgba(160, 30, 60, 0)');
                            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(qx, qy, r, 0, Math.PI * 2); ctx.fill();
                            quest = { x: qx, y: qy };
                        }
                    }
                }
                this.drawRoadLevelPath(ctx);
                this.drawCarActualPath(ctx);
                ctx.restore();

                // ── Markers, in screen space at fixed sizes ──
                if (mapData.transitions) for (const t of mapData.transitions) { const p = S(t.x + t.w / 2, t.y + t.h / 2); if (on(p)) MapIcons.draw(ctx, 'transition', p.x, p.y, { dpr: D, css: MapIcons.SIZE.transition * k }); }
                // Points of interest from the buildings' categories
                if (mapData.buildings) for (const b of mapData.buildings) {
                    const cat = b.mapCategory; if (!cat) continue;
                    const kind = cat === 'restaurant' ? 'pin:cup' : cat === 'medical' ? 'pin:cross' : 'pin:dot', key = cat === 'restaurant' ? 'restaurants' : null;
                    if (filterEnabled && (!key || activeFilter !== key)) continue;
                    const p = S(b.x + b.w / 2, b.y + b.h / 2); if (on(p)) MapIcons.draw(ctx, kind, p.x, p.y, { dpr: D, css: MapIcons.SIZE.pin * k });
                }
                if (this.game.pedestrians && this.game.pedestrians.pedestrians && !filterEnabled) {   // the crowd: fine lavender motes
                    ctx.fillStyle = 'rgba(217, 204, 255, 0.55)'; const r = 1.6 * D;
                    ctx.beginPath(); for (const ped of this.game.pedestrians.pedestrians) { if (ped.dead) continue; const p = S(ped.x, ped.y); if (on(p, 4)) ctx.rect(p.x - r, p.y - r, r * 2, r * 2); } ctx.fill();
                }
                if (this.game.npcs && shouldShow('clients')) for (const n of this.game.npcs) { const p = S(n.x, n.y); if (on(p)) MapIcons.draw(ctx, 'client', p.x, p.y, { dpr: D, css: MapIcons.SIZE.client * k }); }
                if (shouldShow('homebases')) {
                    const L = this.game.landmarkRegistry && this.game.landmarkRegistry['parking_spot'], hx = L ? L.x : mapData.spawn && mapData.spawn.x, hy = L ? L.y : mapData.spawn && mapData.spawn.y;
                    if (hx !== undefined) { const p = S(hx, hy); if (on(p)) MapIcons.draw(ctx, 'pin:home', p.x, p.y, { dpr: D, css: MapIcons.SIZE.pin * k }); }
                }
                if (rz) {
                    const p = S(rz.x + rz.w / 2, rz.y + rz.h / 2), pulse = 1 + Math.sin(_frameTime / 400) * 0.05;
                    if (on(p, 120 * D)) {
                        MapIcons.draw(ctx, 'danger', p.x, p.y, { dpr: D, css: MapIcons.SIZE.danger * k, scale: pulse, alpha: rz.cleared ? 0.7 : 1 });
                        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * D; ctx.strokeStyle = 'rgba(11, 5, 22, 0.9)';
                        ctx.font = `600 ${10 * D}px Montserrat, sans-serif`;
                        const ty = p.y + 18 * D * k, name = (rz.name || '').toUpperCase().split('').join(' ');
                        ctx.strokeText(name, p.x, ty); ctx.fillStyle = rz.cleared ? '#ffcf8a' : '#ff8a96'; ctx.fillText(name, p.x, ty);
                        if (rz.clearCount > 0) { const c2 = `×${rz.clearCount} CLEARED`; ctx.font = `${9 * D}px Montserrat, sans-serif`; ctx.strokeText(c2, p.x, ty + 13 * D); ctx.fillStyle = '#ffd76a'; ctx.fillText(c2, p.x, ty + 13 * D); }
                        ctx.restore();
                    }
                }
                if (quest) { const p = S(quest.x, quest.y); if (on(p)) MapIcons.draw(ctx, 'pin:sparkle', p.x, p.y, { dpr: D, css: MapIcons.SIZE.pin * k }); }
                if (shouldShow('missions')) {
                    this.drawObjectiveMarker(ctx);
                    const sd = this.game.story?.currentStepData;                // the story's own target
                    if (sd && sd.targetMap === mapData.id) {
                        let tx, ty;
                        if (typeof sd.target === 'string') { const l = this.game.getLandmark(sd.target); if (l) { tx = l.x; ty = l.y; } }
                        else if (sd.target) { tx = sd.target.x; ty = sd.target.y; }
                        else if (typeof sd.targetX === 'number') { tx = sd.targetX; ty = sd.targetY; }
                        if (tx !== undefined) { const p = S(tx, ty); if (on(p)) MapIcons.draw(ctx, 'pin:star', p.x, p.y, { dpr: D, css: MapIcons.SIZE.pin * k }); }
                    }
                }
                this.drawDistanceLine(ctx);
                this.drawNavMarker(ctx);
                if (this.game.deliveryVehicle && this.game.deliveryVehicle.visible) { const c = this.game.deliveryVehicle, p = S(c.x, c.y); if (on(p)) MapIcons.draw(ctx, 'car:amber', p.x, p.y, { dpr: D, css: MapIcons.SIZE.car * k, rot: c.angle }); }   // Amber's van
                if (this.game.ownedCar && this.game.ownedCar.visible) { const c = this.game.ownedCar, p = S(c.x, c.y); if (on(p)) MapIcons.draw(ctx, 'car', p.x, p.y, { dpr: D, css: MapIcons.SIZE.car * k, rot: c.angle }); }
                const pl = this.game.player, pp = S(pl.x, pl.y);                // you, on top
                MapIcons.draw(ctx, 'player', pp.x, pp.y, { dpr: D, css: MapIcons.SIZE.player * k, rot: pl.angle, scale: 0.94 + Math.sin(_frameTime / 350) * 0.06 });
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
                // Canvases in device pixels (crisp on every screen); their CSS size stays the window's
                const D = this.dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
                const cw = window.innerWidth, ch = window.innerHeight;
                for (const cv of [this.mapCanvas, this.iconCanvas]) {
                    if (cv.width !== Math.round(cw * D) || cv.height !== Math.round(ch * D)) { cv.width = Math.round(cw * D); cv.height = Math.round(ch * D); }
                    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
                }
                this.isCacheDirty = true;
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
                // The story objective: a gold ring and star at a fixed size, breathing, with a slow gold halo
                const story = this.game.story;
                if (!story || !story.nsm || !this._toScreen) return;
                const st = story.state, step = story.nsm.getStepData(st.part, st.chapter, st.mission, st.step);
                if (!step || step.targetMap !== this.game.activeMap.id) return;
                let tx = null, ty = null;
                if (step.target && this.game.getLandmark) { const l = this.game.getLandmark(step.target); if (l) { tx = l.x; ty = l.y; } }
                else if (step.x !== undefined) { tx = step.x; ty = step.y; }
                if (tx === null || ty === null) return;
                const D = this.dpr, p = this._toScreen(tx, ty), pulse = (Math.sin(_frameTime / 260) + 1) / 2;
                ctx.save();
                ctx.strokeStyle = `rgba(255, 215, 106, ${0.15 + 0.35 * (1 - pulse)})`; ctx.lineWidth = 1.5 * D;
                ctx.beginPath(); ctx.arc(p.x, p.y, (16 + 12 * pulse) * D * this._zk, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                MapIcons.draw(ctx, 'objective', p.x, p.y, { dpr: D, css: MapIcons.SIZE.objective * this._zk, scale: 0.95 + 0.08 * pulse });
            }

        }
        
