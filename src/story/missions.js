        /* =====================================================================
           MISSION SYSTEM
           ---------------------------------------------------------------------
           Manages delivery and bounty missions.
           Delivery: Pick up from Cozy Cafe delivery vehicle → drop at apartment.
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
                this.missionLog = [];
            }

            // Generate a delivery mission
            generateDelivery(game) {
                // Always reference hub map buildings for delivery targets (player may be in cafe interior)
                let buildings = [];
                if (game._hubBuildingsCache) {
                    buildings = game._hubBuildingsCache;
                } else if (game.activeMap && game.activeMap.buildings) {
                    buildings = game.activeMap.buildings;
                }
                
                // Pick apartments as delivery destinations
                const apartments = buildings.filter(b => 
                    (b.type === 'apartment' || b.id === 'apartment_small') && b.id !== 'silver_queen'
                );
                
                // Fallback: use ANY building with a label
                const targets = apartments.length > 0 ? apartments : buildings.filter(b => b.label && b.id !== 'cozy_cafe');
                if (targets.length === 0) return null;

                const target = targets[Math.floor(Math.random() * targets.length)];
                const reward = 120 + Math.floor(Math.random() * 80); // 120-200 PP
                const scrapReward = 2 + Math.floor(Math.random() * 5);

                return {
                    type: MISSION_TYPES.DELIVERY,
                    id: `delivery_${Date.now()}`,
                    title: 'AMBER DELIVERY',
                    description: `Deliver package to ${target.label || 'Apartments'}`,
                    banner: `DELIVER TO: ${(target.label || 'APARTMENTS').toUpperCase()}`,
                    targetX: target.x + (target.w || 100) / 2,
                    targetY: target.y + (target.h || 100) + 30,
                    targetRadius: 100,
                    reward: reward,
                    scrapReward: scrapReward,
                    timeLimit: 180,
                    startTime: null,
                    status: 'available',
                    pickedUp: false,
                };
            }

            // Generate a bounty mission
            generateBounty(game) {
                const names = ['Shadow Fang', 'Neon Viper', 'Ghost Wire', 'Crimson Edge', 'Ash Phantom', 'Null Spike', 'Dread Loop', 'Hex Blade'];
                const name = names[Math.floor(Math.random() * names.length)];
                const reward = 200 + Math.floor(Math.random() * 200);
                const scrapReward = 15 + Math.floor(Math.random() * 11);
                
                // Random spawn location in the city
                const spawnX = 400 + Math.random() * 3200;
                const spawnY = 400 + Math.random() * 7600;

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
                this.activeMission = mission;
                showMessage(`MISSION ACCEPTED: ${mission.title}`);
                if (game.ui && game.ui.showMissionBanner) {
                    game.ui.showMissionBanner(mission.banner, 'new');
                }
                audioSys.sfx('ui');

                // Bounty targets are spawned via spawnBountyTarget() when on hub map
                // If already on hub map, spawn immediately
                if (mission.type === MISSION_TYPES.BOUNTY && game.activeMap && game.activeMap.id === 'hub_949') {
                    this.spawnBountyTarget(game);
                }
                
                // Salvage guards spawn on hub map
                if (mission.type === MISSION_TYPES.SALVAGE && game.activeMap && game.activeMap.id === 'hub_949') {
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
                
                // Try to find a valid road-adjacent position
                if (game.activeMap.buildings && game.activeMap.buildings.length > 0) {
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
                const weaponId = bountyWeapons[Math.floor(Math.random() * bountyWeapons.length)];
                
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

            checkCompletion(game) {
                if (!this.activeMission || this.activeMission.status !== 'active') return;
                const m = this.activeMission;

                if (m.type === MISSION_TYPES.DELIVERY) {
                    if (!m.pickedUp) {
                        // Guidance: show message periodically if player isn't near vehicle
                        if (!m._guidanceShown && game.activeMap.id === 'hub_949') {
                            m._guidanceShown = true;
                            showMessage('HEAD TO THE AMBER DELIVERY VEHICLE NEAR COZY CAFE.');
                        }
                    } else {
                        // Check if near delivery target
                        const dist = Math.hypot(game.player.x - m.targetX, game.player.y - m.targetY);
                        
                        // Spawn a recipient NPC when player gets close
                        if (dist < 200 && !m._recipientSpawned && game.activeMap.id === 'hub_949') {
                            m._recipientSpawned = true;
                            const recipient = new NPC(m.targetX, m.targetY - 20, 'Resident');
                            recipient.isDeliveryRecipient = true;
                            game.npcs.push(recipient);
                            recipient.active = true;
                            recipient.reregister();
                            m._recipientEntity = recipient;
                        }
                        
                        if (dist < m.targetRadius) {
                            this.completeMission(game);
                            // Clean up recipient
                            if (m._recipientEntity) {
                                const idx = game.npcs.indexOf(m._recipientEntity);
                                if (idx > -1) game.npcs.splice(idx, 1);
                                m._recipientEntity.destroy();
                            }
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
                game.currency += m.reward;
                if (game.resonance) game.earnResonance(100, 'MISSION');
                game.scrap += (m.scrapReward || 0);
                this.completedCount++;
                if (m.type === MISSION_TYPES.BOUNTY) this.completedBounties++;
                this.missionLog.push({ id: m.id, title: m.title, reward: m.reward });
                game.updateUI();
                showMessage(`MISSION COMPLETE: +${m.reward} PERSONICS, +${m.scrapReward || 0} SCRAP`);
                if (game.ui && game.ui.showMissionBanner) {
                    game.ui.showMissionBanner(m.banner || m.title, 'gold', 'COMPLETED');
                }
                audioSys.sfx('ui');
                
                // Anavia unlock notification
                if (m.type === MISSION_TYPES.BOUNTY && this.completedBounties === 5) {
                    game.addPausableTimeout(() => showMessage('ANAVIA HAS NOTICED YOUR WORK. VISIT HER.'), 2000);
                }
                
                this.activeMission = null;
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
                    missionLog: this.missionLog.slice(-20),
                    activeMission: this.activeMission ? { ...this.activeMission, targetEntity: null, _guardEntities: null, _crateEntity: null } : null
                };
            }

            deserialize(data) {
                if (data) {
                    this.completedCount = data.completedCount || 0;
                    this.completedBounties = data.completedBounties || 0;
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
        ];

