        /* =====================================================================
           PARKS — the city's gardens (CityLayout PARK zones)
           ---------------------------------------------------------------------
           One layout per park block, seeded by its name, so the same park paints
           the same way in every ground tile (world/ground-baker.js) and puts its
           trees and lanterns in the same places (engine/map-loading.js):
           a hedge border with four gateways, a lavender-gravel walk looping round
           a moon pool, paths in from the gates, beds of pink, violet and white
           flowers, benches facing the water.
           ===================================================================== */
        const HUB_PARKS = { block_6_4: 'Lotus Park', block_8_2: 'Violet Commons', block_12_0: 'Moonwell Gardens' };

        function parkLayout(b) {
            if (b._park) return b._park;
            const rnd = seededRandom([...b.name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) >>> 0);
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w * 0.34, ry = b.h * 0.32;
            const pondR = Math.min(b.w, b.h) * 0.13;
            const gates = [[cx, b.y + 14], [cx, b.y + b.h - 14], [b.x + 14, cy], [b.x + b.w - 14, cy]];
            const onLoop = (a, k = 1) => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
            const beds = [];
            for (let i = 0; i < 8; i++) {
                const a = (i + 0.5) * Math.PI / 4, k = i % 2 ? 1.28 : 0.66, [x, y] = onLoop(a, k);
                beds.push({ x, y, r: 26 + rnd() * 18, rot: rnd() * Math.PI, cols: [['#ff9fcf', '#ffd3ea', '#fff4fa'], ['#c6a8ff', '#e6d8ff', '#9d7de6'], ['#ffb3dc', '#d7a8ff', '#fff0f8']][i % 3] });
            }
            const benches = [];
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, [x, y] = onLoop(a, 0.86); benches.push({ x, y, a: a + Math.PI }); }
            const lamps = [];
            for (let i = 0; i < 6; i++) { const [x, y] = onLoop(i * Math.PI / 3 + 0.2, 1.08); lamps.push({ x, y }); }
            // Trees on the lawn, clear of the walk, the pool, the beds and the paths
            const trees = [], clear = (x, y) => {
                const e = Math.hypot((x - cx) / rx, (y - cy) / ry);
                if (Math.abs(e - 1) < 0.2 || Math.hypot(x - cx, y - cy) < pondR + 60) return false;
                if (Math.abs(x - cx) < 34 || Math.abs(y - cy) < 34) return false;                  // the cross paths
                return !beds.some(bd => Math.hypot(x - bd.x, y - bd.y) < bd.r + 26) && !trees.some(t => Math.hypot(x - t.x, y - t.y) < 70);
            };
            for (let k = 0; k < 220 && trees.length < 18; k++) {
                const x = b.x + 60 + rnd() * (b.w - 120), y = b.y + 60 + rnd() * (b.h - 120);
                if (clear(x, y)) trees.push({ x, y, type: ['glow_pink', 'glow_purple', 'tree', 'tree', 'glow_cyan'][Math.floor(rnd() * 5)], size: 1.3 + rnd() * 0.6 });
            }
            return (b._park = { cx, cy, rx, ry, pondR, gates, beds, benches, lamps, trees, name: HUB_PARKS[b.name] || '' });
        }

        /** Paint a park's ground into a tile (the ground baker clips to the tile). */
        function paintParkGround(c, b, R) {
            const P = parkLayout(b), rnd = seededRandom(b.x * 3 + b.y * 7);
            c.save();
            c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
            // Lawn with grain and soft hollows
            c.fillStyle = '#15291c'; c.fillRect(b.x, b.y, b.w, b.h);
            for (let k = 0; k < (b.w * b.h) / 140; k++) { c.fillStyle = rnd() < 0.55 ? '#1f3f29' : 'rgba(5, 16, 9, 0.7)'; c.fillRect(b.x + rnd() * b.w, b.y + rnd() * b.h, 2, 1 + rnd() * 2); }
            // The hedge border, with a gap at each gate
            c.strokeStyle = '#0f2416'; c.lineWidth = 18; c.strokeRect(b.x + 9, b.y + 9, b.w - 18, b.h - 18);
            c.strokeStyle = 'rgba(70, 120, 80, 0.35)'; c.lineWidth = 2; c.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
            // Paths: gates → walk (lavender gravel, a pale edge)
            const gravel = '#4a4054', edge = 'rgba(214, 200, 240, 0.22)';
            c.lineCap = 'round';
            for (const [gx, gy] of P.gates) {
                c.fillStyle = '#15291c'; c.fillRect(gx - 26, gy - 26, 52, 52);                     // the gap in the hedge
                c.strokeStyle = gravel; c.lineWidth = 30; c.beginPath(); c.moveTo(gx, gy); c.lineTo(P.cx + (gx - P.cx) * 0.2, P.cy + (gy - P.cy) * 0.2); c.stroke();
            }
            c.strokeStyle = gravel; c.lineWidth = 30; c.beginPath(); c.ellipse(P.cx, P.cy, P.rx, P.ry, 0, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = edge; c.lineWidth = 1.2;
            for (const k of [-15, 15]) { c.beginPath(); c.ellipse(P.cx, P.cy, P.rx + k, P.ry + k, 0, 0, Math.PI * 2); c.stroke(); }
            for (let k = 0; k < 900; k++) {                                                        // gravel grain along the walk
                const a = rnd() * Math.PI * 2, d = (rnd() - 0.5) * 28;
                c.fillStyle = rnd() < 0.5 ? 'rgba(255, 240, 255, 0.08)' : 'rgba(0, 0, 0, 0.18)';
                c.fillRect(P.cx + Math.cos(a) * (P.rx + d), P.cy + Math.sin(a) * (P.ry + d), 1.5, 1.5);
            }
            // The moon pool: stone rim, dark water holding a crescent, lily pads
            c.fillStyle = '#3a3240'; c.beginPath(); c.arc(P.cx, P.cy, P.pondR + 10, 0, Math.PI * 2); c.fill();
            const wg = c.createRadialGradient(P.cx - P.pondR * 0.3, P.cy - P.pondR * 0.3, 4, P.cx, P.cy, P.pondR);
            wg.addColorStop(0, '#2c2560'); wg.addColorStop(1, '#100c26'); c.fillStyle = wg; c.beginPath(); c.arc(P.cx, P.cy, P.pondR, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(232, 194, 122, 0.45)'; c.lineWidth = 1.5; c.beginPath(); c.arc(P.cx, P.cy, P.pondR + 5, 0, Math.PI * 2); c.stroke();
            c.save(); c.beginPath(); c.arc(P.cx + P.pondR * 0.25, P.cy - P.pondR * 0.2, P.pondR * 0.28, 0, Math.PI * 2); c.arc(P.cx + P.pondR * 0.33, P.cy - P.pondR * 0.26, P.pondR * 0.24, 0, Math.PI * 2, true);
            c.fillStyle = 'rgba(240, 232, 255, 0.55)'; c.fill('evenodd'); c.restore();
            for (let k = 0; k < 9; k++) {
                const a = rnd() * Math.PI * 2, d = P.pondR * (0.4 + rnd() * 0.45), x = P.cx + Math.cos(a) * d, y = P.cy + Math.sin(a) * d, r = 5 + rnd() * 4;
                c.fillStyle = '#2e6b5c'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a + 0.4, a + Math.PI * 2 - 0.4); c.closePath(); c.fill();
                if (k % 3 === 0) { c.fillStyle = '#ffc6e0'; c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
            }
            // Flower beds: dark soil, drifts of blooms
            for (const bd of P.beds) {
                c.fillStyle = '#1e1418'; c.beginPath(); c.ellipse(bd.x, bd.y, bd.r, bd.r * 0.62, bd.rot, 0, Math.PI * 2); c.fill();
                for (let k = 0; k < bd.r * 2.4; k++) {
                    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.9, lx = Math.cos(a) * bd.r * d, ly = Math.sin(a) * bd.r * 0.62 * d;
                    const x = bd.x + lx * Math.cos(bd.rot) - ly * Math.sin(bd.rot), y = bd.y + lx * Math.sin(bd.rot) + ly * Math.cos(bd.rot);
                    c.fillStyle = rnd() < 0.3 ? '#2a5234' : bd.cols[Math.floor(rnd() * bd.cols.length)];
                    c.beginPath(); c.arc(x, y, 1.3 + rnd() * 1.3, 0, Math.PI * 2); c.fill();
                }
            }
            // Benches facing the water
            for (const bn of P.benches) {
                c.save(); c.translate(bn.x, bn.y); c.rotate(bn.a);
                c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-15, -4, 32, 11);
                c.fillStyle = '#3a2a24'; c.fillRect(-16, -5, 32, 9);
                c.fillStyle = '#4e3a30'; for (let k = 0; k < 3; k++) c.fillRect(-15, -4 + k * 3, 30, 1.6);
                c.fillStyle = 'rgba(232, 194, 122, 0.6)'; c.fillRect(-16, -5, 2, 9); c.fillRect(14, -5, 2, 9);
                c.restore();
            }
            // The name, cut into the stone at the north gate
            if (P.name) {
                c.font = '600 12px Montserrat, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillStyle = 'rgba(232, 214, 190, 0.35)'; c.fillText(P.name.toUpperCase(), P.gates[0][0], P.gates[0][1] + 34);
            }
            c.restore();
        }
