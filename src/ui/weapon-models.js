        /* =====================================================================
           WEAPON MODELS — every gun as data: parts in the gun's own frame (+x down
           the barrel, the grip hand near 0,0, +y to the holder's right), each in a
           material. A model is painted once into a sprite (bakeWeapon) and stamped
           by drawWeapon (ui/humanoid-render.js); only its lights are drawn live.
           Ethereal, elegant sci-fi seen from straight above, in the shapes of
           ETERNAL's catalog sketches, shaded as angular metallic glass: hard bevel
           facets, slanted glass glints, faceted gem knobs, glass sleeves over the
           lines of light. The shading runs along the gun, so it holds whichever
           way the holder turns and never needs relighting.
             muzzle   barrel tip (shots and the laser leave from here: weaponMuzzleLocal)
             rail     where the laser module sits (its front end)
             brass    the glitter colour of the spent casings each shot throws (null: an energy gun)
             fx       its signature (engine/combat-effects.js): trail 'crackle' | 'static' | 'wisp' behind the shot,
                      or barrel 'smoke' (after N quick shots with `after`) | 'embers' off the muzzle; col / core / dust / hot
             glow     live lights [x, y, r, colour], breathing slowly in a wave down the gun
             run      a spark that glides down a light line [x0, x1, y, colour]
           ===================================================================== */
        const GUN_MATERIALS = {             // base, edge (the dark facet: a deep shade of its own hue, never black), hi (the bright bevel)
            abyss:      ['#1a1436', '#0e0926', '#5c4fa0'],      // obsidian glass, violet in its depths
            midnight:   ['#172a86', '#0c1858', '#6f8cff'],
            lavender:   ['#a891ec', '#4a3790', '#f0e8ff'],
            periwinkle: ['#8392f7', '#2e3796', '#e2e6ff'],
            pearl:      ['#ece8fb', '#8f86b8', '#ffffff'],
            crimson:    ['#c0143e', '#6a0828', '#ff7a98'],
            teal:       ['#12b8a4', '#066a5e', '#9cfff2'],
            bronze:     ['#a0602e', '#5a2a10', '#f6b477'],       // rose bronze
            molten:     ['#ff6418', '#a03008', '#ffd09a'],
            gold:       ['#d2a038', '#7a5414', '#fff0b0'],
            champagne:  ['#eddcb2', '#8e7446', '#fffaea'],
            pink:       ['#e81c84', '#8a0a4a', '#ffa0d0'],
            violet:     ['#4a24a0', '#24105e', '#b596ff']
        };

        // Shapes (from the sketches): a rounded knob at the rear where the hand sits, a band that bulges out
        // both sides (the side view's big ring), a long rounded slide or barrel, square collars with slots of
        // light, a side knob and emblem, a nub at the muzzle.
        // _r slab x0→x1 centred on cy, w wide · _cap the same, fully rounded · _c a knob (a faceted gem) ·
        // _e/_ce lights (baked with a halo) · _g a glass sleeve over a light · _hole a bore · _slots three slots.
        const _r = (x0, x1, cy, w, m, r = 0.3) => ({ rr: [x0, cy - w / 2, x1 - x0, w, r], m });
        const _cap = (x0, x1, cy, w, m) => _r(x0, x1, cy, w, m, w / 2);
        const _c = (x, y, r, m) => ({ dot: [x, y, r], m });
        const _e = (x0, x1, cy, w, c) => ({ rr: [x0, cy - w / 2, x1 - x0, w, 0.2], c, emit: true });
        const _ce = (x, y, r, c) => ({ dot: [x, y, r], c, emit: true });
        const _g = (x0, x1, cy, w) => ({ rr: [x0, cy - w / 2, x1 - x0, w, w / 2], glass: true });
        const _hole = (x, y, r) => ({ dot: [x, y, r], c: '#020104' });
        const _slots = (x0, x1, cy, c) => [-1.3, 0, 1.3].map(o => _e(x0, x1, cy + o, 0.42, c));

        const WEAPON_MODELS = {
            pistol_fpx: {                                                                       // obsidian glass with deep-blue light (catalog sketch)
                stance: 'pistol', muzzle: [13.4, 1], rail: [10.5, 4.3], brass: '#6f8cff',
                parts: [
                    _c(-2, 1, 2.4, 'abyss'), _c(-2.2, 1, 1.05, 'midnight'),                     // the rear knob
                    _r(1, 12.2, 1, 4.4, 'abyss', 1.2),                                         // the slide
                    _e(3.4, 9.6, 1, 0.45, '#4a78ff'), _g(3, 10, 1, 1.5),                        // a light down its spine, under glass
                    _r(10.3, 11.9, 1, 1, 'midnight', 0.2), _e(10.6, 11.6, 1, 0.45, '#8fb0ff'),  // the sight notch
                    _cap(11.6, 13.4, 1, 2.6, 'midnight'),                                       // the muzzle nub
                    _cap(-1.4, 2.2, 1, 6.8, 'midnight'),                                        // the ring band, bulging both sides
                    _cap(-0.6, 1.4, 1, 5.2, 'abyss'),
                    _ce(0.4, -1.8, 0.75, '#4a78ff'), _ce(0.4, 3.8, 0.75, '#4a78ff')             // the ring's light at each side
                ],
                glow: [[0.4, -1.8, 2.6, '#4a78ff'], [0.4, 3.8, 2.6, '#4a78ff'], [6.5, 1, 2.6, '#4a78ff'], [11.1, 1, 2.2, '#8fb0ff']],
                run: [3.4, 9.6, 1, '#9fbaff']
            },
            pistol_anavia: {                                                                    // periwinkle and lavender, a light for a core
                stance: 'pistol', muzzle: [13.4, 1], rail: [10, 4.5], brass: null, fx: { trail: 'crackle', col: '#a9b4ff', core: '#f1ecff' }, 
                parts: [
                    _c(-1.8, 1, 2.3, 'lavender'), _c(-2, 1, 1, 'periwinkle'),
                    _r(0.6, 11.4, 1, 4.8, 'lavender', 2),
                    _e(4, 10.2, 1, 0.9, '#9aa6ff'), _g(3.6, 10.6, 1, 2),                        // the core, under glass
                    _c(12.2, 1, 2, 'periwinkle'), _ce(12.5, 1, 0.9, '#c4cbff'),                 // the front orb
                    _cap(0.6, 3.4, 1, 7, 'periwinkle'),
                    _ce(2, -2, 0.7, '#9fb0ff'), _ce(2, 4, 0.7, '#9fb0ff')
                ],
                glow: [[2, -2, 2.2, '#9fb0ff'], [2, 4, 2.2, '#9fb0ff'], [7, 1, 2.8, '#a58ee6'], [12.5, 1, 3.2, '#8c9cff']],
                run: [4, 10.2, 1, '#e4e0ff']
            },
            pistol_ganger: {                                                                    // the hot pink pistol: the FP-X's shape
                stance: 'pistol', muzzle: [12.9, 1], rail: [10, 4.2], brass: '#ff6ab8',
                parts: [
                    _c(-2, 1, 2.3, 'pink'),
                    _r(1, 11.6, 1, 4.2, 'pink', 1.2),
                    _cap(11.2, 12.9, 1, 2.4, 'abyss'),
                    _cap(-1.4, 2, 1, 6.4, 'abyss'),
                    _e(0.3, 1, 1, 5.4, '#ff9ad2')
                ],
                glow: [[0.65, 1, 2.6, '#ff6ab8']]
            },
            rifle_rb98: {                                                                       // pearl and teal
                stance: 'rifle', muzzle: [29.3, 1.5], rail: [21, 4.3], brass: '#6ff5e2', fx: { barrel: 'smoke', after: 4, col: '#cfeee9' }, 
                parts: [
                    _cap(-10, -4.6, 1.5, 4.6, 'pearl'),                                         // the rear pad
                    _r(-5.6, 13.2, 1.5, 5.8, 'pearl', 2.2),                                    // the body
                    _e(-3.4, 11.4, 1.5, 0.5, '#3dffe0'), _g(-3.8, 11.8, 1.5, 1.7),
                    _r(13, 19, 1.5, 5, 'teal', 0.6), ..._slots(13.8, 18.2, 1.5, '#3dffe0'),      // the vent collar
                    _cap(19, 27.4, 1.5, 2.2, 'abyss'),
                    _cap(26.4, 29.3, 1.5, 3.2, 'pearl'),                                        // the muzzle cap
                    _cap(3.2, 6.4, 1.5, 7.4, 'teal'),                                           // the ring band
                    _ce(4.8, -1.9, 0.7, '#3dffe0'), _ce(4.8, 4.9, 0.7, '#3dffe0')
                ],
                glow: [[-1, 1.5, 2.2, '#3dffe0'], [4.8, -1.9, 2.4, '#3dffe0'], [4.8, 4.9, 2.4, '#3dffe0'], [16, 1.5, 3.2, '#3dffe0']],
                run: [-3.4, 11.4, 1.5, '#c8fff6']
            },
            sniper_sara: {                                                                      // YourGirlSara: molten orange, rose bronze and obsidian
                stance: 'sniper', muzzle: [55.2, 0.5], rail: [40, 2.9], brass: '#ff9a3c', fx: { barrel: 'embers', col: '#ff9a3c', hot: '#ffe0a0' }, 
                parts: [
                    _cap(-12, -2, 0.5, 5.4, 'abyss'),                                          // the rounded rear hump
                    _e(-10, -4, 0.5, 0.7, '#ff6a1a'),
                    _r(-2.6, 14.2, 0.5, 5.6, 'bronze', 1.2),                                   // the receiver
                    _c(6, 3.8, 1.3, 'bronze'),                                                  // the side knob
                    _r(14.6, 18.6, 0.5, 4.8, 'bronze', 0.4), ..._slots(15.2, 18, 0.5, '#ff7a24'),
                    _r(19.2, 23.2, 0.5, 4.8, 'bronze', 0.4), ..._slots(19.8, 22.6, 0.5, '#ff7a24'),
                    _cap(23.2, 51.4, 0.5, 2.8, 'abyss'),
                    _e(24.5, 50, 0.5, 0.5, '#ff5a12'), _g(24, 50.6, 0.5, 1.6),                  // the barrel's heat line, under glass
                    _r(51, 55.2, 0.5, 4, 'bronze', 0.8),                                        // the brake
                    _r(52.1, 52.7, 0.5, 4, 'abyss'), _r(53.5, 54.1, 0.5, 4, 'abyss'),
                    _cap(0.4, 13.6, 0.5, 3, 'abyss'),                                           // the scope, on top
                    _r(3.4, 4.6, 0.5, 3.6, 'bronze'), _r(9.4, 10.6, 0.5, 3.6, 'bronze'),
                    _ce(13, 0.5, 0.95, '#ffb060')
                ],
                glow: [[-7, 0.5, 2.4, '#ff6a1a'], [13, 0.5, 3.2, '#ff7a24'], [16.6, 0.5, 3, '#ff6a1a'], [21.2, 0.5, 3, '#ff6a1a'], [38, 0.5, 3, '#ff5a12']],
                run: [24.5, 50, 0.5, '#ffd09a']
            },
            sniper_sr86: {                                                                      // SR-86: obsidian, crimson and pearl (catalog sketch): one width, stock to muzzle
                stance: 'sniper', muzzle: [55.2, 0.5], rail: [40, 3.9], brass: '#ff4d68', fx: { barrel: 'smoke', col: '#d9d2de' }, 
                parts: [
                    _r(-12, -2, 0.5, 5, 'abyss', [2.5, 0.4, 0.4, 2.5]),                         // the thumb-hump rear, rounded at the back
                    _r(-9.6, -4, 0.5, 1, 'crimson'),
                    _r(-2, 14.2, 0.5, 5, 'pearl', 0.5),                                         // the receiver
                    _c(6, 3.6, 1.3, 'pearl'),                                                   // the side knob
                    _e(4.4, 7.6, 0.5, 0.6, '#ff2448'), _e(5.7, 6.3, 0.5, 2.6, '#ff2448'),        // the cross emblem
                    _r(14.6, 18.6, 0.5, 5, 'abyss', 0.4), ..._slots(15.2, 18, 0.5, '#ff2448'),   // the two slotted collars
                    _r(19.2, 23.2, 0.5, 5, 'abyss', 0.4), ..._slots(19.8, 22.6, 0.5, '#ff2448'),
                    _r(23.2, 55.2, 0.5, 5, 'abyss', [0.4, 1.2, 1.2, 0.4]),                      // the long smooth barrel, the same width to the muzzle
                    _e(25, 50, -0.7, 0.35, '#ff2448'), _e(25, 50, 1.7, 0.35, '#ff2448'),         // two hairlines of red down it, under glass
                    _g(24.6, 50.4, 0.5, 3.6),
                    _hole(51.6, 0.5, 0.9),                                                      // its bore hole
                    _r(53.6, 55.2, 0.5, 5, 'crimson', [0.4, 1.2, 1.2, 0.4])                     // the crimson muzzle band
                ],
                glow: [[6, 0.5, 3.2, '#ff2448'], [16.6, 0.5, 3, '#ff2448'], [21.2, 0.5, 3, '#ff2448'], [54.4, 0.5, 2.4, '#ff2448']],
                run: [25, 50, 1.7, '#ff9aae']
            },
            golden_child: {                                                                     // gold and champagne, a light in its heart
                stance: 'pistol', muzzle: [20, 1], rail: [13, 5.8], brass: null, fx: { trail: 'wisp', col: '#f3e4c6', dust: '#ffd76a' }, 
                parts: [
                    _cap(-3.6, 14, 1, 8.4, 'gold'),
                    _e(-1.6, 12, 1, 0.5, '#ffe7a0'), _g(-2, 12.4, 1, 2),
                    _cap(3.8, 7.4, 1, 9.6, 'champagne'),                                        // the ring band
                    _ce(5.6, 1, 1.7, '#fff1c4'),                                                // the core
                    _c(16.6, 1, 3.3, 'champagne'), _ce(17.6, 1, 1.35, '#ffd76a')                // the front orb and its bore
                ],
                glow: [[5.6, 1, 4.2, '#ffd76a'], [17.6, 1, 3.6, '#ffe7a0']],
                run: [-1.6, 12, 1, '#fffaea']
            },
            maiden_kukri: {                                                                     // the Maiden's Kukri: a curved golden blade, a dark grip, a ring pommel
                stance: 'knife', muzzle: [19, 1.6], rail: [8, 0], brass: null, melee: true,
                parts: [
                    _c(-5.2, 0, 1.9, 'gold'), _hole(-5.2, 0, 0.85),                             // the ring pommel
                    _r(-4, 3, 0, 2.6, 'abyss', 1.1),                                            // the grip, wrapped dark
                    _r(-2.6, -2, 0, 2.8, 'gold', 0.3), _r(0.4, 1, 0, 2.8, 'gold', 0.3),         // gold bands on it
                    _r(3, 4.2, 0, 4.6, 'gold', 0.5),                                            // the guard
                    { poly: [[4, -1.3], [8.5, -1.7], [12.5, -1.3], [16, -0.2], [18.6, 1.4], [19.4, 2.6], [17.2, 2.6], [13.6, 2.1], [9.4, 1.6], [4, 1.1]], m: 'gold' },   // the forward-curved blade
                    { poly: [[5, 0.4], [9.5, 0.9], [13.8, 1.4], [17.4, 2.2], [13.6, 1.8], [9.4, 1.3], [5, 0.9]], m: 'champagne' },   // its bright edge
                    _ce(3.6, 0, 0.6, '#ffe7a0')                                                 // a gem in the guard
                ],
                glow: [[3.6, 0, 1.6, '#ffd76a'], [18, 2, 1.4, '#fff1c4']],
                run: [5, 18, 1.4, '#fffaea']                                                    // the glint along the edge
            },
            empg: {                                                                             // the EMP blaster (catalog): a bulbous body, twin orbs at the front
                stance: 'pistol', muzzle: [14.6, 1], rail: [9, 5.4], brass: null, fx: { trail: 'static', col: '#b48cff', core: '#efe4ff' }, 
                parts: [
                    _c(-2, 1, 2.4, 'abyss'),
                    _cap(-1.2, 12.4, 1, 7.4, 'violet'),
                    _ce(1, 1, 0.75, '#c9a6ff'),                                                 // the port
                    _e(3.6, 10, 1, 0.5, '#b48cff'), _g(3.2, 10.4, 1, 2.2),
                    _c(12.6, -1.5, 1.6, 'pearl'), _ce(13, -1.5, 0.7, '#dcc6ff'),                 // the twin orbs
                    _c(12.6, 3.5, 1.6, 'pearl'), _ce(13, 3.5, 0.7, '#dcc6ff')
                ],
                glow: [[1, 1, 2, '#c9a6ff'], [13, -1.5, 2.8, '#b48cff'], [13, 3.5, 2.8, '#b48cff']],
                run: [3.6, 10, 1, '#efe4ff']
            }
        };
        const LASER_MODULE = [                                                                  // under-barrel laser: body, then emitter at its front
            { rr: [-5.5, -0.9, 5.5, 1.9, 0.3], m: 'abyss' }, { rr: [-0.9, -0.5, 0.9, 1.1, 0.2], c: '#ff2a3a', emit: true }
        ];

        /** The model for a weapon id: its own, else the closest by name, else the FP-X — never nothing. */
        function weaponModel(id) {
            id = id || '';
            return WEAPON_MODELS[id] || (id.includes('sniper') ? WEAPON_MODELS.sniper_sara : id.includes('rifle') ? WEAPON_MODELS.rifle_rb98
                : id.includes('kukri') ? WEAPON_MODELS.maiden_kukri : id.includes('golden') ? WEAPON_MODELS.golden_child : id.includes('emp') ? WEAPON_MODELS.empg : id.includes('anavia') ? WEAPON_MODELS.pistol_anavia : WEAPON_MODELS.pistol_fpx);
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

        /** 'r, g, b' of a mix of two '#rrggbb' colours. */
        function _gunMix(a, b, t) {
            const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), m = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
            return `rgb(${m(16)}, ${m(8)}, ${m(0)})`;
        }

        /**
         * Paint one part as angular metallic glass: a slab or capsule gets hard facets across its width
         * (a bright bevel, the body, a darker lower facet, the dark edge) and slanted glass glints; a
         * knob is a faceted gem split on the diagonal; a glass sleeve is a clear tinted pane with a
         * bright edge; bores and lights are plain colour (lights with a baked halo).
         */
        function _paintGunPart(c, p) {
            const [x0, y0, x1, y1] = _gunPartBox(p), path = _gunPartPath(p);
            if (p.glass) {
                c.fillStyle = 'rgba(226, 218, 255, 0.16)'; c.fill(path);
                c.save(); c.clip(path);
                c.strokeStyle = 'rgba(255, 255, 255, 0.55)'; c.lineWidth = 0.22;
                c.beginPath(); c.moveTo(x0, y0 + 0.2); c.lineTo(x1, y0 + 0.2); c.stroke();
                _gunGlints(c, x0, y0, x1, y1, 0.3);
                c.restore(); return;
            }
            if (!p.m) {
                c.fillStyle = p.c;
                if (p.emit) { c.save(); c.shadowColor = p.c; c.shadowBlur = 2.2 * WEAPON_BAKE; c.fill(path); c.fill(path); c.restore(); }
                c.fill(path); return;
            }
            const M = GUN_MATERIALS[p.m], E = _gunMix(M[1], M[0], 0.4);                   // the edge: a deep shade of its own colour
            if (p.dot) {                                                                        // a faceted gem: lit half, shaded half, a glint
                const [x, y, r] = p.dot, g = c.createLinearGradient(x - r, y - r, x + r, y + r);
                g.addColorStop(0, M[2]); g.addColorStop(0.46, _gunMix(M[2], M[0], 0.55)); g.addColorStop(0.46, M[0]);
                g.addColorStop(0.8, _gunMix(M[0], M[1], 0.5)); g.addColorStop(1, E);
                c.fillStyle = g; c.fill(path);
                c.fillStyle = 'rgba(255, 255, 255, 0.7)';
                c.beginPath(); c.moveTo(x - r * 0.55, y - r * 0.2); c.lineTo(x - r * 0.2, y - r * 0.55); c.lineTo(x - r * 0.05, y - r * 0.4); c.lineTo(x - r * 0.4, y - r * 0.05); c.closePath(); c.fill();
                return;
            }
            const g = c.createLinearGradient(0, y0, 0, y1);                                     // hard facets across the width
            g.addColorStop(0, E); g.addColorStop(0.08, E);
            g.addColorStop(0.08, M[2]); g.addColorStop(0.26, _gunMix(M[2], M[0], 0.5));
            g.addColorStop(0.26, M[0]); g.addColorStop(0.6, M[0]);
            g.addColorStop(0.6, _gunMix(M[0], M[1], 0.45)); g.addColorStop(0.9, _gunMix(M[0], M[1], 0.6));
            g.addColorStop(0.9, E); g.addColorStop(1, E);
            c.fillStyle = g; c.fill(path);
            if (x1 - x0 > 3 && y1 - y0 > 1.6) { c.save(); c.clip(path); _gunGlints(c, x0, y0, x1, y1, 0.2); c.restore(); }
        }
        /** Slanted glass glints across a part (clipped by the caller): a broad one and a thin one. */
        function _gunGlints(c, x0, y0, x1, y1, a) {
            const h = y1 - y0, L = x1 - x0, sk = h * 0.7;
            for (const [f, w, k] of [[0.3, Math.min(1.6, L * 0.08), 1], [0.3, 0.35, 0.8], [0.72, 0.5, 0.6]]) {
                const sx = x0 + L * f + (k === 0.8 ? Math.min(1.6, L * 0.08) + 0.5 : 0);
                c.fillStyle = `rgba(255, 255, 255, ${a * k})`;
                c.beginPath(); c.moveTo(sx + sk, y0); c.lineTo(sx + sk + w, y0); c.lineTo(sx + w, y1); c.lineTo(sx, y1); c.closePath(); c.fill();
            }
        }

        /**
         * The baked sprite of a model (with an under-barrel laser when `laser`): drawn at 1/WEAPON_BAKE
         * scale with its top-left at (x, y) in the gun's frame. No ink outline: like the characters, a
         * gun's edges are shades of its own colours, so it sits in the same vivid world.
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
            for (const p of parts) _paintGunPart(c, p);
            const out = { cv, x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
            cache[laser ? 1 : 0] = out; _weaponSprites.set(key, cache);
            return out;
        }
