        // Appearance definitions are authored once in Directory. Canvas remains the classic backend.
        const {GUN_MATERIALS,WEAPON_MODELS,LASER_MODULE,weaponModel}=DFNative;

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
            const K = WEAPON_BAKE, cv = canvasKit.createLayer([Math.ceil((bx1 - bx0) * K), Math.ceil((by1 - by0) * K)]).canvas;
            const c = cv.getContext('2d');
            c.scale(K, K); c.translate(-bx0, -by0); c.lineJoin = 'round';
            for (const p of parts) _paintGunPart(c, p);
            const out = { cv, x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
            cache[laser ? 1 : 0] = out; _weaponSprites.set(key, cache);
            return out;
        }
