        // ============================================================================
        //  HUB SCRIPTED NPC ANCHORS
        //  hub_949's buildings are NOT authored — they're generated at load time by
        //  city.autoFillAll(), which picks positions with Math.random(). These NPC
        //  spawns are fixed literals, so nothing reconciles the two: on some loads a
        //  filler building lands on top of Mirabel or Anavia. Map NPCs never go
        //  through placeEntitySmart() either (that runs for teammates only), so there
        //  is no recovery pass. Reserving each anchor as a CityLayout safe zone BEFORE
        //  autoFill runs keeps the generator from ever choosing those spots.
        //  Single source of truth: createMapEntities reads these too.
        // ============================================================================
        const HUB_NPC_ANCHORS = [
            { name: 'Mirabel', x: 2000, y: 1850 },
            { name: 'Anavia',  x: 550,  y: 1650, role: 'vip' },
        ];
        const HUB_NPC_CLEARANCE = 90; // px half-extent kept building-free per anchor

        // ============================================================================
        function createMapEntities(mapId) {
            const e = { props: [], npcs: [], lamps: [] };
            switch (mapId) {

                case 'hub_949':
                    e.props = [ new PropEntity({ x: 1900, y: 1330 }), new PropEntity({ x: 2100, y: 1330 }) ];
                    e.npcs = [
                        ...HUB_NPC_ANCHORS.map(a => new NPC(a.x, a.y, a.name, a.role)),
                        new Ganger(1800, 1000), new Ganger(2200, 1200)
                    ];
                    break;

                case 'ethereal_plane':
                    e.props = [ new PropEntity({ x: 300, y: 300, width: 60, height: 150, color: '#4b0082' }), new PropEntity({ x: 900, y: 300, width: 60, height: 150, color: '#4b0082' }), new PropEntity({ x: 600, y: 600, width: 100, height: 100, color: '#8a2be2' }) ];
                    e.npcs = [ new NPC(400, 500, "Lost Soul", 'spirit'), new NPC(800, 500, "Wandering Spirit", 'spirit'), new NPC(600, 350, "Spirit Guide", 'spirit') ];
                    break;

                case 'apt_949': {
                    // Cozy-modern suite. Furniture art lives in drawApartmentDecorProp, floor art
                    // (planks, tiles, rugs, deck) in drawApartmentInterior, glows in drawApartmentGlow.
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#4a3a30', decorType }, extra));
                    e.props = [
                        new PropEntity({ x: 400, y: 500, width: 120, height: 70, color: '#4a2832', interactionType: 'couch_two_seater', decorType: 'apt_sofa' }),
                        new PropEntity({ x: 550, y: 420, width: 60, height: 25, color: '#ff6622', interactionType: 'tv_screen', decorType: 'apt_fireplace' }),
                        new PropEntity({ x: 340, y: 470, width: 30, height: 30, color: '#3d2a22', interactionType: 'bedside_table', decorType: 'apt_side', light: { radius: 110, color: '#ffd2a8', intensity: 0.85, dx: -2, dy: -1 } }),
                        new PropEntity({ x: 560, y: 470, width: 30, height: 30, color: '#3d2a22', interactionType: 'bedside_table', decorType: 'apt_side', light: { radius: 110, color: '#ffd2a8', intensity: 0.85, dx: -2, dy: -1 } }),
                        new PropEntity({ x: 30, y: 340, width: 44, height: 50, color: '#2a2a3a', interactionType: 'armory' }),
                        new PropEntity({ x: 30, y: 520, width: 40, height: 60, mass: 1e7, color: '#00f3ff', interactionType: 'vending_machine' }),
                        new PropEntity({ x: 1111, y: 226, width: 18, height: 14, color: '#3a4a6a', interactionType: 'read_note', noteId: 'larissa_briefing_darklands' }),
                        new PropEntity({ x: 30, y: 730, width: 40, height: 60, mass: 1e7, color: '#0f0', interactionType: 'medbay_refill' }),
                        new PropEntity({ x: 1010, y: 216, width: 90, height: 110, color: '#334466', interactionType: 'bed_sleep', decorType: 'apt_bed', mass: 1e7 }),
                        new PropEntity({ x: 750, y: 750, width: 60, height: 35, mass: 1e7, color: '#2a2a3a', interactionType: 'crafting_table', decorType: 'apt_craft' }),
                        // Living room: lounge
                        F(438, 452, 64, 30, 'apt_coffee'), F(600, 505, 40, 40, 'apt_chair'),
                        F(300, 212, 180, 20, 'apt_bookshelf'), F(640, 212, 140, 22, 'apt_console'),
                        F(26, 222, 30, 30, 'apt_plant'), F(852, 450, 30, 30, 'apt_plant'), F(846, 820, 34, 34, 'apt_plant'),
                        F(296, 428, 22, 22, 'apt_floor_lamp'), F(689, 689, 22, 22, 'apt_floor_lamp'), F(98, 452, 22, 22, 'apt_floor_lamp'),
                        // Living room: kitchen along the south wall + open bar island
                        F(96, 834, 44, 50, 'apt_fridge'), F(140, 848, 110, 36, 'apt_sink'), F(250, 848, 20, 36, 'apt_counter'),
                        F(270, 846, 84, 38, 'apt_gas_range'), F(354, 848, 60, 36, 'apt_counter'), F(414, 848, 64, 36, 'apt_induction'),
                        F(478, 848, 112, 36, 'apt_counter'),
                        F(170, 742, 360, 34, 'apt_island'),
                        F(212, 712, 18, 18, 'apt_stool'), F(292, 712, 18, 18, 'apt_stool'), F(372, 712, 18, 18, 'apt_stool'), F(452, 712, 18, 18, 'apt_stool'),
                        // Bedroom
                        F(980, 220, 26, 26, 'apt_nightstand'), F(1104, 220, 26, 26, 'apt_nightstand'),
                        F(1348, 226, 36, 110, 'apt_wardrobe'), F(1340, 392, 44, 64, 'apt_vanity'),
                        F(1226, 456, 40, 40, 'apt_chair'), F(1350, 500, 28, 28, 'apt_plant'),
                        // Bathroom
                        F(1244, 598, 128, 64, 'apt_tub'), F(952, 850, 150, 34, 'apt_bath_vanity'),
                        F(1286, 776, 98, 108, 'apt_shower'), F(914, 620, 12, 90, 'apt_towels'),
                        F(1212, 598, 26, 26, 'apt_plant'), F(1120, 850, 26, 26, 'apt_plant'),
                        // Veranda
                        F(300, 52, 26, 64, 'apt_lounger'), F(336, 72, 22, 22, 'apt_side'), F(368, 52, 26, 64, 'apt_lounger'),
                        F(990, 60, 70, 50, 'apt_bistro'), F(770, 22, 22, 34, 'apt_telescope'),
                        F(16, 20, 60, 22, 'apt_planter'), F(1324, 20, 60, 22, 'apt_planter'), F(560, 20, 60, 22, 'apt_planter'),
                        // Light Switches — one per indoor room
                        new PropEntity({ x: 275, y: 210, width: 10, height: 14, color: '#2a2a2a', interactionType: 'light_switch', roomId: 'main_room', mass: 999999 }),
                        new PropEntity({ x: 912, y: 296, width: 10, height: 14, color: '#2a2a2a', interactionType: 'light_switch', roomId: 'bedroom', mass: 999999 }),
                        new PropEntity({ x: 1010, y: 555, width: 10, height: 14, color: '#2a2a2a', interactionType: 'light_switch', roomId: 'bathroom', mass: 999999 }),
                    ];
                    e.lamps = [
                        new LampEntity({ x: 16, y: 100, lampType: 5, color: '#ffaa88', lightRadius: 400, angle: 0 }),
                        new LampEntity({ x: 350, y: 194, lampType: 5, color: '#ff8899', lightRadius: 400, angle: Math.PI / 2 }),
                        new LampEntity({ x: 700, y: 194, lampType: 5, color: '#ff8899', lightRadius: 400, angle: Math.PI / 2 }),
                        new LampEntity({ x: 1050, y: 194, lampType: 5, color: '#ff8899', lightRadius: 400, angle: Math.PI / 2 }),
                        new LampEntity({ x: 1384, y: 100, lampType: 5, color: '#ffaa88', lightRadius: 400, angle: Math.PI }),
                        new LampEntity({ x: 16, y: 350, lampType: 5, color: '#ffbb88', lightRadius: 500, angle: 0 }),
                        new LampEntity({ x: 16, y: 600, lampType: 5, color: '#ffaa77', lightRadius: 500, angle: 0 }),
                        new LampEntity({ x: 16, y: 800, lampType: 5, color: '#ffbb88', lightRadius: 450, angle: 0 }),
                        new LampEntity({ x: 450, y: 214, lampType: 5, color: '#ffccaa', lightRadius: 500, angle: Math.PI / 2 }),
                        new LampEntity({ x: 750, y: 214, lampType: 5, color: '#ffccaa', lightRadius: 500, angle: Math.PI / 2 }),
                        new LampEntity({ x: 450, y: 884, lampType: 5, color: '#ff9977', lightRadius: 400, angle: Math.PI / 2 }),
                        new LampEntity({ x: 307, y: 439, lampType: 4, color: '#ff8866', lightRadius: 500 }),
                        new LampEntity({ x: 700, y: 700, lampType: 4, color: '#ffaa88', lightRadius: 450 }),
                        new LampEntity({ x: 109, y: 463, lampType: 4, color: '#ffbb99', lightRadius: 400 }),
                        new LampEntity({ x: 290, y: 759, lampType: 4, color: '#ffb880', lightRadius: 170 }),   // bar pendants
                        new LampEntity({ x: 410, y: 759, lampType: 4, color: '#ffb880', lightRadius: 170 }),
                        new LampEntity({ x: 1100, y: 214, lampType: 5, color: '#ffaabb', lightRadius: 450, angle: Math.PI / 2 }),
                        new LampEntity({ x: 1384, y: 350, lampType: 5, color: '#ff99aa', lightRadius: 450, angle: Math.PI }),
                        new LampEntity({ x: 1100, y: 400, lampType: 4, color: '#ff99bb', lightRadius: 400 }),
                        new LampEntity({ x: 1250, y: 562, lampType: 5, color: '#e8e4f0', lightRadius: 300, angle: Math.PI / 2 }),   // clear of the bathroom door
                        new LampEntity({ x: 1384, y: 700, lampType: 5, color: '#e8e4f0', lightRadius: 320, angle: Math.PI }),
                        new LampEntity({ x: 1027, y: 884, lampType: 5, color: '#ffe0cc', lightRadius: 260, angle: Math.PI / 2 }),   // vanity mirror light
                        new LampEntity({ x: 916, y: 770, lampType: 5, color: '#ffe8dc', lightRadius: 320, angle: 0 }),   // bathroom west wall, by the towels
                        new LampEntity({ x: 600, y: 884, lampType: 5, color: '#ffaa55', lightRadius: 300, angle: Math.PI / 2 }),   // beside the exit, not in it
                        new LampEntity({ x: 800, y: 884, lampType: 5, color: '#ffaa55', lightRadius: 300, angle: Math.PI / 2 }),
                    ];
                    // Shadowless soft lights: the light the decor casts on the floor around it.
                    // Round ones take a radius; area lights take w, h (optional `round` = corner size, `soft` = gentler edge).
                    const S = (x, y, radius, color, intensity = 0.8, flicker = 0) => ({ x, y, radius, color, intensity, flicker });
                    e.softLights = [
                        S(991, 232, 100, '#ffd2a8'), S(1115, 232, 100, '#ffd2a8'),                       // nightstand lamps
                        S(307, 439, 90, '#ffd9b0', 0.7), S(700, 700, 90, '#ffd9b0', 0.7), S(109, 463, 90, '#ffd9b0', 0.7),   // floor lamp halos
                        S(231, 759, 90, '#ffc38a', 0.75), S(350, 759, 90, '#ffc38a', 0.75), S(469, 759, 90, '#ffc38a', 0.75), // bar pendants
                        S(580, 440, 140, '#ff9a50', 0.9, 6),                                             // fireplace
                        S(433, 864, 60, '#ff5a30', 0.6), S(312, 859, 55, '#7aa8ff', 0.5, 14),              // induction zone, gas burner
                        S(1252, 616, 70, '#ffc890', 0.75, 9), S(1368, 619, 60, '#ffc890', 0.7, 9),         // tub candles
                        S(1027, 866, 90, '#ffe0cc', 0.6),                                                  // vanity mirror
                        { x: 1150, y: 724, w: 460, h: 310, round: 90, soft: true, color: '#efe8f4', intensity: 0.85 },   // bathroom ceiling: area light over the whole floor
                        S(1335, 830, 80, '#e6f0ff', 0.6),                                                  // shower glow
                        S(1246, 476, 100, '#ffd2a8', 0.75),                                                // bedroom reading chair
                        S(390, 236, 80, '#ffd9b0', 0.55),                                                  // bookshelf
                        { x: 700, y: 102, w: 1384, h: 212, round: 110, color: '#ffd6a0', intensity: 0.9, soft: true },   // veranda string lights: area light over the deck
                        { x: 700, y: 24, w: 1370, h: 70, round: 35, color: '#ffe2b8', intensity: 0.75, soft: true }       // …and brighter right under the bulbs
                    ];
                    break;
                }

                case 'hotel_lobby': {
                    // Double Nights: furniture in drawLobbyDecorProp (dn_*), floor in drawLobbyInterior,
                    // glows and the motto in drawLobbyGlow, the crowd in world/lobby-life.js.
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#1a1216', decorType }, extra));
                    const both = (x, y, w, h, t, extra) => [F(x, y, w, h, t, extra), F(1000 - x - w, y, w, h, t, extra)];   // mirrored east–west
                    e.props = [
                        F(445, 265, 110, 110, 'dn_fountain'),                                       // the rift fountain
                        F(385, 566, 230, 44, 'dn_desk'),                                            // reception
                        // Lounges either side of the runner
                        ...both(190, 760, 120, 56, 'dn_sofa'), ...both(215, 842, 70, 38, 'dn_table'),
                        ...both(180, 904, 40, 40, 'dn_wingback'), ...both(292, 904, 40, 40, 'dn_wingback'),
                        ...both(330, 760, 22, 22, 'dn_lamp'), ...both(172, 1022, 34, 34, 'dn_palm'), ...both(90, 190, 34, 34, 'dn_palm'),
                        ...both(250, 1010, 92, 34, 'dn_float_chaise'), ...both(318, 300, 40, 40, 'dn_float_chair'),
                        ...both(372, 1050, 24, 24, 'dn_lamp'),
                        // MiniSpree by the doors
                        new PropEntity({ x: 60, y: 1075, width: 40, height: 60, mass: 1e7, color: '#00f3ff', interactionType: 'vending_machine' }),
                        new PropEntity({ x: 900, y: 1075, width: 40, height: 60, mass: 1e7, color: '#00f3ff', interactionType: 'vending_machine' }),
                        // Lost luggage: someone won't miss it (searchable once a day — events.js)
                        F(214, 1062, 28, 20, 'dn_lost_luggage', { interactionType: 'lost_luggage', noteId: 'lobby_palm', label: 'Lost luggage', noNav: true }),
                        F(812, 462, 28, 20, 'dn_lost_luggage', { interactionType: 'lost_luggage', noteId: 'lobby_elevator', label: 'Lost luggage', noNav: true }),
                        F(760, 726, 28, 20, 'dn_lost_luggage', { interactionType: 'lost_luggage', noteId: 'lobby_lounge', label: 'Lost luggage', noNav: true }),
                    ];
                    e.npcs = [ new NPC(500, 540, "LUVSH4D3", 'robot_crimson'), new NPC(150, 320, "Guard Unit Alpha", 'robot_gold'), new NPC(850, 320, "Guard Unit Beta", 'robot_gold') ];
                    const L = (x, y, color, lightRadius, lampType = 4, angle = 0) => new LampEntity({ x, y, lampType, color, lightRadius, angle });
                    e.lamps = [
                        L(500, 850, '#ffd49a', 640), L(500, 236, '#ffcf8a', 420, 5, Math.PI / 2), L(500, 612, '#ffb060', 300),
                        // Lounge lamps and the doors (the pillar sconces are soft lights: glow without the cost of shadows)
                        L(341, 771, '#ffcc88', 300), L(659, 771, '#ffcc88', 300),
                        L(500, 1146, '#ffd29a', 380, 5, -Math.PI / 2),
                    ];
                    const S = (x, y, radius, color, intensity = 0.8, flicker = 0) => ({ x, y, radius, color, intensity, flicker });
                    e.softLights = [
                        { x: 500, y: 620, w: 880, h: 1080, round: 220, soft: true, color: '#ffc890', intensity: 0.42 },   // the room's warm fill
                        { x: 500, y: 850, w: 380, h: 300, round: 150, soft: true, color: '#ffd9a0', intensity: 0.3 },   // under the chandelier
                        S(500, 320, 110, '#e0b0ff', 0.35, 3), S(500, 600, 150, '#ffb870', 0.7),                          // the rift, the desk
                        S(341, 771, 90, '#ffd0a0', 0.7), S(659, 771, 90, '#ffd0a0', 0.7), S(384, 1062, 110, '#ffd0a0', 0.75), S(616, 1062, 110, '#ffd0a0', 0.75),
                        S(215, 185, 90, '#c89cff', 0.6, 4), S(785, 185, 90, '#c89cff', 0.6, 4),                         // the portals
                        ...[350, 550, 750].flatMap(y => [S(100, y, 150, '#ffc070', 0.8), S(900, y, 150, '#ffc070', 0.8)]),   // the pillar sconces
                    ];
                    break;
                }

                case 'hotel_suite': {
                    // The Double Nights penthouse, the Dark Maker's stay: furniture art in drawSuiteDecorProp
                    // (ps_*) and the lobby's (dn_*); floors in drawSuiteInterior; embers, candles, the pool,
                    // the skyline and the mirror rift he left through in drawSuiteGlow.
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#1a1216', decorType }, extra));
                    e.props = [
                        // Living room: the console by the elevator, the conversation pit, the piano, the fireplace,
                        // the bar, dinner for two
                        F(58, 290, 30, 80, 'ps_console'),
                        F(220, 380, 220, 56, 'ps_pit_sofa', { face: 'S' }), F(220, 566, 220, 56, 'ps_pit_sofa', { face: 'N' }), F(290, 470, 80, 56, 'ps_pit_table'),
                        F(470, 76, 150, 104, 'ps_piano'),
                        F(250, 912, 160, 38, 'ps_fireplace'),
                        F(56, 730, 44, 200, 'ps_bar'),
                        F(500, 690, 110, 70, 'ps_dining'), F(468, 710, 26, 30, 'ps_chair', { face: 'E' }), F(616, 710, 26, 30, 'ps_chair', { face: 'W' }),
                        F(640, 64, 34, 34, 'dn_palm'), F(640, 880, 34, 34, 'dn_palm'), F(160, 64, 22, 22, 'dn_lamp'),
                        // Bedroom: the canopy bed, left unmade; the chaise; the desk (chess, seal, the 10/10 card);
                        // the wardrobe standing open; the suitcase he left
                        F(820, 70, 180, 200, 'ps_bed'), F(786, 84, 26, 26, 'apt_nightstand'), F(1008, 84, 26, 26, 'apt_nightstand'),
                        F(1210, 360, 110, 54, 'ps_chaise'),
                        F(1150, 600, 160, 62, 'ps_desk'), F(1216, 668, 28, 30, 'ps_chair', { face: 'N' }),
                        F(726, 540, 40, 150, 'ps_wardrobe'),
                        F(930, 360, 52, 36, 'ps_suitcase', { interactionType: 'lost_luggage', noteId: 'suite_case', label: 'Monogrammed suitcase', lootMin: 40, lootMax: 110,
                            lootLines: ['HE TRAVELS HEAVY', 'CUFFLINKS, A SILK TIE… AND PERSONICS', '10 OUT OF 10, WOULD ROB AGAIN'], noNav: true }),
                        // Bath: the tub, the vanity (the mirror rift is on the north wall, in drawSuiteGlow)
                        F(1258, 64, 84, 84, 'ps_tub'), F(1320, 170, 24, 80, 'ps_vanity'),
                        // Balcony: the plunge pool, loungers, a telescope, palms
                        F(820, 870, 170, 74, 'ps_pool'), F(1120, 846, 36, 88, 'ps_lounger'), F(1172, 846, 36, 88, 'ps_lounger'),
                        F(1286, 832, 28, 28, 'ps_telescope'), F(734, 826, 34, 34, 'dn_palm'),
                        // Dark Maker's letter — dropped by the loungers, found in the debris after the ambush
                        new PropEntity({ x: 1086, y: 952, width: 20, height: 14, mass: 1e7, color: '#c8a870', interactionType: 'read_note', noteId: 'dark_maker_letter' })
                    ];
                    // Light fixtures hidden in the ceiling (light only), soft fills per room
                    const L = (x, y, color, lightRadius) => Object.assign(new LampEntity({ x, y, lampType: 4, color, lightRadius }), { visible: false });
                    e.lamps = [ L(330, 480, '#ffcf8a', 520), L(330, 860, '#ff9a50', 320), L(900, 300, '#ff8a9a', 460), L(1230, 560, '#ffb0a0', 360), L(1235, 175, '#b8a0ff', 200), L(1040, 900, '#9ab0ff', 420) ];
                    const S = (x, y, radius, color, intensity = 0.8, flicker = 0) => ({ x, y, radius, color, intensity, flicker });
                    const A = (x, y, w, h, color, intensity) => ({ x, y, w, h, round: Math.min(w, h) / 4, soft: true, color, intensity });
                    e.softLights = [
                        A(375, 500, 620, 860, '#ffc890', 0.3), A(910, 425, 360, 730, '#ff9aa8', 0.22), A(1225, 560, 240, 460, '#ff9aa8', 0.2),
                        A(1235, 175, 220, 240, '#c8b8ff', 0.14), A(1035, 905, 620, 180, '#8aa0ff', 0.28),
                        S(330, 915, 110, '#ff8a40', 0.8, 5), S(555, 725, 70, '#ffc080', 0.6, 4), S(1230, 625, 70, '#ffc080', 0.6, 4),   // fire, dinner candles, desk candles
                        S(905, 907, 100, '#7fd8ff', 0.5, 2), S(1180, 150, 90, '#c890ff', 0.4, 3),                                     // the pool, the rift
                    ];
                    break;
                }

                case 'medbay_sw': {
                    // Furniture is immovable props (they block bullets like other props) with
                    // custom top-down art — see drawClinicDecorProp. Floor details (tiles,
                    // wayfinding stripe, the scanner platform, curtain tracks) are drawn by
                    // GameEngine.drawClinicInterior.
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#ccc', decorType }, extra));
                    e.props = [
                        new PropEntity({ x: 200, y: 180, width: 40, height: 60, mass: 1e7, color: '#0f0', interactionType: 'medbay_refill' }),
                        // Recovery bay — beds with their heads against the side walls
                        F(58, 300, 120, 56, 'bed', { headSide: 'left' }),   F(58, 470, 120, 56, 'bed', { headSide: 'left', patient: true }),
                        F(622, 300, 120, 56, 'bed', { headSide: 'right' }), F(622, 470, 120, 56, 'bed', { headSide: 'right' }),
                        F(64, 364, 22, 20, 'monitor'), F(64, 534, 22, 20, 'monitor'), F(714, 364, 22, 20, 'monitor'), F(714, 534, 22, 20, 'monitor'),
                        F(184, 284, 14, 14, 'iv'), F(184, 454, 14, 14, 'iv'), F(602, 284, 14, 14, 'iv'), F(602, 454, 14, 14, 'iv'),
                        // Pharmacy wall
                        F(62, 56, 118, 30, 'cabinet'), F(260, 56, 100, 30, 'cabinet'), F(440, 56, 100, 30, 'cabinet'), F(620, 56, 118, 30, 'cabinet'),
                        // Dr. Yin's desk (he stands behind it, facing the door)
                        F(318, 228, 164, 34, 'desk'),
                        // Waiting area by the entrance
                        F(64, 690, 150, 34, 'bench'), F(586, 690, 150, 34, 'bench'),
                        F(700, 610, 34, 34, 'cooler'), F(58, 612, 40, 40, 'plant'), F(706, 108, 34, 34, 'plant')
                    ];
                    e.npcs = [ new NPC(400, 200, "Dr. Yin", 'medic') ];
                    e.lamps = [
                        // Cool wall strips for even, clinical light (on the wall lines, between cabinets)
                        new LampEntity({ x: 53, y: 250, lampType: 5, color: '#dff4ff', lightRadius: 280 }),
                        new LampEntity({ x: 53, y: 560, lampType: 5, color: '#dff4ff', lightRadius: 280 }),
                        new LampEntity({ x: 747, y: 250, lampType: 5, color: '#dff4ff', lightRadius: 280 }),
                        new LampEntity({ x: 747, y: 560, lampType: 5, color: '#dff4ff', lightRadius: 280 }),
                        new LampEntity({ x: 220, y: 53, lampType: 5, angle: Math.PI / 2, color: '#e8f6ff', lightRadius: 250 }),
                        new LampEntity({ x: 580, y: 53, lampType: 5, angle: Math.PI / 2, color: '#e8f6ff', lightRadius: 250 }),
                        new LampEntity({ x: 250, y: 747, lampType: 5, angle: Math.PI / 2, color: '#dff4ff', lightRadius: 220 }),
                        new LampEntity({ x: 550, y: 747, lampType: 5, angle: Math.PI / 2, color: '#dff4ff', lightRadius: 220 }),
                        // Accent: the scanner's cyan core
                        new LampEntity({ x: 400, y: 480, lampType: 4, color: '#3fe3ff', lightRadius: 200 })
                    ];
                    break;
                }

                case 'moon_city_nightclub': {
                    // Moon City: furniture art in drawClubDecorProp (mc_*), floors in drawClubInterior,
                    // the light show (dance floor, beams, mirror ball, neon) in drawClubGlow.
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#1a0e22', decorType }, extra));
                    const SUITES = [290, 594, 898];
                    const CLUTCH = ['LIPSTICK, A KEYCARD… AND PERSONICS', "SHE'LL CALL IT A NIGHT'S TIP", 'LEFT WITH THE LAST SONG'];
                    const COAT = ['CHECK YOUR POCKETS, DARLING', 'FOLDED BILLS IN THE LINING'];
                    const PURSE = ['WHAT HAPPENS IN THE SUITES…', 'VIP MONEY SPENDS THE SAME', 'A THANK-YOU NOTE AND A THICK ROLL'];
                    const HANDBAG = ['DROPPED ON THE DANCE FLOOR', 'FINDERS KEEPERS'];
                    e.props = [
                        // The floor: the DJ stage and its stacks, three poles round the dance floor, high-tops, booths
                        F(620, 14, 360, 104, 'mc_stage'), F(730, 52, 140, 40, 'mc_dj'),
                        F(566, 22, 48, 72, 'mc_speaker'), F(986, 22, 48, 72, 'mc_speaker'),
                        F(795, 365, 10, 10, 'mc_pole'), F(655, 555, 10, 10, 'mc_pole'), F(935, 555, 10, 10, 'mc_pole'),
                        F(540, 140, 30, 30, 'mc_hightop'), F(1110, 150, 30, 30, 'mc_hightop'), F(1110, 820, 30, 30, 'mc_hightop'),
                        F(470, 890, 130, 70, 'mc_booth'), F(1060, 890, 130, 70, 'mc_booth'),
                        // The bar: back shelves of lit bottles, a curved marble counter, stools
                        // (the bartender serves from the gap in the middle, within reach from the floor)
                        F(378, 230, 24, 540, 'mc_backbar'), F(440, 240, 44, 225, 'mc_bar'), F(440, 535, 44, 225, 'mc_bar'),
                        ...[270, 333, 396, 585, 648, 711].map(y => F(500, y, 20, 20, 'mc_stool')),
                        // Foyer: coat check, velvet ropes along the way in, a bench, moon orbs
                        F(390, 1020, 150, 40, 'mc_coatcheck'), F(690, 1040, 10, 110, 'mc_rope'), F(900, 1040, 10, 110, 'mc_rope'),
                        F(990, 1020, 120, 36, 'mc_bench'), F(1160, 1030, 30, 30, 'mc_orb'), F(420, 1130, 30, 30, 'mc_orb'), F(1160, 1130, 30, 30, 'mc_orb'),
                        // Powder room: lit vanity, stalls, a tufted settee, the dryer
                        F(30, 20, 230, 40, 'mc_vanity'), ...[150, 240, 330, 420].map(y => F(20, y, 80, 84, 'mc_stall')),
                        F(230, 300, 44, 120, 'mc_settee'), F(290, 544, 44, 14, 'mc_dryer'),
                        // Gents: urinals, stalls, the sinks along the south wall, the dryer
                        ...[40, 90, 140, 190, 240].map(x => F(x, 580, 26, 20, 'mc_urinal')), ...[680, 772, 864, 956].map(y => F(20, y, 80, 84, 'mc_stall')),
                        F(140, 1140, 200, 40, 'mc_vanity', { face: 'N' }), F(342, 700, 14, 44, 'mc_dryer', { vertical: true }),
                        // Mirabel's lounge: the crescent sofa, champagne, a moon orb
                        F(1380, 22, 190, 64, 'mc_crescent_sofa'), F(1440, 104, 80, 34, 'mc_lowtable'), F(1258, 30, 30, 30, 'mc_orb'),
                        // The suites: a velvet couch, a low table, a private pole
                        ...SUITES.flatMap(y0 => [F(1522, y0 + 45, 56, 200, 'mc_suite_couch'), F(1450, y0 + 115, 44, 60, 'mc_lowtable'), F(1400, y0 + 50, 10, 10, 'mc_pole')]),
                        // Lost things: searched once a day for personics (searchLostLuggage), refilled the next
                        ...[['mc_lost_clutch', 150, 34, 20, 12, 'club_powder', 'Sequined clutch', 20, 60, CLUTCH],
                            ['mc_lost_clutch', 300, 1125, 20, 12, 'club_gents', 'Beaded clutch', 20, 60, CLUTCH],
                            ['mc_lost_coat', 1030, 1060, 40, 26, 'club_coat', 'Fur-trimmed coat', 30, 90, COAT],
                            ['mc_lost_handbag', 1148, 158, 20, 16, 'club_floor', 'Chain-strap handbag', 25, 75, HANDBAG],
                            ...SUITES.map((y0, i) => ['mc_lost_purse', 1532, y0 + 132, 22, 16, 'club_suite' + (i + 1), 'Velvet purse', 40, 120, PURSE])
                        ].map(([t, x, y, w, h, noteId, label, lootMin, lootMax, lootLines]) => F(x, y, w, h, t, { interactionType: 'lost_luggage', noteId, label, lootMin, lootMax, lootLines, noNav: true })),
                    ];
                    e.npcs = [
                        new NPC(452, 500, "Bartender", 'bartender'), new NPC(1480, 175, "Mirabel"),
                        new NPC(800, 392, "Scarlet", 'red_demon_dancer'), new NPC(660, 582, "Crimson", 'red_demon_dancer'), new NPC(940, 582, "Ruby", 'red_demon_dancer'),
                        new NPC(720, 470, "Male Dancer 1", 'dancer'), new NPC(880, 470, "Male Dancer 2", 'dancer'),
                        new NPC(620, 680, "Male Dancer 3", 'dancer'), new NPC(980, 680, "Male Dancer 4", 'dancer'),
                        new NPC(760, 690, "Male Dancer 5", 'dancer'), new NPC(840, 690, "Male Dancer 6", 'dancer')
                    ];
                    const L = (x, y, color, lightRadius) => Object.assign(new LampEntity({ x, y, lampType: 4, color, lightRadius }), { visible: false });   // hidden in the ceiling: light only
                    e.lamps = [
                        L(800, 500, '#b48cff', 560), L(430, 500, '#ffb870', 300), L(800, 1090, '#ffc890', 360),
                        L(187, 300, '#ffc8e0', 360), L(187, 880, '#cfdcff', 380),
                        L(1413, 150, '#ff5a7a', 300), L(1285, 740, '#c080ff', 300),
                        ...SUITES.map(y0 => L(1465, y0 + 145, '#ff4a70', 260)),
                    ];
                    const S = (x, y, radius, color, intensity = 0.8, flicker = 0) => ({ x, y, radius, color, intensity, flicker });
                    const A = (x, y, w, h, color, intensity) => ({ x, y, w, h, round: Math.min(w, h) / 4, soft: true, color, intensity });
                    e.softLights = [
                        A(800, 500, 820, 940, '#9a6cff', 0.22), A(800, 500, 460, 420, '#d890ff', 0.16),     // the floor's violet, brighter over the dancing
                        A(800, 70, 340, 100, '#e0b0ff', 0.35), A(430, 500, 110, 560, '#ffb070', 0.22),     // the stage, the bar
                        A(187, 287, 330, 530, '#ffc8e0', 0.22), A(187, 880, 330, 600, '#cfdcff', 0.2),     // powder room, gents
                        A(800, 1093, 840, 176, '#ffc890', 0.35), A(1285, 738, 86, 890, '#c080ff', 0.3),    // foyer, VIP corridor
                        A(1413, 145, 340, 256, '#ff5a7a', 0.35), ...SUITES.map(y0 => A(1465, y0 + 145, 236, 280, '#ff4a70', 0.32)),
                        S(655 + 5, 560, 70, '#e0a0ff', 0.6, 2), S(935 + 5, 560, 70, '#e0a0ff', 0.6, 2), S(800, 370, 70, '#e0a0ff', 0.6, 2),   // pole uplights
                    ];
                    break;
                }

                case 'church_boss': {
                    // The Sanctum: the altar and ruined organ on the dais, two colonnades of pillars (cover),
                    // broken pews, a fallen pillar, candle stands and braziers. Art: drawSanctumDecorProp.
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#1a1418', decorType }, extra));
                    const COLS = [420, 560, 700, 840, 980, 1120];
                    e.props = [
                        F(530, 140, 140, 56, 'sc_altar'), F(400, 58, 100, 40, 'sc_organ'), F(700, 58, 100, 40, 'sc_organ'),
                        ...COLS.flatMap(y => [F(228, y - 22, 44, 44, 'sc_pillar'), F(928, y - 22, 44, 44, 'sc_pillar')]),
                        F(990, 758, 120, 30, 'sc_fallen'),
                        F(330, 640, 92, 24, 'sc_pew'), F(778, 640, 92, 24, 'sc_pew'), F(340, 900, 84, 24, 'sc_pew_broken'), F(776, 900, 84, 24, 'sc_pew'),
                        F(96, 520, 84, 24, 'sc_pew_broken'), F(1020, 1020, 84, 24, 'sc_pew'),
                        F(470, 240, 18, 18, 'sc_candles'), F(712, 240, 18, 18, 'sc_candles'), F(100, 300, 18, 18, 'sc_candles'), F(1082, 300, 18, 18, 'sc_candles'),
                        F(180, 1200, 36, 36, 'sc_brazier'), F(984, 1200, 36, 36, 'sc_brazier'), F(150, 230, 36, 36, 'sc_brazier'), F(1014, 230, 36, 36, 'sc_brazier'),
                    ];
                    // No red wash any more: a storm-violet ambient; crimson from the rose window and braziers,
                    // warm from the candles (hidden fixtures, light only)
                    const L = (x, y, color, lightRadius) => Object.assign(new LampEntity({ x, y, lampType: 4, color, lightRadius }), { visible: false });
                    e.lamps = [ L(600, 150, '#c060ff', 460), L(198, 1218, '#ff8a40', 320), L(1002, 1218, '#ff8a40', 320), L(600, 720, '#9a70ff', 520) ];
                    const S = (x, y, radius, color, intensity = 0.8, flicker = 0) => ({ x, y, radius, color, intensity, flicker });
                    const A = (x, y, w, h, color, intensity) => ({ x, y, w, h, round: Math.min(w, h) / 4, soft: true, color, intensity });
                    e.softLights = [
                        A(600, 700, 1060, 1280, '#8a78c8', 0.22), A(600, 170, 700, 280, '#ff5a8a', 0.12),
                        S(168, 248, 110, '#ff8a40', 0.8, 5), S(1032, 248, 110, '#ff8a40', 0.8, 5),
                        S(479, 249, 70, '#ffc080', 0.6, 4), S(721, 249, 70, '#ffc080', 0.6, 4), S(109, 309, 60, '#ffc080', 0.5, 4), S(1091, 309, 60, '#ffc080', 0.5, 4),
                    ];
                    break;
                }

                case 'enni_cole_interior':
                    e.props = [
                        new PropEntity({ x: 920, y: 580, width: 160, height: 60, color: '#1a1a1a' }), new PropEntity({ x: 920, y: 700, width: 160, height: 60, color: '#1a1a1a' }),
                        new PropEntity({ x: 860, y: 630, width: 60, height: 80, color: '#2a1520' }), new PropEntity({ x: 1080, y: 630, width: 60, height: 80, color: '#2a1520' }),
                        new PropEntity({ x: 930, y: 860, width: 140, height: 40, color: '#3a1028' }), new PropEntity({ x: 930, y: 460, width: 140, height: 40, color: '#3a1028' }),
                        new PropEntity({ x: 120, y: 350, width: 200, height: 30, color: '#222' }), new PropEntity({ x: 120, y: 520, width: 200, height: 30, color: '#222' }),
                        new PropEntity({ x: 120, y: 690, width: 200, height: 30, color: '#222' }), new PropEntity({ x: 120, y: 860, width: 200, height: 30, color: '#222' }),
                        new PropEntity({ x: 120, y: 1030, width: 200, height: 30, color: '#222' }), new PropEntity({ x: 80, y: 250, width: 10, height: 900, color: '#3a3a42' }),
                        new PropEntity({ x: 380, y: 800, width: 20, height: 180, color: '#1a1a1a' }), new PropEntity({ x: 380, y: 450, width: 20, height: 180, color: '#1a1a1a' }),
                        new PropEntity({ x: 1680, y: 350, width: 120, height: 50, color: '#151518' }), new PropEntity({ x: 1680, y: 500, width: 120, height: 50, color: '#151518' }),
                        new PropEntity({ x: 1680, y: 650, width: 120, height: 50, color: '#151518' }), new PropEntity({ x: 1680, y: 800, width: 120, height: 50, color: '#151518' }),
                        new PropEntity({ x: 1680, y: 950, width: 120, height: 50, color: '#151518' }),
                        new PropEntity({ x: 1550, y: 400, width: 50, height: 50, color: '#2a1520' }), new PropEntity({ x: 1550, y: 600, width: 50, height: 50, color: '#2a1520' }), new PropEntity({ x: 1550, y: 800, width: 50, height: 50, color: '#2a1520' }),
                        new PropEntity({ x: 1900, y: 250, width: 10, height: 900, color: '#3a3a42' }),
                        new PropEntity({ x: 300, y: 100, width: 80, height: 60, color: '#2a1a25' }), new PropEntity({ x: 550, y: 100, width: 80, height: 60, color: '#2a1a25' }),
                        new PropEntity({ x: 800, y: 100, width: 80, height: 60, color: '#2a1a25' }), new PropEntity({ x: 1050, y: 100, width: 80, height: 60, color: '#2a1a25' }),
                        new PropEntity({ x: 1300, y: 100, width: 80, height: 60, color: '#2a1a25' }), new PropEntity({ x: 1550, y: 100, width: 80, height: 60, color: '#2a1a25' }),
                        new PropEntity({ x: 700, y: 200, width: 100, height: 35, color: '#3a1028' }), new PropEntity({ x: 1100, y: 200, width: 100, height: 35, color: '#3a1028' }),
                        new PropEntity({ x: 850, y: 1200, width: 300, height: 50, color: '#1a1a1a' }), new PropEntity({ x: 1300, y: 1280, width: 40, height: 60, mass: 1e7, color: '#00f3ff', interactionType: 'vending_machine' }),
                    ];
                    e.npcs = [ new NPC(1000, 1220, "Valentina", 'vip'), new NPC(200, 500, "Model Kira", 'dancer'), new NPC(1750, 600, "Model Sienne", 'dancer'), new NPC(1000, 650, "Concierge Lux", 'robot_gold') ];
                    e.lamps = [
                        new LampEntity({ x: 1000, y: 500, lampType: 4, color: '#ff69b4', lightRadius: 550 }), new LampEntity({ x: 1000, y: 750, lampType: 4, color: '#ff69b4', lightRadius: 550 }),
                        new LampEntity({ x: 700, y: 400, lampType: 3, color: '#ff8ec4', lightRadius: 300 }), new LampEntity({ x: 1300, y: 400, lampType: 3, color: '#ff8ec4', lightRadius: 300 }),
                        new LampEntity({ x: 700, y: 900, lampType: 3, color: '#ff8ec4', lightRadius: 300 }), new LampEntity({ x: 1300, y: 900, lampType: 3, color: '#ff8ec4', lightRadius: 300 }),
                        new LampEntity({ x: 250, y: 300, lampType: 3, color: '#ff5ca8', lightRadius: 250 }), new LampEntity({ x: 250, y: 550, lampType: 3, color: '#ff5ca8', lightRadius: 250 }),
                        new LampEntity({ x: 250, y: 800, lampType: 3, color: '#ff5ca8', lightRadius: 250 }), new LampEntity({ x: 250, y: 1000, lampType: 3, color: '#ff5ca8', lightRadius: 200 }),
                        new LampEntity({ x: 1750, y: 300, lampType: 3, color: '#ffb4d6', lightRadius: 250 }), new LampEntity({ x: 1750, y: 550, lampType: 3, color: '#ffb4d6', lightRadius: 250 }),
                        new LampEntity({ x: 1750, y: 800, lampType: 3, color: '#ffb4d6', lightRadius: 250 }), new LampEntity({ x: 1750, y: 1000, lampType: 3, color: '#ffb4d6', lightRadius: 200 }),
                        new LampEntity({ x: 350, y: 130, lampType: 3, color: '#ffd0e8', lightRadius: 200 }), new LampEntity({ x: 600, y: 130, lampType: 3, color: '#ffd0e8', lightRadius: 200 }),
                        new LampEntity({ x: 850, y: 130, lampType: 3, color: '#ffd0e8', lightRadius: 200 }), new LampEntity({ x: 1100, y: 130, lampType: 3, color: '#ffd0e8', lightRadius: 200 }),
                        new LampEntity({ x: 1350, y: 130, lampType: 3, color: '#ffd0e8', lightRadius: 200 }), new LampEntity({ x: 1600, y: 130, lampType: 3, color: '#ffd0e8', lightRadius: 200 }),
                        new LampEntity({ x: 850, y: 1250, lampType: 3, color: '#ff69b4', lightRadius: 250 }), new LampEntity({ x: 1150, y: 1250, lampType: 3, color: '#ff69b4', lightRadius: 250 }),
                        new LampEntity({ x: 1000, y: 1100, lampType: 4, color: '#ff8ec4', lightRadius: 400 }),
                    ];
                    break;

                case 'cozy_cafe_interior':
                    e.props = [
                        new PropEntity({ x: 150, y: 100, width: 50, height: 40, color: '#444' }), new PropEntity({ x: 260, y: 100, width: 80, height: 40, color: '#3a2a1a' }),
                        new PropEntity({ x: 350, y: 120, width: 30, height: 25, color: '#2a2a2a' }),
                        new PropEntity({ x: 150, y: 280, width: 25, height: 25, color: '#4e342e' }), new PropEntity({ x: 220, y: 280, width: 25, height: 25, color: '#4e342e' }),
                        new PropEntity({ x: 290, y: 280, width: 25, height: 25, color: '#4e342e' }), new PropEntity({ x: 360, y: 280, width: 25, height: 25, color: '#4e342e' }),
                        new PropEntity({ x: 100, y: 380, width: 70, height: 50, color: '#3e2723' }), new PropEntity({ x: 100, y: 500, width: 70, height: 50, color: '#3e2723' }), new PropEntity({ x: 100, y: 620, width: 70, height: 50, color: '#3e2723' }),
                        new PropEntity({ x: 350, y: 400, width: 80, height: 60, color: '#3e2723' }), new PropEntity({ x: 350, y: 550, width: 80, height: 60, color: '#3e2723' }), new PropEntity({ x: 350, y: 700, width: 80, height: 60, color: '#3e2723' }),
                        new PropEntity({ x: 550, y: 400, width: 80, height: 60, color: '#3e2723' }), new PropEntity({ x: 550, y: 550, width: 80, height: 60, color: '#3e2723' }), new PropEntity({ x: 550, y: 700, width: 80, height: 60, color: '#3e2723' }),
                        new PropEntity({ x: 780, y: 400, width: 120, height: 50, color: '#4a2a18' }), new PropEntity({ x: 780, y: 520, width: 120, height: 50, color: '#4a2a18' }), new PropEntity({ x: 780, y: 640, width: 120, height: 50, color: '#4a2a18' }),
                        new PropEntity({ x: 910, y: 390, width: 15, height: 70, color: '#5d3a1a' }), new PropEntity({ x: 910, y: 510, width: 15, height: 70, color: '#5d3a1a' }), new PropEntity({ x: 910, y: 630, width: 15, height: 70, color: '#5d3a1a' }),
                        new PropEntity({ x: 750, y: 100, width: 150, height: 40, color: '#555' }), new PropEntity({ x: 950, y: 80, width: 80, height: 60, color: '#333' }), new PropEntity({ x: 1070, y: 80, width: 50, height: 70, color: '#4a4a4a' }),
                        new PropEntity({ x: 1000, y: 750, width: 60, height: 40, color: '#2a2a2a' }), new PropEntity({ x: 1080, y: 750, width: 60, height: 40, color: '#2a2a2a' }),
                        new PropEntity({ x: 480, y: 860, width: 25, height: 25, color: '#2d5a27' }), new PropEntity({ x: 710, y: 860, width: 25, height: 25, color: '#2d5a27' }),
                        new PropEntity({ x: 930, y: 880, width: 40, height: 60, mass: 1e7, color: '#00f3ff', interactionType: 'vending_machine' }),
                    ];
                    e.npcs = [ new NPC(200, 150, "Barista Ren", 'bartender'), new NPC(850, 200, "Chef Koda") ];
                    e.lamps = [
                        new LampEntity({ x: 200, y: 180, lampType: 3, color: '#ffaa00', lightRadius: 250 }), new LampEntity({ x: 350, y: 180, lampType: 3, color: '#ffaa00', lightRadius: 250 }),
                        new LampEntity({ x: 200, y: 450, lampType: 4, color: '#ff9933', lightRadius: 280 }), new LampEntity({ x: 200, y: 620, lampType: 4, color: '#ff9933', lightRadius: 280 }),
                        new LampEntity({ x: 450, y: 470, lampType: 4, color: '#ffaa00', lightRadius: 300 }), new LampEntity({ x: 450, y: 650, lampType: 4, color: '#ffaa00', lightRadius: 300 }),
                        new LampEntity({ x: 650, y: 470, lampType: 4, color: '#ffaa00', lightRadius: 300 }), new LampEntity({ x: 650, y: 650, lampType: 4, color: '#ffaa00', lightRadius: 300 }),
                        new LampEntity({ x: 850, y: 450, lampType: 3, color: '#ff8800', lightRadius: 200 }), new LampEntity({ x: 850, y: 580, lampType: 3, color: '#ff8800', lightRadius: 200 }), new LampEntity({ x: 850, y: 700, lampType: 3, color: '#ff8800', lightRadius: 200 }),
                        new LampEntity({ x: 850, y: 150, lampType: 3, color: '#ffd080', lightRadius: 300 }), new LampEntity({ x: 1050, y: 150, lampType: 3, color: '#ffd080', lightRadius: 250 }),
                        new LampEntity({ x: 500, y: 900, lampType: 3, color: '#ffaa00', lightRadius: 200 }), new LampEntity({ x: 700, y: 900, lampType: 3, color: '#ffaa00', lightRadius: 200 }),
                    ];
                    break;

                case 'auto_shop':
                    e.props = [
                        // Service bay — vehicle lifts (2 bays)
                        new PropEntity({ x: 150, y: 150, width: 200, height: 120, color: '#3a3a3a' }),
                        new PropEntity({ x: 150, y: 380, width: 200, height: 120, color: '#3a3a3a' }),
                        // Lift hydraulics
                        new PropEntity({ x: 250, y: 170, width: 20, height: 80, color: '#666' }),
                        new PropEntity({ x: 250, y: 400, width: 20, height: 80, color: '#666' }),
                        // Tool racks (left wall)
                        new PropEntity({ x: 60, y: 120, width: 40, height: 160, color: '#4a3020' }),
                        new PropEntity({ x: 60, y: 350, width: 40, height: 160, color: '#4a3020' }),
                        // Workbench (center bay)
                        new PropEntity({ x: 500, y: 200, width: 120, height: 50, color: '#555' }),
                        new PropEntity({ x: 500, y: 400, width: 120, height: 50, color: '#555' }),
                        // Tire stacks
                        new PropEntity({ x: 700, y: 100, width: 60, height: 60, color: '#222' }),
                        new PropEntity({ x: 700, y: 500, width: 60, height: 60, color: '#222' }),
                        // Showroom counter
                        new PropEntity({ x: 950, y: 250, width: 200, height: 40, color: '#2a1a2a', interactionType: 'auto_shop_counter' }),
                        // Parts shelves (backroom)
                        new PropEntity({ x: 920, y: 730, width: 180, height: 40, color: '#333' }),
                        new PropEntity({ x: 920, y: 820, width: 180, height: 40, color: '#333' }),
                        new PropEntity({ x: 1150, y: 730, width: 150, height: 40, color: '#333' }),
                        new PropEntity({ x: 1150, y: 820, width: 150, height: 40, color: '#333' }),
                        // Oil drums
                        new PropEntity({ x: 780, y: 300, width: 30, height: 30, color: '#1a3a1a' }),
                        new PropEntity({ x: 780, y: 350, width: 30, height: 30, color: '#3a1a1a' }),
                        // Vending machine
                        new PropEntity({ x: 1280, y: 600, width: 40, height: 60, mass: 1e7, color: '#00f3ff', interactionType: 'vending_machine' }),
                    ];
                    e.npcs = [ new NPC(1050, 200, "Torque", 'mechanic') ];
                    e.lamps = [
                        // Service bay — industrial amber
                        new LampEntity({ x: 250, y: 200, lampType: 4, color: '#ffaa00', lightRadius: 350 }),
                        new LampEntity({ x: 250, y: 450, lampType: 4, color: '#ffaa00', lightRadius: 350 }),
                        new LampEntity({ x: 550, y: 300, lampType: 4, color: '#ffaa00', lightRadius: 300 }),
                        new LampEntity({ x: 700, y: 300, lampType: 3, color: '#ff8800', lightRadius: 250 }),
                        // Showroom — cooler light
                        new LampEntity({ x: 1050, y: 200, lampType: 3, color: '#ccddff', lightRadius: 300 }),
                        new LampEntity({ x: 1050, y: 450, lampType: 3, color: '#ccddff', lightRadius: 300 }),
                        // Backroom — dim
                        new LampEntity({ x: 1050, y: 800, lampType: 3, color: '#ff6600', lightRadius: 200 }),
                        // Exit area
                        new LampEntity({ x: 700, y: 880, lampType: 3, color: '#ffaa00', lightRadius: 250 }),
                    ];
                    break;

                case 'neural_sys_interior':
                    e.props = [
                        // Sequencing counter (center) — Prisma stands behind this
                        new PropEntity({ x: 400, y: 220, width: 200, height: 30, color: '#1a1a3a', interactionType: 'neural_counter' }),
                        // Display consoles (left)
                        new PropEntity({ x: 120, y: 120, width: 60, height: 80, color: '#0a0a2a' }),
                        new PropEntity({ x: 120, y: 300, width: 60, height: 80, color: '#0a0a2a' }),
                        // Display consoles (right)
                        new PropEntity({ x: 820, y: 120, width: 60, height: 80, color: '#0a0a2a' }),
                        new PropEntity({ x: 820, y: 300, width: 60, height: 80, color: '#0a0a2a' }),
                        // Sequencing pod (left alcove)
                        new PropEntity({ x: 150, y: 620, width: 80, height: 80, color: '#161640' }),
                        // Server racks (right room)
                        new PropEntity({ x: 650, y: 590, width: 40, height: 120, color: '#0c0c30' }),
                        new PropEntity({ x: 730, y: 590, width: 40, height: 120, color: '#0c0c30' }),
                        new PropEntity({ x: 810, y: 590, width: 40, height: 120, color: '#0c0c30' }),
                        new PropEntity({ x: 890, y: 590, width: 40, height: 120, color: '#0c0c30' }),
                    ];
                    e.npcs = [ new NPC(500, 170, "Prisma", 'shopkeeper') ];
                    e.lamps = [
                        // Main showroom — cold blue tech light
                        new LampEntity({ x: 300, y: 200, lampType: 3, color: '#0088ff', lightRadius: 350 }),
                        new LampEntity({ x: 700, y: 200, lampType: 3, color: '#0088ff', lightRadius: 350 }),
                        new LampEntity({ x: 500, y: 400, lampType: 3, color: '#4444ff', lightRadius: 300 }),
                        // Counter accent — magenta glow
                        new LampEntity({ x: 500, y: 230, lampType: 5, color: '#ff00ff', lightRadius: 200 }),
                        // Left alcove — sequencing pod glow
                        new LampEntity({ x: 200, y: 650, lampType: 3, color: '#ff00ff', lightRadius: 200 }),
                        // Right server room — dim blue pulse
                        new LampEntity({ x: 775, y: 650, lampType: 3, color: '#0044aa', lightRadius: 200 }),
                        // Exit area
                        new LampEntity({ x: 500, y: 700, lampType: 3, color: '#0066cc', lightRadius: 250 }),
                    ];
                    break;

                case 'biggs_arena':
                    e.npcs = [ new NPC(450, 780, "Biggs", 'shopkeeper') ];
                    e.lamps = [
                        // ── OVERHEAD FLOODLIGHTS (warm white wash covering entire arena) ──
                        new LampEntity({ x: 225, y: 200, lampType: 4, color: '#ffddaa', lightRadius: 500 }),
                        new LampEntity({ x: 675, y: 200, lampType: 4, color: '#ffddaa', lightRadius: 500 }),
                        new LampEntity({ x: 225, y: 500, lampType: 4, color: '#ffeebb', lightRadius: 500 }),
                        new LampEntity({ x: 675, y: 500, lampType: 4, color: '#ffeebb', lightRadius: 500 }),
                        new LampEntity({ x: 450, y: 350, lampType: 4, color: '#ffeecc', lightRadius: 550 }),
                        new LampEntity({ x: 450, y: 650, lampType: 4, color: '#ffddbb', lightRadius: 450 }),
                        // ── CORNER CARNIVAL ACCENT (alternating violet & amber) ──
                        new LampEntity({ x: 100, y: 100, lampType: 3, color: '#ff8800', lightRadius: 350 }),
                        new LampEntity({ x: 800, y: 100, lampType: 3, color: '#cc44ff', lightRadius: 350 }),
                        new LampEntity({ x: 100, y: 760, lampType: 3, color: '#cc44ff', lightRadius: 350 }),
                        new LampEntity({ x: 800, y: 760, lampType: 3, color: '#ff8800', lightRadius: 350 }),
                        // ── SIDE WALL LIGHTS (fill edge gaps) ──
                        new LampEntity({ x: 100, y: 420, lampType: 3, color: '#ff9944', lightRadius: 350 }),
                        new LampEntity({ x: 800, y: 420, lampType: 3, color: '#ff9944', lightRadius: 350 }),
                        new LampEntity({ x: 450, y: 100, lampType: 3, color: '#ddaaff', lightRadius: 350 }),
                        // ── ENTRANCE GLOW ──
                        new LampEntity({ x: 450, y: 820, lampType: 3, color: '#ffaa44', lightRadius: 350 }),
                    ];
                    break;

                case 'house_of_death': {
                    // The gauntlet's house: furniture art in drawHouseDecorProp (hod_*) and the
                    // apartment's pieces (apt_*); floor art in drawHouseInterior, glows in drawHouseGlow.
                    // Big pieces are cover, and enemies path round them (navProps on the map).
                    const F = (x, y, w, h, decorType, extra = {}) => new PropEntity(Object.assign({ x, y, width: w, height: h, mass: 1e7, color: '#2a1a22', decorType }, extra));
                    const candelabra = (x, y) => F(x, y, 22, 22, 'hod_candelabra');
                    const pews = (x0) => [170, 240, 310].map(y => F(x0, y, 170, 22, 'hod_pew'));
                    const chairs = [];
                    for (const x of [175, 235, 295, 355]) chairs.push(F(x, 574, 24, 22, 'hod_chair', { face: 'S' }), F(x, 676, 24, 22, 'hod_chair', { face: 'N' }));
                    e.props = [
                        // Library
                        F(30, 22, 220, 24, 'hod_bookcase'), F(300, 22, 220, 24, 'hod_bookcase'), F(22, 250, 24, 150, 'hod_bookcase', { vertical: true }),
                        F(200, 190, 140, 60, 'hod_table'), F(150, 300, 40, 40, 'apt_chair'), F(380, 110, 40, 40, 'apt_chair'),
                        F(460, 300, 36, 36, 'hod_console'), candelabra(90, 110), candelabra(470, 80),
                        // Chapel: the organ, the altar, pews either side of the aisle
                        F(820, 20, 160, 40, 'hod_organ'), F(840, 86, 120, 40, 'hod_altar'),
                        ...pews(640), ...pews(990), candelabra(800, 96), candelabra(978, 96),
                        // Master bedroom
                        F(1350, 30, 100, 120, 'apt_bed'), F(1318, 34, 26, 26, 'apt_nightstand'), F(1456, 34, 26, 26, 'apt_nightstand'),
                        F(1516, 60, 36, 110, 'apt_wardrobe'), F(1260, 330, 30, 60, 'hod_portrait', { vertical: true, noNav: true }), F(1480, 330, 44, 64, 'apt_vanity'),
                        // Bath
                        F(1640, 30, 128, 64, 'apt_tub'), F(1610, 380, 150, 34, 'apt_bath_vanity'), F(1690, 250, 90, 100, 'apt_shower'),
                        // Dining: a long table, high-backed chairs
                        F(150, 600, 260, 70, 'hod_table', { candles: true }), ...chairs,
                        F(118, 623, 22, 24, 'hod_chair', { face: 'E' }), F(420, 623, 22, 24, 'hod_chair', { face: 'W' }),
                        F(360, 452, 160, 28, 'apt_console'), candelabra(40, 460), candelabra(40, 960), candelabra(500, 960),
                        F(80, 452, 60, 8, 'hod_portrait', { noNav: true }),
                        // Grand hall: four columns, the piano, a sofa facing the chandelier
                        F(690, 560, 30, 30, 'hod_column'), F(1080, 560, 30, 30, 'hod_column'), F(690, 860, 30, 30, 'hod_column'), F(1080, 860, 30, 30, 'hod_column'),
                        F(1060, 470, 120, 80, 'hod_piano'), F(840, 800, 120, 60, 'apt_sofa'), F(870, 740, 60, 28, 'apt_coffee'),
                        F(600, 930, 40, 40, 'hod_console'), F(592, 470, 30, 30, 'apt_plant'),
                        // Rain courtyard: a fountain, four angels, planters
                        F(1450, 660, 120, 120, 'hod_fountain'),
                        F(1300, 500, 34, 34, 'hod_statue'), F(1720, 500, 34, 34, 'hod_statue'), F(1300, 930, 34, 34, 'hod_statue'), F(1720, 930, 34, 34, 'hod_statue'),
                        F(1580, 460, 60, 22, 'apt_planter'), F(1260, 700, 22, 60, 'apt_planter'),
                        // Kitchen: steel and quartz along the south wall, an island
                        F(30, 1430, 44, 50, 'apt_fridge'), F(74, 1444, 110, 36, 'apt_sink'), F(184, 1444, 84, 36, 'apt_gas_range'),
                        F(268, 1444, 64, 36, 'apt_induction'), F(332, 1444, 150, 36, 'apt_counter'),
                        F(150, 1230, 260, 34, 'apt_island'), ...[190, 250, 310, 370].map(x => F(x, 1200, 18, 18, 'apt_stool')),
                        // Foyer: a holo reception, two busts, a bench
                        F(640, 1100, 60, 40, 'hod_console'), F(720, 1380, 30, 30, 'hod_bust'), F(1050, 1380, 30, 30, 'hod_bust'),
                        F(1030, 1180, 120, 22, 'hod_pew'), F(590, 1030, 30, 30, 'apt_plant'), F(1180, 1030, 30, 30, 'apt_plant'),
                        // Gallery: portraits down the L, busts at the turns
                        ...[1270, 1340, 1600, 1690].map(x => F(x, 1016, 60, 8, 'hod_portrait', { noNav: true })),
                        F(1776, 1180, 8, 60, 'hod_portrait', { vertical: true, noNav: true }), F(1776, 1390, 8, 60, 'hod_portrait', { vertical: true, noNav: true }),
                        F(1660, 1120, 28, 28, 'hod_bust'), F(1740, 1450, 28, 28, 'hod_bust'),
                        // Reliquary: a display coffin among four glass cases
                        F(1380, 1290, 110, 50, 'hod_coffin'),
                        F(1300, 1196, 36, 36, 'hod_reliquary'), F(1540, 1196, 36, 36, 'hod_reliquary'), F(1300, 1440, 36, 36, 'hod_reliquary'), F(1540, 1440, 36, 36, 'hod_reliquary'),
                    ];
                    e.npcs = [];
                    const L = (x, y, color, lightRadius, lampType = 4, extra = {}) => Object.assign(new LampEntity({ x, y, lampType, color, lightRadius, ...extra }), extra);
                    const candle = (x, y, r = 280) => L(x, y, '#ffb46a', r, 4, { candle: true });
                    e.lamps = [
                        // Candelabras (they breathe)
                        candle(101, 121), candle(481, 91), candle(811, 107), candle(989, 107),
                        candle(51, 471), candle(51, 971), candle(511, 971), candle(280, 635, 330),
                        // Library, chapel
                        L(280, 20, '#ffc890', 360, 5, { angle: Math.PI / 2 }), L(900, 150, '#b98cff', 420), L(700, 20, '#9a6bff', 300, 5, { angle: Math.PI / 2 }), L(1100, 20, '#9a6bff', 300, 5, { angle: Math.PI / 2 }),
                        // Bedroom, bath
                        L(1400, 250, '#ff8fb8', 380), L(1680, 200, '#f0e8f4', 320),
                        // Grand hall: the chandelier, and violet holo strips on the walls
                        L(900, 720, '#ffcf8a', 620), L(580, 820, '#8a5cff', 300, 5, { angle: 0 }), L(1220, 900, '#8a5cff', 280, 5, { angle: Math.PI }),
                        // Courtyard: cool lanterns by the angels
                        L(1340, 540, '#a8c0ff', 260), L(1690, 540, '#a8c0ff', 260), L(1340, 900, '#a8c0ff', 260), L(1690, 900, '#a8c0ff', 260),
                        // Kitchen: cold white strips
                        L(280, 1420, '#e8f0ff', 380, 5, { angle: -Math.PI / 2 }), L(280, 1100, '#e8f0ff', 360),
                        // Foyer
                        L(900, 1200, '#ffd29a', 460), L(900, 1480, '#ff9a6a', 260, 5, { angle: -Math.PI / 2 }), L(670, 1120, '#7fe0ff', 200),
                        // Gallery: picture lights; the reliquary burns crimson
                        L(1400, 1020, '#ffd9a0', 300, 5, { angle: Math.PI / 2 }), L(1710, 1300, '#ffd9a0', 300, 5, { angle: Math.PI }),
                        L(1435, 1315, '#ff3355', 340), candle(1318, 1214, 180), candle(1558, 1458, 180),
                    ];
                    const S = (x, y, radius, color, intensity = 0.8, flicker = 0) => ({ x, y, radius, color, intensity, flicker });
                    e.softLights = [
                        S(101, 121, 70, '#ffb46a', 0.8, 10), S(481, 91, 70, '#ffb46a', 0.8, 10), S(811, 107, 70, '#ffb46a', 0.8, 10), S(989, 107, 70, '#ffb46a', 0.8, 10),
                        S(51, 471, 70, '#ffb46a', 0.8, 10), S(51, 971, 70, '#ffb46a', 0.8, 10), S(511, 971, 70, '#ffb46a', 0.8, 10),
                        S(215, 635, 60, '#ffc080', 0.7, 12), S(345, 635, 60, '#ffc080', 0.7, 12),                 // table candles
                        S(900, 106, 110, '#b070ff', 0.8, 4),                                                        // the altar's crystal
                        { x: 900, y: 720, w: 420, h: 360, round: 180, soft: true, color: '#ffcf8a', intensity: 0.55 },   // under the chandelier
                        S(1510, 720, 120, '#9fc8ff', 0.6, 3),                                                       // the fountain
                        S(1435, 1315, 110, '#b070ff', 0.8, 5),                                                      // the coffin's glass
                        S(670, 1120, 70, '#7fe0ff', 0.6), S(478, 318, 60, '#7fe0ff', 0.6), S(620, 950, 60, '#7fe0ff', 0.6),   // holo consoles
                        S(1318, 1214, 50, '#ff8a6a', 0.7, 10), S(1558, 1214, 50, '#b070ff', 0.7), S(1318, 1458, 50, '#b070ff', 0.7), S(1558, 1458, 50, '#ff8a6a', 0.7, 10),   // relic cases
                    ];
                    break;
                }

                case 'ollo_interior':
                    e.props = [];
                    e.npcs = [];
                    e.lamps = [
                        new LampEntity({ x: 200, y: 150, lampType: 4, color: '#ffac47', lightRadius: 300 }),
                        new LampEntity({ x: 600, y: 150, lampType: 4, color: '#ffac47', lightRadius: 300 }),
                        new LampEntity({ x: 400, y: 300, lampType: 4, color: '#ff6633', lightRadius: 350 }),
                        new LampEntity({ x: 100, y: 500, lampType: 3, color: '#cc2200', lightRadius: 200 }),
                        new LampEntity({ x: 700, y: 500, lampType: 3, color: '#cc2200', lightRadius: 200 }),
                    ];
                    break;
                    
                case 'ollo_test': {
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
                        if (md && md.transitions) md.transitions.push(olloTransition);
                    }
                    break;
                }
            }
            return e;
        }

        
