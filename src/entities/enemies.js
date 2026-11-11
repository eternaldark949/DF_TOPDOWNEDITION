        const {VELVET_CAT_PALETTES,VELVET_T,VELVET_PROFILES,VELVET_GAITS,VELVET_TAIL_SEGS}=DFNative;
        class VelvetCat extends ActorEntity {
            constructor(x, y) {
                super({
                    x, y,
                    radius: 8,
                    type: 'companion',
                    alliance: 'friendly',
                    hp: 999999,
                    mass: 3,
                    friction: 0.85,
                    speed: 4.5,
                    hasCollision: true,
                    invincibleDuration: 999
                });
                this.name = 'Velvet';
                this.state = 'idle';       // idle / following; explicit sitting / sleeping poses also supported
                this.inCar = false;
                this.visible = true;
                this.coatPalette = 'default'; // Reserved for future customization.

                // Animation
                this.walkPhase = 0;
                this.tailPhase = Math.random() * Math.PI * 2;
                this._randomSeed = (this.tailPhase * 1e8) | 0 || 1;
                this.idleTimer = 0;
                this.idleBehavior = null;   // sit, groom, look, sleep, loaf, stretch
                this._behaviorFor = 360;
                this.animationSpeed = 0;
                this._moveSpeed = 0;
                this._dash = false;         // a sprint to catch up, held until she's close again
                this.angle = 0;

                // Body: spine bend into turns, gait blend (0 walk .. 2 gallop; not `_gait`, which marks a humanoid for
                // RenderInterp), pose weights eased in update()
                this._bend = 0;
                this._gaitMix = 0;
                this._poses = { sit: 0, loaf: 0, sleep: 0, stretch: 0, groom: 0 };
                this._curlSide = this._random() < 0.5 ? -1 : 1;
                this._breath = 0;
                // Tail: relative segment angles and their spring velocities; lift foreshortens a raised tail
                this._tail = new Array(VELVET_TAIL_SEGS).fill(0);
                this._tailVel = new Array(VELVET_TAIL_SEGS).fill(0);
                this._tailLift = 0.4;
                this._flick = 0;
                // Head, ears, eyes
                this._headYaw = 0;
                this._lookYaw = 0;
                this._lookTimer = 0;
                this._ears = [0, 0];        // swivel out/back (+) per side [-1, +1]
                this._earVel = [0, 0];
                this._blink = 0;            // 0 open .. 1 shut
                this._blinkT = -1;          // progress through a blink, -1 when none
                this._blinkLen = 10;
                this._blinkWait = 120;
                this._pupil = 0.5;          // slit .. round
                this._groomPhase = 0;

                // Wander offset for natural following
                this._wanderAngle = 0;
                this._wanderTimer = 0;
            }

            // Cosmetic choices must not change the traffic / loot simulation's RNG stream.
            _random(...args){return DFNative.velvetCatAppearance._random.apply(this,args);}

            /** The rest pose asked for: an explicit state wins over an idle behaviour. */
            _restBehavior(...args){return DFNative.velvetCatAppearance._restBehavior.apply(this,args);}

            /** A car (CollisionSystem's people-vs-cars pass has put her just outside it): she leaps clear of it */
            hitByCar(car, contact, speed) {
                if (speed < 0.5) return;
                const f = Math.min(9, 3 + speed * 0.6);
                this._leap = { vx: contact.nx * f, vy: contact.ny * f, t: 10 };
                this.state = 'following'; this.idleBehavior = null; this.idleTimer = 0;
            }

            update(player, dt = 1, map = null, adopted = true) {
                if (!this.visible || this.inCar) return;
                dt = Number.isFinite(dt) ? Math.max(0, Math.min(3, dt)) : 1;
                if (!dt) return;
                if (this._leap && this._leap.t > 0) {   // mid-leap (hitByCar): carried clear, then back to herself
                    const L = this._leap, nav = map ? NavGrid.for(map) : null, nx = this.x + L.vx * dt, ny = this.y + L.vy * dt;
                    if (!nav || nav.walkable(nx, ny)) { this.x = nx; this.y = ny; }
                    L.vx *= 0.8; L.vy *= 0.8; L.t -= dt; this.angle = Math.atan2(L.vy, L.vx); this.walkPhase += 0.6 * dt;
                    return;
                }
                const nav = map ? NavGrid.for(map) : null;
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                const prevAngle = this.angle;
                this._wanderTimer += dt;
                if (this._wanderTimer > 180) {
                    this._wanderAngle += (this._random() - 0.5) * 0.7;
                    this._wanderTimer = 0;
                }
                // Keep a stable flank behind the player, rather than orbiting their feet.
                const facing = player.angle || 0, flank = 22 + Math.sin(this._wanderAngle) * 12;
                let gx = player.x - Math.cos(facing) * 60 - Math.sin(facing) * flank;
                let gy = player.y - Math.sin(facing) * 60 + Math.cos(facing) * flank;
                if (nav && !nav.walkable(gx, gy)) {
                    const i = nav.nearestFree(gx, gy);
                    if (i !== null) { gx = nav.cx(i); gy = nav.cy(i); }
                    else { gx = player.x; gy = player.y; }
                }
                const gap = Math.hypot(gx - this.x, gy - this.y);
                // Hysteresis gives her time to settle; a departing player always interrupts rest.
                const follow = adopted && (dist > 125 || gap > (this.state === 'following' ? 16 : 55));
                let moved = 0, blocked = false;
                if (follow) {
                    const wp = navWaypoint(this, gx, gy, map);
                    blocked = !!wp.blocked;
                    const det = detourAroundPlayer(this, wp.x, wp.y, player);
                    const useDet = !wp.blocked && (!nav || (nav.walkable(det.x, det.y) && nav.lineWalkable(this.x, this.y, det.x, det.y)));
                    const tx = useDet ? det.x : wp.x, ty = useDet ? det.y : wp.y;
                    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
                    const desired = Math.atan2(dy, dx);
                    const turn = Math.atan2(Math.sin(desired - this.angle), Math.cos(desired - this.angle));
                    // A cat doesn't jog: she ambles, trots to keep pace, and sprints in a burst when left behind.
                    if (dist > 210) this._dash = true; else if (dist < 105) this._dash = false;
                    const top = this._dash ? 6.5 : dist > 120 ? 4.1 : 2.3;
                    const turnRate = (top > 5 ? 0.17 : 0.13) * dt;
                    if (!wp.blocked && d > 0.5) this.angle += Math.max(-turnRate, Math.min(turnRate, turn));
                    const error = Math.atan2(Math.sin(desired - this.angle), Math.cos(desired - this.angle));
                    const targetSpeed = wp.blocked || d < 0.5 || Math.abs(error) > 0.9 ? 0
                        : Math.min(top, wp.finalLeg ? d * 0.16 : d / dt) * Math.max(0.35, Math.cos(error));
                    const change = (targetSpeed > (this._moveSpeed || 0) ? (this._dash ? 0.32 : 0.18) : 0.38) * dt;
                    this._moveSpeed = Math.max(0, (this._moveSpeed || 0) + Math.max(-change, Math.min(change, targetSpeed - (this._moveSpeed || 0))));
                    const step = targetSpeed ? Math.min(this._moveSpeed * dt, d) : 0;
                    const vx = Math.cos(this.angle) * step, vy = Math.sin(this.angle) * step;
                    if (step && (!nav || nav.lineWalkable(this.x, this.y, this.x + vx, this.y + vy))) {
                        this.x += vx; this.y += vy; moved = step;
                    } else if (step) {
                        // Turn toward the clear path at a tight corner before taking another step.
                        this._moveSpeed = 0;
                        this.angle += Math.max(-turnRate, Math.min(turnRate, error));
                    }
                    this.state = 'following';
                    this.idleBehavior = null; this.idleTimer = 0;
                } else {
                    this._moveSpeed = 0; this._navPath = null; this._dash = false;
                    this.state = 'idle'; this.idleTimer += dt;
                    if (this.idleTimer > 150 && !this.idleBehavior) {
                        const roll = this._random();
                        this.idleBehavior = roll < 0.28 ? 'sit' : roll < 0.48 ? 'groom' : roll < 0.62 ? 'look'
                            : roll < 0.78 ? 'loaf' : roll < 0.9 ? 'sleep' : 'stretch';
                        this._behaviorFor = this.idleBehavior === 'sleep' ? 1500 : this.idleBehavior === 'loaf' ? 900
                            : this.idleBehavior === 'stretch' ? 260 : 540;
                        this._curlSide = this._random() < 0.5 ? -1 : 1;
                    }
                    // A stretch is brief; she sits down after it.
                    if (this.idleBehavior === 'stretch' && this.idleTimer > this._behaviorFor) { this.idleBehavior = 'sit'; this._behaviorFor = 540; }
                    if (this.idleTimer > Math.max(540, this._behaviorFor || 0)) { this.idleBehavior = null; this.idleTimer = 100; }
                }
                this.animationSpeed = moved / dt;
                this._animate(player, dt, moved, prevAngle, blocked, dist);
            }

            /** Everything cosmetic: gait, spine, tail, head, ears and eyes. Never moves her. */
            _animate(...args){return DFNative.velvetCatAppearance._animate.apply(this,args);}

            /**
             * Eyeshine: in the dark her eyes catch the light, two small violet-silver points drawn after the darkness
             * layer (engine/draw.js) so they read where her coat doesn't. They fade with the dark, close with
             * her lids and are gone while she sleeps. `darkness` is the scene's ambient darkness, 0..1.
             */
            drawEyeShine(...args){return DFNative.velvetCatAppearance.drawEyeShine.apply(this,args);}

            /** The gait's offsets, duty and stride, blended between walk, trot and gallop. */
            _gaitParams(...args){return DFNative.velvetCatAppearance._gaitParams.apply(this,args);}

            draw(...args){return DFNative.velvetCatAppearance.draw.apply(this,args);}
        }

        // (The Double Nights drones: entities/drones.js)

        /* --- TRAFFIC & GANGERS --- */
        /**
         * =====================================================================
         *  GATLING GUNNER (Boss Enemy - extends ActorEntity)
         * =====================================================================
         * Heavy combat enemy with squad formation AI and gatling gun.
         * Now part of the unified collision system.
         * 
         * Features:
         * - Circle collision for prop/wall interactions
         * - HP system (200) with knockback support
         * - Squad formation AI (triangle, pincer, circle strafe)
         * - Gatling fire mechanics (burst, spin-up, reload)
         */
        /* The Sanctum's three (the Triumvirate): the same gatling automaton, each in its own guise.
           A persona switches on boss mode (dormant until the intro, sight-gated fire, a longer telegraph)
           and its own art; the gauntlet's gunners have none and keep the plain look. */
        const WARDENS = GAME_DB.enemies.wardens;   // directory/game-db/enemies.json
        /* How the Triumvirate fights (a persona; times in seconds unless noted):
             HP each; RELOAD frames between bursts, and they stagger them (STAGGER frames apart on waking, and a
             warden whose burst ends while the others reload fires EXTEND more, so all three never go quiet);
             lose her and a burst goes on into her cover for COVER_FIRE; hidden past FLANK_AFTER, one of them
             walks to a firing spot (findShotSpot); a fall makes the others fire faster (enrage).
             Vesper lobs a burning censer over cover (CENSER_EVERY, a WIND tell); Matins sings through walls
             (HYMN_EVERY, a CHARGE tell); Compline throws its chain hook past cover (HOOK_EVERY, a HOOK_TELL),
             within HOOK_RANGE (engine/boss-hazards.js does the rest). */
        const WARDEN = GAME_DB.enemies.warden;

        class GatlingGunner extends ActorEntity {
            constructor(x, y, id, opts = {}) {
                // Initialize ActorEntity with circle collision
                super({
                    x: x,
                    y: y,
                    radius: GAME_DB.enemies.kinds.gatling_gunner.radius,
                    type: 'gatlinggunner',
                    alliance: 'hostile',
                    hp: GAME_DB.enemies.kinds.gatling_gunner.hp,          // Boss-level HP (directory/game-db/enemies.json)
                    mass: GAME_DB.enemies.kinds.gatling_gunner.mass,      // Heavy
                    friction: GAME_DB.enemies.kinds.gatling_gunner.friction,
                    speed: GAME_DB.enemies.kinds.gatling_gunner.speed,
                    hasCollision: true,
                    invincibleDuration: GAME_DB.enemies.kinds.gatling_gunner.invincible_frames
                });
                const K = GAME_DB.enemies.kinds.gatling_gunner;
                
                this.id = id; // Unique ID (0, 1, 2) for squad formation
                this.angle = 0;
                
                // Gatling mechanics
                this.burstCooldown = 0;
                this.burstCount = 0;
                this.maxBurstCount = K.burst_count;
                this.burstDelay = K.burst_delay; 
                this.burstTimer = 0;
                this.reloadTime = K.reload; 
                
                // Movement
                this.moveTimer = 0;
                this.strafeDirection = 1;
                
                // Telegraph (warns before burst starts)
                this.telegraphThreshold = K.telegraph_frames; // ~0.2s window
                this.telegraphAngle = 0;
                this.isTelegraphing = false;
                this._prevPlayerX = 0;
                this._prevPlayerY = 0;

                // Boss mode (the Sanctum, engine/boss-intro.js): spawned kneeling and dark (dormant), woken
                // by the intro; then they hunt her anywhere in their arena but only open fire with a clear
                // line on her (sightGated), after a longer, readable telegraph.
                this.dormant = false;
                this.sightGated = false;
                this._eyeK = 1;           // eyes: 0 dark … 1 burning
                this._riseK = 1;          // 0 kneeling … 1 standing
                this._holdFire = 0;       // frames before the first burst may begin
                this.persona = WARDENS[opts.persona] ? opts.persona : null;
                if (this.persona) {
                    this.radius = 30; this.width = this.height = 60;   // twice her size (she's 15)
                    this.artScale = 1.7;
                    this.sightGated = true;
                    this.telegraphThreshold = 30;                 // ~0.5 s: dodgeable on reaction
                    this.bossName = WARDENS[this.persona].name;
                    this.hp = this.maxHp = WARDEN.HP;
                    this.reloadTime = WARDEN.RELOAD;
                    this._move = { at: 0, tell: null };          // its own move (censer, hymn, hook): next due, wind-up
                }
                this._heat = 0;           // the Wardens' original barrel heat
                // Ordinary gunner visual momentum: advanced by simulation, never by draw().
                this._barrelPhase = 0;
                this._barrelSpeed = 0;
                this._barrelHeat = 0;
            }

            /** Sleep until the intro wakes them (kneeling, eyes dark). */
            makeDormant() { this.dormant = true; this._eyeK = 0; this._riseK = 0; this.burstCooldown = 0; this.burstCount = 0; this.angle = Math.PI / 2; }

            /** Wake: move now, but the first burst waits `hold` frames (and still telegraphs). */
            awaken(hold = 60) {
                this.dormant = false; this._eyeK = 1; this._riseK = 1; this._holdFire = hold;
                if (this.persona) {                                       // staggered: their first bursts (and so their reloads) fall apart
                    this._holdFire += this.id * WARDEN.STAGGER;
                    const every = { vesper: WARDEN.CENSER_EVERY, matins: WARDEN.HYMN_EVERY, compline: WARDEN.HOOK_EVERY }[this.persona];
                    this._move.at = _gameTimeSec + 2 + every * (0.3 + 0.25 * this.id);
                }
            }

            /** A warden falls: the survivors fire faster */
            enrage() {
                this.burstDelay = Math.max(3, this.burstDelay - 1);
                this.reloadTime = Math.max(60, Math.round(this.reloadTime * 0.75));
                this.maxBurstCount += 3;
                this._igniteFlash = 1;
            }

            /**
             * What a warden knows of her this tick: sight (a clear line, and no censer smoke between), the last
             * place it saw her, Matins' reveal; and so where to aim — her, or (cover fire) where she went.
             */
            _wardenSense(px, py) {
                const now = _gameTimeSec, g = typeof game !== 'undefined' ? game : null;
                const sight = this._hasSight(px, py) && !(g && g.smokeBlocks && g.smokeBlocks(this.x, this.y, px, py));
                const revealed = !!(g && g._revealedUntil > now);
                if (sight || revealed) this._seen = { x: px, y: py, t: now };
                const seen = this._seen;
                // a burst in flight keeps going at her cover a moment; revealed, they open on her through it
                const cover = !sight && !!seen && (revealed || (this.burstCount > 0 && now - seen.t < WARDEN.COVER_FIRE));
                const S = this._sense || (this._sense = {});
                S.sight = sight; S.revealed = revealed; S.cover = cover; S.seen = seen;
                S.hiddenFor = seen ? now - seen.t : 0;
                return S;
            }

            /** Hidden too long: one warden (only one) goes to a spot with a line on where she was */
            _wardenFlank(squad, S) {
                const now = _gameTimeSec, map = this.navMap;
                let lead = GatlingGunner._flanker;
                if (lead && (lead.dead || !squad.includes(lead))) lead = GatlingGunner._flanker = null;
                const lastAny = Math.max(...squad.map(w => (w._seen ? w._seen.t : 0)));
                if (now - lastAny < WARDEN.FLANK_AFTER || !S.seen || !map) {
                    if (lead === this) GatlingGunner._flanker = null;
                    this._flankTo = null; return;
                }
                if (!lead) lead = GatlingGunner._flanker = this;
                if (lead !== this) { this._flankTo = null; return; }
                if (!this._flankTo || now > (this._flankAt || 0)) {
                    this._flankAt = now + 1;
                    const spot = findShotSpot(map, this.x, this.y, S.seen.x, S.seen.y, { searchDist: 900, maxDist: 420, minDist: 140, stride: 2, maxChecks: 60,
                        avoid: squad.filter(w => w !== this), spacing: 90 });
                    this._flankTo = spot ? { x: spot.x, y: spot.y } : null;
                }
            }

            /** Its own move, one at a time: a wind-up that reads, then the censer, the hymn or the hook */
            _wardenMove(px, py, S) {
                const g = typeof game !== 'undefined' ? game : null; if (!g || !g.addHazard) return;
                const now = _gameTimeSec, M = this._move, d = Math.hypot(px - this.x, py - this.y);
                if (M.tell) {
                    if (this.persona === 'compline' && (S.sight || S.revealed)) M.tell.a = Math.atan2(py - this.y, px - this.x);   // it tracks her while it winds
                    if (now < M.tell.at) return;
                    const T = M.tell; M.tell = null;
                    if (this.persona === 'vesper') {
                        const to = S.sight || S.revealed ? { x: px, y: py } : S.seen;
                        if (to) g.addHazard({ kind: 'censer', x0: this.x, y0: this.y, x1: to.x, y1: to.y, flight: 0.9, owner: this });
                    } else if (this.persona === 'matins') {
                        g.addHazard({ kind: 'hymn', x: this.x, y: this.y, owner: this });
                        audioSys.sfx('explode');
                    } else if (this.persona === 'compline') {
                        g.addHazard({ kind: 'hook', x: this.x, y: this.y, x0: this.x, y0: this.y, a: T.a, state: 'out', owner: this });
                    }
                    return;
                }
                if (now < M.at || this._holdFire > 0) return;
                if (this.persona === 'vesper') {
                    const to = S.sight || S.revealed ? { x: px, y: py } : S.hiddenFor < 4 ? S.seen : null;
                    if (!to || Math.hypot(to.x - this.x, to.y - this.y) > WARDEN.CENSER_RANGE) return;
                    M.at = now + WARDEN.CENSER_EVERY; M.tell = { at: now + WARDEN.CENSER_WIND, from: now };
                } else if (this.persona === 'matins') {
                    M.at = now + WARDEN.HYMN_EVERY; M.tell = { at: now + WARDEN.HYMN_CHARGE, from: now };
                } else if (this.persona === 'compline') {
                    if (d > WARDEN.HOOK_RANGE || !(S.sight || S.revealed || S.hiddenFor < 2)) return;
                    const to = S.sight || S.revealed ? { x: px, y: py } : S.seen;
                    M.at = now + WARDEN.HOOK_EVERY; M.tell = { at: now + WARDEN.HOOK_TELL, from: now, a: Math.atan2(to.y - this.y, to.x - this.x) };
                }
            }

            /** Has she a clear line from here (walls, props, shut doors)? Checked every few frames. */
            _hasSight(px, py) {
                if ((this._sightTick = (this._sightTick || 0) + 1) % 3 === 1 || this._sight === undefined) {
                    const map = typeof game !== 'undefined' && game ? game.activeMap : null;
                    this._sight = map ? hasShotLine(this.x, this.y, px, py, map) : true;
                }
                return this._sight;
            }

            /** The source-order roster must still match: deaths, inserts and ID changes can happen mid-tick. */
            static _squadFor(allEnemies) {
                const caches = GatlingGunner._squadCaches || (GatlingGunner._squadCaches = new WeakMap());
                const cache = caches.get(allEnemies);
                if (cache) {
                    let i = 0, same = true;
                    for (const enemy of allEnemies) {
                        if (!(enemy instanceof GatlingGunner) || enemy.dead) continue;
                        if (cache.input[i] !== enemy || cache.ids[i] !== enemy.id) { same = false; break; }
                        i++;
                    }
                    if (same && i === cache.input.length) return cache.sorted;
                }
                const input = allEnemies.filter(e => e instanceof GatlingGunner && !e.dead);
                const sorted = input.slice().sort((a, b) => a.id - b.id);
                caches.set(allEnemies, { input, ids: input.map(e => e.id), sorted });
                return sorted;
            }

            /**
             * Override ActorEntity update for squad AI and gatling mechanics.
             */
            update(playerX, playerY, allEnemies, walls) {
                if (this.dead) return null;
                if (this.dormant) {                               // kneeling at the altar until the intro wakes them
                    this._eyeK += ((this._eyeT || 0) - this._eyeK) * 0.15;
                    this._riseK += ((this._riseT || 0) - this._riseK) * 0.08;
                    if (this._igniteFlash) this._igniteFlash *= 0.92;
                    return [];
                }
                if (this._igniteFlash) this._igniteFlash *= 0.92;
                
                // Decrement invincibility
                if (this.invincibleTimer > 0) {
                    this.invincibleTimer--;
                }
                
                // Apply knockback physics
                collisionWorld.carry(this);   // knockback: the body step (basement/collision-kit.js)

                // A warden: what it knows of her, its own move; out of sight, its burst goes on into her cover
                const S = this.persona ? this._wardenSense(playerX, playerY) : null;
                if (S) {
                    this._wardenMove(playerX, playerY, S);
                    if (S.cover && !S.sight && !S.revealed) { playerX = S.seen.x; playerY = S.seen.y; }
                }
                
                const dx = playerX - this.x;
                const dy = playerY - this.y;
                const distToPlayer = Math.hypot(dx, dy);
                this.angle = Math.atan2(dy, dx);
                
                // Estimate player velocity from frame-to-frame delta
                const playerVelX = playerX - this._prevPlayerX;
                const playerVelY = playerY - this._prevPlayerY;
                this._prevPlayerX = playerX;
                this._prevPlayerY = playerY;
                
                // --- SQUAD FORMATION LOGIC ---
                const squad = GatlingGunner._squadFor(allEnemies);
                
                const myIndex = squad.indexOf(this);
                const squadSize = squad.length;
                
                const idealRange = this.persona ? 280 : 240; 
                let moveX = 0;
                let moveY = 0;

                if (squadSize > 1) {
                    // TRIANGLE (3) or PINCER (2)
                    const formationSpin = _frameTime / 2000;
                    const angleOffset = (Math.PI * 2) / squadSize;
                    const myTargetAngle = formationSpin + (myIndex * angleOffset);
                    
                    const targetX = playerX + Math.cos(myTargetAngle) * idealRange;
                    const targetY = playerY + Math.sin(myTargetAngle) * idealRange;
                    
                    const tdx = targetX - this.x;
                    const tdy = targetY - this.y;
                    const distToTarget = Math.hypot(tdx, tdy);
                    
                    if (distToTarget > 10) {
                        moveX += (tdx / distToTarget) * 1.5;
                        moveY += (tdy / distToTarget) * 1.5;
                    }
                } else {
                    // SOLO (1) - Circle Strafe Behavior
                    this.moveTimer += 0.02;
                    
                    if (distToPlayer < 180) {
                        moveX -= Math.cos(this.angle) * 2;
                        moveY -= Math.sin(this.angle) * 2;
                    } else if (distToPlayer > 300) {
                        moveX += Math.cos(this.angle) * 2.5;
                        moveY += Math.sin(this.angle) * 2.5;
                    } else {
                        const strafeAngle = this.angle + (Math.PI / 2) * this.strafeDirection;
                        moveX += Math.cos(strafeAngle) * 2;
                        moveY += Math.sin(strafeAngle) * 2;
                    }
                    if (Math.random() < 0.01) this.strafeDirection *= -1;
                }

                // Indoors (the gauntlet house) the formation can't see through walls: with no clear
                // line on her, route round to her instead
                if (this.navMap && (this._losTick = (this._losTick || 0) + 1) % 10 === 1) this._clearLine = hasShotLine(this.x, this.y, playerX, playerY, this.navMap);
                if (this.navMap && !this._clearLine) {
                    const st = actorSteer(this, playerX, playerY, 2, this.navMap);
                    moveX = st.x; moveY = st.y;
                }
                // She's been hidden a while: one warden walks to a firing spot on where she went
                if (S) {
                    this._wardenFlank(squad, S);
                    if (this._flankTo) { const st = actorSteer(this, this._flankTo.x, this._flankTo.y, 2.4, this.navMap); moveX = st.x; moveY = st.y; }
                }

                // SEPARATION FORCE (Prevent Overlap)
                const separationDist = this.persona ? 90 : 60;
                for (let ally of squad) {
                    if (ally === this) continue;
                    const adx = this.x - ally.x;
                    const ady = this.y - ally.y;
                    const dist = Math.hypot(adx, ady);
                    
                    if (dist < separationDist && dist > 0) {
                        const push = (separationDist - dist) / separationDist;
                        moveX += (adx / dist) * push * 3.0;
                        moveY += (ady / dist) * push * 3.0;
                    }
                }

                // Apply Movement
                this.x += moveX;
                this.y += moveY;
                
                // WALL COLLISION & ANTI-CLIPPING
                const r0 = this.radius;
                for (const w of _physicsSpatial.query(walls, { left: this.x - r0, right: this.x + r0, top: this.y - r0, bottom: this.y + r0 }) || []) {
                    if (this.x > w.x - this.radius && this.x < w.x + w.w + this.radius && 
                        this.y > w.y - this.radius && this.y < w.y + w.h + this.radius) {
                        
                        const centerX = w.x + w.w/2;
                        const centerY = w.y + w.h/2;
                        const pushAng = Math.atan2(this.y - centerY, this.x - centerX);
                        this.x += Math.cos(pushAng) * 5;
                        this.y += Math.sin(pushAng) * 5;
                    }
                }
                
                // GATLING FIRE LOGIC
                const shots = [];
                const firingNow = this.burstCount > 0 && this.burstCooldown === 0;
                this._heat = Math.max(0, Math.min(1, this._heat + (firingNow ? 0.05 : -0.012)));
                // Boss mode: no burst begins (or goes on) without a clear line on her, nor in the grace after waking
                if (this._holdFire > 0) this._holdFire--;
                const blind = S ? !(S.sight || S.cover || S.revealed) : this.sightGated && !this._hasSight(playerX, playerY);
                const winding = S && this.persona === 'compline' && this._move.tell;      // the hook takes both its hands
                if (this.sightGated && (this._holdFire > 0 || blind || winding)) {
                    this.isTelegraphing = false;
                    if (this.burstCount > 0) { this.burstCount = 0; this.burstTimer = 0; }
                    this.burstCooldown = Math.max(this.burstCooldown, this.telegraphThreshold + 1);   // it'll telegraph again first
                    this._updateBarrelVisuals();
                    return shots;
                }
                if (this.burstCooldown > 0) {
                    this.burstCooldown--;
                    // Telegraph before burst starts — track with predictive aim
                    if (this.burstCooldown <= this.telegraphThreshold && this.burstCooldown > 0) {
                        this.isTelegraphing = true;
                        const projSpeed = 24;
                        const travelTime = distToPlayer / projSpeed;
                        const predX = playerX + playerVelX * travelTime;
                        const predY = playerY + playerVelY * travelTime;
                        this.telegraphAngle = Math.atan2(predY - this.y, predX - this.x);
                    }
                    if (this.burstCooldown <= 0) this.isTelegraphing = false;
                } else if (this.burstCount < this.maxBurstCount) {
                    this.isTelegraphing = false;
                    this.burstTimer--;
                    if (this.burstTimer <= 0 && this.sightGated && !(S ? S.sight || S.cover || S.revealed : (this._sight = hasShotLine(this.x, this.y, playerX, playerY, game.activeMap)))) {
                        this.burstCount = 0; this.burstTimer = 0; this.burstCooldown = this.telegraphThreshold + 1;   // she slipped behind cover mid-burst
                    } else if (this.burstTimer <= 0) {
                        const spread = (Math.random() - 0.5) * 0.15;
                        const muzzleOffset = this.persona ? 60 : 35; 
                        const mx = this.x + Math.cos(this.angle) * muzzleOffset;
                        const my = this.y + Math.sin(this.angle) * muzzleOffset;

                        shots.push(new ProjectileEntity({ 
                            x: mx, // Use Muzzle X
                            y: my, // Use Muzzle Y
                            angle: this.angle + spread, 
                            isEnemy: true, 
                            color: '#ffaa00',
                            owner: this
                        }));
                        this.burstCount++;
                        this.burstTimer = this.burstDelay;
                    }
                } else if (S && squad.length > 1 && (this._extended || 0) < 2 && squad.every(o => o === this || o.burstCooldown > o.telegraphThreshold)) {
                    this.burstCount -= WARDEN.EXTEND; this._extended = (this._extended || 0) + 1;   // the others are reloading: keep the line hot
                } else {
                    this.burstCooldown = this.reloadTime;
                    this.burstCount = 0;
                    this.burstTimer = 0;
                    this._extended = 0;
                }
                this._updateBarrelVisuals();
                return shots;
            }

            /** Wind up before a burst, retain momentum afterward, and cool back to dark steel. */
            _updateBarrelVisuals() {
                if (this.persona) return; // the Sanctum Wardens retain their authored animation
                const firing = this.burstCount > 0 && this.burstCooldown === 0;
                const lead = Math.max(0, Math.min(1, (36 - this.burstCooldown) / 36));
                const anticipating = this.burstCooldown >= 0 && this.burstCooldown < 36 && this._holdFire <= 0;
                const target = firing ? 0.32 : anticipating ? 0.32 * lead * lead * (3 - 2 * lead) : 0;
                const speed = this._barrelSpeed || 0;
                this._barrelSpeed = target > speed ? Math.min(target, speed + 0.012) : Math.max(target, speed - 0.004);
                this._barrelPhase = ((this._barrelPhase || 0) + this._barrelSpeed) % (Math.PI * 2);
                this._barrelHeat = Math.max(0, Math.min(1, (this._barrelHeat || 0) + (firing ? 0.0185 : -0.007)));
            }

            /** Six parallel barrels. Paint the rear of the cylinder before its near side. */
            _drawBarrels(ctx){return gunnerAppearance._drawBarrels.call(this,ctx);}

            /** Three small shared incandescent strips; cross-fades give a smooth heat ramp. */
            static _getHeatStrips(){return gunnerAppearance._getHeatStrips.call(this);}

            /** Incandescence above ambient darkness, restricted to the heated barrel metal. */
            drawHeat(ctx){return gunnerAppearance.drawHeat.call(this,ctx);}
            
            /**
             * Override onProjectileHit to only take damage from player projectiles.
             */
            onProjectileHit(projectile, game) {
                // Only take damage from player projectiles
                if (projectile.isEnemy) return;
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;   // who gets the Resonance
                const opts = { shot: !projectile.melee, punch: !!projectile.melee, crit: !!projectile.crit };
                
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // GatlingGunners are heavy (mass 25) but sniper can still push them
                    const projMomentum = (projectile.mass || 1) * speed;
                    const damageMultiplier = projectile.damage / 20;
                    const knockbackStrength = Math.min((projMomentum * damageMultiplier) / (this.mass || 25), 35);
                    
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    this.takeDamage(projectile.damage, kbX, kbY, opts);
                } else {
                    this.takeDamage(projectile.damage, 0, 0, opts);
                }
            }

            /**
             * Legacy takeDamage for non-projectile damage.
             */
            takeDamageOld(amount, bulletAngle) {
                const kbX = Math.cos(bulletAngle) * 5;
                const kbY = Math.sin(bulletAngle) * 5;
                this.takeDamage(amount, kbX, kbY);
            }

            draw(ctx){return gunnerAppearance.draw.call(this,ctx);}

            /** The gunner itself (body, head, barrels, muzzle flash), in its own turned frame. */
            _drawGunnerBody(ctx){return gunnerAppearance._drawGunnerBody.call(this,ctx);}

            /** A Sanctum warden: a mantled war automaton in its own guise (WARDENS). Kneeling and dark while
             *  dormant; the eye slit ignites, the halo / chains / censer smoke come alive, and it rises. */
            _drawWarden(ctx){return gunnerAppearance._drawWarden.call(this,ctx);}
        }
        
        class LastKnownMarker {
            constructor(x, y, angle) {
                this.x = x;
                this.y = y;
                this.angle = angle;
                this.active = true;
                this.opacity = 1.0;
                this.fadeSpeed = 0.0; // Only fades when "checked" by enemy
            }

            dismiss() {
                // Triggered when an enemy reaches this spot
                this.fadeSpeed = 0.05; 
            }

            update() {
                if (this.fadeSpeed > 0) {
                    this.opacity -= this.fadeSpeed;
                    if (this.opacity <= 0) this.active = false;
                }
            }

            draw(ctx) {
                if (!this.active) return;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.globalAlpha = this.opacity * 0.6; // Ghostly transparency
                
                // Glowing White Outline
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 15;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                
                // Draw Player Shape Outline
                ctx.beginPath(); 
                ctx.moveTo(-15, -12); 
                ctx.lineTo(5, 0); 
                ctx.lineTo(-15, 12); 
                // Head
                ctx.moveTo(12, 0);
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }

        /* =====================================================================
           GANGER CLASS (STEALTH AI ENEMY - extends ActorEntity)
           ---------------------------------------------------------------------
           Street gang members with sophisticated stealth-game AI.
           Now part of the unified collision system.
           
           STATE MACHINE:
           ┌──────────┐    detect player    ┌────────────┐
           │   IDLE   │ ─────────────────►  │ SUSPICIOUS │
           └──────────┘                     └────────────┘
                 ▲                                 │
                 │ suspicion drains               │ suspicion maxed
                 │                                ▼
           ┌────────────┐   lost sight     ┌─────────┐
           │ SEARCHING  │ ◄───────────────  │  ALERT  │
           └────────────┘                   └─────────┘
                 │                                │
                 │                                │ lost sight briefly
                 ▼                                ▼
           (return to IDLE)              ┌─────────────┐
                                         │ SUPPRESSING │ (fire at last known pos)
                                         └─────────────┘
           
           DETECTION SYSTEM:
           - Vision Cone: 320 range, ~70° FOV
           - Proximity Detection: 50 units (can hear player)
           - Suspicion builds when player visible, drains when hidden
           - Line-of-sight blocked by walls and buildings
           
           COMBAT:
           - Shoots at player when in ALERT state
           - Creates "Last Known Position" marker when losing sight
           - Will suppress (shoot at) last known position
           ===================================================================== */
        class Ganger extends ActorEntity {
            /** Hot pink over dark maroon, readable at a glance (ROLE_LOOKS.ganger, core/appearances.js). */
            static makeLook(r) { return ROLE_LOOKS.ganger(r); }

            constructor(x, y, config) {
                const cfg = config || {}, K = GAME_DB.enemies.kinds.ganger;   // directory/game-db/enemies.json
                super({
                    x: x,
                    y: y,
                    radius: K.radius,
                    type: 'ganger',
                    alliance: 'hostile',
                    hp: cfg.hp || K.hp,
                    mass: K.mass,
                    friction: K.friction,
                    speed: cfg.speed || K.speed,
                    hasCollision: true,
                    invincibleDuration: K.invincible_frames
                });
                
                this.angle = Math.random() * 6.28;
                
                // Animation & Physics properties
                this.velX = 0;
                this.velY = 0;
                this.walkPhase = 0; 

                // AI Properties
                this.visionRange = cfg.visionRange || K.vision_range;
                this.visionFov = Math.PI / 2.5;
                // What they know of what's around them (basement/awareness-kit.js): up close (50) they sense her unless
                // she comes from behind; past that, only what's in the cone, in range and in plain sight. Bumping into him
                // (touch: their bodies, 15 + 15) gives her away whatever the light or the angle
                this.awareness = new awarenessMatrix(this, { evaluation_radius: () => this.visionRange, personal_space: 50, touch: 32, fov: () => this.visionFov, sight: (x, y, walls, buildings) => this._sightClear(x, y, walls, buildings) });
                this.state = 'IDLE';
                this.suspicion = 0;
                this.suspicionDrainDelay = 0;
                this.suppressionTimer = 0;
                
                this.startX = x;
                this.startY = y;
                this.wanderTarget = {x: x, y: y};
                this.wanderTimer = 0;
                this.investigateTarget = null;
                this.cooldown = 0;
                
                // ── TELEGRAPH (aim line before firing) ──
                this.telegraphThreshold = cfg.telegraphThreshold || K.telegraph_frames; // ~0.15s window
                this.telegraphAngle = 0;
                this.isTelegraphing = false;
                
                // ── WEAPON SYSTEM (reads ITEM_REGISTRY) ──
                this.equippedWeaponId = cfg.weaponId || null;
                
                // Cache resolved stats (or use defaults for weaponless gangers)
                this._weaponStats = this._resolveWeaponStats();
            }
            
            /**
             * Resolve weapon stats from ITEM_REGISTRY, with ganger defaults as fallback.
             * Called once on construction — if weapon swapping is added, call again.
             */
            _resolveWeaponStats() {
                if (this.equippedWeaponId && typeof ITEM_REGISTRY !== 'undefined') {
                    const def = ITEM_REGISTRY[this.equippedWeaponId];
                    if (def && def.stats) {
                        const G = GAME_DB.enemies.kinds.ganger.gun;
                        return {
                            fireRate: def.stats.fireRate || G.fireRate,
                            damage: def.stats.damage || G.damage,
                            color: def.stats.projectileColor || G.color,
                            speed: def.stats.projectileSpeed || G.speed,
                            spread: def.stats.spread || G.spread,
                            penetrating: def.stats.penetrating || false,
                            sticky: def.stats.sticky || false,
                            dotDamage: def.stats.dotDamage || 0,
                            dotTicks: def.stats.dotTicks || 0,
                            dotInterval: def.stats.dotInterval || 0,
                        };
                    }
                }
                // Default ganger weapon (hot pink pistol): kinds.ganger.gun, directory/game-db/enemies.json
                return { ...GAME_DB.enemies.kinds.ganger.gun };
            }

            /** A landed melee hit breaks an ordinary gunner's aim; repeat hits cannot lock it down. */
            interruptMelee() {
                if (this.dead || this.hunter || this.bossName || this._noMeleeInterrupt || this.mass >= 20
                    || _gameTimeSec < (this._meleeResistUntil || 0)) return false;
                this._meleeInterruptUntil = _gameTimeSec + 0.20;
                this._meleeResistUntil = _gameTimeSec + 0.65;
                this.cooldown = Math.max(this.cooldown, this.telegraphThreshold + 1);
                this.isTelegraphing = false;
                this._aimPoint = null;
                return true;
            }

            /** In range, in the cone, and the way clear (not through a shut door; a restricted zone's own shot lines) */
            canSeePoint(tx, ty, walls, buildings) { return this.awareness.canSee(tx, ty, walls, buildings); }
            _sightClear(tx, ty, walls, buildings) {
                if (typeof game !== 'undefined' && game.roomSystem.doorBlocks(this.x, this.y, tx, ty)) return false;   // not through a shut door
                if (this._restrictedZoneId && typeof game !== 'undefined') return hasShotLine(this.x,this.y,tx,ty,game.activeMap);
                return !collisionWorld.lineBlocked(this.x, this.y, tx, ty, walls, buildings);
            }

            // ... [update method from previous turn] ...
            update(player, walls, buildings, markers, trafficCars, map, enemies) {
                if (this.dead) return null;
                if (this._execBy) return null;                                      // being executed (engine/executions.js): frozen
                // Flit: Afterimage — for a moment they still see you where you flitted from
                const ai = typeof game !== 'undefined' && game._afterimage;
                if (ai && _gameTimeSec < ai.until && player === game.player) player = Object.assign(Object.create(player), { x: ai.x, y: ai.y });
                // Nav-grid routing (null map → old straight-line movement)
                const navMap = (CONFIG.NAV.GANGER_NAV && map) ? map : null;
                
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                
                // Physics Knockback
                collisionWorld.carry(this);   // knockback: the body step (basement/collision-kit.js)
                if (this._staggerUntil && _gameTimeSec < this._staggerUntil) return null;   // slipped in a spill (engine/spills.js): no step, no shot
                
                const her = this.awareness.observe(player, 'her'), distToPlayer = her[AWARE.DIST];
                const isVisible = player.visible && !player.isHidden;
                
                // Detection range (reduced by active buffs like Ms. Jean Soda)
                const effectiveVisionRange = player.buffSystem.getStat('detectionRange', this.visionRange);
                
                // --- 1. DETECTION LOGIC ---
                let canSee = false;
                // Up close they sense her, unless she comes from behind, slowly or hidden, out of the light (an execution)
                const pg = player._gait, hg = typeof game !== 'undefined' ? game : null;
                const sneaking = her[AWARE.BEHIND]
                    && ((hg && hg.sneaking && player === hg.player) || player.isHidden || ((pg ? pg.speed : 0) < 2.3 && (player.visibility ?? 0) < 0.75));
                if (her[AWARE.TOUCHING] && isVisible && !this._bumped) {
                    // She bumped into him (in the dark, from behind, sneaking or not): he startles round to face her
                    this._bumped = true;
                    if (typeof game !== 'undefined' && game.emitNoise) game.emitNoise(player.x, player.y, 140, 'bump', false, { ring: false });   // "hey!": he and the ones close by hear where she is
                    this.angle = her[AWARE.BEARING];
                    this.investigateTarget = { x: player.x, y: player.y }; this.sweep = null;
                    this.suspicion = Math.max(this.suspicion, 70);
                    this.suspicionDrainDelay = 180;
                } else if (!her[AWARE.TOUCHING]) this._bumped = false;
                if (her[AWARE.CLOSE] && isVisible && !sneaking) {
                    canSee = true;
                    this.suspicion += 5;
                } else if (isVisible && distToPlayer <= effectiveVisionRange && this.awareness.look(her, this.visionRange, walls, buildings)) {
                    canSee = true;
                    let detectSpeed = 1.0;
                    detectSpeed *= (1.0 - (distToPlayer / effectiveVisionRange));
                    detectSpeed *= (player.visibility * 2.0);
                    if (detectSpeed < 0.1) detectSpeed = 0.1;
                    this.suspicion += detectSpeed * 2.5;
                    this.suspicionDrainDelay = 120;
                }
                
                if (canSee) {
                    markers.forEach(m => m.dismiss());
                    this.investigateTarget = {x: player.x, y: player.y};
                    this.sweep = null;
                    if (typeof game !== 'undefined') game._lastContactAt = _gameTimeSec;   // the gauntlet's stall breaker
                }
                
                if (!canSee && this.state !== 'SUPPRESSING') {
                    if (this.suspicionDrainDelay > 0) {
                        this.suspicionDrainDelay--;
                    } else {
                        this.suspicion -= (this.state === 'SEARCHING' ? 0.1 : 0.5);
                    }
                }
                
                this.suspicion = Math.max(0, Math.min(100, this.suspicion));

                // --- 2. STATE TRANSITIONS ---
                const oldState = this.state;
                if (this.suspicion >= 100) {
                    if (this.state !== 'SUPPRESSING' && this.state !== 'SEARCHING') this.state = 'ALERT';
                    if (canSee) this.state = 'ALERT';
                } else if (this.suspicion > 0 && this.state !== 'SEARCHING' && this.state !== 'SUPPRESSING') {
                    this.state = 'SUSPICIOUS';
                } else if (this.state !== 'SEARCHING' && this.state !== 'SUPPRESSING') {
                    this.state = 'IDLE';
                    markers.forEach(m => m.dismiss());
                }
                
                if (oldState === 'ALERT' && !canSee && this.suspicionDrainDelay > 0) {
                    if (this.investigateTarget) {
                        markers.push(new LastKnownMarker(this.investigateTarget.x, this.investigateTarget.y, player.angle));
                        showMessage("LKP ESTABLISHED");
                    }
                    this.state = 'SUPPRESSING';
                    this.suppressionTimer = 90; 
                }

                // --- 3. MOVEMENT & BEHAVIOR ---
                // Keep detecting and moving during the interruption, but hold aim/fire until it ends.
                const meleeInterrupted = _gameTimeSec < (this._meleeInterruptUntil || 0);
                if (meleeInterrupted) this.isTelegraphing = false;
                let moveX = 0;
                let moveY = 0;

                if (this.state === 'ALERT') {
                    this._flank = null;
                    this.angle = Math.atan2(player.y - this.y, player.x - this.x);
                    if (distToPlayer > 150) {
                        // Close in, routed around buildings (keeps facing the player)
                        const s = navMap ? actorSteer(this, player.x, player.y, 2.5, navMap)
                                         : { x: Math.cos(this.angle) * 2.5, y: Math.sin(this.angle) * 2.5 };
                        moveX = s.x;
                        moveY = s.y;
                    } else if (distToPlayer < 80) {
                        moveX = -Math.cos(this.angle) * 1.5;
                        moveY = -Math.sin(this.angle) * 1.5;
                    }
                    if (!meleeInterrupted) this.cooldown--;
                    // Telegraph: track player with predictive aim
                    if (!meleeInterrupted && this.cooldown > 0 && this.cooldown <= this.telegraphThreshold && canSee) {
                        this.isTelegraphing = true;
                        // Predictive aim: lead the player based on movement
                        const projSpeed = this._weaponStats.speed || 24;
                        const travelTime = distToPlayer / projSpeed;
                        const pSpeed = player.getCurrentSpeed ? player.getCurrentSpeed() : 4;
                        const predX = player.x + (player.velX || 0) * pSpeed * travelTime;
                        const predY = player.y + (player.velY || 0) * pSpeed * travelTime;
                        this.telegraphAngle = Math.atan2(predY - this.y, predX - this.x);
                        this.angle = this.telegraphAngle;   // body and gun point where the shot will go
                        this._aimPoint = { x: predX, y: predY };
                    } else {
                        this.isTelegraphing = false;
                    }
                    if (!meleeInterrupted && this.cooldown <= 0 && canSee) {
                        this.isTelegraphing = false;
                        const ws = this._weaponStats;
                        this.cooldown = ws.fireRate + Math.random() * 20;
                        this._shotTick = _simTick;   // recoil kick
                        const ap = this._aimPoint || player;
                        const shot = aimFromMuzzle(this, this.telegraphAngle, ap.x, ap.y);   // leaves the barrel, lands on the lead
                        return new ProjectileEntity({ 
                            x: shot.x, y: shot.y, 
                            angle: shot.angle + (Math.random()-0.5) * ws.spread, 
                            isEnemy: true, color: ws.color, owner: this,
                            speed: ws.speed, damage: ws.damage,
                            penetrating: ws.penetrating,
                            sticky: ws.sticky, dotDamage: ws.dotDamage,
                            dotTicks: ws.dotTicks, dotInterval: ws.dotInterval
                        });
                    }
                } else if (this.state === 'SUPPRESSING') {
                    if (this.investigateTarget) {
                        const T = this.investigateTarget;
                        this.angle = Math.atan2(T.y - this.y, T.x - this.x);
                        const clearShot = !navMap || hasShotLine(this.x, this.y, T.x, T.y, navMap);
                        if (navMap && CONFIG.NAV.GANGER_FLANK) {
                            if (clearShot) {
                                this._flank = null;                       // got eyes on it — hold here
                            } else {
                                const stale = this._flank && Math.hypot(this._flank.tx - T.x, this._flank.ty - T.y) > 24;
                                if ((!this._flank || stale) && _simTick >= (this._flankRetryAt || 0)) {
                                    const N = CONFIG.NAV;
                                    const avoid = (enemies || []).filter(o => o !== this && o._flank).map(o => o._flank);
                                    const spot = findShotSpot(navMap, this.x, this.y, T.x, T.y, {
                                        searchDist: N.GANGER_FLANK_SEARCH, minDist: 60, maxDist: Math.min(this.visionRange, 380),
                                        avoid, spacing: N.GANGER_FLANK_SPACING, maxChecks: 60, stride: N.SAMPLE_STRIDE,
                                        margin: { muzzle: aimedMuzzleLocal(this.equippedWeaponId || 'pistol_ganger'),
                                                  halfSpread: this._weaponStats.spread || 0.1, bulletR: 5, targetR: 12 }
                                    });
                                    this._flank = spot ? { x: spot.x, y: spot.y, tx: T.x, ty: T.y } : null;
                                    if (spot) this._navPath = spot.path && spot.path.length ? { pts: spot.path, idx: 0, goalX: spot.x, goalY: spot.y, repathAt: _simTick + N.REPATH_TICKS } : null;
                                    else this._flankRetryAt = _simTick + N.GANGER_FLANK_RETRY;
                                }
                                if (this._flank) {
                                    const s = actorSteer(this, this._flank.x, this._flank.y, 2.0, navMap);
                                    moveX = s.x;
                                    moveY = s.y;
                                }
                            }
                        }
                        if (!meleeInterrupted) this.cooldown--;
                        // Suppress only with a clear line (or rounds that go through walls)
                        if (!meleeInterrupted && this.cooldown <= 0 && (clearShot || this._weaponStats.penetrating)) {
                            const ws = this._weaponStats;
                            this.cooldown = 15; // Suppression fire stays fast
                            this._shotTick = _simTick;   // recoil kick
                            const shot = aimFromMuzzle(this, this.angle, T.x, T.y);
                            return new ProjectileEntity({ 
                                x: shot.x, y: shot.y, 
                                angle: shot.angle + (Math.random()-0.5) * (ws.spread * 2), 
                                isEnemy: true, color: ws.color, owner: this,
                                speed: ws.speed, damage: ws.damage,
                                penetrating: ws.penetrating
                            });
                        }
                    }
                    this.suppressionTimer--;
                    if (this.suppressionTimer <= 0) this.state = 'SEARCHING';
                } else if (this.state === 'SEARCHING') {
                    this._flank = null;
                    if (this.investigateTarget) {
                        const T = this.investigateTarget;
                        const distToTarget = Math.hypot(T.x - this.x, T.y - this.y);
                        // Walk toward the next waypoint (the marker itself when the way is clear)
                        const wp = navMap ? navWaypoint(this, T.x, T.y, navMap) : T;
                        const angleToTarget = Math.atan2(wp.y - this.y, wp.x - this.x);
                        let diff = angleToTarget - this.angle;
                        while (diff < -Math.PI) diff += Math.PI * 2; 
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        this.angle += diff * (navMap ? 0.2 : 0.1);

                        // No headway for 5 s (a jam at a doorway): give up on this spot, try the next
                        if (T !== this._searchT) { this._searchT = T; this._searchBest = distToTarget; this._searchSince = _simTick; }
                        else if (distToTarget < this._searchBest - 4) { this._searchBest = distToTarget; this._searchSince = _simTick; }
                        else if (distToTarget > 40 && _simTick - this._searchSince > 300) {
                            if (this.sweep && this.sweep.length) this.investigateTarget = this.sweep.shift();
                            else { this.state = 'IDLE'; this.sweep = null; this._sweepRooms = null; }
                        }

                        if (distToTarget > 40) {
                            if (navMap) {
                                const s = actorSteer(this, T.x, T.y, this.huntSpeed || 1.5, navMap);
                                moveX = s.x;
                                moveY = s.y;
                            } else {
                                moveX = Math.cos(this.angle) * (this.huntSpeed || 1.5);
                                moveY = Math.sin(this.angle) * (this.huntSpeed || 1.5);
                            }
                        } else {
                            markers.forEach(m => m.dismiss());
                            // Nothing here: look around a moment, then sweep the rooms beyond
                            if (this.sweep === null || this.sweep === undefined) { this.sweep = this._buildSweep(T, navMap); this._lookTimer = 45; }
                            if (this._lookTimer > 0) { this._lookTimer--; this.angle += 0.06; }
                            else if (this.sweep.length) { this.investigateTarget = this.sweep.shift(); this._lookTimer = 40; this.suspicion = Math.max(this.suspicion, 30); }
                            else {
                                this.angle += 0.05;
                                this.suspicion -= 1.0; 
                                if (this.suspicion <= 0) { this.state = 'IDLE'; this.sweep = null; this._sweepRooms = null; }
                            }
                        }
                    } else {
                        this.state = 'IDLE';
                    }
                } else if (this.state === 'SUSPICIOUS') {
                    if (canSee) {
                        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                        let diff = angleToPlayer - this.angle;
                        while (diff < -Math.PI) diff += Math.PI * 2; 
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        this.angle += diff * 0.05;
                    }
                } else { // IDLE
                    this._flank = null;
                    this.wanderTimer--;
                    if (this.wanderTimer <= 0) {
                        this.wanderTimer = 120 + Math.random() * 200;
                        this.wanderTarget.x = this.startX + (Math.random() - 0.5) * 400;
                        this.wanderTarget.y = this.startY + (Math.random() - 0.5) * 400;
                        // Snap the wander point onto walkable ground
                        const nav = navMap ? NavGrid.for(navMap) : null;
                        const free = nav ? nav.nearestFree(this.wanderTarget.x, this.wanderTarget.y) : null;
                        if (free !== null) { this.wanderTarget.x = nav.cx(free); this.wanderTarget.y = nav.cy(free); }
                    }
                    const distToWander = Math.hypot(this.wanderTarget.x - this.x, this.wanderTarget.y - this.y);
                    if (distToWander > 10) {
                        if (navMap) {
                            // Stroll along the route, turning to face where we're going
                            const s = actorSteer(this, this.wanderTarget.x, this.wanderTarget.y, 0.5, navMap);
                            let diff = Math.atan2(s.y, s.x) - this.angle;
                            while (diff < -Math.PI) diff += Math.PI * 2; 
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            this.angle += diff * 0.08;
                            moveX = s.x;
                            moveY = s.y;
                        } else {
                            const angleToWander = Math.atan2(this.wanderTarget.y - this.y, this.wanderTarget.x - this.x);
                            let diff = angleToWander - this.angle;
                            while (diff < -Math.PI) diff += Math.PI * 2; 
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            this.angle += diff * 0.02;
                            moveX = Math.cos(this.angle) * 0.5;
                            moveY = Math.sin(this.angle) * 0.5;
                        }
                    }
                }

                // --- CAPTURE VELOCITY ---
                this.velX = moveX;
                this.velY = moveY;

                // Apply Movement
                gaitCommand(this, moveX, moveY);
                this.x += moveX;
                this.y += moveY;

                this.checkCollisions(walls, buildings, trafficCars);
                
                return null;
            }

            // ... [collision/damage methods unchanged] ...
            checkCollisions(walls, buildings, trafficCars) {
                let hitObstacle = false;
                const staticBlocked = () => collisionWorld.squareBlocked(this.x, this.y, this.radius, walls, buildings);
                let hitStatic = staticBlocked();
                if (hitStatic && (this.velX || this.velY)) {
                    // Slide along the wall: keep whichever axis of the move is still clear
                    this.x -= this.velX;
                    if (staticBlocked()) {
                        this.x += this.velX; this.y -= this.velY;
                        if (staticBlocked()) this.x -= this.velX;   // neither axis is clear: full revert below
                        else hitStatic = false;
                    } else {
                        hitStatic = false;
                    }
                    if (hitStatic) { this.x += this.velX; this.y += this.velY; }   // restore, then the revert below undoes the whole move
                }
                hitObstacle = hitStatic;
                if (trafficCars) {
                    for (let car of trafficCars) {
                        const dist = Math.hypot(this.x - car.x, this.y - car.y);
                        if (dist < 40 && Math.abs(car.speed) <= 2.0) hitObstacle = true;   // a fast one hits him (hitByCar)
                    }
                }
                if (hitObstacle) {
                    this.x -= this.velX; this.y -= this.velY;
                    if (this.state === 'IDLE') { this.angle += Math.PI + (Math.random() - 0.5); this.wanderTimer = 0; }
                }
            }
            
            /** A car (CollisionSystem's people-vs-cars pass has put him just outside it): a fast one hurts, once a hit */
            hitByCar(car, contact, speed) {
                if (speed <= 2.0 || _simTick - (this._carHitAt ?? -1e9) < 20) return;
                this._carHitAt = _simTick;
                const force = speed * 3;
                this.takeDamage(speed * 10, contact.nx * force, contact.ny * force);
                showMessage("GANGER HIT BY VEHICLE!");
            }

            /**
             * A sound (engine/noise.js): unless already fighting her, turn toward roughly where it
             * came from (`err` px off) and go to look. `strength` 0…1 — louder or closer is
             * more alarming. Returns true if it caught this ganger's attention.
             */
            hearNoise(nx, ny, strength, err) {
                if (this.dead || this.state === 'ALERT' || this.state === 'SUPPRESSING') return false;
                const a = Math.random() * Math.PI * 2, r = Math.random() * err;
                this.investigateTarget = { x: nx + Math.cos(a) * r, y: ny + Math.sin(a) * r };
                this.sweep = null; this._lookTimer = 0;
                this.suspicion = Math.min(99, Math.max(this.suspicion, 45) + 35 * strength);
                this.suspicionDrainDelay = 180;
                this.state = 'SEARCHING';
                this.angle = Math.atan2(ny - this.y, nx - this.x);
                this.awareness.hear(nx, ny, strength);   // what he heard, and where (the matrix keeps it)
                return true;
            }

            /**
             * Where to look once the trail goes cold: the room the lead points into, then the rooms
             * joined to it by doors, nearest first — skipping rooms two others are already
             * searching. A couple of spots per room. [] off maps without rooms.
             */
            _buildSweep(T, map) {
                const rs = typeof game !== 'undefined' ? game.roomSystem : null;
                if (!rs || !rs.active) return [];
                const start = rs.getRoomAt(T.x, T.y);
                if (!start) return [];
                const ids = [start.id];
                for (const d of rs.doors) if (d.rooms.includes(start.id)) { const o = d.rooms[0] === start.id ? d.rooms[1] : d.rooms[0]; if (rs.rooms[o] && !ids.includes(o)) ids.push(o); }
                const centre = id => { const q = rs.rooms[id].rects[0]; return { x: q.x + q.w / 2, y: q.y + q.h / 2 }; };
                const claims = {};
                for (const e of game.enemies) if (e !== this && e._sweepRooms) for (const id of e._sweepRooms) claims[id] = (claims[id] || 0) + 1;
                const pick = [ids[0], ...ids.slice(1).sort((a, b) => Math.hypot(centre(a).x - T.x, centre(a).y - T.y) - Math.hypot(centre(b).x - T.x, centre(b).y - T.y))]
                    .filter(id => (claims[id] || 0) < 2).slice(0, 3);
                this._sweepRooms = pick;
                const nav = map ? NavGrid.for(map) : null, snap = (x, y) => { const f = nav && nav.nearestFree(x, y, 6); return f !== null && f !== undefined ? { x: nav.cx(f), y: nav.cy(f) } : { x, y }; };
                const pts = [];
                for (const id of pick) {
                    const q = rs.rooms[id].rects[0], c = centre(id);
                    pts.push(snap(c.x, c.y), snap(q.x + q.w * (0.2 + Math.random() * 0.6), q.y + q.h * (0.2 + Math.random() * 0.6)));
                }
                return pts;
            }

            onProjectileHit(projectile, game) {
                if (projectile.isEnemy) return;
                if (this.decoy) { this.takeDamage(this.hp, 0, 0, { shot: true }); return; }                 // one of Lilitu's Blood Mirror decoys: any hit
                if (this.elite && eliteWardTurns(this, projectile)) return;                  // a warded elite turns it
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;   // who gets the Resonance
                const opts = { shot: !projectile.melee, punch: !!projectile.melee, crit: !!projectile.crit };
                this.suspicion = 100;
                this.state = 'ALERT';
                
                // Face the direction the bullet came from
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // Bullet velocity points away from shooter — reverse it to face source
                    this.angle = Math.atan2(-projectile.vy, -projectile.vx);
                    
                    // Set investigate target along that direction (estimated shooter position)
                    const estimatedDist = 200;
                    this.investigateTarget = {
                        x: this.x + Math.cos(this.angle) * estimatedDist,
                        y: this.y + Math.sin(this.angle) * estimatedDist
                    };
                    
                    const knockbackStrength = projectile.damage * 0.3;
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    if (this.takeDamage(projectile.damage, kbX, kbY, opts) && projectile.melee) this.interruptMelee();
                } else if (this.takeDamage(projectile.damage, 0, 0, opts) && projectile.melee) { this.interruptMelee(); }
            }

            /** An armored elite takes half from burn and bleed */
            takeDamage(amount, knockbackX = 0, knockbackY = 0, opts = null) {
                if (this.elite === 'armored' && opts && (opts.type === 'bleed' || opts.type === 'burn')) amount *= 0.5;
                return super.takeDamage(amount, knockbackX, knockbackY, opts);
            }

            /** The vision cone's outline in world space, cast against the map's walls and buildings (cached). */
            _visionCone() {
                const r = this._coneRange || this.visionRange, c = this._coneCache;
                if (c && Math.abs(c.x - this.x) < 2 && Math.abs(c.y - this.y) < 2 && Math.abs(c.a - this.angle) < 0.02 && Math.abs(c.r - r) < 2) return c.poly;
                const map = typeof game !== 'undefined' && game.activeMap;
                const poly = collisionWorld.visibilityPoly(this.x, this.y, r, getOccluders(map), { aMin: this.angle - this.visionFov / 2, aMax: this.angle + this.visionFov / 2, arcStep: 0.08 });
                this._coneCache = { x: this.x, y: this.y, a: this.angle, r, poly };
                return poly;
            }

            draw(ctx) {
                if (this.dead) return;
                
                // 1. SAVE CONTEXT FOR ROTATED BODY
                ctx.save(); 
                ctx.translate(this.x, this.y); 
                ctx.rotate(this.angle);
                
                // VISION CONE — exactly what they can see: it stops at walls and buildings, and it
                // shrinks with anything that dulls their senses (Ms. Jean soda: detectionRange ×0.6)
                let coneColor = 'rgba(255, 255, 255, 0.05)';
                if (this.state === 'SUSPICIOUS') coneColor = 'rgba(255, 255, 0, 0.15)';
                if (this.state === 'ALERT' || this.state === 'SUPPRESSING') coneColor = 'rgba(255, 0, 0, 0.2)';
                if (this.hunter) coneColor = this.state === 'ALERT' || this.state === 'SUPPRESSING' ? 'rgba(255, 40, 60, 0.07)' : 'rgba(255, 60, 60, 0.035)';   // a hunter's red sight
                const pl = typeof game !== 'undefined' && game.player;
                const wantRange = pl && pl.buffSystem ? pl.buffSystem.getStat('detectionRange', this.visionRange) : this.visionRange;
                this._coneRange = this._coneRange === undefined ? wantRange : this._coneRange + (wantRange - this._coneRange) * 0.08;
                const cone = this._visionCone();
                ctx.save();
                ctx.rotate(-this.angle); ctx.translate(-this.x, -this.y);   // the cone is in world space
                ctx.fillStyle = coneColor;
                ctx.beginPath(); ctx.moveTo(this.x, this.y);
                for (const pt of cone) ctx.lineTo(pt.x, pt.y);
                ctx.closePath(); ctx.fill();
                ctx.restore();

                // PROCEDURAL BODY (Rotates with body) — aims in the weapon's stance while
                // alert/suppressing and holds the real weapon model; low ready otherwise.
                const aiming = this.state === 'ALERT' || this.state === 'SUPPRESSING';
                const weaponId = this.equippedWeaponId || 'pistol_ganger';   // default: the hot pink pistol
                if (!this.look) this.look = Ganger.makeLook(seededRandom(Math.random()));
                drawProceduralHumanoid(ctx, this, {
                    ...this.look,
                    stance: aiming ? stanceForWeapon(weaponId) : 'idle',
                    kick: aiming ? shotKick(this) : 0,
                    weapon: { id: weaponId, ready: aiming },
                });

                // 2. RESTORE CONTEXT (BACK TO UPRIGHT / SCREEN SPACE)
                ctx.restore();

                // TELEGRAPH AIM LINE (drawn in world space, not body-rotated)
                if (this.isTelegraphing && this.cooldown > 0) {
                    drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle, 
                        this.cooldown, this.telegraphThreshold, this._weaponStats.color);
                }

                // 3. DRAW UI ELEMENTS (Using absolute x/y, NO ROTATION)
                
                // Suspicion bar
                if (this.suspicion > 0) {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(this.x - 15, this.y - 30, 30, 4);
                    // Color based on state
                    ctx.fillStyle = (this.state === 'ALERT' || this.state === 'SUPPRESSING') ? '#f00' : (this.state === 'SUSPICIOUS' ? '#ff0' : '#fa0');
                    ctx.fillRect(this.x - 15, this.y - 30, 30 * (this.suspicion / 100), 4);
                }

                // Status Icons
                ctx.font = "bold 20px Orbitron";
                ctx.textAlign = "center";
                if (this.state === 'SUSPICIOUS') {
                    ctx.fillStyle = '#ffaa00';
                    ctx.fillText("?", this.x, this.y - 40);
                } else if (this.state === 'ALERT' || this.state === 'SUPPRESSING') {
                    ctx.fillStyle = '#ff0000';
                    ctx.fillText("!", this.x, this.y - 40);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        //  RESTRICTED ZONE — Hostile farming area with respawning enemies
        // ═══════════════════════════════════════════════════════════
        class RestrictedZone {
            constructor(config) {
                Object.assign(this,{id:'rz_0',name:'RESTRICTED ZONE',hostileCount:8,respawnDelay:600,mapId:'sdc'},config);
                this.respawnTimer=0;this.cleared=false;this.clearCount=0;this.hostiles=[];this.active=false;
                this.pendingSpawns=0;this._spawnIndex=0;this._spawnRetry=0;
            }
            _playerInside(game) {
                const p=game.player;
                return p.x>=this.x&&p.x<=this.x+this.w&&p.y>=this.y&&p.y<=this.y+this.h;
            }
            _spawnPoints(game) {
                if(game.activeMap.scrapyard)return game.activeMap.scrapyard.spawns;
                const points=[];
                for(const u of [.08,.3,.7,.92])for(const v of [.12,.88])points.push({x:this.x+u*this.w,y:this.y+v*this.h});
                return points;
            }
            _safeSpawn(game,p,nav) {
                if(p.x<this.x+25||p.x>this.x+this.w-25||p.y<this.y+25||p.y>this.y+this.h-25)return false;
                if(Math.hypot(p.x-game.playerPosition[0],p.y-game.playerPosition[1])<350||!nav.walkable(p.x,p.y))return false;
                if(game.enemies.some(h=>!h.dead&&Math.hypot(h.x-p.x,h.y-p.y)<75))return false;
                const cars=game.traffic?.vehicles||[];
                return !cars.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<100);
            }
            _fillSpawns(game) {
                const points=this._spawnPoints(game),nav=NavGrid.for(game.activeMap);
                for(let slot=this.hostileCount-this.pendingSpawns;this.pendingSpawns>0;slot++){
                    let at=null;
                    for(let n=0;n<points.length;n++){
                        const i=(this._spawnIndex+n)%points.length,p=points[i];
                        if(this._safeSpawn(game,p,nav)){at=p;this._spawnIndex=(i+2)%points.length;break;}
                    }
                    if(!at)break; // Never fall back to a wall, the player's feet, or an overlapping enemy.
                    const weaponId=this.clearCount>=6&&slot>=this.hostileCount-2?'sniper_sr86':this.clearCount>=3?'rifle_rb98':null;
                    const h=new Ganger(at.x,at.y,{hp:50+this.clearCount*8,speed:2.6+Math.min(this.clearCount*.15,1.2),visionRange:360,weaponId});
                    h._restrictedZoneId=this.id;
                    // Reinforcements investigate the intrusion rather than idling at the far end of the yard.
                    h.state='SEARCHING';h.suspicion=70;h.investigateTarget={x:game.playerPosition[0],y:game.playerPosition[1]};
                    h.angle=Math.atan2(game.playerPosition[1]-at.y,game.playerPosition[0]-at.x);
                    this.hostiles.push(h);game.enemies.push(h);this.pendingSpawns--;
                }
                this._spawnRetry=30;
            }
            spawn(game) {
                this.hostiles=[];this.cleared=false;this.active=true;this.pendingSpawns=this.hostileCount;
                this._spawnIndex=(this.clearCount*4)%this._spawnPoints(game).length;
                this._fillSpawns(game);
            }
            update(game) {
                try {this._update(game);}finally{this._hud(game);}
            }
            _update(game) {
                if(game.activeMap.id!==this.mapId){
                    if(this.active&&!this.cleared)this._pendingRespawn=true;
                    this.hostiles=[];this.pendingSpawns=0;return;
                }
                const inside=this._playerInside(game);
                if(this._pendingRespawn){
                    if(!inside)return;
                    this._pendingRespawn=false;this.spawn(game);showMessage(`⚠ ${this.name} — HOSTILES REGROUPED`);return;
                }
                if(!this.active&&inside){this.spawn(game);showMessage(`⚠ ${this.name} — ROUND ${this.clearCount+1}`);return;}
                if(!this.active)return;
                this.hostiles=this.hostiles.filter(h=>!h.dead&&game.enemies.includes(h));
                if(this.pendingSpawns&&inside&&--this._spawnRetry<=0)this._fillSpawns(game);
                if(!this.cleared&&!this.pendingSpawns&&this.hostiles.length===0){
                    this.cleared=true;this.clearCount++;this.respawnTimer=this.respawnDelay;
                    const bonus=30+this.clearCount*15;this._lastBonus=bonus;
                    game.currency=(game.currency||0)+bonus;
                    if(game.resonance)game.earnResonance(60+this.clearCount*15,'ZONE CLEARED');
                    game.updateUI();showMessage(`${this.name} CLEARED ×${this.clearCount} — +${bonus} PERSONICS`);
                }
                // Leaving is a real breather: further rounds wait for her return to the yard.
                if(this.cleared&&inside&&--this.respawnTimer<=0){this.spawn(game);showMessage(`⚠ ${this.name} — HOSTILES REGROUPED`);}
            }
            _hud(game) {
                const el=this._el||(this._el=document.getElementById('ui-scrapyard'));if(!el)return;
                const hidden=game.activeMap.id!==this.mapId||!this.active||!this._playerInside(game)||game.scenes?.running||game.hordeGauntlet?.active;
                const left=this.hostiles.filter(h=>!h.dead&&game.enemies.includes(h)).length;
                const secs=Math.ceil(this.respawnTimer/60),round=this.clearCount+1;
                const key=hidden?'':`${round}:${left}:${this.pendingSpawns}:${this.cleared}:${secs}:${this._lastBonus||0}`;
                if(key===this._hudKey)return;this._hudKey=key;
                el.classList.toggle('show',!hidden);document.body.classList.toggle('yard-hud',!hidden);
                if(hidden)return;
                const tier=this.clearCount>=6?'Sniper backup':this.clearCount>=3?'Rapid blasters':'';
                const title=this.cleared?'Yard cleared':`The Scrapyard · Round ${round}`;
                const sub=this.cleared?`Reinforcements in ${secs}s`:`${left} ${left===1?'hostile':'hostiles'} remaining`+(this.pendingSpawns?` · ${this.pendingSpawns} inbound`:'');
                const frac=this.cleared?0:(left+this.pendingSpawns)/this.hostileCount;
                el.classList.toggle('between',this.cleared);
                el.innerHTML=`<div class="w-line"><span class="w-title">${title}</span></div><div class="w-line"><span class="w-sub">${sub}</span>${!this.cleared&&tier?`<span class="w-chip">${tier}</span>`:''}</div>`
                    +`<div class="w-line w-spoils${this.cleared?' secured':''}"><span class="w-tag">${this.cleared?'Secured':'Pays'}</span>${this.cleared?this._lastBonus:30+round*15} personics</div><div class="w-bar"><i style="transform:scaleX(${frac.toFixed(3)})"></i></div>`;
            }
        }

        // ═══════════════════════════════════════════════════════════
        //  HORDE GAUNTLET — wave combat on a choice of maps (Grum's GAUNTLET menu)
        // ═══════════════════════════════════════════════════════════
        /* The gauntlet's maps. A playable one names its map, where enemies come in (spawns —
           walkable spots in every room, kept ≥ SPAWN_MIN_DIST from 949) and where the heavy
           gunners stand (gunnerSpawns — the big rooms). Sealed entries are placeholders for
           maps to come: shown in the menu, greyed out. */
        /** The wave rules a gauntlet map names in its `hooks` (directory/game-db/enemies.json has the maps). */
        const GAUNTLET_WAVE_HOOKS = {
            // The palace: waves of hunters (night vision, dashes); an alpha from wave 3; the Demoness every fifth wave —
            // with her hunters on 5, 15, 25…, and alone (Lilitu's duel, `solo`) on 10, 20, 30…
            demoness_palace: {
                waves: (w) => {
                    const solo = w % 10 === 0;
                    return { hunters: solo ? 0 : Math.min(3 + w, 10), alphas: solo || w < 3 ? 0 : 1 + Math.floor((w - 3) / 4), demoness: w % 5 === 0, solo,
                             hp: 55 + w * 8, speed: 2.6 + Math.min(w * 0.08, 1) };
                }
            }
        };
        const GAUNTLET_MAPS = attachDataHooks(GAME_DB.enemies.gauntlet_maps, GAUNTLET_WAVE_HOOKS);   // directory/game-db/enemies.json
        const GAUNTLET_SPAWN_MIN_DIST = GAME_DB.enemies.gauntlet.spawn_min_dist;
        /* Past the early waves (both maps): from wave FROM every hostile's HP grows ×HP_GROWTH a wave and its
           damage +DMG_STEP a wave (claws too); from ELITE_FROM about one in ELITE_EVERY is an elite (Armored,
           Swift or Warded: ELITES). A cleared wave pays SCRAP × wave, and BONUS_SCRAP more every BONUS_EVERY-th.
           The Demoness: DEMONESS_HP + DEMONESS_HP_W × wave with her hunters; alone, SOLO_HP + SOLO_HP_W × wave. */
        const GAUNTLET_SCALE = GAME_DB.enemies.gauntlet.scale;
        /* The elites (a gauntlet's rank and file, from ELITE_FROM): each wears its mark — a ring and a word
           under it in its colour — and fights its own way.
             armored  steel plates: burn and bleed do half, and it shrugs off shoves
             swift    quicker on its feet (a hunter dashes sooner)
             warded   a gold ward before it turns shots from the front (WARD_ARC either side) until it
                      has turned WARD_HP × its health in them; then it shatters. Blades and burns go through */
        const ELITES = GAME_DB.enemies.elites.marks;
        const ELITE_WARD = GAME_DB.enemies.elites.ward;
        /** Make a hostile an elite (restore: from a save, its numbers are already in place) */
        function applyElite(h, kind, restore) {
            if (!ELITES[kind]) return;
            h.elite = kind;
            if (kind === 'armored') h.mass = (h.mass || 10) * 2.5;
            if (restore) return;
            if (kind === 'swift') {
                h.speed *= 1.3; if (h.huntSpeed) h.huntSpeed *= 1.3;
                if (h.dashCDBase) { h.dashCDBase *= 0.7; h.dashCD = Math.min(h.dashCD, h.dashCDBase); }
            }
            if (kind === 'warded') h.ward = h.wardMax = Math.round((h.maxHp || h.hp) * ELITE_WARD.HP);
        }
        /** A warded elite turns a shot from in front of it: true if it did (the ward takes it) */
        function eliteWardTurns(h, p) {
            if (h.elite !== 'warded' || !(h.ward > 0) || p.melee) return false;
            const sp = Math.hypot(p.vx, p.vy); if (!sp) return false;
            const from = Math.atan2(-p.vy, -p.vx);                                  // where the shot came from
            if (Math.abs(normalizeAngle(from - h.angle)) > ELITE_WARD.ARC) return false;
            h.ward = Math.max(0, h.ward - p.damage); h._wardHitT = _gameTimeSec;
            if (typeof game !== 'undefined' && game.weather) game.weather.spawnExplosion(p.x, p.y, '#ffd66e', 3, 0.8);
            if (h.ward <= 0) h._wardBrokeT = _gameTimeSec;
            return true;
        }
        /** The elite's mark (above the darkness, engine/boss-hazards.js): a ring at its feet, its word beneath, the ward's arc while it holds */
        function drawEliteMark(ctx, h) {
            const E = ELITES[h.elite]; if (!E) return;
            const t = _frameTime / 1000;
            ctx.save();
            ctx.strokeStyle = `rgba(${E.col}, ${0.55 + 0.2 * Math.sin(t * 4)})`; ctx.lineWidth = 1.5;
            ctx.setLineDash(h.elite === 'swift' ? [4, 4] : []);
            ctx.beginPath(); ctx.arc(h.x, h.y, 21, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            if (h.elite === 'armored') {                                              // studs round the ring
                ctx.fillStyle = `rgba(${E.col}, 0.9)`;
                for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.fillRect(h.x + Math.cos(a) * 21 - 1.5, h.y + Math.sin(a) * 21 - 1.5, 3, 3); }
            }
            if (h.elite === 'warded' && h.ward > 0) {
                const hit = h._wardHitT ? Math.max(0, 1 - (_gameTimeSec - h._wardHitT) / 0.25) : 0, k = h.ward / (h.wardMax || 1);
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = `rgba(${E.col}, ${0.35 + 0.35 * k + 0.3 * hit})`; ctx.lineWidth = 2.5 + 2 * hit;
                ctx.beginPath(); ctx.arc(h.x, h.y, 27, h.angle - ELITE_WARD.ARC, h.angle + ELITE_WARD.ARC); ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            } else if (h._wardBrokeT && _gameTimeSec - h._wardBrokeT < 0.5) {
                const u = (_gameTimeSec - h._wardBrokeT) / 0.5;
                ctx.globalAlpha = 1 - u; ctx.strokeStyle = `rgb(${E.col})`; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(h.x, h.y, 27 + 20 * u, h.angle - ELITE_WARD.ARC, h.angle + ELITE_WARD.ARC); ctx.stroke(); ctx.globalAlpha = 1;
            }
            ctx.font = '600 7px Orbitron'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(${E.col}, 0.9)`;
            ctx.fillText(E.label, h.x, h.y + 34);
            ctx.restore();
        }
        /** A wave's HP and damage multipliers */
        function gauntletScale(w) {
            const n = Math.max(0, w - GAUNTLET_SCALE.FROM);
            return { hp: Math.pow(GAUNTLET_SCALE.HP_GROWTH, n), dmg: 1 + GAUNTLET_SCALE.DMG_STEP * n };
        }
        const GAUNTLET_LEAD_ERR = GAME_DB.enemies.gauntlet.lead_err;           // a wave arrives knowing only her rough area (px off)
        const GAUNTLET_STALL_SECS = GAME_DB.enemies.gauntlet.stall_secs;          // no one has seen or heard her this long → a vague lead…
        const GAUNTLET_STALL_ERR = GAME_DB.enemies.gauntlet.stall_err;          // …this far off: enough to sweep the right rooms
        // Save values, never live navigation, entity or intro references.
        const GAUNTLET_HOSTILE_NUMBERS = ['x', 'y', 'angle', 'hp', 'maxHp', 'speed', 'huntSpeed', 'visionRange',
            'suspicion', 'cooldown', 'telegraphAngle', 'telegraphThreshold', 'dashMax', 'dashCDBase', 'dashCD',
            'clawCD', 'clawDmg', 'clawReach', '_chain', 'whipCD', 'burstCooldown', 'burstCount', 'burstTimer',
            'moveTimer', 'strafeDirection', 'dmgMul', 'ward', 'wardMax'];

        class HordeGauntlet {
            constructor() {
                this.active = false;
                this.wave = 0;
                this.highestWaves = {};          // best wave per gauntlet map
                this.hostiles = [];
                this.waveDelay = 0;
                this.totalKills = 0;
                this.entry = GAUNTLET_MAPS[0];
                this.mapId = this.entry.mapId;
                document.getElementById('ui-wave')?.classList.remove('show');   // a fresh game: no readout left over
                document.body.classList.remove('wave-hud');
            }

            /** Best wave on any map (old saves kept a single number). */
            get highestWave() { return Math.max(0, ...Object.values(this.highestWaves)); }
            set highestWave(v) { if (v > 0) this.highestWaves[GAUNTLET_MAPS[0].id] = Math.max(this.highestWaves[GAUNTLET_MAPS[0].id] || 0, v); }


            getWaveConfig(wave) {
                const gangerCount = Math.min(5 + wave, 14);
                const gunnerCount = wave >= 5 ? 1 + Math.floor((wave - 5) / 3) : 0;
                let weaponId = null;
                if (wave >= 8) weaponId = 'sniper_sr86';
                else if (wave >= 4) weaponId = 'rifle_rb98';
                const hp = 40 + wave * 6;
                const speed = 2.4 + Math.min(wave * 0.1, 1.5);
                return { gangerCount, gunnerCount, weaponId, hp, speed };
            }

            start(game, gauntletId = GAUNTLET_MAPS[0].id) {
                const entry = GAUNTLET_MAPS.find(g => g.id === gauntletId);
                if (!entry || entry.locked) return false;
                this.entry = entry;
                this.mapId = entry.mapId;
                this.active = true; this._secured = null; this._spoils = [];
                this.wave = 0;
                this.totalKills = 0;
                this.hostiles = [];
                game.loadMap(this.mapId);
                // Start first wave after a brief pause
                this.waveDelay = 90; // 1.5 second before first wave
                return true;
            }

            serialize(game) {
                const data = { highestWave: this.highestWave, highestWaves: { ...this.highestWaves }, run: null };
                if (!this.active || game.activeMap.id !== this.mapId) return data;
                const living = this.hostiles.filter(h => !h.dead && !h.decoy && game.enemies.includes(h));
                data.run = {
                    id: this.entry.id, wave: this.wave, waveDelay: this.waveDelay,
                    totalKills: this.totalKills + this.hostiles.length - living.length,
                    waveSize: this._waveSize || 0,
                    hostiles: living.map(h => {
                        const row = { kind: h instanceof Demoness ? 'demoness' : h instanceof Hunter ? 'hunter'
                            : h instanceof GatlingGunner ? 'gunner' : 'ganger', alpha: !!h.alpha,
                            weaponId: h.equippedWeaponId || null, look: h.look, elite: h.elite || null, solo: !!h.solo,
                            state: h.state, isTelegraphing: !!h.isTelegraphing,
                            investigateTarget: h.investigateTarget && { ...h.investigateTarget } };
                        for (const key of GAUNTLET_HOSTILE_NUMBERS) if (Number.isFinite(h[key])) row[key] = h[key];
                        return row;
                    })
                };
                return data;
            }

            /** Called after the saved map and its navigation/props exist, including faded loads. */
            deserialize(game, data) {
                this.active = false; this.hostiles = []; this.wave = 0; this.waveDelay = 0; this.totalKills = 0;
                this.highestWaves = { ...(data?.highestWaves || {}) };
                if (!data?.highestWaves) this.highestWave = data?.highestWave || 0;
                this._hudKey = null; clearTimeout(this._endT);
                const entry = GAUNTLET_MAPS.find(g => !g.locked && g.mapId === game.activeMap.id);
                if (!entry) { this._hud(game); return; }
                this.entry = entry; this.mapId = entry.mapId; this.active = true; this._secured = null; this._spoils = [];
                this._waveStartedAt = _gameTimeSec; game._lastContactAt = _gameTimeSec;
                const run = data?.run;
                if (!run || run.id !== entry.id || !Array.isArray(run.hostiles)) {
                    // Older saves kept only records, so their lost run cannot be reconstructed.
                    this.waveDelay = 90;
                    showMessage('GAUNTLET RESUMED — NEW RUN STARTS AT WAVE 1');
                    this._hud(game); return;
                }
                this.wave = Math.max(0, Math.floor(run.wave || 0));
                this.waveDelay = Math.max(0, Math.floor(run.waveDelay || 0));
                this.totalKills = Math.max(0, Math.floor(run.totalKills || 0));
                this._waveSize = Math.max(0, Math.floor(run.waveSize || 0));
                for (const row of run.hostiles) {
                    if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || !(row.hp > 0)) continue;
                    const cfg = { hp: row.maxHp || row.hp, speed: row.speed, visionRange: row.visionRange,
                        weaponId: row.weaponId, alpha: row.alpha, look: row.look, solo: !!row.solo };
                    let h;
                    if (row.kind === 'demoness') h = new Demoness(row.x, row.y, cfg);
                    else if (row.kind === 'hunter') h = new Hunter(row.x, row.y, cfg);
                    else if (row.kind === 'gunner') h = new GatlingGunner(row.x, row.y, this.hostiles.length);
                    else if (row.kind === 'ganger') h = new Ganger(row.x, row.y, cfg);
                    else continue;
                    for (const key of GAUNTLET_HOSTILE_NUMBERS) if (Number.isFinite(row[key])) h[key] = row[key];
                    if (row.look) h.look = row.look;
                    if (ELITES[row.elite]) applyElite(h, row.elite, true);
                    if (['IDLE', 'SUSPICIOUS', 'SEARCHING', 'ALERT', 'SUPPRESSING'].includes(row.state)) h.state = row.state;
                    if (Number.isFinite(row.investigateTarget?.x) && Number.isFinite(row.investigateTarget?.y))
                        h.investigateTarget = { x: row.investigateTarget.x, y: row.investigateTarget.y };
                    h.isTelegraphing = !!row.isTelegraphing;
                    // Resume combat, not a half-finished cinematic or an execution attachment.
                    h.dormant = false; h.navMap = game.activeMap; h._gauntletWave = this.wave;
                    this.hostiles.push(h); game.enemies.push(h);
                }
                if (!this.wave && !this.waveDelay) this.waveDelay = 90;
                this._hud(game);
            }

            /** Walkable spawn points far enough from 949, shuffled; reused (jittered) when a wave outnumbers them. */
            _spawnPoints(game, list, n) {
                const nav = NavGrid.for(game.activeMap), px = game.playerPosition[0], py = game.playerPosition[1];
                let pts = list.map(([x, y]) => ({ x, y }))
                    .filter(p => (!nav || nav.walkable(p.x, p.y)) && Math.hypot(p.x - px, p.y - py) >= GAUNTLET_SPAWN_MIN_DIST);
                if (!pts.length) pts = list.map(([x, y]) => ({ x, y }));
                for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
                const out = [];
                for (let i = 0; i < n; i++) {
                    const p = pts[i % pts.length];
                    if (i < pts.length) { out.push({ x: p.x, y: p.y }); continue; }
                    let q = { x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 40 };
                    if (nav && !nav.walkable(q.x, q.y)) q = { x: p.x, y: p.y };
                    out.push(q);
                }
                return out;
            }

            /**
             * Give a hostile a rough lead on 949 — `err` px off, snapped to walkable ground — and
             * it comes to sweep that part of the house. No radar: they only ever learn where
             * she is by seeing her, hearing her, or (a wave's start, a long silence) a vague lead.
             */
            _lead(h, game, err) {
                if (!(h instanceof Ganger) || h.state === 'ALERT' || h.state === 'SUPPRESSING') return;
                const p = game.player, a = Math.random() * Math.PI * 2, r = err * (0.5 + Math.random() * 0.5);
                const nav = NavGrid.for(game.activeMap), f = nav && nav.nearestFree(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 8);
                h.investigateTarget = f !== null && f !== undefined ? { x: nav.cx(f), y: nav.cy(f) } : { x: p.x, y: p.y };
                h.sweep = null; h.state = 'SEARCHING'; h.suspicion = Math.max(h.suspicion, 60);
            }

            spawnWave(game) {
                this.wave++;
                this._spoils = [];
                const id = this.entry.id;
                if (this.wave > (this.highestWaves[id] || 0)) this.highestWaves[id] = this.wave;
                this.hostiles = [];
                this._waveStartedAt = _gameTimeSec;
                if (this.entry.waves) { this._spawnHunters(game, this.entry.waves(this.wave)); return; }
                const cfg = this.getWaveConfig(this.wave);
                const nav = game.activeMap;

                const S = gauntletScale(this.wave);
                for (const pt of this._spawnPoints(game, this.entry.spawns, cfg.gangerCount)) {
                    const ganger = new Ganger(pt.x, pt.y, {
                        hp: Math.round(cfg.hp * S.hp), speed: cfg.speed, visionRange: 450, weaponId: cfg.weaponId
                    });
                    ganger._gauntletWave = this.wave; ganger.dmgMul = S.dmg;
                    ganger.huntSpeed = Math.min(2.6, cfg.speed * 0.8);
                    this._lead(ganger, game, GAUNTLET_LEAD_ERR);
                    this.hostiles.push(ganger);
                    game.enemies.push(ganger);
                }
                const elites = this._makeElites(this.hostiles);

                const gSpots = this._spawnPoints(game, this.entry.gunnerSpawns, cfg.gunnerCount);
                for (let i = 0; i < cfg.gunnerCount; i++) {
                    const gunner = new GatlingGunner(gSpots[i].x, gSpots[i].y, i);
                    gunner._gauntletWave = this.wave;
                    gunner.navMap = nav;                     // indoors: routes round walls to find a line on her
                    gunner.hp = Math.round((150 + this.wave * 15) * S.hp);
                    gunner.maxHp = gunner.hp; gunner.dmgMul = S.dmg;
                    this.hostiles.push(gunner);
                    game.enemies.push(gunner);
                }

                const gunnerText = cfg.gunnerCount > 0 ? ` + ${cfg.gunnerCount} GUNNER${cfg.gunnerCount > 1 ? 'S' : ''}` : '';
                showMessage(`WAVE ${this.wave} — ${cfg.gangerCount} GANGERS${gunnerText}` + (elites ? ` (${elites} ELITE${elites > 1 ? 'S' : ''})` : ''));
                game.triggerShake(8);
                this._waveSize = this.hostiles.length;
            }

            /** A palace wave: hunters, an alpha or two, and every fifth wave the Demoness with her intro */
            _spawnHunters(game, W) {
                const S = gauntletScale(this.wave);
                for (const pt of this._spawnPoints(game, this.entry.spawns, W.hunters)) {
                    const h = new Hunter(pt.x, pt.y, { hp: Math.round(W.hp * S.hp), speed: W.speed });
                    h._gauntletWave = this.wave; h.navMap = game.activeMap; h.dmgMul = S.dmg;
                    this._lead(h, game, GAUNTLET_LEAD_ERR);
                    this.hostiles.push(h); game.enemies.push(h);
                }
                for (const pt of this._spawnPoints(game, this.entry.spawns, W.alphas)) {
                    const a = new Hunter(pt.x, pt.y, { hp: Math.round(W.hp * 1.9 * S.hp), speed: W.speed + 0.2, alpha: true, dashes: 2, dashCD: 180, claw: 18 });
                    a._gauntletWave = this.wave; a.navMap = game.activeMap; a.dmgMul = S.dmg;
                    this._lead(a, game, GAUNTLET_LEAD_ERR);
                    this.hostiles.push(a); game.enemies.push(a);
                }
                const elites = this._makeElites(this.hostiles);
                let text = `WAVE ${this.wave} — ${W.hunters} HUNTERS` + (W.alphas ? ` + ${W.alphas} ALPHA${W.alphas > 1 ? 'S' : ''}` : '')
                         + (elites ? ` (${elites} ELITE${elites > 1 ? 'S' : ''})` : '');
                if (W.demoness) {
                    const G = GAUNTLET_SCALE;
                    for (const h of this.hostiles) h.dormant = true;               // her hunters hold still while she makes her entrance
                    const d = new Demoness(900, 480, { hp: W.solo ? G.SOLO_HP + G.SOLO_HP_W * this.wave : G.DEMONESS_HP + G.DEMONESS_HP_W * this.wave, solo: W.solo });
                    d._gauntletWave = this.wave; d.dmgMul = S.dmg;
                    this.hostiles.push(d);
                    // (bossIntro adds her to the enemies); alone, the palace dims and she has her own entrance
                    if (W.solo) game.bossIntro([d], { title: 'LILITU', subtitle: 'She hunts you alone', seenFlag: 'lilituDuelSeen' });
                    else game.bossIntro([d], { title: 'THE DEMONESS', seenFlag: 'demonessIntroSeen' });
                    text = W.solo ? `WAVE ${this.wave} — LILITU HUNTS YOU ALONE` : text + ' — AND SHE COMES';
                }
                showMessage(text);
                game.triggerShake(8);
                this._waveSize = this.hostiles.length;
            }

            /** From ELITE_FROM: about one in ELITE_EVERY of a wave's rank and file becomes an elite (never a gunner or a boss) */
            _makeElites(list) {
                if (this.wave < GAUNTLET_SCALE.ELITE_FROM) return 0;
                const pool = list.filter(h => h instanceof Ganger && !h.bossName && !h.elite);
                const n = Math.min(pool.length, Math.max(1, Math.round(pool.length / GAUNTLET_SCALE.ELITE_EVERY)));
                const kinds = Object.keys(ELITES);
                for (let i = 0; i < n; i++) {
                    const j = i + Math.floor(Math.random() * (pool.length - i));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                    applyElite(pool[i], kinds[Math.floor(Math.random() * kinds.length)]);
                }
                return n;
            }

            /**
             * The wave readout (#ui-wave, top centre): the wave, how many are left and a
             * bar that drains, the countdown between waves, the summary at the end. The
             * message modal still announces each beat; this keeps the count where a loot
             * pickup or a flit message can't cover it. Writes the DOM only on change.
             */
            _hud(game, ended) {
                const el = this._el || (this._el = document.getElementById('ui-wave'));
                if (!el) return;
                let key, html = '', frac = 0;
                if (ended) {
                    key = 'end' + this.wave;
                    html = `<span class="w-title">Gauntlet over</span><span class="w-sep">◆</span><span class="w-sub">Wave ${this.wave} · ${this.totalKills} kills</span>`;
                } else if (!this.active || game.activeMap.id !== this.mapId || (game.scenes && game.scenes.running)) {
                    key = '';
                } else if (this.waveDelay > 0) {
                    const n = Math.ceil(this.waveDelay / 60);
                    key = 'gap' + this.wave + ':' + n;
                    html = this.wave > 0
                        ? `<span class="w-title">Wave ${this.wave} cleared</span><span class="w-sep">◆</span><span class="w-sub">Next in ${n}</span>`
                        : `<span class="w-title">Wave 1</span><span class="w-sep">◆</span><span class="w-sub">In ${n}</span>`;
                } else {
                    const left = this.hostiles.length, gun = this.hostiles.filter(h => h instanceof GatlingGunner).length;
                    const herE = typeof Demoness !== 'undefined' && this.hostiles.find(h => h instanceof Demoness && !h.dead);
                    const her = herE ? (herE.solo ? 'Lilitu' + (herE.phase > 1 ? ' · ' + ['', 'I', 'II', 'III'][herE.phase] : '') : 'The Demoness') : '';
                    key = 'w' + this.wave + ':' + left + ':' + gun + ':' + her;
                    frac = this._waveSize ? left / this._waveSize : 0;
                    html = `<span class="w-title">Wave ${this.wave}</span><span class="w-sep">◆</span><span class="w-sub">${left} left</span>`
                         + (gun ? `<span class="w-chip">${gun > 1 ? gun + ' gunners' : 'Gunner'}</span>` : '')
                         + (her ? `<span class="w-chip">${her}</span>` : '');
                }
                // Second line: what this wave pays, then, once it's cleared, what she secured (stays up through the countdown)
                let sub = '';
                if (!ended && key && this.waveDelay > 0 && this.wave > 0 && this._secured) sub = `<div class="w-line w-spoils secured"><span class="w-tag">Secured</span>${this._spoilText(this._secured)}</div>`;
                else if (!ended && key && this.waveDelay <= 0) sub = `<div class="w-line w-spoils"><span class="w-tag">Pays</span>${this._spoilText(this._pays(this.wave))}</div>`;
                const hidden = !key;
                key += '|' + sub;
                if (key === this._hudKey) return;
                this._hudKey = key;
                if (hidden) { el.classList.remove('show'); document.body.classList.remove('wave-hud'); return; }
                el.innerHTML = `<div class="w-line">${html}</div>${sub}<div class="w-bar"><i style="transform:scaleX(${frac.toFixed(3)})"></i></div>`;
                el.classList.toggle('between', !frac);
                el.classList.add('show'); document.body.classList.add('wave-hud');
                if (ended) { clearTimeout(this._endT); this._endT = setTimeout(() => { if (!this.active) { this._hudKey = ''; el.classList.remove('show'); document.body.classList.remove('wave-hud'); } }, 6000); }
            }

            /** The wave-clear payout, as the HUD's 'Pays' line lists it */
            _pays(w) {
                return [`${40 + w * 20} personics`, `${GAUNTLET_SCALE.SCRAP * w + (w % GAUNTLET_SCALE.BONUS_EVERY === 0 ? GAUNTLET_SCALE.BONUS_SCRAP : 0)} scrap`, ...(w % 3 === 0 ? ['Dark Element'] : [])];
            }

            /** A boss drop this wave (Lilitu's Dark Element, a schematic, a weapon): listed with the wave's spoils */
            spoil(name) { if (this.active) (this._spoils || (this._spoils = [])).push(name); }

            /** Spoils → "a · b · Dark Element ×2", at most four entries then "+N more" so one line stays one line */
            _spoilText(list) {
                const n = new Map();
                for (const s of list) n.set(s, (n.get(s) || 0) + 1);
                const items = [...n].map(([s, c]) => c > 1 ? `${s} ×${c}` : s);
                const shown = items.slice(0, 4).map(s => `<span class="w-spoil">${s}</span>`).join('<span class="w-dot">·</span>');
                return shown + (items.length > 4 ? `<span class="w-dot">·</span><span class="w-spoil">+${items.length - 4} more</span>` : '');
            }

            update(game) {
                if (!this.active) return;
                if (game.activeMap.id !== this.mapId) {
                    // Player left the arena via transition — end gauntlet
                    this.end(game);
                    return;
                }

                // Between-wave countdown
                if (this.waveDelay > 0) {
                    this.waveDelay--;
                    if (this.waveDelay <= 0) {
                        this.spawnWave(game);
                    }
                    this._hud(game);
                    return;
                }

                // Her intro over: her hunters wake
                if (!game._bossIntro) for (const h of this.hostiles) if (h.dormant && !(typeof Demoness !== 'undefined' && h instanceof Demoness)) h.dormant = false;
                // Prune dead
                const before = this.hostiles.length;
                this.hostiles = this.hostiles.filter(h => !h.dead && game.enemies.includes(h));
                this.totalKills += (before - this.hostiles.length);

                // Stall breaker: nobody has seen or heard her in a while → the idle get a vague lead
                if (game._lastContactAt === undefined || game._lastContactAt < this._waveStartedAt) game._lastContactAt = this._waveStartedAt;
                if (_gameTimeSec - game._lastContactAt > GAUNTLET_STALL_SECS) {
                    for (const h of this.hostiles) if (h.state === 'IDLE' || h.state === 'SUSPICIOUS') this._lead(h, game, GAUNTLET_STALL_ERR);
                    game._lastContactAt = _gameTimeSec - GAUNTLET_STALL_SECS * 0.4;   // again in ~15 s if still silent
                }

                // Wave cleared
                if (this.hostiles.length === 0 && this.wave > 0) {
                    const reward = 40 + this.wave * 20;
                    const scrapReward = GAUNTLET_SCALE.SCRAP * this.wave + (this.wave % GAUNTLET_SCALE.BONUS_EVERY === 0 ? GAUNTLET_SCALE.BONUS_SCRAP : 0);
                    game.currency += reward;
                    game.scrap += scrapReward;
                    if (game.resonance) game.earnResonance(40 * this.wave, `WAVE ${this.wave}`);
                    if (this.wave % 3 === 0) game.loot.push(new Loot(game.playerPosition[0] + 30, game.playerPosition[1], 'dark_element'));   // every 3rd wave
                    this._secured = [`+${reward} personics`, `+${scrapReward} scrap`, ...(this.wave % 3 === 0 ? ['Dark Element'] : []), ...(this._spoils || [])];
                    game.updateUI();
                    showMessage(`WAVE ${this.wave} CLEARED — +${reward} PERSONICS, +${scrapReward} SCRAP`);
                    this.waveDelay = 210; // 3.5 seconds between waves
                }
                this._hud(game);
            }

            end(game) {
                if (!this.active) return;
                this.active = false;
                this.waveDelay = 0;
                // Clean up
                lifeKit.sweep(game.enemies, (e) => e._gauntletWave);
                this.hostiles = [];
                if (this.wave > 0) {
                    showMessage(`GAUNTLET OVER — WAVE ${this.wave} — ${this.totalKills} KILLS`);
                    this._hud(game, true);
                } else this._hud(game);
            }
        }

