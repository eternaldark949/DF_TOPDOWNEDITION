        /* =====================================================================
           WEAPON MODELS — every gun as data: parts in the gun's own frame (+x down
           the barrel, the grip hand near 0,0, +y to the holder's right), each in a
           material. A model is painted once into a sprite (bakeWeapon) and stamped
           by drawWeapon (ui/humanoid-render.js); only its glows are drawn live.
           Seen from above a barrel is a cylinder, so its shine runs down the middle
           whichever way the holder turns: the baked shading never needs relighting.
             muzzle   barrel tip (shots and the laser leave from here: weaponMuzzleLocal)
             rail     where an under-barrel laser module sits (its front end)
             brass    spent casings fly from the ejection port on each shot
             glow     live emitters [x, y, r, colour]
           ===================================================================== */
        const GUN_MATERIALS = {             // base, edge (dark rim), hi (the shine down the middle)
            gunmetal: ['#3a3f4a', '#121419', '#8a92a4'],
            polymer:  ['#27252e', '#0c0b10', '#56526a'],
            black:    ['#1b1a22', '#050508', '#5d5b72'],
            silver:   ['#b4b8c8', '#4f5264', '#f4f5fb'],
            gold:     ['#c8982a', '#5e400b', '#ffe79a'],
            pearl:    ['#d6cff0', '#6f6799', '#fdfbff'],
            lavender: ['#b4acea', '#4f4796', '#efebff'],
            pink:     ['#ff4aa6', '#7d0f49', '#ffb3da'],
            crimson:  ['#b0142f', '#4a0612', '#ff6078'],
            teal:     ['#17c4a6', '#075044', '#8dffe9'],
            violet:   ['#6c40cc', '#26105a', '#b89aff']
        };

        // rr: rounded rect [x, y, w, h, r] · poly: points · ring: stroked rounded rect · lines: [x1, y1, x2, y2]… in `c`
        const WEAPON_MODELS = {
            pistol_fpx: {
                stance: 'pistol', muzzle: [13.4, 1], rail: [11, 3.9], brass: true,
                parts: [
                    { poly: [[-2.5, 3], [1.8, 3], [1, 8.5], [-3.4, 8]], m: 'polymer' },
                    { ring: [1.2, 3, 3.4, 2.6, 1.2], m: 'polymer' },
                    { rr: [-3, -1.3, 15, 4.6, 1.2], m: 'gunmetal' },
                    { rr: [11.8, -0.2, 1.6, 2.4, 0.5], m: 'black' },
                    { lines: [[-2.2, -0.8, -2.2, 2.8], [-1.4, -0.8, -1.4, 2.8], [-0.6, -0.8, -0.6, 2.8], [0.2, -0.8, 0.2, 2.8]], c: 'rgba(8, 8, 12, 0.55)', w: 0.35 },
                    { rr: [4, -0.3, 3.4, 0.9, 0.3], m: 'black' },                              // ejection port
                    { dot: [9.5, 1, 0.75], c: '#00f3ff' }
                ],
                glow: [[9.5, 1, 3, '#00f3ff']]
            },
            pistol_anavia: {
                stance: 'pistol', muzzle: [13.4, 1], rail: [11, 3.9], brass: false,
                parts: [
                    { poly: [[-2.4, 3], [1.6, 3], [0.6, 8.2], [-3.2, 7.8]], m: 'black' },
                    { ring: [1.1, 3, 3.3, 2.5, 1.2], m: 'gold' },
                    { poly: [[-3, -1.4], [9.5, -1.4], [13.2, 0.1], [13.2, 1.9], [9.5, 3.4], [-3, 3.4]], m: 'lavender' },
                    { lines: [[-2, 1, 9.5, 1]], c: '#f7d77a', w: 0.55 },                        // gold inlay down the spine
                    { rr: [2, -0.9, 7, 0.7, 0.35], m: 'gold' }, { rr: [2, 2.2, 7, 0.7, 0.35], m: 'gold' },
                    { rr: [9.8, 0.4, 2.6, 1.2, 0.6], c: '#d8d8ff' }
                ],
                glow: [[11.2, 1, 3.4, '#ccccff'], [5, 1, 2.2, '#ccccff']]
            },
            pistol_ganger: {                                                                    // the hot pink pistol
                stance: 'pistol', muzzle: [12.9, 1], rail: [10.5, 3.9], brass: true,
                parts: [
                    { poly: [[-2.5, 3], [1.8, 3], [1, 8.5], [-3.4, 8]], m: 'pink' },
                    { ring: [1.2, 3, 3.4, 2.6, 1.2], m: 'pink' },
                    { rr: [-2.6, 2.1, 12, 1.6, 0.6], m: 'pink' },
                    { rr: [-3, -1.2, 14.5, 4.4, 1.1], m: 'silver' },
                    { rr: [11.3, -0.1, 1.6, 2.2, 0.5], m: 'black' },
                    { lines: [[-2.2, -0.7, -2.2, 2.7], [-1.4, -0.7, -1.4, 2.7], [-0.6, -0.7, -0.6, 2.7]], c: 'rgba(40, 30, 50, 0.5)', w: 0.35 },
                    { rr: [4, -0.2, 3.2, 0.9, 0.3], m: 'black' }
                ],
                glow: []
            },
            rifle_rb98: {                                                                       // SMG-class: stubby, a forward grip, a curved mag
                stance: 'rifle', muzzle: [29.3, 1.5], rail: [22, 4.8], brass: true,
                parts: [
                    { poly: [[-9, 0.2], [-1, 0.4], [-1, 4.6], [-9, 5.4]], m: 'polymer' },
                    { rr: [-6.6, 1.8, 4, 1.8, 0.8], c: '#0a090e' },                                // skeleton stock cut-out
                    { rr: [-9.8, -0.4, 1.4, 6.2, 0.6], m: 'black' },
                    { poly: [[4, 4.6], [7.8, 4.6], [8.8, 10.4], [5, 11]], m: 'polymer' },
                    { rr: [15.5, 4.2, 2.6, 4.2, 1], m: 'polymer' },
                    { rr: [-1, -1.8, 17, 6.6, 1.5], m: 'gunmetal' },
                    { lines: [[1, -1.4, 1, -0.6], [2.3, -1.4, 2.3, -0.6], [3.6, -1.4, 3.6, -0.6], [4.9, -1.4, 4.9, -0.6], [6.2, -1.4, 6.2, -0.6], [7.5, -1.4, 7.5, -0.6], [8.8, -1.4, 8.8, -0.6], [10.1, -1.4, 10.1, -0.6], [11.4, -1.4, 11.4, -0.6]], c: 'rgba(6, 6, 10, 0.6)', w: 0.45 },
                    { rr: [13, -1, 10, 5, 1.4], m: 'teal' },
                    { lines: [[14.6, -0.3, 14.6, 3.3], [16.2, -0.3, 16.2, 3.3], [17.8, -0.3, 17.8, 3.3], [19.4, -0.3, 19.4, 3.3], [21, -0.3, 21, 3.3]], c: 'rgba(4, 40, 34, 0.7)', w: 0.5 },
                    { rr: [23, 0.5, 5, 2, 0.6], m: 'black' },
                    { rr: [27, 0, 2.3, 3, 0.7], m: 'gunmetal' },
                    { rr: [5, 3.2, 3.4, 1, 0.3], m: 'black' }
                ],
                glow: [[18, 1.5, 3.2, '#00ffcc']]
            },
            sniper_sara: {                                                                      // YourGirlSara: gold and black, fluted, a brake
                stance: 'sniper', muzzle: [55.2, 0.5], rail: [44, 3.2], brass: true,
                parts: [
                    { poly: [[-12, -1.5], [-1, -1], [-1, 3.2], [-8, 5.4], [-12, 5]], m: 'black' },
                    { rr: [-9, -1.2, 6.4, 1.7, 0.7], m: 'gold' },
                    { rr: [2.6, 3, 1.2, 3, 0.4], m: 'gunmetal' }, { rr: [2.2, 5.4, 2, 2, 1], m: 'gunmetal' },   // bolt handle
                    { rr: [-1, -2.2, 26, 5.4, 1.4], m: 'gold' },
                    { rr: [25, -0.8, 27, 2.6, 0.9], m: 'black' },
                    { lines: [[27, -0.1, 48, -0.1], [27, 1.1, 48, 1.1]], c: 'rgba(120, 118, 140, 0.55)', w: 0.35 },
                    { rr: [51, -1.6, 4.2, 4.2, 0.8], m: 'gunmetal' },
                    { lines: [[52.2, -1.4, 52.2, 2.4], [53.7, -1.4, 53.7, 2.4]], c: 'rgba(0, 0, 0, 0.7)', w: 0.5 },
                    { rr: [3, -6.6, 17, 3.4, 1.5], m: 'black' },
                    { rr: [1.6, -7.3, 3.2, 4.8, 1], m: 'black' }, { rr: [16.8, -7.3, 3.6, 4.8, 1], m: 'black' },
                    { rr: [7, -7.1, 1.2, 4.4, 0.4], m: 'gold' }, { rr: [13, -7.1, 1.2, 4.4, 0.4], m: 'gold' },
                    { rr: [20.2, -6.9, 0.8, 4, 0.3], c: '#00f3ff' }
                ],
                glow: [[20.6, -4.9, 3.2, '#00f3ff']]
            },
            sniper_sr86: {                                                                      // SR-86: crimson thumbhole, folded bipod, a can
                stance: 'sniper', muzzle: [55.2, 0.5], rail: [40, 3.6], brass: true,
                parts: [
                    { poly: [[-12, -1.2], [-1, -1], [-1, 3.4], [-5, 3.8], [-7, 2.4], [-9, 3.8], [-12, 5]], m: 'crimson' },
                    { rr: [-7.8, 0.9, 2.8, 1.4, 0.7], c: '#14040a' },                              // the thumbhole
                    { rr: [26, 3, 12, 0.9, 0.4], m: 'gunmetal' }, { rr: [26, -2.9, 12, 0.9, 0.4], m: 'gunmetal' },   // bipod legs, folded
                    { rr: [-1, -2, 24, 5, 1.2], m: 'gunmetal' },
                    { rr: [12, -1.8, 14, 4.6, 1.4], m: 'crimson' },
                    { rr: [23, -0.6, 27, 2.2, 0.8], m: 'black' },
                    { rr: [49, -1.3, 6.2, 3.6, 1.6], m: 'gunmetal' },
                    { lines: [[50.5, -1.1, 50.5, 2.1], [52, -1.1, 52, 2.1], [53.5, -1.1, 53.5, 2.1]], c: 'rgba(0, 0, 0, 0.45)', w: 0.3 },
                    { rr: [2, -6.4, 15, 3.2, 1.4], m: 'black' },
                    { rr: [0.8, -7, 3, 4.4, 1], m: 'black' }, { rr: [15, -7, 3.2, 4.4, 1], m: 'black' },
                    { rr: [6, -6.8, 1.2, 4, 0.4], m: 'crimson' }, { rr: [11.5, -6.8, 1.2, 4, 0.4], m: 'crimson' },
                    { rr: [18, -6.6, 0.8, 3.6, 0.3], c: '#ff4060' }
                ],
                glow: [[18.4, -4.8, 3, '#ff4060']]
            },
            golden_child: {                                                                     // an orb launcher: ornate gold round a violet core
                stance: 'pistol', muzzle: [20, 1], rail: [14, 5.4], brass: false,
                parts: [
                    { poly: [[-2, 3.5], [2.6, 3.5], [1.8, 9], [-2.8, 8.6]], m: 'black' },
                    { rr: [-3, -3, 17, 8, 3], m: 'gold' },
                    { lines: [[-1, -1.8, 2, -2.3], [2, -2.3, 5, -1.8], [5, -1.8, 8, -2.3], [8, -2.3, 11, -1.8], [-1, 3.8, 2, 4.3], [2, 4.3, 5, 3.8], [5, 3.8, 8, 4.3], [8, 4.3, 11, 3.8]], c: '#fff2b8', w: 0.4 },
                    { rr: [3, -0.4, 7, 2.8, 1.2], m: 'violet' },
                    { rr: [13, -2, 6.4, 6, [0, 2.4, 2.4, 0]], m: 'black' },
                    { dot: [17, 1, 1.9], c: '#ffd700' }
                ],
                glow: [[6.5, 1, 3.4, '#b89aff'], [17, 1, 3.6, '#ffd700']]
            }
        };
        const LASER_MODULE = [                                                                  // under-barrel laser: body, then emitter at its front
            { rr: [-5.5, -0.9, 5.5, 1.9, 0.6], m: 'gunmetal' }, { dot: [-0.3, 0.05, 0.45], c: '#ff2a3a' }
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
            if (!p.m) { c.fillStyle = p.c; c.fill(path); return; }
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
            bx0 -= 1; by0 -= 1; bx1 += 1; by1 += 1;
            const cv = document.createElement('canvas'), K = WEAPON_BAKE;
            cv.width = Math.ceil((bx1 - bx0) * K); cv.height = Math.ceil((by1 - by0) * K);
            const c = cv.getContext('2d');
            c.scale(K, K); c.translate(-bx0, -by0); c.lineJoin = 'round';
            c.strokeStyle = 'rgba(10, 6, 20, 0.85)'; c.lineWidth = 0.9;                         // the ink outline, all solids at once
            for (const p of parts) if (!p.lines && !p.dot) c.stroke(_gunPartPath(p));
            for (const p of parts) _paintGunPart(c, p);
            const out = { cv, x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
            cache[laser ? 1 : 0] = out; _weaponSprites.set(key, cache);
            return out;
        }
