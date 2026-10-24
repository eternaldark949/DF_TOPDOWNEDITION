        /* =====================================================================
           LOT GROUNDS — the open ground round the city's buildings
           ---------------------------------------------------------------------
           Each city block (CityLayout BLOCK) gets grounds in the Blood Garden's
           manner instead of bare lot: moss and grass, clusters of low blooms,
           paved courts and a stone apron round every building, wet slabs with
           rain pools, a clipped hedge along the kerb and drifting petals.

           Everything is decided per block (seeded by its name) or per point in
           world space, so a tile paints the same ground as its neighbours
           (world/ground-baker.js calls paintLotGround for each block in a tile).
           A smooth noise field splits the open ground into courts, lawn and
           flower meadow; nearness to a building turns it into apron paving.
           ===================================================================== */
        const LOT_STONES = {
            ivory: { a: '#5a4d53', b: '#665860', c: '#4a3f45', seam: 'rgba(18, 10, 16, 0.6)', sheen: 'rgba(255, 228, 206, 0.07)' },
            slate: { a: '#3c3647', b: '#463f53', c: '#332e3d', seam: 'rgba(8, 6, 12, 0.6)', sheen: 'rgba(214, 200, 255, 0.06)' },
            rose: { a: '#5a3442', b: '#673c4c', c: '#4a2b37', seam: 'rgba(18, 6, 10, 0.6)', sheen: 'rgba(255, 190, 200, 0.07)' },
            terracotta: { a: '#5c3a33', b: '#69433b', c: '#4d302a', seam: 'rgba(16, 8, 6, 0.6)', sheen: 'rgba(255, 210, 170, 0.07)' }
        };
        const LOT_BLOOMS = [
            ['#d6163a', '#ff3a5e', '#ffb43a'],          // the Blood Garden's reds and gold
            ['#ff6fb5', '#ffb3dc', '#fff4fa'],          // pinks
            ['#b58cff', '#e6d8ff', '#7d5ce0'],          // violets
            ['#ffcf6a', '#fff1c4', '#ff9a3c'],          // golds
            ['#3fe3ff', '#bff6ff', '#b58cff']           // moon flowers
        ];
        const LOT_APRON = 26;                           // paving this far round a building

        function lotLayout(block, buildings) {
            if (block._lot) return block._lot;
            const h = [...block.name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 11);
            const rnd = seededRandom(h);
            const stones = Object.keys(LOT_STONES);
            const rects = [];
            for (const b of buildings) {
                const w = b.w || 0, hh = b.h || 0;
                if (!w || !hh || b.x >= block.x + block.w || b.x + w <= block.x || b.y >= block.y + block.h || b.y + hh <= block.y) continue;
                if (b.sections && b.sections.length) for (const s of b.sections) rects.push({ x: b.x + s.x, y: b.y + s.y, w: s.w, h: s.h });
                else rects.push({ x: b.x, y: b.y, w, h: hh });
            }
            return (block._lot = {
                seed: h % 9973, rects,
                stone: LOT_STONES[stones[Math.floor(rnd() * stones.length)]],
                blooms: LOT_BLOOMS[Math.floor(rnd() * LOT_BLOOMS.length)],
                court: 0.18 + rnd() * 0.24,              // below this the noise is paved court
                meadow: 0.62 + rnd() * 0.12,             // above it, flowers
                hedge: rnd() < 0.6
            });
        }

        /** Smooth value noise in [0, 1], seeded, about `scale` px across a feature */
        function lotNoise(x, y, seed, scale = 170) {
            const hash = (i, j) => { let t = Math.imul(i * 374761393 + j * 668265263 + seed * 2246822519, 1274126177); t ^= t >>> 13; t = Math.imul(t, 1103515245); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
            const sm = v => v * v * (3 - 2 * v);
            const octave = (s) => {
                const fx = x / s, fy = y / s, i = Math.floor(fx), j = Math.floor(fy), u = sm(fx - i), v = sm(fy - j);
                const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
                return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
            };
            return octave(scale) * 0.7 + octave(scale * 0.37) * 0.3;
        }

        function paintLotGround(c, block, buildings, R, lod = 0) {
            // Biggs Park and the Scrapyard keep their own forecourt and dirt
            if (typeof HUB_BLOCKS !== 'undefined' && (block.name === HUB_BLOCKS.biggs || block.name === HUB_BLOCKS.scrapyard)) return;
            const L = lotLayout(block, buildings), S = L.stone;
            const x0 = Math.max(block.x, R.left), y0 = Math.max(block.y, R.top), x1 = Math.min(block.x + block.w, R.right), y1 = Math.min(block.y + block.h, R.bottom);
            if (x1 <= x0 || y1 <= y0) return;
            const near = (x, y) => {                     // distance to the nearest building (0 inside one)
                let d = 1e9;
                for (const r of L.rects) d = Math.min(d, Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h)));
                return d;
            };
            // The building distance and the noise, sampled once on a 6 px grid (with a slab's margin) and looked up after
            const G = lod ? 12 : 6, M = 30, fx0 = Math.floor((x0 - M) / G) * G, fy0 = Math.floor((y0 - M) / G) * G;
            const fw = Math.ceil((x1 + M - fx0) / G) + 1, fh = Math.ceil((y1 + M - fy0) / G) + 1;
            const FD = new Float32Array(fw * fh), FN = new Float32Array(fw * fh);
            for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
                const x = fx0 + i * G + G / 2, y = fy0 + j * G + G / 2;
                FD[j * fw + i] = near(x, y); FN[j * fw + i] = lotNoise(x, y, L.seed);
            }
            const at = (x, y) => Math.min(fh - 1, Math.max(0, Math.floor((y - fy0) / G))) * fw + Math.min(fw - 1, Math.max(0, Math.floor((x - fx0) / G)));
            const paved = (x, y) => { const q = at(x, y); return FD[q] < LOT_APRON || FN[q] < L.court; };
            const cell = (x, y, k) => _bldHash(x * 0.137 + y * 0.611 + L.seed, k);
            const rnd = seededRandom(`${block.name}:${R.left}:${R.top}`);
            const thin = lod ? 4 : 1;                      // a half-size tile can't show the fine grain
            c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
            // 1. Rain-dark loam
            c.fillStyle = '#211822'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
            // 2. Lawn: a moss-green field over the loam, thinning to bare earth at the courts' edges.
            //    One pixel per field cell, scaled up smoothed, so its edges come out soft.
            const lawn = document.createElement('canvas'); lawn.width = fw; lawn.height = fh;
            const lc = lawn.getContext('2d'), img = lc.createImageData(fw, fh), px = img.data;
            for (let q = 0; q < fw * fh; q++) {
                const n = FN[q], e = FD[q] < LOT_APRON ? 0 : Math.min(1, (n - L.court) / 0.08);
                if (e <= 0) continue;
                const lush = Math.min(1, (n - L.court) / 0.35), v = _bldHash(q * 0.731 + L.seed, 8), o = q * 4;
                px[o] = 28 + lush * 10 + v * 8; px[o + 1] = 54 + lush * 26 + v * 12; px[o + 2] = 34 + lush * 8; px[o + 3] = 255 * (0.45 + 0.45 * e) * (0.85 + 0.15 * v);
            }
            lc.putImageData(img, 0, 0);
            c.imageSmoothingEnabled = true; c.drawImage(lawn, fx0, fy0, fw * G, fh * G);
            // Moss, grass and blades where it isn't paved
            const area = (x1 - x0) * (y1 - y0), MOSS = ['rgba(70, 130, 74, 0.45)', 'rgba(18, 44, 26, 0.55)', 'rgba(110, 170, 100, 0.35)', 'rgba(8, 22, 12, 0.6)'];
            for (let k = 0; k < area / (40 * thin); k++) {
                const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), t = rnd(), sw = rnd(), sh = rnd();
                if (paved(x, y)) continue;
                c.fillStyle = MOSS[t < 0.45 ? 0 : t < 0.75 ? 1 : t < 0.9 ? 2 : 3];
                if (t < 0.9) c.fillRect(x, y, 1 + sw * 3, 1 + sh * 3);
                else c.fillRect(x, y - 4 - sh * 2, 1, 4 + sh * 2);                              // a blade
            }
            // 3. Paving: slabs in running bond where it's paved, a darker kerb stone at the edge
            const T = 24, gy0 = Math.floor(y0 / T) * T;
            c.strokeStyle = S.seam; c.lineWidth = 1;
            for (let gy = gy0; gy < y1; gy += T) {
                const off = (Math.floor(gy / T) % 2) * (T / 2), gx0 = Math.floor((x0 - off) / T) * T + off;
                for (let gx = gx0; gx < x1; gx += T) {
                    const cx = gx + T / 2, cy = gy + T / 2, q = at(cx, cy);
                    if (FD[q] === 0 || !paved(cx, cy)) continue;
                    const v = cell(gx, gy, 1), edge = !paved(cx + T, cy) || !paved(cx - T, cy) || !paved(cx, cy + T) || !paved(cx, cy - T);
                    c.fillStyle = edge ? S.c : v < 0.45 ? S.a : v < 0.85 ? S.b : S.c;
                    c.fillRect(gx, gy, T, T);
                    if (v > 0.9) { c.fillStyle = S.sheen; c.fillRect(gx + 2, gy + 2, T - 4, T - 4); }
                    c.strokeRect(gx + 0.5, gy + 0.5, T - 1, T - 1);
                    if (cell(gx, gy, 2) > 0.965) {                                     // a rain pool catching the light
                        const rx = 10 + cell(gx, gy, 3) * 12, ry = rx * 0.4;
                        c.fillStyle = 'rgba(20, 6, 14, 0.7)'; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
                        c.strokeStyle = 'rgba(255, 170, 150, 0.32)'; c.beginPath(); c.ellipse(cx, cy, rx - 2, ry - 1.5, 0, 3.5, 5.6); c.stroke();
                        c.strokeStyle = 'rgba(255, 210, 170, 0.16)'; c.beginPath(); c.ellipse(cx + 2, cy, rx * 0.5, ry * 0.45, 0, 0, Math.PI * 2); c.stroke();
                        c.strokeStyle = S.seam;
                    }
                }
            }
            // 4. Flower clusters: leaves underneath, then five-petal blooms, in the meadow and a few in the lawn
            const F = 34, pad = 20;
            for (let gy = Math.floor((y0 - pad) / F) * F; gy < y1 + pad; gy += F) for (let gx = Math.floor((x0 - pad) / F) * F; gx < x1 + pad; gx += F) {
                const cx = gx + cell(gx, gy, 4) * F, cy = gy + cell(gx, gy, 5) * F, n = lotNoise(cx, cy, L.seed);
                if (n < L.meadow && cell(gx, gy, 6) > 0.06) continue;
                if (cx < block.x + 8 || cx > block.x + block.w - 8 || cy < block.y + 8 || cy > block.y + block.h - 8) continue;
                if (near(cx, cy) < LOT_APRON + 4 || paved(cx, cy)) continue;
                const cr = seededRandom(`${L.seed}:${gx}:${gy}`), col = L.blooms[Math.floor(cr() * L.blooms.length)], n2 = 5 + Math.floor(cr() * 9);
                c.fillStyle = 'rgba(16, 44, 24, 0.75)';
                for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(cx + (cr() - 0.5) * 18, cy + (cr() - 0.5) * 14, 3 + cr() * 3, 1.6 + cr() * 1.5, cr() * 3, 0, Math.PI * 2); c.fill(); }
                for (let k = 0; k < n2; k++) {
                    const bx = cx + (cr() - 0.5) * 20, by = cy + (cr() - 0.5) * 16, r = 1.3 + cr() * 1.5, rot = cr() * 6;
                    c.fillStyle = cr() < 0.75 ? col : L.blooms[(L.blooms.indexOf(col) + 1) % L.blooms.length];
                    for (let p = 0; p < 5; p++) { const a = rot + p * 1.2566; c.beginPath(); c.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); c.fill(); }
                    c.fillStyle = 'rgba(255, 236, 190, 0.9)'; c.beginPath(); c.arc(bx, by, r * 0.45, 0, Math.PI * 2); c.fill();
                }
            }
            // 5. A clipped hedge along the kerb where the ground is green
            if (L.hedge) {
                c.lineWidth = 1;
                const side = (ax, ay, bx, by, nx, ny) => {
                    const len = Math.hypot(bx - ax, by - ay);
                    for (let s = 6; s < len - 6; s += 8) {
                        const x = ax + (bx - ax) * s / len + nx * 9, y = ay + (by - ay) * s / len + ny * 9;
                        if (x < x0 - 12 || x > x1 + 12 || y < y0 - 12 || y > y1 + 12) continue;
                        if (near(x, y) < LOT_APRON + 6 || paved(x, y)) continue;
                        const r = 6 + _bldHash(x + y * 3.1, 7) * 2.5;
                        c.fillStyle = '#163020'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
                        c.fillStyle = 'rgba(60, 120, 70, 0.55)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2); c.fill();
                    }
                };
                const { x, y, w, h } = block;
                side(x, y, x + w, y, 0, 1); side(x, y + h, x + w, y + h, 0, -1); side(x, y, x, y + h, 1, 0); side(x + w, y, x + w, y + h, -1, 0);
            }
            // 6. Petals carried across everything
            for (let k = 0; k < area / 2600; k++) {
                const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
                if (FD[at(x, y)] === 0) continue;
                c.fillStyle = L.blooms[k % L.blooms.length]; c.globalAlpha = 0.7;
                c.beginPath(); c.ellipse(x, y, 1.2 + rnd() * 1.4, 0.7 + rnd() * 0.6, rnd() * 3, 0, Math.PI * 2); c.fill();
            }
            c.globalAlpha = 1;
            c.restore();
        }
