        // ============================================================================
        //  MAP_DATA — Static map metadata (geometry, walls, zones, transitions)
        //  Entity instances (props, npcs, lamps) are created by createMapEntities()
        // ============================================================================
        const MAP_DATA = {
            'hub_949': {
                id: 'hub_949', width: 4000, height: 11000, type: 'outdoor',
                label: 'Southern Dimensions City', floorColor: '#2a262e',
                climate: 'city',   // Rain-heavy: clear sky is rare and short here
                spawn: { x: 1200, y: 550 },
                pavements: [], crosswalks: [],
                floorZones: [
                    { x: 2600, y: 5800, w: 1000, h: 800, color: '#1a2b1a' },
                    { x: 2000, y: 900, w: 1800, h: 1200, color: '#4a2a2a' },
                    { x: 50, y: 80, w: 800, h: 600, color: '#1a2518' },
                    { x: 200, y: 4500, w: 1500, h: 1200, color: '#3d3d3d' },
                    { x: 1400, y: 3200, w: 1200, h: 400, color: '#222' },
                    { x: 500, y: 8800, w: 3000, h: 2000, color: '#1a2e1a' },
                ],
                zones: [], buildings: [], walls: [], transitions: []
            },
            'road_test': {
                id: 'road_test', width: 4000, height: 4000, type: 'outdoor',
                label: 'Road Test Zone (Expanded)', floorColor: '#0b1a0b',
                climate: 'outskirt',   // Milder than the city — driving out feels different
                spawn: { x: 2000, y: 2000 },
                pavements: [], crosswalks: [], lamps: [],
                walls: [ { x: 0, y: 0, w: 4000, h: 50 }, { x: 0, y: 3950, w: 4000, h: 50 }, { x: 0, y: 0, w: 50, h: 4000 }, { x: 3950, y: 0, w: 50, h: 4000 } ],
                transitions: [ { x: 1960, y: 3900, w: 80, h: 50, target: 'hub_949', label: 'Return to City' } ]
            },
            'ethereal_plane': {
                id: 'ethereal_plane', width: 1200, height: 1200, type: 'indoor',
                label: 'The Ethereal Plane', floorColor: '#0a001a',
                spawn: { x: 600, y: 1000 },
                zones: [ { x: 100, y: 100, w: 1000, h: 1000, color: '#150025' } ],
                walls: [ {x:0, y:0, w:1200, h:50}, {x:0, y:1150, w:1200, h:50}, {x:0, y:0, w:50, h:1200}, {x:1150, y:0, w:50, h:1200} ],
                transitions: [ { x: 550, y: 1100, w: 100, h: 50, target: 'hub_949', label: 'Return to Body' } ]
            },
            'apt_949': {
                id: 'apt_949', width: 1400, height: 900, type: 'indoor',
                label: 'Silver Queen Apartments', floorColor: '#1a0a0a',
                spawn: { x: 1050, y: 370 },
                zones: [
                    { x: 0, y: 0, w: 1400, h: 200, color: '#2a3035' },
                    { x: 8, y: 208, w: 892, h: 684, color: '#3a1520', texture: 'carpet' },
                    { x: 908, y: 208, w: 484, h: 340, color: '#1a1520' },
                    { x: 908, y: 556, w: 484, h: 336, color: '#bfb7b4' },
                ],
                walls: [
                    { x: 0, y: 0, w: 1400, h: 8 }, { x: 0, y: 0, w: 8, h: 200 },
                    { x: 1392, y: 0, w: 8, h: 200 }, { x: 0, y: 200, w: 1400, h: 8 },
                    { x: 0, y: 200, w: 8, h: 700 }, { x: 1392, y: 200, w: 8, h: 700 },
                    { x: 0, y: 892, w: 620, h: 8 }, { x: 780, y: 892, w: 620, h: 8 },
                    { x: 900, y: 208, w: 8, h: 684 }, { x: 908, y: 548, w: 484, h: 8 },
                ],
                transitions: [ { x: 620, y: 860, w: 160, h: 40, target: 'hub_949', label: 'Exit to City' } ],
                landmarks: [
                    { id: 'apt_door', x: 700, y: 880 }, { id: 'apt_bed', x: 1050, y: 350 },
                    { id: 'apt_terminal', x: 700, y: 100 }, { id: 'apt_balcony', x: 700, y: 100 },
                    { id: 'apt_armory', x: 52, y: 365 }
                ]
            },
            // Double Nights Hotel — "Think excellence, think Double Nights." A grand interdimensional
            // hotel: black marble and gold, a rift fountain, a chandelier over the twin crescents,
            // guests and AI staff coming and going (world/lobby-life.js). Floor: drawLobbyInterior;
            // glows, the motto and the elevator doors: drawLobbyGlow; furniture: dn_* (props-decor.js).
            'hotel_lobby': {
                id: 'hotel_lobby', width: 1000, height: 1200, type: 'indoor',
                label: 'Double Nights Hotel | Lobby', floorColor: '#0c0a0c',
                ambientDarkness: 0.62,                              // warm and lit, not a dark room
                navProps: 'all',                                    // the crowd walks round the furniture (lamps and palms too)
                wallStyle: { fill: '#0e0c10', stroke: 'rgba(232,194,122,0.55)' },   // black lacquer, gold trim
                spawn: { x: 500, y: 1100 },
                zones: [],
                walls: [ { x: 0, y: 0, w: 1000, h: 50 }, { x: 0, y: 1150, w: 400, h: 50 }, { x: 600, y: 1150, w: 400, h: 50 }, { x: 0, y: 0, w: 50, h: 1200 }, { x: 950, y: 0, w: 50, h: 1200 }, { x: 350, y: 100, w: 300, h: 50 }, { x: 0, y: 300, w: 80, h: 100 }, { x: 0, y: 500, w: 80, h: 100 }, { x: 0, y: 700, w: 80, h: 100 }, { x: 920, y: 300, w: 80, h: 100 }, { x: 920, y: 500, w: 80, h: 100 }, { x: 920, y: 700, w: 80, h: 100 } ],
                transitions: [ { x: 400, y: 1150, w: 200, h: 50, target: 'hub_949', label: 'Exit Hotel' }, { x: 50, y: 300, w: 100, h: 500, target: 'hotel_suite', label: 'Use Elevator', quiet: true }, { x: 850, y: 300, w: 100, h: 500, target: 'hotel_suite', label: 'Use Elevator', quiet: true } ],
                landmarks: [
                    { id: 'hotel_exit', x: 500, y: 1175 }, { id: 'hotel_desk', x: 500, y: 125 },
                    { id: 'hotel_elevator_left', x: 100, y: 500 }, { id: 'hotel_elevator_right', x: 900, y: 500 },
                    { id: 'luvshade', x: 500, y: 540 },
                    { id: 'suite_elevator', x: 110, y: 450 }        // story step 11 points here
                ]
            },
            // The Double Nights penthouse — the Dark Maker's suite, left with a flourish. Furniture:
            // createMapEntities (ps_*, drawSuiteDecorProp); floors: drawSuiteInterior; glows and the
            // mirror rift he left through: drawSuiteGlow.
            //   Living room (elevator, pit, piano, bar, dining for two) | Bedroom (L) | Bath (the rift)
            //                                                           | Balcony (pool) — the breach wall
            // The prologue's fireside (engine/keeper-art.js paints both; story/scenes/prologue.js plays them)
            'keepers_hill': {
                id: 'keepers_hill', width: 1800, height: 2800, type: 'indoor', label: 'Somewhere between the realms', floorColor: '#140a26',
                ambientDarkness: 0.4, zones: [], walls: [], transitions: [], spawn: { x: 900, y: 2450 },
                landmarks: [ { id: 'hill_foot', x: 900, y: 2330 }, { id: 'hill_mid', x: 900, y: 1500 }, { id: 'keeper_house', x: 900, y: 600 }, { id: 'keeper_porch', x: 900, y: 760 } ]
            },
            'keepers_parlor': {
                id: 'keepers_parlor', width: 900, height: 700, type: 'indoor', label: "The Keeper's parlor", floorColor: '#140c10',
                ambientDarkness: 0.78, zones: [], walls: [], transitions: [], spawn: { x: 450, y: 600 },
                landmarks: [ { id: 'hearth', x: 450, y: 70 }, { id: 'parlor_mid', x: 520, y: 260 }, { id: 'keeper_seat', x: 450, y: 262 }, { id: 'traveler_seat', x: 648, y: 306 }, { id: 'parlor_window', x: 450, y: 20 } ]
            },
            // Chapter 1 opens here: the crew's van, roof off, nose up (engine/van-art.js paints it; story/scenes/van.js plays it)
            'van_interior': {
                id: 'van_interior', width: 400, height: 820, type: 'indoor', label: 'En route to Double Nights', floorColor: '#0b0a10',
                ambientDarkness: 0.62, zones: [], walls: [], transitions: [], spawn: { x: 200, y: 460 },
                landmarks: [ { id: 'van_center', x: 200, y: 450 }, { id: 'van_949', x: 136, y: 404 }, { id: 'van_747', x: 264, y: 404 }, { id: 'van_rear', x: 200, y: 700 }, { id: 'van_partition', x: 200, y: 186 } ]
            },
            'hotel_suite': {
                id: 'hotel_suite', width: 1400, height: 1000, type: 'indoor',
                label: 'Penthouse Suite', floorColor: '#0c0a0e',
                ambientDarkness: 0.72,
                navProps: 'all',
                wallStyle: { fill: '#0e0c10', stroke: 'rgba(232,194,122,0.5)' },   // black lacquer, gold trim
                spawn: { x: 200, y: 500 },
                zones: [],
                walls: [ { x: 0, y: 0, w: 1400, h: 50 }, { x: 0, y: 0, w: 50, h: 1000 }, { x: 1350, y: 0, w: 50, h: 1000 }, { x: 0, y: 950, w: 800, h: 50 }, { x: 1300, y: 950, w: 100, h: 50 }, { x: 700, y: 0, w: 20, h: 300 }, { x: 700, y: 500, w: 20, h: 500 }, { x: 1100, y: 0, w: 20, h: 300 }, { x: 1100, y: 300, w: 150, h: 20 }, { x: 1350, y: 300, w: 50, h: 20 }, { x: 700, y: 800, w: 300, h: 10 }, { x: 1150, y: 800, w: 250, h: 10 },
                         { x: 800, y: 1000, w: 500, h: 10, breach: true } ],   // the balcony edge the drones blow through (story step 13)
                transitions: [ { x: 50, y: 400, w: 50, h: 200, target: 'hotel_lobby', label: 'Elevator' }, { x: 1120, y: 50, w: 120, h: 200, target: 'church_boss', label: 'Strange Portal' } ],
                landmarks: [
                    { id: 'suite_elevator', x: 75, y: 500 }, { id: 'suite_portal', x: 1180, y: 150 },
                    { id: 'suite_bathroom', x: 1200, y: 150 }, { id: 'suite_balcony', x: 1050, y: 900 }
                ]
            },
            'medbay_sw': {
                id: 'medbay_sw', width: 800, height: 800, type: 'indoor',
                label: "Dr. Yin's Clinic", floorColor: '#76828a',
                ambientDarkness: 0.5,          // clinics are lit, not pitch black — lamps add pools on top
                spawn: { x: 400, y: 600 },
                respawn: { x: 212, y: 328 },   // beside the recovery bed (see PlayerEntity.die)
                zones: [],
                walls: [ {x:0,y:0,w:800,h:50}, {x:0,y:750,w:350,h:50}, {x:450,y:750,w:350,h:50}, {x:0,y:0,w:50,h:800}, {x:750,y:0,w:50,h:800} ],
                transitions: [ {x: 350, y: 720, w: 100, h: 80, target: 'hub_949', label: 'Exit Clinic'} ],
                landmarks: [
                    { id: 'clinic_exit', x: 400, y: 760 }, { id: 'clinic_dr_yin', x: 400, y: 200 },
                    { id: 'clinic_bed_left', x: 200, y: 400 }, { id: 'clinic_bed_right', x: 600, y: 400 },
                    { id: 'clinic_respawn', x: 212, y: 328 }, { id: 'clinic_scanner', x: 400, y: 480 }
                ]
            },
            // Moon City Nightclub. Furniture: createMapEntities (mc_*, drawClubDecorProp); floors:
            // drawClubInterior; the light show: drawClubGlow.
            //   Powder room |            Hall (DJ stage, dance floor, poles)          | Mirabel's lounge
            //               | Bar (west side)                                        | VIP corridor | Suites 1-3
            //   Gents       |                        Foyer                           |
            'moon_city_nightclub': {
                id: 'moon_city_nightclub', width: 1600, height: 1200, type: 'indoor',
                label: 'Moon City Nightclub', floorColor: '#08060b',
                ambientDarkness: 0.72,
                navProps: 'all',
                wallStyle: { fill: '#0b0810', stroke: 'rgba(190,140,255,0.55)' },   // black lacquer, violet neon trim
                spawn: { x: 800, y: 1130 },
                zones: [],
                walls: [
                    // Outer shell, the door in the middle of the south wall
                    { x: 0, y: 0, w: 1600, h: 14 }, { x: 0, y: 0, w: 14, h: 1200 }, { x: 1586, y: 0, w: 14, h: 1200 },
                    { x: 0, y: 1186, w: 740, h: 14 }, { x: 860, y: 1186, w: 740, h: 14 },
                    // Interior (doors are cut through these by ROOM_DEFS)
                    { x: 360, y: 14, w: 14, h: 1172 }, { x: 1226, y: 14, w: 14, h: 1172 },    // west and east spines
                    { x: 14, y: 560, w: 346, h: 14 },                                        // powder room | gents
                    { x: 374, y: 986, w: 852, h: 14 },                                       // hall | foyer
                    { x: 1240, y: 276, w: 346, h: 14 },                                      // lounge | VIP
                    { x: 1330, y: 290, w: 14, h: 896 },                                      // corridor | suites
                    { x: 1344, y: 580, w: 242, h: 14 }, { x: 1344, y: 884, w: 242, h: 14 },  // suite walls
                ],
                transitions: [ {x: 740, y: 1170, w: 120, h: 30, target: 'hub_949', label: 'Exit Nightclub'} ],
                landmarks: [
                    { id: 'club_exit', x: 800, y: 1165 }, { id: 'mirabel_booth', x: 1470, y: 200 },
                    { id: 'club_bar', x: 530, y: 500 }, { id: 'club_dancefloor', x: 800, y: 500 },
                    { id: 'club_dj_booth', x: 800, y: 150 }
                ]
            },
            'church_boss': {
                id: 'church_boss', width: 1200, height: 1400, type: 'outdoor',
                climate: 'tempest',   // Boss arena: effectively never clears
                label: 'Abandoned Church', floorColor: '#0e0c12',
                // The Sanctum, open to the storm: the apse (dais, altar, rose window, ruined organ) where the
                // Triumvirate kneel; the nave and its gold sigil (the arena); pillared aisles for cover; the
                // narthex at the door. Furniture: sc_* (drawSanctumDecorProp); floor: drawSanctumInterior;
                // glows: drawSanctumGlow and the wardens' eyes (drawBossGlow).
                navProps: 'all',
                wallStyle: { fill: '#16121a', stroke: 'rgba(170,120,255,0.35)' },
                spawn: { x: 600, y: 1250 },
                zones: [],
                walls: [ {x:0,y:0,w:1200,h:50}, {x:0,y:1350,w:550,h:50}, {x:650,y:1350,w:550,h:50}, {x:0,y:0,w:50,h:1400}, {x:1150,y:0,w:50,h:1400} ],
                transitions: [ {x: 550, y: 1320, w: 100, h: 80, target: 'hotel_suite', label: 'Exit Church'} ],
                landmarks: [
                    { id: 'church_exit', x: 600, y: 1370 }, { id: 'church_altar', x: 600, y: 175 },
                    { id: 'boss_spawn', x: 600, y: 400 }
                ]
            },
            'enni_cole_interior': {
                id: 'enni_cole_interior', width: 2000, height: 1400, type: 'indoor',
                label: 'Enni Cole', floorColor: '#0a0a0c',
                spawn: { x: 1000, y: 1300 },
                zones: [
                    { x: 450, y: 280, w: 1100, h: 800, color: '#0e0e12' },
                    { x: 60, y: 60, w: 380, h: 1100, color: '#100a0e' },
                    { x: 1540, y: 60, w: 400, h: 1100, color: '#100a0e' },
                    { x: 200, y: 60, w: 1600, h: 200, color: '#12080e' },
                    { x: 920, y: 280, w: 160, h: 920, color: '#1a0e14', texture: 'carpet' },
                    { x: 700, y: 1150, w: 600, h: 130, color: '#0f0f14' },
                ],
                walls: [
                    { x: 0, y: 0, w: 2000, h: 50 }, { x: 0, y: 1350, w: 850, h: 50 },
                    { x: 1150, y: 1350, w: 850, h: 50 }, { x: 0, y: 0, w: 50, h: 1400 },
                    { x: 1950, y: 0, w: 50, h: 1400 }, { x: 440, y: 60, w: 20, h: 580 },
                    { x: 440, y: 760, w: 20, h: 400 }, { x: 1540, y: 60, w: 20, h: 580 },
                    { x: 1540, y: 760, w: 20, h: 400 }, { x: 200, y: 260, w: 250, h: 15 },
                    { x: 1550, y: 260, w: 250, h: 15 }, { x: 60, y: 1060, w: 150, h: 15 },
                    { x: 260, y: 1060, w: 150, h: 15 }, { x: 60, y: 1060, w: 15, h: 120 },
                    { x: 210, y: 1060, w: 15, h: 120 }, { x: 400, y: 1060, w: 15, h: 120 },
                ],
                transitions: [ { x: 850, y: 1320, w: 300, h: 80, target: 'hub_949', label: 'Exit to City' } ],
                landmarks: [
                    { id: 'enni_cole_exit', x: 1000, y: 1370 }, { id: 'enni_cole_atrium', x: 1000, y: 650 },
                    { id: 'enni_cole_couture', x: 250, y: 600 }, { id: 'enni_cole_accessories', x: 1750, y: 600 },
                    { id: 'enni_cole_checkout', x: 1000, y: 1220 }, { id: 'enni_cole_gallery', x: 1000, y: 130 }
                ]
            },
            'cozy_cafe_interior': {
                id: 'cozy_cafe_interior', width: 1200, height: 1000, type: 'indoor',
                label: 'Cozy Cafe', floorColor: '#1a1008',
                spawn: { x: 600, y: 900 },
                zones: [
                    { x: 60, y: 60, w: 1080, h: 600, color: '#2a1a0e', texture: 'wood' },
                    { x: 60, y: 60, w: 350, h: 200, color: '#1e1208' },
                    { x: 700, y: 60, w: 440, h: 250, color: '#1a1410' },
                    { x: 450, y: 800, w: 300, h: 140, color: '#3e2723', texture: 'carpet' },
                ],
                walls: [
                    { x: 0, y: 0, w: 1200, h: 50 }, { x: 0, y: 950, w: 500, h: 50 },
                    { x: 700, y: 950, w: 500, h: 50 }, { x: 0, y: 0, w: 50, h: 1000 },
                    { x: 1150, y: 0, w: 50, h: 1000 }, { x: 700, y: 300, w: 450, h: 15 },
                    { x: 690, y: 60, w: 15, h: 240 }, { x: 120, y: 250, w: 300, h: 20 },
                    { x: 400, y: 100, w: 20, h: 170 }, { x: 950, y: 700, w: 200, h: 15 },
                    { x: 940, y: 700, w: 15, h: 250 },
                ],
                transitions: [ { x: 500, y: 920, w: 200, h: 80, target: 'hub_949', label: 'Exit to City' } ],
                landmarks: [
                    { id: 'cafe_exit', x: 600, y: 960 }, { id: 'cafe_counter', x: 250, y: 200 },
                    { id: 'cafe_dining', x: 500, y: 550 }, { id: 'cafe_booths', x: 850, y: 550 },
                    { id: 'cafe_kitchen', x: 900, y: 150 }
                ]
            },
            'auto_shop': {
                id: 'auto_shop', width: 1400, height: 1000, type: 'indoor',
                label: 'Torque Auto — Service Bay', floorColor: '#222222',
                spawn: { x: 700, y: 900 },
                zones: [
                    // Service bay floor — oil-stained concrete
                    { x: 50, y: 50, w: 800, h: 600, color: '#2a2a2a', texture: 'concrete' },
                    // Counter/showroom area (right side)
                    { x: 900, y: 50, w: 450, h: 600, color: '#1a1520' },
                    // Backroom / parts storage
                    { x: 900, y: 700, w: 450, h: 250, color: '#1a1a1a' }
                ],
                walls: [
                    // Outer walls
                    { x: 0, y: 0, w: 1400, h: 50 }, { x: 0, y: 950, w: 600, h: 50 }, { x: 800, y: 950, w: 600, h: 50 },
                    { x: 0, y: 0, w: 50, h: 1000 }, { x: 1350, y: 0, w: 50, h: 1000 },
                    // Divider wall: bay vs showroom (with gap for walkthrough)
                    { x: 880, y: 50, w: 20, h: 280 }, { x: 880, y: 430, w: 20, h: 220 },
                    // Backroom wall, and its west wall onto the bay (a door is cut through it: ROOM_DEFS)
                    { x: 880, y: 690, w: 470, h: 20 },
                    { x: 880, y: 650, w: 20, h: 40 }, { x: 880, y: 710, w: 20, h: 240 }
                ],
                transitions: [ { x: 600, y: 920, w: 200, h: 80, target: 'hub_949', label: 'Exit to City' } ],
                landmarks: [
                    { id: 'shop_exit', x: 700, y: 960 }, { id: 'shop_counter', x: 1100, y: 300 },
                    { id: 'shop_bay_1', x: 250, y: 200 }, { id: 'shop_bay_2', x: 250, y: 450 },
                    { id: 'shop_lift', x: 600, y: 350 }, { id: 'shop_parts', x: 1100, y: 800 }
                ]
            },
            'neural_sys_interior': {
                id: 'neural_sys_interior', width: 1000, height: 800, type: 'indoor',
                label: 'Neural Systems — Sequencing Lab', floorColor: '#0c0c1a',
                spawn: { x: 500, y: 700 },
                zones: [
                    // Main showroom — dark blue-black with faint grid feel
                    { x: 50, y: 50, w: 900, h: 500, color: '#0e0e20' },
                    // Consultation alcove (left)
                    { x: 50, y: 550, w: 350, h: 200, color: '#101028' },
                    // Server room (right, behind counter)
                    { x: 600, y: 550, w: 350, h: 200, color: '#08081a' }
                ],
                walls: [
                    // Outer walls
                    { x: 0, y: 0, w: 1000, h: 50 }, { x: 0, y: 750, w: 400, h: 50 }, { x: 600, y: 750, w: 400, h: 50 },
                    { x: 0, y: 0, w: 50, h: 800 }, { x: 950, y: 0, w: 50, h: 800 },
                    // Divider: consultation alcove wall (with gap)
                    { x: 400, y: 550, w: 15, h: 80 }, { x: 400, y: 700, w: 15, h: 50 },
                    // Divider: server room wall (with gap)
                    { x: 585, y: 550, w: 15, h: 80 }, { x: 585, y: 700, w: 15, h: 50 },
                    // Alcove ceilings-to-walls: the consultation and server rooms are rooms now
                    { x: 50, y: 550, w: 365, h: 15 }, { x: 585, y: 550, w: 365, h: 15 },
                    // Back wall accent strip
                    { x: 200, y: 50, w: 600, h: 8 }
                ],
                transitions: [ { x: 400, y: 720, w: 200, h: 80, target: 'hub_949', label: 'Exit Neural Systems' } ],
                landmarks: [
                    { id: 'neural_exit', x: 500, y: 760 },
                    { id: 'neural_counter', x: 500, y: 250 },
                    { id: 'neural_console_left', x: 200, y: 200 },
                    { id: 'neural_console_right', x: 800, y: 200 },
                    { id: 'neural_server', x: 775, y: 650 }
                ]
            },
            'biggs_arena': {
                id: 'biggs_arena', width: 900, height: 900, type: 'indoor',
                label: 'Biggs Amusement Park — Crash Royale', floorColor: '#1a0a20',
                ambientDarkness: 0.65, // Carnival arena — enough darkness for headlight beams
                spawn: { x: 450, y: 820 },
                zones: [
                    // Main arena floor — dark violet
                    { x: 80, y: 80, w: 740, h: 700, color: '#1e0e28' },
                    // Center circle — amber glow zone
                    { x: 350, y: 330, w: 200, h: 200, color: '#2a1a08' },
                    // Entry corridor
                    { x: 350, y: 780, w: 200, h: 100, color: '#120818' },
                    // Corner accent zones
                    { x: 80, y: 80, w: 120, h: 120, color: '#250a30' },
                    { x: 700, y: 80, w: 120, h: 120, color: '#250a30' },
                    { x: 80, y: 660, w: 120, h: 120, color: '#250a30' },
                    { x: 700, y: 660, w: 120, h: 120, color: '#250a30' }
                ],
                walls: [
                    // Outer perimeter (thick bouncy walls)
                    { x: 0, y: 0, w: 900, h: 60 },
                    { x: 0, y: 0, w: 60, h: 900 },
                    { x: 840, y: 0, w: 60, h: 900 },
                    { x: 0, y: 840, w: 350, h: 60 },
                    { x: 550, y: 840, w: 350, h: 60 },
                    // Corner fillets (angled walls for deflection)
                    { x: 60, y: 60, w: 40, h: 40 },
                    { x: 800, y: 60, w: 40, h: 40 },
                    { x: 60, y: 800, w: 40, h: 40 },
                    { x: 800, y: 800, w: 40, h: 40 },
                    // Center obstacles — two pillars for chaos
                    { x: 350, y: 350, w: 40, h: 40 },
                    { x: 510, y: 470, w: 40, h: 40 }
                ],
                transitions: [ { x: 350, y: 840, w: 200, h: 60, target: 'hub_949', label: 'Exit Biggs Park' } ],
                landmarks: [
                    { id: 'biggs_entrance', x: 450, y: 850 },
                    { id: 'biggs_center', x: 450, y: 450 }
                ]
            },
            // The House of Death — the gauntlet's first map (GAUNTLET_MAPS, entities/enemies.js).
            // A modern glass-and-steel villa inside a gothic shell. Rooms and doors: ROOM_DEFS;
            // furniture: createMapEntities; floor art: drawHouseInterior; glows: drawHouseGlow.
            //   Library | Chapel      | Bedroom | Bath
            //   Dining  | Grand hall  | Courtyard (open to the sky)
            //   Kitchen | Foyer       | Gallery (L) / Reliquary
            'house_of_death': {
                id: 'house_of_death', width: 1800, height: 1500, type: 'indoor',
                label: 'The House of Death', floorColor: '#0d0a10',
                ambientDarkness: 0.9,
                navProps: 'all',                                  // furniture is routed around, not walked into (stools and chairs too)
                wallStyle: { fill: '#16111b', stroke: 'rgba(201,164,106,0.4)' },   // black marble, gold trim
                spawn: { x: 900, y: 1420 },
                zones: [
                    { x: 14, y: 14, w: 546, h: 416, color: '#241812' },       // library: walnut
                    { x: 574, y: 14, w: 652, h: 416, color: '#16131a' },      // chapel: dark flags
                    { x: 1240, y: 14, w: 320, h: 416, color: '#23152a' },     // bedroom: plum
                    { x: 1574, y: 14, w: 212, h: 416, color: '#d9d4d8' },     // bath: white marble
                    { x: 14, y: 444, w: 546, h: 556, color: '#221610' },      // dining: parquet
                    { x: 574, y: 444, w: 652, h: 556, color: '#141018' },     // grand hall: black marble
                    { x: 1240, y: 444, w: 546, h: 556, color: '#1c211f' },    // courtyard: wet stone
                    { x: 14, y: 1014, w: 546, h: 472, color: '#2a2a30' },     // kitchen: concrete
                    { x: 574, y: 1014, w: 652, h: 472, color: '#1a1620' },    // foyer: marble checker
                    { x: 1240, y: 1014, w: 546, h: 472, color: '#1a1216' },   // gallery
                ],
                walls: [
                    // Outer shell (the front door in the middle of the south wall)
                    { x: 0, y: 0, w: 1800, h: 14 }, { x: 0, y: 0, w: 14, h: 1500 }, { x: 1786, y: 0, w: 14, h: 1500 },
                    { x: 0, y: 1486, w: 830, h: 14 }, { x: 970, y: 1486, w: 830, h: 14 },
                    // Interior (doors are cut through these by ROOM_DEFS)
                    { x: 560, y: 14, w: 14, h: 1472 }, { x: 1226, y: 14, w: 14, h: 1472 },   // west and east spines
                    { x: 14, y: 430, w: 1772, h: 14 }, { x: 14, y: 1000, w: 1772, h: 14 },   // north and south cross walls
                    { x: 1560, y: 14, w: 14, h: 416 },                                     // bedroom | bath
                    { x: 1240, y: 1164, w: 396, h: 14 }, { x: 1622, y: 1178, w: 14, h: 308 }, // the reliquary inside the gallery's L
                ],
                transitions: [ { x: 830, y: 1470, w: 140, h: 30, target: 'hub_949', label: 'Leave the House' } ],
                landmarks: [
                    { id: 'house_foyer', x: 900, y: 1300 }, { id: 'house_hall', x: 900, y: 720 },
                    { id: 'house_chapel', x: 900, y: 200 }, { id: 'house_courtyard', x: 1510, y: 720 }
                ]
            },
            'ollo_test': {
                id: 'ollo_test', width: 2000, height: 1500, type: 'outdoor',
                climate: 'plaza',   // Driest profile in the game
                label: 'OllO Plaza', floorColor: '#1a1215',
                spawn: { x: 1000, y: 1200 },
                floorZones: [
                    { x: 400, y: 200, w: 1200, h: 800, color: '#4a2020' },
                    { x: 500, y: 1000, w: 1000, h: 300, color: '#3d3030' },
                    { x: 0, y: 0, w: 2000, h: 200, color: '#1a1018' }
                ],
                zones: [], buildings: [],
                walls: [
                    { x: 0, y: 0, w: 2000, h: 30 },
                    { x: 0, y: 1470, w: 400, h: 30 },
                    { x: 1600, y: 1470, w: 400, h: 30 },
                    { x: 0, y: 0, w: 30, h: 1500 },
                    { x: 1970, y: 0, w: 30, h: 1500 }
                ],
                transitions: [
                    { x: 400, y: 1450, w: 1200, h: 50, target: 'hub_949', label: 'Return to City' }
                ],
                pavements: [], crosswalks: [],
                landmarks: [ { id: 'ollo_entrance', x: 1000, y: 700 } ]
            },
            'ollo_interior': {
                id: 'ollo_interior', width: 800, height: 600, type: 'indoor',
                label: 'OllO Lounge', floorColor: '#1a0a0a',
                spawn: { x: 400, y: 500 },
                zones: [
                    { x: 50, y: 50, w: 700, h: 500, color: '#2a1515' },
                    { x: 300, y: 200, w: 200, h: 250, color: '#3d1a1a' }
                ],
                walls: [
                    { x: 0, y: 0, w: 800, h: 30 },
                    { x: 0, y: 570, w: 300, h: 30 },
                    { x: 500, y: 570, w: 300, h: 30 },
                    { x: 0, y: 0, w: 30, h: 600 },
                    { x: 770, y: 0, w: 30, h: 600 }
                ],
                transitions: [
                    { x: 300, y: 560, w: 200, h: 40, target: 'ollo_test', label: 'Exit to Plaza' }
                ],
                landmarks: [ { id: 'ollo_bar', x: 400, y: 100 } ]
            }
        };


        // ============================================================================
        //  createMapEntities — Instantiate props, NPCs, and lamps for a given map.
        //  Called once per loadMap() to lazily create only the current map's entities.
        const OLLO_BUILDING_DATA = {"name":"ollo_exp","category":"commercial","w":500,"h":400,"hasCollision":true,"footprint":[{"x":-700,"y":-480,"w":1400,"h":480,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"top"},{"x":-120,"y":0,"w":20,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"lv_78685"},{"x":-60,"y":0,"w":20,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"lv_78685"},{"x":-180,"y":0,"w":20,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"lv_78685"},{"x":40,"y":0,"w":20,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"lv_78685"},{"x":100,"y":0,"w":20,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"lv_78685"},{"x":160,"y":0,"w":20,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"cornerRadius":4,"name":"","type":"roundrect","level":"lv_78685"},{"x":-40,"y":0,"w":40,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"name":"","type":"rect","level":"lv_29826"},{"x":0,"y":0,"w":40,"h":10,"fill":"#000000","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"name":"","type":"rect","level":"lv_29826"},{"x":-250,"y":0,"w":500,"h":130,"fill":"#5c1e1f","stroke":"#3d2510","strokeWidth":1,"opacity":1,"rotation":0,"name":"","type":"rect","level":"lv_66877","inset":false},{"x":-250,"y":130,"w":500,"h":20,"fill":"#d8b388","stroke":"#ffffff","strokeWidth":1,"opacity":1,"rotation":0,"name":"","type":"rect","level":"lv_66877","inset":false}],"details":[{"x":-40,"y":10,"w":80,"h":44,"target":"","name":"","type":"entrance","level":"base"},{"x":-110,"y":10,"color":"#ffeebb","intensity":0.6,"radius":60,"shape":"square","edge":"bottom","name":"","type":"wall_lamp","level":"lv_29826"},{"x":0,"y":-50,"text":"OllO","color":"#ffdc8a","fontSize":60,"name":"","type":"neon_sign","level":"lv_27173"},{"x":-80,"y":-20,"r":5,"color":"#ffcc44","name":"","type":"roof_light","level":"top"},{"x":-50,"y":10,"color":"#ffeebb","intensity":0.6,"radius":60,"shape":"square","edge":"bottom","name":"","type":"wall_lamp","level":"lv_29826"},{"x":-170,"y":10,"color":"#ffeebb","intensity":0.6,"radius":60,"shape":"square","edge":"bottom","name":"","type":"wall_lamp","level":"lv_29826"},{"x":0,"y":-110,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_27173","animOffset":2901.979257161702},{"x":0,"y":-20,"radius":120,"color":"#ffbb33","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_27173","animOffset":2260.7082197626737},{"x":-60,"y":0,"x2":-40,"y2":0,"color":"#8a7a6a","name":"","type":"interior_wall","level":"base"},{"x":-120,"y":0,"x2":-100,"y2":0,"color":"#8a7a6a","name":"","type":"interior_wall","level":"base"},{"x":-180,"y":0,"x2":-160,"y2":0,"color":"#8a7a6a","name":"","type":"interior_wall","level":"base"},{"x":-240,"y":-100,"color":"#ffac47","intensity":0.7,"radius":200,"name":"","type":"interior_lamp","level":"base"},{"x":-140,"y":-70,"color":"#ffac47","intensity":1,"radius":400,"name":"","type":"interior_lamp","level":"base"},{"x":-170,"y":80,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":2,"angle":0,"name":"","type":"lamp","level":"base","animOffset":2706.428559465008},{"x":-50,"y":80,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":2,"angle":0,"name":"","type":"lamp","level":"base","animOffset":2706.428559465008},{"x":50,"y":80,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":2,"angle":0,"name":"","type":"lamp","level":"base","animOffset":2706.428559465008},{"x":170,"y":80,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":2,"angle":0,"name":"","type":"lamp","level":"base","animOffset":2706.428559465008},{"x":50,"y":10,"color":"#ffeebb","intensity":0.6,"radius":60,"shape":"square","edge":"bottom","name":"","type":"wall_lamp","level":"lv_29826"},{"x":110,"y":10,"color":"#ffeebb","intensity":0.6,"radius":60,"shape":"square","edge":"bottom","name":"","type":"wall_lamp","level":"lv_29826"},{"x":170,"y":10,"color":"#ffeebb","intensity":0.6,"radius":60,"shape":"square","edge":"bottom","name":"","type":"wall_lamp","level":"lv_29826"},{"x":80,"y":-20,"r":5,"color":"#ffcc44","name":"","type":"roof_light","level":"top"},{"x":-40,"y":-250,"w":80,"h":160,"color":"#ffb566","name":"","type":"skylight","level":"lv_37888"},{"x":-80,"y":-250,"w":40,"h":160,"curveX":30,"curveY":0,"color":"#ffb566","name":"","type":"skylight_corner","level":"lv_37888"},{"x":40,"y":-250,"w":40,"h":160,"curveX":30,"curveY":0,"color":"#ffb566","name":"","type":"skylight_corner","level":"lv_37888","rotation":0,"scaleX":-1},{"x":-40,"y":-410,"w":80,"h":160,"color":"#ffb566","name":"","type":"skylight","level":"lv_37888"},{"x":-120,"y":-410,"w":80,"h":160,"color":"#ffb566","name":"","type":"skylight","level":"lv_37888"},{"x":40,"y":-410,"w":80,"h":160,"color":"#ffb566","name":"","type":"skylight","level":"lv_37888"},{"x":100,"y":-70,"radius":120,"color":"#ff3d3d","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_27173","animOffset":2260.7082197626737},{"x":-100,"y":-70,"radius":120,"color":"#ff3d3d","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_27173","animOffset":2260.7082197626737},{"x":40,"y":0,"x2":60,"y2":0,"color":"#8a7a6a","name":"","type":"interior_wall","level":"base"},{"x":100,"y":0,"x2":120,"y2":0,"color":"#8a7a6a","name":"","type":"interior_wall","level":"base"},{"x":160,"y":0,"x2":180,"y2":0,"color":"#8a7a6a","name":"","type":"interior_wall","level":"base"},{"x":140,"y":-70,"color":"#ffac47","intensity":1,"radius":400,"name":"","type":"interior_lamp","level":"base"},{"x":0,"y":-330,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_1755","animOffset":2384.3235611068035},{"x":120,"y":-330,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_1755","animOffset":2384.3235611068035},{"x":-120,"y":-330,"radius":120,"color":"#ffeebb","intensity":0.8,"lampType":3,"angle":0,"name":"","type":"lamp","level":"lv_1755","animOffset":2384.3235611068035}],"type":"building","levels":[{"id":"lv_66877","name":"Ground Details","visible":true},{"id":"base","name":"Base","visible":true},{"id":"lv_78685","name":"Base Details","visible":true},{"id":"lv_29826","name":"Base Details Lights","visible":true},{"id":"top","name":"Top","visible":true},{"id":"lv_37888","name":"Top Details","visible":true},{"id":"lv_27173","name":"Neon Sign","visible":true},{"id":"lv_1755","name":"Level 6","visible":true}],"version":"1.0"};
