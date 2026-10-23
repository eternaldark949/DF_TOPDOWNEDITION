        // GameEngine — Status effects and melee. Methods are added to GameEngine.prototype (see
        // engineMixin in game-engine.js).
        //
        // Damage now has a type (takeDamage's opts.type: ballistic, energy, melee, bleed…), and an
        // actor can carry statuses that tick on game time. Bleeding is the first: each stack (up to
        // three) drains dps for its seconds, a fresh cut refreshes it, the ticks show as small
        // crimson numbers and leave a trail of drips; a blood-drop mark rides above them.
        //
        // Melee weapons (weaponMode 'melee': the Maiden's Kukri, Blood Pact) slash in an arc before her:
        // no projectile, nothing through walls, damage and bleeding, an arc in the blade's colour, a
        // quiet noise. Each cut rolls its own crit per target (engine/combat-fx.js). A blade's stats
        // can slow its swing (swingSecs, the Kukri's 0.22 s by default); its model names the edge
        // the trail follows and the trail's colours (ui/weapon-models.js).

        const STATUS = { BLEED_MAX: 3, BLEED_TICK: 0.5 };

        // The Kukri's trail: its gold edge tip (model units) and three strokes [width, 'r, g, b', alpha]
        const DEFAULT_SLASH_TRAIL = { edge: [19.4, 2.6], dust: '#ffd76a',
            cols: [[7, '255, 200, 100', .22], [3, '255, 231, 160', .55], [1.2, '255, 250, 230', .85]] };

        // One game-time pose for the arm, the held blade and its trailing edge. `secs` stretches the
        // whole swing (a heavier blade); the phases keep their shares of it.
        const MELEE_SWING = { duration: .22, windup: .0264, cutEnd: .1584 };

        /* A long blade's swing (a model with swing: 'wide', Blood Pact): two hands on the grip, she
           winds the blade far back to one side, then sweeps it round in front of her in one wide arc
           (the hands travel a half-circle about her chest), body turning with it, and settles back to
           a two-handed guard. Phases are shares of the swing's time; the left hand rides the grip,
           WIDE_SWING.grip model units behind the right. */
        const WIDE_SWING = { windup: .22, cutEnd: .7, guard: { a: .3, handX: 11, handY: 3 },
            centerX: 2, radius: 16, handArc: 1.25, bladeArc: 2.0, twist: .45, grip: 6.2 };
        function _wideHand(theta, out) {
            out.handX = WIDE_SWING.centerX + WIDE_SWING.radius * Math.cos(theta);
            out.handY = WIDE_SWING.radius * Math.sin(theta);
        }
        function sampleWideSwing(u, sign, out) {
            const W = WIDE_SWING, G = W.guard, smooth = x => x * x * (3 - 2 * x);
            if (u < W.windup) {                                                     // wind back to one side
                const w = smooth(u / W.windup);
                _wideHand(sign * W.handArc, out);
                out.handX = G.handX + (out.handX - G.handX) * w; out.handY = G.handY + (out.handY - G.handY) * w;
                out.a = G.a + (sign * W.bladeArc - G.a) * w; out.twist = sign * W.twist * w;
            } else if (u <= W.cutEnd) {                                             // the sweep across her front
                const p = smooth((u - W.windup) / (W.cutEnd - W.windup));
                _wideHand(sign * W.handArc * (1 - 2 * p), out);
                out.a = sign * W.bladeArc * (1 - 2 * p); out.twist = sign * W.twist * Math.cos(p * Math.PI);
            } else {                                                                // the follow-through settles to guard
                const r = smooth((u - W.cutEnd) / (1 - W.cutEnd));
                _wideHand(-sign * W.handArc, out);
                out.handX += (G.handX - out.handX) * r; out.handY += (G.handY - out.handY) * r;
                out.a = -sign * W.bladeArc + (G.a + sign * W.bladeArc) * r; out.twist = -sign * W.twist * (1 - r);
            }
            out.reach = out.handX - 8;
            return wideGrip(out);
        }
        /** The left hand on a long blade's grip, behind the right (sets lHandX/lHandY on a pose) */
        function wideGrip(pose) {
            pose.lHandX = pose.handX - WIDE_SWING.grip * Math.cos(pose.a);
            pose.lHandY = pose.handY - WIDE_SWING.grip * Math.sin(pose.a);
            return pose;
        }
        /** A swing style's phase times, as shares of the swing */
        function swingPhases(style) {
            return style === 'wide' ? WIDE_SWING : { windup: MELEE_SWING.windup / MELEE_SWING.duration, cutEnd: MELEE_SWING.cutEnd / MELEE_SWING.duration };
        }

        function sampleMeleeSwing(age, side, out = {}, secs = MELEE_SWING.duration, style = 'knife') {
            if (style === 'wide') return age < 0 || age > secs ? null : sampleWideSwing(age / secs, side || 1, out);
            age *= MELEE_SWING.duration / secs;
            if (age < 0 || age > MELEE_SWING.duration) return null;
            const smooth = x => x * x * (3 - 2 * x);
            const sign = side || 1;
            let a, x, y, twist;
            if (age < MELEE_SWING.windup) {
                const w = smooth(age / MELEE_SWING.windup);
                a = .35 + (sign * 1.15 - .35) * w;
                x = 8; y = 9 + sign * 8 * w; twist = sign * .18 * w;
            } else if (age <= MELEE_SWING.cutEnd) {
                const p = smooth((age - MELEE_SWING.windup) / (MELEE_SWING.cutEnd - MELEE_SWING.windup));
                a = sign * (1.15 - 2.3 * p);
                x = 8 + 14 * Math.sin(p * Math.PI);
                y = 9 + sign * 8 * Math.cos(p * Math.PI);
                twist = sign * .18 * Math.cos(p * Math.PI);
            } else {
                const r = smooth((age - MELEE_SWING.cutEnd) / (MELEE_SWING.duration - MELEE_SWING.cutEnd));
                a = -sign * 1.15 + (.35 + sign * 1.15) * r;
                x = 8; y = 9 - sign * 8 * (1 - r); twist = -sign * .18 * (1 - r);
            }
            out.a = a; out.handX = x; out.handY = y; out.twist = twist; out.reach = x - 8;
            return out;
        }

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
                // Something she already touches only blocks a step that takes her deeper into it (backed
                // against a wall or brushing a passer-by, she can still step away from it toward the target)
                const rectD2 = (b, x, y) => { const dx = x - Math.max(b.x, Math.min(b.x + b.w, x)), dy = y - Math.max(b.y, Math.min(b.y + b.h, y)); return dx * dx + dy * dy; };
                const ec = e => { const b = e.getBoundingBox(); return [b.x + b.w / 2, b.y + b.h / 2]; };
                const clear = (x, y) => {
                    if (x < r || y < r || x > map.width - r || y > map.height - r) return false;
                    for (const b of rects) {
                        const d2 = rectD2(b, x, y);
                        if (d2 < r * r && d2 <= rectD2(b, sx, sy)) return false;
                    }
                    for (const leaf of leaves) {
                        const [ax, ay, bx, by] = leaf.s, d2 = CollisionSystem.distToSegmentSquared(x, y, ax, ay, bx, by);
                        if (d2 < leaf.r * leaf.r && d2 <= CollisionSystem.distToSegmentSquared(sx, sy, ax, ay, bx, by)) return false;
                    }
                    probe.x = x; probe.y = y;
                    for (const e of solids) {
                        if (!CollisionSystem._checkCollision(probe, e)) continue;
                        const [cx, cy] = ec(e);
                        if ((x - cx) ** 2 + (y - cy) ** 2 <= (sx - cx) ** 2 + (sy - cy) ** 2) return false;
                    }
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
                this._slashT = _gameTimeSec; this._slashSecs = st.swingSecs || MELEE_SWING.duration;
                this._slashStyle = weaponModel(W && W.id).swing || 'knife';
                const ang = pl.angle, reach = st.reach || 36, arc = st.arc || 1.4;
                const walls = this.activeMap.walls, cols = getColliders(this.activeMap);
                // Step in only when there's someone to step in on: a slash at nothing stays where she is
                // (held, it used to creep her ~30 px/s into zones and lamplight)
                const inReach = e => {
                    if (!e || e.dead) return false;
                    const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.hypot(dx, dy);
                    return d <= reach + 8 + (e.radius || 14) && Math.abs(normalizeAngle(Math.atan2(dy, dx) - ang)) <= arc / 2 + (d < 26 ? 0.6 : 0)
                        && !isLineBlocked(pl.x, pl.y, e.x, e.y, walls, cols);
                };
                if (this.enemies.some(inReach)) this.meleeStepIn(ang);
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
                    const crit = this.rollCrit(st), dmg = Math.round(bladeDamage * crit);
                    if (!e.takeDamage(dmg, kx, ky, { type: st.damageType || 'melee', crit: crit > 1 })) continue;
                    if (!e.dead && e.interruptMelee) e.interruptMelee();
                    if (st.bleedDps) this.applyStatus(e, 'bleed', { dps: st.bleedDps, secs: st.bleedSecs || 3, by: pl });
                    if (!e.dead && typeof Ganger !== 'undefined' && e instanceof Ganger) { e.suspicion = 100; e.state = 'ALERT'; e.angle = Math.atan2(-dy, -dx); }
                    hit++;
                }
                // the arc and its sparkle, in the blade's colour (gold for the Kukri)
                const M = weaponModel(W && W.id), trail = M.trail || DEFAULT_SLASH_TRAIL;
                const L = this.slashes || (this.slashes = []);
                L.push({ x: pl.x, y: pl.y, a: ang, side, t0: _gameTimeSec, reach, arc, hit: hit > 0, secs: this._slashSecs, style: this._slashStyle, edge: M.edge || DEFAULT_SLASH_TRAIL.edge, cols: trail.cols });
                if (L.length > 8) L.shift();
                const fx = this.shotFx || (this.shotFx = []);
                for (let i = 0; i < (hit ? 8 : 3); i++) {
                    const a = ang + (Math.random() - 0.5) * arc, r = reach * (0.5 + Math.random() * 0.5);
                    fx.push({ k: 'dust', x: pl.x + Math.cos(a) * r, y: pl.y + Math.sin(a) * r, vx: Math.cos(a) * 0.4, vy: Math.sin(a) * 0.4, t: -i, life: 30, col: trail.dust, ph: Math.random() * 6.28 });
                }
                if (typeof ambience !== 'undefined' && ambience.slash) ambience.slash(hit > 0);
                this.emitNoise(pl.x, pl.y, st.noise || 60, 'slash');
                if (hit) this.triggerShake(2);
                return hit;
            },

            /** The blade's swing for the renderer: angle across the slash, and how far it reaches out (null at rest) */
            slashAngle() {
                if (this._slashT === undefined) return null;
                return sampleMeleeSwing(_gameTimeSec - this._slashT, this._slashSide,
                    this._slashPose || (this._slashPose = {}), this._slashSecs || MELEE_SWING.duration, this._slashStyle);
            },

            /** Slash arcs: a crescent of gold light where the blade went (world space) */
            drawSlashes(ctx) {
                const L = this.slashes; if (!L || !L.length) return;
                const now = _gameTimeSec;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (let i = L.length - 1; i >= 0; i--) {
                    const s = L[i], age = now - s.t0;
                    // Times scaled from the Kukri's swing (q stretches them for a slower blade), phases by style
                    const secs = s.secs || MELEE_SWING.duration, q = secs / MELEE_SWING.duration, life = .3 * q;
                    const ph = swingPhases(s.style), windT = ph.windup * secs, cutT = ph.cutEnd * secs;
                    if (age > life) { L.splice(i, 1); continue; }
                    if (age < windT) continue;
                    // Keep the newest cut attached to the moving wielder, then let its last
                    // position fade. Recovery does not paint a second, backward slash.
                    if (s.t0 === this._slashT && age <= MELEE_SWING.duration * q && this.weaponMode === 'melee' && !this.weaponHolstered) {
                        s.drawX = this.player.x; s.drawY = this.player.y; s.drawA = this.player.angle;
                    }
                    const k = 1 - age / life;
                    // a wide sweep leaves a longer crescent: three quarters of its cut
                    const span = s.style === 'wide' ? (cutT - windT) * .75 : .065 * q;
                    const end = Math.min(age, cutT), start = Math.max(windT, end - span);
                    const pose = this._slashTrailPose || (this._slashTrailPose = {});
                    const [ex, ey] = s.edge || DEFAULT_SLASH_TRAIL.edge;
                    ctx.save(); ctx.translate(s.drawX ?? s.x, s.drawY ?? s.y); ctx.rotate(s.drawA ?? s.a);
                    ctx.beginPath();
                    const n = s.style === 'wide' ? 24 : 8;                      // a smooth curve round a wide sweep
                    for (let j = 0; j <= n; j++) {
                        sampleMeleeSwing(start + (end - start) * j / n, s.side, pose, secs, s.style);
                        const c = Math.cos(pose.a), sn = Math.sin(pose.a);
                        // The edge of the real model, held at the same hand anchor.
                        const x = pose.handX + (ex * c - ey * sn) * .95;
                        const y = pose.handY + (ex * sn + ey * c) * .95;
                        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                    }
                    for (const [w, col, al] of (s.cols || DEFAULT_SLASH_TRAIL.cols)) {
                        ctx.strokeStyle = `rgba(${col}, ${al * k})`; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.restore();
            }
        });
