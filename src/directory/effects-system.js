        // ===== LV2 DIRECTORY =====
        // The effects system: the world's short-lived effects in one place. Each EFFECT TYPE (EFFECTS, below)
        // has one list here; the system ages it on the life kit (basement/life-kit.js) and has the type say
        // what it looks like as shape packets in a draw list (basement/draw-list.js). Nothing here draws:
        // canvasRenderer does, and a WebGL renderer can read the same list.
        //
        // EFFECT TYPE: { max, cull, step(item, game) → true when done, tick(list, game), look(list, out, view, game, pass) }
        //   max        how many at once: past it the oldest go (optional; a spawn can name its own)
        //   cull       true: drop with lifeKit.cull (order shuffles), else lifeKit.sweep (order kept)
        //   step       one tick of one item; return true when it is done
        //   tick       one tick of the whole list, in place of step (optional)
        //   look       fill `out` with what the list looks like now (`view`: the world rect in view; `pass`: which
        //              of its passes, for a type drawn at more than one point of the frame)
        //
        //   game.effects.spawn('casing', item, max)  // add one (the item is the type's own packet object)
        //   game.effects.of('flame')                 // its list (lighting reads flames and flashes from here)
        //   game.effects.update('casing')            // one tick of one type (each in its place in engine/update.js)
        //   game.effects.draw('casing', ctx, view)   // look, then the renderer ('breach', ctx, view, 'glow': one pass)
        //   game.effects.clear()                     // a new map or a new game
        class effectsSystem {
            constructor(game, types) {
                this.game = game; this.types = types; this.lists = {}; this.out = new drawList();
                for (const k in types) this.lists[k] = [];
            }
            of(type) { return this.lists[type]; }
            spawn(type, item, max = this.types[type].max) {
                const L = this.lists[type];
                L.push(item);
                if (max && L.length > max) L.splice(0, L.length - max);
                return item;
            }
            update(type) {
                const T = this.types[type], L = this.lists[type], game = this.game;
                if (!L.length) return;
                if (T.tick) T.tick(L, game);
                else if (T.cull) lifeKit.cull(L, item => T.step(item, game));
                else lifeKit.sweep(L, item => T.step(item, game));
            }
            draw(type, ctx, view, pass) {
                const L = this.lists[type];
                if (!L.length) return;
                const out = this.out;
                out.clear();
                this.types[type].look(L, out, view, this.game, pass);
                canvasRenderer.flush(ctx, out);
            }
            clear() { for (const k in this.lists) this.lists[k].length = 0; }
        }

        const EFFECTS = {
            /**
             * Spent brass, and a kill's glitter: it flies, spins and settles, then lies there glinting like a
             * fleck of glitter in the gun's colour (25 s, at most 60, oldest first). As it lands it scatters two
             * finer flecks and takes the colour of the lamp whose pool it lies in (lc, lk). On the ground after
             * decals, under everyone: a fleck that twinkles on its own rhythm, a four-point glint at the top of each
             * twinkle, brighter and oftener under a burning lamp, the glint in the lamp's colour.
             * ITEM: { x, y, vx, vy, a, spin, t, big, col, ph, rate }
             */
            casing: {
                max: 60,
                step(k, game) {
                    k.t++;
                    if (k.t < 26) { k.x += k.vx; k.y += k.vy; k.vx *= 0.86; k.vy *= 0.86; k.a += k.spin; k.spin *= 0.9; }
                    else if (k.t === 26) {
                        k.sub = [(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5];
                        EFFECTS.casing.lamp(k, game);
                    }
                    return k.t > 1500;
                },
                /** The nearest lamp whose pool it lies in lends it its colour (k.lc) and strength (k.lk). */
                lamp(k, game) {
                    let best = null, bk = 0;
                    const consider = (l) => {
                        if (!l || l._forcedOff) return;
                        const r = (l.radius || 200) * 0.6, d = Math.hypot(l.x - k.x, l.y - k.y);
                        if (d < r) { const s = 1 - d / r; if (s > bk) { bk = s; best = l; } }
                    };
                    for (const entry of game._queryLampCandidates({ left: k.x, right: k.x, top: k.y, bottom: k.y }, 'lampCasings')) consider(entry.item);
                    if (game.activeMap && game.activeMap._interiorLights) {
                        for (const entry of game._queryEffectCandidates('interiorLamps', game.activeMap._interiorLights,
                            { left: k.x, right: k.x, top: k.y, bottom: k.y }, 'interiorLampCasings')) consider(entry.item);
                    }
                    if (best && /^#[0-9a-f]{6}$/i.test(best.color || '')) { k.lc = best.color; k.lk = bk; }
                },
                look(L, out, cb, game) {
                    if (_zoomLOD >= 1) return;
                    const day = game._lampDaylight ?? 0, night = Math.max(0, Math.min(1, (0.35 - day) / 0.15));
                    out.blend('lighter'); out.cap('round');
                    for (const k of L) {
                        if (k.x < cb.left || k.x > cb.right || k.y < cb.top || k.y > cb.bottom) continue;
                        const fade = k.t > 1380 ? (1500 - k.t) / 120 : 1, spin = k.t < 26 ? 1 : 0;
                        const lit = k.lc ? k.lk * night : 0;                                // how much lamp light it catches
                        const tw = Math.pow(Math.abs(Math.sin(_frameTime * k.rate * (1 + lit * 1.5) + k.ph)), 6 - lit * 3), s = k.big ? 1.3 : 1;
                        out.rect(k.x - 0.6 * s, k.y - 0.6 * s, 1.2 * s, 1.2 * s, k.col, fade * (0.45 + 0.55 * Math.max(tw, spin * 0.7)) * (1 + lit * 0.4));   // the fleck
                        if (k.sub) {                                                         // its two finer flecks, twinkling out of step
                            const tw2 = Math.pow(Math.abs(Math.sin(_frameTime * k.rate * 1.3 + k.ph + 2)), 4), a = fade * (0.3 + 0.6 * tw2) * (1 + lit * 0.5);
                            out.rect(k.x + k.sub[0] - 0.35, k.y + k.sub[1] - 0.35, 0.7, 0.7, k.col, a);
                            out.rect(k.x + k.sub[2] - 0.35, k.y + k.sub[3] - 0.35, 0.7, 0.7, lit > 0.2 ? k.lc : k.col, a);
                        }
                        if (tw > 0.35) {                                                     // the glint
                            const r = (1.2 + 2.6 * tw) * s * (1 + lit * 0.6), a = fade * Math.min(1, tw * (1 + lit * 0.5));
                            out.rect(k.x - 0.35, k.y - 0.35, 0.7, 0.7, '#ffffff', a);
                            const o = out.lines(0.45, lit > 0.15 ? k.lc : k.col, a);
                            out.seg(o, k.x - r, k.y, k.x + r, k.y); out.seg(o, k.x, k.y - r, k.x, k.y + r);
                        }
                    }
                }
            },

            /**
             * Off the barrel (a gun's model `fx`, ui/weapon-models.js) and off a blade: smoke and golden wisps that
             * drift downwind, curl and swell (soft, normal blend), then embers and gold dust (additive).
             * After the muzzle stars. ITEM: { k: 'smoke' | 'wisp' | 'ember' | 'dust', x, y, vx, vy, t, life, r, col, ph }
             * (t below 0: a puff still waiting its turn)
             */
            barrel: {
                max: 160,
                tick(L, game) {
                    const W = game.weather && game.weather.windVec ? game.weather.windVec : { x: 0, y: 0 };
                    lifeKit.sweep(L, (p) => {
                        p.t++;
                        if (p.t <= 0) return;
                        if (p.t > p.life) return true;
                        if (p.k === 'smoke' || p.k === 'wisp') {
                            p.vx = p.vx * 0.94 + W.x * 0.012 + Math.cos(p.t * 0.15 + p.ph) * 0.03;
                            p.vy = p.vy * 0.94 + W.y * 0.012 + Math.sin(p.t * 0.15 + p.ph) * 0.03;
                            p.r += p.k === 'smoke' ? 0.055 : 0.14;
                        } else { p.vx *= 0.93; p.vy *= 0.93; p.vx += W.x * 0.004; p.vy += W.y * 0.004; }
                        p.x += p.vx; p.y += p.vy;
                    });
                },
                look(F, out, cb) {
                    if (_zoomLOD >= 2) return;
                    for (const p of F) {
                        if (p.t <= 0 || (p.k !== 'smoke' && p.k !== 'wisp')) continue;
                        if (p.x < cb.left || p.x > cb.right || p.y < cb.top || p.y > cb.bottom) continue;
                        const u = p.t / p.life, a = (p.k === 'smoke' ? 0.2 : 0.55) * Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u), R = p.r * 2.2;
                        out.image(puffSprite(p.col), p.x - R, p.y - R, R * 2, R * 2, a);
                    }
                    out.blend('lighter');
                    for (const p of F) {
                        if (p.t <= 0 || (p.k !== 'ember' && p.k !== 'dust')) continue;
                        if (p.x < cb.left || p.x > cb.right || p.y < cb.top || p.y > cb.bottom) continue;
                        const u = p.t / p.life, a = (1 - u) * (0.55 + 0.45 * Math.sin(_frameTime * 0.03 + p.ph));
                        const z = p.k === 'ember' ? 0.9 * (1 - u * 0.5) : 0.75;
                        out.rect(p.x - z / 2, p.y - z / 2, z, z, p.col, a);
                        if (p.k === 'ember' && u < 0.4) out.rect(p.x - p.vx * 2 - z / 2, p.y - p.vy * 2 - z / 2, z, z, p.col, a * 0.35);   // its streak
                    }
                }
            },

            /**
             * A fireball's flames, laid along the way it flew (emitFireTrail, engine/combat-effects.js); they keep
             * burning after it's gone, and game time freezes them. ITEM: { x, y, born, life, seed, angle } (ms)
             */
            flame: {
                max: FIRE_TRAIL_MAX,
                tick(L) { const now = _gameTimeMs(); lifeKit.sweep(L, p => now - p.born >= p.life); },
                look(F, out, cb) {
                    const sprites = _getFireTrailSprites(), now = _gameTimeMs();
                    const stride = typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2 ? 2 : 1;
                    const S = sprites, sw = S.w * S.K, sh = S.h * S.K;
                    out.blend('lighter');
                    for (let i = 0; i < F.length; i += stride) {
                        const p = F[i], age = now - p.born;
                        if (age < 0 || age >= p.life) continue;
                        if (cb && (p.x < cb.left - 26 || p.x > cb.right + 26 || p.y < cb.top - 26 || p.y > cb.bottom + 26)) continue;
                        const u = age / p.life, fade = Math.pow(1 - u, 1.45);
                        const phase = ((age / 720 + p.seed) % 1) * S.frames;
                        const frame = Math.floor(phase), blend = phase - frame, next = (frame + 1) % S.frames;
                        const drift = Math.sin(age * 0.009 + p.seed * 6.28) * u * 3.2;
                        const size = (0.85 + p.seed * 0.3) * (1 + Math.sin(u * Math.PI) * 0.25) * (1 - u * 0.55);
                        const tx = p.x - Math.sin(p.angle) * drift, ty = p.y + Math.cos(p.angle) * drift;
                        const rot = p.angle + Math.sin(age * 0.012 + p.seed * 9) * (0.12 + u * 0.28);
                        const sy = size * (0.9 + 0.25 * Math.sin(age * 0.016 + p.seed * 6.28));
                        out.sprite(S.atlas, (frame % S.cols) * sw, Math.floor(frame / S.cols) * sh, sw, sh, -22, -18, S.w, S.h, 0.68 * fade * (1 - blend), tx, ty, rot, size, sy);
                        out.sprite(S.atlas, (next % S.cols) * sw, Math.floor(next / S.cols) * sh, sw, sh, -22, -18, S.w, S.h, 0.68 * fade * blend, tx, ty, rot, size, sy);
                    }
                }
            },

            /**
             * Muzzle flashes: three ticks of light (the lighting pass draws that) and the flash's star at the
             * muzzle, along the shot. ITEM: { x, y, radius, color, life, angle }
             */
            muzzle: {
                step(f) { return --f.life <= 0; },
                look(F, out) {
                    out.blend('lighter');
                    for (const f of F) {
                        if (f.angle === undefined) continue;
                        const k = Math.min(1, (f.life || 0) / 3), s = (f.radius || 50) / 170 * (0.7 + 0.3 * k);
                        out.sprite(muzzleStarSprite(f.color), 0, 0, 0, 0, -24, -24, 0, 0, 0.35 + 0.65 * k, f.x, f.y, f.angle, s, s * (0.8 + 0.4 * ((f.x * 7 + f.life) % 1)));
                    }
                }
            },

            /**
             * A blade's cut (engine/status-effects.js, a draw-cut in engine/executions.js): a crescent of gold light
             * where the blade went, the newest kept on the moving wielder, then left to fade. Times are scaled from the
             * Kukri's swing (q stretches them for a slower blade), phases by style; at most 8.
             * ITEM: { x, y, a, side, t0, reach, arc, hit, secs, style, edge, cols }
             */
            slash: {
                max: 8,
                _pts: [],
                step(s) {
                    const secs = s.secs || MELEE_SWING.duration, q = secs / MELEE_SWING.duration, life = .3 * q;
                    return _gameTimeSec - s.t0 > life;
                },
                look(L, out, view, game) {
                    const now = _gameTimeSec, P = EFFECTS.slash._pts;
                    out.blend('lighter'); out.cap('round');
                    for (let i = L.length - 1; i >= 0; i--) {
                        const s = L[i], age = now - s.t0;
                        const secs = s.secs || MELEE_SWING.duration, q = secs / MELEE_SWING.duration, life = .3 * q;
                        const ph = swingPhases(s.style), windT = ph.windup * secs, cutT = ph.cutEnd * secs;
                        if (age > life || age < windT) continue;
                        // The newest cut rides the moving wielder; recovery paints no second, backward slash
                        if (s.t0 === game._slashT && age <= MELEE_SWING.duration * q && game.weaponMode === 'melee' && !game.weaponHolstered) {
                            s.drawX = game.player.x; s.drawY = game.player.y; s.drawA = game.player.angle;
                        }
                        const k = 1 - age / life;
                        // a wide sweep leaves a longer crescent: three quarters of its cut
                        const span = s.style === 'wide' ? (cutT - windT) * .75 : .065 * q;
                        const end = Math.min(age, cutT), start = Math.max(windT, end - span);
                        const pose = game._slashTrailPose || (game._slashTrailPose = {});
                        const [ex, ey] = s.edge || DEFAULT_SLASH_TRAIL.edge;
                        const n = s.style === 'wide' ? 24 : 8;                      // a smooth curve round a wide sweep
                        P.length = 0;
                        for (let j = 0; j <= n; j++) {
                            sampleMeleeSwing(start + (end - start) * j / n, s.side, pose, secs, s.style);
                            const c = Math.cos(pose.a), sn = Math.sin(pose.a);
                            // the edge of the real model, held at the same hand anchor
                            P.push(pose.handX + (ex * c - ey * sn) * .95, pose.handY + (ex * sn + ey * c) * .95);
                        }
                        out.frame(s.drawX ?? s.x, s.drawY ?? s.y, s.drawA ?? s.a);
                        for (const [w, col, al] of (s.cols || DEFAULT_SLASH_TRAIL.cols)) {
                            const o = out.path(w, `rgba(${col}, ${al * k})`, 1);
                            for (let j = 0; j < P.length; j += 2) out.pt(o, P[j], P[j + 1]);
                        }
                        out.unframe();
                    }
                }
            },

            /**
             * Golden Retribution and Vampiric Fists (engine/knuckles.js): a punch's gold afterimages along the fist's
             * path ('trail', a haymaker's riding the hook's arc), a haymaker's ring ('ring', a slam's bigger), and the
             * crimson motes a drinking punch winds back to her ('drain').
             * ITEM: { k: 'trail', x, y, a, side, t0, hay } | { k: 'ring', x, y, t0, slam } | { k: 'drain', x, y, t0, ph, sp }
             */
            knuckle: {
                life(f) { return f.k === 'drain' ? VAMPIRIC.LIFE : f.k === 'trail' ? (f.hay ? 0.32 : 0.22) : 0.36; },
                step(f, game) { return _gameTimeSec - f.t0 > EFFECTS.knuckle.life(f) || (f.k === 'drain' && !game.player); },
                look(L, out, view, game) {
                    const now = _gameTimeSec, R = CONFIG.PUNCH.REACH, pl = game.player;
                    for (let i = L.length - 1; i >= 0; i--) {
                        const f = L[i], age = now - f.t0, life = EFFECTS.knuckle.life(f);
                        if (age > life) continue;
                        if (f.k === 'drain') {                                         // a crimson mote, wound to her
                            if (age < 0 || !pl) continue;
                            const u = age / life, e2 = u * u * (3 - 2 * u);
                            const dx = pl.x - f.x, dy = pl.y - f.y, d = Math.hypot(dx, dy) || 1;
                            const bow = Math.sin(u * Math.PI) * f.sp * Math.sin(f.ph);           // each one curves its own way
                            const x = f.x + dx * e2 - dy / d * bow, y = f.y + dy * e2 + dx / d * bow;
                            const a = (u < 0.15 ? u / 0.15 : 1) * (1 - Math.max(0, u - 0.8) / 0.2), r = 2.2 - u * 0.8;
                            const g = out.radial(x, y, r * 3, 1);
                            out.stop(g, 0, `rgba(255, 120, 140, ${a * 0.9})`); out.stop(g, 0.4, `rgba(200, 16, 46, ${a * 0.6})`); out.stop(g, 1, 'rgba(120, 0, 20, 0)');
                            out.circle(x, y, r * 0.5, `rgba(255, 210, 220, ${a})`, 1);
                        } else if (f.k === 'trail') {
                            const c = Math.cos(f.a), s = Math.sin(f.a), side = f.side === 'right' ? 1 : -1;
                            const ox = -s * 5 * side, oy = c * 5 * side;                   // the punching hand's side
                            const n = f.hay ? 4 : 3;
                            for (let j = 0; j < n; j++) {
                                const u = (j + 1) / n, d = 12 + R * u * 1.1, a = (1 - age / life) * (0.18 + 0.42 * u);
                                // a haymaker's copies ride the hook's arc (CONFIG.HAYMAKER), a jab's the straight line
                                const ph = (92 - 100 * u) * Math.PI / 180, H = 19 + 7 * u, lx = Math.cos(ph) * H, ly = Math.sin(ph) * H * side;
                                const x = f.hay ? f.x + c * lx - s * ly : f.x + c * d + ox, y = f.hay ? f.y + s * lx + c * ly : f.y + s * d + oy, rr = (f.hay ? 5.4 : 4.4) * (0.7 + 0.3 * u);
                                const g = out.radial(x, y, rr * 2.2, 1);
                                out.stop(g, 0, `rgba(255, 238, 170, ${a})`); out.stop(g, 0.45, `rgba(255, 196, 72, ${a * 0.7})`); out.stop(g, 1, 'rgba(255, 170, 40, 0)');
                                out.circle(x, y, rr * 0.7, `rgba(255, 226, 140, ${a * 1.2})`, 1);
                            }
                        } else {
                            const u = age / life, rr = (f.slam ? 14 : 10) + u * (f.slam ? 30 : 24), a = (1 - u) * 0.9;
                            out.shadow('#ffb732', 10);
                            out.ring(f.x, f.y, rr, 3 * (1 - u) + 0.6, '#ffd76a', a);
                            out.ring(f.x, f.y, rr * 0.7, 1, '#fff4cf', a);
                            out.shadow('rgba(0, 0, 0, 0)', 0);
                        }
                    }
                }
            },

            /**
             * Spilt drink (engine/spills.js): a pool thrown out along the way it flew, a few lobes from its seed so no
             * two are the same shape, a darker edge, a layered cocktail's second colour, the room's light caught on it,
             * and the drops thrown ahead; it shrinks a little as it dries (SPILL.LIFE, the last SPILL.FADE).
             * On the floor under everyone, after the decals. Gameplay reads it too (footsteps, slips).
             * ITEM: { x, y, r, color, color2, glow, born, splash, ox, oy, seed, a, drops, map }
             */
            spill: {
                step(s, game) { return _gameTimeSec - s.born > SPILL.LIFE || s.map !== (game.activeMap ? game.activeMap.id : null); },
                look(S, out, cb, game) {
                    const now = _gameTimeSec, mapId = game.activeMap ? game.activeMap.id : null;
                    for (let i = S.length - 1; i >= 0; i--) {
                        const s = S[i], age = now - s.born;
                        if (age > SPILL.LIFE || s.map !== mapId) continue;
                        if (cb && (s.x + 40 < cb.left || s.x - 40 > cb.right || s.y + 40 < cb.top || s.y - 40 > cb.bottom)) continue;
                        const dry = age > SPILL.LIFE - SPILL.FADE ? 1 - (age - (SPILL.LIFE - SPILL.FADE)) / SPILL.FADE : 1;
                        const fly = Math.min(1, (now - s.splash) / 0.2);                // the splash: the drink flies out, then lands
                        const grow = Math.min(1, (now - s.splash) / 0.3), ease = 1 - (1 - grow) * (1 - grow);
                        const r = s.r * (0.35 + 0.65 * ease) * (0.75 + 0.25 * dry);
                        const rgb = hexToRgb(s.color), wet = `rgb(${rgb})`;
                        if (s.glow) out.shadow(s.color, 8);
                        const o = out.blob(wet, 0.6 * dry, s.x, s.y, r, r * 0.62, s.a || 0);
                        for (let k = 0; k < 4; k++) {
                            const a = (s.a || 0) + (k - 1.5) * 1.1 + Math.sin(s.seed + k) * 0.4, d = r * (0.5 + ((s.seed * (k + 3)) % 1) * 0.25);
                            const lr = r * (0.22 + ((s.seed * (k + 7)) % 1) * 0.18);
                            out.dot(o, s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.7, lr);
                        }
                        if (s.glow) out.shadow(s.color, 0);
                        out.arc(s.x, s.y, r, r * 0.62, s.a || 0, 0, Math.PI * 2, 0.8, 'rgba(0,0,0,0.6)', 0.3 * dry);   // the edge
                        if (s.color2) out.circle(s.x, s.y, r * 0.4, s.color2, 0.5 * dry);
                        out.ellipse(s.x - r * 0.3, s.y - r * 0.2, r * 0.26, r * 0.09, -0.6, '#ffffff', 0.35 * dry);   // sheen
                        for (const d of s.drops) {                                  // the drops thrown ahead
                            const dx = s.ox + (d.x - s.ox) * fly, dy = s.oy + (d.y - s.oy) * fly;
                            out.circle(dx, dy, d.r * (fly < 1 ? 0.8 : 1), wet, 0.8 * dry);
                        }
                    }
                }
            },

            /**
             * A wall blown in (engine/breach-fx.js spawnBreachBlast: the Double Nights penthouse ambush). One at a time.
             * Everything moves in game time, so pause and slow motion hold it. Two passes: 'under' (scorch, debris,
             * smoke) before the darkness, so the room's light and the blast's spill light them; 'glow' (additive: the
             * spill, fireballs, shock rings, sparks, embers, the burning lip, a brief flash) after it.
             */
            breach: {
                max: 1,
                step(B, game) {
                    const t = ++B.t, W = game.weather && game.weather.windVec ? game.weather.windVec : { x: 0, y: 0 };
                    const move = (p, damp) => { p.px = p.x; p.py = p.y; if (t <= p.d) return; p.x += p.vx; p.y += p.vy; p.vx *= damp; p.vy *= damp; };
                    for (const p of B.debris) { move(p, 0.9); if (t > p.d) { p.rot += p.vr; p.vr *= 0.92; } }
                    for (const p of B.sparks) move(p, 0.88);
                    for (const p of B.smoke) { move(p, 0.99); p.vx += W.x * 0.004; p.vy += W.y * 0.004; }
                    for (const p of B.embers) { move(p, 1); p.x += Math.sin(t * 0.07 + p.ph) * 0.25; }
                    return t * CONFIG.LOOP.STEP_MS > BREACH.DEBRIS_MS;
                },
                clock(B) {
                    const ip = RenderInterp, a = ip._drawActive && ip.alpha < 1 ? ip.alpha : 1;
                    return { a, ms: (B.t - 1 + a) * CONFIG.LOOP.STEP_MS };
                },
                look(list, out, cb, game, pass) {
                    const B = list[0], { a, ms } = EFFECTS.breach.clock(B), S = CONFIG.LOOP.STEP_MS, w = B.wall;
                    const L = (p) => p.px + (p.x - p.px) * a, T = (p) => p.py + (p.y - p.py) * a;
                    if (pass === 'under') {
                        const away = (x, y, m) => cb && (x < cb.left - m || x > cb.right + m || y < cb.top - m || y > cb.bottom + m);
                        const linger = Math.min(1, (BREACH.DEBRIS_MS - ms) / 1000);
                        for (const s of B.scorch) {
                            const age = ms - s.d * S; if (age < 0 || away(s.x, s.y, s.r * 1.3)) continue;
                            const sx = B.horiz ? 1.3 : 1, sy = B.horiz ? 1 : 1.3;
                            out.image(_bScorch(), s.x - s.r * sx, s.y - s.r * sy, s.r * 2 * sx, s.r * 2 * sy, Math.min(1, age / 120) * 0.9 * linger);
                        }
                        for (const p of B.debris) {
                            if (ms < p.d * S) continue;
                            const x = L(p), y = T(p); if (away(x, y, 20)) continue;
                            out.frame(x, y, p.rot);
                            if (p.glass) {
                                const o = out.poly('rgba(190, 200, 255, 0.55)', linger);
                                out.pt(o, -p.w / 2, p.h / 2); out.pt(o, 0, -p.h / 2); out.pt(o, p.w / 2, p.h / 3);
                            } else {
                                out.rect(-p.w / 2, -p.h / 2, p.w, p.h, '#0e0c10', linger);
                                if (p.gold) out.rect(-p.w / 2, -p.h / 2, p.w, 1.4, 'rgba(232, 194, 122, 0.9)', linger);
                            }
                            out.unframe();
                        }
                        for (const p of B.smoke) {
                            const age = ms - p.d * S, life = p.life * S; if (age < 0 || age > life) continue;
                            const R = p.r0 * (1 + age / 1000 * 0.45), x = L(p), y = T(p); if (away(x, y, R)) continue;
                            out.image(_bSmoke(), x - R, y - R, R * 2, R * 2, 0.95 * Math.min(1, age / 260) * Math.pow(1 - age / life, 1.2));
                        }
                        return;
                    }
                    if (ms > Math.max(BREACH.LIP_MS, 4500)) return;   // only scorch and debris remain (drawn under)
                    out.blend('lighter');
                    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
                    const spill = Math.max(0, 1 - ms / BREACH.SPILL_MS);
                    if (spill > 0) {
                        const flick = 0.85 + 0.15 * Math.sin(ms * 0.05) * Math.sin(ms * 0.031), R = BREACH.SPILL_R, al = 0.42 * Math.pow(spill, 1.8) * flick;
                        if (B.horiz) out.image(_bPool(), cx - R * 1.25, cy - R, R * 2.5, R * 2, al);
                        else out.image(_bPool(), cx - R, cy - R * 1.25, R * 2, R * 2.5, al);
                    }
                    for (const c of B.charges) {
                        const age = ms - c.d * S; if (age < 0 || age > BREACH.FIRE_MS) continue;
                        const u = age / BREACH.FIRE_MS, grow = 1 - Math.pow(1 - Math.min(1, age / 160), 3), fade = Math.pow(1 - u, 1.8);
                        if (age < 70) { const R = 36 + age * 0.6; out.image(_bCore(), c.x - R, c.y - R, R * 2, R * 2, 0.85 * (1 - age / 70)); }
                        const R = c.r * (0.45 + 0.75 * grow);
                        out.image(_bFire(), c.x - R, c.y - R, R * 2, R * 2, 0.65 * fade);
                        for (const l of c.lobes) {
                            const rr = R * l.k, ox = Math.cos(l.a) * R * l.s, oy = Math.sin(l.a) * R * l.s;
                            out.image(_bFire(), c.x + ox - rr, c.y + oy - rr, rr * 2, rr * 2, 0.38 * fade);
                        }
                        const ra = Math.min(1, age / 380);
                        if (ra < 1) {                                              // the shock ring: a thin gold line, half, into the room
                            const a0 = B.dir - Math.PI / 2;
                            out.arc(c.x, c.y, (B.horiz ? 20 : 14) + ra * (B.horiz ? 150 : 110), (B.horiz ? 14 : 20) + ra * (B.horiz ? 110 : 150), 0, a0, a0 + Math.PI,
                                3 * (1 - ra) + 0.6, 'rgb(255, 214, 140)', (1 - ra) * 0.7);
                        }
                    }
                    out.cap('round');
                    for (const p of B.sparks) {
                        const age = ms - p.d * S, life = p.life * S; if (age < 0 || age > life) continue;
                        const u = age / life, x = L(p), y = T(p);
                        if (cb && (x < cb.left - 40 || x > cb.right + 40 || y < cb.top - 40 || y > cb.bottom + 40)) continue;
                        out.seg(out.lines(1.8, u < 0.35 ? 'rgb(255, 245, 210)' : 'rgb(255, 170, 70)', 1 - u), x, y, x - p.vx * 2.6, y - p.vy * 2.6);
                    }
                    for (const p of B.embers) {
                        const age = ms - p.d * S, life = p.life * S; if (age < 0 || age > life) continue;
                        const x = L(p), y = T(p), al = (1 - age / life) * (0.6 + 0.4 * Math.sin(age * 0.02 + p.ph * 5));
                        out.image(_bEmber(), x - 5, y - 5, 10, 10, al); out.rect(x - 0.8, y - 0.8, 1.6, 1.6, 'rgb(255, 230, 170)', al);
                    }
                    for (const p of B.debris) {                                    // hot edges, the first moments
                        const age = ms - p.d * S; if (age < 0 || age > 900 || p.glass) continue;
                        out.image(_bEmber(), L(p) - 6, T(p) - 6, 12, 12, (1 - age / 900) * 0.6);
                    }
                    const lip = Math.max(0, 1 - ms / BREACH.LIP_MS);
                    if (lip > 0) for (const s of B.scorch) {
                        if (ms < s.d * S) continue;
                        const al = lip * (0.35 + 0.15 * Math.sin(ms * 0.03 + s.x + s.y));
                        if (B.horiz) out.image(_bEmber(), s.x - 40, cy - 11, 80, 22, al); else out.image(_bEmber(), cx - 11, s.y - 40, 22, 80, al);
                    }
                    if (ms < 120) out.screen('#ffd9a0', 0.14 * (1 - ms / 120));   // a brief warm flash over the frame
                }
            },

            /**
             * Floating numbers and tags (engine/combat-fx.js): a hit's damage, a bleed's or a burn's tick, a crit,
             * Resonance earned, SLAM! and SLIP!. Each rises and drifts, fading over its life (0.85 s; a crit 1.1 s, a
             * big tag 1.6 s), riding its target while that lives; a merged hit pops a little bigger. Over everyone,
             * after the health bars. A spawn names its own cap (onActorHit keeps 40).
             * ITEM: { target, x, y, value, text?, color, t0, pop, drift, crit?, bleed?, burn?, big? }
             */
            number: {
                life(t) { return t.big ? 1.6 : t.crit ? 1.1 : 0.85; },
                step(t) { const age = _gameTimeSec - t.t0; return age > EFFECTS.number.life(t) || age < -1; },
                look(L, out, cull) {
                    const now = _gameTimeSec;
                    for (let i = L.length - 1; i >= 0; i--) {
                        const t = L[i], age = now - t.t0, life = EFFECTS.number.life(t);
                        if (age > life || age < -1) continue;
                        if (t.target && !t.target.dead) { t.x = t.target.x; t.y = t.target.y - 16; }   // (kept where it was when they fall)
                        const x = t.x + t.drift * age * 14, y = t.y - age * 30;
                        if (cull && !(x > cull.left - 40 && x < cull.right + 40 && y > cull.top - 40 && y < cull.bottom + 40)) continue;
                        const pop = Math.max(0, 1 - (now - t.pop) / 0.12);
                        const font = `bold ${Math.round((t.big ? 10 : t.bleed ? 8 : t.crit ? 15 : 11) + pop * (t.bleed ? 1 : t.crit ? 9 : 4) + Math.min(5, t.value / 20))}px Orbitron, sans-serif`;
                        const s = t.text || String(Math.round(t.value)) + (t.crit ? '!' : '');
                        out.text(s, x, y, font, t.color, 1 - Math.pow(age / life, 2), t.crit ? 'rgba(90, 10, 0, 0.85)' : 'rgba(0,0,0,0.75)', t.crit ? 4 : 3);
                    }
                }
            }
        };
