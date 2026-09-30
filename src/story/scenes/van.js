        /* =====================================================================
           CHAPTER 1 — THE VAN (Story of 949, chapter 1)
           ---------------------------------------------------------------------
           The crew in the back of a military van, closing in on the Double Nights.
           After Max's "lap dogs", the camera pushes in on 949 and we drop into the
           night before: Mirabel's call (the player answers it — the phone is the
           first thing the HUD shows). A jolt brings us back; the van stops; five
           knocks; they pour out in front of the hotel.
           The novel's lines, verbatim where it has them.
           ===================================================================== */
        const VAN_DROP = {                                   // where everyone stands when the scene hands over (hub_949, under the Double Nights canopy)
            van: { x: 2010, y: 836, angle: 0 },              // on the drive, in front of the porte-cochère (buildings/double-nights.js)
            '949': { x: 2000, y: 784 }, '747': { x: 2036, y: 792 },
            Yenna: { x: 1962, y: 792 }, Sabrina: { x: 1940, y: 806 }, Max: { x: 2060, y: 806 },
            Victoria: { x: 1918, y: 800 }, Josh: { x: 2082, y: 800 }
        };
        const VAN_POSES = { '949': 'sit_work', '747': 'sit', Yenna: 'sit', Sabrina: 'sit', Max: 'sit_lean', Victoria: 'sit', Josh: 'sit' };
        const MIRABEL_DEPOSIT = 250;                          // 50 percent down

        /** 949 as she looks right now (her cosmetics), with or without her field mask. */
        function stellaSceneLook(g, masked) {
            const c = g.cosmetics ? g.cosmetics.getRenderConfig() : null, me = APPEARANCES['949'];
            if (!c) return masked ? { ...me, jewelry: [FIELD_MASK_949] } : me;
            const jewelry = masked ? [...(c.jewelry || []), FIELD_MASK_949] : c.jewelry;
            return { skinColor: c.skinColor, hair: c.hair, gender: me.gender, eyeColor: me.eyeColor, top: c.outfit.top, bottom: c.outfit.bottom,
                     shoes: c.outfit.shoes, train: c.outfit.train || null, hat: c.hat, jewelry };
        }

        /** The real teammates wait off-stage while the scene's actors play them. */
        function parkCrew(g) { for (const t of g.teammates || []) { t.x = -5000; t.y = -5000; } }

        /** Blue sparks off Max's fingers. */
        function maxSparks(g, a) {
            if (!g.weather || !a) return;
            const n0 = g.weather.particles.length;
            g.weather.spawnSparks(a.x - 8, a.y + 6, 7);
            for (let i = n0; i < g.weather.particles.length; i++) g.weather.particles[i].color = i % 2 ? '#7ad0ff' : '#3b82f6';
        }

        /**
         * After the ride (played or skipped): the crew is with her at the hotel door, the contract
         * is paid, and the parts of the HUD the scene introduced are there. Safe to run twice.
         */
        function vanAftermath(g) {
            const qs = g.questState;
            qs.hasKeycard = true;                             // the contract came with access to the suite
            if (!qs.mirabelDeposit) { qs.mirabelDeposit = MIRABEL_DEPOSIT; g.currency += MIRABEL_DEPOSIT; }
            if (qs.mirabelFavor === undefined) qs.mirabelFavor = 1;
            for (const t of g.teammates || []) t.recruited = true;
            if (g.hud) { g.hud.reveal('phone'); g.hud.reveal('pp'); }
            if (typeof phoneSystem !== 'undefined') phoneSystem.endCall();
            g.fieldMask = null; g.vanMoving = undefined; g.camera.sway = 0;
            if (!g.activeMap || g.activeMap.id !== 'hub_949') { g._doLoadMap('hub_949', { x: VAN_DROP['949'].x, y: VAN_DROP['949'].y }); g.bakeStaticLighting(); }
            g.player.x = VAN_DROP['949'].x; g.player.y = VAN_DROP['949'].y; g.player.angle = -Math.PI / 2; g.player.visible = true;
            for (const t of g.teammates || []) { const p = VAN_DROP[t.name]; if (p) { t.x = p.x; t.y = p.y; } }
            g.camera.x = g.player.x; g.camera.y = g.player.y; g.camera.zoom = 1.6;
            if (g.updateUI) g.updateUI();
            qs.vanDone = true;
        }

        defineScene('van', { startMap: { id: 'van_interior', at: { x: 200, y: 470 } }, flag: 'vanSeen', releaseFrames: 45, hideCrew: true }, function* (s) {
            const g = s.game;
            const seat = () => {
                const A = {};
                for (const [id, p] of Object.entries(VAN.SEATS))
                    A[id] = s.actor(id, id === '949' ? stellaSceneLook(g, true) : APPEARANCES[id], p.x, p.y, p.a).setPose(VAN_POSES[id]);
                return A;
            };

            // ── The van ─────────────────────────────────────────────────────
            s.mask(true); g.vanMoving = true;
            s.map('van_interior', { cam: { x: 200, y: 470 }, zoom: 1.5 });
            parkCrew(g);
            let A = seat();
            s.sway(1.1);
            yield s.fade('in', 100);
            s.marker('Moon City', 'En route to Double Nights');
            s.cam.to({ x: 200, y: 440 }, { zoom: 1.9, frames: 480, ease: 'smooth' });
            yield 90;
            yield s.narrate('The Dark Maker. The name was unforgettable. Eerie, almost.');
            yield s.narrate('The past twelve dark and rainy hours had been sleepless for 949. Her hands calibrated her FP-X almost absently, going through the well-practiced motions.');
            s.bump(6); yield 30;
            s.cam.to(A.Yenna, { zoom: 2.3, frames: 90, dx: 64 });
            yield s.say('yenna', 'Three months? The hell was she thinking?');
            yield s.say('sabrina', "You haven't heard the news? Business days are business months now.");
            s.cam.to(A.Max, { zoom: 2.4, frames: 70, dx: -50 });
            yield 30; maxSparks(g, A.Max);
            yield s.say('max', "Fuck that shit. So now we're just lap dogs, are we?", { mood: 'angry' });
            maxSparks(g, A.Max);

            // ── The push-in: into her head, and the night before ─────────────
            s.clearLine();
            s.cam.to(A['949'], { zoom: 4.4, frames: 170, ease: 'inOut' });
            yield 100;
            yield s.all(s.memory(1, 60), s.fade('out', 60));
            g.vanMoving = false; s.sway(0); s.mask(false);
            s.map('apt_949', { cam: { x: 1050, y: 380 }, zoom: 2.3 });
            const me = s.actor('949', stellaSceneLook(g, false), 1050, 372, Math.PI / 2).setPose('sit_wrap');
            yield s.fade('in', 70);
            s.marker('The night before', 'Silver Queen Apartments');
            s.cam.to({ x: 1050, y: 372 }, { zoom: 2.8, frames: 400, ease: 'smooth' });
            yield s.narrate('Rain on the glass. Sleep wouldn\'t come.');
            yield 40;

            // The phone: the first thing the HUD shows
            phoneSystem.ringCall('Mirabel', { subtitle: 'W. MINDUSTRIAL' });
            s.memory(0.45, 30); s.showHud(true);
            yield s.hud('phone', { title: 'Your phone', text: "Someone's calling. Tap to answer.", until: () => phoneSystem.callAnswered() });
            s.showHud(false); s.memory(1, 30);
            me.setPose('sit_phone');
            yield 24;
            yield s.say('mirabel', 'I want you to find him and bring him back to me, 949.');
            yield s.say('mirabel', 'No one but you is to do this, do I make myself clear? He will be mine.', { mood: 'angry' });
            yield s.narrate('A seething, visceral layer of rage lined her voice.');
            yield s.say('mirabel', "You do understand the trust that I'm placing in your hands?");
            const pact = yield s.choose(['I understand.', 'Why me?', 'Half up front.'], { timer: 600, def: 0, weighty: [0, 1, 2] });
            let deposit = MIRABEL_DEPOSIT;
            if (pact === 0) { yield s.say('949', 'I understand.'); g.questState.mirabelFavor = 2; }
            else if (pact === 1) { yield s.say('949', 'Why me?'); yield s.say('mirabel', 'Because no one else has ever disappointed me less.'); g.questState.mirabelFavor = 1; }
            else { yield s.say('949', 'Half up front.'); yield s.say('mirabel', 'Fifty percent. Tonight.'); g.questState.mirabelFavor = 1; deposit += 50; }
            yield s.say('mirabel', 'W. MINDUSTRIAL remembers its friends, 949.');
            phoneSystem.endCall();
            me.setPose('sit_wrap');
            // The deposit lands
            g.questState.mirabelDeposit = deposit; g.currency += deposit; g.updateUI();
            s.showHud(true);
            yield s.hud('pp', { title: 'Personics', text: `Deposit received: +${deposit}. Half now, half on delivery.`, mode: 'ring', timeout: 3400 });
            s.showHud(false);
            yield s.narrate('And so, it was settled: 50 percent down, and the hunt began.');
            yield s.narrate('Revenge was a very dangerous thing to get involved in, and its stench colored the whole mission. What are we getting ourselves into?');

            // ── Back in the van: a jolt ──────────────────────────────────────
            yield s.fade('out', 22);
            s.memory(0, 0); s.mask(true); g.vanMoving = true;
            s.map('van_interior', { cam: VAN.SEATS['949'], zoom: 3.4 });
            parkCrew(g);
            A = seat();
            s.sway(1.1); s.bump(10);
            yield s.fade('in', 10);
            yield s.narrate('A jostle of the van over a particularly sizable bump brought her mind back into the moment.');
            s.cam.to({ x: 200, y: 404 }, { zoom: 2.7, frames: 120 });
            yield s.narrate('Directly across from her, her brother. His black mask a mirror of her own, tinged a subtle purple in the dim light; his eyes glowing slits of gold.');
            yield s.narrate('He said nothing. But she knew he was giving her that small grin, the cute one that flashed across his serious face whenever they caught eyes.');
            s.cam.to(A.Josh, { zoom: 2.4, frames: 90, dx: -60 });
            yield s.say('josh', 'Well, more like hired mercenaries.');
            maxSparks(g, A.Max);
            yield s.say('max', 'Of course. Thanks, Josh, for pointing out the fucking obvious.', { mood: 'angry' });
            yield s.say('josh', "You're welcome.");
            yield s.narrate('Max just sucked his teeth, to the sniggers of Sabrina.');
            s.cam.to(A.Victoria, { zoom: 2.5, frames: 60, dx: -60 });
            yield s.say('victoria', 'Save me somebody from these sad motherfuckers attached to me at either fucking hip.');
            s.bump(5);
            s.cam.to(A.Yenna, { zoom: 2.4, frames: 70, dx: 60 });
            yield s.say('yenna', 'I swear the missions just get more and more ludicrous. Three months of him being on the loose before she thought to contact us?');
            s.cam.to(A['949'], { zoom: 2.6, frames: 70, dx: 50 });
            const answer = yield s.choose([
                'Mirabel can be a slight bit… funny sometimes. Keep on point.',
                'I have my doubts too. But we stay sharp.',
                'Eyes on the job.'
            ], { timer: 720, def: 0, weighty: [0, 1, 2] });
            const bond = (who, n) => { const t = (g.teammates || []).find(q => q.name === who); if (t) t.relationship = Math.max(0, Math.min(100, (t.relationship || 0) + n)); };
            if (answer === 0) {
                yield s.say('949', "Well, Mirabel can be a slight bit… funny sometimes. Just keep on point like we've always done, and we'll be fine.");
                yield s.narrate('She bit her lip and kept her doubts to herself. They were all already stressed enough as it was.');
                for (const n of ['Yenna', 'Sabrina', 'Max', 'Victoria', 'Josh']) bond(n, 3);
            } else if (answer === 1) {
                yield s.say('949', "I have my doubts too. But we stay sharp, and we get it done. Like always.");
                yield s.say('yenna', '…Thanks for saying it.');
                bond('Yenna', 6); bond('Josh', 3); bond('Max', -2);
            } else {
                yield s.say('949', 'Eyes on the job.');
                yield s.say('victoria', 'Finally. Somebody said it.');
                yield s.say('max', 'Tch.');
                bond('Victoria', 6); bond('Max', -3);
            }

            // ── The stop ────────────────────────────────────────────────────
            g.vanMoving = false; s.sway(0.4);
            yield s.narrate('The van slowed to a stop, finally.');
            s.sway(0);
            s.cam.to(A['747'], { zoom: 2.8, frames: 60, dx: -40 });
            A['747'].setPose('sit_lean');
            yield s.say('747', "We're here, team. Be ready for anything.");
            s.clearLine();
            yield s.knock(5);
            yield 20;
            yield s.fade('out', 26);

            // ── Double Nights ───────────────────────────────────────────────
            const V = VAN_DROP.van;
            s.map('hub_949', { at: { x: VAN_DROP['949'].x, y: VAN_DROP['949'].y }, cam: { x: 1990, y: 830 }, zoom: 1.9 });
            parkCrew(g);
            const van = s.prop('van', drawVanExterior, V.x, V.y, V.angle); van.doors = 0;
            const rear = { x: V.x - 64, y: V.y };
            const order = ['747', '949', 'Yenna', 'Max', 'Sabrina', 'Josh', 'Victoria'];
            const crew = {};
            for (const id of order) { crew[id] = s.actor(id, id === '949' ? stellaSceneLook(g, true) : APPEARANCES[id], rear.x + 30, rear.y, Math.PI); crew[id].visible = false; }
            yield s.fade('in', 30);
            yield s.tween(van, 'doors', 1, 24, 'out');
            for (const id of order) {
                const a = crew[id], to = VAN_DROP[id];
                a.visible = true; a.x = rear.x; a.y = rear.y + (Math.random() - 0.5) * 10;
                a.walk([{ x: rear.x - 26, y: rear.y }, { x: to.x, y: to.y }], 2.6);
                yield 12;
            }
            yield 40;
            for (const id of order) crew[id].face({ x: 2000, y: 700 }, 20);
            s.cam.to({ x: 2000, y: 520 }, { zoom: 0.9, frames: 260, ease: 'inOut' });
            yield 60;
            s.marker('Double Nights Hotel', 'Moon City');
            yield s.narrate('Towering before them was the building: Double Nights Hotel. Majestic, glistening, and warmly corporate.');
            s.cam.to({ x: 2000, y: 790 }, { zoom: 1.6, frames: 120 });
            yield 120;
        });
