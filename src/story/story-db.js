        /* =====================================================================
           NARRATIVE DATABASE (The Repository)
           ---------------------------------------------------------------------
           Hierarchy: Part -> Chapter -> Mission -> Step
           Data values determine objectives, map markers, and completion logic.
           ===================================================================== */
        /* =====================================================================
           NARRATIVE DATABASE (Granular Steps)
           ---------------------------------------------------------------------
           Chapter 1: the van (and the night before) → Double Nights → the
           penthouse ambush → the note → the BlackMark → Mirabel, in person.
           ===================================================================== */
        /* The story is data: GAME_DB.story.parts (directory/game-db/story.json). A step whose code can't be data
           names it in `hooks`, its own name: its onStart (and its condition, when that is a function) are here. */
        const STORY_STEP_HOOKS = {
            VAN_RIDE: {
                condition: (game) => !!game.questState.vanDone,
                onStart: (game) => { if (!game.questState.vanDone && !game.scenes.running) game.story.playVan(); }
            },
            ENTER_HOTEL: {
                onStart: (game) => {
                    const H = game.hud, S = game.story;
                    H.reveal('health'); H.reveal('location');
                    const x0 = game.player.x, y0 = game.player.y;
                    if (game.activeMap.id === 'sdc' && !game.coach.taught.has('move'))
                        H.reveal('move', { title: 'Move', text: 'Drag anywhere here to move.', ghost: 'drag', timeout: 12000,
                                           until: g => Math.hypot(g.player.x - x0, g.player.y - y0) > 40 });
                    else H.reveal('move');
                    S.watch(g => {                                            // the first pill she meets: the door
                        if (H.has('action') || g.coach.cur) return H.has('action');
                        const pill = document.getElementById('btn-transition'), p2 = document.getElementById('btn-interact');
                        const shown = [pill, p2].find(e => e && e.style.display !== 'none' && getComputedStyle(e).display !== 'none');
                        if (!shown) return false;
                        H.reveal('action', { title: 'Actions', text: 'Doors, people, things to search: what you can do shows up here. Tap it.', until: 'tap', timeout: 15000 });
                        return true;
                    });
                }
            },
            TAKE_ELEVATOR: {
                onStart: (game) => {
                    game.hud.reveal('action');
                    game_timers.after(1.2, () => game.story.triggerComms("747", "I'll hold the lobby and watch the feeds. Comms open.", 4500), 'world');
                }
            },
            SEARCH_SUITE: {
                onStart: (game) => {
                    if (game.inventory && game.inventory.items.some(i => i.id === 'pistol_fpx')) { game.inventory.equipItem('pistol_fpx'); game.weaponHolstered = false; }
                    game.hud.reveal('holster');
                    game_timers.after(0.6, () => {
                        game.hud.reveal('fire', { title: 'Your FP-X', text: 'Hold to aim. Push past the gold line to fire.', timeout: 14000, until: g => g.fireJoystick.active || g.mouseDown });
                    }, 'world');
                    game_timers.after(2.5, () => game.story.triggerComms("747", "Well, welcome to the Penthouse. Watch your corners, Nine.", 4000), 'world');
                }
            },
            SURVIVE_AMBUSH: {
                onStart: (game) => {
                    const S = game.story, H = game.hud;
                    game.questState.suiteAmbushTriggered = false;          // set when the wall goes (AMBUSH_CLEARED waits on it)
                    S.triggerComms("949", "Threat, bedroom.", 2200);
                    game_timers.after(1.3, () => S.triggerComms("Yenna", "Copacetic, en route!", 1800), 'world');
                    game_timers.after(3.2, () => {
                        if (game.activeMap.id !== 'hotel_suite') { game.story.goTo('SEARCH_SUITE'); return; }   // she left before it blew
                        game.questState.suiteAmbushTriggered = true;
                        showMessage("BREACH DETECTED!");
                        game.triggerShake(25);
                        // Break the back wall
                        const w = game.activeMap.walls.find(w => w.breach);   // tagged in world/maps.js
                        if (w) {
                            game.spawnBreachBlast(w, -1);   // fire, light, debris, smoke (engine/breach-fx.js)
                            audioSys.sfx('explode');
                            game.removeWall(w);
                        }
                        // The drones drop in through the breach: a lancer, a seer, a grappler (entities/drones.js)
                        game.enemies.push(new Drone(900, 1100, 'lancer'));
                        game.enemies.push(new Drone(1000, 1150, 'seer'));
                        game.enemies.push(new Drone(1100, 1100, 'grappler'));
                    }, 'world');
                    game_timers.after(3.7, () => S.triggerComms("Max", "Fuck!", 1500), 'world');
                    game_timers.after(5.4, () => S.triggerComms("Victoria", "It's them.", 2200), 'world');
                    game_timers.after(7.8, () => S.triggerComms("Max", "And here we go…", 2200), 'world');
                    // A stim after the first hit; the flit once they start telegraphing (or she's hit)
                    S.watch(g => {
                        if (g.coach.cur) return false;
                        if (g.playerHealth < g.maxPlayerHealth) { H.reveal('heal', { title: 'Stims', text: 'Hurt? Tap to heal.', mode: 'ring', timeout: 5000 }); return true; }
                        return false;
                    });
                    S.watch(g => {
                        if (g.coach.cur) return false;
                        const tele = (g.enemies || []).some(e => e.telegraph || e.isTelegraphing || e._telegraph);
                        if (tele || g.playerHealth < g.maxPlayerHealth * 0.8) {
                            H.reveal('flit', { title: 'Flit', text: 'Tap ⚡ (or drag past the ring) to blink out of the line.', mode: 'ring', timeout: 6000 });
                            return true;
                        }
                        return false;
                    });
                }
            },
            FIND_NOTE: {
                condition: (game) => (game.foundNotes || []).includes('dark_maker_letter'),
                onStart: (game) => {
                    const S = game.story, H = game.hud;
                    game.questState.ambushCleared = true;
                    H.reveal('heal'); H.reveal('flit');
                    game_timers.after(1.5, () => S.triggerComms("Max", "This… is bullshit.", 2400), 'world');
                    game_timers.after(4.2, () => S.triggerComms("Sabrina", "Better than bullshit. It's raw building material.", 3200), 'world');
                    S.watch(g => {
                        const note = (g.props || []).find(p => p.noteId === 'dark_maker_letter' || (p.interactionType === 'read_note' && /dark/i.test(p.noteId || p.label || '')));
                        if (!note || g.activeMap.id !== 'hotel_suite') return false;
                        if (Math.hypot(g.player.x - (note.x + (note.w || 0) / 2), g.player.y - (note.y + (note.h || 0) / 2)) > 150) return false;
                        S.triggerComms("Yenna", "What's that?", 2400);
                        game_timers.after(2.6, () => S.triggerComms("949", "Yenna, you really are a sniper.", 2600), 'world');
                        return true;
                    });
                }
            },
            LEAVE_HOTEL: {
                onStart: (game) => {
                    const S = game.story;
                    game_timers.after(1.2, () => { game.triggerShake(6); S.triggerComms("Josh", "RAAAGH—", 1600); }, 'world');
                    game_timers.after(3.2, () => S.triggerComms("949", "Josh.", 2000), 'world');
                    game_timers.after(6, () => S.triggerComms("747", "News crews'll be on us any minute. The BlackMark's out front, Nine.", 4200), 'world');
                    S.watch(g => g.activeMap.id === 'sdc' && (S.placeCarAtHotel(), true));   // once she's back on the street
                    S.watch(g => {
                        if (!g.isDriving || g.coach.cur) return false;
                        g.hud.reveal('autodrive', { title: 'Auto-drive', text: 'Tap to let the BlackMark drive you to your marker.', mode: 'ring', timeout: 6000 });
                        return true;
                    });
                    S.watch(g => {                           // once she's rolling, after the auto-drive tip
                        if (!g.isDriving || g.coach.cur || !g.hud.has('autodrive') || Math.abs(g.car.speed) < 3) return false;
                        g.hud.reveal('handbrake', { title: 'Handbrake', text: 'Hold to lock the rear wheels and swing the tail round. Space on a keyboard.', mode: 'ring', timeout: 6000 });
                        return true;
                    });
                }
            },
            REPORT_TO_MIRABEL: {
                onStart: (game) => {
                    game.questState.ambushCleared = true;
                    // Where to find her, as a pin she can set as her waypoint (ui/messages.js)
                    if (typeof phoneSystem !== 'undefined' && phoneSystem.dropPin) phoneSystem.dropPin('Mirabel', 'moon_city', 'Moon City. My lounge, upstairs. Don\'t keep me waiting.', 2400);
                    game.hud.reveal('autodrive');
                    game.hud.reveal('handbrake');
                }
            },
            CHAPTER_COMPLETE: {
                onStart: (game) => {
                    if (game.hud) game.hud.revealAll();
                    game.ui.showMissionBanner("CHAPTER 1 COMPLETE — THE AWAKENING", "gold", "COMPLETED");
                    game_timers.after(3, () => {
                        game.story.triggerComms("747", "He slipped through. But we rattled him. Rest up, Nine. This isn't over.", 6000);
                    }, 'world');
                    game_timers.after(16, () => {
                        game.story.triggerComms("LARISSA", "949. I received news of what went down. I say it's time for a meeting.", 6000);
                    }, 'world');
                }
            },
            DEFEAT_TRIUMVIRATE: {
                onStart: (game) => {
                    if (!game.questState.churchBossDefeated) {
                        // They kneel at the altar until the intro wakes them (engine/boss-intro.js)
                        game.spawnTriumvirate();
                    }
                }
            },
            SANCTUM_CLEARED: {
                onStart: (game) => {
                    game.questState.churchBossDefeated = true;
                    game.currency += 1000;
                    game.scrap += 50;
                    showMessage("THE TRIUMVIRATE DESTROYED! REWARD: 1000 PERSONICS, 50 SCRAP");
                    game.triggerShake(30);
                    for (let i = 0; i < 20; i++) {
                        game_timers.after((i * 100) / 1000, () => {
                            const rx = 400 + Math.random() * 400;
                            const ry = 300 + Math.random() * 600;
                            game.weather.spawnExplosion(rx, ry, '#ff3300');
                            game.weather.spawnSparks(rx, ry, 30);
                        }, 'world');
                    }
                    game.ui.showMissionBanner("THE SANCTUM — CLEARED", "gold", "COMPLETED");
                }
            }
        };

        const STORY_DB = GAME_DB.story.parts;   // directory/game-db/story.json
        for (const part of Object.values(STORY_DB)) for (const ch of Object.values(part.chapters)) for (const m of Object.values(ch.missions)) {
            attachDataHooks(m.steps, STORY_STEP_HOOKS);
            for (const opt of m.optional || []) attachDataHooks(opt.steps, STORY_STEP_HOOKS);
        }


