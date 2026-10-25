        /* =====================================================================
           MAP ICONS & MAP ART — one icon set and one city look for the golden map
           (ui/ui-system.js) and the phone's map (ui/phone.js).
             MapIcons.draw(ctx, kind, x, y, opts)   a crisp icon at a FIXED size in CSS px
             MapIcons.drawMagic(ctx, kind, x, y, opts)  the same, alive: aura, orbiting motes, sparks (golden map)
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
        // The map's palettes. `vibrant` (deep amber-gold on deep violet) is live; `classic` is the original
        // paler cream-gold look, kept on standby for a setting: MapArt.setPalette('classic') switches over.
        // roads: [halo, body, core, hairline]; route: [outer glow, middle] of the nav line (ui-system.js).
        const MAP_PALETTES = {
            vibrant: {
                base: '#0a0414', ground: '#100420', block: '#160530', building: '#1f0846', park: '#0d031e',
                rim: 'rgba(255, 170, 50, 0.36)', pave: 'rgba(255, 145, 30, 0.12)', cross: 'rgba(255, 196, 90, 0.32)',
                gold: '#ffbf3a', goldHot: '#ffe2a0', violet: '#7c3aed', lavender: '#d9ccff', crimson: '#b0103a',
                roads: ['rgba(255, 110, 0, 0.09)', 'rgba(255, 135, 10, 0.18)', 'rgba(255, 158, 18, 0.85)', 'rgba(255, 206, 110, 0.85)'],
                lamp: '255, 165, 45', tree: '147, 51, 234', grain: ['124, 58, 237', '255, 160, 50'],
                you: { glow: '124, 58, 237', glowA: 0.7, top: '#a36dff', tip: '#5517d6' }, pinGlow: '124, 58, 237', clientRing: '#4c16b8',
                route: ['rgba(118, 28, 230, 0.34)', 'rgba(150, 70, 255, 0.78)']
            },
            classic: {
                base: '#0b0614', ground: '#120a24', block: '#170d2e', building: '#1e1138', park: '#0f0820',
                rim: 'rgba(255, 200, 110, 0.32)', pave: 'rgba(255, 176, 80, 0.10)', cross: 'rgba(255, 222, 160, 0.30)',
                gold: '#ffcf6a', goldHot: '#fff3cf', violet: '#8b5cf6', lavender: '#d9ccff', crimson: '#b0103a',
                roads: ['rgba(255, 140, 40, 0.07)', 'rgba(255, 160, 60, 0.14)', 'rgba(255, 207, 106, 0.75)', 'rgba(255, 243, 207, 0.95)'],
                lamp: '255, 200, 110', tree: '168, 85, 247', grain: ['139, 92, 246', '255, 190, 110'],
                you: { glow: '139, 92, 246', glowA: 0.6, top: '#b79bff', tip: '#6d3fe0' }, pinGlow: '139, 92, 246', clientRing: '#5b2bc4',
                route: ['rgba(138, 43, 226, 0.28)', 'rgba(180, 100, 255, 0.7)']
            }
        };
        let MAP_PAL = MAP_PALETTES.vibrant;

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

            /**
             * The golden map's magic: the icon stamped as draw() does, wrapped in light that lives. Pins float and
             * breathe a violet aura from their tip, motes orbit and twinkle, and now and then a spark drifts up;
             * you send out a slow violet ripple. opts as draw(), plus t (seconds) and seed (a phase, from map coords,
             * so each place keeps its own rhythm). Only cached sprites and a few stamps per icon: cheap at 60fps.
             */
            drawMagic(ctx, kind, x, y, opts = {}) {
                const D = opts.dpr || 1, base = kind.split(':')[0], css = (opts.css || this.SIZE[base] || 16), t = opts.t || 0, sd = opts.seed || 0;
                const R = css * D, pin = base === 'pin' || base === 'amberPin' || base === 'goldPin' || base === 'dest', you = base === 'player';
                const gold = base === 'goldPin' || base === 'objective' || base === 'client', amber = base === 'amberPin';
                const hue = amber ? this.MAGIC.amber : gold ? this.MAGIC.gold : this.MAGIC.violet;
                const breath = 0.5 + 0.5 * Math.sin(t * 1.9 + sd), lift = pin ? (1.2 + 1.6 * Math.sin(t * 1.5 + sd)) * D : 0;
                const ax = x, ay = pin ? y - R * 0.06 : y;                     // the aura's centre: a pin's tip, else the icon's heart
                const a0 = ctx.globalAlpha, op = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                // The aura: a breathing pool of light
                const ar = R * (pin ? 1.0 : 1.1) * (0.85 + 0.3 * breath);
                ctx.globalAlpha = a0 * (0.4 + 0.4 * breath);
                ctx.drawImage(this._magicGlow(hue.glow), ax - ar, ay - ar, ar * 2, ar * 2);
                if (you) {                                                    // your ripple: a ring that widens and fades
                    const ph = (t * 0.55 + sd) % 1, rr = R * (0.45 + 1.2 * ph);
                    ctx.globalAlpha = a0 * 0.8 * (1 - ph) * (1 - ph);
                    ctx.strokeStyle = hue.ring; ctx.lineWidth = 1.4 * D;
                    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
                }
                // Orbiting motes, on a tilted ring round the base, twinkling as they pass
                const n = you ? 3 : pin ? 3 : 1, orb = R * (pin ? 0.5 : 0.7), spd = you ? 1.1 : 0.8;
                for (let i = 0; i < n; i++) {
                    const a = t * spd + sd * 3 + i * Math.PI * 2 / n, tw = 0.5 + 0.5 * Math.sin(t * 4.2 + i * 2.1 + sd * 5);
                    const mx = ax + Math.cos(a) * orb, my = ay + Math.sin(a) * orb * 0.42 - (pin ? R * 0.02 : 0);
                    const front = Math.sin(a) > 0, sz = D * (pin || you ? 4.2 : 3) * (0.55 + 0.45 * tw);
                    ctx.globalAlpha = a0 * (front ? 0.95 : 0.45) * (0.35 + 0.65 * tw);
                    ctx.drawImage(this._magicStar(i % 2 ? this.MAGIC.gold.mote : hue.mote), mx - sz, my - sz, sz * 2, sz * 2);
                }
                // A spark that drifts up and fades, once every few seconds per place
                if (pin || you || gold) {
                    const cyc = 2.2, ph = ((t + sd * 7) % cyc) / cyc;
                    if (ph < 0.6) {
                        const q = ph / 0.6, sx = ax + Math.sin(q * 6 + sd * 11) * R * 0.18, sy = ay - R * (pin ? 0.3 : 0.1) - q * R * 0.9, sz = D * 3.6 * (1 - q * 0.5);
                        ctx.globalAlpha = a0 * Math.sin(q * Math.PI) * 0.9;
                        ctx.drawImage(this._magicStar(this.MAGIC.gold.mote), sx - sz, sy - sz, sz * 2, sz * 2);
                    }
                }
                ctx.globalAlpha = a0; ctx.globalCompositeOperation = op;
                this.draw(ctx, kind, x, y - lift, opts);
                // A glint: a white-gold star that flares on the icon, briefly, every few seconds
                const gph = ((t * 0.3 + sd * 1.7) % 1);
                if (gph < 0.12 && (pin || gold || you)) {
                    const q = gph / 0.12, gz = R * 0.32 * Math.sin(q * Math.PI);
                    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a0 * 0.9;
                    ctx.drawImage(this._magicStar('255, 244, 214'), x + R * 0.16 - gz, y - lift - R * (pin ? 0.78 : 0.2) - gz, gz * 2, gz * 2);
                    ctx.globalAlpha = a0; ctx.globalCompositeOperation = op;
                }
            },
            MAGIC: {
                violet: { glow: '124, 58, 237', ring: 'rgba(168, 118, 255, 1)', mote: '196, 160, 255' },
                gold: { glow: '255, 170, 40', ring: 'rgba(255, 196, 90, 1)', mote: '255, 210, 120' },
                amber: { glow: '255, 130, 30', ring: 'rgba(255, 170, 70, 1)', mote: '255, 190, 110' }
            },
            _magicCache: new Map(),
            /** A soft round glow, white-hot at the heart (64 px, stretched as needed). */
            _magicGlow(rgb) {
                const key = 'g' + rgb; let cv = this._magicCache.get(key); if (cv) return cv;
                cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
                const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
                g.addColorStop(0, `rgba(${rgb}, 0.9)`); g.addColorStop(0.35, `rgba(${rgb}, 0.35)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
                c.fillStyle = g; c.fillRect(0, 0, 64, 64);
                this._magicCache.set(key, cv); return cv;
            },
            /** A twinkling mote: a four-point star in a small halo (32 px). */
            _magicStar(rgb) {
                const key = 's' + rgb; let cv = this._magicCache.get(key); if (cv) return cv;
                cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d');
                const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
                g.addColorStop(0, `rgba(${rgb}, 0.8)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
                c.fillStyle = g; c.fillRect(0, 0, 32, 32);
                this._star(c, 16, 16, 14, `rgba(${rgb}, 1)`); this._star(c, 16, 16, 6, 'rgba(255, 255, 255, 0.95)');
                this._magicCache.set(key, cv); return cv;
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
                    this._glow(c, cx, tip - S * 0.06, S * 0.42, MAP_PAL.pinGlow, 0.6);
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
                    this._glow(c, cx, cy, S * 0.62, MAP_PAL.you.glow, MAP_PAL.you.glowA);
                    c.beginPath(); c.moveTo(cx + S * 0.46, cy); c.lineTo(cx - S * 0.34, cy - S * 0.36); c.lineTo(cx - S * 0.18, cy); c.lineTo(cx - S * 0.34, cy + S * 0.36); c.closePath();
                    const g = c.createLinearGradient(cx - S * 0.3, cy - S * 0.3, cx + S * 0.4, cy + S * 0.3);
                    g.addColorStop(0, MAP_PAL.you.top); g.addColorStop(1, MAP_PAL.you.tip);
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
                    c.fillStyle = MAP_PAL.clientRing; c.beginPath(); c.arc(cx, cy, S * 0.42, 0, Math.PI * 2); c.fill();
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
            /** Switch the map's palette ('vibrant' | 'classic'): repaints the icon sprites and the grain next draw.
             *  The caller marks the golden map's city cache dirty (game.ui.isCacheDirty = true). */
            setPalette(name) {
                if (!MAP_PALETTES[name] || MAP_PAL === MAP_PALETTES[name]) return;
                MAP_PAL = MAP_PALETTES[name]; MapIcons._cache.clear(); this._grain = null;
            },
            /** A tiny cobbled-grain tile (parks and open ground). */
            grain() {
                if (this._grain) return this._grain;
                const cv = document.createElement('canvas'); cv.width = cv.height = 40;
                const c = cv.getContext('2d'), rnd = seededRandom(949);
                for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? MAP_PAL.grain[0] : MAP_PAL.grain[1]}, ${0.05 + rnd() * 0.08})`; c.beginPath(); c.arc(rnd() * 40, rnd() * 40, 1.2 + rnd() * 2.6, 0, Math.PI * 2); c.fill(); }
                return (this._grain = cv);
            },

            /**
             * The city of light in map units. opts: { px (device px per map unit), bounds {x,y,w,h} to cull to,
             * network (roads), lamps, glow (true: the soft gold bloom pass, golden map only) }.
             */
            paintCity(ctx, map, opts) {
                const px = opts.px, u = 1 / px, B = opts.bounds || { x: 0, y: 0, w: map.width, h: map.height }, P = 160;
                if (map.type === 'indoor') return this.paintInterior(ctx, map, opts);
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
                stroke(T * 1.5, MAP_PAL.roads[0]);
                stroke(T * 0.85, MAP_PAL.roads[1]);
                stroke(Math.max(T * 0.22, 2.5 * u), MAP_PAL.roads[2]);
                stroke(Math.max(T * 0.05, 1.2 * u * (opts.dpr || 1)), MAP_PAL.roads[3]);
                if (map.crosswalks) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = MAP_PAL.cross; for (const k of map.crosswalks) if (hit(k.x, k.y, k.w, k.h)) { if (k.poly) { ctx.beginPath(); Poly.trace(ctx, k.poly); ctx.fill(); } else ctx.fillRect(k.x, k.y, k.w, k.h); } }
                // Lamps: warm specks of light; glowing trees: violet motes
                if (opts.lamps && opts.lamps.length && typeof glowSprite === 'function') {
                    const spr = glowSprite(MAP_PAL.lamp, 0.2), R = Math.max(14, Math.min(6 * u * (opts.dpr || 1), 46));   // specks when zoomed out (capped in map units, so they never pile into white)
                    ctx.globalAlpha = 0.32;
                    for (const l of opts.lamps) if (!l.candle && hit(l.x, l.y, 0, 0)) ctx.drawImage(spr, l.x - R, l.y - R, R * 2, R * 2);
                    ctx.globalAlpha = 1;
                }
                if (map.foliage && typeof glowSprite === 'function') {
                    const spr = glowSprite(MAP_PAL.tree, 0.3), R = Math.max(10, Math.min(5 * u * (opts.dpr || 1), 36));
                    ctx.globalAlpha = 0.35;
                    for (const f of map.foliage) if (f.isGlowing && hit(f.x, f.y, 0, 0)) ctx.drawImage(spr, f.x - R, f.y - R, R * 2, R * 2);
                    ctx.globalAlpha = 1;
                }
                ctx.globalCompositeOperation = 'source-over';
            },

            /**
             * An interior as a glowing architect's plan (ETERNAL's ask: the indoor maps were bare walls on violet).
             * A faint plan grid with edge ticks; each floor zone tinted its own colour with a low-contrast texture
             * (carpet weave, tiles, marble); soft light pools; double-line walls with a glow and a dark core;
             * landmarks as small glowing diamonds named in Feminine; exits labelled in gold (the room's name is the
             * map screen's heading, ui-system.js renderMapHeading). Same opts as paintCity; sizes in CSS px via u (= 1 / px).
             */
            paintInterior(ctx, map, opts) {
                const u = 1 / opts.px, D = opts.dpr || 1, k = u * D, W = map.width, H = map.height;
                const rnd = seededRandom(String(map.id || 'room').split('').reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7));
                ctx.save();
                ctx.fillStyle = '#0b0416'; ctx.fillRect(0, 0, W, H);
                // Plan grid: fine every 50 units, stronger every 250
                ctx.lineWidth = 1 * k;
                for (const [step, a] of [[50, 0.035], [250, 0.075]]) {
                    ctx.strokeStyle = `rgba(217, 204, 255, ${a})`; ctx.beginPath();
                    for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
                    for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
                    ctx.stroke();
                }
                // Floor zones: their own colour, softly, with a texture that suits them
                const zones = map.zones || [];
                for (const z of zones) {
                    ctx.globalAlpha = 0.26; ctx.fillStyle = z.color || '#2a1840'; ctx.fillRect(z.x, z.y, z.w, z.h); ctx.globalAlpha = 1;
                    const light = /^#?[89a-f]/i.test((z.color || '').replace('#', '').slice(0, 1));
                    ctx.save(); ctx.beginPath(); ctx.rect(z.x, z.y, z.w, z.h); ctx.clip();
                    if (z.texture === 'carpet') {   // a woven dot grain
                        ctx.fillStyle = 'rgba(255, 190, 220, 0.06)';
                        for (let y = z.y + 6; y < z.y + z.h; y += 12) for (let x = z.x + ((y / 12) % 2 ? 6 : 0); x < z.x + z.w; x += 12) ctx.fillRect(x, y, 2.4, 2.4);
                    } else if (light) {             // pale floors read as marble: a few soft veins
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; ctx.lineWidth = 1.4 * k;
                        for (let i = 0; i < Math.max(2, z.w * z.h / 60000); i++) {
                            ctx.beginPath(); let x = z.x + rnd() * z.w, y = z.y + rnd() * z.h; ctx.moveTo(x, y);
                            for (let j = 0; j < 4; j++) { x += (rnd() - 0.3) * 90; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y); }
                            ctx.stroke();
                        }
                    } else {                        // dark floors: a quiet tile grid
                        ctx.strokeStyle = 'rgba(217, 204, 255, 0.05)'; ctx.lineWidth = 1 * k; ctx.beginPath();
                        for (let x = z.x + 32; x < z.x + z.w; x += 32) { ctx.moveTo(x, z.y); ctx.lineTo(x, z.y + z.h); }
                        for (let y = z.y + 32; y < z.y + z.h; y += 32) { ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); }
                        ctx.stroke();
                    }
                    ctx.restore();
                    ctx.strokeStyle = 'rgba(217, 204, 255, 0.12)'; ctx.lineWidth = 1 * k; ctx.strokeRect(z.x, z.y, z.w, z.h);
                }
                // Light pools: one in each zone big enough to be a room, plus one at each landmark
                if (typeof glowSprite === 'function') {
                    ctx.globalCompositeOperation = 'lighter';
                    const pool = glowSprite('164, 105, 255', 0.25), warm = glowSprite('255, 176, 90', 0.2);
                    ctx.globalAlpha = 0.22;
                    for (const z of zones) if (z.w * z.h > 40000) { const R = Math.min(z.w, z.h) * 0.55; ctx.drawImage(pool, z.x + z.w / 2 - R, z.y + z.h / 2 - R, R * 2, R * 2); }
                    ctx.globalAlpha = 0.18;
                    for (const l of map.landmarks || []) ctx.drawImage(warm, l.x - 90, l.y - 90, 180, 180);
                    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                }
                // Walls: a soft lavender glow, a dark core, a crisp pale rim
                const walls = (map.walls || []).concat(map.buildings || []);
                const wallPath = () => { ctx.beginPath(); for (const b of walls) ctx.rect(b.x, b.y, b.w, b.h); };
                ctx.globalCompositeOperation = 'lighter';
                wallPath(); ctx.strokeStyle = 'rgba(164, 105, 255, 0.16)'; ctx.lineWidth = 9 * k; ctx.stroke();
                ctx.strokeStyle = 'rgba(190, 150, 255, 0.28)'; ctx.lineWidth = 4 * k; ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
                wallPath(); ctx.fillStyle = '#06020c'; ctx.fill();
                ctx.strokeStyle = 'rgba(232, 220, 255, 0.85)'; ctx.lineWidth = 1.1 * k; ctx.stroke();
                // Words: Feminine for the plan
                const fam = "'Feminine', 'Raleway', 'Montserrat', sans-serif";
                const label = (text, x, y, css, color, glow) => {
                    ctx.font = `${css * k}px ${fam}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${css * 0.3 * k}px`;
                    ctx.shadowColor = glow; ctx.shadowBlur = 8 * k; ctx.fillStyle = color; ctx.fillText(text, x, y);
                    ctx.shadowBlur = 0; if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
                };
                // Landmarks: a small glowing diamond, named after the part after the map's prefix (apt_bed → BED).
                // Landmarks on one spot share a diamond and stack their names; one beside an exit leaves the words to the exit.
                const exits = (map.transitions || []).map(t => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 }));
                const spots = [];
                for (const l of map.landmarks || []) {
                    const name = String(l.id || '').replace(/^[a-z0-9]+_/, '').replace(/_/g, ' ').toUpperCase();
                    const at = spots.find(p => Math.hypot(p.x - l.x, p.y - l.y) < 40);
                    if (at) { if (name && !at.names.includes(name)) at.names.push(name); } else spots.push({ x: l.x, y: l.y, names: name ? [name] : [] });
                }
                for (const p of spots) {
                    const s = 5 * k;
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
                    ctx.shadowColor = 'rgba(217, 204, 255, 0.9)'; ctx.shadowBlur = 8 * k;
                    ctx.fillStyle = '#120620'; ctx.fillRect(-s, -s, s * 2, s * 2);
                    ctx.strokeStyle = '#e6dcff'; ctx.lineWidth = 1.2 * k; ctx.strokeRect(-s, -s, s * 2, s * 2);
                    ctx.restore();
                    if (exits.some(e => Math.hypot(e.x - p.x, e.y - p.y) < 110)) continue;
                    p.names.forEach((n, i) => label(n, p.x, p.y + (15 + i * 11) * k, 8, 'rgba(232, 222, 250, 0.85)', 'rgba(164, 105, 255, 0.9)'));
                }
                // Exits: the way out in gold
                for (const t of map.transitions || []) if (t.label) label(t.label.toUpperCase(), t.x + t.w / 2, t.y + t.h / 2 - 16 * k, 8, '#ffd27a', 'rgba(255, 170, 40, 0.9)');
                // Edge ticks every 100 units, like a surveyor's plan
                ctx.strokeStyle = 'rgba(217, 204, 255, 0.35)'; ctx.lineWidth = 1 * k; ctx.beginPath();
                for (let x = 0; x <= W; x += 100) { const t = (x % 500 ? 4 : 8) * k; ctx.moveTo(x, -2 * k); ctx.lineTo(x, -2 * k - t); ctx.moveTo(x, H + 2 * k); ctx.lineTo(x, H + 2 * k + t); }
                for (let y = 0; y <= H; y += 100) { const t = (y % 500 ? 4 : 8) * k; ctx.moveTo(-2 * k, y); ctx.lineTo(-2 * k - t, y); ctx.moveTo(W + 2 * k, y); ctx.lineTo(W + 2 * k + t, y); }
                ctx.stroke();
                ctx.restore();
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
