        function createSilverQueenApartments(x, y, config = {}) {
            return new BuildingV2({
                id: 'silver_queen',
                x: x,
                y: y,
                label: 'Silver Queen Apts',
                type: 'apartment',
                style: 'silver_queen',
                floors: 18,
                
                // L-shaped building - ENLARGED for imposing presence
                sections: [
                    { x: 0, y: 0, w: 700, h: 500 },      // Main block (north) - large
                    { x: 0, y: 500, w: 350, h: 380 },    // South wing (left)
                ],
                
                // Larger skylights for bigger building
                windowWidth: 14,
                windowHeight: 18,
                windowSpacingX: 32,
                windowSpacingY: 28,
                windowMarginX: 25,
                windowMarginY: 20,
                
                // Colors - from the silver_queen_exp editor design: lavender roof, indigo body, violet neon
                roofColor: '#7664ce',
                roofLightColor: '#9a8ae0',
                wallColor: '#2d1d59',
                wallLightColor: '#3a2870',
                accentColor: '#8142ff',
                windowColor: '#17005c',
                windowLitColor: '#ffc870',
                balconyColor: '#2a2535',
                
                // More balconies spread across the larger facade
                balconies: [
                    // Main block balconies
                    { section: 0, side: 'south', startX: 80, width: 80, floors: [1, 3, 5, 7, 9] },
                    { section: 0, side: 'south', startX: 200, width: 80, floors: [2, 4, 6, 8, 10] },
                    { section: 0, side: 'south', startX: 320, width: 80, floors: [1, 3, 5, 7, 9] },
                    { section: 0, side: 'south', startX: 440, width: 80, floors: [2, 4, 6, 8, 10] },
                    { section: 0, side: 'south', startX: 560, width: 80, floors: [1, 3, 5, 7, 9] },
                    // South wing balconies
                    { section: 1, side: 'south', startX: 50, width: 100, floors: [2, 4, 6, 8] },
                    { section: 1, side: 'south', startX: 180, width: 100, floors: [1, 3, 5, 7] },
                ],
                
                // Attachments
                sign: { text: 'Silver Queen', color: '#8142ff', size: 32 },
                door: {
                    target: config.doorTarget || 'apt_949',
                    label: 'Enter Apartment', 
                    lightColor: '#9900ff' 
                },
                
                ...config
            });
        }
        
        /**
         * Factory function to create Enni Cole luxury shopping center.
         * U-shaped building with large jet-black framed skylights.
         */
        function createEnniCole(x, y, config = {}) {
            return new BuildingV2({
                id: 'enni_cole',
                x: x,
                y: y,
                label: 'Enni Cole',
                type: 'shopping',
                floors: 6,
                
                // U-shaped luxury shopping center
                sections: [
                    { x: 0, y: 0, w: 900, h: 280 },       // Main hall (north)
                    { x: 0, y: 280, w: 250, h: 420 },     // West wing
                    { x: 650, y: 280, w: 250, h: 420 },   // East wing
                ],
                
                // Large skylights with jet black frames
                windowWidth: 22,
                windowHeight: 28,
                windowSpacingX: 45,
                windowSpacingY: 40,
                windowMarginX: 35,
                windowMarginY: 30,
                
                // Colors - upscale pink/rose gold theme
                roofColor: '#c9a0b0',           // Dusty rose roof
                roofLightColor: '#dba4b6',      // Lighter pink highlight
                wallColor: '#1a1a1a',           // Jet black walls
                wallLightColor: '#2a2a2a',      // Dark charcoal
                accentColor: '#ff69b4',         // Hot pink accent
                windowColor: '#0a0a0f',         // Very dark glass (jet black)
                windowLitColor: '#fff0f5',      // Lavender blush when lit
                windowFrameColor: '#050508',    // Jet black frames
                balconyColor: '#1a1a1a',        // Black railings
                
                // Luxurious verandas on each wing
                balconies: [
                    // Main hall entrance canopy indicators
                    { section: 0, side: 'south', startX: 350, width: 200, floors: [1, 2] },
                    // West wing balconies
                    { section: 1, side: 'south', startX: 40, width: 150, floors: [1, 3, 5] },
                    // East wing balconies  
                    { section: 2, side: 'south', startX: 50, width: 150, floors: [2, 4, 6] },
                ],
                
                // Custom roof props for shopping center
                roofProps: [
                    // Large central skylight atrium in main hall
                    { type: 'atrium', section: 0, x: 300, y: 60, w: 300, h: 160 },
                    // AC units on wings
                    { type: 'ac_unit', section: 1, x: 30, y: 30, w: 50, h: 35 },
                    { type: 'ac_unit', section: 2, x: 170, y: 30, w: 50, h: 35 },
                    // Decorative vents
                    { type: 'vent', section: 0, x: 50, y: 100, w: 30, h: 30 },
                    { type: 'vent', section: 0, x: 820, y: 100, w: 30, h: 30 },
                ],
                
                // Attachments
                sign: { text: 'Enni Cole', color: '#ff69b4', size: 36 },
                door: { 
                    target: config.doorTarget || 'enni_cole_interior', 
                    label: 'Enter Store', 
                    lightColor: '#ff69b4' 
                },
                
                ...config
            });
        }

        /**
         * Factory function to create Cozy Cafe.
         * Simple square building with warm, inviting brown and amber aesthetic.
         */
        function createCozyCafe(x, y, config = {}) {
            return new BuildingV2({
                id: 'cozy_cafe',
                x: x,
                y: y,
                label: 'Cozy Cafe',
                type: 'cafe',
                floors: 3,
                
                // Simple square cafe
                sections: [
                    { x: 0, y: 0, w: 350, h: 350 },
                ],
                
                // Cozy small windows
                windowWidth: 10,
                windowHeight: 14,
                windowSpacingX: 26,
                windowSpacingY: 22,
                windowMarginX: 18,
                windowMarginY: 12,
                
                // Colors - warm coffee house tones
                roofColor: '#4a3028',           // Warm espresso roof
                roofLightColor: '#5a3a30',      // Lighter brown highlight
                wallColor: '#382525',           // Deep mahogany walls
                wallLightColor: '#463030',      // Warm brown
                accentColor: '#ffaa00',         // Amber accent (matches lamps)
                windowColor: '#1a1208',         // Warm dark glass
                windowLitColor: '#ffe0a0',      // Warm candlelight glow
                windowFrameColor: '#2a1a0a',    // Dark wood frames
                balconyColor: '#3e2723',        // Espresso railings
                
                // Small awning over entrance
                balconies: [
                    { section: 0, side: 'south', startX: 95, width: 160, floors: [1] },
                ],
                
                // Minimal roof props
                roofProps: [
                    { type: 'vent', section: 0, x: 280, y: 40, w: 35, h: 35 },
                    { type: 'vent', section: 0, x: 40, y: 280, w: 25, h: 25 },
                ],
                
                // Attachments
                sign: { text: 'Cozy Cafe', color: '#ffaa00', size: 28 },
                door: {
                    target: config.doorTarget || 'cozy_cafe_interior',
                    label: 'Enter Cafe',
                    lightColor: '#ffaa00'
                },
                
                ...config
            });
        }

        /**
         * Double Nights Hotel: twin crescent towers round a glass atrium (buildings/double-nights.js).
         * The sections are collision/shadow bands; the building draws its own curves.
         */
        function createDoubleNightsHotel(x, y, config = {}) {
            return new BuildingV2({
                id: 'double_nights',
                x: x,
                y: y,
                label: 'Double Nights Hotel',
                type: 'hotel',
                style: 'double_nights',
                floors: 14,
                sections: doubleNightsSections(),
                roofColor: '#1a0c14', roofLightColor: '#2a1320', wallColor: '#0e070c', wallLightColor: '#2b1422',
                accentColor: '#ffcf8a', windowColor: '#140a14', windowLitColor: '#ffd696', windowFrameColor: '#1a0f0a', balconyColor: '#2a1018',
                roofProps: [{ type: 'none' }],
                sign: { text: 'Double Nights', color: '#ff1a55', size: 32 },
                door: {
                    target: config.doorTarget || 'hotel_lobby',
                    label: 'Enter Hotel',
                    lightColor: '#ffdf80'
                },
                ...config
            });
        }

        /**
         * Factory function to create Moon City Nightclub.
         * L-shaped: main dance floor hall + side VIP lounge wing.
         * Dark magenta/neon pink aesthetic.
         */
        function createMoonCityNightclub(x, y, config = {}) {
            return new BuildingV2({
                id: 'moon_city',
                x: x,
                y: y,
                label: 'Moon City Nightclub',
                type: 'club',
                floors: 4,
                
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
                
                // Colors - deep magenta/neon pink club theme
                roofColor: '#28122a',           // Rich purple roof
                roofLightColor: '#341838',      // Lighter purple
                wallColor: '#221428',           // Very dark magenta walls
                wallLightColor: '#2c1a30',      // Dark plum
                accentColor: '#ff00aa',         // Hot pink neon accent
                windowColor: '#0f0515',         // Dark tinted glass (UV purple)
                windowLitColor: '#ff00aa',      // Hot pink glow (matches neon)
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
                sign: { text: 'CLUB', color: '#ff00aa', size: 40 },
                door: {
                    target: config.doorTarget || 'moon_city_nightclub',
                    label: 'Enter Club',
                    lightColor: '#ff00aa'
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
            return new BuildingV2({
                id: 'neural_sys',
                x: x,
                y: y,
                label: 'Neural Sys',
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
            return new BuildingV2({
                id: 'torque_auto',
                x: x,
                y: y,
                label: 'Torque Auto',
                type: 'auto_shop',
                floors: 2,
                
                // Wide garage footprint
                sections: [
                    { x: 0, y: 0, w: 500, h: 350 },       // Main garage bay
                    { x: 500, y: 50, w: 200, h: 300 },     // Showroom wing (offset)
                ],
                
                // Industrial windows
                windowWidth: 18,
                windowHeight: 12,
                windowSpacingX: 40,
                windowSpacingY: 30,
                windowMarginX: 20,
                windowMarginY: 15,
                
                // Colors — dark industrial with amber accents
                roofColor: '#1a1a14',
                roofLightColor: '#222218',
                wallColor: '#1a1814',
                wallLightColor: '#22201a',
                accentColor: '#ff8800',
                windowColor: '#1a1808',
                windowLitColor: '#ffaa00',
                windowFrameColor: '#111',
                balconyColor: '#2a2520',
                
                // Overhang above garage doors
                balconies: [
                    { section: 0, side: 'south', startX: 50, width: 400, floors: [1] },
                ],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 30, y: 30, w: 60, h: 40 },
                    { type: 'vent', section: 0, x: 350, y: 250, w: 30, h: 25 },
                    { type: 'ac_unit', section: 1, x: 80, y: 100, w: 50, h: 35 },
                ],
                
                sign: { text: 'TORQUE', color: '#ff8800', size: 36 },
                door: {
                    target: config.doorTarget || 'auto_shop',
                    label: 'Enter Auto Shop',
                    lightColor: '#ff8800'
                },
                
                ...config
            });
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

