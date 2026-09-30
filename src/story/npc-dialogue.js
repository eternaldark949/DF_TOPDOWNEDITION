        /* =====================================================================
           NPC DIALOGUE — what everyone in the world says when you talk to them,
           and what their buttons do. One entry per character (by name), with
           fallbacks by role ('@dancer', '@robot', '@teammate'…) and '@passing'
           for anyone without lines of their own.

             text(g, npc)     the line (g is the game)
             buttons(g, npc)  { accept: label | null (hidden), decline: label, extra: label }
                              (default: Accept / Decline; `extra` is a third button that just leaves)
             accept(g, npc)   what Accept does; the dialogue closes afterwards…
             endFirst         …or before it, when Accept opens a menu of its own
             decline(g, npc)  what Decline does, if more than closing (runs after the close)
             noLock           leave the HUD's pointer lock alone (Grum's three-button menu)

           The dialogue box itself is engine/screens-ui.js (startDialogue) and the
           buttons are wired in engine/events.js.
           ===================================================================== */
        const NPC_DIALOGUE = {
            'Dr. Yin': {
                text: () => "Welcome to the Clinic. I have cybernetic augments if you have the personics. Neural implants, subdermal mesh, phase wires — all top-grade.",
                endFirst: true, accept: g => g.openDrYinMenu()                        // tune Resonance, or augments
            },
            'Barista Ren': {
                text: g => g.missions.activeMission
                    ? "You've already got a job running. Finish that first, then come back for more work."
                    : "Hey! We've got an Amber delivery that needs to go out. Want to run it? Good personics in it for you.",
                accept(g) {
                    if (g.missions.activeMission) { showMessage('FINISH YOUR CURRENT MISSION FIRST.'); return; }
                    const delivery = g.missions.generateDelivery(g);
                    if (delivery) { g.missions.acceptMission(delivery, g); showMessage('PICK UP THE PACKAGE FROM THE AMBER DELIVERY VEHICLE OUTSIDE.'); }
                    else showMessage('NO DELIVERIES AVAILABLE. TRY AGAIN LATER.');
                }
            },
            'Bartender': {
                text: g => g.missions.activeMission
                    ? "Handle your current contract first, Freelancer. Then we'll talk bounties."
                    : "Welcome to Moon City. We've got a bounty that needs handling — dangerous type, good payout. Interested?",
                accept(g) { const bounty = g.missions.generateBounty(g); if (bounty) g.missions.acceptMission(bounty, g); }
            },
            'Torque': {
                text: () => "Welcome to Torque Auto, Freelancer. Need a new ride, paint job, or some glow work? Step up to the counter.",
                endFirst: true, accept: g => g.openAutoShop()
            },
            'Prisma': {
                text: () => "Welcome to Neural Systems. Identity is a spectrum — we just help you find your frequency. Browse our W.I.G.s, S.K.I.N.s, and V.O.C.A.L.s.",
                endFirst: true, accept: g => g.openCosmeticsShop()
            },
            'Biggs': {
                text: g => `Welcome to Biggs Amusement Park! CRASH ROYALE is our flagship — 7 cars, 60 seconds, pure chaos. Entry: ${g.bumperMinigame.entryCost} personics. You in?`,
                endFirst: true, accept: g => g.bumperMinigame.start(g)
            },
            'Grum North': {
                text(g) {
                    const highWave = g.hordeGauntlet ? g.hordeGauntlet.highestWave : 0;
                    return "Freelancer. I run the Gauntlet — waves of hostiles, no mercy, good pay. "
                        + (highWave > 0 ? `Your record: Wave ${highWave}. ` : '')
                        + "I can also send you back to the Sanctum if you want another crack at the Triumvirate.";
                },
                buttons: () => ({ accept: 'GAUNTLET', decline: 'BOSS REPLAY', extra: 'LEAVE' }),
                noLock: true,
                endFirst: true, accept: g => { if (g.hordeGauntlet) g.openGauntletMenu(); },
                decline(g) {                                                           // BOSS REPLAY: back to the Sanctum
                    g.loadMap('church_boss');
                    g.addPausableTimeout(() => {
                        if (!g.enemies.some(e => e.persona && !e.dead)) g.spawnTriumvirate({ short: true });
                        showMessage("THE TRIUMVIRATE AWAKENS... (REPLAY)");
                        g.triggerShake(20);
                    }, 500);
                }
            },
            'LUVSH4D3': {
                text: g => g.questState.ambushCleared && !g.questState.rewardClaimedLUVSH4D3
                    ? "Oh, Freelancer! Thank you ever so much for dealing with those pesky intruders. Please, accept this as a token of Double Nights' gratitude."
                    : g.questState.rewardClaimedLUVSH4D3
                        ? "We hope you enjoy your stay here at Double Nights. Excellence is our guarantee."
                        : "Welcome to Double Nights. Please be aware, the Penthouse is currently... undergoing maintenance.",
                buttons: g => (g.questState.ambushCleared && !g.questState.rewardClaimedLUVSH4D3) ? {} : { accept: null, decline: 'Leave' },   // only the reward is accepted
                accept(g) {
                    if (g.questState.ambushCleared && !g.questState.rewardClaimedLUVSH4D3) {
                        g.currency += 450; g.scrap += 10; g.questState.rewardClaimedLUVSH4D3 = true;
                        g.updateUI(); showMessage("REWARD: 450 PERSONICS, 10 SCRAP");
                    }
                }
            },
            'Ms. Jean': {
                text: g => !g.questState.etherealUnlocked
                    ? "Yes, I am the face of 'Jean Soda'. But today I'm just paying respects. Tell me, Freelancer, do you see the ghosts here? Have you ever been curious about their stories?"
                    : "The Ethereal Plane is close. Do you wish to cross over?",
                accept(g) {
                    if (!g.questState.etherealUnlocked) {
                        g.questState.etherealUnlocked = true;
                        showMessage("ETHEREAL PLANE UNLOCKED.");
                        g.weather.spawnGhost(g.player.x + 50, g.player.y, 0);
                        g.weather.spawnGhost(g.player.x - 50, g.player.y, Math.PI);
                    } else { showMessage("CROSSING OVER..."); g.loadMap('ethereal_plane'); }
                }
            },
            'Anavia': {
                text(g) {
                    if (g.missions.completedBounties >= 5) return g.missions.activeMission
                        ? "Handle your current operation first, 949. I don't invest in distracted people."
                        : "You've been making noise, 949. Good noise. I know where the real materials are — abandoned caches, forgotten freight. I'll mark it, you clear it. The scrap is yours. Interested?";
                    return !g.questState.etherealUnlocked
                        ? "Well, what a surprise visit. I'm curious to know if you work as good as you look. Come back later and I just might have something for you."
                        : "Hmm, you're clearly worth your salt, 949. Keep making noise out there. I may have something for you yet.";
                },
                accept(g) {                                                            // salvage ops, after 5 bounties
                    if (g.missions.completedBounties >= 5 && !g.missions.activeMission) {
                        const salvage = g.missions.generateSalvage(g);
                        if (salvage) { g.missions.acceptMission(salvage, g); showMessage('SALVAGE SITE MARKED. CLEAR THE HOSTILES, COLLECT THE CRATE.'); }
                        else showMessage('NO SALVAGE OPS AVAILABLE RIGHT NOW.');
                    }
                }
            },
            // Mirabel, founder of W. MINDUSTRIAL: the call came first (story/scenes/van.js); here she's met in person
            '747': { text: g => g.questState.ambushCleared ? "Nice work up there. Let's move before the news does." : "I've got the lobby and the feeds. Go — and watch your corners, Nine.",
                     buttons: () => ({ accept: null, decline: 'Go' }) },
            'Mirabel': {
                text(g) {
                    const qs = g.questState;
                    if (qs.rewardClaimedContractor) return "For the love of starry heavens. He can't be far. I'll call the moment I hear something.";
                    if (!qs.ambushCleared) return "949. The job is at the Double Nights, not in my booth. Bring me good news.";
                    return qs.mirabelFavor >= 2
                        ? "949. In the flesh, finally — and in one piece. He escaped?? Starry heavens... No matter. You kept your word, and W. MINDUSTRIAL remembers its friends. The balance, as promised. And when the time comes, bring me that FP-X of yours. My people will make it sing."
                        : "949. In the flesh, finally. He escaped?? Starry heavens... Well. The balance, as promised. Bring me results next time, and W. MINDUSTRIAL might look after that pistol of yours.";
                },
                buttons: g => (g.questState.ambushCleared && !g.questState.rewardClaimedContractor ? { accept: 'Collect' } : { accept: null, decline: 'Leave' }),
                accept(g) {
                    const qs = g.questState;
                    if (qs.ambushCleared && !qs.rewardClaimedContractor) {
                        const pay = 500 - (qs.mirabelDeposit || 0) + (qs.mirabelFavor >= 2 ? 100 : 0);
                        g.currency += pay; qs.rewardClaimedContractor = true; qs.mirabelArmory = true;
                        g.updateUI(); showMessage(`PAYMENT RECEIVED: ${pay} PERSONICS`);
                    }
                }
            },
            'Chef Koda': { text: () => "Kitchen's closed to Freelancers. But if Ren likes you, the Amber's on the house.", buttons: () => ({ accept: null, decline: 'Leave' }) },
            'Valentina': { text: () => "The Enni Cole list is closed tonight, darling. Unless you're somebody.", buttons: () => ({ accept: null, decline: 'Leave' }) },

            // ── By role ──
            '@dancer': {
                text(g, n) {
                    const C = CONFIG.COMPANION;
                    if (n.hired) return `I'm already with you for ${Math.ceil((n.hireTime - g.worldMinutes) / 60)} more hours.`;
                    if (g.contractCount >= C.MAX_CONTRACTS) return `You already have ${C.MAX_CONTRACTS} companions. That's the maximum!`;
                    return `Hi, I'm ${n.name}. Want some company? ${C.DEFAULT_HIRE_COST} personics for ${Math.round(C.DEFAULT_HIRE_DURATION / 60)} hours.`;
                },
                accept(g, n) {                                                         // hire as a companion
                    const C = CONFIG.COMPANION;
                    if (n.hired || g.contractCount >= C.MAX_CONTRACTS) return;
                    if (g.currency >= C.DEFAULT_HIRE_COST) {
                        g.currency -= C.DEFAULT_HIRE_COST; g.hireCompanion(n, g.worldMinutes); g.updateUI();
                        showMessage(`${n.name.toUpperCase()} HIRED FOR ${Math.round(C.DEFAULT_HIRE_DURATION / 60)} HOURS.`);
                    } else showMessage(`INSUFFICIENT FUNDS. ${C.DEFAULT_HIRE_COST} PERSONICS REQUIRED.`);
                }
            },
            '@robot': {
                text: () => "I work 24/7, 366 on leap years. Have you ever stopped to admire the moonrise? What? Backside?? No! Just the regular ol' moon.",
                buttons: () => ({ accept: null, decline: 'Leave' })                    // small talk, nothing to accept
            },
            '@teammate': {
                text(g, n) {
                    if (n.recruited) return ({
                        'Victoria': "Let's cause some chaos, Freelancer.",
                        'Yenna':    "Say the word. The SR-86 is ready.",
                        'Sabrina':  "Still here. Still deadly. You're welcome.",
                        'Max':      "Point me at something and let me shoot it.",
                        'Josh':     "Intel is current. Awaiting orders."
                    })[n.name] || "Ready to roll out.";
                    return ({
                        'Victoria': "Save me from these sad motherfuckers. Let's ride. (Recruit Victoria?)",
                        'Yenna':    "I've been watching the perimeter. Could use a spotter though. (Recruit Yenna?)",
                        'Sabrina':  "You look like you could use someone with actual talent. (Recruit Sabrina?)",
                        'Max':      "I'm bored as hell. You need firepower? Fine. Let's blow something up. (Recruit Max?)",
                        'Josh':     "I have tactical data that may be of use. Shall we proceed? (Recruit Josh?)"
                    })[n.name] || `You need heavy ordinance? Fine. Let's blow something up. (Recruit ${n.name}?)`;
                },
                accept(g, n) { n.recruited = true; showMessage(`${n.name.toUpperCase()} RECRUITED.`); }
            },
            '@spirit':  { text: () => "…the veil is thin here. Can you hear them too?", buttons: () => ({ accept: null, decline: 'Leave' }) },
            '@vip':     { text: () => "Not now. I'm expecting someone far more important.", buttons: () => ({ accept: null, decline: 'Leave' }) },
            '@passing': { text: () => "Evening, Freelancer.", buttons: () => ({ accept: null, decline: 'Leave' }) }   // anyone without lines of their own
        };
        NPC_DIALOGUE['@red_demon_dancer'] = NPC_DIALOGUE['@dancer'];

        /** The dialogue entry for an NPC: by name, then by role (any robot_* role is a robot), then a word in passing. */
        function npcDialogueFor(npc) {
            const role = npc.role || '';
            return NPC_DIALOGUE[npc.name] || NPC_DIALOGUE['@' + role] || (role.includes('robot') ? NPC_DIALOGUE['@robot'] : null) || NPC_DIALOGUE['@passing'];
        }
