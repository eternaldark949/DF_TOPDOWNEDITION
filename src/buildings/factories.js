        

        /** The Cozy Cafe: a brick corner house with a shingled hip roof, the hearth's chimney, a roof terrace with
            parasols and string lights, striped awnings and a signboard over the door (buildings/cozy-cafe.js). */
        function createCozyCafe(x, y, config = {}) {
            return new BuildingV2({
                id: 'cozy_cafe', x, y, label: 'Cozy Cafe', type: 'cafe', style: 'cozy_cafe', floors: 3,
                sections: [
                    { x: 0, y: 0, w: 350, h: 350 },
                ],
                roofColor: '#4a3028', roofLightColor: '#5a3a30',
                wallColor: '#6a3426', wallLightColor: '#7d4130', accentColor: '#ffaa00',
                windowColor: '#2a1b14', windowLitColor: '#ffe0a0', windowFrameColor: '#efdcb6',
                balconyColor: '#3e2723', balconies: [],
                sign: { text: 'Cozy Cafe', color: '#ffaa00', size: 28 },
                door: { target: config.doorTarget || 'cozy_cafe_interior', label: 'Enter Cafe', lightColor: null },   // (lit by _ccLights)
                ...config
            });
        }

        // (the Double Nights Hotel's factory is in buildings/double-nights.js, on the tiered kit)

        /**
         * Factory function to create Moon City Nightclub.
         * L-shaped: main dance floor hall + side VIP lounge wing.
         * Dark magenta/neon pink aesthetic.
         */
        function createMoonCityNightclub(x, y, config = {}) {
            return new BuildingV2({
                id: 'moon_city',
                style: 'moon_city',                    // buildings/moon-city.js: lacquer, neon fins, the skylight, the canopy
                x: x,
                y: y,
                label: 'Moon City Nightclub',
                type: 'club',
                floors: 13,                         // one grand club floor, raised so its deco walls show
                
                // L-shape: wide main hall + side VIP lounge
                sections: [
                    { x: 0, y: 0, w: 600, h: 300 },       // Main dance floor hall
                    { x: 0, y: 300, w: 280, h: 200 },      // VIP lounge wing (west)
                ],
                
                // Narrow tinted windows (club aesthetic - sparse)
                windowWidth: 8,
                windowHeight: 18,
                windowSpacingX: 50,
                windowSpacingY: 36,
                windowMarginX: 30,
                windowMarginY: 20,
                
                // Colours: the house brand (the interior's) — black lacquer, violet neon, champagne gold
                roofColor: '#120a18',
                roofLightColor: '#1a1022',
                wallColor: '#140c1a',           // black lacquer, a breath of plum
                wallLightColor: '#1a1022',
                accentColor: '#b48cff',         // violet neon (the street lamps round the block glow it too)
                windowColor: '#0c0612',         // smoked glass
                windowLitColor: '#c8a8ff',
                windowFrameColor: '#0a050a',    // Near-black frames
                balconyColor: '#1a0a1a',        // Dark purple railings
                
                // VIP entrance overhang
                balconies: [
                    { section: 0, side: 'south', startX: 200, width: 200, floors: [1] },
                ],
                
                // Minimal roof props (flat club roof)
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 500, y: 30, w: 60, h: 40 },
                    { type: 'vent', section: 0, x: 40, y: 40, w: 30, h: 25 },
                    { type: 'vent', section: 1, x: 200, y: 30, w: 25, h: 25 },
                ],
                
                // Attachments
                sign: { text: 'Moon City', color: '#c8a8ff', size: 40 },
                door: {
                    target: config.doorTarget || 'moon_city_nightclub',
                    label: 'Enter Club',
                    lightColor: '#ff3a6a'
                },
                
                ...config
            });
        }

        /**
         * Generic V2 building factories for auto-fill clusters.
         * Simple rectangular footprints with themed color palettes.
         * These replace the V1 Building fallback for apartment_small, shop_small, warehouse.
         */
        function createGenericApartment(x, y, config = {}) {
            return new BuildingV2({
                id: 'apartment_small',
                x: x,
                y: y,
                label: config.label || 'Apartments',
                type: 'apartment',
                style: 'apartment',
                floors: 6,
                
                sections: [
                    { x: 0, y: 0, w: 300, h: 250 },
                ],
                
                // Standard residential windows
                windowWidth: 10,
                windowHeight: 14,
                windowSpacingX: 28,
                windowSpacingY: 24,
                windowMarginX: 16,
                windowMarginY: 14,
                
                // Colors - muted dark residential tones
                roofColor: '#242430',           // Blue-grey roof
                roofLightColor: '#2e2e3a',      // Slightly lighter
                wallColor: '#1e1e24',           // Very dark charcoal walls
                wallLightColor: '#28282e',      // Dark blue-grey
                accentColor: '#a469ff',         // Soft purple accent
                windowColor: '#0a0a10',         // Dark glass
                windowLitColor: '#ffe8a0',      // Warm apartment light
                windowFrameColor: '#0e0e14',    // Dark frames
                balconyColor: '#1a1a22',        // Grey railings
                
                balconies: [],
                roofProps: [
                    { type: 'vent', section: 0, x: 240, y: 30, w: 30, h: 25 },
                ],
                
                sign: config.sign || { text: 'APTS', color: '#a469ff', size: 18 },
                
                ...config
            });
        }

        function createGenericShop(x, y, config = {}) {
            return new BuildingV2({
                id: 'shop_small',
                x: x,
                y: y,
                label: config.label || 'Shop',
                type: 'shop',
                floors: 2,
                
                sections: [
                    { x: 0, y: 0, w: 250, h: 200 },
                ],
                
                // Wider storefront windows
                windowWidth: 16,
                windowHeight: 12,
                windowSpacingX: 32,
                windowSpacingY: 20,
                windowMarginX: 20,
                windowMarginY: 12,
                
                // Colors - warm commercial tones
                roofColor: '#32322a',           // Warm olive-grey roof
                roofLightColor: '#3c3c34',      // Slightly lighter
                wallColor: '#26261e',           // Dark warm grey walls
                wallLightColor: '#2e2e26',      // Warm charcoal
                accentColor: '#FFF1C2',         // Warm cream accent
                windowColor: '#0a0a08',         // Dark storefront glass
                windowLitColor: '#FFF1C2',      // Warm display light
                windowFrameColor: '#0e0e0c',    // Dark frames
                balconyColor: '#252520',        // Olive railings
                
                // Small awning over entrance
                balconies: [
                    { section: 0, side: 'south', startX: 60, width: 130, floors: [1] },
                ],
                roofProps: [],
                
                sign: config.sign || { text: 'SHOP', color: '#FFF1C2', size: 16 },
                
                ...config
            });
        }

        function createGenericWarehouse(x, y, config = {}) {
            return new BuildingV2({
                id: 'warehouse',
                x: x,
                y: y,
                label: config.label || 'Warehouse',
                type: 'warehouse',
                floors: 2,
                
                sections: [
                    { x: 0, y: 0, w: 500, h: 400 },
                ],
                
                // Industrial windows (few, wide)
                windowWidth: 20,
                windowHeight: 10,
                windowSpacingX: 70,
                windowSpacingY: 50,
                windowMarginX: 40,
                windowMarginY: 30,
                
                // Colors - cold industrial grey
                roofColor: '#282828',           // Industrial grey roof
                roofLightColor: '#323232',      // Slightly lighter
                wallColor: '#202020',           // Near-black walls
                wallLightColor: '#2a2a2a',      // Dark charcoal
                accentColor: '#666666',         // Dull grey accent (no neon)
                windowColor: '#0a0a0a',         // Dark glass
                windowLitColor: '#ccccaa',      // Industrial yellow-white
                windowFrameColor: '#111111',    // Black frames
                balconyColor: '#1a1a1a',        // Grey railings
                
                balconies: [],
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 30, y: 30, w: 60, h: 45 },
                    { type: 'ac_unit', section: 0, x: 410, y: 30, w: 60, h: 45 },
                    { type: 'vent', section: 0, x: 230, y: 180, w: 40, h: 30 },
                ],
                
                sign: config.sign || null,
                
                ...config
            });
        }

        /**
         * Factory function to create Neural Systems building.
         * T-shaped tech facility: wide server wing + narrow front office.
         * Cold blue/digital theme.
         */
        function createNeuralSystems(x, y, config = {}) {
            return new NeuralSystemsBuilding({
                id: 'neural_sys',
                x: x,
                y: y,
                label: 'Neural Systems',
                type: 'tech',
                floors: 8,
                
                // T-shape: wide server wing at back, narrow front office
                sections: [
                    { x: 0, y: 0, w: 400, h: 200 },       // Back server wing (full width)
                    { x: 75, y: 200, w: 250, h: 200 },     // Front office (centered, narrower)
                ],
                
                // Small uniform tech windows (data center vibe)
                windowWidth: 8,
                windowHeight: 10,
                windowSpacingX: 24,
                windowSpacingY: 20,
                windowMarginX: 16,
                windowMarginY: 12,
                
                // Colors - cold digital blue theme
                roofColor: '#161630',           // Navy blue roof
                roofLightColor: '#1e1e3a',      // Slightly lighter navy
                wallColor: '#141428',           // Near-black blue walls
                wallLightColor: '#1a1a30',      // Dark blue-grey
                accentColor: '#0088ff',         // Tech blue accent
                windowColor: '#040410',         // Very dark blue glass
                windowLitColor: '#0088ff',      // Blue monitor glow
                windowFrameColor: '#060612',    // Dark frames
                balconyColor: '#0a0a18',        // Dark navy railings
                
                balconies: [],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 20, y: 20, w: 55, h: 40 },
                    { type: 'ac_unit', section: 0, x: 320, y: 20, w: 55, h: 40 },
                    { type: 'vent', section: 0, x: 180, y: 80, w: 35, h: 30 },
                    { type: 'vent', section: 1, x: 100, y: 30, w: 30, h: 25 },
                ],
                
                sign: { text: 'NEURAL', color: '#0088ff', size: 22 },
                
                door: {
                    target: config.doorTarget || 'neural_sys_interior',
                    label: 'Enter Neural Systems',
                    lightColor: '#0088ff'
                },
                
                ...config
            });
        }

        /**
         * Factory function to create Dr. Yin's Clinic.
         * L-shaped medical facility: main ward + treatment wing.
         * Dark teal/cyan medical theme.
         */
        /**
         * Factory function to create Torque Auto Shop.
         * Wide, low industrial garage with amber/orange accent.
         */
        function createTorqueAutoShop(x, y, config = {}) {
            return createTorqueAuto(x, y, config);       // on the tiered kit: buildings/torque-auto.js
        }

        function createDrYinsClinic(x, y, config = {}) {
            return new BuildingV2({
                id: 'dr_yins',
                x: x,
                y: y,
                label: "Dr. Yin's",
                type: 'clinic',
                floors: 5,
                
                // L-shape: main ward + treatment wing extending east
                sections: [
                    { x: 0, y: 0, w: 250, h: 400 },       // Main ward (tall, west)
                    { x: 250, y: 150, w: 250, h: 250 },    // Treatment wing (east, offset south)
                ],
                
                // Clean medical windows
                windowWidth: 12,
                windowHeight: 16,
                windowSpacingX: 30,
                windowSpacingY: 26,
                windowMarginX: 18,
                windowMarginY: 14,
                
                // Colors - dark teal/cyan medical theme
                roofColor: '#142828',           // Teal roof
                roofLightColor: '#1a3434',      // Slightly lighter teal
                wallColor: '#142222',           // Very dark teal walls
                wallLightColor: '#182c2c',      // Dark teal
                accentColor: '#00f3ff',         // Medical cyan accent
                windowColor: '#04100f',         // Dark tinted glass
                windowLitColor: '#00f3ff',      // Cyan glow (medical equipment)
                windowFrameColor: '#060e0e',    // Dark teal frames
                balconyColor: '#0a1a1a',        // Teal railings
                
                // Entrance overhang on main ward
                balconies: [
                    { section: 0, side: 'south', startX: 50, width: 150, floors: [1] },
                ],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 20, y: 20, w: 50, h: 35 },
                    { type: 'ac_unit', section: 1, x: 170, y: 20, w: 50, h: 35 },
                    { type: 'vent', section: 0, x: 180, y: 340, w: 30, h: 25 },
                    { type: 'water_tank', section: 1, x: 125, y: 200, r: 25 },
                ],
                
                sign: { text: 'CLINIC', color: '#00f3ff', size: 28 },
                door: {
                    target: config.doorTarget || 'medbay_sw',
                    label: 'Enter Clinic',
                    lightColor: '#00f3ff'
                },
                
                ...config
            });
        }

