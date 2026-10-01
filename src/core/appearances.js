        /* =====================================================================
           APPEARANCES — how every character looks, in one place
           ---------------------------------------------------------------------
           To restyle someone, edit their entry below; the world, their dialogue
           portrait, the phone, and the seat beside you in the car all read it.

             APPEARANCES   named characters: 949, the crew, staff, the city's cast
             ROLE_LOOKS    crowds made from a seed: medics, dancers, androids,
                           pedestrians, gangers, spirits, ghosts, everyone else
             PALETTE       colours that several looks share (house gold, ganger pink…)
             ANDROID_FINISHES  Double Nights plating: moon silver, sun-on-moon gold,
                           Blood Moon rose

           A look is the humanoid config (see ui/wardrobe.js), with a few extras:
             eyeColor   iris colour in portraits
             accent     the character's signature colour (car paint, the crew dot)
             blood      a BLOOD_KINDS name or '#hex' (engine/combat-fx.js)
             faceRoom   staff: face the room when idle
           lookFor(entity) finds anyone's look; portraitOf(look) makes their bust.
           ===================================================================== */
        const PALETTE = {
            houseGold: '#e8c27a',
            gangerPink: '#ff0055', gangerMaroon: '#550022',
            stellaSkin: '#c68e63', stellaCurls: '#0a0505', stellaEyes: '#daa520',
            dnGold:   { color: '#2a2418', trim: '#e8c27a' },           // Double Nights uniform, gold staff
            dnSilver: { color: '#1c2030', trim: '#dfe6ff' },           // … and the silver ones
            dnCrimson: { color: '#3a0a14', trim: '#e8c27a' },          // … and the Blood Moon concierges
            ember: '#ff5a1a',                                          // demoness eyes
            eyeDefault: '#3a2a1a',
            // Crowd pools
            skins: ['#3d2b1f', '#6b3a2a', '#8d5524', '#a0522d', '#c68642', '#c68e63', '#dcc6ac', '#e8d0b8', '#f5deb3'],
            hairs: ['#0a0505', '#1a1a1a', '#2a1500', '#4a3728', '#8b4513', '#654321', '#c0c0c0'],
            eyes:  ['#3a2a1a', '#2a1a0a', '#5a3a1a', '#4a5a3a', '#3a4a5a', '#6a4a2a', '#2a3a4a'],
            genericSkins: ['#f5d0a9', '#c68e63', '#8d5524', '#6b3a2a', '#d4a574', '#e8c4a0'],
            genericTops: ['#335', '#533', '#353', '#445', '#554', '#345', '#543', '#455'],
            genericBottoms: ['#222', '#333', '#2a2a3a', '#1a1a2a', '#3a2a1a', '#252530'],
            genericHairs: ['#111', '#2a1a0a', '#0a0a0a', '#3a2a1a', '#555', '#1a0a00'],
            ghostSkins: ['#8ec8d8', '#7ab0c8', '#9dd4e0', '#a0d0e8', '#6ea8c0'],
        };

        const ANDROID_FINISHES = {
            silver:    { plate: '#c9ccd8', trim: '#7d8196', sheen: '#f4f6ff', glow: '#bfe6ff', coolant: '170, 220, 255' },
            gold:      { plate: '#d9b45a', trim: '#8c6a24', sheen: '#fff1c2', glow: '#00ffff', coolant: '255, 196, 96' },
            bloodmoon: { plate: '#b3203c', trim: '#5e0c1e', sheen: '#ff9fb2', glow: '#ff7aa8', coolant: '255, 110, 150' },
        };

        const _DN_GUARD = { gender: 'male', build: 'broad', body: { kind: 'android', finish: 'gold', glow: '#00ffff' },
            top: { type: 'dn_uniform', ...PALETTE.dnGold }, bottom: { type: 'pants', color: '#1a1614' },
            shoes: { type: 'boots', color: '#111111' }, pose: 'hands_on_hips', faceRoom: true };

        const APPEARANCES = {
            // ── Stella (949). Her cosmetics replace these; this is who she is without them ──
            '949': { skinColor: PALETTE.stellaSkin, gender: 'female', hair: { type: 'curls', color: PALETTE.stellaCurls },
                     eyeColor: PALETTE.stellaEyes, accent: PALETTE.stellaEyes, blood: 'wine' },

            // ── 747 (Seven), her brother: her mirror in the field, the mask tinged purple, eyes slits of gold ──
            '747': { skinColor: PALETTE.stellaSkin, gender: 'male', build: 'athletic', hair: { type: 'short', color: '#0a0505' },
                     eyeColor: '#ffcc55', accent: '#8a5cff', blood: 'wine',
                     top: { type: 'coat', color: '#0e0a14', inner: '#241834' }, bottom: { type: 'pants', color: '#0c0a10' },
                     shoes: { type: 'boots', color: '#0a0a0a' },
                     jewelry: [{ type: 'field_mask', color: '#0a0710', tint: '#4b2a9a', eyes: '#ffcc55' }] },

            // ── The crew ──
            'Victoria': { skinColor: '#c68642', gender: 'female', eyeColor: '#b0707f', accent: '#ff69b4',
                          top: { type: 'suit', color: '#2a0a3a' }, bottom: { type: 'pants', color: '#1a0820' },
                          shoes: { type: 'boots', color: '#c0c0c0' }, hair: { type: 'afro', color: '#ff69b4' } },
            'Yenna':    { skinColor: '#8B4513', gender: 'female', eyeColor: '#4f6b3a', accent: '#5a8a5a',
                          top: { type: 'tshirt', color: '#2a3a2a' }, bottom: { type: 'pants', color: '#1a1a1a' },
                          shoes: { type: 'boots', color: '#333' }, hair: { type: 'dreadlocks', color: '#1a0a00' } },
            'Sabrina':  { skinColor: '#e8d0c0', gender: 'female', eyeColor: '#8a4fd6', accent: '#a855f7',
                          top: { type: 'sports_bra', color: '#1a0a2a' }, bottom: { type: 'skirt', color: '#0a0a1a' },
                          shoes: { type: 'heels', color: '#2a1a3a' }, hair: { type: 'ponytail', color: '#0a0008' } },
            'Max':      { skinColor: '#c9a87c', gender: 'male', eyeColor: '#3aa0ff', accent: '#3b82f6',
                          top: { type: 'tshirt', color: '#1a2a4a' }, bottom: { type: 'pants', color: '#222' },
                          shoes: { type: 'sneakers', color: '#333' }, hair: { type: 'short', color: '#0088ff' } },
            'Josh':     { skinColor: '#e8d5c4', gender: 'male', eyeColor: '#6b7a8a', accent: '#94a3b8',
                          top: { type: 'tshirt', color: '#333' }, bottom: { type: 'pants', color: '#2a2a2a' },
                          shoes: { type: 'shoes', color: '#1a1a1a' }, hair: { type: 'short', color: '#3a2a1a' } },

            // ── Double Nights: AI staff in moon silver, sun-on-moon gold, or Blood Moon rose ──
            'Guard Unit Alpha': _DN_GUARD,
            'Guard Unit Beta':  _DN_GUARD,
            'Concierge Lux':    { gender: 'androgynous', build: 'slim', body: { kind: 'android', finish: 'gold' },
                                  top: { type: 'dn_uniform', ...PALETTE.dnGold }, bottom: { type: 'pants', color: '#1a1a1a' },
                                  shoes: { type: 'loafers', color: '#111111' }, pose: 'concierge', faceRoom: true },
            'LUVSH4D3':         { gender: 'female', build: 'curvy', body: { kind: 'android', finish: 'bloodmoon', hover: true },
                                  hair: { type: 'long', color: '#ff88cc' }, accent: '#ff44bb', faceRoom: true },
            'Bartender':        { skinColor: '#c9a87c', gender: 'male', hair: { type: 'short', color: '#1a1a1a' }, eyeColor: '#3a2a1a',
                                  top: { type: 'vest', color: '#1a0020', inner: '#f2f2f2', trim: '#8b0000' }, bottom: { type: 'pants', color: '#111111' },
                                  shoes: { type: 'loafers', color: '#111111' }, pose: 'polish', faceRoom: true },
            'Barista Ren':      { skinColor: '#a0724a', gender: 'female', hair: { type: 'ponytail', color: '#2a1500' }, eyeColor: '#5a3a1a',
                                  top: { type: 'tshirt', color: '#654321' }, bottom: { type: 'apron', color: '#3a2a1a', under: '#222222' },
                                  shoes: { type: 'sneakers', color: '#eeeeee' }, pose: 'polish', faceRoom: true },

            // The Empereal Lord's scientist and medic; she keeps Stella and 747 running
            'Dr. Yin': { skinColor: '#e8d0b8', gender: 'female', build: 'slim', hair: { type: 'short', color: '#222222' }, eyeColor: '#7a7394',
                         top: { type: 'lab_coat', inner: '#1a3a4a' }, bottom: { type: 'pants', color: '#1a3a4a' },
                         shoes: { type: 'loafers', color: '#222222' }, pose: 'arms_crossed', faceRoom: true },

            // ── The city's cast ──
            // The VIP: periwinkle silk and gold, a glass of Bellafore red
            'Anavia':     { skinColor: '#c68e63', gender: 'female', eyeColor: '#b07a3a', accent: '#66ccaa',
                            top: { type: 'sports_bra', color: '#CCCCFF' }, bottom: { type: 'skirt', color: '#CCCCFF' },
                            train: { type: 'silk_flow', color: '#CCCCFF' }, shoes: { type: 'heels', color: '#FFD700' },
                            hair: { type: 'curls', color: '#0a0505' }, held: { type: 'glass', drink: 'red_wine', hand: 'right' } },
            // The red dress, and her own brand in hand — Ms. Jean Cream Soda
            'Ms. Jean':   { skinColor: '#8d5524', gender: 'female', eyeColor: '#7a4a20', accent: '#ffd700',
                            top: { type: 'sports_bra', color: '#aa0000' }, bottom: { type: 'skirt', color: '#aa0000' },
                            train: { type: 'dress_train', color: '#880000' }, shoes: { type: 'heels', color: '#440000' },
                            hair: { type: 'long', color: '#111' }, held: { type: 'glass', drink: 'cream_soda', hand: 'right' } },
            'Mirabel':    { skinColor: '#dcc6ac', gender: 'female', eyeColor: '#8a1a2a', accent: '#c4566e',
                            top: { type: 'suit', color: '#4a0a10' }, bottom: { type: 'skirt', color: '#4a0a10' },
                            shoes: { type: 'heels', color: '#2a0508' }, hair: { type: 'long', color: '#1a0505' },
                            hat: { type: 'wide_brim', color: '#590e18', crownColor: '#70121e', stroke: '#1a0505' } },
            // Crystalline — a shimmer plays over her (NPC.draw)
            'Prisma':     { skinColor: '#c8b8d0', gender: 'female', eyeColor: '#bfe8ff', accent: '#b06aff',
                            hair: { type: 'braids', color: '#e0e8ff' }, top: { type: 'sports_bra', color: '#aaccff' },
                            bottom: { type: 'skirt', color: '#8888cc' }, shoes: { type: 'heels', color: '#ddeeff' } },
            // Auto Shop mechanic
            'Torque':     { skinColor: '#6b3a2a', gender: 'male', eyeColor: '#3a2414', accent: '#e8972a',
                            hair: { type: 'short', color: '#1a1a1a' }, top: { type: 'tshirt', color: '#ff6600' },
                            bottom: { type: 'pants', color: '#2a2a2a' }, shoes: { type: 'shoes', color: '#333' } },
            'Biggs':      { skinColor: '#c9a87c', gender: 'male', eyeColor: '#ff9a30', accent: '#ff8800',
                            hair: { type: 'afro', color: '#ff8800' }, top: { type: 'suit', color: '#2a0a30' },
                            bottom: { type: 'pants', color: '#1a0820' }, shoes: { type: 'boots', color: '#ff8800' } },
            // Greying, in a crimson-black coat
            'Grum North': { skinColor: '#8a7565', gender: 'male', eyeColor: '#8a8a7a', accent: '#aa5533',
                            hair: { type: 'short', color: '#7a7a7a' }, top: { type: 'suit', color: '#2a1a1a' },
                            bottom: { type: 'pants', color: '#1a1a1a' }, shoes: { type: 'boots', color: '#3a2020' } },
            // Voices on the line (no body in the world yet)
            'Contractor': { skinColor: '#c9a87c', gender: 'male', eyeColor: '#2a2a2a', accent: '#cc4444',
                            hair: { type: 'short', color: '#111' }, top: { type: 'suit', color: '#222' } },
            // The prologue's fireside: the Keeper of the Elements (an old seer, red robe) and her visitor
            'Keeper':     { skinColor: '#c9a488', gender: 'female', eyeColor: '#b88a3a', accent: '#d4485a', build: 'slim', age: 0.85,
                            hair: { type: 'ponytail', color: '#b9b2c4' }, top: { type: 'lab_coat', color: '#8a1224' },
                            bottom: { type: 'skirt', color: '#5a0a18' }, shoes: { type: 'heels', color: '#2a0a10' },
                            jewelry: [{ type: 'necklace', color: '#e8c27a' }] },
            'Traveler':   { skinColor: '#b98a66', gender: 'male', eyeColor: '#e0b45a', accent: '#c9b48a',   // the glint
                            hair: { type: 'short', color: '#2a1d14' }, top: { type: 'coat', color: '#3b2f27' },
                            bottom: { type: 'pants', color: '#231c17' }, shoes: { type: 'boots', color: '#1c1410' } },
            // "dripped with professionalism in a white suit"
            'Larissa':    { skinColor: '#c8a882', gender: 'female', eyeColor: '#4a5a6a', accent: '#8888cc',
                            hair: { type: 'ponytail', color: '#2b2118' }, top: { type: 'suit', color: '#ece8e0' } },
        };

        /* Crowds: (entity or archetype, rand) → look. `rand` comes from seededRandom, so the
           same person always looks the same. */
        const ROLE_LOOKS = {
            medic(npc, r) {
                const skinColor = pickFrom(r, PALETTE.skins);
                const gender = r() < 0.5 ? 'female' : 'male';
                return { skinColor, gender, build: pickFrom(r, [undefined, 'slim', 'athletic', 'curvy', 'heavy']),
                         hair: { type: pickFrom(r, ['short', 'ponytail', 'braids', 'curls', 'afro']), color: pickFrom(r, PALETTE.hairs) },
                         top: { type: 'scrubs', color: pickFrom(r, ['#3aa6a0', '#4a7fb5', '#e8ecef']) },
                         bottom: { type: 'pants', color: '#3a6f80' }, shoes: { type: 'sneakers', color: '#ffffff' }, faceRoom: true };
            },
            // The club's male dancers: bare chest or an open jacket, black trousers, a dance of his own
            male_dancer(npc, r) {
                const skinColor = pickFrom(r, PALETTE.skins);
                const jacket = r() < 0.5;
                return { skinColor, gender: 'male', build: pickFrom(r, ['athletic', 'athletic', 'slim', 'broad']), height: 0.97 + r() * 0.08,
                         hair: { type: pickFrom(r, ['short', 'dreadlocks', 'braids', 'afro', 'curls', 'ponytail']), color: pickFrom(r, ['#0a0505', '#1a1a1a', '#8a0707', '#c0c0c0']) },
                         top: jacket ? { type: 'jacket', color: pickFrom(r, ['#111111', '#2a0a3a', '#590e18']), inner: skinColor } : null,
                         bottom: { type: 'pants', color: '#111111' }, shoes: { type: 'loafers', color: '#111111' },
                         jewelry: r() < 0.5 ? [{ type: 'necklace', color: PALETTE.houseGold }] : null, pose: 'dance' };
            },
            // The club's demonesses (red demon dancers and the models): they bleed ink
            demon_dancer() {
                return { skinColor: '#8a0707', gender: 'female', pose: 'dance', eyeColor: PALETTE.ember, blood: 'ink',
                         hair: { type: 'demon_dancer', color: '#0a0000' },
                         top: { type: 'sports_bra', color: '#111' }, bottom: { type: 'skirt', color: '#111' } };
            },
            // Unnamed Double Nights staff: silver
            robot() {
                return { gender: 'androgynous', body: { kind: 'android', finish: 'silver' }, top: { type: 'dn_uniform', ...PALETTE.dnSilver },
                         bottom: { type: 'pants', color: '#1a1a1a' }, shoes: { type: 'loafers', color: '#111111' }, pose: 'concierge', faceRoom: true };
            },
            // Double Nights floor staff (the lobby's crowd, world/lobby-life.js): plating in the house
            // finishes — gold bellhops, Blood Moon concierges, silver valets — uniforms to match
            dn_staff(finish, r) {
                const uni = finish === 'gold' ? PALETTE.dnGold : finish === 'bloodmoon' ? PALETTE.dnCrimson : PALETTE.dnSilver;
                return { gender: pickFrom(r, ['female', 'male', 'androgynous']), build: pickFrom(r, [undefined, 'slim', 'athletic']),
                         body: { kind: 'android', finish }, top: { type: 'dn_uniform', ...uni },
                         bottom: { type: 'pants', color: '#141216' }, shoes: { type: 'loafers', color: '#0e0e10' }, pose: 'concierge' };
            },
            // Moon City's clubgoers (world/club-life.js): evening wear in the house colours —
            // black lacquer, plum and wine velvet, violet, lavender, rose, champagne gold, chrome
            clubgoer(r) {
                const pick = l => pickFrom(r, l), P = PALETTE;
                const night = ['#0b0810', '#141016', '#1a1022', '#2a0a3a', '#5a0c34', '#8a1a52', '#e8c27a', '#c8a8ff', '#8a5cff', '#d8dcef', '#ff5a8a'];
                const metal = () => pick([P.houseGold || '#e8c27a', '#d8dcef']);
                const gender = pick(['female', 'female', 'male', 'male', 'androgynous']);
                const look = { gender, skinColor: pick(P.skins), build: pick([undefined, 'slim', 'athletic', 'curvy', 'broad']), height: 0.94 + r() * 0.12,
                               hair: { type: pick(gender === 'male' ? ['short', 'afro', 'dreadlocks', 'curls', 'braids'] : ['long', 'ponytail', 'braids', 'curls', 'afro', 'short', 'dreadlocks']),
                                       color: r() < 0.15 ? pick(['#c8a8ff', '#ff5a8a', '#e8dcc8']) : pick(P.hairs) } };
                if (gender === 'male') {
                    look.top = { type: pick(['suit', 'jacket', 'turtleneck', 'tshirt', 'vest']), color: pick(night), inner: pick(['#0b0810', '#e8e8e8', '#5a0c34']) };
                    look.bottom = { type: 'pants', color: pick(['#0b0810', '#141016', '#1a1022']) };
                    look.shoes = { type: pick(['loafers', 'boots']), color: '#0e0c10' };
                    if (r() < 0.35) look.jewelry = [{ type: pick(['necklace', 'sunglasses']), color: pick([metal(), '#141414']) }];
                } else {
                    look.top = { type: pick(['sports_bra', 'crop_top', 'sleeved_crop', 'tank', 'turtleneck', 'suit']), color: pick(night), inner: '#0b0810' };
                    look.bottom = { type: pick(['pencil_skirt', 'skirt', 'leggings', 'long_skirt', 'pants', 'shorts']), color: pick(night) };
                    if (look.bottom.type === 'leggings') look.bottom.finish = 'gloss';
                    look.shoes = { type: r() < 0.8 ? 'heels' : 'boots', color: pick(['#0b0810', '#e8c27a', '#8a1a52', '#d8dcef']) };
                    const j = [];
                    if (r() < 0.5) j.push({ type: 'hoops', color: metal() });
                    if (r() < 0.4) j.push({ type: 'necklace', color: metal() });
                    if (r() < 0.3) j.push({ type: 'bangles', color: metal() });
                    if (j.length) look.jewelry = j;
                }
                return look;
            },
            // Moon City's staff: a bouncer in black and gold, a barback in a vest, the powder-room attendant
            mc_staff(kind, r) {
                const gold = PALETTE.houseGold || '#e8c27a';
                if (kind === 'bouncer') return { gender: 'male', build: 'broad', height: 1.07, skinColor: pickFrom(r, PALETTE.skins), hair: { type: 'short', color: '#0a0a0a' },
                    top: { type: 'suit', color: '#0b0810', inner: '#0b0810', trim: gold }, bottom: { type: 'pants', color: '#0b0810' }, shoes: { type: 'loafers', color: '#0a0a0a' },
                    jewelry: [{ type: 'sunglasses', color: '#141414' }], pose: 'arms_crossed' };
                if (kind === 'barback') return { gender: pickFrom(r, ['male', 'female']), build: 'slim', skinColor: pickFrom(r, PALETTE.skins), hair: { type: pickFrom(r, ['short', 'ponytail']), color: pickFrom(r, PALETTE.hairs) },
                    top: { type: 'vest', color: '#0b0810', inner: '#ece6f0', trim: gold }, bottom: { type: 'pants', color: '#141016' }, shoes: { type: 'loafers', color: '#0a0a0a' } };
                return { gender: 'female', skinColor: pickFrom(r, PALETTE.skins), hair: { type: 'long', color: pickFrom(r, PALETTE.hairs) },
                    top: { type: 'suit', color: '#1a1022', inner: '#5a0c34', trim: gold }, bottom: { type: 'pencil_skirt', color: '#0b0810' }, shoes: { type: 'heels', color: '#0b0810' },
                    jewelry: [{ type: 'necklace', color: gold }], pose: 'concierge' };
            },
            // The Ethereal plane's wanderers
            spirit() {
                return { skinColor: '#9fb8d0', gender: 'female', eyeColor: '#dff2ff', hair: { type: 'long', color: '#4a5a70' },
                         top: { type: 'tshirt', color: '#2a3345' }, bottom: { type: 'long_skirt', color: '#222a38' }, shoes: { type: 'shoes', color: '#1a2230' } };
            },
            /** Anyone else: a stable look hashed from their name. */
            generic(npc) {
                let hash = 0;
                const n = npc.name || 'NPC';
                for (let i = 0; i < n.length; i++) hash = ((hash << 5) - hash) + n.charCodeAt(i);
                const h = Math.abs(hash), P = PALETTE;
                const gender = (h >> 12) % 2 === 0 ? 'male' : 'female';
                return { skinColor: P.genericSkins[h % P.genericSkins.length], gender, eyeColor: P.eyes[(h >> 4) % P.eyes.length],
                         top: { type: 'tshirt', color: P.genericTops[(h >> 3) % P.genericTops.length] },
                         bottom: { type: gender === 'female' ? 'skirt' : 'pants', color: P.genericBottoms[(h >> 6) % P.genericBottoms.length] },
                         shoes: { type: 'shoes', color: '#222' },
                         hair: { type: gender === 'female' ? 'long' : 'short', color: P.genericHairs[(h >> 9) % P.genericHairs.length] } };
            },
            /** Graveyard ghosts: pale and icy. */
            ghost(r) {
                const gender = r() < 0.5 ? 'male' : 'female';
                return { skinColor: pickFrom(r, PALETTE.ghostSkins), gender,
                         hair: { type: pickFrom(r, ['long', 'short', 'afro', 'curls', 'braids', 'dreadlocks', 'ponytail']), color: '#c0e8ff' },
                         top: { type: 'tshirt', color: '#90c0d8' }, bottom: { type: gender === 'female' ? 'long_skirt' : 'pants', color: '#7aaccc' },
                         shoes: { type: 'shoes', color: '#6898b8' } };
            },
            /**
             * A pedestrian built from an archetype (Pedestrian.APPEARANCES): gender, build, height,
             * skin, hair and an outfit in the archetype's signature colour (bodyColor), so the crowd
             * is varied but workers still read as workers, tourists as tourists.
             */
            pedestrian(ap, r) {
                const pick = list => pickFrom(r, list);
                const c = ap.bodyColor;
                const gender = ap.name.endsWith('_male') ? 'male' : ap.name.endsWith('_female') ? 'female' : pick(['female', 'male', 'androgynous']);
                const hairTypes = gender === 'female' ? ['long', 'ponytail', 'braids', 'curls', 'afro', 'short', 'dreadlocks']
                                : gender === 'male' ? ['short', 'short', 'afro', 'dreadlocks', 'curls', 'braids'] : ['short', 'curls', 'ponytail', 'afro'];
                const look = {
                    gender, skinColor: pick(PALETTE.skins),
                    build: pick([undefined, undefined, 'slim', 'athletic', 'curvy', 'broad', 'heavy']),
                    height: 0.93 + r() * 0.14,
                    hair: { type: pick(hairTypes), color: r() < 0.6 ? ap.hairColor : pick(PALETTE.hairs) },
                    shoes: { type: 'sneakers', color: '#e8e8e8' }
                };
                // Rain kit: some carry an umbrella; some hoodie wearers put the hood up
                if (r() < 0.4) look.umbrella = pick(['#1a1a1a', '#5a0f1e', '#9d8cc8', '#c9d6e8', '#d9b45a', '#2b3a55']);
                look.rainHood = r() < 0.35;
                look.hurry = 1.2 + r() * 0.15;
                const skirtOr = alt => gender === 'female' && r() < 0.5 ? { type: pick(['skirt', 'long_skirt']), color: '#1c1c24' } : alt;
                switch (ap.name) {
                    case 'suit_male': case 'suit_female': case 'corporate':
                        look.top = { type: pick(['suit', 'suit', 'jacket']), color: c, inner: '#e8e8e8' };
                        look.bottom = skirtOr({ type: 'pants', color: '#1e1e26' });
                        look.shoes = { type: gender === 'female' && r() < 0.5 ? 'heels' : 'loafers', color: '#111111' };
                        if (r() < 0.2) look.jewelry = [{ type: 'sunglasses', color: '#141414' }];
                        break;
                    case 'casual_male': case 'casual_female':
                        look.top = { type: pick(gender === 'female' ? ['tshirt', 'crop_top', 'tank', 'turtleneck'] : ['tshirt', 'tank', 'hoodie']), color: c, trim: '#f2f2f2' };
                        look.bottom = skirtOr({ type: pick(['pants', 'shorts', 'joggers']), color: pick(['#34495e', '#2b2b2b', '#6b5b45']) });
                        if (gender === 'female' && r() < 0.4) look.jewelry = [{ type: 'hoops', color: PALETTE.houseGold }];
                        break;
                    case 'worker':
                        look.top = { type: 'tshirt', color: c }; look.bottom = { type: 'cargo', color: '#4a4a3a' };
                        look.shoes = { type: 'boots', color: '#3a2a1a' }; look.hat = { type: 'cap', color: ap.hatColor, trim: '#222222' };
                        break;
                    case 'hipster':
                        look.top = { type: 'jacket', color: c, inner: '#d8d2c0' }; look.bottom = { type: pick(['pants', 'joggers']), color: '#2b2b2b' };
                        look.hat = { type: 'beanie', color: ap.hatColor, trim: '#555555' };
                        break;
                    case 'punk':
                        look.top = { type: pick(['tank', 'track_jacket', 'crop_top']), color: c, trim: '#111111' };
                        look.bottom = { type: 'leggings', color: '#111111' }; look.shoes = { type: 'boots', color: '#111111' };
                        look.hair = { type: pick(['short', 'afro', 'braids', 'dreadlocks']), color: ap.hairColor };
                        look.jewelry = [{ type: 'hoops', color: '#c0c0c0' }];
                        break;
                    case 'tourist':
                        look.top = { type: 'tshirt', color: c }; look.bottom = { type: 'shorts', color: '#c2b280' };
                        look.hat = { type: 'cap', color: ap.hatColor, trim: '#48cae4' }; look.jewelry = [{ type: 'sunglasses', color: '#141414' }];
                        break;
                    case 'delivery':
                        look.top = { type: 'hoodie', color: c, trim: '#f2f2f2' }; look.bottom = { type: 'joggers', color: '#1e2a2a' };
                        look.hat = { type: 'cap', color: ap.hatColor, trim: '#ffffff' };
                        break;
                    default:
                        look.top = { type: 'tshirt', color: c }; look.bottom = { type: 'pants', color: '#222222' };
                }
                return look;
            },
            /**
             * THE GANGER LOOK: always a hot pink top over dark maroon — that's the gang,
             * readable at a glance from above. Everything else varies per ganger: the (sleeved) cut,
             * hair (often pink-dyed), skin, build, and the odd pink cap, shades or hoops.
             */
            ganger(r) {
                const pick = list => pickFrom(r, list);
                const pink = PALETTE.gangerPink;
                const gender = r() < 0.5 ? 'female' : 'male';
                // Sleeved cuts only: from above, the pink sleeves are what you see most
                const cut = pick(['suit', 'jacket', 'track_jacket', 'hoodie', 'tshirt', 'turtleneck']);
                const look = {
                    gender, skinColor: pick(PALETTE.skins),
                    build: pick([undefined, 'athletic', 'broad', 'slim', 'heavy', gender === 'female' ? 'curvy' : 'athletic']),
                    height: 0.94 + r() * 0.12,
                    top: { type: cut, color: pink, inner: '#111111', trim: '#111111' },
                    bottom: { type: pick(['pants', 'cargo', 'joggers']), color: PALETTE.gangerMaroon, trim: pink },
                    shoes: { type: pick(['boots', 'sneakers']), color: '#111111' },
                    hair: r() < 0.15 ? null : { type: pick(['short', 'afro', 'braids', 'dreadlocks', 'ponytail', 'curls', gender === 'female' ? 'long' : 'short']),
                                                color: pick(['#0a0a0a', '#1a1a1a', pink, pink, '#3a0a1a']) },
                    hat: r() < 0.25 ? { type: pick(['cap', 'beanie']), color: pink, trim: '#111111' } : null,
                    jewelry: []
                };
                if (r() < 0.25) look.jewelry.push({ type: 'sunglasses', color: '#141414' });
                if (r() < 0.25) look.jewelry.push({ type: pick(['hoops', 'necklace']), color: PALETTE.houseGold });
                return look;
            },
        };

        /** Which crowd a nameless NPC belongs to (null = generic). */
        function _roleLookKind(npc) {
            const role = npc.role || '';
            if (role === 'medic') return 'medic';
            if (role === 'dancer' || role === 'red_demon_dancer') return npc.gender === 'male' ? 'male_dancer' : 'demon_dancer';
            if (role.includes('robot')) return 'robot';
            if (role === 'spirit') return 'spirit';
            return null;
        }

        /**
         * Anyone's look: their APPEARANCES entry, else their crowd's (seeded by name, role and
         * spawn point), else a generic one from their name. Cached on the entity.
         */
        function lookFor(entity) {
            if (!entity) return null;
            if (entity._look !== undefined) return entity._look;
            let look = APPEARANCES[entity.name] || (entity.role === 'ms_jean' ? APPEARANCES['Ms. Jean'] : null);
            if (!look) {
                const kind = _roleLookKind(entity);
                const seed = entity.name + '|' + entity.role + '|' + Math.round(entity.spawnX || entity.x) + ',' + Math.round(entity.spawnY || entity.y);
                look = kind ? ROLE_LOOKS[kind](entity, seededRandom(seed)) : ROLE_LOOKS.generic(entity);
                if (!look.eyeColor && !look.body) look.eyeColor = pickFrom(seededRandom(seed + '|eyes'), PALETTE.eyes);
            }
            if (look.faceRoom && look.pose !== 'dance') look = { idleAngle: Math.PI / 2, ...look };
            return (entity._look = look);
        }

        /* The Freelancers wear their masks in the field; 949's comes off at home (and in the
           Keeper's house). game.fieldMask = true / false forces it (scenes, the flashback); otherwise
           her own choice in Neu.Me (cosmetics.maskMode: 'on' / 'off') wins over that 'auto' rule. */
        const FIELD_MASK_949 = { type: 'field_mask', color: '#0b0710', tint: '#6a2a7a', eyes: PALETTE.stellaEyes };
        const HOME_MAPS = new Set(['apt_949', 'keepers_hill', 'keepers_parlor']);
        function stellaMasked(game) {
            if (!game) return false;
            if (game.fieldMask === true || game.fieldMask === false) return game.fieldMask;
            const mode = game.cosmetics && game.cosmetics.maskMode;
            if (mode === 'on' || mode === 'off') return mode === 'on';
            return !!(game.activeMap && !HOME_MAPS.has(game.activeMap.id));
        }
        /** Her jewelry, with the mask added when she's in the field (a mask of her own wins). */
        function withFieldMask(game, jewelry) {
            const list = jewelry || [];
            if (!stellaMasked(game) || list.some(j => j.type === 'field_mask')) return jewelry;
            return [...list, FIELD_MASK_949];
        }

        /** A dialogue portrait from a look. Androids' eyes glow in their finish. */
        function portraitOf(look, extra) {
            const A = look.body && look.body.kind === 'android' ? (ANDROID_FINISHES[look.body.finish] || ANDROID_FINISHES.silver) : null;
            const cfg = { skinColor: look.skinColor, hair: look.hair || null, gender: look.gender || 'androgynous',
                          eyeColor: look.eyeColor || (A ? (look.body.glow || A.glow) : PALETTE.eyeDefault) };
            for (const k of ['top', 'hat', 'jewelry', 'build', 'body', 'expression', 'age']) if (look[k]) cfg[k] = look[k];
            return extra ? { ...cfg, ...extra } : cfg;
        }

        /** The same cut in other colours — spirits of a look (flit afterimages). */
        function tintLook(look, t) {
            const p = (piece, c) => piece ? { ...piece, color: c, trim: c, inner: c, under: c, crownColor: c, stroke: c } : null;
            return { ...look, skinColor: t.skin, hair: look.hair ? { ...look.hair, color: t.hair } : null,
                     top: p(look.top, t.top), bottom: p(look.bottom, t.bottom), shoes: p(look.shoes, t.shoes),
                     train: p(look.train, t.bottom), hat: p(look.hat, t.hair), jewelry: null, held: null };
        }
