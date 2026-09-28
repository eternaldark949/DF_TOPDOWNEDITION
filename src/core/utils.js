        // ============================================================================
        //  SHARED UTILITIES — Consolidated from repeated inline patterns
        // ============================================================================
        
        /** Clamp a value between min and max. */
        function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
        
        /** Reset humanoid animation state after a teleport/position snap. Prevents limb splay. */
        function resetHumanoidAnim(entity) {
            entity.velX = 0;
            entity.velY = 0;
            entity.walkPhase = 0;
            if (entity.lastX !== undefined) { entity.lastX = entity.x; entity.lastY = entity.y; }
            const g = entity._gait;
            if (g) {
                g.prevX = entity.x; g.prevY = entity.y;
                g.cmdX = 0; g.cmdY = 0;
                g.speed = 0;
                g.phasePrev = 0;
                g.tick = _simTick;
            }
        }

        // =====================================================================
        //  SHARED GAIT CONTROLLER — see CONFIG.GAIT for the formula
        // =====================================================================
        //  Movers report the step they INTEND to take via gaitCommand(); the
        //  controller compares it with how far the body ACTUALLY moved and uses
        //  the smaller. So knockback, separation nudges and collision push-outs
        //  don't read as walking, and nobody strides in place against a wall.
        //  An entity that has never reported a command falls back to measured
        //  displacement, so any mover that isn't hooked up still animates.

        /** Sim tick counter — advanced once per fixed update step in GameEngine.update(). */
        let _simTick = 0;

        /** Smooth GAME time in seconds for draw code: advances with sim ticks (so it
         *  follows CONFIG.LOOP.GAME_SPEED and stops while paused), blended between
         *  ticks. Use it for world motion drawn from a clock (foliage sway, bobbing);
         *  keep _frameTime for real-time effects like light flicker and UI. */
        let _gameTimeSec = 0;

        /** Stand-in for throwaway render proxies with no position (VFX silhouettes). */
        const _STATIC_GAIT = Object.freeze({ speed: 0, dirX: 1, dirY: 0 });

        function _ensureGait(entity) {
            let g = entity._gait;
            if (!g) {
                const a = entity.angle || 0;
                g = entity._gait = {
                    tick: _simTick,
                    prevX: entity.x, prevY: entity.y,
                    cmdX: 0, cmdY: 0,
                    driven: false,
                    speed: 0,
                    dirX: Math.cos(a), dirY: Math.sin(a)
                };
                if (entity.walkPhase === undefined) entity.walkPhase = 0;
            }
            return g;
        }

        /** Report this tick's intended step (px/tick). Call BEFORE applying the move. */
        function gaitCommand(entity, vx, vy) {
            const g = _ensureGait(entity);
            g.cmdX += vx;
            g.cmdY += vy;
            g.driven = true;
        }

        /** Walk-phase radians advanced per tick at a given speed. */
        function humanoidCadence(speed) {
            return speed > 0 ? CONFIG.GAIT.CADENCE * Math.sqrt(speed) : 0;
        }

        /** Humanoid stance that fits a weapon id (rifle / sniper hold two-handed). */
        function stanceForWeapon(id) {
            if (!id) return 'pistol';
            if (id.includes('sniper')) return 'sniper';
            if (id.includes('rifle')) return 'rifle';
            return 'pistol';
        }

        /** Barrel tip of a drawWeapon() shape in the weapon's own coords (scale 1).
         *  Mirrors drawWeapon's shape order so the id resolves to the same model. */
        function weaponMuzzleLocal(type) {
            if (type.includes('pistol')) return { x: 12, y: 1 };
            if (type.includes('sniper')) return { x: 55, y: 0.5 };
            if (type.includes('rifle'))  return { x: 28, y: 1.5 };
            if (type.includes('golden')) return { x: 20, y: 1 };
            return { x: 12, y: 1 };
        }

        /** World position of an actor's drawn muzzle if it faced `dirAngle` (falls back to its
         *  centre if no weapon has been drawn). The renderer records ent._muzzleLocal each
         *  frame in the actor's own frame (x forward, y to its right). */
        function muzzleWorld(ent, dirAngle) {
            const m = ent._muzzleLocal;
            if (!m) return { x: ent.x, y: ent.y };
            const c = Math.cos(dirAngle), s = Math.sin(dirAngle);
            return { x: ent.x + m.x * c - m.y * s, y: ent.y + m.x * s + m.y * c };
        }

        /** Shot origin + direction for an actor facing `dirAngle`: leaves from the muzzle and
         *  converges on (tx, ty) so the round lands where it was aimed, not a hand's width to
         *  the side. Aim points closer than 80px (or none) fire straight along the facing. */
        function aimFromMuzzle(ent, dirAngle, tx, ty) {
            let m = muzzleWorld(ent, dirAngle);
            // A long barrel poked through a wall (standing right against it): fire from the
            // body instead, so the round hits the wall rather than starting on the far side
            const map = (typeof game !== 'undefined' && game.activeMap) ? game.activeMap : null;
            if (map && (m.x !== ent.x || m.y !== ent.y) && isLineBlocked(ent.x, ent.y, m.x, m.y, map.walls || [], getColliders(map))) {
                m = { x: ent.x, y: ent.y };
            }
            let angle = dirAngle;
            if (tx !== undefined && tx !== null && Math.hypot(tx - ent.x, ty - ent.y) > 80) {
                angle = Math.atan2(ty - m.y, tx - m.x);
            }
            return { x: m.x, y: m.y, angle };
        }

        /** Recoil kick 0..1 for an NPC shooter: snaps back on the shot (ent._shotTick),
         *  recovers over `ticks`, blended between ticks like everything else. */
        function shotKick(ent, ticks = 6) {
            if (ent._shotTick === undefined) return 0;
            const a = RenderInterp.stepAdvanced ? RenderInterp.alpha : 1;
            const s = Math.max(0, _simTick - ent._shotTick - 1 + a);
            return Math.max(0, 1 - s / ticks);
        }

        /** Punch strike 0..1 from ticks since the punch started (fractional ticks OK). */
        function humanoidPunchCurve(t) {
            const P = CONFIG.PUNCH;
            if (!(t > 0)) return 0;
            if (t < P.EXTEND_TICKS) { const u = t / P.EXTEND_TICKS; return 1 - (1 - u) * (1 - u); }
            t -= P.EXTEND_TICKS;
            if (t < P.HOLD_TICKS) return 1;
            t -= P.HOLD_TICKS;
            if (t < P.RETRACT_TICKS) { const u = t / P.RETRACT_TICKS; return 1 - u * u * (3 - 2 * u); }
            return 0;
        }

        /** Foot swing amplitude (px) that keeps the planted foot from sliding. */
        function humanoidStrideLength(speed) {
            if (speed <= 0) return 0;
            const G = CONFIG.GAIT;
            const noSlip = (Math.PI * speed) / (2 * humanoidCadence(speed));
            return Math.min(G.MAX_STRIDE, noSlip * G.SLIP_FACTOR);
        }

        /**
         * Bring an entity's gait up to the current sim tick. Safe to call any
         * number of times per render: it only does work when ticks have passed,
         * and it averages over however many ticks ran since the last call, so
         * zero-step and multi-step renders produce the same animation.
         * @returns {{speed:number, dirX:number, dirY:number}} smoothed speed (px/tick) and unit travel direction
         */
        function syncHumanoidGait(entity) {
            if (typeof entity.x !== 'number' || typeof entity.y !== 'number') return _STATIC_GAIT;
            const g = _ensureGait(entity);
            const steps = _simTick - g.tick;
            if (steps <= 0) return g;
            const G = CONFIG.GAIT;

            const dx = entity.x - g.prevX;
            const dy = entity.y - g.prevY;
            const actual = Math.hypot(dx, dy) / steps;
            let target = 0, dirX = 0, dirY = 0;

            if (actual > G.SNAP_DIST) {
                // Teleport / position snap — not walking
                g.speed = 0;
            } else if (g.driven) {
                const cx = g.cmdX / steps, cy = g.cmdY / steps;
                const cmd = Math.hypot(cx, cy);
                target = Math.min(cmd, actual);
                if (actual < cmd * 0.8 && actual > 1e-3) { dirX = dx; dirY = dy; }  // blocked: step along the real path (wall slide)
                else if (cmd > 1e-3) { dirX = cx; dirY = cy; }
            } else {
                target = actual;
                if (actual > 1e-3) { dirX = dx; dirY = dy; }
            }

            const dLen = Math.hypot(dirX, dirY);
            if (dLen > 0) { g.dirX = dirX / dLen; g.dirY = dirY / dLen; }

            if (steps > G.MAX_CATCHUP_TICKS) g.speed = target;
            else g.speed += (target - g.speed) * (1 - Math.pow(1 - G.SMOOTHING, steps));
            if (g.speed < G.STOP_SPEED) g.speed = 0;

            entity.walkPhase = (entity.walkPhase || 0) + humanoidCadence(g.speed) * steps;
            // Phase one tick back, so the renderer can blend walk phase in step
            // with the interpolated body position (see RenderInterp).
            g.phasePrev = entity.walkPhase - humanoidCadence(g.speed);

            g.prevX = entity.x; g.prevY = entity.y;
            g.cmdX = 0; g.cmdY = 0;
            g.tick = _simTick;
            return g;
        }

        // =====================================================================
        //  RENDER INTERPOLATION
        // =====================================================================
        //  When ticks run slower than frames (CONFIG.LOOP.GAME_SPEED < 1, or a
        //  high-refresh display), drawing the latest tick as-is makes motion
        //  step at the tick rate. Instead, everything that moves per tick is
        //  drawn at a blend of its previous and current tick state:
        //
        //    snapshot()  — before each sim step, remember the tracked fields
        //    apply()     — before draw, swap in the blended values
        //    restore()   — after draw, put the true simulation values back
        //
        //  Tracked: every non-static entity (position, facing, and animation
        //  counters on non-humanoids), the camera (zoom, cutscene moves), and the
        //  non-entity world effects listed in _sources() — weather particles,
        //  rain, splashes, leaves, graveyard ghosts, flit trails, markers and the
        //  Ferris wheel. The simulation never sees blended values. If a draw
        //  method itself writes a tracked field (NPC.draw sets its facing), that
        //  write wins and is left in place. Teleports (moves > INTERP_SNAP_DIST)
        //  aren't blended. Objects reused from a pool are marked fresh on reuse
        //  so they never blend from their previous life.
        const RenderInterp = {
            gen: 0,          // snapshot generation, bumped every sim step
            alpha: 1,        // blend for the current draw: 0 = previous tick, 1 = latest
            stepAdvanced: false,  // did the last step actually advance the world (not paused)?
            _tickAtSnap: 0,
            _swapped: [],
            _camSwapped: false,

            // Animation counters some non-humanoid entities advance per tick
            // (the cat's walk/tail, the drone's hover). Humanoids are excluded:
            // their walk phase is blended by the renderer from the gait state.
            ENTITY_SCALARS: ['walkPhase', 'tailPhase', 'hoverOffset'],
            _ENTITY_SPEC: { pos: true, angles: ['angle'], scalars: null },
            _HUMANOID_SPEC: { pos: true, angles: ['angle'], scalars: null },

            /** Non-entity world things that change per tick, and which fields to blend. */
            _sources(game) {
                const w = game.weather, L = game.leafParticles, m = game.activeMap;
                const out = [];
                if (w) out.push({ items: w.particles, pos: true, angles: ['angle'], scalars: ['life'] });
                // (Rain drops and splashes are too numerous to swap cheaply; their draw
                //  code steps them back by lagTicks() instead — see drawRainOverlay.)
                if (L) out.push({ items: L.leaves, pos: true, scalars: ['rotation', 'tumble'] });
                if (game.graveyardGhosts) out.push({ items: game.graveyardGhosts, pos: true, angles: ['angle'], scalars: ['life'] });
                if (game.flitVFX) out.push({ items: game.flitVFX, scalars: ['ghostAlpha', 'trailLife', 'arrivalGlow'] });
                if (game.lastKnownMarkers) out.push({ items: game.lastKnownMarkers, scalars: ['opacity'] });
                if (m && m.ferrisWheel) out.push({ items: [m.ferrisWheel], angles: ['angle'] });
                return out;
            },

            /** How far (0..1 ticks) the drawn frame lags the latest sim state. Draw code
             *  for large batches with simple per-tick motion (rain) uses this to step
             *  back instead of being swapped. 0 when paused or not interpolating. */
            lagTicks() { return (this.stepAdvanced && this.alpha < 1) ? 1 - this.alpha : 0; },

            _snapObj(o, spec, gen) {
                const p = o._ipP || (o._ipP = {}), A = spec.angles, S = spec.scalars;
                if (spec.pos) { p.x = o.x; p.y = o.y; }
                if (A) for (let i = 0; i < A.length; i++) p[A[i]] = o[A[i]];
                if (S) for (let i = 0; i < S.length; i++) p[S[i]] = o[S[i]];
                o._ipGen = gen;
            },

            /** Swap blended values into o. Returns true if anything was swapped. */
            _applyObj(o, spec, alpha, snap) {
                if (o._ipGen !== this.gen) return false;             // spawned or reused during this step
                const p = o._ipP, A = spec.angles, S = spec.scalars;
                // Fast path: most tracked things (lamps, parked props) didn't change this tick
                let changed = spec.pos && (o.x !== p.x || o.y !== p.y);
                if (!changed && A) for (let i = 0; i < A.length; i++) { if (o[A[i]] !== p[A[i]]) { changed = true; break; } }
                if (!changed && S) for (let i = 0; i < S.length; i++) { if (o[S[i]] !== p[S[i]]) { changed = true; break; } }
                if (!changed) return false;
                if (spec.pos && (Math.abs(o.x - p.x) > snap || Math.abs(o.y - p.y) > snap)) return false;  // teleport

                const live = o._ipLive || (o._ipLive = {});
                const drawn = o._ipDrawn || (o._ipDrawn = {});
                const keys = o._ipKeys || (o._ipKeys = []);
                keys.length = 0;
                if (spec.pos && (o.x !== p.x || o.y !== p.y)) {
                    live.x = o.x; o.x = p.x + (o.x - p.x) * alpha; drawn.x = o.x; keys.push('x');
                    live.y = o.y; o.y = p.y + (o.y - p.y) * alpha; drawn.y = o.y; keys.push('y');
                }
                if (A) for (let i = 0; i < A.length; i++) {
                    const f = A[i], a = o[f], a0 = p[f];
                    if (typeof a !== 'number' || typeof a0 !== 'number' || a === a0) continue;
                    let d = a - a0;
                    while (d > Math.PI) d -= Math.PI * 2;
                    while (d < -Math.PI) d += Math.PI * 2;
                    live[f] = a; o[f] = a0 + d * alpha; drawn[f] = o[f]; keys.push(f);
                }
                if (S) for (let i = 0; i < S.length; i++) {
                    const f = S[i], v = o[f], v0 = p[f];
                    if (typeof v !== 'number' || typeof v0 !== 'number' || v === v0 || !isFinite(v) || !isFinite(v0)) continue;
                    live[f] = v; o[f] = v0 + (v - v0) * alpha; drawn[f] = o[f]; keys.push(f);
                }
                return keys.length > 0;
            },

            _restoreObj(o) {
                const keys = o._ipKeys;
                for (let i = 0; i < keys.length; i++) {
                    const f = keys[i];
                    if (o[f] === o._ipDrawn[f]) o[f] = o._ipLive[f];
                }
                keys.length = 0;
                o._ipActive = false;
            },

            _entitySpec(e) {
                if (e._gait) return this._HUMANOID_SPEC;
                const s = this._ENTITY_SPEC;
                s.scalars = this.ENTITY_SCALARS;
                return s;
            },

            snapshot(game) {
                const gen = ++this.gen;
                this._tickAtSnap = _simTick;
                const all = GameEntity.registry.all;
                for (let i = 0; i < all.length; i++) {
                    const e = all[i];
                    if (e.isStatic) continue;
                    this._snapObj(e, this._entitySpec(e), gen);
                }
                for (const src of this._sources(game)) {
                    const items = src.items;
                    if (!items) continue;
                    for (let i = 0; i < items.length; i++) if (items[i]) this._snapObj(items[i], src, gen);
                }
                const c = game.camera;
                if (c) { c._ipX = c.x; c._ipY = c.y; c._ipZoom = c.zoom; c._ipGen = gen; }
            },

            apply(game, alpha) {
                this.stepAdvanced = _simTick > this._tickAtSnap;
                this.alpha = alpha;
                this._swapped.length = 0;
                this._camSwapped = false;
                if (!(alpha < 1)) return;
                const gen = this.gen;
                const snap = CONFIG.LOOP.INTERP_SNAP_DIST;

                const all = GameEntity.registry.all;
                for (let i = 0; i < all.length; i++) {
                    const e = all[i];
                    if (e._ipGen !== gen) continue;
                    const p = e._ipP;
                    // Fast skip for the many entities that didn't change (lamps, parked props)
                    if (e.x === p.x && e.y === p.y && e.angle === p.angle &&
                        (e._gait || (e.walkPhase === p.walkPhase && e.tailPhase === p.tailPhase && e.hoverOffset === p.hoverOffset))) continue;
                    // Humanoids: bring the walk gait up to date from TRUE positions first
                    if (e._gait && (e.x !== e._ipP.x || e.y !== e._ipP.y)) syncHumanoidGait(e);
                    if (this._applyObj(e, this._entitySpec(e), alpha, snap)) {
                        e._ipActive = true;
                        this._swapped.push(e);
                    }
                }
                for (const src of this._sources(game)) {
                    const items = src.items;
                    if (!items) continue;
                    for (let i = 0; i < items.length; i++) {
                        const o = items[i];
                        if (!o || o._ipGen !== gen) continue;
                        if (o._gait && (o.x !== o._ipP.x || o.y !== o._ipP.y)) syncHumanoidGait(o);  // graveyard ghosts
                        if (this._applyObj(o, src, alpha, snap)) {
                            o._ipActive = true;
                            this._swapped.push(o);
                        }
                    }
                }

                // Camera: zoom always; position only when a cutscene drives it
                // (otherwise draw() derives it from the already-blended player).
                const c = game.camera;
                if (c && c._ipGen === gen) {
                    c._ipLiveX = c.x; c._ipLiveY = c.y; c._ipLiveZoom = c.zoom;
                    c.zoom = c._ipZoom + (c.zoom - c._ipZoom) * alpha;
                    if (game.cutscene && game.cutscene.active &&
                        Math.abs(c.x - c._ipX) <= snap && Math.abs(c.y - c._ipY) <= snap) {
                        c.x = c._ipX + (c.x - c._ipX) * alpha;
                        c.y = c._ipY + (c.y - c._ipY) * alpha;
                    }
                    c._ipDrawX = c.x; c._ipDrawY = c.y; c._ipDrawZoom = c.zoom;
                    this._camSwapped = true;
                }
            },

            restore(game) {
                const list = this._swapped;
                for (let i = 0; i < list.length; i++) this._restoreObj(list[i]);
                list.length = 0;
                if (this._camSwapped) {
                    const c = game.camera;
                    if (c.zoom === c._ipDrawZoom) c.zoom = c._ipLiveZoom;
                    if (game.cutscene && game.cutscene.active) {
                        if (c.x === c._ipDrawX) c.x = c._ipLiveX;
                        if (c.y === c._ipDrawY) c.y = c._ipLiveY;
                    }
                    this._camSwapped = false;
                }
                this.alpha = 1;
            }
        };

