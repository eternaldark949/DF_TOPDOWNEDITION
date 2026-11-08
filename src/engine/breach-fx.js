        // GameEngine — The breach blast: a wall blown in (the Double Nights penthouse ambush, story step 4).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Charges ripple along the wall; each is a white-hot core, a lumpy fireball and a thin gold shock ring.
        // Warm light spills across the floor and flickers out; black-lacquer panels (some gold-trimmed) and
        // glass are thrown into the room and stay as debris; violet-grey smoke and embers linger.
        // This file sets the blast up (spawnBreachBlast) and holds its sprites; the effects system's 'breach'
        // (directory/effects-system.js) moves it and says how it looks, in two passes: 'under' (scorch, debris,
        // smoke) before the darkness, so the room's light and the blast's own spill light them; 'glow'
        // (additive light, fire, sparks) after it.
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
            return canvasKit.bake(_breachSprites, key, () => canvasKit.glow([128, stops]));
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
                this.effects.spawn('breach', B);
            },
        });
