        /**
         * Lamp Entity - No collision, just decoration.
         */
        /**
         * Lamp Entity - Now supports rotation and proper alignment.
         */
        /**
         * Lamp Entity - Now supports rotation and proper alignment.
         */
        /* Street lamps, seen from straight above, in an antiquated cast-iron style. Each style is
           painted once into a sprite (per colour and lit/unlit) and stamped; the glow and the motes
           stay live. `bulbs` are where the light sits (the lighting keys off the lamp itself). To add
           a variation, add a style here and give the lamps that should wear it its `lampType`. */
        const LAMP_IRON = '#14101a', LAMP_IRON_HI = 'rgba(176, 160, 214, 0.35)', LAMP_BRASS = '#b08a4a';
        const LAMP_STYLES = {
            // Twin lanterns on a scrolled crossarm over a fluted post (city streets and corners)
            antique_twin: {
                bulbs: [{ x: 0, y: -20 }, { x: 0, y: 20 }],
                box: [-10, -29, 20, 58],                                         // the sprite's extent round the post
                paint(c, lit, color) {
                    _lampBase(c, 0, 0, 8);
                    // the crossarm, with a scroll curling off each end, and a brass boss at the post
                    c.strokeStyle = LAMP_IRON; c.lineCap = 'round'; c.lineWidth = 3.4;
                    c.beginPath(); c.moveTo(0, -17); c.lineTo(0, 17); c.stroke();
                    c.lineWidth = 1.6;
                    for (const s of [-1, 1]) for (const side of [-1, 1]) {
                        c.beginPath(); c.moveTo(0, s * 9); c.bezierCurveTo(side * 6, s * 9, side * 7, s * 14, side * 3.5, s * 14.5);
                        c.arc(side * 3.5 + side * -1.4, s * 13.6, 1.4, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI * 1.6 : Math.PI * 0.4, side < 0); c.stroke();
                    }
                    c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.8;
                    c.beginPath(); c.moveTo(-0.9, -16); c.lineTo(-0.9, 16); c.stroke();
                    c.fillStyle = LAMP_BRASS; c.beginPath(); c.arc(0, 0, 2.2, 0, Math.PI * 2); c.fill();
                    for (const b of this.bulbs) _lampLantern(c, b.x, b.y, 7, lit, color);
                }
            },
            // A shepherd's crook curling out to one lantern (parks, the graveyard)
            antique_crook: {
                bulbs: [{ x: 22, y: 0 }],
                box: [-8, -14, 38, 23],
                paint(c, lit, color) {
                    _lampBase(c, 0, 0, 6.5);
                    c.strokeStyle = LAMP_IRON; c.lineCap = 'round'; c.lineWidth = 3;
                    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(8, -10, 20, -11, 24, -6); c.quadraticCurveTo(26, -3, 22, -1); c.stroke();
                    c.lineWidth = 1.4;                                           // the little scroll under the arm
                    c.beginPath(); c.moveTo(5, -4); c.quadraticCurveTo(10, -3, 11, -7); c.arc(9.8, -7, 1.2, 0, Math.PI * 1.5, true); c.stroke();
                    c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.7;
                    c.beginPath(); c.moveTo(1, -1.5); c.bezierCurveTo(8, -11, 19, -12, 23, -7.5); c.stroke();
                    for (const b of this.bulbs) _lampLantern(c, b.x, b.y, 6.5, lit, color);
                }
            },
            // A lantern standing on a pillar's cap, no post (the graveyard's walls: drawGraveyardPillar)
            pillar_lantern: {
                bulbs: [{ x: 0, y: 0 }],
                box: [-9, -9, 18, 18],
                paint(c, lit, color) {
                    c.fillStyle = LAMP_IRON; c.fillRect(-6, -6, 12, 12);            // its iron foot
                    c.strokeStyle = LAMP_BRASS; c.lineWidth = 0.8; c.strokeRect(-5.5, -5.5, 11, 11);
                    for (const b of this.bulbs) _lampLantern(c, b.x, b.y, 6.5, lit, color);
                }
            }
        };
        const LAMP_TYPE_STYLE = { 1: 'antique_crook', 2: 'antique_twin', 6: 'pillar_lantern' };
        // The plain streets' second lamp colour (opposite the amber side): a warm rose-champagne, not bare white
        const STREET_LAMP_ROSE = '#ffcfae';
        const LAMP_POST_SCALE = 1.5; // Street and entrance posts, scaled around their ground anchors.

        // The fluted cast-iron foot of the post, ringed in brass
        function _lampBase(c, x, y, r) {
            const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, '#3a3046'); g.addColorStop(0.55, '#1c1624'); g.addColorStop(1, '#0b080f');
            c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = 0.8;
            for (let i = 0; i < 12; i++) {                                       // the flutes
                const a = i / 12 * Math.PI * 2;
                c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); c.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); c.stroke();
            }
            c.strokeStyle = LAMP_BRASS; c.lineWidth = 1;
            c.beginPath(); c.arc(x, y, r * 0.5, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.7;
            c.beginPath(); c.arc(x, y, r - 0.6, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
        }

        // A hexagonal lantern from above: lit glass round the edge of its iron cap, a brass finial on top
        function _lampLantern(c, x, y, r, lit, color) {
            const hex = (rr, rot = Math.PI / 6) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); };
            if (lit) {
                const g = c.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, '#fffaf0'); g.addColorStop(0.55, color); g.addColorStop(1, color);
                c.fillStyle = g;
            } else c.fillStyle = '#2a2433';
            hex(r); c.fill();
            c.strokeStyle = LAMP_IRON; c.lineWidth = 1.2; c.stroke();
            c.lineWidth = 0.8;                                                   // the frame's corner ribs
            for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.62); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
            c.fillStyle = LAMP_IRON; hex(r * 0.5); c.fill();                     // the cap
            c.strokeStyle = 'rgba(176, 138, 74, 0.8)'; c.lineWidth = 0.7; c.stroke();
            c.strokeStyle = LAMP_IRON_HI; c.lineWidth = 0.6;
            c.beginPath(); c.moveTo(x - r * 0.45, y - r * 0.2); c.lineTo(x - r * 0.1, y - r * 0.45); c.stroke();
            c.fillStyle = LAMP_BRASS; c.beginPath(); c.arc(x, y, r * 0.17, 0, Math.PI * 2); c.fill();
        }

        /** A lamp colour lifted towards warm white by t (the glass nearer the flame) */
        function _lampTint(hex, t) {
            const W = [255, 246, 228];
            return '#' + [1, 3, 5].map((i, j) => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(v + (W[j] - v) * t).toString(16).padStart(2, '0'); }).join('');
        }

        // Bulb artwork lives above the darkness layer; the old lamp bodies keep their materials.
        // Gradients and pane masks are baked once, so each lit bulb costs one sprite draw.
        const _lampBulbEmissionSprites = new Map();
        function _lampBulbEmissionSprite(color, radius, shape = 'lantern', S = 3) {
            color = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffeebb';
            const key = `${color}|${radius}|${shape}|${S}`;
            let cv = _lampBulbEmissionSprites.get(key);
            if (cv) return cv;
            cv = document.createElement('canvas'); cv.width = cv.height = 48 * S;
            const c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, 24 * S, 24 * S);
            const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(',');
            const haloRadius = shape === 'globe' ? 18 : 24;
            const halo = c.createRadialGradient(0, 0, radius * .6, 0, 0, haloRadius);
            halo.addColorStop(0, `rgba(${rgb},0.42)`); halo.addColorStop(.25, `rgba(${rgb},0.28)`);
            halo.addColorStop(.6, `rgba(${rgb},0.10)`); halo.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = halo; c.fillRect(-24, -24, 48, 48);
            const bloomRadius = radius * 1.65;
            const bloom = c.createRadialGradient(0, 0, radius * .45, 0, 0, bloomRadius);
            bloom.addColorStop(0, 'rgba(255,249,230,0.40)');
            bloom.addColorStop(.48, `rgba(${rgb},0.26)`); bloom.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = bloom; c.beginPath(); c.arc(0, 0, bloomRadius, 0, Math.PI * 2); c.fill();
            if (shape === 'globe') {
                const face = c.createRadialGradient(-radius * .12, -radius * .15, 0, 0, 0, radius);
                face.addColorStop(0, '#ffffff'); face.addColorStop(.55, '#fffdf4');
                face.addColorStop(.85, '#fff1ce'); face.addColorStop(1, color);
                c.fillStyle = face; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill();
            } else {
                // Light shines between the original corner ribs, leaving the iron cap opaque. The glass glows
                // in the lamp's own colour (its white sparkle is the glitter's, above), so a street of lamps reads warm, not white.
                const face = c.createRadialGradient(0, 0, radius * .45, 0, 0, radius);
                face.addColorStop(0, _lampTint(color, .6)); face.addColorStop(.32, _lampTint(color, .25));
                face.addColorStop(.70, color); face.addColorStop(1, color);
                c.fillStyle = face;
                const points = Array.from({length:6}, (_, i) => {
                    const a = Math.PI / 6 + i * Math.PI / 3; return {x:Math.cos(a),y:Math.sin(a)};
                });
                for (let i = 0; i < 6; i++) {
                    const p = points[i], q = points[(i + 1) % 6], inset = .12;
                    const a = {x:p.x+(q.x-p.x)*inset,y:p.y+(q.y-p.y)*inset};
                    const b = {x:q.x+(p.x-q.x)*inset,y:q.y+(p.y-q.y)*inset};
                    c.beginPath(); c.moveTo(a.x * radius * .91, a.y * radius * .91);
                    c.lineTo(b.x * radius * .91, b.y * radius * .91);
                    c.lineTo(b.x * radius * .59, b.y * radius * .59);
                    c.lineTo(a.x * radius * .59, a.y * radius * .59); c.closePath(); c.fill();
                }
            }
            _lampBulbEmissionSprites.set(key, cv);
            return cv;
        }

        const LAMP_STAR_BULBS = [];   // (scratch: each lantern's bulbs in world space, for its glare)

        // The glass glitters, as in ETERNAL's renders: not a smooth glow but dozens of tiny points, each catching
        // the light on its own. A few frames of scattered points are baked per colour and size; a lantern
        // cross-fades from one to the next at its own pace, so each point fades in and out (two stamps a bulb).
        // Now and then a bulb flashes (LAMP_GLINT), and its star glare flares with it.
        const LAMP_GLITTER = { FRAMES: 4, POINTS: 40, RATE: 1.1 };      // frames, points a frame, frames a second
        const LAMP_GLINT = { EDGE: 0.93, FLARE: 0.45 };                   // how rare a flash is (0..1, higher: rarer), how much the star grows
        const _lampGlitterSprites = new Map();
        function _lampGlitterSprite(color, radius, frame, S = 3) {
            const key = color + '|' + radius + '|' + frame + '|' + S;
            let cv = _lampGlitterSprites.get(key);
            if (cv) return cv;
            cv = document.createElement('canvas'); cv.width = cv.height = 48 * S;
            const c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, 24 * S, 24 * S);
            let seed = 7919 * (frame + 1) + radius * 131;
            const rnd = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
            const pale = _lampTint(/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffeebb', 0.6);
            for (let i = 0; i < LAMP_GLITTER.POINTS; i++) {
                // over the glass (between the cap and the frame), a few spilling just past it
                const a = rnd() * Math.PI * 2, d = radius * (0.5 + rnd() * 0.62), x = Math.cos(a) * d, y = Math.sin(a) * d;
                const r = 0.3 + rnd() * 0.55, hot = rnd() < 0.3;
                c.fillStyle = hot ? '#fffdf6' : pale;
                c.globalAlpha = 0.55 + rnd() * 0.45;
                c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
                if (hot) {                                                       // the brightest catch a tiny cross of light
                    c.globalAlpha *= 0.6; c.fillRect(x - r * 2.6, y - 0.12, r * 5.2, 0.24); c.fillRect(x - 0.12, y - r * 2.6, 0.24, r * 5.2);
                }
            }
            _lampGlitterSprites.set(key, cv);
            return cv;
        }
        /** How hard a bulb is flashing now (0 mostly, rising to 1 for a moment every so often): two slow waves meeting */
        function lampGlint(t, phase) {
            const w = Math.sin(t * 0.53 + phase) * Math.sin(t * 1.37 + phase * 2.1);
            return Math.max(0, (w - LAMP_GLINT.EDGE) / (1 - LAMP_GLINT.EDGE));
        }

        const _lampSprites = new Map();
        /** A lamp style painted once (cropped to its `box`) per colour, lit state and size:
         *  1× when the city is seen from afar, 3× up close, so a zoomed-out street isn't shrinking big sprites. */
        function lampSprite(style, color, lit, S = 3) {
            const key = style + '|' + color + '|' + (lit ? 1 : 0) + '|' + S;
            let cv = _lampSprites.get(key);
            if (!cv) {
                const [bx, by, bw, bh] = LAMP_STYLES[style].box;
                cv = document.createElement('canvas'); cv.width = Math.ceil(bw * S); cv.height = Math.ceil(bh * S);
                const c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, -bx * S, -by * S);
                LAMP_STYLES[style].paint(c, lit, color);
                _lampSprites.set(key, cv);
            }
            return cv;
        }

        /* Indoor light fixtures, seen from above: the lamp library. Like the street styles, each is painted once
           per light colour, lit state and size, and stamped. A LampEntity wears one by `fixture` (or its lampType's
           default, LAMP_TYPE_FIXTURE); furniture paints one with drawLampFixture, and a glow pass lights one with
           drawLampFixtureLit (its halo and lit glass, after the darkness). `box` is the sprite's extent, `halo`
           the radius of its light round it. To add a lamp, add a fixture here and name it where it stands. */
        const FX_BRASS = ['#f0d79a', '#c9a46a', '#8d6a32'], FX_BRONZE = '#2a211c';
        /** A hex colour darkened (f < 1) or lifted towards white (f > 1, by f - 1) */
        function _fxShade(hex, f) {
            return '#' + [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1)).toString(16).padStart(2, '0'); }).join('');
        }
        /** Hex colours a and b mixed, t of the way to b */
        function _fxMix(a, b, t) {
            return '#' + [1, 3, 5].map(i => { const u = parseInt(a.slice(i, i + 2), 16), v = parseInt(b.slice(i, i + 2), 16); return Math.round(u + (v - u) * t).toString(16).padStart(2, '0'); }).join('');
        }
        /** A brass disc with its highlight up and to the left */
        function _fxBrass(c, x, y, r) {
            const g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r);
            g.addColorStop(0, FX_BRASS[0]); g.addColorStop(0.5, FX_BRASS[1]); g.addColorStop(1, FX_BRASS[2]);
            c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        }
        function _fxShadow(c, x, y, r) {
            c.fillStyle = 'rgba(0, 0, 0, 0.26)'; c.beginPath(); c.ellipse(x + 1.6, y + 2.2, r, r * 0.94, 0, 0, Math.PI * 2); c.fill();
        }

        // A pleated fabric shade from above: the fabric falling away from the top ring to a trimmed rim, the bulb
        // and the harp's spider seen down through the top. Lit, the cloth glows in the light's colour, hottest by the bulb.
        function _fxShade_(c, lit, color, o) {
            const { R, r0, pleats, fabric, trim } = o;
            _fxShadow(c, 0, 0, R + 0.6);
            const g = c.createRadialGradient(0, 0, r0, 0, 0, R);
            if (lit) {                                                           // the cloth's own colour, steeped in the light
                const cloth = _fxMix(fabric[0], color, 0.6);
                g.addColorStop(0, _fxShade(_fxMix(cloth, '#f0a050', 0.15), 0.97)); g.addColorStop(0.35, _fxShade(_fxMix(cloth, '#e08840', 0.22), 0.82)); g.addColorStop(1, _fxShade(_fxMix(cloth, '#b85a24', 0.3), 0.56));
            }
            else { g.addColorStop(0, fabric[0]); g.addColorStop(1, fabric[1]); }
            c.fillStyle = g;
            // the rim, scalloped between the pleats' ribs
            c.beginPath();
            for (let i = 0; i <= pleats * 4; i++) {
                const a = i / (pleats * 4) * Math.PI * 2, r = R - 0.55 * (1 - Math.abs(Math.cos(a * pleats / 2)));
                c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
            }
            c.closePath(); c.fill();
            // the pleats: every other fold in shadow (wedges, so they still read when the lamp is small), a crest of light between
            const step = Math.PI * 2 / pleats;
            c.fillStyle = lit ? 'rgba(110, 40, 8, 0.3)' : 'rgba(90, 60, 40, 0.16)';
            c.beginPath();
            for (let i = 0; i < pleats; i++) { const a = i * step; c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.arc(0, 0, R - 0.5, a, a + step * 0.5); c.arc(0, 0, r0, a + step * 0.5, a, true); c.closePath(); }
            c.fill();
            c.strokeStyle = lit ? 'rgba(255, 236, 200, 0.4)' : 'rgba(255, 255, 255, 0.22)'; c.lineWidth = 0.45;
            c.beginPath();
            for (let i = 0; i < pleats; i++) { const b = (i + 0.75) * step; c.moveTo(Math.cos(b) * (r0 + 0.8), Math.sin(b) * (r0 + 0.8)); c.lineTo(Math.cos(b) * (R - 0.9), Math.sin(b) * (R - 0.9)); }
            c.stroke();
            if (!lit) {                                                          // daylight on the shade's far slope
                const s = c.createLinearGradient(-R, -R, R, R);
                s.addColorStop(0, 'rgba(255, 255, 255, 0.16)'); s.addColorStop(0.55, 'rgba(255, 255, 255, 0)'); s.addColorStop(1, 'rgba(40, 20, 10, 0.18)');
                c.fillStyle = s; c.beginPath(); c.arc(0, 0, R - 0.4, 0, Math.PI * 2); c.fill();
            }
            c.strokeStyle = trim; c.lineWidth = 1.3;                             // the braid round the rim
            c.beginPath(); c.arc(0, 0, R - 1, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = 'rgba(255, 240, 200, 0.35)'; c.lineWidth = 0.4;
            c.beginPath(); c.arc(0, 0, R - 1.2, Math.PI * 1.05, Math.PI * 1.65); c.stroke();
            // down through the top: the bulb (or its dark socket), the brass ring and the harp's spider
            if (lit) {
                const b = c.createRadialGradient(0, 0, 0, 0, 0, r0);
                b.addColorStop(0, '#ffffff'); b.addColorStop(0.55, '#fff6e0'); b.addColorStop(1, _lampTint(color, 0.5));
                c.fillStyle = b;
            } else c.fillStyle = '#3a2e28';
            c.beginPath(); c.arc(0, 0, r0, 0, Math.PI * 2); c.fill();
            c.strokeStyle = FX_BRASS[1]; c.lineWidth = 0.9; c.stroke();
            c.strokeStyle = FX_BRASS[2]; c.lineWidth = 0.6;
            c.beginPath(); c.moveTo(-r0, 0); c.lineTo(r0, 0); c.moveTo(0, -r0); c.lineTo(0, r0); c.stroke();
            _fxBrass(c, 0, 0, Math.max(1.2, r0 * 0.3));                          // the finial
            c.fillStyle = 'rgba(255, 250, 230, 0.8)'; c.beginPath(); c.arc(-0.4, -0.45, 0.4, 0, Math.PI * 2); c.fill();
        }

        const LAMP_FIXTURES = {
            // An empire floor lamp: ivory pleats under a bronze braid (lampType 4's default)
            shade_floor: { box: [-15, -15, 32, 32], halo: 40,
                paint(c, lit, color) { _fxShade_(c, lit, color, { R: 13, r0: 5, pleats: 26, fabric: ['#f4ead8', '#cdb89a'], trim: '#6e4a22' }); } },
            // A bell-shaded table lamp in cream silk, banded in wine velvet
            shade_table: { box: [-11, -11, 24, 24], halo: 30,
                paint(c, lit, color) { _fxShade_(c, lit, color, { R: 9, r0: 3.6, pleats: 16, fabric: ['#f6ecdc', '#d6c2a4'], trim: '#7a2e3c' }); } },
            // …and in rose silk
            shade_rose: { box: [-13, -13, 28, 28], halo: 34,
                paint(c, lit, color) { _fxShade_(c, lit, color, { R: 11, r0: 4.2, pleats: 20, fabric: ['#ecc4c4', '#b58489'], trim: '#7a2e3c' }); } },
            // A Tiffany dome: leaded jewel glass, a band of amber, a ring of leaves, a crown of honey, rubies at the hem
            tiffany: { box: [-14, -14, 30, 30], halo: 36,
                paint(c, lit, color) {
                    const R = 12, f = lit ? 1.1 : 0.62, seg = 14;
                    _fxShadow(c, 0, 0, R + 0.5);
                    const wedge = (r1, r2, a1, a2, fill) => { c.fillStyle = fill; c.beginPath(); c.arc(0, 0, r2, a1, a2); c.arc(0, 0, r1, a2, a1, true); c.closePath(); c.fill(); };
                    for (let i = 0; i < seg; i++) {
                        const a1 = i / seg * Math.PI * 2, a2 = (i + 1) / seg * Math.PI * 2;
                        wedge(8.4, R, a1, a2, _fxShade(i % 2 ? '#d9892c' : '#e3a83c', f));          // amber band
                        wedge(4.6, 8.4, a1, a2, _fxShade(i % 3 ? '#4f7f3c' : '#6d9a48', f));        // leaves
                        wedge(0, 4.6, a1, a2, _fxShade(i % 2 ? '#e8c35a' : '#d9b04a', f));          // honey crown
                    }
                    if (lit) {                                                    // the light through the glass, brightest at the crown
                        const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
                        g.addColorStop(0, 'rgba(255, 250, 230, 0.6)'); g.addColorStop(0.4, 'rgba(255, 230, 170, 0.12)'); g.addColorStop(1, 'rgba(255, 220, 160, 0)');
                        c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
                    }
                    c.strokeStyle = '#2a1e14'; c.lineWidth = 0.6;                 // the leading
                    c.beginPath();
                    for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; c.moveTo(Math.cos(a) * 4.6, Math.sin(a) * 4.6); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
                    c.stroke();
                    for (const r of [4.6, 8.4]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
                    c.strokeStyle = FX_BRASS[2]; c.lineWidth = 1.1; c.beginPath(); c.arc(0, 0, R - 0.4, 0, Math.PI * 2); c.stroke();
                    for (let i = 0; i < seg; i++) {                               // rubies at the hem
                        const a = (i + 0.5) / seg * Math.PI * 2;
                        c.fillStyle = _fxShade('#b0243a', lit ? 1.2 : 0.7); c.beginPath(); c.arc(Math.cos(a) * 10.2, Math.sin(a) * 10.2, 0.9, 0, Math.PI * 2); c.fill();
                    }
                    _fxBrass(c, 0, 0, 2); c.fillStyle = FX_BRONZE; c.beginPath(); c.arc(0, 0, 0.8, 0, Math.PI * 2); c.fill();
                } },
            // ETERNAL's twin sconce from above: the round brass plate seen edge-on against the wall, the collar standing
            // out from it, and the open top of the upper opal cylinder with its bulb's dome inside (the lower one is hidden
            // beneath). The wall runs along y at x = 0, the room towards +x (angle 0: a west wall, π east, π/2 north, -π/2 south).
            twin_sconce: { box: [-4, -12, 16, 24], halo: 26,
                paint(c, lit, color) {
                    const X = 6.4, R = 4.6;                                            // the cylinder: its centre out from the wall, its radius
                    c.fillStyle = 'rgba(0, 0, 0, 0.26)'; c.beginPath(); c.ellipse(X + 1.4, 1.8, R + 0.4, R + 0.3, 0, 0, Math.PI * 2); c.fill();
                    const p = c.createLinearGradient(-1.4, 0, 1.6, 0);                   // the plate, edge-on
                    p.addColorStop(0, '#7d5c2a'); p.addColorStop(0.5, '#e8cf94'); p.addColorStop(1, '#a3803f');
                    c.fillStyle = p; c.beginPath(); c.roundRect(-1.4, -9, 3, 18, 1.2); c.fill();
                    c.fillStyle = FX_BRASS[0]; for (const s of [-1, 1]) { c.beginPath(); c.arc(0.1, s * 7.6, 0.45, 0, Math.PI * 2); c.fill(); }   // its screws
                    const cg = c.createLinearGradient(0, -1.6, 0, 1.6);                  // the collar out to the glass
                    cg.addColorStop(0, FX_BRASS[0]); cg.addColorStop(0.5, FX_BRASS[1]); cg.addColorStop(1, FX_BRASS[2]);
                    c.fillStyle = cg; c.fillRect(1.4, -1.6, X - R + 0.4, 3.2);
                    // the opal glass: a ring seen end-on, lit through its frosting
                    const g = c.createRadialGradient(X, 0, R * 0.55, X, 0, R);
                    if (lit) { g.addColorStop(0, _lampTint(color, 0.45)); g.addColorStop(0.6, _fxShade(color, 0.95)); g.addColorStop(1, _fxShade(color, 0.62)); }
                    else { g.addColorStop(0, '#fbf8f3'); g.addColorStop(0.7, '#e6e0d6'); g.addColorStop(1, '#b8b0a4'); }
                    c.fillStyle = g; c.beginPath(); c.arc(X, 0, R, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = lit ? 'rgba(255, 255, 255, 0.55)' : 'rgba(150, 140, 125, 0.6)'; c.lineWidth = 0.4; c.stroke();
                    // the bulb's dome inside the open end
                    const b = c.createRadialGradient(X - 0.7, -0.8, 0, X, 0, R * 0.62);
                    if (lit) { b.addColorStop(0, '#ffffff'); b.addColorStop(0.6, '#fff6e2'); b.addColorStop(1, _lampTint(color, 0.5)); }
                    else { b.addColorStop(0, '#f2eee8'); b.addColorStop(1, '#c9c2b6'); }
                    c.fillStyle = b; c.beginPath(); c.arc(X, 0, R * 0.62, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = lit ? 'rgba(200, 120, 50, 0.35)' : 'rgba(120, 110, 95, 0.4)'; c.lineWidth = 0.35; c.stroke();
                } },
            // A frosted alabaster dome on a brass ring, etched with petals (lampType 3's default: ceilings and doorways)
            dome: { box: [-10, -10, 22, 22], halo: 28,
                paint(c, lit, color) {
                    const R = 8;
                    _fxShadow(c, 0, 0, R);
                    _fxBrass(c, 0, 0, R);
                    const g = c.createRadialGradient(-1.2, -1.4, 0, 0, 0, R - 1.5);
                    if (lit) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, _lampTint(color, 0.7)); g.addColorStop(1, color); }
                    else { g.addColorStop(0, '#f4efe6'); g.addColorStop(0.6, '#d8cfc2'); g.addColorStop(1, '#a89d8e'); }
                    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R - 1.5, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = lit ? 'rgba(255, 255, 255, 0.45)' : 'rgba(120, 100, 80, 0.3)'; c.lineWidth = 0.45;
                    for (let i = 0; i < 8; i++) {                                 // the etched petals
                        const a = i / 8 * Math.PI * 2;
                        c.beginPath(); c.ellipse(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 2.6, 1.2, a, 0, Math.PI * 2); c.stroke();
                    }
                    _fxBrass(c, 0, 0, 1.3);
                } },
            // A spun-brass bell pendant: from above, its dome, and the light spilling out under the rim
            pendant: { box: [-12, -12, 26, 26], halo: 30,
                paint(c, lit, color) {
                    const R = 8.5;
                    if (lit) {
                        const s = c.createRadialGradient(0, 0, R - 1, 0, 0, R + 3);
                        s.addColorStop(0, '#fffaf0'); s.addColorStop(0.4, _lampTint(color, 0.4)); s.addColorStop(1, 'rgba(255, 200, 140, 0)');
                        c.fillStyle = s; c.beginPath(); c.arc(0, 0, R + 3, 0, Math.PI * 2); c.fill();
                    } else _fxShadow(c, 0, 0, R);
                    _fxBrass(c, 0, 0, R);
                    c.strokeStyle = 'rgba(90, 60, 20, 0.45)'; c.lineWidth = 0.5;    // its spun rings
                    for (const r of [3, 5.4, 7.6]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
                    c.strokeStyle = 'rgba(255, 245, 210, 0.55)'; c.lineWidth = 0.6;
                    c.beginPath(); c.arc(0, 0, 6.4, Math.PI * 1.1, Math.PI * 1.55); c.stroke();
                    c.fillStyle = FX_BRONZE; c.beginPath(); c.arc(0, 0, 1.5, 0, Math.PI * 2); c.fill();   // the cord's cap
                } },
            // A frosted bar in a bronze frame with brass caps (lampType 5's default: clinics, halls)
            wall_bar: { box: [-6, -16, 12, 32], halo: 26,
                paint(c, lit, color) {
                    c.fillStyle = 'rgba(0, 0, 0, 0.26)'; c.beginPath(); c.roundRect(-2.2, -11.8, 6.4, 26, 2.5); c.fill();
                    c.fillStyle = FX_BRONZE; c.beginPath(); c.roundRect(-3.4, -13, 6.8, 26, 2.6); c.fill();
                    const g = c.createLinearGradient(-2.2, 0, 2.2, 0);
                    if (lit) { g.addColorStop(0, color); g.addColorStop(0.45, '#ffffff'); g.addColorStop(1, _lampTint(color, 0.4)); }
                    else { g.addColorStop(0, '#9e978e'); g.addColorStop(0.45, '#e2ddd5'); g.addColorStop(1, '#b4ada3'); }
                    c.fillStyle = g; c.beginPath(); c.roundRect(-2.2, -10.5, 4.4, 21, 1.8); c.fill();
                    c.strokeStyle = lit ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.25)'; c.lineWidth = 0.3;   // the frosting's ribs
                    for (let y = -9; y <= 9; y += 2) { c.beginPath(); c.moveTo(-2, y); c.lineTo(2, y); c.stroke(); }
                    for (const s of [-1, 1]) _fxBrass(c, 0, s * 12, 2.1);
                } }
        };
        // An iron carriage lantern out on a scrolled bracket, its plate on the wall at (0, 0), the street towards +y (shop doors)
        LAMP_FIXTURES.carriage = { box: [-8, -3, 16, 19], halo: 26,
            paint(c, lit, color) {
                _fxShadow(c, 0, 9, 5.5);
                c.fillStyle = LAMP_IRON; c.fillRect(-3.4, -1.6, 6.8, 3.2);
                c.strokeStyle = LAMP_BRASS; c.lineWidth = 0.5; c.strokeRect(-3, -1.2, 6, 2.4);
                c.strokeStyle = LAMP_IRON; c.lineCap = 'round'; c.lineWidth = 1.8;
                c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 5); c.stroke();
                c.lineWidth = 1;                                                     // the scrolls under the arm
                for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, 1); c.quadraticCurveTo(s * 3.5, 1.5, s * 3, 4); c.arc(s * 2.2, 4, 0.8, 0, Math.PI * 2); c.stroke(); }
                _lampLantern(c, 0, 9.5, 5, lit, color);
            } };
        const LAMP_TYPE_FIXTURE = { 3: 'dome', 4: 'shade_floor', 5: 'wall_bar' };

        const _lampFixtureSprites = new Map();
        /** A fixture painted once (cropped to its `box`) per colour, lit state and size, as lampSprite */
        function lampFixtureSprite(name, color, lit, S = 3) {
            const key = name + '|' + color + '|' + (lit ? 1 : 0) + '|' + S;
            let cv = _lampFixtureSprites.get(key);
            if (!cv) {
                const [bx, by, bw, bh] = LAMP_FIXTURES[name].box;
                cv = document.createElement('canvas'); cv.width = Math.ceil(bw * S); cv.height = Math.ceil(bh * S);
                const c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, -bx * S, -by * S);
                LAMP_FIXTURES[name].paint(c, lit, color);
                _lampFixtureSprites.set(key, cv);
            }
            return cv;
        }
        /** A fixture's glass colour: the lamp's own, or warm white when that's missing or a dull grey (a building's plain accent) */
        function _fxColor(color) {
            if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '#ffeebb';
            const v = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
            return Math.max(...v) - Math.min(...v) < 24 && Math.max(...v) < 200 ? '#ffe2b8' : color;
        }
        /** The sprite size for ctx's current scale (times `scale`): 1×, 2× or 3× */
        function _fxSize(ctx, scale = 1) { const m = ctx.getTransform(), d = Math.hypot(m.a, m.b) * scale; return d > 1.6 ? 3 : d > 0.8 ? 2 : 1; }

        /** Paint fixture `name` at (x, y): o.lit, o.color (the light's), o.angle, o.scale */
        function drawLampFixture(ctx, name, x, y, o = {}) {
            const spec = LAMP_FIXTURES[name];
            if (!spec) return;
            const scale = o.scale || 1, [bx, by, bw, bh] = spec.box;
            ctx.save(); ctx.translate(x, y);
            if (o.angle) ctx.rotate(o.angle);
            if (scale !== 1) ctx.scale(scale, scale);
            ctx.drawImage(lampFixtureSprite(name, _fxColor(o.color), !!o.lit, _fxSize(ctx)), bx, by, bw, bh);
            ctx.restore();
        }
        /** After the darkness: fixture `name` lit at (x, y), its halo round it, at strength k (o.angle, o.scale) */
        function drawLampFixtureLit(ctx, name, x, y, color, k = 1, o = {}) {
            const spec = LAMP_FIXTURES[name];
            if (!spec || k < 0.01) return;
            const scale = o.scale || 1, [bx, by, bw, bh] = spec.box, col = _fxColor(color), a = ctx.globalAlpha, op = ctx.globalCompositeOperation;
            ctx.save(); ctx.translate(x, y);
            if (o.angle) ctx.rotate(o.angle);
            if (scale !== 1) ctx.scale(scale, scale);
            const h = spec.halo;
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * Math.min(1, k) * 0.22;
            ctx.drawImage(glowSprite(col, 0.18), -h, -h, h * 2, h * 2);
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * Math.min(1, k);
            ctx.drawImage(lampFixtureSprite(name, col, true, _fxSize(ctx)), bx, by, bw, bh);
            ctx.restore();
            ctx.globalAlpha = a; ctx.globalCompositeOperation = op;
        }

        function lampPaintInView(lamp, ctx, view, zoom, daylight) {
            if (!lamp || lamp.draw !== LampEntity.prototype.draw || lamp._glow !== LampEntity.prototype._glow ||
                !Number.isFinite(daylight) || !Number.isFinite(lamp._lightK ?? 1)) return true;
            if (view && lamp.x >= view.left && lamp.x <= view.right && lamp.y >= view.top && lamp.y <= view.bottom) return true;
            const style = LAMP_TYPE_STYLE[lamp.lampType], on = daylight < 0.2 && !lamp._forcedOff;
            let left, top, right, bottom;
            if (style) {
                const spec = LAMP_STYLES[style], box = spec.box;
                if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || !Array.isArray(spec.bulbs)) return true;
                left = box[0]; top = box[1]; right = left + box[2]; bottom = top + box[3];
                if (on) for (const b of spec.bulbs) {
                    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return true;
                    // The glare's reach at a flash (beyond the 24-unit glow, every 18-unit orbit and its 1.2-unit mote), in post units
                    const r = Math.max(24, LENS_GLARE.LAMP_R * (1 + LAMP_GLINT.FLARE) / LAMP_POST_SCALE);
                    left = Math.min(left, b.x - r); right = Math.max(right, b.x + r);
                    top = Math.min(top, b.y - r); bottom = Math.max(bottom, b.y + r);
                }
            } else if (lamp.fixture && LAMP_FIXTURES[lamp.fixture]) {
                const [bx, by, bw, bh] = LAMP_FIXTURES[lamp.fixture].box, r = on ? Math.max(LAMP_FIXTURES[lamp.fixture].halo, lamp.lampType === 4 ? 34 : 24) : 0;
                left = Math.min(bx, -r); top = Math.min(by, -r); right = Math.max(bx + bw, r); bottom = Math.max(by + bh, r);
            } else if (lamp.lampType === 3 || lamp.lampType === 4 || lamp.lampType === 5) {
                const r = on ? (lamp.lampType === 4 ? 34 : 24) : lamp.lampType === 4 ? 12 : 8;
                left = -r; right = r; top = lamp.lampType === 5 ? Math.min(-12, -r) : -r;
                bottom = lamp.lampType === 5 ? Math.max(12, r) : r;
            } else return true;
            const scale = style ? LAMP_POST_SCALE : 1;
            return worldPaintBoxInView(ctx, view, zoom, lamp.x, lamp.y, left * scale, top * scale, right * scale, bottom * scale, lamp.angle);
        }

        class LampEntity extends GameEntity {
            constructor(config) {
                super({
                    ...config,
                    type: 'lamp',
                    hasCollision: false,
                    collisionLayer: GameEntity.LAYER.NONE
                });
                
                this.lampType = config.lampType || 2;
                this.angle = config.angle || 0; // Orientation in radians
                // Indoor lamps wear a fixture from the library (LAMP_FIXTURES); 'orb' keeps the old bare glow
                const fx = config.fixture || LAMP_TYPE_FIXTURE[this.lampType];
                this.fixture = fx && LAMP_FIXTURES[fx] && !LAMP_TYPE_STYLE[this.lampType] ? fx : null;
                
                // Use color/radius from config or defaults
                this.color = config.color || (this.lampType === 1 ? '#ffaa55' : '#ffeebb');
                this.lightRadius = config.lightRadius || (this.lampType === 1 ? 200 : 350);
                
                // --- CRITICAL FIX ---
                // Overwrite the default GameEntity radius (which is small for collision)
                // with the lightRadius so the LightingSystem knows how far to draw the glow.
                this.radius = this.lightRadius;
                
                // Random offset so lamps don't all twinkle in perfect unison
                this.animOffset = Math.random() * 10000;
            }
            
            update() { }

            /** Only the luminous panes and bloom: drawn after the world's darkness, never the post. */
            drawEmissive(ctx, daylight = 0) {
                const style = LAMP_TYPE_STYLE[this.lampType], k = Math.max(0, Math.min(1, this._lightK ?? 1));
                if (this.fixture) {                                              // an indoor fixture: its lit glass and halo
                    if (this.visible && daylight < .2 && !this._forcedOff) drawLampFixtureLit(ctx, this.fixture, this.x, this.y, this.color, k, { angle: this.angle });
                    return;
                }
                if (!style || !this.visible || daylight >= .2 || this._forcedOff || k < .02) return;
                const t = (_frameTime + this.animOffset) / 1000;
                const SG = (() => { const m = ctx.getTransform(), d = Math.hypot(m.a, m.b) * LAMP_POST_SCALE; return d > 1.6 ? 3 : d > .8 ? 2 : 1; })();
                // The lens's glare first (core/draw-helpers.js: fog under a star), breathing and flaring with the glitter's flashes;
                // the lantern and its glitter go over it, so the points of light stay crisp in the haze, as in the renders
                if (GameSettings.fogGlare !== false || GameSettings.starGlare !== false) {
                    const ca = Math.cos(this.angle) * LAMP_POST_SCALE, sa = Math.sin(this.angle) * LAMP_POST_SCALE;
                    LAMP_STAR_BULBS.length = 0;
                    for (const b of LAMP_STYLES[style].bulbs) LAMP_STAR_BULBS.push(this.x + b.x * ca - b.y * sa, this.y + b.x * sa + b.y * ca);
                    for (let i = 0; i < LAMP_STAR_BULBS.length; i += 2) {
                        const breathe = 0.86 + 0.14 * Math.sin(t * 1.7 + i * 1.9), glint = lampGlint(t, (i >> 1) * 2.3 + this.animOffset * 0.001);
                        drawLensGlare(ctx, LAMP_STAR_BULBS[i], LAMP_STAR_BULBS[i + 1], this.color,
                            LENS_GLARE.LAMP_R * breathe * (1 + LAMP_GLINT.FLARE * glint), k * Math.min(1, 0.8 + 0.2 * breathe + 0.4 * glint), SG);
                    }
                }
                ctx.save();
                ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.scale(LAMP_POST_SCALE, LAMP_POST_SCALE);
                const m = ctx.getTransform(), density = Math.hypot(m.a, m.b);
                const S = density > 1.6 ? 3 : density > .8 ? 2 : 1;
                const radius = style === 'antique_twin' ? 7 : 6.5;
                ctx.globalAlpha *= k;
                const col = /^#[0-9a-f]{6}$/i.test(this.color) ? this.color : '#ffeebb';
                const bulbs = LAMP_STYLES[style].bulbs, base = ctx.globalAlpha;
                for (let i = 0; i < bulbs.length; i++) {
                    const b = bulbs[i];
                    ctx.globalAlpha = base;
                    ctx.drawImage(_lampBulbEmissionSprite(this.color, radius, 'lantern', S), b.x - 24, b.y - 24, 48, 48);
                    // the glitter: this frame fading out as the next fades in
                    const u = t * LAMP_GLITTER.RATE + i * 1.7, f = Math.floor(u), mix = u - f, n = LAMP_GLITTER.FRAMES;
                    const f0 = ((f + i) % n + n) % n, f1 = (f0 + 1) % n;
                    // (laid over the glass, not added: added, the points melt into one white blaze under the bloom)
                    ctx.globalAlpha = base * (1 - mix);
                    ctx.drawImage(_lampGlitterSprite(col, radius, f0, S), b.x - 24, b.y - 24, 48, 48);
                    ctx.globalAlpha = base * mix;
                    ctx.drawImage(_lampGlitterSprite(col, radius, f1, S), b.x - 24, b.y - 24, 48, 48);
                    const glint = lampGlint(t, i * 2.3 + this.animOffset * 0.001);   // a flash: the glitter blazes for a moment
                    if (glint > 0.01) {
                        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = base * glint;
                        ctx.drawImage(_lampGlitterSprite(col, radius, f0, S), b.x - 24, b.y - 24, 48, 48);
                        ctx.drawImage(_lampBulbEmissionSprite(this.color, radius, 'lantern', S), b.x - 24, b.y - 24, 48, 48);
                    }
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.restore();
            }

            /** This lamp's glow sprite (core/draw-helpers.js). */
            _glow() { return this._glowCv || (this._glowCv = glowSprite(/^#[0-9a-f]{6}$/i.test(this.color) ? this.color : '#ffeebb', 0.3)); }
            
            draw(ctx, daylight = 0) {
                if (!this.visible) return;
                
                const isOn = daylight < 0.2 && !this._forcedOff;
        
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
        
                // 1. DETERMINE BULB POSITIONS (Relative to 0,0)
                let bulbs = [];
                
                const style = LAMP_TYPE_STYLE[this.lampType];
                if (this.fixture) {                                              // an indoor fixture (LAMP_FIXTURES): its light on the floor, its body
                    const spec = LAMP_FIXTURES[this.fixture], [bx, by, bw, bh] = spec.box, k = this._lightK ?? 1, S = _fxSize(ctx), col = _fxColor(this.color);
                    if (isOn) {
                        const gr = this.lampType === 4 ? 34 : 24;
                        ctx.globalAlpha = 0.7 * k; ctx.drawImage(this._glow(), -gr, -gr, gr * 2, gr * 2); ctx.globalAlpha = 1;
                        if (k < 1) ctx.drawImage(lampFixtureSprite(this.fixture, col, false, S), bx, by, bw, bh);
                        ctx.globalAlpha = k;
                    }
                    ctx.drawImage(lampFixtureSprite(this.fixture, col, isOn, S), bx, by, bw, bh);
                    ctx.globalAlpha = 1;
                    ctx.restore();
                    return;
                }
                if (style) ctx.scale(LAMP_POST_SCALE, LAMP_POST_SCALE);
                if (style) { // A street lamp: its antique style, a baked sprite (LAMP_STYLES)
                    bulbs = LAMP_STYLES[style].bulbs;
                    
                } else if (this.lampType === 3) { // Wall Mounted (circular)
                     bulbs.push({x: 0, y: 0});
                     ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
                     
                } else if (this.lampType === 5) { // Wall Strip (narrow rectangular sconce)
                     bulbs.push({x: 0, y: 0});
                     // Rectangular housing
                     ctx.fillStyle = '#1a1a1a';
                     ctx.fillRect(-3, -12, 6, 24);
                     // Warm glow strip
                     if (isOn) {
                         const k = this._lightK ?? 1;
                         ctx.globalAlpha = 0.7 * k;
                         ctx.drawImage(this._glow(), -12, -22, 24, 44);
                         ctx.globalAlpha = k;
                         ctx.fillStyle = this.color;
                         ctx.fillRect(-2, -10, 4, 20);
                         ctx.globalAlpha = 1;
                     } else {
                         ctx.fillStyle = '#333';
                         ctx.fillRect(-2, -10, 4, 20);
                     }
                     
                } else if (this.lampType === 4) { // Floor Lamp
                     bulbs.push({x: 0, y: 0});
                     
                }
        
                // 2. DRAW BULBS — a glow sprite behind each (faded with the room's light)
                const k = this._lightK ?? 1, big = this.lampType === 4;
                if (style) {
                    const col = /^#[0-9a-f]{6}$/i.test(this.color) ? this.color : '#ffeebb';
                    const m = ctx.getTransform(), S = Math.hypot(m.a, m.b) > 1.6 ? 3 : Math.hypot(m.a, m.b) > 0.8 ? 2 : 1;
                    const [bx, by, bw, bh] = LAMP_STYLES[style].box;
                    if (isOn) {
                        ctx.globalAlpha = 0.85 * k;
                        for (const b of bulbs) ctx.drawImage(this._glow(), b.x - 24, b.y - 24, 48, 48);
                        ctx.globalAlpha = 1;
                        if (k < 1) ctx.drawImage(lampSprite(style, col, false, S), bx, by, bw, bh);
                        ctx.globalAlpha = k;
                    }
                    ctx.drawImage(lampSprite(style, col, isOn, S), bx, by, bw, bh);
                    ctx.globalAlpha = 1;
                }
                for (let b of style ? [] : bulbs) {
                    const r = big ? 12 : 8;
                    if (isOn) {
                        const gr = big ? 34 : 24;
                        ctx.globalAlpha = 0.85 * k;
                        ctx.drawImage(this._glow(), b.x - gr, b.y - gr, gr * 2, gr * 2);
                        ctx.globalAlpha = 1;
                        if (k < 1) { ctx.fillStyle = '#444444'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = k; }
                        ctx.fillStyle = this.color;
                    } else {
                        ctx.fillStyle = '#444444';
                    }
                    ctx.beginPath(); 
                    ctx.arc(b.x, b.y, r, 0, Math.PI*2); 
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
        
                // 3. DRAW PARTICLES (skip when zoomed out — invisible at distance)
                if (isOn && _zoomLOD < 1) {
                    const time = (_frameTime + this.animOffset) / 1000;
                    ctx.fillStyle = '#ffffff'; 
                    
                    for (let b of bulbs) {
                        for(let i = 0; i < 4; i++) {
                            const speed = 0.8 + (i * 0.2);
                            const angle = time * speed + (i * 2); 
                            const dist = 12 + Math.sin(time * 2 + i) * 6; 
                            const px = b.x + Math.cos(angle) * dist;
                            const py = b.y + Math.sin(angle) * dist;
                            const alpha = 0.4 + Math.sin(time * 5 + i) * 0.4;
                            
                            if (alpha > 0) {
                                ctx.globalAlpha = alpha;
                                ctx.beginPath();
                                ctx.arc(px, py, 1.2, 0, Math.PI*2);
                                ctx.fill();
                            }
                        }
                    }
                    ctx.globalAlpha = 1.0;
                }
                
                ctx.restore();
            }
        }

