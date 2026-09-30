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
        const STORY_DB = {
            // PART 1
            1: {
                name: "BEYOND STEEL AND SYNTHETICS",
                chapters: {
                    // CHAPTER 1
                    1: {
                        name: "THE AWAKENING",
                        missions: {
                            // MISSION 1
                            1: {
                                name: "OLD CONTACTS",
                                desc: "A call from a woman named Mirabel sends you on a wild chase after infamous killer, the Dark Maker. Will you be able to catch him and stay in one piece?",
                                location: "SOUTHERN DIMENSIONS CITY",
                                locationDesc: "Melting pot of cultures traveling to this location.",
                                completionTime: "1HR",
                                target: "THE DARK MAKER",
                                // Steps are addressed by name (story.goTo / isAt / isBefore). The numbers are
                                // just their order; saves keep the name (StoryManager.serialize).
                                steps: {
                                    // The van ride and the night before (story/scenes/van.js). Ends at the hotel door.
                                    0: {
                                        name: "VAN_RIDE",
                                        banner: null,
                                        targetMap: null,
                                        target: "player",
                                        condition: (game) => !!game.questState.vanDone,
                                        onStart: (game) => { if (!game.questState.vanDone && !game.scenes.running) game.story.playVan(); }
                                    },
                                    // Out of the van: she walks (the move stick), the door pill shows her how to go in
                                    1: {
                                        name: "ENTER_HOTEL",
                                        banner: "ENTER DOUBLE NIGHTS",
                                        targetMap: "hub_949",
                                        target: "hotel_entrance",
                                        condition: "LOC_HOTEL_LOBBY",
                                        onStart: (game) => {
                                            const H = game.hud, S = game.story;
                                            H.reveal('health'); H.reveal('location');
                                            const x0 = game.player.x, y0 = game.player.y;
                                            if (game.activeMap.id === 'hub_949' && !game.coach.taught.has('move'))
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
                                    // The lobby: Seven holds it; the elevator to the penthouse
                                    2: {
                                        name: "TAKE_ELEVATOR",
                                        banner: "TAKE THE ELEVATOR TO THE PENTHOUSE",
                                        targetMap: "hotel_lobby",
                                        target: "suite_elevator",
                                        condition: "LOC_HOTEL_SUITE",
                                        onStart: (game) => {
                                            game.hud.reveal('action');
                                            game.addPausableTimeout(() => game.story.triggerComms("747", "I'll hold the lobby and watch the feeds. Comms open.", 4500), 1200);
                                        }
                                    },
                                    // The penthouse: she draws her FP-X (the fire stick), and walks in deeper
                                    3: {
                                        name: "SEARCH_SUITE",
                                        banner: "SEARCH THE PENTHOUSE",
                                        targetMap: "hotel_suite",
                                        target: "suite_balcony",
                                        condition: "PLAYER_DEEP_IN_SUITE",
                                        onStart: (game) => {
                                            if (game.inventory && game.inventory.items.some(i => i.id === 'pistol_fpx')) { game.inventory.equipItem('pistol_fpx'); game.weaponHolstered = false; }
                                            game.hud.reveal('holster');
                                            game.addPausableTimeout(() => {
                                                game.hud.reveal('fire', { title: 'Your FP-X', text: 'Hold to aim. Push past the gold line to fire.', timeout: 14000, until: g => g.fireJoystick.active || g.mouseDown });
                                            }, 600);
                                            game.addPausableTimeout(() => game.story.triggerComms("747", "Well, welcome to the Penthouse. Watch your corners, Nine.", 4000), 2500);
                                        }
                                    },
                                    // The red light, the wall blows in, the drones
                                    4: {
                                        name: "SURVIVE_AMBUSH",
                                        banner: null,
                                        targetMap: "hotel_suite",
                                        target: "player",
                                        condition: "AMBUSH_CLEARED",
                                        onStart: (game) => {
                                            const S = game.story, H = game.hud;
                                            game.questState.suiteAmbushTriggered = false;          // set when the wall goes (AMBUSH_CLEARED waits on it)
                                            S.triggerComms("949", "Threat, bedroom.", 2200);
                                            game.addPausableTimeout(() => S.triggerComms("Yenna", "Copacetic, en route!", 1800), 1300);
                                            game.addPausableTimeout(() => {
                                                if (game.activeMap.id !== 'hotel_suite') { game.story.goTo('SEARCH_SUITE'); return; }   // she left before it blew
                                                game.questState.suiteAmbushTriggered = true;
                                                showMessage("BREACH DETECTED!");
                                                game.triggerShake(25);
                                                // Break the back wall
                                                const w = game.activeMap.walls.find(w => w.breach);   // tagged in world/maps.js
                                                if (w) {
                                                    for (let ex = w.x; ex < w.x + w.w; ex += 40) {
                                                        game.weather.spawnExplosion(ex, w.y, '#ff8800');
                                                        game.weather.spawnExplosion(ex + 20, w.y + 10, '#ff4500');
                                                    }
                                                    game.removeWall(w);
                                                }
                                                // The drones
                                                game.enemies.push(new Drone(900, 1100));
                                                game.enemies.push(new Drone(1000, 1150));
                                                game.enemies.push(new Drone(1100, 1100));
                                            }, 3200);
                                            game.addPausableTimeout(() => S.triggerComms("Max", "Fuck!", 1500), 3700);
                                            game.addPausableTimeout(() => S.triggerComms("Victoria", "It's them.", 2200), 5400);
                                            game.addPausableTimeout(() => S.triggerComms("Max", "And here we go…", 2200), 7800);
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
                                    // The aftermath: search the rubble; Yenna spots the note
                                    5: {
                                        name: "FIND_NOTE",
                                        banner: "SEARCH THE RUBBLE",
                                        targetMap: "hotel_suite",
                                        target: "dark_maker_note",
                                        condition: (game) => (game.foundNotes || []).includes('dark_maker_letter'),
                                        onStart: (game) => {
                                            const S = game.story, H = game.hud;
                                            game.questState.ambushCleared = true;
                                            H.reveal('heal'); H.reveal('flit');
                                            game.addPausableTimeout(() => S.triggerComms("Max", "This… is bullshit.", 2400), 1500);
                                            game.addPausableTimeout(() => S.triggerComms("Sabrina", "Better than bullshit. It's raw building material.", 3200), 4200);
                                            S.watch(g => {
                                                const note = (g.props || []).find(p => p.noteId === 'dark_maker_letter' || (p.interactionType === 'read_note' && /dark/i.test(p.noteId || p.label || '')));
                                                if (!note || g.activeMap.id !== 'hotel_suite') return false;
                                                if (Math.hypot(g.player.x - (note.x + (note.w || 0) / 2), g.player.y - (note.y + (note.h || 0) / 2)) > 150) return false;
                                                S.triggerComms("Yenna", "What's that?", 2400);
                                                g.addPausableTimeout(() => S.triggerComms("949", "Yenna, you really are a sniper.", 2600), 2600);
                                                return true;
                                            });
                                        }
                                    },
                                    // Josh's rage, then out before the news arrives: the BlackMark is at the curb
                                    6: {
                                        name: "LEAVE_HOTEL",
                                        banner: "GET TO THE BLACKMARK",
                                        targetMap: "hub_949",
                                        target: "player_car",
                                        condition: "PLAYER_IN_OWNED_CAR",
                                        onStart: (game) => {
                                            const S = game.story;
                                            game.addPausableTimeout(() => { game.triggerShake(6); S.triggerComms("Josh", "RAAAGH—", 1600); }, 1200);
                                            game.addPausableTimeout(() => S.triggerComms("949", "Josh.", 2000), 3200);
                                            game.addPausableTimeout(() => S.triggerComms("747", "News crews'll be on us any minute. The BlackMark's out front, Nine.", 4200), 6000);
                                            S.watch(g => g.activeMap.id === 'hub_949' && (S.placeCarAtHotel(), true));   // once she's back on the street
                                            S.watch(g => {
                                                if (!g.isDriving || g.coach.cur) return false;
                                                g.hud.reveal('autodrive', { title: 'Auto-drive', text: 'Tap to let the BlackMark drive you to your marker.', mode: 'ring', timeout: 6000 });
                                                return true;
                                            });
                                        }
                                    },
                                    // Mirabel, in person for the first time: the balance, and her favour
                                    7: {
                                        name: "REPORT_TO_MIRABEL",
                                        banner: "MEET MIRABEL AT MOON CITY NIGHTCLUB",
                                        targetMap: "hub_949",
                                        target: "club_entrance",
                                        condition: "CONTRACTOR_REWARDED",
                                        onStart: (game) => {
                                            game.questState.ambushCleared = true;
                                            game.hud.reveal('autodrive');
                                        }
                                    },
                                    // Chapter complete (terminal)
                                    8: {
                                        name: "CHAPTER_COMPLETE",
                                        banner: null,
                                        targetMap: null,
                                        target: "player",
                                        condition: null, // Terminal — no auto-advance
                                        onStart: (game) => {
                                            if (game.hud) game.hud.revealAll();
                                            game.ui.showMissionBanner("CHAPTER 1 COMPLETE — THE AWAKENING", "gold", "COMPLETED");
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("747", "He slipped through. But we rattled him. Rest up, Nine. This isn't over.", 6000);
                                            }, 3000);
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("LARISSA", "949. I received news of what went down. I say it's time for a meeting.", 6000);
                                            }, 16000);
                                        }
                                    }
                                },

                                // ── OPTIONAL CONTENT ──
                                // Activates when trigger condition is met.
                                // Does not block main story progression.
                                optional: [
                                    {
                                        id: 'sanctum',
                                        name: 'THE SANCTUM',
                                        trigger: 'LOC_CHURCH_BOSS',
                                        steps: {
                                            0: {
                                                name: "DEFEAT_TRIUMVIRATE",
                                                banner: null,
                                                targetMap: "church_boss",
                                                target: "boss_spawn",
                                                condition: "CHURCH_BOSS_DEFEATED",
                                                onStart: (game) => {
                                                    if (!game.questState.churchBossDefeated) {
                                                        // They kneel at the altar until the intro wakes them (engine/boss-intro.js)
                                                        game.spawnTriumvirate();
                                                    }
                                                }
                                            },
                                            1: {
                                                name: "SANCTUM_CLEARED",
                                                banner: null,
                                                targetMap: "church_boss",
                                                target: "player",
                                                condition: null, // Terminal
                                                onStart: (game) => {
                                                    game.questState.churchBossDefeated = true;
                                                    game.currency += 1000;
                                                    game.scrap += 50;
                                                    showMessage("THE TRIUMVIRATE DESTROYED! REWARD: 1000 PERSONICS, 50 SCRAP");
                                                    game.triggerShake(30);
                                                    for (let i = 0; i < 20; i++) {
                                                        game.addPausableTimeout(() => {
                                                            const rx = 400 + Math.random() * 400;
                                                            const ry = 300 + Math.random() * 600;
                                                            game.weather.spawnExplosion(rx, ry, '#ff3300');
                                                            game.weather.spawnSparks(rx, ry, 30);
                                                        }, i * 100);
                                                    }
                                                    game.ui.showMissionBanner("THE SANCTUM — CLEARED", "gold", "COMPLETED");
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        };


