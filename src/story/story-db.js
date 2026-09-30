        /* =====================================================================
           NARRATIVE DATABASE (The Repository)
           ---------------------------------------------------------------------
           Hierarchy: Part -> Chapter -> Mission -> Step
           Data values determine objectives, map markers, and completion logic.
           ===================================================================== */
        /* =====================================================================
           NARRATIVE DATABASE (Granular Steps)
           ---------------------------------------------------------------------
           Breakdown:
           0: Intro Cutscene (Non-interactive)
           1: Check Phone (Interactive)
           2: Leave Apartment (Interactive - Walk to door)
           3: Car Reveal Cutscene (Non-interactive)
           4: Enter Vehicle (Interactive)
           ...
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
                                steps: {
                                    // STEP 0: The Awakening (Cutscene)
                                    0: {
                                        name: "INTRO_SEQUENCE",
                                        banner: null, 
                                        targetMap: "apt_949",
                                        target: "player", // Center on player
                                        condition: "TIMER_360", // Wait 6 seconds
                                        onStart: (game) => {
                                            game.cutscene.start();
                                            // Start cutscene at current zoomed-in level
                                            game.cutscene.camZoomTarget = game.camera.zoom;
                                            game.cutscene.camTargetX = game.player.x;
                                            game.cutscene.camTargetY = game.player.y;
                                            
                                            // Phase 1: Hold the close-up for a beat (1s), then begin zoom out
                                            game.addPausableTimeout(() => {
                                                game.cutscene.camZoomTarget = 1.0; // Zoom out to normal
                                            }, 1000);
                                            
                                            // Phase 2: Show title cards mid-zoom (1.5s in)
                                            game.addPausableTimeout(() => {
                                                game.cutscene.showTitle(4000);
                                            }, 1500);
                                        }
                                    },
                                    // STEP 1: Check Phone
                                    1: {
                                        name: "CHECK_PHONE",
                                        banner: "CHECK YOUR PHONE",
                                        targetMap: "apt_949",
                                        target: "player",
                                        condition: "PHONE_OPENED_CONTACTS",
                                        onStart: (game) => {
                                            game.cutscene.end(); // Give control back
                                            // Reset fade overlay to default speed
                                            const fadeOv = document.getElementById('fade-overlay');
                                            if (fadeOv) fadeOv.style.transition = 'opacity 0.4s ease';
                                            // Dot is now derived from the unread ledger; the typing
                                            // indicator fires immediately and serves as the prompt.
                                            if(typeof phoneSystem !== 'undefined') {
                                                // Show typing indicator first, then deliver message after delay
                                                phoneSystem.sendText('Mirabel', "949, I need your expertise. Meet me at the Moon City Nightclub. Come quickly, this is urgent.", true, 2500);
                                                phoneSystem.metNPCs.add('Anavia');
                                                phoneSystem.sendText('Anavia', "Meet me outside when you have a moment, I want to see your face.", true, 5000);
                                            }
                                        }
                                    },
                                    // STEP 2: Leave Apartment
                                    2: {
                                        name: "LEAVE_APARTMENT",
                                        banner: "LEAVE THE APARTMENT",
                                        targetMap: "apt_949",
                                        target: "apt_door", // <--- Modular ID
                                        condition: "LOC_HUB" 
                                    },
                                    // STEP 3: Car Reveal & City Establishing Shot
                                    3: {
                                        name: "CAR_REVEAL",
                                        banner: null, 
                                        targetMap: "hub_949",
                                        target: "player_car",
                                        condition: "TIMER_600", 
                                        onStart: (game) => {
                                            // Camera Snap to prevent swinging
                                            game.camera.x = game.player.x;
                                            game.camera.y = game.player.y;
                                            
                                            game.cutscene.start(); 
                                            if(game.ownedCar) game.ownedCar.forceLights = true;
                                            
                                            // Cinematic Sequence
                                            game.addPausableTimeout(() => game.story.triggerComms("747", "Nine. Be careful out there.", 4000), 500);
                                            
                                            // --- MODULAR PAN COMMANDS ---
                                            // 1. Pan to Car (at 1s) — dynamic position
                                            game.addPausableTimeout(() => game.cutscene.panTo('player_car', 0.8), 1000); 
                                            
                                            // 2. Pan to Club (at 4s)
                                            game.addPausableTimeout(() => game.cutscene.panTo('club_entrance', 0.7), 4000); 
                                            
                                            // 3. Pan back to Player (at 7s)
                                            game.addPausableTimeout(() => game.cutscene.panTo('player', 1.0), 7000);
                                        }
                                    },
                                    // STEP 4: Enter Vehicle
                                    4: {
                                        name: "ENTER_VEHICLE",
                                        banner: "ENTER YOUR VEHICLE",
                                        targetMap: "hub_949",
                                        target: "player_car",
                                        condition: "PLAYER_IN_OWNED_CAR",
                                        onStart: (game) => {
                                            game.cutscene.end(); 
                                            game.story.triggerComms("949", "There she is. I'll be on the way shortly.", 4000);
        
                                            // Cleanup UI — derived from the ledger
                                            if (typeof phoneSystem !== 'undefined') phoneSystem.markAllRead();
                                        }
                                    },
                                    // STEP 5: Drive to Club
                                    5: {
                                        name: "DRIVE_CLUB",
                                        banner: "DRIVE TO MOON CITY NIGHTCLUB",
                                        targetMap: "hub_949",
                                        target: "club_entrance", // <--- Modular ID
                                        condition: "LOC_NIGHTCLUB",
                                        onStart: (game) => {
                                            // Sibling Banter while driving
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("747", "I can't shake the feeling Nine. This hunt reeks.", 4000);
                                            }, 2000);
        
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("949", "I know, Seven. We don't know what we're getting involved in.", 4000);
                                            }, 7000);
        
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("747", "*Sigh* Mirabel for goodness sake. Keep me updated.", 4000);
                                            }, 12000);
                                        }
                                    },
                                    // STEP 6: Wait inside Club
                                    6: {
                                        name: "WAIT_FOR_TEXT",
                                        banner: "...",
                                        targetMap: "moon_city_nightclub",
                                        target: "player",
                                        condition: "TIMER_120"
                                    },
                                    // STEP 7: Receive & Read Message
                                    7: {
                                        name: "READ_MESSAGE",
                                        banner: "NEW MESSAGE RECEIVED",
                                        targetMap: "moon_city_nightclub",
                                        target: "player",
                                        condition: "MESSAGE_READ_MIRABEL",
                                        onStart: (game) => {
                                            game.story.nsm.flags.messageReadMirabel = false;
                                            if(typeof phoneSystem !== 'undefined') {
                                                // Show typing indicator first, then deliver message
                                                phoneSystem.sendText('Mirabel', "I'm in the back right booth. Wearing red.", true, 2000);
                                                phoneSystem.sendText('Mirabel', "I have your team with me too. They know the deal.", true, 8000);
                                            }
                                        }
                                    },
                                    // STEP 8: Find Mirabel
                                    8: {
                                        name: "FIND_MIRABEL",
                                        banner: "FIND MIRABEL",
                                        targetMap: "moon_city_nightclub",
                                        target: "mirabel_booth", // <--- Modular ID
                                        condition: "HAS_KEYCARD",
                                        onStart: (game) => {
                                            // Derived from the ledger — see phoneSystem.refreshNotifications
                                            if (typeof phoneSystem !== 'undefined') phoneSystem.markAllRead();
                                        }
                                    },
                                    // STEP 9: Leave Club
                                    9: {
                                        name: "LEAVE_CLUB",
                                        banner: "LEAVE THE NIGHTCLUB",
                                        targetMap: "moon_city_nightclub",
                                        target: "club_exit",
                                        condition: "LOC_HUB"
                                    },
                                    // STEP 10: Go to Hotel
                                    10: {
                                        name: "ARRIVE_HOTEL",
                                        banner: "ARRIVE AT DOUBLE NIGHTS HOTEL",
                                        targetMap: "hub_949",
                                        target: "hotel_entrance",
                                        condition: "LOC_HOTEL_LOBBY"
                                    },
                                    // STEP 11: Take the elevator
                                    11: {
                                        name: "ENTER_SUITE",
                                        banner: "TAKE THE ELEVATOR TO THE PENTHOUSE",
                                        targetMap: "hotel_lobby",
                                        target: "suite_elevator",
                                        condition: "LOC_HOTEL_SUITE",
                                        onStart: (game) => {
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("747", "Well, welcome to the Penthouse. Watch your corners, Nine.", 4000);
                                            }, 1500);
                                        }
                                    },
                                    // STEP 12: Walk deeper into suite
                                    12: {
                                        name: "SEARCH_SUITE",
                                        banner: "SEARCH THE PENTHOUSE",
                                        targetMap: "hotel_suite",
                                        target: "suite_balcony",
                                        condition: "PLAYER_DEEP_IN_SUITE"
                                    },
                                    // STEP 13: Ambush — drones breach, survive
                                    13: {
                                        name: "SURVIVE_AMBUSH",
                                        banner: null,
                                        targetMap: "hotel_suite",
                                        target: "player",
                                        condition: "AMBUSH_CLEARED",
                                        onStart: (game) => {
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
                                            // Spawn Drones
                                            game.enemies.push(new Drone(900, 1100));
                                            game.enemies.push(new Drone(1000, 1150));
                                            game.enemies.push(new Drone(1100, 1100));
                                            
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("747", "Nine! Multiple contacts! Drones — they're breaching!", 4000);
                                            }, 500);
                                        }
                                    },
                                    // STEP 14: Report back to Mirabel
                                    14: {
                                        name: "REPORT_BACK",
                                        banner: "REPORT TO MIRABEL",
                                        targetMap: "hub_949",
                                        target: "club_entrance",
                                        condition: "CONTRACTOR_REWARDED",
                                        onStart: (game) => {
                                            game.questState.ambushCleared = true;
                                            showMessage("AREA SECURE. RETURN TO MIRABEL.");
                                            game.addPausableTimeout(() => {
                                                game.story.triggerComms("747", "You good? Get back to Mirabel. Debrief.", 4000);
                                            }, 2000);
                                        }
                                    },
                                    // STEP 15: Chapter complete (terminal)
                                    15: {
                                        name: "CHAPTER_COMPLETE",
                                        banner: null,
                                        targetMap: null,
                                        target: "player",
                                        condition: null, // Terminal — no auto-advance
                                        onStart: (game) => {
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


