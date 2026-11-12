        // ============================================================================
        //  HUB SCRIPTED NPC ANCHORS
        //  sdc's buildings are NOT authored — they're generated at load time by
        //  city.autoFillAll(), which picks positions with Math.random(). These NPC
        //  spawns are fixed literals, so nothing reconciles the two: on some loads a
        //  filler building lands on top of Mirabel or Anavia. Map NPCs never go
        //  through placeEntitySmart() either (that runs for teammates only), so there
        //  is no recovery pass. Reserving each anchor as a CityLayout safe zone BEFORE
        //  autoFill runs keeps the generator from ever choosing those spots.
        //  Single source of truth: createMapEntities reads these too.
        // ============================================================================
        const HUB_NPC_ANCHORS = GAME_DB.places.hub.npc_anchors;   // directory/game-db/places.json
        const HUB_NPC_CLEARANCE = GAME_DB.places.hub.npc_clearance; // px half-extent kept building-free per anchor

        // Where the city's landmarks and special blocks are (engine/map-loading.js lays them out; the Silver Queen and the
        // Double Nights stay in the north-west corner, block_0_0 and block_0_2, where the story happens)
        const HUB_BLOCKS = GAME_DB.places.hub.blocks;   // directory/game-db/places.json
        const HUB_OLLO_DOOR = GAME_DB.places.hub.ollo_door;   // the OllO Plaza door, on the southern edge east of the graveyard

        // The Cozy Cafe's round tables (centres) and booth rows (centre y): its pendant lamps and the
        // guests' seats (directory/cafe-life.js) use these; the table and booth placements in
        // directory/game-assets/maps/cozy_cafe_interior.json must stay on them (tools/test-map-layouts.mjs)
        const CAFE_TABLES = [[505, 385], [628, 470], [505, 560], [628, 650], [505, 740]];
        const CAFE_BOOTHS = [385, 500, 615];

        // ============================================================================
        //  createMapEntities — the current map's props, NPCs and lamps, built from the Directory's
        //  prop catalog (directory/game-assets/props.json) and the map's layout file
        //  (directory/game-assets/maps/<map_id>.json). Called once per loadMap().
        // ============================================================================
        function createMapEntities(mapId) {
            if (DFNative.mapHost(mapId) === 'native') return { props: [], npcs: [], lamps: [] };   // a Basement scene owns it
            const layout = DFNative.resolveMapLayout(mapId), classes = { NPC, Ganger };
            const e = {
                props: layout.props.map(options => new PropEntity(options)),
                npcs: layout.npcs.map(n => Object.assign(new classes[n.class](...n.args), n.apply)),
                lamps: layout.lamps.map(({ apply, ...options }) => Object.assign(new LampEntity(options), apply))
            };
            if (layout.soft_lights) e.softLights = layout.soft_lights;
            if (mapId === 'sdc') e.npcs = [...HUB_NPC_ANCHORS.map(a => new NPC(a.x, a.y, a.name, a.role)), new Ganger(1800, 1000), new Ganger(2200, 1200)];
            if (mapId === 'ollo_test') {
                // BuildingV3: instantiate from editor export, centered in the plaza
                const olloBuilding = new BuildingV3(1000, 600, OLLO_BUILDING_DATA);
                // Store on the entities so the render pipeline can draw it
                e._v3Buildings = [olloBuilding];
                // Interior lighting: invisible emitters + shadow-casting wall segments
                e._interiorLights = olloBuilding.getInteriorLights();
                e._interiorShadowSegs = olloBuilding.getAllShadowSegments();
                // Collision: top-level footprint blocks player movement
                e.buildingColliders = olloBuilding.getWalls();
                e.props = [];
                e.npcs = [];
                // Convert visible building lamps to game LampEntity instances (excludes interior_lamp)
                e.lamps = olloBuilding.getLamps();
                // Add perimeter lamps for the plaza
                e.lamps.push(
                    new LampEntity({ x: 200, y: 400, lampType: 3, color: '#ffaa44', lightRadius: 350 }),
                    new LampEntity({ x: 1800, y: 400, lampType: 3, color: '#ffaa44', lightRadius: 350 }),
                    new LampEntity({ x: 200, y: 1200, lampType: 3, color: '#ff8833', lightRadius: 300 }),
                    new LampEntity({ x: 1800, y: 1200, lampType: 3, color: '#ff8833', lightRadius: 300 }),
                    new LampEntity({ x: 1000, y: 1400, lampType: 4, color: '#ffeebb', lightRadius: 400 })
                );
                // Add entrance transition into the building interior
                const olloTransition = olloBuilding.getTransition('ollo_interior', 'Enter OllO');
                if (olloTransition) {
                    const md = MAP_DATA['ollo_test'];
                    // Once: MAP_DATA outlives the visit, so a second push would stack a second door
                    if (md && md.transitions && !md.transitions.some(t => t._ollo)) md.transitions.push(Object.assign(olloTransition, { _ollo: true }));
                }
            }
            return e;
        }

        
