        // ============================================================================
        //  NOTE REGISTRY — Readable documents, letters, briefings, lore.
        //  Each entry defines content + visual style. Found notes are tracked
        //  in game.foundNotes[] and can be re-read from a future journal screen.
        //  Styles: 'letter' (warm parchment), 'briefing' (cold professional),
        //          'ancient' (dark mystical parchment), 'digital' (tech hologram)
        // ============================================================================
        const NOTE_REGISTRY = {
            'dark_maker_letter': {
                id: 'dark_maker_letter',
                title: 'A Letter from the Dark Maker',
                author: 'Dark Maker',
                style: 'letter',
                icon: '🌙',
                headerDetail: 'Double Nights — Crimson Crescent Seal',
                body: `Dear Freelancers,

I know that you will find this. Trust, I make no mistake of your skill. I also know you survived my gift. I'm not surprised. Experts deserve expert challenges.

I've always admired your dedication, resolve, your prowess. I'm sure you can understand why I enjoy making this difficult for you. But I won't bore you. Things will step up here on out.

Now for the most important question. Where the hell am I? Eh?

Well, I left Friday the 19th after a very enjoyable stay. 10 out of 10, would recommend. I'm looking for a change of scenery now, I tire of cities for the moment.

You'll figure out where I am. You always do.`,
                signature: '~ Dark Maker',
            },
            'larissa_briefing_darklands': {
                id: 'larissa_briefing_darklands',
                title: 'Mission Briefing — Darklands',
                author: 'Larissa',
                style: 'briefing',
                icon: '📋',
                headerDetail: 'BLACK GUILD — CLASSIFIED',
                body: `OPERATION: RETURN TO DARKLANDS
CLASSIFICATION: PRIORITY ALPHA
HANDLER: LARISSA

The target known as the Dark Maker has been located via the Pool of Visions. He has fled to the dimension designated DARKLANDS.

You will be accompanied by Commander Luck, Black Guild Elite. Insertion point: the gated township. Local intel suggests a curse is active in the area — the spirits of Jon and Ella Malledost.

Exercise extreme caution. The Empereal Lord is watching.`,
                signature: '— L.',
            },
        };

        // ============================================================================
        //  CONSUMABLES CONFIG — Data-driven vending machine items & buff definitions
        //  Add new items here. The engine reads modifiers automatically.
        //  Modifier stats: 'speed', 'flitDistance', 'flitCooldown', 'detectionRange'
        //  Modifier types: 'multiply' (base * value), 'add' (base + value)
        // ============================================================================
        const CONSUMABLES = {
            bubbleTea: {
                name: 'Bubble Tea',
                cost: 30,
                duration: 120,              // in-game minutes (2 hours)
                modifiers: [
                    { stat: 'speed',        type: 'multiply', value: 1.2 },
                    { stat: 'flitDistance',  type: 'multiply', value: 2.0 }
                ],
                uiLabel: 'NEON RUSH ACTIVE',
                uiColor: '#00f3ff',
                purchaseMsg: 'PURCHASED: BUBBLE TEA — SPEED INCREASED',
                expireMsg: 'NEON RUSH EXPIRED'
            },
            jeanSoda: {
                name: 'Ms. Jean Soda',
                cost: 20,
                duration: 90,               // 1.5 in-game hours
                modifiers: [
                    { stat: 'detectionRange', type: 'multiply', value: 0.6 }
                ],
                uiLabel: null,              // No buff bar text
                uiColor: null,
                purchaseMsg: 'PURCHASED: MS. JEAN — ENEMIES LESS PERCEPTIVE',
                expireMsg: "MS. JEAN'S CHARM FADED"
            },
            stellarLemonade: {
                name: 'Stellar Lemonade',
                cost: 75,
                duration: 480,              // 8 in-game hours (~8 real min)
                modifiers: [
                    { stat: 'speed',        type: 'multiply', value: 1.75 },
                    { stat: 'flitCooldown', type: 'multiply', value: 1/3 }
                ],
                shield: { maxShield: 100 },
                unlockCheck: (game) => game.missions && game.missions.completedBounties >= 5,
                onActivate: (game, buff, config) => {
                    buff.shield = buff.maxShield;
                    buff.savedMaxHp = game.maxPlayerHealth;
                    game.maxPlayerHealth = Math.floor(game.maxPlayerHealth / 2);
                    game.playerHealth = Math.min(game.playerHealth, game.maxPlayerHealth);
                    game.player.syncHealth(game.playerHealth, game.maxPlayerHealth);
                },
                onExpire: (game, buff) => {
                    buff.shield = 0;
                    if (buff.savedMaxHp > 0) {
                        game.maxPlayerHealth = buff.savedMaxHp;
                        buff.savedMaxHp = 0;
                    }
                    game.player.syncHealth(game.playerHealth, game.maxPlayerHealth);
                },
                uiLabel: 'STELLAR RUSH ACTIVE',
                uiColor: '#FFD700',
                purchaseMsg: 'PURCHASED: STELLAR LEMONADE — SPEED BLAZING, SHIELD UP, HP HALVED',
                expireMsg: 'STELLAR RUSH EXPIRED — HP RESTORED'
            }
        };

        // ============================================================================
        //  COSMETICS REGISTRY — Data-driven appearance items (W.I.G.s / S.K.I.N.s / V.O.C.A.L.s)
        //  Each entry maps to drawProceduralHumanoid config fields.
        //  Purchased at Neural Systems, equipped via NEU.ME app.
        // ============================================================================
        /** Drinks for the Crystal Glass. `glass` picks the glass shape (seen from above). */
        const GLASS_DRINKS = {
            champagne:  { name: 'Champagne',     glass: 'flute',   rim: 3.2, liquid: '#f2d57e', bubbles: true },
            rose:       { name: 'Rosé',          glass: 'wine',    rim: 4.2, liquid: '#f19ab0' },
            red_wine:   { name: 'Bellafore',     glass: 'wine',    rim: 4.4, liquid: '#6a0c20' },   // Bella's finest, the classic red
            white_wine: { name: 'White Wine',    glass: 'wine',    rim: 4.4, liquid: '#eadf98' },
            martini:    { name: 'Martini',       glass: 'martini', rim: 5.0, liquid: '#e3efe9', garnish: 'olive' },
            whiskey:    { name: 'Whiskey',       glass: 'tumbler', rim: 4.0, liquid: '#b5641a', ice: true },
            neon:       { name: 'Neon Cocktail', glass: 'coupe',   rim: 4.6, liquid: '#17dcff', liquid2: '#ff2bd6', glow: true, garnish: 'citrus' },
            cream_soda: { name: 'Ms. Jean Cream Soda', glass: 'soda', rim: 3.8, liquid: '#f4b0c4', bubbles: true, foam: true, straw: '#d4447c' },
            stellar_lemonade: { name: 'Stellar Lemonade', glass: 'tumbler', rim: 4.0, liquid: '#f3dc6a', ice: true, garnish: 'citrus' }   // JJ's
        };

        const COSMETICS_REGISTRY = {
            // ─── W.I.G.s (hair type + color) ───
            'wig_afro_black':      { id: 'wig_afro_black',      category: 'wig',   name: 'Midnight Afro',       desc: 'Classic volume. Jet black.',                          price: 0,    data: { type: 'afro',  color: '#1a1a1a' }, default: true },
            'wig_curls_black':     { id: 'wig_curls_black',     category: 'wig',   name: 'Dark Curls',          desc: 'Tight curls, darkest brown.',                         price: 0,    data: { type: 'curls', color: '#0a0505' }, default: true },
            'wig_afro_violet':     { id: 'wig_afro_violet',     category: 'wig',   name: 'Violet Cloud',        desc: 'Statement volume in electric violet.',                price: 200,  data: { type: 'afro',  color: '#8a2be2' } },
            'wig_afro_pink':       { id: 'wig_afro_pink',       category: 'wig',   name: 'Cotton Candy',        desc: 'Soft pink afro. Sweet and loud.',                     price: 200,  data: { type: 'afro',  color: '#ff69b4' } },
            'wig_curls_crimson':   { id: 'wig_curls_crimson',   category: 'wig',   name: 'Crimson Coils',       desc: 'Deep red curls. Danger on sight.',                    price: 250,  data: { type: 'curls', color: '#dc143c' } },
            'wig_curls_gold':      { id: 'wig_curls_gold',      category: 'wig',   name: 'Golden Hour',         desc: 'Warm gold curls catching light.',                     price: 300,  data: { type: 'curls', color: '#daa520' } },
            'wig_long_silver':     { id: 'wig_long_silver',     category: 'wig',   name: 'Silver Stream',       desc: 'Long silver flow. Angelic.',                          price: 350,  data: { type: 'long',  color: '#c0c0c0' } },
            'wig_long_white':      { id: 'wig_long_white',      category: 'wig',   name: 'Moonlight',           desc: 'Luminous white. Ethereal.',                           price: 350,  data: { type: 'long',  color: '#f0f0f0' } },
            'wig_long_teal':       { id: 'wig_long_teal',       category: 'wig',   name: 'Deep Current',        desc: 'Dark teal cascade. Noir meets ocean.',                price: 300,  data: { type: 'long',  color: '#008080' } },
            'wig_demon_black':     { id: 'wig_demon_black',     category: 'wig',   name: 'Phantom Tendrils',    desc: 'Wild flowing tendrils. Otherworldly.',                price: 500,  data: { type: 'demon_dancer', color: '#0a0000' } },
            'wig_demon_violet':    { id: 'wig_demon_violet',    category: 'wig',   name: 'Neon Wraith',         desc: 'Violet tendrils trailing light.',                     price: 500,  data: { type: 'demon_dancer', color: '#9400d3' } },
            'wig_afro_teal':       { id: 'wig_afro_teal',       category: 'wig',   name: 'Cyan Halo',           desc: 'Teal afro. City neon in hair form.',                  price: 250,  data: { type: 'afro',  color: '#00bfbf' } },
            'wig_short_black':     { id: 'wig_short_black',     category: 'wig',   name: 'Close Crop',          desc: 'Clean and tight. No nonsense.',                       price: 150,  data: { type: 'short', color: '#1a1a1a' } },
            'wig_short_silver':    { id: 'wig_short_silver',    category: 'wig',   name: 'Platinum Buzz',       desc: 'Cropped silver. Futuristic edge.',                     price: 250,  data: { type: 'short', color: '#c0c0c0' } },
            'wig_braids_black':    { id: 'wig_braids_black',    category: 'wig',   name: 'Midnight Braids',     desc: 'Twin braids, jet black. Classic power.',              price: 200,  data: { type: 'braids', color: '#0a0a0a' } },
            'wig_braids_violet':   { id: 'wig_braids_violet',   category: 'wig',   name: 'Violet Braids',       desc: 'Braided violet strands. Nightlife royalty.',          price: 300,  data: { type: 'braids', color: '#8a2be2' } },
            'wig_braids_gold':     { id: 'wig_braids_gold',     category: 'wig',   name: 'Golden Braids',       desc: 'Twin golden ropes. Crown energy.',                    price: 300,  data: { type: 'braids', color: '#daa520' } },
            'wig_ponytail_black':  { id: 'wig_ponytail_black',  category: 'wig',   name: 'Sorcerer\'s Tail',    desc: 'Sabrina\'s sleek ponytail. Near-black with a violet cast.', price: 250, data: { type: 'ponytail', color: '#0a0008' } },

            // ─── A.C.C.E.S.S.O.R.I.E.S (held items; optional slot; may have options) ───
            'acc_umbrella':        { id: 'acc_umbrella',        category: 'accessory', name: 'Moonlit Umbrella', desc: 'Lavender canopy, gold tips. Opens itself when it rains.', price: 250, data: { held: 'umbrella', hand: 'right', color: '#9d8cc8', trim: '#e8c27a' } },
            'acc_glass':           { id: 'acc_glass',           category: 'accessory', name: 'Crystal Glass',  desc: 'Something to sip on. Choose your pour.',                price: 0,    data: { held: 'glass', hand: 'right' }, options: { drink: 'champagne' }, default: true },

            // ─── S.K.I.N.s (skin tone / look) ───
            'skin_caramel':        { id: 'skin_caramel',        category: 'skin',  name: 'Radiant Caramel',     desc: 'Warm caramel. 949\'s natural tone.',                  price: 0,    data: { skinColor: '#c68e63' }, default: true },
            'skin_deep':           { id: 'skin_deep',           category: 'skin',  name: 'Deep Mahogany',       desc: 'Rich deep brown. Regal presence.',                    price: 0,    data: { skinColor: '#8d5524' }, default: true },
            'skin_warm_sienna':    { id: 'skin_warm_sienna',    category: 'skin',  name: 'Warm Sienna',         desc: 'Earthy warmth with golden undertones.',               price: 150,  data: { skinColor: '#a0522d' } },
            'skin_bronze':         { id: 'skin_bronze',         category: 'skin',  name: 'Bronze Glow',         desc: 'Sun-kissed metallic warmth.',                         price: 200,  data: { skinColor: '#cd7f32' } },
            'skin_onyx':           { id: 'skin_onyx',           category: 'skin',  name: 'Onyx',                desc: 'Deep black with blue undertones.',                    price: 250,  data: { skinColor: '#3d2b1f' } },
            'skin_porcelain':      { id: 'skin_porcelain',      category: 'skin',  name: 'Porcelain',           desc: 'Pale luminous complexion.',                           price: 200,  data: { skinColor: '#f5deb3' } },
            'skin_synth_silver':   { id: 'skin_synth_silver',   category: 'skin',  name: 'Synth Chrome',        desc: 'Metallic silver. Synthetic shell.',                   price: 500,  data: { skinColor: '#a8a8b0' } },
            'skin_synth_violet':   { id: 'skin_synth_violet',   category: 'skin',  name: 'Synth Violet',        desc: 'Faint violet undertone. Otherworldly.',               price: 500,  data: { skinColor: '#9088a0' } },

            // ─── V.O.C.A.L.s (voice profile / caption color) ───
            'vocal_default':       { id: 'vocal_default',       category: 'vocal', name: 'Natural',             desc: 'Stella\'s unmodified voice signature.',               price: 0,    data: { captionColor: '#ffffff' }, default: true },
            'vocal_silk':          { id: 'vocal_silk',          category: 'vocal', name: 'Silk',                desc: 'Smooth and honeyed. Diplomatic.',                     price: 150,  data: { captionColor: '#ffd700' } },
            'vocal_ghost':         { id: 'vocal_ghost',         category: 'vocal', name: 'Ghost',               desc: 'Whispered and cold. Unnerving.',                      price: 200,  data: { captionColor: '#88ccff' } },
            'vocal_ember':         { id: 'vocal_ember',         category: 'vocal', name: 'Ember',               desc: 'Warm rasp. Cigarettes and confidence.',               price: 200,  data: { captionColor: '#ff8844' } },
            'vocal_chrome':        { id: 'vocal_chrome',        category: 'vocal', name: 'Chrome',              desc: 'Synthetic edge. Machine precision.',                  price: 350,  data: { captionColor: '#c0c0ff' } },
            'vocal_void':          { id: 'vocal_void',          category: 'vocal', name: 'Void',                desc: 'Deep resonance from somewhere else.',                 price: 400,  data: { captionColor: '#cc44ff' } },

            // ─── O.U.T.F.I.T.s (full clothing config) ───
            'outfit_casual':       { id: 'outfit_casual',       category: 'outfit', name: 'Street Casual',       desc: 'Black sports bra, white slacks, white sneakers.',     price: 0,    data: { top: { type: 'sports_bra', color: '#111' }, bottom: { type: 'pants', color: '#e0e0e0' }, shoes: { type: 'sneakers', color: '#fff' }, train: null, held: null }, default: true },
            'outfit_suited':       { id: 'outfit_suited',       category: 'outfit', name: 'Periwinkle Silk',     desc: 'Silk periwinkle top and skirt. Gold heels. Pairs with a Crystal Glass.', price: 0, data: { top: { type: 'sports_bra', color: '#CCCCFF' }, bottom: { type: 'skirt', color: '#CCCCFF' }, shoes: { type: 'heels', color: '#FFD700' }, train: null, held: null }, default: true, pairsWith: 'acc_glass' },
            'outfit_suited_long':  { id: 'outfit_suited_long',  category: 'outfit', name: 'Periwinkle Silk (Long Sleeve)', desc: 'Silk periwinkle top with long sleeves, fitted pencil skirt. Gold heels. Pairs with a Crystal Glass.', price: 150, data: { top: { type: 'sleeved_crop', color: '#CCCCFF' }, bottom: { type: 'pencil_skirt', color: '#CCCCFF' }, shoes: { type: 'heels', color: '#FFD700' }, train: null, held: null }, pairsWith: 'acc_glass' },
            'outfit_stealth':      { id: 'outfit_stealth',      category: 'outfit', name: 'Blackout',            desc: 'All-black tactical. Invisible in the dark.',          price: 300,  data: { top: { type: 'sports_bra', color: '#0a0a0a' }, bottom: { type: 'pants', color: '#111' }, shoes: { type: 'sneakers', color: '#0a0a0a' }, train: null, held: null } },
            'outfit_crimson':      { id: 'outfit_crimson',      category: 'outfit', name: 'Crimson Flame',       desc: 'Deep red dress. Danger on arrival.',                   price: 350,  data: { top: { type: 'sports_bra', color: '#dc143c' }, bottom: { type: 'skirt', color: '#8b0000' }, shoes: { type: 'heels', color: '#dc143c' }, train: null, held: null } },
            'outfit_gold':         { id: 'outfit_gold',         category: 'outfit', name: 'Gold Standard',       desc: 'Full gold tracksuit. Unmissable.',                     price: 400,  data: { top: { type: 'track_jacket', color: '#daa520', trim: '#fff4c9' }, bottom: { type: 'joggers', color: '#b8860b', trim: '#fff4c9' }, shoes: { type: 'sneakers', color: '#ffd700' }, train: null, held: null } },
            'outfit_noir':         { id: 'outfit_noir',         category: 'outfit', name: 'Midnight Noir',       desc: 'Dark violet coat over black. Detective energy.',       price: 350,  data: { top: { type: 'coat', color: '#2a1a3a', inner: '#111111' }, bottom: { type: 'pants', color: '#1a1a1a' }, shoes: { type: 'boots', color: '#222222' }, train: null, held: null } },
            'outfit_neon':         { id: 'outfit_neon',         category: 'outfit', name: 'Neon Circuit',        desc: 'Teal and magenta. Walking billboard.',                 price: 300,  data: { top: { type: 'sports_bra', color: '#00ffcc' }, bottom: { type: 'skirt', color: '#ff00ff' }, shoes: { type: 'heels', color: '#00ffcc' }, train: null, held: null } },
            'outfit_angel':        { id: 'outfit_angel',        category: 'outfit', name: 'Angelic White',       desc: 'Pure white everything. Heavenly.',                     price: 500,  data: { top: { type: 'sports_bra', color: '#f0f0f0' }, bottom: { type: 'skirt', color: '#ffffff' }, shoes: { type: 'heels', color: '#f5f5f5' }, train: null, held: null } },
            'outfit_amber':        { id: 'outfit_amber',        category: 'outfit', name: 'Amber Warmth',        desc: 'Warm amber tones. Like a sunset.',                     price: 250,  data: { top: { type: 'tshirt', color: '#cc7722' }, bottom: { type: 'pants', color: '#8b5a2b' }, shoes: { type: 'shoes', color: '#a0522d' }, train: null, held: null } },
            'outfit_artbuilds':    { id: 'outfit_artbuilds',    category: 'outfit', name: 'Art Builds Freedom',   desc: 'Long black coat over a black hoodie. Cargo pants, white sneakers.', price: 450, data: { top: { type: 'coat', color: '#141414', inner: '#1c1c1c' }, bottom: { type: 'cargo', color: '#232323' }, shoes: { type: 'sneakers', color: '#f4f4f4' }, train: null, held: null } },
            'outfit_anavia':       { id: 'outfit_anavia',       category: 'outfit', name: 'Anavia',              desc: 'Periwinkle crop top and long skirt. Gold heels. Pairs with bangles and a headband.', price: 400, data: { top: { type: 'crop_top', color: '#aab0ff' }, bottom: { type: 'long_skirt', color: '#aab0ff' }, shoes: { type: 'heels', color: '#e8c27a' }, train: null, held: null } },
            'outfit_runner':       { id: 'outfit_runner',       category: 'outfit', name: 'Night Runner',        desc: 'Violet track jacket, leggings, sneakers. Built for the late shift.', price: 300, data: { top: { type: 'track_jacket', color: '#4b2a7a', trim: '#e8c27a' }, bottom: { type: 'leggings', color: '#1a1424' }, shoes: { type: 'sneakers', color: '#f0f0f0' }, train: null, held: null } },
            'outfit_sorcerer':     { id: 'outfit_sorcerer',     category: 'outfit', name: 'Street Sorcerer',     desc: 'Sabrina\'s look. Midnight violet top, black skirt, plum heels.', price: 400, data: { top: { type: 'sports_bra', color: '#1a0a2a' }, bottom: { type: 'skirt', color: '#0a0a1a' }, shoes: { type: 'heels', color: '#2a1a3a' }, train: null, held: null } },
            'outfit_sorcerer_long': { id: 'outfit_sorcerer_long', category: 'outfit', name: 'Street Sorcerer (Long Sleeve)', desc: 'Sabrina\'s look, sleeved. Midnight violet long-sleeve top, fitted black pencil skirt, plum heels.', price: 400, data: { top: { type: 'sleeved_crop', color: '#1a0a2a' }, bottom: { type: 'pencil_skirt', color: '#0a0a1a' }, shoes: { type: 'heels', color: '#2a1a3a' }, train: null, held: null } },
            'outfit_academy':      { id: 'outfit_academy',      category: 'outfit', name: 'Moonlit Academy',     desc: 'A crisp white blouse and a pleated midnight-violet circle skirt with a frilled hem. Black loafers.', price: 350, data: { top: { type: 'tshirt', color: '#f4f0f8' }, bottom: { type: 'pleated_skirt', color: '#3a2a6a', trim: '#f4eee6' }, shoes: { type: 'loafers', color: '#141018' }, train: null, held: null } },

            // ── HATS (one at a time, optional) ──
            'hat_wide_brim':       { id: 'hat_wide_brim',       category: 'hat', name: 'Wine Wide Brim',       desc: 'A wide wine-red brim. Arrives before you do.',         price: 350,  data: { type: 'wide_brim', color: '#590e18', crownColor: '#70121e' } },
            'hat_beret':           { id: 'hat_beret',           category: 'hat', name: 'Painter\'s Beret',     desc: 'Soft black beret. Art school energy.',                 price: 150,  data: { type: 'beret', color: '#1e1e1e' } },
            'hat_cap':             { id: 'hat_cap',             category: 'hat', name: 'Violet Cap',           desc: 'Low brim, eyes forward.',                              price: 150,  data: { type: 'cap', color: '#3a2560', trim: '#e8c27a' } },
            'hat_beanie':          { id: 'hat_beanie',          category: 'hat', name: 'Lavender Beanie',      desc: 'Ribbed knit for cold rooftops.',                       price: 150,  data: { type: 'beanie', color: '#9d8cc8', trim: '#7a68a8' } },
            'hat_hood':            { id: 'hat_hood',            category: 'hat', name: 'Hood Up',              desc: 'Pull the hood up. Long hair still spills out.',       price: 200,  data: { type: 'hood_up', color: '#1c1c1c' } },
            'hat_headband':        { id: 'hat_headband',        category: 'hat', name: 'Periwinkle Headband',  desc: 'A thin band of periwinkle silk.',                      price: 150,  data: { type: 'headband', color: '#8f8cf0' } },
            'hat_tiara':           { id: 'hat_tiara',           category: 'hat', name: 'Silver Queen Tiara',   desc: 'Gold filigree, one violet stone. Royalty of the 949.', price: 500,  data: { type: 'tiara', color: '#e8c27a', trim: '#b89cff' } },

            // ── JEWELRY (wear as many as you like) ──
            'jew_bangles':         { id: 'jew_bangles',         category: 'jewelry', name: 'Gold Bangles',     desc: 'Stacked gold rings on both wrists.',                   price: 200,  data: { type: 'bangles', color: '#e8c27a' } },
            'jew_hoops':           { id: 'jew_hoops',           category: 'jewelry', name: 'Gold Hoops',       desc: 'Classic gold hoop earrings.',                          price: 200,  data: { type: 'hoops', color: '#e8c27a' } },
            'jew_necklace':        { id: 'jew_necklace',        category: 'jewelry', name: 'Silver Pendant',   desc: 'A fine silver chain with a diamond drop.',             price: 250,  data: { type: 'necklace', color: '#d8d8e0' } },
            'jew_sunglasses':      { id: 'jew_sunglasses',      category: 'jewelry', name: 'Night Shades',     desc: 'Dark lenses. Wear them after sundown anyway.',         price: 250,  data: { type: 'sunglasses', color: '#141414' } },
        };

        // ============================================================================
        //  COSMETICS SYSTEM — Manages owned/equipped cosmetics with save/load.
        //  Player starts with default items (price: 0, default: true).
        //  Equipped items feed directly into drawProceduralHumanoid config.
        // ============================================================================
        class CosmeticsSystem {
            constructor() {
                // Owned cosmetic IDs
                this.owned = [];
                // Equipped per-slot (one per category)
                this.equippedWig = null;
                this.equippedSkin = null;
                this.equippedVocal = null;
                this.equippedOutfit = null;
                this.equippedAccessory = null;      // optional slot (null = none)
                this.equippedHat = null;            // optional slot (null = none)
                this.equippedJewelry = [];          // any number at once
                this.accessoryOptions = {};         // per-accessory choices, e.g. { acc_glass: { drink: 'red_wine' } }
                this.maskMode = 'auto';             // 949's field mask (Neu.Me): 'auto' (in the field, off at home) | 'on' | 'off'
                // Grant defaults
                this._grantDefaults();
            }

            _grantDefaults() {
                for (const [id, entry] of Object.entries(COSMETICS_REGISTRY)) {
                    if (entry.default && !this.owned.includes(id)) {
                        this.owned.push(id);
                    }
                }
                // Auto-equip first defaults if nothing equipped
                if (!this.equippedWig) this.equippedWig = 'wig_curls_black';
                if (!this.equippedSkin) this.equippedSkin = 'skin_caramel';
                if (!this.equippedVocal) this.equippedVocal = 'vocal_default';
                if (!this.equippedOutfit) this.equippedOutfit = 'outfit_casual';
            }

            isOwned(id) { return this.owned.includes(id); }

            /** Purchase a cosmetic. Returns true on success. */
            buy(id, game) {
                const entry = COSMETICS_REGISTRY[id];
                if (!entry || this.isOwned(id)) return false;
                if (game.currency < entry.price) return false;
                game.currency -= entry.price;
                this.owned.push(id);
                return true;
            }

            /** Equip a cosmetic by ID (must be owned). */
            equip(id) {
                if (!this.isOwned(id)) return false;
                const entry = COSMETICS_REGISTRY[id];
                if (!entry) return false;
                if (entry.category === 'wig') this.equippedWig = id;
                else if (entry.category === 'skin') this.equippedSkin = id;
                else if (entry.category === 'vocal') this.equippedVocal = id;
                else if (entry.category === 'outfit') {
                    this.equippedOutfit = id;
                    // Signature pairing (Periwinkle Silk → Crystal Glass) when the slot is free
                    if (entry.pairsWith && !this.equippedAccessory && this.isOwned(entry.pairsWith)) this.equippedAccessory = entry.pairsWith;
                }
                else if (entry.category === 'accessory') this.equippedAccessory = id;
                else if (entry.category === 'hat') this.equippedHat = id;
                else if (entry.category === 'jewelry') { if (!this.equippedJewelry.includes(id)) this.equippedJewelry.push(id); }
                return true;
            }

            /** Take off the current hat (hats are optional). */
            unequipHat() { this.equippedHat = null; }

            /** Take off one piece of jewelry. */
            unequipJewelry(id) { this.equippedJewelry = this.equippedJewelry.filter(j => j !== id); }

            /** Is this cosmetic currently worn? (works for every category) */
            isEquipped(id) {
                const entry = COSMETICS_REGISTRY[id];
                if (!entry) return false;
                if (entry.category === 'jewelry') return this.equippedJewelry.includes(id);
                const slot = { wig: 'equippedWig', skin: 'equippedSkin', vocal: 'equippedVocal', outfit: 'equippedOutfit', accessory: 'equippedAccessory', hat: 'equippedHat' }[entry.category];
                return !!slot && this[slot] === id;
            }

            /** Take off the current accessory (accessories are optional). */
            unequipAccessory() { this.equippedAccessory = null; }

            /** Read an accessory option, falling back to the registry default. */
            getAccessoryOption(id, key) {
                const o = this.accessoryOptions[id];
                if (o && o[key] !== undefined) return o[key];
                const entry = COSMETICS_REGISTRY[id];
                return entry && entry.options ? entry.options[key] : undefined;
            }

            /** Set an accessory option (e.g. the glass's drink). */
            setAccessoryOption(id, key, value) {
                (this.accessoryOptions[id] || (this.accessoryOptions[id] = {}))[key] = value;
            }

            /** Get the render config for the currently equipped cosmetics. */
            getRenderConfig() {
                const wig = COSMETICS_REGISTRY[this.equippedWig];
                const skin = COSMETICS_REGISTRY[this.equippedSkin];
                const outfit = COSMETICS_REGISTRY[this.equippedOutfit];
                const acc = this.equippedAccessory ? COSMETICS_REGISTRY[this.equippedAccessory] : null;
                let held = null;
                if (acc && acc.data.held === 'glass') {
                    held = { type: 'glass', hand: acc.data.hand || 'right', drink: this.getAccessoryOption(acc.id, 'drink') || 'champagne' };
                } else if (acc && acc.data.held === 'umbrella') {
                    held = { type: 'umbrella', hand: acc.data.hand || 'right', color: acc.data.color, trim: acc.data.trim };
                }
                const hat = this.equippedHat ? COSMETICS_REGISTRY[this.equippedHat] : null;
                const jewelry = this.equippedJewelry.map(id => COSMETICS_REGISTRY[id]).filter(Boolean).map(e => e.data);
                return {
                    // Without a cosmetic, she's herself (APPEARANCES['949'], core/appearances.js) in Street Casual
                    hair: wig ? { type: wig.data.type, color: wig.data.color } : APPEARANCES['949'].hair,
                    skinColor: skin ? skin.data.skinColor : APPEARANCES['949'].skinColor,
                    outfit: outfit ? outfit.data : COSMETICS_REGISTRY.outfit_casual.data,
                    hat: hat ? hat.data : null,
                    jewelry,
                    held
                };
            }

            /** Get caption color for equipped vocal. */
            getCaptionColor() {
                const vocal = COSMETICS_REGISTRY[this.equippedVocal];
                return vocal ? vocal.data.captionColor : '#ffffff';
            }

            serialize() {
                return {
                    owned: [...this.owned],
                    equippedWig: this.equippedWig,
                    equippedSkin: this.equippedSkin,
                    equippedVocal: this.equippedVocal,
                    equippedOutfit: this.equippedOutfit,
                    equippedAccessory: this.equippedAccessory,
                    equippedHat: this.equippedHat,
                    equippedJewelry: [...this.equippedJewelry],
                    accessoryOptions: JSON.parse(JSON.stringify(this.accessoryOptions)),
                    maskMode: this.maskMode
                };
            }

            deserialize(data) {
                if (!data) return;
                this.owned = data.owned || [];
                this.equippedWig = data.equippedWig || null;
                this.equippedSkin = data.equippedSkin || null;
                this.equippedVocal = data.equippedVocal || null;
                this.equippedOutfit = data.equippedOutfit || null;
                this.accessoryOptions = data.accessoryOptions || {};
                this.maskMode = ['auto', 'on', 'off'].includes(data.maskMode) ? data.maskMode : 'auto';
                // Saves from before hats and jewelry simply have none on
                this.equippedHat = COSMETICS_REGISTRY[data.equippedHat] ? data.equippedHat : null;
                this.equippedJewelry = (data.equippedJewelry || []).filter(id => COSMETICS_REGISTRY[id]);
                if (data.equippedAccessory !== undefined) {
                    this.equippedAccessory = data.equippedAccessory || null;
                } else {
                    // Saves from before accessories: the glass used to come with Periwinkle Silk
                    this.equippedAccessory = data.equippedOutfit === 'outfit_suited' ? 'acc_glass' : null;
                }
                this._grantDefaults();  // Ensure defaults always present
            }
        }

        // ============================================================================
        //  BUFF SYSTEM — Stat modifier stack with data-driven activation/expiry
        //  Reads from CONSUMABLES config. All engine systems query getStat() for
        //  final values. Supports multiplicative & additive modifier chaining.
        // ============================================================================
        class BuffSystem {
            constructor() {
                this.active = {};   // { buffId: { active, endTime, shield?, maxShield?, savedMaxHp? } }
            }

            /**
             * Activate a buff by its CONSUMABLES key.
             * Handles cost check, currency deduction, state init, lifecycle hooks, and UI.
             * @returns {boolean} true if purchased successfully
             */
            activate(buffId, worldMinutes, game) {
                const config = CONSUMABLES[buffId];
                if (!config) return false;

                // Already active? Block re-purchase
                if (this.active[buffId]?.active) {
                    showMessage(`${config.name.toUpperCase()} ALREADY ACTIVE.`);
                    return false;
                }

                // Cost check
                if (game.currency < config.cost) {
                    showMessage(`INSUFFICIENT FUNDS (${config.cost} PERSONICS REQUIRED).`);
                    return false;
                }

                game.currency -= config.cost;

                // Build buff runtime state
                const buff = { active: true, endTime: worldMinutes + config.duration };

                // Init shield state if configured
                if (config.shield) {
                    buff.maxShield = config.shield.maxShield;
                    buff.shield = 0;
                    buff.savedMaxHp = 0;
                }

                this.active[buffId] = buff;

                // Lifecycle hook
                if (config.onActivate) config.onActivate(game, buff, config);

                // HUD label
                if (config.uiLabel) {
                    const el = document.getElementById('ui-buffs');
                    el.style.display = 'block';
                    el.textContent = config.uiLabel;
                    if (config.uiColor) el.style.color = config.uiColor;
                }

                showMessage(config.purchaseMsg);
                return true;
            }

            /**
             * Resolve a stat through the modifier stack.
             * All active buffs that target `statName` are applied in sequence.
             * @param {string} statName - e.g. 'speed', 'detectionRange', 'flitDistance'
             * @param {number} baseValue - The unmodified base value
             * @returns {number} Final modified value
             */
            getStat(statName, baseValue) {
                let additive = 0;
                let multiplicative = 1.0;
                for (const buffId in this.active) {
                    const buff = this.active[buffId];
                    if (!buff.active) continue;
                    const config = CONSUMABLES[buffId];
                    if (!config) continue;
                    for (const mod of config.modifiers) {
                        if (mod.stat !== statName) continue;
                        if (mod.type === 'multiply') multiplicative *= mod.value;
                        else if (mod.type === 'add') additive += mod.value;
                    }
                }
                return (baseValue + additive) * multiplicative;
            }

            /** Check if a specific buff is currently active. */
            isActive(buffId) {
                return !!(this.active[buffId]?.active);
            }

            /** Get the first active buff that has a shield with HP remaining, or null. */
            getShieldBuff() {
                for (const buffId in this.active) {
                    const buff = this.active[buffId];
                    if (buff.active && buff.shield !== undefined && buff.shield > 0) return buff;
                }
                return null;
            }

            /**
             * Tick all active buffs — expire any that have exceeded their duration.
             * Called once per in-game minute from the world clock.
             */
            tick(worldMinutes, game) {
                for (const buffId in this.active) {
                    const buff = this.active[buffId];
                    if (buff.active && worldMinutes >= buff.endTime) {
                        this._expire(buffId, game);
                    }
                }
            }

            /** Internal: expire a single buff, run hooks, update UI. */
            _expire(buffId, game) {
                const buff = this.active[buffId];
                if (!buff || !buff.active) return;
                const config = CONSUMABLES[buffId];

                buff.active = false;
                if (config.onExpire) config.onExpire(game, buff);

                // If no active buff still has a UI label, hide the HUD element
                let anyLabel = false;
                for (const id in this.active) {
                    if (this.active[id].active && CONSUMABLES[id]?.uiLabel) { anyLabel = true; break; }
                }
                if (!anyLabel) {
                    const el = document.getElementById('ui-buffs');
                    el.style.display = 'none';
                    el.style.color = '';
                }

                if (config.expireMsg) showMessage(config.expireMsg);
            }

            /** Force-clear all buffs (e.g. on death). Runs onExpire hooks. */
            clearAll(game) {
                for (const buffId in this.active) {
                    if (this.active[buffId].active) this._expire(buffId, game);
                }
            }

            /** Serialize for save system. */
            serialize() {
                const data = {};
                for (const buffId in this.active) {
                    data[buffId] = { ...this.active[buffId] };
                }
                return data;
            }

            /** Deserialize from save data. Restores runtime state without re-triggering hooks. */
            deserialize(savedBuffs) {
                if (!savedBuffs) return;
                for (const buffId in savedBuffs) {
                    if (!CONSUMABLES[buffId]) continue;
                    const saved = savedBuffs[buffId];
                    const buff = { active: saved.active ?? false, endTime: saved.endTime ?? 0 };
                    // Restore shield state if this buff type has it
                    const config = CONSUMABLES[buffId];
                    if (config.shield) {
                        buff.maxShield = saved.maxShield ?? config.shield.maxShield;
                        buff.shield = saved.shield ?? 0;
                        buff.savedMaxHp = saved.savedMaxHp ?? 0;
                    }
                    this.active[buffId] = buff;
                }
            }
        }

