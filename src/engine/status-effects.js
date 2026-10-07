        // GameEngine — Status effects and melee. Methods are added to GameEngine.prototype (see
        // engineMixin in game-engine.js).
        //
        // Damage now has a type (takeDamage's opts.type: ballistic, energy, melee, bleed…), and an
        // actor can carry statuses that tick on game time. Bleeding is the first: each stack (up to
        // three) drains dps for its seconds, a fresh cut refreshes it, the ticks show as small
        // crimson numbers and leave a trail of drips; a blood-drop mark rides above them.
        //
        // Melee weapons (weaponMode 'melee', the Maiden's Kukri first) slash in an arc before her:
        // no projectile, nothing through walls, damage and bleeding, a gold arc, a quiet noise.

        const STATUS = { BLEED_MAX: 3, BLEED_TICK: 0.5 };

        engineMixin({
            /** Put a status on an actor: 'bleed' {dps, secs, by} */
            applyStatus(actor, kind, o = {}) {
                if (!actor || actor.dead) return;
                const S = actor._status || (actor._status = {}), now = _gameTimeSec;
                if (kind === 'bleed') {
                    const b = S.bleed;
                    if (b && now < b.until) { b.stacks = Math.min(STATUS.BLEED_MAX, b.stacks + 1); b.until = now + (o.secs || 3); b.dps = Math.max(b.dps, o.dps || 5); b.by = o.by || b.by; }
                    else S.bleed = { stacks: 1, dps: o.dps || 5, until: now + (o.secs || 3), next: now + STATUS.BLEED_TICK, by: o.by || null };
                }
            },

            /** Once per tick: statuses run their course */
            updateStatuses() {
                const now = _gameTimeSec;
                const tick = (a) => {
                    const S = a && a._status; if (!S || a.dead) return;
                    const b = S.bleed;
                    if (b) {
                        while (now >= b.next && b.next <= b.until) {
                            b.next += STATUS.BLEED_TICK;
                            if (b.by) { a.lastHitBy = b.by; a.lastHitMelee = true; }
                            a.takeDamage(b.dps * STATUS.BLEED_TICK * b.stacks, 0, 0, { type: 'bleed' });
                            if (a.dead) break;
                        }
                        if (now > b.until) delete S.bleed;
                    }
                };
                for (const e of this.enemies || []) tick(e);
                for (const t of this.teammates || []) tick(t);
            },

            /** The marks above whoever carries a status (world space, with the health bars) */
            drawStatusMarks(ctx, cull) {
                const now = _gameTimeSec;
                for (const e of this.enemies || []) {
                    const b = e._status && e._status.bleed; if (!b || e.dead) continue;
                    if (cull && (e.x < cull.left - 40 || e.x > cull.right + 40 || e.y < cull.top - 40 || e.y > cull.bottom + 40)) continue;
                    const x = e.x + 18, y = e.y - 32, pulse = 0.75 + 0.25 * Math.sin(now * 8);
                    ctx.save(); ctx.globalAlpha = pulse;
                    for (let i = 0; i < b.stacks; i++) {                          // a drop per stack
                        const dx = x + i * 5;
                        ctx.fillStyle = '#ff2a4a'; ctx.beginPath();
                        ctx.moveTo(dx, y - 4); ctx.quadraticCurveTo(dx + 3, y, dx, y + 2.4); ctx.quadraticCurveTo(dx - 3, y, dx, y - 4); ctx.fill();
                    }
                    ctx.restore();
                }
            },

            /** A small committed blade step, stopped by bodies and solids along the entire path. */
            meleeStepIn(angle, distance = 8) {
                const pl = this.player, map = this.activeMap;
                if (!pl || !map || this.isDriving || !Number.isFinite(angle) || !(distance > 0)) return 0;
                distance = Math.min(8, distance);
                const sx = pl.x, sy = pl.y, ux = Math.cos(angle), uy = Math.sin(angle), r = pl.radius || 12;
                const rects = [...(map.walls || []), ...getColliders(map)];
                const left = Math.min(sx, sx + ux * distance) - r, right = Math.max(sx, sx + ux * distance) + r;
                const top = Math.min(sy, sy + uy * distance) - r, bottom = Math.max(sy, sy + uy * distance) + r;
                const solids = this.useNewCollisionSystem ? GameEntity.registry.collidable.filter(e => {
                    if (e === pl || !e.active || e.dead || e.isTrigger || e.markedForDestroy
                        || !(e.collisionLayer & (GameEntity.LAYER.STATIC | GameEntity.LAYER.DYNAMIC | GameEntity.LAYER.VEHICLE | GameEntity.LAYER.ACTOR))) return false;
                    const b = e.getBoundingBox();
                    return b.x <= right && b.x + b.w >= left && b.y <= bottom && b.y + b.h >= top;
                }) : [];
                const leaves = [];
                if (this.roomSystem && this.roomSystem.active) for (const d of this.roomSystem.doors || []) {
                    if (d.type !== 'arch') for (const s of d.leaves()) leaves.push({ s, r: r + (d.halfThick || 0) });
                }
                const probe = Object.create(pl);
                const clear = (x, y) => {
                    if (x < r || y < r || x > map.width - r || y > map.height - r) return false;
                    for (const b of rects) {
                        const dx = x - Math.max(b.x, Math.min(b.x + b.w, x)), dy = y - Math.max(b.y, Math.min(b.y + b.h, y));
                        if (dx * dx + dy * dy < r * r) return false;
                    }
                    for (const leaf of leaves) {
                        const [ax, ay, bx, by] = leaf.s;
                        if (CollisionSystem.distToSegmentSquared(x, y, ax, ay, bx, by) < leaf.r * leaf.r) return false;
                    }
                    probe.x = x; probe.y = y;
                    for (const e of solids) if (CollisionSystem._checkCollision(probe, e)) return false;
                    return true;
                };
                let traveled = 0;
                for (let d = Math.min(1, distance); d <= distance; d = Math.min(distance, d + 1)) {
                    const x = sx + ux * d, y = sy + uy * d;
                    if (!clear(x, y)) break;
                    pl.x = x; pl.y = y; traveled = d;
                    if (d === distance) break;
                }
                return traveled;
            },

            /**
             * A melee weapon's slash: everyone in the arc before her within reach (and not behind a
             * wall) takes the blade's damage and starts to bleed. A gold arc, a swish, a quiet noise.
             */
            meleeSlash() {
                const W = this.currentWeapon, st = (W && W.stats) || {}, pl = this.player;
                this.shootCooldown = st.fireRate || 16;
                const side = this._slashSide = -(this._slashSide || 1);
                this._slashT = _gameTimeSec;
                const ang = pl.angle, reach = st.reach || 36, arc = st.arc || 1.4;
                this.meleeStepIn(ang);
                const walls = this.activeMap.walls, cols = getColliders(this.activeMap);
                let bladeDamage = st.damage || 25;
                if (this.resonance && this.flitState && _gameTimeSec - this.flitState.lastFlitAt <= this.resonance.stat('flitStrikeWindow', 1)) {
                    bladeDamage *= 1 + 0.2 * this.resonance.rank('flit_strike');
                }
                let hit = 0;
                for (const e of this.enemies) {
                    if (!e || e.dead) continue;
                    const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.hypot(dx, dy);
                    if (d > reach + (e.radius || 14)) continue;
                    if (Math.abs(normalizeAngle(Math.atan2(dy, dx) - ang)) > arc / 2 + (d < 18 ? 0.6 : 0)) continue;
                    if (isLineBlocked(pl.x, pl.y, e.x, e.y, walls, cols)) continue;
                    e.lastHitBy = pl; e.lastHitMelee = true;
                    const kx = dx / (d || 1) * 3, ky = dy / (d || 1) * 3;
                    const dmg = Math.round(bladeDamage);
                    if (!e.takeDamage(dmg, kx, ky, { type: st.damageType || 'melee' })) continue;
                    if (!e.dead && e.interruptMelee) e.interruptMelee();
                    if (st.bleedDps) this.applyStatus(e, 'bleed', { dps: st.bleedDps, secs: st.bleedSecs || 3, by: pl });
                    if (!e.dead && typeof Ganger !== 'undefined' && e instanceof Ganger) { e.suspicion = 100; e.state = 'ALERT'; e.angle = Math.atan2(-dy, -dx); }
                    hit++;
                }
                // the gold arc and its sparkle
                const L = this.slashes || (this.slashes = []);
                L.push({ x: pl.x, y: pl.y, a: ang, side, t0: _gameTimeSec, reach, arc, hit: hit > 0 });
                if (L.length > 8) L.shift();
                const fx = this.shotFx || (this.shotFx = []);
                for (let i = 0; i < (hit ? 8 : 3); i++) {
                    const a = ang + (Math.random() - 0.5) * arc, r = reach * (0.5 + Math.random() * 0.5);
                    fx.push({ k: 'dust', x: pl.x + Math.cos(a) * r, y: pl.y + Math.sin(a) * r, vx: Math.cos(a) * 0.4, vy: Math.sin(a) * 0.4, t: -i, life: 30, col: '#ffd76a', ph: Math.random() * 6.28 });
                }
                if (typeof ambience !== 'undefined' && ambience.slash) ambience.slash(hit > 0);
                this.emitNoise(pl.x, pl.y, st.noise || 60, 'slash');
                if (hit) this.triggerShake(2);
                return hit;
            },

            /** The blade's swing for the renderer: angle across the slash, and how far it reaches out (null at rest) */
            slashAngle() {
                if (this._slashT === undefined) return null;
                const t = (_gameTimeSec - this._slashT) / 0.22;
                if (t < 0 || t > 1) return null;
                const e = t < 0.6 ? 1 - Math.pow(1 - t / 0.6, 3) : 1, back = t < 0.6 ? 0 : (t - 0.6) / 0.4;
                const s = this._slashSide || 1;
                return { a: -s * (-1.25 + 2.5 * e) * (1 - back * 0.7), reach: 6 * Math.sin(Math.min(1, t * 1.6) * Math.PI) };
            },

            /** Slash arcs: a crescent of gold light where the blade went (world space) */
            drawSlashes(ctx) {
                const L = this.slashes; if (!L || !L.length) return;
                const now = _gameTimeSec;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (let i = L.length - 1; i >= 0; i--) {
                    const s = L[i], age = now - s.t0;
                    if (age > 0.3) { L.splice(i, 1); continue; }
                    const k = 1 - age / 0.3, a0 = s.a - s.arc / 2, a1 = s.a + s.arc / 2;
                    const from = s.side > 0 ? a0 : a1, to = s.side > 0 ? a1 : a0, prog = Math.min(1, age / 0.13);
                    const end = from + (to - from) * prog, r = s.reach * 0.92;
                    for (const [w, col, al] of [[7, '255, 200, 100', 0.25], [3, '255, 231, 160', 0.6], [1.2, '255, 250, 230', 0.9]]) {
                        ctx.strokeStyle = `rgba(${col}, ${al * k})`; ctx.lineWidth = w; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.arc(s.x, s.y, r, Math.min(from, end), Math.max(from, end)); ctx.stroke();
                    }
                }
                ctx.restore();
            }
        });
