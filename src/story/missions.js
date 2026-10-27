        /* =====================================================================
           MISSION SYSTEM
           ---------------------------------------------------------------------
           Manages delivery and bounty missions.
           Delivery: Pick up from Cozy Cafe delivery vehicle (or have it handed to
           her: Ren's follow-ups, Amber Delivery orders) → walk it to the resident
           at the apartment's door.
           Bounty: Accept at Club or Cafe → hunt target in city.
           ===================================================================== */
        const MISSION_TYPES = {
            DELIVERY: 'delivery',
            BOUNTY: 'bounty',
            SALVAGE: 'salvage'
        };

        class MissionSystem {
            constructor() {
                this.activeMission = null;
                this.completedCount = 0;
                this.completedBounties = 0;
                this.completedDeliveries = 0;
                this.amber = MissionSystem.freshAmber();
                this.missionLog = [];
                this._recipients = [];          // residents out on their doorstep (tickRecipients)
            }

            /** Amber Delivery, the app (ui/amber-app.js): unlocked after five runs for Ren */
            static freshAmber() {
                return { unlocked: false, online: false, premium: false, runs: 0, tips: 0, earned: 0, stars: [], orders: [], ordersAt: null, lastTip: null };
            }

            /** The city's buildings, from wherever she is (the hub's, cached, while she's inside) */
            _hubBuildings(game) {
                if (game._hubBuildingsCache) return game._hubBuildingsCache;
                return (game.activeMap && game.activeMap.id === 'sdc' && game.activeMap.buildings) || [];
            }

            /**
             * A delivery. opts: { source: 'ren' | 'brief' | 'amber' (who it came from), handed: true (the package is
             * already in her hands, brought to her by Amber's courier: no trip to the van), from: {x, y} (where she
             * is, for the pay and the time it should take), express: true (Amber Premium's rush order) }
             */
            generateDelivery(game, opts = {}) {
                const buildings = this._hubBuildings(game);
                // Pick apartments as delivery destinations
                const apartments = buildings.filter(b => 
                    (b.type === 'apartment' || b.id === 'apartment_small') && b.id !== 'silver_queen'
                );
                
                // Fallback: use ANY building with a label
                let targets = apartments.length > 0 ? apartments : buildings.filter(b => b.label && b.id !== 'cozy_cafe');
                if (targets.length === 0) return null;
                // Not on her doorstep: somewhere worth the drive
                const from = opts.from;
                if (from) { const far = targets.filter(b => Math.hypot(b.x + (b.w || 100) / 2 - from.x, b.y + (b.h || 100) - from.y) > 900); if (far.length) targets = far; }

                const target = targets[Math.floor(Math.random() * targets.length)];
                const tx = target.x + (target.w || 100) / 2, ty = target.y + (target.h || 100) + 30;
                const km = from ? Math.hypot(tx - from.x, ty - from.y) : 2500;
                let reward = 120 + Math.floor(Math.random() * 80); // 120-200 PP
                if (opts.source === 'amber') reward = 70 + Math.round(km / 90 + Math.random() * 25);    // ~125 across town, ~200 corner to corner: under a bounty
                if (opts.express) reward = Math.round(reward * 1.5);
                const scrapReward = 2 + Math.floor(Math.random() * 5);
                // A street address, so two orders to apartments read apart: the nearest street, a number along it
                const city = game._hubCache && game._hubCache.cityLayout;
                let road = null, off = Infinity, along = 0;
                for (const r of (city && city.horizontalRoads) || []) { const d = Math.abs(r.centerY - ty); if (d < off) { off = d; road = r; along = tx; } }
                for (const r of (city && city.verticalRoads) || []) { const d = Math.abs(r.centerX - tx); if (d < off) { off = d; road = r; along = ty; } }
                const place = road ? `${Math.max(1, Math.round(along / 24)) * 2 + (Math.round(tx + ty) % 2)} ${road.name}` : (target.label || 'Apartments');

                return {
                    type: MISSION_TYPES.DELIVERY,
                    id: `delivery_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
                    title: opts.express ? 'AMBER EXPRESS' : 'AMBER DELIVERY',
                    description: `Deliver package to ${target.label || 'Apartments'}, ${place}`,
                    banner: `DELIVER TO: ${place.toUpperCase()}`,
                    targetLabel: place,
                    targetKind: target.label || 'Apartments',
                    targetX: tx,
                    targetY: ty,
                    targetRadius: 100,
                    reward: reward,
                    scrapReward: scrapReward,
                    timeLimit: 180,
                    startTime: null,
                    status: 'available',
                    pickedUp: false,
                    source: opts.source || 'ren',
                    handed: !!opts.handed,
                    express: !!opts.express,
                    km: Math.round(km),
                    // How long it should take, in world minutes (1 = 2 real seconds): the tip rides on it
                    etaMin: Math.round((4 + km / 320) * (opts.express ? 0.75 : 1)),
                    condition: 100,                              // knocks in the car bruise the box (knock)
                };
            }

            // Generate a bounty mission
            generateBounty(game) {
                const names = ['Shadow Fang', 'Neon Viper', 'Ghost Wire', 'Crimson Edge', 'Ash Phantom', 'Null Spike', 'Dread Loop', 'Hex Blade'];
                const name = names[Math.floor(Math.random() * names.length)];
                const reward = 200 + Math.floor(Math.random() * 200);
                const scrapReward = 15 + Math.floor(Math.random() * 11);
                
                // Where the mark hangs about: in front of one of the city's buildings, chosen now so the
                // Bartender can text the spot (a random point in the city if the buildings aren't known yet)
                const hub = MAP_DATA.sdc;
                let spawnX = 400 + Math.random() * (hub.width - 800);
                let spawnY = 400 + Math.random() * (hub.height - 800), sited = false, near = null;
                const bs = this._hubBuildings(game).filter(b => b.x > 200 && b.y > 200);
                if (bs.length) {
                    const b = bs[Math.floor(Math.random() * bs.length)];
                    spawnX = b.x + (b.w || 100) / 2; spawnY = b.y + (b.h || 100) + 60; sited = true; near = b.label || null;
                }

                return {
                    type: MISSION_TYPES.BOUNTY,
                    id: `bounty_${Date.now()}`,
                    title: `BOUNTY: ${name.toUpperCase()}`,
                    description: `Eliminate or capture ${name}`,
                    banner: `HUNT: ${name.toUpperCase()}`,
                    targetName: name,
                    targetX: spawnX,
                    targetY: spawnY,
                    targetRadius: 100,
                    sited, near,
                    weaponId: ['pistol_fpx', 'rifle_rb98', 'sniper_sr86', 'pistol_anavia', 'sniper_sara'][Math.floor(Math.random() * 5)],   // what they carry (the crew may know)
                    targetEntity: null, // Will be set when spawned
                    reward: reward,
                    scrapReward: scrapReward,
                    status: 'available',
                };
            }

            /**
             * SALVAGE MISSION (Anavia) — Clear hostiles at a location, collect scrap crate.
             * High scrap payout, low PP. 3-5 guards spawn at a random building.
             */
            generateSalvage(game) {
                // Names for salvage ops
                const opNames = ['DARK CACHE', 'BURIED YIELD', 'SCRAP VEIN', 'GHOST FREIGHT', 'DEAD DROP', 'IRON NEST', 'COLD SALVAGE', 'EMBER HAUL'];
                const opName = opNames[Math.floor(Math.random() * opNames.length)];

                const scrapReward = 30 + Math.floor(Math.random() * 21); // 30-50
                const ppReward = 50 + Math.floor(Math.random() * 51);   // 50-100
                const guardCount = 3 + Math.floor(Math.random() * 3);   // 3-5

                // Pick a building on the hub map as the salvage site
                let buildings = [];
                if (game._hubBuildingsCache) {
                    buildings = game._hubBuildingsCache;
                } else if (game.activeMap && game.activeMap.buildings) {
                    buildings = game.activeMap.buildings;
                }

                // Filter for good salvage locations (not the player's apartment or cafes)
                const candidates = buildings.filter(b => 
                    b.label && b.id !== 'cozy_cafe' && b.id !== 'apt_949' && 
                    b.x > 200 && b.y > 200
                );
                if (candidates.length === 0) return null;

                const site = candidates[Math.floor(Math.random() * candidates.length)];
                const siteX = site.x + (site.w || 100) / 2;
                const siteY = site.y + (site.h || 100) + 40;

                return {
                    type: MISSION_TYPES.SALVAGE,
                    id: `salvage_${Date.now()}`,
                    title: `SALVAGE: ${opName}`,
                    description: `Clear hostiles near ${site.label || 'the site'} and collect the scrap crate.`,
                    banner: `SALVAGE: ${opName}`,
                    targetX: siteX,
                    targetY: siteY,
                    targetRadius: 150,
                    reward: ppReward,
                    scrapReward: scrapReward,
                    guardCount: guardCount,
                    guardsSpawned: false,
                    guardsAlive: 0,
                    crateSpawned: false,
                    crateCollected: false,
                    status: 'available',
                };
            }

            /**
             * Spawn salvage guards at the mission target location.
             */
            spawnSalvageGuards(game) {
                const m = this.activeMission;
                if (!m || m.type !== MISSION_TYPES.SALVAGE || m.guardsSpawned) return;
                
                m.guardsSpawned = true;
                m.guardsAlive = m.guardCount;
                m._guardEntities = [];
                
                // Weapon pool for salvage guards — tougher than street gangers
                const guardWeapons = ['pistol_fpx', 'rifle_rb98', 'sniper_sr86', 'pistol_anavia'];
                
                for (let i = 0; i < m.guardCount; i++) {
                    // Scatter guards around the site
                    const angle = (i / m.guardCount) * Math.PI * 2;
                    const dist = 40 + Math.random() * 60;
                    const gx = m.targetX + Math.cos(angle) * dist;
                    const gy = m.targetY + Math.sin(angle) * dist;
                    
                    const weaponId = guardWeapons[Math.floor(Math.random() * guardWeapons.length)];
                    const guard = new Ganger(gx, gy, {
                        hp: 120 + Math.floor(Math.random() * 60),
                        visionRange: 350,
                        weaponId: weaponId
                    });
                    guard.name = `Salvage Guard`;
                    guard.isSalvageGuard = true;
                    guard.missionId = m.id;
                    guard.state = 'IDLE';
                    game.enemies.push(guard);
                    guard.active = true;
                    guard.reregister();
                    m._guardEntities.push(guard);
                }
            }

            acceptMission(mission, game) {
                if (this.activeMission) {
                    showMessage('COMPLETE OR ABANDON CURRENT MISSION FIRST.');
                    return false;
                }
                mission.status = 'active';
                mission.startTime = game.worldMinutes;
                if (mission.type === MISSION_TYPES.DELIVERY && mission.handed) mission.pickedUp = true;   // Amber's courier brought it to her
                this.activeMission = mission;
                showMessage(`MISSION ACCEPTED: ${mission.title}`);
                if (game.ui && game.ui.showMissionBanner) {
                    game.ui.showMissionBanner(mission.banner, 'new');
                }
                audioSys.sfx('ui');

                // Bounty targets are spawned via spawnBountyTarget() when on hub map
                // If already on hub map, spawn immediately
                if (mission.type === MISSION_TYPES.BOUNTY && game.activeMap && game.activeMap.id === 'sdc') {
                    this.spawnBountyTarget(game);
                }
                
                // Salvage guards spawn on hub map
                if (mission.type === MISSION_TYPES.SALVAGE && game.activeMap && game.activeMap.id === 'sdc') {
                    this.spawnSalvageGuards(game);
                }
                return true;
            }

            // Spawn the bounty target ganger on the hub map
            spawnBountyTarget(game) {
                const m = this.activeMission;
                if (!m || m.type !== MISSION_TYPES.BOUNTY || m.targetEntity) return;
                
                // Use pavement/road positions — pick a spot near a random building
                let spawnX = m.targetX;
                let spawnY = m.targetY;
                
                // Try to find a valid road-adjacent position (unless it was chosen with the job)
                if (!m.sited && game.activeMap.buildings && game.activeMap.buildings.length > 0) {
                    const buildings = game.activeMap.buildings.filter(b => b.x > 200 && b.y > 200);
                    if (buildings.length > 0) {
                        const b = buildings[Math.floor(Math.random() * buildings.length)];
                        spawnX = b.x + (b.w || 100) / 2;
                        spawnY = b.y + (b.h || 100) + 60; // In front of building
                    }
                }
                
                m.targetX = spawnX;
                m.targetY = spawnY;
                
                // Bounty targets carry better weapons
                const bountyWeapons = ['pistol_fpx', 'rifle_rb98', 'sniper_sr86', 'pistol_anavia', 'sniper_sara'];
                const weaponId = m.weaponId || bountyWeapons[Math.floor(Math.random() * bountyWeapons.length)];
                
                const target = new Ganger(spawnX, spawnY, {
                    hp: 200,
                    visionRange: 450,
                    weaponId: weaponId
                });
                target.name = m.targetName;
                target.isBountyTarget = true;
                target.missionId = m.id;
                target.state = 'IDLE';
                // Push to ENEMIES array so combat AI is active
                game.enemies.push(target);
                target.active = true;
                target.reregister();
                m.targetEntity = target;
            }

            /** The resident at the drop-off: out of the door when she's close, over to her when she walks up with the
             *  box, a word of thanks with it in their hands, then back inside */
            _spawnRecipient(game, m) {
                const doorX = m.targetX, doorY = m.targetY - 26;
                const npc = new NPC(doorX, doorY, 'Resident');
                npc.isDeliveryRecipient = true;
                npc.facePlayer = true;
                game.npcs.push(npc);
                npc.active = true;
                npc.reregister();
                m._recipientEntity = npc;
                const r = { npc, doorX, doorY, mission: m, phase: 'out', t: 0 };
                this._recipients.push(r);
                return r;
            }

            _dropRecipient(game, r) {
                const i = game.npcs.indexOf(r.npc);
                if (i > -1) game.npcs.splice(i, 1);
                if (r.npc.destroy) r.npc.destroy();
                if (r.mission && r.mission._recipientEntity === r.npc) r.mission._recipientEntity = null;
            }

            /** Every tick: walk the residents (round whatever's in the way, on the city's nav grid; they never stray
             *  far from their door) */
            tickRecipients(game) {
                if (!this._recipients.length) return;
                const p = game.player, step = (r, x, y, v) => {
                    const dx = x - r.npc.x, dy = y - r.npc.y, d = Math.hypot(dx, dy);
                    if (d < 1) return true;
                    const s = typeof actorSteer === 'function' ? actorSteer(r.npc, x, y, v, game.activeMap) : { x: dx * Math.min(1, v / d), y: dy * Math.min(1, v / d) };
                    r.npc.x += s.x; r.npc.y += s.y;
                    return d <= v || (Math.abs(s.x) + Math.abs(s.y) < 1e-3 && d < 24);
                };
                for (let i = this._recipients.length - 1; i >= 0; i--) {
                    const r = this._recipients[i];
                    if (!game.npcs.includes(r.npc)) { if (r.mission && r.mission._recipientEntity === r.npc) r.mission._recipientEntity = null; this._recipients.splice(i, 1); continue; }
                    r.t++;
                    if (r.phase === 'out') {
                        if (this.activeMission !== r.mission || r.mission.status !== 'active') { r.phase = 'in'; continue; }
                        // Over to her while she's on foot and near; otherwise a step out of the door, waiting
                        const onFoot = !game.isDriving && !p.inCar, dd = Math.hypot(p.x - r.doorX, p.y - r.doorY);
                        if (onFoot && dd < 200) {
                            const a = Math.atan2(p.y - r.doorY, p.x - r.doorX), reach = Math.min(70, Math.max(0, dd - 30));
                            step(r, r.doorX + Math.cos(a) * reach, r.doorY + Math.sin(a) * reach, 1.4);
                        } else step(r, r.doorX, r.doorY + 14, 1.2);
                    } else if (r.phase === 'thanks') {
                        if (r.t > 70) { r.phase = 'in'; r.t = 0; r.npc.facePlayer = false; }
                    } else if (step(r, r.doorX, r.doorY - 6, 1.3) || r.t > 240) {
                        this._dropRecipient(game, r); this._recipients.splice(i, 1);
                    }
                }
            }

            /** The car she's carrying the package in took a knock (TrafficVehicle.onImpact): the box feels it */
            knock(strength) {
                const m = this.activeMission;
                if (!m || m.type !== MISSION_TYPES.DELIVERY || !m.pickedUp || strength < 1.2) return;
                const was = m.condition;
                m.condition = Math.max(0, Math.round(m.condition - Math.min(30, (strength - 1) * 6)));
                if (was >= 70 && m.condition < 70) showMessage('CAREFUL — THE PACKAGE IS TAKING A BEATING.');
            }

            /** What the drop-off is worth on top of the pay, for an Amber Delivery order: { tip, stars, onTime }.
             *  The tip rides on time against the order's estimate and the box's condition; Premium lifts it half again. */
            _tipFor(m, game) {
                const took = Math.max(0, (game.worldMinutes || 0) - (m.startTime || 0)), eta = Math.max(1, m.etaMin || 6);
                const onTime = took <= eta;
                const pace = onTime ? 1 : Math.max(0.2, 1 - (took - eta) / eta);
                const care = Math.max(0, (m.condition == null ? 100 : m.condition) / 100);
                let tip = Math.round(m.reward * 0.3 * pace * (0.25 + 0.75 * care) * (0.85 + Math.random() * 0.3));
                if (this.amber.premium) tip = Math.round(tip * 1.5);
                const stars = Math.max(1, Math.min(5, Math.round(1 + 4 * (0.5 * pace + 0.5 * care))));
                return { tip, stars, onTime, took };
            }

            checkCompletion(game) {
                this.tickRecipients(game);
                if (!this.activeMission || this.activeMission.status !== 'active') return;
                const m = this.activeMission;

                if (m.type === MISSION_TYPES.DELIVERY) {
                    if (!m.pickedUp) {
                        // Guidance: show message periodically if player isn't near vehicle
                        if (!m._guidanceShown && game.activeMap.id === 'sdc') {
                            m._guidanceShown = true;
                            showMessage('HEAD TO THE AMBER DELIVERY VEHICLE NEAR COZY CAFE.');
                        }
                    } else if (game.activeMap.id === 'sdc') {
                        const dist = Math.hypot(game.player.x - m.targetX, game.player.y - m.targetY);
                        // The resident comes out to meet her as she pulls up
                        let r = m._recipientEntity && this._recipients.find(q => q.npc === m._recipientEntity);
                        if (!r && dist < 320) r = this._spawnRecipient(game, m);
                        // The box goes hand to hand: she has to walk it to them
                        if (dist < m.targetRadius && game.isDriving && !m._walkHint) {
                            m._walkHint = true;
                            showMessage('STEP OUT AND WALK THE PACKAGE TO THE DOOR.');
                        }
                        if (r && !game.isDriving && !game.player.inCar && Math.hypot(game.player.x - r.npc.x, game.player.y - r.npc.y) < 40) {
                            r.phase = 'thanks'; r.t = 0;
                            r.npc.heldParcel = true;
                            r.npc._setQuip(m.condition < 60 ? 'Is it… supposed to rattle?' : ['Thank you!', 'Oh, that smells amazing.', 'Right on time. Thanks!', 'You\'re a lifesaver.'][Math.floor(Math.random() * 4)]);
                            audioSys.sfx('ui');
                            this.completeMission(game);
                        }
                    }
                } else if (m.type === MISSION_TYPES.BOUNTY) {
                    // Check if bounty target is dead
                    if (m.targetEntity && (m.targetEntity.dead || m.targetEntity.hp <= 0)) {
                        this.completeMission(game);
                    }
                } else if (m.type === MISSION_TYPES.SALVAGE) {
                    // Phase 1: Check if all guards are dead
                    if (m.guardsSpawned && !m.crateSpawned) {
                        // Count living guards
                        let alive = 0;
                        if (m._guardEntities) {
                            for (const g of m._guardEntities) {
                                if (g && !g.dead && g.hp > 0) alive++;
                            }
                        }
                        m.guardsAlive = alive;
                        
                        if (alive === 0) {
                            // All guards cleared — spawn scrap crate
                            m.crateSpawned = true;
                            showMessage('HOSTILES CLEARED. SCRAP CRATE AVAILABLE.');
                            
                            // Spawn scrap crate as a loot pickup
                            const crate = new Loot(m.targetX, m.targetY, 'salvage_crate');
                            crate.isSalvageCrate = true;
                            crate.missionId = m.id;
                            game.loot.push(crate);
                            m._crateEntity = crate;
                        }
                    }
                    
                    // Phase 2: Check if crate collected (handled in loot pickup code)
                    if (m.crateCollected) {
                        this.completeMission(game);
                    }
                }
            }

            completeMission(game) {
                const m = this.activeMission;
                if (!m) return;
                m.status = 'completed';
                let tip = null;
                if (m.type === MISSION_TYPES.DELIVERY) {
                    this.completedDeliveries++;
                    if (m.source === 'amber') {
                        tip = this._tipFor(m, game);
                        const A = this.amber;
                        A.runs++; A.tips += tip.tip; A.earned += m.reward + tip.tip;
                        A.stars.push(tip.stars); if (A.stars.length > 50) A.stars.shift();
                        A.lastTip = { tip: tip.tip, stars: tip.stars, onTime: tip.onTime, label: m.targetLabel, at: game.worldMinutes };
                        game.currency += tip.tip;
                    }
                }
                game.currency += m.reward;
                if (game.resonance) game.earnResonance(100, 'MISSION');
                game.scrap += (m.scrapReward || 0);
                this.completedCount++;
                if (m.type === MISSION_TYPES.BOUNTY) this.completedBounties++;
                this.missionLog.push({ id: m.id, title: m.title, reward: m.reward });
                game.updateUI();
                showMessage(tip ? `DELIVERED · +${m.reward} PP · TIP +${tip.tip} PP · ${'★'.repeat(tip.stars)}${'☆'.repeat(5 - tip.stars)}`
                    : `MISSION COMPLETE: +${m.reward} PERSONICS, +${m.scrapReward || 0} SCRAP`);
                if (game.ui && game.ui.showMissionBanner) {
                    game.ui.showMissionBanner(m.banner || m.title, 'gold', 'COMPLETED');
                }
                audioSys.sfx('ui');
                
                // Anavia unlock notification
                if (m.type === MISSION_TYPES.BOUNTY && this.completedBounties === 5) {
                    game.addPausableTimeout(() => showMessage('ANAVIA HAS NOTICED YOUR WORK. VISIT HER.'), 2000);
                }
                // The crew's take on it, in the group chat (ui/messages.js)
                if (typeof phoneSystem !== 'undefined' && phoneSystem.crewBanter) phoneSystem.crewBanter(m, game);
                
                this.activeMission = null;
                // Ren asks if she's up for another, or (five in) points her to the app (ui/amber-app.js)
                if (m.type === MISSION_TYPES.DELIVERY && typeof phoneSystem !== 'undefined' && phoneSystem.afterDelivery) phoneSystem.afterDelivery(m, game, tip);
            }

            abandonMission() {
                if (!this.activeMission) return;
                const title = this.activeMission.banner || this.activeMission.title;
                showMessage(`MISSION ABANDONED: ${this.activeMission.title}`);
                if (game.ui && game.ui.showMissionBanner) {
                    game.ui.showMissionBanner(title, 'red', 'FAILED');
                }
                this.activeMission.status = 'failed';
                this.activeMission = null;
                audioSys.sfx('ui');
            }

            /** The objective readout's two lines (#ui-objective, engine/markers.js): the job's title, the step she's on */
            getObjectiveParts() {
                const m = this.activeMission;
                if (!m) return null;
                if (m.type === MISSION_TYPES.DELIVERY) {
                    const g = typeof game !== 'undefined' ? game : null;
                    const there = m.pickedUp && g && g.player && Math.hypot(g.player.x - m.targetX, g.player.y - m.targetY) < m.targetRadius * 1.6;
                    const step = !m.pickedUp ? 'Pick up the package at Cozy Cafe'
                        : there ? (g.isDriving ? 'Step out and walk it to the door' : 'Hand it to the resident')
                        : `Deliver to ${m.targetLabel || 'the apartments'}`;
                    return { title: m.express ? 'Amber express' : 'Amber delivery', step };
                }
                if (m.type === MISSION_TYPES.BOUNTY) return { title: `Bounty · ${m.targetName || 'the mark'}`, step: 'Find them and take them down' };
                if (m.type === MISSION_TYPES.SALVAGE) {
                    const step = !m.guardsSpawned ? 'Head to the site' : m.guardsAlive > 0 ? `Clear the hostiles · ${m.guardsAlive} left`
                        : !m.crateCollected ? 'Collect the scrap crate' : 'Done';
                    return { title: m.title.replace(/^SALVAGE: /, 'Salvage · '), step };
                }
                return { title: m.title || 'Job', step: m.banner || '' };
            }

            getObjectiveText() {
                if (!this.activeMission) return null;
                const m = this.activeMission;
                if (m.type === MISSION_TYPES.DELIVERY) {
                    if (!m.pickedUp) {
                        return 'PICK UP PACKAGE FROM AMBER DELIVERY VEHICLE (NEAR COZY CAFE)';
                    }
                    return `${m.banner} — APPROACH THE BUILDING`;
                }
                if (m.type === MISSION_TYPES.BOUNTY) {
                    return `${m.banner} — ELIMINATE TARGET`;
                }
                if (m.type === MISSION_TYPES.SALVAGE) {
                    if (!m.guardsSpawned) return `${m.banner} — HEAD TO THE SITE`;
                    if (m.guardsAlive > 0) return `${m.banner} — CLEAR HOSTILES (${m.guardsAlive} LEFT)`;
                    if (!m.crateCollected) return `${m.banner} — COLLECT SCRAP CRATE`;
                    return `${m.banner} — COMPLETE`;
                }
                return m.banner;
            }

            serialize() {
                return {
                    completedCount: this.completedCount,
                    completedBounties: this.completedBounties,
                    completedDeliveries: this.completedDeliveries,
                    amber: { ...this.amber, orders: [] },
                    missionLog: this.missionLog.slice(-20),
                    activeMission: this.activeMission ? { ...this.activeMission, targetEntity: null, _guardEntities: null, _crateEntity: null, _recipientEntity: null } : null
                };
            }

            deserialize(data) {
                if (data) {
                    this.completedCount = data.completedCount || 0;
                    this.completedBounties = data.completedBounties || 0;
                    this.completedDeliveries = data.completedDeliveries || 0;
                    this.amber = Object.assign(MissionSystem.freshAmber(), data.amber || {}, { orders: [], ordersAt: null });
                    this.missionLog = data.missionLog || [];
                    // Active missions don't persist across saves (complex entity refs)
                    this.activeMission = null;
                }
            }
        }

        /* =====================================================================
           CRAFTING SCHEMATICS
           ===================================================================== */
        const SCHEMATICS = [
            {
                id: 'laser_sight',        // Must match ITEM_REGISTRY key
                name: 'LASER SIGHT',
                icon: '⊕',
                desc: 'Projects a faint red targeting beam. Helps visualize aim direction.',
                scrapCost: 150,
            },
            {
                id: 'golden_child',
                name: 'GOLDEN CHILD',
                icon: '✦',
                desc: 'Golden orbs that stick to enemies and burn away. Attrition warfare.',
                scrapCost: 500,
            },
            {
                id: 'mirror_blade',
                name: 'MIRROR BLADE',
                icon: '◈',
                desc: 'Polish the edge to a mirror. Bullets your blade meets mid-cut fly back at the shooter.',
                scrapCost: 200,
            },
            {
                id: 'blood_muzzle',
                name: 'BLOODTHIRSTY MUZZLE',
                icon: '♆',
                desc: 'A crimson muzzle brake. Every bullet hits 75% harder.',
                scrapCost: 275,
            },
            {
                id: 'crimson_edge',
                name: 'CRIMSON EDGE',
                icon: '❖',
                desc: 'Whet the blade blood-red. Cuts land 50% harder and wounds bleed up to five deep.',
                scrapCost: 300,
            },
            {
                id: 'acc_mirror_glass',
                cosmetic: true,           // a COSMETICS_REGISTRY accessory, not an item: it's worn, and takes no attachment slot
                requires: 'acc_glass',    // silvered from the Crystal Glass
                name: 'MIRRORED GLASS',
                icon: '◎',
                desc: 'Silver the Crystal Glass. All damage +35%, and it turns up to 90 damage of shots back before it recharges (3 s).',
                scrapCost: 650,
            },
        ];

