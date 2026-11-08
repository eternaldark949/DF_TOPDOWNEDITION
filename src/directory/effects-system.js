        // ===== LV2 DIRECTORY =====
        // The effects system: the world's short-lived effects in one place. Each EFFECT TYPE (EFFECTS, below)
        // has one list here; the system ages it on the life kit (basement/life-kit.js) and has the type say
        // what it looks like as shape packets in a draw list (basement/draw-list.js). Nothing here draws:
        // canvasRenderer does, and a WebGL renderer can read the same list.
        //
        // EFFECT TYPE: { max, cull, step(item, game) → true when done, tick(list, game), look(list, out, view, game) }
        //   max        how many at once: past it the oldest go (optional)
        //   cull       true: drop with lifeKit.cull (order shuffles), else lifeKit.sweep (order kept)
        //   step       one tick of one item; return true when it is done
        //   tick       one tick of the whole list, in place of step (optional)
        //   look       fill `out` with what the list looks like now (`view`: the world rect in view)
        //
        //   game.effects.spawn('casing', item)       // add one (the item is the type's own packet object)
        //   game.effects.of('flame')                 // its list (lighting reads flames and flashes from here)
        //   game.effects.update('casing')            // one tick of one type (each in its place in engine/update.js)
        //   game.effects.draw('casing', ctx, view)   // look, then the renderer
        //   game.effects.clear()                     // a new map or a new game
        class effectsSystem {
            constructor(game, types) {
                this.game = game; this.types = types; this.lists = {}; this.out = new drawList();
                for (const k in types) this.lists[k] = [];
            }
            of(type) { return this.lists[type]; }
            spawn(type, item) {
                const L = this.lists[type], max = this.types[type].max;
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
            draw(type, ctx, view) {
                const L = this.lists[type];
                if (!L.length) return;
                const out = this.out;
                out.clear();
                this.types[type].look(L, out, view, this.game);
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
            }
        };
