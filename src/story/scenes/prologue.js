        /* =====================================================================
           PROLOGUE — Story of 949
           ---------------------------------------------------------------------
           The epigraph on black. Then somewhere between the realms, in the year
           6125: the camera climbs a flowering hill above a sea of clouds toward
           a strange country house, while two voices begin. Inside, before the
           fire, the Keeper of the Elements (a mystery to the player yet) and her
           visitor, the Traveller. She looks into the flames, and the flames show
           her the beginning: Vanoga, and the Empereal Lord.

           Timing is in ticks (60 a second). s.say waits for a tap; { auto: true }
           lets a line go by itself after its reading time.
           ===================================================================== */
        const PROLOGUE_EPIGRAPH = [
            'You, 747,',
            'You with so much courage,',
            'You come alone? Who do you think you are?',
            '',
            'You’re an old collection of screws and wire,',
            'Complete with low grade ditanium plating,',
            'Nothing but a façade of a person,',
            '',
            'Where’s your crew? Your parade of bickering kids?',
            'They will suffer 747.',
            'And what will you do?',
            '',
            'Your group of so-called Freelancers… ha…',
            'You’re nothing but a pawn… a pawn in a game, ages old.'
        ];

        defineScene('prologue', {
            startMap: { id: 'keepers_hill', at: { x: 900, y: 2450 } },
            flag: 'prologueSeen',
            releaseFrames: 40
        }, function* (s) {
            const g = s.game;

            // ── The epigraph ───────────────────────────────────────────────
            yield 40;
            const epigraph = s.card(PROLOGUE_EPIGRAPH, { sign: '~ Unknown', every: 52 });
            yield { done: epigraph.leaving };                            // the tap: the hill comes up as the words go
            yield 14;

            // ── The hill: fade up low on it, climb toward the house while they talk ──
            s.map('keepers_hill', { cam: 'hill_low', zoom: 0.9 });
            const climb = s.cam.to('keeper_house', { zoom: 0.7, frames: 1260, ease: 'inOut', dy: 40 });
            yield s.fade('in', 80, 'out');
            s.marker('Somewhere between the realms…', '6125', { hold: 460 });
            yield 100;
            yield s.say('traveler', 'So, tell me what happened. All the way from the beginning.', { offscreen: true, auto: true });
            yield 40;
            yield s.say('keeper', 'It’s a long story.', { offscreen: true, auto: true });
            yield 30;
            yield s.say('traveler', 'I love long stories.', { offscreen: true, auto: true });
            s.clearLine();
            yield climb;
            yield 50;

            // ── Inside, before the fire ────────────────────────────────────
            let keeper, trav;
            yield s.cut('keepers_parlor', {
                cam: { x: 535, y: 215 }, zoom: 1.15, out: 50, in: 60,
                then() {
                    keeper = s.actor('keeper', 'Keeper', 450, 262, -Math.PI / 2).setPose('sit');
                    trav = s.actor('traveler', 'Traveler', 648, 306, Math.atan2(262 - 306, 450 - 648)).setPose('sit');
                    trav.prop = 'notepad';
                }
            });
            s.cam.to({ x: 515, y: 228 }, { zoom: 1.4, frames: 700 });
            yield 110;
            g.keeperEmberPop();                                          // an ember pops, a smattering of sparks
            yield 40;
            yield s.narrate('It’d been a long while since she’d had a visitor.', { auto: true });
            keeper.setPose('sit_wrap');                                  // the red robe, pulled tighter against the cold
            yield 70;
            g.keeperEmberPop(8);
            yield 50;
            keeper.setPose('sit');
            s.clearLine();

            // A glance to the window above the fire: the deep pinkish-purple sky, the stars
            yield s.cam.to({ x: 450, y: 70 }, { zoom: 2.3, frames: 170 });
            yield s.narrate('Beyond the glass, portals and planets turned about the hill — shards from every corner of the universe, all in the same space.', { auto: true });
            s.clearLine();
            yield s.cam.to({ x: 470, y: 190 }, { zoom: 2.1, frames: 150 });
            yield s.narrate('It wasn’t often that she told the story of the beginning. But every time she did, the world’s magic bloomed once more.', { auto: true });
            s.clearLine();
            yield 30;

            // ── The trance: into the flames ────────────────────────────────
            trav.setPose('sit');
            yield s.narrate('The flames began to warp — into faces, places, events.', { auto: 150 });
            s.clearLine();
            s.cam.to('hearth', { zoom: 5, frames: 220, ease: 'smooth' });
            yield 90;
            yield s.vision.show('vanoga', 110);
            s.vision.beat('streams');
            yield 200;
            s.vision.beat('slow');
            yield 170;
            s.vision.beat('pinprick');
            yield 130;
            yield s.say('keeper', 'Vanoga… the star that began it all.', { with: 'traveler', mood: 'curious' });
            s.clearLine();

            // The couch springs creak: the Traveller leans in
            yield s.vision.hide(24);
            s.cam.cut({ x: 545, y: 262 }, 2.1);
            trav.setPose('sit_lean'); trav.prop = null;
            yield 70;
            yield s.vision.show('vanoga', 24);

            s.vision.beat('near');
            yield s.say('keeper', 'The very existence that we have been granted, the reality that we partake in, was started from this unassuming dot of a seed, planted within the sea of blackness that we know as space.', { with: 'traveler' });
            s.clearLine();
            s.vision.beat('pulse');
            yield 170;
            s.vision.beat('burst');
            s.cam.shake(3);
            yield 170;
            s.vision.beat('orb');
            yield 110;
            yield s.say('keeper', 'And so did our Empereal Lord…', { with: 'traveler', mood: 'smile' });
            s.clearLine();
            yield 60;
            yield s.fade('out', 140);
            s.vision.hide(0);
            yield 30;
        });
