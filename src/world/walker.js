        // ============================================================================
        //  WALKER — "go to" for any procedural humanoid (the player, NPCs, teammates…)
        //  Walker.goTo(actor, x, y, { face, speed, arrive, timeout, via, onArrive, onFail })
        //  (`via`: [[x, y], …] points to pass on the way, e.g. round a car the nav grid doesn't know)
        //  walks the actor along the nav grid (actorSteer), eases into the spot, turns to
        //  `face` (an angle or an [x, y] point), then calls onArrive. No progress for
        //  `timeout` ticks: onFail. Returns { done(), ok(), cancel() } — the scene runner's
        //  waitable, so `yield Walker.goTo(npc, x, y)` works in scenes.
        //  The player isn't moved here: while a walk owns her, engine/update.js feeds
        //  stepPlayer()'s direction in as her movement input (so walls, cars, the map edge
        //  and facing all behave), and any real input takes the controls back.
        //  Everyone else is stepped by Walker.update(game), once a sim tick.
        // ============================================================================
        const Walker = {
            walks: [],

            goTo(actor, x, y, o = {}) {
                this.cancel(actor);
                const isPlayer = typeof game !== 'undefined' && actor === game.player;
                // A goal on furniture or in a wall: the nearest spot a body can stand
                const nav = typeof game !== 'undefined' && game.activeMap ? NavGrid.for(game.activeMap) : null;
                if (nav && !nav.walkable(x, y)) { const f = nav.nearestFree(x, y, 6); if (f !== null && f !== undefined) { x = nav.cx(f); y = nav.cy(f); } }
                const pts = (o.via || []).concat([[x, y]]).map(([px, py]) => {
                    if (nav && !nav.walkable(px, py)) { const f = nav.nearestFree(px, py, 6); if (f !== null) return [nav.cx(f), nav.cy(f)]; }
                    return [px, py];
                });
                actor._navPath = null;
                const w = { actor, x: pts[0][0], y: pts[0][1], pts: pts.slice(1), face: o.face, speed: o.speed || 1.5, arrive: o.arrive ?? 6, timeout: o.timeout ?? 300,
                            onArrive: o.onArrive, onFail: o.onFail, state: 'walk', best: Infinity, stuck: 0, isPlayer, map: typeof game !== 'undefined' ? game.activeMap : null };
                if (isPlayer) actor._walk = w; else this.walks.push(w);
                return { done: () => w.state !== 'walk' && w.state !== 'turn', ok: () => w.state === 'arrived', cancel: () => this._end(w, 'cancelled') };
            },

            /** Stop whatever walk this actor is on (no callbacks). */
            cancel(actor) {
                if (actor && actor._walk) this._end(actor._walk, 'cancelled');
                const w = this.walks.find(o => o.actor === actor);
                if (w) this._end(w, 'cancelled');
            },

            isWalking(actor) { return !!(actor && (actor._walk || this.walks.some(o => o.actor === actor))); },

            _end(w, state) {
                if (w.state !== 'walk' && w.state !== 'turn') return;
                w.state = state;
                w.actor._navPath = null;
                if (w.isPlayer && w.actor._walk === w) w.actor._walk = null;
                const i = this.walks.indexOf(w); if (i >= 0) this.walks.splice(i, 1);
                if (state === 'arrived' && w.onArrive) w.onArrive();
                if (state === 'failed' && w.onFail) w.onFail();
            },

            /** Arrived or still turning to face: true while the walk is done moving (and handles the turn). */
            _settle(w) {
                const a = w.actor;
                if (w.face != null) {
                    const target = typeof w.face === 'number' ? w.face : Math.atan2(w.face[1] - a.y, w.face[0] - a.x);
                    const da = Math.atan2(Math.sin(target - (a.angle || 0)), Math.cos(target - (a.angle || 0)));
                    w.state = 'turn';
                    if (Math.abs(da) > 0.03) { a.angle = (a.angle || 0) + Math.sign(da) * Math.min(Math.abs(da), 0.22); return; }
                    a.angle = target;
                }
                this._end(w, 'arrived');
            },

            _progress(w, d) {
                const wp = navWaypoint(w.actor, w.x, w.y, w.map);
                const remaining = Number.isFinite(wp.remaining) ? wp.remaining : d;   // no route yet: straight-line progress counts
                if (remaining < w.best - 1) { w.best = remaining; w.stuck = 0; return true; } // useful progress along the route, including detours
                if (++w.stuck > w.timeout) { this._end(w, 'failed'); return false; }
                return true;
            },

            /** The player's walk this tick: a movement input {x, y} (|v| ≤ 1), or null once she's there. */
            stepPlayer(game) {
                const w = game.player._walk;
                if (!w) return null;
                if (w.map !== game.activeMap) { this._end(w, 'cancelled'); return null; }
                const a = game.player, d = Math.hypot(w.x - a.x, w.y - a.y);
                if (w.state !== 'turn' && d <= Math.max(w.arrive, 8) && w.pts.length) { [w.x, w.y] = w.pts.shift(); w.best = Infinity; w.stuck = 0; return this.stepPlayer(game); }   // a via point: on to the next
                if (w.state === 'turn' || d <= w.arrive) { this._settle(w); return { x: 0, y: 0 }; }
                if (!this._progress(w, d)) return null;
                const s = actorSteer(a, w.x, w.y, 1, game.activeMap), m = Math.hypot(s.x, s.y) || 1;
                const ease = Math.min(1, Math.max(0.3, d / 26));                 // slow into the spot
                return { x: s.x / m * ease, y: s.y / m * ease };
            },

            /** Steps every non-player walk (NPCs, teammates, scene extras): once a sim tick. */
            update(game) {
                const map = game.activeMap; if (!map) return;
                for (let i = this.walks.length - 1; i >= 0; i--) {
                    const w = this.walks[i], a = w.actor;
                    if (!a || a.dead || w.map !== map) { this._end(w, 'cancelled'); continue; }
                    let d = Math.hypot(w.x - a.x, w.y - a.y);
                    if (w.state !== 'turn' && d <= Math.max(w.arrive, 8) && w.pts.length) { [w.x, w.y] = w.pts.shift(); w.best = Infinity; w.stuck = 0; d = Math.hypot(w.x - a.x, w.y - a.y); }
                    if (w.state === 'turn' || d <= w.arrive) { gaitCommand(a, 0, 0); this._settle(w); continue; }
                    if (!this._progress(w, d)) continue;
                    const sp = w.speed * Math.min(1, Math.max(0.35, d / 20));
                    const s = actorSteer(a, w.x, w.y, sp, map);
                    gaitCommand(a, s.x, s.y); a.x += s.x; a.y += s.y;
                    if (Math.abs(s.x) + Math.abs(s.y) > 0.05) a.angle = Math.atan2(s.y, s.x);
                }
            }
        };
