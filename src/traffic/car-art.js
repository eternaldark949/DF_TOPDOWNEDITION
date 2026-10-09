        /* =====================================================================
           CAR ART — how every car looks (TrafficVehicle: traffic, your garage,
           Zib rides, the delivery van)
           ---------------------------------------------------------------------
           A car's body is painted once into a sprite (per brand, model, paint and
           size) and stamped each frame: a soft contact shadow, tyres and rims,
           paint shaded across its curve, a glass greenhouse (windshield, side
           glass, rear glass) under the roof, mirrors, lamp housings, and each
           brand's character:
             LADY BlackMark  deep lacquer, a gold pinstripe, gold rims; the V1's
                             pearl hearse cap with a gold crescent; the V3's
                             panoramic black-glass roof
             Zenxera         a faceted wedge: lit and shaded facets on the hood,
                             a cyan line down each flank, LED slits
             Gelfash         honest boxes: black bumpers, roof rails, a pickup bed
           Live on top (drawCarSheen): the light sliding over the paint — the sun
           by day (from its side, in its colour), street light by night sliding
           along the roof as the car moves. The lamps are live too (drawCarLamps),
           and after the lighting pass drawCarGlow lets tail lights, headlights
           and brake lights glow in the dark.
           ===================================================================== */
        const CAR_ART = {
            SCALE: 2, PAD: 10,
            // Where the glass sits, as fractions of the length from the nose:
            // windshield base, roof front, roof back, rear glass end
            CABIN: {
                sedan: [0.30, 0.43, 0.70, 0.81], suv: [0.24, 0.35, 0.86, 0.94], suv2: [0.27, 0.38, 0.82, 0.91],
                sports: [0.38, 0.52, 0.72, 0.84], truck: [0.17, 0.27, 0.41, 0.45], hearse: [0.22, 0.32, 0.93, 0.97]
            },
            GLOSS: { blackmark: 1.5, angular: 1.1, boxy: 0.8, sleek: 1 },
            GOLD: '#d9bf86',
            WHEEL_LOCK: 0.5,        // drawn front-wheel angle at full steer (rad)
            ROLL_PX: 1.8,           // body shift out of a turn at full lean
            PITCH_PX: 1.1           // body shift forward under full braking
        };
        const _carSprites = new Map();
        const _carColorCv = document.createElement('canvas').getContext('2d');

        /** Any CSS colour → [r, g, b]. */
        function _carRGB(col) {
            _carColorCv.fillStyle = '#000'; _carColorCv.fillStyle = col || '#888';
            const s = _carColorCv.fillStyle;
            if (s[0] === '#') return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
            const m = s.match(/[\d.]+/g) || [136, 136, 136];
            return [+m[0], +m[1], +m[2]];
        }
        const _carMix = (c, k, to) => `rgb(${c.map((v, i) => Math.round(v + ((to ? to[i] : k > 0 ? 255 : 0) - v) * Math.abs(k))).join(',')})`;

        /** The car's shape in its own frame (x forward, nose at +L/2, y to the right). Cached on the car. */
        function carGeo(v) {
            const key = v.visualStyle + '|' + v.model + '|' + v.length + '|' + v.width + '|' + !!v.noHearseCap;
            if (v._carGeo && v._carGeo.key === key) return v._carGeo;
            const L = v.length, W = v.width, st = v.visualStyle;
            const hearse = st === 'blackmark' && v.model === 'suv' && !v.noHearseCap;
            const cab = CAR_ART.CABIN[hearse ? 'hearse' : v.model] || CAR_ART.CABIN.sedan;
            const xf = f => L / 2 - f * L;
            const body = new Path2D();
            if (st === 'angular') {
                const pts = [[L / 2, -W * 0.26], [L / 2 - 9, -W / 2], [-L / 2 + 6, -W / 2 + 1], [-L / 2, -W / 2 + 7],
                             [-L / 2, W / 2 - 7], [-L / 2 + 6, W / 2 - 1], [L / 2 - 9, W / 2], [L / 2, W * 0.26]];
                pts.forEach((p, i) => i ? body.lineTo(p[0], p[1]) : body.moveTo(p[0], p[1])); body.closePath();
            } else if (st === 'blackmark') body.roundRect(-L / 2, -W / 2, L, W, [6, 11, 11, 6]);
            else body.roundRect(-L / 2, -W / 2, L, W, [4, 7, 7, 4]);
            const si = W * 0.13;                                            // glass sits this far in from the flanks
            return (v._carGeo = {
                key, L, W, st, hearse, body, si,
                x0: xf(cab[0]), x1: xf(cab[1]), x2: xf(cab[2]), x3: xf(cab[3]),
                axleF: L / 2 - L * 0.21, axleR: -L / 2 + L * 0.2
            });
        }

        /** The body sprite (painted once per look). */
        function carSprite(v) {
            const g = carGeo(v), key = g.key + '|' + v.color + '|' + (v.glowColor || '') + '|' + v.brand;
            let sp = _carSprites.get(key);
            if (sp) return sp;
            const { SCALE: S, PAD: P } = CAR_ART, L = g.L, W = g.W;
            const cv = document.createElement('canvas');
            cv.width = Math.ceil((L + P * 2) * S); cv.height = Math.ceil((W + P * 2) * S);
            const c = cv.getContext('2d');
            c.setTransform(S, 0, 0, S, (L / 2 + P) * S, (W / 2 + P) * S);
            _paintCar(c, v, g);
            sp = { cv, L, W };
            if (_carSprites.size > 96) _carSprites.delete(_carSprites.keys().next().value);
            _carSprites.set(key, sp);
            return sp;
        }

        const _carRim = v => v.visualStyle === 'blackmark' ? CAR_ART.GOLD : v.visualStyle === 'angular' ? (v.glowColor || '#7fe8ff') : '#b9b6c4';

        /** The front tyres, turned to where the wheels point (v.steer, lagging the driver's hands).
            Drawn under the body, so only their edges show past the flanks — more as they turn. */
        function drawCarFrontTyres(ctx, v) {
            const g = carGeo(v), W = g.W, tyreL = Math.max(10, g.L * 0.16), d = (v.steer || 0) * CAR_ART.WHEEL_LOCK;
            const rim = _carRim(v);
            for (const s of [-1, 1]) {
                ctx.save(); ctx.translate(g.axleF, s * (W / 2 - 0.4)); if (d) ctx.rotate(d);
                ctx.fillStyle = '#0b0a0e'; ctx.beginPath(); ctx.roundRect(-tyreL / 2, -2.4, tyreL, 4.8, 1.6); ctx.fill();
                ctx.fillStyle = rim; ctx.globalAlpha = 0.9; ctx.fillRect(-tyreL * 0.36, s * 1.7 - 0.6, tyreL * 0.72, 1.2); ctx.globalAlpha = 1;
                ctx.restore();
            }
        }

        function _paintCar(c, v, g) {
            const { L, W, st, si, x0, x1, x2, x3 } = g, col = _carRGB(v.color);
            const lum = (col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11) / 255;
            const lady = st === 'blackmark', zen = st === 'angular', gel = !lady && !zen;
            const truck = v.model === 'truck';
            // Contact shadow: soft, a little wider than the car
            c.save(); c.filter = 'blur(3px)'; c.fillStyle = 'rgba(8, 4, 16, 0.55)';
            c.beginPath(); c.roundRect(-L / 2 - 1, -W / 2 - 1, L + 2, W + 2, 8); c.fill(); c.restore();
            // Rear tyres peeking past the flanks, rims catching the light (the fronts steer: drawCarFrontTyres)
            const tyreL = Math.max(10, L * 0.16), rim = _carRim(v);
            for (const ax of [g.axleR]) for (const s of [-1, 1]) {
                c.fillStyle = '#0b0a0e'; c.beginPath(); c.roundRect(ax - tyreL / 2, s * W / 2 - (s > 0 ? 3.2 : -0.2) - 1.5, tyreL, 4.5, 1.5); c.fill();
                c.fillStyle = rim; c.globalAlpha = 0.85; c.fillRect(ax - tyreL * 0.28, s * (W / 2 + 0.9) - 0.5, tyreL * 0.56, 1); c.globalAlpha = 1;
            }
            // Mirrors, at the windshield base
            for (const s of [-1, 1]) {
                c.fillStyle = _carMix(col, -0.35); c.beginPath(); c.roundRect(x0 - 3, s > 0 ? W / 2 - 1 : -W / 2 - 2.6, 4.5, 3.6, 1.2); c.fill();
                c.fillStyle = 'rgba(210, 200, 240, 0.35)'; c.fillRect(x0 - 2.4, s > 0 ? W / 2 + 1.6 : -W / 2 - 2.2, 3.2, 0.7);
            }
            // Paint, shaded round the body's curve
            c.save(); c.clip(g.body);
            c.fillStyle = `rgb(${col.join(',')})`; c.fillRect(-L / 2, -W / 2, L, W);
            const dk = lum > 0.7 ? 0.24 : 0.4;
            let gr = c.createLinearGradient(0, -W / 2, 0, W / 2);
            gr.addColorStop(0, `rgba(0,0,0,${dk})`); gr.addColorStop(0.16, 'rgba(0,0,0,0.04)');
            gr.addColorStop(0.42, `rgba(255,255,255,${lady ? 0.12 : 0.09})`); gr.addColorStop(0.58, 'rgba(255,255,255,0.05)');
            gr.addColorStop(0.84, 'rgba(0,0,0,0.06)'); gr.addColorStop(1, `rgba(0,0,0,${dk + 0.06})`);
            c.fillStyle = gr; c.fillRect(-L / 2, -W / 2, L, W);
            gr = c.createLinearGradient(-L / 2, 0, L / 2, 0);
            gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(0.1, 'rgba(0,0,0,0)'); gr.addColorStop(0.9, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
            c.fillStyle = gr; c.fillRect(-L / 2, -W / 2, L, W);
            // Wheel arches: a hint of the fender swelling over each tyre
            for (const ax of [g.axleF, g.axleR]) for (const s of [-1, 1]) {
                const ag = c.createRadialGradient(ax, s * W / 2, 1, ax, s * W / 2, L * 0.11);
                ag.addColorStop(0, 'rgba(255,255,255,0.10)'); ag.addColorStop(1, 'rgba(255,255,255,0)');
                c.fillStyle = ag; c.fillRect(ax - L * 0.12, s > 0 ? W / 2 - L * 0.12 : -W / 2, L * 0.24, L * 0.12);
            }
            // Hood: creases (Gelfash, LADY) or facets (Zenxera)
            if (zen) {
                c.fillStyle = 'rgba(255,255,255,0.13)';
                c.beginPath(); c.moveTo(L / 2, -W * 0.26); c.lineTo(x0, -W / 2 + si); c.lineTo(x0, 0); c.lineTo(L / 2 - 2, 0); c.closePath(); c.fill();
                c.fillStyle = 'rgba(0,0,0,0.16)';
                c.beginPath(); c.moveTo(L / 2, W * 0.26); c.lineTo(x0, W / 2 - si); c.lineTo(x0, 0); c.lineTo(L / 2 - 2, 0); c.closePath(); c.fill();
                c.fillStyle = 'rgba(0,0,0,0.14)';                          // the tail's facets
                c.beginPath(); c.moveTo(x3, -W / 2 + si); c.lineTo(-L / 2, -W / 2 + 7); c.lineTo(-L / 2, 0); c.lineTo(x3, 0); c.closePath(); c.fill();
            } else if (!truck) {
                c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.8;
                for (const s of [-1, 1]) { c.beginPath(); c.moveTo(L / 2 - 3, s * W * 0.2); c.lineTo(x0 + 1, s * W * 0.24); c.stroke(); }
                c.strokeStyle = 'rgba(255,255,255,0.10)';
                for (const s of [-1, 1]) { c.beginPath(); c.moveTo(L / 2 - 3, s * W * 0.2 - 0.8); c.lineTo(x0 + 1, s * W * 0.24 - 0.8); c.stroke(); }
            }
            c.restore();
            // Shoulder light and a crisp edge
            c.save(); c.scale((L - 3) / L, (W - 3) / W); c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 0.9; c.stroke(g.body); c.restore();
            if (lady) { c.save(); c.scale((L - 6) / L, (W - 6) / W); c.strokeStyle = CAR_ART.GOLD; c.globalAlpha = 0.8; c.lineWidth = 0.7; c.stroke(g.body); c.restore(); }
            if (zen) {                                                         // the cyan line down each flank
                c.strokeStyle = v.glowColor || '#00f3ff'; c.globalAlpha = 0.75; c.lineWidth = 0.9;
                for (const s of [-1, 1]) { c.beginPath(); c.moveTo(L / 2 - 10, s * (W / 2 - 1.8)); c.lineTo(-L / 2 + 8, s * (W / 2 - 2.6)); c.stroke(); }
                c.globalAlpha = 1;
            }
            // Bumpers (Gelfash): black plastic, nose and tail
            if (gel) {
                c.save(); c.clip(g.body); c.fillStyle = '#16151b';
                c.fillRect(L / 2 - 2.6, -W / 2, 2.6, W); c.fillRect(-L / 2, -W / 2, 2.4, W);
                c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(L / 2 - 2.6, -W / 2, 0.6, W); c.restore();
                if (v.model === 'sports') {                                   // twin stripes
                    c.fillStyle = lum > 0.55 ? 'rgba(20,18,28,0.55)' : 'rgba(245,240,255,0.5)';
                    for (const s of [-1, 1]) c.fillRect(-L / 2 + 2, s * 3.2 - 1.2, L - 4.6, 2.4);
                }
            }
            // The greenhouse: glass under the roof
            const gw = W / 2 - si, glass = c.createLinearGradient(x0, 0, x3, 0);
            glass.addColorStop(0, '#1d1a3a'); glass.addColorStop(0.2, '#0b0916'); glass.addColorStop(1, '#100d20');
            c.fillStyle = glass;
            c.beginPath(); c.moveTo(x0, -gw); c.lineTo(x1, -gw + 1); c.lineTo(x2, -gw + 1); c.lineTo(x3, -gw + 2.5);
            c.lineTo(x3, gw - 2.5); c.lineTo(x2, gw - 1); c.lineTo(x1, gw - 1); c.lineTo(x0, gw); c.closePath(); c.fill();
            // Sky in the windshield, and a streak across it
            const ws = c.createLinearGradient(x0, 0, x1, 0);
            ws.addColorStop(0, 'rgba(170, 160, 230, 0.26)'); ws.addColorStop(1, 'rgba(170, 160, 230, 0.02)');
            c.fillStyle = ws; c.beginPath(); c.moveTo(x0, -gw); c.lineTo(x1, -gw + 1); c.lineTo(x1, gw - 1); c.lineTo(x0, gw); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(255, 250, 255, 0.22)'; c.lineWidth = 1.4;
            c.beginPath(); c.moveTo(x0 - 1, -gw * 0.35); c.lineTo(x1 + 1, -gw * 0.75); c.stroke();
            c.lineWidth = 0.6; c.beginPath(); c.moveTo(x0 - 1, -gw * 0.1); c.lineTo(x1 + 1, -gw * 0.45); c.stroke();
            // The roof
            const rw = gw - 2.6, rx0 = x2, rx1 = x1;
            if (g.hearse) {                                                   // pearl hearse cap to the tail
                const pr = c.createLinearGradient(0, -rw, 0, rw);
                pr.addColorStop(0, '#8d80a6'); pr.addColorStop(0.45, '#c8bdd6'); pr.addColorStop(1, '#7c6f98');
                c.fillStyle = pr; c.beginPath(); c.roundRect(-L / 2 + 4, -rw, x1 - (-L / 2 + 4), rw * 2, [4, 3, 3, 4]); c.fill();
                c.strokeStyle = CAR_ART.GOLD; c.lineWidth = 0.7; c.stroke();
                const mx = (-L / 2 + 4 + x1) / 2 - 6;                         // a gold crescent, the house's mark
                c.fillStyle = CAR_ART.GOLD; c.beginPath(); c.arc(mx, 0, 3.4, 0, Math.PI * 2); c.arc(mx + 1.6, -0.6, 2.9, 0, Math.PI * 2, true); c.fill('evenodd');
            } else if (lady) {                                                // panoramic black glass, gold-framed
                const pg = c.createLinearGradient(rx1, -rw, rx0, rw);
                pg.addColorStop(0, '#2a2442'); pg.addColorStop(0.5, '#0a0812'); pg.addColorStop(1, '#1a1530');
                c.fillStyle = pg; c.beginPath(); c.roundRect(rx0, -rw, rx1 - rx0, rw * 2, 3); c.fill();
                c.strokeStyle = CAR_ART.GOLD; c.lineWidth = 0.7; c.stroke();
            } else {
                const rg = c.createLinearGradient(0, -rw, 0, rw);
                rg.addColorStop(0, _carMix(col, -0.28)); rg.addColorStop(0.4, _carMix(col, 0.12)); rg.addColorStop(1, _carMix(col, -0.34));
                c.fillStyle = rg; c.beginPath(); c.roundRect(rx0, -rw, rx1 - rx0, rw * 2, zen ? 1.5 : 3); c.fill();
                c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.6; c.stroke();
                if (gel && v.model === 'suv') {                               // roof rails
                    c.strokeStyle = '#b8b4c6'; c.lineWidth = 1;
                    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(rx0 + 2, s * (rw - 1.5)); c.lineTo(rx1 - 2, s * (rw - 1.5)); c.stroke(); }
                }
            }
            // B-pillars across the side glass
            if (!truck && !g.hearse) {
                const bx = (x1 + x2) / 2; c.fillStyle = _carMix(col, -0.3);
                for (const s of [-1, 1]) c.fillRect(bx - 1, s > 0 ? rw - 0.2 : -gw + 0.8, 2, gw - rw + 0.4 - 0.8);
            }
            // A pickup's bed
            if (truck) {
                const bx0 = x3 - 4, bx1 = -L / 2 + 3, bw = W / 2 - 3.5;
                c.fillStyle = '#17141d'; c.fillRect(bx1, -bw, bx0 - bx1, bw * 2);
                c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
                for (let y = -bw + 4; y < bw - 1; y += 4.5) { c.beginPath(); c.moveTo(bx1 + 1, y); c.lineTo(bx0 - 1, y); c.stroke(); }
                c.strokeStyle = _carMix(col, -0.2); c.lineWidth = 1.6; c.strokeRect(bx1, -bw, bx0 - bx1, bw * 2);
            }
            // Lamp housings (the lamps themselves are live: drawCarLamps)
            c.fillStyle = '#17131f';
            for (const s of [-1, 1]) {
                if (zen) { c.beginPath(); c.moveTo(L / 2 - 1, s * W * 0.27); c.lineTo(L / 2 - 8.5, s * (W / 2 - 0.8)); c.lineTo(L / 2 - 10, s * (W / 2 - 3)); c.lineTo(L / 2 - 3, s * W * 0.22); c.closePath(); c.fill(); }
                else if (lady) c.fillRect(L / 2 - 2.6, s > 0 ? W / 2 - 12 : -W / 2 + 2.5, 2.2, 9.5);
                else { c.beginPath(); c.roundRect(L / 2 - 4, s > 0 ? W / 2 - 10.5 : -W / 2 + 2, 3.4, 8.5, 1.5); c.fill(); }
            }
            c.fillStyle = '#2a060e';
            if (lady) c.fillRect(-L / 2 + 0.5, -W / 2 + 4, 2.2, W - 8);            // a full-width light bar
            else for (const s of [-1, 1]) c.fillRect(-L / 2 + 0.4, s > 0 ? W / 2 - 11.5 : -W / 2 + 1.5, 3, 10);
            // The outline
            c.strokeStyle = 'rgba(6, 3, 12, 0.7)'; c.lineWidth = 0.9; c.stroke(g.body);
        }

        /** Stamp the body, then the light sliding over it. */
        function drawCarBody(ctx, v, farLOD) {
            const sp = carSprite(v), P = CAR_ART.PAD;
            drawCarFrontTyres(ctx, v);
            // The body rides on its springs: out of the turn (bodyRoll), forward under the brakes (load)
            const lx = farLOD ? 0 : Math.max(-1, Math.min(1, v.load || 0)) * CAR_ART.PITCH_PX;
            const ly = farLOD ? 0 : -(v.bodyRoll || 0) * CAR_ART.ROLL_PX;
            const lean = Math.abs(lx) > 0.05 || Math.abs(ly) > 0.05;
            if (lean) ctx.translate(lx, ly);
            ctx.drawImage(sp.cv, -sp.L / 2 - P, -sp.W / 2 - P, sp.L + P * 2, sp.W + P * 2);
            if (!farLOD) drawCarSheen(ctx, v);
            if (lean) ctx.translate(-lx, -ly);
        }

        /** The light on the paint: the sun from its side by day; street light sliding along the roof by night. */
        function drawCarSheen(ctx, v) {
            const g = carGeo(v), Lt = sunNow(), gloss = CAR_ART.GLOSS[g.st] || 1, L = g.L, W = g.W;
            ctx.save(); ctx.clip(g.body); ctx.globalCompositeOperation = 'screen';
            if (Lt.day > 0.03) {
                const ca = Math.cos(v.angle), sa = Math.sin(v.angle);
                const lx = ca * Lt.dx + sa * Lt.dy, ly = -sa * Lt.dx + ca * Lt.dy;       // the sun, in the car's frame
                const R = Math.max(L, W) * 0.55, cx = lx * W * 0.22, cy = ly * W * 0.22;
                const gr = ctx.createLinearGradient(cx - lx * R, cy - ly * R, cx + lx * R, cy + ly * R);
                const a = Math.min(0.42, 0.24 * Lt.day * gloss);
                gr.addColorStop(0, `rgba(${Lt.rgb}, 0)`); gr.addColorStop(0.42, `rgba(${Lt.rgb}, ${a * 0.35})`);
                gr.addColorStop(0.52, `rgba(${Lt.rgb}, ${a})`); gr.addColorStop(0.6, `rgba(${Lt.rgb}, 0)`); gr.addColorStop(1, `rgba(${Lt.rgb}, 0)`);
                ctx.fillStyle = gr; ctx.fillRect(-L / 2, -W / 2, L, W);
            }
            if (Lt.night > 0.05) {
                const ph = (((v.x * 0.71 + v.y * 0.71) / 110) % 1 + 1) % 1, cx = (0.5 - ph) * L * 1.6;
                const gr = ctx.createLinearGradient(cx - 14, 0, cx + 14, 0), a = 0.2 * Lt.night * gloss;
                gr.addColorStop(0, 'rgba(220, 196, 255, 0)'); gr.addColorStop(0.5, `rgba(220, 196, 255, ${a})`); gr.addColorStop(1, 'rgba(220, 196, 255, 0)');
                ctx.fillStyle = gr; ctx.fillRect(-L / 2, -W / 2, L, W);
            }
            ctx.restore();
        }

        /** Whether the car's lamps are burning: someone at the wheel, or left on when she got out (lampsOn,
         *  engine/cars.js); her own car's always are. */
        const carLampsOn = v => v.hasDriver || v.lampsOn || v.isOwnedCar || v.controlMode === 'PLAYER' || (typeof game !== 'undefined' && game.car === v && game.isDriving);

        // Rear-lamp motion streaks: short world-space histories, recorded only by simulation.
        const CAR_TAIL_TRAIL = {
            MAX_POINTS: 20, SAMPLE_TICKS: 2, MAX_LENGTH: 180, VIEW_PAD: 240,
            COLORS: ['#ff2848', '#ff2244', '#fff4f8'],
            CORES: ['#ff7288', '#ff788b', '#ffffff']
        };

        function updateCarTailTrail(v, map, view, tick) {
            if (!v || v._reflectionProxy || !v.visible || v.dead || v.markedForDestroy ||
                (view && (v.x < view.left || v.x > view.right || v.y < view.top || v.y > view.bottom))) {
                if (v && !v._reflectionProxy) v._tailTrail = null;
                return;
            }
            let h = v._tailTrail;
            const jump = Math.max(64, (v.maxSpeed || 12) * 3);
            if (!h || h.map !== map || tick < h.tick || Math.hypot(v.x - h.x, v.y - h.y) > jump) {
                v._tailTrail = { map, points: [], x: v.x, y: v.y, tick, sampleTick: tick, moving: false };
                return;
            }
            if (tick === h.tick) return;
            // Displacement after collision resolution, rather than engine speed while pinned against a wall.
            const speed = Math.hypot(v.x - h.x, v.y - h.y) / Math.max(1, tick - h.tick);
            h.x = v.x; h.y = v.y; h.tick = tick;
            h.moving = carLampsOn(v) && speed > 0.6;
            const pts = h.points;
            while (pts.length && tick - pts[0].tick >= pts[0].life) pts.shift();
            if (!h.moving || tick - h.sampleTick < CAR_TAIL_TRAIL.SAMPLE_TICKS) return;
            h.sampleTick = tick;
            const strength = Math.max(0, Math.min(1, (speed - 0.6) / Math.max(1, (v.maxSpeed || 12) * 0.65 - 0.6)));
            const life = Math.min(8 + strength * 16, CAR_TAIL_TRAIL.MAX_LENGTH / speed);
            const ca = Math.cos(v.angle), sa = Math.sin(v.angle), rx = -v.length / 2 + 1;
            const ry = Math.max(1, v.width / 2 - 6), rev = v.state === 'REVERSING';
            pts.push({
                x1: v.x + rx * ca + ry * sa, y1: v.y + rx * sa - ry * ca,
                x2: v.x + rx * ca - ry * sa, y2: v.y + rx * sa + ry * ca,
                tick, life, strength, color: rev ? 2 : v.speed < 0.5 ? 1 : 0
            });
            if (pts.length > CAR_TAIL_TRAIL.MAX_POINTS) pts.shift();
        }

        /** Emissive twin trails, binned into four fade bands to keep draw calls bounded. */
        function drawCarTailTrail(ctx, v, dark, view, map) {
            const h = v._tailTrail;
            if (!h || h.map !== map || !h.points.length || v._reflectionProxy || !v.visible || v.dead) return;
            if (Math.hypot(v.x - h.x, v.y - h.y) > Math.max(64, (v.maxSpeed || 12) * 3)) return;
            const interpolated = RenderInterp._drawActive && RenderInterp.stepAdvanced;
            const now = _simTick - (interpolated ? 1 - RenderInterp.alpha : 0);
            const pts = h.points;
            let count = pts.length;
            while (count && pts[count - 1].tick > now) count--;
            if (!count) return;
            const ca = Math.cos(v.angle), sa = Math.sin(v.angle), rx = -v.length / 2 + 1;
            const ry = Math.max(1, v.width / 2 - 6), last = pts[count - 1];
            // Attach to the interpolated lamp position without writing a point during drawing.
            const head = h.moving ? {
                x1: v.x + rx * ca + ry * sa, y1: v.y + rx * sa - ry * ca,
                x2: v.x + rx * ca - ry * sa, y2: v.y + rx * sa + ry * ca,
                tick: now, life: last.life, strength: last.strength, color: last.color
            } : null;
            const alpha = ctx.globalAlpha, dayScale = 0.42 + Math.max(0, Math.min(1, dark * 1.6)) * 0.58;
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            // Usually just one lamp colour; brake/reverse transitions retain their sampled colours.
            for (let band = 0; band < 4; band++) for (let color = 0; color < 3; color++) {
                let drawn = false;
                for (let i = 1; i < count + (head ? 1 : 0); i++) {
                    const a = pts[i - 1], b = i < count ? pts[i] : head;
                    if (b.color !== color) continue;
                    const remaining = Math.max(0, 1 - (now - (a.tick + b.tick) / 2) / Math.min(a.life, b.life));
                    const weight = remaining * remaining * (a.strength + b.strength) / 2;
                    if (weight < 0.015 || Math.min(3, Math.floor(weight * 4)) !== band) continue;
                    if (Math.hypot(b.x1 - a.x1, b.y1 - a.y1) > 48 || Math.hypot(b.x2 - a.x2, b.y2 - a.y2) > 48) continue;
                    if (view && (Math.max(a.x1, b.x1, a.x2, b.x2) < view.left - 8 || Math.min(a.x1, b.x1, a.x2, b.x2) > view.right + 8 ||
                        Math.max(a.y1, b.y1, a.y2, b.y2) < view.top - 8 || Math.min(a.y1, b.y1, a.y2, b.y2) > view.bottom + 8)) continue;
                    if (!drawn) { ctx.beginPath(); drawn = true; }
                    ctx.moveTo(a.x1, a.y1); ctx.lineTo(b.x1, b.y1);
                    ctx.moveTo(a.x2, a.y2); ctx.lineTo(b.x2, b.y2);
                }
                if (!drawn) continue;
                const fade = (band + 0.5) / 4;
                ctx.strokeStyle = CAR_TAIL_TRAIL.COLORS[color]; ctx.lineWidth = 6;
                ctx.globalAlpha = alpha * dayScale * fade * 0.17; ctx.stroke();
                ctx.strokeStyle = CAR_TAIL_TRAIL.CORES[color]; ctx.lineWidth = 1.6;
                ctx.globalAlpha = alpha * dayScale * fade * 0.7; ctx.stroke();
            }
            ctx.restore();
        }

        /** Lamps: turn signals, tail and brake lights, headlights (in the car's frame). */
        function drawCarLamps(ctx, v, farLOD) {
            const g = carGeo(v), L = g.L, W = g.W, on = carLampsOn(v);
            if (v.turnSignal && v.turnSignalTimer > 0 && Math.floor(v.turnSignalTimer / 10) % 2 === 0) {
                const s = v.turnSignal === 'left' ? -1 : 1;
                ctx.fillStyle = '#ffb030';
                ctx.fillRect(L / 2 - 5, s > 0 ? W / 2 - 3.5 : 0.5 - W / 2, 3.5, 3); ctx.fillRect(-L / 2 + 0.5, s > 0 ? W / 2 - 3.5 : 0.5 - W / 2, 3, 3);
                if (!farLOD) { ctx.globalAlpha = 0.7; drawGlow(ctx, L / 2 - 3, s * (W / 2 - 2), 9, '#ffaa00'); drawGlow(ctx, -L / 2 + 2, s * (W / 2 - 2), 9, '#ffaa00'); ctx.globalAlpha = 1; }
            }
            const rev = v.state === 'REVERSING', brake = on && (v.speed < 0.5 || rev);
            ctx.fillStyle = rev ? '#f4f0ff' : brake ? '#ff2244' : on ? '#9a1028' : '#4a0a16';
            if (g.st === 'blackmark') ctx.fillRect(-L / 2 + 0.6, -W / 2 + 4.5, 1.8, W - 9);
            else for (const s of [-1, 1]) ctx.fillRect(-L / 2 + 0.6, s > 0 ? W / 2 - 11 : -W / 2 + 2, 2.4, 9);
            if (brake && !farLOD) { ctx.globalAlpha = 0.35; for (const s of [-1, 1]) drawGlow(ctx, -L / 2, s * (W / 2 - 6), 8, rev ? '#ffffff' : '#ff2244'); ctx.globalAlpha = 1; }
            const hl = v.headlightColor || '#ffffaa';
            ctx.fillStyle = on ? hl : _carMix(_carRGB(hl), -0.55);
            for (const s of [-1, 1]) {
                if (g.st === 'angular') { ctx.save(); ctx.translate(L / 2 - 5, s * (W / 2 - 4.5)); ctx.rotate(s * -0.75); ctx.fillRect(-3.5, -0.8, 7, 1.6); ctx.restore(); }
                else if (g.st === 'blackmark') ctx.fillRect(L / 2 - 2, s > 0 ? W / 2 - 11 : -W / 2 + 3, 1.6, 8);
                else { ctx.beginPath(); ctx.roundRect(L / 2 - 3.4, s > 0 ? W / 2 - 9.5 : -W / 2 + 3, 2.4, 6.5, 1); ctx.fill(); }
            }
        }

        /** After the lighting pass: lamps that glow in the dark. */
        function drawCarGlow(ctx, v, dark) {
            if (!carLampsOn(v)) return;
            const g = carGeo(v), L = g.L, W = g.W, a = Math.min(1, dark * 1.6);
            if (a < 0.04) return;
            const rev = v.state === 'REVERSING', brake = v.speed < 0.5 || rev;
            ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle); ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = a * (brake ? 0.8 : 0.38);
            for (const s of [-1, 1]) drawGlow(ctx, -L / 2 + 1, s * (W / 2 - 6), brake ? 15 : 10, rev ? '#fff4f8' : '#ff2848');
            if (v._lod === 1) { ctx.restore(); return; }                   // far away: just the tail lights
            ctx.globalAlpha = a * 0.5;
            for (const s of [-1, 1]) drawGlow(ctx, L / 2 - 1, s * (W / 2 - 6), 10, v.headlightColor || '#ffffaa');
            if (v.turnSignal && v.turnSignalTimer > 0 && Math.floor(v.turnSignalTimer / 10) % 2 === 0) {
                const s = v.turnSignal === 'left' ? -1 : 1; ctx.globalAlpha = a * 0.8;
                drawGlow(ctx, L / 2 - 3, s * (W / 2 - 2), 10, '#ffaa00'); drawGlow(ctx, -L / 2 + 2, s * (W / 2 - 2), 10, '#ffaa00');
            }
            ctx.restore();
        }

        /** Underglow: a soft pool of the brand's (or your) colour under the car. */
        function drawCarUnderglow(ctx, v) {
            if (!v.glowColor) return;
            const pulse = (Math.sin(_frameTime / 800) + 1) / 2, L = v.length, W = v.width;
            ctx.globalAlpha = 0.4 + pulse * 0.25;
            ctx.drawImage(glowSprite(v.glowColor, 0.5), -L / 2 - 12, -W / 2 - 12, L + 24, W + 24);
            ctx.globalAlpha = 1;
        }
