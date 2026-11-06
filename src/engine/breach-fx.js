        // GameEngine — The breach blast: a wall blown in (the Double Nights penthouse ambush, story step 4).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Charges ripple along the wall; each is a white-hot core, a lumpy fireball and a thin gold shock ring.
        // Warm light spills across the floor and flickers out; black-lacquer panels (some gold-trimmed) and
        // glass are thrown into the room and stay as debris; violet-grey smoke and embers linger.
        // Two passes: drawBreachUnder (scorch, debris, smoke) before the darkness, so the room's light
        // and the blast's own spill light them; drawBreachGlow (additive light, fire, sparks) after it.
        const BREACH = {
            CHARGES_PER_PX: 1 / 85,  // one charge per this much wall (at least 2, at most 8)
            RIPPLE_MS: 70,           // between charges, along the wall
            FIRE_MS: 650,            // a charge's fireball
            SPILL_MS: 1400,          // the warm light on the floor
            SPILL_R: 430,
            LIP_MS: 3500,            // the burning edge where the wall was
            DEBRIS_MS: 20000,        // debris lies this long, then fades over the last second
            SMOKE_MAX: 48, SPARK_MAX: 140
        };
        const _breachSprites = new Map();
        /** A soft radial sprite (128×128) from gradient stops, cached by key. */
        function breachSprite(key, stops) {
            let cv = _breachSprites.get(key);
            if (cv) return cv;
            cv = document.createElement('canvas'); cv.width = cv.height = 128;
            const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
            for (const [o, col] of stops) g.addColorStop(o, col);
            c.fillStyle = g; c.fillRect(0, 0, 128, 128);
            _breachSprites.set(key, cv);
            return cv;
        }
        const _bFire = () => breachSprite('fire', [[0, 'rgba(255,250,235,1)'], [0.18, 'rgba(255,224,150,0.95)'], [0.42, 'rgba(255,140,50,0.6)'], [0.7, 'rgba(200,60,30,0.22)'], [1, 'rgba(120,20,40,0)']]);
        const _bCore = () => breachSprite('core', [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,240,210,0.6)'], [1, 'rgba(255,220,180,0)']]);
        const _bPool = () => breachSprite('pool', [[0, 'rgba(255,196,120,0.9)'], [0.35, 'rgba(255,140,60,0.45)'], [0.75, 'rgba(180,70,90,0.12)'], [1, 'rgba(90,40,120,0)']]);
        const _bSmoke = () => breachSprite('smoke', [[0, 'rgba(46,34,58,0.95)'], [0.5, 'rgba(38,28,52,0.55)'], [1, 'rgba(30,22,44,0)']]);
        const _bScorch = () => breachSprite('scorch', [[0, 'rgba(8,5,8,0.92)'], [0.55, 'rgba(14,8,12,0.55)'], [1, 'rgba(14,8,12,0)']]);
        const _bEmber = () => breachSprite('ember', [[0, 'rgba(255,170,80,0.9)'], [1, 'rgba(255,90,40,0)']]);

        engineMixin({
            /**
             * Blow `wall` ({x, y, w, h}) in. `inward` is the side of the room, +1 (down) or -1 (up, the
             * default: a wall on a room's far edge). Call before removeWall(wall).
             */
            spawnBreachBlast(wall, inward = -1) {
                const r = (a, b) => a + Math.random() * (b - a);
                const horiz = wall.w >= wall.h, len = horiz ? wall.w : wall.h;
                const n = Math.max(2, Math.min(8, Math.round(len * BREACH.CHARGES_PER_PX)));
                const S = CONFIG.LOOP.STEP_MS;
                const dir = horiz ? (inward < 0 ? -Math.PI / 2 : Math.PI / 2) : (inward < 0 ? Math.PI : 0);
                const at = (u, depth) => horiz
                    ? { x: wall.x + u, y: wall.y + wall.h / 2 + inward * depth }
                    : { x: wall.x + wall.w / 2 + inward * depth, y: wall.y + u };
                const B = { wall, horiz, inward, dir, t: 0, charges: [], scorch: [], debris: [], sparks: [], smoke: [], embers: [] };
                for (let i = 0; i < n; i++) {
                    const p = at((i + 0.5) * len / n + r(-14, 14), r(4, 14));
                    const d = Math.round((i * BREACH.RIPPLE_MS + r(0, 30)) / S);   // its delay, in ticks
                    B.charges.push({ x: p.x, y: p.y, d, r: r(70, 95),
                        lobes: Array.from({ length: 4 }, () => ({ a: dir + r(-0.95, 0.95), s: r(0.35, 0.6), k: r(0.5, 0.8) })) });
                    const sc = at((i + 0.5) * len / n, r(10, 30));
                    B.scorch.push({ x: sc.x, y: sc.y, r: r(55, 80), d });
                    for (let k = 0; k < 7; k++) {
                        const a = dir + r(-1.1, 1.1), v = r(2.5, 9), q = at((i + 0.5) * len / n + r(-20, 20), 6);
                        B.debris.push({ x: q.x, y: q.y, px: q.x, py: q.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: r(0, 6.28), vr: r(-0.4, 0.4),
                            w: r(8, 20), h: r(4, 9), d, gold: Math.random() < 0.35, glass: Math.random() < 0.3 });
                    }
                    for (let k = 0; k < 16; k++) {
                        const a = dir + r(-1.4, 1.4), v = r(5, 15);
                        B.sparks.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: Math.round(r(260, 620) / S), d });
                    }
                    for (let k = 0; k < 5; k++) {
                        const q = at((i + 0.5) * len / n + r(-30, 30), r(10, 60));
                        B.smoke.push({ x: q.x, y: q.y, px: q.x, py: q.y, vx: Math.cos(dir) * r(0.15, 0.55) + r(-0.25, 0.25), vy: Math.sin(dir) * r(0.15, 0.55) + r(-0.25, 0.25),
                            r0: r(40, 60), life: Math.round(r(2600, 4200) / S), d: d + Math.round(r(80, 260) / S) });
                    }
                    for (let k = 0; k < 6; k++) {
                        const q = at((i + 0.5) * len / n + r(-40, 40), r(4, 90));
                        B.embers.push({ x: q.x, y: q.y, px: q.x, py: q.y, vx: Math.cos(dir) * r(0.1, 0.6), vy: Math.sin(dir) * r(0.1, 0.6),
                            life: Math.round(r(1600, 3200) / S), ph: r(0, 6.28), d: d + Math.round(r(60, 300) / S) });
                    }
                }
                B.sparks.length = Math.min(B.sparks.length, BREACH.SPARK_MAX);
                B.smoke.length = Math.min(B.smoke.length, BREACH.SMOKE_MAX);
                this._breachFx = B;
            },

            /** One sim tick: everything moves in game time, so pause and slow motion hold it. */
            updateBreachFx() {
                const B = this._breachFx;
                if (!B) return;
                const t = ++B.t, W = this.weather && this.weather.windVec ? this.weather.windVec : { x: 0, y: 0 };
                const move = (p, damp) => { p.px = p.x; p.py = p.y; if (t <= p.d) return; p.x += p.vx; p.y += p.vy; p.vx *= damp; p.vy *= damp; };
                for (const p of B.debris) { move(p, 0.9); if (t > p.d) { p.rot += p.vr; p.vr *= 0.92; } }
                for (const p of B.sparks) move(p, 0.88);
                for (const p of B.smoke) { move(p, 0.99); p.vx += W.x * 0.004; p.vy += W.y * 0.004; }
                for (const p of B.embers) { move(p, 1); p.x += Math.sin(t * 0.07 + p.ph) * 0.25; }
                if (t * CONFIG.LOOP.STEP_MS > BREACH.DEBRIS_MS) this._breachFx = null;
            },

            _breachClock(B) {
                const ip = RenderInterp, a = ip._drawActive && ip.alpha < 1 ? ip.alpha : 1;
                return { a, ms: (B.t - 1 + a) * CONFIG.LOOP.STEP_MS };
            },

            /** Before the darkness: scorch, debris and smoke. */
            drawBreachUnder(ctx, cb) {
                const B = this._breachFx;
                if (!B) return;
                const { a, ms } = this._breachClock(B), S = CONFIG.LOOP.STEP_MS;
                const L = (p) => p.px + (p.x - p.px) * a, T = (p) => p.py + (p.y - p.py) * a;
                const out = (x, y, m) => cb && (x < cb.left - m || x > cb.right + m || y < cb.top - m || y > cb.bottom + m);
                const linger = Math.min(1, (BREACH.DEBRIS_MS - ms) / 1000);
                ctx.save();
                for (const s of B.scorch) {
                    const age = ms - s.d * S; if (age < 0 || out(s.x, s.y, s.r * 1.3)) continue;
                    ctx.globalAlpha = Math.min(1, age / 120) * 0.9 * linger;
                    const sx = B.horiz ? 1.3 : 1, sy = B.horiz ? 1 : 1.3;
                    ctx.drawImage(_bScorch(), s.x - s.r * sx, s.y - s.r * sy, s.r * 2 * sx, s.r * 2 * sy);
                }
                for (const p of B.debris) {
                    if (ms < p.d * S) continue;
                    const x = L(p), y = T(p); if (out(x, y, 20)) continue;
                    ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.globalAlpha = linger;
                    if (p.glass) {
                        ctx.fillStyle = 'rgba(190, 200, 255, 0.55)';
                        ctx.beginPath(); ctx.moveTo(-p.w / 2, p.h / 2); ctx.lineTo(0, -p.h / 2); ctx.lineTo(p.w / 2, p.h / 3); ctx.closePath(); ctx.fill();
                    } else {
                        ctx.fillStyle = '#0e0c10'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                        if (p.gold) { ctx.fillStyle = 'rgba(232, 194, 122, 0.9)'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, 1.4); }
                    }
                    ctx.restore();
                }
                for (const p of B.smoke) {
                    const age = ms - p.d * S, life = p.life * S; if (age < 0 || age > life) continue;
                    const R = p.r0 * (1 + age / 1000 * 0.45), x = L(p), y = T(p); if (out(x, y, R)) continue;
                    ctx.globalAlpha = 0.95 * Math.min(1, age / 260) * Math.pow(1 - age / life, 1.2);
                    ctx.drawImage(_bSmoke(), x - R, y - R, R * 2, R * 2);
                }
                ctx.restore();
            },

            /** After the darkness (additive): the light spill, fireballs, shock rings, sparks, embers, the burning lip. */
            drawBreachGlow(ctx, cb) {
                const B = this._breachFx;
                if (!B) return;
                const { a, ms } = this._breachClock(B), S = CONFIG.LOOP.STEP_MS, w = B.wall;
                const L = (p) => p.px + (p.x - p.px) * a, T = (p) => p.py + (p.y - p.py) * a;
                if (ms > Math.max(BREACH.LIP_MS, 4500)) return;   // only scorch and debris remain (drawn under)
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
                const spill = Math.max(0, 1 - ms / BREACH.SPILL_MS);
                if (spill > 0) {
                    const flick = 0.85 + 0.15 * Math.sin(ms * 0.05) * Math.sin(ms * 0.031), R = BREACH.SPILL_R;
                    ctx.globalAlpha = 0.42 * Math.pow(spill, 1.8) * flick;
                    if (B.horiz) ctx.drawImage(_bPool(), cx - R * 1.25, cy - R, R * 2.5, R * 2);
                    else ctx.drawImage(_bPool(), cx - R, cy - R * 1.25, R * 2, R * 2.5);
                }
                for (const c of B.charges) {
                    const age = ms - c.d * S; if (age < 0 || age > BREACH.FIRE_MS) continue;
                    const u = age / BREACH.FIRE_MS, grow = 1 - Math.pow(1 - Math.min(1, age / 160), 3), fade = Math.pow(1 - u, 1.8);
                    if (age < 70) { ctx.globalAlpha = 0.85 * (1 - age / 70); const R = 36 + age * 0.6; ctx.drawImage(_bCore(), c.x - R, c.y - R, R * 2, R * 2); }
                    const R = c.r * (0.45 + 0.75 * grow);
                    ctx.globalAlpha = 0.65 * fade; ctx.drawImage(_bFire(), c.x - R, c.y - R, R * 2, R * 2);
                    ctx.globalAlpha = 0.38 * fade;
                    for (const l of c.lobes) {
                        const rr = R * l.k, ox = Math.cos(l.a) * R * l.s, oy = Math.sin(l.a) * R * l.s;
                        ctx.drawImage(_bFire(), c.x + ox - rr, c.y + oy - rr, rr * 2, rr * 2);
                    }
                    const ra = Math.min(1, age / 380);
                    if (ra < 1) {                                              // the shock ring: a thin gold line, half, into the room
                        ctx.globalAlpha = (1 - ra) * 0.7; ctx.strokeStyle = 'rgb(255, 214, 140)'; ctx.lineWidth = 3 * (1 - ra) + 0.6;
                        const a0 = B.dir - Math.PI / 2;
                        ctx.beginPath(); ctx.ellipse(c.x, c.y, (B.horiz ? 20 : 14) + ra * (B.horiz ? 150 : 110), (B.horiz ? 14 : 20) + ra * (B.horiz ? 110 : 150), 0, a0, a0 + Math.PI); ctx.stroke();
                    }
                }
                ctx.lineCap = 'round'; ctx.lineWidth = 1.8;
                for (const p of B.sparks) {
                    const age = ms - p.d * S, life = p.life * S; if (age < 0 || age > life) continue;
                    const u = age / life, x = L(p), y = T(p);
                    if (cb && (x < cb.left - 40 || x > cb.right + 40 || y < cb.top - 40 || y > cb.bottom + 40)) continue;
                    ctx.globalAlpha = 1 - u; ctx.strokeStyle = u < 0.35 ? 'rgb(255, 245, 210)' : 'rgb(255, 170, 70)';
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * 2.6, y - p.vy * 2.6); ctx.stroke();
                }
                ctx.fillStyle = 'rgb(255, 230, 170)';
                for (const p of B.embers) {
                    const age = ms - p.d * S, life = p.life * S; if (age < 0 || age > life) continue;
                    const x = L(p), y = T(p);
                    ctx.globalAlpha = (1 - age / life) * (0.6 + 0.4 * Math.sin(age * 0.02 + p.ph * 5));
                    ctx.drawImage(_bEmber(), x - 5, y - 5, 10, 10); ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
                }
                for (const p of B.debris) {                                    // hot edges, the first moments
                    const age = ms - p.d * S; if (age < 0 || age > 900 || p.glass) continue;
                    ctx.globalAlpha = (1 - age / 900) * 0.6; ctx.drawImage(_bEmber(), L(p) - 6, T(p) - 6, 12, 12);
                }
                const lip = Math.max(0, 1 - ms / BREACH.LIP_MS);
                if (lip > 0) for (const s of B.scorch) {
                    if (ms < s.d * S) continue;
                    ctx.globalAlpha = lip * (0.35 + 0.15 * Math.sin(ms * 0.03 + s.x + s.y));
                    if (B.horiz) ctx.drawImage(_bEmber(), s.x - 40, cy - 11, 80, 22); else ctx.drawImage(_bEmber(), cx - 11, s.y - 40, 22, 80);
                }
                ctx.restore();
                if (ms < 120) {                                                // a brief warm flash over the frame
                    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.14 * (1 - ms / 120); ctx.fillStyle = '#ffd9a0';
                    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
                }
            }
        });
