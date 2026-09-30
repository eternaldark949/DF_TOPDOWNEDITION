        /* =====================================================================
           WEAPON MODELS — every gun as data: parts in the gun's own frame (+x down
           the barrel, the grip hand near 0,0, +y to the holder's right), each in a
           material. A model is painted once into a sprite (bakeWeapon) and stamped
           by drawWeapon (ui/humanoid-render.js); only its glows are drawn live.
           Drawn from straight above: square-cut slabs in deep colours with lines of light.
           A slab's sheen runs down its middle whichever way the holder turns, so the
           baked shading never needs relighting.
             muzzle   barrel tip (shots and the laser leave from here: weaponMuzzleLocal)
             rail     where an under-barrel laser module sits (its front end)
             brass    the glitter colour of the spent casings each shot throws (null: an energy gun)
             glow     live emitters [x, y, r, colour]
           ===================================================================== */
        const GUN_MATERIALS = {             // base, edge (dark rim), hi (the sheen down the middle) — deep, saturated, a little lacquered
            abyss:      ['#0d0b16', '#000000', '#2e2a48'],
            midnight:   ['#0f1a52', '#030620', '#34489c'],
            lavender:   ['#a58ee6', '#4a3790', '#e6dcff'],
            periwinkle: ['#7d8cf5', '#2e3796', '#d6dcff'],
            pearl:      ['#e9e6f6', '#8a84a8', '#ffffff'],
            crimson:    ['#b00c28', '#44020c', '#ff4d68'],
            teal:       ['#0a9e8c', '#023d36', '#6ff5e2'],
            bronze:     ['#8a4a1c', '#2e1406', '#d98a4a'],
            molten:     ['#ff5a12', '#7a1c00', '#ffc080'],
            gold:       ['#c9942a', '#5a3a06', '#ffe08a'],
            champagne:  ['#e8d3a4', '#8e7446', '#fff6dc'],
            pink:       ['#e0147a', '#5e0430', '#ff8ac4']
        };

        // Seen from straight above: every gun is a stack of square-cut slabs along its axis (+x down the
        // barrel), its width across. _r: a slab from x0 to x1, centred on cy, w wide, in a material.
        // _e: an emitter (baked with its own halo; the brightest also glow live, see `glow`).
        const _r = (x0, x1, cy, w, m, r = 0.3) => ({ rr: [x0, cy - w / 2, x1 - x0, w, r], m });
        const _e = (x0, x1, cy, w, c) => ({ rr: [x0, cy - w / 2, x1 - x0, w, 0.2], c, emit: true });

        const WEAPON_MODELS = {
            pistol_fpx: {                                                                       // black, with deep-blue light
                stance: 'pistol', muzzle: [13.4, 1], rail: [11, 3.6], brass: '#6f8cff',
                parts: [
                    _r(-3, 12.2, 1, 4.6, 'abyss', 0.5),
                    _r(-2.4, 1.4, 1, 3.2, 'midnight'),                                          // rear plate
                    _e(0.4, 10.6, -0.55, 0.45, '#3d6bff'), _e(0.4, 10.6, 2.55, 0.45, '#3d6bff'),   // the two light lines down the slide
                    _r(2.6, 6.2, 1, 1.4, 'midnight'),                                           // the port
                    _r(12.2, 13.4, 1, 2.4, 'abyss'),
                    _e(10.8, 11.8, 1, 1, '#6f9bff')                                              // front sight
                ],
                glow: [[11.3, 1, 3.2, '#3d6bff'], [5.5, -0.55, 2.4, '#3d6bff'], [5.5, 2.55, 2.4, '#3d6bff']]
            },
            pistol_anavia: {                                                                    // periwinkle and lavender, a light for a core
                stance: 'pistol', muzzle: [13.4, 1], rail: [11, 3.8], brass: null,
                parts: [
                    _r(2.4, 4, 1, 7.2, 'lavender'), _r(6.6, 8.2, 1, 7.2, 'lavender'),             // the square fins
                    _r(-3, 11.2, 1, 4.8, 'lavender', 0.6),
                    _r(-2.4, 0.6, 1, 3.4, 'periwinkle'),
                    _e(0.8, 10.6, 1, 1.1, '#9aa6ff'),                                             // the core
                    _r(11.2, 13.4, 1, 3.4, 'periwinkle'),
                    _e(12.4, 13.4, 1, 2.2, '#b9c2ff')
                ],
                glow: [[13, 1, 3.4, '#8c9cff'], [5.5, 1, 2.8, '#a58ee6'], [3.2, 1, 2, '#9fb0ff'], [7.4, 1, 2, '#9fb0ff']]
            },
            pistol_ganger: {                                                                    // the hot pink pistol
                stance: 'pistol', muzzle: [12.9, 1], rail: [10.5, 3.6], brass: '#ff6ab8',
                parts: [
                    _r(-3, 11.6, 1, 4.4, 'pink', 0.5),
                    _r(-2.4, 1, 1, 3, 'abyss'),
                    _r(2.6, 6, 1, 1.3, 'abyss'),
                    _r(11.6, 12.9, 1, 2.2, 'abyss'),
                    _e(0.6, 10.2, 2.35, 0.4, '#ff9ad2')
                ],
                glow: []
            },
            rifle_rb98: {                                                                       // teal and white
                stance: 'rifle', muzzle: [29.3, 1.5], rail: [22, 4.6], brass: '#6ff5e2',
                parts: [
                    _r(-9.8, -1, 1.5, 4, 'pearl'),
                    _r(-9.8, -8.6, 1.5, 4.6, 'abyss'),                                           // butt pad
                    _e(-8, -2, 1.5, 0.6, '#3dffe0'),
                    _r(-1, 14, 1.5, 5.6, 'pearl', 0.5),
                    _r(2, 12, 1.5, 1.6, 'abyss'),                                                // top rail
                    _r(2.6, 3.6, 1.5, 2.4, 'teal'), _r(5, 6, 1.5, 2.4, 'teal'), _r(7.4, 8.4, 1.5, 2.4, 'teal'), _r(9.8, 10.8, 1.5, 2.4, 'teal'),
                    _r(13, 23, 1.5, 5, 'teal', 0.4),
                    _e(14.2, 21.8, -0.45, 0.45, '#3dffe0'), _e(14.2, 21.8, 3.45, 0.45, '#3dffe0'),
                    _r(15, 16, 1.5, 3, 'pearl'), _r(17.5, 18.5, 1.5, 3, 'pearl'), _r(20, 21, 1.5, 3, 'pearl'),
                    _r(23, 27.2, 1.5, 1.8, 'abyss'),
                    _r(27, 29.3, 1.5, 3, 'pearl')
                ],
                glow: [[18, -0.45, 3, '#3dffe0'], [18, 3.45, 3, '#3dffe0'], [-5, 1.5, 2.4, '#3dffe0']]
            },
            sniper_sara: {                                                                      // YourGirlSara: molten orange, bronze and black
                stance: 'sniper', muzzle: [55.2, 0.5], rail: [44, 3], brass: '#ff9a3c',
                parts: [
                    _r(-12, -1, 0.5, 4.8, 'abyss', 0.5),
                    _e(-10.5, -2.5, 0.5, 0.7, '#ff6a1a'),
                    _r(-1, 25, 0.5, 5.2, 'bronze', 0.5),
                    _e(0.5, 23.5, -1.7, 0.45, '#ff7a24'), _e(0.5, 23.5, 2.7, 0.45, '#ff7a24'),
                    _r(25, 51, 0.5, 2.4, 'abyss'),
                    _e(26, 50, 0.5, 0.5, '#ff5a12'),                                            // the barrel's heat line
                    _r(51, 55.2, 0.5, 4.2, 'bronze'),
                    _r(52, 52.8, 0.5, 4.2, 'abyss'), _r(53.6, 54.4, 0.5, 4.2, 'abyss'),
                    _r(3, 20, 0.5, 3.2, 'abyss', 0.4),                                          // the scope, on top
                    _r(6.5, 8, 0.5, 3.8, 'bronze'), _r(14, 15.5, 0.5, 3.8, 'bronze'),
                    _e(19.2, 20.4, 0.5, 2.4, '#ffb060')
                ],
                glow: [[19.8, 0.5, 3.6, '#ff7a24'], [12, -1.7, 3, '#ff6a1a'], [12, 2.7, 3, '#ff6a1a'], [40, 0.5, 3, '#ff5a12']]
            },
            sniper_sr86: {                                                                      // SR-86: black, red and white
                stance: 'sniper', muzzle: [55.2, 0.5], rail: [40, 3.4], brass: '#ff4d68',
                parts: [
                    _r(-12, -1, 0.5, 4.4, 'abyss', 0.5),
                    _r(-9, -3, 0.5, 1.2, 'crimson'),
                    _r(-1, 23, 0.5, 4.4, 'pearl', 0.5),
                    _r(12, 26, 0.5, 4.8, 'abyss', 0.4),
                    _e(13, 25, -1.45, 0.45, '#ff2448'), _e(13, 25, 2.45, 0.45, '#ff2448'),
                    _r(26, 49, 0.5, 2, 'abyss'),
                    _r(49, 55.2, 0.5, 3.6, 'crimson', 0.5),
                    _r(50.5, 51.1, 0.5, 3.6, 'abyss'), _r(52.3, 52.9, 0.5, 3.6, 'abyss'),
                    _r(2, 17, 0.5, 2.8, 'abyss', 0.4),
                    _r(5.5, 6.7, 0.5, 3.4, 'pearl'), _r(11.5, 12.7, 0.5, 3.4, 'pearl'),
                    _e(16.2, 17.4, 0.5, 2, '#ff2448')
                ],
                glow: [[16.8, 0.5, 3.4, '#ff2448'], [19, -1.45, 2.6, '#ff2448'], [19, 2.45, 2.6, '#ff2448']]
            },
            golden_child: {                                                                     // gold and champagne, a light in a square
                stance: 'pistol', muzzle: [20, 1], rail: [14, 5.6], brass: null,
                parts: [
                    _r(-3, 14, 1, 8, 'gold', 0.8),
                    _r(-1.6, 1.4, -1.4, 2, 'champagne'), _r(-1.6, 1.4, 3.4, 2, 'champagne'),
                    _r(9.6, 12.6, -1.4, 2, 'champagne'), _r(9.6, 12.6, 3.4, 2, 'champagne'),
                    _r(3.4, 8.6, 1, 5.2, 'champagne'),
                    _e(4.4, 7.6, 1, 3.2, '#fff1c4'),                                              // the core
                    _r(14, 20, 1, 6, 'champagne', 0.6),
                    _e(17, 19.4, 1, 2.4, '#ffd76a')
                ],
                glow: [[6, 1, 4.4, '#ffd76a'], [18.4, 1, 3.8, '#ffe7a0']]
            }
        };
        const LASER_MODULE = [                                                                  // under-barrel laser: body, then emitter at its front
            { rr: [-5.5, -0.9, 5.5, 1.9, 0.3], m: 'abyss' }, { rr: [-0.9, -0.5, 0.9, 1.1, 0.2], c: '#ff2a3a', emit: true }
        ];

        /** The model for a weapon id: its own, else the closest by name, else the FP-X — never nothing. */
        function weaponModel(id) {
            id = id || '';
            return WEAPON_MODELS[id] || (id.includes('sniper') ? WEAPON_MODELS.sniper_sara : id.includes('rifle') ? WEAPON_MODELS.rifle_rb98
                : id.includes('golden') ? WEAPON_MODELS.golden_child : id.includes('anavia') ? WEAPON_MODELS.pistol_anavia : WEAPON_MODELS.pistol_fpx);
        }

        const _weaponSprites = new Map();
        const WEAPON_BAKE = 4;                                                                  // sprite px per model px

        function _gunPartPath(p, ox = 0, oy = 0) {
            const path = new Path2D();
            if (p.rr) path.roundRect(p.rr[0] + ox, p.rr[1] + oy, p.rr[2], p.rr[3], p.rr[4]);
            else if (p.ring) path.roundRect(p.ring[0] + ox, p.ring[1] + oy, p.ring[2], p.ring[3], p.ring[4]);
            else if (p.poly) p.poly.forEach(([x, y], i) => i ? path.lineTo(x + ox, y + oy) : path.moveTo(x + ox, y + oy));
            else if (p.dot) path.arc(p.dot[0] + ox, p.dot[1] + oy, p.dot[2], 0, Math.PI * 2);
            if (p.poly) path.closePath();
            return path;
        }
        function _gunPartBox(p) {
            if (p.rr || p.ring) { const r = p.rr || p.ring; return [r[0], r[1], r[0] + r[2], r[1] + r[3]]; }
            if (p.poly) { const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
            if (p.dot) return [p.dot[0] - p.dot[2], p.dot[1] - p.dot[2], p.dot[0] + p.dot[2], p.dot[1] + p.dot[2]];
            if (p.lines) { const xs = p.lines.flatMap(l => [l[0], l[2]]), ys = p.lines.flatMap(l => [l[1], l[3]]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
            return [0, 0, 0, 0];
        }

        /**
         * Paint one part: a cylinder across its width (dark rims, the body, a shine a little
         * above the middle, a 1-sprite-px specular line), or plain colour for glass and emitters.
         */
        function _paintGunPart(c, p) {
            const [x0, y0, x1, y1] = _gunPartBox(p);
            if (p.lines) {
                c.strokeStyle = p.c; c.lineWidth = p.w || 0.4; c.lineCap = 'round'; c.beginPath();
                for (const l of p.lines) { c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); }
                c.stroke(); return;
            }
            const path = _gunPartPath(p);
            if (p.ring) {
                const M = GUN_MATERIALS[p.m];
                c.strokeStyle = M[1]; c.lineWidth = 1.1; c.stroke(path);
                c.strokeStyle = M[0]; c.lineWidth = 0.6; c.stroke(path); return;
            }
            if (!p.m) {
                c.fillStyle = p.c;
                if (p.emit) { c.save(); c.shadowColor = p.c; c.shadowBlur = 2.2 * WEAPON_BAKE; c.fill(path); c.fill(path); c.restore(); }
                c.fill(path); return;
            }
            const M = GUN_MATERIALS[p.m], g = c.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, M[1]); g.addColorStop(0.16, M[0]); g.addColorStop(0.38, M[2]); g.addColorStop(0.6, M[0]); g.addColorStop(1, M[1]);
            c.fillStyle = g; c.fill(path);
            if (y1 - y0 > 1.4 && x1 - x0 > 2.5) {                                               // the specular line along the shine
                c.save(); c.clip(path);
                c.strokeStyle = 'rgba(255, 255, 255, 0.55)'; c.lineWidth = 1 / WEAPON_BAKE;
                const sy = y0 + (y1 - y0) * 0.36; c.beginPath(); c.moveTo(x0 + 0.6, sy); c.lineTo(x1 - 0.6, sy); c.stroke();
                c.restore();
            }
        }

        /**
         * The baked sprite of a model (with an under-barrel laser when `laser`): drawn at 1/WEAPON_BAKE
         * scale with its top-left at (x, y) in the gun's frame. An ink outline under every solid part
         * keeps the silhouette readable at any zoom.
         */
        function bakeWeapon(model, laser) {
            const key = model, cache = _weaponSprites.get(key) || {};
            if (cache[laser ? 1 : 0]) return cache[laser ? 1 : 0];
            let parts = model.parts;
            if (laser && model.rail) parts = parts.concat(LASER_MODULE.map(p => {
                const q = { ...p };
                if (p.rr) q.rr = [p.rr[0] + model.rail[0], p.rr[1] + model.rail[1], p.rr[2], p.rr[3], p.rr[4]];
                if (p.dot) q.dot = [p.dot[0] + model.rail[0], p.dot[1] + model.rail[1], p.dot[2]];
                return q;
            }));
            let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
            for (const p of parts) { const b = _gunPartBox(p); bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bx1 = Math.max(bx1, b[2]); by1 = Math.max(by1, b[3]); }
            bx0 -= 2.5; by0 -= 2.5; bx1 += 2.5; by1 += 2.5;                                   // room for the emitters' halos
            const cv = document.createElement('canvas'), K = WEAPON_BAKE;
            cv.width = Math.ceil((bx1 - bx0) * K); cv.height = Math.ceil((by1 - by0) * K);
            const c = cv.getContext('2d');
            c.scale(K, K); c.translate(-bx0, -by0); c.lineJoin = 'round';
            c.strokeStyle = 'rgba(8, 4, 18, 0.9)'; c.lineWidth = 0.7;                           // the ink outline, all solids at once
            for (const p of parts) if (p.m) c.stroke(_gunPartPath(p));
            for (const p of parts) _paintGunPart(c, p);
            const out = { cv, x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
            cache[laser ? 1 : 0] = out; _weaponSprites.set(key, cache);
            return out;
        }
