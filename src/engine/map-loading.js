        // GameEngine — loadMap / _doLoadMap (building every map), baked lighting.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
                /* Each interior's painted floor (or backdrop) is a big canvas — 2–11 MB apiece. They're painted from
           fixed seeds, so they're let go when she leaves the map and painted again (under the door fade) on
           the next visit. The Keeper's two places travel together (the prologue walks between them). */
        const MAP_BAKES = {
            house_of_death: ['_houseFloor'], hotel_lobby: ['_lobbyFloor'], church_boss: ['_sanctumFloor'],
            hotel_suite: ['_suiteFloor'], moon_city_nightclub: ['_clubFloor'], demoness_palace: ['_palaceFloor'],
            apt_949: ['_cityView', '_aptFloor'], van_interior: ['_vanCabin'], cozy_cafe_interior: ['_cafeFloor'],
            enni_cole_interior: ['_enniFloor'],
            keepers_hill: ['_keeperHill', '_keeperHouse', '_keeperParlor'], keepers_parlor: ['_keeperHill', '_keeperHouse', '_keeperParlor']
        };

engineMixin({
            loadMap(mapId, spawnAt) {
                // 1. Initial Load (No Fade)
                if (!this.activeMap) {
                    this._doLoadMap(mapId, spawnAt);
                    this.bakeStaticLighting(); // <--- ADDED: Bake immediately on first load
                    return;
                }
                
                this.lightingBaked = false;
                
                // 2. Start Fade Out
                const fadeOverlay = document.getElementById('fade-overlay');
                fadeOverlay.classList.add('active');
                
                // Pause game
                this.pauseSystem.acquire('map_load');
                const seq = this._loadSeq = (this._loadSeq || 0) + 1;
                this._cancelMapTextureWarmup();
                
                // 3. Wait for Screen to go Black (400ms)
                setTimeout(() => {
                    if (seq !== this._loadSeq) return;                          // a newer load took over: it switches and fades in
                    if (!this.activeMap) {                                       // the game was quit mid-fade: nothing to load into
                        fadeOverlay.classList.remove('active'); this.pauseSystem.release('map_load'); return;
                    }
                    // A. Switch the Map Data
                    this._doLoadMap(mapId, spawnAt);
                    
                    // B. Bake Lighting for the NEW Map
                    // Now that activeMap is updated, this will calculate the correct lines
                    this.bakeStaticLighting(); 
                    
                    // C. Use the existing black hold to prepare first-visible textures. Keep the
                    // same 100ms minimum; unusually costly paints finish before revealing the map.
                    const arrivingMap = this.activeMap;
                    let held = false, prepared = false;
                    const reveal = () => {
                        if (seq !== this._loadSeq || arrivingMap !== this.activeMap || !held || !prepared) return;
                        this._mapTextureTransition = null;
                        fadeOverlay.classList.remove('active');
                        this.pauseSystem.release('map_load');
                    };
                    setTimeout(() => { held = true; reveal(); }, 100);
                    this._prepareMapTextures(() => { prepared = true; reveal(); }, seq);
                    this._mapTextureTransition = { map: arrivingMap, seq };
                }, 400);
            },
            
            /** Cancel queued texture work and, on reset/quit, invalidate pending transition callbacks. */
            _cancelMapTextureWarmup(abandonTransition = false) {
                const warm = this._mapTextureWarmup;
                if (warm) {
                    clearTimeout(warm.timer);
                    warm.jobs.length = 0; warm.map = null; warm.done = null;
                    this._mapTextureWarmup = null;
                }
                this._mapTextureTransition = null;
                if (abandonTransition) {
                    this._loadSeq = (this._loadSeq || 0) + 1;
                    const fade = document.getElementById('fade-overlay');
                    if (fade) fade.classList.remove('active');
                    if (this.pauseSystem) this.pauseSystem.release('map_load');
                }
            },

            /** Predict the first normal draw's center after spawn placement without advancing camera state. */
            _firstMapGroundView() {
                let x = this.camera.x, y = this.camera.y;
                if (!(this.cutscene && this.cutscene.active)) {
                    const dt = Math.min(100, Math.max(0, _frameTime - (this._camLeanT || _frameTime)));
                    const drv = this.isDriving && this.car, LA = CONFIG.VEHICLE_DRIVE.CAM_LOOK_AHEAD, k = 1 - Math.exp(-dt / LA.TAU_MS);
                    const dx = (this.driveLeanX || 0) + ((drv ? (this.car.vx || 0) * LA.PER_SPEED : 0) - (this.driveLeanX || 0)) * k;
                    const dy = (this.driveLeanY || 0) + ((drv ? (this.car.vy || 0) * LA.PER_SPEED : 0) - (this.driveLeanY || 0)) * k;
                    x = this.player.x + (this.scopeLeanX || 0) + dx;
                    y = this.player.y + (this.scopeLeanY || 0) + dy;
                }
                if (this.cineCam) { x += this.cineCam.dx; y += this.cineCam.dy; }
                if (this.finCam) { x += this.finCam.dx; y += this.finCam.dy; }
                ({ x, y } = this._clampView(x, y, this.camera.zoom));       // as draw() keeps the view inside the map
                const hw = this.canvas.width / 2 / this.camera.zoom, hh = this.canvas.height / 2 / this.camera.zoom, map = this.activeMap;
                return { left: Math.max(0, x - hw - 50), top: Math.max(0, y - hh - 50),
                    right: Math.min(map.width, x + hw + 50), bottom: Math.min(map.height, y + hh + 50) };
            },

            /** Prepare only existing static bakes; moving details keep their original render-time updates. */
            _prepareMapTextures(done, seq) {
                this._cancelMapTextureWarmup();
                const map = this.activeMap, jobs = [];
                const floors = {
                    house_of_death: [['_houseFloor', '_paintHouseFloor']],
                    hotel_lobby: [['_lobbyFloor', '_paintLobbyFloor']],
                    church_boss: [['_sanctumFloor', '_paintSanctumFloor']],
                    hotel_suite: [['_suiteFloor', '_paintSuiteFloor']],
                    moon_city_nightclub: [['_clubFloor', '_paintClubFloor']],
                    cozy_cafe_interior: [['_cafeFloor', '_paintCafeFloor']],
                    apt_949: [['_aptFloor', '_paintAptFloor']],
                    demoness_palace: [['_palaceFloor', '_paintPalaceFloor']],
                    keepers_hill: [['_keeperHill', '_paintKeeperHill'], ['_keeperHouse', '_paintKeeperHouse']],
                    keepers_parlor: [['_keeperParlor', '_paintKeeperParlor']],
                    van_interior: [['_vanCabin', '_paintVanCabin']]
                };
                for (const [field, paint] of floors[map.id] || []) if (!this[field]) jobs.push(() => {
                    if (!this[field]) this[field] = this[paint]();
                });
                // The city below the veranda: laid out and painted once, its night lights in a second job
                if (map.id === 'apt_949' && !this._cityView) jobs.push(() => {
                    if (!this._cityView) this._cityView = this._makeAptCityView();
                    this._cityView.bakeGround();
                }, () => { if (this._cityView) this._cityView.bakeTops(); }, () => { if (this._cityView && !this._cityView.glow) this._cityView.bakeGlow(); }, () => { if (this._cityView) this._cityView.warm(); });
                // The furniture's sprites (entities/prop-sprites.js), a handful a job, at the zoom the map opens at
                const props = (this.props || []).filter(p => p && PropSprites.kindOf(p));
                for (let i = 0; i < props.length; i += 8) jobs.push(() => PropSprites.prepare(props.slice(i, i + 8), this.camera.zoom));
                // Ground labels use a downloaded font: speculative preparation must not freeze an
                // earlier fallback face. The ordinary first draw remains responsible if it is not ready.
                if (this.groundBaker && this.groundBaker.activeFor(map) &&
                    (!document.fonts || document.fonts.check('600 11px Montserrat'))) {
                    jobs.push(...this.groundBaker.warmupJobs(this._firstMapGroundView()));
                }
                if (!jobs.length) { done(); return; }
                const warm = { map, seq, jobs, index: 0, timer: null, done };
                this._mapTextureWarmup = warm;
                const finish = () => {
                    if (this._mapTextureWarmup !== warm) return;
                    this._mapTextureWarmup = null;
                    const callback = warm.done;
                    warm.jobs.length = 0; warm.map = null; warm.done = null;
                    if (callback) callback();
                };
                const step = () => {
                    if (this._mapTextureWarmup !== warm || seq !== this._loadSeq || map !== this.activeMap) return;
                    if (warm.index >= jobs.length) { finish(); return; }
                    try { jobs[warm.index++](); }
                    catch (error) { console.warn('Map texture preparation', error); finish(); return; }
                    // One expensive canvas per task lets the browser present the fade between paints.
                    warm.timer = setTimeout(step, 0);
                };
                warm.timer = setTimeout(step, 0);
            },

            /**
             * Where to stand on entering an interior by its door: just inside, clear of the door's
             * trigger, on the side facing the room (a door on the south wall → step north).
             */
            _stepInFromGate(g) {
                const M = this.activeMap, cx = g.x + g.w / 2, cy = g.y + g.h / 2;
                const nav = NavGrid.for(M), inGate = (x, y) => (M.transitions || []).some(t => x >= t.x - 4 && x <= t.x + t.w + 4 && y >= t.y - 4 && y <= t.y + t.h + 4);
                // The wall the door is on: whichever map edge it's nearest
                const d = { S: M.height - (g.y + g.h), N: g.y, W: g.x, E: M.width - (g.x + g.w) };
                const side = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
                const dir = { S: [0, -1], N: [0, 1], W: [1, 0], E: [-1, 0] }[side];
                for (let step = 20; step <= 200; step += 10) {
                    const x = side === 'S' || side === 'N' ? cx : (dir[0] > 0 ? g.x + g.w : g.x) + dir[0] * step;
                    const y = side === 'W' || side === 'E' ? cy : (dir[1] > 0 ? g.y + g.h : g.y) + dir[1] * step;
                    if (!inGate(x, y) && (!nav || nav.walkable(x, y))) return { x, y, angle: Math.atan2(dir[1], dir[0]) };
                }
                return { x: M.spawn.x, y: M.spawn.y, angle: -Math.PI / 2 };   // nothing clear: the map's own spawn
            },

            /** Call after an editor/script changes static rectangles within the current tick. */
            invalidatePhysicsSpatial(items) {
                if (items) _physicsSpatial.invalidate(items);
                else _physicsSpatial.clear();
                const M = this.activeMap;
                if (M) {
                    _physicsSpatial.track(M.walls); _physicsSpatial.track(getColliders(M));
                    // A slot replacement must also rebuild the concatenated occluders.
                    M._occluderCache = null;
                }
                if (NavGrid._cache && NavGrid._cache.map === M) NavGrid._cache.grid._epoch = -1;
                CollisionSystem._staticRows.length = 0;
            },

            /** Take a wall out of the live map (the suite's breach): its collision body, the render grid,
             *  the lamp shadows it cast, and (through its signature) the nav grid all follow. */
            removeWall(w) {
                const M = this.activeMap, i = M ? M.walls.indexOf(w) : -1;
                if (i < 0) return false;
                const bodies = this._staticWallEntities || [];
                const body = bodies.length === M.walls.length ? bodies[i] : null;   // built from this array, in this order
                M.walls.splice(i, 1);
                this.invalidatePhysicsSpatial();
                if (body) { body.active = false; body.markedForDestroy = true; body._finalDestroy(); bodies.splice(i, 1); }
                if (this._renderGridWalls) this._renderGridWalls.build(M.walls);
                this.bakeStaticLighting();
                return true;
            },

            /** Let go of the painted floors of every map but `keepId` (null: all of them) */
            _releaseMapBakes(keepId) {
                const keep = MAP_BAKES[keepId] || [];
                for (const id in MAP_BAKES) for (const k of MAP_BAKES[id]) if (this[k] && !keep.includes(k)) this[k] = null;
            },

            /** These buffers hold scratch draw records, never persistent gameplay state. */
            _releaseReflectionScratch() {
                this._reflPrepareMovers = this._reflGroundMovers = this._reflUpdateMovers = null;
                this._reflLightCars = this._reflVisiblePuddles = null;
                this._ultraMoverBuffer = this._ultraExtraRecords = this._ultraActorSeen = null;
                this._ultraCars = this._ultraCarSeen = this._ultraFoliageCandidates = null;
                this._ultraWalkerProxies = null;
                this._reflDetailCv = this._ultraWalkerCanvas = this._ultraCarScratch = null;   // Ultra's canvases (rebuilt on demand)
                this._refl = null;
            },

            /** What belongs to the map being left: effects at its coordinates, walks across its floor,
                a finisher or slow-mo in progress, and caches that would hold the old map alive. */
            _clearMapResidue() {
                // Direct scene/dev loads must also release a pending normal transition's fade.
                this._cancelMapTextureWarmup(!!this._mapTextureWarmup || !!this._mapTextureTransition);
                this._clearRenderSpatial();
                this._releaseReflectionScratch();
                this._effectSpatial = this._effectCandidateBuffers = null;
                _physicsSpatial.clear();
                CollisionSystem.clearSpatialGrid();
                if (this.finisher) this.endFinisher(true);
                this.finCam = null;
                this.timeSlowState = { active: false, scale: 1.0, targetScale: 1.0, duration: 0, transitionSpeed: 0.05 };
                this.casings = []; this.shotFx = []; this.muzzleFlashes = []; this.flitVFX = [];
                this._fireTrail = []; this._fireTrailSerial = 0;
                this.noiseRipples = []; this.lastKnownMarkers = [];
                this._edgeRipples = null; this._edgeTouch = null;                       // the veil's ripples (world/map-edge.js)
                if (typeof Walker !== 'undefined') {                                   // walks are across the old floor
                    for (const w of Walker.walks.slice()) Walker._end(w, 'cancelled');
                    if (this.player && this.player._walk) Walker._end(this.player._walk, 'cancelled');
                }
                if (typeof CrowdImpostors !== 'undefined') CrowdImpostors.clear();
                if (typeof PropSprites !== 'undefined') { PropSprites.clear(this.props); PlaneSprites.clear(this.activeMap && this.activeMap.buildings); }   // the old map's furniture and roof sprites
                // caches keyed by the old map (each rebuilds on its next use)
                this.skyLayer = null;
                if (typeof ambience !== 'undefined') { ambience._areaMap = null; ambience._areas = {}; }
                if (typeof NavGrid !== 'undefined') NavGrid._cache = null;
                if (typeof humanShadeReset === 'function') humanShadeReset();
                for (const c of [this.car, this.ownedCar, this.deliveryVehicle]) if (c) c._beamCache = null;
            },

            _doLoadMap(mapId, spawnAt) {
                // =========================================================
                //  PHASE 1: CLEANUP
                // =========================================================
                // A Zib ride doesn't survive the map changing under it (death, a scene): it ends, uncharged
                if (this.zibSystem && this.zibSystem.passengerRide) this.zibSystem.abandonRide(this);
                CollisionSystem.clearSpatialGrid();
                
                if (this._staticWallEntities) {
                    for (let entity of this._staticWallEntities) {
                        entity.active = false; entity.markedForDestroy = true; entity._finalDestroy();
                    }
                }
                this._staticWallEntities = [];
                if (this._staticBuildingEntities) {
                    for (let entity of this._staticBuildingEntities) {
                        entity.active = false; entity.markedForDestroy = true; entity._finalDestroy();
                    }
                }
                this._staticBuildingEntities = [];
                if (this._staticBillboardEntities) {
                    for (let entity of this._staticBillboardEntities) {
                        entity.active = false; entity.markedForDestroy = true; entity._finalDestroy();
                    }
                }
                this._staticBillboardEntities = [];
                
                for (let proj of this.projectiles) {
                    if (proj instanceof GameEntity) { proj.active = false; proj.markedForDestroy = true; }
                }
                this.projectiles = [];
                this.stickyOrbs = [];
                this._clearMapResidue();
                this._releaseMapBakes(mapId);
                
                GameEntity.queueEnabled = true;
                GameEntity.clearQueue();
                GameEntity.clearAll();
                
                this.neonSigns = [];
                
                if (mapId !== 'hub_949') {
                    this.traffic.reset();
                    this.pedestrians.reset();
                }
                
                // Clear landmark registry for fresh map
                this.landmarkRegistry = {};
                this.dropOffRegistry = {};
                
                // Clear all particles on map transition
                if (this.weather) {
                    this.weather.clearParticles();
                }

                // =========================================================
                //  PHASE 2: DEFINE ASSETS & MAPS
                // =========================================================
                
                // --- HUB ASSETS (lazy: only create for hub map) ---
                // --- BUILD MAP FROM DATA LAYER ---
                const entities = createMapEntities(mapId);
                const maps = {};
                for (const id in MAP_DATA) {
                    if (id === mapId) {
                        maps[id] = { ...MAP_DATA[id], ...entities };
                    } else {
                        maps[id] = { ...MAP_DATA[id], props: [], npcs: [], lamps: [] };
                    }
                }

                // =========================================================
                //  PHASE 3: PROCEDURAL GENERATION & AUTOMATION
                // =========================================================
                
                // --- HUB 949 (CITYLAYOUT V2) ---
                if (mapId === 'hub_949') {
                    const mapData = maps['hub_949'];
                    
                    if (this._hubCache) {
                        // =============================================================
                        //  FAST PATH: Restore from cache (skips all procedural generation)
                        // =============================================================
                        const c = this._hubCache;
                        
                        // Restore non-GameEntity data directly
                        mapData.buildings = c.buildings;
                        mapData.buildingColliders = c.buildingColliders;
                        mapData.cityLayout = c.cityLayout;
                        mapData.ferrisWheel = c.ferrisWheel;
                        mapData.pavements = c.pavements.map(p => Object.assign(new Pavement(p.x, p.y, p.w, p.h, p.poly), p.road ? { road: p.road } : {}));
                        mapData.crosswalks = [...c.crosswalks];
                        mapData.foliage = [...c.foliage];
                        mapData.walls = c.wallRects.map(w => ({...w}));
                        
                        // Restore road network + pedestrian sidewalk network
                        this.traffic.network = c.network;
                        this.pedestrians.setNetwork(c.sidewalkNetwork);
                        
                        // Recreate street/intersection LampEntity instances (GameEntities must be fresh)
                        mapData.lamps = c.lampConfigs.map(cfg => new LampEntity(cfg));
                        
                        // Regenerate building lights (old instances were destroyed by GameEntity.clearAll)
                        // Phase 4 will harvest these into mapData.lamps
                        mapData.buildings.forEach(b => {
                            if (b.regenerateLights) b.regenerateLights();
                        });
                        
                        // Flag so Phase 4 skips sign harvest (already handled below) but still harvests lights
                        this._hubCacheSkipSigns = true;
                        
                        // Recreate graveyard PropEntity instances
                        c.gravestoneConfigs.forEach(cfg => mapData.props.push(new PropEntity(cfg)));
                        
                        // Neon signs from cached buildings (NeonSign is NOT a GameEntity)
                        this.neonSigns = [];
                        mapData.buildings.forEach(b => {
                            if (b.attachedSign) this.neonSigns.push(b.attachedSign);
                        });
                        
                        // Restore landmarks
                        this.landmarkRegistry = {...c.landmarks};
                        this.dropOffRegistry = {...(c.dropOffs || {})};
                        
                        // Process queued GameEntities
                        GameEntity.processQueue();
                        
                        console.log('[HUB CACHE] Restored from cache — skipped procedural generation');
                        
                    } else {
                    // =============================================================
                    //  SLOW PATH: First-time procedural generation (cached after)
                    // =============================================================
                    
                    // Track original prop count so we can extract graveyard stones for cache later
                    this._hubCache_hubPropCount = mapData.props.length;

                    // The same city every visit: generation draws from a seeded stream (restored below)
                    const _unseededRandom = Math.random;
                    Math.random = seededRandom(949);
                    
                    // 1. CREATE CITY LAYOUT
                    // The whole map: the old city is its north-west corner, as it was (the story's spots are there), and the
                    // city grows east and south from it. Rows: block_[row]_[col] counts the roads' edges from the north-west.
                    const city = new CityLayout({
                        width: mapData.width,
                        height: mapData.height,
                        margin: 25
                    });
                    
                    // 2. DEFINE ROAD GRID
                    // Horizontal roads (Y = center position)
                    // First road pushed south so the Silver Queen's portico and the Double Nights' drive stay off its pavement
                    city.addHorizontalRoad(1260, 'Hotel Dr.', 2);
                    city.addHorizontalRoad(2500, 'Crimson Blvd', 3);     // Main artery
                    city.addHorizontalRoad(3800, 'Commerce Blvd', 2);
                    city.addHorizontalRoad(4900, 'Skyline Ave', 2);
                    city.addHorizontalRoad(6100, 'Clinic Way', 2);
                    city.addHorizontalRoad(7400, 'Gridlock Ln', 3);
                    city.addHorizontalRoad(8700, 'Ashgrove St', 2);
                    city.addHorizontalRoad(9900, 'Foundry Rd', 2);
                    city.addHorizontalRoad(11000, 'Southern Pkwy', 3);   // the graveyard's gate opens onto it
                    
                    // Vertical highways. Between Velvet Ave and Meridian Ave a column of wide blocks (2890 px) has room for
                    // two landmarks side by side, and the graveyard at its foot
                    city.addVerticalRoad(1200, 'West Ave', 2);
                    city.addVerticalRoad(2800, 'East Ave', 2);
                    city.addVerticalRoad(4400, 'Velvet Ave', 3);
                    city.addVerticalRoad(7800, 'Meridian Ave', 3);
                    city.addVerticalRoad(9500, 'Eclipse St', 2);
                    city.addVerticalRoad(11200, 'Harbor St', 2);
                    
                    // An angled street: Lantern Cut cuts the corner of the block below Clinic Way, from the middle of Clinic Way
                    // down to East Ave (world/city-layout.js addAngledRoad: a T at each end, the block's rows step along it).
                    // Each T sits well clear of the next junction along, so a car through one can stop for the other's red.
                    city.addAngledRoad(1950, 6100, 2800, 6800, 'Lantern Cut', 2);
                    // And a curved one: Halfmoon Bend leaves Skyline Ave heading south, bends round to the west and meets East Ave
                    // (addCurvedRoad: a lane each way, the corner rounded to a 220 px radius; straight for a while at each end, so each T is square)
                    city.addCurvedRoad([[3550, 4900], [3550, 5500], [2800, 5500]], 'Halfmoon Bend', 1, { radius: 220 });
                    // The newer city's: two cuts across corners and two bends (each T well clear of the junctions either side of it)
                    city.addAngledRoad(10300, 8700, 11200, 9400, 'Foxglove Cut', 2);           // Ashgrove St down to Harbor St
                    city.addAngledRoad(6900, 9900, 7800, 10600, 'Starling Diagonal', 2);      // Foundry Rd down to Meridian Ave
                    city.addCurvedRoad([[8900, 6100], [8900, 6800], [7800, 6800]], 'Crescent Row', 1, { radius: 220 });   // Clinic Way round to Meridian Ave
                    city.addCurvedRoad([[6000, 3800], [6000, 4400], [7800, 4400]], 'Velvet Hook', 1, { radius: 260 });    // Commerce Blvd round to Meridian Ave
                    
                    // 3. GENERATE BLOCKS (must be done before placing buildings); the parks are kept free (world/parks.js),
                    // and the graveyard's block (11d) is kept clear for it
                    for (const [block, name] of Object.entries(HUB_PARKS)) city.setZoneType(block, CityLayout.ZONE.PARK, { name });
                    city.setZoneType(HUB_BLOCKS.graveyard, CityLayout.ZONE.RESERVED, { name: 'Graveyard' });
                    city.generateBlocks();
                    
                    // Debug: Log blocks to console
                    console.log('CityLayout Blocks:', city.listBlocks());
                    
                    // 4. REGISTER BUILDING TEMPLATES
                    // V2 buildings are auto-registered from BuildingV2Registry
                    city.registerV2Buildings();
                    
                    // Register V1 templates and override V2 landmarkIds where needed
                    city.registerTemplates({
                        // V2 buildings: just specify landmarkId (dimensions come from registry)
                        silver_queen: { landmarkId: 'parking_spot', margin: 15 },   // portico and all, it's 1030 px deep: a narrower margin fits it in its block
                        enni_cole: { landmarkId: 'enni_cole' },
                        double_nights: { landmarkId: 'hotel_entrance' },
                        cozy_cafe: { landmarkId: 'cozy_cafe' },
                        
                        // V2 buildings (auto-detected from BuildingV2Registry)
                        moon_city: {
                            landmarkId: 'club_entrance',
                            door: { target: 'moon_city_nightclub', label: 'Enter Club', lightColor: '#ff3a6a' }
                        },
                        neural_sys: {
                            landmarkId: 'neural_systems',
                            door: { target: 'neural_sys_interior', label: 'Enter Neural Systems', lightColor: '#0088ff' }
                        },
                        torque_auto: { landmarkId: 'torque_auto' },
                        cozy_cafe: { landmarkId: 'cozy_cafe' },
                        biggs_park: { landmarkId: 'biggs_park' },
                        dr_yins: {
                            landmarkId: 'clinic',
                            door: { target: 'medbay_sw', label: 'Enter Clinic', lightColor: '#00f3ff' }
                        },
                        // Generic V2 templates for auto-fill (detected from BuildingV2Registry)
                        apartment_small: {
                            weight: 3
                        },
                        shop_small: {
                            weight: 3
                        },
                        warehouse: {
                            weight: 2
                        }
                    });
                    
                    // 5. PLACE KEY BUILDINGS
                    // Block naming: block_[row]_[col]
                    // Rows: 0, 2, 4 ... 18 (even numbers - odd rows are road zones), north to south
                    // Cols: 0, 2, 4 ... 12 (even numbers - odd cols are road zones), west to east; col 6 is the wide one
                    // Where landmarks share a block they stand side by side along its south street, each with its own door,
                    // Zib drop-off and lamp colour (setLandmarkLampColors below)
                    
                    city.placeBuilding('silver_queen', 'block_0_0', { align: 'center' });   // Silver Queen Apartments - NW, home
                    city.placeBuilding('double_nights', 'block_0_2', { align: 'bottom', margin: 5 });  // Double Nights Hotel - N, its drive meeting the pavement
                    // Crimson Blvd's strip, east of home: Torque Auto and the Cozy Cafe in one wide block
                    city.corner(HUB_BLOCKS.cafe, 'sw', 'cozy_cafe', { margin: 60 });
                    city.corner(HUB_BLOCKS.cafe, 'se', 'torque_auto', { margin: 60 });
                    // The middle of the city: Moon City and Enni Cole, side by side on Clinic Way
                    city.placeAt('moon_city', city.blockMap[HUB_BLOCKS.club].x + 420, city.blockMap[HUB_BLOCKS.club].y + 60);
                    city.placeAt('enni_cole', city.blockMap[HUB_BLOCKS.club].x + 1520, city.blockMap[HUB_BLOCKS.club].y + 55);
                    // East: Dr. Yin's and Neural Systems share a block on Commerce Blvd
                    city.corner(HUB_BLOCKS.clinic, 'sw', 'dr_yins', { margin: 60 });
                    city.corner(HUB_BLOCKS.clinic, 'se', 'neural_sys', { margin: 60 });
                    city.placeBuilding('biggs_park', HUB_BLOCKS.biggs, { align: 'center' });    // Biggs Amusement Park - south-east, its wheel above it

                    // 5a. A HAND-LAID BLOCK (world/city-layout.js: row, corner, lot, placeAt)
                    // NE of Double Nights: a shop parade along Hotel Dr., wall to wall, a second row fronting East Ave.
                    // round the corner (facing west, onto it) and a warehouse behind
                    city.row('block_0_4', 'south', ['shop_small', 'apartment_small', 'shop_small'], { gap: 0, setback: 12 });
                    city.row('block_0_4', 'west', ['shop_small', 'apartment_small'], { gap: 0, setback: 12, justify: 'start' });
                    city.corner('block_0_4', 'ne', 'warehouse');
                    
                    // 5b. SET CUSTOM LAMP COLORS
                    // V2 buildings auto-set their block lamp colors from accent color; these go with the landmark wherever it
                    // stands (a block shared by two is split between their colours: world/city-layout.js)
                    city.setLandmarkLampColors({
                        moon_city: '#ff00aa',      // Moon City Nightclub - hot pink (its own lights keep their colours). Violet '#b48cff' was the first pick: swap back here to revert
                        dr_yins: '#00f3ff',        // Dr. Yin's Clinic - medical cyan
                        neural_sys: '#0088ff',     // Neural Systems - tech blue
                        biggs_park: '#ff8800'      // Biggs Amusement Park - carnival amber
                    });
                    
                    // 5b. RESERVE SCRIPTED NPC ANCHORS
                    // Must happen BEFORE autoFillAll — _findValidPosition rejects any
                    // candidate rect that intersects a safe zone, so reserving here is
                    // what stops a filler building spawning on Mirabel or Anavia.
                    for (const a of HUB_NPC_ANCHORS) {
                        city._addSafeZone(
                            a.x - HUB_NPC_CLEARANCE, a.y - HUB_NPC_CLEARANCE,
                            HUB_NPC_CLEARANCE * 2, HUB_NPC_CLEARANCE * 2,
                            `NPC: ${a.name}`
                        );
                    }

                    city._addSafeZone(HUB_OLLO_DOOR.x - 120, HUB_OLLO_DOOR.y - 260, HUB_OLLO_DOOR.w + 240, HUB_OLLO_DOOR.h + 260, 'OllO Plaza door');
                    
                    // 6. AUTO-FILL REMAINING BLOCKS
                    // Rows along every street a block fronts, facing the road (world/city-layout.js _fillStreetFronts);
                    // the Scrapyard keeps its scattered cover. fill: how much of each street front gets buildings
                    // (lower it if the busier streets cost too much frame on a phone)
                    city.autoFillAll({
                        density: 0.4,
                        fill: 1,
                        categories: ['residential', 'shopping', 'commercial'],
                        scatter: [HUB_BLOCKS.scrapyard],
                        fillPartial: [HUB_BLOCKS.cafe, HUB_BLOCKS.club, HUB_BLOCKS.clinic]   // the shared blocks: rows round their landmarks
                    });
                    
                    // 7. CREATE ROAD NETWORK
                    resetRoadNetworkIds();
                    this.traffic.network = new RoadNetwork();
                    {
                        const net = this.traffic.network;
                        
                        // Add horizontal roads
                        city.horizontalRoads.forEach(r => {
                            net.addRoad(createRoad(0, r.y, city.width, r.roadHeight, 'H', r.name, r.lanes, true, true));
                        });
                        
                        // Add vertical roads
                        city.verticalRoads.forEach(r => {
                            net.addRoad(createRoad(r.x, 0, r.roadWidth, city.height, 'V', r.name, r.lanes, true, true));
                        });
                        
                        // And the angled ones (their junctions come out as the shape where the carriageways meet: roads.js)
                        city.angledRoads.forEach(r => {
                            net.addRoad(new Road(r.curved ? { path: r.path, name: r.name, lanes: r.lanes, hasPavements: true } : { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, name: r.name, lanes: r.lanes, hasPavements: true }));
                        });
                        
                        net.buildGraph();
                    }
                    const net = this.traffic.network;
                    
                    // 8. CREATE BUILDINGS
                    const buildings = city.placedBuildings.map(p => {
                        const t = p.template;
                        
                        // Check BuildingV2Registry first (single source of truth)
                        if (t.isV2 && BuildingV2Registry.has(p.templateId)) {
                            const facing = p.options && (p.options.facing || p.options.row) ? CityLayout.facing(p) : undefined;
                            const building = BuildingV2Registry.create(p.templateId, p.originX ?? p.x, p.originY ?? p.y, { 
                                doorTarget: t.door?.target, ...(facing ? { facing } : {}), ...(p.options.autoPlaced && facing ? { shopfront: 'pool' } : {})
                            });
                            // Propagate mapCategory from template for map icons
                            if (t.mapCategory) building.mapCategory = t.mapCategory;
                            return building;
                        }
                        
                        // Legacy V1 buildings
                        const config = {};
                        if (t.sign) config.sign = { ...t.sign };
                        if (t.door) config.door = { ...t.door };
                        return new Building(p.x, p.y, p.w, p.h, t.color, t.label, t.type, config);
                    });
                    mapData.buildings = buildings;
                    
                    // Compute Zib taxi drop-off points (south-curb projection per landmark).
                    // Stored on mapData and merged into game registry below alongside landmarks.
                    mapData.dropOffs = city.computeDropOffs(net, buildings);
                    console.log(`Computed ${Object.keys(mapData.dropOffs).length} Zib drop-offs`);
                    
                    // Create Ferris Wheel next to Biggs Amusement Park
                    const biggsBuilding = buildings.find(b => b.id === 'biggs_park');
                    const biggsBlock = city.blockMap[HUB_BLOCKS.biggs];
                    if (biggsBuilding && biggsBlock) {
                        const blockCenterX = biggsBlock.x + biggsBlock.w / 2;
                        const aboveBuildingY = biggsBuilding.y - 100; // Just above the building
                        mapData.ferrisWheel = new FerrisWheel(
                            blockCenterX,
                            aboveBuildingY,
                            { radius: 560, axleHeight: 600, gondolas: 8, speed: 0.003, rimGap: 112, facing: 0 }
                        );
                    }
                    
                    // Biggs Park's dark forecourt (a floor zone: it tints the ground, ground-baker.js), under it and its wheel
                    if (biggsBuilding && biggsBlock) {
                        const cx = biggsBlock.x + biggsBlock.w / 2;
                        mapData.floorZones = mapData.floorZones.filter(z => !z.biggs);
                        mapData.floorZones.push({ x: cx - 600, y: biggsBlock.y + biggsBlock.h - 405, w: 1200, h: 400, color: '#222', biggs: true });
                    }
                    
                    // Build per-section collision shapes for old-style collision checks
                    // (vehicles, NPCs, LOS). Flattens V2 multi-section buildings.
                    mapData.buildingColliders = [];
                    buildings.forEach(b => {
                        if (b.isV2 && b.getCollisionShapes) {
                            mapData.buildingColliders.push(...b.getCollisionShapes());
                        } else {
                            mapData.buildingColliders.push({ x: b.x, y: b.y, w: b.w, h: b.h });
                        }
                    });
                    
                    // Store city reference for later lamp color application
                    mapData.cityLayout = city;
                    
                    // ── RESTRICTED ZONE (Hostile farming area) ──
                    // The Scrapyard: the far south-east, between Foundry Rd & Southern Pkwy
                    const rzBlock = city.blockMap[HUB_BLOCKS.scrapyard];
                    console.log('[RESTRICTED ZONE]', HUB_BLOCKS.scrapyard, rzBlock ? `${rzBlock.x},${rzBlock.y} ${rzBlock.w}x${rzBlock.h}` : 'NOT FOUND');
                    if (rzBlock) {
                        this.restrictedZone = new RestrictedZone({
                            id: 'rz_scrapyard',
                            name: 'THE SCRAPYARD',
                            x: rzBlock.x + 10,
                            y: rzBlock.y + 10,
                            w: rzBlock.w - 20,
                            h: rzBlock.h - 20,
                            hostileCount: 8,
                            respawnDelay: 900, // ~15 seconds
                            mapId: 'hub_949'
                        });
                        // Set block lamp color to danger crimson
                        city.setBlockLampColors({ [HUB_BLOCKS.scrapyard]: '#ff2200' });
                        
                        // Ground visual — dark crimson floor tint so the zone is visible in-world
                        mapData.floorZones.push({
                            x: rzBlock.x, y: rzBlock.y, w: rzBlock.w, h: rzBlock.h,
                            color: '#1a0505'
                        });
                        
                        console.log('[RESTRICTED ZONE] Created at', this.restrictedZone.x, this.restrictedZone.y, this.restrictedZone.w, 'x', this.restrictedZone.h);
                    } else {
                        console.warn(`[RESTRICTED ZONE] ${HUB_BLOCKS.scrapyard} not found in city layout! Available blocks:`, Object.keys(city.blockMap).join(', '));
                    }
                    
                    // 8b. EXTRACT LANDMARKS FROM BUILDINGS
                    const buildingLandmarks = city.extractLandmarks();
                    console.log('Building Landmarks:', Object.keys(buildingLandmarks));
                    
                    // Merge into game's landmark registry
                    this.landmarkRegistry = {
                        ...this.landmarkRegistry,
                        ...buildingLandmarks
                    };
                    
                    // Merge Zib drop-offs into game registry (one entry per landmarkId).
                    this.dropOffRegistry = { ...(mapData.dropOffs || {}) };
                    
                    // 9. GENERATE SMART PAVEMENTS
                    const generateSmartPavements = (road) => {
                        const paves = [];
                        const pavW = 75;
                        const intersections = net.getIntersectionsForRoad(road);
                        const exclusions = [];
                        
                        intersections.forEach(ix => {
                            if (ix.poly) return;   // where an angled road joins: cut to its shape below (city.cutPavements)
                            let start, end;
                            if (road.orientation === 'H') {
                                start = ix.x - road.x;
                                end = (ix.x + ix.width) - road.x;
                            } else {
                                start = ix.y - road.y;
                                end = (ix.y + ix.height) - road.y;
                            }
                            exclusions.push({ s: start - 2, e: end + 2 });
                        });
                        
                        exclusions.sort((a, b) => a.s - b.s);
                        
                        const segments = [];
                        let curr = 0;
                        exclusions.forEach(ex => {
                            if (ex.s > curr) segments.push({ s: curr, e: ex.s });
                            curr = Math.max(curr, ex.e);
                        });
                        if (curr < road.length) segments.push({ s: curr, e: road.length });
                        
                        segments.forEach(seg => {
                            const len = seg.e - seg.s;
                            if (len < 10) return;
                            
                            if (road.orientation === 'H') {
                                paves.push(new Pavement(road.x + seg.s, road.y - pavW, len, pavW));
                                paves.push(new Pavement(road.x + seg.s, road.y + road.h, len, pavW));
                            } else {
                                paves.push(new Pavement(road.x - pavW, road.y + seg.s, pavW, len));
                                paves.push(new Pavement(road.x + road.w, road.y + seg.s, pavW, len));
                            }
                        });
                        return paves;
                    };
                    
                    const straightPaves = [];
                    net.roads.forEach(r => {
                        if (!r.isDiagonal) straightPaves.push(...generateSmartPavements(r));
                    });
                    // ...cut where an angled road joins, and the angled roads' own (polygons, with their bounds as x, y, w, h)
                    mapData.pavements = city.cutPavements(straightPaves).map(p => p.poly ? new Pavement(p.x, p.y, p.w, p.h, p.poly) : p)
                        .concat(city.angledPavements().map(({ poly, road }) => { const b = Poly.box(poly), p = new Pavement(b.x, b.y, b.w, b.h, poly); p.road = road; return p; }));
                    
                    // Generate crosswalks from CityLayout (knows all intersection positions)
                    mapData.crosswalks = city.generateCrosswalks();
                    
                    // Generate sidewalk network for pedestrians
                    const sidewalkNetwork = city.generateSidewalkNetwork();
                    this.pedestrians.setNetwork(sidewalkNetwork);
                    console.log(`Sidewalk Network: ${sidewalkNetwork.nodes.length} nodes, ${sidewalkNetwork.crosswalks.length} crosswalks`);
                    
                    // 10. GENERATE WALLS (Automatic from CityLayout!)
                    const generatedWalls = city.generateWalls(mapData.width, mapData.height);
                    // Push generated boundary walls into mapData.walls so Phase 4
                    // creates static entities for them (fixes boundary collision)
                    mapData.walls.push(...generatedWalls);
                    
                    // 11. GENERATE LAMPS
                    mapData.lamps = [];
                    net.roads.forEach(r => {
                        mapData.lamps.push(...r.generateLamps(net, 350));
                    });
                    
                    // 11b. APPLY CUSTOM BLOCK LAMP COLORS
                    city.applyBlockLampColors(mapData.lamps);
                    
                    // 11b2. ADD INTERSECTION CORNER LAMPS
                    const cornerInset = 40; // Distance from intersection edge
                    net.intersections.forEach(ix => {
                        // Four corners of each intersection
                        const corners = [
                            { x: ix.x - cornerInset, y: ix.y - cornerInset },                    // Top-left
                            { x: ix.x + ix.width + cornerInset, y: ix.y - cornerInset },        // Top-right
                            { x: ix.x - cornerInset, y: ix.y + ix.height + cornerInset },       // Bottom-left
                            { x: ix.x + ix.width + cornerInset, y: ix.y + ix.height + cornerInset } // Bottom-right
                        ];
                        
                        corners.forEach(corner => {
                            mapData.lamps.push(new LampEntity({
                                x: corner.x,
                                y: corner.y,
                                lampType: 2,
                                color: '#ffaa44',
                                lightRadius: 280
                            }));
                        });
                    });
                    
                    console.log(`Added ${net.intersections.length * 4} intersection corner lamps`);
                    
                    // 11c. GENERATE FOLIAGE (Trees and Bushes along streets)
                    mapData.foliage = [];
                    const foliageSpacing = 180; // Distance between trees
                    const foliageInset = 50;    // Distance from road edge
                    
                    const glowKinds = ['glow_purple', 'glow_pink', 'glow_gold', 'glow_green', 'glow_cyan'];
                    net.roads.forEach(road => {
                        if (road.isDiagonal) {
                            // An angled road: a tree now and then down each pavement, clear of its ends' junctions and crossings
                            const ex = net.getIntersectionsForRoad(road).map(ix => (ix.poly || []).map(q => road.worldToParam(q.x, q.y).along));
                            const from = Math.max(50, ...ex.filter(a => a.length && Math.max(...a) < road.length / 2).map(a => Math.max(...a) + 160));
                            const to = Math.min(road.length - 50, ...ex.filter(a => a.length && Math.min(...a) > road.length / 2).map(a => Math.min(...a) - 160));
                            for (const sd of [-1, 1]) for (let a = from + foliageSpacing / 2; a < to; a += foliageSpacing * 1.4) {
                                const p = road.paramToWorld(a + (Math.random() - 0.5) * 30, sd * (road.thickness / 2 + foliageInset));
                                const r = Math.random(), type = r < 0.6 ? 'tree' : r < 0.75 ? 'bush' : glowKinds[Math.floor(Math.random() * glowKinds.length)];
                                mapData.foliage.push(new Foliage(p.x, p.y, type, 1.2 + Math.random() * 0.6));
                            }
                            return;
                        }
                        // Get intersections to avoid placing trees there
                        const intersections = net.getIntersectionsForRoad(road);
                        const exclusions = [];
                        
                        intersections.forEach(ix => {
                            let start, end;
                            if (road.orientation === 'H') {
                                start = ix.x - road.x - 80;
                                end = (ix.x + ix.width) - road.x + 80;
                            } else {
                                start = ix.y - road.y - 80;
                                end = (ix.y + ix.height) - road.y + 80;
                            }
                            exclusions.push({ start, end });
                        });
                        exclusions.sort((a, b) => a.start - b.start);
                        
                        // Merge overlapping exclusions
                        const merged = [];
                        if (exclusions.length > 0) {
                            let curr = exclusions[0];
                            for (let i = 1; i < exclusions.length; i++) {
                                if (curr.end >= exclusions[i].start) {
                                    curr.end = Math.max(curr.end, exclusions[i].end);
                                } else {
                                    merged.push(curr);
                                    curr = exclusions[i];
                                }
                            }
                            merged.push(curr);
                        }
                        
                        // Find valid segments
                        const segments = [];
                        let cursor = 50; // Start a bit in from road start
                        merged.forEach(ex => {
                            if (ex.start > cursor) segments.push({ start: cursor, end: ex.start });
                            cursor = Math.max(cursor, ex.end);
                        });
                        if (cursor < road.length - 50) segments.push({ start: cursor, end: road.length - 50 });
                        
                        // Place foliage along both sides
                        segments.forEach(seg => {
                            const len = seg.end - seg.start;
                            if (len < foliageSpacing) return;
                            
                            const count = Math.floor(len / foliageSpacing);
                            
                            // Glowing tree types for variety
                            const glowTypes = ['glow_purple', 'glow_pink', 'glow_gold', 'glow_green', 'glow_cyan'];
                            
                            for (let i = 0; i < count; i++) {
                                const offset = seg.start + foliageSpacing * (i + 0.5) + (Math.random() - 0.5) * 30;
                                
                                // Randomly choose type (60% trees, 15% bushes, 10% palms, 15% glowing)
                                const rand = Math.random();
                                let type, size;
                                if (rand < 0.60) {
                                    type = 'tree';
                                    size = 1.4 + Math.random() * 0.6;
                                } else if (rand < 0.75) {
                                    type = 'bush';
                                    size = 1.0 + Math.random() * 0.5;
                                } else if (rand < 0.85) {
                                    type = 'palm';
                                    size = 1.4 + Math.random() * 0.6;
                                } else {
                                    // Glowing tree!
                                    type = glowTypes[Math.floor(Math.random() * glowTypes.length)];
                                    size = 1.3 + Math.random() * 0.5;
                                }
                                
                                if (road.orientation === 'H') {
                                    // Top side
                                    mapData.foliage.push(new Foliage(
                                        road.x + offset,
                                        road.y - foliageInset - Math.random() * 20,
                                        type, size
                                    ));
                                    // Bottom side (different type for variety)
                                    const rand2 = Math.random();
                                    const type2 = rand2 < 0.5 ? 'tree' : (rand2 < 0.7 ? 'bush' : glowTypes[Math.floor(Math.random() * glowTypes.length)]);
                                    mapData.foliage.push(new Foliage(
                                        road.x + offset + (Math.random() - 0.5) * 40,
                                        road.y + road.h + foliageInset + Math.random() * 20,
                                        type2, 1.2 + Math.random() * 0.6
                                    ));
                                } else {
                                    // Left side
                                    mapData.foliage.push(new Foliage(
                                        road.x - foliageInset - Math.random() * 20,
                                        road.y + offset,
                                        type, size
                                    ));
                                    // Right side
                                    const rand2 = Math.random();
                                    const type2 = rand2 < 0.5 ? 'tree' : (rand2 < 0.7 ? 'bush' : glowTypes[Math.floor(Math.random() * glowTypes.length)]);
                                    mapData.foliage.push(new Foliage(
                                        road.x + road.w + foliageInset + Math.random() * 20,
                                        road.y + offset + (Math.random() - 0.5) * 40,
                                        type2, 1.2 + Math.random() * 0.6
                                    ));
                                }
                            }
                        });
                    });
                    
                    // Keep the landmark forecourts (Silver Queen's portico and carpet, Double Nights' drive and fountain) clear of street trees
                    for (const b of mapData.buildings || []) {
                        const court = b.style === 'silver_queen' && b._sqForecourt ? b._sqForecourt() : b.style === 'double_nights' ? b._dnForecourt() : b.style === 'moon_city' ? b._mcForecourt() : null;
                        if (!court) continue;
                        const inCourt = (o, front = 0) => o.x > court.x && o.x < court.x + court.w && o.y > court.y && o.y < court.y + court.h + front;
                        mapData.foliage = mapData.foliage.filter(f => !inCourt(f, 110));   // nor on the pavement in front, where a canopy would hide the steps
                        mapData.lamps = mapData.lamps.filter(l => !inCourt(l));
                    }
                    // and the pavement in front of a row of shopfronts (city.row, whichever street it fronts): a street wall shows its fronts, its trees go elsewhere
                    for (const pl of city.placedBuildings) {
                        if (!pl.options || !pl.options.row || pl.options.autoPlaced) continue;   // (the auto-filled streets keep their trees)
                        const e = pl.extent, F = CityLayout.facing(pl), R = 140;   // the front, out across the pavement
                        const zone = { x: e.x - 30 - (F === 'W' ? R : 0), y: e.y - (F === 'N' ? R : 0), w: e.w + 60 + (F === 'E' || F === 'W' ? R : 0), h: e.h + (F === 'S' || F === 'N' ? R : 0) };
                        mapData.foliage = mapData.foliage.filter(f => !(f.x > zone.x && f.x < zone.x + zone.w && f.y > zone.y && f.y < zone.y + zone.h));
                    }
                    // The parks' trees and lanterns (their ground is painted by the ground baker)
                    for (const b of city.blocks) {
                        if (b.type !== CityLayout.ZONE.PARK) continue;
                        const P = parkLayout(b);
                        for (const t of P.trees) mapData.foliage.push(new Foliage(t.x, t.y, t.type, t.size));
                        for (const l of P.lamps) mapData.lamps.push(new LampEntity({ x: l.x, y: l.y, lampType: 1, color: '#ffd9a8', lightRadius: 170 }));
                    }
                    console.log(`Generated ${mapData.foliage.length} foliage elements (including glowing trees)`);
                    
                    // 11d. SOUTHERN GRAVEYARD
                    // Large cemetery in the wide block on the city's southern edge (HUB_GRAVEYARD), its gate onto
                    // Southern Pkwy, with stone walls, warm lamps, gravestones, and Ms. Jean's spawn point at center.
                    {
                        const { x: gx, y: gy, w: gw, h: gh } = HUB_GRAVEYARD;
                        const wallT = 30;         // Wall thickness
                        const gateW = 300;        // North entrance gap width
                        const gateCX = gx + gw / 2; // Gate center X
                        
                        // Stone walls (added directly as StaticEntities)
                        const graveyardWalls = [
                            // North wall - left of gate
                            { x: gx, y: gy, w: gateCX - gateW / 2 - gx, h: wallT },
                            // North wall - right of gate
                            { x: gateCX + gateW / 2, y: gy, w: (gx + gw) - (gateCX + gateW / 2), h: wallT },
                            // South wall
                            { x: gx, y: gy + gh - wallT, w: gw, h: wallT },
                            // West wall
                            { x: gx, y: gy, w: wallT, h: gh },
                            // East wall
                            { x: gx + gw - wallT, y: gy, w: wallT, h: gh }
                        ];
                        
                        graveyardWalls.forEach(w => {
                            this._staticWallEntities.push(new GameEntity({
                                type: 'wall', x: w.x, y: w.y,
                                width: w.w, height: w.h,
                                hasCollision: true,
                                collisionLayer: GameEntity.LAYER.STATIC,
                                collisionShape: GameEntity.SHAPE.AABB,
                                isStatic: true
                            }));
                            // Also add to mapData.walls for rendering
                            mapData.walls.push(w);
                        });
                        
                        // Gravestones - scattered in rows throughout the graveyard
                        const stoneMargin = 120;     // Inset from walls
                        const rowSpacing = 160;       // Y gap between rows
                        const colSpacing = 120;       // X gap between stones
                        const stoneArea = {
                            x: gx + stoneMargin,
                            y: gy + stoneMargin,
                            w: gw - stoneMargin * 2,
                            h: gh - stoneMargin * 2
                        };
                        
                        const seed = 949;
                        const rng = (i) => { const s = Math.sin(seed + i * 127.1) * 43758.5453; return s - Math.floor(s); };
                        let si = 0;
                        
                        for (let row = stoneArea.y; row < stoneArea.y + stoneArea.h - 40; row += rowSpacing) {
                            for (let col = stoneArea.x; col < stoneArea.x + stoneArea.w - 30; col += colSpacing) {
                                // Slight random offset for organic feel
                                const ox = (rng(si++) - 0.5) * 30;
                                const oy = (rng(si++) - 0.5) * 20;
                                // Skip ~20% for gaps and paths
                                if (rng(si++) < 0.2) continue;
                                
                                // The carving (drawGraveStone): mostly headstones and arches, now and then
                                // a cross, an obelisk, an angel, a ledger, a broken stone, a family stone.
                                // Its own hash, so the layout (the si sequence) is unchanged.
                                const variant = [0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7][Math.floor(rng(si * 7 + 5003) * 13)];
                                mapData.props.push(new PropEntity({
                                    x: col + ox, y: row + oy,
                                    width: 30 + rng(si++) * 15,
                                    height: 45 + rng(si++) * 20,
                                    color: '#555',
                                    mass: 50000, // Immovable
                                    decorType: 'gy_stone', variant
                                }));
                            }
                        }
                        
                        // Warm single-bulb lamps - evenly distributed throughout graveyard
                        const lampSpacing = 350;
                        const lampMargin = 100;
                        
                        for (let ly = gy + lampMargin; ly < gy + gh - lampMargin; ly += lampSpacing) {
                            for (let lx = gx + lampMargin; lx < gx + gw - lampMargin; lx += lampSpacing) {
                                mapData.lamps.push(new LampEntity({
                                    x: lx, y: ly,
                                    lampType: 1,         // Antiquated single-bulb
                                    color: '#ffaa55',    // Warm amber
                                    lightRadius: 300
                                }));
                            }
                        }
                        
                        // Gate lamps - flanking the north entrance
                        mapData.lamps.push(new LampEntity({ x: gateCX - gateW / 2 - 15, y: gy, lampType: 1, color: '#ffaa55', lightRadius: 350 }));
                        mapData.lamps.push(new LampEntity({ x: gateCX + gateW / 2 + 15, y: gy, lampType: 1, color: '#ffaa55', lightRadius: 350 }));
                        
                        // Register graveyard landmark (for Ms. Jean spawn)
                        this.landmarkRegistry['graveyard_center'] = { x: gateCX, y: gy + gh / 2 };
                        
                        console.log(`Graveyard: ${graveyardWalls.length} walls, ${mapData.props.length - entities.props.length} gravestones, lamps placed`);
                    }
                    
                    // 12. REGISTER NEON SIGNS
                    this.neonSigns = [];
                    buildings.forEach(build => {
                        if (build.attachedSign) this.neonSigns.push(build.attachedSign);
                    });
                    
                    // 13. PROCESS ENTITY QUEUE
                    GameEntity.processQueue();
                    
                    console.log(`CityLayout v2: Generated ${buildings.length} buildings, ${city.blocks.length} blocks`);
                    
                    // =========================================================
                    //  CACHE RESULTS for instant restore on future visits
                    // =========================================================
                    Math.random = _unseededRandom;
                    this._hubCache = {
                        buildings: mapData.buildings,
                        buildingColliders: mapData.buildingColliders,
                        cityLayout: mapData.cityLayout,
                        ferrisWheel: mapData.ferrisWheel || null,
                        network: this.traffic.network,
                        sidewalkNetwork: sidewalkNetwork,
                        pavements: mapData.pavements.map(p => ({...p})),
                        crosswalks: mapData.crosswalks.map(c => ({...c})),
                        foliage: [...mapData.foliage],
                        wallRects: mapData.walls.map(w => ({...w})),
                        landmarks: {...this.landmarkRegistry},
                        dropOffs: {...this.dropOffRegistry},
                        lampConfigs: mapData.lamps.map(l => ({
                            x: l.x, y: l.y, lampType: l.lampType,
                            color: l.color, lightRadius: l.lightRadius,
                            angle: l.angle || 0
                        })),
                        gravestoneConfigs: (() => {
                            // All props after the initial entity props are graveyard gravestones
                            const hubPropCount = this._hubCache_hubPropCount;
                            return mapData.props.slice(hubPropCount).map(p => ({
                                x: p.x, y: p.y, width: p.width, height: p.height,
                                color: p.color, mass: p.mass,
                                decorType: p.decorType, variant: p.decor ? p.decor.variant : 0
                            }));
                        })()
                    };
                    console.log('[HUB CACHE] Cached procedural generation results');
                    
                    } // end of else (!this._hubCache) — first-time generation
                }
                
                // =========================================================
                //  PHASE 4: LOAD MAP DATA
                // =========================================================
                this.activeMap = maps[mapId] || maps['hub_949'];
                this.uiLocation.textContent = this.activeMap.label;

                // --- WEATHER: adopt this map's climate ---
                // Only outdoor maps change the odds table. Indoor maps leave it
                // alone: you haven't left the city by walking into a cafe, and
                // the sky should be unchanged when you come back out.
                if (this.weather) {
                    if (this.activeMap.climate) {
                        this.weather.setClimate(this.activeMap.climate);
                    } else if (this.activeMap.type === 'outdoor') {
                        this.weather.setClimate('_default');
                    }
                    // Suppression is reset further down, once the room system for
                    // this map has actually been built — see "WEATHER: resolve
                    // indoor suppression" below.
                }

                // --- NEW: HARVEST ATTACHMENTS FROM BUILDINGS ---
                // This automatically pulls signs and doors defined in the Building constructor
                if (this.activeMap.buildings) {
                    // Strip building-generated transitions from previous loads
                    // (prevents accumulation when MAP_DATA arrays get mutated by push)
                    if (this.activeMap.transitions) {
                        this.activeMap.transitions = this.activeMap.transitions.filter(t => !t._fromBuilding);
                    } else {
                        this.activeMap.transitions = [];
                    }
                    
                    // On cache restore, signs are already collected — only skip sign harvest
                    const skipSigns = this._hubCacheSkipSigns;
                    this._hubCacheSkipSigns = false; // Reset flag
                    
                    this.activeMap.buildings.forEach(b => {
                        // 1. Harvest Sign (skip on cache restore — already collected)
                        if (!skipSigns && b.attachedSign) {
                            this.neonSigns.push(b.attachedSign);
                        }
                        // 2. Harvest Transition (Door) — tag to prevent accumulation
                        if (b.attachedTransition) {
                            b.attachedTransition._fromBuilding = true;
                            this.activeMap.transitions.push(b.attachedTransition);
                        }
                        // 3. Harvest Lights — always needed (regenerated fresh on cache restore)
                        if (b.attachedLights && b.attachedLights.length > 0) {
                            this.activeMap.lamps.push(...b.attachedLights);
                        }
                    });
                    
                    // 3b. Re-apply block lamp colors to include building lights
                    // This ensures V2 building lights match street lamp colors on their block
                    if (this.activeMap.cityLayout && this.activeMap.cityLayout.applyBlockLampColors) {
                        this.activeMap.cityLayout.applyBlockLampColors(this.activeMap.lamps);
                    }
                    
                    // The Ollo test zone's door (on the city's southern edge, east of the graveyard)
                    if (this.activeMap.id === 'hub_949') {
                        this.activeMap.transitions.push({
                            ...HUB_OLLO_DOOR,
                            target: 'ollo_test',
                            label: 'Visit OllO Plaza',
                            _fromBuilding: true
                        });
                        // Cache hub buildings for delivery mission generation from any map
                        this._hubBuildingsCache = this.activeMap.buildings;
                    }
                }
                
                // POPULATE LANDMARK REGISTRY FROM MAP DATA
                if (this.activeMap.landmarks) {
                    for (const lm of this.activeMap.landmarks) {
                        this.landmarkRegistry[lm.id] = { x: lm.x, y: lm.y };
                    }
                    console.log(`Loaded ${this.activeMap.landmarks.length} landmarks for ${mapId}`);
                }
                
                // Also auto-generate landmarks from transitions (door positions)
                if (this.activeMap.transitions) {
                    for (const t of this.activeMap.transitions) {
                        // Create a landmark for each transition's center point
                        const transitionLandmarkId = `${mapId}_to_${t.target}`;
                        this.landmarkRegistry[transitionLandmarkId] = {
                            x: t.x + t.w / 2,
                            y: t.y + t.h / 2
                        };
                    }
                }
                
                // Build spatial transition grid for O(1) lookups (replaces per-frame .find())
                this._transitionGrid.build(this.activeMap.transitions);
                
                // Buildings/foliage are now complete (all authored and generated writes precede this).
                this.invalidateRenderSpatial();
                this._ensureRenderSpatial();

                // Build render grids for static geometry — O(visible cells) draw instead of O(N)
                this._renderGridWalls = new RenderGrid(400);
                this._renderGridWalls.build(this.activeMap.walls);
                
                if (this.activeMap.floorZones) {
                    this._renderGridFloorZones = new RenderGrid(400);
                    this._renderGridFloorZones.build(this.activeMap.floorZones);
                } else {
                    this._renderGridFloorZones = null;
                }
                
                if (this.activeMap.pavements) {
                    this._renderGridPavements = new RenderGrid(400);
                    this._renderGridPavements.build(this.activeMap.pavements);
                } else {
                    this._renderGridPavements = null;
                }
                
                if (this.activeMap.crosswalks) {
                    this._renderGridCrosswalks = new RenderGrid(400);
                    this._renderGridCrosswalks.build(this.activeMap.crosswalks);
                } else {
                    this._renderGridCrosswalks = null;
                }
                
                // Build Indoor V2 Room System (if this map has room definitions)
                if (ROOM_DEFS[mapId]) {
                    this.roomSystem.build(ROOM_DEFS[mapId]);
                    
                    // AUTO WALL CUTTER — Split walls wherever doors are placed
                    if (this.roomSystem.doors.length > 0 && this.activeMap.walls) {
                        this.activeMap.walls = RoomSystem.cutWallsForDoors(
                            this.activeMap.walls,
                            ROOM_DEFS[mapId].doors || []
                        );
                        this._renderGridWalls.build(this.activeMap.walls);   // draw the cut walls, the same ones that collide
                    }
                } else {
                    this.roomSystem.clear();
                }
                
                // --- WEATHER: resolve indoor suppression for the new map ---
                // Runs after roomSystem.build() so `active` reflects THIS map.
                // Outdoor maps always show the sky. Indoor maps hide it, unless
                // they run a room system — those get it recomputed per frame in
                // the update loop, since a map can mix indoor rooms with a
                // veranda or courtyard that should still get rained on.
                if (this.weather) {
                    if (this.activeMap.type === 'outdoor') {
                        this.weather.setIndoorSuppressed(false);
                    } else if (!this.roomSystem.active) {
                        this.weather.setIndoorSuppressed(true);
                    }
                }
                
                // -------------------------------------------------------

                this.props = this.activeMap.props || [];
                if (this.furniture) this.furniture.onMapLoaded(this);   // the apartment's layout as she left it (engine/furniture.js)
                this.npcs = this.activeMap.npcs || [];
                this.lamps = this.activeMap.lamps || [];
                this.enemies = []; this.loot = []; 
                // Maps that ask for it (the House) route paths around their big furniture too
                if (this.activeMap.navProps) this.activeMap.navObstacles = this.props
                    .filter(p => (p.mass || 0) >= 1e6 && p.width * p.height >= (this.activeMap.navProps === 'all' ? 200 : 600) && !p.noNav)
                    .map(p => p); // retain live bounds/rotation; shared with the solid-prop navigation overlay
                
                // Auto-tag lamps with their containing room ID for per-room light control
                if (this.roomSystem.active) {
                    this.roomSystem.tagLamps(this.lamps);
                } 
                
                this.decals.clear(); 
                this.corpses = [];
                
                // Deactivate current map entities (non-target maps have empty arrays from lazy creation)
                const targetMapData = maps[mapId];
                if (targetMapData) {
                    if (targetMapData.props) { for (let prop of targetMapData.props) { if (prop instanceof GameEntity) { prop.active = false; prop.markedForDestroy = false; } } }
                    if (targetMapData.npcs) { for (let npc of targetMapData.npcs) { if (npc instanceof GameEntity) { npc.active = false; npc.markedForDestroy = false; } } }
                }
                
                // Re-register persistents
                if (this.player) { this.player.active = true; this.player.markedForDestroy = false; this.player.reregister(); }
                for (let tm of this.teammates) { if (tm instanceof ActorEntity) { tm.active = true; tm.markedForDestroy = false; tm.reregister(); } }
                
                // Activate current map entities
                for (let prop of this.props) { if (prop instanceof GameEntity) { prop.active = true; prop.markedForDestroy = false; prop.reregister(); } }
                for (let npc of this.npcs) { if (npc instanceof GameEntity) { npc.active = true; npc.markedForDestroy = false; npc.dead = false; npc.reregister(); } }
                
                GameEntity.clearType('projectile'); 

                if (this.useNewCollisionSystem) {
                    if (this.activeMap.walls) { this._staticWallEntities = createStaticEntitiesFromWalls(this.activeMap.walls); }
                    if (this.activeMap.buildings) { this._staticBuildingEntities = createStaticEntitiesFromBuildings(this.activeMap.buildings); }
                }
                // Hub billboards are parked for now; keep their authored data for a later return.
                this.activeMap.billboards = this.activeMap.id === 'hub_949' ? []
                    : BILLBOARDS.filter(b => b.map === this.activeMap.id).map(cfg => new Billboard(cfg));
                if (this.useNewCollisionSystem) this._staticBillboardEntities = this.activeMap.billboards.flatMap(b => b.colliders());
                
                CollisionSystem.processQueue();
                GameEntity.queueEnabled = false;
                _physicsSpatial.track(this.activeMap.walls);
                _physicsSpatial.track(getColliders(this.activeMap));
                
                if (this.activeMap.id === 'hub_949' && this.questState.ambushCleared) { 
                    this.npcs.push(new NPC(2000, 9800, "Ms. Jean", 'ms_jean')); 
                }
                
                // Spawn Grum North near the Scrapyard
                if (this.activeMap.id === 'hub_949' && this.restrictedZone) {
                    const rz = this.restrictedZone;
                    // Place Grum just south of the zone entrance, on the road
                    this.npcs.push(new NPC(rz.x + rz.w / 2 - 40, rz.y + rz.h + 60, "Grum North", 'arena_master'));
                }
                
                // Create HordeGauntlet (persists across map switches)
                if (!this.hordeGauntlet) {
                    this.hordeGauntlet = new HordeGauntlet();
                }
                
                // Spawn bounty target on hub if active bounty mission
                // Must re-spawn on every hub entry because enemies array is cleared on map load
                if (this.activeMap.id === 'hub_949' && this.missions && this.missions.activeMission
                    && this.missions.activeMission.type === MISSION_TYPES.BOUNTY
                    && this.missions.activeMission.status === 'active') {
                    // Clear stale entity reference (entity was destroyed on previous map unload)
                    this.missions.activeMission.targetEntity = null;
                    this.missions.spawnBountyTarget(this);
                }
                
                // Spawn salvage guards on hub if active salvage mission
                if (this.activeMap.id === 'hub_949' && this.missions && this.missions.activeMission
                    && this.missions.activeMission.type === MISSION_TYPES.SALVAGE
                    && this.missions.activeMission.status === 'active'
                    && !this.missions.activeMission.crateCollected) {
                    // Reset guard spawns for fresh map load
                    this.missions.activeMission.guardsSpawned = false;
                    this.missions.activeMission._guardEntities = [];
                    this.missions.activeMission.crateSpawned = false;
                    this.missions.spawnSalvageGuards(this);
                }
                
                // Show active mission guidance on hub load
                if (this.activeMap.id === 'hub_949' && this.missions && this.missions.activeMission) {
                    const m = this.missions.activeMission;
                    if (m.status === 'active') {
                        this.addPausableTimeout(() => {
                            if (this.ui && this.ui.showMissionBanner) {
                                const text = this.missions.getObjectiveText();
                                if (text) this.ui.showMissionBanner(text, 'gold', 'IN PROGRESS');
                            }
                        }, 800);
                    }
                }
                
                // --- VELVET CAT ---
                if (this.activeMap.id === 'hub_949') {
                    if (this.questState.hasVelvetCat) {
                        // Owned — temp position, repositioned by placeEntitySmart in Phase 5
                        this.velvetCat = new VelvetCat(this.activeMap.spawn.x, this.activeMap.spawn.y);
                    } else {
                        // Discoverable — sitting near the hub spawn (apartment area)
                        this.velvetCat = new VelvetCat(900, 580);
                        this.velvetCat.state = 'idle';
                        this.velvetCat.idleBehavior = 'sit';
                        this.velvetCat._discoverable = true; // Flag for interaction
                    }
                } else if (this.questState.hasVelvetCat) {
                    // Owned + indoor/other maps — temp position, repositioned in Phase 5
                    this.velvetCat = new VelvetCat(this.activeMap.spawn.x, this.activeMap.spawn.y);
                } else {
                    this.velvetCat = null;
                }

                // =========================================================
                //  PHASE 5: PLAYER POSITIONING (DYNAMIC LINKING)
                // =========================================================
                
                // CASE A: DYNAMIC RETURN (e.g. Exiting a building to the Hub)
                if (spawnAt && spawnAt.linkFrom) {
                    // Find the transition on the NEW map that targets the OLD map
                    // Example: If loading 'hub_949' coming from 'apt_949', find the Hub door that points to 'apt_949'
                    const returnGate = this._transitionGrid.findByTarget(spawnAt.linkFrom);
                    
                    if (returnGate && this.activeMap.type === 'indoor') {
                        // Indoors the door is in an outer wall: step in off it, toward the room
                        const p = this._stepInFromGate(returnGate);
                        this.player.x = p.x; this.player.y = p.y; this.player.angle = p.angle;
                    } else if (returnGate) {
                        // Spawn at the center of the gate
                        this.player.x = returnGate.x + returnGate.w / 2;
                        
                        // Offset Y to step "out" of the door
                        // Note: Most buildings are "North", so "Out" is South (Positive Y).
                        // We add 35px to clear the building wall/door trigger.
                        this.player.y = returnGate.y + returnGate.h + 35;
                        
                        // Face Down (South)
                        this.player.angle = Math.PI / 2; 
                    } else {
                        // Fallback: If no linking door found, use map default
                        console.warn(`Link connection to ${spawnAt.linkFrom} not found. Using default spawn.`);
                        this.player.x = this.activeMap.spawn.x;
                        this.player.y = this.activeMap.spawn.y;
                    }
                } 
                
                // CASE B: EXPLICIT COORDINATES (e.g. Save Game load, or debug teleport)
                else if (spawnAt && typeof spawnAt.x === 'number') { 
                    this.player.x = spawnAt.x; 
                    this.player.y = spawnAt.y; 
                } 
                
                // CASE C: DEFAULT SPAWN (e.g. Entering an interior for the first time)
                else { 
                    this.player.x = this.activeMap.spawn.x; 
                    this.player.y = this.activeMap.spawn.y; 
                }
                
                // Her cars: on the hub where she left them, on any other map put away (engine/cars.js)
                this._placeCarsForMap();
                
                // =========================================================
                // SMART COMPANION PLACEMENT (Teammates & Dancers)
                // =========================================================
                // Config: 40px start offset, Smart Cone Search, Transition Safe-zones
            
                const occupiedSpots = [];
                const map = this.activeMap;
                const pX = this.player.x;
                const pY = this.player.y;
                const pAngle = this.player.angle || 0; // Direction player is looking
            
                // 1. Helper: Collision Check (includes Door Override)
                const isSpotValid = (x, y) => {
                    const r = 10; // Entity radius
                    
                    // Bounds
                    if (x < r || x > map.width - r || y < r || y > map.height - r) return false;
            
                    // Transition/Door Override (ALWAYS VALID)
                    // This ensures they can spawn on door mats even if near walls
                    if (map.transitions) {
                        for (let t of map.transitions) {
                            if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h) return true;
                        }
                    }
            
                    // Walls
                    if (map.walls) {
                        for (let w of map.walls) {
                            if (x + r > w.x && x - r < w.x + w.w &&
                                y + r > w.y && y - r < w.y + w.h) return false;
                        }
                    }
            
                    // Buildings (Visual Footprint)
                    const placeColliders = getColliders(map);
                    if (placeColliders) {
                        for (let b of placeColliders) {
                            if (x + r > b.x && x - r < b.x + b.w &&
                                y + r > b.y && y - r < b.y + b.h) return false;
                        }
                    }
                    return true;
                };
            
                // 2. Helper: The Smart Search Logic
                const placeEntitySmart = (entity) => {
                    let validPosFound = false;
                    
                    // SETTINGS: Start at 40px as requested
                    const startRadius = 40; 
                    const ringStep = 20;
                    const maxRings = 10; 
            
                    searchLoop:
                    for (let r = 0; r < maxRings; r++) {
                        const currentDist = startRadius + (r * ringStep);
                        const steps = 12 + (r * 4); // Increase angular resolution further out
                        
                        // Cone Search: Alternating angles (0, +15, -15, +30, -30...)
                        // Prioritizes looking where the player is looking
                        for (let i = 0; i < steps; i++) {
                            const offsetIdx = Math.ceil(i/2) * (i%2 === 0 ? 1 : -1);
                            const angleOffset = (offsetIdx / steps) * Math.PI * 2; 
                            const angle = pAngle + angleOffset;
                            
                            const tx = pX + Math.cos(angle) * currentDist;
                            const ty = pY + Math.sin(angle) * currentDist;
            
                            // A. Environment Check
                            if (!isSpotValid(tx, ty)) continue;
            
                            // B. Overlap Check (prevent stacking)
                            let overlaps = false;
                            for (let spot of occupiedSpots) {
                                if (Math.hypot(tx - spot.x, ty - spot.y) < 20) {
                                    overlaps = true;
                                    break;
                                }
                            }
                            if (overlaps) continue;
            
                            // Success
                            entity.x = tx;
                            entity.y = ty;
                            entity.vx = 0; // Stop sliding
                            entity.vy = 0;
                            occupiedSpots.push({x: tx, y: ty});
                            validPosFound = true;
                            break searchLoop;
                        }
                    }
            
                    // Fallback: If trapped in valid geometry, stack on player
                    if (!validPosFound) {
                        entity.x = pX;
                        entity.y = pY;
                    }
                };
            
                // 3. Execute for Teammates
                for (let tm of this.teammates) {
                    if (!tm.recruited) {
                        // Unrecruited logic
                        if (map.id === 'moon_city_nightclub') { tm.x = 1300; tm.y = 180; }   // with Mirabel in her lounge
                        else { tm.x = -5000; tm.y = -5000; }
                        continue;
                    }
                    // Downed teammates recover at the apartment
                    if (tm.downed) {
                        if (map.id === 'apt_949') {
                            tm.downed = false;
                            tm.dead = false;
                            tm.active = true;
                            tm.visible = true;
                            tm.hp = tm.maxHp;
                            tm.teammateStims = tm.maxTeammateStims || 3;
                            showMessage(`${tm.name.toUpperCase()} HAS RECOVERED.`);
                            placeEntitySmart(tm);
                        } else {
                            // Still downed — hide offscreen
                            tm.x = -5000; tm.y = -5000;
                            tm.visible = false;
                        }
                        continue;
                    }
                    placeEntitySmart(tm);
                }

                // 3b. Apartment idle positions — place recruited teammates at fixed spots,
                // each doing their thing there (their pose only applies at home)
                for (const tm of this.teammates) tm._idlePose = null;
                if (map.id === 'apt_949') {
                    for (const tm of this.teammates) {
                        if (!tm.recruited || tm.downed) continue;
                        const pos = APT_IDLE_POSITIONS[tm.name];
                        if (pos) {
                            tm.x = pos.x;
                            tm.y = pos.y;
                            tm.velX = 0;
                            tm.velY = 0;
                            tm._idlePose = pos.pose || null;
                            // Face toward center of living room
                            tm.angle = Math.atan2(450 - tm.y, 500 - tm.x);
                        }
                    }
                }

                // 4. Reposition Velvet Cat near player (after player position is final)
                if (this.velvetCat && this.questState.hasVelvetCat) {
                    placeEntitySmart(this.velvetCat);
                }

                // 5. Reset animation state AFTER all positioning to prevent limb splay
                resetHumanoidAnim(this.player);
                this.teammates.forEach(t => resetHumanoidAnim(t));

                this.camera.zoom = 1; 
                this.resize();
            },
            
            /**
             * COMPUTE LAMP SHADOWS (Geometry-Only)
             * -----------------------------------------------------------
             * Pre-computes shadow polygon geometry per lamp and caches it
             * on the lamp object. NO map-sized canvas allocation.
             * 
             * Old approach: 4000×11000 shadowCanvas = 44M pixels in VRAM
             * New approach: ~100 polygon points per lamp = ~50KB total
             * 
             * The shadow polygons are drawn per-frame into the screen-sized
             * lightCanvas for only visible lamps (AABB culled).
             */
            bakeStaticLighting() {
                if (!this.activeMap) return;
            
                // 1. RESET DEBUG DATA
                this.debugLightData = []; 
                
                let allObstacles = [...this.activeMap.walls];
                if (this.activeMap.buildingColliders) {
                    allObstacles = allObstacles.concat(this.activeMap.buildingColliders);
                } else if (this.activeMap.buildings) {
                    allObstacles = allObstacles.concat(this.activeMap.buildings);
                }
            
                // 2. COMPUTE SHADOW POLYGON PER LAMP (cached on lamp object)
                // The same map gives the same polygons: reuse them from the cache (core/cache-db.js) when the
                // signature of every lamp and obstacle matches, else compute them and store them for next time.
                let sig = this.activeMap.width + ',' + this.activeMap.height + '|';
                for (const l of this.lamps) sig += ((l.x * 10) | 0) + ',' + ((l.y * 10) | 0) + ',' + ((l.radius * 10) | 0) + ';';
                let os = 0, on = 0;
                for (const o of allObstacles) { const w = o.width ?? o.w ?? 0, h = o.height ?? o.h ?? 0; os = (os * 31 + ((o.x * 7 + o.y * 13 + w * 17 + h * 19) | 0)) | 0; on++; }
                sig += '|' + on + ':' + os;
                const ckey = 'lampPolys:' + this.activeMap.id, cached = CacheDB.get(ckey, sig);
                if (cached && cached.length === this.lamps.length) {
                    this.lamps.forEach((lamp, i) => {
                        const f = cached[i], pts = [];
                        for (let k = 0; k < f.length; k += 2) pts.push({ x: f[k], y: f[k + 1] });
                        lamp._shadowPoly = pts;
                        if (pts.length > 0) this.debugLightData.push({ source: { x: lamp.x, y: lamp.y }, points: pts });
                    });
                    this.lightingBaked = true;
                    return;
                }
                for (let lamp of this.lamps) {
                    // Visibility polygon (core/draw-helpers.js), bounded by the map's corners
                    const intersections = computeVisibilityPoly(lamp.x, lamp.y, lamp.radius, allObstacles, {
                        extraPoints: [{x: 0, y: 0}, {x: this.activeMap.width, y: 0},
                                      {x: this.activeMap.width, y: this.activeMap.height}, {x: 0, y: this.activeMap.height}] });
            
                    // Cache the shadow polygon on the lamp — NO canvas needed
                    lamp._shadowPoly = intersections;
                    
                    // Debug data
                    if (intersections.length > 0) {
                        this.debugLightData.push({ source: {x: lamp.x, y: lamp.y}, points: intersections });
                    }
                }
                if (this.lamps.length > 4) CacheDB.put(ckey, sig, this.lamps.map(l => {
                    const p = l._shadowPoly || [], f = new Float32Array(p.length * 2);
                    p.forEach((q, i) => { f[2 * i] = q.x; f[2 * i + 1] = q.y; });
                    return f;
                }));
                this.lightingBaked = true;
            },
            
        });

