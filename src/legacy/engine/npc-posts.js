        // GameEngine — Posts. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // A map's standing people (Anavia, the bartender, Mirabel in her lounge, the dancers…) keep a
        // post: where they stood when the map loaded, and the way they faced. Shove one (bump into
        // them, push through, a stray round) and once they've stopped being pushed they walk back
        // (Walker.goTo, round furniture on the nav grid) and turn to face the way they did.
        // The lobby's and club's crowds already find their way back to their spots on their own;
        // teammates follow her; gangers have their own minds. A scene can place people where it
        // likes: whatever a scene (or a deliberate walk) leaves them at becomes their new post.

        const NPC_POST = {
            DRIFT: 7,        // px off the post before it counts as moved
            SETTLE: 0.7,     // s with no more shoving before they head back
            SPEED: 1.3,      // an unhurried walk back
            RETRY: 2.5       // s before trying again when the way back was blocked
        };

        engineMixin({
            /** Once a sim tick, after Walker.update */
            updateNpcPosts() {
                const map = this.activeMap; if (!map || !this.npcs) return;
                const scene = !!(this.scenes && this.scenes.running), now = _gameTimeSec;
                for (const n of this.npcs) {
                    if (!(n instanceof NPC) || n.dead || n.inCar || n.hired || this.teammates.includes(n)) continue;
                    const P = n._post;
                    const walking = typeof Walker !== 'undefined' && Walker.isWalking(n);
                    // (Re)take the post: a new map, during a scene, or on someone else's walk
                    if (!P || P.map !== map || scene || (walking && !n._postReturn)) {
                        n._post = { map, x: n.x, y: n.y, a: n.angle || 0 };
                        n._postReturn = null; n._postLX = n.x; n._postLY = n.y; n._postT = now;
                        continue;
                    }
                    if (n._postReturn) {                                       // on the way back
                        if (!walking) n._postReturn = null;
                        continue;
                    }
                    // Still being shoved? (moved since last tick)
                    if (Math.abs(n.x - n._postLX) > 0.05 || Math.abs(n.y - n._postLY) > 0.05) { n._postT = now; n._postLX = n.x; n._postLY = n.y; }
                    const d = Math.hypot(n.x - P.x, n.y - P.y);
                    if (d <= NPC_POST.DRIFT || now - n._postT < NPC_POST.SETTLE || now < (n._postRetry || 0)) continue;
                    // Head back; when they get there, face the way they did
                    n._postReturn = Walker.goTo(n, P.x, P.y, {
                        face: P.a, speed: NPC_POST.SPEED, arrive: 3, timeout: 240,
                        onArrive: () => { n._postReturn = null; n._postLX = n.x; n._postLY = n.y; },
                        onFail: () => { n._postReturn = null; n._postRetry = _gameTimeSec + NPC_POST.RETRY; n._postLX = n.x; n._postLY = n.y; }
                    });
                }
            }
        });
