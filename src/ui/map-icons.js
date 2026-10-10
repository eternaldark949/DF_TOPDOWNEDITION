        /* =====================================================================
           MAP ICONS & MAP ART — one icon set and one city look for the golden map
           (ui/ui-system.js) and the phone's map (ui/phone.js).
             MapIcons.draw(ctx, kind, x, y, opts)   a crisp icon at a FIXED size in CSS px
                 (never the window width, never the map zoom; a gentle zoomK if asked),
                 painted once per kind/size/dpr into a sprite and stamped after. Paths
                 only — no emoji or text glyphs (Safari's colour-emoji fallback at big
                 sizes with shadows was the scrapyard crash suspect).
             MapArt.paintCity(ctx, map, opts)       the city of light: gold on deep violet —
                 roads glowing like molten gold, pavements and crosswalks in faint gold,
                 lamps as warm specks, violet blocks and buildings rimmed in gold, parks as
                 deeper violet with a cobbled grain. Draws in map units on a ctx already
                 transformed; opts.px = device px per map unit (keeps hairlines hairline).
           ===================================================================== */
        const MAP_PAL = {
            base: '#0b0614', ground: '#120a24', block: '#170d2e', building: '#1e1138', park: '#0f0820',
            rim: 'rgba(255, 200, 110, 0.32)', pave: 'rgba(255, 176, 80, 0.10)', cross: 'rgba(255, 222, 160, 0.30)',
            gold: '#ffcf6a', goldHot: '#fff3cf', violet: '#8b5cf6', lavender: '#d9ccff', crimson: '#b0103a'
        };

        const MapIcons = {
            // Fixed sizes in CSS px (the whole set in one place)
            SIZE: { player: 22, car: 20, pin: 30, amberPin: 30, goldPin: 30, badge: 20, amberBadge: 20, crimsonBadge: 20, objective: 30, danger: 30, dest: 30, transition: 15, client: 11, search: 14 },
            // Pin and badge colours: crimson (hers, the map's places), amber (Amber's van, the package), gold (the job)
            TINT: {
                crimson: { top: '#d0204e', tip: '#5e0418', rim: '#d0204e', glow: '224, 40, 90', glyph: '#ffd6e0' },
                amber: { top: '#f2a03a', tip: '#6e3304', rim: '#f2a03a', glow: '255, 159, 67', glyph: '#ffe2b8' },
                gold: { top: '#ffd76a', tip: '#7a4e0c', rim: '#ffd76a', glow: '255, 205, 100', glyph: '#fff3cf' }
            },
            /** A gentle response to zoom (icons grow a little as you zoom in), never to the screen. */
            zoomK(zoom) { return Math.max(0.9, Math.min(1.2, 0.86 + 0.08 * zoom)); },
            _cache: new Map(),

            /** The sprite for kind at a CSS size and pixel ratio: { cv, ax, ay } (anchor in sprite px). */
            sprite(kind, css, dpr) {
                const key = kind + '|' + Math.round(css * 4) + '|' + dpr;
                let s = this._cache.get(key);
                if (s) return s;
                const S = Math.max(4, Math.round(css * dpr)), pad = Math.ceil(S * 0.45), W = S + pad * 2;
                const cv = document.createElement('canvas'); cv.width = cv.height = W;
                const c = cv.getContext('2d');
                c.translate(pad, pad);
                const [base, glyph] = kind.split(':');
                const ay = (this._paint[base] || this._paint.client).call(this, c, S, glyph) ?? 0.5;   // painters return the anchor's y (0..1 of S)
                s = { cv, ax: pad + S / 2, ay: pad + S * ay, W };
                this._cache.set(key, s);
                return s;
            },

            /** Stamp kind centred (or anchored: pins at their tip) at device-px x, y. opts: { css, dpr, rot, alpha, scale } */
            draw(ctx, kind, x, y, opts = {}) {
                const dpr = opts.dpr || 1, base = kind.split(':')[0];
                const css = (opts.css || this.SIZE[base] || 16);
                const s = this.sprite(kind, css, dpr), k = opts.scale || 1;
                const a0 = ctx.globalAlpha;
                if (opts.alpha !== undefined) ctx.globalAlpha = a0 * opts.alpha;
                if (opts.rot) {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(opts.rot); ctx.scale(k, k);
                    ctx.drawImage(s.cv, -s.ax, -s.ay); ctx.restore();
                } else ctx.drawImage(s.cv, x - s.ax * k, y - s.ay * k, s.W * k, s.W * k);
                ctx.globalAlpha = a0;
            },

            // ── Painters: each draws inside an S×S box (0..S), soft glows baked in (once), returns the anchor y ──
            _glow(c, x, y, r, rgb, a) {
                const g = c.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(${rgb}, ${a})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
                c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
            },
            _paint: {
                /** A crimson teardrop pin: dark centre, dotted white ring, violet underglow, a lavender glyph. Anchored at its tip.
                 *  `amberPin:<glyph>` and `goldPin:<glyph>` are the same in amber (Amber's van, the package) and gold (the job). */
                pin(c, S, glyph, tint = MapIcons.TINT.crimson) {
                    const cx = S / 2, r = S * 0.3, cy = S * 0.36, tip = S * 0.98;
                    this._glow(c, cx, tip - S * 0.06, S * 0.42, '139, 92, 246', 0.55);
                    c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.82, Math.PI * 0.18); c.lineTo(cx, tip); c.closePath();
                    const g = c.createLinearGradient(0, cy - r, 0, tip);
                    g.addColorStop(0, tint.top); g.addColorStop(1, tint.tip);
                    c.fillStyle = g; c.fill();
                    c.strokeStyle = 'rgba(255, 210, 220, 0.55)'; c.lineWidth = Math.max(1, S * 0.03); c.stroke();
                    c.fillStyle = '#12061c'; c.beginPath(); c.arc(cx, cy, r * 0.62, 0, Math.PI * 2); c.fill();
                    c.save(); c.setLineDash([Math.max(1, S * 0.035), Math.max(1, S * 0.035)]);
                    c.strokeStyle = 'rgba(255, 255, 255, 0.85)'; c.lineWidth = Math.max(1, S * 0.03);
                    c.beginPath(); c.arc(cx, cy, r * 0.8, 0, Math.PI * 2); c.stroke(); c.restore();
                    MapIcons._glyph(c, glyph || 'dot', cx, cy, r * 0.42);
                    return 0.98;
                },
                /** You: a violet triangle with a lavender rim and a soft glow, pointing +x. */
                player(c, S) {
                    const cx = S / 2, cy = S / 2;
                    this._glow(c, cx, cy, S * 0.62, '139, 92, 246', 0.6);
                    c.beginPath(); c.moveTo(cx + S * 0.46, cy); c.lineTo(cx - S * 0.34, cy - S * 0.36); c.lineTo(cx - S * 0.18, cy); c.lineTo(cx - S * 0.34, cy + S * 0.36); c.closePath();
                    const g = c.createLinearGradient(cx - S * 0.3, cy - S * 0.3, cx + S * 0.4, cy + S * 0.3);
                    g.addColorStop(0, '#b79bff'); g.addColorStop(1, '#6d3fe0');
                    c.fillStyle = g; c.fill();
                    c.strokeStyle = '#efe6ff'; c.lineWidth = Math.max(1, S * 0.06); c.lineJoin = 'round'; c.stroke();
                },
                /** Your car: a crimson capsule with gold headlights, pointing +x. `car:amber` is Amber's delivery van. */
                car(c, S, glyph) {
                    const cx = S / 2, cy = S / 2, L = S * 0.86, Wd = S * 0.44, amber = glyph === 'amber';
                    this._glow(c, cx, cy, S * 0.6, amber ? '255, 159, 67' : '224, 40, 90', 0.4);
                    c.beginPath(); c.roundRect(cx - L / 2, cy - Wd / 2, L, Wd, Wd * 0.4);
                    c.fillStyle = amber ? '#d9821f' : '#c0143e'; c.fill();
                    c.strokeStyle = 'rgba(255, 220, 230, 0.7)'; c.lineWidth = Math.max(1, S * 0.05); c.stroke();
                    c.fillStyle = 'rgba(20, 6, 30, 0.75)'; c.fillRect(cx - L * 0.05, cy - Wd * 0.32, L * 0.26, Wd * 0.64);
                    c.fillStyle = '#ffd76a';
                    c.fillRect(cx + L / 2 - S * 0.07, cy - Wd / 2 + S * 0.03, S * 0.06, S * 0.1);
                    c.fillRect(cx + L / 2 - S * 0.07, cy + Wd / 2 - S * 0.13, S * 0.06, S * 0.1);
                },
                /** The objective: a gold ring, a four-point star inside. */
                objective(c, S) {
                    const cx = S / 2, cy = S / 2;
                    this._glow(c, cx, cy, S * 0.6, '255, 205, 100', 0.55);
                    c.strokeStyle = '#ffd76a'; c.lineWidth = Math.max(1.5, S * 0.07);
                    c.beginPath(); c.arc(cx, cy, S * 0.36, 0, Math.PI * 2); c.stroke();
                    c.strokeStyle = 'rgba(255, 243, 207, 0.6)'; c.lineWidth = Math.max(1, S * 0.025);
                    c.beginPath(); c.arc(cx, cy, S * 0.44, 0, Math.PI * 2); c.stroke();
                    MapIcons._star(c, cx, cy, S * 0.22, '#fff3cf');
                },
                /** Danger (the scrapyard): a crimson hazard chevron with a gold rim and a gold bar-and-dot. */
                danger(c, S) {
                    const cx = S / 2;
                    this._glow(c, cx, S * 0.58, S * 0.6, '255, 40, 40', 0.45);
                    c.beginPath(); c.moveTo(cx, S * 0.08); c.lineTo(S * 0.94, S * 0.88); c.lineTo(S * 0.06, S * 0.88); c.closePath();
                    const g = c.createLinearGradient(0, S * 0.08, 0, S * 0.88);
                    g.addColorStop(0, '#e0203a'); g.addColorStop(1, '#6a0414');
                    c.fillStyle = g; c.fill();
                    c.strokeStyle = '#ffcf6a'; c.lineWidth = Math.max(1.2, S * 0.06); c.lineJoin = 'round'; c.stroke();
                    c.fillStyle = '#ffe9b0';
                    c.beginPath(); c.roundRect(cx - S * 0.05, S * 0.34, S * 0.1, S * 0.3, S * 0.04); c.fill();
                    c.beginPath(); c.arc(cx, S * 0.74, S * 0.055, 0, Math.PI * 2); c.fill();
                    return 0.55;
                },
                /** A door or way through: a lavender portal ring with a bright centre. */
                transition(c, S) {
                    const cx = S / 2, cy = S / 2;
                    this._glow(c, cx, cy, S * 0.6, '180, 150, 255', 0.5);
                    c.strokeStyle = '#d9ccff'; c.lineWidth = Math.max(1.2, S * 0.12);
                    c.beginPath(); c.arc(cx, cy, S * 0.34, 0, Math.PI * 2); c.stroke();
                    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, S * 0.12, 0, Math.PI * 2); c.fill();
                },
                /** A person of interest: a gold bead in a violet ring. */
                client(c, S) {
                    const cx = S / 2, cy = S / 2;
                    this._glow(c, cx, cy, S * 0.62, '255, 205, 100', 0.5);
                    c.fillStyle = '#5b2bc4'; c.beginPath(); c.arc(cx, cy, S * 0.42, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#ffd76a'; c.beginPath(); c.arc(cx, cy, S * 0.27, 0, Math.PI * 2); c.fill();
                },
                /** A magnifier (the zoom readout). */
                search(c, S) {
                    c.strokeStyle = '#d9ccff'; c.lineWidth = Math.max(1.2, S * 0.12); c.lineCap = 'round';
                    c.beginPath(); c.arc(S * 0.42, S * 0.42, S * 0.26, 0, Math.PI * 2); c.stroke();
                    c.beginPath(); c.moveTo(S * 0.62, S * 0.62); c.lineTo(S * 0.9, S * 0.9); c.stroke();
                },
                amberPin(c, S, glyph) { return MapIcons._paint.pin.call(this, c, S, glyph, MapIcons.TINT.amber); },
                goldPin(c, S, glyph) { return MapIcons._paint.pin.call(this, c, S, glyph, MapIcons.TINT.gold); },
                /** A round badge for the compass round her: a dark disc in a coloured rim, the glyph in the rim's light.
                 *  `badge:<glyph>` gold (the job), `amberBadge:` (the package), `crimsonBadge:` (her car). */
                badge(c, S, glyph, tint = MapIcons.TINT.gold) {
                    const cx = S / 2, cy = S / 2, r = S * 0.4;
                    this._glow(c, cx, cy, S * 0.62, tint.glow, 0.5);
                    c.fillStyle = '#12061c'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = tint.rim; c.lineWidth = Math.max(1.2, S * 0.09); c.stroke();
                    MapIcons._glyph(c, glyph || 'dot', cx, cy, r * 0.56, tint.glyph);
                },
                amberBadge(c, S, glyph) { return MapIcons._paint.badge.call(this, c, S, glyph, MapIcons.TINT.amber); },
                crimsonBadge(c, S, glyph) { return MapIcons._paint.badge.call(this, c, S, glyph, MapIcons.TINT.crimson); },
                dest(c, S) { return MapIcons._paint.pin.call(this, c, S, 'flag'); }
            },
            /** A four-point star. */
            _star(c, x, y, r, fill) {
                c.fillStyle = fill; c.beginPath();
                for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.36 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
                c.closePath(); c.fill();
            },
            /** The small glyphs inside pins and badges (all paths), lavender unless told otherwise. */
            _glyph(c, g, x, y, r, L = '#e6dcff') {
                c.save(); c.fillStyle = L; c.strokeStyle = L; c.lineWidth = Math.max(1, r * 0.28); c.lineCap = 'round'; c.lineJoin = 'round';
                switch (g) {
                    case 'home': c.beginPath(); c.moveTo(x - r, y); c.lineTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x + r * 0.7, y); c.lineTo(x + r * 0.7, y + r * 0.85); c.lineTo(x - r * 0.7, y + r * 0.85); c.lineTo(x - r * 0.7, y); c.closePath(); c.fill(); break;
                    case 'cross': c.fillRect(x - r * 0.28, y - r, r * 0.56, r * 2); c.fillRect(x - r, y - r * 0.28, r * 2, r * 0.56); break;
                    case 'cup': c.beginPath(); c.moveTo(x - r * 0.8, y - r * 0.6); c.lineTo(x + r * 0.5, y - r * 0.6); c.lineTo(x + r * 0.3, y + r * 0.8); c.lineTo(x - r * 0.6, y + r * 0.8); c.closePath(); c.fill(); c.beginPath(); c.arc(x + r * 0.55, y, r * 0.38, -Math.PI / 2, Math.PI / 2); c.stroke(); break;
                    case 'wrench': c.beginPath(); c.moveTo(x - r * 0.75, y + r * 0.75); c.lineTo(x + r * 0.35, y - r * 0.35); c.stroke(); c.beginPath(); c.arc(x + r * 0.5, y - r * 0.5, r * 0.42, 0, Math.PI * 2); c.stroke(); break;
                    case 'coin': c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.75, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.75, y); c.closePath(); c.fill(); break;
                    case 'star': MapIcons._star(c, x, y, r * 1.1, L); break;
                    case 'flag': c.fillRect(x - r * 0.55, y - r, r * 0.22, r * 2); c.beginPath(); c.moveTo(x - r * 0.33, y - r); c.lineTo(x + r * 0.9, y - r * 0.55); c.lineTo(x - r * 0.33, y - r * 0.1); c.closePath(); c.fillStyle = '#ffd76a'; c.fill(); break;
                    case 'sparkle': MapIcons._star(c, x, y, r * 1.1, '#ffd76a'); break;
                    case 'person': c.beginPath(); c.arc(x, y - r * 0.45, r * 0.42, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(x, y + r * 0.55, r * 0.75, r * 0.45, 0, Math.PI, 0); c.fill(); break;
                    case 'car': c.beginPath(); c.roundRect(x - r, y - r * 0.5, r * 2, r, r * 0.4); c.fill(); c.fillStyle = '#12061c'; c.fillRect(x - r * 0.05, y - r * 0.32, r * 0.5, r * 0.64); c.fillStyle = '#ffd76a'; c.fillRect(x + r * 0.8, y - r * 0.42, r * 0.18, r * 0.24); c.fillRect(x + r * 0.8, y + r * 0.18, r * 0.18, r * 0.24); break;
                    case 'target': c.beginPath(); c.arc(x, y, r * 0.72, 0, Math.PI * 2); c.stroke(); for (const [a, b] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { c.beginPath(); c.moveTo(x + a * r * 0.45, y + b * r * 0.45); c.lineTo(x + a * r * 1.1, y + b * r * 1.1); c.stroke(); } c.beginPath(); c.arc(x, y, r * 0.18, 0, Math.PI * 2); c.fill(); break;
                    case 'box': c.fillRect(x - r * 0.85, y - r * 0.75, r * 1.7, r * 1.5); c.fillStyle = '#ffd76a'; c.fillRect(x - r * 0.14, y - r * 0.75, r * 0.28, r * 1.5); c.fillRect(x - r * 0.85, y - r * 0.12, r * 1.7, r * 0.24); break;
                    default: c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill();
                }
                c.restore();
            }
        };

        const MapArt = {
            _grain: null,
            /** A tiny cobbled-grain tile (parks and open ground). */
            grain() {
                if (this._grain) return this._grain;
                const cv = document.createElement('canvas'); cv.width = cv.height = 40;
                const c = cv.getContext('2d'), rnd = seededRandom(949);
                for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '139, 92, 246' : '255, 190, 110'}, ${0.05 + rnd() * 0.08})`; c.beginPath(); c.arc(rnd() * 40, rnd() * 40, 1.2 + rnd() * 2.6, 0, Math.PI * 2); c.fill(); }
                return (this._grain = cv);
            },

            /**
             * The city of light in map units. opts: { px (device px per map unit), bounds {x,y,w,h} to cull to,
             * network (roads), lamps, glow (true: the soft gold bloom pass, golden map only) }.
             */
            paintCity(ctx, map, opts) {
                const px = opts.px, u = 1 / px, B = opts.bounds || { x: 0, y: 0, w: map.width, h: map.height }, P = 160;
                const hit = (x, y, w, h) => x + w + P >= B.x && x - P <= B.x + B.w && y + h + P >= B.y && y - P <= B.y + B.h;
                ctx.fillStyle = MAP_PAL.ground; ctx.fillRect(0, 0, map.width, map.height);
                // Blocks, parks and zones
                const blocks = map.cityLayout && map.cityLayout.blocks;
                if (blocks) { ctx.fillStyle = MAP_PAL.block; for (const k of blocks) if (hit(k.x, k.y, k.w, k.h)) ctx.fillRect(k.x, k.y, k.w, k.h); }
                if (map.floorZones && map.floorZones.length) {
                    let pat = null; try { pat = ctx.createPattern(this.grain(), 'repeat'); if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scaleSelf(u * (opts.dpr || 1))); } catch (e) { pat = null; }
                    for (const z of map.floorZones) {
                        if (!hit(z.x, z.y, z.w, z.h)) continue;
                        ctx.fillStyle = MAP_PAL.park; ctx.fillRect(z.x, z.y, z.w, z.h);
                        if (pat) { ctx.fillStyle = pat; ctx.fillRect(z.x, z.y, z.w, z.h); }
                    }
                }
                // Pavements and crosswalks: faint gold
                if (map.pavements) { ctx.fillStyle = MAP_PAL.pave; for (const p of map.pavements) if (hit(p.x, p.y, p.w, p.h)) { if (p.poly) { ctx.beginPath(); Poly.trace(ctx, p.poly); ctx.fill(); } else ctx.fillRect(p.x, p.y, p.w, p.h); } }
                // Buildings and walls: violet, rimmed in gold
                const solids = (map.buildings || []).concat(map.walls || []);
                ctx.fillStyle = MAP_PAL.building; ctx.beginPath();
                for (const b of solids) if (hit(b.x, b.y, b.w, b.h)) ctx.rect(b.x, b.y, b.w, b.h);
                ctx.fill();
                ctx.strokeStyle = MAP_PAL.rim; ctx.lineWidth = 1.2 * u * (opts.dpr || 1); ctx.stroke();
                // Roads: molten gold — a wide amber halo, a warm body, a gold core, a white-gold hairline
                const roads = (opts.network && opts.network.roads || []).filter(r => hit(r.x, r.y, r.w, r.h));
                const stroke = (wid, style, op) => { ctx.globalCompositeOperation = op || 'lighter'; ctx.strokeStyle = style; ctx.lineWidth = wid; ctx.beginPath(); for (const r of roads) { if (r.path) r.path.points.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); else { ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); } } ctx.stroke(); };
                ctx.lineCap = 'round';
                const T = roads.length ? Math.max(...roads.map(r => r.thickness || 200)) : 200;
                stroke(T * 1.5, 'rgba(255, 140, 40, 0.07)');
                stroke(T * 0.85, 'rgba(255, 160, 60, 0.14)');
                stroke(Math.max(T * 0.22, 2.5 * u), 'rgba(255, 207, 106, 0.75)');
                stroke(Math.max(T * 0.05, 1.2 * u * (opts.dpr || 1)), 'rgba(255, 243, 207, 0.95)');
                if (map.crosswalks) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = MAP_PAL.cross; for (const k of map.crosswalks) if (hit(k.x, k.y, k.w, k.h)) { if (k.poly) { ctx.beginPath(); Poly.trace(ctx, k.poly); ctx.fill(); } else ctx.fillRect(k.x, k.y, k.w, k.h); } }
                // Lamps: warm specks of light; glowing trees: violet motes
                if (opts.lamps && opts.lamps.length && typeof glowSprite === 'function') {
                    const spr = glowSprite('255, 200, 110', 0.2), R = Math.max(14, Math.min(6 * u * (opts.dpr || 1), 46));   // specks when zoomed out (capped in map units, so they never pile into white)
                    ctx.globalAlpha = 0.32;
                    for (const l of opts.lamps) if (!l.candle && hit(l.x, l.y, 0, 0)) ctx.drawImage(spr, l.x - R, l.y - R, R * 2, R * 2);
                    ctx.globalAlpha = 1;
                }
                if (map.foliage && typeof glowSprite === 'function') {
                    const spr = glowSprite('168, 85, 247', 0.3), R = Math.max(10, Math.min(5 * u * (opts.dpr || 1), 36));
                    ctx.globalAlpha = 0.35;
                    for (const f of map.foliage) if (f.isGlowing && hit(f.x, f.y, 0, 0)) ctx.drawImage(spr, f.x - R, f.y - R, R * 2, R * 2);
                    ctx.globalAlpha = 1;
                }
                ctx.globalCompositeOperation = 'source-over';
            },

            /** The soft gold bloom over a finished cache (device px, identity transform): light pools where streets crowd. */
            bloom(cv) {
                const w = Math.max(1, cv.width >> 2), h = Math.max(1, cv.height >> 2);
                const t = this._bloomCv || (this._bloomCv = document.createElement('canvas'));
                t.width = w; t.height = h;
                const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true; tc.drawImage(cv, 0, 0, w, h);
                const c = cv.getContext('2d');
                c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.4; c.imageSmoothingEnabled = true;
                c.drawImage(t, 0, 0, cv.width, cv.height);
                c.restore();
            }
        };
